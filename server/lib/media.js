'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { P } = require('./percorsi');
const { assicuraCartella, scriviAtomico } = require('./file');
const { erroreHttp } = require('./risposte');

const MAX_BYTE = 4 * 1024 * 1024;
const ESTENSIONI = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
const TIPI = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

function confineDi(intestazione) {
  if (typeof intestazione !== 'string' || intestazione.indexOf('multipart/form-data') === -1) { return null; }
  const trovato = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(intestazione);
  if (!trovato) { return null; }
  return trovato[1] || trovato[2];
}

function campiModulo(corpo, confine) {
  const separatore = Buffer.from('--' + confine);
  const fuori = [];
  let posizione = corpo.indexOf(separatore);
  if (posizione === -1) { return fuori; }

  while (posizione !== -1) {
    const inizio = posizione + separatore.length;

    if (corpo.slice(inizio, inizio + 2).toString('latin1') === '--') { break; }

    const prossimo = corpo.indexOf(separatore, inizio);
    if (prossimo === -1) { break; }

    const blocco = corpo.slice(inizio, prossimo);
    const stacco = blocco.indexOf('\r\n\r\n');
    posizione = prossimo;
    if (stacco === -1) { continue; }

    const intestazioni = blocco.slice(0, stacco).toString('utf8');

    let dati = blocco.slice(stacco + 4);
    if (dati.length >= 2 && dati[dati.length - 2] === 13 && dati[dati.length - 1] === 10) {
      dati = dati.slice(0, dati.length - 2);
    }

    const campo = /(?:^|[;\s])name="([^"]*)"/i.exec(intestazioni);
    const nome = /filename\*?=(?:"([^"]*)"|([^;\r\n]+))/i.exec(intestazioni);
    fuori.push({
      campo: campo ? campo[1] : '',
      nomeFile: nome ? (nome[1] || nome[2] || '').trim() : null,
      dati: dati
    });
  }
  return fuori;
}

function parti(corpo, confine) {
  return campiModulo(corpo, confine)
    .filter((parte) => parte.nomeFile !== null)
    .map((parte) => ({ nome: parte.nomeFile, dati: parte.dati }));
}

function normalizzaNome(grezzo) {
  const originale = String(grezzo == null ? '' : grezzo).trim();
  if (!originale) { throw erroreHttp(400, 'Manca il nome del file.'); }
  if (/[\\/\0]|\.\./.test(originale)) {
    throw erroreHttp(400, 'Il nome del file non puo contenere ".." ne barre.');
  }

  const pulito = originale.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '');

  const punto = pulito.lastIndexOf('.');
  const estensione = punto === -1 ? '' : pulito.slice(punto + 1);
  const base = punto === -1 ? pulito : pulito.slice(0, punto);

  if (!base) { throw erroreHttp(400, 'Dopo la ripulitura non resta un nome utilizzabile.'); }
  if (base.length > 80) { throw erroreHttp(400, 'Nome del file troppo lungo: massimo 80 caratteri.'); }
  if (ESTENSIONI.indexOf(estensione) === -1) {
    throw erroreHttp(415, 'Formato non ammesso. Si caricano solo: ' + ESTENSIONI.join(', ') + '.');
  }
  return { base: base, estensione: estensione, nome: base + '.' + estensione };
}

function nomeLibero(base, estensione) {
  let nome = base + '.' + estensione;
  let n = 2;
  while (fs.existsSync(path.join(P.media, nome))) {
    nome = base + '-' + n + '.' + estensione;
    n++;
  }
  return nome;
}

function contenutoCoerente(estensione, dati) {
  if (dati.length < 12) { return 'Il file e troppo corto per essere un immagine.'; }
  const testa = dati.slice(0, 12);

  if (estensione === 'png') {
    return testa.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? null : 'Questo file non e un PNG.';
  }
  if (estensione === 'jpg' || estensione === 'jpeg') {
    return (testa[0] === 0xff && testa[1] === 0xd8 && testa[2] === 0xff) ? null : 'Questo file non e un JPEG.';
  }
  if (estensione === 'webp') {
    return (testa.slice(0, 4).toString('latin1') === 'RIFF' && testa.slice(8, 12).toString('latin1') === 'WEBP')
      ? null : 'Questo file non e un WebP.';
  }
  if (estensione === 'gif') {
    const firma = testa.slice(0, 6).toString('latin1');
    return (firma === 'GIF87a' || firma === 'GIF89a') ? null : 'Questo file non e una GIF.';
  }

  const testo = dati.toString('utf8');
  if (testo.indexOf('<svg') === -1) { return 'Questo file non contiene un elemento <svg>.'; }
  if (/<script[\s>]/i.test(testo) || /\son\w+\s*=/i.test(testo) || /javascript:/i.test(testo)) {
    return 'Questo SVG contiene script o gestori di eventi: non lo carico.';
  }
  return null;
}

function descrivi(nome) {
  const stato = fs.statSync(path.join(P.media, nome));
  const estensione = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
  return {
    nome: nome,

    percorso: 'contenuti/media/' + nome,
    href: '/contenuti/media/' + nome,
    tipo: TIPI[estensione] || 'application/octet-stream',
    byte: stato.size,
    quando: stato.mtime.toISOString()
  };
}

function elenco() {
  if (!fs.existsSync(P.media)) { return []; }
  const fuori = [];
  for (const nome of fs.readdirSync(P.media)) {
    const estensione = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
    if (ESTENSIONI.indexOf(estensione) === -1) { continue; }
    try {
      if (!fs.statSync(path.join(P.media, nome)).isFile()) { continue; }
      fuori.push(descrivi(nome));
    } catch (e) {}
  }
  fuori.sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
  return fuori;
}

function salva(corpo, tipoContenuto) {
  const confine = confineDi(tipoContenuto);
  if (!confine) {
    throw erroreHttp(400, 'Il caricamento deve arrivare come multipart/form-data.');
  }
  const trovate = parti(corpo, confine);
  if (!trovate.length) { throw erroreHttp(400, 'Nella richiesta non c e nessun file.'); }

  const parte = trovate[0];
  const { base, estensione } = normalizzaNome(parte.nome);
  if (!parte.dati.length) { throw erroreHttp(400, 'Il file caricato e vuoto.'); }
  if (parte.dati.length > MAX_BYTE) {
    throw erroreHttp(413, 'Il file supera il limite di 4 MB.');
  }
  const guaio = contenutoCoerente(estensione, parte.dati);
  if (guaio) { throw erroreHttp(415, guaio); }

  assicuraCartella(P.media);
  const nome = nomeLibero(base, estensione);
  scriviAtomico(path.join(P.media, nome), parte.dati);
  return descrivi(nome);
}

function doveUsato(nome, contenuti) {
  const candidati = ['contenuti/media/' + nome, '/contenuti/media/' + nome, './contenuti/media/' + nome, nome];
  const usi = [];

  const guarda = (valore, chiave) => {
    if (typeof valore === 'string') {
      if (candidati.indexOf(valore.trim()) !== -1) { usi.push(chiave); }
      return;
    }
    if (valore && typeof valore === 'object') {
      for (const k of Object.keys(valore)) {
        guarda(valore[k], chiave ? chiave + '.' + k : k);
      }
    }
  };

  guarda((contenuti && contenuti.testi) || {}, '');
  guarda((contenuti && contenuti.config) || {}, 'config');
  return usi;
}

function elimina(nomeGrezzo, contenuti) {
  const { nome } = normalizzaNome(nomeGrezzo);
  const file = path.join(P.media, nome);
  if (!fs.existsSync(file)) { throw erroreHttp(404, 'Questo file non esiste.'); }

  const usi = doveUsato(nome, contenuti);
  if (usi.length) {
    throw erroreHttp(409, 'Non posso eliminarlo: e ancora usato da ' + usi.join(', ') +
      '. Cambia prima quel campo, poi riprova.', { usatoDa: usi });
  }

  fs.unlinkSync(file);
  return nome;
}

module.exports = { elenco, salva, elimina, doveUsato, normalizzaNome, confineDi, parti, campiModulo, ESTENSIONI, MAX_BYTE };
