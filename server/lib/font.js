'use strict';
/* =====================================================================
   font.js — i font caricati dal pannello (CONTRATTO-4 §4.4 e §7).

   Su disco:
     contenuti/font/<id>.<woff2|woff|ttf|otf>   il file
     contenuti/font/elenco.json                 [{ id, etichetta, file, formato, caricatoIl }]

   Le regole sono quelle di media.js, strette per un tipo di file che il
   browser esegue quasi come codice (un font e un programma per il
   rasterizzatore):
   - il formato si riconosce dai primi byte, mai dall'estensione, e
     l'intestazione deve stare in piedi: un file troncato o con i soli
     quattro byte giusti non passa;
   - al massimo 2 MB: un font da sito in WOFF2 ne pesa un decimo;
   - l'id (16 cifre esadecimali) e il nome del file li decide il server.
     Il nome scelto da chi carica diventa un'etichetta ripulita, mai un
     percorso;
   - elenco.json si riscrive in modo atomico, e se e illeggibile non si
     riscrive affatto: sarebbe cancellare l'elenco per caricare un font;
   - un font in uso (in uno slot del tema o in config.stili) non si
     cancella senza la conferma esplicita di chi amministra.

   `formato` e la parola di format() del CSS (woff2, woff, truetype,
   opentype), non l'estensione: con format('ttf') il browser scarterebbe la
   sorgente in silenzio.
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { P } = require('./percorsi');
const { assicuraCartella, scriviAtomico } = require('./file');
const { erroreHttp } = require('./risposte');
const media = require('./media');

const MAX_BYTE = 2 * 1024 * 1024;
const RE_ID = /^[0-9a-f]{16}$/;

// Formato (parola del CSS) -> estensione del file che il server scrive.
const ESTENSIONI = { woff2: 'woff2', woff: 'woff', truetype: 'ttf', opentype: 'otf' };
const FORMATI_LEGGIBILI = 'WOFF2, WOFF, TTF o OTF';

// I tre slot del tema, con il nome che il pannello mostra in «usatoIn».
const SLOT = { titolo: 'Titoli', testo: 'Testo', mono: 'Strumentazione' };

/* --- RICONOSCIMENTO DEL FORMATO ------------------------------------ */

/**
 * Il formato dai primi byte, oppure null. Una raccolta TrueType (`ttcf`) si
 * riconosce per poterla rifiutare con un messaggio che dica cosa fare: il
 * sito usa un font alla volta, e dentro una raccolta ce ne sono molti.
 */
function formatoDi(dati) {
  if (!Buffer.isBuffer(dati) || dati.length < 12) { return null; }
  const firma = dati.slice(0, 4).toString('latin1');
  if (firma === 'wOF2') { return 'woff2'; }
  if (firma === 'wOFF') { return 'woff'; }
  if (firma === 'OTTO') { return 'opentype'; }
  // 0x00010000 e il TrueType di tutti; `true` quello dei vecchi Mac.
  if (firma === 'true' || (dati[0] === 0 && dati[1] === 1 && dati[2] === 0 && dati[3] === 0)) { return 'truetype'; }
  if (firma === 'ttcf') { return 'raccolta'; }
  return null;
}

/**
 * Oltre alla firma, l'intestazione deve essere coerente con il file: scarta
 * i caricamenti interrotti e i file che hanno solo i primi quattro byte
 * giusti. WOFF e WOFF2 dichiarano la propria lunghezza totale; un sfnt
 * (TTF, OTF) dichiara quante tabelle ha, e ognuna occupa 16 byte di indice.
 */
function intestazioneCoerente(dati, formato) {
  try {
    if (formato === 'woff2' || formato === 'woff') {
      if (dati.length < 44) { return false; }
      return dati.readUInt32BE(8) === dati.length && dati.readUInt16BE(12) > 0;
    }
    const tabelle = dati.readUInt16BE(4);
    return tabelle > 0 && tabelle <= 512 && dati.length >= 12 + 16 * tabelle;
  } catch (e) {
    return false;
  }
}

/* --- ETICHETTE ----------------------------------------------------- */

/**
 * Etichetta leggibile: lettere, cifre, spazi e poca punteggiatura, al
 * massimo 60 caratteri. Finisce nel pannello e nel commento in testa a
 * css/tema.css, quindi niente markup e niente asterischi o barre, che la
 * potrebbero chiudere.
 */
function pulisciEtichetta(valore) {
  let testo = String(valore == null ? '' : valore);
  testo = testo.replace(/<[^>]*>?/g, ' ').replace(/_+/g, ' ');
  testo = testo.replace(/[^\p{L}\p{N} .,()+&'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  // Array.from per non spezzare a meta un carattere fuori dal piano base.
  const lettere = Array.from(testo);
  return lettere.length > 60 ? lettere.slice(0, 60).join('').trim() : testo;
}

/** Dal nome del file del computer: senza cartella e senza estensione. */
function etichettaDaNome(nomeFile) {
  const base = String(nomeFile || '').replace(/<[^>]*>?/g, ' ').split(/[\\/]/).pop()
    .replace(/\.(woff2|woff|ttf|otf|ttc)$/i, '');
  return pulisciEtichetta(base) || 'Font caricato';
}

/* --- ELENCO -------------------------------------------------------- */

/** Percorso del file di un id, costruito dall'id validato e mai da un dato letto. */
function percorsoDi(id, formato) {
  if (!RE_ID.test(String(id)) || !ESTENSIONI[formato]) { return null; }
  return path.join(P.font, id + '.' + ESTENSIONI[formato]);
}

/**
 * Riporta una voce di elenco.json alla forma attesa, oppure null. Il nome
 * del file si ricalcola da id e formato: una voce che dicesse
 * "../../server/dati/auth.json" non deve poter indicare niente.
 */
function normalizzaVoce(grezza) {
  if (!grezza || typeof grezza !== 'object' || Array.isArray(grezza)) { return null; }
  const id = String(grezza.id || '');
  const formato = String(grezza.formato || '');
  if (!RE_ID.test(id) || !ESTENSIONI[formato]) { return null; }
  const file = id + '.' + ESTENSIONI[formato];
  if (grezza.file !== file) { return null; }
  return {
    id: id,
    etichetta: pulisciEtichetta(grezza.etichetta) || 'Font caricato',
    file: file,
    formato: formato,
    caricatoIl: typeof grezza.caricatoIl === 'string' ? grezza.caricatoIl : ''
  };
}

/** { voci, errore }: errore e il motivo per cui elenco.json non si legge. */
function leggiElenco() {
  let grezzo;
  try {
    grezzo = fs.readFileSync(P.elencoFont, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') { return { voci: [], errore: null }; }
    return { voci: [], errore: e };
  }
  let dati;
  try {
    dati = JSON.parse(grezzo.replace(/^﻿/, ''));
  } catch (e) {
    return { voci: [], errore: e };
  }
  if (!Array.isArray(dati)) { return { voci: [], errore: new Error('non contiene un elenco') }; }

  const viste = new Set();
  const voci = [];
  for (const grezza of dati) {
    const voce = normalizzaVoce(grezza);
    // Un id ripetuto vale la prima volta, e un file sparito dal disco non e
    // un font: nel CSS sarebbe una sorgente che non risponde.
    if (!voce || viste.has(voce.id)) { continue; }
    if (!fs.existsSync(percorsoDi(voce.id, voce.formato))) { continue; }
    viste.add(voce.id);
    voci.push(voce);
  }
  return { voci: voci, errore: null };
}

/** Le voci per una scrittura: un elenco illeggibile ferma tutto invece di venire azzerato. */
function elencoPerScrivere() {
  const letto = leggiElenco();
  if (letto.errore) {
    throw erroreHttp(500, 'contenuti/font/elenco.json non si legge (' + letto.errore.message +
      '): va sistemato o tolto prima di caricare o cancellare un font.');
  }
  return letto.voci;
}

function scriviElenco(voci) {
  assicuraCartella(P.font);
  scriviAtomico(P.elencoFont, JSON.stringify(voci, null, 2) + '\n');
}

/* --- OPERAZIONI ---------------------------------------------------- */

/** I font caricati, dal piu vecchio. Non lancia mai: un elenco rotto vale vuoto. */
function elenco() {
  return leggiElenco().voci;
}

/** La voce di questo id, oppure null. */
function voce(id) {
  if (!RE_ID.test(String(id))) { return null; }
  for (const v of elenco()) {
    if (v.id === id) { return v; }
  }
  return null;
}

/** Vero se il font esiste davvero: voce nell'elenco e file sul disco. */
function esiste(id) {
  return voce(id) !== null;
}

/**
 * Dove i contenuti usano questo font, con i nomi che il pannello mostra:
 * «Impostazioni · Titoli» per uno slot del tema, «Stile di <bersaglio>» per
 * config.stili. Un bersaglio compare una volta sola anche se il font sta su
 * piu dispositivi.
 */
function usatoIn(id, contenuti) {
  const valore = 'caricato:' + id;
  const config = (contenuti && contenuti.config) || {};
  const usi = [];

  const slot = (config.tema && config.tema.font) || {};
  for (const nome of Object.keys(SLOT)) {
    if (slot[nome] === valore) { usi.push('Impostazioni · ' + SLOT[nome]); }
  }

  const stili = (config.stili && typeof config.stili === 'object' && !Array.isArray(config.stili)) ? config.stili : {};
  for (const bersaglio of Object.keys(stili)) {
    const dispositivi = stili[bersaglio];
    if (!dispositivi || typeof dispositivi !== 'object') { continue; }
    const usato = Object.keys(dispositivi).some((d) => dispositivi[d] && dispositivi[d].font === valore);
    if (usato) { usi.push('Stile di ' + bersaglio); }
  }
  return usi;
}

/** L'elenco per il pannello: ogni voce con i suoi usi. */
function elencoConUso(contenuti) {
  return elenco().map((v) => Object.assign({}, v, { usatoIn: usatoIn(v.id, contenuti) }));
}

/**
 * Salva il font di una richiesta multipart gia letta in memoria.
 * Campi: `file` (obbligatorio) ed `etichetta` (facoltativa: se manca vale
 * il nome del file). Restituisce la voce nuova.
 */
function salva(corpo, tipoContenuto) {
  const confine = media.confineDi(tipoContenuto);
  if (!confine) { throw erroreHttp(400, 'Il font deve arrivare come multipart/form-data.'); }

  const campi = media.campiModulo(corpo, confine);
  const parte = campi.find((c) => c.campo === 'file' && c.nomeFile !== null) ||
    campi.find((c) => c.nomeFile !== null);
  if (!parte || !parte.dati.length) { throw erroreHttp(400, 'Nella richiesta non c e nessun file di font.'); }

  if (parte.dati.length > MAX_BYTE) {
    throw erroreHttp(413, 'Il font supera il limite di 2 MB. Se esiste, usa la versione WOFF2, che pesa molto meno.');
  }

  const formato = formatoDi(parte.dati);
  if (formato === 'raccolta') {
    throw erroreHttp(415, 'Questo file e una raccolta di piu font (.ttc): il sito ne usa uno alla volta. ' +
      'Esporta lo stile che ti serve come ' + FORMATI_LEGGIBILI + ' e riprova.');
  }
  if (!formato) {
    throw erroreHttp(415, 'Il file non e un font ' + FORMATI_LEGGIBILI + ': controlla di aver scelto il file giusto.');
  }
  if (!intestazioneCoerente(parte.dati, formato)) {
    throw erroreHttp(415, 'Il font sembra incompleto o danneggiato: scaricalo di nuovo e riprova.');
  }

  const scritta = campi.find((c) => c.campo === 'etichetta' && c.nomeFile === null);
  const etichetta = pulisciEtichetta(scritta ? scritta.dati.toString('utf8') : '') || etichettaDaNome(parte.nomeFile);

  // L'elenco si legge PRIMA di scrivere il file: se e rotto non si lascia
  // un font orfano sul disco.
  const voci = elencoPerScrivere();

  let id = '';
  let destinazione = null;
  for (let tentativo = 0; tentativo < 5 && !destinazione; tentativo++) {
    id = crypto.randomBytes(8).toString('hex');
    const candidato = percorsoDi(id, formato);
    if (!voci.some((v) => v.id === id) && !fs.existsSync(candidato)) { destinazione = candidato; }
  }
  if (!destinazione) { throw erroreHttp(500, 'Non riesco a trovare un nome libero per il font.'); }

  assicuraCartella(P.font);
  scriviAtomico(destinazione, parte.dati);

  const nuova = {
    id: id,
    etichetta: etichetta,
    file: path.basename(destinazione),
    formato: formato,
    caricatoIl: new Date().toISOString()
  };
  try {
    scriviElenco(voci.concat([nuova]));
  } catch (e) {
    // Senza la voce il file non lo userebbe nessuno: via anche lui.
    try { fs.unlinkSync(destinazione); } catch (e2) { /* gia sparito */ }
    throw e;
  }
  return nuova;
}

/**
 * Cancella un font. Se i contenuti lo usano risponde 409 con `usatoIn`,
 * a meno di `forza`: chi conferma sa che quegli usi torneranno al font di
 * partenza dello slot, e alla pulizia successiva spariranno anche dai
 * contenuti (costruisci.pulisciEditor).
 */
function elimina(id, contenuti, opzioni) {
  const forza = !!(opzioni && opzioni.forza);
  if (!RE_ID.test(String(id))) { throw erroreHttp(400, 'Identificativo del font non valido.'); }

  const voci = elencoPerScrivere();
  const trovata = voci.find((v) => v.id === id);
  if (!trovata) { throw erroreHttp(404, 'Questo font non esiste (forse e gia stato cancellato).'); }

  const usi = usatoIn(id, contenuti);
  if (usi.length && !forza) {
    throw erroreHttp(409, 'Il font «' + trovata.etichetta + '» e ancora usato da: ' + usi.join(', ') +
      '. Cambia prima quegli usi, oppure conferma per cancellarlo lo stesso.', { usatoIn: usi });
  }

  // Si scrive prima l'elenco e poi si toglie il file: se il processo muore
  // in mezzo resta un file orfano, che non fa danni, e non una voce che
  // punta al vuoto.
  scriviElenco(voci.filter((v) => v.id !== id));
  try { fs.unlinkSync(percorsoDi(id, trovata.formato)); } catch (e) {
    if (e.code !== 'ENOENT') { throw e; }
  }
  return { id: id, usatoIn: usi };
}

module.exports = {
  elenco, elencoConUso, salva, elimina, esiste, voce, usatoIn,
  formatoDi, pulisciEtichetta, MAX_BYTE, ESTENSIONI
};
