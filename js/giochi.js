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
    var tendina = comandi.querySelector('[data-giochi-tendina]');
    var bottone = tendina ? tendina.querySelector('[aria-haspopup]') : null;
    var lista = tendina ? tendina.querySelector('[role="listbox"]') : null;
    var valore = tendina ? tendina.querySelector('[data-giochi-valore]') : null;
    var ordini = lista ? Array.prototype.slice.call(lista.querySelectorAll('[data-ordine]')) : [];
    var attiva = 0;
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
      for (var o = 0; o < ordini.length; o++) {
        var scelta = ordini[o].getAttribute('data-ordine') === stato.ordine;
        ordini[o].setAttribute('aria-selected', scelta ? 'true' : 'false');
        if (scelta && valore) { valore.textContent = ordini[o].textContent; }
      }

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

    function evidenzia(indice) {
      attiva = (indice + ordini.length) % ordini.length;
      for (var n = 0; n < ordini.length; n++) { ordini[n].classList.toggle('is-attiva', n === attiva); }
      lista.setAttribute('aria-activedescendant', ordini[attiva].id);
    }

    function apri() {
      var corrente = 0;
      for (var n = 0; n < ordini.length; n++) { if (ordini[n].getAttribute('data-ordine') === stato.ordine) { corrente = n; } }
      lista.hidden = false;
      bottone.setAttribute('aria-expanded', 'true');
      evidenzia(corrente);
      lista.focus();
    }

    function chiudi(rimettiFuoco) {
      if (lista.hidden) { return; }
      lista.hidden = true;
      bottone.setAttribute('aria-expanded', 'false');
      if (rimettiFuoco) { bottone.focus(); }
    }

    function scegli(indice) {
      var scelto = ordini[indice].getAttribute('data-ordine');
      stato.ordine = ORDINI.indexOf(scelto) !== -1 ? scelto : 'recenti';
      chiudi(true);
      applica();
    }

    if (bottone && lista && ordini.length) {
      bottone.addEventListener('click', function () {
        if (lista.hidden) { apri(); } else { chiudi(true); }
      });
      bottone.addEventListener('keydown', function (evento) {
        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') { evento.preventDefault(); apri(); }
      });
      lista.addEventListener('keydown', function (evento) {
        if (evento.key === 'ArrowDown') { evento.preventDefault(); evidenzia(attiva + 1); }
        else if (evento.key === 'ArrowUp') { evento.preventDefault(); evidenzia(attiva - 1); }
        else if (evento.key === 'Home') { evento.preventDefault(); evidenzia(0); }
        else if (evento.key === 'End') { evento.preventDefault(); evidenzia(ordini.length - 1); }
        else if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); scegli(attiva); }
        else if (evento.key === 'Escape' || evento.key === 'Esc') { evento.preventDefault(); chiudi(true); }
        else if (evento.key === 'Tab') { chiudi(false); }
      });
      ordini.forEach(function (voce, indice) {
        voce.addEventListener('click', function () { scegli(indice); });
        voce.addEventListener('mousemove', function () { if (attiva !== indice) { evidenzia(indice); } });
      });
      document.addEventListener('click', function (evento) {
        if (!tendina.contains(evento.target)) { chiudi(false); }
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
