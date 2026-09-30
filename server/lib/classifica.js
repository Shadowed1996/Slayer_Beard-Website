'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const https = require('node:https');
const crypto = require('node:crypto');

const { P } = require('./percorsi');
const file = require('./file');
const archivio = require('./archivio');
const chiavi = require('./chiavi');
const sondaggi = require('./sondaggi');
const modello = require('./modello');
const auth = require('./autenticazione');
const twitch = require('./twitch');
const { json, erroreHttp } = require('./risposte');

const DIFFICOLTA = ['facile', 'medio', 'difficile', 'estremo'];
const NOMI_DIFFICOLTA = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile', estremo: 'Estremo' };
const FORMATO = 1;
const GETTONE_MS = 2 * 60 * 60 * 1000;
const QUOTA_DURATA = 0.85;
const MAX_LIVELLO = 9999;
const MAX_TENTATIVI = 100000;
const MAX_RIGHE_API = 50;
const MAX_RIGHE_OBS = 25;
const MAX_STAGIONI = 100;
const MAX_VOCI = 20000;
const PROFILO_MS = 6 * 60 * 60 * 1000;
const PROFILO_RIPIEGO_MS = 5 * 60 * 1000;
const MAX_PROFILI = 5000;
const TIMEOUT_MS = 8000;
const FINESTRA_MS = 10 * 60 * 1000;
const AVATAR_PREFISSO = 'https://static-cdn.jtvnw.net/';
const ID_RE = /^\d{1,20}$/;
const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
const STAGIONE_RE = /^s\d{1,6}$/;

const LIMITI = {
  partitaUtente: { max: 40, finestra: FINESTRA_MS },
  partitaIp: { max: 80, finestra: FINESTRA_MS },
  livelloUtente: { max: 40, finestra: FINESTRA_MS },
  livelloIp: { max: 80, finestra: FINESTRA_MS }
};

const PREDEFINITE = { attiva: false, titolo: 'Classifica di Pollo Run', righe: 10, difficoltaObs: 'medio', avatar: true, aggiornaSecondi: 15 };

const CSP_OBS = [
  'default-src \'none\'',
  'script-src \'self\'',
  'style-src \'self\'',
  'img-src \'self\' ' + AVATAR_PREFISSO.replace(/\/$/, '') + ' data:',
  'connect-src \'self\'',
  'base-uri \'none\'',
  'form-action \'none\'',
  'object-src \'none\''
].join('; ');

let orologio = Date.now;
let profiloSostituito = null;
let cercaSostituito = null;
let stato = null;
let caricatoDa = null;
let firmaLetta = null;
let chiave = null;
let chiaveDa = null;
let motore = null;
const profili = new Map();
const colpi = new Map();

function adesso() {
  return orologio();
}

function sostituisciOrologio(fn) {
  orologio = typeof fn === 'function' ? fn : Date.now;
}

function sostituisciCerca(fn) {
  cercaSostituito = typeof fn === 'function' ? fn : null;
}

function sostituisciProfilo(fn) {
  profiloSostituito = typeof fn === 'function' ? fn : null;
  profili.clear();
}

function percorsoDati() {
  return path.join(P.dati, 'classifica.json');
}

function percorsoChiave() {
  return path.join(P.dati, '.classifica-chiave');
}

function oggetto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function intero(v, min, max) {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function testoPulito(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function avatarPulito(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > 300 || s.indexOf(AVATAR_PREFISSO) !== 0) { return ''; }
  if (/[\s"'<>\\`()]/.test(s)) { return ''; }
  return s;
}

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function daB64u(testo) {
  if (typeof testo !== 'string' || !/^[A-Za-z0-9_-]*$/.test(testo)) { return null; }
  return Buffer.from(testo.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function laChiave() {
  const dove = percorsoChiave();
  if (chiave && chiaveDa === dove) { return chiave; }
  let hex = '';
  try { hex = fs.readFileSync(dove, 'utf8').trim(); } catch (e) { hex = ''; }
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    hex = crypto.randomBytes(32).toString('hex');
    file.scriviAtomico(dove, hex + '\n');
    try { fs.chmodSync(dove, 0o600); } catch (e) { }
  }
  chiave = Buffer.from(hex, 'hex');
  chiaveDa = dove;
  return chiave;
}

function firma(tipo, dati) {
  const corpo = b64u(JSON.stringify(dati));
  const mac = crypto.createHmac('sha256', laChiave()).update(tipo + '.' + corpo).digest();
  return corpo + '.' + b64u(mac);
}

function verifica(tipo, valore) {
  if (typeof valore !== 'string' || valore.length > 1000) { return null; }
  const punto = valore.indexOf('.');
  if (punto < 1 || valore.indexOf('.', punto + 1) !== -1) { return null; }
  const corpo = valore.slice(0, punto);
  const mac = daB64u(valore.slice(punto + 1));
  if (!mac || mac.length !== 32) { return null; }
  const atteso = crypto.createHmac('sha256', laChiave()).update(tipo + '.' + corpo).digest();
  if (!crypto.timingSafeEqual(mac, atteso)) { return null; }
  const grezzo = daB64u(corpo);
  if (!grezzo) { return null; }
  try {
    const dati = JSON.parse(grezzo.toString('utf8'));
    return oggetto(dati) ? dati : null;
  } catch (e) { return null; }
}

function stagioneNuova(numero, nome, quando) {
  return { id: 's' + numero, nome: testoPulito(nome, 60) || ('Stagione ' + numero), inizio: new Date(quando).toISOString() };
}

function vociVuote() {
  const voci = {};
  for (const d of DIFFICOLTA) { voci[d] = []; }
  return voci;
}

function vuoto() {
  return {
    formato: FORMATO,
    versione: 0,
    aggiornata: null,
    stagione: stagioneNuova(1, '', adesso()),
    voci: vociVuote(),
    stagioni: [],
    bloccati: [],
    usati: {}
  };
}

function vocePulita(v) {
  if (!oggetto(v) || !ID_RE.test(String(v.id)) || !intero(v.livello, 1, MAX_LIVELLO)) { return null; }
  const login = String(v.login || '').toLowerCase();
  return {
    id: String(v.id),
    login: LOGIN_RE.test(login) ? login : '',
    nome: testoPulito(v.nome, 40),
    avatar: avatarPulito(v.avatar),
    livello: v.livello,
    quando: typeof v.quando === 'string' && !isNaN(Date.parse(v.quando)) ? v.quando : new Date(0).toISOString(),
    tentativi: intero(v.tentativi, 1, MAX_TENTATIVI) ? v.tentativi : 1,
    partite: intero(v.partite, 0, Number.MAX_SAFE_INTEGER) ? v.partite : 0
  };
}

function vociPulite(grezze) {
  const voci = vociVuote();
  if (!oggetto(grezze)) { return voci; }
  for (const d of DIFFICOLTA) {
    const visti = new Set();
    for (const v of Array.isArray(grezze[d]) ? grezze[d] : []) {
      const pulita = vocePulita(v);
      if (!pulita || visti.has(pulita.id)) { continue; }
      visti.add(pulita.id);
      voci[d].push(pulita);
    }
  }
  return voci;
}

function normalizza(letto) {
  const d = vuoto();
  if (!oggetto(letto)) { return d; }
  d.versione = intero(letto.versione, 0, Number.MAX_SAFE_INTEGER) ? letto.versione : 0;
  d.aggiornata = typeof letto.aggiornata === 'string' ? letto.aggiornata : null;
  if (oggetto(letto.stagione) && STAGIONE_RE.test(String(letto.stagione.id))) {
    d.stagione = {
      id: String(letto.stagione.id),
      nome: testoPulito(letto.stagione.nome, 60) || String(letto.stagione.id),
      inizio: typeof letto.stagione.inizio === 'string' ? letto.stagione.inizio : d.stagione.inizio
    };
  }
  d.voci = vociPulite(letto.voci);
  if (Array.isArray(letto.stagioni)) {
    d.stagioni = letto.stagioni.filter((s) => oggetto(s) && STAGIONE_RE.test(String(s.id))).map((s) => ({
      id: String(s.id),
      nome: testoPulito(s.nome, 60) || String(s.id),
      inizio: typeof s.inizio === 'string' ? s.inizio : '',
      fine: typeof s.fine === 'string' ? s.fine : '',
      voci: vociPulite(s.voci)
    })).slice(-MAX_STAGIONI);
  }
  if (Array.isArray(letto.bloccati)) {
    const visti = new Set();
    d.bloccati = letto.bloccati.filter((b) => oggetto(b) && ID_RE.test(String(b.id)) && !visti.has(String(b.id)) && visti.add(String(b.id)))
      .map((b) => ({ id: String(b.id), login: LOGIN_RE.test(String(b.login || '')) ? String(b.login) : '', nome: testoPulito(b.nome, 40) }));
  }
  if (oggetto(letto.usati)) {
    for (const k of Object.keys(letto.usati)) {
      if (/^[0-9a-f]{16}$/.test(k) && intero(letto.usati[k], 0, Number.MAX_SAFE_INTEGER)) { d.usati[k] = letto.usati[k]; }
    }
  }
  return d;
}

function firmaDelFile() {
  try {
    const info = fs.statSync(percorsoDati());
    return info.mtimeMs + ':' + info.size + ':' + info.ino;
  } catch (e) {
    return 'assente';
  }
}

function carica() {
  const dove = percorsoDati();
  const firmaOra = firmaDelFile();
  if (stato && caricatoDa === dove && firmaOra === firmaLetta) { return stato; }
  caricatoDa = dove;
  firmaLetta = firmaOra;
  const grezzo = file.leggiSeEsiste(dove);
  if (grezzo === null) { stato = vuoto(); return stato; }
  try {
    stato = normalizza(JSON.parse(grezzo.replace(/^\ufeff/, '')));
  } catch (e) {
    const daParte = dove + '.rotto-' + Date.now();
    try { fs.renameSync(dove, daParte); } catch (err) { }
    console.error('[classifica] ' + dove + ' non si legge, messo da parte in ' + daParte + ': ' + e.message);
    stato = vuoto();
    firmaLetta = firmaDelFile();
  }
  return stato;
}

function potaUsati(d) {
  const ora = adesso();
  for (const k of Object.keys(d.usati)) { if (d.usati[k] <= ora) { delete d.usati[k]; } }
}

function salva() {
  const d = carica();
  potaUsati(d);
  d.versione += 1;
  d.aggiornata = new Date(adesso()).toISOString();
  file.scriviAtomico(percorsoDati(), JSON.stringify(d, null, 1) + '\n');
  firmaLetta = firmaDelFile();
}

function impostazioni() {
  let ramo = null;
  try { ramo = archivio.leggi().config.classifica; } catch (e) { ramo = null; }
  const c = oggetto(ramo) ? ramo : {};
  const numero = (v, min, max, predefinito) => (intero(v, min, max) ? v : predefinito);
  const titolo = typeof c.titolo === 'string' ? testoPulito(c.titolo, 60) : '';
  return {
    attiva: c.attiva === true,
    titolo: titolo || PREDEFINITE.titolo,
    righe: numero(c.righe, 3, 25, PREDEFINITE.righe),
    difficoltaObs: DIFFICOLTA.indexOf(c.difficoltaObs) !== -1 || c.difficoltaObs === 'tutte' ? c.difficoltaObs : PREDEFINITE.difficoltaObs,
    avatar: c.avatar !== false,
    aggiornaSecondi: numero(c.aggiornaSecondi, 5, 60, PREDEFINITE.aggiornaSecondi)
  };
}

function caricaMotore() {
  const dove = P.scriptPolloRun;
  let info;
  try { info = fs.statSync(dove); } catch (e) { return null; }
  const firmaMotore = dove + ':' + info.mtimeMs + ':' + info.size;
  if (motore && motore.firma === firmaMotore) { return motore.parametri; }
  let parametri = null;
  try {
    const testo = fs.readFileSync(dove, 'utf8');
    const contesto = vm.createContext({ window: {} });
    vm.runInContext(testo, contesto, { filename: 'pollorun-gioco.js', timeout: 2000 });
    const livelli = contesto.window.PolloRun && contesto.window.PolloRun.livelli;
    if (!livelli || typeof livelli.parametri !== 'function') { throw new Error('manca PolloRun.livelli.parametri'); }
    parametri = livelli.parametri;
  } catch (e) {
    console.error('[classifica] il motore di Pollo Run non si carica: ' + (e && e.message ? e.message : e));
    parametri = null;
  }
  motore = { firma: firmaMotore, parametri: parametri };
  return parametri;
}

function durataLivello(n, difficolta) {
  const parametri = caricaMotore();
  if (!parametri) { throw erroreHttp(503, 'La classifica non riesce a leggere i livelli del gioco: riprova più tardi.', { codice: 'MOTORE' }); }
  let durata = NaN;
  try { durata = Number(parametri(n, difficolta).durata); } catch (e) { durata = NaN; }
  if (!Number.isFinite(durata) || durata <= 0) {
    throw erroreHttp(503, 'La classifica non riesce a leggere la durata del livello: riprova più tardi.', { codice: 'MOTORE' });
  }
  return durata;
}

function ammesso(chiaveLimite, limite) {
  const ora = adesso();
  const lista = (colpi.get(chiaveLimite) || []).filter((t) => ora - t < limite.finestra);
  if (lista.length >= limite.max) { colpi.set(chiaveLimite, lista); return false; }
  lista.push(ora);
  colpi.set(chiaveLimite, lista);
  if (colpi.size > 20000) {
    for (const [k, v] of colpi) { if (!v.length || ora - v[v.length - 1] >= FINESTRA_MS) { colpi.delete(k); } }
  }
  return true;
}

function freno(req, idUtente, suUtente, suIp) {
  const ip = auth.indirizzoRichiesta(req);
  const perIp = ammesso(suIp + ':' + ip, LIMITI[suIp]);
  const perUtente = ammesso(suUtente + ':' + idUtente, LIMITI[suUtente]);
  if (!perIp || !perUtente) {
    throw erroreHttp(429, 'Troppe richieste in poco tempo: riprova fra qualche minuto.', { codice: 'TROPPE_RICHIESTE' });
  }
}

function clientIdSito() {
  try {
    const conf = archivio.leggi().config.account;
    if (conf && typeof conf.clientId === 'string' && conf.clientId.trim()) { return conf.clientId.trim(); }
  } catch (e) { }
  return chiavi.clientId() || '';
}

function chiediProfilo(token, clientId) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request({
      method: 'GET',
      hostname: 'api.twitch.tv',
      path: '/helix/users',
      headers: { Authorization: 'Bearer ' + token, 'Client-Id': clientId }
    }, (risposta) => {
      const pezzi = [];
      risposta.on('data', (p) => pezzi.push(p));
      risposta.on('end', () => {
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) { rifiuta(new Error('Twitch ha risposto ' + risposta.statusCode)); return; }
        try {
          const dati = JSON.parse(Buffer.concat(pezzi).toString('utf8'));
          risolvi(dati && Array.isArray(dati.data) && dati.data[0] ? dati.data[0] : null);
        } catch (e) { rifiuta(e); }
      });
    });
    richiesta.setTimeout(TIMEOUT_MS, () => richiesta.destroy(new Error('Twitch non ha risposto in tempo.')));
    richiesta.on('error', rifiuta);
    richiesta.end();
  });
}

async function profiloDi(token, utente) {
  const memorizzato = profili.get(utente.id);
  if (memorizzato && memorizzato.scade > Date.now()) { return memorizzato.profilo; }
  let grezzo = null;
  try {
    if (profiloSostituito) { grezzo = await profiloSostituito(token, utente); }
    else {
      const cid = clientIdSito();
      grezzo = cid ? await chiediProfilo(token, cid) : null;
    }
  } catch (e) { grezzo = null; }
  const buono = oggetto(grezzo) && String(grezzo.id || utente.id) === utente.id;
  const profilo = {
    nome: buono ? testoPulito(grezzo.display_name, 40) : '',
    avatar: buono ? avatarPulito(grezzo.profile_image_url) : ''
  };
  if (profili.size >= MAX_PROFILI) { profili.clear(); }
  profili.set(utente.id, { profilo: profilo, scade: Date.now() + (buono ? PROFILO_MS : PROFILO_RIPIEGO_MS) });
  return profilo;
}

async function giocatore(req, obbligatorio) {
  const token = sondaggi.tokenDa(req);
  if (!token) {
    if (obbligatorio) { throw erroreHttp(401, 'Per entrare in classifica collegati con Twitch.', { codice: 'NON_COLLEGATO' }); }
    return null;
  }
  let utente;
  try { utente = await sondaggi.verificaToken(token); } catch (e) {
    if (!obbligatorio && (e.stato === 401 || e.stato === 503)) { return null; }
    if (e.stato === 401) { e.codice = 'NON_COLLEGATO'; }
    throw e;
  }
  const id = String(utente.id);
  const login = String(utente.login || '').toLowerCase();
  if (!ID_RE.test(id)) { throw erroreHttp(401, 'Il collegamento con Twitch non è valido: ricollegati.', { codice: 'NON_COLLEGATO' }); }
  const profilo = await profiloDi(token, { id: id, login: login });
  return {
    id: id,
    login: LOGIN_RE.test(login) ? login : '',
    nome: profilo.nome || login,
    avatar: profilo.avatar
  };
}

function bloccato(d, id) {
  return d.bloccati.some((b) => b.id === id);
}

function ordina(a, b) {
  if (b.livello !== a.livello) { return b.livello - a.livello; }
  const qa = Date.parse(a.quando) || 0;
  const qb = Date.parse(b.quando) || 0;
  if (qa !== qb) { return qa - qb; }
  return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
}

function elencoDi(d, difficolta) {
  return d.voci[difficolta].filter((v) => !bloccato(d, v.id)).slice().sort(ordina);
}

function migliore(d, difficolta, id) {
  const voce = d.voci[difficolta].find((v) => v.id === id);
  return voce ? voce.livello : 0;
}

function rigaPubblica(v, i) {
  return { pos: i + 1, nome: v.nome || v.login, login: v.login, avatar: v.avatar, livello: v.livello, quando: v.quando };
}

function leggiDifficolta(valore, conTutte) {
  if (DIFFICOLTA.indexOf(valore) !== -1) { return valore; }
  if (conTutte && valore === 'tutte') { return valore; }
  return null;
}

function leggiNumero(grezzo, min, max, predefinito) {
  if (grezzo === null || grezzo === undefined || grezzo === '') { return predefinito; }
  const v = Number(grezzo);
  if (!Number.isFinite(v)) { return predefinito; }
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function vista(difficolta, n) {
  const d = carica();
  const imp = impostazioni();
  const base = { attiva: imp.attiva, titolo: imp.titolo, difficolta: difficolta, aggiornata: d.aggiornata };
  if (difficolta === 'tutte') {
    const gruppi = {};
    const totali = {};
    for (const x of DIFFICOLTA) {
      const elenco = elencoDi(d, x);
      totali[x] = elenco.length;
      gruppi[x] = elenco.slice(0, n).map(rigaPubblica);
    }
    return Object.assign(base, { totali: totali, gruppi: gruppi });
  }
  const elenco = elencoDi(d, difficolta);
  return Object.assign(base, { totale: elenco.length, righe: elenco.slice(0, n).map(rigaPubblica) });
}

function etagDi(parti) {
  const d = carica();
  const impronta = crypto.createHash('sha1')
    .update(JSON.stringify([d.versione, firmaLetta, parti, impostazioni()]))
    .digest('hex').slice(0, 16);
  return '"cl-' + impronta + '"';
}

function nonCambiato(req, etag) {
  const chiesto = String(req.headers['if-none-match'] || '');
  return !!chiesto && chiesto.split(',').some((x) => x.trim().replace(/^W\//, '') === etag);
}

function rottaElenco(req, res, url) {
  const imp = impostazioni();
  const q = url.searchParams;
  const difficolta = q.has('difficolta') && q.get('difficolta') !== '' ? leggiDifficolta(q.get('difficolta'), true) : 'medio';
  if (!difficolta) { throw erroreHttp(400, 'Difficoltà sconosciuta: sono facile, medio, difficile, estremo o tutte.', { codice: 'DATI_NON_VALIDI' }); }
  const n = leggiNumero(q.get('n'), 1, MAX_RIGHE_API, imp.righe);
  const etag = etagDi([difficolta, n]);
  const testa = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (nonCambiato(req, etag)) {
    res.writeHead(304, testa);
    res.end();
    return;
  }
  json(res, 200, vista(difficolta, n), testa);
}

async function rottaIo(req, res) {
  const token = sondaggi.tokenDa(req);
  if (token && !sondaggi.inCache(token) && !auth.autenticato(req)) {
    const attesa = auth.frenoScritture(req);
    if (attesa > 0) { throw erroreHttp(429, 'Troppe richieste da questo indirizzo: riprova fra poco.', { codice: 'TROPPE_RICHIESTE' }); }
  }
  const u = await giocatore(req, false);
  if (!u) { json(res, 200, { collegato: false }); return; }
  const d = carica();
  const migliori = {};
  for (const x of DIFFICOLTA) { migliori[x] = migliore(d, x, u.id); }
  json(res, 200, {
    collegato: true, login: u.login, nome: u.nome, avatar: u.avatar,
    migliori: migliori, bloccato: bloccato(d, u.id), attiva: impostazioni().attiva
  });
}

function controllaAccesa() {
  if (!impostazioni().attiva) { throw erroreHttp(404, 'La classifica di Pollo Run è spenta.', { codice: 'SPENTA' }); }
}

function controllaNonBloccato(d, u) {
  if (bloccato(d, u.id)) { throw erroreHttp(403, 'Questo account non può entrare in classifica.', { codice: 'BLOCCATO' }); }
}

async function rottaPartita(req, res, corpo) {
  controllaAccesa();
  const u = await giocatore(req, true);
  const d = carica();
  controllaNonBloccato(d, u);
  freno(req, u.id, 'partitaUtente', 'partitaIp');
  const difficolta = leggiDifficolta(corpo.difficolta, false);
  if (!difficolta || !intero(corpo.livello, 1, MAX_LIVELLO)) {
    throw erroreHttp(400, 'Servono un livello (numero intero da 1) e una difficoltà valida.', { codice: 'DATI_NON_VALIDI' });
  }
  const n = corpo.livello;
  if (n > 1 && migliore(d, difficolta, u.id) < n - 1) {
    throw erroreHttp(409, 'Per entrare in classifica col livello ' + n + ' devi prima completare il livello ' + (n - 1) + ' collegato.',
      { codice: 'SERVE_PRECEDENTE', serve: n - 1 });
  }
  durataLivello(n, difficolta);
  const t = adesso();
  const gettone = firma('partita', { u: u.id, d: difficolta, n: n, t: t, r: crypto.randomBytes(8).toString('hex') });
  json(res, 200, { partita: gettone, scade: new Date(t + GETTONE_MS).toISOString() });
}

function gettoneNonValido() {
  return erroreHttp(422, 'Questa partita non è valida: ricomincia il livello.', { codice: 'GETTONE_NON_VALIDO' });
}

async function rottaLivello(req, res, corpo) {
  controllaAccesa();
  const u = await giocatore(req, true);
  let d = carica();
  controllaNonBloccato(d, u);
  freno(req, u.id, 'livelloUtente', 'livelloIp');
  if (typeof corpo.partita !== 'string' || !corpo.partita) {
    throw erroreHttp(400, 'Manca la partita da registrare.', { codice: 'DATI_NON_VALIDI' });
  }
  if (corpo.tentativi !== undefined && corpo.tentativi !== null && !intero(corpo.tentativi, 1, MAX_TENTATIVI)) {
    throw erroreHttp(400, 'Il numero di tentativi deve essere un intero da 1 a ' + MAX_TENTATIVI + '.', { codice: 'DATI_NON_VALIDI' });
  }
  const tentativi = intero(corpo.tentativi, 1, MAX_TENTATIVI) ? corpo.tentativi : 1;
  const g = verifica('partita', corpo.partita);
  if (!g || typeof g.u !== 'string' || !leggiDifficolta(g.d, false) || !intero(g.n, 1, MAX_LIVELLO) ||
      !intero(g.t, 0, Number.MAX_SAFE_INTEGER) || typeof g.r !== 'string' || !/^[0-9a-f]{16}$/.test(g.r)) {
    throw gettoneNonValido();
  }
  if (g.u !== u.id) { throw gettoneNonValido(); }
  const ora = adesso();
  if (g.t + GETTONE_MS <= ora) {
    throw erroreHttp(422, 'Questa partita è scaduta: va registrata entro 2 ore dall\'inizio del livello.', { codice: 'GETTONE_SCADUTO' });
  }
  if (Object.prototype.hasOwnProperty.call(d.usati, g.r)) {
    throw erroreHttp(409, 'Questo livello è già stato registrato.', { codice: 'GETTONE_USATO' });
  }
  const durata = durataLivello(g.n, g.d);
  if (ora - g.t < QUOTA_DURATA * durata * 1000) {
    throw erroreHttp(422, 'Troppo veloce: il livello ' + g.n + ' non si può finire così presto.', { codice: 'TROPPO_VELOCE' });
  }
  d = carica();
  if (g.n > 1 && migliore(d, g.d, u.id) < g.n - 1) {
    throw erroreHttp(409, 'Per entrare in classifica col livello ' + g.n + ' devi prima completare il livello ' + (g.n - 1) + ' collegato.',
      { codice: 'SERVE_PRECEDENTE', serve: g.n - 1 });
  }

  d.usati[g.r] = g.t + GETTONE_MS;
  const quando = new Date(ora).toISOString();
  let voce = d.voci[g.d].find((v) => v.id === u.id);
  let meglio = false;
  if (!voce) {
    voce = { id: u.id, login: u.login, nome: u.nome, avatar: u.avatar, livello: g.n, quando: quando, tentativi: tentativi, partite: 0 };
    d.voci[g.d].push(voce);
    meglio = true;
  } else if (g.n > voce.livello) {
    voce.livello = g.n;
    voce.quando = quando;
    voce.tentativi = tentativi;
    meglio = true;
  }
  voce.login = u.login;
  voce.nome = u.nome;
  voce.avatar = u.avatar;
  voce.partite += 1;
  if (d.voci[g.d].length > MAX_VOCI) {
    d.voci[g.d].sort(ordina);
    d.voci[g.d].length = MAX_VOCI;
  }
  salva();

  const elenco = elencoDi(d, g.d);
  json(res, 200, {
    difficolta: g.d,
    livello: g.n,
    migliore: meglio,
    record: voce.livello,
    posizione: elenco.findIndex((v) => v.id === u.id) + 1,
    totale: elenco.length
  });
}

function rigaObs(v, conAvatar) {
  return {
    pos: v.pos,
    nome: v.nome,
    login: v.login,
    livello: v.livello,
    conAvatar: conAvatar,
    avatar: conAvatar ? v.avatar : '',
    classe: v.pos <= 3 ? ' obs__riga--' + v.pos : ''
  };
}

function leggiModelloObs() {
  const dove = path.join(P.modelli, 'classifica-obs.html');
  if (!file.eFile(dove)) { throw erroreHttp(500, 'Manca il modello dell\'overlay (modelli/classifica-obs.html).'); }
  return dove;
}

function rottaObs(req, res, url) {
  const imp = impostazioni();
  const q = url.searchParams;
  const difficolta = q.has('difficolta') && q.get('difficolta') !== '' ? leggiDifficolta(q.get('difficolta'), true) : imp.difficoltaObs;
  if (!difficolta) { throw erroreHttp(400, 'Difficoltà sconosciuta: sono facile, medio, difficile, estremo o tutte.', { codice: 'DATI_NON_VALIDI' }); }
  const righe = leggiNumero(q.get('righe'), 1, MAX_RIGHE_OBS, imp.righe);
  const conTitolo = q.get('titolo') !== '0';
  const conAvatar = q.get('avatar') === '0' ? false : (q.get('avatar') === '1' ? true : imp.avatar);
  const dati = vista(difficolta, righe);
  const elenchi = difficolta === 'tutte' ? DIFFICOLTA.map((x) => [x, dati.gruppi[x]]) : [[difficolta, dati.righe]];
  const colonne = elenchi.map(([x, elenco]) => ({
    chiave: x,
    etichetta: NOMI_DIFFICOLTA[x],
    righe: elenco.map((v) => rigaObs(v, conAvatar)),
    vuota: elenco.length === 0
  }));
  const api = '/api/classifica?difficolta=' + encodeURIComponent(difficolta) + '&n=' + righe;
  const html = modello.rendiFile(leggiModelloObs(), {
    obs: {
      titolo: imp.titolo,
      conTitolo: conTitolo,
      difficolta: difficolta,
      tutte: difficolta === 'tutte',
      righe: String(righe),
      aggiorna: String(imp.aggiornaSecondi),
      avatar: conAvatar ? '1' : '0',
      api: api,
      colonne: colonne
    }
  }, { file: 'modelli/classifica-obs.html', cartella: P.modelli });
  const buf = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP_OBS
  });
  if (req.method === 'HEAD') { res.end(); return; }
  res.end(buf);
}

function vistaGestione() {
  const d = carica();
  const voci = {};
  for (const x of DIFFICOLTA) {
    voci[x] = d.voci[x].slice().sort(ordina).map((v) => Object.assign({}, v, { bloccato: bloccato(d, v.id) }));
  }
  return {
    impostazioni: impostazioni(),
    difficolta: DIFFICOLTA.slice(),
    overlay: '/api/classifica/obs',
    versione: d.versione,
    aggiornata: d.aggiornata,
    stagione: Object.assign({}, d.stagione),
    voci: voci,
    bloccati: d.bloccati.map((b) => Object.assign({}, b)),
    stagioni: d.stagioni.slice().reverse().map((s) => {
      const totali = {};
      for (const x of DIFFICOLTA) { totali[x] = s.voci[x].length; }
      const copia = {};
      for (const x of DIFFICOLTA) { copia[x] = s.voci[x].slice().sort(ordina); }
      return { id: s.id, nome: s.nome, inizio: s.inizio, fine: s.fine, totali: totali, voci: copia };
    })
  };
}

function idDa(valore) {
  const id = String(valore == null ? '' : valore);
  if (!ID_RE.test(id)) { throw erroreHttp(400, 'Serve l\'id Twitch (numerico) del giocatore.', { codice: 'DATI_NON_VALIDI' }); }
  return id;
}

function togli(corpo) {
  const difficolta = leggiDifficolta(corpo.difficolta, false);
  if (!difficolta) { throw erroreHttp(400, 'Difficoltà sconosciuta: sono facile, medio, difficile o estremo.', { codice: 'DATI_NON_VALIDI' }); }
  const id = idDa(corpo.id);
  const d = carica();
  const prima = d.voci[difficolta].length;
  d.voci[difficolta] = d.voci[difficolta].filter((v) => v.id !== id);
  if (d.voci[difficolta].length === prima) { throw erroreHttp(404, 'Questo giocatore non è nella classifica ' + difficolta + '.', { codice: 'DATI_NON_VALIDI' }); }
  salva();
  return vistaGestione();
}

function voceNota(d, id, login) {
  for (const x of DIFFICOLTA) {
    const v = d.voci[x].find((w) => (id && w.id === id) || (login && w.login === login));
    if (v) { return v; }
  }
  const b = d.bloccati.find((w) => (id && w.id === id) || (login && w.login === login));
  return b ? { id: b.id, login: b.login, nome: b.nome, avatar: '' } : null;
}

async function cercaSuTwitch(login) {
  let grezzo = null;
  try {
    if (cercaSostituito) { grezzo = await cercaSostituito(login); }
    else {
      if (!twitch.configurato()) {
        throw erroreHttp(503, 'Per aggiungere un giocatore nuovo servono le chiavi Twitch del sito (Client ID e Client Secret).', { codice: 'TWITCH_NON_CONFIGURATO' });
      }
      const risposta = await twitch.helix('/users?login=' + encodeURIComponent(login));
      grezzo = risposta && Array.isArray(risposta.data) ? risposta.data[0] || null : null;
    }
  } catch (e) {
    if (e.stato) { throw e; }
    throw erroreHttp(502, 'Twitch ora non risponde: riprova fra poco.', { codice: 'TWITCH_NON_RISPONDE' });
  }
  if (!oggetto(grezzo) || !ID_RE.test(String(grezzo.id || ''))) {
    throw erroreHttp(404, 'Su Twitch non esiste nessun utente «' + login + '».', { codice: 'DATI_NON_VALIDI' });
  }
  return {
    id: String(grezzo.id),
    login: String(grezzo.login || login).toLowerCase(),
    nome: testoPulito(grezzo.display_name, 40),
    avatar: avatarPulito(grezzo.profile_image_url)
  };
}

async function imposta(corpo) {
  const difficolta = leggiDifficolta(corpo.difficolta, false);
  if (!difficolta) { throw erroreHttp(400, 'Difficoltà sconosciuta: sono facile, medio, difficile o estremo.', { codice: 'DATI_NON_VALIDI' }); }
  if (!intero(corpo.livello, 1, MAX_LIVELLO)) { throw erroreHttp(400, 'Serve il livello: un numero intero da 1 a ' + MAX_LIVELLO + '.', { codice: 'DATI_NON_VALIDI' }); }
  const conId = corpo.id !== undefined && corpo.id !== null && corpo.id !== '';
  const id = conId ? idDa(corpo.id) : '';
  const login = conId ? '' : String(corpo.login || '').trim().replace(/^@/, '').toLowerCase();
  if (!conId && !LOGIN_RE.test(login)) { throw erroreHttp(400, 'Serve il nome Twitch del giocatore (lettere, numeri e _).', { codice: 'DATI_NON_VALIDI' }); }
  let d = carica();
  let chi = voceNota(d, id, login);
  if (!chi && conId) { throw erroreHttp(404, 'Non conosco questo giocatore: aggiungilo col suo nome Twitch.', { codice: 'DATI_NON_VALIDI' }); }
  if (!chi) { chi = await cercaSuTwitch(login); }
  d = carica();
  const voce = d.voci[difficolta].find((v) => v.id === chi.id);
  const quando = new Date(adesso()).toISOString();
  if (voce) {
    if (voce.livello === corpo.livello) {
      throw erroreHttp(400, 'È già al livello ' + voce.livello + ' in questa classifica.', { codice: 'DATI_NON_VALIDI' });
    }
    voce.livello = corpo.livello;
    voce.quando = quando;
  } else {
    if (d.voci[difficolta].length >= MAX_VOCI) { throw erroreHttp(409, 'Questa classifica è piena.', { codice: 'PIENA' }); }
    d.voci[difficolta].push({ id: chi.id, login: chi.login || '', nome: chi.nome || '', avatar: chi.avatar || '', livello: corpo.livello, quando: quando, tentativi: 1, partite: 0 });
  }
  salva();
  return vistaGestione();
}

function blocca(corpo) {
  const id = idDa(corpo.id);
  if (typeof corpo.blocca !== 'boolean') { throw erroreHttp(400, 'Serve «blocca»: true per bloccare, false per sbloccare.', { codice: 'DATI_NON_VALIDI' }); }
  const d = carica();
  if (corpo.blocca) {
    if (!bloccato(d, id)) {
      let noto = null;
      for (const x of DIFFICOLTA) { noto = noto || d.voci[x].find((v) => v.id === id) || null; }
      d.bloccati.push({ id: id, login: noto ? noto.login : '', nome: noto ? noto.nome : '' });
    }
  } else {
    d.bloccati = d.bloccati.filter((b) => b.id !== id);
  }
  salva();
  return vistaGestione();
}

function nuovaStagione(corpo) {
  const d = carica();
  const ora = new Date(adesso()).toISOString();
  let massimo = Number(d.stagione.id.slice(1)) || 1;
  for (const s of d.stagioni) { massimo = Math.max(massimo, Number(s.id.slice(1)) || 0); }
  d.stagioni.push({ id: d.stagione.id, nome: d.stagione.nome, inizio: d.stagione.inizio, fine: ora, voci: d.voci });
  if (d.stagioni.length > MAX_STAGIONI) { d.stagioni = d.stagioni.slice(-MAX_STAGIONI); }
  d.stagione = stagioneNuova(massimo + 1, corpo && corpo.nome, adesso());
  d.voci = vociVuote();
  salva();
  return vistaGestione();
}

function dimentica() {
  stato = null;
  caricatoDa = null;
  firmaLetta = null;
  chiave = null;
  chiaveDa = null;
  motore = null;
  profili.clear();
  colpi.clear();
}

module.exports = {
  rottaElenco, rottaIo, rottaPartita, rottaLivello, rottaObs,
  vistaGestione, togli, imposta, blocca, nuovaStagione, sostituisciCerca,
  durataLivello, impostazioni, verifica, firma,
  sostituisciOrologio, sostituisciProfilo, dimentica, percorsoDati, percorsoChiave,
  DIFFICOLTA, GETTONE_MS, QUOTA_DURATA, LIMITI, CSP_OBS
};
