'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const { P } = require('./percorsi');
const archivio = require('./archivio');
const { scriviAtomico, assicuraCartella } = require('./file');
const twitch = require('./twitch');

const FUSO = 'Europe/Rome';
const MINUTI_SLOT = 10;
const ORA_CAMBIO_GIORNATA = 6;
const MAX_PAGINE_CLIP = 10;
const MAX_ID_GIOCHI = 100;
const MAX_ID_IGDB = 500;
const MAX_GENERI = 3;
const HOST_COPERTINE = 'static-cdn.jtvnw.net';
const MISURA_COPERTINA = '285x380';
const RITARDO_PRIMO_CONTROLLO_MS = 5000;
const MARGINE_SLOT_MS = 60 * 1000;

const FORMA_SLOT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const FORMA_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMA_ID = /^[0-9]+$/;

const GENERI_IGDB = {
  'Shooter': 'Sparatutto',
  'Role-playing (RPG)': 'GDR',
  'Platform': 'Platform',
  'Adventure': 'Avventura',
  'Point-and-click': 'Avventura',
  'Simulator': 'Simulazione',
  'Puzzle': 'Puzzle',
  'Indie': 'Indie',
  'Sport': 'Sport',
  'Racing': 'Corse',
  'Strategy': 'Strategia',
  'Real Time Strategy (RTS)': 'Strategia',
  'Turn-based strategy (TBS)': 'Strategia',
  'Tactical': 'Strategia',
  'Fighting': 'Picchiaduro',
  'Quiz/Trivia': 'Quiz',
  'Hack and slash/Beat \'em up': 'Azione',
  'Arcade': 'Arcade',
  'Music': 'Musicale',
  'Visual Novel': 'Visual novel',
  'Card & Board Game': 'Carte e tavolo',
  'MOBA': 'MOBA',
  'Pinball': 'Flipper'
};

const TEMI_PRIMA = {
  'Horror': 'Horror',
  'Survival': 'Sopravvivenza',
  'Open world': 'Open world'
};

const TEMI_DOPO = {
  'Action': 'Azione',
  'Party': 'Party game',
  'Stealth': 'Stealth',
  'Sandbox': 'Sandbox'
};

const formatoRoma = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function percorsoSeme() {
  return path.join(P.server, 'modelli', 'giochi-seme.json');
}

function due(n) {
  return String(n).padStart(2, '0');
}

function slotDi(data) {
  const quando = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(quando.getTime())) { return ''; }
  const parti = {};
  for (const pezzo of formatoRoma.formatToParts(quando)) { parti[pezzo.type] = pezzo.value; }
  const ora = parti.hour === '24' ? '00' : parti.hour;
  const minuti = Math.floor(Number(parti.minute) / MINUTI_SLOT) * MINUTI_SLOT;
  return parti.year + '-' + parti.month + '-' + parti.day + 'T' + ora + ':' + due(minuti);
}

function giornataDi(slot) {
  const m = FORMA_SLOT.exec(String(slot || ''));
  if (!m) { return ''; }
  const giorno = m[1] + '-' + m[2] + '-' + m[3];
  if (Number(m[4]) >= ORA_CAMBIO_GIORNATA) { return giorno; }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1)).toISOString().slice(0, 10);
}

function msAlProssimoSlot(adesso) {
  const passo = MINUTI_SLOT * 60 * 1000;
  const ms = typeof adesso === 'number' ? adesso : Date.now();
  return passo - (ms % passo);
}

function testo(valore) {
  return typeof valore === 'string' ? valore.trim() : '';
}

function idValido(valore) {
  const id = valore === undefined || valore === null ? '' : String(valore).trim();
  return FORMA_ID.test(id) ? id : '';
}

function numero(valore) {
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function unDecimale(n) {
  return Math.round(n * 10) / 10;
}

function dataMinima(a, b) {
  if (!FORMA_DATA.test(a || '')) { return FORMA_DATA.test(b || '') ? b : ''; }
  if (!FORMA_DATA.test(b || '')) { return a; }
  return a < b ? a : b;
}

function dataMassima(a, b) {
  if (!FORMA_DATA.test(a || '')) { return FORMA_DATA.test(b || '') ? b : ''; }
  if (!FORMA_DATA.test(b || '')) { return a; }
  return a > b ? a : b;
}

function copertinaValida(url) {
  const grezzo = testo(url);
  if (!grezzo) { return ''; }
  let indirizzo;
  try { indirizzo = new URL(grezzo); } catch (e) { return ''; }
  if (indirizzo.protocol !== 'https:' || indirizzo.hostname.toLowerCase() !== HOST_COPERTINE) { return ''; }
  if (!indirizzo.pathname.startsWith('/ttv-boxart/')) { return ''; }
  return indirizzo.toString();
}

function copertinaDaTwitch(boxArtUrl) {
  return copertinaValida(testo(boxArtUrl).replace('{width}x{height}', MISURA_COPERTINA));
}

function copertinaDaPezzo(pezzo) {
  const p = testo(pezzo);
  if (!/^[A-Za-z0-9_.-]+$/.test(p)) { return ''; }
  return copertinaValida('https://' + HOST_COPERTINE + '/ttv-boxart/' + p + '-' + MISURA_COPERTINA + '.jpg');
}

function generiPuliti(elenco) {
  if (!Array.isArray(elenco)) { return []; }
  const fuori = [];
  for (const voce of elenco) {
    const nome = testo(voce);
    if (nome && fuori.indexOf(nome) === -1) { fuori.push(nome); }
    if (fuori.length >= MAX_GENERI) { break; }
  }
  return fuori;
}

function traduciGeneri(giocoIgdb) {
  const nomi = (lista) => (Array.isArray(lista) ? lista : [])
    .map((voce) => (voce && typeof voce === 'object' ? testo(voce.name) : testo(voce)))
    .filter(Boolean);
  const temi = nomi(giocoIgdb && giocoIgdb.themes);
  const generi = nomi(giocoIgdb && giocoIgdb.genres);
  const fuori = [];
  const aggiungi = (nome) => {
    if (nome && fuori.indexOf(nome) === -1 && fuori.length < MAX_GENERI) { fuori.push(nome); }
  };
  for (const tema of temi) { aggiungi(TEMI_PRIMA[tema]); }
  for (const genere of generi) { aggiungi(GENERI_IGDB[genere]); }
  for (const tema of temi) { aggiungi(TEMI_DOPO[tema]); }
  return fuori;
}

function generiDaRisposta(risposta) {
  const mappa = {};
  for (const voce of Array.isArray(risposta) ? risposta : []) {
    const id = idValido(voce && voce.id);
    if (id) { mappa[id] = traduciGeneri(voce); }
  }
  return mappa;
}

function raggruppaClip(clipGrezze) {
  const gruppi = {};
  for (const voce of Array.isArray(clipGrezze) ? clipGrezze : []) {
    const gameId = idValido(voce && voce.game_id);
    if (!gameId) { continue; }
    const gruppo = gruppi[gameId] || (gruppi[gameId] = { clip: 0, prima: '', ultima: '', migliore: null });
    gruppo.clip += 1;
    const giorno = giornataDi(slotDi(voce.created_at));
    gruppo.prima = dataMinima(gruppo.prima, giorno);
    gruppo.ultima = dataMassima(gruppo.ultima, giorno);

    const url = testo(voce.url);
    const titolo = testo(voce.title);
    if (!url || !/^https:\/\//i.test(url) || !titolo) { continue; }
    const visualizzazioni = Math.round(numero(voce.view_count));
    if (gruppo.migliore && gruppo.migliore.visualizzazioni >= visualizzazioni) { continue; }
    let anteprima = testo(voce.thumbnail_url);
    if (anteprima) {
      let host = '';
      try { host = new URL(anteprima).hostname.toLowerCase(); } catch (e) { host = ''; }
      if (twitch.HOST_ANTEPRIME.indexOf(host) === -1) { anteprima = ''; }
    }
    gruppo.migliore = { titolo: titolo, url: url, anteprima: anteprima, visualizzazioni: visualizzazioni };
  }
  return gruppi;
}

function pulisciRegistro(voci) {
  const visti = {};
  const fuori = [];
  for (const voce of Array.isArray(voci) ? voci : []) {
    const slot = testo(voce && voce.slot);
    const gameId = idValido(voce && voce.gameId);
    if (!FORMA_SLOT.test(slot) || !gameId || visti[slot]) { continue; }
    visti[slot] = true;
    fuori.push({ gameId: gameId, nome: testo(voce.nome), slot: slot });
  }
  fuori.sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  return fuori;
}

function raggruppaRegistro(voci) {
  const gruppi = {};
  for (const voce of pulisciRegistro(voci)) {
    const gruppo = gruppi[voce.gameId] || (gruppi[voce.gameId] = { nome: '', slot: 0, giornate: [], prima: '', ultima: '' });
    if (voce.nome) { gruppo.nome = voce.nome; }
    gruppo.slot += 1;
    const giornata = giornataDi(voce.slot);
    if (gruppo.giornate.indexOf(giornata) === -1) { gruppo.giornate.push(giornata); }
    gruppo.prima = dataMinima(gruppo.prima, giornata);
    gruppo.ultima = dataMassima(gruppo.ultima, giornata);
  }
  return gruppi;
}

function leggiJson(file) {
  let grezzo;
  try { grezzo = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e && e.code === 'ENOENT') { return { manca: true, dati: null }; }
    return { rotto: true, dati: null };
  }
  try { return { dati: JSON.parse(grezzo) }; } catch (e) { return { rotto: true, dati: null }; }
}

function leggiRegistro() {
  const letto = leggiJson(P.giochiRegistro);
  if (letto.rotto) { return { rotto: true, voci: [] }; }
  const voci = letto.dati && Array.isArray(letto.dati.voci) ? letto.dati.voci : [];
  return { rotto: false, voci: pulisciRegistro(voci) };
}

function registroSalvato() {
  return leggiRegistro().voci;
}

function annotaSlot(voce) {
  const nuova = pulisciRegistro([voce])[0];
  if (!nuova) { return { annotato: false, motivo: 'voce non valida' }; }
  const registro = leggiRegistro();
  if (registro.rotto) { return { annotato: false, motivo: 'registro illeggibile' }; }
  if (registro.voci.some((v) => v.slot === nuova.slot)) { return { annotato: false, motivo: 'gia annotato' }; }
  const voci = pulisciRegistro(registro.voci.concat([nuova]));
  assicuraCartella(path.dirname(P.giochiRegistro));
  scriviAtomico(P.giochiRegistro, JSON.stringify({ voci: voci }, null, 2) + '\n');
  return { annotato: true, slot: nuova.slot };
}

function semeGiochi() {
  const letto = leggiJson(percorsoSeme());
  const dati = letto.dati;
  return {
    fino: dati && FORMA_DATA.test(testo(dati.raccoltoIl)) ? testo(dati.raccoltoIl) : '',
    giochi: dati && Array.isArray(dati.giochi) ? dati.giochi : []
  };
}

function giochiSalvati() {
  const letto = leggiJson(P.giochiTwitch);
  const dati = letto.dati;
  if (!dati || !Array.isArray(dati.giochi)) { return null; }
  return dati;
}

function perId(elenco) {
  const mappa = {};
  for (const voce of Array.isArray(elenco) ? elenco : []) {
    const id = idValido(voce && voce.id);
    if (id && !mappa[id]) { mappa[id] = voce; }
  }
  return mappa;
}

function clipMiglioreValida(voce) {
  if (!voce || typeof voce !== 'object') { return null; }
  const url = testo(voce.url);
  const titolo = testo(voce.titolo);
  if (!url || !/^https:\/\//i.test(url) || !titolo) { return null; }
  return { titolo: titolo, url: url, anteprima: testo(voce.anteprima), visualizzazioni: Math.round(numero(voce.visualizzazioni)) };
}

function ordinaGiochi(elenco) {
  return elenco.sort((a, b) => {
    if (a.ultimaVolta !== b.ultimaVolta) { return a.ultimaVolta < b.ultimaVolta ? 1 : -1; }
    return a.nome.localeCompare(b.nome, 'it');
  });
}

function fondiGiochi(fonti) {
  const f = fonti || {};
  const seme = perId(f.seme);
  const precedenti = perId(f.precedenti);
  const clip = f.clip || {};
  const registro = raggruppaRegistro((f.registro || []).filter((v) => !f.semeFino || testo(v && v.slot).slice(0, 10) >= f.semeFino));
  const twitchGiochi = f.giochiTwitch || {};
  const generiIgdb = f.generiIgdb || null;

  const ids = [];
  const aggiungi = (id) => { const pulito = idValido(id); if (pulito && ids.indexOf(pulito) === -1) { ids.push(pulito); } };
  Object.keys(seme).forEach(aggiungi);
  Object.keys(clip).forEach(aggiungi);
  Object.keys(registro).forEach(aggiungi);

  const fuori = [];
  for (const id of ids) {
    const s = seme[id] || null;
    const p = precedenti[id] || null;
    const c = clip[id] || null;
    const r = registro[id] || null;
    const t = twitchGiochi[id] || null;

    const nome = testo(t && t.nome) || testo(r && r.nome) || testo(s && s.nome) || testo(p && p.nome);
    if (!nome) { continue; }

    const copertina = copertinaValida(t && t.copertina) || copertinaValida(p && p.copertina) || copertinaDaPezzo(s && s.copertina);

    let generi = [];
    const igdbId = idValido(t && t.igdbId);
    if (generiIgdb && igdbId && Array.isArray(generiIgdb[igdbId])) { generi = generiPuliti(generiIgdb[igdbId]); }
    if (!generi.length) { generi = generiPuliti(p && p.generi); }
    if (!generi.length) { generi = generiPuliti(s && s.generi); }

    const ultimaSeme = s && FORMA_DATA.test(testo(s.ultimaVolta)) ? testo(s.ultimaVolta) : '';
    const giornateNuove = r ? r.giornate.filter((g) => !ultimaSeme || g > ultimaSeme).length : 0;
    const dirette = Math.round(numero(s && s.dirette)) + giornateNuove;
    const ore = unDecimale(numero(s && s.ore) + (r ? r.slot * MINUTI_SLOT / 60 : 0));
    const quanteClip = Math.max(Math.round(numero(s && s.clip)), c ? c.clip : 0);

    let primaVolta = '';
    let ultimaVolta = '';
    for (const [prima, ultima] of [[s && testo(s.primaVolta), ultimaSeme], [c && c.prima, c && c.ultima], [r && r.prima, r && r.ultima]]) {
      primaVolta = dataMinima(primaVolta, prima || '');
      ultimaVolta = dataMassima(ultimaVolta, ultima || '');
    }

    fuori.push({
      id: id,
      nome: nome,
      copertina: copertina,
      generi: generi,
      dirette: dirette,
      ore: ore,
      clip: quanteClip,
      primaVolta: primaVolta,
      ultimaVolta: ultimaVolta,
      clipMigliore: clipMiglioreValida(c && c.migliore)
    });
  }
  return ordinaGiochi(fuori);
}

function giochiDaRisposta(risposta) {
  const mappa = {};
  for (const voce of risposta && Array.isArray(risposta.data) ? risposta.data : []) {
    const id = idValido(voce && voce.id);
    if (!id) { continue; }
    mappa[id] = { nome: testo(voce.name), copertina: copertinaDaTwitch(voce.box_art_url), igdbId: idValido(voce.igdb_id) };
  }
  return mappa;
}

function aPezzi(elenco, misura) {
  const pezzi = [];
  for (let i = 0; i < elenco.length; i += misura) { pezzi.push(elenco.slice(i, i + misura)); }
  return pezzi;
}

async function tutteLeClip(idUtente) {
  const id = encodeURIComponent(String(idUtente));
  const tutte = [];
  let cursore = '';
  for (let pagina = 0; pagina < MAX_PAGINE_CLIP; pagina += 1) {
    const risposta = await twitch.helix('/clips?broadcaster_id=' + id + '&first=100' +
      (cursore ? '&after=' + encodeURIComponent(cursore) : ''));
    const voci = risposta && Array.isArray(risposta.data) ? risposta.data : [];
    tutte.push(...voci);
    cursore = risposta && risposta.pagination && typeof risposta.pagination.cursor === 'string' ? risposta.pagination.cursor : '';
    if (!cursore || !voci.length) { break; }
  }
  return tutte;
}

async function giochiDaTwitch(ids) {
  const mappa = {};
  for (const pezzo of aPezzi(ids, MAX_ID_GIOCHI)) {
    const risposta = await twitch.helix('/games?' + pezzo.map((id) => 'id=' + encodeURIComponent(id)).join('&'));
    Object.assign(mappa, giochiDaRisposta(risposta));
  }
  return mappa;
}

function chiediIgdb(corpo, chiavi, token) {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = https.request({
      method: 'POST',
      hostname: 'api.igdb.com',
      path: '/v4/games',
      headers: {
        'Client-ID': chiavi.clientId,
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(corpo)
      }
    }, (risposta) => {
      const pezzi = [];
      risposta.on('data', (pezzo) => pezzi.push(pezzo));
      risposta.on('end', () => {
        const letto = Buffer.concat(pezzi).toString('utf8');
        if (risposta.statusCode < 200 || risposta.statusCode >= 300) {
          rifiuta(new Error('IGDB ha risposto ' + risposta.statusCode + ': ' + letto.replace(/\s+/g, ' ').trim().slice(0, 200)));
          return;
        }
        try { risolvi(JSON.parse(letto)); } catch (e) { rifiuta(new Error('IGDB ha risposto qualcosa che non e JSON.')); }
      });
    });
    richiesta.setTimeout(twitch.TIMEOUT_MS, () => {
      richiesta.destroy(new Error('IGDB non ha risposto entro ' + (twitch.TIMEOUT_MS / 1000) + ' secondi.'));
    });
    richiesta.on('error', rifiuta);
    richiesta.write(corpo);
    richiesta.end();
  });
}

function corpoIgdb(ids) {
  return 'fields id,genres.name,themes.name; where id = (' + ids.join(',') + '); limit ' + MAX_ID_IGDB + ';';
}

async function generiDaIgdb(igdbIds) {
  const chiavi = twitch.credenziali();
  if (!chiavi) { throw new Error('Twitch non e configurato.'); }
  const token = await twitch.appToken();
  const mappa = {};
  for (const pezzo of aPezzi(igdbIds, MAX_ID_IGDB)) {
    Object.assign(mappa, generiDaRisposta(await chiediIgdb(corpoIgdb(pezzo), chiavi, token)));
  }
  return mappa;
}

function idCanale() {
  const contenuti = archivio.leggi();
  const config = (contenuti && contenuti.config) || {};
  return config.twitch && typeof config.twitch.idUtente === 'string' ? config.twitch.idUtente.trim() : '';
}

async function controllaDiretta(idUtente) {
  const risposta = await twitch.helix('/streams?user_id=' + encodeURIComponent(String(idUtente)));
  const diretta = risposta && Array.isArray(risposta.data) ? risposta.data.find((v) => v && v.type === 'live') : null;
  if (!diretta) { return { inOnda: false, annotato: false }; }
  const gameId = idValido(diretta.game_id);
  if (!gameId) { return { inOnda: true, annotato: false }; }
  const esito = annotaSlot({ gameId: gameId, nome: testo(diretta.game_name), slot: slotDi(new Date()) });
  return { inOnda: true, annotato: esito.annotato, gioco: testo(diretta.game_name) };
}

async function aggiornaGiochi() {
  let chiavi;
  try {
    chiavi = twitch.credenziali();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!chiavi) { return { stato: 'spento' }; }

  let idUtente;
  try {
    idUtente = idCanale();
  } catch (errore) {
    return { stato: 'fallito', motivo: errore.message };
  }
  if (!idUtente) { return { stato: 'senzaCanale' }; }

  let inOnda = false;
  try { inOnda = (await controllaDiretta(idUtente)).inOnda; } catch (e) { inOnda = false; }

  try {
    const clipGrezze = await tutteLeClip(idUtente);
    const clip = raggruppaClip(clipGrezze);
    const seme = semeGiochi();
    const salvati = giochiSalvati();
    const registro = registroSalvato();

    const ids = [];
    const aggiungi = (id) => { const pulito = idValido(id); if (pulito && ids.indexOf(pulito) === -1) { ids.push(pulito); } };
    seme.giochi.forEach((g) => aggiungi(g && g.id));
    Object.keys(clip).forEach(aggiungi);
    registro.forEach((v) => aggiungi(v.gameId));

    const daTwitch = ids.length ? await giochiDaTwitch(ids) : {};

    let generiIgdb = null;
    let motivoIgdb = '';
    const igdbIds = [];
    for (const id of Object.keys(daTwitch)) {
      if (daTwitch[id].igdbId && igdbIds.indexOf(daTwitch[id].igdbId) === -1) { igdbIds.push(daTwitch[id].igdbId); }
    }
    if (igdbIds.length) {
      try { generiIgdb = await generiDaIgdb(igdbIds); } catch (errore) { generiIgdb = null; motivoIgdb = errore.message; }
    }

    const giochi = fondiGiochi({
      seme: seme.giochi,
      semeFino: seme.fino,
      precedenti: salvati ? salvati.giochi : [],
      clip: clip,
      registro: registro,
      giochiTwitch: daTwitch,
      generiIgdb: generiIgdb
    });

    assicuraCartella(path.dirname(P.giochiTwitch));
    scriviAtomico(P.giochiTwitch, JSON.stringify({ letteIl: new Date().toISOString(), giochi: giochi }, null, 2) + '\n');
    return {
      stato: 'aggiornato',
      giochi: giochi.length,
      clip: clipGrezze.length,
      inOnda: inOnda,
      generi: generiIgdb ? 'igdb' : 'precedenti',
      motivoIgdb: motivoIgdb
    };
  } catch (errore) {
    return { stato: 'fallito', motivo: errore && errore.message ? errore.message : String(errore) };
  }
}

function raccontaGiochi(esito) {
  if (!esito || !esito.stato) { return ''; }
  switch (esito.stato) {
    case 'spento':
      return 'Giochi: il collegamento con Twitch non e configurato, la pagina dei giochi usa l elenco di partenza.';
    case 'senzaCanale':
      return 'Giochi: manca l ID del canale (campo config.twitch.idUtente), non ho chiesto niente a Twitch.';
    case 'aggiornato':
      return 'Giochi: ' + esito.giochi + (esito.giochi === 1 ? ' gioco' : ' giochi') + ' da ' + esito.clip + ' clip e dal registro delle dirette' +
        (esito.generi === 'igdb' ? '.' : '; le tipologie restano quelle di prima (IGDB non ha risposto).');
    case 'fallito':
      return 'Giochi: non sono riuscito a chiederli a Twitch (' + esito.motivo + '). Tengo l elenco di prima.';
    default:
      return '';
  }
}

function avviaControllo() {
  if (!twitch.configurato()) { return null; }
  const giro = async () => {
    try {
      const id = idCanale();
      if (id) { await controllaDiretta(id); }
    } catch (e) {
      return;
    }
  };
  let battito = null;
  const primo = setTimeout(giro, RITARDO_PRIMO_CONTROLLO_MS);
  const allineato = setTimeout(() => {
    giro();
    battito = setInterval(giro, MINUTI_SLOT * 60 * 1000);
    battito.unref();
  }, msAlProssimoSlot(Date.now()) + MARGINE_SLOT_MS);
  primo.unref();
  allineato.unref();
  return {
    giro: giro,
    ferma: () => { clearTimeout(primo); clearTimeout(allineato); if (battito) { clearInterval(battito); } }
  };
}

module.exports = {
  aggiornaGiochi, raccontaGiochi, avviaControllo, controllaDiretta, annotaSlot,
  slotDi, giornataDi, msAlProssimoSlot, traduciGeneri, generiDaRisposta, raggruppaClip, raggruppaRegistro,
  pulisciRegistro, fondiGiochi, giochiDaRisposta, copertinaDaTwitch, copertinaDaPezzo, copertinaValida,
  corpoIgdb, semeGiochi, giochiSalvati, registroSalvato,
  MINUTI_SLOT, MAX_GENERI, MAX_PAGINE_CLIP
};
