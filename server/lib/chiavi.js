'use strict';
/* =====================================================================
   chiavi.js — l'unico posto in cui stanno le chiavi.

   Prima erano sparse: il Client ID di Twitch scritto nel pannello e
   quindi in contenuti/contenuti.json, e di nuovo — insieme al secret —
   in un file suo per il server. Due copie dello stesso valore sono due
   cose che prima o poi smettono di essere d'accordo, e quella sbagliata
   sarebbe stata quella che parla a Twitch.

   Adesso si scrivono una volta in server/dati/chiavi.js e le legge da li
   chiunque ne abbia bisogno. Il modello da copiare, con le istruzioni
   dentro, e server/modelli/chiavi.esempio.js.

   PERCHE UN .js E NON UN .json. Perche un file di configurazione che si
   compila a mano ha bisogno di commenti, e JSON non li ammette: senza,
   chi lo apre fra sei mesi trova due stringhe vuote e nessuna idea di
   cosa infilarci. Il prezzo e che il file viene eseguito, quindi qui
   sotto si controlla la forma di cio che esporta invece di fidarsi.

   NON SI CARICA ONLINE E NON STA NEL CONTROLLO DI VERSIONE. Vale per
   tutta server/dati/, che contiene anche l'hash della password del
   pannello. La password NON e finita qui dentro apposta: non e una
   chiave da copiare, e un hash scrypt che scrive imposta-password.js, e
   metterla in un file che si apre con l'editor sarebbe un invito a
   scriverla in chiaro.
   ===================================================================== */

const fs = require('node:fs');

const { P } = require('./percorsi');

/** Stringa ripulita, o vuota se non e una stringa. */
function testo(valore) {
  return typeof valore === 'string' ? valore.trim() : '';
}

/**
 * Le chiavi, nella forma garantita { twitch: { clientId, clientSecret } }.
 * Ritorna sempre un oggetto: i campi mancanti sono stringhe vuote, cosi
 * chi legge non deve controllare tre livelli di annidamento ogni volta.
 *
 * Lancia solo se il file c'e ma e rotto — un file assente e la
 * condizione normale di chi non ha configurato niente, e non e un errore.
 */
function leggi() {
  const vuote = { twitch: { clientId: '', clientSecret: '' } };

  if (!fs.existsSync(P.chiavi)) { return vuote; }

  let modulo;
  try {
    // Si butta la cache prima di leggere: il server sta acceso per ore e
    // chi cambia una chiave si aspetta che al giro dopo valga quella
    // nuova, non quella che require ha memorizzato all'avvio.
    delete require.cache[require.resolve(P.chiavi)];
    modulo = require(P.chiavi);
  } catch (errore) {
    throw new Error('server/dati/chiavi.js non si legge: ' + errore.message +
      '\n  Confrontalo con server/modelli/chiavi.esempio.js: dev essere un file JavaScript' +
      '\n  che fa module.exports = { twitch: { clientId: "...", clientSecret: "..." } }.');
  }

  if (!modulo || typeof modulo !== 'object' || Array.isArray(modulo)) {
    throw new Error('server/dati/chiavi.js non esporta un oggetto: controlla che finisca con module.exports = { ... }.');
  }

  const twitch = (modulo.twitch && typeof modulo.twitch === 'object') ? modulo.twitch : {};
  return { twitch: { clientId: testo(twitch.clientId), clientSecret: testo(twitch.clientSecret) } };
}

/**
 * Il Client ID dell'app Twitch.
 *
 * E l'unico valore di questo file che finisce anche nella pagina: e
 * pubblico per natura — il browser deve mandarlo a Twitch per il login —
 * e sta qui solo perche stia insieme al suo secret, non perche vada
 * protetto. Il secret, quello, non esce mai da server/.
 */
function clientId() {
  try { return leggi().twitch.clientId; } catch (e) { return ''; }
}

/** La coppia completa, o null se ne manca una: e cio che serve all'app token. */
function twitchComplete() {
  const chiavi = leggi();
  if (!chiavi.twitch.clientId || !chiavi.twitch.clientSecret) { return null; }
  return { clientId: chiavi.twitch.clientId, clientSecret: chiavi.twitch.clientSecret };
}

/** Vero se c'e almeno il Client ID: basta al login del sito. */
function configurato() {
  try { return clientId() !== ''; } catch (e) { return false; }
}

/** Il testo del file, pronto da scrivere, con le istruzioni dentro. */
function componi(valori) {
  const dati = valori || {};
  const twitch = (dati.twitch && typeof dati.twitch === 'object') ? dati.twitch : {};
  const cita = (v) => JSON.stringify(testo(v));

  return [
    "'use strict';",
    '/* =====================================================================',
    '   chiavi.js — le chiavi di questo sito, tutte qui dentro.',
    '',
    '   Scritto da server/imposta-twitch.js, ma si puo anche modificare a',
    '   mano: e un normale file JavaScript.',
    '',
    '   NON VA CARICATO ONLINE e non va messo nel controllo di versione.',
    '   Il .gitignore lo esclude gia.',
    '   ===================================================================== */',
    '',
    'module.exports = {',
    '  // L\'app Twitch, una sola: le due chiavi escono dalla stessa scheda su',
    '  // https://dev.twitch.tv/console/apps',
    '  twitch: {',
    '    // Pubblico per natura: finisce nella pagina, perche il browser deve',
    '    // mandarlo a Twitch per il login. Alla pubblicazione viene copiato',
    '    // da se nel campo «Client ID» del pannello.',
    '    clientId: ' + cita(twitch.clientId) + ',',
    '',
    '    // SEGRETO: non esce mai da questa cartella. Serve al server locale',
    '    // per prendere un app token e chiedere a Twitch il titolo',
    '    // dell\'ultima diretta e le clip. Si rigenera con «New Secret».',
    '    clientSecret: ' + cita(twitch.clientSecret),
    '  }',
    '};',
    ''
  ].join('\n');
}

/**
 * Porta il Client ID di chiavi.js dentro a contenuti.json.
 *
 * E il passaggio che fa di questo file l'unica sorgente: il browser ha
 * bisogno del Client ID dentro la pagina, e la pagina si costruisce da
 * contenuti.json. Invece di chiedere a chi amministra di scriverlo due
 * volte — qui e nel pannello — lo si copia alla pubblicazione, come si fa
 * gia con il titolo dell'ultima diretta.
 *
 * Le regole sono quelle di tutto il resto:
 *   - non lancia mai, e non svuota mai il valore che c'e gia. Senza il
 *     file, o senza Client ID dentro, il campo del pannello resta quello
 *     che era e chi non usa chiavi.js non si accorge di niente;
 *   - se il valore e identico non riscrive contenuti.json, cosi non si
 *     timbra aggiornatoIl a ogni pubblicazione per niente.
 *
 * Stati: spento (niente file), invariato, copiato, fallito.
 */
function sincronizzaClientId() {
  let daFile;
  try {
    daFile = leggi().twitch.clientId;
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!daFile) { return { stato: 'spento' }; }

  const archivio = require('./archivio');
  let documento;
  try {
    documento = archivio.leggi();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const account = (documento.config && documento.config.account) || {};
  const precedente = testo(account.clientId);
  if (precedente === daFile) { return { stato: 'invariato', clientId: daFile }; }

  try {
    if (!documento.config.account || typeof documento.config.account !== 'object') { documento.config.account = {}; }
    documento.config.account.clientId = daFile;
    archivio.salva(documento);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'copiato', clientId: daFile, precedente: precedente };
}

/** Il resoconto in una riga, per il terminale e per il pannello. */
function racconta(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return '';
    case 'invariato':
      return '';
    case 'copiato':
      return 'Client ID: copiato da server/dati/chiavi.js nel campo del pannello.';
    case 'fallito':
      return 'Chiavi: non sono riuscito a leggerle (' + esito.motivo + '). Tengo quello che c era.';
    default:
      return '';
  }
}

module.exports = { leggi, clientId, twitchComplete, configurato, componi, sincronizzaClientId, racconta };
