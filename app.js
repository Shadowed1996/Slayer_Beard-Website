'use strict';

if (!process.env.TZ) { process.env.TZ = 'Europe/Rome'; }

process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

if (!process.env.SB_HOST) { process.env.SB_HOST = '0.0.0.0'; }

function racconta(err) {
  console.error('');
  console.error('  slayer_beard: avvio non riuscito.');
  console.error('  ' + (err && err.message ? err.message : err));
  if (err && err.stack && !err.codice) { console.error(err.stack); }
  console.error('');
}

try {
  const server = require('./server/server.js');

  const istanza = server.avvia({ silenzioso: true });

  istanza.prependListener('listening', () => {
    const { P } = require('./server/lib/percorsi.js');
    console.log('slayer_beard in ascolto su ' + server.HOST + ':' + server.PORTA + ' — radice ' + P.radice);
  });
} catch (err) {
  racconta(err);
  process.exit(1);
}
