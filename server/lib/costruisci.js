'use strict';
/* =====================================================================
   costruisci.js — da contenuti.json a index.html, js/dati.js e css/tema.css.

   Fa due cose:
   1. costruisce il contesto del CONTRATTO §6.2, cioe quello che il modello
      puo leggere: i testi, la configurazione, gli elenchi gia filtrati e
      arricchiti con le icone, i sette giorni della settimana e i valori
      calcolati sotto "sito";
   2. esegue la pubblicazione nell'ordine del §6.4 — backup, convalida,
      resa, scrittura atomica, timbro di aggiornamento — fermandosi al
      primo passo che non torna, senza lasciare file a meta.

   Nota sulla settimana: le voci escono in ordine italiano (lunedi per
   primo) ma ognuna porta il proprio `indice` con la numerazione di
   JavaScript (0 = domenica), che e quella di config.orari.giorni e quella
   che finisce in data-giorno per il JS del sito.

   Nota sul testo ricco (CONTRATTO-2 §7): i valori dei campi che lo schema
   dichiara `tipo: 'ricco'` entrano nel contesto GIA sanificati. E qui il
   punto giusto per farlo: il modello li stampa con la tripla graffa, cioe
   senza escape, quindi un valore ricco non sanificato non deve neanche
   poter arrivare fin li. La sanificazione avviene su una copia dei
   contenuti — l'originale finisce su contenuti.json e deve restare quello
   che chi amministra ha scritto.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');

const { P } = require('./percorsi');
const { scriviAtomico, eFile } = require('./file');
const { erroreHttp } = require('./risposte');
const modello = require('./modello');
const archivio = require('./archivio');
const convalida = require('./convalida');
// I controlli d'insieme: avvertimenti, non errori. Vedi controlli.js.
const controlli = require('./controlli');
const testoricco = require('./testoricco.js');
const tema = require('./tema.js');
const backup = require('./backup');
const schema = require('../../contenuti/schema.js');

const NOMI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const ABBR = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
// Ordine di lettura italiano: il nastro parte da lunedi e finisce di domenica.
const ORDINE = [1, 2, 3, 4, 5, 6, 0];

/* ------------------------------------------------------------------ */
/* PEZZI DEL CONTESTO                                                  */
/* ------------------------------------------------------------------ */

/**
 * Legge modelli/icone/<nome>.svg. Le icone mancanti non fanno esplodere
 * subito: si raccolgono tutte e si segnalano insieme, perche sistemarne
 * una alla volta a colpi di rigenerazione e una perdita di tempo.
 */
function leggiIcona(nome, cache, mancanti) {
  if (cache.has(nome)) { return cache.get(nome); }
  const file = path.join(P.icone, nome + '.svg');
  let contenuto = '';
  try {
    contenuto = fs.readFileSync(file, 'utf8')
      .replace(/^﻿/, '')
      .replace(/<\?xml[^>]*\?>\s*/i, '')     // la dichiarazione XML non serve inline
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
  } catch (e) {
    mancanti.push(path.relative(P.radice, file));
  }
  cache.set(nome, contenuto);
  return contenuto;
}

/** Voci con URL non vuoto, arricchite con l'SVG dell'icona. */
function elencoVisibile(voci, cache, mancanti) {
  const fuori = [];
  for (const voce of voci || []) {
    if (!voce || typeof voce.url !== 'string' || !voce.url.trim()) { continue; }
    fuori.push(Object.assign({}, voce, { svg: leggiIcona(String(voce.icona || ''), cache, mancanti) }));
  }
  return fuori;
}

/** I sette giorni, sempre tutti, calcolati da config.orari. */
function settimanaDi(config, testi) {
  const giorni = (config.orari && Array.isArray(config.orari.giorni)) ? config.orari.giorni : [];
  const ora = (config.orari && config.orari.ora) || '';
  return ORDINE.map((indice) => {
    const diretta = giorni.indexOf(indice) !== -1;
    return {
      indice: indice,
      abbr: ABBR[indice],
      nome: NOMI[indice],
      diretta: diretta,
      ora: diretta ? ora : '',
      tag: diretta ? (testi['settimana.etichettaDiretta'] || '') : (testi['settimana.etichettaRiposo'] || '')
    };
  });
}

/* ------------------------------------------------------------------ */
/* TESTO RICCO                                                         */
/* ------------------------------------------------------------------ */

/**
 * Le chiavi che lo schema dichiara `ricco`, divise fra quelle semplici e
 * quelle dentro un elenco (per esempio config.supporto[].testo).
 * Si ricavano dallo schema e non da una lista scritta qui: aggiungere un
 * campo ricco deve costare una riga nello schema e basta.
 */
function chiaviRicche() {
  const semplici = [];
  const elenchi = [];
  for (const campo of schema.campi()) {
    if (campo.tipo === 'ricco') { semplici.push(campo.chiave); continue; }
    if (campo.tipo !== 'elenco' || !Array.isArray(campo.campi)) { continue; }
    const dentro = campo.campi.filter((v) => v.tipo === 'ricco').map((v) => v.chiave);
    if (dentro.length) { elenchi.push({ chiave: campo.chiave, campi: dentro }); }
  }
  return { semplici: semplici, elenchi: elenchi };
}

/** Il contenitore di una chiave `config.a.b` e il nome finale, oppure null. */
function contenitoreDi(config, chiave) {
  const pezzi = chiave.slice('config.'.length).split('.');
  let nodo = config;
  for (let i = 0; i < pezzi.length - 1; i++) {
    if (!nodo || typeof nodo !== 'object') { return null; }
    nodo = nodo[pezzi[i]];
  }
  if (!nodo || typeof nodo !== 'object') { return null; }
  return { nodo: nodo, nome: pezzi[pezzi.length - 1] };
}

function ripulisci(contenitore, nome) {
  if (typeof contenitore[nome] === 'string') { contenitore[nome] = testoricco.sanifica(contenitore[nome]); }
}

/**
 * Sanifica sul posto i valori ricchi di testi e config. Lavora su una copia
 * (la fa chi chiama), mai sul documento che poi viene salvato.
 * Una chiave dichiarata ricca ma assente non e un problema di questa
 * funzione: se ne accorge la verifica di copertura, che gira prima.
 */
function sanificaRicchi(testi, config) {
  const ricche = chiaviRicche();

  for (const chiave of ricche.semplici) {
    if (chiave.startsWith('config.')) {
      const dove = contenitoreDi(config, chiave);
      if (dove) { ripulisci(dove.nodo, dove.nome); }
    } else {
      // In "testi" i punti fanno parte del nome: "deck.sottotitolo" e una
      // chiave sola, non un percorso da scendere.
      ripulisci(testi, chiave);
    }
  }

  for (const elenco of ricche.elenchi) {
    const dove = elenco.chiave.startsWith('config.') ? contenitoreDi(config, elenco.chiave) : null;
    const voci = dove ? dove.nodo[dove.nome] : null;
    if (!Array.isArray(voci)) { continue; }
    for (const voce of voci) {
      if (!voce || typeof voce !== 'object') { continue; }
      for (const nome of elenco.campi) { ripulisci(voce, nome); }
    }
  }
}

/** «Lunedì, mercoledì, venerdì e domenica alle 21:00». */
function orariTesto(config) {
  const giorni = (config.orari && Array.isArray(config.orari.giorni)) ? config.orari.giorni : [];
  const ordinati = ORDINE.filter((g) => giorni.indexOf(g) !== -1);
  if (!ordinati.length) { return ''; }

  const nomi = ordinati.map((g, i) => (i === 0 ? NOMI[g] : NOMI[g].toLowerCase()));
  const elenco = nomi.length === 1
    ? nomi[0]
    : nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];
  const ora = (config.orari && config.orari.ora) || '';
  return ora ? elenco + ' alle ' + ora : elenco;
}

/* ------------------------------------------------------------------ */
/* DATO STRUTTURATO (application/ld+json)                              */
/* ------------------------------------------------------------------ */

/**
 * Il blocco Person della testa, gia serializzato e pronto da stampare con
 * la tripla graffa.
 *
 * Si costruisce qui e non nel modello per due motivi.
 *
 * Il primo e una questione di escape: dentro un <script> il contenuto e
 * testo grezzo, e {{ }} ci metterebbe l escape HTML. Con un nome che
 * contiene & oppure un apostrofo nel JSON finirebbe "&amp;" o "&#39;", che
 * nessuno decodifica: i motori di ricerca indicizzerebbero proprio quella
 * stringa. jsonSicuro() fa invece l escape giusto per stare dentro uno
 * script (< diventa \\u003c, cosi nemmeno un </script> nel testo puo
 * chiudere il blocco).
 *
 * Il secondo: in JavaScript togliere i doppioni da sameAs e saltare i
 * campi vuoti sono due righe, nel modello sarebbero una condizione per
 * riga.
 */
function jsonLdPersona(testi, config, social, urlCanale) {
  const persona = { '@context': 'https://schema.org', '@type': 'Person' };

  // Un campo vuoto non si scrive: "email": "" in un dato strutturato non
  // vuol dire «non ce l ha», vuol dire «ce l ha ed e vuota».
  const metti = (nome, valore) => {
    const pulito = String(valore == null ? '' : valore).trim();
    if (pulito) { persona[nome] = pulito; }
  };

  metti('name', testi['marchio.nome']);
  metti('jobTitle', testi['marchio.ruolo']);
  // La descrizione e testo semplice per contratto (CONTRATTO-2 §7.1). Se un
  // giorno diventasse `ricco` andrebbe passata da testoricco.soloTesto():
  // in un dato strutturato il markup non ci va.
  metti('description', testi['meta.descrizione']);
  metti('url', urlCanale);
  metti('image', (config.immagini && config.immagini.avatar) || '');
  metti('email', config.email);

  // sameAs: il canale piu i social visibili, senza doppioni. La voce
  // «Twitch» dei social e lo stesso indirizzo di urlCanale, e ripeterlo due
  // volte non e ridondanza, e un dato sbagliato.
  const visti = new Set();
  const sameAs = [];
  for (const grezzo of [urlCanale].concat(social.map((voce) => voce.url))) {
    const url = String(grezzo || '').trim();
    if (!url) { continue; }
    // Il confronto ignora maiuscole e barra finale: sono lo stesso posto.
    const chiave = url.toLowerCase().replace(/\/+$/, '');
    if (visti.has(chiave)) { continue; }
    visti.add(chiave);
    sameAs.push(url);
  }
  if (sameAs.length) { persona.sameAs = sameAs; }

  return jsonSicuro(persona);
}

/* ------------------------------------------------------------------ */
/* IL CONTESTO INTERO                                                  */
/* ------------------------------------------------------------------ */

/**
 * Il contesto del §6.2. I testi entrano piatti (le loro chiavi contengono
 * il punto e restano cosi), la configurazione sotto `config`, gli elenchi
 * al primo livello perche il modello ci cicla sopra per nome.
 */
function costruisciContesto(contenuti, opzioni) {
  const scelte = opzioni || {};
  // Copia: da qui in avanti si riscrivono i valori ricchi, e il documento
  // originale e lo stesso che la pubblicazione risalva su contenuti.json.
  const testi = Object.assign({}, contenuti.testi);
  const config = archivio.copia(contenuti.config);
  sanificaRicchi(testi, config);

  const cache = new Map();
  const mancanti = [];

  const canale = String((config.twitch && config.twitch.canale) || '');
  const urlCanale = 'https://www.twitch.tv/' + canale;
  const social = elencoVisibile(config.social, cache, mancanti);

  const contesto = Object.assign({}, testi, {
    config: config,
    social: social,
    supporto: elencoVisibile(config.supporto, cache, mancanti),
    settimana: settimanaDi(config, testi),
    sito: {
      urlCanale: urlCanale,
      urlChat: 'https://www.twitch.tv/popout/' + canale + '/chat',
      mailto: 'mailto:' + String(config.email || ''),
      anno: new Date().getFullYear(),
      generatoIl: scelte.quando || new Date().toISOString(),
      orariTesto: orariTesto(config),
      // Indirizzo dei font scelti nel gruppo «Aspetto». Vuoto se sono tutti
      // di sistema: in quel caso testa.html non stampa nessun <link> e la
      // pagina non contatta Google.
      fontUrl: tema.urlGoogleFonts(config.tema),
      // Il dato strutturato gia serializzato: si stampa con {{{sito.jsonLd}}}.
      jsonLd: jsonLdPersona(testi, config, social, urlCanale)
    }
  });

  if (mancanti.length) {
    throw erroreHttp(500, 'Mancano le icone richieste dai contenuti: ' + mancanti.join(', ') +
      '. Sono file dell agente A: senza, le voci resterebbero senza simbolo.');
  }
  return contesto;
}

/* ------------------------------------------------------------------ */
/* js/dati.js                                                          */
/* ------------------------------------------------------------------ */

// Gli elenchi di frasi del pollo: i sei del CONTRATTO-2 §4.2 più `lurk`,
// aggiunto dal CONTRATTO-3 e usato quando il visitatore accende la modalità
// lurk. L'ordine è quello in cui compaiono nel pannello.
const FRASI_POLLO = ['riposo', 'click', 'chat', 'scrive', 'live', 'lurk', 'offline'];

/**
 * Il ramo `pollo` di window.DATI (CONTRATTO-2 §6.3), che legge js/pollo.js.
 * Gli interruttori si confrontano con `true` e non si convertono: se la
 * chiave manca — contenuti vecchi, configurazione a meta — il pollo resta
 * spento invece di aprire una socket verso la chat per un valore assente.
 * Le frasi vuote si tolgono qui: un fumetto vuoto e peggio di nessun
 * fumetto, e il JS non deve mettersi a controllare i dati.
 */
function polloDi(config, testi) {
  const pollo = (config.pollo && typeof config.pollo === 'object') ? config.pollo : {};
  const sorgente = (pollo.frasi && typeof pollo.frasi === 'object') ? pollo.frasi : {};

  const frasi = {};
  for (const nome of FRASI_POLLO) {
    frasi[nome] = (Array.isArray(sorgente[nome]) ? sorgente[nome] : [])
      .map((f) => String(f == null ? '' : f).trim())
      .filter((f) => f !== '');
  }

  return {
    attivo: pollo.attivo === true,
    chatVera: pollo.chatVera === true,
    mostraMessaggi: pollo.mostraMessaggi === true,
    frasi: frasi,
    testi: {
      etichetta: testi['pollo.etichetta'] || '',
      nascondi: testi['pollo.nascondi'] || ''
    }
  };
}

/**
 * Il ramo `account` di window.DATI, che legge js/account.js.
 *
 * E il profilo del sito: un login con Twitch che vale su tutto il sito e non
 * solo dentro la modalita lurk. Da qui passano la tessera dell utente, la
 * lettura dello stato vero del canale e il titolo dell ultima diretta
 * (js/canale.js), e il messaggio in chat del lurk, che senza un account non
 * avrebbe nessuno a nome di cui parlare.
 *
 * Stessa disciplina degli altri rami: senza Client ID non esiste nessuna app
 * Twitch da interrogare, e allora il login non si stampa affatto invece di
 * stamparsi rotto. Il `motivo` serve al sito per dirlo in locale a chi
 * amministra: dal browser i due casi sarebbero indistinguibili.
 */
function accountDi(config, testi) {
  const account = (config.account && typeof config.account === 'object') ? config.account : {};
  const clientId = String(account.clientId || '').trim();
  const attivo = account.attivo === true && clientId !== '';

  let motivo = '';
  if (account.attivo !== true) { motivo = 'spento'; }
  else if (clientId === '') { motivo = 'senzaClientId'; }

  return {
    attivo: attivo,
    motivo: motivo,
    // Il Client ID di un app che non si usa non deve finire in pagina: e un
    // dato pubblico per natura, ma stamparlo lo stesso vuol dire pubblicare
    // un app registrata a nome di qualcuno senza che serva a niente.
    clientId: attivo ? clientId : '',
    urlRitorno: attivo ? String(account.urlRitorno || '').trim() : '',
    testi: {
      entra: testi['account.entra'] || '',
      esci: testi['account.esci'] || '',
      collegato: testi['account.collegato'] || ''
      // `account.nota` non passa di qui: e un campo `ricco` e i campi ricchi
      // non entrano in js/dati.js, dove l HTML verrebbe stampato invece che
      // interpretato. Lo stampa il modello con la tripla graffa.
    }
  };
}

/**
 * Il ramo `lurk` di window.DATI (CONTRATTO-3 §6.4), che legge js/lurk.js.
 *
 * Stessa disciplina di polloDi(): gli interruttori si confrontano con `true`
 * e non si convertono. Qui vale doppio, perché in ballo non c'è un fumetto ma
 * un token di scrittura in chat: una chiave mancante deve lasciare la funzione
 * SPENTA, non accesa a metà.
 *
 * Le tre invarianti stanno qui e non nel browser perché la generazione è
 * l'unico punto che non si può scavalcare. js/lurk.js le rifà comunque:
 * js/dati.js è un file che si può modificare a mano dopo la generazione, e un
 * freno che vive solo dove non gira non è un freno.
 */
function lurkDi(config, testi, account) {
  const lurk = (config.lurk && typeof config.lurk === 'object') ? config.lurk : {};

  const frasi = (Array.isArray(lurk.frasi) ? lurk.frasi : [])
    .map((f) => String(f == null ? '' : f).trim())
    .filter((f) => f !== '');

  // Il Client ID non e piu del lurk: e del profilo del sito, e il messaggio in
  // chat e uno dei suoi usi. Senza profilo non c e nessuno a nome di cui
  // parlare, e senza frasi non ci sarebbe niente da mandare: in entrambi i
  // casi il bottone sarebbe un bottone che fallisce. Meglio non stamparlo.
  const conAccount = !!(account && account.attivo === true);
  const messaggioAttivo = lurk.messaggioAttivo === true && conAccount && frasi.length > 0;

  // Perche e spento, se e spento. Serve a una cosa sola: in locale il sito
  // lo scrive nel riquadro del lurk, cosi chi amministra non resta a
  // premere un bottone che non c e senza sapere cosa manca. Dal browser
  // quella distinzione non si puo fare — a valle sono tutti lo stesso
  // oggetto vuoto — quindi la si porta da qui.
  let motivo = '';
  if (lurk.messaggioAttivo !== true) { motivo = 'spento'; }
  else if (!conAccount) { motivo = 'senzaAccount'; }
  else if (frasi.length === 0) { motivo = 'senzaFrasi'; }

  // Un numero fuori scala non deve poter disattivare di fatto il controllo di
  // presenza (CONTRATTO-3 §3.5): si riporta dentro 1..12 invece di fidarsi.
  let ore = Number(lurk.oreMax);
  if (!Number.isFinite(ore)) { ore = 3; }
  ore = Math.min(12, Math.max(1, Math.round(ore)));

  return {
    attivo: lurk.attivo === true,
    tieniSchermoAcceso: lurk.tieniSchermoAcceso === true,
    oreMax: ore,
    messaggio: {
      attivo: messaggioAttivo,
      motivo: motivo,
      // Il Client ID e l indirizzo di ritorno stanno nel ramo `account`: qui
      // sarebbero una seconda copia dello stesso valore, e due copie sono
      // due cose che possono smettere di essere d accordo.
      frasi: messaggioAttivo ? frasi : []
    },
    testi: {
      accendi: testi['lurk.accendi'] || '',
      spegni: testi['lurk.spegni'] || '',
      audio: testi['lurk.audio'] || '',
      schermo: testi['lurk.schermo'] || '',
      ripresa: testi['lurk.ripresa'] || '',
      ciSei: testi['lurk.ciSei'] || '',
      ciSono: testi['lurk.ciSono'] || '',
      statoSpento: testi['lurk.statoSpento'] || '',
      statoVivo: testi['lurk.statoVivo'] || '',
      statoFermo: testi['lurk.statoFermo'] || '',
      statoRiparto: testi['lurk.statoRiparto'] || '',
      statoBloccato: testi['lurk.statoBloccato'] || '',
      statoAttesa: testi['lurk.statoAttesa'] || '',
      chiuso: testi['lurk.chiuso'] || '',
      statoResa: testi['lurk.statoResa'] || '',
      statoNiente: testi['lurk.statoNiente'] || '',
      conto: testi['lurk.conto'] || '',
      contoRiavvii: testi['lurk.contoRiavvii'] || '',
      // entra / esci / collegato sono passati al ramo `account`: il login non
      // e piu una cosa del lurk, e il bottone dentro il pannello del lurk usa
      // la stessa etichetta della tessera perche e lo stesso collegamento.
      preavviso: testi['lurk.preavviso'] || '',
      invito: testi['lurk.invito'] || '',
      manda: testi['lurk.manda'] || '',
      inviato: testi['lurk.inviato'] || ''
    }
  };
}

/** L'oggetto window.DATI, nella forma esatta del §6.3 e del CONTRATTO-2 §6.3. */
function oggettoDati(contenuti) {
  const config = contenuti.config;
  const testi = contenuti.testi;
  const twitch = config.twitch || {};
  const profilo = accountDi(config, testi);

  // Il player accetta l'embed solo se il dominio e fra i "parent": in locale
  // servono sempre questi due, e il JS aggiunge da se location.hostname.
  const domini = [];
  for (const dominio of (Array.isArray(twitch.domini) ? twitch.domini : []).concat(['localhost', '127.0.0.1'])) {
    const pulito = String(dominio || '').trim();
    if (pulito && domini.indexOf(pulito) === -1) { domini.push(pulito); }
  }

  return {
    twitch: { canale: String(twitch.canale || ''), idUtente: String(twitch.idUtente || ''), domini: domini },
    orari: {
      giorni: (config.orari && Array.isArray(config.orari.giorni)) ? config.orari.giorni.slice() : [],
      ora: (config.orari && config.orari.ora) || '',
      fuso: (config.orari && config.orari.fuso) || 'Europe/Rome',
      durataOre: (config.orari && config.orari.durataOre) || 0
    },
    email: String(config.email || ''),
    ultimaDiretta: String(config.ultimaDiretta || ''),
    testi: {
      statoLive: testi['deck.statoLive'] || '',
      statoOffline: testi['deck.statoOffline'] || '',
      statoVerifica: testi['deck.statoVerifica'] || '',
      chatApri: testi['deck.chatApri'] || '',
      chatChiudi: testi['deck.chatChiudi'] || '',
      // Le due etichette del nastro stanno insieme: sono la coppia che il JS
      // usa per marcare oggi e la prossima diretta.
      etichettaOggi: testi['settimana.etichettaOggi'] || '',
      etichettaProssima: testi['settimana.etichettaProssima'] || '',
      copiaBtn: testi['saluti.copiaBtn'] || '',
      copiaFatto: testi['saluti.copiaFatto'] || ''
    },
    pollo: polloDi(config, testi),
    // L ordine conta: il ramo del lurk dipende da quello dell account, perche
    // senza profilo il messaggio in chat resta spento comunque.
    account: profilo,
    lurk: lurkDi(config, testi, profilo)
  };
}

/** JSON pronto da incollare dentro un <script> senza sorprese. */
function jsonSicuro(valore) {
  return JSON.stringify(valore, null, 2)
    .replace(/</g, '\\u003c')
    // I due separatori di riga Unicode sono legali in JSON ma spezzerebbero
    // uno script inline: come escape valgono lo stesso e non fanno danni.
    .replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

/* ------------------------------------------------------------------ */
/* RESA                                                                */
/* ------------------------------------------------------------------ */

/** Rende i tre file in memoria. Non scrive niente su disco. */
function rendi(contenuti, opzioni) {
  const contesto = costruisciContesto(contenuti, opzioni);
  const cache = new Map();

  if (!eFile(P.modelloIndex)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloIndex) + ': senza modello non si genera niente.');
  }
  if (!eFile(P.modelloDati)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloDati) + ': e il modello di js/dati.js.');
  }

  const html = modello.rendiFile(P.modelloIndex, contesto, { file: 'modelli/index.html', cartella: P.modelli, cache: cache });
  const dati = modello.rendiFile(P.modelloDati, Object.assign({ dati: jsonSicuro(oggettoDati(contenuti)) }, contesto),
    { file: 'server/modelli/dati.js.tpl', cartella: P.modelli, cache: cache });
  // Il foglio del tema non passa dal motore di template: e calcolato, non
  // riempito. tema.css() non lancia mai, nemmeno con un tema mezzo scritto.
  const foglio = tema.css(contenuti.config.tema);

  return { html: html, dati: dati, tema: foglio, contesto: contesto };
}

/** Solo l'HTML, per l'anteprima: si rende al volo e non tocca il disco. */
function anteprima() {
  return rendi(archivio.leggi()).html;
}

/**
 * L'anteprima di contenuti che nessuno ha ancora salvato (CONTRATTO-2 §9).
 * Stessa resa della pubblicazione, senza backup, senza convalida e senza
 * scrivere: serve a far vedere nel pannello che effetto fa una modifica
 * prima di deciderla.
 */
function anteprimaDi(contenuti) {
  return rendi(contenuti).html;
}

/* ------------------------------------------------------------------ */
/* PUBBLICAZIONE (§6.4)                                                */
/* ------------------------------------------------------------------ */

/**
 * L'ordine e quello del contratto e non va cambiato:
 *   0. copertura dello schema   (se lo schema mente, tutto il resto mente)
 *   1. backup di index.html, js/dati.js, css/tema.css e contenuti.json
 *   2. convalida: se fallisce, si ferma qui e non scrive niente
 *   3. resa del modello, del template di dati.js e del foglio del tema
 *   4. scrittura atomica dei tre file
 *   5. timbro di aggiornatoIl su contenuti.json
 *
 * La resa avviene tutta in memoria PRIMA della prima scrittura: se il
 * modello e sbagliato non si arriva mai a toccare il disco, e sul sito
 * resta la versione di prima, intera.
 */
function genera(opzioni) {
  const scelte = opzioni || {};
  const inizio = Date.now();
  const contenuti = archivio.leggi();

  const scoperte = schema.verificaCopertura(contenuti);
  if (scoperte.length) {
    throw erroreHttp(500, 'Lo schema non copre i contenuti: ' + scoperte.length +
      (scoperte.length === 1 ? ' problema.' : ' problemi.'), { problemi: scoperte });
  }

  const copia = backup.crea();

  const errori = convalida.convalida(contenuti);
  if (errori.length) {
    throw erroreHttp(422, 'I contenuti non passano la convalida: ' + convalida.riassumi(errori) +
      '. Non ho scritto niente.', { errori: errori });
  }

  const reso = rendi(contenuti, scelte);

  // scriviAtomico crea da se la cartella che manca: js/ e css/ esistono
  // sempre, ma il collaudo genera anche dentro cartelle temporanee vuote.
  scriviAtomico(P.indexHtml, reso.html);
  scriviAtomico(P.datiJs, reso.dati);
  scriviAtomico(P.temaCss, reso.tema);

  const quando = archivio.salva(contenuti);

  return {
    ok: true,
    backup: copia,
    durataMs: Date.now() - inizio,
    aggiornatoIl: quando,
    scritti: [
      { file: 'index.html', byte: Buffer.byteLength(reso.html, 'utf8') },
      { file: 'js/dati.js', byte: Buffer.byteLength(reso.dati, 'utf8') },
      { file: 'css/tema.css', byte: Buffer.byteLength(reso.tema, 'utf8') }
    ],
    social: reso.contesto.social.length,
    supporto: reso.contesto.supporto.length,
    // Gli avvertimenti viaggiano CON l'esito, non al posto suo: la
    // pubblicazione e riuscita comunque, e chi la riceve decide se
    // mostrarli. Bloccare qui vorrebbe dire non poter piu provare in
    // locale un sito gia configurato per la produzione.
    controlli: controlli.controlli(contenuti)
  };
}

module.exports = {
  genera, anteprima, anteprimaDi, rendi, costruisciContesto,
  oggettoDati, orariTesto, settimanaDi, jsonSicuro, chiaviRicche
};
