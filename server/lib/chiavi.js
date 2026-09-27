'use strict';

const fs = require('node:fs');

const { P } = require('./percorsi');

function testo(valore) {
  return typeof valore === 'string' ? valore.trim() : '';
}

function leggi() {
  const vuote = { twitch: { clientId: '', clientSecret: '' }, youtube: { chiaveApi: '' } };

  if (!fs.existsSync(P.chiavi)) { return vuote; }

  let modulo;
  try {
    delete require.cache[require.resolve(P.chiavi)];
    modulo = require(P.chiavi);
  } catch (errore) {
    throw new Error('server/dati/chiavi.js non si legge: ' + errore.message +
      '\n  Confrontalo con server/modelli/chiavi.esempio.js: dev essere un file JavaScript' +
      '\n  che fa module.exports = { twitch: { clientId: "...", clientSecret: "..." } }.');
  }

  if (!modulo || typeof modulo !== 'object' || Array.isArray(modulo)) {
    throw new Error('server/dati/chiavi.js non esporta un oggetto: controlla che finisca con module.exports = { ... }.');
  }

  const twitch = (modulo.twitch && typeof modulo.twitch === 'object') ? modulo.twitch : {};
  const youtube = (modulo.youtube && typeof modulo.youtube === 'object') ? modulo.youtube : {};
  return {
    twitch: { clientId: testo(twitch.clientId), clientSecret: testo(twitch.clientSecret) },
    youtube: { chiaveApi: testo(youtube.chiaveApi) }
  };
}

function clientId() {
  try { return leggi().twitch.clientId; } catch (e) { return ''; }
}

function twitchComplete() {
  const chiavi = leggi();
  if (!chiavi.twitch.clientId || !chiavi.twitch.clientSecret) { return null; }
  return { clientId: chiavi.twitch.clientId, clientSecret: chiavi.twitch.clientSecret };
}

function youtubeChiave() {
  const daAmbiente = testo(process.env.SB_YOUTUBE_CHIAVE);
  if (daAmbiente) { return daAmbiente; }
  try { return leggi().youtube.chiaveApi; } catch (e) { return ''; }
}

function configurato() {
  try { return clientId() !== ''; } catch (e) { return false; }
}

function componi(valori) {
  const dati = valori || {};
  const twitch = (dati.twitch && typeof dati.twitch === 'object') ? dati.twitch : {};
  const youtube = (dati.youtube && typeof dati.youtube === 'object') ? dati.youtube : {};
  const cita = (v) => JSON.stringify(testo(v));

  return [
    "'use strict';",
    'module.exports = {',
    '  twitch: {',
    '    clientId: ' + cita(twitch.clientId) + ',',
    '',
    '    clientSecret: ' + cita(twitch.clientSecret),
    '  },',
    '',
    '  youtube: {',
    '    chiaveApi: ' + cita(youtube.chiaveApi),
    '  }',
    '};',
    ''
  ].join('\n');
}

function sincronizzaClientId() {
  let daFile;
  try {
    daFile = leggi().twitch.clientId;
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!daFile) { return { stato: 'spento' }; }

  const archivio = require('./archivio');
  let documento;
  try {
    documento = archivio.leggi();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const account = (documento.config && documento.config.account) || {};
  const precedente = testo(account.clientId);
  if (precedente === daFile) { return { stato: 'invariato', clientId: daFile }; }

  try {
    if (!documento.config.account || typeof documento.config.account !== 'object') { documento.config.account = {}; }
    documento.config.account.clientId = daFile;
    archivio.salva(documento);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'copiato', clientId: daFile, precedente: precedente };
}

function racconta(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return '';
    case 'invariato':
      return '';
    case 'copiato':
      return 'Client ID: copiato da server/dati/chiavi.js nel campo del pannello.';
    case 'fallito':
      return 'Chiavi: non sono riuscito a leggerle (' + esito.motivo + '). Tengo quello che c era.';
    default:
      return '';
  }
}

module.exports = { leggi, clientId, twitchComplete, youtubeChiave, configurato, componi, sincronizzaClientId, racconta };
