/* =====================================================================
   sito.js — AGENTE D · comportamenti della pagina

   Tutto ciò che non è il player e non è il pollo: voce di navigazione
   attiva, conto alla rovescia, nastro della settimana, copia dell'email.
   Zero dipendenze, nessun import, un solo IIFE.

   La mascotte non sta più qui. Era un'immagine dietro al telaio del
   monitor con dodici pixel di parallasse; adesso è un pulsante vivo
   accanto alla chat e ha un file suo, js/pollo.js, che si porta dietro
   anche quella parallasse. Da questo file è sparita la funzione
   mascotte(): cercarla qui non serve.

   Due regole valgono per l'intero file:

   1. Ogni blocco si disinnesca da solo se i suoi elementi non ci sono.
      La pagina deve reggere anche incompleta: senza JS si perdono conto
      alla rovescia, player e voce attiva, e nient'altro.
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
  const ORA_DIRETTA = orologio(ORARI.ora);

  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  // "21:00" -> { ora: 21, minuto: 0 }. Qualunque forma strana ricade sulle 21.
  function orologio(testo) {
    const parti = frase(testo, '21:00').split(':');
    const h = parseInt(parti[0], 10);
    const m = parseInt(parti[1], 10);
    return {
      ora: (h >= 0 && h <= 23) ? h : 21,
      minuto: (m >= 0 && m <= 59) ? m : 0
    };
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
  const FORMATO = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short'
  });

  const SETTIMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Componenti dell'orologio da parete di Roma per un dato istante.
  function partiFuso(data) {
    const parti = { giornoSettimana: 0 };
    FORMATO.formatToParts(data).forEach(function (p) {
      if (p.type === 'weekday') { parti.giornoSettimana = SETTIMANA[p.value] || 0; }
      else if (p.type !== 'literal') { parti[p.type] = parseInt(p.value, 10); }
    });
    return parti;   // { year, month, day, hour, minute, second, giornoSettimana }
  }

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

  // Prima diretta successiva all'istante dato: { ts, giorno } oppure null.
  function prossimaDiretta(adesso) {
    if (!GIORNI.length) { return null; }
    const p = partiFuso(adesso);
    const oggiUtc = Date.UTC(p.year, p.month - 1, p.day);

    for (let salto = 0; salto <= 8; salto++) {
      // Aritmetica sul calendario UTC, che non ha ora legale: sommare
      // 86.400.000 ms all'ora locale sbaglierebbe nei giorni da 23 o 25 ore.
      const g = new Date(oggiUtc + salto * 86400000);
      const giorno = g.getUTCDay();
      if (GIORNI.indexOf(giorno) === -1) { continue; }

      const ts = istanteFuso(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate(),
                             ORA_DIRETTA.ora, ORA_DIRETTA.minuto);
      if (ts > adesso.getTime()) { return { ts: ts, giorno: giorno }; }
    }
    return null;
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

  /* ===================================================================
     3. CONTO ALLA ROVESCIA + NASTRO DELLA SETTIMANA
     ===================================================================
     Stanno insieme perché guardano lo stesso calcolo: la prossima diretta
     serve al conto e serve a marcare .is-prossima sul nastro. Il tempo
     scorre in un solo timer da un secondo, e il DOM si tocca solo quando
     un valore cambia davvero.
     =================================================================== */
  function tempo() {
    const conto = document.getElementById('conto');
    const giorni = document.querySelectorAll('#nastro .nastro__giorno[data-giorno]');
    if (!conto && !giorni.length) { return; }

    const statoLive = frase(TESTI.statoLive, 'In onda adesso');
    let inOnda = false;
    let ultimoBersaglio = null;
    let ultimoOggi = null;

    function segnaNastro(oggi, prossimo) {
      if (!giorni.length || (oggi === ultimoOggi && prossimo === ultimoBersaglio)) { return; }
      giorni.forEach(function (li) {
        const indice = parseInt(li.getAttribute('data-giorno'), 10);
        li.classList.toggle('is-oggi', indice === oggi);
        li.classList.toggle('is-prossima', prossimo !== null && indice === prossimo);
      });
    }

    function battito() {
      const adesso = new Date();
      const prossima = prossimaDiretta(adesso);

      // Il nastro si aggiorna anche in diretta: «oggi» cambia a mezzanotte
      // di Roma, non a quella del visitatore.
      const oggi = partiFuso(adesso).giornoSettimana;
      segnaNastro(oggi, prossima ? prossima.giorno : null);
      ultimoOggi = oggi;
      ultimoBersaglio = prossima ? prossima.giorno : null;

      if (!conto) { return; }

      if (inOnda) {
        // In onda il conto non ha senso: al suo posto va lo stato, e
        // l'attributo datetime porta comunque un istante leggibile.
        if (conto.textContent !== statoLive) { conto.textContent = statoLive; }
        if (prossima) { conto.setAttribute('datetime', istanteIso(prossima.ts)); }
        return;
      }

      if (!prossima) {
        // Nessun giorno di diretta configurato: si lascia in pagina il
        // testo degli orari già scritto dalla generazione.
        return;
      }

      const restano = prossima.ts - adesso.getTime();
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
     4. COPIA DELL'EMAIL
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
     5. Avvio
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
