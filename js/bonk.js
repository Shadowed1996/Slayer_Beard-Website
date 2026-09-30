(function () {
  'use strict';

  const FRASI = ['Hai rotto le palle di cliccare.', 'Entra in live.', 'Menah ! Menaah'];
  const ARRIVO = 900;
  const VELOCE = 250;
  const TROPPI = 10;
  const ATTESA = 7000;
  const DOPO_BOTTO = 9000;
  const USCITA = 400;
  const PEZZI = 16;

  const VITTIMA = 'img/bonk/doge.webp';
  const CARNEFICE = 'img/bonk/cheems.webp';
  const SUONO = 'mp3/' + encodeURIComponent('Cartoon Funny Bonk - Sound Effect HD.mp3');
  const SUONO_INIZIO = 0.76;
  const SUONO_FINE = 900;

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  let contesto = null;
  let scena = null;
  let timerFine = null;
  let timerVia = null;
  let lettori = [];
  let prossimo = 0;

  function fermo() { return quieto.matches; }

  function stelle() {
    return '<svg class="bonk__stelle" viewBox="0 0 120 40" aria-hidden="true" focusable="false">' +
      '<g fill="#ffd84a" stroke="#241915" stroke-width="1.5">' +
      '<path d="M14 14 l4 9 10 1 -7 7 2 10 -9 -5 -9 5 2 -10 -7 -7 10 -1 Z"/>' +
      '<path d="M100 10 l3 7 8 1 -6 5 2 8 -7 -4 -7 4 2 -8 -6 -5 8 -1 Z"/>' +
      '<path d="M58 2 l3 6 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 Z"/>' +
      '</g>' +
      '</svg>';
  }

  function immagine(src, classe) {
    const img = document.createElement('img');
    img.className = classe;
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    return img;
  }

  function audio() {
    if (!contesto) {
      const Costruttore = window.AudioContext || window.webkitAudioContext;
      if (!Costruttore) { return null; }
      try { contesto = new Costruttore(); } catch (e) { return null; }
    }
    try { if (contesto.state === 'suspended') { contesto.resume(); } } catch (e) { }
    return contesto;
  }

  function sintetizza() {
    const ctx = audio();
    if (!ctx) { return; }
    const t = ctx.currentTime;
    const uscita = ctx.createGain();
    uscita.gain.value = 0.85;
    uscita.connect(ctx.destination);

    const cupo = ctx.createOscillator();
    const cupoVol = ctx.createGain();
    cupo.type = 'sine';
    cupo.frequency.setValueAtTime(380, t);
    cupo.frequency.exponentialRampToValueAtTime(95, t + 0.2);
    cupoVol.gain.setValueAtTime(0.0001, t);
    cupoVol.gain.exponentialRampToValueAtTime(1, t + 0.006);
    cupoVol.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    cupo.connect(cupoVol).connect(uscita);
    cupo.start(t);
    cupo.stop(t + 0.45);

    const legno = ctx.createOscillator();
    const legnoVol = ctx.createGain();
    legno.type = 'triangle';
    legno.frequency.setValueAtTime(820, t);
    legno.frequency.exponentialRampToValueAtTime(240, t + 0.09);
    legnoVol.gain.setValueAtTime(0.0001, t);
    legnoVol.gain.exponentialRampToValueAtTime(0.55, t + 0.003);
    legnoVol.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    legno.connect(legnoVol).connect(uscita);
    legno.start(t);
    legno.stop(t + 0.16);
  }

  function botto() {
    const ctx = audio();
    if (!ctx) { return; }
    const t = ctx.currentTime;
    const lungo = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, lungo, ctx.sampleRate);
    const dati = buffer.getChannelData(0);
    for (let i = 0; i < lungo; i++) { dati[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / lungo, 2.5); }
    const rumore = ctx.createBufferSource();
    rumore.buffer = buffer;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(4000, t);
    filtro.frequency.exponentialRampToValueAtTime(180, t + 1);
    const vol = ctx.createGain();
    vol.gain.setValueAtTime(1, t);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    rumore.connect(filtro).connect(vol).connect(ctx.destination);
    rumore.start(t);

    const tonfo = ctx.createOscillator();
    const tonfoVol = ctx.createGain();
    tonfo.type = 'sine';
    tonfo.frequency.setValueAtTime(120, t);
    tonfo.frequency.exponentialRampToValueAtTime(35, t + 0.6);
    tonfoVol.gain.setValueAtTime(1, t);
    tonfoVol.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    tonfo.connect(tonfoVol).connect(ctx.destination);
    tonfo.start(t);
    tonfo.stop(t + 0.75);
  }

  function preparaSuoni() {
    if (lettori.length) { return; }
    for (let i = 0; i < 4; i++) {
      try {
        const a = new Audio(SUONO);
        a.preload = 'auto';
        a.load();
        lettori.push({ a: a, timer: null });
      } catch (e) {
        lettori = [];
        return;
      }
    }
  }

  function suona() {
    if (!lettori.length) { sintetizza(); return; }
    const l = lettori[prossimo];
    prossimo = (prossimo + 1) % lettori.length;
    clearTimeout(l.timer);
    try {
      l.a.pause();
      l.a.currentTime = SUONO_INIZIO;
      const promessa = l.a.play();
      if (promessa) { promessa.catch(sintetizza); }
      l.timer = setTimeout(function () { try { l.a.pause(); } catch (e) { } }, SUONO_FINE);
    } catch (e) {
      sintetizza();
    }
  }

  function riparti(nodo, classe) {
    nodo.classList.remove(classe);
    void nodo.offsetWidth;
    nodo.classList.add(classe);
  }

  function via() {
    clearTimeout(timerFine);
    clearTimeout(timerVia);
    document.removeEventListener('keydown', tasto, true);
    if (!scena) { return; }
    const vecchia = scena.velo;
    scena = null;
    if (fermo()) {
      if (vecchia.parentNode) { vecchia.parentNode.removeChild(vecchia); }
      return;
    }
    vecchia.classList.add('is-via');
    timerVia = setTimeout(function () {
      if (vecchia.parentNode) { vecchia.parentNode.removeChild(vecchia); }
    }, USCITA);
  }

  function tasto(e) {
    if (e.key === 'Escape' || e.key === 'Esc') { via(); }
  }

  function aspetta(ms) {
    clearTimeout(timerFine);
    timerFine = setTimeout(via, ms);
  }

  function esplodi(s) {
    s.esploso = true;
    botto();
    s.velo.classList.add('is-esploso');
    if (!fermo()) {
      for (let i = 0; i < PEZZI; i++) {
        const pezzo = document.createElement('span');
        pezzo.className = 'bonk__pezzo';
        const angolo = (i / PEZZI) * Math.PI * 2 + Math.random() * 0.4;
        const forza = 140 + Math.random() * 220;
        pezzo.style.setProperty('--dx', Math.round(Math.cos(angolo) * forza) + 'px');
        pezzo.style.setProperty('--dy', Math.round(Math.sin(angolo) * forza - 60) + 'px');
        pezzo.style.setProperty('--giro', Math.round(Math.random() * 720 - 360) + 'deg');
        pezzo.style.setProperty('--sx', Math.round(Math.random() * 100) + '%');
        pezzo.style.setProperty('--sy', Math.round(Math.random() * 100) + '%');
        s.vittima.appendChild(pezzo);
      }
    }
    s.frase.hidden = false;
    aspetta(DOPO_BOTTO);
  }

  function colpisci(s) {
    if (s.esploso) { return; }
    const ora = Date.now();
    const intervallo = s.ultimo ? ora - s.ultimo : Infinity;
    s.ultimo = ora;
    s.veloci = intervallo < VELOCE ? s.veloci + 1 : 0;

    const foga = Math.max(0, Math.min(1, (700 - Math.min(700, intervallo)) / 550));
    s.velo.style.setProperty('--foga', foga.toFixed(2));
    s.botta.style.setProperty('--gira', Math.round(Math.random() * 24 - 12) + 'deg');
    s.botta.style.setProperty('--sposta', Math.round(Math.random() * 16 - 8) + '%');

    setTimeout(suona, fermo() ? 0 : 110);
    riparti(s.braccio, 'is-colpo');
    riparti(s.vittima, 'is-colpita');
    riparti(s.botta, 'is-colpo');
    riparti(s.palco, 'is-trema');

    if (s.veloci >= TROPPI) { esplodi(s); return; }
    aspetta(ATTESA);
  }

  function colpo() {
    if (scena) { return false; }
    preparaSuoni();

    const velo = document.createElement('div');
    velo.className = 'bonk';
    velo.setAttribute('role', 'dialog');
    velo.setAttribute('aria-label', 'Bonk');

    const chiudi = document.createElement('button');
    chiudi.type = 'button';
    chiudi.className = 'bonk__chiudi';
    chiudi.setAttribute('aria-label', 'Chiudi');
    chiudi.textContent = '×';

    const palco = document.createElement('div');
    palco.className = 'bonk__palco';
    palco.setAttribute('aria-hidden', 'true');

    const vittima = document.createElement('div');
    vittima.className = 'bonk__vittima';
    vittima.style.setProperty('--doge', 'url("' + VITTIMA + '")');
    vittima.appendChild(immagine(VITTIMA, 'bonk__cane'));
    vittima.insertAdjacentHTML('beforeend', stelle());

    const botta = document.createElement('div');
    botta.className = 'bonk__botta';
    botta.textContent = 'BONK!';

    const carnefice = document.createElement('div');
    carnefice.className = 'bonk__carnefice';
    const braccio = document.createElement('div');
    braccio.className = 'bonk__braccio';
    braccio.appendChild(immagine(CARNEFICE, 'bonk__cane'));
    carnefice.appendChild(braccio);

    const lampo = document.createElement('div');
    lampo.className = 'bonk__lampo';

    palco.appendChild(vittima);
    palco.appendChild(carnefice);
    palco.appendChild(botta);
    palco.appendChild(lampo);

    const frase = document.createElement('p');
    frase.className = 'bonk__frase';
    frase.setAttribute('role', 'alert');
    frase.hidden = true;
    FRASI.forEach(function (testo, i) {
      const riga = document.createElement('span');
      riga.className = 'bonk__riga' + (i === FRASI.length - 1 ? ' bonk__riga--mena' : '');
      riga.textContent = testo;
      frase.appendChild(riga);
    });

    velo.appendChild(chiudi);
    velo.appendChild(palco);
    velo.appendChild(frase);

    const s = { velo: velo, palco: palco, vittima: vittima, braccio: braccio, botta: botta, frase: frase, pronto: false, esploso: false, ultimo: 0, veloci: 0 };

    chiudi.addEventListener('click', function (e) {
      e.stopPropagation();
      via();
    });
    velo.addEventListener('click', function () {
      if (s.esploso) { via(); return; }
      if (s.pronto) { colpisci(s); }
    });
    document.addEventListener('keydown', tasto, true);

    document.body.appendChild(velo);
    scena = s;
    setTimeout(function () { s.pronto = true; }, fermo() ? 0 : ARRIVO);
    chiudi.focus({ preventScroll: true });
    aspetta(ATTESA + ARRIVO);
    return true;
  }

  window.Bonk = { colpo: colpo };
}());
