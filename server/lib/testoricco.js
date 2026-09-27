'use strict';

const TAG_AMMESSI = {
  b: [], strong: [], i: [], em: [], u: [], s: [],
  br: [], small: [], mark: [], sup: [], sub: [], code: [],
  abbr: ['title'],
  span: ['class'],
  a: ['href', 'title']
};
for (const nome of Object.keys(TAG_AMMESSI)) { Object.freeze(TAG_AMMESSI[nome]); }
Object.freeze(TAG_AMMESSI);

const VUOTI = new Set(['br']);

const CLASSI_SPAN = ['evidenza', 'tenue', 'mono'];

const BLOCCHI = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'figure', 'figcaption'
]);

const RIPETIBILI = new Set(['p', 'li', 'tr']);

const IGNORATI = { a: ['target', 'rel'] };

const CONTENUTO_DA_BUTTARE = new Set([
  'script', 'style', 'textarea', 'title', 'iframe', 'noscript', 'noembed',
  'noframes', 'xmp', 'template', 'plaintext', 'svg', 'math', 'object', 'embed'
]);

const MAX_PROFONDITA = 24;

const MAX_MESSAGGI = 8;

function proteggi(testo) {
  return String(testo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const RE_CONTROLLI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u2028\u2029\ufeff]/g;
function senzaControlli(testo) { return String(testo).replace(RE_CONTROLLI, ''); }

const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—',
  ndash: '–', bull: '•', middot: '·', deg: '°',
  euro: '€', copy: '©', reg: '®', trade: '™',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì',
  ograve: 'ò', ugrave: 'ù', times: '×', shy: '\u00ad'
};

const RE_RIFERIMENTO = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,30});/g;

function carattereDaCodice(numero) {
  if (!Number.isFinite(numero) || numero <= 0 || numero > 0x10ffff) { return '\ufffd'; }
  if (numero >= 0xd800 && numero <= 0xdfff) { return '\ufffd'; }
  try { return String.fromCodePoint(numero); } catch (e) { return '\ufffd'; }
}

function decodifica(testo) {
  if (testo.indexOf('&') === -1) { return testo; }
  return testo.replace(RE_RIFERIMENTO, function (intero, corpo) {
    if (corpo.charAt(0) === '#') {
      const esa = corpo.charAt(1) === 'x' || corpo.charAt(1) === 'X';
      return carattereDaCodice(parseInt(esa ? corpo.slice(2) : corpo.slice(1), esa ? 16 : 10));
    }
    return Object.prototype.hasOwnProperty.call(ENTITA, corpo) ? ENTITA[corpo] : intero;
  });
}

function unaRiga(testo) { return senzaControlli(testo).replace(/\s+/g, ' ').trim(); }

function accorcia(testo, quanti) {
  const pulito = unaRiga(String(testo));
  const limite = quanti || 48;
  return pulito.length > limite ? pulito.slice(0, limite - 1) + '…' : pulito;
}

function esaminaUrl(grezzo) {
  const deciso = senzaControlli(decodifica(String(grezzo))).trim();
  const nudo = deciso.replace(/\s+/g, '').toLowerCase();

  if (!nudo) { return { ok: false, motivo: 'vuoto' }; }
  if (/^[/\\][/\\]/.test(nudo) || nudo.charAt(0) === '\\') {
    return { ok: false, motivo: 'protocollo-ereditato', valore: deciso };
  }

  const trovato = /^([a-z][a-z0-9+.-]*):/.exec(nudo);
  if (!trovato) {
    return { ok: true, valore: deciso, esterno: false };
  }
  const protocollo = trovato[1];
  if (protocollo === 'http' || protocollo === 'https') {
    if (!/^https?:\/\/[^/]/.test(nudo)) { return { ok: false, motivo: 'incompleto', valore: deciso }; }
    return { ok: true, valore: deciso, esterno: true };
  }
  if (protocollo === 'mailto') {
    if (!/^mailto:[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(nudo)) {
      return { ok: false, motivo: 'mailto', valore: deciso };
    }
    return { ok: true, valore: deciso, esterno: false };
  }
  return { ok: false, motivo: 'protocollo', protocollo: protocollo, valore: deciso };
}

const RE_NOME = /[a-z][a-z0-9:._-]*/y;
const RE_ATTRIBUTO = /[^\s/>=]+/y;
const RE_VALORE_NUDO = /[^\s>]*/y;
const SPAZIO = /\s/;

function minuscoloAscii(testo) {
  return testo.replace(/[A-Z]/g, (lettera) => lettera.toLowerCase());
}

function leggiNome(basso, posizione) {
  RE_NOME.lastIndex = posizione;
  const trovato = RE_NOME.exec(basso);
  return trovato ? trovato[0] : '';
}

function leggiApertura(testo, basso, partenza, fine) {
  const nome = leggiNome(basso, partenza + 1);
  const attributi = [];
  let autochiuso = false;
  let i = partenza + 1 + nome.length;

  while (i < fine) {
    const carattere = testo.charAt(i);
    if (carattere === '>') { i++; break; }
    if (carattere === '/') {
      if (testo.charAt(i + 1) === '>') { autochiuso = true; i += 2; break; }
      i++; continue;
    }
    if (SPAZIO.test(carattere)) { i++; continue; }

    RE_ATTRIBUTO.lastIndex = i;
    const trovato = RE_ATTRIBUTO.exec(basso);
    if (!trovato || !trovato[0]) { i++; continue; }
    const attributo = trovato[0];
    i += attributo.length;

    while (i < fine && SPAZIO.test(testo.charAt(i))) { i++; }
    let valore = null;
    if (testo.charAt(i) === '=') {
      i++;
      while (i < fine && SPAZIO.test(testo.charAt(i))) { i++; }
      const virgoletta = testo.charAt(i);
      if (virgoletta === '"' || virgoletta === "'") {
        const chiusura = testo.indexOf(virgoletta, i + 1);
        if (chiusura === -1) { valore = testo.slice(i + 1); i = fine; }
        else { valore = testo.slice(i + 1, chiusura); i = chiusura + 1; }
      } else {
        RE_VALORE_NUDO.lastIndex = i;
        const grezzo = RE_VALORE_NUDO.exec(testo);
        valore = grezzo ? grezzo[0] : '';
        i += valore.length;
      }
    }
    attributi.push({ nome: attributo, valore: valore });
  }

  return { nome: nome, attributi: attributi, autochiuso: autochiuso, fine: i };
}

function analizza(sorgente) {
  const testo = sorgente;
  const basso = minuscoloAscii(testo);
  const fine = testo.length;
  const pezzi = [];
  let i = 0;
  let inizio = 0;

  const chiudiTesto = (dove) => {
    if (dove > inizio) { pezzi.push({ tipo: 'testo', valore: testo.slice(inizio, dove) }); }
  };

  while (i < fine) {
    if (testo.charAt(i) !== '<') { i++; continue; }
    const dopo = testo.charAt(i + 1);

    if (dopo === '!' || dopo === '?') {
      chiudiTesto(i);
      let cosa;
      let dove;
      if (basso.startsWith('<!--', i)) {
        cosa = 'commento';
        const c = testo.indexOf('-->', i + 4);
        dove = c === -1 ? fine : c + 3;
      } else if (basso.startsWith('<![cdata[', i)) {
        cosa = 'cdata';
        const c = testo.indexOf(']]>', i + 9);
        dove = c === -1 ? fine : c + 3;
      } else {
        cosa = 'dichiarazione';
        const c = testo.indexOf('>', i + 1);
        dove = c === -1 ? fine : c + 1;
      }
      pezzi.push({ tipo: 'scartato', cosa: cosa });
      i = dove; inizio = i;
      continue;
    }

    if (dopo === '/') {
      const nome = leggiNome(basso, i + 2);
      chiudiTesto(i);
      const da = i + 2 + nome.length;
      const c = testo.indexOf('>', da);
      const dove = c === -1 ? fine : c + 1;
      pezzi.push(nome ? { tipo: 'chiude', nome: nome } : { tipo: 'scartato', cosa: 'dichiarazione' });
      i = dove; inizio = i;
      continue;
    }

    if (dopo && /[a-zA-Z]/.test(dopo)) {
      const apertura = leggiApertura(testo, basso, i, fine);
      chiudiTesto(i);
      const pezzo = {
        tipo: 'apre', nome: apertura.nome, attributi: apertura.attributi, autochiuso: apertura.autochiuso
      };
      pezzi.push(pezzo);
      i = apertura.fine; inizio = i;

      if (CONTENUTO_DA_BUTTARE.has(apertura.nome) && !apertura.autochiuso) {
        pezzo.svuotato = true;
        const chiave = '</' + apertura.nome;
        const c = basso.indexOf(chiave, i);
        if (c === -1) { i = fine; }
        else {
          const g = testo.indexOf('>', c + chiave.length);
          i = g === -1 ? fine : g + 1;
        }
        inizio = i;
      }
      continue;
    }

    chiudiTesto(i);
    pezzi.push({ tipo: 'testo', valore: '<', solo: true });
    i += 1; inizio = i;
  }

  chiudiTesto(fine);
  return pezzi;
}

function primoValore(attributi, nome) {
  for (const attributo of attributi) {
    if (attributo.nome === nome) { return attributo.valore === null ? '' : attributo.valore; }
  }
  return null;
}

function elabora(sorgente) {
  const pezzi = analizza(String(sorgente));
  const fuori = [];
  const guai = [];
  const pila = [];

  const segnala = (codice, dati) => {
    if (guai.length < 60) { guai.push(Object.assign({ codice: codice }, dati || {})); }
  };
  const ultimoAperto = (nome) => {
    for (let i = pila.length - 1; i >= 0; i--) { if (pila[i].nome === nome) { return i; } }
    return -1;
  };
  const chiudiFinoA = (livello) => {
    while (pila.length > livello) {
      const aperto = pila.pop();
      if (aperto.emesso) { fuori.push('</' + aperto.nome + '>'); }
    }
  };

  let separatore = false;
  let scrittoQualcosa = false;
  const versaSeparatore = () => {
    if (separatore && scrittoQualcosa && fuori[fuori.length - 1] !== '<br>') { fuori.push('<br>'); }
    separatore = false;
  };

  for (const pezzo of pezzi) {
    if (pezzo.tipo === 'testo') {
      if (pezzo.solo) { segnala('minore'); }
      const testo = proteggi(senzaControlli(decodifica(pezzo.valore)));
      if (!testo) { continue; }
      if (/\S/.test(testo)) { versaSeparatore(); scrittoQualcosa = true; }
      fuori.push(testo);
      continue;
    }

    if (pezzo.tipo === 'scartato') { segnala(pezzo.cosa); continue; }

    if (pezzo.tipo === 'chiude') {
      const nome = pezzo.nome;
      if (BLOCCHI.has(nome)) {
        const livello = ultimoAperto(nome);
        if (livello !== -1) { chiudiFinoA(livello); }
        separatore = true;
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(TAG_AMMESSI, nome) || VUOTI.has(nome)) { continue; }
      const livello = ultimoAperto(nome);
      if (livello === -1) { segnala('chiusura-orfana', { nome: nome }); continue; }
      const sopra = pila[pila.length - 1];
      if (livello !== pila.length - 1 && sopra.emesso && pila[livello].emesso) {
        segnala('incrocio', { nome: nome, dentro: sopra.nome });
      }
      chiudiFinoA(livello);
      continue;
    }

    const nome = pezzo.nome;
    if (!Object.prototype.hasOwnProperty.call(TAG_AMMESSI, nome)) {
      if (pezzo.svuotato) { segnala('tag-svuotato', { nome: nome }); continue; }
      if (!BLOCCHI.has(nome)) { segnala('tag-vietato', { nome: nome }); continue; }

      segnala('blocco-vietato', { nome: nome });
      if (RIPETIBILI.has(nome)) {
        const livello = ultimoAperto(nome);
        if (livello !== -1) { chiudiFinoA(livello); separatore = true; }
      }
      if (!pezzo.autochiuso) { pila.push({ nome: nome, emesso: false }); }
      continue;
    }
    const rinuncia = (codice, dati) => {
      segnala(codice, dati);
      if (!VUOTI.has(nome)) { pila.push({ nome: nome, emesso: false }); }
    };
    if (pila.length >= MAX_PROFONDITA) { rinuncia('troppo-annidato', { nome: nome }); continue; }

    const ammessi = TAG_AMMESSI[nome];
    const ignorati = IGNORATI[nome] || [];
    const valori = new Map();
    for (const attributo of pezzo.attributi) {
      if (ammessi.indexOf(attributo.nome) !== -1) {
        if (!valori.has(attributo.nome)) { valori.set(attributo.nome, attributo.valore === null ? '' : attributo.valore); }
        continue;
      }
      if (ignorati.indexOf(attributo.nome) !== -1) { continue; }
      segnala(/^on/.test(attributo.nome) ? 'attributo-evento' : 'attributo-vietato',
        { tag: nome, attributo: attributo.nome });
    }

    const scritti = [];

    if (nome === 'a') {
      if (pila.some((aperto) => aperto.nome === 'a' && aperto.emesso)) { rinuncia('link-annidato'); continue; }
      const href = primoValore(pezzo.attributi, 'href');
      if (href === null) { rinuncia('link-senza-indirizzo'); continue; }
      const esito = esaminaUrl(href);
      if (!esito.ok) {
        if (esito.motivo === 'vuoto') { rinuncia('link-senza-indirizzo'); }
        else { rinuncia('link-vietato', { motivo: esito.motivo, protocollo: esito.protocollo, valore: esito.valore }); }
        continue;
      }
      scritti.push('href="' + proteggi(esito.valore) + '"');
      if (esito.esterno) {
        scritti.push('target="_blank"', 'rel="noopener noreferrer"');
      }
    }

    if (valori.has('title')) {
      const titolo = unaRiga(decodifica(valori.get('title')));
      if (titolo) { scritti.push('title="' + proteggi(titolo) + '"'); }
    }

    if (nome === 'span' && valori.has('class')) {
      const buone = [];
      for (const grezza of String(valori.get('class')).split(/\s+/)) {
        if (!grezza) { continue; }
        const classe = decodifica(grezza).toLowerCase();
        if (CLASSI_SPAN.indexOf(classe) === -1) { segnala('classe-vietata', { classe: accorcia(grezza, 24) }); continue; }
        if (buone.indexOf(classe) === -1) { buone.push(classe); }
      }
      if (buone.length) { scritti.push('class="' + buone.join(' ') + '"'); }
    }

    versaSeparatore();
    fuori.push('<' + nome + (scritti.length ? ' ' + scritti.join(' ') : '') + '>');
    scrittoQualcosa = true;
    if (!VUOTI.has(nome)) { pila.push({ nome: nome, emesso: true }); }
  }

  while (pila.length) {
    const aperto = pila.pop();
    if (!aperto.emesso) { continue; }
    segnala('non-chiuso', { nome: aperto.nome });
    fuori.push('</' + aperto.nome + '>');
  }

  return { html: fuori.join(''), guai: guai };
}

const CONSIGLI = [
  { tag: ['ul', 'ol', 'table', 'td', 'th', 'dl', 'dt', 'dd', 'main', 'aside', 'nav'],
    testo: ': il testo sta già dentro il suo blocco, per andare a capo basta il pulsante «A capo».' },
  { tag: ['img', 'picture', 'video', 'audio', 'source', 'canvas', 'svg', 'math'],
    testo: ': le immagini e i video si scelgono nel campo apposta, non si incollano nel testo.' },
  { tag: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'link', 'meta', 'base', 'noscript', 'template'],
    testo: ': nei testi non si può mettere codice, ed è anche pericoloso.' },
  { tag: ['font', 'center', 'big', 'marquee', 'blink', 'strike', 'tt'],
    testo: ': è un tag vecchio; per far risaltare una parola usa il grassetto o «evidenza».' }
];

function consiglioPer(nome) {
  for (const voce of CONSIGLI) { if (voce.tag.indexOf(nome) !== -1) { return voce.testo; } }
  return ': si possono usare solo grassetto, corsivo, sottolineato, a capo, link e poco altro.';
}

function descrivi(guaio) {
  const nome = guaio.nome;
  switch (guaio.codice) {
    case 'tag-vietato':
      return 'il tag `<' + nome + '>` non è ammesso' + consiglioPer(nome) + ' Il testo dentro è rimasto.';
    case 'blocco-vietato':
      return 'il tag `<' + nome + '>` non è ammesso: il testo dentro è rimasto e al posto del tag c\'è un a capo.'
        + ' I testi stanno già dentro il loro blocco, qui basta il pulsante «A capo».';
    case 'tag-svuotato':
      return 'il tag `<' + nome + '>` e quello che conteneva sono stati tolti per intero: nei testi non ci va del codice.';
    case 'attributo-evento':
      return 'nel tag `<' + guaio.tag + '>` l\'attributo `' + guaio.attributo + '` farebbe partire del codice: è stato tolto.';
    case 'attributo-vietato':
      if (guaio.attributo === 'style') {
        return 'nel tag `<' + guaio.tag + '>` l\'attributo `style` non è ammesso: colori e caratteri si cambiano dal gruppo «Aspetto».';
      }
      return 'nel tag `<' + guaio.tag + '>` l\'attributo `' + guaio.attributo + '` non è ammesso ed è stato tolto.';
    case 'link-vietato':
      if (guaio.motivo === 'protocollo') {
        return 'il link «' + accorcia(guaio.valore) + '» usa «' + guaio.protocollo + ':», che non è ammesso: si scrivono solo indirizzi che iniziano con http://, https://, mailto: oppure un percorso interno. Il collegamento è stato tolto, il testo è rimasto.';
      }
      if (guaio.motivo === 'protocollo-ereditato') {
        return 'il link «' + accorcia(guaio.valore) + '» va scritto per intero, con https:// davanti. Il collegamento è stato tolto, il testo è rimasto.';
      }
      if (guaio.motivo === 'incompleto') {
        return 'il link «' + accorcia(guaio.valore) + '» è incompleto: dopo https:// ci vuole almeno il nome del sito. Il collegamento è stato tolto, il testo è rimasto.';
      }
      return 'nel link «' + accorcia(guaio.valore) + '» manca un indirizzo email valido dopo mailto:. Il collegamento è stato tolto, il testo è rimasto.';
    case 'link-senza-indirizzo':
      return 'c\'è un link senza indirizzo: è stato tolto e il testo è rimasto.';
    case 'link-annidato':
      return 'c\'è un link dentro un altro link: quello interno è stato tolto.';
    case 'classe-vietata':
      return 'lo stile «' + guaio.classe + '» non esiste: per lo `<span>` si possono usare solo evidenza, tenue e mono.';
    case 'non-chiuso':
      return 'il tag `<' + nome + '>` è rimasto aperto: è stato chiuso in fondo al testo, ma conviene chiuderlo dove serve.';
    case 'chiusura-orfana':
      return 'c\'è un `</' + nome + '>` che chiude un tag mai aperto: è stato tolto.';
    case 'incrocio':
      return 'chiudendo `<' + nome + '>` era ancora aperto `<' + guaio.dentro + '>`: i tag vanno chiusi in ordine, prima l\'ultimo che hai aperto.';
    case 'troppo-annidato':
      return 'i tag sono annidati troppo in profondità: oltre il livello ' + MAX_PROFONDITA + ' vengono tolti.';
    case 'commento':
      return 'i commenti HTML (`<!-- ... -->`) vengono tolti dal testo pubblicato.';
    case 'cdata':
    case 'dichiarazione':
      return 'c\'è un pezzo scritto come `<!...>` che non è HTML valido: è stato tolto.';
    case 'minore':
      return 'il segno `<` da solo viene mostrato così com\'è: se volevi scrivere un tag, ricontrolla come l\'hai scritto.';
    default:
      return 'c\'è qualcosa che non va nel testo formattato ed è stato tolto.';
  }
}

function frase(etichetta, corpo) {
  if (!etichetta) { return corpo.charAt(0).toUpperCase() + corpo.slice(1); }
  return 'Nel campo «' + etichetta + '» ' + corpo;
}

function sanifica(html) {
  if (html === null || html === undefined) { return ''; }
  if (typeof html !== 'string') { return proteggi(senzaControlli(String(html))); }
  try {
    return elabora(html).html;
  } catch (e) {
    return proteggi(senzaControlli(html));
  }
}

function problemi(html, opzioni) {
  const etichetta = opzioni && opzioni.etichetta ? String(opzioni.etichetta) : '';
  if (html === null || html === undefined || html === '') { return []; }
  if (typeof html !== 'string') { return [frase(etichetta, 'deve essere un testo.')]; }

  let guai;
  try { guai = elabora(html).guai; }
  catch (e) { return [frase(etichetta, 'c\'è qualcosa che non si riesce a leggere: prova a togliere la formattazione e a riscriverlo.')]; }

  const fuori = [];
  const visti = new Set();
  for (const guaio of guai) {
    const messaggio = frase(etichetta, descrivi(guaio));
    if (visti.has(messaggio)) { continue; }
    visti.add(messaggio);
    fuori.push(messaggio);
  }
  if (fuori.length <= MAX_MESSAGGI) { return fuori; }
  const restanti = fuori.length - MAX_MESSAGGI;
  const corti = fuori.slice(0, MAX_MESSAGGI);
  corti.push(frase(etichetta, 'ci sono altri ' + restanti + ' problemi dello stesso genere: conviene ripulire la formattazione e riscrivere.'));
  return corti;
}

function soloTesto(html) {
  if (html === null || html === undefined) { return ''; }
  if (typeof html !== 'string') { return unaRiga(String(html)); }
  try {
    const fuori = [];
    for (const pezzo of analizza(html)) {
      if (pezzo.tipo === 'testo') { fuori.push(decodifica(pezzo.valore)); }
      else if (pezzo.nome === 'br' || BLOCCHI.has(pezzo.nome)) { fuori.push(' '); }
    }
    return unaRiga(fuori.join(''));
  } catch (e) {
    return unaRiga(html.replace(/<[^>]*>/g, ' '));
  }
}

module.exports = { sanifica, problemi, soloTesto, TAG_AMMESSI };
