/* =====================================================================
   impostazioni.js — Impostazioni del sito, i controlli «colore» e «font»
   della scheda Stile, la libreria dei font caricati (CONTRATTO-4 §11.4).

   Tre cose che stanno insieme perché parlano dello stesso dato:
     1. la vista «Impostazioni del sito» (menu ☰): i campi del gruppo
        `aspetto` disegnati dallo schema con ponte.creaCampo, le
        combinazioni pronte, il riepilogo dei contrasti e la libreria dei
        font caricati (carica, elimina, avviso quando un font è in uso);
     2. coloreControllo e fontControllo, che la scheda Stile usa per dare a
        un elemento un colore o un font del tema (`var:viola`,
        `ruolo:titolo`): collegati, cambiano quando cambia il tema;
     3. voceFont e voceFamiglia, che SBStili chiede per scrivere il CSS dei
        font di un elemento.

   Si aggancia al pannello solo attraverso il ponte. Il motore si carica
   con import() dinamico: se manca o si rompe, le impostazioni funzionano
   lo stesso e l'anteprima si aggiorna quando il guscio la ricarica.

   Esporta:
     disegnaImpostazioni(contenitore)   -> div.imp aggiunto in fondo al contenitore
     coloreControllo({ etichetta, valore, alCambio, vuoto, aiuto, aperto, segnaposto })
     fontControllo({ etichetta, valore, alCambio, vuoto, aiuto, aperto, esempio, segnaposto })
     caricaFont({ forza })              -> Promise<{ catalogo, caricati, errore }>
     voceFont(id)                       -> { id, etichetta, file, formato } | null
     voceFamiglia(nome)                 -> { nome, ripiego, pesi, categoria } | null
     coloriTema()                       -> [{ chiave, nome, gruppo, esa }]
   ===================================================================== */

import { ponte } from './ponte.js';
import { el, bottone, svuota, idUnico, formattaData, formattaPeso } from '../moduli/dom.js';
import { ErroreApi, rottaAssente } from '../moduli/api.js';
import {
  contrasto, etichettaContrasto, precaricaFont, creaBarraTema,
  impostaFontCaricati, fontCaricati, suFontCaricati, famigliaCaricato
} from '../moduli/tema.js';

/* ---------------------------------------------------------------------
   1. Foglio di stile

   I controlli servono alla scheda Stile anche se nessuno apre mai le
   Impostazioni: il foglio si collega quando il modulo si carica, una volta
   sola, e non si raddoppia se index.html lo ha già.
   --------------------------------------------------------------------- */

const URL_FOGLIO = new URL('./impostazioni.css', import.meta.url).href;

function collegaFoglio() {
  if (typeof document === 'undefined' || !document.head) return;
  const presente = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) =>
    link.href === URL_FOGLIO || /(^|\/)editor\/impostazioni\.css(\?|$)/.test(link.getAttribute('href') || ''));
  if (!presente) document.head.append(el('link', { rel: 'stylesheet', href: URL_FOGLIO }));
}
collegaFoglio();

/* ---------------------------------------------------------------------
   2. Costanti
   --------------------------------------------------------------------- */

const RAMO_TEMA = 'config.tema';
const GRUPPO_ASPETTO = 'aspetto';

/* I dodici colori del tema (CONTRATTO-4 §4.2) con un nome breve, quello
   che sta in un campione largo 130 pixel. Le etichette dello schema sono
   pensate per un campo intero («Testo — note ed etichette») e tre di loro
   comincerebbero con la stessa parola. */
const COLORI = [
  { chiave: 'viola', nome: 'Viola del marchio', gruppo: 'Marchio' },
  { chiave: 'violaCupo', nome: 'Viola profondo', gruppo: 'Marchio' },
  { chiave: 'violaChiaro', nome: 'Viola chiaro', gruppo: 'Marchio' },
  { chiave: 'ciano', nome: 'Ciano', gruppo: 'Marchio' },
  { chiave: 'magenta', nome: 'Magenta', gruppo: 'Marchio' },
  { chiave: 'live', nome: 'In onda', gruppo: 'Stati' },
  { chiave: 'ok', nome: 'Fatto', gruppo: 'Stati' },
  { chiave: 'allerta', nome: 'Attenzione', gruppo: 'Stati' },
  { chiave: 'fondo', nome: 'Fondo', gruppo: 'Fondo e testo' },
  { chiave: 'testo', nome: 'Testo forte', gruppo: 'Fondo e testo' },
  { chiave: 'testoMedio', nome: 'Paragrafi', gruppo: 'Fondo e testo' },
  { chiave: 'testoTenue', nome: 'Note', gruppo: 'Fondo e testo' }
];

/* Le coppie del riepilogo «si legge?»: i colori con cui il sito SCRIVE,
   misurati contro il fondo. Gli altri (viola pieno, aloni) non portano
   testo e un rapporto basso lì non è un problema. */
const COPPIE_CONTRASTO = [
  { chiave: 'testo', nome: 'Titoli e testo forte' },
  { chiave: 'testoMedio', nome: 'Paragrafi' },
  { chiave: 'testoTenue', nome: 'Note ed etichette' },
  { chiave: 'violaChiaro', nome: 'Viola per scrivere' }
];

const RUOLI = [
  { ruolo: 'titolo', nome: 'Titoli', catalogo: 'Per i titoli' },
  { ruolo: 'testo', nome: 'Testo', catalogo: 'Per il testo' },
  { ruolo: 'mono', nome: 'Strumentazione', catalogo: 'A larghezza fissa' }
];

const ESEMPIO_FONT = 'Aa Bb 21:00';
const RIPIEGO_GENERICO = 'system-ui, sans-serif';

/* Gli stessi limiti del server (CONTRATTO-4 §4.4): controllarli qui evita
   di spedire due megabyte per sentirsi dire di no. Il formato vero lo
   decide il server dai primi byte, non dall'estensione. */
const MAX_BYTE_FONT = 2 * 1024 * 1024;
const RE_ESTENSIONE_FONT = /\.(woff2|woff|ttf|otf)$/i;
const RE_ID_FONT = /^[0-9a-f]{16}$/;
const RE_COLORE = /^#[0-9a-f]{6}$/i;

/* ---------------------------------------------------------------------
   3. Utilità
   --------------------------------------------------------------------- */

function clona(valore) {
  if (typeof structuredClone === 'function') return structuredClone(valore);
  return JSON.parse(JSON.stringify(valore));
}

function uguali(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function oggetto(valore) {
  return Boolean(valore) && typeof valore === 'object' && !Array.isArray(valore);
}

function leggiRamo(radice, percorso) {
  let nodo = radice;
  for (const passo of String(percorso).split('.')) {
    if (!oggetto(nodo)) return undefined;
    nodo = nodo[passo];
  }
  return nodo;
}

function scriviRamo(radice, percorso, valore) {
  const passi = String(percorso).split('.');
  const ultimo = passi.pop();
  let nodo = radice;
  for (const passo of passi) {
    if (!oggetto(nodo[passo])) nodo[passo] = {};
    nodo = nodo[passo];
  }
  nodo[ultimo] = valore;
}

function registra(errore) {
  if (typeof console !== 'undefined') console.error('[impostazioni]', errore);
}

/** «#8B2FFF», «8b2fff», «#abc» -> «#8b2fff»; stringa vuota se non è un colore. */
function normalizzaEsa(valore) {
  const corpo = String(valore === null || valore === undefined ? '' : valore).trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(corpo)) return '#' + corpo.split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/.test(corpo)) return '#' + corpo;
  return '';
}

/**
 * Un colore CSS qualunque (quello che torna getComputedStyle, di solito
 * «rgb(242, 240, 248)») in esadecimale, per il campione «come nel sito».
 * Trasparente o illeggibile -> stringa vuota: il campione resta barrato.
 */
function coloreCssInEsa(valore) {
  const testo = String(valore || '').trim().toLowerCase();
  const esa = normalizzaEsa(testo);
  if (esa && testo.startsWith('#')) return esa;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(testo);
  if (!rgb) return '';
  const pezzi = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (pezzi.length < 3 || pezzi.slice(0, 3).some((n) => !Number.isFinite(n))) return '';
  if (pezzi.length > 3 && pezzi[3] === 0) return '';
  return '#' + pezzi.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}

/** Il primo nome di una pila di font, senza virgolette. */
function primaFamiglia(pila) {
  return String(pila || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

function rapportoConVirgola(rapporto) {
  return (Math.round(rapporto * 100) / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ':1';
}

function preferisceMenoMovimento() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* --------------------------------------------------------- lettura tema */

function temaServer() {
  return (ponte.stato && oggetto(ponte.stato.tema)) ? ponte.stato.tema : {};
}

function predefinito() {
  return oggetto(temaServer().predefinito) ? temaServer().predefinito : null;
}

/** Le chiavi dei colori: quelle del generatore condiviso se c'è, altrimenti le dodici del contratto. */
function chiaviColori() {
  const condivise = typeof window !== 'undefined' && window.SBStili && oggetto(window.SBStili.COLORI_TEMA)
    ? Object.keys(window.SBStili.COLORI_TEMA) : null;
  return condivise && condivise.length ? condivise : COLORI.map((c) => c.chiave);
}

function datiColore(chiave) {
  return COLORI.find((c) => c.chiave === chiave) || { chiave, nome: chiave, gruppo: 'Altri' };
}

function coloreDelTema(chiave) {
  return normalizzaEsa(ponte.leggi(RAMO_TEMA + '.colori.' + chiave)) ||
    normalizzaEsa(leggiRamo(predefinito(), 'colori.' + chiave)) || '';
}

/** I dodici colori con il valore attuale della bozza. */
export function coloriTema() {
  return chiaviColori().map((chiave) => {
    const dati = datiColore(chiave);
    return { chiave, nome: dati.nome, gruppo: dati.gruppo, esa: coloreDelTema(chiave) };
  });
}

/* ---------------------------------------------------------------------
   4. Catalogo dei font (quello di server/lib/tema.js, per slot)
   --------------------------------------------------------------------- */

function catalogoPerSlot() {
  return oggetto(temaServer().font) ? temaServer().font : {};
}

/**
 * Le famiglie del catalogo, una volta sola ciascuna, con gli slot in cui
 * compaiono. «Font di sistema» resta fuori: sta in due slot con due
 * ripieghi diversi sotto lo stesso nome, e come `famiglia:` non vorrebbe
 * dire niente (lo si ottiene con un `ruolo:` e lo slot sul sistema).
 */
function catalogoUnico() {
  const famiglie = new Map();
  for (const { ruolo } of RUOLI) {
    const elenco = Array.isArray(catalogoPerSlot()[ruolo]) ? catalogoPerSlot()[ruolo] : [];
    for (const voce of elenco) {
      if (!voce || typeof voce.nome !== 'string' || !voce.nome.trim()) continue;
      if (!Array.isArray(voce.pesi) || !voce.pesi.length) continue;
      const gia = famiglie.get(voce.nome);
      if (gia) {
        if (!gia.slot.includes(ruolo)) gia.slot.push(ruolo);
        continue;
      }
      famiglie.set(voce.nome, {
        nome: voce.nome,
        ripiego: String(voce.ripiego || ''),
        pesi: voce.pesi.slice(),
        categoria: String(voce.categoria || ''),
        slot: [ruolo]
      });
    }
  }
  return Array.from(famiglie.values());
}

/** La voce del catalogo per `famiglia:<nome>` (opzioni.famiglia di SBStili). */
export function voceFamiglia(nome) {
  const cercato = String(nome || '').replace(/^famiglia:/, '');
  const voce = catalogoUnico().find((v) => v.nome === cercato);
  return voce ? { nome: voce.nome, ripiego: voce.ripiego, pesi: voce.pesi.slice(), categoria: voce.categoria } : null;
}

function pilaFamiglia(voce) {
  return "'" + String(voce.nome).replace(/['"\\]/g, '') + "', " + (voce.ripiego || RIPIEGO_GENERICO);
}

/** La famiglia di partenza di uno slot: il suo ripiego è quello che il server mette dietro un font caricato. */
function partenzaDelRuolo(ruolo) {
  const elenco = Array.isArray(catalogoPerSlot()[ruolo]) ? catalogoPerSlot()[ruolo] : [];
  const nome = leggiRamo(predefinito(), 'font.' + ruolo);
  return elenco.find((v) => v && v.nome === nome) || elenco[0] || null;
}

/** Cosa c'è adesso nello slot: { pila, nome, voce } per campioni e scritte. */
function fontDelRuolo(ruolo) {
  const valore = String(ponte.leggi(RAMO_TEMA + '.font.' + ruolo) || '');
  const elenco = Array.isArray(catalogoPerSlot()[ruolo]) ? catalogoPerSlot()[ruolo] : [];
  const partenza = partenzaDelRuolo(ruolo);
  const ripiegoPartenza = (partenza && partenza.ripiego) || RIPIEGO_GENERICO;

  const caricato = /^caricato:([0-9a-f]{16})$/.exec(valore);
  if (caricato) {
    const voce = voceFont(caricato[1]);
    return {
      pila: famigliaCaricato(caricato[1]) + ', ' + ripiegoPartenza,
      nome: voce ? voce.etichetta : 'font caricato',
      voce: null
    };
  }
  const voce = elenco.find((v) => v && v.nome === valore);
  if (voce) {
    return {
      pila: Array.isArray(voce.pesi) && voce.pesi.length ? pilaFamiglia(voce) : (voce.ripiego || RIPIEGO_GENERICO),
      nome: voce.nome,
      voce
    };
  }
  return { pila: partenza ? pilaFamiglia(partenza) : RIPIEGO_GENERICO, nome: valore || '—', voce: partenza };
}

/* ---------------------------------------------------------------------
   5. Libreria dei font caricati

   L'elenco vive nel registro di moduli/tema.js (lo legge anche il campo
   «font» di campi.js). Qui si chiede al server e si tiene il conto di
   quando è stato letto.
   --------------------------------------------------------------------- */

let librerialetta = false;
let letturaInVolo = null;
let ultimoErrore = null;

/** Il blocco `editor.font` di GET /api/contenuti, se il guscio lo espone: evita una richiesta. */
function seminaDalloStato({ sempre = false } = {}) {
  const elenco = ponte.stato && oggetto(ponte.stato.editor) && Array.isArray(ponte.stato.editor.font)
    ? ponte.stato.editor.font : null;
  if (!elenco) return;
  if (!sempre && fontCaricati() !== null) return;
  impostaFontCaricati(elenco);
  librerialetta = true;
  ultimoErrore = null;
}

function spiegaErrore(errore, cosa) {
  if (rottaAssente(errore)) {
    return cosa + ': il server non conosce ancora i font caricati. Probabilmente ne gira una versione precedente: riavvialo aggiornato.';
  }
  const messaggio = errore && errore.message ? errore.message : 'errore imprevisto.';
  return cosa + ': ' + messaggio.charAt(0).toLowerCase() + messaggio.slice(1);
}

/**
 * Legge dal server i font caricati. Non rifiuta mai: in caso di guasto
 * restano quelli già noti e `errore` dice cosa è successo.
 */
export function caricaFont({ forza = false } = {}) {
  seminaDalloStato();
  const risultato = () => ({ catalogo: catalogoUnico(), caricati: fontCaricati() || [], errore: ultimoErrore });

  if (letturaInVolo) return letturaInVolo;
  if (librerialetta && !forza) return Promise.resolve(risultato());
  if (!ponte.api || typeof ponte.api.font !== 'function') {
    ultimoErrore = 'Il pannello non sa ancora leggere i font caricati: ricarica la pagina.';
    return Promise.resolve(risultato());
  }

  letturaInVolo = Promise.resolve()
    .then(() => ponte.api.font())
    .then((risposta) => {
      const elenco = Array.isArray(risposta) ? risposta : (risposta && Array.isArray(risposta.font) ? risposta.font : []);
      impostaFontCaricati(elenco);
      librerialetta = true;
      ultimoErrore = null;
    }, (errore) => {
      ultimoErrore = spiegaErrore(errore, 'Non riesco a leggere i font caricati');
      // Un elenco mai letto resta «sconosciuto» (null) per i campi: meglio
      // che dichiarare spariti dei font che sul server ci sono.
    })
    .then(() => {
      letturaInVolo = null;
      return risultato();
    });
  return letturaInVolo;
}

/** La voce di un font caricato, per `caricato:<id>` (opzioni.font di SBStili). */
export function voceFont(id) {
  seminaDalloStato();
  const cercato = String(id || '').replace(/^caricato:/, '');
  if (!RE_ID_FONT.test(cercato)) return null;
  const voce = (fontCaricati() || []).find((v) => v.id === cercato);
  return voce ? { id: voce.id, etichetta: voce.etichetta, file: voce.file, formato: voce.formato } : null;
}

/* Il registro si riempie appena il modulo arriva, se i contenuti sono già
   stati letti, e di nuovo a ogni accesso: un'altra sessione può aver
   caricato o tolto dei font nel frattempo. */
seminaDalloStato();

/* ---------------------------------------------------------------------
   6. Anteprima dal vivo

   Trascinando la tavolozza arrivano decine di modifiche al secondo: il
   motore si chiama al massimo una volta per fotogramma, e solo se c'è.
   --------------------------------------------------------------------- */

let motoreInArrivo = null;

function prendiMotore() {
  if (!motoreInArrivo) {
    motoreInArrivo = import('./motore.js').then((modulo) => (modulo && modulo.motore) || null, () => null);
  }
  return motoreInArrivo;
}

let temaInCoda = false;

function aggiornaTemaAnteprima() {
  if (temaInCoda) return;
  temaInCoda = true;
  const esegui = () => {
    temaInCoda = false;
    prendiMotore().then((motore) => {
      if (!motore || typeof motore.aggiornaTema !== 'function') return;
      try { motore.aggiornaTema(); } catch (errore) { registra(errore); }
    });
  };
  // In una scheda in secondo piano requestAnimationFrame si ferma: il tema
  // deve arrivare lo stesso quando si torna a guardare.
  if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(esegui);
  else setTimeout(esegui, 60);
}

/* ---------------------------------------------------------------------
   7. Chi deve sapere quando cambiano il tema, gli stili o i font

   Controlli e viste ancora a video si iscrivono qui. Un nodo che è stato
   in pagina e non c'è più si scarta subito; uno mai appeso (creato e
   buttato via senza metterlo da nessuna parte) dopo qualche giro.
   --------------------------------------------------------------------- */

const iscritti = new Set();

function segui(nodo, gestori) {
  iscritti.add({ nodo, gestori, visto: false, mancati: 0 });
}

function avvisa(tipo) {
  for (const voce of Array.from(iscritti)) {
    if (voce.nodo.isConnected) {
      voce.visto = true;
      voce.mancati = 0;
    } else {
      voce.mancati += 1;
      if (voce.visto || voce.mancati > 30) iscritti.delete(voce);
      continue;
    }
    const gestore = voce.gestori[tipo];
    if (typeof gestore !== 'function') continue;
    try { gestore(); } catch (errore) { registra(errore); }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('sb:modifica', (evento) => {
    const chiave = evento && evento.detail ? evento.detail.chiave : undefined;
    const testo = typeof chiave === 'string' ? chiave : '';
    const tutto = !testo || testo === 'config';
    if (tutto || testo === RAMO_TEMA || testo.startsWith(RAMO_TEMA + '.')) {
      avvisa('tema');
      if (vistaAperta()) aggiornaTemaAnteprima();
    }
    if (tutto || testo === 'config.stili' || testo.startsWith('config.stili.')) avvisa('stili');
  });
  /* Su sb:sostituito il registro dei font NON si riprende da stato.editor:
     quel blocco è la fotografia dell'ultimo caricamento dei contenuti, e un
     Annulla dopo aver caricato un font lo farebbe sparire dai menu. */
  document.addEventListener('sb:sostituito', () => {
    avvisa('dati');
    avvisa('tema');
  });
  document.addEventListener('sb:pronto', () => {
    seminaDalloStato({ sempre: true });
    avvisa('dati');
    avvisa('tema');
  });
  suFontCaricati(() => avvisa('font'));
}

/* ---------------------------------------------------------------------
   8. Pezzi comuni dei due controlli
   --------------------------------------------------------------------- */

function opzioneRadio({ nome, valore, classi = '', figli, suScelta, radio }) {
  const id = idUnico('ct');
  const input = el('input', { type: 'radio', classe: 'comando-tema__radio', name: nome, id, value: valore });
  input.addEventListener('change', () => { if (input.checked) suScelta(valore); });
  radio.push(input);
  return el('li', { classe: 'comando-tema__voce' }, [
    input,
    el('label', { classe: 'comando-tema__opzione' + (classi ? ' ' + classi : ''), for: id }, figli)
  ]);
}

/**
 * Lo scheletro chiuso/aperto: una riga con etichetta e bottone, sotto
 * l'aiuto, la nota e le scelte nel flusso (niente finestrelle da
 * posizionare, che nel pannello che scorre andrebbero fuori posto).
 */
function scheletro({ tipo, etichetta, aiuto, aperto, primoFiglio }) {
  const id = idUnico('comando');
  const nome = el('span', { classe: 'comando-tema__nome' });
  const marca = el('span', { classe: 'comando-tema__marca', testo: 'tema', hidden: true });
  const apri = el('button', {
    type: 'button', classe: 'comando-tema__apri', id: id + '-apri',
    'aria-expanded': 'false', 'aria-controls': id + '-scelte'
  }, [primoFiglio, nome, marca, el('span', { classe: 'comando-tema__freccia', 'aria-hidden': 'true' })]);
  const etichettaNodo = el('span', { classe: 'comando-tema__etichetta', id: id + '-et', testo: etichetta });
  const aiutoNodo = aiuto ? el('p', { classe: 'comando-tema__aiuto', id: id + '-aiuto', testo: String(aiuto) }) : null;
  const nota = el('p', { classe: 'comando-tema__nota', id: id + '-nota', hidden: true });
  const scelte = el('div', { classe: 'comando-tema__scelte', id: id + '-scelte', hidden: true });

  const nodo = el('div', {
    classe: 'comando-tema comando-tema--' + tipo, role: 'group', 'aria-labelledby': id + '-et'
  }, [
    el('div', { classe: 'comando-tema__testa' }, [etichettaNodo, apri]),
    aiutoNodo,
    nota,
    scelte
  ]);

  const aggiornaDescrizione = () => {
    const ids = [];
    if (aiutoNodo) ids.push(aiutoNodo.id);
    if (!nota.hidden) ids.push(nota.id);
    if (ids.length) apri.setAttribute('aria-describedby', ids.join(' '));
    else apri.removeAttribute('aria-describedby');
  };

  const scriviNota = (testo, avviso = false) => {
    nota.textContent = testo || '';
    nota.hidden = !testo;
    nota.dataset.tipo = avviso ? 'avviso' : 'collegato';
    aggiornaDescrizione();
  };

  return { nodo, apri, nome, marca, scelte, scriviNota, aperto: Boolean(aperto) };
}

/** Apertura, chiusura ed Esc: uguali per i due controlli. */
function collegaApertura(parti, { primaDiAprire } = {}) {
  const imposta = (aperto) => {
    if (aperto && typeof primaDiAprire === 'function') primaDiAprire();
    parti.scelte.hidden = !aperto;
    parti.apri.setAttribute('aria-expanded', aperto ? 'true' : 'false');
  };
  parti.apri.addEventListener('click', () => imposta(parti.scelte.hidden));
  parti.scelte.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    // Fermato qui: più su, Esc vuol dire «sali al genitore della selezione».
    evento.preventDefault();
    evento.stopPropagation();
    imposta(false);
    parti.apri.focus();
  });
  return imposta;
}

/* ---------------------------------------------------------------------
   9. coloreControllo
   --------------------------------------------------------------------- */

/** Valore in ingresso -> { valore, invalido }. */
function leggiValoreColore(grezzo) {
  if (grezzo === null || grezzo === undefined || grezzo === '') return { valore: null, invalido: false };
  if (typeof grezzo !== 'string') return { valore: null, invalido: true };
  const testo = grezzo.trim();
  if (testo.startsWith('var:')) {
    const chiave = testo.slice(4);
    return chiaviColori().includes(chiave) ? { valore: 'var:' + chiave, invalido: false } : { valore: null, invalido: true };
  }
  // Solo sei cifre: tre o otto il generatore degli stili le scarta, e un
  // controllo che le mostrasse come buone mentirebbe.
  if (RE_COLORE.test(testo)) return { valore: testo.toLowerCase(), invalido: false };
  return { valore: null, invalido: true };
}

/**
 * Controllo del colore di un elemento.
 * @returns {HTMLElement} con leggi(), imposta(v), impostaSegnaposto(css)
 */
export function coloreControllo({
  etichetta = 'Colore', valore = null, alCambio, vuoto = 'Come nel sito',
  aiuto = '', aperto = false, segnaposto = ''
} = {}) {
  const avvisaCambio = typeof alCambio === 'function' ? alCambio : () => {};
  let { valore: attuale, invalido } = leggiValoreColore(valore);
  let sito = String(segnaposto || '');

  const campione = el('span', { classe: 'comando-tema__campione', 'aria-hidden': 'true' });
  const parti = scheletro({ tipo: 'colore', etichetta, aiuto, aperto, primoFiglio: campione });
  const nomeRadio = idUnico('colore');
  const radio = [];
  const puntini = new Map();
  const esaPiccoli = new Map();

  const scegli = (nuovo, da) => {
    invalido = false;
    if (nuovo === attuale) { dipingi(da); return; }
    attuale = nuovo;
    dipingi(da);
    try { avvisaCambio(nuovo); } catch (errore) { registra(errore); }
  };

  /* --- i colori del tema, a gruppi --- */
  const gruppi = [];
  for (const chiave of chiaviColori()) {
    const dati = datiColore(chiave);
    let gruppo = gruppi.find((g) => g.nome === dati.gruppo);
    if (!gruppo) {
      gruppo = { nome: dati.gruppo, voci: [] };
      gruppi.push(gruppo);
    }
    const puntino = el('span', { classe: 'comando-tema__puntino', 'aria-hidden': 'true' });
    const esaPiccolo = el('span', { classe: 'comando-tema__dettaglio' });
    puntini.set(chiave, puntino);
    esaPiccoli.set(chiave, esaPiccolo);
    gruppo.voci.push(opzioneRadio({
      nome: nomeRadio, valore: 'var:' + chiave, radio,
      suScelta: (v) => scegli(v, 'radio'),
      figli: [puntino, el('span', { classe: 'comando-tema__testi' }, [
        el('span', { classe: 'comando-tema__nome-opzione', testo: dati.nome }),
        esaPiccolo
      ])]
    }));
  }

  /* --- colore libero --- */
  const idTavolozza = idUnico('tavolozza');
  const idCasella = idUnico('esa');
  const idErrore = idUnico('esa-err');
  const tavolozza = el('input', {
    type: 'color', classe: 'comando-tema__tavolozza', id: idTavolozza,
    'aria-label': etichetta + ': colore libero dalla tavolozza'
  });
  const casella = el('input', {
    type: 'text', classe: 'campo__input comando-tema__esa', id: idCasella, maxlength: 7,
    spellcheck: 'false', autocomplete: 'off', placeholder: '#rrggbb', 'aria-describedby': idErrore
  });
  const erroreCasella = el('p', {
    classe: 'comando-tema__errore', id: idErrore, hidden: true,
    testo: 'Scrivi il colore con il cancelletto e sei cifre, per esempio #8b2fff.'
  });
  const libero = el('div', { classe: 'comando-tema__libero', dati: { attivo: '0' } }, [
    tavolozza,
    el('label', { classe: 'comando-tema__codice', for: idCasella, testo: 'Codice' }),
    casella
  ]);

  const mostraErroreCasella = (acceso) => {
    erroreCasella.hidden = !acceso;
    if (acceso) casella.setAttribute('aria-invalid', 'true'); else casella.removeAttribute('aria-invalid');
  };

  tavolozza.addEventListener('input', () => scegli(tavolozza.value.toLowerCase(), 'tavolozza'));
  tavolozza.addEventListener('change', () => scegli(tavolozza.value.toLowerCase(), 'tavolozza'));
  /* Mentre si scrive vale solo la forma a sei cifre: la forma corta
     passerebbe per sbaglio a metà di «#8b2…» e il colore sfarfallerebbe.
     Quella corta si accetta quando si esce dalla casella. */
  casella.addEventListener('input', () => {
    const grezzo = casella.value.trim();
    if (/^#?[0-9a-f]{6}$/i.test(grezzo)) {
      mostraErroreCasella(false);
      scegli(normalizzaEsa(grezzo), 'casella');
      return;
    }
    mostraErroreCasella(/[^#0-9a-f]/i.test(grezzo) || grezzo.replace('#', '').length > 6 || grezzo.indexOf('#') > 0);
  });
  casella.addEventListener('change', () => {
    const pulito = normalizzaEsa(casella.value);
    if (pulito) { mostraErroreCasella(false); scegli(pulito, null); return; }
    if (!casella.value.trim()) { mostraErroreCasella(false); dipingi(null); return; }
    mostraErroreCasella(true);
  });

  /* --- «come nel sito» --- */
  const elencoVuoto = el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--sola' }, [
    opzioneRadio({
      nome: nomeRadio, valore: '', radio,
      suScelta: () => scegli(null, 'radio'),
      figli: [
        el('span', { classe: 'comando-tema__puntino is-vuoto', 'aria-hidden': 'true' }),
        el('span', { classe: 'comando-tema__testi' }, [
          el('span', { classe: 'comando-tema__nome-opzione', testo: vuoto }),
          el('span', { classe: 'comando-tema__dettaglio', testo: 'nessuna scelta qui' })
        ])
      ]
    })
  ]);

  parti.scelte.append(
    el('fieldset', { classe: 'comando-tema__insieme' }, [
      el('legend', { classe: 'comando-tema__legenda', testo: 'Colori del tema' }),
      ...gruppi.map((g) => el('div', { classe: 'comando-tema__gruppo' }, [
        el('p', { classe: 'comando-tema__sottotitolo', 'aria-hidden': 'true', testo: g.nome }),
        el('ul', { classe: 'comando-tema__griglia' }, g.voci)
      ]))
    ]),
    el('fieldset', { classe: 'comando-tema__insieme' }, [
      el('legend', { classe: 'comando-tema__legenda', testo: 'Colore libero' }),
      libero,
      erroreCasella,
      el('p', { classe: 'comando-tema__piccola', testo: 'Un colore libero resta fisso: non segue i cambi del tema.' })
    ]),
    el('fieldset', { classe: 'comando-tema__insieme' }, [
      el('legend', { classe: 'sr-only', testo: vuoto }),
      elencoVuoto
    ])
  );

  function dipingi(da) {
    const colori = new Map(chiaviColori().map((chiave) => [chiave, coloreDelTema(chiave)]));
    for (const [chiave, puntino] of puntini) {
      puntino.style.backgroundColor = colori.get(chiave) || '';
      esaPiccoli.get(chiave).textContent = colori.get(chiave) || '—';
    }
    for (const input of radio) {
      input.checked = attuale === null ? (input.value === '' && !invalido) : input.value === attuale;
    }

    const eTema = typeof attuale === 'string' && attuale.startsWith('var:');
    const eLibero = typeof attuale === 'string' && !eTema;
    const chiaveTema = eTema ? attuale.slice(4) : '';
    const esaSito = coloreCssInEsa(sito);
    const mostrato = eTema ? colori.get(chiaveTema) : (eLibero ? attuale : (invalido ? '' : esaSito));

    campione.style.backgroundColor = mostrato || '';
    campione.classList.toggle('is-vuoto', !mostrato);
    parti.marca.hidden = !eTema;

    let testo;
    if (invalido) testo = 'Valore non valido';
    else if (eTema) testo = datiColore(chiaveTema).nome;
    else if (eLibero) testo = attuale;
    else testo = vuoto + (esaSito ? ' · ' + esaSito : '');
    parti.nome.textContent = testo;
    parti.apri.setAttribute('aria-label', etichetta + ': ' +
      (eTema ? 'colore del tema ' + testo + ', ' + (colori.get(chiaveTema) || '') : (eLibero ? 'colore libero ' + testo : testo)));

    libero.dataset.attivo = eLibero ? '1' : '0';
    const perTavolozza = eLibero ? attuale : (mostrato || '');
    if (da !== 'tavolozza' && RE_COLORE.test(perTavolozza)) tavolozza.value = perTavolozza;
    if (da !== 'casella' && document.activeElement !== casella) casella.value = eLibero ? attuale : '';

    if (eTema) {
      const nome = datiColore(chiaveTema).nome;
      parti.scriviNota('Collegato al colore del tema «' + nome + '»: se lo cambi nelle Impostazioni del sito, cambia anche qui.');
    } else if (invalido) {
      parti.scriviNota('Il colore salvato qui non è valido: scegline uno.', true);
    } else {
      parti.scriviNota('');
    }
  }

  const imposta = collegaApertura(parti, { primaDiAprire: () => dipingi('apertura') });

  parti.nodo.leggi = () => attuale;
  parti.nodo.imposta = (nuovo) => {
    ({ valore: attuale, invalido } = leggiValoreColore(nuovo));
    mostraErroreCasella(false);
    dipingi(null);
  };
  parti.nodo.impostaSegnaposto = (css) => {
    sito = String(css || '');
    dipingi('segnaposto');
  };

  dipingi(null);
  if (parti.aperto) imposta(true);
  segui(parti.nodo, { tema: () => dipingi('tema'), dati: () => dipingi('tema') });
  return parti.nodo;
}

/* ---------------------------------------------------------------------
   10. fontControllo
   --------------------------------------------------------------------- */

const RE_VALORE_FONT = /^(ruolo:(titolo|testo|mono)|famiglia:[A-Za-z0-9 ]{1,60}|caricato:[0-9a-f]{16})$/;

function leggiValoreFont(grezzo) {
  if (grezzo === null || grezzo === undefined || grezzo === '') return { valore: null, invalido: false };
  if (typeof grezzo !== 'string') return { valore: null, invalido: true };
  const testo = grezzo.trim();
  return RE_VALORE_FONT.test(testo) ? { valore: testo, invalido: false } : { valore: null, invalido: true };
}

/**
 * Controllo del font di un elemento.
 * @returns {HTMLElement} con leggi(), imposta(v), impostaSegnaposto(fontFamily)
 */
export function fontControllo({
  etichetta = 'Font', valore = null, alCambio, vuoto = 'Come nel sito',
  aiuto = '', aperto = false, esempio = '', segnaposto = ''
} = {}) {
  const avvisaCambio = typeof alCambio === 'function' ? alCambio : () => {};
  let { valore: attuale, invalido } = leggiValoreFont(valore);
  let sito = String(segnaposto || '');
  const testoEsempio = String(esempio || ESEMPIO_FONT);

  const aa = el('span', { classe: 'comando-tema__aa', 'aria-hidden': 'true', testo: 'Aa' });
  const parti = scheletro({ tipo: 'font', etichetta, aiuto, aperto, primoFiglio: aa });
  const nomeRadio = idUnico('font');
  let radio = [];
  let opzioniDaRifare = true;
  let anteprimeChieste = false;

  const scegli = (nuovo) => {
    invalido = false;
    if (nuovo === attuale) { dipingiTesta(); segnaScelta(); return; }
    attuale = nuovo;
    dipingiTesta();
    segnaScelta();
    try { avvisaCambio(nuovo); } catch (errore) { registra(errore); }
  };

  const statoLibreria = el('p', { classe: 'comando-tema__stato', role: 'status', 'aria-live': 'polite' });

  const campioneFont = (pila) => {
    const nodo = el('span', { classe: 'comando-tema__esempio', testo: testoEsempio });
    nodo.style.fontFamily = pila;
    return nodo;
  };

  const voceFontOpzione = ({ valore: valoreOpzione, nome, dettaglio, pila, avviso }) => opzioneRadio({
    nome: nomeRadio, valore: valoreOpzione, radio,
    classi: 'comando-tema__opzione--font' + (avviso ? ' is-avviso' : ''),
    suScelta: (v) => scegli(v === '' ? null : v),
    figli: [
      el('span', { classe: 'comando-tema__riga-opzione' }, [
        el('span', { classe: 'comando-tema__nome-opzione', testo: nome }),
        dettaglio ? el('span', { classe: 'comando-tema__dettaglio', testo: dettaglio }) : null
      ]),
      pila ? campioneFont(pila) : null
    ]
  });

  function rifaiOpzioni() {
    const valoreFuoco = radio.includes(document.activeElement) ? document.activeElement.value : null;
    radio = [];
    svuota(parti.scelte);

    /* Font del tema: i tre slot, scritti col font che hanno adesso. */
    const delTema = RUOLI.map(({ ruolo, nome }) => {
      const adesso = fontDelRuolo(ruolo);
      return voceFontOpzione({ valore: 'ruolo:' + ruolo, nome, dettaglio: 'adesso: ' + adesso.nome, pila: adesso.pila });
    });

    /* Catalogo: ogni famiglia sotto il primo slot in cui compare. */
    const catalogo = catalogoUnico();
    const blocchiCatalogo = [];
    for (const { ruolo, catalogo: titolo } of RUOLI) {
      const voci = catalogo.filter((v) => v.slot[0] === ruolo);
      if (!voci.length) continue;
      blocchiCatalogo.push(el('div', { classe: 'comando-tema__gruppo' }, [
        el('p', { classe: 'comando-tema__sottotitolo', 'aria-hidden': 'true', testo: titolo }),
        el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--font' }, voci.map((voce) => voceFontOpzione({
          valore: 'famiglia:' + voce.nome, nome: voce.nome, dettaglio: voce.categoria, pila: pilaFamiglia(voce)
        })))
      ]));
    }
    const nomeFamiglia = typeof attuale === 'string' && attuale.startsWith('famiglia:') ? attuale.slice(9) : '';
    if (nomeFamiglia && catalogo.length && !catalogo.some((v) => v.nome === nomeFamiglia)) {
      blocchiCatalogo.push(el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--font' }, [
        voceFontOpzione({ valore: attuale, nome: nomeFamiglia, dettaglio: 'non è nel catalogo', avviso: true })
      ]));
    }
    if (!blocchiCatalogo.length) {
      blocchiCatalogo.push(el('p', { classe: 'comando-tema__piccola', testo: 'Il server non ha mandato il catalogo dei font.' }));
    }

    /* Caricati da chi amministra. */
    const caricati = fontCaricati();
    const bloccoCaricati = [];
    if (caricati && caricati.length) {
      bloccoCaricati.push(el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--font' }, caricati.map((voce) => voceFontOpzione({
        valore: 'caricato:' + voce.id, nome: voce.etichetta,
        dettaglio: String(voce.formato || '').toUpperCase(),
        pila: famigliaCaricato(voce.id) + ', ' + RIPIEGO_GENERICO
      }))));
    } else if (caricati) {
      bloccoCaricati.push(el('p', { classe: 'comando-tema__piccola', testo: 'Nessun font caricato. Si aggiungono dalle Impostazioni del sito, nella parte Font.' }));
    }
    const idCaricato = typeof attuale === 'string' && attuale.startsWith('caricato:') ? attuale.slice(9) : '';
    if (idCaricato && caricati && !caricati.some((v) => v.id === idCaricato)) {
      bloccoCaricati.push(el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--font' }, [
        voceFontOpzione({ valore: attuale, nome: 'Font caricato', dettaglio: 'non c\'è più', avviso: true })
      ]));
    }

    parti.scelte.append(
      el('fieldset', { classe: 'comando-tema__insieme' }, [
        el('legend', { classe: 'comando-tema__legenda', testo: 'Font del tema' }),
        el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--font' }, delTema)
      ]),
      el('fieldset', { classe: 'comando-tema__insieme' }, [
        el('legend', { classe: 'comando-tema__legenda', testo: 'Catalogo' }),
        ...blocchiCatalogo,
        el('p', { classe: 'comando-tema__piccola', testo: 'Una famiglia del catalogo resta fissa: non segue i cambi del tema.' })
      ]),
      el('fieldset', { classe: 'comando-tema__insieme' }, [
        el('legend', { classe: 'comando-tema__legenda', testo: 'Caricati da te' }),
        statoLibreria,
        ...bloccoCaricati
      ]),
      el('fieldset', { classe: 'comando-tema__insieme' }, [
        el('legend', { classe: 'sr-only', testo: vuoto }),
        el('ul', { classe: 'comando-tema__griglia comando-tema__griglia--sola' }, [
          voceFontOpzione({ valore: '', nome: vuoto, dettaglio: 'nessuna scelta qui' })
        ])
      ])
    );

    opzioniDaRifare = false;
    segnaScelta();
    if (valoreFuoco !== null) {
      const stesso = radio.find((input) => input.value === valoreFuoco);
      if (stesso) stesso.focus();
    }
  }

  function segnaScelta() {
    for (const input of radio) {
      input.checked = attuale === null ? (input.value === '' && !invalido) : input.value === attuale;
    }
  }

  function dipingiTesta() {
    let testo = vuoto;
    let pila = '';
    let nota = '';
    let avviso = false;

    if (invalido) {
      testo = 'Valore non valido';
      nota = 'Il font salvato qui non è valido: scegline uno.';
      avviso = true;
    } else if (typeof attuale === 'string' && attuale.startsWith('ruolo:')) {
      const ruolo = RUOLI.find((r) => r.ruolo === attuale.slice(6));
      const adesso = fontDelRuolo(ruolo.ruolo);
      testo = ruolo.nome + ' · ' + adesso.nome;
      pila = adesso.pila;
      if (adesso.voce) precaricaFont([adesso.voce]);
      nota = 'Collegato al font «' + ruolo.nome + '» del tema: se lo cambi nelle Impostazioni del sito, cambia anche qui.';
    } else if (typeof attuale === 'string' && attuale.startsWith('famiglia:')) {
      const voce = voceFamiglia(attuale.slice(9));
      testo = attuale.slice(9);
      if (voce) {
        pila = pilaFamiglia(voce);
        precaricaFont([voce]);
      } else if (catalogoUnico().length) {
        nota = 'La famiglia «' + testo + '» non è nel catalogo: sul sito resta il font previsto. Scegline un\'altra.';
        avviso = true;
      }
    } else if (typeof attuale === 'string' && attuale.startsWith('caricato:')) {
      const voce = voceFont(attuale.slice(9));
      testo = voce ? voce.etichetta : 'Font caricato';
      pila = famigliaCaricato(attuale.slice(9)) + ', ' + RIPIEGO_GENERICO;
      if (!voce && fontCaricati() !== null) {
        nota = 'Il font caricato scelto qui non c\'è più: sul sito resta il font previsto. Scegline un altro.';
        avviso = true;
      }
    } else if (sito) {
      testo = vuoto + ' · ' + primaFamiglia(sito);
      pila = sito;
    }

    parti.nome.textContent = testo;
    aa.style.fontFamily = pila;
    parti.marca.hidden = !(typeof attuale === 'string' && attuale.startsWith('ruolo:')) || invalido;
    parti.apri.setAttribute('aria-label', etichetta + ': ' + testo);
    parti.scriviNota(nota, avviso);
  }

  const aggiornaStatoLibreria = (esito) => {
    statoLibreria.textContent = esito && esito.errore ? esito.errore : '';
    statoLibreria.hidden = !statoLibreria.textContent;
  };

  const imposta = collegaApertura(parti, {
    primaDiAprire: () => {
      if (!anteprimeChieste) {
        anteprimeChieste = true;
        precaricaFont(catalogoUnico());
        precaricaFont(RUOLI.map((r) => fontDelRuolo(r.ruolo).voce).filter(Boolean));
      }
      if (opzioniDaRifare) rifaiOpzioni();
      if (fontCaricati() === null) {
        statoLibreria.textContent = 'Sto leggendo i font caricati…';
        statoLibreria.hidden = false;
      }
      caricaFont().then((esito) => {
        aggiornaStatoLibreria(esito);
        if (!parti.scelte.hidden && opzioniDaRifare) rifaiOpzioni();
      });
    }
  });

  /** Tema o libreria cambiati: la testa subito, le scelte solo se si vedono. */
  const cambiato = () => {
    dipingiTesta();
    opzioniDaRifare = true;
    if (!parti.scelte.hidden) rifaiOpzioni();
  };

  parti.nodo.leggi = () => attuale;
  parti.nodo.imposta = (nuovo) => {
    ({ valore: attuale, invalido } = leggiValoreFont(nuovo));
    dipingiTesta();
    // Un valore fuori elenco si mostra fra le scelte solo se c'è la sua voce.
    opzioniDaRifare = true;
    if (!parti.scelte.hidden) rifaiOpzioni();
  };
  parti.nodo.impostaSegnaposto = (pila) => {
    sito = String(pila || '');
    dipingiTesta();
  };

  statoLibreria.hidden = true;
  dipingiTesta();
  if (parti.aperto) imposta(true);
  segui(parti.nodo, { tema: cambiato, dati: cambiato, font: cambiato });
  return parti.nodo;
}

/* ---------------------------------------------------------------------
   11. La vista «Impostazioni del sito»
   --------------------------------------------------------------------- */

const montate = new Set();

function vistaAperta() {
  for (const radice of Array.from(montate)) {
    if (radice.isConnected) return true;
  }
  return false;
}

/** «config.tema» dai campi del gruppo: si applica un preset senza sapere a mano dove vive il tema. */
function prefissoDelGruppo(gruppo) {
  const chiavi = ((gruppo && gruppo.campi) || []).map((c) => String(c.chiave || '')).filter(Boolean);
  if (!chiavi.length) return '';
  let comune = chiavi[0].split('.');
  for (const chiave of chiavi.slice(1)) {
    const pezzi = chiave.split('.');
    let quanti = 0;
    while (quanti < comune.length && quanti < pezzi.length && comune[quanti] === pezzi[quanti]) quanti += 1;
    comune = comune.slice(0, quanti);
  }
  if (comune.join('.') === chiavi[0]) comune.pop();
  return comune.join('.');
}

/** Il contenitore che scorre davvero: scrollIntoView farebbe salire anche l'editor intero. */
function scatolaCheScorre(nodo) {
  for (let genitore = nodo.parentElement; genitore && genitore !== document.body; genitore = genitore.parentElement) {
    const scorrimento = getComputedStyle(genitore).overflowY;
    if ((scorrimento === 'auto' || scorrimento === 'scroll') && genitore.scrollHeight > genitore.clientHeight) return genitore;
  }
  return null;
}

function saltaA(sezione) {
  const titolo = sezione.querySelector('.imp__titolo');
  const scatola = scatolaCheScorre(sezione);
  if (scatola) {
    const alto = scatola.scrollTop + sezione.getBoundingClientRect().top - scatola.getBoundingClientRect().top - 8;
    scatola.scrollTo({ top: Math.max(0, Math.round(alto)), behavior: preferisceMenoMovimento() ? 'auto' : 'smooth' });
  }
  if (titolo) titolo.focus({ preventScroll: true });
}

/* ------------------------------------------------------------ uso font */

function campiFontDelloSchema() {
  const gruppi = ponte.stato && ponte.stato.schema && Array.isArray(ponte.stato.schema.gruppi) ? ponte.stato.schema.gruppi : [];
  const fuori = [];
  for (const gruppo of gruppi) {
    for (const campo of gruppo.campi || []) {
      if (campo && campo.tipo === 'font' && campo.chiave) fuori.push(campo);
    }
  }
  return fuori;
}

/** Dove la bozza usa un font caricato, a parole. */
function usiNellaBozza(id) {
  const valore = 'caricato:' + id;
  const usi = [];
  for (const campo of campiFontDelloSchema()) {
    if (ponte.leggi(campo.chiave) === valore) usi.push(campo.etichetta || campo.chiave);
  }
  const stili = ponte.leggi('config.stili');
  if (oggetto(stili)) {
    let elementi = 0;
    for (const voce of Object.values(stili)) {
      if (!oggetto(voce)) continue;
      if (Object.values(voce).some((dispositivo) => oggetto(dispositivo) && dispositivo.font === valore)) elementi += 1;
    }
    if (elementi === 1) usi.push('lo stile di un elemento');
    else if (elementi > 1) usi.push('lo stile di ' + elementi + ' elementi');
  }
  return usi;
}

/**
 * Dopo l'eliminazione di un font: gli slot che lo usavano tornano al font
 * di partenza, e le scelte di stile che lo nominavano si tolgono. Senza, il
 * salvataggio successivo verrebbe corretto dal server di nascosto (slot) o
 * porterebbe in giro un valore che non disegna niente (stili).
 */
function togliDallaBozza(id) {
  const valore = 'caricato:' + id;
  const fatti = [];

  for (const campo of campiFontDelloSchema()) {
    if (ponte.leggi(campo.chiave) !== valore) continue;
    const relativo = campo.chiave.startsWith(RAMO_TEMA + '.') ? campo.chiave.slice(RAMO_TEMA.length + 1) : '';
    let sostituto = relativo ? leggiRamo(predefinito(), relativo) : undefined;
    if (typeof sostituto !== 'string' || sostituto.startsWith('caricato:')) {
      const slot = String(campo.slot || campo.chiave.split('.').pop());
      const elenco = Array.isArray(catalogoPerSlot()[slot]) ? catalogoPerSlot()[slot] : [];
      sostituto = elenco[0] ? elenco[0].nome : undefined;
    }
    if (typeof sostituto !== 'string') continue;
    ponte.scrivi(campo.chiave, sostituto);
    fatti.push((campo.etichetta || campo.chiave) + ' torna a ' + sostituto);
  }

  const stili = ponte.leggi('config.stili');
  if (oggetto(stili)) {
    let tolti = 0;
    for (const bersaglio of Object.keys(stili)) {
      const voce = stili[bersaglio];
      if (!oggetto(voce)) continue;
      let toccato = false;
      for (const dispositivo of Object.keys(voce)) {
        const proprieta = voce[dispositivo];
        if (!oggetto(proprieta) || proprieta.font !== valore) continue;
        delete proprieta.font;
        toccato = true;
        if (!Object.keys(proprieta).length) delete voce[dispositivo];
      }
      if (toccato) tolti += 1;
      if (!Object.keys(voce).length) delete stili[bersaglio];
    }
    if (tolti) {
      ponte.segnala('config.stili');
      fatti.push(tolti === 1 ? 'un elemento torna al suo font' : tolti + ' elementi tornano al loro font');
    }
  }
  return fatti;
}

/* ---------------------------------------------------------- libreria */

function creaLibreriaFont() {
  const idTitolo = idUnico('libreria');
  const stato = el('p', { classe: 'libreria-font__stato', role: 'status', 'aria-live': 'polite', hidden: true });
  const elenco = el('ul', { classe: 'libreria-font__elenco', 'aria-labelledby': idTitolo });

  const scriviStato = (testo, tipo = 'info') => {
    stato.textContent = testo || '';
    stato.dataset.tipo = tipo;
    stato.hidden = !testo;
  };

  /* --- caricamento --- */
  const idFile = idUnico('font-file');
  const idEtichetta = idUnico('font-etichetta');
  const inputFile = el('input', {
    type: 'file', id: idFile, classe: 'libreria-font__file', tabindex: '-1', 'aria-hidden': 'true',
    accept: '.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf'
  });
  const inputEtichetta = el('input', {
    type: 'text', id: idEtichetta, classe: 'campo__input', maxlength: 60,
    autocomplete: 'off', spellcheck: 'false', placeholder: 'Il nome che vedrai nei menu'
  });
  const scelto = el('span', { classe: 'libreria-font__scelto', testo: 'Nessun file scelto' });
  let fileScelto = null;
  let occupato = false;

  const btnScegli = bottone({ testo: 'Scegli un file', ico: 'piu', classe: 'btn', su: () => { if (!occupato) inputFile.click(); } });
  const btnCarica = bottone({ testo: 'Carica il font', ico: 'salva', classe: 'btn btn--primario', disabilitato: true, su: () => carica() });
  btnCarica.dataset.azione = 'carica-font';

  const scegliFile = (file) => {
    if (!file) return;
    if (!RE_ESTENSIONE_FONT.test(file.name || '')) {
      scriviStato('«' + file.name + '» non sembra un font: vanno bene solo file WOFF2, WOFF, TTF oppure OTF.', 'errore');
      return;
    }
    if (file.size > MAX_BYTE_FONT) {
      scriviStato('«' + file.name + '» pesa ' + formattaPeso(file.size) + ': il limite è 2 MB. La versione WOFF2 dello stesso font di solito pesa molto meno.', 'errore');
      return;
    }
    fileScelto = file;
    scelto.textContent = file.name + ' · ' + formattaPeso(file.size);
    // Il nome proposto si riscrive a ogni file finché chi amministra non
    // lo tocca: dopo, è una sua scelta e resta.
    if (!inputEtichetta.value.trim() || inputEtichetta.dataset.proposto === '1') {
      inputEtichetta.value = file.name.replace(RE_ESTENSIONE_FONT, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      inputEtichetta.dataset.proposto = '1';
    }
    btnCarica.disabled = false;
    scriviStato('');
  };

  inputEtichetta.addEventListener('input', () => { inputEtichetta.dataset.proposto = '0'; });
  inputFile.addEventListener('change', () => {
    const file = inputFile.files && inputFile.files[0];
    inputFile.value = '';
    scegliFile(file);
  });

  const zona = el('div', { classe: 'libreria-font__carica', dati: { sopra: '0' } }, [
    el('p', { classe: 'libreria-font__invito', testo: 'Trascina qui un file font, oppure sceglilo dal computer.' }),
    el('div', { classe: 'libreria-font__riga' }, [btnScegli, scelto, inputFile]),
    el('div', { classe: 'libreria-font__riga libreria-font__riga--etichetta' }, [
      el('label', { classe: 'libreria-font__codice', for: idEtichetta, testo: 'Nome' }),
      inputEtichetta,
      btnCarica
    ]),
    el('p', {
      classe: 'libreria-font__piccola',
      testo: 'WOFF2, WOFF, TTF o OTF, al massimo 2 MB. Usa solo font che hai il diritto di mettere su un sito (le licenze libere come la SIL Open Font License vanno bene).'
    })
  ]);
  for (const nome of ['dragenter', 'dragover']) {
    zona.addEventListener(nome, (evento) => { evento.preventDefault(); zona.dataset.sopra = '1'; });
  }
  for (const nome of ['dragleave', 'drop']) {
    zona.addEventListener(nome, (evento) => { evento.preventDefault(); zona.dataset.sopra = '0'; });
  }
  zona.addEventListener('drop', (evento) => {
    const file = evento.dataTransfer && evento.dataTransfer.files ? evento.dataTransfer.files[0] : null;
    if (file) scegliFile(file);
  });

  async function carica() {
    if (!fileScelto || occupato) return;
    if (!ponte.api || typeof ponte.api.caricaFont !== 'function') {
      scriviStato('Il pannello non sa ancora caricare font: ricarica la pagina.', 'errore');
      return;
    }
    occupato = true;
    btnCarica.disabled = true;
    const nomeFile = fileScelto.name;
    const attesa = ponte.avviso('Carico «' + nomeFile + '»…', { tipo: 'attesa' });
    scriviStato('Sto caricando «' + nomeFile + '»…');
    try {
      const voce = await ponte.api.caricaFont(fileScelto, inputEtichetta.value.trim());
      const elencoNuovo = (fontCaricati() || []).filter((v) => !voce || v.id !== voce.id);
      if (voce && typeof voce === 'object') elencoNuovo.push(voce);
      impostaFontCaricati(elencoNuovo);
      librerialetta = true;
      const nome = voce && voce.etichetta ? voce.etichetta : nomeFile;
      attesa.riuscito('Font «' + nome + '» caricato: adesso lo trovi nei menu dei font. Il sito non cambia finché non lo scegli e salvi.');
      fileScelto = null;
      scelto.textContent = 'Nessun file scelto';
      inputEtichetta.value = '';
      inputEtichetta.dataset.proposto = '0';
      scriviStato('');
    } catch (errore) {
      const messaggio = spiegaErrore(errore, 'Il font non è stato caricato');
      attesa.fallito(messaggio);
      scriviStato(messaggio, 'errore');
    } finally {
      occupato = false;
      btnCarica.disabled = !fileScelto;
    }
  }

  /* --- eliminazione --- */
  const elencoUsi = (usi) => el('ul', { classe: 'dialogo__elenco' }, usi.map((uso) => el('li', { testo: uso })));

  async function elimina(voce) {
    if (!ponte.api || typeof ponte.api.eliminaFont !== 'function') {
      scriviStato('Il pannello non sa ancora eliminare font: ricarica la pagina.', 'errore');
      return;
    }
    const usi = usiNellaBozza(voce.id);
    let forza = false;
    if (usi.length) {
      const ok = await ponte.conferma({
        titolo: 'Elimino un font che stai usando?',
        testo: [
          '«' + voce.etichetta + '» è in uso nella bozza:',
          'Se lo elimini, lì torna il font di partenza. Il file viene cancellato dal server e non si recupera.'
        ],
        dettagli: elencoUsi(usi),
        conferma: 'Elimina lo stesso',
        pericolo: true
      });
      if (!ok) return;
      forza = true;
    } else {
      const ok = await ponte.conferma({
        titolo: 'Elimino questo font?',
        testo: ['Il file di «' + voce.etichetta + '» viene cancellato dal server e non si recupera: se ti serve di nuovo, andrà ricaricato.'],
        conferma: 'Elimina',
        pericolo: true
      });
      if (!ok) return;
    }

    const attesa = ponte.avviso('Elimino «' + voce.etichetta + '»…', { tipo: 'attesa' });
    try {
      await ponte.api.eliminaFont(voce.id, { forza });
    } catch (errore) {
      if (errore instanceof ErroreApi && errore.stato === 409 && !forza) {
        // La bozza non lo usa, ma la versione salvata sì: lo dice il server.
        attesa.chiudi();
        const usatoIn = errore.dati && Array.isArray(errore.dati.usatoIn) ? errore.dati.usatoIn.map(String) : [];
        const ok = await ponte.conferma({
          titolo: 'Il font è usato nella versione salvata',
          testo: [
            'La bozza non usa più «' + voce.etichetta + '», ma la versione salvata sì' + (usatoIn.length ? ':' : '.'),
            'Se lo elimini, al prossimo salvataggio lì torna il font di partenza.'
          ],
          dettagli: usatoIn.length ? elencoUsi(usatoIn) : null,
          conferma: 'Elimina lo stesso',
          pericolo: true
        });
        if (!ok) return;
        return eliminaForzando(voce);
      }
      if (errore instanceof ErroreApi && errore.stato === 404) {
        // Già sparito (un'altra scheda, un'altra sessione): si allinea il pannello.
        attesa.aggiorna('«' + voce.etichetta + '» sul server non c\'era già più: l\'ho tolto anche da qui.', { tipo: 'info' });
        dopoEliminazione(voce, null);
        return;
      }
      attesa.fallito(spiegaErrore(errore, 'Il font non è stato eliminato'));
      return;
    }
    dopoEliminazione(voce, attesa);
  }

  async function eliminaForzando(voce) {
    const attesa = ponte.avviso('Elimino «' + voce.etichetta + '»…', { tipo: 'attesa' });
    try {
      await ponte.api.eliminaFont(voce.id, { forza: true });
    } catch (errore) {
      attesa.fallito(spiegaErrore(errore, 'Il font non è stato eliminato'));
      return;
    }
    dopoEliminazione(voce, attesa);
  }

  function dopoEliminazione(voce, attesa) {
    const fatti = togliDallaBozza(voce.id);
    impostaFontCaricati((fontCaricati() || []).filter((v) => v.id !== voce.id));
    if (attesa) {
      attesa.riuscito('Font «' + voce.etichetta + '» eliminato.' +
        (fatti.length ? ' ' + fatti.join('; ') + ': sono modifiche non salvate.' : ''));
    }
    // Il bottone premuto non esiste più: il fuoco va su qualcosa di vicino.
    btnScegli.focus();
  }

  /* --- elenco ---
     Si ridisegna a ogni cambio del tema o degli stili, che mentre si
     trascina la tavolozza vuol dire decine di volte al secondo: se niente
     di quello che l'elenco mostra è cambiato, non si tocca. */
  let firmaElenco = null;

  function dipingiElenco() {
    const voci = fontCaricati();
    const firma = JSON.stringify([
      voci === null ? ultimoErrore : null,
      voci === null ? null : voci.map((v) => [v.id, v.etichetta, v.formato, v.caricatoIl, usiNellaBozza(v.id)])
    ]);
    if (firma === firmaElenco) return;
    firmaElenco = firma;

    const fuocoSu = elenco.contains(document.activeElement) && document.activeElement.dataset
      ? document.activeElement.dataset.font : null;
    svuota(elenco);
    if (voci === null) {
      elenco.append(el('li', {
        classe: 'libreria-font__vuoto',
        testo: ultimoErrore ? 'L\'elenco non è disponibile finché il server non risponde.' : 'Sto leggendo i font caricati…'
      }));
      return;
    }
    if (!voci.length) {
      elenco.append(el('li', { classe: 'libreria-font__vuoto', testo: 'Non hai ancora caricato font tuoi. Quando ne carichi uno compare qui e nei menu dei font, del tema e della scheda Stile.' }));
      return;
    }
    for (const voce of voci) {
      const campione = el('p', { classe: 'libreria-font__campione', testo: voce.etichetta });
      campione.style.fontFamily = famigliaCaricato(voce.id) + ', ' + RIPIEGO_GENERICO;
      const usi = usiNellaBozza(voce.id);
      const quando = voce.caricatoIl ? ' · caricato il ' + formattaData(voce.caricatoIl) : '';
      const btnElimina = bottone({
        testo: 'Elimina', ico: 'cestino', classe: 'btn btn--pericolo btn--minimo',
        titolo: 'Elimina il font ' + voce.etichetta, dati: { font: voce.id, azione: 'elimina-font' },
        su: () => elimina(voce)
      });
      btnElimina.setAttribute('aria-label', 'Elimina il font ' + voce.etichetta);
      elenco.append(el('li', { classe: 'libreria-font__voce', dati: { id: voce.id } }, [
        el('div', { classe: 'libreria-font__corpo' }, [
          campione,
          el('p', { classe: 'libreria-font__meta', testo: String(voce.formato || '').toUpperCase() + quando }),
          el('p', {
            classe: 'libreria-font__uso', dati: { inUso: usi.length ? '1' : '0' },
            testo: usi.length ? 'In uso: ' + usi.join(', ') : 'Non usato nella bozza'
          })
        ]),
        btnElimina
      ]));
      if (fuocoSu === voce.id) btnElimina.focus();
    }
  }

  const nodo = el('div', { classe: 'libreria-font', role: 'group', 'aria-labelledby': idTitolo }, [
    el('div', { classe: 'libreria-font__testa' }, [
      el('h4', { classe: 'libreria-font__titolo', id: idTitolo, testo: 'Font caricati da te' }),
      el('p', { classe: 'libreria-font__nota', testo: 'Stanno sul tuo server, non su Google. Una volta caricati si scelgono qui sopra per il tema, o nella scheda Stile per un elemento solo.' })
    ]),
    zona,
    stato,
    elenco
  ]);

  dipingiElenco();
  caricaFont().then((esito) => {
    if (esito.errore) scriviStato(esito.errore, 'errore');
    dipingiElenco();
  });
  segui(nodo, { font: dipingiElenco, tema: dipingiElenco, stili: dipingiElenco, dati: dipingiElenco });
  return nodo;
}

/* ---------------------------------------------------------- contrasti */

function creaRiepilogoContrasti() {
  const righe = el('ul', { classe: 'contrasti__elenco' });
  const esito = el('p', { classe: 'contrasti__esito', role: 'status', 'aria-live': 'polite' });
  let ultimoGiudizio = null;

  const dipingi = () => {
    const fondo = coloreDelTema('fondo');
    svuota(righe);
    const gravi = [];
    for (const coppia of COPPIE_CONTRASTO) {
      const colore = coloreDelTema(coppia.chiave);
      if (!colore || !fondo) continue;
      const rapporto = contrasto(colore, fondo);
      const giudizio = etichettaContrasto(rapporto);
      if (giudizio.grave) gravi.push(coppia.nome);
      const prova = el('span', { classe: 'contrasti__prova', 'aria-hidden': 'true', testo: 'Aa' });
      prova.style.color = colore;
      prova.style.backgroundColor = fondo;
      righe.append(el('li', { classe: 'contrasti__voce', dati: { grave: giudizio.grave ? '1' : '0' } }, [
        prova,
        el('span', { classe: 'contrasti__nome', testo: coppia.nome }),
        el('span', { classe: 'contrasti__rapporto', testo: rapportoConVirgola(rapporto) }),
        el('span', { classe: 'contrasti__livello', testo: giudizio.livello })
      ]));
    }
    // La zona che parla cambia solo quando cambia il verdetto: trascinando
    // la tavolozza un lettore di schermo non deve ripetere numeri a raffica.
    const giudizio = gravi.join('|');
    if (giudizio === ultimoGiudizio) return;
    ultimoGiudizio = giudizio;
    esito.dataset.grave = gravi.length ? '1' : '0';
    esito.textContent = gravi.length
      ? 'Sotto 4,5:1 sul fondo: ' + gravi.join(', ') + '. Il testo piccolo si legge male, soprattutto al telefono.'
      : 'Tutti i colori del testo stanno almeno a 4,5:1 sul fondo.';
  };

  const nodo = el('div', { classe: 'contrasti' }, [
    el('p', { classe: 'contrasti__titolo', testo: 'Si legge?' }),
    righe,
    esito
  ]);
  dipingi();
  segui(nodo, { tema: dipingi, dati: dipingi });
  return nodo;
}

/* ---------------------------------------------------------- disegno */

function sezione(id, titolo, figli, nota = '') {
  return el('section', { classe: 'imp__sezione', id, 'aria-labelledby': id + '-titolo' }, [
    el('h3', { classe: 'imp__titolo', id: id + '-titolo', tabindex: '-1', testo: titolo }),
    nota ? el('p', { classe: 'imp__nota', testo: nota }) : null,
    ...figli
  ]);
}

function campiDisegnati(campi) {
  const nodi = [];
  for (const campo of campi) {
    const controllo = ponte.creaCampo(campo);
    if (controllo && controllo.nodo) nodi.push(controllo.nodo);
  }
  return nodi;
}

/** Applica un preset o il tema di partenza: una sola scrittura di config.tema. */
function applicaTema(radice, gruppo, scelto, info) {
  const tema = oggetto(scelto) && oggetto(scelto.tema) ? scelto.tema : scelto;
  const prefisso = prefissoDelGruppo(gruppo);
  if (!oggetto(tema) || !prefisso) return;

  const attuale = ponte.leggi(prefisso);
  const nuovo = oggetto(attuale) ? clona(attuale) : {};
  let trovati = 0;
  let cambiati = 0;
  for (const campo of gruppo.campi || []) {
    const chiave = String(campo.chiave || '');
    if (!chiave.startsWith(prefisso + '.')) continue;
    const relativo = chiave.slice(prefisso.length + 1);
    const valore = leggiRamo(tema, relativo);
    if (valore === undefined) continue;
    trovati += 1;
    if (uguali(leggiRamo(nuovo, relativo), valore)) continue;
    scriviRamo(nuovo, relativo, clona(valore));
    cambiati += 1;
  }

  if (!trovati) {
    ponte.avviso('Questa combinazione non corrisponde ai campi dell\'aspetto: non ho cambiato niente.', { tipo: 'errore', titolo: 'Niente da applicare' });
    return;
  }
  if (!cambiati) {
    ponte.avviso('Era già così: non c\'era niente da cambiare.', { tipo: 'info', durata: 3000 });
    return;
  }

  ponte.scrivi(prefisso, nuovo);
  ridisegna(radice, info && info.ripristino ? '.tema-barra__azioni .btn' : '[data-preset="' + String((info && info.id) || '').replace(/["\\]/g, '') + '"]');
  const nome = info && info.nome ? '«' + info.nome + '»' : 'la combinazione';
  ponte.avviso(
    (info && info.ripristino ? 'Colori, font e forma tornati quelli di partenza' : 'Applicata ' + nome) +
    ' (' + (cambiati === 1 ? 'un campo' : cambiati + ' campi') + '). Sono modifiche non salvate: guarda l\'anteprima, poi Salva.',
    { tipo: 'ok' }
  );
}

function disegna(radice) {
  svuota(radice);

  if (!ponte.pronto || !ponte.stato || !ponte.stato.dati) {
    radice.append(el('p', { classe: 'vuoto', testo: 'I contenuti non sono ancora arrivati: questa vista si riempie da sola appena il pannello li ha letti.' }));
    return;
  }
  const gruppo = ponte.gruppo(GRUPPO_ASPETTO);
  if (!gruppo) {
    radice.append(el('p', { classe: 'vuoto', testo: 'Lo schema non ha il gruppo «aspetto»: controlla contenuti/schema.js nel terminale dove gira il sito.' }));
    return;
  }

  const campi = Array.isArray(gruppo.campi) ? gruppo.campi : [];
  const campiColore = campi.filter((c) => c.tipo === 'colore');
  const campiFont = campi.filter((c) => c.tipo === 'font');
  const altriCampi = campi.filter((c) => c.tipo !== 'colore' && c.tipo !== 'font');
  const base = idUnico('imp');
  const tema = temaServer();

  const sezioni = [];

  const barra = creaBarraTema({ conferma: ponte.conferma, tema }, {
    preset: Array.isArray(tema.preset) ? tema.preset : [],
    predefinito: predefinito(),
    onApplica: (scelto, info) => applicaTema(radice, gruppo, scelto, info)
  });
  sezioni.push(sezione(base + '-preset', 'Combinazioni pronte', [barra]));

  if (campiColore.length) {
    sezioni.push(sezione(base + '-colori', 'Colori', [
      creaRiepilogoContrasti(),
      el('div', { classe: 'imp__griglia' }, campiDisegnati(campiColore))
    ], 'Gli elementi a cui nella scheda Stile hai dato un colore del tema cambiano insieme a lui.'));
  }

  sezioni.push(sezione(base + '-font', 'Font', [
    el('div', { classe: 'imp__campi' }, campiDisegnati(campiFont)),
    creaLibreriaFont()
  ]));

  if (altriCampi.length) {
    sezioni.push(sezione(base + '-forma', 'Forma e sfondo', [
      el('div', { classe: 'imp__griglia imp__griglia--numeri' }, campiDisegnati(altriCampi))
    ]));
  }

  const indice = el('nav', { classe: 'imp__indice', 'aria-label': 'Parti delle impostazioni del sito' },
    sezioni.map((nodo) => el('button', {
      type: 'button', classe: 'imp__salto',
      testo: nodo.querySelector('.imp__titolo').textContent,
      su: { click: () => saltaA(nodo) }
    })));

  // La descrizione del gruppo non si ripete: la testa della vista (guscio)
  // dice già a cosa serve questa pagina. Qui resta solo come si lavora.
  radice.append(
    el('div', { classe: 'imp__intro' }, [
      el('p', { classe: 'imp__nota', testo: 'Le modifiche si vedono subito nell\'anteprima; sul sito arrivano dopo Salva e Pubblica, dentro css/tema.css.' })
    ]),
    indice,
    ...sezioni
  );
}

/**
 * Ridisegna tenendo il fuoco dov'era (lo stesso campo, lo stesso preset)
 * e lo scorrimento del pannello: dopo Annulla chi amministra deve
 * ritrovarsi dove stava, non in cima.
 */
function ridisegna(radice, selettoreFuoco = '') {
  const attivo = radice.contains(document.activeElement) ? document.activeElement : null;
  let cercato = selettoreFuoco;
  if (!cercato && attivo) {
    const campo = attivo.closest('.campo[data-chiave]');
    if (campo) cercato = '.campo[data-chiave="' + campo.dataset.chiave.replace(/["\\]/g, '') + '"] input, .campo[data-chiave="' + campo.dataset.chiave.replace(/["\\]/g, '') + '"] select';
    else if (attivo.dataset && attivo.dataset.preset) cercato = '[data-preset="' + attivo.dataset.preset.replace(/["\\]/g, '') + '"]';
  }
  const scatola = scatolaCheScorre(radice);
  const scorrimento = scatola ? scatola.scrollTop : 0;

  disegna(radice);

  if (scatola) scatola.scrollTop = scorrimento;
  if (cercato) {
    const nodo = radice.querySelector(cercato);
    if (nodo) nodo.focus({ preventScroll: true });
  }
}

/**
 * Aggiunge la vista in fondo al contenitore e la restituisce. Non svuota
 * il contenitore: il titolo e il «Torna all'editor» sono del guscio.
 */
export function disegnaImpostazioni(contenitore) {
  if (!contenitore || typeof contenitore.append !== 'function') {
    registra(new TypeError('disegnaImpostazioni: serve un elemento contenitore.'));
    return null;
  }
  const radice = el('div', { classe: 'imp' });
  contenitore.append(radice);
  montate.add(radice);
  disegna(radice);
  return radice;
}

if (typeof document !== 'undefined') {
  /* Dati sostituiti (Annulla, Ripeti, copia ripristinata) o nuovo accesso:
     i campi disegnati leggevano l'oggetto vecchio, e scriverci sopra
     vorrebbe dire perdere le modifiche senza accorgersene. */
  const rifaiMontate = () => {
    for (const radice of Array.from(montate)) {
      if (!radice.isConnected) { montate.delete(radice); continue; }
      ridisegna(radice);
    }
  };
  document.addEventListener('sb:sostituito', rifaiMontate);
  document.addEventListener('sb:pronto', rifaiMontate);
}
