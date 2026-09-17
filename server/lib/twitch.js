'use strict';
/* =====================================================================
   twitch.js — l'unico punto in cui il SERVER LOCALE parla con Twitch.

   Nasce per «Ultima diretta», che era un campo scritto a mano e che
   nessuno aggiornava. Per chi si collega col proprio account ci pensa
   js/canale.js dal browser; ma il visitatore anonimo — cioe la quasi
   totalita — vede quello che c'era scritto in contenuti.json il giorno in
   cui qualcuno si e ricordato di cambiarlo. Qui il titolo si prende alla
   PUBBLICAZIONE, con un app token, e finisce dentro contenuti.json: da
   quel momento e fresco per tutti, senza che il sito pubblicato debba
   chiamare nessuno.

   Sulla stessa strada viaggia il NUMERO DEI FOLLOWER: helix/channels/followers
   con un app token non da la lista di chi segue (quella vuole un token
   del broadcaster con lo scope moderator:read:followers) ma da sempre il
   totale, ed e il totale che la pagina stampa. Finisce in
   config.dati.follower, e da li nella copertina e in «Chi sono».

   Dalla stessa porta passano FOLLOWER E ABBONATI insieme, che pero
   vogliono un token utente: la loro sezione, qui sotto, spiega perche e
   come. Le due strade non litigano — quella col token utente porta anche
   gli abbonati e vince quando c'e l'autorizzazione del canale, quella con
   l'app token continua a tenere fresco il numero dei follower quando
   l'autorizzazione non c'e.

   Sulla stessa strada viaggiano le CLIP: la vetrina della sezione
   «diretta» e un elenco calcolato qui e stampato dentro l'HTML, non un
   riquadro che il browser va a riempire. Il sito pubblicato resta quello
   che era — HTML statico che non parla con nessuno — e in cambio la
   vetrina invecchia fra una pubblicazione e l'altra invece che in
   tempo reale. E lo scambio giusto per un canale che va in onda quattro
   sere a settimana.

   La regola comune alle due funzioni, e l'unica che conta davvero:
   NON LANCIANO MAI e NON SVUOTANO MAI quello che c'e gia. Una
   pubblicazione non deve fallire perche Twitch era giu, e soprattutto
   non deve pubblicare un campo vuoto al posto di un dato buono.

   IL CLIENT SECRET. Il CONTRATTO-3 §4.3 dice che il secret «non si usa
   mai, non si scrive da nessuna parte e non deve esistere». Resta vero
   per il BROWSER, che e cio di cui parlava: nella pagina il secret
   sarebbe un secret regalato al primo che passa. Qui e un'altra cosa —
   sta in server/dati/chiavi.js, sul computer di chi amministra, accanto
   alla password del pannello, e server/ non si carica online.
   La deroga e motivata nel CONTRATTO-3, §4.6.

   Il token che si prende qui e un APP token (client_credentials): non
   appartiene a nessuna persona, non puo leggere niente di privato e non
   puo scrivere in chat. Serve solo perche dalla fine del 2021 Twitch non
   risponde piu a helix senza un token qualsiasi.

   Si usa node:https e non fetch: fetch su Node 18 stampa un avviso di
   funzione sperimentale a ogni pubblicazione, e node:https e la stessa
   famiglia di node:http che il server usa gia.
   ===================================================================== */

const fs = require('node:fs');
const https = require('node:https');

const { P } = require('./percorsi');
const archivio = require('./archivio');
const { scriviAtomico, assicuraCartella } = require('./file');
const chiavi = require('./chiavi');

// Oltre questo tempo si rinuncia: la pubblicazione non deve restare
// appesa a Twitch. Se la rete e lenta si tiene il titolo che c'e gia.
const TIMEOUT_MS = 8000;

// Il token si chiede di nuovo un minuto prima della scadenza dichiarata,
// cosi non si rischia di usarne uno scaduto fra la lettura e la richiesta.
const ANTICIPO_MS = 60 * 1000;

// Gli host da cui Twitch serve le anteprime delle clip. Vanno tenuti
// d'accordo con `img-src` della Content-Security-Policy in
// modelli/parziali/testa.html: un'anteprima su un host che la CSP non
// conosce non si vede, e non lo dice nessuno. Sono due perche Twitch non
// ha mai migrato del tutto le clip vecchie sul nome nuovo.
const HOST_ANTEPRIME = ['clips-media-assets2.twitch.tv', 'clips-media-assets.twitch.tv'];

// Cache in memoria, non su disco: il server locale si riavvia spesso e un
// app token si riprende in una richiesta sola. Scriverlo su disco vorrebbe
// dire avere un secondo segreto da proteggere per risparmiare 200 ms.
let tokenInCache = null;   // { valore, scadeIl }

/* --- CREDENZIALI ---------------------------------------------------- */

/**
 * La coppia Client ID + secret, da server/dati/chiavi.js.
 * Ritorna null se il file non c'e o se ne manca una: e la condizione
 * normale di chi non ha registrato nessuna app, e non e un errore. Un
 * file rotto invece lancia — la differenza fra «non configurato» e
 * «configurato male» e proprio quello che chi guarda vuole sapere.
 *
 * Le chiavi stanno in un posto solo e questo modulo non le tiene in
 * cache: la lettura passa da lib/chiavi.js, che rilegge il file quando
 * cambia, cosi chi lo modifica non deve riavviare il server.
 */
function credenziali() {
  return chiavi.twitchComplete();
}

/** Vero se il collegamento a Twitch e configurato. */
function configurato() {
  try { return credenziali() !== null; } catch (e) { return false; }
}

/* --- RICHIESTE ------------------------------------------------------ */

/**
 * Una richiesta HTTPS che ritorna il JSON gia analizzato.
 * Rifiuta su rete assente, su timeout, su risposta non 2xx e su corpo che
 * non e JSON: chi chiama tratta tutti questi casi allo stesso modo, cioe
 * tenendosi quello che ha gia.
 */
function chiedi(opzioni, corpo) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request(opzioni, (risposta) => {
      const pezzi = [];
      risposta.on('data', (pezzo) => pezzi.push(pezzo));
      risposta.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) {
          // Il corpo arriva con l'a capo finale: infilato dentro una riga di
          // resoconto la spezzerebbe a meta, e quella riga la legge qualcuno
          // che sta cercando di capire cosa non va.
          const corpoBreve = testo.replace(/\s+/g, ' ').trim().slice(0, 200);
          const errore = new Error('Twitch ha risposto ' + risposta.statusCode + ': ' + corpoBreve);
          // Il codice e il corpo viaggiano con l'errore: l'autorizzazione con
          // codice (§ follower e abbonati) deve distinguere «non ha ancora
          // confermato» da «e andata male», e Twitch lo dice solo li dentro.
          errore.codice = risposta.statusCode;
          try { errore.risposta = JSON.parse(testo); } catch (e) { errore.risposta = null; }
          rifiuta(errore);
          return;
        }
        try { risolvi(JSON.parse(testo)); }
        catch (e) { rifiuta(new Error('Twitch ha risposto qualcosa che non e JSON.')); }
      });
    });

    richiesta.setTimeout(TIMEOUT_MS, () => {
      // destroy() fa scattare 'error' con ECONNRESET: il messaggio che si
      // legge deve dire «timeout», non «connessione azzerata».
      richiesta.destroy(new Error('Twitch non ha risposto entro ' + (TIMEOUT_MS / 1000) + ' secondi.'));
    });
    richiesta.on('error', rifiuta);

    if (corpo !== undefined) { richiesta.write(corpo); }
    richiesta.end();
  });
}

/**
 * Un app token valido, dalla cache o chiesto di nuovo.
 * client_credentials non ha refresh token: scaduto, se ne prende un altro.
 */
async function appToken() {
  const ora = Date.now();
  if (tokenInCache && tokenInCache.scadeIl - ANTICIPO_MS > ora) { return tokenInCache.valore; }

  const chiavi = credenziali();
  if (!chiavi) { throw new Error('Mancano le chiavi in ' + P.chiavi + ': lancia node server/imposta-twitch.js.'); }

  const corpo = new URLSearchParams({
    client_id: chiavi.clientId,
    client_secret: chiavi.clientSecret,
    grant_type: 'client_credentials'
  }).toString();

  const risposta = await chiedi({
    method: 'POST',
    hostname: 'id.twitch.tv',
    path: '/oauth2/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(corpo)
    }
  }, corpo);

  if (!risposta || typeof risposta.access_token !== 'string' || !risposta.access_token) {
    throw new Error('Twitch non ha dato nessun token: controlla Client ID e secret.');
  }

  const durataMs = (typeof risposta.expires_in === 'number' ? risposta.expires_in : 3600) * 1000;
  tokenInCache = { valore: risposta.access_token, scadeIl: Date.now() + durataMs };
  return tokenInCache.valore;
}

/** Butta il token in cache. Serve al collaudo e a chi cambia le credenziali. */
function dimenticaToken() {
  tokenInCache = null;
}

/** Una GET su api.twitch.tv/helix con i due header che Twitch pretende. */
async function helix(percorso) {
  const chiavi = credenziali();
  const token = await appToken();
  return chiedi({
    method: 'GET',
    hostname: 'api.twitch.tv',
    path: '/helix' + percorso,
    headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': chiavi.clientId }
  });
}

/* --- ULTIMA DIRETTA -------------------------------------------------- */

function primoTitolo(risposta) {
  if (!risposta || !Array.isArray(risposta.data) || !risposta.data.length) { return ''; }
  const titolo = risposta.data[0].title;
  return typeof titolo === 'string' ? titolo.trim() : '';
}

/**
 * Il titolo dell'ultima diretta registrata, con un ripiego.
 *
 * helix/videos?type=archive da il titolo del VOD, che e la cosa giusta:
 * e quello che c'era scritto DURANTE l'ultima diretta. Ma i VOD scadono
 * (7 giorni per gli affiliati, 60 per i partner) e chi li disattiva non
 * ne ha nessuno: allora si ripiega su helix/channels, che da il titolo
 * ATTUALE del canale — lo stesso che si vedra alla prossima accensione.
 * E un ripiego, non un equivalente, ed e comunque meglio di un campo
 * fermo a mesi fa.
 */
async function titoloUltimaDiretta(idUtente) {
  const id = encodeURIComponent(String(idUtente));

  const archivi = await helix('/videos?user_id=' + id + '&type=archive&first=1');
  const daiVod = primoTitolo(archivi);
  if (daiVod) { return { titolo: daiVod, fonte: 'videos' }; }

  const canale = await helix('/channels?broadcaster_id=' + id);
  if (canale && Array.isArray(canale.data) && canale.data.length) {
    const titolo = typeof canale.data[0].title === 'string' ? canale.data[0].title.trim() : '';
    if (titolo) { return { titolo: titolo, fonte: 'channels' }; }
  }

  return { titolo: '', fonte: 'nessuna' };
}

/**
 * Aggiorna config.ultimaDiretta in contenuti.json, se si puo.
 *
 * NON LANCIA MAI e non svuota mai il valore che c'e gia: e l'invariante
 * di questo file. Una pubblicazione non deve fallire perche Twitch era
 * giu, e soprattutto non deve pubblicare un campo vuoto al posto di un
 * titolo buono. Chi chiama riceve un resoconto e decide se stamparlo.
 *
 * Stati possibili:
 *   spento      — nessuna credenziale: il collegamento non e configurato
 *   senzaCanale — manca config.twitch.idUtente
 *   aggiornato  — il titolo e cambiato ed e stato scritto
 *   invariato   — il titolo e lo stesso: non si tocca contenuti.json
 *   vuoto       — Twitch non ha dato nessun titolo: si tiene quello vecchio
 *   fallito     — rete, credenziali o risposta storta: si tiene quello vecchio
 */
async function aggiornaUltimaDiretta() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let contenuti;
  let idUtente;
  try {
    contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let esito;
  try {
    esito = await titoloUltimaDiretta(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const precedente = typeof contenuti.config.ultimaDiretta === 'string' ? contenuti.config.ultimaDiretta : '';
  if (!esito.titolo) { return { stato: 'vuoto', precedente: precedente }; }
  if (esito.titolo === precedente) { return { stato: 'invariato', titolo: precedente, fonte: esito.fonte }; }

  // Si rilegge il documento invece di riusare quello di prima: fra la
  // lettura e adesso c'e stata una richiesta in rete, e nel frattempo il
  // pannello puo aver salvato. Riscrivere la copia vecchia perderebbe
  // quel salvataggio.
  let fresco;
  try {
    fresco = archivio.leggi();
    fresco.config.ultimaDiretta = esito.titolo;
    archivio.salva(fresco);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'aggiornato', titolo: esito.titolo, precedente: precedente, fonte: esito.fonte };
}

/* --- FOLLOWER -------------------------------------------------------- */

/**
 * Il totale dei follower dalla risposta di helix/channels/followers.
 * Ritorna un intero >= 0, oppure null se la risposta non lo porta: null
 * e «non lo so», che e diverso da zero.
 */
function totaleFollower(risposta) {
  if (!risposta || typeof risposta !== 'object') { return null; }
  // Number(null) e 0: un totale assente non deve diventare «zero follower».
  if (risposta.total === null || risposta.total === undefined || risposta.total === '') { return null; }
  const totale = Number(risposta.total);
  if (!Number.isFinite(totale) || totale < 0) { return null; }
  return Math.round(totale);
}

/** Il numero dei follower del canale, chiesto a Twitch. */
async function contaFollower(idUtente) {
  const id = encodeURIComponent(String(idUtente));
  // first=1: la lista non serve (e con un app token arriva comunque vuota),
  // conta solo `total`.
  return totaleFollower(await helix('/channels/followers?broadcaster_id=' + id + '&first=1'));
}

/**
 * Aggiorna config.dati.follower in contenuti.json, se si puo.
 * Stessa invariante di aggiornaUltimaDiretta(): NON LANCIA MAI e non
 * tocca il numero che c'e gia se Twitch non ne da uno buono. Stessi stati.
 */
async function aggiornaFollower() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let contenuti;
  let idUtente;
  try {
    contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let totale;
  try {
    totale = await contaFollower(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const dati = (contenuti.config && contenuti.config.dati) || {};
  const precedente = Number.isFinite(Number(dati.follower)) ? Math.round(Number(dati.follower)) : 0;
  if (totale === null) { return { stato: 'vuoto', precedente: precedente }; }
  if (totale === precedente) { return { stato: 'invariato', totale: totale }; }

  // Si rilegge il documento per lo stesso motivo di aggiornaUltimaDiretta():
  // nel frattempo il pannello puo aver salvato.
  try {
    const fresco = archivio.leggi();
    if (!fresco.config.dati || typeof fresco.config.dati !== 'object') { fresco.config.dati = {}; }
    fresco.config.dati.follower = totale;
    archivio.salva(fresco);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'aggiornato', totale: totale, precedente: precedente };
}

/* --- CLIP ----------------------------------------------------------- */

/** I giorni indietro di ogni periodo. `sempre` non mette nessun limite. */
const PERIODI = { '7': 7, '30': 30, '365': 365 };

/**
 * Le clip migliori del canale, gia ripulite.
 *
 * helix/clips le restituisce ordinate per visualizzazioni decrescenti, che
 * e esattamente l'ordine che serve: chi arriva sul sito vuole vedere le
 * migliori, non le ultime. Il periodo si passa come intervallo
 * started_at..ended_at perche Twitch, dato solo l'inizio, assume una
 * settimana e ignora in silenzio quello che si voleva chiedere.
 */
async function clipMigliori(idUtente, quante, periodo) {
  const id = encodeURIComponent(String(idUtente));
  let percorso = '/clips?broadcaster_id=' + id + '&first=' + Math.min(50, Math.max(1, quante));

  const giorni = PERIODI[String(periodo)];
  if (giorni) {
    const fine = new Date();
    const inizio = new Date(fine.getTime() - giorni * 24 * 60 * 60 * 1000);
    percorso += '&started_at=' + inizio.toISOString() + '&ended_at=' + fine.toISOString();
  }

  const risposta = await helix(percorso);
  const voci = (risposta && Array.isArray(risposta.data)) ? risposta.data : [];
  const fuori = [];
  const hostStrani = [];

  for (const voce of voci) {
    const url = String((voce && voce.url) || '').trim();
    const titolo = String((voce && voce.title) || '').trim();
    // Senza indirizzo la card non porterebbe da nessuna parte, e senza
    // titolo sarebbe un rettangolo muto: sono le due cose indispensabili.
    if (!url || !titolo) { continue; }

    // L'anteprima e un di piu: se manca o arriva da un host che la CSP non
    // conosce, la card resta e mostra il suo fondo. Meglio una clip senza
    // immagine che una clip in meno.
    let anteprima = String((voce && voce.thumbnail_url) || '').trim();
    if (anteprima) {
      let host = '';
      try { host = new URL(anteprima).hostname.toLowerCase(); } catch (e) { host = ''; }
      if (HOST_ANTEPRIME.indexOf(host) === -1) {
        if (host && hostStrani.indexOf(host) === -1) { hostStrani.push(host); }
        anteprima = '';
      }
    }

    fuori.push({
      id: String((voce && voce.id) || ''),
      titolo: titolo,
      url: url,
      anteprima: anteprima,
      durataSec: Number.isFinite(Number(voce && voce.duration)) ? Math.round(Number(voce.duration)) : 0,
      visualizzazioni: Number.isFinite(Number(voce && voce.view_count)) ? Math.round(Number(voce.view_count)) : 0,
      creataIl: String((voce && voce.created_at) || ''),
      autore: String((voce && voce.creator_name) || '').trim()
    });
  }

  return { voci: fuori, hostStrani: hostStrani };
}

/**
 * Aggiorna config.clip.voci in contenuti.json, se si puo.
 *
 * Stesse regole di aggiornaUltimaDiretta(): non lancia mai, e non svuota
 * mai l'elenco che c'e gia. Una vetrina che sparisce perche Twitch era
 * giu per dieci secondi e peggio di una vetrina di una settimana fa.
 *
 * Stati: spento, senzaCanale, aggiornato, invariato, vuoto, fallito.
 */
async function aggiornaClip() {
  let chiavi;
  try {
    chiavi = credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let contenuti;
  let clip;
  let idUtente;
  try {
    contenuti = archivio.leggi();
    const twitch = (contenuti.config && contenuti.config.twitch) || {};
    clip = (contenuti.config && contenuti.config.clip) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  // La sezione spenta non si aggiorna: sarebbe una richiesta in rete a
  // ogni pubblicazione per riempire un ramo che nessuno stampa. Il motivo
  // viaggia con lo stato perche «spento» qui vuol dire due cose diverse —
  // manca il collegamento, oppure la vetrina non la vuole nessuno — e chi
  // legge il resoconto sta cercando di distinguerle.
  if (clip.attivo !== true) { return { stato: 'spento', motivo: 'sezione' }; }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  const quante = Number.isFinite(Number(clip.quante)) ? Math.round(Number(clip.quante)) : 6;

  let esito;
  try {
    esito = await clipMigliori(idUtente, quante, clip.periodo);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  const precedenti = Array.isArray(clip.voci) ? clip.voci : [];
  if (!esito.voci.length) { return { stato: 'vuoto', quante: precedenti.length }; }

  const uguali = precedenti.length === esito.voci.length
    && precedenti.every((v, i) => v && v.id === esito.voci[i].id && v.titolo === esito.voci[i].titolo
      && v.visualizzazioni === esito.voci[i].visualizzazioni);
  if (uguali) { return { stato: 'invariato', quante: esito.voci.length, hostStrani: esito.hostStrani }; }

  // Si rilegge, come per il titolo: fra la lettura e adesso c'e stata una
  // richiesta in rete, e il pannello puo aver salvato nel frattempo.
  try {
    const fresco = archivio.leggi();
    if (!fresco.config.clip || typeof fresco.config.clip !== 'object') { fresco.config.clip = {}; }
    fresco.config.clip.voci = esito.voci;
    archivio.salva(fresco);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return { stato: 'aggiornato', quante: esito.voci.length, hostStrani: esito.hostStrani };
}

/* --- FOLLOWER E ABBONATI --------------------------------------------- */

/*
   I numeri del canale erano scritti a mano e invecchiavano come «Ultima
   diretta». Qui pero l'app token non basta: Twitch da il totale dei
   follower solo a un token UTENTE, e gli abbonati solo al token del
   proprietario del canale con lo scope channel:read:subscriptions.

   Percio slayer_beard autorizza il server una volta sola, con il flusso a
   codice di Twitch (Device Code Grant): il server stampa un codice, lui lo
   inserisce su twitch.tv/activate e accetta. Nessun indirizzo di ritorno da
   registrare, nessuna pagina da aprire sul server.

   Quello che resta su disco e il REFRESH TOKEN, in
   server/dati/twitch-accesso.json, accanto a chiavi.js e con le stesse
   regole: non si carica online, non va nel controllo di versione. Twitch
   lo sostituisce a ogni rinnovo (e monouso) e lo lascia scadere dopo 30
   giorni senza uso: col server acceso si rinnova da se ogni quattro ore,
   e se resta spento piu a lungo basta rifare l'autorizzazione.

   Stesse regole del resto del file: NON LANCIA MAI verso la pubblicazione
   e NON SVUOTA MAI un numero buono.
*/

// L'unico permesso che si chiede. Il totale dei follower non ne vuole
// nessuno: basta che il token sia di una persona.
const SCOPE_ACCESSO = 'channel:read:subscriptions';

// I campi di testo che mostrano un numero in pagina. Si riscrivono solo se
// contengono un numero e nient'altro: chi nel pannello ci ha messo «3,6K» o
// ha cambiato del tutto il senso della casella non se lo vede sovrascrivere
// ogni dieci minuti.
//
// I follower non sono qui perche non passano da una casella di testo: la
// pagina li stampa da config.dati.follower (`{{sito.follower}}`, i nodi
// marcati data-follower), che applicaNumeri() scrive comunque. Gli abbonati
// invece stanno ancora in un campo che si puo scrivere a mano.
const CAMPI_NUMERI = {
  abbonati: ['chi.dato2Valore']
};

let accessoInCache = null;     // { valore, scadeIl }
let rinnovoInCorso = null;     // una Promise: due rinnovi insieme brucerebbero il refresh token

/** 3624 → «3.624». Scritto a mano: it-IT non separa le migliaia sotto le 10.000. */
function formattaNumero(n) {
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Vero se il testo e un numero nudo, con o senza punti delle migliaia. */
function eNumeroNudo(testo) {
  return typeof testo === 'string' && /^\s*(\d+|\d{1,3}(\.\d{3})+)\s*$/.test(testo);
}

/**
 * L'autorizzazione salvata, o null se non c'e.
 * Lancia se il file c'e ma e rotto: come per chiavi.js, «non collegato» e
 * «collegato male» sono due cose che chi guarda vuole distinguere.
 */
function leggiAccesso() {
  let testo;
  try { testo = fs.readFileSync(P.accessoTwitch, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') { return null; }
    throw e;
  }
  let dati;
  try { dati = JSON.parse(testo); }
  catch (e) { throw new Error('server/dati/twitch-accesso.json non si legge: rifai l autorizzazione con node server/imposta-twitch.js --collega.'); }
  if (!dati || typeof dati.refreshToken !== 'string' || !dati.refreshToken.trim()) { return null; }
  return dati;
}

function salvaAccesso(dati) {
  assicuraCartella(P.dati);
  scriviAtomico(P.accessoTwitch, JSON.stringify(dati, null, 2) + '\n');
  // Come chiavi.js: su Windows chmod non fa niente, e non e un errore.
  try { fs.chmodSync(P.accessoTwitch, 0o600); } catch (e) { /* Windows */ }
}

/** Vero se slayer_beard ha autorizzato il server. Non lancia mai. */
function collegato() {
  try { return leggiAccesso() !== null; } catch (e) { return false; }
}

/** Toglie l'autorizzazione salvata. Vero se c'era qualcosa da togliere. */
function scollega() {
  accessoInCache = null;
  try { fs.unlinkSync(P.accessoTwitch); return true; }
  catch (e) { if (e.code === 'ENOENT') { return false; } throw e; }
}

function postModulo(percorso, campi) {
  const corpo = new URLSearchParams(campi).toString();
  return chiedi({
    method: 'POST',
    hostname: 'id.twitch.tv',
    path: percorso,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo) }
  }, corpo);
}

/**
 * Primo passo dell'autorizzazione: Twitch da il codice da inserire.
 * Ritorna { codiceDispositivo, codiceUtente, indirizzo, scadeTraSec, intervalloSec }.
 */
async function iniziaCollegamento() {
  const chiavi = credenziali();
  if (!chiavi) { throw new Error('Prima servono le chiavi dell app: node server/imposta-twitch.js <clientId> <clientSecret>.'); }
  const r = await postModulo('/oauth2/device', { client_id: chiavi.clientId, scopes: SCOPE_ACCESSO });
  if (!r || !r.device_code || !r.user_code) { throw new Error('Twitch non ha dato nessun codice.'); }
  return {
    codiceDispositivo: r.device_code,
    codiceUtente: r.user_code,
    indirizzo: r.verification_uri || 'https://www.twitch.tv/activate',
    scadeTraSec: Number(r.expires_in) || 1800,
    intervalloSec: Number(r.interval) || 5
  };
}

/**
 * Secondo passo: si aspetta che il codice venga confermato su Twitch, poi
 * si salva l'autorizzazione. Ritorna { login, idUtente }.
 * `attendi` si puo sostituire (il collaudo non vuole aspettare davvero).
 */
/**
 * Un solo tentativo di completare l'autorizzazione, senza aspettare.
 *
 * completaCollegamento() (qui sotto) la ripete in un ciclo per la riga di
 * comando, che non deve rispondere a nessuno nel frattempo. La rotta del
 * pannello (server/lib/api.js, «Collegati per i numeri») invece la chiama
 * una volta per ogni richiesta HTTP: il browser tiene il ciclo, non il
 * server, cosi' una connessione non resta appesa per tutta la durata del
 * codice (fino a mezz'ora).
 *
 * Ritorna { stato: 'confermato', login, idUtente } quando Twitch ha
 * accettato, { stato: 'in attesa' } o { stato: 'rallenta' } quando non
 * ancora. Lancia solo per un guaio vero (le chiavi mancano, la rete non
 * risponde, Twitch non da un token buono): chi chiama lo traduce in un
 * errore che ferma il programma, o in un avviso nel pannello.
 */
async function tentaCollegamento(avvio) {
  const chiavi = credenziali();
  if (!chiavi) { throw new Error('Mancano le chiavi dell app.'); }

  let token;
  try {
    token = await postModulo('/oauth2/token', {
      client_id: chiavi.clientId,
      scopes: SCOPE_ACCESSO,
      device_code: avvio.codiceDispositivo,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
  } catch (errore) {
    const messaggio = String((errore.risposta && errore.risposta.message) || '');
    if (messaggio === 'authorization_pending') { return { stato: 'in attesa' }; }
    if (messaggio === 'slow_down') { return { stato: 'rallenta' }; }
    throw errore;
  }
  if (!token.refresh_token || !token.access_token) { throw new Error('Twitch non ha dato nessun token.'); }

  // Di chi e l'autorizzazione? Gli abbonati li legge solo il proprietario
  // del canale, ed e meglio saperlo adesso che fra dieci minuti.
  const utenti = await chiedi({
    method: 'GET', hostname: 'api.twitch.tv', path: '/helix/users',
    headers: { 'Authorization': 'Bearer ' + token.access_token, 'Client-Id': chiavi.clientId }
  });
  const io = (utenti && Array.isArray(utenti.data) && utenti.data[0]) || {};

  salvaAccesso({
    refreshToken: token.refresh_token,
    idUtente: String(io.id || ''),
    login: String(io.login || ''),
    collegatoIl: new Date().toISOString()
  });
  accessoInCache = { valore: token.access_token, scadeIl: Date.now() + (Number(token.expires_in) || 3600) * 1000 };
  return { stato: 'confermato', login: String(io.login || ''), idUtente: String(io.id || '') };
}

/**
 * Aspetta che il codice venga confermato su Twitch, riprovando da se':
 * e' quello che usa la riga di comando (node server/imposta-twitch.js
 * --collega), che tiene il terminale finche' non arriva la conferma.
 */
async function completaCollegamento(avvio, opzioni) {
  const attendi = (opzioni && opzioni.attendi) || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let intervallo = avvio.intervalloSec * 1000;
  const limite = Date.now() + avvio.scadeTraSec * 1000;

  for (;;) {
    if (Date.now() > limite) { throw new Error('Il codice e scaduto prima della conferma: rilancia il comando.'); }
    await attendi(intervallo);
    const esito = await tentaCollegamento(avvio);
    if (esito.stato === 'confermato') { return { login: esito.login, idUtente: esito.idUtente }; }
    if (esito.stato === 'rallenta') { intervallo += 5000; }
  }
}

/** Cosa sapere del collegamento, senza il refresh token: per il pannello. */
function infoCollegamento() {
  let accesso;
  try { accesso = leggiAccesso(); } catch (e) { return { collegato: false }; }
  if (!accesso) { return { collegato: false }; }
  return { collegato: true, login: accesso.login || '', idUtente: accesso.idUtente || '' };
}

/** Un token utente valido: dalla cache, o rinnovato col refresh token. */
async function tokenAccesso() {
  if (accessoInCache && accessoInCache.scadeIl - ANTICIPO_MS > Date.now()) { return accessoInCache.valore; }
  if (rinnovoInCorso) { return rinnovoInCorso; }

  rinnovoInCorso = (async () => {
    const chiavi = credenziali();
    const accesso = leggiAccesso();
    if (!chiavi || !accesso) { throw new Error('Il server non e autorizzato: node server/imposta-twitch.js --collega.'); }

    let r;
    try {
      r = await postModulo('/oauth2/token', {
        client_id: chiavi.clientId,
        client_secret: chiavi.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: accesso.refreshToken
      });
    } catch (errore) {
      if (errore.codice === 400 || errore.codice === 401) {
        throw new Error('Twitch non accetta piu l autorizzazione' + (accesso.login ? ' di ' + accesso.login : '') +
          ' (scaduta o revocata): rifalla con node server/imposta-twitch.js --collega.');
      }
      throw errore;
    }
    if (!r || !r.access_token) { throw new Error('Twitch non ha rinnovato il token.'); }

    // Il refresh token e monouso: quello nuovo va salvato SUBITO, prima di
    // usare l'access token, o al prossimo giro non ci sarebbe piu niente.
    if (r.refresh_token && r.refresh_token !== accesso.refreshToken) {
      salvaAccesso({ ...accesso, refreshToken: r.refresh_token });
    }
    accessoInCache = { valore: r.access_token, scadeIl: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
    return accessoInCache.valore;
  })();

  try { return await rinnovoInCorso; }
  finally { rinnovoInCorso = null; }
}

/** Una GET su helix col token utente. Su 401 rinnova una volta e riprova. */
async function helixAccesso(percorso) {
  const chiavi = credenziali();
  const opzioni = (token) => ({
    method: 'GET', hostname: 'api.twitch.tv', path: '/helix' + percorso,
    headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': chiavi.clientId }
  });
  try {
    return await chiedi(opzioni(await tokenAccesso()));
  } catch (errore) {
    if (errore.codice !== 401) { throw errore; }
    accessoInCache = null;
    return chiedi(opzioni(await tokenAccesso()));
  }
}

/**
 * Follower e abbonati del canale.
 * Gli abbonati possono mancare (null) senza far fallire i follower: capita
 * se l'autorizzazione e di un altro account, o se Twitch li nega.
 */
async function numeriCanale(idUtente) {
  const id = encodeURIComponent(String(idUtente));
  const seguaci = await helixAccesso('/channels/followers?broadcaster_id=' + id + '&first=1');
  if (!seguaci || !Number.isFinite(Number(seguaci.total))) { throw new Error('Twitch non ha dato il totale dei follower.'); }

  let abbonati = null;
  let motivoAbbonati = '';
  try {
    const abb = await helixAccesso('/subscriptions?broadcaster_id=' + id + '&first=1');
    if (abb && Number.isFinite(Number(abb.total))) { abbonati = Number(abb.total); }
    else { motivoAbbonati = 'Twitch non ha dato il totale degli abbonati'; }
  } catch (errore) {
    motivoAbbonati = errore.message;
  }
  return { follower: Number(seguaci.total), abbonati: abbonati, motivoAbbonati: motivoAbbonati };
}

/**
 * Scrive i numeri nel documento: config.dati e i campi di testo che li
 * mostrano. Pura, senza rete: e la parte che il collaudo tiene ferma.
 * Ritorna l'elenco delle chiavi cambiate.
 */
function applicaNumeri(documento, numeri) {
  const cambiate = [];
  if (!documento.config.dati || typeof documento.config.dati !== 'object') { documento.config.dati = {}; }
  const dati = documento.config.dati;

  for (const nome of ['follower', 'abbonati']) {
    const valore = numeri[nome];
    if (valore === null || valore === undefined || !Number.isFinite(Number(valore))) { continue; }
    if (dati[nome] !== valore) { dati[nome] = valore; cambiate.push('config.dati.' + nome); }
    // I follower non hanno caselle di testo: si fermano a config.dati.
    if (!CAMPI_NUMERI[nome]) { continue; }

    const scritto = formattaNumero(valore);
    for (const chiave of CAMPI_NUMERI[nome]) {
      const attuale = documento.testi[chiave];
      if (!eNumeroNudo(attuale) || attuale.trim() === scritto) { continue; }
      documento.testi[chiave] = scritto;
      cambiate.push(chiave);
    }
  }
  return cambiate;
}

/**
 * Aggiorna follower e abbonati in contenuti.json, se si puo.
 * Stati: spento, nonCollegato, senzaCanale, aggiornato, invariato, fallito.
 */
async function aggiornaNumeri() {
  let chiavi;
  let accesso;
  try {
    chiavi = credenziali();
    if (!chiavi) { return { stato: 'spento' }; }
    accesso = leggiAccesso();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!accesso) { return { stato: 'nonCollegato' }; }

  let idUtente;
  try {
    const twitch = (archivio.leggi().config.twitch) || {};
    idUtente = typeof twitch.idUtente === 'string' ? twitch.idUtente.trim() : '';
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let numeri;
  try {
    numeri = await numeriCanale(idUtente);
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  // Si rilegge dopo la rete, come per le clip: il pannello puo aver salvato.
  let cambiate;
  try {
    const fresco = archivio.leggi();
    cambiate = applicaNumeri(fresco, numeri);
    if (cambiate.length) { archivio.salva(fresco); }
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }

  return {
    stato: cambiate.length ? 'aggiornato' : 'invariato',
    follower: numeri.follower, abbonati: numeri.abbonati,
    motivoAbbonati: numeri.motivoAbbonati, cambiate: cambiate
  };
}

/** Il resoconto dei numeri in una riga. */
function raccontaNumeri(esito) {
  if (!esito || !esito.stato) { return ''; }
  const abb = (e) => e.abbonati === null || e.abbonati === undefined
    ? '. Abbonati non letti (' + (e.motivoAbbonati || 'motivo sconosciuto') + ').'
    : ', ' + formattaNumero(e.abbonati) + ' abbonati.';
  switch (esito.stato) {
    case 'spento':
      return 'Follower e abbonati: il collegamento con Twitch non e configurato, restano quelli scritti a mano.';
    case 'nonCollegato':
      return 'Follower e abbonati: restano quelli scritti a mano finche slayer_beard non autorizza il server (node server/imposta-twitch.js --collega).';
    case 'senzaCanale':
      return 'Follower e abbonati: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Follower e abbonati: aggiornati da Twitch — ' + formattaNumero(esito.follower) + ' follower' + abb(esito);
    case 'invariato':
      return 'Follower e abbonati: gia aggiornati — ' + formattaNumero(esito.follower) + ' follower' + abb(esito);
    case 'fallito':
      return 'Follower e abbonati: non sono riuscito a chiederli a Twitch (' + esito.motivo + '). Tengo quelli che c erano.';
    default:
      return '';
  }
}

/** Il resoconto in una riga, per il terminale e per il pannello. */
function racconta(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return 'Ultima diretta: presa dai contenuti (il collegamento con Twitch non e configurato).';
    case 'senzaCanale':
      return 'Ultima diretta: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Ultima diretta: aggiornata da Twitch — «' + esito.titolo + '».';
    case 'invariato':
      return 'Ultima diretta: gia aggiornata — «' + esito.titolo + '».';
    case 'vuoto':
      return 'Ultima diretta: Twitch non ha dato nessun titolo, tengo quello che c era.';
    case 'fallito':
      return 'Ultima diretta: non sono riuscito a chiederla a Twitch (' + esito.motivo + '). Tengo quello che c era.';
    default:
      return '';
  }
}

/** Lo stesso, per i follower. */
function raccontaFollower(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return 'Follower: presi dai contenuti (il collegamento con Twitch non e configurato).';
    case 'senzaCanale':
      return 'Follower: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Follower: aggiornati da Twitch — ' + esito.totale + ' (prima ' + esito.precedente + ').';
    case 'invariato':
      return 'Follower: gia aggiornati — ' + esito.totale + '.';
    case 'vuoto':
      return 'Follower: Twitch non ha dato nessun totale, tengo ' + esito.precedente + '.';
    case 'fallito':
      return 'Follower: non sono riuscito a chiederli a Twitch (' + esito.motivo + '). Tengo il numero che c era.';
    default:
      return '';
  }
}

/** Lo stesso, per le clip. */
function raccontaClip(esito) {
  if (!esito || !esito.stato) { return ''; }
  const strani = (esito.hostStrani && esito.hostStrani.length)
    ? ' Attenzione: ' + esito.hostStrani.length + (esito.hostStrani.length === 1 ? ' anteprima arriva' : ' anteprime arrivano')
      + ' da un host che la CSP non conosce (' + esito.hostStrani.join(', ') + '), e quelle card restano senza immagine.'
    : '';
  switch (esito.stato) {
    case 'spento':
      return esito.motivo === 'sezione'
        ? 'Clip: la vetrina e spenta nel pannello, non ho chiesto niente a Twitch.'
        : 'Clip: il collegamento con Twitch non e configurato, non ho chiesto niente.';
    case 'senzaCanale':
      return 'Clip: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Clip: aggiornate da Twitch — ' + esito.quante + (esito.quante === 1 ? ' clip.' : ' clip.') + strani;
    case 'invariato':
      return 'Clip: gia aggiornate — ' + esito.quante + ' in vetrina.' + strani;
    case 'vuoto':
      return 'Clip: Twitch non ne ha date per il periodo scelto, tengo le ' + esito.quante + ' che c erano.';
    case 'fallito':
      return 'Clip: non sono riuscito a chiederle a Twitch (' + esito.motivo + '). Tengo quelle che c erano.';
    default:
      return '';
  }
}

module.exports = {
  credenziali, configurato, appToken, dimenticaToken, helix,
  titoloUltimaDiretta, aggiornaUltimaDiretta, racconta,
  totaleFollower, contaFollower, aggiornaFollower, raccontaFollower,
  clipMigliori, aggiornaClip, raccontaClip,
  collegato, scollega, iniziaCollegamento, completaCollegamento, tentaCollegamento, infoCollegamento, numeriCanale,
  applicaNumeri, aggiornaNumeri, raccontaNumeri, formattaNumero, eNumeroNudo,
  SCOPE_ACCESSO, CAMPI_NUMERI,
  TIMEOUT_MS, HOST_ANTEPRIME, PERIODI
};
