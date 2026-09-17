'use strict';
/* =====================================================================
   app.js — il file d'avvio del sito su un hosting con Node.

   E l'unico file che l'hosting deve conoscere: nell estensione Node di
   Plesk si scrive «app.js» nella casella del file d'avvio e basta. Da qui
   parte lo stesso server di server/server.js — stesse rotte, stesse API,
   stesso pannello — con le tre differenze che separano una cartella sul
   proprio computer da una macchina che sta su internet:

     - l'indirizzo: 0.0.0.0 invece di 127.0.0.1, perche la richiesta arriva
       dal server web e non da questo processo;
     - la porta: quella che passa l'hosting (PORT), non una scelta nostra;
     - le stampe: una riga, non il riquadro d'avvio, perche dall altra parte
       non c e nessuno che guarda un terminale — c e un file di log.

   Tutto il resto si configura con le variabili d'ambiente, elencate in
   .env.esempio e spiegate una per una in docs/HOSTING.md.

   Si puo lanciare anche a mano, ed e il modo giusto di provare la
   configurazione dell hosting prima di caricarla:

       PORT=4288 SB_HOST=127.0.0.1 node app.js
   ===================================================================== */

/* --- PRIMA DI QUALUNQUE ALTRA COSA ----------------------------------- */

// Il fuso orario, e va fatto qui: prima di ogni `require`, e quindi prima
// che nasca il primo oggetto Date del processo. Node legge TZ una volta
// sola, alla prima data che costruisce, e da quel momento non la rilegge
// piu in modo affidabile. Gli orari di questo sito sono italiani — la
// schedule della settimana, «Ultima diretta», la data della pubblicazione —
// e un hosting configurato in UTC farebbe cadere il lunedi sera di
// domenica. Se qualcuno ha gia scelto un fuso, il suo vince.
if (!process.env.TZ) { process.env.TZ = 'Europe/Rome'; }

// Lo stdout di un processo gestito da Passenger e un file di log, non un
// terminale: puo essere ruotato, chiuso o riaperto sotto i piedi del
// processo. Senza questi due ascoltatori un EPIPE su una console.log
// diventerebbe un'eccezione non gestita, cioe un sito giu per una riga di
// registro. Le stampe si perdono, il sito no.
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

// L'indirizzo di ascolto. Da app.js si ascolta su tutte le interfacce,
// perche chi bussa e il server web dell hosting; in locale
// `node server/server.js` resta su 127.0.0.1, come e sempre stato.
// Chi vuole provare app.js sul proprio computer passa SB_HOST=127.0.0.1 e
// riottiene il comportamento di prima.
if (!process.env.SB_HOST) { process.env.SB_HOST = '0.0.0.0'; }

/* --- AVVIO ------------------------------------------------------------ */

/**
 * Un guasto di configurazione (SB_DATI che punta a una cartella non
 * scrivibile, contenuti.json illeggibile) va raccontato in chiaro e in
 * italiano nel log dell applicazione: la schermata che vedrebbe il
 * visitatore e sempre e solo un 503 di Passenger, e senza una riga come
 * questa non resterebbe niente da leggere per capire cosa e successo.
 */
function racconta(err) {
  console.error('');
  console.error('  slayer_beard: avvio non riuscito.');
  console.error('  ' + (err && err.message ? err.message : err));
  if (err && err.stack && !err.codice) { console.error(err.stack); }
  console.error('');
}

try {
  const server = require('./server/server.js');

  // `silenzioso` toglie le righe pensate per il terminale: il riquadro della
  // prima password, «Sito -> http://localhost:...» (che su un hosting
  // sarebbe per giunta un indirizzo falso) e «Ctrl+C per fermare».
  const istanza = server.avvia({ silenzioso: true });

  // La riga sola, e solo quando l'ascolto e davvero cominciato: dice quello
  // che serve a chi legge il log per capire se l'hosting ha lanciato la cosa
  // giusta — dove ascolta e quale cartella sta servendo.
  // `prependListener` e non `on` perche server.js ha gia agganciato la sua
  // richiamata a `listen()`: senza, la riga d'avvio uscirebbe dopo le note
  // dell aggiornamento automatico, cioe in mezzo al registro invece che in
  // cima.
  istanza.prependListener('listening', () => {
    const { P } = require('./server/lib/percorsi.js');
    console.log('slayer_beard in ascolto su ' + server.HOST + ':' + server.PORTA + ' — radice ' + P.radice);
  });
} catch (err) {
  racconta(err);
  // Uscire con 1 e la risposta giusta: Passenger lo vede, smette di
  // riprovare all infinito e lascia l'errore nel log invece di nasconderlo
  // dietro un processo che gira senza servire niente.
  process.exit(1);
}
