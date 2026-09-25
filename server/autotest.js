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
  const trovato = /^\s*Polarit\S*:\s*([A-Z]+)/m.exec(css);
  if (!trovato) { throw new Error('l intestazione del foglio non dice la polarita'); }
  return trovato[1];
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
    esigi(/file generato/i.test(css), 'manca l avvertenza «file generato» in testa');
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
    esigi(/file generato/i.test(foglio), 'manca l avvertenza «file generato» in testa');
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

    const facoltativi = ['js/musica.js', 'js/sponsor.js'];
    const fissi = soloNostri.filter((s) => facoltativi.indexOf(s) === -1);
    const coda = soloNostri.slice(fissi.length);
    esigi(coda.every((s) => facoltativi.indexOf(s) > -1),
      'gli script facoltativi non stanno in fondo: ' + soloNostri.join(','));
    esigiUguale(fissi.join(','),
      'js/ritorno.js,js/dati.js,js/player.js,js/festa.js,js/sito.js,js/meteora.js,js/account.js,js/canale.js,js/lurk.js,js/pollo.js,js/cima.js,js/guardia.js,js/sondaggio.js',
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
    '/* PORTA e HOST sono costanti calcolate al caricamento: per provarne la',
    '   precedenza il modulo va ricaricato a ogni caso. */',
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
    '/* Carica app.js come lo caricherebbe Passenger e dice che fuso e che',
    "   indirizzo ne sono usciti. L'ascolto e asincrono: si esce prima che",
    '   cominci, quindi nessuna porta resta occupata. */',
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

  await prova('la musica d attesa: file fisso, in loop, volume basso, bottone per fermarla', async () => {
    const modello = fs.readFileSync(P.modelloManutenzione, 'utf8');
    esigiDentro(modello, 'src="mp3/ElevatorMaintenance.mp3" loop', 'audio');
    esigiDentro(modello, 'id="mnt-musica"', 'bottone');
    const script = fs.readFileSync(P.scriptManutenzione, 'utf8');
    esigiDentro(script, 'audio.volume = 0.2', 'volume');
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
