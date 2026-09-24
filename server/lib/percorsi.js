'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RADICE_PREDEFINITA = path.resolve(__dirname, '..', '..');

function calcola(radice) {
  return {
    radice: radice,

    indexHtml: path.join(radice, 'index.html'),

    clipHtml: path.join(radice, 'clip.html'),

    sponsorHtml: path.join(radice, 'sponsor.html'),
    cartellaJs: path.join(radice, 'js'),
    datiJs: path.join(radice, 'js', 'dati.js'),
    temaCss: path.join(radice, 'css', 'tema.css'),
    statoSito: path.join(radice, 'stato-sito.json'),

    cartellaContenuti: path.join(radice, 'contenuti'),
    contenutiJson: path.join(radice, 'contenuti', 'contenuti.json'),
    schemaJs: path.join(radice, 'contenuti', 'schema.js'),
    media: path.join(radice, 'contenuti', 'media'),

    font: path.join(radice, 'contenuti', 'font'),
    elencoFont: path.join(radice, 'contenuti', 'font', 'elenco.json'),

    modelli: path.join(radice, 'modelli'),
    modelloIndex: path.join(radice, 'modelli', 'index.html'),
    modelloClip: path.join(radice, 'modelli', 'clip.html'),
    modelloSponsor: path.join(radice, 'modelli', 'sponsor.html'),
    modelloManutenzione: path.join(radice, 'modelli', 'manutenzione.html'),
    scriptManutenzione: path.join(radice, 'modelli', 'manutenzione-conto.js'),
    parziali: path.join(radice, 'modelli', 'parziali'),
    icone: path.join(radice, 'modelli', 'icone'),

    immagini: path.join(radice, 'img'),
    pannello: path.join(radice, 'pannello'),
    css: path.join(radice, 'css'),

    server: path.join(radice, 'server'),
    dati: path.join(radice, 'server', 'dati'),
    auth: path.join(radice, 'server', 'dati', 'auth.json'),

    chiavi: path.join(radice, 'server', 'dati', 'chiavi.js'),
    modelloChiavi: path.join(radice, 'server', 'modelli', 'chiavi.esempio.js'),

    accessoTwitch: path.join(radice, 'server', 'dati', 'twitch-accesso.json'),

    direttaTwitch: path.join(radice, 'server', 'dati', 'twitch-diretta.json'),

    emoteTwitch: path.join(radice, 'server', 'dati', 'twitch-emote.json'),
    sondaggi: path.join(radice, 'server', 'dati', 'sondaggi.json'),
    backup: path.join(radice, 'server', 'backup'),
    modelloDati: path.join(radice, 'server', 'modelli', 'dati.js.tpl')
  };
}

function cartellaDaAmbiente(nome) {
  const grezzo = process.env[nome];
  if (grezzo === undefined || String(grezzo).trim() === '') { return null; }
  return path.resolve(String(grezzo).trim());
}

function assicuraCartellaEsterna(cartella, nome) {
  try {
    fs.mkdirSync(cartella, { recursive: true });
  } catch (e) {
    const err = new Error(
      nome + ' indica "' + cartella + '", ma quella cartella non esiste e non si puo creare (' +
      (e && e.message ? e.message : e) + ').\n' +
      '  Crea la cartella e dalle i permessi di scrittura, oppure togli ' + nome + ' dall ambiente.');
    err.codice = 'SB_CARTELLA';
    throw err;
  }
  return cartella;
}

function applicaAmbiente(percorsi) {
  const dati = cartellaDaAmbiente('SB_DATI');
  if (dati) {
    assicuraCartellaEsterna(dati, 'SB_DATI');
    percorsi.dati = dati;
    percorsi.auth = path.join(dati, 'auth.json');
    percorsi.chiavi = path.join(dati, 'chiavi.js');
    percorsi.accessoTwitch = path.join(dati, 'twitch-accesso.json');
    percorsi.direttaTwitch = path.join(dati, 'twitch-diretta.json');
    percorsi.emoteTwitch = path.join(dati, 'twitch-emote.json');
    percorsi.sondaggi = path.join(dati, 'sondaggi.json');
  }

  const backup = cartellaDaAmbiente('SB_BACKUP');
  if (backup) {
    assicuraCartellaEsterna(backup, 'SB_BACKUP');
    percorsi.backup = backup;
  }

  return percorsi;
}

const P = applicaAmbiente(calcola(process.env.SB_RADICE ? path.resolve(process.env.SB_RADICE) : RADICE_PREDEFINITA));

function imposta(radice) {
  const nuovi = calcola(path.resolve(radice));
  for (const chiave of Object.keys(P)) { delete P[chiave]; }
  Object.assign(P, nuovi);
  return P;
}

function risolviDentro(base, relativo) {
  const grezzo = String(relativo == null ? '' : relativo);

  if (grezzo.indexOf('\0') !== -1) { return null; }

  const normalizzato = grezzo.replace(/\\/g, '/');
  const conSlash = normalizzato.startsWith('/') ? normalizzato : '/' + normalizzato;

  const baseRisolta = path.resolve(base);
  const assoluto = path.resolve(baseRisolta, '.' + conSlash);

  if (assoluto !== baseRisolta && !assoluto.startsWith(baseRisolta + path.sep)) { return null; }
  return assoluto;
}

function eDentro(base, percorso) {
  const b = path.resolve(base);
  const p = path.resolve(percorso);
  return p === b || p.startsWith(b + path.sep);
}

module.exports = { P, imposta, risolviDentro, eDentro, applicaAmbiente, RADICE_PREDEFINITA };
