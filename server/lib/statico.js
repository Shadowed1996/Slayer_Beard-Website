'use strict';
/* =====================================================================
   statico.js — il sito e il pannello serviti dal disco.

   Due cose contano qui: non uscire mai dalla radice del progetto
   (qualunque codifica di ".." deve finire in 403) e rispondere 304 quando
   il browser ha gia il file, cosi l'anteprima non ricarica le immagini a
   ogni giro.

   Fuori dal browser restano server/ (ci sono l'hash della password e i
   backup) e i file di lavoro dentro contenuti/ — tranne contenuti/media/,
   che e la libreria di immagini e nel sito pubblicato serve davvero, e i
   font di contenuti/font/, che servono allo stesso modo.

   Da CONTRATTO-6 §4.3 la stessa lista comprende tutto cio che su un hosting
   nega .htaccess: i documenti (*.md), package.json, .env*, app.js, .git*,
   modelli/ e docs/. Non e un doppione inutile — su Plesk i file statici li
   serve il server web, ma tutto quello che il server web non serve da se
   arriva qui, e se .htaccess manca o nginx lo scavalca questo modulo e
   l'unico rimasto a dire di no.
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
  '.otf': 'font/otf',
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

// I soli file che escono da contenuti/font/: i font. elenco.json e un file
// di lavoro del pannello, e non serve a nessuna pagina.
const ESTENSIONI_FONT = new Set(['.woff2', '.woff', '.ttf', '.otf']);

// Cartelle di primo livello che non escono mai: dentro ci sono i segreti
// (server/), il codice sorgente delle pagine (modelli/) e la manutenzione
// (docs/). Nessuna delle tre serve a un browser.
const CARTELLE_VIETATE = new Set(['server', 'modelli', 'docs']);

// File che non escono da nessuna cartella. package-lock.json non c'e e non
// dovrebbe nascere (niente dipendenze), ma se qualcuno lancia un npm
// install sull'hosting non deve diventare la mappa di cosa gira qui.
const NOMI_VIETATI = new Set(['package.json', 'package-lock.json', 'app.js']);

// Il solo file nascosto che ha senso servire: la cartella che usano le
// autorita di certificazione per verificare il dominio.
const NASCOSTO_AMMESSO = '.well-known';

/**
 * Vero se il file, pur stando nella radice, non deve uscire dal browser.
 *
 * Il confronto e sui pezzi del percorso relativo alla radice e tutto in
 * minuscolo: Windows non distingue le maiuscole, e senza questo
 * /SERVER/dati/auth.json aprirebbe lo stesso il file mentre il controllo
 * guardava altrove.
 */
function riservato(assoluto) {
  // I segreti seguono SB_DATI e SB_BACKUP (CONTRATTO-6 §3): finche restano
  // dentro la radice del sito hanno un indirizzo, e vanno negati comunque si
  // chiami la cartella che li ospita.
  if (eDentro(P.dati, assoluto) || eDentro(P.backup, assoluto)) { return true; }

  const relativo = path.relative(P.radice, assoluto);
  // Fuori dalla radice non decide questa funzione: ci pensa risolviDentro().
  if (!relativo || relativo.startsWith('..')) { return false; }
  const pezzi = relativo.toLowerCase().split(path.sep).filter(Boolean);
  const nome = pezzi[pezzi.length - 1];

  // Niente file nascosti: una regola sola copre .env, .git, .gitignore,
  // .htaccess ed .editorconfig, e copre anche quelli che arriveranno.
  for (const pezzo of pezzi) {
    if (pezzo.charAt(0) === '.' && pezzo !== NASCOSTO_AMMESSO) { return true; }
  }
  if (NOMI_VIETATI.has(nome)) { return true; }
  // I documenti del progetto: contratti, README, guide. Restano nel
  // repository, non sul sito.
  if (path.extname(nome) === '.md') { return true; }
  if (CARTELLE_VIETATE.has(pezzi[0])) { return true; }

  if (pezzi[0] === 'contenuti') {
    if (pezzi[1] === 'media') { return false; }
    // I font caricati dal pannello stanno nel sito pubblicato come le
    // immagini: css/tema.css e <style id="sb-stili"> li chiedono da qui.
    if (pezzi[1] === 'font' && ESTENSIONI_FONT.has(path.extname(nome))) { return false; }
    // Tutto il resto e roba di lavoro: contenuti.json, schema.js,
    // font/elenco.json.
    return true;
  }
  return false;
}

// Trenta giorni. Immagini e font cambiano quando li cambia chi amministra,
// e allora cambia anche il nome del file: nel frattempo non ha senso
// richiederli a ogni pagina. Niente `immutable`, pero: una ricarica forzata
// deve poterli riprendere, perche lo stesso nome puo tornare con un
// contenuto nuovo.
const CACHE_LUNGA = 'public, max-age=2592000';

/**
 * Le stesse intestazioni di cache che .htaccess mette sull'hosting.
 * `no-cache` non vuol dire «non conservare»: vuol dire «richiedi prima di
 * riusare», e con ETag la risposta e un 304 senza byte. E la scelta giusta
 * per tutto cio che riscrive la pubblicazione (index.html, css/tema.css,
 * js/dati.js) e per il pannello, che quando lo serve Node lo sta quasi
 * sempre servendo a chi lo sta modificando.
 */
function cacheDi(file) {
  const relativo = path.relative(P.radice, file);
  if (!relativo || relativo.startsWith('..')) { return 'no-cache'; }
  const pezzi = relativo.toLowerCase().split(path.sep);
  if (pezzi[0] === 'img') { return CACHE_LUNGA; }
  if (pezzi[0] === 'contenuti' && (pezzi[1] === 'media' || pezzi[1] === 'font')) { return CACHE_LUNGA; }
  return 'no-cache';
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
  // Solo sulle pagine: il pannello dentro l'iframe di un altro sito sarebbe
  // un bottone «pubblica» premuto da qualcun altro. SAMEORIGIN e non DENY
  // perche l'anteprima dell'editor e proprio un iframe, ma di casa nostra.
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
