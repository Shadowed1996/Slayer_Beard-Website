'use strict';

const fs = require('node:fs');
const https = require('node:https');
const crypto = require('node:crypto');

const { P } = require('./percorsi');
const file = require('./file');
const chiavi = require('./chiavi');
const archivio = require('./archivio');
const { erroreHttp } = require('./risposte');

const MIN_RISPOSTE = 2;
const MAX_RISPOSTE = 6;
const MAX_DOMANDA = 200;
const MAX_RISPOSTA = 80;
const MIN_DURATA_MIN = 1;
const MAX_DURATA_MIN = 60 * 24 * 30;
const MAX_ARCHIVIO = 50;
const MOSTRA_CHIUSO_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TOKEN_MS = 5 * 60 * 1000;
const MAX_CACHE_TOKEN = 5000;
const TIMEOUT_MS = 8000;
const FORMA_TOKEN = /^[A-Za-z0-9]{10,120}$/;

let stato = null;
let caricatoDa = null;
const cacheToken = new Map();
let verificaSostituita = null;

function vuoto() {
  return { attivo: null, archivio: [] };
}

function oggetto(valore) {
  return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
}

function carica() {
  if (stato && caricatoDa === P.sondaggi) { return stato; }
  caricatoDa = P.sondaggi;
  stato = vuoto();
  const grezzo = file.leggiSeEsiste(P.sondaggi);
  if (grezzo === null) { return stato; }
  try {
    const letto = JSON.parse(grezzo);
    stato.attivo = oggetto(letto.attivo) ? letto.attivo : null;
    stato.archivio = Array.isArray(letto.archivio) ? letto.archivio.filter(oggetto) : [];
    if (stato.attivo && !oggetto(stato.attivo.voti)) { stato.attivo.voti = {}; }
  } catch (e) {
    const daParte = P.sondaggi + '.rotto-' + Date.now();
    try { fs.renameSync(P.sondaggi, daParte); } catch (err) { }
    console.error('[sondaggi] ' + P.sondaggi + ' non si legge, messo da parte in ' + daParte + ': ' + e.message);
  }
  return stato;
}

function salva() {
  file.scriviAtomico(P.sondaggi, JSON.stringify(stato, null, 2) + '\n');
}

function conteggi(sondaggio) {
  const totali = sondaggio.risposte.map(() => 0);
  for (const indice of Object.values(sondaggio.voti || {})) {
    if (Number.isInteger(indice) && indice >= 0 && indice < totali.length) { totali[indice] += 1; }
  }
  return totali;
}

function somma(numeri) {
  return numeri.reduce((a, b) => a + b, 0);
}

function archivia(sondaggio, chiusoIl) {
  const totali = conteggi(sondaggio);
  stato.archivio.unshift({
    id: sondaggio.id,
    domanda: sondaggio.domanda,
    risposte: sondaggio.risposte.slice(),
    apertoIl: sondaggio.apertoIl,
    scadeIl: sondaggio.scadeIl,
    chiusoIl: chiusoIl,
    conteggi: totali,
    totale: somma(totali)
  });
  if (stato.archivio.length > MAX_ARCHIVIO) { stato.archivio.length = MAX_ARCHIVIO; }
}

function aggiorna(adesso) {
  carica();
  const ora = adesso === undefined ? Date.now() : adesso;
  if (stato.attivo && Date.parse(stato.attivo.scadeIl) <= ora) {
    archivia(stato.attivo, stato.attivo.scadeIl);
    stato.attivo = null;
    salva();
  }
  return stato;
}

function testoPulito(valore, massimo, cosa) {
  const testo = typeof valore === 'string' ? valore.replace(/\s+/g, ' ').trim() : '';
  if (!testo) { throw erroreHttp(422, 'Manca ' + cosa + '.'); }
  if (testo.length > massimo) { throw erroreHttp(422, cosa.charAt(0).toUpperCase() + cosa.slice(1) + ' supera i ' + massimo + ' caratteri.'); }
  return testo;
}

function crea(dati, adesso) {
  const ora = adesso === undefined ? Date.now() : adesso;
  aggiorna(ora);
  if (stato.attivo) {
    throw erroreHttp(409, 'C\'è già un sondaggio aperto: chiudilo prima di crearne un altro.');
  }
  const corpo = oggetto(dati) ? dati : {};
  const domanda = testoPulito(corpo.domanda, MAX_DOMANDA, 'la domanda');
  if (!Array.isArray(corpo.risposte)) { throw erroreHttp(422, 'Le risposte devono essere un elenco.'); }
  const risposte = corpo.risposte
    .filter((r) => typeof r === 'string' && r.trim())
    .map((r, i) => testoPulito(r, MAX_RISPOSTA, 'la risposta ' + (i + 1)));
  if (risposte.length < MIN_RISPOSTE) { throw erroreHttp(422, 'Servono almeno ' + MIN_RISPOSTE + ' risposte.'); }
  if (risposte.length > MAX_RISPOSTE) { throw erroreHttp(422, 'Al massimo ' + MAX_RISPOSTE + ' risposte.'); }
  const doppie = new Set(risposte.map((r) => r.toLowerCase()));
  if (doppie.size !== risposte.length) { throw erroreHttp(422, 'Due risposte sono uguali.'); }
  const durata = Number(corpo.durataMinuti);
  if (!Number.isInteger(durata) || durata < MIN_DURATA_MIN || durata > MAX_DURATA_MIN) {
    throw erroreHttp(422, 'La durata va da ' + MIN_DURATA_MIN + ' minuto a ' + (MAX_DURATA_MIN / 60 / 24) + ' giorni.');
  }

  stato.attivo = {
    id: crypto.randomBytes(8).toString('hex'),
    domanda: domanda,
    risposte: risposte,
    apertoIl: new Date(ora).toISOString(),
    scadeIl: new Date(ora + durata * 60000).toISOString(),
    voti: {}
  };
  salva();
  return vistaAdmin(ora);
}

function chiudi(adesso) {
  const ora = adesso === undefined ? Date.now() : adesso;
  aggiorna(ora);
  if (!stato.attivo) { throw erroreHttp(404, 'Non c\'è nessun sondaggio aperto.'); }
  archivia(stato.attivo, new Date(ora).toISOString());
  stato.attivo = null;
  salva();
  return vistaAdmin(ora);
}

function elimina(id, adesso) {
  const ora = adesso === undefined ? Date.now() : adesso;
  aggiorna(ora);
  if (stato.attivo && stato.attivo.id === id) {
    stato.attivo = null;
  } else {
    const prima = stato.archivio.length;
    stato.archivio = stato.archivio.filter((s) => s.id !== id);
    if (stato.archivio.length === prima) { throw erroreHttp(404, 'Questo sondaggio non esiste.'); }
  }
  salva();
  return vistaAdmin(ora);
}

function vistaAdmin(adesso) {
  aggiorna(adesso);
  const attivo = stato.attivo;
  let fuori = null;
  if (attivo) {
    const totali = conteggi(attivo);
    fuori = {
      id: attivo.id,
      domanda: attivo.domanda,
      risposte: attivo.risposte.slice(),
      apertoIl: attivo.apertoIl,
      scadeIl: attivo.scadeIl,
      conteggi: totali,
      totale: somma(totali)
    };
  }
  return { attivo: fuori, archivio: stato.archivio.map((s) => Object.assign({}, s, { risposte: s.risposte.slice(), conteggi: s.conteggi.slice() })) };
}

function vistaPubblica(idUtente, adesso) {
  const ora = adesso === undefined ? Date.now() : adesso;
  aggiorna(ora);
  const attivo = stato.attivo;
  if (attivo) {
    const votato = idUtente && Object.prototype.hasOwnProperty.call(attivo.voti, idUtente) ? attivo.voti[idUtente] : null;
    const totali = votato === null ? null : conteggi(attivo);
    return {
      sondaggio: {
        id: attivo.id,
        domanda: attivo.domanda,
        risposte: attivo.risposte.slice(),
        scadeIl: attivo.scadeIl,
        chiuso: false,
        votato: votato,
        conteggi: totali,
        totale: totali ? somma(totali) : null
      }
    };
  }
  const ultimo = stato.archivio[0];
  if (ultimo && ora - Date.parse(ultimo.chiusoIl) < MOSTRA_CHIUSO_MS) {
    return {
      sondaggio: {
        id: ultimo.id,
        domanda: ultimo.domanda,
        risposte: ultimo.risposte.slice(),
        scadeIl: ultimo.chiusoIl,
        chiuso: true,
        votato: null,
        conteggi: ultimo.conteggi.slice(),
        totale: ultimo.totale
      }
    };
  }
  return { sondaggio: null };
}

function vota(idUtente, dati, adesso) {
  const ora = adesso === undefined ? Date.now() : adesso;
  aggiorna(ora);
  const corpo = oggetto(dati) ? dati : {};
  const attivo = stato.attivo;
  if (!attivo || attivo.id !== corpo.id) { throw erroreHttp(410, 'Questo sondaggio è già chiuso.'); }
  const scelta = corpo.risposta;
  if (!Number.isInteger(scelta) || scelta < 0 || scelta >= attivo.risposte.length) {
    throw erroreHttp(400, 'Questa risposta non esiste.');
  }
  if (Object.prototype.hasOwnProperty.call(attivo.voti, idUtente)) {
    return { giaVotato: true, vista: vistaPubblica(idUtente, ora) };
  }
  attivo.voti[idUtente] = scelta;
  salva();
  return { giaVotato: false, vista: vistaPubblica(idUtente, ora) };
}

function tokenDa(req) {
  const testa = String(req.headers.authorization || '');
  const trovato = /^Bearer\s+(\S+)$/i.exec(testa);
  return trovato ? trovato[1] : '';
}

function clientIdAmmessi() {
  const ammessi = new Set();
  const daChiavi = chiavi.clientId();
  if (daChiavi) { ammessi.add(daChiavi); }
  try {
    const conf = archivio.leggi().config.account;
    if (conf && typeof conf.clientId === 'string' && conf.clientId) { ammessi.add(conf.clientId); }
  } catch (e) { }
  return ammessi;
}

function chiediValidazione(token) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request({
      method: 'GET',
      hostname: 'id.twitch.tv',
      path: '/oauth2/validate',
      headers: { Authorization: 'OAuth ' + token }
    }, (risposta) => {
      const pezzi = [];
      risposta.on('data', (p) => pezzi.push(p));
      risposta.on('end', () => {
        if (risposta.statusCode === 401) { risolvi(null); return; }
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) {
          rifiuta(new Error('Twitch ha risposto ' + risposta.statusCode));
          return;
        }
        try { risolvi(JSON.parse(Buffer.concat(pezzi).toString('utf8'))); }
        catch (e) { rifiuta(new Error('Twitch ha risposto qualcosa che non è JSON.')); }
      });
    });
    richiesta.setTimeout(TIMEOUT_MS, () => richiesta.destroy(new Error('Twitch non ha risposto in tempo.')));
    richiesta.on('error', rifiuta);
    richiesta.end();
  });
}

function inCache(token) {
  const voce = cacheToken.get(token);
  if (!voce) { return null; }
  if (voce.scade <= Date.now()) { cacheToken.delete(token); return null; }
  return voce.utente;
}

async function verificaToken(token) {
  if (!FORMA_TOKEN.test(token)) { throw erroreHttp(401, 'Il collegamento con Twitch non è valido: ricollegati.'); }
  const memorizzato = inCache(token);
  if (memorizzato) { return memorizzato; }

  let risposta;
  try {
    risposta = verificaSostituita ? await verificaSostituita(token) : await chiediValidazione(token);
  } catch (e) {
    throw erroreHttp(503, 'Twitch non risponde: riprova fra poco.');
  }
  if (!risposta || typeof risposta.user_id !== 'string' || !risposta.user_id) {
    throw erroreHttp(401, 'Il collegamento con Twitch è scaduto: ricollegati.');
  }
  const ammessi = clientIdAmmessi();
  if (ammessi.size && !ammessi.has(risposta.client_id)) {
    throw erroreHttp(401, 'Questo accesso a Twitch non viene dal sito: ricollegati.');
  }

  const utente = { id: risposta.user_id, login: String(risposta.login || '') };
  if (cacheToken.size >= MAX_CACHE_TOKEN) {
    const adesso = Date.now();
    for (const [k, v] of cacheToken) { if (v.scade <= adesso) { cacheToken.delete(k); } }
    if (cacheToken.size >= MAX_CACHE_TOKEN) { cacheToken.clear(); }
  }
  cacheToken.set(token, { utente: utente, scade: Date.now() + CACHE_TOKEN_MS });
  return utente;
}

function sostituisciVerifica(fn) {
  verificaSostituita = typeof fn === 'function' ? fn : null;
  cacheToken.clear();
}

function dimentica() {
  stato = null;
  caricatoDa = null;
  cacheToken.clear();
}

module.exports = {
  crea, chiudi, elimina, vota, vistaAdmin, vistaPubblica,
  tokenDa, verificaToken, inCache, sostituisciVerifica, dimentica,
  MIN_RISPOSTE, MAX_RISPOSTE, MAX_DOMANDA, MAX_RISPOSTA, MIN_DURATA_MIN, MAX_DURATA_MIN
};
