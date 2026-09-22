'use strict';

const TIPI = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];

const ALTEZZE = { compatto: 80, grande: 152 };

function leggiLink(valore) {
  const testo = String(valore == null ? '' : valore).trim();
  if (!testo) { return null; }
  let m = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(testo);
  if (!m) {
    m = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?([a-z]+)\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/i.exec(testo);
  }
  if (!m) { return null; }
  const tipo = m[1].toLowerCase();
  if (TIPI.indexOf(tipo) === -1) { return null; }
  return { tipo: tipo, id: m[2] };
}

function indirizzoIncorporato(valore) {
  const letto = leggiLink(valore);
  return letto ? 'https://open.spotify.com/embed/' + letto.tipo + '/' + letto.id + '?utm_source=generator&theme=0' : '';
}

function problemaLink(valore) {
  if (leggiLink(valore)) { return null; }
  return 'non sembra un link di Spotify. Su Spotify apri la playlist (o l\'album, il brano, il podcast), premi «Condividi» e poi «Copia link»: deve cominciare con https://open.spotify.com/.';
}

function altezza(formato) {
  return Object.prototype.hasOwnProperty.call(ALTEZZE, formato) ? ALTEZZE[formato] : ALTEZZE.compatto;
}

module.exports = { TIPI, ALTEZZE, leggiLink, indirizzoIncorporato, problemaLink, altezza };
