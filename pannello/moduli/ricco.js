/* =====================================================================
   ricco.js — l'editor dei testi con un po' di HTML dentro.

   Serve a una cosa sola: far scrivere «una parola in grassetto» e «vai a
   capo qui» a chi non sa cos'e' un tag, senza aprire la porta a tutto il
   resto dell'HTML.

   Tre regole che tengono in piedi il file:

   1. LA LISTA BIANCA E' QUELLA DEL CONTRATTO-2 §7, e vale in entrata.
      Quello che si incolla passa da sanifica() PRIMA di entrare nel
      documento: non esiste un solo innerHTML con dati non ripuliti. Il
      sanificatore del server (server/lib/testoricco.js) resta l'autorita';
      questo serve a non fargli arrivare schifezze, non a fidarsene.

   2. IL DOCUMENTO NON E' IL DATO. Quello che finisce nella bozza e' sempre
      la serializzazione ripulita di quello che si vede: se il browser si
      inventa uno <span style>, muore li'.

   3. execCommand E' DEPRECATO, e lo si usa lo stesso per grassetto,
      corsivo, sottolineato, «togli formattazione» e l'inserimento.
      Motivo: e' l'unica cosa che tutti i browser implementano allo stesso
      modo, ed e' l'unica strada che non spacca l'annulla (Ctrl+Z), che
      invece si perde a ogni modifica fatta a mano sul DOM. L'uscita viene
      normalizzata dalla lista bianca, quindi il «come» lo decide il
      browser ma il «cosa resta» lo decidiamo noi.

   Esporta:
     creaCampoRicco(campo, accesso, ctx)  -> il controllo del campo
     sanifica(html)    -> stringa ripulita
     soloTesto(html)   -> il testo senza tag, per contare i caratteri
     TAG_AMMESSI       -> la lista bianca, uguale a quella del server
   ===================================================================== */

import { el, bottone, svuota } from './dom.js';
import { guscio, attaccaErrore, erroreLocale } from './campi.js';

/* ---------------------------------------------------------------------
   1. La lista bianca
   --------------------------------------------------------------------- */

/** Tag ammessi -> attributi ammessi su quel tag. Tutto il resto sparisce. */
export const TAG_AMMESSI = {
  b: [], strong: [], i: [], em: [], u: [], s: [], br: [],
  small: [], mark: [], sup: [], sub: [], code: [],
  abbr: ['title'],
  span: ['class'],
  a: ['href', 'title']
};

/** Le uniche classi ammesse su <span>: sono quelle che il sito sa stilare. */
const CLASSI_SPAN = ['evidenza', 'tenue', 'mono'];

/**
 * Tag che spariscono con tutto quello che hanno dentro.
 * Per gli altri si tiene il contenuto (un <div> incollato lascia il suo
 * testo); per questi no: il «contenuto» di uno <script> e' codice, e
 * lasciarlo come testo visibile sarebbe solo un modo diverso di sporcare.
 */
const DA_BUTTARE = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
  'svg', 'math', 'canvas', 'video', 'audio', 'img', 'picture', 'source',
  'input', 'button', 'select', 'textarea', 'option', 'form', 'label',
  'link', 'meta', 'head', 'title', 'base'
]);

/**
 * Tag di blocco: non sono ammessi (i testi vivono dentro elementi che
 * gia' esistono nel modello), ma quando si incolla da un documento vero
 * segnano dei veri a capo. Si tiene il contenuto e si aggiunge un <br>,
 * altrimenti tre paragrafi diventano una riga sola.
 */
const BLOCCHI = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'figure', 'figcaption'
]);

/* ---------------------------------------------------------------------
   Pulizia del testo — le stesse identiche regole del server.

   `senzaControlli` e `unaRiga` sono la copia di quelle di
   `server/lib/testoricco.js`: se qui si contasse o si ripulisse anche
   solo di un carattere in modo diverso, il pannello direbbe «ci sta» e il
   salvataggio risponderebbe di no, che e' il modo piu' sicuro di far
   impazzire chi amministra.
   --------------------------------------------------------------------- */

/* Caratteri di controllo, separatori di riga Unicode e BOM: invisibili e
   usati apposta per spezzare i controlli («java[tab]script:» per il
   browser e' javascript:). Restano tabulazione, a capo e ritorno a capo,
   che poi vengono compattati da unaRiga().
   Sono gli stessi codici di RE_CONTROLLI del server, scritti in numero
   invece che come classe di caratteri: in un sorgente si leggono solo
   cosi', e nessuno li cancella per sbaglio credendoli spazi. */
const CONTROLLI_SPARSI = new Set([0x7f, 0xad, 0x2028, 0x2029, 0xfeff]);

function eDaButtare(codice) {
  if (codice <= 0x08) return true;                       // \u0000-\u0008
  if (codice === 0x0b || codice === 0x0c) return true;   // tabulazione verticale, avanzamento pagina
  if (codice >= 0x0e && codice <= 0x1f) return true;
  return CONTROLLI_SPARSI.has(codice);                   // DEL, soft hyphen, separatori di riga, BOM
}

function senzaControlli(testo) {
  const grezzo = String(testo === null || testo === undefined ? '' : testo);
  return Array.from(grezzo).filter((c) => !eDaButtare(c.charCodeAt(0))).join('');
}

/** Testo su una riga sola, senza spazi doppi: e' il conto che fa il server. */
function unaRiga(testo) {
  return senzaControlli(testo).replace(/\s+/g, ' ').trim();
}

/**
 * Indirizzo accettabile per un <a>.
 *
 * Sono le tre regole di `esaminaUrl()` del server, ripetute qui parola per
 * parola, perche' la barra del link non puo' accettare un indirizzo che
 * poi fa rifiutare il salvataggio dell'intero documento:
 *   1. niente «//» o «\\» iniziali: erediterebbero il protocollo della
 *      pagina e porterebbero su un altro dominio;
 *   2. http e https vogliono «//» e almeno il nome del sito dietro
 *      («https:evil.com» non e' un indirizzo);
 *   3. mailto vuole un'email intera, con la chiocciola e un dominio col
 *      punto («mailto:a@b» non basta).
 * Ogni altro protocollo (javascript:, data:, file:) e' fuori.
 *
 * Il controllo si fa su una copia «nuda» — senza caratteri di controllo,
 * senza spazi, tutta minuscola — perche' e' quello che guarda il browser;
 * quello che si tiene e' invece il valore ripulito ma leggibile, lo
 * stesso che tiene il server.
 */
function hrefSicuro(valore) {
  const deciso = senzaControlli(valore).trim();
  const nudo = deciso.replace(/\s+/g, '').toLowerCase();
  if (!nudo) return null;

  if (/^[/\\][/\\]/.test(nudo) || nudo.charAt(0) === '\\') return null;

  const trovato = /^([a-z][a-z0-9+.-]*):/.exec(nudo);
  if (!trovato) return deciso;                 // percorso relativo o #ancora: va bene

  const protocollo = trovato[1];
  if (protocollo === 'http' || protocollo === 'https') {
    return /^https?:\/\/[^/]/.test(nudo) ? deciso : null;
  }
  if (protocollo === 'mailto') {
    return /^mailto:[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(nudo) ? deciso : null;
  }
  return null;
}

/* ---------------------------------------------------------------------
   2. Il sanificatore

   Si legge con DOMParser, che costruisce un documento inerte: niente
   script eseguiti, niente immagini scaricate, niente onerror. Poi si
   ricostruisce nodo per nodo dentro il documento vero, copiando solo
   quello che e' in lista. Ricostruire invece di ripulire e' la parte
   importante: quello che non si conosce non passa, invece di sperare di
   averlo tolto tutto.
   --------------------------------------------------------------------- */

function copiaAmmessi(sorgente, destinazione) {
  for (const nodo of Array.from(sorgente.childNodes)) {
    if (nodo.nodeType === Node.TEXT_NODE) {
      destinazione.append(document.createTextNode(nodo.nodeValue));
      continue;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) continue;   // commenti e simili: via

    const tag = nodo.tagName.toLowerCase();
    if (DA_BUTTARE.has(tag)) continue;

    if (!Object.prototype.hasOwnProperty.call(TAG_AMMESSI, tag)) {
      copiaAmmessi(nodo, destinazione);
      if (BLOCCHI.has(tag) && destinazione.lastChild && destinazione.lastChild.nodeName !== 'BR') {
        destinazione.append(document.createElement('br'));
      }
      continue;
    }

    const nuovo = document.createElement(tag);
    for (const attributo of TAG_AMMESSI[tag]) {
      const valore = nodo.getAttribute(attributo);
      if (valore === null) continue;

      if (attributo === 'href') {
        const href = hrefSicuro(valore);
        if (href) nuovo.setAttribute('href', href);
      } else if (attributo === 'class') {
        const classi = String(valore).split(/\s+/).filter((c) => CLASSI_SPAN.includes(c));
        if (classi.length) nuovo.setAttribute('class', classi.join(' '));
      } else {
        nuovo.setAttribute(attributo, String(valore).slice(0, 200));
      }
    }

    // Un <a> senza indirizzo valido e uno <span> senza classe utile non
    // sono elementi: sono involucri. Si tiene quello che c'e' dentro.
    if ((tag === 'a' && !nuovo.hasAttribute('href')) || (tag === 'span' && !nuovo.hasAttribute('class'))) {
      copiaAmmessi(nodo, destinazione);
      continue;
    }

    copiaAmmessi(nodo, nuovo);
    destinazione.append(nuovo);
  }
}

/** Frammento ripulito, pronto da appendere a un nodo vivo. */
function frammentoSicuro(html) {
  const frammento = document.createDocumentFragment();
  const testo = String(html === null || html === undefined ? '' : html);
  if (!testo) return frammento;

  // Il documento di DOMParser non ha una finestra: niente si carica e
  // niente si esegue mentre lo si legge.
  const inerte = new DOMParser().parseFromString('<!doctype html><body>' + testo, 'text/html');
  copiaAmmessi(inerte.body, frammento);
  return frammento;
}

/** Da nodo (o frammento) a stringa. La serializzazione non e' un rischio: esce, non entra. */
function serializza(nodo) {
  const scatola = document.createElement('div');
  scatola.append(nodo.cloneNode ? nodo.cloneNode(true) : nodo);
  return scatola.innerHTML;
}

/**
 * Solo il contenuto di un elemento, senza l'elemento stesso.
 * Serve per l'area scrivibile: il dato e' quello che c'e' dentro, non il
 * <div contenteditable> che lo contiene.
 */
function serializzaFigli(elemento) {
  const scatola = document.createElement('div');
  for (const figlio of Array.from(elemento.childNodes)) scatola.append(figlio.cloneNode(true));
  return scatola.innerHTML;
}

/** Toglie gli spazi e i <br> in coda: non si vedono, e sporcano il diff. */
function limaBordi(html) {
  return String(html || '')
    .replace(/^(?:\s|<br\s*\/?>)+/i, '')
    .replace(/(?:\s|<br\s*\/?>)+$/i, '');
}

/**
 * Passaggio dalla lista bianca, senza toccare i bordi.
 * Serve per i pezzi che si inseriscono nel mezzo del testo: un <br> da
 * solo e' esattamente cio' che limaBordi() butterebbe via.
 */
function ripulisci(html) {
  return serializza(frammentoSicuro(html));
}

/**
 * Ripulisce l'HTML tenendo solo quello che il contratto ammette.
 * Non lancia mai: quello che non e' ammesso sparisce, il testo resta.
 */
export function sanifica(html) {
  return limaBordi(ripulisci(html));
}

/**
 * Il testo senza tag, come lo legge chi guarda la pagina.
 * Un <br> vale un a capo, cioe' un carattere: se non lo si contasse, il
 * pannello direbbe che ci sta e il server risponderebbe di no.
 */
export function soloTesto(html) {
  const scatola = document.createElement('div');
  scatola.append(frammentoSicuro(html));
  // Un <br> vale UNO SPAZIO, non un a capo: e' quello che fa `soloTesto()`
  // del server, e in un attributo un a capo non ci potrebbe nemmeno stare.
  for (const salto of Array.from(scatola.querySelectorAll('br'))) {
    salto.replaceWith(document.createTextNode(' '));
  }
  // unaRiga() compatta gli spazi e taglia i bordi, esattamente come il
  // browser quando disegna la pagina: «ciao   mondo» sono dieci caratteri
  // letti, non dodici. Contare in un altro modo vorrebbe dire bloccare in
  // locale del testo che il server accetterebbe.
  return unaRiga(scatola.textContent);
}

/** Frammento da testo semplice: gli a capo diventano <br>, il resto e' testo. */
function frammentoDaTesto(testo) {
  const frammento = document.createDocumentFragment();
  const righe = String(testo || '').split(/\r\n|\r|\n/);
  righe.forEach((riga, indice) => {
    if (indice) frammento.append(document.createElement('br'));
    if (riga) frammento.append(document.createTextNode(riga));
  });
  return frammento;
}

function escapeAttributo(valore) {
  return String(valore)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------------------------------------------------------------------
   3. Il campo
   --------------------------------------------------------------------- */

const TESTO_TAG_AMMESSI =
  'Tag ammessi: <b> <strong> <i> <em> <u> <s> <br> <small> <mark> <sup> <sub> <code> ' +
  '<abbr title> <span class="evidenza|tenue|mono"> <a href title>. Tutto il resto viene tolto.';

export function creaCampoRicco(campo, accesso, ctx) {
  // Il controllo non e' un singolo input: l'etichetta non puo' essere una
  // <label for>, quindi il guscio la fa diventare uno <span> e la si lega
  // all'area con aria-labelledby.
  const parti = guscio(campo, { ...(ctx.opzioni || {}), perInput: false });
  const limite = Number(campo.max) > 0 ? Number(campo.max) : null;

  const idArea = parti.idCampo;
  const idNota = idArea + '-nota';
  const idSorgente = idArea + '-src';

  /* --- l'area scrivibile --- */
  const area = el('div', {
    id: idArea,
    classe: 'ricco__area',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-labelledby': parti.idEtichetta,
    'aria-describedby': idNota,
    spellcheck: 'true'
  });
  parti.principale = area;

  /* --- il sorgente HTML --- */
  const sorgente = el('textarea', {
    id: idSorgente,
    classe: 'ricco__sorgente campo__area',
    hidden: true,
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-labelledby': parti.idEtichetta,
    'aria-describedby': idNota
  });

  // La descrizione e' sempre in pagina (anche se non si vede): un
  // aria-describedby che punta a un nodo nascosto non viene letto.
  const descrizione = el('p', {
    classe: 'sr-only', id: idNota,
    testo: 'Campo di testo con formattazione. Usa la barra qui sopra o Ctrl+B, Ctrl+I, Ctrl+U; Invio va a capo.'
  });
  const nota = el('p', { classe: 'ricco__nota', hidden: true, testo: TESTO_TAG_AMMESSI });
  const avvisoPulizia = el('p', { classe: 'ricco__avviso', role: 'status', hidden: true });

  const contatore = el('span', { classe: 'campo__contatore' });
  parti.pie.append(contatore);

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);

  let inCodice = false;

  /* ------------------------------------------------- lettura e scrittura */

  const valore = () => {
    const v = accesso.leggi();
    return v === null || v === undefined ? '' : String(v);
  };

  const rendi = (html) => {
    svuota(area);
    area.append(frammentoSicuro(html));
  };

  const aggiornaContatore = (testoVisibile) => {
    const quanti = testoVisibile.length;
    contatore.textContent = limite ? quanti + ' / ' + limite : quanti + ' caratteri';
    contatore.dataset.livello = limite && quanti > limite ? 'oltre'
      : (limite && quanti > limite * 0.9 ? 'vicino' : 'normale');
  };

  /** Dal documento alla bozza: quello che si salva e' sempre ripulito. */
  const scriviDalDocumento = () => {
    const html = sanifica(serializzaFigli(area));
    accesso.scrivi(html);
    aggiornaContatore(soloTesto(html));
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, html) || '');
    ctx.modificato();
  };

  /** Dal sorgente alla bozza: si scrive quello che c'e' scritto, e si avvisa. */
  const scriviDalSorgente = () => {
    const grezzo = sorgente.value;
    accesso.scrivi(grezzo);
    aggiornaContatore(soloTesto(grezzo));
    const ripulito = sanifica(grezzo);
    // Confronto onesto: si dice che qualcosa verra' tolto, non lo si
    // toglie sotto le dita mentre si sta ancora scrivendo.
    const cambia = ripulito !== limaBordi(grezzo);
    avvisoPulizia.hidden = !cambia;
    // Il server non ripulisce in silenzio: un tag fuori lista glielo fa
    // RIFIUTARE, il salvataggio. Meglio dirlo qui, mentre si scrive.
    if (cambia) {
      avvisoPulizia.textContent = 'C\'è qualcosa fuori lista: torna all\'editor e viene tolto, ' +
        'ma se salvi così il server rifiuta tutto il documento. ' + TESTO_TAG_AMMESSI;
    }
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, grezzo) || '');
    ctx.modificato();
  };

  /* ------------------------------------------------------- selezione */

  const selezione = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return area.contains(range.commonAncestorContainer) ? { sel, range } : null;
  };

  let rangeSalvato = null;
  const salvaSelezione = () => {
    const dove = selezione();
    rangeSalvato = dove ? dove.range.cloneRange() : null;
  };
  const ripristinaSelezione = () => {
    if (!rangeSalvato) { area.focus(); return; }
    area.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(rangeSalvato);
  };

  /* -------------------------------------------------------- comandi */

  /**
   * execCommand: deprecato, ma e' l'unico comando di formattazione che
   * tutti i browser implementano allo stesso modo, e l'unico che non
   * azzera la pila dell'annulla. styleWithCSS a false serve a farsi dare
   * <b>/<i>/<u> invece di <span style>, che la lista bianca butterebbe.
   */
  const esegui = (comando, valoreComando = null) => {
    area.focus();
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(comando, false, valoreComando);
    } catch { /* browser che non lo implementa: il testo resta com'e' */ }
    scriviDalDocumento();
    aggiornaStatoBarra();
  };

  /** Inserisce HTML gia' ripulito nel punto del cursore. */
  const inserisci = (html) => {
    const pulito = ripulisci(html);
    if (!pulito) return;
    area.focus();

    let fatto = false;
    // La stringa e' gia' passata dalla lista bianca: insertHTML qui non
    // e' una scorciatoia pericolosa, e' l'unico modo di non perdere Ctrl+Z.
    try { fatto = document.execCommand('insertHTML', false, pulito); } catch { fatto = false; }

    if (!fatto) {
      const dove = selezione();
      const frammento = frammentoSicuro(pulito);
      const ultimo = frammento.lastChild;
      if (dove) {
        dove.range.deleteContents();
        dove.range.insertNode(frammento);
        if (ultimo) {
          const dopo = document.createRange();
          dopo.setStartAfter(ultimo);
          dopo.collapse(true);
          dove.sel.removeAllRanges();
          dove.sel.addRange(dopo);
        }
      } else {
        area.append(frammento);
      }
    }
    scriviDalDocumento();
  };

  const aCapo = () => {
    inserisci('<br>');

    // Un <br> in fondo al contenuto non si vede: il browser ha bisogno di
    // un secondo <br> di appoggio perche' il cursore scenda davvero.
    // Si aggiunge solo se dopo il cursore non e' rimasto niente, e
    // sparisce da solo al salvataggio, perche' sanifica() lima i bordi.
    const dove = selezione();
    const ultimo = area.lastChild;
    if (!dove || !ultimo || ultimo.nodeName !== 'BR') return;
    const resto = document.createRange();
    resto.selectNodeContents(area);
    resto.setStart(dove.range.endContainer, dove.range.endOffset);
    if (resto.toString() === '') area.append(document.createElement('br'));
  };

  /* ------------------------------------------------------ riga del link */

  const campoLink = el('input', {
    type: 'text', classe: 'campo__input ricco__link-input',
    placeholder: 'https://esempio.it oppure #settimana',
    spellcheck: 'false', autocomplete: 'off',
    'aria-label': 'Indirizzo del link'
  });
  const erroreLink = el('p', { classe: 'ricco__link-errore', hidden: true, role: 'alert' });

  const btnTogliLink = bottone({
    testo: 'Togli il link', classe: 'btn btn--minimo',
    su: () => { ripristinaSelezione(); esegui('unlink'); chiudiLink(); }
  });

  const rigaLink = el('div', { classe: 'ricco__link', hidden: true }, [
    el('div', { classe: 'ricco__link-riga' }, [
      campoLink,
      bottone({ testo: 'Applica', classe: 'btn btn--primario btn--minimo', su: () => applicaLink() }),
      btnTogliLink,
      bottone({ testo: 'Annulla', classe: 'btn btn--minimo', su: () => { chiudiLink(); area.focus(); } })
    ]),
    erroreLink
  ]);

  /** Il <a> in cui sta il cursore, se c'e': serve a modificarlo invece di annidarne un altro. */
  const linkSottoIlCursore = () => {
    const dove = selezione();
    if (!dove) return null;
    const nodo = dove.range.startContainer;
    const elemento = nodo.nodeType === Node.ELEMENT_NODE ? nodo : nodo.parentElement;
    const trovato = elemento ? elemento.closest('a') : null;
    return trovato && area.contains(trovato) ? trovato : null;
  };

  function apriLink() {
    salvaSelezione();
    const esistente = linkSottoIlCursore();
    campoLink.value = esistente ? esistente.getAttribute('href') || '' : '';
    btnTogliLink.disabled = !esistente;
    erroreLink.hidden = true;
    rigaLink.hidden = false;
    campoLink.focus();
    campoLink.select();
  }

  function chiudiLink() {
    rigaLink.hidden = true;
    erroreLink.hidden = true;
  }

  function applicaLink() {
    const indirizzo = hrefSicuro(campoLink.value);
    if (!indirizzo) {
      // Le stesse parole delle regole vere: se il messaggio dicesse meno
      // di quello che il controllo chiede, si proverebbe a indovinare.
      erroreLink.textContent = 'Indirizzo non valido: ci vuole https:// con almeno il nome del sito, ' +
        'oppure mailto: con un\'email completa (nome@dominio.it), oppure un percorso di questo sito ' +
        'con la barra normale /.';
      erroreLink.hidden = false;
      campoLink.focus();
      return;
    }
    ripristinaSelezione();

    // Se il cursore era dentro un link che c'e' gia', si prende tutto il
    // link: cosi' quello si modifica, invece di annidarcene un altro
    // dentro (un <a> dentro un <a> non e' HTML valido, e il browser lo
    // smonterebbe a modo suo).
    const esistente = linkSottoIlCursore();
    const sel = window.getSelection();
    if (esistente && sel) {
      const tutto = document.createRange();
      tutto.selectNode(esistente);
      sel.removeAllRanges();
      sel.addRange(tutto);
    }

    const dove = selezione();
    if (!dove) { chiudiLink(); return; }
    if (!dove.range.collapsed) esegui('unlink');

    const attuale = selezione();
    const dentro = attuale && !attuale.range.collapsed
      ? serializza(attuale.range.cloneContents())
      : '';

    // Cursore fermo e nessun testo scelto: il link scrive se stesso, che
    // e' meglio di un <a> vuoto e invisibile.
    inserisci('<a href="' + escapeAttributo(indirizzo) + '">' + (dentro || escapeAttributo(indirizzo)) + '</a>');
    chiudiLink();
    area.focus();
  }

  campoLink.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); applicaLink(); }
    if (ev.key === 'Escape') { ev.preventDefault(); chiudiLink(); area.focus(); }
  });

  /* ----------------------------------------------------------- la barra */

  const comandi = [];

  /**
   * Un bottone della barra.
   * I glifi sono lettere, non icone: le icone del pannello stanno nello
   * sprite di index.html, che e' di un altro file e potrebbe non avere
   * quelle che servono qui. G/C/S e' anche la sigla che chiunque abbia
   * usato un programma di scrittura in italiano riconosce al volo.
   */
  const cmd = ({ glifo, nome, titolo, classe = '', azione, stato = null }) => {
    const nodo = el('button', {
      type: 'button',
      classe: 'ricco__cmd ' + classe,
      title: titolo || nome,
      tabindex: '-1',
      su: {
        click: (ev) => { ev.preventDefault(); azione(); },
        // Senza questo, il clic sposta il fuoco sul bottone e la selezione
        // nel testo si perde: si premerebbe «grassetto» su niente.
        mousedown: (ev) => ev.preventDefault()
      }
    }, [
      el('span', { classe: 'ricco__glifo', 'aria-hidden': 'true', testo: glifo }),
      el('span', { classe: 'sr-only', testo: nome })
    ]);
    comandi.push({ nodo, stato });
    return nodo;
  };

  const btnCodice = el('button', {
    type: 'button',
    classe: 'ricco__cmd ricco__cmd--codice',
    title: 'Mostra e modifica il codice HTML',
    tabindex: '-1',
    'aria-pressed': 'false',
    'aria-controls': idSorgente,
    su: { click: (ev) => { ev.preventDefault(); cambiaModalita(!inCodice); } }
  }, [
    el('span', { classe: 'ricco__glifo', 'aria-hidden': 'true', testo: '</>' }),
    el('span', { classe: 'sr-only', testo: 'Codice HTML' })
  ]);
  comandi.push({ nodo: btnCodice, stato: null });

  const barra = el('div', { classe: 'ricco__barra', role: 'toolbar', 'aria-label': 'Formattazione del testo' }, [
    el('div', { classe: 'ricco__gruppo' }, [
      cmd({ glifo: 'G', nome: 'Grassetto', titolo: 'Grassetto (Ctrl+B)', classe: 'ricco__cmd--g', azione: () => esegui('bold'), stato: 'bold' }),
      cmd({ glifo: 'C', nome: 'Corsivo', titolo: 'Corsivo (Ctrl+I)', classe: 'ricco__cmd--c', azione: () => esegui('italic'), stato: 'italic' }),
      cmd({ glifo: 'S', nome: 'Sottolineato', titolo: 'Sottolineato (Ctrl+U)', classe: 'ricco__cmd--s', azione: () => esegui('underline'), stato: 'underline' })
    ]),
    el('div', { classe: 'ricco__gruppo' }, [
      cmd({ glifo: 'Link', nome: 'Inserisci o modifica un link', titolo: 'Link', classe: 'ricco__cmd--largo', azione: apriLink }),
      cmd({ glifo: '↵', nome: 'Vai a capo', titolo: 'A capo (Invio)', azione: aCapo }),
      cmd({ glifo: 'Pulisci', nome: 'Togli la formattazione', titolo: 'Toglie grassetto, corsivo e link dalla selezione', classe: 'ricco__cmd--largo', azione: () => { esegui('removeFormat'); esegui('unlink'); } })
    ]),
    el('div', { classe: 'ricco__gruppo ricco__gruppo--fine' }, [btnCodice])
  ]);

  /* Barra con un solo punto di tabulazione: si entra con Tab, ci si muove
     con le frecce. E' il comportamento previsto per role="toolbar", e
     soprattutto evita di dover premere Tab otto volte per arrivare al testo. */
  let indiceFuoco = 0;
  const metteFuoco = (nuovo) => {
    const attivi = comandi.filter((c) => !c.nodo.disabled);
    if (!attivi.length) return;
    indiceFuoco = (nuovo + attivi.length) % attivi.length;
    for (const c of comandi) c.nodo.tabIndex = -1;
    attivi[indiceFuoco].nodo.tabIndex = 0;
    attivi[indiceFuoco].nodo.focus();
  };
  barra.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); metteFuoco(indiceFuoco + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); metteFuoco(indiceFuoco - 1); }
    else if (ev.key === 'Home') { ev.preventDefault(); metteFuoco(0); }
    else if (ev.key === 'End') { ev.preventDefault(); metteFuoco(comandi.length - 1); }
  });
  comandi[0].nodo.tabIndex = 0;

  /** Accende i bottoni che corrispondono alla formattazione sotto il cursore. */
  function aggiornaStatoBarra() {
    for (const c of comandi) {
      if (!c.stato) continue;
      let acceso = false;
      try { acceso = document.queryCommandState(c.stato); } catch { acceso = false; }
      c.nodo.setAttribute('aria-pressed', String(acceso));
      c.nodo.classList.toggle('is-attivo', acceso);
    }
  }

  /* Lo stato della barra dipende da dove sta il cursore, e il cursore
     cambia anche col mouse: selectionchange e' l'unico evento che lo dice.
     L'ascoltatore sta sul documento e si toglie da solo quando il campo
     non e' piu' in pagina, altrimenti a ogni cambio di gruppo se ne
     accumulerebbe uno nuovo. */
  const suSelezione = () => {
    if (!area.isConnected) {
      document.removeEventListener('selectionchange', suSelezione);
      return;
    }
    if (document.activeElement === area) aggiornaStatoBarra();
  };
  document.addEventListener('selectionchange', suSelezione);

  /* ------------------------------------------------------- modalita' */

  function cambiaModalita(versoCodice) {
    if (versoCodice === inCodice) return;

    if (versoCodice) {
      sorgente.value = valore();
      sorgente.rows = Math.min(18, Math.max(5, sorgente.value.split(/\n/).length + 3));
      area.hidden = true;
      sorgente.hidden = false;
      chiudiLink();
      sorgente.focus();
    } else {
      // Si rientra sempre con il testo ripulito: quello che non era in
      // lista sparisce qui, dove si vede, non di nascosto al salvataggio.
      const pulito = sanifica(sorgente.value);
      accesso.scrivi(pulito);
      rendi(pulito);
      aggiornaContatore(soloTesto(pulito));
      avvisoPulizia.hidden = true;
      sorgente.hidden = true;
      area.hidden = false;
      area.focus();
      ctx.modificato();
    }

    inCodice = versoCodice;
    nota.hidden = !versoCodice;
    btnCodice.setAttribute('aria-pressed', String(versoCodice));
    btnCodice.classList.toggle('is-attivo', versoCodice);
    // Grassetto e compagnia non hanno senso su una textarea di codice.
    for (const c of comandi) {
      if (c.nodo !== btnCodice) c.nodo.disabled = versoCodice;
    }
    parti.nodo.classList.toggle('is-codice', versoCodice);
  }

  /* -------------------------------------------------------- ascoltatori */

  area.addEventListener('input', scriviDalDocumento);
  sorgente.addEventListener('input', scriviDalSorgente);

  area.addEventListener('keydown', (ev) => {
    // Ctrl+S e' il salvataggio del pannello: qui non si tocca, si lascia
    // passare. Rubarlo sarebbe il modo piu' rapido di far perdere lavoro.
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const tasto = ev.key.toLowerCase();
      if (tasto === 'b') { ev.preventDefault(); esegui('bold'); return; }
      if (tasto === 'i') { ev.preventDefault(); esegui('italic'); return; }
      if (tasto === 'u') { ev.preventDefault(); esegui('underline'); return; }
      if (tasto === 'k') { ev.preventDefault(); apriLink(); return; }
      return;
    }
    if (ev.key === 'Enter') {
      // Invio in un contenteditable creerebbe un <div> o un <p>: tag di
      // blocco, che il contratto non ammette. Qui Invio vuol dire <br>.
      ev.preventDefault();
      aCapo();
    }
  });

  /**
   * Incolla e trascina passano dalla stessa porta: il contenuto viene
   * ripulito PRIMA di entrare nel documento. Se dell'HTML incollato non
   * resta niente in lista (per esempio si e' incollata un'immagine), si
   * ripiega sul testo semplice invece di non fare niente.
   */
  const incollaDa = (dati) => {
    if (!dati) return;
    const html = dati.getData('text/html');
    const testo = dati.getData('text/plain');
    const pulito = html ? ripulisci(html) : '';
    if (pulito.trim()) inserisci(pulito);
    else if (testo) inserisci(serializza(frammentoDaTesto(testo)));
  };

  area.addEventListener('paste', (ev) => {
    ev.preventDefault();
    incollaDa(ev.clipboardData);
  });

  area.addEventListener('drop', (ev) => {
    // Trascinare dentro un pezzo di pagina web porterebbe con se' tutto il
    // suo markup: passa dalla stessa porta dell'incolla, o non passa.
    ev.preventDefault();
    area.focus();
    incollaDa(ev.dataTransfer);
  });

  area.addEventListener('blur', () => {
    // Con la riga del link aperta il fuoco se n'e' andato apposta: rifare
    // il documento adesso vorrebbe dire buttare via i nodi su cui punta
    // la selezione salvata, e il link finirebbe nel vuoto.
    if (rigaLink.hidden) {
      // Il browser puo' aver lasciato in giro roba fuori lista mentre si
      // scriveva (capita con l'annulla e con certe scorciatoie di sistema).
      // Perso il fuoco, documento e dato tornano a coincidere.
      const grezzo = serializzaFigli(area);
      const pulito = sanifica(grezzo);
      if (pulito !== limaBordi(grezzo)) rendi(pulito);
    }
    controllo.mostraErrore(erroreLocale(campo, valore()) || '');
    aggiornaStatoBarra();
  });

  // Cliccare l'etichetta porta al testo: con <span> al posto di <label>
  // non succederebbe da solo, e chi amministra non lo verrebbe a sapere.
  parti.etichetta.addEventListener('click', () => {
    if (inCodice) sorgente.focus(); else area.focus();
  });

  /* ------------------------------------------------------------ avvio */

  const iniziale = valore();
  rendi(iniziale);
  aggiornaContatore(soloTesto(iniziale));

  controllo.valida = () => {
    const messaggio = erroreLocale(campo, valore());
    controllo.mostraErrore(messaggio || '');
    return !messaggio;
  };
  controllo.fuoco = () => {
    if (inCodice) sorgente.focus(); else area.focus();
  };

  parti.nodo.append(
    el('div', { classe: 'ricco' }, [barra, rigaLink, area, sorgente, avvisoPulizia, nota, descrizione]),
    parti.pie
  );
  return controllo;
}
