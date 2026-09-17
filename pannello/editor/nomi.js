/* =====================================================================
   nomi.js — come si chiamano le cose della pagina per chi amministra
   (CONTRATTO-4 §11.3).

   È l'unica fonte dei nomi umani di sezioni, parti e blocchi: il percorso
   sopra le schede, la barra in alto, l'etichetta nell'anteprima, il
   Navigatore e gli ispettori leggono tutti da qui. A Mobscene93 i nomi
   stavano in tre posti e dopo due settimane dicevano tre cose diverse
   («Sezione Live», «In diretta», «Live»): una tabella sola evita il
   problema invece di inseguirlo.

   Qui ci sono anche due tabelle che non sono nomi ma servono a sapere
   DOVE sta un campo, e che altrimenti andrebbero copiate in più moduli:
     - il registro delle parti (§5.4): quali campi dello schema si
       modificano da ogni parte guidata dai dati;
     - la corrispondenza fra gruppi dello schema e sezioni della pagina.
   Sono dati di impaginazione, non definizioni di campi (§2.3): etichette,
   tipi e aiuti restano nello schema.

   Nessuna dipendenza e nessun effetto all'import: lo possono caricare il
   motore, il guscio e la ricerca dei campi senza trascinarsi dietro
   niente, e senza rischio di cicli fra moduli.
   ===================================================================== */

/* ------------------------------------------------------------- sezioni */

/* L'ordine è quello della pagina con i valori di partenza: il binario
   prima di tutto, il piede in fondo. Le descrizioni dicono cosa si vede,
   non come è fatto: chi le legge non sa cos'è un <section>. */
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
  saluti: {
    nome: 'Dove mi trovi',
    descrizione: 'I profili social, l\'indirizzo email con i bottoni per copiarlo o scrivere, e la riga di chiusura.'
  },
  piede: {
    nome: 'Piede della pagina',
    descrizione: 'Le tre righe in fondo: copyright, avvertenza sui marchi e nota finale.'
  }
};

/* ---------------------------------------------------------------- parti */

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
  listino: {
    nome: 'Listino del supporto',
    descrizione: 'Le righe per dare una mano: titolo, spiegazione, etichetta, bottone e link. Una riga senza link sparisce dal sito invece di comparire rotta.'
  }
};

/* ------------------------------------------------------------- blocchi */

/* Registro dei blocchi del §5.5, come proposto dal contratto. Il nome dice
   cosa c'è dentro il riquadro che si sposta, perché è quello che si vede
   quando lo si trascina. */
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

  'saluti.social': 'Titolo e social',
  'saluti.contatti': 'Contatti',
  'saluti.chiusura': 'Riga di chiusura',

  'piede.copy': 'Copyright',
  'piede.disclaimer': 'Avvertenza sui marchi',
  'piede.nota': 'Nota finale'
};

/* ------------------------------------------------------------ ripieghi */

function haVoce(tabella, chiave) {
  return Object.prototype.hasOwnProperty.call(tabella, chiave);
}

/* Un nome che non è in tabella (un blocco aggiunto ai modelli senza passare
   di qui) non deve comparire come stringa tecnica nuda né come vuoto: si
   rende leggibile il pezzo finale e lo si dichiara per quello che è. */
function leggibile(pezzo) {
  const testo = String(pezzo || '').replace(/[-_.]+/g, ' ').trim();
  return testo ? testo.charAt(0).toUpperCase() + testo.slice(1) : '';
}

/* ------------------------------------------------------------ i cinque */

/** «Chi sono» per `chi`. */
export function nomeSezione(id) {
  const chiave = String(id || '');
  if (haVoce(SEZIONI, chiave)) return SEZIONI[chiave].nome;
  return leggibile(chiave) || 'Sezione';
}

/** Una frase su cosa si vede nella sezione. */
export function descrizioneSezione(id) {
  const chiave = String(id || '');
  if (haVoce(SEZIONI, chiave)) return SEZIONI[chiave].descrizione;
  return 'Una parte della pagina.';
}

/** «Link social» per `social`. */
export function nomeParte(nome) {
  const chiave = String(nome || '');
  if (haVoce(PARTI, chiave)) return PARTI[chiave].nome;
  return chiave ? 'Parte «' + leggibile(chiave) + '»' : 'Parte senza nome';
}

/** Cosa si modifica dalla parte, detto a chi non programma. */
export function descrizioneParte(nome) {
  const chiave = String(nome || '');
  if (haVoce(PARTI, chiave)) return PARTI[chiave].descrizione;
  return 'Una parte della pagina guidata dai dati. I suoi testi si cambiano cliccandoli, l\'aspetto dalla scheda Stile.';
}

/** «Note a margine» per `chi.margine`. */
export function nomeBlocco(id) {
  const chiave = String(id || '');
  if (haVoce(BLOCCHI, chiave)) return BLOCCHI[chiave];
  const nome = chiave.split('.').pop();
  return nome ? 'Blocco «' + leggibile(nome) + '»' : 'Blocco';
}

/* ------------------------------------------------ registro delle parti */

/**
 * Parte -> campi della scheda Contenuto (§5.4), nell'ordine in cui si
 * disegnano. `gruppo` vuol dire «tutto il gruppo dello schema con questo
 * id», e si espande con lo schema in mano: così un campo aggiunto al
 * gruppo del pollo compare nella parte del pollo senza toccare questo file.
 *
 * `config.orari` sta nel nastro e negli eventi, dove c'è il suo editor
 * (CONTRATTO-5 §8). Nella parte `stato` la schedule si vede solo come
 * riepilogo con il bottone «Modifica la schedule» (lo disegna parti.js):
 * tenerla anche lì nel registro porterebbe la ricerca e gli errori del
 * server su una parte dove l'editor non c'è.
 */
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
  listino: Object.freeze({ chiavi: Object.freeze(['config.supporto']) })
});

/** I nomi delle parti del registro, nell'ordine della pagina. */
export const PARTI_REGISTRATE = Object.freeze(Object.keys(REGISTRO_PARTI));

function gruppiDelloSchema(schema) {
  return schema && Array.isArray(schema.gruppi) ? schema.gruppi : [];
}

/**
 * Le chiavi dei campi di una parte, con i gruppi espansi dallo schema.
 * Senza schema una parte fatta di un gruppo intero torna vuota: meglio
 * nessun campo che un elenco inventato. Parte sconosciuta: [].
 */
export function chiaviParte(nome, schema) {
  const voce = haVoce(REGISTRO_PARTI, String(nome || '')) ? REGISTRO_PARTI[nome] : null;
  if (!voce) return [];
  if (voce.chiavi) return voce.chiavi.slice();
  const gruppo = gruppiDelloSchema(schema).find((g) => g && g.id === voce.gruppo);
  return gruppo && Array.isArray(gruppo.campi) ? gruppo.campi.map((c) => c.chiave).filter(Boolean) : [];
}

/**
 * Le parti da cui si modifica una chiave, anche profonda
 * («config.social.2.url» sta in `social`). Più di una quando il campo si
 * vede in più punti (`config.orari` -> ['nastro', 'eventi']). [] se nessuna.
 */
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

/* ---------------------------------------------- gruppi <-> sezioni */

/* Gruppo dello schema -> sezione della pagina (§5.4). I gruppi delle parti
   interne alla diretta puntano alla diretta; i tre gruppi che non stanno in
   nessun punto della pagina (meta, canale, aspetto) non ci sono: diventano
   viste del menu ☰, e le decide il guscio. */
const SEZIONE_DEL_GRUPPO = Object.freeze({
  marchio: 'binario',
  deck: 'regia',
  diretta: 'diretta',
  account: 'diretta',
  lurk: 'diretta',
  pollo: 'diretta',
  clip: 'diretta',
  settimana: 'settimana',
  chi: 'chi',
  supporto: 'supporto',
  saluti: 'saluti',
  piede: 'piede'
});

/* La sezione -> il gruppo che le appartiene per intero. I gruppi delle
   parti (account, lurk, pollo, clip) non ci sono: stanno nelle loro parti. */
const GRUPPO_DELLA_SEZIONE = Object.freeze({
  binario: 'marchio',
  regia: 'deck',
  diretta: 'diretta',
  settimana: 'settimana',
  chi: 'chi',
  supporto: 'supporto',
  saluti: 'saluti',
  piede: 'piede'
});

/** `chi` per il gruppo `chi`, `diretta` per `pollo`; '' per meta, canale, aspetto. */
export function sezioneDelGruppo(idGruppo) {
  const chiave = String(idGruppo || '');
  return haVoce(SEZIONE_DEL_GRUPPO, chiave) ? SEZIONE_DEL_GRUPPO[chiave] : '';
}

/** `deck` per `regia`; '' se la sezione non ha un gruppo suo. */
export function gruppoDellaSezione(idSezione) {
  const chiave = String(idSezione || '');
  return haVoce(GRUPPO_DELLA_SEZIONE, chiave) ? GRUPPO_DELLA_SEZIONE[chiave] : '';
}
