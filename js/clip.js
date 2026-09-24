(function () {
  'use strict';

  var ORA_MS = 60 * 60 * 1000;

  var comandi = document.querySelector('[data-clip-comandi]');
  var elenco = document.querySelector('[data-clip-elenco]');
  if (!comandi || !elenco) { return; }

  var bottoni = [].slice.call(comandi.querySelectorAll('[data-ore]'));
  var campo = comandi.querySelector('[data-clip-cerca]');
  var pulisci = comandi.querySelector('[data-clip-pulisci]');
  var conto = document.querySelector('[data-clip-conto]');
  var vuoto = document.querySelector('[data-clip-vuoto]');
  var vuotoCerca = document.querySelector('[data-clip-cerca-vuoto]');
  var voci = [].slice.call(elenco.querySelectorAll('[data-quando]'));
  if (!bottoni.length || !voci.length) { return; }

  function normalizza(testo) {
    var pulito = String(testo || '').toLowerCase();
    if (typeof pulito.normalize === 'function') {
      pulito = pulito.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    return pulito.replace(/\s+/g, ' ').trim();
  }

  var schede = voci.map(function (voce) {
    var letta = Date.parse(voce.getAttribute('data-quando') || '');
    return {
      nodo: voce,
      quando: isNaN(letta) ? Date.now() : letta,
      testo: normalizza(voce.getAttribute('data-cerca'))
    };
  });

  var quante = parseInt(elenco.getAttribute('data-quante'), 10);
  if (!isFinite(quante) || quante < 1) { quante = schede.length; }

  function oreAccese() {
    for (var i = 0; i < bottoni.length; i++) {
      if (bottoni[i].getAttribute('aria-pressed') === 'true') {
        var ore = parseInt(bottoni[i].getAttribute('data-ore'), 10);
        if (isFinite(ore) && ore > 0) { return ore; }
      }
    }
    return 0;
  }

  function paroleCercate() {
    var cercato = campo ? normalizza(campo.value) : '';
    return cercato ? cercato.split(' ') : [];
  }

  function corrisponde(scheda, parole) {
    for (var i = 0; i < parole.length; i++) {
      if (scheda.testo.indexOf(parole[i]) === -1) { return false; }
    }
    return true;
  }

  function applica() {
    var limite = Date.now() - oreAccese() * ORA_MS;
    var parole = paroleCercate();
    var cerca = parole.length > 0;
    var tetto = cerca ? schede.length : quante;
    var mostrate = 0;

    for (var i = 0; i < schede.length; i++) {
      var dentro = schede[i].quando >= limite && corrisponde(schede[i], parole) && mostrate < tetto;
      schede[i].nodo.hidden = !dentro;
      if (dentro) { mostrate++; }
    }

    if (vuoto) { vuoto.hidden = cerca || mostrate > 0; }
    if (vuotoCerca) { vuotoCerca.hidden = !cerca || mostrate > 0; }
    if (conto) {
      conto.hidden = !cerca;
      if (cerca) {
        conto.textContent = mostrate + ' ' + (conto.getAttribute(mostrate === 1 ? 'data-uno' : 'data-tanti') || '');
      }
    }
    if (pulisci) { pulisci.hidden = !(campo && campo.value); }
  }

  function scegli(bottone) {
    for (var i = 0; i < bottoni.length; i++) {
      bottoni[i].setAttribute('aria-pressed', bottoni[i] === bottone ? 'true' : 'false');
    }
    applica();
  }

  for (var i = 0; i < bottoni.length; i++) {
    bottoni[i].addEventListener('click', function (evento) {
      scegli(evento.currentTarget);
    });
  }

  if (campo) {
    campo.addEventListener('input', applica);
    campo.addEventListener('keydown', function (evento) {
      if ((evento.key === 'Escape' || evento.key === 'Esc') && campo.value) {
        evento.preventDefault();
        campo.value = '';
        applica();
      }
    });
  }

  if (pulisci && campo) {
    pulisci.addEventListener('click', function () {
      campo.value = '';
      applica();
      campo.focus();
    });
  }

  window.addEventListener('pageshow', applica);

  comandi.hidden = false;
  applica();
}());
