'use strict';

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
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf'
};

function tipoDi(percorso) {
  return TIPI[path.extname(percorso).toLowerCase()] || 'application/octet-stream';
}

function etagDi(stato) {
  return '"' + stato.size.toString(16) + '-' + Math.floor(stato.mtimeMs).toString(16) + '"';
}

function nonModificato(req, etag, mtime) {
  const seNessuno = req.headers['if-none-match'];
  if (seNessuno) {
    for (const voce of seNessuno.split(',')) {
      const v = voce.trim().replace(/^W\//, '');
      if (v === etag || v === '*') { return true; }
    }
    return false;
  }
  const seModificato = req.headers['if-modified-since'];
  if (seModificato) {
    const quando = Date.parse(seModificato);
    if (!isNaN(quando) && Math.floor(mtime / 1000) * 1000 <= quando) { return true; }
  }
  return false;
}

const ESTENSIONI_FONT = new Set(['.woff2', '.woff', '.ttf', '.otf']);

const CARTELLE_VIETATE = new Set(['server', 'modelli', 'docs']);

const NOMI_VIETATI = new Set(['package.json', 'package-lock.json', 'app.js']);

const NASCOSTO_AMMESSO = '.well-known';

function riservato(assoluto) {
  if (eDentro(P.dati, assoluto) || eDentro(P.backup, assoluto)) { return true; }

  const relativo = path.relative(P.radice, assoluto);
  if (!relativo || relativo.startsWith('..')) { return false; }
  const pezzi = relativo.toLowerCase().split(path.sep).filter(Boolean);
  const nome = pezzi[pezzi.length - 1];

  for (const pezzo of pezzi) {
    if (pezzo.charAt(0) === '.' && pezzo !== NASCOSTO_AMMESSO) { return true; }
  }
  if (NOMI_VIETATI.has(nome)) { return true; }
  if (path.extname(nome) === '.md') { return true; }
  if (CARTELLE_VIETATE.has(pezzi[0])) { return true; }

  if (pezzi[0] === 'contenuti') {
    if (pezzi[1] === 'media') { return false; }
    if (pezzi[1] === 'font' && ESTENSIONI_FONT.has(path.extname(nome))) { return false; }
    return true;
  }
  return false;
}

const CACHE_LUNGA = 'public, max-age=2592000';

function cacheDi(file) {
  const relativo = path.relative(P.radice, file);
  if (!relativo || relativo.startsWith('..')) { return 'no-cache'; }
  const pezzi = relativo.toLowerCase().split(path.sep);
  if (pezzi[0] === 'mp3') { return CACHE_LUNGA; }
  if (pezzi[0] === 'img') { return CACHE_LUNGA; }
  if (pezzi[0] === 'contenuti' && (pezzi[1] === 'media' || pezzi[1] === 'font')) { return CACHE_LUNGA; }
  return 'no-cache';
}

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
  if (path.relative(P.radice, assoluto).toLowerCase() === 'sponsor.html') { return false; }

  let stato;
  try { stato = fs.statSync(assoluto); } catch (e) { return false; }

  if (stato.isDirectory()) {
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
  const cache = cacheDi(file);
  if (nonModificato(req, etag, stato.mtimeMs)) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
    res.end();
    return true;
  }

  const tipo = tipoDi(file);
  const testa = {
    'Content-Type': tipo,
    'Content-Length': String(stato.size),
    'Last-Modified': new Date(stato.mtimeMs).toUTCString(),
    ETag: etag,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff'
  };
  if (tipo.startsWith('text/html')) {
    testa['X-Frame-Options'] = 'SAMEORIGIN';
    testa['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  }
  res.writeHead(200, testa);
  if (req.method === 'HEAD') { res.end(); return true; }

  const flusso = fs.createReadStream(file);
  flusso.on('error', () => { res.destroy(); });
  flusso.pipe(res);
  return true;
}

module.exports = { servi, tipoDi, riservato };
