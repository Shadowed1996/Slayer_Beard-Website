/* =====================================================================
   parti.js — parti guidate dai dati, sezioni e Navigatore
   (CONTRATTO-4 §11.3).

   Nella scheda Contenuto del pannello disegna:
     - l'ispettore di una PARTE (`data-sb-parte`): i campi dello schema che
       il registro del §5.4 le assegna, disegnati con ponte.creaCampo; la
       schedule (CONTRATTO-5 §8) si apre sulla vista della parte (nastro o
       eventi), e nella parte «stato» compare solo come riepilogo;
     - l'ispettore di una SEZIONE (`data-sb-sezione`): «Mostra questa
       sezione», gli interruttori delle parti che la diretta può non
       stampare, «Cosa contiene» e «Testi che non si vedono in pagina»,
       letti dall'anteprima vera;
   e fornisce il Navigatore delle sezioni, `disegnaNavigatore(contenitore)`.

   I nomi umani stanno in nomi.js e solo lì. Qui non c'è la definizione di
   nessun campo: etichette, tipi e aiuti arrivano dallo schema attraverso
   il ponte.

   Due trappole già viste a Mobscene93, e il motivo di metà del codice:
     1. il pannello ridisegna gli ispettori a ogni ricarica dell'anteprima.
        Un elenco rifatto da capo mentre ci si scrive dentro perde il fuoco
        a metà parola. Il nodo di una parte (e di una sezione) si tiene da
        parte e si rimette al suo posto finché i dati sono gli stessi
        oggetti; si butta dopo sb:sostituito, o quando uno dei suoi campi
        cambia da un'altra parte del pannello mentre non era a video;
     2. il riquadro in cui si disegna è condiviso con il resto della
        scheda: non si svuota mai, si aggiunge o si sostituisce solo il
        proprio nodo.
   ===================================================================== */

import { ponte } from './ponte.js';
import { motore } from './motore.js';
import {
  nomeSezione, descrizioneSezione, nomeParte, descrizioneParte, nomeBlocco,
  chiaviParte, partiDellaChiave, gruppoDellaSezione
} from './nomi.js';
import { el, svuota, idUnico } from '../moduli/dom.js';

/* Chi cerca dove sta un campo (la ricerca del guscio) può prendere il
   registro anche da qui: la fonte resta nomi.js. */
export { REGISTRO_PARTI, PARTI_REGISTRATE, chiaviParte, partiDellaChiave } from './nomi.js';

/* ------------------------------------------------------------- costanti */

/* Il §4.1 alla lettera. Si usa solo se pannello/condivisi/stili.js non
   c'è: con SBStili caricato comandano le sue costanti e la sua pulizia,
   così pannello e generazione non possono pensarla in due modi. */
const SEZIONI_DI_PARTENZA = ['regia', 'diretta', 'sondaggio', 'settimana', 'chi', 'supporto', 'saluti'];

/* La copertina contiene l'unico <h1>: sempre prima, sempre accesa. */
const BLOCCATA = 'regia';

/* Binario e piede non stanno in config.sezioni: ci sono sempre. */
const FISSA_IN_CIMA = 'binario';
const FISSA_IN_FONDO = 'piede';

/* Le parti della diretta che la generazione può non stampare affatto. */
const INTERRUTTORI_DIRETTA = ['config.account.attivo', 'config.lurk.attivo', 'config.pollo.attivo', 'config.clip.attivo'];

const FRASI_BLOCCATE = {
  binario: 'Sempre presente: il menu laterale porta a tutte le altre sezioni, quindi non si spegne e non si sposta.',
  regia: 'Sempre prima e sempre accesa: è la copertina e contiene il titolo principale della pagina.',
  piede: 'Sempre presente: chiude la pagina con copyright e avvertenze, quindi non si spegne e non si sposta.'
};

/* ------------------------------------------------------------- foglio */

/* Il foglio arriva con il modulo: se il guscio lo collega già in
   index.html non si aggiunge un doppione. */
function collegaFoglio() {
  if (typeof document === 'undefined' || !document.head) return;
  const presente = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((legame) => /\/editor\/parti\.css(?:[?#]|$)/.test(legame.href || ''));
  if (presente) return;
  const legame = document.createElement('link');
  legame.rel = 'stylesheet';
  legame.href = new URL('./parti.css', import.meta.url).href;
  document.head.append(legame);
}

/* ------------------------------------------------------------- utilità */

function avvisaGuasto(dove, errore) {
  console.warn('[parti] ' + dove + ':', errore);
}

/* Il motore è di un altro agente e può lanciare: un guasto lì dentro non
   deve portarsi via il Navigatore o la scheda. */
function chiamaMotore(nome, ...argomenti) {
  const funzione = motore && motore[nome];
  if (typeof funzione !== 'function') return undefined;
  try {
    return funzione.apply(motore, argomenti);
  } catch (errore) {
    avvisaGuasto('motore.' + nome, errore);
    return undefined;
  }
}

function datiCorrenti() {
  return ponte.stato ? ponte.stato.dati : null;
}

function schemaCorrente() {
  return ponte.stato ? ponte.stato.schema : null;
}

function eNodo(valore) {
  return Boolean(valore) && typeof valore === 'object' && typeof valore.appendChild === 'function';
}

/* La firma del motore è fn(riquadro, meta). Se un giorno arrivassero al
   contrario la scheda funziona lo stesso invece di restare vuota. */
function argomenti(primo, secondo) {
  if (eNodo(primo)) return [primo, secondo];
  if (eNodo(secondo)) return [secondo, primo];
  return [null, null];
}

/** Il nostro nodo di un certo tipo dentro un contenitore condiviso. */
function proprio(contenitore, tipo) {
  for (const figlio of Array.from(contenitore.children)) {
    if (figlio.dataset && figlio.dataset.parti === tipo) return figlio;
  }
  return null;
}

function togliProprio(contenitore, tipo) {
  const vecchio = contenitore ? proprio(contenitore, tipo) : null;
  if (vecchio) vecchio.remove();
}

function metti(contenitore, tipo, nodo) {
  const vecchio = proprio(contenitore, tipo);
  if (vecchio === nodo) return;
  if (vecchio) vecchio.replaceWith(nodo);
  else contenitore.append(nodo);
}

/** Vero se una modifica a `chiave` riguarda uno dei campi elencati. */
function tocca(chiavi, chiave) {
  const cambiata = String(chiave || '');
  if (!cambiata) return true;
  return chiavi.some((propria) => propria === cambiata
    || cambiata.startsWith(propria + '.')
    || propria.startsWith(cambiata + '.'));
}

function siVede(nodo) {
  try {
    return nodo.isConnected && nodo.getClientRects().length > 0;
  } catch {
    return false;
  }
}

function estratto(testo, massimo) {
  const pulito = String(testo || '').replace(/\s+/g, ' ').trim();
  return pulito.length > massimo ? pulito.slice(0, massimo - 1).trim() + '…' : pulito;
}

/* Icone disegnate qui e non prese dallo sprite di index.html: lo sprite è
   del guscio e non ha occhio sbarrato, lucchetto e maniglia. Tratto da
   1,8 come le icone del pannello. */
const NS_SVG = 'http://www.w3.org/2000/svg';
const TRACCE = {
  occhio: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z', 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z'],
  occhioSpento: ['M3 3l18 18', 'M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1', 'M6.6 6.7C3.7 8.5 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.3-1.6', 'M9.9 9.9a3.2 3.2 0 0 0 4.2 4.2'],
  lucchetto: ['M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11Z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  maniglia: ['M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'],
  su: ['M12 19V5', 'M6 11l6-6 6 6'],
  giu: ['M12 5v14', 'M6 13l6 6 6-6']
};

function disegno(nome) {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('class', 'parti__ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', nome === 'maniglia' ? '3.2' : '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const traccia of TRACCE[nome] || []) {
    const percorso = document.createElementNS(NS_SVG, 'path');
    percorso.setAttribute('d', traccia);
    svg.append(percorso);
  }
  return svg;
}

function testa(occhiello, titolo, frase, idTitolo) {
  return el('header', { classe: 'parti__testa' }, [
    el('p', { classe: 'parti__occhiello', testo: occhiello }),
    el('h2', { classe: 'parti__titolo', id: idTitolo, testo: titolo }),
    frase ? el('p', { classe: 'parti__frase', testo: frase }) : null
  ]);
}

/* Un campo dello schema disegnato dal pannello, o null. Il controllo si
   registra da solo nell'indice degli errori del guscio. */
function campoDelloSchema(chiave) {
  const definizione = ponte.campo(chiave);
  if (!definizione) return null;
  try {
    const controllo = ponte.creaCampo(definizione);
    return controllo && controllo.nodo ? controllo : null;
  } catch (errore) {
    avvisaGuasto('campo ' + chiave, errore);
    return null;
  }
}

/* ------------------------------------------- fuoco fra un disegno e l'altro */

/* Si ricorda dove si stava scrivendo dentro un nodo tenuto da parte, per
   rimettere il fuoco (e il cursore) quando il nodo esce e rientra nel
   pannello. Un'uscita voluta — clic altrove — fa dimenticare. */
function seguiFuoco(voce) {
  const ricorda = (evento) => {
    const bersaglio = evento.target;
    if (!(bersaglio instanceof Element)) return;
    voce.fuoco = bersaglio;
    try {
      voce.cursore = typeof bersaglio.selectionStart === 'number'
        ? [bersaglio.selectionStart, bersaglio.selectionEnd]
        : null;
    } catch {
      voce.cursore = null;   // input di tipo numero o ora: il cursore non si legge
    }
  };
  voce.radice.addEventListener('focusin', ricorda);
  voce.radice.addEventListener('input', ricorda, true);
  voce.radice.addEventListener('keyup', ricorda, true);
  voce.radice.addEventListener('mouseup', ricorda, true);
  voce.radice.addEventListener('focusout', (evento) => {
    const uscito = evento.target;
    setTimeout(() => {
      // Nodo staccato: è il ridisegno, non una scelta di chi scrive.
      if (uscito.isConnected && voce.fuoco === uscito && document.activeElement !== uscito) voce.fuoco = null;
    }, 0);
  });
}

function rimettiFuoco(voce) {
  const bersaglio = voce.fuoco;
  if (!bersaglio || !bersaglio.isConnected || !voce.radice.contains(bersaglio)) return;
  const attivo = document.activeElement;
  // Se nel frattempo il fuoco l'ha preso qualcos'altro, si lascia dov'è.
  if (attivo && attivo !== document.body && attivo !== document.documentElement && attivo.isConnected && attivo !== bersaglio) return;
  try {
    bersaglio.focus({ preventScroll: true });
    if (voce.cursore && typeof bersaglio.setSelectionRange === 'function') {
      bersaglio.setSelectionRange(voce.cursore[0], voce.cursore[1]);
    }
  } catch {
    /* campi che non accettano un cursore: basta il fuoco */
  }
}

/* ------------------------------------------------ sezioni: i dati */

function stiliCondivisi() {
  return typeof window !== 'undefined' && window.SBStili ? window.SBStili : null;
}

function sezioniOrdinabili() {
  const condivisi = stiliCondivisi();
  if (condivisi && Array.isArray(condivisi.SEZIONI_ORDINABILI) && condivisi.SEZIONI_ORDINABILI.length) {
    return condivisi.SEZIONI_ORDINABILI.slice();
  }
  return SEZIONI_DI_PARTENZA.slice();
}

/* La stessa regola di pulisciSezioni (§4.1), per quando stili.js manca:
   id sconosciuti via, doppioni al primo, mancanti accesi dopo chi li precede, la
   copertina prima e accesa comunque sia scritto l'elenco. */
function pulisciLocale(grezze) {
  const ammesse = sezioniOrdinabili();
  const viste = new Set();
  const pulite = [];
  for (const voce of Array.isArray(grezze) ? grezze : []) {
    const id = voce && typeof voce === 'object' ? voce.id : null;
    if (typeof id !== 'string' || !ammesse.includes(id) || viste.has(id)) continue;
    viste.add(id);
    pulite.push({ id, attiva: voce.attiva !== false });
  }
  ammesse.forEach((id, i) => {
    if (viste.has(id)) return;
    const prima = ammesse.slice(0, i).reverse().find((altro) => pulite.some((voce) => voce.id === altro));
    const dopo = prima ? pulite.findIndex((voce) => voce.id === prima) : -1;
    pulite.splice(dopo + 1, 0, { id, attiva: true });
    viste.add(id);
  });
  const senzaCopertina = pulite.filter((voce) => voce.id !== BLOCCATA);
  return ammesse.includes(BLOCCATA) ? [{ id: BLOCCATA, attiva: true }, ...senzaCopertina] : senzaCopertina;
}

/** L'elenco delle sezioni ordinabili com'è adesso, sempre in forma pulita e mai lo stesso oggetto della bozza. */
function leggiSezioni() {
  const grezze = ponte.leggi('config.sezioni');
  const condivisi = stiliCondivisi();
  if (condivisi && typeof condivisi.pulisciSezioni === 'function') {
    try {
      const pulite = condivisi.pulisciSezioni(grezze);
      if (Array.isArray(pulite) && pulite.every((v) => v && typeof v.id === 'string')) {
        return pulite.map((v) => ({ id: v.id, attiva: v.attiva !== false }));
      }
    } catch (errore) {
      avvisaGuasto('SBStili.pulisciSezioni', errore);
    }
  }
  return pulisciLocale(grezze);
}

/* Ordine e visibilità cambiano la pagina intera (binario, link, ordine di
   main): la modifica è strutturale e il guscio ricarica l'anteprima. Si
   scrive sempre un elenco nuovo, mai quello della bozza ritoccato. */
function scriviSezioni(sezioni) {
  ponte.scrivi('config.sezioni', sezioni.map((v) => ({ id: v.id, attiva: v.attiva !== false })), { strutturale: true });
}

function sezioneAccesa(id) {
  const voce = leggiSezioni().find((v) => v.id === id);
  return voce ? voce.attiva : false;
}

function impostaSezione(id, accesa) {
  if (id === BLOCCATA) return false;
  const sezioni = leggiSezioni();
  const voce = sezioni.find((v) => v.id === id);
  if (!voce || voce.attiva === Boolean(accesa)) return false;
  voce.attiva = Boolean(accesa);
  scriviSezioni(sezioni);
  return true;
}

/* Il tratto dell'elenco in cui una sezione si può muovere: la bloccata non
   si sposta e non si scavalca. */
function intervalloLibero(sezioni, indice) {
  if (!sezioni[indice] || sezioni[indice].id === BLOCCATA) return [indice, indice];
  let primo = indice;
  let ultimo = indice;
  while (primo - 1 >= 0 && sezioni[primo - 1].id !== BLOCCATA) primo -= 1;
  while (ultimo + 1 < sezioni.length && sezioni[ultimo + 1].id !== BLOCCATA) ultimo += 1;
  return [primo, ultimo];
}

function spostaSezione(da, a) {
  const sezioni = leggiSezioni();
  if (da === a || !sezioni[da]) return false;
  const [primo, ultimo] = intervalloLibero(sezioni, da);
  if (a < primo || a > ultimo) return false;
  const [presa] = sezioni.splice(da, 1);
  sezioni.splice(a, 0, presa);
  scriviSezioni(sezioni);
  return true;
}

/* --------------------------------------------- la schedule nelle parti */

/* Dalla schedule (CONTRATTO-5 §8.3) la stessa chiave, config.orari, si
   modifica da due parti: il nastro apre la vista della settimana, gli
   eventi quella degli eventi speciali. Nella parte «stato» della copertina
   c'è solo un riepilogo con il bottone che porta al nastro. */
const VISTA_DELLA_PARTE = { nastro: 'settimana', eventi: 'eventi' };
const CHIAVE_ORARI = 'config.orari';

/* Il riepilogo sta in moduli/settimana.js, che si carica a parte: se non
   arriva, la parte «stato» resta com'era, con il solo bottone. */
let moduloSettimana = null;
function caricaSettimana() {
  if (!moduloSettimana) {
    moduloSettimana = import('../moduli/settimana.js').catch((errore) => {
      avvisaGuasto('moduli/settimana.js', errore);
      return null;
    });
  }
  return moduloSettimana;
}

function riepilogoSchedule() {
  const posto = el('div', { classe: 'parti__riepilogo' });
  const modifica = el('button', {
    type: 'button', classe: 'btn btn--primario',
    su: { click: () => apriSchedule() }
  }, [el('span', { testo: 'Modifica la schedule' })]);

  caricaSettimana().then((modulo) => {
    if (!modulo || typeof modulo.creaRiepilogoOrari !== 'function') return;
    try {
      const riepilogo = modulo.creaRiepilogoOrari({ leggi: () => ponte.leggi(CHIAVE_ORARI) });
      posto.replaceChildren(riepilogo.nodo);
    } catch (errore) {
      avvisaGuasto('riepilogo della schedule', errore);
    }
  });

  return el('div', { classe: 'parti__blocco parti__schedule' }, [
    el('h3', { classe: 'parti__sottotitolo', testo: 'Schedule della settimana' }),
    el('p', { classe: 'parti__nota', testo: 'Il conto alla rovescia qui sopra parte dai giorni, dalle ore e dagli eventi speciali della schedule. La schedule si cambia dal nastro della settimana.' }),
    posto,
    el('div', { classe: 'parti__azioni' }, [modifica])
  ]);
}

function apriSchedule() {
  const meta = chiamaMotore('seleziona', 'parte:nastro');
  if (meta) {
    chiamaMotore('scorriA', 'parte:nastro');
    return;
  }
  ponte.avviso('Il nastro della settimana adesso non è nell\'anteprima (la sezione è nascosta o la pagina si sta aggiornando). Riaccendi «La settimana» dal Navigatore, oppure cerca «Schedule» con Ctrl+K.', { tipo: 'info', durata: 7000 });
}

/* ----------------------------------------------- ispettore di una parte */

const cacheParti = new Map();   // nome -> { radice, dati, schema, chiavi, orari, fuoco, cursore }

function costruisciParte(nome) {
  const schema = schemaCorrente();
  const chiavi = chiaviParte(nome, schema);
  const idTitolo = idUnico('parti-titolo');
  const campi = el('div', { classe: 'parti__campi' });
  const disegnate = [];
  let orari = null;

  for (const chiave of chiavi) {
    const controllo = campoDelloSchema(chiave);
    if (!controllo) continue;
    campi.append(controllo.nodo);
    disegnate.push(chiave);
    if (chiave === CHIAVE_ORARI) orari = controllo;
  }

  if (nome === 'stato' && ponte.campo(CHIAVE_ORARI)) campi.append(riepilogoSchedule());

  if (!disegnate.length) {
    campi.append(el('p', {
      classe: 'parti__vuoto',
      testo: chiavi.length
        ? 'I campi di questa parte non sono ancora pronti: riprova fra un attimo.'
        : 'Per questa parte non ci sono campi da modificare: i testi si cambiano cliccandoli nell\'anteprima, l\'aspetto dalla scheda Stile.'
    }));
  }

  const radice = el('section', {
    classe: 'parti parti--parte', 'aria-labelledby': idTitolo,
    dati: { parti: 'parte', parte: nome }
  }, [
    testa('Parte della pagina', nomeParte(nome), descrizioneParte(nome), idTitolo),
    campi
  ]);

  const voce = { radice, dati: datiCorrenti(), schema, chiavi, orari, completa: disegnate.length > 0, fuoco: null, cursore: null };
  seguiFuoco(voce);
  return voce;
}

function mettiParte(contenitore, nome) {
  let voce = cacheParti.get(nome);
  const riusabile = Boolean(voce) && voce.completa && ponte.pronto
    && voce.dati === datiCorrenti() && voce.schema === schemaCorrente();

  if (!riusabile) {
    voce = costruisciParte(nome);
    // Prima del caricamento dei contenuti non si tiene niente da parte: i
    // campi disegnati a vuoto andrebbero rifatti comunque.
    if (ponte.pronto && voce.completa) cacheParti.set(nome, voce);
    else cacheParti.delete(nome);
  }

  // Il nodo entra adesso nel pannello (la parte è appena stata scelta), non
  // è il ridisegno dopo una ricarica dell'anteprima: la schedule si apre
  // sulla vista della parte. Dopo una ricarica resta dov'era chi lavora.
  const entra = !voce.radice.isConnected;
  metti(contenitore, 'parte', voce.radice);
  if (entra && voce.orari && typeof voce.orari.apriVista === 'function' && VISTA_DELLA_PARTE[nome]) {
    try {
      voce.orari.apriVista(VISTA_DELLA_PARTE[nome]);
    } catch (errore) {
      avvisaGuasto('vista della schedule', errore);
    }
  }
  if (riusabile) rimettiFuoco(voce);
  return voce.radice;
}

function ispettoreParte(primo, secondo) {
  const [riquadro, meta] = argomenti(primo, secondo);
  if (!riquadro) return null;
  if (!meta || meta.tipo !== 'parte') {
    togliProprio(riquadro, 'parte');
    return null;
  }
  const nome = String(meta.chiave || (meta.el && meta.el.getAttribute && meta.el.getAttribute('data-sb-parte')) || '');
  return mettiParte(riquadro, nome);
}

/**
 * I campi di una parte in un contenitore qualunque, anche quando la parte
 * non è nell'anteprima (il pollo spento, la ricerca di un campo che sta lì).
 * Non svuota il contenitore. -> il nodo disegnato
 */
export function disegnaParte(contenitore, nome) {
  if (!eNodo(contenitore)) return null;
  return mettiParte(contenitore, String(nome || ''));
}

/* ---------------------------------------------- ispettore di una sezione */

const cacheSezioni = new Map();   // id -> { radice, dati, schema, vis, contiene, nascosti, … }

function controlloVisibilita(id) {
  const nodo = el('div', { classe: 'parti__vis' });

  if (id === FISSA_IN_CIMA || id === FISSA_IN_FONDO || id === BLOCCATA || !sezioniOrdinabili().includes(id)) {
    nodo.dataset.bloccata = '1';
    nodo.append(el('p', { classe: 'parti__lucchetto' }, [
      disegno('lucchetto'),
      el('span', { testo: FRASI_BLOCCATE[id] || 'Questa sezione resta sempre al suo posto.' })
    ]));
    return { nodo, aggiorna() {} };
  }

  const idEtichetta = idUnico('parti-vis');
  const leva = el('button', {
    type: 'button', classe: 'interruttore', role: 'switch',
    'aria-checked': 'true', 'aria-labelledby': idEtichetta
  }, [
    el('span', { classe: 'interruttore__pista', 'aria-hidden': 'true' }, [el('span', { classe: 'interruttore__pallina' })])
  ]);
  const etichetta = el('span', { classe: 'parti__vis-etichetta', id: idEtichetta, testo: 'Mostra questa sezione' });
  const stato = el('p', { classe: 'parti__vis-stato', role: 'status', 'aria-live': 'polite' });

  // L'etichetta è uno <span>: il clic sopra deve fare quello che uno si
  // aspetta da una <label>.
  etichetta.addEventListener('click', () => leva.click());

  const aggiorna = () => {
    const accesa = sezioneAccesa(id);
    leva.setAttribute('aria-checked', String(accesa));
    nodo.dataset.acceso = accesa ? '1' : '0';
    const testo = accesa
      ? 'Si vede sul sito. L\'ordine delle sezioni si cambia dal Navigatore: menu ☰ → Struttura della pagina.'
      : 'Nascosta: sparisce dalla pagina, dal menu laterale e dai link che la puntano. Il sito pubblicato cambia quando pubblichi.';
    // Una regione live riletta a ogni disegno annuncerebbe la stessa frase
    // a ogni ricarica dell'anteprima.
    if (stato.textContent !== testo) stato.textContent = testo;
  };

  leva.addEventListener('click', () => {
    const accesa = !sezioneAccesa(id);
    if (!impostaSezione(id, accesa)) { aggiorna(); return; }
    aggiorna();
    if (!accesa) {
      // Spenta, la sezione esce dall'anteprima e con lei questa scheda:
      // si dice subito dove si riaccende, prima che sparisca.
      ponte.avviso('«' + nomeSezione(id) + '» è nascosta. Per riaccenderla usa l\'occhio nel Navigatore (menu ☰ → Struttura della pagina).', { tipo: 'info', durata: 7000 });
    }
  });

  nodo.append(el('div', { classe: 'interruttore__riga parti__vis-riga' }, [leva, etichetta]), stato);
  aggiorna();
  return { nodo, aggiorna };
}

function interruttoriDiretta() {
  const lista = el('div', { classe: 'parti__campi' });
  const chiavi = [];
  for (const chiave of INTERRUTTORI_DIRETTA) {
    const controllo = campoDelloSchema(chiave);
    if (!controllo) continue;
    lista.append(controllo.nodo);
    chiavi.push(chiave);
  }
  if (!chiavi.length) return null;
  return {
    chiavi,
    nodo: el('div', { classe: 'parti__blocco' }, [
      el('h3', { classe: 'parti__sottotitolo', testo: 'Parti che si possono spegnere' }),
      el('p', { classe: 'parti__nota', testo: 'Spenta, una parte non viene nemmeno scritta nella pagina: sparisce anche dall\'anteprima, e i suoi testi non hanno effetto finché non la riaccendi.' }),
      lista
    ])
  };
}

/** Parti, blocchi, testi e immagini di una sezione, letti dall'anteprima. */
function raccogli(elSezione) {
  const trovati = { parti: [], blocchi: [], testi: [] };
  if (!elSezione || typeof elSezione.querySelectorAll !== 'function') return trovati;
  const visti = new Set();
  // Una sezione dentro l'altra oggi non c'è; se arrivasse, ognuna elenca
  // solo quello che è suo.
  const suo = (nodo) => {
    const sezione = nodo.closest('[data-sb-sezione]');
    return !sezione || sezione === elSezione;
  };

  for (const nodo of elSezione.querySelectorAll('[data-sb-parte]')) {
    const nome = nodo.getAttribute('data-sb-parte');
    if (!nome || visti.has('p:' + nome) || !suo(nodo)) continue;
    visti.add('p:' + nome);
    trovati.parti.push({ id: 'parte:' + nome, tipo: 'parte', nome: nomeParte(nome), dettaglio: '', visibile: siVede(nodo) });
  }

  for (const nodo of elSezione.querySelectorAll('[data-sb-blocco]')) {
    const id = nodo.getAttribute('data-sb-blocco');
    if (!id || visti.has('b:' + id) || !suo(nodo)) continue;
    visti.add('b:' + id);
    trovati.blocchi.push({ id: 'blocco:' + id, tipo: 'blocco', nome: nomeBlocco(id), dettaglio: '', visibile: siVede(nodo) });
  }

  for (const nodo of elSezione.querySelectorAll('[data-sb-testo], [data-sb-immagine]')) {
    if (!suo(nodo)) continue;
    const immagine = nodo.getAttribute('data-sb-immagine');
    if (immagine) {
      if (visti.has('i:' + immagine)) continue;
      visti.add('i:' + immagine);
      trovati.testi.push({
        id: 'immagine:' + immagine, tipo: 'immagine', nome: ponte.etichetta(immagine),
        dettaglio: String(nodo.getAttribute('src') || '').split('/').pop(), visibile: siVede(nodo)
      });
      continue;
    }
    const chiave = nodo.getAttribute('data-sb-testo');
    if (!chiave || visti.has('t:' + chiave)) continue;
    visti.add('t:' + chiave);
    trovati.testi.push({
      id: 'testo:' + chiave, tipo: 'testo', nome: ponte.etichetta(chiave),
      dettaglio: estratto(nodo.textContent, 70), visibile: siVede(nodo)
    });
  }

  return trovati;
}

function vaiA(id) {
  chiamaMotore('seleziona', id);
  chiamaMotore('scorriA', id);
}

function evidenzia(id) {
  chiamaMotore('evidenzia', id || null);
}

function bottoneVoce(voce) {
  return el('li', {}, [
    el('button', {
      type: 'button', classe: 'parti__voce', dati: { tipo: voce.tipo },
      su: {
        click: () => vaiA(voce.id),
        mouseenter: () => evidenzia(voce.id),
        mouseleave: () => evidenzia(null),
        focus: () => evidenzia(voce.id),
        blur: () => evidenzia(null)
      }
    }, [
      el('span', { classe: 'parti__voce-nome', testo: voce.nome }),
      voce.dettaglio ? el('span', { classe: 'parti__voce-dettaglio', testo: voce.dettaglio }) : null,
      voce.visibile ? null : el('span', { classe: 'parti__voce-spenta', testo: 'non si vede qui' })
    ])
  ]);
}

function gruppoVoci(titolo, voci, pieghevole) {
  if (!voci.length) return null;
  const elenco = el('ul', { classe: 'parti__voci' }, voci.map(bottoneVoce));
  const conta = el('span', { classe: 'parti__conta', testo: String(voci.length) });
  if (pieghevole) {
    // Una sezione come «Chi sono» ha una trentina di testi: aperti tutti
    // sarebbero un muro fra l'interruttore e il resto.
    const piega = el('details', { classe: 'parti__gruppo parti__gruppo--piega' }, [
      el('summary', { classe: 'parti__gruppo-titolo' }, [titolo, conta]),
      elenco
    ]);
    if (voci.length <= 8) piega.open = true;
    return piega;
  }
  return el('div', { classe: 'parti__gruppo' }, [
    el('h4', { classe: 'parti__gruppo-titolo' }, [titolo, conta]),
    elenco
  ]);
}

function aggiornaContiene(voce, elSezione) {
  const trovati = raccogli(elSezione);
  const firma = JSON.stringify(trovati);
  if (firma === voce.firmaContiene) return;
  // I bottoni si rifanno solo se è cambiato qualcosa: altrimenti chi ci è
  // arrivato con Tab perderebbe il posto a ogni ricarica dell'anteprima.
  const piegate = new Map(Array.from(voce.contiene.querySelectorAll('details')).map((d) => [d.querySelector('summary').firstChild.textContent, d.open]));
  voce.firmaContiene = firma;
  svuota(voce.contiene);

  const gruppi = [
    gruppoVoci('Parti con i loro dati', trovati.parti, false),
    gruppoVoci('Blocchi', trovati.blocchi, false),
    gruppoVoci('Testi e immagini', trovati.testi, true)
  ].filter(Boolean);

  for (const gruppo of gruppi) {
    if (gruppo.tagName === 'DETAILS') {
      const titolo = gruppo.querySelector('summary').firstChild.textContent;
      if (piegate.has(titolo)) gruppo.open = piegate.get(titolo);
    }
  }

  voce.contiene.append(
    el('h3', { classe: 'parti__sottotitolo', testo: 'Cosa contiene' }),
    el('p', { classe: 'parti__nota', testo: gruppi.length ? 'Clicca una voce per selezionarla nell\'anteprima.' : 'Qui dentro non c\'è niente da scegliere da solo.' }),
    ...gruppi
  );
}

/* I campi del gruppo della sezione che nell'anteprima non hanno un
   marcatore e non stanno in una parte: si possono cambiare solo da qui. */
function chiaviNascoste(id, documento) {
  const gruppo = ponte.gruppo(gruppoDellaSezione(id));
  if (!gruppo || !documento || typeof documento.querySelectorAll !== 'function') return [];
  const schema = schemaCorrente();
  const marcate = new Set();
  for (const nodo of documento.querySelectorAll('[data-sb-testo], [data-sb-immagine], [data-sb-alt]')) {
    for (const nome of ['data-sb-testo', 'data-sb-immagine', 'data-sb-alt']) {
      const valore = nodo.getAttribute(nome);
      if (valore) marcate.add(valore);
    }
  }
  return (gruppo.campi || [])
    .map((campo) => campo && campo.chiave)
    .filter((chiave) => chiave && !marcate.has(chiave) && !partiDellaChiave(chiave, schema).length);
}

function aggiornaNascosti(voce, id, documento) {
  const chiavi = chiaviNascoste(id, documento);
  const firma = chiavi.join('|');
  if (firma === voce.firmaNascosti) return;
  voce.firmaNascosti = firma;
  svuota(voce.nascosti);
  voce.chiaviNascoste = [];

  const lista = el('div', { classe: 'parti__campi' });
  for (const chiave of chiavi) {
    const controllo = campoDelloSchema(chiave);
    if (!controllo) continue;
    lista.append(controllo.nodo);
    voce.chiaviNascoste.push(chiave);
  }
  voce.nascosti.hidden = !voce.chiaviNascoste.length;
  if (!voce.chiaviNascoste.length) return;

  voce.nascosti.append(
    el('h3', { classe: 'parti__sottotitolo', testo: 'Testi che non si vedono in pagina' }),
    el('p', { classe: 'parti__nota', testo: 'Campi di questa sezione che nell\'anteprima non si possono cliccare: righe lette solo dai lettori di schermo, testi che il sito scrive da solo mentre gira, parole attaccate a un\'icona o a un numero.' }),
    lista
  );
}

function costruisciSezione(id) {
  const idTitolo = idUnico('parti-titolo');
  const vis = controlloVisibilita(id);
  const interruttori = id === 'diretta' ? interruttoriDiretta() : null;
  const contiene = el('div', { classe: 'parti__blocco parti__contiene' });
  const nascosti = el('div', { classe: 'parti__blocco parti__nascosti', hidden: true });
  const rimando = id === 'sondaggio' ? el('div', { classe: 'parti__blocco' }, [
    el('p', { classe: 'parti__nota', testo: 'Qui ci sono solo le scritte fisse del riquadro. Domanda, risposte e durata si scrivono nella schermata Sondaggi, e vanno online subito.' }),
    el('button', {
      type: 'button', classe: 'btn btn--primario',
      su: { click: () => document.dispatchEvent(new CustomEvent('sb:apri-vista', { detail: { vista: 'sondaggi' } })) }
    }, [el('span', { testo: 'Crea o gestisci i sondaggi' })])
  ]) : null;

  const radice = el('section', {
    classe: 'parti parti--sezione', 'aria-labelledby': idTitolo,
    dati: { parti: 'sezione', sezione: id }
  }, [
    testa('Sezione', nomeSezione(id), descrizioneSezione(id), idTitolo),
    rimando,
    vis.nodo,
    interruttori ? interruttori.nodo : null,
    contiene,
    nascosti
  ]);

  const voce = {
    radice, vis, contiene, nascosti,
    dati: datiCorrenti(), schema: schemaCorrente(),
    chiaviInterruttori: interruttori ? interruttori.chiavi : [],
    chiaviNascoste: [],
    firmaContiene: null, firmaNascosti: null, letta: false,
    fuoco: null, cursore: null
  };
  seguiFuoco(voce);
  return voce;
}

function ispettoreSezione(primo, secondo) {
  const [riquadro, meta] = argomenti(primo, secondo);
  if (!riquadro) return null;
  if (!meta || meta.tipo !== 'sezione') {
    togliProprio(riquadro, 'sezione');
    return null;
  }
  const id = String(meta.chiave || (meta.el && meta.el.getAttribute && meta.el.getAttribute('data-sb-sezione')) || meta.sezione || '');

  let voce = cacheSezioni.get(id);
  const riusabile = Boolean(voce) && ponte.pronto && voce.dati === datiCorrenti() && voce.schema === schemaCorrente();
  if (!riusabile) {
    voce = costruisciSezione(id);
    if (ponte.pronto) cacheSezioni.set(id, voce);
    else cacheSezioni.delete(id);
  }

  voce.vis.aggiorna();
  // Durante una ricarica il motore passa ancora l'elemento della pagina
  // vecchia, già staccato: contenuto e marcatori si rileggono quando c'è
  // quella nuova, e intanto resta a video l'ultima lettura buona.
  const elSezione = meta.el;
  if (elSezione && (elSezione.isConnected || !voce.letta)) {
    aggiornaContiene(voce, elSezione);
    aggiornaNascosti(voce, id, elSezione.ownerDocument);
    voce.letta = true;
  }

  metti(riquadro, 'sezione', voce.radice);
  if (riusabile) rimettiFuoco(voce);
  return voce.radice;
}

/* ------------------------------------------------------------ Navigatore */

const navigatori = [];

/* Dopo uno spostamento o una riaccensione dal Navigatore l'anteprima si
   ricarica restando dov'era: la sezione toccata può finire fuori vista, e
   la si porta sotto gli occhi appena la pagina nuova è pronta. */
let daMostrare = '';

function annuncia(nav, messaggio) {
  // Svuotare e riscrivere dopo un attimo: la stessa frase due volte di
  // fila, altrimenti, un lettore di schermo non la ripete.
  nav.annuncio.textContent = '';
  setTimeout(() => { nav.annuncio.textContent = messaggio; }, 40);
}

function sezioneSelezionata() {
  const meta = chiamaMotore('selezione');
  if (!meta) return '';
  if (meta.sezione) return String(meta.sezione);
  for (let corrente = meta, giri = 0; corrente && giri < 12; corrente = corrente.genitore, giri += 1) {
    if (corrente.tipo === 'sezione') return String(corrente.chiave || '');
  }
  return '';
}

function segnaCorrente(nav) {
  const corrente = sezioneSelezionata();
  for (const riga of Array.from(nav.elenco.children)) {
    if (riga.dataset.sezione && riga.dataset.sezione === corrente) riga.setAttribute('aria-current', 'true');
    else riga.removeAttribute('aria-current');
  }
}

function vaiAllaSezione(id) {
  const meta = chiamaMotore('seleziona', 'sezione:' + id);
  chiamaMotore('scorriA', 'sezione:' + id);
  navigatori.forEach(segnaCorrente);
  if (meta) return;
  const accesa = id === FISSA_IN_CIMA || id === FISSA_IN_FONDO || sezioneAccesa(id);
  ponte.avviso(accesa
    ? '«' + nomeSezione(id) + '» non è ancora nell\'anteprima: aspetta che finisca di aggiornarsi e riprova.'
    : '«' + nomeSezione(id) + '» è nascosta, quindi nell\'anteprima non c\'è. Riaccendila con l\'occhio per vederla.',
  { tipo: 'info', durata: 5000 });
}

function bottonePrincipale(id, numero, accesa) {
  const nome = nomeSezione(id);
  const idCosa = idUnico('navigatore-cosa');
  // Il nome accessibile è il solo nome della sezione: la descrizione, letta
  // tutta dentro il nome del bottone, farebbe sei frasi lunghe di fila a
  // chi scorre l'elenco con un lettore di schermo. Resta come descrizione.
  return el('button', {
    type: 'button', classe: 'navigatore__principale',
    dati: { riga: id, azione: 'vai' },
    'aria-label': accesa ? nome : nome + ', nascosta',
    'aria-describedby': idCosa,
    title: accesa ? 'Vai a «' + nome + '» nell\'anteprima' : '«' + nome + '» è nascosta',
    su: {
      click: () => vaiAllaSezione(id),
      mouseenter: () => evidenzia('sezione:' + id),
      mouseleave: () => evidenzia(null),
      focus: () => evidenzia('sezione:' + id),
      blur: () => evidenzia(null)
    }
  }, [
    el('span', { classe: 'navigatore__num', 'aria-hidden': 'true', testo: numero }),
    el('span', { classe: 'navigatore__testo' }, [
      el('span', { classe: 'navigatore__nome' }, [
        nome,
        accesa ? null : el('span', { classe: 'navigatore__segno', testo: 'nascosta' })
      ]),
      el('span', { classe: 'navigatore__cosa', id: idCosa, testo: descrizioneSezione(id) })
    ])
  ]);
}

function rigaFissa(id) {
  return el('li', {
    classe: 'navigatore__riga', dati: { sezione: id, fissa: '1' }
  }, [
    el('span', { classe: 'navigatore__lucchetto', title: FRASI_BLOCCATE[id] }, [
      disegno('lucchetto'),
      el('span', { classe: 'sr-only', testo: 'Sempre al suo posto' })
    ]),
    bottonePrincipale(id, '·', true),
    el('span', { classe: 'navigatore__fissa', testo: 'sempre' })
  ]);
}

function riga(nav, sezioni, voce, indice) {
  const id = voce.id;
  const nome = nomeSezione(id);
  const accesa = voce.attiva;
  const [primo, ultimo] = intervalloLibero(sezioni, indice);
  const totale = sezioni.length;

  const muovi = (verso, azione) => {
    if (verso < primo || verso > ultimo || verso === indice) {
      annuncia(nav, '«' + nome + '» non può andare oltre: ' + (verso < indice ? 'sopra c\'è la copertina, che resta prima.' : 'è già l\'ultima.'));
      return;
    }
    // Il fuoco si prenota prima di scrivere: la scrittura emette
    // sb:modifica e il Navigatore si ridisegna subito, dentro questa chiamata.
    nav.fuocoDopo = { riga: id, azione };
    if (!spostaSezione(indice, verso)) { nav.fuocoDopo = null; return; }
    daMostrare = id;
    annuncia(nav, '«' + nome + '» ora è la sezione ' + (verso + 1) + ' di ' + totale + '.');
  };

  if (id === BLOCCATA) {
    return el('li', {
      classe: 'navigatore__riga', dati: { sezione: id, bloccata: '1', indice: String(indice) }
    }, [
      el('span', { classe: 'navigatore__lucchetto', title: FRASI_BLOCCATE[id] }, [
        disegno('lucchetto'),
        el('span', { classe: 'sr-only', testo: 'Bloccata: sempre prima e sempre accesa' })
      ]),
      bottonePrincipale(id, String(indice + 1), true),
      el('span', { classe: 'navigatore__fissa', testo: 'fissa' })
    ]);
  }

  const maniglia = el('button', {
    type: 'button', classe: 'navigatore__maniglia',
    dati: { riga: id, azione: 'maniglia' },
    'aria-label': 'Sposta «' + nome + '», posizione ' + (indice + 1) + ' di ' + totale,
    'aria-describedby': nav.idAiuto,
    title: 'Trascina per spostare, oppure frecce su e giù'
  }, [disegno('maniglia')]);

  maniglia.addEventListener('keydown', (evento) => {
    let verso = null;
    if (evento.key === 'ArrowUp') verso = indice - 1;
    else if (evento.key === 'ArrowDown') verso = indice + 1;
    else if (evento.key === 'Home') verso = primo;
    else if (evento.key === 'End') verso = ultimo;
    if (verso === null) return;
    evento.preventDefault();
    muovi(verso, 'maniglia');
  });
  maniglia.addEventListener('pointerdown', (evento) => avviaTrascinamento(nav, evento, indice, maniglia));

  const occhio = el('button', {
    type: 'button', classe: 'navigatore__attrezzo navigatore__occhio',
    dati: { riga: id, azione: 'occhio' },
    'aria-pressed': String(accesa),
    'aria-label': accesa ? 'Nascondi «' + nome + '» dal sito' : 'Mostra «' + nome + '» sul sito',
    title: accesa ? 'Si vede sul sito: clicca per nasconderla' : 'Nascosta: clicca per mostrarla'
  }, [disegno(accesa ? 'occhio' : 'occhioSpento')]);
  occhio.addEventListener('click', () => {
    nav.fuocoDopo = { riga: id, azione: 'occhio' };
    if (!impostaSezione(id, !accesa)) { nav.fuocoDopo = null; return; }
    if (!accesa) daMostrare = id;
    annuncia(nav, '«' + nome + '» ' + (accesa ? 'è nascosta.' : 'si vede sul sito.'));
  });

  const su = el('button', {
    type: 'button', classe: 'navigatore__attrezzo',
    dati: { riga: id, azione: 'su' },
    'aria-label': 'Sposta più in alto: ' + nome, title: 'Più in alto',
    disabled: indice - 1 < primo
  }, [disegno('su')]);
  su.addEventListener('click', () => muovi(indice - 1, 'su'));

  const giu = el('button', {
    type: 'button', classe: 'navigatore__attrezzo',
    dati: { riga: id, azione: 'giu' },
    'aria-label': 'Sposta più in basso: ' + nome, title: 'Più in basso',
    disabled: indice + 1 > ultimo
  }, [disegno('giu')]);
  giu.addEventListener('click', () => muovi(indice + 1, 'giu'));

  return el('li', {
    classe: 'navigatore__riga',
    dati: { sezione: id, ordinabile: '1', indice: String(indice), spenta: accesa ? '0' : '1' }
  }, [
    maniglia,
    bottonePrincipale(id, String(indice + 1), accesa),
    el('span', { classe: 'navigatore__attrezzi' }, [occhio, su, giu])
  ]);
}

function dipingi(nav, forza) {
  if (nav.trascina) return;   // mai sotto il dito: si ridisegna a fine trascinamento
  if (!ponte.pronto || !datiCorrenti()) {
    nav.firma = null;
    svuota(nav.elenco);
    nav.elenco.append(el('li', { classe: 'navigatore__vuoto', testo: 'Sto caricando le sezioni…' }));
    return;
  }

  const sezioni = leggiSezioni();
  const firma = JSON.stringify(sezioni);
  if (!forza && firma === nav.firma) {
    segnaCorrente(nav);
    return;
  }
  nav.firma = firma;

  let rimetti = nav.fuocoDopo;
  nav.fuocoDopo = null;
  const attivo = document.activeElement;
  if (!rimetti && attivo && nav.radice.contains(attivo) && attivo.dataset && attivo.dataset.azione) {
    rimetti = { riga: attivo.dataset.riga, azione: attivo.dataset.azione };
  }

  svuota(nav.elenco);
  nav.elenco.append(rigaFissa(FISSA_IN_CIMA));
  sezioni.forEach((voce, indice) => nav.elenco.append(riga(nav, sezioni, voce, indice)));
  nav.elenco.append(rigaFissa(FISSA_IN_FONDO));
  segnaCorrente(nav);

  if (rimetti) {
    const cerca = (azione) => nav.elenco.querySelector('[data-riga="' + rimetti.riga + '"][data-azione="' + azione + '"]');
    let bersaglio = cerca(rimetti.azione);
    // Una freccia arrivata al bordo si spegne: il fuoco passa alla maniglia
    // della stessa riga invece di cadere sul fondo della pagina.
    if (!bersaglio || bersaglio.disabled) bersaglio = cerca('maniglia') || cerca('vai');
    if (bersaglio) bersaglio.focus({ preventScroll: true });
  }
}

function aggiornaNavigatori(forza) {
  for (const nav of navigatori) dipingi(nav, forza);
}

/* Trascinamento con mouse, penna o dito. La maniglia cattura il puntatore,
   quindi il trascinamento continua anche uscendo dalla riga. */
function avviaTrascinamento(nav, evento, indice, maniglia) {
  if (evento.button !== undefined && evento.button !== 0) return;
  const sezioni = leggiSezioni();
  // Una riga per voce di config.sezioni, copertina compresa: l'indice della
  // riga è lo stesso dell'elenco, e il tratto libero esclude la copertina.
  const righe = Array.from(nav.elenco.querySelectorAll(':scope > li[data-indice]'));
  const rigaPresa = righe[indice];
  if (!rigaPresa) return;
  const [primo, ultimo] = intervalloLibero(sezioni, indice);

  const stato = {
    da: indice, a: indice, attivo: false,
    inizioY: evento.clientY, puntatore: evento.pointerId
  };

  const centro = (nodo) => {
    const rettangolo = nodo.getBoundingClientRect();
    return rettangolo.top + rettangolo.height / 2;
  };

  /* Chi supera la metà di una riga libera ne prende il posto. */
  const destinazione = (y) => {
    let verso = stato.da;
    for (let j = stato.da + 1; j <= ultimo; j += 1) if (y > centro(righe[j])) verso = j;
    for (let j = stato.da - 1; j >= primo; j -= 1) if (y < centro(righe[j])) verso = j;
    return verso;
  };

  /* La linea d'arrivo è un bordo sulla riga di destinazione, non un
     elemento in più: le righe non saltano sotto il puntatore. */
  const segnaArrivo = () => {
    for (const r of righe) delete r.dataset.arrivo;
    if (stato.a !== stato.da) righe[stato.a].dataset.arrivo = stato.a > stato.da ? 'dopo' : 'prima';
  };

  const muovi = (ev) => {
    if (ev.pointerId !== stato.puntatore) return;
    if (!stato.attivo) {
      if (Math.abs(ev.clientY - stato.inizioY) < 5) return;   // un clic tremolante non è un trascinamento
      stato.attivo = true;
      nav.trascina = stato;
      rigaPresa.dataset.trascina = '1';
      nav.radice.dataset.trascina = '1';
    }
    ev.preventDefault();
    const verso = destinazione(ev.clientY);
    if (verso !== stato.a) {
      stato.a = verso;
      segnaArrivo();
    }
  };

  const fine = (conferma) => {
    maniglia.removeEventListener('pointermove', muovi);
    maniglia.removeEventListener('pointerup', su);
    maniglia.removeEventListener('pointercancel', annulla);
    maniglia.removeEventListener('keydown', esc, true);
    try { maniglia.releasePointerCapture(stato.puntatore); } catch { /* già rilasciato */ }
    for (const r of righe) delete r.dataset.arrivo;
    delete rigaPresa.dataset.trascina;
    delete nav.radice.dataset.trascina;
    const eraAttivo = stato.attivo;
    nav.trascina = null;

    if (eraAttivo && conferma && stato.a !== stato.da) {
      const id = sezioni[stato.da].id;
      nav.fuocoDopo = { riga: id, azione: 'maniglia' };
      if (spostaSezione(stato.da, stato.a)) {
        daMostrare = id;
        annuncia(nav, '«' + nomeSezione(id) + '» ora è la sezione ' + (stato.a + 1) + ' di ' + sezioni.length + '.');
        return;
      }
      nav.fuocoDopo = null;
    }
    if (eraAttivo) dipingi(nav, true);
  };

  const su = (ev) => { if (ev.pointerId === stato.puntatore) fine(true); };
  const annulla = (ev) => { if (ev.pointerId === stato.puntatore) fine(false); };
  const esc = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    fine(false);
  };

  try { maniglia.setPointerCapture(evento.pointerId); } catch { /* senza cattura funziona finché il puntatore resta sulla maniglia */ }
  maniglia.addEventListener('pointermove', muovi);
  maniglia.addEventListener('pointerup', su);
  maniglia.addEventListener('pointercancel', annulla);
  maniglia.addEventListener('keydown', esc, true);
}

/**
 * Il Navigatore delle sezioni dentro `contenitore`, che non si svuota:
 * binario in cima e piede in fondo fissi, le sei sezioni con maniglia,
 * occhio, su e giù. Chiamarlo di nuovo sullo stesso contenitore ridisegna
 * quello che c'è invece di aggiungerne un secondo. -> il nodo del Navigatore
 */
export function disegnaNavigatore(contenitore) {
  if (!eNodo(contenitore)) return null;

  // Chi ridisegna una vista chiama di nuovo questa funzione: i Navigatori
  // rimasti fuori dalla pagina non servono più.
  for (let i = navigatori.length - 1; i >= 0; i -= 1) {
    const vecchio = navigatori[i];
    if (!vecchio.radice.isConnected && vecchio.radice.parentNode !== contenitore) navigatori.splice(i, 1);
  }

  const esistente = navigatori.find((nav) => nav.radice.parentNode === contenitore);
  if (esistente) {
    dipingi(esistente, true);
    return esistente.radice;
  }

  const idAiuto = idUnico('navigatore-aiuto');
  const elenco = el('ol', { classe: 'navigatore__elenco', 'aria-label': 'Sezioni della pagina, dall\'alto in basso' });
  const annuncio = el('p', { classe: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const radice = el('div', { classe: 'navigatore', dati: { parti: 'navigatore' } }, [
    el('p', { classe: 'navigatore__intro', testo: 'Le sezioni della pagina dall\'alto in basso. Clicca un nome per andarci; trascina la maniglia, o usa le frecce, per cambiare l\'ordine; l\'occhio la mostra o la nasconde sul sito.' }),
    el('p', { classe: 'sr-only', id: idAiuto, testo: 'Con il fuoco sulla maniglia, freccia su e freccia giù spostano la sezione; Inizio e Fine la portano al primo o all\'ultimo posto libero.' }),
    elenco,
    annuncio
  ]);

  const nav = { radice, elenco, annuncio, idAiuto, firma: null, trascina: null, fuocoDopo: null };
  navigatori.push(nav);
  metti(contenitore, 'navigatore', radice);
  dipingi(nav, true);
  return radice;
}

/* --------------------------------------------------------------- eventi */

/* Una parte spenta dal suo stesso ispettore esce dall'anteprima alla
   ricarica, e la scheda sparirebbe con lei: si porta chi l'ha spenta
   sulla diretta, dove c'è l'interruttore per riaccenderla. */
const PARTE_DELL_INTERRUTTORE = {
  'config.account.attivo': 'account',
  'config.lurk.attivo': 'lurk',
  'config.pollo.attivo': 'pollo',
  'config.clip.attivo': 'clip'
};
let ritorno = null;   // { da: 'parte:pollo', a: 'sezione:diretta' }

function riportaSeServe() {
  if (!ritorno) return;
  const meta = chiamaMotore('selezione');
  if (meta && meta.id !== ritorno.da && meta.el && meta.el.isConnected) { ritorno = null; return; }
  if (meta && meta.id === ritorno.da && meta.el && meta.el.isConnected) return;   // la parte c'è ancora: la pagina nuova non è arrivata
  const destinazione = ritorno.a;
  ritorno = null;
  chiamaMotore('seleziona', destinazione);
}

document.addEventListener('sb:modifica', (evento) => {
  const dettaglio = evento.detail || {};
  const chiave = typeof dettaglio.chiave === 'string' ? dettaglio.chiave : '';

  // Un campo cambiato altrove mentre il nodo di una parte o di una sezione
  // non era a video: quel nodo mostra ancora il valore vecchio, si butta.
  for (const [nome, voce] of cacheParti) {
    if (!voce.radice.isConnected && tocca(voce.chiavi, chiave)) cacheParti.delete(nome);
  }
  for (const [id, voce] of cacheSezioni) {
    if (!voce.radice.isConnected && tocca(voce.chiaviInterruttori.concat(voce.chiaviNascoste), chiave)) cacheSezioni.delete(id);
  }

  if (Object.prototype.hasOwnProperty.call(PARTE_DELL_INTERRUTTORE, chiave)) {
    const nome = PARTE_DELL_INTERRUTTORE[chiave];
    const voce = cacheParti.get(nome);
    if (ponte.leggi(chiave) === false && voce && voce.radice.isConnected) ritorno = { da: 'parte:' + nome, a: 'sezione:diretta' };
    else if (ponte.leggi(chiave) === true && ritorno && ritorno.da === 'parte:' + nome) ritorno = null;
  }

  aggiornaNavigatori(false);
});

document.addEventListener('sb:sostituito', () => {
  // Dati nuovi: tutto quello che era tenuto da parte li mostra vecchi.
  cacheParti.clear();
  cacheSezioni.clear();
  ritorno = null;
  aggiornaNavigatori(true);
});

document.addEventListener('sb:pronto', () => {
  cacheParti.clear();
  cacheSezioni.clear();
  aggiornaNavigatori(true);
});

/* Dopo una ricarica il guscio non ridisegna la scheda se il fuoco è nel
   pannello (chi sta usando un interruttore non deve perderlo): «Cosa
   contiene» e i testi senza marcatore si rileggono qui dalla pagina nuova,
   sullo stesso nodo, così una parte appena spenta sparisce dall'elenco. */
function rileggiSezioniAVideo() {
  const documento = chiamaMotore('documento');
  if (!documento || typeof documento.querySelectorAll !== 'function') return;
  for (const [id, voce] of cacheSezioni) {
    if (!voce.radice.isConnected) continue;
    voce.vis.aggiorna();
    const elSezione = Array.from(documento.querySelectorAll('[data-sb-sezione]'))
      .find((nodo) => nodo.getAttribute('data-sb-sezione') === id);
    if (!elSezione) continue;
    aggiornaContiene(voce, elSezione);
    aggiornaNascosti(voce, id, documento);
    voce.letta = true;
  }
}

document.addEventListener('sb:anteprima-pronta', () => {
  // Un giro di eventi dopo: il motore ritrova la selezione nella pagina
  // nuova durante lo stesso evento, e qui serve sapere com'è finita.
  setTimeout(() => {
    riportaSeServe();
    rileggiSezioniAVideo();
    if (daMostrare) {
      const id = daMostrare;
      daMostrare = '';
      if (navigatori.some((nav) => nav.radice.isConnected)) chiamaMotore('scorriA', 'sezione:' + id);
    }
    navigatori.forEach(segnaCorrente);
  }, 0);
});

/* ---------------------------------------------------------- registrazione */

function registra() {
  if (!motore || typeof motore.registraIspettore !== 'function') {
    avvisaGuasto('registrazione', new Error('motore.registraIspettore non disponibile'));
    return;
  }
  motore.registraIspettore(ispettoreParte, {
    scheda: 'contenuto', ordine: 20,
    quando: (meta) => Boolean(meta) && meta.tipo === 'parte'
  });
  motore.registraIspettore(ispettoreSezione, {
    scheda: 'contenuto', ordine: 20,
    quando: (meta) => Boolean(meta) && meta.tipo === 'sezione'
  });
  if (typeof motore.suSelezione === 'function') {
    motore.suSelezione(() => {
      navigatori.forEach(segnaCorrente);
      if (ritorno) setTimeout(riportaSeServe, 0);
    });
  }
}

collegaFoglio();
try {
  registra();
} catch (errore) {
  avvisaGuasto('registrazione degli ispettori', errore);
}
