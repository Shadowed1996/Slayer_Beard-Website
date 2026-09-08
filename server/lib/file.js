'use strict';
/* =====================================================================
   file.js — le poche operazioni su disco che si ripetono ovunque.
   La scrittura atomica e la ragione principale per cui questo file esiste:
   la pubblicazione non deve poter lasciare un index.html a meta.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

/** Crea la cartella (e i genitori) se non c'e. */
function assicuraCartella(cartella) {
  fs.mkdirSync(cartella, { recursive: true });
}

/**
 * Scrittura atomica: si scrive un file temporaneo nella stessa cartella e lo
 * si rinomina. `rename` dentro lo stesso volume e atomico su Windows, Linux e
 * macOS: se il processo muore a meta resta il file vecchio, intero.
 */
function scriviAtomico(percorso, dati) {
  assicuraCartella(path.dirname(percorso));
  const temporaneo = percorso + '.tmp';
  fs.writeFileSync(temporaneo, dati);
  try {
    fs.renameSync(temporaneo, percorso);
  } catch (errore) {
    // Se il rename fallisce (antivirus, file aperto altrove) il temporaneo
    // resta li a sporcare: meglio toglierlo e far risalire l'errore vero.
    try { fs.unlinkSync(temporaneo); } catch (e) { /* gia sparito */ }
    throw errore;
  }
}

/** Contenuto del file, o `null` se non esiste. Gli altri errori risalgono. */
function leggiSeEsiste(percorso, codifica) {
  try {
    return fs.readFileSync(percorso, codifica === undefined ? 'utf8' : codifica);
  } catch (errore) {
    if (errore.code === 'ENOENT') { return null; }
    throw errore;
  }
}

/** Vero se il percorso esiste ed e un file leggibile. */
function eFile(percorso) {
  try { return fs.statSync(percorso).isFile(); } catch (e) { return false; }
}

/** Vero se il percorso esiste ed e una cartella. */
function eCartella(percorso) {
  try { return fs.statSync(percorso).isDirectory(); } catch (e) { return false; }
}

module.exports = { assicuraCartella, scriviAtomico, leggiSeEsiste, eFile, eCartella };
