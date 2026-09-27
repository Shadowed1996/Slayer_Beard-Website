import { ponte } from './ponte.js';
import { motore } from './motore.js';
import { el, bottone, urlRisorsa } from '../moduli/dom.js';
import { sanifica, soloTesto, TAG_AMMESSI } from '../moduli/ricco.js';
import { erroreLocale } from '../moduli/campi.js';

(function agganciaFoglio() {
  const presente = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => /(^|\/)editor\/contenuti\.css(\?|#|$)/.test(link.getAttribute('href') || ''));
  if (!presente) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./contenuti.css', import.meta.url).href }));
  }
})();

const ID_STILE = 'sb-contenuti-stile';
const ATTR_SCRITTURA = 'data-sb-scrittura';
const ATTR_OLTRE = 'data-sb-oltre';

const SCRIVIBILI = ['testo', 'testolungo', 'ricco'];

const corrente = { contenitore: null, meta: null, radice: null, esito: null };

let scrittura = null;

let ui = {};

function testoDi(valore) {
  return valore === null || valore === undefined ? '' : String(valore);
}

function vivo(nodo) {
  try {
    return Boolean(nodo && nodo.isConnected && nodo.ownerDocument && nodo.ownerDocument.defaultView);
  } catch {
    return false;
  }
}

function elementoDi(nodo) {
  if (!nodo) return null;
  return nodo.nodeType === 1 ? nodo : nodo.parentElement;
}

function eMio(meta) {
  return Boolean(meta) && (meta.tipo === 'testo' || meta.tipo === 'immagine');
}

function attributoDi(tipo) {
  return tipo === 'immagine' ? 'data-sb-immagine' : 'data-sb-testo';
}

function chiaveDi(meta) {
  if (!meta) return '';
  if (meta.chiave) return String(meta.chiave);
  const id = String(meta.id || '');
  const due = id.indexOf(':');
  if (due > 0) return id.slice(due + 1);
  return meta.el && meta.el.getAttribute ? (meta.el.getAttribute(attributoDi(meta.tipo)) || '') : '';
}

function documentoSicuro() {
  try { return typeof motore.documento === 'function' ? motore.documento() : null; } catch { return null; }
}

function selezioneSicura() {
  try { return typeof motore.selezione === 'function' ? motore.selezione() : null; } catch { return null; }
}

function guidata(chiave) {
  try { return typeof motore.chiaveGuidata === 'function' && Boolean(motore.chiaveGuidata(chiave)); } catch { return false; }
}

function chiaveAltDi(meta) {
  if (!meta || meta.tipo !== 'immagine') return '';
  if (meta.alt) return String(meta.alt);
  return vivo(meta.el) ? (meta.el.getAttribute('data-sb-alt') || '') : '';
}

function parteDi(meta) {
  let passo = meta ? meta.genitore : null;
  for (let giri = 0; passo && giri < 16; giri += 1) {
    if (passo.tipo === 'parte') return passo;
    passo = passo.genitore;
  }
  return null;
}

function metaViva(meta) {
  if (!meta) return null;
  if (vivo(meta.el)) return meta;
  const scelta = selezioneSicura();
  if (scelta && scelta.id === meta.id && vivo(scelta.el)) return scelta;
  const trovato = elementiCon(documentoSicuro(), meta.tipo, chiaveDi(meta))[0];
  return trovato ? { ...meta, el: trovato } : null;
}

function elementiCon(documento, tipo, chiave) {
  if (!documento || !chiave) return [];
  const attributo = attributoDi(tipo);
  return Array.from(documento.querySelectorAll('[' + attributo + ']'))
    .filter((nodo) => nodo.getAttribute(attributo) === chiave);
}

function nodiDaHtml(documento, html) {
  const inerte = new DOMParser().parseFromString('<!doctype html><body>' + sanifica(html), 'text/html');
  return Array.from(inerte.body.childNodes).map((nodo) => documento.importNode(nodo, true));
}

function scappaHtml(testo) {
  return String(testo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlDaTesto(testo) {
  return String(testo || '').split(/\r\n|\r|\n/).map(scappaHtml).join('<br>');
}

function testoPuro(elemento) {
  return String(elemento.textContent || '').replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' ');
}

function contaCaratteri(campo, valore) {
  return campo && campo.tipo === 'ricco' ? soloTesto(valore).length : testoDi(valore).length;
}

function hrefAccettato(indirizzo) {
  const provato = sanifica('<a href="' + scappaHtml(String(indirizzo || '').trim()) + '">x</a>');
  const letto = new DOMParser().parseFromString('<!doctype html><body>' + provato, 'text/html').body.querySelector('a[href]');
  return letto ? letto.getAttribute('href') : null;
}

function cssIframe() {
  const radice = getComputedStyle(document.documentElement);
  const colore = (nome) => {
    const valore = radice.getPropertyValue(nome).trim();
    return /^[#a-zA-Z0-9(),.%\s-]+$/.test(valore) ? valore : 'currentColor';
  };
  const acceso = colore('--p-ciano');
  const errore = colore('--p-errore');
  const scelto = '[' + ATTR_SCRITTURA + ']:is(#sb-contenuti-mai, [' + ATTR_SCRITTURA + '])';
  return [
    scelto + ' { outline: 2px dashed ' + acceso + '; outline-offset: 6px; cursor: text; caret-color: ' + acceso + ';' +
      ' -webkit-user-select: text; user-select: text; -webkit-user-drag: none; }',
    scelto + ' * { cursor: text; -webkit-user-select: text; user-select: text; -webkit-user-drag: none; }',
    scelto + '[' + ATTR_OLTRE + '] { outline-color: ' + errore + '; caret-color: ' + errore + '; }'
  ].join('\n');
}

const EVENTI_PUNTATORE = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu'];
const EVENTI_TASTI = ['keydown', 'keyup', 'keypress'];

function collegaDocumento(documento) {
  if (!documento || !documento.defaultView) return;
  const finestra = documento.defaultView;
  try {
    if (documento.head && !documento.getElementById(ID_STILE)) {
      const stile = documento.createElement('style');
      stile.id = ID_STILE;
      stile.textContent = cssIframe();
      documento.head.append(stile);
    }
    for (const tipo of EVENTI_TASTI) finestra.addEventListener(tipo, suTastoIframe, true);
    for (const tipo of EVENTI_PUNTATORE) finestra.addEventListener(tipo, suPuntatoreIframe, true);
    documento.addEventListener('selectionchange', suSelezioneTesto);
  } catch {
  }
}

function dentroScrittura(nodo) {
  const elemento = elementoDi(nodo);
  return Boolean(scrittura && elemento && scrittura.el.contains(elemento));
}

function suTastoIframe(ev) {
  if (!dentroScrittura(ev.target)) return;
  ev.stopPropagation();
  if (ev.type !== 'keydown' || ev.isComposing) return;

  const s = scrittura;
  const tasto = ev.key || '';
  const comando = (ev.ctrlKey || ev.metaKey) && !ev.altKey;

  if (tasto === 'Escape' || (comando && tasto === 'Enter')) {
    ev.preventDefault();
    finisciScrittura();
    return;
  }
  if (comando && tasto.toLowerCase() === 's') {
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    Promise.resolve(ponte.salva()).catch(() => {});
    return;
  }
  if (comando && tasto.toLowerCase() === 'k') {
    ev.preventDefault();
    if (s.ricco) apriRigaLink();
    return;
  }
  if (tasto === 'Enter' && !comando) {
    ev.preventDefault();
    if (s.ricco) aCapo();
    else lampeggiaSuggerimento();
  }
}

function suPuntatoreIframe(ev) {
  const bersaglio = elementoDi(ev.target);
  if (dentroScrittura(bersaglio)) {
    ev.stopPropagation();
    if ((ev.type === 'click' || ev.type === 'auxclick') && bersaglio.closest('a[href], area[href]')) ev.preventDefault();
    return;
  }
  if (ev.type !== 'dblclick' || !bersaglio || typeof bersaglio.closest !== 'function') return;

  const testo = bersaglio.closest('[data-sb-testo]');
  const immagine = bersaglio.closest('[data-sb-immagine]');
  const scelto = testo && immagine ? (testo.contains(immagine) ? immagine : testo) : (testo || immagine);
  if (!scelto) return;

  const tipo = scelto === testo ? 'testo' : 'immagine';
  const chiave = scelto.getAttribute(attributoDi(tipo));
  let meta = selezioneSicura();
  if (!meta || meta.el !== scelto) {
    try { motore.seleziona(tipo + ':' + chiave); } catch {}
    meta = selezioneSicura();
  }
  if (!meta || meta.el !== scelto) {
    meta = { id: tipo + ':' + chiave, tipo, chiave, el: scelto, genitore: null, etichetta: ponte.etichetta(chiave) };
  }

  if (tipo === 'testo') apriScrittura(meta, { tieniSelezione: true });
  else cambiaImmagine(meta);
}

function suSelezioneTesto() {
  const s = scrittura;
  if (!s) return;
  catturaIntervallo(s);
  aggiornaBarra();
}

function apriScrittura(metaChiesto, { tieniSelezione = false } = {}) {
  const meta = metaViva(metaChiesto);
  if (!meta || meta.tipo !== 'testo') {
    ponte.avviso('Questo testo non è più nell\'anteprima: cliccalo di nuovo.', { tipo: 'info' });
    return;
  }
  const chiave = chiaveDi(meta);
  const campo = ponte.campo(chiave);
  if (!campo || SCRIVIBILI.indexOf(campo.tipo) === -1 || guidata(chiave)) {
    corrente.meta = meta;
    disegna();
    return;
  }
  if (scrittura && scrittura.el === meta.el) {
    metteCursore(scrittura, false);
    return;
  }
  if (scrittura) finisciScrittura({ ridisegna: false });

  const elemento = meta.el;
  const documento = elemento.ownerDocument;
  const ricco = campo.tipo === 'ricco';
  const valore = testoDi(ponte.leggi(chiave));

  if (ricco) {
    if (sanifica(elemento.innerHTML) !== sanifica(valore)) elemento.replaceChildren(...nodiDaHtml(documento, valore));
  } else if (elemento.textContent !== valore || elemento.children.length) {
    elemento.textContent = valore;
  }

  const s = {
    el: elemento,
    meta,
    chiave,
    campo,
    ricco,
    documento,
    finestra: documento.defaultView,
    valoreIniziale: valore,
    nodiIniziali: Array.from(elemento.childNodes).map((nodo) => nodo.cloneNode(true)),
    toccato: false,
    oltre: false,
    intervallo: null,
    ascolti: []
  };

  elemento.setAttribute(ATTR_SCRITTURA, '');
  if (ricco) {
    elemento.setAttribute('contenteditable', 'true');
  } else {
    try { elemento.contentEditable = 'plaintext-only'; } catch { elemento.setAttribute('contenteditable', 'true'); }
    if (elemento.contentEditable !== 'plaintext-only') elemento.setAttribute('contenteditable', 'true');
  }
  if (ricco) {
    try { documento.execCommand('styleWithCSS', false, false); } catch {}
  }

  const ascolta = (tipo, funzione) => {
    elemento.addEventListener(tipo, funzione);
    s.ascolti.push([elemento, tipo, funzione]);
  };
  ascolta('beforeinput', suPrimaDellInput);
  ascolta('input', suInput);
  ascolta('paste', suIncolla);
  ascolta('drop', bloccaEvento);
  ascolta('dragover', bloccaEvento);

  scrittura = s;
  corrente.meta = meta;
  corrente.esito = null;
  collegaDocumento(documento);
  metteCursore(s, tieniSelezione);
  portaInVista(s);
  disegna();
  annunciaScrittura(s, true);
}

function annunciaScrittura(s, aperta) {
  document.dispatchEvent(new CustomEvent('sb:scrittura', { detail: { chiave: s.chiave, aperta } }));
}

function metteCursore(s, tieniSelezione) {
  let tenuto = null;
  try {
    const sel = s.finestra.getSelection();
    if (tieniSelezione && sel && sel.rangeCount) {
      const intervallo = sel.getRangeAt(0);
      if (s.el.contains(intervallo.startContainer) && s.el.contains(intervallo.endContainer)) tenuto = intervallo.cloneRange();
    }
  } catch { tenuto = null; }

  try { s.finestra.focus(); } catch {}
  try { s.el.focus({ preventScroll: true }); } catch {}

  try {
    const intervallo = tenuto || cursoreInFondo(s);
    const sel = s.finestra.getSelection();
    sel.removeAllRanges();
    sel.addRange(intervallo);
    s.intervallo = intervallo.cloneRange();
  } catch {}
}

function cursoreInFondo(s) {
  const intervallo = s.documento.createRange();
  intervallo.selectNodeContents(s.el);
  intervallo.collapse(false);
  return intervallo;
}

function portaInVista(s) {
  try {
    const rettangolo = s.el.getBoundingClientRect();
    const altezza = s.finestra.innerHeight;
    if (rettangolo.bottom < 0 || rettangolo.top > altezza) {
      if (typeof motore.scorriA === 'function') motore.scorriA(s.meta.id);
    }
  } catch {}
}

function catturaIntervallo(s) {
  try {
    const sel = s.finestra.getSelection();
    if (!sel || !sel.rangeCount) return;
    const intervallo = sel.getRangeAt(0);
    if (s.el.contains(intervallo.startContainer) && s.el.contains(intervallo.endContainer)) s.intervallo = intervallo.cloneRange();
  } catch {}
}

function rimettiIntervallo(s) {
  let intervallo = null;
  try {
    const sel = s.finestra.getSelection();
    if (sel && sel.rangeCount && s.el.contains(sel.getRangeAt(0).commonAncestorContainer)) intervallo = sel.getRangeAt(0).cloneRange();
  } catch { intervallo = null; }
  if (!intervallo && s.intervallo && s.el.contains(s.intervallo.commonAncestorContainer)) intervallo = s.intervallo;

  try { s.finestra.focus(); } catch {}
  try { s.el.focus({ preventScroll: true }); } catch {}
  try {
    const sel = s.finestra.getSelection();
    sel.removeAllRanges();
    sel.addRange(intervallo || cursoreInFondo(s));
  } catch {}
}

function bloccaEvento(ev) {
  ev.preventDefault();
  ev.stopPropagation();
}

function suPrimaDellInput(ev) {
  const s = scrittura;
  if (!s) return;
  const tipo = ev.inputType || '';

  if (tipo === 'insertParagraph' || (tipo === 'insertLineBreak' && !s.ricco)) {
    ev.preventDefault();
    if (s.ricco) aCapo();
    else lampeggiaSuggerimento();
    return;
  }
  if (tipo === 'insertFromDrop' || tipo === 'deleteByDrag' || tipo === 'insertFromPasteAsQuotation') {
    ev.preventDefault();
    return;
  }
  if (!s.ricco && tipo.indexOf('format') === 0) {
    ev.preventDefault();
    return;
  }
  if (MODIFICHE_VIETATE.has(tipo)) ev.preventDefault();
}

const MODIFICHE_VIETATE = new Set(['formatFontColor', 'formatBackColor', 'formatFontName', 'formatIndent', 'formatOutdent',
  'formatJustifyFull', 'formatJustifyCenter', 'formatJustifyRight', 'formatJustifyLeft',
  'insertOrderedList', 'insertUnorderedList', 'insertHorizontalRule']);

function suInput() {
  const s = scrittura;
  if (!s) return;
  s.toccato = true;
  aggiornaDaDocumento();
}

function suIncolla(ev) {
  const s = scrittura;
  if (!s) return;
  ev.preventDefault();
  ev.stopPropagation();
  const dati = ev.clipboardData;
  if (!dati) return;

  if (s.ricco) {
    const html = dati.getData('text/html');
    let pulito = html ? sanifica(html) : '';
    if (!pulito.trim()) pulito = sanifica(htmlDaTesto(dati.getData('text/plain')));
    if (pulito) comandoDiretto(s, 'insertHTML', pulito);
  } else {
    const testo = dati.getData('text/plain').replace(/[\r\n\t]+/g, ' ');
    if (testo && !comandoDiretto(s, 'insertText', testo)) inserisciTestoAMano(s, testo);
  }
  s.toccato = true;
  aggiornaDaDocumento();
}

function comandoDiretto(s, comando, valore = null) {
  try { return s.documento.execCommand(comando, false, valore); } catch { return false; }
}

function inserisciTestoAMano(s, testo) {
  try {
    const sel = s.finestra.getSelection();
    if (!sel || !sel.rangeCount) return;
    const intervallo = sel.getRangeAt(0);
    intervallo.deleteContents();
    const nodo = s.documento.createTextNode(testo);
    intervallo.insertNode(nodo);
    intervallo.setStartAfter(nodo);
    intervallo.collapse(true);
    sel.removeAllRanges();
    sel.addRange(intervallo);
  } catch {}
}

function aggiornaDaDocumento() {
  const s = scrittura;
  if (!s || !vivo(s.el)) return;
  if (s.ricco) ripulisciVivo(s);
  const valore = s.ricco ? sanifica(s.el.innerHTML) : testoPuro(s.el);
  if (valore !== testoDi(ponte.leggi(s.chiave))) ponte.scrivi(s.chiave, valore);
  aggiornaContatore(valore);
}

const DA_BUTTARE = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math',
  'img', 'picture', 'video', 'audio', 'canvas', 'input', 'button', 'select', 'textarea', 'form', 'link', 'meta']);

const BLOCCHI = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'figure', 'figcaption']);

function comeLoTiene(nodo) {
  const guscio = nodo.cloneNode(false);
  guscio.textContent = 'x';
  const uscita = sanifica(guscio.outerHTML);
  const letto = new DOMParser().parseFromString('<!doctype html><body>' + uscita, 'text/html').body.firstElementChild;
  return letto && letto.localName === nodo.localName ? letto : null;
}

function ripulisciVivo(s) {
  const posizione = posizioneCursore(s);
  let cambiato = false;

  const sciogli = (nodo) => {
    const genitore = nodo.parentNode;
    if (!genitore) return;
    if (BLOCCHI.has(nodo.localName)) {
      const prima = nodo.previousSibling;
      if (prima && prima.nodeName !== 'BR') genitore.insertBefore(s.documento.createElement('br'), nodo);
    }
    while (nodo.firstChild) genitore.insertBefore(nodo.firstChild, nodo);
    nodo.remove();
    cambiato = true;
  };

  const visita = (padre) => {
    for (const figlio of Array.from(padre.childNodes)) {
      if (figlio.nodeType === 8) { figlio.remove(); cambiato = true; continue; }
      if (figlio.nodeType !== 1) continue;
      const tag = figlio.localName;
      if (DA_BUTTARE.has(tag)) { figlio.remove(); cambiato = true; continue; }
      visita(figlio);
      if (!Object.prototype.hasOwnProperty.call(TAG_AMMESSI, tag)) { sciogli(figlio); continue; }

      if (!figlio.attributes.length && TAG_AMMESSI[tag].length === 0) continue;
      const tenuto = comeLoTiene(figlio);
      if (!tenuto) { sciogli(figlio); continue; }
      for (const attributo of Array.from(figlio.attributes)) {
        if (!tenuto.hasAttribute(attributo.name)) { figlio.removeAttribute(attributo.name); cambiato = true; }
      }
      for (const attributo of Array.from(tenuto.attributes)) {
        if (figlio.getAttribute(attributo.name) !== attributo.value) { figlio.setAttribute(attributo.name, attributo.value); cambiato = true; }
      }
    }
  };

  visita(s.el);
  if (cambiato) rimettiCursore(s, posizione);
}

function posizioneCursore(s) {
  try {
    const sel = s.finestra.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const intervallo = sel.getRangeAt(0);
    if (!s.el.contains(intervallo.endContainer)) return null;
    const prima = s.documento.createRange();
    prima.selectNodeContents(s.el);
    prima.setEnd(intervallo.endContainer, intervallo.endOffset);
    return prima.toString().length;
  } catch {
    return null;
  }
}

function rimettiCursore(s, quanti) {
  if (quanti === null) return;
  try {
    const sel = s.finestra.getSelection();
    const intervallo = s.documento.createRange();
    const cammino = s.documento.createTreeWalker(s.el, 4);
    let resto = quanti;
    let nodo = cammino.nextNode();
    let messo = false;
    while (nodo) {
      if (resto <= nodo.nodeValue.length) {
        intervallo.setStart(nodo, resto);
        messo = true;
        break;
      }
      resto -= nodo.nodeValue.length;
      nodo = cammino.nextNode();
    }
    if (!messo) { intervallo.selectNodeContents(s.el); intervallo.collapse(false); }
    intervallo.collapse(true);
    sel.removeAllRanges();
    sel.addRange(intervallo);
  } catch {}
}

function aggiornaContatore(valore) {
  const s = scrittura;
  if (!s) return;
  const limite = Number(s.campo.max) > 0 ? Number(s.campo.max) : null;
  const quanti = contaCaratteri(s.campo, valore);
  const problema = erroreLocale(s.campo, valore);
  const oltre = Boolean(problema);

  if (ui.contatore) {
    ui.contatore.textContent = limite ? quanti + ' / ' + limite : quanti + (quanti === 1 ? ' carattere' : ' caratteri');
    ui.contatore.dataset.livello = oltre ? 'oltre' : (limite && quanti > limite * 0.9 ? 'vicino' : 'normale');
  }
  if (ui.limite) {
    ui.limite.hidden = !oltre;
    ui.limite.textContent = problema ? problema + ' Il salvataggio non passa finché non accorci.' : '';
  }
  if (vivo(s.el)) s.el.toggleAttribute(ATTR_OLTRE, oltre);

  if (oltre && !s.oltre) {
    const testo = limite
      ? 'Il massimo è ' + limite + ' caratteri' + (s.ricco ? ' visibili (i tag non contano)' : '') +
        ': il salvataggio non passa finché non accorci. Il conto è nella scheda Contenuto.'
      : problema + ' Il salvataggio non passa finché non accorci.';
    ponte.avviso(testo, {
      tipo: 'errore',
      titolo: '«' + (s.campo.etichetta || s.chiave) + '» è troppo lungo'
    });
  }
  s.oltre = oltre;
}

function chiudiScrittura({ tieniDom = true } = {}) {
  const s = scrittura;
  if (!s) return false;
  const eraVivo = vivo(s.el);
  if (eraVivo && tieniDom && s.toccato) aggiornaDaDocumento();
  scrittura = null;

  for (const [bersaglio, tipo, funzione] of s.ascolti) {
    try { bersaglio.removeEventListener(tipo, funzione); } catch {}
  }
  s.ascolti = [];

  annunciaScrittura(s, false);

  if (eraVivo) {
    if (tieniDom && s.toccato) allineaVista(s);
    s.el.removeAttribute('contenteditable');
    s.el.removeAttribute(ATTR_SCRITTURA);
    s.el.removeAttribute(ATTR_OLTRE);
    try {
      const sel = s.finestra.getSelection();
      if (sel && sel.rangeCount && s.el.contains(sel.getRangeAt(0).startContainer)) sel.removeAllRanges();
    } catch {}
    try { s.el.blur(); } catch {}
  }
  return s.toccato && testoDi(ponte.leggi(s.chiave)) !== s.valoreIniziale;
}

function allineaVista(s) {
  const valore = testoDi(ponte.leggi(s.chiave));
  if (s.ricco) {
    const prova = s.documento.createElement('div');
    prova.append(...nodiDaHtml(s.documento, valore));
    if (prova.innerHTML !== s.el.innerHTML) s.el.replaceChildren(...Array.from(prova.childNodes));
  } else if (s.el.textContent !== valore || s.el.children.length) {
    s.el.textContent = valore;
  }
}

function finisciScrittura({ ridisegna = true } = {}) {
  const s = scrittura;
  if (!s) return;
  const cambiato = chiudiScrittura();
  corrente.esito = cambiato
    ? { chiave: s.chiave, tipo: 'ok', testo: 'Il testo nuovo è nella bozza: premi Salva per non perderlo.' }
    : null;
  if (ridisegna) disegna();
}

function rimettiComEra() {
  const s = scrittura;
  if (!s) return;
  if (vivo(s.el)) s.el.replaceChildren(...s.nodiIniziali.map((nodo) => nodo.cloneNode(true)));
  if (testoDi(ponte.leggi(s.chiave)) !== s.valoreIniziale) ponte.scrivi(s.chiave, s.valoreIniziale);
  s.toccato = false;
  chiudiScrittura({ tieniDom: false });
  corrente.esito = { chiave: s.chiave, tipo: 'info', testo: 'Il testo è tornato com\'era quando hai cominciato a scriverci.' };
  disegna();
}

let timerLampo = 0;
function lampeggiaSuggerimento() {
  const nodo = ui.suggerimento;
  if (!nodo) return;
  nodo.dataset.lampo = '1';
  clearTimeout(timerLampo);
  timerLampo = setTimeout(() => { delete nodo.dataset.lampo; }, 2200);
}

function esegui(comando, valore = null) {
  const s = scrittura;
  if (!s || !vivo(s.el)) return false;
  rimettiIntervallo(s);
  const fatto = comandoDiretto(s, comando, valore);
  catturaIntervallo(s);
  s.toccato = true;
  aggiornaDaDocumento();
  aggiornaBarra();
  return fatto;
}

function aCapo() {
  if (!esegui('insertLineBreak')) esegui('insertHTML', '<br>');
}

function formatta(comando, nome) {
  const s = scrittura;
  if (!s) return;
  const prima = testoDi(ponte.leggi(s.chiave));
  rimettiIntervallo(s);
  let conSelezione = false;
  try { conSelezione = !s.finestra.getSelection().getRangeAt(0).collapsed; } catch { conSelezione = false; }
  esegui(comando);
  if (!conSelezione) {
    messaggio('Scegli le parole da mettere in ' + nome + ', oppure continua a scrivere: le lettere nuove saranno in ' + nome + '.', 'info');
  } else if (testoDi(ponte.leggi(s.chiave)) === prima) {
    messaggio('Qui il ' + nome + ' non cambia: questo testo ha già il suo stile fisso nel sito. Per cambiarlo usa la scheda Stile.', 'allerta');
  } else {
    messaggio('', '');
  }
}

function linkNellaSelezione(s) {
  try {
    const sel = s.finestra.getSelection();
    const intervallo = sel && sel.rangeCount ? sel.getRangeAt(0) : s.intervallo;
    if (!intervallo) return null;
    const elemento = elementoDi(intervallo.startContainer);
    const link = elemento ? elemento.closest('a') : null;
    return link && s.el.contains(link) && link !== s.el ? link : null;
  } catch {
    return null;
  }
}

function selezionaTutto(s, nodo) {
  const intervallo = s.documento.createRange();
  intervallo.selectNodeContents(nodo);
  const sel = s.finestra.getSelection();
  sel.removeAllRanges();
  sel.addRange(intervallo);
  s.intervallo = intervallo.cloneRange();
}

function apriRigaLink() {
  const s = scrittura;
  if (!s || !s.ricco) return;
  if (!ui.rigaLink || !ui.rigaLink.isConnected || !corrente.radice || !corrente.radice.offsetParent) {
    ponte.avviso('Il link si mette dalla barra della scheda Contenuto: aprila e riprova, il testo resta in scrittura.', { tipo: 'info' });
    return;
  }
  catturaIntervallo(s);
  const esistente = linkNellaSelezione(s);
  ui.campoLink.value = esistente ? esistente.getAttribute('href') || '' : '';
  ui.togliLink.disabled = !esistente;
  ui.erroreLink.hidden = true;
  ui.campoLink.removeAttribute('aria-invalid');
  ui.rigaLink.hidden = false;
  ui.campoLink.focus();
  ui.campoLink.select();
}

function chiudiRigaLink(tornaAlTesto) {
  if (!ui.rigaLink) return;
  ui.rigaLink.hidden = true;
  ui.erroreLink.hidden = true;
  if (tornaAlTesto && scrittura) rimettiIntervallo(scrittura);
}

function applicaLink() {
  const s = scrittura;
  if (!s) return;
  const href = hrefAccettato(ui.campoLink.value);
  if (!href) {
    ui.erroreLink.textContent = 'Indirizzo non valido: ci vuole https:// con almeno il nome del sito, ' +
      'oppure mailto: con un\'email completa (nome@dominio.it), oppure un percorso di questo sito ' +
      'con la barra normale /.';
    ui.erroreLink.hidden = false;
    ui.campoLink.setAttribute('aria-invalid', 'true');
    ui.campoLink.focus();
    return;
  }

  rimettiIntervallo(s);
  const esistente = linkNellaSelezione(s);
  let conSelezione = false;
  try { conSelezione = !s.finestra.getSelection().getRangeAt(0).collapsed; } catch { conSelezione = false; }

  if (esistente) {
    selezionaTutto(s, esistente);
    esegui('createLink', href);
  } else if (conSelezione) {
    esegui('createLink', href);
  } else {
    esegui('insertHTML', sanifica('<a href="' + scappaHtml(href) + '">' + scappaHtml(href) + '</a>'));
  }
  chiudiRigaLink(true);
  messaggio('Link messo: porta a ' + href, 'ok');
}

function togliLink() {
  const s = scrittura;
  if (!s) return;
  rimettiIntervallo(s);
  const esistente = linkNellaSelezione(s);
  if (esistente) selezionaTutto(s, esistente);
  esegui('unlink');
  chiudiRigaLink(true);
}

function pulisci() {
  const s = scrittura;
  if (!s) return;
  rimettiIntervallo(s);
  let vuota = true;
  try { vuota = s.finestra.getSelection().getRangeAt(0).collapsed; } catch { vuota = true; }
  if (vuota) selezionaTutto(s, s.el);
  esegui('removeFormat');
  esegui('unlink');
  messaggio('Formattazione tolta' + (vuota ? ' da tutto il testo.' : ' dalle parole scelte.'), 'ok');
}

function aggiornaBarra() {
  const s = scrittura;
  if (!s || !ui.comandi) return;
  const inUnLink = Boolean(linkNellaSelezione(s));
  for (const voce of ui.comandi) {
    if (!voce.stato) continue;
    let acceso = false;
    try { acceso = s.documento.queryCommandState(voce.stato); } catch { acceso = false; }
    if (voce.stato === 'underline' && inUnLink) acceso = false;
    voce.nodo.setAttribute('aria-pressed', String(acceso));
  }
}

function messaggio(testo, tipo) {
  if (!ui.messaggio) return;
  ui.messaggio.textContent = testo || '';
  ui.messaggio.dataset.tipo = tipo || 'info';
  ui.messaggio.hidden = !testo;
}

function creaBarra() {
  const comandi = [];
  const cmd = ({ glifo, nome, titolo, classe = '', azione, stato = null }) => {
    const nodo = el('button', {
      type: 'button',
      classe: 'ricco__cmd ' + classe,
      title: titolo || nome,
      tabindex: '-1',
      'aria-pressed': stato ? 'false' : null,
      su: {
        mousedown: (ev) => ev.preventDefault(),
        click: (ev) => { ev.preventDefault(); azione(); }
      }
    }, [
      el('span', { classe: 'ricco__glifo', 'aria-hidden': 'true', testo: glifo }),
      el('span', { classe: 'sr-only', testo: nome })
    ]);
    comandi.push({ nodo, stato });
    return nodo;
  };

  const barra = el('div', { classe: 'ricco__barra', role: 'toolbar', 'aria-label': 'Formattazione del testo sulla pagina' }, [
    el('div', { classe: 'ricco__gruppo' }, [
      cmd({ glifo: 'G', nome: 'Grassetto', titolo: 'Grassetto (Ctrl+B)', classe: 'ricco__cmd--g', azione: () => formatta('bold', 'grassetto'), stato: 'bold' }),
      cmd({ glifo: 'C', nome: 'Corsivo', titolo: 'Corsivo (Ctrl+I)', classe: 'ricco__cmd--c', azione: () => formatta('italic', 'corsivo'), stato: 'italic' }),
      cmd({ glifo: 'S', nome: 'Sottolineato', titolo: 'Sottolineato (Ctrl+U)', classe: 'ricco__cmd--s', azione: () => formatta('underline', 'sottolineato'), stato: 'underline' })
    ]),
    el('div', { classe: 'ricco__gruppo' }, [
      cmd({ glifo: 'Link', nome: 'Inserisci o modifica un link', titolo: 'Link (Ctrl+K)', classe: 'ricco__cmd--largo', azione: apriRigaLink }),
      cmd({ glifo: '↵', nome: 'Vai a capo', titolo: 'A capo (Invio)', azione: aCapo }),
      cmd({ glifo: 'Pulisci', nome: 'Togli la formattazione', titolo: 'Toglie grassetto, corsivo, sottolineato e link', classe: 'ricco__cmd--largo', azione: pulisci })
    ])
  ]);

  let indice = 0;
  const fuocoA = (nuovo) => {
    indice = (nuovo + comandi.length) % comandi.length;
    for (const voce of comandi) voce.nodo.tabIndex = -1;
    comandi[indice].nodo.tabIndex = 0;
    comandi[indice].nodo.focus();
  };
  barra.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); fuocoA(indice + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); fuocoA(indice - 1); }
    else if (ev.key === 'Home') { ev.preventDefault(); fuocoA(0); }
    else if (ev.key === 'End') { ev.preventDefault(); fuocoA(comandi.length - 1); }
  });
  comandi[0].nodo.tabIndex = 0;
  ui.comandi = comandi;

  ui.campoLink = el('input', {
    type: 'text', classe: 'campo__input ricco__link-input',
    placeholder: 'https://esempio.it oppure #settimana',
    spellcheck: 'false', autocomplete: 'off',
    'aria-label': 'Indirizzo del link'
  });
  ui.campoLink.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); applicaLink(); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); chiudiRigaLink(true); }
  });
  ui.erroreLink = el('p', { classe: 'ricco__link-errore', role: 'alert', hidden: true });
  ui.togliLink = bottone({ testo: 'Togli il link', classe: 'btn btn--minimo', su: togliLink });
  ui.rigaLink = el('div', { classe: 'ricco__link', hidden: true }, [
    el('div', { classe: 'ricco__link-riga' }, [
      ui.campoLink,
      bottone({ testo: 'Applica', classe: 'btn btn--primario btn--minimo', su: applicaLink }),
      ui.togliLink,
      bottone({ testo: 'Lascia stare', classe: 'btn btn--minimo', su: () => chiudiRigaLink(true) })
    ]),
    ui.erroreLink
  ]);

  return el('div', { classe: 'ricco cont__ricco' }, [barra, ui.rigaLink]);
}

export function disegnaIspettore(contenitore, meta) {
  if (contenitore && !(contenitore instanceof Node) && meta instanceof Node) [contenitore, meta] = [meta, contenitore];

  if (scrittura && (!meta || meta.el !== scrittura.el || !vivo(scrittura.el))) {
    chiudiScrittura({ tieniDom: vivo(scrittura.el) });
  }
  const stessoPosto = Boolean(corrente.radice && corrente.radice.parentNode === contenitore);
  const stessoElemento = Boolean(corrente.meta && meta && corrente.meta.id === meta.id);
  if (!stessoElemento) corrente.esito = null;

  corrente.contenitore = contenitore || null;
  corrente.meta = meta || null;
  if (meta && meta.el) collegaDocumento(meta.el.ownerDocument);
  collegaDocumento(documentoSicuro());

  if (stessoPosto && stessoElemento && corrente.radice.contains(document.activeElement)) return corrente.radice;
  disegna();
  return corrente.radice;
}

function disegna() {
  const contenitore = corrente.contenitore;
  if (!contenitore) return;
  ui = {};
  let radice;
  try {
    const meta = corrente.meta;
    if (!meta || !eMio(meta)) radice = el('div', { classe: 'cont', hidden: true });
    else if (!ponte.pronto) radice = scheda(meta, [nota('I contenuti non sono ancora caricati: un attimo e riprova.', 'info')]);
    else radice = meta.tipo === 'immagine' ? schedaImmagine(meta) : schedaTesto(meta);
  } catch (errore) {
    console.error(errore);
    radice = el('div', { classe: 'cont' }, [
      nota('Qualcosa non torna nei dati di questo elemento e i controlli non si sono aperti. Il resto dell\'editor funziona.', 'errore')
    ]);
  }

  if (corrente.radice && corrente.radice.parentNode === contenitore) contenitore.replaceChild(radice, corrente.radice);
  else contenitore.append(radice);
  corrente.radice = radice;
  if (scrittura) {
    aggiornaContatore(scrittura.ricco ? sanifica(scrittura.el.innerHTML) : testoPuro(scrittura.el));
    aggiornaBarra();
  }
}

function nota(testo, tipo) {
  return el('p', { classe: 'cont__nota', dati: { tipo }, testo });
}

function scheda(meta, corpo) {
  const chiave = chiaveDi(meta);
  const campo = ponte.campo(chiave);
  const gruppo = ponte.gruppoDi(chiave);
  const tipo = meta.tipo === 'immagine' ? 'Immagine' : (campo && campo.tipo === 'ricco' ? 'Testo con formattazione' : 'Testo');
  const nome = (campo && campo.etichetta) || meta.etichetta || ponte.etichetta(chiave);
  return el('div', { classe: 'cont', role: 'group', 'aria-label': nome, dati: { tipo: meta.tipo } }, [
    el('div', { classe: 'cont__testa' }, [
      el('p', { classe: 'cont__occhiello', testo: tipo + (gruppo && gruppo.titolo ? ' · ' + gruppo.titolo : '') }),
      campo && campo.aiuto ? el('p', { classe: 'cont__aiuto', testo: campo.aiuto }) : null
    ]),
    ...corpo
  ]);
}

function esitoPer(chiave) {
  const esito = corrente.esito;
  return esito && esito.chiave === chiave ? el('p', { classe: 'cont__nota', role: 'status', dati: { tipo: esito.tipo }, testo: esito.testo }) : null;
}

function bloccoCampo(titolo, campo) {
  const controllo = campo ? ponte.creaCampo(campo) : null;
  if (!controllo || !controllo.nodo) return null;
  return el('div', { classe: 'cont__campo' }, [
    el('p', { classe: 'cont__occhiello', testo: titolo }),
    controllo.nodo
  ]);
}

function schedaTesto(meta) {
  const chiave = chiaveDi(meta);
  const campo = ponte.campo(chiave);

  if (meta.guidata === true || guidata(chiave)) {
    const parte = parteDi(meta);
    const nomeParte = parte ? (parte.etichetta || 'la parte che lo contiene') : '';
    return scheda(meta, [
      nota('Questo testo la pagina lo prende da un elenco: scritto qui, alla pubblicazione tornerebbe com\'era. ' +
        (parte ? 'Si cambia nei controlli di «' + nomeParte + '».' : 'Si cambia dai controlli della parte di pagina che lo contiene.'), 'info'),
      parte ? el('div', { classe: 'cont__azioni' }, [
        bottone({
          testo: 'Apri i controlli di «' + nomeParte + '»', classe: 'btn btn--primario',
          su: () => { try { motore.seleziona(parte.id); } catch {} }
        })
      ]) : null
    ]);
  }

  if (!campo) {
    return scheda(meta, [nota('Questo testo non ha un campo nello schema: da qui non si può cambiare.', 'errore')]);
  }

  if (SCRIVIBILI.indexOf(campo.tipo) === -1) {
    return scheda(meta, [esitoPer(chiave), bloccoCampo('Si cambia da qui', campo)]);
  }

  const inScrittura = Boolean(scrittura && scrittura.chiave === chiave && vivo(scrittura.el));
  if (!inScrittura) {
    return scheda(meta, [
      el('div', { classe: 'cont__azioni' }, [
        bottone({ testo: 'Scrivi qui', classe: 'btn btn--primario', su: () => apriScrittura(corrente.meta) })
      ]),
      el('p', { classe: 'cont__suggerimento', testo: campo.tipo === 'ricco'
        ? 'Oppure doppio clic sul testo nell\'anteprima. Si possono usare grassetto, corsivo, sottolineato, link e a capo.'
        : 'Oppure doppio clic sul testo nell\'anteprima. È un testo semplice: niente formattazione e niente a capo.' }),
      esitoPer(chiave),
      bloccoCampo('Oppure dal pannello', campo)
    ]);
  }

  const ricco = scrittura.ricco;
  ui.contatore = el('span', { classe: 'campo__contatore', 'aria-live': 'off' });
  ui.limite = el('p', { classe: 'cont__nota', role: 'status', dati: { tipo: 'errore' }, hidden: true });
  ui.messaggio = el('p', { classe: 'cont__nota', role: 'status', hidden: true });
  ui.suggerimento = el('p', {
    classe: 'cont__suggerimento',
    testo: ricco
      ? 'Invio va a capo · Ctrl+B, Ctrl+I, Ctrl+U · Ctrl+K per un link · quello che incolli arriva ripulito · Esc o Ctrl+Invio per finire.'
      : 'Testo semplice: Invio non va a capo e quello che incolli arriva senza formattazione · Esc o Ctrl+Invio per finire.'
  });

  return scheda(meta, [
    el('p', { classe: 'cont__stato', 'aria-live': 'polite' }, [
      el('span', { classe: 'cont__spia', 'aria-hidden': 'true' }),
      'Stai scrivendo sulla pagina'
    ]),
    ricco ? creaBarra() : null,
    ui.messaggio,
    el('div', { classe: 'cont__conta' }, [ui.contatore]),
    ui.limite,
    ui.suggerimento,
    el('div', { classe: 'cont__azioni' }, [
      bottone({ testo: 'Fatto', classe: 'btn btn--primario', su: () => finisciScrittura() }),
      bottone({ testo: 'Rimetti com\'era', classe: 'btn btn--minimo', su: rimettiComEra })
    ])
  ]);
}

function schedaImmagine(meta) {
  const chiave = chiaveDi(meta);
  const valore = testoDi(ponte.leggi(chiave));
  const viva = metaViva(meta);

  const figura = el('div', { classe: 'cont__figura' });
  if (valore) {
    const img = el('img', { src: urlRisorsa(valore), alt: '', decoding: 'async' });
    img.addEventListener('error', () => {
      figura.replaceChildren(el('p', { classe: 'cont__vuota', testo: 'File non trovato' }));
    });
    figura.append(img);
  } else {
    figura.append(el('p', { classe: 'cont__vuota', testo: 'Nessuna immagine' }));
  }

  const copie = elementiCon(viva ? viva.el.ownerDocument : documentoSicuro(), 'immagine', chiave).length;
  const chiaveAlt = chiaveAltDi(viva || meta);
  const campoAlt = chiaveAlt ? ponte.campo(chiaveAlt) : null;
  const decorativa = Boolean(viva && !chiaveAlt && viva.el.getAttribute('alt') === '');

  return scheda(meta, [
    figura,
    el('p', { classe: 'cont__file', testo: valore || 'nessun file' }),
    copie > 1 ? el('p', { classe: 'cont__suggerimento', testo: 'Compare in ' + copie + ' punti della pagina: cambiandola, cambia dappertutto.' }) : null,
    el('div', { classe: 'cont__azioni' }, [
      bottone({ testo: 'Cambia immagine', ico: 'immagine', classe: 'btn btn--primario', su: () => cambiaImmagine(corrente.meta) })
    ]),
    el('p', { classe: 'cont__suggerimento', testo: 'Scegli fra le immagini caricate o caricane una dal computer. Anche il doppio clic sull\'immagine apre la libreria.' }),
    esitoPer(chiave),
    campoAlt ? bloccoCampo('Descrizione dell\'immagine', campoAlt) : null,
    decorativa ? el('p', { classe: 'cont__suggerimento', testo: 'Qui è decorativa: i lettori di schermo la saltano, quindi non ha una descrizione da scrivere.' }) : null
  ]);
}

async function cambiaImmagine(meta) {
  if (!meta) return;
  const chiave = chiaveDi(meta);
  const attuale = testoDi(ponte.leggi(chiave));
  let scelto = null;
  try {
    scelto = await ponte.scegliImmagine(attuale);
  } catch (errore) {
    ponte.avviso(errore && errore.message ? errore.message : 'Non riesco ad aprire la libreria delle immagini.', { tipo: 'errore' });
    return;
  }
  if (typeof scelto !== 'string' || !scelto || scelto === attuale) return;

  ponte.scrivi(chiave, scelto);
  if (corrente.meta && chiaveDi(corrente.meta) === chiave && corrente.meta.tipo === 'immagine') {
    corrente.esito = { chiave, tipo: 'ok', testo: 'Immagine cambiata nella bozza: premi Salva per non perderla.' };
    disegna();
  }
}

function suCambioSelezione(meta) {
  if (scrittura && (!meta || meta.el !== scrittura.el)) finisciScrittura({ ridisegna: false });
  if (!eMio(meta)) {
    if (corrente.radice) corrente.radice.remove();
    corrente.meta = null;
    corrente.esito = null;
  }
}

document.addEventListener('sb:anteprima-pronta', () => {
  if (scrittura && !vivo(scrittura.el)) chiudiScrittura({ tieniDom: false });
  collegaDocumento(documentoSicuro());
});

document.addEventListener('sb:sostituito', () => {
  if (scrittura) chiudiScrittura({ tieniDom: false });
  corrente.esito = null;
  if (corrente.radice && corrente.radice.isConnected) disegna();
});

document.addEventListener('sb:pronto', () => {
  if (corrente.radice && corrente.radice.isConnected) disegna();
});

document.addEventListener('sb:modifica', (ev) => {
  if (scrittura || !corrente.radice || !corrente.radice.isConnected || !eMio(corrente.meta)) return;
  const chiave = ev.detail && ev.detail.chiave;
  const meta = corrente.meta;
  const chiaveAlt = chiaveAltDi(metaViva(meta) || meta);
  if (chiave !== chiaveDi(meta) && (!chiaveAlt || chiave !== chiaveAlt)) return;
  if (corrente.radice.contains(document.activeElement)) return;
  disegna();
});

motore.registraIspettore(disegnaIspettore, { scheda: 'contenuto', ordine: 10, quando: eMio });
if (typeof motore.suSelezione === 'function') motore.suSelezione(suCambioSelezione);
collegaDocumento(documentoSicuro());
