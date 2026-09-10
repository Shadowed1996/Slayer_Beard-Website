/* =====================================================================
   pannello.js — l'orchestratore.

   Tiene insieme cinque cose e nient'altro:
     1. l'accesso (entra, crea la password al primo avvio, esci);
     2. la bozza in memoria e il confronto con l'ultima versione salvata;
     3. la colonna dei gruppi, la ricerca dei campi e il form, costruiti
        dallo schema che arriva da GET /api/contenuti — qui dentro non c'è
        il nome di un campo del sito nemmeno per sbaglio;
     4. l'anteprima dal vivo: la pagina renderizzata con i contenuti che
        sono ancora solo qui dentro, e i colori iniettati al volo;
     5. Salva, Pubblica, immagini, copie di sicurezza.

   Salva ≠ Pubblica: salvare scrive la bozza sul server, pubblicare
   rigenera i tre file che il pubblico vede (index.html, js/dati.js,
   css/tema.css). Il pannello lo ripete ovunque perché è l'unica cosa che
   chi amministra deve avere chiara.
   ===================================================================== */

import { api, ErroreApi, erroriDiConvalida, quandoScadeLaSessione, rottaAssente } from './moduli/api.js';
import { el, svuota, formattaData, tempoFa } from './moduli/dom.js';
import { avviso, avvisoAttesa, apriDialogo, conferma } from './moduli/avvisi.js';
import { creaCampo, leggiChiave, scriviChiave, clona, uguali } from './moduli/campi.js';
import { apriVoci } from './moduli/elenchi.js';
import { creaLibreria, scegliImmagine } from './moduli/media.js';
import { creaBackup } from './moduli/backup.js';

/* L'unico id di gruppo che il pannello conosce (CONTRATTO-2 §10.1): al
   gruppo dell'aspetto va messa in cima la barra dei preset del tema. Non è
   conoscenza di un campo — è il punto di attacco fissato dal contratto. */
const GRUPPO_ASPETTO = 'aspetto';

/* --------------------------------------------------------------- dom */
const $ = (id) => document.getElementById(id);

const dom = {
  corpo: document.body,
  avvio: $('avvio'),
  avvioTesto: $('avvio-testo'),
  avvioAzioni: $('avvio-azioni'),
  avvioRiprova: $('avvio-riprova'),

  accesso: $('accesso'),
  formAccesso: $('form-accesso'),
  password: $('campo-password'),
  conferma: $('campo-conferma'),
  rigaConferma: $('riga-conferma'),
  mostraPassword: $('mostra-password'),
  erroreAccesso: $('accesso-errore'),
  ripresa: $('accesso-ripresa'),
  btnAccedi: $('btn-accedi'),

  app: $('app'),
  btnMenu: $('btn-menu'),
  colonna: $('colonna'),
  veloColonna: $('velo-colonna'),
  elencoGruppi: $('elenco-gruppi'),
  ricerca: $('campo-ricerca'),
  ricercaPulisci: $('ricerca-pulisci'),
  ricercaRisultati: $('ricerca-risultati'),
  percorso: $('percorso'),
  btnNomiTecnici: $('btn-nomi-tecnici'),
  statoLavoro: $('stato-lavoro'),
  ultimaPubblicazione: $('ultima-pubblicazione'),
  btnSalva: $('btn-salva'),
  btnPubblica: $('btn-pubblica'),
  btnAnteprima: $('btn-anteprima'),
  btnEsci: $('btn-esci'),

  lavoro: $('lavoro'),
  titoloVista: $('titolo-vista'),
  notaVista: $('nota-vista'),
  riepilogo: $('riepilogo-errori'),
  corpoVista: $('corpo-vista'),

  anteprima: $('anteprima'),
  iframeAnteprima: $('iframe-anteprima'),
  notaAnteprima: $('anteprima-nota'),
  erroreAnteprima: $('anteprima-errore'),
  autoAnteprima: $('anteprima-auto'),
  btnRicaricaAnteprima: $('btn-ricarica-anteprima'),
  btnEspandiAnteprima: $('btn-espandi-anteprima'),
  btnChiudiAnteprima: $('btn-chiudi-anteprima')
};

/* ------------------------------------------------------ preferenze */

/* Come si guarda il pannello (non i contenuti: quelli stanno sul server).
   In navigazione privata localStorage può lanciare a ogni accesso, quindi
   tutto passa da qui e ogni guasto vale «predefinito». */
const PREFISSO_PREF = 'sb-pannello-';

function leggiPref(nome, predefinito) {
  try {
    const valore = localStorage.getItem(PREFISSO_PREF + nome);
    return valore === null ? predefinito : valore === '1';
  } catch {
    return predefinito;
  }
}

function scriviPref(nome, acceso) {
  try { localStorage.setItem(PREFISSO_PREF + nome, acceso ? '1' : '0'); } catch { /* pazienza */ }
}

/** Chi ha chiesto meno movimento lo ottiene anche dagli scorrimenti in JS. */
function menoMovimento() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------- stato */

const stato = {
  schema: null,
  dati: null,            // { versione, aggiornatoIl, testi, config } — la bozza in corso
  salvato: null,         // copia di { testi, config } com'erano all'ultimo salvataggio
  statoServer: null,     // il campo `stato` di GET /api/contenuti
  tema: null,            // { font, preset } di GET /api/contenuti, se il server li manda
  gruppoAttivo: null,
  vista: 'gruppo',       // 'gruppo' | 'media' | 'backup'
  errori: new Map(),     // chiave -> messaggio, dall'ultima convalida del server
  modoAccesso: 'entra',  // 'entra' | 'crea'
  inCorso: false,        // c'è una scrittura in volo: si spengono i comandi

  /* Cosa sa fare il server che ci sta davanti. Le due rotte dell'anteprima
     dal vivo sono nuove: se rispondono 404 si spengono qui, una volta
     sola, e il pannello continua con quello che c'era prima. */
  capacita: { anteprimaViva: true, temaVivo: true }
};

/* Indice dei controlli del gruppo a video: serve per appoggiare gli errori
   del server sul campo che li ha causati. Si rifà a ogni disegno. */
const controlli = new Map();

let libreria = null;
let backup = null;
let anteprimaCaricata = false;   // nel riquadro dell'anteprima c'è già una pagina

/* ------------------------------------------------------- viste madri */

function mostraVista(nome) {
  dom.corpo.dataset.vista = nome;
  dom.avvio.hidden = nome !== 'avvio';
  dom.accesso.hidden = nome !== 'accesso';
  dom.app.hidden = nome !== 'app';
}

function mostraAvvio(testo, conRiprova = false) {
  dom.avvioTesto.textContent = testo;
  dom.avvioAzioni.hidden = !conRiprova;
  mostraVista('avvio');
}

/* ------------------------------------------------------------ bozza */

function sporco() {
  if (!stato.dati || !stato.salvato) return false;
  return !uguali({ testi: stato.dati.testi, config: stato.dati.config }, stato.salvato);
}

function segnaStato(tipo, testo) {
  dom.statoLavoro.dataset.stato = tipo;
  dom.statoLavoro.querySelector('.stato__testo').textContent = testo;
}

function aggiornaStato() {
  if (stato.inCorso) return;   // durante una scrittura comanda il messaggio di lavoro
  const modificato = sporco();
  dom.corpo.dataset.sporco = modificato ? '1' : '0';
  segnaStato(modificato ? 'sporco' : 'pulito', modificato ? 'Modifiche non salvate' : 'Tutto salvato');
  dom.btnSalva.disabled = !modificato;
  aggiornaNotaAnteprima();
  aggiornaPercorso();
}

/**
 * Accende il passo del «come si lavora» che tocca adesso.
 * Uno solo alla volta: è la risposta alla domanda «e ora cosa faccio?»,
 * che è l'unica cosa che chi amministra si chiede davvero.
 */
function aggiornaPercorso() {
  if (!dom.percorso) return;
  const daPubblicare = Boolean(stato.statoServer && stato.statoServer.daPubblicare);
  const adesso = sporco() ? 'salva' : (daPubblicare ? 'pubblica' : 'modifica');
  for (const passo of dom.percorso.querySelectorAll('[data-passo]')) {
    passo.classList.toggle('is-adesso', passo.dataset.passo === adesso);
  }
}

function bloccaComandi(bloccato, testoStato) {
  stato.inCorso = bloccato;
  dom.btnSalva.disabled = bloccato || !sporco();
  dom.btnPubblica.disabled = bloccato;
  if (bloccato) segnaStato('lavoro', testoStato || 'Un attimo…');
  else aggiornaStato();
}

/**
 * Data dell'ultima pubblicazione. Il contratto fissa che GET /api/contenuti
 * risponda con un campo `stato`, non come si chiama la data dentro: si
 * prende la prima che somiglia a una data di pubblicazione.
 */
function dataPubblicazione() {
  const s = stato.statoServer;
  if (!s || typeof s !== 'object') return null;
  for (const nome of ['pubblicatoIl', 'ultimaPubblicazione', 'pubblicataIl', 'generatoIl', 'ultimaPubblicazioneIl', 'pubblicato']) {
    const valore = s[nome];
    if (typeof valore === 'string' && valore.trim()) return valore;
    if (typeof valore === 'number') return valore;
  }
  return null;
}

function aggiornaPubblicazione() {
  const data = dataPubblicazione();
  // Il server dice anche se la bozza salvata è più recente della pagina
  // pubblicata: è la sola cosa che distingue «salvato» da «online».
  const daFare = Boolean(stato.statoServer && stato.statoServer.daPubblicare);
  aggiornaPercorso();

  if (!data) {
    dom.ultimaPubblicazione.textContent = 'Il sito non è mai stato pubblicato: premi Pubblica per generarlo la prima volta.';
    dom.ultimaPubblicazione.title = 'La prima pubblicazione crea index.html, js/dati.js e css/tema.css.';
    return;
  }
  const quando = tempoFa(data);
  dom.ultimaPubblicazione.textContent = 'Pubblicato ' + formattaData(data) + (quando ? ' · ' + quando : '') +
    (daFare ? ' · ci sono modifiche salvate non ancora pubblicate' : '');
  dom.ultimaPubblicazione.title = daFare
    ? 'La bozza salvata è più recente del sito pubblicato: premi Pubblica per allinearli.'
    : 'Ultima volta che il sito pubblicato è stato riscritto.';
}

/* ------------------------------------------------- contesto dei campi */

const ctx = {
  /* I nomi tecnici delle chiavi sono roba da chi sviluppa: di norma stanno
     nascosti e si accendono dalla colonna quando servono per capire un
     errore del server. */
  opzioni: { mostraChiave: leggiPref('nomi-tecnici', false) },

  /* Chiamata da ogni widget a ogni modifica: aggiorna la spia «non
     salvato» e programma il rinfresco dell'anteprima. */
  modificato: () => { aggiornaStato(); programmaAnteprima(); },

  registra: (controllo) => { if (controllo && controllo.chiave) controlli.set(controllo.chiave, controllo); },
  conferma,
  scegliImmagine: (valoreCorrente) => scegliImmagine({ valoreCorrente, usoDi }),

  /* Catalogo dei font e preset, come arrivano da GET /api/contenuti
     (CONTRATTO-2 §9). Il pannello non li interpreta: li passa ai widget
     che sanno cosa farne. Resta null se il server non li manda. */
  tema: null
};

function accessoPer(chiave) {
  return {
    leggi: () => leggiChiave(stato.dati, chiave),
    scrivi: (valore) => scriviChiave(stato.dati, chiave, valore)
  };
}

/**
 * Dove è usata un'immagine. Scorre lo schema, non i dati: così l'elenco
 * che si legge nel dialogo è fatto di etichette in italiano e non di
 * percorsi tecnici, e resta giusto anche se lo schema cambia.
 */
function usoDi(percorso) {
  const cercato = String(percorso || '').replace(/^\/+/, '');
  if (!cercato || !stato.schema || !stato.dati) return [];
  const trovati = [];

  for (const gruppo of stato.schema.gruppi || []) {
    for (const campo of gruppo.campi || []) {
      if (campo.tipo === 'immagine') {
        const valore = String(leggiChiave(stato.dati, campo.chiave) || '').replace(/^\/+/, '');
        if (valore === cercato) trovati.push(gruppo.titolo + ' · ' + (campo.etichetta || campo.chiave));
      }
      if (campo.tipo === 'elenco' && Array.isArray(campo.campi)) {
        const voci = leggiChiave(stato.dati, campo.chiave);
        if (!Array.isArray(voci)) continue;
        for (const sotto of campo.campi) {
          if (sotto.tipo !== 'immagine') continue;
          const proprieta = sotto.chiave.startsWith(campo.chiave + '.')
            ? sotto.chiave.slice(campo.chiave.length + 1)
            : sotto.chiave;
          voci.forEach((voce, indice) => {
            const valore = String((voce && voce[proprieta]) || '').replace(/^\/+/, '');
            if (valore === cercato) {
              trovati.push(gruppo.titolo + ' · ' + (campo.etichetta || campo.chiave) + ', voce ' + (indice + 1));
            }
          });
        }
      }
    }
  }
  return trovati;
}

/* ------------------------------------------------- colonna e sezioni */

function disegnaNav() {
  svuota(dom.elencoGruppi);
  const gruppi = (stato.schema && stato.schema.gruppi) || [];

  if (!gruppi.length) {
    // Uno schema vuoto è un guasto del server, non una schermata da lasciare
    // bianca: si dice cosa manca e dove guardare.
    dom.elencoGruppi.append(el('p', {
      classe: 'colonna__vuoto',
      testo: 'Il server non ha mandato nessuna sezione. Controlla contenuti/schema.js nel terminale dove gira il sito.'
    }));
    return;
  }

  for (const gruppo of gruppi) {
    const nodo = el('button', {
      type: 'button', classe: 'voce-nav', dati: { gruppo: gruppo.id },
      title: gruppo.descrizione || ''
    }, [
      el('span', { classe: 'voce-nav__punto', 'aria-hidden': 'true' }),
      el('span', { classe: 'voce-nav__testo', testo: gruppo.titolo || gruppo.id })
    ]);
    nodo.addEventListener('click', () => {
      mostraGruppo(gruppo.id);
      chiudiColonna();
    });
    dom.elencoGruppi.append(nodo);
  }
}

/**
 * Il server indirizza le voci di un elenco con le parentesi quadre
 * («config.social[0].url»), il pannello con il punto («config.social.0.url»).
 * Si traduce qui, una volta sola, invece di fare due convenzioni.
 */
function normalizzaChiave(chiave) {
  return String(chiave || '').replace(/\[(\d+)\]/g, '.$1');
}

function gruppoDi(chiave) {
  const cercata = normalizzaChiave(chiave);
  for (const gruppo of (stato.schema && stato.schema.gruppi) || []) {
    for (const campo of gruppo.campi || []) {
      if (cercata === campo.chiave || cercata.startsWith(campo.chiave + '.')) return gruppo;
    }
  }
  return null;
}

/** Quanti errori pendono su ogni gruppo, per la spia nella colonna. */
function erroriPerGruppo() {
  const conteggio = new Map();
  for (const chiave of stato.errori.keys()) {
    const gruppo = gruppoDi(chiave);
    if (!gruppo) continue;
    conteggio.set(gruppo.id, (conteggio.get(gruppo.id) || 0) + 1);
  }
  return conteggio;
}

function aggiornaNav() {
  const conteggio = erroriPerGruppo();

  for (const nodo of dom.elencoGruppi.querySelectorAll('[data-gruppo]')) {
    const id = nodo.dataset.gruppo;
    const attiva = stato.vista === 'gruppo' && id === stato.gruppoAttivo;
    nodo.classList.toggle('is-attiva', attiva);
    if (attiva) nodo.setAttribute('aria-current', 'true'); else nodo.removeAttribute('aria-current');

    const quanti = conteggio.get(id) || 0;
    nodo.classList.toggle('is-errata', quanti > 0);
    const spiaVecchia = nodo.querySelector('.voce-nav__spia');
    if (spiaVecchia) spiaVecchia.remove();
    if (quanti > 0) {
      nodo.append(el('span', {
        classe: 'voce-nav__spia', testo: String(quanti),
        'aria-label': quanti === 1 ? 'un campo da correggere' : quanti + ' campi da correggere'
      }));
    }
  }

  for (const nodo of document.querySelectorAll('[data-vista]')) {
    if (!(nodo instanceof HTMLButtonElement)) continue;
    const attiva = nodo.dataset.vista === stato.vista;
    nodo.classList.toggle('is-attiva', attiva);
    if (attiva) nodo.setAttribute('aria-current', 'true'); else nodo.removeAttribute('aria-current');
  }
}

/* --------------------------------------------------------- il form  */

function mostraGruppo(id) {
  const gruppo = ((stato.schema && stato.schema.gruppi) || []).find((g) => g.id === id)
    || ((stato.schema && stato.schema.gruppi) || [])[0];
  if (!gruppo) {
    stato.vista = 'gruppo';
    stato.gruppoAttivo = null;
    dom.titoloVista.textContent = 'Contenuti';
    dom.notaVista.textContent = '';
    svuota(dom.corpoVista);
    dom.corpoVista.append(el('p', {
      classe: 'vuoto',
      testo: 'Non c\'è niente da modificare: il server non ha mandato nessuna sezione.'
    }));
    return;
  }

  stato.vista = 'gruppo';
  stato.gruppoAttivo = gruppo.id;
  numeroDisegno += 1;

  dom.titoloVista.textContent = gruppo.titolo || gruppo.id;
  dom.notaVista.textContent = gruppo.descrizione || '';

  controlli.clear();
  svuota(dom.corpoVista);

  const campi = gruppo.campi || [];
  if (!campi.length) {
    dom.corpoVista.append(el('p', { classe: 'vuoto', testo: 'Questa sezione non ha campi da modificare.' }));
  }
  for (const campo of campi) {
    const controllo = creaCampo(campo, accessoPer(campo.chiave), ctx);
    dom.corpoVista.append(controllo.nodo);
  }

  // La barra dei preset del tema sta solo sopra il gruppo dell'aspetto, e
  // arriva quando arriva: il form è già a video e non la aspetta.
  if (gruppo.id === GRUPPO_ASPETTO) montaBarraTema(gruppo, numeroDisegno);

  applicaErrori();
  aggiornaNav();
  dom.lavoro.scrollTop = 0;
}

/* ------------------------------------------------------------- tema  */

/* La barra dei preset è un di più: si carica a richiesta invece che con un
   import in cima, così se il modulo manca o si rompe il pannello perde la
   barra e non la schermata intera. */
let moduloTema = null;
let temaIrraggiungibile = false;

/* Ogni disegno del form ha il suo numero: quello che arriva in ritardo e
   appartiene a un disegno vecchio si butta, invece di attaccarsi a un
   form che nel frattempo è stato rifatto. */
let numeroDisegno = 0;

async function caricaModuloTema() {
  if (moduloTema || temaIrraggiungibile) return moduloTema;
  try {
    moduloTema = await import('./moduli/tema.js');
  } catch {
    temaIrraggiungibile = true;
    moduloTema = null;
  }
  return moduloTema;
}

async function montaBarraTema(gruppo, numero) {
  const modulo = await caricaModuloTema();
  if (!modulo || typeof modulo.creaBarraTema !== 'function') return;
  // Nel frattempo si può essere cambiato gruppo o rifatto il form.
  if (numero !== numeroDisegno) return;
  if (stato.vista !== 'gruppo' || stato.gruppoAttivo !== gruppo.id) return;

  // Il tema di partenza, se il server lo manda: serve al «ripristina».
  const predefinito = (stato.tema && stato.tema.predefinito) || null;

  let barra = null;
  try {
    barra = modulo.creaBarraTema(ctx, {
      preset: (stato.tema && Array.isArray(stato.tema.preset)) ? stato.tema.preset : [],
      onApplica: (scelta) => applicaTema(scelta, gruppo),
      predefinito,
      // Senza il tema di partenza dal server il ripristino resterebbe
      // spento: allora si torna ai valori dell'ultimo salvataggio, che è
      // comunque «com'erano prima delle prove».
      onRipristina: predefinito ? undefined : () => ripristinaTemaSalvato(gruppo)
    });
  } catch {
    return;   // un guasto dentro il modulo di un altro agente non si porta via il form
  }
  if (barra instanceof Node) dom.corpoVista.prepend(barra);
}

/** Rimette nell'aspetto i valori con cui i contenuti sono stati caricati. */
function ripristinaTemaSalvato(gruppo) {
  const chiave = chiaveTema();
  const salvato = (chiave && stato.salvato) ? leggiChiave(stato.salvato, chiave) : null;
  if (!salvato || typeof salvato !== 'object') {
    avviso('Non ho una versione precedente dell\'aspetto a cui tornare.', { tipo: 'info' });
    return;
  }
  applicaTema(clona(salvato), gruppo);
}

/**
 * Prefisso comune delle chiavi di un gruppo, per esempio «config.tema».
 *
 * Serve ad applicare un preset senza che il pannello sappia dove vive il
 * tema dentro i contenuti: si guarda dove stanno i campi che il gruppo
 * disegna già. Se lo schema domani lo sposta, qui non cambia niente.
 */
function prefissoDelGruppo(gruppo) {
  const chiavi = (gruppo.campi || []).map((c) => String(c.chiave || '')).filter(Boolean);
  if (!chiavi.length) return '';

  let comune = chiavi[0].split('.');
  for (const chiave of chiavi.slice(1)) {
    const pezzi = chiave.split('.');
    let quanti = 0;
    while (quanti < comune.length && quanti < pezzi.length && comune[quanti] === pezzi[quanti]) quanti += 1;
    comune = comune.slice(0, quanti);
  }
  // Con un campo solo il «prefisso» sarebbe la chiave stessa: l'ultimo
  // segmento è il campo, non il ramo che lo contiene.
  if (comune.join('.') === chiavi[0]) comune.pop();
  return comune.join('.');
}

function leggiRamo(oggetto, percorso) {
  let nodo = oggetto;
  for (const passo of String(percorso).split('.')) {
    if (nodo === null || typeof nodo !== 'object') return undefined;
    nodo = nodo[passo];
  }
  return nodo;
}

/**
 * Applica un preset ai campi del gruppo dell'aspetto.
 *
 * Il preset arriva dal server come { id, nome, tema }: si accetta sia
 * l'involucro sia il solo oggetto del tema, perché la barra è di un altro
 * agente e può passare l'uno o l'altro. Si scrive solo su chiavi che il
 * gruppo disegna davvero: quello che il preset ha in più viene ignorato,
 * invece di infilare nei contenuti roba che nessuno convalida.
 */
function applicaTema(scelta, gruppo) {
  const tema = (scelta && typeof scelta === 'object' && scelta.tema && typeof scelta.tema === 'object')
    ? scelta.tema
    : scelta;
  if (!tema || typeof tema !== 'object' || !stato.dati) return;

  const prefisso = prefissoDelGruppo(gruppo);
  let trovati = 0;
  let cambiati = 0;

  for (const campo of gruppo.campi || []) {
    const chiave = String(campo.chiave || '');
    if (!prefisso || !chiave.startsWith(prefisso + '.')) continue;
    const valore = leggiRamo(tema, chiave.slice(prefisso.length + 1));
    if (valore === undefined) continue;
    trovati += 1;
    if (uguali(leggiChiave(stato.dati, chiave), valore)) continue;
    scriviChiave(stato.dati, chiave, clona(valore));
    cambiati += 1;
  }

  if (!trovati) {
    avviso('Questo abbinamento non corrisponde ai campi dell\'aspetto: non ho cambiato niente.',
      { tipo: 'errore', titolo: 'Niente da applicare' });
    return;
  }
  if (!cambiati) {
    avviso('Era già questo: non c\'era niente da cambiare.', { tipo: 'info', durata: 3000 });
    return;
  }

  azzeraErrori();
  mostraGruppo(gruppo.id);   // i campi si ridisegnano con i valori nuovi
  aggiornaStato();
  programmaAnteprima(0);     // un preset si guarda subito, non fra mezzo secondo
  avviso(
    (cambiati === 1 ? 'Un campo aggiornato' : cambiati + ' campi aggiornati') +
    '. Sono modifiche non salvate: guarda l\'anteprima, poi Salva.',
    { tipo: 'ok' }
  );
}

/**
 * Trova il controllo che deve mostrare un errore.
 * Il server può mandare una chiave più profonda di quella di un campo
 * (per esempio config.orari.ora quando il campo è config.orari): si
 * risale un segmento alla volta finché non si trova qualcosa a video.
 */
function controlloPer(chiave) {
  let corrente = normalizzaChiave(chiave);
  while (corrente) {
    const controllo = controlli.get(corrente);
    if (controllo && controllo.nodo && controllo.nodo.isConnected) return controllo;
    const taglio = corrente.lastIndexOf('.');
    if (taglio < 0) return null;
    corrente = corrente.slice(0, taglio);
  }
  return null;
}

/** Appoggia sugli elementi a video gli errori memorizzati. */
function applicaErrori() {
  for (const [chiave, messaggio] of stato.errori) {
    const controllo = controlloPer(chiave);
    if (!controllo) continue;
    controllo.mostraErrore(messaggio);
    apriVoci(controllo.nodo);
  }
}

function portaSu(controllo, { evidenzia = false } = {}) {
  if (!controllo) return;
  apriVoci(controllo.nodo);
  controllo.nodo.scrollIntoView({ block: 'center', behavior: menoMovimento() ? 'auto' : 'smooth' });
  if (controllo.fuoco) controllo.fuoco();
  if (evidenzia) segnalaCampo(controllo.nodo);
}

/* Un campo raggiunto dalla ricerca resta segnato per un attimo: dopo un
   salto la pagina è cambiata sotto gli occhi, e il fuoco da solo non basta
   a dire dove si è finiti. */
let timerSegnale = null;
function segnalaCampo(nodo) {
  if (!(nodo instanceof Element)) return;
  if (timerSegnale) clearTimeout(timerSegnale);
  for (const vecchio of dom.corpoVista.querySelectorAll('.is-trovato')) vecchio.classList.remove('is-trovato');
  nodo.classList.add('is-trovato');
  timerSegnale = setTimeout(() => {
    nodo.classList.remove('is-trovato');
    timerSegnale = null;
  }, 1600);
}

function disegnaRiepilogo(elenco) {
  svuota(dom.riepilogo);
  if (!elenco.length) {
    dom.riepilogo.hidden = true;
    return;
  }

  dom.riepilogo.append(el('p', {
    testo: elenco.length === 1
      ? 'Il server ha rifiutato il salvataggio: c\'è un campo da correggere.'
      : 'Il server ha rifiutato il salvataggio: ci sono ' + elenco.length + ' campi da correggere.'
  }));

  const lista = el('ul');
  for (const errore of elenco) {
    const gruppo = gruppoDi(errore.chiave);
    const salto = el('button', {
      type: 'button',
      testo: (gruppo ? gruppo.titolo + ' · ' : '') + errore.chiave
    });
    salto.addEventListener('click', () => {
      if (gruppo && gruppo.id !== stato.gruppoAttivo) mostraGruppo(gruppo.id);
      portaSu(controlloPer(errore.chiave));
    });
    lista.append(el('li', {}, [salto, document.createTextNode(' — ' + errore.messaggio)]));
  }
  dom.riepilogo.append(lista);
  dom.riepilogo.hidden = false;
}

function mostraErroriConvalida(elenco) {
  stato.errori = new Map(elenco.map((e) => [normalizzaChiave(e.chiave), e.messaggio]));

  const primo = elenco[0];
  const gruppo = primo ? gruppoDi(primo.chiave) : null;
  if (gruppo && (stato.vista !== 'gruppo' || gruppo.id !== stato.gruppoAttivo)) mostraGruppo(gruppo.id);
  else applicaErrori();

  aggiornaNav();
  disegnaRiepilogo(elenco);
  if (primo) portaSu(controlloPer(primo.chiave));
}

function azzeraErrori() {
  stato.errori.clear();
  for (const controllo of controlli.values()) if (controllo.pulisci) controllo.pulisci();
  disegnaRiepilogo([]);
  aggiornaNav();
}

/* Quando si tocca un campo, il suo errore del server non vale più: era
   riferito a quello che era stato spedito, non a quello che c'è adesso.
   Un solo ascoltatore delegato invece di uno per campo. */
for (const evento of ['input', 'change']) {
  dom.corpoVista.addEventListener(evento, (e) => {
    const campo = e.target instanceof Element ? e.target.closest('.campo[data-chiave]') : null;
    if (!campo) return;
    const chiave = campo.dataset.chiave;
    if (stato.errori.delete(chiave)) {
      aggiornaNav();
      if (!stato.errori.size) disegnaRiepilogo([]);
    }
  });
}

/* ---------------------------------------------------------------------
   RICERCA DEI CAMPI

   Con quaranta e passa campi divisi in dieci sezioni, scorrere i gruppi a
   mano non basta più. L'indice si costruisce dallo schema — etichette,
   sezione, nome tecnico — quindi cresce da solo insieme allo schema e non
   contiene niente di scritto a mano.
   --------------------------------------------------------------------- */

const MAX_RISULTATI = 12;

let indiceCampi = [];
let risultati = [];
let scelto = -1;

/** Minuscolo e senza accenti: «città» si trova anche scrivendo «citta». */
function normalizza(valore) {
  return String(valore || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function costruisciIndice() {
  indiceCampi = [];
  for (const gruppo of (stato.schema && stato.schema.gruppi) || []) {
    for (const campo of gruppo.campi || []) {
      const etichetta = campo.etichetta || campo.chiave;
      indiceCampi.push({
        gruppo,
        chiave: campo.chiave,
        etichetta,
        dove: gruppo.titolo || gruppo.id,
        cerca: normalizza([etichetta, gruppo.titolo, campo.chiave, campo.aiuto].join(' '))
      });

      // I sottocampi di un elenco (per esempio «Link» dentro «Profili
      // social») si cercano col loro nome ma portano all'elenco che li
      // contiene: è lì che si aprono, uno per voce.
      for (const sotto of Array.isArray(campo.campi) ? campo.campi : []) {
        const nome = sotto.etichetta || sotto.chiave;
        indiceCampi.push({
          gruppo,
          chiave: campo.chiave,
          etichetta: nome,
          dove: (gruppo.titolo || gruppo.id) + ' · ' + etichetta,
          cerca: normalizza([nome, etichetta, gruppo.titolo, sotto.chiave].join(' '))
        });
      }
    }
  }
}

/**
 * Le corrispondenze all'inizio dell'etichetta valgono più di quelle in
 * mezzo, e quelle sull'etichetta più di quelle sull'aiuto o sulla chiave:
 * chi scrive «tit» si aspetta «Titolo» in cima, non «Sottotitolo».
 */
function cerca(testo) {
  const domanda = normalizza(testo).trim();
  if (domanda.length < 2) return [];

  const trovati = [];
  for (const voce of indiceCampi) {
    const etichetta = normalizza(voce.etichetta);
    let peso;
    if (etichetta.startsWith(domanda)) peso = 0;
    else if (etichetta.includes(domanda)) peso = 1;
    else if (voce.cerca.includes(domanda)) peso = 2;
    else continue;
    trovati.push({ voce, peso });
  }

  return trovati
    .sort((a, b) => a.peso - b.peso)
    .slice(0, MAX_RISULTATI)
    .map((t) => t.voce);
}

function chiudiRisultati() {
  risultati = [];
  scelto = -1;
  svuota(dom.ricercaRisultati);
  dom.ricercaRisultati.hidden = true;
  dom.ricerca.setAttribute('aria-expanded', 'false');
  dom.ricerca.removeAttribute('aria-activedescendant');
}

function evidenziaScelto() {
  const voci = dom.ricercaRisultati.querySelectorAll('[role="option"]');
  voci.forEach((nodo, indice) => {
    const attiva = indice === scelto;
    nodo.setAttribute('aria-selected', String(attiva));
    nodo.classList.toggle('is-scelta', attiva);
    if (attiva) {
      dom.ricerca.setAttribute('aria-activedescendant', nodo.id);
      nodo.scrollIntoView({ block: 'nearest' });
    }
  });
  if (scelto < 0) dom.ricerca.removeAttribute('aria-activedescendant');
}

function disegnaRisultati() {
  svuota(dom.ricercaRisultati);

  if (!risultati.length) {
    // Resta un'opzione, disattivata: dentro una listbox è l'unico modo
    // perché anche uno screen reader senta che non c'è niente.
    dom.ricercaRisultati.append(el('li', {
      classe: 'ricerca__vuoto', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false',
      testo: 'Nessun campo con questo nome.'
    }));
    dom.ricercaRisultati.hidden = false;
    dom.ricerca.setAttribute('aria-expanded', 'true');
    // La voce in evidenza di prima non esiste più: il puntatore va tolto,
    // o resta appeso a un id che non c'è.
    dom.ricerca.removeAttribute('aria-activedescendant');
    return;
  }

  risultati.forEach((voce, indice) => {
    // Le voci sono <li role="option">, non bottoni: dentro una listbox un
    // bottone non ci va, e la tastiera passa dalla casella di ricerca.
    const nodo = el('li', {
      classe: 'ricerca__voce', role: 'option', id: 'ricerca-voce-' + indice,
      'aria-selected': 'false'
    }, [
      el('span', { classe: 'ricerca__etichetta', testo: voce.etichetta }),
      el('span', { classe: 'ricerca__dove', testo: voce.dove })
    ]);
    nodo.addEventListener('click', () => vaiAlCampo(voce));
    dom.ricercaRisultati.append(nodo);
  });

  dom.ricercaRisultati.hidden = false;
  dom.ricerca.setAttribute('aria-expanded', 'true');
  evidenziaScelto();
}

function vaiAlCampo(voce) {
  chiudiRisultati();
  dom.ricerca.value = '';
  dom.ricercaPulisci.hidden = true;
  chiudiColonna();

  if (stato.vista !== 'gruppo' || stato.gruppoAttivo !== voce.gruppo.id) mostraGruppo(voce.gruppo.id);

  const controllo = controlloPer(voce.chiave);
  if (controllo) {
    portaSu(controllo, { evidenzia: true });
  } else {
    // Può succedere solo se lo schema è cambiato sotto i piedi fra un
    // caricamento e l'altro: si porta almeno alla sezione giusta.
    avviso('Ho aperto la sezione, ma quel campo non c\'è più: ricarica la pagina.', { tipo: 'info' });
    dom.lavoro.focus();
  }
}

function apriRicerca() {
  // La colonna sotto i 900 px è un cassetto chiuso (vedi pannello.css):
  // senza aprirlo la casella di ricerca non si vedrebbe.
  if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) apriColonna();
  dom.ricerca.focus();
  dom.ricerca.select();
}

dom.ricerca.addEventListener('input', () => {
  dom.ricercaPulisci.hidden = !dom.ricerca.value;
  if (!dom.ricerca.value.trim()) { chiudiRisultati(); return; }
  risultati = cerca(dom.ricerca.value);
  scelto = risultati.length ? 0 : -1;
  disegnaRisultati();
});

dom.ricerca.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    if (dom.ricercaRisultati.hidden && !dom.ricerca.value) return;
    evento.preventDefault();
    dom.ricerca.value = '';
    dom.ricercaPulisci.hidden = true;
    chiudiRisultati();
    return;
  }
  if (!risultati.length) return;

  if (evento.key === 'ArrowDown') {
    evento.preventDefault();
    scelto = (scelto + 1) % risultati.length;
    evidenziaScelto();
  } else if (evento.key === 'ArrowUp') {
    evento.preventDefault();
    scelto = (scelto - 1 + risultati.length) % risultati.length;
    evidenziaScelto();
  } else if (evento.key === 'Enter') {
    evento.preventDefault();
    vaiAlCampo(risultati[scelto >= 0 ? scelto : 0]);
  }
});

/* Il clic su un risultato non deve togliere il fuoco alla casella prima
   che il clic arrivi: senza questo la lista si chiuderebbe a metà strada. */
dom.ricercaRisultati.addEventListener('pointerdown', (evento) => evento.preventDefault());

dom.ricerca.addEventListener('blur', () => {
  // Un giro di eventi di ritardo: il clic su una voce arriva dopo il blur.
  setTimeout(() => { if (document.activeElement !== dom.ricerca) chiudiRisultati(); }, 0);
});

dom.ricercaPulisci.addEventListener('click', () => {
  dom.ricerca.value = '';
  dom.ricercaPulisci.hidden = true;
  chiudiRisultati();
  dom.ricerca.focus();
});

/* ------------------------------------------------- nomi tecnici     */

function applicaNomiTecnici(mostra) {
  ctx.opzioni.mostraChiave = mostra;
  dom.btnNomiTecnici.setAttribute('aria-pressed', String(mostra));
  scriviPref('nomi-tecnici', mostra);
  if (stato.schema && stato.vista === 'gruppo' && stato.gruppoAttivo) mostraGruppo(stato.gruppoAttivo);
}

dom.btnNomiTecnici.addEventListener('click', () => {
  applicaNomiTecnici(dom.btnNomiTecnici.getAttribute('aria-pressed') !== 'true');
});
applicaNomiTecnici(ctx.opzioni.mostraChiave);

/* ------------------------------------------------- media e backup   */

function mostraMedia() {
  stato.vista = 'media';
  dom.titoloVista.textContent = 'Immagini';
  dom.notaVista.textContent = 'I file caricati qui restano sul server. Per usarne uno, aprilo dal campo immagine della sezione che ti serve, oppure copia il percorso.';
  disegnaRiepilogo([]);
  svuota(dom.corpoVista);

  if (!libreria) libreria = creaLibreria({ modalita: 'gestione', usoDi });
  dom.corpoVista.append(libreria.nodo);
  libreria.aggiorna();
  aggiornaNav();
  dom.lavoro.scrollTop = 0;
}

function mostraBackup() {
  stato.vista = 'backup';
  dom.titoloVista.textContent = 'Copie di sicurezza';
  dom.notaVista.textContent = 'Le copie che il server tiene da parte a ogni pubblicazione.';
  disegnaRiepilogo([]);
  svuota(dom.corpoVista);

  if (!backup) backup = creaBackup({ dopoRipristino: () => caricaContenuti({ silenzioso: true }) });
  dom.corpoVista.append(backup.nodo);
  backup.aggiorna();
  aggiornaNav();
  dom.lavoro.scrollTop = 0;
}

/* ---------------------------------------------------------------------
   ANTEPRIMA DAL VIVO (CONTRATTO-2 §9 e §10.3)

   L'iframe non mostra un indirizzo: mostra il documento che il server
   rende su richiesta con i contenuti che sono ancora solo qui dentro.
   Due strade, per non rifare tutto quando basta poco:

     - se dall'ultimo disegno è cambiato solo il tema, si chiede a
       POST /api/tema il foglio calcolato e lo si infila in un <style>
       dentro il documento dell'iframe: il colore cambia sotto gli occhi,
       senza ricaricare niente;
     - altrimenti si chiede a POST /api/anteprima la pagina intera.

   Nessuna delle due tocca il disco: si vede quello che non è ancora
   salvato, e il sito pubblicato resta dov'era.
   --------------------------------------------------------------------- */

const ATTESA_ANTEPRIMA = 550;          // ms di silenzio prima di disturbare il server
const ID_STILE_TEMA = 'sb-tema-dal-vivo';

let timerAnteprima = null;
let richiestaInVolo = false;
let daRifare = false;
let renderDi = null;        // contenuti (tema escluso) al momento dell'ultimo disegno
let temaDi = null;          // tema al momento dell'ultima iniezione
let scrittoAMano = false;   // il documento dell'iframe l'abbiamo scritto noi

function anteprimaAperta() {
  return dom.corpo.dataset.anteprima === '1' || dom.corpo.dataset.anteprima === 'piena';
}

function mostraErroreAnteprima(testo) {
  if (!dom.erroreAnteprima) return;
  dom.erroreAnteprima.textContent = testo || '';
  dom.erroreAnteprima.hidden = !testo;
}

function aggiornaNotaAnteprima() {
  if (!dom.notaAnteprima) return;
  if (!stato.capacita.anteprimaViva) {
    dom.notaAnteprima.textContent = 'Mostra la bozza salvata sul server: le modifiche non ancora salvate non si vedono.';
    return;
  }
  dom.notaAnteprima.textContent = sporco()
    ? 'Mostra le modifiche in corso, comprese quelle non salvate. Il sito pubblicato non è ancora cambiato.'
    : 'Mostra la bozza attuale. Il sito pubblicato cambia solo con Pubblica.';
}

/* --- dove vive il tema -------------------------------------------- */

function gruppoAspetto() {
  return ((stato.schema && stato.schema.gruppi) || []).find((g) => g.id === GRUPPO_ASPETTO) || null;
}

/**
 * Chiave del ramo dei colori, dedotta dallo schema. '' se non si capisce.
 *
 * Si pretendono almeno due segmenti («config.tema»): se il gruppo
 * dell'aspetto contenesse anche campi di altri rami, il prefisso comune
 * scenderebbe a «config» e si finirebbe per spedire tutta la
 * configurazione a POST /api/tema. Meglio rinunciare all'iniezione dei
 * colori che mandare al server una cosa che non è un tema.
 */
function chiaveTema() {
  const gruppo = gruppoAspetto();
  const chiave = gruppo ? prefissoDelGruppo(gruppo) : '';
  return chiave.split('.').length >= 2 ? chiave : '';
}

function temaCorrente() {
  const chiave = chiaveTema();
  if (!chiave || !stato.dati) return null;
  const valore = leggiChiave(stato.dati, chiave);
  return (valore && typeof valore === 'object') ? valore : null;
}

/**
 * Fotografia dei contenuti, con il tema tenuto da parte: confrontandola
 * con l'ultima si capisce se basta rifare i colori o serve la pagina.
 */
function istantanea() {
  if (!stato.dati) return null;
  const chiave = chiaveTema();
  const tema = temaCorrente();
  const copia = clona({ testi: stato.dati.testi, config: stato.dati.config });
  if (chiave) scriviChiave(copia, chiave, null);
  return { corpo: JSON.stringify(copia), tema: tema ? JSON.stringify(tema) : '' };
}

/* --- scrittura dentro il riquadro ---------------------------------- */

/* Il documento scritto a mano non ha un indirizzo suo: senza <base> i
   percorsi relativi della pagina (css/…, js/…, img/…) verrebbero cercati
   sotto /pannello/ e non si troverebbe niente. */
function conBase(html) {
  if (/<base[\s>]/i.test(html)) return html;
  const testa = /<head[^>]*>/i.exec(html);
  if (!testa) return '<base href="/">' + html;
  const taglio = testa.index + testa[0].length;
  return html.slice(0, taglio) + '<base href="/">' + html.slice(taglio);
}

function leggiScorrimento() {
  try {
    const finestra = dom.iframeAnteprima.contentWindow;
    return finestra ? { x: finestra.scrollX, y: finestra.scrollY } : null;
  } catch {
    return null;
  }
}

/* Rimettere lo scorrimento subito non basta: la pagina appena scritta non
   ha ancora l'altezza definitiva e lo scrollTo finisce contro il fondo. */
function rimettiScorrimento(posizione) {
  if (!posizione || (!posizione.x && !posizione.y)) return;
  const riprova = () => {
    try {
      const finestra = dom.iframeAnteprima.contentWindow;
      if (finestra) finestra.scrollTo(posizione.x, posizione.y);
    } catch { /* documento già sostituito: non c'è più niente da rimettere */ }
  };
  riprova();
  requestAnimationFrame(riprova);
  setTimeout(riprova, 350);
}

/**
 * Nell'anteprima i collegamenti non devono portare via il riquadro.
 * Con <base href="/"> anche un «#diretta» punta a un indirizzo diverso da
 * quello del documento e farebbe partire una navigazione: si intercetta il
 * clic e si scorre, che è quello che uno si aspetta guardando l'anteprima.
 * Tutto il resto (Twitch, mailto, il sito pubblicato) si apre a parte.
 */
function sistemaLegami(documento) {
  documento.addEventListener('click', (evento) => {
    const legame = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
    if (!legame) return;
    const indirizzo = legame.getAttribute('href') || '';

    if (indirizzo.startsWith('#')) {
      evento.preventDefault();
      const bersaglio = documento.getElementById(indirizzo.slice(1));
      if (bersaglio) bersaglio.scrollIntoView({ block: 'start', behavior: menoMovimento() ? 'auto' : 'smooth' });
      return;
    }
    legame.setAttribute('target', '_blank');
    legame.setAttribute('rel', 'noopener noreferrer');
  });
}

function scriviNelRiquadro(html) {
  const documento = dom.iframeAnteprima.contentDocument;
  if (!documento) return false;
  const posizione = leggiScorrimento();
  scrittoAMano = true;
  documento.open();
  documento.write(conBase(String(html || '')));
  documento.close();
  sistemaLegami(documento);
  rimettiScorrimento(posizione);
  return true;
}

/** Ripiego: la bozza già salvata, servita da GET /api/anteprima. */
function caricaAnteprimaSalvata() {
  scrittoAMano = false;
  dom.iframeAnteprima.src = api.urlAnteprima();
  anteprimaCaricata = true;
  renderDi = null;
  temaDi = null;
}

/* --- le due richieste ---------------------------------------------- */

/** Ridisegna la pagina intera. Non lancia: torna solo se ce l'ha fatta. */
async function rendiPagina(foto) {
  if (!stato.capacita.anteprimaViva) {
    caricaAnteprimaSalvata();
    return false;
  }
  try {
    const html = await api.anteprimaViva({ testi: stato.dati.testi, config: stato.dati.config });
    if (!scriviNelRiquadro(html)) return false;
    renderDi = foto.corpo;
    temaDi = null;              // documento nuovo: il tema va rimesso
    anteprimaCaricata = true;
    mostraErroreAnteprima('');
    return true;

  } catch (errore) {
    if (rottaAssente(errore)) {
      stato.capacita.anteprimaViva = false;
      caricaAnteprimaSalvata();
      mostraErroreAnteprima('Questo server non sa ancora rendere le modifiche non salvate: qui sotto vedi la bozza salvata. Salva per aggiornarla.');
      aggiornaNotaAnteprima();
      return false;
    }
    if (errore instanceof ErroreApi && errore.scaduta) return false;   // ci pensa il gancio della sessione
    mostraErroreAnteprima('Anteprima non aggiornata. ' +
      (errore instanceof ErroreApi ? errore.message : 'Il server non ha risposto.'));
    return false;
  }
}

/** Rifà solo i colori dentro il documento già disegnato. */
async function iniettaTema(foto) {
  const tema = temaCorrente();
  if (!tema || !stato.capacita.temaVivo) return false;

  try {
    const css = await api.temaCss(tema);
    const documento = dom.iframeAnteprima.contentDocument;
    if (!documento || !documento.head) return false;

    let stile = documento.getElementById(ID_STILE_TEMA);
    if (!stile) {
      stile = documento.createElement('style');
      stile.id = ID_STILE_TEMA;
      // In coda a <head>, dove ci sono già tokens.css e tema.css: fra due
      // blocchi :root con la stessa forza vince l'ultimo che si legge.
      documento.head.append(stile);
    }
    stile.textContent = css;
    temaDi = foto.tema;
    return true;

  } catch (errore) {
    if (rottaAssente(errore)) {
      // Senza questa rotta i colori si vedono solo dopo aver pubblicato:
      // è una perdita, non un guasto, e si dice una volta sola.
      stato.capacita.temaVivo = false;
      mostraErroreAnteprima('Questo server non calcola ancora i colori al volo: nell\'anteprima restano quelli dell\'ultima pubblicazione.');
      return false;
    }
    if (errore instanceof ErroreApi && errore.scaduta) return false;
    mostraErroreAnteprima('Colori non aggiornati. ' +
      (errore instanceof ErroreApi ? errore.message : 'Il server non ha risposto.'));
    return false;
  }
}

/* --- orchestrazione ------------------------------------------------ */

function segnaAnteprima(inLavoro) {
  dom.anteprima.dataset.stato = inLavoro ? 'lavoro' : 'fermo';
}

/**
 * @param {object} opzioni
 *   - tutto: rifà la pagina anche se sarebbe bastato il tema
 *   - forza: parte anche se non è cambiato niente (è il bottone «Aggiorna»)
 */
async function aggiornaAnteprima({ tutto = false, forza = false } = {}) {
  if (!stato.dati || !anteprimaAperta()) return;
  if (richiestaInVolo) { daRifare = true; return; }   // una alla volta: la rete non è una coda

  const foto = istantanea();
  if (!foto) return;

  const nulla = anteprimaCaricata && renderDi !== null && foto.corpo === renderDi && foto.tema === temaDi;
  if (nulla && !forza) return;

  const soloTema = !tutto && anteprimaCaricata && renderDi !== null && foto.corpo === renderDi;

  richiestaInVolo = true;
  segnaAnteprima(true);
  try {
    if (soloTema) {
      await iniettaTema(foto);
    } else {
      const fatta = await rendiPagina(foto);
      if (fatta) await iniettaTema(foto);
    }
  } finally {
    richiestaInVolo = false;
    segnaAnteprima(false);
    if (daRifare) {
      // Qualcosa è cambiato mentre il server rispondeva: si rifà subito e
      // senza passare dal ritardo, altrimenti l'ultima modifica resta fuori.
      daRifare = false;
      setTimeout(() => aggiornaAnteprima({ forza: true }), 0);
    }
  }
}

/**
 * Rinfresco ritardato: parte quando si smette di scrivere, non a ogni
 * tasto. Senza questo un campo di testo lungo farebbe una richiesta per
 * lettera, e con il selettore dei colori anche di più.
 */
function programmaAnteprima(attesa = ATTESA_ANTEPRIMA) {
  if (!anteprimaAperta()) return;
  // Senza la rotta nuova l'anteprima mostra la bozza salvata, che mentre
  // si scrive non cambia: ricaricarla a ogni pausa sarebbe solo rumore.
  if (!stato.capacita.anteprimaViva) return;
  if (dom.autoAnteprima && !dom.autoAnteprima.checked) return;
  if (timerAnteprima) clearTimeout(timerAnteprima);
  timerAnteprima = setTimeout(() => {
    timerAnteprima = null;
    aggiornaAnteprima();
  }, attesa);
}

function apriAnteprima(aperta) {
  dom.corpo.dataset.anteprima = aperta ? '1' : '0';
  dom.anteprima.hidden = !aperta;
  dom.btnAnteprima.setAttribute('aria-pressed', String(aperta));
  if (!aperta) dom.btnEspandiAnteprima.setAttribute('aria-pressed', 'false');
  aggiornaNotaAnteprima();
  if (aperta) aggiornaAnteprima({ forza: !anteprimaCaricata });
}

dom.btnAnteprima.addEventListener('click', () => apriAnteprima(!anteprimaAperta()));
dom.btnChiudiAnteprima.addEventListener('click', () => {
  apriAnteprima(false);
  dom.btnAnteprima.focus();
});
dom.btnRicaricaAnteprima.addEventListener('click', () => {
  if (timerAnteprima) { clearTimeout(timerAnteprima); timerAnteprima = null; }
  if (!stato.capacita.anteprimaViva) caricaAnteprimaSalvata();
  else aggiornaAnteprima({ tutto: true, forza: true });
});
dom.btnEspandiAnteprima.addEventListener('click', () => {
  const piena = dom.corpo.dataset.anteprima !== 'piena';
  dom.corpo.dataset.anteprima = piena ? 'piena' : '1';
  dom.btnEspandiAnteprima.setAttribute('aria-pressed', String(piena));
});

if (dom.autoAnteprima) {
  dom.autoAnteprima.checked = leggiPref('anteprima-auto', true);
  dom.autoAnteprima.addEventListener('change', () => {
    scriviPref('anteprima-auto', dom.autoAnteprima.checked);
    if (dom.autoAnteprima.checked) programmaAnteprima(0);
  });
}

/* Quando l'anteprima arriva da un indirizzo (il ripiego, o la prima
   apertura senza la rotta nuova) può capitare che al posto della pagina
   ci sia un errore JSON: è dello stesso dominio, si può guardare dentro.
   Sul documento scritto da noi il controllo non serve: l'errore l'abbiamo
   già visto passare dalla fetch. */
dom.iframeAnteprima.addEventListener('load', () => {
  if (scrittoAMano) return;
  if (!dom.iframeAnteprima.src || dom.iframeAnteprima.src === 'about:blank') return;
  try {
    const documento = dom.iframeAnteprima.contentDocument;
    if (!documento) return;
    const testo = (documento.body && documento.body.textContent || '').trim();
    if (testo.startsWith('{') && !documento.querySelector('main, section, header')) {
      mostraErroreAnteprima('Il server non ha potuto generare l\'anteprima. Il messaggio è dentro il riquadro.');
    }
  } catch {
    /* documento non leggibile: non è un problema, l'anteprima si vede lo stesso */
  }
});

/* ------------------------------------------------------ salva / pubblica */

/**
 * Convalida locale del gruppo a video. Il server ricontrolla tutto: questa
 * serve solo a intercettare gli errori evidenti sul campo che si sta
 * guardando, senza fare un giro di rete per sentirselo dire.
 */
function convalidaLocale() {
  let tutto = true;
  let primoErrato = null;
  for (const controllo of controlli.values()) {
    if (!controllo.valida) continue;
    if (!controllo.valida()) {
      tutto = false;
      if (!primoErrato) primoErrato = controllo;
    }
  }
  if (primoErrato) portaSu(primoErrato);
  return tutto;
}

async function salva({ silenzioso = false } = {}) {
  if (!stato.dati) return false;

  if (!convalidaLocale()) {
    avviso('Ci sono campi da correggere in questa sezione: guarda i messaggi in rosso.',
      { tipo: 'errore', titolo: 'Non ho salvato' });
    return false;
  }

  const inCorso = avvisoAttesa('Sto salvando la bozza…');
  bloccaComandi(true, 'Sto salvando…');

  try {
    const risposta = await api.salva({
      versione: stato.dati.versione,
      testi: stato.dati.testi,
      config: stato.dati.config
    });

    stato.salvato = clona({ testi: stato.dati.testi, config: stato.dati.config });
    if (risposta && risposta.aggiornatoIl) stato.dati.aggiornatoIl = risposta.aggiornatoIl;
    if (risposta && risposta.stato) { stato.statoServer = risposta.stato; aggiornaPubblicazione(); }

    azzeraErrori();
    bloccaComandi(false);
    if (!silenzioso) {
      inCorso.riuscito('Bozza salvata. Il sito pubblicato non è cambiato: per quello serve Pubblica.', 'Salvato');
    } else {
      inCorso.chiudi();
    }
    // Con l'anteprima dal vivo non c'è niente da rifare: mostrava già
    // questi contenuti. Serve solo al ripiego, che legge la bozza salvata.
    if (anteprimaCaricata && !stato.capacita.anteprimaViva) caricaAnteprimaSalvata();
    return true;

  } catch (errore) {
    bloccaComandi(false);
    const elenco = erroriDiConvalida(errore);
    if (elenco.length) {
      inCorso.fallito(
        elenco.length === 1 ? 'C\'è un campo da correggere.' : 'Ci sono ' + elenco.length + ' campi da correggere.',
        'Non ho salvato'
      );
      mostraErroriConvalida(elenco);
    } else {
      inCorso.fallito(
        errore instanceof ErroreApi ? errore.message : 'Salvataggio non riuscito.',
        'Non ho salvato'
      );
      if (errore instanceof ErroreApi && errore.scaduta) segnaStato('errore', 'Sessione scaduta');
    }
    return false;
  }
}

async function pubblica() {
  if (!stato.dati) return;

  if (sporco()) {
    const scelta = await apriDialogo({
      titolo: 'Ci sono modifiche non salvate',
      ico: 'attenzione',
      contenuto: [
        el('p', { testo: 'Pubblicare rigenera il sito a partire dalla bozza salvata sul server. Le modifiche che non hai ancora salvato non ci finirebbero dentro, anche se qui e nell\'anteprima le vedi.' }),
        el('p', { testo: 'Le salvo io e poi pubblico?' })
      ],
      bottoni: [
        { testo: 'Annulla', valore: null },
        { testo: 'Salva e pubblica', valore: 'salva', primario: true, ico: 'salva' }
      ]
    });
    if (scelta !== 'salva') return;
    const salvato = await salva({ silenzioso: true });
    if (!salvato) return;
  }

  const ok = await conferma({
    titolo: 'Pubblico il sito?',
    testo: [
      'Il server riscrive dalla bozza salvata i tre file che il pubblico vede: la pagina, i dati che usa il JavaScript e il foglio dei colori. Da quel momento chiunque apra il sito vede queste modifiche.',
      'Prima di scrivere mette da parte una copia di sicurezza: se qualcosa non va, si torna indietro dalla sezione Copie di sicurezza.'
    ],
    dettagli: el('div', { classe: 'dialogo__elenco' }, [
      el('span', { testo: '· index.html — la pagina' }),
      el('span', { testo: '· js/dati.js — orari, canale, testi che servono al JavaScript' }),
      el('span', { testo: '· css/tema.css — colori, font e forme' })
    ]),
    conferma: 'Pubblica adesso',
    annulla: 'Non adesso'
  });
  if (!ok) return;

  const inCorso = avvisoAttesa('Sto pubblicando il sito…');
  bloccaComandi(true, 'Sto pubblicando…');

  try {
    const risposta = await api.pubblica();
    const durata = risposta && Number(risposta.durataMs);
    // `scritti` è l'elenco dei file rigenerati: se il server lo manda si
    // dice quanti sono, perché «pubblicato» da solo non dice cos'è successo.
    const scritti = risposta && Array.isArray(risposta.scritti) ? risposta.scritti.length : 0;
    inCorso.riuscito(
      'Il sito pubblicato è aggiornato' +
      (scritti ? ': ' + scritti + (scritti === 1 ? ' file riscritto' : ' file riscritti') : '') +
      (Number.isFinite(durata) ? (scritti ? ', ' : ' ') + 'in ' + durata + ' ms' : '') + '.',
      'Pubblicato'
    );

    /* I controlli d'insieme (server/lib/controlli.js): la pubblicazione è
       andata a buon fine, ma queste sono le cose che online non
       funzionerebbero — il dominio del player, l'indirizzo di ritorno del
       login. Avviso a parte, e senza scadenza: vanno lette, non intraviste. */
    const daGuardare = (risposta && Array.isArray(risposta.controlli)) ? risposta.controlli : [];
    if (daGuardare.length) {
      avviso(daGuardare.map((c) => '· ' + c.messaggio).join('\n'), {
        tipo: 'info',
        durata: 0,
        titolo: daGuardare.length === 1
          ? 'Una cosa da guardare prima di mandarlo online'
          : daGuardare.length + ' cose da guardare prima di mandarlo online'
      });
    }

    /* «Ultima diretta» la chiede il server a Twitch, prima di generare
       (server/lib/twitch.js). Se il collegamento non è configurato il
       server non manda niente e qui non si dice niente: è il caso normale
       di chi quel campo lo scrive a mano. Quando invece il collegamento
       c'è ma non ha funzionato, va detto — altrimenti si pubblica un
       titolo vecchio convinti che si aggiorni da sé. */
    const daTwitch = risposta && risposta.twitch;
    if (daTwitch && daTwitch.messaggio && daTwitch.stato !== 'spento' && daTwitch.stato !== 'invariato') {
      const andataMale = daTwitch.stato === 'fallito' || daTwitch.stato === 'vuoto' || daTwitch.stato === 'senzaCanale';
      avviso(daTwitch.messaggio, {
        tipo: andataMale ? 'info' : 'ok',
        durata: andataMale ? 0 : 6000,
        titolo: andataMale ? 'Ultima diretta non aggiornata' : 'Ultima diretta aggiornata'
      });
    }

    // Il server non è tenuto a rimandare la data: intanto si segna adesso,
    // e il prossimo caricamento dei contenuti la corregge se serve.
    stato.statoServer = {
      ...(stato.statoServer || {}),
      pubblicatoIl: new Date().toISOString(),
      daPubblicare: false   // appena fatto: la spia «da pubblicare» si spegne
    };
    aggiornaPubblicazione();
    azzeraErrori();
    bloccaComandi(false);
    if (anteprimaCaricata && !stato.capacita.anteprimaViva) caricaAnteprimaSalvata();

  } catch (errore) {
    bloccaComandi(false);
    const elenco = erroriDiConvalida(errore);
    if (elenco.length) {
      inCorso.fallito('Il server non ha pubblicato: ci sono campi da correggere.', 'Niente pubblicazione');
      mostraErroriConvalida(elenco);
    } else {
      inCorso.fallito(
        errore instanceof ErroreApi ? errore.message : 'Pubblicazione non riuscita.',
        'Niente pubblicazione'
      );
    }
  }
}

dom.btnSalva.addEventListener('click', () => salva());
dom.btnPubblica.addEventListener('click', () => pubblica());

/* Le due scorciatoie che si provano comunque: Ctrl+S per salvare e
   Ctrl+K per cercare un campo (Cmd su Mac). */
window.addEventListener('keydown', (evento) => {
  const comando = evento.ctrlKey || evento.metaKey;
  const tasto = String(evento.key || '').toLowerCase();

  if (comando && tasto === 's') {
    if (dom.corpo.dataset.vista !== 'app') return;
    evento.preventDefault();
    if (sporco() && !stato.inCorso) salva();
    else if (!sporco()) avviso('Non c\'è niente da salvare: è già tutto a posto.', { tipo: 'info', durata: 2500 });
  }

  if (comando && tasto === 'k') {
    if (dom.corpo.dataset.vista !== 'app') return;
    // Dentro l'editor di testo ricco Ctrl+K è la scorciatoia del link:
    // lì comanda l'editor, la ricerca si apre da qualunque altra parte.
    const dentro = document.activeElement;
    if (dentro && dentro.isContentEditable) return;
    evento.preventDefault();
    apriRicerca();
  }

  if (evento.key === 'Escape' && dom.corpo.dataset.colonna === 'aperta'
      && document.activeElement !== dom.ricerca) {
    chiudiColonna();
  }
});

/* L'avviso del browser prima di chiudere con roba non salvata. Il testo lo
   decide il browser, non si può cambiare: conta solo che compaia. */
window.addEventListener('beforeunload', (evento) => {
  if (!sporco()) return;
  evento.preventDefault();
  evento.returnValue = '';
});

/* ---------------------------------------------------- colonna mobile */

function apriColonna() {
  dom.corpo.dataset.colonna = 'aperta';
  dom.btnMenu.setAttribute('aria-expanded', 'true');
  dom.veloColonna.hidden = false;
  const prima = dom.colonna.querySelector('button, a');
  if (prima) prima.focus();
}

function chiudiColonna() {
  if (dom.corpo.dataset.colonna !== 'aperta') return;
  dom.corpo.dataset.colonna = 'chiusa';
  dom.btnMenu.setAttribute('aria-expanded', 'false');
  dom.veloColonna.hidden = true;
}

dom.btnMenu.addEventListener('click', () => {
  if (dom.corpo.dataset.colonna === 'aperta') { chiudiColonna(); dom.btnMenu.focus(); }
  else apriColonna();
});
dom.veloColonna.addEventListener('click', () => { chiudiColonna(); dom.btnMenu.focus(); });

for (const nodo of document.querySelectorAll('.voce-nav[data-vista]')) {
  nodo.addEventListener('click', () => {
    if (nodo.dataset.vista === 'media') mostraMedia();
    if (nodo.dataset.vista === 'backup') mostraBackup();
    chiudiColonna();
  });
}

/* ------------------------------------------------------- contenuti  */

async function caricaContenuti({ silenzioso = false } = {}) {
  const inCorso = silenzioso ? null : avvisoAttesa('Carico i contenuti…');
  try {
    const risposta = await api.contenuti();
    stato.schema = risposta.schema || { gruppi: [] };
    stato.dati = {
      versione: risposta.versione,
      aggiornatoIl: risposta.aggiornatoIl,
      testi: risposta.testi || {},
      config: risposta.config || {}
    };
    stato.salvato = clona({ testi: stato.dati.testi, config: stato.dati.config });
    stato.statoServer = risposta.stato || null;
    // Catalogo font e preset (CONTRATTO-2 §9). Se il server è più vecchio
    // non arrivano: i widget che li usano se ne accorgono da soli.
    stato.tema = (risposta.tema && typeof risposta.tema === 'object') ? risposta.tema : null;
    ctx.tema = stato.tema;
    stato.errori.clear();

    costruisciIndice();
    chiudiRisultati();
    renderDi = null;    // i contenuti sono cambiati sotto: l'anteprima si rifà
    temaDi = null;

    disegnaNav();
    aggiornaPubblicazione();
    const primo = (stato.schema.gruppi || [])[0];
    mostraGruppo(stato.gruppoAttivo && (stato.schema.gruppi || []).some((g) => g.id === stato.gruppoAttivo)
      ? stato.gruppoAttivo
      : (primo ? primo.id : null));
    aggiornaStato();
    if (anteprimaAperta()) aggiornaAnteprima({ tutto: true, forza: true });
    if (inCorso) inCorso.chiudi();
    return true;

  } catch (errore) {
    if (inCorso) inCorso.chiudi();
    if (errore instanceof ErroreApi && errore.scaduta) return false;   // ci pensa il gancio della sessione
    if (!(stato.schema)) {
      mostraAvvio(errore instanceof ErroreApi ? errore.message : 'Non riesco a caricare i contenuti.', true);
    } else {
      avviso(errore instanceof ErroreApi ? errore.message : 'Non riesco a caricare i contenuti.',
        { tipo: 'errore', titolo: 'Contenuti non caricati' });
    }
    return false;
  }
}

/* --------------------------------------------------------- accesso  */

function impostaModoAccesso(modo) {
  stato.modoAccesso = modo;
  dom.accesso.dataset.modo = modo;
  dom.rigaConferma.hidden = modo !== 'crea';
  dom.password.setAttribute('autocomplete', modo === 'crea' ? 'new-password' : 'current-password');
}

function erroreAccesso(testo) {
  dom.erroreAccesso.textContent = testo || '';
  dom.erroreAccesso.hidden = !testo;
}

function vaiAllAccesso({ ripresa = false, modo = 'entra' } = {}) {
  impostaModoAccesso(modo);
  dom.ripresa.hidden = !ripresa;
  erroreAccesso('');
  dom.password.value = '';
  dom.conferma.value = '';
  mostraVista('accesso');
  dom.password.focus();
}

dom.mostraPassword.addEventListener('click', () => {
  const scoperta = dom.password.type === 'text';
  dom.password.type = scoperta ? 'password' : 'text';
  dom.mostraPassword.setAttribute('aria-pressed', String(!scoperta));
  dom.mostraPassword.textContent = scoperta ? 'Mostra' : 'Nascondi';
  dom.password.focus();
});

dom.formAccesso.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  erroreAccesso('');

  const password = dom.password.value;
  if (!password) {
    erroreAccesso('Scrivi la password.');
    dom.password.focus();
    return;
  }

  if (stato.modoAccesso === 'crea') {
    if (password.length < 8) {
      erroreAccesso('La password deve avere almeno 8 caratteri.');
      dom.password.focus();
      return;
    }
    if (password !== dom.conferma.value) {
      erroreAccesso('Le due password non coincidono.');
      dom.conferma.focus();
      return;
    }
  }

  dom.btnAccedi.disabled = true;
  const inCorso = avvisoAttesa(stato.modoAccesso === 'crea' ? 'Sto creando la password…' : 'Controllo la password…');

  try {
    if (stato.modoAccesso === 'crea') await api.creaPassword(password);
    else await api.entra(password);

    inCorso.chiudi();
    dom.password.value = '';
    dom.conferma.value = '';
    dom.ripresa.hidden = true;
    mostraVista('app');

    // Se la sessione era scaduta con modifiche in memoria, si rientra e si
    // ritrova tutto: ricaricare adesso vorrebbe dire buttarle via.
    if (stato.dati) {
      aggiornaStato();
      avviso('Rientrato. Le modifiche che avevi in corso sono ancora qui.', { tipo: 'ok' });
    } else {
      await caricaContenuti({ silenzioso: true });
    }
    dom.lavoro.focus();

  } catch (errore) {
    inCorso.chiudi();
    const messaggio = errore instanceof ErroreApi
      ? (errore.stato === 401 ? 'Password sbagliata.' : errore.message)
      : 'Accesso non riuscito.';
    erroreAccesso(messaggio);
    dom.password.select();
  } finally {
    dom.btnAccedi.disabled = false;
  }
});

dom.btnEsci.addEventListener('click', async () => {
  if (sporco()) {
    const ok = await conferma({
      titolo: 'Esco senza salvare?',
      testo: ['Ci sono modifiche non salvate: uscendo adesso si perdono.'],
      conferma: 'Esci comunque',
      annulla: 'Resto qui',
      pericolo: true
    });
    if (!ok) return;
  }

  const inCorso = avvisoAttesa('Chiudo la sessione…');
  try {
    await api.esci();
    inCorso.chiudi();
  } catch (errore) {
    // Se il server non risponde la sessione locale va chiusa lo stesso:
    // restare dentro un pannello che non parla col server non serve.
    inCorso.fallito(errore instanceof ErroreApi ? errore.message : 'Il server non ha risposto.', 'Uscita');
  }
  stato.dati = null;
  stato.salvato = null;
  stato.schema = null;
  stato.tema = null;
  ctx.tema = null;
  indiceCampi = [];
  chiudiRisultati();
  dom.ricerca.value = '';
  dom.ricercaPulisci.hidden = true;
  // L'anteprima mostrava contenuti di una sessione chiusa: si svuota.
  anteprimaCaricata = false;
  renderDi = null;
  temaDi = null;
  scrittoAMano = false;
  dom.iframeAnteprima.src = 'about:blank';
  vaiAllAccesso();
});

/* La sessione può cadere in mezzo a qualsiasi cosa: si torna all'accesso
   senza toccare la bozza in memoria, così non si perde niente. */
quandoScadeLaSessione(() => {
  if (dom.corpo.dataset.vista !== 'app') return;
  vaiAllAccesso({ ripresa: true });
});

/* ------------------------------------------------------------ avvio */

dom.avvioRiprova.addEventListener('click', () => avvia());

async function avvia() {
  mostraAvvio('Sto contattando il server…');
  try {
    const sessione = await api.sessione();

    if (sessione.primoAvvio) {
      vaiAllAccesso({ modo: 'crea' });
      return;
    }
    if (!sessione.autenticato) {
      vaiAllAccesso();
      return;
    }

    mostraVista('app');
    const fatto = await caricaContenuti({ silenzioso: true });
    if (fatto) dom.lavoro.focus();

  } catch (errore) {
    mostraAvvio(
      errore instanceof ErroreApi ? errore.message : 'Non riesco a contattare il server.',
      true
    );
  }
}

avvia();
