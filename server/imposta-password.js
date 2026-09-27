'use strict';

const auth = require('./lib/autenticazione');
const { P } = require('./lib/percorsi');

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
  console.log('  Le sessioni aperte nel pannello sono chiuse: si rientra con la password nuova.');
  console.log('');
} catch (errore) {
  console.error('');
  console.error('  Non ho potuto impostare la password: ' + errore.message);
  console.error('');
  process.exit(1);
}
