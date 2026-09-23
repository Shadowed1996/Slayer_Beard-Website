import { api, ErroreApi, rottaAssente } from './api.js';
import { el, bottone, svuota, formattaData } from './dom.js';
import { avviso, conferma } from './avvisi.js';

const MIN_RISPOSTE = 2;
const MAX_RISPOSTE = 6;
const OGNI_QUANTO = 10000;
const UNITA = [
  { valore: '1', nome: 'minuti' },
  { valore: '60', nome: 'ore' },
  { valore: '1440', nome: 'giorni' }
];

function messaggio(errore, ripiego) {
  return errore instanceof ErroreApi ? errore.message : ripiego;
}

function durataResidua(scadeIl) {
  const secondi = Math.max(0, Math.round((Date.parse(scadeIl) - Date.now()) / 1000));
  const giorni = Math.floor(secondi / 86400);
  const ore = Math.floor((secondi % 86400) / 3600);
  const minuti = Math.floor((secondi % 3600) / 60);
  if (giorni) return giorni + ' g ' + ore + ' h';
  if (ore) return ore + ' h ' + minuti + ' min';
  if (minuti) return minuti + ' min';
  return secondi + ' s';
}

function risultati(sondaggio) {
  const totale = sondaggio.totale || 0;
  const massimo = Math.max(0, ...sondaggio.conteggi);
  return el('ul', { classe: 'sondaggi__risultati' }, sondaggio.risposte.map((testo, i) => {
    const n = sondaggio.conteggi[i] || 0;
    const quota = totale ? Math.round((n / totale) * 100) : 0;
    return el('li', { classe: 'sondaggi__riga' + (totale && n === massimo ? ' is-prima' : '') }, [
      el('span', { classe: 'sondaggi__barra', style: '--quota:' + quota + '%', 'aria-hidden': 'true' }),
      el('span', { classe: 'sondaggi__risposta', testo }),
      el('span', { classe: 'sondaggi__numero', testo: quota + '% · ' + n })
    ]);
  }));
}

export function creaSondaggi() {
  const stato = el('p', { classe: 'campo__aiuto', testo: 'Carico i sondaggi…' });
  const attivo = el('div', { classe: 'sondaggi__blocco' });
  const nuovo = el('div', { classe: 'sondaggi__blocco' });
  const archivio = el('div', { classe: 'sondaggi__blocco' });
  const nodo = el('div', { classe: 'lavoro__corpo sondaggi' }, [stato, attivo, nuovo, archivio]);
  let timer = 0;

  function formNuovo() {
    const domanda = el('input', { type: 'text', id: 'sondaggio-domanda-nuova', classe: 'campo__input', maxlength: '200', required: true });
    const elenco = el('div', { classe: 'sondaggi__opzioni' });
    const quanto = el('input', { type: 'number', id: 'sondaggio-durata', classe: 'campo__input campo__input--breve', min: '1', max: '999', step: '1', value: '1', required: true });
    const unita = el('select', { classe: 'campo__scelta', 'aria-label': 'Unità della durata' },
      UNITA.map((u) => el('option', { value: u.valore, testo: u.nome })));
    unita.value = '1440';
    const errore = el('p', { classe: 'accesso__errore', role: 'alert', hidden: true });
    const aggiungi = bottone({ testo: 'Aggiungi una risposta', ico: 'piu', classe: 'btn btn--minimo', su: () => rigaRisposta('', true) });
    const crea = bottone({ testo: 'Apri il sondaggio', ico: 'sondaggio', classe: 'btn btn--primario', tipo: 'submit' });

    function righe() { return Array.from(elenco.querySelectorAll('input')); }

    function sistema() {
      const tutte = elenco.querySelectorAll('.sondaggi__opzione');
      tutte.forEach((riga, i) => {
        riga.querySelector('input').setAttribute('aria-label', 'Risposta ' + (i + 1));
        riga.querySelector('input').placeholder = 'Risposta ' + (i + 1);
        riga.querySelector('button').disabled = tutte.length <= MIN_RISPOSTE;
      });
      aggiungi.disabled = tutte.length >= MAX_RISPOSTE;
    }

    function rigaRisposta(valore, fuoco) {
      if (righe().length >= MAX_RISPOSTE) return;
      const input = el('input', { type: 'text', classe: 'campo__input', maxlength: '80', value: valore });
      const riga = el('div', { classe: 'sondaggi__opzione' }, [
        input,
        bottone({ testo: 'Togli questa risposta', ico: 'cestino', classe: 'btn btn--minimo', soloIcona: true, su: () => { riga.remove(); sistema(); } })
      ]);
      elenco.append(riga);
      sistema();
      if (fuoco) input.focus();
    }

    rigaRisposta('');
    rigaRisposta('');

    const form = el('form', { classe: 'lato__modulo', novalidate: true }, [
      el('h3', { classe: 'lato__occhiello', testo: 'Nuovo sondaggio' }),
      el('div', { classe: 'campo' }, [
        el('label', { classe: 'campo__etichetta', for: 'sondaggio-domanda-nuova', testo: 'Domanda' }),
        domanda
      ]),
      el('div', { classe: 'campo' }, [
        el('span', { classe: 'campo__etichetta', testo: 'Risposte (da ' + MIN_RISPOSTE + ' a ' + MAX_RISPOSTE + ')' }),
        elenco,
        el('div', { classe: 'lato__azioni' }, [aggiungi])
      ]),
      el('div', { classe: 'campo' }, [
        el('label', { classe: 'campo__etichetta', for: 'sondaggio-durata', testo: 'Resta aperto per' }),
        el('div', { classe: 'sondaggi__durata' }, [quanto, unita]),
        el('p', { classe: 'campo__aiuto', testo: 'Allo scadere si chiude da solo e mostra i risultati a tutti per una settimana.' })
      ]),
      errore,
      el('div', { classe: 'lato__azioni' }, [crea])
    ]);

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const mostra = (testo, campo) => {
        errore.textContent = testo || '';
        errore.hidden = !testo;
        if (campo) campo.focus();
      };
      mostra('');
      const testoDomanda = domanda.value.trim();
      const risposte = righe().map((i) => i.value.trim()).filter(Boolean);
      const numero = Number(quanto.value);
      if (!testoDomanda) return mostra('Scrivi la domanda.', domanda);
      if (risposte.length < MIN_RISPOSTE) return mostra('Servono almeno ' + MIN_RISPOSTE + ' risposte.', righe().find((i) => !i.value.trim()));
      if (!Number.isInteger(numero) || numero < 1) return mostra('Scrivi per quanto resta aperto.', quanto);

      crea.disabled = true;
      try {
        const dati = await api.creaSondaggio({ domanda: testoDomanda, risposte, durataMinuti: numero * Number(unita.value) });
        avviso('Il sondaggio è online: si vede già sul sito.', { tipo: 'ok', titolo: 'Sondaggio aperto' });
        mostraTutto(dati);
      } catch (e) {
        mostra(messaggio(e, 'Non sono riuscito ad aprire il sondaggio.'));
      } finally {
        crea.disabled = false;
      }
    });
    return form;
  }

  async function chiudiOra() {
    const ok = await conferma({
      titolo: 'Chiudere il sondaggio adesso?',
      testo: ['Non si potrà più votare. Sul sito restano i risultati, visibili a tutti per una settimana.'],
      conferma: 'Chiudi il sondaggio'
    });
    if (!ok) return;
    try {
      mostraTutto(await api.chiudiSondaggio());
      avviso('Sondaggio chiuso.', { tipo: 'ok' });
    } catch (e) {
      avviso(messaggio(e, 'Non sono riuscito a chiudere il sondaggio.'), { tipo: 'errore' });
    }
  }

  async function elimina(sondaggio, aperto) {
    const ok = await conferma({
      titolo: aperto ? 'Annullare il sondaggio?' : 'Eliminare questo sondaggio?',
      testo: [aperto
        ? 'Sparisce dal sito insieme a tutti i voti, senza finire nell\'archivio.'
        : 'Sparisce dall\'archivio, e dal sito se era l\'ultimo chiuso. I voti non si recuperano.'],
      conferma: aperto ? 'Annulla il sondaggio' : 'Elimina',
      pericolo: true
    });
    if (!ok) return;
    try {
      mostraTutto(await api.eliminaSondaggio(sondaggio.id));
      avviso(aperto ? 'Sondaggio annullato.' : 'Sondaggio eliminato.', { tipo: 'ok' });
    } catch (e) {
      avviso(messaggio(e, 'Non sono riuscito a eliminarlo.'), { tipo: 'errore' });
    }
  }

  function schedaAttivo(s) {
    return el('div', { classe: 'sondaggi__scheda is-aperto' }, [
      el('h3', { classe: 'lato__occhiello', testo: 'Aperto adesso' }),
      el('p', { classe: 'sondaggi__domanda', testo: s.domanda }),
      el('p', { classe: 'campo__aiuto', testo: 'Chiude tra ' + durataResidua(s.scadeIl) + ' (' + formattaData(s.scadeIl) + ') · ' + s.totale + (s.totale === 1 ? ' voto' : ' voti') }),
      risultati(s),
      el('div', { classe: 'lato__azioni' }, [
        bottone({ testo: 'Chiudi ora', ico: 'ok', classe: 'btn', su: chiudiOra }),
        bottone({ testo: 'Annulla il sondaggio', ico: 'cestino', classe: 'btn btn--minimo', su: () => elimina(s, true) })
      ])
    ]);
  }

  function schedaArchivio(s) {
    return el('div', { classe: 'sondaggi__scheda' }, [
      el('p', { classe: 'sondaggi__domanda', testo: s.domanda }),
      el('p', { classe: 'campo__aiuto', testo: 'Chiuso il ' + formattaData(s.chiusoIl) + ' · ' + s.totale + (s.totale === 1 ? ' voto' : ' voti') }),
      risultati(s),
      el('div', { classe: 'lato__azioni' }, [
        bottone({ testo: 'Elimina', ico: 'cestino', classe: 'btn btn--minimo', su: () => elimina(s, false) })
      ])
    ]);
  }

  function mostraTutto(dati) {
    stato.textContent = '';
    stato.hidden = true;
    svuota(attivo);
    if (dati.attivo) {
      attivo.append(schedaAttivo(dati.attivo));
      svuota(nuovo);
    } else if (!nuovo.firstChild) {
      nuovo.append(formNuovo());
    }
    if (dati.attivo) nuovo.hidden = true; else nuovo.hidden = false;
    svuota(archivio);
    if (dati.archivio && dati.archivio.length) {
      archivio.append(el('h3', { classe: 'lato__occhiello', testo: 'Archivio' }));
      dati.archivio.forEach((s) => archivio.append(schedaArchivio(s)));
    }
    programma(Boolean(dati.attivo));
  }

  function programma(aperto) {
    clearTimeout(timer);
    if (!aperto) return;
    timer = setTimeout(() => {
      if (!nodo.isConnected) return;
      if (document.hidden) { programma(true); return; }
      aggiorna();
    }, OGNI_QUANTO);
  }

  async function aggiorna() {
    try {
      mostraTutto(await api.sondaggi());
    } catch (e) {
      stato.hidden = false;
      stato.textContent = rottaAssente(e)
        ? 'Il server non ha ancora i sondaggi: va aggiornato.'
        : messaggio(e, 'Non riesco a leggere i sondaggi.');
    }
  }

  aggiorna();
  return { nodo, aggiorna };
}
