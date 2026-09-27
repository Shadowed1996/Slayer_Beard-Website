'use strict';

const fs = require('node:fs');
const path = require('node:path');

function assicuraCartella(cartella) {
  fs.mkdirSync(cartella, { recursive: true });
}

function scriviAtomico(percorso, dati) {
  assicuraCartella(path.dirname(percorso));
  const temporaneo = percorso + '.tmp';
  fs.writeFileSync(temporaneo, dati);
  try {
    fs.renameSync(temporaneo, percorso);
  } catch (errore) {
    try { fs.unlinkSync(temporaneo); } catch (e) {  }
    throw errore;
  }
}

function leggiSeEsiste(percorso, codifica) {
  try {
    return fs.readFileSync(percorso, codifica === undefined ? 'utf8' : codifica);
  } catch (errore) {
    if (errore.code === 'ENOENT') { return null; }
    throw errore;
  }
}

function eFile(percorso) {
  try { return fs.statSync(percorso).isFile(); } catch (e) { return false; }
}

function eCartella(percorso) {
  try { return fs.statSync(percorso).isDirectory(); } catch (e) { return false; }
}

module.exports = { assicuraCartella, scriviAtomico, leggiSeEsiste, eFile, eCartella };
