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
   ===================================================================== */

const path = require('node:path');

// La radice del progetto e la cartella che contiene `server/`.
const RADICE_PREDEFINITA = path.resolve(__dirname, '..', '..');

function calcola(radice) {
  return {
    radice: radice,

    // Output della generazione: non si scrivono mai a mano. Sono tre, non
    // due: css/tema.css nasce da config.tema come index.html nasce dai testi.
    indexHtml: path.join(radice, 'index.html'),
    cartellaJs: path.join(radice, 'js'),
    datiJs: path.join(radice, 'js', 'dati.js'),
    temaCss: path.join(radice, 'css', 'tema.css'),

    // Contenuti e schema.
    cartellaContenuti: path.join(radice, 'contenuti'),
    contenutiJson: path.join(radice, 'contenuti', 'contenuti.json'),
    schemaJs: path.join(radice, 'contenuti', 'schema.js'),
    media: path.join(radice, 'contenuti', 'media'),

    // Modelli del sito (agente A).
    modelli: path.join(radice, 'modelli'),
    modelloIndex: path.join(radice, 'modelli', 'index.html'),
    parziali: path.join(radice, 'modelli', 'parziali'),
    icone: path.join(radice, 'modelli', 'icone'),

    // Il resto del sito.
    immagini: path.join(radice, 'img'),
    pannello: path.join(radice, 'pannello'),
    css: path.join(radice, 'css'),

    // Roba del server: non esce mai dal browser.
    server: path.join(radice, 'server'),
    dati: path.join(radice, 'server', 'dati'),
    auth: path.join(radice, 'server', 'dati', 'auth.json'),
    // TUTTE le chiavi del sito, in un file solo: da qui le prendono il
    // login del sito, «Ultima diretta» e la vetrina delle clip. Sta
    // accanto alla password del pannello perche e la stessa categoria di
    // cosa: roba locale, che non esce mai da questo computer.
    chiavi: path.join(radice, 'server', 'dati', 'chiavi.js'),
    modelloChiavi: path.join(radice, 'server', 'modelli', 'chiavi.esempio.js'),
    backup: path.join(radice, 'server', 'backup'),
    modelloDati: path.join(radice, 'server', 'modelli', 'dati.js.tpl')
  };
}

const P = calcola(process.env.SB_RADICE ? path.resolve(process.env.SB_RADICE) : RADICE_PREDEFINITA);

/** Sposta tutti i percorsi su un'altra radice, mutando `P` sul posto. */
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

module.exports = { P, imposta, risolviDentro, eDentro, RADICE_PREDEFINITA };
