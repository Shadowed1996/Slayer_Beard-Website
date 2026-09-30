export class ErroreApi extends Error {
  constructor(messaggio, { stato = 0, dati = null } = {}) {
    super(messaggio);
    this.name = 'ErroreApi';
    this.stato = stato;
    this.dati = dati;
  }

  get offline() { return this.stato === 0; }

  get scaduta() { return this.stato === 401 || this.stato === 403; }

  get convalida() { return this.stato === 422 || this.stato === 400; }
}

export function rottaAssente(errore) {
  return errore instanceof ErroreApi && (errore.stato === 404 || errore.stato === 405 || errore.stato === 501);
}

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

async function grezza(metodo, percorso, corpo, { silenziosa = false, accetta = 'application/json' } = {}) {
  const opzioni = {
    method: metodo,
    credentials: 'same-origin',
    headers: { Accept: accetta },
    cache: 'no-store'
  };

  if (corpo instanceof FormData) {
    opzioni.body = corpo;
  } else if (corpo !== undefined) {
    opzioni.headers['Content-Type'] = 'application/json';
    opzioni.body = JSON.stringify(corpo);
  }

  let risposta;
  try {
    risposta = await fetch(percorso, opzioni);
  } catch {
    throw new ErroreApi(
      'Non riesco a contattare il server. Controlla che sia acceso: node server/server.js',
      { stato: 0 }
    );
  }

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

async function richiesta(metodo, percorso, corpo, opzioni = {}) {
  const { dati } = await grezza(metodo, percorso, corpo, opzioni);
  return dati === null ? {} : dati;
}

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

export const api = {
  sessione: () => richiesta('GET', '/api/sessione', undefined, { silenziosa: true }),
  entra: (password) => richiesta('POST', '/api/entra', { password }, { silenziosa: true }),
  esci: () => richiesta('POST', '/api/esci', {}, { silenziosa: true }),

  creaPassword: (password) => richiesta('POST', '/api/entra', { password }, { silenziosa: true }),

  contenuti: () => richiesta('GET', '/api/contenuti'),
  salva: (corpo) => richiesta('PUT', '/api/contenuti', corpo),
  pubblica: () => richiesta('POST', '/api/pubblica', {}),

  urlAnteprima: () => '/api/anteprima?t=' + Date.now(),

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

  async anteprima({ contenuti, editor = false } = {}) {
    const corpo = { contenuti };
    if (editor) corpo.editor = true;
    const { testo, dati } = await grezza('POST', '/api/anteprima', corpo, { accetta: 'text/html, application/json' });
    if (dati && typeof dati === 'object') {
      const html = dati.html ?? dati.anteprima ?? dati.pagina ?? dati.contenuto;
      if (typeof html === 'string') return html;
    }
    return testo;
  },

  async temaCss(tema) {
    const { testo, dati } = await grezza('POST', '/api/tema', { tema }, { accetta: 'application/json, text/css' });
    if (dati && typeof dati === 'object' && typeof dati.css === 'string') return dati.css;
    return typeof testo === 'string' ? testo : '';
  },

  async media() {
    const risposta = await richiesta('GET', '/api/media');
    return comeElenco(risposta, 'media', 'file', 'files', 'elenco', 'voci').map(normalizzaMedia);
  },
  caricaMedia,
  eliminaMedia: (nome) => richiesta('DELETE', '/api/media/' + encodeURIComponent(nome)),

  async backup() {
    const risposta = await richiesta('GET', '/api/backup');
    return comeElenco(risposta, 'backup', 'copie', 'elenco', 'voci', 'items').map(normalizzaBackup);
  },
  ripristina: (id) => richiesta('POST', '/api/backup/' + encodeURIComponent(id) + '/ripristina', {}),

  async font() {
    const risposta = await richiesta('GET', '/api/font');
    return comeElenco(risposta, 'font').filter((voce) => voce && typeof voce === 'object' && voce.id);
  },

  async caricaFont(file, etichetta = '') {
    const modulo = new FormData();
    modulo.append('file', file, file.name);
    modulo.append('etichetta', String(etichetta || '').trim() || file.name.replace(/\.[^.]+$/, ''));
    const risposta = await richiesta('POST', '/api/font', modulo);
    return (risposta && risposta.font) || risposta;
  },

  eliminaFont: (id, { forza = false } = {}) =>
    richiesta('DELETE', '/api/font/' + encodeURIComponent(id) + (forza ? '?forza=1' : '')),

  async cambiaPassword(attuale, nuova) {
    try {
      return await richiesta('POST', '/api/password', { attuale, nuova }, { silenziosa: true });
    } catch (errore) {
      if (errore instanceof ErroreApi && errore.stato === 401 && alloScadere) alloScadere(errore);
      throw errore;
    }
  },

  twitchStato: () => richiesta('GET', '/api/twitch/collega'),

  twitchCollega: () => richiesta('POST', '/api/twitch/collega'),

  twitchCollegaStato: () => richiesta('POST', '/api/twitch/collega/stato'),

  twitchScollega: () => richiesta('POST', '/api/twitch/scollega'),

  sondaggi: () => richiesta('GET', '/api/sondaggi'),
  creaSondaggio: (dati) => richiesta('POST', '/api/sondaggi', dati),
  chiudiSondaggio: () => richiesta('POST', '/api/sondaggi/chiudi'),
  lanciaMeteora: () => richiesta('POST', '/api/meteora/lancia'),
  lanciaPillola: () => richiesta('POST', '/api/pillola/lancia'),
  eliminaSondaggio: (id) => richiesta('DELETE', '/api/sondaggi/' + encodeURIComponent(id)),

  classifica: () => richiesta('GET', '/api/classifica/gestione'),
  classificaTogli: (dati) => richiesta('POST', '/api/classifica/togli', dati),
  classificaRiporta: (dati) => richiesta('POST', '/api/classifica/riporta', dati),
  classificaBlocca: (dati) => richiesta('POST', '/api/classifica/blocca', dati),
  classificaStagione: (dati) => richiesta('POST', '/api/classifica/stagione', dati)
};
