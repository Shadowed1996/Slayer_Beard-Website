'use strict';

const schema = require('../../contenuti/schema.js');
const testoricco = require('./testoricco.js');

const SBStili = require('../../pannello/condivisi/stili.js');

const SBOrari = require('../../pannello/condivisi/orari.js');

const ESTENSIONI_IMMAGINE = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico', 'gif', 'avif'];
const RE_ORARIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const RE_DATAORA = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

const RE_COLORE = /^#[0-9a-fA-F]{6}$/;

const RE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function urlAmmesso(valore) {
  const testo = valore.trim();
  if (testo.startsWith('//')) { return 'Un indirizzo che inizia con // eredita il protocollo della pagina: scrivi https:// per intero.'; }
  const schema2 = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(testo);
  if (!schema2) {
    if (testo.indexOf('\\') !== -1) { return 'Nei percorsi si usa la barra normale /, non la barra rovesciata.'; }
    return null;
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

let catalogoCaricato;
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

function opzioniStili() {
  const opzioni = {};
  const catalogo = catalogoFont();
  if (catalogo) {
    opzioni.famiglia = (nome) => {
      for (const slot of Object.keys(catalogo)) {
        for (const voce of catalogo[slot] || []) {
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

function famiglieDelloSlot(catalogo, slot) {
  const voci = catalogo[slot];
  if (!Array.isArray(voci)) { return null; }
  return voci.map((voce) => (voce && typeof voce === 'object' ? voce.nome : voce)).filter(Boolean);
}

const FORME = {
  clientIdTwitch(valore) {
    if (/^[a-z0-9]{25,35}$/.test(valore)) { return null; }
    const coda = ' Lo trovi su dev.twitch.tv/console/apps, nella scheda dell\'applicazione:'
      + ' sono una trentina di caratteri, tutti minuscole e cifre. Il «client secret» invece non va messo qui.';
    if (/[A-Z]/.test(valore)) { return 'un Client ID di Twitch non ha lettere maiuscole.' + coda; }
    if (/\s/.test(valore)) { return 'ci sono spazi in mezzo: probabilmente e stato copiato male.' + coda; }
    if (/[^a-z0-9]/.test(valore)) { return 'un Client ID di Twitch ha solo lettere minuscole e cifre.' + coda; }
    return 'sono ' + valore.length + ' caratteri, e un Client ID di Twitch ne ha una trentina.' + coda;
  },

  fileAudio(valore) {
    return guaioFileAudio(valore);
  }
};

const ESTENSIONI_AUDIO = ['mp3', 'ogg', 'wav', 'm4a'];

function guaioFileAudio(valore) {
  const testo = typeof valore === 'string' ? valore.trim() : '';
  if (!testo) { return 'manca il nome del file della canzone.'; }
  if (/[\u0000-\u001f\u007f]/.test(testo)) { return 'il nome del file contiene caratteri invisibili: riscrivilo a mano.'; }
  if (/[/\\]/.test(testo)) { return 'scrivi solo il nome del file, senza cartelle né barre: il file va caricato direttamente nella cartella «mp3» del sito.'; }
  if (testo.indexOf('..') !== -1) { return 'il nome del file non può contenere due punti di fila («..»).'; }
  const punto = testo.lastIndexOf('.');
  const estensione = punto > 0 ? testo.slice(punto + 1).toLowerCase() : '';
  if (ESTENSIONI_AUDIO.indexOf(estensione) === -1) {
    return 'il file deve essere una canzone .mp3, .ogg, .wav o .m4a' + (estensione ? ', non «.' + estensione + '».' : ': manca l\'estensione.');
  }
  return null;
}

function estensioneDi(percorso) {
  const pulito = percorso.split('?')[0].split('#')[0];
  const punto = pulito.lastIndexOf('.');
  return punto === -1 ? '' : pulito.slice(punto + 1).toLowerCase();
}

function controllaValore(campo, valore, aggiungi, chiave) {
  const etichetta = campo.etichetta || chiave;
  const vuotoAmmesso = campo.facoltativo === true;

  if (campo.tipo === 'orari') { return controllaOrari(valore, aggiungi, chiave); }
  if (campo.tipo === 'elencoTesti') { return controllaElencoTesti(campo, valore, aggiungi, vuotoAmmesso); }
  if (campo.tipo === 'elenco') { return controllaElenco(campo, valore, aggiungi, chiave); }

  if (campo.tipo === 'numero') {
    if (typeof valore !== 'number' || !isFinite(valore)) { aggiungi('«' + etichetta + '» deve essere un numero.'); return; }
    if (typeof campo.min === 'number' && valore < campo.min) { aggiungi('«' + etichetta + '» non può essere minore di ' + campo.min + '.'); }
    if (typeof campo.max === 'number' && valore > campo.max) { aggiungi('«' + etichetta + '» non può essere maggiore di ' + campo.max + '.'); }
    return;
  }

  if (campo.tipo === 'interruttore') {
    if (typeof valore !== 'boolean') {
      aggiungi('«' + etichetta + '» può valere solo acceso o spento (true o false), non ' + descriviValore(valore) + '.');
    }
    return;
  }

  if (typeof valore !== 'string') { aggiungi('«' + etichetta + '» deve essere un testo.'); return; }

  if (campo.tipo === 'ricco') { return controllaRicco(campo, valore, aggiungi, etichetta, vuotoAmmesso); }

  const testo = valore.trim();
  if (!testo) {
    if (!vuotoAmmesso) { aggiungi('«' + etichetta + '» non può restare vuoto.'); }
    return;
  }
  if (typeof campo.max === 'number' && valore.length > campo.max) {
    aggiungi('«' + etichetta + '» supera i ' + campo.max + ' caratteri: adesso sono ' + valore.length + '.');
  }

  if (campo.tipo === 'testo' && /[\r\n]/.test(valore)) {
    aggiungi('«' + etichetta + '» deve stare su una riga sola.');
  }

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
  if (campo.tipo === 'dataora') {
    const pezzi = RE_DATAORA.exec(testo);
    if (!pezzi || !SBOrari.dataValida(pezzi[1]) || !RE_ORARIO.test(pezzi[2])) {
      aggiungi('«' + etichetta + '» va scritto come AAAA-MM-GGTHH:MM, per esempio 2026-09-24T13:30.');
    }
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
    const opzioni = (campo.opzioni || []).map((o) => (o && typeof o === 'object' ? String(o.valore) : String(o)));
    if (opzioni.indexOf(testo) === -1) {
      aggiungi('«' + etichetta + '» può valere solo: ' + opzioni.join(', ') + '.');
    }
  }
}

function descriviValore(valore) {
  if (valore === null || valore === undefined) { return 'niente'; }
  if (Array.isArray(valore)) { return 'un elenco'; }
  if (typeof valore === 'string') { return 'il testo "' + valore.slice(0, 20) + '"'; }
  if (typeof valore === 'number') { return 'il numero ' + valore; }
  if (typeof valore === 'object') { return 'un gruppo di valori'; }
  return 'questo';
}

function controllaRicco(campo, valore, aggiungi, etichetta, vuotoAmmesso) {
  const visibile = testoricco.soloTesto(valore);

  if (!visibile) {
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

function spiegaColore(testo) {
  const coda = ' Un colore si scrive così: #8b2fff.';
  if (/^[0-9a-fA-F]{6}$/.test(testo)) { return 'manca il cancelletto davanti.' + coda; }
  if (/^#[0-9a-fA-F]{3}$/.test(testo)) { return 'la forma corta a tre cifre non basta, va scritta per esteso.' + coda; }
  if (/^#[0-9a-fA-F]{8}$/.test(testo)) { return 'le otto cifre (con la trasparenza) non si possono usare qui.' + coda; }
  if (/^(rgb|rgba|hsl|hsla)\s*\(/i.test(testo)) { return 'qui ci vuole l\'esadecimale, non rgb() o hsl().' + coda; }
  if (/^#/.test(testo)) { return 'dopo il cancelletto ci vogliono sei cifre da 0 a 9 o lettere da A a F.' + coda; }
  return 'non è un colore.' + coda;
}

function controllaFont(campo, testo, aggiungi, etichetta, chiave) {
  if (/[<>"'{};\\]/.test(testo) || /[\u0000-\u001f]/.test(testo)) {
    aggiungi('«' + etichetta + '»: il nome di un carattere può contenere solo lettere, numeri e spazi.');
    return;
  }

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
  if (!catalogo) { return; }

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

  if (!libreria) { return; }
  let esiste = false;
  try { esiste = libreria.esiste(id) === true; } catch (e) { esiste = false; }
  if (!esiste) {
    aggiungi('«' + etichetta + '»: il font caricato scelto qui non c\'è più. Scegline un altro o caricalo di nuovo dalle Impostazioni del sito.');
  }
}

function controllaOrari(valore, aggiungi, chiave) {
  const radice = chiave || 'config.orari';
  for (const problema of SBOrari.problemi(valore)) {
    aggiungi(problema.messaggio, {
      chiave: problema.percorso ? radice + '.' + problema.percorso : radice,
      percorso: problema.percorso
    });
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
  return valore;
}

function propria(oggetto, chiave) {
  return Object.prototype.hasOwnProperty.call(oggetto, chiave);
}

function oggettoSemplice(valore) {
  return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
}

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

const MOTIVI_PROTETTI = {
  nascosto: 'il player di Twitch non si nasconde',
  opacita: 'il player di Twitch non si rende trasparente',
  larghezzaMax: 'il player di Twitch non si rimpicciolisce',
  margine: 'il player di Twitch non si rimpicciolisce e non si copre',
  riempimento: 'il player di Twitch non si rimpicciolisce'
};

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
      if (!attesa) { return; }
      if (!uguali(voce, attesa)) {
        segnala('Nella disposizione, la posizione del blocco «' + voce.id + '» non è nella forma pulita: servono telefono, tablet e computer, ciascuno vuoto o con x, y, l, a dentro i limiti.');
      }
    });
    if (!segnalati) {
      aggiungi('Il riquadro «' + riquadro + '» ha più blocchi di quanti se ne possano posizionare (' + pulita[riquadro].length + ').');
    }
  }
}

function controllaEditor(contenuti, aggiungiSu) {
  const config = contenuti.config;
  if (propria(config, 'sezioni')) { controllaSezioni(config.sezioni, aggiungiSu('config.sezioni')); }
  if (propria(config, 'stili')) { controllaStili(config.stili, aggiungiSu); }
  if (propria(config, 'disposizione')) { controllaDisposizione(config.disposizione, aggiungiSu('config.disposizione')); }
}

function convalida(contenuti) {
  const errori = [];
  const aggiungiSu = (chiave) => (messaggio, dettagli) =>
    errori.push(Object.assign({ chiave: chiave, messaggio: messaggio }, dettagli));

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

function convalidaCampo(chiave, valore) {
  if ((schema.EDITOR || []).indexOf(chiave) !== -1) {
    const errori = [];
    const aggiungiSu = (dove) => (m) => errori.push({ chiave: dove, messaggio: m });
    controllaEditor({ config: { [chiave.slice('config.'.length)]: valore } }, aggiungiSu);
    return errori;
  }
  const campo = schema.campo(chiave);
  if (!campo) { return [{ chiave: chiave, messaggio: 'Il campo "' + chiave + '" non esiste nello schema.' }]; }
  const errori = [];
  controllaValore(campo, valore, (m, dettagli) => errori.push(Object.assign({ chiave: chiave, messaggio: m }, dettagli)), chiave);
  return errori;
}

function riassumi(errori) {
  if (!errori.length) { return 'nessun errore'; }
  return errori.length === 1 ? '1 errore' : errori.length + ' errori';
}

module.exports = { convalida, convalidaCampo, urlAmmesso, guaioFileAudio, riassumi, RE_ORARIO, RE_EMAIL };
