'use strict';
/* =====================================================================
   autenticazione.js — password, sessioni, freno ai tentativi.

   Nessun utente, nessun database: una sola password, il cui hash scrypt
   sta in server/dati/auth.json. Le sessioni vivono in memoria, quindi
   riavviare il server significa rifare l'accesso: per uno strumento che si
   apre in locale va benissimo, e toglie di mezzo un altro file da
   proteggere.

   Al primo avvio il file non c'e: il server lo dice in console e il
   pannello mostra la schermata di creazione, che chiama la stessa
   impostaPassword() di server/imposta-password.js.
   ===================================================================== */

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

// 16 MB di memoria per hash: abbastanza da rendere inutile provare milioni
// di password, abbastanza poco da non far sudare un portatile.
const SCRYPT = { N: 16384, r: 8, p: 1, lunghezza: 64 };

const sessioni = new Map();    // id -> { scadenza }
const tentativi = new Map();   // ip -> { conteggio, scadenza }

/* --- PASSWORD ------------------------------------------------------ */

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

/** Vero se la password del pannello e gia stata creata. */
function esistePassword() {
  return leggiAuth() !== null;
}

/** Scrive server/dati/auth.json con l'hash della password data. */
function impostaPassword(password) {
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
  // Le sessioni aperte con la vecchia password non hanno piu motivo di esistere.
  sessioni.clear();
}

/** Confronto a tempo costante: la lunghezza dell'hash e sempre la stessa. */
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

/* --- SESSIONI ------------------------------------------------------ */

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

/** Vero se la richiesta porta una sessione ancora valida. */
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

/** Vero se la richiesta e arrivata cifrata: solo allora il cookie puo essere Secure. */
function inHttps(req) {
  if (req.socket && req.socket.encrypted) { return true; }
  const inoltrato = req.headers['x-forwarded-proto'];
  return typeof inoltrato === 'string' && inoltrato.split(',')[0].trim() === 'https';
}

function cookieSessione(req, id) {
  const pezzi = [
    NOME_COOKIE + '=' + id, 'HttpOnly', 'SameSite=Strict', 'Path=/',
    'Max-Age=' + Math.floor(DURATA_SESSIONE_MS / 1000)
  ];
  // In locale si naviga su http://: con Secure il cookie non verrebbe salvato.
  if (inHttps(req)) { pezzi.push('Secure'); }
  return pezzi.join('; ');
}

function cookieScaduto(req) {
  const pezzi = [NOME_COOKIE + '=', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
  if (inHttps(req)) { pezzi.push('Secure'); }
  return pezzi.join('; ');
}

/* --- FRENO AI TENTATIVI -------------------------------------------- */

function indirizzoDi(req) {
  const inoltrato = req.headers['x-forwarded-for'];
  if (typeof inoltrato === 'string' && inoltrato.trim()) { return inoltrato.split(',')[0].trim(); }
  return (req.socket && req.socket.remoteAddress) || 'sconosciuto';
}

/** Millisecondi che mancano allo sblocco, 0 se non e bloccato. */
function attesaResidua(req) {
  const ip = indirizzoDi(req);
  const voce = tentativi.get(ip);
  if (!voce) { return 0; }
  if (voce.scadenza <= Date.now()) { tentativi.delete(ip); return 0; }
  return voce.conteggio >= MAX_TENTATIVI ? voce.scadenza - Date.now() : 0;
}

function registraFallimento(req) {
  const ip = indirizzoDi(req);
  const adesso = Date.now();
  const voce = tentativi.get(ip);
  if (!voce || voce.scadenza <= adesso) {
    tentativi.set(ip, { conteggio: 1, scadenza: adesso + FINESTRA_TENTATIVI_MS });
    return;
  }
  voce.conteggio += 1;
}

function azzeraTentativi(req) {
  tentativi.delete(indirizzoDi(req));
}

/** Solo per il collaudo: azzera sessioni e tentativi fra una prova e l'altra. */
function azzeraTutto() {
  sessioni.clear();
  tentativi.clear();
}

module.exports = {
  NOME_COOKIE, MIN_PASSWORD, MAX_TENTATIVI, DURATA_SESSIONE_MS,
  esistePassword, impostaPassword, passwordCorretta,
  creaSessione, autenticato, chiudiSessione, cookieSessione, cookieScaduto,
  attesaResidua, registraFallimento, azzeraTentativi, azzeraTutto
};
