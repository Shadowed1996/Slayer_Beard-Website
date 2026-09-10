'use strict';
/* =====================================================================
   api.js — tutte le rotte /api/* del CONTRATTO §8 e del CONTRATTO-2 §9.

   Regole valide ovunque:
   - fuori da /api/sessione e /api/entra serve una sessione valida;
   - POST /api/anteprima e POST /api/tema non scrivono niente ma restano
     POST e restano dietro al controllo dell Origin: mandano un corpo che
     puo essere grosso e non sono cacheabili, e non c e motivo di lasciarle
     raggiungibili da una pagina di terzi;
   - le rotte che modificano qualcosa rifiutano le richieste con un Origin
     estraneo. Insieme al cookie SameSite=Strict e quello che tiene fuori
     una pagina di terzi che provasse a pilotare il pannello dal browser
     di chi e gia collegato;
   - il corpo JSON si ferma a 1 MB, il caricamento di un file a 4 MB;
   - ogni errore e { errore: "…" } in italiano, con lo stato HTTP giusto.
   ===================================================================== */

const fs = require('node:fs');

const { P } = require('./percorsi');
const { json, errore, testo, erroreHttp } = require('./risposte');
const auth = require('./autenticazione');
const archivio = require('./archivio');
const convalida = require('./convalida');
const controlli = require('./controlli');
const costruisci = require('./costruisci');
const media = require('./media');
const backup = require('./backup');
const tema = require('./tema.js');
const chiavi = require('./chiavi');
const twitch = require('./twitch');
const schema = require('../../contenuti/schema.js');

const MAX_JSON = 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024 + 64 * 1024;   // 4 MB piu il contorno multipart

const SENZA_SESSIONE = new Set(['/api/sessione', '/api/entra']);

/* --- CORPO DELLA RICHIESTA ----------------------------------------- */

/** Legge il corpo grezzo, fermandosi al limite invece di riempire la memoria. */
function leggiCorpo(req, massimo) {
  return new Promise((risolvi, rifiuta) => {
    const pezzi = [];
    let totale = 0;
    let chiuso = false;

    req.on('data', (pezzo) => {
      if (chiuso) { return; }
      totale += pezzo.length;
      if (totale > massimo) {
        chiuso = true;
        rifiuta(erroreHttp(413, 'Il contenuto inviato supera il limite di ' + Math.round(massimo / 1024 / 1024) + ' MB.'));
        req.destroy();
        return;
      }
      pezzi.push(pezzo);
    });
    req.on('end', () => { if (!chiuso) { risolvi(Buffer.concat(pezzi)); } });
    req.on('error', (e) => { if (!chiuso) { rifiuta(e); } });
  });
}

async function leggiJson(req) {
  const grezzo = (await leggiCorpo(req, MAX_JSON)).toString('utf8').trim();
  if (!grezzo) { return {}; }
  let dati;
  try { dati = JSON.parse(grezzo); } catch (e) {
    throw erroreHttp(400, 'Il corpo della richiesta non e JSON valido.');
  }
  if (dati === null || typeof dati !== 'object' || Array.isArray(dati)) {
    throw erroreHttp(400, 'Il corpo della richiesta deve essere un oggetto JSON.');
  }
  return dati;
}

/* --- CONTROLLI DI ACCESSO ------------------------------------------ */

/**
 * L'Origin deve combaciare con l'host a cui la richiesta e arrivata.
 * Se manca del tutto la richiesta non viene da una pagina web (curl, il
 * collaudo, uno script): il cookie SameSite=Strict basta gia a proteggerla.
 */
function origineEstranea(req) {
  const origine = req.headers.origin;
  if (!origine) { return false; }
  let host;
  try { host = new URL(origine).host; } catch (e) { return true; }
  return host !== req.headers.host;
}

function durataLeggibile(ms) {
  const minuti = Math.ceil(ms / 60000);
  return minuti <= 1 ? 'meno di un minuto' : minuti + ' minuti';
}

/* --- SESSIONE ------------------------------------------------------ */

function rottaSessione(req, res) {
  json(res, 200, { autenticato: auth.autenticato(req), primoAvvio: !auth.esistePassword() });
}

async function rottaEntra(req, res) {
  const attesa = auth.attesaResidua(req);
  if (attesa > 0) {
    errore(res, 429, 'Troppi tentativi falliti. Riprova fra ' + durataLeggibile(attesa) + '.');
    return;
  }

  const corpo = await leggiJson(req);
  const password = typeof corpo.password === 'string' ? corpo.password : '';

  // Primo avvio: la stessa rotta crea la password invece di controllarla.
  // Il pannello mostra la schermata di creazione quando primoAvvio e vero.
  if (!auth.esistePassword()) {
    auth.impostaPassword(password);
    json(res, 201, { ok: true, creata: true }, { 'Set-Cookie': auth.cookieSessione(req, auth.creaSessione()) });
    return;
  }

  if (!password || !auth.passwordCorretta(password)) {
    auth.registraFallimento(req);
    const rimasti = auth.attesaResidua(req);
    if (rimasti > 0) {
      errore(res, 429, 'Troppi tentativi falliti. Riprova fra ' + durataLeggibile(rimasti) + '.');
      return;
    }
    errore(res, 401, 'Password errata.');
    return;
  }

  auth.azzeraTentativi(req);
  json(res, 200, { ok: true, creata: false }, { 'Set-Cookie': auth.cookieSessione(req, auth.creaSessione()) });
}

function rottaEsci(req, res) {
  auth.chiudiSessione(req);
  json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieScaduto(req) });
}

/* --- CONTENUTI ----------------------------------------------------- */

function quando(percorso) {
  try { return fs.statSync(percorso).mtime.toISOString(); } catch (e) { return null; }
}

/** Come sta il sito adesso: serve al pannello per dire cosa c e da fare. */
function statoDelSito(contenuti) {
  const generatoIl = quando(P.indexHtml);
  const contenutiIl = quando(P.contenutiJson);
  // La pubblicazione scrive tre file: se il foglio del tema non c e ancora,
  // il sito sta girando sui soli valori di partenza di tokens.css e c e da
  // ripubblicare anche se l HTML e aggiornato.
  const temaGenerato = fs.existsSync(P.temaCss);
  return {
    generato: generatoIl !== null,
    generatoIl: generatoIl,
    contenutiIl: contenutiIl,
    temaGenerato: temaGenerato,
    // Se i contenuti sono piu recenti della pagina, c e da ripubblicare.
    daPubblicare: !generatoIl || !temaGenerato || (contenutiIl !== null && contenutiIl > generatoIl),
    modelloPresente: fs.existsSync(P.modelloIndex),
    backup: backup.elenco().length,
    media: media.elenco().length,
    scoperte: schema.verificaCopertura(contenuti),
    // Gli avvertimenti d'insieme viaggiano gia da subito, non solo dopo una
    // pubblicazione: chi apre il pannello il giorno della messa online deve
    // poterli leggere senza dover prima pubblicare per scoprirli.
    controlli: controlli.controlli(contenuti)
  };
}

function rottaLeggiContenuti(req, res) {
  const documento = archivio.leggi();
  json(res, 200, {
    versione: documento.versione,
    aggiornatoIl: documento.aggiornatoIl,
    testi: documento.testi,
    config: documento.config,
    schema: { gruppi: schema.gruppi, tipi: schema.TIPI },
    // Il catalogo dei font, i preset e il tema di partenza stanno nel server
    // (server/lib/tema.js) e arrivano da qui: il pannello continua a non
    // sapere niente di suo, nemmeno quali famiglie esistono.
    // `predefinito` e quello che serve al bottone «ripristina i colori di
    // partenza»: senza, il pannello potrebbe solo rimettere i valori che ha
    // trovato aprendo la pagina, che sono un'altra cosa e prima o poi
    // ingannano chi amministra.
    tema: { font: tema.CATALOGO_FONT, preset: tema.PRESET, predefinito: tema.PREDEFINITO },
    stato: statoDelSito(documento)
  });
}

async function rottaScriviContenuti(req, res) {
  const corpo = await leggiJson(req);
  if (corpo.testi === undefined && corpo.config === undefined) {
    errore(res, 400, 'Serve almeno uno fra "testi" e "config".');
    return;
  }

  // Le modifiche si sovrappongono a quelle salvate: il pannello puo mandare
  // solo cio che ha toccato senza che il resto sparisca.
  const unito = archivio.unisci(archivio.leggi(), corpo);

  const errori = convalida.convalida(unito);
  if (errori.length) {
    errore(res, 422, 'Alcuni campi non vanno bene: correggili e riprova.', { errori: errori });
    return;
  }

  const aggiornatoIl = archivio.salva(unito);
  json(res, 200, { ok: true, aggiornatoIl: aggiornatoIl, stato: statoDelSito(unito) });
}

/**
 * L'unica rotta che parla con la rete, e lo fa prima di generare: il
 * titolo dell'ultima diretta viene da Twitch e finisce in contenuti.json,
 * che costruisci.genera() rilegge subito dopo.
 *
 * `aggiornaUltimaDiretta()` non lancia mai e non svuota mai il campo: se
 * Twitch e giu, o se il collegamento non e configurato affatto, la
 * pubblicazione va avanti identica a prima con il valore che c era.
 */
async function rottaPubblica(req, res) {
  // L'ordine conta: il Client ID arriva da server/dati/chiavi.js e va
  // messo nei contenuti prima che costruisci.genera() li rilegga.
  const daChiavi = chiavi.sincronizzaClientId();
  const daTwitch = await twitch.aggiornaUltimaDiretta();
  const leClip = await twitch.aggiornaClip();
  const esito = costruisci.genera();
  // `controlli` sono avvertimenti d'insieme, non errori: la pubblicazione e
  // riuscita comunque, e il pannello li mostra dopo invece di trattarli come
  // un fallimento.
  json(res, 200, {
    ok: true, backup: esito.backup, durataMs: esito.durataMs,
    scritti: esito.scritti, controlli: esito.controlli,
    twitch: { stato: daTwitch.stato, messaggio: twitch.racconta(daTwitch) },
    clip: { stato: leClip.stato, messaggio: twitch.raccontaClip(leClip) },
    chiavi: { stato: daChiavi.stato, messaggio: chiavi.racconta(daChiavi) }
  });
}

function rottaAnteprima(req, res) {
  testo(res, 200, costruisci.anteprima(), 'text/html; charset=utf-8');
}

/**
 * Anteprima dei contenuti ancora in modifica: il pannello manda quello che
 * ha nei campi, si rende e si butta via. Non si scrive niente e non si
 * convalida: convalidare qui vorrebbe dire negare l'anteprima proprio
 * quando serve, cioe mentre un campo e a meta.
 *
 * Le modifiche si sovrappongono a quelle salvate come nella PUT, cosi il
 * pannello puo mandare solo cio che ha toccato.
 */
async function rottaAnteprimaDiProva(req, res) {
  const corpo = await leggiJson(req);
  const arrivo = corpo.contenuti;
  if (!arrivo || typeof arrivo !== 'object' || Array.isArray(arrivo)) {
    errore(res, 400, 'Serve un oggetto "contenuti" con dentro "testi" e/o "config".');
    return;
  }

  const unito = archivio.unisci(archivio.leggi(), arrivo);
  let html;
  try {
    html = costruisci.anteprimaDi(unito);
  } catch (err) {
    // 422 e non 500: la richiesta e arrivata bene, sono i contenuti (o il
    // modello) a non stare in piedi. Il messaggio del motore dice file e
    // riga, ed e l unica cosa utile da mostrare nel pannello.
    const detto = (err && err.message) || 'errore sconosciuto';
    errore(res, 422, 'L anteprima non si e potuta comporre: ' + detto + (/[.!?]$/.test(detto) ? '' : '.'));
    return;
  }
  testo(res, 200, html, 'text/html; charset=utf-8');
}

/**
 * Il foglio del tema calcolato al volo, senza salvarlo: serve al pannello
 * per mostrare i colori nell anteprima appena si muove un cursore.
 * Un tema incompleto non e un errore — tema.css() ricade sui valori di
 * partenza — perche questa rotta viene chiamata anche a meta digitazione.
 */
async function rottaTema(req, res) {
  const corpo = await leggiJson(req);
  json(res, 200, { css: tema.css(corpo.tema) });
}

/* --- MEDIA --------------------------------------------------------- */

function rottaElencoMedia(req, res) {
  json(res, 200, { file: media.elenco() });
}

async function rottaCaricaMedia(req, res) {
  const corpo = await leggiCorpo(req, MAX_FILE);
  json(res, 201, { ok: true, file: media.salva(corpo, req.headers['content-type']) });
}

function rottaEliminaMedia(req, res, nome) {
  json(res, 200, { ok: true, eliminato: media.elimina(nome, archivio.leggi()) });
}

/* --- BACKUP -------------------------------------------------------- */

function rottaElencoBackup(req, res) {
  json(res, 200, { backup: backup.elenco() });
}

function rottaRipristina(req, res, id) {
  const esito = backup.ripristina(id);
  json(res, 200, { ok: true, ripristinati: esito.ripristinati, backup: esito.backup });
}

/* --- ROUTER -------------------------------------------------------- */

function metodoNonAmmesso(res, ammessi) {
  errore(res, 405, 'Metodo non ammesso su questa rotta. Ammessi: ' + ammessi + '.');
}

async function gestisci(req, res, percorso) {
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;
  const modifica = metodo === 'POST' || metodo === 'PUT' || metodo === 'DELETE';

  if (modifica && origineEstranea(req)) {
    errore(res, 403, 'Richiesta rifiutata: arriva da un altro sito.');
    return;
  }
  if (!SENZA_SESSIONE.has(percorso) && !auth.autenticato(req)) {
    errore(res, 401, 'Sessione assente o scaduta: rientra nel pannello.');
    return;
  }

  if (percorso === '/api/sessione') {
    return metodo === 'GET' ? rottaSessione(req, res) : metodoNonAmmesso(res, 'GET');
  }
  if (percorso === '/api/entra') {
    return metodo === 'POST' ? rottaEntra(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/esci') {
    return metodo === 'POST' ? rottaEsci(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/contenuti') {
    if (metodo === 'GET') { return rottaLeggiContenuti(req, res); }
    if (metodo === 'PUT') { return rottaScriviContenuti(req, res); }
    return metodoNonAmmesso(res, 'GET, PUT');
  }
  if (percorso === '/api/pubblica') {
    return metodo === 'POST' ? rottaPubblica(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/anteprima') {
    if (metodo === 'GET') { return rottaAnteprima(req, res); }
    if (metodo === 'POST') { return rottaAnteprimaDiProva(req, res); }
    return metodoNonAmmesso(res, 'GET, POST');
  }
  if (percorso === '/api/tema') {
    return metodo === 'POST' ? rottaTema(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/media') {
    if (metodo === 'GET') { return rottaElencoMedia(req, res); }
    if (metodo === 'POST') { return rottaCaricaMedia(req, res); }
    return metodoNonAmmesso(res, 'GET, POST');
  }
  if (percorso.startsWith('/api/media/')) {
    if (metodo !== 'DELETE') { return metodoNonAmmesso(res, 'DELETE'); }
    let nome;
    try { nome = decodeURIComponent(percorso.slice('/api/media/'.length)); }
    catch (e) { return errore(res, 400, 'Il nome del file non e codificato correttamente.'); }
    return rottaEliminaMedia(req, res, nome);
  }
  if (percorso === '/api/backup') {
    return metodo === 'GET' ? rottaElencoBackup(req, res) : metodoNonAmmesso(res, 'GET');
  }
  if (percorso.startsWith('/api/backup/') && percorso.endsWith('/ripristina')) {
    if (metodo !== 'POST') { return metodoNonAmmesso(res, 'POST'); }
    const id = percorso.slice('/api/backup/'.length, percorso.length - '/ripristina'.length);
    return rottaRipristina(req, res, decodeURIComponent(id));
  }

  errore(res, 404, 'Questa rotta non esiste.');
}

module.exports = { gestisci, MAX_JSON, MAX_FILE, statoDelSito, origineEstranea };
