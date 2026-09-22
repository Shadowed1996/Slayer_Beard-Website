'use strict';

const fs = require('node:fs');
const https = require('node:https');
const crypto = require('node:crypto');

const { P } = require('./percorsi');
const archivio = require('./archivio');
const controlli = require('./controlli');
const { scriviAtomico, assicuraCartella } = require('./file');
const spotify = require('./spotify');

const TIMEOUT_MS = 8000;
const ANTICIPO_MS = 60 * 1000;
const DURATA_COLLEGAMENTO_MS = 10 * 60 * 1000;
const FRESCHEZZA_MS = 20 * 1000;
const SCOPE = 'user-read-currently-playing user-read-playback-state';
const RE_CLIENT_ID = /^[0-9a-f]{32}$/;

let tokenInCache = null;
let rinnovoInCorso = null;
let pendente = null;
let ultimaLettura = null;
let letturaInCorso = null;
let ultimoEsito = null;

function configurazione() {
  let config = {};
  try { config = archivio.leggi().config || {}; } catch (e) { config = {}; }
  const voce = (config.spotify && typeof config.spotify === 'object') ? config.spotify : {};
  const clientId = String(voce.clientId || '').trim();
  return {
    config: config,
    clientId: RE_CLIENT_ID.test(clientId) ? clientId : '',
    segui: voce.attivo === true && voce.segui === true
  };
}

function problemaClientId(valore) {
  const testo = String(valore == null ? '' : valore).trim();
  if (RE_CLIENT_ID.test(testo)) { return null; }
  return 'un Client ID di Spotify ha 32 caratteri, solo cifre e lettere minuscole dalla a alla f. Lo trovi su developer.spotify.com/dashboard, nella pagina della tua app («Settings»). Il «Client secret» non serve e non va messo qui.';
}

function leggiAccesso() {
  try {
    const dati = JSON.parse(fs.readFileSync(P.accessoSpotify, 'utf8'));
    if (!dati || typeof dati.refresh !== 'string' || !dati.refresh) { return null; }
    return dati;
  } catch (e) {
    return null;
  }
}

function salvaAccesso(dati) {
  assicuraCartella(P.dati);
  scriviAtomico(P.accessoSpotify, JSON.stringify(dati, null, 2) + '\n');
}

function chiedi(opzioni, corpo) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request(opzioni, (risposta) => {
      const pezzi = [];
      risposta.on('data', (pezzo) => pezzi.push(pezzo));
      risposta.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        let dati = null;
        try { dati = testo ? JSON.parse(testo) : null; } catch (e) { dati = null; }
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) {
          const errore = new Error('Spotify ha risposto ' + risposta.statusCode + ': ' + testo.replace(/\s+/g, ' ').trim().slice(0, 200));
          errore.codice = risposta.statusCode;
          errore.risposta = dati;
          rifiuta(errore);
          return;
        }
        risolvi({ stato: risposta.statusCode, dati: dati });
      });
    });
    richiesta.setTimeout(TIMEOUT_MS, () => {
      richiesta.destroy(new Error('Spotify non ha risposto entro ' + (TIMEOUT_MS / 1000) + ' secondi.'));
    });
    richiesta.on('error', rifiuta);
    if (corpo !== undefined) { richiesta.write(corpo); }
    richiesta.end();
  });
}

function postToken(campi) {
  const corpo = new URLSearchParams(campi).toString();
  return chiedi({
    method: 'POST',
    hostname: 'accounts.spotify.com',
    path: '/api/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo) }
  }, corpo);
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function indirizzoRitorno(req, config) {
  const sito = controlli.indirizzoSito(config);
  if (sito.indirizzo) { return new URL('api/spotify/ritorno', sito.indirizzo).toString(); }
  const inoltrato = String((req && req.headers && req.headers['x-forwarded-proto']) || '').split(',')[0].trim();
  const protocollo = inoltrato || (req && req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = String((req && req.headers && req.headers.host) || '127.0.0.1').replace(/^localhost(?=:|$)/i, '127.0.0.1');
  return protocollo + '://' + host + '/api/spotify/ritorno';
}

function iniziaCollegamento(req) {
  const { config, clientId } = configurazione();
  if (!clientId) {
    throw new Error('Prima scrivi il Client ID della tua app Spotify nel campo qui sopra, e salva.');
  }
  const verificatore = base64url(crypto.randomBytes(48));
  const sfida = base64url(crypto.createHash('sha256').update(verificatore).digest());
  const stato = base64url(crypto.randomBytes(24));
  const ritorno = indirizzoRitorno(req, config);
  pendente = { stato: stato, verificatore: verificatore, ritorno: ritorno, clientId: clientId, scadeAlle: Date.now() + DURATA_COLLEGAMENTO_MS };
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: ritorno,
    state: stato,
    code_challenge_method: 'S256',
    code_challenge: sfida
  });
  return { indirizzo: 'https://accounts.spotify.com/authorize?' + query.toString(), ritorno: ritorno };
}

function statiUguali(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function completaCollegamento(parametri) {
  const attuale = pendente;
  if (!attuale || Date.now() > attuale.scadeAlle) {
    pendente = null;
    return { ok: false, messaggio: 'Il collegamento è scaduto o non era stato avviato: torna nel pannello e premi di nuovo «Collega Spotify».' };
  }
  if (!statiUguali(parametri.state, attuale.stato)) {
    return { ok: false, messaggio: 'Questo ritorno da Spotify non corrisponde al collegamento avviato dal pannello, quindi l\'ho ignorato.' };
  }
  pendente = null;
  if (parametri.error) {
    return { ok: false, messaggio: parametri.error === 'access_denied' ? 'Hai rifiutato l\'autorizzazione su Spotify: niente è cambiato.' : 'Spotify ha risposto: ' + String(parametri.error).slice(0, 80) };
  }
  if (!parametri.code) { return { ok: false, messaggio: 'Spotify non ha mandato il codice di autorizzazione.' }; }

  let risposta;
  try {
    risposta = await postToken({
      grant_type: 'authorization_code',
      code: String(parametri.code),
      redirect_uri: attuale.ritorno,
      client_id: attuale.clientId,
      code_verifier: attuale.verificatore
    });
  } catch (errore) {
    return { ok: false, messaggio: 'Non sono riuscito a completare il collegamento: ' + errore.message };
  }
  const dati = risposta.dati || {};
  if (!dati.access_token || !dati.refresh_token) { return { ok: false, messaggio: 'Spotify non ha mandato i token attesi.' }; }
  tokenInCache = { valore: dati.access_token, scadeIl: Date.now() + (Number(dati.expires_in) || 3600) * 1000 };

  let nome = '';
  try {
    const profilo = await chiedi({ method: 'GET', hostname: 'api.spotify.com', path: '/v1/me', headers: { Authorization: 'Bearer ' + dati.access_token } });
    nome = String((profilo.dati && (profilo.dati.display_name || profilo.dati.id)) || '');
  } catch (e) {
    nome = '';
  }
  salvaAccesso({ refresh: dati.refresh_token, clientId: attuale.clientId, nome: nome, collegatoIl: new Date().toISOString() });
  ultimaLettura = null;
  return { ok: true, nome: nome };
}

function scollega() {
  pendente = null;
  tokenInCache = null;
  ultimaLettura = null;
  let cera = false;
  try { fs.unlinkSync(P.accessoSpotify); cera = true; } catch (e) { cera = false; }
  return cera;
}

function info(req) {
  const { config, clientId, segui } = configurazione();
  const accesso = leggiAccesso();
  return {
    clientId: clientId !== '',
    collegato: !!accesso,
    nome: accesso ? String(accesso.nome || '') : '',
    segui: segui,
    ritorno: indirizzoRitorno(req, config),
    ultimo: ultimoEsito
  };
}

async function rinnova() {
  const accesso = leggiAccesso();
  if (!accesso) { throw new Error('Spotify non è collegato.'); }
  const clientId = accesso.clientId || configurazione().clientId;
  let risposta;
  try {
    risposta = await postToken({ grant_type: 'refresh_token', refresh_token: accesso.refresh, client_id: clientId });
  } catch (errore) {
    if (errore.codice === 400 && errore.risposta && errore.risposta.error === 'invalid_grant') {
      try { fs.unlinkSync(P.accessoSpotify); } catch (e) { tokenInCache = null; }
    }
    throw errore;
  }
  const dati = risposta.dati || {};
  if (!dati.access_token) { throw new Error('Spotify non ha rinnovato il token.'); }
  if (dati.refresh_token && dati.refresh_token !== accesso.refresh) {
    salvaAccesso(Object.assign({}, accesso, { refresh: dati.refresh_token }));
  }
  tokenInCache = { valore: dati.access_token, scadeIl: Date.now() + (Number(dati.expires_in) || 3600) * 1000 };
  return tokenInCache.valore;
}

async function tokenAccesso() {
  if (tokenInCache && tokenInCache.scadeIl - ANTICIPO_MS > Date.now()) { return tokenInCache.valore; }
  if (!rinnovoInCorso) {
    rinnovoInCorso = rinnova().finally(() => { rinnovoInCorso = null; });
  }
  return rinnovoInCorso;
}

async function api(percorso) {
  const token = await tokenAccesso();
  return chiedi({ method: 'GET', hostname: 'api.spotify.com', path: '/v1' + percorso, headers: { Authorization: 'Bearer ' + token } });
}

function daUri(uri) {
  const m = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(String(uri || ''));
  if (!m || spotify.TIPI.indexOf(m[1]) === -1) { return null; }
  return { tipo: m[1], id: m[2] };
}

async function nomeDelContesto(contesto) {
  const percorsi = { playlist: '/playlists/' + contesto.id + '?fields=name', album: '/albums/' + contesto.id, artist: '/artists/' + contesto.id, show: '/shows/' + contesto.id };
  if (!percorsi[contesto.tipo]) { return ''; }
  try {
    const risposta = await api(percorsi[contesto.tipo]);
    return String((risposta.dati && risposta.dati.name) || '');
  } catch (e) {
    return '';
  }
}

function segna(esito) {
  ultimoEsito = Object.assign({ quando: new Date().toISOString() }, esito);
}

async function leggi() {
  const nessuno = { inAscolto: false };
  const { segui } = configurazione();
  if (!segui) { segna({ stato: 'spento' }); return nessuno; }
  if (!leggiAccesso()) { segna({ stato: 'scollegato' }); return nessuno; }
  let risposta;
  try {
    risposta = await api('/me/player/currently-playing?additional_types=episode');
  } catch (errore) {
    segna({ stato: 'errore', messaggio: errore.message });
    throw errore;
  }
  const dati = risposta.dati;
  if (risposta.stato === 204 || !dati || !dati.item) { segna({ stato: 'fermo' }); return nessuno; }
  if (!dati.is_playing) { segna({ stato: 'pausa' }); return nessuno; }
  const brano = daUri(dati.item.uri);
  if (!brano) { return nessuno; }
  const artisti = Array.isArray(dati.item.artists)
    ? dati.item.artists.map((a) => a && a.name).filter(Boolean).join(', ')
    : String((dati.item.show && dati.item.show.name) || '');
  const contesto = dati.context ? daUri(dati.context.uri) : null;
  const precedente = ultimaLettura && ultimaLettura.risultato;
  let nomeContesto = '';
  if (contesto) {
    nomeContesto = precedente && precedente.contesto && precedente.contesto.id === contesto.id
      ? precedente.contesto.nome
      : await nomeDelContesto(contesto);
  }
  segna({ stato: 'ascolta', brano: String(dati.item.name || ''), artisti: artisti });
  return {
    inAscolto: true,
    brano: { tipo: brano.tipo, id: brano.id, titolo: String(dati.item.name || ''), artisti: artisti },
    contesto: contesto ? { tipo: contesto.tipo, id: contesto.id, nome: nomeContesto } : null,
    src: spotify.indirizzoIncorporato('spotify:' + (contesto || brano).tipo + ':' + (contesto || brano).id)
  };
}

async function oraInAscolto(fresca) {
  if (!fresca && ultimaLettura && Date.now() - ultimaLettura.letta < FRESCHEZZA_MS) { return ultimaLettura.risultato; }
  if (!letturaInCorso) {
    letturaInCorso = leggi()
      .catch(() => ({ inAscolto: false }))
      .then((risultato) => {
        ultimaLettura = { letta: Date.now(), risultato: risultato };
        return risultato;
      })
      .finally(() => { letturaInCorso = null; });
  }
  return letturaInCorso;
}

module.exports = {
  SCOPE, RE_CLIENT_ID,
  problemaClientId, indirizzoRitorno, iniziaCollegamento, completaCollegamento, scollega, info,
  oraInAscolto, daUri
};
