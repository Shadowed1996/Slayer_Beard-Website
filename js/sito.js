/* =====================================================================
   sito.js — AGENTE D · comportamenti della pagina

   Tutto ciò che non è il player e non è il pollo: voce di navigazione
   attiva, conto alla rovescia, schedule della settimana (nastro ed eventi
   speciali), copia dell'email. Zero dipendenze, nessun import, un solo
   IIFE.

   La mascotte non sta più qui. Era un'immagine dietro al telaio del
   monitor con dodici pixel di parallasse; adesso è un pulsante vivo
   accanto alla chat e ha un file suo, js/pollo.js, che si porta dietro
   anche quella parallasse. Da questo file è sparita la funzione
   mascotte(): cercarla qui non serve.

   Due regole valgono per l'intero file:

   1. Ogni blocco si disinnesca da solo se i suoi elementi non ci sono.
      La pagina deve reggere anche incompleta: senza JS si perdono conto
      alla rovescia, player e voce attiva, e sul nastro le date, i segni
      e l'ora di chi guarda. Orari, titoli e immagini sono già nell'HTML.
   2. Lo stato «in onda» NON si legge dal DOM: lo dice window.Player con
      suStato(). Il player è l'unico che lo conosce davvero.
   ===================================================================== */
(function () {
  'use strict';

  const DATI = window.DATI || {};
  const TESTI = DATI.testi || {};
  const ORARI = DATI.orari || {};

  const FUSO = frase(ORARI.fuso, 'Europe/Rome');
  const GIORNI = Array.isArray(ORARI.giorni) && ORARI.giorni.length
    ? ORARI.giorni.filter(function (g) { return typeof g === 'number' && g >= 0 && g <= 6; })
    : [];
  const ORA_DIRETTA = orologio(ORARI.ora, { ora: 21, minuto: 0 });
  // Quattro ore è la durata dei dati reali del canale (CONTRATTO §11): vale
  // solo se dati.js non ne porta una, cioè mai con una generazione recente.
  const DURATA_SERIE = durata(ORARI.durataOre, 4);
  const EVENTI = eventiDi(ORARI.eventi);

  const ORA_MS = 3600000;
  /* Durata finta di un evento senza durata: ORE_APERTO (24 * 365) di
     pannello/condivisi/orari.js. Da lì in su l'evento non ha una fine vera. */
  const APERTO_MS = 24 * 365 * ORA_MS;
  const GIORNO_MS = 86400000;
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  // Le etichette dei segni. I ripieghi sono i valori di partenza dello
  // schema (CONTRATTO-5 §4): servono solo con un dati.js più vecchio.
  const ETICHETTE = {
    onda: frase(TESTI.etichettaInOnda, 'In onda'),
    oggi: frase(TESTI.etichettaOggi, 'Oggi'),
    prossima: frase(TESTI.etichettaProssima, 'Prossima'),
    evento: frase(TESTI.etichettaEvento, 'Speciale')
  };
  const DA_TE = frase(TESTI.etichettaDaTe, 'Da te');

  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  // "21:00" -> { ora: 21, minuto: 0 }. Qualunque forma strana ricade sul
  // ripiego: per un giorno è l'ora di serie, per l'ora di serie le 21.
  function orologio(testo, ripiego) {
    const parti = frase(testo, '').split(':');
    const h = parseInt(parti[0], 10);
    const m = parseInt(parti[1], 10);
    if (parti.length !== 2 || !(h >= 0 && h <= 23) || !(m >= 0 && m <= 59)) { return ripiego; }
    return { ora: h, minuto: m };
  }

  function durata(valore, ripiego) {
    const n = Number(valore);
    return (isFinite(n) && n > 0) ? n : ripiego;
  }

  // Ora e durata EFFETTIVE di un giorno acceso: dati.js le porta già
  // risolte (ore, durate); un giorno che non c'è vale quelle di serie.
  function oraDi(giorno) {
    return orologio(ORARI.ore && ORARI.ore[String(giorno)], ORA_DIRETTA);
  }

  function durataDi(giorno) {
    return durata(ORARI.durate && ORARI.durate[String(giorno)], DURATA_SERIE);
  }

  // Gli eventi speciali come istanti: quelli illeggibili si scartano invece
  // di fermare il conto alla rovescia. `indice` è la posizione in
  // config.orari.eventi, la stessa di li.evento[data-evento]; `data` è il
  // giorno di calendario del canale, già calcolato dalla generazione.
  function eventiDi(elenco) {
    return (Array.isArray(elenco) ? elenco : [])
      .map(function (e) {
        return {
          indice: e && typeof e.indice === 'number' ? e.indice : null,
          data: e && typeof e.data === 'string' ? e.data : '',
          // Il titolo serve al giorno che l'evento si prende: la riga
          // .nastro__sostituito dice chi comanda quella sera.
          titolo: e && typeof e.titolo === 'string' ? e.titolo : '',
          inizio: Date.parse(e && e.inizio),
          termine: Date.parse(e && e.termine)
        };
      })
      .filter(function (e) { return isFinite(e.inizio) && isFinite(e.termine) && e.termine > e.inizio; })
      .sort(function (a, b) { return a.inizio - b.inizio; });
  }

  function due(n) { return n < 10 ? '0' + n : String(n); }

  /* ===================================================================
     ETICHETTE DEI BOTTONI
     ===================================================================
     #chat-toggle e #copia-email contengono un <svg> più il testo. Usare
     textContent sul bottone cancellerebbe l'icona, quindi il testo va
     isolato in un nodo suo, una volta sola, e da lì in poi si aggiorna
     quello. Se il bottone non ha testo (solo icona) se ne crea uno vuoto
     in fondo. =========================================================== */
  function etichetta(bottone, classe) {
    if (!bottone) { return null; }

    const gia = bottone.querySelector('.' + classe);
    if (gia) { return gia; }

    const span = document.createElement('span');
    span.className = classe;

    for (let i = 0; i < bottone.childNodes.length; i++) {
      const n = bottone.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        span.textContent = n.nodeValue.trim();
        bottone.replaceChild(span, n);
        return span;
      }
    }

    bottone.appendChild(span);
    return span;
  }

  /* ===================================================================
     1. BINARIO — voce attiva della sezione visibile
     ===================================================================
     IntersectionObserver e non un handler su `scroll`: il browser calcola
     le intersezioni per conto suo, fuori dal thread principale, e non si
     paga un ricalcolo a ogni pixel di scorrimento.

     Si tengono tutte le percentuali viste in una mappa e si accende la
     sezione con la percentuale più alta: con soglie multiple, il singolo
     evento non basta a sapere «quale delle cinque sta vincendo».
     =================================================================== */
  function binario() {
    const voci = document.querySelectorAll('.binario__voce[href^="#"]');
    if (!voci.length || typeof IntersectionObserver !== 'function') { return; }

    const mappa = new Map();     // sezione -> voce
    const quote = new Map();     // sezione -> quota visibile
    let attiva = null;

    voci.forEach(function (voce) {
      const id = voce.getAttribute('href').slice(1);
      const sezione = id && document.getElementById(id);
      if (sezione) {
        mappa.set(sezione, voce);
        quote.set(sezione, 0);
      }
    });
    if (!mappa.size) { return; }

    function accendi(sezione) {
      if (sezione === attiva) { return; }
      attiva = sezione;
      mappa.forEach(function (voce, sez) {
        const questa = sez === sezione;
        voce.classList.toggle('is-attiva', questa);
        if (questa) { voce.setAttribute('aria-current', 'true'); }
        else { voce.removeAttribute('aria-current'); }
      });
    }

    const osservatore = new IntersectionObserver(function (voci2) {
      voci2.forEach(function (v) { quote.set(v.target, v.intersectionRatio); });

      let migliore = null;
      let massimo = 0;
      quote.forEach(function (quota, sez) {
        if (quota > massimo) { massimo = quota; migliore = sez; }
      });
      // Sotto il 5% non si cambia niente: fra una sezione e l'altra la
      // voce attiva non deve lampeggiare.
      if (migliore && massimo > 0.05) { accendi(migliore); }
    }, {
      threshold: [0, 0.12, 0.25, 0.5, 0.75, 1],
      // Il dock mobile copre il fondo della finestra: si toglie dal
      // calcolo, altrimenti la sezione sotto conta più di quanto si veda.
      rootMargin: '-10% 0px -20% 0px'
    });

    mappa.forEach(function (voce, sezione) { osservatore.observe(sezione); });
  }

  /* ===================================================================
     2. FUSO ORARIO — il punto tecnicamente delicato del file
     ===================================================================
     Gli orari delle dirette sono espressi nell'ora di Roma. Due cose
     rendono sbagliata qualunque scorciatoia:

       · il visitatore può stare in un altro fuso (o avere l'orologio del
         sistema impostato altrove), quindi l'ora locale del browser non
         c'entra niente con l'orario della diretta;
       · Roma cambia offset due volte l'anno — CET +01:00 d'inverno,
         CEST +02:00 d'estate. Un «+2» fisso sbaglia di un'ora per circa
         cinque mesi su dodici, e sbaglia proprio nel periodo in cui il
         conto alla rovescia si guarda di più.

     La soluzione non richiede tabelle di ora legale: le ha già il
     browser dentro Intl. Si formatta un istante nel fuso richiesto, lo si
     rilegge come se fosse UTC, e la differenza fra i due numeri è
     l'offset REALE di quell'istante — ora legale inclusa, senza sapere
     nulla delle date di cambio.
     =================================================================== */

  // hourCycle 'h23' e non hour12:false: con hour12 alcuni motori usano il
  // ciclo h24 e restituiscono «24» a mezzanotte, che poi sfalsa i conti.
  const CAMPI = {
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short'
  };
  const FORMATO = new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: FUSO }, CAMPI));
  // Lo stesso senza fuso: è l'orologio di chi guarda, per «Da te 15:00».
  const FORMATO_LOCALE = new Intl.DateTimeFormat('en-GB', CAMPI);

  const SETTIMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Componenti dell'orologio da parete per un dato istante.
  function parti(formato, data) {
    const esito = { giornoSettimana: 0 };
    formato.formatToParts(data).forEach(function (p) {
      if (p.type === 'weekday') { esito.giornoSettimana = SETTIMANA[p.value] || 0; }
      else if (p.type !== 'literal') { esito[p.type] = parseInt(p.value, 10); }
    });
    return esito;   // { year, month, day, hour, minute, second, giornoSettimana }
  }

  function partiFuso(data) { return parti(FORMATO, data); }

  // Offset del fuso in millisecondi per quell'istante (positivo a est).
  function scartoFuso(data) {
    const p = partiFuso(data);
    const lettoComeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return lettoComeUtc - data.getTime();
  }

  // Da orologio da parete di Roma a istante assoluto.
  // Due passate: la prima stima l'offset sull'istante sbagliato (quello
  // nominale, letto come se fosse UTC), la seconda lo ricalcola su quello
  // corretto. Serve nelle due notti del cambio d'ora, dove l'offset di
  // prima e quello di dopo sono diversi.
  function istanteFuso(anno, mese, giorno, ora, minuto) {
    const nominale = Date.UTC(anno, mese - 1, giorno, ora, minuto, 0);
    let ts = nominale - scartoFuso(new Date(nominale));
    ts = nominale - scartoFuso(new Date(ts));
    return ts;
  }

  // "2g 04:31:07" · sotto il giorno si lascia cadere il "0g".
  function conta(ms) {
    const tot = Math.max(0, Math.floor(ms / 1000));
    const g = Math.floor(tot / 86400);
    const h = Math.floor((tot % 86400) / 3600);
    const m = Math.floor((tot % 3600) / 60);
    const s = tot % 60;
    const orologio2 = due(h) + ':' + due(m) + ':' + due(s);
    return g > 0 ? g + 'g ' + orologio2 : orologio2;
  }

  // Durata ISO 8601 per l'attributo datetime: è la forma leggibile dalla
  // macchina di ciò che c'è scritto dentro il <time>, cioè una durata.
  function durataIso(ms) {
    const tot = Math.max(0, Math.floor(ms / 1000));
    const g = Math.floor(tot / 86400);
    const h = Math.floor((tot % 86400) / 3600);
    const m = Math.floor((tot % 3600) / 60);
    const s = tot % 60;
    return 'P' + (g ? g + 'D' : '') + 'T' + h + 'H' + m + 'M' + s + 'S';
  }

  // Istante in forma ISO con l'offset vero di Roma (…+02:00 o …+01:00).
  function istanteIso(ts) {
    const p = partiFuso(new Date(ts));
    const scarto = scartoFuso(new Date(ts));
    const segno = scarto < 0 ? '-' : '+';
    const minuti = Math.abs(Math.round(scarto / 60000));
    return p.year + '-' + due(p.month) + '-' + due(p.day) + 'T' +
           due(p.hour) + ':' + due(p.minute) + ':' + due(p.second) +
           segno + due(Math.floor(minuti / 60)) + ':' + due(minuti % 60);
  }

  function chiaveData(anno, mese, giorno) {
    return anno + '-' + due(mese) + '-' + due(giorno);
  }

  /* ===================================================================
     3. LA SETTIMANA IN UN ISTANTE
     ===================================================================
     Tutto quello che conto alla rovescia, nastro ed eventi devono sapere
     esce da un calcolo solo, fatto su un istante: così i tre non possono
     contraddirsi (il nastro che segna «prossima» un giorno e il conto che
     conta verso un altro).

     Le dirette regolari si guardano come FINESTRE, inizio e fine, da ieri a
     fra sette giorni. Ieri serve per la diretta cominciata prima di
     mezzanotte e non ancora finita: alle 00:30 di martedì la diretta del
     lunedì sera è ancora in corso, e la sua data è ancora quella di lunedì.
     Il calendario si scorre in UTC, che non ha ora legale: sommare
     86.400.000 ms all'ora locale sbaglierebbe nei giorni da 23 o 25 ore.
     =================================================================== */
  function calcola(adesso) {
    const p = partiFuso(new Date(adesso));
    const oggiUtc = Date.UTC(p.year, p.month - 1, p.day);

    const finestre = [];
    for (let salto = -1; salto <= 7; salto++) {
      const d = new Date(oggiUtc + salto * GIORNO_MS);
      const giorno = d.getUTCDay();
      if (GIORNI.indexOf(giorno) === -1) { continue; }
      const o = oraDi(giorno);
      const inizio = istanteFuso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), o.ora, o.minuto);
      finestre.push({
        giorno: giorno,
        data: chiaveData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
        testo: d.getUTCDate() + ' ' + MESI[d.getUTCMonth()],
        inizio: inizio,
        termine: inizio + durataDi(giorno) * ORA_MS
      });
    }

    const vivi = EVENTI.filter(function (e) { return e.termine > adesso; });
    let prossimoEvento = null;
    // L'evento ACCESO adesso (inizio passato, fine non ancora arrivata). Gli
    // eventi sono in ordine di inizio: il primo che risponde è quello
    // cominciato prima, cioè quello che si sta guardando.
    let attivo = null;
    vivi.forEach(function (e) {
      if (!prossimoEvento && e.inizio > adesso) { prossimoEvento = e; }
      if (!attivo && e.inizio <= adesso) { attivo = e; }
    });

    // Finché un evento speciale è acceso è LUI il programma: la diretta
    // regolare che gli finisce sotto non conta più — non è la «prossima»,
    // non è quella «in onda» e il conto alla rovescia non ci punta. Torna a
    // valere da sé appena l'evento finisce.
    // Un evento senza durata non si prende niente: il suo data-fine è il
    // termine finto di un anno (ORE_APERTO di pannello/condivisi/orari.js) e
    // coprirebbe tutte le serate. Stessa regola di programmaSostituito().
    const prende = !!attivo && attivo.termine - attivo.inizio < APERTO_MS;
    finestre.forEach(function (f) {
      f.sostituita = prende && f.inizio < attivo.termine && f.termine > attivo.inizio;
    });

    // Le finestre escono già in ordine di inizio: i giorni sono in ordine e
    // un'ora del giorno dopo viene sempre dopo, qualunque sia la durata.
    let prossimaRegolare = null;
    let inCorso = null;
    finestre.forEach(function (f) {
      if (f.sostituita) { return; }
      if (!prossimaRegolare && f.inizio > adesso) { prossimaRegolare = f; }
      if (f.inizio <= adesso && adesso < f.termine) { inCorso = f; }
    });

    // La partenza più vicina fra giorni ed eventi. A pari istante vince
    // l'evento: se cade sull'ora di una diretta regolare, è quella serata
    // a essere speciale.
    let prossima = null;
    if (prossimaRegolare) { prossima = { ts: prossimaRegolare.inizio, giorno: prossimaRegolare.giorno, evento: null }; }
    if (prossimoEvento && (!prossima || prossimoEvento.inizio <= prossima.ts)) {
      prossima = { ts: prossimoEvento.inizio, giorno: null, evento: prossimoEvento };
    }

    // La prossima occorrenza di ogni giorno. Un giorno acceso è la sua
    // prima finestra non ancora finita (oggi conta finché la diretta di oggi
    // non è finita); un giorno di riposo è la prossima data con quel nome,
    // oggi compreso. Qui le finestre sostituite ci sono ancora, con il loro
    // `sostituita`: la data del giorno resta quella vera, e il nastro la
    // mostra sbarrata invece di saltare alla settimana dopo.
    const occorrenze = [];
    for (let g = 0; g < 7; g++) {
      if (GIORNI.indexOf(g) !== -1) {
        let trovata = null;
        finestre.forEach(function (f) { if (!trovata && f.giorno === g && f.termine > adesso) { trovata = f; } });
        occorrenze[g] = trovata;
      } else {
        const d = new Date(oggiUtc + ((g - p.giornoSettimana + 7) % 7) * GIORNO_MS);
        occorrenze[g] = {
          giorno: g,
          data: chiaveData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
          testo: d.getUTCDate() + ' ' + MESI[d.getUTCMonth()],
          inizio: null
        };
      }
    }

    // La data di ogni evento non finito, nel fuso del canale: quella della
    // generazione se c'è, altrimenti si ricava dall'istante.
    const dateEventi = vivi.map(function (e) {
      if (/^d{4}-d{2}-d{2}$/.test(e.data)) { return e.data; }
      const q = partiFuso(new Date(e.inizio));
      return chiaveData(q.year, q.month, q.day);
    });

    return {
      adesso: adesso,
      oggi: p.giornoSettimana,
      prossima: prossima,
      inCorso: inCorso,
      // L'evento acceso adesso, se c'è: finché resta acceso nessun giorno
      // del nastro può dirsi «in onda» al posto suo.
      evento: attivo,
      occorrenze: occorrenze,
      dateEventi: dateEventi
    };
  }

  // L'ora di chi guarda, se è diversa da quella del canale: «15:00», oppure
  // «mar 04:00» quando da lui è già un altro giorno. '' se coincide.
  function oraLocale(ts) {
    const qui = parti(FORMATO_LOCALE, new Date(ts));
    const la = partiFuso(new Date(ts));
    if (qui.hour === la.hour && qui.minute === la.minute) { return ''; }
    const ora = due(qui.hour) + ':' + due(qui.minute);
    return qui.day === la.day ? ora : GIORNI_BREVI[qui.giornoSettimana] + ' ' + ora;
  }

  /* ===================================================================
     4. SCRITTURA NEL DOM — solo quando un valore cambia
     ===================================================================
     Il battito è ogni secondo, ma date, segni e ora locale cambiano poche
     volte al giorno: ogni scrittura confronta prima con quello che c'è già,
     così il browser non ricalcola l'impaginazione di sette locandine a ogni
     tic. =============================================================== */
  function metti(elemento, classe, acceso) {
    if (elemento.classList.contains(classe) !== acceso) { elemento.classList.toggle(classe, acceso); }
  }

  function scrivi(nodo, testo) {
    if (nodo && nodo.textContent !== testo) { nodo.textContent = testo; }
  }

  // Le etichette dei segni. La memoria tiene la firma dell'ultima scrittura:
  // uguale, non si tocca niente. Quelle scritte qui hanno js-segno, così
  // l'etichetta fissa «Speciale» degli eventi, che viene dal modello, resta.
  function segni(contenitore, memoria, tipi) {
    if (!contenitore) { return; }
    const firma = tipi.join('|');
    if (memoria.firma === firma) { return; }
    memoria.firma = firma;
    contenitore.querySelectorAll('.js-segno').forEach(function (n) { n.remove(); });
    tipi.forEach(function (tipo) {
      const segno = document.createElement('span');
      segno.className = 'segno segno--' + tipo + ' js-segno';
      if (tipo === 'onda') {
        const spia = document.createElement('span');
        spia.className = 'spia is-live';
        spia.setAttribute('aria-hidden', 'true');
        segno.appendChild(spia);
      }
      segno.appendChild(document.createTextNode(ETICHETTE[tipo]));
      contenitore.appendChild(segno);
    });
  }

  // «Da te 15:00» subito dopo la riga dell'orario; il paragrafo nasce la
  // prima volta che serve e poi si nasconde e si riaccende.
  function scriviLocale(dopo, classe, memoria, ts) {
    if (!dopo) { return; }
    const ora = ts === null ? '' : oraLocale(ts);
    if (memoria.locale === ora) { return; }
    memoria.locale = ora;
    if (!ora) {
      if (memoria.nodoLocale) { memoria.nodoLocale.hidden = true; }
      return;
    }
    if (!memoria.nodoLocale) {
      memoria.nodoLocale = document.createElement('p');
      memoria.nodoLocale.className = classe;
      dopo.insertAdjacentElement('afterend', memoria.nodoLocale);
    }
    memoria.nodoLocale.hidden = false;
    memoria.nodoLocale.textContent = DA_TE + ' ' + ora;
  }

  // Il titolo dell'evento speciale che si è preso questo giorno, sotto
  // l'orario. La generazione la scrive già quando l'evento era acceso
  // (modelli/parziali/settimana.html): qui si aggiorna, si toglie appena
  // l'evento finisce — e la serata di sempre torna a valere senza
  // ripubblicare niente — e si crea per un evento che comincia mentre la
  // pagina è aperta.
  function scriviSostituito(memoria, titolo) {
    if (memoria.sostituito === titolo) { return; }
    memoria.sostituito = titolo;
    if (!memoria.nodoSostituito) { memoria.nodoSostituito = memoria.li.querySelector('.nastro__sostituito'); }
    if (!titolo) {
      if (memoria.nodoSostituito) { memoria.nodoSostituito.hidden = true; }
      return;
    }
    if (!memoria.nodoSostituito) {
      const p = document.createElement('p');
      p.className = 'nastro__sostituito';
      if (memoria.quando) { memoria.quando.insertAdjacentElement('afterend', p); }
      else { memoria.li.appendChild(p); }
      memoria.nodoSostituito = p;
    }
    memoria.nodoSostituito.hidden = false;
    memoria.nodoSostituito.textContent = titolo;
  }

  /* ===================================================================
     5. CONTO ALLA ROVESCIA + NASTRO + EVENTI
     ===================================================================
     Un solo timer da un secondo per tutti e tre.

     Nastro: is-oggi sul giorno di oggi nel fuso del canale; is-prossima sul
     giorno della prossima partenza se è una diretta regolare (se è un
     evento va sul suo li.evento); is-in-onda quando il player dice acceso,
     sul giorno della finestra in corso — la diretta di lunedì che sfora
     dopo mezzanotte resta di lunedì — e, fuori da ogni finestra, su oggi.
     Un giorno la cui prossima occorrenza cade nella data di un evento
     prende ha-evento.

     Evento acceso: ha la precedenza su tutto. Finché dura, la diretta
     regolare che gli finisce sotto prende is-sostituito (orario sbarrato e
     titolo dell'evento al posto del programma), nessun giorno è «prossima»
     né «in onda» — in onda c'è l'evento, sul suo li.evento — e il conto
     alla rovescia salta quella serata. Quando finisce torna tutto com'era:
     la pagina si ripara da sé, senza una nuova pubblicazione.

     Eventi: quello finito si toglie, e se non ne resta nessuno si nasconde
     tutto il blocco.
     =================================================================== */
  function tempo() {
    const conto = document.getElementById('conto');
    const giorni = Array.prototype.map.call(
      document.querySelectorAll('#nastro .nastro__giorno[data-giorno]'),
      function (li) {
        return {
          li: li,
          giorno: parseInt(li.getAttribute('data-giorno'), 10),
          data: li.querySelector('.nastro__data'),
          segni: li.querySelector('.nastro__segni'),
          quando: li.querySelector('.nastro__quando')
        };
      }
    );
    const bloccoEventi = document.querySelector('.eventi[data-sb-parte="eventi"]');
    const eventi = Array.prototype.map.call(
      document.querySelectorAll('.eventi li.evento[data-inizio][data-fine]'),
      function (li) {
        return {
          li: li,
          indice: parseInt(li.getAttribute('data-evento'), 10),
          inizio: Date.parse(li.getAttribute('data-inizio')),
          termine: Date.parse(li.getAttribute('data-fine')),
          segni: li.querySelector('.evento__segni'),
          quando: li.querySelector('.evento__quando'),
          tolto: false
        };
      }
    );
    if (!conto && !giorni.length && !eventi.length) { return; }

    const statoLive = frase(TESTI.statoLive, 'In onda adesso');
    let inOnda = false;

    function nastro(stato) {
      giorni.forEach(function (v) {
        const g = v.giorno;
        const occorrenza = stato.occorrenze[g] || null;
        const oggi = g === stato.oggi;
        // La serata di questo giorno che un evento acceso si è presa: non è
        // «prossima» (prossimaRegolare la salta già), non è «in onda» — in
        // onda c'è l'evento — e si legge sbarrata, con il titolo dell'evento.
        const sostituita = !!(occorrenza && occorrenza.sostituita);
        const prossima = !!stato.prossima && stato.prossima.evento === null && stato.prossima.giorno === g;
        const inOndaQui = inOnda && !stato.evento && (stato.inCorso ? stato.inCorso.giorno === g : oggi);
        const haEvento = sostituita || (!!occorrenza && stato.dateEventi.indexOf(occorrenza.data) !== -1);

        metti(v.li, 'is-oggi', oggi);
        metti(v.li, 'is-prossima', prossima);
        metti(v.li, 'is-in-onda', inOndaQui);
        metti(v.li, 'ha-evento', haEvento);
        metti(v.li, 'is-sostituito', sostituita);
        scrivi(v.data, occorrenza ? occorrenza.testo : '');

        const tipi = [];
        if (inOndaQui) { tipi.push('onda'); }
        if (oggi) { tipi.push('oggi'); }
        if (prossima) { tipi.push('prossima'); }
        if (haEvento) { tipi.push('evento'); }
        segni(v.segni, v, tipi);

        scriviSostituito(v, sostituita && stato.evento ? stato.evento.titolo : '');
        scriviLocale(v.quando, 'nastro__locale', v, occorrenza && occorrenza.inizio !== null ? occorrenza.inizio : null);
      });
    }

    function speciali(stato) {
      let restano = 0;
      eventi.forEach(function (v) {
        if (v.tolto) { return; }
        // Un data-fine illeggibile non fa sparire l'evento: meglio uno
        // speciale di troppo che uno cancellato per un errore.
        if (isFinite(v.termine) && v.termine <= stato.adesso) {
          v.li.remove();
          v.tolto = true;
          return;
        }
        restano++;
        const evento = stato.prossima && stato.prossima.evento;
        // Si riconosce dall'indice; con un dati.js che non lo porta, dall'istante.
        const prossima = !!evento && (evento.indice !== null ? evento.indice === v.indice : evento.inizio === v.inizio);
        const inOndaQui = inOnda && v.inizio <= stato.adesso && stato.adesso < v.termine;
        metti(v.li, 'is-prossima', prossima);
        metti(v.li, 'is-in-onda', inOndaQui);
        const tipi = [];
        if (inOndaQui) { tipi.push('onda'); }
        if (prossima) { tipi.push('prossima'); }
        segni(v.segni, v, tipi);
        scriviLocale(v.quando, 'evento__locale', v, isFinite(v.inizio) ? v.inizio : null);
      });
      if (bloccoEventi && eventi.length && bloccoEventi.hidden !== (restano === 0)) {
        bloccoEventi.hidden = restano === 0;
      }
    }

    function battito() {
      const adesso = Date.now();
      const stato = calcola(adesso);

      // Il nastro si aggiorna anche in diretta: «oggi» cambia a mezzanotte
      // di Roma, non a quella del visitatore.
      if (giorni.length) { nastro(stato); }
      if (eventi.length) { speciali(stato); }

      if (!conto) { return; }

      if (inOnda) {
        // In onda il conto non ha senso: al suo posto va lo stato, e
        // l'attributo datetime porta comunque un istante leggibile.
        if (conto.textContent !== statoLive) { conto.textContent = statoLive; }
        if (stato.prossima) {
          const iso = istanteIso(stato.prossima.ts);
          if (conto.getAttribute('datetime') !== iso) { conto.setAttribute('datetime', iso); }
        }
        return;
      }

      if (!stato.prossima) {
        // Nessun giorno di diretta e nessun evento in arrivo: si lascia in
        // pagina il testo degli orari già scritto dalla generazione.
        return;
      }

      const restano = stato.prossima.ts - adesso;
      const testo = conta(restano);
      if (conto.textContent !== testo) { conto.textContent = testo; }
      conto.setAttribute('datetime', durataIso(restano));
    }

    battito();
    const timer = setInterval(battito, 1000);

    // Le schede in secondo piano rallentano i timer: al ritorno il conto
    // sarebbe indietro di minuti. Si ridisegna appena torna visibile.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { battito(); }
    });
    window.addEventListener('pagehide', function () { clearInterval(timer); }, { once: true });

    // Il player è l'unico a sapere se il canale è acceso: ci si iscrive,
    // non si guarda il DOM. Se player.js non c'è, il conto va lo stesso.
    if (window.Player && typeof window.Player.suStato === 'function') {
      window.Player.suStato(function (stato) {
        inOnda = !!(stato && stato.inOnda);
        battito();
      });
    }
  }

  /* ===================================================================
     6. COPIA DELL'EMAIL
     ===================================================================
     navigator.clipboard esiste solo in contesto sicuro (https o
     localhost): aprendo il file con doppio clic non c'è, e serve il
     vecchio execCommand. Il bottone porta già aria-live="polite" dal
     markup, quindi cambiare la sua etichetta viene annunciato da solo.
     =================================================================== */
  function copiaEmail() {
    const bottone = document.getElementById('copia-email');
    if (!bottone) { return; }

    const campo = document.getElementById('email');
    const indirizzo = frase(DATI.email, campo ? campo.textContent.trim() : '');
    if (!indirizzo) { return; }

    const testo = etichetta(bottone, 'js-etichetta');
    const riposo = frase(TESTI.copiaBtn, testo.textContent) || 'Copia l’email';
    const fatto = frase(TESTI.copiaFatto, 'Copiata');
    let ritorno = null;

    function segnala(messaggio) {
      testo.textContent = messaggio;
      bottone.classList.toggle('is-fatto', messaggio === fatto);
      clearTimeout(ritorno);
      ritorno = setTimeout(function () {
        testo.textContent = riposo;
        bottone.classList.remove('is-fatto');
      }, 2000);
    }

    function storico() {
      try {
        const ta = document.createElement('textarea');
        ta.value = indirizzo;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const riuscito = document.execCommand('copy');
        document.body.removeChild(ta);
        segnala(riuscito ? fatto : indirizzo);
      } catch (err) {
        // Ultimo ripiego: l'indirizzo resta in chiaro nel bottone, così
        // si può almeno selezionare a mano.
        segnala(indirizzo);
      }
    }

    bottone.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(indirizzo).then(function () { segnala(fatto); }, storico);
      } else {
        storico();
      }
    });
  }

  /* ===================================================================
     7. Avvio
     ===================================================================
     Ogni blocco è isolato: se uno lancia, gli altri devono partire lo
     stesso. Un errore in un dettaglio decorativo non può portarsi via il
     conto alla rovescia.
     =================================================================== */
  function avvia() {
    [binario, tempo, copiaEmail].forEach(function (blocco) {
      try {
        blocco();
      } catch (err) {
        console.warn('[sito] blocco non avviato:', err);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
