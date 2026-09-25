(function () {
  'use strict';

  const OGNI_QUANTO = 60000;
  const MINIMO = 15000;

  let riquadri = [];
  let timer = null;
  let inVolo = false;
  let ultimaLettura = 0;
  let fallimenti = 0;
  let ultimoNumero = null;

  function numeroTesto(valore) {
    const cifre = String(Math.max(0, Math.round(Number(valore) || 0)));
    let fuori = '';
    for (let i = 0; i < cifre.length; i++) {
      if (i > 0 && (cifre.length - i) % 3 === 0) { fuori += '.'; }
      fuori += cifre[i];
    }
    return fuori;
  }

  function mostra(stato) {
    const acceso = !!stato && stato.inOnda === true;
    const numero = acceso ? Math.max(0, Math.round(Number(stato.spettatori) || 0)) : 0;
    const testo = numeroTesto(numero);
    const cambiato = ultimoNumero !== null && acceso && numero !== ultimoNumero;
    for (let i = 0; i < riquadri.length; i++) {
      const r = riquadri[i];
      r.hidden = !acceso;
      const cifre = r.querySelectorAll('[data-spettatori-numero]');
      for (let j = 0; j < cifre.length; j++) { cifre[j].textContent = testo; }
      const parole = r.querySelectorAll('[data-spettatori-parola]');
      for (let j = 0; j < parole.length; j++) { parole[j].textContent = numero === 1 ? 'spettatore' : 'spettatori'; }
      if (r.getAttribute('role') === 'img') { r.setAttribute('aria-label', testo + (numero === 1 ? ' spettatore in diretta' : ' spettatori in diretta')); }
      if (cambiato) {
        r.classList.remove('is-cambiato');
        void r.offsetWidth;
        r.classList.add('is-cambiato');
      }
    }
    ultimoNumero = acceso ? numero : null;
  }

  function leggi() {
    if (inVolo || document.hidden) { return; }
    inVolo = true;
    ultimaLettura = Date.now();
    fetch('/api/spettatori?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (risposta) {
        if (risposta.status === 404) { fallimenti += 3; return null; }
        return risposta.ok ? risposta.json() : null;
      })
      .then(function (stato) {
        if (stato && typeof stato === 'object' && 'inOnda' in stato) {
          fallimenti = 0;
          mostra(stato);
        } else {
          fallimenti++;
        }
      }, function () {
        fallimenti++;
      })
      .then(function () {
        inVolo = false;
        if (fallimenti >= 6) { ferma(); mostra(null); }
      });
  }

  function forse() {
    if (Date.now() - ultimaLettura >= MINIMO) { leggi(); }
  }

  function ferma() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function avvia() {
    riquadri = Array.prototype.slice.call(document.querySelectorAll('[data-spettatori]'));
    if (!riquadri.length) { return; }
    leggi();
    timer = setInterval(leggi, OGNI_QUANTO);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && timer) { forse(); }
    });
    const P = window.Player;
    if (P && typeof P.suStato === 'function') {
      let prima = null;
      P.suStato(function (s) {
        const ora = !!(s && s.inOnda);
        if (prima !== null && ora !== prima && timer) { forse(); }
        prima = ora;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
