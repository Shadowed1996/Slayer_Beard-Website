'use strict';

const BIANCO = { r: 255, g: 255, b: 255 };
const NERO = { r: 0, g: 0, b: 0 };

function limite(n, min, max) { return n < min ? min : (n > max ? max : n); }

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

function alfa(n) { return String(Math.round(limite(n, 0, 1) * 1000) / 1000); }

function rgba(colore, opacita) {
  return 'rgba(' + canale(colore.r) + ', ' + canale(colore.g) + ', ' + canale(colore.b) + ', ' + alfa(opacita) + ')';
}

function misto(a, b, t) {
  const q = limite(t, 0, 1);
  return { r: a.r + (b.r - a.r) * q, g: a.g + (b.g - a.g) * q, b: a.b + (b.b - a.b) * q };
}

function lineare(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminanza(colore) {
  return 0.2126 * lineare(colore.r) + 0.7152 * lineare(colore.g) + 0.0722 * lineare(colore.b);
}

const RIPIEGO_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const RIPIEGO_GROTTESCO = "'Segoe UI', system-ui, -apple-system, sans-serif";
const RIPIEGO_STRETTO = "'Arial Narrow', 'Segoe UI', system-ui, sans-serif";
const RIPIEGO_SERIF = "Georgia, 'Times New Roman', serif";
const RIPIEGO_MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'SFMono-Regular', monospace";

const SISTEMA_SANS = { nome: 'Font di sistema', pesi: [], ripiego: RIPIEGO_SANS, categoria: 'sistema' };
const SISTEMA_MONO = { nome: 'Font di sistema', pesi: [], ripiego: RIPIEGO_MONO, categoria: 'sistema' };

const CATALOGO_FONT = {
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

function famigliaDi(slot, nome) {
  for (const famiglia of CATALOGO_FONT[slot] || []) {
    if (famiglia.nome === nome) { return famiglia; }
  }
  return null;
}

function famigliaCatalogo(nome) {
  for (const slot of SLOT) {
    const famiglia = famigliaDi(slot, nome);
    if (famiglia && famiglia.pesi.length) { return famiglia; }
  }
  return null;
}

function pilaFont(famiglia) {
  return famiglia.pesi.length ? "'" + famiglia.nome + "', " + famiglia.ripiego : famiglia.ripiego;
}

const PREFISSO_CARICATO = 'caricato:';

function caricatoDi(valore) {
  if (typeof valore !== 'string' || valore.indexOf(PREFISSO_CARICATO) !== 0) { return null; }
  return require('./font').voce(valore.slice(PREFISSO_CARICATO.length));
}

function ripiegoDelloSlot(slot) {
  return famigliaDi(slot, PREDEFINITO.font[slot]).ripiego;
}

function facciaCaricato(voce, base) {
  return require('../../pannello/condivisi/stili.js').fontFace(voce, { base: base });
}

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
    font[slot] = (famigliaDi(slot, nome) || caricatoDi(nome)) ? nome : PREDEFINITO.font[slot];
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

function urlGoogleFonts(tema, altre) {
  const scelto = normalizza(tema);
  const famiglie = new Map();
  const aggiungi = (famiglia) => {
    if (!famiglia || !famiglia.pesi.length) { return; }
    const pesi = famiglie.get(famiglia.nome) || new Set();
    for (const peso of famiglia.pesi) { pesi.add(peso); }
    famiglie.set(famiglia.nome, pesi);
  };
  for (const slot of SLOT) { aggiungi(famigliaDi(slot, scelto.font[slot])); }
  for (const nome of Array.isArray(altre) ? altre : []) { aggiungi(famigliaCatalogo(nome)); }
  if (!famiglie.size) { return ''; }

  const parti = [];
  for (const coppia of famiglie) {
    const ordinati = Array.from(coppia[1]).sort((a, b) => a - b);
    parti.push('family=' + encodeURIComponent(coppia[0]).replace(/%20/g, '+') + ':wght@' + ordinati.join(';'));
  }
  return 'https://fonts.googleapis.com/css2?' + parti.join('&') + '&display=swap';
}

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
    alone: 0.55, bagliore: 0.55, bagliore2: 0.50
  }
};

const ALONI = [
  { misura: '1200px 780px', dove: ' 50% -12%', tinta: 'viola', peso: 0.220, coda: '70%' },
  { misura: ' 900px 640px', dove: '104%  10%', tinta: 'ciano', peso: 0.055, coda: '66%' },
  { misura: ' 980px 800px', dove: '-10%  58%', tinta: 'magenta', peso: 0.050, coda: '68%' },
  { misura: ' 820px 560px', dove: ' 30% 108%', tinta: 'violaCupo', peso: 0.280, coda: '72%' }
];

function riga(nome, valore) { return ('  ' + nome + ': ' + valore + ';').replace(/ +\n/g, '\n'); }

function gradientePagina(c, forza, I) {
  const k = (forza / 100) * I.alone;
  if (k <= 0) { return esadecimale(c.fondo); }

  const strati = ALONI.map((alone) => {
    const tinta = c[alone.tinta];
    return 'radial-gradient(' + alone.misura + ' at ' + alone.dove + ', ' +
      rgba(tinta, alone.peso * k) + ', ' + rgba(tinta, 0) + ' ' + alone.coda +
      ') 0 0 / 100% 100% no-repeat fixed';
  });
  return '\n    ' + strati.join(',\n    ') + ',\n    ' + esadecimale(c.fondo);
}

function css(tema) {
  const t = normalizza(tema);

  const c = {};
  for (const chiave of Object.keys(t.colori)) { c[chiave] = leggiColore(t.colori[chiave]); }

  const lum = luminanza(c.fondo);
  const chiara = lum > 0.5;
  const I = chiara ? INTENSITA.chiara : INTENSITA.scura;
  const inchiostro = chiara ? NERO : BIANCO;
  const riflesso = chiara ? BIANCO : c.violaChiaro;

  const fondo2 = misto(misto(c.fondo, c.viola, 0.030), inchiostro, I.fondo2);
  const pannello = misto(misto(c.fondo, c.viola, 0.090), inchiostro, I.pannello);
  const pannello2 = misto(misto(c.fondo, c.viola, 0.130), inchiostro, I.pannello2);

  const raggio = t.forma.raggio;
  const font = {};
  const nomiFont = {};
  const facce = [];
  for (const slot of SLOT) {
    const caricato = caricatoDi(t.font[slot]);
    if (!caricato) {
      font[slot] = pilaFont(famigliaDi(slot, t.font[slot]));
      nomiFont[slot] = t.font[slot];
      continue;
    }
    font[slot] = "'sb-" + caricato.id + "', " + ripiegoDelloSlot(slot);
    nomiFont[slot] = caricato.etichetta + ' (caricato)';
    const faccia = facciaCaricato(caricato, '../');
    if (faccia && facce.indexOf(faccia) === -1) { facce.push(faccia); }
  }

  const righe = [
    ...facce.map((faccia) => faccia + '\n'),
    ':root {',
    '',
    riga('--viola', esadecimale(c.viola)),
    riga('--viola-cupo', esadecimale(c.violaCupo)),
    riga('--viola-chiaro', esadecimale(c.violaChiaro)),
    riga('--ciano', esadecimale(c.ciano)),
    riga('--magenta', esadecimale(c.magenta)),
    riga('--live', esadecimale(c.live)),
    riga('--ok', esadecimale(c.ok)),
    riga('--allerta', esadecimale(c.allerta)),
    '',
    riga('--testo', esadecimale(c.testo)),
    riga('--testo-medio', esadecimale(c.testoMedio)),
    riga('--testo-tenue', esadecimale(c.testoTenue)),
    '',
    riga('--fondo', esadecimale(c.fondo)),
    riga('--fondo-2', esadecimale(fondo2)),
    riga('--pannello', rgba(pannello, I.vetro)),
    riga('--pannello-2', rgba(pannello2, I.vetro2)),
    riga('--velo', rgba(c.fondo, I.velo)),
    '',
    riga('--linea', rgba(inchiostro, I.linea)),
    riga('--linea-forte', rgba(inchiostro, I.lineaForte)),
    riga('--linea-comando', rgba(inchiostro, I.lineaComando)),
    riga('--linea-viva', rgba(c.viola, 0.55)),
    '',
    riga('--grad-pagina', gradientePagina(c, t.sfondo.aloni, I)),
    '',
    riga('--grad-titolo', 'linear-gradient(98deg, ' + esadecimale(c.testo) + ' 0%, ' +
      esadecimale(c.violaChiaro) + ' 48%, ' + esadecimale(c.ciano) + ' 100%)'),
    '',
    riga('--grad-pannello', 'linear-gradient(168deg, ' + rgba(riflesso, I.riflesso) + ' 0%, ' +
      rgba(riflesso, I.riflessoCoda) + ' 38%, ' + rgba(NERO, I.incavo) + ' 100%)'),
    '',
    riga('--bagliore-viola', '0 0 24px ' + rgba(c.viola, I.bagliore)),
    riga('--bagliore-ciano', '0 0 20px ' + rgba(c.ciano, I.bagliore2)),
    '',
    riga('--raggio', raggio + 'px'),
    riga('--raggio-s', Math.round(raggio * 0.57) + 'px'),
    riga('--raggio-g', Math.round(raggio * 1.57) + 'px'),
    '',
    riga('--font-titolo', font.titolo),
    riga('--font-testo', font.testo),
    riga('--font-mono', font.mono),
    '',
    riga('--max-larghezza', t.forma.maxLarghezza + 'px'),
    riga('--passo', t.forma.passo + 'px'),
    '}',
    ''
  ];

  return righe.join('\n');
}

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

module.exports = {
  css, CATALOGO_FONT, PRESET, urlGoogleFonts, PREDEFINITO,
  famigliaCatalogo, PREFISSO_CARICATO
};
