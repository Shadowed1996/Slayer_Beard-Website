/* =====================================================================
   dati.js — i dati che il front-end legge a runtime (CONTRATTO §6.3).

   FILE GENERATO: lo riscrivono `node server/genera.js` e la pubblicazione
   dal pannello, a partire da contenuti/contenuti.json e da questo modello
   (server/modelli/dati.js.tpl). Qualunque modifica fatta a mano qui dentro
   sparisce alla generazione successiva: si cambia il contenuto, non il
   file generato.

   A `twitch.domini` la generazione aggiunge sempre localhost e 127.0.0.1;
   il player ci mette da se location.hostname.

   Generato il 2026-09-05T22:30:58.569Z.
   ===================================================================== */
window.DATI = {
  "twitch": {
    "canale": "slayer_beard",
    "idUtente": "47738247",
    "domini": [
      "localhost",
      "127.0.0.1"
    ]
  },
  "orari": {
    "giorni": [
      1,
      3,
      5,
      0
    ],
    "ora": "21:00",
    "fuso": "Europe/Rome",
    "durataOre": 4
  },
  "email": "slayerbeard@gmail.com",
  "ultimaDiretta": "Little Nightmares 3 w/ @Mobscene93",
  "testi": {
    "statoLive": "In onda adesso",
    "statoOffline": "Fuori onda",
    "statoVerifica": "Controllo il canale",
    "chatApri": "Mostra la chat",
    "chatChiudi": "Nascondi la chat",
    "etichettaOggi": "Oggi",
    "etichettaProssima": "Prossima",
    "copiaBtn": "Copia l'email",
    "copiaFatto": "Copiata"
  }
};
