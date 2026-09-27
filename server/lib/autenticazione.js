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
  const tieni = opzioni && opzioni.tieni ? sessioni.get(opzioni.tieni) : null;
  sessioni.clear();
  if (tieni && tieni.scadenza > Date.now()) { sessioni.set(opzioni.tieni, tieni); }
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

function pulisci() {
  const adesso = Date.now();
  for (const [id, sessione] of sessioni) {
    if (sessione.scadenza <= adesso) { sessioni.delete(id); }
  }
}

function creaSessione() {
  pulisci();
  const id = crypto.randomBytes(32).toString('hex');
  sessioni.set(id, { scadenza: Date.now() + DURATA_SESSIONE_MS });
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
  if (!id) { return false; }
  const sessione = sessioni.get(id);
  if (!sessione) { return false; }
  if (sessione.scadenza <= Date.now()) { sessioni.delete(id); return false; }
  return true;
}

function chiudiSessione(req) {
  const id = leggiCookie(req)[NOME_COOKIE];
  if (id) { sessioni.delete(id); }
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
