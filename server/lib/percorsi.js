'use strict';
/* =====================================================================
   percorsi.js — dove stanno le cose, e come non uscire dalla radice.

   Un solo posto decide i percorsi del progetto: tutti gli altri moduli li
   leggono da qui. Si costruiscono sempre con path.join, perche il progetto
   gira su Windows ma deve comportarsi identico su Linux e macOS.

   `P` e un oggetto vivo: `imposta()` ne riscrive le chiavi al volo invece
   di restituirne uno nuovo. Serve al collaudo, che ricrea il progetto in
   una cartella temporanea e ci fa girare generazione e server senza
   toccare i file veri; i moduli che hanno gia fatto `const { P } = ...`
   vedono i valori nuovi.

   Due cartelle si possono portare FUORI dalla radice con una variabile
   d'ambiente, e su un hosting e la cosa piu importante di questo file:
   SB_DATI e SB_BACKUP (in fondo).
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

// La radice del progetto e la cartella che contiene `server/`.
const RADICE_PREDEFINITA = path.resolve(__dirname, '..', '..');

function calcola(radice) {
  return {
    radice: radice,

    // Output della generazione: non si scrivono mai a mano. Sono tre, non
    // due: css/tema.css nasce da config.tema come index.html nasce dai testi.
    indexHtml: path.join(radice, 'index.html'),
    // La pagina di tutte le clip. E il quarto file generato, e sta a parte
    // dai tre di sempre perche a volte non si scrive affatto: senza clip non
    // esiste, e se le clip si spengono va tolta (server/lib/costruisci.js).
    clipHtml: path.join(radice, 'clip.html'),
    cartellaJs: path.join(radice, 'js'),
    datiJs: path.join(radice, 'js', 'dati.js'),
    temaCss: path.join(radice, 'css', 'tema.css'),

    // Contenuti e schema.
    cartellaContenuti: path.join(radice, 'contenuti'),
    contenutiJson: path.join(radice, 'contenuti', 'contenuti.json'),
    schemaJs: path.join(radice, 'contenuti', 'schema.js'),
    media: path.join(radice, 'contenuti', 'media'),
    // I font caricati dal pannello (CONTRATTO-4 §4.4): i file e il loro
    // elenco. Come media/, la cartella va online insieme al sito.
    font: path.join(radice, 'contenuti', 'font'),
    elencoFont: path.join(radice, 'contenuti', 'font', 'elenco.json'),

    // Modelli del sito (agente A).
    modelli: path.join(radice, 'modelli'),
    modelloIndex: path.join(radice, 'modelli', 'index.html'),
    modelloClip: path.join(radice, 'modelli', 'clip.html'),
    parziali: path.join(radice, 'modelli', 'parziali'),
    icone: path.join(radice, 'modelli', 'icone'),

    // Il resto del sito.
    immagini: path.join(radice, 'img'),
    pannello: path.join(radice, 'pannello'),
    css: path.join(radice, 'css'),

    // Roba del server: non esce mai dal browser. `dati` e `backup` sono le
    // due cartelle che SB_DATI e SB_BACKUP possono portare fuori dalla
    // radice quando il sito sta su un hosting (vedi in fondo al file).
    server: path.join(radice, 'server'),
    dati: path.join(radice, 'server', 'dati'),
    auth: path.join(radice, 'server', 'dati', 'auth.json'),
    // TUTTE le chiavi del sito, in un file solo: da qui le prendono il
    // login del sito, «Ultima diretta» e la vetrina delle clip. Sta
    // accanto alla password del pannello perche e la stessa categoria di
    // cosa: roba locale, che non esce mai da questo computer.
    chiavi: path.join(radice, 'server', 'dati', 'chiavi.js'),
    modelloChiavi: path.join(radice, 'server', 'modelli', 'chiavi.esempio.js'),
    // L'autorizzazione che slayer_beard da UNA volta al server, per leggere
    // follower e abbonati. Non sta in chiavi.js perche non si scrive a mano
    // e cambia da sola: Twitch rinnova il refresh token a ogni uso.
    accessoTwitch: path.join(radice, 'server', 'dati', 'twitch-accesso.json'),
    // Che cosa sta trasmettendo il canale, letto da Twitch alla
    // pubblicazione: serve al gioco degli eventi speciali. Non sta in
    // contenuti.json apposta — non e roba scritta da chi amministra, e un
    // file che cambia da se accanto ai contenuti farebbe sembrare che ci
    // sia sempre una bozza da pubblicare.
    direttaTwitch: path.join(radice, 'server', 'dati', 'twitch-diretta.json'),
    // Le emote del canale e quelle globali, lette alla pubblicazione per le
    // frasi del pollo in «Chi sono». Stessa ragione del file qui sopra.
    emoteTwitch: path.join(radice, 'server', 'dati', 'twitch-emote.json'),
    sondaggi: path.join(radice, 'server', 'dati', 'sondaggi.json'),
    backup: path.join(radice, 'server', 'backup'),
    modelloDati: path.join(radice, 'server', 'modelli', 'dati.js.tpl')
  };
}

/* --- LE DUE CARTELLE CHE POSSONO STARE FUORI DALLA RADICE ------------ */

/*
   In locale la radice del progetto e una cartella sul proprio computer e
   nessuno la serve al pubblico: server/dati/ e server/backup/ stanno bene
   dove stanno. Su un hosting, invece, la radice del progetto e anche la
   document root del sito: se un giorno .htaccess non viene letto — su
   Plesk succede quando i file statici li serve nginx — server/dati/auth.json
   (l'impronta della password) e server/dati/chiavi.js (il secret di Twitch)
   diventano scaricabili da chiunque conosca il percorso.

   SB_DATI e SB_BACKUP spostano quelle due cartelle dove il server web non
   arriva. E la protezione che non dipende dalla configurazione del server
   web: una password sbagliata in un file di configurazione si corregge, un
   secret gia scaricato no.

   Entrambe sono facoltative: senza, non cambia niente.
*/

/** Il valore della variabile, risolto in assoluto; null se non c'e o e vuota. */
function cartellaDaAmbiente(nome) {
  const grezzo = process.env[nome];
  if (grezzo === undefined || String(grezzo).trim() === '') { return null; }
  return path.resolve(String(grezzo).trim());
}

/**
 * Crea la cartella indicata dall'ambiente, o spiega perche non si puo.
 * Si controlla all'avvio e non al primo salvataggio, perche ripiegare in
 * silenzio su server/dati/ vorrebbe dire rimettere i segreti dentro il sito
 * proprio mentre chi lo ha configurato crede di averli portati fuori.
 */
function assicuraCartellaEsterna(cartella, nome) {
  try {
    fs.mkdirSync(cartella, { recursive: true });
  } catch (e) {
    const err = new Error(
      nome + ' indica "' + cartella + '", ma quella cartella non esiste e non si puo creare (' +
      (e && e.message ? e.message : e) + ').\n' +
      '  Crea la cartella e dalle i permessi di scrittura, oppure togli ' + nome + ' dall ambiente.');
    err.codice = 'SB_CARTELLA';
    throw err;
  }
  return cartella;
}

/** Applica SB_DATI e SB_BACKUP a un insieme di percorsi, mutandolo sul posto. */
function applicaAmbiente(percorsi) {
  const dati = cartellaDaAmbiente('SB_DATI');
  if (dati) {
    assicuraCartellaEsterna(dati, 'SB_DATI');
    percorsi.dati = dati;
    percorsi.auth = path.join(dati, 'auth.json');
    percorsi.chiavi = path.join(dati, 'chiavi.js');
    percorsi.accessoTwitch = path.join(dati, 'twitch-accesso.json');
    percorsi.direttaTwitch = path.join(dati, 'twitch-diretta.json');
    percorsi.emoteTwitch = path.join(dati, 'twitch-emote.json');
    percorsi.sondaggi = path.join(dati, 'sondaggi.json');
  }

  const backup = cartellaDaAmbiente('SB_BACKUP');
  if (backup) {
    assicuraCartellaEsterna(backup, 'SB_BACKUP');
    percorsi.backup = backup;
  }

  return percorsi;
}

const P = applicaAmbiente(calcola(process.env.SB_RADICE ? path.resolve(process.env.SB_RADICE) : RADICE_PREDEFINITA));

/**
 * Sposta tutti i percorsi su un'altra radice, mutando `P` sul posto.
 *
 * SB_DATI e SB_BACKUP qui NON si applicano, ed e voluto: `imposta()` la usa
 * il collaudo per rinchiudere tutto in una cartella temporanea, e il
 * collaudo scrive davvero una password di prova. Se rispettasse SB_DATI, un
 * `node server/autotest.js` lanciato sull hosting riscriverebbe l auth.json
 * vero — cioe farebbe fuori la password del pannello.
 */
function imposta(radice) {
  const nuovi = calcola(path.resolve(radice));
  for (const chiave of Object.keys(P)) { delete P[chiave]; }
  Object.assign(P, nuovi);
  return P;
}

/**
 * Risolve un percorso di richiesta dentro `base`.
 * Restituisce null se il risultato cade fuori: e l'unico controllo che serve,
 * perche vale per `..`, per `%2e%2e`, per `....//` e per qualunque altra
 * codifica — il confronto avviene sul percorso gia normalizzato dal sistema.
 */
function risolviDentro(base, relativo) {
  const grezzo = String(relativo == null ? '' : relativo);
  // Un NUL nel percorso e sempre un tentativo di troncare la stringa: fuori.
  if (grezzo.indexOf('\0') !== -1) { return null; }

  // I separatori Windows arrivati dall'esterno diventano `/`, cosi `..\..\x`
  // viene intercettato anche su Linux, dove `\` non separa niente.
  const normalizzato = grezzo.replace(/\\/g, '/');
  const conSlash = normalizzato.startsWith('/') ? normalizzato : '/' + normalizzato;

  const baseRisolta = path.resolve(base);
  const assoluto = path.resolve(baseRisolta, '.' + conSlash);

  if (assoluto !== baseRisolta && !assoluto.startsWith(baseRisolta + path.sep)) { return null; }
  return assoluto;
}

/** Vero se `percorso` sta dentro `base` (o coincide). */
function eDentro(base, percorso) {
  const b = path.resolve(base);
  const p = path.resolve(percorso);
  return p === b || p.startsWith(b + path.sep);
}

module.exports = { P, imposta, risolviDentro, eDentro, applicaAmbiente, RADICE_PREDEFINITA };
