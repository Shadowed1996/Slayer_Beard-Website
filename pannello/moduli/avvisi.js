/* =====================================================================
   avvisi.js — messaggi in basso a destra e finestre di conferma.

   Niente alert(), confirm() o prompt(): bloccano il browser, non si
   possono scrivere in italiano decente e non si stilano. Al loro posto
   ci sono <dialog> (che gestisce da solo Esc, il fondale e la trappola
   del fuoco) e una pila di avvisi con aria-live.

   Ogni operazione di rete usa `avvisoAttesa()`: nasce «in corso» e poi
   diventa riuscita o fallita sullo stesso avviso, invece di lasciare a
   chi guarda il dubbio che non sia successo niente.
   ===================================================================== */

import { el, icona, bottone, idUnico } from './dom.js';

const ICONA_DI = { ok: 'ok', errore: 'attenzione', attesa: 'ricarica', info: 'info' };
const DURATA_DI = { ok: 4000, errore: 9000, info: 6000, attesa: 0 };

/**
 * Mostra un avviso in basso a destra.
 * @returns {{aggiorna:Function, riuscito:Function, fallito:Function, chiudi:Function}}
 */
export function avviso(testo, { tipo = 'info', titolo = '', durata = null } = {}) {
  const contenitore = document.getElementById('avvisi');

  let nodoIcona = icona(ICONA_DI[tipo] || 'info');
  const nodoTitolo = el('p', { classe: 'avviso__titolo', testo: titolo });
  const nodoTesto = el('p', { classe: 'avviso__testo', testo });
  const corpo = el('div', {}, [titolo ? nodoTitolo : null, nodoTesto]);

  const nodo = el('div', { classe: 'avviso', dati: { tipo } }, [
    nodoIcona,
    corpo,
    bottone({ ico: 'chiudi', testo: 'Chiudi l\'avviso', soloIcona: true, classe: 'avviso__chiudi', su: () => chiudi() })
  ]);

  if (contenitore) contenitore.append(nodo);

  let timer = null;
  const programma = (ms) => {
    if (timer) clearTimeout(timer);
    timer = ms > 0 ? setTimeout(() => chiudi(), ms) : null;
  };
  programma(durata === null ? (DURATA_DI[tipo] ?? 5000) : durata);

  function chiudi() {
    if (timer) clearTimeout(timer);
    nodo.remove();
  }

  function aggiorna(nuovoTesto, opzioni = {}) {
    const nuovoTipo = opzioni.tipo || nodo.dataset.tipo;
    nodo.dataset.tipo = nuovoTipo;

    const sostituta = icona(ICONA_DI[nuovoTipo] || 'info');
    nodoIcona.replaceWith(sostituta);
    nodoIcona = sostituta;

    nodoTesto.textContent = nuovoTesto;
    if (opzioni.titolo !== undefined) {
      nodoTitolo.textContent = opzioni.titolo;
      if (opzioni.titolo && !nodoTitolo.isConnected) corpo.prepend(nodoTitolo);
      if (!opzioni.titolo) nodoTitolo.remove();
    }
    programma(opzioni.durata === undefined ? (DURATA_DI[nuovoTipo] ?? 5000) : opzioni.durata);
  }

  return {
    aggiorna,
    riuscito: (t, tit) => aggiorna(t, { tipo: 'ok', titolo: tit === undefined ? '' : tit }),
    fallito: (t, tit) => aggiorna(t, { tipo: 'errore', titolo: tit === undefined ? '' : tit }),
    chiudi
  };
}

/** Avviso «sto lavorando»: non sparisce da solo, lo chiude chi lo apre. */
export function avvisoAttesa(testo, titolo = '') {
  return avviso(testo, { tipo: 'attesa', titolo, durata: 0 });
}

/* ---------------------------------------------------------------------
   Dialoghi
   --------------------------------------------------------------------- */

/**
 * Apre un dialogo modale e risolve con il valore del bottone premuto
 * (null se si chiude con Esc o cliccando il fondale).
 *
 * Il <dialog> viene creato ogni volta invece di riusarne uno solo: cosi'
 * un dialogo puo' aprirne un altro sopra (scegliere un'immagine e da li'
 * confermare una cancellazione) senza che il primo si chiuda.
 *
 * `contenuto` puo' essere un nodo, un elenco di nodi, o una funzione che
 * riceve `(chiudi, bottoni)` — dove `bottoni` e' una Map nome -> elemento,
 * utile per accendere o spegnere un bottone da dentro il contenuto.
 */
export function apriDialogo({ titolo, ico = 'info', contenuto = [], bottoni = [], largo = false, pericolo = false }) {
  return new Promise((risolvi) => {
    const idTitolo = idUnico('dlg');
    const dialogo = el('dialog', {
      classe: 'dialogo' + (largo ? ' dialogo--largo' : '') + (pericolo ? ' dialogo--pericolo' : ''),
      'aria-labelledby': idTitolo
    });

    let risultato = null;
    let deciso = false;
    const chiudi = (valore) => {
      if (deciso) return;
      deciso = true;
      risultato = valore;
      dialogo.close();
    };

    // I bottoni si costruiscono prima del contenuto: cosi' il contenuto puo'
    // riceverli e comandarli (per esempio una spunta che sblocca «Conferma»).
    const azioni = el('div', { classe: 'dialogo__azioni' });
    const perNome = new Map();
    const elencoBottoni = bottoni.length ? bottoni : [{ testo: 'Chiudi', valore: null, primario: true }];
    for (const b of elencoBottoni) {
      const nodoBottone = bottone({
        testo: b.testo,
        ico: b.ico,
        classe: 'btn' + (b.primario ? ' btn--primario' : '') + (b.pericolo ? ' btn--pericolo' : ''),
        disabilitato: Boolean(b.disabilitato),
        su: () => chiudi(b.valore)
      });
      if (b.nome) perNome.set(b.nome, nodoBottone);
      azioni.append(nodoBottone);
    }

    const corpoContenuto = el('div', { classe: 'dialogo__contenuto' });
    const nodi = typeof contenuto === 'function' ? contenuto(chiudi, perNome) : contenuto;
    for (const nodo of [].concat(nodi)) {
      if (!nodo) continue;
      corpoContenuto.append(typeof nodo === 'string' ? el('p', { testo: nodo }) : nodo);
    }

    dialogo.append(el('div', { classe: 'dialogo__corpo' }, [
      el('div', { classe: 'dialogo__testa' }, [
        icona(ico),
        el('h2', { classe: 'dialogo__titolo', id: idTitolo, testo: titolo })
      ]),
      corpoContenuto,
      azioni
    ]));

    // <dialog> non ha un evento per il fondale, ma il bersaglio del clic e'
    // l'elemento dialog stesso solo quando si colpisce fuori dal contenuto.
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) chiudi(null);
    });
    dialogo.addEventListener('cancel', () => { deciso = true; risultato = null; });
    dialogo.addEventListener('close', () => {
      dialogo.remove();
      risolvi(risultato);
    });

    document.body.append(dialogo);
    dialogo.showModal();

    const primo = dialogo.querySelector('input:not([type="hidden"]), textarea, select, .btn--primario, button');
    if (primo) primo.focus();
  });
}

/**
 * Domanda si' / no. Con `spunta` il bottone di conferma resta spento
 * finche' non si spunta la casella: serve per le cose che non si annullano.
 */
export async function conferma({
  titolo,
  testo = [],
  dettagli = null,
  conferma: etichettaConferma = 'Conferma',
  annulla = 'Annulla',
  spunta = '',
  pericolo = false
}) {
  const risposta = await apriDialogo({
    titolo,
    ico: pericolo ? 'attenzione' : 'info',
    pericolo,
    contenuto: (_chiudi, bottoni) => {
      const nodi = [].concat(testo).filter(Boolean).map((t) => el('p', { testo: t }));
      if (dettagli) nodi.push(dettagli);
      if (spunta) {
        const casella = el('input', { type: 'checkbox' });
        casella.addEventListener('change', () => {
          const ok = bottoni.get('ok');
          if (ok) ok.disabled = !casella.checked;
        });
        nodi.push(el('label', { classe: 'dialogo__spunta' }, [casella, el('span', { testo: spunta })]));
      }
      return nodi;
    },
    bottoni: [
      { testo: annulla, valore: false },
      { testo: etichettaConferma, valore: true, primario: !pericolo, pericolo, disabilitato: Boolean(spunta), nome: 'ok' }
    ]
  });

  return risposta === true;
}
