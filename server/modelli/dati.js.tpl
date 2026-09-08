/* =====================================================================
   dati.js — i dati che il front-end legge a runtime (CONTRATTO §6.3,
   esteso dal CONTRATTO-2 §6.3 col ramo `pollo`).

   FILE GENERATO: lo riscrivono `node server/genera.js` e la pubblicazione
   dal pannello, a partire da contenuti/contenuti.json e da questo modello
   (server/modelli/dati.js.tpl). Qualunque modifica fatta a mano qui dentro
   sparisce alla generazione successiva: si cambia il contenuto, non il
   file generato.

   Qui dentro c'è solo testo semplice: i campi di tipo `ricco` restano
   nell'HTML, dove il modello li stampa già sanificati. Quello che arriva
   fin qui finisce in attributi e in `textContent`, e l'HTML non ci
   servirebbe a niente.

   A `twitch.domini` la generazione aggiunge sempre localhost e 127.0.0.1;
   il player ci mette da sé location.hostname.

   Generato il {{sito.generatoIl}}.
   ===================================================================== */
window.DATI = {{{dati}}};
