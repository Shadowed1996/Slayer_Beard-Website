import { el, bottone, svuota, idUnico, urlRisorsa } from './dom.js';
import { creaCampoElenco, creaCampoElencoTesti } from './elenchi.js';
import { creaCampoRicco, soloTesto } from './ricco.js';
import {
  contrasto, etichettaContrasto, precaricaFont,
  fontCaricati, suFontCaricati, famigliaCaricato
} from './tema.js';

let moduloSettimana = null;
const attesaSettimana = import('./settimana.js').then(
  (modulo) => { moduloSettimana = modulo; return modulo; },
  (errore) => {
    console.error('[campi] moduli/settimana.js non caricato:', errore);
    return null;
  }
);

const PREFISSO_CONFIG = 'config.';

export function clona(valore) {
  if (typeof structuredClone === 'function') return structuredClone(valore);
  return JSON.parse(JSON.stringify(valore));
}

export function uguali(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function leggiPercorso(oggetto, percorso) {
  let nodo = oggetto;
  for (const passo of String(percorso).split('.')) {
    if (nodo === null || nodo === undefined) return undefined;
    nodo = nodo[passo];
  }
  return nodo;
}

function scriviPercorso(oggetto, percorso, valore) {
  const passi = String(percorso).split('.');
  const ultimo = passi.pop();
  let nodo = oggetto;
  for (const passo of passi) {
    if (typeof nodo[passo] !== 'object' || nodo[passo] === null) nodo[passo] = {};
    nodo = nodo[passo];
  }
  nodo[ultimo] = valore;
}

export function leggiChiave(dati, chiave) {
  if (chiave === 'config') return dati.config;
  if (chiave.startsWith(PREFISSO_CONFIG)) return leggiPercorso(dati.config, chiave.slice(PREFISSO_CONFIG.length));
  return dati.testi ? dati.testi[chiave] : undefined;
}

export function scriviChiave(dati, chiave, valore) {
  if (chiave.startsWith(PREFISSO_CONFIG)) scriviPercorso(dati.config, chiave.slice(PREFISSO_CONFIG.length), valore);
  else dati.testi[chiave] = valore;
}

export function chiaveRelativa(chiaveElenco, chiaveCampo) {
  const prefisso = chiaveElenco + '.';
  return chiaveCampo.startsWith(prefisso) ? chiaveCampo.slice(prefisso.length) : chiaveCampo;
}

export function valoreVuoto(campo) {
  switch (campo.tipo) {
    case 'numero': return typeof campo.min === 'number' ? campo.min : 0;
    case 'orario': return '21:00';
    case 'orari': return typeof window !== 'undefined' && window.SBOrari
      ? window.SBOrari.normalizza({})
      : { giorni: [], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4 };
    case 'scelta':
    case 'font': return Array.isArray(campo.opzioni) && campo.opzioni.length ? valoreOpzione(campo.opzioni[0]) : '';
    case 'elenco':
    case 'elencoTesti': return [];
    case 'colore': return normalizzaColore(campo.predefinito) || '#000000';
    case 'interruttore': return campo.predefinito === true;
    case 'ricco': return '';
    default: return '';
  }
}

export function valoreOpzione(opzione) {
  if (opzione && typeof opzione === 'object') {
    return String(opzione.valore ?? opzione.value ?? opzione.chiave ?? '');
  }
  return String(opzione);
}

export function etichettaOpzione(opzione) {
  if (opzione && typeof opzione === 'object') {
    return String(opzione.etichetta ?? opzione.label ?? opzione.nome ?? valoreOpzione(opzione));
  }
  return String(opzione);
}

const LIMITE_TESTO = 4000;

const RE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function problemaUrl(testo) {
  if (testo.startsWith('//')) {
    return 'Un indirizzo che inizia con // eredita il protocollo della pagina: scrivi https:// per intero.';
  }
  const schema = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(testo);
  if (!schema) {
    if (testo.indexOf('\\') !== -1) return 'Nei percorsi si usa la barra normale /, non la barra rovesciata.';
    return null;
  }
  const protocollo = schema[1].toLowerCase();
  if (protocollo === 'http' || protocollo === 'https') {
    if (!/^https?:\/\/[^/\s]+/.test(testo)) return 'Indirizzo incompleto: dopo https:// ci vuole almeno il nome del sito.';
    return null;
  }
  if (protocollo === 'mailto') {
    return RE_EMAIL.test(testo.slice('mailto:'.length)) ? null : 'Dopo mailto: ci vuole un indirizzo email valido.';
  }
  return 'Protocollo non ammesso: sono accettati solo http, https, mailto e i percorsi relativi.';
}

export function erroreLocale(campo, valore) {
  const testo = typeof valore === 'string' ? valore.trim() : valore;
  const facoltativo = campo.facoltativo === true;

  switch (campo.tipo) {
    case 'url':
      if (testo === '') return null;
      return problemaUrl(testo);

    case 'email':
      if (testo === '') return null;
      if (!RE_EMAIL.test(testo)) return 'Questo non sembra un indirizzo email valido.';
      return null;

    case 'orario':
      if (testo === '') return facoltativo ? null : 'Serve un orario, scritto come 21:00.';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(testo)) return 'L\'orario va scritto come 21:00.';
      return null;

    case 'dataora': {
      if (testo === '' || testo === null || testo === undefined) return facoltativo ? null : 'Serve un giorno e un\'ora.';
      const pezzi = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d$/.exec(String(testo));
      const giorno = pezzi ? new Date(Date.UTC(Number(pezzi[1]), Number(pezzi[2]) - 1, Number(pezzi[3]))) : null;
      if (!giorno || giorno.getUTCMonth() !== Number(pezzi[2]) - 1 || giorno.getUTCDate() !== Number(pezzi[3])) {
        return 'Scegli giorno e ora dal calendario, per esempio 24/09/2026 13:30.';
      }
      return null;
    }

    case 'numero': {
      if (testo === '' || testo === null || testo === undefined) return 'Serve un numero.';
      const n = Number(testo);
      if (!Number.isFinite(n)) return 'Serve un numero, senza lettere.';
      if (typeof campo.min === 'number' && n < campo.min) return 'Il minimo e\' ' + campo.min + '.';
      if (typeof campo.max === 'number' && n > campo.max) return 'Il massimo e\' ' + campo.max + '.';
      return null;
    }

    case 'testo':
    case 'testolungo': {
      const limite = Number(campo.max) > 0 ? Number(campo.max) : LIMITE_TESTO;
      if (typeof valore === 'string' && valore.length > limite) {
        return 'Sono ' + valore.length + ' caratteri: il massimo è ' + limite + '.';
      }
      return null;
    }

    case 'ricco': {
      const limite = Number(campo.max) > 0 ? Number(campo.max) : LIMITE_TESTO;
      const visibile = soloTesto(typeof valore === 'string' ? valore : '');
      if (visibile.length > limite) {
        return 'Sono ' + visibile.length + ' caratteri visibili (i tag non contano): il massimo è ' + limite + '.';
      }
      return null;
    }

    case 'colore': {
      if (testo === '' || testo === null || testo === undefined) {
        return facoltativo ? null : 'Serve un colore, scritto come #8b2fff.';
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(String(testo))) {
        return 'Il colore va scritto con il cancelletto e sei cifre, per esempio #8b2fff.';
      }
      return null;
    }

    case 'font': {
      if (testo === '') return facoltativo ? null : 'Scegli una famiglia dal menu.';
      if (/[<>"'{};\\]/.test(String(testo))) {
        return 'Il nome di un carattere può contenere solo lettere, numeri e spazi.';
      }
      const caricato = /^caricato:(.*)$/.exec(String(testo));
      if (caricato) {
        if (!/^[0-9a-f]{16}$/.test(caricato[1])) return 'Il font caricato è indicato male: sceglilo di nuovo dal menu.';
        return null;
      }
      const catalogo = Array.isArray(campo.opzioni) ? campo.opzioni.map(valoreOpzione) : null;
      if (!catalogo || !catalogo.length) return null;
      if (!catalogo.includes(String(testo))) {
        return 'Questa famiglia non è nel catalogo: scegline una dal menu.';
      }
      return null;
    }

    case 'interruttore':
      if (typeof valore !== 'boolean') return 'Questo campo può valere solo acceso o spento.';
      return null;

    default:
      return null;
  }
}

export function guscio(campo, { mostraChiave = true, perInput = true } = {}) {
  const idCampo = idUnico('c');
  const idEtichetta = idCampo + '-et';

  const etichetta = perInput
    ? el('label', { classe: 'campo__etichetta', for: idCampo, id: idEtichetta, testo: campo.etichetta || campo.chiave })
    : el('span', { classe: 'campo__etichetta', id: idEtichetta, testo: campo.etichetta || campo.chiave });

  const errore = el('p', { classe: 'campo__errore', hidden: true, role: 'alert' });
  const pie = el('div', { classe: 'campo__pie' }, [errore]);

  const nodo = el('div', { classe: 'campo', dati: { chiave: campo.chiave } }, [
    el('div', { classe: 'campo__testa' }, [
      etichetta,
      mostraChiave ? el('span', { classe: 'campo__chiave', testo: campo.chiave, title: 'Nome tecnico del campo' }) : null
    ]),
    campo.aiuto ? el('p', { classe: 'campo__aiuto', testo: campo.aiuto }) : null
  ]);

  return { nodo, etichetta, idEtichetta, idCampo, pie, errore, principale: null };
}

export function attaccaErrore(parti, controllo) {
  controllo.mostraErrore = (testo) => {
    parti.errore.textContent = testo || '';
    parti.errore.hidden = !testo;
    parti.nodo.classList.toggle('is-errato', Boolean(testo));
    if (parti.principale) parti.principale.setAttribute('aria-invalid', testo ? 'true' : 'false');
  };
  controllo.pulisci = () => controllo.mostraErrore('');
  controllo.mostraErrore('');
}

function campoTesto(campo, accesso, ctx) {
  const parti = guscio(campo, ctx.opzioni);
  const multiriga = campo.tipo === 'testolungo';
  const limite = campo.tipo !== 'numero' && Number(campo.max) > 0 ? Number(campo.max) : null;

  const tipoHtml = { url: 'url', email: 'email', numero: 'number', orario: 'time', dataora: 'datetime-local' }[campo.tipo] || 'text';

  const input = multiriga
    ? el('textarea', {
        id: parti.idCampo, classe: 'campo__area',
        rows: campo.righe || 4,
        maxlength: limite
      })
    : el('input', {
        id: parti.idCampo,
        classe: 'campo__input' + (campo.tipo === 'orario' || campo.tipo === 'numero' ? ' campo__input--breve' : ''),
        type: tipoHtml,
        maxlength: limite && (campo.tipo === 'testo' || campo.tipo === 'url' || campo.tipo === 'email') ? limite : null,
        min: typeof campo.min === 'number' ? campo.min : null,
        max: typeof campo.max === 'number' && campo.tipo === 'numero' ? campo.max : null,
        step: campo.passo || null,
        inputmode: campo.tipo === 'numero' ? 'numeric' : null,
        spellcheck: (campo.tipo === 'url' || campo.tipo === 'email') ? 'false' : null,
        autocomplete: 'off',
        placeholder: campo.esempio || null
      });

  parti.principale = input;
  const iniziale = accesso.leggi();
  input.value = iniziale === undefined || iniziale === null ? '' : String(iniziale);

  let contatore = null;
  if (limite) {
    contatore = el('span', { classe: 'campo__contatore' });
    parti.pie.append(contatore);
  }
  const aggiornaContatore = () => {
    if (!contatore) return;
    const lunghezza = input.value.length;
    contatore.textContent = lunghezza + ' / ' + limite;
    contatore.dataset.livello = lunghezza > limite ? 'oltre' : (lunghezza > limite * 0.9 ? 'vicino' : 'normale');
  };

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);

  const scrivi = () => {
    const grezzo = input.value;
    if (campo.tipo === 'numero') {
      const n = Number(grezzo);
      accesso.scrivi(grezzo !== '' && Number.isFinite(n) ? n : grezzo);
    } else {
      accesso.scrivi(grezzo);
    }
  };

  input.addEventListener('input', () => {
    scrivi();
    aggiornaContatore();
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, input.value) || '');
    ctx.modificato();
  });
  input.addEventListener('blur', () => controllo.mostraErrore(erroreLocale(campo, input.value) || ''));

  controllo.valida = () => {
    const messaggio = erroreLocale(campo, input.value);
    controllo.mostraErrore(messaggio || '');
    return !messaggio;
  };
  controllo.fuoco = () => input.focus();

  aggiornaContatore();
  parti.nodo.append(input, parti.pie);
  return controllo;
}

function campoScelta(campo, accesso, ctx) {
  const parti = guscio(campo, ctx.opzioni);
  const opzioni = Array.isArray(campo.opzioni) ? campo.opzioni : [];
  const attuale = accesso.leggi();
  const valoreAttuale = attuale === undefined || attuale === null ? '' : String(attuale);

  const select = el('select', { id: parti.idCampo, classe: 'campo__scelta' });
  parti.principale = select;

  if (!opzioni.some((o) => valoreOpzione(o) === valoreAttuale)) {
    select.append(el('option', {
      value: valoreAttuale,
      testo: valoreAttuale ? valoreAttuale + ' (valore attuale, non in elenco)' : '— non impostato —'
    }));
  }
  for (const opzione of opzioni) {
    select.append(el('option', { value: valoreOpzione(opzione), testo: etichettaOpzione(opzione) }));
  }
  select.value = valoreAttuale;

  select.addEventListener('change', () => {
    accesso.scrivi(select.value);
    ctx.modificato();
    if (controllo.mostraErrore) controllo.mostraErrore('');
  });

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => true;
  controllo.fuoco = () => select.focus();

  parti.nodo.append(select, parti.pie);
  return controllo;
}

function campoImmagine(campo, accesso, ctx) {
  const parti = guscio(campo, ctx.opzioni);

  const figura = el('div', { classe: 'immagine__anteprima' });
  const percorso = el('input', {
    id: parti.idCampo, classe: 'campo__input', type: 'text',
    spellcheck: 'false', autocomplete: 'off', placeholder: 'img/nomefile.png'
  });
  parti.principale = percorso;

  const disegnaAnteprima = () => {
    svuota(figura);
    const src = urlRisorsa(percorso.value);
    if (!src) {
      figura.append(el('p', { classe: 'immagine__vuota', testo: 'Nessuna immagine' }));
      return;
    }
    const img = el('img', { src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => {
      svuota(figura);
      figura.append(el('p', { classe: 'immagine__vuota', testo: 'File non trovato' }));
    });
    figura.append(img);
  };

  const applica = (valore) => {
    percorso.value = valore;
    accesso.scrivi(valore);
    disegnaAnteprima();
    ctx.modificato();
  };

  const iniziale = accesso.leggi();
  percorso.value = iniziale === undefined || iniziale === null ? '' : String(iniziale);
  percorso.addEventListener('input', () => {
    accesso.scrivi(percorso.value);
    disegnaAnteprima();
    ctx.modificato();
  });

  const azioni = el('div', { classe: 'immagine__azioni' }, [
    bottone({
      testo: 'Scegli o carica', ico: 'immagine', classe: 'btn',
      su: async () => {
        const scelto = await ctx.scegliImmagine(percorso.value);
        if (scelto) applica(scelto);
      }
    }),
    bottone({ testo: 'Togli', ico: 'chiudi', classe: 'btn btn--minimo', su: () => applica('') })
  ]);

  disegnaAnteprima();
  parti.nodo.append(
    el('div', { classe: 'immagine' }, [figura, el('div', { classe: 'immagine__lato' }, [percorso, azioni])]),
    parti.pie
  );

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => true;
  controllo.fuoco = () => percorso.focus();
  return controllo;
}

const RICHIESTE_IN_ATTESA = ['mostraErrore', 'pulisci', 'apriVista', 'apriGiorno', 'apriEvento'];

function campoOrari(campo, accesso, ctx) {
  if (moduloSettimana) return moduloSettimana.creaCampoOrari(campo, accesso, ctx);

  const parti = guscio(campo, { ...ctx.opzioni, perInput: false });
  const stato = el('p', { classe: 'campo__aiuto', role: 'status', testo: 'Carico l\'editor della schedule…' });
  parti.nodo.append(stato);
  const nodo = el('div', { classe: 'editor-attesa' }, [parti.nodo]);

  let vero = null;
  const richieste = [];
  const controllo = {
    chiave: campo.chiave, campo, nodo,
    valida: () => (vero ? vero.valida() : true),
    fuoco: () => { if (vero) vero.fuoco(); }
  };
  for (const nome of RICHIESTE_IN_ATTESA) {
    controllo[nome] = (...argomenti) => {
      if (vero) return typeof vero[nome] === 'function' ? vero[nome](...argomenti) : undefined;
      richieste.push([nome, argomenti]);
      return undefined;
    };
  }

  attesaSettimana.then((modulo) => {
    if (!modulo || typeof modulo.creaCampoOrari !== 'function') {
      stato.removeAttribute('role');
      stato.className = 'vuoto';
      stato.textContent = 'L\'editor della schedule (pannello/moduli/settimana.js) non si è caricato. Ricarica la pagina; il resto del pannello funziona.';
      return;
    }
    vero = modulo.creaCampoOrari(campo, accesso, ctx);
    nodo.replaceChildren(vero.nodo);
    for (const [nome, argomenti] of richieste.splice(0)) {
      if (typeof vero[nome] === 'function') vero[nome](...argomenti);
    }
  });
  return controllo;
}

const COLORI_DI_PARTENZA = { fondo: '#07070c', testo: '#f2f0f8' };

function normalizzaColore(valore) {
  const corpo = String(valore === null || valore === undefined ? '' : valore).trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(corpo)) return '#' + corpo.split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/.test(corpo)) return '#' + corpo;
  return '';
}

const coloriAVideo = new Set();

function coloriVivi() {
  for (const voce of Array.from(coloriAVideo)) {
    if (voce.nodo.isConnected) voce.attaccato = true;
    else if (voce.attaccato) coloriAVideo.delete(voce);
  }
  return Array.from(coloriAVideo);
}

function riferimentoColore(campo) {
  const ultimo = String(campo.chiave || '').split('.').pop();
  const eFondo = /fondo/i.test(ultimo);
  const cercato = campo.contrastoCon ? String(campo.contrastoCon) : (eFondo ? 'testo' : 'fondo');

  const scritto = normalizzaColore(cercato);
  if (scritto) return { colore: scritto, nome: 'il colore indicato dallo schema' };

  const vivi = coloriVivi().filter((v) => v.chiave !== campo.chiave);
  const coda = (chiave) => String(chiave).split('.').pop().toLowerCase();
  const voce = vivi.find((v) => v.chiave === cercato)
    || vivi.find((v) => coda(v.chiave) === cercato.toLowerCase())
    || vivi.find((v) => coda(v.chiave).includes(cercato.toLowerCase()));

  if (voce) {
    const colore = normalizzaColore(voce.leggi());
    if (colore) return { colore, nome: '«' + voce.etichetta + '»' };
  }

  const ripiego = eFondo ? COLORI_DI_PARTENZA.testo : COLORI_DI_PARTENZA.fondo;
  return { colore: ripiego, nome: (eFondo ? 'il testo' : 'il fondo') + ' di partenza' };
}

function campoColore(campo, accesso, ctx) {
  const parti = guscio(campo, ctx.opzioni);
  const etichettaCampo = campo.etichetta || campo.chiave;

  const grezzoIniziale = accesso.leggi();
  const iniziale = normalizzaColore(grezzoIniziale);
  const selettore = el('input', {
    id: parti.idCampo, classe: 'colore__pozzo', type: 'color',
    value: iniziale || '#000000'
  });
  const esa = el('input', {
    classe: 'campo__input colore__esa', type: 'text',
    maxlength: 7, spellcheck: 'false', autocomplete: 'off', placeholder: '#8b2fff',
    'aria-label': etichettaCampo + ', codice esadecimale',
    value: grezzoIniziale === undefined || grezzoIniziale === null ? '' : String(grezzoIniziale)
  });
  parti.principale = esa;

  const livello = el('span', { classe: 'colore__livello' });
  const verdetto = el('span', { classe: 'colore__verdetto' });
  const esempio = el('p', { classe: 'colore__esempio', 'aria-hidden': 'true', testo: 'Aa — testo di prova, 21:00' });
  const riga = el('div', { classe: 'colore__contrasto' }, [livello, verdetto]);

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);

  const ricalcola = () => {
    const mio = normalizzaColore(esa.value);
    if (!mio) {
      riga.dataset.grave = '1';
      livello.textContent = '—';
      verdetto.textContent = 'Contrasto non calcolabile finché il colore non è scritto per bene.';
      return;
    }
    const rif = riferimentoColore(campo);
    const et = etichettaContrasto(contrasto(mio, rif.colore));
    riga.dataset.grave = et.grave ? '1' : '0';
    livello.textContent = et.livello;
    verdetto.textContent = et.testo + ' Misurato contro ' + rif.nome + '.';

    const eFondo = /fondo/i.test(String(campo.chiave || '').split('.').pop());
    esempio.style.background = eFondo ? mio : rif.colore;
    esempio.style.color = eFondo ? rif.colore : mio;
  };

  coloriAVideo.add({
    chiave: campo.chiave,
    etichetta: etichettaCampo,
    nodo: parti.nodo,
    attaccato: false,
    leggi: () => esa.value,
    ricalcola
  });

  const ricalcolaTutti = () => {
    for (const voce of coloriVivi()) voce.ricalcola();
  };

  const applica = (grezzo) => {
    const pulito = normalizzaColore(grezzo);
    accesso.scrivi(pulito || grezzo);
    if (pulito) selettore.value = pulito;
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, pulito || grezzo) || '');
    ricalcolaTutti();
    ctx.modificato();
  };

  selettore.addEventListener('input', () => {
    esa.value = selettore.value;
    applica(selettore.value);
  });
  esa.addEventListener('input', () => applica(esa.value));
  esa.addEventListener('blur', () => {
    const pulito = normalizzaColore(esa.value);
    if (pulito) { esa.value = pulito; applica(pulito); }
    controllo.mostraErrore(erroreLocale(campo, esa.value) || '');
  });

  controllo.valida = () => {
    const messaggio = erroreLocale(campo, esa.value.trim());
    controllo.mostraErrore(messaggio || '');
    return !messaggio;
  };
  controllo.fuoco = () => selettore.focus();

  ricalcola();
  parti.nodo.append(
    el('div', { classe: 'colore' }, [
      el('div', { classe: 'colore__comandi' }, [selettore, esa]),
      esempio,
      riga
    ]),
    parti.pie
  );
  return controllo;
}

const ANTEPRIMA_FONT = 'Il pollo canta alle 21:00 — ABCabc 0123';

function voceFont(grezza) {
  if (grezza && typeof grezza === 'object') {
    return {
      nome: String(grezza.nome ?? grezza.valore ?? grezza.value ?? '').trim(),
      ripiego: String(grezza.ripiego || ''),
      categoria: String(grezza.categoria || ''),
      pesi: Array.isArray(grezza.pesi) ? grezza.pesi : []
    };
  }
  return { nome: String(grezza || '').trim(), ripiego: '', categoria: '', pesi: [] };
}

function catalogoFont(campo, ctx) {
  const daSchema = Array.isArray(campo.opzioni) ? campo.opzioni
    : (Array.isArray(campo.catalogo) ? campo.catalogo : null);
  if (daSchema && daSchema.length) return daSchema.map(voceFont).filter((v) => v.nome);

  const slot = String(campo.slot || String(campo.chiave || '').split('.').pop());
  const daApi = ctx && ctx.tema && ctx.tema.font && Array.isArray(ctx.tema.font[slot]) ? ctx.tema.font[slot] : null;
  return daApi ? daApi.map(voceFont).filter((v) => v.nome) : [];
}

function pilaFont(voce) {
  const ripiego = voce.ripiego || 'system-ui, sans-serif';
  return '"' + voce.nome.replace(/"/g, '') + '", ' + ripiego;
}

const RE_VALORE_CARICATO = /^caricato:([0-9a-f]{16})$/;

function caricatiPerCampo(ctx) {
  const registro = fontCaricati();
  if (registro) return registro;
  return ctx && Array.isArray(ctx.fontCaricati) ? ctx.fontCaricati : null;
}

const RIPIEGO_CARICATO = 'system-ui, sans-serif';

function campoFont(campo, accesso, ctx) {
  const catalogo = catalogoFont(campo, ctx);
  if (!catalogo.length) return campoTesto({ ...campo, tipo: 'testo' }, accesso, ctx);

  const parti = guscio(campo, ctx.opzioni);

  const select = el('select', { id: parti.idCampo, classe: 'campo__scelta font__scelta' });
  parti.principale = select;

  const riempi = () => {
    const attuale = accesso.leggi();
    const valoreAttuale = attuale === undefined || attuale === null ? '' : String(attuale);
    const caricati = caricatiPerCampo(ctx);
    const idCaricato = (RE_VALORE_CARICATO.exec(valoreAttuale) || [])[1] || '';

    svuota(select);
    const conosciuto = catalogo.some((v) => v.nome === valoreAttuale) ||
      Boolean(idCaricato && caricati && caricati.some((v) => v.id === idCaricato));
    if (!conosciuto) {
      let testo = valoreAttuale ? valoreAttuale + ' (non è nel catalogo)' : '— non impostato —';
      if (idCaricato) testo = caricati ? 'Font caricato che non c\'è più' : 'Font caricato (sto leggendo l\'elenco…)';
      select.append(el('option', { value: valoreAttuale, testo }));
    }

    const suoi = caricati && caricati.length ? caricati : null;
    const gruppoCatalogo = suoi ? el('optgroup', { label: 'Catalogo' }) : select;
    for (const voce of catalogo) {
      const opzione = el('option', {
        value: voce.nome,
        testo: voce.nome + (voce.categoria ? ' · ' + voce.categoria : '')
      });
      opzione.style.fontFamily = pilaFont(voce);
      gruppoCatalogo.append(opzione);
    }
    if (suoi) {
      select.append(gruppoCatalogo);
      const gruppoSuoi = el('optgroup', { label: 'Caricati da te' });
      for (const voce of suoi) {
        const opzione = el('option', { value: 'caricato:' + voce.id, testo: voce.etichetta });
        opzione.style.fontFamily = famigliaCaricato(voce.id) + ', ' + RIPIEGO_CARICATO;
        gruppoSuoi.append(opzione);
      }
      select.append(gruppoSuoi);
    }
    select.value = valoreAttuale;
  };

  const anteprima = el('p', { classe: 'font__anteprima', testo: campo.esempio || ANTEPRIMA_FONT });
  const ripiego = el('p', { classe: 'font__ripiego' });

  const aggiorna = () => {
    const idCaricato = (RE_VALORE_CARICATO.exec(select.value) || [])[1] || '';
    if (idCaricato) {
      const voce = (caricatiPerCampo(ctx) || []).find((v) => v.id === idCaricato);
      anteprima.style.fontFamily = famigliaCaricato(idCaricato) + ', ' + RIPIEGO_CARICATO;
      ripiego.textContent = voce
        ? 'Font caricato da te («' + voce.etichetta + '»). Se il file non arriva, il sito usa il font di sistema.'
        : (caricatiPerCampo(ctx)
          ? 'Questo font caricato non c\'è più: scegline un altro. Se salvi così, il server rimette il font di partenza.'
          : 'Sto leggendo l\'elenco dei font caricati…');
      return;
    }
    const voce = catalogo.find((v) => v.nome === select.value) || voceFont(select.value);
    anteprima.style.fontFamily = pilaFont(voce);
    ripiego.textContent = voce.ripiego
      ? 'Se il font non arriva, il sito usa: ' + voce.ripiego
      : 'Nessun ripiego dichiarato: il sito userebbe il font di sistema.';
  };

  select.addEventListener('change', () => {
    accesso.scrivi(select.value);
    aggiorna();
    controllo.mostraErrore(erroreLocale(campo, select.value) || '');
    ctx.modificato();
  });

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => {
    const messaggio = erroreLocale(campo, select.value);
    controllo.mostraErrore(messaggio || '');
    return !messaggio;
  };
  controllo.fuoco = () => select.focus();

  riempi();
  aggiorna();
  precaricaFont(catalogo).then(aggiorna);

  let appeso = false;
  const togli = suFontCaricati(() => {
    if (parti.nodo.isConnected) appeso = true;
    else if (appeso) { togli(); return; }
    const avevaFuoco = document.activeElement === select;
    riempi();
    aggiorna();
    if (!parti.errore.hidden) controllo.mostraErrore(erroreLocale(campo, select.value) || '');
    if (avevaFuoco) select.focus();
  });

  parti.nodo.append(el('div', { classe: 'font' }, [select, anteprima, ripiego]), parti.pie);
  return controllo;
}

function campoInterruttore(campo, accesso, ctx) {
  const parti = guscio(campo, { ...(ctx.opzioni || {}), perInput: false });

  const acceso = () => accesso.leggi() === true;
  const stato = el('span', { classe: 'interruttore__stato', 'aria-hidden': 'true' });

  const leva = el('button', {
    type: 'button', id: parti.idCampo, classe: 'interruttore',
    role: 'switch',
    'aria-checked': String(acceso()),
    'aria-labelledby': parti.idEtichetta
  }, [
    el('span', { classe: 'interruttore__pista', 'aria-hidden': 'true' }, [
      el('span', { classe: 'interruttore__pallina' })
    ])
  ]);
  parti.principale = leva;

  const disegna = () => {
    const ora = acceso();
    leva.setAttribute('aria-checked', String(ora));
    stato.textContent = ora ? (campo.testoAcceso || 'Attivo') : (campo.testoSpento || 'Spento');
    parti.nodo.dataset.acceso = ora ? '1' : '0';
  };

  leva.addEventListener('click', () => {
    accesso.scrivi(!acceso());
    disegna();
    controllo.mostraErrore('');
    ctx.modificato();
  });

  parti.etichetta.addEventListener('click', () => leva.focus());

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => {
    const messaggio = erroreLocale(campo, accesso.leggi());
    controllo.mostraErrore(messaggio || '');
    return !messaggio;
  };
  controllo.fuoco = () => leva.focus();

  disegna();
  parti.nodo.append(el('div', { classe: 'interruttore__riga' }, [leva, stato]), parti.pie);
  return controllo;
}

export function creaCampo(campo, accesso, ctx) {
  const controllo = costruisci(campo, accesso, ctx);
  if (ctx.registra) ctx.registra(controllo);
  return controllo;
}

function costruisci(campo, accesso, ctx) {
  switch (campo.tipo) {
    case 'immagine':    return campoImmagine(campo, accesso, ctx);
    case 'orari':       return campoOrari(campo, accesso, ctx);
    case 'scelta':      return campoScelta(campo, accesso, ctx);
    case 'ricco':       return creaCampoRicco(campo, accesso, ctx);
    case 'colore':      return campoColore(campo, accesso, ctx);
    case 'font':        return campoFont(campo, accesso, ctx);
    case 'interruttore': return campoInterruttore(campo, accesso, ctx);
    case 'elenco':      return creaCampoElenco(campo, accesso, ctx);
    case 'elencoTesti': return creaCampoElencoTesti(campo, accesso, ctx);
    case 'testo':
    case 'testolungo':
    case 'url':
    case 'email':
    case 'numero':
    case 'orario':
    case 'dataora':     return campoTesto(campo, accesso, ctx);
    default:
      return campoTesto({ ...campo, tipo: 'testo' }, accesso, ctx);
  }
}

