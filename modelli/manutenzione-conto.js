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
  var tasto = document.getElementById('mnt-musica');
  if (audio && tasto) {
    var CHIAVE_MUSICA = 'sb-manutenzione-musica';
    var spenta = false;
    try { spenta = sessionStorage.getItem(CHIAVE_MUSICA) === 'no'; } catch (e) { }
    audio.volume = 0.2;
    var segna = function () {
      var suona = !audio.paused;
      tasto.classList.toggle('is-suona', suona);
      tasto.setAttribute('aria-pressed', suona ? 'true' : 'false');
      tasto.setAttribute('aria-label', suona ? 'Ferma la musica d’attesa' : 'Fai partire la musica d’attesa');
    };
    var parti = function () {
      var promessa = audio.play();
      if (promessa && typeof promessa.catch === 'function') { promessa.catch(function () { }); }
    };
    var alPrimoGesto = function (evento) {
      if (evento && tasto.contains(evento.target)) { return; }
      document.removeEventListener('pointerdown', alPrimoGesto, true);
      document.removeEventListener('keydown', alPrimoGesto, true);
      if (!spenta && audio.paused) { parti(); }
    };
    tasto.addEventListener('click', function () {
      document.removeEventListener('pointerdown', alPrimoGesto, true);
      document.removeEventListener('keydown', alPrimoGesto, true);
      spenta = !audio.paused;
      if (spenta) { audio.pause(); } else { parti(); }
      try { sessionStorage.setItem(CHIAVE_MUSICA, spenta ? 'no' : 'si'); } catch (e) { }
    });
    audio.addEventListener('play', segna);
    audio.addEventListener('pause', segna);
    audio.addEventListener('error', function () { tasto.hidden = true; });
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
