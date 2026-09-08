/* =====================================================================
   api.js — l'unico punto del pannello che parla con il server.

   Tutto passa di qui per tre motivi che altrimenti andrebbero ripetuti a
   ogni chiamata: il cookie di sessione (`credentials: 'same-origin'`), la
   traduzione di qualsiasi guaio in un ErroreApi con un messaggio gia'
   scritto in italiano, e l'avviso unico quando la sessione scade — cosi'
   chi chiama non deve controllare 401 dappertutto.

   Rotte: contratto §8. Nessun token CSRF: il server accetta solo richieste
   con Origin proprio, e il cookie e' SameSite=Strict.
   ===================================================================== */

/** Errore con dentro quello che serve per decidere come reagire. */
export class ErroreApi extends Error {
  constructor(messaggio, { stato = 0, dati = null } = {}) {
    super(messaggio);
    this.name = 'ErroreApi';
    this.stato = stato;   // codice HTTP; 0 se il server non ha risposto affatto
    this.dati = dati;     // corpo completo della risposta, se era JSON
  }

  /** La richiesta non e' nemmeno partita: server spento o rete assente. */
  get offline() { return this.stato === 0; }

  /** Sessione non piu' valida: si torna alla schermata di accesso. */
  get scaduta() { return this.stato === 401 || this.stato === 403; }

  /** Il server ha rifiutato i contenuti perche' non passano la convalida. */
  get convalida() { return this.stato === 422 || this.stato === 400; }
}

/**
 * La rotta non esiste su questo server.
 *
 * Serve per le rotte aggiunte dopo (POST /api/anteprima, POST /api/tema):
 * se il server e' rimasto indietro il pannello spegne quella funzione e
 * continua a lavorare, invece di riprovare a ogni tasto premuto.
 */
export function rottaAssente(errore) {
  return errore instanceof ErroreApi && (errore.stato === 404 || errore.stato === 405 || errore.stato === 501);
}

/* Chi vuole sapere che la sessione e' caduta si iscrive una volta sola.
   Serve al pannello per rimettere in piedi il login senza buttare via le
   modifiche che l'utente ha in memoria. */
let alloScadere = null;
export function quandoScadeLaSessione(fn) { alloScadere = fn; }

function messaggioPredefinito(stato) {
  switch (stato) {
    case 400: return 'La richiesta non e\' valida.';
    case 401: return 'La sessione e\' scaduta: serve di nuovo la password.';
    case 403: return 'Il server ha rifiutato la richiesta. Ricarica la pagina ed entra di nuovo.';
    case 404: return 'Il server non conosce questa richiesta: forse ne gira una versione piu\' vecchia. Riavvialo e riprova.';
    case 405: return 'Il server non accetta questo modo di chiamare la rotta.';
    case 409: return 'Operazione non consentita: qualcosa e\' ancora in uso.';
    case 413: return 'Il file e\' troppo grande.';
    case 415: return 'Il server non accetta questo tipo di file.';
    case 422: return 'Ci sono campi da correggere.';
    case 429: return 'Troppi tentativi. Aspetta qualche minuto e riprova.';
    case 500: return 'Il server e\' andato in errore. Guarda il terminale dove gira.';
    default:  return 'Il server ha risposto con un errore (' + stato + ').';
  }
}

/**
 * Trasporto comune. `corpo` puo' essere un oggetto (va in JSON), un
 * FormData o undefined. Torna sempre `{ risposta, testo, dati }`: `dati` e'
 * il JSON quando il corpo lo era, `testo` il corpo grezzo. Serve entrambi
 * perche' /api/anteprima risponde HTML e tutto il resto risponde JSON.
 */
async function grezza(metodo, percorso, corpo, { silenziosa = false, accetta = 'application/json' } = {}) {
  const opzioni = {
    method: metodo,
    credentials: 'same-origin',   // la sessione e' un cookie: senza questo non parte
    headers: { Accept: accetta },
    cache: 'no-store'
  };

  if (corpo instanceof FormData) {
    // Niente Content-Type a mano: lo mette fetch con il boundary giusto.
    opzioni.body = corpo;
  } else if (corpo !== undefined) {
    opzioni.headers['Content-Type'] = 'application/json';
    opzioni.body = JSON.stringify(corpo);
  }

  let risposta;
  try {
    risposta = await fetch(percorso, opzioni);
  } catch {
    // fetch fallisce solo se la richiesta non e' partita: server spento,
    // rete staccata, pagina aperta da file:// invece che da localhost.
    throw new ErroreApi(
      'Non riesco a contattare il server. Controlla che sia acceso: node server/server.js',
      { stato: 0 }
    );
  }

  // Il contratto dice JSON su ogni rotta /api, ma un 500 puo' arrivare in
  // HTML: meglio non far esplodere il pannello su una parentesi.
  let dati = null;
  const testo = await risposta.text();
  if (testo) {
    try { dati = JSON.parse(testo); } catch { dati = null; }
  }

  if (!risposta.ok) {
    const messaggio = (dati && (dati.errore || dati.messaggio || dati.message)) || messaggioPredefinito(risposta.status);
    const errore = new ErroreApi(messaggio, { stato: risposta.status, dati });
    if (errore.scaduta && !silenziosa && alloScadere) alloScadere(errore);
    throw errore;
  }

  return { risposta, testo, dati };
}

/** Richiesta che si aspetta JSON: e' il caso di quasi tutte le rotte. */
async function richiesta(metodo, percorso, corpo, opzioni = {}) {
  const { dati } = await grezza(metodo, percorso, corpo, opzioni);
  return dati === null ? {} : dati;
}

/* ---------------------------------------------------------------------
   Normalizzazioni.

   Il contratto fissa le rotte ma non la forma esatta di ogni elenco. Qui
   si accettano le varianti ragionevoli e si restituisce sempre la stessa
   cosa al resto del pannello, che cosi' non ha "se" sparsi in giro.
   --------------------------------------------------------------------- */

/** Prende il primo array utile dentro una risposta. */
function comeElenco(risposta, ...nomi) {
  if (Array.isArray(risposta)) return risposta;
  if (!risposta || typeof risposta !== 'object') return [];
  for (const nome of nomi) {
    if (Array.isArray(risposta[nome])) return risposta[nome];
  }
  for (const valore of Object.values(risposta)) {
    if (Array.isArray(valore)) return valore;
  }
  return [];
}

function primoValore(oggetto, nomi, predefinito = undefined) {
  for (const nome of nomi) {
    if (oggetto && oggetto[nome] !== undefined && oggetto[nome] !== null && oggetto[nome] !== '') return oggetto[nome];
  }
  return predefinito;
}

/** Voce della libreria immagini, sempre { nome, percorso, dimensione, data }. */
function normalizzaMedia(voce) {
  if (typeof voce === 'string') return { nome: voce, percorso: 'contenuti/media/' + voce, dimensione: null, data: null };
  const nome = String(primoValore(voce, ['nome', 'name', 'file', 'nomeFile'], '') || '');
  const percorso = String(primoValore(voce, ['percorso', 'url', 'path', 'src'], 'contenuti/media/' + nome) || '')
    .replace(/^\/+/, '');
  return {
    nome,
    percorso,
    dimensione: Number(primoValore(voce, ['dimensione', 'size', 'peso', 'byte'], NaN)),
    data: primoValore(voce, ['quando', 'modificatoIl', 'data', 'creatoIl', 'mtime', 'aggiornatoIl'], null),
    usata: primoValore(voce, ['usata', 'inUso', 'usato'], null),
    tipo: primoValore(voce, ['tipo', 'type', 'mime'], null)
  };
}

/** Voce dei backup, sempre { id, data, dimensione, file }. */
function normalizzaBackup(voce) {
  if (typeof voce === 'string') return { id: voce, data: voce, dimensione: NaN, file: null };
  const id = String(primoValore(voce, ['id', 'nome', 'name', 'cartella', 'backup'], '') || '');
  return {
    id,
    data: primoValore(voce, ['data', 'creatoIl', 'dataISO', 'quando', 'createdAt', 'aggiornatoIl'], id),
    dimensione: Number(primoValore(voce, ['dimensione', 'size', 'peso', 'byte'], NaN)),
    file: primoValore(voce, ['file', 'files', 'contenuto'], null)
  };
}

/**
 * Estrae dall'errore l'elenco { chiave, messaggio } della convalida.
 * Il contratto lo prevede sulla risposta di PUT /api/contenuti; il nome
 * del campo che lo contiene non e' fissato, quindi si cerca il primo
 * array di oggetti che abbia una chiave e un messaggio.
 */
export function erroriDiConvalida(errore) {
  const corpo = errore && errore.dati;
  if (!corpo) return [];

  const candidati = [];
  if (Array.isArray(corpo)) candidati.push(corpo);
  if (corpo && typeof corpo === 'object') {
    for (const nome of ['errori', 'campi', 'dettagli', 'convalida', 'errors', 'fields']) {
      if (Array.isArray(corpo[nome])) candidati.push(corpo[nome]);
    }
  }

  for (const elenco of candidati) {
    const puliti = elenco
      .map((voce) => {
        if (!voce || typeof voce !== 'object') return null;
        const chiave = primoValore(voce, ['chiave', 'campo', 'key', 'field', 'percorso'], '');
        const messaggio = primoValore(voce, ['messaggio', 'errore', 'message', 'testo'], '');
        if (!chiave || !messaggio) return null;
        return { chiave: String(chiave), messaggio: String(messaggio) };
      })
      .filter(Boolean);
    if (puliti.length) return puliti;
  }
  return [];
}

/* ---------------------------------------------------------------------
   Caricamento di un'immagine.

   Il contratto dice «POST /api/media carica un'immagine» ma non fissa la
   codifica. Si prova prima multipart/form-data, che e' quello che manda
   un <form> normale; se il server risponde «non capisco la richiesta»
   (400/404/405/415/422/501) si riprova in JSON con il file in base64.
   Un 401, un 409 o un 413 invece sono risposte vere: si fermano subito,
   ritentare vorrebbe dire caricare due volte lo stesso file.
   --------------------------------------------------------------------- */

const STATI_DA_RITENTARE = new Set([400, 404, 405, 415, 422, 501]);

function leggiBase64(file) {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onerror = () => rifiuta(new ErroreApi('Non riesco a leggere il file dal disco.', { stato: 0 }));
    lettore.onload = () => {
      const risultato = String(lettore.result || '');
      const virgola = risultato.indexOf(',');
      risolvi(virgola >= 0 ? risultato.slice(virgola + 1) : risultato);
    };
    lettore.readAsDataURL(file);
  });
}

async function caricaMedia(file) {
  const modulo = new FormData();
  modulo.append('file', file, file.name);
  modulo.append('nome', file.name);

  try {
    return await richiesta('POST', '/api/media', modulo);
  } catch (errore) {
    if (!(errore instanceof ErroreApi) || !STATI_DA_RITENTARE.has(errore.stato)) throw errore;
    const dati = await leggiBase64(file);
    return richiesta('POST', '/api/media', { nome: file.name, tipo: file.type || '', dati });
  }
}

/* ---------------------------------------------------------------------
   Le rotte
   --------------------------------------------------------------------- */

export const api = {
  /* accesso — `silenziosa` perche' un 401 qui e' la risposta normale a una
     password sbagliata, non una sessione da rimettere in piedi. */
  sessione: () => richiesta('GET', '/api/sessione', undefined, { silenziosa: true }),
  entra: (password) => richiesta('POST', '/api/entra', { password }, { silenziosa: true }),
  esci: () => richiesta('POST', '/api/esci', {}, { silenziosa: true }),

  /**
   * Crea la password al primo avvio. Il contratto non elenca una rotta a
   * parte: la lettura naturale e' che POST /api/entra, quando auth.json
   * non esiste, imposti la password e apra la sessione. Se il server ha
   * scelto una rotta dedicata si prova anche quella prima di arrendersi.
   */
  async creaPassword(password) {
    try {
      return await richiesta('POST', '/api/entra', { password }, { silenziosa: true });
    } catch (errore) {
      if (!(errore instanceof ErroreApi) || !STATI_DA_RITENTARE.has(errore.stato)) throw errore;
      return richiesta('POST', '/api/password', { password }, { silenziosa: true });
    }
  },

  /* contenuti */
  contenuti: () => richiesta('GET', '/api/contenuti'),
  salva: (corpo) => richiesta('PUT', '/api/contenuti', corpo),
  pubblica: () => richiesta('POST', '/api/pubblica', {}),

  /* Anteprima della bozza GIA' SALVATA: e' HTML, ci va dentro un <iframe>
     con src. Il numero in coda impedisce al browser di riusare la copia in
     cache quando si preme «Aggiorna». Resta il ripiego di quella dal vivo
     e l'indirizzo del bottone «Scheda nuova». */
  urlAnteprima: () => '/api/anteprima?t=' + Date.now(),

  /**
   * Anteprima dal vivo (CONTRATTO-2 §9): rende i contenuti che sono ancora
   * solo nel pannello, senza salvare e senza pubblicare. Torna la pagina
   * come stringa, che poi finisce dentro il documento dell'iframe.
   *
   * Il corpo porta i contenuti due volte: annidati sotto `contenuti`, come
   * dice il contratto, e anche piatti, che e' la forma con cui li riceve
   * PUT /api/contenuti. Costa qualche kilobyte su localhost ed evita che
   * l'anteprima muoia per una lettura diversa dello stesso contratto.
   */
  async anteprimaViva({ testi, config }) {
    const { testo, dati } = await grezza(
      'POST', '/api/anteprima',
      { contenuti: { testi, config }, testi, config },
      { accetta: 'text/html, application/json' }
    );
    if (dati && typeof dati === 'object') {
      const html = dati.html ?? dati.anteprima ?? dati.pagina ?? dati.contenuto;
      if (typeof html === 'string') return html;
    }
    return testo;
  },

  /**
   * Foglio del tema calcolato al volo (CONTRATTO-2 §9). Non salva niente:
   * serve solo a far vedere subito un colore cambiato, iniettandolo nel
   * documento dell'anteprima.
   */
  async temaCss(tema) {
    const { testo, dati } = await grezza('POST', '/api/tema', { tema }, { accetta: 'application/json, text/css' });
    if (dati && typeof dati === 'object' && typeof dati.css === 'string') return dati.css;
    // Un server che rispondesse direttamente col foglio invece che con
    // { css } sarebbe comunque utilizzabile: quello che conta e' il CSS.
    return typeof testo === 'string' ? testo : '';
  },

  /* immagini */
  async media() {
    const risposta = await richiesta('GET', '/api/media');
    return comeElenco(risposta, 'media', 'file', 'files', 'elenco', 'voci').map(normalizzaMedia);
  },
  caricaMedia,
  eliminaMedia: (nome) => richiesta('DELETE', '/api/media/' + encodeURIComponent(nome)),

  /* copie di sicurezza */
  async backup() {
    const risposta = await richiesta('GET', '/api/backup');
    return comeElenco(risposta, 'backup', 'copie', 'elenco', 'voci', 'items').map(normalizzaBackup);
  },
  ripristina: (id) => richiesta('POST', '/api/backup/' + encodeURIComponent(id) + '/ripristina', {})
};
