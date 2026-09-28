(function () {
  'use strict';

  function istante(valore) {
    if (!valore) { return null; }
    var ms = Date.parse(valore);
    return isNaN(ms) ? null : ms;
  }

  function scaduto(nodo, ora) {
    var da = istante(nodo.getAttribute('data-da'));
    var a = istante(nodo.getAttribute('data-a'));
    if (da !== null && ora < da) { return true; }
    if (a !== null && ora >= a) { return true; }
    return false;
  }

  function ripulisci() {
    var ora = Date.now();
    var schede = document.querySelectorAll('.sponsor__voce');
    var rimaste = 0;

    for (var i = 0; i < schede.length; i++) {
      var fuori = scaduto(schede[i], ora);
      schede[i].hidden = fuori;

      if (!fuori && !schede[i].closest('[data-sponsor-fila-copia]')) { rimaste++; }
    }

    var sezione = document.getElementById('sponsor');
    if (sezione) { sezione.hidden = rimaste === 0; }

    return rimaste;
  }

  function misuraNastro() {
    var nastro = document.querySelector('[data-sponsor-nastro]');
    var fila = document.querySelector('[data-sponsor-fila]');
    if (!nastro || !fila) { return; }

    var ferma = fila.scrollWidth <= nastro.clientWidth + 2;
    nastro.classList.toggle('is-ferma', ferma);
  }

  function avvia() {
    ripulisci();
    misuraNastro();

    window.addEventListener('resize', misuraNastro);

    var loghi = document.querySelectorAll('.sponsor__logo');
    for (var i = 0; i < loghi.length; i++) {
      if (!loghi[i].complete) { loghi[i].addEventListener('load', misuraNastro, { once: true }); }
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { ripulisci(); misuraNastro(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
