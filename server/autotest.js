'use strict';
/* =====================================================================
   autotest.js — il collaudo del backend.

   Uso:  node server/autotest.js

   Prove vere, senza dipendenze e senza toccare i file del progetto: il
   motore di template, la convalida, la copertura dello schema, il
   sanificatore del testo ricco, il foglio del tema, una generazione
   completa dentro una cartella temporanea, le invarianti della modalita
   lurk e un giro di API su un server avviato in questo stesso processo.

   Esce con codice 1 se anche una sola prova non passa: cosi si puo
   incatenare a un comando di pubblicazione senza pensarci.
   ===================================================================== */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const percorsi = require('./lib/percorsi');
const { P } = percorsi;
const RADICE_VERA = P.radice;

const modello = require('./lib/modello');
const convalida = require('./lib/convalida');
// controlli.js guarda il documento intero e non tocca il disco: come modello
// e convalida, si carica qui in cima senza aspettare la copia di lavoro.
const controlli = require('./lib/controlli');
// testoricco e tema non sanno niente di percorsi: si possono caricare qui in
// cima, prima che la radice venga spostata sulla copia di lavoro.
const testoricco = require('./lib/testoricco');
const tema = require('./lib/tema');
const schema = require('../contenuti/schema.js');

/* --- MINIMO INDISPENSABILE PER PROVARE ------------------------------ */

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

/** Esegue una prova sincrona o asincrona, trasformando l'eccezione in fallimento. */
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

/** Verifica che `fn` lanci, e che il messaggio contenga `pezzo`. */
function esigiErrore(fn, pezzo, cosa) {
  let lanciato = null;
  try { fn(); } catch (e) { lanciato = e; }
  if (!lanciato) { throw new Error((cosa || 'la chiamata') + ' doveva fallire e invece e passata.'); }
  if (pezzo && String(lanciato.message).indexOf(pezzo) === -1) {
    throw new Error((cosa || 'errore') + ': atteso un messaggio con ' + JSON.stringify(pezzo) + ', avuto ' + JSON.stringify(lanciato.message));
  }
  return lanciato;
}

/* --- 1. MOTORE DI TEMPLATE ------------------------------------------ */

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
    // E il caso vero di "settimana" e "supporto": prefisso di testi e nome di elenco.
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

/* --- 2. CONVALIDA ---------------------------------------------------- */

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
    // Il campo e facoltativo: vuoto vuol dire «nessuna app registrata», ed e
    // lo stato di partenza del progetto.
    esigiUguale(convalida.convalidaCampo('config.lurk.clientId', '').length, 0, 'vuoto');
    esigiUguale(convalida.convalidaCampo('config.lurk.clientId', 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3').length, 0, 'trenta minuscole e cifre');

    // Il caso vero: il promemoria lasciato al posto del valore. Prima passava
    // la convalida e si schiantava soltanto sotto le mani di un visitatore,
    // con un 400 «invalid client» dal server di Twitch.
    for (const storto of ['DAxSOSTITUIRExCONxQUELLOxVERO', 'abc', 'k3j9x2q7w1 m5v8b4n6z0', 'K3J9X2Q7W1M5V8B4N6Z0C7T2Y5R8P3']) {
      esigi(convalida.convalidaCampo('config.lurk.clientId', storto).length === 1,
        'doveva essere rifiutato: ' + storto);
    }
  });

  /* I controlli d'insieme (server/lib/controlli.js). Non sono errori e non
     fermano niente: sono le cose che nessun campo, guardato da solo, puo
     dire — e che altrimenti si scoprono online, dal vivo. */

  await prova('controlli: il sito configurato per la produzione non segnala niente', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.sitoUrl = 'https://slayerbeard.it/';
    documento.config.twitch.domini = ['slayerbeard.it'];
    documento.config.lurk.messaggioAttivo = true;
    documento.config.lurk.clientId = 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3';
    documento.config.lurk.urlRitorno = 'https://slayerbeard.it/';
    const avvertimenti = controlli.controlli(documento);
    esigiUguale(avvertimenti.length, 0,
      'avvertimenti inattesi: ' + avvertimenti.map((a) => a.chiave).join(', '));
  });

  await prova('controlli: il dominio del player mancante viene detto', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.sitoUrl = 'https://slayerbeard.it/';
    documento.config.twitch.domini = [];
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.twitch.domini'),
      'nessun avvertimento sui domini, e online il player non partirebbe');
  });

  await prova('controlli: l indirizzo di ritorno che punta altrove viene detto', () => {
    // La trappola vera: due valori leciti presi da soli, un login rotto per
    // tutti i visitatori quando stanno insieme.
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.sitoUrl = 'https://slayerbeard.it/';
    documento.config.twitch.domini = ['slayerbeard.it'];
    documento.config.lurk.messaggioAttivo = true;
    documento.config.lurk.clientId = 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3';
    documento.config.lurk.urlRitorno = 'http://localhost:4173/';
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.lurk.urlRitorno'),
      'nessun avvertimento sull indirizzo di ritorno');
  });

  await prova('controlli: l interruttore acceso senza Client ID viene detto', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.lurk.messaggioAttivo = true;
    documento.config.lurk.clientId = '';
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.lurk.clientId'),
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
    rotto.config.social[3].url = '';                 // vuoto e ammesso: la voce sparisce dal sito
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

  /* --- I quattro tipi nuovi (CONTRATTO-2 §5) ---
     Le chiavi sono quelle vere dello schema: se un domani cambiano nome,
     queste prove lo dicono, invece di continuare a controllare campi che
     non esistono piu. */

  await prova('ricco: il massimo conta le lettere che si leggono, non i tag', () => {
    esigiUguale(convalida.convalidaCampo('diretta.testo', '<b>' + 'x'.repeat(240) + '</b>').length, 0, '240 caratteri visibili');
    esigi(convalida.convalidaCampo('diretta.testo', 'x'.repeat(241)).length === 1, '241 caratteri');
    esigi(convalida.convalidaCampo('diretta.testo', '').length === 1, 'campo vuoto');
    esigi(convalida.convalidaCampo('diretta.testo', '<b></b>').length === 1, 'solo formattazione, niente testo');
  });

  await prova('ricco: quello che il sanificatore toglie viene raccontato', () => {
    const errori = convalida.convalidaCampo('diretta.testo', '<b>ciao</b><script>alert(1)</script>');
    esigi(errori.length >= 1, 'lo script non e stato segnalato');
    // L etichetta si chiede allo schema invece di riscriverla qui: se
    // qualcuno la migliora, questa prova non deve diventare rossa per quello.
    esigiDentro(errori[0].messaggio, schema.campo('diretta.testo').etichetta, 'il messaggio non nomina il campo');
    esigi(convalida.convalidaCampo('diretta.testo', '<a href="javascript:alert(1)">qui</a> ciao').length >= 1,
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
    // Il caso che conta davvero: e nel catalogo, ma di un altro slot. Un
    // monospazio finito sui titoli non e una svista da lasciar passare.
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

/* --- 3. COPERTURA DELLO SCHEMA --------------------------------------- */

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
    // Prima i gruppi nell ordine in cui si incontrano scendendo, poi i due
    // che non stanno in nessun punto della pagina perche valgono ovunque:
    // "canale" (i dati tecnici) e "aspetto" (colori e font).
    const atteso = ['meta', 'marchio', 'deck', 'diretta', 'lurk', 'pollo', 'settimana', 'chi',
      'supporto', 'saluti', 'piede', 'canale', 'aspetto'];
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
}

/* --- 4. TESTO RICCO --------------------------------------------------- */

/*
   La batteria completa e dell agente 5, dentro il suo modulo. Qui resta
   una rete: i casi cattivi che, se un domani qualcuno «semplifica» il
   sanificatore con due espressioni regolari, tornano a passare.
*/
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
      // La garanzia vera non e «non c e la parola script»: e che in uscita
      // ci siano SOLO i tag della lista bianca. Quello che avanza e testo
      // gia protetto, e resta testo per sempre.
      for (const trovato of pulito.match(/<\/?[a-zA-Z][^\s>/]*/g) || []) {
        const nome = trovato.replace(/^<\/?/, '').toLowerCase();
        esigi(Object.prototype.hasOwnProperty.call(testoricco.TAG_AMMESSI, nome),
          'e passato il tag <' + nome + '> partendo da ' + cattivo);
      }
      esigi(!/\son[a-z]+\s*=/i.test(pulito), 'e passato un attributo evento: ' + cattivo);
    }
    // Dentro script e style non c e testo, c e codice: sparisce col tag.
    esigiUguale(testoricco.sanifica('<script>alert(1)</script>Ciao'), 'Ciao', 'contenuto dello script');
    esigiUguale(testoricco.sanifica('<style>body{display:none}</style>Ciao'), 'Ciao', 'contenuto dello style');
  });

  await prova('un link javascript: perde il collegamento e tiene il testo', () => {
    for (const cattivo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//altrosito.it/x']) {
      const pulito = testoricco.sanifica('<a href="' + cattivo + '">clicca</a>');
      esigiUguale(pulito, 'clicca', 'href ' + cattivo);
    }
    // Quello buono resta, e va fuori con le due protezioni di rito.
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

/* --- 5. TEMA ---------------------------------------------------------- */

/** Vero se il foglio dichiara quel token (la riga «  --nome: valore;»). */
function dichiara(css, token) {
  return new RegExp('^\\s*' + token + ':\\s', 'm').test(css);
}

/**
 * SCURA o CHIARA, letta dall intestazione del foglio.
 *
 * Si legge la sola parola maiuscola e non la frase intorno: quella frase e
 * prosa italiana per chi apre il file, e la prosa cambia (gli accenti, per
 * dirne una, sono arrivati dopo). Una prova che confronta una frase intera
 * diventa rossa quando qualcuno migliora un testo, cioe protesta per il
 * motivo sbagliato. Qui l informazione e la polarita, ed e quella che si
 * guarda.
 */
function polarita(css) {
  const trovato = /^\s*Polarit\S*:\s*([A-Z]+)/m.exec(css);
  if (!trovato) { throw new Error('l intestazione del foglio non dice la polarita'); }
  return trovato[1];
}

async function proveTema() {
  apriSezione('5. Tema (server/lib/tema.js)');

  // I token del CONTRATTO-2 §8: se ne sparisce uno, il sito resta con il
  // valore di tokens.css e il pannello smette di comandare quel pezzo.
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
    // Non solo la riga del colore: i derivati (aloni, bagliori, linea viva)
    // nascono da li, e se restassero fermi il tema sarebbe una bugia.
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
    // Il colore atteso si chiede al modulo, non si ricopia: cosi la prova
    // regge anche se un domani cambia il fondo di partenza.
    esigi(piatto.indexOf('--grad-pagina: ' + tema.PREDEFINITO.colori.fondo + ';') !== -1,
      'a zero aloni il fondo non e piatto');
    const pieno = tema.css({ sfondo: { aloni: 100 } });
    esigiDentro(pieno, 'radial-gradient', 'gli aloni');
    // Le code sono rgba(...,0): «transparent» interpola passando per il nero.
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
    // Il pannello chiama POST /api/tema anche mentre si sta ancora battendo
    // «#ab»: qui non si puo lanciare, mai.
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
    // Famiglia e pesi si prendono dal catalogo: la forma dell indirizzo e
    // quello che si sta provando, non quali font sono di moda oggi.
    const scelta = tema.CATALOGO_FONT.titolo.find((f) => f.nome === tema.PREDEFINITO.font.titolo);
    esigiDentro(url, 'family=' + scelta.nome.replace(/ /g, '+') + ':wght@' + scelta.pesi.join(';'), 'famiglia dei titoli');
    // Tutti di sistema: nessun <link>, la pagina non contatta nessuno.
    esigiUguale(tema.urlGoogleFonts({ font: { titolo: 'Font di sistema', testo: 'Font di sistema', mono: 'Font di sistema' } }),
      '', 'font tutti di sistema');
  });
}

/* --- 6. GENERAZIONE IN UNA CARTELLA TEMPORANEA ------------------------ */

/** Copia il minimo che serve a generare: modelli, contenuti, template di dati.js. */
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
    // E deve essere caricato: un tema generato che nessuno include non serve.
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
    // Si contano le voci rese, non i nomi: "slayer_beard" e anche il nome del
    // canale e comparirebbe comunque nella pagina.
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
    // La settima e "lurk", arrivata col CONTRATTO-3 §5.2: il pollo commenta
    // la modalita lurk, non la comanda.
    for (const elenco of ['riposo', 'click', 'chat', 'scrive', 'live', 'lurk', 'offline']) {
      esigi(Array.isArray(dati.pollo.frasi[elenco]), 'manca frasi.' + elenco);
      esigi(dati.pollo.frasi[elenco].length > 0, 'frasi.' + elenco + ' e vuoto');
      esigi(dati.pollo.frasi[elenco].every((f) => typeof f === 'string' && f.trim()), 'una frase vuota in ' + elenco);
    }
    esigiUguale(Object.keys(dati.pollo.frasi).length, 7, 'liste di frasi');
    esigi(!!dati.pollo.testi.etichetta, 'manca l etichetta del bottone del pollo');
    esigi(!!dati.pollo.testi.nascondi, 'manca l etichetta del «nascondi»');
    // {nome} vale solo dentro frasi.chat: altrove resterebbe stampato cosi.
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
    // Il monitor se n e andato dalla copertina: se torna li, la sezione
    // nuova non serve piu a niente e questa prova lo dice. Si guarda fino
    // alla chiusura di #regia, non fino a #diretta: fra le due c e un
    // commento che nomina gli id del player, e non e un monitor.
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
    // La copia sanificata non deve tornare indietro su contenuti.json: li
    // resta quello che ha battuto chi amministra.
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
    // La prima copia in assoluto e stata fatta quando index.html non esisteva
    // ancora: per questa prova serve una copia che la pagina ce l'abbia.
    const copia = backup.elenco().find((b) => b.file.indexOf('index.html') !== -1);
    esigi(copia !== undefined, 'nessuna copia contiene index.html');
    // Il tema e il terzo file generato: se il backup non lo conserva, un
    // ripristino rimette la pagina vecchia con i colori nuovi.
    esigi(copia.file.indexOf('tema.css') !== -1, 'nella copia manca tema.css');
    fs.writeFileSync(P.indexHtml, '<!-- rovinato a mano -->', 'utf8');
    fs.writeFileSync(P.temaCss, ':root { --fondo: rovinato; }', 'utf8');
    const esitoRipristino = backup.ripristina(copia.id);
    esigi(esitoRipristino.ripristinati.indexOf('index.html') !== -1, 'index.html non ripristinato');
    esigi(esitoRipristino.ripristinati.indexOf('tema.css') !== -1, 'css/tema.css non ripristinato');
    esigi(esitoRipristino.backup !== copia.id, 'il ripristino non ha fatto la copia di sicurezza');
    esigi(fs.readFileSync(P.indexHtml, 'utf8').indexOf('rovinato') === -1, 'la pagina rovinata e ancora li');
    esigi(fs.readFileSync(P.temaCss, 'utf8').indexOf('rovinato') === -1, 'il tema rovinato e ancora li');

    // Il ripristino riporta indietro anche contenuti.json, ed e voluto: la
    // pagina e i contenuti che l'hanno prodotta tornano insieme. Quella
    // copia pero era stata scattata durante la prova precedente, con un
    // titolo vuoto dentro, quindi qui si riparte dai contenuti buoni.
    fs.copyFileSync(path.join(RADICE_VERA, 'contenuti', 'contenuti.json'), P.contenutiJson);
    esigiUguale(convalida.convalida(archivio.leggi()).length, 0, 'contenuti rimessi a posto');
    costruisci.genera();
  });
}

/* --- 7. MODALITA LURK ------------------------------------------------- */

/*
   Il cuore di questa sezione sono le invarianti del CONTRATTO-3 §6.4, quelle
   che tengono spento il blocco B su un sito pubblicato senza app Twitch
   registrata. Vivono in generazione apposta — js/dati.js si puo modificare a
   mano dopo — e qui si controlla che ci siano davvero, non che ci sia scritto
   che ci sono.
*/
async function proveLurk(contenutiVeri, costruisci, archivio) {
  apriSezione('7. Modalita lurk (CONTRATTO-3)');

  // I sei tipi che il gruppo puo usare (CONTRATTO-3 §6.3). Sono tutti tipi
  // gia esistenti, ed e la ragione per cui pannello/ non si tocca: un tipo
  // nuovo obbligherebbe a scrivere il campo anche nell interfaccia.
  const TIPI_AMMESSI = ['interruttore', 'testo', 'url', 'numero', 'elencoTesti', 'ricco'];

  /**
   * Il ramo `lurk` di window.DATI calcolato su una config.lurk di prova.
   *
   * lurkDi() non e esportata: si passa da oggettoDati(), che e la porta
   * pubblica ed e la stessa funzione che riempie js/dati.js. Cosi la prova
   * guarda quello che finisce davvero in pagina, non una funzione interna
   * che un domani potrebbe non essere piu quella chiamata.
   */
  const ramo = (lurk) => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    if (lurk === undefined) { delete documento.config.lurk; } else { documento.config.lurk = lurk; }
    return costruisci.oggettoDati(documento).lurk;
  };

  /** Una config.lurk sana, da sporcare un pezzo per volta. */
  const sana = (aggiunte) => Object.assign({
    attivo: true, tieniSchermoAcceso: false, oreMax: 3,
    messaggioAttivo: true, clientId: 'abcdef1234567890abcdef', urlRitorno: 'https://slayerbeard.it/',
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
    esigiUguale(typeof lurk.messaggio.clientId, 'string', 'messaggio.clientId');
    esigiUguale(typeof lurk.messaggio.urlRitorno, 'string', 'messaggio.urlRitorno');
    esigi(Array.isArray(lurk.messaggio.frasi), 'messaggio.frasi non e un elenco');
    // Questi li scrive js/lurk.js con textContent: se ne manca uno, al posto
    // dello stato o del bottone resta una riga vuota.
    for (const chiave of ['accendi', 'spegni', 'audio', 'ripresa', 'ciSei', 'ciSono',
      'statoSpento', 'statoVivo', 'statoFermo', 'statoRiparto', 'statoBloccato', 'statoAttesa', 'statoResa',
      // `preavviso` ha sostituito il vecchio gruppo manda/conferma/annulla/
      // altraFrase: il messaggio non ha piu un bottone suo, parte con
      // l'accensione del lurk, e la frase si annuncia prima invece di
      // chiedere una conferma a parte (CONTRATTO-3 §4.1).
      // `manda` e il bottone di ripiego per chi non ha i comandi del player:
      // senza accensione non ci sarebbe niente a cui agganciare il messaggio.
      'entra', 'esci', 'schermo', 'collegato', 'preavviso', 'invito', 'manda', 'inviato']) {
      esigi(!!lurk.testi[chiave], 'manca o e vuoto lurk.testi.' + chiave);
    }
  });

  await prova('il ramo dice PERCHE il messaggio e spento, non solo che lo e', () => {
    // Dal browser i tre casi sono indistinguibili — a valle producono lo
    // stesso oggetto vuoto — e senza questo campo il sito puo solo tacere,
    // che e esattamente il modo di far perdere un pomeriggio a chi prova.
    esigiUguale(ramo(sana()).messaggio.motivo, '', 'tutto a posto: nessun motivo');
    esigiUguale(ramo(sana({ messaggioAttivo: false })).messaggio.motivo, 'spento', 'interruttore spento');
    esigiUguale(ramo(sana({ clientId: '' })).messaggio.motivo, 'senzaClientId', 'client id mancante');
    esigiUguale(ramo(sana({ frasi: [] })).messaggio.motivo, 'senzaFrasi', 'nessuna frase');
    // L ordine conta: se manca tutto, il primo ostacolo e l interruttore.
    esigiUguale(ramo(sana({ messaggioAttivo: false, clientId: '' })).messaggio.motivo, 'spento',
      'con tutto spento si nomina l interruttore per primo');
  });

  await prova('senza Client ID il messaggio resta spento, anche con l interruttore acceso', () => {
    // E l invariante che tiene fermo l OAuth su un sito pubblicato da chi non
    // ha registrato nessuna app: senza app non c e niente da interrogare, e
    // il bottone sarebbe un bottone che fallisce.
    esigiUguale(ramo(sana({ clientId: '' })).messaggio.attivo, false, 'client id vuoto');
    esigiUguale(ramo(sana({ clientId: '   ' })).messaggio.attivo, false, 'client id di soli spazi');
    const senza = sana();
    delete senza.clientId;
    esigiUguale(ramo(senza).messaggio.attivo, false, 'chiave clientId mancante');
  });

  await prova('senza frasi il messaggio resta spento, anche col Client ID a posto', () => {
    esigiUguale(ramo(sana({ frasi: [] })).messaggio.attivo, false, 'elenco vuoto');
    esigiUguale(ramo(sana({ frasi: ['', '   '] })).messaggio.attivo, false, 'solo frasi vuote');
    esigiUguale(ramo(sana({ frasi: 'Hey! Lurko dal sito.' })).messaggio.attivo, false, 'frasi non e un elenco');
  });

  await prova('interruttore, Client ID e almeno una frase: allora si accende', () => {
    const lurk = ramo(sana());
    esigiUguale(lurk.messaggio.attivo, true, 'messaggio.attivo');
    esigiUguale(lurk.messaggio.clientId, 'abcdef1234567890abcdef', 'client id nel ramo');
    esigiUguale(lurk.messaggio.urlRitorno, 'https://slayerbeard.it/', 'url di ritorno nel ramo');
    esigiUguale(lurk.messaggio.frasi.join('|'), 'Hey! Lurko dal sito.', 'frasi nel ramo');
    // Con l interruttore spento non basta avere tutto il resto in ordine.
    esigiUguale(ramo(sana({ messaggioAttivo: false })).messaggio.attivo, false, 'interruttore spento');
  });

  await prova('col messaggio spento il Client ID non esce affatto', () => {
    // Non deve finire in pagina il Client ID di un app che non si usa: e un
    // dato pubblico per natura, ma stamparlo lo stesso vuol dire pubblicare
    // un app registrata a nome di qualcuno senza che serva a niente.
    for (const storta of [{ messaggioAttivo: false }, { frasi: [] }, { messaggioAttivo: 'si' }]) {
      const lurk = ramo(sana(storta));
      esigiUguale(lurk.messaggio.attivo, false, 'atteso spento con ' + JSON.stringify(storta));
      esigiUguale(lurk.messaggio.clientId, '', 'client id con ' + JSON.stringify(storta));
      esigiUguale(lurk.messaggio.urlRitorno, '', 'url di ritorno con ' + JSON.stringify(storta));
      esigiUguale(lurk.messaggio.frasi.length, 0, 'frasi con ' + JSON.stringify(storta));
    }
  });

  await prova('oreMax viene riportato dentro 1..12, sempre', () => {
    // Un numero fuori scala disattiverebbe di fatto il controllo di presenza
    // del §3.5, cioe la cosa che separa questa funzione da un miner di punti.
    const casi = [[0, 1], [-5, 1], [1, 1], [12, 12], [99, 12], [3.6, 4]];
    for (const [dato, atteso] of casi) {
      esigiUguale(ramo(sana({ oreMax: dato })).oreMax, atteso, 'oreMax ' + JSON.stringify(dato));
    }
    // La chiave che manca, il ramo che manca e la parola al posto del numero
    // cadono tutti sul predefinito: 3 ore.
    const senza = sana();
    delete senza.oreMax;
    esigiUguale(ramo(senza).oreMax, 3, 'chiave mancante');
    esigiUguale(ramo(undefined).oreMax, 3, 'ramo config.lurk mancante');
    esigiUguale(ramo(sana({ oreMax: 'tre' })).oreMax, 3, 'parola al posto del numero');
    // E comunque, qualunque cosa arrivi, quello che esce e un intero in scala.
    for (const storto of [null, '', '8', [], {}, NaN, Infinity, -Infinity, '12.9', true]) {
      const ore = ramo(sana({ oreMax: storto })).oreMax;
      esigi(Number.isInteger(ore) && ore >= 1 && ore <= 12, 'oreMax ' + JSON.stringify(storto) + ' e uscito ' + ore);
    }
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
    // Vuoto per contratto, come #twitch-embed: senza JavaScript non devono
    // restare in pagina bottoni raggiungibili col Tab che non fanno niente.
    esigi(/<div id="lurk-comandi"[^>]*><\/div>/.test(html), '#lurk-comandi non c e, oppure non e vuoto');
    // Il contatore cambia ogni secondo: annunciarlo farebbe parlare un
    // lettore di schermo in continuazione (CONTRATTO-3 §2).
    const conto = /<p id="lurk-conto"[^>]*>/.exec(html);
    esigi(conto !== null && conto[0].indexOf('aria-live') === -1, '#lurk-conto ha un aria-live');
  });

  await prova('la CSP resta stretta dove conta, e larga solo dove serve', () => {
    const html = costruisci.anteprimaDi(archivio.leggi());
    const meta = /<meta http-equiv="Content-Security-Policy" content="([\s\S]*?)">/.exec(html);
    esigi(meta !== null, 'la Content-Security-Policy non c e piu');
    const csp = meta[1].replace(/\s+/g, ' ');

    // La riga che protegge il token: un solo script inline basterebbe a
    // rubarlo, e quel token vale su TUTTI i canali di Twitch.
    esigi(csp.indexOf('\'unsafe-inline\'') === -1 || /script-src [^;]*'unsafe-inline'/.test(csp) === false,
      'script-src ha guadagnato unsafe-inline');
    esigi(/script-src 'self' https:\/\/embed\.twitch\.tv/.test(csp), 'script-src non e piu quello di prima');

    // L avatar della tessera dell account: e l unico dominio esterno da cui
    // la pagina carichi un immagine, ed e un host di sole immagini.
    esigi(/img-src [^;]*https:\/\/static-cdn\.jtvnw\.net/.test(csp),
      'img-src non permette il CDN delle immagini di profilo: l avatar resterebbe rotto');

    // Le chiamate del blocco B: senza queste il login non parte proprio.
    for (const dove of ['https://api.twitch.tv', 'https://id.twitch.tv']) {
      esigi(new RegExp('connect-src [^;]*' + dove.replace(/[.\/]/g, '\\$&')).test(csp),
        'connect-src non permette ' + dove);
    }
  });

  await prova('js/ritorno.js e il primo script della pagina, e non e differito', () => {
    const html = costruisci.anteprimaDi(archivio.leggi());

    // Non e un dettaglio di stile: quando la pagina e la finestrella che
    // torna dal login, ritorno.js deve consegnare il token e chiudersi
    // PRIMA che player.js monti un secondo player di Twitch dentro quella
    // finestrella (CONTRATTO-3 §3.4). Differito girerebbe troppo tardi.
    const script = [];
    const cerca = /<script\s+src="([^"]+)"([^>]*)>/g;
    let voce;
    while ((voce = cerca.exec(html)) !== null) { script.push({ src: voce[1], attributi: voce[2] }); }

    esigi(script.length > 0, 'nella pagina non c e nessuno script');
    esigiUguale(script[0].src, 'js/ritorno.js', 'il primo script della pagina');
    esigi(script[0].attributi.indexOf('defer') === -1, 'js/ritorno.js e differito, e non deve esserlo');

    // E gli altri restano dove erano: dati.js prima di tutti quelli che
    // leggono window.DATI, lurk.js prima di pollo.js (CONTRATTO-3 §5.3).
    const soloNostri = script.map((s) => s.src).filter((s) => s.indexOf('js/') === 0);
    esigiUguale(soloNostri.join(','), 'js/ritorno.js,js/dati.js,js/player.js,js/sito.js,js/lurk.js,js/pollo.js',
      'ordine degli script del sito');
  });

  await prova('con la modalita lurk spenta la sezione non viene stampata affatto', () => {
    const documento = archivio.leggi();
    documento.config.lurk.attivo = false;
    // anteprimaDi rende in memoria: il disco non si tocca, e nemmeno i
    // contenuti salvati, che restano quelli veri.
    const html = costruisci.anteprimaDi(documento);
    esigi(html.indexOf('id="lurk"') === -1, 'la sezione #lurk e stata stampata lo stesso');
    esigi(html.indexOf('lurk-comandi') === -1, '#lurk-comandi e rimasto in pagina');
    esigi(html.indexOf('lurk__') === -1, 'e rimasto qualcosa del pannello del lurk');
    // Il resto della pagina deve esserci: se sparisse tutto, questa prova
    // passerebbe per il motivo sbagliato.
    esigiDentro(html, 'id="diretta"', 'la sezione della diretta');
    esigiDentro(html, 'id="twitch-embed"', 'il posto del player');
    esigiUguale(archivio.leggi().config.lurk.attivo, true, 'i contenuti salvati sono stati toccati');
  });

  await prova('nessun foglio oltre tokens.css e tema.css contiene un esadecimale', () => {
    // CONTRATTO-2 §11: i colori stanno nei token, e i token li riscrive il
    // pannello. Un #hex in un foglio qualunque e un colore che il tema non
    // sa cambiare, e resta li anche col fondo chiaro.
    const cartella = path.join(RADICE_VERA, 'css');
    const fogli = fs.readdirSync(cartella).filter((f) => f.endsWith('.css') && f !== 'tokens.css' && f !== 'tema.css');
    esigi(fogli.indexOf('lurk.css') !== -1, 'css/lurk.css non c e');
    for (const foglio of fogli) {
      const css = fs.readFileSync(path.join(cartella, foglio), 'utf8');
      const trovati = css.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g) || [];
      esigi(trovati.length === 0, 'css/' + foglio + ' contiene ' + trovati.join(', '));
    }
  });

  await prova('il gruppo lurk sta fra diretta e pollo e usa solo tipi gia ammessi', () => {
    const ids = schema.gruppi.map((g) => g.id);
    const dove = ids.indexOf('lurk');
    esigi(dove !== -1, 'lo schema non ha il gruppo lurk');
    esigiUguale(ids[dove - 1], 'diretta', 'il gruppo che viene prima');
    esigiUguale(ids[dove + 1], 'pollo', 'il gruppo che viene dopo');
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
    // E il contrario: nessun campo del gruppo punta a una chiave che nei
    // contenuti non c e.
    const problemi = schema.verificaCopertura(contenutiVeri);
    esigi(problemi.length === 0, problemi.map((p) => p.messaggio).join(' | '));
  });

  await prova('gli stati del lurk sono di tipo testo, non ricco', () => {
    // Li scrive js/lurk.js con textContent: un campo «ricco» qui vorrebbe
    // dire vedere stampato in pagina «<b>Spenta.</b>». Stesso motivo per cui
    // deck.statoLive e saluti.copiaBtn sono rimasti testo.
    const stati = schema.campi().filter((c) => c.chiave.indexOf('lurk.stato') === 0);
    esigi(stati.length >= 7, 'attesi almeno sette stati, trovati ' + stati.length);
    for (const campo of stati) {
      esigiUguale(campo.tipo, 'testo', campo.chiave);
    }
    // Ricchi sono e restano solo i tre che il modello stampa con la tripla
    // graffa e che il JavaScript non legge mai.
    const ricchi = schema.campi().filter((c) => c.chiave.indexOf('lurk.') === 0 && c.tipo === 'ricco').map((c) => c.chiave);
    esigiUguale(ricchi.join(','), 'lurk.spiegazione,lurk.notaAccount,lurk.notaMobile', 'i campi ricchi del lurk');
  });

  await prova('le chiavi dell invio periodico non esistono, e non devono esistere', () => {
    // CONTRATTO-3 §0: il terzo blocco non si fa. Un campo che non c e e un
    // campo che nessuno accendera per sbaglio fra un anno.
    for (const nome of ['messaggioAutomatico', 'minutiFraMessaggi', 'messaggiMax']) {
      esigi(!schema.campo('config.lurk.' + nome), 'lo schema ha rimesso config.lurk.' + nome);
      esigi(!Object.prototype.hasOwnProperty.call(contenutiVeri.config.lurk, nome),
        'i contenuti hanno rimesso config.lurk.' + nome);
    }
  });
}

/* --- 8. API SU UN SERVER IN-PROCESS ---------------------------------- */

/** Piccolo client HTTP con barattolo dei biscotti. */
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

    // agent:false = niente keep-alive: cosi server.close() non resta appeso
    // ad aspettare socket inattivi alla fine delle prove.
    const req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: percorso, headers: intestazioni, agent: false }, (res) => {
      const pezzi = [];
      res.on('data', (p) => pezzi.push(p));
      res.on('end', () => {
        const grezzo = Buffer.concat(pezzi).toString('utf8');
        let dati = null;
        try { dati = JSON.parse(grezzo); } catch (e) { /* non tutte le risposte sono JSON */ }
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
  const PASSWORD = 'pollaio-viola-' + crypto.randomInt(1000, 9999);
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
      // Il conteggio non si scrive a mano: e lo schema a dire quanti gruppi
      // ci sono, e l ordine lo controlla gia la sezione 3.
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
      // Senza `predefinito` il bottone «ripristina i colori di partenza» non
      // saprebbe a cosa tornare.
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
      // Il conteggio non si scrive a mano: cambierebbe a ogni chiave aggiunta o tolta ai
      // contenuti, e a fallire sarebbe il test invece del codice. Il confronto e con il file.
      const suDisco = JSON.parse(fs.readFileSync(P.contenutiJson, 'utf8'));
      const attese = Object.keys(suDisco.testi).length;
      esigi(Object.keys(r.dati.testi).length === attese,
        'chiavi dei testi: ' + Object.keys(r.dati.testi).length + ', attese ' + attese);
      esigi('deck.titolo' in r.dati.testi, 'una chiave non passata nel PUT e sparita');
      esigiUguale(r.dati.config.social.length, 5, 'social');
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
      // Le modifiche si sovrappongono a quelle salvate: quello che il
      // pannello non manda deve restare al suo posto.
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
      // Anche da qui la polarita deve ribaltarsi: e l anteprima dal vivo dei
      // colori, e deve mostrare quello che si vedra davvero.
      esigiDentro(r.dati.css, '--linea: rgba(0, 0, 0', 'polarita chiara');
      esigiUguale(fs.readFileSync(P.temaCss, 'utf8'), prima, 'ha riscritto css/tema.css');
    });

    await prova('POST /api/tema con un tema a meta risponde lo stesso', async () => {
      // Il pannello chiama questa rotta mentre si sta ancora battendo il
      // colore: un 500 a meta di «#ab» spegnerebbe l anteprima dal vivo.
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
      // Le barre codificate non le normalizza nessuno prima di noi: e il
      // caso che deve fermare il nostro risolutore di percorsi.
      esigiUguale((await chiama(porta, 'GET', '/img/..%2f..%2fserver/dati/auth.json')).stato, 403, 'risalita con barre codificate');
      // Qui invece il parser degli URL ha gia sciolto i punti: quello che
      // arriva e /windows/win.ini, che semplicemente non esiste nella radice.
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

/* --- ESECUZIONE ------------------------------------------------------ */

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

    // Da qui in poi si lavora su una copia usa e getta del progetto: la
    // generazione e le API scrivono davvero, e non devono scrivere qui.
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
  } finally {
    percorsi.imposta(RADICE_VERA);
    try { fs.rmSync(temporanea, { recursive: true, force: true }); } catch (e) { /* su Windows a volte il file e ancora aperto */ }
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
