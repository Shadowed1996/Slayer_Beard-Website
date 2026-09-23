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

   Con l'editor unico (CONTRATTO-4 §6) il contesto porta anche l'ordine e
   la visibilita delle sezioni, il corpo della pagina gia composto e i due
   CSS dell'editor (stili per elemento e blocchi posizionati), tutti usciti
   dal generatore condiviso pannello/condivisi/stili.js; e da qui esce anche
   la pagina per l'anteprima dell'editor.

   Nota sulla settimana: le voci escono in ordine italiano (lunedi per
   primo) ma ognuna porta il proprio `indice` con la numerazione di
   JavaScript (0 = domenica), che e quella di config.orari.giorni e quella
   che finisce in data-giorno per il JS del sito. Con la schedule rifatta
   (CONTRATTO-5 §5) config.orari passa SEMPRE da SBOrari.normalizza() prima
   di arrivare al modello e a js/dati.js: l'anteprima rende anche contenuti
   a meta, e un'ora scritta a meta non deve rompere la pagina.

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
const font = require('./font');
const backup = require('./backup');
/* Solo per l'ultima lettura salvata di che cosa c'e in onda (la categoria
   che mostra l'evento speciale acceso): niente rete da qui, genera() resta
   sincrona. Chiedere a Twitch e sempre un passo prima, alla pubblicazione. */
const twitch = require('./twitch');
// Solo per leggere gli iscritti gia salvati: niente rete nemmeno qui.
const youtube = require('./youtube');
const schema = require('../../contenuti/schema.js');
/* Le regole della schedule (CONTRATTO-5 §3.5). Sta sotto pannello/ perche
   lo stesso file lo carica il pannello: i giorni, i limiti e i conti con i
   fusi orari del sito generato e dell'editor escono dalle stesse funzioni.
   Il percorso e relativo a questo file, come per stili.js. */
const SBOrari = require('../../pannello/condivisi/orari.js');

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

/**
 * Il numero accanto a una voce dei social («Iscritti 3.670 / Goal 5.000»).
 * Twitch lo prende da config.dati.follower, YouTube da config.iscrittiYoutube
 * (server/lib/youtube.js). Senza un numero letto la voce resta com'era: il
 * goal da solo, senza il punto da cui si parte, non dice niente.
 */
function conContatore(voce, config) {
  let numero = null;
  if (voce.contatore === 'twitch') {
    const follower = Number((config.dati || {}).follower);
    numero = Number.isFinite(follower) && follower > 0 ? follower : null;
  } else if (voce.contatore === 'youtube') {
    numero = youtube.iscrittiDi(config, voce.url);
  }
  const goal = Number(voce.goal);
  return Object.assign({}, voce, {
    numeroTesto: numero === null ? '' : numeroTesto(numero),
    numeroEtichetta: String(voce.contatoreEtichetta || '').trim() || 'Iscritti',
    goalTesto: numero !== null && Number.isFinite(goal) && goal > 0 ? numeroTesto(goal) : '',
    // Il numero di Twitch porta data-follower: js/canale.js lo tiene fresco
    // dal vivo per chi e collegato, come quello della copertina.
    eTwitch: voce.contatore === 'twitch'
  });
}

/* ------------------------------------------------------------------ */
/* LA SCHEDULE (CONTRATTO-5 §5)                                        */
/* ------------------------------------------------------------------ */

/** Il ramo orari pulito, da config intera. normalizza() e idempotente: passarci due volte non cambia niente. */
function orariDi(config) {
  return SBOrari.normalizza(config && config.orari);
}

/**
 * L'istante della generazione, in ms. Gli eventi finiti si scartano
 * rispetto a questo momento: `adesso` (ms) lo fissa il collaudo, `quando`
 * (ISO) e quello che finisce anche nel timbro di js/dati.js, cosi pagina e
 * timbro raccontano lo stesso istante.
 */
function momentoDi(scelte) {
  if (scelte && typeof scelte.adesso === 'number' && Number.isFinite(scelte.adesso)) { return scelte.adesso; }
  const letto = scelte && typeof scelte.quando === 'string' ? Date.parse(scelte.quando) : NaN;
  return Number.isFinite(letto) ? letto : Date.now();
}

/* Quanto vale l'ultima lettura di «che cosa c'e in onda» (server/lib/twitch.js,
   aggiornaCategoria). La pubblicazione la chiede a Twitch un istante prima di
   generare: se quella salvata e piu vecchia di cosi vuol dire che Twitch non
   ha risposto, e allora meglio il gioco scritto a mano nel pannello che la
   categoria di ieri sera. */
const FRESCHEZZA_CATEGORIA_MS = 15 * 60 * 1000;

/**
 * La categoria che il canale sta trasmettendo davvero adesso, '' se non si sa.
 *
 * `scelte.categoriaDiretta` (una stringa) ha la precedenza e serve al
 * collaudo e all'anteprima: cosi costruisciContesto() resta una funzione di
 * dati, senza toccare il disco quando chi la chiama sa gia la risposta.
 * Altrimenti si legge server/dati/twitch-diretta.json — un file, non la rete:
 * la generazione resta sincrona come e sempre stata.
 *
 * Non lancia mai: senza collegamento a Twitch, senza file o con un file
 * storto la risposta e '' e gli eventi mostrano il gioco scritto a mano.
 */
function categoriaDiretta(scelte, adesso) {
  if (scelte && typeof scelte.categoriaDiretta === 'string') { return scelte.categoriaDiretta.trim(); }
  let letta = null;
  try { letta = twitch.direttaSalvata(); } catch (e) { return ''; }
  if (!letta || !letta.inOnda || !letta.categoria) { return ''; }
  const quando = Date.parse(letta.letteIl);
  if (!Number.isFinite(quando)) { return ''; }
  // Anche nel futuro: un orologio spostato indietro non deve far passare per
  // fresca una lettura di chissa quando.
  if (Math.abs(adesso - quando) > FRESCHEZZA_CATEGORIA_MS) { return ''; }
  return letta.categoria.trim();
}

/* Numeri per l'attributo style (CONTRATTO-5 §2.2). Arrivano gia stretti da
   normalizza(), ma qui si ristringono lo stesso: nell'attributo esce solo
   quello che questi tre calcoli producono, cifre, punto e segno di
   percento, e nessun valore scritto da chi amministra ci passa accanto. */
function percento(n) {
  return Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
}

function frazione(n) {
  return String(percento(n) / 100);
}

/** «--fuoco: 30% 20%; --velo: 0.6», oppure '' se non c'e un'immagine da inquadrare. */
function stileImmagine(immagine, fuoco, nome, valore) {
  if (!immagine) { return ''; }
  const f = fuoco || {};
  return '--fuoco: ' + percento(f.x) + '% ' + percento(f.y) + '%; --' + nome + ': ' + frazione(valore);
}

/**
 * I sette giorni, sempre tutti, nell'ordine di lettura italiano.
 *
 * `giorni` resta l'unica fonte di «oggi c'e diretta»: la scheda di un giorno
 * spento resta nei dati ma qui non esce niente di suo (ne ora, ne testi, ne
 * immagine), cosi riaccendendolo torna com'era senza che nel frattempo il
 * sito mostri una locandina di un giorno di riposo.
 */
/**
 * La data di calendario, nel fuso del canale, del prossimo giorno (oggi
 * compreso) che cade sul giorno della settimana `indice`: è la data VERA
 * che quella scheda del nastro rappresenta in QUESTA generazione, e serve
 * solo a sapere se ci cade sopra un giorno saltato (SBOrari.pausaDi) — il
 * nastro resta per il resto un modello astratto che si ripete ogni
 * settimana, non lega nessun altro suo campo a una data.
 */
function dataDiQuestaSettimana(adesso, fuso, indice) {
  for (let salto = 0; salto < 7; salto++) {
    const data = SBOrari.dataNelFuso(adesso + salto * 86400000, fuso);
    if (data && SBOrari.giornoDellaSettimana(data) === indice) { return data; }
  }
  return '';
}

function settimanaDi(config, testi, adesso) {
  const orari = orariDi(config);
  // Un evento speciale acceso all'istante della generazione ha la
  // precedenza: i giorni che gli finiscono sotto portano il suo titolo, e
  // il loro programma regolare si legge come quello che non vale piu
  // (modelli/parziali/settimana.html, css/sezioni.css). I testi del giorno
  // restano in pagina apposta: quando l'evento finisce js/sito.js toglie
  // is-sostituito e la serata di sempre torna, senza aspettare che qualcuno
  // ripubblichi il sito.
  const sostituito = SBOrari.programmaSostituito(orari, adesso);
  return SBOrari.ORDINE.map((indice) => {
    const giorno = SBOrari.GIORNI[indice];
    const diretta = orari.giorni.indexOf(indice) !== -1;
    const scheda = orari.schede[indice];
    const ora = diretta ? SBOrari.oraDi(orari, indice) : '';
    const titolo = diretta ? scheda.titolo : '';
    const gioco = diretta ? scheda.gioco : '';
    const nota = diretta ? scheda.nota : '';
    const immagine = diretta ? scheda.immagine : '';
    // Un giorno saltato per un motivo personale vince su tutto il resto —
    // anche su un evento speciale in corso (`sostituito` qui sotto si spegne
    // apposta con `!pausa &&`): non è una regola del calendario, è chi
    // amministra che dice «questo giorno preciso no».
    const dataOggi = dataDiQuestaSettimana(adesso, orari.fuso, indice);
    const pausa = dataOggi ? SBOrari.pausaDi(orari, dataOggi) : null;
    return {
      indice: indice,
      abbr: giorno.abbr,
      nome: giorno.nome,
      diretta: diretta,
      ora: ora,
      fine: diretta ? SBOrari.fine(ora, SBOrari.durataDi(orari, indice)) : '',
      tag: diretta ? (testi['settimana.etichettaDiretta'] || '') : (testi['settimana.etichettaRiposo'] || ''),
      titolo: titolo,
      gioco: gioco,
      nota: nota,
      // Il modello non sa fare «se c'e almeno uno di tre»: gli arriva deciso.
      contenuto: !!(titolo || gioco || nota),
      // Il titolo dell'evento che si prende questo giorno, '' se non ce n'e
      // nessuno (o se il giorno e saltato): il modello lo stampa e il giorno
      // prende is-sostituito.
      sostituito: (!pausa && sostituito.giorni[indice])
        ? (sostituito.evento.titolo || testi['settimana.etichettaEvento'] || '')
        : '',
      immagine: immagine,
      stile: stileImmagine(immagine, scheda.fuoco, 'velo', scheda.velo),
      saltata: !!pausa,
      motivoSaltata: pausa ? pausa.motivo : ''
    };
  });
}

/**
 * Gli eventi speciali non ancora finiti all'istante `adesso`, dal primo che
 * parte. Uno finito resta in contenuti.json (il pannello lo segna «Passato»)
 * ma qui non esce: la pagina generata non annuncia una maratona di ieri, e
 * quello che scade dopo la generazione lo toglie js/sito.js.
 *
 * `fine` e letta sull'orologio del canale all'istante di termine, non
 * sommata a mano: una maratona a cavallo del cambio d'ora finisce all'ora
 * vera. `inizio` e `termine` sono ISO in UTC, per data-inizio e data-fine.
 *
 * `categoria` (facoltativa) e quello che il canale sta trasmettendo davvero
 * in questo momento, letto da Twitch alla pubblicazione: la mostra SOLO
 * l'evento acceso adesso, al posto del gioco scritto a mano. Per una
 * maratona e proprio il campo che cambia di continuo, e nessuno torna nel
 * pannello a ogni cambio di gioco. Senza categoria — Twitch giu, canale
 * spento, collegamento non configurato — resta quello scritto a mano.
 */
/** «sabato 3 ottobre»: la stessa forma di dataTesto qui sotto, per una data qualsiasi. */
function dataInParole(data) {
  const d = data.split('-').map(Number);
  const giorno = SBOrari.GIORNI[SBOrari.giornoDellaSettimana(data)];
  const mese = SBOrari.MESI[d[1] - 1];
  return giorno.minuscolo + ' ' + d[2] + ' ' + mese.nome;
}

function eventiDi(orari, adesso, categoria) {
  const inOnda = typeof categoria === 'string' ? categoria.trim() : '';
  const acceso = inOnda ? SBOrari.eventoAttivo(orari, adesso) : null;
  return SBOrari.eventiFuturi(orari, adesso).map((evento) => {
    const d = evento.data.split('-').map(Number);
    const giorno = SBOrari.GIORNI[SBOrari.giornoDellaSettimana(evento.data)];
    const mese = SBOrari.MESI[d[1] - 1];
    // Solo l'evento acceso: quello di sabato prossimo mostra il gioco che
    // gli e stato scritto, non la categoria di stasera.
    const gioco = (acceso && acceso.indice === evento.indice) ? inOnda : evento.gioco;
    return {
      indice: evento.indice,
      data: evento.data,
      ora: evento.ora,
      // Un evento senza durata (durataOre === null) non ha una fine vera:
      // evento.termine è la data finta di ORE_APERTO (orari.js), e
      // stamparla come orario confonderebbe chi guarda. '' e il modello si
      // aspettano già questo: senza fine non si scrive « – niente».
      fine: evento.durataOre === null ? '' : SBOrari.oraNelFuso(evento.termine, orari.fuso),
      abbr: giorno.abbr,
      giorno: giorno.nome,
      numero: String(d[2]),
      mese: mese.abbr,
      dataTesto: giorno.minuscolo + ' ' + d[2] + ' ' + mese.nome,
      inizio: new Date(evento.inizio).toISOString(),
      termine: new Date(evento.termine).toISOString(),
      titolo: evento.titolo,
      gioco: gioco,
      nota: evento.nota,
      contenuto: !!(gioco || evento.nota),
      immagine: evento.immagine,
      stile: stileImmagine(evento.immagine, evento.fuoco, 'velo', evento.velo),
      // Solo un avviso («massimo entro il...»), scritto da chi amministra:
      // non e quello che decide quando l'evento sparisce (quello resta
      // durataOre, o la si toglie a mano — vedi orari.js, normalizzaEvento).
      ultimoGiornoTesto: evento.ultimoGiorno ? dataInParole(evento.ultimoGiorno) : ''
    };
  });
}

/**
 * Il fondale della sezione. Con intensita 0 e spento: l'immagine non si
 * stampa affatto, invece di scaricarla per poi disegnarla trasparente.
 */
function sfondoDi(orari) {
  const sfondo = orari.sfondo;
  const immagine = sfondo.intensita > 0 ? sfondo.immagine : '';
  return { immagine: immagine, stile: stileImmagine(immagine, sfondo.fuoco, 'intensita', sfondo.intensita) };
}

const MESI = SBOrari.MESI.map((mese) => mese.nome);

/** m:ss. Le clip di Twitch stanno fra 5 e 60 secondi, ma non si scommette. */
function durataTesto(secondi) {
  const totale = Math.max(0, Math.round(Number(secondi) || 0));
  const minuti = Math.floor(totale / 60);
  const resto = totale % 60;
  return minuti + ':' + String(resto).padStart(2, '0');
}

/**
 * Il numero con il punto delle migliaia, all'italiana.
 * Si scrive a mano invece di usare toLocaleString: la formattazione dipende
 * dai dati ICU, che in una build ridotta di Node possono non esserci, e un
 * sito che stampa «1,234» invece di «1.234» a seconda di come e stato
 * compilato l'interprete e un sito che sbaglia in silenzio.
 */
function numeroTesto(valore) {
  const n = Math.max(0, Math.round(Number(valore) || 0));
  const cifre = String(n);
  let fuori = '';
  for (let i = 0; i < cifre.length; i++) {
    if (i > 0 && (cifre.length - i) % 3 === 0) { fuori += '.'; }
    fuori += cifre[i];
  }
  return fuori;
}

/** «3 gennaio 2026», oppure stringa vuota se la data non si legge. */
function dataTesto(iso) {
  const quando = new Date(String(iso || ''));
  if (Number.isNaN(quando.getTime())) { return ''; }
  return quando.getUTCDate() + ' ' + MESI[quando.getUTCMonth()] + ' ' + quando.getUTCFullYear();
}

/**
 * La vetrina delle clip, pronta da stampare.
 *
 * Le voci le riempie server/lib/twitch.js alla pubblicazione: qui si
 * formatta e basta. La sezione e accesa solo se c'e almeno una clip —
 * un titolo con sotto il vuoto e peggio di nessun titolo, e il modello non
 * deve mettersi a distinguere fra «spenta» e «accesa ma vuota».
 */
function clipDi(config, testi) {
  const clip = (config.clip && typeof config.clip === 'object') ? config.clip : {};
  const grezze = Array.isArray(clip.voci) ? clip.voci : [];

  // Il tetto vale anche qui e non solo alla richiesta: chi abbassa «quante»
  // dal pannello si aspetta di vederne meno subito, senza dover ripescare
  // le clip da Twitch.
  let quante = Number(clip.quante);
  if (!Number.isFinite(quante)) { quante = 6; }
  quante = Math.min(12, Math.max(1, Math.round(quante)));

  const voci = [];
  for (const voce of grezze) {
    const url = String((voce && voce.url) || '').trim();
    const titolo = String((voce && voce.titolo) || '').trim();
    if (!url || !titolo) { continue; }
    const autore = String((voce && voce.autore) || '').trim();
    voci.push({
      titolo: titolo,
      url: url,
      anteprima: String((voce && voce.anteprima) || '').trim(),
      durata: durataTesto(voce && voce.durataSec),
      visualizzazioni: numeroTesto(voce && voce.visualizzazioni),
      autore: autore,
      // Il modello non sa fare «se c'e l'autore»: gli si passa gia deciso.
      firma: autore ? (testi['clip.di'] || '') + ' ' + autore : '',
      quando: dataTesto(voce && voce.creataIl)
    });
    if (voci.length >= quante) { break; }
  }

  return { attivo: clip.attivo === true && voci.length > 0, voci: voci };
}

/**
 * La pagina «clip.html»: tutte le clip che il server ha portato a casa, con
 * addosso la loro data.
 *
 * Qui non si filtra niente per periodo, ed e il punto di tutta la faccenda:
 * il sito e statico e le chiavi di Twitch non escono da questo computer,
 * quindi il browser non puo chiedere «e quelle delle ultime 24 ore?» a
 * nessuno. Le clip dei quattro periodi si incorporano TUTTE nella pagina,
 * ognuna con la sua data in un attributo, e il filtro del visitatore
 * nasconde e rimostra quello che e gia li (js/clip.js). Il numero del
 * pannello e il tetto per periodo, non il totale: l'elenco qui sotto e
 * l'unione delle quattro finestre e puo essere piu lungo.
 */
function clipPaginaDi(config, testi) {
  const clip = (config.clip && typeof config.clip === 'object') ? config.clip : {};
  const grezze = Array.isArray(clip.archivio) ? clip.archivio : [];

  let quante = Number(clip.quanteArchivio);
  if (!Number.isFinite(quante)) { quante = 12; }
  quante = Math.min(50, Math.max(4, Math.round(quante)));

  const voci = [];
  for (const voce of grezze) {
    const url = String((voce && voce.url) || '').trim();
    const titolo = String((voce && voce.titolo) || '').trim();
    if (!url || !titolo) { continue; }

    // Senza una data valida la clip non si puo collocare in nessun periodo, e
    // finirebbe per restare in pagina qualunque bottone si prema: meglio
    // fuori. Non e un caso che capiti — Twitch la data ce l'ha sempre — ma un
    // elenco che arriva da fuori si controlla lo stesso.
    const quando = new Date(String((voce && voce.creataIl) || ''));
    if (Number.isNaN(quando.getTime())) { continue; }

    const autore = String((voce && voce.autore) || '').trim();
    voci.push({
      titolo: titolo,
      url: url,
      anteprima: String((voce && voce.anteprima) || '').trim(),
      durata: durataTesto(voce && voce.durataSec),
      visualizzazioni: numeroTesto(voce && voce.visualizzazioni),
      autore: autore,
      firma: autore ? (testi['clip.di'] || '') + ' ' + autore : '',
      quando: dataTesto(voce && voce.creataIl),
      // L'istante esatto, quello su cui lavora il filtro nel browser. In
      // ISO con la Z: il confronto e fra due istanti assoluti, quindi
      // funziona uguale per chi legge da un altro fuso orario.
      iso: quando.toISOString()
    });
  }

  return { attivo: clip.attivo === true && voci.length > 0, voci: voci, quante: quante };
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

/** «a, b e c»: l'elenco all'italiana, senza virgola prima della «e». */
function elencoItaliano(voci) {
  return voci.length === 1 ? voci[0] : voci.slice(0, -1).join(', ') + ' e ' + voci[voci.length - 1];
}

/**
 * «Lunedì, mercoledì, venerdì e domenica alle 21:00» se tutti i giorni
 * partono alla stessa ora; altrimenti l'ora va detta giorno per giorno,
 * «Lunedì alle 21:00, mercoledì alle 18:30 e domenica alle 16:00». Nessun
 * raggruppamento a meta («lunedì e mercoledì alle 21:00, domenica…»): e un
 * testo che si legge ad alta voce (aria-label del nastro) e nel conto alla
 * rovescia senza JavaScript, e una forma sola si capisce meglio.
 */
function orariTesto(config) {
  const orari = orariDi(config);
  const ordinati = SBOrari.ORDINE.filter((g) => orari.giorni.indexOf(g) !== -1);
  if (!ordinati.length) { return ''; }

  const nome = (g, i) => (i === 0 ? SBOrari.GIORNI[g].nome : SBOrari.GIORNI[g].minuscolo);
  const ore = ordinati.map((g) => SBOrari.oraDi(orari, g));
  if (ore.every((ora) => ora === ore[0])) {
    return elencoItaliano(ordinati.map(nome)) + ' alle ' + ore[0];
  }
  return elencoItaliano(ordinati.map((g, i) => nome(g, i) + ' alle ' + ore[i]));
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
  // volte non e ridondanza, e un dato sbagliato. Le voci Amazon (lista dei
  // desideri, link affiliato) restano fuori: non sono un profilo della persona.
  const visti = new Set();
  const sameAs = [];
  const profili = social.filter((voce) => !String(voce.icona || '').startsWith('amazon'));
  for (const grezzo of [urlCanale].concat(profili.map((voce) => voce.url))) {
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
/* SEZIONI, STILI E DISPOSIZIONE (CONTRATTO-4 §6)                       */
/* ------------------------------------------------------------------ */

/**
 * Il generatore condiviso (pannello/condivisi/stili.js, CONTRATTO-4 §8).
 * Sta sotto pannello/ perche lo stesso file lo carica il browser: l'anteprima
 * dal vivo del pannello e il sito pubblicato escono dalle stesse funzioni, e
 * cosi non possono divergere. Il percorso e relativo a questo file e non
 * alla radice dei contenuti: il collaudo genera in una cartella temporanea
 * che il pannello non ce l'ha.
 */
function generatore() {
  return require('../../pannello/condivisi/stili.js');
}

/**
 * Le opzioni che servono al generatore per i font. `base` e il percorso da
 * chi carica il CSS alla radice del sito: '' per uno <style> dentro la pagina.
 */
function opzioniStili(base) {
  return {
    famiglia: (nome) => {
      const trovata = tema.famigliaCatalogo(nome);
      return trovata ? { nome: trovata.nome, ripiego: trovata.ripiego } : null;
    },
    font: (id) => font.voce(id),
    base: base
  };
}

/**
 * Ripulisce SUL POSTO i tre rami dell'editor e gli slot dei font del tema,
 * prima della convalida (CONTRATTO-4 §6.5): un valore sbagliato si scarta
 * invece di bloccare il salvataggio di tutto il resto. Chi chiama passa un
 * documento suo (una copia, o quello appena letto dal disco).
 *
 * Un ramo assente resta assente: la pulizia non inventa chiavi che lo schema
 * potrebbe non conoscere. Uno slot del tema che punta a un font caricato e
 * poi cancellato torna alla famiglia di partenza, che e anche quello che
 * css/tema.css gli mette gia: cancellare un font in uso richiede una
 * conferma esplicita, e dopo quella conferma una pubblicazione bloccata da
 * «font inesistente» sarebbe una trappola.
 */
function pulisciEditor(contenuti) {
  const config = contenuti && contenuti.config;
  if (!config || typeof config !== 'object') { return contenuti; }
  const SB = generatore();
  if (config.sezioni !== undefined) { config.sezioni = SB.pulisciSezioni(config.sezioni); }
  if (config.stili !== undefined) { config.stili = SB.pulisciStili(config.stili, opzioniStili('')); }
  if (config.disposizione !== undefined) { config.disposizione = SB.pulisciDisposizione(config.disposizione); }

  /* La schedule (CONTRATTO-5 §5.3) e diversa dai tre rami qui sopra: i suoi
     valori li scrive chi amministra in caselle vere, e un titolo di 45
     caratteri va detto, non tagliato di nascosto. Quindi si ripulisce SOLO
     se e gia valida: allora normalizza() non cambia niente di quello che si
     vede, e mette solo la forma completa (sette schede, eventi e fondale
     anche in un contenuti.json di prima). Se non e valida resta com'e, e la
     convalida che viene dopo dice che cosa non va. */
  if (config.orari !== undefined && SBOrari.problemi(config.orari).length === 0) {
    config.orari = SBOrari.normalizza(config.orari);
  }

  const slot = config.tema && config.tema.font;
  if (slot && typeof slot === 'object') {
    for (const nome of Object.keys(tema.PREDEFINITO.font)) {
      const valore = slot[nome];
      if (typeof valore === 'string' && valore.indexOf(tema.PREFISSO_CARICATO) === 0 &&
          !font.esiste(valore.slice(tema.PREFISSO_CARICATO.length))) {
        slot[nome] = tema.PREDEFINITO.font[nome];
      }
    }
  }
  return contenuti;
}

/** I nomi del catalogo scelti con `famiglia:<nome>` negli stili: servono all'indirizzo di Google Fonts. */
function famiglieNegliStili(stili) {
  const nomi = [];
  for (const bersaglio of Object.keys(stili || {})) {
    const dispositivi = stili[bersaglio] || {};
    for (const dispositivo of Object.keys(dispositivi)) {
      const valore = dispositivi[dispositivo] && dispositivi[dispositivo].font;
      if (typeof valore !== 'string' || valore.indexOf('famiglia:') !== 0) { continue; }
      const nome = valore.slice('famiglia:'.length);
      if (nomi.indexOf(nome) === -1) { nomi.push(nome); }
    }
  }
  return nomi;
}

// Gli elementi che non hanno una chiusura: non entrano nella pila.
const ELEMENTI_VUOTI = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Quali blocchi ha davvero la pagina, riquadro per riquadro:
 * { chi: Set(['chi.corpo', …]) }. Un blocco conta solo per il riquadro che
 * lo contiene piu da vicino — lo stesso `parentElement.closest()` del motore
 * (CONTRATTO-4 §10): e quello il suo rettangolo di riferimento, e una
 * posizione misurata su un altro sarebbe sbagliata.
 *
 * Non serve un parser HTML: la pagina esce dai modelli, e ogni elemento che
 * si apre si chiude. Basta una pila dei tag aperti, saltando commenti,
 * elementi vuoti e contenuto di script e style.
 */
function blocchiPresenti(html) {
  const presenti = Object.create(null);
  const pila = [];   // { tag, riquadro }: il riquadro piu vicino, ereditato
  const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let trovato;
  while ((trovato = tag.exec(html)) !== null) {
    if (!trovato[2]) { continue; }
    const nome = trovato[2].toLowerCase();
    if (trovato[1]) {
      for (let i = pila.length - 1; i >= 0; i--) {
        if (pila[i].tag === nome) { pila.length = i; break; }
      }
      continue;
    }
    const attributi = trovato[3];
    const sopra = pila.length ? pila[pila.length - 1].riquadro : null;
    const blocco = /\sdata-sb-blocco="([^"]*)"/.exec(attributi);
    if (blocco && sopra) {
      if (!presenti[sopra]) { presenti[sopra] = new Set(); }
      presenti[sopra].add(blocco[1]);
    }
    if (nome === 'script' || nome === 'style') {
      const chiusura = html.indexOf('</' + nome, tag.lastIndex);
      tag.lastIndex = chiusura === -1 ? html.length : chiusura;
      continue;
    }
    if (ELEMENTI_VUOTI.has(nome) || /\/\s*$/.test(attributi)) { continue; }
    const riquadro = /\sdata-sb-riquadro="([^"]*)"/.exec(attributi);
    pila.push({ tag: nome, riquadro: riquadro ? riquadro[1] : sopra });
  }
  return presenti;
}

/**
 * Un CSS pronto da mettere dentro uno <style>. Nessuna regola generata ha
 * bisogno di un `<`, e senza non esiste valore che possa chiudere lo
 * <style> prima del tempo: \3C e la stessa lettera scritta come escape CSS.
 */
function cssInPagina(css) {
  return String(css || '').replace(/</g, '\\3C ');
}

/* ------------------------------------------------------------------ */
/* IL CONTESTO INTERO                                                  */
/* ------------------------------------------------------------------ */

/**
 * Il contesto del §6.2. I testi entrano piatti (le loro chiavi contengono
 * il punto e restano cosi), la configurazione sotto `config`, gli elenchi
 * al primo livello perche il modello ci cicla sopra per nome.
 */
function nomeTracciaSicuro(valore) {
  const pulito = String(valore || '').trim().replace(/\\/g, '/');
  if (!pulito || pulito.indexOf('/') > -1 || pulito.indexOf('..') > -1) { return ''; }
  return pulito;
}

function tracceDi(config) {
  const cartella = String((config.musica && config.musica.cartella) || 'mp3').trim().replace(/^\/+|\/+$/g, '');
  const elenco = Array.isArray(config.tracce) ? config.tracce : [];
  const fuori = [];
  for (const voce of elenco) {
    if (!voce || typeof voce !== 'object') { continue; }
    const file = nomeTracciaSicuro(voce.file);
    if (!file) { continue; }
    fuori.push({
      titolo: String(voce.titolo || '').trim(),
      artista: String(voce.artista || '').trim(),
      src: (cartella ? cartella + '/' : '') + file.split('/').map(encodeURIComponent).join('/'),
      cover: String(voce.cover || '').trim(),
      link: String(voce.link || '').trim()
    });
  }
  return fuori;
}

function referralDi(config, testi) {
  const voce = (config.referral && typeof config.referral === 'object') ? config.referral : {};
  const url = String(voce.url || '').trim();
  return {
    attivo: voce.attivo === true && url !== '',
    url: url,
    titolo: testi['saluti.referralTitolo'] || '',
    btn: testi['saluti.referralBtn'] || ''
  };
}

function musicaDi(config, testi) {
  const voce = (config.musica && typeof config.musica === 'object') ? config.musica : {};
  const tracce = tracceDi(config);
  return {
    attivo: voce.attivo === true && tracce.length > 0,
    aperto: voce.aperto !== false,
    quante: tracce.length,
    titolo: testi['musica.titolo'] || '',
    play: testi['musica.play'] || '',
    pausa: testi['musica.pausa'] || '',
    precedente: testi['musica.precedente'] || '',
    successiva: testi['musica.successiva'] || '',
    avanzamento: testi['musica.avanzamento'] || '',
    casuale: testi['musica.casuale'] || '',
    volume: testi['musica.volume'] || '',
    muto: testi['musica.muto'] || '',
    suono: testi['musica.suono'] || '',
    riduci: testi['musica.riduci'] || '',
    apri: testi['musica.apri'] || '',
    elenco: testi['musica.elenco'] || ''
  };
}

function musicaDati(config, testi) {
  const voce = (config.musica && typeof config.musica === 'object') ? config.musica : {};
  return {
    aperto: voce.aperto !== false,
    casuale: voce.casuale === true,
    tracce: voce.attivo === true ? tracceDi(config) : [],
    testi: {
      play: testi['musica.play'] || '',
      pausa: testi['musica.pausa'] || '',
      muto: testi['musica.muto'] || '',
      suono: testi['musica.suono'] || '',
      errore: testi['musica.errore'] || '',
      casuale: testi['musica.casuale'] || '',
      ordine: testi['musica.ordine'] || '',
      bloccato: testi['musica.bloccato'] || ''
    }
  };
}

function costruisciContesto(contenuti, opzioni) {
  const scelte = opzioni || {};
  // Copia: da qui in avanti si riscrivono i valori ricchi, e il documento
  // originale e lo stesso che la pubblicazione risalva su contenuti.json.
  const testi = Object.assign({}, contenuti.testi);
  const config = archivio.copia(contenuti.config);
  sanificaRicchi(testi, config);

  // L'indirizzo pubblico in forma buona (CONTRATTO-6 §4.2): quello scritto
  // nel pannello se c'e, altrimenti SB_SITO, e in tutti e due i casi passato
  // dalla stessa normalizzazione — cosi «https://slayerbeard.com» e
  // «https://slayerbeard.com/» danno la stessa pagina.
  //
  // Si scrive nella COPIA, che e quella che va al modello: il link canonico
  // e le anteprime social lo trovano dove l'hanno sempre trovato e
  // testa.html non cambia di una riga. Su contenuti.json non finisce niente
  // — il documento vero e quello che il pannello risalva, e ne un valore
  // dell'ambiente ne una barra aggiunta da noi devono entrarci di nascosto.
  const sito = controlli.indirizzoSito(config);
  config.sitoUrl = sito.indirizzo;

  // I tre rami dell'editor si ripuliscono anche qui e non solo prima di
  // salvare: l'anteprima rende contenuti che nessuno ha convalidato, e un
  // valore storto deve sparire dalla pagina, non romperla.
  const SB = generatore();
  config.sezioni = SB.pulisciSezioni(config.sezioni);
  config.stili = SB.pulisciStili(config.stili, opzioniStili(''));
  config.disposizione = SB.pulisciDisposizione(config.disposizione);
  const attive = config.sezioni.filter((voce) => voce.attiva);
  // Stessa ragione per la schedule: da qui in giu `config.orari` e sempre
  // completo e pulito, anche per {{config.orari.ora}} della copertina.
  config.orari = orariDi(config);
  const adesso = momentoDi(scelte);
  const eventi = eventiDi(config.orari, adesso, categoriaDiretta(scelte, adesso));

  const cache = scelte.cache || new Map();
  const mancanti = [];

  const canale = String((config.twitch && config.twitch.canale) || '');
  const urlCanale = 'https://www.twitch.tv/' + canale;
  const social = elencoVisibile(config.social, cache, mancanti).map((voce) => conContatore(voce, config));

  const attiva = {};
  for (const id of SB.SEZIONI_ORDINABILI) { attiva[id] = false; }
  for (const voce of attive) { attiva[voce.id] = true; }

  const contesto = Object.assign({}, testi, {
    config: config,
    social: social,
    supporto: elencoVisibile(config.supporto, cache, mancanti),
    settimana: settimanaDi(config, testi, adesso),
    clip: clipDi(config, testi),
    clipPagina: clipPaginaDi(config, testi),
    sito: {
      urlCanale: urlCanale,
      urlChat: 'https://www.twitch.tv/popout/' + canale + '/chat',
      mailto: 'mailto:' + String(config.email || ''),
      anno: new Date().getFullYear(),
      generatoIl: scelte.quando || new Date(adesso).toISOString(),
      orariTesto: orariTesto(config),
      // Il numero dei follower, con il punto delle migliaia: e l unico dei
      // numeri della copertina e di «Chi sono» che non si scrive a mano,
      // perche la pubblicazione lo chiede a Twitch (server/lib/twitch.js).
      follower: numeroTesto((config.dati || {}).follower),
      // CONTRATTO-5 §5.1: gli eventi ancora da finire, e il fondale della
      // sezione con lo stile gia costruito dai numeri puliti.
      eventi: eventi,
      haEventi: eventi.length > 0,
      referral: referralDi(config, testi),
      musica: musicaDi(config, testi),
      settimanaSfondo: sfondoDi(config.orari),
      // Indirizzo dei font scelti nel gruppo «Aspetto» e di quelli del
      // catalogo scelti negli stili dei singoli elementi. Vuoto se sono tutti
      // di sistema o caricati: in quel caso testa.html non stampa nessun
      // <link> e la pagina non contatta Google.
      fontUrl: tema.urlGoogleFonts(config.tema, famiglieNegliStili(config.stili)),
      // Il dato strutturato gia serializzato: si stampa con {{{sito.jsonLd}}}.
      jsonLd: jsonLdPersona(testi, config, social, urlCanale),

      // CONTRATTO-4 §6.1. Le sezioni accese, nell'ordine scelto nel
      // Navigatore; `attiva` per i link che puntano a una sezione, cosi una
      // sezione spenta non lascia ancore morte; `voci` per il binario.
      sezioni: attive.map((voce) => ({ id: voce.id, attiva: true })),
      attiva: attiva,
      voci: attive.map((voce) => ({
        id: voce.id,
        chiave: 'nav.' + voce.id,
        testo: typeof testi['nav.' + voce.id] === 'string' ? testi['nav.' + voce.id] : ''
      })),
      corpo: '',
      cssStili: cssInPagina(SB.stiliCss(config.stili, opzioniStili(''))),
      cssDisposizione: ''
    }
  });

  // Le due cose che la pagina delle clip ha di suo rispetto alla home: dove
  // sta (per il canonico e per il link che ci porta) e che cosa racconta di
  // se a un motore di ricerca. La descrizione e la riga di presentazione
  // della pagina, ripulita dal grassetto perche finisce dentro un
  // attributo; se e vuota si ripiega su quella del sito, che c'e sempre.
  const presentazioneClip = testoricco.soloTesto(testi['clip.paginaTesto'] || '');
  contesto.sito.paginaClip = {
    url: 'clip.html',
    canonico: config.sitoUrl ? config.sitoUrl + 'clip.html' : 'clip.html',
    titolo: (testi['clip.paginaTitolo'] || '') + ' · ' + (testi['marchio.nome'] || ''),
    descrizione: presentazioneClip || String(testi['meta.descrizione'] || '')
  };

  if (mancanti.length) {
    throw erroreHttp(500, 'Mancano le icone richieste dai contenuti: ' + mancanti.join(', ') +
      '. Sono file dell agente A: senza, le voci resterebbero senza simbolo.');
  }

  // Il motore dei modelli non ha inclusioni dinamiche, e non gliene serve
  // una: l'ordine delle sezioni lo decide la generazione, che rende ogni
  // parziale col contesto della pagina e li unisce. L'a capo fra l'una e
  // l'altra e quello che modelli/index.html metteva fra un'inclusione e la
  // successiva, quindi con le sei sezioni nell'ordine di partenza la pagina
  // e identica a prima.
  const include = (nome) => modello.rendi('{{> parziali/' + nome + '}}', contesto,
    { file: 'modelli/index.html', cartella: P.modelli, cache: cache });
  contesto.sito.corpo = attive.map((voce) => include(voce.id)).join('\n');

  // La disposizione si scrive solo per i blocchi che la pagina ha davvero
  // (una sezione spenta non li ha): una regola per un blocco assente
  // allungherebbe il riquadro per niente. I riquadri stanno nelle sezioni e
  // nel piede, e il piede si rende una volta in piu solo se c'e qualcosa da
  // posizionare.
  const blocchi = config.disposizione.blocchi;
  if (Object.keys(blocchi).some((riquadro) => blocchi[riquadro].length)) {
    const presenti = blocchiPresenti(contesto.sito.corpo + '\n' + include('piede'));
    contesto.sito.cssDisposizione = cssInPagina(SB.disposizioneCss(config.disposizione, {
      presente: (riquadro, id) => !!(presenti[riquadro] && presenti[riquadro].has(id))
    }));
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
 * Il ramo `chi` di window.DATI, che legge js/sito.js: le frasi che il pollo
 * del ritratto dice quando lo si clicca. Stessa pulizia delle frasi del
 * pollo accanto alla chat; un elenco vuoto lascia il ritratto un'immagine.
 *
 * `emote` porta { nome: indirizzo } per le sole emote di Twitch che
 * compaiono come parola intera in una frase: l'elenco completo lo salva la
 * pubblicazione in server/dati/twitch-emote.json (twitch.aggiornaEmote) e
 * in pagina non serve. Senza quel file le frasi restano testo e basta.
 */
function chiDi(config) {
  const chi = (config.chi && typeof config.chi === 'object') ? config.chi : {};
  const frasi = (Array.isArray(chi.frasi) ? chi.frasi : [])
    .map((f) => String(f == null ? '' : f).trim())
    .filter((f) => f !== '');

  let tutte = {};
  if (frasi.length) {
    try { tutte = twitch.emoteSalvate(); } catch (e) { tutte = {}; }
  }
  const emote = {};
  for (const frase of frasi) {
    for (const parola of frase.split(/\s+/)) {
      const voce = Object.prototype.hasOwnProperty.call(tutte, parola) ? tutte[parola] : null;
      if (!voce || emote[parola] || !/^[A-Za-z0-9_]+$/.test(String(voce.id || ''))) { continue; }
      emote[parola] = 'https://static-cdn.jtvnw.net/emoticons/v2/' + voce.id + '/'
        + (voce.animata ? 'animated' : 'static') + '/dark/2.0';
    }
  }
  return { frasi: frasi, emote: emote };
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

  // Ogni quanti minuti il messaggio si ripete a lurk acceso (CONTRATTO-3
  // §4.1). Stessa regola di oreMax: fuori scala si stringe al bordo, e sotto
  // i due minuti si finirebbe addosso al freno di un invio al minuto.
  let minuti = Number(lurk.minutiFraMessaggi);
  if (!Number.isFinite(minuti)) { minuti = 10; }
  minuti = Math.min(120, Math.max(2, Math.round(minuti)));

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
      frasi: messaggioAttivo ? frasi : [],
      minuti: minuti
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

/**
 * Il ramo `orari` di window.DATI (CONTRATTO-5 §5.2), che legge js/sito.js
 * per il conto alla rovescia, il nastro e gli eventi.
 *
 * I quattro campi di sempre restano uguali e nello stesso ordine; `ore` e
 * `durate` portano gia i ripieghi di serie, cosi il browser non deve
 * conoscere le regole delle schede: per lui un giorno acceso ha un'ora e
 * una durata, punto. Gli eventi sono solo quelli non ancora finiti alla
 * generazione, con gli istanti in UTC: il fuso l'ha gia risolto il server,
 * ora legale compresa. `indice` e `data` in piu servono a ritrovare il
 * li.evento e il giorno del nastro su cui cade.
 */
function orariDati(config, adesso) {
  const orari = orariDi(config);
  const ore = {};
  const durate = {};
  for (const giorno of orari.giorni) {
    ore[giorno] = SBOrari.oraDi(orari, giorno);
    durate[giorno] = SBOrari.durataDi(orari, giorno);
  }
  return {
    giorni: orari.giorni.slice(),
    ora: orari.ora,
    fuso: orari.fuso,
    durataOre: orari.durataOre,
    ore: ore,
    durate: durate,
    eventi: SBOrari.eventiFuturi(orari, adesso).map((evento) => ({
      indice: evento.indice,
      data: evento.data,
      inizio: new Date(evento.inizio).toISOString(),
      termine: new Date(evento.termine).toISOString(),
      titolo: evento.titolo
    }))
  };
}

/**
 * L'oggetto window.DATI, nella forma esatta del §6.3 e del CONTRATTO-2 §6.3.
 * `opzioni` e quella di rendi(): serve solo l'istante (adesso o quando) per
 * scartare gli eventi gia finiti.
 */
function oggettoDati(contenuti, opzioni) {
  const config = contenuti.config;
  const testi = contenuti.testi;
  const twitch = config.twitch || {};
  const profilo = accountDi(config, testi);

  // Il player accetta l'embed solo se il dominio e fra i "parent": in locale
  // servono sempre questi due, e il JS aggiunge da se location.hostname.
  //
  // All'elenco si aggiunge sempre l'host del sito, con e senza www
  // (CONTRATTO-6 §4.2): per Twitch sono due `parent` diversi, e chi arriva
  // da www.slayerbeard.com vedrebbe un riquadro nero se ci fosse solo
  // l'altro. Si fa da qualunque parte arrivi l'indirizzo — dal campo del
  // pannello o da SB_SITO — perche la ragione e la stessa: il sito si vede
  // a quel nome, quindi il player deve saperlo. L'elenco scritto a mano
  // resta per gli altri nomi, quelli che solo chi amministra conosce.
  const sito = controlli.indirizzoSito(config);
  const delSito = sito.host ? [sito.host, 'www.' + sito.host] : [];

  const domini = [];
  for (const dominio of (Array.isArray(twitch.domini) ? twitch.domini : [])
    .concat(delSito).concat(['localhost', '127.0.0.1'])) {
    const pulito = String(dominio || '').trim();
    if (pulito && domini.indexOf(pulito) === -1) { domini.push(pulito); }
  }

  return {
    twitch: {
      canale: String(twitch.canale || ''),
      idUtente: String(twitch.idUtente || ''),
      /* Diretta condivisa: player e canale restano sempre i propri (siete
         in onda tutti e due, ognuno vero sul suo), quindi qui non c'e'
         nessuno scambio da fare. Il valore serve solo a js/lurk.js, per
         mettere l'etichetta «[LURKO DA SLAYER_BEARD]» davanti al messaggio. */
      direttaCondivisa: twitch.direttaCondivisa === true,
      domini: domini
    },
    orari: orariDati(config, momentoDi(opzioni)),
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
      // Le tre della schedule rifatta (CONTRATTO-5 §5.2): il segno «in onda»
      // sul giorno di oggi, l'ora nel fuso di chi guarda e il bollino degli
      // eventi, che js/sito.js mette anche sul giorno in cui un evento cade.
      etichettaInOnda: testi['settimana.etichettaInOnda'] || '',
      etichettaDaTe: testi['settimana.etichettaDaTe'] || '',
      etichettaEvento: testi['settimana.etichettaEvento'] || '',
      copiaBtn: testi['saluti.copiaBtn'] || '',
      copiaFatto: testi['saluti.copiaFatto'] || ''
    },
    musica: musicaDati(config, testi),
    pollo: polloDi(config, testi),
    chi: chiDi(config),
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
/* LA PAGINA SENZA COMMENTI (CONTRATTO-6 §4.1)                         */
/* ------------------------------------------------------------------ */

/* Gli elementi dentro i quali un «<!--» non e un commento da togliere.
   - script e style: il loro contenuto e testo grezzo per il parser HTML.
     Li dentro sta il JSON-LD e stanno i due fogli dell'editor, e una
     sequenza del genere in mezzo a una stringa non apre nessun commento;
   - textarea e title: stesso discorso, e testo e non marcatura;
   - pre: li il commento sarebbe un commento vero, ma lo spazio bianco si
     VEDE, e togliere una riga sposterebbe tutto quello che sta sotto. Il
     testo ricco ammette <pre> (server/lib/testoricco.js, elenco dei tag
     permessi), quindi il caso non e teorico.
   Dentro questi elementi non si tocca niente: ne i commenti ne le righe. */
const NIENTE_COMMENTI_DENTRO = new Set(['script', 'style', 'textarea', 'title', 'pre']);

/**
 * Dove finisce il tag che comincia a `apre`, tenendo conto delle
 * virgolette: in `<img alt="3 > 2">` il primo `>` non chiude niente, e in
 * `<div title="<!-- ciao -->">` non c'e nessun commento da togliere.
 * Ritorna l'indice del primo carattere DOPO il `>`.
 */
function fineDelTag(testo, apre) {
  let virgoletta = '';
  for (let i = apre + 1; i < testo.length; i++) {
    const c = testo[i];
    if (virgoletta) {
      if (c === virgoletta) { virgoletta = ''; }
    } else if (c === '"' || c === '\'') {
      virgoletta = c;
    } else if (c === '>') {
      return i + 1;
    }
  }
  return testo.length;   // tag non chiuso: si tratta come se arrivasse in fondo
}

/**
 * Le righe rimaste vuote dopo un commento tolto: tre o piu a capo di fila
 * tornano due, e l'indentazione della riga che segue resta dov'era.
 *
 * Si puo fare senza rischi perche fuori da <pre> una sequenza di spazi, a
 * capo e tabulazioni vale come UN solo spazio per il browser: accorciarla
 * non sposta niente di quello che si vede. Nessuna regola del progetto usa
 * `white-space: pre` o `pre-wrap` (sono tutte `nowrap` o `normal`, che
 * condensano lo spazio), e il testo dentro <pre> non passa di qui.
 */
function righeVuote(pezzo) {
  return pezzo.replace(/\n(?:[ \t\r]*\n){2,}([ \t]*)/g, '\n\n$1');
}

/**
 * Vero se `pezzo` finisce a inizio riga, cioe con un a capo seguito al
 * massimo da spazi. Si guarda indietro carattere per carattere e ci si
 * ferma al primo a capo: costa quanto l'indentazione, non quanto la pagina.
 */
function aCapoAperto(pezzo) {
  for (let i = pezzo.length - 1; i >= 0; i--) {
    const c = pezzo[i];
    if (c === '\n') { return true; }
    if (c !== ' ' && c !== '\t' && c !== '\r') { return false; }
  }
  return true;   // solo spazi dall'inizio: e comunque l'inizio di una riga
}

/**
 * La pagina senza nemmeno un commento HTML (CONTRATTO-6 §1.5 e §4.1).
 *
 * I commenti restano nei modelli, che sono il sorgente e devono restare
 * spiegati: si tolgono QUI, in uscita, sul testo della pagina gia composta.
 * Non basta una sostituzione con espressione regolare sull'intero testo —
 * quella toglierebbe anche un «<!-- -->» scritto dentro un attributo o
 * dentro uno <script> — quindi la pagina si scorre un pezzo per volta:
 *
 *   - i tag si saltano interi, virgolette comprese, e quello che sta in un
 *     attributo non viene nemmeno guardato;
 *   - gli elementi di NIENTE_COMMENTI_DENTRO si saltano fino alla loro
 *     chiusura;
 *   - i commenti condizionali («<!--[if lt IE 9]> … <![endif]-->») restano:
 *     dentro c'e marcatura vera, e toglierli toglierebbe quella.
 *
 * Lo spazio bianco: se il commento ha per se una riga intera se ne va anche
 * la riga, altrimenti se ne va soltanto il commento e lo spazio che aveva
 * intorno resta dov'era. E la regola che tiene separati due tag che erano
 * separati — `</span> <!-- x --> <span>` diventa `</span>  <span>`, cioe
 * uno spazio come prima, e non `</span><span>`, che sarebbe una parola
 * attaccata all'altra.
 */
function togliCommenti(html) {
  const testo = String(html);
  const basso = testo.toLowerCase();
  let fuori = '';        // la pagina finita
  let normale = '';      // i tratti «normali» di fila, in attesa di righeVuote()
  let tenutoDa = 0;      // primo carattere non ancora messo da parte
  let i = 0;

  // Un tratto dentro cui le righe non si toccano (uno <script>, un <pre>)
  // chiude il pezzo normale che lo precede e passa in uscita tale e quale.
  const intoccabile = (da, a) => {
    normale += testo.slice(tenutoDa, da);
    fuori += righeVuote(normale) + testo.slice(da, a);
    normale = '';
    tenutoDa = a;
  };

  while (i < testo.length) {
    const apre = testo.indexOf('<', i);
    if (apre === -1) { break; }

    if (basso.startsWith('<!--', apre)) {
      const chiude = testo.indexOf('-->', apre + 4);
      if (chiude === -1) {
        // Commento mai chiuso: per il browser da li in poi e tutto commento.
        // Non e roba da aggiustare in uscita, e toccarla farebbe solo danni.
        i = apre + 4;
        continue;
      }
      const fine = chiude + 3;
      if (/^<!--\s*\[\s*if\b/i.test(testo.slice(apre, fine))) { i = fine; continue; }

      // Riga tutta sua? «Prima» si guarda su quello che e gia uscito, non
      // sull'originale: due commenti di fila sulla stessa riga lasciano la
      // riga vuota, e il secondo deve accorgersi che il primo se n'e andato.
      normale += testo.slice(tenutoDa, apre);
      const inizioRiga = normale === '' ? fuori === '' : aCapoAperto(normale);
      let a = fine;
      while (a < testo.length && (testo[a] === ' ' || testo[a] === '\t' || testo[a] === '\r')) { a++; }
      if (inizioRiga && testo[a] === '\n') {
        normale = normale.replace(/[ \t]*$/, '');   // via l'indentazione rimasta
        a++;                                        // e via l'a capo: la riga sparisce
      } else {
        a = fine;                 // in mezzo ad altro: via il commento e basta
      }
      tenutoDa = a;
      i = a;
      continue;
    }

    const nome = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(basso.slice(apre, apre + 40));
    if (!nome) { i = apre + 1; continue; }   // <!doctype, <?…, un < solitario

    const dopoIlTag = fineDelTag(testo, apre);
    if (!nome[1] && NIENTE_COMMENTI_DENTRO.has(nome[2]) && testo[dopoIlTag - 2] !== '/') {
      const chiusura = basso.indexOf('</' + nome[2], dopoIlTag);
      intoccabile(apre, chiusura === -1 ? testo.length : chiusura);
      i = tenutoDa;
      continue;
    }
    i = dopoIlTag;
  }

  normale += testo.slice(tenutoDa);
  return fuori + righeVuote(normale);
}

/* ------------------------------------------------------------------ */
/* RESA                                                                */
/* ------------------------------------------------------------------ */

/** Rende i tre file in memoria. Non scrive niente su disco. */
function rendi(contenuti, opzioni) {
  // Una cache sola per il contesto (che rende le sezioni) e per la pagina:
  // ogni parziale si legge e si analizza una volta.
  const cache = new Map();
  // Un istante solo per la pagina e per js/dati.js: un evento che finisce
  // proprio mentre si genera non deve esserci in uno e mancare nell'altro.
  const scelte = Object.assign({}, opzioni, { cache: cache });
  scelte.adesso = momentoDi(scelte);
  const contesto = costruisciContesto(contenuti, scelte);

  if (!eFile(P.modelloIndex)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloIndex) + ': senza modello non si genera niente.');
  }
  if (!eFile(P.modelloDati)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloDati) + ': e il modello di js/dati.js.');
  }

  // I commenti si tolgono qui, sulla pagina intera gia composta, e non nei
  // modelli: i modelli sono il sorgente e restano spiegati (CONTRATTO-6
  // §4.1). Vale per la pagina pubblicata come per le due anteprime, che
  // sono la stessa pagina.
  const html = togliCommenti(modello.rendiFile(P.modelloIndex, contesto,
    { file: 'modelli/index.html', cartella: P.modelli, cache: cache }));

  // La pagina delle clip si rende solo se c'e qualcosa da metterci dentro.
  // `null` non vuol dire «errore»: vuol dire che questo sito, adesso, non ha
  // quella pagina — le clip sono spente, oppure non ne e ancora arrivata
  // nessuna da Twitch. Chi scrive i file sa che cosa farne (genera()).
  let clip = null;
  if (contesto.clipPagina.attivo) {
    if (!eFile(P.modelloClip)) {
      throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloClip) +
        ': e il modello della pagina di tutte le clip.');
    }
    clip = togliCommenti(modello.rendiFile(P.modelloClip, contesto,
      { file: 'modelli/clip.html', cartella: P.modelli, cache: cache }));
  }
  const dati = modello.rendiFile(P.modelloDati, Object.assign({ dati: jsonSicuro(oggettoDati(contenuti, scelte)) }, contesto),
    { file: 'server/modelli/dati.js.tpl', cartella: P.modelli, cache: cache });
  // Il foglio del tema non passa dal motore di template: e calcolato, non
  // riempito. tema.css() non lancia mai, nemmeno con un tema mezzo scritto.
  const foglio = tema.css(contenuti.config.tema);

  return { html: html, clip: clip, dati: dati, tema: foglio, contesto: contesto };
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

/**
 * La pagina per l'editor del pannello (CONTRATTO-4 §6.3). La stessa resa,
 * con tre ritocchi fatti sull'HTML finito e non nel modello, perche il
 * modello e quello del sito pubblicato e non deve sapere che esiste
 * un'anteprima:
 *
 * 1. via tutti gli <script src>. L'editor mostra la pagina senza
 *    JavaScript, che il CONTRATTO §12 dichiara completa: dentro l'editor il
 *    player di Twitch sarebbe una seconda sessione video della stessa
 *    persona (CONTRATTO-3 §3.4) e il pollo aprirebbe una socket verso la
 *    chat a ogni ricarica. Il JSON-LD resta: non ha `src` e non si esegue;
 * 2. <base href="/"> come primo figlio di <head>: il motore scrive la pagina
 *    in un iframe del pannello, e senza base css/, img/ e contenuti/ si
 *    risolverebbero sotto /pannello/. Deve venire prima di qualunque
 *    elemento con un indirizzo relativo;
 * 3. i due <style> dell'editor ci sono SEMPRE, anche vuoti: il motore li
 *    cerca per spegnerli quando inietta i suoi gemelli dal vivo, e un
 *    elemento che a volte manca vorrebbe dire un ramo in piu in ogni punto
 *    che lo cerca.
 */
function perEditor(html) {
  let pagina = String(html).replace(/<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script>[^\S\n]*\n?/gi, '');
  pagina = pagina.replace(/<head\b[^>]*>/i, (testa) => testa + '<base href="/">');

  const vuoto = (id) => '<style id="' + id + '"></style>\n';
  if (pagina.indexOf('<style id="sb-disposizione">') === -1) {
    // Prima di sb-stili se c'e gia, come nel modello; altrimenti in fondo al <head>.
    const dove = pagina.indexOf('<style id="sb-stili">');
    const punto = dove !== -1 ? dove : pagina.indexOf('</head>');
    pagina = pagina.slice(0, punto) + vuoto('sb-disposizione') + pagina.slice(punto);
  }
  if (pagina.indexOf('<style id="sb-stili">') === -1) {
    const punto = pagina.indexOf('</head>');
    pagina = pagina.slice(0, punto) + vuoto('sb-stili') + pagina.slice(punto);
  }
  return pagina;
}

/** L'HTML per l'anteprima dell'editor: contenuti non salvati, niente disco. */
function anteprimaEditor(contenuti) {
  return perEditor(rendi(contenuti).html);
}

/* ------------------------------------------------------------------ */
/* PUBBLICAZIONE (§6.4)                                                */
/* ------------------------------------------------------------------ */

// Gli errori con cui Windows rifiuta un rename su un file tenuto aperto da
// un altro programma: un server statico che mostra il sito, un antivirus,
// l'editor. A Mobscene93 e successo davvero.
const FILE_OCCUPATO = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Scrittura di un file generato. Di norma e la scrittura atomica di
 * sempre. Se il file e occupato si riprova qualche volta a breve distanza
 * e, se resta occupato, si scrive direttamente sul file: non e piu
 * atomico, ma Pubblica funziona invece di fallire per un programma che ha
 * solo il file aperto in lettura. Solo se anche quello non va si lancia,
 * con un messaggio che dice cosa fare.
 */
function scriviGenerato(percorso, testo) {
  let ultimo = null;
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    try {
      scriviAtomico(percorso, testo);
      return;
    } catch (e) {
      if (!e || !FILE_OCCUPATO.has(e.code)) { throw e; }
      ultimo = e;
      // Attesa sincrona senza girare a vuoto: la pubblicazione e sincrona
      // per scelta (vedi genera.js), e un busy-wait scalderebbe la CPU.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (tentativo + 1));
    }
  }
  try {
    fs.writeFileSync(percorso, testo);
  } catch (e) {
    throw erroreHttp(500, 'Non riesco a scrivere ' + path.relative(P.radice, percorso) +
      ': un altro programma lo tiene aperto (' + ((ultimo && ultimo.code) || e.code) +
      '). Chiudi i programmi che mostrano il sito da questa cartella e riprova.');
  }
}

/* ------------------------------------------------------------------ */
/* SITEMAP E robots.txt (CONTRATTO-6 §4.3)                             */
/* ------------------------------------------------------------------ */

/** Il poco che in un indirizzo puo dare fastidio dentro un XML. */
function xml(valore) {
  return String(valore)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * La sitemap: gli indirizzi VERI del sito, che sono uno o due. Non e un
 * elenco di ancore — `#chi` e `#supporto` non sono indirizzi diversi per un
 * motore di ricerca — e non ha senso gonfiarla. La pagina delle clip invece
 * e un indirizzo suo, con un titolo e un contenuto suoi, e ci sta dentro
 * quando esiste: se le clip sono spente non viene scritta affatto, e
 * dichiararla vorrebbe dire mandare un motore di ricerca su un 404.
 *
 * `lastmod` e la data dell'ultima pubblicazione, cioe il timbro che la
 * generazione mette su contenuti.json: la sola data, senza l'ora, perche e
 * quello che serve a un motore di ricerca e perche cosi due pubblicazioni
 * nello stesso giorno non producono due file diversi per niente.
 */
function sitemapXml(indirizzo, quando, pagine) {
  const letta = new Date(quando);
  const giorno = (Number.isFinite(letta.getTime()) ? letta : new Date()).toISOString().slice(0, 10);
  const elenco = (Array.isArray(pagine) && pagine.length) ? pagine : [''];
  let fuori = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const pagina of elenco) {
    fuori += '  <url>\n' +
      '    <loc>' + xml(indirizzo + pagina) + '</loc>\n' +
      '    <lastmod>' + giorno + '</lastmod>\n' +
      '  </url>\n';
  }
  return fuori + '</urlset>\n';
}

/**
 * La riga `Sitemap:` in fondo a robots.txt, una sola e sempre l'ultima.
 *
 * robots.txt non e un file della generazione: lo scrive chi prepara
 * l'hosting, e qui si aggiunge soltanto la riga che dipende dall'indirizzo.
 * Se il file non c'e (non e ancora stato creato, oppure sul server non lo si
 * e caricato) non si crea e non si protesta: la pubblicazione non deve
 * fallire per un file che non le appartiene. Lo stesso se non si riesce a
 * scriverlo.
 */
function aggiornaRobots(indirizzo) {
  const file = path.join(P.radice, 'robots.txt');
  let prima;
  try {
    prima = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return 'non c\'e';
  }
  const riga = 'Sitemap: ' + indirizzo + 'sitemap.xml';
  // Se una riga Sitemap c'e gia si sostituisce dov'e, senza spostarla:
  // due pubblicazioni di fila non devono lasciare due righe, e un cambio di
  // dominio non deve lasciare in giro quello vecchio. Se non c'e, si accoda
  // in fondo. Le eventuali righe in piu — un file gia sporco — se ne vanno.
  let dopo;
  if (/^[ \t]*Sitemap[ \t]*:.*$/im.test(prima)) {
    let laPrima = true;
    dopo = prima.replace(/^[ \t]*Sitemap[ \t]*:.*(\r?\n?)/gim, (tutta, aCapo) => {
      if (!laPrima) { return ''; }
      laPrima = false;
      return riga + (aCapo || '\n');
    });
  } else {
    const testa = prima.replace(/\s*$/, '');
    dopo = (testa ? testa + '\n' : '') + riga + '\n';
  }
  if (dopo === prima) { return 'gia a posto'; }
  try {
    scriviGenerato(file, dopo);
  } catch (e) {
    return 'non scritto';
  }
  return 'aggiornato';
}

/**
 * Scrive sitemap.xml nella radice e la riga in robots.txt, ma solo se
 * l'indirizzo del sito si sa (dal pannello o da SB_SITO). Senza indirizzo
 * non scrive niente e non si lamenta: un sito senza dominio non ha una
 * sitemap da dichiarare, e una con dentro «./» sarebbe peggio di niente.
 *
 * Ritorna null quando non c'e niente da scrivere, altrimenti il resoconto
 * di cosa e stato scritto — che genera.js stampa e il pannello puo mostrare.
 */
function scriviSitemap(sito, quando, pagine) {
  if (!sito || !sito.indirizzo) { return null; }
  const testo = sitemapXml(sito.indirizzo, quando, pagine);
  try {
    scriviGenerato(path.join(P.radice, 'sitemap.xml'), testo);
  } catch (e) {
    // La sitemap e un di piu: il sito e gia stato pubblicato e non si butta
    // via una pubblicazione riuscita per un file di contorno.
    return { file: 'sitemap.xml', byte: 0, indirizzo: sito.indirizzo, robots: 'non provato',
      errore: (e && e.message) ? e.message : String(e) };
  }
  return {
    file: 'sitemap.xml',
    byte: Buffer.byteLength(testo, 'utf8'),
    indirizzo: sito.indirizzo,
    pagine: (Array.isArray(pagine) && pagine.length) ? pagine.length : 1,
    robots: aggiornaRobots(sito.indirizzo)
  };
}

/**
 * Scrive clip.html, oppure la toglie di mezzo.
 *
 * Toglierla e la meta che conta. La pagina esiste solo finche esistono le
 * clip: spegnere la vetrina nel pannello deve farla sparire dal sito, non
 * lasciarne online una copia di tre mesi fa che nessun link raggiunge piu ma
 * che Google ha in memoria e continua a servire. Se il file non si riesce a
 * cancellare non si fa fallire la pubblicazione — il resto del sito e gia
 * scritto ed e giusto — ma lo si dice a chi pubblica, che puo toglierlo a
 * mano.
 */
function scriviPaginaClip(html) {
  if (html) {
    scriviGenerato(P.clipHtml, html);
    return { file: 'clip.html', stato: 'scritta', byte: Buffer.byteLength(html, 'utf8') };
  }
  if (!eFile(P.clipHtml)) { return { file: 'clip.html', stato: 'niente', byte: 0 }; }
  try {
    fs.unlinkSync(P.clipHtml);
    return { file: 'clip.html', stato: 'tolta', byte: 0 };
  } catch (e) {
    return { file: 'clip.html', stato: 'non tolta', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

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

  // I rami dell'editor si ripuliscono prima della convalida (CONTRATTO-4
  // §6.5): quello che resta e anche quello che il timbro finale risalva.
  pulisciEditor(contenuti);
  const errori = convalida.convalida(contenuti);
  if (errori.length) {
    throw erroreHttp(422, 'I contenuti non passano la convalida: ' + convalida.riassumi(errori) +
      '. Non ho scritto niente.', { errori: errori });
  }

  const reso = rendi(contenuti, scelte);

  // scriviAtomico crea da se la cartella che manca: js/ e css/ esistono
  // sempre, ma il collaudo genera anche dentro cartelle temporanee vuote.
  scriviGenerato(P.indexHtml, reso.html);
  scriviGenerato(P.datiJs, reso.dati);
  scriviGenerato(P.temaCss, reso.tema);

  // La pagina delle clip sta fuori dai tre file di sempre, come la sitemap:
  // quelli ci sono a ogni pubblicazione e sono sempre gli stessi tre, questa
  // c'e solo se il sito ha delle clip. Tenerla dentro `scritti` vorrebbe
  // dire un elenco che a volte ha tre voci e a volte quattro, e chi lo legge
  // — il pannello, il collaudo — dovrebbe mettersi a distinguere.
  const paginaClip = scriviPaginaClip(reso.clip);

  const quando = archivio.salva(contenuti);

  // La sitemap dopo il timbro, non prima: `lastmod` e la data dell'ultima
  // pubblicazione, e la pubblicazione e questa. Resta fuori da `scritti`
  // perche quello e l'elenco dei tre file generati, che e sempre lo stesso
  // e su cui si appoggiano il pannello e il collaudo.
  const mappa = scriviSitemap(controlli.indirizzoSito(contenuti.config), quando,
    reso.clip ? ['', 'clip.html'] : ['']);

  return {
    ok: true,
    backup: copia,
    durataMs: Date.now() - inizio,
    aggiornatoIl: quando,
    sitemap: mappa,
    paginaClip: paginaClip,
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
  genera, anteprima, anteprimaDi, anteprimaEditor, rendi, costruisciContesto,
  pulisciEditor, opzioniStili, blocchiPresenti, perEditor,
  oggettoDati, orariTesto, settimanaDi, clipDi, clipPaginaDi, jsonSicuro, chiaviRicche,
  orariDi, orariDati, eventiDi, sfondoDi, categoriaDiretta,
  // togliCommenti si esporta per il collaudo: e una funzione di testo pura
  // e i casi da provare (l'attributo, lo <script>, il <pre>) si provano
  // meglio su di lei che su una generazione intera.
  togliCommenti
};
