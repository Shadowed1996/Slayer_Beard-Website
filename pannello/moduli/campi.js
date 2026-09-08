/* =====================================================================
   campi.js — disegna un campo a partire dalla sua descrizione.

   Qui dentro non compare nemmeno una chiave del sito: il pannello non sa
   che esiste «deck.titolo», sa solo che il server gli ha mandato un campo
   di tipo «testo» con quell'etichetta. Se domani il sito guadagna una
   sezione, cresce lo schema e il pannello la disegna senza modifiche.

   Tipi ammessi (contratto §7 e CONTRATTO-2 §5):
     testo · testolungo · url · email · numero · immagine · orario
     orari · scelta · elencoTesti · elenco
     ricco · colore · font · interruttore

   Ogni campo restituisce un oggetto di controllo:
     { chiave, campo, nodo, valida(), mostraErrore(t), pulisci(), fuoco() }
   ===================================================================== */

import { el, bottone, svuota, idUnico, urlRisorsa } from './dom.js';
import { creaCampoElenco, creaCampoElencoTesti } from './elenchi.js';
import { creaCampoRicco, soloTesto } from './ricco.js';
import { contrasto, etichettaContrasto, precaricaFont } from './tema.js';

/* Domenica e' 0 nei dati (come in JavaScript), ma la settimana comincia di
   lunedi' perche' e' cosi' che la legge chiunque in Italia. */
export const GIORNI = [
  { n: 1, breve: 'Lun', lungo: 'lunedi\'' },
  { n: 2, breve: 'Mar', lungo: 'martedi\'' },
  { n: 3, breve: 'Mer', lungo: 'mercoledi\'' },
  { n: 4, breve: 'Gio', lungo: 'giovedi\'' },
  { n: 5, breve: 'Ven', lungo: 'venerdi\'' },
  { n: 6, breve: 'Sab', lungo: 'sabato' },
  { n: 0, breve: 'Dom', lungo: 'domenica' }
];

const FUSI_COMUNI = ['Europe/Rome', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles'];

/* ---------------------------------------------------------------------
   Lettura e scrittura dei dati per chiave.

   Il server manda due oggetti diversi e lo schema li indirizza con una
   sola convenzione:
     "deck.titolo"   -> testi["deck.titolo"]      mappa PIATTA
     "config.orari"  -> config.orari              albero ANNIDATO
   La differenza sta nella natura dei due, non in una scelta del pannello:
   `testi` nasce come mappa di chiavi con il punto dentro, `config` e' un
   albero. Il resto del pannello usa solo le funzioni qui sotto.
   --------------------------------------------------------------------- */

const PREFISSO_CONFIG = 'config.';

/** Copia profonda: la bozza salvata va confrontata con quella in corso. */
export function clona(valore) {
  if (typeof structuredClone === 'function') return structuredClone(valore);
  return JSON.parse(JSON.stringify(valore));
}

/** Confronto strutturale, sufficiente per dati JSON puri. */
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

/** Legge il valore di una chiave dello schema dentro i dati completi. */
export function leggiChiave(dati, chiave) {
  if (chiave === 'config') return dati.config;
  if (chiave.startsWith(PREFISSO_CONFIG)) return leggiPercorso(dati.config, chiave.slice(PREFISSO_CONFIG.length));
  return dati.testi ? dati.testi[chiave] : undefined;
}

/** Scrive il valore di una chiave dello schema dentro i dati completi. */
export function scriviChiave(dati, chiave, valore) {
  if (chiave.startsWith(PREFISSO_CONFIG)) scriviPercorso(dati.config, chiave.slice(PREFISSO_CONFIG.length), valore);
  else dati.testi[chiave] = valore;
}

/**
 * Nome della proprieta' dentro una voce di elenco.
 * Lo schema puo' scriverla relativa («nome») o completa
 * («config.social.nome»): entrambe finiscono sulla stessa proprieta', cosi'
 * il pannello non impone una forma allo schema.
 */
export function chiaveRelativa(chiaveElenco, chiaveCampo) {
  const prefisso = chiaveElenco + '.';
  return chiaveCampo.startsWith(prefisso) ? chiaveCampo.slice(prefisso.length) : chiaveCampo;
}

/** Valore iniziale sensato per un campo appena creato dentro un elenco. */
export function valoreVuoto(campo) {
  switch (campo.tipo) {
    case 'numero': return typeof campo.min === 'number' ? campo.min : 0;
    case 'orario': return '21:00';
    case 'orari': return { giorni: [], ora: '21:00', fuso: 'Europe/Rome', durataOre: 1 };
    case 'scelta':
    case 'font': return Array.isArray(campo.opzioni) && campo.opzioni.length ? valoreOpzione(campo.opzioni[0]) : '';
    case 'elenco':
    case 'elencoTesti': return [];
    // Nero: e' un colore valido, e il selettore nativo una stringa vuota
    // non la accetta (si rimetterebbe su #000000 da solo, di nascosto).
    case 'colore': return normalizzaColore(campo.predefinito) || '#000000';
    // Spento: una voce appena creata non accende funzioni da sola.
    case 'interruttore': return campo.predefinito === true;
    case 'ricco': return '';
    default: return '';
  }
}

/** Le opzioni possono essere stringhe o { valore, etichetta }. */
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

/* ---------------------------------------------------------------------
   Convalida immediata.

   Il server resta l'unico giudice: queste regole servono solo a non far
   arrivare fino al salvataggio un errore che si vede a occhio.

   LA REGOLA, che vale per ogni riga qui sotto: il controllo locale puo'
   essere piu' severo del server solo se il server rifiuterebbe comunque;
   non deve MAI essere piu' permissivo, e non deve MAI contare in modo
   diverso. Un pannello che dice «ci sta» e poi si becca un rifiuto al
   Salva e' peggio di un pannello che non controlla niente: chi
   amministra non sa piu' a chi credere.

   Percio' le regole di url, email, orario, colore e lunghezza sono la
   copia di quelle di `server/lib/convalida.js`, e il conto dei caratteri
   visibili del testo ricco passa dallo stesso `soloTesto()` del server.
   Se una delle due parti cambia, cambiano tutte e due.
   --------------------------------------------------------------------- */

const LIMITE_TESTO = 4000;

/* Copia esatta di RE_EMAIL di server/lib/convalida.js: il dominio vuole
   almeno un punto, e i pezzi fra i punti non possono essere vuoti. */
const RE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Le stesse quattro regole di `urlAmmesso()` del server, nello stesso
 * ordine e con le stesse parole nei messaggi.
 * Torna il messaggio del problema, oppure null se l'indirizzo va bene.
 */
function problemaUrl(testo) {
  if (testo.startsWith('//')) {
    return 'Un indirizzo che inizia con // eredita il protocollo della pagina: scrivi https:// per intero.';
  }
  const schema = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(testo);
  if (!schema) {
    // Nessun protocollo: percorso relativo o ancora interna, e va bene.
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
  /* Il server chiama «facoltativo» il campo che puo' restare vuoto
     (`vuotoAmmesso` in convalida.js): senza questa riga il pannello
     pretenderebbe un valore anche dove il salvataggio non lo chiede. */
  const facoltativo = campo.facoltativo === true;

  switch (campo.tipo) {
    case 'url':
      // Vuoto = la voce sparisce dal sito. Se il campo e' obbligatorio lo
      // dice il server con `facoltativo`, e il suo errore arriva sul campo.
      if (testo === '') return null;
      // Un percorso relativo senza barra davanti («pagina.html») per il
      // server e' valido: bocciarlo qui vorrebbe dire vietare a mano una
      // cosa che il salvataggio accetta.
      return problemaUrl(testo);

    case 'email':
      if (testo === '') return null;
      if (!RE_EMAIL.test(testo)) return 'Questo non sembra un indirizzo email valido.';
      return null;

    case 'orario':
      if (testo === '') return facoltativo ? null : 'Serve un orario, scritto come 21:00.';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(testo)) return 'L\'orario va scritto come 21:00.';
      return null;

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
      // Si conta il valore GREZZO, spazi in fondo compresi: il server fa
      // `valore.length` senza ripulire niente, e contando il testo
      // ripulito un valore di 41 caratteri con uno spazio in coda
      // passerebbe di qui per poi essere rifiutato al Salva.
      if (typeof valore === 'string' && valore.length > limite) {
        return 'Sono ' + valore.length + ' caratteri: il massimo è ' + limite + '.';
      }
      return null;
    }

    /* I quattro tipi nuovi. Le regole restano quelle del server, scritte
       un attimo prima: qui si blocca solo cio' che il server rifiuterebbe
       di sicuro, mai qualcosa che lui accetterebbe. Quello che il
       sanificatore toglie in silenzio (un tag fuori lista) non e' un
       errore: e' una pulizia, e l'editor la fa vedere da solo. */

    case 'ricco': {
      // campo.max conta i caratteri VISIBILI, non i tag (CONTRATTO-2 §5).
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
      // Stessa regola di RE_COLORE del server: cancelletto e sei cifre.
      if (!/^#[0-9a-fA-F]{6}$/.test(String(testo))) {
        return 'Il colore va scritto con il cancelletto e sei cifre, per esempio #8b2fff.';
      }
      return null;
    }

    case 'font': {
      if (testo === '') return facoltativo ? null : 'Scegli una famiglia dal menu.';
      // Il nome finisce dentro css/tema.css: questi caratteri uscirebbero
      // dalla dichiarazione, e il server li rifiuta sempre, catalogo o no.
      if (/[<>"'{};\\]/.test(String(testo))) {
        return 'Il nome di un carattere può contenere solo lettere, numeri e spazi.';
      }
      // Senza catalogo nello schema non si inventa una regola: il server
      // ha il suo elenco per ogni slot e resta lui a dire l'ultima parola.
      const catalogo = Array.isArray(campo.opzioni) ? campo.opzioni.map(valoreOpzione) : null;
      if (!catalogo || !catalogo.length) return null;
      if (!catalogo.includes(String(testo))) {
        return 'Questa famiglia non è nel catalogo: scegline una dal menu.';
      }
      return null;
    }

    case 'interruttore':
      // Il widget scrive sempre un booleano: qui si prendono solo i valori
      // arrivati storti dal file dei contenuti («true» come stringa).
      if (typeof valore !== 'boolean') return 'Questo campo può valere solo acceso o spento.';
      return null;

    default:
      return null;
  }
}

/* ---------------------------------------------------------------------
   Impalcatura comune
   --------------------------------------------------------------------- */

/**
 * Guscio di un campo: etichetta, aiuto, riga dell'errore.
 * `perInput` a false quando il controllo non e' un singolo input: in quel
 * caso l'etichetta non puo' essere una <label for>, e il gruppo si lega
 * con aria-labelledby.
 */
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

/** Attacca a un controllo i metodi per mostrare e togliere l'errore. */
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

/* ---------------------------------------------------------------------
   Campi di testo, url, email, numero, orario
   --------------------------------------------------------------------- */

function campoTesto(campo, accesso, ctx) {
  const parti = guscio(campo, ctx.opzioni);
  const multiriga = campo.tipo === 'testolungo';
  const limite = Number(campo.max) > 0 ? Number(campo.max) : null;

  const tipoHtml = { url: 'url', email: 'email', numero: 'number', orario: 'time' }[campo.tipo] || 'text';

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

  // Il contatore serve dove c'e' un tetto: senza, non si sa quanto manca.
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
      // Un valore non numerico resta com'e': valida() blocca il salvataggio
      // invece di mandare al server uno zero al posto di un errore.
      accesso.scrivi(grezzo !== '' && Number.isFinite(n) ? n : grezzo);
    } else {
      accesso.scrivi(grezzo);
    }
  };

  input.addEventListener('input', () => {
    scrivi();
    aggiornaContatore();
    // Mentre si scrive si corregge solo quello che era gia' segnalato:
    // segnalare a ogni tasto un'email incompleta e' fastidioso e inutile.
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

/* ---------------------------------------------------------------------
   Scelta fra opzioni
   --------------------------------------------------------------------- */

function campoScelta(campo, accesso, ctx) {
  const parti = guscio(campo, ctx.opzioni);
  const opzioni = Array.isArray(campo.opzioni) ? campo.opzioni : [];
  const attuale = accesso.leggi();
  const valoreAttuale = attuale === undefined || attuale === null ? '' : String(attuale);

  const select = el('select', { id: parti.idCampo, classe: 'campo__scelta' });
  parti.principale = select;

  if (!opzioni.some((o) => valoreOpzione(o) === valoreAttuale)) {
    // Il valore salvato non e' fra le opzioni: si mostra lo stesso, cosi'
    // non sparisce dai dati senza che nessuno se ne accorga.
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

/* ---------------------------------------------------------------------
   Immagine
   --------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------
   Orari: i sette giorni, l'ora, la durata, il fuso.
   E' un oggetto solo, e si modifica come un oggetto solo: cosi' il campo
   resta un campo, e nello schema basta una riga.
   --------------------------------------------------------------------- */

function campoOrari(campo, accesso, ctx) {
  const parti = guscio(campo, { ...ctx.opzioni, perInput: false });

  const valore = () => {
    const v = accesso.leggi();
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  };
  const cambia = (pezzo) => {
    accesso.scrivi({ ...valore(), ...pezzo });
    ctx.modificato();
    aggiornaRiassunto();
  };

  /* --- giorni --- */
  const giorniAttivi = () => {
    const g = valore().giorni;
    return Array.isArray(g) ? g.map(Number).filter((n) => Number.isInteger(n)) : [];
  };
  const gruppoGiorni = el('div', { classe: 'giorni', role: 'group', 'aria-label': 'Giorni di diretta' });

  const disegnaGiorni = () => {
    svuota(gruppoGiorni);
    const attivi = giorniAttivi();
    for (const giorno of GIORNI) {
      const acceso = attivi.includes(giorno.n);
      gruppoGiorni.append(el('button', {
        type: 'button',
        classe: 'giorno',
        'aria-pressed': String(acceso),
        'aria-label': giorno.lungo + (acceso ? ': si va in diretta' : ': niente diretta'),
        testo: giorno.breve,
        dati: { n: String(giorno.n) },
        su: {
          click: () => {
            const elenco = giorniAttivi().slice();
            const posizione = elenco.indexOf(giorno.n);
            // Chi c'era resta dov'era: un giorno tolto e rimesso non
            // riordina l'array, e la pubblicazione resta identica a se'.
            if (posizione >= 0) elenco.splice(posizione, 1); else elenco.push(giorno.n);
            cambia({ giorni: elenco });
            disegnaGiorni();
            const rifatto = gruppoGiorni.querySelector('[data-n="' + giorno.n + '"]');
            if (rifatto) rifatto.focus();
          }
        }
      }));
    }
  };

  /* --- ora, durata, fuso --- */
  const idOra = idUnico('ora');
  const inputOra = el('input', { id: idOra, classe: 'campo__input campo__input--breve', type: 'time', value: String(valore().ora || '') });
  inputOra.addEventListener('input', () => cambia({ ora: inputOra.value }));

  const idDurata = idUnico('dur');
  const durataIniziale = Number(valore().durataOre);
  const inputDurata = el('input', {
    id: idDurata, classe: 'campo__input campo__input--breve', type: 'number',
    min: '0.5', max: '24', step: '0.5', inputmode: 'decimal',
    value: Number.isFinite(durataIniziale) ? String(durataIniziale) : ''
  });
  inputDurata.addEventListener('input', () => {
    const n = Number(inputDurata.value);
    cambia({ durataOre: inputDurata.value !== '' && Number.isFinite(n) ? n : inputDurata.value });
  });

  const idFuso = idUnico('fuso');
  const listaFusi = el('datalist', { id: idFuso + '-elenco' });
  let fusi = FUSI_COMUNI;
  // supportedValuesOf non c'e' su tutti i browser: se manca, restano i fusi
  // comuni, che coprono il caso reale (il canale e' in Italia).
  if (typeof Intl.supportedValuesOf === 'function') {
    try { fusi = Intl.supportedValuesOf('timeZone'); } catch { fusi = FUSI_COMUNI; }
  }
  for (const fuso of fusi) listaFusi.append(el('option', { value: fuso }));

  const inputFuso = el('input', {
    id: idFuso, classe: 'campo__input', type: 'text', list: listaFusi.id,
    spellcheck: 'false', autocomplete: 'off', value: String(valore().fuso || '')
  });
  inputFuso.addEventListener('input', () => cambia({ fuso: inputFuso.value.trim() }));

  const riassunto = el('p', { classe: 'orari__riassunto' });
  const aggiornaRiassunto = () => {
    const attivi = giorniAttivi();
    const nomi = GIORNI.filter((g) => attivi.includes(g.n)).map((g) => g.lungo);
    if (!nomi.length) {
      riassunto.textContent = 'Nessun giorno scelto: il sito non saprebbe quando sei in diretta.';
      return;
    }
    const elenco = nomi.length === 1 ? nomi[0] : nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];
    const ora = valore().ora || '—';
    const durata = Number(valore().durataOre);
    riassunto.textContent = 'In diretta ' + elenco + ' alle ' + ora +
      (Number.isFinite(durata) ? ', per circa ' + durata + (durata === 1 ? ' ora' : ' ore') : '') +
      (valore().fuso ? ' (' + valore().fuso + ')' : '') + '.';
  };

  const gruppo = el('div', { classe: 'orari', role: 'group', 'aria-labelledby': parti.idEtichetta }, [
    gruppoGiorni,
    el('div', { classe: 'orari__riga' }, [
      el('label', { classe: 'orari__voce', for: idOra }, [el('span', { testo: 'Ora di inizio' }), inputOra]),
      el('label', { classe: 'orari__voce', for: idDurata }, [el('span', { testo: 'Durata (ore)' }), inputDurata]),
      el('label', { classe: 'orari__voce', for: idFuso }, [el('span', { testo: 'Fuso orario' }), inputFuso])
    ]),
    listaFusi,
    riassunto
  ]);

  disegnaGiorni();
  aggiornaRiassunto();
  parti.nodo.append(gruppo, parti.pie);

  const controllo = { chiave: campo.chiave, campo, nodo: parti.nodo };
  attaccaErrore(parti, controllo);
  controllo.valida = () => {
    const problemi = [];
    if (!giorniAttivi().length) problemi.push('scegli almeno un giorno');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(valore().ora || ''))) problemi.push('l\'ora va scritta come 21:00');
    if (!String(valore().fuso || '').trim()) problemi.push('serve un fuso orario, per esempio Europe/Rome');
    const durata = Number(valore().durataOre);
    if (!Number.isFinite(durata) || durata <= 0) problemi.push('la durata dev\'essere un numero di ore maggiore di zero');
    const messaggio = problemi.length ? problemi.join('; ') + '.' : '';
    controllo.mostraErrore(messaggio ? messaggio.charAt(0).toUpperCase() + messaggio.slice(1) : '');
    return !messaggio;
  };
  controllo.fuoco = () => {
    const primo = gruppoGiorni.querySelector('button');
    if (primo) primo.focus();
  };
  return controllo;
}

/* ---------------------------------------------------------------------
   Colore

   Tre pezzi che dicono la stessa cosa in tre modi: il selettore nativo
   (si sceglie col dito), la casella esadecimale (si incolla dal logo) e
   il rapporto di contrasto (si scopre che quel grigio non si legge).
   Il terzo e' quello che conta: e' l'unico che impedisce di rendere il
   sito illeggibile con un clic e accorgersene dopo aver pubblicato.
   --------------------------------------------------------------------- */

/* Ultimo appiglio quando nel gruppo non c'e' un campo di fondo o di testo
   da cui leggere: sono i valori di partenza del contratto (§4.2), e si
   dichiara sempre che sono quelli, invece di far finta di sapere. */
const COLORI_DI_PARTENZA = { fondo: '#07070c', testo: '#f2f0f8' };

/** Da «8b2fff», «#8B2FFF» o «#abc» a «#8b2fff». Stringa vuota se non si capisce. */
function normalizzaColore(valore) {
  const corpo = String(valore === null || valore === undefined ? '' : valore).trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(corpo)) return '#' + corpo.split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/.test(corpo)) return '#' + corpo;
  return '';
}

/**
 * I campi colore che sono a video adesso.
 *
 * Serve perche' il contrasto e' un rapporto fra DUE colori: il campo del
 * testo deve sapere che fondo ha scelto il campo qui sopra, e viceversa.
 * Passare per un registro invece che per i dati tiene questo file dove
 * deve stare: non sa quali chiavi esistono, sa solo chi e' disegnato.
 * Le voci morte si buttano guardando isConnected, cosi' il cambio di
 * gruppo non lascia in giro riferimenti a nodi che non esistono piu'.
 * Si butta pero' solo chi in pagina c'e' gia' stato: quando un campo si
 * costruisce, il suo nodo non e' ancora appeso a niente, e buttarlo
 * subito vorrebbe dire cancellarlo un istante dopo averlo scritto.
 */
const coloriAVideo = new Set();

function coloriVivi() {
  for (const voce of Array.from(coloriAVideo)) {
    if (voce.nodo.isConnected) voce.attaccato = true;
    else if (voce.attaccato) coloriAVideo.delete(voce);
  }
  return Array.from(coloriAVideo);
}

/**
 * Il colore contro cui misurare questo campo.
 * Lo schema puo' dirlo con `contrastoCon` (una chiave o un colore); se
 * non lo dice, si guarda il nome dell'ultimo pezzo della chiave: un
 * campo che si chiama «fondo» si misura col testo, tutti gli altri si
 * misurano col fondo. E' una convenzione, e come tale sta scritta qui.
 */
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
  // Il selettore nativo e' un <input>: l'etichetta puo' restare una
  // <label for>, che e' la cosa piu' solida che ci sia.
  const parti = guscio(campo, ctx.opzioni);
  const etichettaCampo = campo.etichetta || campo.chiave;

  const grezzoIniziale = accesso.leggi();
  const iniziale = normalizzaColore(grezzoIniziale);
  const selettore = el('input', {
    id: parti.idCampo, classe: 'colore__pozzo', type: 'color',
    value: iniziale || '#000000'
  });
  // La casella mostra il valore VERO, anche se e' storto: se nei contenuti
  // c'e' scritto «viola», si deve vedere «viola» e correggerlo, non un
  // nero comparso dal nulla.
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

  /** Ridisegna il verdetto: lo chiamano anche gli altri campi colore. */
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

    // L'esempio mostra la coppia vera: il colore su cui finira' davvero.
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

  /** Cambiando un colore cambia il verdetto di tutti gli altri. */
  const ricalcolaTutti = () => {
    for (const voce of coloriVivi()) voce.ricalcola();
  };

  const applica = (grezzo) => {
    const pulito = normalizzaColore(grezzo);
    // Se non e' un colore valido si scrive comunque quello che c'e':
    // valida() blocca il salvataggio invece di correggere di nascosto.
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
    // Alla fine si mette in ordine: «8b2fff» e «#8B2FFF» diventano
    // «#8b2fff», che e' l'unica forma che il server accetta.
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

/* ---------------------------------------------------------------------
   Font

   Il menu scrive ogni voce nel font vero. Non tutti i browser applicano
   font-family alle <option> (Safari e i menu di sistema di Android le
   disegnano a modo loro), quindi sotto al campo c'e' anche una riga di
   anteprima, che invece e' un elemento normale e si comporta ovunque
   allo stesso modo.
   --------------------------------------------------------------------- */

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

/**
 * Il catalogo per questo campo.
 * Prima lo schema (`opzioni` o `catalogo`), poi il catalogo per slot che
 * il server manda in `GET /api/contenuti` sotto `tema.font` e che
 * pannello.js puo' appoggiare in `ctx.tema`. Lo slot e' `campo.slot`
 * oppure l'ultimo pezzo della chiave (titolo, testo, mono).
 */
function catalogoFont(campo, ctx) {
  const daSchema = Array.isArray(campo.opzioni) ? campo.opzioni
    : (Array.isArray(campo.catalogo) ? campo.catalogo : null);
  if (daSchema && daSchema.length) return daSchema.map(voceFont).filter((v) => v.nome);

  const slot = String(campo.slot || String(campo.chiave || '').split('.').pop());
  const daApi = ctx && ctx.tema && ctx.tema.font && Array.isArray(ctx.tema.font[slot]) ? ctx.tema.font[slot] : null;
  return daApi ? daApi.map(voceFont).filter((v) => v.nome) : [];
}

/** La pila completa: la famiglia scelta e, dietro, il ripiego di sistema. */
function pilaFont(voce) {
  const ripiego = voce.ripiego || 'system-ui, sans-serif';
  return '"' + voce.nome.replace(/"/g, '') + '", ' + ripiego;
}

function campoFont(campo, accesso, ctx) {
  const catalogo = catalogoFont(campo, ctx);
  // Nessun catalogo: meglio una casella di testo che un menu vuoto, che
  // renderebbe il campo impossibile da correggere.
  if (!catalogo.length) return campoTesto({ ...campo, tipo: 'testo' }, accesso, ctx);

  const parti = guscio(campo, ctx.opzioni);
  const attuale = accesso.leggi();
  const valoreAttuale = attuale === undefined || attuale === null ? '' : String(attuale);

  const select = el('select', { id: parti.idCampo, classe: 'campo__scelta font__scelta' });
  parti.principale = select;

  if (!catalogo.some((v) => v.nome === valoreAttuale)) {
    select.append(el('option', {
      value: valoreAttuale,
      testo: valoreAttuale ? valoreAttuale + ' (non è nel catalogo)' : '— non impostato —'
    }));
  }
  for (const voce of catalogo) {
    const opzione = el('option', {
      value: voce.nome,
      testo: voce.nome + (voce.categoria ? ' · ' + voce.categoria : '')
    });
    opzione.style.fontFamily = pilaFont(voce);
    select.append(opzione);
  }
  select.value = valoreAttuale;

  const anteprima = el('p', { classe: 'font__anteprima', testo: campo.esempio || ANTEPRIMA_FONT });
  const ripiego = el('p', { classe: 'font__ripiego' });

  const aggiorna = () => {
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

  aggiorna();
  // Le anteprime hanno senso solo se i font ci sono davvero: Google Fonts
  // e' l'unico CDN che il contratto ammette, ed e' esattamente per questo.
  precaricaFont(catalogo).then(aggiorna);

  parti.nodo.append(el('div', { classe: 'font' }, [select, anteprima, ripiego]), parti.pie);
  return controllo;
}

/* ---------------------------------------------------------------------
   Interruttore

   E' un <button role="switch">, non una <input type="checkbox"> vestita.
   Due motivi: il bottone ha gia' la tastiera giusta (Spazio e Invio) e
   il fuoco visibile senza trucchi, e uno screen reader annuncia
   «interruttore, attivato», che e' quello che la cosa e' davvero, invece
   di «casella di controllo, selezionata». La casella stilata avrebbe
   richiesto di nascondere l'input vero e di ridisegnargli il fuoco
   addosso: piu' codice per un risultato peggiore.
   --------------------------------------------------------------------- */

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

  // L'etichetta qui e' uno <span>, non una <label>: il clic sopra non
  // porterebbe da nessuna parte, e chi amministra proverebbe due volte.
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

/* ---------------------------------------------------------------------
   Fabbrica
   --------------------------------------------------------------------- */

/**
 * @param {object} campo    descrizione dallo schema { chiave, etichetta, tipo, … }
 * @param {object} accesso  { leggi(), scrivi(valore) } sul dato vero
 * @param {object} ctx      { modificato(), registra(), scegliImmagine(), conferma(), opzioni }
 *   Facoltativo, e usato solo dai campi «font»: `ctx.tema` = quello che
 *   GET /api/contenuti manda sotto `tema` ({ font: CATALOGO_FONT, preset }).
 *   Se manca, il catalogo si prende dalle `opzioni` dello schema; se non
 *   c'e' nemmeno quello, il campo diventa una casella di testo e resta
 *   modificabile lo stesso.
 */
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
    case 'orario':      return campoTesto(campo, accesso, ctx);
    default:
      // Tipo sconosciuto: meglio una casella di testo che un campo assente.
      // Cosi' un'estensione futura dello schema resta comunque modificabile
      // anche da un pannello che non la conosce ancora.
      return campoTesto({ ...campo, tipo: 'testo' }, accesso, ctx);
  }
}

