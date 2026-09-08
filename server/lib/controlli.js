'use strict';
/* =====================================================================
   controlli.js — i controlli d'insieme, quelli che nessun campo puo
   fare da solo.

   convalida.js guarda un valore per volta e dice se e valido: e giusto
   cosi, ed e anche il suo limite. Nessun campo, guardato da solo, e
   sbagliato quando l'indirizzo di ritorno del login punta a localhost e
   il sito sta su slayerbeard.it: sono due valori leciti che insieme
   producono un sito rotto per tutti i visitatori.

   Da qui escono AVVERTIMENTI, mai errori: non bloccano la pubblicazione
   e non bloccano il salvataggio. Provare in locale con l'indirizzo di
   produzione gia scritto e una cosa normale, e un controllo che
   impedisse di salvarla sarebbe soltanto un impiccio. Quello che serve
   e che nessuno arrivi al giorno della messa online senza essere stato
   avvisato — la lista sta nel README, in prosa, e la prosa non parla.

   Chi legge questi avvertimenti: `node server/genera.js` in fondo alla
   generazione, l'avvio del server, e il pannello subito dopo aver
   pubblicato.
   ===================================================================== */

/** L'host di un indirizzo, minuscolo e senza www. Null se non e un URL. */
function hostDi(indirizzo) {
  try {
    return new URL(String(indirizzo).trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

/** Origine (protocollo + host + porta), per confrontare due indirizzi. */
function origineDi(indirizzo) {
  try {
    return new URL(String(indirizzo).trim()).origin;
  } catch (e) {
    return null;
  }
}

/** localhost e i suoi sinonimi: sono l'unica eccezione all'https di Twitch. */
function eLocale(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function testo(valore) {
  return typeof valore === 'string' ? valore.trim() : '';
}

/**
 * Gli avvertimenti sul documento intero.
 * Ritorna un elenco di { chiave, messaggio }: la chiave e quella dello
 * schema, cosi chi legge sa dove andare a mettere le mani.
 */
function controlli(contenuti) {
  const fuori = [];
  const dico = (chiave, messaggio) => fuori.push({ chiave: chiave, messaggio: messaggio });

  const config = (contenuti && contenuti.config) || {};
  const twitch = (config.twitch && typeof config.twitch === 'object') ? config.twitch : {};
  const lurk = (config.lurk && typeof config.lurk === 'object') ? config.lurk : {};
  const account = (config.account && typeof config.account === 'object') ? config.account : {};

  const sitoUrl = testo(config.sitoUrl);
  const domini = Array.isArray(twitch.domini)
    ? twitch.domini.map((d) => testo(d).toLowerCase().replace(/^www\./, '')).filter(Boolean)
    : [];

  /* --- Il player e i domini: senza, online resta un rettangolo nero --- */

  const hostSito = sitoUrl ? hostDi(sitoUrl) : null;
  if (hostSito && !eLocale(hostSito) && domini.indexOf(hostSito) === -1) {
    dico('config.twitch.domini',
      'Il sito dichiara di stare su ' + hostSito + ', ma quel dominio non e fra quelli autorizzati per il player: '
      + 'online Twitch rifiuterebbe l\'iframe e resterebbe un riquadro nero. Aggiungi ' + hostSito + ' e www.' + hostSito + '.');
  }
  if (!sitoUrl) {
    dico('config.sitoUrl',
      'Manca l\'indirizzo pubblico del sito: il link canonico e le anteprime social ripiegano su un percorso relativo. '
      + 'Funziona, ma prima di mandarlo online conviene compilarlo.');
  }
  if (!domini.length) {
    dico('config.twitch.domini',
      'Nessun dominio autorizzato per il player: funziona solo da localhost. Il giorno della messa online va aggiunto il dominio vero.');
  }

  /* --- Il profilo del sito: l'unica parte che parla con un'app altrui --- */

  const clientId = testo(account.clientId);
  const urlRitorno = testo(account.urlRitorno);

  if (account.attivo === true && !clientId) {
    dico('config.account.clientId',
      'Il profilo del sito e acceso ma manca il Client ID: la generazione lo lascia spento comunque, '
      + 'sul sito non compare nessun bottone «Collegati con Twitch» e il messaggio in chat della modalita lurk '
      + 'resta spento con lui.');
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

/** Riassunto in una riga, per il terminale. */
function riassumi(avvertimenti) {
  if (!avvertimenti.length) { return 'niente da segnalare'; }
  return avvertimenti.length === 1 ? '1 cosa da guardare' : avvertimenti.length + ' cose da guardare';
}

module.exports = { controlli, riassumi };
