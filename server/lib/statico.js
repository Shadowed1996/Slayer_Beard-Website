'use strict';
/* =====================================================================
   statico.js — il sito e il pannello serviti dal disco.

   Due cose contano qui: non uscire mai dalla radice del progetto
   (qualunque codifica di ".." deve finire in 403) e rispondere 304 quando
   il browser ha gia il file, cosi l'anteprima non ricarica le immagini a
   ogni giro.

   Fuori dal browser restano server/ (ci sono l'hash della password e i
   backup) e i file di lavoro dentro contenuti/ — tranne contenuti/media/,
   che e la libreria di immagini e nel sito pubblicato serve davvero.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

const { P, risolviDentro, eDentro } = require('./percorsi');
const { errore } = require('./risposte');

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf'
};

function tipoDi(percorso) {
  return TIPI[path.extname(percorso).toLowerCase()] || 'application/octet-stream';
}

/** Marcatore di versione del file: dimensione e data bastano e costano zero. */
function etagDi(stato) {
  return '"' + stato.size.toString(16) + '-' + Math.floor(stato.mtimeMs).toString(16) + '"';
}

/** Il browser ha gia questa versione? */
function nonModificato(req, etag, mtime) {
  const seNessuno = req.headers['if-none-match'];
  if (seNessuno) {
    for (const voce of seNessuno.split(',')) {
      const v = voce.trim().replace(/^W\//, '');
      if (v === etag || v === '*') { return true; }
    }
    return false;   // ETag presente ma diverso: la data non conta piu
  }
  const seModificato = req.headers['if-modified-since'];
  if (seModificato) {
    const quando = Date.parse(seModificato);
    // Le date HTTP hanno il secondo come risoluzione: si confronta troncato.
    if (!isNaN(quando) && Math.floor(mtime / 1000) * 1000 <= quando) { return true; }
  }
  return false;
}

/** Vero se il file, pur stando nella radice, non deve uscire dal browser. */
function riservato(assoluto) {
  if (eDentro(P.server, assoluto)) { return true; }
  if (eDentro(P.media, assoluto)) { return false; }
  return eDentro(P.cartellaContenuti, assoluto);
}

/**
 * Serve il file corrispondente al percorso richiesto.
 * Restituisce false se non c'e niente da servire: decide il chiamante.
 */
function servi(req, res, percorsoUrl) {
  let decodificato;
  try {
    decodificato = decodeURIComponent(percorsoUrl);
  } catch (e) {
    errore(res, 400, 'Il percorso della richiesta non e codificato correttamente.');
    return true;
  }

  const assoluto = risolviDentro(P.radice, decodificato);
  if (assoluto === null) {
    errore(res, 403, 'Percorso fuori dalla cartella del sito.');
    return true;
  }
  if (riservato(assoluto)) {
    errore(res, 403, 'Questa cartella non e accessibile dal browser.');
    return true;
  }

  let stato;
  try { stato = fs.statSync(assoluto); } catch (e) { return false; }

  if (stato.isDirectory()) {
    // Senza barra finale i percorsi relativi dentro la pagina si romperebbero.
    if (!percorsoUrl.endsWith('/')) {
      res.writeHead(301, { Location: percorsoUrl + '/', 'Content-Length': '0' });
      res.end();
      return true;
    }
    const indice = path.join(assoluto, 'index.html');
    try { return inviaFile(req, res, indice, fs.statSync(indice)); } catch (e) { return false; }
  }

  return inviaFile(req, res, assoluto, stato);
}

function inviaFile(req, res, file, stato) {
  const etag = etagDi(stato);
  if (nonModificato(req, etag, stato.mtimeMs)) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    res.end();
    return true;
  }

  res.writeHead(200, {
    'Content-Type': tipoDi(file),
    'Content-Length': String(stato.size),
    'Last-Modified': new Date(stato.mtimeMs).toUTCString(),
    ETag: etag,
    // Il sito viene rigenerato di continuo: si rivalida sempre, ma il 304
    // evita comunque di rispedire i byte.
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') { res.end(); return true; }

  const flusso = fs.createReadStream(file);
  flusso.on('error', () => { res.destroy(); });
  flusso.pipe(res);
  return true;
}

module.exports = { servi, tipoDi, riservato };
