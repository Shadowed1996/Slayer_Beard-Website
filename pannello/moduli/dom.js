export function el(tag, attributi = {}, figli = []) {
  const nodo = document.createElement(tag);

  for (const [nome, valore] of Object.entries(attributi)) {
    if (valore === null || valore === undefined || valore === false) continue;
    if (nome === 'classe') nodo.className = valore;
    else if (nome === 'testo') nodo.textContent = valore;
    else if (nome === 'su') for (const [evento, fn] of Object.entries(valore)) nodo.addEventListener(evento, fn);
    else if (nome === 'dati') for (const [k, v] of Object.entries(valore)) nodo.dataset[k] = v;
    else if (valore === true) nodo.setAttribute(nome, '');
    else nodo.setAttribute(nome, String(valore));
  }

  for (const figlio of [].concat(figli)) {
    if (figlio === null || figlio === undefined || figlio === false) continue;
    nodo.append(typeof figlio === 'string' ? document.createTextNode(figlio) : figlio);
  }
  return nodo;
}

export function icona(nome, classe = 'ico') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const uso = document.createElementNS(NS, 'use');
  uso.setAttribute('href', '#i-' + nome);
  svg.append(uso);
  return svg;
}

export function bottone({ testo, ico, classe = 'btn', titolo, su, tipo = 'button', soloIcona = false, disabilitato = false, dati = null }) {
  const nodo = el('button', {
    type: tipo,
    classe: classe + (soloIcona ? ' btn--solo-icona' : ''),
    title: titolo || (soloIcona ? testo : null),
    disabled: disabilitato,
    dati
  });
  if (ico) nodo.append(icona(ico));
  if (testo) nodo.append(el('span', { classe: soloIcona ? 'sr-only' : '', testo }));
  if (su) nodo.addEventListener('click', su);
  return nodo;
}

export function svuota(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  return nodo;
}

let contatoreId = 0;
export function idUnico(prefisso = 'x') {
  contatoreId += 1;
  return prefisso + '-' + contatoreId.toString(36);
}

const PREFISSO_PREFERENZE = 'sb-pannello-';

export function leggiPreferenza(nome, predefinito = null) {
  try {
    const valore = localStorage.getItem(PREFISSO_PREFERENZE + nome);
    return valore === null ? predefinito : valore;
  } catch {
    return predefinito;
  }
}

export function scriviPreferenza(nome, valore) {
  try {
    if (valore === null || valore === undefined) localStorage.removeItem(PREFISSO_PREFERENZE + nome);
    else localStorage.setItem(PREFISSO_PREFERENZE + nome, String(valore));
  } catch {}
}

export function menoMovimento() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const FORMATO_DATA = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

export function aData(valore) {
  if (valore instanceof Date) return valore;
  if (typeof valore === 'number') return new Date(valore);
  const testo = String(valore || '').trim();
  if (!testo) return null;

  let data = new Date(testo);
  if (!Number.isNaN(data.getTime())) return data;

  const rimesso = testo
    .replace(/^(\d{4}-\d{2}-\d{2})[T_ ](\d{2})[-.](\d{2})[-.](\d{2})(?:[-.](\d{1,3}))?(Z)?$/,
      (_t, giorno, ore, minuti, secondi, ms, zulu) =>
        giorno + 'T' + ore + ':' + minuti + ':' + secondi + (ms ? '.' + ms : '') + (zulu || 'Z'));
  data = new Date(rimesso);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function formattaData(valore) {
  const data = aData(valore);
  return data ? FORMATO_DATA.format(data) : String(valore || 'data sconosciuta');
}

export function tempoFa(valore) {
  const data = aData(valore);
  if (!data) return '';
  const secondi = Math.round((Date.now() - data.getTime()) / 1000);
  if (secondi < 45) return 'pochi secondi fa';
  const scale = [
    [60, 'secondo', 'secondi'],
    [60, 'minuto', 'minuti'],
    [24, 'ora', 'ore'],
    [7, 'giorno', 'giorni'],
    [4.35, 'settimana', 'settimane'],
    [12, 'mese', 'mesi']
  ];
  let quantita = secondi;
  let etichetta = ['secondo', 'secondi'];
  for (const [passo, uno, molti] of scale) {
    if (quantita < passo) { etichetta = [uno, molti]; break; }
    quantita = quantita / passo;
    etichetta = [uno, molti];
  }
  const n = Math.round(quantita);
  return n + ' ' + (n === 1 ? etichetta[0] : etichetta[1]) + ' fa';
}

export function formattaPeso(byte) {
  const n = Number(byte);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' kB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

export async function copiaTesto(testo) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(testo);
      return true;
    }
  } catch {}

  try {
    const area = el('textarea', { value: testo, 'aria-hidden': 'true', tabindex: '-1' });
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(area);
    area.select();
    const fatto = document.execCommand('copy');
    area.remove();
    return fatto;
  } catch {
    return false;
  }
}

export function urlRisorsa(percorso) {
  const v = String(percorso || '').trim();
  if (!v) return '';
  if (/^(https?:)?\/\//i.test(v) || v.startsWith('data:') || v.startsWith('/')) return v;
  return '/' + v.replace(/^\.\//, '');
}
