'use strict';

const fs = require('node:fs');

const { P } = require('./percorsi');
const { scriviAtomico } = require('./file');
const { erroreHttp } = require('./risposte');
const schema = require('../../contenuti/schema.js');

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

  schema.completa(documento);
  return documento;
}

function salva(documento) {
  const quando = new Date().toISOString();
  const fuori = {
    versione: typeof documento.versione === 'number' ? documento.versione : 1,
    aggiornatoIl: quando,
    testi: documento.testi,
    config: documento.config
  };
  scriviAtomico(P.contenutiJson, JSON.stringify(fuori, null, 2) + '\n');
  return quando;
}

function copia(valore) {
  return JSON.parse(JSON.stringify(valore));
}

function fondi(base, modifiche) {
  if (modifiche === null || typeof modifiche !== 'object' || Array.isArray(modifiche)) { return copia(modifiche); }
  const fuori = base && typeof base === 'object' && !Array.isArray(base) ? copia(base) : {};
  for (const chiave of Object.keys(modifiche)) {
    fuori[chiave] = fondi(fuori[chiave], modifiche[chiave]);
  }
  return fuori;
}

const RAMI_IN_BLOCCO = ['sezioni', 'stili', 'disposizione', 'orari'];

function unisci(documento, arrivo) {
  const fuori = copia(documento);
  if (arrivo && arrivo.testi) { fuori.testi = Object.assign(copia(documento.testi), copia(arrivo.testi)); }
  if (arrivo && arrivo.config) {
    fuori.config = fondi(documento.config, arrivo.config);
    for (const ramo of RAMI_IN_BLOCCO) {
      if (Object.prototype.hasOwnProperty.call(arrivo.config, ramo)) {
        fuori.config[ramo] = copia(arrivo.config[ramo]);
      }
    }
  }
  return fuori;
}

module.exports = { leggi, salva, unisci, fondi, copia, RAMI_IN_BLOCCO };
