'use strict';
/* =====================================================================
   genera.js — genera il sito e basta, senza avviare niente.

   Uso:  node server/genera.js

   E il comando della pubblicazione: legge contenuti/contenuti.json, lo
   controlla contro contenuti/schema.js, rende modelli/index.html e
   server/modelli/dati.js.tpl, calcola css/tema.css da config.tema, e
   scrive i tre file dopo aver messo da parte una copia di quello che
   c'era prima.

   Esce con codice 1 se qualcosa non torna, cosi si puo incatenare a un
   comando di caricamento senza rischiare di pubblicare un sito rotto.
   ===================================================================== */

const path = require('node:path');

const { P } = require('./lib/percorsi');
const costruisci = require('./lib/costruisci');
const chiavi = require('./lib/chiavi');
const twitch = require('./lib/twitch');
const youtube = require('./lib/youtube');

/* Cosa e successo alla riga «Sitemap:» di robots.txt, detto in italiano.
   Il file non e della generazione: lo prepara chi mette in piedi l'hosting,
   e qui si aggiunge soltanto quella riga. Se manca non e un guaio. */
const ROBOTS = {
  'aggiornato': 'riga Sitemap: aggiunta in fondo a robots.txt',
  'gia a posto': 'robots.txt aveva gia la riga Sitemap: giusta',
  'non c\'e': 'robots.txt non c\'e: la riga Sitemap: va aggiunta a mano quando ci sara',
  'non scritto': 'robots.txt non si e potuto scrivere: la riga Sitemap: va aggiunta a mano',
  'non provato': 'robots.txt non toccato'
};

function byteLeggibili(n) {
  if (n < 1024) { return n + ' B'; }
  if (n < 1024 * 1024) { return (n / 1024).toFixed(1) + ' kB'; }
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function esegui() {
  console.log('');
  console.log('  Generazione del sito');
  console.log('  radice: ' + P.radice);
  console.log('');

  // Prima di generare, non dopo: aggiornaUltimaDiretta() scrive dentro
  // contenuti.json, e costruisci.genera() lo rilegge da capo. Invertire i
  // due passi vorrebbe dire pubblicare il titolo vecchio e trovarselo
  // giusto solo alla pubblicazione successiva.
  //
  // costruisci.genera() resta sincrona apposta: l unica cosa che ha
  // bisogno della rete e questa riga, e tenerla fuori significa che una
  // generazione senza collegamento a Twitch e identica a prima.
  // Prima di tutto il Client ID: sta in server/dati/chiavi.js insieme al
  // secret, e da li deve arrivare fino dentro la pagina.
  const daChiavi = chiavi.sincronizzaClientId();
  if (chiavi.racconta(daChiavi)) { console.log('  ' + chiavi.racconta(daChiavi)); }

  const daTwitch = await twitch.aggiornaUltimaDiretta();
  if (daTwitch.stato !== 'spento') { console.log('  ' + twitch.racconta(daTwitch)); }
  const iFollower = await twitch.aggiornaFollower();
  if (iFollower.stato !== 'spento') { console.log('  ' + twitch.raccontaFollower(iFollower)); }
  const leClip = await twitch.aggiornaClip();
  if (leClip.stato !== 'spento') { console.log('  ' + twitch.raccontaClip(leClip)); }
  const iNumeri = await twitch.aggiornaNumeri();
  if (iNumeri.stato !== 'spento') { console.log('  ' + twitch.raccontaNumeri(iNumeri)); }
  // Che cosa c e in onda proprio adesso: lo mostra l evento speciale acceso
  // al posto del gioco scritto a mano (server/lib/costruisci.js, eventiDi).
  // Va chiesto qui e non dentro genera(): la generazione resta sincrona.
  const laCategoria = await twitch.aggiornaCategoria();
  if (laCategoria.stato !== 'spento') { console.log('  ' + twitch.raccontaCategoria(laCategoria)); }
  // Gli iscritti dei canali YouTube dei social (server/lib/youtube.js).
  const gliIscritti = await youtube.aggiornaIscritti();
  if (youtube.racconta(gliIscritti)) { console.log('  ' + youtube.racconta(gliIscritti)); }
  if (daTwitch.stato !== 'spento' || leClip.stato !== 'spento' || iNumeri.stato !== 'spento' || chiavi.racconta(daChiavi) ||
      youtube.racconta(gliIscritti)) { console.log(''); }

  const esito = costruisci.genera();

  for (const scritto of esito.scritti) {
    console.log('  scritto   ' + scritto.file.padEnd(14) + byteLeggibili(scritto.byte));
  }

  // La pagina di tutte le clip: c'e solo se il sito ha delle clip, quindi va
  // detto in tutti e tre i casi — scritta, tolta, o non c'era niente da fare.
  // Chi pubblica deve sapere se quel file adesso e online, perche il bottone
  // in testa alla «diretta» ci porta.
  const pagina = esito.paginaClip;
  if (pagina && pagina.stato === 'scritta') {
    console.log('  scritto   ' + pagina.file.padEnd(14) + byteLeggibili(pagina.byte));
  } else if (pagina && pagina.stato === 'tolta') {
    console.log('  tolta     clip.html: le clip sono spente o non ce n e nessuna');
  } else if (pagina && pagina.stato === 'non tolta') {
    console.log('  clip.html non si e potuta togliere (' + pagina.errore + '): va cancellata a mano');
  }

  // La sitemap si scrive solo quando l'indirizzo del sito e noto — dal
  // pannello o da SB_SITO (CONTRATTO-6 §4.3) — e va detto in tutti e due i
  // casi: chi pubblica deve sapere se il file c'e, e se non c'e, perche.
  const mappa = esito.sitemap;
  if (mappa && mappa.byte) {
    console.log('  scritto   ' + mappa.file.padEnd(14) + byteLeggibili(mappa.byte) + '   ' + mappa.indirizzo);
    console.log('  robots    ' + (ROBOTS[mappa.robots] || mappa.robots));
  } else if (mappa) {
    console.log('  sitemap   non scritta: ' + mappa.errore);
  } else {
    console.log('  sitemap   niente: manca l indirizzo pubblico (campo del pannello o SB_SITO)');
  }

  const stato = esito.statoSito;
  if (stato && stato.byte) {
    console.log('  scritto   ' + stato.file + '  ' + byteLeggibili(stato.byte) + '   manutenzione: ' + (stato.manutenzione ? 'si' : 'no'));
  } else if (stato) {
    console.log('  ' + stato.file + ' non scritto (' + stato.errore + '): le pagine gia aperte non se ne accorgono');
  }

  if (esito.manutenzione && esito.manutenzione.attiva) {
    console.log('  manutenzione ' + esito.manutenzione.pagine.join(' e ') +
      ' sono la pagina di manutenzione: per riaprire il sito spegni la modalita e ripubblica');
  }
  console.log('  backup    ' + esito.backup);
  console.log('  elenchi   ' + esito.social + ' social, ' + esito.supporto + ' righe di supporto (le voci senza link restano fuori)');
  console.log('');
  console.log('  Fatto in ' + esito.durataMs + ' ms. index.html, js/dati.js e css/tema.css');
  console.log('  sono pronti da pubblicare.');

  // Gli avvertimenti d'insieme (server/lib/controlli.js) NON sono errori: il
  // sito e stato generato lo stesso. Si stampano qui in fondo perche il
  // momento in cui servono e esattamente questo, quando si sta per caricare
  // online quello che si e appena generato.
  if (Array.isArray(esito.controlli) && esito.controlli.length) {
    console.log('');
    console.log('  Da guardare prima di mandarlo online:');
    for (const avvertimento of esito.controlli) {
      console.log('    - ' + avvertimento.chiave);
      console.log('      ' + avvertimento.messaggio);
    }
  }
  console.log('');
}

function racconta(err) {
  console.error('');
  console.error('  GENERAZIONE FALLITA');
  console.error('  ' + (err && err.message ? err.message : String(err)));

  // Gli errori di convalida arrivano tutti insieme: si stampano tutti.
  if (err && Array.isArray(err.errori)) {
    console.error('');
    for (const e of err.errori) { console.error('    - ' + e.chiave + ': ' + e.messaggio); }
    console.error('');
    console.error('  Correggi i contenuti (dal pannello o in contenuti/contenuti.json) e riprova.');
  }
  if (err && Array.isArray(err.problemi)) {
    console.error('');
    for (const p of err.problemi) { console.error('    - ' + p.messaggio); }
    console.error('');
    console.error('  Sistema contenuti/schema.js: deve descrivere tutte le chiavi, e solo quelle che esistono.');
  }
  // Gli errori del motore di template sanno gia file e riga: si vede subito
  // quale segnaposto e sbagliato.
  if (err && err.name === 'ErroreModello') {
    console.error('');
    console.error('  Il problema e nel modello, alla riga indicata qui sopra.');
  }
  console.error('');
}

if (require.main === module) {
  esegui().catch((err) => {
    racconta(err);
    process.exit(1);
  });
}

module.exports = { esegui };
