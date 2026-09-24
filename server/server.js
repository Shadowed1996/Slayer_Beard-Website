'use strict';

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
const chiavi = require('./lib/chiavi');
const twitch = require('./lib/twitch');
const youtube = require('./lib/youtube');
const giochi = require('./lib/giochi');
const schema = require('../contenuti/schema.js');

const PORTA = Number(process.env.PORT) || Number(process.env.SB_PORTA) || 4173;
const HOST = process.env.SB_HOST || '127.0.0.1';
const ANTIRIMBALZO_MS = 250;

const AGGIORNA_MIN = process.env.SB_AGGIORNA_MIN === undefined ? 10 : Number(process.env.SB_AGGIORNA_MIN);

const PRIMO_GIRO_MS = 4000;

function riquadro(righe) {
  const larghezza = righe.reduce((m, r) => Math.max(m, r.length), 0) + 2;
  const bordo = '+' + '-'.repeat(larghezza) + '+';
  return ['', bordo, ...righe.map((r) => '| ' + r + ' '.repeat(larghezza - r.length - 1) + '|'), bordo, ''].join('\n');
}

function controlliIniziali() {
  const contenuti = archivio.leggi();

  const scoperte = schema.verificaCopertura(contenuti);
  if (scoperte.length) {
    console.log('  ATTENZIONE: contenuti/schema.js non copre i contenuti.');
    for (const p of scoperte) { console.log('    - ' + p.messaggio); }
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
    const mancanti = [];
    if (!fs.existsSync(P.indexHtml)) { mancanti.push('index.html'); }
    if (!fs.existsSync(P.temaCss)) { mancanti.push('css/tema.css'); }
    console.log('  Nota: ' + mancanti.join(' e ') +
      (mancanti.length > 1 ? ' non sono ancora stati generati.' : ' non e ancora stato generato.'));
    console.log('  Lancia "node server/genera.js" oppure premi Pubblica nel pannello.');
    console.log('');
  }

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
  if (err && Array.isArray(err.usatoIn)) { extra.usatoIn = err.usatoIn; }
  errore(res, stato, messaggio, extra);
}

function creaServer() {
  const server = http.createServer((req, res) => {
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

  const ATTESA_RICHIESTA_MS = 30 * 1000;

  server.headersTimeout = ATTESA_RICHIESTA_MS;

  server.requestTimeout = 3 * 60 * 1000;

  server.keepAliveTimeout = 15 * 1000;

  server.connectionsCheckingInterval = 5 * 1000;

  const SPIA = Symbol('attesa della prima richiesta');

  server.on('connection', (presa) => {
    const spia = setTimeout(() => presa.destroy(), ATTESA_RICHIESTA_MS);
    spia.unref();
    presa[SPIA] = spia;
    presa.on('close', () => clearTimeout(spia));
  });

  server.on('request', (req) => {
    const spia = req.socket && req.socket[SPIA];
    if (spia) {
      clearTimeout(spia);
      req.socket[SPIA] = null;
    }
  });

  return server;
}

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
    if (generazioneInCorso || Date.now() - finitaAlle < ANTIRIMBALZO_MS) { return; }
    if (attesa) { clearTimeout(attesa); }
    attesa = setTimeout(rigenera, ANTIRIMBALZO_MS);
  };

  const guarda = (cartella, ricorsivo) => {
    if (!fs.existsSync(cartella)) { return; }
    try {
      osservatori.push(fs.watch(cartella, { recursive: ricorsivo === true }, tocca));
    } catch (e) {
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

function aggiornamentoAutomatico(opzioni) {
  const scelte = opzioni || {};

  if (!Number.isFinite(AGGIORNA_MIN) || AGGIORNA_MIN <= 0) { return null; }
  if (!twitch.configurato() && !chiavi.configurato() && !youtube.configurato()) {
    console.log('  «Ultima diretta» e le clip restano come le hai scritte: manca il collegamento');
    console.log('  con Twitch. Si configura una volta sola, con node server/imposta-twitch.js');
    return null;
  }

  let inCorso = false;
  const ora = () => '[' + new Date().toLocaleTimeString('it-IT') + ']';

  const giro = async () => {
    if (inCorso) { return; }
    inCorso = true;
    try {
      let allineato = false;
      try { allineato = api.statoDelSito(archivio.leggi()).daPubblicare === false; }
      catch (e) { allineato = false; }

      const daChiavi = chiavi.sincronizzaClientId();
      if (chiavi.racconta(daChiavi)) { console.log('  ' + ora() + ' ' + chiavi.racconta(daChiavi)); }

      const daTwitch = await twitch.aggiornaUltimaDiretta();
      const iFollower = await twitch.aggiornaFollower();
      const leClip = await twitch.aggiornaClip();
      const iNumeri = await twitch.aggiornaNumeri();
      const laCategoria = await twitch.aggiornaCategoria();
      const gliIscritti = await youtube.aggiornaIscritti();

      const cambiato = daChiavi.stato === 'copiato' ||
        daTwitch.stato === 'aggiornato' || iFollower.stato === 'aggiornato' ||
        leClip.stato === 'aggiornato' || iNumeri.stato === 'aggiornato' ||
        laCategoria.stato === 'aggiornato' || gliIscritti.stato === 'aggiornato' ||
        (laCategoria.stato === 'spenta' && !!laCategoria.precedente);

      const leRighe = [[daTwitch, twitch.racconta(daTwitch)], [iFollower, twitch.raccontaFollower(iFollower)],
        [leClip, twitch.raccontaClip(leClip)], [iNumeri, twitch.raccontaNumeri(iNumeri)],
        [laCategoria, twitch.raccontaCategoria(laCategoria)], [gliIscritti, youtube.racconta(gliIscritti)]];
      for (const [esito, riga] of leRighe) {
        if (!riga) { continue; }
        if (esito.stato !== 'aggiornato' && esito.stato !== 'fallito') { continue; }
        console.log('  ' + ora() + ' ' + riga);
      }
      if (!cambiato) { return; }

      if (scelte.guarda) {
        return;
      }
      if (!allineato) {
        console.log('  ' + ora() + ' Non ripubblico da solo: c e una bozza salvata e non ancora pubblicata.');
        console.log('           Premi Pubblica quando sei pronto e i dati nuovi partono con lei.');
        return;
      }

      const esito = costruisci.genera();
      console.log('  ' + ora() + ' sito ripubblicato in ' + esito.durataMs + ' ms: ' +
        esito.scritti.map((x) => x.file).join(', '));
    } catch (err) {
      console.error('  ' + ora() + ' aggiornamento automatico non riuscito: ' + (err && err.message ? err.message : err));
    } finally {
      inCorso = false;
    }
  };

  const primo = setTimeout(giro, PRIMO_GIRO_MS);
  const battito = setInterval(giro, AGGIORNA_MIN * 60 * 1000);
  primo.unref();
  battito.unref();

  console.log('  «Ultima diretta», le clip, follower e abbonati si aggiornano da soli ogni ' + AGGIORNA_MIN +
    (AGGIORNA_MIN === 1 ? ' minuto' : ' minuti') + ', finche questo server gira.');
  return { giro: giro, ferma: () => { clearTimeout(primo); clearInterval(battito); } };
}

function avvia(opzioni) {
  const scelte = opzioni || {};
  const zitto = scelte.silenzioso === true;
  const server = creaServer();

  if (!zitto) {
    console.log('');
    console.log('  slayer_beard - server di amministrazione');
    console.log('  radice del progetto: ' + P.radice);
    console.log('');
  }

  if (!zitto) {
    try { controlliIniziali(); }
    catch (err) { console.error('  Controlli iniziali saltati: ' + (err && err.message ? err.message : err)); }
  }

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
    if (!zitto) {
      console.log('  Sito     ->  http://localhost:' + PORTA + '/');
      console.log('  Pannello ->  http://localhost:' + PORTA + '/pannello/');
      console.log('');
    }
    if (scelte.guarda) { sorveglia(); }
    aggiornamentoAutomatico({ guarda: scelte.guarda === true });
    try { giochi.avviaControllo(); }
    catch (err) { console.error('  Controllo delle dirette per la pagina dei giochi non avviato: ' + (err && err.message ? err.message : err)); }
    if (!zitto) {
      console.log('  Ctrl+C per fermare.');
      console.log('');
    }
  });

  const ferma = (segnale) => {
    if (!zitto) { console.log('\n  Ricevuto ' + segnale + ': chiusura del server.'); }
    server.close(() => process.exit(0));
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

module.exports = { creaServer, avvia, sorveglia, aggiornamentoAutomatico, PORTA, HOST, AGGIORNA_MIN };
