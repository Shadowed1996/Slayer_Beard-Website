'use strict';

const fs = require('node:fs');
const https = require('node:https');

const { P } = require('./percorsi');
const archivio = require('./archivio');
const { scriviAtomico, assicuraCartella } = require('./file');
const chiavi = require('./chiavi');

const TIMEOUT_MS = 8000;

const ANTICIPO_MS = 60 * 1000;

const HOST_ANTEPRIME = ['clips-media-assets2.twitch.tv', 'clips-media-assets.twitch.tv', 'static-cdn.jtvnw.net'];

let tokenInCache = null;

function credenziali() {
  return chiavi.twitchComplete();
}

function configurato() {
  try { return credenziali() !== null; } catch (e) { return false; }
}

function chiedi(opzioni, corpo) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request(opzioni, (risposta) => {
      const pezzi = [];
      risposta.on('data', (pezzo) => pezzi.push(pezzo));
      risposta.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) {
          const corpoBreve = testo.replace(/\s+/g, ' ').trim().slice(0, 200);
          const errore = new Error('Twitch ha risposto ' + risposta.statusCode + ': ' + corpoBreve);
          errore.codice = risposta.statusCode;
          try { errore.risposta = JSON.parse(testo); } catch (e) { errore.risposta = null; }
          rifiuta(errore);
          return;
        }
        try { risolvi(JSON.parse(testo)); }
        catch (e) { rifiuta(new Error('Twitch ha risposto qualcosa che non e JSON.')); }
      });
    });

    richiesta.setTimeout(TIMEOUT_MS, () => {
      richiesta.destroy(new Error('Twitch non ha risposto entro ' + (TIMEOUT_MS / 1000) + ' secondi.'));
    });
    richiesta.on('error', rifiuta);

    if (corpo !== undefined) { richiesta.write(corpo); }
    richiesta.end();
  });
}

async function appToken() {
  const ora = Date.now();
  if (tokenInCache && tokenInCache.scadeIl - ANTICIPO_MS > ora) { return tokenInCache.valore; }

  const chiavi = credenziali();
  if (!chiavi) { throw new Error('Mancano le chiavi in ' + P.chiavi + ': lancia node server/imposta-twitch.js.'); }

  const corpo = new URLSearchParams({
    client_id: chiavi.clientId,
    client_secret: chiavi.clientSecret,
    grant_type: 'client_credentials'
  }).toString();

  const risposta = await chiedi({
    method: 'POST',
    hostname: 'id.twitch.tv',
    path: '/oauth2/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(corpo)
    }
  }, corpo);

  if (!risposta || typeof risposta.access_token !== 'string' || !risposta.access_token) {
    throw new Error('Twitch non ha dato nessun token: controlla Client ID e secret.');
  }

  const durataMs = (typeof risposta.expires_in === 'number' ? risposta.expires_in : 3600) * 1000;
  tokenInCache = { valore: risposta.access_token, scadeIl: Date.now() + durataMs };
  return tokenInCache.valore;
}

function dimenticaToken() {
  tokenInCache = null;
}

async function helix(percorso) {
  const chiavi = credenziali();
  const token = await appToken();
  return chiedi({
    method: 'GET',
    hostname: 'api.twitch.tv',
    path: '/helix' + percorso,
    headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': chiavi.clientId }
  });
}

function primoTitolo(risposta) {
  if (!risposta || !Array.isArray(risposta.data) || !risposta.data.length) { return ''; }
  const titolo = risposta.data[0].title;
  return typeof titolo === 'string' ? titolo.trim() : '';
}

async function titoloUltimaDiretta(idUtente) {
  const id = encodeURIComponent(String(idUtente));

  const archivi = await helix('/videos?user_id=' + id + '&type=archive&first=1');
  const daiVod = primoTitolo(archivi);
  if (daiVod) { return { titolo: daiVod, fonte: 'videos' }; }

  const canale = await helix('/channels?broadcaster_id=' + id);
  if (canale && Array.isArray(canale.data) && canale.data.length) {
    const titolo = typeof canale.data[0].title === 'string' ? canale.data[0].title.trim() : '';
    if (titolo) { return { titolo: titolo, fonte: 'channels' }; }
  }

  return { titolo: '', fonte: 'nessuna' };
}

async function aggiornaUltimaDiretta() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let contenuti;
  let idUtente;
  try {
    contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let esito;
  try {
    esito = await titoloUltimaDiretta(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const precedente = typeof contenuti.config.ultimaDiretta === 'string' ? contenuti.config.ultimaDiretta : '';
  if (!esito.titolo) { return { stato: 'vuoto', precedente: precedente }; }
  if (esito.titolo === precedente) { return { stato: 'invariato', titolo: precedente, fonte: esito.fonte }; }

  let fresco;
  try {
    fresco = archivio.leggi();
    fresco.config.ultimaDiretta = esito.titolo;
    archivio.salva(fresco);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'aggiornato', titolo: esito.titolo, precedente: precedente, fonte: esito.fonte };
}

function totaleFollower(risposta) {
  if (!risposta || typeof risposta !== 'object') { return null; }
  if (risposta.total === null || risposta.total === undefined || risposta.total === '') { return null; }
  const totale = Number(risposta.total);
  if (!Number.isFinite(totale) || totale < 0) { return null; }
  return Math.round(totale);
}

async function contaFollower(idUtente) {
  const id = encodeURIComponent(String(idUtente));
  return totaleFollower(await helix('/channels/followers?broadcaster_id=' + id + '&first=1'));
}

async function aggiornaFollower() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let contenuti;
  let idUtente;
  try {
    contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let totale;
  try {
    totale = await contaFollower(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const dati = (contenuti.config && contenuti.config.dati) || {};
  const precedente = Number.isFinite(Number(dati.follower)) ? Math.round(Number(dati.follower)) : 0;
  if (totale === null) { return { stato: 'vuoto', precedente: precedente }; }
  if (totale === precedente) { return { stato: 'invariato', totale: totale }; }

  try {
    const fresco = archivio.leggi();
    if (!fresco.config.dati || typeof fresco.config.dati !== 'object') { fresco.config.dati = {}; }
    fresco.config.dati.follower = totale;
    archivio.salva(fresco);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'aggiornato', totale: totale, precedente: precedente };
}

const PERIODI = { '7': 7, '30': 30, '365': 365 };

const FINESTRE_PAGINA = [1, 3, 7, 30];

function percorsoClip(idUtente, quante, giorni) {
  const id = encodeURIComponent(String(idUtente));
  let percorso = '/clips?broadcaster_id=' + id + '&first=' + Math.min(50, Math.max(1, quante));
  if (giorni) {
    const fine = new Date();
    const inizio = new Date(fine.getTime() - giorni * 24 * 60 * 60 * 1000);
    percorso += '&started_at=' + inizio.toISOString() + '&ended_at=' + fine.toISOString();
  }
  return percorso;
}

function ripulisciClip(risposta, hostStrani) {
  const voci = (risposta && Array.isArray(risposta.data)) ? risposta.data : [];
  const fuori = [];

  for (const voce of voci) {
    const url = String((voce && voce.url) || '').trim();
    const titolo = String((voce && voce.title) || '').trim();
    if (!url || !titolo) { continue; }

    let anteprima = String((voce && voce.thumbnail_url) || '').trim();
    if (anteprima) {
      let host = '';
      try { host = new URL(anteprima).hostname.toLowerCase(); } catch (e) { host = ''; }
      if (HOST_ANTEPRIME.indexOf(host) === -1) {
        if (host && hostStrani.indexOf(host) === -1) { hostStrani.push(host); }
        anteprima = '';
      }
    }

    fuori.push({
      id: String((voce && voce.id) || ''),
      titolo: titolo,
      url: url,
      anteprima: anteprima,
      durataSec: Number.isFinite(Number(voce && voce.duration)) ? Math.round(Number(voce.duration)) : 0,
      visualizzazioni: Number.isFinite(Number(voce && voce.view_count)) ? Math.round(Number(voce.view_count)) : 0,
      creataIl: String((voce && voce.created_at) || ''),
      autore: String((voce && voce.creator_name) || '').trim()
    });
  }

  return fuori;
}

async function clipMigliori(idUtente, quante, periodo) {
  const hostStrani = [];
  const risposta = await helix(percorsoClip(idUtente, quante, PERIODI[String(periodo)]));
  return { voci: ripulisciClip(risposta, hostStrani), hostStrani: hostStrani };
}

async function clipArchivio(idUtente, quante) {
  const hostStrani = [];
  const viste = new Map();

  for (const giorni of FINESTRE_PAGINA) {
    const risposta = await helix(percorsoClip(idUtente, quante, giorni));
    for (const clip of ripulisciClip(risposta, hostStrani)) {
      const chiave = clip.id || clip.url;
      if (!viste.has(chiave)) { viste.set(chiave, clip); }
    }
  }

  const voci = Array.from(viste.values()).sort((a, b) => b.visualizzazioni - a.visualizzazioni);
  return { voci: voci, hostStrani: hostStrani };
}

function stessoElenco(prima, dopo) {
  return prima.length === dopo.length
    && prima.every((v, i) => v && v.id === dopo[i].id && v.titolo === dopo[i].titolo
      && v.visualizzazioni === dopo[i].visualizzazioni);
}

async function aggiornaClip() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let contenuti;
  let clip;
  let idUtente;
  try {
    contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    clip = (contenuti.config && contenuti.config.clip) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  if (clip.attivo !== true) { return { stato: 'spento', motivo: 'sezione' }; }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  const quante = Number.isFinite(Number(clip.quante)) ? Math.round(Number(clip.quante)) : 6;
  const quantePagina = Number.isFinite(Number(clip.quanteArchivio))
    ? Math.min(50, Math.max(4, Math.round(Number(clip.quanteArchivio)))) : 12;

  let esito;
  try {
    esito = await clipMigliori(idUtente, quante, clip.periodo);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  let pagina;
  try {
    pagina = await clipArchivio(idUtente, quantePagina);
  } catch (errore) {
    pagina = { voci: [], hostStrani: [], errore: errore.message };
  }

  const precedenti = Array.isArray(clip.voci) ? clip.voci : [];
  const primaPagina = Array.isArray(clip.archivio) ? clip.archivio : [];

  const cambiaVetrina = esito.voci.length > 0 && !stessoElenco(precedenti, esito.voci);
  const cambiaPagina = pagina.voci.length > 0 && !stessoElenco(primaPagina, pagina.voci);

  if (cambiaVetrina || cambiaPagina) {
    try {
      const fresco = archivio.leggi();
      if (!fresco.config.clip || typeof fresco.config.clip !== 'object') { fresco.config.clip = {}; }
      if (cambiaVetrina) { fresco.config.clip.voci = esito.voci; }
      if (cambiaPagina) { fresco.config.clip.archivio = pagina.voci; }
      archivio.salva(fresco);
    } catch (errore) {
      return { stato: 'fallito', motivo: errore.message };
    }
  }

  const hostStrani = esito.hostStrani.slice();
  for (const host of pagina.hostStrani || []) {
    if (hostStrani.indexOf(host) === -1) { hostStrani.push(host); }
  }

  let statoPagina;
  if (pagina.errore) { statoPagina = { stato: 'fallito', motivo: pagina.errore, quante: primaPagina.length }; }
  else if (!pagina.voci.length) { statoPagina = { stato: 'vuoto', quante: primaPagina.length }; }
  else { statoPagina = { stato: cambiaPagina ? 'aggiornato' : 'invariato', quante: pagina.voci.length }; }

  if (!esito.voci.length) {
    return { stato: 'vuoto', quante: precedenti.length, hostStrani: hostStrani, pagina: statoPagina };
  }
  return {
    stato: cambiaVetrina ? 'aggiornato' : 'invariato',
    quante: esito.voci.length,
    hostStrani: hostStrani,
    pagina: statoPagina
  };
}

function direttaSalvata() {
  let testo;
  try { testo = fs.readFileSync(P.direttaTwitch, 'utf8'); }
  catch (e) { return null; }
  let dati;
  try { dati = JSON.parse(testo); }
  catch (e) { return null; }
  if (!dati || typeof dati !== 'object') { return null; }
  return {
    categoria: typeof dati.categoria === 'string' ? dati.categoria : '',
    inOnda: dati.inOnda === true,
    letteIl: typeof dati.letteIl === 'string' ? dati.letteIl : ''
  };
}

function salvaDiretta(dati) {
  try {
    assicuraCartella(P.dati);
    scriviAtomico(P.direttaTwitch, JSON.stringify(dati, null, 2) + '\n');
    return true;
  } catch (e) {
    return false;
  }
}

async function categoriaInDiretta(idUtente) {
  const id = encodeURIComponent(String(idUtente));
  const risposta = await helix('/streams?user_id=' + id + '&first=1');
  const voci = (risposta && Array.isArray(risposta.data)) ? risposta.data : [];
  if (!voci.length) { return { inOnda: false, categoria: '' }; }
  const gioco = typeof voci[0].game_name === 'string' ? voci[0].game_name.trim() : '';
  return { inOnda: true, categoria: gioco };
}

async function aggiornaCategoria() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let idUtente;
  try {
    const contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let esito;
  try {
    esito = await categoriaInDiretta(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const prima = direttaSalvata();
  const precedente = prima ? prima.categoria : '';

  const scritto = salvaDiretta({
    categoria: esito.categoria,
    inOnda: esito.inOnda,
    letteIl: new Date().toISOString()
  });
  if (!scritto) { return { stato: 'fallito', motivo: 'non sono riuscito a scrivere server/dati/twitch-diretta.json' }; }

  if (!esito.inOnda) { return { stato: 'spenta', precedente: precedente }; }
  if (esito.categoria === precedente) { return { stato: 'invariato', categoria: esito.categoria }; }
  return { stato: 'aggiornato', categoria: esito.categoria, precedente: precedente };
}

function emoteSalvate() {
  try {
    const dati = JSON.parse(fs.readFileSync(P.emoteTwitch, 'utf8'));
    return (dati && dati.emote && typeof dati.emote === 'object') ? dati.emote : {};
  } catch (e) {
    return {};
  }
}

function elencoEmote(risposta) {
  const elenco = {};
  const voci = (risposta && Array.isArray(risposta.data)) ? risposta.data : [];
  for (const voce of voci) {
    const nome = voce && typeof voce.name === 'string' ? voce.name.trim() : '';
    const id = voce && typeof voce.id === 'string' ? voce.id.trim() : '';
    if (!nome || !/^[A-Za-z0-9_]+$/.test(id)) { continue; }
    elenco[nome] = { id: id, animata: Array.isArray(voce.format) && voce.format.indexOf('animated') !== -1 };
  }
  return elenco;
}

async function aggiornaEmote() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let idUtente;
  try {
    const contenuti = archivio.leggi();
    const config = contenuti.config || {};
    const frasi = (config.chi && Array.isArray(config.chi.frasi)) ? config.chi.frasi : [];
    if (!frasi.length) { return { stato: 'spento', motivo: 'senzaFrasi' }; }
    idUtente = config.twitch && typeof config.twitch.idUtente === 'string' ? config.twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let globali;
  let delCanale;
  try {
    globali = elencoEmote(await helix('/chat/emotes/global'));
    delCanale = elencoEmote(await helix('/chat/emotes?broadcaster_id=' + encodeURIComponent(idUtente)));
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const emote = Object.assign({}, globali, delCanale);
  try {
    assicuraCartella(P.dati);
    scriviAtomico(P.emoteTwitch, JSON.stringify({ letteIl: new Date().toISOString(), emote: emote }, null, 2) + '\n');
  } catch (errore) {
    return { stato: 'fallito', motivo: 'non sono riuscito a scrivere server/dati/twitch-emote.json' };
  }
  return { stato: 'aggiornato', delCanale: Object.keys(delCanale).length, globali: Object.keys(globali).length };
}

function raccontaEmote(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return esito.motivo === 'senzaFrasi' ? ''
        : 'Emote: il collegamento con Twitch non e configurato, nelle frasi del pollo i nomi delle emote restano scritti.';
    case 'senzaCanale':
      return 'Emote: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Emote: ' + esito.delCanale + ' del canale e ' + esito.globali + ' globali, pronte per le frasi del pollo.';
    case 'fallito':
      return 'Emote: non sono riuscito a chiederle a Twitch (' + esito.motivo + '). Tengo l elenco di prima.';
    default:
      return '';
  }
}

const SCOPE_ACCESSO = 'channel:read:subscriptions';

const CAMPI_NUMERI = {};

let accessoInCache = null;
let rinnovoInCorso = null;

function formattaNumero(n) {
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function eNumeroNudo(testo) {
  return typeof testo === 'string' && /^\s*(\d+|\d{1,3}(\.\d{3})+)\s*$/.test(testo);
}

function leggiAccesso() {
  let testo;
  try { testo = fs.readFileSync(P.accessoTwitch, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') { return null; }
    throw e;
  }
  let dati;
  try { dati = JSON.parse(testo); }
  catch (e) { throw new Error('server/dati/twitch-accesso.json non si legge: rifai l autorizzazione con node server/imposta-twitch.js --collega.'); }
  if (!dati || typeof dati.refreshToken !== 'string' || !dati.refreshToken.trim()) { return null; }
  return dati;
}

function salvaAccesso(dati) {
  assicuraCartella(P.dati);
  scriviAtomico(P.accessoTwitch, JSON.stringify(dati, null, 2) + '\n');
  try { fs.chmodSync(P.accessoTwitch, 0o600); } catch (e) {  }
}

function collegato() {
  try { return leggiAccesso() !== null; } catch (e) { return false; }
}

function scollega() {
  accessoInCache = null;
  try { fs.unlinkSync(P.accessoTwitch); return true; }
  catch (e) { if (e.code === 'ENOENT') { return false; } throw e; }
}

function postModulo(percorso, campi) {
  const corpo = new URLSearchParams(campi).toString();
  return chiedi({
    method: 'POST',
    hostname: 'id.twitch.tv',
    path: percorso,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo) }
  }, corpo);
}

async function iniziaCollegamento() {
  const chiavi = credenziali();
  if (!chiavi) { throw new Error('Prima servono le chiavi dell app: node server/imposta-twitch.js <clientId> <clientSecret>.'); }
  const r = await postModulo('/oauth2/device', { client_id: chiavi.clientId, scopes: SCOPE_ACCESSO });
  if (!r || !r.device_code || !r.user_code) { throw new Error('Twitch non ha dato nessun codice.'); }
  return {
    codiceDispositivo: r.device_code,
    codiceUtente: r.user_code,
    indirizzo: r.verification_uri || 'https://www.twitch.tv/activate',
    scadeTraSec: Number(r.expires_in) || 1800,
    intervalloSec: Number(r.interval) || 5
  };
}

async function tentaCollegamento(avvio) {
  const chiavi = credenziali();
  if (!chiavi) { throw new Error('Mancano le chiavi dell app.'); }

  let token;
  try {
    token = await postModulo('/oauth2/token', {
      client_id: chiavi.clientId,
      scopes: SCOPE_ACCESSO,
      device_code: avvio.codiceDispositivo,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
  } catch (errore) {
    const messaggio = String((errore.risposta && errore.risposta.message) || '');
    if (messaggio === 'authorization_pending') { return { stato: 'in attesa' }; }
    if (messaggio === 'slow_down') { return { stato: 'rallenta' }; }
    throw errore;
  }
  if (!token.refresh_token || !token.access_token) { throw new Error('Twitch non ha dato nessun token.'); }

  const utenti = await chiedi({
    method: 'GET', hostname: 'api.twitch.tv', path: '/helix/users',
    headers: { 'Authorization': 'Bearer ' + token.access_token, 'Client-Id': chiavi.clientId }
  });
  const io = (utenti && Array.isArray(utenti.data) && utenti.data[0]) || {};

  salvaAccesso({
    refreshToken: token.refresh_token,
    idUtente: String(io.id || ''),
    login: String(io.login || ''),
    collegatoIl: new Date().toISOString()
  });
  accessoInCache = { valore: token.access_token, scadeIl: Date.now() + (Number(token.expires_in) || 3600) * 1000 };
  return { stato: 'confermato', login: String(io.login || ''), idUtente: String(io.id || '') };
}

async function completaCollegamento(avvio, opzioni) {
  const attendi = (opzioni && opzioni.attendi) || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let intervallo = avvio.intervalloSec * 1000;
  const limite = Date.now() + avvio.scadeTraSec * 1000;

  for (;;) {
    if (Date.now() > limite) { throw new Error('Il codice e scaduto prima della conferma: rilancia il comando.'); }
    await attendi(intervallo);
    const esito = await tentaCollegamento(avvio);
    if (esito.stato === 'confermato') { return { login: esito.login, idUtente: esito.idUtente }; }
    if (esito.stato === 'rallenta') { intervallo += 5000; }
  }
}

function infoCollegamento() {
  let accesso;
  try { accesso = leggiAccesso(); } catch (e) { return { collegato: false }; }
  if (!accesso) { return { collegato: false }; }
  return { collegato: true, login: accesso.login || '', idUtente: accesso.idUtente || '' };
}

async function tokenAccesso() {
  if (accessoInCache && accessoInCache.scadeIl - ANTICIPO_MS > Date.now()) { return accessoInCache.valore; }
  if (rinnovoInCorso) { return rinnovoInCorso; }

  rinnovoInCorso = (async () => {
    const chiavi = credenziali();
    const accesso = leggiAccesso();
    if (!chiavi || !accesso) { throw new Error('Il server non e autorizzato: node server/imposta-twitch.js --collega.'); }

    let r;
    try {
      r = await postModulo('/oauth2/token', {
        client_id: chiavi.clientId,
        client_secret: chiavi.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: accesso.refreshToken
      });
    } catch (errore) {
      if (errore.codice === 400 || errore.codice === 401) {
        throw new Error('Twitch non accetta piu l autorizzazione' + (accesso.login ? ' di ' + accesso.login : '') +
          ' (scaduta o revocata): rifalla con node server/imposta-twitch.js --collega.');
      }
      throw errore;
    }
    if (!r || !r.access_token) { throw new Error('Twitch non ha rinnovato il token.'); }

    if (r.refresh_token && r.refresh_token !== accesso.refreshToken) {
      salvaAccesso({ ...accesso, refreshToken: r.refresh_token });
    }
    accessoInCache = { valore: r.access_token, scadeIl: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
    return accessoInCache.valore;
  })();

  try { return await rinnovoInCorso; }
  finally { rinnovoInCorso = null; }
}

async function helixAccesso(percorso) {
  const chiavi = credenziali();
  const opzioni = (token) => ({
    method: 'GET', hostname: 'api.twitch.tv', path: '/helix' + percorso,
    headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': chiavi.clientId }
  });
  try {
    return await chiedi(opzioni(await tokenAccesso()));
  } catch (errore) {
    if (errore.codice !== 401) { throw errore; }
    accessoInCache = null;
    return chiedi(opzioni(await tokenAccesso()));
  }
}

async function numeriCanale(idUtente) {
  const id = encodeURIComponent(String(idUtente));
  const seguaci = await helixAccesso('/channels/followers?broadcaster_id=' + id + '&first=1');
  if (!seguaci || !Number.isFinite(Number(seguaci.total))) { throw new Error('Twitch non ha dato il totale dei follower.'); }

  let abbonati = null;
  let motivoAbbonati = '';
  try {
    const abb = await helixAccesso('/subscriptions?broadcaster_id=' + id + '&first=1');
    if (abb && Number.isFinite(Number(abb.total))) { abbonati = Number(abb.total); }
    else { motivoAbbonati = 'Twitch non ha dato il totale degli abbonati'; }
  } catch (errore) {
    motivoAbbonati = errore.message;
  }
  return { follower: Number(seguaci.total), abbonati: abbonati, motivoAbbonati: motivoAbbonati };
}

function applicaNumeri(documento, numeri) {
  const cambiate = [];
  if (!documento.config.dati || typeof documento.config.dati !== 'object') { documento.config.dati = {}; }
  const dati = documento.config.dati;

  for (const nome of ['follower', 'abbonati']) {
    const valore = numeri[nome];
    if (valore === null || valore === undefined || !Number.isFinite(Number(valore))) { continue; }
    if (dati[nome] !== valore) { dati[nome] = valore; cambiate.push('config.dati.' + nome); }
    if (!CAMPI_NUMERI[nome]) { continue; }

    const scritto = formattaNumero(valore);
    for (const chiave of CAMPI_NUMERI[nome]) {
      const attuale = documento.testi[chiave];
      if (!eNumeroNudo(attuale) || attuale.trim() === scritto) { continue; }
      documento.testi[chiave] = scritto;
      cambiate.push(chiave);
    }
  }
  return cambiate;
}

async function aggiornaNumeri() {
  let chiavi;
  let accesso;
  try {
    chiavi = credenziali();
    if (!chiavi) { return { stato: 'spento' }; }
    accesso = leggiAccesso();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!accesso) { return { stato: 'nonCollegato' }; }

  let idUtente;
  try {
    const twitch = (archivio.leggi().config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let numeri;
  try {
    numeri = await numeriCanale(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  let cambiate;
  try {
    const fresco = archivio.leggi();
    cambiate = applicaNumeri(fresco, numeri);
    if (cambiate.length) { archivio.salva(fresco); }
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return {
    stato: cambiate.length ? 'aggiornato' : 'invariato',
    follower: numeri.follower, abbonati: numeri.abbonati,
    motivoAbbonati: numeri.motivoAbbonati, cambiate: cambiate
  };
}

function raccontaNumeri(esito) {
  if (!esito || !esito.stato) { return ''; }
  const abb = (e) => e.abbonati === null || e.abbonati === undefined
    ? '. Abbonati non letti (' + (e.motivoAbbonati || 'motivo sconosciuto') + ').'
    : ', ' + formattaNumero(e.abbonati) + ' abbonati.';
  switch (esito.stato) {
    case 'spento':
      return 'Follower e abbonati: il collegamento con Twitch non e configurato, restano quelli scritti a mano.';
    case 'nonCollegato':
      return 'Follower e abbonati: restano quelli scritti a mano finche slayer_beard non autorizza il server (node server/imposta-twitch.js --collega).';
    case 'senzaCanale':
      return 'Follower e abbonati: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Follower e abbonati: aggiornati da Twitch — ' + formattaNumero(esito.follower) + ' follower' + abb(esito);
    case 'invariato':
      return 'Follower e abbonati: gia aggiornati — ' + formattaNumero(esito.follower) + ' follower' + abb(esito);
    case 'fallito':
      return 'Follower e abbonati: non sono riuscito a chiederli a Twitch (' + esito.motivo + '). Tengo quelli che c erano.';
    default:
      return '';
  }
}

function racconta(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return 'Ultima diretta: presa dai contenuti (il collegamento con Twitch non e configurato).';
    case 'senzaCanale':
      return 'Ultima diretta: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Ultima diretta: aggiornata da Twitch — «' + esito.titolo + '».';
    case 'invariato':
      return 'Ultima diretta: gia aggiornata — «' + esito.titolo + '».';
    case 'vuoto':
      return 'Ultima diretta: Twitch non ha dato nessun titolo, tengo quello che c era.';
    case 'fallito':
      return 'Ultima diretta: non sono riuscito a chiederla a Twitch (' + esito.motivo + '). Tengo quello che c era.';
    default:
      return '';
  }
}

function raccontaFollower(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return 'Follower: presi dai contenuti (il collegamento con Twitch non e configurato).';
    case 'senzaCanale':
      return 'Follower: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Follower: aggiornati da Twitch — ' + esito.totale + ' (prima ' + esito.precedente + ').';
    case 'invariato':
      return 'Follower: gia aggiornati — ' + esito.totale + '.';
    case 'vuoto':
      return 'Follower: Twitch non ha dato nessun totale, tengo ' + esito.precedente + '.';
    case 'fallito':
      return 'Follower: non sono riuscito a chiederli a Twitch (' + esito.motivo + '). Tengo il numero che c era.';
    default:
      return '';
  }
}

function raccontaCategoria(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return 'Categoria: il collegamento con Twitch non e configurato, gli eventi mostrano il gioco scritto a mano.';
    case 'senzaCanale':
      return 'Categoria: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Categoria: in onda adesso «' + esito.categoria + '» — la mostra l evento speciale acceso.';
    case 'invariato':
      return 'Categoria: in onda adesso «' + esito.categoria + '», la stessa di prima.';
    case 'spenta':
      return 'Categoria: il canale non sta trasmettendo, gli eventi mostrano il gioco scritto a mano.';
    case 'fallito':
      return 'Categoria: non sono riuscito a chiederla a Twitch (' + esito.motivo + '). Tengo l ultima lettura.';
    default:
      return '';
  }
}

function raccontaPaginaClip(pagina) {
  if (!pagina || !pagina.stato) { return ''; }
  switch (pagina.stato) {
    case 'aggiornato':
      return ' Pagina: ' + pagina.quante + (pagina.quante === 1 ? ' clip nei quattro periodi.' : ' clip nei quattro periodi.');
    case 'invariato':
      return ' Pagina: gia a posto, ' + pagina.quante + ' clip.';
    case 'vuoto':
      return ' Pagina: Twitch non ne ha date per nessuno dei quattro periodi, tengo le ' + pagina.quante + ' che c erano.';
    case 'fallito':
      return ' Pagina: non sono riuscito a chiederle (' + pagina.motivo + '), tengo quelle che c erano.';
    default:
      return '';
  }
}

function raccontaClip(esito) {
  if (!esito || !esito.stato) { return ''; }
  const pagina = raccontaPaginaClip(esito.pagina);
  const strani = (esito.hostStrani && esito.hostStrani.length)
    ? ' Attenzione: ' + esito.hostStrani.length + (esito.hostStrani.length === 1 ? ' anteprima arriva' : ' anteprime arrivano')
      + ' da un host che la CSP non conosce (' + esito.hostStrani.join(', ') + '), e quelle card restano senza immagine.'
    : '';
  switch (esito.stato) {
    case 'spento':
      return esito.motivo === 'sezione'
        ? 'Clip: la vetrina e spenta nel pannello, non ho chiesto niente a Twitch.'
        : 'Clip: il collegamento con Twitch non e configurato, non ho chiesto niente.';
    case 'senzaCanale':
      return 'Clip: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Clip: aggiornate da Twitch — ' + esito.quante + (esito.quante === 1 ? ' clip.' : ' clip.') + pagina + strani;
    case 'invariato':
      return 'Clip: gia aggiornate — ' + esito.quante + ' in vetrina.' + pagina + strani;
    case 'vuoto':
      return 'Clip: Twitch non ne ha date per il periodo scelto, tengo le ' + esito.quante + ' che c erano.' + pagina;
    case 'fallito':
      return 'Clip: non sono riuscito a chiederle a Twitch (' + esito.motivo + '). Tengo quelle che c erano.';
    default:
      return '';
  }
}

module.exports = {
  credenziali, configurato, appToken, dimenticaToken, helix,
  titoloUltimaDiretta, aggiornaUltimaDiretta, racconta,
  totaleFollower, contaFollower, aggiornaFollower, raccontaFollower,
  clipMigliori, clipArchivio, aggiornaClip, raccontaClip, raccontaPaginaClip,
  categoriaInDiretta, aggiornaCategoria, raccontaCategoria, direttaSalvata, salvaDiretta,
  emoteSalvate, elencoEmote, aggiornaEmote, raccontaEmote,
  collegato, scollega, iniziaCollegamento, completaCollegamento, tentaCollegamento, infoCollegamento, numeriCanale,
  applicaNumeri, aggiornaNumeri, raccontaNumeri, formattaNumero, eNumeroNudo,
  SCOPE_ACCESSO, CAMPI_NUMERI,
  TIMEOUT_MS, HOST_ANTEPRIME, PERIODI, FINESTRE_PAGINA
};
