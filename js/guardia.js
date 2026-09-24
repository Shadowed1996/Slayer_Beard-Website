(function () {
  'use strict';

  var FILE = 'stato-sito.json';
  var OGNI = 20000;
  var CHIAVE = 'sb-guardia-ricaricato';

  if (document.querySelector('meta[name="sb-pagina"][content="manutenzione"]')) { return; }
  if (typeof window.fetch !== 'function') { return; }
  if (location.pathname.indexOf('/api/') === 0) { return; }

  var inCorso = false;
  var annunciato = false;

  function giaRicaricato(timbro) {
    try { return sessionStorage.getItem(CHIAVE) === timbro; } catch (e) { return false; }
  }

  function ricorda(timbro) {
    try { sessionStorage.setItem(CHIAVE, timbro); } catch (e) { }
  }

  function annuncia(timbro) {
    if (annunciato) { return; }
    annunciato = true;
    try {
      document.dispatchEvent(new CustomEvent('sb:manutenzione', {
        detail: { attiva: true, pubblicatoIl: timbro }
      }));
    } catch (e) {}
  }

  function controlla() {
    if (inCorso) { return; }
    inCorso = true;
    fetch(FILE + '?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (risposta) { return risposta.ok ? risposta.json() : null; })
      .then(function (stato) {
        inCorso = false;
        if (!stato || stato.manutenzione !== true) { return; }
        var timbro = String(stato.pubblicatoIl || '');

        annuncia(timbro);
        if (giaRicaricato(timbro)) { return; }
        ricorda(timbro);
        location.reload();
      })
      .catch(function () { inCorso = false; });
  }

  setInterval(controlla, OGNI);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { controlla(); }
  });
  window.addEventListener('pageshow', controlla);
}());
