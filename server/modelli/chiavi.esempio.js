'use strict';
/* =====================================================================
   chiavi.esempio.js — il modello da copiare.

   COSA FARNE
     Copia questo file in  server/dati/chiavi.js  e riempi le due
     stringhe. Oppure, se preferisci non toccare niente a mano:

       node server/imposta-twitch.js <clientId> <clientSecret>

     lo scrive da se, con gli stessi commenti.

   DOVE SI TROVANO LE DUE CHIAVI
     Su https://dev.twitch.tv/console/apps, nella scheda della TUA
     applicazione — una sola, la stessa che usi per il login del sito.
     Il Client ID e li in chiaro; il secret si genera col bottone
     «New Secret» e Twitch te lo mostra UNA VOLTA sola.

     Se non hai ancora registrato l'applicazione, le istruzioni passo
     passo sono nel capitolo «Registrare l'applicazione su Twitch» di
     docs/PANNELLO.md.

   A COSA SERVONO
     - il Client ID fa funzionare «Collegati con Twitch» sul sito;
     - le due insieme fanno aggiornare da se «Ultima diretta» e la
       vetrina delle clip, a ogni pubblicazione e poi ogni dieci minuti.

     Senza questo file il sito funziona lo stesso: semplicemente quei due
     pezzi restano come li hai scritti a mano, e il bottone del login non
     compare.

   REGOLA UNICA, E NON NEGOZIABILE
     server/dati/chiavi.js NON si carica online e NON si mette nel
     controllo di versione. Il .gitignore lo esclude gia. Il Client ID
     sarebbe anche pubblico per natura, ma il secret che gli sta accanto
     no: chi ce l'ha puo parlare a Twitch a nome della tua applicazione.
   ===================================================================== */

module.exports = {
  twitch: {
    // Una trentina di caratteri, tutte minuscole e cifre.
    clientId: '',

    // SEGRETO. Non finisce mai nella pagina, ne in contenuti.json.
    clientSecret: ''
  }
};
