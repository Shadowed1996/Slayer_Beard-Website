'use strict';
/* =====================================================================
   convalida.js — i contenuti contro lo schema (CONTRATTO §7 e §8).

   Restituisce SEMPRE tutti gli errori insieme, mai solo il primo: il
   pannello li appende al campo che li ha causati, e chi corregge vuole
   vedere in una volta tutto quello che non va.

   La chiave dell'errore e la stessa dello schema, cosi il pannello la
   ritrova senza tradurre niente. Per le voci di un elenco si aggiunge
   l'indice fra parentesi quadre:  config.social[3].url
   ===================================================================== */

const schema = require('../../contenuti/schema.js');
const testoricco = require('./testoricco.js');
// Il generatore dell'editor: le regole dei tre rami senza campo nello
// schema stanno lì e non si ricopiano qui (CONTRATTO-4 §8).
const SBStili = require('../../pannello/condivisi/stili.js');

// Estensioni ammesse nei campi immagine: quelle che il sito sa mostrare.
const ESTENSIONI_IMMAGINE = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico', 'gif', 'avif'];
const RE_ORARIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
// Esadecimale a 6 cifre col cancelletto: la forma corta (#abc) non si
// accetta perche il tema.css calcola le sfumature dalle sei cifre.
const RE_COLORE = /^#[0-9a-fA-F]{6}$/;
// Volutamente permissiva: serve a intercettare gli errori di battitura, non
// a decidere se una casella esiste davvero.
const RE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

/* ------------------------------------------------------------------ */
/* CONTROLLI ELEMENTARI                                                */
/* ------------------------------------------------------------------ */

/**
 * URL ammessi dal contratto: http, https, mailto, oppure un percorso
 * relativo. Tutto il resto (javascript:, data:, //altrosito) fuori.
 */
function urlAmmesso(valore) {
  const testo = valore.trim();
  if (testo.startsWith('//')) { return 'Un indirizzo che inizia con // eredita il protocollo della pagina: scrivi https:// per intero.'; }
  const schema2 = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(testo);
  if (!schema2) {
    if (testo.indexOf('\\') !== -1) { return 'Nei percorsi si usa la barra normale /, non la barra rovesciata.'; }
    return null;   // percorso relativo: va bene
  }
  const protocollo = schema2[1].toLowerCase();
  if (protocollo === 'http' || protocollo === 'https') {
    if (!/^https?:\/\/[^/\s]+/.test(testo)) { return 'Indirizzo incompleto: dopo https:// ci vuole almeno il nome del sito.'; }
    return null;
  }
  if (protocollo === 'mailto') {
    return RE_EMAIL.test(testo.slice('mailto:'.length)) ? null : 'Dopo mailto: ci vuole un indirizzo email valido.';
  }
  return 'Protocollo non ammesso: sono accettati solo http, https, mailto e i percorsi relativi.';
}

/**
 * Il catalogo dei caratteri vive in server/lib/tema.js, ed e' l'unica
 * lista buona: qui non se ne tiene una copia, che invecchierebbe da sola.
 * Si carica al primo uso e non all'avvio, e se il modulo non c'e' o e'
 * rotto la convalida NON si blocca: un campo font non controllabile non
 * deve impedire di segnalare tutti gli altri errori del documento.
 */
let catalogoCaricato;      // undefined = mai provato, null = non disponibile
function catalogoFont() {
  if (catalogoCaricato !== undefined) { return catalogoCaricato; }
  try {
    const tema = require('./tema.js');
    catalogoCaricato = (tema && tema.CATALOGO_FONT) || null;
  } catch (e) {
    catalogoCaricato = null;
  }
  return catalogoCaricato;
}

/**
 * La libreria dei font caricati (server/lib/font.js). Stessa regola del
 * catalogo, con una differenza: un'assenza non si ricorda. font.js può
 * arrivare dopo convalida.js (un server aggiornato a pezzi, una prova che
 * lo crea a metà), e ricordare «non c'è» vorrebbe dire rifiutarlo per
 * sempre. Un modulo trovato resta invece in memoria, come ogni require.
 */
let libreriaCaricata = null;
function libreriaFont() {
  if (libreriaCaricata) { return libreriaCaricata; }
  try {
    const font = require('./font.js');
    if (font && typeof font.esiste === 'function') { libreriaCaricata = font; }
  } catch (e) {
    return null;
  }
  return libreriaCaricata;
}

/**
 * Le `opzioni` del generatore condiviso: una famiglia vale se sta in uno
 * qualunque dei tre slot del catalogo (lo stile di un elemento non è legato
 * a uno slot), un font caricato se la libreria lo conosce. Senza catalogo o
 * senza libreria la funzione manca, e il generatore tiene i valori di forma
 * giusta invece di bocciarli alla cieca.
 */
function opzioniStili() {
  const opzioni = {};
  const catalogo = catalogoFont();
  if (catalogo) {
    opzioni.famiglia = (nome) => {
      for (const slot of Object.keys(catalogo)) {
        for (const voce of catalogo[slot] || []) {
          // «Font di sistema» non è un nome da mettere in font-family.
          if (voce && voce.nome === nome && Array.isArray(voce.pesi) && voce.pesi.length) { return voce; }
        }
      }
      return null;
    };
  }
  const libreria = libreriaFont();
  if (libreria && typeof libreria.voce === 'function') {
    opzioni.font = (id) => libreria.voce(id);
  }
  return opzioni;
}

/** I nomi delle famiglie di uno slot, qualunque forma abbiano le voci. */
function famiglieDelloSlot(catalogo, slot) {
  const voci = catalogo[slot];
  if (!Array.isArray(voci)) { return null; }
  return voci.map((voce) => (voce && typeof voce === 'object' ? voce.nome : voce)).filter(Boolean);
}

/**
 * Le «forme»: controlli che non discendono dal tipo del campo ma da che
 * cosa quel testo e. Un Client ID e un `testo` come tanti, ma un testo
 * sbagliato li non si scopre salvando: si scopre quando un visitatore
 * clicca «Collegati con Twitch» e riceve {"status":400,"message":"invalid
 * client"} in faccia, che non dice niente a nessuno.
 *
 * Sono funzioni e non espressioni regolari dichiarate nello schema perche
 * lo schema viaggia in JSON fino al pannello, e una RegExp dentro JSON
 * diventa {} senza dire una parola.
 */
const FORME = {
  /**
   * Il Client ID di un'app Twitch: trenta caratteri, solo minuscole e
   * cifre. La forbice e 25..35 e non 30 fisso perche il formato lo decide
   * Twitch e non noi: rifiutare un ID buono sarebbe peggio che accettarne
   * uno lungo trentuno.
   */
  clientIdTwitch(valore) {
    if (/^[a-z0-9]{25,35}$/.test(valore)) { return null; }
    const coda = ' Lo trovi su dev.twitch.tv/console/apps, nella scheda dell\'applicazione:'
      + ' sono una trentina di caratteri, tutti minuscole e cifre. Il «client secret» invece non va messo qui.';
    if (/[A-Z]/.test(valore)) { return 'un Client ID di Twitch non ha lettere maiuscole.' + coda; }
    if (/\s/.test(valore)) { return 'ci sono spazi in mezzo: probabilmente e stato copiato male.' + coda; }
    if (/[^a-z0-9]/.test(valore)) { return 'un Client ID di Twitch ha solo lettere minuscole e cifre.' + coda; }
    return 'sono ' + valore.length + ' caratteri, e un Client ID di Twitch ne ha una trentina.' + coda;
  }
};

function estensioneDi(percorso) {
  const pulito = percorso.split('?')[0].split('#')[0];
  const punto = pulito.lastIndexOf('.');
  return punto === -1 ? '' : pulito.slice(punto + 1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* UN CAMPO PER VOLTA                                                  */
/* ------------------------------------------------------------------ */

/**
 * Controlla un valore contro la descrizione di un campo.
 * `aggiungi(messaggio)` incassa gli errori: cosi la stessa funzione serve
 * sia per i campi di primo livello sia per quelli dentro un elenco.
 */
function controllaValore(campo, valore, aggiungi, chiave) {
  const etichetta = campo.etichetta || chiave;
  const vuotoAmmesso = campo.facoltativo === true;

  // I tipi composti hanno una forma tutta loro: si trattano a parte.
  if (campo.tipo === 'orari') { return controllaOrari(valore, aggiungi); }
  if (campo.tipo === 'elencoTesti') { return controllaElencoTesti(campo, valore, aggiungi, vuotoAmmesso); }
  if (campo.tipo === 'elenco') { return controllaElenco(campo, valore, aggiungi, chiave); }

  if (campo.tipo === 'numero') {
    if (typeof valore !== 'number' || !isFinite(valore)) { aggiungi('«' + etichetta + '» deve essere un numero.'); return; }
    if (typeof campo.min === 'number' && valore < campo.min) { aggiungi('«' + etichetta + '» non può essere minore di ' + campo.min + '.'); }
    if (typeof campo.max === 'number' && valore > campo.max) { aggiungi('«' + etichetta + '» non può essere maggiore di ' + campo.max + '.'); }
    return;
  }

  // Un interruttore e' un booleano vero. La stringa "true" arriva dai
  // form scritti a mano e nel modello si comporterebbe da "acceso" anche
  // quando dice "false": si rifiuta qui, non dopo.
  if (campo.tipo === 'interruttore') {
    if (typeof valore !== 'boolean') {
      aggiungi('«' + etichetta + '» può valere solo acceso o spento (true o false), non ' + descriviValore(valore) + '.');
    }
    return;
  }

  if (typeof valore !== 'string') { aggiungi('«' + etichetta + '» deve essere un testo.'); return; }

  // Il testo ricco ha una regola sua per il vuoto e per il massimo:
  // contano i caratteri che si leggono, non i tag.
  if (campo.tipo === 'ricco') { return controllaRicco(campo, valore, aggiungi, etichetta, vuotoAmmesso); }

  const testo = valore.trim();
  if (!testo) {
    if (!vuotoAmmesso) { aggiungi('«' + etichetta + '» non può restare vuoto.'); }
    return;
  }
  if (typeof campo.max === 'number' && valore.length > campo.max) {
    aggiungi('«' + etichetta + '» supera i ' + campo.max + ' caratteri: adesso sono ' + valore.length + '.');
  }
  // Un a capo dentro un testo breve finisce quasi sempre in uno spazio
  // strano dentro un attributo HTML: meglio dirlo.
  if (campo.tipo === 'testo' && /[\r\n]/.test(valore)) {
    aggiungi('«' + etichetta + '» deve stare su una riga sola.');
  }

  // La forma dichiarata dallo schema, se c'e. Vale su qualunque tipo di
  // testo e si ferma alla prima: due messaggi sullo stesso campo non
  // aiutano a correggerlo.
  if (campo.forma && FORME[campo.forma]) {
    const guaio = FORME[campo.forma](testo);
    if (guaio) { aggiungi('«' + etichetta + '»: ' + guaio); return; }
  }

  if (campo.tipo === 'url') {
    const guaio = urlAmmesso(testo);
    if (guaio) { aggiungi('«' + etichetta + '»: ' + guaio); }
    return;
  }
  if (campo.tipo === 'email') {
    if (!RE_EMAIL.test(testo)) { aggiungi('«' + etichetta + '» non sembra un indirizzo email valido.'); }
    return;
  }
  if (campo.tipo === 'orario') {
    if (!RE_ORARIO.test(testo)) { aggiungi('«' + etichetta + '» va scritto come HH:MM, per esempio 21:00.'); }
    return;
  }
  if (campo.tipo === 'immagine') {
    const guaio = urlAmmesso(testo);
    if (guaio) { aggiungi('«' + etichetta + '»: ' + guaio); return; }
    const estensione = estensioneDi(testo);
    if (ESTENSIONI_IMMAGINE.indexOf(estensione) === -1) {
      aggiungi('«' + etichetta + '» deve puntare a un\'immagine (' + ESTENSIONI_IMMAGINE.join(', ') + '), non a ".' + estensione + '".');
    }
    return;
  }
  if (campo.tipo === 'colore') {
    if (!RE_COLORE.test(testo)) { aggiungi('«' + etichetta + '»: ' + spiegaColore(testo)); }
    return;
  }
  if (campo.tipo === 'font') {
    controllaFont(campo, testo, aggiungi, etichetta, chiave);
    return;
  }
  if (campo.tipo === 'scelta') {
    // Un'opzione puo essere una stringa secca ('twitch') oppure una coppia
    // { valore, etichetta }, che serve quando quello che si salva non e
    // leggibile da solo: '30' vuol dire «ultimo mese», e nel pannello deve
    // esserci scritto cosi. Qui conta il valore, li conta l'etichetta.
    const opzioni = (campo.opzioni || []).map((o) => (o && typeof o === 'object' ? String(o.valore) : String(o)));
    if (opzioni.indexOf(testo) === -1) {
      aggiungi('«' + etichetta + '» può valere solo: ' + opzioni.join(', ') + '.');
    }
  }
}

/** Come si chiama, in italiano, quello che e' arrivato al posto giusto. */
function descriviValore(valore) {
  if (valore === null || valore === undefined) { return 'niente'; }
  if (Array.isArray(valore)) { return 'un elenco'; }
  if (typeof valore === 'string') { return 'il testo "' + valore.slice(0, 20) + '"'; }
  if (typeof valore === 'number') { return 'il numero ' + valore; }
  if (typeof valore === 'object') { return 'un gruppo di valori'; }
  return 'questo';
}

/**
 * Testo ricco: prima il conto dei caratteri VISIBILI (i tag non si
 * contano, altrimenti bastano tre grassetti per sforare un limite), poi
 * l'elenco dei problemi che il sanificatore ha davvero incontrato.
 */
function controllaRicco(campo, valore, aggiungi, etichetta, vuotoAmmesso) {
  const visibile = testoricco.soloTesto(valore);

  if (!visibile) {
    // Un campo con dentro solo tag e' vuoto per chi legge la pagina:
    // vale la stessa regola degli altri campi.
    if (!vuotoAmmesso) { aggiungi('«' + etichetta + '» non può restare vuoto.'); }
    else if (valore.trim()) { aggiungi('«' + etichetta + '» contiene solo formattazione e nessun testo da leggere.'); }
    return;
  }
  if (typeof campo.max === 'number' && visibile.length > campo.max) {
    aggiungi('«' + etichetta + '» supera i ' + campo.max + ' caratteri: adesso sono ' + visibile.length
      + ' (si contano le lettere che si leggono, non la formattazione).');
  }
  for (const guaio of testoricco.problemi(valore, { etichetta: etichetta })) { aggiungi(guaio); }
}

/** Gli errori di battitura tipici di un colore, spiegati uno per uno. */
function spiegaColore(testo) {
  const coda = ' Un colore si scrive così: #8b2fff.';
  if (/^[0-9a-fA-F]{6}$/.test(testo)) { return 'manca il cancelletto davanti.' + coda; }
  if (/^#[0-9a-fA-F]{3}$/.test(testo)) { return 'la forma corta a tre cifre non basta, va scritta per esteso.' + coda; }
  if (/^#[0-9a-fA-F]{8}$/.test(testo)) { return 'le otto cifre (con la trasparenza) non si possono usare qui.' + coda; }
  if (/^(rgb|rgba|hsl|hsla)\s*\(/i.test(testo)) { return 'qui ci vuole l\'esadecimale, non rgb() o hsl().' + coda; }
  if (/^#/.test(testo)) { return 'dopo il cancelletto ci vogliono sei cifre da 0 a 9 o lettere da A a F.' + coda; }
  return 'non è un colore.' + coda;
}

/**
 * Il carattere deve stare nel catalogo di tema.js, e nello slot giusto:
 * un font da titoli scelto per la strumentazione non e' una svista da
 * lasciar passare, e' un sito con il monospazio che non e' monospazio.
 */
function controllaFont(campo, testo, aggiungi, etichetta, chiave) {
  // Il nome finisce dentro css/tema.css: questi caratteri uscirebbero
  // dalla dichiarazione. Si rifiutano sempre, catalogo o no.
  if (/[<>"'{};\\]/.test(testo) || /[\u0000-\u001f]/.test(testo)) {
    aggiungi('«' + etichetta + '»: il nome di un carattere può contenere solo lettere, numeri e spazi.');
    return;
  }

  // Un font caricato dal pannello (CONTRATTO-4 §4.4): vale in qualunque
  // slot, purché il file esista ancora.
  if (testo.startsWith('caricato:')) {
    controllaFontCaricato(testo.slice('caricato:'.length), aggiungi, etichetta);
    return;
  }

  const slot = campo.slot;
  if (!slot) {
    aggiungi('«' + etichetta + '»: lo schema non dice a quale dei tre caratteri del sito appartiene questo campo'
      + ' (titolo, testo o mono). Va aggiunto "slot" alla riga "' + chiave + '" in contenuti/schema.js.');
    return;
  }

  const catalogo = catalogoFont();
  if (!catalogo) { return; }        // catalogo non disponibile: non si blocca il resto

  const famiglie = famiglieDelloSlot(catalogo, slot);
  if (!famiglie) {
    aggiungi('«' + etichetta + '»: il catalogo dei caratteri non ha nessuna voce per "' + slot + '".');
    return;
  }
  if (famiglie.indexOf(testo) === -1) {
    aggiungi('«' + etichetta + '»: "' + testo + '" non è fra i caratteri disponibili per questo posto. Si può scegliere fra: '
      + famiglie.join(', ') + '.');
  }
}

function controllaFontCaricato(id, aggiungi, etichetta) {
  if (!/^[0-9a-f]{16}$/.test(id)) {
    aggiungi('«' + etichetta + '»: il riferimento al font caricato non è valido. Sceglilo di nuovo dall\'elenco dei font.');
    return;
  }
  const libreria = libreriaFont();
  // Senza libreria non si può sapere se il file c'è: come per il catalogo,
  // un controllo impossibile non blocca il salvataggio del resto.
  if (!libreria) { return; }
  let esiste = false;
  try { esiste = libreria.esiste(id) === true; } catch (e) { esiste = false; }
  if (!esiste) {
    aggiungi('«' + etichetta + '»: il font caricato scelto qui non c\'è più. Scegline un altro o caricalo di nuovo dalle Impostazioni del sito.');
  }
}

function controllaOrari(valore, aggiungi) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) {
    aggiungi('Gli orari devono essere un oggetto con giorni, ora, fuso e durataOre.');
    return;
  }
  if (!Array.isArray(valore.giorni) || valore.giorni.length === 0) {
    aggiungi('Serve almeno un giorno di diretta.');
  } else {
    const visti = new Set();
    for (const giorno of valore.giorni) {
      if (!Number.isInteger(giorno) || giorno < 0 || giorno > 6) {
        aggiungi('I giorni vanno indicati con un numero da 0 (domenica) a 6 (sabato): "' + giorno + '" non va bene.');
        continue;
      }
      if (visti.has(giorno)) { aggiungi('Il giorno ' + GIORNI[giorno] + ' è ripetuto due volte.'); }
      visti.add(giorno);
    }
  }
  if (typeof valore.ora !== 'string' || !RE_ORARIO.test(valore.ora.trim())) {
    aggiungi('L\'ora delle dirette va scritta come HH:MM, per esempio 21:00.');
  }
  if (typeof valore.fuso !== 'string' || !valore.fuso.trim()) {
    aggiungi('Manca il fuso orario, per esempio Europe/Rome.');
  } else {
    // Un fuso inesistente farebbe esplodere il conto alla rovescia nel
    // browser del visitatore: meglio scoprirlo qui.
    try { new Intl.DateTimeFormat('it-IT', { timeZone: valore.fuso }); }
    catch (e) { aggiungi('Il fuso orario "' + valore.fuso + '" non esiste: usa un nome come Europe/Rome.'); }
  }
  if (typeof valore.durataOre !== 'number' || !isFinite(valore.durataOre) || valore.durataOre <= 0 || valore.durataOre > 24) {
    aggiungi('La durata di una diretta va indicata in ore, fra 1 e 24.');
  }
}

function controllaElencoTesti(campo, valore, aggiungi, vuotoAmmesso) {
  if (!Array.isArray(valore)) { aggiungi('«' + campo.etichetta + '» deve essere un elenco di testi.'); return; }
  if (!valore.length && !vuotoAmmesso) { aggiungi('«' + campo.etichetta + '» non può restare vuoto.'); return; }
  for (let i = 0; i < valore.length; i++) {
    if (typeof valore[i] !== 'string' || !valore[i].trim()) {
      aggiungi('«' + campo.etichetta + '»: la voce numero ' + (i + 1) + ' è vuota o non è un testo.');
    }
  }
}

function controllaElenco(campo, valore, aggiungi, chiave) {
  if (!Array.isArray(valore)) { aggiungi('«' + campo.etichetta + '» deve essere un elenco di voci.'); return null; }
  return valore;   // le voci le percorre chi ha il raccoglitore degli errori
}

/* ------------------------------------------------------------------ */
/* I RAMI DELL'EDITOR (CONTRATTO-4 §6.5, §8)                           */
/* ------------------------------------------------------------------ */

/*
   config.sezioni, config.stili e config.disposizione arrivano qui GIÀ
   ripuliti da pulisciSezioni / pulisciStili / pulisciDisposizione: un
   valore sbagliato lì si scarta e non blocca il salvataggio del resto.
   Qui si controlla solo che la forma rimasta sia quella pulita. Un errore
   vuol dire che qualcuno ha saltato la pulizia (un file scritto a mano,
   una rotta nuova), e allora è giusto fermarsi e dirlo.

   Un ramo assente non è un errore: un contenuti.json di prima
   dell'editor, o una copia di sicurezza vecchia, deve potersi ripristinare
   e dà la pagina di sempre.
*/

function propria(oggetto, chiave) {
  return Object.prototype.hasOwnProperty.call(oggetto, chiave);
}

function oggettoSemplice(valore) {
  return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
}

/** Uguaglianza profonda; l'ordine delle chiavi di un oggetto non conta. */
function uguali(a, b) {
  if (a === b) { return true; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { return false; }
    return a.every((voce, i) => uguali(voce, b[i]));
  }
  if (!oggettoSemplice(a) || !oggettoSemplice(b)) { return false; }
  const chiaviA = Object.keys(a);
  if (chiaviA.length !== Object.keys(b).length) { return false; }
  return chiaviA.every((k) => propria(b, k) && uguali(a[k], b[k]));
}

function controllaSezioni(valore, aggiungi) {
  if (!Array.isArray(valore)) {
    aggiungi('L\'ordine delle sezioni deve essere un elenco.');
    return;
  }
  const ammesse = SBStili.SEZIONI_ORDINABILI;
  const viste = new Set();
  valore.forEach((voce, i) => {
    const numero = 'la voce numero ' + (i + 1);
    if (!oggettoSemplice(voce)) { aggiungi('Nell\'ordine delle sezioni ' + numero + ' non è una sezione.'); return; }
    const altre = Object.keys(voce).filter((k) => k !== 'id' && k !== 'attiva');
    if (altre.length) { aggiungi('Nell\'ordine delle sezioni ' + numero + ' ha dati in più: ' + altre.join(', ') + '.'); }
    if (ammesse.indexOf(voce.id) === -1) {
      aggiungi('Nell\'ordine delle sezioni ' + numero + ' non è una sezione che si può spostare (sono: ' + ammesse.join(', ') + ').');
      return;
    }
    if (viste.has(voce.id)) { aggiungi('La sezione «' + voce.id + '» compare due volte nell\'ordine delle sezioni.'); }
    viste.add(voce.id);
    if (typeof voce.attiva !== 'boolean') { aggiungi('La sezione «' + voce.id + '» deve essere accesa o spenta (true o false).'); }
  });
  const mancanti = ammesse.filter((id) => !viste.has(id));
  if (mancanti.length) {
    aggiungi('Nell\'ordine delle sezioni mancano: ' + mancanti.join(', ') + '. Una sezione si spegne, non si toglie dall\'elenco.');
  }
  const prima = valore[0];
  if (!oggettoSemplice(prima) || prima.id !== 'regia' || prima.attiva !== true) {
    aggiungi('La regia è la copertina con l\'unico titolo principale: deve restare la prima sezione, ed essere accesa.');
  }
}

/* Il player (CONTRATTO-3 §3.4) non si spegne lasciandolo acceso per Twitch:
   ogni proprietà vietata ha il suo perché, detto a chi amministra. */
const MOTIVI_PROTETTI = {
  nascosto: 'il player di Twitch non si nasconde',
  opacita: 'il player di Twitch non si rende trasparente',
  larghezzaMax: 'il player di Twitch non si rimpicciolisce',
  margine: 'il player di Twitch non si rimpicciolisce e non si copre',
  riempimento: 'il player di Twitch non si rimpicciolisce'
};

/* I lati che sui protetti escono da SBStili.LATI_PROTETTI, per nome. I numeri
   stanno solo lì (li legge anche la scheda Stile): qui si costruisce la
   frase. Il messaggio dice quali lati, così chi amministra non deve
   indovinare quale dei quattro cursori ha sbagliato. */
function latiFuori(valore, limiti) {
  if (!oggettoSemplice(valore) || !limiti) { return []; }
  return ['sopra', 'destra', 'sotto', 'sinistra'].filter((lato) => typeof valore[lato] === 'number'
    && ((limiti.min !== undefined && valore[lato] < limiti.min) || (limiti.max !== undefined && valore[lato] > limiti.max)));
}

function regolaLati(proprieta, limiti) {
  const nome = proprieta === 'riempimento' ? 'il riempimento' : 'il margine';
  if (limiti.min !== undefined && limiti.max !== undefined) { return nome + ' qui deve stare fra ' + limiti.min + ' e ' + limiti.max + ' px'; }
  if (limiti.min !== undefined) { return nome + ' qui non può andare sotto ' + limiti.min; }
  return nome + ' qui non può superare ' + limiti.max + ' px';
}

function controllaStili(valore, aggiungiSu) {
  const aggiungi = aggiungiSu('config.stili');
  if (!oggettoSemplice(valore)) {
    aggiungi('Gli stili degli elementi devono essere un gruppo di valori, uno per elemento.');
    return;
  }
  const bersagli = Object.keys(valore);
  if (bersagli.length > SBStili.MAX_BERSAGLI) {
    aggiungi('Ci sono stili per ' + bersagli.length + ' elementi: il massimo è ' + SBStili.MAX_BERSAGLI + '.');
  }
  const opzioni = opzioniStili();
  const nomi = SBStili.PROPRIETA.map((p) => p.nome);

  for (const id of bersagli) {
    // La chiave dell'errore porta il bersaglio: il pannello ci ritrova
    // l'elemento da selezionare nell'anteprima.
    const suQuesto = aggiungiSu('config.stili.' + id);
    if (!SBStili.leggiBersaglio(id)) { suQuesto('«' + id + '» non è un elemento della pagina a cui si può dare uno stile.'); continue; }
    const voce = valore[id];
    if (!oggettoSemplice(voce)) { suQuesto('Lo stile di «' + id + '» deve essere diviso per dispositivo.'); continue; }
    const dispositivi = Object.keys(voce);
    if (!dispositivi.length) { suQuesto('Lo stile di «' + id + '» è vuoto: un elemento senza stile non si salva.'); continue; }

    for (const dispositivo of dispositivi) {
      if (SBStili.DISPOSITIVI.indexOf(dispositivo) === -1) {
        suQuesto('Lo stile di «' + id + '» ha il dispositivo sconosciuto «' + dispositivo + '» (sono: ' + SBStili.DISPOSITIVI.join(', ') + ').');
        continue;
      }
      const valori = voce[dispositivo];
      if (!oggettoSemplice(valori) || !Object.keys(valori).length) {
        suQuesto('Lo stile di «' + id + '» su ' + dispositivo + ' è vuoto: un dispositivo senza valori non si salva.');
        continue;
      }
      for (const proprieta of Object.keys(valori)) {
        const dove = '«' + id + '», ' + dispositivo + ', ';
        if (nomi.indexOf(proprieta) === -1) { suQuesto(dove + 'la proprietà «' + proprieta + '» non esiste.'); continue; }
        if (SBStili.PROTETTI.indexOf(id) !== -1) {
          if (SBStili.VIETATE_AI_PROTETTI.indexOf(proprieta) !== -1) {
            suQuesto(dove + '«' + proprieta + '» non si può usare qui: ' + (MOTIVI_PROTETTI[proprieta] || MOTIVI_PROTETTI.nascosto) + '.');
            continue;
          }
          const limiti = propria(SBStili.LATI_PROTETTI, proprieta) ? SBStili.LATI_PROTETTI[proprieta] : null;
          const lati = latiFuori(valori[proprieta], limiti);
          if (lati.length) {
            suQuesto(dove + regolaLati(proprieta, limiti) + ' (lati: ' + lati.join(', ') + '): '
              + (MOTIVI_PROTETTI[proprieta] || MOTIVI_PROTETTI.larghezzaMax) + '.');
            continue;
          }
        }
        const pulito = SBStili.pulisciValore(id, proprieta, valori[proprieta], opzioni);
        if (pulito === null) { suQuesto(dove + 'il valore di «' + proprieta + '» non è ammesso.'); continue; }
        if (!uguali(pulito, valori[proprieta])) { suQuesto(dove + 'il valore di «' + proprieta + '» è fuori dai limiti o scritto in una forma non pulita.'); continue; }
        if (proprieta === 'nascosto' && dispositivo === 'computer' && valori[proprieta] === false) {
          suQuesto(dove + '«nascosto: false» su computer è già il comportamento normale e non si salva.');
        }
      }
    }
  }
}

function controllaDisposizione(valore, aggiungi) {
  if (!oggettoSemplice(valore)) {
    aggiungi('La disposizione dei blocchi deve essere un gruppo di valori con dentro «blocchi».');
    return;
  }
  const altre = Object.keys(valore).filter((k) => k !== 'blocchi');
  if (altre.length) { aggiungi('La disposizione dei blocchi ha dati sconosciuti: ' + altre.join(', ') + '.'); }
  const blocchi = valore.blocchi;
  if (!oggettoSemplice(blocchi)) {
    aggiungi('La disposizione dei blocchi deve avere «blocchi», un gruppo di elenchi per riquadro.');
    return;
  }
  const pulita = SBStili.pulisciDisposizione(valore).blocchi;
  for (const riquadro of Object.keys(blocchi)) {
    if (SBStili.RIQUADRI.indexOf(riquadro) === -1) {
      aggiungi('«' + riquadro + '» non è un riquadro in cui si possono spostare blocchi (sono: ' + SBStili.RIQUADRI.join(', ') + ').');
      continue;
    }
    const elenco = blocchi[riquadro];
    if (!Array.isArray(elenco)) { aggiungi('I blocchi del riquadro «' + riquadro + '» devono essere un elenco.'); continue; }
    if (uguali(elenco, pulita[riquadro])) { continue; }
    // Qualcosa non torna: si dice quale voce, invece di un «non va» generico.
    const visti = new Set();
    let segnalati = 0;
    const segnala = (messaggio) => { segnalati++; aggiungi(messaggio); };
    elenco.forEach((voce, i) => {
      const numero = 'nel riquadro «' + riquadro + '» il blocco numero ' + (i + 1);
      if (!oggettoSemplice(voce) || typeof voce.id !== 'string') { segnala('Nella disposizione, ' + numero + ' non ha un nome.'); return; }
      if (SBStili.leggiBersaglio('blocco:' + voce.id) === null || voce.id.split('.')[0] !== riquadro) {
        segnala('Nella disposizione, ' + numero + ' («' + voce.id + '») non appartiene a questo riquadro.');
        return;
      }
      if (visti.has(voce.id)) { segnala('Nella disposizione, il blocco «' + voce.id + '» compare due volte.'); return; }
      visti.add(voce.id);
      const attesa = pulita[riquadro].filter((p) => p.id === voce.id)[0];
      if (!attesa) { return; }        // oltre il tetto dei blocchi: lo dice il controllo qui sotto
      if (!uguali(voce, attesa)) {
        segnala('Nella disposizione, la posizione del blocco «' + voce.id + '» non è nella forma pulita: servono telefono, tablet e computer, ciascuno vuoto o con x, y, l, a dentro i limiti.');
      }
    });
    if (!segnalati) {
      aggiungi('Il riquadro «' + riquadro + '» ha più blocchi di quanti se ne possano posizionare (' + pulita[riquadro].length + ').');
    }
  }
}

/** I tre rami dell'editor, ciascuno se c'è. */
function controllaEditor(contenuti, aggiungiSu) {
  const config = contenuti.config;
  if (propria(config, 'sezioni')) { controllaSezioni(config.sezioni, aggiungiSu('config.sezioni')); }
  if (propria(config, 'stili')) { controllaStili(config.stili, aggiungiSu); }
  if (propria(config, 'disposizione')) { controllaDisposizione(config.disposizione, aggiungiSu('config.disposizione')); }
}

/* ------------------------------------------------------------------ */
/* TUTTO IL DOCUMENTO                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convalida i contenuti contro lo schema.
 * Ritorna un elenco di { chiave, messaggio }, vuoto se va tutto bene.
 */
function convalida(contenuti) {
  const errori = [];
  const aggiungiSu = (chiave) => (messaggio) => errori.push({ chiave: chiave, messaggio: messaggio });

  if (!contenuti || typeof contenuti !== 'object') {
    return [{ chiave: '', messaggio: 'I contenuti devono essere un oggetto con "testi" e "config".' }];
  }
  if (!contenuti.testi || typeof contenuti.testi !== 'object' || Array.isArray(contenuti.testi)) {
    errori.push({ chiave: 'testi', messaggio: 'Manca l\'oggetto "testi".' });
  }
  if (!contenuti.config || typeof contenuti.config !== 'object' || Array.isArray(contenuti.config)) {
    errori.push({ chiave: 'config', messaggio: 'Manca l\'oggetto "config".' });
  }
  if (errori.length) { return errori; }

  controllaEditor(contenuti, aggiungiSu);

  for (const campo of schema.campi()) {
    const esito = schema.valoreDi(contenuti, campo.chiave);
    if (!esito.trovato) {
      errori.push({ chiave: campo.chiave, messaggio: '«' + campo.etichetta + '» non c\'è più nei contenuti: non va tolta, al massimo lasciata vuota.' });
      continue;
    }

    const voci = controllaValore(campo, esito.valore, aggiungiSu(campo.chiave), campo.chiave);
    if (campo.tipo !== 'elenco' || !Array.isArray(voci)) { continue; }

    // Voci dell'elenco: stessa storia, con la chiave indicizzata.
    const chiaviVoce = new Set();
    for (let i = 0; i < voci.length; i++) {
      const voce = voci[i];
      const prefisso = campo.chiave + '[' + i + ']';
      if (!voce || typeof voce !== 'object' || Array.isArray(voce)) {
        errori.push({ chiave: prefisso, messaggio: 'La voce numero ' + (i + 1) + ' di «' + campo.etichetta + '» non è compilata.' });
        continue;
      }
      for (const sottocampo of campo.campi || []) {
        const chiave = prefisso + '.' + sottocampo.chiave;
        if (!Object.prototype.hasOwnProperty.call(voce, sottocampo.chiave)) {
          errori.push({ chiave: chiave, messaggio: 'Alla voce numero ' + (i + 1) + ' manca «' + sottocampo.etichetta + '».' });
          continue;
        }
        controllaValore(sottocampo, voce[sottocampo.chiave], aggiungiSu(chiave), chiave);
      }
      // La chiave interna distingue le voci fra loro: se si ripete, due voci
      // diventano indistinguibili nei backup e nei confronti.
      const interna = typeof voce.chiave === 'string' ? voce.chiave.trim() : '';
      if (interna) {
        if (chiaviVoce.has(interna)) {
          errori.push({ chiave: prefisso + '.chiave', messaggio: 'Il nome interno "' + interna + '" è già usato da un\'altra voce di «' + campo.etichetta + '».' });
        }
        chiaviVoce.add(interna);
      }
    }
  }

  return errori;
}

/** Le stesse regole, ma su un valore solo: serve al pannello per il salvataggio parziale. */
function convalidaCampo(chiave, valore) {
  // I rami dell'editor non sono campi, ma il salvataggio parziale li manda lo stesso.
  if ((schema.EDITOR || []).indexOf(chiave) !== -1) {
    const errori = [];
    const aggiungiSu = (dove) => (m) => errori.push({ chiave: dove, messaggio: m });
    controllaEditor({ config: { [chiave.slice('config.'.length)]: valore } }, aggiungiSu);
    return errori;
  }
  const campo = schema.campo(chiave);
  if (!campo) { return [{ chiave: chiave, messaggio: 'Il campo "' + chiave + '" non esiste nello schema.' }]; }
  const errori = [];
  controllaValore(campo, valore, (m) => errori.push({ chiave: chiave, messaggio: m }), chiave);
  return errori;
}

/** Riassunto in una riga sola, per il terminale. */
function riassumi(errori) {
  if (!errori.length) { return 'nessun errore'; }
  return errori.length === 1 ? '1 errore' : errori.length + ' errori';
}

module.exports = { convalida, convalidaCampo, urlAmmesso, riassumi, RE_ORARIO, RE_EMAIL };
