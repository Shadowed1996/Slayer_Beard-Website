/* =====================================================================
   ponte.js — l'unico punto di contatto fra pannello.js e i moduli
   dell'editor (CONTRATTO-4 §9.2).

   Perché un oggetto e non un mucchio di import: i moduli dell'editor
   (motore, contenuti, stile, parti, impostazioni) si caricano con import()
   dinamico e possono mancare o rompersi; pannello.js non deve dipendere da
   loro, e loro non devono sapere com'è fatto pannello.js dentro. Il ponte
   esiste da subito con metodi innocui, e pannello.js ci aggancia il vero
   funzionamento all'avvio con `collegaPonte`. Chi lo usa prima del primo
   caricamento dei contenuti trova `pronto: false` e letture vuote, non
   un'eccezione.
   ===================================================================== */

import { api } from '../moduli/api.js';
import { avviso, conferma, apriDialogo } from '../moduli/avvisi.js';

/* Il funzionamento vero, messo da pannello.js. Tenuto fuori dall'oggetto
   esportato così nessun modulo può sostituirlo per sbaglio scrivendo
   `ponte.scrivi = …`. */
let impl = null;

function chiama(nome, riserva, argomenti) {
  const funzione = impl && impl[nome];
  if (typeof funzione !== 'function') return typeof riserva === 'function' ? riserva() : riserva;
  return funzione(...argomenti);
}

export const ponte = {
  /** Vero dopo il primo caricamento dei contenuti (e a ogni nuovo accesso). */
  pronto: false,

  /** Lo stato vivo di pannello.js: { dati: { versione, aggiornatoIl, testi, config }, schema, tema, stato }.
      `dati` cambia oggetto dopo Annulla/Ripeti/ripristino: si rilegge su sb:sostituito. */
  stato: null,

  /** Il client di moduli/api.js (con anteprima, font, caricaFont, eliminaFont, cambiaPassword). */
  api,

  /** Valore della chiave nei contenuti in memoria («deck.titolo», «config.stili»). */
  leggi(chiave) {
    return chiama('leggi', undefined, [chiave]);
  },

  /**
   * Scrive la chiave nella bozza, accende la spia «non salvato» ed emette
   * sb:modifica. `strutturale` chiede al guscio la ricarica dell'anteprima
   * anche per chiavi che di solito si aggiornano dal vivo.
   */
  scrivi(chiave, valore, { strutturale = false } = {}) {
    return chiama('scrivi', undefined, [chiave, valore, { strutturale }]);
  },

  /** Solo l'evento, per chi ha già modificato l'oggetto sul posto (es. config.stili). */
  segnala(chiave, { strutturale = false } = {}) {
    return chiama('segnala', undefined, [chiave, { strutturale }]);
  },

  /** Definizione del campo nello schema, o null (i sottocampi degli elenchi non ci sono). */
  campo(chiave) {
    return chiama('campo', null, [chiave]);
  },

  /** Il gruppo dello schema con questo id, o null. */
  gruppo(id) {
    return chiama('gruppo', null, [id]);
  },

  /** Il gruppo dello schema che contiene la chiave, o null. */
  gruppoDi(chiave) {
    return chiama('gruppoDi', null, [chiave]);
  },

  /** L'etichetta del campo, o la chiave stessa. */
  etichetta(chiave) {
    return chiama('etichetta', String(chiave || ''), [chiave]);
  },

  /**
   * Il controllo di moduli/campi.js per quel campo, già collegato alla bozza:
   * { nodo, chiave, mostraErrore, pulisci, fuoco, … }. Ogni modifica emette
   * sb:modifica. Accetta la definizione del campo o la sua chiave. null se
   * il campo non esiste o il pannello non è ancora pronto.
   */
  creaCampo(campo) {
    return chiama('creaCampo', null, [campo]);
  },

  /** Apre la libreria delle immagini (che carica anche dal computer). */
  scegliImmagine(valoreCorrente) {
    return chiama('scegliImmagine', () => Promise.resolve(null), [valoreCorrente]);
  },

  /** Salva la bozza sul server. -> Promise<boolean> */
  salva() {
    return chiama('salva', () => Promise.resolve(false), []);
  },

  /** Salva se serve e pubblica il sito. -> Promise<boolean> */
  pubblica() {
    return chiama('pubblica', () => Promise.resolve(false), []);
  },

  /* Avvisi e dialoghi di moduli/avvisi.js, attivi da subito: un modulo
     dell'editor che deve dire qualcosa prima del primo caricamento lo può
     fare, e non ha bisogno di conoscere il percorso di avvisi.js. */
  avviso,
  conferma,
  apriDialogo
};

/**
 * Aggancia il funzionamento vero. Solo pannello.js la chiama, una volta,
 * prima di caricare i moduli dell'editor.
 * @param {object} funzioni  leggi, scrivi, segnala, campo, gruppo, gruppoDi,
 *   etichetta, creaCampo, scegliImmagine, salva, pubblica
 */
export function collegaPonte(funzioni) {
  impl = funzioni && typeof funzioni === 'object' ? funzioni : null;
}
