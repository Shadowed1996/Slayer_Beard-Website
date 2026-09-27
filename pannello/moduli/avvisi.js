import { el, icona, bottone, idUnico } from './dom.js';

const ICONA_DI = { ok: 'ok', errore: 'attenzione', attesa: 'ricarica', info: 'info' };
const DURATA_DI = { ok: 4000, errore: 9000, info: 6000, attesa: 0 };

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

export function avvisoAttesa(testo, titolo = '') {
  return avviso(testo, { tipo: 'attesa', titolo, durata: 0 });
}

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
