'use strict';

const fs = require('node:fs');

const { P } = require('./percorsi');
const { json, errore, testo, erroreHttp } = require('./risposte');
const auth = require('./autenticazione');
const archivio = require('./archivio');
const convalida = require('./convalida');
const controlli = require('./controlli');
const costruisci = require('./costruisci');
const media = require('./media');
const font = require('./font');
const backup = require('./backup');
const tema = require('./tema.js');
const chiavi = require('./chiavi');
const twitch = require('./twitch');
const youtube = require('./youtube');
const giochi = require('./giochi');
const sondaggi = require('./sondaggi');
const schema = require('../../contenuti/schema.js');
const SBStili = require('../../pannello/condivisi/stili.js');

const MAX_JSON = 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024 + 64 * 1024;
const MAX_FONT = font.MAX_BYTE + 64 * 1024;

const SENZA_SESSIONE = new Set(['/api/sessione', '/api/entra', '/api/sondaggio', '/api/sondaggio/voto']);

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

function origineEstranea(req) {
  const origine = req.headers.origin;
  if (!origine) { return false; }
  let host;
  try { host = new URL(origine).host; } catch (e) { return true; }

  return host !== String(req.headers.host || '').toLowerCase();
}

function durataLeggibile(ms) {
  const minuti = Math.ceil(ms / 60000);
  return minuti <= 1 ? 'meno di un minuto' : minuti + ' minuti';
}

const MESSAGGIO_PRIMO_ACCESSO = 'Il pannello non ha ancora una password e questo non è un accesso locale. ' +
  'Chi amministra il sito deve accendere SB_PRIMO_ACCESSO=1 nelle variabili dell\'applicazione, ' +
  'creare la password, e poi spegnerla.';

function primoAccessoPermesso(req) {
  const acceso = String(process.env.SB_PRIMO_ACCESSO || '').trim().toLowerCase();
  if (acceso === '1' || acceso === 'si' || acceso === 'true') { return true; }
  if (req.headers['x-forwarded-for'] !== undefined) { return false; }
  return auth.richiestaLocale(req);
}

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

  if (!auth.esistePassword()) {
    if (!primoAccessoPermesso(req)) {
      errore(res, 403, MESSAGGIO_PRIMO_ACCESSO);
      return;
    }
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

function quando(percorso) {
  try { return fs.statSync(percorso).mtime.toISOString(); } catch (e) { return null; }
}

function statoDelSito(contenuti) {
  const generatoIl = quando(P.indexHtml);
  const contenutiIl = quando(P.contenutiJson);

  const temaGenerato = fs.existsSync(P.temaCss);
  return {
    generato: generatoIl !== null,
    generatoIl: generatoIl,
    contenutiIl: contenutiIl,
    temaGenerato: temaGenerato,

    daPubblicare: !generatoIl || !temaGenerato || (contenutiIl !== null && contenutiIl > generatoIl),
    modelloPresente: fs.existsSync(P.modelloIndex),
    manutenzione: costruisci.inManutenzione(),
    backup: backup.elenco().length,
    media: media.elenco().length,
    scoperte: schema.verificaCopertura(contenuti),

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

    tema: { font: tema.CATALOGO_FONT, preset: tema.PRESET, predefinito: tema.PREDEFINITO },

    editor: {
      font: font.elencoConUso(documento),
      sezioni: SBStili.SEZIONI_ORDINABILI,
      riquadri: SBStili.RIQUADRI
    },
    stato: statoDelSito(documento)
  });
}

async function rottaScriviContenuti(req, res) {
  const corpo = await leggiJson(req);
  if (corpo.testi === undefined && corpo.config === undefined) {
    errore(res, 400, 'Serve almeno uno fra "testi" e "config".');
    return;
  }

  const unito = costruisci.pulisciEditor(archivio.unisci(archivio.leggi(), corpo));

  const errori = convalida.convalida(unito);
  if (errori.length) {
    errore(res, 422, 'Alcuni campi non vanno bene: correggili e riprova.', { errori: errori });
    return;
  }

  const aggiornatoIl = archivio.salva(unito);
  json(res, 200, { ok: true, aggiornatoIl: aggiornatoIl, stato: statoDelSito(unito) });
}

async function rottaPubblica(req, res) {

  const daChiavi = chiavi.sincronizzaClientId();
  const daTwitch = await twitch.aggiornaUltimaDiretta();
  const iFollower = await twitch.aggiornaFollower();
  const leClip = await twitch.aggiornaClip();
  const iNumeri = await twitch.aggiornaNumeri();

  const laCategoria = await twitch.aggiornaCategoria();

  const leEmote = await twitch.aggiornaEmote();
  const gliIscritti = await youtube.aggiornaIscritti();
  const iGiochi = await giochi.aggiornaGiochi();
  const esito = costruisci.genera();

  json(res, 200, {
    ok: true, backup: esito.backup, durataMs: esito.durataMs,
    scritti: esito.scritti, controlli: esito.controlli, manutenzione: esito.manutenzione,
    twitch: { stato: daTwitch.stato, messaggio: twitch.racconta(daTwitch) },
    follower: { stato: iFollower.stato, messaggio: twitch.raccontaFollower(iFollower) },
    clip: { stato: leClip.stato, messaggio: twitch.raccontaClip(leClip) },
    numeri: { stato: iNumeri.stato, messaggio: twitch.raccontaNumeri(iNumeri) },
    categoria: { stato: laCategoria.stato, messaggio: twitch.raccontaCategoria(laCategoria) },
    emote: { stato: leEmote.stato, messaggio: twitch.raccontaEmote(leEmote) },
    youtube: { stato: gliIscritti.stato, messaggio: youtube.racconta(gliIscritti) },
    giochi: { stato: iGiochi.stato, messaggio: giochi.raccontaGiochi(iGiochi) },
    chiavi: { stato: daChiavi.stato, messaggio: chiavi.racconta(daChiavi) }
  });
}

function rottaAnteprima(req, res) {
  testo(res, 200, costruisci.anteprima(), 'text/html; charset=utf-8');
}

function rottaAnteprimaManutenzione(req, res) {
  const pagina = costruisci.anteprimaManutenzione(archivio.leggi())
    .replace(/<head\b[^>]*>/i, (testa) => testa + '<base href="/">');
  testo(res, 200, pagina, 'text/html; charset=utf-8');
}

async function rottaAnteprimaDiProva(req, res) {
  const corpo = await leggiJson(req);
  const arrivo = corpo.contenuti;
  if (!arrivo || typeof arrivo !== 'object' || Array.isArray(arrivo)) {
    errore(res, 400, 'Serve un oggetto "contenuti" con dentro "testi" e/o "config".');
    return;
  }

  const unito = costruisci.pulisciEditor(archivio.unisci(archivio.leggi(), arrivo));
  let html;
  try {
    html = corpo.editor === true ? costruisci.anteprimaEditor(unito) : costruisci.anteprimaDi(unito);
  } catch (err) {

    const detto = (err && err.message) || 'errore sconosciuto';
    errore(res, 422, 'L anteprima non si e potuta comporre: ' + detto + (/[.!?]$/.test(detto) ? '' : '.'));
    return;
  }
  testo(res, 200, html, 'text/html; charset=utf-8');
}

async function rottaTema(req, res) {
  const corpo = await leggiJson(req);
  json(res, 200, { css: tema.css(corpo.tema) });
}

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

let collegamentoPendente = null;

function rottaTwitchStato(req, res) {
  json(res, 200, twitch.infoCollegamento());
}

async function rottaTwitchCollega(req, res) {
  let avvio;
  try {
    avvio = await twitch.iniziaCollegamento();
  } catch (errore) {

    throw erroreHttp(422, (errore && errore.message) || 'Non sono riuscito a cominciare il collegamento con Twitch.');
  }
  collegamentoPendente = { avvio: avvio, scadeAlle: Date.now() + avvio.scadeTraSec * 1000 };
  json(res, 200, {
    codiceUtente: avvio.codiceUtente,
    indirizzo: avvio.indirizzo,
    scadeTraSec: avvio.scadeTraSec,
    intervalloSec: avvio.intervalloSec
  });
}

async function rottaTwitchCollegaStato(req, res) {
  if (!collegamentoPendente) { json(res, 200, { stato: 'assente' }); return; }
  if (Date.now() > collegamentoPendente.scadeAlle) {
    collegamentoPendente = null;
    json(res, 200, { stato: 'scaduto' });
    return;
  }

  let esito;
  try {
    esito = await twitch.tentaCollegamento(collegamentoPendente.avvio);
  } catch (errore) {

    collegamentoPendente = null;
    json(res, 200, { stato: 'fallito', messaggio: (errore && errore.message) || 'Errore imprevisto.' });
    return;
  }

  if (esito.stato !== 'confermato') { json(res, 200, { stato: esito.stato }); return; }

  collegamentoPendente = null;

  let numeri = null;
  try { numeri = await twitch.aggiornaNumeri(); } catch (e) { numeri = null; }
  json(res, 200, {
    stato: 'confermato',
    login: esito.login,
    numeri: numeri ? { stato: numeri.stato, messaggio: twitch.raccontaNumeri(numeri) } : null
  });
}

function rottaTwitchScollega(req, res) {
  collegamentoPendente = null;
  json(res, 200, { ok: true, eraCollegato: twitch.scollega() });
}

function rottaElencoFont(req, res) {
  json(res, 200, { font: font.elencoConUso(archivio.leggi()) });
}

async function rottaCaricaFont(req, res) {
  const corpo = await leggiCorpo(req, MAX_FONT);
  json(res, 201, { ok: true, font: font.salva(corpo, req.headers['content-type']) });
}

function rottaEliminaFont(req, res, id, forza) {
  const esito = font.elimina(id, archivio.leggi(), { forza: forza });
  json(res, 200, { ok: true, eliminato: esito.id, usatoIn: esito.usatoIn });
}

async function rottaPassword(req, res) {
  const attesa = auth.attesaResidua(req, 'password');
  if (attesa > 0) {
    errore(res, 429, 'Troppi tentativi sbagliati. Riprova fra ' + durataLeggibile(attesa) + '.');
    return;
  }

  const corpo = await leggiJson(req);
  const attuale = typeof corpo.attuale === 'string' ? corpo.attuale : '';
  const nuova = typeof corpo.nuova === 'string' ? corpo.nuova : '';

  if (!attuale || !auth.passwordCorretta(attuale)) {
    auth.registraFallimento(req, 'password');
    errore(res, 403, 'La password attuale non e giusta.');
    return;
  }
  auth.azzeraTentativi(req, 'password');

  if (nuova.length < auth.MIN_PASSWORD) {
    errore(res, 422, 'La password nuova deve essere lunga almeno ' + auth.MIN_PASSWORD + ' caratteri.');
    return;
  }

  auth.impostaPassword(nuova, { tieni: auth.idSessione(req) });
  json(res, 200, { ok: true });
}

function rottaElencoBackup(req, res) {
  json(res, 200, { backup: backup.elenco() });
}

function rottaRipristina(req, res, id) {
  const esito = backup.ripristina(id);
  const clip = costruisci.allineaClipDopoRipristino();
  const sponsor = costruisci.allineaSponsorDopoRipristino();
  const statoSito = costruisci.allineaStatoDopoRipristino();
  json(res, 200, { ok: true, ripristinati: esito.ripristinati, backup: esito.backup, clip: clip, sponsor: sponsor, giochi: costruisci.allineaGiochiDopoRipristino(), statoSito: statoSito });
}

async function rottaSondaggioPubblico(req, res) {
  const vista = sondaggi.vistaPubblica(null);
  const token = sondaggi.tokenDa(req);
  if (!token || !vista.sondaggio || vista.sondaggio.chiuso) { json(res, 200, vista); return; }
  if (!sondaggi.inCache(token) && !auth.autenticato(req)) {
    const attesa = auth.frenoScritture(req);
    if (attesa > 0) {
      errore(res, 429, 'Troppe richieste da questo indirizzo. Riprova fra ' + durataLeggibile(attesa) + '.');
      return;
    }
  }
  let utente = null;
  try { utente = await sondaggi.verificaToken(token); } catch (e) {
    if (e.stato !== 401 && e.stato !== 503) { throw e; }
  }
  json(res, 200, Object.assign(sondaggi.vistaPubblica(utente ? utente.id : null), { riconosciuto: !!utente }));
}

async function rottaVota(req, res) {
  const token = sondaggi.tokenDa(req);
  if (!token) { errore(res, 401, 'Per votare collegati con Twitch.'); return; }
  const corpo = await leggiJson(req);
  const utente = await sondaggi.verificaToken(token);
  const esito = sondaggi.vota(utente.id, corpo);
  if (esito.giaVotato) { errore(res, 409, 'Hai già votato questo sondaggio.', esito.vista); return; }
  json(res, 200, esito.vista);
}

async function rottaCreaSondaggio(req, res) {
  const corpo = await leggiJson(req);
  json(res, 201, sondaggi.crea(corpo));
}

function metodoNonAmmesso(res, ammessi) {
  errore(res, 405, 'Metodo non ammesso su questa rotta. Ammessi: ' + ammessi + '.');
}

function decodifica(pezzo) {
  try { return decodeURIComponent(pezzo); } catch (e) {
    throw erroreHttp(400, 'L identificativo nel percorso non e codificato correttamente.');
  }
}

async function gestisci(req, res, percorso) {
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;
  const modifica = metodo === 'POST' || metodo === 'PUT' || metodo === 'DELETE';
  const conSessione = auth.autenticato(req);

  if (modifica && !conSessione) {
    const attesa = auth.frenoScritture(req);
    if (attesa > 0) {
      errore(res, 429, 'Troppe richieste da questo indirizzo. Riprova fra ' + durataLeggibile(attesa) + '.');
      return;
    }
  }

  if (modifica && origineEstranea(req)) {
    errore(res, 403, 'Richiesta rifiutata: arriva da un altro sito.');
    return;
  }
  if (!SENZA_SESSIONE.has(percorso) && !conSessione) {
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
  if (percorso === '/api/anteprima/manutenzione') {
    return metodo === 'GET' ? rottaAnteprimaManutenzione(req, res) : metodoNonAmmesso(res, 'GET');
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
  if (percorso === '/api/twitch/collega') {
    if (metodo === 'GET') { return rottaTwitchStato(req, res); }
    if (metodo === 'POST') { return rottaTwitchCollega(req, res); }
    return metodoNonAmmesso(res, 'GET, POST');
  }
  if (percorso === '/api/twitch/collega/stato') {
    return metodo === 'POST' ? rottaTwitchCollegaStato(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/twitch/scollega') {
    return metodo === 'POST' ? rottaTwitchScollega(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/font') {
    if (metodo === 'GET') { return rottaElencoFont(req, res); }
    if (metodo === 'POST') { return rottaCaricaFont(req, res); }
    return metodoNonAmmesso(res, 'GET, POST');
  }
  if (percorso.startsWith('/api/font/')) {
    if (metodo !== 'DELETE') { return metodoNonAmmesso(res, 'DELETE'); }
    const forza = new URL(req.url, 'http://localhost').searchParams.get('forza');
    return rottaEliminaFont(req, res, decodifica(percorso.slice('/api/font/'.length)), forza === '1' || forza === 'true');
  }
  if (percorso === '/api/password') {
    return metodo === 'POST' ? rottaPassword(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/sondaggio') {
    return metodo === 'GET' ? rottaSondaggioPubblico(req, res) : metodoNonAmmesso(res, 'GET');
  }
  if (percorso === '/api/sondaggio/voto') {
    return metodo === 'POST' ? rottaVota(req, res) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso === '/api/sondaggi') {
    if (metodo === 'GET') { return json(res, 200, sondaggi.vistaAdmin()); }
    if (metodo === 'POST') { return rottaCreaSondaggio(req, res); }
    return metodoNonAmmesso(res, 'GET, POST');
  }
  if (percorso === '/api/sondaggi/chiudi') {
    return metodo === 'POST' ? json(res, 200, sondaggi.chiudi()) : metodoNonAmmesso(res, 'POST');
  }
  if (percorso.startsWith('/api/sondaggi/')) {
    if (metodo !== 'DELETE') { return metodoNonAmmesso(res, 'DELETE'); }
    return json(res, 200, sondaggi.elimina(decodifica(percorso.slice('/api/sondaggi/'.length))));
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
