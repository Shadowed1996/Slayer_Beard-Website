/* =====================================================================
   elenchi.js — i due tipi che contengono altri campi.

     elencoTesti : un elenco di stringhe (una riga per voce)
     elenco      : un elenco di oggetti, ognuno con i suoi sottocampi

   Le voci di `elenco` sono pieghevoli: un elenco di cinque social con tre
   campi ciascuno, tutto aperto, sarebbe un muro. Il titolo della voce
   chiusa viene dalla proprieta' indicata da `etichettaVoce` nello schema,
   e si aggiorna mentre si scrive.

   Lo stato aperto / chiuso si legge dal DOM prima di ridisegnare, invece
   di tenerlo in una variabile: cosi' resta giusto anche quando qualcun
   altro apre una voce da fuori (per esempio apriVoci(), che serve a far
   vedere un errore di convalida finito dentro una voce chiusa).
   ===================================================================== */

import { el, icona, bottone, svuota, idUnico } from './dom.js';
import { guscio, attaccaErrore, creaCampo, valoreVuoto, chiaveRelativa, clona } from './campi.js';

/**
 * Apre tutte le voci pieghevoli che contengono questo nodo.
 * Serve quando bisogna portare la vista su un campo che sta dentro una
 * voce chiusa: mostrare l'errore su un campo invisibile non aiuta nessuno.
 */
export function apriVoci(nodo) {
  let corrente = nodo instanceof Element ? nodo.parentElement : null;
  while (corrente) {
    const voce = corrente.closest('.voce');
    if (!voce) return;
    const toggle = voce.querySelector(':scope > .voce__testa > .voce__toggle');
    const corpo = voce.querySelector(':scope > .voce__corpo');
    if (toggle && corpo && corpo.hidden) {
      corpo.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
    }
    corrente = voce.parentElement;
  }
}

/* ---------------------------------------------------------------------
   elencoTesti — righe di testo semplice
   --------------------------------------------------------------------- */

export function creaCampoElencoTesti(campo, accesso, ctx) {
  const parti = guscio(campo, { ...ctx.opzioni, perInput: false });
  const contenitore = el('ol', { classe: 'righe', role: 'group', 'aria-labelledby': parti.idEtichetta });
  const limite = Number(campo.max) > 0 ? Number(campo.max) : null;

  const voci = () => {
    const v = accesso.leggi();
    return Array.isArray(v) ? v : [];
  };

  const salva = (elenco) => {
    accesso.scrivi(elenco);
    ctx.modificato();
  };

  const sposta = (da, a) => {
    const elenco = voci().slice();
    if (a < 0 || a >= elenco.length) return;
    const [presa] = elenco.splice(da, 1);
    elenco.splice(a, 0, presa);
    salva(elenco);
    disegna();
    const bersaglio = contenitore.querySelector('[data-riga="' + a + '"] input');
    if (bersaglio) bersaglio.focus();
  };

  function disegna() {
    svuota(contenitore);
    const elenco = voci();

    if (!elenco.length) {
      contenitore.append(el('li', { classe: 'elenco__vuoto', testo: 'Nessuna riga. Usa «Aggiungi una riga» qui sotto.' }));
    }

    elenco.forEach((valore, indice) => {
      const idRiga = idUnico('riga');
      const input = el('input', {
        id: idRiga, classe: 'campo__input', type: 'text', autocomplete: 'off',
        maxlength: limite, value: valore === null || valore === undefined ? '' : String(valore),
        'aria-label': (campo.etichetta || campo.chiave) + ', riga ' + (indice + 1)
      });
      input.addEventListener('input', () => {
        const copia = voci().slice();
        copia[indice] = input.value;
        salva(copia);
      });

      contenitore.append(el('li', { classe: 'riga-testo', dati: { riga: String(indice) } }, [
        el('span', { classe: 'riga-testo__num', testo: String(indice + 1) }),
        input,
        bottone({
          ico: 'su', testo: 'Sposta la riga ' + (indice + 1) + ' più in alto', soloIcona: true,
          classe: 'btn btn--minimo', disabilitato: indice === 0, su: () => sposta(indice, indice - 1)
        }),
        bottone({
          ico: 'giu', testo: 'Sposta la riga ' + (indice + 1) + ' più in basso', soloIcona: true,
          classe: 'btn btn--minimo', disabilitato: indice === elenco.length - 1, su: () => sposta(indice, indice + 1)
        }),
        bottone({
          ico: 'cestino', testo: 'Elimina la riga ' + (indice + 1), soloIcona: true,
          classe: 'btn btn--minimo btn--pericolo',
          su: async () => {
            const testo = String(voci()[indice] || '').trim();
            const ok = await ctx.conferma({
              titolo: 'Elimino questa riga?',
              testo: [
                testo ? 'Sto per togliere «' + testo + '».' : 'Sto per togliere una riga vuota.',
                'Sparisce dalla bozza: il sito pubblicato cambia solo quando premi Pubblica.'
              ],
              conferma: 'Elimina la riga',
              pericolo: true
            });
            if (!ok) return;
            const copia = voci().slice();
            copia.splice(indice, 1);
            salva(copia);
            disegna();
            const primo = contenitore.querySelector('input') || aggiungi;
            primo.focus();
          }
        })
      ]));
    });
  }

  const aggiungi = bottone({
    testo: 'Aggiungi una riga', ico: 'piu', classe: 'btn',
    su: () => {
      const elenco = voci().slice();
      elenco.push('');
      salva(elenco);
      disegna();
      const ultima = contenitore.querySelector('[data-riga="' + (elenco.length - 1) + '"] input');
      if (ultima) ultima.focus();
    }
  });

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => true;
  controllo.fuoco = () => {
    const primo = contenitore.querySelector('input');
    (primo || aggiungi).focus();
  };

  disegna();
  parti.nodo.append(contenitore, el('div', { classe: 'immagine__azioni' }, [aggiungi]), parti.pie);
  return controllo;
}

/* ---------------------------------------------------------------------
   elenco — voci pieghevoli con sottocampi
   --------------------------------------------------------------------- */

export function creaCampoElenco(campo, accesso, ctx) {
  const parti = guscio(campo, { ...ctx.opzioni, perInput: false });
  const contenitore = el('ul', { classe: 'elenco', role: 'group', 'aria-labelledby': parti.idEtichetta });
  const sottocampi = Array.isArray(campo.campi) ? campo.campi : [];
  let sottoControlli = [];

  const voci = () => {
    const v = accesso.leggi();
    return Array.isArray(v) ? v : [];
  };

  const salva = (elenco) => {
    accesso.scrivi(elenco);
    ctx.modificato();
  };

  /**
   * Titolo della voce chiusa. Prima si prova la proprieta' indicata dallo
   * schema; poi il primo sottocampo di testo con qualcosa dentro; in
   * ultima istanza il numero, che almeno non e' vuoto.
   */
  const nomeVoce = (voce, indice) => {
    const preferita = campo.etichettaVoce;
    if (preferita) {
      const nome = chiaveRelativa(campo.chiave, String(preferita));
      const valore = voce && voce[nome];
      if (typeof valore === 'string' && valore.trim()) return valore.trim();
      if (typeof valore === 'number') return String(valore);
    }
    for (const sotto of sottocampi) {
      const valore = voce && voce[chiaveRelativa(campo.chiave, sotto.chiave)];
      if (typeof valore === 'string' && valore.trim()) return valore.trim();
    }
    return 'Voce ' + (indice + 1);
  };

  /** Voce nuova: tutti i sottocampi al loro valore vuoto sensato. */
  const voceNuova = () => {
    if (campo.voceVuota && typeof campo.voceVuota === 'object') return clona(campo.voceVuota);
    const nuova = {};
    for (const sotto of sottocampi) nuova[chiaveRelativa(campo.chiave, sotto.chiave)] = valoreVuoto(sotto);
    return nuova;
  };

  /** Stato aperto/chiuso preso dal DOM, cosi' non va mai fuori sincrono. */
  const statoAperture = () => Array.from(contenitore.querySelectorAll(':scope > .voce'))
    .map((voce) => {
      const corpo = voce.querySelector(':scope > .voce__corpo');
      return Boolean(corpo && !corpo.hidden);
    });

  const sposta = (da, a) => {
    const elenco = voci().slice();
    if (a < 0 || a >= elenco.length) return;
    const aperture = statoAperture();
    const [presa] = elenco.splice(da, 1);
    elenco.splice(a, 0, presa);
    const [apertaPresa] = aperture.splice(da, 1);
    aperture.splice(a, 0, apertaPresa);
    salva(elenco);
    disegna(aperture);
    const bersaglio = contenitore.querySelector('[data-voce="' + a + '"] [data-azione="' + (a < da ? 'su' : 'giu') + '"]');
    if (bersaglio) bersaglio.focus();
  };

  const elimina = async (indice) => {
    const nome = nomeVoce(voci()[indice], indice);
    const ok = await ctx.conferma({
      titolo: 'Elimino «' + nome + '»?',
      testo: [
        'Sto per togliere «' + nome + '» dall\'elenco «' + (campo.etichetta || campo.chiave) + '».',
        'Sparisce dalla bozza: il sito pubblicato cambia solo quando premi Pubblica.'
      ],
      conferma: 'Elimina la voce',
      pericolo: true
    });
    if (!ok) return;

    const aperture = statoAperture();
    const elenco = voci().slice();
    elenco.splice(indice, 1);
    aperture.splice(indice, 1);
    salva(elenco);
    disegna(aperture);
    const primo = contenitore.querySelector('.voce__toggle') || aggiungi;
    primo.focus();
  };

  function disegna(aperture = []) {
    svuota(contenitore);
    sottoControlli = [];
    const elenco = voci();

    if (!elenco.length) {
      contenitore.append(el('li', { classe: 'elenco__vuoto', testo: 'Nessuna voce. Usa «Aggiungi una voce» qui sotto.' }));
    }

    elenco.forEach((voce, indice) => {
      const idCorpo = idUnico('voce');
      const aperta = Boolean(aperture[indice]);

      const nome = el('span', { classe: 'voce__nome', testo: nomeVoce(voce, indice) });
      const corpo = el('div', { classe: 'voce__corpo', id: idCorpo, hidden: !aperta });

      const toggle = el('button', {
        type: 'button', classe: 'voce__toggle',
        'aria-expanded': String(aperta), 'aria-controls': idCorpo
      }, [
        icona('freccia', 'ico voce__freccia'),
        el('span', { classe: 'voce__num', testo: String(indice + 1).padStart(2, '0') }),
        nome
      ]);
      toggle.addEventListener('click', () => {
        const ora = corpo.hidden;
        corpo.hidden = !ora;
        toggle.setAttribute('aria-expanded', String(ora));
      });

      const aggiornaTitolo = () => { nome.textContent = nomeVoce(voci()[indice], indice); };

      for (const sotto of sottocampi) {
        const proprieta = chiaveRelativa(campo.chiave, sotto.chiave);
        const controlloInterno = creaCampo(
          // La chiave completa serve per far combaciare gli errori che il
          // server manda su una voce precisa: "config.social.1.url".
          { ...sotto, chiave: campo.chiave + '.' + indice + '.' + proprieta },
          {
            leggi: () => {
              const attuale = voci()[indice];
              return attuale ? attuale[proprieta] : undefined;
            },
            scrivi: (valore) => {
              const copia = voci().slice();
              copia[indice] = { ...copia[indice], [proprieta]: valore };
              accesso.scrivi(copia);
              aggiornaTitolo();
            }
          },
          { ...ctx, opzioni: { ...(ctx.opzioni || {}), mostraChiave: false } }
        );
        sottoControlli.push(controlloInterno);
        corpo.append(controlloInterno.nodo);
      }

      const su = bottone({
        ico: 'su', testo: 'Sposta «' + nomeVoce(voce, indice) + '» più in alto', soloIcona: true,
        classe: 'btn btn--minimo', disabilitato: indice === 0, su: () => sposta(indice, indice - 1),
        dati: { azione: 'su' }
      });
      const giu = bottone({
        ico: 'giu', testo: 'Sposta «' + nomeVoce(voce, indice) + '» più in basso', soloIcona: true,
        classe: 'btn btn--minimo', disabilitato: indice === elenco.length - 1, su: () => sposta(indice, indice + 1),
        dati: { azione: 'giu' }
      });

      contenitore.append(el('li', { classe: 'voce', dati: { voce: String(indice) } }, [
        el('div', { classe: 'voce__testa' }, [
          toggle,
          el('div', { classe: 'voce__comandi' }, [
            su, giu,
            bottone({
              ico: 'cestino', testo: 'Elimina «' + nomeVoce(voce, indice) + '»', soloIcona: true,
              classe: 'btn btn--minimo btn--pericolo', su: () => elimina(indice)
            })
          ])
        ]),
        corpo
      ]));
    });
  }

  const aggiungi = bottone({
    testo: 'Aggiungi una voce', ico: 'piu', classe: 'btn',
    su: () => {
      const aperture = statoAperture();
      const elenco = voci().slice();
      elenco.push(voceNuova());
      aperture.push(true);   // la voce appena creata si apre: va riempita subito
      salva(elenco);
      disegna(aperture);
      const ultima = contenitore.querySelector('[data-voce="' + (elenco.length - 1) + '"] input, [data-voce="' + (elenco.length - 1) + '"] textarea, [data-voce="' + (elenco.length - 1) + '"] select');
      if (ultima) ultima.focus();
    }
  });

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => {
    let tutto = true;
    for (const sotto of sottoControlli) {
      if (sotto.valida && !sotto.valida()) {
        tutto = false;
        apriVoci(sotto.nodo);
      }
    }
    controllo.mostraErrore(tutto ? '' : 'Ci sono voci con qualcosa da correggere.');
    return tutto;
  };
  controllo.fuoco = () => {
    const primo = contenitore.querySelector('.voce__toggle');
    (primo || aggiungi).focus();
  };

  // Alla prima apertura tutto e' chiuso: si vede l'elenco, non il muro.
  disegna(voci().map(() => false));
  parti.nodo.append(contenitore, el('div', { classe: 'immagine__azioni' }, [aggiungi]), parti.pie);
  return controllo;
}
