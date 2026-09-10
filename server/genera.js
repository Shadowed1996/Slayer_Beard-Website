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
const twitch = require('./lib/twitch');

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
  const daTwitch = await twitch.aggiornaUltimaDiretta();
  if (daTwitch.stato !== 'spento') { console.log('  ' + twitch.racconta(daTwitch)); console.log(''); }

  const esito = costruisci.genera();

  for (const scritto of esito.scritti) {
    console.log('  scritto   ' + scritto.file.padEnd(14) + byteLeggibili(scritto.byte));
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
