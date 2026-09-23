/* =====================================================================
   guscio.js — la struttura dell'editor unico (CONTRATTO-4 §9).

   Cosa fa:
     - carica con import() i moduli dell'editor (motore, contenuti, stile,
       parti, nomi, impostazioni): se uno manca o lancia, l'editor parte lo
       stesso e un avviso dice cosa non c'è;
     - monta l'anteprima (motore.monta) e disegna il pannello laterale:
       percorso dell'elemento scelto, «Seleziona il contenitore», schede
       Contenuto / Stile / Avanzate (i controlli li disegnano gli altri
       moduli con motore.disegnaIspettori, sempre nello stesso contenitore
       per scheda);
     - nessuna selezione: vista «Pagina» con il Navigatore, le scorciatoie
       e i quattro passi; menu ☰ con le viste che non stanno sulla pagina;
     - ricerca dei campi (Ctrl+K) e riepilogo degli errori di convalida,
       che portano al campo: elemento nell'anteprima, parte o vista;
     - pannello ridimensionabile 380–760 px, a scomparsa sotto i 1024 px;
     - dispositivi, Annulla / Ripeti, e l'anteprima allineata a ogni
       sb:modifica (§9.4).

   Si appoggia a pannello.js (le funzioni che gli passa creaGuscio), al
   ponte e ai moduli dell'editor solo attraverso le firme del contratto.

   Indice
     1. Costanti
     2. Stato e utilità
     3. Moduli dell'editor
     4. Pannello: struttura fissa
     5. Elemento selezionato e schede
     6. Pagina
     7. Viste del menu
     8. Ricerca dei campi ed errori: portare al campo
     9. Selezione e sincronizzazione dell'anteprima
    10. Annulla / Ripeti
    11. Barra alta, cassetto, larghezza
    12. Tastiera
    13. Avvio e interfaccia per pannello.js
   ===================================================================== */

import { ponte } from './ponte.js';
import { api, ErroreApi, rottaAssente } from '../moduli/api.js';
import { el, icona, bottone, svuota, leggiPreferenza, scriviPreferenza, menoMovimento } from '../moduli/dom.js';
import { avviso, conferma } from '../moduli/avvisi.js';
import { apriVoci } from '../moduli/elenchi.js';
import { creaLibreria } from '../moduli/media.js';
import { creaBackup } from '../moduli/backup.js';
import { creaSondaggi } from '../moduli/sondaggi.js';

/* =====================================================================
   1. COSTANTI
   ===================================================================== */

const LARGHEZZA_MIN = 380;
const LARGHEZZA_MAX = 760;
const LARGHEZZA_DI_SERIE = 480;
const ANTEPRIMA_MIN = 420;          // l'anteprima non scende sotto questa larghezza
const STRETTO = '(max-width: 1023.98px)';

const MAX_STORIA = 50;
const ATTESA_ISTANTANEA = 400;
const ATTESA_RICARICA = 700;
const RISERVA_RICARICA = 10000;     // se sb:anteprima-pronta non arriva, si chiude lo stesso
const RISERVA_MONTAGGIO = 8000;

const MAX_RISULTATI = 12;
const MIN_PASSWORD = 8;

const DISPOSITIVI = ['telefono', 'tablet', 'computer'];

const SCHEDE = [
  {
    id: 'contenuto', nome: 'Contenuto',
    vuotoTitolo: 'Qui non c\'è niente da scrivere',
    vuotoTesto: 'Questo elemento non ha testi, immagini o campi da cambiare. Prova Stile o Avanzate, oppure seleziona il contenitore.'
  },
  {
    id: 'stile', nome: 'Stile',
    vuotoTitolo: 'Nessuna opzione di stile',
    vuotoTesto: 'Per questo elemento non ci sono colori, font o spazi da cambiare.'
  },
  {
    id: 'avanzate', nome: 'Avanzate',
    vuotoTitolo: 'Nessuna impostazione avanzata',
    vuotoTesto: 'Per questo elemento non ci sono posizione, visibilità o altre impostazioni.'
  }
];

const TIPI = { testo: 'Testo', immagine: 'Immagine', parte: 'Parte', blocco: 'Blocco', sezione: 'Sezione' };

const MENU = [
  { vista: 'impostazioni', nome: 'Impostazioni del sito', nota: 'Colori, font (anche caricati da te) e forma di tutto il sito', ico: 'regola' },
  { vista: 'struttura', nome: 'Struttura della pagina', nota: 'Ordine e visibilità delle sezioni', ico: 'struttura' },
  { vista: 'canale', nome: 'Canale, contatti e immagini', nota: 'Canale Twitch, email, immagini del sito', ico: 'canale' },
  { vista: 'meta', nome: 'Google e social', nota: 'Come appare il sito nelle ricerche e nei link condivisi', ico: 'mondo' },
  { vista: 'manutenzione', nome: 'Manutenzione', nota: 'Metti il sito in pausa: i visitatori vedono la pagina di manutenzione', ico: 'attenzione' },
  { vista: 'sondaggi', nome: 'Sondaggi', nota: 'Crea un sondaggio per chi è collegato con Twitch e guarda i risultati', ico: 'sondaggio' },
  { vista: 'immagini', nome: 'Immagini', nota: 'Carica e gestisci i file', ico: 'immagine' },
  { vista: 'backup', nome: 'Copie di sicurezza', nota: 'Torna a com\'era il sito prima di una pubblicazione', ico: 'backup' },
  { vista: 'password', nome: 'Password', nota: 'Cambia la password del pannello', ico: 'chiave' },
  { azione: 'esci', nome: 'Esci', nota: 'Chiudi la sessione', ico: 'esci' }
];

/* Viste del menu. `gruppo`: la vista è un gruppo dello schema disegnato
   campo per campo (i tre gruppi che non stanno in nessun punto della
   pagina, CONTRATTO-4 §5.4). */
const VISTE = {
  menu: { titolo: 'Menu' },
  impostazioni: {
    titolo: 'Impostazioni del sito',
    nota: 'Colori, font e forma che valgono per tutto il sito. I singoli elementi si cambiano cliccandoli nell\'anteprima.',
    gruppo: 'aspetto'
  },
  // Senza nota: l'introduzione la scrive già il Navigatore (parti.js).
  struttura: { titolo: 'Struttura della pagina' },
  canale: { titolo: 'Canale, contatti e immagini', gruppo: 'canale' },
  meta: { titolo: 'Google e social', gruppo: 'meta' },
  manutenzione: {
    titolo: 'Manutenzione',
    nota: 'Accendi «Sito in manutenzione», salva e premi Pubblica: la home e clip.html diventano la pagina di manutenzione per tutti, e player, lurk, pollo, musica e sondaggi si fermano. Per riaprire il sito spegnilo, salva e pubblica. L\'anteprima qui a fianco mostra sempre il sito vero.',
    gruppo: 'manutenzione'
  },
  immagini: {
    titolo: 'Immagini',
    nota: 'I file caricati qui restano sul server. Un\'immagine del sito si cambia anche cliccandola nell\'anteprima.'
  },
  sondaggi: {
    titolo: 'Sondaggi',
    nota: 'Un sondaggio alla volta. Va online appena lo crei, senza pubblicare: vota solo chi è collegato al sito con Twitch, una volta a testa.'
  },
  backup: { titolo: 'Copie di sicurezza', nota: 'Le copie che il server tiene da parte a ogni pubblicazione.' },
  password: { titolo: 'Password', nota: 'La password che serve per entrare in questo pannello.' }
};

/* I gruppi che hanno una vista loro invece di un punto della pagina. */
const VISTA_DEL_GRUPPO = { aspetto: 'impostazioni', canale: 'canale', meta: 'meta', manutenzione: 'manutenzione' };

const MODULI = [
  { nome: 'motore', file: './motore.js', cosa: 'l\'anteprima modificabile (editor/motore.js)' },
  { nome: 'nomi', file: './nomi.js', cosa: 'i nomi delle sezioni e delle parti (editor/nomi.js)' },
  { nome: 'contenuti', file: './contenuti.js', cosa: 'i controlli di testi e immagini (editor/contenuti.js)' },
  { nome: 'stile', file: './stile.js', cosa: 'le schede Stile e Avanzate (editor/stile.js)' },
  { nome: 'parti', file: './parti.js', cosa: 'le parti, le sezioni e il Navigatore (editor/parti.js)' },
  { nome: 'impostazioni', file: './impostazioni.js', cosa: 'le Impostazioni del sito (editor/impostazioni.js)' }
];

/* =====================================================================
   2. STATO E UTILITÀ
   ===================================================================== */

let opz = null;   // le funzioni di pannello.js (creaGuscio)

const sh = {
  montato: false,
  montaggio: null,
  sospeso: true,        // app nascosta (accesso): niente disegni

  modo: '',             // 'elemento' | 'pagina' | 'vista'
  vista: null,          // vista aperta nel pannello, o null
  vistaDisegnata: null,
  selezione: null,      // meta dell'elemento scelto (§10)
  scheda: 'contenuto',
  disegnate: {},        // scheda -> meta con cui è stata disegnata
  conteggi: {},         // scheda -> riquadri disegnati (-1 motore assente, -2 errore)
  navVecchio: true,

  ricaricando: false,
  timerRicarica: null,
  riservaRicarica: null,
  fineRicarica: null,

  dispositivo: 'computer',
  larghezza: LARGHEZZA_DI_SERIE,
  cassetto: false,
  mqStretto: null,
  resizeNostro: false,
  rafResize: 0,

  storia: { indietro: [], avanti: [], base: null, timer: null },
  applicando: false,

  moduli: {},           // nome -> modulo ES caricato
  motore: null,         // l'oggetto `motore` di motore.js
  mancanti: [],

  libreria: null,
  backup: null,
  errori: [],
  indice: [],
  risultati: [],
  scelto: -1,
  ui: {}
};

const $ = (id) => document.getElementById(id);

function log(...cose) { console.error('[guscio]', ...cose); }

function stretto() { return Boolean(sh.mqStretto && sh.mqStretto.matches); }

function dialogoAperto() { return Boolean(document.querySelector('dialog[open]')); }

function appVisibile() {
  const app = $('app');
  return Boolean(app && !app.hidden);
}

function normalizzaChiave(chiave) {
  return String(chiave || '').replace(/\[(\d+)\]/g, '.$1');
}

/** Valore sicuro dentro [attributo="…"]. */
function perSelettore(valore) {
  return String(valore).replace(/["\\]/g, '\\$&');
}

/* Campi dove Ctrl+Z deve restare quello del browser. */
function staScrivendo(nodo) {
  if (!nodo || nodo.nodeType !== 1) return false;
  if (nodo.isContentEditable) return true;
  const tag = nodo.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const tipo = String(nodo.type || '').toLowerCase();
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(tipo);
  }
  return false;
}

function fuocoNelPannello() {
  const lato = sh.ui.lato;
  return Boolean(lato && document.activeElement && lato.contains(document.activeElement));
}

function visibile(nodo) {
  return Boolean(nodo && nodo.isConnected && nodo.getClientRects().length);
}

function gruppiSchema() {
  const schema = opz && opz.stato.schema;
  return schema && Array.isArray(schema.gruppi) ? schema.gruppi : [];
}

/** Riquadro «non c'è niente qui» con titolo, testo e azioni facoltative. */
function segnaposto(titolo, testo, azioni = null) {
  return el('div', { classe: 'lato__vuoto' }, [
    el('p', { classe: 'lato__vuoto-titolo', testo: titolo }),
    el('p', { testo }),
    azioni
  ]);
}

function attendi(ms) {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

/* --- motore ----------------------------------------------------------- */

function mot(nome, ...argomenti) {
  const m = sh.motore;
  if (!m || typeof m[nome] !== 'function') return undefined;
  try {
    return m[nome](...argomenti);
  } catch (errore) {
    log('motore.' + nome, errore);
    return undefined;
  }
}

function haMotore(nome) {
  return Boolean(sh.motore && typeof sh.motore[nome] === 'function');
}

function documentoAnteprima() {
  const doc = mot('documento');
  return doc && doc.body ? doc : null;
}

/** Vero se nell'anteprima c'è un marcatore di testo o immagine per la chiave. */
function haMarcatore(chiave) {
  const doc = documentoAnteprima();
  if (!doc) return false;
  const v = perSelettore(chiave);
  return Boolean(doc.querySelector('[data-sb-testo="' + v + '"], [data-sb-immagine="' + v + '"], [data-sb-alt="' + v + '"]'));
}

/* =====================================================================
   3. MODULI DELL'EDITOR
   ===================================================================== */

async function caricaModuli() {
  const esiti = await Promise.allSettled(MODULI.map((m) => import(m.file)));
  sh.mancanti = [];
  esiti.forEach((esito, i) => {
    const voce = MODULI[i];
    if (esito.status === 'fulfilled') {
      sh.moduli[voce.nome] = esito.value;
    } else {
      sh.mancanti.push(voce);
      log('modulo non caricato:', voce.file, esito.reason);
    }
  });
  const m = sh.moduli.motore && sh.moduli.motore.motore;
  sh.motore = m && typeof m === 'object' ? m : null;
  if (sh.moduli.motore && !sh.motore) {
    sh.mancanti.push(MODULI[0]);
    log('motore.js non esporta `motore`');
  }

  if (sh.mancanti.length) {
    avviso(
      'Non si sono caricati: ' + sh.mancanti.map((m) => m.cosa).join('; ') + '. ' +
      'Il resto dell\'editor funziona, e Salva e Pubblica non perdono niente. Ricarica la pagina; se resta così, guarda la console del browser.',
      { tipo: 'errore', titolo: sh.mancanti.length === 1 ? 'Un pezzo dell\'editor manca' : 'Alcuni pezzi dell\'editor mancano', durata: 0 }
    );
  }
}

function modulo(nome) {
  return sh.moduli[nome] || null;
}

async function montaMotore() {
  const ui = sh.ui;
  if (!haMotore('monta')) {
    svuota(ui.anteprima);
    ui.anteprima.append(el('div', { classe: 'palco__vuoto' }, [
      el('p', { classe: 'lato__vuoto-titolo', testo: 'Anteprima non disponibile' }),
      el('p', { testo: 'Il motore dell\'editor (editor/motore.js) non si è caricato, quindi qui non posso mostrare il sito da cliccare. Dal pannello a sinistra puoi comunque cambiare tutti i campi, salvare e pubblicare.' }),
      el('a', { classe: 'btn', href: '/api/anteprima', target: '_blank', rel: 'noopener' }, [
        icona('esterno'), el('span', { testo: 'Apri la bozza salvata in una scheda nuova' })
      ])
    ]));
    for (const b of ui.dispositivi) b.disabled = true;
    return;
  }

  if (haMotore('suSelezione')) mot('suSelezione', suSelezione);
  let promessa;
  try {
    promessa = sh.motore.monta(ui.anteprima, { dispositivo: sh.dispositivo });
  } catch (errore) {
    log('motore.monta', errore);
    return;
  }
  // Un'anteprima che non arriva non deve tenere fermo tutto l'editor: dopo
  // qualche secondo si va avanti, e quando arriva si allinea da sola.
  await Promise.race([Promise.resolve(promessa).catch((e) => log('motore.monta', e)), attendi(RISERVA_MONTAGGIO)]);
  sincronizzaDispositivo(true);
  if (leggiPreferenza('contorni', '0') === '1') mot('contorni', true);
  const attuale = mot('selezione');
  if (attuale && (!sh.selezione || attuale.id !== sh.selezione.id)) suSelezione(attuale);
}

/* =====================================================================
   4. PANNELLO: STRUTTURA FISSA
   Tre modi con una struttura che non si ricrea mai: «elemento» (percorso
   e schede), «pagina» (nessuna selezione), «vista» (menu e viste). I
   contenitori delle schede restano gli stessi: il motore ci riusa i
   riquadri degli ispettori e chi scrive non perde il campo.
   ===================================================================== */

function costruisciPannello() {
  const ui = sh.ui;
  svuota(ui.lato);

  /* --- ricerca dei campi --- */
  ui.cerca = el('input', {
    type: 'search', id: 'campo-ricerca', classe: 'ricerca__input',
    placeholder: 'Cerca un campo…', autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'ricerca-risultati',
    'aria-autocomplete': 'list', 'aria-describedby': 'ricerca-aiuto'
  });
  ui.cercaPulisci = bottone({ ico: 'chiudi', testo: 'Svuota la ricerca', soloIcona: true, classe: 'ricerca__pulisci' });
  ui.cercaPulisci.hidden = true;
  ui.risultati = el('ul', { classe: 'ricerca__risultati', id: 'ricerca-risultati', role: 'listbox', 'aria-label': 'Campi trovati', hidden: true });
  ui.ricerca = el('div', { classe: 'ricerca lato__ricerca', role: 'search' }, [
    el('label', { classe: 'sr-only', for: 'campo-ricerca', testo: 'Cerca un campo per nome' }),
    el('div', { classe: 'ricerca__riga' }, [icona('cerca', 'ico ricerca__ico'), ui.cerca, ui.cercaPulisci]),
    el('p', { classe: 'ricerca__aiuto', id: 'ricerca-aiuto' }, [
      'Scorciatoia: ', el('kbd', { testo: 'Ctrl' }), '+', el('kbd', { testo: 'K' })
    ]),
    ui.risultati
  ]);
  legaRicerca();

  /* --- riepilogo degli errori del server --- */
  ui.riepilogo = el('div', { classe: 'riepilogo lato__riepilogo', id: 'riepilogo-errori', role: 'alert', hidden: true });

  /* --- elemento selezionato --- */
  ui.testaElemento = el('div', { classe: 'lato__testa' });
  ui.bottoniScheda = {};
  ui.schedeElenco = el('div', { classe: 'lato__schede', role: 'tablist', 'aria-label': 'Schede dei controlli' });
  for (const s of SCHEDE) {
    const b = el('button', {
      type: 'button', classe: 'lato__scheda-btn', role: 'tab', id: 'scheda-' + s.id,
      'aria-controls': 'scheda-corpo', 'aria-selected': 'false', tabindex: '-1', testo: s.nome
    });
    b.addEventListener('click', () => impostaScheda(s.id));
    b.addEventListener('keydown', tastiSchede);
    ui.bottoniScheda[s.id] = b;
    ui.schedeElenco.append(b);
  }
  ui.schede = {};
  ui.scorriScheda = el('div', {
    classe: 'lato__scorri', id: 'scheda-corpo', role: 'tabpanel', tabindex: '0', dati: { scorri: '1' }
  });
  for (const s of SCHEDE) {
    const box = el('div', { classe: 'lato__scheda', dati: { scheda: s.id }, hidden: true });
    ui.schede[s.id] = box;
    ui.scorriScheda.append(box);
  }
  ui.schedaVuota = el('div', { classe: 'lato__scheda-vuota', hidden: true });
  ui.scorriScheda.append(ui.schedaVuota);
  ui.modoElemento = el('div', { classe: 'lato__modo', dati: { modo: 'elemento' }, hidden: true }, [
    ui.testaElemento, ui.schedeElenco, ui.scorriScheda
  ]);

  /* --- nessuna selezione: Pagina --- */
  ui.titoloPagina = el('h2', { classe: 'lato__titolo', tabindex: '-1', testo: 'Pagina' });
  ui.navigatore = el('div', { classe: 'lato__navigatore' });
  ui.passi = el('ol', { classe: 'passi', 'aria-labelledby': 'titolo-passi' }, [
    passo('modifica', '1', 'Clicca e modifica', 'un testo, un\'immagine o una sezione nell\'anteprima'),
    passo('guarda', '2', 'Guarda l\'anteprima', 'si aggiorna mentre scrivi, anche senza salvare'),
    passo('salva', '3', 'Salva la bozza', 'il sito non cambia'),
    passo('pubblica', '4', 'Pubblica', 'riscrive il sito: index.html, js/dati.js, css/tema.css')
  ]);
  ui.pubblicazione = el('p', { classe: 'lato__pubblicazione' });
  ui.scorriPagina = el('div', { classe: 'lato__scorri', dati: { scorri: '1' } }, [
    el('div', { classe: 'scorciatoie' }, [
      scorciatoia('Impostazioni del sito', 'Colori, font, forma', 'impostazioni', 'regola'),
      scorciatoia('Canale e immagini', 'Twitch, email, immagini', 'canale', 'canale'),
      scorciatoia('Google e social', 'Ricerche e link condivisi', 'meta', 'mondo'),
      scorciatoia('Immagini', 'Carica e gestisci i file', 'immagini', 'immagine')
    ]),
    el('h3', { classe: 'lato__occhiello', testo: 'Sezioni della pagina' }),
    ui.navigatore,
    el('h3', { classe: 'lato__occhiello', id: 'titolo-passi', testo: 'Come si lavora' }),
    ui.passi,
    ui.pubblicazione
  ]);
  ui.modoPagina = el('div', { classe: 'lato__modo', dati: { modo: 'pagina' }, hidden: true }, [
    el('div', { classe: 'lato__testa' }, [
      el('p', { classe: 'lato__occhiello', testo: 'Nessun elemento selezionato' }),
      ui.titoloPagina,
      el('p', { classe: 'lato__nota', testo: 'Clicca un testo, un\'immagine o una sezione nell\'anteprima: qui compaiono tutti i suoi controlli.' })
    ]),
    ui.scorriPagina
  ]);

  /* --- viste del menu --- */
  ui.modoVista = el('div', { classe: 'lato__modo', dati: { modo: 'vista' }, hidden: true });

  ui.lato.append(ui.ricerca, ui.riepilogo, ui.modoElemento, ui.modoPagina, ui.modoVista);
}

function passo(id, numero, testo, nota) {
  return el('li', { classe: 'passi__passo', dati: { passo: id } }, [
    el('span', { classe: 'passi__num', testo: numero }),
    el('span', { classe: 'passi__testo' }, [testo, el('em', { testo: nota })])
  ]);
}

function scorciatoia(nome, nota, vista, ico) {
  return el('button', { type: 'button', classe: 'scorciatoia', su: { click: () => apriVista(vista) } }, [
    icona(ico, 'ico scorciatoia__ico'),
    el('span', { classe: 'scorciatoia__nome', testo: nome }),
    el('span', { classe: 'scorciatoia__nota', testo: nota })
  ]);
}

function disegna(opzioni = {}) {
  if (!sh.montato || sh.sospeso) return;
  const ui = sh.ui;
  const modo = sh.vista ? 'vista' : (sh.selezione ? 'elemento' : 'pagina');
  const cambiato = modo !== sh.modo;
  sh.modo = modo;

  ui.modoElemento.hidden = modo !== 'elemento';
  ui.modoPagina.hidden = modo !== 'pagina';
  ui.modoVista.hidden = modo !== 'vista';
  ui.lato.dataset.modo = modo;

  if (modo !== 'vista' && sh.vistaDisegnata) {
    svuota(ui.modoVista);
    sh.vistaDisegnata = null;
  }

  try {
    if (modo === 'vista') disegnaVista(opzioni);
    else if (modo === 'elemento') disegnaElemento(opzioni, cambiato);
    else disegnaPagina(opzioni, cambiato);
  } catch (errore) {
    log('disegno del pannello', errore);
  }
  if (opz) opz.applicaErrori();
  aggiornaBarra();
}

/* =====================================================================
   5. ELEMENTO SELEZIONATO E SCHEDE
   ===================================================================== */

function etichettaDi(meta) {
  if (!meta) return 'Pagina';
  if (meta.etichetta) return String(meta.etichetta);
  return (TIPI[meta.tipo] || 'Elemento') + (meta.chiave ? ' ' + meta.chiave : '');
}

function catena(meta) {
  const percorso = mot('percorso');
  if (Array.isArray(percorso) && percorso.length && percorso[percorso.length - 1] && percorso[percorso.length - 1].id === meta.id) {
    return percorso.filter(Boolean);
  }
  const elenco = [];
  for (let m = meta, giri = 0; m && giri < 12; m = m.genitore || null, giri += 1) elenco.unshift(m);
  return elenco;
}

function briciola(nome, meta, attuale) {
  const li = el('li', { classe: 'percorso__voce' });
  if (attuale) {
    li.append(el('span', { classe: 'percorso__attuale', 'aria-current': 'location', testo: nome }));
  } else {
    li.append(el('button', {
      type: 'button', classe: 'percorso__btn', testo: nome,
      title: meta ? 'Seleziona «' + nome + '»' : 'Togli la selezione e torna alla pagina',
      su: { click: () => seleziona(meta ? meta.id : null) }
    }));
  }
  return li;
}

function disegnaTesta(meta) {
  const ui = sh.ui;
  const elenco = el('ol', { classe: 'percorso__elenco' });
  elenco.append(briciola('Pagina', null, false));
  const voci = catena(meta);
  voci.forEach((m, i) => elenco.append(briciola(etichettaDi(m), m, i === voci.length - 1)));

  const genitore = meta.genitore || null;
  const suGenitore = genitore ? el('button', {
    type: 'button', classe: 'btn btn--minimo lato__genitore',
    title: 'Seleziona «' + etichettaDi(genitore) + '» (anche con Esc nell\'anteprima)',
    su: { click: () => seleziona(genitore.id) }
  }, [
    icona('su'),
    el('span', { classe: 'lato__genitore-testo' }, [
      'Seleziona il contenitore',
      el('span', { classe: 'lato__genitore-nome', testo: etichettaDi(genitore) })
    ])
  ]) : null;

  ui.titoloElemento = el('h2', { classe: 'lato__titolo', id: 'titolo-selezione', tabindex: '-1', testo: etichettaDi(meta) });
  svuota(ui.testaElemento);
  ui.testaElemento.append(
    el('nav', { classe: 'percorso', 'aria-label': 'Dove si trova l\'elemento selezionato' }, [elenco]),
    el('div', { classe: 'lato__riga-titolo' }, [
      el('div', { classe: 'lato__box-titolo' }, [
        el('span', { classe: 'lato__tipo', testo: TIPI[meta.tipo] || 'Elemento' }),
        ui.titoloElemento
      ]),
      suGenitore
    ])
  );
  ui.modoElemento.dataset.tipo = meta.tipo || '';
}

function aggiornaSchede() {
  const ui = sh.ui;
  for (const s of SCHEDE) {
    const acceso = s.id === sh.scheda;
    ui.bottoniScheda[s.id].setAttribute('aria-selected', String(acceso));
    ui.bottoniScheda[s.id].setAttribute('tabindex', acceso ? '0' : '-1');
    ui.schede[s.id].hidden = !acceso;
  }
  ui.scorriScheda.setAttribute('aria-labelledby', 'scheda-' + sh.scheda);
}

function disegnaElemento(opzioni, cambiato) {
  const meta = sh.selezione;
  disegnaTesta(meta);
  aggiornaSchede();
  if (opzioni.forza || sh.disegnate[sh.scheda] !== meta) disegnaScheda(sh.scheda, meta);
  else aggiornaVuoto(sh.scheda);
  if (opzioni.azzeraScorrimento || cambiato) sh.ui.scorriScheda.scrollTop = 0;
  if (opzioni.fuoco && sh.ui.titoloElemento) sh.ui.titoloElemento.focus();
}

function disegnaScheda(scheda, meta) {
  const box = sh.ui.schede[scheda];
  sh.disegnate[scheda] = meta;
  if (!haMotore('disegnaIspettori')) {
    sh.conteggi[scheda] = -1;
  } else {
    try {
      const n = sh.motore.disegnaIspettori(scheda, box, meta);
      sh.conteggi[scheda] = typeof n === 'number' ? n : box.children.length;
    } catch (errore) {
      log('disegnaIspettori ' + scheda, errore);
      sh.conteggi[scheda] = -2;
    }
  }
  aggiornaVuoto(scheda);
}

/* Una scheda «vuota» è anche una scheda i cui ispettori non hanno messo
   niente di usabile: il messaggio lo decide il guscio, non i moduli. */
function schedaSenzaControlli(box) {
  if (!box.children.length) return true;
  if (box.querySelector('input, select, textarea, button, img, a[href], [role="button"], [contenteditable]')) return false;
  return !String(box.textContent || '').trim();
}

function aggiornaVuoto(scheda) {
  const ui = sh.ui;
  const nota = ui.schedaVuota;
  const n = sh.conteggi[scheda];
  const meta = sh.selezione;
  const def = SCHEDE.find((s) => s.id === scheda) || SCHEDE[0];
  svuota(nota);

  if (n === -1) {
    nota.append(segnaposto(
      'Controlli non disponibili',
      'Il motore dell\'editor (editor/motore.js) non è caricato: per ora non posso mostrare i controlli di questa scheda. Salva, Pubblica e il menu ☰ funzionano lo stesso.'
    ));
  } else if (n === -2) {
    nota.append(segnaposto(
      'Questa scheda non si è aperta',
      'C\'è qualcosa che non torna nei controlli di questo elemento. Le altre schede e il resto del pannello funzionano.'
    ));
  } else if (!n || schedaSenzaControlli(ui.schede[scheda])) {
    const azioni = SCHEDE.filter((s) => s.id !== scheda).map((s) => bottone({
      testo: 'Vai a ' + s.nome, classe: 'btn btn--minimo', su: () => impostaScheda(s.id, true)
    }));
    if (meta && meta.genitore) {
      azioni.push(bottone({ testo: 'Seleziona il contenitore', classe: 'btn btn--minimo', su: () => seleziona(meta.genitore.id) }));
    }
    nota.append(segnaposto(def.vuotoTitolo, def.vuotoTesto, el('div', { classe: 'lato__azioni' }, azioni)));
  }
  nota.hidden = !nota.firstChild;
}

function impostaScheda(id, fuoco = false) {
  if (!SCHEDE.some((s) => s.id === id)) return;
  if (sh.scheda !== id) {
    sh.scheda = id;
    scriviPreferenza('scheda', id);
    if (sh.montato && sh.modo === 'elemento') {
      aggiornaSchede();
      if (sh.disegnate[id] !== sh.selezione) disegnaScheda(id, sh.selezione);
      else aggiornaVuoto(id);
      sh.ui.scorriScheda.scrollTop = 0;
      if (opz) opz.applicaErrori();
    }
  }
  if (fuoco && sh.ui.bottoniScheda) sh.ui.bottoniScheda[id].focus();
}

function tastiSchede(evento) {
  const i = Math.max(0, SCHEDE.findIndex((s) => s.id === sh.scheda));
  let j = -1;
  if (evento.key === 'ArrowRight') j = (i + 1) % SCHEDE.length;
  else if (evento.key === 'ArrowLeft') j = (i - 1 + SCHEDE.length) % SCHEDE.length;
  else if (evento.key === 'Home') j = 0;
  else if (evento.key === 'End') j = SCHEDE.length - 1;
  if (j < 0) return;
  evento.preventDefault();
  impostaScheda(SCHEDE[j].id, true);
}

/* =====================================================================
   6. PAGINA
   ===================================================================== */

function disegnaPagina(opzioni, cambiato) {
  const ui = sh.ui;
  if (sh.navVecchio || !ui.navigatore.firstChild) {
    svuota(ui.navigatore);
    disegnaNavigatore(ui.navigatore);
    sh.navVecchio = false;
  }
  if (opzioni.azzeraScorrimento || cambiato) ui.scorriPagina.scrollTop = 0;
  if (opzioni.fuoco) ui.titoloPagina.focus();
}

function disegnaNavigatore(contenitore) {
  const parti = modulo('parti');
  if (sh.motore && parti && typeof parti.disegnaNavigatore === 'function') {
    try {
      parti.disegnaNavigatore(contenitore);
      return;
    } catch (errore) {
      log('disegnaNavigatore', errore);
      svuota(contenitore);
      contenitore.append(segnaposto(
        'L\'elenco delle sezioni non si è aperto',
        'C\'è stato un problema nel disegnare le sezioni. Puoi comunque cliccarle nell\'anteprima.'
      ));
    }
  } else if (sh.motore) {
    contenitore.append(segnaposto(
      'Elenco delle sezioni non disponibile',
      'Il modulo delle sezioni (editor/parti.js) non è caricato: clicca le sezioni direttamente nell\'anteprima.'
    ));
  }

  // Senza anteprima o senza Navigatore nessun campo deve restare
  // irraggiungibile: i gruppi dello schema, uno per vista.
  if (!sh.motore || !parti) {
    const elenco = el('ul', { classe: 'menu-lato menu-lato--compatto' });
    for (const gruppo of gruppiSchema()) {
      elenco.append(el('li', {}, [el('button', {
        type: 'button', classe: 'menu-lato__btn',
        su: { click: () => apriVista(VISTA_DEL_GRUPPO[gruppo.id] || 'gruppo:' + gruppo.id) }
      }, [
        el('span', { classe: 'menu-lato__nome', testo: gruppo.titolo || gruppo.id }),
        gruppo.descrizione ? el('span', { classe: 'menu-lato__nota', testo: gruppo.descrizione }) : null
      ])]));
    }
    contenitore.append(el('p', { classe: 'lato__nota', testo: 'Tutti i campi, divisi come nel sito:' }), elenco);
  }
}

/* =====================================================================
   7. VISTE DEL MENU
   ===================================================================== */

function titoloVista(nome) {
  if (VISTE[nome]) return VISTE[nome].titolo;
  if (String(nome).startsWith('gruppo:')) {
    const gruppo = ponte.gruppo(String(nome).slice(7));
    return gruppo ? (gruppo.titolo || gruppo.id) : 'Campi';
  }
  if (String(nome).startsWith('parte:')) {
    const nomi = modulo('nomi');
    const parte = String(nome).slice(6);
    try {
      if (nomi && typeof nomi.nomeParte === 'function') return nomi.nomeParte(parte);
    } catch (errore) { log('nomeParte', errore); }
    return parte;
  }
  return 'Pannello';
}

/* Viste che si ridisegnano da sole su sb:sostituito e sb:pronto (lo
   dicono TEMA e PARTI), e quelle che non mostrano la bozza: rifarle da
   capo perderebbe scorrimento e fuoco senza guadagnare niente. */
const VISTE_AUTONOME = new Set(['menu', 'impostazioni', 'struttura', 'immagini', 'sondaggi', 'backup', 'password']);

function disegnaVista(opzioni) {
  const ui = sh.ui;
  const nome = sh.vista;
  if (sh.vistaDisegnata === nome && (!opzioni.forza || (opzioni.sostituito && VISTE_AUTONOME.has(nome)))) {
    if (opzioni.fuoco) fuocoVista();
    return;
  }
  const vecchio = ui.modoVista.querySelector('[data-scorri]');
  const tieni = (sh.vistaDisegnata === nome && vecchio && !opzioni.azzeraScorrimento) ? vecchio.scrollTop : 0;

  svuota(ui.modoVista);
  sh.vistaDisegnata = nome;
  ui.modoVista.dataset.vista = nome;

  const def = VISTE[nome] || {};
  const idGruppo = def.gruppo || (String(nome).startsWith('gruppo:') ? String(nome).slice(7) : '');
  const gruppo = idGruppo ? ponte.gruppo(idGruppo) : null;
  const parte = String(nome).startsWith('parte:') ? String(nome).slice(6) : '';
  let nota = def.nota || (gruppo && gruppo.descrizione) || '';
  if (parte) {
    nota = 'Questa parte adesso non è nella pagina (per esempio perché è spenta): i suoi campi si cambiano da qui.';
  }

  const scorri = el('div', { classe: 'lato__scorri', dati: { scorri: '1' } });
  const testa = el('div', { classe: 'lato__testa lato__testa--vista' }, [
    el('button', { type: 'button', classe: 'btn btn--minimo lato__indietro', su: { click: () => chiudiVista(true) } }, [
      icona('indietro'), el('span', { testo: 'Torna all\'editor' })
    ]),
    // Il titolo di una parte lo scrive PARTI dentro la vista: qui niente doppione.
    parte ? null : el('h2', { classe: 'lato__titolo', tabindex: '-1', testo: titoloVista(nome) }),
    nome !== 'menu' && nota ? el('p', { classe: 'lato__nota', testo: nota }) : null
  ]);
  ui.modoVista.append(testa, scorri);

  try {
    if (nome === 'menu') disegnaMenu(scorri);
    else if (nome === 'impostazioni') disegnaImpostazioni(scorri);
    else if (nome === 'struttura') disegnaStruttura(scorri);
    else if (nome === 'immagini') disegnaImmagini(scorri);
    else if (nome === 'sondaggi') scorri.append(creaSondaggi().nodo);
    else if (nome === 'backup') disegnaCopie(scorri);
    else if (nome === 'password') disegnaPassword(scorri);
    else if (gruppo) disegnaGruppo(scorri, gruppo);
    else if (parte && modulo('parti') && typeof modulo('parti').disegnaParte === 'function') modulo('parti').disegnaParte(scorri, parte);
    else scorri.append(segnaposto('Vista sconosciuta', 'Questa parte del pannello non esiste più: torna all\'editor.'));
  } catch (errore) {
    log('vista ' + nome, errore);
    svuota(scorri);
    scorri.append(segnaposto('Questa parte non si è aperta', 'C\'è qualcosa che non torna. Il resto del pannello funziona: torna all\'editor e riprova.'));
  }
  if (tieni) scorri.scrollTop = tieni;
  if (opzioni.fuoco) fuocoVista();
}

function fuocoVista() {
  const v = sh.ui.modoVista;
  const bersaglio = sh.vista === 'menu'
    ? v.querySelector('.menu-lato__btn')
    : (v.querySelector('.lato__titolo') || v.querySelector('.lato__indietro'));
  if (bersaglio) bersaglio.focus();
}

function disegnaMenu(scorri) {
  const elenco = el('ul', { classe: 'menu-lato' });
  for (const voce of MENU) {
    elenco.append(el('li', {}, [el('button', {
      type: 'button',
      classe: 'menu-lato__btn' + (voce.azione === 'esci' ? ' menu-lato__btn--esci' : ''),
      su: { click: () => (voce.azione === 'esci' ? opz.esci() : apriVista(voce.vista)) }
    }, [
      icona(voce.ico, 'ico menu-lato__ico'),
      el('span', { classe: 'menu-lato__nome', testo: voce.nome }),
      el('span', { classe: 'menu-lato__nota', testo: voce.nota })
    ])]));
  }
  scorri.append(elenco);

  /* --- come si guarda il pannello --- */
  const nomi = el('button', {
    type: 'button', classe: 'opzione', 'aria-pressed': String(Boolean(opz.nomiTecnici())),
    su: { click: () => { opz.impostaNomiTecnici(!opz.nomiTecnici()); nomi.setAttribute('aria-pressed', String(Boolean(opz.nomiTecnici()))); } }
  }, [icona('etichetta', 'ico ico--mini'), el('span', { testo: 'Mostra i nomi tecnici dei campi' })]);

  const preferenze = [nomi];
  if (haMotore('contorni')) {
    const contorni = el('button', {
      type: 'button', classe: 'opzione', 'aria-pressed': String(leggiPreferenza('contorni', '0') === '1'),
      su: {
        click: () => {
          const acceso = contorni.getAttribute('aria-pressed') !== 'true';
          contorni.setAttribute('aria-pressed', String(acceso));
          scriviPreferenza('contorni', acceso ? '1' : '0');
          mot('contorni', acceso);
        }
      }
    }, [icona('struttura', 'ico ico--mini'), el('span', { testo: 'Mostra i contorni dei blocchi nell\'anteprima' })]);
    preferenze.push(contorni);
  }
  if (haMotore('ricarica')) {
    preferenze.push(el('button', {
      type: 'button', classe: 'opzione',
      title: 'Richiede di nuovo la pagina al server, con le modifiche in corso',
      su: { click: () => { chiudiVista(false); ricaricaOra(); } }
    }, [icona('ricarica', 'ico ico--mini'), el('span', { testo: 'Ricarica l\'anteprima' })]));
  }

  scorri.append(
    el('h3', { classe: 'lato__occhiello', testo: 'Pannello' }),
    el('div', { classe: 'opzioni' }, preferenze),
    el('h3', { classe: 'lato__occhiello', testo: 'Sito' }),
    el('div', { classe: 'opzioni' }, [
      el('a', { classe: 'opzione', href: '/', target: '_blank', rel: 'noopener' }, [
        icona('esterno', 'ico ico--mini'), el('span', { testo: 'Apri il sito pubblicato' })
      ]),
      el('a', {
        classe: 'opzione', href: '/api/anteprima', target: '_blank', rel: 'noopener',
        title: 'La bozza già salvata sul server, senza le modifiche non salvate: comoda da guardare sul telefono'
      }, [icona('esterno', 'ico ico--mini'), el('span', { testo: 'Apri la bozza salvata in una scheda nuova' })])
    ])
  );
}

/** I campi di un gruppo dello schema, uno sotto l'altro. */
function disegnaGruppo(scorri, gruppo) {
  const corpo = el('div', { classe: 'lato__campi' });
  const campi = gruppo.campi || [];
  if (!campi.length) corpo.append(el('p', { classe: 'vuoto', testo: 'Questa sezione non ha campi da modificare.' }));
  for (const campo of campi) {
    const controllo = ponte.creaCampo(campo);
    if (controllo && controllo.nodo) corpo.append(controllo.nodo);
  }
  scorri.append(corpo);
  // Il collegamento a Twitch per i numeri non è un campo dello schema (non
  // c'è niente da scrivere a mano: o si è autorizzati o no), quindi non
  // passa da ponte.creaCampo. Vive solo nella vista «canale».
  if (gruppo.id === 'canale') scorri.append(creaCollegamentoTwitch());
  if (gruppo.id === 'sondaggio') scorri.prepend(rimandoSondaggi());
  if (gruppo.id === 'manutenzione') scorri.append(anteprimaManutenzione());
}

function anteprimaManutenzione() {
  return el('div', { classe: 'spiegazione' }, [
    icona('info'),
    el('div', {}, [
      el('p', { testo: 'La pagina che vedrebbero i visitatori, con i valori già salvati: salva prima, se hai appena cambiato qualcosa qui sopra.' }),
      el('div', { classe: 'lato__azioni' }, [
        el('a', {
          classe: 'btn btn--primario', href: '/api/anteprima/manutenzione', target: '_blank', rel: 'noopener'
        }, [icona('esterno'), el('span', { testo: 'Guarda la pagina di manutenzione' })])
      ])
    ])
  ]);
}

/* =====================================================================
   COLLEGAMENTO A TWITCH PER I NUMERI (follower e abbonati)
   ---------------------------------------------------------------------
   In fondo alla vista «Canale, contatti e immagini»: fa dal browser la
   stessa cosa di «node server/imposta-twitch.js --collega» da terminale
   (server/lib/twitch.js spiega il perché di questa autorizzazione in più
   rispetto al solo Client ID). Serve a chi amministra un hosting senza un
   accesso a riga di comando.

   Il server tiene UN tentativo alla volta (server/lib/api.js,
   collegamentoPendente): qui il browser lo richiama ogni intervalloSec
   finché non arriva una risposta diversa da «in attesa»/«rallenta», o
   finché questo riquadro non esce di scena.

   `generazione` distingue un ciclo di attesa dal successivo: chi preme
   Annulla, o comincia un altro tentativo, la fa avanzare, e un ciclo
   vecchio che si risveglia con `mia !== generazione` si ferma da sé senza
   dover essere inseguito con un flag di cancellazione a parte.
   ===================================================================== */

function rimandoSondaggi() {
  return el('div', { classe: 'spiegazione' }, [
    icona('info'),
    el('div', {}, [
      el('p', { testo: 'Qui ci sono solo le scritte fisse del riquadro. Domanda, risposte e durata si scrivono nella schermata Sondaggi.' }),
      el('div', { classe: 'lato__azioni' }, [
        bottone({ testo: 'Crea o gestisci i sondaggi', ico: 'sondaggio', classe: 'btn btn--primario', su: () => apriVista('sondaggi') })
      ])
    ])
  ]);
}

function creaCollegamentoTwitch() {
  const corpo = el('div', { classe: 'lato__campi' });
  const nodo = el('div', { classe: 'lato__campi' }, [
    el('div', { classe: 'spiegazione' }, [
      icona('info'),
      el('p', { testo: 'Con l\'autorizzazione del canale, follower e abbonati si aggiornano da soli, come «Ultima diretta». Senza, restano i numeri scritti qui sopra.' })
    ]),
    corpo
  ]);

  let generazione = 0;

  function segna(testo) {
    corpo.replaceChildren(el('p', { classe: 'campo__aiuto', testo }));
  }

  function partenza(messaggio) {
    generazione += 1;
    const stato = el('p', {
      classe: 'campo__aiuto',
      testo: messaggio || 'Non ancora collegato: i numeri restano quelli scritti a mano.'
    });
    const btn = bottone({
      testo: 'Collegati per i numeri', ico: 'canale', classe: 'btn btn--primario',
      su: cominciaCollegamento
    });
    corpo.replaceChildren(stato, el('div', { classe: 'lato__azioni' }, [btn]));
  }

  function collegato(login) {
    generazione += 1;
    const stato = el('p', {
      classe: 'campo__aiuto',
      testo: login ? ('Collegato come ' + login + '.') : 'Collegato.'
    });
    const btn = bottone({ testo: 'Scollega', classe: 'btn', su: staccaCollegamento });
    corpo.replaceChildren(stato, el('div', { classe: 'lato__azioni' }, [btn]));
  }

  function inAttesa(avvio) {
    const link = el('a', { href: avvio.indirizzo, target: '_blank', rel: 'noopener', testo: avvio.indirizzo });
    const annulla = bottone({ testo: 'Annulla', classe: 'btn btn--minimo', su: () => partenza() });
    corpo.replaceChildren(
      el('p', { classe: 'campo__aiuto' }, [
        el('span', { testo: 'Apri ' }), link,
        el('span', { testo: ' con l\'account del canale e inserisci questo codice:' })
      ]),
      el('p', {}, [el('code', { testo: avvio.codiceUtente })]),
      el('p', { classe: 'campo__aiuto', testo: 'Aspetto la conferma su Twitch…' }),
      el('div', { classe: 'lato__azioni' }, [annulla])
    );
  }

  function erroreInline(messaggio) {
    partenza();
    avviso(messaggio, { tipo: 'errore', titolo: 'Twitch' });
  }

  async function poll(mia, intervalloMs) {
    while (nodo.isConnected && mia === generazione) {
      await attendi(intervalloMs);
      if (!nodo.isConnected || mia !== generazione) return;

      let esito;
      try {
        esito = await api.twitchCollegaStato();
      } catch (e) {
        erroreInline(e instanceof ErroreApi ? e.message : 'Il collegamento si è interrotto.');
        return;
      }
      if (mia !== generazione) return;   // nel frattempo e' cambiato tutto

      if (esito.stato === 'confermato') {
        collegato(esito.login);
        avviso(
          (esito.numeri && esito.numeri.messaggio) || 'Collegato: follower e abbonati si aggiornano da soli.',
          { tipo: 'ok', titolo: 'Twitch' }
        );
        return;
      }
      if (esito.stato === 'scaduto') { erroreInline('Il codice è scaduto: premi di nuovo Collegati.'); return; }
      if (esito.stato === 'fallito') { erroreInline(esito.messaggio || 'Il collegamento non è riuscito.'); return; }
      if (esito.stato === 'assente') { partenza(); return; }
      if (esito.stato === 'rallenta') { intervalloMs += 5000; }
      // 'in attesa': si continua il ciclo.
    }
  }

  async function cominciaCollegamento() {
    generazione += 1;
    const mia = generazione;
    segna('Chiedo il codice a Twitch…');

    let avvio;
    try {
      avvio = await api.twitchCollega();
    } catch (e) {
      if (mia !== generazione) return;   // hanno gia' premuto Annulla
      erroreInline(e instanceof ErroreApi ? e.message : 'Non sono riuscito a cominciare il collegamento.');
      return;
    }
    if (mia !== generazione) return;

    inAttesa(avvio);
    poll(mia, (Number(avvio.intervalloSec) || 5) * 1000);
  }

  async function staccaCollegamento() {
    const ok = await conferma({
      titolo: 'Togliere il collegamento con Twitch?',
      testo: ['Follower e abbonati smettono di aggiornarsi da soli: tornano i numeri scritti a mano.'],
      conferma: 'Scollega',
      pericolo: true
    });
    if (!ok) return;
    try {
      await api.twitchScollega();
      partenza();
      avviso('Collegamento tolto.', { tipo: 'ok' });
    } catch (e) {
      avviso(e instanceof ErroreApi ? e.message : 'Non sono riuscito a togliere il collegamento.', { tipo: 'errore' });
    }
  }

  // Lo stato di apertura si legge una volta sola, quando il riquadro compare.
  segna('Controllo lo stato del collegamento…');
  api.twitchStato().then((info) => {
    if (!nodo.isConnected) return;
    if (info && info.collegato) collegato(info.login);
    else partenza();
  }).catch((e) => {
    if (!nodo.isConnected) return;
    if (rottaAssente(e)) { partenza('Il server non ha ancora questa funzione: va aggiornato.'); return; }
    partenza();
  });

  return nodo;
}

function disegnaImpostazioni(scorri) {
  const impostazioni = modulo('impostazioni');
  if (impostazioni && typeof impostazioni.disegnaImpostazioni === 'function') {
    try {
      impostazioni.disegnaImpostazioni(scorri);
      return;
    } catch (errore) {
      log('disegnaImpostazioni', errore);
      svuota(scorri);
    }
  }
  // Ripiego senza impostazioni.js: i campi del gruppo e le combinazioni
  // pronte, come prima dell'editor. Mancano i font caricati.
  const gruppo = ponte.gruppo('aspetto');
  scorri.append(el('div', { classe: 'spiegazione' }, [
    icona('info'),
    el('p', { testo: 'Il modulo delle impostazioni (editor/impostazioni.js) non è caricato: qui sotto ci sono colori, font e forma, senza la libreria dei font caricati.' })
  ]));
  if (!gruppo) return;
  const segno = el('div');
  scorri.append(segno);
  disegnaGruppo(scorri, gruppo);
  import('../moduli/tema.js').then((tema) => {
    if (!segno.isConnected || typeof tema.creaBarraTema !== 'function') return;
    const temaServer = opz.stato.tema || {};
    const barra = tema.creaBarraTema({ conferma }, {
      preset: Array.isArray(temaServer.preset) ? temaServer.preset : [],
      predefinito: temaServer.predefinito || null,
      onApplica: (scelta) => {
        const nuovo = scelta && typeof scelta === 'object' && scelta.tema ? scelta.tema : scelta;
        if (!nuovo || typeof nuovo !== 'object') return;
        const attuale = ponte.leggi('config.tema');
        ponte.scrivi('config.tema', { ...(attuale && typeof attuale === 'object' ? attuale : {}), ...nuovo });
        disegna({ forza: true });
        avviso('Abbinamento applicato. Sono modifiche non salvate: guarda l\'anteprima, poi Salva.', { tipo: 'ok' });
      }
    });
    if (barra instanceof Node) segno.replaceWith(barra);
  }).catch((errore) => log('moduli/tema.js', errore));
}

function disegnaStruttura(scorri) {
  const parti = modulo('parti');
  if (parti && typeof parti.disegnaNavigatore === 'function') {
    try {
      parti.disegnaNavigatore(scorri);
      return;
    } catch (errore) {
      log('disegnaNavigatore', errore);
      svuota(scorri);
    }
  }
  scorri.append(segnaposto(
    'Struttura della pagina non disponibile',
    'Il modulo delle sezioni (editor/parti.js) non è caricato: ordine e visibilità delle sezioni per ora non si cambiano. Il resto del pannello funziona.'
  ));
}

function disegnaImmagini(scorri) {
  if (!sh.libreria) sh.libreria = creaLibreria({ modalita: 'gestione', usoDi: opz.usoDi });
  scorri.append(sh.libreria.nodo);
  sh.libreria.aggiorna();
}

function disegnaCopie(scorri) {
  if (!sh.backup) sh.backup = creaBackup({ dopoRipristino: () => opz.ricaricaContenuti('ripristino') });
  scorri.append(sh.backup.nodo);
  sh.backup.aggiorna();
}

function campoPassword(id, etichetta, autocomplete, aiuto) {
  const input = el('input', {
    type: 'password', id, classe: 'campo__input', autocomplete, spellcheck: 'false', required: true
  });
  const nodo = el('div', { classe: 'campo' }, [
    el('label', { classe: 'campo__etichetta', for: id, testo: etichetta }),
    input,
    aiuto ? el('p', { classe: 'campo__aiuto', testo: aiuto }) : null
  ]);
  return { nodo, input };
}

function disegnaPassword(scorri) {
  const attuale = campoPassword('password-attuale', 'Password attuale', 'current-password');
  const nuova = campoPassword('password-nuova', 'Password nuova', 'new-password', 'Almeno ' + MIN_PASSWORD + ' caratteri. Scrivila anche da qualche parte al sicuro.');
  const ripeti = campoPassword('password-ripeti', 'Ripeti la password nuova', 'new-password');
  const errore = el('p', { classe: 'accesso__errore', role: 'alert', hidden: true });
  const invia = bottone({ testo: 'Cambia la password', ico: 'chiave', classe: 'btn btn--primario', tipo: 'submit' });

  const mostraErrore = (testo, campo) => {
    errore.textContent = testo || '';
    errore.hidden = !testo;
    if (campo) { campo.focus(); campo.select(); }
  };

  const form = el('form', { classe: 'lato__modulo', novalidate: true }, [
    el('div', { classe: 'spiegazione' }, [
      icona('info'),
      el('p', { testo: 'Chi ha il pannello aperto su un altro computer o in un\'altra scheda dovrà rientrare con la password nuova. Qui resti dentro.' })
    ]),
    attuale.nodo, nuova.nodo, ripeti.nodo, errore,
    el('div', { classe: 'lato__azioni' }, [invia])
  ]);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostraErrore('');
    if (!attuale.input.value) return mostraErrore('Scrivi la password attuale.', attuale.input);
    if (nuova.input.value.length < MIN_PASSWORD) {
      return mostraErrore('La password nuova deve avere almeno ' + MIN_PASSWORD + ' caratteri.', nuova.input);
    }
    if (nuova.input.value !== ripeti.input.value) return mostraErrore('Le due password nuove non coincidono.', ripeti.input);

    invia.disabled = true;
    try {
      await api.cambiaPassword(attuale.input.value, nuova.input.value);
      attuale.input.value = '';
      nuova.input.value = '';
      ripeti.input.value = '';
      avviso('Password cambiata. Le altre sessioni aperte sono state chiuse.', { tipo: 'ok', titolo: 'Fatto' });
    } catch (e) {
      if (e instanceof ErroreApi && e.stato === 403) mostraErrore('La password attuale non è giusta.', attuale.input);
      else if (e instanceof ErroreApi && e.stato === 422) mostraErrore(e.message, nuova.input);
      else if (e instanceof ErroreApi && e.stato === 401) mostraErrore('');   // ci pensa il ritorno all'accesso
      else mostraErrore(e instanceof ErroreApi ? e.message : 'Non sono riuscito a cambiare la password.');
    } finally {
      invia.disabled = false;
    }
  });

  scorri.append(form);
}

function apriVista(nome) {
  const chiave = String(nome || '');
  const nota = Object.prototype.hasOwnProperty.call(VISTE, chiave) ||
    (chiave.startsWith('gruppo:') && ponte.gruppo(chiave.slice(7))) ||
    (chiave.startsWith('parte:') && modulo('parti') && typeof modulo('parti').disegnaParte === 'function');
  if (!nota || !sh.montato) return false;
  sh.vista = chiave;
  if (stretto() && !sh.cassetto) impostaCassetto(true);
  disegna({ azzeraScorrimento: true, fuoco: true });
  return true;
}

function chiudiVista(ridaiFuoco) {
  if (!sh.vista) return;
  const eraMenu = sh.vista === 'menu';
  sh.vista = null;
  disegna({ fuoco: Boolean(ridaiFuoco) && !eraMenu });
  if (ridaiFuoco && eraMenu) sh.ui.btnMenu.focus();
}

/* =====================================================================
   8. RICERCA DEI CAMPI ED ERRORI: PORTARE AL CAMPO

   L'indice si costruisce dallo schema — etichette, sezione, nome tecnico —
   quindi cresce da solo insieme allo schema. Un risultato porta al campo
   dove sta davvero: l'elemento nell'anteprima se ha un marcatore, la
   parte che lo mostra, la sezione che lo contiene, o la vista del menu.
   ===================================================================== */

function normalizzaTesto(valore) {
  return String(valore || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function costruisciIndice() {
  sh.indice = [];
  for (const gruppo of gruppiSchema()) {
    for (const campo of gruppo.campi || []) {
      const etichetta = campo.etichetta || campo.chiave;
      sh.indice.push({
        gruppo, chiave: campo.chiave, etichetta,
        dove: gruppo.titolo || gruppo.id,
        cerca: normalizzaTesto([etichetta, gruppo.titolo, campo.chiave, campo.aiuto].join(' '))
      });
      // I sottocampi di un elenco si cercano col loro nome ma portano
      // all'elenco che li contiene: è lì che si aprono, uno per voce.
      for (const sotto of Array.isArray(campo.campi) ? campo.campi : []) {
        const nome = sotto.etichetta || sotto.chiave;
        sh.indice.push({
          gruppo, chiave: campo.chiave, etichetta: nome,
          dove: (gruppo.titolo || gruppo.id) + ' · ' + etichetta,
          cerca: normalizzaTesto([nome, etichetta, gruppo.titolo, sotto.chiave].join(' '))
        });
      }
    }
  }
}

/* Le corrispondenze all'inizio dell'etichetta valgono più di quelle in
   mezzo, e quelle sull'etichetta più di quelle sull'aiuto o sulla chiave:
   chi scrive «tit» si aspetta «Titolo» in cima, non «Sottotitolo». */
function cerca(testo) {
  const domanda = normalizzaTesto(testo).trim();
  if (domanda.length < 2) return [];
  const trovati = [];
  for (const voce of sh.indice) {
    const etichetta = normalizzaTesto(voce.etichetta);
    let peso;
    if (etichetta.startsWith(domanda)) peso = 0;
    else if (etichetta.includes(domanda)) peso = 1;
    else if (voce.cerca.includes(domanda)) peso = 2;
    else continue;
    trovati.push({ voce, peso });
  }
  return trovati.sort((a, b) => a.peso - b.peso).slice(0, MAX_RISULTATI).map((t) => t.voce);
}

function chiudiRisultati() {
  const ui = sh.ui;
  if (!ui.risultati) return;
  sh.risultati = [];
  sh.scelto = -1;
  svuota(ui.risultati);
  ui.risultati.hidden = true;
  ui.cerca.setAttribute('aria-expanded', 'false');
  ui.cerca.removeAttribute('aria-activedescendant');
}

function evidenziaScelto() {
  const ui = sh.ui;
  ui.risultati.querySelectorAll('[role="option"]').forEach((nodo, indice) => {
    const acceso = indice === sh.scelto;
    nodo.setAttribute('aria-selected', String(acceso));
    nodo.classList.toggle('is-scelta', acceso);
    if (acceso) {
      ui.cerca.setAttribute('aria-activedescendant', nodo.id);
      nodo.scrollIntoView({ block: 'nearest' });
    }
  });
  if (sh.scelto < 0) ui.cerca.removeAttribute('aria-activedescendant');
}

function disegnaRisultati() {
  const ui = sh.ui;
  svuota(ui.risultati);
  if (!sh.risultati.length) {
    // Resta un'opzione, disattivata: dentro una listbox è l'unico modo
    // perché anche uno screen reader senta che non c'è niente.
    ui.risultati.append(el('li', {
      classe: 'ricerca__vuoto', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false',
      testo: 'Nessun campo con questo nome.'
    }));
    ui.risultati.hidden = false;
    ui.cerca.setAttribute('aria-expanded', 'true');
    ui.cerca.removeAttribute('aria-activedescendant');
    return;
  }
  sh.risultati.forEach((voce, indice) => {
    const nodo = el('li', { classe: 'ricerca__voce', role: 'option', id: 'ricerca-voce-' + indice, 'aria-selected': 'false' }, [
      el('span', { classe: 'ricerca__etichetta', testo: voce.etichetta }),
      el('span', { classe: 'ricerca__dove', testo: voce.dove })
    ]);
    nodo.addEventListener('click', () => sceltaRicerca(voce));
    ui.risultati.append(nodo);
  });
  ui.risultati.hidden = false;
  ui.cerca.setAttribute('aria-expanded', 'true');
  evidenziaScelto();
}

function sceltaRicerca(voce) {
  const ui = sh.ui;
  chiudiRisultati();
  ui.cerca.value = '';
  ui.cercaPulisci.hidden = true;
  vaiAChiave(voce.chiave, { evidenzia: true });
}

function legaRicerca() {
  const ui = sh.ui;
  ui.cerca.addEventListener('input', () => {
    ui.cercaPulisci.hidden = !ui.cerca.value;
    if (!ui.cerca.value.trim()) { chiudiRisultati(); return; }
    sh.risultati = cerca(ui.cerca.value);
    sh.scelto = sh.risultati.length ? 0 : -1;
    disegnaRisultati();
  });

  ui.cerca.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      if (ui.risultati.hidden && !ui.cerca.value) return;
      evento.preventDefault();
      evento.stopPropagation();
      ui.cerca.value = '';
      ui.cercaPulisci.hidden = true;
      chiudiRisultati();
      return;
    }
    if (!sh.risultati.length) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      sh.scelto = (sh.scelto + 1) % sh.risultati.length;
      evidenziaScelto();
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      sh.scelto = (sh.scelto - 1 + sh.risultati.length) % sh.risultati.length;
      evidenziaScelto();
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      sceltaRicerca(sh.risultati[sh.scelto >= 0 ? sh.scelto : 0]);
    }
  });

  /* Il clic su un risultato non deve togliere il fuoco alla casella prima
     che il clic arrivi: senza, la lista si chiuderebbe a metà strada. */
  ui.risultati.addEventListener('pointerdown', (evento) => evento.preventDefault());
  ui.cerca.addEventListener('blur', () => {
    setTimeout(() => { if (document.activeElement !== ui.cerca) chiudiRisultati(); }, 0);
  });
  ui.cercaPulisci.addEventListener('click', () => {
    ui.cerca.value = '';
    ui.cercaPulisci.hidden = true;
    chiudiRisultati();
    ui.cerca.focus();
  });
}

function apriRicerca() {
  if (!sh.montato) return;
  if (stretto() && !sh.cassetto) impostaCassetto(true);
  sh.ui.cerca.focus();
  sh.ui.cerca.select();
}

/* --- portare al campo ---------------------------------------------- */

let timerSegnale = null;

/** Scorre solo lo scorrimento del pannello: mai la pagina intera. */
function scorriNelPannello(nodo) {
  const scorri = nodo.closest('[data-scorri]');
  if (!scorri) return;
  const r = nodo.getBoundingClientRect();
  const s = scorri.getBoundingClientRect();
  const alto = scorri.scrollTop + (r.top - s.top) - Math.max(16, (scorri.clientHeight - Math.min(r.height, scorri.clientHeight)) / 2);
  scorri.scrollTo({ top: Math.max(0, Math.round(alto)), behavior: menoMovimento() ? 'auto' : 'smooth' });
}

function segnalaCampo(nodo) {
  if (timerSegnale) clearTimeout(timerSegnale);
  for (const vecchio of sh.ui.lato.querySelectorAll('.is-trovato')) vecchio.classList.remove('is-trovato');
  nodo.classList.add('is-trovato');
  timerSegnale = setTimeout(() => { nodo.classList.remove('is-trovato'); timerSegnale = null; }, 1600);
}

function portaSu(controllo, { evidenzia = false } = {}) {
  if (!controllo || !controllo.nodo || !controllo.nodo.isConnected) return false;
  const box = controllo.nodo.closest('.lato__scheda');
  if (box && box.hidden) impostaScheda(box.dataset.scheda);
  if (stretto() && !sh.cassetto) impostaCassetto(true);
  apriVoci(controllo.nodo);
  scorriNelPannello(controllo.nodo);
  if (controllo.fuoco) {
    try { controllo.fuoco(); } catch (errore) { log('fuoco', errore); }
  }
  if (evidenzia) segnalaCampo(controllo.nodo);
  return true;
}

/** Il controllo visibile per la chiave, se c'è. */
function controlloVisibile(chiave) {
  const controllo = opz.controlloPer(chiave);
  return controllo && visibile(controllo.nodo) ? controllo : null;
}

/* I controlli di una scheda o di una vista possono arrivare un attimo
   dopo il disegno (un modulo che aspetta un dato): si riprova per poco. */
async function aspettaControllo(chiave) {
  for (const attesa of [0, 60, 200, 450]) {
    if (attesa) await attendi(attesa);
    const controllo = controlloVisibile(chiave);
    if (controllo) return controllo;
  }
  return null;
}

/** Id da selezionare nell'anteprima per mostrare il campo, o ''. */
function bersaglioInPagina(chiave, gruppo) {
  const doc = documentoAnteprima();
  if (!doc || !haMotore('seleziona')) return '';
  const v = perSelettore(chiave);
  if (doc.querySelector('[data-sb-testo="' + v + '"]')) return 'testo:' + chiave;
  if (doc.querySelector('[data-sb-immagine="' + v + '"]')) return 'immagine:' + chiave;
  const conAlt = doc.querySelector('[data-sb-alt="' + v + '"][data-sb-immagine]');
  if (conAlt) return 'immagine:' + conAlt.getAttribute('data-sb-immagine');

  const nomi = modulo('nomi');
  if (nomi && typeof nomi.partiDellaChiave === 'function') {
    let parti = [];
    try { parti = nomi.partiDellaChiave(chiave, opz.stato.schema) || []; } catch (errore) { log('partiDellaChiave', errore); }
    const presente = parti.find((p) => doc.querySelector('[data-sb-parte="' + perSelettore(p) + '"]'));
    if (presente) return 'parte:' + presente;
    // Sta in una parte che la pagina adesso non stampa: la sezione non lo
    // mostrerebbe, ci pensa la vista della parte (vaiAChiave).
    if (parti.length) return '';
  }
  if (gruppo && !VISTA_DEL_GRUPPO[gruppo.id] && nomi && typeof nomi.sezioneDelGruppo === 'function') {
    let sezione = '';
    try { sezione = nomi.sezioneDelGruppo(gruppo.id) || ''; } catch (errore) { log('sezioneDelGruppo', errore); }
    if (sezione && doc.querySelector('[data-sb-sezione="' + perSelettore(sezione) + '"]')) return 'sezione:' + sezione;
  }
  return '';
}

/**
 * Porta al campo della chiave: prima quello già a video, poi l'elemento
 * nell'anteprima (testo, immagine, parte, sezione), poi la vista del
 * menu; se niente di questo lo mostra, la vista del suo gruppo.
 */
async function vaiAChiave(chiaveGrezza, { evidenzia = false } = {}) {
  if (!sh.montato) return false;
  const chiave = normalizzaChiave(chiaveGrezza);

  /* I tre rami dell'editor non hanno campi nello schema (§2.4). */
  if (chiave.startsWith('config.stili.')) {
    const id = chiave.slice('config.stili.'.length);
    sh.vista = null;
    const meta = mot('seleziona', id);
    if (meta) {
      mot('scorriA', id);
      if (!sh.selezione || sh.selezione.id !== meta.id) suSelezione(meta);
      else disegna({ azzeraScorrimento: true });
      impostaScheda('stile');
      return true;
    }
    disegna();
    avviso('Lo stile che il server ha rifiutato è di un elemento che adesso non è nella pagina (' + id + ').', { tipo: 'info' });
    return false;
  }
  if (chiave === 'config.stili') {
    avviso('Il server ha rifiutato gli stili degli elementi: seleziona l\'elemento cambiato per ultimo e guarda la scheda Stile.', { tipo: 'info' });
    return false;
  }
  if (chiave === 'config.sezioni' || chiave.startsWith('config.sezioni.')) return apriVista('struttura');
  if (chiave === 'config.disposizione' || chiave.startsWith('config.disposizione.')) {
    chiudiVista(false);
    avviso('Il server ha rifiutato la posizione dei blocchi: seleziona il blocco spostato, e in Avanzate premi «Riporta al posto originale».', { tipo: 'info' });
    return false;
  }

  let controllo = controlloVisibile(chiave);
  if (controllo) return portaSu(controllo, { evidenzia });

  const gruppo = ponte.gruppoDi(chiave);
  const campo = gruppo ? (gruppo.campi || []).find((c) => chiave === c.chiave || chiave.startsWith(c.chiave + '.')) : null;
  const chiaveCampo = campo ? campo.chiave : chiave;

  const id = bersaglioInPagina(chiaveCampo, gruppo);
  if (id) {
    sh.vista = null;
    const meta = mot('seleziona', id);
    if (meta) {
      mot('scorriA', id);
      // Il motore avvisa gli iscritti solo se la selezione cambia: se era
      // già questa, o se una vista copriva il pannello, si ridisegna qui.
      if (!sh.selezione || sh.selezione.id !== meta.id) suSelezione(meta);
      else disegna({ azzeraScorrimento: true });
      impostaScheda('contenuto');
      controllo = await aspettaControllo(chiave);
      if (controllo) return portaSu(controllo, { evidenzia });
    }
  }

  // Il campo sta in una parte che adesso non è nella pagina (pollo spento,
  // clip spente): PARTI la disegna anche fuori dall'anteprima.
  const nomi = modulo('nomi');
  if (nomi && typeof nomi.partiDellaChiave === 'function') {
    let parti = [];
    try { parti = nomi.partiDellaChiave(chiaveCampo, opz.stato.schema) || []; } catch (errore) { log('partiDellaChiave', errore); }
    if (parti.length && apriVista('parte:' + parti[0])) {
      controllo = await aspettaControllo(chiave);
      if (controllo) return portaSu(controllo, { evidenzia });
    }
  }

  if (gruppo) {
    apriVista(VISTA_DEL_GRUPPO[gruppo.id] || 'gruppo:' + gruppo.id);
    controllo = await aspettaControllo(chiave);
    if (!controllo && VISTA_DEL_GRUPPO[gruppo.id]) {
      // La vista c'è ma non disegna quel campo (modulo di un altro agente
      // che lo mette altrove): il gruppo intero non lo perde mai.
      apriVista('gruppo:' + gruppo.id);
      controllo = await aspettaControllo(chiave);
    }
    if (controllo) return portaSu(controllo, { evidenzia });
  }

  disegna();
  avviso('Non trovo più questo campo nel pannello: ricarica la pagina.', { tipo: 'info' });
  return false;
}

/* --- riepilogo degli errori --------------------------------------- */

function descriviChiave(chiave) {
  if (chiave.startsWith('config.stili')) return 'Stile di un elemento';
  if (chiave.startsWith('config.sezioni')) return 'Struttura della pagina';
  if (chiave.startsWith('config.disposizione')) return 'Posizione dei blocchi';
  const gruppo = ponte.gruppoDi(chiave);
  const campo = gruppo ? (gruppo.campi || []).find((c) => chiave === c.chiave || chiave.startsWith(c.chiave + '.')) : null;
  return [gruppo && gruppo.titolo, campo && (campo.etichetta || campo.chiave)].filter(Boolean).join(' · ') || chiave;
}

function mostraErrori(elenco, { soloRiepilogo = false } = {}) {
  sh.errori = Array.isArray(elenco) ? elenco : [];
  const ui = sh.ui;
  if (!ui.riepilogo) return;
  svuota(ui.riepilogo);
  if (!sh.errori.length) {
    ui.riepilogo.hidden = true;
    return;
  }

  ui.riepilogo.append(el('p', {
    classe: 'riepilogo__titolo',
    testo: sh.errori.length === 1
      ? 'Il server ha rifiutato il salvataggio: c\'è un campo da correggere.'
      : 'Il server ha rifiutato il salvataggio: ci sono ' + sh.errori.length + ' campi da correggere.'
  }));
  const lista = el('ul');
  for (const errore of sh.errori) {
    const salto = el('button', { type: 'button', su: { click: () => vaiAChiave(errore.chiave, { evidenzia: true }) } }, [
      el('span', { testo: descriviChiave(errore.chiave) }),
      opz.nomiTecnici() ? el('code', { testo: errore.chiave }) : null
    ]);
    lista.append(el('li', {}, [salto, el('span', { classe: 'riepilogo__messaggio', testo: errore.messaggio })]));
  }
  ui.riepilogo.append(lista);
  ui.riepilogo.hidden = false;
  if (!soloRiepilogo) vaiAChiave(sh.errori[0].chiave);
}

/* =====================================================================
   9. SELEZIONE E SINCRONIZZAZIONE DELL'ANTEPRIMA
   ===================================================================== */

function seleziona(id) {
  if (!haMotore('seleziona')) return null;
  const meta = mot('seleziona', id === undefined ? null : id);
  // Deselezione con un motore che non avvisa: si allinea a mano.
  if (!id && sh.selezione && !mot('selezione')) {
    sh.selezione = null;
    disegna({ azzeraScorrimento: true });
  }
  return meta;
}

function suSelezione(meta) {
  meta = meta || null;
  if (!meta && sh.ricaricando) return;     // l'anteprima si sta ricaricando: la selezione torna subito
  const prima = sh.selezione;
  const stesso = Boolean(meta && prima && meta.id === prima.id);
  sh.selezione = meta;
  if (!sh.montato || sh.sospeso) return;

  if (meta && !stesso) {
    sh.vista = null;
    if (stretto() && !sh.cassetto) impostaCassetto(true);
    disegna({ azzeraScorrimento: true });
    return;
  }
  if (!meta) {
    if (prima && !sh.vista) disegna({ azzeraScorrimento: true });
    else aggiornaBarra();
    return;
  }
  // Stesso elemento: clic ripetuto o anteprima ricaricata.
  if (sh.vista) {
    if (!sh.ricaricando && !fuocoNelPannello()) { sh.vista = null; disegna({ azzeraScorrimento: true }); }
    return;
  }
  // Con il fuoco nel pannello i controlli restano come sono: chi scrive
  // non perde il campo. Altrimenti la scheda si rifà con il meta nuovo.
  if (!fuocoNelPannello()) disegna();
  else aggiornaBarra();
}

function suModifica(evento) {
  if (!sh.montato || sh.applicando) return;
  programmaIstantanea();
  if (!sh.motore) return;

  const { chiave = '', strutturale = false } = (evento && evento.detail) || {};
  if (!strutturale && chiave) {
    if (chiave === 'config.tema' || chiave.startsWith('config.tema.')) { mot('aggiornaTema'); return; }
    if (chiave === 'config.stili' || chiave.startsWith('config.stili.')) { mot('aggiornaStili'); return; }
    if (chiave === 'config.disposizione' || chiave.startsWith('config.disposizione.')) { mot('aggiornaDisposizione'); return; }
    if (chiave.startsWith('config.immagini.') || !chiave.startsWith('config')) {
      mot('aggiornaTesti');
      // Un testo senza marcatore (nella <head>, in un attributo, in un
      // testo misto come «© 2026 …») aggiornaTesti non lo raggiunge: la
      // pagina si rifà come per tutto il resto, così l'anteprima non mente.
      if (!haMarcatore(chiave)) programmaRicarica();
      return;
    }
  }
  programmaRicarica();
}

function programmaRicarica() {
  if (!haMotore('ricarica')) return;
  clearTimeout(sh.timerRicarica);
  sh.timerRicarica = setTimeout(ricaricaOra, ATTESA_RICARICA);
}

/* Durante una ricarica chiesta da qui la selezione si conserva: il motore
   riseleziona lo stesso elemento a pagina pronta, e fino ad allora il
   pannello resta com'è (niente salto a «Pagina», niente fuoco perso). */
function ricaricaOra() {
  clearTimeout(sh.timerRicarica);
  sh.timerRicarica = null;
  if (!haMotore('ricarica')) return;

  let finito = false;
  function fine() {
    if (finito) return;
    finito = true;
    if (sh.fineRicarica === fine) sh.fineRicarica = null;
    clearTimeout(sh.riservaRicarica);
    sh.ricaricando = false;
    sincronizzaDispositivo();
    const attuale = mot('selezione') || null;
    if (!attuale && sh.selezione && !sh.vista) {
      sh.selezione = null;
      disegna({ azzeraScorrimento: true });
    } else if (attuale && (!sh.selezione || attuale.id !== sh.selezione.id)) {
      suSelezione(attuale);
    } else if (attuale) {
      sh.selezione = attuale;
      aggiornaBarra();
    }
  }

  if (sh.fineRicarica) sh.fineRicarica();
  sh.ricaricando = true;
  sh.fineRicarica = fine;
  clearTimeout(sh.riservaRicarica);
  sh.riservaRicarica = setTimeout(fine, RISERVA_RICARICA);
  let risultato;
  try {
    risultato = sh.motore.ricarica({ tieniScorrimento: true });
  } catch (errore) {
    log('motore.ricarica', errore);
    fine();
    return;
  }
  if (risultato && typeof risultato.then === 'function') risultato.then(null, (errore) => { log('motore.ricarica', errore); fine(); });
}

function suAnteprimaPronta() {
  if (sh.fineRicarica) sh.fineRicarica();
  if (!sh.montato) return;
  sincronizzaDispositivo();
  aggiornaBarra();
}

/** Tutto quello che si riallinea dal vivo, e poi la pagina intera. */
function riallineaTutto() {
  mot('aggiornaTema');
  mot('aggiornaTesti');
  mot('aggiornaStili');
  mot('aggiornaDisposizione');
  ricaricaOra();
}

/**
 * `stato.dati` è un oggetto nuovo (Annulla/Ripeti, ripristino, nuovo
 * accesso): lo si annuncia, si riallinea l'anteprima e si ridisegna tutto.
 */
function sostituito(motivo, { azzera = true, fresco = false } = {}) {
  if (azzera) azzeraStoria();
  if (fresco) {
    sh.vista = null;
    if (sh.selezione) seleziona(null);
    sh.selezione = null;
  }
  sh.disegnate = {};
  sh.navVecchio = true;
  costruisciIndice();
  document.dispatchEvent(new CustomEvent('sb:sostituito', { detail: { motivo } }));
  opz.dopoSostituzione();
  if (sh.motore) riallineaTutto();
  disegna({ forza: true, azzeraScorrimento: fresco, sostituito: true });
}

/* =====================================================================
   10. ANNULLA / RIPETI
   Istantanee JSON di { testi, config }, prese su sb:modifica dopo 400 ms
   di calma, al massimo 50. Il ripristino crea un oggetto `dati` nuovo
   (sb:sostituito): chi ne tiene copie le rilegge.
   ===================================================================== */

function istantanea() {
  const dati = opz && opz.stato.dati;
  if (!dati) return null;
  try {
    return JSON.stringify({ testi: dati.testi, config: dati.config });
  } catch (errore) {
    log('istantanea', errore);
    return null;
  }
}

function azzeraStoria() {
  const s = sh.storia;
  clearTimeout(s.timer);
  s.timer = null;
  s.indietro = [];
  s.avanti = [];
  s.base = istantanea();
  aggiornaStoria();
}

function programmaIstantanea() {
  const s = sh.storia;
  clearTimeout(s.timer);
  s.timer = setTimeout(fissaIstantanea, ATTESA_ISTANTANEA);
  aggiornaStoria();
}

function fissaIstantanea() {
  const s = sh.storia;
  clearTimeout(s.timer);
  s.timer = null;
  const attuale = istantanea();
  if (attuale === null) { aggiornaStoria(); return; }
  if (s.base === null) {
    s.base = attuale;
  } else if (attuale !== s.base) {
    s.indietro.push(s.base);
    if (s.indietro.length > MAX_STORIA) s.indietro.splice(0, s.indietro.length - MAX_STORIA);
    s.base = attuale;
    s.avanti = [];
  }
  aggiornaStoria();
}

function passoStoria(verso) {
  if (!sh.montato || !opz.stato.dati) return;
  const s = sh.storia;
  if (s.timer) fissaIstantanea();
  const da = verso < 0 ? s.indietro : s.avanti;
  const a = verso < 0 ? s.avanti : s.indietro;
  if (!da.length) {
    avviso(verso < 0 ? 'Non c\'è niente da annullare.' : 'Non c\'è niente da ripetere.', { tipo: 'info', durata: 2500 });
    return;
  }
  const obiettivo = da.pop();
  let dati;
  try {
    dati = JSON.parse(obiettivo);
  } catch (errore) {
    log('storia', errore);
    aggiornaStoria();
    return;
  }
  a.push(s.base);
  s.base = obiettivo;

  const vecchi = opz.stato.dati;
  sh.applicando = true;
  try {
    opz.stato.dati = {
      versione: vecchi.versione,
      aggiornatoIl: vecchi.aggiornatoIl,
      testi: dati.testi || {},
      config: dati.config || {}
    };
    sostituito(verso < 0 ? 'annulla' : 'ripeti', { azzera: false });
  } finally {
    sh.applicando = false;
  }
  aggiornaStoria();
  avviso(verso < 0 ? 'Modifica annullata.' : 'Modifica ripetuta.', { tipo: 'info', durata: 2200 });
}

function aggiornaStoria() {
  const ui = sh.ui;
  if (!ui.btnAnnulla) return;
  const s = sh.storia;
  ui.btnAnnulla.disabled = !(s.indietro.length || s.timer);
  ui.btnRipeti.disabled = !(s.avanti.length && !s.timer);
}

/* =====================================================================
   11. BARRA ALTA, CASSETTO, LARGHEZZA
   ===================================================================== */

function aggiornaBarra() {
  const ui = sh.ui;
  if (!ui.nomeSelezione) return;
  const nome = sh.vista ? titoloVista(sh.vista) : etichettaDi(sh.selezione);
  if (ui.nomeSelezione.textContent !== nome) ui.nomeSelezione.textContent = nome;
  ui.nomeSelezione.title = nome;
  ui.btnMenu.setAttribute('aria-expanded', String(sh.vista === 'menu'));
  aggiornaStoria();
}

function sincronizzaDispositivo(forza = false) {
  const ui = sh.ui;
  if (!ui.dispositivi) return;
  let d = mot('dispositivo');
  if (!DISPOSITIVI.includes(d)) d = sh.dispositivo || 'computer';
  if (d === sh.dispositivo && !forza) return;
  sh.dispositivo = d;
  for (const b of ui.dispositivi) b.setAttribute('aria-pressed', String(b.dataset.dispositivo === d));
  ui.palco.dataset.dispositivo = d;
}

function impostaCassetto(aperto) {
  sh.cassetto = Boolean(aperto);
  const ui = sh.ui;
  if (!ui.banco) return;
  ui.banco.classList.toggle('is-cassetto-aperto', sh.cassetto);
  ui.btnCassetto.setAttribute('aria-expanded', String(sh.cassetto));
  aggiornaInerte();
}

function aggiornaInerte() {
  const spento = stretto() && !sh.cassetto;
  if (spento) sh.ui.lato.setAttribute('inert', '');
  else sh.ui.lato.removeAttribute('inert');
}

function legaBarra() {
  const ui = sh.ui;

  for (const b of ui.dispositivi) {
    b.addEventListener('click', () => {
      mot('impostaDispositivo', b.dataset.dispositivo);
      sincronizzaDispositivo(true);
    });
  }
  ui.btnAnnulla.addEventListener('click', () => passoStoria(-1));
  ui.btnRipeti.addEventListener('click', () => passoStoria(1));

  ui.btnMenu.addEventListener('click', () => {
    if (sh.vista === 'menu' && (!stretto() || sh.cassetto)) chiudiVista(true);
    else apriVista('menu');
  });

  const spiaManutenzione = $('spia-manutenzione');
  if (spiaManutenzione) spiaManutenzione.addEventListener('click', () => apriVista('manutenzione'));

  ui.btnCassetto.addEventListener('click', () => {
    impostaCassetto(!sh.cassetto);
    if (sh.cassetto) {
      const t = ui.lato.querySelector('.lato__modo:not([hidden]) .lato__titolo');
      if (t) t.focus();
    }
  });

  if (window.matchMedia) {
    sh.mqStretto = window.matchMedia(STRETTO);
    sh.mqStretto.addEventListener('change', () => {
      if (!stretto()) impostaCassetto(false);
      aggiornaInerte();
      applicaLarghezza(sh.larghezza, false);
    });
  }

  // Il motore avvisa a ogni cambio di dispositivo, anche quelli chiesti da STILE.
  document.addEventListener('sb:dispositivo', () => sincronizzaDispositivo());
  document.addEventListener('sb:apri-vista', (evento) => {
    const d = (evento && evento.detail) || {};
    if (d.vista) apriVista(d.vista);
  });
  /* La scrittura sul posto può partire con un doppio clic nell'anteprima
     mentre è aperta Stile o Avanzate, o una vista del menu: la barra di
     formattazione, il contatore e «Fatto» stanno nella scheda Contenuto
     (CONTENUTI), che va portata davanti. Alla chiusura la scheda resta. */
  document.addEventListener('sb:scrittura', (evento) => {
    const d = (evento && evento.detail) || {};
    if (!sh.montato || sh.sospeso || !d.aperta) return;
    if (sh.vista) {
      sh.vista = null;
      disegna({ azzeraScorrimento: true });
    }
    if (stretto() && !sh.cassetto) impostaCassetto(true);
    impostaScheda('contenuto');
  });

  /* Con una vista del menu aperta, un clic nell'anteprima vuol dire «torno
     a lavorare sulla pagina». Se il clic cade su un elemento diverso ci
     pensa suSelezione; se cade su quello già selezionato il motore non
     avvisa nessuno (non è cambiato niente), e la vista resterebbe davanti.
     Il fuoco che passa all'iframe è il segnale che il clic c'è stato. */
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (!sh.montato || sh.sospeso || !sh.vista || !sh.selezione || sh.ricaricando) return;
      const attivo = document.activeElement;
      if (attivo && attivo.tagName === 'IFRAME' && sh.ui.anteprima.contains(attivo)) {
        sh.vista = null;
        disegna({ azzeraScorrimento: true });
      }
    }, 0);
  });

  // Un modulo che registra i suoi controlli in ritardo: si ridisegna la scheda.
  document.addEventListener('sb:ispettori', () => {
    if (!sh.montato || sh.modo !== 'elemento' || fuocoNelPannello()) return;
    sh.disegnate = {};
    disegna();
  });
}

function larghezzaReale(preferita) {
  const spazio = (sh.ui.banco && sh.ui.banco.clientWidth) || window.innerWidth || 0;
  let massima = LARGHEZZA_MAX;
  if (spazio) massima = Math.min(LARGHEZZA_MAX, Math.max(LARGHEZZA_MIN, spazio - ANTEPRIMA_MIN));
  return Math.round(Math.min(massima, Math.max(LARGHEZZA_MIN, preferita)));
}

function applicaLarghezza(preferita, salva) {
  const ui = sh.ui;
  sh.larghezza = Math.round(Math.min(LARGHEZZA_MAX, Math.max(LARGHEZZA_MIN, Number(preferita) || LARGHEZZA_DI_SERIE)));
  const reale = larghezzaReale(sh.larghezza);
  ui.banco.style.setProperty('--lato-larghezza', reale + 'px');
  ui.maniglia.setAttribute('aria-valuenow', String(reale));
  ui.maniglia.setAttribute('aria-valuetext', reale + ' pixel');
  if (salva) scriviPreferenza('larghezza', String(sh.larghezza));
  avvisaRidimensionamento();
}

/* Chi misura su «resize» (il motore per lo zoom, i moduli con le loro
   misure) si riallinea quando cambia lo spazio dell'anteprima. */
function avvisaRidimensionamento() {
  if (sh.rafResize) return;
  sh.rafResize = requestAnimationFrame(() => {
    sh.rafResize = 0;
    sh.resizeNostro = true;
    try { window.dispatchEvent(new Event('resize')); } finally { sh.resizeNostro = false; }
  });
}

function legaManiglia() {
  const ui = sh.ui;
  const barra = ui.maniglia;

  barra.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0 || stretto()) return;
    evento.preventDefault();
    // preventDefault toglie anche il fuoco del clic: lo si rimette, così
    // dopo aver afferrato la maniglia le frecce continuano a regolarla.
    try { barra.focus({ preventScroll: true }); } catch { /* il trascinamento funziona lo stesso */ }
    const inizioX = evento.clientX;
    const inizioL = larghezzaReale(sh.larghezza);
    try { barra.setPointerCapture(evento.pointerId); } catch { /* il trascinamento funziona lo stesso */ }
    ui.banco.classList.add('is-ridimensiona');

    const muovi = (e) => applicaLarghezza(inizioL + (e.clientX - inizioX), false);
    const lascia = () => {
      barra.removeEventListener('pointermove', muovi);
      barra.removeEventListener('pointerup', lascia);
      barra.removeEventListener('pointercancel', lascia);
      ui.banco.classList.remove('is-ridimensiona');
      applicaLarghezza(larghezzaReale(sh.larghezza), true);
    };
    barra.addEventListener('pointermove', muovi);
    barra.addEventListener('pointerup', lascia);
    barra.addEventListener('pointercancel', lascia);
  });

  barra.addEventListener('dblclick', () => applicaLarghezza(LARGHEZZA_DI_SERIE, true));

  barra.addEventListener('keydown', (evento) => {
    const attuale = larghezzaReale(sh.larghezza);
    const passoL = evento.shiftKey ? 64 : 16;
    let prossima = null;
    if (evento.key === 'ArrowLeft' || evento.key === 'ArrowDown') prossima = attuale - passoL;
    else if (evento.key === 'ArrowRight' || evento.key === 'ArrowUp') prossima = attuale + passoL;
    else if (evento.key === 'Home') prossima = LARGHEZZA_MIN;
    else if (evento.key === 'End') prossima = LARGHEZZA_MAX;
    else if (evento.key === 'Enter') prossima = LARGHEZZA_DI_SERIE;
    if (prossima === null) return;
    evento.preventDefault();
    applicaLarghezza(larghezzaReale(prossima), true);
  });

  window.addEventListener('resize', () => {
    if (sh.resizeNostro || !sh.montato) return;
    const reale = larghezzaReale(sh.larghezza);
    if (ui.banco.style.getPropertyValue('--lato-larghezza') !== reale + 'px') applicaLarghezza(sh.larghezza, false);
  });
}

/* =====================================================================
   12. TASTIERA
   Le scorciatoie premute dentro l'anteprima le rilancia il motore sul
   document del pannello: basta ascoltare qui. Ctrl+S è di pannello.js.
   ===================================================================== */

function tastoStoria(evento) {
  if (!(evento.ctrlKey || evento.metaKey) || evento.altKey) return 0;
  const tasto = String(evento.key || '').toLowerCase();
  if (tasto === 'z') return evento.shiftKey ? 1 : -1;
  if (tasto === 'y') return 1;
  return 0;
}

function suTasto(evento) {
  if (!sh.montato || sh.sospeso || evento.defaultPrevented || !appVisibile()) return;

  const comando = (evento.ctrlKey || evento.metaKey) && !evento.altKey;
  if (comando && String(evento.key || '').toLowerCase() === 'k') {
    // Dentro l'editor di testo ricco Ctrl+K è la scorciatoia del link.
    const dentro = document.activeElement;
    if (dentro && dentro.isContentEditable) return;
    if (dialogoAperto()) return;
    evento.preventDefault();
    apriRicerca();
    return;
  }

  const verso = tastoStoria(evento);
  if (verso) {
    if (dialogoAperto() || staScrivendo(evento.target) || staScrivendo(document.activeElement)) return;
    evento.preventDefault();
    passoStoria(verso);
    return;
  }

  if (evento.key === 'Escape' && !comando && !dialogoAperto()) {
    if (staScrivendo(evento.target)) return;
    const nelPannello = sh.ui.lato.contains(evento.target);
    if (sh.vista && (nelPannello || evento.target === document.body || evento.target === document || evento.target === sh.ui.btnMenu)) {
      evento.preventDefault();
      chiudiVista(true);
    } else if (stretto() && sh.cassetto && (nelPannello || evento.target === sh.ui.btnCassetto)) {
      evento.preventDefault();
      impostaCassetto(false);
      sh.ui.btnCassetto.focus();
    }
  }
}

/* =====================================================================
   13. AVVIO E INTERFACCIA PER PANNELLO.JS
   ===================================================================== */

async function monta() {
  const ui = sh.ui;
  Object.assign(ui, {
    banco: $('banco'),
    lato: $('pannello'),
    maniglia: $('maniglia'),
    palco: $('palco'),
    anteprima: $('anteprima'),
    btnMenu: $('btn-menu'),
    btnCassetto: $('btn-cassetto'),
    nomeSelezione: $('nome-selezione'),
    btnAnnulla: $('btn-annulla'),
    btnRipeti: $('btn-ripeti'),
    dispositivi: Array.from(document.querySelectorAll('#barra [data-dispositivo]'))
  });
  if (!ui.banco || !ui.lato || !ui.anteprima || !ui.maniglia) {
    throw new Error('pannello/index.html non ha la struttura dell\'editor (#banco, #pannello, #anteprima, #maniglia)');
  }

  const scheda = leggiPreferenza('scheda', 'contenuto');
  sh.scheda = SCHEDE.some((s) => s.id === scheda) ? scheda : 'contenuto';

  costruisciPannello();
  legaBarra();
  legaManiglia();
  applicaLarghezza(Number(leggiPreferenza('larghezza', String(LARGHEZZA_DI_SERIE))), false);
  impostaCassetto(false);

  document.addEventListener('sb:modifica', suModifica);
  document.addEventListener('sb:anteprima-pronta', suAnteprimaPronta);
  document.addEventListener('keydown', suTasto);

  sh.montato = true;
  sh.sospeso = false;
  disegna({ azzeraScorrimento: true });

  await caricaModuli();
  sh.navVecchio = true;
  disegna({ forza: true });
  await montaMotore();
}

async function avvia({ motivo = 'accesso' } = {}) {
  costruisciIndice();
  if (!sh.montato) {
    if (!sh.montaggio) sh.montaggio = monta();
    try {
      await sh.montaggio;
    } catch (errore) {
      sh.montaggio = null;
      log('montaggio', errore);
      avviso('L\'editor non si è montato: ' + errore.message, { tipo: 'errore', durata: 0 });
      return;
    }
    sh.sospeso = false;
    azzeraStoria();
  } else {
    sh.sospeso = false;
    sostituito(motivo === 'ripristino' ? 'ripristino' : 'ricarica', { fresco: motivo === 'accesso' });
  }
  sh.navVecchio = true;
  if (motivo === 'accesso') document.dispatchEvent(new CustomEvent('sb:pronto', { detail: {} }));
  disegna({ forza: true });
  aggiornaPubblicazione(opz.testoPubblicazione());
  aggiornaPassi(opz.passoAdesso());
}

function aggiornaPassi(adesso) {
  if (!sh.ui.passi) return;
  for (const nodo of sh.ui.passi.querySelectorAll('[data-passo]')) {
    nodo.classList.toggle('is-adesso', nodo.dataset.passo === adesso);
  }
}

function aggiornaPubblicazione(info) {
  if (!sh.ui.pubblicazione || !info) return;
  sh.ui.pubblicazione.textContent = info.testo;
  sh.ui.pubblicazione.title = info.titolo || '';
  sh.ui.pubblicazione.dataset.daFare = info.daFare ? '1' : '0';
}

/**
 * Crea il guscio. Una volta sola: le chiamate successive tornano lo
 * stesso oggetto con le funzioni aggiornate.
 * @param {object} funzioni  vedi pannello.js → caricaGuscio()
 */
export function creaGuscio(funzioni) {
  opz = funzioni;
  return {
    avvia,

    /** Rientro dopo la sessione scaduta: dati tenuti, anteprima da rifare. */
    riprendi() {
      if (!sh.montato) return;
      sh.sospeso = false;
      document.dispatchEvent(new CustomEvent('sb:pronto', { detail: {} }));
      if (sh.motore) ricaricaOra();
      disegna({ forza: true });
    },

    /** L'app si nasconde (accesso): niente disegni fino al prossimo avvio. */
    sospendi({ uscita = false } = {}) {
      sh.sospeso = true;
      clearTimeout(sh.timerRicarica);
      chiudiRisultati();
      if (uscita) {
        sh.vista = null;
        sh.vistaDisegnata = null;
        mostraErrori([]);
        impostaCassetto(false);
        azzeraStoria();
      }
    },

    /** Ridisegna schede e viste (per esempio dopo «nomi tecnici»). */
    ridisegna() {
      sh.disegnate = {};
      sh.navVecchio = true;
      if (sh.vista === 'menu') {
        disegna();
        return;
      }
      disegna({ forza: true });
      if (sh.errori.length) mostraErrori(sh.errori, { soloRiepilogo: true });
    },

    mostraErrori,
    portaSu,
    vaiAChiave,
    apriRicerca,
    aggiornaPassi,
    aggiornaPubblicazione
  };
}
