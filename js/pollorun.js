(function () {
  'use strict';

  var PAROLA = 'pollorun';
  var PAUSA_MAX_MS = 2000;
  var MODI = ['fissa', 'ordine', 'caso'];
  var VOLUME_BASE = 30;
  var CHIAVE_VOLUMI = 'sb-manutenzione-volumi';
  var CLASSE = 'is-pollorun';
  var ORIGINE = document.currentScript;

  function leggiFrasi(testo) {
    try {
      var lette = JSON.parse(testo || '[]');
      return Array.isArray(lette) ? lette : [];
    } catch (errore) {
      return [];
    }
  }

  function leggiCanzoni(testo) {
    var letto = null;
    try { letto = JSON.parse(testo || 'null'); } catch (errore) { letto = null; }
    var intero = !!letto && typeof letto === 'object' && !Array.isArray(letto);
    var elenco = Array.isArray(letto) ? letto : (intero && Array.isArray(letto.canzoni) ? letto.canzoni : []);
    var scelta = intero ? Number(letto.fissa) : 0;
    var canzoni = [];
    var fissa = 0;
    for (var i = 0; i < elenco.length; i++) {
      var voce = elenco[i];
      if (!voce || typeof voce.file !== 'string' || voce.file.indexOf('mp3/') !== 0) { continue; }
      if (i === scelta) { fissa = canzoni.length; }
      canzoni.push({
        titolo: typeof voce.titolo === 'string' ? voce.titolo : '',
        autore: typeof voce.autore === 'string' ? voce.autore : '',
        file: voce.file
      });
    }
    return {
      canzoni: canzoni,
      modo: intero && MODI.indexOf(letto.modo) !== -1 ? letto.modo : 'ordine',
      fissa: fissa
    };
  }

  var POLLO = ORIGINE ? (ORIGINE.getAttribute('data-pollo') || '') : '';
  var FRASI = leggiFrasi(ORIGINE ? ORIGINE.getAttribute('data-frasi') : '');
  var MUSICA = leggiCanzoni(ORIGINE ? ORIGINE.getAttribute('data-canzoni') : '');

  var memoria = '';
  var ultimoTasto = 0;
  var aperto = null;
  var caricando = false;
  var pista = null;
  var branoPista = '';

  function eCampoDiTesto(nodo) {
    if (!nodo || nodo.nodeType === 9) { return false; }
    var tag = String(nodo.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || nodo.isContentEditable === true;
  }

  function volumeSalvato() {
    var livello = VOLUME_BASE;
    try {
      var letti = JSON.parse(localStorage.getItem(CHIAVE_VOLUMI) || '{}') || {};
      var n = Number(letti.gioco);
      if (isFinite(n) && n >= 0 && n <= 100) { livello = n; }
    } catch (errore) { }
    return livello / 100;
  }

  function preparaPista() {
    if (pista) { return pista; }
    try {
      pista = new Audio();
      pista.loop = true;
      pista.preload = 'none';
    } catch (errore) {
      pista = null;
    }
    return pista;
  }

  function suCanzone(voce) {
    if (!aperto || !voce || typeof voce.file !== 'string' || voce.file.indexOf('mp3/') !== 0) {
      fermaPista();
      return;
    }
    var p = preparaPista();
    if (!p) { return; }
    try {
      if (branoPista !== voce.file) {
        branoPista = voce.file;
        p.src = voce.file;
      }
    } catch (errore) { return; }
    try { p.currentTime = 0; } catch (errore) { }
    p.volume = volumeSalvato();
    try {
      var promessa = p.play();
      if (promessa && typeof promessa.catch === 'function') { promessa.catch(function () { }); }
    } catch (errore) { }
  }

  function fermaPista() {
    if (!pista) { return; }
    try { pista.pause(); } catch (errore) { }
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

  function caricaStile(href, fatto) {
    if (document.querySelector('link[href="' + href + '"]')) { fatto(); return; }
    var nodo = document.createElement('link');
    nodo.rel = 'stylesheet';
    nodo.href = href;
    nodo.onload = fatto;
    nodo.onerror = fatto;
    document.head.appendChild(nodo);
  }

  function motorePronto() {
    return !!(window.PolloRun && typeof window.PolloRun.crea === 'function');
  }

  function conMotore(fatto) {
    var restanti = 2;
    var riuscito = true;
    function uno() {
      restanti--;
      if (restanti === 0) { fatto(riuscito && motorePronto()); }
    }
    caricaStile('css/pollorun.css', uno);
    if (motorePronto()) { uno(); return; }
    caricaScript('js/pollorun-gioco.js', function (ok) {
      if (!ok) { riuscito = false; }
      uno();
    });
  }

  function chiudi() {
    if (!aperto) { return false; }
    var stato = aperto;
    aperto = null;
    try { stato.gioco.ferma(); } catch (errore) { }
    if (stato.radice.parentNode) { stato.radice.parentNode.removeChild(stato.radice); }
    document.documentElement.classList.remove(CLASSE);
    fermaPista();
    if (stato.musicaSuonava && window.Musica && typeof window.Musica.parti === 'function') { window.Musica.parti(); }
    return true;
  }

  function monta() {
    var radice = document.createElement('div');
    radice.className = 'pollorun';
    radice.setAttribute('role', 'dialog');
    radice.setAttribute('aria-modal', 'true');
    radice.setAttribute('aria-label', 'Pollo Run');
    radice.tabIndex = -1;

    var bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'pollorun__chiudi';
    bottone.setAttribute('aria-label', 'Chiudi Pollo Run');
    bottone.textContent = '×';
    bottone.addEventListener('click', function () { chiudi(); });

    var tela = document.createElement('canvas');
    tela.className = 'pollorun__tela';
    tela.setAttribute('aria-hidden', 'true');

    radice.appendChild(bottone);
    radice.appendChild(tela);

    var stato = { radice: radice, gioco: null, musicaSuonava: false };
    aperto = stato;
    if (document.activeElement && typeof document.activeElement.blur === 'function') { document.activeElement.blur(); }
    document.body.appendChild(radice);
    document.documentElement.classList.add(CLASSE);
    stato.musicaSuonava = musicaDelSito();
    stato.gioco = window.PolloRun.crea({
      tela: tela,
      pollo: POLLO,
      frasi: FRASI,
      canzoni: MUSICA.canzoni.slice(),
      modo: MUSICA.modo,
      fissa: MUSICA.fissa,
      sipario: true,
      suCanzone: suCanzone,
      suPartita: function () { },
      suChiudi: chiudi
    });
    stato.gioco.avvia();
    try { radice.focus({ preventScroll: true }); } catch (errore) { }
  }

  function apri() {
    if (aperto || caricando) { return false; }
    caricando = true;
    conMotore(function (pronto) {
      caricando = false;
      if (!pronto || aperto) { return; }
      monta();
    });
    return true;
  }

  function suTasto(evento) {
    if (evento.defaultPrevented || evento.repeat || evento.isComposing) { return; }
    var tasto = evento.key;
    if (typeof tasto !== 'string') { return; }
    if (aperto) { memoria = ''; return; }
    if (tasto === 'Escape') {
      memoria = '';
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
    if (memoria === PAROLA.slice(0, 5)) { preparaPista(); }
    if (memoria === PAROLA) {
      memoria = '';
      apri();
    }
  }

  document.addEventListener('keydown', suTasto);
  window.addEventListener('pagehide', function () { chiudi(); });

  window.PolloRunSito = {
    parola: PAROLA,
    canzoni: MUSICA.canzoni,
    apri: apri,
    chiudi: chiudi,
    aperto: function () { return !!aperto; }
  };
}());
