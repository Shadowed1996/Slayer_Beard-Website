'use strict';
/* =====================================================================
   archivio.js — lettura e scrittura di contenuti/contenuti.json.

   Un file solo, letto da tutti: conviene che passi da un posto solo, cosi
   la forma (versione, aggiornatoIl, testi, config) si controlla qui e non
   in cinque punti diversi. La scrittura e sempre atomica: se il processo
   muore mentre salva, sul disco resta la versione precedente, intera.
   ===================================================================== */

const fs = require('node:fs');

const { P } = require('./percorsi');
const { scriviAtomico } = require('./file');
const { erroreHttp } = require('./risposte');

/** Legge contenuti.json e controlla che abbia la forma attesa. */
function leggi() {
  let grezzo;
  try {
    grezzo = fs.readFileSync(P.contenutiJson, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw erroreHttp(500, 'Manca ' + P.contenutiJson + ': senza contenuti non c e niente da generare.');
    }
    throw e;
  }

  let documento;
  try {
    documento = JSON.parse(grezzo);
  } catch (e) {
    throw erroreHttp(500, 'contenuti.json non e JSON valido: ' + e.message);
  }

  if (!documento || typeof documento !== 'object' || Array.isArray(documento)) {
    throw erroreHttp(500, 'contenuti.json deve contenere un oggetto.');
  }
  if (!documento.testi || typeof documento.testi !== 'object' || Array.isArray(documento.testi)) {
    throw erroreHttp(500, 'In contenuti.json manca l oggetto "testi".');
  }
  if (!documento.config || typeof documento.config !== 'object' || Array.isArray(documento.config)) {
    throw erroreHttp(500, 'In contenuti.json manca l oggetto "config".');
  }

  if (typeof documento.versione !== 'number') { documento.versione = 1; }
  if (typeof documento.aggiornatoIl !== 'string') { documento.aggiornatoIl = new Date().toISOString(); }
  return documento;
}

/**
 * Salva testi e config, timbrando `aggiornatoIl`.
 * Non tocca `versione`: quella cambia solo se cambia la forma del file.
 */
function salva(documento) {
  const quando = new Date().toISOString();
  const fuori = {
    versione: typeof documento.versione === 'number' ? documento.versione : 1,
    aggiornatoIl: quando,
    testi: documento.testi,
    config: documento.config
  };
  // Due spazi e l a capo finale: il file resta leggibile e diffabile a mano.
  scriviAtomico(P.contenutiJson, JSON.stringify(fuori, null, 2) + '\n');
  return quando;
}

/** Copia profonda: il pannello manda modifiche parziali, l originale non si tocca. */
function copia(valore) {
  return JSON.parse(JSON.stringify(valore));
}

/**
 * Fonde le modifiche in arrivo sopra al documento salvato.
 * Gli oggetti si fondono chiave per chiave, gli elenchi si sostituiscono in
 * blocco: se il pannello manda tre social, i social diventano quei tre.
 */
function fondi(base, modifiche) {
  if (modifiche === null || typeof modifiche !== 'object' || Array.isArray(modifiche)) { return copia(modifiche); }
  const fuori = base && typeof base === 'object' && !Array.isArray(base) ? copia(base) : {};
  for (const chiave of Object.keys(modifiche)) {
    fuori[chiave] = fondi(fuori[chiave], modifiche[chiave]);
  }
  return fuori;
}

/** Applica al documento salvato quello che arriva dal pannello. */
function unisci(documento, arrivo) {
  const fuori = copia(documento);
  if (arrivo && arrivo.testi) { fuori.testi = Object.assign(copia(documento.testi), copia(arrivo.testi)); }
  if (arrivo && arrivo.config) { fuori.config = fondi(documento.config, arrivo.config); }
  return fuori;
}

module.exports = { leggi, salva, unisci, fondi, copia };
