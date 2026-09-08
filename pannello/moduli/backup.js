/* =====================================================================
   backup.js — elenco delle copie di sicurezza e ripristino.

   Ogni pubblicazione lascia dietro di sé una copia dei tre file generati
   (index.html, js/dati.js, css/tema.css) più i contenuti da cui sono nati
   (contratto §6.4, CONTRATTO-2 §9). Da qui si torna indietro.

   Il ripristino chiede conferma due volte, e la seconda con una casella
   da spuntare: è l'unica azione del pannello che riscrive il sito senza
   passare da una modifica, e un clic distratto costerebbe caro.
   ===================================================================== */

import { api, ErroreApi } from './api.js';
import { el, bottone, svuota, formattaData, formattaPeso, tempoFa } from './dom.js';
import { avviso, avvisoAttesa, conferma } from './avvisi.js';

export function creaBackup({ dopoRipristino = () => {} } = {}) {
  const elenco = el('div', { classe: 'backup' });
  const stato = el('p', { classe: 'campo__aiuto', testo: 'Carico l\'elenco…' });
  const nodo = el('div', { classe: 'lavoro__corpo' }, [
    el('div', { classe: 'spiegazione' }, [
      el('p', {
        testo: 'Ogni volta che pubblichi, il server mette da parte una copia del sito com\'era prima: la pagina, ' +
               'i dati, il foglio dei colori e i contenuti. Ripristinare rimette in piedi quella copia, e prima di ' +
               'farlo il server ne salva un\'altra dello stato di adesso: anche un ripristino sbagliato si può annullare.'
      })
    ]),
    stato,
    elenco
  ]);

  async function ripristina(voce) {
    const quando = formattaData(voce.data);

    const primo = await conferma({
      titolo: 'Torno alla copia del ' + quando + '?',
      testo: [
        'Il sito pubblicato viene riportato com\'era in quel momento: la pagina, i dati, i colori e i contenuti.',
        'Tutto quello che è stato pubblicato dopo quella data sparisce dal sito.'
      ],
      conferma: 'Continua',
      pericolo: true
    });
    if (!primo) return;

    const secondo = await conferma({
      titolo: 'Ultima conferma',
      testo: [
        'Prima di ripristinare, il server salva una copia dello stato di adesso: se ti accorgi di aver sbagliato, torni indietro da questa stessa pagina.',
        'Dopo il ripristino il pannello ricarica i contenuti dal server, e le modifiche non salvate che avevi in corso vanno perse.'
      ],
      spunta: 'Ho capito: ripristina la copia del ' + quando + '.',
      conferma: 'Ripristina adesso',
      pericolo: true
    });
    if (!secondo) return;

    const inCorso = avvisoAttesa('Sto ripristinando la copia del ' + quando + '…');
    try {
      await api.ripristina(voce.id);
      inCorso.riuscito('Sito riportato alla copia del ' + quando + '.', 'Ripristino fatto');
      await aggiorna();
      await dopoRipristino();
    } catch (errore) {
      inCorso.fallito(
        errore instanceof ErroreApi ? errore.message : 'Ripristino non riuscito.',
        'Niente ripristino'
      );
    }
  }

  function voceDom(voce, indice) {
    const meta = [
      indice === 0 ? 'la più recente' : tempoFa(voce.data),
      Number.isFinite(voce.dimensione) ? formattaPeso(voce.dimensione) : null,
      Array.isArray(voce.file) ? voce.file.length + ' file' : null
    ].filter(Boolean).join(' · ');

    return el('div', { classe: 'backup__voce' }, [
      el('div', {}, [
        el('p', { classe: 'backup__data', testo: formattaData(voce.data) }),
        el('p', { classe: 'backup__meta', testo: meta || voce.id })
      ]),
      bottone({ testo: 'Ripristina', ico: 'backup', classe: 'btn', su: () => ripristina(voce) })
    ]);
  }

  async function aggiorna() {
    stato.textContent = 'Carico l\'elenco…';
    try {
      const voci = await api.backup();
      svuota(elenco);
      if (!voci.length) {
        stato.textContent = 'Non c\'è ancora nessuna copia: la prima nasce alla prima pubblicazione.';
        return;
      }
      stato.textContent = voci.length === 1
        ? 'Una copia, dalla più recente.'
        : voci.length + ' copie, dalla più recente.';
      voci.forEach((voce, indice) => elenco.append(voceDom(voce, indice)));
    } catch (errore) {
      svuota(elenco);
      stato.textContent = errore instanceof ErroreApi
        ? errore.message
        : 'Non riesco a leggere l\'elenco delle copie.';
    }
  }

  return { nodo, aggiorna };
}
