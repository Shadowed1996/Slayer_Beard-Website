import { api, ErroreApi, rottaAssente } from './api.js';
import { el, bottone, svuota, formattaData, copiaTesto } from './dom.js';
import { avviso, conferma } from './avvisi.js';

export const DIFFICOLTA = ['facile', 'medio', 'difficile', 'estremo'];
const NOMI = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile', estremo: 'Estremo', tutte: 'Tutte e quattro' };
const RIGA_OBS = 46;
const TESTA_OBS = 96;
const MASSIMO_LIVELLO = 9999;

function messaggio(errore, ripiego) {
  return errore instanceof ErroreApi ? errore.message : ripiego;
}

export function indirizzoObs(origine, difficolta) {
  return String(origine || '').replace(/\/+$/, '') + '/api/classifica/obs?difficolta=' + encodeURIComponent(difficolta);
}

export function misuraObs(difficolta, righe) {
  const n = Math.max(3, Math.min(25, Number(righe) || 10));
  const alto = Math.round((TESTA_OBS + n * RIGA_OBS) / 10) * 10;
  return difficolta === 'tutte' ? { largo: 1280, alto: alto } : { largo: 480, alto: alto };
}

export function partenzaDi(livello) {
  const l = livello || {};
  if (l.inAttesa && l.impostato >= 1) return l.impostato;
  if (l.ora >= 1) return l.ora;
  if (l.record >= 1) return l.record + 1;
  return 1;
}

function nomeDi(voce) {
  return String(voce.nome || voce.login || voce.id || '');
}

export function creaClassifica({ impostazioni = null } = {}) {
  const stato = el('p', { classe: 'campo__aiuto', testo: 'Carico la classifica…' });
  const obs = el('div', { classe: 'classifica__blocco' });
  const elenchi = el('div', { classe: 'classifica__blocco' });
  const livelli = el('div', { classe: 'classifica__blocco' });
  const bloccati = el('div', { classe: 'classifica__blocco' });
  const stagione = el('div', { classe: 'classifica__blocco' });
  const archivio = el('div', { classe: 'classifica__blocco' });
  const nodo = el('div', { classe: 'lavoro__corpo classifica' }, [impostazioni, stato, obs, elenchi, livelli, bloccati, stagione, archivio]);
  let dati = null;
  let sceltaObs = '';
  let schedaAperta = 'medio';
  let schedaLivelli = 'medio';
  let cercaLivelli = '';

  function disegnaObs() {
    const imp = (dati && dati.impostazioni) || {};
    if (!sceltaObs) sceltaObs = imp.difficoltaObs || 'medio';
    const origine = window.location.origin;
    const scelta = el('select', { classe: 'campo__scelta', id: 'classifica-obs-difficolta' },
      DIFFICOLTA.concat('tutte').map((d) => el('option', { value: d, testo: NOMI[d] })));
    scelta.value = sceltaObs;
    const campoUrl = el('input', { type: 'text', classe: 'campo__input classifica__url', id: 'classifica-obs-url', readonly: true, spellcheck: 'false' });
    const misura = el('p', { classe: 'campo__aiuto classifica__misura' });
    const cornice = el('div', { classe: 'classifica__cornice' });
    const esito = el('p', { classe: 'campo__aiuto', 'aria-live': 'polite' });
    const copia = bottone({
      testo: 'Copia', ico: 'copia', classe: 'btn',
      su: async () => {
        const fatto = await copiaTesto(campoUrl.value);
        esito.textContent = fatto ? 'Indirizzo copiato: incollalo in OBS in una sorgente «Browser».' : 'Non riesco a copiare: seleziona l\'indirizzo e copialo a mano.';
        if (!fatto) campoUrl.select();
      }
    });
    const apri = el('a', { classe: 'btn btn--minimo', target: '_blank', rel: 'noopener' }, [el('span', { testo: 'Apri' })]);

    function aggiorna() {
      sceltaObs = scelta.value;
      const url = indirizzoObs(origine, sceltaObs);
      campoUrl.value = url;
      apri.setAttribute('href', url);
      const m = misuraObs(sceltaObs, imp.righe);
      misura.textContent = 'Misura consigliata della sorgente Browser in OBS: ' + m.largo + ' × ' + m.alto + ' px. Lo sfondo è trasparente e si aggiorna da solo ogni ' + (imp.aggiornaSecondi || 15) + ' secondi.';
      const scala = Math.min(1, 440 / m.largo);
      const finestra = el('iframe', {
        classe: 'classifica__anteprima', src: url, title: 'Anteprima dell\'overlay per OBS', loading: 'lazy',
        width: String(m.largo), height: String(m.alto), style: '--scala:' + scala
      });
      cornice.setAttribute('style', '--alto:' + Math.round(m.alto * scala) + 'px');
      cornice.replaceChildren(finestra);
    }
    scelta.addEventListener('change', aggiorna);
    aggiorna();

    svuota(obs);
    obs.append(...[
      el('h3', { classe: 'lato__occhiello', testo: 'Overlay per OBS' }),
      el('div', { classe: 'campo' }, [
        el('label', { classe: 'campo__etichetta', for: 'classifica-obs-difficolta', testo: 'Difficoltà da mostrare' }),
        scelta
      ]),
      el('div', { classe: 'campo' }, [
        el('label', { classe: 'campo__etichetta', for: 'classifica-obs-url', testo: 'Indirizzo da incollare in OBS' }),
        el('div', { classe: 'classifica__copia' }, [campoUrl, copia, apri]),
        misura,
        esito
      ]),
      imp.attiva === false ? el('p', { classe: 'campo__aiuto classifica__spenta', testo: 'La classifica è spenta: l\'overlay mostra i nomi già registrati ma nessuno ne aggiunge di nuovi. Accendila qui sopra, poi Salva e Pubblica.' }) : null,
      cornice
    ].filter(Boolean));
  }

  async function togli(d, voce) {
    const ok = await conferma({
      titolo: 'Togliere ' + nomeDi(voce) + ' dalla classifica ' + NOMI[d] + '?',
      testo: ['Sparisce da questa classifica. Se non è bloccato può rientrare giocando di nuovo dal livello 1.'],
      conferma: 'Togli',
      pericolo: true
    });
    if (!ok) return;
    try {
      mostraTutto(await api.classificaTogli({ difficolta: d, id: voce.id }));
      avviso(nomeDi(voce) + ' tolto dalla classifica ' + NOMI[d] + '.', { tipo: 'ok' });
    } catch (e) {
      avviso(messaggio(e, 'Non sono riuscito a toglierlo.'), { tipo: 'errore' });
    }
  }

  async function blocca(voce, si) {
    if (si) {
      const ok = await conferma({
        titolo: 'Bloccare ' + nomeDi(voce) + '?',
        testo: ['Non potrà più entrare in nessuna classifica finché non lo sblocchi. Le voci che ha già restano: toglile a parte se serve.'],
        conferma: 'Blocca',
        pericolo: true
      });
      if (!ok) return;
    }
    try {
      mostraTutto(await api.classificaBlocca({ id: voce.id, blocca: si }));
      avviso(nomeDi(voce) + (si ? ' bloccato.' : ' sbloccato.'), { tipo: 'ok' });
    } catch (e) {
      avviso(messaggio(e, si ? 'Non sono riuscito a bloccarlo.' : 'Non sono riuscito a sbloccarlo.'), { tipo: 'errore' });
    }
  }

  function rigaVoce(d, voce, posizione) {
    const bloccato = voce.bloccato === true;
    return el('li', { classe: 'classifica__voce' + (bloccato ? ' is-bloccato' : '') }, [
      el('span', { classe: 'classifica__pos', testo: posizione + '°' }),
      voce.avatar ? el('img', { classe: 'classifica__avatar', src: voce.avatar, alt: '', width: '28', height: '28', loading: 'lazy', referrerpolicy: 'no-referrer' }) : el('span', { classe: 'classifica__avatar', 'aria-hidden': 'true' }),
      el('span', { classe: 'classifica__chi' }, [
        el('span', { classe: 'classifica__nome', testo: nomeDi(voce) + (bloccato ? ' · bloccato' : '') }),
        el('span', { classe: 'classifica__meta', testo: 'livello ' + voce.livello + (voce.quando ? ' · ' + formattaData(voce.quando) : '') + (voce.tentativi ? ' · ' + voce.tentativi + (voce.tentativi === 1 ? ' tentativo' : ' tentativi') : '') })
      ]),
      el('span', { classe: 'classifica__azioni' }, [
        bottone({ testo: 'Togli', ico: 'cestino', classe: 'btn btn--minimo', su: () => togli(d, voce) }),
        bottone({ testo: bloccato ? 'Sblocca' : 'Blocca', ico: bloccato ? 'ok' : 'attenzione', classe: 'btn btn--minimo', su: () => blocca(voce, !bloccato) })
      ])
    ]);
  }

  function disegnaElenchi() {
    const voci = (dati && dati.voci) || {};
    const schede = el('div', { classe: 'classifica__schede', role: 'tablist', 'aria-label': 'Difficoltà' });
    const corpo = el('div', { classe: 'classifica__elenco', role: 'tabpanel' });
    function apri(d) {
      schedaAperta = d;
      for (const b of schede.children) b.setAttribute('aria-selected', String(b.dataset.difficolta === d));
      const elenco = Array.isArray(voci[d]) ? voci[d] : [];
      svuota(corpo);
      if (!elenco.length) {
        corpo.append(el('p', { classe: 'vuoto', testo: 'Ancora nessuno in classifica a ' + NOMI[d] + '.' }));
        return;
      }
      corpo.append(el('ol', { classe: 'classifica__voci' }, elenco.map((v, i) => rigaVoce(d, v, i + 1))));
    }
    for (const d of DIFFICOLTA) {
      const n = Array.isArray(voci[d]) ? voci[d].length : 0;
      schede.append(el('button', {
        type: 'button', role: 'tab', classe: 'classifica__scheda', dati: { difficolta: d },
        su: { click: () => apri(d) }
      }, [el('span', { testo: NOMI[d] }), el('span', { classe: 'classifica__conta', testo: String(n) })]));
    }
    apri(schedaAperta);
    svuota(elenchi);
    elenchi.append(el('h3', { classe: 'lato__occhiello', testo: 'Chi è in classifica' + (dati && dati.stagione && dati.stagione.nome ? ' · ' + dati.stagione.nome : '') }), schede, corpo);
  }

  function massimo() {
    const n = Number(dati && dati.livelloMassimo);
    return Number.isInteger(n) && n >= 1 ? n : MASSIMO_LIVELLO;
  }

  async function sposta(giocatore, d, livello, pulsanti) {
    const n = Math.max(1, Math.min(massimo(), Math.floor(Number(livello))));
    if (!Number.isFinite(n)) return;
    for (const p of pulsanti) p.disabled = true;
    try {
      mostraTutto(await api.classificaPartenza({ id: giocatore.id, difficolta: d, livello: n }));
      avviso(nomeDi(giocatore) + ' a ' + NOMI[d] + ' ripartirà dal livello ' + n + '.', { tipo: 'ok', titolo: 'Livello spostato' });
    } catch (e) {
      for (const p of pulsanti) p.disabled = false;
      avviso(messaggio(e, 'Non sono riuscito a spostare il livello.'), { tipo: 'errore' });
    }
  }

  function rigaLivello(giocatore, d) {
    const l = (giocatore.livelli && giocatore.livelli[d]) || {};
    const attuale = partenzaDi(l);
    const alto = massimo();
    const campo = el('input', {
      type: 'number', classe: 'campo__input classifica__numero', min: '1', max: String(alto), step: '1', value: String(attuale),
      inputmode: 'numeric', 'aria-label': 'Livello da cui riparte ' + nomeDi(giocatore) + ' a ' + NOMI[d]
    });
    const pulsanti = [];
    const giu = bottone({ testo: 'Un livello indietro', ico: 'giu', classe: 'btn btn--minimo', soloIcona: true, disabilitato: attuale <= 1, su: () => sposta(giocatore, d, attuale - 1, pulsanti) });
    const su = bottone({ testo: 'Un livello avanti', ico: 'su', classe: 'btn btn--minimo', soloIcona: true, disabilitato: attuale >= alto, su: () => sposta(giocatore, d, attuale + 1, pulsanti) });
    const imposta = bottone({
      testo: 'Imposta', ico: 'ok', classe: 'btn btn--minimo',
      su: () => {
        const n = Number(campo.value);
        if (!Number.isInteger(n) || n < 1 || n > alto) {
          avviso('Il livello va da 1 a ' + alto + '.', { tipo: 'errore' });
          campo.focus();
          return;
        }
        sposta(giocatore, d, n, pulsanti);
      }
    });
    pulsanti.push(giu, su, imposta, campo);
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') { evento.preventDefault(); imposta.click(); }
    });
    const stato = [
      l.ora ? 'è al livello ' + l.ora : 'livello non ancora visto',
      l.record ? 'record in classifica ' + l.record : '',
      giocatore.visto ? 'visto ' + formattaData(giocatore.visto) : ''
    ].filter(Boolean).join(' · ');
    let nota = null;
    if (l.inAttesa) {
      nota = el('span', { classe: 'classifica__meta classifica__attesa', testo: 'Spostato al livello ' + l.impostato + ': lo trova la prossima volta che apre il gioco collegato' });
    } else if (l.impostato && l.applicatoIl) {
      nota = el('span', { classe: 'classifica__meta', testo: 'Spostato al livello ' + l.impostato + ', arrivato il ' + formattaData(l.applicatoIl) });
    }
    return el('li', { classe: 'classifica__voce' + (giocatore.bloccato ? ' is-bloccato' : ''), dati: { id: giocatore.id } }, [
      giocatore.avatar ? el('img', { classe: 'classifica__avatar', src: giocatore.avatar, alt: '', width: '28', height: '28', loading: 'lazy', referrerpolicy: 'no-referrer' }) : el('span', { classe: 'classifica__avatar', 'aria-hidden': 'true' }),
      el('span', { classe: 'classifica__chi' }, [
        el('span', { classe: 'classifica__nome', testo: nomeDi(giocatore) + (giocatore.bloccato ? ' · bloccato' : '') }),
        el('span', { classe: 'classifica__meta', testo: stato }),
        nota
      ]),
      el('span', { classe: 'classifica__azioni classifica__sposta' }, [giu, campo, su, imposta])
    ]);
  }

  function disegnaLivelli() {
    svuota(livelli);
    const tutti = (dati && Array.isArray(dati.giocatori)) ? dati.giocatori : [];
    const schede = el('div', { classe: 'classifica__schede', role: 'tablist', 'aria-label': 'Difficoltà dei livelli' });
    const corpo = el('div', { classe: 'classifica__elenco', role: 'tabpanel' });
    const cerca = el('input', { type: 'search', classe: 'campo__input', id: 'classifica-livelli-cerca', placeholder: 'Cerca per nome', value: cercaLivelli, spellcheck: 'false', autocomplete: 'off' });
    function riempi() {
      svuota(corpo);
      const filtro = cercaLivelli.trim().toLowerCase();
      const scelti = filtro ? tutti.filter((g) => (String(g.nome || '') + ' ' + String(g.login || '')).toLowerCase().indexOf(filtro) !== -1) : tutti;
      if (!tutti.length) {
        corpo.append(el('p', { classe: 'vuoto', testo: 'Ancora nessuno: qui compare chi apre Pollo Run collegato con Twitch.' }));
        return;
      }
      if (!scelti.length) {
        corpo.append(el('p', { classe: 'vuoto', testo: 'Nessun giocatore con questo nome.' }));
        return;
      }
      corpo.append(el('ul', { classe: 'classifica__voci' }, scelti.map((g) => rigaLivello(g, schedaLivelli))));
    }
    function apri(d) {
      schedaLivelli = d;
      for (const b of schede.children) b.setAttribute('aria-selected', String(b.dataset.difficolta === d));
      riempi();
    }
    for (const d of DIFFICOLTA) {
      schede.append(el('button', {
        type: 'button', role: 'tab', classe: 'classifica__scheda', dati: { difficolta: d },
        su: { click: () => apri(d) }
      }, [el('span', { testo: NOMI[d] })]));
    }
    cerca.addEventListener('input', () => { cercaLivelli = cerca.value; riempi(); });
    livelli.append(...[
      el('h3', { classe: 'lato__occhiello', testo: 'Livello dei giocatori' }),
      el('p', { classe: 'campo__aiuto', testo: 'Scegli da che livello riparte un giocatore: con le frecce lo porti avanti o indietro di uno, oppure scrivi il livello (da 1 a ' + massimo() + ') e premi Imposta. Il cambio arriva la prossima volta che apre il gioco collegato con Twitch, con la classifica accesa; poi continua da lì come sempre. La classifica e i record non cambiano.' }),
      schede,
      tutti.length > 6 ? el('div', { classe: 'campo' }, [el('label', { classe: 'sr-only', for: 'classifica-livelli-cerca', testo: 'Cerca un giocatore' }), cerca]) : null,
      corpo
    ].filter(Boolean));
    apri(schedaLivelli);
  }

  function disegnaBloccati() {
    svuota(bloccati);
    const elenco = (dati && Array.isArray(dati.bloccati)) ? dati.bloccati : [];
    if (!elenco.length) return;
    bloccati.append(
      el('h3', { classe: 'lato__occhiello', testo: 'Bloccati' }),
      el('ul', { classe: 'classifica__voci' }, elenco.map((b) => el('li', { classe: 'classifica__voce is-bloccato' }, [
        el('span', { classe: 'classifica__chi' }, [
          el('span', { classe: 'classifica__nome', testo: nomeDi(b) }),
          el('span', { classe: 'classifica__meta', testo: 'id Twitch ' + b.id })
        ]),
        el('span', { classe: 'classifica__azioni' }, [
          bottone({ testo: 'Sblocca', ico: 'ok', classe: 'btn btn--minimo', su: () => blocca(b, false) })
        ])
      ])))
    );
  }

  function disegnaStagione() {
    svuota(stagione);
    const nome = el('input', { type: 'text', classe: 'campo__input', id: 'classifica-stagione-nome', maxlength: '60', placeholder: 'Per esempio: Stagione di ottobre' });
    const tasto = bottone({
      testo: 'Nuova stagione', ico: 'ricarica', classe: 'btn',
      su: async () => {
        const attuale = dati && dati.stagione && dati.stagione.nome ? dati.stagione.nome : 'la stagione in corso';
        const ok = await conferma({
          titolo: 'Cominciare una nuova stagione?',
          testo: ['Tutte e quattro le classifiche ripartono da zero. ' + attuale + ' finisce nell\'archivio qui sotto: non si cancella niente.'],
          conferma: 'Nuova stagione',
          pericolo: true
        });
        if (!ok) return;
        tasto.disabled = true;
        try {
          mostraTutto(await api.classificaStagione({ nome: nome.value.trim() }));
          avviso('Nuova stagione cominciata: le classifiche ripartono da zero.', { tipo: 'ok', titolo: 'Classifica' });
        } catch (e) {
          avviso(messaggio(e, 'Non sono riuscito a cominciare la nuova stagione.'), { tipo: 'errore' });
        } finally {
          tasto.disabled = false;
        }
      }
    });
    const inizio = dati && dati.stagione && dati.stagione.inizio ? 'In corso dal ' + formattaData(dati.stagione.inizio) + '.' : '';
    stagione.append(
      el('h3', { classe: 'lato__occhiello', testo: 'Stagione' }),
      el('div', { classe: 'campo' }, [
        el('label', { classe: 'campo__etichetta', for: 'classifica-stagione-nome', testo: 'Nome della prossima stagione (facoltativo)' }),
        nome,
        el('p', { classe: 'campo__aiuto', testo: [inizio, 'Una nuova stagione archivia le classifiche di adesso e le fa ripartire da zero, anche nell\'overlay per OBS.'].filter(Boolean).join(' ') })
      ]),
      el('div', { classe: 'lato__azioni' }, [tasto])
    );
  }

  function disegnaArchivio() {
    svuota(archivio);
    const elenco = (dati && Array.isArray(dati.stagioni)) ? dati.stagioni : [];
    if (!elenco.length) return;
    archivio.append(el('h3', { classe: 'lato__occhiello', testo: 'Stagioni passate' }));
    for (const s of elenco) {
      const totali = s.totali || {};
      const primi = DIFFICOLTA.map((d) => {
        const v = s.voci && Array.isArray(s.voci[d]) && s.voci[d][0];
        return NOMI[d] + ': ' + (totali[d] || 0) + (v ? ' (1° ' + nomeDi(v) + ', livello ' + v.livello + ')' : '');
      });
      archivio.append(el('div', { classe: 'sondaggi__scheda' }, [
        el('p', { classe: 'sondaggi__domanda', testo: s.nome || s.id }),
        el('p', { classe: 'campo__aiuto', testo: (s.inizio ? formattaData(s.inizio) : '') + (s.fine ? ' → ' + formattaData(s.fine) : '') }),
        el('p', { classe: 'classifica__meta', testo: primi.join(' · ') })
      ]));
    }
  }

  function mostraTutto(nuovi) {
    dati = nuovi && typeof nuovi === 'object' ? nuovi : {};
    stato.textContent = '';
    stato.hidden = true;
    disegnaObs();
    disegnaElenchi();
    disegnaLivelli();
    disegnaBloccati();
    disegnaStagione();
    disegnaArchivio();
  }

  async function aggiorna() {
    try {
      mostraTutto(await api.classifica());
    } catch (e) {
      stato.hidden = false;
      stato.textContent = rottaAssente(e)
        ? 'Il server non ha ancora la classifica: va aggiornato.'
        : messaggio(e, 'Non riesco a leggere la classifica.');
    }
  }

  aggiorna();
  return { nodo, aggiorna };
}
