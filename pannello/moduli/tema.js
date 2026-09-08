/* =====================================================================
   tema.js — la matematica dell'aspetto e la barra delle combinazioni.

   Qui dentro non c'e' una sola chiamata di rete: il catalogo dei font e
   le combinazioni pronte arrivano gia' pronti (li chiede pannello.js a
   GET /api/contenuti), e quello che si fa qui e' disegnarli e calcolarci
   sopra. La divisione e' voluta: questo file si puo' leggere, capire e
   correggere senza sapere niente delle API.

   Il calcolo del contrasto e' la parte che rende onesto il gruppo
   «Aspetto». Senza, si sceglie un grigio chiaro su fondo chiaro e ci si
   accorge del guaio solo dopo aver pubblicato, dal telefono, al sole.

   Esporta:
     creaBarraTema(ctx, { preset, onApplica })  -> nodo con le combinazioni
     contrasto(a, b)                            -> rapporto WCAG (numero)
     etichettaContrasto(rapporto)               -> { livello, testo, grave }
     precaricaFont(nomi)                        -> Promise, carica le anteprime
   ===================================================================== */

import { el, bottone } from './dom.js';

/* ---------------------------------------------------------------------
   1. Colori: da testo a numeri
   --------------------------------------------------------------------- */

/**
 * Da qualunque scrittura ragionevole a [r, g, b] con 0..255, oppure null.
 * L'alfa viene ignorata di proposito: un colore semitrasparente ha un
 * contrasto che dipende da cosa gli sta sotto, e qui sotto non lo
 * sappiamo. Meglio calcolare sul colore pieno che dare un numero finto.
 */
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

  // rgb() / rgba(): capita di incollarlo da un altro strumento.
  const rgb = testo.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const pezzi = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (pezzi.length === 3 && pezzi.every((n) => Number.isFinite(n))) {
      return pezzi.map((n) => Math.min(255, Math.max(0, Math.round(n))));
    }
  }
  return null;
}

/** Correzione di gamma della singola componente, come da formula WCAG. */
function canale(valore) {
  const s = valore / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminanza relativa: quanta luce manda quel colore, da 0 (nero) a 1 (bianco). */
function luminanza(rgb) {
  return 0.2126 * canale(rgb[0]) + 0.7152 * canale(rgb[1]) + 0.0722 * canale(rgb[2]);
}

/**
 * Rapporto di contrasto WCAG fra due colori, da 1 (identici) a 21
 * (nero su bianco).
 *
 * Il risultato e' arrotondato a due decimali *prima* di uscire, e le
 * soglie si applicano al numero arrotondato: cosi' il verdetto e il
 * numero mostrato dicono la stessa cosa, invece di leggere «4,50:1» con
 * scritto accanto che e' sotto la soglia di 4,5.
 */
export function contrasto(coloreA, coloreB) {
  const a = componenti(coloreA);
  const b = componenti(coloreB);
  // Se uno dei due non si capisce, 1 e' il verdetto piu' prudente:
  // nessun contrasto, quindi avviso acceso.
  if (!a || !b) return 1;

  const la = luminanza(a);
  const lb = luminanza(b);
  const chiaro = Math.max(la, lb);
  const scuro = Math.min(la, lb);
  return Math.round(((chiaro + 0.05) / (scuro + 0.05)) * 100) / 100;
}

/** Numero con la virgola, come si scrive in italiano. */
function conVirgola(n) {
  return n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

/**
 * Verdetto leggibile su un rapporto di contrasto.
 * `grave` e' vero sotto 4,5:1, cioe' la soglia del testo normale: e' il
 * punto in cui il pannello deve smettere di essere gentile.
 */
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

/* ---------------------------------------------------------------------
   2. Anteprime dei font

   Google Fonts e' l'unico CDN ammesso dal contratto, ed e' anche l'unico
   modo per far vedere un font che non e' installato sul computer di chi
   amministra. Si carica solo il peso normale: serve a leggere il nome
   scritto nel font vero, non a comporre una pagina.
   --------------------------------------------------------------------- */

const GENERICI = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif', 'inherit', 'initial'
]);

const famiglieCaricate = new Set();

/** Il nome della famiglia, sia che arrivi come stringa sia come voce di catalogo. */
function nomeFamiglia(voce) {
  if (voce && typeof voce === 'object') return String(voce.nome || voce.famiglia || voce.valore || '').trim();
  return String(voce || '').trim();
}

/** Le famiglie di sistema non stanno su Google Fonts: chiederle sarebbe un 404. */
function daGoogle(voce) {
  const nome = nomeFamiglia(voce);
  if (!nome || nome.includes(',')) return false;                 // e' uno stack, non una famiglia
  if (GENERICI.has(nome.toLowerCase())) return false;
  if (voce && typeof voce === 'object') {
    if (voce.google === false || voce.sistema === true) return false;
    if (String(voce.categoria || '').toLowerCase() === 'sistema') return false;
  }
  return true;
}

/**
 * Carica da Google Fonts le famiglie indicate, una volta sola.
 * Non lancia mai: se la rete non c'e', le anteprime restano nel font di
 * ripiego e il pannello continua a funzionare.
 *
 * @param {Array<string|object>} nomi  nomi o voci del catalogo
 * @returns {Promise<boolean>} vero se il foglio e' arrivato
 */
export function precaricaFont(nomi) {
  const famiglie = [].concat(nomi || [])
    .filter(daGoogle)
    .map(nomeFamiglia)
    .filter((nome, indice, tutte) => tutte.indexOf(nome) === indice && !famiglieCaricate.has(nome));

  if (!famiglie.length) return Promise.resolve(true);
  for (const nome of famiglie) famiglieCaricate.add(nome);

  // css2 vuole i nomi con il «+» al posto degli spazi.
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
    // Rete lenta o bloccata: dopo cinque secondi si va avanti lo stesso,
    // nessuno deve restare a guardare un menu vuoto.
    setTimeout(() => risolvi(false), 5000);
  });
}

/* ---------------------------------------------------------------------
   3. La barra delle combinazioni pronte

   Un preset cambia tutto il gruppo «Aspetto» in un colpo solo. Non e' una
   scorciatoia per pigri: e' l'unico modo per cambiare tema senza dover
   ragionare su dodici colori e sperare che stiano insieme.
   --------------------------------------------------------------------- */

const ORDINE_CAMPIONI = ['viola', 'ciano', 'magenta', 'fondo', 'testo'];

function clonaTema(tema) {
  if (typeof structuredClone === 'function') return structuredClone(tema);
  return JSON.parse(JSON.stringify(tema));
}

/* ------------------------------------------------- la fotografia iniziale

   «Ripristina i colori di partenza» ha bisogno di sapere quali erano.
   Chi monta la barra puo' dirlo (opzione `predefinito`, oppure
   `onRipristina`); se non lo dice, i colori di partenza onesti sono
   quelli che c'erano nel gruppo quando il pannello e' stato aperto, e si
   leggono dai campi stessi: ogni `.campo` porta la sua chiave in
   `data-chiave`, che e' l'unico contratto che serve.

   La fotografia si scatta una volta sola per sessione: dopo aver provato
   un preset il gruppo si ridisegna, e rifarla vorrebbe dire promettere di
   riportare indietro fino al preset, cioe' non riportare indietro niente. */

let fotografiaIniziale = null;

/* Campi che non sono roba da tema: dentro hanno altri campi, e leggerli
   con una querySelector prenderebbe il primo input che capita. */
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

/** Il ramo comune di un gruppo di chiavi: «config.tema.colori.viola» + … -> «config.tema». */
function prefissoComune(chiavi) {
  if (!chiavi.length) return '';
  let comune = chiavi[0].split('.');
  for (const chiave of chiavi.slice(1)) {
    const pezzi = chiave.split('.');
    let quanti = 0;
    while (quanti < comune.length && quanti < pezzi.length && comune[quanti] === pezzi[quanti]) quanti += 1;
    comune = comune.slice(0, quanti);
  }
  // Con una chiave sola il «prefisso» sarebbe la chiave stessa: l'ultimo
  // pezzo e' il campo, non il ramo che lo contiene.
  if (comune.join('.') === chiavi[0]) comune.pop();
  return comune.join('.');
}

/**
 * Da { 'config.tema.colori.viola': '#8b2fff', … } a { colori: { viola: … } }:
 * la stessa forma che hanno i preset, cosi' chi applica non distingue.
 */
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

/** Legge i campi che stanno insieme alla barra, e ne fa un tema. */
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

/** I cinque pallini colorati che fanno capire il preset prima di provarlo. */
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

/**
 * Barra dei preset con il bottone di ripristino.
 *
 * @param {object} ctx      il contesto dei campi (usa solo `conferma`, se c'e')
 * @param {object} opzioni
 *   - preset: [ { id, nome, descrizione?, tema } ]   dalle API
 *   - onApplica(tema, info): chiamata con il tema scelto, gia' clonato.
 *     `info` = { id, nome, ripristino }, per chi vuole distinguere il caso.
 *   - predefinito / temaIniziale: il tema di partenza per il ripristino.
 *   - onRipristina(): se c'e', il ripristino chiama questa invece di
 *     `onApplica` (serve a chi il tema di partenza ce l'ha nei dati).
 *
 * Le ultime due sono facoltative: senza, il ripristino si appoggia alla
 * fotografia dei campi del gruppo, scattata la prima volta che la barra
 * finisce in pagina. Il bottone quindi funziona anche se chi monta la
 * barra passa solo `preset` e `onApplica`, come dice il contratto §10.1.
 *
 * @returns {HTMLElement} il nodo, gia' pronto da appendere
 */
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

    // Il bottone si veste del preset che rappresenta: fondo e testo veri,
    // cosi' si vede subito se quella combinazione e' leggibile o no.
    if (componenti(colori.fondo)) bottoneVoce.style.background = colori.fondo;
    if (componenti(colori.testo)) bottoneVoce.style.color = colori.testo;
    if (componenti(colori.viola)) bottoneVoce.style.borderColor = colori.viola;

    griglia.append(bottoneVoce);
  }

  if (!elenco.length) {
    griglia.append(el('p', { classe: 'preset__vuoto', testo: 'Il server non ha mandato combinazioni pronte: i colori si scelgono uno per uno qui sotto.' }));
  }

  /* --- ripristino ---
     Il tema di partenza puo' arrivare dichiarato (`predefinito`, un preset
     marcato, `ctx.tema.predefinito`) oppure, in mancanza d'altro, dalla
     fotografia dei campi scattata quando il gruppo si e' aperto. */
  const dichiarato = predefinito || temaIniziale ||
    (ctx && ctx.tema && ctx.tema.predefinito) ||
    (elenco.find((p) => p.predefinito === true || p.id === 'predefinito' || p.id === 'partenza') || {}).tema || null;

  const daRipristinare = () => dichiarato || fotografiaIniziale;

  const btnRipristina = bottone({
    testo: 'Ripristina i colori di partenza',
    ico: 'ricarica',
    classe: 'btn btn--fantasma',
    disabilitato: true,   // si accende quando si sa a cosa tornare
    titolo: 'Rimette i colori e i font com\'erano prima delle tue prove.',
    su: async () => {
      const partenza = daRipristinare();
      if (typeof onRipristina !== 'function' && !partenza) return;
      // Il ripristino butta via le prove fatte: qui la conferma ci vuole,
      // mentre sui preset no (provarli in fretta e' il loro senso).
      if (typeof ctx?.conferma === 'function') {
        const ok = await ctx.conferma({
          titolo: 'Rimetto i colori di partenza?',
          testo: [
            'Tutte le modifiche fatte all\'aspetto tornano com\'erano quando hai aperto il pannello.',
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

  /* La fotografia si puo' scattare solo quando la barra e' gia' appesa
     accanto ai campi, cioe' subito dopo che chi ci chiama l'ha messa in
     pagina: da qui dentro, il momento buono e' il microtask successivo.
     Se la barra non viene appesa, non si scatta niente e il bottone resta
     spento con il suo perche' scritto sopra. */
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
