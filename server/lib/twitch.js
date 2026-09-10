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
   sta in server/dati/twitch.json, sul computer di chi amministra,
   accanto alla password del pannello, e server/ non si carica online.
   La deroga e motivata nel CONTRATTO-3, §4.6.

   Il token che si prende qui e un APP token (client_credentials): non
   appartiene a nessuna persona, non puo leggere niente di privato e non
   puo scrivere in chat. Serve solo perche dalla fine del 2021 Twitch non
   risponde piu a helix senza un token qualsiasi.

   Si usa node:https e non fetch: fetch su Node 18 stampa un avviso di
   funzione sperimentale a ogni pubblicazione, e node:https e la stessa
   famiglia di node:http che il server usa gia.
   ===================================================================== */

const https = require('node:https');

const { P } = require('./percorsi');
const archivio = require('./archivio');
const { leggiSeEsiste } = require('./file');

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
 * Legge server/dati/twitch.json.
 * Ritorna null se il file non c'e o non ha le due chiavi: e la condizione
 * normale di chi non ha registrato nessuna app, e non e un errore.
 */
function credenziali() {
  const grezzo = leggiSeEsiste(P.twitch);
  if (grezzo === null) { return null; }

  let dati;
  try {
    dati = JSON.parse(grezzo);
  } catch (e) {
    // Un file rotto e diverso da un file assente: qui qualcuno ha provato
    // a configurarlo e va detto, invece di comportarsi come se non ci fosse.
    throw new Error(P.twitch + ' non e JSON valido: ' + e.message);
  }

  const clientId = dati && typeof dati.clientId === 'string' ? dati.clientId.trim() : '';
  const clientSecret = dati && typeof dati.clientSecret === 'string' ? dati.clientSecret.trim() : '';
  if (!clientId || !clientSecret) { return null; }
  return { clientId: clientId, clientSecret: clientSecret };
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
          rifiuta(new Error('Twitch ha risposto ' + risposta.statusCode + ': ' + testo.slice(0, 200)));
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
  if (!chiavi) { throw new Error('Manca ' + P.twitch + ': lancia node server/imposta-twitch.js.'); }

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
  // ogni pubblicazione per riempire un ramo che nessuno stampa.
  if (clip.attivo !== true) { return { stato: 'spento' }; }
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

/** Lo stesso, per le clip. */
function raccontaClip(esito) {
  if (!esito || !esito.stato) { return ''; }
  const strani = (esito.hostStrani && esito.hostStrani.length)
    ? ' Attenzione: ' + esito.hostStrani.length + (esito.hostStrani.length === 1 ? ' anteprima arriva' : ' anteprime arrivano')
      + ' da un host che la CSP non conosce (' + esito.hostStrani.join(', ') + '), e quelle card restano senza immagine.'
    : '';
  switch (esito.stato) {
    case 'spento':
      return 'Clip: sezione spenta o collegamento con Twitch non configurato, non ho chiesto niente.';
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
  clipMigliori, aggiornaClip, raccontaClip,
  TIMEOUT_MS, HOST_ANTEPRIME, PERIODI
};
