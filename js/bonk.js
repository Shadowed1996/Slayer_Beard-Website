(function () {
  'use strict';

  const FRASE_UNO = 'Hai rotto le palle di cliccare, È tardi,';
  const FRASE_DUE = 'mena! Menaaah!';
  const COLPO = 2500;
  const DURATA = 9000;
  const USCITA = 400;

  const VITTIMA = 'img/bonk/doge.webp';
  const CARNEFICE = 'img/bonk/cheems.webp';
  const SUONO = 'mp3/' + encodeURIComponent('Cartoon Funny Bonk - Sound Effect HD.mp3');
  const SUONO_INIZIO = 0.76;
  const SUONO_FINE = 1900;

  const quieto = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let contesto = null;
  let scena = null;
  let timerFine = null;
  let timerVia = null;
  let timerSuono = null;
  let timerStop = null;
  let lettore = null;

  function fermo() { return !!(quieto && quieto.matches); }

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

  function sintetizza(ritardo) {
    if (!contesto) {
      const Costruttore = window.AudioContext || window.webkitAudioContext;
      if (!Costruttore) { return; }
      try { contesto = new Costruttore(); } catch (e) { return; }
    }
    const ctx = contesto;
    try { if (ctx.state === 'suspended') { ctx.resume(); } } catch (e) { }

    const t = ctx.currentTime + ritardo;
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

  function preparaSuono() {
    if (lettore) { return lettore; }
    try {
      lettore = new Audio(SUONO);
      lettore.preload = 'auto';
      lettore.load();
    } catch (e) {
      lettore = null;
    }
    return lettore;
  }

  function suona(ritardo) {
    const a = preparaSuono();
    if (!a) { sintetizza(ritardo / 1000); return; }

    clearTimeout(timerSuono);
    clearTimeout(timerStop);
    timerSuono = setTimeout(function () {
      try {
        a.pause();
        a.currentTime = SUONO_INIZIO;
        const promessa = a.play();
        if (promessa && typeof promessa.catch === 'function') {
          promessa.catch(function () { sintetizza(0); });
        }
        timerStop = setTimeout(function () { try { a.pause(); } catch (e) { } }, SUONO_FINE);
      } catch (e) {
        sintetizza(0);
      }
    }, ritardo);
  }

  function via() {
    clearTimeout(timerFine);
    clearTimeout(timerVia);
    document.removeEventListener('keydown', tasto, true);
    if (!scena) { return; }
    const vecchia = scena;
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

  function colpo() {
    if (scena) { return false; }

    const velo = document.createElement('div');
    velo.className = 'bonk';
    velo.setAttribute('role', 'alert');

    const palco = document.createElement('div');
    palco.className = 'bonk__palco';
    palco.setAttribute('aria-hidden', 'true');

    const vittima = document.createElement('div');
    vittima.className = 'bonk__vittima';
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

    palco.appendChild(vittima);
    palco.appendChild(carnefice);
    palco.appendChild(botta);

    const frase = document.createElement('p');
    frase.className = 'bonk__frase';
    const uno = document.createElement('span');
    uno.className = 'bonk__riga';
    uno.textContent = FRASE_UNO;
    const due = document.createElement('span');
    due.className = 'bonk__riga bonk__riga--mena';
    due.textContent = FRASE_DUE;
    frase.appendChild(uno);
    frase.appendChild(document.createTextNode(' '));
    frase.appendChild(due);

    velo.appendChild(palco);
    velo.appendChild(frase);
    velo.addEventListener('click', via);
    document.addEventListener('keydown', tasto, true);

    document.body.appendChild(velo);
    scena = velo;

    suona(fermo() ? 0 : COLPO);
    timerFine = setTimeout(via, DURATA);
    return true;
  }

  window.Bonk = { colpo: colpo };
}());
