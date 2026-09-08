'use strict';
/* =====================================================================
   modello.js — il motore di template del contratto (§6.1).

     {{chiave}}                   valore con escape di & < > " '
     {{{chiave}}}                 valore grezzo (ammesso solo per le icone SVG)
     {{#ogni elenco}}…{{/ogni}}   ripete il blocco per ogni voce
     {{#se chiave}}…{{/se}}       se il valore non e vuoto
     {{^se chiave}}…{{/se}}       il contrario
     {{> parziali/nome}}          include modelli/parziali/nome.html
   Dentro un ciclo: {{@indice}} {{@numero}} {{@primo}} {{@ultimo}}, e {{.}}
   per la voce stessa quando e una stringa. Le chiavi sono percorsi col punto.

   Tre scelte da spiegare:
   - una chiave assente e un ERRORE con file e riga, non una stringa vuota:
     un buco nel sito si nota dopo giorni, un errore di generazione subito;
   - niente eval, niente new Function, niente regex sul file intero: un
     tokenizzatore che scorre il testo una volta sola e un parser a pila;
   - la ricerca di una chiave prova prima il nome letterale e poi lo spezza
     sui punti, perche in "testi" le chiavi contengono davvero il punto
     ("deck.titolo" e una chiave sola) mentre in "config" il punto scende.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

const NON_TROVATO = { trovato: false, valore: undefined };
const MAX_PROFONDITA = 12;   // ferma i parziali che si includono fra loro

class ErroreModello extends Error {
  constructor(messaggio, file, riga) {
    super(messaggio + '  [' + file + ':' + riga + ']');
    this.name = 'ErroreModello';
    Object.assign(this, { dettaglio: messaggio, file: file, riga: riga });
  }
}

/** Escape per HTML: sicuro sia nel testo sia dentro un attributo. */
function proteggi(testo) {
  return String(testo).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const righeIn = (testo) => testo.split('\n').length - 1;

/* --- TOKENIZZATORE ------------------------------------------------- */

/** Trasforma il contenuto di una coppia di graffe nel token corrispondente. */
function leggiTag(dentro, triplo, file, riga) {
  const testo = dentro.trim();
  const posa = (extra) => Object.assign({ file: file, riga: riga }, extra);
  if (!testo) { throw new ErroreModello('Tag vuoto: due graffe senza chiave non significano niente', file, riga); }
  if (triplo) { return posa({ tipo: 'valore', chiave: testo, escape: false }); }

  const marchio = testo[0];
  const resto = testo.slice(1).trim();
  const spazio = resto.search(/\s/);

  if (marchio === '#' || marchio === '^') {
    const blocco = spazio === -1 ? resto : resto.slice(0, spazio);
    const chiave = spazio === -1 ? '' : resto.slice(spazio + 1).trim();
    if (!chiave || (blocco !== 'ogni' && blocco !== 'se') || (marchio === '^' && blocco !== 'se')) {
      throw new ErroreModello('Apertura non valida "' + testo + '": ammesse solo ogni <elenco>, se <chiave> e ^se <chiave>', file, riga);
    }
    return posa({ tipo: 'apri', blocco: blocco, chiave: chiave, negato: marchio === '^', figli: [] });
  }
  if (marchio === '/') {
    if (resto !== 'ogni' && resto !== 'se') { throw new ErroreModello('Chiusura sconosciuta: ' + resto, file, riga); }
    return posa({ tipo: 'chiudi', blocco: resto });
  }
  if (marchio === '>') {
    if (!resto) { throw new ErroreModello('All inclusione manca il nome del parziale', file, riga); }
    return posa({ tipo: 'parziale', nome: resto });
  }
  return posa({ tipo: 'valore', chiave: testo, escape: true });
}

/** Scorre il sorgente una volta sola e produce l elenco piatto dei token. */
function tokenizza(sorgente, file) {
  const token = [];
  let i = 0;
  let riga = 1;

  while (i < sorgente.length) {
    const apre = sorgente.indexOf('{{', i);
    if (apre === -1) { token.push({ tipo: 'testo', valore: sorgente.slice(i) }); break; }
    if (apre > i) {
      token.push({ tipo: 'testo', valore: sorgente.slice(i, apre) });
      riga += righeIn(sorgente.slice(i, apre));
    }
    const triplo = sorgente.startsWith('{{{', apre);
    const chiusura = triplo ? '}}}' : '}}';
    const inizio = apre + chiusura.length;
    const chiude = sorgente.indexOf(chiusura, inizio);
    if (chiude === -1) { throw new ErroreModello('Tag aperto e mai chiuso', file, riga); }

    token.push(leggiTag(sorgente.slice(inizio, chiude), triplo, file, riga));
    riga += righeIn(sorgente.slice(apre, chiude));
    i = chiude + chiusura.length;
  }
  return token;
}

/** Dai token piatti all albero: una pila, e i blocchi devono richiudersi. */
function analizza(token, file) {
  const radice = { tipo: 'radice', figli: [] };
  const pila = [radice];

  for (const t of token) {
    if (t.tipo === 'apri') { pila[pila.length - 1].figli.push(t); pila.push(t); continue; }
    if (t.tipo !== 'chiudi') { pila[pila.length - 1].figli.push(t); continue; }

    if (pila.length === 1) { throw new ErroreModello('Chiusura di ' + t.blocco + ' senza un blocco aperto', file, t.riga); }
    const aperto = pila.pop();
    if (aperto.blocco !== t.blocco) {
      throw new ErroreModello('Chiusura di ' + t.blocco + ' ma il blocco aperto e ' + aperto.blocco +
        ', iniziato alla riga ' + aperto.riga, file, t.riga);
    }
  }
  if (pila.length > 1) {
    const aperto = pila[pila.length - 1];
    throw new ErroreModello('Il blocco ' + aperto.blocco + ' ' + aperto.chiave + ' non viene mai chiuso', file, aperto.riga);
  }
  return radice;
}

/* --- RISOLUZIONE DELLE CHIAVI -------------------------------------- */

function haChiave(oggetto, nome) {
  return oggetto !== null && typeof oggetto === 'object' && Object.prototype.hasOwnProperty.call(oggetto, nome);
}

/** Cerca il percorso dentro l oggetto: prima letterale, poi spezzando sui punti. */
function cerca(oggetto, percorso) {
  if (oggetto === null || typeof oggetto !== 'object') { return NON_TROVATO; }
  if (haChiave(oggetto, percorso)) { return { trovato: true, valore: oggetto[percorso] }; }
  for (let p = percorso.indexOf('.'); p !== -1; p = percorso.indexOf('.', p + 1)) {
    if (!haChiave(oggetto, percorso.slice(0, p))) { continue; }
    const dentro = cerca(oggetto[percorso.slice(0, p)], percorso.slice(p + 1));
    if (dentro.trovato) { return dentro; }
  }
  return NON_TROVATO;
}

/** Risale la catena degli ambiti: dentro un ciclo si vede anche il contesto esterno. */
function risolvi(ambito, percorso) {
  if (percorso === '.') { return { trovato: true, valore: ambito.dati }; }
  for (let a = ambito; a; a = a.padre) {
    if (percorso[0] === '@') {
      if (a.cicli && haChiave(a.cicli, percorso)) { return { trovato: true, valore: a.cicli[percorso] }; }
      continue;
    }
    const esito = cerca(a.dati, percorso);
    if (esito.trovato) { return esito; }
  }
  return NON_TROVATO;
}

/** Come risolvi, ma un buco e un errore: e la regola del contratto. */
function pretendi(ambito, nodo, cosa) {
  const esito = risolvi(ambito, nodo.chiave);
  if (!esito.trovato) {
    throw new ErroreModello(cosa + ' "' + nodo.chiave + '" assente dal contesto', nodo.file, nodo.riga);
  }
  return esito.valore;
}

/** Vuoto secondo il contratto: stringa vuota, 0, elenco vuoto, false, assente. */
function pieno(valore) {
  if (valore === undefined || valore === null || valore === false || valore === 0) { return false; }
  if (typeof valore === 'string') { return valore.trim() !== ''; }
  if (Array.isArray(valore)) { return valore.length > 0; }
  return true;
}

/* --- RESA ---------------------------------------------------------- */

function rendiFigli(figli, ambito, stato) {
  let fuori = '';
  for (const nodo of figli) { fuori += rendiNodo(nodo, ambito, stato); }
  return fuori;
}

function rendiNodo(nodo, ambito, stato) {
  if (nodo.tipo === 'testo') { return nodo.valore; }
  if (nodo.tipo === 'parziale') { return rendiParziale(nodo, ambito, stato); }

  if (nodo.tipo === 'valore') {
    const valore = pretendi(ambito, nodo, 'Chiave');
    if (valore !== null && typeof valore === 'object') {
      throw new ErroreModello('La chiave "' + nodo.chiave + '" contiene un ' +
        (Array.isArray(valore) ? 'elenco' : 'oggetto') + ', non un valore stampabile', nodo.file, nodo.riga);
    }
    const testo = valore === null || valore === undefined ? '' : String(valore);
    return nodo.escape ? proteggi(testo) : testo;
  }

  if (nodo.blocco === 'se') {
    return pieno(pretendi(ambito, nodo, 'Chiave')) !== nodo.negato ? rendiFigli(nodo.figli, ambito, stato) : '';
  }

  const voci = pretendi(ambito, nodo, 'Elenco');
  if (!Array.isArray(voci)) {
    throw new ErroreModello('"' + nodo.chiave + '" non e un elenco: non ci si puo ciclare sopra', nodo.file, nodo.riga);
  }
  let fuori = '';
  for (let i = 0; i < voci.length; i++) {
    fuori += rendiFigli(nodo.figli, {
      dati: voci[i],
      padre: ambito,
      cicli: { '@indice': i, '@numero': i + 1, '@primo': i === 0, '@ultimo': i === voci.length - 1 }
    }, stato);
  }
  return fuori;
}

function rendiParziale(nodo, ambito, stato) {
  if (stato.profondita >= MAX_PROFONDITA) {
    throw new ErroreModello('Inclusioni annidate oltre ' + MAX_PROFONDITA +
      ' livelli: probabile parziale che include se stesso', nodo.file, nodo.riga);
  }
  // Il nome arriva dal modello, non dalla rete, ma un percorso che risale
  // sopra modelli/ resta un errore da segnalare subito invece che da servire.
  if (/(^\/)|(\.\.)|[\\:]/.test(nodo.nome)) {
    throw new ErroreModello('Nome di parziale non ammesso: "' + nodo.nome + '"', nodo.file, nodo.riga);
  }

  const file = path.join(stato.cartella, ...nodo.nome.split('/')) + '.html';
  let albero = stato.cache.get(file);
  if (!albero) {
    let sorgente;
    try { sorgente = fs.readFileSync(file, 'utf8'); } catch (e) {
      throw new ErroreModello('Parziale "' + nodo.nome + '" non trovato: manca ' + file, nodo.file, nodo.riga);
    }
    const nome = path.relative(stato.cartella, file).split(path.sep).join('/');
    albero = analizza(tokenizza(sorgente, nome), nome);
    stato.cache.set(file, albero);
  }

  stato.profondita++;
  try { return rendiFigli(albero.figli, ambito, stato); } finally { stato.profondita--; }
}

/* --- API PUBBLICA -------------------------------------------------- */

/** opzioni: { file: nome mostrato negli errori, cartella: radice dei parziali } */
function rendi(sorgente, contesto, opzioni) {
  const scelte = opzioni || {};
  const file = scelte.file || 'modello';
  const albero = analizza(tokenizza(String(sorgente), file), file);
  const stato = { cartella: scelte.cartella || '.', cache: scelte.cache || new Map(), profondita: 0 };
  return rendiFigli(albero.figli, { dati: contesto, padre: null, cicli: null }, stato);
}

/** Rende un file dal disco. La cartella dei parziali e quella del file stesso. */
function rendiFile(percorso, contesto, opzioni) {
  const scelte = opzioni || {};
  return rendi(fs.readFileSync(percorso, 'utf8'), contesto, {
    file: scelte.file || path.basename(percorso),
    cartella: scelte.cartella || path.dirname(percorso),
    cache: scelte.cache
  });
}

module.exports = { rendi, rendiFile, proteggi, pieno, ErroreModello };
