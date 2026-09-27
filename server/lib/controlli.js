'use strict';

function hostDi(indirizzo) {
  try {
    return new URL(String(indirizzo).trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

function origineDi(indirizzo) {
  try {
    return new URL(String(indirizzo).trim()).origin;
  } catch (e) {
    return null;
  }
}

function eLocale(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function testo(valore) {
  return typeof valore === 'string' ? valore.trim() : '';
}

function normalizzaIndirizzo(valore) {
  const grezzo = testo(valore);
  if (!grezzo) { return ''; }
  const conSchema = /^[a-z][a-z0-9+.-]*:\/\//i.test(grezzo) ? grezzo : 'https://' + grezzo;
  let u;
  try {
    u = new URL(conSchema);
  } catch (e) {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') { return ''; }
  if (!u.hostname) { return ''; }
  if (u.username || u.password) { return ''; }
  const percorso = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
  return u.origin + percorso;
}

function indirizzoSito(config) {
  const dalPannello = normalizzaIndirizzo(config && config.sitoUrl);
  const dallAmbiente = dalPannello ? '' : normalizzaIndirizzo(process.env.SB_SITO);
  const indirizzo = dalPannello || dallAmbiente;
  return {
    indirizzo: indirizzo,
    host: indirizzo ? (hostDi(indirizzo) || '') : '',
    dallAmbiente: !dalPannello && !!dallAmbiente
  };
}

function controlli(contenuti) {
  const fuori = [];
  const dico = (chiave, messaggio) => fuori.push({ chiave: chiave, messaggio: messaggio });

  const config = (contenuti && contenuti.config) || {};
  const twitch = (config.twitch && typeof config.twitch === 'object') ? config.twitch : {};
  const lurk = (config.lurk && typeof config.lurk === 'object') ? config.lurk : {};
  const account = (config.account && typeof config.account === 'object') ? config.account : {};
  const clip = (config.clip && typeof config.clip === 'object') ? config.clip : {};

  const sito = indirizzoSito(config);
  const sitoUrl = sito.indirizzo;
  const domini = Array.isArray(twitch.domini)
    ? twitch.domini.map((d) => testo(d).toLowerCase().replace(/^www\./, '')).filter(Boolean)
    : [];
  const dominiVeri = sito.host && domini.indexOf(sito.host) === -1
    ? domini.concat([sito.host])
    : domini;

  if (!sitoUrl) {
    dico('config.sitoUrl',
      'Manca l\'indirizzo pubblico del sito: il link canonico e le anteprime social ripiegano su un percorso relativo. '
      + 'Funziona, ma prima di mandarlo online conviene compilarlo — nel pannello, oppure con la variabile d\'ambiente SB_SITO.');
  }
  if (!dominiVeri.length) {
    dico('config.twitch.domini',
      'Nessun dominio autorizzato per il player: funziona solo da localhost. Il giorno della messa online va aggiunto il dominio vero.');
  }

  const clientId = testo(account.clientId);
  const urlRitorno = testo(account.urlRitorno);

  if (account.attivo === true && !clientId) {
    dico('config.account.clientId',
      'Il profilo del sito e acceso ma manca il Client ID: la generazione lo lascia spento comunque, '
      + 'sul sito non compare nessun bottone «Collegati con Twitch» e il messaggio in chat della modalita lurk '
      + 'resta spento con lui.');
  }

  if (clip.attivo === true && !(Array.isArray(clip.voci) && clip.voci.length)) {
    dico('config.clip.attivo',
      'La vetrina delle clip e accesa ma l\'elenco e ancora vuoto, quindi sul sito non compare — '
      + 'ne la griglia ne il bottone che ci porta. Le clip le prende il server da Twitch a ogni pubblicazione: '
      + 'pubblica una volta, e se restano zero controlla il collegamento (node server/imposta-twitch.js) '
      + 'e allarga il periodo nella parte «Le clip».');
  }

  if (lurk.messaggioAttivo === true && account.attivo !== true) {
    dico('config.account.attivo',
      'Il messaggio in chat della modalita lurk e acceso ma il profilo del sito no: senza account non c\'e nessuno '
      + 'a nome di cui scrivere, e la generazione lascia il messaggio spento comunque.');
  }

  if (account.attivo === true && clientId) {
    if (!urlRitorno) {
      dico('config.account.urlRitorno',
        'Il login usera l\'indirizzo della pagina da cui parte: ognuno di quegli indirizzi deve essere registrato '
        + 'fra gli OAuth Redirect URL dell\'app su dev.twitch.tv, altrimenti Twitch risponde «invalid redirect uri».');
    } else {
      const hostRitorno = hostDi(urlRitorno);
      if (hostRitorno && !eLocale(hostRitorno) && /^http:\/\//i.test(urlRitorno)) {
        dico('config.account.urlRitorno',
          'L\'indirizzo di ritorno e in http: Twitch pretende https per tutto quello che non e localhost, e il login non partirebbe.');
      }
      const orgSito = sitoUrl ? origineDi(sitoUrl) : null;
      const orgRitorno = origineDi(urlRitorno);
      if (orgSito && orgRitorno && orgSito !== orgRitorno) {
        dico('config.account.urlRitorno',
          'Il sito sta su ' + orgSito + ' ma dopo il login Twitch rimanda a ' + orgRitorno + ': i visitatori finirebbero altrove, '
          + 'con il loro token nell\'indirizzo. Se stai provando in locale va bene, ma va rimesso prima di pubblicare per davvero.');
      }
    }
  }

  return fuori;
}

function riassumi(avvertimenti) {
  if (!avvertimenti.length) { return 'niente da segnalare'; }
  return avvertimenti.length === 1 ? '1 cosa da guardare' : avvertimenti.length + ' cose da guardare';
}

module.exports = { controlli, riassumi, indirizzoSito, normalizzaIndirizzo };
