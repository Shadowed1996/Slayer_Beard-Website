(function () {
  'use strict';

  var PAROLA = 'slayer';
  var DURATA_MS = 21000;
  var SFUMATA_MS = 600;
  var PAUSA_MAX_MS = 2000;
  var VOLUME = 0.9;
  var CANZONE = 'mp3/' + encodeURIComponent('J (mp3cut.net).mp3');
  var CLASSE = 'slayer-festa';

  var memoria = '';
  var ultimoTasto = 0;
  var inCorso = null;
  var pista = null;

  function eCampoDiTesto(nodo) {
    if (!nodo || nodo.nodeType === 9) { return false; }
    var tag = String(nodo.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || nodo.isContentEditable === true;
  }

  function preparaPista() {
    if (pista) { return pista; }
    try {
      pista = new Audio(CANZONE);
      pista.preload = 'auto';
      pista.volume = VOLUME;
    } catch (errore) {
      pista = null;
    }
    return pista;
  }

  function suonaCanzone() {
    var p = preparaPista();
    if (!p) { return; }
    try { p.currentTime = 0; } catch (errore) { }
    p.volume = VOLUME;
    try {
      var promessa = p.play();
      if (promessa && typeof promessa.catch === 'function') { promessa.catch(function () { }); }
    } catch (errore) { }
  }

  function fermaCanzone() {
    if (!pista) { return; }
    try { pista.pause(); } catch (errore) { }
    try { pista.currentTime = 0; } catch (errore) { }
    pista.volume = VOLUME;
  }

  function sfumaCanzone(stato) {
    if (!pista) { return; }
    var passi = 6;
    var fatti = 0;
    stato.dissolvenza = setInterval(function () {
      fatti++;
      pista.volume = Math.max(0, VOLUME * (1 - fatti / passi));
      if (fatti >= passi) { clearInterval(stato.dissolvenza); }
    }, SFUMATA_MS / passi);
  }

  function musicaDelSito() {
    var suonava = false;
    var raccogli = true;
    if (window.Musica && typeof window.Musica.suStato === 'function') {
      try {
        window.Musica.suStato(function (situazione) {
          if (raccogli) { suonava = !!(situazione && situazione.suona); }
        });
      } catch (errore) { }
    }
    raccogli = false;
    if (suonava && typeof window.Musica.ferma === 'function') { window.Musica.ferma(); }
    return suonava;
  }

  function caricaScript(src, fatto) {
    var nodo = document.createElement('script');
    nodo.src = src;
    nodo.onload = function () { fatto(true); };
    nodo.onerror = function () { fatto(false); };
    document.head.appendChild(nodo);
  }

  function caricaStile(href) {
    if (document.querySelector('link[href="' + href + '"]')) { return; }
    var nodo = document.createElement('link');
    nodo.rel = 'stylesheet';
    nodo.href = href;
    document.head.appendChild(nodo);
  }

  function conFesta(fatto) {
    if (window.PolloFesta && typeof window.PolloFesta.coro === 'function') { fatto(window.PolloFesta); return; }
    var inPagina = document.querySelector('script[src="js/festa.js"]');
    if (inPagina) {
      var tentativi = 0;
      var attesa = setInterval(function () {
        tentativi++;
        if (window.PolloFesta && typeof window.PolloFesta.coro === 'function') {
          clearInterval(attesa);
          fatto(window.PolloFesta);
        } else if (tentativi >= 40) {
          clearInterval(attesa);
          fatto(null);
        }
      }, 100);
      return;
    }
    caricaStile('css/festa.css');
    var dopoDati = function () {
      caricaScript('js/festa.js', function (riuscito) {
        fatto(riuscito && window.PolloFesta ? window.PolloFesta : null);
      });
    };
    if (window.DATI) { dopoDati(); } else { caricaScript('js/dati.js', dopoDati); }
  }

  function ferma() {
    if (!inCorso) { return false; }
    var stato = inCorso;
    inCorso = null;
    clearTimeout(stato.fine);
    clearTimeout(stato.sfumata);
    clearInterval(stato.dissolvenza);
    if (stato.coro) { stato.coro.ferma(); }
    fermaCanzone();
    document.documentElement.classList.remove(CLASSE);
    if (stato.musicaSuonava && window.Musica && typeof window.Musica.parti === 'function') { window.Musica.parti(); }
    return true;
  }

  function avvia() {
    if (inCorso) { return false; }
    var stato = { fine: null, sfumata: null, dissolvenza: null, coro: null, musicaSuonava: false };
    inCorso = stato;
    document.documentElement.classList.add(CLASSE);
    stato.musicaSuonava = musicaDelSito();
    suonaCanzone();
    conFesta(function (festa) {
      if (inCorso !== stato || !festa) { return; }
      stato.coro = festa.coro(DURATA_MS / 1000);
    });
    stato.sfumata = setTimeout(function () { sfumaCanzone(stato); }, DURATA_MS - SFUMATA_MS);
    stato.fine = setTimeout(ferma, DURATA_MS);
    return true;
  }

  function suTasto(evento) {
    if (evento.defaultPrevented || evento.repeat || evento.isComposing) { return; }
    var tasto = evento.key;
    if (typeof tasto !== 'string') { return; }
    if (tasto === 'Escape') {
      memoria = '';
      ferma();
      return;
    }
    if (evento.ctrlKey || evento.altKey || evento.metaKey || eCampoDiTesto(evento.target)) {
      memoria = '';
      return;
    }
    if (tasto.length !== 1) {
      if (tasto === 'Shift' || tasto === 'CapsLock' || tasto === 'AltGraph' || tasto === 'Dead') { return; }
      memoria = '';
      return;
    }
    var adesso = Date.now();
    if (adesso - ultimoTasto > PAUSA_MAX_MS) { memoria = ''; }
    ultimoTasto = adesso;
    memoria = (memoria + tasto.toLowerCase()).slice(-PAROLA.length);
    if (memoria === PAROLA.slice(0, 3)) { preparaPista(); }
    if (memoria === PAROLA) {
      memoria = '';
      avvia();
    }
  }

  document.addEventListener('keydown', suTasto);
  window.addEventListener('pagehide', function () { ferma(); });

  window.PolloSlayer = {
    parola: PAROLA,
    durata: DURATA_MS,
    canzone: CANZONE,
    avvia: avvia,
    ferma: ferma,
    inCorso: function () { return !!inCorso; }
  };
}());
