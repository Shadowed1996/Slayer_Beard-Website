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

   Generato il 2026-09-06T16:23:08.017Z.
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
  },
  "pollo": {
    "attivo": true,
    "chatVera": true,
    "mostraMessaggi": false,
    "frasi": {
      "riposo": [
        "Il pollaio è aperto.",
        "Becco qualcosa e aspetto.",
        "Tutto tranquillo, per ora.",
        "Coccodè."
      ],
      "click": [
        "Coccodè. Ti apro la chat.",
        "Il pollaio è di qua.",
        "Chat aperta: scrivi pure.",
        "Beccato. Ecco la chat."
      ],
      "chat": [
        "{nome} ha scritto in chat!",
        "{nome} si è fatto sentire.",
        "C'è {nome} nel pollaio.",
        "Coccodè, parla {nome}.",
        "Qualcuno ha scritto nel pollaio.",
        "Si muove la chat. Coccodè."
      ],
      "scrive": [
        "Ti ascolto...",
        "Sto leggendo.",
        "Dimmi pure, sono qui.",
        "Orecchie dritte."
      ],
      "live": [
        "Siamo in onda!",
        "Luce accesa, si comincia.",
        "In onda: il pollaio si riempie."
      ],
      "lurk": [
        "Restiamo accesi, ci penso io.",
        "Tengo la diretta viva. Coccodè.",
        "Vai pure, il pollaio resta aperto.",
        "Sorveglio io lo schermo."
      ],
      "offline": [
        "Fuori onda. Il pollaio dorme.",
        "Zzz.",
        "Niente diretta adesso: la settimana è qui sotto.",
        "Luce spenta. Si riparte la prossima serata."
      ]
    },
    "testi": {
      "etichetta": "Apri la chat del canale",
      "nascondi": "Nascondi il pollo"
    }
  },
  "lurk": {
    "attivo": true,
    "tieniSchermoAcceso": false,
    "oreMax": 3,
    "messaggio": {
      "attivo": false,
      "clientId": "",
      "urlRitorno": "",
      "frasi": []
    },
    "testi": {
      "accendi": "Attiva la modalità lurk",
      "spegni": "Disattiva",
      "audio": "Togli il muto (aiuta a non far sospendere la scheda)",
      "ripresa": "L'avevi lasciata accesa: la riattivo?",
      "ciSei": "Ci sei ancora? Senza risposta spengo la modalità lurk.",
      "ciSono": "Sono qui",
      "statoSpento": "Spenta.",
      "statoVivo": "Attiva: il video sta andando.",
      "statoFermo": "Il video si è fermato.",
      "statoRiparto": "Rimetto in moto il video...",
      "statoBloccato": "Il browser ha bloccato la riproduzione: tocca il player per farlo partire.",
      "statoAttesa": "Il canale è fuori onda: non c'è niente da tenere vivo.",
      "statoResa": "Non ci riesco più. Ricarica la pagina.",
      "statoNiente": "Da qui non posso: non ho i comandi del player.",
      "conto": "Viva da {durata}",
      "contoRiavvii": "Viva da {durata} · {riavvii} riavvii",
      "entra": "Collegati con Twitch",
      "esci": "Scollega e revoca",
      "collegato": "Collegato come {nome}",
      "manda": "Di' in chat che stai guardando",
      "anteprima": "Manderò questo messaggio a nome tuo:",
      "conferma": "Manda",
      "annulla": "Annulla",
      "altraFrase": "Un'altra frase",
      "inviato": "Fatto: il messaggio è in chat."
    }
  }
};
