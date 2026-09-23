/* =====================================================================
   motore.js — il motore dell'editor unico (CONTRATTO-4 §10).

   Tiene l'anteprima del sito dentro il pannello e sa cosa c'è sotto il
   puntatore: montaggio, zoom, selezione, trascinamento dei blocchi, CSS
   dal vivo, ispettori. Schede, campi, stili e nomi li disegnano gli altri
   moduli attraverso gli ispettori e gli eventi sul `document` del pannello.

   Quattro scelte reggono il file.

   1. L'ANTEPRIMA È SCRITTA, NON CARICATA. L'HTML arriva da POST
      /api/anteprima con `editor: true` e finisce nell'iframe con
      document.write sotto <base href="/">: così si vedono le modifiche non
      salvate e nessuno script del sito parte (§2.6). Il motore toglie
      comunque da sé ogni <script> eseguibile prima di scrivere: un server
      rimasto indietro non deve poter accendere il player di Twitch dentro
      l'editor, che sarebbe una seconda sessione video (CONTRATTO-3 §3.4).

   2. COORDINATE DELL'IFRAME, SEMPRE. L'iframe è largo quanto il
      dispositivo e la cornice si rimpicciolisce con transform: scale().
      Eventi, misure e sovrapposizione vivono dentro il documento
      dell'iframe, dove il browser riporta già tutto in scala: nessuna
      conversione da fare, quindi nessuna da sbagliare. Solo maniglie ed
      etichetta si ingrandiscono di 1/scala per restare afferrabili.

   3. document.open() NON CAMBIA DOCUMENTO. Riscrivere l'iframe tiene lo
      stesso oggetto Document e la stessa Window, ma cancella nodi e
      ascoltatori. «È ancora lo stesso documento?» non basta a capire se
      una risposta è vecchia: ogni scrittura ha un numero di generazione, e
      tutto quello che aspetta (richieste, fotogrammi, timer) controlla quello.

   4. DENTRO L'IFRAME SOLO ROBA NOSTRA. Stili con id `sb-motore*` e i
      gemelli «dal vivo», una sovrapposizione figlia di <html>, gli
      ascoltatori. Nessuna classe o attributo sugli elementi del sito:
      quello che STILE legge con getComputedStyle deve essere il sito.

   Indice
     1. Costanti
     2. Stato e utilità
     3. Nomi, dati, font
     4. Disposizione: lettura, scrittura, CSS dal vivo
     5. Tema, stili e testi dal vivo
     6. Selezione
     7. Documento dell'iframe: stili, sovrapposizione, eventi
     8. Trascinamento, maniglie, tastiera
     9. Anteprima: montaggio, zoom, caricamento
    10. Ispettori e posizioni
    11. L'oggetto `motore`
   ===================================================================== */

import { ponte } from './ponte.js';

/* ============================================================ 1. COSTANTI */

// Ordine delle fasce esclusive della regola geometrica (§4.3).
const DISPOSITIVI = ['telefono', 'tablet', 'computer'];
const NOMI_DISPOSITIVI = { telefono: 'Telefono', tablet: 'Tablet', computer: 'Computer' };

/* Ripieghi delle tabelle di SBStili (§3, §8): servono solo se
   condivisi/stili.js non si è caricato. Con il generatore presente vale
   il suo vocabolario, così un numero cambiato là non si sdoppia qui. */
const LARGHEZZE_DI_SERIE = { telefono: 375, tablet: 900, computer: 1100 };
const FASCE_DI_SERIE = {
  telefono: '(max-width: 759.98px)',
  tablet: '(min-width: 760px) and (max-width: 1099.98px)',
  computer: '(min-width: 1100px)'
};
const RIQUADRI_DI_SERIE = ['regia', 'settimana', 'chi', 'supporto', 'saluti', 'piede'];
const SEZIONI_DI_SERIE = ['binario', 'regia', 'diretta', 'sondaggio', 'settimana', 'chi', 'supporto', 'saluti', 'piede'];

const SCHEDE = ['contenuto', 'stile', 'avanzate'];
// I soli tipi che MARCATORI mette su data-sb-testo (§5.1.4): gli altri non si scrivono sul posto.
const TIPI_SUL_POSTO = ['testo', 'testolungo', 'ricco'];

const RE_TESTO = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
const RE_IMMAGINE = /^config\.immagini\.[a-z][A-Za-z0-9]*$/;
const RE_PARTE = /^[a-z][a-z0-9-]{0,40}$/;
const RE_BLOCCO = /^[a-z][a-z0-9-]{0,40}\.[a-z][a-z0-9-]{0,40}$/;

// Unità della disposizione: percentuale della larghezza del contenuto del riquadro (§4.3).
const X_MAX = 100;
const Y_MAX = 2000;
const MISURA_MIN = 1;

// Sotto questa scala l'anteprima non si legge più: oltre si scorre di lato.
const ZOOM_MIN = 0.2;

const SELETTORE_MARCATORI = '[data-sb-testo], [data-sb-immagine], [data-sb-parte], [data-sb-blocco], [data-sb-sezione]';
const MANIGLIE = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const FRECCE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// Il binario è fisso: scorrere a un elemento lo lascia un po' staccato dal bordo alto.
const MARGINE_SCORRIMENTO = 24;
// Oltre questo tempo senza pagina pronta si mostra l'errore invece di aspettare per sempre.
const TEMPO_MAX_CARICAMENTO = 20000;
// Dopo quanto chiedere la ricarica per una famiglia di Google Fonts nuova.
const ATTESA_RICARICA_FONT = 700;

const ID_STILE_EDITOR = 'sb-motore';
const ID_STILE_CONTORNI = 'sb-motore-contorni';
const ID_STILE_TRASCINA = 'sb-motore-trascina';
const ID_STILE_SPOSTA = 'sb-motore-sposta';
const ID_SOVRAPPOSIZIONE = 'sb-motore-sovrapposizione';
const ID_TEMA_VIVO = 'sb-tema-dal-vivo';
const ID_STILI_VIVI = 'sb-stili-dal-vivo';
const ID_DISPOSIZIONE_VIVA = 'sb-disposizione-dal-vivo';

/* I colori della regia (§12) entrano nell'iframe come variabili lette a
   runtime da pannello.css: così nel file non c'è un solo esadecimale e un
   ritocco della palette del pannello arriva anche qui. I ripieghi sono
   parole chiave del CSS, per un pannello senza il suo foglio. */
const VARIABILI_REGIA = [
  ['--sbm-ciano', '--p-ciano', 'cyan'],
  ['--sbm-linea-viva', '--p-linea-viva', 'gray'],
  ['--sbm-linea', '--p-linea-forte', 'dimgray'],
  ['--sbm-pannello', '--p-pannello', 'black'],
  ['--sbm-testo', '--p-testo', 'white'],
  ['--sbm-fondo', '--p-fondo', 'black'],
  ['--sbm-mono', '--p-mono', 'monospace']
];

/* ================================================== 2. STATO E UTILITÀ */

const st = {
  ui: null,                 // nodi dell'anteprima montata
  dispositivo: 'computer',
  zoomModo: 'adatta',       // 'adatta' = rimpicciolita per starci, 'reale' = grandezza vera
  scala: 1,                 // scala applicata adesso alla cornice
  scalaAdatta: 1,           // scala che servirebbe per farla stare nello spazio

  doc: null,                // documento dell'iframe, solo quando è pronto
  win: null,
  generazione: 0,           // cresce a ogni document.write
  pronto: false,
  richiesta: 0,             // numero dell'ultima ricarica chiesta
  primo: null,              // { risolvi, fatto } per la Promise di monta()
  inviati: null,            // { testi, config } con cui è stata disegnata la pagina
  famiglieDisegnate: null,  // Set delle famiglie di font che la pagina disegnata chiede a Google
  ripiego: false,           // la pagina è la bozza salvata, non quella dal vivo
  originali: null,          // WeakSet dei nodi del sito
  attesaPronti: [],         // chi aspetta la pagina pronta (monta, seleziona prima del caricamento)

  selezione: null,
  ricordo: null,            // { id, indice } per ritrovare la selezione dopo una ricarica
  iscritti: [],
  passaggio: null,          // elemento sotto il puntatore
  evidenziatoId: null,
  evidenziatoEl: null,
  sovrapposizione: null,
  contorni: false,
  griglia: true,

  ispettori: [],
  trascina: null,
  inAttesa: null,           // puntatore premuto sul blocco scelto, prima che diventi un trascinamento
  soppressoFino: 0,         // il clic che chiude un trascinamento non cambia selezione
  vivo: null,               // { dispositivo, riquadro, voci } posizioni del trascinamento in corso
  fotogrammaDisposizione: 0,
  fissatiAuto: new Map(),   // "dispositivo|riquadro" -> Map(id -> pos) fissati in automatico

  tema: { inVolo: false, inCoda: false, css: '', firma: '' },
  fontCaricati: null,       // elenco di GET /api/font
  fontRichiesta: null,
  fontRiletti: new Set(),
  timerRicaricaFont: 0,
  osservatore: null
};

function oggetto(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function arrotonda2(n) { const r = Math.round(n * 100) / 100; return r === 0 ? 0 : r; }
function stringi(n, min, max) { return Math.min(max, Math.max(min, n)); }
function registraErrore(errore) { if (window.console) console.error('[motore]', errore); }

/* Numero per il CSS come `formatta` di SBStili: due decimali al massimo,
   niente zeri finali, niente -0. Serve solo al generatore di ripiego. */
function numeroCss(n) {
  const r = arrotonda2(Number(n));
  if (!isFinite(r) || r === 0) return '0';
  const testo = r.toFixed(2);
  return testo.replace(/\.?0+$/, '');
}

function virgolette(valore) { return String(valore).replace(/["\\]/g, '\\$&'); }

function menoMovimento() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function emetti(nome, dettaglio) {
  try { document.dispatchEvent(new CustomEvent(nome, { detail: dettaglio })); } catch (e) { registraErrore(e); }
}

/* Costruttore di nodi del pannello. Mai innerHTML: il testo passa sempre
   da textContent (stessa regola di moduli/dom.js). */
function crea(tag, attributi = {}, figli = []) {
  const nodo = document.createElement(tag);
  for (const [nome, valore] of Object.entries(attributi)) {
    if (valore === null || valore === undefined || valore === false) continue;
    if (nome === 'classe') nodo.className = valore;
    else if (nome === 'testo') nodo.textContent = valore;
    else if (nome === 'su') for (const [evento, fn] of Object.entries(valore)) nodo.addEventListener(evento, fn);
    else if (valore === true) nodo.setAttribute(nome, '');
    else nodo.setAttribute(nome, String(valore));
  }
  for (const figlio of [].concat(figli)) {
    if (figlio === null || figlio === undefined || figlio === false) continue;
    nodo.append(typeof figlio === 'string' ? document.createTextNode(figlio) : figlio);
  }
  return nodo;
}

function svuota(nodo) { while (nodo && nodo.firstChild) nodo.removeChild(nodo.firstChild); }

function elementoDi(nodo) {
  if (!nodo) return null;
  return nodo.nodeType === 1 ? nodo : nodo.parentElement || null;
}

function montato() { return !!(st.ui && st.ui.radice && st.ui.radice.isConnected); }

/* Il documento dell'iframe, solo se è pronto e ancora quello scritto per
   questa generazione. */
function docVivo() {
  if (!st.pronto || !st.doc || !montato()) return null;
  let d = null;
  try { d = st.ui.iframe.contentDocument; } catch { d = null; }
  return d === st.doc ? d : null;
}

/* Un 404/405/501 vuol dire «questo server non conosce la rotta»: la stessa
   regola di rottaAssente() di moduli/api.js, ripetuta per non legarsi a un
   export che non è nel contratto. */
function rottaAssente(errore) {
  const stato = errore && errore.stato;
  return stato === 404 || stato === 405 || stato === 501;
}

function annuncia(testo) {
  if (st.ui && st.ui.annuncio) st.ui.annuncio.textContent = testo;
}

/* Il foglio del motore lo collega GUSCIO in index.html; se non c'è lo si
   aggiunge accanto al modulo, una volta sola. */
(function collegaFoglio() {
  try {
    const presente = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some((l) => /(^|\/)editor\/motore\.css(\?|#|$)/.test(l.getAttribute('href') || ''));
    if (presente) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./motore.css', import.meta.url).href;
    document.head.append(link);
  } catch { /* senza foglio l'anteprima funziona, solo meno curata */ }
})();

/* ================================================ 3. NOMI, DATI, FONT */

/* Moduli facoltativi. nomi.js (PARTI) è l'unica fonte dei nomi umani;
   ricco.js dà la stessa lista bianca del server; impostazioni.js (TEMA)
   conosce catalogo e font caricati. Si caricano a parte: se uno manca o
   lancia, il motore lavora lo stesso. */
const moduli = { nomi: null, sanifica: null, impostazioni: null, impostazioniChieste: false };

import('./nomi.js').then((m) => {
  moduli.nomi = m;
  if (st.selezione) { rinfrescaEtichette(); disegnaSovrapposizione(true); }
}).catch(() => { /* restano i nomi di ripiego */ });

import('../moduli/ricco.js').then((m) => {
  if (typeof m.sanifica !== 'function') return;
  moduli.sanifica = m.sanifica;
  if (docVivo()) applicaTesti();
}).catch(() => { /* i testi ricchi si aggiornano come testo semplice finché non c'è */ });

function chiediImpostazioni() {
  if (moduli.impostazioniChieste) return;
  moduli.impostazioniChieste = true;
  import('./impostazioni.js').then((m) => {
    moduli.impostazioni = m;
    if (docVivo()) applicaStili();
  }).catch(() => { /* restano catalogo e GET /api/font */ });
}

function leggibile(pezzo) {
  const testo = String(pezzo || '').replace(/[-_.]+/g, ' ').trim();
  return testo ? testo.charAt(0).toUpperCase() + testo.slice(1) : '';
}

function nomeDa(funzione, argomento) {
  const m = moduli.nomi;
  if (!m || typeof m[funzione] !== 'function') return '';
  try {
    const nome = m[funzione](argomento);
    return typeof nome === 'string' ? nome.trim() : '';
  } catch { return ''; }
}

function nomeSezione(id) { return nomeDa('nomeSezione', id) || leggibile(id) || 'Sezione'; }
function nomeParte(nome) { return nomeDa('nomeParte', nome) || 'Parte «' + leggibile(nome) + '»'; }
function nomeBlocco(id) { return nomeDa('nomeBlocco', id) || 'Blocco «' + leggibile(String(id).split('.').pop()) + '»'; }

function etichettaChiave(chiave) {
  try {
    const e = ponte.etichetta(chiave);
    if (typeof e === 'string' && e.trim() && e !== chiave) return e.trim();
  } catch { /* ripiego sotto */ }
  return chiave.startsWith('config.immagini.') ? 'Immagine' : 'Testo';
}

function leggi(chiave) {
  try { return ponte.leggi(chiave); } catch { return undefined; }
}

function campoDi(chiave) {
  try { return ponte.campo(chiave); } catch { return null; }
}

function vocabolario() {
  const S = window.SBStili;
  return {
    larghezze: S && oggetto(S.LARGHEZZE) ? S.LARGHEZZE : LARGHEZZE_DI_SERIE,
    fasce: S && oggetto(S.FASCE) ? S.FASCE : FASCE_DI_SERIE,
    riquadri: S && Array.isArray(S.RIQUADRI) ? S.RIQUADRI : RIQUADRI_DI_SERIE,
    sezioni: S && Array.isArray(S.SEZIONI) ? S.SEZIONI : SEZIONI_DI_SERIE
  };
}

function chiaveGuidata(chiave) {
  const c = String(chiave || '');
  // Una chiave con un indice è la proprietà di una voce di elenco: si cambia dalla sua parte.
  if (/(^|\.)\d+(\.|$)|\[/.test(c)) return true;
  const stato = ponte.stato;
  // Senza schema non si sa: meglio lasciar scrivere che bloccare un testo vero.
  if (!stato || !stato.schema) return false;
  const campo = campoDi(c);
  return !campo || TIPI_SUL_POSTO.indexOf(campo.tipo) === -1;
}

/* --- font per gli stili --------------------------------------------- */

function elencoFont() {
  const stato = ponte.stato;
  if (stato && oggetto(stato.editor) && Array.isArray(stato.editor.font)) return stato.editor.font;
  return Array.isArray(st.fontCaricati) ? st.fontCaricati : [];
}

function leggiFont(forza = false) {
  if (st.fontRichiesta && !forza) return st.fontRichiesta;
  const api = ponte.api;
  if (!api || typeof api.font !== 'function') { st.fontCaricati = st.fontCaricati || []; return Promise.resolve(st.fontCaricati); }
  st.fontRichiesta = Promise.resolve()
    .then(() => api.font())
    .then((r) => {
      const elenco = Array.isArray(r) ? r : (oggetto(r) && Array.isArray(r.font) ? r.font : []);
      st.fontCaricati = elenco;
      return elenco;
    })
    .catch(() => (Array.isArray(st.fontCaricati) ? st.fontCaricati : []));
  return st.fontRichiesta;
}

function famigliaDiRipiego(nome) {
  const catalogo = ponte.stato && ponte.stato.tema && ponte.stato.tema.font;
  if (!oggetto(catalogo)) return null;
  for (const slot of Object.keys(catalogo)) {
    const elenco = Array.isArray(catalogo[slot]) ? catalogo[slot] : [];
    const voce = elenco.find((f) => f && f.nome === nome && Array.isArray(f.pesi) && f.pesi.length);
    if (voce) return { nome: voce.nome, ripiego: voce.ripiego };
  }
  return null;
}

function fontDiRipiego(id) {
  const voce = elencoFont().find((f) => f && f.id === id);
  if (voce) return voce;
  // Un id sconosciuto può essere un font appena caricato dalle Impostazioni: si rilegge una volta.
  if (!st.fontRiletti.has(id)) {
    st.fontRiletti.add(id);
    leggiFont(true).then(() => { if (docVivo()) applicaStili(); });
  }
  return null;
}

function opzioniStili() {
  const imp = moduli.impostazioni;
  return {
    base: '',
    famiglia(nome) {
      try { if (imp && typeof imp.voceFamiglia === 'function') { const v = imp.voceFamiglia(nome); if (v) return v; } } catch { /* ripiego */ }
      return famigliaDiRipiego(nome);
    },
    font(id) {
      try { if (imp && typeof imp.voceFont === 'function') { const v = imp.voceFont(id); if (v) return v; } } catch { /* ripiego */ }
      return fontDiRipiego(id);
    }
  };
}

/* Famiglie che la pagina chiede a Google Fonts: quelle degli slot del tema
   e le `famiglia:` di config.stili. Il <link> lo scrive la generazione, e
   uno stile dal vivo non lo può aggiungere: una famiglia nuova vuole una
   ricarica. */
function famiglieUsate(config) {
  const insieme = new Set();
  if (!oggetto(config)) return insieme;
  const tema = oggetto(config.tema) && oggetto(config.tema.font) ? config.tema.font : {};
  for (const valore of Object.values(tema)) if (typeof valore === 'string' && !valore.startsWith('caricato:')) insieme.add(valore);
  const stili = oggetto(config.stili) ? config.stili : {};
  for (const voce of Object.values(stili)) {
    if (!oggetto(voce)) continue;
    for (const perDispositivo of Object.values(voce)) {
      if (oggetto(perDispositivo) && typeof perDispositivo.font === 'string' && perDispositivo.font.startsWith('famiglia:')) {
        insieme.add(perDispositivo.font.slice('famiglia:'.length));
      }
    }
  }
  return insieme;
}

function controllaFamiglie() {
  if (!st.famiglieDisegnate || st.ripiego) return;
  const dati = ponte.stato && ponte.stato.dati;
  if (!dati) return;
  const adesso = famiglieUsate(dati.config);
  let nuova = false;
  for (const nome of adesso) if (!st.famiglieDisegnate.has(nome)) { nuova = true; break; }
  if (!nuova) return;
  clearTimeout(st.timerRicaricaFont);
  st.timerRicaricaFont = setTimeout(() => { if (montato()) ricarica({ tieniScorrimento: true }); }, ATTESA_RICARICA_FONT);
}

/* ===================== 4. DISPOSIZIONE: LETTURA, SCRITTURA, CSS DAL VIVO */

function blocchiDisposizione() {
  const d = leggi('config.disposizione');
  return oggetto(d) && oggetto(d.blocchi) ? d.blocchi : {};
}

function numeroValido(v) { return typeof v === 'number' && isFinite(v); }

/* { x, y, l, a } stretto ai bordi e a due decimali, come pulisciRettangolo
   di SBStili; null se un campo non è un numero. */
function pulisciRettangolo(p) {
  if (!oggetto(p)) return null;
  const S = window.SBStili;
  const riquadro = S && Array.isArray(S.RIQUADRI) ? S.RIQUADRI[0] : '';
  if (riquadro && typeof S.pulisciDisposizione === 'function') {
    // Si passa dal generatore vero con un blocco di comodo: stessa strettoia del sito, al centesimo.
    const pulita = S.pulisciDisposizione({ blocchi: { [riquadro]: [{ id: riquadro + '.misura', pos: { telefono: p, tablet: null, computer: null } }] } });
    const voce = pulita.blocchi[riquadro] && pulita.blocchi[riquadro][0];
    return voce ? voce.pos.telefono : null;
  }
  const valori = [p.x, p.y, p.l, p.a].map((v) => (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? parseFloat(v) : v));
  if (!valori.every(numeroValido)) return null;
  return {
    x: arrotonda2(stringi(valori[0], 0, X_MAX)),
    y: arrotonda2(stringi(valori[1], 0, Y_MAX)),
    l: arrotonda2(stringi(valori[2], 0, X_MAX)),
    a: arrotonda2(stringi(valori[3], 0, Y_MAX))
  };
}

function stessoRettangolo(a, b) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.l === b.l && a.a === b.a;
}

function senzaPrefisso(id) {
  const s = String(id == null ? '' : id);
  return s.startsWith('blocco:') ? s.slice('blocco:'.length) : s;
}

// Il riquadro di un blocco è il suo prefisso: la generazione salta gli id col prefisso sbagliato (§4.3).
function riquadroDelBlocco(idBlocco) { return String(idBlocco).split('.')[0]; }

function voceBlocco(idBlocco) {
  const elenco = blocchiDisposizione()[riquadroDelBlocco(idBlocco)];
  if (!Array.isArray(elenco)) return null;
  return elenco.find((v) => oggetto(v) && v.id === idBlocco) || null;
}

function posizione(idBlocco, dispositivo) {
  const id = senzaPrefisso(idBlocco);
  if (!RE_BLOCCO.test(id)) return null;
  const d = DISPOSITIVI.indexOf(dispositivo) !== -1 ? dispositivo : st.dispositivo;
  const voce = voceBlocco(id);
  return voce && oggetto(voce.pos) ? pulisciRettangolo(voce.pos[d]) : null;
}

/* Blocchi che la pagina ha davvero: { riquadro: { id: el } }. Un blocco
   conta per il riquadro che lo contiene più da vicino, escluso sé stesso:
   la stessa regola che SERVER usa per `presente`. */
function blocchiInPagina(doc) {
  const mappa = {};
  if (!doc) return mappa;
  for (const el of doc.querySelectorAll('[data-sb-blocco]')) {
    const id = el.getAttribute('data-sb-blocco');
    const riquadro = el.parentElement ? el.parentElement.closest('[data-sb-riquadro]') : null;
    const nome = riquadro ? riquadro.getAttribute('data-sb-riquadro') : '';
    if (!id || !nome) continue;
    if (!mappa[nome]) mappa[nome] = {};
    if (!mappa[nome][id]) mappa[nome][id] = el;
  }
  return mappa;
}

function blocchiDelRiquadro(riquadro) {
  const trovati = blocchiInPagina(docVivo())[riquadro] || {};
  return Object.keys(trovati).map((id) => ({ id, el: trovati[id] }));
}

/* config.disposizione con sopra le posizioni del trascinamento in corso:
   il CSS dal vivo si rifà a ogni movimento senza toccare la bozza. */
function disposizionePerCss() {
  const blocchi = blocchiDisposizione();
  const vivo = st.vivo;
  if (!vivo) return { blocchi };
  const copia = {};
  for (const k of Object.keys(blocchi)) copia[k] = blocchi[k];
  const visti = new Set();
  const elenco = (Array.isArray(copia[vivo.riquadro]) ? copia[vivo.riquadro] : []).map((voce) => {
    if (!oggetto(voce) || typeof voce.id !== 'string' || visti.has(voce.id) || !vivo.voci.has(voce.id)) {
      if (oggetto(voce) && typeof voce.id === 'string') visti.add(voce.id);
      return voce;
    }
    visti.add(voce.id);
    const vecchia = oggetto(voce.pos) ? voce.pos : {};
    const pos = {};
    for (const d of DISPOSITIVI) pos[d] = Object.prototype.hasOwnProperty.call(vecchia, d) ? vecchia[d] : null;
    pos[vivo.dispositivo] = vivo.voci.get(voce.id);
    return { id: voce.id, pos };
  });
  for (const [id, rettangolo] of vivo.voci) {
    if (visti.has(id)) continue;
    const pos = { telefono: null, tablet: null, computer: null };
    pos[vivo.dispositivo] = rettangolo;
    elenco.push({ id, pos });
  }
  copia[vivo.riquadro] = elenco;
  return { blocchi: copia };
}

/* Generatore di ripiego della regola geometrica (§4.3), per il solo caso
   in cui condivisi/stili.js non si sia caricato. Con SBStili presente non
   si usa: il CSS dal vivo è il suo, e il byte è garantito dall'essere lo
   stesso codice del sito. */
function disposizioneCssDiRipiego(disposizione, presente) {
  const { riquadri, fasce } = vocabolario();
  const blocchi = oggetto(disposizione) && oggetto(disposizione.blocchi) ? disposizione.blocchi : {};
  const fuori = [];
  for (const fascia of DISPOSITIVI) {
    const regole = [];
    for (const riquadro of riquadri) {
      if (!Array.isArray(blocchi[riquadro])) continue;
      const visti = new Set();
      const messi = [];
      for (const voce of blocchi[riquadro]) {
        if (!oggetto(voce) || typeof voce.id !== 'string' || !RE_BLOCCO.test(voce.id) || visti.has(voce.id)) continue;
        if (riquadroDelBlocco(voce.id) !== riquadro) continue;
        visti.add(voce.id);
        const r = pulisciRettangolo(oggetto(voce.pos) ? voce.pos[fascia] : null);
        if (!r || !presente(riquadro, voce.id)) continue;
        messi.push({ id: voce.id, r });
      }
      if (!messi.length) continue;
      let m = 1;
      for (const p of messi) m = Math.max(m, p.r.y + p.r.a);
      const riq = '[data-sb-riquadro="' + riquadro + '"]';
      regole.push('  ' + riq + ' {\n    position: relative !important;\n    container-type: inline-size;\n    aspect-ratio: 100 / ' + numeroCss(m) + ';\n  }');
      for (const p of messi) {
        regole.push(
          '  ' + riq + ' [data-sb-blocco="' + p.id + '"] {\n' +
          '    position: absolute !important;\n' +
          '    left: calc(' + numeroCss(p.r.x) + ' * 1cqw) !important;\n' +
          '    top: calc(' + numeroCss(p.r.y) + ' * 1cqw) !important;\n' +
          '    width: calc(' + numeroCss(p.r.l) + ' * 1cqw) !important;\n' +
          '    min-height: calc(' + numeroCss(p.r.a) + ' * 1cqw) !important;\n' +
          '    height: auto !important;\n' +
          '    margin: 0 !important;\n' +
          '    max-width: none !important;\n' +
          '  }'
        );
      }
    }
    if (regole.length) fuori.push('@media ' + fasce[fascia] + ' {\n' + regole.join('\n') + '\n}');
  }
  return fuori.join('\n');
}

function cssDisposizione(doc) {
  const pagina = blocchiInPagina(doc);
  const presente = (riquadro, id) => !!(pagina[riquadro] && pagina[riquadro][id]);
  const disposizione = disposizionePerCss();
  const S = window.SBStili;
  if (S && typeof S.disposizioneCss === 'function') return String(S.disposizioneCss(disposizione, { presente }) || '');
  return disposizioneCssDiRipiego(disposizione, presente);
}

/* Lo <style> pubblicato si spegne, non si toglie: se il motore sparisse
   (modulo ricaricato, errore) basterebbe riaccenderlo. `media` in più di
   `disabled` perché un foglio disabilitato si riaccende da solo se il suo
   testo cambia. */
function spegniPubblicato(doc, id) {
  const pubblicato = doc.getElementById(id);
  if (pubblicato && pubblicato.tagName === 'STYLE' && !pubblicato.disabled) {
    pubblicato.disabled = true;
    pubblicato.setAttribute('media', 'not all');
  }
}

/* Lo <style> dal vivo va subito dopo il suo gemello pubblicato: l'ordine
   della cascata resta quello del sito (disposizione, poi stili). */
function stileDalVivo(doc, id, dopoId) {
  let stile = doc.getElementById(id);
  if (stile) return stile;
  stile = doc.createElement('style');
  stile.id = id;
  const gemello = doc.getElementById(dopoId);
  if (gemello && gemello.parentNode) gemello.after(stile);
  else if (id === ID_DISPOSIZIONE_VIVA && doc.getElementById(ID_STILI_VIVI)) doc.getElementById(ID_STILI_VIVI).before(stile);
  else (doc.head || doc.documentElement).append(stile);
  return stile;
}

function applicaDisposizione() {
  const doc = docVivo();
  if (!doc) return;
  let css = '';
  try { css = cssDisposizione(doc); } catch (e) { registraErrore(e); return; }
  spegniPubblicato(doc, 'sb-disposizione');
  const stile = stileDalVivo(doc, ID_DISPOSIZIONE_VIVA, 'sb-disposizione');
  if (stile.textContent !== css) stile.textContent = css;
}

function programmaDisposizione() {
  if (st.fotogrammaDisposizione) return;
  st.fotogrammaDisposizione = requestAnimationFrame(() => {
    st.fotogrammaDisposizione = 0;
    applicaDisposizione();
  });
}

function avvisa(testo, tipo = 'info') {
  try { ponte.avviso(testo, { tipo }); } catch { annuncia(testo); }
}

/* Scrive più posizioni dello stesso riquadro in un colpo solo, per il
   dispositivo `d`. Un blocco che torna nel flusso su tutti e tre i
   dispositivi esce dall'elenco, e un riquadro vuoto esce da `blocchi`:
   rimettere tutto a posto riporta i dati ai valori di partenza. */
function scriviPosizioni(riquadro, voci, d) {
  if (vocabolario().riquadri.indexOf(riquadro) === -1) {
    avvisa('Questo blocco sta in una parte del sito che non accetta posizioni libere.', 'errore');
    return false;
  }
  const dati = ponte.stato && ponte.stato.dati;
  if (!dati || !oggetto(dati.config)) return false;

  let disposizione = leggi('config.disposizione');
  const nuova = !oggetto(disposizione);
  if (nuova) disposizione = { blocchi: {} };
  if (!oggetto(disposizione.blocchi)) disposizione.blocchi = {};
  const elenco = Array.isArray(disposizione.blocchi[riquadro]) ? disposizione.blocchi[riquadro] : [];

  let cambiato = false;
  for (const { id, pos } of voci) {
    let voce = elenco.find((v) => oggetto(v) && v.id === id);
    if (!voce) {
      if (!pos) continue;
      voce = { id, pos: { telefono: null, tablet: null, computer: null } };
      elenco.push(voce);
      cambiato = true;
    }
    if (!oggetto(voce.pos)) voce.pos = {};
    for (const k of DISPOSITIVI) if (!Object.prototype.hasOwnProperty.call(voce.pos, k)) { voce.pos[k] = null; cambiato = true; }
    const pulita = pos ? pulisciRettangolo(pos) : null;
    if (!stessoRettangolo(pulisciRettangolo(voce.pos[d]), pulita)) {
      voce.pos[d] = pulita;
      cambiato = true;
    }
  }
  for (let i = elenco.length - 1; i >= 0; i -= 1) {
    const v = elenco[i];
    if (oggetto(v) && oggetto(v.pos) && DISPOSITIVI.every((k) => v.pos[k] === null)) { elenco.splice(i, 1); cambiato = true; }
  }
  if (elenco.length) disposizione.blocchi[riquadro] = elenco;
  else if (Object.prototype.hasOwnProperty.call(disposizione.blocchi, riquadro)) { delete disposizione.blocchi[riquadro]; cambiato = true; }

  if (cambiato) {
    if (nuova) ponte.scrivi('config.disposizione', disposizione);
    else ponte.segnala('config.disposizione');
  }
  applicaDisposizione();
  aggiornaPannelloPosizioni();
  return true;
}

/* Blocchi fissati in automatico: servono a «Riporta al posto originale»
   per capire se riportare al flusso l'intero riquadro. Solo in memoria. */
function fissati(d, riquadro) {
  const chiave = d + '|' + riquadro;
  if (!st.fissatiAuto.has(chiave)) st.fissatiAuto.set(chiave, new Map());
  return st.fissatiAuto.get(chiave);
}

function ricordaFissati(d, riquadro, voci) {
  const mappa = fissati(d, riquadro);
  for (const v of voci) mappa.set(v.id, v.pos);
}

/* Quando il primo blocco di un riquadro esce dal flusso i fratelli
   risalirebbero: si fissano dove sono adesso, misurati PRIMA di spostare
   qualunque cosa. I blocchi nascosti in questa vista restano nel flusso. */
function misuraFratelli(riquadro, eccetto) {
  const fuori = [];
  for (const b of blocchiDelRiquadro(riquadro)) {
    if (b.id === eccetto) continue;
    const m = misura(b.el);
    if (!m || (m.pos.l <= 0 && m.pos.a <= 0)) continue;
    const r = pulisciRettangolo(m.pos);
    if (!r) continue;
    r.l = Math.max(MISURA_MIN, r.l);
    r.a = Math.max(MISURA_MIN, r.a);
    fuori.push({ id: b.id, pos: r });
  }
  return fuori;
}

function riquadroHaPosizioni(riquadro, d) {
  return blocchiDelRiquadro(riquadro).some((b) => !!posizione(b.id, d));
}

function impostaPosizione(idBlocco, pos) {
  const id = senzaPrefisso(idBlocco);
  if (!RE_BLOCCO.test(id)) return false;
  const d = st.dispositivo;
  let pulita = null;
  if (pos !== null && pos !== undefined) {
    pulita = pulisciRettangolo(pos);
    if (!pulita) return false;
  }
  const doc = docVivo();
  const riquadro = riquadroDelBlocco(id);
  // Con l'anteprima caricata si posizionano solo blocchi che la pagina ha davvero.
  if (doc && pulita && !(blocchiInPagina(doc)[riquadro] || {})[id]) return false;

  let voci = [{ id, pos: pulita }];
  const auto = fissati(d, riquadro);
  if (pulita && doc && !riquadroHaPosizioni(riquadro, d)) {
    const fratelli = misuraFratelli(riquadro, id);
    ricordaFissati(d, riquadro, fratelli);
    voci = voci.concat(fratelli);
  }
  if (!pulita) {
    /* Se restano posizionati solo fratelli fissati in automatico e mai più
       toccati, il riquadro torna tutto nel flusso, com'era all'inizio. */
    const altri = blocchiDelRiquadro(riquadro).filter((b) => b.id !== id && posizione(b.id, d));
    if (altri.length && altri.every((b) => auto.has(b.id) && stessoRettangolo(auto.get(b.id), posizione(b.id, d)))) {
      for (const b of altri) voci.push({ id: b.id, pos: null });
    }
    auto.delete(id);
    if (!altri.length || voci.length > 1) st.fissatiAuto.delete(d + '|' + riquadro);
  } else if (auto.has(id) && !stessoRettangolo(auto.get(id), pulita)) {
    auto.delete(id);   // toccato a mano: non è più «automatico»
  }
  return scriviPosizioni(riquadro, voci, d);
}

function riportaRiquadro(riquadro) {
  const d = st.dispositivo;
  const voci = blocchiDelRiquadro(riquadro).filter((b) => !!posizione(b.id, d)).map((b) => ({ id: b.id, pos: null }));
  st.fissatiAuto.delete(d + '|' + riquadro);
  return voci.length ? scriviPosizioni(riquadro, voci, d) : false;
}

function fissaRiquadro(riquadro) {
  const d = st.dispositivo;
  const voci = misuraFratelli(riquadro, null).filter((v) => !posizione(v.id, d));
  return voci.length ? scriviPosizioni(riquadro, voci, d) : false;
}

/* ================================== 5. TEMA, STILI E TESTI DAL VIVO */

function firmaTema(tema) { try { return JSON.stringify(tema); } catch { return ''; } }

/* Il foglio del tema va subito dopo <link href="css/tema.css">, che poi si
   spegne: il foglio dal vivo lo sostituisce nello stesso punto della
   cascata. Messo in fondo a <head> batterebbe anche i :root dei fogli di
   sezione, e l'anteprima non sarebbe più il sito. */
function scriviTema(doc, css) {
  let stile = doc.getElementById(ID_TEMA_VIVO);
  const link = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
    .find((l) => /(^|\/)css\/tema\.css(\?|#|$)/.test(l.getAttribute('href') || ''));
  if (!stile) {
    stile = doc.createElement('style');
    stile.id = ID_TEMA_VIVO;
    if (link) link.after(stile);
    else (doc.head || doc.documentElement).append(stile);
  }
  if (stile.textContent !== css) stile.textContent = css;
  if (link && !link.disabled) link.disabled = true;
}

async function applicaTema() {
  if (!docVivo()) return;
  const api = ponte.api;
  if (!api || typeof api.temaCss !== 'function') return;
  // Una richiesta in volo e una in coda: le chiamate doppie nello stesso fotogramma ne fanno una.
  if (st.tema.inVolo) { st.tema.inCoda = true; return; }
  const tema = leggi('config.tema');
  if (!oggetto(tema)) return;
  const firma = firmaTema(tema);
  st.tema.inVolo = true;
  try {
    const risposta = await api.temaCss(tema);
    const css = typeof risposta === 'string' ? risposta : (oggetto(risposta) && typeof risposta.css === 'string' ? risposta.css : '');
    const doc = docVivo();
    if (doc && css.trim()) {
      scriviTema(doc, css);
      st.tema.css = css;
      st.tema.firma = firma;
    }
  } catch (errore) {
    if (!rottaAssente(errore) && !(errore && errore.scaduta)) registraErrore(errore);
  } finally {
    st.tema.inVolo = false;
    if (st.tema.inCoda) { st.tema.inCoda = false; applicaTema(); }
  }
  controllaFamiglie();
}

function applicaStili() {
  const doc = docVivo();
  if (!doc) return;
  const S = window.SBStili;
  // Senza generatore resta lo <style id="sb-stili"> della pagina: meglio lo stile salvato che nessuno.
  if (!S || typeof S.stiliCss !== 'function') return;
  let testoStili = '';
  try { testoStili = JSON.stringify(leggi('config.stili') || {}); } catch { testoStili = ''; }
  // Catalogo e font caricati servono solo a chi li usa: niente richieste per una pagina senza.
  if (/"(famiglia|caricato):/.test(testoStili)) chiediImpostazioni();
  if (testoStili.indexOf('"caricato:') !== -1 && !st.fontCaricati &&
      !(ponte.stato && oggetto(ponte.stato.editor) && Array.isArray(ponte.stato.editor.font))) {
    leggiFont().then(() => { if (docVivo() === doc) applicaStiliOra(doc, S); });
  }
  applicaStiliOra(doc, S);
  controllaFamiglie();
}

function applicaStiliOra(doc, S) {
  const stili = leggi('config.stili');
  let css = '';
  try { css = String(S.stiliCss(oggetto(stili) ? stili : {}, opzioniStili()) || ''); } catch (e) { registraErrore(e); return; }
  spegniPubblicato(doc, 'sb-stili');
  const stile = stileDalVivo(doc, ID_STILI_VIVI, 'sb-stili');
  if (stile.textContent !== css) stile.textContent = css;
}

/* Testi e immagini dallo stato ai marcatori. `filtro(chiave)` limita il
   giro alle chiavi cambiate (dopo un caricamento, quelle scritte mentre la
   richiesta era in volo). */
function inScrittura(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return !!(el.closest && el.closest('[data-sb-scrittura], [contenteditable="true"], [contenteditable="plaintext-only"]'));
}

function srcSicuro(valore) {
  const v = String(valore == null ? '' : valore).trim();
  if (!v || /[\u0000-\u001f\u007f]/.test(v) || /^\/\//.test(v)) return '';
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  if (schema && !/^https?$/i.test(schema[1])) return '';
  return v;
}

function testoSenzaTag(html) {
  return new DOMParser().parseFromString('<!doctype html><body>' + String(html), 'text/html').body.textContent || '';
}

function scriviRicco(el, valore) {
  if (!moduli.sanifica) {
    // Senza la lista bianca non entra un solo tag: si scrive il testo nudo.
    const testo = testoSenzaTag(valore);
    if (el.textContent !== testo) el.textContent = testo;
    return;
  }
  let pulito = '';
  try { pulito = moduli.sanifica(valore); } catch (e) { registraErrore(e); return; }
  // DOMParser costruisce un documento inerte: niente si carica e niente si esegue mentre lo si legge.
  const inerte = new DOMParser().parseFromString('<!doctype html><body>' + pulito, 'text/html');
  if (el.innerHTML === inerte.body.innerHTML) return;
  const doc = el.ownerDocument;
  const nodi = Array.from(inerte.body.childNodes).map((n) => doc.importNode(n, true));
  el.replaceChildren(...nodi);
  segnaOriginali(el);
}

/* Un marcatore va scritto come testo ricco? Una chiave senza campo suo è la
   proprietà di una voce di elenco (config.supporto.0.testo) o il pezzo di un
   campo composto (config.orari.giochi.1): si risale al campo che la contiene
   e, per un elenco, si guarda il tipo del sottocampo. Fuori da un «ricco»
   dichiarato il valore resta testo, come lo stampa la generazione con la
   doppia graffa: passarlo dal sanificatore toglierebbe dall'anteprima un
   «<Quake>» che sul sito pubblicato si legge. Solo senza schema vale ancora
   la strada prudente: un tag nel valore si ripulisce come ricco. */
function testoRicco(chiave, valore) {
  const campo = campoDi(chiave);
  if (campo) return campo.tipo === 'ricco';
  if (!ponte.stato || !ponte.stato.schema) return valore.indexOf('<') !== -1;
  const pezzi = chiave.split('.');
  for (let n = pezzi.length - 1; n > 1; n -= 1) {
    const padre = campoDi(pezzi.slice(0, n).join('.'));
    if (!padre) continue;
    const resto = pezzi.slice(n).filter((p) => !/^\d+$/.test(p));
    if (padre.tipo !== 'elenco' || !Array.isArray(padre.campi) || resto.length !== 1) return false;
    const sotto = padre.campi.find((c) => c && c.chiave === resto[0]);
    return !!(sotto && sotto.tipo === 'ricco');
  }
  return false;
}

function applicaTesti(filtro = null) {
  const doc = docVivo();
  if (!doc) return;
  const vale = (chiave) => !filtro || filtro(chiave);

  for (const el of doc.querySelectorAll('[data-sb-testo]')) {
    const chiave = el.getAttribute('data-sb-testo');
    if (!RE_TESTO.test(chiave || '') || !vale(chiave) || inScrittura(el)) continue;
    const valore = leggi(chiave);
    if (typeof valore !== 'string') continue;
    if (testoRicco(chiave, valore)) scriviRicco(el, valore);
    else if (el.textContent !== valore) el.textContent = valore;
  }

  for (const img of doc.querySelectorAll('[data-sb-immagine]')) {
    const chiave = img.getAttribute('data-sb-immagine');
    if (!RE_IMMAGINE.test(chiave || '') || !vale(chiave)) continue;
    const src = srcSicuro(leggi(chiave));
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  for (const img of doc.querySelectorAll('[data-sb-alt]')) {
    const chiave = img.getAttribute('data-sb-alt');
    if (!RE_TESTO.test(chiave || '') || !vale(chiave)) continue;
    const valore = leggi(chiave);
    if (typeof valore !== 'string') continue;
    const alt = testoSenzaTag(valore).replace(/\s+/g, ' ').trim();
    if (img.getAttribute('alt') !== alt) img.setAttribute('alt', alt);
  }
}

/* Chiavi il cui valore adesso è diverso da quello con cui la pagina è
   stata disegnata. */
function filtroCambiati(inviati) {
  if (!inviati) return null;
  return (chiave) => {
    const adesso = leggi(chiave);
    let prima;
    if (chiave.startsWith('config.')) {
      prima = inviati.config;
      for (const passo of chiave.slice('config.'.length).split('.')) prima = oggetto(prima) ? prima[passo] : undefined;
    } else {
      prima = oggetto(inviati.testi) ? inviati.testi[chiave] : undefined;
    }
    return adesso !== prima;
  };
}

/* ============================================================ 6. SELEZIONE */

function creaMeta(tipo, chiave, el) {
  const meta = {
    id: tipo + ':' + chiave,
    tipo,
    chiave,
    el,
    sezione: '',
    etichetta: '',
    puoPosizionare: false,
    riquadro: '',
    elRiquadro: null,
    alt: '',
    guidata: false,
    genitore: null
  };
  if (tipo === 'testo') {
    meta.etichetta = etichettaChiave(chiave);
    meta.guidata = chiaveGuidata(chiave);
  } else if (tipo === 'immagine') {
    meta.etichetta = etichettaChiave(chiave);
    meta.alt = el.getAttribute('data-sb-alt') || '';
  } else if (tipo === 'parte') {
    meta.etichetta = nomeParte(chiave);
  } else if (tipo === 'blocco') {
    const riquadro = el.parentElement ? el.parentElement.closest('[data-sb-riquadro]') : null;
    meta.elRiquadro = riquadro;
    meta.riquadro = riquadro ? riquadro.getAttribute('data-sb-riquadro') || '' : '';
    meta.puoPosizionare = !!meta.riquadro && vocabolario().riquadri.indexOf(meta.riquadro) !== -1 &&
      riquadroDelBlocco(chiave) === meta.riquadro;
    meta.etichetta = nomeBlocco(chiave);
  } else {
    meta.etichetta = nomeSezione(chiave);
  }
  return meta;
}

/* I tipi presenti su UN elemento, dal più interno al più esterno (§5.3):
   prima il contenuto, poi la parte, poi il blocco, poi la sezione. */
function metaSu(el) {
  const fuori = [];
  if (!el || el.nodeType !== 1) return fuori;
  if (el.hasAttribute('data-sb-immagine')) {
    const k = el.getAttribute('data-sb-immagine');
    if (RE_IMMAGINE.test(k)) fuori.push(creaMeta('immagine', k, el));
  } else if (el.hasAttribute('data-sb-testo')) {
    const k = el.getAttribute('data-sb-testo');
    if (RE_TESTO.test(k)) fuori.push(creaMeta('testo', k, el));
  }
  if (el.hasAttribute('data-sb-parte')) {
    const k = el.getAttribute('data-sb-parte');
    if (RE_PARTE.test(k)) fuori.push(creaMeta('parte', k, el));
  }
  if (el.hasAttribute('data-sb-blocco')) {
    const k = el.getAttribute('data-sb-blocco');
    if (RE_BLOCCO.test(k)) fuori.push(creaMeta('blocco', k, el));
  }
  if (el.hasAttribute('data-sb-sezione')) {
    const k = el.getAttribute('data-sb-sezione');
    if (vocabolario().sezioni.indexOf(k) !== -1) fuori.push(creaMeta('sezione', k, el));
  }
  return fuori;
}

/* La catena a partire da `el`; con `daId` si parte da quel tipo preciso
   sull'elemento (un <p> che è testo e blocco, scelto come blocco). */
function catena(el, daId) {
  let elenco = [];
  let primo = true;
  for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
    let qui = metaSu(cur);
    if (primo && daId) {
      const at = qui.findIndex((m) => m.id === daId);
      if (at === -1) return [];
      qui = qui.slice(at);
    }
    primo = false;
    elenco = elenco.concat(qui);
  }
  for (let i = 0; i < elenco.length; i += 1) elenco[i].genitore = elenco[i + 1] || null;
  let sezione = '';
  for (let i = elenco.length - 1; i >= 0; i -= 1) {
    if (elenco[i].tipo === 'sezione') sezione = elenco[i].chiave;
    elenco[i].sezione = sezione;
  }
  return elenco;
}

function metaDaBersaglio(bersaglio) {
  const el = elementoDi(bersaglio);
  return el ? catena(el, null)[0] || null : null;
}

// 'chi.corpo' (id nudo di un blocco) -> 'blocco:chi.corpo'.
function normalizzaId(id) {
  const s = String(id == null ? '' : id).trim();
  return RE_BLOCCO.test(s) ? 'blocco:' + s : s;
}

function dividiId(id) {
  const i = id.indexOf(':');
  return i < 1 ? null : { tipo: id.slice(0, i), chiave: id.slice(i + 1) };
}

function elementiPer(doc, id) {
  const p = dividiId(id);
  if (!doc || !p || !p.chiave) return [];
  const attributo = { testo: 'data-sb-testo', immagine: 'data-sb-immagine', parte: 'data-sb-parte', blocco: 'data-sb-blocco', sezione: 'data-sb-sezione' }[p.tipo];
  if (!attributo) return [];
  try { return Array.from(doc.querySelectorAll('[' + attributo + '="' + virgolette(p.chiave) + '"]')); } catch { return []; }
}

function risolviId(id, indice = 0) {
  const doc = docVivo();
  if (!doc || typeof id !== 'string' || !id) return null;
  const nid = normalizzaId(id);
  const elementi = elementiPer(doc, nid);
  if (!elementi.length) return null;
  const inizio = stringi(indice || 0, 0, elementi.length - 1);
  for (let t = 0; t < elementi.length; t += 1) {
    const c = catena(elementi[(inizio + t) % elementi.length], nid);
    if (c.length) return c[0];
  }
  return null;
}

function indiceDi(meta) {
  const doc = docVivo();
  if (!doc || !meta) return 0;
  const i = elementiPer(doc, meta.id).indexOf(meta.el);
  return i === -1 ? 0 : i;
}

function rinfrescaMeta(meta) {
  if (!meta || !meta.el || !meta.el.isConnected) return null;
  return catena(meta.el, meta.id)[0] || null;
}

function rinfrescaEtichette() {
  const nuovo = rinfrescaMeta(st.selezione);
  if (nuovo) st.selezione = nuovo;
}

function avvisaIscritti(meta) {
  for (const fn of st.iscritti.slice()) {
    try { fn(meta); } catch (e) { registraErrore(e); }
  }
}

function impostaSelezione(meta, { forza = false, tieniRicordo = false } = {}) {
  const prima = st.selezione;
  if (!forza && prima && meta && prima.el === meta.el && prima.id === meta.id) return;
  if (!forza && !prima && !meta) return;
  if (st.trascina) fineTrascina(true);
  st.selezione = meta || null;
  if (!tieniRicordo) st.ricordo = meta ? { id: meta.id, indice: indiceDi(meta) } : null;
  disegnaSovrapposizione(true);
  aggiornaPannelloPosizioni();
  avvisaIscritti(st.selezione);
}

function seleziona(id) {
  if (id === null || id === undefined || id === '') {
    st.ricordo = null;
    impostaSelezione(null);
    return null;
  }
  const nid = normalizzaId(id);
  if (!docVivo()) {
    st.ricordo = { id: nid, indice: 0 };   // si applica appena l'anteprima è pronta
    return null;
  }
  const attuale = st.selezione;
  if (attuale && attuale.id === nid && attuale.el.isConnected) return attuale;
  const meta = risolviId(nid, 0);
  impostaSelezione(meta);
  if (meta) scorriAElemento(meta.el, 'mostra');
  return meta;
}

function saliAlGenitore() {
  const sel = st.selezione;
  if (!sel) return null;
  const g = sel.genitore ? rinfrescaMeta(sel.genitore) || sel.genitore : null;
  impostaSelezione(g);
  return g;
}

function percorso() {
  const fuori = [];
  for (let m = st.selezione; m; m = m.genitore) fuori.unshift(m);
  return fuori;
}

function fisso(el) {
  try { return st.win.getComputedStyle(el).position === 'fixed'; } catch { return false; }
}

/* Scorre SOLO l'iframe: scrollIntoView farebbe scorrere anche il pannello.
   'alto' mette l'elemento in cima (Navigatore), 'mostra' lo porta al centro
   solo se è fuori dallo schermo. */
function scorriAElemento(el, come) {
  const win = st.win;
  if (!el || !win || !el.isConnected || fisso(el)) return;
  const r = el.getBoundingClientRect();
  let alto;
  if (come === 'alto') {
    alto = win.scrollY + r.top - MARGINE_SCORRIMENTO;
  } else {
    if (r.bottom >= 0 && r.top <= win.innerHeight) return;
    alto = win.scrollY + r.top - Math.max(0, (win.innerHeight - r.height) / 2);
  }
  alto = Math.max(0, Math.round(alto));
  const morbido = come === 'alto' && !menoMovimento();
  try { win.scrollTo({ top: alto, left: win.scrollX, behavior: morbido ? 'smooth' : 'instant' }); } catch { win.scrollTo(win.scrollX, alto); }
}

/* ========================= 7. DOCUMENTO DELL'IFRAME: STILI, EVENTI */

function valoreCssSicuro(v) { return String(v || '').trim().replace(/[;{}<>\\]/g, ''); }

function variabiliRegia() {
  let calcolato = null;
  try { calcolato = getComputedStyle(document.documentElement); } catch { calcolato = null; }
  const righe = VARIABILI_REGIA.map(([mia, delPannello, ripiego]) => {
    const v = calcolato ? valoreCssSicuro(calcolato.getPropertyValue(delPannello)) : '';
    return '  ' + mia + ': ' + (v || ripiego) + ';';
  });
  righe.push('  --sbm-k: ' + (st.scala > 0 ? String(1 / st.scala) : '1') + ';');
  return ':root {\n' + righe.join('\n') + '\n}';
}

/* --sbm-k = 1 / zoom: con la cornice rimpicciolita etichetta, maniglie e
   spessori restano grandi uguali a schermo. */
const CSS_EDITOR = [
  '/* Solo nell\'anteprima dell\'editor: il sito pubblicato non ha niente di questo. */',
  '[data-sb-testo], [data-sb-immagine] { cursor: pointer; }',
  'a[href], button, label, summary, select { cursor: default; }',
  '[contenteditable="true"], [contenteditable="true"] *, [contenteditable="plaintext-only"], [contenteditable="plaintext-only"] * { cursor: text; }',
  'img { -webkit-user-drag: none; }',
  '#sb-motore-sovrapposizione { all: initial; position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 2147483600; display: block; pointer-events: none; overflow: hidden; }',
  '#sb-motore-sovrapposizione .sbm-riq { position: absolute; left: 0; top: 0; display: none; box-sizing: border-box; margin: 0; padding: 0; pointer-events: none; background: none; border: 0; }',
  '#sb-motore-sovrapposizione .sbm-riq--passaggio { outline: calc(1px * var(--sbm-k)) dashed var(--sbm-linea-viva); outline-offset: 0; background: color-mix(in srgb, var(--sbm-linea-viva) 14%, transparent); }',
  '#sb-motore-sovrapposizione .sbm-riq--genitore { outline: calc(1px * var(--sbm-k)) dashed var(--sbm-linea-viva); outline-offset: 0; }',
  '#sb-motore-sovrapposizione .sbm-riq--scelta { outline: calc(2px * var(--sbm-k)) solid var(--sbm-ciano); outline-offset: 0; box-shadow: 0 0 0 calc(3px * var(--sbm-k)) color-mix(in srgb, var(--sbm-fondo) 55%, transparent); }',
  '#sb-motore-sovrapposizione .sbm-etichetta { position: absolute; left: calc(-2px * var(--sbm-k)); bottom: 100%; top: auto; box-sizing: border-box; max-width: calc(340px * var(--sbm-k)); margin: 0 0 calc(2px * var(--sbm-k)); ' +
    'padding: calc(3px * var(--sbm-k)) calc(7px * var(--sbm-k)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ' +
    'font: 500 calc(10.5px * var(--sbm-k))/1.3 var(--sbm-mono); letter-spacing: .1em; text-transform: uppercase; text-align: left; ' +
    'color: var(--sbm-testo); background: var(--sbm-pannello); border: calc(1px * var(--sbm-k)) solid var(--sbm-ciano); border-radius: 0; pointer-events: none; }',
  '#sb-motore-sovrapposizione .sbm-riq--scelta.is-basso .sbm-etichetta { bottom: auto; top: calc(2px * var(--sbm-k)); left: calc(2px * var(--sbm-k)); }',
  '#sb-motore-sovrapposizione .sbm-riq--scelta[data-sposta="1"] .sbm-etichetta { pointer-events: auto; cursor: move; }',
  '#sb-motore-sovrapposizione .sbm-maniglia { --sbm-lato: calc(11px * var(--sbm-k)); --sbm-fuori: calc(-6px * var(--sbm-k)); position: absolute; display: none; box-sizing: border-box; width: var(--sbm-lato); height: var(--sbm-lato); margin: 0; padding: 0; ' +
    'background: var(--sbm-fondo); border: calc(2px * var(--sbm-k)) solid var(--sbm-ciano); border-radius: 0; pointer-events: auto; touch-action: none; }',
  '#sb-motore-sovrapposizione .sbm-riq--scelta[data-sposta="1"] .sbm-maniglia { display: block; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="nw"] { left: var(--sbm-fuori); top: var(--sbm-fuori); cursor: nwse-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="n"] { left: calc(50% - var(--sbm-lato) / 2); top: var(--sbm-fuori); cursor: ns-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="ne"] { right: var(--sbm-fuori); top: var(--sbm-fuori); cursor: nesw-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="e"] { right: var(--sbm-fuori); top: calc(50% - var(--sbm-lato) / 2); cursor: ew-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="se"] { right: var(--sbm-fuori); bottom: var(--sbm-fuori); cursor: nwse-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="s"] { left: calc(50% - var(--sbm-lato) / 2); bottom: var(--sbm-fuori); cursor: ns-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="sw"] { left: var(--sbm-fuori); bottom: var(--sbm-fuori); cursor: nesw-resize; }',
  '#sb-motore-sovrapposizione .sbm-maniglia[data-maniglia="w"] { left: var(--sbm-fuori); top: calc(50% - var(--sbm-lato) / 2); cursor: ew-resize; }'
].join('\n');

const CSS_CONTORNI = [
  '[data-sb-riquadro] { outline: calc(1px * var(--sbm-k)) dashed var(--sbm-linea-viva) !important; outline-offset: calc(-1px * var(--sbm-k)) !important; }',
  '[data-sb-riquadro] [data-sb-blocco] { outline: calc(1px * var(--sbm-k)) dashed color-mix(in srgb, var(--sbm-ciano) 70%, transparent) !important; outline-offset: calc(-2px * var(--sbm-k)) !important; }'
].join('\n');

const CSS_SPOSTA = 'body, body * { cursor: move !important; }';

const CURSORI = { move: 'grabbing', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };

function stileProprio(doc, id, testo, acceso = true) {
  let stile = doc.getElementById(id);
  if (!stile) {
    stile = doc.createElement('style');
    stile.id = id;
    (doc.head || doc.documentElement).append(stile);
  }
  if (stile.textContent !== testo) stile.textContent = testo;
  stile.disabled = !acceso;
  return stile;
}

function scriviStileEditor(doc) {
  stileProprio(doc, ID_STILE_EDITOR, variabiliRegia() + '\n' + CSS_EDITOR, true);
}

function creaSovrapposizione(doc) {
  const vecchia = doc.getElementById(ID_SOVRAPPOSIZIONE);
  if (vecchia) vecchia.remove();
  const div = (classe) => { const d = doc.createElement('div'); d.className = classe; return d; };
  const radice = doc.createElement('div');
  radice.id = ID_SOVRAPPOSIZIONE;
  radice.setAttribute('aria-hidden', 'true');
  const passaggio = div('sbm-riq sbm-riq--passaggio');
  const genitore = div('sbm-riq sbm-riq--genitore');
  const scelta = div('sbm-riq sbm-riq--scelta');
  const etichetta = div('sbm-etichetta');
  etichetta.setAttribute('data-maniglia', 'move');
  scelta.append(etichetta);
  for (const dir of MANIGLIE) {
    const m = div('sbm-maniglia');
    m.setAttribute('data-maniglia', dir);
    scelta.append(m);
  }
  radice.append(genitore, passaggio, scelta);
  // Figlia di <html>, fuori dal <body>: nessun foglio di sezione la tocca e non sposta niente.
  doc.documentElement.append(radice);
  return { radice, passaggio, genitore, scelta, etichetta };
}

function mettiRiquadro(riq, el, forza) {
  if (!el || !el.isConnected) {
    if (riq.style.display !== 'none') { riq.style.display = 'none'; riq._chiave = ''; }
    return null;
  }
  const r = el.getBoundingClientRect();
  // Nascosto in questa vista («nascosto» per dispositivo): niente riquadro né etichetta in alto a sinistra.
  if (!r.width && !r.height && !el.getClientRects().length) {
    if (riq.style.display !== 'none') { riq.style.display = 'none'; riq._chiave = ''; }
    return null;
  }
  const chiave = Math.round(r.left * 2) + ',' + Math.round(r.top * 2) + ',' + Math.round(r.width * 2) + ',' + Math.round(r.height * 2);
  if (!forza && riq._chiave === chiave && riq.style.display === 'block') return r;
  riq._chiave = chiave;
  riq.style.display = 'block';
  riq.style.transform = 'translate(' + r.left + 'px, ' + r.top + 'px)';
  riq.style.width = Math.max(0, r.width) + 'px';
  riq.style.height = Math.max(0, r.height) + 'px';
  return r;
}

function disegnaSovrapposizione(forza) {
  const doc = docVivo();
  const sv = st.sovrapposizione;
  if (!doc || !sv || !sv.radice.isConnected) return;
  let sel = st.selezione;

  // Selezione staccata (un testo riscritto, una pagina nuova): la si ritrova per id.
  if (sel && !sel.el.isConnected) {
    const ritrovato = st.ricordo ? risolviId(st.ricordo.id, st.ricordo.indice) : null;
    if (ritrovato) { st.selezione = sel = ritrovato; avvisaIscritti(ritrovato); }
    else { impostaSelezione(null); return; }
  }

  if (sel) {
    const sposta = sel.puoPosizionare ? '1' : '0';
    if (sv.scelta.getAttribute('data-sposta') !== sposta) sv.scelta.setAttribute('data-sposta', sposta);
    const testo = sel.puoPosizionare ? '✥ ' + sel.etichetta : sel.etichetta;
    if (sv.etichetta.textContent !== testo) sv.etichetta.textContent = testo;
  }
  const r = mettiRiquadro(sv.scelta, sel ? sel.el : null, forza);
  if (r) {
    const k = st.scala > 0 ? 1 / st.scala : 1;
    sv.scelta.classList.toggle('is-basso', r.top < 22 * k);
    // Etichetta leggibile anche quando l'inizio dell'elemento è sopra lo schermo.
    const alto = r.top < 0 ? Math.min(-r.top, Math.max(0, r.height - 20 * k)) + 'px' : '';
    if (sv.etichetta.style.top !== alto) sv.etichetta.style.top = alto;
  }
  const elGenitore = sel && sel.genitore && sel.genitore.el !== sel.el ? sel.genitore.el : null;
  mettiRiquadro(sv.genitore, elGenitore, forza);
  if (st.evidenziatoId && (!st.evidenziatoEl || !st.evidenziatoEl.isConnected)) {
    const m = risolviId(st.evidenziatoId, 0);
    st.evidenziatoEl = m ? m.el : null;
  }
  const sotto = st.evidenziatoEl || (!st.trascina ? st.passaggio : null);
  mettiRiquadro(sv.passaggio, sotto && (!sel || sotto !== sel.el) ? sotto : null, forza);
}

function avviaDisegno(win, generazione) {
  const giro = () => {
    if (generazione !== st.generazione || !docVivo()) return;
    try { disegnaSovrapposizione(false); } catch (e) { registraErrore(e); return; }
    win.requestAnimationFrame(giro);
  };
  win.requestAnimationFrame(giro);
}

function segnaOriginali(el) {
  if (!st.originali || !el) return;
  st.originali.add(el);
  for (const figlio of el.getElementsByTagName('*')) st.originali.add(figlio);
}

/* Un nodo «del sito»: c'era al caricamento, o sta dentro un testo del sito
   (i grassetti nati scrivendo). Quelli aggiunti da altri moduli (una barra
   di CONTENUTI dentro l'iframe) non si selezionano. */
function nodoDelSito(el) {
  if (!el || !st.originali) return false;
  if (st.originali.has(el)) return true;
  const testo = el.closest ? el.closest('[data-sb-testo]') : null;
  return !!(testo && st.originali.has(testo));
}

function sovrapposizioneDi(el) {
  return !!(el && el.closest && el.closest('#' + ID_SOVRAPPOSIZIONE));
}

function bersaglioDiScrittura(el) {
  if (!el) return false;
  if (inScrittura(el)) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function preparaDocumento(doc, win) {
  scriviStileEditor(doc);
  stileProprio(doc, ID_STILE_CONTORNI, CSS_CONTORNI, st.contorni);
  stileProprio(doc, ID_STILE_TRASCINA, '', false);
  stileProprio(doc, ID_STILE_SPOSTA, CSS_SPOSTA, false);

  st.originali = new WeakSet();
  for (const nodo of doc.getElementsByTagName('*')) st.originali.add(nodo);
  st.sovrapposizione = creaSovrapposizione(doc);

  win.addEventListener('click', suClic, true);
  win.addEventListener('auxclick', suClicAusiliario, true);
  win.addEventListener('submit', suInvio, true);
  win.addEventListener('pointerdown', suPremuto, true);
  win.addEventListener('pointermove', suMovimento, true);
  win.addEventListener('pointerup', suRilasciato, true);
  win.addEventListener('pointercancel', suRilasciato, true);
  win.addEventListener('keydown', suTastoIframe, true);
  win.addEventListener('dragstart', suTrascinaNativo, true);
  doc.documentElement.addEventListener('mouseleave', () => { st.passaggio = null; accendiSposta(false); });
}

function suClic(ev) {
  const el = elementoDi(ev.target);
  if (!el || sovrapposizioneDi(el)) return;
  // Nessun link e nessun bottone porta via dall'editor, di chiunque sia il nodo.
  ev.preventDefault();
  if (inScrittura(el)) return;                 // il clic è di CONTENUTI
  if (!nodoDelSito(el)) return;
  if (Date.now() < st.soppressoFino) return;   // era la fine di un trascinamento
  impostaSelezione(metaDaBersaglio(el));
  // Con un blocco scelto le frecce devono arrivare all'iframe.
  if (st.selezione && st.selezione.puoPosizionare && st.ui) {
    try { st.ui.iframe.focus(); } catch { /* il fuoco resta dov'è */ }
  }
}

function suClicAusiliario(ev) {
  const el = elementoDi(ev.target);
  if (el && el.closest && el.closest('a[href]')) ev.preventDefault();
}

function suInvio(ev) { ev.preventDefault(); }

function suTrascinaNativo(ev) {
  if (!inScrittura(elementoDi(ev.target))) ev.preventDefault();
}

function accendiSposta(acceso) {
  const doc = docVivo();
  const stile = doc && doc.getElementById(ID_STILE_SPOSTA);
  if (stile && stile.disabled === !!acceso) stile.disabled = !acceso;
}

/* ============================ 8. TRASCINAMENTO, MANIGLIE, TASTIERA */

/* Pixel -> unità della regola geometrica (§4.3): percentuale della
   larghezza del contenuto del riquadro, dall'angolo del suo padding box. */
function misura(el) {
  const win = st.win;
  const riquadro = el && el.parentElement ? el.parentElement.closest('[data-sb-riquadro]') : null;
  if (!riquadro || !win) return null;
  const cs = win.getComputedStyle(riquadro);
  const cw = riquadro.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  if (!(cw > 0)) return null;
  const rr = riquadro.getBoundingClientRect();
  const rb = el.getBoundingClientRect();
  const ox = rr.left + (parseFloat(cs.borderLeftWidth) || 0);
  const oy = rr.top + (parseFloat(cs.borderTopWidth) || 0);
  return {
    cw,
    riquadro,
    pos: {
      x: arrotonda2((rb.left - ox) / cw * 100),
      y: arrotonda2((rb.top - oy) / cw * 100),
      l: arrotonda2(rb.width / cw * 100),
      a: arrotonda2(rb.height / cw * 100)
    }
  };
}

// Da dove si parte: la posizione salvata, o quella misurata adesso.
function rettangoloDiPartenza(meta) {
  const salvata = posizione(meta.chiave, st.dispositivo);
  if (salvata) return salvata;
  const m = misura(meta.el);
  const r = m ? pulisciRettangolo(m.pos) : null;
  if (r) { r.l = Math.max(MISURA_MIN, r.l); r.a = Math.max(MISURA_MIN, r.a); }
  return r;
}

function spostabile(meta) { return !!(meta && meta.tipo === 'blocco' && meta.puoPosizionare); }

function suPremuto(ev) {
  if (!docVivo() || (ev.button !== undefined && ev.button !== 0)) return;
  const el = elementoDi(ev.target);
  if (!el) return;
  const sel = st.selezione;

  const maniglia = el.closest ? el.closest('#' + ID_SOVRAPPOSIZIONE + ' [data-maniglia]') : null;
  if (maniglia) {
    if (!spostabile(sel)) return;
    ev.preventDefault();
    ev.stopPropagation();
    iniziaTrascina(maniglia.getAttribute('data-maniglia'), ev.clientX, ev.clientY, ev.pointerId, maniglia);
    return;
  }
  if (sovrapposizioneDi(el) || inScrittura(el) || !nodoDelSito(el)) return;
  if (spostabile(sel) && sel.el.contains(el)) {
    ev.preventDefault();   // niente selezione del testo: qui si trascina
    st.inAttesa = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
  }
}

function suMovimento(ev) {
  if (!docVivo()) return;
  if (st.trascina) {
    if (ev.pointerId === st.trascina.pointerId) { ev.preventDefault(); muoviTrascina(ev); }
    return;
  }
  if (st.inAttesa && ev.pointerId === st.inAttesa.pointerId) {
    const p = st.inAttesa;
    // Quattro pixel di tolleranza: un clic un po' mosso resta un clic.
    if (Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) > 4 && spostabile(st.selezione)) {
      st.inAttesa = null;
      iniziaTrascina('move', p.x, p.y, p.pointerId, st.selezione.el);
      if (st.trascina) muoviTrascina(ev);
    }
    return;
  }
  if (ev.buttons) return;
  const el = elementoDi(ev.target);
  if (!el || sovrapposizioneDi(el) || !nodoDelSito(el) || inScrittura(el)) {
    st.passaggio = null;
    accendiSposta(false);
    return;
  }
  const marcato = el.closest(SELETTORE_MARCATORI);
  st.passaggio = marcato;
  const sel = st.selezione;
  accendiSposta(!!(spostabile(sel) && sel.el.contains(el) && (!marcato || marcato === sel.el)));
}

function suRilasciato(ev) {
  if (st.trascina && ev.pointerId === st.trascina.pointerId) {
    const mosso = st.trascina.mosso;
    fineTrascina(ev.type === 'pointercancel');
    if (mosso) st.soppressoFino = Date.now() + 400;
  }
  st.inAttesa = null;
}

function iniziaTrascina(tipo, clientX, clientY, pointerId, catturante) {
  const sel = st.selezione;
  const win = st.win;
  const doc = docVivo();
  if (!spostabile(sel) || !doc || !win) return;
  const m = misura(sel.el);
  const partenza = rettangoloDiPartenza(sel);
  if (!m || !partenza) {
    avvisa('Non riesco a misurare questo blocco adesso: forse in questa vista è nascosto.');
    return;
  }
  const riquadro = sel.riquadro;
  // Primo blocco del riquadro che esce dal flusso: i fratelli si misurano adesso, prima che risalgano.
  const fratelli = riquadroHaPosizioni(riquadro, st.dispositivo) ? [] : misuraFratelli(riquadro, sel.chiave);
  const rr = m.riquadro.getBoundingClientRect();
  st.trascina = {
    id: sel.chiave,
    riquadro,
    fratelli,
    tipo,
    sx: clientX + win.scrollX,
    sy: clientY + win.scrollY,
    elRiquadro: m.riquadro,
    rx: rr.left + win.scrollX,
    ry: rr.top + win.scrollY,
    cw: m.cw,
    partenza,
    attuale: partenza,
    mosso: false,
    pointerId,
    catturante
  };
  try { catturante.setPointerCapture(pointerId); } catch { /* senza cattura si segue lo stesso finché il puntatore resta nell'iframe */ }
  stileProprio(doc, ID_STILE_TRASCINA, 'html, html * { cursor: ' + (CURSORI[tipo] || 'grabbing') + ' !important; -webkit-user-select: none !important; user-select: none !important; }', true);
  st.passaggio = null;
}

function muoviTrascina(ev) {
  const t = st.trascina;
  const win = st.win;
  if (!t || !win) return;
  /* Il riquadro può spostarsi mentre si trascina (la sua altezza cambia con
     aspect-ratio e la sezione lo ricentra): il suo spostamento si toglie,
     così il blocco resta sotto il puntatore. */
  const rr = t.elRiquadro.isConnected ? t.elRiquadro.getBoundingClientRect() : null;
  const scartoX = rr ? rr.left + win.scrollX - t.rx : 0;
  const scartoY = rr ? rr.top + win.scrollY - t.ry : 0;
  const dx = (ev.clientX + win.scrollX - t.sx - scartoX) / t.cw * 100;
  const dy = (ev.clientY + win.scrollY - t.sy - scartoY) / t.cw * 100;
  const aggancia = st.griglia && !ev.shiftKey;
  const g = (v) => (aggancia ? Math.round(v) : v);
  const s = t.partenza;
  let L = s.x;
  let T = s.y;
  let R = s.x + s.l;
  let B = s.y + s.a;

  if (t.tipo === 'move') {
    /* Un blocco largo quanto il contenuto parte già con x + l oltre 100: x si
       misura dal bordo del riempimento, l sulla larghezza del contenuto. Il
       tetto è quindi almeno la x di partenza, altrimenti al primo movimento,
       anche solo in verticale, salterebbe a sinistra dentro il riempimento. */
    L = stringi(g(s.x + dx), 0, Math.max(0, X_MAX - s.l, s.x));
    T = stringi(g(s.y + dy), 0, Math.max(0, Y_MAX - s.a));
    R = L + s.l;
    B = T + s.a;
  } else {
    if (t.tipo.indexOf('w') !== -1) L = stringi(g(s.x + dx), 0, R - MISURA_MIN);
    if (t.tipo.indexOf('e') !== -1) R = stringi(g(s.x + s.l + dx), L + MISURA_MIN, X_MAX);
    if (t.tipo.indexOf('n') !== -1) T = stringi(g(s.y + dy), 0, B - MISURA_MIN);
    if (t.tipo.indexOf('s') !== -1) B = stringi(g(s.y + s.a + dy), T + MISURA_MIN, Y_MAX);
  }

  const p = pulisciRettangolo({ x: L, y: T, l: R - L, a: B - T });
  if (!p) return;
  if (!t.mosso && stessoRettangolo(p, t.partenza) && t.tipo !== 'move') return;
  t.mosso = true;
  t.attuale = p;
  const voci = new Map();
  for (const f of t.fratelli) voci.set(f.id, f.pos);
  voci.set(t.id, p);
  st.vivo = { dispositivo: st.dispositivo, riquadro: t.riquadro, voci };
  programmaDisposizione();
  sincronizzaCampiPosizione(p);
}

function fineTrascina(annulla) {
  const t = st.trascina;
  if (!t) return;
  st.trascina = null;
  st.vivo = null;
  try { if (t.catturante && t.catturante.releasePointerCapture) t.catturante.releasePointerCapture(t.pointerId); } catch { /* già rilasciata */ }
  const doc = docVivo();
  if (doc) stileProprio(doc, ID_STILE_TRASCINA, '', false);
  if (!annulla && t.mosso) {
    const d = st.dispositivo;
    fissati(d, t.riquadro).delete(t.id);
    if (t.fratelli.length) ricordaFissati(d, t.riquadro, t.fratelli);
    scriviPosizioni(t.riquadro, [{ id: t.id, pos: t.attuale }].concat(t.fratelli), d);
    annuncia('Blocco spostato: da sinistra ' + numeroCss(t.attuale.x) + ', dall\'alto ' + numeroCss(t.attuale.y) +
      ', larghezza ' + numeroCss(t.attuale.l) + ', altezza ' + numeroCss(t.attuale.a) + '.');
  } else {
    applicaDisposizione();
    aggiornaPannelloPosizioni();
  }
}

function spingi(dx, dy, dl, da) {
  const sel = st.selezione;
  if (!spostabile(sel)) return;
  const cur = rettangoloDiPartenza(sel);
  if (!cur) {
    avvisa('Non riesco a misurare questo blocco adesso: forse in questa vista è nascosto.');
    return;
  }
  const l = stringi(cur.l + dl, MISURA_MIN, X_MAX);
  const a = stringi(cur.a + da, MISURA_MIN, Y_MAX);
  const p = {
    // Stesso tetto del trascinamento: una freccia in verticale non sposta di lato.
    x: stringi(cur.x + dx, 0, Math.max(0, X_MAX - l, cur.x)),
    y: stringi(cur.y + dy, 0, Math.max(0, Y_MAX - a)),
    l,
    a
  };
  impostaPosizione(sel.chiave, p);
  annuncia('Posizione: da sinistra ' + numeroCss(p.x) + ', dall\'alto ' + numeroCss(p.y) + ', larghezza ' + numeroCss(p.l) + ', altezza ' + numeroCss(p.a) + '.');
}

/* Tasti del motore, dentro l'iframe o sul telaio. Torna vero se il tasto è stato usato. */
function gestisciTasto(ev) {
  if (ev.key === 'Escape' || ev.key === 'Esc') {
    if (st.trascina) { ev.preventDefault(); fineTrascina(true); return true; }
    if (!st.selezione) return false;
    ev.preventDefault();
    saliAlGenitore();
    return true;
  }
  const v = FRECCE[ev.key];
  if (!v || !spostabile(st.selezione) || ev.ctrlKey || ev.metaKey || st.trascina) return false;
  ev.preventDefault();
  const passo = ev.shiftKey ? 5 : 1;
  if (ev.altKey) spingi(0, 0, v[0] * passo, v[1] * passo);
  else spingi(v[0] * passo, v[1] * passo, 0, 0);
  return true;
}

function suTastoIframe(ev) {
  const el = elementoDi(ev.target);
  // Dentro un testo in scrittura i tasti sono di CONTENUTI (annulla nativo, Ctrl+S suo).
  if (el && inScrittura(el)) return;
  const conComando = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
  if (conComando && /^[szyk]$/i.test(ev.key || '')) {
    if (bersaglioDiScrittura(el) && !/^s$/i.test(ev.key)) return;
    // Le scorciatoie del pannello valgono anche con il fuoco nell'anteprima.
    ev.preventDefault();
    rilancia(ev);
    return;
  }
  if (bersaglioDiScrittura(el)) return;
  if (gestisciTasto(ev)) ev.stopPropagation();
}

/* Ripete la scorciatoia sul documento del pannello, dove la ascoltano
   pannello.js e il guscio. */
function rilancia(ev) {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ev.key, code: ev.code, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey,
      shiftKey: ev.shiftKey, altKey: ev.altKey, bubbles: true, cancelable: true
    }));
  } catch (e) { registraErrore(e); }
}

/* ======================= 9. ANTEPRIMA: MONTAGGIO, ZOOM, CARICAMENTO */

function impostaStile(el, proprieta, valore) {
  if (el && el.style[proprieta] !== valore) el.style[proprieta] = valore;
}

/* Cornice del dispositivo con zoom automatico. L'iframe resta largo quanto
   il dispositivo (Computer almeno 1100, Tablet 900, Telefono 375), così
   dentro valgono le media query del sito vero; se lo spazio non basta la
   cornice si rimpicciolisce con transform: scale() dentro .motore__zoom,
   grande quanto il risultato a schermo, e l'iframe diventa più alto in
   proporzione: lo scorrimento dentro l'anteprima copre tutta la pagina. */
function dimensiona() {
  const ui = st.ui;
  if (!montato()) return;
  const cs = getComputedStyle(ui.telaio);
  const largo = Math.floor(ui.telaio.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  const alto = Math.floor(ui.telaio.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0));
  const larghezze = vocabolario().larghezze;
  const w = st.dispositivo === 'computer' ? Math.max(larghezze.computer, largo) : larghezze[st.dispositivo];

  const adatta = largo > 0 && w > largo ? Math.max(ZOOM_MIN, largo / w) : 1;
  const scala = st.zoomModo === 'reale' ? 1 : adatta;
  const cambiata = Math.abs(scala - st.scala) > 0.0001;
  st.scalaAdatta = adatta;
  st.scala = scala;

  impostaStile(ui.zoom, 'width', (scala === 1 ? w : Math.round(w * scala)) + 'px');
  impostaStile(ui.cornice, 'width', w + 'px');
  if (alto > 0) {
    impostaStile(ui.zoom, 'height', alto + 'px');
    impostaStile(ui.cornice, 'height', (scala === 1 ? alto : Math.round(alto / scala * 100) / 100) + 'px');
  } else {
    impostaStile(ui.zoom, 'height', '100%');
    impostaStile(ui.cornice, 'height', scala === 1 ? '100%' : (100 / scala) + '%');
  }
  impostaStile(ui.cornice, 'transform', scala === 1 ? '' : 'scale(' + scala + ')');
  ui.radice.setAttribute('data-dispositivo', st.dispositivo);
  ui.radice.setAttribute('data-zoom', scala === 1 ? 'reale' : 'adatta');
  disegnaBarraZoom();

  if (cambiata) {
    const doc = docVivo();
    if (doc) { scriviStileEditor(doc); disegnaSovrapposizione(true); }
  }
}

/* L'indicatore compare solo quando l'anteprima a grandezza reale non ci
   starebbe: «100%» la mostra vera (si scorre di lato), «Adatta» la
   rimpicciolisce di nuovo. */
function disegnaBarraZoom() {
  const ui = st.ui;
  if (!ui || !ui.barraZoom) return;
  const serve = st.scalaAdatta < 0.999;
  ui.barraZoom.hidden = !serve;
  if (!serve) return;
  const reale = st.zoomModo === 'reale';
  const pct = Math.round(st.scala * 100) + '%';
  if (ui.valoreZoom.textContent !== pct) ui.valoreZoom.textContent = pct;
  const testo = reale ? 'Adatta' : '100%';
  if (ui.bottoneZoom.textContent !== testo) ui.bottoneZoom.textContent = testo;
  ui.bottoneZoom.setAttribute('aria-pressed', reale ? 'true' : 'false');
  ui.bottoneZoom.title = reale
    ? 'Rimpicciolisci l\'anteprima (' + Math.round(st.scalaAdatta * 100) + '%) così sta tutta nello spazio'
    : 'Mostra l\'anteprima a grandezza reale: poi si scorre di lato';
  ui.barraZoom.setAttribute('aria-label', 'Zoom dell\'anteprima: ' + pct);
}

function impostaZoom(modo) {
  const prossimo = modo === 'reale' ? 'reale' : 'adatta';
  if (st.zoomModo === prossimo) return false;
  st.zoomModo = prossimo;
  if (montato()) {
    dimensiona();
    if (prossimo === 'adatta') st.ui.telaio.scrollLeft = 0;
    annuncia(prossimo === 'reale'
      ? 'Anteprima a grandezza reale: scorri di lato per vederla tutta.'
      : 'Anteprima rimpicciolita al ' + Math.round(st.scala * 100) + ' per cento per stare nello spazio.');
  }
  return true;
}

function impostaDispositivo(d) {
  if (DISPOSITIVI.indexOf(d) === -1) return false;
  if (st.trascina) fineTrascina(true);
  const cambiato = st.dispositivo !== d;
  st.dispositivo = d;
  if (cambiato) st.zoomModo = 'adatta';   // ogni dispositivo riparte adattato allo spazio
  if (montato()) dimensiona();
  if (cambiato) {
    aggiornaPannelloPosizioni();
    annuncia('Stai lavorando sulla vista ' + NOMI_DISPOSITIVI[d] + '.');
    emetti('sb:dispositivo', { dispositivo: d });
  }
  return true;
}

function mostraVelo(tipo, titolo = '', testo = '') {
  const ui = st.ui;
  if (!ui) return;
  svuota(ui.velo);
  if (!tipo) { ui.velo.hidden = true; ui.velo.removeAttribute('data-tipo'); return; }
  ui.velo.hidden = false;
  ui.velo.setAttribute('data-tipo', tipo);
  const riquadro = crea('div', { classe: 'motore__velo-riquadro' }, [
    crea('p', { classe: 'motore__velo-titolo', testo: titolo }),
    testo ? crea('p', { classe: 'motore__velo-testo', testo }) : null
  ]);
  if (tipo === 'errore') {
    riquadro.append(crea('button', {
      type: 'button', classe: 'btn btn--primario',
      su: { click: () => ricarica({ tieniScorrimento: false }) }
    }, 'Riprova'));
  }
  ui.velo.append(riquadro);
}

function mostraAvviso(testo) {
  const ui = st.ui;
  if (!ui) return;
  ui.avviso.textContent = testo || '';
  ui.avviso.hidden = !testo;
}

function risolviPrimo(doc) {
  if (st.primo && !st.primo.fatto) { st.primo.fatto = true; st.primo.risolvi(doc); }
}

function risolviAttese(doc) {
  const attese = st.attesaPronti.splice(0);
  for (const fn of attese) { try { fn(doc); } catch (e) { registraErrore(e); } }
}

function clona(valore) {
  if (valore === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(valore);
  return JSON.parse(JSON.stringify(valore));
}

function comeHtml(risposta) {
  if (typeof risposta === 'string') return risposta;
  if (oggetto(risposta)) {
    const html = risposta.html ?? risposta.anteprima ?? risposta.pagina;
    if (typeof html === 'string') return html;
  }
  throw new Error('Il server ha risposto all\'anteprima senza una pagina.');
}

async function chiediAnteprima(inviati) {
  const api = ponte.api;
  if (api && typeof api.anteprima === 'function') return comeHtml(await api.anteprima({ contenuti: inviati, editor: true }));
  if (api && typeof api.anteprimaViva === 'function') return comeHtml(await api.anteprimaViva(inviati));
  throw Object.assign(new Error('Il pannello non sa chiedere l\'anteprima al server.'), { stato: 501 });
}

/* Ripiego: la bozza salvata (GET /api/anteprima), letta come testo e
   scritta con la stessa pulizia. Caricarla con src farebbe partire gli
   script del sito. */
async function chiediBozzaSalvata() {
  let risposta;
  try {
    risposta = await fetch('/api/anteprima?t=' + Date.now(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' } });
  } catch {
    throw new Error('Non riesco a contattare il server. Controlla che sia acceso: node server/server.js');
  }
  if (!risposta.ok) throw Object.assign(new Error('Il server non ha dato nemmeno la bozza salvata (' + risposta.status + ').'), { stato: risposta.status });
  return risposta.text();
}

/* Via ogni <script> eseguibile (resta il JSON-LD), <base href="/"> in testa.
   Si passa da DOMParser e non da un'espressione regolare: nei commenti del
   modello la parola «<script>» compare davvero, e un taglio sbagliato
   lascerebbe un commento aperto su mezza pagina. */
function preparaHtml(html) {
  const inerte = new DOMParser().parseFromString(String(html || ''), 'text/html');
  for (const script of Array.from(inerte.querySelectorAll('script'))) {
    const tipo = (script.getAttribute('type') || '').trim().toLowerCase();
    if (tipo !== 'application/ld+json') script.remove();
  }
  // Attributi on…: il modello non ne ha, ma un server rimasto indietro non deve poterli far valere.
  for (const nodo of inerte.querySelectorAll('*')) {
    for (const attributo of Array.from(nodo.attributes)) {
      if (/^on/i.test(attributo.name)) nodo.removeAttribute(attributo.name);
    }
  }
  const testa = inerte.head || inerte.documentElement;
  let base = inerte.querySelector('base');
  if (!base) {
    base = inerte.createElement('base');
    base.setAttribute('href', '/');
  }
  // Primo figlio di <head>: tutto quello che viene dopo si risolve dalla radice del sito.
  if (testa.firstChild !== base) testa.insertBefore(base, testa.firstChild);
  const doctype = inerte.doctype ? '<!doctype html>\n' : '';
  return doctype + inerte.documentElement.outerHTML;
}

async function ricarica({ tieniScorrimento = false } = {}) {
  if (!montato()) return null;
  const numero = ++st.richiesta;
  clearTimeout(st.timerRicaricaFont);
  const doc = docVivo();
  const scorrimento = tieniScorrimento && doc && st.win ? { x: st.win.scrollX, y: st.win.scrollY } : null;

  const dati = ponte.stato && ponte.stato.dati;
  if (!dati) {
    // Contenuti non ancora caricati: si aspetta sb:pronto invece di mostrare una pagina vuota.
    mostraVelo('carico', 'Carico l\'anteprima del sito…');
    return new Promise((risolvi) => {
      document.addEventListener('sb:pronto', () => {
        if (numero !== st.richiesta) { risolvi(null); return; }
        risolvi(ricarica({ tieniScorrimento }));
      }, { once: true });
    });
  }

  if (scorrimento) mostraVelo('aggiorno', 'Aggiorno l\'anteprima…');
  else mostraVelo('carico', 'Carico l\'anteprima del sito…');

  const inviati = { testi: clona(dati.testi), config: clona(dati.config) };
  let html = null;
  let ripiego = false;
  let errore = null;
  try {
    html = await chiediAnteprima(inviati);
  } catch (e) {
    errore = e;
    if (numero === st.richiesta && rottaAssente(e)) {
      try { html = await chiediBozzaSalvata(); ripiego = true; errore = null; } catch (e2) { errore = e2; }
    }
  }
  if (numero !== st.richiesta || !montato()) return null;
  if (html === null) {
    const scaduta = errore && errore.scaduta;
    mostraVelo('errore', 'L\'anteprima non si è caricata.',
      scaduta ? 'La sessione è scaduta: entra di nuovo e l\'anteprima torna da sola.'
        : ((errore && errore.message) || 'Il server non ha risposto.'));
    risolviPrimo(null);
    return null;
  }
  return scriviPagina(html, { scorrimento, inviati, ripiego, numero });
}

function scriviPagina(html, { scorrimento, inviati, ripiego, numero }) {
  const ui = st.ui;
  let doc = null;
  try { doc = ui.iframe.contentDocument; } catch { doc = null; }
  if (!doc) {
    mostraVelo('errore', 'L\'anteprima non si è caricata.', 'Il riquadro dell\'anteprima non è raggiungibile.');
    risolviPrimo(null);
    return Promise.resolve(null);
  }
  if (st.trascina) fineTrascina(true);
  st.inAttesa = null;
  st.passaggio = null;
  st.evidenziatoEl = null;
  st.generazione += 1;
  const generazione = st.generazione;
  st.pronto = false;
  st.doc = null;
  st.win = null;
  st.sovrapposizione = null;

  let pulito;
  try { pulito = preparaHtml(html); } catch (e) {
    registraErrore(e);
    mostraVelo('errore', 'L\'anteprima non si è caricata.', 'La pagina arrivata dal server non si legge.');
    risolviPrimo(null);
    return Promise.resolve(null);
  }
  doc.open();
  doc.write(pulito);
  doc.close();

  st.inviati = inviati;
  st.ripiego = ripiego;
  st.famiglieDisegnate = famiglieUsate(inviati.config);
  mostraAvviso(ripiego
    ? 'Questo server non sa ancora rendere le modifiche in corso: vedi la bozza salvata. Riavvia il server per l\'anteprima dal vivo.'
    : '');

  return new Promise((risolvi) => {
    const inizio = Date.now();
    const giro = () => {
      if (generazione !== st.generazione || numero !== st.richiesta || !montato()) { risolvi(null); return; }
      if (doc.readyState !== 'loading' && doc.body) { risolvi(paginaScritta(doc, generazione, scorrimento, inviati)); return; }
      if (Date.now() - inizio > TEMPO_MAX_CARICAMENTO) {
        mostraVelo('errore', 'L\'anteprima non si carica.', 'La pagina ci sta mettendo troppo. Controlla che il server sia acceso e riprova.');
        risolviPrimo(null);
        risolvi(null);
        return;
      }
      setTimeout(giro, 30);
    };
    giro();
  });
}

function paginaScritta(doc, generazione, scorrimento, inviati) {
  const ui = st.ui;
  const win = ui.iframe.contentWindow;
  if (!doc.querySelector('[data-sb-sezione], main, section')) {
    mostraVelo('errore', 'Non trovo la pagina del sito.', 'Il server ha risposto, ma non con la pagina. Controlla il terminale dove gira e riprova.');
    risolviPrimo(null);
    return null;
  }
  st.doc = doc;
  st.win = win;
  st.pronto = true;
  try { preparaDocumento(doc, win); } catch (e) { registraErrore(e); }
  // Il tema dell'ultima risposta subito, così la pagina non lampeggia con i colori pubblicati.
  try { if (st.tema.css && st.tema.firma === firmaTema(leggi('config.tema'))) scriviTema(doc, st.tema.css); } catch (e) { registraErrore(e); }
  try { applicaDisposizione(); } catch (e) { registraErrore(e); }
  try { applicaStili(); } catch (e) { registraErrore(e); }
  try { applicaTesti(filtroCambiati(inviati)); } catch (e) { registraErrore(e); }
  applicaTema();
  // La selezione si ritrova subito, prima dei fogli: così il giro di disegno non la ritrova una seconda volta.
  ripristinaSelezione();
  avviaDisegno(win, generazione);

  // L'evento e la Promise aspettano i fogli: chi legge getComputedStyle deve trovare il sito.
  return new Promise((risolvi) => {
    const inizio = Date.now();
    const giro = () => {
      if (generazione !== st.generazione || !docVivo()) { risolvi(null); return; }
      if (doc.readyState !== 'complete' && Date.now() - inizio < 5000) { setTimeout(giro, 40); return; }
      mostraVelo(null);
      if (scorrimento) rimettiScorrimento(win, generazione, scorrimento);
      else if (st.selezione && st.selezione.el.isConnected) scorriAElemento(st.selezione.el, 'mostra');
      risolviPrimo(doc);
      aggiornaPannelloPosizioni();
      risolviAttese(doc);
      emetti('sb:anteprima-pronta', {});
      risolvi(doc);
    };
    giro();
  });
}

/* Subito non basta: immagini e font allungano la pagina dopo il primo disegno. */
function rimettiScorrimento(win, generazione, pos) {
  const vai = () => {
    if (generazione !== st.generazione || !docVivo()) return;
    try { win.scrollTo({ top: pos.y, left: pos.x, behavior: 'instant' }); } catch { win.scrollTo(pos.x, pos.y); }
  };
  vai();
  setTimeout(vai, 120);
  setTimeout(vai, 600);
}

function ripristinaSelezione() {
  const r = st.ricordo;
  if (!r) {
    if (st.selezione) { st.selezione = null; avvisaIscritti(null); }
    return;
  }
  const meta = risolviId(r.id, r.indice);
  if (!meta) {
    st.ricordo = null;
    if (st.selezione) { st.selezione = null; disegnaSovrapposizione(true); avvisaIscritti(null); }
    return;
  }
  impostaSelezione(meta, { forza: true, tieniRicordo: true });
}

function costruisciAnteprima(contenitore) {
  const ui = {};
  ui.iframe = crea('iframe', { classe: 'motore__iframe', title: 'Anteprima modificabile del sito' });
  ui.cornice = crea('div', { classe: 'motore__cornice' }, [ui.iframe]);
  // Grande quanto la cornice A SCHERMO, dopo lo zoom: è lui che occupa spazio.
  ui.zoom = crea('div', { classe: 'motore__zoom' }, [ui.cornice]);
  ui.telaio = crea('div', {
    classe: 'motore__telaio', tabindex: '0',
    'aria-label': 'Anteprima del sito. Clicca un elemento per sceglierlo; Esc passa al contenitore, le frecce spostano il blocco scelto.'
  }, [ui.zoom]);
  ui.telaio.addEventListener('click', (ev) => {
    if (ev.target === ui.telaio || ev.target === ui.zoom) seleziona(null);   // clic fuori dalla pagina
  });
  ui.telaio.addEventListener('keydown', (ev) => { if (ev.target === ui.telaio) gestisciTasto(ev); });

  ui.velo = crea('div', { classe: 'motore__velo', hidden: true, role: 'status', 'aria-live': 'polite' });
  ui.avviso = crea('p', { classe: 'motore__avviso', hidden: true, role: 'status' });
  ui.valoreZoom = crea('span', { classe: 'motore__zoom-valore', 'aria-hidden': 'true' });
  ui.bottoneZoom = crea('button', {
    type: 'button', classe: 'motore__zoom-bottone', 'aria-pressed': 'false',
    su: { click: () => impostaZoom(st.zoomModo === 'reale' ? 'adatta' : 'reale') }
  }, '100%');
  ui.barraZoom = crea('div', { classe: 'motore__zoombar', role: 'group', hidden: true }, [
    crea('span', { classe: 'motore__zoom-etichetta', 'aria-hidden': 'true', testo: 'Zoom' }),
    ui.valoreZoom,
    ui.bottoneZoom
  ]);
  ui.annuncio = crea('p', { classe: 'sr-only', role: 'status', 'aria-live': 'polite' });
  ui.radice = crea('div', { classe: 'motore', 'data-dispositivo': st.dispositivo }, [ui.avviso, ui.telaio, ui.velo, ui.barraZoom, ui.annuncio]);
  contenitore.append(ui.radice);
  return ui;
}

function monta(contenitore, { dispositivo } = {}) {
  if (!contenitore || typeof contenitore.appendChild !== 'function') return Promise.resolve(null);
  if (DISPOSITIVI.indexOf(dispositivo) !== -1) st.dispositivo = dispositivo;

  if (st.trascina) { st.trascina = null; st.vivo = null; }
  if (st.osservatore) { try { st.osservatore.disconnect(); } catch { /* già staccato */ } st.osservatore = null; }
  if (st.ui && st.ui.radice && st.ui.radice.parentNode) st.ui.radice.remove();
  st.generazione += 1;
  st.pronto = false;
  st.doc = null;
  st.win = null;
  st.sovrapposizione = null;
  if (st.selezione) {
    // La selezione stava nell'iframe di prima: si ritrova dopo il caricamento.
    st.selezione = null;
    avvisaIscritti(null);
  }
  risolviPrimo(null);

  const promessa = new Promise((risolvi) => { st.primo = { risolvi, fatto: false }; });
  st.ui = costruisciAnteprima(contenitore);
  if (window.ResizeObserver) {
    st.osservatore = new ResizeObserver(() => dimensiona());
    st.osservatore.observe(st.ui.telaio);
  }
  dimensiona();
  // Un giro di respiro: le misure del contenitore sono quelle vere solo dopo l'inserimento.
  setTimeout(() => { dimensiona(); ricarica({ tieniScorrimento: false }); }, 0);
  return promessa;
}

window.addEventListener('resize', () => { if (montato()) dimensiona(); });

/* Dopo Annulla/Ripeti o un ripristino i blocchi fissati in automatico non
   corrispondono più ai dati: si dimenticano. La ricarica la chiede GUSCIO. */
document.addEventListener('sb:sostituito', () => { st.fissatiAuto.clear(); });

/* ======================================= 10. ISPETTORI E POSIZIONI */

function registraIspettore(fn, { scheda = 'contenuto', ordine = 100, quando = null } = {}) {
  if (typeof fn !== 'function') return false;
  if (st.ispettori.some((i) => i.fn === fn)) return false;
  const voce = {
    fn,
    scheda: SCHEDE.indexOf(scheda) !== -1 ? scheda : 'contenuto',
    ordine: typeof ordine === 'number' && isFinite(ordine) ? ordine : 100,
    quando: typeof quando === 'function' ? quando : null,
    seq: st.ispettori.length
  };
  st.ispettori.push(voce);
  emetti('sb:ispettori', { scheda: voce.scheda });
  return true;
}

function ispettoriPer(scheda, meta) {
  return st.ispettori.filter((i) => {
    if (i.scheda !== scheda) return false;
    if (!i.quando) return true;
    try { return !!i.quando(meta); } catch (e) { registraErrore(e); return false; }
  }).sort((a, b) => (a.ordine - b.ordine) || (a.seq - b.seq));
}

// Riquadri già creati per ogni contenitore: { scheda, riquadri: [{ fn, riquadro }] }.
const riquadriIspettori = new WeakMap();

/* Disegna nel contenitore gli ispettori della scheda validi per `meta`,
   ognuno nel SUO riquadro. I riquadri si riusano da un disegno all'altro e
   non si svuotano: un ispettore che tiene da parte il proprio nodo non fa
   perdere il fuoco al campo in cui si sta scrivendo. */
function disegnaIspettori(scheda, contenitore, meta) {
  if (!contenitore || typeof contenitore.appendChild !== 'function') return 0;
  const m = meta === undefined ? st.selezione : meta;
  const elenco = ispettoriPer(scheda, m);
  let mappa = riquadriIspettori.get(contenitore);
  if (!mappa || mappa.scheda !== scheda) {
    svuota(contenitore);
    mappa = { scheda, riquadri: [] };
    riquadriIspettori.set(contenitore, mappa);
  }
  const tenuti = [];
  elenco.forEach((ispettore, i) => {
    const vecchio = mappa.riquadri.find((r) => r.fn === ispettore.fn && r.riquadro.parentNode === contenitore);
    const riquadro = vecchio ? vecchio.riquadro : crea('div', { classe: 'motore-slot', 'data-scheda': scheda });
    const al = contenitore.children[i] || null;
    if (al !== riquadro) contenitore.insertBefore(riquadro, al);
    tenuti.push({ fn: ispettore.fn, riquadro });
    const erroreVecchio = Array.from(riquadro.children).find((c) => c.classList.contains('motore-slot__errore'));
    if (erroreVecchio) erroreVecchio.remove();
    try {
      ispettore.fn(riquadro, m);
    } catch (e) {
      registraErrore(e);
      riquadro.append(crea('p', { classe: 'motore-slot__errore', role: 'status', testo: 'Una parte dei controlli non si è aperta. Il resto dell\'editor funziona.' }));
    }
  });
  for (const figlio of Array.from(contenitore.children)) {
    if (!tenuti.some((r) => r.riquadro === figlio)) figlio.remove();
  }
  mappa.riquadri = tenuti;
  return elenco.length;
}

/* --- ispettore delle posizioni (scheda Avanzate) -------------------- */

let pannelloPosizioni = null;
let sequenzaCampi = 0;

function metaDelPannello() {
  const p = pannelloPosizioni;
  if (!p || !p.radice.isConnected) return null;
  const sel = st.selezione;
  return spostabile(sel) && sel.id === p.meta.id ? sel : null;
}

function campoPosizione(chiave, etichetta, massimo) {
  sequenzaCampi += 1;
  const id = 'motore-pos-' + chiave + '-' + sequenzaCampi;
  const input = crea('input', {
    id, classe: 'campo__input motore-pos__input', type: 'number', min: '0', max: String(massimo),
    step: 'any', inputmode: 'decimal', autocomplete: 'off'
  });
  input.addEventListener('change', confermaCampi);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); confermaCampi(); } });
  return {
    input,
    nodo: crea('div', { classe: 'motore-pos__campo' }, [crea('label', { classe: 'motore-pos__etichetta', for: id, testo: etichetta }), input])
  };
}

function confermaCampi() {
  const sel = metaDelPannello();
  if (!sel) return;
  const cur = rettangoloDiPartenza(sel) || { x: 0, y: 0, l: 50, a: 20 };
  const p = {};
  for (const k of ['x', 'y', 'l', 'a']) {
    const v = parseFloat(String(pannelloPosizioni.campi[k].input.value).replace(',', '.'));
    p[k] = isFinite(v) ? v : cur[k];
  }
  p.l = Math.max(MISURA_MIN, p.l);
  p.a = Math.max(MISURA_MIN, p.a);
  impostaPosizione(sel.chiave, p);
}

function sincronizzaCampiPosizione(rettangolo) {
  const sel = metaDelPannello();
  if (!sel) return;
  let r = rettangolo || posizione(sel.chiave, st.dispositivo);
  if (!r && docVivo()) { const m = misura(sel.el); r = m ? pulisciRettangolo(m.pos) : null; }
  for (const k of ['x', 'y', 'l', 'a']) {
    const input = pannelloPosizioni.campi[k].input;
    if (document.activeElement === input) continue;
    const v = r ? numeroCss(r[k]) : '';
    if (input.value !== v) input.value = v;
  }
}

function aggiornaPannelloPosizioni() {
  const sel = metaDelPannello();
  if (!sel) return;
  const p = pannelloPosizioni;
  const d = st.dispositivo;
  const salvata = posizione(sel.chiave, d);
  p.vista.textContent = 'Posizione · ' + NOMI_DISPOSITIVI[d];
  p.stato.textContent = salvata
    ? 'Posizione libera su ' + NOMI_DISPOSITIVI[d] + '.'
    : 'Posizione automatica: su ' + NOMI_DISPOSITIVI[d] + ' il blocco segue l\'impaginazione del sito.';
  p.stato.setAttribute('data-stato', salvata ? 'libera' : 'automatica');
  p.riporta.disabled = !salvata;
  const blocchi = blocchiDelRiquadro(sel.riquadro);
  const messi = blocchi.filter((b) => !!posizione(b.id, d)).length;
  p.riportaTutti.disabled = messi === 0;
  p.fissaTutti.disabled = blocchi.length === 0 || messi === blocchi.length;
  const altrove = DISPOSITIVI.filter((k) => k !== d && posizione(sel.chiave, k)).map((k) => NOMI_DISPOSITIVI[k]);
  p.altrove.textContent = altrove.length ? 'Ha una posizione libera anche su: ' + altrove.join(', ') + '.' : '';
  p.altrove.hidden = !altrove.length;
  sincronizzaCampiPosizione();
}

function disegnaPosizioni(contenitore, meta) {
  svuota(contenitore);   // il riquadro si riusa: questo ispettore si ridisegna da capo
  if (!spostabile(meta)) { pannelloPosizioni = null; return; }
  const campi = {
    x: campoPosizione('x', 'Da sinistra', X_MAX),
    y: campoPosizione('y', 'Dall\'alto', Y_MAX),
    l: campoPosizione('l', 'Larghezza', X_MAX),
    a: campoPosizione('a', 'Altezza minima', Y_MAX)
  };
  const vista = crea('p', { classe: 'motore-pos__occhiello' });
  const stato = crea('p', { classe: 'motore-pos__stato', role: 'status' });
  const altrove = crea('p', { classe: 'motore-pos__nota', hidden: true });
  const riquadroAttuale = () => { const s = metaDelPannello(); return s ? s.riquadro : ''; };

  const riporta = crea('button', {
    type: 'button', classe: 'btn btn--minimo',
    su: {
      click: () => {
        const s = metaDelPannello();
        if (!s) return;
        impostaPosizione(s.chiave, null);
        annuncia('Il blocco è tornato al suo posto originale su ' + NOMI_DISPOSITIVI[st.dispositivo] + '.');
      }
    }
  }, 'Riporta al posto originale');
  const fissaTutti = crea('button', {
    type: 'button', classe: 'btn btn--minimo',
    title: 'Blocca dove si trovano adesso tutti i blocchi di questo riquadro, così puoi spostarli uno per uno senza che gli altri saltino.',
    su: {
      click: () => {
        const r = riquadroAttuale();
        if (r && fissaRiquadro(r)) annuncia('Tutti i blocchi del riquadro sono fissati dove si trovano su ' + NOMI_DISPOSITIVI[st.dispositivo] + '.');
      }
    }
  }, 'Fissa gli altri blocchi');
  const riportaTutti = crea('button', {
    type: 'button', classe: 'btn btn--minimo',
    su: {
      click: () => {
        const r = riquadroAttuale();
        if (r && riportaRiquadro(r)) annuncia('Tutti i blocchi del riquadro sono tornati al loro posto su ' + NOMI_DISPOSITIVI[st.dispositivo] + '.');
      }
    }
  }, 'Riporta tutto il riquadro');

  const radice = crea('section', { classe: 'motore-pos', 'aria-label': 'Posizione del blocco' }, [
    vista,
    stato,
    crea('div', { classe: 'motore-pos__griglia' }, [campi.x.nodo, campi.y.nodo, campi.l.nodo, campi.a.nodo]),
    crea('p', { classe: 'motore-pos__nota', testo: 'Numeri in percentuale della larghezza del riquadro, anche in verticale.' }),
    altrove,
    crea('div', { classe: 'motore-pos__azioni' }, [riporta, fissaTutti, riportaTutti]),
    crea('p', { classe: 'motore-pos__nota', testo: 'Quando sposti il primo blocco di un riquadro, gli altri blocchi dello stesso riquadro restano fissati dove sono, così non saltano. Ogni dispositivo ha le sue posizioni.' }),
    crea('p', { classe: 'motore-pos__tasti' }, [
      'Trascina il blocco o le maniglie nell\'anteprima. Da tastiera: ',
      crea('kbd', { testo: 'frecce' }), ' spostano di 1, ',
      crea('kbd', { testo: 'Maiusc' }), ' + frecce di 5, ',
      crea('kbd', { testo: 'Alt' }), ' + frecce cambiano la misura, ',
      crea('kbd', { testo: 'Esc' }), ' passa al contenitore. Tieni ',
      crea('kbd', { testo: 'Maiusc' }), ' mentre trascini per staccarti dalla griglia.'
    ])
  ]);
  contenitore.append(radice);
  pannelloPosizioni = { radice, meta, campi, vista, stato, altrove, riporta, fissaTutti, riportaTutti };
  aggiornaPannelloPosizioni();
}

registraIspettore(disegnaPosizioni, { scheda: 'avanzate', ordine: 10, quando: (meta) => spostabile(meta) });

/* ============================================= 11. L'OGGETTO `motore` */

function protetto(fn, riserva) {
  return (...argomenti) => {
    try { return fn(...argomenti); } catch (e) { registraErrore(e); return typeof riserva === 'function' ? riserva() : riserva; }
  };
}

export const motore = {
  monta,
  ricarica,
  documento: () => docVivo(),
  finestra: () => (docVivo() ? st.win : null),

  impostaDispositivo,
  dispositivo: () => st.dispositivo,
  impostaZoom,
  zoom: () => ({ modo: st.zoomModo, scala: st.scala, adatta: st.scalaAdatta }),

  seleziona: protetto(seleziona, null),
  selezione: () => st.selezione,
  percorso,
  suSelezione(fn) {
    if (typeof fn !== 'function') return () => {};
    st.iscritti.push(fn);
    return () => {
      const i = st.iscritti.indexOf(fn);
      if (i !== -1) st.iscritti.splice(i, 1);
    };
  },
  evidenzia: protetto((id) => {
    if (id === null || id === undefined || id === '') {
      st.evidenziatoId = null;
      st.evidenziatoEl = null;
      disegnaSovrapposizione(true);
      return null;
    }
    st.evidenziatoId = normalizzaId(id);
    const m = risolviId(st.evidenziatoId, 0);
    st.evidenziatoEl = m ? m.el : null;
    disegnaSovrapposizione(true);
    return m;
  }, null),
  scorriA: protetto((id) => {
    const m = id ? risolviId(String(id), 0) : null;
    if (m) scorriAElemento(m.el, 'alto');
    return m;
  }, null),

  registraIspettore,
  disegnaIspettori,

  posizione: protetto(posizione, null),
  impostaPosizione: protetto(impostaPosizione, false),

  aggiornaTesti: protetto(() => { applicaTesti(); }),
  aggiornaTema: protetto(() => { applicaTema(); }),
  aggiornaStili: protetto(() => { applicaStili(); }),
  aggiornaDisposizione: protetto(() => { applicaDisposizione(); aggiornaPannelloPosizioni(); }),
  chiaveGuidata: protetto(chiaveGuidata, false),

  contorni(acceso) {
    if (acceso !== undefined) {
      st.contorni = !!acceso;
      const doc = docVivo();
      if (doc) stileProprio(doc, ID_STILE_CONTORNI, CSS_CONTORNI, st.contorni);
    }
    return st.contorni;
  },
  griglia(acceso) {
    if (acceso !== undefined) st.griglia = !!acceso;
    return st.griglia;
  }
};
