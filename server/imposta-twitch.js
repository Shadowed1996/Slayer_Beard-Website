'use strict';
/* =====================================================================
   imposta-twitch.js — collega il server locale a Twitch.

   Uso:  node server/imposta-twitch.js <clientId> <clientSecret>
         node server/imposta-twitch.js --togli
         node server/imposta-twitch.js --prova

   Scrive server/dati/chiavi.js, che e l'unico posto in cui stanno le
   chiavi del sito. Da li le prendono tutti:

     - il login «Collegati con Twitch» (serve il solo Client ID, che alla
       pubblicazione viene copiato nel campo del pannello e quindi nella
       pagina);
     - «Ultima diretta» e la vetrina delle clip, che con la coppia
       completa prendono un app token e chiedono a Twitch.

   IL SECRET NON VA DA NESSUN'ALTRA PARTE. Non nello schema, non in
   contenuti.json, non nel sito generato. Quel file sta accanto alla
   password del pannello, in una cartella che non si carica online: e lo
   stesso genere di segreto, e si tratta allo stesso modo.

   Il file si puo anche scrivere a mano, copiando
   server/modelli/chiavi.esempio.js: e un normale file JavaScript, con le
   istruzioni dentro.
   ===================================================================== */

const fs = require('node:fs');

const { P } = require('./lib/percorsi');
const { scriviAtomico, assicuraCartella, leggiSeEsiste } = require('./lib/file');
const chiavi = require('./lib/chiavi');
const twitch = require('./lib/twitch');

function aiuto() {
  console.error('');
  console.error('  Uso: node server/imposta-twitch.js <clientId> <clientSecret>');
  console.error('');
  console.error('  Scrive server/dati/chiavi.js, l unico file in cui stanno le chiavi.');
  console.error('  Le due escono dalla stessa scheda su dev.twitch.tv/console/apps: una');
  console.error('  sola applicazione, il Client ID in chiaro e il secret da «New Secret».');
  console.error('');
  console.error('  In alternativa si scrive a mano, copiando');
  console.error('  server/modelli/chiavi.esempio.js in server/dati/chiavi.js.');
  console.error('');
  console.error('  Altri comandi:');
  console.error('    --prova   chiede a Twitch il titolo dell ultima diretta, senza scrivere niente');
  console.error('    --togli   cancella il collegamento (il sito continua a funzionare)');
  console.error('');
}

function scrivi(clientId, clientSecret) {
  assicuraCartella(P.dati);
  scriviAtomico(P.chiavi, chiavi.componi({ twitch: { clientId: clientId, clientSecret: clientSecret } }));

  // Su Linux e macOS toglie il file dagli occhi degli altri utenti del
  // computer. Su Windows i permessi POSIX non esistono e chmod non fa
  // niente: non e un errore, e non deve fermare il comando.
  try { fs.chmodSync(P.chiavi, 0o600); } catch (e) { /* Windows: nessun permesso POSIX */ }
}

async function prova() {
  if (!twitch.configurato()) {
    console.error('');
    console.error('  Non c e nessun collegamento da provare: ' + P.chiavi + ' non esiste,');
    console.error('  oppure non ha tutte e due le chiavi.');
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
  if (leggiSeEsiste(P.chiavi) === null) {
    console.log('');
    console.log('  Non c era nessun collegamento da togliere.');
    console.log('');
    return;
  }
  fs.unlinkSync(P.chiavi);
  console.log('');
  console.log('  Collegamento con Twitch tolto: ' + P.chiavi + ' cancellato.');
  console.log('  «Ultima diretta» e le clip tornano a essere campi scritti a mano, e il');
  console.log('  bottone del login sparisce alla prossima pubblicazione.');
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

  const cambio = leggiSeEsiste(P.chiavi) !== null;
  scrivi(clientId, clientSecret);
  // Le credenziali sono cambiate: il token in cache non vale piu niente.
  twitch.dimenticaToken();

  console.log('');
  console.log('  Chiavi ' + (cambio ? 'aggiornate' : 'scritte') + ' in ' + P.chiavi);
  console.log('  E l unico posto in cui stanno: da qui le prendono il login del sito,');
  console.log('  «Ultima diretta» e la vetrina delle clip.');
  console.log('');
  console.log('  Il file NON va caricato online e non va messo sotto controllo di versione.');
  console.log('');
  console.log('  Provalo con:  node server/imposta-twitch.js --prova');
  console.log('  Poi pubblica, cosi il Client ID arriva anche nella pagina.');
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
