'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { P } = require('./percorsi');
const { scriviAtomico, eFile } = require('./file');
const { erroreHttp } = require('./risposte');
const modello = require('./modello');
const archivio = require('./archivio');
const convalida = require('./convalida');

const controlli = require('./controlli');
const testoricco = require('./testoricco.js');
const tema = require('./tema.js');
const font = require('./font');
const backup = require('./backup');

const twitch = require('./twitch');

const youtube = require('./youtube');
const schema = require('../../contenuti/schema.js');

const SBOrari = require('../../pannello/condivisi/orari.js');

function leggiIcona(nome, cache, mancanti) {
  if (cache.has(nome)) { return cache.get(nome); }
  const file = path.join(P.icone, nome + '.svg');
  let contenuto = '';
  try {
    contenuto = fs.readFileSync(file, 'utf8')
      .replace(/^﻿/, '')
      .replace(/<\?xml[^>]*\?>\s*/i, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
  } catch (e) {
    mancanti.push(path.relative(P.radice, file));
  }
  cache.set(nome, contenuto);
  return contenuto;
}

function elencoVisibile(voci, cache, mancanti) {
  const fuori = [];
  for (const voce of voci || []) {
    if (!voce || typeof voce.url !== 'string' || !voce.url.trim()) { continue; }
    fuori.push(Object.assign({}, voce, { svg: leggiIcona(String(voce.icona || ''), cache, mancanti) }));
  }
  return fuori;
}

function conContatore(voce, config) {
  let numero = null;
  if (voce.contatore === 'twitch') {
    const follower = Number((config.dati || {}).follower);
    numero = Number.isFinite(follower) && follower > 0 ? follower : null;
  } else if (voce.contatore === 'youtube') {
    numero = youtube.iscrittiDi(config, voce.url);
  }
  const goal = Number(voce.goal);
  return Object.assign({}, voce, {
    numeroTesto: numero === null ? '' : numeroTesto(numero),
    numeroEtichetta: String(voce.contatoreEtichetta || '').trim() || 'Iscritti',
    goalTesto: numero !== null && Number.isFinite(goal) && goal > 0 ? numeroTesto(goal) : '',

    eTwitch: voce.contatore === 'twitch'
  });
}

function orariDi(config) {
  return SBOrari.normalizza(config && config.orari);
}

function momentoDi(scelte) {
  if (scelte && typeof scelte.adesso === 'number' && Number.isFinite(scelte.adesso)) { return scelte.adesso; }
  const letto = scelte && typeof scelte.quando === 'string' ? Date.parse(scelte.quando) : NaN;
  return Number.isFinite(letto) ? letto : Date.now();
}

const FRESCHEZZA_CATEGORIA_MS = 15 * 60 * 1000;

function categoriaDiretta(scelte, adesso) {
  if (scelte && typeof scelte.categoriaDiretta === 'string') { return scelte.categoriaDiretta.trim(); }
  let letta = null;
  try { letta = twitch.direttaSalvata(); } catch (e) { return ''; }
  if (!letta || !letta.inOnda || !letta.categoria) { return ''; }
  const quando = Date.parse(letta.letteIl);
  if (!Number.isFinite(quando)) { return ''; }

  if (Math.abs(adesso - quando) > FRESCHEZZA_CATEGORIA_MS) { return ''; }
  return letta.categoria.trim();
}

function percento(n) {
  return Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
}

function frazione(n) {
  return String(percento(n) / 100);
}

function stileImmagine(immagine, fuoco, nome, valore) {
  if (!immagine) { return ''; }
  const f = fuoco || {};
  return '--fuoco: ' + percento(f.x) + '% ' + percento(f.y) + '%; --' + nome + ': ' + frazione(valore);
}

function dataDiQuestaSettimana(adesso, fuso, indice) {
  for (let salto = 0; salto < 7; salto++) {
    const data = SBOrari.dataNelFuso(adesso + salto * 86400000, fuso);
    if (data && SBOrari.giornoDellaSettimana(data) === indice) { return data; }
  }
  return '';
}

function settimanaDi(config, testi, adesso) {
  const orari = orariDi(config);

  const sostituito = SBOrari.programmaSostituito(orari, adesso);
  return SBOrari.ORDINE.map((indice) => {
    const giorno = SBOrari.GIORNI[indice];
    const diretta = orari.giorni.indexOf(indice) !== -1;
    const scheda = orari.schede[indice];
    const ora = diretta ? SBOrari.oraDi(orari, indice) : '';
    const titolo = diretta ? scheda.titolo : '';
    const gioco = diretta ? scheda.gioco : '';
    const nota = diretta ? scheda.nota : '';
    const immagine = diretta ? scheda.immagine : '';

    const dataOggi = dataDiQuestaSettimana(adesso, orari.fuso, indice);
    const pausa = dataOggi ? SBOrari.pausaDi(orari, dataOggi) : null;
    return {
      indice: indice,
      abbr: giorno.abbr,
      nome: giorno.nome,
      diretta: diretta,
      ora: ora,
      fine: diretta ? SBOrari.fine(ora, SBOrari.durataDi(orari, indice)) : '',
      tag: diretta ? (testi['settimana.etichettaDiretta'] || '') : (testi['settimana.etichettaRiposo'] || ''),
      titolo: titolo,
      gioco: gioco,
      nota: nota,

      contenuto: !!(titolo || gioco || nota),

      sostituito: (!pausa && sostituito.giorni[indice])
        ? (sostituito.evento.titolo || testi['settimana.etichettaEvento'] || '')
        : '',
      immagine: immagine,
      stile: stileImmagine(immagine, scheda.fuoco, 'velo', scheda.velo),
      saltata: !!pausa,
      motivoSaltata: pausa ? pausa.motivo : ''
    };
  });
}

function dataInParole(data) {
  const d = data.split('-').map(Number);
  const giorno = SBOrari.GIORNI[SBOrari.giornoDellaSettimana(data)];
  const mese = SBOrari.MESI[d[1] - 1];
  return giorno.minuscolo + ' ' + d[2] + ' ' + mese.nome;
}

function eventiDi(orari, adesso, categoria) {
  const inOnda = typeof categoria === 'string' ? categoria.trim() : '';
  const acceso = inOnda ? SBOrari.eventoAttivo(orari, adesso) : null;
  return SBOrari.eventiFuturi(orari, adesso).map((evento) => {
    const d = evento.data.split('-').map(Number);
    const giorno = SBOrari.GIORNI[SBOrari.giornoDellaSettimana(evento.data)];
    const mese = SBOrari.MESI[d[1] - 1];

    const gioco = (acceso && acceso.indice === evento.indice) ? inOnda : evento.gioco;
    return {
      indice: evento.indice,
      data: evento.data,
      ora: evento.ora,

      fine: evento.durataOre === null ? '' : SBOrari.oraNelFuso(evento.termine, orari.fuso),
      abbr: giorno.abbr,
      giorno: giorno.nome,
      numero: String(d[2]),
      mese: mese.abbr,
      dataTesto: giorno.minuscolo + ' ' + d[2] + ' ' + mese.nome,
      inizio: new Date(evento.inizio).toISOString(),
      termine: new Date(evento.termine).toISOString(),
      titolo: evento.titolo,
      gioco: gioco,
      nota: evento.nota,
      contenuto: !!(gioco || evento.nota),
      immagine: evento.immagine,
      stile: stileImmagine(evento.immagine, evento.fuoco, 'velo', evento.velo),

      ultimoGiornoTesto: evento.ultimoGiorno ? dataInParole(evento.ultimoGiorno) : ''
    };
  });
}

function sfondoDi(orari) {
  const sfondo = orari.sfondo;
  const immagine = sfondo.intensita > 0 ? sfondo.immagine : '';
  return { immagine: immagine, stile: stileImmagine(immagine, sfondo.fuoco, 'intensita', sfondo.intensita) };
}

const MESI = SBOrari.MESI.map((mese) => mese.nome);

function durataTesto(secondi) {
  const totale = Math.max(0, Math.round(Number(secondi) || 0));
  const minuti = Math.floor(totale / 60);
  const resto = totale % 60;
  return minuti + ':' + String(resto).padStart(2, '0');
}

function numeroTesto(valore) {
  const n = Math.max(0, Math.round(Number(valore) || 0));
  const cifre = String(n);
  let fuori = '';
  for (let i = 0; i < cifre.length; i++) {
    if (i > 0 && (cifre.length - i) % 3 === 0) { fuori += '.'; }
    fuori += cifre[i];
  }
  return fuori;
}

function dataTesto(iso) {
  const quando = new Date(String(iso || ''));
  if (Number.isNaN(quando.getTime())) { return ''; }
  return quando.getUTCDate() + ' ' + MESI[quando.getUTCMonth()] + ' ' + quando.getUTCFullYear();
}

function clipDi(config, testi) {
  const clip = (config.clip && typeof config.clip === 'object') ? config.clip : {};
  const grezze = Array.isArray(clip.voci) ? clip.voci : [];

  let quante = Number(clip.quante);
  if (!Number.isFinite(quante)) { quante = 6; }
  quante = Math.min(12, Math.max(1, Math.round(quante)));

  const voci = [];
  for (const voce of grezze) {
    const url = String((voce && voce.url) || '').trim();
    const titolo = String((voce && voce.titolo) || '').trim();
    if (!url || !titolo) { continue; }
    const autore = String((voce && voce.autore) || '').trim();
    voci.push({
      titolo: titolo,
      url: url,
      anteprima: String((voce && voce.anteprima) || '').trim(),
      durata: durataTesto(voce && voce.durataSec),
      visualizzazioni: numeroTesto(voce && voce.visualizzazioni),
      autore: autore,

      firma: autore ? (testi['clip.di'] || '') + ' ' + autore : '',
      quando: dataTesto(voce && voce.creataIl)
    });
    if (voci.length >= quante) { break; }
  }

  return { attivo: clip.attivo === true && voci.length > 0, voci: voci };
}

function clipPaginaDi(config, testi) {
  const clip = (config.clip && typeof config.clip === 'object') ? config.clip : {};
  const grezze = Array.isArray(clip.archivio) ? clip.archivio : [];

  let quante = Number(clip.quanteArchivio);
  if (!Number.isFinite(quante)) { quante = 12; }
  quante = Math.min(50, Math.max(4, Math.round(quante)));

  const voci = [];
  for (const voce of grezze) {
    const url = String((voce && voce.url) || '').trim();
    const titolo = String((voce && voce.titolo) || '').trim();
    if (!url || !titolo) { continue; }

    const quando = new Date(String((voce && voce.creataIl) || ''));
    if (Number.isNaN(quando.getTime())) { continue; }

    const autore = String((voce && voce.autore) || '').trim();
    voci.push({
      titolo: titolo,
      url: url,
      anteprima: String((voce && voce.anteprima) || '').trim(),
      durata: durataTesto(voce && voce.durataSec),
      visualizzazioni: numeroTesto(voce && voce.visualizzazioni),
      autore: autore,
      firma: autore ? (testi['clip.di'] || '') + ' ' + autore : '',
      quando: dataTesto(voce && voce.creataIl),

      iso: quando.toISOString()
    });
  }

  return { attivo: clip.attivo === true && voci.length > 0, voci: voci, quante: quante };
}

const SEME_GIOCHI = path.join(__dirname, '..', 'modelli', 'giochi-seme.json');
const COPERTINE_TWITCH = 'https://static-cdn.jtvnw.net/';
const GENERI_MASSIMI = 3;

function leggiJson(percorso) {
  try {
    return JSON.parse(fs.readFileSync(percorso, 'utf8'));
  } catch (e) {
    return null;
  }
}

function giochiGrezzi() {
  const letto = P.giochiTwitch ? leggiJson(P.giochiTwitch) : null;
  if (letto && Array.isArray(letto.giochi)) { return { giochi: letto.giochi, seme: false }; }
  const seme = leggiJson(SEME_GIOCHI);
  return { giochi: (seme && Array.isArray(seme.giochi)) ? seme.giochi : [], seme: true };
}

function copertinaDi(valore, seme) {
  const testo = String(valore || '').trim();
  if (!testo) { return ''; }
  if (testo.startsWith(COPERTINE_TWITCH)) { return testo; }
  if (seme && /^[A-Za-z0-9_.-]+$/.test(testo)) {
    return COPERTINE_TWITCH + 'ttv-boxart/' + testo + '-285x380.jpg';
  }
  return '';
}

function oreTesto(valore) {
  const decimi = Math.max(0, Math.round((Number(valore) || 0) * 10));
  const intere = Math.floor(decimi / 10);
  const resto = decimi % 10;
  return numeroTesto(intere) + (resto ? ',' + resto : '');
}

function dataGiorno(valore) {
  const testo = String(valore || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(testo) && !Number.isNaN(Date.parse(testo + 'T00:00:00Z')) ? testo : '';
}

function chiaveGioco(valore) {
  return String(valore || '').trim().toLowerCase();
}

function generiPuliti(elenco) {
  const fuori = [];
  const visti = new Set();
  for (const voce of Array.isArray(elenco) ? elenco : []) {
    const nome = String(voce || '').replace(/[|\s]+/g, ' ').trim().slice(0, 40);
    if (!nome || visti.has(nome.toLowerCase())) { continue; }
    visti.add(nome.toLowerCase());
    fuori.push(nome);
    if (fuori.length >= GENERI_MASSIMI) { break; }
  }
  return fuori;
}

function clipMiglioreDi(valore) {
  if (!valore || typeof valore !== 'object') { return null; }
  const url = String(valore.url || '').trim();
  if (!/^https:\/\/(www\.|clips\.)?twitch\.tv\//.test(url)) { return null; }
  return { titolo: String(valore.titolo || '').trim(), url: url };
}

function conParola(numero, testi, una, tante) {
  return { valore: numeroTesto(numero), parola: String(testi[numero === 1 ? una : tante] || '') };
}

function giochiDi(config, testi) {
  const ramo = (config.giochi && typeof config.giochi === 'object') ? config.giochi : {};
  const nascosti = new Set((Array.isArray(ramo.nascosti) ? ramo.nascosti : []).map(chiaveGioco).filter(Boolean));
  const correzioni = new Map();
  for (const voce of Array.isArray(ramo.correzioni) ? ramo.correzioni : []) {
    const chi = chiaveGioco(voce && voce.gioco);
    if (chi) { correzioni.set(chi, voce); }
  }

  const grezzi = giochiGrezzi();
  const voci = [];
  const conteggi = new Map();
  let oreTotali = 0;
  let clipTotali = 0;

  for (const grezzo of grezzi.giochi) {
    if (!grezzo || typeof grezzo !== 'object') { continue; }
    const nome = String(grezzo.nome || '').trim();
    const id = String(grezzo.id || '').trim();
    if (!nome) { continue; }
    if (nascosti.has(chiaveGioco(nome)) || (id && nascosti.has(chiaveGioco(id)))) { continue; }

    const correzione = correzioni.get(chiaveGioco(nome)) || (id ? correzioni.get(chiaveGioco(id)) : null) || null;
    let generi = generiPuliti(grezzo.generi);
    let copertina = copertinaDi(grezzo.copertina, grezzi.seme);
    if (correzione) {
      const scritti = generiPuliti(String(correzione.generi || '').split(','));
      if (scritti.length) { generi = scritti; }
      const propria = String(correzione.copertina || '').trim();
      if (propria) { copertina = propria; }
    }

    const dirette = Math.max(0, Math.round(Number(grezzo.dirette) || 0));
    const ore = Math.max(0, Math.round((Number(grezzo.ore) || 0) * 10) / 10);
    const clip = Math.max(0, Math.round(Number(grezzo.clip) || 0));
    const prima = dataGiorno(grezzo.primaVolta);
    const ultima = dataGiorno(grezzo.ultimaVolta) || prima;

    const numeri = [];
    if (dirette > 0) { numeri.push(conParola(dirette, testi, 'giochi.diretta', 'giochi.dirette')); }
    if (ore > 0) { numeri.push({ valore: oreTesto(ore), parola: String(testi[ore === 1 ? 'giochi.ora' : 'giochi.ore'] || '') }); }
    if (clip > 0) { numeri.push({ valore: numeroTesto(clip), parola: String(testi['giochi.clip'] || '') }); }

    for (const genere of generi) { conteggi.set(genere, (conteggi.get(genere) || 0) + 1); }
    oreTotali += ore;
    clipTotali += clip;

    voci.push({
      id: id,
      nome: nome,
      iniziale: nome.charAt(0).toUpperCase(),
      copertina: copertina,
      generi: generi,
      datiGeneri: generi.join('|'),
      numeri: numeri,
      dirette: dirette,
      ore: ore,
      clip: clip,
      prima: prima,
      primaTesto: dataTesto(prima),
      ultima: ultima,
      ultimaTesto: dataTesto(ultima),
      clipMigliore: clipMiglioreDi(grezzo.clipMigliore)
    });
  }

  voci.sort((a, b) => (b.ultima > a.ultima ? 1 : b.ultima < a.ultima ? -1 : 0) ||
    b.ore - a.ore || a.nome.localeCompare(b.nome, 'it'));

  const tipologie = Array.from(conteggi, (voce) => ({ nome: voce[0], quanti: voce[1] }))
    .sort((a, b) => b.quanti - a.quanti || a.nome.localeCompare(b.nome, 'it'));

  return {
    attivo: ramo.attivo !== false && voci.length > 0,
    voci: voci,
    quanti: voci.length,
    tipologie: tipologie,
    riepilogo: [
      conParola(voci.length, testi, 'giochi.gioco', 'giochi.giochi'),
      { valore: oreTesto(oreTotali), parola: String(testi['giochi.ore'] || '') },
      { valore: numeroTesto(clipTotali), parola: String(testi['giochi.clip'] || '') }
    ],
    dalSeme: grezzi.seme
  };
}

function chiaviRicche() {
  const semplici = [];
  const elenchi = [];
  for (const campo of schema.campi()) {
    if (campo.tipo === 'ricco') { semplici.push(campo.chiave); continue; }
    if (campo.tipo !== 'elenco' || !Array.isArray(campo.campi)) { continue; }
    const dentro = campo.campi.filter((v) => v.tipo === 'ricco').map((v) => v.chiave);
    if (dentro.length) { elenchi.push({ chiave: campo.chiave, campi: dentro }); }
  }
  return { semplici: semplici, elenchi: elenchi };
}

function contenitoreDi(config, chiave) {
  const pezzi = chiave.slice('config.'.length).split('.');
  let nodo = config;
  for (let i = 0; i < pezzi.length - 1; i++) {
    if (!nodo || typeof nodo !== 'object') { return null; }
    nodo = nodo[pezzi[i]];
  }
  if (!nodo || typeof nodo !== 'object') { return null; }
  return { nodo: nodo, nome: pezzi[pezzi.length - 1] };
}

function ripulisci(contenitore, nome) {
  if (typeof contenitore[nome] === 'string') { contenitore[nome] = testoricco.sanifica(contenitore[nome]); }
}

function sanificaRicchi(testi, config) {
  const ricche = chiaviRicche();

  for (const chiave of ricche.semplici) {
    if (chiave.startsWith('config.')) {
      const dove = contenitoreDi(config, chiave);
      if (dove) { ripulisci(dove.nodo, dove.nome); }
    } else {

      ripulisci(testi, chiave);
    }
  }

  for (const elenco of ricche.elenchi) {
    const dove = elenco.chiave.startsWith('config.') ? contenitoreDi(config, elenco.chiave) : null;
    const voci = dove ? dove.nodo[dove.nome] : null;
    if (!Array.isArray(voci)) { continue; }
    for (const voce of voci) {
      if (!voce || typeof voce !== 'object') { continue; }
      for (const nome of elenco.campi) { ripulisci(voce, nome); }
    }
  }
}

function elencoItaliano(voci) {
  return voci.length === 1 ? voci[0] : voci.slice(0, -1).join(', ') + ' e ' + voci[voci.length - 1];
}

function orariTesto(config) {
  const orari = orariDi(config);
  const ordinati = SBOrari.ORDINE.filter((g) => orari.giorni.indexOf(g) !== -1);
  if (!ordinati.length) { return ''; }

  const nome = (g, i) => (i === 0 ? SBOrari.GIORNI[g].nome : SBOrari.GIORNI[g].minuscolo);
  const ore = ordinati.map((g) => SBOrari.oraDi(orari, g));
  if (ore.every((ora) => ora === ore[0])) {
    return elencoItaliano(ordinati.map(nome)) + ' alle ' + ore[0];
  }
  return elencoItaliano(ordinati.map((g, i) => nome(g, i) + ' alle ' + ore[i]));
}

function jsonLdPersona(testi, config, social, urlCanale) {
  const persona = { '@context': 'https://schema.org', '@type': 'Person' };

  const metti = (nome, valore) => {
    const pulito = String(valore == null ? '' : valore).trim();
    if (pulito) { persona[nome] = pulito; }
  };

  metti('name', testi['marchio.nome']);
  metti('jobTitle', testi['marchio.ruolo']);

  metti('description', testi['meta.descrizione']);
  metti('url', urlCanale);
  metti('image', (config.immagini && config.immagini.avatar) || '');
  metti('email', config.email);

  const visti = new Set();
  const sameAs = [];
  const profili = social.filter((voce) => !String(voce.icona || '').startsWith('amazon'));
  for (const grezzo of [urlCanale].concat(profili.map((voce) => voce.url))) {
    const url = String(grezzo || '').trim();
    if (!url) { continue; }

    const chiave = url.toLowerCase().replace(/\/+$/, '');
    if (visti.has(chiave)) { continue; }
    visti.add(chiave);
    sameAs.push(url);
  }
  if (sameAs.length) { persona.sameAs = sameAs; }

  return jsonSicuro(persona);
}

function generatore() {
  return require('../../pannello/condivisi/stili.js');
}

function opzioniStili(base) {
  return {
    famiglia: (nome) => {
      const trovata = tema.famigliaCatalogo(nome);
      return trovata ? { nome: trovata.nome, ripiego: trovata.ripiego } : null;
    },
    font: (id) => font.voce(id),
    base: base
  };
}

function pulisciEditor(contenuti) {
  const config = contenuti && contenuti.config;
  if (!config || typeof config !== 'object') { return contenuti; }
  const SB = generatore();
  if (config.sezioni !== undefined) { config.sezioni = SB.pulisciSezioni(config.sezioni); }
  if (config.stili !== undefined) { config.stili = SB.pulisciStili(config.stili, opzioniStili('')); }
  if (config.disposizione !== undefined) { config.disposizione = SB.pulisciDisposizione(config.disposizione); }

  if (config.orari !== undefined && SBOrari.problemi(config.orari).length === 0) {
    config.orari = SBOrari.normalizza(config.orari);
  }

  const slot = config.tema && config.tema.font;
  if (slot && typeof slot === 'object') {
    for (const nome of Object.keys(tema.PREDEFINITO.font)) {
      const valore = slot[nome];
      if (typeof valore === 'string' && valore.indexOf(tema.PREFISSO_CARICATO) === 0 &&
          !font.esiste(valore.slice(tema.PREFISSO_CARICATO.length))) {
        slot[nome] = tema.PREDEFINITO.font[nome];
      }
    }
  }
  return contenuti;
}

function famiglieNegliStili(stili) {
  const nomi = [];
  for (const bersaglio of Object.keys(stili || {})) {
    const dispositivi = stili[bersaglio] || {};
    for (const dispositivo of Object.keys(dispositivi)) {
      const valore = dispositivi[dispositivo] && dispositivi[dispositivo].font;
      if (typeof valore !== 'string' || valore.indexOf('famiglia:') !== 0) { continue; }
      const nome = valore.slice('famiglia:'.length);
      if (nomi.indexOf(nome) === -1) { nomi.push(nome); }
    }
  }
  return nomi;
}

const ELEMENTI_VUOTI = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

function blocchiPresenti(html) {
  const presenti = Object.create(null);
  const pila = [];
  const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let trovato;
  while ((trovato = tag.exec(html)) !== null) {
    if (!trovato[2]) { continue; }
    const nome = trovato[2].toLowerCase();
    if (trovato[1]) {
      for (let i = pila.length - 1; i >= 0; i--) {
        if (pila[i].tag === nome) { pila.length = i; break; }
      }
      continue;
    }
    const attributi = trovato[3];
    const sopra = pila.length ? pila[pila.length - 1].riquadro : null;
    const blocco = /\sdata-sb-blocco="([^"]*)"/.exec(attributi);
    if (blocco && sopra) {
      if (!presenti[sopra]) { presenti[sopra] = new Set(); }
      presenti[sopra].add(blocco[1]);
    }
    if (nome === 'script' || nome === 'style') {
      const chiusura = html.indexOf('</' + nome, tag.lastIndex);
      tag.lastIndex = chiusura === -1 ? html.length : chiusura;
      continue;
    }
    if (ELEMENTI_VUOTI.has(nome) || /\/\s*$/.test(attributi)) { continue; }
    const riquadro = /\sdata-sb-riquadro="([^"]*)"/.exec(attributi);
    pila.push({ tag: nome, riquadro: riquadro ? riquadro[1] : sopra });
  }
  return presenti;
}

function cssInPagina(css) {
  return String(css || '').replace(/</g, '\\3C ');
}

function nomeTracciaSicuro(valore) {
  const pulito = String(valore || '').trim().replace(/\\/g, '/');
  if (!pulito || pulito.indexOf('/') > -1 || pulito.indexOf('..') > -1) { return ''; }
  return pulito;
}

function tracceDi(config) {
  const cartella = String((config.musica && config.musica.cartella) || 'mp3').trim().replace(/^\/+|\/+$/g, '');
  const elenco = Array.isArray(config.tracce) ? config.tracce : [];
  const fuori = [];
  for (const voce of elenco) {
    if (!voce || typeof voce !== 'object') { continue; }
    const file = nomeTracciaSicuro(voce.file);
    if (!file) { continue; }
    fuori.push({
      titolo: String(voce.titolo || '').trim(),
      artista: String(voce.artista || '').trim(),
      src: (cartella ? cartella + '/' : '') + file.split('/').map(encodeURIComponent).join('/'),
      cover: String(voce.cover || '').trim(),
      link: String(voce.link || '').trim()
    });
  }
  return fuori;
}

function referralDi(config, testi) {
  const voce = (config.referral && typeof config.referral === 'object') ? config.referral : {};
  const url = String(voce.url || '').trim();
  return {
    attivo: voce.attivo === true && url !== '',
    url: url,
    titolo: testi['saluti.referralTitolo'] || '',
    btn: testi['saluti.referralBtn'] || ''
  };
}

function musicaDi(config, testi) {
  const voce = (config.musica && typeof config.musica === 'object') ? config.musica : {};
  const tracce = tracceDi(config);
  return {
    attivo: voce.attivo === true && tracce.length > 0,
    aperto: voce.aperto !== false,
    quante: tracce.length,

    icona: String(voce.icona || '').trim(),
    titolo: testi['musica.titolo'] || '',
    play: testi['musica.play'] || '',
    pausa: testi['musica.pausa'] || '',
    precedente: testi['musica.precedente'] || '',
    successiva: testi['musica.successiva'] || '',
    avanzamento: testi['musica.avanzamento'] || '',
    casuale: testi['musica.casuale'] || '',
    volume: testi['musica.volume'] || '',
    muto: testi['musica.muto'] || '',
    suono: testi['musica.suono'] || '',
    riduci: testi['musica.riduci'] || '',
    apri: testi['musica.apri'] || '',
    elenco: testi['musica.elenco'] || ''
  };
}

function musicaDati(config, testi) {
  const voce = (config.musica && typeof config.musica === 'object') ? config.musica : {};
  return {
    aperto: voce.aperto !== false,
    casuale: voce.casuale === true,
    tracce: voce.attivo === true ? tracceDi(config) : [],
    testi: {
      play: testi['musica.play'] || '',
      pausa: testi['musica.pausa'] || '',
      muto: testi['musica.muto'] || '',
      suono: testi['musica.suono'] || '',
      errore: testi['musica.errore'] || '',
      casuale: testi['musica.casuale'] || '',
      ordine: testi['musica.ordine'] || '',
      bloccato: testi['musica.bloccato'] || ''
    }
  };
}

function costruisciContesto(contenuti, opzioni) {
  const scelte = opzioni || {};

  const testi = Object.assign({}, contenuti.testi);
  const config = archivio.copia(contenuti.config);
  sanificaRicchi(testi, config);

  const sito = controlli.indirizzoSito(config);
  config.sitoUrl = sito.indirizzo;

  const SB = generatore();
  config.sezioni = SB.pulisciSezioni(config.sezioni);
  config.stili = SB.pulisciStili(config.stili, opzioniStili(''));
  config.disposizione = SB.pulisciDisposizione(config.disposizione);
  const attive = config.sezioni.filter((voce) => voce.attiva);

  config.orari = orariDi(config);
  const adesso = momentoDi(scelte);
  const eventi = eventiDi(config.orari, adesso, categoriaDiretta(scelte, adesso));

  const cache = scelte.cache || new Map();
  const mancanti = [];

  const canale = String((config.twitch && config.twitch.canale) || '');
  const urlCanale = 'https://www.twitch.tv/' + canale;
  const social = elencoVisibile(config.social, cache, mancanti).map((voce) => conContatore(voce, config));

  const attiva = {};
  for (const id of SB.SEZIONI_ORDINABILI) { attiva[id] = false; }
  for (const voce of attive) { attiva[voce.id] = true; }

  const contesto = Object.assign({}, testi, {
    config: config,
    social: social,
    supporto: elencoVisibile(config.supporto, cache, mancanti),
    settimana: settimanaDi(config, testi, adesso),
    clip: clipDi(config, testi),
    clipPagina: clipPaginaDi(config, testi),
    sponsor: sponsorDi(config, testi, adesso),
    giochi: giochiDi(config, testi),
    sito: {
      urlCanale: urlCanale,
      urlChat: 'https://www.twitch.tv/popout/' + canale + '/chat',
      mailto: 'mailto:' + String(config.email || ''),
      anno: new Date().getFullYear(),
      generatoIl: scelte.quando || new Date(adesso).toISOString(),
      orariTesto: orariTesto(config),

      follower: numeroTesto((config.dati || {}).follower),

      eventi: eventi,
      haEventi: eventi.length > 0,
      referral: referralDi(config, testi),
      musica: musicaDi(config, testi),
      settimanaSfondo: sfondoDi(config.orari),

      fontUrl: tema.urlGoogleFonts(config.tema, famiglieNegliStili(config.stili)),

      jsonLd: jsonLdPersona(testi, config, social, urlCanale),

      sezioni: attive.map((voce) => ({ id: voce.id, attiva: true })),
      attiva: attiva,

      voci: attive.filter((voce) => voce.id !== 'sondaggio' && voce.id !== 'sponsor').map((voce) => ({
        id: voce.id,
        chiave: 'nav.' + voce.id,
        testo: typeof testi['nav.' + voce.id] === 'string' ? testi['nav.' + voce.id] : ''
      })),
      corpo: '',
      cssStili: cssInPagina(SB.stiliCss(config.stili, opzioniStili(''))),
      cssDisposizione: ''
    }
  });

  const presentazioneClip = testoricco.soloTesto(testi['clip.paginaTesto'] || '');
  contesto.sito.paginaClip = {
    url: 'clip.html',
    canonico: config.sitoUrl ? config.sitoUrl + 'clip.html' : 'clip.html',
    titolo: (testi['clip.paginaTitolo'] || '') + ' · ' + (testi['marchio.nome'] || ''),
    descrizione: presentazioneClip || String(testi['meta.descrizione'] || '')
  };

  contesto.sito.sponsorInHome = !!(attiva.sponsor && contesto.sponsor.attivo);
  contesto.sito.inviti = !!(contesto.clipPagina.attivo || (contesto.giochi && contesto.giochi.attivo));

  const presentazioneSponsor = testoricco.soloTesto(testi['sponsor.paginaTesto'] || '');
  contesto.sito.paginaSponsor = {
    url: 'sponsor.html',
    canonico: config.sitoUrl ? config.sitoUrl + 'sponsor.html' : 'sponsor.html',
    titolo: (testi['sponsor.paginaTitolo'] || '') + ' · ' + (testi['marchio.nome'] || ''),
    descrizione: presentazioneSponsor || String(testi['meta.descrizione'] || '')
  };

  const presentazioneGiochi = testoricco.soloTesto(testi['giochi.paginaTesto'] || '');
  contesto.sito.paginaGiochi = {
    url: 'giochi.html',
    canonico: config.sitoUrl ? config.sitoUrl + 'giochi.html' : 'giochi.html',
    titolo: (testi['giochi.paginaTitolo'] || '') + ' · ' + (testi['marchio.nome'] || ''),
    descrizione: presentazioneGiochi || String(testi['meta.descrizione'] || '')
  };

  if (mancanti.length) {
    throw erroreHttp(500, 'Mancano le icone richieste dai contenuti: ' + mancanti.join(', ') +
      '. Sono file dell agente A: senza, le voci resterebbero senza simbolo.');
  }

  const include = (nome) => modello.rendi('{{> parziali/' + nome + '}}', contesto,
    { file: 'modelli/index.html', cartella: P.modelli, cache: cache });
  contesto.sito.corpo = attive.map((voce) => include(voce.id)).join('\n');

  const blocchi = config.disposizione.blocchi;
  if (Object.keys(blocchi).some((riquadro) => blocchi[riquadro].length)) {
    const presenti = blocchiPresenti(contesto.sito.corpo + '\n' + include('piede'));
    contesto.sito.cssDisposizione = cssInPagina(SB.disposizioneCss(config.disposizione, {
      presente: (riquadro, id) => !!(presenti[riquadro] && presenti[riquadro].has(id))
    }));
  }
  return contesto;
}

const FRASI_POLLO = ['riposo', 'click', 'chat', 'scrive', 'live', 'lurk', 'offline'];

function polloDi(config, testi) {
  const pollo = (config.pollo && typeof config.pollo === 'object') ? config.pollo : {};
  const sorgente = (pollo.frasi && typeof pollo.frasi === 'object') ? pollo.frasi : {};

  const frasi = {};
  for (const nome of FRASI_POLLO) {
    frasi[nome] = (Array.isArray(sorgente[nome]) ? sorgente[nome] : [])
      .map((f) => String(f == null ? '' : f).trim())
      .filter((f) => f !== '');
  }

  return {
    attivo: pollo.attivo === true,
    chatVera: pollo.chatVera === true,
    mostraMessaggi: pollo.mostraMessaggi === true,
    frasi: frasi,
    testi: {
      etichetta: testi['pollo.etichetta'] || '',
      nascondi: testi['pollo.nascondi'] || ''
    }
  };
}

function chiDi(config) {
  const chi = (config.chi && typeof config.chi === 'object') ? config.chi : {};
  const frasi = (Array.isArray(chi.frasi) ? chi.frasi : [])
    .map((f) => String(f == null ? '' : f).trim())
    .filter((f) => f !== '');

  let tutte = {};
  if (frasi.length) {
    try { tutte = twitch.emoteSalvate(); } catch (e) { tutte = {}; }
  }
  const emote = {};
  for (const frase of frasi) {
    for (const parola of frase.split(/\s+/)) {
      const voce = Object.prototype.hasOwnProperty.call(tutte, parola) ? tutte[parola] : null;
      if (!voce || emote[parola] || !/^[A-Za-z0-9_]+$/.test(String(voce.id || ''))) { continue; }
      emote[parola] = 'https://static-cdn.jtvnw.net/emoticons/v2/' + voce.id + '/'
        + (voce.animata ? 'animated' : 'static') + '/dark/2.0';
    }
  }
  const gifOgni = Number.isInteger(chi.gifOgni) && chi.gifOgni >= 0 ? chi.gifOgni : schema.campo('config.chi.gifOgni').predefinito;
  return {
    frasi: frasi,
    emote: emote,
    gifOgni: gifOgni,
    raffica: gifDi(chi, 'gifRaffica', 'scritteRaffica'),
    insistenza: gifDi(chi, 'gifInsistenza', 'scritteInsistenza'),
    scroll: gifDi(chi, 'gifScroll', 'scritteScroll')
  };
}

const RE_GIF_LOCALE = /^(?:img|contenuti\/media)\/[a-z0-9._\/-]+\.(?:gif|webp|png|jpe?g|avif)$/i;

function gifDi(chi, chiaveGif, chiaveScritte) {
  const voci = Array.isArray(chi[chiaveGif]) ? chi[chiaveGif] : schema.campo('config.chi.' + chiaveGif).predefinito;
  const gif = voci
    .filter((v) => v && typeof v === 'object')
    .map((v) => ({
      src: String(v.immagine == null ? '' : v.immagine).trim().replace(/^\.?\//, ''),
      scritta: String(v.scritta == null ? '' : v.scritta).trim()
    }))
    .filter((v) => RE_GIF_LOCALE.test(v.src) && v.src.indexOf('..') === -1);
  const scritte = (Array.isArray(chi[chiaveScritte]) ? chi[chiaveScritte] : schema.campo('config.chi.' + chiaveScritte).predefinito)
    .map((f) => String(f == null ? '' : f).trim())
    .filter((f) => f !== '');
  return { gif: gif, scritte: scritte };
}

function accountDi(config, testi) {
  const account = (config.account && typeof config.account === 'object') ? config.account : {};
  const clientId = String(account.clientId || '').trim();
  const attivo = account.attivo === true && clientId !== '';

  let motivo = '';
  if (account.attivo !== true) { motivo = 'spento'; }
  else if (clientId === '') { motivo = 'senzaClientId'; }

  return {
    attivo: attivo,
    motivo: motivo,

    clientId: attivo ? clientId : '',
    urlRitorno: attivo ? String(account.urlRitorno || '').trim() : '',
    testi: {
      entra: testi['account.entra'] || '',
      esci: testi['account.esci'] || '',
      collegato: testi['account.collegato'] || ''

    }
  };
}

const SPONSOR_NUOVO_GIORNI = 30;

function coloreMarchio(valore) {
  const pulito = String(valore || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(pulito) ? pulito : '';
}

function dominioDi(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function sponsorDi(config, testi, adesso) {
  const ramo = (config.sponsor && typeof config.sponsor === 'object') ? config.sponsor : {};
  const grezzi = Array.isArray(ramo.voci) ? ramo.voci : [];
  const ora = Number.isFinite(adesso) ? adesso : Date.now();
  const visita = String(testi['sponsor.visita'] || '').trim();

  const voci = [];
  for (const voce of grezzi) {
    if (!voce || typeof voce !== 'object') { continue; }
    const url = String(voce.url || '').trim();
    const nome = String(voce.nome || '').trim();
    if (!url || !nome) { continue; }

    const da = istanteItaliano(voce.da);
    const a = istanteItaliano(voce.a);
    const colore = coloreMarchio(voce.colore);
    if (da && ora < da.ms) { continue; }
    if (a && ora >= a.ms) { continue; }

    voci.push({
      nome: nome,
      url: url,
      logo: String(voce.logo || '').trim(),
      testo: String(voce.testo || ''),
      categoria: String(voce.categoria || '').trim(),
      evidenza: voce.evidenza === true,

      dominio: dominioDi(url),

      colore: colore,
      stile: colore ? '--marca: ' + colore + ';' : '',

      dalAnno: da ? da.data.slice(0, 4) : '',
      nuovo: !!(da && ora - da.ms >= 0 && ora - da.ms <= SPONSOR_NUOVO_GIORNI * 86400000),
      da: da ? da.iso : '',
      a: a ? a.iso : '',

      visita: visita ? visita + ' ' + nome : nome
    });
  }

  voci.sort((x, y) => (y.evidenza ? 1 : 0) - (x.evidenza ? 1 : 0));

  const gruppi = [];
  const indice = new Map();
  for (const voce of voci) {
    const chiave = voce.categoria.toLowerCase();
    if (!indice.has(chiave)) {
      indice.set(chiave, gruppi.length);
      gruppi.push({ titolo: voce.categoria, senza: !voce.categoria, voci: [] });
    }
    gruppi[indice.get(chiave)].voci.push(voce);
  }
  gruppi.sort((x, y) => (x.senza ? 1 : 0) - (y.senza ? 1 : 0));

  const soloUno = gruppi.length === 1;
  for (const gruppo of gruppi) {
    if (gruppo.senza) { gruppo.titolo = String(testi['sponsor.altri'] || ''); }

    gruppo.titolato = !(soloUno && gruppo.senza);
  }

  return {
    attivo: ramo.attivo === true && voci.length > 0,
    voci: voci,
    gruppi: gruppi,
    quanti: voci.length
  };
}

function lurkDi(config, testi, account) {
  const lurk = (config.lurk && typeof config.lurk === 'object') ? config.lurk : {};

  const frasi = (Array.isArray(lurk.frasi) ? lurk.frasi : [])
    .map((f) => String(f == null ? '' : f).trim())
    .filter((f) => f !== '');

  const conAccount = !!(account && account.attivo === true);
  const messaggioAttivo = lurk.messaggioAttivo === true && conAccount && frasi.length > 0;

  let motivo = '';
  if (lurk.messaggioAttivo !== true) { motivo = 'spento'; }
  else if (!conAccount) { motivo = 'senzaAccount'; }
  else if (frasi.length === 0) { motivo = 'senzaFrasi'; }

  let ore = Number(lurk.oreMax);
  if (!Number.isFinite(ore)) { ore = 3; }
  ore = Math.min(12, Math.max(1, Math.round(ore)));

  let minuti = Number(lurk.minutiFraMessaggi);
  if (!Number.isFinite(minuti)) { minuti = 10; }
  minuti = Math.min(120, Math.max(2, Math.round(minuti)));

  return {
    attivo: lurk.attivo === true,
    tieniSchermoAcceso: lurk.tieniSchermoAcceso === true,
    oreMax: ore,
    messaggio: {
      attivo: messaggioAttivo,
      motivo: motivo,

      frasi: messaggioAttivo ? frasi : [],
      minuti: minuti
    },
    testi: {
      accendi: testi['lurk.accendi'] || '',
      spegni: testi['lurk.spegni'] || '',
      audio: testi['lurk.audio'] || '',
      schermo: testi['lurk.schermo'] || '',
      ripresa: testi['lurk.ripresa'] || '',
      ciSei: testi['lurk.ciSei'] || '',
      ciSono: testi['lurk.ciSono'] || '',
      statoSpento: testi['lurk.statoSpento'] || '',
      statoVivo: testi['lurk.statoVivo'] || '',
      statoFermo: testi['lurk.statoFermo'] || '',
      statoRiparto: testi['lurk.statoRiparto'] || '',
      statoBloccato: testi['lurk.statoBloccato'] || '',
      statoAttesa: testi['lurk.statoAttesa'] || '',
      chiuso: testi['lurk.chiuso'] || '',
      manutenzione: testi['lurk.manutenzione'] || '',
      statoResa: testi['lurk.statoResa'] || '',
      statoNiente: testi['lurk.statoNiente'] || '',
      conto: testi['lurk.conto'] || '',
      contoRiavvii: testi['lurk.contoRiavvii'] || '',

      preavviso: testi['lurk.preavviso'] || '',
      invito: testi['lurk.invito'] || '',
      manda: testi['lurk.manda'] || '',
      inviato: testi['lurk.inviato'] || ''
    }
  };
}

function orariDati(config, adesso) {
  const orari = orariDi(config);
  const ore = {};
  const durate = {};
  for (const giorno of orari.giorni) {
    ore[giorno] = SBOrari.oraDi(orari, giorno);
    durate[giorno] = SBOrari.durataDi(orari, giorno);
  }
  return {
    giorni: orari.giorni.slice(),
    ora: orari.ora,
    fuso: orari.fuso,
    durataOre: orari.durataOre,
    ore: ore,
    durate: durate,
    eventi: SBOrari.eventiFuturi(orari, adesso).map((evento) => ({
      indice: evento.indice,
      data: evento.data,
      inizio: new Date(evento.inizio).toISOString(),
      termine: new Date(evento.termine).toISOString(),
      titolo: evento.titolo
    }))
  };
}

function oggettoDati(contenuti, opzioni) {
  const config = contenuti.config;
  const testi = contenuti.testi;
  const twitch = config.twitch || {};
  const profilo = accountDi(config, testi);

  const sito = controlli.indirizzoSito(config);
  const delSito = sito.host ? [sito.host, 'www.' + sito.host] : [];

  const domini = [];
  for (const dominio of (Array.isArray(twitch.domini) ? twitch.domini : [])
    .concat(delSito).concat(['localhost', '127.0.0.1'])) {
    const pulito = String(dominio || '').trim();
    if (pulito && domini.indexOf(pulito) === -1) { domini.push(pulito); }
  }

  return {
    twitch: {
      canale: String(twitch.canale || ''),
      idUtente: String(twitch.idUtente || ''),

      direttaCondivisa: twitch.direttaCondivisa === true,
      domini: domini
    },
    orari: orariDati(config, momentoDi(opzioni)),
    email: String(config.email || ''),
    ultimaDiretta: String(config.ultimaDiretta || ''),
    testi: {
      statoLive: testi['deck.statoLive'] || '',
      statoOffline: testi['deck.statoOffline'] || '',
      statoVerifica: testi['deck.statoVerifica'] || '',
      chatApri: testi['deck.chatApri'] || '',
      chatChiudi: testi['deck.chatChiudi'] || '',

      etichettaOggi: testi['settimana.etichettaOggi'] || '',
      etichettaProssima: testi['settimana.etichettaProssima'] || '',

      etichettaInOnda: testi['settimana.etichettaInOnda'] || '',
      etichettaDaTe: testi['settimana.etichettaDaTe'] || '',
      etichettaEvento: testi['settimana.etichettaEvento'] || '',
      copiaBtn: testi['saluti.copiaBtn'] || '',
      copiaFatto: testi['saluti.copiaFatto'] || ''
    },
    musica: musicaDati(config, testi),
    sondaggio: {
      testi: {
        scadeTra: testi['sondaggio.scadeTra'] || '',
        chiuso: testi['sondaggio.chiuso'] || '',
        votato: testi['sondaggio.votato'] || '',
        voti: testi['sondaggio.voti'] || ''
      }
    },
    pollo: polloDi(config, testi),
    chi: chiDi(config),

    account: profilo,
    lurk: lurkDi(config, testi, profilo)
  };
}

function jsonSicuro(valore) {
  return JSON.stringify(valore, null, 2)
    .replace(/</g, '\\u003c')

    .replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

const NIENTE_COMMENTI_DENTRO = new Set(['script', 'style', 'textarea', 'title', 'pre']);

function fineDelTag(testo, apre) {
  let virgoletta = '';
  for (let i = apre + 1; i < testo.length; i++) {
    const c = testo[i];
    if (virgoletta) {
      if (c === virgoletta) { virgoletta = ''; }
    } else if (c === '"' || c === '\'') {
      virgoletta = c;
    } else if (c === '>') {
      return i + 1;
    }
  }
  return testo.length;
}

function righeVuote(pezzo) {
  return pezzo.replace(/\n(?:[ \t\r]*\n){2,}([ \t]*)/g, '\n\n$1');
}

function aCapoAperto(pezzo) {
  for (let i = pezzo.length - 1; i >= 0; i--) {
    const c = pezzo[i];
    if (c === '\n') { return true; }
    if (c !== ' ' && c !== '\t' && c !== '\r') { return false; }
  }
  return true;
}

function togliCommenti(html) {
  const testo = String(html);
  const basso = testo.toLowerCase();
  let fuori = '';
  let normale = '';
  let tenutoDa = 0;
  let i = 0;

  const intoccabile = (da, a) => {
    normale += testo.slice(tenutoDa, da);
    fuori += righeVuote(normale) + testo.slice(da, a);
    normale = '';
    tenutoDa = a;
  };

  while (i < testo.length) {
    const apre = testo.indexOf('<', i);
    if (apre === -1) { break; }

    if (basso.startsWith('<!--', apre)) {
      const chiude = testo.indexOf('-->', apre + 4);
      if (chiude === -1) {

        i = apre + 4;
        continue;
      }
      const fine = chiude + 3;
      if (/^<!--\s*\[\s*if\b/i.test(testo.slice(apre, fine))) { i = fine; continue; }

      normale += testo.slice(tenutoDa, apre);
      const inizioRiga = normale === '' ? fuori === '' : aCapoAperto(normale);
      let a = fine;
      while (a < testo.length && (testo[a] === ' ' || testo[a] === '\t' || testo[a] === '\r')) { a++; }
      if (inizioRiga && testo[a] === '\n') {
        normale = normale.replace(/[ \t]*$/, '');
        a++;
      } else {
        a = fine;
      }
      tenutoDa = a;
      i = a;
      continue;
    }

    const nome = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(basso.slice(apre, apre + 40));
    if (!nome) { i = apre + 1; continue; }

    const dopoIlTag = fineDelTag(testo, apre);
    if (!nome[1] && NIENTE_COMMENTI_DENTRO.has(nome[2]) && testo[dopoIlTag - 2] !== '/') {
      const chiusura = basso.indexOf('</' + nome[2], dopoIlTag);
      intoccabile(apre, chiusura === -1 ? testo.length : chiusura);
      i = tenutoDa;
      continue;
    }
    i = dopoIlTag;
  }

  normale += testo.slice(tenutoDa);
  return fuori + righeVuote(normale);
}

const FUSO_ITALIA = 'Europe/Rome';
const SEGNO_MANUTENZIONE = '<meta name="sb-pagina" content="manutenzione">';

function manutenzioneAttiva(config) {
  return !!(config && config.manutenzione && typeof config.manutenzione === 'object' &&
    config.manutenzione.attiva === true);
}

function istanteItaliano(valore) {
  const pezzi = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(valore || '').trim());
  if (!pezzi) { return null; }
  const ms = SBOrari.istante(pezzi[1], pezzi[2], FUSO_ITALIA);
  if (!Number.isFinite(ms)) { return null; }
  const data = SBOrari.dataNelFuso(ms, FUSO_ITALIA);
  const ora = SBOrari.oraNelFuso(ms, FUSO_ITALIA);
  const scarto = Math.round((Date.parse(data + 'T' + ora + ':00Z') - ms) / 60000);
  const assoluto = Math.abs(scarto);
  const due = (n) => String(n).padStart(2, '0');
  return {
    ms: ms,
    data: data,
    ora: ora,
    iso: data + 'T' + ora + ':00' + (scarto < 0 ? '-' : '+') + due(Math.floor(assoluto / 60)) + ':' + due(assoluto % 60)
  };
}

function etichettaManutenzione(prima, fine, adesso) {
  const oggi = SBOrari.dataNelFuso(adesso, FUSO_ITALIA);
  if (fine.data === oggi) { return prima + ' alle ' + fine.ora + ' · mancano'; }
  const pezzi = fine.data.split('-');
  const giorno = pezzi[2] + '/' + pezzi[1] + (pezzi[0] === oggi.slice(0, 4) ? '' : '/' + pezzi[0]);
  return prima + ' il ' + giorno + ' alle ' + fine.ora + ' · mancano';
}

function fineManutenzione(valore) {
  return istanteItaliano(valore);
}

function contestoManutenzione(contenuti, adesso, cache) {
  const testi = (contenuti && contenuti.testi) || {};
  const config = (contenuti && contenuti.config) || {};
  const ramo = (config.manutenzione && typeof config.manutenzione === 'object') ? config.manutenzione : {};
  const immagini = config.immagini || {};
  const canale = String((config.twitch && config.twitch.canale) || '');

  const mancanti = [];
  const social = elencoVisibile(config.social, cache, mancanti)
    .filter((voce) => voce.icona !== 'twitch')
    .map((voce) => ({ nome: String(voce.nome || voce.icona || ''), url: voce.url.trim(), svg: voce.svg }));
  const iconaTwitch = leggiIcona('twitch', cache, mancanti);
  if (mancanti.length) {
    throw erroreHttp(500, 'Mancano le icone della pagina di manutenzione: ' + mancanti.join(', ') + '.');
  }

  const fine = istanteItaliano(ramo.fine);
  if (!eFile(P.scriptManutenzione)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.scriptManutenzione) +
      ': e lo script della pagina di manutenzione.');
  }
  const script = '\n' + fs.readFileSync(P.scriptManutenzione, 'utf8');
  const impronta = 'sha256-' + crypto.createHash('sha256').update(script, 'utf8').digest('base64');

  const testoDi = (chiave) => (typeof testi[chiave] === 'string' && testi[chiave].trim()
    ? testi[chiave] : schema.campo(chiave).predefinito);
  const frasi = (Array.isArray(ramo.nastro) ? ramo.nastro : [])
    .filter((frase) => typeof frase === 'string' && frase.trim())
    .map((frase) => frase.trim());
  const nastro = '&nbsp;★ ' + (frasi.length ? frasi : schema.campo('config.manutenzione.nastro').predefinito)
    .map((frase) => modello.proteggi(frase)).join(' &nbsp;·&nbsp; ') + ' &nbsp;';

  return {
    stato: testoDi('manutenzione.stato'),
    occhiello: testoDi('manutenzione.occhiello'),
    contoFinito: testoDi('manutenzione.contoFinito'),
    bottone: testoDi('manutenzione.bottone'),
    nastro: nastro,
    nome: String(testi['marchio.nome'] || canale),
    urlCanale: 'https://www.twitch.tv/' + canale,
    iconaTwitch: iconaTwitch,
    social: social,
    messaggio: testoricco.sanifica(testoDi('manutenzione.messaggio')),
    avatar: String(immagini.avatar || ''),
    mascotte: String(immagini.mascotte || ''),
    og: String(immagini.og || ''),
    favicon: String(immagini.favicon || ''),
    fontUrl: tema.urlGoogleFonts(config.tema, []),
    anno: SBOrari.dataNelFuso(adesso, FUSO_ITALIA).slice(0, 4),
    conto: !!fine,
    fine: fine ? fine.iso : '',
    etichetta: fine ? etichettaManutenzione(testoDi('manutenzione.contoPrima').trim(), fine, adesso) : '',
    script: script,
    impronta: impronta,
    scriptSrc: '\'' + impronta + '\''
  };
}

function rendiManutenzione(contenuti, opzioni) {
  const scelte = opzioni || {};
  const cache = scelte.cache || new Map();
  if (!eFile(P.modelloManutenzione)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloManutenzione) +
      ': e il modello della pagina di manutenzione.');
  }
  const contesto = { manutenzione: contestoManutenzione(contenuti, momentoDi(scelte), cache) };
  return togliCommenti(modello.rendiFile(P.modelloManutenzione, contesto,
    { file: 'modelli/manutenzione.html', cartella: P.modelli, cache: cache }));
}

function anteprimaManutenzione(contenuti) {
  return rendiManutenzione(contenuti);
}

function inManutenzione() {
  try {
    return fs.readFileSync(P.indexHtml, 'utf8').indexOf(SEGNO_MANUTENZIONE) !== -1;
  } catch (e) {
    return false;
  }
}

function rendi(contenuti, opzioni) {

  const cache = new Map();

  const scelte = Object.assign({}, opzioni, { cache: cache });
  scelte.adesso = momentoDi(scelte);
  const contesto = costruisciContesto(contenuti, scelte);

  if (!eFile(P.modelloIndex)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloIndex) + ': senza modello non si genera niente.');
  }
  if (!eFile(P.modelloDati)) {
    throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloDati) + ': e il modello di js/dati.js.');
  }

  const html = togliCommenti(modello.rendiFile(P.modelloIndex, contesto,
    { file: 'modelli/index.html', cartella: P.modelli, cache: cache }));

  let clip = null;
  if (contesto.clipPagina.attivo) {
    if (!eFile(P.modelloClip)) {
      throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloClip) +
        ': e il modello della pagina di tutte le clip.');
    }
    clip = togliCommenti(modello.rendiFile(P.modelloClip, contesto,
      { file: 'modelli/clip.html', cartella: P.modelli, cache: cache }));
  }

  let sponsor = null;
  if (contesto.sponsor.attivo) {
    if (!eFile(P.modelloSponsor)) {
      throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloSponsor) +
        ': e il modello della pagina degli sponsor.');
    }
    sponsor = togliCommenti(modello.rendiFile(P.modelloSponsor, contesto,
      { file: 'modelli/sponsor.html', cartella: P.modelli, cache: cache }));
  }

  let giochi = null;
  if (contesto.giochi.attivo) {
    if (!eFile(P.modelloGiochi)) {
      throw erroreHttp(500, 'Manca ' + path.relative(P.radice, P.modelloGiochi) +
        ': e il modello della pagina dei giochi.');
    }
    giochi = togliCommenti(modello.rendiFile(P.modelloGiochi, contesto,
      { file: 'modelli/giochi.html', cartella: P.modelli, cache: cache }));
  }
  const dati = modello.rendiFile(P.modelloDati, Object.assign({ dati: jsonSicuro(oggettoDati(contenuti, scelte)) }, contesto),
    { file: 'server/modelli/dati.js.tpl', cartella: P.modelli, cache: cache });

  const foglio = tema.css(contenuti.config.tema);
  const manutenzione = manutenzioneAttiva(contenuti.config) ? rendiManutenzione(contenuti, scelte) : null;

  return { html: html, clip: clip, sponsor: sponsor, giochi: giochi, dati: dati, tema: foglio, contesto: contesto, manutenzione: manutenzione };
}

function anteprima() {
  return rendi(archivio.leggi()).html;
}

function anteprimaDi(contenuti) {
  return rendi(contenuti).html;
}

function perEditor(html) {
  let pagina = String(html).replace(/<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script>[^\S\n]*\n?/gi, '');
  pagina = pagina.replace(/<head\b[^>]*>/i, (testa) => testa + '<base href="/">');

  const vuoto = (id) => '<style id="' + id + '"></style>\n';
  if (pagina.indexOf('<style id="sb-disposizione">') === -1) {

    const dove = pagina.indexOf('<style id="sb-stili">');
    const punto = dove !== -1 ? dove : pagina.indexOf('</head>');
    pagina = pagina.slice(0, punto) + vuoto('sb-disposizione') + pagina.slice(punto);
  }
  if (pagina.indexOf('<style id="sb-stili">') === -1) {
    const punto = pagina.indexOf('</head>');
    pagina = pagina.slice(0, punto) + vuoto('sb-stili') + pagina.slice(punto);
  }
  return pagina;
}

function anteprimaEditor(contenuti) {
  return perEditor(rendi(contenuti).html);
}

const FILE_OCCUPATO = new Set(['EPERM', 'EACCES', 'EBUSY']);

function scriviGenerato(percorso, testo) {
  let ultimo = null;
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    try {
      scriviAtomico(percorso, testo);
      return;
    } catch (e) {
      if (!e || !FILE_OCCUPATO.has(e.code)) { throw e; }
      ultimo = e;

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (tentativo + 1));
    }
  }
  try {
    fs.writeFileSync(percorso, testo);
  } catch (e) {
    throw erroreHttp(500, 'Non riesco a scrivere ' + path.relative(P.radice, percorso) +
      ': un altro programma lo tiene aperto (' + ((ultimo && ultimo.code) || e.code) +
      '). Chiudi i programmi che mostrano il sito da questa cartella e riprova.');
  }
}

function xml(valore) {
  return String(valore)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sitemapXml(indirizzo, quando, pagine) {
  const letta = new Date(quando);
  const giorno = (Number.isFinite(letta.getTime()) ? letta : new Date()).toISOString().slice(0, 10);
  const elenco = (Array.isArray(pagine) && pagine.length) ? pagine : [''];
  let fuori = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const pagina of elenco) {
    fuori += '  <url>\n' +
      '    <loc>' + xml(indirizzo + pagina) + '</loc>\n' +
      '    <lastmod>' + giorno + '</lastmod>\n' +
      '  </url>\n';
  }
  return fuori + '</urlset>\n';
}

function aggiornaRobots(indirizzo) {
  const file = path.join(P.radice, 'robots.txt');
  let prima;
  try {
    prima = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return 'non c\'e';
  }
  const riga = 'Sitemap: ' + indirizzo + 'sitemap.xml';

  let dopo;
  if (/^[ \t]*Sitemap[ \t]*:.*$/im.test(prima)) {
    let laPrima = true;
    dopo = prima.replace(/^[ \t]*Sitemap[ \t]*:.*(\r?\n?)/gim, (tutta, aCapo) => {
      if (!laPrima) { return ''; }
      laPrima = false;
      return riga + (aCapo || '\n');
    });
  } else {
    const testa = prima.replace(/\s*$/, '');
    dopo = (testa ? testa + '\n' : '') + riga + '\n';
  }
  if (dopo === prima) { return 'gia a posto'; }
  try {
    scriviGenerato(file, dopo);
  } catch (e) {
    return 'non scritto';
  }
  return 'aggiornato';
}

function scriviSitemap(sito, quando, pagine) {
  if (!sito || !sito.indirizzo) { return null; }
  const testo = sitemapXml(sito.indirizzo, quando, pagine);
  try {
    scriviGenerato(path.join(P.radice, 'sitemap.xml'), testo);
  } catch (e) {

    return { file: 'sitemap.xml', byte: 0, indirizzo: sito.indirizzo, robots: 'non provato',
      errore: (e && e.message) ? e.message : String(e) };
  }
  return {
    file: 'sitemap.xml',
    byte: Buffer.byteLength(testo, 'utf8'),
    indirizzo: sito.indirizzo,
    pagine: (Array.isArray(pagine) && pagine.length) ? pagine.length : 1,
    robots: aggiornaRobots(sito.indirizzo)
  };
}

function scriviPaginaClip(html) {
  if (html) {
    scriviGenerato(P.clipHtml, html);
    return { file: 'clip.html', stato: 'scritta', byte: Buffer.byteLength(html, 'utf8') };
  }
  if (!eFile(P.clipHtml)) { return { file: 'clip.html', stato: 'niente', byte: 0 }; }
  try {
    fs.unlinkSync(P.clipHtml);
    return { file: 'clip.html', stato: 'tolta', byte: 0 };
  } catch (e) {
    return { file: 'clip.html', stato: 'non tolta', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

function scriviPaginaSponsor(html) {
  if (html) {
    scriviGenerato(P.sponsorHtml, html);
    return { file: 'sponsor.html', stato: 'scritta', byte: Buffer.byteLength(html, 'utf8') };
  }
  if (!eFile(P.sponsorHtml)) { return { file: 'sponsor.html', stato: 'niente', byte: 0 }; }
  try {
    fs.unlinkSync(P.sponsorHtml);
    return { file: 'sponsor.html', stato: 'tolta', byte: 0 };
  } catch (e) {
    return { file: 'sponsor.html', stato: 'non tolta', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

function scriviPaginaGiochi(html) {
  if (html) {
    scriviGenerato(P.giochiHtml, html);
    return { file: 'giochi.html', stato: 'scritta', byte: Buffer.byteLength(html, 'utf8') };
  }
  if (!eFile(P.giochiHtml)) { return { file: 'giochi.html', stato: 'niente', byte: 0 }; }
  try {
    fs.unlinkSync(P.giochiHtml);
    return { file: 'giochi.html', stato: 'tolta', byte: 0 };
  } catch (e) {
    return { file: 'giochi.html', stato: 'non tolta', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

function scriviStatoSito(manutenzione, quando) {
  const testo = JSON.stringify({ manutenzione: !!manutenzione, pubblicatoIl: quando || new Date().toISOString() }) + '\n';
  try {
    scriviGenerato(P.statoSito, testo);
    return { file: 'stato-sito.json', manutenzione: !!manutenzione, byte: Buffer.byteLength(testo, 'utf8') };
  } catch (e) {
    return { file: 'stato-sito.json', manutenzione: !!manutenzione, byte: 0,
      errore: (e && e.message) ? e.message : String(e) };
  }
}

function allineaStatoDopoRipristino() {
  return scriviStatoSito(inManutenzione());
}

function allineaClipDopoRipristino() {
  const leggi = (percorso) => {
    try { return fs.readFileSync(percorso, 'utf8'); } catch (e) { return ''; }
  };
  const home = leggi(P.indexHtml);
  const prima = leggi(P.clipHtml);
  try {
    if (home.indexOf(SEGNO_MANUTENZIONE) !== -1) {
      return home === prima ? null : scriviPaginaClip(home);
    }
    if (prima.indexOf(SEGNO_MANUTENZIONE) === -1) { return null; }
    return scriviPaginaClip(rendi(archivio.leggi()).clip);
  } catch (e) {
    return { file: 'clip.html', stato: 'non allineata', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

function allineaSponsorDopoRipristino() {
  const leggi = (percorso) => {
    try { return fs.readFileSync(percorso, 'utf8'); } catch (e) { return ''; }
  };
  const home = leggi(P.indexHtml);
  const prima = leggi(P.sponsorHtml);
  try {
    if (home.indexOf(SEGNO_MANUTENZIONE) !== -1) {
      return home === prima ? null : scriviPaginaSponsor(home);
    }
    if (prima.indexOf(SEGNO_MANUTENZIONE) === -1) { return null; }
    return scriviPaginaSponsor(rendi(archivio.leggi()).sponsor);
  } catch (e) {
    return { file: 'sponsor.html', stato: 'non allineata', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

function allineaGiochiDopoRipristino() {
  const leggi = (percorso) => {
    try { return fs.readFileSync(percorso, 'utf8'); } catch (e) { return ''; }
  };
  const home = leggi(P.indexHtml);
  const prima = leggi(P.giochiHtml);
  try {
    if (home.indexOf(SEGNO_MANUTENZIONE) !== -1) {
      return home === prima ? null : scriviPaginaGiochi(home);
    }
    if (prima.indexOf(SEGNO_MANUTENZIONE) === -1) { return null; }
    return scriviPaginaGiochi(rendi(archivio.leggi()).giochi);
  } catch (e) {
    return { file: 'giochi.html', stato: 'non allineata', byte: 0, errore: (e && e.message) ? e.message : String(e) };
  }
}

function genera(opzioni) {
  const scelte = opzioni || {};
  const inizio = Date.now();
  const contenuti = archivio.leggi();

  const scoperte = schema.verificaCopertura(contenuti);
  if (scoperte.length) {
    throw erroreHttp(500, 'Lo schema non copre i contenuti: ' + scoperte.length +
      (scoperte.length === 1 ? ' problema.' : ' problemi.'), { problemi: scoperte });
  }

  const copia = backup.crea();

  pulisciEditor(contenuti);
  const errori = convalida.convalida(contenuti);
  if (errori.length) {
    throw erroreHttp(422, 'I contenuti non passano la convalida: ' + convalida.riassumi(errori) +
      '. Non ho scritto niente.', { errori: errori });
  }

  const reso = rendi(contenuti, scelte);

  const pagina = reso.manutenzione || reso.html;
  scriviGenerato(P.indexHtml, pagina);
  scriviGenerato(P.datiJs, reso.dati);
  scriviGenerato(P.temaCss, reso.tema);

  const paginaClip = scriviPaginaClip(reso.manutenzione || reso.clip);
  const paginaSponsor = scriviPaginaSponsor(reso.manutenzione || reso.sponsor);
  const paginaGiochi = scriviPaginaGiochi(reso.manutenzione || reso.giochi);

  const quando = archivio.salva(contenuti);
  const statoSito = scriviStatoSito(!!reso.manutenzione, quando);

  const pagine = [''];
  if (reso.clip) { pagine.push('clip.html'); }
  if (reso.sponsor) { pagine.push('sponsor.html'); }
  if (reso.giochi) { pagine.push('giochi.html'); }
  const mappa = scriviSitemap(controlli.indirizzoSito(contenuti.config), quando, pagine);

  return {
    ok: true,
    backup: copia,
    durataMs: Date.now() - inizio,
    aggiornatoIl: quando,
    sitemap: mappa,
    paginaClip: paginaClip,
    paginaSponsor: paginaSponsor,
    paginaGiochi: paginaGiochi,
    statoSito: statoSito,
    manutenzione: {
      attiva: !!reso.manutenzione,
      pagine: reso.manutenzione ? ['index.html', 'clip.html', 'sponsor.html', 'giochi.html'] : []
    },
    scritti: [
      { file: 'index.html', byte: Buffer.byteLength(pagina, 'utf8') },
      { file: 'js/dati.js', byte: Buffer.byteLength(reso.dati, 'utf8') },
      { file: 'css/tema.css', byte: Buffer.byteLength(reso.tema, 'utf8') }
    ],
    social: reso.contesto.social.length,
    supporto: reso.contesto.supporto.length,
    sponsor: reso.contesto.sponsor.quanti,
    giochiInPagina: reso.contesto.giochi.quanti,

    controlli: controlli.controlli(contenuti)
  };
}

module.exports = {
  genera, anteprima, anteprimaDi, anteprimaEditor, anteprimaManutenzione, inManutenzione,
  allineaClipDopoRipristino, allineaSponsorDopoRipristino, allineaGiochiDopoRipristino, allineaStatoDopoRipristino,
  fineManutenzione, istanteItaliano, rendi, costruisciContesto,
  pulisciEditor, opzioniStili, blocchiPresenti, perEditor,
  oggettoDati, orariTesto, settimanaDi, clipDi, clipPaginaDi, sponsorDi, giochiDi, jsonSicuro, chiaviRicche,
  orariDi, orariDati, eventiDi, sfondoDi, categoriaDiretta,

  togliCommenti
};
