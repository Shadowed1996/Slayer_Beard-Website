const SEZIONI = {
  binario: {
    nome: 'Menu laterale',
    descrizione: 'Il nome del canale, le voci che portano alle sezioni, la spia di stato e i link social. Sul computer sta di lato; su tablet e telefono diventa la barra in basso.'
  },
  regia: {
    nome: 'Copertina',
    descrizione: 'La prima schermata: il titolo grande, le spie di stato, i due bottoni e i quattro numeri del canale.'
  },
  diretta: {
    nome: 'La diretta',
    descrizione: 'Il player di Twitch con la chat, il profilo del sito, il pollo, la modalità lurk e la vetrina delle clip.'
  },
  sondaggio: {
    nome: 'Il sondaggio',
    descrizione: 'La domanda del sondaggio aperto, con le risposte da votare dopo il login con Twitch e i risultati. Senza un sondaggio aperto (o chiuso da meno di una settimana) non si vede. I sondaggi si creano dal menu, alla voce «Sondaggi».'
  },
  settimana: {
    nome: 'La settimana',
    descrizione: 'I sette giorni come locandine, con titolo, gioco e immagine di ogni diretta; gli eventi speciali con la loro data; il fondale dietro la sezione; la nota con il bottone in fondo.'
  },
  chi: {
    nome: 'Chi sono',
    descrizione: 'Il racconto a colonna larga, la citazione, le note a margine con i numeri e il ritratto.'
  },
  supporto: {
    nome: 'Come dare una mano',
    descrizione: 'Il listino delle righe di supporto, con il testo di apertura e la riga di chiusura.'
  },
  sponsor: {
    nome: 'Gli sponsor',
    descrizione: 'La striscia di chi sostiene il canale, sotto «Dove mi trovi», e il bottone che porta alla pagina con tutti quanti.'
  },
  saluti: {
    nome: 'Dove mi trovi',
    descrizione: 'I profili social, l\'indirizzo email con i bottoni per copiarlo o scrivere, e la riga di chiusura.'
  },
  piede: {
    nome: 'Piede della pagina',
    descrizione: 'Le tre righe in fondo: copyright, avvertenza sui marchi e nota finale.'
  }
};

const PARTI = {
  social: {
    nome: 'Link social',
    descrizione: 'I tuoi profili: nome, link, icona e ordine. Compaiono sia nel menu laterale sia in «Dove mi trovi», sempre nello stesso ordine.'
  },
  stato: {
    nome: 'Riquadro di stato',
    descrizione: 'Le spie della copertina: «in onda» o «fuori onda», la prossima diretta con il conto alla rovescia e il titolo dell\'ultima. Il sito le aggiorna da solo mentre gira: qui scegli le parole. Giorni e ore del conto alla rovescia vengono dalla schedule, che si cambia dal nastro della settimana.'
  },
  monitor: {
    nome: 'Monitor del player',
    descrizione: 'La cornice intorno al player di Twitch: il bottone della chat, la riga sotto allo schermo e il link al canale. Il video non si sposta e non si copre: Twitch non conterebbe chi guarda.'
  },
  account: {
    nome: 'Profilo del sito',
    descrizione: 'Il login con Twitch: chi si collega ha una tessera col proprio nome, e il sito può leggere da Twitch se il canale è davvero in onda.'
  },
  pollo: {
    nome: 'Il pollo',
    descrizione: 'La mascotte accanto al player: cosa dice, quando lo dice e se ascolta davvero la chat del canale.'
  },
  lurk: {
    nome: 'Modalità lurk',
    descrizione: 'Il riquadro sotto al player per chi guarda e si allontana: rimette in moto il video quando il browser lo ferma, e se lo accendi dice in chat che si sta guardando.'
  },
  clip: {
    nome: 'Le clip',
    descrizione: 'La vetrina dei momenti migliori in fondo alla diretta. Le clip le prende il server da Twitch a ogni pubblicazione: qui decidi quante, di che periodo e come si presenta.'
  },
  nastro: {
    nome: 'Nastro della settimana',
    descrizione: 'La schedule: i sette giorni con le loro locandine (ora, titolo, gioco, nota, immagine), gli eventi speciali e il fondale della sezione. Più giù, le etichette scritte sui giorni.'
  },
  eventi: {
    nome: 'Eventi speciali',
    descrizione: 'Le dirette fuori programma con una data precisa, come una maratona o uno speciale: data, ora, durata, titolo e immagine. Un evento finito sparisce dal sito da solo. Più giù, il titolo del riquadro e l\'etichetta di ogni evento.'
  },
  sponsor: {
    nome: 'Gli sponsor',
    descrizione: 'Chi sostiene il canale: logo, nome, categoria, link e periodo di validità. Uno sponsor senza link non si vede, e passata la data di fine sparisce da solo.'
  },
  giochi: {
    nome: 'I giochi',
    descrizione: 'L\'invito in fondo a «Chi sono» e la pagina «giochi.html» con tutti i giochi portati in live: copertine, tipologie, dirette, ore e clip. I numeri li prende il server da Twitch a ogni pubblicazione; qui scegli le parole, cosa nascondere e le correzioni a mano.'
  },
  listino: {
    nome: 'Listino del supporto',
    descrizione: 'Le righe per dare una mano: titolo, spiegazione, etichetta, bottone e link. Una riga senza link sparisce dal sito invece di comparire rotta.'
  }
};

const BLOCCHI = {
  'regia.quadro': 'Quadro comandi',
  'regia.dati': 'I quattro numeri',

  'settimana.testa': 'Titolo e introduzione',
  'settimana.nastro': 'Nastro dei sette giorni',
  'settimana.eventi': 'Eventi speciali',
  'settimana.piede': 'Nota e bottone',

  'chi.corpo': 'Racconto',
  'chi.margine': 'Note a margine',
  'chi.ritratto': 'Ritratto',

  'supporto.testa': 'Titolo e introduzione',
  'supporto.listino': 'Listino',
  'supporto.chiusura': 'Riga di chiusura',

  'sponsor.testa': 'Titolo e introduzione',
  'sponsor.striscia': 'Striscia degli sponsor',
  'sponsor.vai': 'Bottone verso la pagina',

  'saluti.social': 'Titolo e social',
  'saluti.contatti': 'Contatti',
  'saluti.chiusura': 'Riga di chiusura',

  'piede.copy': 'Copyright',
  'piede.disclaimer': 'Avvertenza sui marchi',
  'piede.nota': 'Nota finale'
};

function haVoce(tabella, chiave) {
  return Object.prototype.hasOwnProperty.call(tabella, chiave);
}

function leggibile(pezzo) {
  const testo = String(pezzo || '').replace(/[-_.]+/g, ' ').trim();
  return testo ? testo.charAt(0).toUpperCase() + testo.slice(1) : '';
}

export function nomeSezione(id) {
  const chiave = String(id || '');
  if (haVoce(SEZIONI, chiave)) return SEZIONI[chiave].nome;
  return leggibile(chiave) || 'Sezione';
}

export function descrizioneSezione(id) {
  const chiave = String(id || '');
  if (haVoce(SEZIONI, chiave)) return SEZIONI[chiave].descrizione;
  return 'Una parte della pagina.';
}

export function nomeParte(nome) {
  const chiave = String(nome || '');
  if (haVoce(PARTI, chiave)) return PARTI[chiave].nome;
  return chiave ? 'Parte «' + leggibile(chiave) + '»' : 'Parte senza nome';
}

export function descrizioneParte(nome) {
  const chiave = String(nome || '');
  if (haVoce(PARTI, chiave)) return PARTI[chiave].descrizione;
  return 'Una parte della pagina guidata dai dati. I suoi testi si cambiano cliccandoli, l\'aspetto dalla scheda Stile.';
}

export function nomeBlocco(id) {
  const chiave = String(id || '');
  if (haVoce(BLOCCHI, chiave)) return BLOCCHI[chiave];
  const nome = chiave.split('.').pop();
  return nome ? 'Blocco «' + leggibile(nome) + '»' : 'Blocco';
}

export const REGISTRO_PARTI = Object.freeze({
  social: Object.freeze({ chiavi: Object.freeze(['config.social']) }),
  stato: Object.freeze({
    chiavi: Object.freeze([
      'deck.etichettaStato', 'deck.statoVerifica', 'deck.statoLive', 'deck.statoOffline',
      'deck.etichettaProssima', 'deck.etichettaUltima', 'config.ultimaDiretta'
    ])
  }),
  monitor: Object.freeze({
    chiavi: Object.freeze(['deck.notaPlayer', 'deck.chatApri', 'deck.chatChiudi', 'nav.vaiAlCanale', 'config.twitch.canale'])
  }),
  account: Object.freeze({ gruppo: 'account' }),
  pollo: Object.freeze({ gruppo: 'pollo' }),
  lurk: Object.freeze({ gruppo: 'lurk' }),
  clip: Object.freeze({ gruppo: 'clip' }),
  nastro: Object.freeze({
    chiavi: Object.freeze([
      'config.orari', 'settimana.etichettaDiretta', 'settimana.etichettaRiposo',
      'settimana.etichettaOggi', 'settimana.etichettaProssima',
      'settimana.etichettaInOnda', 'settimana.etichettaDaTe'
    ])
  }),
  eventi: Object.freeze({
    chiavi: Object.freeze(['config.orari', 'settimana.titoloEventi', 'settimana.etichettaEvento'])
  }),
  listino: Object.freeze({ chiavi: Object.freeze(['config.supporto']) }),
  sponsor: Object.freeze({ chiavi: Object.freeze(['config.sponsor.voci']) }),
  giochi: Object.freeze({ gruppo: 'giochi' })
});

export const PARTI_REGISTRATE = Object.freeze(Object.keys(REGISTRO_PARTI));

function gruppiDelloSchema(schema) {
  return schema && Array.isArray(schema.gruppi) ? schema.gruppi : [];
}

export function chiaviParte(nome, schema) {
  const voce = haVoce(REGISTRO_PARTI, String(nome || '')) ? REGISTRO_PARTI[nome] : null;
  if (!voce) return [];
  if (voce.chiavi) return voce.chiavi.slice();
  const gruppo = gruppiDelloSchema(schema).find((g) => g && g.id === voce.gruppo);
  return gruppo && Array.isArray(gruppo.campi) ? gruppo.campi.map((c) => c.chiave).filter(Boolean) : [];
}

export function partiDellaChiave(chiave, schema) {
  const cercata = String(chiave || '').replace(/\[(\d+)\]/g, '.$1');
  if (!cercata) return [];
  const trovate = [];
  for (const nome of PARTI_REGISTRATE) {
    for (const propria of chiaviParte(nome, schema)) {
      if (cercata === propria || cercata.startsWith(propria + '.')) {
        trovate.push(nome);
        break;
      }
    }
  }
  return trovate;
}

const SEZIONE_DEL_GRUPPO = Object.freeze({
  marchio: 'binario',
  deck: 'regia',
  diretta: 'diretta',
  account: 'diretta',
  lurk: 'diretta',
  pollo: 'diretta',
  clip: 'diretta',
  giochi: 'chi',
  sondaggio: 'sondaggio',
  settimana: 'settimana',
  chi: 'chi',
  supporto: 'supporto',
  saluti: 'saluti',
  sponsor: 'sponsor',
  piede: 'piede'
});

const GRUPPO_DELLA_SEZIONE = Object.freeze({
  binario: 'marchio',
  regia: 'deck',
  diretta: 'diretta',
  sondaggio: 'sondaggio',
  settimana: 'settimana',
  chi: 'chi',
  supporto: 'supporto',
  saluti: 'saluti',
  sponsor: 'sponsor',
  piede: 'piede'
});

export function sezioneDelGruppo(idGruppo) {
  const chiave = String(idGruppo || '');
  return haVoce(SEZIONE_DEL_GRUPPO, chiave) ? SEZIONE_DEL_GRUPPO[chiave] : '';
}

export function gruppoDellaSezione(idSezione) {
  const chiave = String(idSezione || '');
  return haVoce(GRUPPO_DELLA_SEZIONE, chiave) ? GRUPPO_DELLA_SEZIONE[chiave] : '';
}
