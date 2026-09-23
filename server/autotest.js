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
// Serve alla sezione 12: la porta, l'indirizzo e il fuso di un avvio da
// hosting si decidono al caricamento dei moduli, e per provarli davvero ci
// vuole un processo nuovo — figlio, non questo.
const { spawnSync } = require('node:child_process');

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
const twitch = require('./lib/twitch');
const chiavi = require('./lib/chiavi');
const youtube = require('./lib/youtube');
const schema = require('../contenuti/schema.js');

/* --- MINIMO INDISPENSABILE PER PROVARE ------------------------------ */

// La password del server di prova: la crea la sezione 8 al primo avvio, e la
// sezione 11 la usa per rientrare con un server suo.
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
    esigiUguale(convalida.convalidaCampo('config.account.clientId', '').length, 0, 'vuoto');
    esigiUguale(convalida.convalidaCampo('config.account.clientId', 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3').length, 0, 'trenta minuscole e cifre');

    // Il caso vero: il promemoria lasciato al posto del valore. Prima passava
    // la convalida e si schiantava soltanto sotto le mani di un visitatore,
    // con un 400 «invalid client» dal server di Twitch.
    for (const storto of ['DAxSOSTITUIRExCONxQUELLOxVERO', 'abc', 'k3j9x2q7w1 m5v8b4n6z0', 'K3J9X2Q7W1M5V8B4N6Z0C7T2Y5R8P3']) {
      esigi(convalida.convalidaCampo('config.account.clientId', storto).length === 1,
        'doveva essere rifiutato: ' + storto);
    }
  });

  /* I controlli d'insieme (server/lib/controlli.js). Non sono errori e non
     fermano niente: sono le cose che nessun campo, guardato da solo, puo
     dire — e che altrimenti si scoprono online, dal vivo. */

  await prova('controlli: il sito configurato per la produzione non segnala niente', () => {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.sitoUrl = 'https://slayerbeard.com/';
    documento.config.twitch.domini = ['slayerbeard.com'];
    documento.config.lurk.messaggioAttivo = true;
    documento.config.account.attivo = true;
    documento.config.account.clientId = 'k3j9x2q7w1m5v8b4n6z0c7t2y5r8p3';
    documento.config.account.urlRitorno = 'https://slayerbeard.com/';
    // Un sito in produzione con la vetrina accesa ha gia le sue clip: gliele
    // ha messe la pubblicazione. Senza questa riga scatterebbe l'avvertimento
    // «accesa ma vuota», che e giusto ma qui parlerebbe di un altro caso.
    documento.config.clip = Object.assign({}, documento.config.clip, {
      attivo: true,
      voci: [{ id: 'abc', titolo: 'Una clip', url: 'https://clips.twitch.tv/abc', anteprima: '', durataSec: 30, visualizzazioni: 10, creataIl: '', autore: '' }]
    });
    const avvertimenti = controlli.controlli(documento);
    esigiUguale(avvertimenti.length, 0,
      'avvertimenti inattesi: ' + avvertimenti.map((a) => a.chiave).join(', '));
  });

  await prova('controlli: la vetrina accesa e ancora vuota viene detta', () => {
    // E il caso che manda a cercare nel posto sbagliato: interruttore acceso,
    // parte presente nel pannello, e sul sito niente. Non e un guasto — la
    // vetrina si stampa solo con almeno una clip — ma senza una riga che lo
    // dica sembra esattamente un guasto.
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    documento.config.clip = Object.assign({}, documento.config.clip, { attivo: true, voci: [] });
    const avvertimenti = controlli.controlli(documento);
    esigi(avvertimenti.some((a) => a.chiave === 'config.clip.attivo'),
      'nessun avvertimento sulla vetrina accesa e vuota');

    // Spenta invece non si dice niente: e una scelta, non una dimenticanza.
    documento.config.clip.attivo = false;
    esigi(!controlli.controlli(documento).some((a) => a.chiave === 'config.clip.attivo'),
      'avvertimento sulla vetrina spenta, che non ha niente che non va');
  });

  await prova('controlli: senza indirizzo e senza domini il player viene detto', () => {
    // Con un indirizzo pubblico il dominio del player non manca mai: ce lo
    // mette la pubblicazione, host e www (CONTRATTO-6 §4.2, costruisci.js
    // oggettoDati). Il caso che resta da dire e quello di un sito senza
    // indirizzo e senza domini scritti: li il player parte solo da
    // localhost, e online sarebbe un rettangolo nero.
    const sbSito = process.env.SB_SITO;
    // Senza questo l'indirizzo arriverebbe dall'ambiente e la prova
    // diventerebbe rossa proprio sull'hosting, dove SB_SITO c'e per davvero
    // ed e il posto in cui il collaudo serve di piu.
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
    // CONTRATTO-6 §4.4: se l'indirizzo arriva dall'ambiente, «manca
    // l'indirizzo pubblico» non ha piu motivo di comparire — e nemmeno
    // quello sui domini del player, perche la pubblicazione ci mette l'host
    // da qualunque parte l'indirizzo arrivi.
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
    // La trappola vera: due valori leciti presi da soli, un login rotto per
    // tutti i visitatori quando stanno insieme.
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
    const atteso = ['meta', 'marchio', 'deck', 'diretta', 'account', 'lurk', 'pollo', 'clip', 'sondaggio', 'settimana', 'chi',
      'supporto', 'saluti', 'piede', 'musica', 'canale', 'aspetto'];
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
    // La prova che protegge il sito gia online. docs/HOSTING.md dice di NON
    // sovrascrivere contenuti.json quando arriva una versione nuova del
    // programma: quindi ogni campo aggiunto allo schema dopo quel giorno, su
    // quel file, non c'e. Senza «predefinito» la prima Pubblica fallirebbe
    // con «punta a una chiave che non esiste», e a fallire sarebbe il sito
    // vero di chi non ha fatto niente di male.
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

    // Senza completa(): la copertura non deve lamentarsi lo stesso, perche
    // un campo nuovo assente non e una chiave sparita.
    esigiUguale(schema.verificaCopertura(vecchio).length, 0, 'la copertura si lamenta di un contenuti.json di ieri');

    // Con completa(): le chiavi ci sono, col valore di partenza, e la
    // convalida passa — cioe la pubblicazione va a buon fine.
    const aggiunte = schema.completa(vecchio);
    esigiUguale(aggiunte.length, nuovi.length, 'quante chiavi sono nate');
    for (const campo of nuovi) {
      const esito = schema.valoreDi(vecchio, campo.chiave);
      esigi(esito.trovato, 'manca ancora ' + campo.chiave);
      // Per JSON: un predefinito a elenco arriva copiato, mai lo stesso oggetto.
      esigiUguale(JSON.stringify(esito.valore), JSON.stringify(campo.predefinito), 'valore di partenza di ' + campo.chiave);
    }
    esigiUguale(convalida.convalida(vecchio).length, 0, 'i valori di partenza non passano la convalida');
    // E una seconda passata non riscrive niente: chi ha gia scelto un suo
    // valore non deve vederselo rimettere a quello di serie a ogni lettura.
    vecchio.testi['clip.paginaTitolo'] = 'Le mie clip';
    esigiUguale(schema.completa(vecchio).length, 0, 'completa() ha rifatto il lavoro');
    esigiUguale(vecchio.testi['clip.paginaTitolo'], 'Le mie clip', 'completa() ha sovrascritto una scelta');
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
  /* Tre profili del sito, che sono i tre casi che contano: uno completo,
     uno con l interruttore spento e uno acceso ma senza app registrata.
     Gli ultimi due devono produrre lo stesso effetto sul messaggio in
     chat — spento — per strade diverse. */
  const profiloSano = { attivo: true, clientId: 'abcdef1234567890abcdef', urlRitorno: 'https://slayerbeard.com/' };
  const profiloSpento = { attivo: false, clientId: 'abcdef1234567890abcdef', urlRitorno: 'https://slayerbeard.com/' };
  const profiloSenzaClientId = { attivo: true, clientId: '', urlRitorno: 'https://slayerbeard.com/' };

  /** Mette lurk e account dentro una copia dei contenuti veri. */
  function documentoCon(lurk, account) {
    const documento = JSON.parse(JSON.stringify(contenutiVeri));
    if (lurk === undefined) { delete documento.config.lurk; } else { documento.config.lurk = lurk; }
    if (account === undefined) { delete documento.config.account; } else { documento.config.account = account; }
    return documento;
  }

  /**
   * Il ramo `lurk` di window.DATI calcolato su una config.lurk di prova.
   *
   * Il secondo argomento e la config.account. Dal rifacimento e il profilo
   * del sito ad accendere o spegnere il messaggio in chat, quindi va poter
   * variare; omesso vale `profiloSano`, cosi le prove che del profilo non
   * parlano restano leggibili. Passarlo `undefined` di proposito e un caso
   * diverso da non passarlo — vuol dire «il ramo account non c e» — e per
   * questo si guarda arguments.length invece di un valore di ripiego.
   */
  function ramo(lurk, account) {
    return costruisci.oggettoDati(documentoCon(lurk, arguments.length < 2 ? profiloSano : account)).lurk;
  }

  /** Il ramo `account`, sulla stessa strada e con la stessa regola. */
  function ramoAccount(account) {
    return costruisci.oggettoDati(documentoCon(sana(), arguments.length < 1 ? profiloSano : account)).account;
  }

  /** Una config.lurk sana, da sporcare un pezzo per volta. */
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
    // Client ID e indirizzo di ritorno stanno nel ramo account e SOLO li:
    // due copie dello stesso valore sono due cose che possono smettere di
    // essere d accordo, e quella sbagliata sarebbe quella che parla a Twitch.
    esigiUguale(lurk.messaggio.clientId, undefined, 'il lurk non deve avere un suo clientId');
    esigiUguale(lurk.messaggio.urlRitorno, undefined, 'il lurk non deve avere un suo urlRitorno');
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
      // entra / esci / collegato sono passati al ramo account: il login non
      // e piu una cosa del lurk. `chiuso` invece e nuova, e la dice la
      // diretta che finisce mentre il lurk e acceso.
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
    // `account.nota` e un campo ricco: in js/dati.js l HTML verrebbe
    // stampato invece che interpretato. Lo stampa il modello, con la
    // tripla graffa, e qui non deve arrivare affatto.
    esigiUguale(account.testi.nota, undefined, 'la nota ricca non deve entrare in js/dati.js');
  });

  await prova('il ramo account dice PERCHE e spento', () => {
    esigiUguale(ramoAccount().motivo, '', 'tutto a posto: nessun motivo');
    esigiUguale(ramoAccount(profiloSpento).motivo, 'spento', 'interruttore spento');
    esigiUguale(ramoAccount(profiloSenzaClientId).motivo, 'senzaClientId', 'client id mancante');
    // L ordine e lo stesso del lurk: il primo ostacolo e l interruttore.
    esigiUguale(ramoAccount({ attivo: false, clientId: '' }).motivo, 'spento',
      'con tutto spento si nomina l interruttore per primo');
  });

  await prova('il ramo dice PERCHE il messaggio e spento, non solo che lo e', () => {
    // Dal browser i tre casi sono indistinguibili — a valle producono lo
    // stesso oggetto vuoto — e senza questo campo il sito puo solo tacere,
    // che e esattamente il modo di far perdere un pomeriggio a chi prova.
    esigiUguale(ramo(sana()).messaggio.motivo, '', 'tutto a posto: nessun motivo');
    esigiUguale(ramo(sana({ messaggioAttivo: false })).messaggio.motivo, 'spento', 'interruttore spento');
    esigiUguale(ramo(sana(), profiloSpento).messaggio.motivo, 'senzaAccount', 'profilo del sito spento');
    esigiUguale(ramo(sana(), profiloSenzaClientId).messaggio.motivo, 'senzaAccount', 'profilo senza Client ID');
    esigiUguale(ramo(sana({ frasi: [] })).messaggio.motivo, 'senzaFrasi', 'nessuna frase');
    // L ordine conta: se manca tutto, il primo ostacolo e l interruttore.
    esigiUguale(ramo(sana({ messaggioAttivo: false }), profiloSpento).messaggio.motivo, 'spento',
      'con tutto spento si nomina l interruttore per primo');
  });

  await prova('senza profilo del sito il messaggio resta spento, anche con l interruttore acceso', () => {
    // E l invariante che tiene fermo l OAuth su un sito pubblicato da chi non
    // ha registrato nessuna app: senza app non c e niente da interrogare, e
    // il bottone sarebbe un bottone che fallisce. Da quando il login e del
    // sito e non del lurk, l app che manca e quella del PROFILO — ma la
    // conseguenza sul messaggio in chat deve essere rimasta identica.
    esigiUguale(ramo(sana(), profiloSpento).messaggio.attivo, false, 'profilo spento');
    esigiUguale(ramo(sana(), profiloSenzaClientId).messaggio.attivo, false, 'client id vuoto');
    esigiUguale(ramo(sana(), { attivo: true, clientId: '   ' }).messaggio.attivo, false, 'client id di soli spazi');
    esigiUguale(ramo(sana(), {}).messaggio.attivo, false, 'ramo config.account vuoto');
    esigiUguale(ramo(sana(), undefined).messaggio.attivo, false, 'ramo config.account mancante');
    // E il contrario: un Client ID scritto nel posto sbagliato — dentro il
    // lurk, dov era prima — non deve accendere niente.
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
    // Il Client ID sta di la, nel ramo che lo possiede.
    esigiUguale(ramoAccount().clientId, 'abcdef1234567890abcdef', 'client id nel ramo account');
    esigiUguale(ramoAccount().urlRitorno, 'https://slayerbeard.com/', 'url di ritorno nel ramo account');
    // Con l interruttore spento non basta avere tutto il resto in ordine.
    esigiUguale(ramo(sana({ messaggioAttivo: false })).messaggio.attivo, false, 'interruttore spento');
  });

  await prova('col messaggio spento le frasi non escono affatto', () => {
    // Le frasi di un messaggio che non partira sono testo pubblicato per
    // niente: stanno nel sorgente della pagina e non le legge nessuno.
    for (const storta of [{ messaggioAttivo: false }, { frasi: [] }, { messaggioAttivo: 'si' }]) {
      const lurk = ramo(sana(storta));
      esigiUguale(lurk.messaggio.attivo, false, 'atteso spento con ' + JSON.stringify(storta));
      esigiUguale(lurk.messaggio.frasi.length, 0, 'frasi con ' + JSON.stringify(storta));
    }
  });

  await prova('col profilo spento il Client ID non esce affatto', () => {
    // Non deve finire in pagina il Client ID di un app che non si usa: e un
    // dato pubblico per natura, ma stamparlo lo stesso vuol dire pubblicare
    // un app registrata a nome di qualcuno senza che serva a niente.
    for (const storto of [profiloSpento, { attivo: 'si', clientId: 'abcdef1234567890abcdef' }, {}]) {
      const account = ramoAccount(storto);
      esigiUguale(account.attivo, false, 'atteso spento con ' + JSON.stringify(storto));
      esigiUguale(account.clientId, '', 'client id con ' + JSON.stringify(storto));
      esigiUguale(account.urlRitorno, '', 'url di ritorno con ' + JSON.stringify(storto));
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

  await prova('minutiFraMessaggi viene riportato dentro 2..120, di serie 10', () => {
    // Il messaggio in chat si ripete a lurk acceso (CONTRATTO-3 §4.1): sotto i
    // due minuti finirebbe addosso al freno di un invio al minuto.
    const casi = [[0, 2], [-5, 2], [2, 2], [10, 10], [120, 120], [999, 120], [7.6, 8]];
    for (const [dato, atteso] of casi) {
      esigiUguale(ramo(sana({ minutiFraMessaggi: dato })).messaggio.minuti, atteso, 'minuti ' + JSON.stringify(dato));
    }
    esigiUguale(ramo(sana()).messaggio.minuti, 10, 'chiave mancante');
    esigiUguale(ramo(undefined).messaggio.minuti, 10, 'ramo config.lurk mancante');
    esigiUguale(ramo(sana({ minutiFraMessaggi: 'dieci' })).messaggio.minuti, 10, 'parola al posto del numero');
    // Un contenuti.json già online non ha la chiave: completa() la mette col
    // predefinito, così la prima Pubblica non fallisce.
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
    // La coda e una catena di iscrizioni e l ordine non e decorativo:
    // account.js pubblica window.Account, canale.js e lurk.js ci si
    // iscrivono, e pollo.js si iscrive a window.Lurk — che deve gia esistere.
    const soloNostri = script.map((s) => s.src).filter((s) => s.indexOf('js/') === 0);
    // js/musica.js c e solo con il lettore acceso, e quando c e sta in fondo:
    // non si iscrive a nessuno, e chi lo ascolta non esiste ancora.
    const facoltativi = ['js/musica.js'];
    const fissi = soloNostri.filter((s) => facoltativi.indexOf(s) === -1);
    const coda = soloNostri.slice(fissi.length);
    esigi(coda.every((s) => facoltativi.indexOf(s) > -1),
      'gli script facoltativi non stanno in fondo: ' + soloNostri.join(','));
    esigiUguale(fissi.join(','),
      'js/ritorno.js,js/dati.js,js/player.js,js/sito.js,js/account.js,js/canale.js,js/lurk.js,js/pollo.js,js/cima.js,js/sondaggio.js',
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

  await prova('chiavi superate: un contenuti.json che ha ancora lo Spotify sul disco non blocca la pubblicazione', () => {
    const documento = archivio.leggi();
    documento.testi['spotify.titolo'] = 'In sottofondo';
    documento.testi['spotify.ascolta'] = 'Sta ascoltando';
    documento.testi['spotify.passa'] = 'Passa';
    documento.testi['spotify.nascondi'] = 'Riduci';
    documento.testi['spotify.mostra'] = 'Apri';
    documento.config.spotify = { attivo: true, segui: false, clientId: 'a'.repeat(32), link: 'https://open.spotify.com/x', formato: 'compatto', aperto: true };

    // Prima: sono undici chiavi che nessun campo dello schema descrive.
    const prima = schema.verificaCopertura(documento).filter((p) => p.tipo === 'scoperta');
    esigiUguale(prima.length, 11, 'chiavi scoperte attese');

    // Dopo completa() — cioe quello che fa archivio.leggi() — non ce n e piu
    // nessuna, e il resto dei contenuti non e stato toccato.
    schema.completa(documento);
    esigiUguale(schema.verificaCopertura(documento).filter((p) => p.tipo === 'scoperta').length, 0, 'chiavi scoperte dopo la pulizia');
    esigiUguale(convalida.convalida(documento).length, 0, 'la convalida deve passare');
    esigi(documento.config.spotify === undefined, 'config.spotify e rimasto');
    esigi(documento.testi['spotify.titolo'] === undefined, 'spotify.titolo e rimasto');
    esigiDentro(JSON.stringify(Object.keys(documento.testi)), 'meta.titolo', 'gli altri testi devono restare');
    esigi(typeof documento.config.email === 'string' && documento.config.email !== '', 'la email e sparita');
  });

  await prova('referral: spento non c e, acceso porta il riquadro col rel giusto, e senza link resta spento', () => {
    const documento = archivio.leggi();
    documento.config.referral.attivo = false;
    documento.config.referral.url = 'https://www.amazon.it/?tag=prova-21';
    const spento = costruisci.anteprimaDi(documento);
    esigi(spento.indexOf('class="referral"') === -1, 'il riquadro e stato stampato lo stesso');
    esigi(spento.indexOf('tag=prova-21') === -1, 'il link e finito in pagina col riquadro spento');

    // Acceso ma senza link non ha niente da fare: resta spento.
    documento.config.referral.attivo = true;
    documento.config.referral.url = '';
    esigi(costruisci.anteprimaDi(documento).indexOf('class="referral"') === -1, 'acceso senza link non deve comparire');

    documento.config.referral.url = 'https://www.amazon.it/?tag=prova-21';
    const acceso = costruisci.anteprimaDi(documento);
    esigiDentro(acceso, 'class="referral"', 'il riquadro in pagina');
    esigiDentro(acceso, 'tag=prova-21', 'il link');
    // sponsored e quello che Google chiede per i link di affiliazione, noopener
    // e la regola di sempre per target="_blank".
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

    // Di serie si arriva col lettore ridotto a bottone tondo: la musica la
    // sceglie chi visita. L'interruttore del pannello ribalta la cosa.
    documento.config.musica.aperto = false;
    esigiDentro(costruisci.anteprimaDi(documento), 'data-aperto="0"', 'ridotto alla prima visita');
    documento.config.musica.aperto = true;
    esigiDentro(costruisci.anteprimaDi(documento), 'data-aperto="1"', 'aperto alla prima visita');

    // I contenuti veri non sono stati toccati: anteprimaDi rende in memoria.
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

    // Spenta, in js/dati.js non finisce nessuna traccia: la pagina non deve
    // nemmeno sapere che esistono.
    documento.config.musica.attivo = false;
    esigiUguale(costruisci.oggettoDati(documento, {}).musica.tracce.length, 0, 'spenta non si pubblica nessuna traccia');
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

  await prova('il gruppo lurk sta fra account e pollo e usa solo tipi gia ammessi', () => {
    // Il CONTRATTO-3 §6.3 diceva «fra diretta e pollo». Fra i due si e
    // infilato «account», che e nato dopo e che il lurk consuma: l ordine
    // della pagina e rimasto quello, il login sta in cima alla diretta.
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

  await prova('dell invio periodico esiste solo la cadenza: niente interruttore, niente tetto', () => {
    // CONTRATTO-3 §4.1: il messaggio si ripete a lurk acceso, e dal pannello
    // si sceglie soltanto ogni quanti minuti (minutiFraMessaggi, provata qui
    // sopra). Un interruttore a parte o un tetto di messaggi restano fuori:
    // un campo che non c e e un campo che nessuno accendera per sbaglio.
    for (const nome of ['messaggioAutomatico', 'messaggiMax']) {
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

/* --- 9. COLLEGAMENTO CON TWITCH -------------------------------------- */

/*
   server/lib/twitch.js e l unico punto in cui il server locale chiama
   Twitch, e serve a una cosa sola: aggiornare «Ultima diretta» alla
   pubblicazione, cosi il campo resta fresco anche per chi visita il sito
   senza collegare nessun account.

   Qui NON si chiama la rete. Tutte le prove si fermano prima — sul file
   delle credenziali assente, rotto o incompleto, e sull ID del canale che
   manca — perche l invariante che conta e proprio quella: qualunque cosa
   vada storta, la pubblicazione va avanti e il titolo che c era non si
   perde. Un collaudo che dipendesse da Twitch sarebbe rosso il giorno in
   cui Twitch e giu, cioe esattamente il giorno in cui questo file deve
   dimostrare di reggere.
*/
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
      esigiUguale(pulite.map((v) => v.id).join(','), 'regia,diretta,sondaggio,settimana,chi,supporto,saluti', 'ordine');
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

async function proveTwitch(costruisci, archivio) {
  apriSezione('9. Collegamento con Twitch (server/lib/twitch.js)');

  // Le chiavi stanno in un file solo, e quel file e JavaScript: si scrive
  // col compositore vero (chiavi.componi) invece che a mano, cosi la prova
  // esercita anche quello. Una stringa passa dritta: serve ai casi rotti.
  const scriviCredenziali = (dati) => {
    fs.mkdirSync(path.dirname(P.chiavi), { recursive: true });
    const testo = typeof dati === 'string' ? dati : chiavi.componi({ twitch: dati });
    fs.writeFileSync(P.chiavi, testo);
  };
  const togliCredenziali = () => { try { fs.unlinkSync(P.chiavi); } catch (e) { /* gia sparito */ } };
  const titoloSalvato = () => archivio.leggi().config.ultimaDiretta;

  await prova('senza il file delle credenziali il collegamento e semplicemente spento', async () => {
    togliCredenziali();
    esigiUguale(twitch.configurato(), false, 'configurato()');
    esigiUguale(twitch.credenziali(), null, 'credenziali()');

    // E la condizione normale di chi quel campo lo scrive a mano: non e un
    // errore, non stampa niente e non tocca i contenuti.
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
    // File assente e file rotto sono due cose diverse: nel secondo caso
    // qualcuno ha provato a configurarlo, e trattarlo come «non c e»
    // vorrebbe dire lasciarlo a chiedersi perche non funziona.
    scriviCredenziali('module.exports = { questo non e javascript');
    esigiErrore(() => twitch.credenziali(), 'non si legge', 'credenziali() su file rotto');
    // configurato() invece non lancia mai: e una domanda, non un ordine.
    esigiUguale(twitch.configurato(), false, 'configurato() su file rotto');

    const prima = titoloSalvato();
    const esito = await twitch.aggiornaUltimaDiretta();
    esigiUguale(esito.stato, 'fallito', 'stato');
    esigiUguale(titoloSalvato(), prima, 'ha toccato ultimaDiretta e non doveva');
    togliCredenziali();
  });

  await prova('un file che esporta la cosa sbagliata viene detto', () => {
    // Un .js si esegue, quindi puo esportare qualunque cosa: un elenco, un
    // numero, niente. Si controlla la forma invece di fidarsi, altrimenti
    // l errore salterebbe fuori tre funzioni piu in la, senza dire dove.
    for (const storto of ['module.exports = [1, 2, 3];', 'module.exports = 42;', 'module.exports = null;']) {
      scriviCredenziali(storto);
      esigiErrore(() => chiavi.leggi(), 'non esporta un oggetto', 'leggi() con ' + storto);
    }
    // Un oggetto senza il ramo twitch invece e legittimo: vuol dire che le
    // chiavi non ci sono ancora, non che il file e sbagliato.
    scriviCredenziali('module.exports = {};');
    esigiUguale(chiavi.leggi().twitch.clientId, '', 'oggetto vuoto: nessun client id');
    esigiUguale(twitch.credenziali(), null, 'oggetto vuoto: nessuna credenziale');
    togliCredenziali();
  });

  await prova('chi cambia le chiavi non deve riavviare il server', () => {
    // require tiene in cache i moduli gia caricati: senza buttarla, chi
    // modifica chiavi.js mentre il server gira continuerebbe a vedere il
    // valore vecchio finche non lo riavvia — e non capirebbe perche.
    scriviCredenziali({ clientId: 'primoclientid1234567890abc', clientSecret: 'unsegretolungoabbastanza' });
    esigiUguale(chiavi.clientId(), 'primoclientid1234567890abc', 'prima lettura');
    scriviCredenziali({ clientId: 'secondoclientid234567890ab', clientSecret: 'unsegretolungoabbastanza' });
    esigiUguale(chiavi.clientId(), 'secondoclientid234567890ab', 'dopo la modifica, senza riavviare');
    togliCredenziali();
  });

  await prova('il Client ID va da chiavi.js fino dentro i contenuti', () => {
    // E il passaggio che fa di chiavi.js l unica sorgente: nel pannello il
    // campo resta, ma non e piu una cosa da scrivere due volte.
    const documento = archivio.leggi();
    const originale = documento.config.account.clientId;
    try {
      scriviCredenziali({ clientId: 'dalfilechiavi1234567890abc', clientSecret: 'unsegretolungoabbastanza' });
      esigiUguale(chiavi.sincronizzaClientId().stato, 'copiato', 'primo giro');
      esigiUguale(archivio.leggi().config.account.clientId, 'dalfilechiavi1234567890abc', 'valore nei contenuti');

      // Due giri di fila non riscrivono contenuti.json per niente.
      esigiUguale(chiavi.sincronizzaClientId().stato, 'invariato', 'secondo giro');

      // Senza file non si svuota niente: chi non usa chiavi.js non deve
      // accorgersi che esiste.
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
    // Le forme impreviste non devono far cadere una pubblicazione riuscita.
    for (const storto of [null, undefined, {}, { stato: 'inventato' }]) {
      esigiUguale(twitch.racconta(storto), '', 'racconta(' + JSON.stringify(storto) + ')');
    }
  });

  await prova('il totale dei follower si legge dalla risposta, e null e «non lo so»', () => {
    // Con un app token helix/channels/followers da la lista vuota ma il
    // totale pieno: e il totale l unica cosa che si legge. Zero e un
    // numero (un canale senza follower), null e una risposta senza numero.
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

    // Senza credenziali: spento, e i contenuti non si toccano.
    togliCredenziali();
    let esito = await twitch.aggiornaFollower();
    esigiUguale(esito.stato, 'spento', 'senza credenziali');
    esigiUguale(followerSalvati(), prima, 'ha toccato i follower senza credenziali');

    // File rotto: fallito, detto, e i contenuti non si toccano.
    scriviCredenziali('module.exports = { questo non e javascript');
    esito = await twitch.aggiornaFollower();
    esigiUguale(esito.stato, 'fallito', 'file rotto');
    esigiUguale(followerSalvati(), prima, 'ha toccato i follower con il file rotto');
    togliCredenziali();

    // Senza ID del canale non parte nessuna richiesta.
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
    // Stesse regole del resto del file: senza credenziali non si chiede
    // niente, e quello che si legge non entra MAI nei contenuti — sta in
    // server/dati/twitch-diretta.json, che non e roba di chi amministra.
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

    // direttaSalvata() legge un file di servizio: se non c e, o e storto, la
    // risposta e null e la pubblicazione va avanti come sempre.
    try { fs.unlinkSync(P.direttaTwitch); } catch (e) { /* gia sparito */ }
    esigiUguale(twitch.direttaSalvata(), null, 'senza file');
    fs.mkdirSync(path.dirname(P.direttaTwitch), { recursive: true });
    fs.writeFileSync(P.direttaTwitch, '{ non e json');
    esigiUguale(twitch.direttaSalvata(), null, 'file storto');
    twitch.salvaDiretta({ categoria: 'Elden Ring', inOnda: true, letteIl: '2026-09-20T10:00:00.000Z' });
    esigiUguale(JSON.stringify(twitch.direttaSalvata()),
      JSON.stringify({ categoria: 'Elden Ring', inOnda: true, letteIl: '2026-09-20T10:00:00.000Z' }), 'lettura salvata');
    try { fs.unlinkSync(P.direttaTwitch); } catch (e) { /* gia sparito */ }
  });

  await prova('le frasi del pollo in «Chi sono» portano solo le emote che usano, con un indirizzo di Twitch', () => {
    // elencoEmote(): nome e id puliti, e un id che non ha la forma di Twitch
    // non entra (finirebbe dentro un indirizzo).
    const elenco = twitch.elencoEmote({ data: [
      { id: '123', name: 'slayer156Love', format: ['static', 'animated'] },
      { id: '25', name: 'Kappa', format: ['static'] },
      { id: '../x', name: 'Cattiva', format: ['static'] },
      { id: '9', name: 'NonUsata', format: ['static'] }
    ] });
    esigiUguale(JSON.stringify(Object.keys(elenco)), JSON.stringify(['slayer156Love', 'Kappa', 'NonUsata']), 'emote tenute');

    let primaDelFile = null;
    try { primaDelFile = fs.readFileSync(P.emoteTwitch, 'utf8'); } catch (e) { /* non c era */ }
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

      // Senza il file le frasi restano testo, e non si rompe niente.
      fs.unlinkSync(P.emoteTwitch);
      esigiUguale(JSON.stringify(costruisci.oggettoDati(documento, {}).chi.emote), '{}', 'senza file');
    } finally {
      if (primaDelFile !== null) { fs.writeFileSync(P.emoteTwitch, primaDelFile); }
      else { try { fs.unlinkSync(P.emoteTwitch); } catch (e) { /* gia sparito */ } }
    }

    for (const stato of ['spento', 'senzaCanale', 'aggiornato', 'fallito']) {
      const riga = twitch.raccontaEmote({ stato: stato, delCanale: 5, globali: 100, motivo: 'un motivo' });
      esigi(typeof riga === 'string' && riga.length > 0, 'nessuna riga per lo stato ' + stato);
    }
    esigiUguale(twitch.raccontaEmote({ stato: 'spento', motivo: 'senzaFrasi' }), '', 'senza frasi si tace');
  });

  await prova('il numero dei follower stampato in pagina e quello dei contenuti, con il punto delle migliaia', () => {
    // Il valore non si scrive piu a mano in due posti (deck.dato1Valore e
    // chi.dato1Valore non esistono piu): la pagina lo prende da
    // config.dati.follower, in copertina. In «Chi sono» c era un secondo
    // nodo, sparito insieme ai tre numeri della sezione.
    const documento = archivio.leggi();
    const originale = documento.config.dati.follower;
    try {
      documento.config.dati.follower = 1234567;
      archivio.salva(documento);
      const reso = costruisci.rendi(archivio.leggi());
      // Due: la copertina e la voce Twitch dei social, che ha il contatore.
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
    // E la domanda che si fa chi guarda «Ultima diretta» ferma da una
    // settimana: il server deve dirlo all avvio invece di tacere, e non
    // deve mettersi a chiedere niente a nessuno.
    togliCredenziali();
    const { aggiornamentoAutomatico } = require('./server.js');
    esigiUguale(aggiornamentoAutomatico({ guarda: false }), null, 'ha avviato un timer senza credenziali');
  });

  await prova('il client secret non finisce mai nei file generati', () => {
    // L invariante che giustifica l intera deroga del CONTRATTO-3 §4.6: il
    // secret vive sul computer di chi amministra e in nessun altro posto.
    // Quello che va in pagina e solo il Client ID del profilo, che e
    // pubblico per natura.
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
    // Si guarda il .gitignore VERO, non quello della copia di lavoro: la
    // riga che protegge il secret e nel repository, ed e li che deve
    // restare anche fra sei mesi.
    const ignorati = fs.readFileSync(path.join(RADICE_VERA, '.gitignore'), 'utf8');
    esigiDentro(ignorati, 'server/dati/chiavi.js', 'il .gitignore non esclude il file delle chiavi');
    esigiDentro(ignorati, 'server/dati/auth.json', 'il .gitignore non esclude piu la password del pannello');

    // Il modello invece ci deve stare: e la spiegazione di cosa mettere
    // dentro, e senza quella il file delle chiavi e due stringhe vuote.
    const modello = path.join(RADICE_VERA, 'server', 'modelli', 'chiavi.esempio.js');
    esigi(fs.existsSync(modello), 'manca server/modelli/chiavi.esempio.js');
    const testoModello = fs.readFileSync(modello, 'utf8');
    esigiDentro(testoModello, 'clientId', 'il modello non nomina clientId');
    esigiDentro(testoModello, 'clientSecret', 'il modello non nomina clientSecret');
    // E dev essere vuoto: un modello con dentro una chiave vera sarebbe una
    // chiave vera nel repository.
    const caricato = require(modello);
    esigiUguale(caricato.twitch.clientId, '', 'il modello ha un Client ID dentro');
    esigiUguale(caricato.twitch.clientSecret, '', 'il modello ha un secret dentro');
  });

  /* --- Follower e abbonati --------------------------------------------- */

  const scriviAccesso = (testo) => {
    fs.mkdirSync(path.dirname(P.accessoTwitch), { recursive: true });
    fs.writeFileSync(P.accessoTwitch, testo);
  };
  const togliAccesso = () => { try { fs.unlinkSync(P.accessoTwitch); } catch (e) { /* gia sparito */ } };

  await prova('i numeri si scrivono all italiana, e si riconosce un numero nudo', () => {
    esigiUguale(twitch.formattaNumero(90), '90', '90');
    // it-IT di Intl non separa sotto le 10.000: e il motivo per cui e scritto a mano.
    esigiUguale(twitch.formattaNumero(3624), '3.624', '3624');
    esigiUguale(twitch.formattaNumero(1234567), '1.234.567', '1234567');
    for (const si of ['3.619', '90', ' 3624 ', '1.234.567']) { esigi(twitch.eNumeroNudo(si), si + ' e un numero nudo'); }
    for (const no of ['~25', '3,6K', '3.6', '', 'tanti', '12.34', null]) { esigi(!twitch.eNumeroNudo(no), JSON.stringify(no) + ' non e un numero nudo'); }
  });

  await prova('i numeri riscrivono solo le caselle che contengono un numero', () => {
    // Oggi nessuna casella mostra un numero (CAMPI_NUMERI e vuoto): il
    // meccanismo si prova con una casella finta, rimessa a posto alla fine.
    const prima = twitch.CAMPI_NUMERI.abbonati;
    twitch.CAMPI_NUMERI.abbonati = ['chi.dato2Valore'];
    try {
    const documento = {
      testi: { 'chi.dato2Valore': '90' },
      config: { dati: { follower: 3619, abbonati: 90 } }
    };
    const cambiate = twitch.applicaNumeri(documento, { follower: 3624, abbonati: 96 });
    // I follower non passano da una casella: la pagina li stampa da qui.
    esigiUguale(documento.config.dati.follower, 3624, 'config.dati.follower');
    esigiUguale(documento.testi['chi.dato2Valore'], '96', 'la casella col numero');
    esigiUguale(documento.config.dati.abbonati, 96, 'config.dati.abbonati');
    esigiUguale(cambiate.join(','), 'config.dati.follower,config.dati.abbonati,chi.dato2Valore', 'chiavi cambiate');
    // Due giri di fila non cambiano niente la seconda volta.
    esigiUguale(twitch.applicaNumeri(documento, { follower: 3624, abbonati: 96 }).length, 0, 'secondo giro');
    // Abbonati non letti: non si svuota niente.
    esigiUguale(twitch.applicaNumeri(documento, { follower: 3624, abbonati: null }).length, 0, 'abbonati non letti');
    esigiUguale(documento.testi['chi.dato2Valore'], '96', 'la casella resta');
    // Chi ha scritto «3,6K» nel pannello l ha fatto apposta.
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

      // Un file rotto si dice, come per chiavi.js.
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

/* --- 10. LA VETRINA DELLE CLIP --------------------------------------- */

/*
   La vetrina e interamente statica: nessun id e contratto con nessun
   JavaScript, e senza JS funziona per intero. Quello che va tenuto fermo
   e quindi tutto in generazione — chi decide se stampare, quante, e come
   si formattano i numeri — piu una cosa che non si vede e che si rompe in
   silenzio: gli host delle anteprime devono essere gli stessi nel modulo
   che le filtra e nella Content-Security-Policy che le lascia passare.
*/
async function proveClip(contenutiVeri, costruisci, archivio) {
  apriSezione('10. La vetrina delle clip');

  const clipFinta = (aggiunte) => Object.assign({
    id: 'abc', titolo: 'Una clip', url: 'https://clips.twitch.tv/abc',
    anteprima: 'https://clips-media-assets2.twitch.tv/abc-preview-480x272.jpg',
    durataSec: 32, visualizzazioni: 1234, creataIl: '2026-08-03T20:11:00Z', autore: 'Qualcuno'
  }, aggiunte || {});

  /** Il ramo clip del contesto, su una config.clip di prova. */
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
    // Gli interruttori si confrontano con true, come dappertutto.
    esigiUguale(ramo(accesa({ attivo: 'si' })).attivo, false, 'la stringa non accende niente');
  });

  await prova('una clip senza indirizzo o senza titolo viene scartata', () => {
    // Sono le due cose senza cui la card sarebbe un rettangolo muto che non
    // porta da nessuna parte. Il resto e tutto facoltativo.
    const voci = [clipFinta(), clipFinta({ url: '' }), clipFinta({ titolo: '   ' }), clipFinta({ titolo: 'Buona' })];
    const fuori = ramo(accesa({ voci: voci })).voci;
    esigiUguale(fuori.length, 2, 'clip rimaste');
    esigiUguale(fuori.map((v) => v.titolo).join('|'), 'Una clip|Buona', 'quali sono rimaste');
  });

  await prova('senza anteprima e senza autore la card resta, ma senza quei pezzi', () => {
    const solo = ramo(accesa({ voci: [clipFinta({ anteprima: '', autore: '', creataIl: '' })] })).voci[0];
    esigiUguale(solo.anteprima, '', 'anteprima');
    esigiUguale(solo.autore, '', 'autore');
    // La firma e gia decisa qui: il modello non sa fare «se c e l autore».
    esigiUguale(solo.firma, '', 'firma');
    esigiUguale(solo.quando, '', 'data illeggibile');
    esigi(!!solo.titolo && !!solo.url, 'la card e sopravvissuta');
  });

  await prova('«quante» vale anche in resa, non solo alla richiesta', () => {
    // Chi abbassa il numero dal pannello si aspetta di vederne meno subito,
    // senza dover ripescare le clip da Twitch.
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

    // Il punto delle migliaia si scrive a mano, senza toLocaleString: una
    // build di Node senza dati ICU stamperebbe «1,234» e nessuno se ne
    // accorgerebbe finche non lo legge un italiano.
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
    // E nemmeno il bottone che ci porterebbe: un'ancora verso un id che non
    // c'e porta in cima alla pagina, e chi la usa non capisce perche.
    esigi(html.indexOf('clip__vai') === -1, 'il bottone per la vetrina e in pagina senza la vetrina');
  });

  await prova('alla pagina delle clip porta solo l invito, non un bottone in testa alla diretta', () => {
    // In testa alla diretta c'era un secondo bottone, «I momenti migliori»,
    // che ripeteva l'invito «Migliori highlights» poco sotto: e stato tolto.
    const documento = archivio.leggi();
    documento.config.clip = accesa({ archivio: [clipFinta()] });
    const html = costruisci.anteprimaDi(documento);

    const diretta = html.slice(html.indexOf('id="diretta"'), html.indexOf('id="settimana"'));
    esigiUguale((diretta.match(/href="clip\.html"/g) || []).length, 1, 'quanti link alla pagina delle clip nella diretta');
    esigi(diretta.indexOf('class="clip__vai" href="clip.html"') === -1, 'il bottone in testa alla diretta e tornato');
    // L'ancora resta dov'era: un indirizzo gia condiviso deve continuare a
    // portare dove portava.
    esigiUguale((html.match(/id="clip"/g) || []).length, 1, 'quanti bersagli #clip');
    // In fondo alla diretta, l'invito con il suo bottone.
    esigiDentro(html, 'class="clip__vai clip__vai--invito" href="clip.html"', 'manca il bottone dell invito');
    esigiDentro(html, '>' + documento.testi['clip.invitoBottone'] + '<', 'manca la scritta del bottone dell invito');
  });

  await prova('senza clip da mostrare non si promette nessuna pagina', () => {
    // Un bottone che porta a un file che la pubblicazione non ha scritto
    // sarebbe un 404 promesso in prima pagina.
    const documento = archivio.leggi();
    documento.config.clip = accesa({ voci: [], archivio: [] });
    const html = costruisci.anteprimaDi(documento);
    esigi(html.indexOf('clip.html') === -1, 'la home promette una pagina che non esiste');
  });

  await prova('la pagina delle clip: una card per clip, con la sua data addosso', () => {
    // E il contratto con js/clip.js: il filtro dei periodi lavora su
    // data-quando, e senza quella data una clip resterebbe in pagina
    // qualunque bottone si prema.
    const tre = [
      clipFinta({ id: 'a', creataIl: '2026-08-03T20:11:00Z' }),
      clipFinta({ id: 'b', creataIl: '2026-08-04T20:11:00Z' }),
      // Senza una data leggibile non si puo collocare in nessun periodo.
      clipFinta({ id: 'c', creataIl: 'ieri' })
    ];
    const pagina = costruisci.clipPaginaDi({ clip: accesa({ archivio: tre, quanteArchivio: 20 }) }, contenutiVeri.testi);
    esigiUguale(pagina.attivo, true, 'la pagina e accesa');
    esigiUguale(pagina.voci.length, 2, 'la clip senza data buona resta fuori');
    esigiUguale(pagina.voci[0].iso, '2026-08-03T20:11:00.000Z', 'la data in ISO per il filtro');
    esigiUguale(pagina.quante, 20, 'il tetto per periodo arriva alla pagina');
    // Il tetto sta fra 4 e 50 comunque lo si scriva.
    esigiUguale(costruisci.clipPaginaDi({ clip: accesa({ archivio: tre, quanteArchivio: 999 }) }, contenutiVeri.testi).quante, 50, 'tetto massimo');
    esigiUguale(costruisci.clipPaginaDi({ clip: accesa({ archivio: tre }) }, contenutiVeri.testi).quante, 12, 'tetto di serie');
  });

  await prova('in home solo l invito: le card stanno nella pagina delle clip, e i valori arrivano protetti', () => {
    // Il proprietario non vuole clip in prima pagina: in home c e l invito
    // («Migliori highlights», una riga, «Vai alle clip») e le card sono
    // tutte in clip.html.
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
    // Il titolo di una clip lo scrive chi la ritaglia: e testo di terzi, e
    // deve arrivare in pagina protetto, non interpretato.
    esigiDentro(pagina, 'Titolo con &amp; e &lt;b&gt;', 'il titolo non e stato protetto');
    esigi(pagina.indexOf('<b>Titolo') === -1, 'il titolo e arrivato in pagina come markup');
    esigiDentro(pagina, '0:32', 'manca la durata');
  });

  await prova('la vetrina non porta nessuna voce nuova nel binario', () => {
    // css/base.css e tarato perche SEI etichette ci stiano a 320px: la
    // settima le farebbe traboccare, e le clip stanno dentro «diretta»
    // proprio per non chiederla. Se un domani qualcuno aggiunge la voce,
    // questa prova glielo ricorda prima che lo scopra un telefono.
    const documento = archivio.leggi();
    documento.config.clip = accesa({ archivio: [clipFinta()] });
    const html = costruisci.anteprimaDi(documento);
    const nav = html.slice(html.indexOf('binario__nav'), html.indexOf('binario__stato'));
    esigiUguale((nav.match(/binario__voce/g) || []).length, 6, 'voci nel binario');
    // E l invito alle clip sta davvero dentro la sezione della diretta.
    const diretta = html.slice(html.indexOf('id="diretta"'), html.indexOf('id="settimana"'));
    esigiDentro(diretta, 'clip--invito', 'l invito non e dentro la sezione «diretta»');
  });

  await prova('gli host delle anteprime sono gli stessi nel modulo e nella CSP', () => {
    // E il guasto che non si vede: un host che il modulo accetta ma che la
    // CSP non conosce produce card senza immagine, e il browser non lo dice
    // a nessuno tranne che nella console di chi guarda.
    const documento = archivio.leggi();
    const html = costruisci.anteprimaDi(documento);
    // Si legge il contenuto del <meta>, non la pagina intera: sopra alla
    // CSP c e il commento che la spiega, che nomina img-src e gli host
    // uno per uno. Cercare nel testo grezzo troverebbe quello, e la prova
    // passerebbe leggendo la spiegazione invece della regola.
    const meta = /<meta http-equiv="Content-Security-Policy" content="([\s\S]*?)">/.exec(html);
    esigi(meta !== null, 'la Content-Security-Policy non c e piu');
    const csp = meta[1].replace(/\s+/g, ' ');
    const imgSrc = (csp.match(/img-src[^;]*/) || [''])[0];
    esigi(!!imgSrc, 'la CSP non ha una direttiva img-src');
    for (const host of twitch.HOST_ANTEPRIME) {
      esigiDentro(imgSrc, 'https://' + host, 'img-src non lascia passare ' + host);
    }
    // E il contrario: nessun host delle clip in img-src che il modulo non
    // conosca — sarebbe un permesso concesso e mai usato.
    for (const pezzo of imgSrc.split(/\s+/)) {
      if (pezzo.indexOf('clips-media') === -1) { continue; }
      const host = pezzo.replace(/^https:\/\//, '').replace(/;$/, '');
      esigi(twitch.HOST_ANTEPRIME.indexOf(host) !== -1, 'la CSP permette ' + host + ', che il modulo non usa');
    }
  });

  await prova('config.clip.voci non ha un campo nello schema, ed e voluto', () => {
    // La riempie il server a ogni pubblicazione: un campo nel pannello
    // sarebbe una casella riscritta sotto le dita di chi la compila.
    esigi(schema.GENERATI.indexOf('config.clip.voci') !== -1, 'config.clip.voci non e fra i rami generati');
    esigi(!schema.campo('config.clip.voci'), 'lo schema ha un campo per config.clip.voci');
    // E la copertura non se ne lamenta: e l unica eccezione ammessa.
    const problemi = schema.verificaCopertura(contenutiVeri);
    esigi(problemi.length === 0, problemi.map((p) => p.messaggio).join(' | '));
    // Gli altri tre campi invece ci sono, perche quelli si scelgono a mano.
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
    // I giorni di ogni periodo stanno nel modulo, e devono essere gli stessi
    // che lo schema offre: un'opzione senza giorni verrebbe ignorata in
    // silenzio e chiederebbe a Twitch tutt'altro intervallo.
    const campo = schema.campo('config.clip.periodo');
    for (const opzione of campo.opzioni) {
      const valore = typeof opzione === 'object' ? opzione.valore : opzione;
      esigi(valore === 'sempre' || Object.prototype.hasOwnProperty.call(twitch.PERIODI, valore),
        'il periodo "' + valore + '" e nello schema ma non in twitch.PERIODI');
    }
  });

  await prova('a vetrina spenta non si chiede niente a Twitch', async () => {
    // Una richiesta in rete a ogni pubblicazione per riempire un ramo che
    // nessuno stampa e tempo speso per niente. Senza credenziali il caso
    // non si distingue, quindi qui si guarda quello che si puo: che non
    // lanci e che non tocchi i contenuti.
    const documento = archivio.leggi();
    documento.config.clip = accesa({ attivo: false, voci: [clipFinta()] });
    archivio.salva(documento);
    const esito = await twitch.aggiornaClip();
    esigiUguale(esito.stato, 'spento', 'stato');
    esigiUguale(archivio.leggi().config.clip.voci.length, 1, 'ha toccato le voci e non doveva');
  });

  await prova('«spento» ha due motivi, e il resoconto li distingue', async () => {
    // Senza collegamento e con la vetrina spenta il ramo si comporta allo
    // stesso modo, ma chi legge il resoconto sta cercando proprio di capire
    // quale delle due cose gli manca: una riga sola per due cause diverse
    // manderebbe a controllare il posto sbagliato.
    const senza = twitch.raccontaClip({ stato: 'spento' });
    const sezione = twitch.raccontaClip({ stato: 'spento', motivo: 'sezione' });
    esigi(senza !== sezione, 'le due righe sono identiche');
    esigiDentro(senza, 'collegamento', 'la riga senza credenziali non nomina il collegamento');
    esigiDentro(sezione, 'pannello', 'la riga a vetrina spenta non manda al pannello');

    // E il motivo arriva davvero da aggiornaClip, non solo da racconta.
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
    // Gli host sconosciuti vanno detti: un'anteprima bloccata dalla CSP non
    // lo dice a nessuno, e senza questa riga si guarda una card vuota
    // chiedendosi cosa sia andato storto.
    const conStrani = twitch.raccontaClip({ stato: 'aggiornato', quante: 3, hostStrani: ['esempio.twitchcdn.net'] });
    esigiDentro(conStrani, 'esempio.twitchcdn.net', 'non nomina l host sconosciuto');
  });
}

/* --- 11. LA SCHEDULE (CONTRATTO-5) ------------------------------------ */

/*
   La schedule rifatta ha tre strati, e qui si provano tutti e tre:
   - pannello/condivisi/orari.js, le regole pure (forma pulita, problemi,
     conti con i fusi orari). Lo stesso file gira nel pannello: se qui una
     regola cambia, cambia anche accanto alle caselle;
   - la generazione: il contesto della sezione, gli eventi ancora da venire,
     il fondale, il testo degli orari e il ramo `orari` di js/dati.js;
   - il salvataggio: convalida, unione in blocco, immagini in uso e percorsi
     esterni, passando dalle API vere come fa il pannello.
   Gli istanti sono sempre fissati a mano: un collaudo che dipende dal
   giorno in cui gira un giorno fallisce per conto suo.
*/
async function proveSchedule(contenutiVeri, costruisci, archivio) {
  apriSezione('11. La schedule (CONTRATTO-5)');

  const O = require('../pannello/condivisi/orari.js');
  const copia = (valore) => JSON.parse(JSON.stringify(valore));
  const percorsiDi = (orari) => O.problemi(orari).map((p) => p.percorso);
  const ISO = (ms) => new Date(ms).toISOString();

  /** Un ramo orari valido e completo, da sporcare una prova alla volta. */
  const orariBuoni = () => ({
    giorni: [1, 3, 5, 0], ora: '21:00', durataOre: 4, fuso: 'Europe/Rome',
    schede: [0, 1, 2, 3, 4, 5, 6].map(() => O.schedaVuota()),
    eventi: [],
    sfondo: { immagine: 'img/settimana-sfondo.webp', fuoco: { x: 50, y: 50 }, intensita: 30 }
  });
  /** Un evento valido, con le aggiunte che servono alla prova. */
  const evento = (aggiunte) => Object.assign(O.eventoVuoto(), { data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' }, aggiunte || {});
  /** Esige che problemi() segnali proprio quel percorso, e niente altro. */
  const soloSu = (orari, percorso, cosa) => {
    const trovati = percorsiDi(orari);
    esigi(trovati.length === 1 && trovati[0] === percorso,
      (cosa || percorso) + ': atteso un problema solo su ' + percorso + ', avuti ' + JSON.stringify(trovati));
  };
  const nessuno = (orari, cosa) => {
    const trovati = O.problemi(orari);
    esigi(trovati.length === 0, (cosa || 'valore buono') + ': problemi inattesi ' + JSON.stringify(trovati));
  };

  /* --- le regole pure ------------------------------------------------ */

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
    // La durata di un evento e' facoltativa (CONTRATTO-6bis, la maratona
    // senza una fine nota): vuota, assente o esplicitamente null vanno
    // bene tutte e restano tali finche' chi amministra non la toglie a
    // mano o le da una durata. Un numero scritto, pero', deve essere buono.
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
    // 29 marzo: alle 02:00 si salta alle 03:00.
    esigiUguale(ISO(O.istante('2026-03-29', '01:59', 'Europe/Rome')), '2026-03-29T00:59:00.000Z', 'un minuto prima del salto');
    esigiUguale(ISO(O.istante('2026-03-29', '02:30', 'Europe/Rome')), '2026-03-29T01:30:00.000Z', 'l ora che non esiste scivola alle 03:30');
    esigiUguale(ISO(O.istante('2026-03-29', '03:00', 'Europe/Rome')), '2026-03-29T01:00:00.000Z', 'subito dopo il salto');
    esigiUguale(ISO(O.istante('2026-03-29', '21:00', 'Europe/Rome')), '2026-03-29T19:00:00.000Z', 'la sera del 29 marzo');
    esigiUguale(ISO(O.istante('2026-03-28', '21:00', 'Europe/Rome')), '2026-03-28T20:00:00.000Z', 'la sera prima');
    // 25 ottobre: alle 03:00 si torna alle 02:00, e le 02:30 esistono due volte.
    esigiUguale(ISO(O.istante('2026-10-25', '02:30', 'Europe/Rome')), '2026-10-25T00:30:00.000Z', 'l ora doppia e la prima');
    esigiUguale(ISO(O.istante('2026-10-25', '03:00', 'Europe/Rome')), '2026-10-25T02:00:00.000Z', 'dopo il ritorno');
    esigiUguale(ISO(O.istante('2026-10-25', '21:00', 'Europe/Rome')), '2026-10-25T20:00:00.000Z', 'la sera del 25 ottobre');
    esigiUguale(ISO(O.istante('2026-10-24', '21:00', 'Europe/Rome')), '2026-10-24T19:00:00.000Z', 'la sera prima');
    // Altri fusi: mezz'ora, quarto d'ora, emisfero sud.
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
    // Una maratona che parte a mezzanotte del 25 ottobre: quattro ore dopo,
    // col ritorno all'ora solare, l'orologio segna le 03:00 e non le 04:00.
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
    // L'evento finisce proprio adesso: finito vuol dire termine <= adesso.
    esigiUguale(O.eventiFuturi(orari, Date.parse('2026-09-20T10:00:00.000Z')).some((e) => e.titolo === 'Finito da poco'), false, 'finito all istante');
    esigiUguale(O.eventiFuturi({ eventi: 'x' }, adesso).length, 0, 'eventi non elenco');
  });

  await prova('eventiFuturi: un evento senza durata resta non finito per un anno, non per sempre', () => {
    const orari = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-18', ora: '16:00', durataOre: null, titolo: 'Maratona aperta' })]
    });
    const inizio = Date.parse('2026-09-18T14:00:00.000Z');   // 16:00 a Roma, ora legale
    // Prima di cominciare: futuro, non ancora in corso.
    esigiUguale(O.eventiFuturi(orari, inizio - 1000).length, 1, 'prima dell inizio c e ancora');
    // Un mese dopo, in piena maratona: ancora li.
    esigiUguale(O.eventiFuturi(orari, inizio + 30 * 24 * 3600000).length, 1, 'un mese dopo e ancora non finito');
    // Il termine finto e' inizio + un anno esatto: eventiDi() lo trasforma
    // in fine:'' (server/lib/costruisci.js) cosi' nessuno lo scrive come
    // un orario vero, ma resta un numero finito perche' js/sito.js scarta
    // gli eventi con termine non finito o non maggiore dell inizio.
    const [voce] = O.eventiFuturi(orari, inizio);
    esigi(Number.isFinite(voce.termine) && voce.termine > voce.inizio, 'termine finito e dopo l inizio');
    esigiUguale(voce.termine - voce.inizio, 365 * 24 * 3600000, 'un anno esatto di finta durata');
    // Dato per finito solo dopo quell anno: non e' infinito davvero, e va
    // bene cosi' — nessuno amministra un sito per non tornarci mai piu'.
    esigiUguale(O.eventiFuturi(orari, voce.termine + 1).length, 0, 'oltre l anno finto e considerato finito');

    // eventiDi() (server/lib/costruisci.js) e' quello che finisce nella
    // pagina: la fine finta non deve mai uscire come un orario vero.
    const [pagina] = costruisci.eventiDi(orari, inizio);
    esigiUguale(pagina.fine, '', 'senza durata, fine vuota: niente "- 15:00" inventato');
    esigi(pagina.termine !== '', 'termine invece resta un istante vero (serve a data-fine)');
  });

  /* --- priorita dell evento speciale --------------------------------- */

  await prova('eventoAttivo: solo quello acceso adesso, e a due sovrapposti vince chi ha cominciato prima', () => {
    const orari = Object.assign(orariBuoni(), {
      eventi: [
        evento({ data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' }),
        evento({ data: '2026-09-27', ora: '14:00', durataOre: 12, titolo: 'Cominciata prima' })
      ]
    });
    // 15:00 a Roma e 13:00Z: prima di allora la sola accesa e quella delle 14.
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-27T12:30:00.000Z')).titolo, 'Cominciata prima', 'una sola accesa');
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-27T16:00:00.000Z')).titolo, 'Cominciata prima', 'sovrapposte: vince chi e cominciata prima');
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-27T10:00:00.000Z')), null, 'non ancora cominciate');
    esigiUguale(O.eventoAttivo(orari, Date.parse('2026-09-29T10:00:00.000Z')), null, 'finite tutte');
    esigiUguale(O.eventoAttivo(orariBuoni(), Date.parse('2026-09-27T16:00:00.000Z')), null, 'senza eventi');
    esigiUguale(O.eventoAttivo('x', Date.parse('2026-09-27T16:00:00.000Z')), null, 'ramo storto');
  });

  await prova('programmaSostituito: l evento acceso si prende i giorni che gli finiscono sotto, non gli altri', () => {
    // giorni 1, 3, 5, 0 alle 21:00 per quattro ore. La maratona comincia
    // domenica alle 15:00 e va fino alle 03:00 di lunedi: si porta via la
    // domenica sera, non il lunedi (che comincia alle 21:00 del giorno dopo).
    const orari = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-27', ora: '15:00', durataOre: 12, titolo: 'Maratona' })]
    });
    const dentro = O.programmaSostituito(orari, Date.parse('2026-09-27T16:00:00.000Z'));
    esigiUguale(dentro.evento.titolo, 'Maratona', 'l evento acceso');
    esigiUguale(dentro.giorni.join(','), 'true,false,false,false,false,false,false', 'solo la domenica');

    // Il giorno dell evento comanda da mezzanotte, non dalle 15:00: alle 12
    // della domenica la serata e gia sua (orario sbarrato, «Speciale»).
    const mattina = O.programmaSostituito(orari, Date.parse('2026-09-27T10:00:00.000Z'));
    esigiUguale(mattina.evento.titolo + ' ' + mattina.giorni.join(','), 'Maratona true,false,false,false,false,false,false', 'dalla mezzanotte del suo giorno');
    // Il giorno prima non si porta via niente: il nastro resta quello di sempre.
    const prima = O.programmaSostituito(orari, Date.parse('2026-09-26T21:00:00.000Z'));
    esigiUguale(prima.evento + ' ' + prima.giorni.join(','), 'null false,false,false,false,false,false,false', 'evento non ancora acceso');
    // E dopo la fine torna tutto com era, senza ripubblicare niente.
    const dopo = O.programmaSostituito(orari, Date.parse('2026-09-28T02:00:00.000Z'));
    esigiUguale(dopo.evento + ' ' + dopo.giorni.join(','), 'null false,false,false,false,false,false,false', 'evento finito');
  });

  await prova('programmaSostituito: sfiorarsi non e sovrapporsi, e un evento senza fine nota li copre tutti', () => {
    // La serata regolare comincia esattamente quando l evento finisce: quella
    // diretta si fa davvero, e non va sbarrata.
    const attaccati = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-27', ora: '13:00', durataOre: 8, titolo: 'Fino alle 21' })]
    });
    esigiUguale(O.programmaSostituito(attaccati, Date.parse('2026-09-27T16:00:00.000Z')).giorni.join(','),
      'false,false,false,false,false,false,false', 'una finestra che finisce dove l altra comincia');

    // Senza durata (ORE_APERTO) l evento dura finche non lo si toglie: tutti
    // i giorni accesi del nastro gli finiscono sotto.
    const aperto = Object.assign(orariBuoni(), {
      eventi: [evento({ data: '2026-09-27', ora: '15:00', durataOre: null, titolo: 'Maratona aperta' })]
    });
    esigiUguale(O.programmaSostituito(aperto, Date.parse('2026-09-28T10:00:00.000Z')).giorni.join(','),
      'true,true,false,true,false,true,false', 'tutti e quattro i giorni di diretta');
  });

  /* --- convalida del server ------------------------------------------ */

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

  /* --- generazione --------------------------------------------------- */

  /** I contenuti veri con una schedule ricca: ore diverse, immagini, un giorno spento con dei dati. */
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
    // Con `quando` (il timbro della generazione) l'istante e lo stesso.
    const conQuando = costruisci.costruisciContesto(documentoRicco(), { quando: '2026-09-28T00:30:00.000Z' });
    esigiUguale(conQuando.sito.eventi.map((e) => e.titolo).join(','), 'Maratona,Speciale ottobre', 'maratona ancora in corso alle 02:30');
  });

  /** I contenuti ricchi con una maratona ACCESA all istante ADESSO (domenica). */
  const documentoInMaratona = () => {
    const documento = documentoRicco();
    // Domenica 20 settembre 2026, 09:00–23:00 a Roma: ADESSO ci sta dentro, e
    // ci sta dentro anche la diretta regolare della domenica (16:00–22:00).
    documento.config.orari.eventi = [evento({ data: '2026-09-20', ora: '09:00', durataOre: 14, titolo: 'Maratona', gioco: 'Quiz' })];
    return documento;
  };

  await prova('settimana: l evento acceso si prende il giorno, e il programma di sempre resta scritto sotto', () => {
    const contesto = costruisci.costruisciContesto(documentoInMaratona(), { adesso: ADESSO, categoriaDiretta: '' });
    const per = {};
    for (const voce of contesto.settimana) { per[voce.indice] = voce; }
    esigiUguale(per[0].sostituito, 'Maratona', 'la domenica porta il titolo dell evento');
    // I testi del giorno restano in pagina: quando l evento finisce js/sito.js
    // toglie is-sostituito e la serata di sempre torna senza ripubblicare.
    esigiUguale(per[0].ora + '|' + per[0].fine, '16:00|22:00', 'l orario regolare resta scritto');
    esigiUguale(contesto.settimana.filter((v) => v.sostituito).length, 1, 'un giorno solo');
    esigiUguale(per[1].sostituito + '|' + per[3].sostituito, '|', 'i giorni fuori dall evento non cambiano');

    // Senza eventi accesi nessun giorno e sostituito: e il caso di sempre.
    const normale = costruisci.costruisciContesto(documentoRicco(), { adesso: ADESSO, categoriaDiretta: '' });
    esigiUguale(normale.settimana.filter((v) => v.sostituito).length, 0, 'senza evento acceso');
  });

  await prova('sito.eventi: l evento acceso mostra la categoria vera di Twitch, gli altri il gioco scritto a mano', () => {
    const documento = documentoInMaratona();
    documento.config.orari.eventi.push(evento({ data: '2026-10-03', ora: '21:00', durataOre: 3, titolo: 'Dopo', gioco: 'Quiz di ottobre' }));
    const conTwitch = costruisci.costruisciContesto(documento, { adesso: ADESSO, categoriaDiretta: ' Elden Ring ' });
    esigiUguale(conTwitch.sito.eventi.map((e) => e.titolo + ':' + e.gioco).join(', '),
      'Maratona:Elden Ring, Dopo:Quiz di ottobre', 'solo l evento acceso prende la categoria');
    // Twitch giu, canale spento, collegamento non configurato: si torna a
    // quello che c e scritto nel pannello, come prima di questa modifica.
    const senza = costruisci.costruisciContesto(documento, { adesso: ADESSO, categoriaDiretta: '' });
    esigiUguale(senza.sito.eventi.map((e) => e.titolo + ':' + e.gioco).join(', '),
      'Maratona:Quiz, Dopo:Quiz di ottobre', 'senza categoria resta il gioco scritto a mano');
    // `contenuto` segue la categoria: un evento senza nota ne gioco scritto
    // ha comunque qualcosa da mostrare se Twitch risponde.
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
      finally { try { fs.unlinkSync(P.direttaTwitch); } catch (e) { /* gia sparito */ } }
    };
    esigiUguale(con(scritta()), 'Elden Ring', 'lettura appena fatta');
    esigiUguale(con(scritta({ inOnda: false, categoria: '' })), '', 'canale spento');
    esigiUguale(con(scritta({ letteIl: new Date(ADESSO - 60 * 60 * 1000).toISOString() })), '', 'lettura di un ora fa');
    esigiUguale(con(scritta({ letteIl: 'boh' })), '', 'istante illeggibile');
    esigiUguale(costruisci.categoriaDiretta({}, ADESSO), '', 'senza il file non si sa niente');
    // La scelta esplicita ha la precedenza e non tocca il disco: e cosi che
    // l anteprima del pannello resta una funzione di dati.
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
    // Lo stesso istante vale per la pagina: gli eventi della pagina e di dati.js coincidono.
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

  /* --- salvataggio ---------------------------------------------------- */

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

  // Da qui in giu si passa dal server vero, come il pannello. I contenuti di
  // partenza si rimettono prima e dopo: le sezioni precedenti ne hanno
  // salvati e ripristinati di loro.
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
      // Tolta dalla schedule, la stessa immagine si cancella.
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

/* --- 12. AVVIO SU UN HOSTING (CONTRATTO-6 §4, agente NODO) ----------- */

/*
   Fra «node server/server.js sul proprio computer» e «un hosting che lancia
   app.js» cambiano cinque cose, e sono tutte qui: la porta la passa
   l'hosting (PORT), l'indirizzo di ascolto diventa 0.0.0.0, il fuso lo
   impone app.js prima di ogni require, i segreti possono uscire dalla
   document root (SB_DATI, SB_BACKUP) e le connessioni che non parlano si
   chiudono da sole.

   Le prime tre si leggono da costanti calcolate al caricamento del modulo:
   per provarne la precedenza serve un processo nuovo a ogni caso, e serve
   che sia FIGLIO — un `delete require.cache` qui dentro cambierebbe sotto i
   piedi il server.js che le sezioni 8-11 hanno gia in mano.
*/

/** Lancia un processo figlio e ne riporta uscita, stampe ed errori. */
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

  // Due scarabocchi usa e getta nella cartella temporanea. Il primo ricarica
  // server.js caso per caso; il secondo carica app.js come farebbe Passenger
  // e riferisce cosa ne e uscito.
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
      // Certe versioni di Passenger mettono in PORT il percorso di un socket:
      // li la porta la decide comunque lui, e noi non dobbiamo ascoltare su
      // NaN. Si torna a SB_PORTA.
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
    // Il fuso va impostato prima di ogni require, perche Node lo legge una
    // volta sola: gli orari di questo sito sono italiani e un hosting in UTC
    // farebbe cadere il lunedi sera di domenica.
    const senzaFuso = lanciaFiglio(scriptAvvio, [APP_JS],
      { TZ: undefined, SB_HOST: undefined, PORT: '4299', SB_DATI: undefined, SB_BACKUP: undefined });
    esigiUguale(senzaFuso.stato, 0, 'il figlio e uscito male: ' + senzaFuso.errori);
    const primo = JSON.parse(senzaFuso.ultima);
    esigiUguale(primo.tz, 'Europe/Rome', 'fuso di partenza');
    // Il 15 giugno a mezzogiorno UTC in Italia sono le 14: se il fuso fosse
    // arrivato dopo il primo require, qui si leggerebbero le 12.
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
    // E la seconda serratura del CONTRATTO-6 §3, quella che non dipende dal
    // server web: se un giorno .htaccess non viene letto, i segreti non sono
    // comunque sotto la document root.
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
      // Le cartelle si creano al primo uso: senza, il primo salvataggio
      // fallirebbe proprio nel momento in cui si sceglie la password.
      esigi(fs.existsSync(fuori) && fs.existsSync(copie), 'le cartelle indicate non sono state create');
      // Senza le due variabili non cambia una virgola.
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
    // Ripiegare su server/dati/ vorrebbe dire rimettere i segreti dentro il
    // sito proprio mentre chi lo configura crede di averli portati fuori.
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

    // E dal vivo: l'applicazione non parte, lo dice in italiano nel log ed
    // esce con 1, cosi Passenger smette di riprovare all infinito.
    const figlio = lanciaFiglio(scriptAvvio, [APP_JS],
      { SB_DATI: impossibile, SB_BACKUP: undefined, PORT: '4299', SB_HOST: '127.0.0.1' });
    esigiUguale(figlio.stato, 1, 'l avvio doveva fallire');
    esigiDentro(figlio.errori, 'avvio non riuscito', 'il log deve dirlo in chiaro');
    esigiDentro(figlio.errori, 'SB_DATI', 'il log deve nominare la variabile');
  });

  await prova('percorsi.imposta() NON applica SB_DATI: il collaudo non tocca l auth.json vero', () => {
    // Voluto, e delicato: imposta() la usa questo collaudo per rinchiudersi
    // in una cartella temporanea, e scrive davvero una password di prova. Se
    // rispettasse SB_DATI, un `node server/autotest.js` lanciato sull hosting
    // cancellerebbe la password vera del pannello.
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
      // Una connessione tenuta aperta fra due richieste deve morire per il
      // tempo suo, non per quello delle intestazioni.
      esigi(server.keepAliveTimeout < server.headersTimeout, 'il keep-alive non sta sotto alle intestazioni');
      // La sveglia scritta a mano: headersTimeout comincia a contare dal
      // primo byte, quindi chi apre e tace non lo sveglierebbe mai. Qui si
      // guarda che i due ascoltatori ci siano; che la connessione muta venga
      // davvero chiusa lo misura prova-timeout.js, che ci mette mezzo minuto
      // per caso e non puo stare in un collaudo che deve restare svelto.
      esigi(server.listenerCount('connection') >= 1, 'nessuna sveglia sulla connessione');
      esigi(server.listenerCount('request') >= 1, 'nessuno spegne la sveglia alla prima richiesta');
    } finally {
      server.close(() => {});
    }
  });
}

/* --- 13. LA PAGINA PULITA E L INDIRIZZO (CONTRATTO-6 §4, USCITA) ----- */

async function proveUscita(costruisci, archivio) {
  apriSezione('13. Pagina pulita e indirizzo del sito (agente USCITA)');

  const SITO = 'https://slayerbeard.com';

  await prova('togliCommenti: quello che non e un commento non si tocca', () => {
    // I casi storti si provano meglio sulla funzione che su una generazione
    // intera: la pagina vera questi casi non li ha, ma un modello scritto
    // domani si.
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
    // Lo spazio fra due tag conta: toglierlo o aggiungerlo cambia la pagina
    // che si vede, ed e esattamente quello che non deve succedere.
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
    // Il doctype comincia con «<!» ma non e un commento: se sparisse lui, la
    // pagina cadrebbe in quirks mode.
    esigiDentro(html, '<!doctype html>', 'doctype');
    esigiDentro(html, '<html lang="it">', 'apertura della pagina');
    // I commenti restano nei modelli, che sono il sorgente e devono restare
    // spiegati: si toglie in uscita, non alla fonte.
    esigi(fs.readFileSync(P.modelloIndex, 'utf8').indexOf('<!--') !== -1,
      'i commenti sono spariti anche dal modello: si doveva togliere solo in uscita');
  });

  await prova('normalizzaIndirizzo: con o senza barra, con o senza schema, e lo stesso', () => {
    for (const buono of ['https://slayerbeard.com', 'https://slayerbeard.com/', 'slayerbeard.com',
      '  https://slayerbeard.com  ', 'HTTPS://SlayerBeard.com', 'https://slayerbeard.com/?x=1#y']) {
      esigiUguale(controlli.normalizzaIndirizzo(buono), SITO + '/', buono);
    }
    // Un valore che non e un indirizzo vale come non scritto: meglio il
    // percorso relativo di un canonico inventato.
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
      // Un campo storto vale come non scritto, e allora si guarda l'ambiente.
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
    // L'istante si fissa: la pagina contiene gli eventi futuri, e due rese a
    // cavallo di un minuto sarebbero diverse per un motivo che non c'entra.
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
    // robots.txt non e un file della generazione: lo scrive chi prepara
    // l'hosting, e la pubblicazione ci mette solo la riga Sitemap:. Qui se ne
    // scrive uno nella copia di lavoro, come sull hosting.
    const robots = path.join(P.radice, 'robots.txt');
    fs.writeFileSync(robots, 'User-agent: *\nAllow: /\nDisallow: /pannello/\n', 'utf8');
    const documento = archivio.leggi();
    documento.config.sitoUrl = SITO;
    archivio.salva(documento);

    const esito = costruisci.genera();
    // La sitemap sta fuori da `scritti`, che sono i tre file generati e basta.
    esigiUguale(esito.scritti.map((s) => s.file).join(', '), 'index.html, js/dati.js, css/tema.css', 'gli scritti restano tre');
    esigi(esito.sitemap && esito.sitemap.file === 'sitemap.xml', 'la sitemap non e in esito.sitemap');
    esigiUguale(esito.sitemap.indirizzo, SITO + '/', 'indirizzo della sitemap');
    esigiUguale(esito.sitemap.robots, 'aggiornato', 'riga in robots.txt');

    const mappa = fs.readFileSync(path.join(P.radice, 'sitemap.xml'), 'utf8');
    esigiDentro(mappa, '<loc>' + SITO + '/</loc>', 'loc della sitemap');
    esigiDentro(mappa, '<lastmod>' + String(esito.aggiornatoIl).slice(0, 10) + '</lastmod>', 'lastmod');
    esigiUguale((mappa.match(/<url>/g) || []).length, 1, 'il sito e una pagina sola');

    const testoRobots = fs.readFileSync(robots, 'utf8');
    esigiDentro(testoRobots, 'Sitemap: ' + SITO + '/sitemap.xml', 'la riga Sitemap:');
    esigiDentro(fs.readFileSync(P.indexHtml, 'utf8'), '<link rel="canonical" href="' + SITO + '/">', 'canonico');

    // Due pubblicazioni di fila non devono lasciare due righe.
    costruisci.genera();
    esigiUguale((fs.readFileSync(robots, 'utf8').match(/^[ \t]*Sitemap[ \t]*:/gim) || []).length, 1, 'righe Sitemap:');
  });

  await prova('i domini del player prendono host e www, e senza doppioni', () => {
    // Per Twitch slayerbeard.com e www.slayerbeard.com sono due «parent»
    // diversi: chi arrivasse dall'altro vedrebbe un rettangolo nero.
    const documento = archivio.leggi();
    documento.config.sitoUrl = SITO;
    documento.config.twitch.domini = ['slayerbeard.com', 'prova.example'];
    const domini = costruisci.oggettoDati(documento).twitch.domini;
    esigiUguale(domini.join(','), 'slayerbeard.com,prova.example,www.slayerbeard.com,localhost,127.0.0.1', 'elenco dei domini');
    esigiUguale(new Set(domini).size, domini.length, 'ci sono doppioni');
    // Con il campo vuoto li mette tutti la pubblicazione: e la ragione per
    // cui il player parte online senza aprire il pannello.
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
      // Senza indirizzo la pagina ripiega sul percorso relativo, come ha
      // sempre fatto: funziona, e non inventa un dominio.
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

/* --- 14. IL PANNELLO ESPOSTO A INTERNET (CONTRATTO-6 §4, SCUDO) ------ */

/** Una richiesta finta: basta a chi guarda solo indirizzo e intestazioni. */
function richiestaFinta(ip, intestazioni) {
  return { headers: Object.assign({}, intestazioni || {}), socket: { remoteAddress: ip } };
}

async function provePannelloEsposto() {
  apriSezione('14. Il pannello esposto a internet (agente SCUDO)');

  const auth = require('./lib/autenticazione');
  const statico = require('./lib/statico');
  const dietroProxyPrima = process.env.SB_DIETRO_PROXY;
  const primoAccessoPrima = process.env.SB_PRIMO_ACCESSO;

  /** Rimette l'ambiente come l'ha trovato: le due variabili si rileggono a ogni chiamata. */
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
      // Il primo valore lo scrive chi chiama: bastava cambiarlo a ogni
      // richiesta per non essere frenati mai. L'ultimo lo accoda il proxy di
      // casa, ed e l'unico che chi chiama non puo falsificare.
      process.env.SB_DIETRO_PROXY = '1';
      esigiUguale(auth.dietroProxy(), true, 'dietroProxy');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })),
        '203.0.113.7', 'ultimo salto');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '1.1.1.1, 198.51.100.4' })),
        '198.51.100.4', 'un altro cliente, un altro indirizzo');
      esigiUguale(auth.indirizzoRichiesta(richiestaFinta('127.0.0.1', {})), '127.0.0.1', 'senza intestazione vale la connessione');
    });

    await prova('l indirizzo si normalizza: via la porta e il prefisso ::ffff:', () => {
      // Senza, lo stesso cliente avrebbe un contatore nuovo a ogni richiesta:
      // la porta di origine cambia sempre.
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
      // E il blocco colpisce chi deve: un altro cliente dietro lo stesso
      // proxy non paga per lui.
      esigiUguale(auth.attesaResidua(richiestaFinta('127.0.0.1', { 'x-forwarded-for': '198.51.100.4' })), 0,
        'un cliente diverso e stato frenato per sbaglio');
      auth.azzeraTutto();
    });

    await prova('il cookie Secure segue la stessa regola di X-Forwarded-Proto', () => {
      const finta = richiestaFinta('127.0.0.1', { 'x-forwarded-proto': 'https' });
      delete process.env.SB_DIETRO_PROXY;
      esigiUguale(auth.inHttps(finta), false, 'senza dichiarazione l intestazione non conta');
      // Un «https» falso faceva mettere Secure a un cookie su http: il
      // browser lo buttava via, cioe non si entrava piu nel pannello.
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
      // La stessa lista che nega .htaccess: su Plesk i file statici li serve
      // il server web, ma se nginx scavalca .htaccess questo modulo e
      // l'unico rimasto a dire di no.
      const negati = ['README.md', 'CONTRATTO-6.md', 'docs/HOSTING.md', 'docs/PANNELLO.md',
        'package.json', 'package-lock.json', 'app.js', '.env', '.env.esempio', '.htaccess',
        '.gitignore', '.git/config', '.editorconfig', 'modelli/index.html', 'modelli/parziali/testa.html',
        'server/server.js', 'server/lib/api.js', 'server/dati/auth.json', 'server/dati/chiavi.js',
        'server/backup/copia.json', 'contenuti/contenuti.json', 'contenuti/schema.js',
        'contenuti/font/elenco.json', 'contenuti/media/appunti.md'];
      for (const relativo of negati) {
        esigiUguale(statico.riservato(path.join(P.radice, ...relativo.split('/'))), true, 'doveva essere negato: ' + relativo);
      }
      // Windows non distingue le maiuscole: senza il confronto in minuscolo
      // /SERVER/dati/auth.json usciva lo stesso.
      esigiUguale(statico.riservato(path.join(P.radice, 'SERVER', 'dati', 'auth.json')), true, 'SERVER in maiuscolo');
    });

    await prova('statico: il sito, il pannello, i media e i font continuano a uscire', () => {
      const ammessi = ['index.html', 'robots.txt', 'sitemap.xml', 'css/tema.css', 'js/dati.js',
        'img/avatar.webp', 'pannello/index.html', 'pannello/moduli/api.js',
        'contenuti/media/citta-notturna.webp', 'contenuti/font/prova.woff2',
        // L'unico file nascosto che ha senso servire: serve al rinnovo del
        // certificato.
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

    /* Le prove che restano vogliono un server vero: il freno e il primo
       accesso passano da api.js, e provarli sulle sole funzioni direbbe
       meta della cosa. */
    const { creaServer } = require('./server.js');
    const server = creaServer();
    await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
    const porta = server.address().port;

    try {
      await prova('il freno colpisce chi scrive senza sessione, non chi e dentro', async () => {
        // L'editor dal vivo fa legittimamente decine di richieste al secondo
        // (POST /api/tema a ogni fotogramma): un freno che lo ferma sarebbe
        // un freno che ferma chi lavora e non chi prova a caso.
        delete process.env.SB_DIETRO_PROXY;
        auth.azzeraTutto();
        const entra = await chiama(porta, 'POST', '/api/entra', { json: { password: PASSWORD_COLLAUDO } });
        esigiUguale(entra.stato, 200, 'accesso');
        const biscotto = biscottoDa(entra);

        // Il contatore dell'indirizzo da cui arriva il collaudo si riempie
        // senza fare 121 richieste vere: la funzione e la stessa che chiama
        // api.js a ogni scrittura anonima.
        const finta = richiestaFinta('127.0.0.1', {});
        for (let i = 0; i <= auth.MAX_SCRITTURE_ANONIME; i++) { auth.frenoScritture(finta); }

        const conSessione = await chiama(porta, 'POST', '/api/tema', { biscotto: biscotto, json: { tema: { sfondo: { aloni: 40 } } } });
        esigiUguale(conSessione.stato, 200, 'chi ha la sessione e stato frenato');
        const anonima = await chiama(porta, 'POST', '/api/tema', { json: { tema: {} } });
        esigiUguale(anonima.stato, 429, 'una scrittura anonima doveva essere frenata');
        esigiDentro(anonima.dati.errore, 'Troppe richieste', 'messaggio');
        // Si frena chi scrive, non chi guarda.
        esigiUguale((await chiama(porta, 'GET', '/api/sessione')).stato, 200, 'una lettura e stata frenata');
        auth.azzeraTutto();
      });

      /* Il primo accesso. Il ramo che CREA la password vive solo finche
         auth.json non esiste: per provarlo si mette da parte quello della
         copia di lavoro e lo si rimette subito dopo. */
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
        // Fra l'avvio dell'applicazione e il momento in cui chi amministra
        // apre il pannello passa del tempo, e /pannello/ e uno dei percorsi
        // che i bot provano di serie: chi arriva primo si prende il sito.
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
        // Una variabile lasciata accesa per dimenticanza non deve aprire
        // nessuna porta: il controllo vive dentro il ramo del primo avvio.
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
    await proveSondaggi(archivio);
    await proveTwitch(costruisci, archivio);
    await proveClip(contenutiVeri, costruisci, archivio);
    await proveSchedule(contenutiVeri, costruisci, archivio);

    // Le tre sezioni del CONTRATTO-6 stanno in fondo apposta: toccano
    // l'ambiente (SB_DATI, SB_SITO, SB_DIETRO_PROXY) e i percorsi, e quello
    // che spostano lo rimettono a posto — ma se qualcosa sfuggisse, non
    // sfuggirebbe addosso alle prove di prima.
    await proveHosting(temporanea);
    await proveUscita(costruisci, archivio);
    await provePannelloEsposto();
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
