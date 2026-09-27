import { api } from '../moduli/api.js';
import { avviso, conferma, apriDialogo } from '../moduli/avvisi.js';

let impl = null;

function chiama(nome, riserva, argomenti) {
  const funzione = impl && impl[nome];
  if (typeof funzione !== 'function') return typeof riserva === 'function' ? riserva() : riserva;
  return funzione(...argomenti);
}

export const ponte = {
  pronto: false,

  stato: null,

  api,

  leggi(chiave) {
    return chiama('leggi', undefined, [chiave]);
  },

  scrivi(chiave, valore, { strutturale = false } = {}) {
    return chiama('scrivi', undefined, [chiave, valore, { strutturale }]);
  },

  segnala(chiave, { strutturale = false } = {}) {
    return chiama('segnala', undefined, [chiave, { strutturale }]);
  },

  campo(chiave) {
    return chiama('campo', null, [chiave]);
  },

  gruppo(id) {
    return chiama('gruppo', null, [id]);
  },

  gruppoDi(chiave) {
    return chiama('gruppoDi', null, [chiave]);
  },

  etichetta(chiave) {
    return chiama('etichetta', String(chiave || ''), [chiave]);
  },

  creaCampo(campo) {
    return chiama('creaCampo', null, [campo]);
  },

  scegliImmagine(valoreCorrente) {
    return chiama('scegliImmagine', () => Promise.resolve(null), [valoreCorrente]);
  },

  salva() {
    return chiama('salva', () => Promise.resolve(false), []);
  },

  pubblica() {
    return chiama('pubblica', () => Promise.resolve(false), []);
  },

  avviso,
  conferma,
  apriDialogo
};

export function collegaPonte(funzioni) {
  impl = funzioni && typeof funzioni === 'object' ? funzioni : null;
}
