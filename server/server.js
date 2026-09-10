'use strict';
/* =====================================================================
   server.js — il server di amministrazione del sito slayer_beard.

   Serve tre cose e nient'altro:
     /          il sito statico, cosi com'e sul disco
     /pannello/ il pannello di modifica
     /api/*     le API JSON che il pannello consuma

   Il sito pubblicato non ha bisogno di questo processo: index.html e
   js/dati.js sono file statici e continuano a funzionare a server spento.
   Qui dentro si amministra, e basta.

   Avvio:  node server/server.js            (porta 4173, o SB_PORTA)
           node server/server.js --guarda   rigenera a ogni modifica

   Se il collegamento con Twitch e configurato (server/dati/twitch.json),
   finche questo processo gira tiene fresche da se «Ultima diretta» e la
   vetrina delle clip: un giro ogni SB_AGGIORNA_MIN minuti, 10 di serie.
   Con SB_AGGIORNA_MIN=0 non parte, e resta solo l'aggiornamento alla
   pubblicazione.
   ===================================================================== */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { P } = require('./lib/percorsi');
const { errore } = require('./lib/risposte');
const auth = require('./lib/autenticazione');
const statico = require('./lib/statico');
const api = require('./lib/api');
const archivio = require('./lib/archivio');
const controlli = require('./lib/controlli');
const costruisci = require('./lib/costruisci');
const twitch = require('./lib/twitch');
const schema = require('../contenuti/schema.js');

const PORTA = Number(process.env.SB_PORTA) || 4173;
const HOST = process.env.SB_HOST || '127.0.0.1';
const ANTIRIMBALZO_MS = 250;

// Ogni quanto chiedere a Twitch. Dieci minuti perche il titolo di una
// diretta cambia poche volte al giorno e il VOD compare quando la diretta
// finisce: piu spesso non porterebbe niente, e piu di rado si vedrebbe.
// Un app token ha un tetto larghissimo, quindi il limite non e li.
const AGGIORNA_MIN = process.env.SB_AGGIORNA_MIN === undefined ? 10 : Number(process.env.SB_AGGIORNA_MIN);

// Il primo giro non parte insieme al server: le righe d'avvio devono
// restare leggibili, e un errore di rete stampato in mezzo le spezzerebbe.
const PRIMO_GIRO_MS = 4000;

/* --- MESSAGGI DI AVVIO --------------------------------------------- */

/**
 * Riquadro in ASCII puro: le cornici Unicode su un cmd.exe con la tabella
 * codici sbagliata diventano illeggibili, e questa e proprio la riga che
 * non deve andare persa.
 */
function riquadro(righe) {
  const larghezza = righe.reduce((m, r) => Math.max(m, r.length), 0) + 2;
  const bordo = '+' + '-'.repeat(larghezza) + '+';
  return ['', bordo, ...righe.map((r) => '| ' + r + ' '.repeat(larghezza - r.length - 1) + '|'), bordo, ''].join('\n');
}

/** Controlli che conviene fare all'avvio, quando qualcuno sta guardando. */
function controlliIniziali() {
  const contenuti = archivio.leggi();

  // La copertura la calcola lo schema, che conosce i propri tipi: qui non
  // c e nessun elenco di tipi da tenere allineato, ed e il motivo per cui
  // i quattro tipi nuovi (ricco, colore, font, interruttore) non hanno
  // richiesto una riga in questo file.
  const scoperte = schema.verificaCopertura(contenuti);
  if (scoperte.length) {
    console.log('  ATTENZIONE: contenuti/schema.js non copre i contenuti.');
    for (const p of scoperte) { console.log('    - ' + p.messaggio); }
    // Un «tipo sconosciuto» quasi sempre vuol dire che lo schema usa un tipo
    // nuovo senza averlo aggiunto al proprio elenco TIPI: dal messaggio da
    // solo non si capisce dove mettere le mani.
    if (scoperte.some((p) => p.tipo === 'tipo')) {
      console.log('');
      console.log('  Un tipo sconosciuto si corregge in cima a contenuti/schema.js, nell elenco');
      console.log('  TIPI: oltre a quelli storici devono esserci ricco, colore, font e interruttore.');
    }
    console.log('  Finche resta cosi, la generazione si rifiuta di partire.');
    console.log('');
  }

  if (!fs.existsSync(P.modelloIndex)) {
    console.log('  ATTENZIONE: manca modelli/index.html: non si puo generare niente.');
    console.log('');
  }
  if (!fs.existsSync(P.indexHtml) || !fs.existsSync(P.temaCss)) {
    // css/tema.css conta quanto index.html: senza, il sito gira sui soli
    // valori di partenza di tokens.css e i colori scelti nel pannello non
    // si vedono da nessuna parte.
    const mancanti = [];
    if (!fs.existsSync(P.indexHtml)) { mancanti.push('index.html'); }
    if (!fs.existsSync(P.temaCss)) { mancanti.push('css/tema.css'); }
    console.log('  Nota: ' + mancanti.join(' e ') +
      (mancanti.length > 1 ? ' non sono ancora stati generati.' : ' non e ancora stato generato.'));
    console.log('  Lancia "node server/genera.js" oppure premi Pubblica nel pannello.');
    console.log('');
  }

  // Gli avvertimenti d'insieme: non impediscono niente, ma sono le cose che
  // altrimenti si scoprono dal vivo, sul sito online, davanti a un player che
  // non parte o a un login che risponde «invalid client».
  const avvertimenti = controlli.controlli(contenuti);
  if (avvertimenti.length) {
    console.log('  Da guardare prima di mandare il sito online (' + controlli.riassumi(avvertimenti) + '):');
    for (const a of avvertimenti) {
      console.log('    - ' + a.chiave);
      console.log('      ' + a.messaggio);
    }
    console.log('');
  }

  if (!auth.esistePassword()) {
    console.log(riquadro([
      'PRIMO AVVIO - IL PANNELLO NON HA ANCORA UNA PASSWORD',
      '',
      'Apri http://localhost:' + PORTA + '/pannello/ e scegline una,',
      'oppure impostala da qui:',
      '',
      '    node server/imposta-password.js <password>',
      '',
      'Almeno ' + auth.MIN_PASSWORD + ' caratteri. Non viene mai salvata in chiaro.'
    ]));
  }
}

/* --- RICHIESTE ------------------------------------------------------ */

function gestisciErrore(res, err) {
  const stato = Number(err && err.stato) || 500;
  const messaggio = stato === 500
    ? 'Errore interno del server: il dettaglio e nel terminale.'
    : (err && err.message) || 'Richiesta non valida.';

  if (stato === 500) { console.error('[errore]', err && err.stack ? err.stack : err); }
  if (res.headersSent) { res.destroy(); return; }

  const extra = {};
  if (err && Array.isArray(err.errori)) { extra.errori = err.errori; }
  if (err && Array.isArray(err.problemi)) { extra.problemi = err.problemi; }
  if (err && Array.isArray(err.usatoDa)) { extra.usatoDa = err.usatoDa; }
  errore(res, stato, messaggio, extra);
}

function creaServer() {
  return http.createServer((req, res) => {
    // `res.req` serve agli aiuti in risposte.js per riconoscere le HEAD.
    res.req = req;

    let percorso;
    try {
      percorso = new URL(req.url, 'http://localhost').pathname;
    } catch (e) {
      errore(res, 400, 'Indirizzo della richiesta non valido.');
      return;
    }

    if (percorso === '/api' || percorso.startsWith('/api/')) {
      Promise.resolve()
        .then(() => api.gestisci(req, res, percorso))
        .catch((err) => gestisciErrore(res, err));
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      errore(res, 405, 'Sui file del sito sono ammessi solo GET e HEAD.');
      return;
    }

    try {
      if (!statico.servi(req, res, percorso)) {
        errore(res, 404, 'Pagina o file non trovato: ' + percorso);
      }
    } catch (err) {
      gestisciErrore(res, err);
    }
  });
}

/* --- SORVEGLIANZA (--guarda) ---------------------------------------- */

/**
 * Rigenera quando cambia una delle tre sorgenti della generazione:
 *   modelli/         il modello della pagina e i parziali
 *   contenuti/       testi, configurazione E TEMA (config.tema: colori,
 *                    font, forma e aloni stanno li dentro, quindi un
 *                    cambio di colori rigenera anche css/tema.css)
 *   server/modelli/  il modello di js/dati.js
 *
 * css/ NON si sorveglia, ed e voluto: la generazione ci scrive dentro
 * css/tema.css, e guardare la cartella vorrebbe dire rigenerare a ogni
 * rigenerazione, per sempre.
 *
 * Due accorgimenti, entrambi necessari:
 * - antirimbalzo, perche un salvataggio da editor produce tre o quattro
 *   eventi per lo stesso file;
 * - una bandiera durante la generazione, perche la generazione stessa
 *   riscrive contenuti.json (il timbro aggiornatoIl) e senza bandiera si
 *   rigenererebbe all'infinito.
 */
function sorveglia() {
  let attesa = null;
  let generazioneInCorso = false;
  let finitaAlle = 0;
  const osservatori = [];

  const rigenera = () => {
    attesa = null;
    generazioneInCorso = true;
    try {
      const esito = costruisci.genera();
      console.log('  [' + new Date().toLocaleTimeString('it-IT') + '] rigenerato in ' + esito.durataMs + ' ms: ' +
        esito.scritti.map((s) => s.file).join(', '));
    } catch (err) {
      console.error('  [' + new Date().toLocaleTimeString('it-IT') + '] rigenerazione fallita: ' + err.message);
      if (Array.isArray(err.errori)) {
        for (const e of err.errori) { console.error('      - ' + e.chiave + ': ' + e.messaggio); }
      }
    } finally {
      generazioneInCorso = false;
      finitaAlle = Date.now();
    }
  };

  const tocca = () => {
    // Gli eventi che arrivano mentre si genera, o subito dopo, sono i file
    // scritti dalla generazione stessa: si ignorano.
    if (generazioneInCorso || Date.now() - finitaAlle < ANTIRIMBALZO_MS) { return; }
    if (attesa) { clearTimeout(attesa); }
    attesa = setTimeout(rigenera, ANTIRIMBALZO_MS);
  };

  const guarda = (cartella, ricorsivo) => {
    if (!fs.existsSync(cartella)) { return; }
    try {
      osservatori.push(fs.watch(cartella, { recursive: ricorsivo === true }, tocca));
    } catch (e) {
      // fs.watch ricorsivo non c e ovunque (Linux con Node 18): si guardano
      // le sottocartelle una per una, che per modelli/ sono due.
      if (ricorsivo !== true) { return; }
      guarda(cartella, false);
      for (const voce of fs.readdirSync(cartella, { withFileTypes: true })) {
        if (voce.isDirectory()) { guarda(path.join(cartella, voce.name), false); }
      }
    }
  };

  guarda(P.modelli, true);
  guarda(P.cartellaContenuti, false);
  guarda(path.dirname(P.modelloDati), false);
  console.log('  Sorveglianza attiva su modelli/, contenuti/ e server/modelli/: salvo un file,');
  console.log('  il sito si rigenera — pagina, dati e tema.');
  return osservatori;
}

/* --- AGGIORNAMENTO AUTOMATICO DA TWITCH ------------------------------ */

/*
   «Ultima diretta» e le clip si aggiornano alla pubblicazione, ed e il
   posto giusto: e li che nasce il sito che vedra la gente. Ma se nessuno
   pubblica per una settimana, per una settimana quel campo resta indietro
   — che e esattamente il difetto per cui era stato scritto a mano.

   Quindi, finche questo processo gira, lo stesso lavoro si rifa da solo a
   intervalli. Non e un secondo modo di pubblicare: e lo stesso, chiamato
   da un timer invece che da un bottone.

   LA REGOLA CHE NON SI TOCCA. Salva e Pubblica sono due cose diverse, e
   un timer non puo diventare la scorciatoia che le confonde: chi ha
   salvato una bozza e non l'ha ancora pubblicata l'ha fatto apposta.
   Percio si guarda PRIMA se il sito pubblicato e gia allineato alla
   bozza: se lo e, si rigenera (l'unica differenza sara il titolo fresco);
   se non lo e, si aggiorna solo contenuti.json e si lascia la
   pubblicazione a chi di dovere, dicendolo.

   In modalita --guarda la distinzione e gia sospesa di suo — li qualunque
   salvataggio rigenera, ed e dichiarato — quindi non c'e niente da
   riconciliare: la sorveglianza vede cambiare contenuti.json e fa il
   resto da se.
*/
function aggiornamentoAutomatico(opzioni) {
  const scelte = opzioni || {};

  if (!Number.isFinite(AGGIORNA_MIN) || AGGIORNA_MIN <= 0) { return null; }
  if (!twitch.configurato()) {
    // Non e un errore: e lo stato di chi non ha registrato nessuna app.
    // Si dice una volta, perche il campo «Ultima diretta» scritto a mano e
    // proprio la cosa che qualcuno sta cercando di capire perche non cambia.
    console.log('  «Ultima diretta» e le clip restano come le hai scritte: manca il collegamento');
    console.log('  con Twitch. Si configura una volta sola, con node server/imposta-twitch.js');
    return null;
  }

  let inCorso = false;
  const ora = () => '[' + new Date().toLocaleTimeString('it-IT') + ']';

  const giro = async () => {
    // Due giri sovrapposti riscriverebbero contenuti.json a vicenda: se il
    // precedente non ha finito, questo salta e basta.
    if (inCorso) { return; }
    inCorso = true;
    try {
      // Si guarda com'era PRIMA di scrivere: aggiornaUltimaDiretta() tocca
      // contenuti.json, e dopo sembrerebbe sempre che ci sia una bozza in
      // attesa — cioe la condizione che deve fermarci.
      let allineato = false;
      try { allineato = api.statoDelSito(archivio.leggi()).daPubblicare === false; }
      catch (e) { allineato = false; }

      const daTwitch = await twitch.aggiornaUltimaDiretta();
      const leClip = await twitch.aggiornaClip();

      const cambiato = daTwitch.stato === 'aggiornato' || leClip.stato === 'aggiornato';

      // Si stampa solo cio che e successo davvero, e ogni riga risponde del
      // proprio esito: un server che ripete «gia aggiornata» ogni dieci
      // minuti diventa rumore, e il rumore nasconde la riga che conta.
      const dueRighe = [[daTwitch, twitch.racconta(daTwitch)], [leClip, twitch.raccontaClip(leClip)]];
      for (const [esito, riga] of dueRighe) {
        if (!riga) { continue; }
        if (esito.stato !== 'aggiornato' && esito.stato !== 'fallito') { continue; }
        console.log('  ' + ora() + ' ' + riga);
      }
      if (!cambiato) { return; }

      if (scelte.guarda) {
        // La sorveglianza ha gia visto cambiare contenuti.json e rigenera
        // da se: rigenerare anche qui vorrebbe dire farlo due volte.
        return;
      }
      if (!allineato) {
        console.log('  ' + ora() + ' Non ripubblico da solo: c e una bozza salvata e non ancora pubblicata.');
        console.log('           Premi Pubblica quando sei pronto e il titolo nuovo parte con lei.');
        return;
      }

      const esito = costruisci.genera();
      console.log('  ' + ora() + ' sito ripubblicato in ' + esito.durataMs + ' ms: ' +
        esito.scritti.map((x) => x.file).join(', '));
    } catch (err) {
      // Un giro andato storto non deve fermare il server ne i giri dopo.
      console.error('  ' + ora() + ' aggiornamento automatico non riuscito: ' + (err && err.message ? err.message : err));
    } finally {
      inCorso = false;
    }
  };

  const primo = setTimeout(giro, PRIMO_GIRO_MS);
  const battito = setInterval(giro, AGGIORNA_MIN * 60 * 1000);
  // unref: questi due timer non devono tenere vivo il processo da soli.
  primo.unref();
  battito.unref();

  console.log('  «Ultima diretta» e le clip si aggiornano da sole ogni ' + AGGIORNA_MIN +
    (AGGIORNA_MIN === 1 ? ' minuto' : ' minuti') + ', finche questo server gira.');
  return { giro: giro, ferma: () => { clearTimeout(primo); clearInterval(battito); } };
}

/* --- AVVIO ---------------------------------------------------------- */

function avvia(opzioni) {
  const scelte = opzioni || {};
  const server = creaServer();

  console.log('');
  console.log('  slayer_beard - server di amministrazione');
  console.log('  radice del progetto: ' + P.radice);
  console.log('');

  controlliIniziali();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\n  La porta ' + PORTA + ' e gia occupata.');
      console.error('  Chiudi l altro server, oppure cambia porta: SB_PORTA=4174 node server/server.js\n');
      process.exit(1);
    }
    console.error('\n  Errore del server: ' + err.message + '\n');
    process.exit(1);
  });

  server.listen(PORTA, HOST, () => {
    console.log('  Sito     ->  http://localhost:' + PORTA + '/');
    console.log('  Pannello ->  http://localhost:' + PORTA + '/pannello/');
    console.log('');
    if (scelte.guarda) { sorveglia(); }
    aggiornamentoAutomatico({ guarda: scelte.guarda === true });
    console.log('  Ctrl+C per fermare.');
    console.log('');
  });

  const ferma = (segnale) => {
    console.log('\n  Ricevuto ' + segnale + ': chiusura del server.');
    server.close(() => process.exit(0));
    // Se qualche connessione resta appesa non si aspetta all infinito.
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => ferma('SIGINT'));
  process.on('SIGTERM', () => ferma('SIGTERM'));

  return server;
}

if (require.main === module) {
  try {
    avvia({ guarda: process.argv.slice(2).indexOf('--guarda') !== -1 });
  } catch (err) {
    console.error('\n  Avvio non riuscito: ' + err.message + '\n');
    process.exit(1);
  }
}

module.exports = { creaServer, avvia, sorveglia, aggiornamentoAutomatico, PORTA, AGGIORNA_MIN };
