/* =====================================================================
   media.js — la libreria delle immagini.

   Lo stesso pezzo di interfaccia serve due volte: come sezione del
   pannello (si carica, si copia il percorso, si elimina) e come finestra
   di scelta quando un campo di tipo «immagine» chiede una foto. Cambia la
   modalita', non il codice.

   Il server rifiuta la cancellazione di un file ancora citato nei
   contenuti: quel rifiuto (409) non e' un guasto ma una risposta, e va
   spiegato con parole, non con un codice.
   ===================================================================== */

import { api, ErroreApi } from './api.js';
import { el, bottone, svuota, formattaPeso, formattaData, copiaTesto, urlRisorsa } from './dom.js';
import { avviso, avvisoAttesa, apriDialogo, conferma } from './avvisi.js';

/* Formati e peso del contratto §8. Il controllo qui davanti non sostituisce
   quello del server: evita solo di spedire 12 MB per sentirsi dire di no. */
const ESTENSIONI = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const PESO_MASSIMO = 4 * 1024 * 1024;

function estensioneOk(nome) {
  const punto = String(nome).toLowerCase().lastIndexOf('.');
  return punto > 0 && ESTENSIONI.includes(String(nome).toLowerCase().slice(punto + 1));
}

function messaggioDi(errore, ripiego) {
  return errore instanceof ErroreApi ? errore.message : ripiego;
}

/**
 * Costruisce la libreria.
 *
 * @param {object} opzioni
 *   - modalita: 'gestione' | 'scelta'
 *   - onScegli(percorso): chiamata in modalita' scelta
 *   - usoDi(percorso): elenco leggibile dei campi che usano quel file
 *   - valoreCorrente: percorso gia' impostato nel campo che ha aperto la scelta
 */
export function creaLibreria({ modalita = 'gestione', onScegli = null, usoDi = () => [], valoreCorrente = '' } = {}) {
  const griglia = el('div', { classe: 'media' });
  const stato = el('p', { classe: 'campo__aiuto', testo: 'Carico l\'elenco…' });
  const scelta = el('input', {
    type: 'file', hidden: true, multiple: true,
    accept: ESTENSIONI.map((e) => '.' + e).join(',')
  });

  const zona = el('div', { classe: 'zona' }, [
    el('p', { testo: 'Trascina qui le immagini, oppure scegli un file dal computer.' }),
    bottone({ testo: 'Scegli un file', ico: 'immagine', classe: 'btn btn--primario', su: () => scelta.click() }),
    el('p', { classe: 'zona__limiti', testo: 'PNG, JPG, WEBP, SVG · massimo 4 MB per file' }),
    scelta
  ]);

  const nodo = el('div', { classe: 'lavoro__corpo' }, [zona, stato, griglia]);

  /* --- caricamento --------------------------------------------------- */

  async function carica(elencoFile) {
    const file = Array.from(elencoFile || []);
    if (!file.length) return;

    for (const f of file) {
      if (!estensioneOk(f.name)) {
        avviso('«' + f.name + '» non è un formato accettato. Servono PNG, JPG, WEBP o SVG.',
          { tipo: 'errore', titolo: 'Formato non valido' });
        continue;
      }
      if (f.size > PESO_MASSIMO) {
        avviso('«' + f.name + '» pesa ' + formattaPeso(f.size) + ': il massimo è 4 MB.',
          { tipo: 'errore', titolo: 'File troppo grande' });
        continue;
      }

      const inCorso = avvisoAttesa('Sto caricando ' + f.name + '…');
      try {
        const risposta = await api.caricaMedia(f);
        inCorso.riuscito('Caricata: ' + f.name);
        await aggiorna();

        // Chi carica dentro la finestra di scelta vuole quella foto lì per
        // lì: gliela si passa subito, senza fargliela ricercare a mano.
        if (modalita === 'scelta' && onScegli) {
          const salvata = (risposta && (risposta.file || risposta.media || risposta.voce)) || null;
          const percorso = salvata
            ? String(salvata.percorso || salvata.url || salvata.path || '').replace(/^\/+/, '')
            : '';
          const trovata = percorso || (await api.media()).find((m) => m.nome === f.name)?.percorso;
          if (trovata) { onScegli(trovata); return; }
        }
      } catch (errore) {
        inCorso.fallito(messaggioDi(errore, 'Caricamento non riuscito.'), 'Non ho caricato ' + f.name);
      }
    }
  }

  scelta.addEventListener('change', () => { carica(scelta.files); scelta.value = ''; });

  // Senza preventDefault su dragover il browser apre il file al posto nostro.
  for (const evento of ['dragenter', 'dragover']) {
    zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.add('is-sopra'); });
  }
  zona.addEventListener('dragleave', (e) => {
    if (zona.contains(e.relatedTarget)) return;
    zona.classList.remove('is-sopra');
  });
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('is-sopra');
    if (e.dataTransfer && e.dataTransfer.files) carica(e.dataTransfer.files);
  });

  /* --- eliminazione -------------------------------------------------- */

  async function elimina(file) {
    const usato = usoDi(file.percorso);

    const ok = await conferma({
      titolo: 'Elimino ' + file.nome + '?',
      testo: usato.length
        ? ['Questa immagine risulta usata nella bozza. Finché è collegata a un campo il server rifiuterà di cancellarla.']
        : ['Il file viene cancellato dal disco del server. Non si torna indietro.'],
      dettagli: usato.length
        ? el('div', { classe: 'dialogo__elenco' }, usato.map((u) => el('span', { testo: '· ' + u })))
        : null,
      conferma: 'Elimina il file',
      pericolo: true
    });
    if (!ok) return;

    const inCorso = avvisoAttesa('Sto eliminando ' + file.nome + '…');
    try {
      await api.eliminaMedia(file.nome);
      inCorso.riuscito('Eliminata: ' + file.nome);
      await aggiorna();
    } catch (errore) {
      inCorso.chiudi();
      if (errore instanceof ErroreApi && errore.stato === 409) {
        // Caso previsto dal contratto: il file e' ancora citato nei contenuti.
        await apriDialogo({
          titolo: 'Immagine ancora in uso',
          ico: 'attenzione',
          pericolo: true,
          contenuto: [
            el('p', { testo: errore.message }),
            el('p', { testo: 'Per eliminarla: apri il campo che la usa, scegli un\'altra immagine, salva, e riprova da qui.' }),
            usato.length ? el('div', { classe: 'dialogo__elenco' }, usato.map((u) => el('span', { testo: '· ' + u }))) : null
          ],
          bottoni: [{ testo: 'Ho capito', valore: null, primario: true }]
        });
      } else {
        avviso(messaggioDi(errore, 'Eliminazione non riuscita.'), { tipo: 'errore', titolo: 'Niente da fare' });
      }
    }
  }

  /* --- griglia ------------------------------------------------------- */

  function scheda(file) {
    const usato = usoDi(file.percorso);
    const scelto = String(valoreCorrente || '').replace(/^\/+/, '') === file.percorso;

    const figura = el('div', { classe: 'media__figura' }, [
      el('img', { src: urlRisorsa(file.percorso), alt: '', loading: 'lazy' })
    ]);
    const meta = [
      Number.isFinite(file.dimensione) ? formattaPeso(file.dimensione) : null,
      file.data ? formattaData(file.data) : null
    ].filter(Boolean).join(' · ');

    const info = el('div', { classe: 'media__info' }, [
      el('p', { classe: 'media__nome', testo: file.nome, title: file.percorso }),
      el('p', { classe: 'media__meta', testo: meta })
    ]);

    const card = el('div', { classe: 'media__scheda' + (scelto ? ' is-scelta' : '') });

    if (modalita === 'scelta') {
      card.append(el('button', {
        type: 'button', classe: 'media__scelta',
        'aria-label': 'Usa ' + file.nome + (scelto ? ' (già scelta)' : ''),
        su: { click: () => onScegli && onScegli(file.percorso) }
      }, [figura, info]));
      return card;
    }

    card.append(figura, info);
    if (usato.length) card.append(el('p', { classe: 'media__usata', testo: 'In uso: ' + usato.join(', ') }));
    card.append(el('div', { classe: 'media__azioni' }, [
      bottone({
        testo: 'Copia percorso', ico: 'copia', classe: 'btn btn--minimo',
        su: async () => {
          const fatto = await copiaTesto(file.percorso);
          avviso(fatto ? 'Percorso copiato: ' + file.percorso : 'Non sono riuscito a copiare. Il percorso è ' + file.percorso,
            { tipo: fatto ? 'ok' : 'info' });
        }
      }),
      bottone({ testo: 'Elimina', ico: 'cestino', classe: 'btn btn--minimo btn--pericolo', su: () => elimina(file) })
    ]));
    return card;
  }

  async function aggiorna() {
    stato.textContent = 'Carico l\'elenco…';
    try {
      const file = await api.media();
      svuota(griglia);
      stato.textContent = file.length
        ? (file.length === 1 ? '1 immagine nella libreria.' : file.length + ' immagini nella libreria.')
        : 'La libreria è vuota: carica la prima immagine qui sopra.';
      for (const f of file) griglia.append(scheda(f));
    } catch (errore) {
      svuota(griglia);
      stato.textContent = messaggioDi(errore, 'Non riesco a leggere l\'elenco delle immagini.');
    }
  }

  return { nodo, aggiorna };
}

/**
 * Finestra di scelta usata dai campi di tipo «immagine».
 * Torna il percorso scelto, oppure null se si chiude senza scegliere.
 */
export async function scegliImmagine({ usoDi = () => [], valoreCorrente = '' } = {}) {
  const risultato = await apriDialogo({
    titolo: 'Libreria immagini',
    ico: 'immagine',
    largo: true,
    contenuto: (chiudi) => {
      const libreria = creaLibreria({
        modalita: 'scelta',
        valoreCorrente,
        usoDi,
        onScegli: (percorso) => chiudi(percorso)
      });
      libreria.aggiorna();
      return [
        el('p', { testo: 'Scegli un\'immagine, oppure caricane una nuova trascinandola qui dentro.' }),
        libreria.nodo
      ];
    },
    bottoni: [{ testo: 'Annulla', valore: null }]
  });

  return typeof risultato === 'string' ? risultato : null;
}
