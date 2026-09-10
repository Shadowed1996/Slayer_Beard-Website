'use strict';
/* =====================================================================
   imposta-twitch.js — collega il server locale a Twitch.

   Uso:  node server/imposta-twitch.js <clientId> <clientSecret>
         node server/imposta-twitch.js --togli
         node server/imposta-twitch.js --prova

   Scrive server/dati/twitch.json, che serve a una cosa sola: alla
   pubblicazione, chiedere a Twitch il titolo dell'ultima diretta e
   scriverlo nei contenuti, cosi «Ultima diretta» resta fresca anche per
   chi visita il sito senza collegare nessun account.

   IL SECRET NON VA DA NESSUN'ALTRA PARTE. Non nello schema, non in
   contenuti.json, non nel sito generato. Quello che finisce nella pagina
   e solo il Client ID del gruppo «Profilo del sito», che e pubblico per
   natura. Questo file sta accanto alla password del pannello, in una
   cartella che non si carica online: e lo stesso genere di segreto, e si
   tratta allo stesso modo.
   ===================================================================== */

const fs = require('node:fs');

const { P } = require('./lib/percorsi');
const { scriviAtomico, assicuraCartella, leggiSeEsiste } = require('./lib/file');
const twitch = require('./lib/twitch');

function aiuto() {
  console.error('');
  console.error('  Uso: node server/imposta-twitch.js <clientId> <clientSecret>');
  console.error('');
  console.error('  Le due chiavi stanno su dev.twitch.tv/console/apps, nella scheda');
  console.error('  dell applicazione. Puo essere la stessa app del «Profilo del sito»:');
  console.error('  il Client ID e lo stesso, il secret si genera li con «New Secret».');
  console.error('');
  console.error('  Altri comandi:');
  console.error('    --prova   chiede a Twitch il titolo dell ultima diretta, senza scrivere niente');
  console.error('    --togli   cancella il collegamento (il sito continua a funzionare)');
  console.error('');
}

function scrivi(clientId, clientSecret) {
  assicuraCartella(P.dati);
  scriviAtomico(P.twitch, JSON.stringify({
    clientId: clientId,
    clientSecret: clientSecret,
    scrittoIl: new Date().toISOString()
  }, null, 2) + '\n');

  // Su Linux e macOS toglie il file dagli occhi degli altri utenti del
  // computer. Su Windows i permessi POSIX non esistono e chmod non fa
  // niente: non e un errore, e non deve fermare il comando.
  try { fs.chmodSync(P.twitch, 0o600); } catch (e) { /* Windows: nessun permesso POSIX */ }
}

async function prova() {
  if (!twitch.configurato()) {
    console.error('');
    console.error('  Non c e nessun collegamento da provare: ' + P.twitch + ' non esiste.');
    console.error('');
    process.exit(1);
  }
  console.log('');
  console.log('  Chiedo a Twitch...');
  const esito = await twitch.aggiornaUltimaDiretta();
  console.log('  ' + twitch.racconta(esito));
  console.log('');
  // Un fallimento qui e un fallimento del comando: chi lo lancia sta
  // proprio verificando che funzioni.
  if (esito.stato === 'fallito' || esito.stato === 'senzaCanale') { process.exit(1); }
}

function togli() {
  if (leggiSeEsiste(P.twitch) === null) {
    console.log('');
    console.log('  Non c era nessun collegamento da togliere.');
    console.log('');
    return;
  }
  fs.unlinkSync(P.twitch);
  console.log('');
  console.log('  Collegamento con Twitch tolto.');
  console.log('  «Ultima diretta» torna a essere un campo scritto a mano nel pannello.');
  console.log('');
}

async function esegui() {
  const argomenti = process.argv.slice(2);

  if (argomenti[0] === '--togli') { return togli(); }
  if (argomenti[0] === '--prova') { return prova(); }
  if (argomenti.length !== 2) { aiuto(); process.exit(1); }

  const clientId = String(argomenti[0]).trim();
  const clientSecret = String(argomenti[1]).trim();

  // Stessa forbice della convalida del campo nel pannello: il formato lo
  // decide Twitch, quindi si rifiuta cio che e palesemente sbagliato e non
  // cio che e diverso da trenta caratteri esatti.
  if (!/^[a-z0-9]{25,35}$/.test(clientId)) {
    console.error('');
    console.error('  Quello non sembra un Client ID: sono una trentina di caratteri,');
    console.error('  tutte minuscole e cifre. Hai per caso invertito ID e secret?');
    console.error('');
    process.exit(1);
  }
  if (clientSecret.length < 20) {
    console.error('');
    console.error('  Quello non sembra un client secret: e troppo corto.');
    console.error('');
    process.exit(1);
  }

  const cambio = leggiSeEsiste(P.twitch) !== null;
  scrivi(clientId, clientSecret);
  // Le credenziali sono cambiate: il token in cache non vale piu niente.
  twitch.dimenticaToken();

  console.log('');
  console.log('  Collegamento con Twitch ' + (cambio ? 'aggiornato' : 'creato') + ' in ' + P.twitch);
  console.log('  Il file NON va caricato online e non va messo sotto controllo di versione.');
  console.log('');
  console.log('  Provalo con:  node server/imposta-twitch.js --prova');
  console.log('');
}

if (require.main === module) {
  esegui().catch((errore) => {
    console.error('');
    console.error('  Non ha funzionato: ' + (errore && errore.message ? errore.message : String(errore)));
    console.error('');
    process.exit(1);
  });
}

module.exports = { esegui };
