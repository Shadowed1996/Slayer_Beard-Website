'use strict';

const { P } = require('./percorsi');
const file = require('./file');
const archivio = require('./archivio');
const twitch = require('./twitch');

const FRESCO_MS = 60000;
const RIPROVA_MS = 20000;
const SCADUTO_MS = 5 * 60000;

let inVolo = null;

function leggi() {
  try {
    const grezzo = file.leggiSeEsiste(P.spettatori);
    if (grezzo === null) { return null; }
    const letto = JSON.parse(grezzo);
    if (!letto || typeof letto.letteIl !== 'string') { return null; }
    const quando = Date.parse(letto.letteIl);
    if (!Number.isFinite(quando)) { return null; }
    const numero = Number(letto.spettatori);
    return {
      inOnda: letto.inOnda === true,
      spettatori: Number.isFinite(numero) && numero >= 0 ? Math.round(numero) : 0,
      letteIl: letto.letteIl,
      provatoIl: typeof letto.provatoIl === 'string' ? letto.provatoIl : letto.letteIl,
      quando: quando
    };
  } catch (e) {
    return null;
  }
}

function salva(dati) {
  try {
    file.assicuraCartella(P.dati);
    file.scriviAtomico(P.spettatori, JSON.stringify(dati) + '\n');
  } catch (e) { }
}

function idCanale() {
  const contenuti = archivio.leggi();
  const dati = (contenuti.config && contenuti.config.twitch) || {};
  return typeof dati.idUtente === 'string' ? dati.idUtente.trim() : '';
}

async function chiediATwitch(prima) {
  const adesso = new Date().toISOString();
  try {
    if (!twitch.credenziali()) { return null; }
    const id = idCanale();
    if (!id) { return null; }
    const risposta = await twitch.helix('/streams?user_id=' + encodeURIComponent(id) + '&first=1');
    const voci = (risposta && Array.isArray(risposta.data)) ? risposta.data : [];
    const voce = voci[0] || null;
    const numero = voce ? Number(voce.viewer_count) : 0;
    const nuovo = {
      inOnda: !!voce,
      spettatori: voce && Number.isFinite(numero) && numero >= 0 ? Math.round(numero) : 0,
      letteIl: adesso,
      provatoIl: adesso
    };
    salva(nuovo);
    return leggi() || Object.assign(nuovo, { quando: Date.parse(adesso) });
  } catch (e) {
    if (prima) {
      salva({ inOnda: prima.inOnda, spettatori: prima.spettatori, letteIl: prima.letteIl, provatoIl: adesso });
      prima.provatoIl = adesso;
    }
    return prima;
  }
}

function vista(dati) {
  const utile = !!dati && Date.now() - dati.quando < SCADUTO_MS;
  return {
    inOnda: utile ? dati.inOnda : null,
    spettatori: utile && dati.inOnda ? dati.spettatori : 0,
    letteIl: utile ? dati.letteIl : ''
  };
}

async function stato() {
  const prima = leggi();
  const adesso = Date.now();
  if (prima && adesso - prima.quando < FRESCO_MS) { return vista(prima); }
  const provato = prima ? Date.parse(prima.provatoIl) : NaN;
  if (prima && Number.isFinite(provato) && adesso - provato < RIPROVA_MS) { return vista(prima); }
  if (!inVolo) {
    inVolo = chiediATwitch(prima).then((esito) => { inVolo = null; return esito; }, () => { inVolo = null; return prima; });
  }
  return vista(await inVolo);
}

module.exports = { stato };
