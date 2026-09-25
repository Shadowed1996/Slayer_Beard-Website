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

  const DURATA_SERIE = durata(ORARI.durataOre, 4);
  const EVENTI = eventiDi(ORARI.eventi);

  const ORA_MS = 3600000;
  const GIORNO_MS = 86400000;
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

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

  function oraDi(giorno) {
    return orologio(ORARI.ore && ORARI.ore[String(giorno)], ORA_DIRETTA);
  }

  function durataDi(giorno) {
    return durata(ORARI.durate && ORARI.durate[String(giorno)], DURATA_SERIE);
  }

  function eventiDi(elenco) {
    return (Array.isArray(elenco) ? elenco : [])
      .map(function (e) {
        return {
          indice: e && typeof e.indice === 'number' ? e.indice : null,
          data: e && typeof e.data === 'string' ? e.data : '',

          titolo: e && typeof e.titolo === 'string' ? e.titolo : '',
          inizio: Date.parse(e && e.inizio),
          termine: Date.parse(e && e.termine)
        };
      })
      .filter(function (e) { return isFinite(e.inizio) && isFinite(e.termine) && e.termine > e.inizio; })
      .sort(function (a, b) { return a.inizio - b.inizio; });
  }

  function due(n) { return n < 10 ? '0' + n : String(n); }

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

  function binario() {
    const voci = document.querySelectorAll('.binario__voce[href^="#"]');
    if (!voci.length || typeof IntersectionObserver !== 'function') { return; }

    const mappa = new Map();
    const quote = new Map();
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

      if (migliore && massimo > 0.05) { accendi(migliore); }
    }, {
      threshold: [0, 0.12, 0.25, 0.5, 0.75, 1],

      rootMargin: '-10% 0px -20% 0px'
    });

    mappa.forEach(function (voce, sezione) { osservatore.observe(sezione); });
  }

  const CAMPI = {
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short'
  };
  const FORMATO = new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: FUSO }, CAMPI));

  const FORMATO_LOCALE = new Intl.DateTimeFormat('en-GB', CAMPI);

  const SETTIMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function parti(formato, data) {
    const esito = { giornoSettimana: 0 };
    formato.formatToParts(data).forEach(function (p) {
      if (p.type === 'weekday') { esito.giornoSettimana = SETTIMANA[p.value] || 0; }
      else if (p.type !== 'literal') { esito[p.type] = parseInt(p.value, 10); }
    });
    return esito;
  }

  function partiFuso(data) { return parti(FORMATO, data); }

  function scartoFuso(data) {
    const p = partiFuso(data);
    const lettoComeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return lettoComeUtc - data.getTime();
  }

  function istanteFuso(anno, mese, giorno, ora, minuto) {
    const nominale = Date.UTC(anno, mese - 1, giorno, ora, minuto, 0);
    let ts = nominale - scartoFuso(new Date(nominale));
    ts = nominale - scartoFuso(new Date(ts));
    return ts;
  }

  function conta(ms) {
    const tot = Math.max(0, Math.floor(ms / 1000));
    const g = Math.floor(tot / 86400);
    const h = Math.floor((tot % 86400) / 3600);
    const m = Math.floor((tot % 3600) / 60);
    const s = tot % 60;
    const orologio2 = due(h) + ':' + due(m) + ':' + due(s);
    return g > 0 ? g + 'g ' + orologio2 : orologio2;
  }

  function durataIso(ms) {
    const tot = Math.max(0, Math.floor(ms / 1000));
    const g = Math.floor(tot / 86400);
    const h = Math.floor((tot % 86400) / 3600);
    const m = Math.floor((tot % 3600) / 60);
    const s = tot % 60;
    return 'P' + (g ? g + 'D' : '') + 'T' + h + 'H' + m + 'M' + s + 'S';
  }

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

    let attivo = null;

    let attivoDa = 0;
    vivi.forEach(function (e) {
      if (!prossimoEvento && e.inizio > adesso) { prossimoEvento = e; }
      const p = partiFuso(new Date(e.inizio));
      const da = Math.min(e.inizio, istanteFuso(p.year, p.month, p.day, 0, 0));
      if (!attivo && da <= adesso) { attivo = e; attivoDa = da; }
    });

    finestre.forEach(function (f) {
      f.sostituita = !!attivo && f.inizio < attivo.termine && f.termine > attivoDa;
    });

    let prossimaRegolare = null;
    let inCorso = null;
    finestre.forEach(function (f) {
      if (f.sostituita) { return; }
      if (!prossimaRegolare && f.inizio > adesso) { prossimaRegolare = f; }
      if (f.inizio <= adesso && adesso < f.termine) { inCorso = f; }
    });

    let prossima = null;
    if (prossimaRegolare) { prossima = { ts: prossimaRegolare.inizio, giorno: prossimaRegolare.giorno, evento: null }; }
    if (prossimoEvento && (!prossima || prossimoEvento.inizio <= prossima.ts)) {
      prossima = { ts: prossimoEvento.inizio, giorno: null, evento: prossimoEvento };
    }

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

      evento: attivo,
      occorrenze: occorrenze,
      dateEventi: dateEventi
    };
  }

  function oraLocale(ts) {
    const qui = parti(FORMATO_LOCALE, new Date(ts));
    const la = partiFuso(new Date(ts));
    if (qui.hour === la.hour && qui.minute === la.minute) { return ''; }
    const ora = due(qui.hour) + ':' + due(qui.minute);
    return qui.day === la.day ? ora : GIORNI_BREVI[qui.giornoSettimana] + ' ' + ora;
  }

  function metti(elemento, classe, acceso) {
    if (elemento.classList.contains(classe) !== acceso) { elemento.classList.toggle(classe, acceso); }
  }

  function scrivi(nodo, testo) {
    if (nodo && nodo.textContent !== testo) { nodo.textContent = testo; }
  }

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

        if (isFinite(v.termine) && v.termine <= stato.adesso) {
          v.li.remove();
          v.tolto = true;
          return;
        }
        restano++;
        const evento = stato.prossima && stato.prossima.evento;

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

      if (giorni.length) { nastro(stato); }
      if (eventi.length) { speciali(stato); }

      if (!conto) { return; }

      if (inOnda) {

        if (conto.textContent !== statoLive) { conto.textContent = statoLive; }
        if (stato.prossima) {
          const iso = istanteIso(stato.prossima.ts);
          if (conto.getAttribute('datetime') !== iso) { conto.setAttribute('datetime', iso); }
        }
        return;
      }

      if (!stato.prossima) {

        return;
      }

      const restano = stato.prossima.ts - adesso;
      const testo = conta(restano);
      if (conto.textContent !== testo) { conto.textContent = testo; }
      conto.setAttribute('datetime', durataIso(restano));
    }

    battito();
    const timer = setInterval(battito, 1000);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { battito(); }
    });
    window.addEventListener('pagehide', function () { clearInterval(timer); }, { once: true });

    if (window.Player && typeof window.Player.suStato === 'function') {
      window.Player.suStato(function (stato) {
        inOnda = !!(stato && stato.inOnda);
        battito();
      });
    }
  }

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

  function ritrattoParlante() {
    const figura = document.querySelector('.chi__ritratto');
    const immagine = figura && figura.querySelector('img');
    const frasi = (DATI.chi && Array.isArray(DATI.chi.frasi) ? DATI.chi.frasi : [])
      .filter(function (f) { return typeof f === 'string' && f.trim(); });
    const raffica = categoriaGif('raffica');
    const insistenza = categoriaGif('insistenza');
    const scroll = categoriaGif('scroll');
    const gifOgni = (DATI.chi && Number.isInteger(DATI.chi.gifOgni) && DATI.chi.gifOgni > 0) ? DATI.chi.gifOgni : 0;
    const festa = window.PolloFesta || null;
    const conIcone = !!(festa && festa.icona);
    if (!immagine || (!frasi.length && !raffica.gif.length && !insistenza.gif.length && !scroll.gif.length && !conIcone)) { return; }

    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'chi__parla';
    immagine.parentNode.insertBefore(bottone, immagine);
    bottone.appendChild(immagine);

    const fumetto = document.createElement('p');
    fumetto.className = 'chi__fumetto';
    fumetto.setAttribute('aria-live', 'polite');
    figura.insertBefore(fumetto, bottone);

    const ORE = [12, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
    const DISTACCO = 28;
    const BORDO = 8;

    let ultima = -1;
    let oraUltima = -1;
    let spegni = null;

    const EMOTE = (DATI.chi && DATI.chi.emote && typeof DATI.chi.emote === 'object') ? DATI.chi.emote : {};

    function scriviFrase(testo) {
      fumetto.textContent = '';
      testo.split(/(\s+)/).forEach(function (pezzo) {
        const indirizzo = Object.prototype.hasOwnProperty.call(EMOTE, pezzo) ? EMOTE[pezzo] : '';
        if (typeof indirizzo === 'string' && indirizzo.indexOf('https://static-cdn.jtvnw.net/') === 0) {
          const img = document.createElement('img');
          img.className = 'chi__emote';
          img.src = indirizzo;
          img.alt = pezzo;
          img.width = 28;
          img.height = 28;
          fumetto.appendChild(img);
        } else {
          fumetto.appendChild(document.createTextNode(pezzo));
        }
      });
    }

    function pesca(quante, prima) {
      let scelta = Math.floor(Math.random() * quante);
      if (quante > 1 && scelta === prima) { scelta = (scelta + 1 + Math.floor(Math.random() * (quante - 1))) % quante; }
      return scelta;
    }

    function posiziona(ora) {
      const angolo = ora / 12 * 2 * Math.PI;
      const ux = Math.sin(angolo);
      const uy = -Math.cos(angolo);

      const lato = Math.max(Math.abs(ux), Math.abs(uy));
      const dx = ux / lato;
      const dy = uy / lato;

      const f = figura.getBoundingClientRect();
      const i = immagine.getBoundingClientRect();
      const metà = i.width / 2;
      const fx = i.left - f.left + metà + dx * (metà + DISTACCO);
      const fy = i.top - f.top + i.height / 2 + dy * (i.height / 2 + DISTACCO);

      const largo = fumetto.offsetWidth;
      const sinistra = f.left + fx + (dx - 1) / 2 * largo;
      const schermo = document.documentElement.clientWidth;
      let sx = 0;
      if (sinistra < BORDO) { sx = BORDO - sinistra; }
      else if (sinistra + largo > schermo - BORDO) { sx = schermo - BORDO - largo - sinistra; }

      const s = fumetto.style;
      s.setProperty('--fx', fx.toFixed(1) + 'px');
      s.setProperty('--fy', fy.toFixed(1) + 'px');
      s.setProperty('--dx', dx.toFixed(3));
      s.setProperty('--dy', dy.toFixed(3));
      s.setProperty('--ux', ux.toFixed(3));
      s.setProperty('--uy', uy.toFixed(3));
      s.setProperty('--sx', sx.toFixed(1) + 'px');
    }

    const RAFFICA_CLIC = 10;
    const RAFFICA_FINESTRA = 3000;
    const RAFFICA_PAUSA = 4000;
    const ATTESA_INSISTENZA = 800;
    const DURATA_GIF = 6500;

    let tempi = [];
    let conta = 0;
    let soglia = gifOgni;
    let pausaFino = 0;
    let timerInsistenza = null;
    let timerGelo = null;
    let timerDisgelo = null;
    const popup = { nodo: null, img: null, scritta: null, chiudi: null, timer: null, aperto: false };

    function categoriaGif(nome) {
      const grezza = (DATI.chi && DATI.chi[nome] && typeof DATI.chi[nome] === 'object') ? DATI.chi[nome] : {};
      const gif = (Array.isArray(grezza.gif) ? grezza.gif : []).filter(function (v) {
        return v && typeof v.src === 'string' && /^(?:img|contenuti\/media)\//.test(v.src) && v.src.indexOf('..') === -1;
      });
      const scritte = (Array.isArray(grezza.scritte) ? grezza.scritte : []).filter(function (f) { return typeof f === 'string' && f.trim(); });
      return { gif: gif, scritte: scritte, ultima: -1, ultimaScritta: -1 };
    }

    function costruisciPopup() {
      const nodo = document.createElement('div');
      nodo.className = 'pollo-gif';
      nodo.hidden = true;

      const riquadro = document.createElement('figure');
      riquadro.className = 'pollo-gif__riquadro';
      riquadro.setAttribute('role', 'dialog');
      riquadro.setAttribute('aria-modal', 'true');

      const scritta = document.createElement('figcaption');
      scritta.className = 'pollo-gif__scritta';

      const img = document.createElement('img');
      img.className = 'pollo-gif__img';
      img.alt = '';
      img.decoding = 'async';

      const chiudi = document.createElement('button');
      chiudi.type = 'button';
      chiudi.className = 'pollo-gif__chiudi';
      chiudi.setAttribute('aria-label', 'Chiudi');

      riquadro.appendChild(scritta);
      riquadro.appendChild(img);
      riquadro.appendChild(chiudi);
      nodo.appendChild(riquadro);
      document.body.appendChild(nodo);

      nodo.addEventListener('click', function (e) { if (e.target === nodo) { chiudiGif(); } });
      chiudi.addEventListener('click', chiudiGif);
      document.addEventListener('keydown', function (e) {
        if (popup.aperto && (e.key === 'Escape' || e.key === 'Esc')) { chiudiGif(); }
      });

      popup.nodo = nodo;
      popup.img = img;
      popup.scritta = scritta;
      popup.chiudi = chiudi;
      popup.riquadro = riquadro;
    }

    function apriGif(categoria) {
      if (popup.aperto || !categoria.gif.length) { return; }
      if (!popup.nodo) { costruisciPopup(); }

      categoria.ultima = pesca(categoria.gif.length, categoria.ultima);
      const voce = categoria.gif[categoria.ultima];
      let testo = typeof voce.scritta === 'string' ? voce.scritta.trim() : '';
      if (!testo && categoria.scritte.length) {
        categoria.ultimaScritta = pesca(categoria.scritte.length, categoria.ultimaScritta);
        testo = categoria.scritte[categoria.ultimaScritta].trim();
      }

      popup.scritta.textContent = testo;
      popup.scritta.hidden = !testo;
      popup.riquadro.setAttribute('aria-label', testo || 'GIF del pollo');
      popup.img.src = voce.src;
      popup.nodo.hidden = false;
      popup.aperto = true;
      void popup.nodo.offsetWidth;
      popup.nodo.classList.add('is-aperto');
      popup.chiudi.focus({ preventScroll: true });

      clearTimeout(popup.timer);
      popup.timer = setTimeout(chiudiGif, DURATA_GIF);
    }

    function chiudiGif() {
      if (!popup.aperto) { return; }
      popup.aperto = false;
      clearTimeout(popup.timer);
      popup.nodo.classList.remove('is-aperto');
      popup.nodo.hidden = true;
      popup.img.removeAttribute('src');
      if (document.activeElement === popup.chiudi || document.activeElement === document.body) {
        bottone.focus({ preventScroll: true });
      }
    }

    function congela() {
      clearTimeout(timerGelo);
      clearTimeout(timerDisgelo);
      figura.classList.remove('is-parla', 'is-sgela', 'is-congelato');
      void figura.offsetWidth;
      figura.classList.add('is-congelato');
      if (festa) {
        try { festa.spruzzo(bottone); } catch (e) { }
      }
      timerGelo = setTimeout(function () {
        figura.classList.remove('is-congelato');
        figura.classList.add('is-sgela');
        timerDisgelo = setTimeout(function () { figura.classList.remove('is-sgela'); }, 650);
      }, RAFFICA_PAUSA);
    }

    function contaClic() {
      const ora = Date.now();
      if (ora < pausaFino) { return true; }

      tempi.push(ora);
      tempi = tempi.filter(function (t) { return ora - t <= RAFFICA_FINESTRA; });

      if (tempi.length >= RAFFICA_CLIC) {
        tempi = [];
        conta = 0;
        soglia = gifOgni;
        pausaFino = ora + RAFFICA_PAUSA;
        clearTimeout(timerInsistenza);
        clearTimeout(spegni);
        congela();
        return true;
      }

      conta++;
      clearTimeout(timerInsistenza);
      if (gifOgni && conta >= soglia && insistenza.gif.length) {
        timerInsistenza = setTimeout(function () {
          soglia = conta + gifOgni;
          apriGif(insistenza);
        }, ATTESA_INSISTENZA);
      }
      return false;
    }

    function ascoltaScroll() {
      if (!scroll.gif.length) { return; }
      const INVERSIONI = 4;
      const FINESTRA = 2500;
      const CORSA_MINIMA = 80;
      const RIPOSO = 20000;

      let ultimaY = window.scrollY;
      let verso = 0;
      let partenza = ultimaY;
      let inversioni = [];
      let calmoFino = 0;

      window.addEventListener('scroll', function () {
        const y = window.scrollY;
        const passo = y - ultimaY;
        ultimaY = y;
        if (!passo) { return; }

        const nuovo = passo > 0 ? 1 : -1;
        if (nuovo === verso) { return; }

        const ora = Date.now();
        if (verso !== 0 && Math.abs(y - partenza) >= CORSA_MINIMA) {
          inversioni.push(ora);
          inversioni = inversioni.filter(function (t) { return ora - t <= FINESTRA; });
        }
        verso = nuovo;
        partenza = y;

        if (inversioni.length >= INVERSIONI && ora >= calmoFino && !popup.aperto) {
          inversioni = [];
          calmoFino = ora + RIPOSO;
          apriGif(scroll);
        }
      }, { passive: true });
    }

    ascoltaScroll();

    bottone.addEventListener('click', function () {
      if (contaClic()) { return; }
      if (festa) {
        try { festa.sbuffo(bottone); } catch (e) { }
      }
      if (!frasi.length) { return; }
      ultima = pesca(frasi.length, ultima);
      oraUltima = pesca(ORE.length, oraUltima);

      fumetto.style.transition = 'none';
      figura.classList.remove('is-parla');
      scriviFrase(frasi[ultima].trim());
      posiziona(ORE[oraUltima]);
      void figura.offsetWidth;
      fumetto.style.transition = '';
      figura.classList.add('is-parla');

      clearTimeout(spegni);
      spegni = setTimeout(function () {
        figura.classList.remove('is-parla');
      }, Math.min(12000, 4000 + frasi[ultima].length * 60));
    });
  }

  function avvia() {
    [binario, tempo, copiaEmail, ritrattoParlante].forEach(function (blocco) {
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
