(function () {
  'use strict';
  var tela = document.getElementById('mnt-gioco');
  if (!tela || !window.PolloRun || typeof window.PolloRun.crea !== 'function') { return; }
  var frasi = [];
  try { frasi = JSON.parse(tela.getAttribute('data-frasi') || '[]'); } catch (e) { frasi = []; }
  var musica = null;
  try { musica = JSON.parse(tela.getAttribute('data-canzoni') || 'null'); } catch (e) { musica = null; }
  var intero = !!musica && typeof musica === 'object' && !Array.isArray(musica);
  var elenco = Array.isArray(musica) ? musica : (intero && Array.isArray(musica.canzoni) ? musica.canzoni : []);
  var scelta = intero ? Number(musica.fissa) : 0;
  var canzoni = [];
  var fissa = 0;
  for (var i = 0; i < elenco.length; i++) {
    var voce = elenco[i];
    if (!voce || typeof voce.file !== 'string' || voce.file.indexOf('mp3/') !== 0) { continue; }
    if (i === scelta) { fissa = canzoni.length; }
    canzoni.push({ titolo: typeof voce.titolo === 'string' ? voce.titolo : '', autore: typeof voce.autore === 'string' ? voce.autore : '', file: voce.file });
  }
  var modo = intero && (musica.modo === 'fissa' || musica.modo === 'ordine' || musica.modo === 'caso') ? musica.modo : 'ordine';
  if (!canzoni.length) {
    canzoni = [{ titolo: 'Back On Track', autore: 'DJVI', file: 'mp3/DJVI%20-%20Back%20On%20Track.mp3' }];
    modo = 'ordine';
    fissa = 0;
  }
  var stile = tela.getAttribute('data-stile') === 'geometrydash' ? 'geometrydash' : 'synthwave';
  window.PolloRun.crea({
    tela: tela,
    pollo: tela.getAttribute('data-pollo') || '',
    frasi: Array.isArray(frasi) ? frasi : [],
    canzoni: canzoni,
    modo: modo,
    fissa: fissa,
    stile: stile,
    suCanzone: function (voce) {
      var file = voce && typeof voce.file === 'string' && voce.file.indexOf('mp3/') === 0 ? voce.file : '';
      try { document.dispatchEvent(new CustomEvent('sb:canzone', { detail: { file: file } })); } catch (e) { }
    },
    suPartita: function (attiva) {
      document.body.classList.toggle('is-gioca', attiva);
      try { document.dispatchEvent(new CustomEvent('sb:gioco', { detail: { attivo: attiva } })); } catch (e) { }
    }
  }).avvia();
}());

(function () {
  'use strict';
  var CHIAVE = 'sb-guardia-ricaricato';
  var anteprima = location.pathname.indexOf('/api/') === 0;
  var inCorso = false;
  function giaRicaricato(timbro) {
    try { return sessionStorage.getItem(CHIAVE) === timbro; } catch (e) { return false; }
  }
  function ricorda(timbro) {
    try { sessionStorage.setItem(CHIAVE, timbro); } catch (e) { }
  }
  function controlla() {
    if (anteprima || inCorso || typeof window.fetch !== 'function') { return; }
    inCorso = true;
    fetch('stato-sito.json?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (risposta) { return risposta.ok ? risposta.json() : null; })
      .then(function (stato) {
        inCorso = false;
        if (!stato || stato.manutenzione !== false) { return; }
        var timbro = String(stato.pubblicatoIl || '');
        if (giaRicaricato(timbro)) { return; }
        ricorda(timbro);
        location.reload();
      })
      .catch(function () { inCorso = false; });
  }
  setInterval(controlla, 30000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { controlla(); }
  });
  window.addEventListener('pageshow', controlla);

  var audio = document.getElementById('mnt-audio');
  var brano = document.getElementById('mnt-audio-gioco');
  var tasto = document.getElementById('mnt-musica');
  if (audio && tasto) {
    var CHIAVE_MUSICA = 'sb-manutenzione-musica';
    var spenta = false;
    var corrente = audio;
    var branoRotto = !brano;
    var inGioco = false;
    var canzoneAttiva = false;
    var branoFile = brano ? (brano.getAttribute('src') || '') : '';
    try { spenta = sessionStorage.getItem(CHIAVE_MUSICA) === 'no'; } catch (e) { }
    var CHIAVE_VOLUMI = 'sb-manutenzione-volumi';
    var scatola = document.getElementById('mnt-audio-box') || tasto;
    var regola = document.getElementById('mnt-regola');
    var pannello = document.getElementById('mnt-volumi');
    var cursori = {
      attesa: { input: document.getElementById('mnt-vol-attesa'), valore: document.getElementById('mnt-vol-attesa-valore'), audio: audio, base: 20 },
      gioco: { input: document.getElementById('mnt-vol-gioco'), valore: document.getElementById('mnt-vol-gioco-valore'), audio: brano, base: 30 }
    };
    var salvati = {};
    try { salvati = JSON.parse(localStorage.getItem(CHIAVE_VOLUMI) || '{}') || {}; } catch (e) { salvati = {}; }
    var salvaVolumi = function () {
      var dati = {};
      Object.keys(cursori).forEach(function (nome) { dati[nome] = cursori[nome].livello; });
      try { localStorage.setItem(CHIAVE_VOLUMI, JSON.stringify(dati)); } catch (e) { }
    };
    Object.keys(cursori).forEach(function (nome) {
      var c = cursori[nome];
      var letto = Number(salvati[nome]);
      c.livello = isFinite(letto) && letto >= 0 && letto <= 100 ? Math.round(letto) : c.base;
      var applica = function () {
        if (c.audio) { c.audio.volume = c.livello / 100; }
        if (c.valore) { c.valore.textContent = String(c.livello); }
        if (c.input) { c.input.value = String(c.livello); }
      };
      applica();
      if (!c.input) { return; }
      c.input.addEventListener('input', function () {
        var n = Math.round(Number(c.input.value));
        c.livello = isFinite(n) ? Math.min(100, Math.max(0, n)) : c.base;
        applica();
        salvaVolumi();
      });
    });
    if (!brano) {
      var rigaGioco = document.getElementById('mnt-riga-gioco');
      if (rigaGioco) { rigaGioco.hidden = true; }
    }
    if (regola && pannello) {
      var apriPannello = function (aperto) {
        pannello.hidden = !aperto;
        regola.setAttribute('aria-expanded', aperto ? 'true' : 'false');
      };
      regola.addEventListener('click', function () { apriPannello(pannello.hidden); });
      document.addEventListener('pointerdown', function (evento) {
        if (!pannello.hidden && evento.target && !scatola.contains(evento.target)) { apriPannello(false); }
      });
      document.addEventListener('keydown', function (evento) {
        if (evento.key === 'Escape' && !pannello.hidden) { apriPannello(false); regola.focus(); }
      });
    }
    var segna = function () {
      var suona = !corrente.paused;
      tasto.classList.toggle('is-suona', suona);
      tasto.setAttribute('aria-pressed', suona ? 'true' : 'false');
      tasto.setAttribute('aria-label', suona ? 'Ferma la musica d’attesa' : 'Fai partire la musica d’attesa');
    };
    var parti = function () {
      if (corrente === brano && !canzoneAttiva) { return; }
      var promessa = corrente.play();
      if (promessa && typeof promessa.catch === 'function') { promessa.catch(function () { }); }
    };
    var smetti = function () {
      document.removeEventListener('pointerdown', alPrimoGesto, true);
      document.removeEventListener('keydown', alPrimoGesto, true);
    };
    var alPrimoGesto = function (evento) {
      if (evento && tasto.contains(evento.target)) { return; }
      smetti();
      if (!spenta && corrente.paused) { parti(); }
    };
    var passaA = function (nuovo) {
      if (nuovo === corrente) { return; }
      var vecchio = corrente;
      corrente = nuovo;
      vecchio.pause();
      if (nuovo === brano) { try { brano.currentTime = 0; } catch (e) { } }
      if (!spenta) { parti(); }
      segna();
    };
    tasto.addEventListener('click', function () {
      smetti();
      spenta = !corrente.paused;
      if (spenta) { corrente.pause(); } else { parti(); }
      try { sessionStorage.setItem(CHIAVE_MUSICA, spenta ? 'no' : 'si'); } catch (e) { }
    });
    document.addEventListener('sb:gioco', function (evento) {
      var attivo = !!(evento.detail && evento.detail.attivo);
      inGioco = attivo;
      if (attivo) { smetti(); } else { canzoneAttiva = false; }
      if ((attivo && branoRotto) || (!attivo && corrente === audio)) { if (!spenta && audio.paused) { parti(); } return; }
      passaA(attivo ? brano : audio);
    });
    document.addEventListener('sb:canzone', function (evento) {
      if (!brano) { return; }
      var file = evento.detail && typeof evento.detail.file === 'string' ? evento.detail.file : '';
      if (!file) {
        canzoneAttiva = false;
        if (inGioco) { corrente.pause(); segna(); }
        return;
      }
      canzoneAttiva = true;
      if (file !== branoFile) {
        branoFile = file;
        branoRotto = false;
        brano.src = file;
      }
      if (!inGioco) { return; }
      if (branoRotto) {
        if (corrente !== audio) { passaA(audio); } else if (!spenta && audio.paused) { parti(); }
        return;
      }
      if (corrente !== brano) { passaA(brano); return; }
      try { brano.currentTime = 0; } catch (e) { }
      if (!spenta) { parti(); }
      segna();
    });
    audio.addEventListener('play', segna);
    audio.addEventListener('pause', segna);
    audio.addEventListener('error', function () { scatola.hidden = true; });
    if (brano) {
      brano.addEventListener('play', segna);
      brano.addEventListener('pause', segna);
      brano.addEventListener('error', function () {
        if (!brano.error) { return; }
        branoRotto = true;
        if (corrente === brano) { passaA(audio); }
      });
    }
    if (!spenta) {
      document.addEventListener('pointerdown', alPrimoGesto, true);
      document.addEventListener('keydown', alPrimoGesto, true);
      if (!anteprima) { parti(); }
    }
  }

  var box = document.getElementById('mnt-conto');
  if (!box) { return; }
  var fine = Date.parse(box.getAttribute('data-fine'));
  var ore = document.getElementById('mnt-ore');
  var min = document.getElementById('mnt-min');
  var sec = document.getElementById('mnt-sec');
  var etichetta = document.getElementById('mnt-conto-etichetta');
  var conto = null;
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function aggiorna() {
    var resto = Math.max(0, Math.floor((fine - Date.now()) / 1000));
    ore.textContent = due(Math.floor(resto / 3600));
    min.textContent = due(Math.floor((resto % 3600) / 60));
    sec.textContent = due(resto % 60);
    if (resto > 0) { return; }
    box.classList.add('is-finito');
    etichetta.textContent = box.getAttribute('data-finito');
    clearInterval(conto);
    controlla();
  }
  aggiorna();
  if (!box.classList.contains('is-finito')) { conto = setInterval(aggiorna, 1000); }
}());
