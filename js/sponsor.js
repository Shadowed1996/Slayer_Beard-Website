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
    var schede = document.querySelectorAll('[data-sponsor-scheda], .sponsor__voce');
    var rimaste = 0;

    for (var i = 0; i < schede.length; i++) {
      var fuori = scaduto(schede[i], ora);
      schede[i].hidden = fuori;

      if (!fuori && !schede[i].closest('[data-sponsor-fila-copia]')) { rimaste++; }
    }

    var griglia = document.querySelector('[data-sponsor-griglia]');
    if (griglia) { griglia.hidden = rimaste === 0; }

    var vuoto = document.querySelector('[data-sponsor-vuoto]');
    if (vuoto) { vuoto.hidden = rimaste > 0; }

    var sezione = document.getElementById('sponsor');
    if (sezione && document.querySelector('[data-sponsor-nastro]')) { sezione.hidden = rimaste === 0; }

    return rimaste;
  }

  function misuraNastro() {
    var nastro = document.querySelector('[data-sponsor-nastro]');
    var fila = document.querySelector('[data-sponsor-fila]');
    if (!nastro || !fila) { return; }

    var ferma = fila.scrollWidth <= nastro.clientWidth + 2;
    nastro.classList.toggle('is-ferma', ferma);
  }

  function copiaVecchia(testo) {
    var area = document.createElement('textarea');
    area.value = testo;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var fatto = false;
    try { fatto = document.execCommand('copy'); } catch (e) { fatto = false; }
    document.body.removeChild(area);
    return fatto;
  }

  function copia(testo) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(testo).then(function () { return true; }, function () { return copiaVecchia(testo); });
    }
    return Promise.resolve(copiaVecchia(testo));
  }

  function preparaCopia() {
    var bottoni = document.querySelectorAll('[data-sponsor-copia]');
    if (!bottoni.length) { return; }
    if (!(navigator.clipboard && window.isSecureContext) && !document.queryCommandSupported) { return; }

    Array.prototype.forEach.call(bottoni, function (bottone) {
      var scritta = bottone.textContent;
      var timer = 0;
      bottone.hidden = false;
      bottone.setAttribute('aria-live', 'polite');
      bottone.addEventListener('click', function () {
        copia(bottone.getAttribute('data-sponsor-copia') || '').then(function (fatto) {
          if (!fatto) { return; }
          clearTimeout(timer);
          bottone.textContent = bottone.getAttribute('data-copiato') || scritta;
          bottone.classList.add('is-copiato');
          timer = setTimeout(function () {
            bottone.textContent = scritta;
            bottone.classList.remove('is-copiato');
          }, 2000);
        });
      });
    });
  }

  function avvia() {
    ripulisci();
    misuraNastro();
    preparaCopia();

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
