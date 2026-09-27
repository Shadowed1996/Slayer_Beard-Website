(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.SBOrari = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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
    passoDurata: 0.5,
    pause: 12,
    motivoPausa: 60
  });

  const PREDEFINITI = congela({ ora: '21:00', durataOre: 4, fuso: 'Europe/Rome' });

  const GIORNI = congela([
    { n: 0, abbr: 'DOM', nome: 'Domenica', minuscolo: 'domenica' },
    { n: 1, abbr: 'LUN', nome: 'Lunedì', minuscolo: 'lunedì' },
    { n: 2, abbr: 'MAR', nome: 'Martedì', minuscolo: 'martedì' },
    { n: 3, abbr: 'MER', nome: 'Mercoledì', minuscolo: 'mercoledì' },
    { n: 4, abbr: 'GIO', nome: 'Giovedì', minuscolo: 'giovedì' },
    { n: 5, abbr: 'VEN', nome: 'Venerdì', minuscolo: 'venerdì' },
    { n: 6, abbr: 'SAB', nome: 'Sabato', minuscolo: 'sabato' }
  ]);

  const ORDINE = congela([1, 2, 3, 4, 5, 6, 0]);

  const MESI = congela([
    { nome: 'gennaio', abbr: 'gen' }, { nome: 'febbraio', abbr: 'feb' }, { nome: 'marzo', abbr: 'mar' },
    { nome: 'aprile', abbr: 'apr' }, { nome: 'maggio', abbr: 'mag' }, { nome: 'giugno', abbr: 'giu' },
    { nome: 'luglio', abbr: 'lug' }, { nome: 'agosto', abbr: 'ago' }, { nome: 'settembre', abbr: 'set' },
    { nome: 'ottobre', abbr: 'ott' }, { nome: 'novembre', abbr: 'nov' }, { nome: 'dicembre', abbr: 'dic' }
  ]);

  const RE_ORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  const RE_PERCORSO = /^(img|contenuti\/media)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.(png|jpe?g|webp|avif|svg)$/;

  const MS_ORA = 3600000;
  const MS_GIORNO = 24 * MS_ORA;

  function oggetto(valore) {
    return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
  }

  function due(n) {
    return (n < 10 ? '0' : '') + n;
  }

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

  function utc(anno, mese, giorno, ore, minuti, secondi) {
    const d = new Date(0);
    d.setUTCFullYear(anno, mese - 1, giorno);
    d.setUTCHours(ore, minuti, secondi || 0, 0);
    return d.getTime();
  }

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

  function orologio(ms, fuso) {
    const parti = {};
    formattatore(fuso).formatToParts(new Date(ms)).forEach(function (p) { parti[p.type] = p.value; });
    return {
      anno: Number(parti.year),
      mese: Number(parti.month),
      giorno: Number(parti.day),
      ore: Number(parti.hour) % 24,
      minuti: Number(parti.minute),
      secondi: Number(parti.second)
    };
  }

  function scarto(ms, fuso) {
    const o = orologio(ms, fuso);
    return utc(o.anno, o.mese, o.giorno, o.ore, o.minuti, o.secondi) - Math.floor(ms / 1000) * 1000;
  }

  function fuocoVuoto() {
    return { x: LIMITI.fuoco, y: LIMITI.fuoco };
  }

  function schedaVuota() {
    return { ora: '', durataOre: null, titolo: '', gioco: '', nota: '', immagine: '', fuoco: fuocoVuoto(), velo: LIMITI.velo };
  }

  function eventoVuoto() {
    return { data: '', ora: '', durataOre: null, titolo: '', gioco: '', nota: '', immagine: '', fuoco: fuocoVuoto(), velo: LIMITI.velo, ultimoGiorno: '' };
  }

  function sfondoVuoto() {
    return { immagine: '', fuoco: fuocoVuoto(), intensita: LIMITI.intensita };
  }

  function pausaVuota() {
    return { data: '', motivo: '' };
  }

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
    const ultimo = leggiData(e.ultimoGiorno);
    return {
      data: data ? data.testo : '',
      ora: ora(e.ora, ''),
      durataOre: durata(e.durataOre, LIMITI.durataEventoMax, null),
      titolo: riga(e.titolo, LIMITI.titolo),
      gioco: riga(e.gioco, LIMITI.gioco),
      nota: riga(e.nota, LIMITI.notaEvento),
      immagine: immagine(e.immagine),
      fuoco: fuoco(e.fuoco),
      velo: intero(e.velo, LIMITI.veloMin, LIMITI.veloMax, LIMITI.velo),
      ultimoGiorno: ultimo ? ultimo.testo : ''
    };
  }

  function normalizzaPausa(valore) {
    const p = oggetto(valore) ? valore : {};
    const data = leggiData(p.data);
    return {
      data: data ? data.testo : '',
      motivo: riga(p.motivo, LIMITI.motivoPausa)
    };
  }

  function normalizza(orari) {
    const o = oggetto(orari) ? orari : {};
    const schede = Array.isArray(o.schede) ? o.schede : [];
    const eventi = Array.isArray(o.eventi) ? o.eventi.slice(0, LIMITI.eventi) : [];
    const pause = Array.isArray(o.pause) ? o.pause.slice(0, LIMITI.pause) : [];
    const sfondo = oggetto(o.sfondo) ? o.sfondo : null;
    return {
      giorni: giorni(o.giorni),
      ora: ora(o.ora, PREDEFINITI.ora),
      durataOre: durata(o.durataOre, LIMITI.durataMax, PREDEFINITI.durataOre),
      fuso: fusoValido(o.fuso) ? o.fuso.trim() : PREDEFINITI.fuso,
      schede: [0, 1, 2, 3, 4, 5, 6].map(function (n) { return normalizzaScheda(schede[n]); }),
      eventi: eventi.map(normalizzaEvento),
      pause: pause.map(normalizzaPausa),
      sfondo: sfondo ? {
        immagine: immagine(sfondo.immagine),
        fuoco: fuoco(sfondo.fuoco),
        intensita: intero(sfondo.intensita, LIMITI.intensitaMin, LIMITI.intensitaMax, LIMITI.intensita)
      } : sfondoVuoto()
    };
  }

  const NOMI_TESTO = { titolo: 'Il titolo', gioco: 'Il gioco', nota: 'La nota' };

  const REGOLA_IMMAGINE = ' deve essere un file del sito, dentro img/ o contenuti/media/, in png, jpg, webp, avif o svg:'
    + ' niente indirizzi esterni, spazi o «..».';

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

    if (evento.durataOre !== undefined && evento.durataOre !== null && evento.durataOre !== '' &&
      !durataBuona(evento.durataOre, LIMITI.durataEventoMax)) {
      aggiungi(dove + '.durataOre', 'La durata ' + di + ' va indicata in ore, da ' + numeroTesto(LIMITI.durataMin) + ' a '
        + LIMITI.durataEventoMax + ', a passi di mezz\'ora — oppure lasciata vuota per un evento senza una fine nota.');
    }

    problemiTesto(evento.titolo, 'titolo', LIMITI.titolo, 'dell\'evento numero ' + (i + 1), dove + '.titolo', aggiungi, true);
    problemiTesto(evento.gioco, 'gioco', LIMITI.gioco, di, dove + '.gioco', aggiungi, false);
    problemiTesto(evento.nota, 'nota', LIMITI.notaEvento, di, dove + '.nota', aggiungi, false);
    problemiImmagine(evento.immagine, 'L\'immagine ' + di, dove + '.immagine', aggiungi);
    problemiFuoco(evento.fuoco, 'dell\'immagine ' + di, dove + '.fuoco', aggiungi);
    problemiVelo(evento.velo, di, dove + '.velo', aggiungi);

    if (evento.ultimoGiorno !== undefined && evento.ultimoGiorno !== null && evento.ultimoGiorno !== '') {
      if (typeof evento.ultimoGiorno !== 'string' || !RE_DATA.test(evento.ultimoGiorno.trim())) {
        aggiungi(dove + '.ultimoGiorno', 'La data limite ' + di + ' va scritta come 2026-10-10, oppure lasciata vuota.');
      } else if (!leggiData(evento.ultimoGiorno)) {
        aggiungi(dove + '.ultimoGiorno', 'La data limite ' + di + ' non esiste nel calendario: ' + evento.ultimoGiorno.trim() + '.');
      }
    }
  }

  function nomePausa(pausa, i) {
    const data = typeof pausa.data === 'string' ? pausa.data.trim() : '';
    return leggiData(data) ? 'del ' + data : 'numero ' + (i + 1);
  }

  function problemiPausa(pausa, i, aggiungi) {
    const dove = 'pause.' + i;
    if (!oggetto(pausa)) { aggiungi(dove, 'Il giorno saltato numero ' + (i + 1) + ' non è compilato.'); return; }
    const di = nomePausa(pausa, i);

    if (pausa.data === undefined || (typeof pausa.data === 'string' && pausa.data.trim() === '')) {
      aggiungi(dove + '.data', 'Manca la data del giorno saltato ' + di + '.');
    } else if (typeof pausa.data !== 'string' || !RE_DATA.test(pausa.data.trim())) {
      aggiungi(dove + '.data', 'La data del giorno saltato ' + di + ' va scritta come 2026-10-02.');
    } else if (!leggiData(pausa.data)) {
      aggiungi(dove + '.data', 'La data del giorno saltato ' + di + ' non esiste nel calendario: ' + pausa.data.trim() + '.');
    }

    if (pausa.motivo !== undefined && typeof pausa.motivo === 'string' && pausa.motivo.length > LIMITI.motivoPausa) {
      aggiungi(dove + '.motivo', 'Il motivo del giorno saltato ' + di + ' supera i ' + LIMITI.motivoPausa + ' caratteri: adesso sono ' + pausa.motivo.length + '.');
    } else if (pausa.motivo !== undefined && typeof pausa.motivo !== 'string') {
      aggiungi(dove + '.motivo', 'Il motivo del giorno saltato ' + di + ' deve essere un testo.');
    }
  }

  function problemi(orari) {
    const fuori = [];
    const aggiungi = function (percorso, messaggio) { fuori.push({ percorso: percorso, messaggio: messaggio }); };

    if (!oggetto(orari)) {
      aggiungi('', 'La schedule deve essere un gruppo di valori con giorni, ora, durata e fuso.');
      return fuori;
    }

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
      aggiungi('fuso', 'Il fuso orario «' + orari.fuso.trim() + '» non esiste: usa un nome come Europe/Rome.');
    }

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

    if (orari.pause !== undefined) {
      if (!Array.isArray(orari.pause)) {
        aggiungi('pause', 'I giorni saltati devono essere un elenco.');
      } else {
        if (orari.pause.length > LIMITI.pause) {
          aggiungi('pause', 'I giorni saltati sono al massimo ' + LIMITI.pause + ': adesso sono ' + orari.pause.length + '.');
        }
        orari.pause.forEach(function (pausa, i) { problemiPausa(pausa, i, aggiungi); });
      }
    }

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

  function schedaDi(orari, giorno) {
    const n = numeroLargo(giorno);
    if (!oggetto(orari) || !Array.isArray(orari.schede) || n === null || !Number.isInteger(n) || n < 0 || n > 6) { return {}; }
    return oggetto(orari.schede[n]) ? orari.schede[n] : {};
  }

  function oraDi(orari, giorno) {
    const propria = ora(schedaDi(orari, giorno).ora, '');
    if (propria) { return propria; }
    return ora(oggetto(orari) ? orari.ora : undefined, PREDEFINITI.ora);
  }

  function durataDi(orari, giorno) {
    const scheda = schedaDi(orari, giorno);
    const vuota = scheda.durataOre === null || scheda.durataOre === undefined || scheda.durataOre === '';
    const propria = vuota ? null : durata(scheda.durataOre, LIMITI.durataMax, null);
    if (propria !== null) { return propria; }
    return durata(oggetto(orari) ? orari.durataOre : undefined, LIMITI.durataMax, PREDEFINITI.durataOre);
  }

  function fine(inizio, durataOre) {
    const o = leggiOra(inizio);
    const d = numeroLargo(durataOre);
    if (!o || d === null || d < 0) { return ''; }
    const minuti = ((o.ore * 60 + o.minuti + Math.round(d * 60)) % 1440 + 1440) % 1440;
    return due(Math.floor(minuti / 60)) + ':' + due(minuti % 60);
  }

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
    return prima;
  }

  function oraNelFuso(ms, fuso) {
    const zona = fuso === undefined || fuso === null || fuso === '' ? PREDEFINITI.fuso : fuso;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || !fusoValido(zona)) { return ''; }
    const o = orologio(ms, zona.trim());
    return due(o.ore) + ':' + due(o.minuti);
  }

  function dataNelFuso(ms, fuso) {
    const zona = fuso === undefined || fuso === null || fuso === '' ? PREDEFINITI.fuso : fuso;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || !fusoValido(zona)) { return ''; }
    const o = orologio(ms, zona.trim());
    const anno = String(o.anno);
    return (anno.length >= 4 ? anno : ('0000' + anno).slice(-4)) + '-' + due(o.mese) + '-' + due(o.giorno);
  }

  function giornoDellaSettimana(data) {
    const d = leggiData(data);
    return d ? new Date(utc(d.anno, d.mese, d.giorno, 12, 0, 0)).getUTCDay() : -1;
  }

  const ORE_APERTO = 24 * 365;

  function eventiFuturi(orari, adessoMs) {
    const adesso = typeof adessoMs === 'number' && Number.isFinite(adessoMs) ? adessoMs : Date.now();
    const pulito = normalizza(orari);
    const fuori = [];
    pulito.eventi.forEach(function (evento, indice) {
      if (!evento.data || !evento.ora) { return; }
      const inizio = istante(evento.data, evento.ora, pulito.fuso);
      if (!Number.isFinite(inizio)) { return; }
      const oreValide = evento.durataOre === null ? ORE_APERTO : evento.durataOre;
      const termine = inizio + Math.round(oreValide * MS_ORA);
      if (termine <= adesso) { return; }
      const voce = { indice: indice, inizio: inizio, termine: termine };
      Object.keys(evento).forEach(function (k) { voce[k] = evento[k]; });
      fuori.push(voce);
    });
    fuori.sort(function (a, b) { return a.inizio - b.inizio || a.indice - b.indice; });
    return fuori;
  }

  function eventoAttivo(orari, adessoMs) {
    const adesso = typeof adessoMs === 'number' && Number.isFinite(adessoMs) ? adessoMs : Date.now();
    const accesi = eventiFuturi(orari, adesso).filter(function (e) { return e.inizio <= adesso; });
    return accesi.length ? accesi[0] : null;
  }

  function programmaSostituito(orari, adessoMs) {
    const pulito = normalizza(orari);
    const giorni = [false, false, false, false, false, false, false];
    const adesso = typeof adessoMs === 'number' && Number.isFinite(adessoMs) ? adessoMs : Date.now();
    const evento = eventiFuturi(pulito, adesso).map(function (e) {
      const mezzanotte = istante(e.data, '00:00', pulito.fuso);
      e.accesoDa = Number.isFinite(mezzanotte) ? Math.min(mezzanotte, e.inizio) : e.inizio;
      return e;
    }).filter(function (e) { return e.accesoDa <= adesso; })[0] || null;
    if (!evento) { return { evento: null, giorni: giorni }; }

    for (let salto = -1; salto <= 7; salto++) {
      const ms = evento.inizio + salto * MS_GIORNO;
      if (salto > 0 && ms >= evento.termine + MS_GIORNO) { break; }
      const data = dataNelFuso(ms, pulito.fuso);
      const g = giornoDellaSettimana(data);
      if (g === -1 || pulito.giorni.indexOf(g) === -1 || giorni[g]) { continue; }
      const inizio = istante(data, oraDi(pulito, g), pulito.fuso);
      if (!Number.isFinite(inizio)) { continue; }
      const termine = inizio + Math.round(durataDi(pulito, g) * MS_ORA);
      if (inizio < evento.termine && termine > evento.accesoDa) { giorni[g] = true; }
    }

    return { evento: evento, giorni: giorni };
  }

  function pausaDi(orari, data) {
    const d = leggiData(data);
    if (!d) { return null; }
    const pulito = normalizza(orari);
    return pulito.pause.filter(function (p) { return p.data === d.testo; })[0] || null;
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
    pausaVuota: pausaVuota,
    sfondoVuoto: sfondoVuoto,
    normalizza: normalizza,
    problemi: problemi,
    pausaDi: pausaDi,
    percorsoValido: percorsoValido,
    fusoValido: fusoValido,
    dataValida: function (data) { return leggiData(data) !== null; },
    oraDi: oraDi,
    durataDi: durataDi,
    fine: fine,
    istante: istante,
    oraNelFuso: oraNelFuso,
    dataNelFuso: dataNelFuso,
    giornoDellaSettimana: giornoDellaSettimana,
    eventiFuturi: eventiFuturi,
    eventoAttivo: eventoAttivo,
    programmaSostituito: programmaSostituito
  };
});
