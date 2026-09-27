'use strict';

const https = require('node:https');

const archivio = require('./archivio');
const chiavi = require('./chiavi');

const TIMEOUT_MS = 8000;

function normalizzaUrl(url) {
  return String(url || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.|m\.)/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function canaleDaUrl(url) {
  let indirizzo;
  try { indirizzo = new URL(String(url || '').trim()); } catch (e) { return null; }
  const host = indirizzo.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (host !== 'youtube.com') { return null; }

  const pezzi = indirizzo.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!pezzi.length) { return null; }
  if (pezzi[0].startsWith('@') && pezzi[0].length > 1) { return { parametro: 'forHandle', valore: pezzi[0] }; }
  if (pezzi[0] === 'channel' && /^UC[\w-]{10,}$/.test(pezzi[1] || '')) { return { parametro: 'id', valore: pezzi[1] }; }
  if (pezzi[0] === 'user' && pezzi[1]) { return { parametro: 'forUsername', valore: pezzi[1] }; }
  return null;
}

function chiedi(percorso) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request({ method: 'GET', hostname: 'www.googleapis.com', path: percorso }, (risposta) => {
      const pezzi = [];
      risposta.on('data', (pezzo) => pezzi.push(pezzo));
      risposta.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        let dati = null;
        try { dati = JSON.parse(testo); } catch (e) { dati = null; }
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) {
          const motivo = (dati && dati.error && dati.error.message) || testo.replace(/\s+/g, ' ').trim().slice(0, 200);
          rifiuta(new Error('YouTube ha risposto ' + risposta.statusCode + ': ' + motivo));
          return;
        }
        if (!dati) { rifiuta(new Error('YouTube ha risposto qualcosa che non e JSON.')); return; }
        risolvi(dati);
      });
    });
    richiesta.setTimeout(TIMEOUT_MS, () => {
      richiesta.destroy(new Error('YouTube non ha risposto entro ' + (TIMEOUT_MS / 1000) + ' secondi.'));
    });
    richiesta.on('error', rifiuta);
    richiesta.end();
  });
}

function totaleIscritti(risposta) {
  const voce = risposta && Array.isArray(risposta.items) ? risposta.items[0] : null;
  const statistiche = voce && voce.statistics;
  if (!statistiche || statistiche.hiddenSubscriberCount === true) { return null; }
  if (statistiche.subscriberCount === undefined || statistiche.subscriberCount === null || statistiche.subscriberCount === '') { return null; }
  const totale = Number(statistiche.subscriberCount);
  return Number.isFinite(totale) && totale >= 0 ? Math.round(totale) : null;
}

async function contaIscritti(url, chiaveApi) {
  const canale = canaleDaUrl(url);
  if (!canale) { throw new Error('dal link ' + url + ' non si capisce quale canale sia (serve youtube.com/@nome o youtube.com/channel/UC...)'); }
  const query = new URLSearchParams({ part: 'statistics', [canale.parametro]: canale.valore, key: chiaveApi }).toString();
  return totaleIscritti(await chiedi('/youtube/v3/channels?' + query));
}

function linkDaContare(config) {
  const visti = new Set();
  const fuori = [];
  for (const voce of (config && Array.isArray(config.social)) ? config.social : []) {
    if (!voce || voce.contatore !== 'youtube') { continue; }
    const url = String(voce.url || '').trim();
    const chiave = normalizzaUrl(url);
    if (!url || visti.has(chiave)) { continue; }
    visti.add(chiave);
    fuori.push(url);
  }
  return fuori;
}

function iscrittiDi(config, url) {
  const chiave = normalizzaUrl(url);
  const elenco = (config && Array.isArray(config.iscrittiYoutube)) ? config.iscrittiYoutube : [];
  const voce = elenco.find((v) => v && normalizzaUrl(v.url) === chiave);
  return voce && Number.isFinite(Number(voce.iscritti)) ? Math.round(Number(voce.iscritti)) : null;
}

async function aggiornaIscritti() {
  const chiaveApi = chiavi.youtubeChiave();

  let contenuti;
  try { contenuti = archivio.leggi(); }
  catch (errore) { return { stato: 'fallito', motivo: errore.message, errori: [errore.message] }; }

  const link = linkDaContare(contenuti.config);
  if (!link.length) { return { stato: 'nessuno' }; }
  if (!chiaveApi) { return { stato: 'spento', quanti: link.length }; }

  const letti = [];
  const errori = [];
  for (const url of link) {
    try {
      const iscritti = await contaIscritti(url, chiaveApi);
      if (iscritti === null) { errori.push(url + ': YouTube non da il numero degli iscritti (canale inesistente o iscritti nascosti)'); continue; }
      letti.push({ url: url, iscritti: iscritti });
    } catch (errore) {
      errori.push(errore.message);
    }
  }
  if (!letti.length) { return { stato: 'fallito', motivo: errori[0] || 'nessun canale letto', errori: errori }; }

  const cambiati = letti.filter((l) => iscrittiDi(contenuti.config, l.url) !== l.iscritti);
  if (!cambiati.length) { return { stato: 'invariato', letti: letti, errori: errori }; }

  try {
    const fresco = archivio.leggi();
    const elenco = Array.isArray(fresco.config.iscrittiYoutube) ? fresco.config.iscrittiYoutube.slice() : [];
    const quando = new Date().toISOString();
    for (const l of letti) {
      const i = elenco.findIndex((v) => v && normalizzaUrl(v.url) === normalizzaUrl(l.url));
      const voce = { url: l.url, iscritti: l.iscritti, letteIl: quando };
      if (i === -1) { elenco.push(voce); } else { elenco[i] = voce; }
    }
    fresco.config.iscrittiYoutube = elenco;
    archivio.salva(fresco);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message, errori: [errore.message] };
  }
  return { stato: 'aggiornato', letti: letti, errori: errori };
}

function racconta(esito) {
  if (!esito || !esito.stato) { return ''; }
  const numeri = (e) => (e.letti || []).map((l) => l.iscritti.toLocaleString('it-IT')).join(', ');
  const scarti = (e) => (e.errori && e.errori.length ? ' Non letti: ' + e.errori.join('; ') + '.' : '');
  switch (esito.stato) {
    case 'nessuno':
      return '';
    case 'spento':
      return 'Iscritti YouTube: manca la chiave API (SB_YOUTUBE_CHIAVE o youtube.chiaveApi in server/dati/chiavi.js), resta l ultimo numero letto.';
    case 'aggiornato':
      return 'Iscritti YouTube: aggiornati — ' + numeri(esito) + '.' + scarti(esito);
    case 'invariato':
      return 'Iscritti YouTube: gia aggiornati — ' + numeri(esito) + '.' + scarti(esito);
    case 'fallito':
      return 'Iscritti YouTube: non sono riuscito a chiederli (' + esito.motivo + '). Tengo quelli che c erano.';
    default:
      return '';
  }
}

function configurato() {
  return chiavi.youtubeChiave() !== '';
}

module.exports = {
  normalizzaUrl, canaleDaUrl, totaleIscritti, contaIscritti, linkDaContare, iscrittiDi,
  aggiornaIscritti, racconta, configurato, TIMEOUT_MS
};
