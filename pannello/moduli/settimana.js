/* =====================================================================
   settimana.js — l'editor della schedule (CONTRATTO-5 §8).

   Un campo solo, `config.orari`, e dentro tutta la settimana: giorni e
   ora di serie, le sette schede con la loro immagine, gli eventi speciali
   e il fondale della sezione. Resta un campo come gli altri (stessa firma,
   stesso oggetto di ritorno di moduli/campi.js) perché così lo disegnano
   le parti, la ricerca e il riepilogo degli errori senza sapere com'è
   fatto dentro.

   Tre scelte che spiegano metà del codice:

   1. LE REGOLE NON STANNO QUI. Limiti, valori vuoti, ore effettive e
      problemi arrivano da condivisi/orari.js (window.SBOrari), lo stesso
      file che usa il server: il pannello non può dire «va bene» a una
      durata che il salvataggio rifiuta.

   2. SI SCRIVE QUELLO CHE SI È SCRITTO. Una casella con «25:00» finisce
      nei dati così com'è, e l'errore compare accanto alla casella. Pulire
      in silenzio (normalizza) vorrebbe dire correggere alle spalle di chi
      scrive: normalizza serve solo a leggere, per i riassunti.

   3. IL DOM NON SI RIFÀ MENTRE SI SCRIVE. Righe, caselle e immagini
      nascono una volta; a ogni modifica si riscrivono solo i testi che
      riassumono (nastro in miniatura, riga del giorno, contatori). Un
      editor ridisegnato a ogni tasto perderebbe il fuoco a metà parola.

   Con l'anteprima parla attraverso il motore (import dinamico: se il
   motore manca l'editor funziona lo stesso): un clic su un giorno o su un
   evento nell'anteprima apre il posto giusto, quello aperto qui si
   contorna di ciano là, e fuoco, velo e intensità si vedono subito
   impostando le variabili CSS sull'elemento, prima della ricarica.
   ===================================================================== */

import '../condivisi/orari.js';
import { el, bottone, svuota, idUnico, urlRisorsa, menoMovimento, icona } from './dom.js';
import { guscio } from './campi.js';
import * as media from './media.js';
import { avviso, conferma } from './avvisi.js';

/* ------------------------------------------------------------ strumenti */

/** Le regole condivise. Il modulo le importa, ma si rileggono ogni volta
    invece di fissarle in una costante: un file arrivato rotto deve dare
    un messaggio, non un'eccezione a metà disegno. */
function regole() {
  return typeof window !== 'undefined' && window.SBOrari ? window.SBOrari : null;
}

function oggetto(valore) {
  return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
}

function clona(valore) {
  if (valore === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(valore);
  return JSON.parse(JSON.stringify(valore));
}

function leggiIn(radice, percorso) {
  let nodo = radice;
  for (const passo of String(percorso).split('.')) {
    if (nodo === null || typeof nodo !== 'object') return undefined;
    nodo = nodo[passo];
  }
  return nodo;
}

function scriviIn(radice, percorso, valore) {
  const passi = String(percorso).split('.');
  const ultimo = passi.pop();
  let nodo = radice;
  for (const passo of passi) {
    if (nodo[passo] === null || typeof nodo[passo] !== 'object') nodo[passo] = {};
    nodo = nodo[passo];
  }
  nodo[ultimo] = valore;
}

function due(n) {
  return (n < 10 ? '0' : '') + n;
}

function stringi(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** 4 -> «4 h», 0.5 -> «30 min», 2.5 -> «2 h 30». */
function testoDurata(ore) {
  const n = Number(ore);
  if (!Number.isFinite(n) || n <= 0) return '';
  const intere = Math.floor(n);
  const minuti = Math.round((n - intere) * 60);
  if (!intere) return minuti + ' min';
  return intere + ' h' + (minuti ? ' ' + due(minuti) : '');
}

/* Chi scrive un'ora a mano scrive «2130», «9», «21.30»: all'uscita dalla
   casella la si mette nella forma che il server vuole. Quello che non si
   capisce resta com'è, e l'errore lo dice. */
function oraDaTesto(testo) {
  const pulito = String(testo || '').trim();
  if (!pulito) return '';
  const pezzi = /^(\d{1,2})(?:\s*[:.,h]\s*|\s)?(\d{2})?$/.exec(pulito);
  if (!pezzi) return pulito;
  const ore = Number(pezzi[1]);
  const minuti = pezzi[2] ? Number(pezzi[2]) : 0;
  if (ore > 23 || minuti > 59) return pulito;
  return due(ore) + ':' + due(minuti);
}

/* Una casella numerica vuota vale null («di serie» per un giorno, «manca»
   per un evento); un numero si scrive come numero; il resto resta testo,
   così problemi() lo segnala invece di vederlo sparire. */
function durataDaTesto(testo) {
  const pulito = String(testo || '').trim().replace(',', '.');
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : pulito;
}

/** «AAAA-MM-GG» di oggi sull'orologio del canale. */
function oggiNelFuso(fuso) {
  const adesso = new Date();
  try {
    const parti = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(adesso).forEach((p) => { parti[p.type] = p.value; });
    return parti.year + '-' + parti.month + '-' + parti.day;
  } catch {
    return adesso.getFullYear() + '-' + due(adesso.getMonth() + 1) + '-' + due(adesso.getDate());
  }
}

/** Numero, mese e giorno della settimana di una data, o null. */
function pezziData(data) {
  const R = regole();
  const g = R.giornoDellaSettimana(data);
  if (g < 0) return null;
  const [, mese, giorno] = String(data).trim().split('-').map(Number);
  return {
    numero: String(giorno),
    mese: R.MESI[mese - 1].abbr,
    abbr: R.GIORNI[g].abbr,
    lungo: R.GIORNI[g].minuscolo + ' ' + giorno + ' ' + R.MESI[mese - 1].nome
  };
}

/** «sabato 27 settembre» sull'orologio di `fuso` all'istante `ms`. */
function dataNelFuso(ms, fuso) {
  try {
    return new Intl.DateTimeFormat('it-IT', { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
  } catch {
    return '';
  }
}

/* La miniatura di una riga: si rifà solo se cambia il file, così chi
   scrive un titolo non fa ricaricare sette immagini a ogni tasto. */
function miniatura(contenitore, voce) {
  contenitore.dataset.pieno = voce.immagine ? '1' : '0';
  const posizione = voce.fuoco.x + '% ' + voce.fuoco.y + '%';
  let img = contenitore.querySelector('img');
  if (!voce.immagine) {
    if (img) img.remove();
    return;
  }
  const src = urlRisorsa(voce.immagine);
  if (!img || img.getAttribute('src') !== src) {
    if (img) img.remove();
    img = el('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
    contenitore.append(img);
  }
  if (img.style.objectPosition !== posizione) img.style.objectPosition = posizione;
}

/* ------------------------------------------------------- l'anteprima */

/* Il motore è un modulo dell'editor: può mancare (pannello senza guscio)
   o non essersi ancora caricato. Si chiede una volta sola, e ogni suo uso
   passa da un try: un guasto là non deve fermare chi scrive qui. */
let motore = null;
let motoreChiesto = false;

function chiediMotore() {
  if (motoreChiesto) return;
  motoreChiesto = true;
  import('../editor/motore.js')
    .then((modulo) => {
      motore = modulo && modulo.motore ? modulo.motore : null;
      if (!motore) return;
      if (typeof motore.suSelezione === 'function') {
        // Selezione cambiata: l'editor può essere appena uscito dal
        // pannello, e il contorno nell'anteprima con lui.
        motore.suSelezione(() => setTimeout(aggiornaEvidenza, 0));
      }
      agganciaAnteprima();
    })
    .catch((errore) => {
      motore = null;
      console.warn('[settimana] motore dell\'anteprima non disponibile:', errore);
    });
}

function documentoAnteprima() {
  if (!motore || typeof motore.documento !== 'function') return null;
  try {
    return motore.documento() || null;
  } catch {
    return null;
  }
}

/* I selettori che SITO garantisce (CONTRATTO-5 §6.1). */
function selettoreDi(base) {
  const pezzi = String(base).split('.');
  if (pezzi[0] === 'schede') return 'li.nastro__giorno[data-giorno="' + Number(pezzi[1]) + '"]';
  if (pezzi[0] === 'eventi') return 'li.evento[data-evento="' + Number(pezzi[1]) + '"]';
  if (pezzi[0] === 'sfondo') return 'div.settimana__sfondo';
  return '';
}

function elementoInAnteprima(base) {
  const doc = documentoAnteprima();
  const selettore = selettoreDi(base);
  if (!doc || !selettore) return null;
  try {
    return doc.querySelector(selettore);
  } catch {
    return null;
  }
}

/** Variabili CSS sull'elemento dell'anteprima: si vede subito, la ricarica arriva dopo. */
function dalVivo(base, variabili) {
  const nodo = elementoInAnteprima(base);
  if (!nodo) return;
  for (const [nome, valore] of Object.entries(variabili)) nodo.style.setProperty(nome, valore);
}

/* Il contorno di ciò che è aperto qui. Un foglio iniettato e non una
   classe sull'elemento: la ricarica riscrive la pagina, e il foglio si
   rimette a ogni sb:anteprima-pronta con un solo punto che lo sa fare. Le
   variabili --sbm-* le mette già il motore nell'iframe. */
const ID_EVIDENZA = 'sb-palinsesto-evidenza';

function aggiornaEvidenza() {
  const doc = documentoAnteprima();
  if (!doc) return;
  const istanza = istanzaAVideo();
  const selettore = istanza ? istanza.selettoreEvidenza() : '';
  const testo = selettore
    ? selettore + ' { outline: calc(3px * var(--sbm-k, 1)) solid var(--sbm-ciano); outline-offset: calc(-3px * var(--sbm-k, 1)); }'
    : '';
  let stile = doc.getElementById(ID_EVIDENZA);
  if (!stile) {
    if (!testo) return;
    stile = doc.createElement('style');
    stile.id = ID_EVIDENZA;
    (doc.head || doc.documentElement).append(stile);
  }
  if (stile.textContent !== testo) stile.textContent = testo;
}

/** Porta in vista nell'anteprima l'elemento di `base`, solo se è fuori schermo. */
function scorriAnteprimaA(base) {
  const nodo = elementoInAnteprima(base);
  const finestra = nodo && nodo.ownerDocument ? nodo.ownerDocument.defaultView : null;
  if (!nodo || !finestra) return;
  const r = nodo.getBoundingClientRect();
  const alta = finestra.innerHeight;
  if (r.top >= 0 && r.bottom <= alta) return;
  if (r.height > alta && r.top >= 0 && r.top < alta * 0.6) return;
  const alto = Math.max(0, Math.round(finestra.scrollY + r.top - Math.max(24, (alta - Math.min(r.height, alta)) / 2)));
  try {
    finestra.scrollTo({ top: alto, left: finestra.scrollX, behavior: menoMovimento() ? 'instant' : 'smooth' });
  } catch {
    finestra.scrollTo(finestra.scrollX, alto);
  }
}

/* Il motore seleziona la parte (nastro o eventi) con il suo ascoltatore in
   cattura sulla finestra dell'iframe, quindi prima di questo: quando il
   clic arriva qui il guscio ha già messo a video l'editor della parte, e
   basta aprirci il giorno o l'evento da cui il clic è partito. */
function suClicAnteprima(evento) {
  const bersaglio = evento.target && evento.target.nodeType === 1 ? evento.target : (evento.target ? evento.target.parentElement : null);
  if (!bersaglio || typeof bersaglio.closest !== 'function') return;
  if (bersaglio.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
  const giorno = bersaglio.closest('li.nastro__giorno[data-giorno]');
  const speciale = giorno ? null : bersaglio.closest('li.evento[data-evento]');
  if (!giorno && !speciale) return;
  const istanza = istanzaAVideo();
  if (!istanza) return;
  if (giorno) istanza.apriGiorno(Number(giorno.getAttribute('data-giorno')), { dallAnteprima: true });
  else istanza.apriEvento(Number(speciale.getAttribute('data-evento')), { dallAnteprima: true });
}

/* document.open() del motore toglie gli ascoltatori dal documento ma lascia
   lo stesso oggetto: si riconosce una pagina nuova dal suo <html>. */
const pagineAgganciate = new WeakSet();

function agganciaAnteprima() {
  const doc = documentoAnteprima();
  if (!doc || !doc.documentElement) return;
  if (!pagineAgganciate.has(doc.documentElement)) {
    pagineAgganciate.add(doc.documentElement);
    doc.addEventListener('click', suClicAnteprima);
  }
  aggiornaEvidenza();
}

if (typeof document !== 'undefined') {
  document.addEventListener('sb:anteprima-pronta', () => {
    chiediMotore();
    agganciaAnteprima();
  });
}

/* -------------------------------------------------- editor a video */

/* Lo stesso campo può esistere più volte (la parte del nastro, quella
   degli eventi, la vista del gruppo): chi riceve un clic dall'anteprima è
   quello che si vede. Un'istanza appena creata non è ancora appesa a
   niente, e si butta solo dopo esserci stata. */
const istanze = new Set();

function istanzeVive() {
  for (const voce of Array.from(istanze)) {
    if (voce.nodo.isConnected) voce.appesa = true;
    else if (voce.appesa) istanze.delete(voce);
  }
  return Array.from(istanze);
}

function istanzaAVideo() {
  for (const voce of istanzeVive().reverse()) {
    if (voce.nodo.isConnected && voce.nodo.getClientRects().length) return voce.api;
  }
  return null;
}

/* Dove si era rimasti, condiviso fra le istanze: dopo Annulla il campo si
   ridisegna da capo, e deve riaprire la stessa vista e lo stesso giorno. */
const ricordo = { vista: 'settimana', giorno: null, evento: null };

const VISTE = [
  { id: 'settimana', nome: 'Settimana' },
  { id: 'eventi', nome: 'Eventi speciali' },
  { id: 'pause', nome: 'Giorni saltati' },
  { id: 'fondale', nome: 'Fondale' }
];

/* Rapporti (larghezza / altezza) dei ritagli del blocco immagine: come esce
   la locandina di un giorno, la scheda di un evento e il fondale nella pagina
   di SITO, misurati a 1400 px (Computer) e a 390 px (Telefono). Servono
   solo a far vedere cosa resta in vista con quel fuoco: se il sito cambia
   misure, si cambiano qui. */
const RITAGLI = {
  giorno: [{ nome: 'Computer', rapporto: '2 / 3' }, { nome: 'Telefono', rapporto: '16 / 9' }],
  evento: [{ nome: 'Computer', rapporto: '3 / 4' }, { nome: 'Telefono', rapporto: '5 / 4' }],
  sfondo: [{ nome: 'Computer', rapporto: '4 / 3' }, { nome: 'Telefono', rapporto: '2 / 3' }]
};

/* Due di quei rapporti al computer dipendono dai dati, e con un numero fisso
   il ritaglio mostrerebbe un'altra immagine da quella del sito:
   - la locandina di un giorno divide la riga con le altre dirette: con una
     sola è quasi quadrata, con sette è una striscia (misurate a 1400 px, da
     una a sette dirette);
   - il fondale è alto quanto la sezione fino a un tetto: senza eventi la
     sezione è bassa e il fondale largo (16:9), con gli eventi arriva al tetto
     (4:3). */
const LOCANDINA_COMPUTER = [0.59, 1.09, 0.85, 0.70, 0.59, 0.52, 0.46, 0.42];

function ritagliPer(uso, orari) {
  const R = regole();
  if (!R || !orari) return RITAGLI[uso];
  if (uso === 'giorno') {
    const dirette = Math.min(7, orari.giorni.length);
    return [{ nome: 'Computer', rapporto: LOCANDINA_COMPUTER[dirette] }, RITAGLI.giorno[1]];
  }
  if (uso === 'sfondo') {
    const conEventi = R.eventiFuturi(orari, Date.now()).length > 0;
    return [{ nome: 'Computer', rapporto: conEventi ? '4 / 3' : '16 / 9' }, RITAGLI.sfondo[1]];
  }
  return RITAGLI[uso];
}

/* ---------------------------------------------------------- riepilogo */

const riepiloghi = new Set();

function riepiloghiVivi() {
  for (const voce of Array.from(riepiloghi)) {
    if (voce.nodo.isConnected) voce.appeso = true;
    else if (voce.appeso) riepiloghi.delete(voce);
  }
  return Array.from(riepiloghi);
}

/**
 * Il riepilogo della schedule: quattro strumenti (dirette, di serie, fuso,
 * eventi), il nastro dei sette giorni in miniatura e il prossimo evento.
 * Lo usa l'editor in testa, e la parte «stato» della copertina da sola.
 * Si aggiorna da sé a ogni modifica della schedule.
 *
 * @param {object} opzioni
 *   - leggi(): il valore grezzo di config.orari
 *   - suGiorno(n): se c'è, i giorni del nastro in miniatura sono bottoni
 * @returns {{ nodo: HTMLElement, aggiorna: Function }}
 */
export function creaRiepilogoOrari({ leggi, suGiorno = null } = {}) {
  const R = regole();
  const nodo = el('div', { classe: 'palinsesto-riepilogo' });
  if (!R) {
    nodo.append(el('p', { classe: 'campo__aiuto', testo: 'Le regole della schedule (condivisi/orari.js) non si sono caricate: il riepilogo non si può calcolare.' }));
    return { nodo, aggiorna() {} };
  }

  const valori = {};
  const strumento = (nome, etichetta) => {
    valori[nome] = el('dd', { classe: 'palinsesto-riepilogo__valore' });
    return el('div', { classe: 'palinsesto-riepilogo__strumento' }, [
      el('dt', { classe: 'palinsesto-riepilogo__nome', testo: etichetta }),
      valori[nome]
    ]);
  };
  const strumenti = el('dl', { classe: 'palinsesto-riepilogo__strumenti' }, [
    strumento('dirette', 'Dirette'),
    strumento('serie', 'Di serie'),
    strumento('fuso', 'Fuso'),
    strumento('eventi', 'Eventi')
  ]);

  const celle = new Map();
  const nastro = el('ol', { classe: 'palinsesto-riepilogo__nastro', 'aria-label': 'La settimana in miniatura' });
  for (const n of R.ORDINE) {
    const abbr = el('span', { classe: 'palinsesto-riepilogo__abbr', testo: R.GIORNI[n].abbr });
    const ora = el('span', { classe: 'palinsesto-riepilogo__ora' });
    // La locandina del giorno, in trasparenza sotto il nome: il nastro in
    // miniatura somiglia a quello vero.
    const foto = el('span', { classe: 'palinsesto-riepilogo__foto', 'aria-hidden': 'true' });
    const cella = suGiorno
      ? el('button', { type: 'button', classe: 'palinsesto-riepilogo__cella', su: { click: () => suGiorno(n) } }, [foto, abbr, ora])
      : el('span', { classe: 'palinsesto-riepilogo__cella' }, [foto, abbr, ora]);
    celle.set(n, { cella, ora, foto });
    nastro.append(el('li', {}, [cella]));
  }

  const prossimo = el('p', { classe: 'palinsesto-riepilogo__prossimo' });

  function aggiorna() {
    const grezzo = leggi();
    const orari = R.normalizza(grezzo);
    const accesi = orari.giorni.length;
    valori.dirette.textContent = accesi ? accesi + ' a settimana' : 'Nessuna';
    valori.serie.textContent = orari.ora + ' · ' + testoDurata(orari.durataOre);
    valori.fuso.textContent = orari.fuso;

    const futuri = R.eventiFuturi(grezzo, Date.now());
    valori.eventi.textContent = futuri.length ? futuri.length + ' in arrivo' : 'Nessuno';

    for (const n of R.ORDINE) {
      const { cella, ora, foto } = celle.get(n);
      const acceso = orari.giorni.includes(n);
      const scheda = orari.schede[n];
      cella.dataset.acceso = acceso ? '1' : '0';
      cella.dataset.immagine = acceso && scheda.immagine ? '1' : '0';
      miniatura(foto, { immagine: acceso ? scheda.immagine : '', fuoco: scheda.fuoco });
      ora.textContent = acceso ? R.oraDi(grezzo, n) : '—';
      const descrizione = R.GIORNI[n].nome + (acceso
        ? ': diretta alle ' + R.oraDi(grezzo, n) + (scheda.titolo ? ', ' + scheda.titolo : '')
        : ': riposo');
      if (suGiorno) cella.setAttribute('aria-label', descrizione + '. Apri il giorno');
      else cella.setAttribute('title', descrizione);
    }

    svuota(prossimo);
    const primo = futuri[0];
    if (primo) {
      const pezzi = pezziData(primo.data);
      const inOnda = primo.inizio <= Date.now();
      prossimo.append(
        el('span', { classe: 'palinsesto-riepilogo__nome', testo: inOnda ? 'Evento in onda' : 'Prossimo evento' }),
        el('span', {
          classe: 'palinsesto-riepilogo__evento',
          testo: (pezzi ? pezzi.abbr.toLowerCase() + ' ' + pezzi.numero + ' ' + pezzi.mese : primo.data) + ' · ' + primo.ora +
            ' · ' + (primo.titolo || 'Senza titolo')
        })
      );
    }
    prossimo.hidden = !primo;
  }

  nodo.append(strumenti, nastro, prossimo);
  const voce = { nodo, appeso: false, aggiorna };
  riepiloghi.add(voce);
  aggiorna();
  return { nodo, aggiorna };
}

/* Ogni scrittura della schedule, da qualunque parte arrivi, riallinea i
   riepiloghi a video. Una volta per fotogramma: un trascinamento del
   fuoco scrive a ogni movimento. */
let riepiloghiProgrammati = 0;
function programmaRiepiloghi() {
  if (riepiloghiProgrammati) return;
  riepiloghiProgrammati = requestAnimationFrame(() => {
    riepiloghiProgrammati = 0;
    for (const voce of riepiloghiVivi()) {
      if (voce.nodo.isConnected) voce.aggiorna();
    }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('sb:modifica', (evento) => {
    const chiave = evento.detail && typeof evento.detail.chiave === 'string' ? evento.detail.chiave : '';
    if (!chiave || chiave === 'config.orari' || chiave.startsWith('config.orari.')) programmaRiepiloghi();
  });
  document.addEventListener('sb:sostituito', programmaRiepiloghi);
}

/* ------------------------------------------------------------- campi */

/**
 * Una casella piccola dell'editor: etichetta in monospazio, input, riga
 * dell'errore e, se c'è un tetto, il contatore.
 */
function casella({ etichetta, tipo = 'text', max = null, segnaposto = '', aiuto = '', attributi = {} }) {
  const id = idUnico('pal');
  const idAiuto = aiuto ? id + '-aiuto' : null;
  const idErrore = id + '-errore';
  const input = el('input', {
    id, type: tipo, classe: 'campo__input palinsesto-campo__input',
    maxlength: max, placeholder: segnaposto || null, autocomplete: 'off',
    'aria-describedby': [idAiuto, idErrore].filter(Boolean).join(' '),
    ...attributi
  });
  const errore = el('p', { classe: 'campo__errore', id: idErrore, hidden: true, role: 'alert' });
  const contatore = max ? el('span', { classe: 'campo__contatore', 'aria-hidden': 'true' }) : null;
  const nodo = el('div', { classe: 'palinsesto-campo' }, [
    el('label', { classe: 'palinsesto__etichetta', for: id, testo: etichetta }),
    input,
    aiuto ? el('p', { classe: 'palinsesto-campo__aiuto', id: idAiuto, testo: aiuto }) : null,
    el('div', { classe: 'campo__pie' }, [errore, contatore])
  ]);

  const conta = () => {
    if (!contatore) return;
    const n = input.value.trim().length;
    contatore.textContent = n + ' / ' + max;
    contatore.dataset.livello = n > max ? 'oltre' : (n > max * 0.9 ? 'vicino' : 'normale');
  };

  return {
    nodo, input, conta,
    mostra(messaggi) {
      const testo = messaggi.join(' ');
      errore.textContent = testo;
      errore.hidden = !testo;
      nodo.classList.toggle('is-errato', Boolean(testo));
      input.setAttribute('aria-invalid', testo ? 'true' : 'false');
    }
  };
}

/* =====================================================================
   IL BLOCCO IMMAGINE (CONTRATTO-5 §8.2)

   Uguale per i giorni, gli eventi e il fondale, ed esportato perché è un
   pezzo a sé, riusabile da qualunque editor: un'immagine con il suo punto di
   fuoco, i ritagli che mostrano cosa resta in vista, libreria, caricamento
   dal computer e trascinamento di un file, e un cursore (velo o intensità).
   Non sa niente dei dati: riceve un valore e dice a chi l'ha creato quello
   nuovo, così chi lo usa decide come scriverlo.
   ===================================================================== */

const MODI_IMMAGINE = ['velo', 'intensita', 'nessuno'];

/* I ritagli hanno tutti la stessa altezza: ognuno cresce in proporzione al
   suo rapporto (larghezza / altezza), e con una base di 0 le altezze
   tornano uguali. Il tetto evita che un solo ritaglio verticale diventi
   più alto del pannello. */
const ALTEZZA_RITAGLI = 170;

/** «3 / 5», «16/9», 0.6 -> numero larghezza / altezza; 1 se non si capisce. */
function rapportoNumerico(rapporto) {
  if (typeof rapporto === 'number') return Number.isFinite(rapporto) && rapporto > 0 ? rapporto : 1;
  const pezzi = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*$/.exec(String(rapporto || ''));
  if (!pezzi) return 1;
  const n = Number(pezzi[1]) / (pezzi[2] ? Number(pezzi[2]) : 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Il blocco immagine.
 *
 * @param {object} opzioni
 *   - etichetta: il nome del blocco («Immagine di sfondo»)
 *   - valore: { immagine, fuoco: { x, y }, velo } oppure { …, intensita }
 *   - modo: 'velo' (30–90, velatura dal basso come sotto un testo),
 *           'intensita' (0–100, opacità di un fondale), 'nessuno' (solo immagine e fuoco)
 *   - ritagli: [{ nome: 'Computer', rapporto: '3 / 5' }, …] le miniature di ritaglio
 *   - alCambio(nuovoValore, { dalVivo }): a ogni cambio; `dalVivo` è vero durante un
 *     gesto che continua (trascinamento del fuoco, cursore tenuto premuto) e falso
 *     quando il valore è quello definitivo
 *   - scegliImmagine(valoreCorrente) -> Promise<percorso | null>: la libreria da aprire
 *     (di serie quella di moduli/media.js)
 *   - descrizione: di chi è l'immagine, per i lettori di schermo («di lunedì»)
 *   - vuoto: la frase da mostrare quando l'immagine non c'è
 *   - aiutoLivello: la frase sotto il cursore, se quella di serie non va bene
 * @returns {{ nodo, imposta(valore), valore(), ritagli(elenco), mostraErrori(messaggi), fuoco() }}
 */
export function creaBloccoImmagine({
  etichetta = 'Immagine di sfondo',
  valore = {},
  modo = 'velo',
  ritagli = [],
  alCambio = () => {},
  scegliImmagine = null,
  descrizione = '',
  vuoto: fraseVuoto = 'Trascina qui un file, o scegline uno qui sotto.',
  aiutoLivello = ''
} = {}) {
  const R = regole();
  const tipo = MODI_IMMAGINE.includes(modo) ? modo : 'velo';
  const L = R ? R.LIMITI : { fuocoMin: 0, fuocoMax: 100, veloMin: 30, veloMax: 90, velo: 60, intensitaMin: 0, intensitaMax: 100, intensita: 30 };
  const minimo = tipo === 'intensita' ? L.intensitaMin : L.veloMin;
  const massimo = tipo === 'intensita' ? L.intensitaMax : L.veloMax;
  const ripiegoLivello = tipo === 'intensita' ? L.intensita : L.velo;

  const idAiuto = idUnico('pal-fuoco');
  const idLettura = idUnico('pal-fuoco-lettura');

  const img = el('img', { classe: 'palinsesto-img__img', alt: '', draggable: 'false', decoding: 'async' });
  const mirino = el('span', { classe: 'palinsesto-img__mirino', 'aria-hidden': 'true' });
  const foto = el('div', {
    classe: 'palinsesto-img__foto', tabindex: '0', role: 'group',
    'aria-roledescription': 'punto di fuoco',
    'aria-label': 'Punto di fuoco dell\'immagine' + (descrizione ? ' ' + descrizione : ''),
    'aria-describedby': idAiuto + ' ' + idLettura
  }, [img, tipo === 'velo' ? el('span', { classe: 'palinsesto-img__velo', 'aria-hidden': 'true' }) : null, mirino]);

  const vuoto = el('div', { classe: 'palinsesto-img__vuoto' }, [
    icona('immagine', 'ico palinsesto-img__ico'),
    el('p', { classe: 'palinsesto-img__vuoto-titolo', testo: 'Nessuna immagine' }),
    el('p', { classe: 'palinsesto-img__vuoto-nota', testo: fraseVuoto })
  ]);
  const rotto = el('p', { classe: 'palinsesto-img__rotto', hidden: true });
  const attesa = el('p', { classe: 'palinsesto-img__attesa', hidden: true, role: 'status' });
  const palco = el('div', { classe: 'palinsesto-img__palco' }, [foto, vuoto, rotto, attesa]);

  const aiuto = el('p', {
    classe: 'palinsesto-img__aiuto', id: idAiuto,
    testo: 'Clicca o trascina sull\'immagine per scegliere il punto che resta sempre in vista. Con la tastiera: frecce, Maiusc + frecce per passi di 10, Inizio per il centro.'
  });

  /* --- ritagli ---------------------------------------------------- */
  const cornici = [];
  const telai = [];
  const ritagliNodo = el('div', { classe: 'palinsesto-img__ritagli' });
  for (const voce of Array.isArray(ritagli) ? ritagli : []) {
    const immagine = el('img', { alt: '', draggable: 'false', decoding: 'async' });
    const cornice = el('div', { classe: 'palinsesto-img__cornice' }, [
      immagine,
      tipo === 'velo' ? el('span', { classe: 'palinsesto-img__velo', 'aria-hidden': 'true' }) : null,
      tipo === 'velo' ? el('span', { classe: 'palinsesto-img__righe', 'aria-hidden': 'true' }, [el('span'), el('span')]) : null
    ]);
    const figura = el('figure', { classe: 'palinsesto-img__ritaglio' }, [
      cornice,
      el('figcaption', { classe: 'palinsesto__etichetta', testo: String((voce && voce.nome) || '') })
    ]);
    ritagliNodo.append(figura);
    cornici.push(immagine);
    telai.push({ cornice, figura });
  }

  /* I rapporti si riscrivono sugli stessi nodi quando cambiano (quante
     dirette ci sono, se ci sono eventi): le immagini non si ricaricano. */
  function applicaRapporti(elenco) {
    let somma = 0;
    telai.forEach(({ cornice, figura }, i) => {
      const rapporto = rapportoNumerico(elenco[i] && elenco[i].rapporto);
      somma += rapporto;
      cornice.style.aspectRatio = String(rapporto);
      figura.style.flexGrow = String(rapporto);
    });
    if (somma) ritagliNodo.style.maxWidth = Math.round(ALTEZZA_RITAGLI * somma + 10 * (telai.length - 1)) + 'px';
  }
  applicaRapporti(Array.isArray(ritagli) ? ritagli : []);

  const lettura = el('span', { classe: 'palinsesto-img__lettura', id: idLettura });
  const centra = bottone({ testo: 'Centra', classe: 'btn btn--minimo', su: () => spostaFuoco(50, 50, false) });
  const rigaFuoco = el('div', { classe: 'palinsesto-img__riga' }, [lettura, centra]);

  /* --- azioni ----------------------------------------------------- */
  // Gli stessi formati della libreria (moduli/media.js): l'AVIF si può usare
  // se è già nel sito, ma caricarlo lo rifiutano sia il pannello sia il server,
  // e proporlo qui vorrebbe dire farlo scegliere per poi dire di no.
  const file = el('input', { type: 'file', hidden: true, accept: '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml' });
  const libreria = bottone({ testo: 'Scegli dalla libreria', ico: 'immagine', classe: 'btn', su: () => scegliDallaLibreria() });
  const carica = bottone({ testo: 'Carica dal computer', ico: 'piu', classe: 'btn', su: () => file.click() });
  const togli = bottone({
    testo: 'Togli', ico: 'chiudi', classe: 'btn btn--minimo',
    su: () => {
      stato.immagine = '';
      disegna();
      alCambio(comeValore(), { dalVivo: false });
      libreria.focus();
      annuncia('Immagine tolta.');
    }
  });
  const azioni = el('div', { classe: 'palinsesto-img__azioni' }, [libreria, carica, togli, file]);

  /* --- velo o intensità ------------------------------------------- */
  const idCursore = idUnico('pal-cursore');
  const cursore = tipo === 'nessuno' ? null : el('input', {
    id: idCursore, type: 'range', classe: 'palinsesto-img__cursore-input', min: minimo, max: massimo, step: 1
  });
  const uscita = cursore ? el('output', { classe: 'palinsesto-img__uscita', for: idCursore }) : null;
  const rigaCursore = cursore ? el('div', { classe: 'palinsesto-img__cursore' }, [
    el('div', { classe: 'palinsesto-img__cursore-testa' }, [
      el('label', { classe: 'palinsesto__etichetta', for: idCursore, testo: tipo === 'intensita' ? 'Intensità' : 'Velo' }),
      uscita
    ]),
    cursore,
    el('p', {
      classe: 'palinsesto-campo__aiuto',
      testo: aiutoLivello || (tipo === 'intensita'
        ? 'Quanto si vede l\'immagine. A 0 è spenta.'
        : 'Quanto si scurisce l\'immagine sotto il testo: più velo, testo più leggibile.')
    })
  ]) : null;

  const errore = el('p', { classe: 'campo__errore', hidden: true, role: 'alert' });
  const annuncio = el('p', { classe: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const nomeFile = el('span', { classe: 'palinsesto-img__file' });

  const nodo = el('div', { classe: 'palinsesto-img palinsesto-img--' + tipo }, [
    el('div', { classe: 'palinsesto-img__testa' }, [
      el('span', { classe: 'palinsesto__etichetta', testo: etichetta }),
      nomeFile
    ]),
    palco, aiuto, cornici.length ? ritagliNodo : null, rigaFuoco, azioni, rigaCursore, errore, annuncio
  ]);

  function annuncia(testo) {
    annuncio.textContent = '';
    setTimeout(() => { annuncio.textContent = testo; }, 40);
  }

  /* --- stato ------------------------------------------------------ */
  function numero(grezzo, min, max, ripiego) {
    const n = typeof grezzo === 'number' ? grezzo : (typeof grezzo === 'string' && grezzo.trim() !== '' ? Number(grezzo) : NaN);
    return Number.isFinite(n) ? stringi(Math.round(n), min, max) : ripiego;
  }

  function letto(v) {
    const o = oggetto(v) ? v : {};
    const f = oggetto(o.fuoco) ? o.fuoco : {};
    return {
      immagine: typeof o.immagine === 'string' ? o.immagine.trim() : '',
      fuoco: { x: numero(f.x, L.fuocoMin, L.fuocoMax, 50), y: numero(f.y, L.fuocoMin, L.fuocoMax, 50) },
      livello: tipo === 'nessuno' ? null : numero(tipo === 'intensita' ? o.intensita : o.velo, minimo, massimo, ripiegoLivello)
    };
  }

  function comeValore() {
    const fuori = { immagine: stato.immagine, fuoco: { x: stato.fuoco.x, y: stato.fuoco.y } };
    if (tipo === 'velo') fuori.velo = stato.livello;
    if (tipo === 'intensita') fuori.intensita = stato.livello;
    return fuori;
  }

  let stato = letto(valore);
  let percorsoMostrato = null;
  let trascinando = false;

  function mostraFuoco() {
    const posizione = stato.fuoco.x + '% ' + stato.fuoco.y + '%';
    mirino.style.left = stato.fuoco.x + '%';
    mirino.style.top = stato.fuoco.y + '%';
    for (const cornice of cornici) cornice.style.objectPosition = posizione;
    lettura.textContent = 'Fuoco ' + stato.fuoco.x + ' · ' + stato.fuoco.y;
  }

  function mostraLivello() {
    if (!cursore) return;
    cursore.value = String(stato.livello);
    uscita.textContent = tipo === 'intensita' && stato.livello === 0 ? 'Spenta' : stato.livello + '%';
    nodo.style.setProperty(tipo === 'intensita' ? '--intensita' : '--velo', String(stato.livello / 100));
  }

  function disegna() {
    const percorso = stato.immagine;
    const pieno = Boolean(percorso);
    nodo.dataset.vuoto = pieno ? '0' : '1';
    foto.hidden = !pieno;
    vuoto.hidden = pieno;
    ritagliNodo.hidden = !pieno;
    rigaFuoco.hidden = !pieno;
    aiuto.hidden = !pieno;
    togli.hidden = !pieno;
    nomeFile.textContent = pieno ? percorso.split('/').pop() : '';
    nomeFile.title = percorso;
    if (percorso !== percorsoMostrato) {
      percorsoMostrato = percorso;
      rotto.hidden = true;
      const src = pieno ? urlRisorsa(percorso) : '';
      for (const immagine of [img, ...cornici]) {
        if (src) immagine.src = src; else immagine.removeAttribute('src');
      }
    }
    mostraFuoco();
    mostraLivello();
  }

  img.addEventListener('error', () => {
    if (!percorsoMostrato) return;
    rotto.textContent = 'Non trovo il file «' + percorsoMostrato + '»: sceglilo di nuovo o toglilo.';
    rotto.hidden = false;
    foto.hidden = true;
    ritagliNodo.hidden = true;
    rigaFuoco.hidden = true;
    aiuto.hidden = true;
  });

  /* --- fuoco: clic, trascinamento, frecce -------------------------- */
  function spostaFuoco(x, y, continuo) {
    stato.fuoco = { x: stringi(Math.round(x), L.fuocoMin, L.fuocoMax), y: stringi(Math.round(y), L.fuocoMin, L.fuocoMax) };
    mostraFuoco();
    alCambio(comeValore(), { dalVivo: continuo });
  }

  function daPuntatore(evento, continuo) {
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return;
    spostaFuoco((evento.clientX - r.left) / r.width * 100, (evento.clientY - r.top) / r.height * 100, continuo);
  }

  foto.addEventListener('pointerdown', (evento) => {
    if (evento.button !== undefined && evento.button !== 0) return;
    evento.preventDefault();
    trascinando = true;
    nodo.dataset.trascina = '1';
    try { foto.setPointerCapture(evento.pointerId); } catch { /* senza cattura vale finché il puntatore resta sopra */ }
    foto.focus({ preventScroll: true });
    daPuntatore(evento, true);
  });
  foto.addEventListener('pointermove', (evento) => {
    if (trascinando) daPuntatore(evento, true);
  });
  const lascia = (evento) => {
    if (!trascinando) return;
    trascinando = false;
    delete nodo.dataset.trascina;
    try { foto.releasePointerCapture(evento.pointerId); } catch { /* già rilasciato */ }
    alCambio(comeValore(), { dalVivo: false });
    annuncia('Fuoco a ' + stato.fuoco.x + '% da sinistra e ' + stato.fuoco.y + '% dall\'alto.');
  };
  foto.addEventListener('pointerup', lascia);
  foto.addEventListener('pointercancel', lascia);

  foto.addEventListener('keydown', (evento) => {
    const passo = evento.shiftKey ? 10 : 1;
    let { x, y } = stato.fuoco;
    if (evento.key === 'ArrowLeft') x -= passo;
    else if (evento.key === 'ArrowRight') x += passo;
    else if (evento.key === 'ArrowUp') y -= passo;
    else if (evento.key === 'ArrowDown') y += passo;
    else if (evento.key === 'Home') { x = 50; y = 50; } else return;
    evento.preventDefault();
    spostaFuoco(x, y, false);
    annuncia('Fuoco ' + stato.fuoco.x + ', ' + stato.fuoco.y + '.');
  });

  if (cursore) {
    cursore.addEventListener('input', () => {
      stato.livello = stringi(Math.round(Number(cursore.value)), minimo, massimo);
      mostraLivello();
      alCambio(comeValore(), { dalVivo: true });
    });
    cursore.addEventListener('change', () => alCambio(comeValore(), { dalVivo: false }));
  }

  /* --- scegliere e caricare --------------------------------------- */
  function applicaImmagine(scelto) {
    const percorso = String(scelto || '').trim().replace(/^\/+/, '');
    if (!percorso) return;
    const valido = R ? R.percorsoValido(percorso) : /^(img|contenuti\/media)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.(png|jpe?g|webp|avif|svg)$/.test(percorso) && !percorso.includes('..');
    if (!valido) {
      avviso('«' + percorso + '» non si può usare qui: servono file del sito dentro img/ o contenuti/media/, in PNG, JPG, WEBP, AVIF o SVG, con un nome senza spazi.',
        { tipo: 'errore', titolo: 'Immagine non adatta' });
      return;
    }
    if (percorso === stato.immagine) return;
    // Un'immagine nuova ha il suo soggetto altrove: il fuoco dell'altra
    // non vuol dire niente, si riparte dal centro.
    stato.immagine = percorso;
    stato.fuoco = { x: 50, y: 50 };
    disegna();
    alCambio(comeValore(), { dalVivo: false });
    annuncia('Immagine scelta: ' + percorso.split('/').pop() + '.');
  }

  function apriLibreria() {
    return typeof scegliImmagine === 'function'
      ? scegliImmagine(stato.immagine)
      : media.scegliImmagine({ valoreCorrente: stato.immagine });
  }

  async function scegliDallaLibreria() {
    const scelto = await apriLibreria();
    if (scelto) applicaImmagine(scelto);
    libreria.focus();
  }

  async function caricaFile(scelto) {
    if (!scelto) return;
    attesa.textContent = 'Preparo e carico ' + scelto.name + '…';
    attesa.hidden = false;
    nodo.setAttribute('aria-busy', 'true');
    for (const b of [libreria, carica, togli]) b.disabled = true;
    try {
      // caricaImmagine prepara (WebP leggero), carica e dice da sola com'è
      // andata; senza di lei resta la libreria, che carica anche lei.
      const percorso = typeof media.caricaImmagine === 'function' ? await media.caricaImmagine(scelto) : await apriLibreria();
      if (percorso) applicaImmagine(percorso);
    } catch (guasto) {
      avviso(guasto && guasto.message ? guasto.message : 'Caricamento non riuscito.', { tipo: 'errore', titolo: 'Immagine non caricata' });
    } finally {
      attesa.hidden = true;
      nodo.removeAttribute('aria-busy');
      for (const b of [libreria, carica, togli]) b.disabled = false;
    }
  }

  file.addEventListener('change', () => {
    const scelto = file.files && file.files[0];
    file.value = '';
    caricaFile(scelto);
  });

  // Senza preventDefault su dragover il browser apre il file al posto nostro.
  const conFile = (evento) => Boolean(evento.dataTransfer && Array.from(evento.dataTransfer.types || []).includes('Files'));
  for (const nomeEvento of ['dragenter', 'dragover']) {
    palco.addEventListener(nomeEvento, (evento) => {
      if (!conFile(evento)) return;
      evento.preventDefault();
      palco.dataset.sopra = '1';
    });
  }
  palco.addEventListener('dragleave', (evento) => {
    if (palco.contains(evento.relatedTarget)) return;
    delete palco.dataset.sopra;
  });
  palco.addEventListener('drop', (evento) => {
    if (!conFile(evento)) return;
    evento.preventDefault();
    delete palco.dataset.sopra;
    caricaFile(evento.dataTransfer.files[0]);
  });

  disegna();

  return {
    nodo,
    /** Rimette a video un valore arrivato da fuori (Annulla, un altro campo). */
    imposta(nuovo) {
      const letti = letto(nuovo);
      stato.immagine = letti.immagine;
      // Chi sta trascinando o tiene il cursore non si vede tornare indietro
      // il punto sotto il dito per un valore scritto un fotogramma prima.
      if (!trascinando) stato.fuoco = letti.fuoco;
      if (!cursore || document.activeElement !== cursore) stato.livello = letti.livello;
      disegna();
    },
    valore: () => comeValore(),
    /** Nuovi rapporti per i ritagli, stesso ordine e stessi nomi di quelli di partenza. */
    ritagli(elenco) {
      applicaRapporti(Array.isArray(elenco) ? elenco : []);
    },
    mostraErrori(messaggi) {
      const elenco = [].concat(messaggi || []).filter(Boolean);
      errore.textContent = elenco.join(' ');
      errore.hidden = !elenco.length;
      nodo.classList.toggle('is-errato', Boolean(elenco.length));
    },
    fuoco() {
      (foto.hidden ? libreria : foto).focus();
    }
  };
}

/* =====================================================================
   L'EDITOR
   ===================================================================== */

/**
 * @param {object} campo    { chiave: 'config.orari', etichetta, aiuto, tipo: 'orari' }
 * @param {object} accesso  { leggi(), scrivi(valore) }
 * @param {object} ctx      il contesto dei campi di pannello.js
 * @returns {object} { chiave, campo, nodo, valida, mostraErrore, pulisci, fuoco,
 *                     apriVista(id), apriGiorno(n), apriEvento(i) }
 */
export function creaCampoOrari(campo, accesso, ctx = {}) {
  const R = regole();
  const parti = guscio(campo, { ...(ctx.opzioni || {}), perInput: false });
  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };

  if (!R) {
    parti.nodo.append(el('p', {
      classe: 'vuoto',
      testo: 'Le regole della schedule (pannello/condivisi/orari.js) non si sono caricate, quindi l\'editor non può partire. Ricarica la pagina; il resto del pannello funziona.'
    }));
    Object.assign(controllo, {
      valida: () => true, mostraErrore() {}, pulisci() {}, fuoco() {},
      apriVista() {}, apriGiorno() {}, apriEvento() {}
    });
    return controllo;
  }

  chiediMotore();

  const L = R.LIMITI;
  const radice = el('div', { classe: 'orari palinsesto', role: 'group', 'aria-labelledby': parti.idEtichetta });
  const erroreGenerale = el('p', { classe: 'campo__errore palinsesto__errore', hidden: true, role: 'alert' });
  parti.nodo.classList.add('palinsesto-campo-radice');
  parti.nodo.append(radice, erroreGenerale);

  const ed = {
    vista: ricordo.vista,
    giorno: ricordo.giorno,
    evento: ricordo.evento,
    campi: new Map(),          // percorso -> { mostra(messaggi), fuoco(), input } oppure { alias: percorso }
    toccati: new Set(),        // percorsi toccati: i loro errori si mostrano
    tutti: false,              // dopo valida() o un rifiuto del server: tutti gli errori
    mostrati: [],              // [{ percorso, messaggio }] mostrati adesso
    aVideo: new Set(),         // percorsi con l'errore a video: chi scrive ne vede solo sparire
    server: null,              // { messaggi: Set, firma } dall'ultimo rifiuto del server
    ui: null
  };

  /* --- lettura e scrittura ------------------------------------------ */

  const grezzo = () => {
    const valore = accesso.leggi();
    return oggetto(valore) ? valore : {};
  };
  const pulito = () => R.normalizza(grezzo());

  /** Il valore scritto, e se manca quello pulito: le caselle mostrano quello che c'è. */
  function valoreDi(percorso) {
    const scritto = leggiIn(grezzo(), percorso);
    return scritto === undefined ? leggiIn(pulito(), percorso) : scritto;
  }

  /* Prima di scrivere dentro schede, eventi o sfondo ci si assicura che
     esistano: un contenuti.json di prima della schedule nuova non li ha. I
     valori che ci sono, giusti o sbagliati, non si toccano. */
  function struttura(valore) {
    const orari = oggetto(valore) ? valore : {};
    if (!Array.isArray(orari.schede)) orari.schede = [];
    for (let n = 0; n < 7; n += 1) {
      if (!oggetto(orari.schede[n])) orari.schede[n] = R.schedaVuota();
    }
    if (!Array.isArray(orari.eventi)) orari.eventi = [];
    if (!Array.isArray(orari.pause)) orari.pause = [];
    if (!oggetto(orari.sfondo)) orari.sfondo = R.sfondoVuoto();
    return orari;
  }

  /** Scrive una o più modifiche [[percorso, valore], …] in un colpo solo. */
  function scrivi(modifiche, { tocca = true } = {}) {
    const nuovo = struttura(clona(grezzo()));
    for (const [percorso, valore] of modifiche) {
      const pezzi = percorso.split('.');
      // Un evento rotto (non un oggetto) si rimette in piedi prima di scriverci.
      if (pezzi[0] === 'eventi' && pezzi.length > 2 && !oggetto(nuovo.eventi[Number(pezzi[1])])) {
        nuovo.eventi[Number(pezzi[1])] = R.eventoVuoto();
      }
      if (pezzi[0] === 'pause' && pezzi.length > 2 && !oggetto(nuovo.pause[Number(pezzi[1])])) {
        nuovo.pause[Number(pezzi[1])] = R.pausaVuota();
      }
      scriviIn(nuovo, percorso, valore);
      if (tocca) ed.toccati.add(percorso);
    }
    accesso.scrivi(nuovo);
    if (typeof ctx.modificato === 'function') ctx.modificato();
    programmaAggiornamento();
  }

  /* Durante un trascinamento si scrive al massimo una volta per fotogramma. */
  let inSospeso = null;
  let fotogramma = 0;
  function scriviPresto(modifiche) {
    inSospeso = new Map([...(inSospeso || new Map()), ...modifiche]);
    if (fotogramma) return;
    fotogramma = requestAnimationFrame(svuotaSospeso);
  }
  function svuotaSospeso() {
    if (fotogramma) cancelAnimationFrame(fotogramma);
    fotogramma = 0;
    if (!inSospeso) return;
    const modifiche = Array.from(inSospeso);
    inSospeso = null;
    scrivi(modifiche);
  }

  /* --- aggiornamento dei riassunti ----------------------------------- */

  let aggiornamento = 0;
  function programmaAggiornamento() {
    if (aggiornamento) return;
    aggiornamento = requestAnimationFrame(() => {
      aggiornamento = 0;
      aggiornaTutto();
    });
  }

  function aggiornaTutto() {
    if (!ed.ui) return;
    ed.ui.riepilogo.aggiorna();
    aggiornaSchede();
    for (const n of R.ORDINE) aggiornaRigaGiorno(n);
    aggiornaSerie();
    aggiornaRigheEventi();
    aggiornaRighePause();
    aggiornaFondale();
    calcolaErrori();
  }

  /* --- errori --------------------------------------------------------- */

  function toccato(percorso) {
    if (ed.tutti) return true;
    for (const t of ed.toccati) {
      if (t === percorso || t.startsWith(percorso + '.') || percorso.startsWith(t + '.')) return true;
    }
    return false;
  }

  /* La casella che mostra l'errore di un percorso: quella esatta, o la più
     vicina salendo (schede.1.fuoco sta nel blocco immagine di lunedì). Si
     sale al massimo fino al giorno o all'evento: l'errore di un evento
     chiuso non deve finire sulla riga generale degli eventi. */
  function casellaPer(percorso) {
    const minimo = /^(schede|eventi)\.\d+/.test(percorso) ? 2 : 1;
    let pezzi = percorso.split('.');
    while (pezzi.length >= minimo) {
      const voce = ed.campi.get(pezzi.join('.'));
      if (voce) return voce.alias || pezzi.join('.');
      pezzi = pezzi.slice(0, -1);
    }
    return '';
  }

  /** Il percorso della casella in cui si sta scrivendo, o ''. */
  function percorsoAttivo() {
    const attivo = document.activeElement;
    if (!attivo) return '';
    for (const [percorso, voce] of ed.campi) {
      if (voce.input && voce.input === attivo) return percorso;
    }
    return '';
  }

  function calcolaErrori() {
    const grezzi = grezzo();
    const tutti = R.problemi(grezzi);
    // Mentre si scrive in una casella il suo errore può solo sparire: un
    // «va scritta come 21:00» che compare a metà di «21:3» non aiuta.
    const attivo = percorsoAttivo();
    ed.mostrati = tutti.filter((p) => toccato(p.percorso) && !(p.percorso === attivo && !ed.aVideo.has(p.percorso)));

    const perCasella = new Map();
    const senzaCasella = [];
    for (const problema of ed.mostrati) {
      const dove = casellaPer(problema.percorso);
      // Un errore di un giorno o di un evento chiuso non ha casella a video:
      // lo segna la sua riga, e compare accanto alla casella quando si apre.
      if (dove) {
        if (!perCasella.has(dove)) perCasella.set(dove, []);
        perCasella.get(dove).push(problema.messaggio);
      } else if (!/^(schede|eventi)\.\d+\./.test(problema.percorso)) {
        senzaCasella.push(problema.messaggio);
      }
    }
    ed.aVideo = new Set(ed.mostrati.map((p) => p.percorso));
    for (const [percorso, voce] of ed.campi) {
      if (!voce.alias) voce.mostra(perCasella.get(percorso) || []);
    }

    // Un messaggio del server che nessuna regola di qui riconosce resta a
    // video finché la schedule è quella rifiutata: cambiata, il server va
    // interrogato di nuovo, e il vecchio messaggio non dice più il vero.
    if (ed.server && ed.server.firma === JSON.stringify(grezzi)) {
      for (const messaggio of ed.server.messaggi) {
        if (!tutti.some((p) => p.messaggio === messaggio)) senzaCasella.push(messaggio);
      }
    }
    erroreGenerale.textContent = senzaCasella.join(' ');
    erroreGenerale.hidden = !senzaCasella.length;

    if (!ed.ui) return;
    for (const n of R.ORDINE) {
      const riga = ed.ui.giorni.get(n);
      if (riga) segnaErroriRiga(riga, 'schede.' + n);
    }
    for (const [i, riga] of ed.ui.eventi) segnaErroriRiga(riga, 'eventi.' + i);
    for (const vista of VISTE) {
      const quanti = ed.mostrati.filter((p) => vistaDelPercorso(p.percorso) === vista.id).length;
      ed.ui.linguette.get(vista.id).dataset.errori = quanti ? '1' : '0';
    }
  }

  function segnaErroriRiga(riga, base) {
    const quanti = ed.mostrati.filter((p) => p.percorso === base || p.percorso.startsWith(base + '.')).length;
    riga.nodo.dataset.errori = quanti ? '1' : '0';
    riga.errori.textContent = quanti ? (quanti === 1 ? '1 errore' : quanti + ' errori') : '';
    riga.errori.hidden = !quanti;
  }

  function vistaDelPercorso(percorso) {
    if (percorso === 'eventi' || percorso.startsWith('eventi.')) return 'eventi';
    if (percorso === 'sfondo' || percorso.startsWith('sfondo.')) return 'fondale';
    return 'settimana';
  }

  /** Apre il posto del primo errore mostrato; con `fuoco` ci porta anche la tastiera. */
  function vaiAlPrimoErrore({ fuoco = false } = {}) {
    const primo = ed.mostrati[0];
    if (!primo) return false;
    const pezzi = primo.percorso.split('.');
    if (pezzi[0] === 'schede' && pezzi.length > 1) apriGiorno(Number(pezzi[1]), { forza: true });
    else if (pezzi[0] === 'eventi' && pezzi.length > 1) apriEvento(Number(pezzi[1]));
    else impostaVista(vistaDelPercorso(primo.percorso));
    calcolaErrori();
    if (!fuoco) return true;
    const dove = casellaPer(primo.percorso);
    const voce = dove ? ed.campi.get(dove) : null;
    if (voce && voce.fuoco) voce.fuoco();
    return true;
  }

  /* --- viste ---------------------------------------------------------- */

  function impostaVista(id, { fuoco = false } = {}) {
    if (!VISTE.some((v) => v.id === id)) return;
    ed.vista = id;
    ricordo.vista = id;
    if (!ed.ui) return;
    for (const vista of VISTE) {
      const scelta = vista.id === id;
      const linguetta = ed.ui.linguette.get(vista.id);
      linguetta.setAttribute('aria-selected', String(scelta));
      linguetta.tabIndex = scelta ? 0 : -1;
      ed.ui.pannelli.get(vista.id).hidden = !scelta;
    }
    if (fuoco) ed.ui.linguette.get(id).focus();
    aggiornaEvidenza();
  }

  function aggiornaSchede() {
    const orari = pulito();
    const conta = ed.ui.contaLinguette;
    conta.settimana.textContent = orari.giorni.length + '/7';
    conta.eventi.textContent = String(orari.eventi.length);
    const acceso = Boolean(orari.sfondo.immagine) && orari.sfondo.intensita > 0;
    conta.fondale.textContent = acceso ? 'Acceso' : 'Spento';
    conta.fondale.dataset.acceso = acceso ? '1' : '0';
    conta.settimana.dataset.acceso = orari.giorni.length ? '1' : '0';
    conta.eventi.dataset.acceso = R.eventiFuturi(grezzo(), Date.now()).length ? '1' : '0';
  }

  /* --- scorrimento del pannello --------------------------------------- */

  function scorriNelPannello(nodo, { inCima = false } = {}) {
    const scorri = nodo.closest('[data-scorri]') || contenitoreCheScorre(nodo);
    if (!scorri) return;
    const r = nodo.getBoundingClientRect();
    const s = scorri.getBoundingClientRect();
    if (!inCima && r.top >= s.top && r.bottom <= s.bottom) return;
    const alto = scorri.scrollTop + (r.top - s.top) - 12;
    scorri.scrollTo({ top: Math.max(0, Math.round(alto)), behavior: menoMovimento() ? 'auto' : 'smooth' });
  }

  function contenitoreCheScorre(nodo) {
    for (let cur = nodo.parentElement; cur; cur = cur.parentElement) {
      const stile = getComputedStyle(cur);
      if (/(auto|scroll)/.test(stile.overflowY) && cur.scrollHeight > cur.clientHeight) return cur;
    }
    return null;
  }

  /* Un segno breve sulla riga raggiunta da un clic nell'anteprima: dopo un
     salto dice dove si è arrivati, anche a chi non guarda il fuoco. */
  function segnala(nodo) {
    nodo.classList.remove('is-trovato');
    void nodo.offsetWidth;
    nodo.classList.add('is-trovato');
    setTimeout(() => nodo.classList.remove('is-trovato'), 1600);
  }

  /* =================================================================
     VISTA SETTIMANA
     ================================================================= */

  function costruisciSettimana() {
    const orari = pulito();
    const pannello = el('div', { classe: 'palinsesto__vista palinsesto__vista--settimana' });

    /* Di serie: valgono per ogni giorno che non ha un'ora o una durata sua. */
    const ora = casella({ etichetta: 'Ora di serie', segnaposto: '21:00', aiuto: 'Scritta come 21:00.', attributi: { inputmode: 'numeric', maxlength: 5, spellcheck: 'false' } });
    ora.input.value = String(valoreDi('ora') ?? '');
    ora.input.addEventListener('input', () => scrivi([['ora', ora.input.value.trim()]]));
    ora.input.addEventListener('blur', () => {
      const messo = oraDaTesto(ora.input.value);
      if (messo !== ora.input.value) { ora.input.value = messo; scrivi([['ora', messo]]); }
    });
    registraCasella('ora', ora);

    const durata = casella({
      etichetta: 'Durata di serie', tipo: 'number', segnaposto: '4', aiuto: 'In ore, a passi di mezz\'ora.',
      attributi: { min: L.durataMin, max: L.durataMax, step: L.passoDurata, inputmode: 'decimal' }
    });
    durata.input.value = valoreDi('durataOre') === null || valoreDi('durataOre') === undefined ? '' : String(valoreDi('durataOre'));
    durata.input.addEventListener('input', () => scrivi([['durataOre', durataDaTesto(durata.input.value)]]));
    registraCasella('durataOre', durata);

    const idFusi = idUnico('pal-fusi');
    const fuso = casella({ etichetta: 'Fuso orario', segnaposto: 'Europe/Rome', attributi: { list: idFusi, spellcheck: 'false' } });
    fuso.input.value = String(valoreDi('fuso') ?? '');
    fuso.input.addEventListener('input', () => scrivi([['fuso', fuso.input.value.trim()]]));
    registraCasella('fuso', fuso);
    const elencoFusi = el('datalist', { id: idFusi });
    let fusi = ['Europe/Rome', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles'];
    // supportedValuesOf manca nei browser vecchi: restano i fusi comuni,
    // che coprono il caso vero (il canale è in Italia).
    if (typeof Intl.supportedValuesOf === 'function') {
      try { fusi = Intl.supportedValuesOf('timeZone'); } catch { /* restano quelli comuni */ }
    }
    for (const nome of fusi) elencoFusi.append(el('option', { value: nome }));

    const serie = el('section', { classe: 'palinsesto__serie', 'aria-label': 'Orario di serie' }, [
      el('div', { classe: 'palinsesto__griglia palinsesto__griglia--serie' }, [ora.nodo, durata.nodo, fuso.nodo]),
      elencoFusi,
      el('p', { classe: 'palinsesto__nota', testo: 'Valgono per ogni giorno acceso che non ha un\'ora o una durata sua. Il conto alla rovescia della copertina segue il fuso del canale.' })
    ]);
    ed.ui.serie = { ora, durata, fuso };

    const erroreGiorni = el('p', { classe: 'campo__errore', hidden: true, role: 'alert' });
    ed.campi.set('giorni', {
      mostra(messaggi) {
        erroreGiorni.textContent = messaggi.join(' ');
        erroreGiorni.hidden = !messaggi.length;
      },
      fuoco: () => {
        const prima = ed.ui.giorni.get(R.ORDINE[0]);
        if (prima) prima.leva.focus();
      }
    });

    const elenco = el('ol', { classe: 'palinsesto__giorni', 'aria-label': 'I sette giorni, da lunedì a domenica' });
    for (const n of R.ORDINE) elenco.append(costruisciRigaGiorno(n, orari));

    pannello.append(
      serie,
      el('div', { classe: 'palinsesto__intesta' }, [
        el('h4', { classe: 'palinsesto__titoletto', testo: 'I sette giorni' }),
        el('p', { classe: 'palinsesto__nota', testo: 'Accendi i giorni di diretta, poi apri un giorno per dargli titolo, gioco, nota e immagine. Un giorno spento tiene la sua scheda: riaccendendolo torna com\'era.' })
      ]),
      erroreGiorni,
      elenco
    );
    return pannello;
  }

  function costruisciRigaGiorno(n) {
    const G = R.GIORNI[n];
    const idCorpo = idUnico('pal-giorno');
    const leva = el('button', {
      type: 'button', classe: 'interruttore palinsesto-giorno__leva', role: 'switch',
      'aria-checked': 'false', 'aria-label': 'Diretta di ' + G.minuscolo
    }, [el('span', { classe: 'interruttore__pista', 'aria-hidden': 'true' }, [el('span', { classe: 'interruttore__pallina' })])]);

    const riassunto = el('span', { classe: 'palinsesto-giorno__riassunto' });
    const segni = el('span', { classe: 'palinsesto-giorno__segni' });
    const errori = el('span', { classe: 'palinsesto__errori', hidden: true });
    const mini = el('span', { classe: 'palinsesto__mini', 'aria-hidden': 'true' });

    const apri = el('button', {
      type: 'button', classe: 'palinsesto-giorno__apri',
      'aria-expanded': 'false', 'aria-controls': idCorpo
    }, [
      el('span', { classe: 'palinsesto-giorno__abbr', 'aria-hidden': 'true', testo: G.abbr }),
      el('span', { classe: 'palinsesto-giorno__testo' }, [
        el('span', { classe: 'palinsesto-giorno__nome', testo: G.nome }),
        riassunto
      ]),
      segni,
      errori,
      mini,
      icona('freccia', 'ico palinsesto__freccia')
    ]);

    const corpo = el('div', { classe: 'palinsesto-giorno__corpo', id: idCorpo, hidden: true, role: 'region', 'aria-label': 'Scheda di ' + G.minuscolo });
    const nodo = el('li', { classe: 'palinsesto-giorno', dati: { giorno: String(n) } }, [
      el('div', { classe: 'palinsesto-giorno__testa' }, [leva, apri]),
      corpo
    ]);

    const riga = { nodo, leva, apri, corpo, riassunto, segni, errori, mini, costruito: false, caselle: null };
    ed.ui.giorni.set(n, riga);

    leva.addEventListener('click', () => {
      const giorni = Array.isArray(grezzo().giorni) ? grezzo().giorni.slice() : pulito().giorni.slice();
      const posto = giorni.indexOf(n);
      // Chi c'era resta dov'era: un giorno tolto e rimesso non riordina
      // l'elenco, e la pubblicazione resta identica a sé.
      if (posto >= 0) giorni.splice(posto, 1); else giorni.push(n);
      scrivi([['giorni', giorni]]);
      const acceso = posto < 0;
      aggiornaRigaGiorno(n, acceso);
      if (acceso) apriGiorno(n, { scorriAnteprima: true });
      else if (ed.giorno === n) chiudiGiorno(n);
      annuncia(G.nome + (acceso ? ': diretta accesa.' : ': giorno di riposo. La scheda resta salvata.'));
    });

    apri.addEventListener('click', () => {
      if (ed.giorno === n && !corpo.hidden) chiudiGiorno(n);
      else apriGiorno(n, { scorriAnteprima: true });
    });

    aggiornaRigaGiorno(n);
    return nodo;
  }

  function aggiornaRigaGiorno(n, accesoForzato) {
    const riga = ed.ui && ed.ui.giorni.get(n);
    if (!riga) return;
    const grezzi = grezzo();
    const orari = R.normalizza(grezzi);
    const acceso = accesoForzato === undefined ? orari.giorni.includes(n) : accesoForzato;
    const scheda = orari.schede[n];
    const aperto = ed.giorno === n && !riga.corpo.hidden;

    riga.leva.setAttribute('aria-checked', String(acceso));
    riga.nodo.dataset.acceso = acceso ? '1' : '0';
    riga.nodo.dataset.aperto = aperto ? '1' : '0';
    riga.apri.setAttribute('aria-expanded', String(aperto));
    riga.apri.disabled = !acceso;
    riga.apri.title = acceso ? '' : 'Giorno di riposo: accendilo per aprire la sua scheda';

    const inizio = R.oraDi(grezzi, n);
    const fine = R.fine(inizio, R.durataDi(grezzi, n));
    const cosa = scheda.titolo || scheda.gioco;
    const conScheda = Boolean(scheda.titolo || scheda.gioco || scheda.nota || scheda.immagine);
    const orarioSbagliato = orarioDaCorreggere('schede.' + n, grezzi);
    riga.riassunto.textContent = acceso
      ? (orarioSbagliato ? 'Orario da correggere' : inizio + '–' + fine) + (cosa ? ' · ' + cosa : '')
      : 'Riposo' + (conScheda ? ' · scheda tenuta da parte' : '');

    svuota(riga.segni);
    if (acceso && (scheda.ora || scheda.durataOre !== null)) {
      riga.segni.append(el('span', { classe: 'palinsesto__segno', title: 'Ora o durata diverse da quelle di serie', testo: 'Orario suo' }));
    }

    // Sul sito un giorno di riposo non stampa la sua immagine: nemmeno qui.
    miniatura(riga.mini, { immagine: acceso ? scheda.immagine : '', fuoco: scheda.fuoco });
    if (riga.costruito) aggiornaCorpoGiorno(n);
  }

  /* Con una data, un'ora o una durata sbagliate le regole ripiegano su un
     valore stretto al bordo: dire «finisce alle…» con quello sarebbe una
     bugia, e i riassunti lo dicono invece di fare il conto. */
  function orarioDaCorreggere(base, grezzi) {
    return R.problemi(grezzi).some((p) => p.percorso === base + '.data' || p.percorso === base + '.ora' || p.percorso === base + '.durataOre');
  }



  function apriGiorno(n, { dallAnteprima = false, scorriAnteprima = false, forza = false } = {}) {
    const riga = ed.ui && ed.ui.giorni.get(n);
    if (!riga) return;
    impostaVista('settimana');
    const acceso = pulito().giorni.includes(n);

    if (!acceso && !forza) {
      // Un giorno di riposo non ha una scheda da aprire: si porta lì chi
      // l'ha cliccato, con il fuoco sull'interruttore che lo accende.
      if (ed.giorno !== null && ed.giorno !== n) chiudiGiorno(ed.giorno);
      scorriNelPannello(riga.nodo, { inCima: dallAnteprima });
      segnala(riga.nodo);
      riga.leva.focus({ preventScroll: true });
      annuncia(R.GIORNI[n].nome + ' è un giorno di riposo: accendilo per scrivere la sua scheda.');
      return;
    }

    if (ed.giorno !== null && ed.giorno !== n) chiudiGiorno(ed.giorno, { tieniRicordo: true });
    if (!riga.costruito) costruisciCorpoGiorno(n);
    riga.corpo.hidden = false;
    ed.giorno = n;
    ricordo.giorno = n;
    aggiornaRigaGiorno(n);
    calcolaErrori();
    aggiornaEvidenza();

    if (dallAnteprima) {
      scorriNelPannello(riga.nodo, { inCima: true });
      segnala(riga.nodo);
    } else {
      scorriNelPannello(riga.apri);
    }
    if (scorriAnteprima) scorriAnteprimaA('schede.' + n);
  }

  function chiudiGiorno(n, { tieniRicordo = false } = {}) {
    const riga = ed.ui && ed.ui.giorni.get(n);
    if (!riga) return;
    riga.corpo.hidden = true;
    if (ed.giorno === n) {
      ed.giorno = null;
      if (!tieniRicordo) ricordo.giorno = null;
    }
    aggiornaRigaGiorno(n);
    aggiornaEvidenza();
  }

  function costruisciCorpoGiorno(n) {
    const riga = ed.ui.giorni.get(n);
    const base = 'schede.' + n;
    const G = R.GIORNI[n];

    const ora = casella({
      etichetta: 'Ora di inizio', attributi: { inputmode: 'numeric', maxlength: 5, spellcheck: 'false' },
      aiuto: 'Vuota: vale l\'ora di serie.'
    });
    ora.input.value = String(valoreDi(base + '.ora') ?? '');
    ora.input.addEventListener('input', () => { scrivi([[base + '.ora', ora.input.value.trim()]]); aggiornaFineGiorno(n); });
    ora.input.addEventListener('blur', () => {
      const messo = oraDaTesto(ora.input.value);
      if (messo !== ora.input.value) { ora.input.value = messo; scrivi([[base + '.ora', messo]]); }
    });

    const durata = casella({
      etichetta: 'Durata (ore)', tipo: 'number',
      attributi: { min: L.durataMin, max: L.durataMax, step: L.passoDurata, inputmode: 'decimal' },
      aiuto: 'Vuota: vale la durata di serie.'
    });
    const durataScritta = valoreDi(base + '.durataOre');
    durata.input.value = durataScritta === null || durataScritta === undefined ? '' : String(durataScritta);
    durata.input.addEventListener('input', () => scrivi([[base + '.durataOre', durataDaTesto(durata.input.value)]]));

    const fine = el('p', { classe: 'palinsesto__fine', 'aria-live': 'polite' });

    const titolo = casellaTesto(base + '.titolo', 'Titolo', L.titolo);
    const gioco = casellaTesto(base + '.gioco', 'Gioco', L.gioco);
    const nota = casellaTesto(base + '.nota', 'Nota', L.nota, 'Una riga in più sulla locandina, sotto titolo e gioco.');

    const immagine = bloccoImmagine({ base, uso: 'giorno', nome: G.minuscolo });

    riga.caselle = { ora, durata, fine };
    registraCasella(base + '.ora', ora);
    registraCasella(base + '.durataOre', durata);

    riga.corpo.append(
      el('div', { classe: 'palinsesto__due' }, [
        el('div', { classe: 'palinsesto__colonna' }, [
          el('div', { classe: 'palinsesto__griglia' }, [ora.nodo, durata.nodo]),
          fine,
          titolo.nodo, gioco.nodo, nota.nodo
        ]),
        el('div', { classe: 'palinsesto__colonna' }, [immagine.nodo])
      ])
    );
    riga.costruito = true;
    riga.immagine = immagine;
    aggiornaCorpoGiorno(n);
  }

  function aggiornaCorpoGiorno(n) {
    const riga = ed.ui.giorni.get(n);
    if (!riga || !riga.caselle) return;
    const orari = pulito();
    riga.caselle.ora.input.placeholder = orari.ora + ' (di serie)';
    riga.caselle.durata.input.placeholder = String(orari.durataOre).replace('.', ',') + ' (di serie)';
    aggiornaFineGiorno(n);
    if (riga.immagine) riga.immagine.aggiorna();
  }

  function aggiornaFineGiorno(n) {
    const riga = ed.ui.giorni.get(n);
    if (!riga || !riga.caselle) return;
    const grezzi = grezzo();
    if (orarioDaCorreggere('schede.' + n, grezzi)) {
      riga.caselle.fine.textContent = 'Correggi ora o durata per vedere quando va in onda.';
      return;
    }
    const inizio = R.oraDi(grezzi, n);
    const durata = R.durataDi(grezzi, n);
    const fine = R.fine(inizio, durata);
    const [h, m] = inizio.split(':').map(Number);
    const dopo = h * 60 + m + Math.round(durata * 60) >= 1440;
    riga.caselle.fine.textContent = 'In onda dalle ' + inizio + ' alle ' + fine + (dopo ? ' del giorno dopo' : '') + ' · ' + testoDurata(durata);
  }

  function aggiornaSerie() {
    if (!ed.ui.serie) return;
    const { ora, durata, fuso } = ed.ui.serie;
    // Chi sta scrivendo in una casella la vede com'è: si riallineano solo
    // quelle che non hanno il fuoco (dopo Annulla, per esempio).
    if (document.activeElement !== ora.input) ora.input.value = String(valoreDi('ora') ?? '');
    if (document.activeElement !== durata.input) {
      const d = valoreDi('durataOre');
      durata.input.value = d === null || d === undefined ? '' : String(d);
    }
    if (document.activeElement !== fuso.input) fuso.input.value = String(valoreDi('fuso') ?? '');
  }

  /** Titolo, gioco o nota: casella di una riga con il contatore. */
  function casellaTesto(percorso, etichetta, max, aiuto = '') {
    const voce = casella({ etichetta, max, aiuto, attributi: { spellcheck: 'true' } });
    voce.input.value = String(valoreDi(percorso) ?? '');
    voce.conta();
    voce.input.addEventListener('input', () => {
      // Su una riga sola, come vuole il sito: un a capo incollato diventa spazio.
      const pulito = voce.input.value.replace(/[\r\n]+/g, ' ');
      if (pulito !== voce.input.value) voce.input.value = pulito;
      voce.conta();
      scrivi([[percorso, voce.input.value]]);
    });
    registraCasella(percorso, voce);
    return voce;
  }

  /* All'uscita dalla casella il suo errore compare anche se è nato mentre
     si scriveva (calcolaErrori lo tiene nascosto finché c'è il fuoco). */
  function registraCasella(percorso, voce) {
    ed.campi.set(percorso, { mostra: voce.mostra, fuoco: () => voce.input.focus(), input: voce.input });
    voce.input.addEventListener('blur', () => {
      ed.toccati.add(percorso);
      calcolaErrori();
    });
  }

  /* =================================================================
     BLOCCO IMMAGINE (giorni, eventi, fondale)
     ================================================================= */

  /* Il blocco vero è creaBloccoImmagine (qui sopra, esportato). Qui gli si
     passa il valore della scheda e si scrive solo quello che il blocco ha
     davvero cambiato: un velo sbagliato nei dati resta sbagliato (e segnato)
     anche se si sposta il fuoco, invece di essere corretto di nascosto. */
  function bloccoImmagine({ base, uso, nome }) {
    const modo = uso === 'sfondo' ? 'intensita' : 'velo';
    const livello = modo === 'velo' ? 'velo' : 'intensita';

    function letti() {
      const pulita = leggiIn(pulito(), base) || {};
      const valore = {
        immagine: String(leggiIn(grezzo(), base + '.immagine') ?? pulita.immagine ?? ''),
        fuoco: pulita.fuoco || { x: 50, y: 50 }
      };
      valore[livello] = pulita[livello];
      return valore;
    }

    let ultimo = letti();
    const blocco = creaBloccoImmagine({
      etichetta: uso === 'sfondo' ? 'Immagine del fondale' : 'Immagine di sfondo',
      valore: ultimo,
      modo,
      ritagli: ritagliPer(uso, pulito()),
      descrizione: uso === 'giorno' ? 'di ' + nome : (uso === 'evento' ? 'dell\'evento' : 'del fondale'),
      scegliImmagine: typeof ctx.scegliImmagine === 'function' ? ctx.scegliImmagine : null,
      vuoto: uso === 'sfondo'
        ? 'La sezione resta sul suo fondo scuro. Trascina qui un file, o scegline uno qui sotto.'
        : 'La locandina si disegna lo stesso, con i colori del sito. Trascina qui un file, o scegline uno qui sotto.',
      aiutoLivello: uso === 'sfondo' ? 'Quanto si vede il fondale dietro la sezione. A 0 è spento.' : '',
      alCambio(nuovo, { dalVivo: continuo }) {
        const variabili = { '--fuoco': nuovo.fuoco.x + '% ' + nuovo.fuoco.y + '%' };
        variabili['--' + livello] = String(nuovo[livello] / 100);
        dalVivo(base, variabili);

        const modifiche = [];
        if (nuovo.immagine !== ultimo.immagine) modifiche.push([base + '.immagine', nuovo.immagine]);
        if (nuovo.fuoco.x !== ultimo.fuoco.x || nuovo.fuoco.y !== ultimo.fuoco.y) modifiche.push([base + '.fuoco', { x: nuovo.fuoco.x, y: nuovo.fuoco.y }]);
        if (nuovo[livello] !== ultimo[livello]) modifiche.push([base + '.' + livello, nuovo[livello]]);
        ultimo = { ...nuovo, fuoco: { x: nuovo.fuoco.x, y: nuovo.fuoco.y } };

        if (continuo) {
          if (modifiche.length) scriviPresto(modifiche);
          return;
        }
        svuotaSospeso();
        if (modifiche.length) scrivi(modifiche);
      }
    });

    /* Immagine, fuoco e velo hanno una riga d'errore sola, quella del
       blocco: gli altri due percorsi rimandano al primo. */
    ed.campi.set(base + '.immagine', { mostra: blocco.mostraErrori, fuoco: blocco.fuoco });
    ed.campi.set(base + '.fuoco', { alias: base + '.immagine' });
    ed.campi.set(base + '.' + livello, { alias: base + '.immagine' });

    return {
      nodo: blocco.nodo,
      aggiorna() {
        ultimo = letti();
        blocco.imposta(ultimo);
        blocco.ritagli(ritagliPer(uso, pulito()));
      }
    };
  }

  /* =================================================================
     VISTA EVENTI SPECIALI
     ================================================================= */

  function costruisciEventi() {
    const pannello = el('div', { classe: 'palinsesto__vista palinsesto__vista--eventi' });
    const aggiungi = bottone({ testo: 'Aggiungi evento', ico: 'piu', classe: 'btn btn--primario', su: () => aggiungiEvento() });
    const conta = el('span', { classe: 'palinsesto__conta' });
    const limite = el('p', { classe: 'palinsesto__limite', hidden: true });
    const erroreEventi = el('p', { classe: 'campo__errore', hidden: true, role: 'alert' });
    ed.campi.set('eventi', {
      mostra(messaggi) {
        erroreEventi.textContent = messaggi.join(' ');
        erroreEventi.hidden = !messaggi.length;
      },
      fuoco: () => aggiungi.focus()
    });
    const elenco = el('ol', { classe: 'palinsesto__eventi', 'aria-label': 'Eventi speciali in ordine di data' });
    const vuoto = el('p', { classe: 'palinsesto__vuoto', testo: 'Nessun evento speciale. Aggiungine uno per una serata fuori programma o uno speciale: sul sito compare con la sua data, fino a quando non finisce.' });

    ed.ui.eventiUi = { aggiungi, conta, limite, elenco, vuoto };
    pannello.append(
      el('div', { classe: 'palinsesto__intesta' }, [
        el('p', { classe: 'palinsesto__nota', testo: 'Dirette fuori programma con una data precisa. Un evento finito resta qui, segnato «Passato», ma dal sito sparisce da solo.' }),
        el('div', { classe: 'palinsesto__azioni' }, [aggiungi, conta])
      ]),
      limite,
      erroreEventi,
      vuoto,
      elenco
    );
    disegnaEventi();
    return pannello;
  }

  function quandoEvento(evento, fuso) {
    const inizio = R.istante(evento.data, evento.ora, fuso);
    const durata = Number(evento.durataOre);
    if (!Number.isFinite(inizio)) return { inizio: NaN, termine: NaN };
    return { inizio, termine: Number.isFinite(durata) ? inizio + Math.round(durata * 3600000) : NaN };
  }

  /* In arrivo per data, poi quelli senza una data leggibile, poi i passati
     dal più recente: chi apre la vista vuole vedere per primo cosa viene. */
  function ordineEventi() {
    const orari = pulito();
    const adesso = Date.now();
    const voci = orari.eventi.map((evento, indice) => ({ indice, evento, ...quandoEvento(evento, orari.fuso) }));
    const arrivo = voci.filter((v) => Number.isFinite(v.termine) && v.termine > adesso).sort((a, b) => a.inizio - b.inizio || a.indice - b.indice);
    const senza = voci.filter((v) => !Number.isFinite(v.termine));
    const passati = voci.filter((v) => Number.isFinite(v.termine) && v.termine <= adesso).sort((a, b) => b.inizio - a.inizio);
    return { arrivo, senza, passati };
  }

  function disegnaEventi() {
    const ui = ed.ui.eventiUi;
    if (!ui) return;
    for (const [i, riga] of ed.ui.eventi) {
      if (riga.immagine) for (const pezzo of ['immagine', 'fuoco', 'velo']) ed.campi.delete('eventi.' + i + '.' + pezzo);
      for (const pezzo of ['data', 'ora', 'durataOre', 'ultimoGiorno', 'titolo', 'gioco', 'nota']) ed.campi.delete('eventi.' + i + '.' + pezzo);
    }
    ed.ui.eventi.clear();
    svuota(ui.elenco);

    const { arrivo, senza, passati } = ordineEventi();
    for (const voce of arrivo.concat(senza)) ui.elenco.append(costruisciRigaEvento(voce.indice));
    if (passati.length) {
      ui.elenco.append(el('li', { classe: 'palinsesto__separatore', 'aria-hidden': 'true', testo: 'Passati' }));
      for (const voce of passati) ui.elenco.append(costruisciRigaEvento(voce.indice));
    }
    if (ed.evento !== null && !ed.ui.eventi.has(ed.evento)) ed.evento = null;
    if (ed.evento !== null) {
      const riga = ed.ui.eventi.get(ed.evento);
      if (!riga.costruito) costruisciCorpoEvento(ed.evento);
      riga.corpo.hidden = false;
    }
    aggiornaRigheEventi();
  }

  function aggiornaRigheEventi() {
    const ui = ed.ui.eventiUi;
    if (!ui) return;
    const orari = pulito();
    const quanti = Array.isArray(grezzo().eventi) ? grezzo().eventi.length : orari.eventi.length;
    ui.conta.textContent = quanti + ' / ' + L.eventi;
    const pieno = quanti >= L.eventi;
    ui.aggiungi.disabled = pieno;
    ui.limite.hidden = !pieno;
    ui.limite.textContent = pieno ? 'Sei a ' + L.eventi + ' eventi, il massimo: elimina quelli passati per fare posto a uno nuovo.' : '';
    ui.vuoto.hidden = quanti > 0;
    for (const i of ed.ui.eventi.keys()) aggiornaRigaEvento(i);
  }

  function costruisciRigaEvento(i) {
    const idCorpo = idUnico('pal-evento');
    const numero = el('b', { classe: 'palinsesto-evento__numero' });
    const mese = el('span', { classe: 'palinsesto-evento__mese' });
    const settimana = el('span', { classe: 'palinsesto-evento__giorno' });
    const titolo = el('span', { classe: 'palinsesto-evento__titolo' });
    const quando = el('span', { classe: 'palinsesto-evento__quando' });
    const stato = el('span', { classe: 'palinsesto__segno palinsesto-evento__stato', hidden: true });
    const errori = el('span', { classe: 'palinsesto__errori', hidden: true });
    const mini = el('span', { classe: 'palinsesto__mini', 'aria-hidden': 'true' });

    const apri = el('button', { type: 'button', classe: 'palinsesto-evento__apri', 'aria-expanded': 'false', 'aria-controls': idCorpo }, [
      el('span', { classe: 'palinsesto-evento__data', 'aria-hidden': 'true' }, [numero, mese, settimana]),
      el('span', { classe: 'palinsesto-evento__testo' }, [titolo, quando]),
      stato, errori, mini,
      icona('freccia', 'ico palinsesto__freccia')
    ]);
    const corpo = el('div', { classe: 'palinsesto-evento__corpo', id: idCorpo, hidden: true, role: 'region' });
    const nodo = el('li', { classe: 'palinsesto-evento', dati: { evento: String(i) } }, [apri, corpo]);

    const riga = { nodo, apri, corpo, numero, mese, settimana, titolo, quando, stato, errori, mini, costruito: false };
    ed.ui.eventi.set(i, riga);

    apri.addEventListener('click', () => {
      if (ed.evento === i && !corpo.hidden) chiudiEvento(i);
      else apriEvento(i, { scorriAnteprima: true });
    });
    return nodo;
  }

  function aggiornaRigaEvento(i) {
    const riga = ed.ui.eventi.get(i);
    if (!riga) return;
    const orari = pulito();
    const evento = orari.eventi[i] || R.eventoVuoto();
    const pezzi = pezziData(evento.data);
    const { inizio, termine } = quandoEvento(evento, orari.fuso);
    const adesso = Date.now();
    const aperto = ed.evento === i && !riga.corpo.hidden;

    riga.numero.textContent = pezzi ? pezzi.numero : '—';
    riga.mese.textContent = pezzi ? pezzi.mese : 'data';
    riga.settimana.textContent = pezzi ? pezzi.abbr : '';
    riga.titolo.textContent = evento.titolo || 'Senza titolo';
    riga.nodo.dataset.senzaTitolo = evento.titolo ? '0' : '1';
    const orario = evento.ora
      ? evento.ora + (Number.isFinite(termine) ? '–' + R.oraNelFuso(termine, orari.fuso) : '') +
        (evento.durataOre !== null ? ' · ' + testoDurata(evento.durataOre) : '')
      : 'ora da scegliere';
    riga.quando.textContent = (orarioDaCorreggere('eventi.' + i, grezzo()) ? 'Orario da correggere' : orario) + (evento.gioco ? ' · ' + evento.gioco : '');

    const passato = Number.isFinite(termine) && termine <= adesso;
    const inOnda = Number.isFinite(inizio) && inizio <= adesso && !passato;
    riga.nodo.dataset.passato = passato ? '1' : '0';
    riga.stato.hidden = !passato && !inOnda;
    riga.stato.textContent = passato ? 'Passato' : (inOnda ? 'In onda' : '');
    riga.stato.dataset.tipo = passato ? 'passato' : 'onda';

    riga.nodo.dataset.aperto = aperto ? '1' : '0';
    riga.apri.setAttribute('aria-expanded', String(aperto));
    riga.apri.setAttribute('aria-label', (evento.titolo || 'Evento senza titolo') + ', ' + (pezzi ? pezzi.lungo : 'data da scegliere') +
      (evento.ora ? ' alle ' + evento.ora : '') + (passato ? ', passato' : ''));
    riga.corpo.setAttribute('aria-label', 'Evento ' + (evento.titolo ? '«' + evento.titolo + '»' : 'senza titolo'));

    miniatura(riga.mini, evento);
    if (riga.costruito) {
      aggiornaFineEvento(i);
      if (riga.immagine) riga.immagine.aggiorna();
    }
  }

  function apriEvento(i, { dallAnteprima = false, scorriAnteprima = false } = {}) {
    if (!ed.ui) return;
    impostaVista('eventi');
    const riga = ed.ui.eventi.get(i);
    if (!riga) return;
    if (ed.evento !== null && ed.evento !== i) chiudiEvento(ed.evento, { tieniRicordo: true });
    if (!riga.costruito) costruisciCorpoEvento(i);
    riga.corpo.hidden = false;
    ed.evento = i;
    ricordo.evento = i;
    aggiornaRigaEvento(i);
    calcolaErrori();
    aggiornaEvidenza();
    if (dallAnteprima) {
      scorriNelPannello(riga.nodo, { inCima: true });
      segnala(riga.nodo);
    } else {
      scorriNelPannello(riga.apri);
    }
    if (scorriAnteprima) scorriAnteprimaA('eventi.' + i);
  }

  function chiudiEvento(i, { tieniRicordo = false } = {}) {
    const riga = ed.ui && ed.ui.eventi.get(i);
    if (!riga) return;
    riga.corpo.hidden = true;
    if (ed.evento === i) {
      ed.evento = null;
      if (!tieniRicordo) ricordo.evento = null;
    }
    aggiornaRigaEvento(i);
    aggiornaEvidenza();
  }

  function costruisciCorpoEvento(i) {
    const riga = ed.ui.eventi.get(i);
    const base = 'eventi.' + i;

    const data = casella({ etichetta: 'Data', tipo: 'date' });
    data.input.value = String(valoreDi(base + '.data') ?? '');
    data.input.addEventListener('input', () => scrivi([[base + '.data', data.input.value]]));

    const ora = casella({ etichetta: 'Ora di inizio', segnaposto: pulito().ora, attributi: { inputmode: 'numeric', maxlength: 5, spellcheck: 'false' } });
    ora.input.value = String(valoreDi(base + '.ora') ?? '');
    ora.input.addEventListener('input', () => scrivi([[base + '.ora', ora.input.value.trim()]]));
    ora.input.addEventListener('blur', () => {
      const messo = oraDaTesto(ora.input.value);
      if (messo !== ora.input.value) { ora.input.value = messo; scrivi([[base + '.ora', messo]]); }
    });

    const durata = casella({
      etichetta: 'Durata (ore)', tipo: 'number',
      attributi: { min: L.durataMin, max: L.durataEventoMax, step: L.passoDurata, inputmode: 'decimal' }
    });
    const durataScritta = valoreDi(base + '.durataOre');
    durata.input.value = durataScritta === null || durataScritta === undefined ? '' : String(durataScritta);
    durata.input.addEventListener('input', () => scrivi([[base + '.durataOre', durataDaTesto(durata.input.value)]]));

    registraCasella(base + '.data', data);
    registraCasella(base + '.ora', ora);
    registraCasella(base + '.durataOre', durata);

    // Facoltativa, come la durata: solo un avviso sopra l'evento
    // («massimo entro il...»), non spegne niente da sé — vedi orari.js.
    const ultimoGiorno = casella({
      etichetta: 'Data limite (facoltativa)', tipo: 'date',
      aiuto: 'Solo un avviso sul sito, tipo «massimo entro il...»: non spegne l\'evento da solo — per quello serve la durata, o toglierlo a mano.'
    });
    ultimoGiorno.input.value = String(valoreDi(base + '.ultimoGiorno') ?? '');
    ultimoGiorno.input.addEventListener('input', () => scrivi([[base + '.ultimoGiorno', ultimoGiorno.input.value]]));
    registraCasella(base + '.ultimoGiorno', ultimoGiorno);

    const fine = el('p', { classe: 'palinsesto__fine', 'aria-live': 'polite' });
    const titolo = casellaTesto(base + '.titolo', 'Titolo', L.titolo);
    titolo.nodo.querySelector('label').append(el('span', { classe: 'palinsesto__obbligo', testo: ' · obbligatorio' }));
    const gioco = casellaTesto(base + '.gioco', 'Gioco', L.gioco);
    const nota = casellaTesto(base + '.nota', 'Nota', L.notaEvento, 'Qualche parola in più sulla scheda dell\'evento, sotto titolo e gioco.');
    const immagine = bloccoImmagine({ base, uso: 'evento', nome: 'questo evento' });

    const elimina = bottone({ testo: 'Elimina evento', ico: 'cestino', classe: 'btn btn--minimo btn--pericolo', su: () => eliminaEvento(i) });

    riga.caselle = { data, ora, durata, fine, titolo };
    riga.immagine = immagine;
    riga.corpo.append(
      el('div', { classe: 'palinsesto__due' }, [
        el('div', { classe: 'palinsesto__colonna' }, [
          el('div', { classe: 'palinsesto__griglia palinsesto__griglia--evento' }, [data.nodo, ora.nodo, durata.nodo]),
          fine,
          ultimoGiorno.nodo,
          titolo.nodo, gioco.nodo, nota.nodo
        ]),
        el('div', { classe: 'palinsesto__colonna' }, [immagine.nodo])
      ]),
      el('div', { classe: 'palinsesto-evento__piede' }, [elimina])
    );
    riga.costruito = true;
    aggiornaFineEvento(i);
  }

  function aggiornaFineEvento(i) {
    const riga = ed.ui.eventi.get(i);
    if (!riga || !riga.caselle) return;
    const orari = pulito();
    const evento = orari.eventi[i] || R.eventoVuoto();
    const { inizio, termine } = quandoEvento(evento, orari.fuso);
    const passato = Number.isFinite(termine) && termine <= Date.now();
    riga.caselle.fine.dataset.passato = passato ? '1' : '0';
    if (!Number.isFinite(inizio) || !Number.isFinite(termine) || orarioDaCorreggere('eventi.' + i, grezzo())) {
      riga.caselle.fine.textContent = 'Data, ora e durata vanno scelte e scritte giuste: finché non lo sono, l\'evento non compare sul sito.';
      return;
    }
    const giornoInizio = dataNelFuso(inizio, orari.fuso);
    const giornoFine = dataNelFuso(termine, orari.fuso);
    const oraFine = R.oraNelFuso(termine, orari.fuso);
    riga.caselle.fine.textContent = (passato ? 'Finito: ' : '') + 'dalle ' + evento.ora + ' di ' + giornoInizio +
      (giornoFine && giornoFine !== giornoInizio ? ' alle ' + oraFine + ' di ' + giornoFine : ' alle ' + oraFine) +
      ' · ' + testoDurata(evento.durataOre) + (passato ? '. Sul sito non si vede più.' : '');
  }

  function aggiungiEvento() {
    const orari = pulito();
    const attuali = Array.isArray(grezzo().eventi) ? grezzo().eventi : [];
    if (attuali.length >= L.eventi) {
      aggiornaRigheEventi();
      avviso('Gli eventi speciali sono al massimo ' + L.eventi + ': elimina quelli passati per farne posto.', { tipo: 'info' });
      return;
    }
    // Data di oggi, ora e durata di serie: si parte da valori veri, da
    // cambiare, invece che da caselle vuote che il salvataggio rifiuta.
    const nuovo = Object.assign(R.eventoVuoto(), {
      data: oggiNelFuso(orari.fuso),
      ora: orari.ora,
      durataOre: orari.durataOre
    });
    const indice = attuali.length;
    scrivi([['eventi', attuali.concat([nuovo])]], { tocca: false });
    ed.evento = indice;
    ricordo.evento = indice;
    disegnaEventi();
    apriEvento(indice, { scorriAnteprima: false });
    const riga = ed.ui.eventi.get(indice);
    if (riga && riga.caselle) riga.caselle.titolo.input.focus();
    annuncia('Evento aggiunto: scrivi il titolo e controlla data e ora.');
  }

  async function eliminaEvento(i) {
    const evento = pulito().eventi[i] || {};
    const nome = evento.titolo ? '«' + evento.titolo + '»' : 'questo evento';
    const ok = await conferma({
      titolo: 'Elimino ' + nome + '?',
      testo: [
        'L\'evento esce dalla schedule; dal sito pubblicato sparisce alla prossima pubblicazione.',
        'Finché non chiudi il pannello lo recuperi con Annulla (Ctrl+Z).'
      ],
      conferma: 'Elimina evento',
      pericolo: true
    });
    if (!ok) return;
    const attuali = Array.isArray(grezzo().eventi) ? grezzo().eventi.slice() : [];
    if (i < 0 || i >= attuali.length) return;
    attuali.splice(i, 1);
    // Gli indici dopo quello tolto scalano: i segni «toccato» degli eventi
    // non valgono più per la casella giusta, e si ripartono da zero.
    for (const t of Array.from(ed.toccati)) if (t.startsWith('eventi.')) ed.toccati.delete(t);
    ed.evento = null;
    ricordo.evento = null;
    scrivi([['eventi', attuali]], { tocca: false });
    disegnaEventi();
    calcolaErrori();
    aggiornaEvidenza();
    ed.ui.eventiUi.aggiungi.focus();
    annuncia('Evento eliminato.');
  }

  /* =================================================================
     VISTA GIORNI SALTATI

     Una data precisa spenta per un motivo personale: vince sia sulla
     settimana di serie sia su un evento speciale che cade lo stesso
     giorno (vedi orari.js e costruisci.js — «saltata» non convive mai con
     «sostituito»). Solo due campi, niente da espandere: una riga per
     ognuno basta.
     ================================================================= */

  function ordinePause() {
    const orari = pulito();
    const voci = orari.pause.map((pausa, indice) => ({ indice, pausa }));
    const conData = voci.filter((v) => R.dataValida(v.pausa.data))
      .sort((a, b) => (a.pausa.data < b.pausa.data ? -1 : (a.pausa.data > b.pausa.data ? 1 : a.indice - b.indice)));
    const senza = voci.filter((v) => !R.dataValida(v.pausa.data));
    return conData.concat(senza);
  }

  function costruisciPause() {
    const pannello = el('div', { classe: 'palinsesto__vista palinsesto__vista--pause' });
    const aggiungi = bottone({ testo: 'Aggiungi giorno saltato', ico: 'piu', classe: 'btn btn--primario', su: () => aggiungiPausa() });
    const conta = el('span', { classe: 'palinsesto__conta' });
    const limite = el('p', { classe: 'palinsesto__limite', hidden: true });
    const errorePause = el('p', { classe: 'campo__errore', hidden: true, role: 'alert' });
    ed.campi.set('pause', {
      mostra(messaggi) {
        errorePause.textContent = messaggi.join(' ');
        errorePause.hidden = !messaggi.length;
      },
      fuoco: () => aggiungi.focus()
    });
    const elenco = el('ol', { classe: 'palinsesto__pause', 'aria-label': 'Giorni saltati per motivi personali' });
    const vuoto = el('p', {
      classe: 'palinsesto__vuoto',
      testo: 'Nessun giorno saltato. Aggiungine uno per dire che un giorno preciso non c\'è, anche se cade di diretta o dentro un evento speciale.'
    });

    ed.ui.pauseUi = { aggiungi, conta, limite, elenco, vuoto };
    pannello.append(
      el('div', { classe: 'palinsesto__intesta' }, [
        el('p', { classe: 'palinsesto__nota', testo: 'Un giorno preciso spento per un motivo tuo: vince sia sulla settimana di serie sia su un evento speciale che cade lo stesso giorno.' }),
        el('div', { classe: 'palinsesto__azioni' }, [aggiungi, conta])
      ]),
      limite,
      errorePause,
      vuoto,
      elenco
    );
    disegnaPause();
    return pannello;
  }

  function disegnaPause() {
    const ui = ed.ui.pauseUi;
    if (!ui) return;
    for (const i of ed.ui.pause.keys()) {
      ed.campi.delete('pause.' + i + '.data');
      ed.campi.delete('pause.' + i + '.motivo');
    }
    ed.ui.pause.clear();
    svuota(ui.elenco);
    for (const voce of ordinePause()) ui.elenco.append(costruisciRigaPausa(voce.indice));
    aggiornaRighePause();
  }

  function aggiornaRighePause() {
    const ui = ed.ui.pauseUi;
    if (!ui) return;
    const orari = pulito();
    const quanti = Array.isArray(grezzo().pause) ? grezzo().pause.length : orari.pause.length;
    ui.conta.textContent = quanti + ' / ' + L.pause;
    const pieno = quanti >= L.pause;
    ui.aggiungi.disabled = pieno;
    ui.limite.hidden = !pieno;
    ui.limite.textContent = pieno ? 'Sei a ' + L.pause + ' giorni saltati, il massimo: elimina quelli che non ti servono più per farne posto.' : '';
    ui.vuoto.hidden = quanti > 0;
  }

  function costruisciRigaPausa(i) {
    const base = 'pause.' + i;

    const data = casella({ etichetta: 'Data', tipo: 'date' });
    data.input.value = String(valoreDi(base + '.data') ?? '');
    data.input.addEventListener('input', () => scrivi([[base + '.data', data.input.value]]));
    registraCasella(base + '.data', data);

    const motivo = casella({
      etichetta: 'Motivo (facoltativo)', max: L.motivoPausa,
      aiuto: 'Compare sul sito accanto all\'avviso, se lo scrivi. Lasciandolo vuoto resta solo l\'avviso.',
      attributi: { spellcheck: 'true' }
    });
    motivo.input.value = String(valoreDi(base + '.motivo') ?? '');
    motivo.conta();
    motivo.input.addEventListener('input', () => { motivo.conta(); scrivi([[base + '.motivo', motivo.input.value]]); });
    registraCasella(base + '.motivo', motivo);

    const elimina = bottone({ testo: 'Elimina', ico: 'cestino', classe: 'btn btn--minimo btn--pericolo', su: () => eliminaPausa(i) });

    const nodo = el('li', { classe: 'palinsesto-pausa', dati: { pausa: String(i) } }, [
      el('div', { classe: 'palinsesto__griglia' }, [data.nodo, motivo.nodo]),
      el('div', { classe: 'palinsesto-pausa__piede' }, [elimina])
    ]);
    ed.ui.pause.set(i, { nodo, data, motivo });
    return nodo;
  }

  function aggiungiPausa() {
    const orari = pulito();
    const attuali = Array.isArray(grezzo().pause) ? grezzo().pause : [];
    if (attuali.length >= L.pause) {
      aggiornaRighePause();
      avviso('I giorni saltati sono al massimo ' + L.pause + ': elimina quelli che non ti servono più per farne posto.', { tipo: 'info' });
      return;
    }
    // Data di oggi di serie, da cambiare: si parte da un valore vero invece
    // che da una casella vuota che il salvataggio rifiuta.
    const nuovo = Object.assign(R.pausaVuota(), { data: oggiNelFuso(orari.fuso) });
    const indice = attuali.length;
    scrivi([['pause', attuali.concat([nuovo])]], { tocca: false });
    disegnaPause();
    const riga = ed.ui.pause.get(indice);
    if (riga) riga.data.input.focus();
    annuncia('Giorno saltato aggiunto: scegli la data giusta e, se vuoi, scrivi il motivo.');
  }

  function eliminaPausa(i) {
    const attuali = Array.isArray(grezzo().pause) ? grezzo().pause.slice() : [];
    if (i < 0 || i >= attuali.length) return;
    attuali.splice(i, 1);
    // Gli indici dopo quello tolto scalano: i segni «toccato» di quelli
    // saltati non valgono più per la casella giusta.
    for (const t of Array.from(ed.toccati)) if (t.startsWith('pause.')) ed.toccati.delete(t);
    scrivi([['pause', attuali]], { tocca: false });
    disegnaPause();
    calcolaErrori();
    aggiornaEvidenza();
    ed.ui.pauseUi.aggiungi.focus();
    annuncia('Giorno saltato eliminato.');
  }

  /* =================================================================
     VISTA FONDALE
     ================================================================= */

  function costruisciFondale() {
    const immagine = bloccoImmagine({ base: 'sfondo', uso: 'sfondo', nome: 'fondale' });
    ed.ui.fondale = immagine;
    return el('div', { classe: 'palinsesto__vista palinsesto__vista--fondale' }, [
      el('p', { classe: 'palinsesto__nota', testo: 'L\'immagine dietro tutta la sezione «La settimana», sfumata ai bordi e velata come il fondale della copertina. Il punto di fuoco decide cosa resta in vista sugli schermi stretti.' }),
      immagine.nodo
    ]);
  }

  function aggiornaFondale() {
    if (ed.ui.fondale) ed.ui.fondale.aggiorna();
  }

  /* =================================================================
     MONTAGGIO
     ================================================================= */

  const annuncio = el('p', { classe: 'sr-only', role: 'status', 'aria-live': 'polite' });
  function annuncia(testo) {
    annuncio.textContent = '';
    setTimeout(() => { annuncio.textContent = testo; }, 40);
  }

  function disegnaTutto() {
    svuota(radice);
    ed.campi.clear();
    ed.ui = { giorni: new Map(), eventi: new Map(), pause: new Map(), linguette: new Map(), pannelli: new Map(), contaLinguette: {} };

    const riepilogo = creaRiepilogoOrari({ leggi: grezzo, suGiorno: (n) => apriGiorno(n, { scorriAnteprima: true }) });
    ed.ui.riepilogo = riepilogo;

    const idLista = idUnico('pal-viste');
    const lista = el('div', { classe: 'palinsesto__linguette', role: 'tablist', 'aria-label': 'Parti della schedule', id: idLista });
    for (const vista of VISTE) {
      const idLinguetta = idUnico('pal-linguetta');
      const idPannello = idUnico('pal-pannello');
      const conta = el('span', { classe: 'palinsesto__badge' });
      ed.ui.contaLinguette[vista.id] = conta;
      const linguetta = el('button', {
        type: 'button', role: 'tab', id: idLinguetta, classe: 'palinsesto__linguetta',
        'aria-controls': idPannello, 'aria-selected': 'false', tabindex: '-1', dati: { vista: vista.id }
      }, [el('span', { testo: vista.nome }), conta]);
      linguetta.addEventListener('click', () => {
        impostaVista(vista.id);
        if (vista.id === 'fondale') scorriAnteprimaA('sfondo');
      });
      lista.append(linguetta);
      ed.ui.linguette.set(vista.id, linguetta);
      const pannello = el('div', { role: 'tabpanel', id: idPannello, 'aria-labelledby': idLinguetta, classe: 'palinsesto__pannello', hidden: true });
      ed.ui.pannelli.set(vista.id, pannello);
    }
    lista.addEventListener('keydown', (evento) => {
      const indice = VISTE.findIndex((v) => v.id === ed.vista);
      let nuovo = -1;
      if (evento.key === 'ArrowRight') nuovo = (indice + 1) % VISTE.length;
      else if (evento.key === 'ArrowLeft') nuovo = (indice - 1 + VISTE.length) % VISTE.length;
      else if (evento.key === 'Home') nuovo = 0;
      else if (evento.key === 'End') nuovo = VISTE.length - 1;
      if (nuovo < 0) return;
      evento.preventDefault();
      impostaVista(VISTE[nuovo].id, { fuoco: true });
    });

    ed.ui.pannelli.get('settimana').append(costruisciSettimana());
    ed.ui.pannelli.get('eventi').append(costruisciEventi());
    ed.ui.pannelli.get('pause').append(costruisciPause());
    ed.ui.pannelli.get('fondale').append(costruisciFondale());

    radice.append(riepilogo.nodo, lista, ...ed.ui.pannelli.values(), annuncio);

    // Il giorno ricordato si riapre senza cambiare la vista ricordata (l'evento
    // aperto lo riapre già disegnaEventi).
    const vistaRicordata = ed.vista;
    if (ed.giorno !== null && pulito().giorni.includes(ed.giorno)) apriGiorno(ed.giorno);
    else ed.giorno = null;
    impostaVista(vistaRicordata);
    aggiornaTutto();
  }

  /* --- quando i dati cambiano da fuori ------------------------------ */

  const istanza = {
    nodo: parti.nodo,
    appesa: false,
    api: {
      apriGiorno: (n, opzioni) => apriGiorno(n, opzioni),
      apriEvento: (i, opzioni) => apriEvento(i, opzioni),
      selettoreEvidenza() {
        if (ed.vista === 'settimana' && ed.giorno !== null) return selettoreDi('schede.' + ed.giorno);
        if (ed.vista === 'eventi' && ed.evento !== null) return selettoreDi('eventi.' + ed.evento);
        if (ed.vista === 'pause') return '#settimana';
        if (ed.vista === 'fondale') return '#settimana';
        return '';
      }
    }
  };
  istanze.add(istanza);

  const suSostituito = () => {
    // Un giro dopo: chi disegna le parti butta i nodi vecchi nello stesso
    // evento, e ridisegnare un editor che sta per sparire è lavoro perso.
    setTimeout(() => {
      if (!parti.nodo.isConnected) {
        if (istanza.appesa) document.removeEventListener('sb:sostituito', suSostituito);
        return;
      }
      ed.toccati.clear();
      ed.tutti = false;
      ed.server = null;
      ed.vista = ricordo.vista;
      ed.giorno = ricordo.giorno;
      ed.evento = ricordo.evento;
      disegnaTutto();
    }, 0);
  };
  document.addEventListener('sb:sostituito', suSostituito);


  /* --- il contratto dei campi --------------------------------------- */

  controllo.valida = () => {
    svuotaSospeso();
    ed.tutti = true;
    calcolaErrori();
    return ed.mostrati.length === 0;
  };

  /* Il pannello riappoggia gli errori del server a ogni ridisegno del
     guscio, con lo stesso messaggio: il posto dell'errore si apre solo la
     prima volta che arriva, e il fuoco non si sposta mai da qui (lo porta
     `fuoco()`, quando chi amministra clicca il riepilogo degli errori). */
  controllo.mostraErrore = (testo) => {
    if (!testo) {
      ed.server = null;
      calcolaErrori();
      return;
    }
    const firma = JSON.stringify(grezzo());
    if (!ed.server || ed.server.firma !== firma) ed.server = { messaggi: new Set(), firma };
    const nuovo = !ed.server.messaggi.has(String(testo));
    ed.server.messaggi.add(String(testo));
    ed.tutti = true;
    calcolaErrori();
    if (nuovo) vaiAlPrimoErrore();
  };

  controllo.pulisci = () => {
    ed.server = null;
    ed.tutti = false;
    ed.toccati.clear();
    calcolaErrori();
  };

  controllo.fuoco = () => {
    if (ed.mostrati.length && vaiAlPrimoErrore({ fuoco: true })) return;
    const linguetta = ed.ui && ed.ui.linguette.get(ed.vista);
    if (linguetta) linguetta.focus();
  };

  controllo.apriVista = (id) => impostaVista(id);
  controllo.apriGiorno = (n, opzioni) => apriGiorno(n, opzioni);
  controllo.apriEvento = (i, opzioni) => apriEvento(i, opzioni);

  disegnaTutto();
  // Appena il campo è in pagina il contorno nell'anteprima torna sul
  // giorno o sull'evento che era aperto.
  setTimeout(aggiornaEvidenza, 0);
  return controllo;
}
