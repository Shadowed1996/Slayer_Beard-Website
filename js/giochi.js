(function () {
  'use strict';

  var ORDINI = ['recenti', 'ore', 'nome'];

  function generiDi(voce) {
    var grezzo = voce.getAttribute('data-generi') || '';
    return grezzo ? grezzo.split('|') : [];
  }

  function confronta(ordine) {
    return function (a, b) {
      var nomeA = a.getAttribute('data-nome') || '';
      var nomeB = b.getAttribute('data-nome') || '';
      var perNome = nomeA.localeCompare(nomeB, 'it', { sensitivity: 'base' });
      if (ordine === 'nome') { return perNome; }
      var ore = (parseFloat(b.getAttribute('data-ore')) || 0) - (parseFloat(a.getAttribute('data-ore')) || 0);
      if (ordine === 'ore' && ore !== 0) { return ore; }
      var ultimaA = a.getAttribute('data-ultima') || '';
      var ultimaB = b.getAttribute('data-ultima') || '';
      if (ultimaA !== ultimaB) { return ultimaA < ultimaB ? 1 : -1; }
      return ore || perNome;
    };
  }

  function leggiUrl() {
    var stato = { tipi: [], ordine: 'recenti' };
    try {
      var parametri = new URLSearchParams(window.location.search);
      var tipi = parametri.getAll('tipo');
      for (var i = 0; i < tipi.length; i++) {
        var pezzi = tipi[i].split(',');
        for (var j = 0; j < pezzi.length; j++) {
          var tipo = pezzi[j].trim();
          if (tipo && stato.tipi.indexOf(tipo) === -1) { stato.tipi.push(tipo); }
        }
      }
      var ordine = parametri.get('ordine');
      if (ORDINI.indexOf(ordine) !== -1) { stato.ordine = ordine; }
    } catch (e) {}
    return stato;
  }

  function scriviUrl(stato) {
    if (!window.history || typeof window.history.replaceState !== 'function') { return; }
    try {
      var parametri = new URLSearchParams();
      if (stato.tipi.length) { parametri.set('tipo', stato.tipi.join(',')); }
      if (stato.ordine !== 'recenti') { parametri.set('ordine', stato.ordine); }
      var query = parametri.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
    } catch (e) {}
  }

  function senzaCopertina(evento) {
    var immagine = evento.target;
    var cornice = immagine.parentNode;
    if (!cornice) { return; }
    var segnaposto = document.createElement('span');
    segnaposto.className = 'gioco-card__segnaposto';
    segnaposto.setAttribute('aria-hidden', 'true');
    segnaposto.textContent = (immagine.getAttribute('alt') || '').charAt(0).toUpperCase();
    cornice.replaceChild(segnaposto, immagine);
  }

  function curaCopertine() {
    var immagini = document.querySelectorAll('.gioco-card__immagine');
    for (var i = 0; i < immagini.length; i++) {
      if (immagini[i].complete && immagini[i].naturalWidth === 0 && immagini[i].currentSrc) {
        senzaCopertina({ target: immagini[i] });
      } else {
        immagini[i].addEventListener('error', senzaCopertina, { once: true });
      }
    }
  }

  function avvia() {
    curaCopertine();
    var elenco = document.querySelector('[data-giochi-elenco]');
    var comandi = document.querySelector('[data-giochi-comandi]');
    if (!elenco || !comandi) { return; }

    var voci = Array.prototype.slice.call(elenco.querySelectorAll('[data-gioco]'));
    var pillole = Array.prototype.slice.call(comandi.querySelectorAll('[data-tipo]'));
    var selettore = comandi.querySelector('[data-giochi-ordine]');
    var conto = document.querySelector('[data-giochi-conto]');
    var vuoto = document.querySelector('[data-giochi-vuoto]');

    var esistenti = pillole.map(function (p) { return p.getAttribute('data-tipo'); }).filter(Boolean);
    var stato = leggiUrl();
    stato.tipi = stato.tipi.filter(function (t) { return esistenti.indexOf(t) !== -1; });

    function applica() {
      var visibili = 0;
      for (var i = 0; i < voci.length; i++) {
        var generi = generiDi(voci[i]);
        var dentro = !stato.tipi.length || stato.tipi.some(function (t) { return generi.indexOf(t) !== -1; });
        voci[i].hidden = !dentro;
        if (dentro) { visibili++; }
      }

      var ordinate = voci.slice().sort(confronta(stato.ordine));
      for (var k = 0; k < ordinate.length; k++) { elenco.appendChild(ordinate[k]); }

      for (var p = 0; p < pillole.length; p++) {
        var tipo = pillole[p].getAttribute('data-tipo');
        var acceso = tipo ? stato.tipi.indexOf(tipo) !== -1 : stato.tipi.length === 0;
        pillole[p].setAttribute('aria-pressed', acceso ? 'true' : 'false');
      }
      if (selettore) { selettore.value = stato.ordine; }

      if (conto) {
        var parola = conto.getAttribute(visibili === 1 ? 'data-uno' : 'data-tanti') || '';
        conto.textContent = visibili + ' ' + parola;
      }
      if (vuoto) { vuoto.hidden = visibili > 0; }
      scriviUrl(stato);
    }

    for (var i = 0; i < pillole.length; i++) {
      pillole[i].addEventListener('click', function (evento) {
        var tipo = evento.currentTarget.getAttribute('data-tipo');
        if (!tipo) {
          stato.tipi = [];
        } else {
          var dove = stato.tipi.indexOf(tipo);
          if (dove === -1) { stato.tipi.push(tipo); } else { stato.tipi.splice(dove, 1); }
        }
        applica();
      });
    }

    if (selettore) {
      selettore.addEventListener('change', function () {
        stato.ordine = ORDINI.indexOf(selettore.value) !== -1 ? selettore.value : 'recenti';
        applica();
      });
    }

    comandi.hidden = false;
    applica();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
