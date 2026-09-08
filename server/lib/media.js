'use strict';
/* =====================================================================
   media.js — la cartella contenuti/media/ vista dal pannello.

   Il caricamento arriva come multipart/form-data, che e quello che manda
   un <input type="file"> senza JavaScript di mezzo. Il parser sta qui
   sotto ed e volutamente minimo: cerca il confine, taglia, legge le
   intestazioni della parte, prende il file. Non gestisce il multipart
   annidato perche nessun browser lo manda per un modulo con un file.

   Regole: png, jpg, webp e svg, al massimo 4 MB, nome normalizzato e reso
   unico. Il tipo dichiarato non basta: i primi byte devono corrispondere.
   Un file citato nei contenuti non si cancella.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

const { P } = require('./percorsi');
const { assicuraCartella, scriviAtomico } = require('./file');
const { erroreHttp } = require('./risposte');

const MAX_BYTE = 4 * 1024 * 1024;
const ESTENSIONI = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const TIPI = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

/* --- MULTIPART ----------------------------------------------------- */

/** Il confine dichiarato in Content-Type, oppure null. */
function confineDi(intestazione) {
  if (typeof intestazione !== 'string' || intestazione.indexOf('multipart/form-data') === -1) { return null; }
  const trovato = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(intestazione);
  if (!trovato) { return null; }
  return trovato[1] || trovato[2];
}

/**
 * Estrae le parti con un nome di file. Restituisce { nome, dati }.
 * Il corpo si scorre come Buffer: passare da una stringa rovinerebbe i byte
 * di un PNG alla prima conversione.
 */
function parti(corpo, confine) {
  const separatore = Buffer.from('--' + confine);
  const fuori = [];
  let posizione = corpo.indexOf(separatore);
  if (posizione === -1) { return fuori; }

  while (posizione !== -1) {
    const inizio = posizione + separatore.length;
    // "--" subito dopo il confine chiude il corpo.
    if (corpo.slice(inizio, inizio + 2).toString('latin1') === '--') { break; }

    const prossimo = corpo.indexOf(separatore, inizio);
    if (prossimo === -1) { break; }

    const blocco = corpo.slice(inizio, prossimo);
    const stacco = blocco.indexOf('\r\n\r\n');
    posizione = prossimo;
    if (stacco === -1) { continue; }

    const intestazioni = blocco.slice(0, stacco).toString('utf8');
    // Fra la fine dei dati e il confine successivo c'e sempre un CRLF.
    let dati = blocco.slice(stacco + 4);
    if (dati.length >= 2 && dati[dati.length - 2] === 13 && dati[dati.length - 1] === 10) {
      dati = dati.slice(0, dati.length - 2);
    }

    const nome = /filename\*?=(?:"([^"]*)"|([^;\r\n]+))/i.exec(intestazioni);
    if (nome) { fuori.push({ nome: (nome[1] || nome[2] || '').trim(), dati: dati }); }
  }
  return fuori;
}

/* --- NOMI ---------------------------------------------------------- */

/**
 * Nome di file sicuro: minuscolo, spazi in trattino, via tutto il resto.
 * I nomi con ".." o barre non si ripuliscono, si rifiutano: chi li manda
 * non sta caricando un'immagine.
 */
function normalizzaNome(grezzo) {
  const originale = String(grezzo == null ? '' : grezzo).trim();
  if (!originale) { throw erroreHttp(400, 'Manca il nome del file.'); }
  if (/[\\/\0]|\.\./.test(originale)) {
    throw erroreHttp(400, 'Il nome del file non puo contenere ".." ne barre.');
  }

  const pulito = originale.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '');

  const punto = pulito.lastIndexOf('.');
  const estensione = punto === -1 ? '' : pulito.slice(punto + 1);
  const base = punto === -1 ? pulito : pulito.slice(0, punto);

  if (!base) { throw erroreHttp(400, 'Dopo la ripulitura non resta un nome utilizzabile.'); }
  if (base.length > 80) { throw erroreHttp(400, 'Nome del file troppo lungo: massimo 80 caratteri.'); }
  if (ESTENSIONI.indexOf(estensione) === -1) {
    throw erroreHttp(415, 'Formato non ammesso. Si caricano solo: ' + ESTENSIONI.join(', ') + '.');
  }
  return { base: base, estensione: estensione, nome: base + '.' + estensione };
}

/** Se il nome e gia occupato si aggiunge -2, -3, … invece di sovrascrivere. */
function nomeLibero(base, estensione) {
  let nome = base + '.' + estensione;
  let n = 2;
  while (fs.existsSync(path.join(P.media, nome))) {
    nome = base + '-' + n + '.' + estensione;
    n++;
  }
  return nome;
}

/* --- CONTROLLO DEL CONTENUTO --------------------------------------- */

/** I primi byte devono dire la stessa cosa dell'estensione. */
function contenutoCoerente(estensione, dati) {
  if (dati.length < 12) { return 'Il file e troppo corto per essere un immagine.'; }
  const testa = dati.slice(0, 12);

  if (estensione === 'png') {
    return testa.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? null : 'Questo file non e un PNG.';
  }
  if (estensione === 'jpg' || estensione === 'jpeg') {
    return (testa[0] === 0xff && testa[1] === 0xd8 && testa[2] === 0xff) ? null : 'Questo file non e un JPEG.';
  }
  if (estensione === 'webp') {
    return (testa.slice(0, 4).toString('latin1') === 'RIFF' && testa.slice(8, 12).toString('latin1') === 'WEBP')
      ? null : 'Questo file non e un WebP.';
  }
  // Un SVG e testo, e viene servito con il suo tipo MIME: se contiene
  // script diventa codice che gira nel sito. Meglio rifiutarlo.
  const testo = dati.toString('utf8');
  if (testo.indexOf('<svg') === -1) { return 'Questo file non contiene un elemento <svg>.'; }
  if (/<script[\s>]/i.test(testo) || /\son\w+\s*=/i.test(testo) || /javascript:/i.test(testo)) {
    return 'Questo SVG contiene script o gestori di eventi: non lo carico.';
  }
  return null;
}

/* --- OPERAZIONI ---------------------------------------------------- */

function descrivi(nome) {
  const stato = fs.statSync(path.join(P.media, nome));
  const estensione = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
  return {
    nome: nome,
    // `percorso` e il valore da mettere nei campi immagine (relativo, come
    // in index.html); `href` serve al pannello per l'anteprima.
    percorso: 'contenuti/media/' + nome,
    href: '/contenuti/media/' + nome,
    tipo: TIPI[estensione] || 'application/octet-stream',
    byte: stato.size,
    quando: stato.mtime.toISOString()
  };
}

/** I file presenti, dal piu recente. */
function elenco() {
  if (!fs.existsSync(P.media)) { return []; }
  const fuori = [];
  for (const nome of fs.readdirSync(P.media)) {
    const estensione = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
    if (ESTENSIONI.indexOf(estensione) === -1) { continue; }
    try {
      if (!fs.statSync(path.join(P.media, nome)).isFile()) { continue; }
      fuori.push(descrivi(nome));
    } catch (e) { /* file sparito nel frattempo */ }
  }
  fuori.sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
  return fuori;
}

/** Salva il file di una richiesta multipart gia letta in memoria. */
function salva(corpo, tipoContenuto) {
  const confine = confineDi(tipoContenuto);
  if (!confine) {
    throw erroreHttp(400, 'Il caricamento deve arrivare come multipart/form-data.');
  }
  const trovate = parti(corpo, confine);
  if (!trovate.length) { throw erroreHttp(400, 'Nella richiesta non c e nessun file.'); }

  const parte = trovate[0];
  const { base, estensione } = normalizzaNome(parte.nome);
  if (!parte.dati.length) { throw erroreHttp(400, 'Il file caricato e vuoto.'); }
  if (parte.dati.length > MAX_BYTE) {
    throw erroreHttp(413, 'Il file supera il limite di 4 MB.');
  }
  const guaio = contenutoCoerente(estensione, parte.dati);
  if (guaio) { throw erroreHttp(415, guaio); }

  assicuraCartella(P.media);
  const nome = nomeLibero(base, estensione);
  scriviAtomico(path.join(P.media, nome), parte.dati);
  return descrivi(nome);
}

/** Le chiavi dei contenuti che citano questo file. */
function doveUsato(nome, contenuti) {
  const candidati = ['contenuti/media/' + nome, '/contenuti/media/' + nome, './contenuti/media/' + nome, nome];
  const usi = [];

  const guarda = (valore, chiave) => {
    if (typeof valore === 'string') {
      if (candidati.indexOf(valore.trim()) !== -1) { usi.push(chiave); }
      return;
    }
    if (valore && typeof valore === 'object') {
      for (const k of Object.keys(valore)) {
        guarda(valore[k], chiave ? chiave + '.' + k : k);
      }
    }
  };

  guarda((contenuti && contenuti.testi) || {}, '');
  guarda((contenuti && contenuti.config) || {}, 'config');
  return usi;
}

/** Elimina un file, se nessun contenuto lo sta citando. */
function elimina(nomeGrezzo, contenuti) {
  const { nome } = normalizzaNome(nomeGrezzo);
  const file = path.join(P.media, nome);
  if (!fs.existsSync(file)) { throw erroreHttp(404, 'Questo file non esiste.'); }

  const usi = doveUsato(nome, contenuti);
  if (usi.length) {
    throw erroreHttp(409, 'Non posso eliminarlo: e ancora usato da ' + usi.join(', ') +
      '. Cambia prima quel campo, poi riprova.', { usatoDa: usi });
  }

  fs.unlinkSync(file);
  return nome;
}

module.exports = { elenco, salva, elimina, doveUsato, normalizzaNome, confineDi, parti, ESTENSIONI, MAX_BYTE };
