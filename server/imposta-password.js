'use strict';
/* =====================================================================
   imposta-password.js — crea o cambia la password del pannello.

   Uso:  node server/imposta-password.js <nuova password>

   Riscrive server/dati/auth.json con l'hash scrypt della password nuova.
   La password in chiaro non viene salvata da nessuna parte e non viene
   ristampata: se la si dimentica se ne imposta un altra, non si recupera.
   ===================================================================== */

const auth = require('./lib/autenticazione');
const { P } = require('./lib/percorsi');

// Tutto quello che segue il nome dello script e la password: cosi funziona
// anche senza virgolette quando contiene spazi.
const nuova = process.argv.slice(2).join(' ').trim();

if (!nuova) {
  console.error('');
  console.error('  Uso: node server/imposta-password.js <nuova password>');
  console.error('');
  console.error('  Esempio:  node server/imposta-password.js pollaio-viola-4712');
  console.error('  Serve una password di almeno ' + auth.MIN_PASSWORD + ' caratteri.');
  console.error('');
  process.exit(1);
}

try {
  const cambio = auth.esistePassword();
  auth.impostaPassword(nuova);
  console.log('');
  console.log('  Password ' + (cambio ? 'aggiornata' : 'creata') + ' in ' + P.auth);
  console.log('  Riavvia il server perche le sessioni aperte decadano.');
  console.log('');
} catch (errore) {
  console.error('');
  console.error('  Non ho potuto impostare la password: ' + errore.message);
  console.error('');
  process.exit(1);
}
