import { el, bottone, svuota } from './dom.js';
import { guscio, attaccaErrore, erroreLocale } from './campi.js';

export const TAG_AMMESSI = {
  b: [], strong: [], i: [], em: [], u: [], s: [], br: [],
  small: [], mark: [], sup: [], sub: [], code: [],
  abbr: ['title'],
  span: ['class'],
  a: ['href', 'title']
};

const CLASSI_SPAN = ['evidenza', 'tenue', 'mono'];

const DA_BUTTARE = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
  'svg', 'math', 'canvas', 'video', 'audio', 'img', 'picture', 'source',
  'input', 'button', 'select', 'textarea', 'option', 'form', 'label',
  'link', 'meta', 'head', 'title', 'base'
]);

const BLOCCHI = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'figure', 'figcaption'
]);

const CONTROLLI_SPARSI = new Set([0x7f, 0xad, 0x2028, 0x2029, 0xfeff]);

function eDaButtare(codice) {
  if (codice <= 0x08) return true;
  if (codice === 0x0b || codice === 0x0c) return true;
  if (codice >= 0x0e && codice <= 0x1f) return true;
  return CONTROLLI_SPARSI.has(codice);
}

function senzaControlli(testo) {
  const grezzo = String(testo === null || testo === undefined ? '' : testo);
  return Array.from(grezzo).filter((c) => !eDaButtare(c.charCodeAt(0))).join('');
}

function unaRiga(testo) {
  return senzaControlli(testo).replace(/\s+/g, ' ').trim();
}

function hrefSicuro(valore) {
  const deciso = senzaControlli(valore).trim();
  const nudo = deciso.replace(/\s+/g, '').toLowerCase();
  if (!nudo) return null;

  if (/^[/\\][/\\]/.test(nudo) || nudo.charAt(0) === '\\') return null;

  const trovato = /^([a-z][a-z0-9+.-]*):/.exec(nudo);
  if (!trovato) return deciso;

  const protocollo = trovato[1];
  if (protocollo === 'http' || protocollo === 'https') {
    return /^https?:\/\/[^/]/.test(nudo) ? deciso : null;
  }
  if (protocollo === 'mailto') {
    return /^mailto:[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(nudo) ? deciso : null;
  }
  return null;
}

function copiaAmmessi(sorgente, destinazione) {
  for (const nodo of Array.from(sorgente.childNodes)) {
    if (nodo.nodeType === Node.TEXT_NODE) {
      destinazione.append(document.createTextNode(nodo.nodeValue));
      continue;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) continue;

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

    if ((tag === 'a' && !nuovo.hasAttribute('href')) || (tag === 'span' && !nuovo.hasAttribute('class'))) {
      copiaAmmessi(nodo, destinazione);
      continue;
    }

    copiaAmmessi(nodo, nuovo);
    destinazione.append(nuovo);
  }
}

function frammentoSicuro(html) {
  const frammento = document.createDocumentFragment();
  const testo = String(html === null || html === undefined ? '' : html);
  if (!testo) return frammento;

  const inerte = new DOMParser().parseFromString('<!doctype html><body>' + testo, 'text/html');
  copiaAmmessi(inerte.body, frammento);
  return frammento;
}

function serializza(nodo) {
  const scatola = document.createElement('div');
  scatola.append(nodo.cloneNode ? nodo.cloneNode(true) : nodo);
  return scatola.innerHTML;
}

function serializzaFigli(elemento) {
  const scatola = document.createElement('div');
  for (const figlio of Array.from(elemento.childNodes)) scatola.append(figlio.cloneNode(true));
  return scatola.innerHTML;
}

function limaBordi(html) {
  return String(html || '')
    .replace(/^(?:\s|<br\s*\/?>)+/i, '')
    .replace(/(?:\s|<br\s*\/?>)+$/i, '');
}

function ripulisci(html) {
  return serializza(frammentoSicuro(html));
}

export function sanifica(html) {
  return limaBordi(ripulisci(html));
}

export function soloTesto(html) {
  const scatola = document.createElement('div');
  scatola.append(frammentoSicuro(html));
  for (const salto of Array.from(scatola.querySelectorAll('br'))) {
    salto.replaceWith(document.createTextNode(' '));
  }
  return unaRiga(scatola.textContent);
}

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

const TESTO_TAG_AMMESSI =
  'Tag ammessi: <b> <strong> <i> <em> <u> <s> <br> <small> <mark> <sup> <sub> <code> ' +
  '<abbr title> <span class="evidenza|tenue|mono"> <a href title>. Tutto il resto viene tolto.';

export function creaCampoRicco(campo, accesso, ctx) {
  const parti = guscio(campo, { ...(ctx.opzioni || {}), perInput: false });
  const limite = Number(campo.max) > 0 ? Number(campo.max) : null;

  const idArea = parti.idCampo;
  const idNota = idArea + '-nota';
  const idSorgente = idArea + '-src';

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

  const sorgente = el('textarea', {
    id: idSorgente,
    classe: 'ricco__sorgente campo__area',
    hidden: true,
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-labelledby': parti.idEtichetta,
    'aria-describedby': idNota
  });

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

  const scriviDalDocumento = () => {
    const html = sanifica(serializzaFigli(area));
    accesso.scrivi(html);
    aggiornaContatore(soloTesto(html));
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, html) || '');
    ctx.modificato();
  };

  const scriviDalSorgente = () => {
    const grezzo = sorgente.value;
    accesso.scrivi(grezzo);
    aggiornaContatore(soloTesto(grezzo));
    const ripulito = sanifica(grezzo);
    const cambia = ripulito !== limaBordi(grezzo);
    avvisoPulizia.hidden = !cambia;
    if (cambia) {
      avvisoPulizia.textContent = 'C\'è qualcosa fuori lista: torna all\'editor e viene tolto, ' +
        'ma se salvi così il server rifiuta tutto il documento. ' + TESTO_TAG_AMMESSI;
    }
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, grezzo) || '');
    ctx.modificato();
  };

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

  const esegui = (comando, valoreComando = null) => {
    area.focus();
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(comando, false, valoreComando);
    } catch {}
    scriviDalDocumento();
    aggiornaStatoBarra();
  };

  const inserisci = (html) => {
    const pulito = ripulisci(html);
    if (!pulito) return;
    area.focus();

    let fatto = false;
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

    const dove = selezione();
    const ultimo = area.lastChild;
    if (!dove || !ultimo || ultimo.nodeName !== 'BR') return;
    const resto = document.createRange();
    resto.selectNodeContents(area);
    resto.setStart(dove.range.endContainer, dove.range.endOffset);
    if (resto.toString() === '') area.append(document.createElement('br'));
  };

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
      erroreLink.textContent = 'Indirizzo non valido: ci vuole https:// con almeno il nome del sito, ' +
        'oppure mailto: con un\'email completa (nome@dominio.it), oppure un percorso di questo sito ' +
        'con la barra normale /.';
      erroreLink.hidden = false;
      campoLink.focus();
      return;
    }
    ripristinaSelezione();

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

    inserisci('<a href="' + escapeAttributo(indirizzo) + '">' + (dentro || escapeAttributo(indirizzo)) + '</a>');
    chiudiLink();
    area.focus();
  }

  campoLink.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); applicaLink(); }
    if (ev.key === 'Escape') { ev.preventDefault(); chiudiLink(); area.focus(); }
  });

  const comandi = [];

  const cmd = ({ glifo, nome, titolo, classe = '', azione, stato = null }) => {
    const nodo = el('button', {
      type: 'button',
      classe: 'ricco__cmd ' + classe,
      title: titolo || nome,
      tabindex: '-1',
      su: {
        click: (ev) => { ev.preventDefault(); azione(); },
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

  function aggiornaStatoBarra() {
    for (const c of comandi) {
      if (!c.stato) continue;
      let acceso = false;
      try { acceso = document.queryCommandState(c.stato); } catch { acceso = false; }
      c.nodo.setAttribute('aria-pressed', String(acceso));
      c.nodo.classList.toggle('is-attivo', acceso);
    }
  }

  const suSelezione = () => {
    if (!area.isConnected) {
      document.removeEventListener('selectionchange', suSelezione);
      return;
    }
    if (document.activeElement === area) aggiornaStatoBarra();
  };
  document.addEventListener('selectionchange', suSelezione);

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
    for (const c of comandi) {
      if (c.nodo !== btnCodice) c.nodo.disabled = versoCodice;
    }
    parti.nodo.classList.toggle('is-codice', versoCodice);
  }

  area.addEventListener('input', scriviDalDocumento);
  sorgente.addEventListener('input', scriviDalSorgente);

  area.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const tasto = ev.key.toLowerCase();
      if (tasto === 'b') { ev.preventDefault(); esegui('bold'); return; }
      if (tasto === 'i') { ev.preventDefault(); esegui('italic'); return; }
      if (tasto === 'u') { ev.preventDefault(); esegui('underline'); return; }
      if (tasto === 'k') { ev.preventDefault(); apriLink(); return; }
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      aCapo();
    }
  });

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
    ev.preventDefault();
    area.focus();
    incollaDa(ev.dataTransfer);
  });

  area.addEventListener('blur', () => {
    if (rigaLink.hidden) {
      const grezzo = serializzaFigli(area);
      const pulito = sanifica(grezzo);
      if (pulito !== limaBordi(grezzo)) rendi(pulito);
    }
    controllo.mostraErrore(erroreLocale(campo, valore()) || '');
    aggiornaStatoBarra();
  });

  parti.etichetta.addEventListener('click', () => {
    if (inCodice) sorgente.focus(); else area.focus();
  });

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
