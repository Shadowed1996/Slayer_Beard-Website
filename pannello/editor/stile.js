/* =====================================================================
   stile.js — le schede «Stile» e «Avanzate» dell'editor (CONTRATTO-4 §11.2).

   Cambia l'aspetto dell'elemento scelto nell'anteprima, un dispositivo
   alla volta: sempre quello della barra in alto. Computer è la base;
   Tablet e Telefono sovrascrivono con la stessa cascata del CSS che esce
   da condivisi/stili.js (telefono ← tablet ← computer). «Nascosto» ha la
   stessa eredità ma esce a fasce esclusive: su Tablet o Telefono `false`
   fa ricomparire quello che un dispositivo più grande nasconde.

   Dati: config.stili[bersaglio][dispositivo][proprietà], con bersaglio =
   meta.id del motore (testo:… immagine:… parte:… blocco:… sezione:…). Si
   modifica l'oggetto sul posto e lo si dice con ponte.segnala una volta
   per fotogramma: duecento eventi di un cursore fanno un solo giro di
   anteprima e una sola istantanea di Annulla.

   Quello che decide condivisi/stili.js non si ripete qui: ogni valore
   passa da SBStili.pulisciValore; min, max, passo, unità, etichette delle
   scelte e «a quali elementi ha senso» vengono da SBStili.PROPRIETA. Così
   la scheda non può offrire un numero che il generatore poi stringe, né
   una scelta che il generatore non conosce.

   Il renderer non svuota il contenitore che gli dà il motore: ci mette (o
   sostituisce) il proprio div.stile e ridisegna solo quello.

   Indice
     1. Avvio: foglio di stile, moduli facoltativi
     2. Vocabolario
     3. Dati: lettura, eredità, scrittura, pulizia
     4. Invio all'anteprima, una volta per fotogramma
     5. Valori «come nel sito» e descrizioni
     6. Pezzi dell'interfaccia
     7. Scheda Stile
     8. Scheda Avanzate
     9. Disegno, ridisegno, eventi, registrazione
   ===================================================================== */

import { ponte } from './ponte.js';
import { motore } from './motore.js';
import { el, icona, svuota, idUnico, urlRisorsa } from '../moduli/dom.js';

/* =====================================================================
   1. AVVIO
   ===================================================================== */

/* Il foglio della scheda arriva con la scheda: se GUSCIO l'ha già messo in
   index.html non si aggiunge una seconda volta. */
(function collegaFoglio() {
  const gia = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => /(^|\/)editor\/stile\.css([?#]|$)/.test(link.getAttribute('href') || ''));
  if (gia) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./stile.css', import.meta.url).href;
  document.head.append(link);
})();

/* I controlli di colore e font sono di TEMA (impostazioni.js). Si prendono
   con import() dinamico: se quel modulo manca o si rompe, la scheda resta
   in piedi con i controlli di ripiego qui sotto, e appena arriva si
   ridisegna con quelli veri. */
let tema = null;
/* Cresce quando arriva TEMA: una scheda disegnata prima ha i controlli di
   ripiego e va rifatta, non solo risincronizzata. */
let versioneTema = 0;
import('./impostazioni.js')
  .then((modulo) => {
    tema = modulo;
    versioneTema += 1;
    if (typeof modulo.caricaFont === 'function') {
      // voceFont risponde dalla cache: senza questa lettura un font caricato
      // scelto per primo verrebbe scartato dalla pulizia.
      Promise.resolve(modulo.caricaFont()).catch(() => null);
    }
    ridisegnaTutti();
  })
  .catch(() => { tema = null; });

function sb() {
  const S = window.SBStili;
  return S && typeof S.pulisciValore === 'function' ? S : null;
}

function avverti(errore) {
  if (window.console && window.console.warn) window.console.warn('[stile]', errore);
}

/* =====================================================================
   2. VOCABOLARIO
   ===================================================================== */

const DISPOSITIVI = ['computer', 'tablet', 'telefono'];
const ORDINE_BARRA = ['telefono', 'tablet', 'computer'];       // come la barra in alto
const NOME = { computer: 'Computer', tablet: 'Tablet', telefono: 'Telefono' };
/* Da chi eredita ogni dispositivo, dal più vicino al più lontano. */
const CATENA = { computer: [], tablet: ['computer'], telefono: ['tablet', 'computer'] };

const LATI = ['sopra', 'destra', 'sotto', 'sinistra'];
const NOME_LATO = { sopra: 'sopra', destra: 'a destra', sotto: 'sotto', sinistra: 'a sinistra' };
const LATO_CSS = { sopra: 'Top', destra: 'Right', sotto: 'Bottom', sinistra: 'Left' };

/* Il peso in numeri non dice niente a chi non lavora con i font. */
const NOMI_PESO = {
  100: 'sottilissimo', 200: 'molto sottile', 300: 'sottile', 400: 'normale', 500: 'medio',
  600: 'semigrassetto', 700: 'grassetto', 800: 'molto grassetto', 900: 'nerissimo'
};

/* Quando il sito non ha un numero («normal», «none»): cosa scrivere nella
   casella vuota e dove lasciare il cursore. */
const SENZA_NUMERO = {
  interlinea: { testo: 'normale', a: 1.2 },
  larghezzaMax: { testo: 'nessuna', a: 'max' }
};

/* Le proprietà che il player non può avere le decide condivisi/stili.js
   (VIETATE_AI_PROTETTI): la riga le nomina con le etichette del generatore,
   così resta vera anche se l'elenco cambia. */
function testoProtetto() {
  const nomi = vietateAiProtetti().map((nome) => '«' + (NOME_CONTROLLO[nome] || etichettaDi(nome)) + '»');
  const elenco = nomi.length > 1 ? nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1] : nomi.join('');
  return 'Qui dentro c\'è il player di Twitch. Le regole di Twitch per i player incorporati vietano di nasconderlo, ' +
    'renderlo trasparente o rimpicciolirlo: per questo ' + elenco + ' su questo elemento non ci sono.';
}

/* Dove la scheda chiama un controllo con un nome diverso dall'etichetta del
   generatore: «Nascosto» descrive lo stato, il comando si chiama «Nascondi». */
const NOME_CONTROLLO = { nascosto: 'Nascondi' };

const NOTA_MARGINE_PROTETTO = 'Sul player lo spazio esterno parte da 0 e quello interno arriva al massimo a 40 px: oltre, il player finirebbe sotto un\'altra sezione o sotto la misura che Twitch chiede.';

/* Disegni a tratto per quello che lo sprite del pannello non ha. Si
   costruiscono con createElementNS: nessun markup da stringa. */
const NS = 'http://www.w3.org/2000/svg';
const GLIFI = {
  telefono: 'M8 3h8v18H8z M11 18h2',
  tablet: 'M5.5 3h13v18h-13z M11 18h2',
  computer: 'M3 4.5h18v11H3z M8 20h8 M12 15.5V20',
  sinistra: 'M4 6h16 M4 10h10 M4 14h16 M4 18h10',
  centro: 'M4 6h16 M7 10h10 M4 14h16 M7 18h10',
  destra: 'M4 6h16 M10 10h10 M4 14h16 M10 18h10',
  giustificato: 'M4 6h16 M4 10h16 M4 14h16 M4 18h16',
  chiuso: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  aperto: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 7.6-1.8'
};

function glifo(nome, lato = 16) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(lato));
  svg.setAttribute('height', String(lato));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'stile__glifo');
  const tratto = document.createElementNS(NS, 'path');
  tratto.setAttribute('d', GLIFI[nome] || '');
  tratto.setAttribute('fill', 'none');
  tratto.setAttribute('stroke', 'currentColor');
  tratto.setAttribute('stroke-width', '1.8');
  tratto.setAttribute('stroke-linecap', 'round');
  tratto.setAttribute('stroke-linejoin', 'round');
  svg.append(tratto);
  return svg;
}

function oggetto(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function propria(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function stringi(n, min, max) { return Math.min(max, Math.max(min, n)); }
function arrotonda(n, decimali) {
  const k = Math.pow(10, decimali || 0);
  const r = Math.round(n * k) / k;
  return r === 0 ? 0 : r;
}
function numeroIt(n) { return String(n).replace('.', ','); }
function impronta(v) { return JSON.stringify(v === undefined ? null : v); }
function decimaliDi(passo) {
  const testo = String(passo);
  return testo.indexOf('.') === -1 ? 0 : testo.length - testo.indexOf('.') - 1;
}

/** La voce di SBStili.PROPRIETA per quel nome, o null. */
function definizione(nome) {
  const S = sb();
  if (!S || !Array.isArray(S.PROPRIETA)) return null;
  return S.PROPRIETA.find((d) => d && d.nome === nome) || null;
}

/** min, max, passo e decimali di un controllo numerico (per unità, se è una misura). */
function limiti(nome, unita) {
  const d = definizione(nome) || {};
  const base = d.tipo === 'misura' && d.unita && unita ? (d.unita[unita] || {}) : d;
  const passo = typeof base.passo === 'number' && base.passo > 0 ? base.passo : 1;
  return {
    min: typeof base.min === 'number' ? base.min : 0,
    max: typeof base.max === 'number' ? base.max : 100,
    passo,
    // Il cursore si muove a passi: scrivere più decimali del passo darebbe
    // numeri come 1,2000000001. Dalla casella si arriva fino ai decimali
    // che il generatore tiene.
    decimali: typeof base.decimali === 'number' ? base.decimali : decimaliDi(passo),
    decimaliPasso: decimaliDi(passo)
  };
}

/** Le scelte di una proprietà `scelta` o `interruttore`, dal generatore. */
function scelteDi(nome) {
  const d = definizione(nome);
  return d && Array.isArray(d.valori) ? d.valori : [];
}

/* =====================================================================
   3. DATI
   ===================================================================== */

/* Si rilegge tutto a ogni uso: dopo Annulla, Ripeti o un ripristino
   `ponte.stato.dati` è un oggetto nuovo, e un riferimento tenuto da prima
   scriverebbe su dati che non esistono più. */
function stiliTutti() {
  return oggetto(ponte.leggi('config.stili'));
}

function voceDi(bersaglio) {
  const s = stiliTutti();
  return s && oggetto(s[bersaglio]) ? s[bersaglio] : null;
}

function valoriDi(bersaglio, dispositivo) {
  const v = voceDi(bersaglio);
  return v && oggetto(v[dispositivo]) ? v[dispositivo] : null;
}

function proprio(bersaglio, dispositivo, nome) {
  const o = valoriDi(bersaglio, dispositivo);
  return o && propria(o, nome) && o[nome] !== null && o[nome] !== undefined ? o[nome] : undefined;
}

/* Il valore che arriva dai dispositivi più grandi (non da questo). Con
   `lato` si cerca il singolo lato di riempimento o margine: il generatore
   li scrive uno per uno, quindi anche l'eredità va lato per lato. */
function ereditato(bersaglio, dispositivo, nome, lato) {
  for (const sopra of CATENA[dispositivo] || []) {
    const v = proprio(bersaglio, sopra, nome);
    if (v === undefined) continue;
    if (lato) {
      if (oggetto(v) && typeof v[lato] === 'number') return { valore: v[lato], da: sopra };
      continue;
    }
    return { valore: v, da: sopra };
  }
  return null;
}

function haValori(bersaglio, dispositivo) {
  const o = valoriDi(bersaglio, dispositivo);
  return Boolean(o && Object.keys(o).length);
}

/* Niente {} orfani: via i dispositivi vuoti e il bersaglio vuoto. */
function pota(bersaglio) {
  const s = stiliTutti();
  if (!s || !oggetto(s[bersaglio])) return;
  const voce = s[bersaglio];
  for (const d of Object.keys(voce)) {
    if (!oggetto(voce[d]) || !Object.keys(voce[d]).length) delete voce[d];
  }
  if (!Object.keys(voce).length) delete s[bersaglio];
}

function dispositivoCorrente() {
  let d = null;
  try { d = typeof motore.dispositivo === 'function' ? motore.dispositivo() : null; } catch (e) { d = null; }
  return DISPOSITIVI.includes(d) ? d : 'computer';
}

/* Le funzioni che dicono al generatore quali famiglie e quali font
   caricati esistono. Senza TEMA si passa niente: il generatore tiene i
   valori di forma giusta invece di scartarli. */
function opzioniPulizia() {
  if (tema && typeof tema.voceFamiglia === 'function' && typeof tema.voceFont === 'function') {
    return { famiglia: tema.voceFamiglia, font: tema.voceFont };
  }
  return {};
}

/**
 * Scrive (o toglie, con null) una proprietà sul dispositivo del contesto.
 * Torna true se adesso i dati contengono quel valore.
 */
function scrivi(ctx, nome, valore) {
  if (!ponte.pronto) return false;
  if (dispositivoCorrente() !== ctx.dispositivo) {
    // Il dispositivo è cambiato sotto la scheda: scrivere adesso vorrebbe
    // dire scrivere su quello sbagliato.
    ridisegnaPresto(ctx);
    return false;
  }
  const { bersaglio, dispositivo } = ctx;

  if (valore === null || valore === undefined) {
    const o = valoriDi(bersaglio, dispositivo);
    if (!o || !propria(o, nome)) return true;
    delete o[nome];
    pota(bersaglio);
    dopoScrittura(ctx, true);
    return true;
  }

  const S = sb();
  if (!S) return false;
  let pulito = null;
  try { pulito = S.pulisciValore(bersaglio, nome, valore, opzioniPulizia()); } catch (e) { pulito = null; }
  if (pulito === null || pulito === undefined) return false;

  const attuale = proprio(bersaglio, dispositivo, nome);
  if (attuale !== undefined && impronta(attuale) === impronta(pulito)) return true;

  let tutti = stiliTutti();
  if (!tutti) {
    // Prima scrittura in assoluto: il ramo non c'è ancora, lo crea il ponte.
    ponte.scrivi('config.stili', {});
    tutti = stiliTutti();
    if (!tutti) return false;
  }
  if (!oggetto(tutti[bersaglio])) tutti[bersaglio] = {};
  if (!oggetto(tutti[bersaglio][dispositivo])) tutti[bersaglio][dispositivo] = {};
  tutti[bersaglio][dispositivo][nome] = pulito;
  dopoScrittura(ctx, false);
  return true;
}

function dopoScrittura(ctx, tolto) {
  const firma = impronta(voceDi(ctx.bersaglio));
  for (const altro of vivi) {
    if (altro.bersaglio !== ctx.bersaglio) continue;
    altro.impronta = firma;
    // L'altra scheda (Stile o Avanzate) dello stesso elemento vede subito
    // il valore nuovo; questa aggiorna solo intestazioni e contatori, i
    // controlli li ha già sistemati chi ha scritto.
    if (altro === ctx) segnaTutto(altro);
    else sincronizzaTutto(altro);
  }
  programmaInvio(tolto ? ctx : null);
}

/* =====================================================================
   4. INVIO ALL'ANTEPRIMA — al massimo una volta per fotogramma
   ===================================================================== */

const invio = { inAttesa: false, giro: 0, fantasmi: new Set() };

function programmaInvio(ctxDaRileggere) {
  if (ctxDaRileggere) invio.fantasmi.add(ctxDaRileggere);
  if (invio.inAttesa) return;
  invio.inAttesa = true;
  invio.giro += 1;
  const giro = invio.giro;
  const esegui = () => {
    if (!invio.inAttesa || giro !== invio.giro) return;
    invio.inAttesa = false;
    try { ponte.segnala('config.stili'); } catch (e) { avverti(e); }
    try { if (typeof motore.aggiornaStili === 'function') motore.aggiornaStili(); } catch (e) { avverti(e); }
    // Dopo aver tolto un valore, «come nel sito» si rilegge solo ora che il
    // CSS dell'anteprima non lo contiene più.
    const daRileggere = Array.from(invio.fantasmi);
    invio.fantasmi.clear();
    for (const c of daRileggere) if (c.radice.isConnected) sincronizzaTutto(c);
  };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(esegui);
  // Con la scheda del browser in secondo piano requestAnimationFrame non
  // arriva: la riserva fa lo stesso lavoro una volta sola.
  setTimeout(esegui, 120);
}

/* =====================================================================
   5. VALORI «COME NEL SITO» E DESCRIZIONI
   ===================================================================== */

function documentoAnteprima() {
  try { return typeof motore.documento === 'function' ? motore.documento() : null; } catch (e) { return null; }
}

/* L'elemento vero nell'anteprima. Dopo una ricarica il nodo del meta è
   staccato: si prende quello nuovo dalla selezione del motore o, se la
   selezione è altrove, il primo elemento con lo stesso marcatore. */
function elementoVivo(ctx) {
  const doc = documentoAnteprima();
  const m = ctx.meta;
  if (m && m.el && m.el.isConnected && (!doc || m.el.ownerDocument === doc)) return m.el;
  try {
    const scelto = typeof motore.selezione === 'function' ? motore.selezione() : null;
    if (scelto && scelto.el && scelto.el.isConnected && bersaglioDi(scelto) === ctx.bersaglio) {
      ctx.meta = scelto;
      return scelto.el;
    }
  } catch (e) { /* si prova col selettore */ }
  const S = sb();
  if (doc && S && ctx.bersaglio) {
    const selettore = S.selettoreDi(ctx.bersaglio);
    if (selettore) return doc.querySelector(selettore);
  }
  return null;
}

function calcolato(ctx) {
  const nodo = elementoVivo(ctx);
  if (!nodo || !nodo.ownerDocument || !nodo.ownerDocument.defaultView) return null;
  try { return nodo.ownerDocument.defaultView.getComputedStyle(nodo); } catch (e) { return null; }
}

function px(testo) { const n = parseFloat(testo); return Number.isFinite(n) ? n : null; }

function rgbInEsa(testo) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(String(testo || '').trim());
  if (!m) return null;
  const alfa = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
  if (!(alfa > 0)) return null;                      // trasparente: nessun colore da dire
  const due = (n) => Math.round(stringi(parseFloat(n), 0, 255)).toString(16).padStart(2, '0');
  return '#' + due(m[1]) + due(m[2]) + due(m[3]);
}

/* I 12 colori del tema con nome e valore attuale della bozza. */
function coloriDelTema() {
  if (tema && typeof tema.coloriTema === 'function') {
    try {
      const elenco = tema.coloriTema();
      if (Array.isArray(elenco) && elenco.length) return elenco.map((c) => ({ chiave: c.chiave, nome: c.nome, esa: c.esa }));
    } catch (e) { avverti(e); }
  }
  const S = sb();
  const chiavi = S && S.COLORI_TEMA ? Object.keys(S.COLORI_TEMA) : [];
  return chiavi.map((chiave) => {
    const percorso = 'config.tema.colori.' + chiave;
    const nome = ponte.etichetta(percorso);
    const esa = ponte.leggi(percorso);
    return { chiave, nome: nome && nome !== percorso ? nome : chiave, esa: typeof esa === 'string' ? esa : '' };
  });
}

/* Il colore calcolato, riportato al colore del tema se coincide: «Ciano»
   dice di più di #22e0ff. */
function coloreComeValore(testoCss) {
  const esa = rgbInEsa(testoCss);
  if (!esa) return null;
  const tema12 = coloriDelTema().find((c) => String(c.esa).toLowerCase() === esa);
  return tema12 ? 'var:' + tema12.chiave : esa;
}

function sceltaDaCss(nome, css) {
  const trovata = scelteDi(nome).find((s) => s.css === css);
  return trovata ? trovata.valore : null;
}

/**
 * Il valore che l'elemento ha adesso nell'anteprima, nella stessa forma dei
 * dati, oppure null. Serve solo come segnaposto: non si scrive mai.
 */
function valoreNelSito(ctx, nome, lato) {
  const cs = calcolato(ctx);
  if (!cs) return null;
  const corpo = px(cs.fontSize) || 16;
  let v;
  switch (nome) {
    case 'dimensione':
      return px(cs.fontSize) === null ? null : { valore: arrotonda(corpo, 1), unita: 'px' };
    case 'peso':
      v = parseInt(cs.fontWeight, 10);
      return Number.isFinite(v) ? stringi(Math.round(v / 100) * 100, 100, 900) : null;
    case 'corsivo':
      return cs.fontStyle !== 'normal';
    case 'maiuscole':
      return sceltaDaCss(nome, cs.textTransform);
    case 'spaziatura':
      if (cs.letterSpacing === 'normal') return 0;
      return px(cs.letterSpacing) === null ? null : arrotonda(px(cs.letterSpacing) / corpo, 2);
    case 'interlinea':
      return cs.lineHeight === 'normal' || px(cs.lineHeight) === null ? null : arrotonda(px(cs.lineHeight) / corpo, 2);
    case 'allineamento': {
      const css = cs.textAlign === 'start' ? 'left' : (cs.textAlign === 'end' ? 'right' : cs.textAlign);
      return sceltaDaCss(nome, css);
    }
    case 'colore': return coloreComeValore(cs.color);
    case 'sfondoColore': return coloreComeValore(cs.backgroundColor);
    case 'bordoColore': return coloreComeValore(cs.borderTopColor);
    case 'sfondoImmagine': {
      const m = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage || '');
      return m ? decodeURIComponent(m[1].split('/').pop()) : null;
    }
    case 'sfondoDimensione': {
      const css = cs.backgroundSize === 'auto auto' ? 'auto' : cs.backgroundSize;
      return sceltaDaCss(nome, css);
    }
    case 'sfondoPosizione': {
      const posizioni = { '50% 50%': 'center', '50% 0%': 'top', '50% 100%': 'bottom', '0% 50%': 'left', '100% 50%': 'right' };
      return sceltaDaCss(nome, posizioni[cs.backgroundPosition] || '');
    }
    case 'riempimento':
    case 'margine':
      v = px(cs[(nome === 'riempimento' ? 'padding' : 'margin') + LATO_CSS[lato]]);
      return v === null ? null : arrotonda(v, 0);
    case 'bordoSpessore': return px(cs.borderTopWidth);
    case 'raggio': return /%$/.test(cs.borderTopLeftRadius) ? null : px(cs.borderTopLeftRadius);
    case 'opacita':
      v = parseFloat(cs.opacity);
      return Number.isFinite(v) ? Math.round(v * 100) : null;
    case 'bagliore':
      return cs.textShadow === 'none' && cs.filter === 'none' ? 'nessuno' : null;
    case 'larghezzaMax':
      if (!cs.maxWidth || cs.maxWidth === 'none') return null;
      v = parseFloat(cs.maxWidth);
      return Number.isFinite(v) ? { valore: arrotonda(v, 0), unita: /%$/.test(cs.maxWidth) ? '%' : 'px' } : null;
    default:
      return null;
  }
}

function nomeColore(valore) {
  if (typeof valore !== 'string') return '';
  if (valore.startsWith('var:')) {
    const c = coloriDelTema().find((x) => x.chiave === valore.slice(4));
    return c ? c.nome : valore.slice(4);
  }
  return valore.toLowerCase();
}

function nomeFont(valore) {
  if (typeof valore !== 'string') return '';
  const [specie, ...resto] = valore.split(':');
  const nome = resto.join(':');
  if (specie === 'ruolo') {
    const percorso = 'config.tema.font.' + nome;
    const etichetta = ponte.etichetta(percorso);
    return etichetta && etichetta !== percorso ? etichetta : 'font «' + nome + '» del sito';
  }
  if (specie === 'famiglia') return nome;
  if (specie === 'caricato') {
    const voce = tema && typeof tema.voceFont === 'function' ? tema.voceFont(nome) : null;
    return voce && voce.etichetta ? voce.etichetta : 'font caricato';
  }
  return valore;
}

/** Un valore dei dati detto a parole, per «da Computer: …» e i segnaposto. */
function descrivi(nome, valore) {
  const d = definizione(nome);
  if (!d || valore === undefined || valore === null) return '';
  switch (d.tipo) {
    case 'colore': return nomeColore(valore);
    case 'immagine': return valore === 'nessuna' ? 'nessuna immagine' : String(valore).split('/').pop();
    case 'scelta':
    case 'interruttore': {
      const s = scelteDi(nome).find((x) => x.valore === valore);
      return s ? s.etichetta : String(valore);
    }
    case 'font': return nomeFont(valore);
    case 'misura': return oggetto(valore) ? numeroIt(valore.valore) + ' ' + valore.unita : '';
    case 'numero':
      if (nome === 'peso') return valore + ' · ' + (NOMI_PESO[valore] || '');
      return numeroIt(valore) + (d.unita ? ' ' + d.unita : '');
    case 'lati':
      return oggetto(valore) ? LATI.map((l) => (typeof valore[l] === 'number' ? numeroIt(valore[l]) : '–')).join(' · ') + ' px' : '';
    case 'visibilita': return valore === true ? 'nascosto' : 'visibile';
    default: return String(valore);
  }
}

/* =====================================================================
   6. PEZZI DELL'INTERFACCIA
   ===================================================================== */

/* --- intestazione di un campo: pallino, nome, «da Computer», ripristino -- */

function testaCampo(ctx, o) {
  const nome = o.perId
    ? el('label', { classe: 'stile__nome', id: o.ids.etichetta, for: o.perId, testo: o.etichetta })
    : el('span', { classe: 'stile__nome', id: o.ids.etichetta, testo: o.etichetta });
  const pallino = el('span', { classe: 'stile__pallino', 'aria-hidden': 'true' });
  const daVisibile = el('span', { classe: 'stile__da-testo', 'aria-hidden': 'true' });
  const daLettori = el('span', { classe: 'sr-only' });
  const da = el('span', { classe: 'stile__da', id: o.ids.descrizione }, [daVisibile, daLettori]);
  const ripristina = el('button', {
    type: 'button',
    classe: 'stile__ripristina',
    title: ctx.dispositivo === 'computer' ? 'Torna come nel sito' : 'Torna al valore ereditato',
    'aria-label': 'Togli «' + o.etichetta + '» su ' + NOME[ctx.dispositivo],
    dati: { fuoco: 'ripristina-' + o.nome }
  }, [icona('ricarica', 'ico ico--mini')]);
  ripristina.addEventListener('click', () => {
    scrivi(ctx, o.nome, null);
    sincronizzaTutto(ctx);
    const bersaglioFuoco = o.fuoco ? o.fuoco() : null;
    if (bersaglioFuoco && typeof bersaglioFuoco.focus === 'function') bersaglioFuoco.focus();
  });

  const nodo = el('div', { classe: 'stile__testa', dati: { stato: 'sito' } }, [pallino, nome, o.extra || null, da, ripristina]);

  function aggiorna() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, o.nome);
    const eredita = mio === undefined ? ereditato(ctx.bersaglio, ctx.dispositivo, o.nome) : null;
    const stato = mio !== undefined ? 'proprio' : (eredita ? 'ereditato' : 'sito');
    if (nodo.dataset.stato !== stato) nodo.dataset.stato = stato;
    let visibile = '';
    let lettori;
    if (stato === 'proprio') {
      lettori = 'Cambiato su ' + NOME[ctx.dispositivo] + '.';
      pallino.title = lettori;
    } else if (stato === 'ereditato') {
      visibile = 'da ' + NOME[eredita.da] + ': ' + descrivi(o.nome, eredita.valore);
      lettori = 'Preso da ' + NOME[eredita.da] + ': ' + descrivi(o.nome, eredita.valore) + '.';
      pallino.title = 'Preso da ' + NOME[eredita.da];
    } else {
      lettori = 'Come nel sito.';
      pallino.title = 'Come nel sito';
    }
    if (daVisibile.textContent !== visibile) { daVisibile.textContent = visibile; da.title = visibile; }
    if (daLettori.textContent !== lettori) daLettori.textContent = lettori;
    ripristina.disabled = stato !== 'proprio';
  }

  return { nodo, aggiorna };
}

/* Un campo = intestazione + controllo. `costruisci(ids)` torna
   { nodo, sincronizza, fuoco, perEtichetta, esterno }. */
function campo(ctx, griglia, o) {
  const ids = { etichetta: idUnico('st-nome'), campo: idUnico('st-campo'), descrizione: idUnico('st-da') };
  const controllo = o.costruisci(ids);
  const testa = testaCampo(ctx, {
    nome: o.nome,
    etichetta: o.etichetta,
    ids,
    perId: controllo.perEtichetta ? ids.campo : null,
    fuoco: controllo.fuoco
  });
  const nodo = el('div', {
    classe: 'stile__campo' + (o.pieno ? ' stile__campo--pieno' : '') + (controllo.esterno ? ' stile__campo--esterno' : ''),
    dati: { proprieta: o.nome }
  }, [testa.nodo, controllo.nodo, o.aiuto ? el('p', { classe: 'stile__aiuto', testo: o.aiuto }) : null]);
  griglia.append(nodo);
  ctx.teste.push(testa.aggiorna);
  ctx.campi.push(() => { testa.aggiorna(); controllo.sincronizza(); });
  return nodo;
}

/* --- numero: cursore + casella (+ unità) ----------------------------- */

function controlloNumero(ctx, ids, nome) {
  const d = definizione(nome) || {};
  const conUnita = d.tipo === 'misura' && oggetto(d.unita);
  const unitaPossibili = conUnita ? Object.keys(d.unita) : [];
  const niente = SENZA_NUMERO[nome] || null;

  function unitaIniziale() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    if (oggetto(mio) && unitaPossibili.includes(mio.unita)) return mio.unita;
    const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
    if (eredita && oggetto(eredita.valore) && unitaPossibili.includes(eredita.valore.unita)) return eredita.valore.unita;
    return unitaPossibili[0];
  }
  let unita = conUnita ? unitaIniziale() : null;
  const lim = () => limiti(nome, unita);

  const cursore = el('input', {
    type: 'range', classe: 'stile__cursore',
    'aria-labelledby': ids.etichetta, 'aria-describedby': ids.descrizione,
    dati: { fuoco: 'cursore-' + nome }
  });
  const casella = el('input', {
    type: 'number', classe: 'campo__input stile__numero', id: ids.campo,
    inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': ids.descrizione,
    dati: { fuoco: 'numero-' + nome }
  });
  let coda = null;
  if (conUnita) {
    coda = el('select', {
      classe: 'stile__unita', 'aria-label': 'Unità di misura di «' + (d.etichetta || nome) + '»',
      dati: { fuoco: 'unita-' + nome }
    }, unitaPossibili.map((u) => el('option', { value: u, testo: u })));
  } else if (d.unita) {
    coda = el('span', { classe: 'stile__suffisso', 'aria-hidden': 'true', testo: d.unita });
  }
  const errore = el('p', { classe: 'stile__errore', hidden: true });
  const riga = el('div', { classe: 'stile__riga-numero' }, [cursore, el('span', { classe: 'stile__scatola' }, [casella, coda])]);
  const nodo = el('div', { classe: 'stile__controllo-numero' }, [riga, errore]);

  const forma = (n) => (conUnita ? { valore: n, unita } : n);
  const numeroDi = (v) => (conUnita ? (oggetto(v) ? v.valore : null) : (typeof v === 'number' ? v : null));

  /* px e rem si convertono (16 px per rem, come il sito); px e % no: la
     percentuale dipende da un contenitore che la scheda non misura. */
  function nellUnita(v) {
    if (!conUnita) return typeof v === 'number' ? v : null;
    if (!oggetto(v)) return null;
    if (v.unita === unita) return v.valore;
    if (v.unita === 'px' && unita === 'rem') return arrotonda(v.valore / 16, 3);
    if (v.unita === 'rem' && unita === 'px') return arrotonda(v.valore * 16, 1);
    return null;
  }

  function fantasma() {
    const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
    if (eredita) return nellUnita(eredita.valore);
    const nelSito = valoreNelSito(ctx, nome);
    return nelSito === null ? null : nellUnita(nelSito);
  }

  function applicaLimiti() {
    const l = lim();
    for (const campoNumero of [cursore, casella]) {
      campoNumero.min = String(l.min);
      campoNumero.max = String(l.max);
    }
    cursore.step = String(l.passo);
    casella.step = 'any';
    return l;
  }

  function segnaErrore(acceso, l) {
    if (acceso) {
      casella.setAttribute('aria-invalid', 'true');
      errore.textContent = 'Scrivi un numero fra ' + numeroIt(l.min) + ' e ' + numeroIt(l.max) + '.';
      errore.hidden = false;
    } else {
      casella.removeAttribute('aria-invalid');
      errore.hidden = true;
    }
  }

  function sincronizza() {
    if (conUnita) {
      const mioGrezzo = proprio(ctx.bersaglio, ctx.dispositivo, nome);
      // Dopo Annulla l'unità salvata può essere un'altra.
      if (oggetto(mioGrezzo) && unitaPossibili.includes(mioGrezzo.unita)) unita = mioGrezzo.unita;
      coda.value = unita;
    }
    const l = applicaLimiti();
    const mio = numeroDi(proprio(ctx.bersaglio, ctx.dispositivo, nome));
    const g = fantasma();
    casella.placeholder = g === null || g === undefined ? (niente ? niente.testo : '') : numeroIt(g);
    if (typeof mio === 'number') {
      if (document.activeElement !== casella) casella.value = String(mio);
      cursore.value = String(stringi(mio, l.min, l.max));
      nodo.classList.remove('is-fantasma');
    } else {
      if (document.activeElement !== casella) casella.value = '';
      const riposo = niente && g === null ? (niente.a === 'max' ? l.max : niente.a) : l.min;
      cursore.value = String(g === null || g === undefined ? riposo : stringi(g, l.min, l.max));
      nodo.classList.add('is-fantasma');
    }
    if (document.activeElement !== casella) segnaErrore(false);
  }

  cursore.addEventListener('input', () => {
    const l = lim();
    const n = arrotonda(parseFloat(cursore.value), l.decimaliPasso);
    if (!Number.isFinite(n)) return;
    if (scrivi(ctx, nome, forma(n))) {
      casella.value = String(n);
      segnaErrore(false);
      nodo.classList.remove('is-fantasma');
    }
  });

  casella.addEventListener('input', () => {
    const l = lim();
    if (casella.value === '') { segnaErrore(false); return; }          // si decide al «change»
    const n = arrotonda(parseFloat(casella.value), l.decimali);
    if (!Number.isFinite(n) || n < l.min || n > l.max) { segnaErrore(true, l); return; }
    segnaErrore(false);
    if (scrivi(ctx, nome, forma(n))) {
      cursore.value = String(n);
      nodo.classList.remove('is-fantasma');
    }
  });

  casella.addEventListener('change', () => {
    const l = lim();
    if (casella.value === '') {
      // Una casella svuotata vuol dire «togli», uno scarabocchio no.
      if (!(casella.validity && casella.validity.badInput)) scrivi(ctx, nome, null);
      casella.value = '';
      segnaErrore(false);
      sincronizza();
      return;
    }
    let n = parseFloat(casella.value);
    if (!Number.isFinite(n)) { sincronizza(); return; }
    n = stringi(arrotonda(n, l.decimali), l.min, l.max);
    scrivi(ctx, nome, forma(n));
    const scritto = numeroDi(proprio(ctx.bersaglio, ctx.dispositivo, nome));
    casella.value = typeof scritto === 'number' ? String(scritto) : String(n);
    segnaErrore(false);
    sincronizza();
  });

  if (conUnita) {
    coda.addEventListener('change', () => {
      const prima = unita;
      unita = coda.value;
      const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
      if (oggetto(mio)) {
        let n = mio.valore;
        if (prima === 'px' && unita === 'rem') n = n / 16;
        else if (prima === 'rem' && unita === 'px') n = n * 16;
        const l = lim();
        scrivi(ctx, nome, { valore: stringi(arrotonda(n, l.decimali), l.min, l.max), unita });
      }
      casella.value = '';
      sincronizza();
    });
  }

  return { nodo, sincronizza, fuoco: () => casella, perEtichetta: true };
}

/* --- menu a tendina ---------------------------------------------------- */

function controlloScelta(ctx, ids, nome, opzioni) {
  const prima = el('option', { value: '' });
  const menu = el('select', {
    classe: 'campo__scelta stile__menu', id: ids.campo, 'aria-describedby': ids.descrizione,
    dati: { fuoco: 'menu-' + nome }
  }, [prima].concat(opzioni.map((o) => el('option', { value: String(o.valore), testo: o.etichetta }))));

  function sincronizza() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
    let testo;
    if (eredita) {
      testo = 'Come su ' + NOME[eredita.da] + ' (' + descrivi(nome, eredita.valore) + ')';
    } else {
      const nelSito = valoreNelSito(ctx, nome);
      testo = nelSito === null ? 'Come nel sito' : 'Come nel sito (' + descrivi(nome, nelSito) + ')';
    }
    if (prima.textContent !== testo) prima.textContent = testo;
    const voluto = mio === undefined ? '' : String(mio);
    menu.value = voluto;
    if (menu.value !== voluto) menu.value = '';
    menu.classList.toggle('is-fantasma', mio === undefined);
  }

  menu.addEventListener('change', () => {
    const scelta = opzioni.find((o) => String(o.valore) === menu.value);
    scrivi(ctx, nome, scelta ? scelta.valore : null);
    sincronizza();
  });

  return { nodo: menu, sincronizza, fuoco: () => menu, perEtichetta: true };
}

/* --- bottoni a scelta singola (corsivo, allineamento, bagliore) --------- */

function controlloBottoni(ctx, ids, nome, opzioni) {
  const gruppo = el('div', {
    classe: 'stile__bottoni', role: 'group',
    'aria-labelledby': ids.etichetta, 'aria-describedby': ids.descrizione
  });
  const bottoni = opzioni.map((o) => {
    const figli = [];
    if (o.glifo) figli.push(glifo(o.glifo, 17));
    if (o.campione) figli.push(el('span', { classe: 'stile__punto', dati: { tinta: o.campione }, 'aria-hidden': 'true' }));
    if (!o.glifo) figli.push(el('span', { testo: o.etichetta }));
    const b = el('button', {
      type: 'button',
      classe: 'stile__bottone' + (o.glifo ? ' stile__bottone--glifo' : ''),
      'aria-pressed': 'false',
      title: o.etichetta,
      'aria-label': o.glifo ? o.etichetta : null,
      dati: { fuoco: 'bottone-' + nome + '-' + String(o.valore) }
    }, figli);
    b.addEventListener('click', () => {
      const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
      // Il secondo clic sulla scelta accesa la toglie: è il modo più breve
      // di tornare «come nel sito» senza cercare il ripristino.
      scrivi(ctx, nome, mio === o.valore ? null : o.valore);
      sincronizza();
    });
    gruppo.append(b);
    return { b, valore: o.valore };
  });

  function sincronizza() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    let g = null;
    if (mio === undefined) {
      const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
      g = eredita ? eredita.valore : valoreNelSito(ctx, nome);
    }
    for (const { b, valore } of bottoni) {
      b.setAttribute('aria-pressed', mio === valore ? 'true' : 'false');
      b.classList.toggle('is-fantasma', mio === undefined && g === valore);
    }
  }

  return { nodo: gruppo, sincronizza, fuoco: () => bottoni[0] && bottoni[0].b, perEtichetta: false };
}

/* --- colore e font: i controlli di TEMA, o il ripiego ------------------ */

/* Il testo della scelta «vuota» dei controlli di TEMA: su un dispositivo
   più piccolo vuoto non vuol dire «come nel sito» ma «come su Computer». */
function testoVuoto(ctx, nome) {
  const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
  if (eredita) return 'Come su ' + NOME[eredita.da];
  return 'Come nel sito';
}

function controlloEsterno(ctx, nome, etichetta, fabbrica, segnaposto) {
  const contenitore = el('div', { classe: 'stile__esterno' });
  let nodo = null;
  let ultima = null;
  let ultimoSegnaposto = null;

  function costruisci() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    let nuovo = null;
    const primoSegnaposto = segnaposto();
    try {
      nuovo = fabbrica({
        etichetta,
        valore: mio === undefined ? null : mio,
        vuoto: testoVuoto(ctx, nome),
        segnaposto: primoSegnaposto,
        alCambio: (v) => {
          const valore = v === '' || v === undefined ? null : v;
          if (!scrivi(ctx, nome, valore)) {
            // Un font caricato un attimo fa può non essere ancora nella
            // cache di TEMA: si rilegge l'elenco e si riprova una volta.
            if (typeof valore === 'string' && valore.startsWith('caricato:') && tema && typeof tema.caricaFont === 'function') {
              Promise.resolve(tema.caricaFont({ forza: true })).then(() => {
                if (!scrivi(ctx, nome, valore)) ponte.avviso('Questo font non risulta fra quelli caricati.', { tipo: 'errore' });
                sincronizzaTutto(ctx);
              });
              return;
            }
            if (dispositivoCorrente() === ctx.dispositivo) ponte.avviso('Questo valore qui non si può usare.', { tipo: 'errore' });
          }
          ultima = impronta(proprio(ctx.bersaglio, ctx.dispositivo, nome));
        }
      });
    } catch (e) {
      avverti(e);
      nuovo = null;
    }
    if (!nuovo || typeof nuovo.nodeType !== 'number') return false;
    svuota(contenitore);
    contenitore.append(nuovo);
    nodo = nuovo;
    ultima = impronta(mio);
    ultimoSegnaposto = primoSegnaposto;
    return true;
  }

  if (!costruisci()) return null;

  return {
    nodo: contenitore,
    esterno: true,
    perEtichetta: false,
    fuoco: () => contenitore.querySelector('button, input, select'),
    sincronizza() {
      const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
      if (impronta(mio) !== ultima) {
        let fatto = false;
        if (nodo && typeof nodo.imposta === 'function') {
          try { nodo.imposta(mio === undefined ? null : mio); ultima = impronta(mio); fatto = true; } catch (e) { avverti(e); }
        }
        if (!fatto) costruisci();
      }
      if (nodo && typeof nodo.impostaSegnaposto === 'function') {
        const s = segnaposto();
        if (s !== ultimoSegnaposto) {
          ultimoSegnaposto = s;
          try { nodo.impostaSegnaposto(s); } catch (e) { avverti(e); }
        }
      }
    }
  };
}

/* Il colore da mostrare nel campione quando su questo dispositivo non c'è
   un valore. L'anteprima è larga quanto il dispositivo che si modifica,
   quindi il colore calcolato comprende già quello ereditato da un
   dispositivo più grande: è la cosa più vera da mostrare. Senza anteprima
   si ripiega sul valore ereditato, come colore vero (i --token del sito
   nel pannello non esistono). */
function segnapostoColore(ctx, nome) {
  const cs = calcolato(ctx);
  if (cs) {
    const css = nome === 'colore' ? cs.color : (nome === 'sfondoColore' ? cs.backgroundColor : cs.borderTopColor);
    if (css) return css;
  }
  const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
  if (!eredita || typeof eredita.valore !== 'string') return '';
  if (eredita.valore.startsWith('var:')) {
    const c = coloriDelTema().find((x) => x.chiave === eredita.valore.slice(4));
    return c ? c.esa : '';
  }
  return eredita.valore;
}

function segnapostoFont(ctx) {
  const cs = calcolato(ctx);
  return cs && cs.fontFamily ? cs.fontFamily : '';
}

function controlloColore(ctx, ids, nome, etichetta) {
  if (tema && typeof tema.coloreControllo === 'function') {
    const esterno = controlloEsterno(ctx, nome, etichetta, tema.coloreControllo, () => segnapostoColore(ctx, nome));
    if (esterno) return esterno;
  }
  return coloreDiRipiego(ctx, ids, nome, etichetta);
}

/* Ripiego minimo finché impostazioni.js non c'è: i 12 colori del tema, un
   colore libero, e basta. Niente contrasto né nomi lunghi: quelli sono il
   lavoro del controllo vero. */
function coloreDiRipiego(ctx, ids, nome, etichetta) {
  const colori = coloriDelTema();
  const campioni = el('div', { classe: 'stile__campioni', role: 'group', 'aria-label': 'Colori del sito per «' + etichetta + '»' });
  const bottoni = colori.map((c) => {
    const b = el('button', {
      type: 'button', classe: 'stile__campione', title: c.nome,
      'aria-label': c.nome + ' (colore del sito)', 'aria-pressed': 'false',
      dati: { valore: 'var:' + c.chiave, fuoco: 'campione-' + nome + '-' + c.chiave }
    });
    b.style.setProperty('--stile-campione', c.esa || 'transparent');
    b.addEventListener('click', () => {
      const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
      scrivi(ctx, nome, mio === b.dataset.valore ? null : b.dataset.valore);
      sincronizza();
    });
    campioni.append(b);
    return b;
  });
  const tavolozza = el('input', {
    type: 'color', classe: 'stile__tavolozza', id: ids.campo, 'aria-describedby': ids.descrizione,
    dati: { fuoco: 'tavolozza-' + nome }
  });
  const esa = el('input', {
    type: 'text', classe: 'campo__input stile__esa', maxlength: '7', spellcheck: 'false', autocomplete: 'off',
    'aria-label': etichetta + ': codice esadecimale', placeholder: '#rrggbb',
    dati: { fuoco: 'esa-' + nome }
  });

  function sincronizza() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    let g = null;
    if (mio === undefined) {
      const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
      g = eredita ? eredita.valore : valoreNelSito(ctx, nome);
    }
    for (const b of bottoni) {
      b.setAttribute('aria-pressed', mio === b.dataset.valore ? 'true' : 'false');
      b.classList.toggle('is-fantasma', mio === undefined && g === b.dataset.valore);
    }
    const mostrato = mio !== undefined ? mio : g;
    let comeEsa = typeof mostrato === 'string' ? mostrato : '';
    if (comeEsa.startsWith('var:')) {
      const c = colori.find((x) => x.chiave === comeEsa.slice(4));
      comeEsa = c ? c.esa : '';
    }
    tavolozza.value = /^#[0-9a-f]{6}$/i.test(comeEsa) ? comeEsa.toLowerCase() : '#000000';
    tavolozza.classList.toggle('is-fantasma', mio === undefined);
    if (document.activeElement !== esa) {
      esa.value = typeof mio === 'string' && mio.startsWith('#') ? mio.toLowerCase() : '';
      esa.removeAttribute('aria-invalid');
    }
    esa.placeholder = mio !== undefined ? descrivi(nome, mio) : (g ? descrivi(nome, g) : '#rrggbb');
  }

  tavolozza.addEventListener('input', () => {
    if (scrivi(ctx, nome, tavolozza.value.toLowerCase())) {
      esa.value = tavolozza.value.toLowerCase();
      for (const b of bottoni) b.setAttribute('aria-pressed', 'false');
      tavolozza.classList.remove('is-fantasma');
    }
  });
  esa.addEventListener('input', () => {
    let v = esa.value.trim();
    if (!v) { esa.removeAttribute('aria-invalid'); return; }
    if (!v.startsWith('#')) v = '#' + v;
    if (!/^#[0-9a-f]{6}$/i.test(v)) { esa.setAttribute('aria-invalid', 'true'); return; }
    esa.removeAttribute('aria-invalid');
    if (scrivi(ctx, nome, v.toLowerCase())) tavolozza.value = v.toLowerCase();
  });
  esa.addEventListener('change', () => {
    if (!esa.value.trim()) {
      const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
      if (typeof mio === 'string' && mio.startsWith('#')) scrivi(ctx, nome, null);
    }
    sincronizza();
  });

  const nodo = el('div', { classe: 'stile__colore' }, [campioni, el('div', { classe: 'stile__riga' }, [tavolozza, esa])]);
  return { nodo, sincronizza, fuoco: () => tavolozza, perEtichetta: true };
}

function controlloFont(ctx, ids) {
  if (tema && typeof tema.fontControllo === 'function') {
    const esterno = controlloEsterno(ctx, 'font', 'Font', tema.fontControllo, () => segnapostoFont(ctx));
    if (esterno) return esterno;
  }
  /* Ripiego: i tre ruoli del tema, le famiglie del catalogo e i font già
     caricati, se il pannello li conosce. */
  const opzioni = ['titolo', 'testo', 'mono'].map((ruolo) => ({ valore: 'ruolo:' + ruolo, etichetta: nomeFont('ruolo:' + ruolo) }));
  const catalogo = ponte.stato && ponte.stato.tema && oggetto(ponte.stato.tema.font) ? ponte.stato.tema.font : {};
  const viste = new Set();
  for (const slot of Object.keys(catalogo)) {
    for (const voce of Array.isArray(catalogo[slot]) ? catalogo[slot] : []) {
      const nome = String(voce && typeof voce === 'object' ? voce.nome : voce || '').trim();
      // «Font di sistema» non è una famiglia vera (TEMA): si sceglie da un ruolo.
      if (!nome || nome === 'Font di sistema' || viste.has(nome)) continue;
      viste.add(nome);
      opzioni.push({ valore: 'famiglia:' + nome, etichetta: nome });
    }
  }
  const caricati = ponte.stato && ponte.stato.editor && Array.isArray(ponte.stato.editor.font) ? ponte.stato.editor.font : [];
  for (const f of caricati) {
    if (f && typeof f.id === 'string') opzioni.push({ valore: 'caricato:' + f.id, etichetta: (f.etichetta || f.id) + ' (caricato)' });
  }
  const mio = proprio(ctx.bersaglio, ctx.dispositivo, 'font');
  if (typeof mio === 'string' && !opzioni.some((o) => o.valore === mio)) opzioni.push({ valore: mio, etichetta: nomeFont(mio) });
  return controlloScelta(ctx, ids, 'font', opzioni);
}

/* --- immagine di sfondo ------------------------------------------------ */

function controlloImmagine(ctx, ids) {
  const nome = 'sfondoImmagine';
  const miniatura = el('span', { classe: 'stile__miniatura', 'aria-hidden': 'true' });
  const didascalia = el('span', { classe: 'stile__didascalia' });
  const scegli = el('button', {
    type: 'button', classe: 'btn btn--minimo', id: ids.campo,
    'aria-describedby': ids.descrizione, dati: { fuoco: 'immagine-scegli' }
  }, [icona('immagine', 'ico ico--mini'), el('span', { testo: 'Scegli un\'immagine' })]);
  const nessuna = el('button', { type: 'button', classe: 'btn btn--minimo', dati: { fuoco: 'immagine-nessuna' } });
  const torna = el('button', { type: 'button', classe: 'btn btn--minimo', hidden: true, dati: { fuoco: 'immagine-torna' } });

  /* L'immagine che arriva da un dispositivo più grande, se c'è davvero. */
  function immagineDiSopra() {
    const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, nome);
    return eredita && eredita.valore !== 'nessuna' ? eredita : null;
  }

  /* «Nessuna»: se sopra c'è un'immagine serve dirlo esplicitamente
     ('nessuna' = background-image: none), altrimenti basta togliere il
     valore di questo dispositivo. */
  function mettiNessuna() {
    return scrivi(ctx, nome, immagineDiSopra() ? 'nessuna' : null);
  }

  function sincronizza() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    const eredita = mio === undefined ? ereditato(ctx.bersaglio, ctx.dispositivo, nome) : null;
    const sopra = immagineDiSopra();
    const file = mio !== undefined ? mio : (eredita ? eredita.valore : null);
    svuota(miniatura);
    if (file && file !== 'nessuna') {
      const img = el('img', { src: urlRisorsa(file), alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => { svuota(miniatura); miniatura.append(el('span', { classe: 'stile__vuota', testo: 'non trovata' })); });
      miniatura.append(img);
    } else {
      // «Del sito» solo quando non c'è nessuna scelta: con «nessuna» scritta
      // qui o sopra, l'anteprima può non essersi ancora aggiornata.
      const nelSito = file === 'nessuna' ? null : valoreNelSito(ctx, nome);
      miniatura.append(el('span', { classe: 'stile__vuota', testo: nelSito ? 'del sito' : 'nessuna' }));
    }
    miniatura.classList.toggle('is-fantasma', mio === undefined);

    let testo;
    if (mio === 'nessuna') {
      testo = sopra
        ? 'Nessuna immagine su ' + NOME[ctx.dispositivo] + ' (su ' + NOME[sopra.da] + ' c\'è ' + descrivi(nome, sopra.valore) + ').'
        : 'Nessuna immagine su ' + NOME[ctx.dispositivo] + '.';
    } else if (mio !== undefined) {
      testo = mio;
    } else if (eredita && eredita.valore === 'nessuna') {
      testo = 'Nessuna immagine, come su ' + NOME[eredita.da] + '.';
    } else if (eredita) {
      testo = 'Vale quella di ' + NOME[eredita.da] + ': ' + descrivi(nome, eredita.valore) + '.';
    } else {
      const nelSito = valoreNelSito(ctx, nome);
      testo = nelSito ? 'Come nel sito: ' + nelSito + '.' : 'Nessuna immagine: come nel sito.';
    }
    if (didascalia.textContent !== testo) didascalia.textContent = testo;

    nessuna.hidden = !(file && file !== 'nessuna');
    nessuna.textContent = mio === undefined && sopra ? 'Nessuna su ' + NOME[ctx.dispositivo] : 'Nessuna';
    torna.hidden = !(mio === 'nessuna' && sopra);
    torna.textContent = sopra ? 'Usa quella di ' + NOME[sopra.da] : '';
    scegli.lastChild.textContent = mio !== undefined && mio !== 'nessuna' ? 'Cambia immagine' : 'Scegli un\'immagine';
  }

  nessuna.addEventListener('click', () => { mettiNessuna(); sincronizzaTutto(ctx); scegli.focus(); });
  torna.addEventListener('click', () => { scrivi(ctx, nome, null); sincronizzaTutto(ctx); scegli.focus(); });
  scegli.addEventListener('click', async () => {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    const dispositivo = ctx.dispositivo;
    let percorso = null;
    try {
      percorso = await ponte.scegliImmagine(typeof mio === 'string' && mio !== 'nessuna' ? mio : '');
    } catch (e) {
      avverti(e);
      percorso = null;
    }
    if (!percorso) return;
    if (dispositivoCorrente() !== dispositivo) {
      ponte.avviso('Nel frattempo è cambiato il dispositivo: scegli di nuovo l\'immagine per ' + NOME[dispositivo] + '.', { tipo: 'info' });
      return;
    }
    const pulito = String(percorso).replace(/^\/+/, '');
    if (!scrivi(ctx, nome, pulito)) {
      ponte.avviso('«' + pulito + '» non si può usare come sfondo: servono immagini PNG, JPG, WEBP, SVG, GIF o AVIF della libreria.', { tipo: 'errore', titolo: 'Immagine non valida' });
    }
    sincronizzaTutto(ctx);
    if (scegli.isConnected) scegli.focus();
  });

  const nodo = el('div', { classe: 'stile__immagine' }, [
    miniatura,
    el('div', { classe: 'stile__immagine-lato' }, [didascalia, el('div', { classe: 'stile__azioni' }, [scegli, nessuna, torna])])
  ]);
  return { nodo, sincronizza, fuoco: () => scegli, perEtichetta: false };
}

/* --- riquadro degli spazi: margine fuori, riempimento dentro ----------- */

const lucchetti = {};

function disegnaSpazi(ctx, griglia) {
  const parti = {};
  const scatola = el('div', { classe: 'stile__campo stile__campo--pieno stile__spazi', dati: { proprieta: 'margine riempimento' } });
  const teste = el('div', { classe: 'stile__spazi-teste' });

  for (const nome of ['margine', 'riempimento']) {
    const d = definizione(nome) || {};
    const etichetta = d.etichetta || nome;
    const ids = { etichetta: idUnico('st-nome'), descrizione: idUnico('st-da') };
    const memoria = ctx.bersaglio + '|' + nome;
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
    const parte = { nome, etichetta, ids, caselle: {}, chiuso: false };
    parte.chiuso = propria(lucchetti, memoria)
      ? lucchetti[memoria]
      : Boolean(oggetto(mio) && LATI.every((l) => typeof mio[l] === 'number' && mio[l] === mio.sopra));
    const lucchetto = el('button', {
      type: 'button', classe: 'stile__lucchetto', 'aria-pressed': parte.chiuso ? 'true' : 'false',
      title: 'Stesso valore sui quattro lati',
      'aria-label': 'Stesso valore sui quattro lati: ' + etichetta.toLowerCase(),
      dati: { fuoco: 'lucchetto-' + nome }
    }, [glifo(parte.chiuso ? 'chiuso' : 'aperto', 14)]);
    lucchetto.addEventListener('click', () => {
      parte.chiuso = !parte.chiuso;
      lucchetti[memoria] = parte.chiuso;
      lucchetto.setAttribute('aria-pressed', parte.chiuso ? 'true' : 'false');
      svuota(lucchetto);
      lucchetto.append(glifo(parte.chiuso ? 'chiuso' : 'aperto', 14));
      if (parte.chiuso) {
        const ora = proprio(ctx.bersaglio, ctx.dispositivo, nome);
        const primo = oggetto(ora) ? LATI.map((l) => ora[l]).find((n) => typeof n === 'number') : undefined;
        if (typeof primo === 'number') scriviLati(ctx, nome, LATI, primo);
        sincronizzaParte(parte);
        segnaTutto(ctx);
      }
    });
    parte.testa = testaCampo(ctx, {
      nome, etichetta, ids, extra: lucchetto,
      fuoco: () => parte.caselle.sopra
    });
    teste.append(parte.testa.nodo);
    for (const lato of LATI) parte.caselle[lato] = casellaLato(parte, lato);
    parti[nome] = parte;
  }

  function cella(parte, lato) {
    const casella = parte.caselle[lato];
    return el('span', { classe: 'stile__cella stile__cella--' + lato }, [
      el('label', { classe: 'sr-only', for: casella.id, testo: parte.etichetta + ', ' + NOME_LATO[lato] }),
      casella
    ]);
  }

  const dentro = el('div', { classe: 'stile__dentro' }, [
    el('span', { classe: 'stile__cartellino stile__cartellino--dentro', 'aria-hidden': 'true', testo: 'Interno' }),
    cella(parti.riempimento, 'sopra'), cella(parti.riempimento, 'sinistra'),
    el('span', { classe: 'stile__nucleo', 'aria-hidden': 'true', testo: 'elemento' }),
    cella(parti.riempimento, 'destra'), cella(parti.riempimento, 'sotto')
  ]);
  const fuori = el('div', { classe: 'stile__fuori' }, [
    el('span', { classe: 'stile__cartellino', 'aria-hidden': 'true', testo: 'Esterno' }),
    cella(parti.margine, 'sopra'), cella(parti.margine, 'sinistra'),
    dentro,
    cella(parti.margine, 'destra'), cella(parti.margine, 'sotto')
  ]);

  scatola.append(teste, fuori, el('p', {
    classe: 'stile__aiuto',
    testo: 'In pixel. Col lucchetto chiuso un numero vale per tutti e quattro i lati.' +
      (ctx.protetto ? '' : ' Lo spazio esterno può essere negativo.')
  }));
  if (ctx.protetto) scatola.append(el('p', { classe: 'stile__aiuto stile__aiuto--protetto', testo: NOTA_MARGINE_PROTETTO }));
  griglia.append(scatola);

  for (const nome of ['margine', 'riempimento']) {
    const parte = parti[nome];
    ctx.teste.push(parte.testa.aggiorna);
    ctx.campi.push(() => { parte.testa.aggiorna(); sincronizzaParte(parte); });
  }

  function sincronizzaParte(parte) {
    const l = limitiLati(ctx, parte.nome);
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, parte.nome);
    for (const lato of LATI) {
      const casella = parte.caselle[lato];
      casella.min = String(l.min);
      casella.max = String(l.max);
      const valore = oggetto(mio) && typeof mio[lato] === 'number' ? mio[lato] : null;
      if (document.activeElement !== casella) {
        casella.value = valore === null ? '' : String(valore);
        casella.removeAttribute('aria-invalid');
      }
      const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, parte.nome, lato);
      const g = eredita ? eredita.valore : valoreNelSito(ctx, parte.nome, lato);
      casella.placeholder = g === null || g === undefined ? '' : numeroIt(g);
      casella.classList.toggle('is-impostato', valore !== null);
    }
  }

  function casellaLato(parte, lato) {
    const casella = el('input', {
      type: 'number', classe: 'stile__lato', id: idUnico('st-lato'), step: '1', inputmode: 'numeric',
      autocomplete: 'off', 'aria-describedby': parte.ids.descrizione,
      dati: { fuoco: 'lato-' + parte.nome + '-' + lato }
    });
    casella.addEventListener('input', () => {
      if (casella.value === '') return;
      const l = limitiLati(ctx, parte.nome);
      let n = parseFloat(casella.value);
      if (!Number.isFinite(n) || n < l.min || n > l.max) { casella.setAttribute('aria-invalid', 'true'); return; }
      casella.removeAttribute('aria-invalid');
      n = arrotonda(n, l.decimali);
      if (scriviLati(ctx, parte.nome, parte.chiuso ? LATI : [lato], n) && parte.chiuso) {
        for (const altro of LATI) if (altro !== lato) parte.caselle[altro].value = String(n);
      }
    });
    casella.addEventListener('change', () => {
      const l = limitiLati(ctx, parte.nome);
      if (casella.value === '') {
        if (!(casella.validity && casella.validity.badInput)) scriviLati(ctx, parte.nome, parte.chiuso ? LATI : [lato], null);
        sincronizzaTutto(ctx);
        return;
      }
      let n = parseFloat(casella.value);
      if (!Number.isFinite(n)) { sincronizzaParte(parte); return; }
      n = stringi(arrotonda(n, l.decimali), l.min, l.max);
      scriviLati(ctx, parte.nome, parte.chiuso ? LATI : [lato], n);
      casella.value = String(n);
      casella.removeAttribute('aria-invalid');
      sincronizzaParte(parte);
    });
    return casella;
  }
}

function scriviLati(ctx, nome, lati, n) {
  const mio = proprio(ctx.bersaglio, ctx.dispositivo, nome);
  const nuovo = oggetto(mio) ? { ...mio } : {};
  for (const lato of lati) {
    if (n === null) delete nuovo[lato];
    else nuovo[lato] = n;
  }
  return scrivi(ctx, nome, Object.keys(nuovo).length ? nuovo : null);
}

/* --- «Nascondi su questo dispositivo» ---------------------------------- */

function controlloNascosto(ctx, ids) {
  const idLeva = idUnico('st-leva');
  const leva = el('button', {
    type: 'button', id: ids.campo, classe: 'interruttore', role: 'switch', 'aria-checked': 'false',
    'aria-labelledby': idLeva, 'aria-describedby': ids.descrizione, dati: { fuoco: 'nascosto' }
  }, [el('span', { classe: 'interruttore__pista', 'aria-hidden': 'true' }, [el('span', { classe: 'interruttore__pallina' })])]);
  const testoLeva = el('span', { classe: 'stile__leva-testo', id: idLeva, testo: 'Nascondi su ' + NOME[ctx.dispositivo] });
  // L'etichetta è uno <span>: un clic sopra deve comunque arrivare alla leva.
  testoLeva.addEventListener('click', () => leva.click());

  const riepilogo = el('ul', { classe: 'stile__riepilogo', 'aria-label': 'Visibilità sui tre dispositivi' });
  const nota = el('p', { classe: 'stile__aiuto', hidden: true });
  const mostra = el('button', { type: 'button', classe: 'btn btn--minimo stile__mostra', hidden: true, dati: { fuoco: 'nascosto-mostra' } });

  /* Il valore effettivo con la stessa eredità del generatore, e da dove
     arriva: null se nessun dispositivo da lì in su ha scelto qualcosa. */
  function effettivo(dispositivo) {
    const S = sb();
    const voce = voceDi(ctx.bersaglio);
    return S && voce ? S.risolvi(voce, dispositivo, 'nascosto') : null;
  }

  function stato() {
    const mio = proprio(ctx.bersaglio, ctx.dispositivo, 'nascosto');
    const eredita = ereditato(ctx.bersaglio, ctx.dispositivo, 'nascosto');
    const sopra = Boolean(eredita && eredita.valore === true);
    return { mio, eredita, sopra, nascosto: mio !== undefined ? mio === true : sopra };
  }

  function sincronizza() {
    const s = stato();
    leva.setAttribute('aria-checked', s.nascosto ? 'true' : 'false');
    svuota(riepilogo);
    for (const d of ORDINE_BARRA) {
      const r = effettivo(d);
      const nascosto = Boolean(r && r.valore === true);
      // «(come Computer)» solo quando la scelta arriva davvero da lì.
      const come = r && r.da !== d ? ' (come ' + NOME[r.da] + ')' : '';
      riepilogo.append(el('li', {
        classe: 'stile__riepilogo-voce' + (d === ctx.dispositivo ? ' is-corrente' : ''),
        dati: { nascosto: nascosto ? '1' : '0' }
      }, [
        glifo(d, 14),
        el('span', { classe: 'stile__riepilogo-nome', testo: NOME[d] }),
        el('span', { classe: 'stile__riepilogo-stato', testo: (nascosto ? 'nascosto' : 'visibile') + come })
      ]));
    }

    mostra.hidden = true;
    let testo = '';
    if (s.mio === undefined && s.sopra) {
      testo = 'È nascosto su ' + NOME[s.eredita.da] + ', quindi per ora anche su ' + NOME[ctx.dispositivo] + '.';
      mostra.hidden = false;
      mostra.textContent = 'Mostra su questo dispositivo';
    } else if (s.mio === false && s.sopra) {
      testo = 'Su ' + NOME[s.eredita.da] + ' è nascosto, ma su ' + NOME[ctx.dispositivo] + ' lo mostri.';
      mostra.hidden = false;
      mostra.textContent = 'Nascondi come su ' + NOME[s.eredita.da];
    } else if (s.mio === true) {
      testo = ctx.dispositivo === 'computer'
        ? 'Nascosto su Computer, e anche su Tablet e Telefono finché lì non scegli «Mostra su questo dispositivo». Nell\'anteprima sparisce: lo ritrovi dal percorso in alto o dalla struttura della pagina.'
        : ctx.dispositivo === 'tablet'
          ? 'Nascosto su Tablet, e anche su Telefono finché lì non scegli «Mostra su questo dispositivo». Nell\'anteprima sparisce: passa a un altro dispositivo per ritrovarlo.'
          : 'Nascosto su Telefono. Nell\'anteprima sparisce: passa a un altro dispositivo per ritrovarlo.';
    }
    nota.hidden = !testo;
    if (nota.textContent !== testo) nota.textContent = testo;
  }

  /* Si scrive il minimo: il valore esplicito solo se diverso da quello che
     arriva dai dispositivi più grandi; su Computer `false` non si scrive. */
  function impostaNascosto(voluto) {
    const s = stato();
    if (ctx.dispositivo === 'computer') return scrivi(ctx, 'nascosto', voluto ? true : null);
    return scrivi(ctx, 'nascosto', voluto === s.sopra ? null : voluto);
  }

  leva.addEventListener('click', () => {
    impostaNascosto(!stato().nascosto);
    sincronizzaTutto(ctx);
  });
  mostra.addEventListener('click', () => {
    impostaNascosto(!stato().nascosto);
    sincronizzaTutto(ctx);
    leva.focus();
  });

  const nodo = el('div', { classe: 'stile__nascosto' }, [
    el('div', { classe: 'interruttore__riga' }, [leva, testoLeva]),
    nota,
    mostra,
    riepilogo
  ]);
  return { nodo, sincronizza, fuoco: () => leva, perEtichetta: false };
}

/* --- riga che spiega perché qualcosa manca ----------------------------- */

function rigaProtetta() {
  return el('p', { classe: 'stile__protetto' }, [icona('attenzione', 'ico ico--mini'), el('span', { testo: testoProtetto() })]);
}

/* =====================================================================
   7. SCHEDA STILE
   ===================================================================== */

/** Vero se la proprietà ha senso su questo elemento e non è vietata qui. */
function offerta(ctx, nome) {
  const d = definizione(nome);
  if (!d) return false;
  if (Array.isArray(d.tipi) && !d.tipi.includes(ctx.tipo)) return false;
  if (ctx.protetto && vietateAiProtetti().includes(nome)) return false;
  return true;
}

function vietateAiProtetti() {
  const S = sb();
  return S && Array.isArray(S.VIETATE_AI_PROTETTI) ? S.VIETATE_AI_PROTETTI : ['nascosto', 'opacita', 'larghezzaMax'];
}

/* I limiti dei lati di questo elemento. Sul player lo spazio esterno non
   scende sotto lo zero (tirerebbe il monitor sotto la sezione di prima) e
   quello interno non supera i 40 px (lo stringerebbe sotto la misura che
   Twitch chiede): condivisi/stili.js scarta i lati fuori da lì, e la casella
   non deve offrire quello che poi sparirebbe. */
const LATI_PROTETTI_DI_RISERVA = { margine: { min: 0 }, riempimento: { max: 40 } };

function limitiLati(ctx, nome) {
  const l = limiti(nome);
  if (!ctx.protetto) return l;
  const S = sb();
  // La regola vera sta in condivisi/stili.js (LATI_PROTETTI); la riserva
  // ripete i numeri decisi dall'integratore finché non viene esportata.
  const regole = S && oggetto(S.LATI_PROTETTI) ? S.LATI_PROTETTI : LATI_PROTETTI_DI_RISERVA;
  const regola = oggetto(regole[nome]) ? regole[nome] : null;
  if (!regola) return l;
  return {
    ...l,
    min: typeof regola.min === 'number' ? Math.max(l.min, regola.min) : l.min,
    max: typeof regola.max === 'number' ? Math.min(l.max, regola.max) : l.max
  };
}

function etichettaDi(nome) {
  const d = definizione(nome);
  return d && d.etichetta ? d.etichetta : nome;
}

/* Campo standard dal tipo della proprietà. */
function campoPer(ctx, griglia, nome, extra = {}) {
  if (!offerta(ctx, nome)) return;
  const d = definizione(nome);
  const etichetta = extra.etichetta || etichettaDi(nome);
  let costruisci;
  switch (d.tipo) {
    case 'colore': costruisci = (ids) => controlloColore(ctx, ids, nome, etichetta); break;
    case 'font': costruisci = (ids) => controlloFont(ctx, ids); break;
    case 'immagine': costruisci = (ids) => controlloImmagine(ctx, ids); break;
    case 'misura':
    case 'numero':
      if (nome === 'peso') {
        costruisci = (ids) => controlloScelta(ctx, ids, nome, [100, 200, 300, 400, 500, 600, 700, 800, 900]
          .map((p) => ({ valore: p, etichetta: p + ' · ' + NOMI_PESO[p] })));
      } else {
        costruisci = (ids) => controlloNumero(ctx, ids, nome);
      }
      break;
    case 'scelta':
    case 'interruttore':
      costruisci = extra.bottoni
        ? (ids) => controlloBottoni(ctx, ids, nome, scelteDi(nome).map((s) => ({
          valore: s.valore,
          etichetta: s.etichetta,
          glifo: extra.glifi ? extra.glifi[String(s.valore)] : null,
          campione: extra.campioni ? extra.campioni[String(s.valore)] : null
        })))
        : (ids) => controlloScelta(ctx, ids, nome, scelteDi(nome).map((s) => ({ valore: s.valore, etichetta: s.etichetta })));
      break;
    case 'visibilita': costruisci = (ids) => controlloNascosto(ctx, ids); break;
    default: return;
  }
  campo(ctx, griglia, { nome, etichetta, pieno: Boolean(extra.pieno), aiuto: extra.aiuto, costruisci });
}

function disegnaTipografia(ctx, griglia) {
  campoPer(ctx, griglia, 'font', { pieno: true });
  campoPer(ctx, griglia, 'dimensione', { pieno: true });
  campoPer(ctx, griglia, 'peso');
  campoPer(ctx, griglia, 'maiuscole');
  campoPer(ctx, griglia, 'corsivo', { bottoni: true });
  campoPer(ctx, griglia, 'allineamento', {
    bottoni: true,
    glifi: { sinistra: 'sinistra', centro: 'centro', destra: 'destra', giustificato: 'giustificato' }
  });
  campoPer(ctx, griglia, 'spaziatura');
  campoPer(ctx, griglia, 'interlinea');
}

function disegnaColori(ctx, griglia) {
  campoPer(ctx, griglia, 'colore', { pieno: true });
  campoPer(ctx, griglia, 'sfondoColore', { pieno: true });
}

function disegnaSfondo(ctx, griglia) {
  campoPer(ctx, griglia, 'sfondoImmagine', { pieno: true });
  campoPer(ctx, griglia, 'sfondoDimensione');
  campoPer(ctx, griglia, 'sfondoPosizione');
}

function disegnaBordi(ctx, griglia) {
  campoPer(ctx, griglia, 'bordoSpessore');
  campoPer(ctx, griglia, 'raggio');
  campoPer(ctx, griglia, 'bordoColore', { pieno: true });
}

function disegnaEffetti(ctx, griglia) {
  campoPer(ctx, griglia, 'bagliore', {
    bottoni: true,
    campioni: { viola: 'viola', ciano: 'ciano' },
    aiuto: ctx.tipo === 'immagine' ? 'Sull\'immagine il bagliore segue la sagoma.' : 'Il bagliore si vede sul testo.'
  });
  campoPer(ctx, griglia, 'opacita');
  if (ctx.protetto) {
    const riga = el('div', { classe: 'stile__campo stile__campo--pieno' }, [rigaProtetta()]);
    griglia.append(riga);
  }
}

const GRUPPI_STILE = [
  { chiave: 'tipografia', titolo: 'Tipografia', proprieta: ['font', 'dimensione', 'peso', 'corsivo', 'maiuscole', 'spaziatura', 'interlinea', 'allineamento'], disegna: disegnaTipografia },
  { chiave: 'colori', titolo: 'Colori', proprieta: ['colore', 'sfondoColore'], disegna: disegnaColori },
  { chiave: 'sfondo', titolo: 'Sfondo', proprieta: ['sfondoImmagine', 'sfondoDimensione', 'sfondoPosizione'], disegna: disegnaSfondo },
  { chiave: 'spazi', titolo: 'Spazi', proprieta: ['margine', 'riempimento'], disegna: (ctx, griglia) => disegnaSpazi(ctx, griglia) },
  { chiave: 'bordi', titolo: 'Bordi', proprieta: ['bordoSpessore', 'bordoColore', 'raggio'], disegna: disegnaBordi },
  { chiave: 'effetti', titolo: 'Effetti', proprieta: ['bagliore', 'opacita'], disegna: disegnaEffetti, sempre: (ctx) => ctx.protetto }
];

/* --- fisarmonica, con i gruppi aperti ricordati ------------------------ */

const CHIAVE_GRUPPI = 'sb-pannello-stile-gruppi';
const gruppiAperti = leggiGruppi();

function leggiGruppi() {
  try {
    const grezzo = window.localStorage.getItem(CHIAVE_GRUPPI);
    const letto = grezzo ? JSON.parse(grezzo) : null;
    if (oggetto(letto)) return letto;
  } catch (e) { /* senza localStorage si ricorda solo finché la pagina resta aperta */ }
  return { tipografia: true };
}

function salvaGruppi() {
  try { window.localStorage.setItem(CHIAVE_GRUPPI, JSON.stringify(gruppiAperti)); } catch (e) { /* idem */ }
}

function fisarmonica(ctx, g) {
  const idCorpo = idUnico('st-gruppo');
  const idBottone = idUnico('st-gruppo-b');
  const aperto = gruppiAperti[g.chiave] === true;
  const numero = el('span', { classe: 'stile__conta-numero' });
  const lettori = el('span', { classe: 'sr-only' });
  const conta = el('span', { classe: 'stile__conta', hidden: true }, [numero, lettori]);
  const bottone = el('button', {
    type: 'button', classe: 'stile__gruppo-bottone', id: idBottone,
    'aria-expanded': aperto ? 'true' : 'false', 'aria-controls': idCorpo,
    dati: { fuoco: 'gruppo-' + g.chiave }
  }, [el('span', { classe: 'stile__gruppo-titolo', testo: g.titolo }), conta, el('span', { classe: 'stile__freccia' }, [icona('giu', 'ico ico--mini')])]);
  const griglia = el('div', { classe: 'stile__griglia' });
  g.disegna(ctx, griglia);
  const corpo = el('div', { classe: 'stile__gruppo-corpo', id: idCorpo, role: 'region', 'aria-labelledby': idBottone }, [griglia]);
  corpo.hidden = !aperto;

  bottone.addEventListener('click', () => {
    const ora = bottone.getAttribute('aria-expanded') !== 'true';
    bottone.setAttribute('aria-expanded', ora ? 'true' : 'false');
    corpo.hidden = !ora;
    gruppiAperti[g.chiave] = ora;
    salvaGruppi();
  });

  ctx.contatori.push(() => {
    const n = g.proprieta.filter((p) => proprio(ctx.bersaglio, ctx.dispositivo, p) !== undefined).length;
    conta.hidden = !n;
    numero.textContent = n ? String(n) : '';
    lettori.textContent = n ? (n === 1 ? ' valore cambiato' : ' valori cambiati') + ' su ' + NOME[ctx.dispositivo] : '';
  });

  return el('section', { classe: 'stile__gruppo', dati: { gruppo: g.chiave } }, [el('h3', { classe: 'stile__gruppo-testa' }, [bottone]), corpo]);
}

function disegnaStile(ctx) {
  const gruppi = GRUPPI_STILE.filter((g) => g.proprieta.some((p) => offerta(ctx, p)) || (g.sempre && g.sempre(ctx)));
  if (!gruppi.length) {
    ctx.radice.append(nota('Questo elemento non ha proprietà di stile da cambiare.'));
    return;
  }
  // Almeno un gruppo aperto: una scheda tutta chiusa sembra vuota.
  if (!gruppi.some((g) => gruppiAperti[g.chiave] === true)) gruppiAperti[gruppi[0].chiave] = true;
  for (const g of gruppi) ctx.radice.append(fisarmonica(ctx, g));
}

/* =====================================================================
   8. SCHEDA AVANZATE (la parte di STILE)
   ===================================================================== */

function disegnaAvanzate(ctx) {
  const visibilita = el('section', { classe: 'stile__sezione' }, [
    el('h3', { classe: 'stile__sezione-titolo', tabindex: '-1', testo: 'Visibilità per dispositivo' })
  ]);
  if (ctx.protetto) {
    visibilita.append(rigaProtetta());
    if (ctx.tipo === 'sezione') {
      visibilita.append(el('p', { classe: 'stile__aiuto', testo: 'Per togliere tutta la sezione usa la struttura della pagina, nel menu ☰: spenta, la sezione non viene proprio scritta nella pagina, player compreso.' }));
    }
  } else {
    const griglia = el('div', { classe: 'stile__griglia' });
    campoPer(ctx, griglia, 'nascosto', { pieno: true, etichetta: NOME_CONTROLLO.nascosto });
    visibilita.append(griglia);
  }

  // Sul player la larghezza massima non c'è: la riga qui sopra dice già perché.
  let larghezza = null;
  if (offerta(ctx, 'larghezzaMax')) {
    larghezza = el('section', { classe: 'stile__sezione' }, [
      el('h3', { classe: 'stile__sezione-titolo', testo: 'Larghezza' })
    ]);
    const grigliaLarghezza = el('div', { classe: 'stile__griglia' });
    campoPer(ctx, grigliaLarghezza, 'larghezzaMax', {
      pieno: true,
      aiuto: 'Quanto può allargarsi al massimo: in pixel, o in percentuale dello spazio che ha intorno.'
    });
    larghezza.append(grigliaLarghezza);
  }

  const dove = el('p', { classe: 'stile__dove' });
  const azzera = el('button', {
    type: 'button', classe: 'btn btn--minimo btn--pericolo', dati: { fuoco: 'ripristina-tutto' }
  }, [icona('ricarica', 'ico ico--mini'), el('span', { testo: 'Ripristina lo stile di questo elemento' })]);
  azzera.addEventListener('click', () => confermaRipristino(ctx));

  ctx.contatori.push(() => {
    const con = DISPOSITIVI.filter((d) => haValori(ctx.bersaglio, d));
    azzera.disabled = !con.length;
    dove.textContent = con.length
      ? 'Stile cambiato su: ' + ORDINE_BARRA.filter((d) => con.includes(d)).map((d) => NOME[d]).join(', ') + '.'
      : 'Questo elemento ha ancora lo stile del sito.';
  });

  ctx.radice.append(...[visibilita, larghezza].filter(Boolean), el('section', { classe: 'stile__sezione stile__sezione--pericolo' }, [
    el('h3', { classe: 'stile__sezione-titolo', testo: 'Ripristino' }),
    dove,
    el('p', { classe: 'stile__aiuto', testo: 'Toglie font, colori, sfondo, spazi, bordi, effetti, visibilità e larghezza su tutti e tre i dispositivi. Testi, immagini e posizione restano come sono.' }),
    azzera
  ]));
}

async function confermaRipristino(ctx) {
  const chi = ctx.meta && ctx.meta.etichetta ? '«' + ctx.meta.etichetta + '»' : 'questo elemento';
  const ok = await ponte.conferma({
    titolo: 'Ripristinare lo stile?',
    testo: [
      'Tolgo tutte le modifiche di aspetto fatte a ' + chi + ' su Telefono, Tablet e Computer.',
      'Il testo, le immagini e la posizione non cambiano. Finché non salvi puoi tornare indietro con Annulla.'
    ],
    conferma: 'Ripristina lo stile',
    pericolo: true
  });
  if (!ok) return;
  const tutti = stiliTutti();
  if (!tutti || !propria(tutti, ctx.bersaglio)) return;
  delete tutti[ctx.bersaglio];
  programmaInvio(null);
  for (const altro of vivi.slice()) {
    if (altro.bersaglio === ctx.bersaglio && altro.radice.isConnected) ridisegna(altro);
  }
  const titolo = ctx.radice.querySelector('.stile__sezione-titolo');
  if (titolo && ctx.radice.isConnected) titolo.focus();
  ponte.avviso(chi.charAt(0).toUpperCase() + chi.slice(1) + ' è tornato con lo stile del sito. Ricordati di salvare.', { tipo: 'ok', titolo: 'Stile ripristinato' });
}

/* =====================================================================
   9. DISEGNO, RIDISEGNO, EVENTI, REGISTRAZIONE
   ===================================================================== */

/* Le schede disegnate (di solito una Stile e una Avanzate). */
let vivi = [];

export function renderStile(contenitore, meta) { return disegna(contenitore, meta, 'stile'); }
export function renderAvanzate(contenitore, meta) { return disegna(contenitore, meta, 'avanzate'); }

/* L'id del meta come bersaglio di config.stili. Un id nudo di blocco
   (`chi.corpo`) diventa `blocco:chi.corpo`. */
function bersaglioDi(meta) {
  if (!meta || typeof meta.id !== 'string') return null;
  let id = meta.id;
  if (id.indexOf(':') === -1 && meta.tipo === 'blocco') id = 'blocco:' + id;
  const S = sb();
  if (!S) return null;
  const letto = S.leggiBersaglio(id);
  return letto ? letto.tipo + ':' + letto.chiave : null;
}

function disegna(contenitore, meta, scheda) {
  // Il contratto dà (contenitore, meta); un chiamante che li scambia non
  // deve lasciare la scheda bianca.
  if (contenitore && typeof contenitore.append !== 'function' && meta && typeof meta.append === 'function') {
    [contenitore, meta] = [meta, contenitore];
  }
  if (!contenitore || typeof contenitore.append !== 'function') return null;

  const vecchia = Array.from(contenitore.children).find((n) => n.classList.contains('stile') && n.dataset.scheda === scheda) || null;

  /* Stesso elemento, stesso dispositivo, stessi controlli: il guscio ridisegna
     le schede anche dopo una ricarica dell'anteprima o per un clic ripetuto.
     Qui si tiene la scheda com'è e si rileggono solo i valori, così un menu
     aperto resta aperto e il campo in uso non perde il fuoco. */
  const gia = vecchia ? vivi.find((c) => c.radice === vecchia) : null;
  const bersaglioNuovo = bersaglioDi(meta);
  if (gia && bersaglioNuovo && gia.bersaglio === bersaglioNuovo && gia.dispositivo === dispositivoCorrente() &&
      gia.versioneTema === versioneTema && ponte.pronto && sb()) {
    gia.meta = meta;
    if (eProtetto(gia) !== gia.protetto) ridisegna(gia);
    else {
      gia.impronta = impronta(voceDi(gia.bersaglio));
      sincronizzaTutto(gia);
    }
    return vecchia;
  }

  const chiaveFuoco = vecchia && document.activeElement && vecchia.contains(document.activeElement)
    ? document.activeElement.dataset.fuoco || null
    : null;
  const radice = el('div', { classe: 'stile', dati: { scheda } });
  if (vecchia) vecchia.replaceWith(radice);
  else contenitore.append(radice);

  const bersaglio = bersaglioNuovo;
  const ctx = {
    scheda, radice, meta: meta || null, bersaglio,
    tipo: bersaglio ? bersaglio.slice(0, bersaglio.indexOf(':')) : null,
    dispositivo: dispositivoCorrente(), protetto: false, versioneTema,
    campi: [], teste: [], contatori: [], puntiDispositivo: {},
    impronta: '', visto: false, nato: Date.now()
  };
  vivi = vivi.filter((c) => c.radice !== vecchia && tienilo(c));
  vivi.push(ctx);
  dipingi(ctx);
  if (chiaveFuoco) rimettiFuoco(ctx, chiaveFuoco);
  return radice;
}

function tienilo(c) {
  if (c.radice.isConnected) { c.visto = true; return true; }
  // Mai entrata in pagina: un po' di pazienza, il motore può appenderla dopo.
  return !c.visto && Date.now() - c.nato < 10000;
}

function nota(testo) { return el('p', { classe: 'stile__nota', testo }); }

/* Vero se l'elemento è protetto dal contratto o contiene il player. */
function eProtetto(ctx) {
  const S = sb();
  if (S && Array.isArray(S.PROTETTI) && S.PROTETTI.includes(ctx.bersaglio)) return true;
  const nodo = elementoVivo(ctx);
  return Boolean(nodo && (nodo.id === 'twitch-embed' || (typeof nodo.querySelector === 'function' && nodo.querySelector('#twitch-embed'))));
}

function dipingi(ctx) {
  ctx.dispositivo = dispositivoCorrente();
  ctx.versioneTema = versioneTema;
  ctx.campi = [];
  ctx.teste = [];
  ctx.contatori = [];
  ctx.puntiDispositivo = {};
  svuota(ctx.radice);

  if (!sb()) {
    ctx.radice.append(nota('Manca il generatore degli stili (condivisi/stili.js): da qui l\'aspetto non si può cambiare. Ricarica il pannello.'));
    return;
  }
  if (!ctx.meta) { ctx.radice.append(nota('Clicca un elemento nell\'anteprima per cambiarne l\'aspetto.')); return; }
  if (!ctx.bersaglio) { ctx.radice.append(nota('L\'aspetto di questo elemento non si cambia da qui.')); return; }
  if (!ponte.pronto) { ctx.radice.append(nota('Sto ancora caricando i contenuti: fra un attimo si può cambiare l\'aspetto.')); return; }

  ctx.protetto = eProtetto(ctx);
  ctx.radice.append(barraDispositivi(ctx));
  if (ctx.scheda === 'stile') disegnaStile(ctx);
  else disegnaAvanzate(ctx);
  ctx.impronta = impronta(voceDi(ctx.bersaglio));
  sincronizzaTutto(ctx);
}

function barraDispositivi(ctx) {
  const corrente = ctx.dispositivo;
  const scelta = el('div', { classe: 'stile__dispositivi-scelta', role: 'group', 'aria-label': 'Dispositivo da modificare' });
  for (const d of ORDINE_BARRA) {
    const punto = el('span', { classe: 'stile__dispositivo-punto', 'aria-hidden': 'true', hidden: true });
    const lettori = el('span', { classe: 'sr-only' });
    const b = el('button', {
      type: 'button', classe: 'stile__dispositivo', 'aria-pressed': d === corrente ? 'true' : 'false',
      title: NOME[d], dati: { fuoco: 'dispositivo-' + d }
    }, [glifo(d, 15), el('span', { classe: 'stile__dispositivo-nome', testo: NOME[d] }), punto, lettori]);
    b.addEventListener('click', () => cambiaDispositivo(d));
    ctx.puntiDispositivo[d] = { punto, lettori };
    scelta.append(b);
  }
  const barra = el('div', { classe: 'stile__dispositivi', dati: { dispositivo: corrente } }, [
    el('p', { classe: 'stile__stai', role: 'status' }, [
      glifo(corrente, 15),
      el('span', { testo: 'Stai cambiando ' }),
      el('strong', { testo: NOME[corrente] })
    ]),
    scelta
  ]);
  if (corrente !== 'computer') {
    barra.append(el('p', {
      classe: 'stile__dispositivi-nota',
      testo: corrente === 'tablet'
        ? 'Quello che cambi qui vale sui tablet e anche sui telefoni, se lì non scegli altro. Accanto ai nomi trovi quello che arriva da Computer.'
        : 'Quello che cambi qui vale solo sui telefoni. Accanto ai nomi trovi quello che arriva da Tablet o da Computer.'
    }));
  }
  return barra;
}

function cambiaDispositivo(d) {
  try { if (typeof motore.impostaDispositivo === 'function') motore.impostaDispositivo(d); } catch (e) { avverti(e); }
  // Di solito arriva sb:dispositivo e ridisegna; se il motore non lo manda,
  // la scheda si allinea lo stesso.
  setTimeout(() => {
    const ora = dispositivoCorrente();
    for (const c of vivi.slice()) if (c.radice.isConnected && c.dispositivo !== ora) ridisegna(c);
  }, 0);
}

/* Solo intestazioni, contatori e puntini dei dispositivi. */
function segnaTutto(ctx) {
  for (const f of ctx.teste) f();
  for (const f of ctx.contatori) f();
  for (const d of DISPOSITIVI) {
    const p = ctx.puntiDispositivo[d];
    if (!p) continue;
    const acceso = haValori(ctx.bersaglio, d);
    p.punto.hidden = !acceso;
    p.lettori.textContent = acceso ? ' (ha modifiche)' : '';
  }
}

/* Tutti i valori dei controlli, senza rifare i nodi: il campo in cui si
   sta scrivendo non perde il fuoco. */
function sincronizzaTutto(ctx) {
  for (const f of ctx.campi) {
    try { f(); } catch (e) { avverti(e); }
  }
  segnaTutto(ctx);
}

function contenitoreCheScorre(nodo) {
  let p = nodo ? nodo.parentElement : null;
  while (p && p !== document.body) {
    const oy = window.getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

function rimettiFuoco(ctx, chiave) {
  const nodo = ctx.radice.querySelector('[data-fuoco="' + chiave + '"]');
  if (nodo && typeof nodo.focus === 'function') nodo.focus({ preventScroll: true });
}

/* Rifà i nodi (cambio di dispositivo, ripristino, TEMA arrivato) tenendo
   lo scorrimento del pannello e il fuoco sul controllo equivalente. */
function ridisegna(ctx) {
  const attivo = document.activeElement;
  const chiave = attivo && ctx.radice.contains(attivo) && attivo.dataset ? attivo.dataset.fuoco : null;
  const scorre = contenitoreCheScorre(ctx.radice);
  const sopra = scorre ? scorre.scrollTop : 0;
  dipingi(ctx);
  if (scorre) scorre.scrollTop = sopra;
  if (chiave) rimettiFuoco(ctx, chiave);
}

/* Le schede da rifare al prossimo giro: più scritture nello stesso istante
   (un cursore trascinato mentre cambia il dispositivo) ne rifanno una volta. */
const daRidisegnare = new Set();
function ridisegnaPresto(ctx) {
  if (daRidisegnare.has(ctx)) return;
  daRidisegnare.add(ctx);
  setTimeout(() => {
    daRidisegnare.delete(ctx);
    if (ctx.radice.isConnected) ridisegna(ctx);
  }, 0);
}

function ridisegnaTutti() {
  vivi = vivi.filter(tienilo);
  for (const c of vivi.slice()) if (c.radice.isConnected) ridisegna(c);
}

/* Controlla ogni scheda viva: dispositivo cambiato → si ridisegna; dati
   cambiati da fuori (Annulla, TEMA che toglie un font) → si risincronizza. */
function controllaVivi({ forza = false } = {}) {
  vivi = vivi.filter(tienilo);
  const ora = dispositivoCorrente();
  for (const c of vivi.slice()) {
    if (!c.radice.isConnected) continue;
    if (c.bersaglio && c.dispositivo !== ora) { ridisegna(c); continue; }
    if (!c.bersaglio) continue;
    const firma = impronta(voceDi(c.bersaglio));
    if (forza || firma !== c.impronta) {
      c.impronta = firma;
      sincronizzaTutto(c);
    }
  }
}

document.addEventListener('sb:dispositivo', () => {
  setTimeout(() => controllaVivi(), 0);
});

document.addEventListener('sb:sostituito', () => {
  // I dati sono un oggetto nuovo: i valori si rileggono, e un campo in
  // scrittura resta dov'è.
  setTimeout(() => controllaVivi({ forza: true }), 0);
});

document.addEventListener('sb:anteprima-pronta', () => {
  // L'elemento dell'anteprima è un nodo nuovo: servono i suoi valori per
  // «come nel sito». Un fotogramma dopo, quando il motore ha già rimesso
  // tema e stili dal vivo.
  const giro = () => {
    for (const c of vivi) {
      if (!c.radice.isConnected || !c.bersaglio) continue;
      if (eProtetto(c) !== c.protetto) ridisegna(c);
    }
    controllaVivi({ forza: true });
  };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(giro);
  else setTimeout(giro, 16);
});

document.addEventListener('sb:modifica', (evento) => {
  const chiave = evento.detail && typeof evento.detail.chiave === 'string' ? evento.detail.chiave : '';
  if (chiave.startsWith('config.stili')) {
    controllaVivi();
  } else if (chiave.startsWith('config.tema')) {
    // Il tema dal vivo arriva dal server: i colori «come nel sito» si
    // rileggono quando è già nell'anteprima.
    setTimeout(() => controllaVivi({ forza: true }), 400);
  }
});

document.addEventListener('sb:pronto', () => {
  setTimeout(ridisegnaTutti, 0);
});

try {
  motore.registraIspettore(renderStile, { scheda: 'stile', ordine: 10, quando: () => true });
  motore.registraIspettore(renderAvanzate, { scheda: 'avanzate', ordine: 50, quando: () => true });
} catch (e) {
  avverti(e);
}
