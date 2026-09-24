

import { api, ErroreApi, erroriDiConvalida, quandoScadeLaSessione } from './moduli/api.js';
import { el, formattaData, tempoFa, leggiPreferenza, scriviPreferenza } from './moduli/dom.js';
import { avviso, avvisoAttesa, apriDialogo, conferma } from './moduli/avvisi.js';
import { creaCampo, leggiChiave, scriviChiave, clona, uguali } from './moduli/campi.js';
import { apriVoci } from './moduli/elenchi.js';
import { scegliImmagine } from './moduli/media.js';
import { ponte, collegaPonte } from './editor/ponte.js';

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
  pannello: $('pannello'),
  statoLavoro: $('stato-lavoro'),
  ultimaPubblicazione: $('ultima-pubblicazione'),
  btnSalva: $('btn-salva'),
  btnPubblica: $('btn-pubblica'),
  spiaManutenzione: $('spia-manutenzione')
};

function leggiPref(nome, predefinito) {
  const valore = leggiPreferenza(nome, null);
  return valore === null ? predefinito : valore === '1';
}

function scriviPref(nome, acceso) {
  scriviPreferenza(nome, acceso ? '1' : '0');
}

const stato = {
  schema: null,
  dati: null,
  salvato: null,
  stato: null,
  tema: null,
  editor: null,
  errori: new Map(),
  modoAccesso: 'entra',
  inCorso: false
};
ponte.stato = stato;

let guscio = null;
let caricamentoGuscio = null;

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

function sporco() {
  if (!stato.dati || !stato.salvato) return false;
  return !uguali({ testi: stato.dati.testi, config: stato.dati.config }, stato.salvato);
}

function segnaStato(tipo, testo) {
  dom.statoLavoro.dataset.stato = tipo;
  dom.statoLavoro.querySelector('.stato__testo').textContent = testo;
}

function passoAdesso() {
  if (sporco()) return 'salva';
  return stato.stato && stato.stato.daPubblicare ? 'pubblica' : 'modifica';
}

function manutenzioneInBozza() {
  const ramo = stato.dati && stato.dati.config && stato.dati.config.manutenzione;
  return Boolean(ramo && ramo.attiva === true);
}

function aggiornaManutenzione() {
  const spia = dom.spiaManutenzione;
  if (!spia) return;
  const bozza = manutenzioneInBozza();
  const online = Boolean(stato.stato && stato.stato.manutenzione === true);
  spia.hidden = !bozza && !online;
  if (spia.hidden) return;
  let testo = 'Manutenzione attiva';
  let titolo = 'Il sito pubblicato mostra a tutti la pagina di manutenzione. Per riaprirlo spegni «Sito in manutenzione», salva e pubblica.';
  if (bozza && !online) {
    testo = 'Manutenzione da pubblicare';
    titolo = 'La modalità manutenzione è accesa ma il sito pubblicato non è ancora cambiato: salva e premi Pubblica per metterlo in manutenzione.';
  } else if (!bozza && online) {
    testo = 'Sito ancora in manutenzione';
    titolo = 'Hai spento la modalità manutenzione, ma il pubblico vede ancora la pagina di manutenzione: salva e premi Pubblica per riaprire il sito.';
  }
  spia.dataset.stato = bozza && online ? 'online' : 'bozza';
  spia.querySelector('.barra__manutenzione-testo').textContent = testo;
  spia.title = titolo + ' Clicca per aprire le impostazioni della manutenzione.';
  spia.setAttribute('aria-label', testo + '. ' + titolo);
}

function aggiornaStato() {
  aggiornaManutenzione();
  if (stato.inCorso) return;
  const modificato = sporco();
  dom.corpo.dataset.sporco = modificato ? '1' : '0';
  segnaStato(modificato ? 'sporco' : 'pulito', modificato ? 'Modifiche non salvate' : 'Tutto salvato');
  dom.btnSalva.disabled = !modificato;
  dom.btnPubblica.disabled = !stato.dati;
  if (guscio) guscio.aggiornaPassi(passoAdesso());
}

let statoProgrammato = 0;
function programmaStato() {
  if (statoProgrammato) return;
  statoProgrammato = requestAnimationFrame(() => {
    statoProgrammato = 0;
    aggiornaStato();
  });
}

function bloccaComandi(bloccato, testoStato) {
  stato.inCorso = bloccato;
  dom.btnSalva.disabled = bloccato || !sporco();
  dom.btnPubblica.disabled = bloccato || !stato.dati;
  if (bloccato) segnaStato('lavoro', testoStato || 'Un attimo…');
  else aggiornaStato();
}

function dataPubblicazione() {
  const s = stato.stato;
  if (!s || typeof s !== 'object') return null;
  for (const nome of ['pubblicatoIl', 'ultimaPubblicazione', 'pubblicataIl', 'generatoIl', 'ultimaPubblicazioneIl', 'pubblicato']) {
    const valore = s[nome];
    if (typeof valore === 'string' && valore.trim()) return valore;
    if (typeof valore === 'number') return valore;
  }
  return null;
}

function testoPubblicazione() {
  const data = dataPubblicazione();
  const daFare = Boolean(stato.stato && stato.stato.daPubblicare);
  if (!data) {
    return {
      testo: 'Il sito non è mai stato pubblicato: premi Pubblica per generarlo la prima volta.',
      breve: 'Mai pubblicato',
      titolo: 'La prima pubblicazione crea index.html, js/dati.js e css/tema.css.',
      daFare: true
    };
  }
  const quando = tempoFa(data);
  return {
    testo: 'Pubblicato ' + formattaData(data) + (quando ? ' · ' + quando : '') +
      (daFare ? ' · ci sono modifiche salvate non ancora pubblicate' : ''),
    breve: (quando ? 'Pubblicato ' + quando : 'Pubblicato') + (daFare ? ' · da ripubblicare' : ''),
    titolo: daFare
      ? 'La bozza salvata è più recente del sito pubblicato: premi Pubblica per allinearli.'
      : 'Ultima volta che il sito pubblicato è stato riscritto: ' + formattaData(data) + '.',
    daFare
  };
}

function aggiornaPubblicazione() {
  aggiornaManutenzione();
  const info = testoPubblicazione();
  dom.ultimaPubblicazione.textContent = info.breve;
  dom.ultimaPubblicazione.title = info.testo + '. ' + info.titolo;
  dom.ultimaPubblicazione.dataset.daFare = info.daFare ? '1' : '0';
  if (guscio) {
    guscio.aggiornaPubblicazione(info);
    guscio.aggiornaPassi(passoAdesso());
  }
}

function normalizzaChiave(chiave) {
  return String(chiave || '').replace(/\[(\d+)\]/g, '.$1');
}

function gruppi() {
  return (stato.schema && Array.isArray(stato.schema.gruppi)) ? stato.schema.gruppi : [];
}

const ctx = {
  opzioni: { mostraChiave: leggiPref('nomi-tecnici', false) },

  modificato: () => programmaStato(),

  registra: (controllo) => registraControllo(controllo),
  conferma,
  scegliImmagine: (valoreCorrente) => scegliImmagine({ valoreCorrente, usoDi }),

  tema: null,

  get fontCaricati() {
    return stato.editor && Array.isArray(stato.editor.font) ? stato.editor.font : undefined;
  }
};

function emettiModifica(chiave, strutturale) {
  programmaStato();
  document.dispatchEvent(new CustomEvent('sb:modifica', {
    detail: { chiave: String(chiave || ''), strutturale: Boolean(strutturale) }
  }));
}

function accessoPer(chiave) {
  return {
    leggi: () => (stato.dati ? leggiChiave(stato.dati, chiave) : undefined),
    scrivi: (valore) => {
      if (!stato.dati) return;
      scriviChiave(stato.dati, chiave, valore);
      emettiModifica(chiave, false);
    }
  };
}

function usoDi(percorso) {
  const cercato = String(percorso || '').replace(/^\/+/, '');
  if (!cercato || !stato.schema || !stato.dati) return [];
  const trovati = [];

  for (const gruppo of gruppi()) {
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
      if (campo.tipo === 'orari') {
        const orari = leggiChiave(stato.dati, campo.chiave);
        const pari = (valore) => String(valore || '').replace(/^\/+/, '') === cercato;
        const nomi = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
        if (orari && typeof orari === 'object') {
          (Array.isArray(orari.schede) ? orari.schede : []).forEach((scheda, giorno) => {
            if (scheda && pari(scheda.immagine)) trovati.push('Schedule · ' + (nomi[giorno] || 'giorno ' + giorno));
          });
          (Array.isArray(orari.eventi) ? orari.eventi : []).forEach((evento, indice) => {
            if (evento && pari(evento.immagine)) {
              trovati.push('Schedule · evento ' + (evento.titolo ? '«' + evento.titolo + '»' : indice + 1));
            }
          });
          if (orari.sfondo && pari(orari.sfondo.immagine)) trovati.push('Schedule · fondale della sezione');
        }
      }
    }
  }
  const stili = stato.dati.config && stato.dati.config.stili;
  if (stili && typeof stili === 'object') {
    for (const [bersaglio, voce] of Object.entries(stili)) {
      for (const valori of Object.values(voce || {})) {
        if (valori && String(valori.sfondoImmagine || '').replace(/^\/+/, '') === cercato) {
          trovati.push('Stile di ' + bersaglio + ' · sfondo');
          break;
        }
      }
    }
  }
  return trovati;
}

const controlli = new Map();
const MAX_PER_CHIAVE = 6;

function registraControllo(controllo) {
  if (!controllo || !controllo.chiave || !controllo.nodo) return;
  const chiave = normalizzaChiave(controllo.chiave);
  const elenco = (controlli.get(chiave) || []).filter((c) => c.nodo.isConnected);
  elenco.push(controllo);
  while (elenco.length > MAX_PER_CHIAVE) elenco.shift();
  controlli.set(chiave, elenco);

  if (stato.errori.size) queueMicrotask(() => appoggiaErroriA(controllo));
}

function visibile(nodo) {
  return Boolean(nodo && nodo.isConnected && nodo.getClientRects().length);
}

function controlloPer(chiave) {
  let corrente = normalizzaChiave(chiave);
  while (corrente) {
    const elenco = (controlli.get(corrente) || []).filter((c) => c.nodo.isConnected);
    if (elenco.length) {
      const visto = elenco.slice().reverse().find((c) => visibile(c.nodo));
      return visto || elenco[elenco.length - 1];
    }
    const taglio = corrente.lastIndexOf('.');
    if (taglio < 0) return null;
    corrente = corrente.slice(0, taglio);
  }
  return null;
}

function tuttiIControlli() {
  const tutti = [];
  for (const elenco of controlli.values()) {
    for (const controllo of elenco) if (controllo.nodo.isConnected) tutti.push(controllo);
  }
  return tutti;
}

function appoggiaErroriA(controllo) {
  if (!controllo.nodo.isConnected) return;
  for (const [chiave, messaggio] of stato.errori) {
    if (controlloPer(chiave) !== controllo) continue;
    controllo.mostraErrore(messaggio);
    apriVoci(controllo.nodo);
  }
}

function applicaErrori() {
  for (const [chiave, messaggio] of stato.errori) {
    const controllo = controlloPer(chiave);
    if (!controllo) continue;
    controllo.mostraErrore(messaggio);
    apriVoci(controllo.nodo);
  }
}

function mostraErroriConvalida(elenco) {
  stato.errori = new Map(elenco.map((e) => [normalizzaChiave(e.chiave), e.messaggio]));
  applicaErrori();
  if (guscio) guscio.mostraErrori(elenco.map((e) => ({ chiave: normalizzaChiave(e.chiave), messaggio: e.messaggio })));
}

function azzeraErrori() {
  stato.errori.clear();
  for (const controllo of tuttiIControlli()) if (controllo.pulisci) controllo.pulisci();
  if (guscio) guscio.mostraErrori([]);
}

for (const evento of ['input', 'change']) {
  dom.pannello.addEventListener(evento, (e) => {
    if (!stato.errori.size) return;
    const campo = e.target instanceof Element ? e.target.closest('.campo[data-chiave]') : null;
    if (!campo) return;
    if (stato.errori.delete(normalizzaChiave(campo.dataset.chiave)) && guscio) {
      guscio.mostraErrori(Array.from(stato.errori, ([chiave, messaggio]) => ({ chiave, messaggio })), { soloRiepilogo: true });
    }
  });
}

function trovaCampo(chiave) {
  const cercata = normalizzaChiave(chiave);
  if (!cercata) return null;
  for (const gruppo of gruppi()) {
    for (const campo of gruppo.campi || []) {
      if (campo.chiave === cercata) return campo;
    }
  }
  return null;
}

function gruppoDi(chiave) {
  const cercata = normalizzaChiave(chiave);
  if (!cercata) return null;
  for (const gruppo of gruppi()) {
    for (const campo of gruppo.campi || []) {
      if (cercata === campo.chiave || cercata.startsWith(campo.chiave + '.')) return gruppo;
    }
  }
  return null;
}

function creaCampoPonte(campoOChiave) {
  if (!stato.dati || !stato.schema) return null;
  const campo = typeof campoOChiave === 'string' ? trovaCampo(campoOChiave) : campoOChiave;
  if (!campo || typeof campo !== 'object' || !campo.chiave) return null;
  try {
    return creaCampo(campo, accessoPer(normalizzaChiave(campo.chiave)), ctx);
  } catch (errore) {
    console.error('[pannello] campo non disegnato:', campo.chiave, errore);
    return null;
  }
}

collegaPonte({
  leggi: (chiave) => (stato.dati ? leggiChiave(stato.dati, normalizzaChiave(chiave)) : undefined),
  scrivi: (chiave, valore, { strutturale = false } = {}) => {
    if (!stato.dati) return;
    const normale = normalizzaChiave(chiave);
    if (!normale) return;
    scriviChiave(stato.dati, normale, valore);
    emettiModifica(normale, strutturale);
  },
  segnala: (chiave, { strutturale = false } = {}) => {
    if (!stato.dati) return;
    emettiModifica(normalizzaChiave(chiave), strutturale);
  },
  campo: trovaCampo,
  gruppo: (id) => gruppi().find((g) => g.id === id) || null,
  gruppoDi,
  etichetta: (chiave) => {
    const campo = trovaCampo(chiave);
    return (campo && campo.etichetta) || String(chiave || '');
  },
  creaCampo: creaCampoPonte,
  scegliImmagine: (valoreCorrente) => scegliImmagine({ valoreCorrente, usoDi }),
  salva: () => salva(),
  pubblica: () => pubblica()
});

function applicaNomiTecnici(mostra) {
  ctx.opzioni.mostraChiave = Boolean(mostra);
  scriviPref('nomi-tecnici', ctx.opzioni.mostraChiave);
  if (guscio) guscio.ridisegna();
}

function convalidaLocale() {
  let primoErrato = null;
  for (const controllo of tuttiIControlli()) {
    if (!controllo.valida || !visibile(controllo.nodo)) continue;
    if (!controllo.valida() && !primoErrato) primoErrato = controllo;
  }
  if (primoErrato && guscio) guscio.portaSu(primoErrato);
  return !primoErrato;
}

async function salva({ silenzioso = false } = {}) {
  if (!stato.dati) return false;

  if (!convalidaLocale()) {
    avviso('Ci sono campi da correggere qui nel pannello: guarda i messaggi in rosso.',
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
    if (risposta && risposta.stato) { stato.stato = risposta.stato; aggiornaPubblicazione(); }

    azzeraErrori();
    bloccaComandi(false);
    if (!silenzioso) {
      inCorso.riuscito('Bozza salvata. Il sito pubblicato non è cambiato: per quello serve Pubblica.', 'Salvato');
    } else {
      inCorso.chiudi();
    }
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
  if (!stato.dati) return false;

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
    if (scelta !== 'salva') return false;
    const salvato = await salva({ silenzioso: true });
    if (!salvato) return false;
  }

  const testoConferma = [
    'Il server riscrive dalla bozza salvata i tre file che il pubblico vede: la pagina, i dati che usa il JavaScript e il foglio dei colori. Da quel momento chiunque apra il sito vede queste modifiche.',
    'Prima di scrivere mette da parte una copia di sicurezza: se qualcosa non va, si torna indietro da menu ☰ → Copie di sicurezza.'
  ];
  if (manutenzioneInBozza()) {
    testoConferma.unshift('La modalità manutenzione è accesa: dopo la pubblicazione chiunque apra il sito vede la pagina di manutenzione, e player, lurk, pollo, musica e sondaggi si fermano.');
  } else if (stato.stato && stato.stato.manutenzione === true) {
    testoConferma.unshift('La modalità manutenzione è spenta: con questa pubblicazione il sito torna visibile a tutti.');
  }
  const ok = await conferma({
    titolo: 'Pubblico il sito?',
    testo: testoConferma,
    dettagli: el('div', { classe: 'dialogo__elenco' }, [
      el('span', { testo: '· index.html — la pagina' }),
      el('span', { testo: '· js/dati.js — orari, canale, testi che servono al JavaScript' }),
      el('span', { testo: '· css/tema.css — colori, font e forme' })
    ]),
    conferma: 'Pubblica adesso',
    annulla: 'Non adesso'
  });
  if (!ok) return false;

  const inCorso = avvisoAttesa('Sto pubblicando il sito…');
  bloccaComandi(true, 'Sto pubblicando…');

  try {
    const risposta = await api.pubblica();
    const durata = risposta && Number(risposta.durataMs);
    const scritti = risposta && Array.isArray(risposta.scritti) ? risposta.scritti.length : 0;
    const inManutenzione = Boolean(risposta && risposta.manutenzione && risposta.manutenzione.attiva === true);
    if (inManutenzione) {
      inCorso.riuscito(
        'Il sito adesso è in manutenzione: chi apre la home o clip.html vede la pagina di manutenzione, e player, lurk, pollo, musica e sondaggi sono fermi. Per riaprirlo spegni «Sito in manutenzione» (menu ☰ → Manutenzione), salva e pubblica.',
        'Pubblicato · sito in manutenzione'
      );
    } else {
      inCorso.riuscito(
        'Il sito pubblicato è aggiornato' +
        (scritti ? ': ' + scritti + (scritti === 1 ? ' file riscritto' : ' file riscritti') : '') +
        (Number.isFinite(durata) ? (scritti ? ', ' : ' ') + 'in ' + durata + ' ms' : '') + '.',
        'Pubblicato'
      );
    }

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

    const daTwitch = risposta && risposta.twitch;
    if (daTwitch && daTwitch.messaggio && daTwitch.stato !== 'spento' && daTwitch.stato !== 'invariato') {
      const andataMale = daTwitch.stato === 'fallito' || daTwitch.stato === 'vuoto' || daTwitch.stato === 'senzaCanale';
      avviso(daTwitch.messaggio, {
        tipo: andataMale ? 'info' : 'ok',
        durata: andataMale ? 0 : 6000,
        titolo: andataMale ? 'Ultima diretta non aggiornata' : 'Ultima diretta aggiornata'
      });
    }

    const iFollower = risposta && risposta.follower;
    if (iFollower && iFollower.messaggio && iFollower.stato !== 'spento' && iFollower.stato !== 'invariato') {
      const andataMale = iFollower.stato === 'fallito' || iFollower.stato === 'vuoto' || iFollower.stato === 'senzaCanale';
      avviso(iFollower.messaggio, {
        tipo: andataMale ? 'info' : 'ok',
        durata: andataMale ? 0 : 6000,
        titolo: andataMale ? 'Follower non aggiornati' : 'Follower aggiornati'
      });
    }

    const leClip = risposta && risposta.clip;
    if (leClip && leClip.messaggio && leClip.stato !== 'spento' && leClip.stato !== 'invariato') {
      const andataMale = leClip.stato === 'fallito' || leClip.stato === 'vuoto' || leClip.stato === 'senzaCanale';
      avviso(leClip.messaggio, {
        tipo: andataMale ? 'info' : 'ok',
        durata: andataMale ? 0 : 6000,
        titolo: andataMale ? 'Clip non aggiornate' : 'Clip aggiornate'
      });
    }

    const leEmote = risposta && risposta.emote;
    if (leEmote && leEmote.messaggio && ['fallito', 'senzaCanale'].includes(leEmote.stato)) {
      avviso(leEmote.messaggio, { tipo: 'info', durata: 0, titolo: 'Emote non aggiornate' });
    }

    const iGiochi = risposta && risposta.giochi;
    if (iGiochi && iGiochi.messaggio && ['fallito', 'senzaCanale'].includes(iGiochi.stato)) {
      avviso(iGiochi.messaggio, { tipo: 'info', durata: 0, titolo: 'Giochi non aggiornati' });
    }

    const iNumeri = risposta && risposta.numeri;
    if (iNumeri && iNumeri.messaggio && ['aggiornato', 'fallito', 'senzaCanale'].includes(iNumeri.stato)) {
      const andataMale = iNumeri.stato !== 'aggiornato';
      avviso(iNumeri.messaggio, {
        tipo: andataMale ? 'info' : 'ok',
        durata: andataMale ? 0 : 6000,
        titolo: andataMale ? 'Follower e abbonati non aggiornati' : 'Follower e abbonati aggiornati'
      });
    }

    const gliIscritti = risposta && risposta.youtube;
    if (gliIscritti && gliIscritti.messaggio && ['aggiornato', 'fallito', 'spento'].includes(gliIscritti.stato)) {
      const andataMale = gliIscritti.stato !== 'aggiornato';
      avviso(gliIscritti.messaggio, {
        tipo: andataMale ? 'info' : 'ok',
        durata: andataMale ? 0 : 6000,
        titolo: andataMale ? 'Iscritti YouTube non aggiornati' : 'Iscritti YouTube aggiornati'
      });
    }

    stato.stato = {
      ...(stato.stato || {}),
      pubblicatoIl: new Date().toISOString(),
      daPubblicare: false,
      manutenzione: inManutenzione
    };
    aggiornaPubblicazione();
    azzeraErrori();
    bloccaComandi(false);
    return true;

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
    return false;
  }
}

dom.btnSalva.addEventListener('click', () => salva());
dom.btnPubblica.addEventListener('click', () => pubblica());

document.addEventListener('keydown', (evento) => {
  const comando = evento.ctrlKey || evento.metaKey;
  if (!comando || evento.altKey || String(evento.key || '').toLowerCase() !== 's') return;
  if (dom.corpo.dataset.vista !== 'app') return;
  evento.preventDefault();
  if (stato.inCorso) return;
  if (sporco()) salva();
  else avviso('Non c\'è niente da salvare: è già tutto a posto.', { tipo: 'info', durata: 2500 });
});

window.addEventListener('beforeunload', (evento) => {
  if (!sporco()) return;
  evento.preventDefault();
  evento.returnValue = '';
});

function caricaGuscio() {
  if (guscio) return Promise.resolve(guscio);
  if (caricamentoGuscio) return caricamentoGuscio;

  caricamentoGuscio = import('./editor/guscio.js')
    .then((modulo) => {
      guscio = modulo.creaGuscio({
        stato,
        ctx,
        sporco,
        passoAdesso,
        testoPubblicazione,
        controlloPer,
        applicaErrori,
        usoDi,
        salva: () => salva(),
        pubblica: () => pubblica(),
        esci: () => esci(),
        ricaricaContenuti: (motivo) => caricaContenuti({ silenzioso: true, motivo }),
        nomiTecnici: () => ctx.opzioni.mostraChiave,
        impostaNomiTecnici: applicaNomiTecnici,
        dopoSostituzione: () => { azzeraErrori(); aggiornaStato(); }
      });
      return guscio;
    })
    .catch((errore) => {
      caricamentoGuscio = null;
      console.error('[pannello] editor/guscio.js non caricato:', errore);
      while (dom.pannello.firstChild) dom.pannello.removeChild(dom.pannello.firstChild);
      dom.pannello.append(el('div', { classe: 'vuoto lato__guasto' }, [
        el('p', { testo: 'L\'editor non si è caricato (pannello/editor/guscio.js).' }),
        el('p', { testo: 'Salva, Pubblica ed Esci funzionano lo stesso. Ricarica la pagina; se il problema resta, guarda la console del browser.' })
      ]));
      avviso('L\'editor non si è caricato: le modifiche in memoria restano, Salva e Pubblica funzionano.',
        { tipo: 'errore', titolo: 'Editor non disponibile', durata: 0 });
      return null;
    });
  return caricamentoGuscio;
}

async function caricaContenuti({ silenzioso = false, motivo = 'ricarica' } = {}) {
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
    stato.stato = risposta.stato || null;
    stato.tema = (risposta.tema && typeof risposta.tema === 'object') ? risposta.tema : null;
    stato.editor = (risposta.editor && typeof risposta.editor === 'object') ? risposta.editor : null;
    ctx.tema = stato.tema;
    stato.errori.clear();
    ponte.pronto = true;

    aggiornaPubblicazione();
    aggiornaStato();
    if (inCorso) inCorso.chiudi();

    const pronto = await caricaGuscio();
    if (pronto) await pronto.avvia({ motivo });
    aggiornaStato();
    return true;

  } catch (errore) {
    if (inCorso) inCorso.chiudi();
    if (errore instanceof ErroreApi && errore.scaduta) return false;
    if (!stato.schema) {
      mostraAvvio(errore instanceof ErroreApi ? errore.message : 'Non riesco a caricare i contenuti.', true);
    } else {
      avviso(errore instanceof ErroreApi ? errore.message : 'Non riesco a caricare i contenuti.',
        { tipo: 'errore', titolo: 'Contenuti non caricati' });
    }
    return false;
  }
}

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
  if (guscio) guscio.sospendi();
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

    if (stato.dati) {
      aggiornaStato();
      avviso('Rientrato. Le modifiche che avevi in corso sono ancora qui.', { tipo: 'ok' });
      if (guscio) guscio.riprendi();
    } else {
      await caricaContenuti({ silenzioso: true, motivo: 'accesso' });
    }

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

async function esci() {
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
    inCorso.fallito(errore instanceof ErroreApi ? errore.message : 'Il server non ha risposto.', 'Uscita');
  }
  if (guscio) guscio.sospendi({ uscita: true });
  ponte.pronto = false;
  stato.dati = null;
  stato.salvato = null;
  stato.schema = null;
  stato.tema = null;
  stato.editor = null;
  stato.stato = null;
  ctx.tema = null;
  controlli.clear();
  stato.errori.clear();
  vaiAllAccesso();
}

quandoScadeLaSessione(() => {
  if (dom.corpo.dataset.vista !== 'app') return;
  vaiAllAccesso({ ripresa: true });
});

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
    await caricaContenuti({ silenzioso: true, motivo: 'accesso' });

  } catch (errore) {
    mostraAvvio(
      errore instanceof ErroreApi ? errore.message : 'Non riesco a contattare il server.',
      true
    );
  }
}

avvia();
