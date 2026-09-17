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

   Da CONTRATTO-6 lo stesso pannello puo stare su un hosting, dietro il
   proxy del server web: qui sotto c'e tutto quello che cambia, cioe come si
   capisce chi ha bussato (indirizzoRichiesta) e se la richiesta e arrivata
   cifrata (inHttps). Senza SB_DIETRO_PROXY=1 non cambia niente rispetto a
   prima: vale l'indirizzo della connessione e basta.
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

/* --- CHI HA BUSSATO DAVVERO ---------------------------------------- */

/*
   In locale l'unico che bussa e chi sta al computer, e l'indirizzo della
   connessione e la verita. Su un hosting Plesk in mezzo c'e il server web
   (Passenger, con nginx o Apache davanti): li l'indirizzo della connessione
   e sempre quello del proxy, e l'unico modo di sapere chi ha bussato e
   l'intestazione X-Forwarded-For.

   Solo che quell'intestazione la scrive chi chiama. Fidarsene senza sapere
   di stare dietro un proxy vuol dire regalare il freno ai tentativi: basta
   cambiare il valore a ogni richiesta per avere ogni volta un contatore
   nuovo. Percio due regole, e nessuna eccezione:

   1) la si guarda soltanto se chi installa lo dichiara (SB_DIETRO_PROXY=1);
   2) si prende l'ULTIMO salto, non il primo. La catena si legge da sinistra
      a destra e ogni proxy accoda l'indirizzo da cui ha ricevuto: quello in
      fondo l'ha scritto il proxy di casa ed e l'unico che chi chiama non
      puo falsificare. Il primo e esattamente quello che scriverebbe lui.

   Senza la dichiarazione vale req.socket.remoteAddress, cioe il
   comportamento di sempre: in locale non cambia niente.
*/
function dietroProxy() {
  const dichiarato = String(process.env.SB_DIETRO_PROXY || '').trim().toLowerCase();
  return dichiarato === '1' || dichiarato === 'si' || dichiarato === 'true';
}

/** L'ultimo salto di un'intestazione a piu valori separati da virgola. */
function ultimoSalto(valore) {
  // Node consegna un array quando la stessa intestazione arriva ripetuta:
  // vale lo stesso ragionamento, conta l'ultima riga.
  if (Array.isArray(valore)) { return valore.length ? ultimoSalto(valore[valore.length - 1]) : ''; }
  if (typeof valore !== 'string' || !valore.trim()) { return ''; }
  const pezzi = valore.split(',');
  return pezzi[pezzi.length - 1].trim();
}

/**
 * Riduce un indirizzo alla sua forma stabile: senza la porta (che cambia a
 * ogni richiesta e farebbe un contatore nuovo ogni volta) e senza il
 * prefisso ::ffff: che Node mette davanti agli IPv4 quando ascolta in IPv6.
 */
function normalizzaIp(grezzo) {
  let ip = String(grezzo == null ? '' : grezzo).trim();
  if (!ip) { return ''; }
  const fraQuadre = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (fraQuadre) { ip = fraQuadre[1]; }
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) { ip = ip.slice(0, ip.indexOf(':')); }
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(ip)) { ip = ip.slice('::ffff:'.length); }
  return ip.toLowerCase();
}

/** L'indirizzo da cui e arrivata la richiesta, per quel che se ne puo sapere. */
function indirizzoRichiesta(req) {
  if (dietroProxy()) {
    const ultimo = normalizzaIp(ultimoSalto(req.headers['x-forwarded-for']));
    if (ultimo) { return ultimo; }
  }
  return normalizzaIp(req.socket && req.socket.remoteAddress) || 'sconosciuto';
}

/*
   «Locale» qui vuol dire: chi bussa sta allo stesso computer, oppure nella
   stessa rete di casa o d'ufficio. Serve a una cosa sola — decidere se la
   password si puo creare al primo avvio senza altre cerimonie (api.js,
   rottaEntra). Nient'altro nel server guarda questa funzione: chi e locale
   non ha nessun privilegio in piu, deve avere la password come tutti.

   Un indirizzo che non si e capito («sconosciuto») non e locale: nel dubbio
   si sta dalla parte stretta.
*/
const RETI_LOCALI = [
  /^127\./,                       // 127.0.0.0/8 — questo stesso computer
  /^10\./,                        // 10.0.0.0/8
  /^192\.168\./,                  // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./,   // 172.16.0.0/12
  /^169\.254\./                   // 169.254.0.0/16 — rete senza router
];

function indirizzoLocale(ip) {
  const pulito = normalizzaIp(ip);
  if (!pulito) { return false; }
  if (pulito.indexOf(':') !== -1) {
    // IPv6: ::1 e il loopback, fc00::/7 sono le reti locali, fe80::/10 il
    // collegamento diretto fra due macchine.
    if (pulito === '::1' || pulito === '0:0:0:0:0:0:0:1') { return true; }
    return /^f[cd][0-9a-f]{2}:/.test(pulito) || /^fe[89ab][0-9a-f]:/.test(pulito);
  }
  return RETI_LOCALI.some((rete) => rete.test(pulito));
}

/**
 * Vero se la richiesta arriva da un indirizzo locale. Dietro un proxy
 * dichiarato si guarda il cliente vero, non il proxy: su Plesk il proxy sta
 * spesso sulla stessa macchina, e senza questa distinzione «locale»
 * finirebbe per voler dire «chiunque nel mondo».
 */
function richiestaLocale(req) {
  return indirizzoLocale(indirizzoRichiesta(req));
}

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

/**
 * Scrive server/dati/auth.json con l'hash della password data.
 * `opzioni.tieni` e l'id della sessione da lasciare aperta: chi cambia la
 * password dal pannello resta dentro, tutti gli altri escono.
 */
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
  // Le sessioni aperte con la vecchia password non hanno piu motivo di
  // esistere: una password si cambia proprio quando si teme che qualcuno la
  // conosca, e quel qualcuno potrebbe essere gia dentro.
  const tieni = opzioni && opzioni.tieni ? sessioni.get(opzioni.tieni) : null;
  sessioni.clear();
  if (tieni && tieni.scadenza > Date.now()) { sessioni.set(opzioni.tieni, tieni); }
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

/** L'id della sessione portata dalla richiesta, oppure null. */
function idSessione(req) {
  return leggiCookie(req)[NOME_COOKIE] || null;
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

/**
 * Vero se la richiesta e arrivata cifrata: solo allora il cookie puo essere
 * Secure. Vale lo stesso ragionamento di X-Forwarded-For — l'intestazione la
 * scrive chi chiama, quindi si guarda solo dietro un proxy dichiarato e si
 * prende l'ultimo salto, quello aggiunto dal proxy di casa.
 *
 * Qui sbagliare nei due sensi non costa uguale: dire «https» quando invece e
 * http fa buttare via il cookie al browser e non fa piu entrare nessuno,
 * mentre dire «http» quando e https lascia solo un attributo in meno. Per
 * questo, nel dubbio, si sta dalla parte dell'ultimo salto.
 */
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

/*
   `ambito` separa i contatori: sbagliare la password attuale nel cambio
   password (ambito 'password') non deve chiudere fuori dall'accesso, e
   viceversa. Senza ambito vale il contatore dell'accesso, come sempre.
*/
function chiaveTentativi(req, ambito) {
  const ip = indirizzoRichiesta(req);
  return ambito ? ambito + ':' + ip : ip;
}

/** Millisecondi che mancano allo sblocco, 0 se non e bloccato. */
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

/* --- FRENO SULLE RICHIESTE CHE SCRIVONO ----------------------------- */

/*
   Il freno qui sopra difende la password. Questo difende il resto: chi
   trova il pannello e non ha la password puo comunque bussare alle rotte
   che scrivono all'infinito e far lavorare il server per niente.

   Si contano solo le richieste SENZA una sessione valida, ed e una scelta,
   non una dimenticanza: chi e dentro davvero e l'editor dal vivo, che a
   ogni fotogramma puo chiedere POST /api/tema o POST /api/anteprima —
   decine di richieste al secondo, tutte legittime. Contarle vorrebbe dire
   un freno che ferma chi amministra e non chi prova a caso.

   120 al minuto perche una richiesta di scrittura senza sessione, nell'uso
   vero, e solo l'accesso al pannello: cinque tentativi sbagliati e il freno
   della password ha gia chiuso. 120 lascia respirare un ufficio intero
   dietro allo stesso indirizzo, e taglia un martellamento di due ordini di
   grandezza.
*/
const FINESTRA_SCRITTURE_MS = 60 * 1000;
const MAX_SCRITTURE_ANONIME = 120;

const scritture = new Map();   // ip -> { conteggio, scadenza }

/**
 * Millisecondi che mancano alla fine della finestra se il tetto e gia stato
 * superato, 0 se si puo passare. Ogni chiamata conta come una richiesta.
 */
function frenoScritture(req) {
  const chiave = indirizzoRichiesta(req);
  const adesso = Date.now();
  const voce = scritture.get(chiave);

  if (!voce || voce.scadenza <= adesso) {
    // La mappa si pulisce qui, quando ci si passa: senza un timer che tenga
    // vivo il processo e senza far crescere la memoria a chi bussa da mille
    // indirizzi diversi.
    if (scritture.size > 1000) {
      for (const [k, v] of scritture) { if (v.scadenza <= adesso) { scritture.delete(k); } }
    }
    scritture.set(chiave, { conteggio: 1, scadenza: adesso + FINESTRA_SCRITTURE_MS });
    return 0;
  }

  voce.conteggio += 1;
  return voce.conteggio > MAX_SCRITTURE_ANONIME ? voce.scadenza - adesso : 0;
}

/** Solo per il collaudo: azzera sessioni, tentativi e freni fra una prova e l'altra. */
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
