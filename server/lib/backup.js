'use strict';
/* =====================================================================
   backup.js — copie di sicurezza in server/backup/<ISO>/.

   Dentro ogni copia ci sono i tre file generati (index.html, dati.js e
   tema.css) e il contenuti.json che li ha prodotti: senza quest'ultimo un
   ripristino rimetterebbe in pagina un sito che il pannello non sa piu
   descrivere. tema.css sta con gli altri perche e parte della pagina come
   l'HTML: rimettere i testi di ieri lasciando i colori di oggi darebbe un
   sito che non e mai esistito.

   Ogni pubblicazione ne crea una prima di toccare qualcosa, e anche ogni
   ripristino: annullare un ripristino sbagliato deve restare possibile.
   Se ne tengono venti, le piu vecchie se ne vanno da sole.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

const { P } = require('./percorsi');
const { assicuraCartella, scriviAtomico } = require('./file');
const { erroreHttp } = require('./risposte');

const DA_CONSERVARE = 20;

// Nome dentro la copia -> dove torna nel progetto. `chiave` serve al
// pannello per dire in italiano che cosa contiene la copia.
function mappa() {
  return [
    { nome: 'index.html', destinazione: P.indexHtml, etichetta: 'la pagina' },
    { nome: 'dati.js', destinazione: P.datiJs, etichetta: 'i dati del front-end' },
    { nome: 'tema.css', destinazione: P.temaCss, etichetta: 'il tema' },
    { nome: 'contenuti.json', destinazione: P.contenutiJson, etichetta: 'i contenuti' }
  ];
}

// L'identificativo e una ISO con i due punti sostituiti: resta leggibile,
// resta ordinabile alfabeticamente ed e un nome di cartella valido su NTFS.
const RE_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;

function nuovoIdentificativo() {
  const base = new Date().toISOString().replace(/[:.]/g, '-');
  let id = base;
  let n = 1;
  // Due copie nello stesso millisecondo sono improbabili ma non impossibili:
  // pubblicazione e ripristino ne fanno una ciascuna, di fila.
  while (fs.existsSync(path.join(P.backup, id))) { id = base + '-' + n; n++; }
  return id;
}

/** Data di creazione ricavata dall'identificativo, con la cartella come riserva. */
function dataDi(id, cartella) {
  if (RE_ID.test(id)) {
    const iso = id.slice(0, 13) + ':' + id.slice(14, 16) + ':' + id.slice(17, 19) + '.' + id.slice(20, 23) + 'Z';
    const quando = new Date(iso);
    if (!isNaN(quando.getTime())) { return quando.toISOString(); }
  }
  try { return fs.statSync(cartella).mtime.toISOString(); } catch (e) { return null; }
}

/** Copia lo stato corrente. Restituisce l'identificativo della copia. */
function crea() {
  assicuraCartella(P.backup);
  const id = nuovoIdentificativo();
  const cartella = path.join(P.backup, id);
  assicuraCartella(cartella);

  for (const voce of mappa()) {
    if (!fs.existsSync(voce.destinazione)) { continue; }
    fs.copyFileSync(voce.destinazione, path.join(cartella, voce.nome));
  }

  pota();
  return id;
}

/** Elenco delle copie, dalla piu recente. */
function elenco() {
  if (!fs.existsSync(P.backup)) { return []; }

  const voci = [];
  for (const nome of fs.readdirSync(P.backup)) {
    const cartella = path.join(P.backup, nome);
    let stato;
    try { stato = fs.statSync(cartella); } catch (e) { continue; }
    if (!stato.isDirectory()) { continue; }

    const file = [];
    let dimensione = 0;
    for (const voce of mappa()) {
      try {
        const s = fs.statSync(path.join(cartella, voce.nome));
        file.push(voce.nome);
        dimensione += s.size;
      } catch (e) { /* file assente in questa copia: si salta */ }
    }
    voci.push({ id: nome, quando: dataDi(nome, cartella), file: file, byte: dimensione });
  }

  // L'identificativo e cronologico: l'ordine alfabetico inverso basta.
  voci.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return voci;
}

/** Elimina le copie oltre le venti piu recenti. */
function pota() {
  for (const voce of elenco().slice(DA_CONSERVARE)) {
    try { fs.rmSync(path.join(P.backup, voce.id), { recursive: true, force: true }); }
    catch (e) { /* se non si riesce a cancellare pazienza: non e un errore fatale */ }
  }
}

/**
 * Rimette in piedi una copia. Prima ne fa una dello stato attuale, cosi
 * anche un ripristino sbagliato resta annullabile.
 */
function ripristina(id) {
  if (!RE_ID.test(String(id))) {
    throw erroreHttp(400, 'Identificativo del backup non valido.');
  }
  const cartella = path.join(P.backup, String(id));
  let stato;
  try { stato = fs.statSync(cartella); } catch (e) { stato = null; }
  if (!stato || !stato.isDirectory()) {
    throw erroreHttp(404, 'Questo backup non esiste piu.');
  }

  const primaDi = crea();

  const ripristinati = [];
  for (const voce of mappa()) {
    const origine = path.join(cartella, voce.nome);
    if (!fs.existsSync(origine)) { continue; }
    scriviAtomico(voce.destinazione, fs.readFileSync(origine));
    ripristinati.push(voce.nome);
  }
  if (!ripristinati.length) {
    throw erroreHttp(409, 'Questo backup e vuoto: non c e niente da rimettere in piedi.');
  }

  return { ripristinati: ripristinati, backup: primaDi };
}

module.exports = { crea, elenco, ripristina, pota, DA_CONSERVARE };
