/* =====================================================================
   ritorno.js — la finestrella che torna da Twitch

   Vive due decimi di secondo e fa una cosa sola: quando questa pagina è
   stata aperta come finestrella dal sito stesso e Twitch l'ha rimandata
   indietro con un token nel frammento, passa quel token alla pagina che
   l'ha aperta e si chiude. Dall'altra parte c'è js/account.js.

   PERCHÉ ESISTE. Il login di Twitch è un implicit grant, cioè una
   navigazione: fatta nella stessa scheda, al ritorno la pagina si
   ricarica da capo. Ricaricare la pagina vuol dire spegnere la modalità
   lurk e far ripartire il video — cioè rompere, per fare il login,
   esattamente la sessione che il login doveva accompagnare. Con la
   finestrella la pagina non si muove: il video continua a girare, il
   lurk resta acceso, e il messaggio parte appena il token arriva.

   PERCHÉ È IL PRIMO SCRIPT DELLA PAGINA, E NON HA `defer`. Deve girare
   PRIMA che qualcuno monti il player: dentro la finestrella un secondo
   player di Twitch sarebbe una seconda sessione video aperta a nome
   della stessa persona, che è la cosa vietata dal CONTRATTO-3 §3.4.
   Gli script del sito sono tutti `defer`, quindi girano dopo l'analisi
   del documento: questo, che non ce l'ha, gira durante, e chiude la
   finestrella prima che l'analizzatore arrivi al player.

   In una visita normale non fa assolutamente niente: senza `opener` e
   senza token nel frammento esce alla seconda riga.
   ===================================================================== */
(function () {
  'use strict';

  // La finestra che ci ha aperti. In una visita normale non c'è, e in una
  // finestrella aperta da un altro sito la lettura può lanciare: in
  // entrambi i casi qui non c'è niente da fare.
  var madre = null;
  try { madre = window.opener; } catch (err) { madre = null; }
  if (!madre || madre === window) { return; }

  var grezzo = location.hash ? location.hash.slice(1) : '';
  if (!grezzo || (grezzo.indexOf('access_token=') === -1 && grezzo.indexOf('error=') === -1)) { return; }

  // Le coppie del frammento, senza fidarsi dei pezzi malformati.
  var p = {};
  grezzo.split('&').forEach(function (pezzo) {
    var uguale = pezzo.indexOf('=');
    if (uguale <= 0) { return; }
    try {
      p[decodeURIComponent(pezzo.slice(0, uguale))] = decodeURIComponent(pezzo.slice(uguale + 1).replace(/\+/g, ' '));
    } catch (err) { /* pezzo storto: si scarta */ }
  });

  var dati = {
    tipo: 'sb-account-ritorno',
    state: p.state || '',
    access_token: p.access_token || '',
    error: p.error || ''
  };

  // Il frammento non arriva ai log dei server, ma resta nella cronologia:
  // vale anche per una finestrella che sta per sparire.
  try { history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* pazienza */ }

  // La consegna vera. `location.origin` come destinatario: il token non
  // deve poter finire a nessun'altra origine, nemmeno per sbaglio.
  try { madre.postMessage(dati, location.origin); } catch (err) { /* si prova l'altra strada */ }

  // La rete di sicurezza. Se un giorno Twitch mettesse una
  // Cross-Origin-Opener-Policy sulle sue pagine di login, `window.opener`
  // sparirebbe e la riga qui sopra non arriverebbe da nessuna parte.
  // BroadcastChannel parla fra schede della stessa origine senza bisogno
  // di nessuna parentela, e come postMessage non tocca il disco.
  try {
    if (typeof BroadcastChannel === 'function') {
      var canale = new BroadcastChannel('sb-account');
      canale.postMessage(dati);
      canale.close();
    }
  } catch (err) { /* browser senza canale: resta postMessage */ }

  // Chiudersi è l'ultima cosa, dopo aver consegnato. Se il browser si
  // rifiutasse, la finestrella finirebbe di caricare il sito: il
  // frammento è già stato ripulito qui sopra, quindi js/account.js non
  // troverebbe niente da rileggere e non succederebbe niente due volte.
  try { window.close(); } catch (err) { /* resta aperta: la chiude chi l'ha aperta */ }
}());
