'use strict';
/* =====================================================================
   tema.js — il tema del sito come dato.

   Chi amministra sceglie dodici colori, tre font, tre numeri e l'intensita
   degli aloni. Da li esce TUTTO il contenuto di css/tema.css, che viene
   caricato subito dopo css/tokens.css e ne riscrive i token. tokens.css
   resta il valore di partenza e non si tocca mai: se tema.css manca, il
   sito ha comunque una palette completa e non se ne accorge nessuno.

   Due cose non ovvie, ed e il motivo per cui questo file esiste invece di
   quattro sostituzioni testuali dentro un foglio scritto a mano:

   1. I TOKEN DERIVATI. Vetri, linee, veli, gradienti, aloni e bagliori non
      sono colori che qualcuno sceglie: si calcolano dai dodici colori e
      dai tre numeri. Chi amministra decide il fondo e il colore guida, non
      «l'alpha del riflesso in cima ai pannelli».

   2. LA POLARITA. Le linee e i vetri del sito sono bianchi con alpha
      bassissima perche il fondo e quasi nero: cosi la linea prende la
      tinta di cio che ha sotto invece di sembrare grigia. Su un fondo
      chiaro quella stessa linea sparisce. Si misura quindi la luminanza
      relativa del fondo (formula WCAG) e sopra 0.5 tutto cio che e
      «bianco con alpha» diventa «nero con alpha». Senza, il primo tema
      chiaro romperebbe il sito da solo.

   --twitch non compare qui: e il viola ufficiale di Twitch, marchio
   altrui, e resta quello di tokens.css.
   ===================================================================== */

/* ------------------------------------------------------------------ */
/* ARITMETICA DEI COLORI                                               */
/* ------------------------------------------------------------------ */

const BIANCO = { r: 255, g: 255, b: 255 };
const NERO = { r: 0, g: 0, b: 0 };

function limite(n, min, max) { return n < min ? min : (n > max ? max : n); }

/** Legge #rgb o #rrggbb. Restituisce null se non e un colore: chi chiama decide. */
function leggiColore(valore) {
  if (typeof valore !== 'string') { return null; }
  const testo = valore.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(testo)) {
    return {
      r: parseInt(testo[0] + testo[0], 16),
      g: parseInt(testo[1] + testo[1], 16),
      b: parseInt(testo[2] + testo[2], 16)
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(testo)) {
    return {
      r: parseInt(testo.slice(0, 2), 16),
      g: parseInt(testo.slice(2, 4), 16),
      b: parseInt(testo.slice(4, 6), 16)
    };
  }
  return null;
}

function canale(n) { return limite(Math.round(n), 0, 255); }

function esadecimale(colore) {
  const due = (n) => canale(n).toString(16).padStart(2, '0');
  return '#' + due(colore.r) + due(colore.g) + due(colore.b);
}

/** Tre decimali: oltre non cambia un pixel e allunga il file. */
function alfa(n) { return String(Math.round(limite(n, 0, 1) * 1000) / 1000); }

function rgba(colore, opacita) {
  return 'rgba(' + canale(colore.r) + ', ' + canale(colore.g) + ', ' + canale(colore.b) + ', ' + alfa(opacita) + ')';
}

/** Miscela lineare fra due colori: t = 0 il primo, t = 1 il secondo. */
function misto(a, b, t) {
  const q = limite(t, 0, 1);
  return { r: a.r + (b.r - a.r) * q, g: a.g + (b.g - a.g) * q, b: a.b + (b.b - a.b) * q };
}

function lineare(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminanza relativa WCAG: 0 = nero, 1 = bianco. E lei che decide la polarita. */
function luminanza(colore) {
  return 0.2126 * lineare(colore.r) + 0.7152 * lineare(colore.g) + 0.0722 * lineare(colore.b);
}

/* ------------------------------------------------------------------ */
/* CATALOGO DEI FONT                                                   */
/* ------------------------------------------------------------------ */

/*
   Tre slot, una lista curata per ognuno. Di ogni famiglia servono:
   - `pesi`, gli unici che il sito usa davvero: chiederne altri a Google
     vuol dire scaricare file che nessuno mostra;
   - `ripiego`, uno stack di sistema con metriche vicine, cosi lo scambio a
     font caricato non sposta il layout in modo vistoso;
   - `categoria`, che il pannello mostra accanto al nome.

   La voce «Font di sistema» ha `pesi` vuoto ed e il modo per non chiamare
   Google affatto: se sono di sistema tutti e tre, sito.fontUrl resta vuoto
   e il modello non stampa nessun <link>.
*/

const RIPIEGO_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const RIPIEGO_GROTTESCO = "'Segoe UI', system-ui, -apple-system, sans-serif";
const RIPIEGO_STRETTO = "'Arial Narrow', 'Segoe UI', system-ui, sans-serif";
const RIPIEGO_SERIF = "Georgia, 'Times New Roman', serif";
const RIPIEGO_MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'SFMono-Regular', monospace";

const SISTEMA_SANS = { nome: 'Font di sistema', pesi: [], ripiego: RIPIEGO_SANS, categoria: 'sistema' };
const SISTEMA_MONO = { nome: 'Font di sistema', pesi: [], ripiego: RIPIEGO_MONO, categoria: 'sistema' };

const CATALOGO_FONT = {
  // Titoli e marchio: pochi caratteri, molto grandi. Servono 500 e 700.
  titolo: [
    { nome: 'Space Grotesk', pesi: [500, 700], ripiego: RIPIEGO_GROTTESCO, categoria: 'grottesco' },
    { nome: 'Chakra Petch', pesi: [500, 700], ripiego: RIPIEGO_GROTTESCO, categoria: 'squadrato' },
    { nome: 'Archivo', pesi: [500, 700], ripiego: RIPIEGO_GROTTESCO, categoria: 'grottesco' },
    { nome: 'Sora', pesi: [500, 700], ripiego: RIPIEGO_SANS, categoria: 'geometrico' },
    { nome: 'Rubik', pesi: [500, 700], ripiego: RIPIEGO_SANS, categoria: 'geometrico' },
    { nome: 'Oswald', pesi: [500, 700], ripiego: RIPIEGO_STRETTO, categoria: 'condensato' },
    { nome: 'Playfair Display', pesi: [500, 700], ripiego: RIPIEGO_SERIF, categoria: 'serif' },
    SISTEMA_SANS
  ],
  // Testo corrente: 400 per il corpo, 600 per il grassetto dei testi ricchi.
  testo: [
    { nome: 'Manrope', pesi: [400, 600], ripiego: RIPIEGO_SANS, categoria: 'grottesco' },
    { nome: 'Inter', pesi: [400, 600], ripiego: RIPIEGO_SANS, categoria: 'grottesco' },
    { nome: 'Work Sans', pesi: [400, 600], ripiego: RIPIEGO_SANS, categoria: 'grottesco' },
    { nome: 'Source Sans 3', pesi: [400, 600], ripiego: RIPIEGO_SANS, categoria: 'umanista' },
    { nome: 'IBM Plex Sans', pesi: [400, 600], ripiego: RIPIEGO_SANS, categoria: 'umanista' },
    { nome: 'Nunito Sans', pesi: [400, 600], ripiego: RIPIEGO_SANS, categoria: 'arrotondato' },
    { nome: 'Lora', pesi: [400, 600], ripiego: RIPIEGO_SERIF, categoria: 'serif' },
    SISTEMA_SANS
  ],
  // Strumentazione: etichette maiuscole, numeri, conto alla rovescia.
  mono: [
    { nome: 'JetBrains Mono', pesi: [400, 500], ripiego: RIPIEGO_MONO, categoria: 'monospazio' },
    { nome: 'IBM Plex Mono', pesi: [400, 500], ripiego: RIPIEGO_MONO, categoria: 'monospazio' },
    { nome: 'Roboto Mono', pesi: [400, 500], ripiego: RIPIEGO_MONO, categoria: 'monospazio' },
    { nome: 'Source Code Pro', pesi: [400, 500], ripiego: RIPIEGO_MONO, categoria: 'monospazio' },
    { nome: 'Space Mono', pesi: [400, 700], ripiego: RIPIEGO_MONO, categoria: 'monospazio' },
    SISTEMA_MONO
  ]
};

const SLOT = ['titolo', 'testo', 'mono'];

/** La famiglia con questo nome in questo slot, oppure null. */
function famigliaDi(slot, nome) {
  for (const famiglia of CATALOGO_FONT[slot] || []) {
    if (famiglia.nome === nome) { return famiglia; }
  }
  return null;
}

/** Valore pronto per --font-*: la famiglia scelta e dietro il suo ripiego. */
function pilaFont(famiglia) {
  return famiglia.pesi.length ? "'" + famiglia.nome + "', " + famiglia.ripiego : famiglia.ripiego;
}

/* ------------------------------------------------------------------ */
/* IL TEMA DI PARTENZA                                                 */
/* ------------------------------------------------------------------ */

/*
   I nomi dei colori sono RUOLI, non tinte: `viola` e il colore guida (CTA,
   aloni, cio che e del canale), `ciano` e tutto cio che e acceso, `magenta`
   l'accento raro, `violaChiaro` la versione del colore guida con cui si puo
   SCRIVERE. In un tema arancione, `viola` sara arancione: rinominarli
   avrebbe voluto dire cambiarli anche in tokens.css e nei cinque fogli che
   li consumano, cioe rifare il sito per una questione di vocabolario.
*/
const PREDEFINITO = {
  colori: {
    viola: '#8b2fff', violaCupo: '#4b1391', violaChiaro: '#c5a4ff',
    ciano: '#22e0ff', magenta: '#ff2fa0',
    live: '#ff3d5e', ok: '#35e0a1', allerta: '#ffc65c',
    fondo: '#07070c', testo: '#f2f0f8', testoMedio: '#c3bdd6', testoTenue: '#9a93b0'
  },
  font: { titolo: 'Space Grotesk', testo: 'Manrope', mono: 'JetBrains Mono' },
  forma: { raggio: 14, maxLarghezza: 1360, passo: 8 },
  sfondo: { aloni: 100 }
};

// Limiti dei numeri di forma. Non sono gusti: fuori da qui il layout smette
// di funzionare, perche il passo moltiplica ogni spaziatura del sito e la
// larghezza massima deve restare sopra al binario piu il contenuto.
const LIMITI = {
  raggio: [0, 40],
  maxLarghezza: [960, 2000],
  passo: [4, 16],
  aloni: [0, 200]
};

function numero(valore, chiave, riserva) {
  const n = Number(valore);
  if (!isFinite(n)) { return riserva; }
  return Math.round(limite(n, LIMITI[chiave][0], LIMITI[chiave][1]));
}

/**
 * Un tema completo e valido, sempre. Quello che arriva puo essere parziale
 * o sbagliato — dal pannello arriva anche mentre si sta digitando «#ab» —
 * e in quel caso vale il valore di partenza: l'anteprima dei colori non
 * deve rispondere 500 a meta di un esadecimale. Chi deve protestare per un
 * valore fuori posto e la convalida, non il generatore del foglio.
 */
function normalizza(tema) {
  const arrivo = (tema && typeof tema === 'object' && !Array.isArray(tema)) ? tema : {};
  const colori = {};
  for (const chiave of Object.keys(PREDEFINITO.colori)) {
    const letto = leggiColore((arrivo.colori || {})[chiave]);
    colori[chiave] = letto ? esadecimale(letto) : PREDEFINITO.colori[chiave];
  }

  const font = {};
  for (const slot of SLOT) {
    const nome = (arrivo.font || {})[slot];
    font[slot] = famigliaDi(slot, nome) ? nome : PREDEFINITO.font[slot];
  }

  const forma = {};
  for (const chiave of Object.keys(PREDEFINITO.forma)) {
    forma[chiave] = numero((arrivo.forma || {})[chiave], chiave, PREDEFINITO.forma[chiave]);
  }

  return {
    colori: colori,
    font: font,
    forma: forma,
    sfondo: { aloni: numero((arrivo.sfondo || {}).aloni, 'aloni', PREDEFINITO.sfondo.aloni) }
  };
}

/* ------------------------------------------------------------------ */
/* GOOGLE FONTS                                                        */
/* ------------------------------------------------------------------ */

/**
 * L'indirizzo css2 con le famiglie scelte e i soli pesi del catalogo.
 * Stringa vuota se sono tutti font di sistema: in quel caso il modello non
 * stampa il <link> e la pagina non contatta nessuno.
 */
function urlGoogleFonts(tema) {
  const scelto = normalizza(tema);
  // Una famiglia usata in due slot va chiesta una volta sola, con l'unione
  // dei pesi: due `family=` uguali nello stesso indirizzo sono uno spreco.
  const famiglie = new Map();
  for (const slot of SLOT) {
    const famiglia = famigliaDi(slot, scelto.font[slot]);
    if (!famiglia || !famiglia.pesi.length) { continue; }
    const pesi = famiglie.get(famiglia.nome) || new Set();
    for (const peso of famiglia.pesi) { pesi.add(peso); }
    famiglie.set(famiglia.nome, pesi);
  }
  if (!famiglie.size) { return ''; }

  const parti = [];
  for (const coppia of famiglie) {
    const ordinati = Array.from(coppia[1]).sort((a, b) => a - b);
    parti.push('family=' + encodeURIComponent(coppia[0]).replace(/%20/g, '+') + ':wght@' + ordinati.join(';'));
  }
  // display=swap: il testo si legge subito col font di ripiego e viene
  // ridisegnato quando arriva quello vero. Mai una pagina vuota per un font.
  return 'https://fonts.googleapis.com/css2?' + parti.join('&') + '&display=swap';
}

/* ------------------------------------------------------------------ */
/* INTENSITA — l'unica tabella di numeri fissi, e dipende dalla polarita */
/* ------------------------------------------------------------------ */

/*
   Le due colonne non sono la stessa cosa col segno cambiato. Nero al 7% su
   un fondo chiaro si vede MENO di bianco al 7% su un fondo scuro (la
   luminanza non e lineare), quindi sul chiaro le alpha salgono. Il riflesso
   in cima ai vetri, poi, cambia natura: su fondo scuro e un accenno del
   colore guida, su fondo chiaro puo essere solo bianco, perche una
   superficie gia chiara non si schiarisce con una tinta.
*/
const INTENSITA = {
  scura: {
    fondo2: 0.012, pannello: 0.020, pannello2: 0.050,
    vetro: 0.72, vetro2: 0.78, velo: 0.78,
    linea: 0.07, lineaForte: 0.15, lineaComando: 0.34,
    riflesso: 0.10, riflessoCoda: 0.02, incavo: 0.12,
    alone: 1, bagliore: 0.45, bagliore2: 0.40
  },
  chiara: {
    fondo2: 0.030, pannello: 0.045, pannello2: 0.090,
    vetro: 0.80, vetro2: 0.86, velo: 0.82,
    linea: 0.10, lineaForte: 0.20, lineaComando: 0.42,
    riflesso: 0.55, riflessoCoda: 0.14, incavo: 0.07,
    // Un alone colorato su fondo chiaro si nota molto piu che sul nero:
    // alla stessa impostazione va tenuto piu basso o diventa una macchia.
    alone: 0.55, bagliore: 0.55, bagliore2: 0.50
  }
};

// Geometria degli aloni della pagina: e la nebulosa del banner. Le misure
// non dipendono dal tema, solo la tinta e l'intensita.
const ALONI = [
  { misura: '1200px 780px', dove: ' 50% -12%', tinta: 'viola', peso: 0.220, coda: '70%' },
  { misura: ' 900px 640px', dove: '104%  10%', tinta: 'ciano', peso: 0.055, coda: '66%' },
  { misura: ' 980px 800px', dove: '-10%  58%', tinta: 'magenta', peso: 0.050, coda: '68%' },
  { misura: ' 820px 560px', dove: ' 30% 108%', tinta: 'violaCupo', peso: 0.280, coda: '72%' }
];

/* ------------------------------------------------------------------ */
/* IL FOGLIO                                                           */
/* ------------------------------------------------------------------ */

// La sostituzione finale toglie lo spazio prima dell'a capo dei valori su piu
// righe (il gradiente della pagina): uno spazio in coda non si vede ma sporca
// il diff a ogni rigenerazione.
function riga(nome, valore) { return ('  ' + nome + ': ' + valore + ';').replace(/ +\n/g, '\n'); }

/** Lo sfondo completo del body: base.css fa solo background: var(--grad-pagina). */
function gradientePagina(c, forza, I) {
  const k = (forza / 100) * I.alone;
  // Zero aloni vuol dire fondo piatto: quattro gradienti a zero darebbero lo
  // stesso risultato con quattro strati da comporre a ogni ridisegno.
  if (k <= 0) { return esadecimale(c.fondo); }

  const strati = ALONI.map((alone) => {
    const tinta = c[alone.tinta];
    return 'radial-gradient(' + alone.misura + ' at ' + alone.dove + ', ' +
      rgba(tinta, alone.peso * k) + ', ' + rgba(tinta, 0) + ' ' + alone.coda +
      ') 0 0 / 100% 100% no-repeat fixed';
  });
  // Le code sono rgba(..., 0) e non «transparent»: transparent interpola
  // passando per il nero e lascia l'alone sporco verso i bordi.
  return '\n    ' + strati.join(',\n    ') + ',\n    ' + esadecimale(c.fondo);
}

/** Il contenuto completo di css/tema.css. Non lancia mai. */
function css(tema) {
  const t = normalizza(tema);

  const c = {};
  for (const chiave of Object.keys(t.colori)) { c[chiave] = leggiColore(t.colori[chiave]); }

  const lum = luminanza(c.fondo);
  const chiara = lum > 0.5;
  const I = chiara ? INTENSITA.chiara : INTENSITA.scura;
  // L'inchiostro e il colore con cui si disegnano linee e veli: l'opposto
  // del fondo. La polarita automatica e tutta qui.
  const inchiostro = chiara ? NERO : BIANCO;
  const riflesso = chiara ? BIANCO : c.violaChiaro;

  // Le superfici nascono tutte dal fondo tinto col colore guida e spinto di
  // un soffio verso l'inchiostro: cosi un pannello si stacca dalla pagina
  // qualunque sia il fondo, e prende comunque la luce dell'alone su cui sta.
  const fondo2 = misto(misto(c.fondo, c.viola, 0.030), inchiostro, I.fondo2);
  const pannello = misto(misto(c.fondo, c.viola, 0.090), inchiostro, I.pannello);
  const pannello2 = misto(misto(c.fondo, c.viola, 0.130), inchiostro, I.pannello2);

  const raggio = t.forma.raggio;
  const font = {};
  for (const slot of SLOT) { font[slot] = pilaFont(famigliaDi(slot, t.font[slot])); }

  // Da qui in giù si scrive il file che chi amministra apre: è italiano
  // vero, con gli accenti, non l'ASCII dei commenti del codice.
  const righe = [
    '/* =============================================================================',
    '   tema.css — FILE GENERATO. Non si modifica a mano.',
    '',
    '   Lo riscrivono `node server/genera.js` e il tasto Pubblica del pannello, a',
    '   partire da config.tema in contenuti/contenuti.json e da server/lib/tema.js.',
    '   Qualunque modifica fatta qui dentro sparisce alla generazione successiva:',
    '   si cambia il tema dal pannello, non il file generato.',
    '',
    '   Caricato subito DOPO css/tokens.css, che resta il valore di partenza: qui',
    '   ci sono solo i token che il tema riscrive. --twitch non c’è, ed è voluto:',
    '   è il viola ufficiale di Twitch, marchio altrui, e resta quello di tokens.css.',
    '',
    '   Polarità: ' + (chiara ? 'CHIARA' : 'SCURA') + ' — luminanza del fondo ' + lum.toFixed(3) +
      ', quindi linee, vetri e veli sono ' + (chiara ? 'neri' : 'bianchi') + ' con alpha.',
    '   Aloni: ' + t.sfondo.aloni + '%.  Font: ' + t.font.titolo + ' / ' + t.font.testo + ' / ' + t.font.mono + '.',
    '   ============================================================================= */',
    '',
    ':root {',
    '',
    '  /* --- MARCHIO E STATI — gli unici colori scelti a mano ------------------- */',
    riga('--viola', esadecimale(c.viola)),
    riga('--viola-cupo', esadecimale(c.violaCupo)),
    riga('--viola-chiaro', esadecimale(c.violaChiaro)),
    riga('--ciano', esadecimale(c.ciano)),
    riga('--magenta', esadecimale(c.magenta)),
    riga('--live', esadecimale(c.live)),
    riga('--ok', esadecimale(c.ok)),
    riga('--allerta', esadecimale(c.allerta)),
    '',
    '  /* --- TESTO -------------------------------------------------------------- */',
    riga('--testo', esadecimale(c.testo)),
    riga('--testo-medio', esadecimale(c.testoMedio)),
    riga('--testo-tenue', esadecimale(c.testoTenue)),
    '',
    '  /* --- SUPERFICI -----------------------------------------------------------',
    '     I due fondi sono opachi, i due pannelli sono vetri: hanno alpha, quindi',
    '     lasciano passare l’alone che si trovano sotto. Derivano tutti dal fondo,',
    '     tinto col colore guida e spostato di poco verso l’inchiostro. */',
    riga('--fondo', esadecimale(c.fondo)),
    riga('--fondo-2', esadecimale(fondo2)),
    riga('--pannello', rgba(pannello, I.vetro)),
    riga('--pannello-2', rgba(pannello2, I.vetro2)),
    riga('--velo', rgba(c.fondo, I.velo)),
    '',
    '  /* --- LINEE ---------------------------------------------------------------',
    '     Inchiostro con alpha, non un grigio: così la linea prende la tinta di',
    '     quello che ha sotto. --linea-comando è l’alpha più bassa che porta il',
    '     bordo di un comando a 3:1 (WCAG 1.4.11); --linea-viva è l’unica tinta. */',
    riga('--linea', rgba(inchiostro, I.linea)),
    riga('--linea-forte', rgba(inchiostro, I.lineaForte)),
    riga('--linea-comando', rgba(inchiostro, I.lineaComando)),
    riga('--linea-viva', rgba(c.viola, 0.55)),
    '',
    '  /* --- COMPOSIZIONI -------------------------------------------------------- */',
    riga('--grad-pagina', gradientePagina(c, t.sfondo.aloni, I)),
    '',
    '  /* Riempimento del titolo grande (background-clip: text): solo tinte',
    '     leggibili sul fondo, così il titolo si legge e non è solo decorativo. */',
    riga('--grad-titolo', 'linear-gradient(98deg, ' + esadecimale(c.testo) + ' 0%, ' +
      esadecimale(c.violaChiaro) + ' 48%, ' + esadecimale(c.ciano) + ' 100%)'),
    '',
    '  /* Vetro dei pannelli: riflesso in alto che si spegne subito, incavo in',
    '     basso. Va SOPRA a --pannello, non al posto suo. */',
    riga('--grad-pannello', 'linear-gradient(168deg, ' + rgba(riflesso, I.riflesso) + ' 0%, ' +
      rgba(riflesso, I.riflessoCoda) + ' 38%, ' + rgba(NERO, I.incavo) + ' 100%)'),
    '',
    '  /* --- BAGLIORI — pronti per box-shadow o filter: drop-shadow() ------------ */',
    riga('--bagliore-viola', '0 0 24px ' + rgba(c.viola, I.bagliore)),
    riga('--bagliore-ciano', '0 0 20px ' + rgba(c.ciano, I.bagliore2)),
    '',
    '  /* --- FORMA ---------------------------------------------------------------',
    '     Un raggio solo, e gli altri due ne discendono: 0.57x per gli elementi',
    '     piccoli e 1.57x per il telaio del monitor. Le proporzioni restano quelle',
    '     anche quando il raggio cambia. */',
    riga('--raggio', raggio + 'px'),
    riga('--raggio-s', Math.round(raggio * 0.57) + 'px'),
    riga('--raggio-g', Math.round(raggio * 1.57) + 'px'),
    '',
    '  /* --- TIPOGRAFIA — famiglia scelta, poi il ripiego di sistema ------------- */',
    riga('--font-titolo', font.titolo),
    riga('--font-testo', font.testo),
    riga('--font-mono', font.mono),
    '',
    '  /* --- MISURE --------------------------------------------------------------- */',
    riga('--max-larghezza', t.forma.maxLarghezza + 'px'),
    riga('--passo', t.forma.passo + 'px'),
    '}',
    ''
  ];

  return righe.join('\n');
}

/* ------------------------------------------------------------------ */
/* PRESET                                                              */
/* ------------------------------------------------------------------ */

/*
   Combinazioni pronte, ognuna un tema completo e valido, con i tre livelli
   di testo sopra 4.5:1 sul proprio fondo. «Carta chiara» e in elenco anche
   per un motivo tecnico: e il tema che mette alla prova la polarita, ed e
   il primo che si vede sbagliato se qualcuno rompe il calcolo della
   luminanza.
*/
const PRESET = [
  {
    id: 'regia-viola',
    nome: 'Regia viola',
    tema: {
      colori: {
        viola: '#8b2fff', violaCupo: '#4b1391', violaChiaro: '#c5a4ff',
        ciano: '#22e0ff', magenta: '#ff2fa0',
        live: '#ff3d5e', ok: '#35e0a1', allerta: '#ffc65c',
        fondo: '#07070c', testo: '#f2f0f8', testoMedio: '#c3bdd6', testoTenue: '#9a93b0'
      },
      font: { titolo: 'Space Grotesk', testo: 'Manrope', mono: 'JetBrains Mono' },
      forma: { raggio: 14, maxLarghezza: 1360, passo: 8 },
      sfondo: { aloni: 100 }
    }
  },
  {
    id: 'officina-ambra',
    nome: 'Officina ambra',
    tema: {
      colori: {
        viola: '#ff8a1f', violaCupo: '#7a3a05', violaChiaro: '#ffd39b',
        ciano: '#5fe0c8', magenta: '#ff5c7a',
        live: '#ff4d4d', ok: '#4fd98a', allerta: '#ffd166',
        fondo: '#0c0805', testo: '#f8f2ea', testoMedio: '#d9cab7', testoTenue: '#ab9b8a'
      },
      font: { titolo: 'Chakra Petch', testo: 'Work Sans', mono: 'IBM Plex Mono' },
      forma: { raggio: 10, maxLarghezza: 1360, passo: 8 },
      sfondo: { aloni: 90 }
    }
  },
  {
    id: 'sala-verde',
    nome: 'Sala verde',
    tema: {
      colori: {
        viola: '#2fd07a', violaCupo: '#0d5a34', violaChiaro: '#9df3c4',
        ciano: '#5ad1ff', magenta: '#ffb03a',
        live: '#ff5470', ok: '#35e0a1', allerta: '#ffc65c',
        fondo: '#050b09', testo: '#eef6f1', testoMedio: '#bcd0c5', testoTenue: '#9cb3a6'
      },
      font: { titolo: 'Archivo', testo: 'Inter', mono: 'Roboto Mono' },
      forma: { raggio: 18, maxLarghezza: 1440, passo: 8 },
      sfondo: { aloni: 110 }
    }
  },
  {
    id: 'neon-magenta',
    nome: 'Neon magenta',
    tema: {
      colori: {
        viola: '#ff2f8f', violaCupo: '#7a0f45', violaChiaro: '#ffa8d0',
        ciano: '#35f0e0', magenta: '#b06bff',
        live: '#ff3d5e', ok: '#35e0a1', allerta: '#ffc65c',
        fondo: '#0a0410', testo: '#fdf2f8', testoMedio: '#dcc4d4', testoTenue: '#ae95a8'
      },
      font: { titolo: 'Sora', testo: 'Manrope', mono: 'Space Mono' },
      forma: { raggio: 20, maxLarghezza: 1360, passo: 8 },
      sfondo: { aloni: 130 }
    }
  },
  {
    // Fondo chiaro: qui `violaChiaro` e la tinta con cui si SCRIVE, quindi e
    // la piu scura delle tre, non la piu chiara. Il nome resta quello del
    // token, il ruolo e «colore guida leggibile».
    id: 'carta-chiara',
    nome: 'Carta chiara',
    tema: {
      colori: {
        viola: '#7a29e0', violaCupo: '#3b0d78', violaChiaro: '#4a10a0',
        ciano: '#0a6f8a', magenta: '#c11072',
        live: '#c22239', ok: '#0d7a52', allerta: '#8a5a00',
        fondo: '#f5f3ef', testo: '#151221', testoMedio: '#3d3752', testoTenue: '#554e6b'
      },
      font: { titolo: 'Playfair Display', testo: 'Source Sans 3', mono: 'Source Code Pro' },
      forma: { raggio: 6, maxLarghezza: 1280, passo: 8 },
      sfondo: { aloni: 70 }
    }
  }
];

module.exports = { css, CATALOGO_FONT, PRESET, urlGoogleFonts, PREDEFINITO };
