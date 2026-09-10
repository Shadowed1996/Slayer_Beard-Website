'use strict';
/* =====================================================================
   twitch.js — l'unico punto in cui il SERVER LOCALE parla con Twitch.

   Esiste per una ragione sola: «Ultima diretta» era un campo scritto a
   mano, e nessuno lo aggiornava. Per chi si collega col proprio account
   ci pensa js/canale.js dal browser; ma il visitatore anonimo — cioe la
   quasi totalita — vede quello che c'era scritto in contenuti.json il
   giorno in cui qualcuno si e ricordato di cambiarlo. Qui il titolo si
   prende alla PUBBLICAZIONE, con un app token, e finisce dentro
   contenuti.json: da quel momento e fresco per tutti, senza che il sito
   pubblicato debba chiamare nessuno.

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

module.exports = {
  credenziali, configurato, appToken, dimenticaToken, helix,
  titoloUltimaDiretta, aggiornaUltimaDiretta, racconta, TIMEOUT_MS
};
