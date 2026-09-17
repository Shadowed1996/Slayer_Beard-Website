'use strict';
/* =====================================================================
   controlli.js — i controlli d'insieme, quelli che nessun campo puo
   fare da solo.

   convalida.js guarda un valore per volta e dice se e valido: e giusto
   cosi, ed e anche il suo limite. Nessun campo, guardato da solo, e
   sbagliato quando l'indirizzo di ritorno del login punta a localhost e
   il sito sta su slayerbeard.com: sono due valori leciti che insieme
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

/* ------------------------------------------------------------------ */
/* L'INDIRIZZO PUBBLICO DEL SITO (CONTRATTO-6 §4.2)                    */
/* ------------------------------------------------------------------ */

/**
 * Un indirizzo scritto come capita, riportato in forma buona — oppure ''
 * se non e un indirizzo.
 *
 * Serve perche questo valore puo arrivare dalla variabile d'ambiente
 * SB_SITO, cioe da un campo di Plesk riempito a mano: «slayerbeard.com»,
 * «https://slayerbeard.com/» e «https://slayerbeard.com» sono la stessa cosa
 * per chi lo scrive e devono diventare la stessa cosa anche qui. Quello che
 * si fa:
 *   - senza schema si intende https (non http: un sito nuovo nasce cifrato);
 *   - si tengono solo http e https, il resto e un errore di battitura;
 *   - via la parte di ricerca e l'ancora, che in un indirizzo di sito non
 *     hanno senso e nel link canonico sarebbero un danno;
 *   - il percorso finisce sempre con la barra, cosi «/sitemap.xml» e le
 *     anteprime social si attaccano senza pensarci.
 * Niente eccezioni: un valore storto vale come non scritto, e il sito esce
 * com'e sempre uscito senza indirizzo.
 */
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
  // Niente nome utente e password nell'indirizzo. Servono a due cose
  // diverse e tutte e due giuste: un indirizzo pubblico con dentro delle
  // credenziali non va messo in un canonico ne in una sitemap, e senza
  // questo controllo un valore come «mailto:qualcuno@example.it» —
  // scheme senza le due barre, quindi non riconosciuto come schema —
  // diventerebbe di nascosto «https://example.it/».
  if (u.username || u.password) { return ''; }
  const percorso = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
  return u.origin + percorso;
}

/**
 * L'indirizzo pubblico in vigore: prima `config.sitoUrl`, poi SB_SITO.
 * L'ordine e quello del contratto — quello scritto nel pannello vince —
 * e il secondo esiste perche l'hosting sappia dirlo senza che nessuno apra
 * il pannello il giorno in cui il dominio si decide.
 *
 * **Tutti e due passano dalla stessa normalizzazione**, e non solo quello
 * dell'ambiente: `https://slayerbeard.com` scritto nel pannello e
 * `https://slayerbeard.com/` devono dare lo stesso identico risultato in
 * tutti i posti in cui l'indirizzo finisce — canonico, anteprime social,
 * `<loc>` della sitemap, riga `Sitemap:` di robots.txt. Una regola sola,
 * non due: due regole vuol dire che una delle due e sbagliata e non si sa
 * quale.
 *
 * Un valore che non e un indirizzo vale come non scritto, e allora si
 * guarda l'ambiente: e la stessa cosa che fa la pagina, che senza indirizzo
 * ripiega sul percorso relativo.
 *
 * Ritorna { indirizzo, host, dallAmbiente }: `indirizzo` gia normalizzato
 * ('' se non c'e), `host` minuscolo e senza www ('' se non c'e),
 * `dallAmbiente` vero quando il valore viene da SB_SITO.
 *
 * ATTENZIONE a `dallAmbiente`: dice **da dove arriva** l'indirizzo, non
 * cosa farne. Non si decide niente su di lui, e in particolare non si
 * decide se aggiungere l'host ai domini del player: quello si fa sempre.
 * La prima versione di questo lavoro ci si appoggiava, e il risultato era
 * che con il dominio scritto nel pannello il player restava senza `parent`
 * — cioe un riquadro nero online — mentre l'avvertimento che l'avrebbe
 * detto taceva perche qui si dava per scontato il contrario. Due file che
 * si contraddicono: chi rimette un `if (dallAmbiente)` davanti ai domini
 * rimette anche quel guaio.
 */
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

  // L'indirizzo in vigore, che puo venire dal pannello o da SB_SITO
  // (CONTRATTO-6 §4.2 e §4.4). Da qualunque parte arrivi, la generazione fa
  // gia da se le due cose che qui sotto si avvertirebbero — lo scrive nel
  // canonico e aggiunge il suo host (piu il www) ai domini del player —
  // quindi non c'e niente da dire e l'avvertimento non deve comparire.
  const sito = indirizzoSito(config);
  const sitoUrl = sito.indirizzo;
  const domini = Array.isArray(twitch.domini)
    ? twitch.domini.map((d) => testo(d).toLowerCase().replace(/^www\./, '')).filter(Boolean)
    : [];
  // I domini che il player avra davvero: quelli scritti nel pannello piu
  // l'host del sito, che la pubblicazione aggiunge sempre.
  const dominiVeri = sito.host && domini.indexOf(sito.host) === -1
    ? domini.concat([sito.host])
    : domini;

  /* --- Il player e i domini: senza, online resta un rettangolo nero --- */

  // Qui c'era un avvertimento su «il sito sta su X ma X non e fra i domini
  // autorizzati». Non c'e piu perche non puo piu essere vero: l'host del
  // sito nei domini del player ce lo mette la pubblicazione, e un
  // avvertimento su un guaio gia risolto e solo un modo per insegnare a
  // ignorare gli avvertimenti. Resta il caso vero, che e non avere ne un
  // indirizzo ne un dominio scritto: li il player funziona solo in locale.
  if (!sitoUrl) {
    dico('config.sitoUrl',
      'Manca l\'indirizzo pubblico del sito: il link canonico e le anteprime social ripiegano su un percorso relativo. '
      + 'Funziona, ma prima di mandarlo online conviene compilarlo — nel pannello, oppure con la variabile d\'ambiente SB_SITO.');
  }
  if (!dominiVeri.length) {
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

/* indirizzoSito e normalizzaIndirizzo escono di qui e non da costruisci.js
   per una ragione sola: costruisci.js carica gia questo file, e il
   contrario farebbe due moduli che si caricano a vicenda. Sono funzioni
   pure — leggono config e process.env e basta — e le usa anche la
   generazione, per il canonico, per la sitemap e per i domini del player. */
module.exports = { controlli, riassumi, indirizzoSito, normalizzaIndirizzo };
