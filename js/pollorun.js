(function () {
  'use strict';

  var PAROLA = 'pollorun';
  var PAUSA_MAX_MS = 2000;
  var MODI = ['fissa', 'ordine', 'caso'];
  var STILI = ['synthwave', 'geometrydash'];
  var RIPIEGO = { titolo: 'Back On Track', autore: 'DJVI', file: 'mp3/DJVI%20-%20Back%20On%20Track.mp3' };
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
    if (!canzoni.length) {
      return { canzoni: [{ titolo: RIPIEGO.titolo, autore: RIPIEGO.autore, file: RIPIEGO.file }], modo: 'ordine', fissa: 0 };
    }
    return {
      canzoni: canzoni,
      modo: intero && MODI.indexOf(letto.modo) !== -1 ? letto.modo : 'ordine',
      fissa: fissa
    };
  }

  function leggiStile(testo) {
    return STILI.indexOf(testo) !== -1 ? testo : STILI[0];
  }

  var POLLO = ORIGINE ? (ORIGINE.getAttribute('data-pollo') || '') : '';
  var FRASI = leggiFrasi(ORIGINE ? ORIGINE.getAttribute('data-frasi') : '');
  var MUSICA = leggiCanzoni(ORIGINE ? ORIGINE.getAttribute('data-canzoni') : '');
  var STILE = leggiStile(ORIGINE ? ORIGINE.getAttribute('data-stile') : '');

  var PESI = { stile: 5, pollo: 5, motore: 20, musica: 70 };
  var ATTESA_BRANO_MS = 90000;

  var memoria = '';
  var ultimoTasto = 0;
  var aperto = null;
  var carico = null;
  var attesaMotore = null;
  var pronti = {};
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
        p.src = pronti[voce.file] || voce.file;
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
    if (motorePronto()) { fatto(true); return; }
    if (attesaMotore) { attesaMotore.push(fatto); return; }
    attesaMotore = [fatto];
    caricaScript('js/pollorun-gioco.js', function (ok) {
      var attesi = attesaMotore;
      attesaMotore = null;
      for (var i = 0; i < attesi.length; i++) { attesi[i](ok && motorePronto()); }
    });
  }

  function dopo(fn, ms) {
    if (typeof setTimeout === 'function') { setTimeout(fn, ms); } else { fn(); }
  }

  function primoBrano() {
    var elenco = MUSICA.canzoni;
    if (!elenco.length) { return -1; }
    if (MUSICA.modo === 'fissa') { return MUSICA.fissa % elenco.length; }
    if (MUSICA.modo === 'caso') { return Math.floor(Math.random() * elenco.length); }
    return 0;
  }

  function scaricaBrano(file, suAvanzamento, fatto) {
    var puo = typeof XMLHttpRequest === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    if (!file || pronti[file] || !puo) { fatto(); return null; }
    var richiesta = new XMLHttpRequest();
    var chiuso = false;
    function chiudiCon() {
      if (chiuso) { return; }
      chiuso = true;
      fatto();
    }
    try {
      richiesta.open('GET', file, true);
      richiesta.responseType = 'blob';
      richiesta.timeout = ATTESA_BRANO_MS;
    } catch (errore) {
      chiudiCon();
      return null;
    }
    richiesta.onprogress = function (evento) {
      if (evento && evento.lengthComputable && evento.total > 0) { suAvanzamento(evento.loaded / evento.total); }
    };
    richiesta.onload = function () {
      if (richiesta.status >= 200 && richiesta.status < 300 && richiesta.response) {
        try { pronti[file] = URL.createObjectURL(richiesta.response); } catch (errore) { }
      }
      chiudiCon();
    };
    richiesta.onerror = chiudiCon;
    richiesta.ontimeout = chiudiCon;
    richiesta.onabort = chiudiCon;
    try { richiesta.send(); } catch (errore) { chiudiCon(); }
    return richiesta;
  }

  function mostraCarico() {
    var radice = document.createElement('div');
    radice.className = 'pollorun-carica';
    radice.setAttribute('role', 'dialog');
    radice.setAttribute('aria-modal', 'true');
    radice.setAttribute('aria-label', 'Caricamento di Pollo Run');
    radice.tabIndex = -1;

    var bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'pollorun-carica__chiudi';
    bottone.setAttribute('aria-label', 'Annulla il caricamento');
    bottone.textContent = '×';
    bottone.addEventListener('click', function () { annulla(); });

    var scena = document.createElement('div');
    scena.className = 'pollorun-carica__scena';

    if (POLLO) {
      var pollo = document.createElement('img');
      pollo.className = 'pollorun-carica__pollo';
      pollo.alt = '';
      pollo.src = POLLO;
      scena.appendChild(pollo);
      var ombra = document.createElement('span');
      ombra.className = 'pollorun-carica__ombra';
      ombra.setAttribute('aria-hidden', 'true');
      scena.appendChild(ombra);
    }

    var testo = document.createElement('p');
    testo.className = 'pollorun-carica__testo';
    testo.textContent = 'Caricamento in corso';

    var barra = document.createElement('div');
    barra.className = 'pollorun-carica__barra';
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-label', 'Caricamento di Pollo Run');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', '100');
    barra.setAttribute('aria-valuenow', '0');

    var riempi = document.createElement('div');
    riempi.className = 'pollorun-carica__riempi';
    barra.appendChild(riempi);

    var percento = document.createElement('p');
    percento.className = 'pollorun-carica__percento';
    percento.setAttribute('aria-hidden', 'true');
    percento.textContent = '0%';

    scena.appendChild(testo);
    scena.appendChild(barra);
    scena.appendChild(percento);
    radice.appendChild(bottone);
    radice.appendChild(scena);

    if (document.activeElement && typeof document.activeElement.blur === 'function') { document.activeElement.blur(); }
    document.body.appendChild(radice);
    document.documentElement.classList.add(CLASSE);
    try { radice.focus({ preventScroll: true }); } catch (errore) { }

    return { radice: radice, barra: barra, riempi: riempi, percento: percento, valore: 0 };
  }

  function segna(stato) {
    var totale = 0;
    var pesi = 0;
    for (var nome in PESI) {
      if (Object.prototype.hasOwnProperty.call(PESI, nome)) {
        totale += PESI[nome] * Math.max(0, Math.min(1, stato.parti[nome] || 0));
        pesi += PESI[nome];
      }
    }
    var valore = Math.floor(totale * 100 / pesi);
    if (valore >= 100 && !stato.tutto) { valore = 99; }
    if (valore < stato.vista.valore) { return; }
    stato.vista.valore = valore;
    stato.vista.percento.textContent = valore + '%';
    stato.vista.barra.setAttribute('aria-valuenow', String(valore));
    if (stato.vista.riempi.style) { stato.vista.riempi.style.width = valore + '%'; }
  }

  function togliCarico(stato) {
    if (stato.vista.radice.parentNode) { stato.vista.radice.parentNode.removeChild(stato.vista.radice); }
    if (!aperto) { document.documentElement.classList.remove(CLASSE); }
  }

  function annulla() {
    if (!carico) { return false; }
    var stato = carico;
    carico = null;
    stato.annullato = true;
    if (stato.richiesta) { try { stato.richiesta.abort(); } catch (errore) { } }
    togliCarico(stato);
    return true;
  }

  function avanza(stato, nome, frazione) {
    if (stato !== carico || stato.annullato) { return; }
    stato.parti[nome] = frazione;
    for (var chiave in PESI) {
      if (Object.prototype.hasOwnProperty.call(PESI, chiave) && (stato.parti[chiave] || 0) < 1) {
        segna(stato);
        return;
      }
    }
    if (stato.tutto) { return; }
    stato.tutto = true;
    segna(stato);
    if (!stato.motoreOk) {
      carico = null;
      togliCarico(stato);
      return;
    }
    dopo(function () {
      if (stato !== carico || stato.annullato) { return; }
      carico = null;
      togliCarico(stato);
      monta(stato.primo);
    }, 350);
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

  function monta(primo) {
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
      primaCanzone: typeof primo === 'number' ? primo : -1,
      stile: STILE,
      sipario: true,
      suCanzone: suCanzone,
      suPartita: function () { },
      suChiudi: chiudi
    });
    stato.gioco.avvia();
    try { radice.focus({ preventScroll: true }); } catch (errore) { }
  }

  function apri() {
    if (aperto || carico) { return false; }
    var primo = primoBrano();
    var brano = primo >= 0 ? MUSICA.canzoni[primo].file : '';
    var stato = { vista: null, parti: { stile: 0, pollo: 0, motore: 0, musica: 0 }, tutto: false, annullato: false, motoreOk: false, richiesta: null, primo: primo };
    carico = stato;
    stato.vista = mostraCarico();

    caricaStile('css/pollorun.css', function () { avanza(stato, 'stile', 1); });

    if (POLLO && typeof Image === 'function') {
      var immagine = new Image();
      immagine.onload = function () { avanza(stato, 'pollo', 1); };
      immagine.onerror = function () { avanza(stato, 'pollo', 1); };
      immagine.src = POLLO;
    } else {
      avanza(stato, 'pollo', 1);
    }

    stato.richiesta = scaricaBrano(brano, function (frazione) {
      avanza(stato, 'musica', Math.min(0.99, frazione));
    }, function () {
      stato.richiesta = null;
      avanza(stato, 'musica', 1);
    });

    conMotore(function (pronto) {
      stato.motoreOk = !!pronto;
      avanza(stato, 'motore', 1);
    });
    return true;
  }

  function suTasto(evento) {
    if (evento.defaultPrevented || evento.repeat || evento.isComposing) { return; }
    var tasto = evento.key;
    if (typeof tasto !== 'string') { return; }
    if (aperto) { memoria = ''; return; }
    if (carico) {
      memoria = '';
      if (tasto === 'Escape') { annulla(); }
      return;
    }
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
  window.addEventListener('pagehide', function () { annulla(); chiudi(); });

  window.PolloRunSito = {
    parola: PAROLA,
    canzoni: MUSICA.canzoni,
    apri: apri,
    chiudi: chiudi,
    annulla: annulla,
    aperto: function () { return !!aperto; },
    caricando: function () { return !!carico; }
  };
}());
