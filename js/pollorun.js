(function () {
  'use strict';

  var PAROLA = 'pollorun';
  var PAUSA_MAX_MS = 2000;
  var MODI = ['fissa', 'ordine', 'caso'];
  var STILI = ['synthwave', 'geometrydash'];
  var NOMI_DIFFICOLTA = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile', estremo: 'Estremo' };
  var RIPIEGO = { titolo: 'Back On Track', autore: 'DJVI', file: 'mp3/DJVI%20-%20Back%20On%20Track.mp3' };
  var VOLUME_BASE = 30;
  var PASSO_VOLUME = 5;
  var TASTI_VOLUME = ['Escape', 'Tab', '-', '_', '+', '=', 'm', 'M'];
  var CHIAVE_VOLUMI = 'sb-manutenzione-volumi';
  var CLASSE = 'is-pollorun';
  var ORIGINE = document.currentScript;
  var CHIAVE_TOKEN = 'sb-account-token';

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
  var CLASSIFICA = !!ORIGINE && ORIGINE.getAttribute('data-classifica') === '1';

  var PESI = { stile: 5, pollo: 5, motore: 20, musica: 70 };
  var ATTESA_BRANO_MS = 90000;
  var DURATA_MINIMA_MS = 3000;
  var PAUSA_AL_CENTO_MS = 500;

  var memoria = '';
  var ultimoTasto = 0;
  var aperto = null;
  var carico = null;
  var attesaMotore = null;
  var pronti = {};
  var pista = null;
  var branoPista = '';
  var ascoltoAccount = false;

  function eCampoDiTesto(nodo) {
    if (!nodo || nodo.nodeType === 9) { return false; }
    var tag = String(nodo.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || nodo.isContentEditable === true;
  }

  function leggiVolumi() {
    try {
      var letti = JSON.parse(localStorage.getItem(CHIAVE_VOLUMI) || '{}');
      return letti && typeof letti === 'object' && !Array.isArray(letti) ? letti : {};
    } catch (errore) {
      return {};
    }
  }

  function livelloSalvato() {
    var n = Number(leggiVolumi().gioco);
    return isFinite(n) && n >= 0 && n <= 100 ? n : VOLUME_BASE;
  }

  function salvaLivello(livello) {
    var dati = leggiVolumi();
    dati.gioco = livello;
    try { localStorage.setItem(CHIAVE_VOLUMI, JSON.stringify(dati)); } catch (errore) { }
  }

  function volumeAttuale() {
    return (aperto ? aperto.livello : livelloSalvato()) / 100;
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
    p.volume = volumeAttuale();
    try {
      var promessa = p.play();
      if (promessa) { promessa.catch(function () { }); }
    } catch (errore) { }
  }

  function fermaPista() {
    if (!pista) { return; }
    try { pista.pause(); } catch (errore) { }
  }

  function musicaDelSito() {
    var suonava = false;
    var raccogli = true;
    if (window.Musica) {
      try {
        window.Musica.suStato(function (situazione) {
          if (raccogli) { suonava = !!(situazione && situazione.suona); }
        });
      } catch (errore) { }
    }
    raccogli = false;
    if (suonava) { window.Musica.ferma(); }
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
    return !!(window.PolloRun && window.PolloRun.crea);
  }

  function conMotore(fatto) {
    if (motorePronto() && (!CLASSIFICA || window.PolloRunPodio)) { fatto(true); return; }
    if (attesaMotore) { attesaMotore.push(fatto); return; }
    attesaMotore = [fatto];
    function avvisa(ok) {
      var attesi = attesaMotore;
      attesaMotore = null;
      for (var i = 0; i < attesi.length; i++) { attesi[i](ok && motorePronto()); }
    }
    if (motorePronto()) {
      caricaScript('js/pollorun-podio.js', function () { avvisa(true); });
      return;
    }
    caricaScript('js/pollorun-gioco.js', function (ok) {
      if (!ok) { avvisa(false); return; }
      caricaScript('js/pollorun-caduta.js', function () {
        if (!CLASSIFICA) { avvisa(true); return; }
        caricaScript('js/pollorun-podio.js', function () { avvisa(true); });
      });
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

    if (document.activeElement) { document.activeElement.blur(); }
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
    stato.obiettivo = Math.max(stato.obiettivo || 0, valore);
    if (typeof setInterval !== 'function') {
      mostra(stato, stato.obiettivo);
      return;
    }
    scorri(stato);
  }

  function mostra(stato, quanto) {
    var valore = Math.floor(quanto);
    if (valore <= stato.vista.valore) { return; }
    stato.vista.valore = valore;
    stato.vista.percento.textContent = valore + '%';
    stato.vista.barra.setAttribute('aria-valuenow', String(valore));
    if (stato.vista.riempi.style) { stato.vista.riempi.style.width = valore + '%'; }
  }

  function scorri(stato) {
    if (stato.orologio) { return; }
    var ultimo = Date.now();
    stato.mostrato = stato.mostrato || 0;
    stato.orologio = setInterval(function () {
      if (stato !== carico || stato.annullato) {
        clearInterval(stato.orologio);
        stato.orologio = null;
        return;
      }
      var adesso = Date.now();
      stato.mostrato = Math.min(stato.obiettivo, stato.mostrato + (adesso - ultimo) * 100 / DURATA_MINIMA_MS);
      ultimo = adesso;
      mostra(stato, stato.mostrato);
      if (stato.tutto && stato.mostrato >= 100) {
        clearInterval(stato.orologio);
        stato.orologio = null;
        dopo(function () { entra(stato); }, PAUSA_AL_CENTO_MS);
      }
    }, 40);
  }

  function entra(stato) {
    if (stato !== carico || stato.annullato) { return; }
    carico = null;
    togliCarico(stato);
    monta(stato.primo);
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
    if (stato.orologio) { clearInterval(stato.orologio); stato.orologio = null; }
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
      if (stato.orologio) { clearInterval(stato.orologio); stato.orologio = null; }
      carico = null;
      togliCarico(stato);
      return;
    }
    if (typeof setInterval !== 'function') { entra(stato); }
  }

  function chiudi() {
    if (!aperto) { return false; }
    var stato = aperto;
    if (stato.classifica && stato.classifica.progressoInAttesa) { mandaProgresso(stato, null); }
    aperto = null;
    if (stato.podio) { stato.podio.togli(); }
    try { stato.gioco.ferma(); } catch (errore) { }
    if (stato.radice.parentNode) { stato.radice.parentNode.removeChild(stato.radice); }
    document.documentElement.classList.remove(CLASSE);
    fermaPista();
    if (stato.musicaSuonava && window.Musica) { window.Musica.parti(); }
    return true;
  }

  function svg(classe, tracce) {
    if (typeof document.createElementNS !== 'function') { return null; }
    var spazio = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');
    var icona = document.createElementNS(spazio, 'svg');
    icona.setAttribute('class', classe);
    icona.setAttribute('viewBox', '0 0 24 24');
    icona.setAttribute('fill', 'none');
    icona.setAttribute('stroke', 'currentColor');
    icona.setAttribute('stroke-width', '1.75');
    icona.setAttribute('stroke-linecap', 'round');
    icona.setAttribute('stroke-linejoin', 'round');
    icona.setAttribute('aria-hidden', 'true');
    icona.setAttribute('focusable', 'false');
    for (var i = 0; i < tracce.length; i++) {
      var traccia = document.createElementNS(spazio, 'path');
      traccia.setAttribute('d', tracce[i][1]);
      if (tracce[i][0]) { traccia.setAttribute('class', tracce[i][0]); }
      icona.appendChild(traccia);
    }
    return icona;
  }

  function altoparlante() {
    return svg('pollorun__icona', [
      ['', 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z'],
      ['pollorun__onde', 'M15.5 9a4 4 0 0 1 0 6'],
      ['pollorun__onde', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
      ['pollorun__zitto', 'M15.5 9.5l5 5'],
      ['pollorun__zitto', 'M20.5 9.5l-5 5']
    ]);
  }

  function limita(n) {
    var tondo = Math.round(Number(n));
    return isFinite(tondo) ? Math.min(100, Math.max(0, tondo)) : VOLUME_BASE;
  }

  function mostraVolume(stato) {
    var v = stato.volume;
    var testo = String(stato.livello);
    var muto = stato.livello === 0;
    v.cursore.value = testo;
    v.cursore.setAttribute('aria-valuetext', muto ? 'muto' : testo + ' su 100');
    v.valore.value = testo;
    v.valore.textContent = testo;
    v.scatola.className = 'pollorun__volume' + (muto ? ' is-muto' : '');
    v.muto.setAttribute('aria-pressed', muto ? 'true' : 'false');
    v.muto.textContent = muto ? "Riattiva l'audio" : 'Muto';
    v.regola.setAttribute('aria-label', 'Regola il volume, ora ' + (muto ? 'muto' : testo));
  }

  function impostaVolume(livello, avvisa) {
    if (!aperto) { return false; }
    var stato = aperto;
    stato.livello = limita(livello);
    if (stato.livello > 0) { stato.udibile = stato.livello; }
    if (pista) { pista.volume = stato.livello / 100; }
    salvaLivello(stato.livello);
    mostraVolume(stato);
    if (avvisa && stato.volume.pannello.hidden) { avvisaVolume(stato); }
    return true;
  }

  function avvisaVolume(stato) {
    var avviso = stato.volume.avviso;
    avviso.textContent = stato.livello === 0 ? 'Volume: muto' : 'Volume: ' + stato.livello;
    avviso.className = 'pollorun__avviso is-visibile';
    var giro = ++stato.volume.giro;
    dopo(function () {
      if (giro === stato.volume.giro) { avviso.className = 'pollorun__avviso'; }
    }, 1400);
  }

  function zittisci() {
    if (!aperto) { return false; }
    return impostaVolume(aperto.livello > 0 ? 0 : (aperto.udibile || VOLUME_BASE), true);
  }

  function apriVolume(apri) {
    if (!aperto) { return false; }
    var v = aperto.volume;
    v.pannello.hidden = !apri;
    if (apri) {
      v.giro++;
      v.avviso.className = 'pollorun__avviso';
    }
    v.regola.setAttribute('aria-expanded', apri ? 'true' : 'false');
    return true;
  }

  function volumeDaTasto(evento) {
    var tasto = evento.key;
    var v = aperto.volume;
    if (tasto === 'Escape') {
      if (v.pannello.hidden) { return; }
      apriVolume(false);
      try { v.regola.focus({ preventScroll: true }); } catch (errore) { }
      evento.preventDefault();
      if (typeof evento.stopImmediatePropagation === 'function') { evento.stopImmediatePropagation(); }
      return;
    }
    if (evento.ctrlKey || evento.altKey || evento.metaKey || evento.isComposing) { return; }
    if (evento.target !== v.cursore && eCampoDiTesto(evento.target)) { return; }
    if (tasto === '-' || tasto === '_') {
      impostaVolume(aperto.livello - PASSO_VOLUME, true);
    } else if (tasto === '+' || tasto === '=') {
      impostaVolume(aperto.livello + PASSO_VOLUME, true);
    } else if ((tasto === 'm' || tasto === 'M') && !evento.repeat) {
      zittisci();
    } else {
      return;
    }
    evento.preventDefault();
  }

  function creaVolume(stato) {
    var scatola = document.createElement('div');
    scatola.className = 'pollorun__volume';

    var regola = document.createElement('button');
    regola.type = 'button';
    regola.className = 'pollorun__regola';
    regola.setAttribute('aria-expanded', 'false');
    regola.setAttribute('aria-controls', 'pollorun-volumi');
    regola.setAttribute('title', 'Volume');
    var icona = altoparlante();
    if (icona) { regola.appendChild(icona); } else { regola.textContent = '\u266A'; }

    var pannello = document.createElement('div');
    pannello.className = 'pollorun__volumi';
    pannello.id = 'pollorun-volumi';
    pannello.setAttribute('role', 'group');
    pannello.setAttribute('aria-label', 'Volume della canzone');
    pannello.hidden = true;

    var etichetta = document.createElement('label');
    etichetta.className = 'pollorun__cursore';
    etichetta.setAttribute('for', 'pollorun-vol');
    var nome = document.createElement('span');
    nome.className = 'pollorun__cursore-nome';
    nome.textContent = 'Volume';

    var cursore = document.createElement('input');
    cursore.type = 'range';
    cursore.id = 'pollorun-vol';
    cursore.min = '0';
    cursore.max = '100';
    cursore.step = '1';

    var valore = document.createElement('output');
    valore.className = 'pollorun__cursore-valore';
    valore.setAttribute('for', 'pollorun-vol');

    etichetta.appendChild(nome);
    etichetta.appendChild(valore);
    etichetta.appendChild(cursore);

    var muto = document.createElement('button');
    muto.type = 'button';
    muto.className = 'pollorun__muto';

    var aiuto = document.createElement('p');
    aiuto.className = 'pollorun__aiuto';
    aiuto.textContent = 'Volume con - e +, M per il muto';

    pannello.appendChild(etichetta);
    pannello.appendChild(muto);
    pannello.appendChild(aiuto);

    var avviso = document.createElement('p');
    avviso.className = 'pollorun__avviso';
    avviso.setAttribute('role', 'status');
    avviso.setAttribute('aria-live', 'polite');

    scatola.appendChild(regola);
    scatola.appendChild(pannello);
    scatola.appendChild(avviso);

    regola.addEventListener('click', function () { apriVolume(pannello.hidden); });
    muto.addEventListener('click', function () { zittisci(); });
    cursore.addEventListener('input', function () { impostaVolume(cursore.value, false); });
    scatola.addEventListener('pointerdown', function (evento) { evento.stopPropagation(); });
    scatola.addEventListener('keydown', function (evento) {
      if (TASTI_VOLUME.indexOf(evento.key) !== -1) { return; }
      evento.stopPropagation();
    });
    stato.radice.addEventListener('pointerdown', function () {
      if (aperto === stato && !pannello.hidden) { apriVolume(false); }
    });

    stato.volume = { scatola: scatola, regola: regola, pannello: pannello, cursore: cursore, valore: valore, muto: muto, avviso: avviso, giro: 0 };
    return scatola;
  }

  function leggiToken() {
    try { return String(sessionStorage.getItem(CHIAVE_TOKEN) || ''); } catch (errore) { return ''; }
  }

  function account() {
    var a = window.Account;
    return a && a.attivo === true && typeof a.entra === 'function' ? a : null;
  }

  function chiamaApi(metodo, indirizzo, token, corpo) {
    var richiesta = { method: metodo, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, credentials: 'same-origin', cache: 'no-store' };
    if (corpo) {
      richiesta.headers['Content-Type'] = 'application/json';
      richiesta.body = JSON.stringify(corpo);
    }
    var promessa;
    try { promessa = fetch(indirizzo, richiesta); } catch (errore) { promessa = null; }
    if (!promessa || typeof promessa.then !== 'function') { return null; }
    return promessa.then(function (risposta) {
      var codice = risposta && typeof risposta.status === 'number' ? risposta.status : 0;
      var lettura = null;
      try { lettura = risposta.json(); } catch (errore) { lettura = null; }
      if (!lettura || typeof lettura.then !== 'function') { return { codice: codice, dati: {} }; }
      return lettura.then(function (dati) {
        return { codice: codice, dati: dati && typeof dati === 'object' ? dati : {} };
      }, function () {
        return { codice: codice, dati: {} };
      });
    }, function () {
      return { codice: 0, dati: {} };
    });
  }

  function messaggioErrore(esito) {
    var dati = esito.dati || {};
    if (esito.codice === 409 && dati.codice === 'SERVE_PRECEDENTE' && Number(dati.serve) >= 1) {
      return 'Per entrare in classifica completa prima il livello ' + Math.floor(Number(dati.serve)) + ' a questa difficoltà';
    }
    if (typeof dati.errore === 'string' && dati.errore.trim()) { return dati.errore.trim().slice(0, 160); }
    if (esito.codice === 401) { return 'Accesso scaduto: entra di nuovo con Twitch per la classifica'; }
    if (esito.codice === 403) { return 'Non puoi entrare in classifica'; }
    if (esito.codice === 409) { return 'Per entrare in classifica completa prima il livello precedente a questa difficoltà'; }
    if (esito.codice === 422) { return 'Questo livello non entra in classifica'; }
    if (esito.codice === 429) { return "Troppe partite di fila, riprova tra un po'"; }
    return 'La classifica ora non risponde: il gioco continua lo stesso';
  }

  function avvisaClassifica(stato, testo) {
    var cl = stato.classifica;
    if (!cl || aperto !== stato) { return; }
    cl.avviso.textContent = testo;
    cl.avviso.className = 'pollorun__classifica-avviso is-visibile';
    var giro = ++cl.giro;
    dopo(function () {
      if (giro === cl.giro) { cl.avviso.className = 'pollorun__classifica-avviso'; }
    }, 4200);
  }

  function dipingiClassifica(stato) {
    var cl = stato.classifica;
    if (!cl) { return; }
    if (stato.podio) { stato.podio.bottone.parentNode.hidden = cl.spenta; }
    if (cl.spenta) {
      cl.scatola.hidden = true;
      return;
    }
    if (cl.collegato === true) {
      cl.scatola.hidden = false;
      cl.pillola.className = 'pollorun__pillola is-collegato';
      cl.pillola.disabled = true;
      cl.pillola.textContent = 'Classifica: giochi come ' + (cl.nome || 'te');
      return;
    }
    if (cl.collegato === null) {
      cl.scatola.hidden = false;
      cl.pillola.className = 'pollorun__pillola is-attesa';
      cl.pillola.disabled = true;
      cl.pillola.textContent = 'Classifica...';
      return;
    }
    cl.scatola.hidden = !account();
    cl.pillola.className = 'pollorun__pillola';
    cl.pillola.disabled = false;
    cl.pillola.textContent = 'Entra con Twitch per la classifica';
  }

  function chiediChiSei(stato) {
    var cl = stato.classifica;
    var token = leggiToken();
    cl.token = token;
    cl.partita = null;
    cl.io = null;
    cl.inviati = '';
    cl.confermate = [];
    if (!token) {
      cl.collegato = false;
      dipingiClassifica(stato);
      return;
    }
    cl.collegato = null;
    dipingiClassifica(stato);
    var giro = ++cl.chiesto;
    var promessa = chiamaApi('GET', 'api/classifica/io', token, null);
    if (!promessa) {
      cl.collegato = false;
      dipingiClassifica(stato);
      return;
    }
    promessa.then(function (esito) {
      if (aperto !== stato || giro !== cl.chiesto) { return; }
      if (esito.codice === 404) { cl.spenta = true; }
      var dati = esito.dati || {};
      cl.collegato = esito.codice === 200 && dati.collegato === true;
      cl.nome = cl.collegato ? String(dati.nome || dati.login || '').slice(0, 40) : '';
      cl.io = cl.collegato && typeof dati.login === 'string' ? { login: dati.login, migliori: dati.migliori && typeof dati.migliori === 'object' ? dati.migliori : {} } : null;
      dipingiClassifica(stato);
      if (cl.collegato) { sincronizzaLivelli(stato, dati.partenze); }
    });
  }

  function testoSpostato(cambiate) {
    var pezzi = [];
    for (var i = 0; i < cambiate.length; i++) {
      pezzi.push('a ' + NOMI_DIFFICOLTA[cambiate[i].difficolta] + (i === 0 ? ' ora riparti dal livello ' : ' dal ') + cambiate[i].livello);
    }
    return 'Livello spostato: ' + pezzi.join(', ');
  }

  function sincronizzaLivelli(stato, partenze) {
    var g = stato.gioco;
    if (!g || typeof g.partenze !== 'function') { return; }
    var esito = null;
    try { esito = g.partenze(partenze); } catch (errore) { esito = null; }
    if (!esito) { return; }
    if (esito.cambiate && esito.cambiate.length) { avvisaClassifica(stato, testoSpostato(esito.cambiate)); }
    mandaProgresso(stato, esito.applicate);
  }

  function mandaProgresso(stato, applicate) {
    var cl = stato.classifica;
    if (!cl) { return; }
    cl.progressoInAttesa = false;
    if (cl.spenta || !cl.token || cl.collegato !== true || aperto !== stato) { return; }
    var g = stato.gioco;
    var livelli = {};
    try { livelli = g && typeof g.raggiunti === 'function' ? g.raggiunti() : {}; } catch (errore) { livelli = {}; }
    var corpo = { livelli: livelli && typeof livelli === 'object' ? livelli : {} };
    if (applicate && applicate.length) { corpo.applicate = applicate.slice(0, 8); }
    if (!Object.keys(corpo.livelli).length && !corpo.applicate) { return; }
    var nuove = (corpo.applicate || []).some(function (v) { return cl.confermate.indexOf(v) === -1; });
    if (JSON.stringify(corpo.livelli) === cl.inviati && !nuove) { return; }
    cl.inviati = JSON.stringify(corpo.livelli);
    cl.confermate = cl.confermate.concat(corpo.applicate || []).slice(-20);
    var promessa = chiamaApi('POST', 'api/classifica/progresso', cl.token, corpo);
    if (!promessa) { cl.inviati = ''; cl.confermate = []; return; }
    promessa.then(function (esito) {
      if (esito.codice !== 200) { cl.inviati = ''; cl.confermate = []; }
    });
  }

  function suRaggiunto(stato) {
    var cl = stato.classifica;
    if (!cl) { return; }
    cl.progressoInAttesa = true;
    var giro = ++cl.giroProgresso;
    dopo(function () {
      if (giro === cl.giroProgresso && cl.progressoInAttesa) { mandaProgresso(stato, null); }
    }, 1500);
  }

  function scaduto(stato) {
    var cl = stato.classifica;
    cl.collegato = false;
    cl.nome = '';
    cl.partita = null;
    cl.io = null;
    dipingiClassifica(stato);
  }

  function gestisciErrore(stato, esito) {
    if (esito.codice === 404) {
      stato.classifica.spenta = true;
      dipingiClassifica(stato);
      return;
    }
    if (esito.codice === 401) { scaduto(stato); }
    avvisaClassifica(stato, messaggioErrore(esito));
  }

  function mandaLivello(stato, partita, evento) {
    var cl = stato.classifica;
    var promessa = chiamaApi('POST', 'api/classifica/livello', cl.token, { partita: partita.gettone, tentativi: Math.max(1, Math.floor(Number(evento.tentativi)) || 1) });
    if (!promessa) { return; }
    promessa.then(function (esito) {
      if (aperto !== stato) { return; }
      if (esito.codice !== 200) { gestisciErrore(stato, esito); return; }
      var dati = esito.dati || {};
      var fatta = dati.difficolta || evento.difficolta;
      var cl = stato.classifica;
      if (cl.io && Number(dati.livello) > (Number(cl.io.migliori[fatta]) || 0)) { cl.io.migliori[fatta] = Number(dati.livello); }
      if (stato.podio) { stato.podio.scordati(fatta); }
      if (stato.gioco && typeof stato.gioco.classifica === 'function') {
        try {
          stato.gioco.classifica({ posizione: dati.posizione, totale: dati.totale, migliore: dati.migliore === true, livello: dati.livello || evento.livello, difficolta: dati.difficolta || evento.difficolta });
        } catch (errore) { }
      }
    });
  }

  function suLivello(stato, evento) {
    var cl = stato.classifica;
    if (!cl || cl.spenta || !evento || aperto !== stato) { return; }
    if (!cl.token || cl.collegato === false) { return; }
    var chiave = evento.livello + ':' + evento.difficolta;
    if (evento.tipo === 'inizio') {
      var partita = { chiave: chiave, gettone: '', fine: null, chiusa: false };
      cl.partita = partita;
      var promessa = chiamaApi('POST', 'api/classifica/partita', cl.token, { livello: evento.livello, difficolta: evento.difficolta });
      if (!promessa) { return; }
      promessa.then(function (esito) {
        if (aperto !== stato || cl.partita !== partita) { return; }
        if (esito.codice !== 200 || !esito.dati || typeof esito.dati.partita !== 'string') {
          cl.partita = null;
          gestisciErrore(stato, esito);
          return;
        }
        partita.gettone = esito.dati.partita;
        if (partita.fine) {
          cl.partita = null;
          mandaLivello(stato, partita, partita.fine);
        }
      });
      return;
    }
    if (evento.tipo === 'fine') {
      var aperta = cl.partita;
      if (!aperta || aperta.chiave !== chiave) { return; }
      if (!aperta.gettone) {
        aperta.fine = evento;
        return;
      }
      cl.partita = null;
      mandaLivello(stato, aperta, evento);
    }
  }

  function creaClassifica(stato) {
    var scatola = document.createElement('div');
    scatola.className = 'pollorun__classifica';
    var pillola = document.createElement('button');
    pillola.type = 'button';
    pillola.className = 'pollorun__pillola';
    var avviso = document.createElement('p');
    avviso.className = 'pollorun__classifica-avviso';
    avviso.setAttribute('role', 'status');
    avviso.setAttribute('aria-live', 'polite');
    scatola.appendChild(avviso);
    scatola.appendChild(pillola);
    scatola.addEventListener('pointerdown', function (evento) { evento.stopPropagation(); });
    scatola.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') { return; }
      evento.stopPropagation();
    });
    pillola.addEventListener('click', function () {
      var cl = stato.classifica;
      var a = account();
      if (!cl || cl.collegato !== false || !a) { return; }
      try { a.entra(); } catch (errore) { }
      try { stato.radice.focus({ preventScroll: true }); } catch (errore) { }
    });
    stato.classifica = { scatola: scatola, pillola: pillola, avviso: avviso, giro: 0, chiesto: 0, token: '', collegato: false, nome: '', partita: null, spenta: false, io: null, inviati: '', confermate: [], progressoInAttesa: false, giroProgresso: 0 };
    var a = account();
    if (a && typeof a.suStato === 'function' && !ascoltoAccount) {
      ascoltoAccount = true;
      var pronto = false;
      try {
        a.suStato(function (situazione) {
          if (!pronto || !aperto || !aperto.classifica) { return; }
          var token = leggiToken();
          var collegato = !!(situazione && situazione.collegato);
          if (token !== aperto.classifica.token || (collegato && aperto.classifica.collegato === false)) { chiediChiSei(aperto); }
        });
      } catch (errore) { }
      pronto = true;
    }
    return scatola;
  }

  function creaPodio(stato) {
    if (!window.PolloRunPodio || typeof window.PolloRunPodio.crea !== 'function') { return null; }
    var scatola = document.createElement('div');
    scatola.className = 'pollorun__podio';
    stato.podio = window.PolloRunPodio.crea({
      dentro: stato.radice,
      fuoco: stato.radice,
      conTesto: true,
      gioco: function () { return stato.gioco; },
      io: function () { return stato.classifica ? stato.classifica.io : null; }
    });
    scatola.appendChild(stato.podio.bottone);
    return scatola;
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

    var livello = limita(livelloSalvato());
    var stato = { radice: radice, gioco: null, musicaSuonava: false, volume: null, livello: livello, udibile: livello > 0 ? livello : VOLUME_BASE, classifica: null, podio: null };
    var volume = creaVolume(stato);

    radice.appendChild(bottone);
    radice.appendChild(volume);
    radice.appendChild(tela);
    var ingombro = [bottone, volume];

    aperto = stato;
    if (CLASSIFICA) {
      var podio = creaPodio(stato);
      if (podio) {
        radice.appendChild(podio);
        ingombro.push(podio);
      }
      var classifica = creaClassifica(stato);
      radice.appendChild(classifica);
      ingombro.push(classifica);
      chiediChiSei(stato);
    }
    mostraVolume(stato);
    if (document.activeElement) { document.activeElement.blur(); }
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
      suChiudi: chiudi,
      ingombro: ingombro,
      suLivello: CLASSIFICA ? function (evento) { suLivello(stato, evento); } : undefined,
      suRaggiunto: CLASSIFICA ? function () { suRaggiunto(stato); } : undefined
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

    caricaStile('css/pollorun.css', function () {
      if (!CLASSIFICA) { avanza(stato, 'stile', 1); return; }
      caricaStile('css/pollorun-podio.css', function () { avanza(stato, 'stile', 1); });
    });

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
    if (evento.defaultPrevented || typeof evento.key !== 'string') { return; }
    if (aperto) { memoria = ''; volumeDaTasto(evento); return; }
    if (evento.repeat || evento.isComposing) { return; }
    var tasto = evento.key;
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
    volume: function () { return aperto ? aperto.livello : limita(livelloSalvato()); },
    impostaVolume: function (livello) { return impostaVolume(livello, false); },
    zittisci: zittisci,
    caricando: function () { return !!carico; }
  };
}());
