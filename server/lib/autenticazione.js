'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const { P } = require('./percorsi');
const { scriviAtomico, assicuraCartella } = require('./file');
const { erroreHttp } = require('./risposte');

const NOME_COOKIE = 'sb_sessione';
const DURATA_SESSIONE_MS = 12 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
const MAX_TENTATIVI = 5;
const FINESTRA_TENTATIVI_MS = 15 * 60 * 1000;

const SCRYPT = { N: 16384, r: 8, p: 1, lunghezza: 64 };

const sessioni = new Map();
const tentativi = new Map();
const letto = { firma: '' };
const firmaAuth = { stato: '', valore: '' };
const FORMA_ID = /^[0-9a-f]{64}$/;

function dietroProxy() {
  const dichiarato = String(process.env.SB_DIETRO_PROXY || '').trim().toLowerCase();
  return dichiarato === '1' || dichiarato === 'si' || dichiarato === 'true';
}

function ultimoSalto(valore) {
  if (Array.isArray(valore)) { return valore.length ? ultimoSalto(valore[valore.length - 1]) : ''; }
  if (typeof valore !== 'string' || !valore.trim()) { return ''; }
  const pezzi = valore.split(',');
  return pezzi[pezzi.length - 1].trim();
}

function normalizzaIp(grezzo) {
  let ip = String(grezzo == null ? '' : grezzo).trim();
  if (!ip) { return ''; }
  const fraQuadre = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (fraQuadre) { ip = fraQuadre[1]; }
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) { ip = ip.slice(0, ip.indexOf(':')); }
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(ip)) { ip = ip.slice('::ffff:'.length); }
  return ip.toLowerCase();
}

function indirizzoRichiesta(req) {
  if (dietroProxy()) {
    const ultimo = normalizzaIp(ultimoSalto(req.headers['x-forwarded-for']));
    if (ultimo) { return ultimo; }
  }
  return normalizzaIp(req.socket && req.socket.remoteAddress) || 'sconosciuto';
}

const RETI_LOCALI = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./
];

function indirizzoLocale(ip) {
  const pulito = normalizzaIp(ip);
  if (!pulito) { return false; }
  if (pulito.indexOf(':') !== -1) {
    if (pulito === '::1' || pulito === '0:0:0:0:0:0:0:1') { return true; }
    return /^f[cd][0-9a-f]{2}:/.test(pulito) || /^fe[89ab][0-9a-f]:/.test(pulito);
  }
  return RETI_LOCALI.some((rete) => rete.test(pulito));
}

function richiestaLocale(req) {
  return indirizzoLocale(indirizzoRichiesta(req));
}

function calcolaHash(password, saleHex) {
  return crypto.scryptSync(Buffer.from(String(password), 'utf8'), Buffer.from(saleHex, 'hex'), SCRYPT.lunghezza, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024
  });
}

function leggiAuth() {
  try {
    const dati = JSON.parse(fs.readFileSync(P.auth, 'utf8'));
    if (!dati || typeof dati.sale !== 'string' || typeof dati.hash !== 'string') { return null; }
    return dati;
  } catch (e) {
    return null;
  }
}

function esistePassword() {
  return leggiAuth() !== null;
}

function impostaPassword(password, opzioni) {
  const testo = String(password == null ? '' : password);
  if (testo.length < MIN_PASSWORD) {
    throw erroreHttp(400, 'La password deve essere lunga almeno ' + MIN_PASSWORD + ' caratteri.');
  }
  const sale = crypto.randomBytes(16).toString('hex');
  assicuraCartella(P.dati);
  scriviAtomico(P.auth, JSON.stringify({
    sale: sale,
    hash: calcolaHash(testo, sale).toString('hex'),
    creataIl: new Date().toISOString()
  }, null, 2) + '\n');
  firmaAuth.stato = '';
  caricaDaDisco();
  const chiave = opzioni && FORMA_ID.test(String(opzioni.tieni || '')) ? impronta(opzioni.tieni) : null;
  const tieni = chiave ? sessioni.get(chiave) : null;
  sessioni.clear();
  if (tieni && tieni.scadenza > Date.now()) { sessioni.set(chiave, { scadenza: tieni.scadenza, password: firmaPassword() }); }
  salvaSuDisco();
}

function passwordCorretta(password) {
  const dati = leggiAuth();
  if (!dati) { return false; }
  let atteso;
  let calcolato;
  try {
    atteso = Buffer.from(dati.hash, 'hex');
    calcolato = calcolaHash(password, dati.sale);
  } catch (e) { return false; }
  if (calcolato.length !== atteso.length) { return false; }
  return crypto.timingSafeEqual(calcolato, atteso);
}

function statoFile(percorso) {
  try {
    const stato = fs.statSync(percorso);
    return percorso + ':' + stato.mtimeMs + ':' + stato.size;
  } catch (e) {
    return percorso + ':assente';
  }
}

function impronta(id) {
  return crypto.createHash('sha256').update('sb-sessione:' + String(id)).digest('hex');
}

function firmaPassword() {
  const stato = statoFile(P.auth);
  if (stato !== firmaAuth.stato) {
    const dati = leggiAuth();
    firmaAuth.valore = dati
      ? crypto.createHash('sha256').update('sb-password:' + dati.sale + ':' + dati.hash).digest('hex').slice(0, 32)
      : '';
    firmaAuth.stato = stato;
  }
  return firmaAuth.valore;
}

function caricaDaDisco() {
  const firma = statoFile(P.sessioni);
  if (firma === letto.firma) { return; }
  let grezzo = null;
  try {
    grezzo = fs.readFileSync(P.sessioni, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') { return; }
  }
  let dati = null;
  if (grezzo !== null) {
    try { dati = JSON.parse(grezzo); } catch (e) { dati = null; }
  }
  const elenco = dati && dati.sessioni && typeof dati.sessioni === 'object' ? dati.sessioni : {};
  const adesso = Date.now();
  sessioni.clear();
  for (const chiave of Object.keys(elenco)) {
    const voce = elenco[chiave];
    if (!FORMA_ID.test(chiave) || !voce || typeof voce !== 'object') { continue; }
    const scadenza = Number(voce.scadenza);
    if (!Number.isFinite(scadenza) || scadenza <= adesso || scadenza > adesso + DURATA_SESSIONE_MS) { continue; }
    sessioni.set(chiave, { scadenza: scadenza, password: typeof voce.password === 'string' ? voce.password : '' });
  }
  letto.firma = firma;
}

let avvisatoDisco = false;

function salvaSuDisco() {
  const elenco = {};
  for (const [chiave, sessione] of sessioni) {
    elenco[chiave] = { scadenza: sessione.scadenza, password: sessione.password };
  }
  try {
    scriviAtomico(P.sessioni, JSON.stringify({ sessioni: elenco }) + '\n');
    letto.firma = statoFile(P.sessioni);
    avvisatoDisco = false;
  } catch (e) {
    if (avvisatoDisco) { return; }
    avvisatoDisco = true;
    console.error('  Non riesco a salvare le sessioni del pannello in ' + P.sessioni + ': ' +
      (e && e.message ? e.message : e) + '. Restano solo in memoria finche il server non si riavvia.');
  }
}

function pulisci() {
  const adesso = Date.now();
  for (const [id, sessione] of sessioni) {
    if (sessione.scadenza <= adesso) { sessioni.delete(id); }
  }
}

function creaSessione() {
  caricaDaDisco();
  pulisci();
  const id = crypto.randomBytes(32).toString('hex');
  sessioni.set(impronta(id), { scadenza: Date.now() + DURATA_SESSIONE_MS, password: firmaPassword() });
  salvaSuDisco();
  return id;
}

function leggiCookie(req) {
  const grezzo = req.headers.cookie;
  if (!grezzo) { return {}; }
  const fuori = {};
  for (const pezzo of grezzo.split(';')) {
    const uguale = pezzo.indexOf('=');
    if (uguale === -1) { continue; }
    const nome = pezzo.slice(0, uguale).trim();
    if (nome) { fuori[nome] = pezzo.slice(uguale + 1).trim(); }
  }
  return fuori;
}

function idSessione(req) {
  return leggiCookie(req)[NOME_COOKIE] || null;
}

function autenticato(req) {
  const id = leggiCookie(req)[NOME_COOKIE];
  if (!id || !FORMA_ID.test(id)) { return false; }
  caricaDaDisco();
  const chiave = impronta(id);
  const sessione = sessioni.get(chiave);
  if (!sessione) { return false; }
  if (sessione.scadenza <= Date.now()) { sessioni.delete(chiave); return false; }
  return !!sessione.password && sessione.password === firmaPassword();
}

function chiudiSessione(req) {
  const id = leggiCookie(req)[NOME_COOKIE];
  if (!id || !FORMA_ID.test(id)) { return; }
  caricaDaDisco();
  if (sessioni.delete(impronta(id))) { salvaSuDisco(); }
}

function inHttps(req) {
  if (req.socket && req.socket.encrypted) { return true; }
  if (!dietroProxy()) { return false; }
  return ultimoSalto(req.headers['x-forwarded-proto']).toLowerCase() === 'https';
}

function cookieSessione(req, id) {
  const pezzi = [
    NOME_COOKIE + '=' + id, 'HttpOnly', 'SameSite=Strict', 'Path=/',
    'Max-Age=' + Math.floor(DURATA_SESSIONE_MS / 1000)
  ];
  if (inHttps(req)) { pezzi.push('Secure'); }
  return pezzi.join('; ');
}

function cookieScaduto(req) {
  const pezzi = [NOME_COOKIE + '=', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
  if (inHttps(req)) { pezzi.push('Secure'); }
  return pezzi.join('; ');
}

function chiaveTentativi(req, ambito) {
  const ip = indirizzoRichiesta(req);
  return ambito ? ambito + ':' + ip : ip;
}

function attesaResidua(req, ambito) {
  const chiave = chiaveTentativi(req, ambito);
  const voce = tentativi.get(chiave);
  if (!voce) { return 0; }
  if (voce.scadenza <= Date.now()) { tentativi.delete(chiave); return 0; }
  return voce.conteggio >= MAX_TENTATIVI ? voce.scadenza - Date.now() : 0;
}

function registraFallimento(req, ambito) {
  const chiave = chiaveTentativi(req, ambito);
  const adesso = Date.now();
  const voce = tentativi.get(chiave);
  if (!voce || voce.scadenza <= adesso) {
    tentativi.set(chiave, { conteggio: 1, scadenza: adesso + FINESTRA_TENTATIVI_MS });
    return;
  }
  voce.conteggio += 1;
}

function azzeraTentativi(req, ambito) {
  tentativi.delete(chiaveTentativi(req, ambito));
}

const FINESTRA_SCRITTURE_MS = 60 * 1000;
const MAX_SCRITTURE_ANONIME = 120;

const scritture = new Map();

function frenoScritture(req) {
  const chiave = indirizzoRichiesta(req);
  const adesso = Date.now();
  const voce = scritture.get(chiave);

  if (!voce || voce.scadenza <= adesso) {
    if (scritture.size > 1000) {
      for (const [k, v] of scritture) { if (v.scadenza <= adesso) { scritture.delete(k); } }
    }
    scritture.set(chiave, { conteggio: 1, scadenza: adesso + FINESTRA_SCRITTURE_MS });
    return 0;
  }

  voce.conteggio += 1;
  return voce.conteggio > MAX_SCRITTURE_ANONIME ? voce.scadenza - adesso : 0;
}

function azzeraTutto() {
  sessioni.clear();
  try { fs.rmSync(P.sessioni, { force: true }); } catch (e) { }
  letto.firma = '';
  firmaAuth.stato = '';
  tentativi.clear();
  scritture.clear();
}

module.exports = {
  NOME_COOKIE, MIN_PASSWORD, MAX_TENTATIVI, DURATA_SESSIONE_MS, MAX_SCRITTURE_ANONIME,
  esistePassword, impostaPassword, passwordCorretta,
  creaSessione, autenticato, idSessione, chiudiSessione, cookieSessione, cookieScaduto,
  attesaResidua, registraFallimento, azzeraTentativi, azzeraTutto,
  dietroProxy, indirizzoRichiesta, indirizzoLocale, richiestaLocale, inHttps, frenoScritture
};
