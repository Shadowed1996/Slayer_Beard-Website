'use strict';
/* =====================================================================
   api.js — tutte le rotte /api/* del CONTRATTO §8, del CONTRATTO-2 §9 e
   del CONTRATTO-4 §7.

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
   - il corpo JSON si ferma a 1 MB, il caricamento di un'immagine a 4 MB,
     quello di un font a 2 MB; il limite si controlla mentre il corpo
     arriva, non dal Content-Length dichiarato, che chi chiama puo mentire;
   - chi scrive senza una sessione valida ha un tetto per indirizzo
     (CONTRATTO-6 §4.2): il pannello esposto a internet non deve lavorare
     gratis per chi prova a caso;
   - al primo avvio la password si crea dal browser solo da un indirizzo
     locale, o con SB_PRIMO_ACCESSO=1 acceso apposta: vedi il commento sopra
     primoAccessoPermesso();
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
const font = require('./font');
const backup = require('./backup');
const tema = require('./tema.js');
const chiavi = require('./chiavi');
const twitch = require('./twitch');
const youtube = require('./youtube');
const sondaggi = require('./sondaggi');
const schema = require('../../contenuti/schema.js');
const SBStili = require('../../pannello/condivisi/stili.js');

const MAX_JSON = 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024 + 64 * 1024;   // 4 MB piu il contorno multipart
const MAX_FONT = font.MAX_BYTE + 64 * 1024;      // 2 MB piu il contorno multipart

const SENZA_SESSIONE = new Set(['/api/sessione', '/api/entra', '/api/sondaggio', '/api/sondaggio/voto']);

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
  // In minuscolo tutti e due: new URL() abbassa l'host da se, l'intestazione
  // Host no. In locale l'host e sempre "127.0.0.1:4173" e non si vede
  // differenza; con un dominio vero un Host scritto «Dominio.it» farebbe
  // rifiutare al pannello ogni salvataggio, e nessuno capirebbe perche.
  return host !== String(req.headers.host || '').toLowerCase();
}

function durataLeggibile(ms) {
  const minuti = Math.ceil(ms / 60000);
  return minuti <= 1 ? 'meno di un minuto' : minuti + ' minuti';
}

/* --- IL PRIMO ACCESSO ----------------------------------------------- */

/*
   Finche server/dati/auth.json non esiste, POST /api/entra non controlla la
   password: la crea. In locale e la cosa giusta — chi apre il pannello sul
   proprio computer e il proprietario, e non c e nessun altro.

   Su un sito pubblico no. Fra il momento in cui Plesk avvia l applicazione e
   il momento in cui il proprietario apre il pannello passa del tempo,
   /pannello/ e uno dei percorsi che i bot provano di serie, e chi arriva
   primo si sceglie la password e si prende il sito. Non e un rischio
   teorico: e una porta aperta con un cartello sopra.

   Quindi, da CONTRATTO-6:
   - da un indirizzo locale (lo stesso computer, la stessa rete di casa o
     d ufficio) la creazione resta libera: in locale non cambia niente;
   - da fuori serve che chi amministra abbia acceso SB_PRIMO_ACCESSO=1 nelle
     variabili dell applicazione. Si accende, si crea la password, si
     spegne: e un interruttore, non una porta di servizio.

   Dietro Plesk il proxy sta spesso sulla stessa macchina, e senza
   SB_DIETRO_PROXY=1 ogni visitatore sembrerebbe 127.0.0.1: e il motivo per
   cui la regola «locale» da sola non basterebbe e serve l interruttore.
   Per questo qui, e solo qui, conta anche la semplice PRESENZA di
   X-Forwarded-For: se c e, la richiesta e passata da qualche parte prima di
   arrivare, quindi non e un accesso locale, e chi ha dimenticato di
   dichiarare il proxy non si ritrova comunque la porta aperta. Falsificare
   quell intestazione non serve a niente: l unica cosa che se ne ottiene e
   essere rifiutati. Vale la stessa regola del freno ai tentativi — quello
   che scrive chi chiama non gli puo mai far guadagnare qualcosa.

   A password creata questo controllo non esiste piu — sta dentro il ramo del
   primo avvio — quindi una variabile lasciata accesa per dimenticanza non
   apre proprio niente.

   Il 403 non racconta niente che non si sappia gia: GET /api/sessione dice
   da sempre `primoAvvio`, e il pannello ne ha bisogno per mostrare la
   schermata di creazione.
*/
const MESSAGGIO_PRIMO_ACCESSO = 'Il pannello non ha ancora una password e questo non è un accesso locale. ' +
  'Chi amministra il sito deve accendere SB_PRIMO_ACCESSO=1 nelle variabili dell\'applicazione, ' +
  'creare la password, e poi spegnerla.';

function primoAccessoPermesso(req) {
  const acceso = String(process.env.SB_PRIMO_ACCESSO || '').trim().toLowerCase();
  if (acceso === '1' || acceso === 'si' || acceso === 'true') { return true; }
  if (req.headers['x-forwarded-for'] !== undefined) { return false; }
  return auth.richiestaLocale(req);
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
    manutenzione: costruisci.inManutenzione(),
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
    // Quello che serve all'editor e non sta nello schema (CONTRATTO-4 §7):
    // i font caricati con i loro usi, e i due elenchi del generatore
    // condiviso, cosi il pannello non se ne scrive una copia.
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

  // Le modifiche si sovrappongono a quelle salvate: il pannello puo mandare
  // solo cio che ha toccato senza che il resto sparisca. I rami dell'editor
  // si sostituiscono in blocco (archivio.unisci) e si ripuliscono prima
  // della convalida: un valore storto si scarta, non ferma il resto.
  const unito = costruisci.pulisciEditor(archivio.unisci(archivio.leggi(), corpo));

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
  const iFollower = await twitch.aggiornaFollower();
  const leClip = await twitch.aggiornaClip();
  const iNumeri = await twitch.aggiornaNumeri();
  // Prima di generare: la categoria in onda finisce nell evento speciale
  // acceso, e genera() la rilegge da server/dati/twitch-diretta.json.
  const laCategoria = await twitch.aggiornaCategoria();
  // Anche le emote prima di generare: genera() le rilegge da
  // server/dati/twitch-emote.json per le frasi del pollo in «Chi sono».
  const leEmote = await twitch.aggiornaEmote();
  const gliIscritti = await youtube.aggiornaIscritti();
  const esito = costruisci.genera();
  // `controlli` sono avvertimenti d'insieme, non errori: la pubblicazione e
  // riuscita comunque, e il pannello li mostra dopo invece di trattarli come
  // un fallimento.
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

/**
 * Anteprima dei contenuti ancora in modifica: il pannello manda quello che
 * ha nei campi, si rende e si butta via. Non si scrive niente e non si
 * convalida: convalidare qui vorrebbe dire negare l'anteprima proprio
 * quando serve, cioe mentre un campo e a meta.
 *
 * Le modifiche si sovrappongono a quelle salvate come nella PUT, cosi il
 * pannello puo mandare solo cio che ha toccato.
 *
 * Con `editor: true` (CONTRATTO-4 §6.3) la pagina esce pronta per l'editor:
 * senza script, con <base href="/"> e con i due <style> dell'editor sempre
 * presenti. Senza, resta quella di prima.
 */
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

/* --- COLLEGAMENTO A TWITCH PER I NUMERI -----------------------------
   Il pulsante «Collegati per i numeri» del pannello (server/lib/twitch.js
   spiega il perche' di tutta l'autorizzazione). Qui sta solo il ponte fra
   il browser e le funzioni gia' scritte per la riga di comando:

     POST /api/twitch/collega        comincia, da' il codice da inserire
     POST /api/twitch/collega/stato  un tentativo, chiamato dal browser
                                      ogni pochi secondi finche' dura
     POST /api/twitch/scollega       toglie l'autorizzazione

   collegamentoPendente vive in memoria come le sessioni: un riavvio del
   server lo cancella, e va bene cosi', perche' un solo amministratore
   alla volta preme questo pulsante — chi lo ritrova a meta' preme di
   nuovo Collegati e riparte da zero. */
let collegamentoPendente = null;   // { avvio, scadeAlle } oppure null

function rottaTwitchStato(req, res) {
  json(res, 200, twitch.infoCollegamento());
}

async function rottaTwitchCollega(req, res) {
  let avvio;
  try {
    avvio = await twitch.iniziaCollegamento();
  } catch (errore) {
    // Il motivo piu' comune e' le chiavi mancanti: e' un errore di chi
    // amministra, non del server, quindi 422 e non 500 (risposte.js).
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
    // Un guaio vero (rete, chiavi sparite nel frattempo): si racconta e
    // si azzera, cosi' il pannello mostra di nuovo il bottone di partenza
    // invece di continuare a interrogare un tentativo che non puo' riuscire.
    collegamentoPendente = null;
    json(res, 200, { stato: 'fallito', messaggio: (errore && errore.message) || 'Errore imprevisto.' });
    return;
  }

  if (esito.stato !== 'confermato') { json(res, 200, { stato: esito.stato }); return; }

  collegamentoPendente = null;
  // Si aggiornano subito anche i numeri, come fa --collega da terminale:
  // chi ha appena collegato vuole vedere il risultato, non aspettare il
  // giro automatico di dieci minuti. Se questo giro fallisce il
  // collegamento resta comunque fatto: e' un avviso in piu', non un motivo
  // per disfare quello che ha funzionato.
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

/* --- FONT CARICATI (CONTRATTO-4 §7) -------------------------------- */

function rottaElencoFont(req, res) {
  json(res, 200, { font: font.elencoConUso(archivio.leggi()) });
}

async function rottaCaricaFont(req, res) {
  const corpo = await leggiCorpo(req, MAX_FONT);
  json(res, 201, { ok: true, font: font.salva(corpo, req.headers['content-type']) });
}

/** `?forza=1` e la conferma esplicita di chi amministra: senza, un font in uso risponde 409. */
function rottaEliminaFont(req, res, id, forza) {
  const esito = font.elimina(id, archivio.leggi(), { forza: forza });
  json(res, 200, { ok: true, eliminato: esito.id, usatoIn: esito.usatoIn });
}

/* --- PASSWORD ------------------------------------------------------ */

/**
 * Cambio della password dal pannello. La sessione da sola non basta: serve
 * anche la password attuale, altrimenti un computer lasciato aperto
 * basterebbe a cambiare la serratura. I tentativi sbagliati hanno un
 * contatore loro, separato da quello dell'accesso.
 *
 * 403 e non 401 per la password attuale sbagliata: 401 vuol dire «sessione
 * scaduta» per tutto il resto del pannello, che riporterebbe alla schermata
 * d'accesso proprio chi e dentro e ha solo sbagliato a scrivere.
 */
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

/* --- BACKUP -------------------------------------------------------- */

function rottaElencoBackup(req, res) {
  json(res, 200, { backup: backup.elenco() });
}

function rottaRipristina(req, res, id) {
  const esito = backup.ripristina(id);
  const clip = costruisci.allineaClipDopoRipristino();
  const statoSito = costruisci.allineaStatoDopoRipristino();
  json(res, 200, { ok: true, ripristinati: esito.ripristinati, backup: esito.backup, clip: clip, statoSito: statoSito });
}

/* --- SONDAGGI ------------------------------------------------------ */

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

/* --- ROUTER -------------------------------------------------------- */

function metodoNonAmmesso(res, ammessi) {
  errore(res, 405, 'Metodo non ammesso su questa rotta. Ammessi: ' + ammessi + '.');
}

/** Un id preso dal percorso: la codifica sbagliata e un 400, non un 500. */
function decodifica(pezzo) {
  try { return decodeURIComponent(pezzo); } catch (e) {
    throw erroreHttp(400, 'L identificativo nel percorso non e codificato correttamente.');
  }
}

async function gestisci(req, res, percorso) {
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;
  const modifica = metodo === 'POST' || metodo === 'PUT' || metodo === 'DELETE';
  const conSessione = auth.autenticato(req);

  // Il freno per indirizzo (CONTRATTO-6 §4.2) sta prima di tutto il resto:
  // e il controllo che costa meno, e chi sta martellando non deve nemmeno
  // farci leggere un Origin. Vale solo per chi scrive senza una sessione
  // valida — il perche, e il perche di 120 al minuto, e in
  // autenticazione.js, accanto al contatore.
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
