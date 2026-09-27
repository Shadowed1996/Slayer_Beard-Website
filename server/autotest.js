'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const { spawnSync } = require('node:child_process');

const percorsi = require('./lib/percorsi');
const { P } = percorsi;
const RADICE_VERA = P.radice;

const modello = require('./lib/modello');
const convalida = require('./lib/convalida');

const controlli = require('./lib/controlli');

const testoricco = require('./lib/testoricco');
const tema = require('./lib/tema');
const twitch = require('./lib/twitch');
const chiavi = require('./lib/chiavi');
const youtube = require('./lib/youtube');
const schema = require('../contenuti/schema.js');

const PASSWORD_COLLAUDO = 'pollaio-viola-' + crypto.randomInt(1000, 9999);

const esiti = [];
let sezione = '';

function apriSezione(titolo) {
  sezione = titolo;
  console.log('');
  console.log('  ' + titolo);
  console.log('  ' + '-'.repeat(titolo.length));
}

function segna(nome, ok, dettaglio) {
  esiti.push({ sezione: sezione, nome: nome, ok: ok, dettaglio: dettaglio || '' });
  console.log('   ' + (ok ? 'ok  ' : 'NO  ') + nome + (ok || !dettaglio ? '' : '\n         ' + dettaglio));
}

async function prova(nome, fn) {
  try {
    await fn();
    segna(nome, true);
  } catch (err) {
    segna(nome, false, err && err.message ? err.message : String(err));
  }
}

function esigi(condizione, messaggio) {
  if (!condizione) { throw new Error(messaggio); }
}

function esigiUguale(avuto, atteso, cosa) {
  if (avuto !== atteso) {
    throw new Error((cosa || 'valore') + ': atteso ' + JSON.stringify(atteso) + ', avuto ' + JSON.stringify(avuto));
  }
}

function esigiDentro(testo, pezzo, cosa) {
  if (String(testo).indexOf(pezzo) === -1) {
    throw new Error((cosa || 'testo') + ': manca ' + JSON.stringify(pezzo));
  }
}

function esigiErrore(fn, pezzo, cosa) {
  let lanciato = null;
  try { fn(); } catch (e) { lanciato = e; }
  if (!lanciato) { throw new Error((cosa || 'la chiamata') + ' doveva fallire e invece e passata.'); }
  if (pezzo && String(lanciato.message).indexOf(pezzo) === -1) {
    throw new Error((cosa || 'errore') + ': atteso un messaggio con ' + JSON.stringify(pezzo) + ', avuto ' + JSON.stringify(lanciato.message));
  }
  return lanciato;
}

async function proveMotore(cartella) {
  apriSezione('1. Motore di template');

  await prova('valore con escape di & < > " e apostrofo', () => {
    const fuori = modello.rendi('[{{x}}]', { x: '<a href="b">& \'c\'</a>' });
    esigiUguale(fuori, '[&lt;a href=&quot;b&quot;&gt;&amp; &#39;c&#39;&lt;/a&gt;]', 'escape');
  });

  await prova('valore grezzo con tre graffe', () => {
    esigiUguale(modello.rendi('{{{svg}}}', { svg: '<svg><path/></svg>' }), '<svg><path/></svg>', 'grezzo');
  });

  await prova('percorsi col punto e chiavi piatte con il punto', () => {
    const contesto = { 'deck.titolo': 'piatta', config: { twitch: { canale: 'sb' } } };
    esigiUguale(modello.rendi('{{deck.titolo}}|{{config.twitch.canale}}', contesto), 'piatta|sb', 'percorsi');
  });

  await prova('una chiave piatta vince su un elenco con lo stesso prefisso', () => {

    const contesto = { 'settimana.titolo': 'La settimana', settimana: [{ abbr: 'LUN' }, { abbr: 'MAR' }] };
    esigiUguale(modello.rendi('{{settimana.titolo}}:{{#ogni settimana}}{{abbr}} {{/ogni}}', contesto),
      'La settimana:LUN MAR ', 'collisione');
  });

  await prova('ciclo con indice, numero, primo e ultimo', () => {
    const fuori = modello.rendi('{{#ogni l}}{{@indice}}/{{@numero}}{{#se @primo}}P{{/se}}{{#se @ultimo}}U{{/se}} {{/ogni}}',
      { l: ['a', 'b', 'c'] });
    esigiUguale(fuori, '0/1P 1/2 2/3U ', 'variabili di ciclo');
  });

  await prova('dentro il ciclo si vede ancora il contesto esterno', () => {
    esigiUguale(modello.rendi('{{#ogni l}}{{fuori}}{{.}}{{/ogni}}', { l: ['x'], fuori: '-' }), '-x', 'ambito');
  });

  await prova('se e la sua negazione, con la regola del vuoto', () => {
    const casi = [['', 'NO'], [0, 'NO'], [false, 'NO'], [[], 'NO'], ['x', 'SI'], [1, 'SI'], [['a'], 'SI']];
    for (const [valore, atteso] of casi) {
      esigiUguale(modello.rendi('{{#se v}}SI{{/se}}{{^se v}}NO{{/se}}', { v: valore }), atteso, 'vuoto ' + JSON.stringify(valore));
    }
  });

  await prova('blocchi annidati su tre livelli', () => {
    const contesto = { gruppi: [{ nome: 'a', voci: [{ n: 1, attiva: true }, { n: 2, attiva: false }] }] };
    const fuori = modello.rendi('{{#ogni gruppi}}{{nome}}:{{#ogni voci}}{{#se attiva}}[{{n}}]{{/se}}{{^se attiva}}({{n}}){{/se}}{{/ogni}}{{/ogni}}', contesto);
    esigiUguale(fuori, 'a:[1](2)', 'annidamento');
  });

  await prova('parziale incluso da file', () => {
    const dentro = path.join(cartella, 'parziali');
    fs.mkdirSync(dentro, { recursive: true });
    fs.writeFileSync(path.join(dentro, 'voce.html'), '<li>{{nome}}</li>', 'utf8');
    const fuori = modello.rendi('{{#ogni l}}{{> parziali/voce}}{{/ogni}}', { l: [{ nome: 'uno' }, { nome: 'due' }] },
      { cartella: cartella, file: 'prova.html' });
    esigiUguale(fuori, '<li>uno</li><li>due</li>', 'parziale');
  });

  await prova('chiave mancante = errore con file e riga', () => {
    const err = esigiErrore(() => modello.rendi('riga uno\nriga due {{deck.assente}}', {}, { file: 'modelli/index.html' }),
      'deck.assente', 'chiave mancante');
    esigiUguale(err.riga, 2, 'riga dell errore');
    esigiUguale(err.file, 'modelli/index.html', 'file dell errore');
    esigiDentro(err.message, 'modelli/index.html:2', 'messaggio');
  });

  await prova('blocco mai chiuso = errore', () => {
    esigiErrore(() => modello.rendi('{{#ogni l}}x', { l: [] }, { file: 'p.html' }), 'non viene mai chiuso');
  });

  await prova('chiusura sbagliata = errore', () => {
    esigiErrore(() => modello.rendi('{{#se a}}x{{/ogni}}', { a: 1 }, { file: 'p.html' }), 'il blocco aperto e se');
  });

  await prova('parziale inesistente = errore che dice quale file manca', () => {
    esigiErrore(() => modello.rendi('{{> parziali/mai-scritto}}', {}, { cartella: cartella, file: 'p.html' }), 'mai-scritto');
  });

  await prova('ciclo su un valore che non e un elenco = errore', () => {
    esigiErrore(() => modello.rendi('{{#ogni x}}{{/ogni}}', { x: 'testo' }, { file: 'p.html' }), 'non e un elenco');
  });

  await prova('un oggetto stampato per intero = errore', () => {
    esigiErrore(() => modello.rendi('{{config}}', { config: { a: 1 } }, { file: 'p.html' }), 'non un valore stampabile');
  });
}

async function proveConvalida(contenutiVeri) {
  apriSezione('2. Convalida dei contenuti');

  await prova('i contenuti veri passano senza errori', () => {
    const errori = convalida.convalida(contenutiVeri);
    esigi(errori.length === 0, 'errori inattesi: ' + errori.map((e) => e.chiave + ' ' + e.messaggio).join(' | '));
  });

  await prova('gli errori arrivano tutti insieme, non solo il primo', () => {
    const rotto = JSON.parse(JSON.stringify(contenutiVeri));
    rotto.testi['deck.titolo'] = '';
    rotto.testi['meta.titolo'] = 'x'.repeat(500);
    rotto.config.email = 'senza-chiocciola';
    rotto.config.dati.follower = 'tanti';
    const errori = convalida.convalida(rotto);
    esigi(errori.length >= 4, 'attesi almeno 4 errori, avuti ' + errori.length);
    for (const chiave of ['deck.titolo', 'meta.titolo', 'config.email', 'config.dati.follower']) {
      esigi(errori.some((e) => e.chiave === chiave), 'manca l errore su ' + chiave);
    }
  });

  await prova('URL: http, https, mailto e relativi passano; il resto no', () => {
    for (const buono of ['https://x.it/a', 'http://x.it', 'mailto:a@b.it', 'img/a.png', './contenuti/media/a.png']) {
      esigiUguale(convalida.urlAmmesso(buono), null, 'doveva passare ' + buono);
    }
    for (const cattivo of ['javascript:alert(1)', 'data:text/html,x', '//altrosito.it/x', 'https://']) {
      esigi(convalida.urlAmmesso(cattivo) !== null, 'doveva essere rifiutato: ' + cattivo);
    }
  });

  await prova('orari: HH:MM, giorni 0..6 senza doppioni, fuso vero', () => {
    const casi = [
      [{ giorni: [1, 3], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 }, 0],
      [{ giorni: [1, 1], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 }, 1],
      [{ giorni: [9], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 }, 1],
      [{ giorni: [], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 }, 1],
      [{ giorni: [1], ora: '25:61', fuso: 'Europe/Rome', durataOre: 4 }, 1],
      [{ giorni: [1], ora: '21:00', fuso: 'Marte/Base', durataOre: 4 }, 1],
      [{ giorni: [1], ora: '21:00', fuso: 'Europe/Rome', durataOre: 0 }, 1]
    ];
    for (const [orari, attesi] of casi) {
      const errori = convalida.convalidaCampo('config.orari', orari);
      esigiUguale(errori.length, attesi, 'orari ' + JSON.stringify(orari));
    }
  });

  await prova('Client ID: passa solo quello che ha la forma di un Client ID', () => {

    esigiUguale(convalida.convalidaCampo('config.account.clientId', '').length, 0, 'vuoto');
    esigiUguale(convalida.convalidaCampo('config.account.clientId', 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3').length, 0, 'trenta minuscole e cifre');

    for (const storto of ['DAxSOSTITUIRExCONxQUELLOxVERO', 'abc', 'k3j9x2q7w1 m5v8b4n6z0', 'K3J9X2Q7W1M5V8B4N6Z0C7T2Y5R8P3']) {
      esigi(convalida.convalidaCampo('config.account.clientId', storto).length === 1,
        'doveva essere rifiutato: ' + storto);
    }
  });

  await prova('controlli: il sito configurato per la produzione non segnala niente', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.sitoUrl = 'https://slayerbeard.com/';
    documento.config.twitch.domini = ['slayerbeard.com'];
    documento.config.lurk.messaggioAttivo = true;
    documento.config.account.attivo = true;
    documento.config.account.clientId = 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3';
    documento.config.account.urlRitorno = 'https://slayerbeard.com/';

    documento.config.clip = Object.assign({}, documento.config.clip, {
      attivo: true,
      voci: [{ id: 'abc', titolo: 'Una clip', url: 'https://clips.twitch.tv/abc', anteprima: '', durataSec: 30, visualizzazioni: 10, creataIl: '', autore: '' }]
    });
    const avvertimenti = controlli.controlli(documento);
    esigiUguale(avvertimenti.length, 0,
      'avvertimenti inattesi: ' + avvertimenti.map((a) => a.chiave).join(', '));
  });

  await prova('controlli: la vetrina accesa e ancora vuota viene detta', () => {

    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.clip = Object.assign({}, documento.config.clip, { attivo: true, voci: [] });
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.clip.attivo'),
      'nessun avvertimento sulla vetrina accesa e vuota');

    documento.config.clip.attivo = false;
    esigi(!controlli.controlli(documento).some((a) => a.chiave === 'config.clip.attivo'),
      'avvertimento sulla vetrina spenta, che non ha niente che non va');
  });

  await prova('controlli: senza indirizzo e senza domini il player viene detto', () => {

    const sbSito = process.env.SB_SITO;

    delete process.env.SB_SITO;
    try {
      const documento = JSON.parse(JSON.stringify(contenutiVeri));
      documento.config.sitoUrl = '';
      documento.config.twitch.domini = [];
      const avvertimenti = controlli.controlli(documento);
      esigi(avvertimenti.some((a) => a.chiave === 'config.twitch.domini'),
        'nessun avvertimento sui domini, e online il player non partirebbe');
      esigi(avvertimenti.some((a) => a.chiave === 'config.sitoUrl'),
        'nessun avvertimento sull indirizzo pubblico mancante');
    } finally {
      if (sbSito !== undefined) { process.env.SB_SITO = sbSito; }
    }
  });

  await prova('controlli: con l indirizzo in SB_SITO i due avvertimenti tacciono', () => {

    const sbSito = process.env.SB_SITO;
    process.env.SB_SITO = 'https://slayerbeard.com';
    try {
      const documento = JSON.parse(JSON.stringify(contenutiVeri));
      documento.config.sitoUrl = '';
      documento.config.twitch.domini = [];
      const chiavi = controlli.controlli(documento).map((a) => a.chiave);
      esigi(chiavi.indexOf('config.sitoUrl') === -1, 'avvertimento sull indirizzo con SB_SITO impostata');
      esigi(chiavi.indexOf('config.twitch.domini') === -1, 'avvertimento sui domini con SB_SITO impostata');
    } finally {
      if (sbSito === undefined) { delete process.env.SB_SITO; } else { process.env.SB_SITO = sbSito; }
    }
  });

  await prova('controlli: l indirizzo di ritorno che punta altrove viene detto', () => {

    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.sitoUrl = 'https://slayerbeard.com/';
    documento.config.twitch.domini = ['slayerbeard.com'];
    documento.config.lurk.messaggioAttivo = true;
    documento.config.account.attivo = true;
    documento.config.account.clientId = 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3';
    documento.config.account.urlRitorno = 'http://localhost:4173/';
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.account.urlRitorno'),
      'nessun avvertimento sull indirizzo di ritorno');
  });

  await prova('controlli: l interruttore acceso senza Client ID viene detto', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.lurk.messaggioAttivo = true;
    documento.config.account.attivo = true;
    documento.config.account.clientId = '';
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.account.clientId'),
      'nessun avvertimento sul Client ID mancante');
  });

  await prova('email: la buona passa, la storta no', () => {
    esigiUguale(convalida.convalidaCampo('config.email', 'a@b.it').length, 0, 'email buona');
    esigi(convalida.convalidaCampo('config.email', 'a@b').length === 1, 'email senza dominio');
    esigi(convalida.convalidaCampo('config.email', 'chiocciola mancante').length === 1, 'email senza chiocciola');
  });

  await prova('numeri: fuori intervallo e non numeri vengono presi', () => {
    esigiUguale(convalida.convalidaCampo('config.dati.dal', 2013).length, 0, 'anno buono');
    esigi(convalida.convalidaCampo('config.dati.dal', 1200).length === 1, 'anno troppo indietro');
    esigi(convalida.convalidaCampo('config.dati.follower', -1).length === 1, 'follower negativi');
    esigi(convalida.convalidaCampo('config.dati.follower', '3619').length === 1, 'numero come testo');
  });

  await prova('lunghezza massima e testo su una riga sola', () => {
    esigi(convalida.convalidaCampo('deck.titolo', 'x'.repeat(41)).length === 1, 'oltre il massimo');
    esigi(convalida.convalidaCampo('deck.titolo', 'due\nrighe').length === 1, 'a capo in un campo breve');
  });

  await prova('elenchi: la voce senza URL passa, quella con icona inventata no', () => {
    const rotto = JSON.parse(JSON.stringify(contenutiVeri));
    rotto.config.social[3].url = '';
    rotto.config.social[0].icona = 'piccione';
    const errori = convalida.convalida(rotto);
    esigiUguale(errori.length, 1, 'atteso un solo errore');
    esigiUguale(errori[0].chiave, 'config.social[0].icona', 'chiave indicizzata');
  });

  await prova('due voci con lo stesso nome interno vengono segnalate', () => {
    const rotto = JSON.parse(JSON.stringify(contenutiVeri));
    rotto.config.supporto[1].chiave = rotto.config.supporto[0].chiave;
    const errori = convalida.convalida(rotto);
    esigi(errori.some((e) => e.chiave === 'config.supporto[1].chiave'), 'doppione non segnalato');
  });

  await prova('un campo cancellato dai contenuti viene segnalato', () => {
    const rotto = JSON.parse(JSON.stringify(contenutiVeri));
    delete rotto.testi['chi.citazione'];
    esigi(convalida.convalida(rotto).some((e) => e.chiave === 'chi.citazione'), 'chiave sparita non segnalata');
  });

  await prova('ricco: il massimo conta le lettere che si leggono, non i tag', () => {
    esigiUguale(convalida.convalidaCampo('saluti.testo', '<b>' + 'x'.repeat(240) + '</b>').length, 0, '240 caratteri visibili');
    esigi(convalida.convalidaCampo('saluti.testo', 'x'.repeat(241)).length === 1, '241 caratteri');
    esigi(convalida.convalidaCampo('saluti.testo', '').length === 1, 'campo vuoto');
    esigi(convalida.convalidaCampo('saluti.testo', '<b></b>').length === 1, 'solo formattazione, niente testo');
  });

  await prova('ricco: quello che il sanificatore toglie viene raccontato', () => {
    const errori = convalida.convalidaCampo('saluti.testo', '<b>ciao</b><script>alert(1)</script>');
    esigi(errori.length >= 1, 'lo script non e stato segnalato');

    esigiDentro(errori[0].messaggio, schema.campo('saluti.testo').etichetta, 'il messaggio non nomina il campo');
    esigi(convalida.convalidaCampo('saluti.testo', '<a href="javascript:alert(1)">qui</a> ciao').length >= 1,
      'link javascript: non segnalato');
  });

  await prova('colore: solo esadecimale a sei cifre col cancelletto', () => {
    esigiUguale(convalida.convalidaCampo('config.tema.colori.viola', '#8b2fff').length, 0, 'colore buono');
    for (const storto of ['8b2fff', '#abc', '#8b2fffff', 'rgb(1, 2, 3)', 'viola']) {
      esigi(convalida.convalidaCampo('config.tema.colori.viola', storto).length === 1, 'doveva essere rifiutato: ' + storto);
    }
  });

  await prova('font: deve stare nel catalogo E nello slot giusto', () => {
    esigiUguale(convalida.convalidaCampo('config.tema.font.titolo', 'Space Grotesk').length, 0, 'font da titoli');
    esigiUguale(convalida.convalidaCampo('config.tema.font.mono', 'JetBrains Mono').length, 0, 'font da strumentazione');
    esigi(convalida.convalidaCampo('config.tema.font.titolo', 'Mai Sentito').length === 1, 'famiglia inventata');

    esigi(convalida.convalidaCampo('config.tema.font.titolo', 'JetBrains Mono').length === 1,
      'famiglia del catalogo ma dello slot sbagliato');
  });

  await prova('interruttore: solo booleani veri, la stringa "true" no', () => {
    esigiUguale(convalida.convalidaCampo('config.pollo.attivo', true).length, 0, 'acceso');
    esigiUguale(convalida.convalidaCampo('config.pollo.attivo', false).length, 0, 'spento');
    for (const storto of ['true', 'false', 1, 0, null]) {
      esigi(convalida.convalidaCampo('config.pollo.attivo', storto).length === 1,
        'doveva essere rifiutato: ' + JSON.stringify(storto));
    }
  });
}

async function proveSchema(contenutiVeri) {
  apriSezione('3. Copertura dello schema');

  await prova('lo schema copre esattamente contenuti.json', () => {
    const problemi = schema.verificaCopertura(contenutiVeri);
    esigi(problemi.length === 0, problemi.map((p) => p.messaggio).join(' | '));
  });

  await prova('ogni campo ha etichetta, tipo valido e chiave unica', () => {
    const viste = new Set();
    for (const campo of schema.campi()) {
      esigi(!!campo.etichetta, 'campo senza etichetta: ' + campo.chiave);
      esigi(schema.TIPI.indexOf(campo.tipo) !== -1, 'tipo sconosciuto su ' + campo.chiave);
      esigi(!viste.has(campo.chiave), 'chiave doppia: ' + campo.chiave);
      viste.add(campo.chiave);
    }
  });

  await prova('i gruppi seguono l ordine della pagina', () => {

    const atteso = ['meta', 'marchio', 'deck', 'diretta', 'account', 'lurk', 'pollo', 'clip', 'giochi', 'sondaggio', 'settimana', 'chi',
      'supporto', 'saluti', 'sponsor', 'piede', 'musica', 'canale', 'aspetto', 'manutenzione', 'meteora'];
    esigiUguale(schema.gruppi.map((g) => g.id).join(','), atteso.join(','), 'ordine dei gruppi');
  });

  await prova('i quattro tipi del CONTRATTO-2 sono nell elenco TIPI', () => {
    for (const tipo of ['ricco', 'colore', 'font', 'interruttore']) {
      esigi(schema.TIPI.indexOf(tipo) !== -1, 'manca il tipo ' + tipo);
    }
  });

  await prova('ogni campo font dichiara il suo slot, e lo slot esiste nel catalogo', () => {
    const font = schema.campi().filter((c) => c.tipo === 'font');
    esigi(font.length >= 3, 'attesi almeno tre campi font, trovati ' + font.length);
    for (const campo of font) {
      esigi(!!campo.slot, 'il campo ' + campo.chiave + ' non dice a quale font del sito appartiene');
      esigi(Array.isArray(tema.CATALOGO_FONT[campo.slot]), 'il catalogo non ha voci per lo slot "' + campo.slot + '"');
    }
  });

  await prova('una chiave in piu nei contenuti viene segnalata come scoperta', () => {
    const gonfio = JSON.parse(JSON.stringify(contenutiVeri));
    gonfio.testi['deck.inventata'] = 'x';
    const problemi = schema.verificaCopertura(gonfio);
    esigi(problemi.some((p) => p.chiave === 'deck.inventata' && p.tipo === 'scoperta'), 'chiave in piu non segnalata');
  });

  await prova('una chiave sparita dai contenuti viene segnalata come inesistente', () => {
    const magro = JSON.parse(JSON.stringify(contenutiVeri));
    delete magro.config.immagini.favicon;
    const problemi = schema.verificaCopertura(magro);
    esigi(problemi.some((p) => p.chiave === 'config.immagini.favicon' && p.tipo === 'inesistente'), 'chiave sparita non segnalata');
  });

  await prova('un contenuti.json di ieri continua a pubblicare: i campi nuovi nascono col loro valore', () => {

    const vecchio = JSON.parse(JSON.stringify(contenutiVeri));
    const nuovi = schema.campi().filter((c) => Object.prototype.hasOwnProperty.call(c, 'predefinito'));
    esigi(nuovi.length > 0, 'nessun campo con un predefinito: la prova non sta provando niente');
    for (const campo of nuovi) {
      if (campo.chiave.startsWith('config.')) {
        const pezzi = campo.chiave.slice('config.'.length).split('.');
        let dove = vecchio.config;
        for (let i = 0; i < pezzi.length - 1 && dove; i++) { dove = dove[pezzi[i]]; }
        if (dove) { delete dove[pezzi[pezzi.length - 1]]; }
      } else {
        delete vecchio.testi[campo.chiave];
      }
    }

    esigiUguale(schema.verificaCopertura(vecchio).length, 0, 'la copertura si lamenta di un contenuti.json di ieri');

    const aggiunte = schema.completa(vecchio);
    esigiUguale(aggiunte.length, nuovi.length, 'quante chiavi sono nate');
    for (const campo of nuovi) {
      const esito = schema.valoreDi(vecchio, campo.chiave);
      esigi(esito.trovato, 'manca ancora ' + campo.chiave);

      esigiUguale(JSON.stringify(esito.valore), JSON.stringify(campo.predefinito), 'valore di partenza di ' + campo.chiave);
    }
    esigiUguale(convalida.convalida(vecchio).length, 0, 'i valori di partenza non passano la convalida');

    vecchio.testi['clip.paginaTitolo'] = 'Le mie clip';
    esigiUguale(schema.completa(vecchio).length, 0, 'completa() ha rifatto il lavoro');
    esigiUguale(vecchio.testi['clip.paginaTitolo'], 'Le mie clip', 'completa() ha sovrascritto una scelta');
  });
}

async function proveTestoRicco() {
  apriSezione('4. Testo ricco (server/lib/testoricco.js)');

  await prova('script, eventi e tag di blocco non arrivano in pagina', () => {
    const casi = [
      '<script>alert(1)</script>Ciao',
      '<img src=x onerror=alert(1)>Ciao',
      '<scr<script>ipt>alert(1)</script>Ciao',
      '<div onclick="alert(1)">Ciao</div>',
      '<style>body{display:none}</style>Ciao',
      '<iframe src="https://altrosito.example"></iframe>Ciao'
    ];
    for (const cattivo of casi) {
      const pulito = testoricco.sanifica(cattivo);
      esigiDentro(pulito, 'Ciao', 'il testo buono e sparito insieme al resto: ' + cattivo);

      for (const trovato of pulito.match(/<\/?[a-zA-Z][^\s>/]*/g) || []) {
        const nome = trovato.replace(/^<\/?/, '').toLowerCase();
        esigi(Object.prototype.hasOwnProperty.call(testoricco.TAG_AMMESSI, nome),
          'e passato il tag <' + nome + '> partendo da ' + cattivo);
      }
      esigi(!/\son[a-z]+\s*=/i.test(pulito), 'e passato un attributo evento: ' + cattivo);
    }

    esigiUguale(testoricco.sanifica('<script>alert(1)</script>Ciao'), 'Ciao', 'contenuto dello script');
    esigiUguale(testoricco.sanifica('<style>body{display:none}</style>Ciao'), 'Ciao', 'contenuto dello style');
  });

  await prova('un link javascript: perde il collegamento e tiene il testo', () => {
    for (const cattivo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//altrosito.it/x']) {
      const pulito = testoricco.sanifica('<a href="' + cattivo + '">clicca</a>');
      esigiUguale(pulito, 'clicca', 'href ' + cattivo);
    }

    const buono = testoricco.sanifica('<a href="https://esempio.it">fuori</a>');
    esigiDentro(buono, 'href="https://esempio.it"', 'link esterno');
    esigiDentro(buono, 'rel="noopener noreferrer"', 'rel del link esterno');
  });

  await prova('un <b> lasciato aperto viene chiuso, non lasciato li', () => {
    esigiUguale(testoricco.sanifica('<b>grassetto senza chiusura'), '<b>grassetto senza chiusura</b>', 'chiusura');
    esigi(testoricco.problemi('<b>x', { etichetta: 'Prova' }).length === 1, 'il problema non viene raccontato');
    esigiDentro(testoricco.problemi('<b>x', { etichetta: 'Prova' })[0], 'Prova', 'il messaggio non nomina il campo');
  });

  await prova('lo <span> tiene solo le tre classi ammesse', () => {
    esigiUguale(testoricco.sanifica('<span class="evidenza">x</span>'), '<span class="evidenza">x</span>', 'classe ammessa');
    esigiUguale(testoricco.sanifica('<span class="cattiva">x</span>'), '<span>x</span>', 'classe inventata');
    const guai = testoricco.problemi('<span class="cattiva">x</span>', { etichetta: 'Prova' });
    esigi(guai.length === 1 && guai[0].indexOf('cattiva') !== -1, 'la classe rifiutata non viene detta');
  });

  await prova('le entita gia protette restano protette (e sanificare due volte non cambia niente)', () => {
    esigiUguale(testoricco.sanifica('&lt;script&gt;'), '&lt;script&gt;', 'entita gia protetta');
    esigiUguale(testoricco.sanifica('&amp; e &lt;'), '&amp; e &lt;', 'e commerciale');
    for (const caso of ['&lt;script&gt;<b>x', '<a href="https://x.it">y</a>', 'tre < cinque']) {
      esigiUguale(testoricco.sanifica(testoricco.sanifica(caso)), testoricco.sanifica(caso), 'idempotenza su ' + caso);
    }
  });

  await prova('soloTesto conta le lettere e non lancia mai', () => {
    esigiUguale(testoricco.soloTesto('uno<br>due'), 'uno due', 'il <br> vale uno spazio');
    esigiUguale(testoricco.soloTesto('<b>ciao</b>'), 'ciao', 'senza tag');
    for (const strano of [null, undefined, 42, '<b', '<<<>>>']) {
      esigi(typeof testoricco.soloTesto(strano) === 'string', 'soloTesto ha lanciato su ' + JSON.stringify(strano));
      esigi(typeof testoricco.sanifica(strano) === 'string', 'sanifica ha lanciato su ' + JSON.stringify(strano));
    }
  });
}

function dichiara(css, token) {
  return new RegExp('^\\s*' + token + ':\\s', 'm').test(css);
}

function polarita(css) {
  const trovato = /--linea:\s*rgba\((\d+), (\d+), (\d+)/.exec(css);
  if (!trovato) { throw new Error('il foglio non dichiara --linea'); }
  return trovato[1] === '255' ? 'SCURA' : 'CHIARA';
}

async function proveTema() {
  apriSezione('5. Tema (server/lib/tema.js)');

  const TOKEN = [
    '--viola', '--viola-cupo', '--viola-chiaro', '--ciano', '--magenta', '--live', '--ok', '--allerta',
    '--fondo', '--fondo-2', '--pannello', '--pannello-2', '--velo',
    '--linea', '--linea-forte', '--linea-comando', '--linea-viva',
    '--testo', '--testo-medio', '--testo-tenue',
    '--grad-pagina', '--grad-titolo', '--grad-pannello',
    '--bagliore-viola', '--bagliore-ciano',
    '--font-titolo', '--font-testo', '--font-mono',
    '--raggio', '--raggio-s', '--raggio-g', '--max-larghezza', '--passo'
  ];

  await prova('il foglio contiene tutti i token attesi, dentro un solo :root', () => {
    const css = tema.css(tema.PREDEFINITO);
    esigiUguale((css.match(/:root\s*{/g) || []).length, 1, 'blocchi :root');
    for (const token of TOKEN) { esigi(dichiara(css, token), 'manca il token ' + token); }
  });

  await prova('--twitch non si tocca: e il marchio di qualcun altro', () => {
    esigi(!dichiara(tema.css(tema.PREDEFINITO), '--twitch'), '--twitch viene riscritto dal tema');
  });

  await prova('cambiare un colore cambia davvero il foglio', () => {
    const prima = tema.css(tema.PREDEFINITO);
    const dopo = tema.css(Object.assign({}, tema.PREDEFINITO, {
      colori: Object.assign({}, tema.PREDEFINITO.colori, { viola: '#ff0000' })
    }));
    esigi(prima !== dopo, 'il foglio non e cambiato');
    esigiDentro(dopo, '--viola: #ff0000', 'il colore scelto');

    esigi(/--bagliore-viola: 0 0 24px rgba\(255, 0, 0/.test(dopo), 'il bagliore non ha seguito il colore');
    esigi(dopo.indexOf('rgba(255, 0, 0') !== -1, 'nessun derivato ha seguito il colore');
  });

  await prova('la polarita si inverte da sola con un fondo chiaro', () => {
    const scuro = tema.css(tema.PREDEFINITO);
    esigiDentro(scuro, '--linea: rgba(255, 255, 255', 'sul fondo scuro le linee sono bianche');
    esigiUguale(polarita(scuro), 'SCURA', 'polarita dichiarata nel foglio scuro');

    const chiaro = tema.css(Object.assign({}, tema.PREDEFINITO, {
      colori: Object.assign({}, tema.PREDEFINITO.colori, {
        fondo: '#f5f3ef', testo: '#151221', testoMedio: '#3d3752', testoTenue: '#554e6b'
      })
    }));
    esigiDentro(chiaro, '--linea: rgba(0, 0, 0', 'sul fondo chiaro le linee devono diventare nere');
    esigiDentro(chiaro, '--linea-forte: rgba(0, 0, 0', 'linea forte');
    esigiDentro(chiaro, '--linea-comando: rgba(0, 0, 0', 'linea dei comandi');
    esigiUguale(polarita(chiaro), 'CHIARA', 'polarita dichiarata nel foglio chiaro');
  });

  await prova('il preset «Carta chiara» esce chiaro, gli altri scuri', () => {
    esigi(tema.PRESET.length >= 2, 'attese almeno due combinazioni pronte');
    for (const preset of tema.PRESET) {
      const css = tema.css(preset.tema);
      esigi(dichiara(css, '--fondo'), 'il preset ' + preset.id + ' non produce un foglio buono');
      const attesa = preset.id === 'carta-chiara' ? 'CHIARA' : 'SCURA';
      esigiUguale(polarita(css), attesa, 'polarita del preset ' + preset.id);
    }
  });

  await prova('gli aloni vanno da fondo piatto a doppio, senza «transparent»', () => {
    const piatto = tema.css({ sfondo: { aloni: 0 } });

    esigi(piatto.indexOf('--grad-pagina: ' + tema.PREDEFINITO.colori.fondo + ';') !== -1,
      'a zero aloni il fondo non e piatto');
    const pieno = tema.css({ sfondo: { aloni: 100 } });
    esigiDentro(pieno, 'radial-gradient', 'gli aloni');

    esigi(pieno.indexOf('transparent') === -1, 'una coda usa transparent invece di rgba(...,0)');
    esigi(tema.css({ sfondo: { aloni: 200 } }) !== pieno, 'l intensita non cambia niente');
  });

  await prova('il raggio comanda gli altri due, i font portano il ripiego dietro', () => {
    const css = tema.css({ forma: { raggio: 20 } });
    esigiDentro(css, '--raggio: 20px', 'raggio');
    esigiDentro(css, '--raggio-s: 11px', 'raggio piccolo (0,57x)');
    esigiDentro(css, '--raggio-g: 31px', 'raggio grande (1,57x)');
    esigiDentro(tema.css(tema.PREDEFINITO), "--font-titolo: 'Space Grotesk', ", 'famiglia e ripiego');
  });

  await prova('un tema mezzo scritto non fa saltare niente: si ricade sul predefinito', () => {

    for (const storto of [null, undefined, 'no', 42, [], { colori: { fondo: '#ab' } }, { font: { titolo: 'Mai Sentito' } }]) {
      const css = tema.css(storto);
      esigi(typeof css === 'string' && dichiara(css, '--fondo'), 'tema storto: ' + JSON.stringify(storto));
    }
    esigiDentro(tema.css({ colori: { fondo: '#ab' } }), '--fondo: ' + tema.PREDEFINITO.colori.fondo, 'il fondo di partenza');
    esigiDentro(tema.css({ font: { titolo: 'Mai Sentito' } }), "--font-titolo: '" + tema.PREDEFINITO.font.titolo + "'", 'il font di partenza');
  });

  await prova('l indirizzo di Google Fonts chiede solo le famiglie e i pesi che servono', () => {
    const url = tema.urlGoogleFonts(tema.PREDEFINITO);
    esigiDentro(url, 'https://fonts.googleapis.com/css2?', 'indirizzo');
    esigiDentro(url, 'display=swap', 'display=swap');

    const scelta = tema.CATALOGO_FONT.titolo.find((f) => f.nome === tema.PREDEFINITO.font.titolo);
    esigiDentro(url, 'family=' + scelta.nome.replace(/ /g, '+') + ':wght@' + scelta.pesi.join(';'), 'famiglia dei titoli');

    esigiUguale(tema.urlGoogleFonts({ font: { titolo: 'Font di sistema', testo: 'Font di sistema', mono: 'Font di sistema' } }),
      '', 'font tutti di sistema');
  });
}

function preparaProgetto(radice) {
  fs.mkdirSync(path.join(radice, 'contenuti'), { recursive: true });
  fs.mkdirSync(path.join(radice, 'server', 'modelli'), { recursive: true });
  fs.mkdirSync(path.join(radice, 'js'), { recursive: true });
  fs.copyFileSync(path.join(RADICE_VERA, 'js', 'pollorun-gioco.js'), path.join(radice, 'js', 'pollorun-gioco.js'));
  fs.cpSync(path.join(RADICE_VERA, 'modelli'), path.join(radice, 'modelli'), { recursive: true });
  fs.copyFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), path.join(radice, 'contenuti', 'contenuti.json'));
  fs.copyFileSync(path.join(RADICE_VERA, 'server', 'modelli', 'dati.js.tpl'), path.join(radice, 'server', 'modelli', 'dati.js.tpl'));
}

async function proveGenerazione(radice, costruisci, archivio) {
  apriSezione('6. Generazione completa (cartella temporanea)');

  let esito = null;

  await prova('la generazione scrive i TRE file: index.html, js/dati.js e css/tema.css', () => {
    esito = costruisci.genera();
    esigi(fs.existsSync(P.indexHtml), 'index.html non scritto');
    esigi(fs.existsSync(P.datiJs), 'js/dati.js non scritto');
    esigi(fs.existsSync(P.temaCss), 'css/tema.css non scritto');
    esigi(esito.durataMs >= 0, 'durata mancante');
    esigiUguale(esito.scritti.map((s) => s.file).join(', '), 'index.html, js/dati.js, css/tema.css', 'elenco degli scritti');
  });

  await prova('css/tema.css e il foglio calcolato dal tema dei contenuti', () => {
    const foglio = fs.readFileSync(P.temaCss, 'utf8');
    esigiUguale(foglio, require('./lib/tema').css(archivio.leggi().config.tema), 'il foglio scritto non e quello calcolato');

    esigiDentro(fs.readFileSync(P.indexHtml, 'utf8'), 'href="css/tema.css"', 'il <link> del tema in pagina');
  });

  await prova('ha fatto un backup prima di scrivere', () => {
    esigi(esito && esito.backup, 'nessun identificativo di backup');
    esigi(fs.existsSync(path.join(P.backup, esito.backup, 'contenuti.json')), 'nel backup manca contenuti.json');
  });

  await prova('index.html contiene i testi e non lascia segnaposto', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    esigiDentro(html, '<html lang="it">', 'lingua');
    esigiDentro(html, 'slayer_beard', 'nome del canale');
    esigiDentro(html, 'https://www.twitch.tv/slayer_beard', 'url del canale');
    esigi(html.indexOf('{{') === -1, 'sono rimasti dei segnaposto non risolti');
  });

  await prova('il nastro ha sette giorni, da lunedi a domenica', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    const trovati = html.match(/data-giorno="\d"/g) || [];
    esigiUguale(trovati.length, 7, 'giorni nel nastro');
    esigiUguale(trovati.join(','), 'data-giorno="1",data-giorno="2",data-giorno="3",data-giorno="4",data-giorno="5",data-giorno="6",data-giorno="0"', 'ordine dei giorni');
  });

  await prova('le voci senza URL non finiscono nella pagina', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    const contenuti = archivio.leggi();
    const social = contenuti.config.social;
    const supporto = contenuti.config.supporto;
    const conUrl = (elenco) => elenco.filter((v) => String(v.url || '').trim()).length;

    esigi(conUrl(social) < social.length, 'il caso non e coperto dai dati: nessun social senza URL');
    esigi(conUrl(supporto) < supporto.length, 'il caso non e coperto dai dati: nessuna riga di supporto senza URL');

    esigiUguale((html.match(/class="social__voce"/g) || []).length, conUrl(social), 'voci social nei saluti');
    esigiUguale((html.match(/class="binario__social-voce"/g) || []).length, conUrl(social), 'voci social nel binario');
    esigiUguale((html.match(/class="listino__riga"/g) || []).length, conUrl(supporto), 'righe del listino');

    for (const voce of social.filter((v) => !String(v.url || '').trim())) {
      esigi(html.indexOf(voce.icona + '.svg') === -1, 'l icona di "' + voce.nome + '" e finita nella pagina');
    }
  });

  await prova('le icone sono state incorporate come SVG', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    esigi((html.match(/<svg/g) || []).length >= 8, 'troppe poche icone incorporate');
  });

  await prova('il JSON-LD generato resta JSON valido', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    const trovato = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    esigi(trovato !== null, 'JSON-LD non trovato');
    const dati = JSON.parse(trovato[1]);
    esigi(Array.isArray(dati.sameAs) && dati.sameAs.length >= 2, 'sameAs non e un elenco pieno');
  });

  await prova('js/dati.js ha la forma esatta del contratto', () => {
    const testo = fs.readFileSync(P.datiJs, 'utf8');
    esigiDentro(testo, 'window.DATI = {', 'assegnazione');
    const dati = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1));
    for (const chiave of ['twitch', 'orari', 'email', 'ultimaDiretta', 'testi']) {
      esigi(Object.prototype.hasOwnProperty.call(dati, chiave), 'manca ' + chiave);
    }
    for (const chiave of ['statoLive', 'statoOffline', 'statoVerifica', 'chatApri', 'chatChiudi',
      'etichettaOggi', 'etichettaProssima', 'copiaBtn', 'copiaFatto']) {
      esigi(!!dati.testi[chiave], 'manca o e vuoto testi.' + chiave);
    }
    esigi(dati.twitch.domini.indexOf('localhost') !== -1, 'localhost non aggiunto ai domini');
    esigi(dati.twitch.domini.indexOf('127.0.0.1') !== -1, '127.0.0.1 non aggiunto ai domini');
  });

  await prova('window.DATI.pollo c e, con le sette liste di frasi', () => {
    const testo = fs.readFileSync(P.datiJs, 'utf8');
    const dati = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1));
    esigi(dati.pollo && typeof dati.pollo === 'object', 'manca il ramo pollo');
    for (const chiave of ['attivo', 'chatVera', 'mostraMessaggi']) {
      esigiUguale(typeof dati.pollo[chiave], 'boolean', 'pollo.' + chiave + ' deve essere un booleano');
    }

    for (const elenco of ['riposo', 'click', 'chat', 'scrive', 'live', 'lurk', 'offline']) {
      esigi(Array.isArray(dati.pollo.frasi[elenco]), 'manca frasi.' + elenco);
      esigi(dati.pollo.frasi[elenco].length > 0, 'frasi.' + elenco + ' e vuoto');
      esigi(dati.pollo.frasi[elenco].every((f) => typeof f === 'string' && f.trim()), 'una frase vuota in ' + elenco);
    }
    esigiUguale(Object.keys(dati.pollo.frasi).length, 7, 'liste di frasi');
    esigi(!!dati.pollo.testi.etichetta, 'manca l etichetta del bottone del pollo');
    esigi(!!dati.pollo.testi.nascondi, 'manca l etichetta del «nascondi»');

    for (const elenco of ['riposo', 'click', 'scrive', 'live', 'lurk', 'offline']) {
      esigi(dati.pollo.frasi[elenco].every((f) => f.indexOf('{nome}') === -1), '{nome} usato in frasi.' + elenco);
    }
  });

  await prova('la pagina ha la sezione #diretta, il pollo e sei voci nel binario', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    esigiDentro(html, 'id="diretta"', 'la sezione della diretta');
    esigiDentro(html, 'id="pollo"', 'il pollo');
    esigiDentro(html, 'id="twitch-embed"', 'il posto del player');
    esigiUguale((html.match(/class="binario__voce"/g) || []).length, 6, 'voci del binario');

    const daRegia = html.slice(html.indexOf('id="regia"'));
    const soloRegia = daRegia.slice(0, daRegia.indexOf('</section>'));
    esigi(soloRegia.indexOf('id="twitch-embed"') === -1, 'il monitor e tornato dentro la copertina');
  });

  await prova('i valori ricchi entrano nel contesto gia sanificati', () => {
    const documento = archivio.leggi();
    documento.testi['deck.sottotitolo'] = 'Ciao <b>mondo</b><script>alert(1)</script> e <a href="javascript:alert(1)">qui</a>';
    const contesto = costruisci.costruisciContesto(documento);
    const reso = contesto['deck.sottotitolo'];
    esigiDentro(reso, '<b>mondo</b>', 'il grassetto ammesso deve restare');
    esigi(reso.indexOf('<script') === -1, 'lo script e arrivato nel contesto');
    esigi(reso.indexOf('javascript:') === -1, 'il link javascript: e arrivato nel contesto');

    esigiDentro(documento.testi['deck.sottotitolo'], '<script>', 'il documento originale e stato modificato');
  });

  await prova('il testo degli orari e in italiano corrente', () => {
    const contesto = costruisci.costruisciContesto(archivio.leggi());
    esigiUguale(contesto.sito.orariTesto, 'Lunedì, mercoledì, venerdì e domenica alle 21:00', 'orariTesto');
    esigiUguale(contesto.settimana.length, 7, 'voci della settimana');
    esigiUguale(contesto.settimana[0].abbr, 'LUN', 'prima voce');
    esigiUguale(contesto.settimana[6].nome, 'Domenica', 'ultima voce');
  });

  await prova('contenuti non validi fermano tutto senza scrivere', () => {
    const primaHtml = fs.readFileSync(P.indexHtml, 'utf8');
    const documento = archivio.leggi();
    const salvato = documento.testi['deck.titolo'];
    documento.testi['deck.titolo'] = '';
    archivio.salva(documento);

    let err = null;
    try { costruisci.genera(); } catch (e) { err = e; }
    esigi(err !== null, 'la generazione doveva fallire');
    esigi(Array.isArray(err.errori) && err.errori.length > 0, 'mancano gli errori di convalida');
    esigiUguale(fs.readFileSync(P.indexHtml, 'utf8'), primaHtml, 'index.html e stato toccato lo stesso');

    documento.testi['deck.titolo'] = salvato;
    archivio.salva(documento);
  });

  await prova('il ripristino di un backup rimette indietro la pagina', () => {
    const backup = require('./lib/backup');

    const copia = backup.elenco().find((b) => b.file.indexOf('index.html') !== -1);
    esigi(copia !== undefined, 'nessuna copia contiene index.html');

    esigi(copia.file.indexOf('tema.css') !== -1, 'nella copia manca tema.css');
    fs.writeFileSync(P.indexHtml, '<!-- rovinato a mano -->', 'utf8');
    fs.writeFileSync(P.temaCss, ':root { --fondo: rovinato; }', 'utf8');
    const esitoRipristino = backup.ripristina(copia.id);
    esigi(esitoRipristino.ripristinati.indexOf('index.html') !== -1, 'index.html non ripristinato');
    esigi(esitoRipristino.ripristinati.indexOf('tema.css') !== -1, 'css/tema.css non ripristinato');
    esigi(esitoRipristino.backup !== copia.id, 'il ripristino non ha fatto la copia di sicurezza');
    esigi(fs.readFileSync(P.indexHtml, 'utf8').indexOf('rovinato') === -1, 'la pagina rovinata e ancora li');
    esigi(fs.readFileSync(P.temaCss, 'utf8').indexOf('rovinato') === -1, 'il tema rovinato e ancora li');

    fs.copyFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), P.contenutiJson);
    esigiUguale(convalida.convalida(archivio.leggi()).length, 0, 'contenuti rimessi a posto');
    costruisci.genera();
  });
}

async function proveLurk(contenutiVeri, costruisci, archivio) {
  apriSezione('7. Modalita lurk (CONTRATTO-3)');

  const TIPI_AMMESSI = ['interruttore', 'testo', 'url', 'numero', 'elencoTesti', 'ricco'];

  const profiloSano = { attivo: true, clientId: 'abcdef1234567890abcdef', urlRitorno: 'https://slayerbeard.com/' };
  const profiloSpento = { attivo: false, clientId: 'abcdef1234567890abcdef', urlRitorno: 'https://slayerbeard.com/' };
  const profiloSenzaClientId = { attivo: true, clientId: '', urlRitorno: 'https://slayerbeard.com/' };

  function documentoCon(lurk, account) {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    if (lurk === undefined) { delete documento.config.lurk; } else { documento.config.lurk = lurk; }
    if (account === undefined) { delete documento.config.account; } else { documento.config.account = account; }
    return documento;
  }

  function ramo(lurk, account) {
    return costruisci.oggettoDati(documentoCon(lurk, arguments.length < 2 ? profiloSano : account)).lurk;
  }

  function ramoAccount(account) {
    return costruisci.oggettoDati(documentoCon(sana(), arguments.length < 1 ? profiloSano : account)).account;
  }

  const sana = (aggiunte) => Object.assign({
    attivo: true, tieniSchermoAcceso: false, oreMax: 3,
    messaggioAttivo: true, clientId: 'abcdef1234567890abcdef', urlRitorno: 'https://slayerbeard.com/',
    frasi: ['Hey! Lurko dal sito.']
  }, aggiunte || {});

  await prova('window.DATI.lurk ha la forma esatta del contratto', () => {
    const testo = fs.readFileSync(P.datiJs, 'utf8');
    const dati = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1));
    const lurk = dati.lurk;
    esigi(lurk && typeof lurk === 'object', 'manca il ramo lurk');
    for (const chiave of ['attivo', 'tieniSchermoAcceso']) {
      esigiUguale(typeof lurk[chiave], 'boolean', 'lurk.' + chiave + ' deve essere un booleano');
    }
    esigiUguale(typeof lurk.oreMax, 'number', 'oreMax');
    esigi(lurk.messaggio && typeof lurk.messaggio === 'object', 'manca il sottoramo messaggio');
    esigiUguale(typeof lurk.messaggio.attivo, 'boolean', 'messaggio.attivo');
    esigi(Array.isArray(lurk.messaggio.frasi), 'messaggio.frasi non e un elenco');

    esigiUguale(lurk.messaggio.clientId, undefined, 'il lurk non deve avere un suo clientId');
    esigiUguale(lurk.messaggio.urlRitorno, undefined, 'il lurk non deve avere un suo urlRitorno');

    for (const chiave of ['accendi', 'spegni', 'audio', 'ripresa', 'ciSei', 'ciSono',
      'statoSpento', 'statoVivo', 'statoFermo', 'statoRiparto', 'statoBloccato', 'statoAttesa', 'statoResa',

      'schermo', 'chiuso', 'preavviso', 'invito', 'manda', 'inviato']) {
      esigi(!!lurk.testi[chiave], 'manca o e vuoto lurk.testi.' + chiave);
    }
  });

  await prova('window.DATI.account ha la forma esatta, e non porta la nota ricca', () => {
    const testo = fs.readFileSync(P.datiJs, 'utf8');
    const dati = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1));
    const account = dati.account;
    esigi(account && typeof account === 'object', 'manca il ramo account');
    esigiUguale(typeof account.attivo, 'boolean', 'account.attivo');
    esigiUguale(typeof account.motivo, 'string', 'account.motivo');
    esigiUguale(typeof account.clientId, 'string', 'account.clientId');
    esigiUguale(typeof account.urlRitorno, 'string', 'account.urlRitorno');
    for (const chiave of ['entra', 'esci', 'collegato']) {
      esigi(!!account.testi[chiave], 'manca o e vuoto account.testi.' + chiave);
    }

    esigiUguale(account.testi.nota, undefined, 'la nota ricca non deve entrare in js/dati.js');
  });

  await prova('il ramo account dice PERCHE e spento', () => {
    esigiUguale(ramoAccount().motivo, '', 'tutto a posto: nessun motivo');
    esigiUguale(ramoAccount(profiloSpento).motivo, 'spento', 'interruttore spento');
    esigiUguale(ramoAccount(profiloSenzaClientId).motivo, 'senzaClientId', 'client id mancante');

    esigiUguale(ramoAccount({ attivo: false, clientId: '' }).motivo, 'spento',
      'con tutto spento si nomina l interruttore per primo');
  });

  await prova('il ramo dice PERCHE il messaggio e spento, non solo che lo e', () => {

    esigiUguale(ramo(sana()).messaggio.motivo, '', 'tutto a posto: nessun motivo');
    esigiUguale(ramo(sana({ messaggioAttivo: false })).messaggio.motivo, 'spento', 'interruttore spento');
    esigiUguale(ramo(sana(), profiloSpento).messaggio.motivo, 'senzaAccount', 'profilo del sito spento');
    esigiUguale(ramo(sana(), profiloSenzaClientId).messaggio.motivo, 'senzaAccount', 'profilo senza Client ID');
    esigiUguale(ramo(sana({ frasi: [] })).messaggio.motivo, 'senzaFrasi', 'nessuna frase');

    esigiUguale(ramo(sana({ messaggioAttivo: false }), profiloSpento).messaggio.motivo, 'spento',
      'con tutto spento si nomina l interruttore per primo');
  });

  await prova('senza profilo del sito il messaggio resta spento, anche con l interruttore acceso', () => {

    esigiUguale(ramo(sana(), profiloSpento).messaggio.attivo, false, 'profilo spento');
    esigiUguale(ramo(sana(), profiloSenzaClientId).messaggio.attivo, false, 'client id vuoto');
    esigiUguale(ramo(sana(), { attivo: true, clientId: '   ' }).messaggio.attivo, false, 'client id di soli spazi');
    esigiUguale(ramo(sana(), {}).messaggio.attivo, false, 'ramo config.account vuoto');
    esigiUguale(ramo(sana(), undefined).messaggio.attivo, false, 'ramo config.account mancante');

    esigiUguale(ramo(sana({ clientId: 'abcdef1234567890abcdef' }), profiloSpento).messaggio.attivo, false,
      'client id rimasto dentro config.lurk');
  });

  await prova('senza frasi il messaggio resta spento, anche col profilo a posto', () => {
    esigiUguale(ramo(sana({ frasi: [] })).messaggio.attivo, false, 'elenco vuoto');
    esigiUguale(ramo(sana({ frasi: ['', '   '] })).messaggio.attivo, false, 'solo frasi vuote');
    esigiUguale(ramo(sana({ frasi: 'Hey! Lurko dal sito.' })).messaggio.attivo, false, 'frasi non e un elenco');
  });

  await prova('interruttore, profilo e almeno una frase: allora si accende', () => {
    const lurk = ramo(sana());
    esigiUguale(lurk.messaggio.attivo, true, 'messaggio.attivo');
    esigiUguale(lurk.messaggio.frasi.join('|'), 'Hey! Lurko dal sito.', 'frasi nel ramo');

    esigiUguale(ramoAccount().clientId, 'abcdef1234567890abcdef', 'client id nel ramo account');
    esigiUguale(ramoAccount().urlRitorno, 'https://slayerbeard.com/', 'url di ritorno nel ramo account');

    esigiUguale(ramo(sana({ messaggioAttivo: false })).messaggio.attivo, false, 'interruttore spento');
  });

  await prova('col messaggio spento le frasi non escono affatto', () => {

    for (const storta of [{ messaggioAttivo: false }, { frasi: [] }, { messaggioAttivo: 'si' }]) {
      const lurk = ramo(sana(storta));
      esigiUguale(lurk.messaggio.attivo, false, 'atteso spento con ' + JSON.stringify(storta));
      esigiUguale(lurk.messaggio.frasi.length, 0, 'frasi con ' + JSON.stringify(storta));
    }
  });

  await prova('col profilo spento il Client ID non esce affatto', () => {

    for (const storto of [profiloSpento, { attivo: 'si', clientId: 'abcdef1234567890abcdef' }, {}]) {
      const account = ramoAccount(storto);
      esigiUguale(account.attivo, false, 'atteso spento con ' + JSON.stringify(storto));
      esigiUguale(account.clientId, '', 'client id con ' + JSON.stringify(storto));
      esigiUguale(account.urlRitorno, '', 'url di ritorno con ' + JSON.stringify(storto));
    }
  });

  await prova('oreMax viene riportato dentro 1..12, sempre', () => {

    const casi = [[0, 1], [-5, 1], [1, 1], [12, 12], [99, 12], [3.6, 4]];
    for (const [dato, atteso] of casi) {
      esigiUguale(ramo(sana({ oreMax: dato })).oreMax, atteso, 'oreMax ' + JSON.stringify(dato));
    }

    const senza = sana();
    delete senza.oreMax;
    esigiUguale(ramo(senza).oreMax, 3, 'chiave mancante');
    esigiUguale(ramo(undefined).oreMax, 3, 'ramo config.lurk mancante');
    esigiUguale(ramo(sana({ oreMax: 'tre' })).oreMax, 3, 'parola al posto del numero');

    for (const storto of [null, '', '8', [], {}, NaN, Infinity, -Infinity, '12.9', true]) {
      const ore = ramo(sana({ oreMax: storto })).oreMax;
      esigi(Number.isInteger(ore) && ore >= 1 && ore <= 12, 'oreMax ' + JSON.stringify(storto) + ' e uscito ' + ore);
    }
  });

  await prova('minutiFraMessaggi viene riportato dentro 2..120, di serie 10', () => {

    const casi = [[0, 2], [-5, 2], [2, 2], [10, 10], [120, 120], [999, 120], [7.6, 8]];
    for (const [dato, atteso] of casi) {
      esigiUguale(ramo(sana({ minutiFraMessaggi: dato })).messaggio.minuti, atteso, 'minuti ' + JSON.stringify(dato));
    }
    esigiUguale(ramo(sana()).messaggio.minuti, 10, 'chiave mancante');
    esigiUguale(ramo(undefined).messaggio.minuti, 10, 'ramo config.lurk mancante');
    esigiUguale(ramo(sana({ minutiFraMessaggi: 'dieci' })).messaggio.minuti, 10, 'parola al posto del numero');

    const vecchio = JSON.parse(JSON.stringify(contenutiVeri));
    if (vecchio.config.lurk) { delete vecchio.config.lurk.minutiFraMessaggi; }
    esigi(schema.completa(vecchio).includes('config.lurk.minutiFraMessaggi'), 'completa() non aggiunge la chiave');
    esigiUguale(vecchio.config.lurk.minutiFraMessaggi, 10, 'predefinito');
  });

  await prova('gli interruttori si confrontano con true: la stringa non accende niente', () => {
    for (const chiave of ['attivo', 'tieniSchermoAcceso']) {
      esigiUguale(ramo(sana({ [chiave]: true }))[chiave], true, chiave + ' acceso');
      for (const storto of ['si', 'true', 1, 'false', {}, [], 'no']) {
        esigiUguale(ramo(sana({ [chiave]: storto }))[chiave], false,
          chiave + ' con ' + JSON.stringify(storto) + ' non deve accendersi');
      }
      const senza = sana();
      delete senza[chiave];
      esigiUguale(ramo(senza)[chiave], false, chiave + ' con la chiave mancante');
    }
  });

  await prova('le frasi vuote o di soli spazi vengono tolte, le altre ripulite', () => {
    const lurk = ramo(sana({ frasi: ['  Hey! Lurko dal sito.  ', '', '   ', 'Lurko dal pollaio.', null] }));
    esigiUguale(lurk.messaggio.frasi.join('|'), 'Hey! Lurko dal sito.|Lurko dal pollaio.', 'frasi ripulite');
    esigi(lurk.messaggio.frasi.every((f) => typeof f === 'string' && f.trim() !== ''), 'e passata una frase vuota');
  });

  await prova('la pagina generata ha la sezione #lurk, coi comandi vuoti', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    esigiUguale(archivio.leggi().config.lurk.attivo, true,
      'il caso non e coperto dai dati: la modalita lurk e spenta nei contenuti');
    esigiDentro(html, 'id="lurk"', 'la sezione del lurk');
    esigiDentro(html, 'id="lurk-stato"', 'la riga di stato');
    esigiDentro(html, 'id="lurk-conto"', 'il contatore');

    esigi(/<div id="lurk-comandi"[^>]*><\/div>/.test(html), '#lurk-comandi non c e, oppure non e vuoto');

    const conto = /<p id="lurk-conto"[^>]*>/.exec(html);
    esigi(conto !== null && conto[0].indexOf('aria-live') === -1, '#lurk-conto ha un aria-live');
  });

  await prova('la CSP resta stretta dove conta, e larga solo dove serve', () => {
    const html = costruisci.anteprimaDi(archivio.leggi());
    const meta = /<meta http-equiv="Content-Security-Policy" content="([\s\S]*?)">/.exec(html);
    esigi(meta !== null, 'la Content-Security-Policy non c e piu');
    const csp = meta[1].replace(/\s+/g, ' ');

    esigi(csp.indexOf('\'unsafe-inline\'') === -1 || /script-src [^;]*'unsafe-inline'/.test(csp) === false,
      'script-src ha guadagnato unsafe-inline');
    esigi(/script-src 'self' https:\/\/embed\.twitch\.tv/.test(csp), 'script-src non e piu quello di prima');

    esigi(/img-src [^;]*https:\/\/static-cdn\.jtvnw\.net/.test(csp),
      'img-src non permette il CDN delle immagini di profilo: l avatar resterebbe rotto');

    for (const dove of ['https://api.twitch.tv', 'https://id.twitch.tv']) {
      esigi(new RegExp('connect-src [^;]*' + dove.replace(/[.\/]/g, '\\$&')).test(csp),
        'connect-src non permette ' + dove);
    }
  });

  await prova('js/ritorno.js e il primo script della pagina, e non e differito', () => {
    const html = costruisci.anteprimaDi(archivio.leggi());

    const script = [];
    const cerca = /<script\s+src="([^"]+)"([^>]*)>/g;
    let voce;
    while ((voce = cerca.exec(html)) !== null) { script.push({ src: voce[1], attributi: voce[2] }); }

    esigi(script.length > 0, 'nella pagina non c e nessuno script');
    esigiUguale(script[0].src, 'js/ritorno.js', 'il primo script della pagina');
    esigi(script[0].attributi.indexOf('defer') === -1, 'js/ritorno.js e differito, e non deve esserlo');

    const soloNostri = script.map((s) => s.src).filter((s) => s.indexOf('js/') === 0);

    const facoltativi = ['js/slayer.js', 'js/pollorun.js', 'js/musica.js', 'js/sponsor.js'];
    const fissi = soloNostri.filter((s) => facoltativi.indexOf(s) === -1);
    const coda = soloNostri.slice(fissi.length);
    esigi(coda.every((s) => facoltativi.indexOf(s) > -1),
      'gli script facoltativi non stanno in fondo: ' + soloNostri.join(','));
    esigiUguale(fissi.join(','),
      'js/ritorno.js,js/dati.js,js/player.js,js/festa.js,js/sito.js,js/meteora.js,js/account.js,js/canale.js,js/spettatori.js,js/lurk.js,js/pollo.js,js/cima.js,js/guardia.js,js/sondaggio.js',
      'ordine degli script del sito');
  });

  await prova('con la modalita lurk spenta la sezione non viene stampata affatto', () => {
    const documento = archivio.leggi();
    documento.config.lurk.attivo = false;

    const html = costruisci.anteprimaDi(documento);
    esigi(html.indexOf('id="lurk"') === -1, 'la sezione #lurk e stata stampata lo stesso');
    esigi(html.indexOf('lurk-comandi') === -1, '#lurk-comandi e rimasto in pagina');
    esigi(html.indexOf('lurk__') === -1, 'e rimasto qualcosa del pannello del lurk');

    esigiDentro(html, 'id="diretta"', 'la sezione della diretta');
    esigiDentro(html, 'id="twitch-embed"', 'il posto del player');
    esigiUguale(archivio.leggi().config.lurk.attivo, true, 'i contenuti salvati sono stati toccati');
  });

  await prova('chiavi superate: un contenuti.json che ha ancora lo Spotify sul disco non blocca la pubblicazione', () => {
    const documento = archivio.leggi();
    documento.testi['spotify.titolo'] = 'In sottofondo';
    documento.testi['spotify.ascolta'] = 'Sta ascoltando';
    documento.testi['spotify.passa'] = 'Passa';
    documento.testi['spotify.nascondi'] = 'Riduci';
    documento.testi['spotify.mostra'] = 'Apri';
    documento.config.spotify = { attivo: true, segui: false, clientId: 'a'.repeat(32), link: 'https://open.spotify.com/x', formato: 'compatto', aperto: true };

    const prima = schema.verificaCopertura(documento).filter((p) => p.tipo === 'scoperta');
    esigiUguale(prima.length, 11, 'chiavi scoperte attese');

    schema.completa(documento);
    esigiUguale(schema.verificaCopertura(documento).filter((p) => p.tipo === 'scoperta').length, 0, 'chiavi scoperte dopo la pulizia');
    esigiUguale(convalida.convalida(documento).length, 0, 'la convalida deve passare');
    esigi(documento.config.spotify === undefined, 'config.spotify e rimasto');
    esigi(documento.testi['spotify.titolo'] === undefined, 'spotify.titolo e rimasto');
    esigiDentro(JSON.stringify(Object.keys(documento.testi)), 'meta.titolo', 'gli altri testi devono restare');
    esigi(typeof documento.config.email === 'string' && documento.config.email !== '', 'la email e sparita');
  });

  await prova('chiavi superate: il testo della Diretta, ancora nel contenuti.json online, non blocca la pubblicazione', () => {
    const documento = archivio.leggi();
    documento.testi['diretta.testo'] = 'Il canale e qui dentro, alla larghezza giusta.';
    esigiUguale(schema.verificaCopertura(documento).filter((p) => p.tipo === 'scoperta').length, 1, 'la chiave doveva risultare scoperta prima della pulizia');
    schema.completa(documento);
    esigi(documento.testi['diretta.testo'] === undefined, 'diretta.testo e rimasto');
    esigiUguale(schema.verificaCopertura(documento).length, 0, 'la copertura si lamenta dopo la pulizia');
    esigiUguale(convalida.convalida(documento).length, 0, 'la convalida deve passare');
    esigiDentro(costruisci.anteprimaDi(documento), 'data-sb-testo="diretta.titolo"', 'la pagina non si costruisce piu');
  });

  await prova('referral: spento non c e, acceso porta il riquadro col rel giusto, e senza link resta spento', () => {
    const documento = archivio.leggi();
    documento.config.referral.attivo = false;
    documento.config.referral.url = 'https://www.amazon.it/?tag=prova-21';
    const spento = costruisci.anteprimaDi(documento);
    esigi(spento.indexOf('class="referral"') === -1, 'il riquadro e stato stampato lo stesso');
    esigi(spento.indexOf('tag=prova-21') === -1, 'il link e finito in pagina col riquadro spento');

    documento.config.referral.attivo = true;
    documento.config.referral.url = '';
    esigi(costruisci.anteprimaDi(documento).indexOf('class="referral"') === -1, 'acceso senza link non deve comparire');

    documento.config.referral.url = 'https://www.amazon.it/?tag=prova-21';
    const acceso = costruisci.anteprimaDi(documento);
    esigiDentro(acceso, 'class="referral"', 'il riquadro in pagina');
    esigiDentro(acceso, 'tag=prova-21', 'il link');

    esigiDentro(acceso, 'rel="noopener sponsored"', 'rel del link di affiliazione');
    esigiDentro(acceso, documento.testi['saluti.referralNota'], 'la dichiarazione obbligatoria');
    esigiDentro(acceso, 'id="referral-titolo"', 'il titolo per aria-labelledby');
  });

  await prova('musica: spenta non lascia niente in pagina, accesa porta lettore, foglio e script', () => {
    const documento = archivio.leggi();
    const comEra = documento.config.musica.attivo;
    documento.config.musica.attivo = false;
    const spento = costruisci.anteprimaDi(documento);
    esigi(spento.indexOf('id="musica"') === -1, 'il lettore e stato stampato lo stesso');
    esigi(spento.indexOf('css/musica.css') === -1, 'il foglio del lettore e rimasto');
    esigi(spento.indexOf('js/musica.js') === -1, 'lo script del lettore e rimasto');

    documento.config.musica.attivo = true;
    documento.config.tracce = [
      { titolo: 'Uno', artista: 'Tizio', file: 'uno.mp3', link: '' },
      { titolo: 'Due', artista: '', file: 'due con spazi.mp3', link: 'https://example.org/' }
    ];
    const acceso = costruisci.anteprimaDi(documento);
    esigiDentro(acceso, 'id="musica"', 'il lettore in pagina');
    esigiDentro(acceso, 'css/musica.css', 'il foglio');
    esigiDentro(acceso, 'js/musica.js', 'lo script');
    esigiDentro(acceso, 'id="musica-audio"', 'l elemento audio');
    esigiDentro(acceso, 'id="musica-casuale"', 'il bottone del mescolamento');
    esigiDentro(acceso, 'aria-pressed="false"', 'il mescolamento parte spento nel markup');

    documento.config.musica.aperto = false;
    esigiDentro(costruisci.anteprimaDi(documento), 'data-aperto="0"', 'ridotto alla prima visita');
    documento.config.musica.aperto = true;
    esigiDentro(costruisci.anteprimaDi(documento), 'data-aperto="1"', 'aperto alla prima visita');

    esigiUguale(archivio.leggi().config.musica.attivo, comEra, 'i contenuti salvati sono stati toccati');
  });

  await prova('musica: gli indirizzi delle tracce nascono dalla cartella, e un nome storto non entra', () => {
    const documento = archivio.leggi();
    documento.config.musica.attivo = true;
    documento.config.musica.cartella = 'mp3';
    documento.config.tracce = [
      { titolo: 'Buona', artista: 'Tizio', file: 'keygen funk.mp3', cover: 'contenuti/media/x.webp', link: '' },
      { titolo: 'Fuori', artista: '', file: '../server/dati/auth.json', link: '' },
      { titolo: 'Fuori pure', artista: '', file: 'sotto/cartella.mp3', link: '' },
      { titolo: 'Senza file', artista: '', file: '', link: '' }
    ];
    const dati = costruisci.oggettoDati(documento, {});
    esigiUguale(dati.musica.tracce.length, 1, 'solo la traccia buona deve passare');
    esigiUguale(dati.musica.tracce[0].src, 'mp3/keygen%20funk.mp3', 'indirizzo della traccia');
    esigiUguale(dati.musica.tracce[0].titolo, 'Buona', 'titolo');
    esigiUguale(dati.musica.tracce[0].cover, 'contenuti/media/x.webp', 'copertina');

    documento.config.musica.attivo = false;
    esigiUguale(costruisci.oggettoDati(documento, {}).musica.tracce.length, 0, 'spenta non si pubblica nessuna traccia');
  });

  await prova('nessun foglio oltre tokens.css e tema.css contiene un esadecimale', () => {

    const cartella = path.join(RADICE_VERA, 'css');
    const fogli = fs.readdirSync(cartella).filter((f) => f.endsWith('.css') && f !== 'tokens.css' && f !== 'tema.css');
    esigi(fogli.indexOf('lurk.css') !== -1, 'css/lurk.css non c e');
    for (const foglio of fogli) {
      const css = fs.readFileSync(path.join(cartella, foglio), 'utf8');
      const trovati = css.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g) || [];
      esigi(trovati.length === 0, 'css/' + foglio + ' contiene ' + trovati.join(', '));
    }
  });

  await prova('il gruppo lurk sta fra account e pollo e usa solo tipi gia ammessi', () => {

    const ids = schema.gruppi.map((g) => g.id);
    const dove = ids.indexOf('lurk');
    esigi(dove !== -1, 'lo schema non ha il gruppo lurk');
    esigiUguale(ids[dove - 1], 'account', 'il gruppo che viene prima');
    esigiUguale(ids[dove + 1], 'pollo', 'il gruppo che viene dopo');
    esigiUguale(ids[dove - 2], 'diretta', 'il gruppo che viene prima di account');
    const gruppo = schema.gruppi[dove];
    esigi(gruppo.campi.length > 0, 'il gruppo lurk e vuoto');
    for (const campo of gruppo.campi) {
      esigi(TIPI_AMMESSI.indexOf(campo.tipo) !== -1,
        campo.chiave + ' usa il tipo "' + campo.tipo + '", che obbligherebbe a toccare pannello/');
    }
  });

  await prova('lo schema copre tutte le chiavi nuove del lurk', () => {
    const chiaviTesti = Object.keys(contenutiVeri.testi).filter((c) => c.indexOf('lurk.') === 0);
    esigi(chiaviTesti.length >= 20, 'attesi almeno venti testi del lurk, trovati ' + chiaviTesti.length);
    for (const chiave of chiaviTesti) {
      esigi(!!schema.campo(chiave), 'il testo ' + chiave + ' non ha un campo nello schema');
    }
    for (const nome of Object.keys(contenutiVeri.config.lurk)) {
      esigi(!!schema.campo('config.lurk.' + nome), 'config.lurk.' + nome + ' non ha un campo nello schema');
    }

    const problemi = schema.verificaCopertura(contenutiVeri);
    esigi(problemi.length === 0, problemi.map((p) => p.messaggio).join(' | '));
  });

  await prova('gli stati del lurk sono di tipo testo, non ricco', () => {

    const stati = schema.campi().filter((c) => c.chiave.indexOf('lurk.stato') === 0);
    esigi(stati.length >= 7, 'attesi almeno sette stati, trovati ' + stati.length);
    for (const campo of stati) {
      esigiUguale(campo.tipo, 'testo', campo.chiave);
    }

    const ricchi = schema.campi().filter((c) => c.chiave.indexOf('lurk.') === 0 && c.tipo === 'ricco').map((c) => c.chiave);
    esigiUguale(ricchi.join(','), 'lurk.spiegazione,lurk.notaAccount,lurk.notaMobile', 'i campi ricchi del lurk');
  });

  await prova('dell invio periodico esiste solo la cadenza: niente interruttore, niente tetto', () => {

    for (const nome of ['messaggioAutomatico', 'messaggiMax']) {
      esigi(!schema.campo('config.lurk.' + nome), 'lo schema ha rimesso config.lurk.' + nome);
      esigi(!Object.prototype.hasOwnProperty.call(contenutiVeri.config.lurk, nome),
        'i contenuti hanno rimesso config.lurk.' + nome);
    }
  });
}

function chiama(porta, metodo, percorso, opzioni) {
  const scelte = opzioni || {};
  return new Promise((risolvi, rifiuta) => {
    const intestazioni = Object.assign({}, scelte.intestazioni || {});
    let corpo = null;
    if (scelte.json !== undefined) {
      corpo = Buffer.from(JSON.stringify(scelte.json), 'utf8');
      intestazioni['Content-Type'] = 'application/json';
      intestazioni['Content-Length'] = String(corpo.length);
    } else if (scelte.corpo) {
      corpo = scelte.corpo;
      intestazioni['Content-Length'] = String(corpo.length);
    }
    if (scelte.biscotto) { intestazioni.Cookie = scelte.biscotto; }

    const req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: percorso, headers: intestazioni, agent: false }, (res) => {
      const pezzi = [];
      res.on('data', (p) => pezzi.push(p));
      res.on('end', () => {
        const grezzo = Buffer.concat(pezzi).toString('utf8');
        let dati = null;
        try { dati = JSON.parse(grezzo); } catch (e) {}
        risolvi({ stato: res.statusCode, testa: res.headers, testo: grezzo, dati: dati });
      });
    });
    req.on('error', rifiuta);
    if (corpo) { req.write(corpo); }
    req.end();
  });
}

function biscottoDa(risposta) {
  const posa = risposta.testa['set-cookie'];
  if (!posa || !posa.length) { return null; }
  return posa[0].split(';')[0];
}

async function proveApi(costruisci) {
  apriSezione('8. API su un server avviato in-process');

  const { creaServer } = require('./server.js');
  const server = creaServer();
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  const porta = server.address().port;
  const PASSWORD = PASSWORD_COLLAUDO;
  let biscotto = null;

  try {
    await prova('GET /api/sessione dice che e il primo avvio', async () => {
      const r = await chiama(porta, 'GET', '/api/sessione');
      esigiUguale(r.stato, 200, 'stato');
      esigiUguale(r.dati.autenticato, false, 'autenticato');
      esigiUguale(r.dati.primoAvvio, true, 'primoAvvio');
    });

    await prova('POST /api/entra rifiuta una password troppo corta', async () => {
      const r = await chiama(porta, 'POST', '/api/entra', { json: { password: 'corta' } });
      esigiUguale(r.stato, 400, 'stato');
      esigiDentro(r.dati.errore, 'almeno', 'messaggio');
    });

    await prova('POST /api/entra crea la password al primo avvio', async () => {
      const r = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD } });
      esigiUguale(r.stato, 201, 'stato');
      esigiUguale(r.dati.creata, true, 'creata');
      const posa = r.testa['set-cookie'][0];
      esigiDentro(posa, 'HttpOnly', 'cookie HttpOnly');
      esigiDentro(posa, 'SameSite=Strict', 'cookie SameSite');
    });

    await prova('POST /api/esci chiude la sessione', async () => {
      const primo = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD } });
      const b = biscottoDa(primo);
      esigiUguale((await chiama(porta, 'POST', '/api/esci', { biscotto: b })).stato, 200, 'uscita');
      esigiUguale((await chiama(porta, 'GET', '/api/contenuti', { biscotto: b })).stato, 401, 'sessione ancora viva');
    });

    await prova('POST /api/entra con la password sbagliata da 401', async () => {
      const r = await chiama(porta, 'POST', '/api/entra', { json: { password: 'quella-sbagliata-99' } });
      esigiUguale(r.stato, 401, 'stato');
      esigiDentro(r.dati.errore, 'Password errata', 'messaggio');
      esigi(!r.testa['set-cookie'], 'ha comunque posato un cookie');
    });

    await prova('POST /api/entra con la password giusta apre la sessione', async () => {
      const r = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD } });
      esigiUguale(r.stato, 200, 'stato');
      biscotto = biscottoDa(r);
      esigi(biscotto !== null, 'nessun cookie di sessione');
    });

    await prova('senza sessione le rotte protette rispondono 401', async () => {
      const rotte = [['GET', '/api/contenuti'], ['POST', '/api/pubblica'], ['GET', '/api/media'], ['GET', '/api/backup'],
        ['POST', '/api/anteprima'], ['POST', '/api/tema']];
      for (const [metodo, percorso] of rotte) {
        esigiUguale((await chiama(porta, metodo, percorso)).stato, 401, metodo + ' ' + percorso);
      }
    });

    await prova('GET /api/contenuti restituisce contenuti, schema, tema e stato', async () => {
      const r = await chiama(porta, 'GET', '/api/contenuti', { biscotto: biscotto });
      esigiUguale(r.stato, 200, 'stato');
      for (const chiave of ['versione', 'aggiornatoIl', 'testi', 'config', 'schema', 'tema', 'stato']) {
        esigi(Object.prototype.hasOwnProperty.call(r.dati, chiave), 'manca ' + chiave);
      }

      esigiUguale(r.dati.schema.gruppi.map((g) => g.id).join(','), schema.gruppi.map((g) => g.id).join(','), 'gruppi dello schema');
      esigi(r.dati.schema.gruppi[0].campi.length > 0, 'il primo gruppo e vuoto');
    });

    await prova('GET /api/contenuti porta il catalogo dei font, i preset e il tema di partenza', async () => {
      const r = await chiama(porta, 'GET', '/api/contenuti', { biscotto: biscotto });
      const t = r.dati.tema;
      esigi(t && typeof t === 'object', 'manca la chiave tema');
      for (const slot of ['titolo', 'testo', 'mono']) {
        esigi(Array.isArray(t.font[slot]) && t.font[slot].length > 0, 'catalogo vuoto per lo slot ' + slot);
        esigi(t.font[slot].every((v) => v && v.nome && Array.isArray(v.pesi)), 'voce del catalogo mal fatta in ' + slot);
      }
      esigi(Array.isArray(t.preset) && t.preset.length > 0, 'nessuna combinazione pronta');
      esigi(t.preset.every((p) => p.id && p.nome && p.tema), 'un preset senza id, nome o tema');

      esigi(t.predefinito && t.predefinito.colori && t.predefinito.font, 'manca il tema di partenza');
    });

    await prova('PUT /api/contenuti rifiuta un valore sbagliato e dice quale campo', async () => {
      const r = await chiama(porta, 'PUT', '/api/contenuti', { biscotto: biscotto, json: { testi: { 'deck.titolo': '' } } });
      esigiUguale(r.stato, 422, 'stato');
      esigi(Array.isArray(r.dati.errori), 'manca l elenco degli errori');
      esigi(r.dati.errori.some((e) => e.chiave === 'deck.titolo'), 'l errore non punta al campo giusto');
    });

    await prova('PUT /api/contenuti salva senza pubblicare', async () => {
      const prima = fs.readFileSync(P.indexHtml, 'utf8');
      const r = await chiama(porta, 'PUT', '/api/contenuti', { biscotto: biscotto, json: { testi: { 'deck.scorri': 'Giu' } } });
      esigiUguale(r.stato, 200, 'stato');
      const contenuti = JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8'));
      esigiUguale(contenuti.testi['deck.scorri'], 'Giu', 'testo salvato');
      esigiUguale(fs.readFileSync(P.indexHtml, 'utf8'), prima, 'il salvataggio ha toccato la pagina');
      esigiUguale(r.dati.stato.daPubblicare, true, 'non segnala che c e da pubblicare');
    });

    await prova('PUT /api/contenuti non cancella quello che non gli passi', async () => {
      const r = await chiama(porta, 'GET', '/api/contenuti', { biscotto: biscotto });

      const suDisco = JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8'));
      const attese = Object.keys(suDisco.testi).length;
      esigi(Object.keys(r.dati.testi).length === attese,
        'chiavi dei testi: ' + Object.keys(r.dati.testi).length + ', attese ' + attese);
      esigi('deck.titolo' in r.dati.testi, 'una chiave non passata nel PUT e sparita');
      esigiUguale(r.dati.config.social.length, 8, 'social');
    });

    await prova('POST /api/pubblica genera i tre file e risponde con backup e durata', async () => {
      const r = await chiama(porta, 'POST', '/api/pubblica', { biscotto: biscotto });
      esigiUguale(r.stato, 200, 'stato');
      esigi(typeof r.dati.backup === 'string' && r.dati.backup.length > 10, 'identificativo del backup');
      esigi(typeof r.dati.durataMs === 'number', 'durataMs');
      esigiUguale(r.dati.scritti.map((s) => s.file).join(', '), 'index.html, js/dati.js, css/tema.css', 'file scritti');
      esigiDentro(fs.readFileSync(P.indexHtml, 'utf8'), 'Giu', 'la pagina non ha il testo nuovo');
    });

    await prova('una richiesta con Origin estraneo viene rifiutata', async () => {
      const r = await chiama(porta, 'POST', '/api/pubblica', {
        biscotto: biscotto, intestazioni: { Origin: 'http://sito-cattivo.example' }
      });
      esigiUguale(r.stato, 403, 'stato');
    });

    await prova('GET /api/anteprima rende la pagina senza scrivere su disco', async () => {
      const prima = fs.statSync(P.indexHtml).mtimeMs;
      const r = await chiama(porta, 'GET', '/api/anteprima', { biscotto: biscotto });
      esigiUguale(r.stato, 200, 'stato');
      esigiDentro(r.testa['content-type'], 'text/html', 'tipo');
      esigiDentro(r.testo, '<html lang="it">', 'HTML');
      esigiUguale(fs.statSync(P.indexHtml).mtimeMs, prima, 'ha riscritto index.html');
    });

    await prova('POST /api/anteprima rende i contenuti NON salvati e non tocca niente', async () => {
      const primaHtml = fs.statSync(P.indexHtml).mtimeMs;
      const primaJson = fs.readFileSync(P.contenutiJson, 'utf8');
      const r = await chiama(porta, 'POST', '/api/anteprima', {
        biscotto: biscotto,
        json: { contenuti: { testi: { 'deck.titolo': 'Titolo mai salvato' } } }
      });
      esigiUguale(r.stato, 200, 'stato');
      esigiDentro(r.testa['content-type'], 'text/html', 'tipo');
      esigiDentro(r.testo, 'Titolo mai salvato', 'il titolo di prova non compare nell anteprima');
      esigiUguale(fs.statSync(P.indexHtml).mtimeMs, primaHtml, 'ha riscritto index.html');
      esigiUguale(fs.readFileSync(P.contenutiJson, 'utf8'), primaJson, 'ha salvato i contenuti di prova');

      esigiDentro(r.testo, 'slayer_beard', 'il resto dei contenuti e sparito');
    });

    await prova('POST /api/anteprima senza corpo utile risponde 400', async () => {
      const r = await chiama(porta, 'POST', '/api/anteprima', { biscotto: biscotto, json: { roba: 1 } });
      esigiUguale(r.stato, 400, 'stato');
      esigiDentro(r.dati.errore, 'contenuti', 'messaggio');
    });

    await prova('POST /api/tema calcola il foglio senza salvarlo', async () => {
      const prima = fs.readFileSync(P.temaCss, 'utf8');
      const r = await chiama(porta, 'POST', '/api/tema', {
        biscotto: biscotto,
        json: { tema: { colori: { fondo: '#f5f3ef', testo: '#151221' }, sfondo: { aloni: 40 } } }
      });
      esigiUguale(r.stato, 200, 'stato');
      esigi(typeof r.dati.css === 'string' && r.dati.css.indexOf(':root') !== -1, 'la risposta non contiene un foglio');
      esigiDentro(r.dati.css, '--fondo: #f5f3ef', 'il fondo chiesto');

      esigiDentro(r.dati.css, '--linea: rgba(0, 0, 0', 'polarita chiara');
      esigiUguale(fs.readFileSync(P.temaCss, 'utf8'), prima, 'ha riscritto css/tema.css');
    });

    await prova('POST /api/tema con un tema a meta risponde lo stesso', async () => {

      const r = await chiama(porta, 'POST', '/api/tema', { biscotto: biscotto, json: { tema: { colori: { fondo: '#ab' } } } });
      esigiUguale(r.stato, 200, 'stato');
      esigiDentro(r.dati.css, '--fondo: #07070c', 'il fondo di partenza');
    });

    await prova('le rotte nuove rifiutano un Origin estraneo', async () => {
      for (const [percorso, corpo] of [['/api/anteprima', { contenuti: { testi: {} } }], ['/api/tema', { tema: {} }]]) {
        const r = await chiama(porta, 'POST', percorso, {
          biscotto: biscotto, json: corpo, intestazioni: { Origin: 'http://sito-cattivo.example' }
        });
        esigiUguale(r.stato, 403, 'POST ' + percorso);
      }
    });

    await prova('sulle rotte nuove il metodo sbagliato da 405', async () => {
      esigiUguale((await chiama(porta, 'GET', '/api/tema', { biscotto: biscotto })).stato, 405, 'GET /api/tema');
      esigiUguale((await chiama(porta, 'DELETE', '/api/anteprima', { biscotto: biscotto })).stato, 405, 'DELETE /api/anteprima');
    });

    await prova('GET /api/media e GET /api/backup rispondono', async () => {
      const media = await chiama(porta, 'GET', '/api/media', { biscotto: biscotto });
      esigiUguale(media.stato, 200, 'media');
      esigi(Array.isArray(media.dati.file), 'elenco dei media');
      const copie = await chiama(porta, 'GET', '/api/backup', { biscotto: biscotto });
      esigiUguale(copie.stato, 200, 'backup');
      esigi(copie.dati.backup.length >= 2, 'attese almeno due copie');
      esigi(typeof copie.dati.backup[0].quando === 'string', 'data della copia');
    });

    await prova('POST /api/media carica un PNG e DELETE lo toglie', async () => {
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
      const confine = '----prova' + crypto.randomBytes(6).toString('hex');
      const corpo = Buffer.concat([
        Buffer.from('--' + confine + '\r\nContent-Disposition: form-data; name="file"; filename="Prova Immagine.png"\r\nContent-Type: image/png\r\n\r\n'),
        png,
        Buffer.from('\r\n--' + confine + '--\r\n')
      ]);
      const su = await chiama(porta, 'POST', '/api/media', {
        biscotto: biscotto, corpo: corpo,
        intestazioni: { 'Content-Type': 'multipart/form-data; boundary=' + confine }
      });
      esigiUguale(su.stato, 201, 'caricamento');
      esigiUguale(su.dati.file.nome, 'prova-immagine.png', 'nome normalizzato');
      esigi(fs.existsSync(path.join(P.media, 'prova-immagine.png')), 'file non salvato');

      const giu = await chiama(porta, 'DELETE', '/api/media/prova-immagine.png', { biscotto: biscotto });
      esigiUguale(giu.stato, 200, 'eliminazione');
      esigi(!fs.existsSync(path.join(P.media, 'prova-immagine.png')), 'file ancora sul disco');
    });

    await prova('un file citato nei contenuti non si puo eliminare', async () => {
      const media = require('./lib/media');
      const archivio = require('./lib/archivio');
      fs.mkdirSync(P.media, { recursive: true });
      fs.writeFileSync(path.join(P.media, 'usata.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
      const documento = archivio.leggi();
      const salvata = documento.config.immagini.avatar;
      documento.config.immagini.avatar = 'contenuti/media/usata.png';
      archivio.salva(documento);

      const r = await chiama(porta, 'DELETE', '/api/media/usata.png', { biscotto: biscotto });
      esigiUguale(r.stato, 409, 'stato');
      esigi(Array.isArray(r.dati.usatoDa) && r.dati.usatoDa.length > 0, 'non dice chi la usa');
      esigi(fs.existsSync(path.join(P.media, 'usata.png')), 'e stata cancellata lo stesso');

      documento.config.immagini.avatar = salvata;
      archivio.salva(documento);
      fs.unlinkSync(path.join(P.media, 'usata.png'));
      esigi(typeof media.elenco === 'function', 'modulo media');
    });

    await prova('POST /api/backup/<id>/ripristina rimette in piedi una copia', async () => {
      const copie = await chiama(porta, 'GET', '/api/backup', { biscotto: biscotto });
      const id = copie.dati.backup[0].id;
      const r = await chiama(porta, 'POST', '/api/backup/' + id + '/ripristina', { biscotto: biscotto });
      esigiUguale(r.stato, 200, 'stato');
      esigi(r.dati.ripristinati.length > 0, 'niente ripristinato');
      esigi(typeof r.dati.backup === 'string', 'manca la copia di sicurezza del ripristino');
    });

    await prova('il sito statico si serve, server/ e contenuti/ no', async () => {
      esigiUguale((await chiama(porta, 'GET', '/index.html')).stato, 200, 'index.html');
      esigiUguale((await chiama(porta, 'GET', '/server/dati/auth.json')).stato, 403, 'auth.json');
      esigiUguale((await chiama(porta, 'GET', '/contenuti/contenuti.json')).stato, 403, 'contenuti.json');
      esigiUguale((await chiama(porta, 'GET', '/contenuti/schema.js')).stato, 403, 'schema.js');

      esigiUguale((await chiama(porta, 'GET', '/img/..%2f..%2fserver/dati/auth.json')).stato, 403, 'risalita con barre codificate');

      esigiUguale((await chiama(porta, 'GET', '/%2e%2e/%2e%2e/windows/win.ini')).stato, 404, 'risalita con punti codificati');
    });

    await prova('un metodo non ammesso da 405 e una rotta inventata 404', async () => {
      esigiUguale((await chiama(porta, 'DELETE', '/api/contenuti', { biscotto: biscotto })).stato, 405, '405');
      esigiUguale((await chiama(porta, 'GET', '/api/inventata', { biscotto: biscotto })).stato, 404, '404');
    });
  } finally {
    await new Promise((risolvi) => server.close(risolvi));
  }
}

async function proveSondaggi(archivio) {
  apriSezione('8b. Sondaggi con il login di Twitch');

  const sondaggi = require('./lib/sondaggi');
  const { creaServer } = require('./server.js');
  const auth = require('./lib/autenticazione');
  const SBStili = require('../pannello/condivisi/stili.js');
  const server = creaServer();
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  const porta = server.address().port;
  const clientId = archivio.leggi().config.account.clientId;
  const UTENTI = {
    tokenanna0000001: { user_id: '101', login: 'anna', client_id: clientId },
    tokenbruno000002: { user_id: '202', login: 'bruno', client_id: clientId },
    tokenaltraapp003: { user_id: '303', login: 'carlo', client_id: 'unaltraapp' }
  };
  const finta = async (token) => UTENTI[token] || null;
  sondaggi.sostituisciVerifica(finta);
  sondaggi.dimentica();
  fs.rmSync(percorsi.P.sondaggi, { force: true });
  auth.azzeraTutto();
  const conToken = (token) => ({ Authorization: 'Bearer ' + token });
  const vota = (token, corpo) => chiama(porta, 'POST', '/api/sondaggio/voto', { intestazioni: token ? conToken(token) : {}, json: corpo });

  try {
    const entra = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } });
    const biscotto = biscottoDa(entra);
    const crea = (corpo) => chiama(porta, 'POST', '/api/sondaggi', { biscotto, json: corpo });

    await prova('senza sondaggi la rotta pubblica risponde vuota, e quelle di gestione vogliono la sessione', async () => {
      const r = await chiama(porta, 'GET', '/api/sondaggio');
      esigiUguale(r.stato, 200, 'stato');
      esigiUguale(r.dati.sondaggio, null, 'sondaggio');
      esigiUguale((await chiama(porta, 'GET', '/api/sondaggi')).stato, 401, 'elenco senza sessione');
      esigiUguale((await chiama(porta, 'POST', '/api/sondaggi', { json: { domanda: 'x', risposte: ['a', 'b'], durataMinuti: 5 } })).stato, 401, 'creazione senza sessione');
    });

    await prova('la creazione controlla domanda, risposte e durata', async () => {
      esigiUguale((await crea({ domanda: 'Che gioco?', risposte: ['Solo una'], durataMinuti: 60 })).stato, 422, 'una risposta sola');
      esigiUguale((await crea({ domanda: 'Che gioco?', risposte: ['Elden Ring', 'elden ring'], durataMinuti: 60 })).stato, 422, 'risposte uguali');
      esigiUguale((await crea({ domanda: 'Che gioco?', risposte: ['A', 'B'], durataMinuti: 0 })).stato, 422, 'durata zero');
      esigiUguale((await crea({ domanda: '', risposte: ['A', 'B'], durataMinuti: 5 })).stato, 422, 'domanda vuota');
    });

    let id = '';
    await prova('un sondaggio creato e subito pubblico, senza conteggi per chi non ha votato', async () => {
      const creato = await crea({ domanda: ' Che gioco  stasera? ', risposte: ['Elden Ring', 'Hollow Knight', ''], durataMinuti: 60 });
      esigiUguale(creato.stato, 201, 'stato');
      esigiUguale(creato.dati.attivo.domanda, 'Che gioco stasera?', 'domanda ripulita');
      esigiUguale(creato.dati.attivo.risposte.length, 2, 'la risposta vuota sparisce');
      id = creato.dati.attivo.id;
      esigiUguale((await crea({ domanda: 'Altro?', risposte: ['A', 'B'], durataMinuti: 5 })).stato, 409, 'un solo sondaggio aperto alla volta');
      const r = await chiama(porta, 'GET', '/api/sondaggio');
      esigiUguale(r.dati.sondaggio.id, id, 'id');
      esigiUguale(r.dati.sondaggio.conteggi, null, 'i conteggi restano nascosti');
      esigiUguale(r.testa['cache-control'], 'no-store', 'cache');
    });

    await prova('senza login, con un token finto o di un altra app non si vota', async () => {
      esigiUguale((await vota('', { id, risposta: 0 })).stato, 401, 'senza token');
      esigiUguale((await vota('tokeninventato99', { id, risposta: 0 })).stato, 401, 'token finto');
      esigiUguale((await vota('tokenaltraapp003', { id, risposta: 0 })).stato, 401, 'altra app');
      esigiUguale((await vota('corto', { id, risposta: 0 })).stato, 401, 'token storto');
    });

    await prova('un voto per account: il secondo e un 409 che riporta i risultati', async () => {
      esigiUguale((await vota('tokenanna0000001', { id, risposta: 7 })).stato, 400, 'risposta che non esiste');
      esigiUguale((await vota('tokenanna0000001', { id: 'vecchio', risposta: 0 })).stato, 410, 'sondaggio che non e quello aperto');
      const primo = await vota('tokenanna0000001', { id, risposta: 1 });
      esigiUguale(primo.stato, 200, 'primo voto');
      esigiUguale(primo.dati.sondaggio.votato, 1, 'votato');
      esigiUguale(primo.dati.sondaggio.conteggi.join(), '0,1', 'conteggi');
      const ancora = await vota('tokenanna0000001', { id, risposta: 0 });
      esigiUguale(ancora.stato, 409, 'secondo voto');
      esigiUguale(ancora.dati.sondaggio.conteggi.join(), '0,1', 'il secondo voto non conta');
      const bruno = await vota('tokenbruno000002', { id, risposta: 0 });
      esigiUguale(bruno.dati.sondaggio.conteggi.join(), '1,1', 'voto di un altro');
      const letto = await chiama(porta, 'GET', '/api/sondaggio', { intestazioni: conToken('tokenanna0000001') });
      esigiUguale(letto.dati.sondaggio.votato, 1, 'chi ha votato lo ritrova');
      esigiUguale(letto.dati.riconosciuto, true, 'riconosciuto');
      const salvato = JSON.parse(fs.readFileSync(percorsi.P.sondaggi, 'utf8'));
      esigiUguale(Object.keys(salvato.attivo.voti).sort().join(), '101,202', 'i voti stanno su disco');
    });

    await prova('un voto scritto da un altra copia dell app si vede subito', async () => {
      const suDisco = JSON.parse(fs.readFileSync(percorsi.P.sondaggi, 'utf8'));
      suDisco.attivo.voti['909'] = 0;
      fs.writeFileSync(percorsi.P.sondaggi, JSON.stringify(suDisco, null, 2) + '\n');
      const futuro = new Date(Date.now() + 5000);
      fs.utimesSync(percorsi.P.sondaggi, futuro, futuro);
      const admin = await chiama(porta, 'GET', '/api/sondaggi', { biscotto });
      esigiUguale(admin.dati.attivo.totale, 3, 'il pannello conta anche il voto dell altra copia');
      const doppio = await vota('tokenanna0000001', { id, risposta: 0 });
      esigiUguale(doppio.stato, 409, 'chi ha votato altrove non rivota');
      const nuovo = { tokencarla000004: { user_id: '404', login: 'carla', client_id: clientId } };
      sondaggi.sostituisciVerifica(async (token) => UTENTI[token] || nuovo[token] || null);
      const carla = await vota('tokencarla000004', { id, risposta: 1 });
      esigiUguale(carla.dati.sondaggio.conteggi.join(), '2,2', 'il voto nuovo non cancella quello scritto altrove');
      sondaggi.sostituisciVerifica(finta);
    });

    await prova('i voti sopravvivono a un riavvio e il sondaggio scaduto passa in archivio da solo', async () => {
      sondaggi.dimentica();
      const dopo = Date.now() + 61 * 60000;
      const vista = sondaggi.vistaPubblica(null, dopo);
      esigiUguale(vista.sondaggio.chiuso, true, 'chiuso');
      esigiUguale(vista.sondaggio.conteggi.join(), '2,2', 'risultati per tutti');
      esigiErrore(() => sondaggi.vota('404', { id, risposta: 0 }, dopo), 'chiuso', 'voto dopo la scadenza');
      const admin = sondaggi.vistaAdmin(dopo);
      esigiUguale(admin.attivo, null, 'niente di aperto');
      esigiUguale(admin.archivio.length, 1, 'in archivio');
      esigi(!('voti' in admin.archivio[0]), 'in archivio non restano gli id di chi ha votato');
    });

    await prova('chiudi ora ed elimina dal pannello', async () => {
      const creato = await crea({ domanda: 'Pizza o sushi?', risposte: ['Pizza', 'Sushi'], durataMinuti: 5 });
      esigiUguale(creato.stato, 201, 'creato');
      const chiuso = await chiama(porta, 'POST', '/api/sondaggi/chiudi', { biscotto });
      esigiUguale(chiuso.stato, 200, 'chiuso');
      esigiUguale(chiuso.dati.attivo, null, 'niente di aperto');
      const pubblico = await chiama(porta, 'GET', '/api/sondaggio');
      esigiUguale(pubblico.dati.sondaggio.domanda, 'Pizza o sushi?', 'il sito mostra l ultimo chiuso');
      esigiUguale(pubblico.dati.sondaggio.chiuso, true, 'chiuso');
      esigiUguale((await chiama(porta, 'DELETE', '/api/sondaggi/' + creato.dati.attivo.id, { biscotto })).stato, 200, 'eliminato');
      esigiUguale((await chiama(porta, 'DELETE', '/api/sondaggi/nonesiste', { biscotto })).stato, 404, 'id sconosciuto');
      esigiUguale((await chiama(porta, 'POST', '/api/sondaggi/chiudi', { biscotto })).stato, 404, 'niente da chiudere');
    });

    await prova('un file dei voti rotto non ferma il sito: si mette da parte', async () => {
      fs.writeFileSync(percorsi.P.sondaggi, '{rotto');
      sondaggi.dimentica();
      const errore = console.error;
      console.error = () => {};
      try {
        const r = await chiama(porta, 'GET', '/api/sondaggio');
        esigiUguale(r.stato, 200, 'stato');
        esigiUguale(r.dati.sondaggio, null, 'vuoto');
      } finally { console.error = errore; }
      const cartella = path.dirname(percorsi.P.sondaggi);
      const messi = fs.readdirSync(cartella).filter((n) => n.startsWith(path.basename(percorsi.P.sondaggi) + '.rotto-'));
      esigiUguale(messi.length, 1, 'copia del file rotto');
      messi.forEach((n) => fs.rmSync(path.join(cartella, n), { force: true }));
    });

    await prova('una sezione nuova si mette dopo quella che la precede, non in fondo', async () => {
      const vecchie = ['regia', 'diretta', 'settimana', 'chi', 'supporto', 'saluti'].map((voce) => ({ id: voce, attiva: voce !== 'chi' }));
      const pulite = SBStili.pulisciSezioni(vecchie);

      esigiUguale(pulite.map((v) => v.id).join(','), 'regia,diretta,sondaggio,settimana,chi,supporto,saluti,sponsor', 'ordine');
      esigiUguale(pulite.find((v) => v.id === 'chi').attiva, false, 'le scelte di prima restano');
    });
  } finally {
    sondaggi.sostituisciVerifica(null);
    sondaggi.dimentica();
    fs.rmSync(percorsi.P.sondaggi, { force: true });
    auth.azzeraTutto();
    await new Promise((risolvi) => server.close(risolvi));
  }
}

async function proveMeteora(costruisci, archivio) {
  apriSezione('8c. Meteora col polletto');

  const { creaServer } = require('./server.js');
  const auth = require('./lib/autenticazione');
  const server = creaServer();
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  const porta = server.address().port;
  fs.rmSync(percorsi.P.meteora, { force: true });
  auth.azzeraTutto();

  try {
    await prova('la rotta pubblica risponde vuota finche nessuno la lancia, e il lancio vuole la sessione', async () => {
      const r = await chiama(porta, 'GET', '/api/meteora');
      esigiUguale(r.stato, 200, 'stato');
      esigiUguale(r.dati.id, '', 'id');
      esigiUguale(r.testa['cache-control'], 'no-store', 'cache');
      esigiUguale((await chiama(porta, 'POST', '/api/meteora/lancia')).stato, 401, 'lancio senza sessione');
      esigiUguale((await chiama(porta, 'POST', '/api/meteora')).stato, 405, 'la rotta pubblica non si scrive');
    });

    await prova('con la sessione la meteora parte per tutti, e due lanci ravvicinati valgono uno', async () => {
      const entra = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } });
      const biscotto = biscottoDa(entra);
      const primo = await chiama(porta, 'POST', '/api/meteora/lancia', { biscotto });
      esigiUguale(primo.stato, 200, 'stato');
      esigi(/^[0-9a-f]{12}$/.test(primo.dati.id), 'id');
      const pubblico = await chiama(porta, 'GET', '/api/meteora');
      esigiUguale(pubblico.dati.id, primo.dati.id, 'la vede chi visita');
      const secondo = await chiama(porta, 'POST', '/api/meteora/lancia', { biscotto });
      esigiUguale(secondo.dati.id, primo.dati.id, 'stesso lancio');
      esigiUguale(secondo.dati.gia, true, 'segnalato come gia partito');
    });

    await prova('i dati della home portano timer spento, minuti in ordine, icone e suoni dalle cartelle', async () => {
      const contenuti = archivio.leggi();
      contenuti.config.meteora = { ogniMin: 20, ogniMax: 5 };
      const dati = costruisci.oggettoDati(contenuti, {});
      esigiUguale(dati.meteora.timer, false, 'timer spento se non acceso');
      esigiUguale(dati.meteora.ogniMin, 5, 'minimo');
      esigiUguale(dati.meteora.ogniMax, 20, 'massimo');
      for (const src of dati.meteora.icone) { esigi(/^icone_slayer\/[^/]+$/.test(src), 'icona ' + src); }
      for (const src of dati.meteora.suoni) { esigi(/^suoni_meteora\/[^/]+\.(mp3|wav|ogg|m4a)$/i.test(src), 'suono ' + src); }
      esigiUguale(dati.chi.icone.length, dati.meteora.icone.length, 'stesse icone per il ritratto');
    });
  } finally {
    fs.rmSync(percorsi.P.meteora, { force: true });
    auth.azzeraTutto();
    await new Promise((risolvi) => server.close(risolvi));
  }
}

async function proveTwitch(costruisci, archivio) {
  apriSezione('9. Collegamento con Twitch (server/lib/twitch.js)');

  const scriviCredenziali = (dati) => {
    fs.mkdirSync(path.dirname(P.chiavi), { recursive: true });
    const testo = typeof dati === 'string' ? dati : chiavi.componi({ twitch: dati });
    fs.writeFileSync(P.chiavi, testo);
  };
  const togliCredenziali = () => { try { fs.unlinkSync(P.chiavi); } catch (e) {} };
  const titoloSalvato = () => archivio.leggi().config.ultimaDiretta;

  await prova('senza il file delle credenziali il collegamento e semplicemente spento', async () => {
    togliCredenziali();
    esigiUguale(twitch.configurato(), false, 'configurato()');
    esigiUguale(twitch.credenziali(), null, 'credenziali()');

    const prima = titoloSalvato();
    const esito = await twitch.aggiornaUltimaDiretta();
    esigiUguale(esito.stato, 'spento', 'stato');
    esigiUguale(titoloSalvato(), prima, 'ha toccato ultimaDiretta e non doveva');
  });

  await prova('mezze credenziali valgono come nessuna credenziale', () => {
    for (const mezze of [{ clientId: 'abcdef1234567890abcdef' }, { clientSecret: 'unsegretolungoabbastanza' },
      { clientId: '', clientSecret: '' }, { clientId: '   ', clientSecret: '   ' }, {}]) {
      scriviCredenziali(mezze);
      esigiUguale(twitch.configurato(), false, 'configurato() con ' + JSON.stringify(mezze));
    }
    togliCredenziali();
  });

  await prova('le due chiavi arrivano ripulite dagli spazi', () => {
    scriviCredenziali({ clientId: '  abcdef1234567890abcdef  ', clientSecret: '  unsegretolungoabbastanza  ' });
    const chiavi = twitch.credenziali();
    esigiUguale(chiavi.clientId, 'abcdef1234567890abcdef', 'clientId');
    esigiUguale(chiavi.clientSecret, 'unsegretolungoabbastanza', 'clientSecret');
    togliCredenziali();
  });

  await prova('un file rotto viene detto, non ignorato', async () => {

    scriviCredenziali('module.exports = { questo non e javascript');
    esigiErrore(() => twitch.credenziali(), 'non si legge', 'credenziali() su file rotto');

    esigiUguale(twitch.configurato(), false, 'configurato() su file rotto');

    const prima = titoloSalvato();
    const esito = await twitch.aggiornaUltimaDiretta();
    esigiUguale(esito.stato, 'fallito', 'stato');
    esigiUguale(titoloSalvato(), prima, 'ha toccato ultimaDiretta e non doveva');
    togliCredenziali();
  });

  await prova('un file che esporta la cosa sbagliata viene detto', () => {

    for (const storto of ['module.exports = [1, 2, 3];', 'module.exports = 42;', 'module.exports = null;']) {
      scriviCredenziali(storto);
      esigiErrore(() => chiavi.leggi(), 'non esporta un oggetto', 'leggi() con ' + storto);
    }

    scriviCredenziali('module.exports = {};');
    esigiUguale(chiavi.leggi().twitch.clientId, '', 'oggetto vuoto: nessun client id');
    esigiUguale(twitch.credenziali(), null, 'oggetto vuoto: nessuna credenziale');
    togliCredenziali();
  });

  await prova('chi cambia le chiavi non deve riavviare il server', () => {

    scriviCredenziali({ clientId: 'primoclientid1234567890abc', clientSecret: 'unsegretolungoabbastanza' });
    esigiUguale(chiavi.clientId(), 'primoclientid1234567890abc', 'prima lettura');
    scriviCredenziali({ clientId: 'secondoclientid234567890ab', clientSecret: 'unsegretolungoabbastanza' });
    esigiUguale(chiavi.clientId(), 'secondoclientid234567890ab', 'dopo la modifica, senza riavviare');
    togliCredenziali();
  });

  await prova('il Client ID va da chiavi.js fino dentro i contenuti', () => {

    const documento = archivio.leggi();
    const originale = documento.config.account.clientId;
    try {
      scriviCredenziali({ clientId: 'dalfilechiavi1234567890abc', clientSecret: 'unsegretolungoabbastanza' });
      esigiUguale(chiavi.sincronizzaClientId().stato, 'copiato', 'primo giro');
      esigiUguale(archivio.leggi().config.account.clientId, 'dalfilechiavi1234567890abc', 'valore nei contenuti');

      esigiUguale(chiavi.sincronizzaClientId().stato, 'invariato', 'secondo giro');

      togliCredenziali();
      esigiUguale(chiavi.sincronizzaClientId().stato, 'spento', 'senza file');
      esigiUguale(archivio.leggi().config.account.clientId, 'dalfilechiavi1234567890abc', 'ha svuotato il campo');
    } finally {
      const rimesso = archivio.leggi();
      rimesso.config.account.clientId = originale;
      archivio.salva(rimesso);
      togliCredenziali();
    }
  });

  await prova('senza ID del canale non parte nessuna richiesta', async () => {
    scriviCredenziali({ clientId: 'abcdef1234567890abcdef', clientSecret: 'unsegretolungoabbastanza' });
    const documento = archivio.leggi();
    const idVero = documento.config.twitch.idUtente;
    const titoloVero = documento.config.ultimaDiretta;

    documento.config.twitch.idUtente = '';
    archivio.salva(documento);
    try {
      const esito = await twitch.aggiornaUltimaDiretta();
      esigiUguale(esito.stato, 'senzaCanale', 'stato');
      esigiUguale(titoloSalvato(), titoloVero, 'ha toccato ultimaDiretta e non doveva');
    } finally {
      const rimesso = archivio.leggi();
      rimesso.config.twitch.idUtente = idVero;
      archivio.salva(rimesso);
      togliCredenziali();
    }
  });

  await prova('ogni stato ha la sua riga, e racconta() non lancia mai', () => {
    for (const stato of ['spento', 'senzaCanale', 'aggiornato', 'invariato', 'vuoto', 'fallito']) {
      const riga = twitch.racconta({ stato: stato, titolo: 'Un titolo', motivo: 'un motivo', precedente: '' });
      esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
    }

    for (const storto of [null, undefined, {}, { stato: 'inventato' }]) {
      esigiUguale(twitch.racconta(storto), '', 'racconta(' + JSON.stringify(storto) + ')');
    }
  });

  await prova('il totale dei follower si legge dalla risposta, e null e «non lo so»', () => {

    esigiUguale(twitch.totaleFollower({ total: 3619, data: [], pagination: {} }), 3619, 'totale intero');
    esigiUguale(twitch.totaleFollower({ total: '4021', data: [] }), 4021, 'totale come testo');
    esigiUguale(twitch.totaleFollower({ total: 0, data: [] }), 0, 'zero e zero');
    for (const storto of [null, undefined, {}, { data: [] }, { total: 'tanti' }, { total: -5 }, { total: null }]) {
      esigiUguale(twitch.totaleFollower(storto), null, 'totaleFollower(' + JSON.stringify(storto) + ')');
    }
  });

  await prova('i follower seguono le stesse regole di «Ultima diretta»: mai un lancio, mai un numero perso', async () => {
    const followerSalvati = () => archivio.leggi().config.dati.follower;
    const prima = followerSalvati();
    esigi(typeof prima === 'number' && prima > 0, 'nei contenuti di prova manca un numero di follower');

    togliCredenziali();
    let esito = await twitch.aggiornaFollower();
    esigiUguale(esito.stato, 'spento', 'senza credenziali');
    esigiUguale(followerSalvati(), prima, 'ha toccato i follower senza credenziali');

    scriviCredenziali('module.exports = { questo non e javascript');
    esito = await twitch.aggiornaFollower();
    esigiUguale(esito.stato, 'fallito', 'file rotto');
    esigiUguale(followerSalvati(), prima, 'ha toccato i follower con il file rotto');
    togliCredenziali();

    scriviCredenziali({ clientId: 'abcdef1234567890abcdef', clientSecret: 'unsegretolungoabbastanza' });
    const documento = archivio.leggi();
    const idVero = documento.config.twitch.idUtente;
    documento.config.twitch.idUtente = '';
    archivio.salva(documento);
    try {
      esito = await twitch.aggiornaFollower();
      esigiUguale(esito.stato, 'senzaCanale', 'senza canale');
      esigiUguale(followerSalvati(), prima, 'ha toccato i follower senza canale');
    } finally {
      const rimesso = archivio.leggi();
      rimesso.config.twitch.idUtente = idVero;
      archivio.salva(rimesso);
      togliCredenziali();
    }
  });

  await prova('ogni stato dei follower ha la sua riga, e raccontaFollower() non lancia mai', () => {
    for (const stato of ['spento', 'senzaCanale', 'aggiornato', 'invariato', 'vuoto', 'fallito']) {
      const riga = twitch.raccontaFollower({ stato: stato, totale: 3700, precedente: 3619, motivo: 'un motivo' });
      esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
    }
    esigiDentro(twitch.raccontaFollower({ stato: 'aggiornato', totale: 3700, precedente: 3619 }), '3700', 'il totale nuovo nella riga');
    for (const storto of [null, undefined, {}, { stato: 'inventato' }]) {
      esigiUguale(twitch.raccontaFollower(storto), '', 'raccontaFollower(' + JSON.stringify(storto) + ')');
    }
  });

  await prova('la categoria in onda non lancia mai e non tocca contenuti.json', async () => {

    const primaDeiContenuti = JSON.stringify(archivio.leggi());
    togliCredenziali();
    esigiUguale((await twitch.aggiornaCategoria()).stato, 'spento', 'senza credenziali');
    scriviCredenziali('module.exports = { questo non e javascript');
    esigiUguale((await twitch.aggiornaCategoria()).stato, 'fallito', 'file rotto');
    togliCredenziali();
    esigiUguale(JSON.stringify(archivio.leggi()), primaDeiContenuti, 'ha toccato i contenuti');

    for (const stato of ['spento', 'senzaCanale', 'aggiornato', 'invariato', 'spenta', 'fallito']) {
      const riga = twitch.raccontaCategoria({ stato: stato, categoria: 'Elden Ring', precedente: 'Quiz', motivo: 'un motivo' });
      esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
    }
    for (const storto of [null, undefined, {}, { stato: 'inventato' }]) {
      esigiUguale(twitch.raccontaCategoria(storto), '', 'raccontaCategoria(' + JSON.stringify(storto) + ')');
    }

    try { fs.unlinkSync(P.direttaTwitch); } catch (e) {}
    esigiUguale(twitch.direttaSalvata(), null, 'senza file');
    fs.mkdirSync(path.dirname(P.direttaTwitch), { recursive: true });
    fs.writeFileSync(P.direttaTwitch, '{ non e json');
    esigiUguale(twitch.direttaSalvata(), null, 'file storto');
    twitch.salvaDiretta({ categoria: 'Elden Ring', inOnda: true, letteIl: '2026-09-20T10:00:00.000Z' });
    esigiUguale(JSON.stringify(twitch.direttaSalvata()),
      JSON.stringify({ categoria: 'Elden Ring', inOnda: true, letteIl: '2026-09-20T10:00:00.000Z' }), 'lettura salvata');
    try { fs.unlinkSync(P.direttaTwitch); } catch (e) {}
  });

  await prova('le frasi del pollo in «Chi sono» portano solo le emote che usano, con un indirizzo di Twitch', () => {

    const elenco = twitch.elencoEmote({ data: [
      { id: '123', name: 'slayer156Love', format: ['static', 'animated'] },
      { id: '25', name: 'Kappa', format: ['static'] },
      { id: '../x', name: 'Cattiva', format: ['static'] },
      { id: '9', name: 'NonUsata', format: ['static'] }
    ] });
    esigiUguale(JSON.stringify(Object.keys(elenco)), JSON.stringify(['slayer156Love', 'Kappa', 'NonUsata']), 'emote tenute');

    let primaDelFile = null;
    try { primaDelFile = fs.readFileSync(P.emoteTwitch, 'utf8'); } catch (e) {}
    try {
      fs.mkdirSync(path.dirname(P.emoteTwitch), { recursive: true });
      fs.writeFileSync(P.emoteTwitch, JSON.stringify({ emote: Object.assign({ Cattiva: { id: '../x' } }, elenco) }));

      const documento = archivio.leggi();
      documento.config.chi = { frasi: ['Ti voglio bene slayer156Love', 'Kappa Kappa', 'Cattiva e <b>basta</b>', '  '] };
      const chi = costruisci.oggettoDati(documento, {}).chi;
      esigiUguale(chi.frasi.length, 3, 'la frase vuota si toglie');
      esigiUguale(JSON.stringify(chi.emote), JSON.stringify({
        slayer156Love: 'https://static-cdn.jtvnw.net/emoticons/v2/123/animated/dark/2.0',
        Kappa: 'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0'
      }), 'emote in pagina');

      fs.unlinkSync(P.emoteTwitch);
      esigiUguale(JSON.stringify(costruisci.oggettoDati(documento, {}).chi.emote), '{}', 'senza file');
    } finally {
      if (primaDelFile !== null) { fs.writeFileSync(P.emoteTwitch, primaDelFile); }
      else { try { fs.unlinkSync(P.emoteTwitch); } catch (e) {} }
    }

    for (const stato of ['spento', 'senzaCanale', 'aggiornato', 'fallito']) {
      const riga = twitch.raccontaEmote({ stato: stato, delCanale: 5, globali: 100, motivo: 'un motivo' });
      esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
    }
    esigiUguale(twitch.raccontaEmote({ stato: 'spento', motivo: 'senzaFrasi' }), '', 'senza frasi si tace');
  });

  await prova('le GIF del pollo in «Chi sono»: predefinite, solo locali, con le scritte di riserva', () => {
    const documento = archivio.leggi();
    documento.config.chi = { frasi: [] };
    const base = costruisci.oggettoDati(documento, {}).chi;
    esigiUguale(base.gifOgni, 5, 'ogni quanti clic, predefinito');
    esigi(base.raffica.gif.length >= 1 && base.insistenza.gif.length >= 1 && base.scroll.gif.length >= 1, 'senza elenchi valgono le GIF incluse');
    for (const voce of base.raffica.gif.concat(base.insistenza.gif, base.scroll.gif)) {
      esigi(fs.existsSync(path.join(RADICE_VERA, voce.src)), 'la GIF inclusa non esiste: ' + voce.src);
    }

    documento.config.chi = {
      frasi: [],
      gifOgni: 0,
      gifRaffica: [
        { immagine: 'contenuti/media/mia.gif', scritta: '  HAI ROTTO  ' },
        { immagine: 'https://media.giphy.com/media/x/giphy.gif', scritta: 'esterna' },
        { immagine: 'img/../server/dati/auth.json', scritta: 'furba' },
        { immagine: '/img/pollo-gif/raffica-ufficio.gif', scritta: '' }
      ],
      scritteRaffica: ['VUOI ROMPERE IL MOUSE?', ' '],
      gifInsistenza: []
    };
    const chi = costruisci.oggettoDati(documento, {}).chi;
    esigiUguale(chi.gifOgni, 0, 'zero spegne le GIF a tempo');
    esigiUguale(JSON.stringify(chi.raffica.gif), JSON.stringify([
      { src: 'contenuti/media/mia.gif', scritta: 'HAI ROTTO' },
      { src: 'img/pollo-gif/raffica-ufficio.gif', scritta: '' }
    ]), 'restano solo le GIF del sito');
    esigiUguale(JSON.stringify(chi.raffica.scritte), JSON.stringify(['VUOI ROMPERE IL MOUSE?']), 'scritte ripulite');
    esigiUguale(chi.insistenza.gif.length, 0, 'un elenco svuotato resta vuoto');
  });

  await prova('il caricamento accetta le GIF vere e rifiuta quelle finte', () => {
    const media = require('./lib/media');
    esigiUguale(media.normalizzaNome('Pollo Arrabbiato.GIF').nome, 'pollo-arrabbiato.gif', 'nome della gif');
    const confine = 'provaconfine';
    const modulo = (nome, dati) => Buffer.concat([
      Buffer.from('--' + confine + '\r\nContent-Disposition: form-data; name="file"; filename="' + nome + '"\r\nContent-Type: image/gif\r\n\r\n'),
      dati,
      Buffer.from('\r\n--' + confine + '--\r\n')
    ]);
    const tipo = 'multipart/form-data; boundary=' + confine;
    let rifiuto = null;
    try { media.salva(modulo('finta.gif', Buffer.from('non sono una gif, giuro')), tipo); } catch (e) { rifiuto = e; }
    esigi(rifiuto && /GIF/.test(rifiuto.message), 'una gif finta deve essere rifiutata');

    const vera = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]);
    const salvata = media.salva(modulo('autotest-pollo.gif', vera), tipo);
    try {
      esigiUguale(salvata.tipo, 'image/gif', 'tipo della gif');
    } finally {
      try { fs.unlinkSync(path.join(P.media, salvata.nome)); } catch (e) {}
    }
  });

  await prova('il numero dei follower stampato in pagina e quello dei contenuti, con il punto delle migliaia', () => {

    const documento = archivio.leggi();
    const originale = documento.config.dati.follower;
    try {
      documento.config.dati.follower = 1234567;
      archivio.salva(documento);
      const reso = costruisci.rendi(archivio.leggi());

      const trovati = reso.html.match(/data-follower>([^<]*)</g) || [];
      esigiUguale(trovati.length, 2, 'nodi data-follower in pagina');
      esigi(trovati.every((x) => x === 'data-follower>1.234.567<'), 'numero stampato: ' + trovati.join(' | '));
      esigi(reso.html.indexOf('deck.dato1Valore') === -1 && reso.html.indexOf('chi.dato1Valore') === -1, 'il valore scritto a mano e ancora in pagina');
    } finally {
      const rimesso = archivio.leggi();
      rimesso.config.dati.follower = originale;
      archivio.salva(rimesso);
    }
  });

  await prova('i social mostrano «Iscritti N / Goal M» accanto ai contatori, e il goal da solo no', () => {
    const documento = archivio.leggi();
    const prima = JSON.parse(JSON.stringify(documento.config));
    try {
      documento.config.dati.follower = 3670;
      const voci = documento.config.social;
      const tw = voci.find((v) => v.icona === 'twitch');
      tw.contatore = 'twitch'; tw.contatoreEtichetta = 'Iscritti'; tw.goal = 5700;
      const yt = voci.find((v) => v.icona === 'youtube');
      yt.url = 'https://www.youtube.com/@slayer_beard'; yt.contatore = 'youtube'; yt.goal = 1000;
      const ig = voci.find((v) => v.icona === 'instagram');
      ig.contatore = 'nessuno'; ig.goal = 999;
      documento.config.iscrittiYoutube = [{ url: 'https://youtube.com/@Slayer_Beard/', iscritti: 812, letteIl: '2026-09-22T10:00:00.000Z' }];
      archivio.salva(documento);

      const html = costruisci.rendi(archivio.leggi()).html;
      const inizio = html.indexOf('id="social"');
      const saluti = html.slice(inizio, html.indexOf('</ul>', inizio));
      esigi(/Iscritti<\/span> <b class="social__conta-numero" data-follower>3\.670<\/b>/.test(saluti), 'numero di Twitch');
      esigi(/Goal<\/span> <b class="social__conta-numero">5\.700<\/b>/.test(saluti), 'goal di Twitch');
      esigi(/>812<\/b>/.test(saluti) && /1\.000<\/b>/.test(saluti), 'iscritti YouTube trovati col link scritto diverso');
      esigi(saluti.indexOf('999') === -1, 'un goal senza contatore non si stampa');
    } finally {
      const rimesso = archivio.leggi();
      rimesso.config = prima;
      archivio.salva(rimesso);
    }
  });

  await prova('Discord sta fra i social, con la sua icona, nel binario e in «Dove mi trovi»', () => {
    const documento = archivio.leggi();
    const discord = documento.config.social.find((v) => v.icona === 'discord');
    esigi(discord !== undefined, 'la voce Discord non c e nei contenuti');
    discord.url = 'https://discord.gg/prova';
    const html = costruisci.anteprimaDi(documento);
    const icona = '<circle cx="9" cy="12" r="1"/>';
    const daBinario = html.indexOf('binario__social');
    const binario = html.slice(daBinario, html.indexOf('</aside>', daBinario));
    esigiDentro(binario, 'href="https://discord.gg/prova"', 'link nel binario');
    esigiDentro(binario, 'aria-label="Discord"', 'nome nel binario');
    esigiDentro(binario, icona, 'icona nel binario');
    const daSaluti = html.indexOf('id="social"');
    const saluti = html.slice(daSaluti, html.indexOf('</ul>', daSaluti));
    esigiDentro(saluti, 'href="https://discord.gg/prova"', 'link nei saluti');
    esigiDentro(saluti, '<span class="social__nome">Discord</span>', 'nome nei saluti');
    esigiDentro(saluti, icona, 'icona nei saluti');
    discord.url = '';
    esigi(costruisci.anteprimaDi(documento).indexOf('discord.gg') === -1, 'senza link la voce Discord e finita in pagina');
  });

  await prova('la wishlist sta in «Supporto», non piu in «Dove mi trovi»', () => {
    const documento = archivio.leggi();
    esigi(!documento.config.social.some((v) => v.icona === 'amazon-wishlist'), 'la wishlist e ancora fra i profili social');
    const riga = documento.config.supporto.find((v) => v.icona === 'amazon-wishlist');
    esigi(riga !== undefined && String(riga.url).trim() !== '', 'la riga della wishlist non c e, o e senza link');
    const icone = schema.campo('config.supporto').campi.find((c) => c.chiave === 'icona').opzioni;
    esigi(icone.indexOf('amazon-wishlist') !== -1, 'l icona non e ammessa nel listino');
    const html = costruisci.anteprimaDi(documento);
    const supporto = html.slice(html.indexOf('id="supporto"'), html.indexOf('id="saluti"'));
    esigiDentro(supporto, '<h3 class="listino__titolo">' + riga.titolo + '</h3>', 'la riga non e nel listino');
    esigiDentro(supporto, 'href="' + riga.url + '"', 'il link non e nel listino');
    const fondo = html.slice(html.indexOf('id="saluti"'));
    esigi(fondo.indexOf(riga.url) === -1, 'il link della wishlist e ancora in «Dove mi trovi»');
  });

  await prova('la sezione «Diretta» non ha piu il paragrafo introduttivo', () => {
    const documento = archivio.leggi();
    esigi(!('diretta.testo' in documento.testi), 'il testo e ancora nei contenuti');
    esigi(!schema.campo('diretta.testo'), 'il campo e ancora nello schema');
    const html = costruisci.anteprimaDi(documento);
    const diretta = html.slice(html.indexOf('id="diretta"'), html.indexOf('id="settimana"'));
    esigi(diretta.indexOf('diretta.testo') === -1, 'il paragrafo e ancora in pagina');
    esigi(diretta.indexOf('sezione__testo') === -1, 'un paragrafo introduttivo e ancora in pagina');
    esigiDentro(diretta, 'data-sb-testo="diretta.titolo"', 'il titolo della sezione manca');
  });

  await prova('youtube: dal link al canale, e senza chiave non chiede niente', async () => {
    esigiUguale(JSON.stringify(youtube.canaleDaUrl('https://www.youtube.com/@slayer_beard/videos')), '{"parametro":"forHandle","valore":"@slayer_beard"}', '@handle');
    esigiUguale(youtube.canaleDaUrl('https://youtube.com/channel/UC1234567890abcdef').parametro, 'id', 'channel/UC');
    esigiUguale(youtube.canaleDaUrl('https://www.youtube.com/watch?v=abc'), null, 'un video non e un canale');
    esigiUguale(youtube.canaleDaUrl('https://www.twitch.tv/slayer_beard'), null, 'un altro sito');
    esigiUguale(youtube.totaleIscritti({ items: [{ statistics: { subscriberCount: '3670', hiddenSubscriberCount: false } }] }), 3670, 'totale');
    esigiUguale(youtube.totaleIscritti({ items: [{ statistics: { hiddenSubscriberCount: true } }] }), null, 'iscritti nascosti');
    esigiUguale(youtube.totaleIscritti({ items: [] }), null, 'canale inesistente');

    const documento = archivio.leggi();
    const prima = JSON.parse(JSON.stringify(documento.config.social));
    const ambiente = process.env.SB_YOUTUBE_CHIAVE;
    try {
      delete process.env.SB_YOUTUBE_CHIAVE;
      documento.config.social.forEach((v) => { v.contatore = 'nessuno'; });
      archivio.salva(documento);
      esigiUguale((await youtube.aggiornaIscritti()).stato, 'nessuno', 'nessuna voce da contare');
      const yt = documento.config.social.find((v) => v.icona === 'youtube');
      yt.contatore = 'youtube'; yt.url = 'https://www.youtube.com/@slayer_beard';
      archivio.salva(documento);
      if (!chiavi.youtubeChiave()) { esigiUguale((await youtube.aggiornaIscritti()).stato, 'spento', 'senza chiave'); }
    } finally {
      if (ambiente !== undefined) { process.env.SB_YOUTUBE_CHIAVE = ambiente; }
      const rimesso = archivio.leggi();
      rimesso.config.social = prima;
      archivio.salva(rimesso);
    }
  });

  await prova('un contenuti.json di prima dei contatori riceve i campi nuovi, col contatore dall icona', () => {
    const vecchio = JSON.parse(JSON.stringify(archivio.leggi()));
    for (const v of vecchio.config.social) { delete v.contatore; delete v.contatoreEtichetta; delete v.goal; }
    delete vecchio.testi['saluti.goalEtichetta'];
    const aggiunte = schema.completa(vecchio);
    esigi(aggiunte.indexOf('saluti.goalEtichetta') !== -1, 'etichetta del goal');
    esigiUguale(vecchio.testi['saluti.goalEtichetta'], 'Goal', 'valore di partenza');
    for (const v of vecchio.config.social) {
      const atteso = v.icona === 'twitch' || v.icona === 'youtube' ? v.icona : 'nessuno';
      esigiUguale(v.contatore, atteso, 'contatore di ' + v.chiave);
      esigiUguale(v.goal, 0, 'goal di ' + v.chiave);
    }
    esigiUguale(JSON.stringify(convalida.convalida(vecchio)), '[]', 'il documento completato passa la convalida');
    esigiUguale(schema.verificaCopertura(vecchio).length, 0, 'e la copertura');
  });

  await prova('l aggiornamento automatico non parte senza collegamento', () => {

    togliCredenziali();
    const { aggiornamentoAutomatico } = require('./server.js');
    esigiUguale(aggiornamentoAutomatico({ guarda: false }), null, 'ha avviato un timer senza credenziali');
  });

  await prova('il client secret non finisce mai nei file generati', () => {

    const spia = 'segretochenondevecomparirequi0000';
    scriviCredenziali({ clientId: 'abcdef1234567890abcdef', clientSecret: spia });
    try {
      costruisci.genera();
      for (const file of [P.indexHtml, P.datiJs, P.temaCss]) {
        esigi(fs.readFileSync(file, 'utf8').indexOf(spia) === -1, 'il secret e finito dentro ' + path.basename(file));
      }
      esigi(fs.readFileSync(P.contenutiJson, 'utf8').indexOf(spia) === -1, 'il secret e finito dentro contenuti.json');
    } finally {
      togliCredenziali();
    }
  });

  await prova('il file delle credenziali e escluso dal controllo di versione', () => {

    const ignorati = fs.readFileSync(path.join(RADICE_VERA, '.gitignore'), 'utf8');
    esigiDentro(ignorati, 'server/dati/chiavi.js', 'il .gitignore non esclude il file delle chiavi');
    esigiDentro(ignorati, 'server/dati/auth.json', 'il .gitignore non esclude piu la password del pannello');

    const modello = path.join(RADICE_VERA, 'server', 'modelli', 'chiavi.esempio.js');
    esigi(fs.existsSync(modello), 'manca server/modelli/chiavi.esempio.js');
    const testoModello = fs.readFileSync(modello, 'utf8');
    esigiDentro(testoModello, 'clientId', 'il modello non nomina clientId');
    esigiDentro(testoModello, 'clientSecret', 'il modello non nomina clientSecret');

    const caricato = require(modello);
    esigiUguale(caricato.twitch.clientId, '', 'il modello ha un Client ID dentro');
    esigiUguale(caricato.twitch.clientSecret, '', 'il modello ha un secret dentro');
  });

  const scriviAccesso = (testo) => {
    fs.mkdirSync(path.dirname(P.accessoTwitch), { recursive: true });
    fs.writeFileSync(P.accessoTwitch, testo);
  };
  const togliAccesso = () => { try { fs.unlinkSync(P.accessoTwitch); } catch (e) {} };

  await prova('i numeri si scrivono all italiana, e si riconosce un numero nudo', () => {
    esigiUguale(twitch.formattaNumero(90), '90', '90');

    esigiUguale(twitch.formattaNumero(3624), '3.624', '3624');
    esigiUguale(twitch.formattaNumero(1234567), '1.234.567', '1234567');
    for (const si of ['3.619', '90', ' 3624 ', '1.234.567']) { esigi(twitch.eNumeroNudo(si), si + ' e un numero nudo'); }
    for (const no of ['~25', '3,6K', '3.6', '', 'tanti', '12.34', null]) { esigi(!twitch.eNumeroNudo(no), JSON.stringify(no) + ' non e un numero nudo'); }
  });

  await prova('i numeri riscrivono solo le caselle che contengono un numero', () => {

    const prima = twitch.CAMPI_NUMERI.abbonati;
    twitch.CAMPI_NUMERI.abbonati = ['chi.dato2Valore'];
    try {
    const documento = {
      testi: { 'chi.dato2Valore': '90' },
      config: { dati: { follower: 3619, abbonati: 90 } }
    };
    const cambiate = twitch.applicaNumeri(documento, { follower: 3624, abbonati: 96 });

    esigiUguale(documento.config.dati.follower, 3624, 'config.dati.follower');
    esigiUguale(documento.testi['chi.dato2Valore'], '96', 'la casella col numero');
    esigiUguale(documento.config.dati.abbonati, 96, 'config.dati.abbonati');
    esigiUguale(cambiate.join(','), 'config.dati.follower,config.dati.abbonati,chi.dato2Valore', 'chiavi cambiate');

    esigiUguale(twitch.applicaNumeri(documento, { follower: 3624, abbonati: 96 }).length, 0, 'secondo giro');

    esigiUguale(twitch.applicaNumeri(documento, { follower: 3624, abbonati: null }).length, 0, 'abbonati non letti');
    esigiUguale(documento.testi['chi.dato2Valore'], '96', 'la casella resta');

    const aMano = { testi: { 'chi.dato2Valore': '3,6K' }, config: { dati: {} } };
    twitch.applicaNumeri(aMano, { follower: 3624, abbonati: 96 });
    esigiUguale(aMano.testi['chi.dato2Valore'], '3,6K', 'la casella scritta a mano');
    } finally {
      if (prima === undefined) { delete twitch.CAMPI_NUMERI.abbonati; } else { twitch.CAMPI_NUMERI.abbonati = prima; }
    }
  });

  await prova('le caselle dei numeri esistono davvero nei contenuti e nello schema', () => {
    const campi = new Set(schema.campi().map((c) => c.chiave));
    const testi = archivio.leggi().testi;
    for (const elenco of Object.values(twitch.CAMPI_NUMERI)) {
      for (const chiave of elenco) {
        esigi(typeof testi[chiave] === 'string', chiave + ' non e in contenuti.json');
        esigi(campi.has(chiave), chiave + ' non e nello schema');
      }
    }
  });

  await prova('senza chiavi o senza autorizzazione i numeri restano quelli scritti', async () => {
    togliCredenziali();
    togliAccesso();
    const prima = JSON.stringify(archivio.leggi().testi);
    esigiUguale((await twitch.aggiornaNumeri()).stato, 'spento', 'senza chiavi');

    scriviCredenziali({ clientId: 'abcdef1234567890abcdef', clientSecret: 'unsegretolungoabbastanza' });
    try {
      esigiUguale(twitch.collegato(), false, 'collegato() senza file');
      esigiUguale((await twitch.aggiornaNumeri()).stato, 'nonCollegato', 'senza autorizzazione');

      scriviAccesso('{ non e json');
      esigiUguale(twitch.collegato(), false, 'collegato() su file rotto');
      const rotto = await twitch.aggiornaNumeri();
      esigiUguale(rotto.stato, 'fallito', 'file rotto');
      esigiDentro(rotto.motivo, '--collega', 'il motivo dice come rimediare');

      esigiUguale(JSON.stringify(archivio.leggi().testi), prima, 'ha toccato i testi e non doveva');
    } finally {
      togliAccesso();
      togliCredenziali();
    }
  });

  await prova('ogni stato dei numeri ha la sua riga, e raccontaNumeri() non lancia mai', () => {
    for (const stato of ['spento', 'nonCollegato', 'senzaCanale', 'aggiornato', 'invariato', 'fallito']) {
      for (const abbonati of [90, null]) {
        const riga = twitch.raccontaNumeri({ stato: stato, follower: 3624, abbonati: abbonati, motivo: 'un motivo', motivoAbbonati: 'negati' });
        esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
      }
    }
    for (const storto of [null, undefined, {}, { stato: 'inventato' }]) {
      esigiUguale(twitch.raccontaNumeri(storto), '', 'raccontaNumeri(' + JSON.stringify(storto) + ')');
    }
  });

  await prova('il refresh token non finisce nei file generati ne nel repository', () => {
    const spia = 'refreshtokenchenondevecomparire0000';
    scriviAccesso(JSON.stringify({ refreshToken: spia, idUtente: '1', login: 'prova' }));
    try {
      esigiUguale(twitch.collegato(), true, 'collegato() col file');
      costruisci.genera();
      for (const file of [P.indexHtml, P.datiJs, P.temaCss, P.contenutiJson]) {
        esigi(fs.readFileSync(file, 'utf8').indexOf(spia) === -1, 'il refresh token e finito dentro ' + path.basename(file));
      }
    } finally {
      togliAccesso();
    }
    const ignorati = fs.readFileSync(path.join(RADICE_VERA, '.gitignore'), 'utf8');
    esigiDentro(ignorati, 'server/dati/twitch-accesso.json', 'il .gitignore non esclude l autorizzazione di Twitch');
  });
}

async function proveClip(contenutiVeri, costruisci, archivio) {
  apriSezione('10. La vetrina delle clip');

  const clipFinta = (aggiunte) => Object.assign({
    id: 'abc', titolo: 'Una clip', url: 'https://clips.twitch.tv/abc',
    anteprima: 'https://clips-media-assets2.twitch.tv/abc-preview-480x272.jpg',
    durataSec: 32, visualizzazioni: 1234, creataIl: '2026-08-03T20:11:00Z', autore: 'Qualcuno'
  }, aggiunte || {});

  const ramo = (clip) => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    if (clip === undefined) { delete documento.config.clip; } else { documento.config.clip = clip; }
    return costruisci.clipDi(documento.config, documento.testi);
  };

  const accesa = (aggiunte) => Object.assign({ attivo: true, quante: 6, periodo: '30', voci: [clipFinta()] }, aggiunte || {});

  await prova('la vetrina e accesa solo se c e l interruttore E almeno una clip', () => {
    esigiUguale(ramo(accesa()).attivo, true, 'interruttore acceso e una clip');
    esigiUguale(ramo(accesa({ attivo: false })).attivo, false, 'interruttore spento');
    esigiUguale(ramo(accesa({ voci: [] })).attivo, false, 'nessuna clip');
    esigiUguale(ramo(accesa({ voci: 'non un elenco' })).attivo, false, 'voci non e un elenco');
    esigiUguale(ramo(undefined).attivo, false, 'ramo config.clip mancante');

    esigiUguale(ramo(accesa({ attivo: 'si' })).attivo, false, 'la stringa non accende niente');
  });

  await prova('una clip senza indirizzo o senza titolo viene scartata', () => {

    const voci = [clipFinta(), clipFinta({ url: '' }), clipFinta({ titolo: '   ' }), clipFinta({ titolo: 'Buona' })];
    const fuori = ramo(accesa({ voci: voci })).voci;
    esigiUguale(fuori.length, 2, 'clip rimaste');
    esigiUguale(fuori.map((v) => v.titolo).join('|'), 'Una clip|Buona', 'quali sono rimaste');
  });

  await prova('senza anteprima e senza autore la card resta, ma senza quei pezzi', () => {
    const solo = ramo(accesa({ voci: [clipFinta({ anteprima: '', autore: '', creataIl: '' })] })).voci[0];
    esigiUguale(solo.anteprima, '', 'anteprima');
    esigiUguale(solo.autore, '', 'autore');

    esigiUguale(solo.firma, '', 'firma');
    esigiUguale(solo.quando, '', 'data illeggibile');
    esigi(!!solo.titolo && !!solo.url, 'la card e sopravvissuta');
  });

  await prova('«quante» vale anche in resa, non solo alla richiesta', () => {

    const dieci = [];
    for (let i = 0; i < 10; i++) { dieci.push(clipFinta({ id: 'c' + i, titolo: 'Clip ' + i })); }
    esigiUguale(ramo(accesa({ quante: 3, voci: dieci })).voci.length, 3, 'tre');
    esigiUguale(ramo(accesa({ quante: 99, voci: dieci })).voci.length, 10, 'sopra il tetto restano quelle che ci sono');
    esigiUguale(ramo(accesa({ quante: 0, voci: dieci })).voci.length, 1, 'zero viene riportato a uno');
    esigiUguale(ramo(accesa({ quante: 'sei', voci: dieci })).voci.length, 6, 'parola al posto del numero: sei');
    const senza = accesa({ voci: dieci });
    delete senza.quante;
    esigiUguale(ramo(senza).voci.length, 6, 'chiave mancante: sei');
  });

  await prova('durata, visualizzazioni e data sono in italiano corrente', () => {
    const uno = (aggiunte) => ramo(accesa({ voci: [clipFinta(aggiunte)] })).voci[0];
    esigiUguale(uno({ durataSec: 32 }).durata, '0:32', 'trentadue secondi');
    esigiUguale(uno({ durataSec: 75 }).durata, '1:15', 'un minuto e un quarto');
    esigiUguale(uno({ durataSec: 5 }).durata, '0:05', 'i secondi hanno sempre due cifre');
    esigiUguale(uno({ durataSec: 'tanto' }).durata, '0:00', 'durata illeggibile');

    esigiUguale(uno({ visualizzazioni: 7 }).visualizzazioni, '7', 'unita');
    esigiUguale(uno({ visualizzazioni: 999 }).visualizzazioni, '999', 'sotto il migliaio');
    esigiUguale(uno({ visualizzazioni: 1234 }).visualizzazioni, '1.234', 'migliaia');
    esigiUguale(uno({ visualizzazioni: 1234567 }).visualizzazioni, '1.234.567', 'milioni');
    esigiUguale(uno({ visualizzazioni: -5 }).visualizzazioni, '0', 'niente numeri negativi');

    esigiUguale(uno({ creataIl: '2026-08-03T20:11:00Z' }).quando, '3 agosto 2026', 'data');
    esigiUguale(uno({ creataIl: '2026-01-31T00:00:00Z' }).quando, '31 gennaio 2026', 'gennaio e il primo mese');
    esigiUguale(uno({ creataIl: 'ieri' }).quando, '', 'data che non si legge');
  });

  await prova('a vetrina spenta la pagina non stampa nessuna card', () => {
    const documento = archivio.leggi();
    documento.config.clip = accesa({ attivo: false });
    const html = costruisci.anteprimaDi(documento);
    esigi(html.indexOf('clip__griglia') === -1, 'la griglia e finita in pagina con la vetrina spenta');
    esigi(html.indexOf('clip__card') === -1, 'le card sono finite in pagina con la vetrina spenta');

    esigi(html.indexOf('clip__vai') === -1, 'il bottone per la vetrina e in pagina senza la vetrina');
  });

  await prova('alla pagina delle clip porta solo l invito, non un bottone in testa alla diretta', () => {

    const documento = archivio.leggi();
    documento.config.clip = accesa({ archivio: [clipFinta()] });
    const html = costruisci.anteprimaDi(documento);

    const diretta = html.slice(html.indexOf('id="diretta"'), html.indexOf('id="settimana"'));
    esigiUguale((diretta.match(/href="clip\.html"/g) || []).length, 1, 'quanti link alla pagina delle clip nella diretta');
    esigi(diretta.indexOf('class="clip__vai" href="clip.html"') === -1, 'il bottone in testa alla diretta e tornato');

    esigiUguale((html.match(/id="clip"/g) || []).length, 1, 'quanti bersagli #clip');

    esigiDentro(html, 'class="btn btn--vuoto invito__vai" href="clip.html"', 'manca il bottone dell invito');
    esigiDentro(html, '>' + documento.testi['clip.invitoBottone'] + '<', 'manca la scritta del bottone dell invito');
  });

  await prova('senza clip da mostrare non si promette nessuna pagina', () => {

    const documento = archivio.leggi();
    documento.config.clip = accesa({ voci: [], archivio: [] });
    const html = costruisci.anteprimaDi(documento);
    esigi(html.indexOf('clip.html') === -1, 'la home promette una pagina che non esiste');
  });

  await prova('la pagina delle clip: una card per clip, con la sua data addosso', () => {

    const tre = [
      clipFinta({ id: 'a', creataIl: '2026-08-03T20:11:00Z' }),
      clipFinta({ id: 'b', creataIl: '2026-08-04T20:11:00Z' }),

      clipFinta({ id: 'c', creataIl: 'ieri' })
    ];
    const pagina = costruisci.clipPaginaDi({ clip: accesa({ archivio: tre, quanteArchivio: 20 }) }, contenutiVeri.testi);
    esigiUguale(pagina.attivo, true, 'la pagina e accesa');
    esigiUguale(pagina.voci.length, 2, 'la clip senza data buona resta fuori');
    esigiUguale(pagina.voci[0].iso, '2026-08-03T20:11:00.000Z', 'la data in ISO per il filtro');
    esigiUguale(pagina.quante, 20, 'il tetto per periodo arriva alla pagina');

    esigiUguale(costruisci.clipPaginaDi({ clip: accesa({ archivio: tre, quanteArchivio: 999 }) }, contenutiVeri.testi).quante, 50, 'tetto massimo');
    esigiUguale(costruisci.clipPaginaDi({ clip: accesa({ archivio: tre }) }, contenutiVeri.testi).quante, 12, 'tetto di serie');
  });

  await prova('in home solo l invito: le card stanno nella pagina delle clip, e i valori arrivano protetti', () => {

    const documento = archivio.leggi();
    const due = [
      clipFinta({ titolo: 'Titolo con & e <b>', autore: 'Tizio' }),
      clipFinta({ id: 'due', titolo: 'La seconda', anteprima: '' })
    ];
    documento.config.clip = accesa({ voci: due, archivio: due });
    const reso = costruisci.rendi(documento);

    esigiDentro(reso.html, 'clip--invito', 'manca l invito in home');
    esigiDentro(reso.html, '>' + documento.testi['clip.invitoTitolo'] + '<', 'manca il titolo dell invito');
    esigi(reso.html.indexOf('clip__card') === -1, 'in home ci sono ancora delle card');
    esigi(reso.html.indexOf('clip__griglia') === -1, 'in home c e ancora la griglia');

    const pagina = reso.clip;
    esigi(typeof pagina === 'string', 'la pagina delle clip non e stata resa');
    esigiUguale((pagina.match(/class="clip__card/g) || []).length, 2, 'quante card nella pagina');

    esigiDentro(pagina, 'Titolo con &amp; e &lt;b&gt;', 'il titolo non e stato protetto');
    esigi(pagina.indexOf('<b>Titolo') === -1, 'il titolo e arrivato in pagina come markup');
    esigiDentro(pagina, '0:32', 'manca la durata');
  });

  await prova('la pagina delle clip ha la barra di ricerca, e ogni card porta titolo e autore da cercare', () => {
    const documento = archivio.leggi();
    const due = [
      clipFinta({ titolo: 'Boss "finale" & <b>Città</b>', autore: 'Tizio' }),
      clipFinta({ id: 'due', titolo: 'La seconda', autore: '' })
    ];
    documento.config.clip = accesa({ voci: due, archivio: due });
    const pagina = costruisci.rendi(documento).clip;
    esigi(typeof pagina === 'string', 'la pagina delle clip non e stata resa');
    esigiDentro(pagina, 'type="search"', 'manca il campo di ricerca');
    esigiDentro(pagina, 'for="clip-cerca">' + documento.testi['clip.cercaEtichetta'] + '<', 'manca l etichetta del campo');
    esigiDentro(pagina, 'placeholder="' + documento.testi['clip.cercaSegnaposto'] + '"', 'manca il testo dentro il campo');
    esigiDentro(pagina, 'aria-label="' + documento.testi['clip.cercaPulisci'] + '"', 'manca il nome del bottone che cancella');
    esigiDentro(pagina, 'data-clip-cerca-vuoto', 'manca la riga per la ricerca senza risultati');
    esigiDentro(pagina, 'data-uno="' + documento.testi['clip.cercaUna'] + '"', 'manca «clip trovata»');
    esigiDentro(pagina, 'data-tanti="' + documento.testi['clip.cercaTante'] + '"', 'manca «clip trovate»');
    esigiDentro(pagina, 'data-cerca="Boss &quot;finale&quot; &amp; &lt;b&gt;Città&lt;/b&gt; Tizio"', 'titolo e autore da cercare, protetti');
    esigiUguale((pagina.match(/data-cerca="/g) || []).length, 2, 'una chiave di ricerca per card');
    esigi(pagina.indexOf('<b>Città') === -1, 'il titolo e arrivato in pagina come markup');
    esigiDentro(pagina, '<div class="clip-comandi" data-clip-comandi hidden>', 'i comandi non partono nascosti: senza JavaScript sarebbero inutili');
  });

  await prova('lo script delle clip filtra per testo e periodo insieme, senza badare ad accenti e maiuscole', () => {
    const codice = fs.readFileSync(path.join(__dirname, '..', 'js', 'clip.js'), 'utf8');
    const nodo = (attributi) => ({
      hidden: false,
      attributi: attributi,
      ascolti: {},
      getAttribute(nome) { return Object.prototype.hasOwnProperty.call(this.attributi, nome) ? this.attributi[nome] : null; },
      setAttribute(nome, valore) { this.attributi[nome] = valore; },
      addEventListener(tipo, f) { this.ascolti[tipo] = f; },
      focus() {}
    });
    const ORA = 3600 * 1000;
    const adesso = Date.now();
    const quando = (ore) => new Date(adesso - ore * ORA).toISOString();
    const voci = [
      nodo({ 'data-quando': quando(2), 'data-cerca': 'Città di notte Tizio' }),
      nodo({ 'data-quando': quando(30), 'data-cerca': 'Boss finale Caio' }),
      nodo({ 'data-quando': quando(100), 'data-cerca': 'Boss segreto Tizio' }),
      nodo({ 'data-quando': quando(400), 'data-cerca': 'Ultimo BOSS Sempronio' })
    ];
    const bottoni = [24, 72, 168, 720].map((ore) => nodo({ 'data-ore': String(ore), 'aria-pressed': ore === 720 ? 'true' : 'false' }));
    const campo = nodo({});
    campo.value = '';
    const pulisci = nodo({});
    pulisci.hidden = true;
    const conto = nodo({ 'data-uno': 'clip trovata', 'data-tanti': 'clip trovate' });
    conto.hidden = true;
    const vuoto = nodo({});
    vuoto.hidden = true;
    const vuotoCerca = nodo({});
    vuotoCerca.hidden = true;
    const comandi = nodo({});
    comandi.hidden = true;
    comandi.querySelectorAll = () => bottoni;
    comandi.querySelector = (selettore) => (selettore === '[data-clip-cerca]' ? campo : pulisci);
    const elenco = nodo({ 'data-quante': '2' });
    elenco.querySelectorAll = () => voci;
    const trovabili = {
      '[data-clip-comandi]': comandi,
      '[data-clip-elenco]': elenco,
      '[data-clip-conto]': conto,
      '[data-clip-vuoto]': vuoto,
      '[data-clip-cerca-vuoto]': vuotoCerca
    };
    require('node:vm').runInNewContext(codice, {
      document: { querySelector: (selettore) => trovabili[selettore] || null },
      window: { addEventListener() {} },
      Date: Date, parseInt: parseInt, isFinite: isFinite, isNaN: isNaN, String: String
    });
    const visibili = () => voci.map((v, i) => (v.hidden ? null : i)).filter((i) => i !== null);
    const scrivi = (testo) => { campo.value = testo; campo.ascolti.input(); };

    esigiUguale(comandi.hidden, false, 'i comandi non si rivelano');
    esigiUguale(JSON.stringify(visibili()), '[0,1]', 'senza ricerca vale il tetto di due per periodo');
    esigiUguale(vuoto.hidden, true, 'la riga del periodo vuoto compare a torto');
    esigiUguale(conto.hidden, true, 'il conto compare senza ricerca');

    scrivi('boss');
    esigiUguale(JSON.stringify(visibili()), '[1,2,3]', 'cercando il tetto non taglia: tutte le clip che corrispondono');
    esigiUguale(conto.textContent, '3 clip trovate', 'il conto');
    scrivi('  CITTA  ');
    esigiUguale(JSON.stringify(visibili()), '[0]', 'la «à» si trova con «a», e le maiuscole non contano');
    esigiUguale(conto.textContent, '1 clip trovata', 'il conto al singolare');
    scrivi('boss tizio');
    esigiUguale(JSON.stringify(visibili()), '[2]', 'piu parole: devono esserci tutte');

    scrivi('boss');
    bottoni[2].ascolti.click({ currentTarget: bottoni[2] });
    esigiUguale(JSON.stringify(visibili()), '[1,2]', 'il periodo restringe anche la ricerca: 7 giorni lascia fuori la clip di 400 ore fa');
    bottoni[0].ascolti.click({ currentTarget: bottoni[0] });
    esigiUguale(JSON.stringify(visibili()), '[]', 'nessuna corrispondenza nelle ultime 24 ore');
    esigiUguale(vuotoCerca.hidden, false, 'manca il messaggio della ricerca senza risultati');
    esigiUguale(vuoto.hidden, true, 'compare il messaggio del periodo vuoto invece di quello della ricerca');

    scrivi('');
    esigiUguale(JSON.stringify(visibili()), '[0]', 'a ricerca vuota si torna al periodo, col suo tetto');
    esigiUguale(conto.hidden, true, 'il conto resta dopo aver cancellato la ricerca');
    esigiUguale(vuotoCerca.hidden, true, 'il messaggio della ricerca resta dopo averla cancellata');
    scrivi('zzz');
    esigiUguale(pulisci.hidden, false, 'il bottone che cancella non compare');
    pulisci.ascolti.click();
    esigiUguale(campo.value, '', 'il bottone non cancella il testo');
    esigiUguale(pulisci.hidden, true, 'il bottone resta a campo vuoto');
  });

  await prova('la vetrina non porta nessuna voce nuova nel binario', () => {

    const documento = archivio.leggi();
    documento.config.clip = accesa({ archivio: [clipFinta()] });
    const html = costruisci.anteprimaDi(documento);
    const nav = html.slice(html.indexOf('binario__nav'), html.indexOf('binario__stato'));
    esigiUguale((nav.match(/binario__voce/g) || []).length, 6, 'voci nel binario');

    const diretta = html.slice(html.indexOf('id="diretta"'), html.indexOf('id="settimana"'));
    esigiDentro(diretta, 'clip--invito', 'l invito non e dentro la sezione «diretta»');
  });

  await prova('gli host delle anteprime sono gli stessi nel modulo e nella CSP', () => {

    const documento = archivio.leggi();
    const html = costruisci.anteprimaDi(documento);

    const meta = /<meta http-equiv="Content-Security-Policy" content="([\s\S]*?)">/.exec(html);
    esigi(meta !== null, 'la Content-Security-Policy non c e piu');
    const csp = meta[1].replace(/\s+/g, ' ');
    const imgSrc = (csp.match(/img-src[^;]*/) || [''])[0];
    esigi(!!imgSrc, 'la CSP non ha una direttiva img-src');
    for (const host of twitch.HOST_ANTEPRIME) {
      esigiDentro(imgSrc, 'https://' + host, 'img-src non lascia passare ' + host);
    }

    for (const pezzo of imgSrc.split(/\s+/)) {
      if (pezzo.indexOf('clips-media') === -1) { continue; }
      const host = pezzo.replace(/^https:\/\//, '').replace(/;$/, '');
      esigi(twitch.HOST_ANTEPRIME.indexOf(host) !== -1, 'la CSP permette ' + host + ', che il modulo non usa');
    }
  });

  await prova('config.clip.voci non ha un campo nello schema, ed e voluto', () => {

    esigi(schema.GENERATI.indexOf('config.clip.voci') !== -1, 'config.clip.voci non e fra i rami generati');
    esigi(!schema.campo('config.clip.voci'), 'lo schema ha un campo per config.clip.voci');

    const problemi = schema.verificaCopertura(contenutiVeri);
    esigi(problemi.length === 0, problemi.map((p) => p.messaggio).join(' | '));

    for (const chiave of ['config.clip.attivo', 'config.clip.quante', 'config.clip.periodo']) {
      esigi(!!schema.campo(chiave), 'manca il campo ' + chiave);
    }
  });

  await prova('il periodo accetta solo i quattro valori previsti', () => {
    for (const buono of ['7', '30', '365', 'sempre']) {
      esigiUguale(convalida.convalidaCampo('config.clip.periodo', buono).length, 0, 'periodo ' + buono);
    }
    for (const storto of ['14', 'mese', '', 'SEMPRE']) {
      esigi(convalida.convalidaCampo('config.clip.periodo', storto).length === 1, 'doveva essere rifiutato: ' + storto);
    }

    const campo = schema.campo('config.clip.periodo');
    for (const opzione of campo.opzioni) {
      const valore = typeof opzione === 'object' ? opzione.valore : opzione;
      esigi(valore === 'sempre' || Object.prototype.hasOwnProperty.call(twitch.PERIODI, valore),
        'il periodo "' + valore + '" e nello schema ma non in twitch.PERIODI');
    }
  });

  await prova('a vetrina spenta non si chiede niente a Twitch', async () => {

    const documento = archivio.leggi();
    documento.config.clip = accesa({ attivo: false, voci: [clipFinta()] });
    archivio.salva(documento);
    const esito = await twitch.aggiornaClip();
    esigiUguale(esito.stato, 'spento', 'stato');
    esigiUguale(archivio.leggi().config.clip.voci.length, 1, 'ha toccato le voci e non doveva');
  });

  await prova('«spento» ha due motivi, e il resoconto li distingue', async () => {

    const senza = twitch.raccontaClip({ stato: 'spento' });
    const sezione = twitch.raccontaClip({ stato: 'spento', motivo: 'sezione' });
    esigi(senza !== sezione, 'le due righe sono identiche');
    esigiDentro(senza, 'collegamento', 'la riga senza credenziali non nomina il collegamento');
    esigiDentro(sezione, 'pannello', 'la riga a vetrina spenta non manda al pannello');

    const documento = archivio.leggi();
    documento.config.clip = accesa({ attivo: false });
    archivio.salva(documento);
    esigiUguale((await twitch.aggiornaClip()).motivo, undefined, 'senza credenziali non si nomina la sezione');
  });

  await prova('ogni stato delle clip ha la sua riga, e raccontaClip() non lancia mai', () => {
    for (const stato of ['spento', 'senzaCanale', 'aggiornato', 'invariato', 'vuoto', 'fallito']) {
      const riga = twitch.raccontaClip({ stato: stato, quante: 6, motivo: 'un motivo' });
      esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
    }
    for (const storto of [null, undefined, {}, { stato: 'inventato' }]) {
      esigiUguale(twitch.raccontaClip(storto), '', 'raccontaClip(' + JSON.stringify(storto) + ')');
    }

    const conStrani = twitch.raccontaClip({ stato: 'aggiornato', quante: 3, hostStrani: ['esempio.twitchcdn.net'] });
    esigiDentro(conStrani, 'esempio.twitchcdn.net', 'non nomina l host sconosciuto');
  });
}

async function proveSchedule(contenutiVeri, costruisci, archivio) {
  apriSezione('11. La schedule (CONTRATTO-5)');

  const O = require('../pannello/condivisi/orari.js');
  const copia = (valore) => JSON.parse(JSON.stringify(valore));
  const percorsiDi = (orari) => O.problemi(orari).map((p) => p.percorso);
  const ISO = (ms) => new Date(ms).toISOString();

  const orariBuoni = () => ({
    giorni: [1, 3, 5, 0], ora: '21:00', durataOre: 4, fuso: 'Europe/Rome',
    schede: [0, 1, 2, 3, 4, 5, 6].map(() => O.schedaVuota()),
    eventi: [],
    sfondo: { immagine: 'img/settimana-sfondo.webp', fuoco: { x: 50, y: 50 }, intensita: 30 }
  });

  const evento = (aggiunte) => Object.assign(O.eventoVuoto(), { data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' }, aggiunte || {});

  const soloSu = (orari, percorso, cosa) => {
    const trovati = percorsiDi(orari);
    esigi(trovati.length === 1 && trovati[0] === percorso,
      (cosa || percorso) + ': atteso un problema solo su ' + percorso + ', avuti ' + JSON.stringify(trovati));
  };
  const nessuno = (orari, cosa) => {
    const trovati = O.problemi(orari);
    esigi(trovati.length === 0, (cosa || 'valore buono') + ': problemi inattesi ' + JSON.stringify(trovati));
  };

  await prova('orari.js: tabelle congelate, giorni da domenica, lettura da lunedi, limiti del contratto', () => {
    esigiUguale(O.GIORNI.length, 7, 'giorni');
    esigiUguale(O.GIORNI[0].abbr + ' ' + O.GIORNI[1].nome + ' ' + O.GIORNI[3].minuscolo, 'DOM Lunedì mercoledì', 'nomi dei giorni');
    esigiUguale(O.ORDINE.join(','), '1,2,3,4,5,6,0', 'ordine di lettura');
    const L = O.LIMITI;
    esigiUguale([L.titolo, L.gioco, L.nota, L.notaEvento, L.eventi, L.veloMin, L.veloMax, L.velo, L.intensita, L.durataMin, L.durataMax, L.durataEventoMax].join(','),
      '40,40,120,160,8,30,90,60,30,0.5,24,72', 'limiti');
    for (const tabella of [O.LIMITI, O.GIORNI, O.GIORNI[2], O.ORDINE, O.MESI]) {
      esigi(Object.isFrozen(tabella), 'una tabella condivisa non e congelata');
    }
    esigiUguale(JSON.stringify(O.schedaVuota()), JSON.stringify({ ora: '', durataOre: null, titolo: '', gioco: '', nota: '', immagine: '', fuoco: { x: 50, y: 50 }, velo: 60 }), 'scheda vuota');
    esigi(O.schedaVuota() !== O.schedaVuota() && O.schedaVuota().fuoco !== O.schedaVuota().fuoco, 'i valori vuoti devono essere oggetti nuovi a ogni chiamata');
  });

  await prova('normalizza: la forma di prima (senza schede, eventi e fondale) diventa completa senza cambiare niente', () => {
    const vecchio = { giorni: [1, 3, 5, 0], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 };
    const pulito = O.normalizza(vecchio);
    esigiUguale(Object.keys(pulito).join(','), 'giorni,ora,durataOre,fuso,schede,eventi,pause,sfondo', 'chiavi del ramo');
    esigiUguale(pulito.giorni.join(','), '1,3,5,0', 'giorni (ordine compreso)');
    esigiUguale(pulito.ora + ' ' + pulito.durataOre + ' ' + pulito.fuso, '21:00 4 Europe/Rome', 'valori di serie');
    esigiUguale(pulito.schede.length, 7, 'schede');
    esigi(pulito.schede.every((s) => JSON.stringify(s) === JSON.stringify(O.schedaVuota())), 'le schede aggiunte non sono vuote');
    esigiUguale(JSON.stringify(pulito.eventi) + JSON.stringify(pulito.sfondo), '[]' + JSON.stringify(O.sfondoVuoto()), 'eventi e fondale');
    esigiUguale(JSON.stringify(O.normalizza(pulito)), JSON.stringify(pulito), 'normalizzare due volte cambia il ramo');
    esigiUguale(JSON.stringify(vecchio), JSON.stringify({ giorni: [1, 3, 5, 0], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 }), 'il valore passato e stato modificato');
  });

  await prova('normalizza: valori sporchi stretti al bordo, testi su una riga e tagliati, e non lancia mai', () => {
    for (const cosa of [undefined, null, 'orari', 42, [], { schede: 'x', eventi: {}, sfondo: [] }, { schede: [null, 3, 'x'], eventi: [null, 7] }]) {
      const n = O.normalizza(cosa);
      esigi(n.schede.length === 7 && Array.isArray(n.eventi) && n.sfondo && typeof n.ora === 'string', 'forma incompleta per ' + JSON.stringify(cosa));
    }
    const emoji = String.fromCodePoint(0x1f414);
    const n = O.normalizza({
      giorni: [1, '3', 3, 9, -1, 2.5], ora: ' 18:30 ', durataOre: 30, fuso: 'Marte/Base',
      schede: [null, {
        ora: '9:00', durataOre: 2.3, titolo: 'Horror\n  di  notte', gioco: 7, nota: 'x'.repeat(200),
        immagine: 'https://altrosito.it/a.png', fuoco: { x: 120, y: -3.4 }, velo: 10
      }, { durataOre: 0.1, immagine: ' contenuti/media/locandina.webp ', fuoco: { x: '30', y: 20.6 }, velo: 95 }],
      eventi: [5, { data: '2026-02-30', ora: '15:00', durataOre: 100, titolo: emoji.repeat(30), immagine: 'contenuti/media/../server/dati/auth.json' }]
        .concat([1, 2, 3, 4, 5, 6, 7, 8].map((i) => evento({ titolo: 'E' + i }))),
      sfondo: { immagine: 'img/a b.png', fuoco: null, intensita: 200 }
    });
    esigiUguale(n.giorni.join(','), '1,3', 'giorni ripuliti e senza doppioni');
    esigiUguale(n.ora + ' ' + n.durataOre + ' ' + n.fuso, '18:30 24 Europe/Rome', 'ora ripulita, durata stretta, fuso sconosciuto');
    const lun = n.schede[1];
    esigiUguale(lun.ora, '', 'ora storta di una scheda');
    esigiUguale(lun.durataOre, 2.5, 'durata arrotondata alla mezz ora');
    esigiUguale(lun.titolo, 'Horror di notte', 'titolo su una riga');
    esigiUguale(lun.gioco, '', 'un numero non e un testo');
    esigiUguale(lun.nota.length, 120, 'nota tagliata');
    esigiUguale(lun.immagine, '', 'indirizzo esterno');
    esigiUguale(lun.fuoco.x + ',' + lun.fuoco.y + ',' + lun.velo, '100,0,30', 'fuoco e velo stretti');
    const mar = n.schede[2];
    esigiUguale(mar.durataOre + ' ' + mar.immagine + ' ' + mar.fuoco.x + ',' + mar.fuoco.y + ' ' + mar.velo,
      '0.5 contenuti/media/locandina.webp 30,21 90', 'secondo giro di valori');
    esigiUguale(n.eventi.length, 8, 'eventi oltre il tetto');
    esigiUguale(JSON.stringify(n.eventi[0]), JSON.stringify(O.eventoVuoto()), 'un evento non oggetto resta al suo posto, vuoto');
    const rotto = n.eventi[1];
    esigiUguale(rotto.data + '|' + rotto.durataOre + '|' + rotto.immagine, '|72|', 'data inesistente, durata stretta, risalita');
    esigiUguale(rotto.titolo.length, 40, 'titolo tagliato');
    const ultimo = rotto.titolo.charCodeAt(rotto.titolo.length - 1);
    esigi(!(ultimo >= 0xd800 && ultimo <= 0xdbff), 'il taglio ha spezzato un emoji a meta');
    esigiUguale(n.eventi[7].titolo, 'E6', 'gli eventi restano nell ordine in cui sono');
    esigiUguale(n.sfondo.immagine + '|' + n.sfondo.fuoco.x + '|' + n.sfondo.intensita, '|50|100', 'fondale');
  });

  await prova('problemi: il ramo intero e le regole di sempre (giorni, ora, durata, fuso)', () => {
    nessuno(orariBuoni(), 'ramo buono');
    esigiUguale(JSON.stringify(percorsiDi(null)), '[""]', 'ramo non oggetto');
    const casi = [
      [{ giorni: [] }, 'giorni'], [{ giorni: [1, 1] }, 'giorni'], [{ giorni: [7] }, 'giorni'], [{ giorni: ['1'] }, 'giorni'],
      [{ ora: '21.00' }, 'ora'], [{ ora: undefined }, 'ora'],
      [{ durataOre: 0 }, 'durataOre'], [{ durataOre: 24.5 }, 'durataOre'], [{ durataOre: 2.3 }, 'durataOre'], [{ durataOre: '4' }, 'durataOre'],
      [{ fuso: '' }, 'fuso'], [{ fuso: 'Marte/Base' }, 'fuso']
    ];
    for (const [modifica, percorso] of casi) {
      soloSu(Object.assign(orariBuoni(), modifica), percorso, JSON.stringify(modifica));
    }
    nessuno(Object.assign(orariBuoni(), { durataOre: 0.5 }), 'durata minima');
    nessuno(Object.assign(orariBuoni(), { durataOre: 2.5, giorni: [6] }), 'mezz ora e un giorno solo');
    const fuso = O.problemi(Object.assign(orariBuoni(), { fuso: 'Marte/Base' }))[0].messaggio;
    esigiUguale(fuso, 'Il fuso orario «Marte/Base» non esiste: usa un nome come Europe/Rome.', 'messaggio del fuso');
    esigiUguale(O.problemi(Object.assign(orariBuoni(), { giorni: [3, 3] }))[0].messaggio, 'Il giorno mercoledì è ripetuto due volte.', 'messaggio con gli accenti');
  });

  await prova('problemi: ogni regola della scheda di un giorno', () => {
    const conScheda = (n, modifica) => {
      const orari = orariBuoni();
      Object.assign(orari.schede[n], modifica);
      return orari;
    };
    soloSu(conScheda(1, { ora: '9:00' }), 'schede.1.ora');
    esigiUguale(O.problemi(conScheda(1, { ora: '9:00' }))[0].messaggio, 'L\'ora di lunedì va scritta come 21:00.', 'messaggio dell ora');
    nessuno(conScheda(1, { ora: '' }), 'ora vuota = quella di serie');
    nessuno(conScheda(1, { ora: '00:00', durataOre: 24 }), 'ora e durata ai bordi');
    for (const durata of [0, 0.4, 24.5, 1.3, '2', false]) { soloSu(conScheda(2, { durataOre: durata }), 'schede.2.durataOre', 'durata ' + JSON.stringify(durata)); }
    nessuno(conScheda(2, { durataOre: null }), 'durata vuota = quella di serie');
    for (const [campo, massimo] of [['titolo', 40], ['gioco', 40], ['nota', 120]]) {
      nessuno(conScheda(3, { [campo]: 'a'.repeat(massimo) }), campo + ' al massimo');
      soloSu(conScheda(3, { [campo]: 'a'.repeat(massimo + 1) }), 'schede.3.' + campo, campo + ' oltre il massimo');
      soloSu(conScheda(3, { [campo]: 'riga\naltra' }), 'schede.3.' + campo, campo + ' con un a capo');
      soloSu(conScheda(3, { [campo]: 12 }), 'schede.3.' + campo, campo + ' non testo');
    }
    esigiUguale(O.problemi(conScheda(0, { titolo: 'a'.repeat(45) }))[0].messaggio, 'Il titolo di domenica supera i 40 caratteri: adesso sono 45.', 'messaggio del titolo');
    for (const percorso of ['https://altrosito.it/a.png', 'img/../server/a.png', 'img/a b.png', 'img/a.gif', 'javascript:alert(1)', '/img/a.png', 'altro/a.png']) {
      soloSu(conScheda(4, { immagine: percorso }), 'schede.4.immagine', percorso);
    }
    nessuno(conScheda(4, { immagine: 'contenuti/media/locandina-1.webp' }), 'immagine della libreria');
    nessuno(conScheda(4, { immagine: 'img/sotto/cartella/a.jpeg' }), 'immagine in una sottocartella');
    for (const fuoco of [{ x: 50.5, y: 50 }, { x: 50 }, { x: -1, y: 0 }, { x: 0, y: 101 }, null, [50, 50]]) {
      soloSu(conScheda(5, { fuoco: fuoco }), 'schede.5.fuoco', 'fuoco ' + JSON.stringify(fuoco));
    }
    nessuno(conScheda(5, { fuoco: { x: 0, y: 100 } }), 'fuoco ai bordi');
    for (const velo of [29, 91, 60.5, '60']) { soloSu(conScheda(6, { velo: velo }), 'schede.6.velo', 'velo ' + JSON.stringify(velo)); }
    nessuno(conScheda(6, { velo: 30 }), 'velo minimo');
    nessuno(conScheda(6, { velo: 90 }), 'velo massimo');
    const senzaCampi = orariBuoni();
    senzaCampi.schede[1] = { titolo: 'Solo il titolo' };
    nessuno(senzaCampi, 'una scheda con i soli campi scritti vale coi valori di serie');
    const corte = orariBuoni();
    corte.schede.pop();
    soloSu(corte, 'schede', 'sei schede');
    const nulla = orariBuoni();
    nulla.schede[2] = null;
    soloSu(nulla, 'schede.2', 'scheda non compilata');
    soloSu(Object.assign(orariBuoni(), { schede: {} }), 'schede', 'schede non elenco');
  });

  await prova('problemi: ogni regola di un evento speciale, e un evento passato va bene', () => {
    const conEvento = (modifica) => Object.assign(orariBuoni(), { eventi: [evento(modifica)] });
    nessuno(conEvento({}), 'evento buono');
    nessuno(conEvento({ data: '2020-01-01' }), 'evento passato');
    nessuno(conEvento({ data: '2028-02-29', durataOre: 72 }), 'anno bisestile e durata massima');
    for (const data of ['', '2026-9-27', '27/09/2026', '2026-02-29', '2026-13-01', '2026-04-31', 20260927]) {
      soloSu(conEvento({ data: data }), 'eventi.0.data', 'data ' + JSON.stringify(data));
    }
    esigiUguale(O.problemi(conEvento({ data: '2026-02-29' }))[0].messaggio, 'La data dell\'evento «Maratona» non esiste nel calendario: 2026-02-29.', 'messaggio della data');
    for (const ora of ['', '25:00', '9:00']) { soloSu(conEvento({ ora: ora }), 'eventi.0.ora', 'ora ' + JSON.stringify(ora)); }

    for (const durata of [undefined, null, '']) { nessuno(conEvento({ durataOre: durata }), 'durata assente ' + JSON.stringify(durata)); }
    for (const durata of [0, 0.3, 72.5, 73, 1.25]) { soloSu(conEvento({ durataOre: durata }), 'eventi.0.durataOre', 'durata ' + JSON.stringify(durata)); }
    for (const titolo of ['', '   ', 'a'.repeat(41), 'uno\ndue']) { soloSu(conEvento({ titolo: titolo }), 'eventi.0.titolo', 'titolo ' + JSON.stringify(titolo)); }
    esigiUguale(O.problemi(conEvento({ titolo: '' }))[0].messaggio, 'Il titolo dell\'evento numero 1 non può restare vuoto.', 'messaggio del titolo vuoto');
    soloSu(conEvento({ gioco: 'g'.repeat(41) }), 'eventi.0.gioco');
    nessuno(conEvento({ nota: 'n'.repeat(160) }), 'nota di 160');
    soloSu(conEvento({ nota: 'n'.repeat(161) }), 'eventi.0.nota');
    soloSu(conEvento({ immagine: 'https://altrosito.it/a.png' }), 'eventi.0.immagine');
    soloSu(conEvento({ fuoco: { x: 'a', y: 1 } }), 'eventi.0.fuoco');
    soloSu(conEvento({ velo: 100 }), 'eventi.0.velo');
    const manca = Object.assign(orariBuoni(), { eventi: [{ titolo: 'Senza quando' }] });
    esigiUguale(percorsiDi(manca).join(','), 'eventi.0.data,eventi.0.ora', 'data e ora obbligatorie, la durata no');
    const nove = Object.assign(orariBuoni(), { eventi: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => evento({ titolo: 'E' + i })) });
    soloSu(nove, 'eventi', 'nove eventi');
    soloSu(Object.assign(orariBuoni(), { eventi: {} }), 'eventi', 'eventi non elenco');
    soloSu(Object.assign(orariBuoni(), { eventi: [evento(), 'x'] }), 'eventi.1', 'evento non compilato');
  });

  await prova('problemi: il fondale (immagine, fuoco, intensita) e le assenze tollerate', () => {
    const conSfondo = (modifica) => {
      const orari = orariBuoni();
      Object.assign(orari.sfondo, modifica);
      return orari;
    };
    for (const intensita of [-1, 101, 30.5, '30']) { soloSu(conSfondo({ intensita: intensita }), 'sfondo.intensita', 'intensita ' + JSON.stringify(intensita)); }
    nessuno(conSfondo({ intensita: 0, immagine: '' }), 'fondale spento');
    nessuno(conSfondo({ intensita: 100 }), 'intensita piena');
    soloSu(conSfondo({ immagine: 'data:image/png;base64,AAAA' }), 'sfondo.immagine');
    soloSu(conSfondo({ fuoco: { x: 1 } }), 'sfondo.fuoco');
    soloSu(Object.assign(orariBuoni(), { sfondo: 'img/a.png' }), 'sfondo', 'fondale non oggetto');
    esigiUguale(O.problemi(conSfondo({ intensita: 101 }))[0].messaggio, 'L\'intensità del fondale deve essere un numero intero da 0 a 100.', 'messaggio con l accento');
    nessuno({ giorni: [1], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 }, 'ramo senza schede, eventi e fondale');
    nessuno(O.normalizza(orariBuoni()), 'un ramo valido resta valido dopo normalizza');
  });

  await prova('percorsoValido: solo file del sito, niente esterni, spazi, schemi o risalite', () => {
    for (const buono of ['img/a.png', 'img/a.jpg', 'img/a.jpeg', 'img/a.webp', 'img/a.avif', 'img/a.svg', 'contenuti/media/a_b-c.1.webp', 'img/x/y.png']) {
      esigi(O.percorsoValido(buono), 'doveva passare ' + buono);
    }
    for (const cattivo of ['', ' img/a.png', 'img/a.gif', 'img/a.PNG', 'img/..png', 'img/../a.png', 'contenuti/a.png', 'server/dati/a.png',
      'https://x.it/img/a.png', '//x.it/a.png', 'img/a.png?x=1', 'img/a"b.png', 'img/a).png', 'img\\a.png', null, 3]) {
      esigi(!O.percorsoValido(cattivo), 'doveva essere rifiutato: ' + JSON.stringify(cattivo));
    }
  });

  await prova('istante: l ora legale del 29 marzo e del 25 ottobre 2026 a Roma', () => {
    esigiUguale(ISO(O.istante('2026-09-27', '15:00', 'Europe/Rome')), '2026-09-27T13:00:00.000Z', 'ora legale');
    esigiUguale(ISO(O.istante('2026-12-01', '21:00', 'Europe/Rome')), '2026-12-01T20:00:00.000Z', 'ora solare');
    esigiUguale(ISO(O.istante('2026-12-01', '21:00')), '2026-12-01T20:00:00.000Z', 'senza fuso vale Europe/Rome');

    esigiUguale(ISO(O.istante('2026-03-29', '01:59', 'Europe/Rome')), '2026-03-29T00:59:00.000Z', 'un minuto prima del salto');
    esigiUguale(ISO(O.istante('2026-03-29', '02:30', 'Europe/Rome')), '2026-03-29T01:30:00.000Z', 'l ora che non esiste scivola alle 03:30');
    esigiUguale(ISO(O.istante('2026-03-29', '03:00', 'Europe/Rome')), '2026-03-29T01:00:00.000Z', 'subito dopo il salto');
    esigiUguale(ISO(O.istante('2026-03-29', '21:00', 'Europe/Rome')), '2026-03-29T19:00:00.000Z', 'la sera del 29 marzo');
    esigiUguale(ISO(O.istante('2026-03-28', '21:00', 'Europe/Rome')), '2026-03-28T20:00:00.000Z', 'la sera prima');

    esigiUguale(ISO(O.istante('2026-10-25', '02:30', 'Europe/Rome')), '2026-10-25T00:30:00.000Z', 'l ora doppia e la prima');
    esigiUguale(ISO(O.istante('2026-10-25', '03:00', 'Europe/Rome')), '2026-10-25T02:00:00.000Z', 'dopo il ritorno');
    esigiUguale(ISO(O.istante('2026-10-25', '21:00', 'Europe/Rome')), '2026-10-25T20:00:00.000Z', 'la sera del 25 ottobre');
    esigiUguale(ISO(O.istante('2026-10-24', '21:00', 'Europe/Rome')), '2026-10-24T19:00:00.000Z', 'la sera prima');

    esigiUguale(ISO(O.istante('2026-01-01', '00:00', 'Asia/Kolkata')), '2025-12-31T18:30:00.000Z', 'Kolkata');
    esigiUguale(ISO(O.istante('2026-06-01', '12:00', 'Pacific/Chatham')), '2026-05-31T23:15:00.000Z', 'Chatham');
    esigiUguale(ISO(O.istante('2026-03-08', '02:30', 'America/New_York')), '2026-03-08T07:30:00.000Z', 'New York, ora saltata');
    for (const [data, ora, fuso] of [['2026-02-30', '12:00', 'Europe/Rome'], ['2026-01-01', '24:00', 'Europe/Rome'], ['2026-01-01', '12:00', 'Marte/Base'], [null, '12:00', 'UTC']]) {
      esigi(Number.isNaN(O.istante(data, ora, fuso)), 'doveva dare NaN: ' + JSON.stringify([data, ora, fuso]));
    }
  });

  await prova('fine: a cavallo della mezzanotte, a mezz ora, e sull orologio vero per gli eventi', () => {
    esigiUguale(O.fine('21:00', 4), '01:00', '21 + 4');
    esigiUguale(O.fine('23:30', 1.5), '01:00', '23:30 + 1,5');
    esigiUguale(O.fine('22:00', 2), '00:00', 'fino a mezzanotte');
    esigiUguale(O.fine('21:30', 2.5), '00:00', 'mezz ore');
    esigiUguale(O.fine('10:00', 24), '10:00', 'un giorno intero');
    esigiUguale(O.fine('15:00', 72), '15:00', 'tre giorni');
    esigiUguale(O.fine('9', 1) + O.fine('21:00', 'x'), '', 'valori che non si leggono');

    const inizio = O.istante('2026-10-25', '00:00', 'Europe/Rome');
    esigiUguale(O.oraNelFuso(inizio + 4 * 3600000, 'Europe/Rome'), '03:00', 'fine a cavallo del cambio d ora');
    esigiUguale(O.oraNelFuso(NaN, 'Europe/Rome'), '', 'istante non valido');
  });

  await prova('oraDi e durataDi: la scheda vince, vuota vale quella di serie', () => {
    const orari = orariBuoni();
    Object.assign(orari.schede[3], { ora: '18:30', durataOre: 2.5 });
    Object.assign(orari.schede[5], { ora: 'boh', durataOre: 'x' });
    esigiUguale(O.oraDi(orari, 3) + ' ' + O.durataDi(orari, 3), '18:30 2.5', 'scheda propria');
    esigiUguale(O.oraDi(orari, 1) + ' ' + O.durataDi(orari, 1), '21:00 4', 'scheda vuota');
    esigiUguale(O.oraDi(orari, 5) + ' ' + O.durataDi(orari, 5), '21:00 4', 'scheda storta');
    esigiUguale(O.oraDi({ giorni: [1], ora: '20:00', durataOre: 3 }, 1) + ' ' + O.durataDi({ giorni: [1], ora: '20:00', durataOre: 3 }, 1), '20:00 3', 'forma di prima');
    esigiUguale(O.oraDi(null, 9) + ' ' + O.durataDi(undefined, 'x'), '21:00 4', 'niente di leggibile');
    esigiUguale(O.giornoDellaSettimana('2026-09-27') + ',' + O.giornoDellaSettimana('2026-09-28') + ',' + O.giornoDellaSettimana('2026-02-30'), '0,1,-1', 'giorno della settimana');
  });

  await prova('eventiFuturi: via quelli finiti, dentro quelli in corso, per inizio, con l indice vero', () => {
    const adesso = Date.parse('2026-09-20T10:00:00.000Z');
    const orari = Object.assign(orariBuoni(), {
      eventi: [
        evento({ data: '2026-10-03', ora: '21:00', durataOre: 3, titolo: 'Dopo' }),
        evento({ data: '2026-09-01', ora: '15:00', durataOre: 4, titolo: 'Finito' }),
        evento({ data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' }),
        evento({ data: '2026-09-20', ora: '09:00', durataOre: 4, titolo: 'In corso' }),
        evento({ data: '2026-09-20', ora: '11:00', durataOre: 1, titolo: 'Finito da poco' }),
        { titolo: 'Senza data' }
      ]
    });
    const futuri = O.eventiFuturi(orari, adesso);
    esigiUguale(futuri.map((e) => e.indice + ':' + e.titolo).join(', '), '3:In corso, 2:Maratona, 0:Dopo', 'eventi e ordine');
    esigiUguale(ISO(futuri[1].inizio) + ' ' + ISO(futuri[1].termine), '2026-09-27T13:00:00.000Z 2026-09-28T01:00:00.000Z', 'istanti della maratona');
    esigiUguale(futuri[1].data + ' ' + futuri[1].ora + ' ' + futuri[1].durataOre, '2026-09-27 15:00 12', 'campi dell evento');

    esigiUguale(O.eventiFuturi(orari, Date.parse('2026-09-20T10:00:00.000Z')).some((e) => e.titolo === 'Finito da poco'), false, 'finito all istante');
    esigiUguale(O.eventiFuturi({ eventi: 'x' }, adesso).length, 0, 'eventi non elenco');
  });

  await prova('eventiFuturi: un evento senza durata resta non finito per un anno, non per sempre', () => {
    const orari = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-18', ora: '16:00', durataOre: null, titolo: 'Maratona aperta' })]
    });
    const inizio = Date.parse('2026-09-18T14:00:00.000Z');

    esigiUguale(O.eventiFuturi(orari, inizio - 1000).length, 1, 'prima dell inizio c e ancora');

    esigiUguale(O.eventiFuturi(orari, inizio + 30 * 24 * 3600000).length, 1, 'un mese dopo e ancora non finito');

    const [voce] = O.eventiFuturi(orari, inizio);
    esigi(Number.isFinite(voce.termine) && voce.termine > voce.inizio, 'termine finito e dopo l inizio');
    esigiUguale(voce.termine - voce.inizio, 365 * 24 * 3600000, 'un anno esatto di finta durata');

    esigiUguale(O.eventiFuturi(orari, voce.termine + 1).length, 0, 'oltre l anno finto e considerato finito');

    const [pagina] = costruisci.eventiDi(orari, inizio);
    esigiUguale(pagina.fine, '', 'senza durata, fine vuota: niente "- 15:00" inventato');
    esigi(pagina.termine !== '', 'termine invece resta un istante vero (serve a data-fine)');
  });

  await prova('eventoAttivo: solo quello acceso adesso, e a due sovrapposti vince chi ha cominciato prima', () => {
    const orari = Object.assign(orariBuoni(), {
      eventi: [
        evento({ data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' }),
        evento({ data: '2026-09-27', ora: '14:00', durataOre: 12, titolo: 'Cominciata prima' })
      ]
    });

    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-27T12:30:00.000Z')).titolo, 'Cominciata prima', 'una sola accesa');
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-27T16:00:00.000Z')).titolo, 'Cominciata prima', 'sovrapposte: vince chi e cominciata prima');
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-27T10:00:00.000Z')), null, 'non ancora cominciate');
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-29T10:00:00.000Z')), null, 'finite tutte');
    esigiUguale(O.eventoAttivo(orariBuoni(), Date.parse('2026-09-27T16:00:00.000Z')), null, 'senza eventi');
    esigiUguale(O.eventoAttivo('x', Date.parse('2026-09-27T16:00:00.000Z')), null, 'ramo storto');
  });

  await prova('programmaSostituito: l evento acceso si prende i giorni che gli finiscono sotto, non gli altri', () => {

    const orari = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' })]
    });
    const dentro = O.programmaSostituito(orari, Date.parse('2026-09-27T16:00:00.000Z'));
    esigiUguale(dentro.evento.titolo, 'Maratona', 'l evento acceso');
    esigiUguale(dentro.giorni.join(','), 'true,false,false,false,false,false,false', 'solo la domenica');

    const mattina = O.programmaSostituito(orari, Date.parse('2026-09-27T10:00:00.000Z'));
    esigiUguale(mattina.evento.titolo + ' ' + mattina.giorni.join(','), 'Maratona true,false,false,false,false,false,false', 'dalla mezzanotte del suo giorno');

    const prima = O.programmaSostituito(orari, Date.parse('2026-09-26T21:00:00.000Z'));
    esigiUguale(prima.evento + ' ' + prima.giorni.join(','), 'null false,false,false,false,false,false,false', 'evento non ancora acceso');

    const dopo = O.programmaSostituito(orari, Date.parse('2026-09-28T02:00:00.000Z'));
    esigiUguale(dopo.evento + ' ' + dopo.giorni.join(','), 'null false,false,false,false,false,false,false', 'evento finito');
  });

  await prova('programmaSostituito: sfiorarsi non e sovrapporsi, e un evento senza fine nota li copre tutti', () => {

    const attaccati = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-27', ora: '13:00', durataOre: 8, titolo: 'Fino alle 21' })]
    });
    esigiUguale(O.programmaSostituito(attaccati, Date.parse('2026-09-27T16:00:00.000Z')).giorni.join(','),
      'false,false,false,false,false,false,false', 'una finestra che finisce dove l altra comincia');

    const aperto = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-27', ora: '15:00', durataOre: null, titolo: 'Maratona aperta' })]
    });
    esigiUguale(O.programmaSostituito(aperto, Date.parse('2026-09-28T10:00:00.000Z')).giorni.join(','),
      'true,true,false,true,false,true,false', 'tutti e quattro i giorni di diretta');
  });

  await prova('convalida: gli errori della schedule portano la chiave della casella e i messaggi di orari.js', () => {
    const documento = copia(contenutiVeri);
    documento.config.orari.schede[1].ora = '9:00';
    documento.config.orari.eventi = [evento({ data: '2026-02-30' })];
    documento.config.orari.sfondo.intensita = 150;
    const errori = convalida.convalida(documento);
    esigiUguale(errori.map((e) => e.chiave).join(', '), 'config.orari.schede.1.ora, config.orari.eventi.0.data, config.orari.sfondo.intensita', 'chiavi');
    esigiUguale(errori.map((e) => e.percorso).join(', '), 'schede.1.ora, eventi.0.data, sfondo.intensita', 'percorsi');
    const attesi = O.problemi(documento.config.orari).map((p) => p.messaggio);
    esigiUguale(JSON.stringify(errori.map((e) => e.messaggio)), JSON.stringify(attesi), 'i messaggi non sono quelli di orari.js');
    const vecchio = copia(contenutiVeri);
    vecchio.config.orari = { giorni: [1, 3, 5, 0], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 };
    esigiUguale(convalida.convalida(vecchio).length, 0, 'un contenuti.json con la schedule di prima');
    esigiUguale(convalida.convalidaCampo('config.orari', 'x')[0].chiave, 'config.orari', 'errore del ramo intero');
  });

  const documentoRicco = () => {
    const documento = copia(contenutiVeri);
    const orari = documento.config.orari;
    orari.giorni = [1, 3, 0];
    Object.assign(orari.schede[1], { ora: '', titolo: 'Horror', gioco: 'Silent Hill f', immagine: 'contenuti/media/locandina.webp', fuoco: { x: 30, y: 20 }, velo: 45 });
    Object.assign(orari.schede[3], { ora: '18:30', durataOre: 2.5, nota: 'Co-op con la chat' });
    Object.assign(orari.schede[0], { ora: '16:00', durataOre: 6 });
    Object.assign(orari.schede[2], { ora: '10:00', titolo: 'Spento', immagine: 'img/spento.webp' });
    orari.eventi = [
      evento({ data: '2026-10-03', ora: '21:00', durataOre: 3, titolo: 'Speciale ottobre', gioco: 'Quiz' }),
      evento({ data: '2026-09-01', ora: '15:00', durataOre: 4, titolo: 'Finito' }),
      evento({ data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona', nota: 'Dodici ore', immagine: 'contenuti/media/spoiler-maratona.webp', fuoco: { x: 50, y: 10 } })
    ];
    orari.sfondo = { immagine: 'img/settimana-sfondo.webp', fuoco: { x: 40, y: 60 }, intensita: 25 };
    return documento;
  };
  const ADESSO = Date.parse('2026-09-20T10:00:00.000Z');

  await prova('contesto settimana: ora e fine per giorno, riposo senza contenuti, stile solo con l immagine', () => {
    const contesto = costruisci.costruisciContesto(documentoRicco(), { adesso: ADESSO });
    const per = {};
    for (const voce of contesto.settimana) { per[voce.indice] = voce; }
    esigiUguale(contesto.settimana.map((v) => v.indice).join(','), '1,2,3,4,5,6,0', 'ordine');
    const chiavi = 'indice,abbr,nome,diretta,ora,fine,tag,titolo,gioco,nota,contenuto,sostituito,immagine,stile,saltata,motivoSaltata';
    esigi(contesto.settimana.every((v) => Object.keys(v).join(',') === chiavi), 'le voci non hanno i nomi del contratto');
    const lun = per[1];
    esigiUguale([lun.diretta, lun.ora, lun.fine, lun.tag, lun.titolo, lun.gioco, lun.contenuto, lun.immagine, lun.stile].join('|'),
      'true|21:00|01:00|Diretta|Horror|Silent Hill f|true|contenuti/media/locandina.webp|--fuoco: 30% 20%; --velo: 0.45', 'lunedi');
    const mer = per[3];
    esigiUguale([mer.ora, mer.fine, mer.nota, mer.contenuto, mer.immagine, mer.stile].join('|'), '18:30|21:00|Co-op con la chat|true||', 'mercoledi senza immagine');
    const dom = per[0];
    esigiUguale([dom.ora, dom.fine, dom.contenuto, dom.stile].join('|'), '16:00|22:00|false|', 'domenica senza testi');
    const mar = per[2];
    esigiUguale([mar.diretta, mar.ora, mar.fine, mar.tag, mar.titolo, mar.contenuto, mar.immagine, mar.stile].join('|'),
      'false|||Riposo||false||', 'un giorno spento non stampa la sua scheda');
    esigiUguale(contesto.config.orari.schede.length, 7, 'config.orari del contesto e normalizzato');
  });

  await prova('sito.eventi: il passato non c e, gli altri per inizio, con la data in italiano e gli istanti in UTC', () => {
    const contesto = costruisci.costruisciContesto(documentoRicco(), { adesso: ADESSO });
    const eventi = contesto.sito.eventi;
    esigiUguale(contesto.sito.haEventi, true, 'haEventi');
    esigiUguale(eventi.map((e) => e.indice + ':' + e.titolo).join(', '), '2:Maratona, 0:Speciale ottobre', 'eventi e ordine');
    const m = eventi[0];
    esigiUguale(Object.keys(m).join(','), 'indice,data,ora,fine,abbr,giorno,numero,mese,dataTesto,inizio,termine,titolo,gioco,nota,contenuto,immagine,stile,ultimoGiornoTesto', 'nomi del contratto');
    esigiUguale([m.data, m.ora, m.fine, m.abbr, m.giorno, m.numero, m.mese, m.dataTesto].join('|'),
      '2026-09-27|15:00|03:00|DOM|Domenica|27|set|domenica 27 settembre', 'data della maratona');
    esigiUguale(m.inizio + ' ' + m.termine, '2026-09-27T13:00:00.000Z 2026-09-28T01:00:00.000Z', 'istanti');
    esigiUguale([m.contenuto, m.immagine, m.stile].join('|'), 'true|contenuti/media/spoiler-maratona.webp|--fuoco: 50% 10%; --velo: 0.6', 'contenuto e immagine');
    const s = eventi[1];
    esigiUguale([s.numero, s.mese, s.dataTesto, s.contenuto, s.stile].join('|'), '3|ott|sabato 3 ottobre|true|', 'numero senza zero e niente stile senza immagine');
    const tutti = costruisci.costruisciContesto(documentoRicco(), { adesso: Date.parse('2027-01-01T00:00:00Z') });
    esigiUguale(tutti.sito.haEventi + ' ' + tutti.sito.eventi.length, 'false 0', 'a eventi tutti passati');

    const conQuando = costruisci.costruisciContesto(documentoRicco(), { quando: '2026-09-28T00:30:00.000Z' });
    esigiUguale(conQuando.sito.eventi.map((e) => e.titolo).join(','), 'Maratona,Speciale ottobre', 'maratona ancora in corso alle 02:30');
  });

  const documentoInMaratona = () => {
    const documento = documentoRicco();

    documento.config.orari.eventi = [evento({ data: '2026-09-20', ora: '09:00', durataOre: 14, titolo: 'Maratona', gioco: 'Quiz' })];
    return documento;
  };

  await prova('settimana: l evento acceso si prende il giorno, e il programma di sempre resta scritto sotto', () => {
    const contesto = costruisci.costruisciContesto(documentoInMaratona(), { adesso: ADESSO, categoriaDiretta: '' });
    const per = {};
    for (const voce of contesto.settimana) { per[voce.indice] = voce; }
    esigiUguale(per[0].sostituito, 'Maratona', 'la domenica porta il titolo dell evento');

    esigiUguale(per[0].ora + '|' + per[0].fine, '16:00|22:00', 'l orario regolare resta scritto');
    esigiUguale(contesto.settimana.filter((v) => v.sostituito).length, 1, 'un giorno solo');
    esigiUguale(per[1].sostituito + '|' + per[3].sostituito, '|', 'i giorni fuori dall evento non cambiano');

    const normale = costruisci.costruisciContesto(documentoRicco(), { adesso: ADESSO, categoriaDiretta: '' });
    esigiUguale(normale.settimana.filter((v) => v.sostituito).length, 0, 'senza evento acceso');
  });

  await prova('sito.eventi: l evento acceso mostra la categoria vera di Twitch, gli altri il gioco scritto a mano', () => {
    const documento = documentoInMaratona();
    documento.config.orari.eventi.push(evento({ data: '2026-10-03', ora: '21:00', durataOre: 3, titolo: 'Dopo', gioco: 'Quiz di ottobre' }));
    const conTwitch = costruisci.costruisciContesto(documento, { adesso: ADESSO, categoriaDiretta: ' Elden Ring ' });
    esigiUguale(conTwitch.sito.eventi.map((e) => e.titolo + ':' + e.gioco).join(', '),
      'Maratona:Elden Ring, Dopo:Quiz di ottobre', 'solo l evento acceso prende la categoria');

    const senza = costruisci.costruisciContesto(documento, { adesso: ADESSO, categoriaDiretta: '' });
    esigiUguale(senza.sito.eventi.map((e) => e.titolo + ':' + e.gioco).join(', '),
      'Maratona:Quiz, Dopo:Quiz di ottobre', 'senza categoria resta il gioco scritto a mano');

    documento.config.orari.eventi[0].gioco = '';
    documento.config.orari.eventi[0].nota = '';
    esigiUguale(costruisci.costruisciContesto(documento, { adesso: ADESSO, categoriaDiretta: 'Elden Ring' }).sito.eventi[0].contenuto, true, 'contenuto con la sola categoria');
    esigiUguale(costruisci.costruisciContesto(documento, { adesso: ADESSO, categoriaDiretta: '' }).sito.eventi[0].contenuto, false, 'contenuto senza niente');
  });

  await prova('categoriaDiretta: si usa solo se e fresca, e solo se il canale e davvero acceso', () => {
    const scritta = (aggiunte) => Object.assign({ categoria: 'Elden Ring', inOnda: true, letteIl: new Date(ADESSO).toISOString() }, aggiunte || {});
    const con = (dati) => {
      twitch.salvaDiretta(dati);
      try { return costruisci.categoriaDiretta({}, ADESSO); }
      finally { try { fs.unlinkSync(P.direttaTwitch); } catch (e) {} }
    };
    esigiUguale(con(scritta()), 'Elden Ring', 'lettura appena fatta');
    esigiUguale(con(scritta({ inOnda: false, categoria: '' })), '', 'canale spento');
    esigiUguale(con(scritta({ letteIl: new Date(ADESSO - 60 * 60 * 1000).toISOString() })), '', 'lettura di un ora fa');
    esigiUguale(con(scritta({ letteIl: 'boh' })), '', 'istante illeggibile');
    esigiUguale(costruisci.categoriaDiretta({}, ADESSO), '', 'senza il file non si sa niente');

    esigiUguale(costruisci.categoriaDiretta({ categoriaDiretta: '  Hollow Knight  ' }, ADESSO), 'Hollow Knight', 'scelta esplicita');
  });

  await prova('sito.settimanaSfondo: stile con intensita, spento a 0 o senza immagine', () => {
    const documento = documentoRicco();
    esigiUguale(JSON.stringify(costruisci.costruisciContesto(documento, { adesso: ADESSO }).sito.settimanaSfondo),
      JSON.stringify({ immagine: 'img/settimana-sfondo.webp', stile: '--fuoco: 40% 60%; --intensita: 0.25' }), 'fondale acceso');
    documento.config.orari.sfondo.intensita = 0;
    esigiUguale(JSON.stringify(costruisci.costruisciContesto(documento, { adesso: ADESSO }).sito.settimanaSfondo),
      JSON.stringify({ immagine: '', stile: '' }), 'intensita 0');
    documento.config.orari.sfondo = { immagine: '', fuoco: { x: 1, y: 2 }, intensita: 80 };
    esigiUguale(costruisci.costruisciContesto(documento, { adesso: ADESSO }).sito.settimanaSfondo.immagine, '', 'senza immagine');
    delete documento.config.orari.sfondo;
    esigiUguale(costruisci.costruisciContesto(documento, { adesso: ADESSO }).sito.settimanaSfondo.stile, '', 'ramo senza fondale');
  });

  await prova('sito.orariTesto: stessa ora in una frase, ore diverse giorno per giorno', () => {
    const documento = documentoRicco();
    esigiUguale(costruisci.orariTesto(documento.config), 'Lunedì alle 21:00, mercoledì alle 18:30 e domenica alle 16:00', 'ore diverse');
    documento.config.orari.schede[3].ora = '21:00';
    documento.config.orari.schede[0].ora = '';
    esigiUguale(costruisci.orariTesto(documento.config), 'Lunedì, mercoledì e domenica alle 21:00', 'la stessa ora scritta anche nella scheda');
    documento.config.orari.giorni = [5];
    esigiUguale(costruisci.orariTesto(documento.config), 'Venerdì alle 21:00', 'un giorno solo');
    documento.config.orari.giorni = [6, 2];
    documento.config.orari.schede[2].ora = '10:00';
    esigiUguale(costruisci.orariTesto(documento.config), 'Martedì alle 10:00 e sabato alle 21:00', 'due giorni, ordine da lunedi');
  });

  await prova('js/dati.js: ore, durate ed eventi futuri per il conto alla rovescia, e i testi nuovi', () => {
    const reso = costruisci.rendi(documentoRicco(), { adesso: ADESSO });
    const dati = JSON.parse(reso.dati.slice(reso.dati.indexOf('{'), reso.dati.lastIndexOf('}') + 1));
    const o = dati.orari;
    esigiUguale(Object.keys(o).join(','), 'giorni,ora,fuso,durataOre,ore,durate,eventi', 'chiavi del ramo orari');
    esigiUguale(o.giorni.join(',') + ' ' + o.ora + ' ' + o.fuso + ' ' + o.durataOre, '1,3,0 21:00 Europe/Rome 4', 'i quattro campi di sempre');
    esigiUguale(JSON.stringify(o.ore), JSON.stringify({ 0: '16:00', 1: '21:00', 3: '18:30' }), 'ore');
    esigiUguale(JSON.stringify(o.durate), JSON.stringify({ 0: 6, 1: 4, 3: 2.5 }), 'durate');
    esigiUguale(JSON.stringify(o.eventi), JSON.stringify([
      { indice: 2, data: '2026-09-27', inizio: '2026-09-27T13:00:00.000Z', termine: '2026-09-28T01:00:00.000Z', titolo: 'Maratona' },
      { indice: 0, data: '2026-10-03', inizio: '2026-10-03T19:00:00.000Z', termine: '2026-10-03T22:00:00.000Z', titolo: 'Speciale ottobre' }
    ]), 'eventi');
    esigiUguale([dati.testi.etichettaInOnda, dati.testi.etichettaDaTe, dati.testi.etichettaEvento].join('|'), 'In onda|Da te|Speciale', 'testi nuovi');

    esigiUguale(reso.contesto.sito.eventi.map((e) => e.inizio).join(','), o.eventi.map((e) => e.inizio).join(','), 'pagina e dati.js');
  });

  await prova('la pagina si rende con una schedule piena, con una a meta e senza immagini esterne', () => {
    const piena = costruisci.rendi(documentoRicco(), { adesso: ADESSO });
    esigi(piena.html.indexOf('{{') === -1, 'segnaposto rimasti nella pagina');
    esigiDentro(piena.html, 'id="settimana"', 'la sezione');
    esigiUguale((piena.html.match(/data-giorno="\d"/g) || []).length, 7, 'sette giorni');
    const storta = copia(contenutiVeri);
    storta.config.orari = {
      giorni: 'tutti', ora: 'presto', fuso: 42, schede: [{ titolo: '<script>alert(1)</script>', immagine: 'javascript:alert(1)' }, 'x'],
      eventi: [{ data: '2026-09-27', ora: '15:00', durataOre: 3, titolo: 'Evento <b>', immagine: 'https://altrosito.it/a.png' }],
      sfondo: { immagine: '"><img src=x onerror=alert(1)>', intensita: 'tanta' }
    };
    const resa = costruisci.rendi(storta, { adesso: ADESSO });
    esigi(resa.html.indexOf('altrosito.it') === -1 && resa.dati.indexOf('altrosito.it') === -1, 'un indirizzo esterno e arrivato nella pagina');
    esigi(resa.html.indexOf('javascript:alert') === -1, 'uno schema javascript: e arrivato nella pagina');
    esigi(resa.html.indexOf('onerror') === -1, 'un attributo e uscito dal fondale');
    esigi(resa.html.indexOf('<script>alert(1)') === -1, 'un testo della schedule e arrivato senza escape');
    esigiUguale(convalida.convalida(storta).some((e) => e.chiave.indexOf('config.orari') === 0), true, 'la convalida doveva fermare la schedule storta');
  });

  await prova('pulisciEditor completa una schedule valida e lascia quella sbagliata alla convalida', () => {
    const buono = copia(contenutiVeri);
    buono.config.orari = { giorni: [1], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 };
    costruisci.pulisciEditor(buono);
    esigiUguale(buono.config.orari.schede.length + ' ' + buono.config.orari.eventi.length + ' ' + typeof buono.config.orari.sfondo, '7 0 object', 'schedule completata');
    const sbagliato = copia(contenutiVeri);
    sbagliato.config.orari.schede[1].titolo = 't'.repeat(45);
    costruisci.pulisciEditor(sbagliato);
    esigiUguale(sbagliato.config.orari.schede[1].titolo.length, 45, 'un titolo lungo e stato tagliato di nascosto invece di essere detto');
  });

  await prova('unisci: config.orari si sostituisce in blocco, un evento cancellato non rinasce', () => {
    esigi(archivio.RAMI_IN_BLOCCO.indexOf('orari') !== -1, 'orari non e fra i rami in blocco');
    const salvato = { testi: {}, config: { orari: Object.assign(orariBuoni(), { eventi: [evento({ titolo: 'A' }), evento({ titolo: 'B' })] }) } };
    const arrivo = { config: { orari: { giorni: [2], ora: '20:00', durataOre: 3, fuso: 'Europe/Rome', eventi: [evento({ titolo: 'A' })], sfondo: { immagine: '' } } } };
    const unito = archivio.unisci(salvato, arrivo).config.orari;
    esigiUguale(unito.eventi.map((e) => e.titolo).join(','), 'A', 'eventi');
    esigiUguale(JSON.stringify(unito.sfondo), '{"immagine":""}', 'il fondale e stato fuso con quello salvato');
    esigiUguale(unito.schede, undefined, 'le schede salvate sono rinate');
    esigiUguale(salvato.config.orari.eventi.length, 2, 'unisci ha toccato il documento salvato');
  });

  fs.copyFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), P.contenutiJson);
  const { creaServer } = require('./server.js');
  const server = creaServer();
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  const porta = server.address().port;
  const biscotto = biscottoDa(await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } }));
  const scrivi = (orari) => chiama(porta, 'PUT', '/api/contenuti', { biscotto: biscotto, json: { config: { orari: orari } } });

  try {
    await prova('PUT /api/contenuti rifiuta una schedule sbagliata con la chiave e il messaggio giusti', async () => {
      esigi(biscotto, 'accesso al server di prova non riuscito');
      const prima = fs.readFileSync(P.contenutiJson, 'utf8');
      const orari = orariBuoni();
      orari.schede[1].ora = '9:00';
      orari.schede[5].nota = 'n'.repeat(121);
      orari.eventi = [evento({ data: '2026-02-30', titolo: '' })];
      orari.sfondo.intensita = 150;
      const r = await scrivi(orari);
      esigiUguale(r.stato, 422, 'stato');
      const trovati = r.dati.errori.map((e) => e.chiave + ' = ' + e.messaggio);
      const attesi = [
        'config.orari.schede.1.ora = L\'ora di lunedì va scritta come 21:00.',
        'config.orari.schede.5.nota = La nota di venerdì supera i 120 caratteri: adesso sono 121.',
        'config.orari.eventi.0.data = La data dell\'evento numero 1 non esiste nel calendario: 2026-02-30.',
        'config.orari.eventi.0.titolo = Il titolo dell\'evento numero 1 non può restare vuoto.',
        'config.orari.sfondo.intensita = L\'intensità del fondale deve essere un numero intero da 0 a 100.'
      ];
      esigiUguale(JSON.stringify(trovati), JSON.stringify(attesi), 'errori');
      esigiUguale(fs.readFileSync(P.contenutiJson, 'utf8'), prima, 'contenuti.json e stato toccato');
    });

    await prova('PUT /api/contenuti rifiuta un percorso esterno nella schedule', async () => {
      const orari = orariBuoni();
      orari.schede[3].immagine = 'https://altrosito.it/locandina.png';
      orari.eventi = [evento({ immagine: '../server/dati/auth.json' })];
      orari.sfondo.immagine = 'img/../../fuori.png';
      const r = await scrivi(orari);
      esigiUguale(r.stato, 422, 'stato');
      esigiUguale(r.dati.errori.map((e) => e.chiave).join(', '), 'config.orari.schede.3.immagine, config.orari.eventi.0.immagine, config.orari.sfondo.immagine', 'chiavi');
      esigi(fs.readFileSync(P.contenutiJson, 'utf8').indexOf('altrosito.it') === -1, 'il percorso esterno e finito su disco');
    });

    await prova('PUT /api/contenuti completa una schedule di prima e tiene un evento passato', async () => {
      const r = await scrivi({ giorni: [1, 3], ora: '20:30', fuso: 'Europe/Rome', durataOre: 3.5, eventi: [evento({ data: '2020-05-01', titolo: 'Vecchio' })] });
      esigiUguale(r.stato, 200, 'stato');
      const salvato = JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8')).config.orari;
      esigiUguale(Object.keys(salvato).join(','), 'giorni,ora,durataOre,fuso,schede,eventi,pause,sfondo', 'forma salvata');
      esigiUguale(salvato.schede.length + ' ' + salvato.eventi.length + ' ' + salvato.eventi[0].titolo, '7 1 Vecchio', 'schede ed evento passato');
      esigiUguale(salvato.sfondo.immagine, '', 'un fondale mai mandato non rinasce dal disco');
      const pagina = await chiama(porta, 'GET', '/api/anteprima', { biscotto: biscotto });
      esigi(pagina.testo.indexOf('Vecchio') === -1, 'un evento passato compare nella pagina');
    });

    await prova('un immagine usata in una scheda, in un evento o nel fondale non si cancella', async () => {
      fs.mkdirSync(P.media, { recursive: true });
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      for (const nome of ['giorno.png', 'evento.png', 'fondale.png']) { fs.writeFileSync(path.join(P.media, nome), png); }
      const orari = orariBuoni();
      orari.schede[5].immagine = 'contenuti/media/giorno.png';
      orari.eventi = [evento({ immagine: 'contenuti/media/evento.png' })];
      orari.sfondo.immagine = 'contenuti/media/fondale.png';
      esigiUguale((await scrivi(orari)).stato, 200, 'salvataggio della schedule con le immagini');
      const attese = { 'giorno.png': 'config.orari.schede.5.immagine', 'evento.png': 'config.orari.eventi.0.immagine', 'fondale.png': 'config.orari.sfondo.immagine' };
      for (const nome of Object.keys(attese)) {
        const r = await chiama(porta, 'DELETE', '/api/media/' + nome, { biscotto: biscotto });
        esigiUguale(r.stato, 409, 'stato per ' + nome);
        esigi(Array.isArray(r.dati.usatoDa) && r.dati.usatoDa.indexOf(attese[nome]) !== -1, nome + ': non dice che la usa ' + attese[nome]);
        esigi(fs.existsSync(path.join(P.media, nome)), nome + ' e stata cancellata lo stesso');
      }

      orari.schede[5].immagine = '';
      esigiUguale((await scrivi(orari)).stato, 200, 'salvataggio senza l immagine del giorno');
      esigiUguale((await chiama(porta, 'DELETE', '/api/media/giorno.png', { biscotto: biscotto })).stato, 200, 'cancellazione dopo averla tolta');
    });

    await prova('POST /api/anteprima rende la schedule non salvata, senza indirizzi esterni', async () => {
      const orari = orariBuoni();
      orari.schede[1] = Object.assign(O.schedaVuota(), { titolo: 'Locandina di prova', immagine: 'https://altrosito.it/x.png' });
      const r = await chiama(porta, 'POST', '/api/anteprima', { biscotto: biscotto, json: { editor: true, contenuti: { config: { orari: orari } } } });
      esigiUguale(r.stato, 200, 'stato');
      esigi(r.testo.indexOf('altrosito.it') === -1, 'l indirizzo esterno e arrivato nell anteprima');
      esigiDentro(r.testo, '<base href="/">', 'pagina per l editor');
    });
  } finally {
    await new Promise((risolvi) => server.close(risolvi));
    fs.copyFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), P.contenutiJson);
  }
}

function lanciaFiglio(script, argomenti, ambiente) {
  const env = Object.assign({}, process.env);
  for (const nome of Object.keys(ambiente || {})) {
    if (ambiente[nome] === undefined) { delete env[nome]; } else { env[nome] = String(ambiente[nome]); }
  }
  const esito = spawnSync(process.execPath, [script].concat(argomenti || []),
    { env: env, encoding: 'utf8', timeout: 30000 });
  const righe = String(esito.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  return {
    stato: esito.status,
    fuori: String(esito.stdout || ''),
    errori: String(esito.stderr || ''),
    ultima: righe.length ? righe[righe.length - 1] : ''
  };
}

async function proveHosting(cartella) {
  apriSezione('12. Avvio su un hosting (CONTRATTO-6, agente NODO)');

  const APP_JS = path.join(RADICE_VERA, 'app.js');
  const SERVER_JS = path.join(RADICE_VERA, 'server', 'server.js');

  const scriptPorte = path.join(cartella, 'figlio-porte.js');
  fs.writeFileSync(scriptPorte, [
    "'use strict';",
    'const dove = process.argv[2];',
    'const casi = JSON.parse(process.argv[3]);',
    'const fuori = [];',
    'for (const caso of casi) {',
    "  for (const nome of ['PORT', 'SB_PORTA', 'SB_HOST']) { delete process.env[nome]; }",
    '  Object.assign(process.env, caso.env);',
    '  delete require.cache[require.resolve(dove)];',
    '  const modulo = require(dove);',
    '  fuori.push({ nome: caso.nome, porta: modulo.PORTA, host: modulo.HOST });',
    '}',
    'console.log(JSON.stringify(fuori));',
    ''
  ].join('\n'), 'utf8');

  const scriptAvvio = path.join(cartella, 'figlio-avvio.js');
  fs.writeFileSync(scriptAvvio, [
    "'use strict';",
    'require(process.argv[2]);',
    'const giugno = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));',
    "console.log(JSON.stringify({ tz: process.env.TZ || '', ore: giugno.getHours(), host: process.env.SB_HOST || '' }));",
    'process.exit(0);',
    ''
  ].join('\n'), 'utf8');

  await prova('la porta: PORT vince su SB_PORTA, e una PORT non numerica non vince niente', () => {
    const casi = [
      { nome: 'niente', env: {} },
      { nome: 'solo SB_PORTA', env: { SB_PORTA: '4174' } },
      { nome: 'PORT e SB_PORTA', env: { PORT: '5000', SB_PORTA: '4174' } },

      { nome: 'PORT non numerica', env: { PORT: '/tmp/passenger.sock', SB_PORTA: '4174' } },
      { nome: 'indirizzo da SB_HOST', env: { SB_HOST: '0.0.0.0' } }
    ];
    const esito = lanciaFiglio(scriptPorte, [SERVER_JS, JSON.stringify(casi)],
      { PORT: undefined, SB_PORTA: undefined, SB_HOST: undefined, SB_DATI: undefined, SB_BACKUP: undefined });
    esigiUguale(esito.stato, 0, 'il figlio e uscito male: ' + esito.errori);
    const letti = JSON.parse(esito.ultima);
    const atteso = [[4173, '127.0.0.1'], [4174, '127.0.0.1'], [5000, '127.0.0.1'], [4174, '127.0.0.1'], [4173, '0.0.0.0']];
    for (let i = 0; i < casi.length; i++) {
      esigiUguale(letti[i].porta, atteso[i][0], 'porta nel caso «' + casi[i].nome + '»');
      esigiUguale(letti[i].host, atteso[i][1], 'indirizzo nel caso «' + casi[i].nome + '»');
    }
  });

  await prova('app.js impone Europe/Rome e 0.0.0.0, ma non sopra a chi ha gia scelto', () => {

    const senzaFuso = lanciaFiglio(scriptAvvio, [APP_JS],
      { TZ: undefined, SB_HOST: undefined, PORT: '4299', SB_DATI: undefined, SB_BACKUP: undefined });
    esigiUguale(senzaFuso.stato, 0, 'il figlio e uscito male: ' + senzaFuso.errori);
    const primo = JSON.parse(senzaFuso.ultima);
    esigiUguale(primo.tz, 'Europe/Rome', 'fuso di partenza');

    esigiUguale(primo.ore, 14, 'ora italiana del 15 giugno 2026, mezzogiorno UTC');
    esigiUguale(primo.host, '0.0.0.0', 'indirizzo di ascolto di partenza da app.js');

    const conFuso = lanciaFiglio(scriptAvvio, [APP_JS],
      { TZ: 'UTC', SB_HOST: '127.0.0.1', PORT: '4299', SB_DATI: undefined, SB_BACKUP: undefined });
    esigiUguale(conFuso.stato, 0, 'il figlio e uscito male: ' + conFuso.errori);
    const secondo = JSON.parse(conFuso.ultima);
    esigiUguale(secondo.tz, 'UTC', 'il fuso di chi lo ha scelto deve vincere');
    esigiUguale(secondo.ore, 12, 'ora UTC');
    esigiUguale(secondo.host, '127.0.0.1', 'SB_HOST scritta a mano deve vincere');
  });

  await prova('SB_DATI e SB_BACKUP portano password, chiavi e backup fuori dal sito', () => {

    const fuori = path.join(cartella, 'segreti-fuori');
    const copie = path.join(cartella, 'backup-fuori');
    const prima = { dati: 'x', auth: 'x', chiavi: 'x', accessoTwitch: 'x', backup: 'x' };
    const sbDati = process.env.SB_DATI;
    const sbBackup = process.env.SB_BACKUP;
    try {
      process.env.SB_DATI = fuori;
      process.env.SB_BACKUP = copie;
      const dopo = percorsi.applicaAmbiente(Object.assign({}, prima));
      esigiUguale(dopo.dati, path.resolve(fuori), 'cartella dei dati');
      esigiUguale(dopo.auth, path.join(path.resolve(fuori), 'auth.json'), 'auth.json');
      esigiUguale(dopo.chiavi, path.join(path.resolve(fuori), 'chiavi.js'), 'chiavi.js');
      esigiUguale(dopo.accessoTwitch, path.join(path.resolve(fuori), 'twitch-accesso.json'), 'twitch-accesso.json');
      esigiUguale(dopo.direttaTwitch, path.join(path.resolve(fuori), 'twitch-diretta.json'), 'twitch-diretta.json');
      esigiUguale(dopo.backup, path.resolve(copie), 'cartella dei backup');

      esigi(fs.existsSync(fuori) && fs.existsSync(copie), 'le cartelle indicate non sono state create');

      delete process.env.SB_DATI;
      delete process.env.SB_BACKUP;
      esigiUguale(JSON.stringify(percorsi.applicaAmbiente(Object.assign({}, prima))), JSON.stringify(prima),
        'senza le variabili qualcosa si e mosso lo stesso');
    } finally {
      if (sbDati === undefined) { delete process.env.SB_DATI; } else { process.env.SB_DATI = sbDati; }
      if (sbBackup === undefined) { delete process.env.SB_BACKUP; } else { process.env.SB_BACKUP = sbBackup; }
    }
  });

  await prova('una SB_DATI che non si puo creare ferma l avvio invece di ripiegare in silenzio', () => {

    const finto = path.join(cartella, 'non-una-cartella.txt');
    fs.writeFileSync(finto, 'sono un file', 'utf8');
    const impossibile = path.join(finto, 'dentro');
    const sbDati = process.env.SB_DATI;
    try {
      process.env.SB_DATI = impossibile;
      const err = esigiErrore(() => percorsi.applicaAmbiente({}), 'SB_DATI', 'la cartella impossibile');
      esigiUguale(err.codice, 'SB_CARTELLA', 'codice dell errore');
      esigiDentro(err.message, impossibile, 'il messaggio deve dire quale percorso');
    } finally {
      if (sbDati === undefined) { delete process.env.SB_DATI; } else { process.env.SB_DATI = sbDati; }
    }

    const figlio = lanciaFiglio(scriptAvvio, [APP_JS],
      { SB_DATI: impossibile, SB_BACKUP: undefined, PORT: '4299', SB_HOST: '127.0.0.1' });
    esigiUguale(figlio.stato, 1, 'l avvio doveva fallire');
    esigiDentro(figlio.errori, 'avvio non riuscito', 'il log deve dirlo in chiaro');
    esigiDentro(figlio.errori, 'SB_DATI', 'il log deve nominare la variabile');
  });

  await prova('percorsi.imposta() NON applica SB_DATI: il collaudo non tocca l auth.json vero', () => {

    const radiceLavoro = P.radice;
    const fuori = path.join(cartella, 'segreti-da-non-usare');
    const sbDati = process.env.SB_DATI;
    try {
      process.env.SB_DATI = fuori;
      percorsi.imposta(radiceLavoro);
      esigiUguale(P.auth, path.join(radiceLavoro, 'server', 'dati', 'auth.json'), 'auth.json dopo imposta()');
      esigiUguale(P.backup, path.join(radiceLavoro, 'server', 'backup'), 'backup dopo imposta()');
    } finally {
      if (sbDati === undefined) { delete process.env.SB_DATI; } else { process.env.SB_DATI = sbDati; }
      percorsi.imposta(radiceLavoro);
    }
  });

  await prova('creaServer: i tempi di pazienza e la sveglia sulla connessione muta', () => {
    const { creaServer } = require('./server.js');
    const server = creaServer();
    try {
      esigiUguale(server.headersTimeout, 30 * 1000, 'headersTimeout');
      esigiUguale(server.requestTimeout, 3 * 60 * 1000, 'requestTimeout');
      esigiUguale(server.keepAliveTimeout, 15 * 1000, 'keepAliveTimeout');
      esigiUguale(server.connectionsCheckingInterval, 5 * 1000, 'connectionsCheckingInterval');

      esigi(server.keepAliveTimeout < server.headersTimeout, 'il keep-alive non sta sotto alle intestazioni');

      esigi(server.listenerCount('connection') >= 1, 'nessuna sveglia sulla connessione');
      esigi(server.listenerCount('request') >= 1, 'nessuno spegne la sveglia alla prima richiesta');
    } finally {
      server.close(() => {});
    }
  });
}

async function proveUscita(costruisci, archivio) {
  apriSezione('13. Pagina pulita e indirizzo del sito (agente USCITA)');

  const SITO = 'https://slayerbeard.com';

  await prova('togliCommenti: quello che non e un commento non si tocca', () => {

    const casi = [
      ['<div title="<!-- non un commento -->">x</div>', '<div title="<!-- non un commento -->">x</div>'],
      ['<div data-x="-->">\n<!-- via -->\n</div>', '<div data-x="-->">\n</div>'],
      ['<script>var s = "<!-- no -->";\n\n\nvar t = 1;</script>', '<script>var s = "<!-- no -->";\n\n\nvar t = 1;</script>'],
      ['<style>a{}\n\n\nb{}</style>\n<!-- via -->\n<p>', '<style>a{}\n\n\nb{}</style>\n<p>'],
      ['<textarea>\n<!-- testo -->\n</textarea>', '<textarea>\n<!-- testo -->\n</textarea>'],
      ['<pre>\n\n\n  uno\n  <!-- due -->\n</pre>', '<pre>\n\n\n  uno\n  <!-- due -->\n</pre>'],
      ['<pre>a</pre>\n<!-- via -->\n<p>', '<pre>a</pre>\n<p>'],
      ['<!--[if lt IE 9]><script src="x.js"></script><![endif]-->\n<p>', '<!--[if lt IE 9]><script src="x.js"></script><![endif]-->\n<p>'],
      ['<p>\n<!-- mai chiuso\n<p>', '<p>\n<!-- mai chiuso\n<p>'],
      ['<!doctype html>\n<!-- via -->\n<html>', '<!doctype html>\n<html>'],
      ['<img alt="3 > 2">\n<!-- via -->\n<b>', '<img alt="3 > 2">\n<b>'],
      ['<p class=a>\n<!-- via -->\n<b>', '<p class=a>\n<b>']
    ];
    for (const [dentro, atteso] of casi) {
      esigiUguale(costruisci.togliCommenti(dentro), atteso, JSON.stringify(dentro));
    }
  });

  await prova('togliCommenti: i commenti veri se ne vanno senza spostare il resto', () => {

    const casi = [
      ['<a>\n  <!-- ciao -->\n  <b>', '<a>\n  <b>'],
      ['</span> <!-- x --> <span>', '</span>  <span>'],
      ['</span><!-- x --><span>', '</span><span>'],
      ['<b>testo</b> <!-- nota -->\n<i>', '<b>testo</b> \n<i>'],
      ['<a>\n  <!-- uno --><!-- due -->\n<b>', '<a>\n<b>'],
      ['<a>\r\n  <!-- x -->\r\n<b>', '<a>\r\n<b>'],
      ['<a>\n\n\n  <!-- x -->\n  \n\n  <p>', '<a>\n\n  <p>'],
      ['<a>\n  <b>ciao</b>\n</a>', '<a>\n  <b>ciao</b>\n</a>']
    ];
    for (const [dentro, atteso] of casi) {
      esigiUguale(costruisci.togliCommenti(dentro), atteso, JSON.stringify(dentro));
    }
  });

  await prova('index.html generato non contiene nemmeno un <!--', () => {
    const html = fs.readFileSync(P.indexHtml, 'utf8');
    esigiUguale((html.match(/<!--/g) || []).length, 0, 'commenti rimasti in pagina');

    esigiDentro(html, '<!doctype html>', 'doctype');
    esigiDentro(html, '<html lang="it">', 'apertura della pagina');

  });

  await prova('normalizzaIndirizzo: con o senza barra, con o senza schema, e lo stesso', () => {
    for (const buono of ['https://slayerbeard.com', 'https://slayerbeard.com/', 'slayerbeard.com',
      '  https://slayerbeard.com  ', 'HTTPS://SlayerBeard.com', 'https://slayerbeard.com/?x=1#y']) {
      esigiUguale(controlli.normalizzaIndirizzo(buono), SITO + '/', buono);
    }

    for (const storto of ['', '   ', 'una frase qualunque', 'ftp://slayerbeard.com', 'javascript:alert(1)',
      'mailto:qualcuno@example.test', 'https://utente:parola@example.test/']) {
      esigiUguale(controlli.normalizzaIndirizzo(storto), '', JSON.stringify(storto));
    }
  });

  await prova('config.sitoUrl vince su SB_SITO, e senza campo vale l ambiente', () => {
    const sbSito = process.env.SB_SITO;
    try {
      process.env.SB_SITO = 'https://dall-ambiente.example';
      const conCampo = controlli.indirizzoSito({ sitoUrl: SITO });
      esigiUguale(conCampo.indirizzo, SITO + '/', 'il campo del pannello deve vincere');
      esigiUguale(conCampo.host, 'slayerbeard.com', 'host');
      esigiUguale(conCampo.dallAmbiente, false, 'dallAmbiente');

      const senzaCampo = controlli.indirizzoSito({ sitoUrl: '' });
      esigiUguale(senzaCampo.indirizzo, 'https://dall-ambiente.example/', 'senza campo vale SB_SITO');
      esigiUguale(senzaCampo.dallAmbiente, true, 'dallAmbiente');

      esigiUguale(controlli.indirizzoSito({ sitoUrl: 'non un indirizzo' }).indirizzo,
        'https://dall-ambiente.example/', 'campo storto');

      delete process.env.SB_SITO;
      esigiUguale(controlli.indirizzoSito({ sitoUrl: '' }).indirizzo, '', 'senza niente non c e indirizzo');
    } finally {
      if (sbSito === undefined) { delete process.env.SB_SITO; } else { process.env.SB_SITO = sbSito; }
    }
  });

  await prova('con o senza barra finale la pagina esce identica, e contenuti.json non si prende niente', () => {
    const documento = archivio.leggi();

    const opzioni = { adesso: Date.UTC(2026, 8, 17, 10, 0, 0) };
    documento.config.sitoUrl = SITO;
    const senza = costruisci.rendi(documento, opzioni).html;
    esigiUguale(documento.config.sitoUrl, SITO, 'la resa ha riscritto il documento');
    documento.config.sitoUrl = SITO + '/';
    const con = costruisci.rendi(documento, opzioni).html;
    esigiUguale(con, senza, 'la barra finale cambia la pagina');
    esigiDentro(senza, '<link rel="canonical" href="' + SITO + '/">', 'canonico');
    esigiDentro(senza, '<meta property="og:url" content="' + SITO + '/">', 'og:url');
  });

  await prova('sitemap e robots.txt dicono lo stesso indirizzo del canonico', () => {

    const robots = path.join(P.radice, 'robots.txt');
    fs.writeFileSync(robots, 'User-agent: *\nAllow: /\nDisallow: /pannello/\n', 'utf8');
    const documento = archivio.leggi();
    documento.config.sitoUrl = SITO;
    archivio.salva(documento);

    const esito = costruisci.genera();

    esigiUguale(esito.scritti.map((s) => s.file).join(', '), 'index.html, js/dati.js, css/tema.css', 'gli scritti restano tre');
    esigi(esito.sitemap && esito.sitemap.file === 'sitemap.xml', 'la sitemap non e in esito.sitemap');
    esigiUguale(esito.sitemap.indirizzo, SITO + '/', 'indirizzo della sitemap');
    esigiUguale(esito.sitemap.robots, 'aggiornato', 'riga in robots.txt');

    const mappa = fs.readFileSync(path.join(P.radice, 'sitemap.xml'), 'utf8');
    esigiDentro(mappa, '<loc>' + SITO + '/</loc>', 'loc della sitemap');
    esigiDentro(mappa, '<lastmod>' + String(esito.aggiornatoIl).slice(0, 10) + '</lastmod>', 'lastmod');

    const scritte = (voce) => (voce && voce.stato === 'scritta') ? 1 : 0;
    const pagine = 1 + scritte(esito.paginaClip) + scritte(esito.paginaSponsor) + scritte(esito.paginaGiochi);
    esigiUguale((mappa.match(/<url>/g) || []).length, pagine, 'una riga per ogni pagina pubblicata');

    const testoRobots = fs.readFileSync(robots, 'utf8');
    esigiDentro(testoRobots, 'Sitemap: ' + SITO + '/sitemap.xml', 'la riga Sitemap:');
    esigiDentro(fs.readFileSync(P.indexHtml, 'utf8'), '<link rel="canonical" href="' + SITO + '/">', 'canonico');

    costruisci.genera();
    esigiUguale((fs.readFileSync(robots, 'utf8').match(/^[ \t]*Sitemap[ \t]*:/gim) || []).length, 1, 'righe Sitemap:');
  });

  await prova('i domini del player prendono host e www, e senza doppioni', () => {

    const documento = archivio.leggi();
    documento.config.sitoUrl = SITO;
    documento.config.twitch.domini = ['slayerbeard.com', 'prova.example'];
    const domini = costruisci.oggettoDati(documento).twitch.domini;
    esigiUguale(domini.join(','), 'slayerbeard.com,prova.example,www.slayerbeard.com,localhost,127.0.0.1', 'elenco dei domini');
    esigiUguale(new Set(domini).size, domini.length, 'ci sono doppioni');

    documento.config.twitch.domini = [];
    esigiUguale(costruisci.oggettoDati(documento).twitch.domini.join(','),
      'slayerbeard.com,www.slayerbeard.com,localhost,127.0.0.1', 'domini con il campo vuoto');
  });

  await prova('senza indirizzo non si scrive nessuna sitemap e non si protesta', () => {
    const sbSito = process.env.SB_SITO;
    delete process.env.SB_SITO;
    const mappa = path.join(P.radice, 'sitemap.xml');
    const robots = path.join(P.radice, 'robots.txt');
    const primaRobots = fs.readFileSync(robots, 'utf8');
    try {
      fs.rmSync(mappa, { force: true });
      const documento = archivio.leggi();
      documento.config.sitoUrl = '';
      archivio.salva(documento);
      const esito = costruisci.genera();
      esigiUguale(esito.sitemap, null, 'esito.sitemap');
      esigi(!fs.existsSync(mappa), 'sitemap.xml scritta senza sapere l indirizzo');
      esigiUguale(fs.readFileSync(robots, 'utf8'), primaRobots, 'robots.txt toccato senza indirizzo');

      esigiDentro(fs.readFileSync(P.indexHtml, 'utf8'), '<link rel="canonical" href="./">', 'canonico di ripiego');
    } finally {
      if (sbSito !== undefined) { process.env.SB_SITO = sbSito; }
      const documento = archivio.leggi();
      documento.config.sitoUrl = SITO;
      archivio.salva(documento);
      costruisci.genera();
    }
  });
}

function richiestaFinta(ip, intestazioni) {
  return { headers: Object.assign({}, intestazioni || {}), socket: { remoteAddress: ip } };
}

async function provePannelloEsposto() {
  apriSezione('14. Il pannello esposto a internet (agente SCUDO)');

  const auth = require('./lib/autenticazione');
  const statico = require('./lib/statico');
  const dietroProxyPrima = process.env.SB_DIETRO_PROXY;
  const primoAccessoPrima = process.env.SB_PRIMO_ACCESSO;

  const rimettiAmbiente = () => {
    if (dietroProxyPrima === undefined) { delete process.env.SB_DIETRO_PROXY; } else { process.env.SB_DIETRO_PROXY = dietroProxyPrima; }
    if (primoAccessoPrima === undefined) { delete process.env.SB_PRIMO_ACCESSO; } else { process.env.SB_PRIMO_ACCESSO = primoAccessoPrima; }
  };

  try {
    await prova('X-Forwarded-For non conta se non si dichiara di stare dietro un proxy', () => {
      delete process.env.SB_DIETRO_PROXY;
      esigiUguale(auth.dietroProxy(), false, 'dietroProxy');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '9.9.9.9' })),
        '127.0.0.1', 'in locale l intestazione non deve spostare niente');
    });

    await prova('con SB_DIETRO_PROXY=1 vale l ultimo salto, non il primo', () => {

      process.env.SB_DIETRO_PROXY = '1';
      esigiUguale(auth.dietroProxy(), true, 'dietroProxy');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })),
        '203.0.113.7', 'ultimo salto');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '1.1.1.1, 198.51.100.4' })),
        '198.51.100.4', 'un altro cliente, un altro indirizzo');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', {})), '127.0.0.1', 'senza intestazione vale la connessione');
    });

    await prova('l indirizzo si normalizza: via la porta e il prefisso ::ffff:', () => {

      process.env.SB_DIETRO_PROXY = '1';
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('::ffff:10.0.0.7', {})), '10.0.0.7', 'IPv4 mappato');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '[2001:db8::1]:443' })),
        '2001:db8::1', 'IPv6 con la porta');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '203.0.113.7:51234' })),
        '203.0.113.7', 'IPv4 con la porta');
    });

    await prova('un primo salto falsificato non moltiplica i contatori del freno', () => {
      process.env.SB_DIETRO_PROXY = '1';
      auth.azzeraTutto();
      for (let i = 0; i < auth.MAX_TENTATIVI; i++) {
        auth.registraFallimento(richiestaFinta('127.0.0.1', { 'x-forwarded-for': 'falso-' + i + ', 203.0.113.9' }));
      }
      esigi(auth.attesaResidua(richiestaFinta('127.0.0.1', { 'x-forwarded-for': 'ancora-un-altro, 203.0.113.9' })) > 0,
        'cinque tentativi con il primo salto falsificato non hanno frenato niente');

      esigiUguale(auth.attesaResidua(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '198.51.100.4' })), 0,
        'un cliente diverso e stato frenato per sbaglio');
      auth.azzeraTutto();
    });

    await prova('il cookie Secure segue la stessa regola di X-Forwarded-Proto', () => {
      const finta = richiestaFinta('127.0.0.1', { 'x-forwarded-proto': 'https' });
      delete process.env.SB_DIETRO_PROXY;
      esigiUguale(auth.inHttps(finta), false, 'senza dichiarazione l intestazione non conta');

      esigi(auth.cookieSessione(finta, 'x').indexOf('Secure') === -1, 'Secure su http per un intestazione falsa');
      process.env.SB_DIETRO_PROXY = '1';
      esigiUguale(auth.inHttps(finta), true, 'dietro il proxy dichiarato vale');
      esigiDentro(auth.cookieSessione(finta, 'x'), 'Secure', 'cookie in https');
      esigi(auth.cookieSessione(richiestaFinta('127.0.0.1', { 'x-forwarded-proto': 'http' }), 'x').indexOf('Secure') === -1,
        'Secure su una connessione in chiaro');
    });

    await prova('il freno sulle scritture anonime: 120 al minuto per indirizzo', () => {
      delete process.env.SB_DIETRO_PROXY;
      auth.azzeraTutto();
      esigiUguale(auth.MAX_SCRITTURE_ANONIME, 120, 'il tetto del contratto');
      const uno = richiestaFinta('203.0.113.9', {});
      for (let i = 1; i <= auth.MAX_SCRITTURE_ANONIME; i++) {
        esigiUguale(auth.frenoScritture(uno), 0, 'frenata alla richiesta numero ' + i);
      }
      esigi(auth.frenoScritture(uno) > 0, 'la 121esima doveva essere frenata');
      esigiUguale(auth.frenoScritture(richiestaFinta('198.51.100.4', {})), 0, 'un altro indirizzo ha il suo contatore');
      auth.azzeraTutto();
    });

    await prova('statico: quello che non deve uscire dal browser non esce', () => {

      const negati = ['README.md', 'CONTRATTO-6.md', 'docs/HOSTING.md', 'docs/PANNELLO.md',
        'package.json', 'package-lock.json', 'app.js', '.env', '.env.esempio', '.htaccess',
        '.gitignore', '.git/config', '.editorconfig', 'modelli/index.html', 'modelli/parziali/testa.html',
        'server/server.js', 'server/lib/api.js', 'server/dati/auth.json', 'server/dati/chiavi.js',
        'server/backup/copia.json', 'contenuti/contenuti.json', 'contenuti/schema.js',
        'contenuti/font/elenco.json', 'contenuti/media/appunti.md'];
      for (const relativo of negati) {
        esigiUguale(statico.riservato(path.join(P.radice, ...relativo.split('/'))), true, 'doveva essere negato: ' + relativo);
      }

      esigiUguale(statico.riservato(path.join(P.radice, 'SERVER', 'dati', 'auth.json')), true, 'SERVER in maiuscolo');
    });

    await prova('statico: il sito, il pannello, i media e i font continuano a uscire', () => {
      const ammessi = ['index.html', 'robots.txt', 'sitemap.xml', 'css/tema.css', 'js/dati.js',
        'img/avatar.webp', 'pannello/index.html', 'pannello/moduli/api.js',
        'contenuti/media/citta-notturna.webp', 'contenuti/font/prova.woff2',

        '.well-known/acme-challenge/prova'];
      for (const relativo of ammessi) {
        esigiUguale(statico.riservato(path.join(P.radice, ...relativo.split('/'))), false, 'doveva uscire: ' + relativo);
      }
    });

    await prova('statico: i segreti restano negati anche se SB_DATI li mette dentro il sito', () => {
      const radiceLavoro = P.radice;
      const dentro = path.join(radiceLavoro, 'segreti-di-prova');
      const sbDati = process.env.SB_DATI;
      try {
        process.env.SB_DATI = dentro;
        percorsi.applicaAmbiente(P);
        esigiUguale(statico.riservato(path.join(dentro, 'auth.json')), true, 'auth.json in una cartella qualunque');
        esigiUguale(statico.riservato(path.join(dentro, 'chiavi.js')), true, 'chiavi.js');
      } finally {
        if (sbDati === undefined) { delete process.env.SB_DATI; } else { process.env.SB_DATI = sbDati; }
        percorsi.imposta(radiceLavoro);
        fs.rmSync(dentro, { recursive: true, force: true });
      }
    });

    const { creaServer } = require('./server.js');
    const server = creaServer();
    await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
    const porta = server.address().port;

    try {
      await prova('il freno colpisce chi scrive senza sessione, non chi e dentro', async () => {

        delete process.env.SB_DIETRO_PROXY;
        auth.azzeraTutto();
        const entra = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } });
        esigiUguale(entra.stato, 200, 'accesso');
        const biscotto = biscottoDa(entra);

        const finta = richiestaFinta('127.0.0.1', {});
        for (let i = 0; i <= auth.MAX_SCRITTURE_ANONIME; i++) { auth.frenoScritture(finta); }

        const conSessione = await chiama(porta, 'POST', '/api/tema', { biscotto: biscotto, json: { tema: { sfondo: { aloni: 40 } } } });
        esigiUguale(conSessione.stato, 200, 'chi ha la sessione e stato frenato');
        const anonima = await chiama(porta, 'POST', '/api/tema', { json: { tema: {} } });
        esigiUguale(anonima.stato, 429, 'una scrittura anonima doveva essere frenata');
        esigiDentro(anonima.dati.errore, 'Troppe richieste', 'messaggio');

        esigiUguale((await chiama(porta, 'GET', '/api/sessione')).stato, 200, 'una lettura e stata frenata');
        auth.azzeraTutto();
      });

      const senzaPassword = async (corpo) => {
        const daParte = P.auth + '.messo-da-parte';
        fs.renameSync(P.auth, daParte);
        auth.azzeraTutto();
        try {
          return await corpo();
        } finally {
          fs.rmSync(P.auth, { force: true });
          fs.renameSync(daParte, P.auth);
          auth.azzeraTutto();
        }
      };

      await prova('la prima password non si crea da fuori senza SB_PRIMO_ACCESSO', async () => {

        await senzaPassword(async () => {
          delete process.env.SB_PRIMO_ACCESSO;
          const daFuori = await chiama(porta, 'POST', '/api/entra', {
            json: { password: 'una-password-di-prova' }, intestazioni: { 'X-Forwarded-For': '203.0.113.9' }
          });
          esigiUguale(daFuori.stato, 403, 'stato');
          esigiDentro(daFuori.dati.errore, 'SB_PRIMO_ACCESSO', 'il messaggio deve dire cosa fare');
          esigi(!fs.existsSync(P.auth), 'la password e stata creata lo stesso');
        });
      });

      await prova('con SB_PRIMO_ACCESSO=1 la prima password si crea anche da fuori', async () => {
        await senzaPassword(async () => {
          process.env.SB_PRIMO_ACCESSO = '1';
          try {
            const r = await chiama(porta, 'POST', '/api/entra', {
              json: { password: 'una-password-di-prova' }, intestazioni: { 'X-Forwarded-For': '203.0.113.9' }
            });
            esigiUguale(r.stato, 201, 'stato');
            esigiUguale(r.dati.creata, true, 'creata');
            esigi(fs.existsSync(P.auth), 'auth.json non scritto');
          } finally {
            delete process.env.SB_PRIMO_ACCESSO;
          }
        });
      });

      await prova('da un indirizzo locale la prima password si crea come e sempre stato', async () => {
        await senzaPassword(async () => {
          delete process.env.SB_PRIMO_ACCESSO;
          const r = await chiama(porta, 'POST', '/api/entra', { json: { password: 'una-password-di-prova' } });
          esigiUguale(r.stato, 201, 'in locale non deve cambiare niente');
          esigi(fs.existsSync(P.auth), 'auth.json non scritto');
        });
      });

      await prova('a password esistente SB_PRIMO_ACCESSO non conta piu niente', async () => {

        process.env.SB_PRIMO_ACCESSO = '1';
        auth.azzeraTutto();
        try {
          const r = await chiama(porta, 'POST', '/api/entra', {
            json: { password: 'quella-sbagliata-99' }, intestazioni: { 'X-Forwarded-For': '203.0.113.9' }
          });
          esigiUguale(r.stato, 401, 'stato');
          esigiDentro(r.dati.errore, 'Password errata', 'messaggio');
          const buona = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } });
          esigiUguale(buona.stato, 200, 'la password di prima non vale piu');
        } finally {
          delete process.env.SB_PRIMO_ACCESSO;
          auth.azzeraTutto();
        }
      });
    } finally {
      await new Promise((risolvi) => server.close(risolvi));
    }
  } finally {
    rimettiAmbiente();
    auth.azzeraTutto();
  }
}

async function proveSponsor(contenutiVeri, costruisci, archivio) {
  apriSezione('11c. Gli sponsor');

  const ADESSO = Date.UTC(2026, 8, 23, 9, 0, 0);
  const voce = (ritocco) => Object.assign({
    chiave: 's', nome: 'Uno', logo: '', testo: '', categoria: '', url: 'https://uno.example.com/', da: '', a: '', evidenza: false
  }, ritocco || {});
  const con = (voci) => {
    const d = JSON.parse(JSON.stringify(contenutiVeri));
    d.config.sponsor = { attivo: true, voci: voci };
    return d;
  };
  const sponsorDi = (d) => costruisci.sponsorDi(d.config, d.testi, ADESSO);

  await prova('senza link non si vede: e il patto di ogni elenco del sito', () => {
    const esito = sponsorDi(con([
      voce({ chiave: 'a', nome: 'Con link' }),
      voce({ chiave: 'b', nome: 'Senza link', url: '' }),
      voce({ chiave: 'c', nome: 'Senza nome', nome: '' })
    ]));
    esigiUguale(esito.voci.map((v) => v.nome).join(','), 'Con link', 'voci visibili');
    esigiUguale(esito.attivo, true, 'attivo');
  });

  await prova('fuori dal periodo non si vede, e il periodo e italiano', () => {

    const esito = sponsorDi(con([
      voce({ chiave: 'a', nome: 'In corso' }),
      voce({ chiave: 'b', nome: 'Gia finito', a: '2026-09-23T10:00' }),
      voce({ chiave: 'c', nome: 'Non ancora', da: '2026-09-23T12:00' }),
      voce({ chiave: 'd', nome: 'Comincia adesso', da: '2026-09-23T11:00' }),
      voce({ chiave: 'e', nome: 'Finisce adesso', a: '2026-09-23T11:00' }),
      voce({ chiave: 'f', nome: 'Dentro', da: '2026-09-01T00:00', a: '2026-12-31T23:59' })
    ]));
    esigiUguale(esito.voci.map((v) => v.nome).join(','),
      'In corso,Comincia adesso,Dentro', 'voci dentro il periodo');
  });

  await prova('in evidenza passa davanti, e fra pari resta l ordine del pannello', () => {
    const esito = sponsorDi(con([
      voce({ chiave: 'a', nome: 'Primo' }),
      voce({ chiave: 'b', nome: 'Secondo' }),
      voce({ chiave: 'c', nome: 'Terzo', evidenza: true }),
      voce({ chiave: 'd', nome: 'Quarto', evidenza: true })
    ]));
    esigiUguale(esito.voci.map((v) => v.nome).join(','), 'Terzo,Quarto,Primo,Secondo', 'ordine');
  });

  await prova('i gruppi seguono le categorie, e chi non ne ha finisce in fondo', () => {
    const esito = sponsorDi(con([
      voce({ chiave: 'a', nome: 'Uno', categoria: 'Hardware' }),
      voce({ chiave: 'b', nome: 'Due', categoria: '' }),
      voce({ chiave: 'c', nome: 'Tre', categoria: 'Energy drink' }),
      voce({ chiave: 'd', nome: 'Quattro', categoria: 'hardware' })
    ]));
    esigiUguale(esito.gruppi.map((g) => g.titolo).join(' | '),
      'Hardware | Energy drink | ' + contenutiVeri.testi['sponsor.altri'], 'titoli dei gruppi');
    esigiUguale(esito.gruppi[0].voci.map((v) => v.nome).join(','), 'Uno,Quattro', 'maiuscole diverse, stessa categoria');
    esigiUguale(esito.gruppi.map((g) => g.titolato).join(','), 'true,true,true', 'tutti titolati');
  });

  await prova('un gruppo solo e senza categoria non stampa nessun titolo', () => {
    const esito = sponsorDi(con([voce({ nome: 'Uno' }), voce({ chiave: 'b', nome: 'Due' })]));
    esigiUguale(esito.gruppi.length, 1, 'gruppi');
    esigiUguale(esito.gruppi[0].titolato, false, 'titolato');
  });

  await prova('il dominio per il bottone, senza www e senza il resto dell indirizzo', () => {
    const esito = sponsorDi(con([
      voce({ chiave: 'a', nome: 'Uno', url: 'https://www.example.com/pagina?x=1' }),
      voce({ chiave: 'b', nome: 'Due', url: 'https://negozio.example.org/' })
    ]));
    esigiUguale(esito.voci.map((v) => v.dominio).join(','), 'example.com,negozio.example.org', 'domini');
  });

  await prova('spenti, o senza nessuno dentro il periodo, la sezione non e attiva', () => {
    const spenti = JSON.parse(JSON.stringify(contenutiVeri));
    spenti.config.sponsor = { attivo: false, voci: [voce({})] };
    esigiUguale(costruisci.sponsorDi(spenti.config, spenti.testi, ADESSO).attivo, false, 'interruttore spento');

    const scaduti = con([voce({ a: '2020-01-01T00:00' })]);
    esigiUguale(sponsorDi(scaduti).attivo, false, 'acceso ma nessuno nel periodo');
  });

  const originale = fs.readFileSync(P.contenutiJson, 'utf8');
  const scrivi = (documento) => fs.writeFileSync(P.contenutiJson, JSON.stringify(documento, null, 2) + '\n');

  await prova('la pagina si scrive quando servono, e si toglie quando non servono piu', () => {
    scrivi(con([
      voce({ chiave: 'a', nome: 'Uno', categoria: 'Hardware', url: 'https://uno.example.com/' }),
      voce({ chiave: 'b', nome: 'Due', categoria: '', url: 'https://due.example.com/', evidenza: true })
    ]));
    const acceso = costruisci.genera({ adesso: ADESSO });
    esigiUguale(acceso.paginaSponsor.stato, 'scritta', 'sponsor.html');
    esigiUguale(acceso.sponsor, 2, 'quanti sponsor');
    esigi(fs.existsSync(P.sponsorHtml), 'sponsor.html non scritta');

    const html = fs.readFileSync(P.sponsorHtml, 'utf8');
    esigiDentro(html, 'Due', 'il nome dello sponsor');
    esigiDentro(html, 'rel="noopener sponsored"', 'il rel che Google chiede per le collaborazioni');
    esigiDentro(html, 'uno.example.com', 'il dominio sul bottone');
    esigiDentro(html, '<script src="js/sponsor.js" defer></script>', 'lo script della pagina');
    esigiDentro(html, '<script src="js/guardia.js" defer></script>', 'la guardia della manutenzione');
    esigi(html.indexOf('<!--') === -1, 'la pagina pubblicata contiene un commento');

    const mappa = fs.readFileSync(path.join(P.radice, 'sitemap.xml'), 'utf8');
    esigiDentro(mappa, 'sponsor.html', 'sponsor.html nella sitemap');

    const home = fs.readFileSync(P.indexHtml, 'utf8');
    esigiDentro(home, 'id="sponsor"', 'la striscia in home');
    esigiDentro(home, 'href="sponsor.html"', 'il bottone che porta alla pagina');
    esigiDentro(home, '<link rel="stylesheet" href="css/sponsor.css">', 'il foglio');
    esigiDentro(home, '<script src="js/sponsor.js" defer></script>', 'lo script');

    esigi(home.indexOf('href="#sponsor"') === -1, 'la sezione sponsor e finita nel binario');

    const spenti = JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8'));
    spenti.config.sponsor.attivo = false;
    scrivi(spenti);
    const spento = costruisci.genera({ adesso: ADESSO });
    esigiUguale(spento.paginaSponsor.stato, 'tolta', 'sponsor.html tolta');
    esigi(!fs.existsSync(P.sponsorHtml), 'sponsor.html e rimasta online');
    const senza = fs.readFileSync(P.indexHtml, 'utf8');
    esigi(senza.indexOf('id="sponsor"') === -1, 'la striscia e rimasta in home');
    esigi(senza.indexOf('css/sponsor.css') === -1, 'il foglio si carica per niente');
    esigi(senza.indexOf('js/sponsor.js') === -1, 'lo script si carica per niente');
  });

  await prova('l ultima collaborazione che scade porta via la pagina da sola', () => {
    scrivi(con([voce({ nome: 'Uno', a: '2026-09-23T10:00' })]));
    const esito = costruisci.genera({ adesso: ADESSO });
    esigiUguale(esito.paginaSponsor.stato, 'niente', 'sponsor.html');
    esigiUguale(esito.sponsor, 0, 'quanti sponsor');
    esigi(!fs.existsSync(P.sponsorHtml), 'sponsor.html esiste ancora');
  });

  await prova('js/sponsor.js rifa il conto nel browser, sulle date che stanno in pagina', () => {
    scrivi(con([voce({ nome: 'Uno', da: '2026-09-01T00:00', a: '2026-12-31T23:59' })]));
    costruisci.genera({ adesso: ADESSO });
    const html = fs.readFileSync(P.sponsorHtml, 'utf8');

    esigiDentro(html, 'data-da="2026-09-01T00:00:00+02:00"', 'data-da');
    esigiDentro(html, 'data-a="2026-12-31T23:59:00+01:00"', 'data-a con l ora solare');

    const js = fs.readFileSync(path.join(RADICE_VERA, 'js', 'sponsor.js'), 'utf8');
    esigiDentro(js, "getAttribute('data-da')", 'lo script legge data-da');
    esigiDentro(js, "getAttribute('data-a')", 'lo script legge data-a');
    esigiDentro(js, 'data-sponsor-vuoto', 'la riga per quando non resta nessuno');
    try { new Function(js); } catch (errore) { throw new Error('js/sponsor.js non si compila: ' + errore.message); }
  });

  fs.writeFileSync(P.contenutiJson, originale);
  costruisci.genera({ adesso: ADESSO });
}

async function provePaginaGiochi(contenutiVeri, costruisci, archivio) {
  apriSezione('11d. La pagina dei giochi');

  const finti = {
    letteIl: '2026-09-24T10:00:00.000Z',
    giochi: [
      {
        id: '1', nome: 'Gioco <b>Uno</b> & "due"',
        copertina: 'https://static-cdn.jtvnw.net/ttv-boxart/1_IGDB-285x380.jpg',
        generi: ['Horror', 'Azione'], dirette: 1234, ore: 19.94, clip: 3,
        primaVolta: '2026-09-14', ultimaVolta: '2026-09-21',
        clipMigliore: { titolo: '<img src=x onerror=alert(1)>', url: 'https://www.twitch.tv/slayer_beard/clip/Abc', anteprima: '', visualizzazioni: 120 }
      },
      {
        id: '509658', nome: 'Just Chatting', copertina: '', generi: ['Chiacchiere'], dirette: 40, ore: 90, clip: 9,
        primaVolta: '2021-01-01', ultimaVolta: '2026-09-22', clipMigliore: null
      },
      {
        id: '2', nome: 'Secondo', copertina: 'https://cattivo.example.com/x.jpg', generi: ['Horror'], dirette: 1, ore: 1, clip: 0,
        primaVolta: '2026-01-02', ultimaVolta: '2026-01-02',
        clipMigliore: { titolo: 'x', url: 'javascript:alert(1)', anteprima: '', visualizzazioni: 1 }
      },
      {
        id: '3', nome: 'Terzo', copertina: '', generi: ['Azione'], dirette: 0, ore: 0, clip: 1,
        primaVolta: '2026-05-01', ultimaVolta: '2026-05-01', clipMigliore: null
      }
    ]
  };
  const correzioni = [{ gioco: 'terzo', generi: 'Platform, Indie , , Puzzle, Extra', copertina: 'contenuti/media/terzo.png' }];

  const scriviFinti = (valore) => {
    fs.mkdirSync(path.dirname(P.giochiTwitch), { recursive: true });
    fs.writeFileSync(P.giochiTwitch, typeof valore === 'string' ? valore : JSON.stringify(valore));
  };
  const togliFinti = () => { try { fs.unlinkSync(P.giochiTwitch); } catch (e) {} };
  const con = (ramo) => {
    const d = JSON.parse(JSON.stringify(contenutiVeri));
    schema.completa(d);
    d.config.giochi = Object.assign({ attivo: true, nascosti: ['just chatting'], correzioni: correzioni }, ramo || {});
    return d;
  };
  const giochiDi = (d) => costruisci.giochiDi(d.config, d.testi);

  await prova('lo schema ha il gruppo giochi dopo le clip, tutto con il suo predefinito', () => {
    const ids = schema.gruppi.map((g) => g.id);
    esigiUguale(ids[ids.indexOf('clip') + 1], 'giochi', 'gruppo dopo le clip');
    const gruppo = schema.gruppi.find((g) => g.id === 'giochi');
    for (const campo of gruppo.campi) {
      esigi(Object.prototype.hasOwnProperty.call(campo, 'predefinito'), campo.chiave + ' senza predefinito');
    }
    esigiUguale(schema.campo('config.giochi.attivo').predefinito, true, 'interruttore acceso di partenza');
    esigiDentro(schema.campo('config.giochi.nascosti').predefinito.join(','), 'Just Chatting', 'nascosti di partenza');
  });

  await prova('giochiDi toglie i nascosti, applica le correzioni e scarta copertine e link di host estranei', () => {
    scriviFinti(finti);
    const esito = giochiDi(con());
    esigiUguale(esito.dalSeme, false, 'letto dal file dei dati');
    esigiUguale(esito.voci.map((v) => v.nome).join(','), 'Gioco <b>Uno</b> & "due",Terzo,Secondo', 'giochi e ordine per ultima volta');
    const terzo = esito.voci[1];
    esigiUguale(terzo.generi.join(','), 'Platform,Indie,Puzzle', 'generi corretti, al massimo tre');
    esigiUguale(terzo.copertina, 'contenuti/media/terzo.png', 'copertina corretta');
    esigiUguale(esito.voci[2].copertina, '', 'copertina su un host estraneo');
    esigiUguale(esito.voci[2].clipMigliore, null, 'clip con un link non di Twitch');
    esigiUguale(esito.voci[0].clipMigliore.url, 'https://www.twitch.tv/slayer_beard/clip/Abc', 'clip migliore');

    const perId = giochiDi(con({ nascosti: ['2'] }));
    esigiUguale(perId.voci.map((v) => v.nome).join(','), 'Just Chatting,Gioco <b>Uno</b> & "due",Terzo', 'nascosto per id');
  });

  await prova('giochiDi formatta numeri, ore e date in italiano, con singolare e plurale', () => {
    scriviFinti(finti);
    const esito = giochiDi(con());
    const numeri = (v) => v.numeri.map((n) => n.valore + ' ' + n.parola).join(' · ');
    esigiUguale(numeri(esito.voci[0]), '1.234 dirette · 19,9 ore · 3 clip', 'numeri del primo');
    esigiUguale(numeri(esito.voci[2]), '1 diretta · 1 ora', 'singolari');
    esigiUguale(numeri(esito.voci[1]), '1 clip', 'gli zeri non si scrivono');
    esigiUguale(esito.voci[0].ultimaTesto, '21 settembre 2026', 'data in parole');
    esigiUguale(esito.voci[0].datiGeneri, 'Horror|Azione', 'generi per js/giochi.js');
    esigiUguale(esito.riepilogo.map((n) => n.valore + ' ' + n.parola).join(' · '), '3 giochi · 20,9 ore · 4 clip', 'riepilogo');
  });

  await prova('giochiDi conta le tipologie presenti, dalla piu frequente', () => {
    scriviFinti(finti);
    const esito = giochiDi(con());
    esigiUguale(esito.tipologie.map((t) => t.nome + ':' + t.quanti).join(','),
      'Horror:2,Azione:1,Indie:1,Platform:1,Puzzle:1', 'tipologie');
  });

  await prova('senza il file dei dati, o con il file rotto, ripiega sul seme', () => {
    togliFinti();
    const senza = giochiDi(con({ nascosti: schema.campo('config.giochi.nascosti').predefinito }));
    esigiUguale(senza.dalSeme, true, 'dal seme');
    esigi(senza.quanti > 40, 'pochi giochi dal seme: ' + senza.quanti);
    esigi(senza.voci.every((v) => ['just chatting', 'irl', 'special events'].indexOf(v.nome.toLowerCase()) === -1), 'un nascosto e passato');
    esigi(senza.voci.filter((v) => v.copertina).every((v) => /^https:\/\/static-cdn\.jtvnw\.net\/ttv-boxart\/[A-Za-z0-9_.-]+-285x380\.jpg$/.test(v.copertina)),
      'copertina del seme non completata');
    scriviFinti('{rotto');
    esigiUguale(giochiDi(con()).dalSeme, true, 'file rotto');
    togliFinti();
  });

  await prova('spenta, o senza giochi da mostrare, la pagina non e attiva', () => {
    scriviFinti(finti);
    esigiUguale(giochiDi(con({ attivo: false })).attivo, false, 'interruttore spento');
    esigiUguale(giochiDi(con({ nascosti: ['1', '2', '3', 'just chatting'] })).attivo, false, 'tutti nascosti');
    esigiUguale(giochiDi(con()).attivo, true, 'acceso');
  });

  const originale = fs.readFileSync(P.contenutiJson, 'utf8');
  const scrivi = (documento) => fs.writeFileSync(P.contenutiJson, JSON.stringify(documento, null, 2) + '\n');

  await prova('la pagina si scrive con le card in escape, entra in sitemap e la home la invita', () => {
    scriviFinti(finti);
    scrivi(con());
    const esito = costruisci.genera();
    esigiUguale(esito.paginaGiochi.stato, 'scritta', 'giochi.html');
    esigi(fs.existsSync(P.giochiHtml), 'giochi.html non scritta');

    const html = fs.readFileSync(P.giochiHtml, 'utf8');
    esigiDentro(html, 'Gioco &lt;b&gt;Uno&lt;/b&gt; &amp; &quot;due&quot;', 'il nome in escape');
    esigi(html.indexOf('<b>Uno</b>') === -1, 'il nome e passato senza escape');
    esigi(html.indexOf('<img src=x') === -1, 'il titolo della clip e passato senza escape');
    esigiDentro(html, 'data-tipo="Horror"', 'la pillola della tipologia');
    esigiDentro(html, 'data-generi="Horror|Azione" data-ore="19.9" data-ultima="2026-09-21"', 'i dati della card');
    esigiDentro(html, 'src="https://static-cdn.jtvnw.net/ttv-boxart/1_IGDB-285x380.jpg" alt="Gioco &lt;b&gt;Uno', 'copertina con alt');
    esigiDentro(html, 'loading="lazy"', 'copertine lazy');
    esigiDentro(html, 'href="https://www.twitch.tv/slayer_beard/clip/Abc"', 'il link alla clip migliore');
    esigiDentro(html, 'role="status"', 'il conteggio annunciato');
    esigiDentro(html, '<script src="js/giochi.js" defer></script>', 'lo script della pagina');
    esigiDentro(html, '<script src="js/guardia.js" defer></script>', 'la guardia della manutenzione');
    esigiDentro(html, '<link rel="stylesheet" href="css/giochi.css">', 'il foglio della pagina');
    esigi(html.indexOf('Just Chatting') === -1, 'un nascosto e in pagina');
    esigi(html.indexOf('<!--') === -1, 'la pagina pubblicata contiene un commento');
    esigi(!/<script>(?!\s*$)/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), 'script inline in pagina');

    const mappa = fs.readFileSync(path.join(P.radice, 'sitemap.xml'), 'utf8');
    esigiDentro(mappa, 'giochi.html', 'giochi.html nella sitemap');

    const home = fs.readFileSync(P.indexHtml, 'utf8');
    esigiDentro(home, 'href="giochi.html"', 'l invito in home');
    const nav = home.slice(home.indexOf('binario__nav'), home.indexOf('binario__stato'));
    esigiUguale((nav.match(/binario__voce/g) || []).length, 6, 'voci nel binario');
  });

  await prova('spenta, la pagina si toglie e l invito sparisce dalla home', () => {
    scriviFinti(finti);
    scrivi(con({ attivo: false }));
    const esito = costruisci.genera();
    esigiUguale(esito.paginaGiochi.stato, 'tolta', 'giochi.html tolta');
    esigi(!fs.existsSync(P.giochiHtml), 'giochi.html e rimasta online');
    esigi(fs.readFileSync(P.indexHtml, 'utf8').indexOf('href="giochi.html"') === -1, 'l invito e rimasto in home');
    esigi(fs.readFileSync(path.join(P.radice, 'sitemap.xml'), 'utf8').indexOf('giochi.html') === -1, 'giochi.html e rimasta in sitemap');
    esigiUguale(costruisci.genera().paginaGiochi.stato, 'niente', 'giochi.html la seconda volta');
  });

  await prova('js/giochi.js si compila e lavora sugli attributi delle card', () => {
    const js = fs.readFileSync(path.join(RADICE_VERA, 'js', 'giochi.js'), 'utf8');
    for (const pezzo of ['data-generi', 'data-ore', 'data-ultima', 'data-nome', 'data-tipo', 'aria-pressed', 'replaceState', 'data-giochi-vuoto']) {
      esigiDentro(js, pezzo, 'js/giochi.js');
    }
    try { new Function(js); } catch (errore) { throw new Error('js/giochi.js non si compila: ' + errore.message); }
    const css = fs.readFileSync(path.join(RADICE_VERA, 'css', 'giochi.css'), 'utf8');
    esigi(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'css/giochi.css usa colori esadecimali');
    esigiDentro(css, 'prefers-reduced-motion', 'movimento ridotto');
    esigi(typeof costruisci.allineaGiochiDopoRipristino === 'function', 'manca allineaGiochiDopoRipristino');
  });

  const CHIAVI_CERCA = ['giochi.cercaEtichetta', 'giochi.cercaSegnaposto', 'giochi.cercaPulisci', 'giochi.cercaVuoto'];

  await prova('la pagina dei giochi ha la barra di ricerca, nascosta senza JavaScript, coi testi in escape', () => {
    scriviFinti(finti);
    const documento = con();
    scrivi(documento);
    costruisci.genera();
    const html = fs.readFileSync(P.giochiHtml, 'utf8');
    esigiDentro(html, 'type="search"', 'manca il campo di ricerca');
    esigiDentro(html, 'for="giochi-cerca">' + documento.testi['giochi.cercaEtichetta'] + '<', 'manca l etichetta del campo');
    esigiDentro(html, 'placeholder="' + documento.testi['giochi.cercaSegnaposto'] + '"', 'manca il testo dentro il campo');
    esigiDentro(html, 'aria-label="' + documento.testi['giochi.cercaPulisci'] + '"', 'manca il nome del bottone che cancella');
    esigiDentro(html, 'data-giochi-cerca-vuoto hidden>' + documento.testi['giochi.cercaVuoto'] + '<', 'manca la riga per la ricerca senza risultati');
    esigiDentro(html, 'role="search" data-giochi-cerca-riquadro hidden>', 'la ricerca non parte nascosta: senza JavaScript sarebbe inutile');
    esigiDentro(html, '<div class="giochi-comandi" data-giochi-comandi hidden>', 'i filtri non partono nascosti');
    esigi(html.indexOf('data-giochi-cerca-riquadro') < html.indexOf('data-giochi-comandi'), 'la ricerca deve stare sopra la barra dei filtri, che resta sola nella parte fissa');

    documento.testi['giochi.cercaSegnaposto'] = 'Nome "o" <b>tipo</b>';
    scrivi(documento);
    costruisci.genera();
    const protetta = fs.readFileSync(P.giochiHtml, 'utf8');
    esigiDentro(protetta, 'placeholder="Nome &quot;o&quot; &lt;b&gt;tipo&lt;/b&gt;"', 'il testo del campo non e protetto');
    esigi(protetta.indexOf('<b>tipo') === -1, 'il testo del campo e arrivato in pagina come markup');
  });

  await prova('un contenuti.json senza i testi della ricerca li riceve dai predefiniti, e lo schema li conosce tutti', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    for (const chiave of CHIAVI_CERCA) { delete documento.testi[chiave]; }
    const aggiunte = schema.completa(documento);
    for (const chiave of CHIAVI_CERCA) {
      const campo = schema.campo(chiave);
      esigi(!!campo, chiave + ' non e nello schema');
      esigi(aggiunte.indexOf(chiave) !== -1, chiave + ' non e stato aggiunto');
      esigiUguale(documento.testi[chiave], campo.predefinito, chiave + ' non ha il predefinito');
      esigiUguale(convalida.convalidaCampo(chiave, campo.predefinito).length, 0, chiave + ': il predefinito non passa la convalida');
    }
    esigiUguale(schema.verificaCopertura(documento).length, 0, 'la copertura si lamenta');
    for (const chiave of CHIAVI_CERCA) {
      esigi(!!contenutiVeri.testi[chiave], chiave + ' manca in contenuti.json');
    }
  });

  await prova('lo script dei giochi cerca per nome e tipologia insieme ai filtri, e ricorda la ricerca nell indirizzo', () => {
    const codice = fs.readFileSync(path.join(RADICE_VERA, 'js', 'giochi.js'), 'utf8');
    const nodo = (attributi) => ({
      hidden: false,
      attributi: attributi,
      ascolti: {},
      textContent: '',
      value: '',
      fuoco: 0,
      getAttribute(nome) { return Object.prototype.hasOwnProperty.call(this.attributi, nome) ? this.attributi[nome] : null; },
      setAttribute(nome, valore) { this.attributi[nome] = valore; },
      addEventListener(tipo, f) { this.ascolti[tipo] = f; },
      focus() { this.fuoco += 1; }
    });

    const monta = (ricerca, senzaCampo) => {
      const scheda = (nome, generi, ore, ultima) => nodo({ 'data-gioco': '', 'data-nome': nome, 'data-generi': generi, 'data-ore': String(ore), 'data-ultima': ultima });
      const voci = [
        scheda('Resident Evil 4', 'Horror|Azione', 10, '2026-09-20'),
        scheda('Città Perduta', 'Avventura', 5, '2026-09-22'),
        scheda('Hollow Knight', 'Metroidvania|Platform', 9, '2026-09-21'),
        scheda('Silent Hill 2', 'Horror', 7, '2026-09-19')
      ];
      const pillole = ['', 'Horror', 'Avventura'].map((tipo) => nodo({ 'data-tipo': tipo, 'aria-pressed': tipo === '' ? 'true' : 'false' }));
      const campo = nodo({});
      const pulisci = nodo({});
      pulisci.hidden = true;
      const conto = nodo({ 'data-uno': 'gioco', 'data-tanti': 'giochi' });
      const vuoto = nodo({});
      vuoto.hidden = true;
      const vuotoCerca = nodo({});
      vuotoCerca.hidden = true;
      const riquadro = nodo({});
      riquadro.hidden = true;
      const comandi = nodo({});
      comandi.hidden = true;
      comandi.querySelectorAll = () => pillole;
      comandi.querySelector = () => null;
      const elenco = nodo({});
      elenco.querySelectorAll = () => voci;
      elenco.appendChild = () => {};
      const trovabili = {
        '[data-giochi-elenco]': elenco,
        '[data-giochi-comandi]': comandi,
        '[data-giochi-conto]': conto,
        '[data-giochi-vuoto]': vuoto,
        '[data-giochi-cerca-vuoto]': vuotoCerca,
        '[data-giochi-cerca-riquadro]': riquadro,
        '[data-giochi-cerca]': senzaCampo ? null : campo,
        '[data-giochi-pulisci]': senzaCampo ? null : pulisci
      };
      const indirizzi = [];
      require('node:vm').runInNewContext(codice, {
        document: {
          readyState: 'complete',
          querySelector: (selettore) => trovabili[selettore] || null,
          querySelectorAll: () => [],
          addEventListener() {}
        },
        window: {
          location: { search: ricerca || '', pathname: '/giochi.html', hash: '' },
          history: { replaceState: (a, b, url) => { indirizzi.push(url); } }
        },
        URLSearchParams: URLSearchParams
      });
      const visibili = () => JSON.stringify(voci.map((v, i) => (v.hidden ? null : i)).filter((i) => i !== null));
      const scrivi = (testo) => { campo.value = testo; campo.ascolti.input(); };
      const ultimoIndirizzo = () => indirizzi[indirizzi.length - 1];
      return { voci, pillole, campo, pulisci, conto, vuoto, vuotoCerca, riquadro, comandi, visibili, scrivi, ultimoIndirizzo };
    };

    const a = monta('');
    esigiUguale(a.comandi.hidden, false, 'i filtri non si rivelano');
    esigiUguale(a.riquadro.hidden, false, 'la barra di ricerca non si rivela');
    esigiUguale(a.visibili(), '[0,1,2,3]', 'senza ricerca si vedono tutti');
    esigiUguale(a.conto.textContent, '4 giochi', 'il conto');
    esigiUguale(a.vuoto.hidden && a.vuotoCerca.hidden && a.pulisci.hidden, true, 'un messaggio o il bottone X compaiono a torto');
    esigiUguale(a.ultimoIndirizzo(), '/giochi.html', 'l indirizzo senza filtri resta pulito');

    a.scrivi('resident');
    esigiUguale(a.visibili(), '[0]', 'cerca per nome');
    esigiUguale(a.conto.textContent, '1 gioco', 'il conto al singolare');
    esigiUguale(a.pulisci.hidden, false, 'il bottone che cancella non compare');
    esigiUguale(a.ultimoIndirizzo(), '/giochi.html?cerca=resident', 'la ricerca nell indirizzo');

    a.scrivi('HORROR');
    esigiUguale(a.visibili(), '[0,3]', 'cerca anche per tipologia, senza badare alle maiuscole');
    a.scrivi('  CITTA  ');
    esigiUguale(a.visibili(), '[1]', 'la «à» si trova con «a»');
    a.scrivi('horror silent');
    esigiUguale(a.visibili(), '[3]', 'con piu parole devono esserci tutte');
    esigiUguale(a.ultimoIndirizzo(), '/giochi.html?cerca=horror+silent', 'gli spazi in eccesso non finiscono nell indirizzo');

    a.scrivi('zzz');
    esigiUguale(a.visibili(), '[]', 'nessuna corrispondenza');
    esigiUguale(a.vuotoCerca.hidden, false, 'manca il messaggio della ricerca senza risultati');
    esigiUguale(a.vuoto.hidden, true, 'compare il messaggio del filtro invece di quello della ricerca');
    esigiUguale(a.conto.textContent, '0 giochi', 'il conto a zero');

    a.scrivi('horror');
    a.pillole[2].ascolti.click({ currentTarget: a.pillole[2] });
    esigiUguale(a.visibili(), '[]', 'ricerca e tipologia lavorano insieme: nessun horror e anche avventura');
    esigiUguale(a.ultimoIndirizzo(), '/giochi.html?cerca=horror&tipo=Avventura', 'ricerca e tipologia insieme nell indirizzo');
    let fermato = 0;
    a.campo.ascolti.keydown({ key: 'Escape', preventDefault() { fermato += 1; } });
    esigiUguale(fermato, 1, 'Esc non ferma il comportamento del browser');
    esigiUguale(a.campo.value, '', 'Esc non cancella il testo');
    esigiUguale(a.visibili(), '[1]', 'cancellata la ricerca resta il filtro per tipologia');
    esigiUguale(a.vuotoCerca.hidden, true, 'il messaggio della ricerca resta dopo averla cancellata');
    a.campo.ascolti.keydown({ key: 'Escape', preventDefault() { fermato += 1; } });
    esigiUguale(fermato, 1, 'Esc a campo vuoto non deve essere fermato');

    a.scrivi('knight');
    esigiUguale(a.visibili(), '[]', 'Hollow Knight non e un avventura');
    a.pulisci.ascolti.click();
    esigiUguale(a.campo.value, '', 'il bottone non cancella il testo');
    esigiUguale(a.campo.fuoco, 1, 'il bottone non rimette il cursore nel campo');
    esigiUguale(a.pulisci.hidden, true, 'il bottone resta a campo vuoto');
    esigiUguale(a.ultimoIndirizzo(), '/giochi.html?tipo=Avventura', 'la ricerca cancellata resta nell indirizzo');

    const b = monta('?cerca=%20%20HORROR%20%20');
    esigiUguale(b.campo.value, 'HORROR', 'la ricerca dell indirizzo non riempie il campo, o lo lascia con gli spazi');
    esigiUguale(b.visibili(), '[0,3]', 'la ricerca dell indirizzo non si applica');
    esigiUguale(b.pulisci.hidden, false, 'il bottone X manca con la ricerca dall indirizzo');

    const c = monta('?cerca=' + 'a'.repeat(200));
    esigiUguale(c.campo.value.length, 80, 'la ricerca dell indirizzo non e limitata a 80 caratteri');

    const d = monta('?cerca=resident', true);
    esigiUguale(d.visibili(), '[0,1,2,3]', 'senza il campo nella pagina, la ricerca dell indirizzo non deve nascondere giochi');
  });

  togliFinti();
  fs.writeFileSync(P.contenutiJson, originale);
  costruisci.genera();
}

async function proveSorpresaSlayer(costruisci, archivio) {
  apriSezione('11e. La sorpresa SLAYER: canzone e polletti per 21 secondi');

  const vm = require('node:vm');
  const jsSlayer = fs.readFileSync(path.join(RADICE_VERA, 'js', 'slayer.js'), 'utf8');
  const jsFesta = fs.readFileSync(path.join(RADICE_VERA, 'js', 'festa.js'), 'utf8');

  const nuovoOrologio = () => {
    let ora = 1000000;
    let seme = 0;
    let compiti = [];
    const aggiungi = (fn, ritardo, ogni) => {
      const id = ++seme;
      compiti.push({ id: id, t: ora + Math.max(0, ritardo), fn: fn, ogni: ogni });
      return id;
    };
    const togli = (id) => { compiti = compiti.filter((c) => c.id !== id); };
    return {
      adesso: () => ora,
      setTimeout: (fn, ms) => aggiungi(fn, ms || 0, 0),
      clearTimeout: togli,
      setInterval: (fn, ms) => aggiungi(fn, ms, ms),
      clearInterval: togli,
      requestAnimationFrame: (fn) => aggiungi(() => fn(ora), 16, 0),
      avanza(ms) {
        const fine = ora + ms;
        for (;;) {
          const prossimo = compiti.filter((c) => c.t <= fine).sort((a, b) => a.t - b.t || a.id - b.id)[0];
          if (!prossimo) { break; }
          ora = prossimo.t;
          if (prossimo.ogni) { prossimo.t += prossimo.ogni; } else { togli(prossimo.id); }
          prossimo.fn();
        }
        ora = fine;
      }
    };
  };

  const nodoFinto = () => {
    const n = { style: {}, children: [], parentNode: null, isConnected: true, className: '' };
    n.setAttribute = () => {};
    n.appendChild = (c) => { c.parentNode = n; n.children.push(c); return c; };
    n.removeChild = (c) => {
      const i = n.children.indexOf(c);
      if (i >= 0) { n.children.splice(i, 1); }
      c.parentNode = null;
      return c;
    };
    return n;
  };

  const montaFesta = (ridotto) => {
    const orologio = nuovoOrologio();
    const corpo = nodoFinto();
    const finestra = {
      DATI: { meteora: { icona: 'icone_slayer/1-anno-72x72.webp', icone: ['icone_slayer/1-anno-72x72.webp', 'icone_slayer/2-anni-72x72.webp', 'icone_slayer/72-4-anni (1).webp'] } },
      innerWidth: 1200,
      innerHeight: 800,
      matchMedia: () => ({ matches: !!ridotto })
    };
    vm.runInNewContext(jsFesta, {
      window: finestra,
      document: { createElement: nodoFinto, body: corpo },
      Date: { now: orologio.adesso },
      setTimeout: orologio.setTimeout,
      clearTimeout: orologio.clearTimeout,
      setInterval: orologio.setInterval,
      clearInterval: orologio.clearInterval,
      requestAnimationFrame: orologio.requestAnimationFrame
    });
    const particelle = () => (corpo.children[0] ? corpo.children[0].children.filter((c) => c.className !== 'festa__lampo').length : 0);
    return { orologio: orologio, festa: finestra.PolloFesta, particelle: particelle };
  };

  await prova('festa.js: il coro dei polletti dura 21 secondi, poi la pagina e pulita, anche se nessuno lo ferma', () => {
    const f = montaFesta(false);
    esigi(typeof f.festa.coro === 'function' && typeof f.festa.svuota === 'function', 'PolloFesta non ha coro e svuota');
    f.festa.coro(21);
    f.orologio.avanza(1000);
    esigi(f.particelle() > 10, 'dopo un secondo i polletti sono troppo pochi: ' + f.particelle());
    f.orologio.avanza(9000);
    const mezzo = f.particelle();
    esigi(mezzo > 30 && mezzo <= 280, 'a meta ci sono ' + mezzo + ' pezzi: troppo pochi, o piu del tetto');
    f.orologio.avanza(10000);
    esigi(f.particelle() > 0, 'a 20 secondi non c e piu niente: il coro e finito troppo presto');
    f.orologio.avanza(1300);
    esigiUguale(f.particelle(), 0, 'a 21,3 secondi restano dei pezzi in pagina');
    f.orologio.avanza(5000);
    esigiUguale(f.particelle(), 0, 'dopo la fine ne nascono ancora');
  });

  await prova('festa.js: fermare il coro toglie tutto subito e non ne nascono altri', () => {
    const f = montaFesta(false);
    const coro = f.festa.coro(21);
    f.orologio.avanza(6000);
    esigi(f.particelle() > 0, 'a 6 secondi non c e niente da fermare');
    coro.ferma();
    esigiUguale(f.particelle(), 0, 'fermato, ma restano dei pezzi');
    f.orologio.avanza(4000);
    esigiUguale(f.particelle(), 0, 'fermato, ma ne nascono ancora');
  });

  await prova('festa.js: con il movimento ridotto i polletti non cadono ma compaiono e si spengono, per 21 secondi', () => {
    const f = montaFesta(true);
    f.festa.coro(21);
    f.orologio.avanza(3000);
    esigi(f.particelle() > 0, 'con il movimento ridotto non compare niente');
    f.orologio.avanza(17000);
    esigi(f.particelle() > 0, 'a 20 secondi non c e piu niente');
    f.orologio.avanza(1500);
    esigiUguale(f.particelle(), 0, 'a 21,5 secondi restano dei pezzi');
  });

  const monta = (opzioni) => {
    const o = Object.assign({ musicaSuona: false, festa: true, rifiutata: false, festaInPagina: false }, opzioni || {});
    const orologio = nuovoOrologio();
    const registro = { coro: [], coroFermato: 0, play: 0, pause: 0, musicaFerma: 0, musicaParti: 0, audio: [], appesi: [] };
    const classi = new Set();
    const ascoltatori = {};
    const finestra = { addEventListener: (tipo, fn) => { ascoltatori['w:' + tipo] = fn; } };
    const creaCoro = (s) => {
      registro.coro.push(s);
      return { ferma: () => { registro.coroFermato++; } };
    };
    if (o.festa) { finestra.PolloFesta = { coro: creaCoro }; }
    if (o.musicaSuona !== null) {
      finestra.Musica = {
        suStato: (fn) => fn({ suona: o.musicaSuona }),
        ferma: () => { registro.musicaFerma++; },
        parti: () => { registro.musicaParti++; }
      };
    }
    function Audio(src) {
      const a = {
        src: src,
        currentTime: 0,
        volume: 1,
        preload: '',
        play() { registro.play++; return o.rifiutata ? Promise.reject(new Error('rifiutata')) : Promise.resolve(); },
        pause() { registro.pause++; }
      };
      registro.audio.push(a);
      return a;
    }
    const documento = {
      addEventListener: (tipo, fn) => { ascoltatori[tipo] = fn; },
      documentElement: { classList: { add: (c) => classi.add(c), remove: (c) => classi.delete(c), contains: (c) => classi.has(c) } },
      head: { appendChild: (n) => { registro.appesi.push(n); } },
      createElement: (tag) => ({ tag: tag }),
      querySelector: (s) => (o.festaInPagina && s === 'script[src="js/festa.js"]' ? {} : null)
    };
    vm.runInNewContext(jsSlayer, {
      window: finestra,
      document: documento,
      Audio: Audio,
      Date: { now: orologio.adesso },
      setTimeout: orologio.setTimeout,
      clearTimeout: orologio.clearTimeout,
      setInterval: orologio.setInterval,
      clearInterval: orologio.clearInterval
    });
    const tasto = (key, extra) => ascoltatori.keydown(Object.assign({
      key: key, target: { tagName: 'BODY', nodeType: 1 }, ctrlKey: false, altKey: false, metaKey: false, repeat: false, isComposing: false, defaultPrevented: false
    }, extra || {}));
    const scrivi = (testo, extra, pausa) => {
      for (const c of testo) {
        tasto(c, extra);
        orologio.avanza(pausa === undefined ? 120 : pausa);
      }
    };
    return { orologio: orologio, registro: registro, classi: classi, finestra: finestra, tasto: tasto, scrivi: scrivi, ascoltatori: ascoltatori };
  };

  await prova('slayer.js: scrivendo SLAYER parte la canzone col coro di 21 secondi, e a 21 secondi finisce tutto', () => {
    const p = monta();
    p.scrivi('slayer');
    esigiUguale(p.registro.coro.join(','), '21', 'il coro deve partire una volta sola, per 21 secondi');
    esigiUguale(p.registro.audio.length, 1, 'un solo audio');
    esigiUguale(p.registro.audio[0].src, 'mp3/J%20(mp3cut.net).mp3', 'la canzone');
    esigiUguale(p.registro.play, 1, 'la canzone non parte');
    esigi(p.classi.has('slayer-festa'), 'manca la classe sulla pagina');
    esigiUguale(p.finestra.PolloSlayer.durata, 21000, 'la durata');
    p.orologio.avanza(20000);
    esigi(p.classi.has('slayer-festa') && p.finestra.PolloSlayer.inCorso(), 'e finita prima dei 21 secondi');
    esigiUguale(p.registro.coroFermato, 0, 'il coro e stato fermato prima dei 21 secondi');
    p.orologio.avanza(1000);
    esigi(!p.classi.has('slayer-festa') && !p.finestra.PolloSlayer.inCorso(), 'non e finita ai 21 secondi');
    esigiUguale(p.registro.coroFermato, 1, 'il coro non e stato fermato');
    esigi(p.registro.pause >= 1, 'la canzone non e stata fermata');
    esigiUguale(p.registro.audio[0].currentTime, 0, 'la canzone non e tornata all inizio');
    esigiUguale(p.registro.audio[0].volume, 0.9, 'il volume non e tornato a posto dopo la dissolvenza');
    p.scrivi('slayer');
    esigiUguale(p.registro.coro.length, 2, 'finita, si puo far ripartire');
  });

  await prova('slayer.js: minuscolo, maiuscolo, misto e con il blocco maiuscole', () => {
    const maiuscolo = monta();
    for (const c of 'SLAYER') { maiuscolo.tasto('Shift'); maiuscolo.tasto(c); maiuscolo.orologio.avanza(100); }
    esigiUguale(maiuscolo.registro.coro.length, 1, 'SLAYER con Shift');
    const misto = monta();
    for (const c of 'SlAyEr') { if (c === c.toUpperCase()) { misto.tasto('Shift'); } misto.tasto(c); misto.orologio.avanza(100); }
    esigiUguale(misto.registro.coro.length, 1, 'SlAyEr');
    const blocco = monta();
    blocco.tasto('CapsLock');
    blocco.scrivi('SLAYER');
    esigiUguale(blocco.registro.coro.length, 1, 'SLAYER con il blocco maiuscole');
    const dentro = monta();
    dentro.scrivi('ciao slayer ciao');
    esigiUguale(dentro.registro.coro.length, 1, 'la parola dentro una frase');
  });

  await prova('slayer.js: non parte scrivendo in un campo, tenendo premuto Ctrl, con i tasti che si ripetono, con pause lunghe o con altre lettere in mezzo', () => {
    const campo = monta();
    campo.scrivi('slayer', { target: { tagName: 'INPUT', nodeType: 1 } });
    campo.scrivi('slayer', { target: { tagName: 'TEXTAREA', nodeType: 1 } });
    campo.scrivi('slayer', { target: { tagName: 'DIV', nodeType: 1, isContentEditable: true } });
    esigiUguale(campo.registro.coro.length, 0, 'e partito scrivendo in un campo di testo');

    const ctrl = monta();
    ctrl.scrivi('slaye');
    ctrl.tasto('r', { ctrlKey: true });
    esigiUguale(ctrl.registro.coro.length, 0, 'e partito con Ctrl');

    const ripetuti = monta();
    ripetuti.scrivi('slayer', { repeat: true });
    esigiUguale(ripetuti.registro.coro.length, 0, 'e partito coi tasti che si ripetono');

    const lento = monta();
    lento.scrivi('slay');
    lento.orologio.avanza(2500);
    lento.scrivi('er');
    esigiUguale(lento.registro.coro.length, 0, 'e partito dopo una pausa lunga');

    const spezzato = monta();
    spezzato.scrivi('slaxyer');
    esigiUguale(spezzato.registro.coro.length, 0, 'e partito con una lettera in mezzo');

    const cancella = monta();
    cancella.scrivi('sla');
    cancella.tasto('Backspace');
    cancella.scrivi('yer');
    esigiUguale(cancella.registro.coro.length, 0, 'e partito dopo un Backspace');

    const vicino = monta();
    vicino.scrivi('slayerr slaye');
    esigiUguale(vicino.registro.coro.length, 1, 'slayerr conta una volta sola, slaye niente');
  });

  await prova('slayer.js: durante la sorpresa non riparte, e Esc la ferma subito', () => {
    const p = monta();
    p.scrivi('slayer');
    p.orologio.avanza(2000);
    p.scrivi('slayer');
    esigiUguale(p.registro.coro.length, 1, 'e ripartita mentre era in corso');
    p.tasto('Escape');
    esigi(!p.finestra.PolloSlayer.inCorso() && !p.classi.has('slayer-festa'), 'Esc non ferma');
    esigiUguale(p.registro.coroFermato, 1, 'Esc non ferma il coro');
    p.orologio.avanza(40000);
    esigiUguale(p.registro.coroFermato, 1, 'dopo Esc il coro viene fermato una seconda volta');
  });

  await prova('slayer.js: il lettore di sottofondo del sito si mette in pausa e riparte dopo, solo se suonava', () => {
    const suonava = monta({ musicaSuona: true });
    suonava.scrivi('slayer');
    esigiUguale(suonava.registro.musicaFerma, 1, 'la musica del sito non e stata fermata');
    esigiUguale(suonava.registro.musicaParti, 0, 'la musica riparte troppo presto');
    suonava.orologio.avanza(21000);
    esigiUguale(suonava.registro.musicaParti, 1, 'la musica del sito non riparte');

    const zitta = monta({ musicaSuona: false });
    zitta.scrivi('slayer');
    zitta.orologio.avanza(21000);
    esigiUguale(zitta.registro.musicaFerma + zitta.registro.musicaParti, 0, 'ha toccato una musica che non suonava');

    const senza = monta({ musicaSuona: null });
    senza.scrivi('slayer');
    senza.orologio.avanza(21000);
    esigiUguale(senza.registro.coro.length, 1, 'senza lettore la sorpresa non parte');
  });

  await prova('slayer.js: se il browser rifiuta la canzone i polletti partono lo stesso', () => {
    const p = monta({ rifiutata: true });
    p.scrivi('slayer');
    esigiUguale(p.registro.coro.length, 1, 'i polletti non partono senza canzone');
    p.orologio.avanza(21000);
    esigi(!p.finestra.PolloSlayer.inCorso(), 'non finisce');
  });

  await prova('slayer.js: nelle pagine senza polletti carica da solo dati, stile e festa, e solo alla prima volta', () => {
    const p = monta({ festa: false });
    p.scrivi('slayer');
    const stile = p.registro.appesi.find((n) => n.tag === 'link');
    const dati = p.registro.appesi.find((n) => n.tag === 'script' && n.src === 'js/dati.js');
    esigi(stile && stile.href === 'css/festa.css', 'lo stile dei polletti non viene caricato');
    esigi(dati !== undefined, 'js/dati.js non viene caricato');
    esigi(!p.registro.appesi.some((n) => n.src === 'js/festa.js'), 'festa.js viene caricato prima di dati.js');
    p.finestra.DATI = {};
    dati.onload();
    const festa = p.registro.appesi.find((n) => n.tag === 'script' && n.src === 'js/festa.js');
    esigi(festa !== undefined, 'js/festa.js non viene caricato dopo dati.js');
    p.finestra.PolloFesta = { coro: (s) => { p.registro.coro.push(s); return { ferma: () => { p.registro.coroFermato++; } }; } };
    festa.onload();
    esigiUguale(p.registro.coro.join(','), '21', 'il coro non parte a caricamento finito');

    const inPagina = monta({ festa: false, festaInPagina: true });
    inPagina.scrivi('slayer');
    inPagina.orologio.avanza(500);
    esigiUguale(inPagina.registro.appesi.length, 0, 'ricarica un file che la pagina sta gia caricando');
    inPagina.finestra.PolloFesta = { coro: (s) => { inPagina.registro.coro.push(s); return { ferma: () => {} }; } };
    inPagina.orologio.avanza(200);
    esigiUguale(inPagina.registro.coro.join(','), '21', 'non aspetta il festa.js della pagina');

    const mai = monta({ festa: false, festaInPagina: true });
    mai.scrivi('slayer');
    mai.orologio.avanza(25000);
    esigi(!mai.finestra.PolloSlayer.inCorso(), 'senza polletti la sorpresa non finisce');
  });

  await prova('la sorpresa e su tutte le pagine del sito, dopo la guardia e senza toccare l ordine dei primi script', () => {
    const riga = '<script src="js/slayer.js" defer></script>';
    for (const modello of ['index', 'clip', 'giochi', 'sponsor']) {
      const testo = fs.readFileSync(path.join(RADICE_VERA, 'modelli', modello + '.html'), 'utf8');
      esigiUguale(testo.split(riga).length - 1, 1, 'modelli/' + modello + '.html: lo script c e una volta sola');
      esigi(testo.indexOf('js/guardia.js') < testo.indexOf(riga), 'modelli/' + modello + '.html: lo script deve venire dopo la guardia');
    }
    const home = costruisci.rendi(archivio.leggi()).html;
    esigiUguale(home.split(riga).length - 1, 1, 'nella home generata');
    esigi(home.indexOf('js/ritorno.js') < home.indexOf(riga), 'ritorno.js non e piu il primo');
  });

  await prova('l interruttore del pannello: acceso lo script e in tutte le pagine, spento non viene nemmeno stampato', () => {
    const riga = '<script src="js/slayer.js" defer></script>';
    const campo = schema.campo('config.slayer.attivo');
    esigi(campo && campo.tipo === 'interruttore' && campo.predefinito === true, 'il campo nello schema deve essere un interruttore acceso di partenza');
    esigiUguale(schema.gruppi.find((g) => g.campi.some((c) => c.chiave === 'config.slayer.attivo')).id, 'pollo', 'il campo sta nel gruppo del pollo');
    esigiUguale(archivio.leggi().config.slayer.attivo, true, 'nei contenuti di partenza e acceso');
    esigiUguale(convalida.convalidaCampo('config.slayer.attivo', 'no').length > 0, true, 'l interruttore accetta una parola');
    esigiUguale(convalida.convalidaCampo('config.slayer.attivo', false).length, 0, 'l interruttore rifiuta un vero falso');

    const acceso = archivio.leggi();
    const pagineAccese = costruisci.rendi(acceso);
    esigiUguale(pagineAccese.html.split(riga).length - 1, 1, 'acceso: nella home');
    esigi(typeof pagineAccese.giochi !== 'string' || pagineAccese.giochi.split(riga).length - 1 === 1, 'acceso: nella pagina dei giochi');

    const spento = archivio.leggi();
    spento.config.slayer.attivo = false;
    const pagineSpente = costruisci.rendi(spento);
    esigi(pagineSpente.html.indexOf('js/slayer.js') === -1, 'spento: la home stampa ancora lo script');
    esigi(typeof pagineSpente.giochi !== 'string' || pagineSpente.giochi.indexOf('js/slayer.js') === -1, 'spento: la pagina dei giochi stampa ancora lo script');
    esigi(pagineSpente.html.indexOf('js/guardia.js') !== -1, 'spento: e sparita anche la guardia');
    esigiUguale(convalida.convalida(spento).length, 0, 'spento: i contenuti non passano la convalida');

    const vecchio = archivio.leggi();
    delete vecchio.config.slayer;
    esigiUguale(costruisci.rendi(vecchio).html.split(riga).length - 1, 1, 'senza la chiave (contenuti di ieri) la sorpresa resta accesa');
    schema.completa(vecchio);
    esigiUguale(vecchio.config.slayer.attivo, true, 'la chiave mancante viene aggiunta accesa');
    esigiUguale(JSON.stringify(schema.verificaCopertura(vecchio)), '[]', 'la copertura si lamenta');
  });

  await prova('slayer.js: la parola, la durata e la canzone sono quelle scelte, e il codice e pulito', () => {
    const p = monta();
    esigiUguale(p.finestra.PolloSlayer.parola, 'slayer', 'la parola');
    esigiUguale(p.finestra.PolloSlayer.durata, 21000, 'la durata');
    esigiUguale(p.finestra.PolloSlayer.canzone, 'mp3/J%20(mp3cut.net).mp3', 'il file della canzone');
    for (const [nome, testo] of [['js/slayer.js', jsSlayer], ['js/festa.js', jsFesta]]) {
      esigi(!/(^|[^:'"])\/\/ /m.test(testo) && testo.indexOf('/*') === -1, nome + ' contiene dei commenti');
      esigi(![...testo].some((c) => c.charCodeAt(0) > 127), nome + ' contiene caratteri non ASCII');
    }
    const htaccess = fs.readFileSync(path.join(RADICE_VERA, '.htaccess'), 'utf8');
    esigi(htaccess.indexOf('RewriteRule ^mp3/[^/]+\\.(mp3|m4a|ogg|opus|webm)$ - [L]') !== -1, 'l.htaccess non lascia passare i file di mp3 con spazi e parentesi');
  });
}

async function proveGiocoPollo(costruisci, archivio) {
  apriSezione('11f. Pollo Run: livelli veri, e il gioco anche sul sito scrivendo «pollorun»');

  const vm = require('node:vm');
  const fileGioco = path.join(RADICE_VERA, 'js', 'pollorun-gioco.js');
  const fileSito = path.join(RADICE_VERA, 'js', 'pollorun.js');
  const fileStile = path.join(RADICE_VERA, 'css', 'pollorun.css');
  const jsGioco = fs.readFileSync(fileGioco, 'utf8');
  const jsSito = fs.readFileSync(fileSito, 'utf8');

  const caricaMotore = () => {
    const finestra = {};
    vm.runInNewContext(jsGioco, { window: finestra });
    return finestra.PolloRun;
  };
  const motore = caricaMotore();
  const L = motore.livelli;
  const K = L.costanti;
  const creati = new Map();
  const creaLivello = (n) => {
    if (!creati.has(n)) { creati.set(n, L.crea(n)); }
    return creati.get(n);
  };

  const attornoCompleto = (M, x, mx) => {
    const at = { solidi: [], pericoli: [], mx: mx };
    for (const e of M.suoli) { if (e.x1 >= x - 1 && e.x0 <= x + 1) { at.solidi.push(e); } }
    for (const e of M.solidi) { if (e.x1 >= x - 1 && e.x0 <= x + 1) { at.solidi.push(e); } }
    for (const e of M.pericoli) { if (e.x1 >= x - 1 && e.x0 <= x + 1) { at.pericoli.push(e); } }
    return at;
  };

  const chiaveStato = (s) => Math.round(s.alt * 2000) + ':' + Math.round(s.va * 200) + ':' + (s.aTerra ? 1 : 0) + ':' + (s.buf > 0 ? 1 : 0);

  const percorsoGiocatore = (M, mx, decisione, daInizio) => {
    let corrente = [{ s: daInizio ? L.nuovoStato(M.v) : L.statoIniziale(M.v), prev: null, premi: false }];
    let indice = Math.round(corrente[0].s.t / K.PASSO);
    const primo = indice;
    let passi = 0;
    while (corrente.length && corrente[0].s.x < M.lunghezza + 4) {
      const at = attornoCompleto(M, corrente[0].s.x, mx);
      const prossimi = new Map();
      const decide = indice % decisione === 0;
      for (const nodo of corrente) {
        const a = L.copia(nodo.s);
        L.passo(a, at);
        if (!a.morto) {
          prossimi.set(chiaveStato(a), { s: a, prev: nodo, premi: false });
          if (a.aTerra && !nodo.s.aTerra) {
            const q = L.copia(a);
            q.va = K.V0;
            q.aTerra = false;
            q.salto = true;
            prossimi.set(chiaveStato(q), { s: q, prev: nodo, premi: 'buffer' });
          }
        }
        if (decide && nodo.s.aTerra) {
          const b = L.copia(nodo.s);
          b.richiesta = true;
          L.passo(b, at);
          if (!b.morto) { prossimi.set(chiaveStato(b), { s: b, prev: nodo, premi: true }); }
        }
      }
      corrente = Array.from(prossimi.values());
      indice++;
      passi++;
    }
    if (!corrente.length) { return null; }
    const secondi = [];
    let nodo = corrente[0];
    let i = indice;
    while (nodo.prev) {
      i--;
      if (nodo.premi === true) { secondi.push(i * K.PASSO); } else if (nodo.premi === 'buffer') { secondi.push((i - 8) * K.PASSO); }
      nodo = nodo.prev;
    }
    return { secondi: secondi.sort((x, y) => x - y), passi: passi, primo: primo };
  };

  const soloTerraPiatta = () => ({
    suoli: [{ x0: -1000, x1: 100000, b: K.FONDO, t: 0 }], solidi: [], pericoli: [], buche: [], lungoS: 0, lungoP: 0
  });

  const simula = (M, opzioni) => {
    const o = Object.assign({ v: 10, x: 5, premeAl: [], passi: 600, mx: 0 }, opzioni || {});
    const s = L.statoIniziale(o.v);
    s.x = o.x;
    const at = { solidi: [], pericoli: [], mx: o.mx };
    const traccia = { alt: [], morto: 0, atterrato: null, apice: 0 };
    let saltato = false;
    for (let i = 0; i < o.passi; i++) {
      if (o.premeAl.indexOf(i) !== -1) { s.richiesta = true; }
      const eraInAria = !s.aTerra;
      L.vicino(M, s.x, o.mx, at);
      L.passo(s, at);
      traccia.alt.push(s.alt);
      traccia.apice = Math.max(traccia.apice, s.alt);
      if (!s.aTerra) { saltato = true; }
      if (saltato && s.aTerra && eraInAria && traccia.atterrato === null) { traccia.atterrato = i; }
      if (s.morto) { traccia.morto = s.morto; break; }
    }
    traccia.stato = s;
    return traccia;
  };

  const conElementi = (elementi) => {
    const M = soloTerraPiatta();
    for (const e of elementi) {
      if (e.tipo === 'blocco') { const b = { x0: e.x0, x1: e.x1, b: e.b === undefined ? K.FONDO : e.b, t: e.t }; M.solidi.push(b); M.lungoS = Math.max(M.lungoS, b.x1 - b.x0); }
      if (e.tipo === 'punta') { M.pericoli.push({ x0: e.x0, x1: e.x1, y0: 0, y1: 0.465 }); M.lungoP = Math.max(M.lungoP, e.x1 - e.x0); }
      if (e.tipo === 'buca') {
        M.buche.push({ x0: e.x0, x1: e.x1 });
      }
    }
    if (M.buche.length) {
      const suoli = [];
      let da = -1000;
      for (const b of M.buche) { suoli.push({ x0: da, x1: b.x0, b: K.FONDO, t: 0 }); da = b.x1; }
      suoli.push({ x0: da, x1: 100000, b: K.FONDO, t: 0 });
      M.suoli = suoli;
    }
    M.solidi.sort((a, b) => a.x0 - b.x0);
    M.pericoli.sort((a, b) => a.x0 - b.x0);
    return M;
  };

  await prova('pollorun-gioco.js, pollorun.js e pollorun.css: si compilano e non hanno commenti', () => {
    for (const [nome, testo] of [['pollorun-gioco.js', jsGioco], ['pollorun.js', jsSito]]) {
      try { new Function(testo); } catch (errore) { throw new Error(nome + ': ' + errore.message); }
      esigi(!/\/\/|\/\*/.test(testo), nome + ' contiene commenti');
    }
    esigi(!/\/\*/.test(fs.readFileSync(fileStile, 'utf8')), 'pollorun.css contiene commenti');
  });

  await prova('fisica: un salto dura 2 V0 / G, sale di 1,5 caselle e ricade dove ha iniziato', () => {
    const t = simula(soloTerraPiatta(), { premeAl: [0], passi: 200 });
    esigiUguale(t.morto, 0, 'muore saltando sul piano');
    esigi(Math.abs(t.apice - 1.5) < 0.06, 'apice ' + t.apice);
    esigi(t.atterrato !== null && Math.abs(t.atterrato * K.PASSO - K.ARIA) < 0.03, 'aria ' + (t.atterrato * K.PASSO) + ' invece di ' + K.ARIA);
    esigiUguale(t.stato.alt, 0, 'non e tornato a terra');
  });

  await prova('fisica: una punta uccide chi la tocca e lascia passare chi la salta', () => {
    const M = conElementi([{ tipo: 'punta', x0: 12, x1: 12.25 }]);
    esigiUguale(simula(M, { passi: 200 }).morto, 1, 'correndo contro la punta non muore');
    const passo = Math.round((12 - 5 - 3.2) / 10 / K.PASSO);
    esigiUguale(simula(M, { premeAl: [passo], passi: 260 }).morto, 0, 'saltando in tempo muore lo stesso');
  });

  await prova('fisica: si atterra sopra un blocco, ci si corre sopra e si cade dal bordo; il fianco invece uccide', () => {
    const M = conElementi([{ tipo: 'blocco', x0: 12, x1: 20, t: 0.62 }]);
    esigiUguale(simula(M, { passi: 200 }).morto, 2, 'correndo contro il blocco non muore');
    const sopra = simula(M, { premeAl: [Math.round(0.55 / K.PASSO)], passi: 330 });
    esigiUguale(sopra.morto, 0, 'saltando sul blocco muore');
    esigi(sopra.alt.some((a) => Math.abs(a - 0.62) < 1e-9), 'non atterra mai sulla cima');
    esigiUguale(sopra.stato.alt, 0, 'dal bordo del blocco non ricade a terra');
    const alto = conElementi([{ tipo: 'blocco', x0: 12, x1: 20, t: 1.24 }]);
    esigiUguale(simula(alto, { premeAl: [Math.round(0.4 / K.PASSO)], passi: 330 }).morto, 0, 'la cima a 2 caselle non si raggiunge con un salto ben fatto');
  });

  await prova('fisica: una buca inghiotte chi non salta, e chi salta ne esce', () => {
    const M = conElementi([{ tipo: 'buca', x0: 12, x1: 15.5 }]);
    esigiUguale(simula(M, { passi: 400 }).morto, 3, 'corre sulla buca e non cade');
    esigiUguale(simula(M, { premeAl: [Math.round(0.55 / K.PASSO)], passi: 400 }).morto, 0, 'salta la buca e cade lo stesso');
  });

  await prova('fisica: premere in aria fa saltare di nuovo appena si tocca terra, ma solo entro 0,14 secondi', () => {
    const M = soloTerraPiatta();
    const presto = simula(M, { premeAl: [0, 60], passi: 300 });
    esigi(presto.alt.filter((a, i) => i > 72 && a > 0.05).length > 30, 'con il tasto premuto in aria non salta di nuovo');
    esigiUguale(presto.stato.salti, 2, 'il salto ripartito da solo all atterraggio non viene contato');
    const troppoPresto = simula(M, { premeAl: [0, 20], passi: 300 });
    esigi(troppoPresto.alt.filter((a, i) => i > 90 && a > 0.05).length === 0, 'il tasto premuto troppo presto salta lo stesso');
    esigiUguale(troppoPresto.stato.salti, 1, 'i salti contati sono piu di quelli fatti');
    esigiUguale(simula(M, { premeAl: [], passi: 200 }).stato.salti, 0, 'senza premere niente c e un salto contato');
  });

  const nomiFigura = { punta: 1, punte: 1.2, blocco: 1.45, piattaforma: 1.75, piattaformaPunte: 2.3, catena: 3, buca: 3.8, scala: 4.8, bucaPunta: 5.6, romboPunta: 6.2, vallata: 7, isole: 8, piattaformaRombo: 9, catenaMista: 10.2, scalaPunte: 12 };

  await prova('livelli: sempre gli stessi per lo stesso numero, e diversi tra loro', () => {
    const a = creaLivello(7);
    const b = caricaMotore().livelli.crea(7);
    esigiUguale(JSON.stringify(a.el), JSON.stringify(b.el), 'lo stesso livello cambia');
    esigi(JSON.stringify(creaLivello(8).el) !== JSON.stringify(a.el), 'due livelli uguali');
  });

  await prova('livelli: velocita in salita, margini sempre piu stretti, mai un ostacolo che non si e ancora sbloccato', () => {
    let vPrima = 0;
    let tauPrima = 1;
    for (let n = 1; n <= 60; n++) {
      const P = L.parametri(n);
      esigi(P.v >= vPrima, 'la velocita scende al livello ' + n);
      esigi(P.tau <= tauPrima, 'il margine si allarga al livello ' + n);
      esigi(P.durata >= 60 && P.durata <= 150, 'durata fuori misura al livello ' + n);
      esigi(Math.abs(P.durata - Math.min(150, 60 + 4 * (n - 1))) < 1e-9, 'la durata non segue la formula al livello ' + n);
      esigi(P.mx <= P.v * P.tau * 0.3 + 1e-9, 'il margine di sicurezza non e quello di fine livello al livello ' + n);
      vPrima = P.v;
      tauPrima = P.tau;
    }
    for (let n = 1; n <= 30; n++) {
      for (const nome of creaLivello(n).figure) { esigi(nomiFigura[nome] < n + 1, 'la figura ' + nome + ' compare al livello ' + n + ' prima di sbloccarsi'); }
    }
  });

  await prova('livelli: piu si sale piu ostacoli ci sono e piu sono complessi: buche, scale, isolotti, rombi, catene', () => {
    const densita = (da, a) => {
      let el = 0;
      let lung = 0;
      for (let n = da; n <= a; n++) { const M = creaLivello(n); el += M.el.length; lung += M.lunghezza; }
      return el / lung * 100;
    };
    esigi(densita(20, 26) > densita(1, 3) * 1.3, 'gli ostacoli non aumentano: ' + densita(1, 3).toFixed(1) + ' contro ' + densita(20, 26).toFixed(1));
    const tipiIn = (da, a) => {
      const visti = new Set();
      for (let n = da; n <= a; n++) { for (const nome of creaLivello(n).figure) { visti.add(nome); } }
      return visti;
    };
    esigi(Array.from(tipiIn(1, 1)).every((nome) => ['punta', 'punte', 'blocco', 'piattaforma'].indexOf(nome) !== -1), 'il primo livello ha figure complesse: ' + Array.from(tipiIn(1, 1)).join(','));
    esigi(tipiIn(1, 1).has('punta') && Array.from(tipiIn(1, 1)).length >= 3, 'il primo livello non introduce a poco a poco le figure: ' + Array.from(tipiIn(1, 1)).join(','));
    for (const complessa of ['buca', 'scala', 'isole', 'vallata', 'romboPunta', 'catena']) {
      esigi(!tipiIn(1, 2).has(complessa), complessa + ' arriva troppo presto');
      esigi(tipiIn(15, 30).has(complessa), complessa + ' non arriva mai');
    }
    esigi(tipiIn(20, 30).size >= 12, 'nei livelli alti le figure diverse sono solo ' + tipiIn(20, 30).size);
    const buche = creaLivello(1).el.concat(creaLivello(2).el).filter((e) => e.k === 'u' || (e.k === 'b' && e.pil));
    esigiUguale(buche.length, 0, 'buche nei primi livelli');
  });

  await prova('livelli: ogni livello e superabile, anche con il margine di sicurezza (risolutore indipendente)', () => {
    for (const n of [1, 2, 3, 5, 8, 12, 16, 22, 30, 45, 75, 100]) {
      const M = creaLivello(n);
      const senzaMargine = percorsoGiocatore(M, 0, 2, false);
      esigi(senzaMargine, 'il livello ' + n + ' non e superabile');
      const conMargine = percorsoGiocatore(M, M.mx, 1, false);
      esigi(conMargine, 'il livello ' + n + ' non e superabile con il margine di sicurezza');
    }
  });

  await prova('livelli: rincorsa iniziale, respiro prima del traguardo, terra piatta dopo', () => {
    for (const n of [1, 5, 10, 20, 40]) {
      const M = creaLivello(n);
      const primo = Math.min.apply(null, M.el.map((e) => e.x));
      const ultimo = Math.max.apply(null, M.el.map((e) => e.x1));
      esigi(primo >= M.v * 1.6, 'livello ' + n + ': il primo ostacolo e troppo vicino alla partenza');
      esigi(ultimo <= M.lunghezza - M.v * 1.8, 'livello ' + n + ': ostacoli troppo vicini al traguardo');
      esigi(M.buche.every((b) => b.x1 < M.lunghezza), 'livello ' + n + ': una buca dopo il traguardo');
    }
  });

  const DIFFICOLTA = ['facile', 'medio', 'difficile', 'estremo'];
  const creatiPer = new Map();
  const tempiPer = new Map();
  const creaDi = (n, d) => {
    const k = d + ':' + n;
    if (!creatiPer.has(k)) {
      const inizio = process.hrtime.bigint();
      creatiPer.set(k, d === 'medio' ? creaLivello(n) : L.crea(n, d));
      tempiPer.set(k, Number(process.hrtime.bigint() - inizio) / 1e6);
    }
    return creatiPer.get(k);
  };
  const ostacoliAlSecondo = (d, da, a) => {
    let el = 0;
    let secondi = 0;
    for (let n = da; n <= a; n++) { const M = creaDi(n, d); el += M.el.length; secondi += M.lunghezza / M.v; }
    return el / secondi;
  };

  await prova('difficolta: MEDIO e la partita di sempre, identica al livello senza difficolta; un nome sconosciuto vale MEDIO', () => {
    esigiUguale(L.difficolta.join(','), DIFFICOLTA.join(','), 'elenco delle difficolta');
    for (let n = 1; n <= 12; n++) {
      esigiUguale(JSON.stringify(L.crea(n, 'medio').el), JSON.stringify(creaLivello(n).el), 'il livello ' + n + ' a MEDIO cambia');
      esigiUguale(JSON.stringify(L.parametri(n, 'medio')), JSON.stringify(L.parametri(n)), 'i parametri del livello ' + n + ' a MEDIO cambiano');
    }
    esigiUguale(L.parametri(3).v, 9.6, 'la velocita del livello 3 di sempre');
    esigiUguale(JSON.stringify(L.crea(4, 'boh').el), JSON.stringify(creaLivello(4).el), 'una difficolta sconosciuta non vale MEDIO');
    esigiUguale(L.crea(4, 'boh').difficolta, 'medio', 'il livello non dice la sua difficolta');
    esigiUguale(creaDi(4, 'estremo').difficolta, 'estremo', 'il livello estremo non dice la sua difficolta');
  });

  await prova('difficolta: per ciascuna delle 4 i livelli 1-12, 20 e 30 si generano in fretta e si finiscono (risolutore indipendente)', () => {
    for (const d of DIFFICOLTA) {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 30]) {
        const M = creaDi(n, d);
        esigi(M.figure.length >= 10, d + ' livello ' + n + ': solo ' + M.figure.length + ' figure');
        esigi(percorsoGiocatore(M, 0, 2, false), d + ': il livello ' + n + ' non e superabile');
        if (n === 1 || n === 8 || n === 20) { esigi(percorsoGiocatore(M, M.mx, 1, false), d + ': il livello ' + n + ' non e superabile con il margine di sicurezza'); }
        const primo = Math.min.apply(null, M.el.map((e) => e.x));
        esigi(primo >= M.v * 1.6, d + ' livello ' + n + ': il primo ostacolo e troppo vicino alla partenza');
        esigi(Math.max.apply(null, M.el.map((e) => e.x1)) <= M.lunghezza - M.v * 1.8, d + ' livello ' + n + ': ostacoli troppo vicini al traguardo');
      }
    }
    const lenti = Array.from(tempiPer.entries()).filter((v) => v[1] > 4000);
    esigiUguale(lenti.map((v) => v[0] + ' ' + Math.round(v[1]) + 'ms').join(', '), '', 'livelli troppo lenti da generare');
  });

  await prova('difficolta: da FACILE a ESTREMO il pollo corre piu veloce, gli ostacoli al secondo aumentano e le figure complesse arrivano prima', () => {
    for (let n = 1; n <= 40; n++) {
      const v = DIFFICOLTA.map((d) => L.parametri(n, d).v);
      for (let i = 1; i < v.length; i++) { esigi(v[i] > v[i - 1], 'livello ' + n + ': la velocita non cresce da ' + DIFFICOLTA[i - 1] + ' a ' + DIFFICOLTA[i] + ' (' + v.join(', ') + ')'); }
      const P = L.parametri(n, 'estremo');
      esigi(P.mx <= P.v * P.tau * 0.3 + 1e-9, 'margine di sicurezza sbagliato a ESTREMO al livello ' + n);
    }
    for (const [da, a] of [[1, 3], [4, 8], [9, 12]]) {
      const densita = DIFFICOLTA.map((d) => ostacoliAlSecondo(d, da, a));
      for (let i = 1; i < densita.length; i++) {
        esigi(densita[i] > densita[i - 1] * 1.03, 'livelli ' + da + '-' + a + ': gli ostacoli al secondo non crescono da ' + DIFFICOLTA[i - 1] + ' a ' + DIFFICOLTA[i] + ' (' + densita.map((x) => x.toFixed(2)).join(', ') + ')');
      }
    }
    const semplici = ['punta', 'punte', 'blocco', 'piattaforma'];
    esigi(creaDi(1, 'facile').figure.every((nome) => semplici.indexOf(nome) !== -1), 'FACILE livello 1 ha figure complesse');
    esigi(creaDi(2, 'facile').figure.every((nome) => nomiFigura[nome] < 3), 'FACILE livello 2 ha figure da livello 3');
    esigi(creaDi(4, 'facile').figure.every((nome) => nomiFigura[nome] < 4), 'FACILE livello 4 ha figure che a MEDIO arrivano dopo');
    const estremo1 = new Set(creaDi(1, 'estremo').figure);
    esigi(['catena', 'buca', 'scala', 'bucaPunta', 'romboPunta'].filter((nome) => estremo1.has(nome)).length >= 3, 'a ESTREMO le figure complesse non arrivano subito: ' + Array.from(estremo1).join(','));
    const difficile1 = new Set(creaDi(1, 'difficile').figure);
    esigi(difficile1.has('piattaformaPunte'), 'a DIFFICILE il livello 1 non anticipa nessuna figura: ' + Array.from(difficile1).join(','));
  });

  const rendiFinta = (casuale, forma) => {
    const registro = { testi: [], scritte: [], suPartita: [], suChiudi: 0, ascoltatori: {}, memoria: {}, timer: [], eventi: [], voci: [], ordine: [], contorni: 0 };
    let inAttesa = null;
    let ora = 1000;
    const larghezzaDi = (t, testo) => {
      const corpo = /(\d+)px/.exec(String(t.font || ''));
      return String(testo).length * (forma && corpo ? Number(corpo[1]) * 0.6 : 8);
    };
    const contesto = new Proxy({}, {
      get(t, nome) {
        if (nome === 'fillText') { return (testo, x, y) => { registro.testi.push(String(testo)); registro.scritte.push({ testo: String(testo), x: x, y: y, largo: larghezzaDi(t, testo) }); }; }
        if (nome === 'strokeText') { return () => { registro.contorni++; }; }
        if (nome === 'measureText') { return (testo) => ({ width: larghezzaDi(t, testo) }); }
        if (nome === 'createLinearGradient') { return () => ({ addColorStop: () => {} }); }
        if (nome in t) { return t[nome]; }
        return () => {};
      },
      set(t, nome, valore) { t[nome] = valore; return true; }
    });
    const tela = { getContext: () => contesto, getBoundingClientRect: () => ({ width: forma ? forma.largo : 1200, height: forma ? forma.alto : 380 }), width: 0, height: 0 };
    const finestra = {
      matchMedia: (domanda) => ({ matches: !!(forma && forma.tocco && domanda.indexOf('coarse') !== -1) }),
      devicePixelRatio: 1,
      addEventListener: (tipo, fn) => { registro.ascoltatori['w:' + tipo] = fn; },
      removeEventListener: (tipo) => { delete registro.ascoltatori['w:' + tipo]; }
    };
    const documento = {
      hidden: false,
      documentElement: {},
      addEventListener: (tipo, fn) => { registro.ascoltatori[tipo] = fn; },
      removeEventListener: (tipo) => { delete registro.ascoltatori[tipo]; }
    };
    const memoria = registro.memoria;
    vm.runInNewContext(jsGioco, {
      window: finestra,
      document: documento,
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
      Image: function () { },
      localStorage: { getItem: (k) => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); } },
      requestAnimationFrame: (cb) => { inAttesa = cb; return 1; },
      cancelAnimationFrame: () => { inAttesa = null; },
      setTimeout: (fn) => { registro.timer.push(fn); return registro.timer.length; },
      clearTimeout: () => {},
      Math: casuale === undefined ? Math : Object.create(Math, { random: { value: () => casuale } }),
      JSON: JSON,
      Date: Date
    });
    const frasi = ['Prima frase di prova', 'Seconda frase di prova'];
    const canzoni = [
      { titolo: 'Prima', autore: 'Uno', file: 'mp3/prima.mp3' },
      { titolo: 'Seconda', autore: '', file: 'mp3/seconda.mp3' },
      { titolo: 'Terza', autore: 'Tre', file: 'mp3/terza.mp3' }
    ];
    const crea = (extra) => finestra.PolloRun.crea(Object.assign({
      tela: tela, pollo: 'img/mascotte.webp', frasi: frasi, canzoni: canzoni, modo: 'ordine', fissa: 0,
      suPartita: (a) => { registro.suPartita.push(a); registro.ordine.push('partita:' + a); },
      suCanzone: (v) => { registro.eventi.push(v ? v.file : null); registro.voci.push(v); registro.ordine.push('canzone:' + (v ? v.file : null)); },
      suChiudi: () => { registro.suChiudi++; }
    }, extra || {}));
    const frame = (dtMs) => {
      ora += dtMs;
      const cb = inAttesa;
      inAttesa = null;
      if (cb) { cb(ora); }
      return !!cb;
    };
    const tasto = (key, code, extra) => {
      const fn = registro.ascoltatori.keydown;
      if (!fn) { return; }
      fn(Object.assign({ key: key, code: code || key, altKey: false, ctrlKey: false, metaKey: false, repeat: false, target: { closest: () => null }, preventDefault: () => {} }, extra || {}));
    };
    const testiUltimo = (dtMs) => { registro.testi = []; registro.scritte = []; frame(dtMs === undefined ? 1000 / 60 : dtMs); return registro.testi.join('|'); };
    const tocca = (x, y, extra) => {
      const fn = registro.ascoltatori.pointerdown;
      if (!fn) { return; }
      fn(Object.assign({ button: 0, clientX: x, clientY: y, target: tela, preventDefault: () => {} }, extra || {}));
    };
    const attendi = (secondi) => { for (let t = 0; t < secondi; t += 1 / 60) { frame(1000 / 60); } };
    return { registro: registro, crea: crea, frame: frame, tasto: tasto, tocca: tocca, testiUltimo: testiUltimo, attendi: attendi, finestra: finestra, frasi: frasi, canzoni: canzoni, ora: () => ora };
  };

  const giocaSchedule = (h, secondi, dtMs, limiteSec) => {
    let t = 0;
    let indice = 0;
    let esito = null;
    const limite = limiteSec * 1000;
    while (t * 1000 < limite && !esito) {
      while (indice < secondi.length && secondi[indice] <= t) { h.tasto(' ', 'Space'); indice++; }
      h.registro.testi = [];
      const eventiPrima = h.registro.eventi.length;
      h.frame(dtMs);
      t += dtMs / 1000;
      const testo = h.registro.testi.join('|');
      if (testo.indexOf('COMPLETATO') !== -1) { esito = 'vinto'; }
      if (h.registro.eventi.slice(eventiPrima).indexOf(null) !== -1) { esito = 'morto'; }
    }
    return { esito: esito, t: t };
  };

  await prova('gioco: morendo il gioco si ferma su GAME OVER e aspetta SPAZIO per riprovare lo stesso livello, senza ripartire da solo', () => {
    const h = rendiFinta();
    h.crea().avvia();
    esigiDentro(h.testiUltimo(), 'POLLO RUN', 'schermata iniziale');
    h.tasto(' ', 'Space');
    esigiUguale(h.registro.suPartita.join(','), 'true', 'la partita non viene annunciata');
    esigiDentro(h.testiUltimo(), 'LIVELLO 1', 'il livello 1 non parte');
    const r = giocaSchedule(h, [], 1000 / 60, 40);
    esigiUguale(r.esito, 'morto', 'senza saltare non muore');
    const morto = h.testiUltimo();
    esigiDentro(morto, 'GAME OVER', 'manca la scritta di fine partita');
    esigiDentro(morto, 'SPAZIO per riprovare il livello 1', 'manca l invito a riprovare');
    h.tasto(' ', 'Space');
    esigiDentro(h.testiUltimo(), 'GAME OVER', 'SPAZIO subito dopo la morte fa ripartire troppo presto');
    h.attendi(4);
    esigiDentro(h.testiUltimo(), 'GAME OVER', 'il gioco riparte da solo dopo la morte');
    esigiUguale(h.registro.eventi[h.registro.eventi.length - 1], null, 'la canzone riparte da sola dopo la morte');
    h.tasto(' ', 'Space');
    const dopo = h.testiUltimo();
    esigiDentro(dopo, 'LIVELLO 1', 'non riparte il livello');
    esigiDentro(dopo, 'TENTATIVO 2', 'il secondo tentativo non e contato');
    esigiUguale(h.registro.suPartita.join(','), 'true', 'la partita e stata annunciata di nuovo');
    esigiUguale(h.registro.eventi.join(','), 'mp3/prima.mp3,,mp3/prima.mp3', 'a ogni tentativo la stessa canzone riparte da capo, e alla morte si ferma');
    const morto2 = giocaSchedule(h, [], 1000 / 60, 40);
    esigiUguale(morto2.esito, 'morto', 'il secondo tentativo senza saltare non muore');
    h.attendi(10);
    esigiDentro(h.testiUltimo(), 'GAME OVER', 'torna alla schermata iniziale troppo presto');
    h.attendi(3);
    esigiDentro(h.testiUltimo(), 'POLLO RUN', 'dopo 12 secondi fermo non torna alla schermata iniziale');
    esigiUguale(h.registro.suPartita.join(','), 'true,false', 'uscendo dalla partita non lo annuncia');
  });

  await prova('gioco: la canzone segue la modalita scelta: una per livello in ordine, sempre la stessa, o a caso senza ripetersi', () => {
    const daLivello = (modo, fissa, livelloIniziale, casuale) => {
      const h = rendiFinta(casuale);
      h.registro.memoria['sb-pollo-livello'] = String(livelloIniziale);
      h.crea({ modo: modo, fissa: fissa }).avvia();
      h.tasto('Enter', 'Enter');
      return h;
    };
    const primo = (h) => h.registro.eventi[0];
    esigiUguale(primo(daLivello('ordine', 0, 1)), 'mp3/prima.mp3', 'ordine, livello 1');
    esigiUguale(primo(daLivello('ordine', 0, 2)), 'mp3/seconda.mp3', 'ordine, livello 2');
    esigiUguale(primo(daLivello('ordine', 0, 3)), 'mp3/terza.mp3', 'ordine, livello 3');
    esigiUguale(primo(daLivello('ordine', 0, 4)), 'mp3/prima.mp3', 'ordine, livello 4: l elenco ricomincia');
    esigiUguale(primo(daLivello('fissa', 2, 1)), 'mp3/terza.mp3', 'fissa sulla terza, livello 1');
    esigiUguale(primo(daLivello('fissa', 2, 7)), 'mp3/terza.mp3', 'fissa sulla terza, livello 7');
    esigiUguale(primo(daLivello('fissa', 9, 1)), 'mp3/prima.mp3', 'fissa oltre la fine dell elenco');
    esigiUguale(primo(daLivello('sbagliata', 0, 2)), 'mp3/seconda.mp3', 'una modalita sconosciuta vale ordine');

    const h = daLivello('ordine', 0, 2);
    const voce = h.registro.voci[0];
    esigiUguale(voce.titolo + '|' + voce.autore + '|' + voce.indice, 'Seconda||1', 'la voce data all ospite');
    esigiUguale(h.registro.ordine.slice(0, 2).join(','), 'partita:true,canzone:mp3/seconda.mp3', 'suPartita deve arrivare prima della canzone');
    giocaSchedule(h, [], 1000 / 60, 40);
    h.attendi(0.6);
    h.tasto(' ', 'Space');
    giocaSchedule(h, [], 1000 / 60, 40);
    h.attendi(0.6);
    h.tasto(' ', 'Space');
    esigiUguale(h.registro.eventi.join(','), 'mp3/seconda.mp3,,mp3/seconda.mp3,,mp3/seconda.mp3', 'i tentativi dello stesso livello riprendono la stessa canzone');

    const caso = rendiFinta(0);
    caso.crea({ modo: 'caso' }).avvia();
    caso.tasto(' ', 'Space');
    esigiUguale(caso.registro.eventi[0], 'mp3/prima.mp3', 'a caso, il primo livello');
    const preparata = rendiFinta(0);
    preparata.crea({ modo: 'caso', primaCanzone: 2 }).avvia();
    preparata.tasto(' ', 'Space');
    esigiUguale(preparata.registro.eventi[0], 'mp3/terza.mp3', 'a caso, la prima canzone deve essere quella gia scaricata dal sito');
    const M1 = creaLivello(1);
    const p1 = percorsoGiocatore(M1, M1.mx * 0.5, 2, true);
    esigiUguale(giocaSchedule(caso, p1.secondi, 1000 / 60, 200).esito, 'vinto', 'il livello 1 non si finisce');
    caso.attendi(1);
    caso.tasto(' ', 'Space');
    const seconda = caso.registro.eventi[caso.registro.eventi.length - 1];
    esigi(seconda !== null && seconda !== 'mp3/prima.mp3', 'a caso, il livello dopo ripete la stessa canzone anche se il caso la sceglie di nuovo: ' + seconda);

    const senza = rendiFinta();
    senza.crea({ canzoni: [] }).avvia();
    senza.tasto(' ', 'Space');
    esigiUguale(senza.registro.eventi.length, 1, 'senza canzoni l ospite deve ricevere un solo evento');
    esigiUguale(senza.registro.eventi[0], null, 'senza canzoni l evento e uno stop');
  });

  await prova('gioco: lo stile di partenza e synthwave, geometrydash si sceglie a parte e un valore sconosciuto vale synthwave; entrambi finiscono un livello', () => {
    const contorni = (opzioniStile) => {
      const h = rendiFinta();
      h.crea(opzioniStile).avvia();
      h.testiUltimo();
      h.tasto(' ', 'Space');
      giocaSchedule(h, [], 1000 / 60, 40);
      h.testiUltimo();
      h.attendi(1);
      return h.registro.contorni;
    };
    esigiUguale(contorni({}), 0, 'senza stile deve essere synthwave');
    esigiUguale(contorni({ stile: 'synthwave' }), 0, 'stile synthwave');
    esigiUguale(contorni({ stile: 'boh' }), 0, 'stile sconosciuto');
    esigiUguale(contorni({ stile: 'GEOMETRYDASH' }), 0, 'le maiuscole non contano come geometrydash');
    esigi(contorni({ stile: 'geometrydash' }) > 0, 'lo stile geometrydash non disegna i contorni dei testi');

    const M1 = creaLivello(1);
    const p1 = percorsoGiocatore(M1, M1.mx * 0.5, 2, true);
    esigi(p1, 'nessun percorso per il livello 1');
    for (const nomeStile of ['synthwave', 'geometrydash']) {
      const h = rendiFinta();
      h.crea({ stile: nomeStile }).avvia();
      h.tasto(' ', 'Space');
      esigiUguale(giocaSchedule(h, p1.secondi, 1000 / 60, 200).esito, 'vinto', nomeStile + ': il livello 1 non si finisce');
      h.attendi(1);
      const schermata = h.testiUltimo();
      esigiDentro(schermata, 'LIVELLO 1 COMPLETATO', nomeStile + ': titolo di fine livello');
      esigiDentro(schermata, 'SPAZIO per il livello 2', nomeStile + ': invito al livello dopo');
      esigiDentro(schermata, 'TENTATIVI 1', nomeStile + ': statistica dei tentativi');
      h.tasto(' ', 'Space');
      esigiDentro(h.testiUltimo(), 'LIVELLO 2', nomeStile + ': SPAZIO non porta al livello 2');
    }
  });

  await prova('gioco: finito il livello 1 compare LIVELLO 1 COMPLETATO con una frase, e SPAZIO porta al livello 2', () => {
    const h = rendiFinta();
    h.crea().avvia();
    h.tasto(' ', 'Space');
    const M = creaLivello(1);
    const p = percorsoGiocatore(M, M.mx * 0.5, 2, true);
    esigi(p, 'nessun percorso per il livello 1');
    const r = giocaSchedule(h, p.secondi, 1000 / 60, 200);
    esigiUguale(r.esito, 'vinto', 'il livello 1 non si finisce');
    esigi(Math.abs(r.t - M.lunghezza / M.v) < 1.5, 'il livello dura ' + r.t.toFixed(1) + ' secondi invece di circa ' + (M.lunghezza / M.v).toFixed(1));
    h.attendi(1);
    const schermata = h.testiUltimo();
    esigiDentro(schermata, 'LIVELLO 1 COMPLETATO', 'titolo di fine livello');
    esigiDentro(schermata, 'SPAZIO per il livello 2', 'invito al livello dopo');
    esigiDentro(schermata, 'TENTATIVI 1', 'statistica dei tentativi');
    const salti = /SALTI (\d+)/.exec(schermata);
    esigi(salti && Number(salti[1]) >= 25, 'statistica dei salti: ' + (salti && salti[1]));
    const tempo = /TEMPO (\d+):(\d\d)/.exec(schermata);
    esigi(tempo && Math.abs(Number(tempo[1]) * 60 + Number(tempo[2]) - M.lunghezza / M.v) < 3, 'statistica del tempo: ' + schermata);
    esigiDentro(schermata, '♪ Prima — Uno', 'la canzone non e nella schermata di fine livello');
    esigi(h.frasi.some((f) => schermata.indexOf(f) !== -1), 'nessuna frase di scherno: ' + schermata);
    esigiUguale(h.registro.memoria['sb-pollo-livello'], '2', 'il livello raggiunto non e salvato');
    h.tasto(' ', 'Space');
    const partito = h.testiUltimo();
    esigiDentro(partito, 'LIVELLO 2', 'SPAZIO non porta al livello 2');
    esigi(partito.indexOf('COMPLETATO') === -1, 'e ancora la schermata di fine livello');
    esigiDentro(partito, 'TENTATIVO 1', 'i tentativi non ripartono da 1');
    esigiUguale(h.registro.suPartita.join(','), 'true', 'passare di livello non deve fermare e riavviare la musica');
  });

  await prova('gioco: le frasi di scherno escono una per livello, a caso e senza ripetersi finche non sono finite', () => {
    const h = rendiFinta();
    h.crea().avvia();
    h.tasto(' ', 'Space');
    const viste = [];
    for (let n = 1; n <= 4; n++) {
      const M = creaLivello(n);
      const p = percorsoGiocatore(M, M.mx * 0.5, 2, true);
      esigi(p, 'nessun percorso per il livello ' + n);
      const r = giocaSchedule(h, p.secondi, 1000 / 60, 200);
      esigiUguale(r.esito, 'vinto', 'il livello ' + n + ' non si finisce');
      h.attendi(1);
      const s = h.testiUltimo();
      viste.push(h.frasi.find((f) => s.indexOf(f) !== -1));
      h.tasto(' ', 'Space');
    }
    esigi(viste.every(Boolean), 'una frase manca: ' + JSON.stringify(viste));
    esigi(viste[0] !== viste[1] && viste[2] !== viste[3], 'le frasi si ripetono di seguito: ' + JSON.stringify(viste));
    esigiUguale(new Set(viste.slice(0, 2)).size, 2, 'in due livelli si e ripetuta una frase con solo due a disposizione');
  });

  await prova('gioco: la fisica e a passo fisso, quindi il livello si finisce uguale a 60, 144 e 30 fotogrammi al secondo', () => {
    const M = creaLivello(1);
    const p = percorsoGiocatore(M, M.mx * 0.5, 2, true);
    esigi(p, 'nessun percorso per il livello 1');
    for (const dt of [1000 / 60, 1000 / 144, 1000 / 30]) {
      const h = rendiFinta();
      h.crea().avvia();
      h.tasto(' ', 'Space');
      const r = giocaSchedule(h, p.secondi, dt, 200);
      esigiUguale(r.esito, 'vinto', 'a ' + Math.round(1000 / dt) + ' fotogrammi al secondo il livello 1 non si finisce');
    }
  });

  await prova('gioco: Esc esce dalla partita, e con il sipario un secondo Esc chiude tutto; INVIO riprende dal livello raggiunto', () => {
    const h = rendiFinta();
    const gioco = h.crea({ sipario: true });
    gioco.avvia();
    h.tasto(' ', 'Space');
    h.testiUltimo();
    h.tasto('Escape', 'Escape');
    esigiDentro(h.testiUltimo(), 'POLLO RUN', 'Esc non riporta alla schermata iniziale');
    esigiUguale(h.registro.eventi[h.registro.eventi.length - 1], null, 'uscendo dalla partita la canzone non si ferma');
    esigiUguale(h.registro.suPartita.join(','), 'true,false', 'la fine della partita non e annunciata');
    esigiUguale(h.registro.suChiudi, 0, 'un solo Esc chiude tutto');
    h.tasto('Escape', 'Escape');
    esigiUguale(h.registro.suChiudi, 1, 'il secondo Esc non chiude');

    const pagina = rendiFinta();
    pagina.crea({ sipario: false }).avvia();
    pagina.tasto('Escape', 'Escape');
    esigiUguale(pagina.registro.suChiudi, 0, 'nella pagina di manutenzione Esc non deve chiudere niente');

    const riprende = rendiFinta();
    riprende.registro.memoria['sb-pollo-livello'] = '5';
    riprende.crea().avvia();
    esigiDentro(riprende.testiUltimo(), 'MIGLIORE LIVELLO 5', 'il record non si vede');
    esigiDentro(riprende.testiUltimo(), 'INVIO: riprendi dal livello 5', 'manca l invito a riprendere');
    riprende.tasto('Enter', 'Enter');
    esigiDentro(riprende.testiUltimo(), 'LIVELLO 5', 'INVIO non riprende dal livello 5');
  });

  await prova('gioco: nella schermata iniziale frecce e numeri scelgono la difficolta, che si ricorda; in partita non cambia', () => {
    const h = rendiFinta();
    h.crea().avvia();
    const inizio = h.testiUltimo();
    for (const nome of ['FACILE', 'MEDIO', 'DIFFICILE', 'ESTREMO']) { esigiDentro(inizio, nome, 'manca ' + nome + ' nella schermata iniziale'); }
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], undefined, 'la difficolta di partenza non va salvata');
    h.tasto('ArrowRight', 'ArrowRight');
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'difficile', 'freccia destra da MEDIO');
    h.tasto('ArrowRight', 'ArrowRight');
    h.tasto('ArrowRight', 'ArrowRight');
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'estremo', 'freccia destra oltre ESTREMO');
    h.tasto('1', 'Digit1');
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'facile', 'il tasto 1');
    h.tasto('ArrowLeft', 'ArrowLeft');
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'facile', 'freccia sinistra oltre FACILE');
    h.tasto('3', 'Digit3');
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'difficile', 'il tasto 3');
    h.tasto('4', 'Digit4', { target: { closest: () => ({}) } });
    esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'difficile', 'il tasto 4 scritto in un campo cambia la difficolta');
    h.tasto('4', 'Digit4');
    h.tasto('2', 'Digit2');
    h.tasto('1', 'Digit1');
    esigiUguale(h.registro.suPartita.length, 0, 'scegliere la difficolta fa partire il gioco');

    const riletta = rendiFinta();
    riletta.registro.memoria['sb-pollo-difficolta'] = 'facile';
    riletta.crea().avvia();
    riletta.tasto(' ', 'Space');
    riletta.testiUltimo();
    riletta.tasto('4', 'Digit4');
    riletta.tasto('ArrowRight', 'ArrowRight');
    esigiUguale(riletta.registro.memoria['sb-pollo-difficolta'], 'facile', 'in partita la difficolta cambia');
    const inPartita = riletta.testiUltimo();
    esigiDentro(inPartita, 'LIVELLO 1', 'in partita manca il livello');
    esigiDentro(inPartita, 'FACILE', 'in partita non si vede la difficolta');
    const M = creaDi(1, 'facile');
    const p = percorsoGiocatore(M, M.mx * 0.5, 2, true);
    esigi(p, 'nessun percorso per il livello 1 FACILE');
    esigiUguale(giocaSchedule(riletta, p.secondi, 1000 / 60, 200).esito, 'vinto', 'il livello 1 FACILE non si finisce: il gioco non usa il livello della difficolta scelta');
    riletta.attendi(1);
    esigiDentro(riletta.testiUltimo(), 'FACILE   TENTATIVI 1', 'la schermata di fine livello non dice la difficolta');
    esigiUguale(riletta.registro.memoria['sb-pollo-livello-facile'], '2', 'il livello raggiunto a FACILE non e salvato a parte');
    esigiUguale(riletta.registro.memoria['sb-pollo-livello'], undefined, 'il livello raggiunto a FACILE finisce in quello di MEDIO');

  });

  await prova('gioco: il livello raggiunto e separato per difficolta, e INVIO riprende da quello della difficolta scelta', () => {
    for (const stile of ['synthwave', 'geometrydash']) {
      const h = rendiFinta();
      h.registro.memoria['sb-pollo-livello'] = '5';
      h.registro.memoria['sb-pollo-livello-facile'] = '3';
      h.crea({ stile: stile }).avvia();
      const medio = h.testiUltimo();
      esigiDentro(medio, 'INVIO: riprendi dal livello 5', stile + ': MEDIO non usa la chiave di sempre');
      h.tasto('1', 'Digit1');
      const facile = h.testiUltimo();
      esigiDentro(facile, 'INVIO: riprendi dal livello 3', stile + ': FACILE non ha il suo livello');
      esigiDentro(facile, 'MIGLIORE LIVELLO 3', stile + ': il record di FACILE non si vede');
      h.tasto('4', 'Digit4');
      const estremo = h.testiUltimo();
      esigi(estremo.indexOf('INVIO: riprendi') === -1, stile + ': ESTREMO eredita un livello non suo');
      h.tasto('1', 'Digit1');
      h.testiUltimo();
      h.tasto('Enter', 'Enter');
      const partito = h.testiUltimo();
      esigiDentro(partito, 'LIVELLO 3', stile + ': INVIO non riprende dal livello 3 di FACILE');
      esigiDentro(partito, 'FACILE', stile + ': in partita non si vede FACILE');
      h.tasto('Escape', 'Escape');
      h.testiUltimo();
      h.tasto('2', 'Digit2');
      h.testiUltimo();
      h.tasto('Enter', 'Enter');
      esigiDentro(h.testiUltimo(), 'LIVELLO 5', stile + ': tornando a MEDIO INVIO non riprende dal 5');
      esigiUguale(h.registro.memoria['sb-pollo-livello-facile'], '3', stile + ': il livello di FACILE e cambiato');
      esigiUguale(h.registro.memoria['sb-pollo-livello'], '5', stile + ': il livello di MEDIO e cambiato');
    }
  });

  await prova('gioco: un clic o un tocco sulla parola sceglie la difficolta, fuori dalle parole no, e in partita il clic torna a far saltare', () => {
    for (const stile of ['synthwave', 'geometrydash']) {
      const h = rendiFinta();
      h.crea({ stile: stile }).avvia();
      h.testiUltimo();
      const dove = (nome) => h.registro.scritte.filter((x) => x.testo === nome).pop();
      const estremo = dove('ESTREMO');
      esigi(estremo, stile + ': la parola ESTREMO non e disegnata');
      h.tocca(estremo.x + 20, estremo.y - 6);
      esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'estremo', stile + ': il clic su ESTREMO non lo sceglie');
      h.testiUltimo();
      const facile = dove('FACILE');
      h.tocca(facile.x + 4, facile.y + 4);
      esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'facile', stile + ': il clic su FACILE non lo sceglie');
      h.testiUltimo();
      h.tocca(facile.x + 4, facile.y - 200);
      h.tocca(1190, 370);
      h.tocca(facile.x + 4, facile.y + 4, { button: 2 });
      h.tocca(dove('DIFFICILE').x + 4, dove('DIFFICILE').y - 4, { target: { closest: () => ({}) } });
      h.tocca(dove('DIFFICILE').x + 4, dove('DIFFICILE').y - 4, { target: { closest: () => null } });
      esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'facile', stile + ': un clic fuori dalle parole, o su qualcosa sopra il canvas, cambia la difficolta');
      esigiUguale(h.registro.suPartita.length, 0, stile + ': il clic sulla parola fa partire il gioco');
      h.tocca(dove('DIFFICILE').x + 4, dove('DIFFICILE').y - 4, { target: { closest: () => null, getBoundingClientRect: () => ({ width: 1200, height: 380 }) } });
      esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'difficile', stile + ': un clic sulla parola attraverso un contenitore trasparente a tutto schermo (la pagina di manutenzione) non la sceglie');
      h.testiUltimo();
      h.tasto('1', 'Digit1');
      h.testiUltimo();
      h.tasto(' ', 'Space');
      h.testiUltimo();
      h.tocca(estremo.x + 20, estremo.y - 6);
      h.testiUltimo();
      esigiUguale(h.registro.memoria['sb-pollo-difficolta'], 'facile', stile + ': in partita il clic sulla parola cambia la difficolta');
    }
  });

  await prova('gioco: su un telefono stretto la schermata iniziale, selettore compreso, sta tutta dentro lo schermo', () => {
    for (const stile of ['synthwave', 'geometrydash']) {
      for (const [largo, alto] of [[390, 780], [320, 560], [1280, 800]]) {
        const h = rendiFinta(undefined, { largo: largo, alto: alto, tocco: largo < 600 });
        h.registro.memoria['sb-pollo-livello'] = '27';
        h.crea({ stile: stile }).avvia();
        const testi = h.testiUltimo();
        esigiDentro(testi, largo < 600 ? 'Dal computer: SPAZIO per correre' : 'SPAZIO per correre', stile + ' ' + largo + ': manca l invito');
        esigiDentro(testi, 'ESTREMO', stile + ' ' + largo + ': manca il selettore');
        for (const scritta of h.registro.scritte) {
          if (scritta.testo === 'MIGLIORE LIVELLO 27') { continue; }
          esigi(scritta.x >= 0 && scritta.x + scritta.largo <= largo + 0.5, stile + ' ' + largo + ': «' + scritta.testo + '» esce dallo schermo (' + Math.round(scritta.x) + ' + ' + Math.round(scritta.largo) + ' > ' + largo + ')');
        }
      }
    }
  });

  await prova('gioco: il selettore si stringe per non finire sotto i bottoni dell audio della pagina di manutenzione', () => {
    for (const stile of ['synthwave', 'geometrydash']) {
      const h = rendiFinta(undefined, { largo: 390, alto: 780, tocco: true });
      h.crea({ stile: stile, ingombro: { getBoundingClientRect: () => ({ left: 290, width: 100, top: 700, bottom: 770 }) } }).avvia();
      h.testiUltimo();
      for (const nome of ['FACILE', 'MEDIO', 'DIFFICILE', 'ESTREMO']) {
        const v = h.registro.scritte.filter((x) => x.testo === nome).pop();
        esigi(v && v.x + v.largo <= 290, stile + ': ' + nome + ' finisce sotto i bottoni dell audio');
      }
      const libero = rendiFinta(undefined, { largo: 390, alto: 780, tocco: true });
      libero.crea({ stile: stile, ingombro: { hidden: true, getBoundingClientRect: () => ({ left: 290, width: 100, top: 700, bottom: 770 }) } }).avvia();
      libero.testiUltimo();
      const estremo = libero.registro.scritte.filter((x) => x.testo === 'ESTREMO').pop();
      esigi(estremo.x + estremo.largo > 290, stile + ': un ingombro nascosto stringe lo stesso il selettore');
    }
  });

  await prova('gioco: fermarlo toglie tutti gli ascoltatori, e avviarlo due volte non li raddoppia', () => {
    const h = rendiFinta();
    const gioco = h.crea();
    gioco.avvia();
    gioco.avvia();
    const conAscolto = Object.keys(h.registro.ascoltatori).sort().join(',');
    esigiUguale(conAscolto, 'keydown,pointerdown,visibilitychange,w:resize', 'ascoltatori');
    h.tasto(' ', 'Space');
    gioco.ferma();
    esigiUguale(h.registro.eventi[h.registro.eventi.length - 1], null, 'fermando il gioco la canzone non si ferma');
    esigiUguale(Object.keys(h.registro.ascoltatori).length, 0, 'restano ascoltatori dopo ferma');
    esigiUguale(h.registro.suPartita.join(','), 'true,false', 'fermare il gioco in partita non lo annuncia');
    esigiUguale(h.frame(16), false, 'dopo ferma c e ancora un fotogramma in coda');
  });

  await prova('la pagina di manutenzione porta il motore dentro lo script e lo avvia', () => {
    const html = costruisci.anteprimaManutenzione(archivio.leggi());
    const script = /<script>([\s\S]*?)<\/script>/.exec(html);
    esigi(script, 'manca lo script della pagina');
    esigiDentro(script[1], 'PolloRun.livelli = {', 'il motore dei livelli non e nella pagina');
    esigiDentro(script[1], 'window.PolloRun.crea = crea;', 'il gioco non e nella pagina');
    esigiDentro(script[1], 'window.PolloRun.crea({', 'la pagina non avvia il gioco');
    esigi(script[1].indexOf('window.PolloRun.crea = crea;') < script[1].indexOf('window.PolloRun.crea({'), 'il gioco parte prima di essere definito');
    esigiDentro(html, 'data-frasi="', 'le frasi di scherno non arrivano al canvas');
    esigi(!/\/\*/.test(script[1]), 'lo script della pagina contiene commenti');
  });

  const montaSito = (opzioni) => {
    const o = Object.assign({ musicaSuona: false, motoreCaricato: false, frasiAttr: '["Una","Due"]', polloAttr: 'img/mascotte.webp', volume: null, volumi: null, motoreRotto: false, xhr: false }, opzioni || {});
    let ora = 5000000;
    const registro = { appesi: [], nodi: [], audio: [], richieste: [], blob: 0, play: 0, pause: 0, musicaFerma: 0, musicaParti: 0, crea: [], avvia: 0, ferma: 0, focus: 0, blur: 0 };
    function RichiestaFinta() {
      const r = {
        metodo: '', url: '', inviata: false, abortita: false, status: 0, response: null, responseType: '', timeout: 0,
        open(m, u) { this.metodo = m; this.url = u; },
        send() { this.inviata = true; },
        abort() { this.abortita = true; if (this.onabort) { this.onabort(); } }
      };
      registro.richieste.push(r);
      return r;
    }
    const UrlFinto = { createObjectURL: () => 'blob:finto/' + (++registro.blob) };
    const classi = new Set();
    const ascoltatori = {};
    const memoria = {};
    if (o.volume !== null) { memoria['sb-manutenzione-volumi'] = JSON.stringify({ attesa: 10, gioco: o.volume }); }
    if (o.volumi !== null) { memoria['sb-manutenzione-volumi'] = typeof o.volumi === 'string' ? o.volumi : JSON.stringify(o.volumi); }
    const finestra = { addEventListener: (tipo, fn) => { ascoltatori['w:' + tipo] = fn; } };
    if (o.musicaSuona !== null) {
      finestra.Musica = {
        suStato: (fn) => fn({ suona: o.musicaSuona }),
        ferma: () => { registro.musicaFerma++; },
        parti: () => { registro.musicaParti++; }
      };
    }
    const controllerFinto = () => ({ avvia: () => { registro.avvia++; }, ferma: () => { registro.ferma++; } });
    if (o.motoreCaricato) { finestra.PolloRun = { crea: (op) => { registro.crea.push(op); return controllerFinto(); } }; }
    function Audio(src) {
      const a = { src: src, loop: false, volume: 1, currentTime: 0, preload: '', play() { registro.play++; return Promise.resolve(); }, pause() { registro.pause++; } };
      registro.audio.push(a);
      return a;
    }
    const nodo = (tag) => {
      const n = {
        tag: tag, className: '', children: [], attrs: {}, parentNode: null, textContent: '', tabIndex: 0,
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; },
        addEventListener(tipo, fn) { this.attrs['@' + tipo] = fn; },
        focus() { registro.focus++; }
      };
      registro.nodi.push(n);
      return n;
    };
    const testa = {
      appendChild: (n) => {
        registro.appesi.push(n);
        return n;
      }
    };
    const corpo = nodo('body');
    const script = nodo('script');
    script.setAttribute('data-pollo', o.polloAttr);
    script.setAttribute('data-frasi', o.frasiAttr);
    const documento = {
      currentScript: script,
      body: corpo,
      head: testa,
      activeElement: { blur: () => { registro.blur++; } },
      addEventListener: (tipo, fn) => { ascoltatori[tipo] = fn; },
      documentElement: { classList: { add: (c) => classi.add(c), remove: (c) => classi.delete(c), contains: (c) => classi.has(c) } },
      createElement: nodo,
      querySelector: (s) => { const m = /link\[href="([^"]+)"\]/.exec(s); return m && registro.appesi.some((n) => n.tag === 'link' && n.href === m[1]) ? {} : null; }
    };
    vm.runInNewContext(jsSito, {
      window: finestra,
      document: documento,
      Audio: Audio,
      localStorage: { getItem: (k) => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); } },
      Date: { now: () => ora },
      JSON: JSON,
      encodeURIComponent: encodeURIComponent,
      XMLHttpRequest: o.xhr ? RichiestaFinta : undefined,
      URL: o.xhr ? UrlFinto : undefined
    });
    const evento = (key, extra) => Object.assign({
      key: key, target: { tagName: 'BODY', nodeType: 1 }, ctrlKey: false, altKey: false, metaKey: false, repeat: false, isComposing: false, defaultPrevented: false,
      fermato: false, fermatoSubito: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.fermato = true; },
      stopImmediatePropagation() { this.fermato = true; this.fermatoSubito = true; }
    }, extra || {});
    const tasto = (key, extra) => { const e = evento(key, extra); ascoltatori.keydown(e); return e; };
    const scrivi = (testo, extra, pausa) => {
      for (const c of testo) { tasto(c, extra); ora += pausa === undefined ? 120 : pausa; }
    };
    const carica = () => {
      for (const n of registro.appesi) {
        if (n.tag === 'link' && n.onload && !n.caricato) { n.caricato = true; n.onload(); }
      }
      for (const n of registro.appesi) {
        if (n.tag === 'script' && n.onload && !n.caricato) {
          n.caricato = true;
          if (n.src === 'js/pollorun-gioco.js' && !o.motoreRotto) { finestra.PolloRun = { crea: (op) => { registro.crea.push(op); return controllerFinto(); } }; }
          n.onload();
        }
      }
      for (const n of registro.appesi) {
        if (n.tag === 'link' && n.onload && !n.caricato) { n.caricato = true; n.onload(); }
      }
    };
    return { registro: registro, classi: classi, finestra: finestra, corpo: corpo, tasto: tasto, evento: evento, scrivi: scrivi, carica: carica, ascoltatori: ascoltatori, memoria: memoria, avanza: (ms) => { ora += ms; } };
  };

  await prova('pollorun.js: scrivendo pollorun carica stile e motore, monta il gioco a tutto schermo e lo avvia', () => {
    const p = montaSito();
    p.scrivi('pollorun');
    esigiUguale(p.registro.appesi.length, 2, 'devono partire due caricamenti: stile e motore');
    esigi(p.registro.appesi.some((n) => n.tag === 'link' && n.href === 'css/pollorun.css' && n.rel === 'stylesheet'), 'manca lo stile');
    esigi(p.registro.appesi.some((n) => n.tag === 'script' && n.src === 'js/pollorun-gioco.js'), 'manca il motore');
    esigiUguale(p.corpo.children.length, 1, 'durante il caricamento deve esserci solo il preloader');
    esigiUguale(p.corpo.children[0].className, 'pollorun-carica', 'il gioco compare prima che tutto sia caricato');
    p.carica();
    esigiUguale(p.corpo.children.length, 1, 'il gioco non compare');
    const radice = p.corpo.children[0];
    esigiUguale(radice.className, 'pollorun', 'classe');
    esigiUguale(radice.getAttribute('role'), 'dialog', 'ruolo');
    esigiUguale(radice.getAttribute('aria-modal'), 'true', 'aria-modal');
    esigi(radice.children.some((c) => c.tag === 'canvas'), 'manca il canvas');
    esigi(radice.children.some((c) => c.tag === 'button' && c.getAttribute('aria-label') === 'Chiudi Pollo Run'), 'manca il bottone per chiudere');
    esigi(p.classi.has('is-pollorun'), 'la pagina non e bloccata sotto il gioco');
    esigiUguale(p.registro.crea.length, 1, 'il gioco deve nascere una volta sola');
    const op = p.registro.crea[0];
    esigiUguale(op.pollo, 'img/mascotte.webp', 'immagine del pollo');
    esigiUguale(JSON.stringify(op.frasi), '["Una","Due"]', 'frasi di scherno');
    esigiUguale(op.sipario, true, 'deve girare in modalita sipario');
    esigiUguale(p.registro.avvia, 1, 'il gioco non parte');
    esigi(p.registro.blur >= 1 && p.registro.focus >= 1, 'il focus non passa al gioco: SPAZIO attiverebbe il link sotto');
  });

  const trovaNodo = (n, classe) => (n.className === classe ? n : n.children.reduce((a, c) => a || trovaNodo(c, classe), null));

  await prova('pollorun.js: il preloader mostra il pollo, «Caricamento in corso», la barra e la percentuale, e sparisce quando parte il gioco', () => {
    const p = montaSito();
    p.scrivi('pollorun');
    const carica = p.corpo.children[0];
    esigiUguale(carica.getAttribute('role'), 'dialog', 'ruolo del preloader');
    esigi(p.classi.has('is-pollorun'), 'la pagina sotto il preloader non e bloccata');
    const pollo = trovaNodo(carica, 'pollorun-carica__pollo');
    esigi(pollo && pollo.tag === 'img' && pollo.src === 'img/mascotte.webp', 'manca il pollo che salta');
    esigiUguale(trovaNodo(carica, 'pollorun-carica__testo').textContent, 'Caricamento in corso', 'scritta');
    const barra = trovaNodo(carica, 'pollorun-carica__barra');
    esigiUguale(barra.getAttribute('role'), 'progressbar', 'la barra non e una progressbar');
    esigi(/^\d+%$/.test(trovaNodo(carica, 'pollorun-carica__percento').textContent), 'manca la percentuale');
    esigi(trovaNodo(carica, 'pollorun-carica__chiudi'), 'manca il bottone per annullare');
    p.carica();
    esigiUguale(p.corpo.children.length, 1, 'restano preloader e gioco insieme');
    esigiUguale(p.corpo.children[0].className, 'pollorun', 'dopo il caricamento deve esserci il gioco');
  });

  await prova('pollorun.js: la canzone si scarica tutta prima di partire, la percentuale sale, e poi suona dal file gia scaricato', () => {
    const p = montaSito({ xhr: true });
    p.scrivi('pollorun');
    esigiUguale(p.registro.richieste.length, 1, 'la canzone non si scarica');
    const r = p.registro.richieste[0];
    esigiUguale(r.url, 'mp3/DJVI%20-%20Back%20On%20Track.mp3', 'canzone scaricata');
    esigiUguale(r.responseType, 'blob', 'la canzone va tenuta come file');
    esigi(r.inviata, 'la richiesta non parte');
    p.carica();
    esigiUguale(p.registro.crea.length, 0, 'il gioco parte prima che la canzone sia scaricata');
    const carica = p.corpo.children[0];
    const percento = () => trovaNodo(carica, 'pollorun-carica__percento').textContent;
    esigiUguale(percento(), '30%', 'stile, pollo e motore valgono il 30%');
    r.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
    esigiUguale(percento(), '65%', 'a meta canzone');
    esigiUguale(trovaNodo(carica, 'pollorun-carica__barra').getAttribute('aria-valuenow'), '65', 'la barra non segue');
    r.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    esigiUguale(p.registro.crea.length, 0, 'parte prima della fine vera dello scaricamento');
    r.status = 200;
    r.response = {};
    r.onload();
    esigiUguale(percento(), '100%', 'alla fine non arriva a 100');
    esigiUguale(p.registro.crea.length, 1, 'finito il caricamento il gioco non parte');
    esigiUguale(p.corpo.children[0].className, 'pollorun', 'il preloader non lascia il posto al gioco');
    const op = p.registro.crea[0];
    esigiUguale(op.primaCanzone, 0, 'il gioco non sa quale canzone e stata preparata');
    op.suCanzone(op.canzoni[0]);
    esigiUguale(p.registro.audio[0].src, 'blob:finto/1', 'la canzone si riscarica invece di usare quella pronta');
  });

  await prova('pollorun.js: con Esc o con la X il caricamento si annulla, lo scaricamento si ferma e non si apre niente', () => {
    const p = montaSito({ xhr: true });
    p.scrivi('pollorun');
    p.tasto('Escape');
    esigiUguale(p.corpo.children.length, 0, 'Esc non toglie il preloader');
    esigi(!p.classi.has('is-pollorun'), 'la pagina resta bloccata');
    esigi(p.registro.richieste[0].abortita, 'la canzone continua a scaricarsi');
    p.carica();
    esigiUguale(p.registro.crea.length, 0, 'annullato, il gioco parte lo stesso');

    p.scrivi('pollorun');
    esigiUguale(p.corpo.children[0].className, 'pollorun-carica', 'riscrivendo la parola non riparte');
    trovaNodo(p.corpo.children[0], 'pollorun-carica__chiudi').attrs['@click']();
    esigiUguale(p.corpo.children.length, 0, 'la X non toglie il preloader');
    esigiUguale(p.registro.appesi.filter((n) => n.tag === 'script').length, 1, 'il motore si riscarica');
  });

  await prova('pollorun.js: se la canzone non si scarica il gioco parte lo stesso e la canzone arriva dal sito', () => {
    const p = montaSito({ xhr: true });
    p.scrivi('pollorun');
    p.carica();
    const r = p.registro.richieste[0];
    r.status = 404;
    r.onload();
    esigiUguale(p.registro.crea.length, 1, 'senza canzone il gioco non parte');
    const op = p.registro.crea[0];
    op.suCanzone(op.canzoni[0]);
    esigiUguale(p.registro.audio[0].src, 'mp3/DJVI%20-%20Back%20On%20Track.mp3', 'la canzone non arriva dal sito');
  });

  await prova('pollorun.js: senza aspettare il caricamento non si aprono due giochi, e a motore gia caricato non si scarica di nuovo', () => {
    const p = montaSito();
    p.scrivi('pollorun');
    p.scrivi('pollorun');
    esigiUguale(p.registro.appesi.length, 2, 'ha caricato due volte mentre aspettava');
    p.carica();
    esigiUguale(p.corpo.children.length, 1, 'due giochi aperti');
    esigi(p.registro.crea[0].suChiudi, 'manca suChiudi');
    p.registro.crea[0].suChiudi();
    esigiUguale(p.corpo.children.length, 0, 'suChiudi non toglie il gioco');
    esigi(!p.classi.has('is-pollorun'), 'la pagina resta bloccata');
    esigiUguale(p.registro.ferma, 1, 'il gioco non viene fermato');
    p.scrivi('pollorun');
    esigiUguale(p.registro.appesi.length, 2, 'la seconda volta ricarica stile o motore');
    p.carica();
    esigiUguale(p.corpo.children.length, 1, 'non si riapre');
    esigiUguale(p.registro.crea.length, 2, 'non ricrea il gioco');
  });

  await prova('pollorun.js: minuscolo, maiuscolo, misto; non parte in un campo, con Ctrl, a tasti ripetuti, con pause lunghe o lettere in mezzo; aperto, non riparte', () => {
    const provaCosi = (fn) => { const p = montaSito(); fn(p); p.carica(); return p.corpo.children.length; };
    esigiUguale(provaCosi((p) => { for (const c of 'POLLORUN') { p.tasto('Shift'); p.tasto(c); p.avanza(100); } }), 1, 'POLLORUN con Shift');
    esigiUguale(provaCosi((p) => { p.tasto('CapsLock'); p.scrivi('POLLORUN'); }), 1, 'con il blocco maiuscole');
    esigiUguale(provaCosi((p) => { p.scrivi('ciao pollorun ciao'); }), 1, 'dentro una frase');
    esigiUguale(provaCosi((p) => { p.scrivi('pollorun', { target: { tagName: 'INPUT', nodeType: 1 } }); }), 0, 'in un input');
    esigiUguale(provaCosi((p) => { p.scrivi('pollorun', { target: { tagName: 'TEXTAREA', nodeType: 1 } }); }), 0, 'in una textarea');
    esigiUguale(provaCosi((p) => { p.scrivi('pollorun', { target: { tagName: 'DIV', nodeType: 1, isContentEditable: true } }); }), 0, 'in un campo modificabile');
    esigiUguale(provaCosi((p) => { p.scrivi('pollor'); p.tasto('u', { ctrlKey: true }); p.tasto('n'); }), 0, 'con Ctrl');
    esigiUguale(provaCosi((p) => { p.scrivi('pollorun', { repeat: true }); }), 0, 'con i tasti che si ripetono');
    esigiUguale(provaCosi((p) => { p.scrivi('pollo'); p.avanza(2500); p.scrivi('run'); }), 0, 'dopo una pausa lunga');
    esigiUguale(provaCosi((p) => { p.scrivi('pollxorun'); }), 0, 'con una lettera in mezzo');
    esigiUguale(provaCosi((p) => { p.scrivi('pol'); p.tasto('Backspace'); p.scrivi('lorun'); }), 0, 'dopo un Backspace');
    esigiUguale(provaCosi((p) => { p.scrivi('pollorun'); p.carica(); p.scrivi('pollorun'); }), 1, 'gia aperto, riparte');
    esigiUguale(provaCosi((p) => { p.scrivi('pollo'); }), 0, 'la parola a meta non apre niente');
  });

  await prova('pollorun.js: se lo script del gioco non si scarica non si apre niente e riscrivendo la parola si riprova', () => {
    const p = montaSito({ motoreRotto: true });
    p.scrivi('pollorun');
    for (const n of p.registro.appesi) { if (n.tag === 'link' && n.onload) { n.onload(); } }
    const script = p.registro.appesi.find((n) => n.tag === 'script');
    script.onerror();
    esigiUguale(p.corpo.children.length, 0, 'si apre senza motore');
    esigi(!p.classi.has('is-pollorun'), 'la pagina resta bloccata');
    p.scrivi('pollorun');
    esigiUguale(p.registro.appesi.filter((n) => n.tag === 'script').length, 2, 'non riprova a scaricare il motore');
  });

  await prova('pollorun.js: il lettore di sottofondo del sito si ferma mentre il gioco e aperto e riparte alla chiusura, solo se suonava', () => {
    const suonava = montaSito({ musicaSuona: true });
    suonava.scrivi('pollorun');
    suonava.carica();
    esigiUguale(suonava.registro.musicaFerma, 1, 'la musica del sito non si ferma');
    esigiUguale(suonava.registro.musicaParti, 0, 'riparte troppo presto');
    suonava.registro.crea[0].suChiudi();
    esigiUguale(suonava.registro.musicaParti, 1, 'la musica del sito non riparte');

    const zitta = montaSito({ musicaSuona: false });
    zitta.scrivi('pollorun');
    zitta.carica();
    zitta.registro.crea[0].suChiudi();
    esigiUguale(zitta.registro.musicaFerma + zitta.registro.musicaParti, 0, 'tocca una musica che non suonava');

    const senza = montaSito({ musicaSuona: null });
    senza.scrivi('pollorun');
    senza.carica();
    esigiUguale(senza.corpo.children.length, 1, 'senza lettore il gioco non si apre');
  });

  await prova('pollorun.js: la canzone del gioco parte quando il motore la sceglie, con il volume scelto nella manutenzione, e si ferma alla fine', () => {
    const p = montaSito({ volume: 55 });
    p.scrivi('pollorun');
    p.carica();
    const op = p.registro.crea[0];
    const voce = { titolo: 'Back On Track', autore: 'DJVI', file: 'mp3/DJVI%20-%20Back%20On%20Track.mp3', indice: 0 };
    const brani = () => p.registro.audio.filter((a) => a.src === voce.file);
    esigiUguale(p.registro.play, 0, 'la canzone parte prima della partita');
    op.suPartita(true);
    esigiUguale(p.registro.play, 0, 'suPartita non deve piu far suonare niente');
    op.suCanzone(voce);
    esigiUguale(brani().length, 1, 'un solo brano');
    esigiUguale(brani()[0].loop, true, 'il brano deve ripetersi');
    esigiUguale(brani()[0].volume, 0.55, 'il volume non e quello della manutenzione');
    esigiUguale(p.registro.play, 1, 'la canzone non parte');
    op.suCanzone(null);
    esigiUguale(p.registro.pause, 1, 'la canzone non si ferma a fine tentativo');
    op.suCanzone(voce);
    esigiUguale(p.registro.audio.length, 1, 'ricrea il brano a ogni tentativo');
    p.registro.crea[0].suChiudi();
    esigiUguale(p.registro.pause, 2, 'chiudendo la canzone non si ferma');

    const predefinito = montaSito();
    predefinito.scrivi('pollorun');
    predefinito.carica();
    predefinito.registro.crea[0].suCanzone(voce);
    esigiUguale(predefinito.registro.audio[0].volume, 0.3, 'volume di partenza');
  });

  const apriGiocoConVolume = (opzioni) => {
    const p = montaSito(opzioni);
    p.scrivi('pollorun');
    p.carica();
    const radice = p.corpo.children[0];
    const v = {
      radice: radice,
      scatola: trovaNodo(radice, 'pollorun__volume'),
      regola: trovaNodo(radice, 'pollorun__regola'),
      pannello: trovaNodo(radice, 'pollorun__volumi'),
      cursore: trovaNodo(radice, 'pollorun__cursore').children.find((c) => c.tag === 'input'),
      valore: trovaNodo(radice, 'pollorun__cursore-valore'),
      muto: trovaNodo(radice, 'pollorun__muto'),
      etichetta: trovaNodo(radice, 'pollorun__cursore')
    };
    const voce = { titolo: 'Back On Track', autore: 'DJVI', file: 'mp3/DJVI%20-%20Back%20On%20Track.mp3', indice: 0 };
    const suona = () => { p.registro.crea[p.registro.crea.length - 1].suCanzone(voce); return p.registro.audio[0]; };
    const salvati = () => JSON.parse(p.memoria['sb-manutenzione-volumi']);
    return Object.assign(p, { v: v, suona: suona, salvati: salvati });
  };

  await prova('pollorun.js: nel gioco c e il bottone del volume accanto alla X, apre e chiude il pannello con cursore 0-100, etichetta e valore', () => {
    const p = apriGiocoConVolume({ volume: 40 });
    const v = p.v;
    esigi(v.scatola && v.regola && v.pannello && v.cursore && v.valore && v.muto, 'manca un pezzo del volume');
    esigiUguale(v.regola.tag, 'button', 'il bottone del volume non e un bottone');
    esigiUguale(v.regola.type, 'button', 'tipo del bottone');
    esigi(/^Regola il volume/.test(v.regola.getAttribute('aria-label')), 'etichetta del bottone');
    esigiUguale(v.regola.getAttribute('aria-controls'), v.pannello.id, 'aria-controls non punta al pannello');
    esigiUguale(v.regola.getAttribute('aria-expanded'), 'false', 'il pannello parte aperto');
    esigiUguale(v.pannello.hidden, true, 'il pannello parte visibile');
    esigiUguale(v.radice.children.indexOf(v.scatola), 1, 'il volume non sta subito dopo la X');
    esigiUguale(v.cursore.type, 'range', 'il cursore non e un range');
    esigiUguale([v.cursore.min, v.cursore.max, v.cursore.step].join(','), '0,100,1', 'limiti del cursore');
    esigiUguale(v.etichetta.tag, 'label', 'il cursore non ha una label');
    esigiUguale(v.etichetta.getAttribute('for'), v.cursore.id, 'la label non e legata al cursore');
    esigiUguale(v.valore.tag, 'output', 'il valore non e un output');
    esigiUguale(v.valore.getAttribute('for'), v.cursore.id, 'output non legato al cursore');
    esigiUguale(v.cursore.value, '40', 'il cursore non parte dal volume salvato');
    esigiUguale(v.valore.textContent, '40', 'il numero non parte dal volume salvato');
    v.regola.attrs['@click']();
    esigiUguale(v.pannello.hidden, false, 'il bottone non apre il pannello');
    esigiUguale(v.regola.getAttribute('aria-expanded'), 'true', 'aria-expanded non segue');
    v.regola.attrs['@click']();
    esigiUguale(v.pannello.hidden, true, 'il bottone non chiude il pannello');
    esigiUguale(v.regola.getAttribute('aria-expanded'), 'false', 'aria-expanded non torna a false');
    v.regola.attrs['@click']();
    v.radice.attrs['@pointerdown']({ target: v.radice });
    esigiUguale(v.pannello.hidden, true, 'toccando fuori il pannello non si chiude');
    v.regola.attrs['@click']();
    const e = p.tasto('Escape');
    esigiUguale(v.pannello.hidden, true, 'Esc non chiude il pannello');
    esigi(e.fermatoSubito && e.defaultPrevented, 'Esc chiude il pannello ma arriva anche al gioco, che si chiuderebbe');
    const f = p.tasto('Escape');
    esigi(!f.fermatoSubito && !f.defaultPrevented, 'a pannello chiuso Esc non arriva piu al gioco');
  });

  await prova('pollorun.js: il cursore cambia subito il volume della canzone e salva solo «gioco», lasciando «attesa» e gli altri campi', () => {
    const p = apriGiocoConVolume({ volumi: { attesa: 12, gioco: 50, altro: 'x' } });
    const pista = p.suona();
    esigiUguale(pista.volume, 0.5, 'la canzone non parte dal volume salvato');
    p.v.cursore.value = '73';
    p.v.cursore.attrs['@input']();
    esigiUguale(pista.volume, 0.73, 'il cursore non cambia subito il volume');
    esigiUguale(p.v.valore.textContent, '73', 'il numero accanto non segue');
    esigiUguale(JSON.stringify(p.salvati()), JSON.stringify({ attesa: 12, gioco: 73, altro: 'x' }), 'salvataggio sbagliato');
    p.v.cursore.value = '0';
    p.v.cursore.attrs['@input']();
    esigiUguale(pista.volume, 0, 'a zero la canzone deve tacere');
    esigiUguale(p.salvati().attesa, 12, 'attesa cambiata');
    p.registro.crea[0].suCanzone(null);
    p.suona();
    esigiUguale(pista.volume, 0, 'al tentativo dopo il volume torna quello vecchio');

    for (const rotto of ['non json', '[1,2]', 'null', '{"gioco":"boh"}', '{"gioco":250}']) {
      const q = apriGiocoConVolume({ volumi: rotto });
      esigiUguale(q.v.cursore.value, '30', 'con ' + rotto + ' il cursore non parte da 30');
      q.v.cursore.value = '44';
      q.v.cursore.attrs['@input']();
      esigiUguale(q.salvati().gioco, 44, 'con ' + rotto + ' non salva');
    }
  });

  await prova('pollorun.js: il volume scelto nel gioco si rilegge alla riapertura ed e lo stesso della manutenzione', () => {
    const p = apriGiocoConVolume({ volumi: { attesa: 8, gioco: 20 } });
    p.v.cursore.value = '65';
    p.v.cursore.attrs['@input']();
    p.registro.crea[0].suChiudi();
    p.scrivi('pollorun');
    p.carica();
    const radice = p.corpo.children[0];
    const cursore = trovaNodo(radice, 'pollorun__cursore').children.find((c) => c.tag === 'input');
    esigiUguale(cursore.value, '65', 'riaprendo il cursore non ricorda il volume');
    esigiUguale(trovaNodo(radice, 'pollorun__volumi').hidden, true, 'riaprendo il pannello e gia aperto');
    esigiUguale(p.finestra.PolloRunSito.volume(), 65, 'volume letto');
    p.registro.crea[1].suCanzone({ file: 'mp3/DJVI%20-%20Back%20On%20Track.mp3' });
    esigiUguale(p.registro.audio[0].volume, 0.65, 'la canzone non usa il volume scelto');
    esigiUguale(p.salvati().attesa, 8, 'la musica d attesa della manutenzione e cambiata');
  });

  await prova('pollorun.js: tasti - + = e M cambiano il volume o lo zittiscono, e non toccano Spazio, Invio, Esc e frecce del gioco', () => {
    const p = apriGiocoConVolume({ volumi: { attesa: 5, gioco: 50 } });
    const pista = p.suona();
    let e = p.tasto('-');
    esigiUguale(pista.volume, 0.45, 'meno non abbassa');
    esigi(e.defaultPrevented, 'meno deve essere consumato');
    p.tasto('+');
    p.tasto('=');
    esigiUguale(pista.volume, 0.55, 'piu e uguale non alzano');
    esigiUguale(p.salvati().gioco, 55, 'i tasti non salvano');
    esigiUguale(p.salvati().attesa, 5, 'i tasti toccano attesa');
    esigiUguale(p.v.cursore.value, '55', 'il cursore non segue i tasti');
    p.tasto('-', { repeat: true });
    esigiUguale(pista.volume, 0.5, 'tenendo premuto meno non scende');
    const avviso = trovaNodo(p.v.radice, 'pollorun__avviso') || trovaNodo(p.v.radice, 'pollorun__avviso is-visibile');
    esigi(avviso && avviso.getAttribute('role') === 'status' && /50/.test(avviso.textContent), 'a pannello chiuso non si vede il nuovo volume');
    p.tasto('M');
    esigiUguale(pista.volume, 0, 'M non zittisce');
    esigiUguale(p.v.muto.getAttribute('aria-pressed'), 'true', 'il bottone muto non lo mostra');
    esigi(p.v.scatola.className.indexOf('is-muto') !== -1, 'l icona non mostra il muto');
    p.tasto('m', { repeat: true });
    esigiUguale(pista.volume, 0, 'M tenuto premuto fa avanti e indietro');
    p.tasto('m');
    esigiUguale(pista.volume, 0.5, 'M non ridà il volume di prima');
    p.v.muto.attrs['@click']();
    esigiUguale(pista.volume, 0, 'il bottone muto non zittisce');
    p.v.muto.attrs['@click']();
    esigiUguale(pista.volume, 0.5, 'il bottone muto non riattiva');
    for (let i = 0; i < 30; i++) { p.tasto('+'); }
    esigiUguale(pista.volume, 1, 'oltre 100');
    for (let i = 0; i < 30; i++) { p.tasto('-'); }
    esigiUguale(pista.volume, 0, 'sotto 0');
    p.tasto('+', { ctrlKey: true });
    esigiUguale(pista.volume, 0, 'Ctrl + e lo zoom del browser, non il volume');
    p.tasto('m', { target: { tagName: 'INPUT', nodeType: 1 } });
    esigiUguale(pista.volume, 0, 'dentro un campo di testo M non deve contare');
    p.tasto('+', { target: p.v.cursore });
    esigiUguale(pista.volume, 0.05, 'sul cursore piu non funziona');

    for (const key of [' ', 'Enter', 'Escape', 'ArrowUp', 'ArrowLeft', 'ArrowRight', '1', '2', '3', '4']) {
      const g = p.tasto(key, key === ' ' ? { code: 'Space' } : {});
      esigi(!g.defaultPrevented && !g.fermato && !g.fermatoSubito, key + ' viene bloccato prima del gioco');
      esigi(p.corpo.children.length === 1, key + ' chiude il gioco dal sito');
    }
    esigiUguale(pista.volume, 0.05, 'i tasti del gioco cambiano il volume');

    const scatola = p.v.scatola.attrs['@keydown'];
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter', '1']) {
      const g = p.evento(key, { target: p.v.cursore });
      scatola(g);
      esigi(g.fermato, key + ' sul cursore arriva al gioco');
    }
    for (const key of ['Escape', 'Tab', '-', '+', 'm']) {
      const g = p.evento(key, { target: p.v.cursore });
      scatola(g);
      esigi(!g.fermato, key + ' sul cursore non arriva piu al sito');
    }
    const tocco = p.evento('');
    p.v.scatola.attrs['@pointerdown'](tocco);
    esigi(tocco.fermato, 'toccare il pannello fa saltare il pollo');
  });

  await prova('pollorun.js: chiudendo il gioco il pannello del volume sparisce e i tasti del volume non fanno piu niente', () => {
    const p = apriGiocoConVolume({ volumi: { attesa: 5, gioco: 50 } });
    p.v.regola.attrs['@click']();
    esigiUguale(p.v.pannello.hidden, false, 'il pannello non si apre');
    p.registro.crea[0].suChiudi();
    esigiUguale(p.corpo.children.length, 0, 'il gioco resta');
    esigi(p.v.scatola.parentNode === p.v.radice && p.v.radice.parentNode === null, 'il pannello resta nella pagina');
    const e = p.tasto('-');
    esigi(!e.defaultPrevented, 'a gioco chiuso meno viene ancora consumato');
    esigiUguale(p.salvati().gioco, 50, 'a gioco chiuso i tasti cambiano il volume');
    esigiUguale(p.finestra.PolloRunSito.impostaVolume(90), false, 'a gioco chiuso si puo cambiare il volume');
  });

  await prova('pollorun.js: frasi rotte o mancanti non impediscono di giocare', () => {
    for (const rotto of ['', 'non json', '{"a":1}', 'null']) {
      const p = montaSito({ frasiAttr: rotto });
      p.scrivi('pollorun');
      p.carica();
      esigiUguale(JSON.stringify(p.registro.crea[0].frasi), '[]', 'con ' + JSON.stringify(rotto));
    }
  });

  await prova('il sito: lo script del gioco e in tutte le pagine con immagine e frasi, dopo la guardia e senza toccare i primi script', () => {
    const inizio = '<script src="js/pollorun.js" data-pollo="';
    for (const modello of ['index', 'clip', 'giochi', 'sponsor']) {
      const testo = fs.readFileSync(path.join(RADICE_VERA, 'modelli', modello + '.html'), 'utf8');
      esigiUguale(testo.split(inizio).length - 1, 1, 'modelli/' + modello + '.html: lo script c e una volta sola');
      esigi(testo.indexOf('js/guardia.js') < testo.indexOf(inizio), 'modelli/' + modello + '.html: deve venire dopo la guardia');
      esigiDentro(testo, '{{#se sito.pollorun.attivo}}', 'modelli/' + modello + '.html: manca il controllo dell interruttore');
    }
    const documento = archivio.leggi();
    const pagine = costruisci.rendi(documento);
    const trovato = /<script src="js\/pollorun\.js" data-pollo="([^"]*)" data-frasi="([^"]*)" data-canzoni="[^"]*" data-stile="[^"]*" defer><\/script>/.exec(pagine.html);
    esigi(trovato, 'la home generata non ha lo script');
    esigiUguale(trovato[1], documento.config.immagini.mascotte, 'immagine del pollo nella home');
    const frasi = JSON.parse(trovato[2].replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&'));
    esigi(Array.isArray(frasi) && frasi.length > 0 && frasi.every((f) => typeof f === 'string' && f.length <= 80), 'frasi nella home');
    esigi(pagine.html.indexOf('js/ritorno.js') < pagine.html.indexOf('js/pollorun.js'), 'ritorno.js non e piu il primo');
    esigi(typeof pagine.giochi !== 'string' || pagine.giochi.indexOf('js/pollorun.js') !== -1, 'la pagina dei giochi non ha lo script');
  });

  await prova('il sito: le frasi di scherno del pannello arrivano anche nella home, tagliate a 80 caratteri, protette; vuote danno quelle predefinite', () => {
    const scritte = archivio.leggi();
    scritte.config.manutenzione.scherno = ['Ti senti "forte"? <b>', '  ', 'x'.repeat(100)];
    const trovato = /data-pollo="[^"]*" data-frasi="([^"]*)"/.exec(costruisci.rendi(scritte).html);
    esigi(trovato, 'manca data-frasi nella home');
    esigiDentro(trovato[1], '&lt;b&gt;', 'le frasi non sono protette');
    esigi(trovato[1].indexOf('<b>') === -1, 'una frase entra in pagina senza protezione');
    const lette = JSON.parse(trovato[1].replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    esigiUguale(lette.length, 2, 'la frase vuota deve sparire');
    esigiUguale(lette[1].length, 80, 'la frase lunga va tagliata a 80');
    const vuote = archivio.leggi();
    vuote.config.manutenzione.scherno = [];
    const predefinite = /data-frasi="([^"]*)"/.exec(costruisci.rendi(vuote).html);
    esigiDentro(predefinite[1], 'coglione d&#39;oro', 'frasi predefinite');
  });

  await prova('l interruttore del pannello: acceso lo script e in tutte le pagine, spento non viene nemmeno stampato', () => {
    const campo = schema.campo('config.pollorun.attivo');
    esigi(campo && campo.tipo === 'interruttore' && campo.predefinito === true, 'il campo nello schema deve essere un interruttore acceso di partenza');
    esigiUguale(schema.gruppi.find((g) => g.campi.some((c) => c.chiave === 'config.pollorun.attivo')).id, 'pollo', 'il campo sta nel gruppo del pollo');
    esigiUguale(archivio.leggi().config.pollorun.attivo, true, 'nei contenuti di partenza e acceso');
    esigi(convalida.convalidaCampo('config.pollorun.attivo', 'no').length > 0, 'l interruttore accetta una parola');
    esigiUguale(convalida.convalidaCampo('config.pollorun.attivo', false).length, 0, 'l interruttore rifiuta un vero falso');

    const acceso = costruisci.rendi(archivio.leggi());
    esigi(acceso.html.indexOf('js/pollorun.js') !== -1, 'acceso: manca nella home');
    const spento = archivio.leggi();
    spento.config.pollorun.attivo = false;
    const pagineSpente = costruisci.rendi(spento);
    esigi(pagineSpente.html.indexOf('js/pollorun.js') === -1, 'spento: la home stampa ancora lo script');
    esigi(typeof pagineSpente.giochi !== 'string' || pagineSpente.giochi.indexOf('js/pollorun.js') === -1, 'spento: la pagina dei giochi stampa ancora lo script');
    esigi(pagineSpente.html.indexOf('js/slayer.js') !== -1, 'spento: e sparita anche la sorpresa slayer');
    esigi(pagineSpente.html.indexOf('js/guardia.js') !== -1, 'spento: e sparita anche la guardia');
    const senzaRamo = archivio.leggi();
    delete senzaRamo.config.pollorun;
    esigi(costruisci.rendi(senzaRamo).html.indexOf('js/pollorun.js') !== -1, 'senza il ramo nei contenuti online deve restare acceso');
  });
}

async function proveCanzoniPollo(costruisci, archivio) {
  apriSezione('11g. Pollo Run: le canzoni del gioco scelte dal pannello');

  const vm = require('node:vm');
  const ELENCO = [
    ['Stereo Madness', 'ForeverBound', 'ForeverBound - Stereo Madness.mp3'],
    ['Back On Track', 'DJVI', 'DJVI - Back On Track.mp3'],
    ['Polargeist', 'Step', 'Step - Polargeist.mp3'],
    ['Dry Out', 'DJVI', 'DJVI - Dry Out.mp3'],
    ['Base After Base', 'DJVI', 'DJVI - Base After Base.mp3'],
    ['Can\'t Let Go', 'DJVI', 'DJVI - Can\'t Let Go.mp3'],
    ['Jumper', 'Waterflame', 'Waterflame - Jumper.mp3'],
    ['Time Machine', 'Waterflame', 'Waterflame - Time Machine.mp3'],
    ['Cycles', 'DJVI', 'DJVI - Cycles.mp3'],
    ['xStep', 'DJVI', 'DJVI - xStep.mp3'],
    ['Clutterfunk', 'Waterflame', 'Waterflame - Clutterfunk.mp3'],
    ['Theory of Everything', 'DJVI', 'DJVI - Theory of Everything.mp3']
  ];
  const RIPIEGO = 'mp3/DJVI%20-%20Back%20On%20Track.mp3';
  const cartellaMp3 = path.join(P.radice, 'mp3');
  const creati = [];
  const cartellaNuova = !fs.existsSync(cartellaMp3);
  const metti = (relativo) => {
    const pieno = path.join(P.radice, relativo);
    fs.mkdirSync(path.dirname(pieno), { recursive: true });
    fs.writeFileSync(pieno, 'finto');
    creati.push(pieno);
  };
  const pulisci = () => {
    while (creati.length) { try { fs.unlinkSync(creati.pop()); } catch (e) {} }
    try { fs.rmSync(path.join(cartellaMp3, 'sotto'), { recursive: true, force: true }); } catch (e) {}
    if (cartellaNuova) { try { fs.rmSync(cartellaMp3, { recursive: true, force: true }); } catch (e) {} }
  };
  const disfa = (testo) => testo.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const conPollorun = (ritocco) => {
    const d = archivio.leggi();
    d.config.pollorun = Object.assign({}, d.config.pollorun);
    if (ritocco) { ritocco(d.config.pollorun, d); }
    return d;
  };

  await prova('schema: elenco delle canzoni, modo e canzone fissa nel gruppo manutenzione, subito dopo le frasi di scherno', () => {
    const gruppo = schema.gruppi.find((g) => g.id === 'manutenzione');
    const chiavi = gruppo.campi.map((c) => c.chiave);
    const dopo = chiavi.indexOf('config.manutenzione.scherno');
    esigi(dopo !== -1, 'mancano le frasi di scherno');
    esigiUguale(chiavi.slice(dopo + 1, dopo + 4).join(','), 'config.pollorun.canzoni,config.pollorun.modo,config.pollorun.canzoneFissa', 'posizione dei campi');
    const canzoni = schema.campo('config.pollorun.canzoni');
    esigiUguale(canzoni.tipo, 'elenco', 'tipo delle canzoni');
    esigiUguale(canzoni.campi.map((c) => c.chiave + ':' + c.tipo + ':' + c.max).join(','), 'titolo:testo:60,file:testo:100,autore:testo:60', 'campi di una canzone');
    esigi(canzoni.campi.every((c) => Object.prototype.hasOwnProperty.call(c, 'predefinito')), 'ogni campo di una canzone ha un predefinito');
    esigiUguale(canzoni.campi.find((c) => c.chiave === 'autore').facoltativo, true, 'l autore e facoltativo');
    esigiUguale(canzoni.campi.find((c) => c.chiave === 'file').forma, 'fileAudio', 'il file ha la sua regola');
    esigiUguale(JSON.stringify(canzoni.predefinito), JSON.stringify(ELENCO.map((v) => ({ titolo: v[0], file: v[2], autore: v[1] }))), 'le 12 canzoni in ordine');
    const modo = schema.campo('config.pollorun.modo');
    esigiUguale(modo.tipo, 'scelta', 'tipo del modo');
    esigiUguale(modo.predefinito, 'ordine', 'modo predefinito');
    esigiUguale(modo.opzioni.map((o) => o.valore).join(','), 'fissa,ordine,caso', 'opzioni del modo');
    const fissa = schema.campo('config.pollorun.canzoneFissa');
    esigiUguale(fissa.tipo + ':' + fissa.min + ':' + fissa.max + ':' + fissa.predefinito, 'numero:1:50:2', 'la canzone fissa');
    for (const c of [canzoni, modo, fissa]) {
      esigiDentro(c.aiuto, 'pollorun', c.chiave + ': l aiuto deve dire che vale anche per il gioco sul sito');
    }
    esigiDentro(canzoni.aiuto, 'mp3', 'l aiuto spiega dove caricare i file');
  });

  await prova('contenuti.json: il ramo pollorun ha le stesse canzoni dello schema ed e coperto', () => {
    const veri = JSON.parse(fs.readFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), 'utf8'));
    esigiUguale(JSON.stringify(veri.config.pollorun.canzoni), JSON.stringify(schema.campo('config.pollorun.canzoni').predefinito), 'canzoni');
    esigiUguale(veri.config.pollorun.modo, 'ordine', 'modo');
    esigiUguale(veri.config.pollorun.canzoneFissa, 2, 'canzone fissa');
    esigiUguale(veri.config.pollorun.attivo, true, 'interruttore');
    esigiUguale(schema.verificaCopertura(veri).length, 0, 'copertura dello schema');
    esigiUguale(convalida.convalida(veri).filter((e) => e.chiave.indexOf('config.pollorun') === 0).length, 0, 'le canzoni di partenza si convalidano');
    const vecchi = JSON.parse(JSON.stringify(veri));
    vecchi.config.pollorun = { attivo: true };
    schema.completa(vecchi);
    esigiUguale(vecchi.config.pollorun.canzoni.length, 12, 'un contenuti.json vecchio riceve le canzoni');
    esigiUguale(vecchi.config.pollorun.modo + ':' + vecchi.config.pollorun.canzoneFissa, 'ordine:2', 'e modo e numero');
  });

  await prova('convalida: il nome del file e solo un nome, sicuro, di una canzone', () => {
    const conFile = (file) => {
      const d = archivio.leggi();
      d.config.pollorun.canzoni = [{ titolo: 'Prova', file: file, autore: '' }];
      return convalida.convalida(d).filter((e) => e.chiave === 'config.pollorun.canzoni[0].file');
    };
    for (const cattivo of ['../x.mp3', 'a/b.mp3', 'a\\b.mp3', 'x.exe', '', '   ', 'senza', '..mp3', 'x.mp3.txt', 'tab\tx.mp3', '.mp3']) {
      const errori = conFile(cattivo);
      esigi(errori.length > 0, JSON.stringify(cattivo) + ' deve essere un errore');
      esigi(errori[0].messaggio.indexOf('Nome del file') !== -1,JSON.stringify(cattivo) + ': messaggio poco chiaro: ' + errori[0].messaggio);
    }
    for (const buono of ['DJVI - Back On Track.mp3', 'DJVI - Can\'t Let Go.mp3', 'CANZONE.MP3', 'Brano (remix) #2.Ogg', 'suono.wav', 'musica.m4a']) {
      esigiUguale(conFile(buono).length, 0, JSON.stringify(buono) + ' deve essere valido');
    }
    esigiDentro(conFile('a/b.mp3')[0].messaggio, 'cartella', 'il messaggio sulle cartelle');
    esigiDentro(conFile('x.exe')[0].messaggio, '.mp3', 'il messaggio sull estensione');
    esigiUguale(convalida.guaioFileAudio('DJVI - Back On Track.mp3'), null, 'guaioFileAudio su un nome buono');
    const d = archivio.leggi();
    d.config.pollorun.canzoni = [{ titolo: 'Prova', file: 'ok.mp3' }];
    esigi(convalida.convalida(d).some((e) => e.chiave === 'config.pollorun.canzoni[0].autore'), 'una voce senza autore deve dirlo');
    d.config.pollorun.canzoni = [{ titolo: 'Prova', file: 'ok.mp3', autore: '' }];
    d.config.pollorun.modo = 'boh';
    d.config.pollorun.canzoneFissa = 0;
    const errori = convalida.convalida(d).map((e) => e.chiave);
    esigi(errori.indexOf('config.pollorun.modo') !== -1, 'un modo inventato passa');
    esigi(errori.indexOf('config.pollorun.canzoneFissa') !== -1, 'la canzone numero 0 passa');
    esigiUguale(convalida.convalidaCampo('config.pollorun.modo', 'caso').length, 0, 'il modo a caso');
  });

  await prova('canzoniPolloRun: senza file nella cartella mp3 resta la canzone che c e gia sul server', () => {
    pulisci();
    const esito = costruisci.canzoniPolloRun(archivio.leggi().config);
    esigiUguale(JSON.stringify(esito), JSON.stringify({ canzoni: [{ titolo: 'Back On Track', autore: 'DJVI', file: RIPIEGO }], modo: 'ordine', fissa: 0 }), 'ripiego');
    esigiUguale(JSON.stringify(costruisci.canzoniPolloRun({})), JSON.stringify(esito), 'senza ramo');
    esigiUguale(JSON.stringify(costruisci.canzoniPolloRun({ pollorun: { canzoni: [] } })), JSON.stringify(esito), 'elenco vuoto');
  });

  try {
    await prova('canzoniPolloRun: solo le voci con il file vero, in ordine, codificate; la fissa si ricalcola nell elenco filtrato', () => {
      metti('mp3/DJVI - Back On Track.mp3');
      metti('mp3/DJVI - Can\'t Let Go.mp3');
      metti('mp3/DJVI - Cycles.mp3');
      const config = archivio.leggi().config;
      const esito = costruisci.canzoniPolloRun(config);
      esigiUguale(esito.canzoni.map((c) => c.titolo).join('|'), 'Back On Track|Can\'t Let Go|Cycles', 'voci tenute');
      esigiUguale(esito.canzoni[1].file, 'mp3/DJVI%20-%20Can\'t%20Let%20Go.mp3', 'nome con spazi e apostrofo');
      esigiUguale(esito.canzoni[0].file, RIPIEGO, 'nome con spazi');
      esigiUguale(esito.canzoni[2].autore, 'DJVI', 'autore');
      esigiUguale(esito.modo, 'ordine', 'modo');
      esigiUguale(esito.fissa, 0, 'la numero 2 (Back On Track) e la prima disponibile');
      const con = (ritocco) => { const c = JSON.parse(JSON.stringify(config)); ritocco(c.pollorun); return costruisci.canzoniPolloRun(c); };
      esigiUguale(con((r) => { r.canzoneFissa = 6; r.modo = 'fissa'; }).fissa, 1, 'la numero 6 e la seconda disponibile');
      esigiUguale(con((r) => { r.canzoneFissa = 9; }).fissa, 2, 'la numero 9 e la terza disponibile');
      esigiUguale(con((r) => { r.canzoneFissa = 3; }).fissa, 0, 'una canzone senza file ripiega sulla prima');
      esigiUguale(con((r) => { r.canzoneFissa = 50; }).fissa, 0, 'oltre l elenco ripiega sulla prima');
      esigiUguale(con((r) => { r.canzoneFissa = 'x'; }).fissa, 0, 'un numero rotto usa il predefinito');
      esigiUguale(con((r) => { r.modo = 'caso'; }).modo, 'caso', 'modo a caso');
      esigiUguale(con((r) => { r.modo = 'fissa'; }).modo, 'fissa', 'modo fisso');
      esigiUguale(con((r) => { r.modo = 'boh'; }).modo, 'ordine', 'modo inventato');
      esigiUguale(con((r) => { delete r.modo; }).modo, 'ordine', 'modo mancante');
      const senzaRamo = costruisci.canzoniPolloRun({});
      esigiUguale(senzaRamo.canzoni.length, 3, 'senza ramo usa l elenco predefinito');
      esigiUguale(senzaRamo.fissa, 0, 'e la fissa predefinita (2)');
    });

    await prova('canzoniPolloRun: nomi pericolosi scartati anche se il file esiste, titolo vuoto preso dal nome', () => {
      metti('fuori.mp3');
      metti('mp3/sotto/dentro.mp3');
      metti('mp3/programma.exe');
      metti('mp3/Senza Titolo.ogg');
      const esito = costruisci.canzoniPolloRun({ pollorun: { modo: 'fissa', canzoneFissa: 5, canzoni: [
        { titolo: 'Fuori', file: '../fuori.mp3', autore: '' },
        { titolo: 'Sotto', file: 'sotto/dentro.mp3', autore: '' },
        { titolo: 'Programma', file: 'programma.exe', autore: '' },
        null,
        { titolo: '', file: 'Senza Titolo.ogg' },
        { titolo: 'Manca', file: 'Non Esiste.mp3', autore: 'Nessuno' }
      ] } });
      esigiUguale(JSON.stringify(esito), JSON.stringify({ canzoni: [{ titolo: 'Senza Titolo', autore: '', file: 'mp3/Senza%20Titolo.ogg' }], modo: 'fissa', fissa: 0 }), 'esito');
    });

    await prova('il sito: data-canzoni nelle pagine, protetto; la manutenzione ha canvas e audio sulla prima canzone disponibile', () => {
      for (const nome of ['index', 'clip', 'giochi', 'sponsor']) {
        const testo = fs.readFileSync(path.join(RADICE_VERA, 'modelli', nome + '.html'), 'utf8');
        esigiDentro(testo, 'data-frasi="{{sito.pollorun.frasi}}" data-canzoni="{{sito.pollorun.canzoni}}" data-stile="{{sito.pollorun.stile}}" defer>', 'modelli/' + nome + '.html');
      }
      const modelloMnt = fs.readFileSync(path.join(RADICE_VERA, 'modelli', 'manutenzione.html'), 'utf8');
      esigiDentro(modelloMnt, 'data-canzoni="{{manutenzione.canzoniPollo}}"', 'canvas della manutenzione');
      esigiDentro(modelloMnt, '<audio id="mnt-audio-gioco" src="{{manutenzione.canzoneGioco}}"', 'audio della manutenzione');

      metti('mp3/Pericolo.mp3');
      const d = conPollorun((r, doc) => {
        r.canzoni = [{ titolo: '<b>"Titolo" & \'altro\'</b>', file: 'Pericolo.mp3', autore: '<i>' }].concat(r.canzoni);
        r.modo = 'caso';
        const clip = { id: 'c1', titolo: 'Una clip', url: 'https://clips.twitch.tv/c1',
          anteprima: 'https://clips-media-assets2.twitch.tv/c1-preview-480x272.jpg',
          durataSec: 30, visualizzazioni: 10, creataIl: '2026-09-01T20:00:00Z', autore: 'Qualcuno' };
        doc.config.clip = Object.assign({}, doc.config.clip, { attivo: true, voci: [clip], archivio: [clip] });
      });
      const pagine = costruisci.rendi(d);
      const cerca = (html) => { const m = /data-canzoni="([^"]*)"/.exec(html || ''); return m ? m[1] : null; };
      const grezzo = cerca(pagine.html);
      esigi(grezzo, 'la home non ha data-canzoni');
      esigi(grezzo.indexOf('<') === -1 && grezzo.indexOf('\'') === -1, 'data-canzoni non protetto');
      esigiDentro(grezzo, '&lt;b&gt;\\&quot;Titolo\\&quot; &amp; &#39;altro&#39;&lt;/b&gt;', 'escape del titolo');
      const letto = JSON.parse(disfa(grezzo));
      esigiUguale(letto.modo, 'caso', 'modo nella pagina');
      esigiUguale(letto.canzoni[0].titolo, '<b>"Titolo" & \'altro\'</b>', 'titolo riletto');
      esigiUguale(letto.canzoni.map((c) => c.file).join(','), 'mp3/Pericolo.mp3,' + RIPIEGO + ',mp3/DJVI%20-%20Can\'t%20Let%20Go.mp3,mp3/DJVI%20-%20Cycles.mp3', 'file nella pagina');
      esigiUguale(letto.fissa, 0, 'la numero 2 ora e Stereo Madness, senza file: si ripiega sulla prima');
      for (const nome of ['clip', 'giochi', 'sponsor']) {
        if (typeof pagine[nome] === 'string') { esigiUguale(cerca(pagine[nome]), grezzo, nome + '.html'); }
      }
      esigi(typeof pagine.clip === 'string', 'la pagina delle clip di prova non si e resa');

      const spento = conPollorun((r) => { r.attivo = false; });
      esigi(costruisci.rendi(spento).html.indexOf('data-canzoni') === -1, 'spento: data-canzoni resta nella home');

      const mnt = conPollorun((r, doc) => { doc.config.manutenzione = Object.assign({}, doc.config.manutenzione, { attiva: true, fine: '' }); });
      const pagina = costruisci.rendi(mnt, { adesso: Date.UTC(2026, 8, 23, 9, 0, 0) }).manutenzione;
      esigi(pagina, 'la pagina di manutenzione non si e resa');
      const tela = /<canvas[^>]*id="mnt-gioco"[^>]*data-canzoni="([^"]*)"/.exec(pagina);
      esigi(tela, 'il canvas non ha data-canzoni');
      esigiUguale(JSON.parse(disfa(tela[1])).canzoni[0].file, RIPIEGO, 'prima canzone disponibile sul canvas');
      esigiDentro(pagina, '<audio id="mnt-audio-gioco" src="' + RIPIEGO + '" loop', 'audio del gioco');
      pulisci();
      const vuota = costruisci.rendi(mnt, { adesso: Date.UTC(2026, 8, 23, 9, 0, 0) }).manutenzione;
      esigiDentro(vuota, '<audio id="mnt-audio-gioco" src="' + RIPIEGO + '" loop', 'audio di ripiego senza file');
    });
  } finally {
    pulisci();
  }

  const jsSito = fs.readFileSync(path.join(RADICE_VERA, 'js', 'pollorun.js'), 'utf8');
  const sito = (attributo, volume, stile) => {
    const r = { crea: [], audio: [], play: 0, pause: 0, cambi: 0 };
    const ascolta = {};
    const appesi = [];
    const memoria = volume === undefined ? {} : { 'sb-manutenzione-volumi': JSON.stringify({ attesa: 10, gioco: volume }) };
    function Audio() {
      let src = '';
      const a = { loop: false, volume: 1, currentTime: 0, preload: '', paused: true,
        play() { r.play++; a.paused = false; return Promise.reject(new Error('bloccato')); },
        pause() { r.pause++; a.paused = true; } };
      Object.defineProperty(a, 'src', { get: () => src, set: (v) => { r.cambi++; src = v; } });
      r.audio.push(a);
      return a;
    }
    const nodo = (tag) => ({ tag: tag, children: [], attrs: {}, parentNode: null,
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; },
      addEventListener() {}, focus() {} });
    const script = nodo('script');
    if (attributo !== null) { script.setAttribute('data-canzoni', attributo); }
    if (stile !== undefined) { script.setAttribute('data-stile', stile); }
    const finestra = { addEventListener: () => {}, PolloRun: { crea: (op) => { r.crea.push(op); return { avvia() {}, ferma() {} }; } } };
    const classi = new Set();
    vm.runInNewContext(jsSito, {
      window: finestra,
      document: {
        currentScript: script, body: nodo('body'), head: { appendChild: (n) => { appesi.push(n); return n; } },
        activeElement: null, addEventListener: (tipo, fn) => { ascolta[tipo] = fn; },
        documentElement: { classList: { add: (c) => classi.add(c), remove: (c) => classi.delete(c) } },
        createElement: nodo, querySelector: () => null
      },
      Audio: Audio,
      localStorage: { getItem: (k) => (k in memoria ? memoria[k] : null) },
      Date: { now: () => 1000 },
      JSON: JSON
    });
    for (const c of 'pollorun') { ascolta.keydown({ key: c, target: { tagName: 'BODY', nodeType: 1 } }); }
    for (const n of appesi) { if (n.onload) { n.onload(); } }
    return { r: r, op: r.crea[0], sito: finestra.PolloRunSito };
  };
  const pacchetto = JSON.stringify({ canzoni: [
    { titolo: 'Uno', autore: 'A', file: 'mp3/Uno.mp3' },
    { titolo: 'Cattivo', autore: '', file: 'javascript:alert(1)' },
    { titolo: 'Due', autore: '', file: 'mp3/Due.mp3' }
  ], modo: 'fissa', fissa: 2 });

  await prova('pollorun.js: legge data-canzoni e passa al motore canzoni, modo, fissa e suCanzone', () => {
    const p = sito(pacchetto, 70);
    esigi(p.op, 'il gioco non si e aperto');
    esigiUguale(JSON.stringify(p.op.canzoni), JSON.stringify([{ titolo: 'Uno', autore: 'A', file: 'mp3/Uno.mp3' }, { titolo: 'Due', autore: '', file: 'mp3/Due.mp3' }]), 'canzoni senza la voce cattiva');
    esigiUguale(p.op.modo, 'fissa', 'modo');
    esigiUguale(p.op.fissa, 1, 'la fissa segue la voce dopo il filtro');
    esigiUguale(typeof p.op.suCanzone, 'function', 'suCanzone');
    esigiUguale(p.r.play, 0, 'suona prima che il motore scelga');
    const ripiego = '[[{"titolo":"Back On Track","autore":"DJVI","file":"mp3/DJVI%20-%20Back%20On%20Track.mp3"}],"ordine",0]';
    for (const rotto of ['', 'non json', '{"a":1}', 'null', '[1,2]', '[]', '{"canzoni":[],"modo":"caso","fissa":3}', '{"canzoni":"x","modo":"boh"}',
      JSON.stringify({ canzoni: [{ titolo: 'A', file: 'http://x/a.mp3' }, { titolo: 'B', file: '../b.mp3' }, { titolo: 'C' }], modo: 'fissa', fissa: 1 })]) {
      const q = sito(rotto);
      esigiUguale(JSON.stringify([q.op.canzoni, q.op.modo, q.op.fissa]), ripiego, 'con ' + JSON.stringify(rotto));
    }
    esigiUguale(JSON.stringify([sito(null).op.canzoni, sito(null).op.modo, sito(null).op.fissa]), ripiego, 'senza attributo');
    esigiUguale(sito(JSON.stringify([{ titolo: 'X', file: 'mp3/X.mp3' }])).op.canzoni.length, 1, 'anche un elenco secco');
  });

  await prova('pollorun.js: senza elenco valido suona comunque Back On Track', () => {
    for (const attributo of [null, '{rotto', '[]']) {
      const p = sito(attributo, 40);
      const voce = Object.assign({ indice: 0 }, p.op.canzoni[0]);
      p.op.suCanzone(voce);
      esigiUguale(p.r.audio.length, 1, 'un audio con ' + JSON.stringify(attributo));
      esigiUguale(p.r.audio[0].src, 'mp3/DJVI%20-%20Back%20On%20Track.mp3', 'src del ripiego con ' + JSON.stringify(attributo));
      esigiUguale(p.r.audio[0].volume, 0.4, 'volume con ' + JSON.stringify(attributo));
      esigiUguale(p.r.play, 1, 'il ripiego non suona con ' + JSON.stringify(attributo));
    }
  });

  await prova('pollorun.js: data-stile arriva al motore; assente o sconosciuto vale synthwave', () => {
    esigiUguale(sito(pacchetto, undefined, 'geometrydash').op.stile, 'geometrydash', 'geometrydash');
    esigiUguale(sito(pacchetto, undefined, 'synthwave').op.stile, 'synthwave', 'synthwave');
    esigiUguale(sito(pacchetto).op.stile, 'synthwave', 'senza attributo');
    for (const brutto of ['', 'GeometryDash', 'boh', ' geometrydash', '<b>']) {
      esigiUguale(sito(pacchetto, undefined, brutto).op.stile, 'synthwave', 'con ' + JSON.stringify(brutto));
    }
  });

  await prova('pollorun.js: suCanzone suona la voce scelta dall inizio, cambia src solo se serve, con null mette in pausa', () => {
    const p = sito(pacchetto, 70);
    p.op.suPartita(true);
    esigiUguale(p.r.play, 0, 'suPartita fa ancora suonare');
    p.op.suCanzone({ titolo: 'Uno', autore: 'A', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(p.r.audio.length, 1, 'un solo audio');
    const a = p.r.audio[0];
    esigiUguale(a.src, 'mp3/Uno.mp3', 'src');
    esigiUguale(a.loop, true, 'loop');
    esigiUguale(a.volume, 0.7, 'volume salvato');
    esigiUguale(p.r.play, 1, 'non suona');
    a.currentTime = 42;
    p.op.suCanzone({ titolo: 'Uno', autore: 'A', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(a.currentTime, 0, 'non riparte da capo');
    esigiUguale(p.r.cambi, 1, 'stesso file: src riassegnato');
    esigiUguale(p.r.play, 2, 'la seconda volta non suona');
    p.op.suCanzone(null);
    esigiUguale(p.r.pause, 1, 'con null non si ferma');
    esigiUguale(a.paused, true, 'in pausa');
    p.op.suCanzone({ titolo: 'Due', autore: '', file: 'mp3/Due.mp3', indice: 1 });
    esigiUguale(a.src, 'mp3/Due.mp3', 'cambio canzone');
    esigiUguale(p.r.cambi, 2, 'cambi di src');
    esigiUguale(p.r.audio.length, 1, 'l audio si riusa');
    const primaDi = p.r.play;
    p.op.suCanzone({ file: 'javascript:alert(1)' });
    esigiUguale(p.r.play, primaDi, 'un file cattivo suona');
    esigiUguale(a.src, 'mp3/Due.mp3', 'un file cattivo cambia src');
    p.op.suPartita(false);
    p.sito.chiudi();
    esigi(a.paused, 'alla chiusura resta accesa');
    const dopo = p.r.play;
    p.op.suCanzone({ titolo: 'Uno', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(p.r.play, dopo, 'a gioco chiuso suona ancora');
    const base = sito(pacchetto);
    base.op.suCanzone({ titolo: 'Uno', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(base.r.audio[0].volume, 0.3, 'volume di partenza');
  });

  const jsMnt = fs.readFileSync(path.join(RADICE_VERA, 'modelli', 'manutenzione-conto.js'), 'utf8');
  const manutenzione = (opzioni) => {
    const o = Object.assign({ spenta: false, canzoni: pacchetto }, opzioni || {});
    const ascolta = {};
    const crea = [];
    const elemento = (nome, attributi) => {
      const e = { nome: nome, paused: true, currentTime: 0, volume: 1, error: null, suoni: 0, ascolta: {}, attrs: attributi || {}, hidden: false,
        getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; },
        setAttribute(k, v) { e.attrs[k] = v; },
        addEventListener(tipo, fn) { e.ascolta[tipo] = fn; },
        contains: () => false,
        classList: { toggle() {}, contains: () => false },
        play() { e.paused = false; e.suoni++; if (e.ascolta.play) { e.ascolta.play(); } return Promise.resolve(); },
        pause() { e.paused = true; if (e.ascolta.pause) { e.ascolta.pause(); } },
        spara(tipo) { if (e.ascolta[tipo]) { e.ascolta[tipo](); } } };
      e.src = e.attrs.src || '';
      return e;
    };
    const el = {
      'mnt-gioco': elemento('tela', Object.assign({ 'data-frasi': '[]', 'data-pollo': '' },
        o.canzoni === null ? {} : { 'data-canzoni': o.canzoni }, o.stile === undefined ? {} : { 'data-stile': o.stile })),
      'mnt-audio': elemento('attesa', { src: 'mp3/ElevatorMaintenance.mp3' }),
      'mnt-audio-gioco': elemento('brano', { src: 'mp3/Uno.mp3' }),
      'mnt-musica': elemento('tasto')
    };
    const documento = {
      body: { classList: { toggle() {} } },
      hidden: false,
      getElementById: (id) => el[id] || null,
      addEventListener: (tipo, fn) => { (ascolta[tipo] = ascolta[tipo] || []).push(fn); },
      removeEventListener: () => {},
      dispatchEvent: (evento) => { for (const fn of ascolta[evento.type] || []) { fn(evento); } return true; }
    };
    const Evento = function (tipo, op) { this.type = tipo; this.detail = op && op.detail; };
    const finestra = { addEventListener: () => {}, PolloRun: { crea: (op) => { crea.push(op); return { avvia() {} }; } } };
    const memoria = o.spenta ? { 'sb-manutenzione-musica': 'no' } : {};
    new Function('window', 'document', 'location', 'sessionStorage', 'localStorage', 'CustomEvent', 'fetch', 'setInterval', jsMnt)(
      finestra, documento, { pathname: '/' },
      { getItem: (k) => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = v; } },
      { getItem: () => null, setItem: () => {} }, Evento, undefined, () => 1);
    return { op: crea[0], attesa: el['mnt-audio'], brano: el['mnt-audio-gioco'] };
  };

  await prova('manutenzione: il gioco riceve le canzoni del canvas e un suCanzone', () => {
    const m = manutenzione();
    esigi(m.op, 'il gioco non nasce');
    esigiUguale(m.op.canzoni.map((c) => c.file).join(','), 'mp3/Uno.mp3,mp3/Due.mp3', 'canzoni');
    esigiUguale(m.op.modo + ':' + m.op.fissa, 'fissa:1', 'modo e fissa');
    esigiUguale(typeof m.op.suCanzone, 'function', 'suCanzone');
    const ripiego = '[[{"titolo":"Back On Track","autore":"DJVI","file":"mp3/DJVI%20-%20Back%20On%20Track.mp3"}],"ordine",0]';
    for (const rotto of [null, '{rotto', '[]', '{"canzoni":[],"modo":"caso","fissa":2}', JSON.stringify({ canzoni: [{ titolo: 'A', file: 'a.mp3' }, { titolo: 'B', file: '/mp3/b.mp3' }], modo: 'fissa', fissa: 1 })]) {
      const rotta = manutenzione({ canzoni: rotto });
      esigiUguale(JSON.stringify([rotta.op.canzoni, rotta.op.modo, rotta.op.fissa]), ripiego, 'data-canzoni ' + JSON.stringify(rotto));
    }
    const senza = manutenzione({ canzoni: null });
    senza.op.suPartita(true);
    senza.op.suCanzone(Object.assign({ indice: 0 }, senza.op.canzoni[0]));
    esigiUguale(senza.brano.src + ':' + senza.brano.paused, 'mp3/DJVI%20-%20Back%20On%20Track.mp3:false', 'il ripiego non suona');
  });

  await prova('manutenzione: data-stile arriva al motore; assente o sconosciuto vale synthwave', () => {
    esigiUguale(manutenzione({ stile: 'geometrydash' }).op.stile, 'geometrydash', 'geometrydash');
    esigiUguale(manutenzione({ stile: 'synthwave' }).op.stile, 'synthwave', 'synthwave');
    esigiUguale(manutenzione().op.stile, 'synthwave', 'senza attributo');
    for (const brutto of ['', 'GEOMETRYDASH', 'boh', '<b>']) {
      esigiUguale(manutenzione({ stile: brutto }).op.stile, 'synthwave', 'con ' + JSON.stringify(brutto));
    }
  });

  await prova('manutenzione: una sola traccia del gioco che segue suCanzone; null la ferma senza musica d attesa; il ritorno la riaccende', () => {
    const m = manutenzione();
    esigiUguale(m.attesa.paused, false, 'la musica d attesa parte all apertura');
    m.op.suPartita(true);
    esigiUguale(m.attesa.paused, true, 'la musica d attesa non si ferma in partita');
    esigiUguale(m.brano.paused, true, 'il brano parte prima che il motore scelga');
    m.op.suCanzone({ titolo: 'Due', file: 'mp3/Due.mp3', indice: 1 });
    esigiUguale(m.brano.src, 'mp3/Due.mp3', 'src del brano');
    esigiUguale(m.brano.paused, false, 'il brano non suona');
    m.brano.currentTime = 30;
    m.op.suCanzone({ titolo: 'Due', file: 'mp3/Due.mp3', indice: 1 });
    esigiUguale(m.brano.currentTime, 0, 'stessa canzone: non riparte da capo');
    esigiUguale(m.brano.paused, false, 'stessa canzone: non suona');
    m.op.suCanzone(null);
    esigiUguale(m.brano.paused, true, 'null non ferma il brano');
    esigiUguale(m.attesa.paused, true, 'null fa ripartire la musica d attesa');
    m.op.suCanzone({ titolo: 'Uno', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(m.brano.src + ':' + m.brano.paused, 'mp3/Uno.mp3:false', 'cambio di canzone');
    m.op.suPartita(false);
    esigiUguale(m.brano.paused, true, 'uscendo il brano resta acceso');
    esigiUguale(m.attesa.paused, false, 'uscendo non torna la musica d attesa');
    m.op.suCanzone(null);
    esigiUguale(m.attesa.paused, false, 'un null dopo l uscita spegne la musica d attesa');

    const prima = manutenzione();
    prima.op.suCanzone({ titolo: 'Due', file: 'mp3/Due.mp3', indice: 1 });
    esigiUguale(prima.brano.paused, true, 'fuori partita il brano non deve suonare');
    prima.op.suPartita(true);
    esigiUguale(prima.brano.src + ':' + prima.brano.paused, 'mp3/Due.mp3:false', 'canzone scelta prima di suPartita');

    const zitta = manutenzione({ spenta: true });
    zitta.op.suPartita(true);
    zitta.op.suCanzone({ titolo: 'Uno', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(zitta.brano.paused + ':' + zitta.attesa.paused, 'true:true', 'con la musica spenta dall utente non suona niente');
  });

  await prova('manutenzione: una canzone che non si carica ripiega sulla musica d attesa solo finche quel brano e in errore', () => {
    const m = manutenzione();
    m.op.suPartita(true);
    m.op.suCanzone({ titolo: 'Due', file: 'mp3/Due.mp3', indice: 1 });
    m.brano.spara('error');
    esigiUguale(m.attesa.paused, true, 'un errore senza media error non deve valere come brano rotto');
    m.brano.error = { code: 4 };
    m.brano.spara('error');
    esigiUguale(m.attesa.paused + ':' + m.brano.paused, 'false:true', 'il ripiego sulla musica d attesa');
    m.op.suCanzone(null);
    esigiUguale(m.attesa.paused, true, 'fra un tentativo e l altro il ripiego si ferma');
    m.op.suCanzone({ titolo: 'Due', file: 'mp3/Due.mp3', indice: 1 });
    esigiUguale(m.attesa.paused + ':' + m.brano.paused, 'false:true', 'lo stesso brano rotto resta sul ripiego');
    m.brano.error = null;
    m.op.suCanzone({ titolo: 'Uno', file: 'mp3/Uno.mp3', indice: 0 });
    esigiUguale(m.attesa.paused + ':' + m.brano.paused + ':' + m.brano.src, 'true:false:mp3/Uno.mp3', 'un brano nuovo torna a suonare');
  });
}

async function proveStilePollo(costruisci, archivio) {
  apriSezione('11h. Pollo Run: lo stile grafico scelto dal pannello');

  await prova('schema: lo stile grafico e una scelta fra synthwave e geometrydash, dopo le canzoni, synthwave di partenza', () => {
    const campo = schema.campo('config.pollorun.stile');
    esigi(campo, 'manca il campo');
    esigiUguale(campo.tipo, 'scelta', 'tipo');
    esigiUguale(campo.etichetta, 'Pollo Run — stile grafico', 'etichetta');
    esigiUguale(campo.predefinito, 'synthwave', 'predefinito');
    esigiUguale(campo.opzioni.map((o) => o.valore).join(','), 'synthwave,geometrydash', 'opzioni');
    esigi(campo.opzioni.every((o) => typeof o.etichetta === 'string' && o.etichetta.length > 10), 'le opzioni hanno un etichetta leggibile');
    esigiDentro(campo.aiuto, 'pollorun', 'l aiuto dice che vale anche per il gioco sul sito');
    esigiDentro(campo.aiuto, 'manutenzione', 'l aiuto dice che vale per la manutenzione');
    const chiavi = schema.gruppi.find((g) => g.id === 'manutenzione').campi.map((c) => c.chiave);
    esigiUguale(chiavi.indexOf('config.pollorun.stile'), chiavi.indexOf('config.pollorun.canzoneFissa') + 1, 'posizione dopo le canzoni');
    const veri = JSON.parse(fs.readFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), 'utf8'));
    esigiUguale(veri.config.pollorun.stile, 'synthwave', 'contenuti.json');
    esigiUguale(schema.verificaCopertura(veri).length, 0, 'copertura');
    esigiUguale(convalida.convalidaCampo('config.pollorun.stile', 'geometrydash').length, 0, 'geometrydash valido');
    esigi(convalida.convalidaCampo('config.pollorun.stile', 'boh').length > 0, 'uno stile inventato passa');
    const vecchi = JSON.parse(JSON.stringify(veri));
    delete vecchi.config.pollorun.stile;
    schema.completa(vecchi);
    esigiUguale(vecchi.config.pollorun.stile, 'synthwave', 'un contenuti.json vecchio riceve lo stile');
  });

  await prova('stilePolloRun: valido resta, sconosciuto o mancante diventa synthwave', () => {
    esigiUguale(costruisci.stilePolloRun({ pollorun: { stile: 'geometrydash' } }), 'geometrydash', 'geometrydash');
    esigiUguale(costruisci.stilePolloRun({ pollorun: { stile: 'synthwave' } }), 'synthwave', 'synthwave');
    for (const brutto of ['boh', '', 'GEOMETRYDASH', 3, null, ['geometrydash']]) {
      esigiUguale(costruisci.stilePolloRun({ pollorun: { stile: brutto } }), 'synthwave', 'con ' + JSON.stringify(brutto));
    }
    esigiUguale(costruisci.stilePolloRun({ pollorun: {} }), 'synthwave', 'senza chiave');
    esigiUguale(costruisci.stilePolloRun({}), 'synthwave', 'senza ramo');
    esigiUguale(costruisci.stilePolloRun(null), 'synthwave', 'senza config');
  });

  await prova('il sito: data-stile nei 4 modelli e sul canvas della manutenzione, sempre uno dei due valori', () => {
    for (const nome of ['index', 'clip', 'giochi', 'sponsor']) {
      const testo = fs.readFileSync(path.join(RADICE_VERA, 'modelli', nome + '.html'), 'utf8');
      esigiDentro(testo, 'data-canzoni="{{sito.pollorun.canzoni}}" data-stile="{{sito.pollorun.stile}}" defer>', 'modelli/' + nome + '.html');
    }
    esigiDentro(fs.readFileSync(path.join(RADICE_VERA, 'modelli', 'manutenzione.html'), 'utf8'),
      'data-canzoni="{{manutenzione.canzoniPollo}}" data-stile="{{manutenzione.stilePollo}}"', 'modelli/manutenzione.html');
    const clip = { id: 's1', titolo: 'Una clip', url: 'https://clips.twitch.tv/s1',
      anteprima: 'https://clips-media-assets2.twitch.tv/s1-preview-480x272.jpg',
      durataSec: 30, visualizzazioni: 10, creataIl: '2026-09-01T20:00:00Z', autore: 'Qualcuno' };
    const documento = (stile) => {
      const d = archivio.leggi();
      d.config.pollorun.stile = stile;
      d.config.clip = Object.assign({}, d.config.clip, { attivo: true, voci: [clip], archivio: [clip] });
      return d;
    };
    const stileDi = (html) => { const m = /js\/pollorun\.js"[^>]*data-stile="([^"]*)"/.exec(html || ''); return m ? m[1] : null; };
    for (const [scritto, atteso] of [['geometrydash', 'geometrydash'], ['synthwave', 'synthwave'], ['"><script>x</script>', 'synthwave']]) {
      const pagine = costruisci.rendi(documento(scritto));
      esigiUguale(stileDi(pagine.html), atteso, 'home con ' + JSON.stringify(scritto));
      esigi(typeof pagine.clip === 'string', 'la pagina delle clip non si e resa');
      for (const nome of ['clip', 'giochi', 'sponsor']) {
        if (typeof pagine[nome] === 'string') { esigiUguale(stileDi(pagine[nome]), atteso, nome + '.html con ' + JSON.stringify(scritto)); }
      }
      esigi(pagine.html.indexOf('<script>x</script>') === -1, 'uno stile scritto a mano entra in pagina');
      const mnt = documento(scritto);
      mnt.config.manutenzione = Object.assign({}, mnt.config.manutenzione, { attiva: true, fine: '' });
      const pagina = costruisci.rendi(mnt, { adesso: Date.UTC(2026, 8, 23, 9, 0, 0) }).manutenzione;
      const tela = /<canvas[^>]*id="mnt-gioco"[^>]*data-stile="([^"]*)"/.exec(pagina || '');
      esigi(tela, 'il canvas non ha data-stile');
      esigiUguale(tela[1], atteso, 'canvas con ' + JSON.stringify(scritto));
    }
    const spento = documento('geometrydash');
    spento.config.pollorun.attivo = false;
    esigi(costruisci.rendi(spento).html.indexOf('data-stile') === -1, 'spento: data-stile resta nella home');
  });
}

async function proveClassifica(costruisci, archivio) {
  apriSezione('11i. Classifica di Pollo Run: accesso Twitch, gettoni e overlay per OBS');

  const vm = require('node:vm');
  const classifica = require('./lib/classifica');
  const sondaggi = require('./lib/sondaggi');
  const auth = require('./lib/autenticazione');
  const statico = require('./lib/statico');
  const { creaServer } = require('./server.js');
  const server = creaServer();
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  const porta = server.address().port;

  const originale = fs.readFileSync(percorsi.P.contenutiJson, 'utf8');
  const clientId = archivio.leggi().config.account.clientId;
  const UTENTI = {
    tokenanna0000001: { user_id: '101', login: 'anna', client_id: clientId },
    tokenbruno000002: { user_id: '202', login: 'bruno', client_id: clientId },
    tokenaltraapp003: { user_id: '303', login: 'carlo', client_id: 'unaltraapp' },
    tokendario000004: { user_id: '404', login: 'dario', client_id: clientId }
  };
  const PROFILI = {
    101: { id: '101', display_name: 'Anna <b>la Pazza</b>', profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/anna-300x300.png' },
    202: { id: '202', display_name: 'Bruno', profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/bruno-300x300.png' },
    404: { id: '404', display_name: 'Dario', profile_image_url: 'https://cattivo.example/x.png' }
  };
  let ora = Date.UTC(2026, 8, 27, 18, 0, 0);
  sondaggi.sostituisciVerifica(async (token) => UTENTI[token] || null);
  classifica.sostituisciProfilo(async (token, utente) => PROFILI[utente.id] || null);
  classifica.sostituisciOrologio(() => ora);
  classifica.dimentica();
  fs.rmSync(classifica.percorsoDati(), { force: true });
  fs.rmSync(classifica.percorsoChiave(), { force: true });
  auth.azzeraTutto();

  const accendi = (attiva, altro) => {
    const d = archivio.leggi();
    d.config.classifica = Object.assign({}, d.config.classifica, { attiva: attiva }, altro || {});
    archivio.salva(d);
  };
  const conToken = (token) => (token ? { Authorization: 'Bearer ' + token } : {});
  const partita = (token, corpo) => chiama(porta, 'POST', '/api/classifica/partita', { intestazioni: conToken(token), json: corpo });
  const livello = (token, corpo) => chiama(porta, 'POST', '/api/classifica/livello', { intestazioni: conToken(token), json: corpo });
  const attesa = (n, difficolta) => Math.ceil(classifica.durataLivello(n, difficolta) * 1000 * 0.86);
  const completa = async (token, n, difficolta, tentativi) => {
    const p = await partita(token, { livello: n, difficolta: difficolta });
    esigiUguale(p.stato, 200, 'partita del livello ' + n + ' (' + JSON.stringify(p.dati) + ')');
    ora += attesa(n, difficolta);
    const l = await livello(token, { partita: p.dati.partita, tentativi: tentativi || 1 });
    esigiUguale(l.stato, 200, 'livello ' + n + ' (' + JSON.stringify(l.dati) + ')');
    return l.dati;
  };
  const pubblica = async (difficolta) => (await chiama(porta, 'GET', '/api/classifica?difficolta=' + difficolta)).dati;

  try {
    const entra = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } });
    const biscotto = biscottoDa(entra);
    esigi(biscotto, 'niente sessione per le prove della classifica');
    const gestisci = (percorso, corpo) => chiama(porta, 'POST', percorso, { biscotto, json: corpo });

    await prova('schema: sei campi della classifica accanto a Pollo Run, predefiniti e limiti del contratto', () => {
      const attesi = { attiva: ['interruttore', false], titolo: ['testo', 'Classifica di Pollo Run'], righe: ['numero', 10],
        difficoltaObs: ['scelta', 'medio'], avatar: ['interruttore', true], aggiornaSecondi: ['numero', 15] };
      const gruppo = schema.gruppi.find((g) => g.campi.some((c) => c.chiave === 'config.pollorun.attivo'));
      const chiavi = gruppo.campi.map((c) => c.chiave);
      for (const nome of Object.keys(attesi)) {
        const campo = schema.campo('config.classifica.' + nome);
        esigi(campo, 'manca config.classifica.' + nome);
        esigiUguale(campo.tipo, attesi[nome][0], nome + ' tipo');
        esigiUguale(campo.predefinito, attesi[nome][1], nome + ' predefinito');
        esigi(chiavi.indexOf(campo.chiave) > chiavi.indexOf('config.pollorun.attivo'), nome + ' non sta vicino a Pollo Run');
      }
      esigiUguale(schema.campo('config.classifica.difficoltaObs').opzioni.map((o) => o.valore).join(), 'facile,medio,difficile,estremo,tutte', 'opzioni');
      esigiUguale(convalida.convalidaCampo('config.classifica.righe', 2).length > 0, true, 'righe 2');
      esigiUguale(convalida.convalidaCampo('config.classifica.righe', 26).length > 0, true, 'righe 26');
      esigiUguale(convalida.convalidaCampo('config.classifica.righe', 25).length, 0, 'righe 25');
      esigiUguale(convalida.convalidaCampo('config.classifica.aggiornaSecondi', 4).length > 0, true, 'secondi 4');
      esigiUguale(convalida.convalidaCampo('config.classifica.aggiornaSecondi', 61).length > 0, true, 'secondi 61');
      esigiUguale(convalida.convalidaCampo('config.classifica.difficoltaObs', 'tutte').length, 0, 'tutte');
      esigi(convalida.convalidaCampo('config.classifica.difficoltaObs', 'boh').length > 0, 'difficolta inventata');
      esigi(convalida.convalidaCampo('config.classifica.titolo', '').length > 0, 'titolo vuoto');
      const veri = JSON.parse(fs.readFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), 'utf8'));
      esigiUguale(veri.config.classifica.attiva, false, 'spenta di serie in contenuti.json');
      esigiUguale(schema.verificaCopertura(veri).length, 0, 'copertura');
      esigiUguale(convalida.convalida(veri).length, 0, 'convalida');
      const vecchi = JSON.parse(JSON.stringify(veri));
      delete vecchi.config.classifica;
      schema.completa(vecchi);
      esigiUguale(JSON.stringify(vecchi.config.classifica), JSON.stringify(veri.config.classifica), 'un contenuti.json vecchio riceve i predefiniti');
    });

    await prova('la durata del livello viene dal motore vero di pollorun-gioco.js, caricato in un vm', () => {
      const finestra = {};
      vm.runInNewContext(fs.readFileSync(path.join(RADICE_VERA, 'js', 'pollorun-gioco.js'), 'utf8'), { window: finestra });
      for (const d of classifica.DIFFICOLTA) {
        for (const n of [1, 2, 7, 30, 200]) {
          esigiUguale(classifica.durataLivello(n, d), finestra.PolloRun.livelli.parametri(n, d).durata, d + ' livello ' + n);
        }
      }
      esigi(classifica.durataLivello(1, 'medio') >= 30, 'il livello 1 dura troppo poco');
    });

    await prova('spenta: niente partite (404), la lettura pubblica dice attiva false', async () => {
      accendi(false);
      const p = await partita('tokenanna0000001', { livello: 1, difficolta: 'medio' });
      esigiUguale(p.stato, 404, 'partita a classifica spenta');
      esigiUguale(p.dati.codice, 'SPENTA', 'codice');
      esigiUguale((await livello('tokenanna0000001', { partita: 'x.y' })).stato, 404, 'livello a classifica spenta');
      const r = await chiama(porta, 'GET', '/api/classifica?difficolta=medio');
      esigiUguale(r.stato, 200, 'lettura');
      esigiUguale(r.dati.attiva, false, 'attiva');
      esigiUguale(r.dati.righe.length, 0, 'righe');
      accendi(true);
    });

    await prova('senza Twitch, con un token finto o di un altra app: 401, e /io risponde collegato false', async () => {
      esigiUguale((await partita('', { livello: 1, difficolta: 'medio' })).stato, 401, 'senza token');
      esigiUguale((await partita('tokeninventato99', { livello: 1, difficolta: 'medio' })).stato, 401, 'token finto');
      esigiUguale((await partita('tokenaltraapp003', { livello: 1, difficolta: 'medio' })).stato, 401, 'altra app');
      esigiUguale((await partita('corto', { livello: 1, difficolta: 'medio' })).stato, 401, 'token storto');
      esigiUguale((await livello('', { partita: 'x.y' })).stato, 401, 'livello senza token');
      for (const token of ['', 'tokeninventato99']) {
        const io = await chiama(porta, 'GET', '/api/classifica/io', { intestazioni: conToken(token) });
        esigiUguale(io.stato, 200, 'io ' + token);
        esigiUguale(JSON.stringify(io.dati), '{"collegato":false}', 'io ' + token);
      }
    });

    await prova('partita: livello e difficolta controllati, il livello 2 senza l 1 e un 409 con serve', async () => {
      for (const corpo of [{ livello: 0, difficolta: 'medio' }, { livello: '1', difficolta: 'medio' }, { livello: 1.5, difficolta: 'medio' },
        { livello: 1, difficolta: 'boh' }, { livello: 1 }, { difficolta: 'medio' }]) {
        esigiUguale((await partita('tokenanna0000001', corpo)).stato, 400, JSON.stringify(corpo));
      }
      const r = await partita('tokenanna0000001', { livello: 2, difficolta: 'medio' });
      esigiUguale(r.stato, 409, 'livello 2 senza il primo');
      esigiUguale(r.dati.serve, 1, 'serve');
      esigiUguale(r.dati.codice, 'SERVE_PRECEDENTE', 'codice');
      const p = await partita('tokenanna0000001', { livello: 1, difficolta: 'medio' });
      esigiUguale(p.stato, 200, 'livello 1 sempre ammesso');
      esigi(typeof p.dati.partita === 'string' && p.dati.partita.split('.').length === 2, 'gettone');
      esigiUguale(Date.parse(p.dati.scade) - ora, 2 * 60 * 60 * 1000, 'il gettone dura 2 ore');
    });

    await prova('livello: gettone manomesso, di un altro, troppo veloce, tentativi storti vengono rifiutati', async () => {
      const p = await partita('tokenanna0000001', { livello: 1, difficolta: 'medio' });
      const gettone = p.dati.partita;
      esigiUguale((await livello('tokenanna0000001', {})).stato, 400, 'senza partita');
      const [corpo, firma] = gettone.split('.');
      const falso = Buffer.from(JSON.stringify(Object.assign(JSON.parse(Buffer.from(corpo, 'base64').toString('utf8')), { n: 9 }))).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
      for (const storto of [falso + '.' + firma, gettone + 'x', 'nonunaregola', corpo + '.' + firma.slice(0, -2)]) {
        const r = await livello('tokenanna0000001', { partita: storto });
        esigiUguale(r.stato, 422, 'gettone ' + storto.slice(0, 20));
        esigiUguale(r.dati.codice, 'GETTONE_NON_VALIDO', 'codice');
      }
      ora += attesa(1, 'medio');
      esigiUguale((await livello('tokenbruno000002', { partita: gettone })).dati.codice, 'GETTONE_NON_VALIDO', 'gettone di un altro');
      for (const t of [0, -1, 1.5, '3', 100001]) {
        esigiUguale((await livello('tokenanna0000001', { partita: gettone, tentativi: t })).stato, 400, 'tentativi ' + JSON.stringify(t));
      }
      const veloce = await partita('tokenanna0000001', { livello: 1, difficolta: 'medio' });
      ora += Math.floor(classifica.durataLivello(1, 'medio') * 1000 * 0.84);
      const r = await livello('tokenanna0000001', { partita: veloce.dati.partita });
      esigiUguale(r.stato, 422, 'troppo veloce');
      esigiUguale(r.dati.codice, 'TROPPO_VELOCE', 'codice');
      esigiUguale((await pubblica('medio')).righe.length, 0, 'niente in classifica');
    });

    await prova('livello accettato dopo l 85% della durata, e lo stesso gettone non si riusa (409)', async () => {
      const p = await partita('tokenanna0000001', { livello: 1, difficolta: 'medio' });
      ora += Math.ceil(classifica.durataLivello(1, 'medio') * 1000 * 0.85);
      const r = await livello('tokenanna0000001', { partita: p.dati.partita, tentativi: 4 });
      esigiUguale(r.stato, 200, 'accettato');
      esigiUguale(JSON.stringify(r.dati), JSON.stringify({ difficolta: 'medio', livello: 1, migliore: true, record: 1, posizione: 1, totale: 1 }), 'risposta');
      const ancora = await livello('tokenanna0000001', { partita: p.dati.partita, tentativi: 4 });
      esigiUguale(ancora.stato, 409, 'riuso');
      esigiUguale(ancora.dati.codice, 'GETTONE_USATO', 'codice');
      classifica.dimentica();
      esigiUguale((await livello('tokenanna0000001', { partita: p.dati.partita })).stato, 409, 'il riuso resta vietato anche dopo un riavvio');
    });

    await prova('gettone scaduto dopo 2 ore: 422', async () => {
      const p = await partita('tokenanna0000001', { livello: 2, difficolta: 'medio' });
      esigiUguale(p.stato, 200, 'livello 2 dopo l 1');
      ora += 2 * 60 * 60 * 1000 + 1;
      const r = await livello('tokenanna0000001', { partita: p.dati.partita });
      esigiUguale(r.stato, 422, 'scaduto');
      esigiUguale(r.dati.codice, 'GETTONE_SCADUTO', 'codice');
    });

    await prova('sequenza: ogni difficolta ha la sua, e un livello saltato non entra', async () => {
      await completa('tokenanna0000001', 2, 'medio', 2);
      const salto = await partita('tokenanna0000001', { livello: 4, difficolta: 'medio' });
      esigiUguale(salto.stato, 409, 'salto al 4');
      esigiUguale(salto.dati.serve, 3, 'serve 3');
      esigiUguale((await partita('tokenanna0000001', { livello: 2, difficolta: 'facile' })).dati.serve, 1, 'facile parte da capo');
      const p = await partita('tokenbruno000002', { livello: 1, difficolta: 'medio' });
      ora += attesa(1, 'medio');
      const tolto = await chiama(porta, 'POST', '/api/classifica/livello', { intestazioni: conToken('tokenbruno000002'), json: { partita: p.dati.partita } });
      esigiUguale(tolto.stato, 200, 'bruno livello 1');
      const p2 = await partita('tokenbruno000002', { livello: 2, difficolta: 'medio' });
      esigiUguale((await gestisci('/api/classifica/togli', { difficolta: 'medio', id: '202' })).stato, 200, 'tolto dal pannello');
      ora += attesa(2, 'medio');
      const r = await livello('tokenbruno000002', { partita: p2.dati.partita });
      esigiUguale(r.stato, 409, 'il livello 1 non c e piu');
      esigiUguale(r.dati.serve, 1, 'serve');
    });

    await prova('ordinamento: livello piu alto, a parita chi ci e arrivato prima; rigiocare un livello basso non peggiora', async () => {
      await completa('tokenanna0000001', 3, 'medio');
      for (const n of [1, 2, 3]) { await completa('tokenbruno000002', n, 'medio'); }
      await completa('tokendario000004', 1, 'medio');
      let d = await pubblica('medio');
      esigiUguale(d.righe.map((r) => r.login).join(), 'anna,bruno,dario', 'ordine a parita');
      esigiUguale(d.righe.map((r) => r.pos).join(), '1,2,3', 'posizioni');
      esigiUguale(Object.keys(d.righe[0]).join(), 'pos,nome,login,avatar,livello,quando', 'campi della riga');
      esigiUguale(d.righe[0].nome, 'Anna <b>la Pazza</b>', 'il nome arriva da Twitch, come testo');
      esigiUguale(d.righe[2].avatar, '', 'un avatar che non viene da static-cdn.jtvnw.net sparisce');
      esigiUguale(d.totale, 3, 'totale');
      const b = await completa('tokenbruno000002', 4, 'medio', 9);
      esigiUguale(b.posizione, 1, 'bruno sale in testa');
      esigiUguale(b.migliore, true, 'migliore');
      const a = await completa('tokenanna0000001', 2, 'medio');
      esigiUguale(a.migliore, false, 'rigiocare il 2 non e un record');
      esigiUguale(a.record, 3, 'il record resta 3');
      d = await pubblica('medio');
      esigiUguale(d.righe.map((r) => r.login + r.livello).join(), 'bruno4,anna3,dario1', 'ordine finale');
      esigiUguale((await chiama(porta, 'GET', '/api/classifica?difficolta=medio&n=2')).dati.righe.length, 2, 'n=2');
      esigiUguale((await chiama(porta, 'GET', '/api/classifica?difficolta=boh')).stato, 400, 'difficolta inventata');
    });

    await prova('/io: chi e collegato vede nome, avatar e il migliore per difficolta', async () => {
      const io = await chiama(porta, 'GET', '/api/classifica/io', { intestazioni: conToken('tokenanna0000001') });
      esigiUguale(io.stato, 200, 'stato');
      esigiUguale(io.dati.collegato, true, 'collegato');
      esigiUguale(io.dati.login, 'anna', 'login');
      esigiUguale(io.dati.avatar, PROFILI[101].profile_image_url, 'avatar');
      esigiUguale(JSON.stringify(io.dati.migliori), '{"facile":0,"medio":3,"difficile":0,"estremo":0}', 'migliori');
    });

    await prova('ETag e 304 sulla lettura pubblica, e «tutte» da le quattro colonne', async () => {
      const primo = await chiama(porta, 'GET', '/api/classifica?difficolta=medio');
      const etag = primo.testa.etag;
      esigi(etag, 'manca l ETag');
      esigiUguale(primo.testa['cache-control'], 'no-cache', 'cache');
      const secondo = await chiama(porta, 'GET', '/api/classifica?difficolta=medio', { intestazioni: { 'If-None-Match': etag } });
      esigiUguale(secondo.stato, 304, 'non cambiata');
      esigiUguale(secondo.testo, '', 'un 304 non ha corpo');
      await completa('tokendario000004', 1, 'facile');
      const terzo = await chiama(porta, 'GET', '/api/classifica?difficolta=medio', { intestazioni: { 'If-None-Match': etag } });
      esigiUguale(terzo.stato, 200, 'dopo un livello nuovo cambia');
      esigi(terzo.testa.etag !== etag, 'ETag uguale');
      const tutte = await chiama(porta, 'GET', '/api/classifica?difficolta=tutte&n=5');
      esigiUguale(tutte.dati.difficolta, 'tutte', 'difficolta');
      esigiUguale(Object.keys(tutte.dati.gruppi).join(), 'facile,medio,difficile,estremo', 'gruppi');
      esigiUguale(tutte.dati.gruppi.facile[0].login, 'dario', 'facile');
      esigiUguale(tutte.dati.gruppi.medio.length, 3, 'medio');
      esigiUguale(tutte.dati.gruppi.estremo.length, 0, 'estremo');
      esigi(tutte.testa.etag && tutte.testa.etag !== terzo.testa.etag, 'ETag diverso per tutte');
    });

    await prova('overlay OBS: HTML escapato, trasparente, no-store, senza X-Frame-Options, CSP solo self e avatar Twitch', async () => {
      const r = await chiama(porta, 'GET', '/api/classifica/obs?difficolta=medio');
      esigiUguale(r.stato, 200, 'stato');
      esigiDentro(r.testa['content-type'], 'text/html', 'tipo');
      esigiUguale(r.testa['cache-control'], 'no-store', 'cache');
      esigiUguale(r.testa['x-frame-options'], undefined, 'X-Frame-Options');
      const csp = r.testa['content-security-policy'] || '';
      esigiDentro(csp, 'script-src \'self\'', 'csp script');
      esigiDentro(csp, 'style-src \'self\'', 'csp stili');
      esigiDentro(csp, 'img-src \'self\' https://static-cdn.jtvnw.net', 'csp avatar');
      esigi(csp.indexOf('unsafe-inline') === -1 && csp.indexOf('unsafe-eval') === -1, 'csp con unsafe');
      esigi(r.testo.indexOf('<b>la Pazza') === -1, 'il nome entra in pagina come HTML');
      esigiDentro(r.testo, 'Anna &lt;b&gt;la Pazza&lt;/b&gt;', 'nome escapato');
      esigi(!/<script>|<style|style="|\son[a-z]+=/i.test(r.testo), 'script o stili in linea');
      esigiDentro(r.testo, '<script src="/js/classifica-obs.js" defer></script>', 'script');
      esigiDentro(r.testo, 'href="/css/classifica-obs.css"', 'foglio');
      esigiUguale((r.testo.match(/<li class="obs__riga/g) || []).length, 3, 'tre righe');
      esigiDentro(r.testo, 'obs__riga obs__riga--1" data-login="bruno"', 'primo con accento');
      esigiDentro(r.testo, 'obs__riga--3', 'terzo con accento');
      esigiDentro(r.testo, 'src="' + PROFILI[202].profile_image_url + '"', 'avatar');
      esigiDentro(r.testo, 'data-api="/api/classifica?difficolta=medio&amp;n=10"', 'api');
      esigiDentro(r.testo, '<h1 class="obs__titolo" id="obs-titolo">Classifica di Pollo Run</h1>', 'titolo');
      esigi(r.testo.indexOf('<!--') === -1, 'commenti in pagina');
      const senza = await chiama(porta, 'GET', '/api/classifica/obs?difficolta=medio&titolo=0&avatar=0&righe=1');
      esigi(senza.testo.indexOf('obs__titolo') === -1, 'titolo=0');
      esigi(senza.testo.indexOf('<img') === -1 && senza.testo.indexOf('obs__avatar') === -1, 'avatar=0');
      esigiUguale((senza.testo.match(/<li class="obs__riga/g) || []).length, 1, 'righe=1');
      const tutte = await chiama(porta, 'GET', '/api/classifica/obs?difficolta=tutte');
      esigiUguale((tutte.testo.match(/<section class="obs__colonna"/g) || []).length, 4, 'quattro colonne');
      esigiDentro(tutte.testo, 'class="obs obs--tutte"', 'classe tutte');
      esigiUguale((await chiama(porta, 'GET', '/api/classifica/obs?difficolta=boh')).stato, 400, 'difficolta inventata');
      accendi(true, { difficoltaObs: 'tutte', titolo: 'Top <polli>', aggiornaSecondi: 30 });
      const dalPannello = await chiama(porta, 'GET', '/api/classifica/obs');
      esigiUguale((dalPannello.testo.match(/<section class="obs__colonna"/g) || []).length, 4, 'difficolta dal pannello');
      esigiDentro(dalPannello.testo, 'Top &lt;polli&gt;', 'titolo dal pannello escapato');
      esigiDentro(dalPannello.testo, 'data-aggiorna="30"', 'secondi dal pannello');
      accendi(true, { difficoltaObs: 'medio', titolo: 'Classifica di Pollo Run', aggiornaSecondi: 15 });
    });

    await prova('overlay OBS: dati scritti a mano nel file non possono iniettare niente', async () => {
      const dati = JSON.parse(fs.readFileSync(classifica.percorsoDati(), 'utf8'));
      dati.voci.estremo.push({ id: '999', login: 'x"><script>', nome: '"><script>alert(1)</script>', avatar: 'javascript:alert(1)', livello: 5, quando: new Date(ora).toISOString() });
      dati.voci.estremo.push({ id: '998', login: 'img', nome: 'img', avatar: 'https://static-cdn.jtvnw.net/a" onerror="alert(1).png', livello: 4, quando: new Date(ora).toISOString() });
      fs.writeFileSync(classifica.percorsoDati(), JSON.stringify(dati));
      const r = await chiama(porta, 'GET', '/api/classifica/obs?difficolta=estremo');
      esigiUguale(r.stato, 200, 'stato');
      esigi(r.testo.indexOf('<script>alert') === -1 && r.testo.indexOf('javascript:') === -1 && r.testo.indexOf('onerror') === -1, 'iniezione passata');
      esigiDentro(r.testo, '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;', 'nome escapato');
      const js = fs.readFileSync(path.join(RADICE_VERA, 'js', 'classifica-obs.js'), 'utf8');
      esigi(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'lo script dell overlay scrive HTML');
      esigiDentro(js, 'textContent', 'textContent');
      esigiDentro(js, 'If-None-Match', 'ETag nel polling');
      esigiDentro(js, 'static-cdn.jtvnw.net', 'controllo sugli avatar');
      for (const nome of ['js/classifica-obs.js', 'css/classifica-obs.css', 'server/lib/classifica.js', 'modelli/classifica-obs.html']) {
        const testo = fs.readFileSync(path.join(RADICE_VERA, nome), 'utf8');
        esigi(!/(^|[^:'"])\/\/ /m.test(testo) && testo.indexOf('/*') === -1 && testo.indexOf('<!--') === -1, nome + ' contiene commenti');
      }
      new vm.Script(js);
      const css = fs.readFileSync(path.join(RADICE_VERA, 'css', 'classifica-obs.css'), 'utf8');
      esigiDentro(css, 'background: transparent', 'sfondo trasparente');
      dati.voci.estremo = [];
      fs.writeFileSync(classifica.percorsoDati(), JSON.stringify(dati));
    });

    await prova('bloccati: spariscono dalla classifica, non giocano (403) e tornano se sbloccati', async () => {
      const r = await gestisci('/api/classifica/blocca', { id: '202', blocca: true });
      esigiUguale(r.stato, 200, 'blocca');
      esigiUguale(r.dati.bloccati.map((b) => b.id + ':' + b.login).join(), '202:bruno', 'elenco bloccati');
      esigiUguale((await pubblica('medio')).righe.map((x) => x.login).join(), 'anna,dario', 'bruno sparito');
      const p = await partita('tokenbruno000002', { livello: 1, difficolta: 'medio' });
      esigiUguale(p.stato, 403, 'partita bloccata');
      esigiUguale(p.dati.codice, 'BLOCCATO', 'codice');
      esigiUguale((await livello('tokenbruno000002', { partita: 'x.y' })).stato, 403, 'livello bloccato');
      const io = await chiama(porta, 'GET', '/api/classifica/io', { intestazioni: conToken('tokenbruno000002') });
      esigiUguale(io.dati.bloccato, true, 'io bloccato');
      esigiUguale((await gestisci('/api/classifica/blocca', { id: '202' })).stato, 400, 'senza blocca');
      esigiUguale((await gestisci('/api/classifica/blocca', { id: 'bruno', blocca: true })).stato, 400, 'id non numerico');
      esigiUguale((await gestisci('/api/classifica/blocca', { id: '202', blocca: false })).stato, 200, 'sblocca');
      esigiUguale((await pubblica('medio')).righe.map((x) => x.login).join(), 'bruno,anna,dario', 'bruno torna col suo livello');
    });

    await prova('la gestione vuole la sessione del pannello; con la sessione vede tutto', async () => {
      esigiUguale((await chiama(porta, 'GET', '/api/classifica/gestione')).stato, 401, 'gestione');
      for (const rotta of ['/api/classifica/togli', '/api/classifica/blocca', '/api/classifica/stagione']) {
        esigiUguale((await chiama(porta, 'POST', rotta, { json: { difficolta: 'medio', id: '101', blocca: true } })).stato, 401, rotta);
        esigiUguale((await chiama(porta, 'POST', rotta, { intestazioni: conToken('tokenanna0000001'), json: { id: '101', blocca: true } })).stato, 401, rotta + ' col token Twitch');
      }
      const g = await chiama(porta, 'GET', '/api/classifica/gestione', { biscotto });
      esigiUguale(g.stato, 200, 'con sessione');
      esigiUguale(g.dati.voci.medio.map((v) => v.id).join(), '202,101,404', 'voci con id');
      esigi(g.dati.stagione && g.dati.stagione.id === 's1', 'stagione');
      esigi(Array.isArray(g.dati.stagioni) && Array.isArray(g.dati.bloccati), 'stagioni e bloccati');
      esigiUguale((await gestisci('/api/classifica/togli', { difficolta: 'boh', id: '101' })).stato, 400, 'togli difficolta');
      esigiUguale((await gestisci('/api/classifica/togli', { difficolta: 'estremo', id: '101' })).stato, 404, 'togli chi non c e');
      esigiUguale((await chiama(porta, 'GET', '/api/classifica/partita')).stato, 405, 'GET partita');
      esigiUguale((await chiama(porta, 'POST', '/api/classifica', { json: {} })).stato, 405, 'POST lettura');
      esigiUguale((await chiama(porta, 'GET', '/api/classifica/inventata', { biscotto })).stato, 404, 'rotta inventata');
    });

    await prova('stagioni: la nuova archivia la vecchia senza cancellarla e si riparte dal livello 1', async () => {
      const r = await gestisci('/api/classifica/stagione', { nome: '  Autunno   2026 ' });
      esigiUguale(r.stato, 200, 'stagione');
      esigiUguale(r.dati.stagione.id, 's2', 'id');
      esigiUguale(r.dati.stagione.nome, 'Autunno 2026', 'nome');
      esigiUguale(r.dati.stagioni[0].id, 's1', 'archiviata');
      esigiUguale(r.dati.stagioni[0].voci.medio.length, 3, 'le voci vecchie restano');
      esigi(r.dati.stagioni[0].fine, 'fine della stagione');
      esigiUguale((await pubblica('medio')).righe.length, 0, 'classifica nuova vuota');
      esigiUguale((await partita('tokenanna0000001', { livello: 2, difficolta: 'medio' })).dati.serve, 1, 'si riparte dal livello 1');
      await completa('tokenanna0000001', 1, 'medio');
      esigiUguale((await pubblica('medio')).righe[0].livello, 1, 'nuova stagione');
      const dopo = await gestisci('/api/classifica/stagione', {});
      esigiUguale(dopo.dati.stagione.nome, 'Stagione 3', 'nome predefinito');
      esigiUguale(dopo.dati.stagioni.map((s) => s.id).join(), 's2,s1', 'archivio dal piu recente');
    });

    await prova('limite di frequenza per utente: oltre il massimo 429', async () => {
      const prima = classifica.LIMITI.partitaUtente.max;
      classifica.LIMITI.partitaUtente.max = 2;
      try {
        classifica.dimentica();
        esigiUguale((await partita('tokendario000004', { livello: 1, difficolta: 'estremo' })).stato, 200, 'prima');
        esigiUguale((await partita('tokendario000004', { livello: 1, difficolta: 'estremo' })).stato, 200, 'seconda');
        const r = await partita('tokendario000004', { livello: 1, difficolta: 'estremo' });
        esigiUguale(r.stato, 429, 'terza');
        esigiUguale(r.dati.codice, 'TROPPE_RICHIESTE', 'codice');
        esigiUguale((await partita('tokenanna0000001', { livello: 1, difficolta: 'estremo' })).stato, 200, 'un altro utente gioca');
        ora += 11 * 60 * 1000;
        esigiUguale((await partita('tokendario000004', { livello: 1, difficolta: 'estremo' })).stato, 200, 'passata la finestra');
      } finally {
        classifica.LIMITI.partitaUtente.max = prima;
        classifica.dimentica();
      }
    });

    await prova('i dati stanno nella cartella privata: classifica.json e la chiave col punto, mai dal browser', async () => {
      const dati = classifica.percorsoDati();
      const chiave = classifica.percorsoChiave();
      esigiUguale(path.dirname(dati), percorsi.P.dati, 'cartella dei dati');
      esigiUguale(path.basename(chiave).charAt(0), '.', 'la chiave comincia col punto');
      esigi(fs.existsSync(dati) && fs.existsSync(chiave), 'file assenti');
      esigi(/^[0-9a-f]{64}\n$/.test(fs.readFileSync(chiave, 'utf8')), 'chiave');
      esigi(statico.riservato(dati) && statico.riservato(chiave), 'raggiungibili dal browser');
      const letto = JSON.parse(fs.readFileSync(dati, 'utf8'));
      esigi(letto.versione > 0 && letto.stagione.id === 's3', 'contenuto');
      esigi(!fs.readdirSync(percorsi.P.dati).some((n) => n.endsWith('.tmp')), 'restano file temporanei');
    });

    await prova('data-classifica nelle pagine generate: sul gioco del sito solo se accesa, sul canvas della manutenzione 1 o 0', () => {
      const documento = (attiva) => {
        const d = archivio.leggi();
        d.config.classifica = Object.assign({}, d.config.classifica, { attiva: attiva });
        return d;
      };
      const tagGioco = (html) => { const m = /<script src="js\/pollorun\.js"[^>]*>/.exec(html || ''); return m ? m[0] : ''; };
      const acceso = costruisci.rendi(documento(true));
      esigiDentro(tagGioco(acceso.html), 'data-classifica="1"', 'home accesa');
      for (const nome of ['clip', 'giochi', 'sponsor']) {
        if (typeof acceso[nome] === 'string' && tagGioco(acceso[nome])) { esigiDentro(tagGioco(acceso[nome]), 'data-classifica="1"', nome + ' accesa'); }
      }
      const spento = costruisci.rendi(documento(false));
      esigi(tagGioco(spento.html), 'lo script del gioco sparisce');
      esigiUguale(spento.html.indexOf('data-classifica'), -1, 'home spenta');
      for (const [attiva, atteso] of [[true, '1'], [false, '0']]) {
        const mnt = documento(attiva);
        mnt.config.manutenzione = Object.assign({}, mnt.config.manutenzione, { attiva: true, fine: '' });
        const pagina = costruisci.rendi(mnt, { adesso: Date.UTC(2026, 8, 27, 9, 0, 0) }).manutenzione;
        const tela = /<canvas[^>]*id="mnt-gioco"[^>]*data-classifica="([^"]*)"/.exec(pagina || '');
        esigi(tela, 'il canvas non ha data-classifica');
        esigiUguale(tela[1], atteso, 'manutenzione ' + attiva);
        esigiDentro(pagina, 'img-src \'self\' data: https://static-cdn.jtvnw.net', 'CSP della manutenzione con gli avatar');
      }
    });
  } finally {
    await new Promise((risolvi) => server.close(risolvi));
    fs.writeFileSync(percorsi.P.contenutiJson, originale);
    classifica.sostituisciOrologio(null);
    classifica.sostituisciProfilo(null);
    classifica.dimentica();
    sondaggi.sostituisciVerifica(null);
    auth.azzeraTutto();
  }
}

async function proveManutenzione(contenutiVeri, costruisci, archivio) {
  apriSezione('11b. Modalita manutenzione');

  await prova('gli script del sito e della manutenzione si compilano', async () => {
    for (const file of [path.join(RADICE_VERA, 'modelli', 'manutenzione-conto.js'), path.join(RADICE_VERA, 'js', 'guardia.js')]) {
      try { new Function(fs.readFileSync(file, 'utf8')); }
      catch (errore) { throw new Error(path.basename(file) + ': ' + errore.message); }
    }
  });

  await prova('la guardia avvisa la pagina prima di ricaricarla, e il lurk si ferma', async () => {
    const guardia = fs.readFileSync(path.join(RADICE_VERA, 'js', 'guardia.js'), 'utf8');
    const lurk = fs.readFileSync(path.join(RADICE_VERA, 'js', 'lurk.js'), 'utf8');

    esigiDentro(guardia, "'sb:manutenzione'", 'la guardia annuncia la manutenzione');
    const doveAnnuncia = guardia.indexOf('annuncia(timbro)');
    const doveFrena = guardia.indexOf('if (giaRicaricato(timbro))');
    const doveRicarica = guardia.indexOf('location.reload()');
    esigi(doveAnnuncia > 0 && doveFrena > doveAnnuncia, 'l annuncio arriva dopo il freno anti-ricarica');
    esigi(doveRicarica > doveAnnuncia, 'la pagina si ricarica prima di annunciare');

    esigiDentro(guardia, 'var OGNI = 20000;', 'ogni quanto guarda lo stato');

    esigiDentro(lurk, "document.addEventListener('sb:manutenzione'", 'il lurk ascolta la guardia');
    esigiDentro(lurk, 'function chiudiPerManutenzione()', 'lo spegnimento per manutenzione');
    esigiDentro(lurk, 'if (inManutenzione) { return false; }', 'il freno dentro bAttivo');
    esigiDentro(lurk, "const CHIAVE_SOSPESO = 'sb-lurk-sospeso';", 'il biglietto della sospensione');
    esigiDentro(lurk, 'function tentaRipresa()', 'la ripresa dopo la manutenzione');
    esigiDentro(lurk, "if (inManutenzione) { avviso(testo('manutenzione')); return; }",
      'il freno dentro accendi: nemmeno un clic la riaccende mentre il sito chiude');
    esigiDentro(lurk, 'dimenticaRipresa();', 'chi spegne a mano perde il biglietto della ripresa');
    esigi(lurk.indexOf('function spegni() {') >= 0 &&
      lurk.indexOf('dimenticaRipresa();', lurk.indexOf('function spegni() {')) <
      lurk.indexOf('fermaSentinella();', lurk.indexOf('function spegni() {')),
      'spegni() dimentica la ripresa per prima cosa');

    esigiDentro(lurk, 'function inSessione(chiave, valore)', 'gli helper di sessione');
    esigi(lurk.indexOf('inLocale(CHIAVE_SOSPESO') === -1, 'il biglietto finisce in localStorage');
  });

  await prova('la guardia montata su un DOM finto: annuncia, poi ricarica; e annuncia anche quando non ricarichera piu', async () => {
    const codice = fs.readFileSync(path.join(RADICE_VERA, 'js', 'guardia.js'), 'utf8');

    const monta = (memoriaIniziale) => {
      const banco = { eventi: [], ricariche: 0, ascoltatori: {}, memoria: Object.assign({}, memoriaIniziale) };
      const stato = { manutenzione: true, pubblicatoIl: 'TIMBRO-1' };
      const fetchFinto = () => Promise.resolve({ ok: true, json: () => Promise.resolve(stato) });
      const doc = {
        querySelector: () => null,
        addEventListener: (nome, fn) => { banco.ascoltatori[nome] = fn; },
        dispatchEvent: (evento) => { banco.eventi.push(evento); return true; },
        hidden: false
      };
      const win = { fetch: fetchFinto, addEventListener: (nome, fn) => { banco.ascoltatori[nome] = fn; } };
      const loc = { pathname: '/', reload: () => { banco.ricariche++; } };
      const ses = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(banco.memoria, k) ? banco.memoria[k] : null),
        setItem: (k, v) => { banco.memoria[k] = String(v); }
      };
      const Evento = function (tipo, opzioni) { this.type = tipo; this.detail = opzioni && opzioni.detail; };
      const avvia = new Function('window', 'document', 'location', 'sessionStorage',
        'CustomEvent', 'fetch', 'setInterval', codice);
      avvia(win, doc, loc, ses, Evento, fetchFinto, () => 1);
      return banco;
    };
    const respira = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };

    const prima = monta({});
    prima.ascoltatori.pageshow();
    await respira();
    esigiUguale(prima.eventi.length, 1, 'eventi annunciati');
    esigiUguale(prima.eventi[0].type, 'sb:manutenzione', 'nome dell evento');
    esigiUguale(prima.eventi[0].detail.attiva, true, 'detail.attiva');
    esigiUguale(prima.eventi[0].detail.pubblicatoIl, 'TIMBRO-1', 'detail.pubblicatoIl');
    esigiUguale(prima.ricariche, 1, 'ricariche');

    prima.ascoltatori.pageshow();
    await respira();
    esigiUguale(prima.eventi.length, 1, 'l annuncio si e ripetuto');

    const dopo = monta({ 'sb-guardia-ricaricato': 'TIMBRO-1' });
    dopo.ascoltatori.pageshow();
    await respira();
    esigiUguale(dopo.ricariche, 0, 'ha ricaricato di nuovo con lo stesso timbro');
    esigiUguale(dopo.eventi.length, 1, 'non ha annunciato la manutenzione');
    esigiUguale(dopo.eventi[0].detail.attiva, true, 'detail.attiva');
  });

  await prova('la guardia montata su un DOM finto: annuncia, poi ricarica; e annuncia anche quando non ricarichera piu', async () => {
    const codice = fs.readFileSync(path.join(RADICE_VERA, 'js', 'guardia.js'), 'utf8');

    const monta = (memoriaIniziale) => {
      const banco = { eventi: [], ricariche: 0, ascoltatori: {}, memoria: Object.assign({}, memoriaIniziale) };
      const stato = { manutenzione: true, pubblicatoIl: 'TIMBRO-1' };
      const fetchFinto = () => Promise.resolve({ ok: true, json: () => Promise.resolve(stato) });
      const doc = {
        querySelector: () => null,
        addEventListener: (nome, fn) => { banco.ascoltatori[nome] = fn; },
        dispatchEvent: (evento) => { banco.eventi.push(evento); return true; },
        hidden: false
      };
      const win = { fetch: fetchFinto, addEventListener: (nome, fn) => { banco.ascoltatori[nome] = fn; } };
      const loc = { pathname: '/', reload: () => { banco.ricariche++; } };
      const ses = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(banco.memoria, k) ? banco.memoria[k] : null),
        setItem: (k, v) => { banco.memoria[k] = String(v); }
      };
      const Evento = function (tipo, opzioni) { this.type = tipo; this.detail = opzioni && opzioni.detail; };
      const avvia = new Function('window', 'document', 'location', 'sessionStorage',
        'CustomEvent', 'fetch', 'setInterval', codice);
      avvia(win, doc, loc, ses, Evento, fetchFinto, () => 1);
      return banco;
    };
    const respira = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };

    const prima = monta({});
    prima.ascoltatori.pageshow();
    await respira();
    esigiUguale(prima.eventi.length, 1, 'eventi annunciati');
    esigiUguale(prima.eventi[0].type, 'sb:manutenzione', 'nome dell evento');
    esigiUguale(prima.eventi[0].detail.attiva, true, 'detail.attiva');
    esigiUguale(prima.eventi[0].detail.pubblicatoIl, 'TIMBRO-1', 'detail.pubblicatoIl');
    esigiUguale(prima.ricariche, 1, 'ricariche');

    prima.ascoltatori.pageshow();
    await respira();
    esigiUguale(prima.eventi.length, 1, 'l annuncio si e ripetuto');

    const dopo = monta({ 'sb-guardia-ricaricato': 'TIMBRO-1' });
    dopo.ascoltatori.pageshow();
    await respira();
    esigiUguale(dopo.ricariche, 0, 'ha ricaricato di nuovo con lo stesso timbro');
    esigiUguale(dopo.eventi.length, 1, 'non ha annunciato la manutenzione');
    esigiUguale(dopo.eventi[0].detail.attiva, true, 'detail.attiva');
  });

  await prova('la musica d attesa: file fisso, in loop, volume basso regolabile, bottone per fermarla', async () => {
    const modello = fs.readFileSync(P.modelloManutenzione, 'utf8');
    esigiDentro(modello, 'src="mp3/ElevatorMaintenance.mp3" loop', 'audio');
    esigiDentro(modello, 'id="mnt-musica"', 'bottone');
    const script = fs.readFileSync(P.scriptManutenzione, 'utf8');
    esigiDentro(script, 'audio: audio, base: 20', 'volume');
    esigiDentro(script, 'audio: brano, base: 30', 'volume del gioco');
    esigiDentro(script, 'sb-manutenzione-volumi', 'volumi ricordati');
    esigiDentro(modello, 'id="mnt-vol-attesa"', 'cursore della musica d attesa');
    esigiDentro(modello, 'id="mnt-vol-gioco"', 'cursore della canzone del gioco');
    esigiDentro(script, "addEventListener('pointerdown'", 'partenza al primo gesto');
  });

  const backup = require('./lib/backup');
  const originale = fs.readFileSync(P.contenutiJson, 'utf8');
  const ADESSO = Date.UTC(2026, 8, 23, 9, 0, 0);
  const SEGNO = '<meta name="sb-pagina" content="manutenzione">';
  const CHIAVI_TESTI = ['manutenzione.stato', 'manutenzione.occhiello', 'manutenzione.messaggio',
    'manutenzione.contoPrima', 'manutenzione.contoFinito', 'manutenzione.bottone'];

  const conClip = (documento) => {
    const voce = { id: 'm1', titolo: 'Una clip', url: 'https://clips.twitch.tv/m1',
      anteprima: 'https://clips-media-assets2.twitch.tv/m1-preview-480x272.jpg',
      durataSec: 30, visualizzazioni: 10, creataIl: '2026-09-01T20:00:00Z', autore: 'Qualcuno' };
    documento.config.clip = Object.assign({}, documento.config.clip, { attivo: true, voci: [voce], archivio: [voce] });
    return documento;
  };
  const senzaChiavi = (documento) => {
    delete documento.config.manutenzione;
    for (const chiave of CHIAVI_TESTI) { delete documento.testi[chiave]; }
    return documento;
  };
  const documento = (ritocco) => {
    const d = conClip(JSON.parse(JSON.stringify(contenutiVeri)));
    if (ritocco) { ritocco(d); }
    return d;
  };
  const accesa = (aggiunte) => (d) => {
    d.config.manutenzione = Object.assign({ attiva: true, fine: '' }, aggiunte || {});
  };
  const pagina = (ritocco) => costruisci.rendi(documento(ritocco), { adesso: ADESSO }).manutenzione;
  const scriptDi = (html) => {
    const trovato = /<script>([\s\S]*?)<\/script>/.exec(html);
    return trovato ? trovato[1] : null;
  };
  const scriptSrcDi = (html) => {
    const trovato = /<meta http-equiv="Content-Security-Policy" content="[\s\S]*?script-src ([^;]*);/.exec(html);
    return trovato ? trovato[1] : '';
  };
  const scrivi = (d) => { fs.writeFileSync(P.contenutiJson, JSON.stringify(d, null, 2) + '\n', 'utf8'); };
  const statoSito = () => JSON.parse(fs.readFileSync(P.statoSito, 'utf8'));

  try {
    await prova('ogni campo del gruppo manutenzione ha un predefinito', () => {
      const gruppo = schema.gruppi.find((g) => g.id === 'manutenzione');
      esigi(gruppo, 'manca il gruppo manutenzione');
      esigiUguale(gruppo.titolo, 'Modalità manutenzione', 'titolo del gruppo');
      for (const campo of gruppo.campi) {
        esigi(Object.prototype.hasOwnProperty.call(campo, 'predefinito'), campo.chiave + ' senza predefinito');
      }
      esigiUguale(schema.campo('config.manutenzione.attiva').predefinito, false, 'interruttore spento di partenza');
      esigiUguale(schema.campo('config.manutenzione.fine').tipo, 'dataora', 'tipo della fine');
    });

    await prova('a interruttore spento le pagine sono identiche byte per byte a quelle senza le chiavi nuove', () => {
      const opzioni = { adesso: ADESSO, quando: '2026-09-23T09:00:00.000Z' };
      const senza = costruisci.rendi(documento(senzaChiavi), opzioni);
      esigi(senza.clip, 'la pagina delle clip di prova non si e resa');
      const varianti = [
        accesa({ attiva: false }),
        accesa({ attiva: false, fine: '2026-09-24T13:30', nastro: ['Altro'] }),
        (d) => { accesa({ attiva: false })(d); d.testi['manutenzione.stato'] = 'Diverso'; }
      ];
      for (const ritocco of varianti) {
        const con = costruisci.rendi(documento(ritocco), opzioni);
        esigiUguale(con.html, senza.html, 'index.html');
        esigiUguale(con.clip, senza.clip, 'clip.html');
        esigiUguale(con.dati, senza.dati, 'js/dati.js');
        esigiUguale(con.tema, senza.tema, 'css/tema.css');
        esigiUguale(con.manutenzione, null, 'pagina di manutenzione resa a interruttore spento');
      }
    });

    await prova('l anteprima dell editor mostra il sito vero anche in manutenzione', () => {
      const togliIstanti = (html) => html.replace(/20\d\d-\d\d-\d\dT[\d:.]+Z/g, '');
      const spenta = costruisci.anteprimaEditor(documento(accesa({ attiva: false })));
      const conManutenzione = costruisci.anteprimaEditor(documento(accesa({ fine: '2026-09-24T13:30' })));
      esigi(conManutenzione.indexOf(SEGNO) === -1, 'l anteprima dell editor e diventata la pagina di manutenzione');
      esigiUguale(togliIstanti(conManutenzione), togliIstanti(spenta), 'anteprima dell editor');
      esigi(costruisci.anteprimaDi(documento(accesa())).indexOf(SEGNO) === -1, 'anteprimaDi mostra la manutenzione');
    });

    await prova('il testo dello spegnimento per manutenzione arriva fino a window.DATI', () => {
    const reso = costruisci.rendi(documento(), { adesso: ADESSO });
    const dati = JSON.parse(reso.dati.slice(reso.dati.indexOf('{'), reso.dati.lastIndexOf('}') + 1));
    esigiUguale(dati.lurk.testi.manutenzione,
      contenutiVeri.testi['lurk.manutenzione'], 'lurk.testi.manutenzione');
    esigi(dati.lurk.testi.manutenzione, 'il testo e vuoto');
  });

  await prova('contenuti vecchi senza le chiavi nuove si pubblicano lo stesso', () => {
      scrivi(senzaChiavi(JSON.parse(originale)));
      esigiUguale(schema.verificaCopertura(JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8'))).length, 0, 'copertura');
      const letto = archivio.leggi();
      esigiUguale(letto.config.manutenzione.attiva, false, 'predefinito dell interruttore');
      esigiUguale(letto.config.manutenzione.fine, '', 'predefinito della fine');
      esigiUguale(letto.testi['manutenzione.bottone'], 'Guarda su Twitch', 'predefinito del bottone');
      const esito = costruisci.genera();
      esigiUguale(esito.manutenzione.attiva, false, 'esito.manutenzione');
      esigi(fs.readFileSync(P.indexHtml, 'utf8').indexOf(SEGNO) === -1, 'index.html e la pagina di manutenzione');
      esigiUguale(costruisci.inManutenzione(), false, 'inManutenzione');
      esigiUguale(statoSito().manutenzione, false, 'stato-sito.json a manutenzione spenta');
    });

    await prova('le pagine vere caricano la guardia che ascolta stato-sito.json', () => {
      const reso = costruisci.rendi(documento(), { adesso: ADESSO });
      esigiDentro(reso.html, '<script src="js/guardia.js" defer></script>', 'guardia in index.html');
      esigi(reso.clip, 'la pagina delle clip non e stata resa');
      esigiDentro(reso.clip, '<script src="js/guardia.js" defer></script>', 'guardia in clip.html');
      const guardia = fs.readFileSync(path.join(RADICE_VERA, 'js', 'guardia.js'), 'utf8');
      esigiDentro(guardia, '\'stato-sito.json\'', 'la guardia legge stato-sito.json');
      esigiDentro(guardia, 'cache: \'no-store\'', 'la guardia salta la cache');
      esigiDentro(guardia, 'stato.manutenzione !== true', 'la guardia ricarica solo a manutenzione accesa');
      esigiDentro(guardia, 'content="manutenzione"', 'la guardia si spegne nella pagina di manutenzione');
    });

    await prova('accesa, OGNI pagina pubblica diventa la pagina di manutenzione e niente di vivo parte', () => {
      const d = JSON.parse(originale);
      d.config.manutenzione = { attiva: true, fine: '2026-09-24T13:30' };
      d.config.clip = Object.assign({}, d.config.clip, { attivo: false });
      scrivi(d);
      const esito = costruisci.genera();
      esigiUguale(esito.manutenzione.attiva, true, 'esito.manutenzione.attiva');
      esigiUguale(esito.manutenzione.pagine.join(','), 'index.html,clip.html,sponsor.html,giochi.html', 'pagine coperte');
      esigiUguale(esito.scritti.map((s) => s.file).join(', '), 'index.html, js/dati.js, css/tema.css', 'scritti');
      const home = fs.readFileSync(P.indexHtml, 'utf8');
      const clip = fs.readFileSync(P.clipHtml, 'utf8');
      esigiUguale(clip, home, 'clip.html diversa dalla home in manutenzione');
      esigiDentro(home, SEGNO, 'segno della pagina di manutenzione');
      esigi(!/<script\b[^>]*\bsrc\s*=/i.test(home), 'la pagina carica uno script esterno');
      for (const vietato of ['player.js', 'lurk', 'pollo.js', 'musica.js', 'sondaggio.js', 'embed.twitch.tv', 'irc-ws', 'js/dati.js', 'js/sito.js']) {
        esigi(home.indexOf(vietato) === -1, 'la pagina di manutenzione contiene ' + vietato);
      }
      esigiUguale((home.match(/<script\b/gi) || []).length, 1, 'script in pagina');
      esigiDentro(home, 'href="css/tema.css"', 'foglio del tema');
      esigiDentro(home, 'href="css/tokens.css"', 'foglio dei token');
      esigi(fs.existsSync(P.datiJs) && fs.existsSync(P.temaCss), 'js/dati.js o css/tema.css non scritti');
      esigiUguale(fs.readFileSync(P.temaCss, 'utf8'), tema.css(archivio.leggi().config.tema), 'css/tema.css');
      esigiUguale(costruisci.inManutenzione(), true, 'inManutenzione');
      const stato = statoSito();
      esigiUguale(stato.manutenzione, true, 'stato-sito.json a manutenzione accesa');
      esigiUguale(stato.pubblicatoIl, esito.aggiornatoIl, 'pubblicatoIl');
      esigiUguale(Object.keys(stato).join(','), 'manutenzione,pubblicatoIl', 'chiavi di stato-sito.json');
      esigiUguale(esito.statoSito.manutenzione, true, 'esito.statoSito');
      esigi(!esito.statoSito.errore, 'stato-sito.json non scritto');
    });

    await prova('spenta di nuovo, tornano le pagine vere e clip.html sparisce se le clip sono spente', () => {
      const d = JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8'));
      d.config.manutenzione.attiva = false;
      scrivi(d);
      const esito = costruisci.genera();
      esigiUguale(esito.manutenzione.attiva, false, 'esito.manutenzione.attiva');
      esigi(fs.readFileSync(P.indexHtml, 'utf8').indexOf(SEGNO) === -1, 'index.html e ancora la pagina di manutenzione');
      esigiUguale(esito.paginaClip.stato, 'tolta', 'clip.html');
      esigi(!fs.existsSync(P.clipHtml), 'clip.html e rimasta');
      esigiUguale(statoSito().manutenzione, false, 'stato-sito.json dopo lo spegnimento');
      esigiUguale(statoSito().pubblicatoIl, esito.aggiornatoIl, 'pubblicatoIl');
    });

    await prova('il conto alla rovescia porta l istante con lo scarto giusto di Roma', () => {
      const domani = pagina(accesa({ fine: '2026-09-24T13:30' }));
      esigiDentro(domani, 'data-fine="2026-09-24T13:30:00+02:00"', 'ora legale');
      esigiDentro(domani, 'Si riparte il 24/09 alle 13:30 · mancano', 'etichetta di un altro giorno');
      esigiDentro(pagina(accesa({ fine: '2026-09-23T13:30' })), 'Si riparte alle 13:30 · mancano', 'etichetta di oggi');
      esigiDentro(pagina(accesa({ fine: '2026-12-01T09:05' })), 'data-fine="2026-12-01T09:05:00+01:00"', 'ora solare');
      esigiDentro(pagina(accesa({ fine: '2027-01-02T10:00' })), 'Si riparte il 02/01/2027 alle 10:00 · mancano', 'un altro anno');
      esigiUguale(Date.parse('2026-09-24T13:30:00+02:00'), Date.UTC(2026, 8, 24, 11, 30), 'istante');
      esigiUguale(costruisci.fineManutenzione('2026-03-29T02:30').iso, '2026-03-29T03:30:00+02:00', 'ora saltata');
      esigiUguale(costruisci.fineManutenzione('2026-10-25T02:30').iso, '2026-10-25T02:30:00+02:00', 'ora doppia');
    });

    await prova('senza fine niente conto alla rovescia, ma lo script che ascolta lo stato c e', () => {
      const html = pagina(accesa({ fine: '' }));
      esigi(html.indexOf('id="mnt-conto"') === -1, 'il riquadro del conto c e lo stesso');
      esigiUguale((html.match(/<script\b/gi) || []).length, 1, 'script in pagina');
      const script = scriptDi(html);
      esigi(script, 'manca lo script della pagina');
      const impronta = 'sha256-' + crypto.createHash('sha256').update(script, 'utf8').digest('base64');
      esigiUguale(scriptSrcDi(html), '\'' + impronta + '\'', 'script-src');
      esigiDentro(script, '\'stato-sito.json?t=\'', 'lo script legge stato-sito.json');
      esigiDentro(script, 'stato.manutenzione !== false', 'lo script ricarica solo a manutenzione spenta');
      esigi(script.indexOf('location.reload()') === script.lastIndexOf('location.reload()'), 'piu di una ricarica nello script');
      esigiDentro(html, 'Stiamo sistemando la regia', 'il resto della pagina');
    });

    await prova('la CSP porta l impronta sha256 dello script in pagina', () => {
      const html = pagina(accesa({ fine: '2026-09-24T13:30' }));
      const script = scriptDi(html);
      esigi(script, 'manca lo script del conto alla rovescia');
      const impronta = 'sha256-' + crypto.createHash('sha256').update(script, 'utf8').digest('base64');
      esigiUguale(scriptSrcDi(html), '\'' + impronta + '\'', 'script-src');
      esigiDentro(script, 'data-finito', 'lo script legge la scritta finale dalla pagina');
      esigiDentro(script, 'stato-sito.json', 'lo script legge anche lo stato del sito');
      esigi(/<meta http-equiv="Content-Security-Policy" content="[\s\S]*?connect-src 'self';/.test(html), 'connect-src');
    });

    await prova('i testi predefiniti sono quelli della pagina approvata', () => {
      const html = pagina((d) => { senzaChiavi(d); accesa({ fine: '2026-09-24T13:30' })(d); });
      esigiDentro(html, '<span class="spia" aria-hidden="true"></span> Fuori onda · Manutenzione</p>', 'pillola');
      esigiDentro(html, '<p class="sezione__occhiello">Stiamo sistemando la regia</p>', 'occhiello');
      esigiDentro(html, 'Il sito è in manutenzione e <strong>torna presto</strong>, più bello di prima.', 'messaggio');
      esigiDentro(html, 'data-finito="Ci siamo: riaccendiamo la regia…"', 'scritta finale');
      esigiDentro(html, '\n      Guarda su Twitch\n', 'bottone');
      esigiDentro(html, '<span>&nbsp;★ Lavori in corso &nbsp;·&nbsp; La regia si sta rifacendo il look &nbsp;·&nbsp; ' +
        'Torniamo presto &nbsp;·&nbsp; Intanto: twitch.tv/slayer_beard &nbsp;·&nbsp; Il pollo sorveglia il cantiere &nbsp;</span>', 'nastro');
      esigiDentro(html, '<title>slayer_beard — Sito in manutenzione</title>', 'titolo');
      esigiDentro(html, 'href="https://www.twitch.tv/slayer_beard"', 'link a Twitch');
    });

    await prova('i testi scritti nel pannello finiscono in pagina, protetti', () => {
      const html = pagina((d) => {
        accesa({ fine: '2026-09-24T13:30', nastro: ['Prima <b>frase</b>', 'Seconda & ultima'] })(d);
        d.testi['manutenzione.stato'] = 'Pausa <i>tecnica</i> & co';
        d.testi['manutenzione.occhiello'] = 'Lavori "grossi"';
        d.testi['manutenzione.messaggio'] = 'Torno <em>presto</em><script>alert(1)</script>';
        d.testi['manutenzione.contoPrima'] = 'Riapriamo';
        d.testi['manutenzione.contoFinito'] = 'Fatto "quasi" <ok>';
        d.testi['manutenzione.bottone'] = 'Vieni in <live>';
      });
      esigiDentro(html, '</span> Pausa &lt;i&gt;tecnica&lt;/i&gt; &amp; co</p>', 'pillola');
      esigiDentro(html, '>Lavori &quot;grossi&quot;</p>', 'occhiello');
      esigiDentro(html, '<p class="mnt__testo">Torno <em>presto</em>', 'messaggio ricco');
      esigiUguale((html.match(/<script\b/gi) || []).length, 1, 'script in pagina');
      esigiDentro(html, 'Riapriamo il 24/09 alle 13:30 · mancano', 'etichetta del conto');
      esigiDentro(html, 'data-finito="Fatto &quot;quasi&quot; &lt;ok&gt;"', 'scritta finale');
      esigiDentro(html, 'Vieni in &lt;live&gt;', 'bottone');
      esigiDentro(html, '&nbsp;★ Prima &lt;b&gt;frase&lt;/b&gt; &nbsp;·&nbsp; Seconda &amp; ultima &nbsp;', 'nastro');
    });

    await prova('le frasi di scherno di Pollo Run arrivano al gioco come JSON protetto', () => {
      const lunga = 'x'.repeat(100);
      const scritte = pagina(accesa({ scherno: ['Ti senti "forte"? <b>', '  ', 'L\'oro & basta', lunga] }));
      esigiDentro(scritte, 'data-frasi="[&quot;Ti senti \\&quot;forte\\&quot;? &lt;b&gt;&quot;,&quot;L&#39;oro &amp; basta&quot;,&quot;' +
        'x'.repeat(80) + '&quot;]"', 'frasi scritte nel pannello');
      const vuote = pagina(accesa({ scherno: [] }));
      const trovato = /data-frasi="([^"]*)"/.exec(vuote);
      esigi(trovato, 'manca data-frasi');
      const lette = JSON.parse(trovato[1].replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&'));
      esigiUguale(JSON.stringify(lette), JSON.stringify(schema.campo('config.manutenzione.scherno').predefinito), 'frasi predefinite');
      esigiDentro(lette[0], 'coglione d\'oro', 'prima frase predefinita');
    });

    await prova('i social vengono da config.social, senza Twitch e senza le voci vuote', () => {
      const d = documento((x) => {
        accesa()(x);
        for (const voce of x.config.social) {
          if (voce.chiave === 'youtube') { voce.url = 'https://www.youtube.com/@prova'; }
          if (voce.chiave === 'telegram') { voce.url = ''; }
        }
      });
      const html = costruisci.rendi(d, { adesso: ADESSO }).manutenzione;
      const blocco = html.slice(html.indexOf('<ul class="mnt__social">'), html.indexOf('</ul>'));
      esigiDentro(blocco, 'href="https://www.youtube.com/@prova"', 'youtube');
      esigiDentro(blocco, 'aria-label="YouTube"', 'nome della voce');
      esigi(blocco.indexOf('twitch.tv') === -1, 'Twitch sta anche fra i social');
      esigi(blocco.indexOf('Telegram') === -1, 'una voce senza link e in pagina');
      const attese = d.config.social.filter((v) => String(v.url || '').trim() && v.icona !== 'twitch').length;
      esigiUguale((blocco.match(/<li>/g) || []).length, attese, 'voci');
    });

    await prova('la convalida rifiuta una fine scritta male e accetta quella buona o vuota', () => {
      for (const storta of ['2026-02-30T10:00', '24/09/2026 13:30', '2026-09-24T25:00', '2026-09-24 13:30', '2026-09-24T13:30:00', 5]) {
        esigi(convalida.convalidaCampo('config.manutenzione.fine', storta).length > 0, 'accettata: ' + JSON.stringify(storta));
      }
      for (const buona of ['', '2026-09-24T13:30', '2028-02-29T00:00']) {
        esigiUguale(convalida.convalidaCampo('config.manutenzione.fine', buona).length, 0, 'rifiutata: ' + buona);
      }
      esigi(convalida.convalidaCampo('config.manutenzione.attiva', 'true').length > 0, 'l interruttore accetta una stringa');
      const d = JSON.parse(originale);
      d.config.manutenzione = { attiva: true, fine: '2026-13-01T10:00' };
      esigi(convalida.convalida(d).some((e) => e.chiave === 'config.manutenzione.fine'), 'la convalida intera non la vede');
    });

    await prova('un ripristino riallinea clip.html alla home ripristinata', () => {
      const d = JSON.parse(originale);
      d.config.manutenzione = { attiva: false, fine: '' };
      d.config.clip = Object.assign({}, d.config.clip, { attivo: false });
      scrivi(d);
      costruisci.genera();
      d.config.manutenzione.attiva = true;
      scrivi(d);
      const conHomeVera = costruisci.genera().backup;
      const conHomeInManutenzione = costruisci.genera().backup;
      d.config.manutenzione.attiva = false;
      scrivi(d);
      costruisci.genera();
      esigi(!fs.existsSync(P.clipHtml), 'clip.html rimasta a manutenzione spenta');

      backup.ripristina(conHomeInManutenzione);
      const home = fs.readFileSync(P.indexHtml, 'utf8');
      esigiDentro(home, SEGNO, 'la home ripristinata non e in manutenzione');
      esigiUguale((costruisci.allineaClipDopoRipristino() || {}).stato, 'scritta', 'clip.html riscritta');
      esigiUguale(fs.readFileSync(P.clipHtml, 'utf8'), home, 'clip.html diversa dalla home in manutenzione');
      esigiUguale(costruisci.allineaStatoDopoRipristino().manutenzione, true, 'stato dopo il ripristino in manutenzione');
      esigiUguale(statoSito().manutenzione, true, 'stato-sito.json dopo il ripristino in manutenzione');

      backup.ripristina(conHomeVera);
      esigi(fs.readFileSync(P.indexHtml, 'utf8').indexOf(SEGNO) === -1, 'index.html non ripristinata');
      esigiUguale(costruisci.allineaStatoDopoRipristino().manutenzione, false, 'stato dopo il ripristino vero');
      esigiUguale(statoSito().manutenzione, false, 'stato-sito.json dopo il ripristino vero');
      esigiUguale((costruisci.allineaClipDopoRipristino() || {}).stato, 'tolta', 'clip.html di manutenzione tolta');
      esigi(!fs.existsSync(P.clipHtml), 'clip.html di manutenzione rimasta online');
      esigiUguale(costruisci.allineaClipDopoRipristino(), null, 'senza manutenzione di mezzo non si tocca niente');
    });

    await prova('le API: anteprima della manutenzione dietro sessione, stato e pubblicazione', async () => {
      const { creaServer } = require('./server.js');
      const server = creaServer();
      await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
      const porta = server.address().port;
      try {
        esigiUguale((await chiama(porta, 'GET', '/api/anteprima/manutenzione')).stato, 401, 'senza sessione');
        const biscotto = biscottoDa(await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } }));
        esigi(biscotto, 'nessuna sessione');
        const d = JSON.parse(originale);
        d.config.manutenzione = { attiva: false, fine: '2026-09-24T13:30' };
        scrivi(d);
        const vista = await chiama(porta, 'GET', '/api/anteprima/manutenzione', { biscotto: biscotto });
        esigiUguale(vista.stato, 200, 'stato');
        esigiDentro(vista.testo, '<head><base href="/">', 'base per gli indirizzi relativi');
        esigiDentro(vista.testo, SEGNO, 'la pagina di manutenzione anche a interruttore spento');
        esigiDentro(vista.testo, 'data-fine="2026-09-24T13:30:00+02:00"', 'conto alla rovescia');
        esigiUguale((await chiama(porta, 'POST', '/api/anteprima/manutenzione', { biscotto: biscotto })).stato, 405, 'metodo');

        let letti = await chiama(porta, 'GET', '/api/contenuti', { biscotto: biscotto });
        esigiUguale(letti.dati.stato.manutenzione, false, 'stato.manutenzione prima');
        d.config.manutenzione.attiva = true;
        scrivi(d);
        const pubblicata = await chiama(porta, 'POST', '/api/pubblica', { biscotto: biscotto });
        esigiUguale(pubblicata.stato, 200, 'pubblicazione');
        esigiUguale(pubblicata.dati.manutenzione.attiva, true, 'la risposta non dice della manutenzione');
        letti = await chiama(porta, 'GET', '/api/contenuti', { biscotto: biscotto });
        esigiUguale(letti.dati.stato.manutenzione, true, 'stato.manutenzione dopo');
        const pubblico = await chiama(porta, 'GET', '/stato-sito.json?t=1');
        esigiUguale(pubblico.stato, 200, 'stato-sito.json servito a chiunque');
        esigiUguale(JSON.parse(pubblico.testo).manutenzione, true, 'stato-sito.json servito');
      } finally {
        await new Promise((risolvi) => server.close(risolvi));
      }
    });
  } finally {
    fs.writeFileSync(P.contenutiJson, originale, 'utf8');
    try {
      costruisci.genera();
    } catch (e) {
      segna('contenuti rimessi com erano dopo la manutenzione', false, e && e.message ? e.message : String(e));
    }
  }
}

async function proveGiochiDati() {
  apriSezione('11d. I giochi: i dati da Twitch (CONTRATTO-7, agente A)');
  const giochi = require('./lib/giochi');

  await prova('lo slot e l ora di Roma arrotondata ai 10 minuti', () => {
    esigiUguale(giochi.slotDi(new Date('2026-09-24T19:17:30Z')), '2026-09-24T21:10', 'estate');
    esigiUguale(giochi.slotDi(new Date('2026-12-01T20:09:59Z')), '2026-12-01T21:00', 'inverno');
    esigiUguale(giochi.slotDi(new Date('2026-09-24T22:05:00Z')), '2026-09-25T00:00', 'dopo mezzanotte');
    esigiUguale(giochi.slotDi('non e una data'), '', 'data storta');
    esigiUguale(giochi.msAlProssimoSlot(Date.UTC(2026, 8, 24, 19, 17, 0)), 3 * 60 * 1000, 'attesa fino al prossimo slot');
  });

  await prova('la giornata di diretta passa alla sera prima fino alle 6', () => {
    esigiUguale(giochi.giornataDi('2026-09-25T01:30'), '2026-09-24', 'notte');
    esigiUguale(giochi.giornataDi('2026-09-25T06:00'), '2026-09-25', 'mattina');
    esigiUguale(giochi.giornataDi('2026-10-01T02:00'), '2026-09-30', 'cambio di mese');
    esigiUguale(giochi.giornataDi('2026-09-25'), '', 'slot storto');
  });

  await prova('i generi IGDB si traducono, temi forti prima, al massimo 3', () => {
    esigiUguale(JSON.stringify(giochi.traduciGeneri({
      genres: [{ name: 'Shooter' }, { name: 'Adventure' }, { name: 'Point-and-click' }],
      themes: [{ name: 'Action' }, { name: 'Horror' }, { name: 'Fantasy' }]
    })), JSON.stringify(['Horror', 'Sparatutto', 'Avventura']), 'ordine e tetto');
    esigiUguale(JSON.stringify(giochi.traduciGeneri({ genres: [{ name: 'Role-playing (RPG)' }], themes: [{ name: 'Open world' }, { name: 'Survival' }] })),
      JSON.stringify(['Open world', 'Sopravvivenza', 'GDR']), 'temi prima dei generi');
    esigiUguale(JSON.stringify(giochi.traduciGeneri({ genres: [{ name: 'Quiz/Trivia' }], themes: [{ name: 'Party' }] })),
      JSON.stringify(['Quiz', 'Party game']), 'party game');
    esigiUguale(JSON.stringify(giochi.traduciGeneri({ genres: [{ name: 'Sconosciuto' }] })), '[]', 'genere ignoto');
    esigiUguale(JSON.stringify(giochi.traduciGeneri(null)), '[]', 'niente');
    const mappa = giochi.generiDaRisposta([{ id: 7, genres: [{ name: 'Racing' }] }, { id: 'x' }]);
    esigiUguale(JSON.stringify(mappa), JSON.stringify({ 7: ['Corse'] }), 'risposta IGDB');
    esigiUguale(giochi.corpoIgdb(['1', '2']), 'fields id,genres.name,themes.name; where id = (1,2); limit 500;', 'corpo della richiesta');
  });

  await prova('le copertine sono solo URL completi di static-cdn.jtvnw.net', () => {
    esigiUguale(giochi.copertinaDaTwitch('https://static-cdn.jtvnw.net/ttv-boxart/1_IGDB-{width}x{height}.jpg'),
      'https://static-cdn.jtvnw.net/ttv-boxart/1_IGDB-285x380.jpg', 'da box_art_url');
    esigiUguale(giochi.copertinaDaTwitch('https://evil.example/ttv-boxart/1-{width}x{height}.jpg'), '', 'host estraneo');
    esigiUguale(giochi.copertinaDaTwitch('http://static-cdn.jtvnw.net/ttv-boxart/1-{width}x{height}.jpg'), '', 'senza https');
    esigiUguale(giochi.copertinaDaPezzo('9891_IGDB_it-it'), 'https://static-cdn.jtvnw.net/ttv-boxart/9891_IGDB_it-it-285x380.jpg', 'dal seme');
    esigiUguale(giochi.copertinaDaPezzo('../x"y'), '', 'pezzo storto');
    const mappa = giochi.giochiDaRisposta({ data: [{ id: '5', name: 'Cinque', box_art_url: 'https://static-cdn.jtvnw.net/ttv-boxart/5-{width}x{height}.jpg', igdb_id: '55' }, { id: 'no' }] });
    esigiUguale(JSON.stringify(mappa), JSON.stringify({ 5: { nome: 'Cinque', copertina: 'https://static-cdn.jtvnw.net/ttv-boxart/5-285x380.jpg', igdbId: '55' } }), 'risposta di helix/games');
  });

  await prova('il seme vero ha 55 giochi con copertina ricostruibile', () => {
    const seme = JSON.parse(fs.readFileSync(path.join(RADICE_VERA, 'server', 'modelli', 'giochi-seme.json'), 'utf8'));
    esigiUguale(seme.giochi.length, 55, 'giochi nel seme');
    for (const g of seme.giochi) {
      esigi(/^[0-9]+$/.test(g.id), 'id storto: ' + g.id);
      esigi(giochi.copertinaDaPezzo(g.copertina) !== '', 'copertina non ricostruibile per ' + g.nome);
    }
  });

  const clipFinte = [
    { game_id: '100', created_at: '2026-09-25T19:30:00Z', view_count: 5, url: 'https://www.twitch.tv/x/clip/a', title: 'A', thumbnail_url: 'https://clips-media-assets2.twitch.tv/a.jpg' },
    { game_id: '100', created_at: '2024-01-01T12:00:00Z', view_count: 50, url: 'https://www.twitch.tv/x/clip/b', title: 'B', thumbnail_url: 'https://static-cdn.jtvnw.net/b.jpg' },
    { game_id: '', created_at: '2026-09-25T19:30:00Z', view_count: 999, url: 'https://www.twitch.tv/x/clip/z', title: 'Z' },
    { game_id: '400', created_at: '2026-09-27T20:00:00Z', view_count: 1, url: 'https://www.twitch.tv/x/clip/c', title: 'C', thumbnail_url: 'https://evil.example/c.jpg' }
  ];

  await prova('le clip si raggruppano per gioco con la migliore', () => {
    const gruppi = giochi.raggruppaClip(clipFinte);
    esigiUguale(Object.keys(gruppi).sort().join(','), '100,400', 'giochi con clip');
    esigiUguale(gruppi['100'].clip, 2, 'clip del 100');
    esigiUguale(gruppi['100'].prima, '2024-01-01', 'clip piu vecchia');
    esigiUguale(gruppi['100'].ultima, '2026-09-25', 'clip piu recente');
    esigiUguale(gruppi['100'].migliore.titolo, 'B', 'la piu vista');
    esigiUguale(gruppi['100'].migliore.anteprima, 'https://static-cdn.jtvnw.net/b.jpg', 'anteprima buona');
    esigiUguale(gruppi['400'].migliore.anteprima, '', 'anteprima da host estraneo');
  });

  const registroFinto = [
    { gameId: '100', nome: 'Gioco', slot: '2026-09-25T21:00' },
    { gameId: '100', nome: 'Gioco', slot: '2026-09-25T21:10' },
    { gameId: '100', nome: 'Gioco', slot: '2026-09-25T21:10' },
    { gameId: '100', nome: 'Gioco', slot: '2026-09-26T00:30' },
    { gameId: '300', nome: 'Nuovo', slot: '2026-09-26T22:00' },
    { gameId: '200', nome: 'Vecchio', slot: '2026-09-20T21:00' },
    { gameId: 'x', nome: 'Rotto', slot: '2026-09-26T22:10' },
    { gameId: '300', nome: 'Rotto', slot: 'ieri' }
  ];

  await prova('il registro deduplica gli slot e conta ore e giornate', () => {
    const pulito = giochi.pulisciRegistro(registroFinto);
    esigiUguale(pulito.length, 5, 'voci buone e uniche');
    const gruppi = giochi.raggruppaRegistro(registroFinto);
    esigiUguale(gruppi['100'].slot, 3, 'slot del 100');
    esigiUguale(JSON.stringify(gruppi['100'].giornate), JSON.stringify(['2026-09-25']), 'la notte conta per la sera prima');
    esigiUguale(gruppi['300'].nome, 'Nuovo', 'nome dal registro');
  });

  const seme = [
    { id: '100', nome: 'Gioco Seme', copertina: '100_IGDB', dirette: 2, ore: 3.5, clip: 1, primaVolta: '2025-01-10', ultimaVolta: '2026-09-20', generi: ['Horror'] },
    { id: '200', nome: 'Vecchio', copertina: '200_IGDB', dirette: 1, ore: 1, clip: 0, primaVolta: '2024-05-01', ultimaVolta: '2024-05-01', generi: ['Puzzle'] }
  ];
  const daTwitch = giochi.giochiDaRisposta({ data: [
    { id: '100', name: 'Gioco Vero', box_art_url: 'https://static-cdn.jtvnw.net/ttv-boxart/100_IGDB-{width}x{height}.jpg', igdb_id: '9' },
    { id: '400', name: 'Clip Solo', box_art_url: 'https://evil.example/x-{width}x{height}.jpg', igdb_id: '8' }
  ] });
  const precedenti = [{ id: '400', nome: 'Clip Solo', generi: ['Corse'], copertina: 'https://static-cdn.jtvnw.net/ttv-boxart/400-285x380.jpg' }];

  await prova('seme, registro, clip e IGDB si fondono', () => {
    const elenco = giochi.fondiGiochi({
      seme: seme, semeFino: '2026-09-24', precedenti: precedenti, clip: giochi.raggruppaClip(clipFinte),
      registro: registroFinto, giochiTwitch: daTwitch, generiIgdb: { 9: ['Sparatutto'], 8: [] }
    });
    esigiUguale(elenco.map((g) => g.id).join(','), '400,300,100,200', 'ordine per ultima volta');
    const [clipSolo, nuovo, gioco, vecchio] = elenco;
    esigiUguale(gioco.nome, 'Gioco Vero', 'nome da Twitch');
    esigiUguale(gioco.copertina, 'https://static-cdn.jtvnw.net/ttv-boxart/100_IGDB-285x380.jpg', 'copertina da Twitch');
    esigiUguale(JSON.stringify(gioco.generi), JSON.stringify(['Sparatutto']), 'generi da IGDB');
    esigiUguale(gioco.dirette, 3, 'dirette: seme piu giornate nuove');
    esigiUguale(gioco.ore, 4, 'ore: seme piu slot');
    esigiUguale(gioco.clip, 2, 'clip: il massimo');
    esigiUguale(gioco.primaVolta, '2024-01-01', 'prima volta');
    esigiUguale(gioco.ultimaVolta, '2026-09-25', 'ultima volta');
    esigiUguale(gioco.clipMigliore.titolo, 'B', 'clip migliore');
    esigiUguale(nuovo.nome, 'Nuovo', 'nome dal registro');
    esigiUguale(nuovo.dirette, 1, 'dirette del gioco nuovo');
    esigiUguale(nuovo.ore, 0.2, 'ore arrotondate');
    esigiUguale(nuovo.clipMigliore, null, 'senza clip');
    esigiUguale(nuovo.copertina, '', 'senza copertina');
    esigiUguale(JSON.stringify(clipSolo.generi), JSON.stringify(['Corse']), 'IGDB vuoto: generi di prima');
    esigiUguale(clipSolo.copertina, 'https://static-cdn.jtvnw.net/ttv-boxart/400-285x380.jpg', 'copertina di prima');
    esigiUguale(clipSolo.dirette, 0, 'solo clip');
    esigiUguale(vecchio.dirette, 1, 'lo slot prima del seme non conta');
    esigiUguale(vecchio.copertina, 'https://static-cdn.jtvnw.net/ttv-boxart/200_IGDB-285x380.jpg', 'copertina dal seme');
    esigiUguale(JSON.stringify(vecchio.generi), JSON.stringify(['Puzzle']), 'generi dal seme');
    for (const g of elenco) {
      esigiUguale(JSON.stringify(Object.keys(g)),
        JSON.stringify(['id', 'nome', 'copertina', 'generi', 'dirette', 'ore', 'clip', 'primaVolta', 'ultimaVolta', 'clipMigliore']), 'forma di ' + g.id);
    }

    const senzaIgdb = giochi.fondiGiochi({ seme: seme, semeFino: '2026-09-24', clip: {}, registro: [], giochiTwitch: daTwitch, generiIgdb: null });
    esigiUguale(JSON.stringify(senzaIgdb.find((g) => g.id === '100').generi), JSON.stringify(['Horror']), 'IGDB giu: generi del seme');
  });

  await prova('il registro su disco: uno slot si annota una volta sola', () => {
    try { fs.unlinkSync(P.giochiRegistro); } catch (e) {}
    try {
      esigiUguale(giochi.annotaSlot({ gameId: '100', nome: 'Gioco', slot: '2026-09-25T21:00' }).annotato, true, 'prima volta');
      esigiUguale(giochi.annotaSlot({ gameId: '100', nome: 'Gioco', slot: '2026-09-25T21:00' }).annotato, false, 'seconda copia dell app');
      esigiUguale(giochi.annotaSlot({ gameId: '300', nome: 'Altro', slot: '2026-09-25T21:10' }).annotato, true, 'slot dopo');
      esigiUguale(giochi.annotaSlot({ gameId: '', slot: '2026-09-25T21:20' }).annotato, false, 'voce storta');
      esigiUguale(giochi.registroSalvato().length, 2, 'voci su disco');
      fs.writeFileSync(P.giochiRegistro, '{ rotto');
      esigiUguale(giochi.annotaSlot({ gameId: '100', slot: '2026-09-25T21:30' }).annotato, false, 'registro rotto');
      esigiUguale(fs.readFileSync(P.giochiRegistro, 'utf8'), '{ rotto', 'il registro rotto non si sovrascrive');
    } finally {
      try { fs.unlinkSync(P.giochiRegistro); } catch (e) {}
    }
  });

  await prova('senza Twitch non si chiede niente e non parte nessun controllo', async () => {
    esigi(!twitch.configurato(), 'nella copia di lavoro non dovrebbero esserci credenziali');
    const primaDi = fs.existsSync(P.giochiTwitch) ? fs.readFileSync(P.giochiTwitch, 'utf8') : null;
    const esito = await giochi.aggiornaGiochi();
    esigiUguale(esito.stato, 'spento', 'stato');
    esigiUguale(fs.existsSync(P.giochiTwitch) ? fs.readFileSync(P.giochiTwitch, 'utf8') : null, primaDi, 'il file dei giochi non doveva cambiare');
    esigiUguale(giochi.avviaControllo(), null, 'controllo periodico');
    esigiDentro(giochi.raccontaGiochi({ stato: 'fallito', motivo: 'rete' }), 'Tengo l elenco di prima', 'riga del fallimento');
    esigiDentro(giochi.raccontaGiochi({ stato: 'aggiornato', giochi: 3, clip: 7, generi: 'igdb' }), '3 giochi', 'riga del successo');
    esigiUguale(giochi.raccontaGiochi({ stato: 'boh' }), '', 'stato sconosciuto');
  });
}

async function esegui() {
  console.log('');
  console.log('  COLLAUDO DEL BACKEND — slayer_beard');
  console.log('  radice vera: ' + RADICE_VERA);

  const contenutiVeri = JSON.parse(fs.readFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), 'utf8'));
  const temporanea = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-collaudo-'));

  try {
    await proveMotore(temporanea);
    await proveConvalida(contenutiVeri);
    await proveSchema(contenutiVeri);
    await proveTestoRicco();
    await proveTema();

    const progetto = path.join(temporanea, 'progetto');
    preparaProgetto(progetto);
    percorsi.imposta(progetto);
    console.log('');
    console.log('  copia di lavoro: ' + progetto);

    const costruisci = require('./lib/costruisci');
    const archivio = require('./lib/archivio');
    await proveGenerazione(progetto, costruisci, archivio);
    await proveLurk(contenutiVeri, costruisci, archivio);
    await proveApi(costruisci);
    await proveSondaggi(archivio);
    await proveMeteora(costruisci, archivio);
    await proveTwitch(costruisci, archivio);
    await proveClip(contenutiVeri, costruisci, archivio);
    await proveSchedule(contenutiVeri, costruisci, archivio);
    await proveSponsor(contenutiVeri, costruisci, archivio);
    await provePaginaGiochi(contenutiVeri, costruisci, archivio);
    await proveSorpresaSlayer(costruisci, archivio);
    await proveGiocoPollo(costruisci, archivio);
    await proveCanzoniPollo(costruisci, archivio);
    await proveStilePollo(costruisci, archivio);
    await proveClassifica(costruisci, archivio);
    await proveManutenzione(contenutiVeri, costruisci, archivio);
    await proveGiochiDati();

    await proveHosting(temporanea);
    await proveUscita(costruisci, archivio);
    await provePannelloEsposto();
  } finally {
    percorsi.imposta(RADICE_VERA);
    try { fs.rmSync(temporanea, { recursive: true, force: true }); } catch (e) {}
  }

  const fallite = esiti.filter((e) => !e.ok);
  console.log('');
  console.log('  ' + '='.repeat(58));
  if (!fallite.length) {
    console.log('  TUTTO A POSTO — ' + esiti.length + ' prove passate.');
    console.log('  ' + '='.repeat(58));
    console.log('');
    return 0;
  }

  console.log('  ' + fallite.length + ' prove fallite su ' + esiti.length + ':');
  for (const f of fallite) { console.log('    - [' + f.sezione + '] ' + f.nome + '\n      ' + f.dettaglio); }
  console.log('  ' + '='.repeat(58));
  console.log('');
  return 1;
}

if (require.main === module) {
  esegui()
    .then((codice) => process.exit(codice))
    .catch((err) => {
      console.error('');
      console.error('  Il collaudo si e interrotto: ' + (err && err.stack ? err.stack : err));
      console.error('');
      process.exit(1);
    });
}

module.exports = { esegui };
