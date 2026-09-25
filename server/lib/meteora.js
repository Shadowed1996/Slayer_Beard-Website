'use strict';

const crypto = require('node:crypto');

const { P } = require('./percorsi');
const file = require('./file');

const PAUSA_MS = 3000;

function leggi() {
  try {
    const grezzo = file.leggiSeEsiste(P.meteora);
    if (grezzo === null) { return null; }
    const letto = JSON.parse(grezzo);
    if (!letto || typeof letto.id !== 'string' || typeof letto.inviataIl !== 'string') { return null; }
    if (!Number.isFinite(Date.parse(letto.inviataIl))) { return null; }
    return { id: letto.id, inviataIl: letto.inviataIl };
  } catch (e) {
    return null;
  }
}

function stato() {
  const ultima = leggi();
  return {
    id: ultima ? ultima.id : '',
    inviataIl: ultima ? ultima.inviataIl : '',
    adesso: new Date().toISOString()
  };
}

function lancia() {
  const ultima = leggi();
  const adesso = Date.now();
  if (ultima && adesso - Date.parse(ultima.inviataIl) < PAUSA_MS) {
    return Object.assign(stato(), { gia: true });
  }
  const nuova = { id: crypto.randomBytes(6).toString('hex'), inviataIl: new Date(adesso).toISOString() };
  file.scriviAtomico(P.meteora, JSON.stringify(nuova) + '\n');
  return stato();
}

module.exports = { stato, lancia };
