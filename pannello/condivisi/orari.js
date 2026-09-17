/* =====================================================================
   orari.js — le regole della schedule (CONTRATTO-5 §3).

   config.orari è il ramo che tiene insieme giorni e ora di serie, le sette
   schede dei giorni, gli eventi speciali e il fondale della sezione. Da qui
   escono i suoi limiti, la sua forma pulita, i suoi problemi detti in
   italiano e i conti con i fusi orari.

   UN file per due posti che devono dire la stessa cosa, come stili.js:
     - il server (require) lo usa per convalidare prima di salvare e per
       generare la sezione «La settimana» e il ramo `orari` di js/dati.js;
     - il pannello (import '../condivisi/orari.js', che riempie
       window.SBOrari) lo usa per i limiti dei controlli, i valori vuoti e
       gli errori accanto alle caselle.
   Se fossero due copie, prima o poi il pannello accetterebbe una nota che
   il server rifiuta al salvataggio: con un file solo non può succedere.

   Funzioni pure: niente DOM, niente fs, niente rete. L'unica cosa che viene
   da fuori è Intl, che c'è sia in Node sia nel browser e che conosce i
   cambi dell'ora legale di ogni fuso: nessuna tabella scritta a mano.

   Due funzioni con due mestieri diversi:
     - normalizza() non lancia mai e restituisce SEMPRE un ramo usabile:
       serve alla generazione e all'anteprima, che devono mostrare qualcosa
       anche mentre una casella è a metà;
     - problemi() dice che cosa non va, senza correggere niente: serve al
       salvataggio, dove un titolo troppo lungo va detto a chi l'ha scritto,
       non tagliato alle sue spalle.
   ===================================================================== */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.SBOrari = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* VOCABOLARIO                                                         */
  /* ------------------------------------------------------------------ */

  /* Congelate per lo stesso motivo di stili.js: le leggono il server e più
     moduli del pannello, e un `.sort()` fatto sul posto da uno di loro
     cambierebbe l'ordine dei giorni per tutti gli altri. */
  function congela(valore) {
    if (valore && typeof valore === 'object' && !Object.isFrozen(valore)) {
      Object.freeze(valore);
      Object.keys(valore).forEach(function (k) { congela(valore[k]); });
    }
    return valore;
  }

  const LIMITI = congela({
    titolo: 40,
    gioco: 40,
    nota: 120,
    notaEvento: 160,
    eventi: 8,
    veloMin: 30,
    veloMax: 90,
    velo: 60,
    intensitaMin: 0,
    intensitaMax: 100,
    intensita: 30,
    fuocoMin: 0,
    fuocoMax: 100,
    fuoco: 50,
    durataMin: 0.5,
    durataMax: 24,
    durataEventoMax: 72,
    // Le durate vanno a mezz'ora: un «2,37 ore» non lo scrive nessuno, e il
    // cursore del pannello deve poter arrivare a ogni valore ammesso.
    passoDurata: 0.5
  });

  /* I valori di serie quando il ramo stesso è rotto o assente. Sono quelli
     del canale: una schedule illeggibile nell'anteprima mostra le 21:00 di
     sempre invece di un nastro vuoto. */
  const PREDEFINITI = congela({ ora: '21:00', durataOre: 4, fuso: 'Europe/Rome' });

  // Indice 0 = domenica, come Date.getDay() e come config.orari.giorni.
  const GIORNI = congela([
    { n: 0, abbr: 'DOM', nome: 'Domenica', minuscolo: 'domenica' },
    { n: 1, abbr: 'LUN', nome: 'Lunedì', minuscolo: 'lunedì' },
    { n: 2, abbr: 'MAR', nome: 'Martedì', minuscolo: 'martedì' },
    { n: 3, abbr: 'MER', nome: 'Mercoledì', minuscolo: 'mercoledì' },
    { n: 4, abbr: 'GIO', nome: 'Giovedì', minuscolo: 'giovedì' },
    { n: 5, abbr: 'VEN', nome: 'Venerdì', minuscolo: 'venerdì' },
    { n: 6, abbr: 'SAB', nome: 'Sabato', minuscolo: 'sabato' }
  ]);

  // Ordine di lettura italiano: la settimana comincia di lunedì.
  const ORDINE = congela([1, 2, 3, 4, 5, 6, 0]);

  const MESI = congela([
    { nome: 'gennaio', abbr: 'gen' }, { nome: 'febbraio', abbr: 'feb' }, { nome: 'marzo', abbr: 'mar' },
    { nome: 'aprile', abbr: 'apr' }, { nome: 'maggio', abbr: 'mag' }, { nome: 'giugno', abbr: 'giu' },
    { nome: 'luglio', abbr: 'lug' }, { nome: 'agosto', abbr: 'ago' }, { nome: 'settembre', abbr: 'set' },
    { nome: 'ottobre', abbr: 'ott' }, { nome: 'novembre', abbr: 'nov' }, { nome: 'dicembre', abbr: 'dic' }
  ]);

  const RE_ORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  /* Solo file del sito. Il percorso finisce in un src e, attraverso il
     fuoco, in un attributo style: niente schemi (un «javascript:» o un
     «https://» altrui), niente spazi, niente virgolette o parentesi, niente
     risalite. Il `..` si esclude a parte perché i punti servono nei nomi. */
  const RE_PERCORSO = /^(img|contenuti\/media)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.(png|jpe?g|webp|avif|svg)$/;

  const MS_ORA = 3600000;
  const MS_GIORNO = 24 * MS_ORA;

  /* ------------------------------------------------------------------ */
  /* PICCOLI CONTROLLI                                                   */
  /* ------------------------------------------------------------------ */

  function oggetto(valore) {
    return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
  }

  function due(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* Un numero da un valore qualunque, o null. normalizza() accetta anche
     «4» scritto come testo (un modulo scritto a mano lo manda così);
     problemi() no, e lo dice. */
  function numeroLargo(valore) {
    if (typeof valore === 'number') { return Number.isFinite(valore) ? valore : null; }
    if (typeof valore === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(valore)) { return Number(valore); }
    return null;
  }

  function stringi(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function mezzaOra(n) {
    return Math.round(n * 2) === n * 2;
  }

  /** «4» -> 4, «0,5» -> 0.5 nel testo italiano dei messaggi. */
  function numeroTesto(n) {
    return String(n).replace('.', ',');
  }

  function leggiOra(ora) {
    if (typeof ora !== 'string') { return null; }
    const pulita = ora.trim();
    if (!RE_ORA.test(pulita)) { return null; }
    return { testo: pulita, ore: Number(pulita.slice(0, 2)), minuti: Number(pulita.slice(3, 5)) };
  }

  function bisestile(anno) {
    return (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
  }

  function giorniDelMese(anno, mese) {
    return [31, bisestile(anno) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mese - 1];
  }

  /** { anno, mese, giorno, testo } se la data ha la forma giusta ED esiste nel calendario. */
  function leggiData(data) {
    if (typeof data !== 'string') { return null; }
    const pulita = data.trim();
    const pezzi = RE_DATA.exec(pulita);
    if (!pezzi) { return null; }
    const anno = Number(pezzi[1]);
    const mese = Number(pezzi[2]);
    const giorno = Number(pezzi[3]);
    if (anno < 1 || mese < 1 || mese > 12 || giorno < 1 || giorno > giorniDelMese(anno, mese)) { return null; }
    return { testo: pulita, anno: anno, mese: mese, giorno: giorno };
  }

  /* Millisecondi di un orologio «come se fosse UTC». Date.UTC() non va bene:
     porta gli anni da 0 a 99 nel Novecento, e una data dell'anno 50 non deve
     diventare il 1950 in silenzio. */
  function utc(anno, mese, giorno, ore, minuti, secondi) {
    const d = new Date(0);
    d.setUTCFullYear(anno, mese - 1, giorno);
    d.setUTCHours(ore, minuti, secondi || 0, 0);
    return d.getTime();
  }

  /* I fusi buoni si preparano una volta sola: un Intl.DateTimeFormat costa, e
     il server chiede lo stesso fuso per ogni giorno e ogni evento. Quelli
     sbagliati invece non si ricordano: arrivano da una casella, e un server
     acceso per mesi non deve tenersi in memoria ogni refuso battuto. */
  const formattatori = new Map();

  function formattatore(fuso) {
    if (formattatori.has(fuso)) { return formattatori.get(fuso); }
    try {
      const f = new Intl.DateTimeFormat('en-US', {
        timeZone: fuso, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
      formattatori.set(fuso, f);
      return f;
    } catch (e) {
      return null;
    }
  }

  function fusoValido(fuso) {
    return typeof fuso === 'string' && fuso.trim() !== '' && formattatore(fuso.trim()) !== null;
  }

  /** L'orologio di `fuso` all'istante `ms`: { anno, mese, giorno, ore, minuti, secondi }. */
  function orologio(ms, fuso) {
    const parti = {};
    formattatore(fuso).formatToParts(new Date(ms)).forEach(function (p) { parti[p.type] = p.value; });
    return {
      anno: Number(parti.year),
      mese: Number(parti.month),
      giorno: Number(parti.day),
      // Qualche motore scrive ancora «24» per la mezzanotte anche con h23.
      ore: Number(parti.hour) % 24,
      minuti: Number(parti.minute),
      secondi: Number(parti.second)
    };
  }

  /** Quanto l'orologio di `fuso` è avanti su UTC all'istante `ms`, in millisecondi. */
  function scarto(ms, fuso) {
    const o = orologio(ms, fuso);
    return utc(o.anno, o.mese, o.giorno, o.ore, o.minuti, o.secondi) - Math.floor(ms / 1000) * 1000;
  }

  /* ------------------------------------------------------------------ */
  /* VALORI VUOTI                                                        */
  /* ------------------------------------------------------------------ */

  function fuocoVuoto() {
    return { x: LIMITI.fuoco, y: LIMITI.fuoco };
  }

  /** La scheda di un giorno senza niente di suo: ora e durata di serie, nessun testo, nessuna immagine. */
  function schedaVuota() {
    return { ora: '', durataOre: null, titolo: '', gioco: '', nota: '', immagine: '', fuoco: fuocoVuoto(), velo: LIMITI.velo };
  }

  /* Data, ora e durata restano vuote di proposito: sono obbligatorie, e un
     evento nuovo con una data inventata finirebbe sul sito prima che chi
     amministra l'abbia scelta. problemi() le chiede. */
  function eventoVuoto() {
    return { data: '', ora: '', durataOre: null, titolo: '', gioco: '', nota: '', immagine: '', fuoco: fuocoVuoto(), velo: LIMITI.velo };
  }

  function sfondoVuoto() {
    return { immagine: '', fuoco: fuocoVuoto(), intensita: LIMITI.intensita };
  }

  /* ------------------------------------------------------------------ */
  /* NORMALIZZAZIONE                                                     */
  /* ------------------------------------------------------------------ */

  /* Una riga di testo semplice. Gli a capo e i caratteri di controllo
     diventano spazi (finiscono in un attributo e in js/dati.js, dove non
     hanno un senso), gli spazi doppi si stringono, e il taglio non spezza a
     metà un carattere scritto con due unità UTF-16 come un'emoji. */
  function riga(valore, massimo) {
    if (typeof valore !== 'string') { return ''; }
    let testo = valore.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/ {2,}/g, ' ').trim();
    if (testo.length > massimo) {
      testo = testo.slice(0, massimo);
      if (/[\ud800-\udbff]$/.test(testo)) { testo = testo.slice(0, -1); }
      testo = testo.trim();
    }
    return testo;
  }

  function percorsoValido(percorso) {
    return typeof percorso === 'string' && percorso.indexOf('..') === -1 && RE_PERCORSO.test(percorso);
  }

  function immagine(valore) {
    const pulito = typeof valore === 'string' ? valore.trim() : '';
    return percorsoValido(pulito) ? pulito : '';
  }

  function intero(valore, min, max, ripiego) {
    const n = numeroLargo(valore);
    return n === null ? ripiego : stringi(Math.round(n), min, max);
  }

  function fuoco(valore) {
    const f = oggetto(valore) ? valore : {};
    return {
      x: intero(f.x, LIMITI.fuocoMin, LIMITI.fuocoMax, LIMITI.fuoco),
      y: intero(f.y, LIMITI.fuocoMin, LIMITI.fuocoMax, LIMITI.fuoco)
    };
  }

  /** Durata stretta al bordo e arrotondata alla mezz'ora, oppure `ripiego` se non è un numero. */
  function durata(valore, massimo, ripiego) {
    const n = numeroLargo(valore);
    if (n === null) { return ripiego; }
    return stringi(Math.round(n * 2) / 2, LIMITI.durataMin, massimo);
  }

  function ora(valore, ripiego) {
    const letta = leggiOra(valore);
    return letta ? letta.testo : ripiego;
  }

  function giorni(valore) {
    const fuori = [];
    (Array.isArray(valore) ? valore : []).forEach(function (g) {
      const n = numeroLargo(g);
      if (n !== null && Number.isInteger(n) && n >= 0 && n <= 6 && fuori.indexOf(n) === -1) { fuori.push(n); }
    });
    return fuori;
  }

  function normalizzaScheda(valore) {
    const s = oggetto(valore) ? valore : {};
    // Vuota o non numerica = «vale quella di serie», che è null.
    const vuota = s.durataOre === null || s.durataOre === undefined || s.durataOre === '';
    return {
      ora: ora(s.ora, ''),
      durataOre: vuota ? null : durata(s.durataOre, LIMITI.durataMax, null),
      titolo: riga(s.titolo, LIMITI.titolo),
      gioco: riga(s.gioco, LIMITI.gioco),
      nota: riga(s.nota, LIMITI.nota),
      immagine: immagine(s.immagine),
      fuoco: fuoco(s.fuoco),
      velo: intero(s.velo, LIMITI.veloMin, LIMITI.veloMax, LIMITI.velo)
    };
  }

  function normalizzaEvento(valore) {
    const e = oggetto(valore) ? valore : {};
    const data = leggiData(e.data);
    return {
      data: data ? data.testo : '',
      ora: ora(e.ora, ''),
      durataOre: durata(e.durataOre, LIMITI.durataEventoMax, null),
      titolo: riga(e.titolo, LIMITI.titolo),
      gioco: riga(e.gioco, LIMITI.gioco),
      nota: riga(e.nota, LIMITI.notaEvento),
      immagine: immagine(e.immagine),
      fuoco: fuoco(e.fuoco),
      velo: intero(e.velo, LIMITI.veloMin, LIMITI.veloMax, LIMITI.velo)
    };
  }

  /**
   * config.orari completo e pulito. Non lancia mai, qualunque cosa riceva.
   *
   * - sette schede sempre, una per giorno (0 = domenica): quelle che
   *   mancano nascono vuote, quelle oltre la settima si tolgono;
   * - eventi al massimo LIMITI.eventi, SEMPRE oggetti e nella stessa
   *   posizione: il pannello li ritrova per indice, e un evento scartato
   *   che facesse scalare gli altri aprirebbe quello sbagliato;
   * - numeri stretti al bordo, testi su una riga e tagliati, percorsi non
   *   ammessi svuotati. Un fuso inesistente torna a Europe/Rome.
   */
  function normalizza(orari) {
    const o = oggetto(orari) ? orari : {};
    const schede = Array.isArray(o.schede) ? o.schede : [];
    const eventi = Array.isArray(o.eventi) ? o.eventi.slice(0, LIMITI.eventi) : [];
    const sfondo = oggetto(o.sfondo) ? o.sfondo : null;
    return {
      giorni: giorni(o.giorni),
      ora: ora(o.ora, PREDEFINITI.ora),
      durataOre: durata(o.durataOre, LIMITI.durataMax, PREDEFINITI.durataOre),
      fuso: fusoValido(o.fuso) ? o.fuso.trim() : PREDEFINITI.fuso,
      schede: [0, 1, 2, 3, 4, 5, 6].map(function (n) { return normalizzaScheda(schede[n]); }),
      eventi: eventi.map(normalizzaEvento),
      sfondo: sfondo ? {
        immagine: immagine(sfondo.immagine),
        fuoco: fuoco(sfondo.fuoco),
        intensita: intero(sfondo.intensita, LIMITI.intensitaMin, LIMITI.intensitaMax, LIMITI.intensita)
      } : sfondoVuoto()
    };
  }

  /* ------------------------------------------------------------------ */
  /* PROBLEMI                                                            */
  /* ------------------------------------------------------------------ */

  const NOMI_TESTO = { titolo: 'Il titolo', gioco: 'Il gioco', nota: 'La nota' };

  const REGOLA_IMMAGINE = ' deve essere un file del sito, dentro img/ o contenuti/media/, in png, jpg, webp, avif o svg:'
    + ' niente indirizzi esterni, spazi o «..».';

  /* I controlli di un testo di una riga. `di` è il complemento già pronto
     («di lunedì», «dell'evento «Maratona»»). */
  function problemiTesto(valore, nome, massimo, di, percorso, aggiungi, obbligatorio) {
    const soggetto = NOMI_TESTO[nome] + ' ' + di;
    if (valore === undefined) {
      if (obbligatorio) { aggiungi(percorso, soggetto + ' non può restare vuoto.'); }
      return;
    }
    if (typeof valore !== 'string') { aggiungi(percorso, soggetto + ' deve essere un testo.'); return; }
    const pulito = valore.trim();
    if (!pulito && obbligatorio) { aggiungi(percorso, soggetto + ' non può restare vuoto.'); return; }
    if (/[\r\n\u2028\u2029]/.test(pulito)) { aggiungi(percorso, soggetto + ' deve stare su una riga sola.'); }
    if (pulito.length > massimo) {
      aggiungi(percorso, soggetto + ' supera i ' + massimo + ' caratteri: adesso sono ' + pulito.length + '.');
    }
  }

  function problemiImmagine(valore, soggetto, percorso, aggiungi) {
    if (valore === undefined) { return; }
    if (typeof valore === 'string' && (valore.trim() === '' || percorsoValido(valore.trim()))) { return; }
    aggiungi(percorso, soggetto + REGOLA_IMMAGINE);
  }

  function problemiFuoco(valore, di, percorso, aggiungi) {
    if (valore === undefined) { return; }
    const buono = function (n) { return Number.isInteger(n) && n >= LIMITI.fuocoMin && n <= LIMITI.fuocoMax; };
    if (!oggetto(valore) || !buono(valore.x) || !buono(valore.y)) {
      aggiungi(percorso, 'Il punto di fuoco ' + di + ' deve avere x e y interi da ' + LIMITI.fuocoMin + ' a ' + LIMITI.fuocoMax + '.');
    }
  }

  function problemiVelo(valore, di, percorso, aggiungi) {
    if (valore === undefined) { return; }
    if (!Number.isInteger(valore) || valore < LIMITI.veloMin || valore > LIMITI.veloMax) {
      aggiungi(percorso, 'Il velo ' + di + ' deve essere un numero intero da ' + LIMITI.veloMin + ' a ' + LIMITI.veloMax + '.');
    }
  }

  function durataBuona(valore, massimo) {
    return typeof valore === 'number' && Number.isFinite(valore) && valore >= LIMITI.durataMin && valore <= massimo && mezzaOra(valore);
  }

  function problemiScheda(scheda, n, aggiungi) {
    const giorno = GIORNI[n];
    const dove = 'schede.' + n;
    const di = 'di ' + giorno.minuscolo;
    if (!oggetto(scheda)) { aggiungi(dove, 'La scheda ' + di + ' non è compilata.'); return; }

    if (scheda.ora !== undefined && !(typeof scheda.ora === 'string' && (scheda.ora.trim() === '' || leggiOra(scheda.ora)))) {
      aggiungi(dove + '.ora', 'L\'ora ' + di + ' va scritta come 21:00.');
    }
    if (scheda.durataOre !== undefined && scheda.durataOre !== null && !durataBuona(scheda.durataOre, LIMITI.durataMax)) {
      aggiungi(dove + '.durataOre', 'La durata ' + di + ' va indicata in ore, da ' + numeroTesto(LIMITI.durataMin) + ' a '
        + LIMITI.durataMax + ', a passi di mezz\'ora; vuota vale quella di serie.');
    }
    problemiTesto(scheda.titolo, 'titolo', LIMITI.titolo, di, dove + '.titolo', aggiungi, false);
    problemiTesto(scheda.gioco, 'gioco', LIMITI.gioco, di, dove + '.gioco', aggiungi, false);
    problemiTesto(scheda.nota, 'nota', LIMITI.nota, di, dove + '.nota', aggiungi, false);
    problemiImmagine(scheda.immagine, 'L\'immagine ' + di, dove + '.immagine', aggiungi);
    problemiFuoco(scheda.fuoco, 'dell\'immagine ' + di, dove + '.fuoco', aggiungi);
    problemiVelo(scheda.velo, di, dove + '.velo', aggiungi);
  }

  /* Un evento si chiama col suo titolo quando ce l'ha, così nel riepilogo
     degli errori si riconosce senza contare. */
  function nomeEvento(evento, i) {
    const titolo = typeof evento.titolo === 'string' ? evento.titolo.trim() : '';
    if (titolo && titolo.length <= LIMITI.titolo && !/[\r\n\u2028\u2029]/.test(titolo)) {
      return 'dell\'evento «' + titolo + '»';
    }
    return 'dell\'evento numero ' + (i + 1);
  }

  function problemiEvento(evento, i, aggiungi) {
    const dove = 'eventi.' + i;
    if (!oggetto(evento)) { aggiungi(dove, 'L\'evento numero ' + (i + 1) + ' non è compilato.'); return; }
    const di = nomeEvento(evento, i);

    if (evento.data === undefined || (typeof evento.data === 'string' && evento.data.trim() === '')) {
      aggiungi(dove + '.data', 'Manca la data ' + di + '.');
    } else if (typeof evento.data !== 'string' || !RE_DATA.test(evento.data.trim())) {
      aggiungi(dove + '.data', 'La data ' + di + ' va scritta come 2026-09-27.');
    } else if (!leggiData(evento.data)) {
      aggiungi(dove + '.data', 'La data ' + di + ' non esiste nel calendario: ' + evento.data.trim() + '.');
    }

    if (evento.ora === undefined || (typeof evento.ora === 'string' && evento.ora.trim() === '')) {
      aggiungi(dove + '.ora', 'Manca l\'ora ' + di + '.');
    } else if (!leggiOra(evento.ora)) {
      aggiungi(dove + '.ora', 'L\'ora ' + di + ' va scritta come 21:00.');
    }

    if (!durataBuona(evento.durataOre, LIMITI.durataEventoMax)) {
      aggiungi(dove + '.durataOre', 'La durata ' + di + ' va indicata in ore, da ' + numeroTesto(LIMITI.durataMin) + ' a '
        + LIMITI.durataEventoMax + ', a passi di mezz\'ora.');
    }

    // Senza titolo il nome è sempre «numero N»: il titolo è proprio quello che manca.
    problemiTesto(evento.titolo, 'titolo', LIMITI.titolo, 'dell\'evento numero ' + (i + 1), dove + '.titolo', aggiungi, true);
    problemiTesto(evento.gioco, 'gioco', LIMITI.gioco, di, dove + '.gioco', aggiungi, false);
    problemiTesto(evento.nota, 'nota', LIMITI.notaEvento, di, dove + '.nota', aggiungi, false);
    problemiImmagine(evento.immagine, 'L\'immagine ' + di, dove + '.immagine', aggiungi);
    problemiFuoco(evento.fuoco, 'dell\'immagine ' + di, dove + '.fuoco', aggiungi);
    problemiVelo(evento.velo, di, dove + '.velo', aggiungi);
  }

  /**
   * Che cosa non va in config.orari, come [{ percorso, messaggio }]; [] se va
   * bene. Il percorso è relativo al ramo ('schede.1.ora', 'eventi.0.data',
   * 'sfondo.intensita', 'ora', 'giorni'); '' se è il ramo intero.
   *
   * Tollerante sulle assenze, severo sui valori: un contenuti.json di prima
   * della schedule nuova, senza schede, eventi e fondale, resta valido, e
   * una scheda senza velo vale col velo di serie. Un valore che c'è invece
   * deve essere giusto: 45 caratteri in un titolo si dicono, non si tagliano.
   * Un evento già finito non è un problema: resta nei dati e sparisce dal
   * sito da solo.
   */
  function problemi(orari) {
    const fuori = [];
    const aggiungi = function (percorso, messaggio) { fuori.push({ percorso: percorso, messaggio: messaggio }); };

    if (!oggetto(orari)) {
      aggiungi('', 'La schedule deve essere un gruppo di valori con giorni, ora, durata e fuso.');
      return fuori;
    }

    // --- giorni, ora, durata e fuso: le regole di sempre
    if (!Array.isArray(orari.giorni) || orari.giorni.length === 0) {
      aggiungi('giorni', 'Serve almeno un giorno di diretta.');
    } else {
      const visti = [];
      orari.giorni.forEach(function (g) {
        if (!Number.isInteger(g) || g < 0 || g > 6) {
          aggiungi('giorni', 'I giorni vanno indicati con un numero da 0 (domenica) a 6 (sabato): «' + String(g) + '» non va bene.');
          return;
        }
        if (visti.indexOf(g) !== -1) { aggiungi('giorni', 'Il giorno ' + GIORNI[g].minuscolo + ' è ripetuto due volte.'); }
        visti.push(g);
      });
    }
    if (!leggiOra(orari.ora)) {
      aggiungi('ora', 'L\'ora di serie delle dirette va scritta come 21:00.');
    }
    if (!durataBuona(orari.durataOre, LIMITI.durataMax)) {
      aggiungi('durataOre', 'La durata di serie delle dirette va indicata in ore, da ' + numeroTesto(LIMITI.durataMin) + ' a '
        + LIMITI.durataMax + ', a passi di mezz\'ora.');
    }
    if (typeof orari.fuso !== 'string' || !orari.fuso.trim()) {
      aggiungi('fuso', 'Manca il fuso orario, per esempio Europe/Rome.');
    } else if (!fusoValido(orari.fuso)) {
      // Un fuso inesistente farebbe esplodere il conto alla rovescia nel
      // browser di chi guarda: meglio scoprirlo qui.
      aggiungi('fuso', 'Il fuso orario «' + orari.fuso.trim() + '» non esiste: usa un nome come Europe/Rome.');
    }

    // --- schede dei giorni
    if (orari.schede !== undefined) {
      if (!Array.isArray(orari.schede)) {
        aggiungi('schede', 'Le schede dei giorni devono essere un elenco, una per giorno.');
      } else {
        if (orari.schede.length !== 7) {
          aggiungi('schede', 'Le schede dei giorni devono essere sette, una per giorno: adesso sono ' + orari.schede.length + '.');
        }
        for (let n = 0; n < Math.min(7, orari.schede.length); n++) { problemiScheda(orari.schede[n], n, aggiungi); }
      }
    }

    // --- eventi speciali
    if (orari.eventi !== undefined) {
      if (!Array.isArray(orari.eventi)) {
        aggiungi('eventi', 'Gli eventi speciali devono essere un elenco.');
      } else {
        if (orari.eventi.length > LIMITI.eventi) {
          aggiungi('eventi', 'Gli eventi speciali sono al massimo ' + LIMITI.eventi + ': adesso sono ' + orari.eventi.length + '.');
        }
        orari.eventi.forEach(function (evento, i) { problemiEvento(evento, i, aggiungi); });
      }
    }

    // --- fondale della sezione
    if (orari.sfondo !== undefined) {
      if (!oggetto(orari.sfondo)) {
        aggiungi('sfondo', 'Il fondale della sezione deve essere un gruppo di valori con immagine, fuoco e intensità.');
      } else {
        const s = orari.sfondo;
        problemiImmagine(s.immagine, 'L\'immagine del fondale', 'sfondo.immagine', aggiungi);
        problemiFuoco(s.fuoco, 'del fondale', 'sfondo.fuoco', aggiungi);
        if (s.intensita !== undefined && (!Number.isInteger(s.intensita) || s.intensita < LIMITI.intensitaMin || s.intensita > LIMITI.intensitaMax)) {
          aggiungi('sfondo.intensita', 'L\'intensità del fondale deve essere un numero intero da ' + LIMITI.intensitaMin + ' a ' + LIMITI.intensitaMax + '.');
        }
      }
    }

    return fuori;
  }

  /* ------------------------------------------------------------------ */
  /* ORE EFFETTIVE                                                       */
  /* ------------------------------------------------------------------ */

  function schedaDi(orari, giorno) {
    const n = numeroLargo(giorno);
    if (!oggetto(orari) || !Array.isArray(orari.schede) || n === null || !Number.isInteger(n) || n < 0 || n > 6) { return {}; }
    return oggetto(orari.schede[n]) ? orari.schede[n] : {};
  }

  /** L'ora di inizio di quel giorno (0 = domenica): quella della scheda, o quella di serie. */
  function oraDi(orari, giorno) {
    const propria = ora(schedaDi(orari, giorno).ora, '');
    if (propria) { return propria; }
    return ora(oggetto(orari) ? orari.ora : undefined, PREDEFINITI.ora);
  }

  /** La durata in ore di quel giorno: quella della scheda, o quella di serie. Stesse regole di normalizza(). */
  function durataDi(orari, giorno) {
    const scheda = schedaDi(orari, giorno);
    const vuota = scheda.durataOre === null || scheda.durataOre === undefined || scheda.durataOre === '';
    const propria = vuota ? null : durata(scheda.durataOre, LIMITI.durataMax, null);
    if (propria !== null) { return propria; }
    return durata(oggetto(orari) ? orari.durataOre : undefined, LIMITI.durataMax, PREDEFINITI.durataOre);
  }

  /**
   * L'ora a cui finisce una diretta che parte a `ora` e dura `durataOre`,
   * sull'orologio: '21:00', 4 -> '01:00'. È il conto di chi legge il nastro,
   * senza data: la notte del cambio dell'ora sbaglia di un'ora come
   * sbaglierebbe chiunque a mente. Per gli eventi, che una data ce l'hanno,
   * c'è oraNelFuso(termine). '' se i valori non si leggono.
   */
  function fine(inizio, durataOre) {
    const o = leggiOra(inizio);
    const d = numeroLargo(durataOre);
    if (!o || d === null || d < 0) { return ''; }
    const minuti = ((o.ore * 60 + o.minuti + Math.round(d * 60)) % 1440 + 1440) % 1440;
    return due(Math.floor(minuti / 60)) + ':' + due(minuti % 60);
  }

  /* ------------------------------------------------------------------ */
  /* FUSI ORARI                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * L'istante (ms UTC) in cui l'orologio di `fuso` segna `data` alle `ora`.
   * NaN se data, ora o fuso non si leggono; senza fuso vale Europe/Rome.
   *
   * I due casi del cambio d'ora si risolvono come fanno i calendari (e il
   * «compatible» di Temporal):
   *   - l'ora che non esiste (29 marzo 2026, 02:30 a Roma: alle 02:00 si
   *     salta alle 03:00) scivola avanti dell'ora saltata, alle 03:30;
   *   - l'ora che esiste due volte (25 ottobre 2026, 02:30 a Roma) è la
   *     prima delle due, quella ancora in ora legale.
   * Il metodo: si prova l'orologio con lo scarto di un giorno prima e con
   * quello di un giorno dopo, e si tengono i tentativi che, riletti nel
   * fuso, danno davvero quell'orologio.
   */
  function istante(data, oraInizio, fuso) {
    const d = leggiData(data);
    const o = leggiOra(oraInizio);
    const vuoto = fuso === undefined || fuso === null || fuso === '';
    if (!d || !o || (!vuoto && !fusoValido(fuso))) { return NaN; }
    const zona = vuoto ? PREDEFINITI.fuso : fuso.trim();

    const locale = utc(d.anno, d.mese, d.giorno, o.ore, o.minuti, 0);
    const prima = locale - scarto(locale - MS_GIORNO, zona);
    const dopo = locale - scarto(locale + MS_GIORNO, zona);
    const buoni = [prima, dopo].filter(function (t) { return t + scarto(t, zona) === locale; });
    if (buoni.length) { return Math.min.apply(null, buoni); }
    // Nessun tentativo torna: è l'ora saltata. Lo scarto di prima del salto
    // porta avanti proprio dell'ora mancante.
    return prima;
  }

  /** 'HH:MM' sull'orologio di `fuso` all'istante `ms`; '' se non si legge. */
  function oraNelFuso(ms, fuso) {
    const zona = fuso === undefined || fuso === null || fuso === '' ? PREDEFINITI.fuso : fuso;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || !fusoValido(zona)) { return ''; }
    const o = orologio(ms, zona.trim());
    return due(o.ore) + ':' + due(o.minuti);
  }

  /** Il giorno della settimana di una data 'AAAA-MM-GG' (0 = domenica), -1 se la data non esiste. */
  function giornoDellaSettimana(data) {
    const d = leggiData(data);
    return d ? new Date(utc(d.anno, d.mese, d.giorno, 12, 0, 0)).getUTCDay() : -1;
  }

  /**
   * Gli eventi non ancora finiti a `adessoMs`, dal primo che parte:
   * [{ indice, inizio, termine, ...evento }] con inizio e termine in ms UTC
   * e l'evento già normalizzato. `indice` è la posizione in orari.eventi.
   * Un evento senza data, ora o durata leggibili non ha un quando, e resta
   * fuori; uno in corso invece c'è ancora.
   */
  function eventiFuturi(orari, adessoMs) {
    const adesso = typeof adessoMs === 'number' && Number.isFinite(adessoMs) ? adessoMs : Date.now();
    const pulito = normalizza(orari);
    const fuori = [];
    pulito.eventi.forEach(function (evento, indice) {
      if (!evento.data || !evento.ora || evento.durataOre === null) { return; }
      const inizio = istante(evento.data, evento.ora, pulito.fuso);
      if (!Number.isFinite(inizio)) { return; }
      const termine = inizio + Math.round(evento.durataOre * MS_ORA);
      if (termine <= adesso) { return; }
      const voce = { indice: indice, inizio: inizio, termine: termine };
      Object.keys(evento).forEach(function (k) { voce[k] = evento[k]; });
      fuori.push(voce);
    });
    fuori.sort(function (a, b) { return a.inizio - b.inizio || a.indice - b.indice; });
    return fuori;
  }

  return {
    LIMITI: LIMITI,
    PREDEFINITI: PREDEFINITI,
    GIORNI: GIORNI,
    ORDINE: ORDINE,
    MESI: MESI,
    RE_ORA: RE_ORA,
    RE_DATA: RE_DATA,
    RE_PERCORSO: RE_PERCORSO,

    schedaVuota: schedaVuota,
    eventoVuoto: eventoVuoto,
    sfondoVuoto: sfondoVuoto,
    normalizza: normalizza,
    problemi: problemi,
    percorsoValido: percorsoValido,
    fusoValido: fusoValido,
    dataValida: function (data) { return leggiData(data) !== null; },
    oraDi: oraDi,
    durataDi: durataDi,
    fine: fine,
    istante: istante,
    oraNelFuso: oraNelFuso,
    giornoDellaSettimana: giornoDellaSettimana,
    eventiFuturi: eventiFuturi
  };
});
