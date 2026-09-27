import { el, bottone } from './dom.js';

function componenti(colore) {
  const testo = String(colore || '').trim().toLowerCase();
  if (!testo) return null;

  const esa = testo.replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/.test(esa)) {
    return [0, 1, 2].map((i) => parseInt(esa[i] + esa[i], 16));
  }
  if (/^[0-9a-f]{6}$/.test(esa) || /^[0-9a-f]{8}$/.test(esa)) {
    return [0, 2, 4].map((i) => parseInt(esa.slice(i, i + 2), 16));
  }

  const rgb = testo.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const pezzi = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (pezzi.length === 3 && pezzi.every((n) => Number.isFinite(n))) {
      return pezzi.map((n) => Math.min(255, Math.max(0, Math.round(n))));
    }
  }
  return null;
}

function canale(valore) {
  const s = valore / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminanza(rgb) {
  return 0.2126 * canale(rgb[0]) + 0.7152 * canale(rgb[1]) + 0.0722 * canale(rgb[2]);
}

export function contrasto(coloreA, coloreB) {
  const a = componenti(coloreA);
  const b = componenti(coloreB);
  if (!a || !b) return 1;

  const la = luminanza(a);
  const lb = luminanza(b);
  const chiaro = Math.max(la, lb);
  const scuro = Math.min(la, lb);
  return Math.round(((chiaro + 0.05) / (scuro + 0.05)) * 100) / 100;
}

function conVirgola(n) {
  return n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

export function etichettaContrasto(rapporto) {
  const n = Number(rapporto);
  if (!Number.isFinite(n) || n <= 0) {
    return { livello: '—', testo: 'Contrasto non calcolabile: controlla che il colore sia scritto come #8b2fff.', grave: true };
  }
  const misura = conVirgola(n) + ':1';
  if (n >= 7) {
    return { livello: 'AAA', testo: 'Contrasto ' + misura + ' — AAA: si legge bene a qualsiasi misura.', grave: false };
  }
  if (n >= 4.5) {
    return { livello: 'AA', testo: 'Contrasto ' + misura + ' — AA: va bene anche per il testo piccolo.', grave: false };
  }
  if (n >= 3) {
    return {
      livello: 'solo testo grande',
      testo: 'Contrasto ' + misura + ' — basta solo per il testo grande (da 24px, o 19px in grassetto). Sotto 4,5:1 il testo normale si legge male.',
      grave: true
    };
  }
  return { livello: 'insufficiente', testo: 'Contrasto ' + misura + ' — sotto 3:1 non si legge più niente, nemmeno in grande.', grave: true };
}

const GENERICI = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif', 'inherit', 'initial'
]);

const famiglieCaricate = new Set();

function nomeFamiglia(voce) {
  if (voce && typeof voce === 'object') return String(voce.nome || voce.famiglia || voce.valore || '').trim();
  return String(voce || '').trim();
}

function daGoogle(voce) {
  const nome = nomeFamiglia(voce);
  if (!nome || nome.includes(',')) return false;
  if (GENERICI.has(nome.toLowerCase())) return false;
  if (voce && typeof voce === 'object') {
    if (voce.google === false || voce.sistema === true) return false;
    if (String(voce.categoria || '').toLowerCase() === 'sistema') return false;
  }
  return true;
}

export function precaricaFont(nomi) {
  const famiglie = [].concat(nomi || [])
    .filter(daGoogle)
    .map(nomeFamiglia)
    .filter((nome, indice, tutte) => tutte.indexOf(nome) === indice && !famiglieCaricate.has(nome));

  if (!famiglie.length) return Promise.resolve(true);
  for (const nome of famiglie) famiglieCaricate.add(nome);

  const query = famiglie.map((nome) => 'family=' + encodeURIComponent(nome).replace(/%20/g, '+')).join('&');
  const collegamento = el('link', {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?' + query + '&display=swap',
    dati: { anteprimaFont: '1' }
  });

  return new Promise((risolvi) => {
    collegamento.addEventListener('load', () => risolvi(true), { once: true });
    collegamento.addEventListener('error', () => risolvi(false), { once: true });
    document.head.append(collegamento);
    setTimeout(() => risolvi(false), 5000);
  });
}

const RE_ID_CARICATO = /^[0-9a-f]{16}$/;
const RE_FILE_CARICATO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(woff2|woff|ttf|otf)$/i;
const ID_FOGLIO_CARICATI = 'sb-font-caricati';

let elencoCaricati = null;
const iscrittiCaricati = new Set();

export function famigliaCaricato(id) {
  return "'sb-" + String(id || '').replace(/[^0-9a-f]/g, '') + "'";
}

function nomeFileCaricato(voce) {
  const grezzo = String((voce && voce.file) || '').replace(/\\/g, '/');
  const nome = grezzo.split('/').pop();
  return RE_FILE_CARICATO.test(nome) && !nome.includes('..') ? nome : '';
}

export function urlFontCaricato(voce) {
  const nome = nomeFileCaricato(voce);
  return nome ? '/contenuti/font/' + encodeURIComponent(nome) : '';
}

export function formatoCss(voce) {
  const dichiarato = String((voce && voce.formato) || '').toLowerCase();
  const estensione = (nomeFileCaricato(voce).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
  const grezzo = dichiarato || estensione.toLowerCase();
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', truetype: 'truetype', otf: 'opentype', opentype: 'opentype' }[grezzo] || '';
}

function pulisciCaricati(elenco) {
  const visti = new Set();
  const fuori = [];
  for (const voce of [].concat(elenco || [])) {
    if (!voce || typeof voce !== 'object') continue;
    const id = String(voce.id || '');
    if (!RE_ID_CARICATO.test(id) || visti.has(id) || !nomeFileCaricato(voce)) continue;
    visti.add(id);
    fuori.push({
      ...voce,
      id,
      etichetta: String(voce.etichetta || '').trim() || 'Font ' + id.slice(0, 6),
      usatoIn: Array.isArray(voce.usatoIn) ? voce.usatoIn.map(String) : []
    });
  }
  return fuori;
}

function copiaCaricati() {
  return elencoCaricati ? elencoCaricati.map((voce) => ({ ...voce, usatoIn: voce.usatoIn.slice() })) : null;
}

function scriviFoglioCaricati() {
  let foglio = document.getElementById(ID_FOGLIO_CARICATI);
  if (!foglio) {
    foglio = el('style', { id: ID_FOGLIO_CARICATI });
    document.head.append(foglio);
  }
  const regole = (elencoCaricati || []).map((voce) => {
    const formato = formatoCss(voce);
    return '@font-face { font-family: ' + famigliaCaricato(voce.id) + '; src: url(\'' + urlFontCaricato(voce) + '\')' +
      (formato ? ' format(\'' + formato + '\')' : '') + '; font-display: swap; }';
  });
  const testo = regole.join('\n');
  if (foglio.textContent !== testo) foglio.textContent = testo;
}

export function impostaFontCaricati(elenco) {
  elencoCaricati = pulisciCaricati(elenco);
  scriviFoglioCaricati();
  for (const fn of Array.from(iscrittiCaricati)) {
    try { fn(copiaCaricati()); } catch {}
  }
}

export function fontCaricati() {
  return copiaCaricati();
}

export function suFontCaricati(fn) {
  if (typeof fn !== 'function') return () => {};
  iscrittiCaricati.add(fn);
  return () => iscrittiCaricati.delete(fn);
}

const ORDINE_CAMPIONI = ['viola', 'ciano', 'magenta', 'fondo', 'testo'];

function clonaTema(tema) {
  if (typeof structuredClone === 'function') return structuredClone(tema);
  return JSON.parse(JSON.stringify(tema));
}

let fotografiaIniziale = null;

const CAMPI_COMPLESSI = '.elenco, .righe, .orari, .ricco, .immagine';

function valoreDalCampo(nodo) {
  if (nodo.querySelector(CAMPI_COMPLESSI)) return undefined;

  const leva = nodo.querySelector('[role="switch"]');
  if (leva) return leva.getAttribute('aria-checked') === 'true';

  const esa = nodo.querySelector('.colore__esa');
  if (esa) return esa.value;

  const scelta = nodo.querySelector('select');
  if (scelta) return scelta.value;

  const numero = nodo.querySelector('input[type="number"]');
  if (numero) return numero.value === '' ? '' : Number(numero.value);

  const semplice = nodo.querySelector('input, textarea');
  return semplice ? semplice.value : undefined;
}

function prefissoComune(chiavi) {
  if (!chiavi.length) return '';
  let comune = chiavi[0].split('.');
  for (const chiave of chiavi.slice(1)) {
    const pezzi = chiave.split('.');
    let quanti = 0;
    while (quanti < comune.length && quanti < pezzi.length && comune[quanti] === pezzi[quanti]) quanti += 1;
    comune = comune.slice(0, quanti);
  }
  if (comune.join('.') === chiavi[0]) comune.pop();
  return comune.join('.');
}

function annida(mappa) {
  const chiavi = Object.keys(mappa);
  const prefisso = prefissoComune(chiavi);
  const radice = {};
  for (const chiave of chiavi) {
    const passi = (prefisso ? chiave.slice(prefisso.length + 1) : chiave).split('.');
    let nodo = radice;
    while (passi.length > 1) {
      const passo = passi.shift();
      if (!nodo[passo] || typeof nodo[passo] !== 'object') nodo[passo] = {};
      nodo = nodo[passo];
    }
    nodo[passi[0]] = mappa[chiave];
  }
  return radice;
}

function scattaFotografia(barra) {
  const contenitore = barra.parentElement;
  if (!contenitore) return null;

  const mappa = {};
  for (const nodo of Array.from(contenitore.children)) {
    if (!(nodo instanceof HTMLElement)) continue;
    if (!nodo.classList.contains('campo') || !nodo.dataset.chiave) continue;
    const valore = valoreDalCampo(nodo);
    if (valore !== undefined) mappa[nodo.dataset.chiave] = valore;
  }
  return Object.keys(mappa).length ? annida(mappa) : null;
}

function campioni(tema) {
  const colori = (tema && tema.colori) || {};
  const scelti = [];
  for (const nome of ORDINE_CAMPIONI) {
    if (componenti(colori[nome])) scelti.push(colori[nome]);
  }
  if (!scelti.length) {
    for (const valore of Object.values(colori)) {
      if (componenti(valore) && scelti.length < 5) scelti.push(valore);
    }
  }
  const riga = el('span', { classe: 'preset__campioni', 'aria-hidden': 'true' });
  for (const colore of scelti) {
    const punto = el('span', { classe: 'preset__campione' });
    punto.style.background = colore;
    riga.append(punto);
  }
  return riga;
}

export function creaBarraTema(ctx, { preset, onApplica, predefinito, temaIniziale, onRipristina } = {}) {
  const elenco = Array.isArray(preset) ? preset.filter((p) => p && p.tema) : [];
  const applica = typeof onApplica === 'function' ? onApplica : () => {};

  const griglia = el('div', { classe: 'preset__griglia', role: 'group', 'aria-label': 'Combinazioni pronte' });

  for (const voce of elenco) {
    const nome = String(voce.nome || voce.id || 'Combinazione');
    const colori = (voce.tema && voce.tema.colori) || {};

    const bottoneVoce = el('button', {
      type: 'button',
      classe: 'preset',
      title: voce.descrizione ? String(voce.descrizione) : 'Applica «' + nome + '» a tutto il gruppo Aspetto',
      dati: { preset: String(voce.id || nome) },
      su: {
        click: () => applica(clonaTema(voce.tema), { id: voce.id, nome, ripristino: false })
      }
    }, [
      campioni(voce.tema),
      el('span', { classe: 'preset__nome', testo: nome })
    ]);

    if (componenti(colori.fondo)) bottoneVoce.style.background = colori.fondo;
    if (componenti(colori.testo)) bottoneVoce.style.color = colori.testo;
    if (componenti(colori.viola)) bottoneVoce.style.borderColor = colori.viola;

    griglia.append(bottoneVoce);
  }

  if (!elenco.length) {
    griglia.append(el('p', { classe: 'preset__vuoto', testo: 'Il server non ha mandato combinazioni pronte: i colori si scelgono uno per uno qui sotto.' }));
  }

  const dichiarato = predefinito || temaIniziale ||
    (ctx && ctx.tema && ctx.tema.predefinito) ||
    (elenco.find((p) => p.predefinito === true || p.id === 'predefinito' || p.id === 'partenza') || {}).tema || null;

  const daRipristinare = () => dichiarato || fotografiaIniziale;

  const verso = dichiarato
    ? 'Colori, font e forma tornano quelli di partenza del sito.'
    : 'Tutte le modifiche fatte all\'aspetto tornano com\'erano quando hai aperto il pannello.';

  const btnRipristina = bottone({
    testo: 'Ripristina i colori di partenza',
    ico: 'ricarica',
    classe: 'btn btn--fantasma',
    disabilitato: true,
    titolo: dichiarato ? 'Rimette colori, font e forma di partenza del sito.' : 'Rimette i colori e i font com\'erano prima delle tue prove.',
    su: async () => {
      const partenza = daRipristinare();
      if (typeof onRipristina !== 'function' && !partenza) return;
      if (typeof ctx?.conferma === 'function') {
        const ok = await ctx.conferma({
          titolo: 'Rimetto i colori di partenza?',
          testo: [
            verso,
            'Cambia solo la bozza: il sito pubblicato resta quello finché non premi Pubblica.'
          ],
          conferma: 'Ripristina'
        });
        if (!ok) return;
      }
      if (typeof onRipristina === 'function') onRipristina();
      else applica(clonaTema(partenza), { id: 'predefinito', nome: 'Colori di partenza', ripristino: true });
    }
  });

  const nodo = el('div', { classe: 'tema-barra' }, [
    el('div', { classe: 'tema-barra__testa' }, [
      el('p', { classe: 'occhiello', testo: 'Combinazioni pronte' }),
      el('p', {
        classe: 'tema-barra__nota',
        testo: 'Un clic riscrive tutti i colori e i font qui sotto. Puoi sempre correggerli a mano dopo, e niente va online finché non pubblichi.'
      })
    ]),
    griglia,
    el('div', { classe: 'tema-barra__azioni' }, [btnRipristina])
  ]);

  queueMicrotask(() => {
    if (!fotografiaIniziale && !dichiarato) fotografiaIniziale = scattaFotografia(nodo);
    const partenza = daRipristinare();
    btnRipristina.disabled = typeof onRipristina !== 'function' && !partenza;
    if (btnRipristina.disabled) {
      btnRipristina.title = 'Non so a quali colori tornare: il server non ha mandato un tema di partenza.';
    }
  });

  return nodo;
}
