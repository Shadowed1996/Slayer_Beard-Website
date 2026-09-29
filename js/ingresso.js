(function () {
  'use strict';

  var script = document.currentScript;
  var radice = document.documentElement;
  if (!script) { return; }

  try { if (window.self !== window.top) { return; } } catch (e) { return; }

  var CHIAVE = 'sb-ingresso';
  var TETTO = 8000;
  var durata = script.getAttribute('data-durata') || '';
  var perSessione = durata === 'sessione';
  var validita = Number(durata);
  var minimo = Math.min(6000, Math.max(1000, Number(script.getAttribute('data-minimo')) || 3000));

  var archivio = null;
  try {
    archivio = perSessione ? window.sessionStorage : window.localStorage;
    archivio.setItem(CHIAVE + '-prova', '1');
    archivio.removeItem(CHIAVE + '-prova');
  } catch (e) {
    archivio = null;
  }
  if (!archivio) { return; }
  if (!perSessione && !(validita > 0)) { return; }

  try {
    var visto = Number(archivio.getItem(CHIAVE));
    if (visto > 0 && (perSessione || Date.now() - visto < validita)) { return; }
  } catch (e) {
    return;
  }

  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var inizio = Date.now();
  var caricato = document.readyState === 'complete';
  radice.classList.add('sb-ingresso');

  function ricorda() {
    try { archivio.setItem(CHIAVE, String(Date.now())); } catch (e) { return; }
  }

  function idPollo() {
    var cifre = '';
    var valori = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(valori);
    } else {
      for (var i = 0; i < valori.length; i++) { valori[i] = Math.floor(Math.random() * 256); }
    }
    for (var j = 0; j < valori.length; j++) { cifre += (valori[j] < 16 ? '0' : '') + valori[j].toString(16); }
    return cifre;
  }

  function togli(schermo) {
    radice.classList.remove('sb-ingresso', 'sb-ingresso-esce');
    if (schermo && schermo.parentNode) { schermo.parentNode.removeChild(schermo); }
  }

  function avvia() {
    var schermo = document.getElementById('ingresso');
    if (!schermo) { radice.classList.remove('sb-ingresso'); return; }

    var codice = schermo.querySelector('[data-ingresso-id]');
    if (codice) { codice.textContent = idPollo(); }

    var finito = false;
    function via() {
      if (finito) { return; }
      finito = true;
      schermo.classList.add('is-riuscito');
      ricorda();
      setTimeout(function () {
        radice.classList.add('sb-ingresso-esce');
        setTimeout(function () { togli(schermo); }, quieto ? 50 : 520);
      }, quieto ? 400 : 1100);
    }

    function forse() {
      var passato = Date.now() - inizio;
      if (passato >= TETTO || (caricato && passato >= minimo)) { via(); return; }
      setTimeout(forse, 120);
    }

    if (!caricato) { window.addEventListener('load', function () { caricato = true; }, { once: true }); }
    forse();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
