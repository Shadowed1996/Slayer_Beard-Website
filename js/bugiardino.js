(function () {
  'use strict';

  var script = document.currentScript;
  var CHIAVE = 'sb-bugiardino';
  var ATTESA_MIN = 6000;
  var ATTESA_MAX = 15000;
  var ATTESA_PROVA = 1500;
  var RESTA = 30000;
  var USCITA = 400;
  var SALTO = 7000;
  var LATO = 64;

  var ogni = Math.round(Number(script && script.getAttribute('data-ogni')) || 4);
  ogni = Math.max(1, Math.min(20, ogni));
  var forzato = /[?&]bugiardino(?:[=&]|$)/.test(window.location.search || '');
  var quieto = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function archivio() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function leggi() {
    var a = archivio();
    try { return a ? a.getItem(CHIAVE) : null; } catch (e) { return null; }
  }

  function scrivi(valore) {
    var a = archivio();
    try { if (a) { a.setItem(CHIAVE, valore); } } catch (e) { return; }
  }

  function tocca() {
    if (forzato) { return true; }
    var esito = leggi();
    if (esito === 'si') { return true; }
    if (esito === 'no' || esito === 'visto') { return false; }
    var si = Math.random() < 1 / ogni;
    scrivi(si ? 'si' : 'no');
    return si;
  }

  function avvia() {
    var box = document.getElementById('bugiardino');
    var foglio = document.getElementById('bugiardino-foglio');
    if (!box || !foglio) { return; }
    var chiudi = foglio.querySelector('.bugiardino-foglio__chiudi');
    var timerVia = null;
    var timerSalto = null;
    var sopra = false;

    function posto() {
      var largo = window.innerWidth || document.documentElement.clientWidth || 360;
      var alto = window.innerHeight || document.documentElement.clientHeight || 640;
      var bordo = largo >= 1100 ? 104 : 16;
      var x = bordo + Math.random() * Math.max(0, largo - bordo - 16 - LATO - 120);
      var y = alto * 0.15 + Math.random() * Math.max(0, alto * 0.6 - LATO);
      box.style.left = Math.round(x) + 'px';
      box.style.top = Math.round(y) + 'px';
      box.style.setProperty('--giro', Math.round(Math.random() * 70 - 35) + 'deg');
    }

    function salta() {
      clearTimeout(timerSalto);
      if (quieto) { return; }
      timerSalto = setTimeout(function () {
        if (sopra || !foglio.hidden || box.hidden) { salta(); return; }
        box.classList.remove('is-visibile');
        setTimeout(function () {
          if (box.hidden) { return; }
          posto();
          box.classList.add('is-visibile');
          salta();
        }, USCITA);
      }, SALTO);
    }

    function nascondiBox() {
      clearTimeout(timerVia);
      clearTimeout(timerSalto);
      box.classList.remove('is-visibile');
      setTimeout(function () { box.hidden = true; }, quieto ? 0 : USCITA);
    }

    function programmaVia() {
      clearTimeout(timerVia);
      timerVia = setTimeout(function () {
        if (sopra || !foglio.hidden) { programmaVia(); return; }
        nascondiBox();
      }, RESTA);
    }

    function mostraBox() {
      scrivi('visto');
      posto();
      box.hidden = false;
      requestAnimationFrame(function () { box.classList.add('is-visibile'); });
      programmaVia();
      salta();
    }

    function tasto(evento) {
      if (evento.key === 'Escape' || evento.key === 'Esc') {
        evento.stopPropagation();
        chiudiFoglio();
      }
    }

    function apriFoglio() {
      nascondiBox();
      foglio.hidden = false;
      document.documentElement.classList.add('sb-bugiardino-aperto');
      requestAnimationFrame(function () { foglio.classList.add('is-aperto'); });
      document.addEventListener('keydown', tasto, true);
      if (chiudi) { chiudi.focus(); }
    }

    function chiudiFoglio() {
      if (foglio.hidden) { return; }
      document.removeEventListener('keydown', tasto, true);
      foglio.classList.remove('is-aperto');
      document.documentElement.classList.remove('sb-bugiardino-aperto');
      setTimeout(function () { foglio.hidden = true; }, quieto ? 0 : USCITA);
    }

    box.addEventListener('click', apriFoglio);
    if (chiudi) { chiudi.addEventListener('click', chiudiFoglio); }
    foglio.addEventListener('click', function (evento) { if (evento.target === foglio) { chiudiFoglio(); } });
    box.addEventListener('pointerenter', function () { sopra = true; });
    box.addEventListener('pointerleave', function () { sopra = false; });
    box.addEventListener('focusin', function () { sopra = true; });
    box.addEventListener('focusout', function () { sopra = false; });

    var attesa = forzato ? ATTESA_PROVA : ATTESA_MIN + Math.random() * (ATTESA_MAX - ATTESA_MIN);
    setTimeout(mostraBox, attesa);
  }

  if (!tocca()) { return; }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
