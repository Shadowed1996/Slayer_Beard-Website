(function () {
  'use strict';

  const CHIAVE = 'sb-spotify-aperto';
  const PREFISSO = 'https://open.spotify.com/embed/';
  const OGNI_MS = 60000;

  function leggi() {
    try { return localStorage.getItem(CHIAVE); } catch (err) { return null; }
  }

  function salva(valore) {
    try { localStorage.setItem(CHIAVE, valore); } catch (err) { return; }
  }

  function buono(indirizzo) {
    return typeof indirizzo === 'string' && indirizzo.indexOf(PREFISSO) === 0;
  }

  function avvia() {
    const radice = document.getElementById('spotify');
    const player = radice && radice.querySelector('.spotify__player');
    const riduci = document.getElementById('spotify-riduci');
    const apri = document.getElementById('spotify-apri');
    const ora = radice && radice.querySelector('.spotify__ora');
    const passa = radice && radice.querySelector('.spotify__passa');
    if (!radice || !player || !riduci || !apri) { return; }

    const riserva = buono(player.getAttribute('data-src')) ? player.getAttribute('data-src') : '';
    const segui = radice.getAttribute('data-segui') === '1';
    const etichetta = radice.getAttribute('data-ascolta') || '';
    if (!riserva && !segui) { return; }

    let proposto = riserva;
    let caricato = '';

    function aperto() {
      return radice.getAttribute('data-aperto') === '1';
    }

    function mostraPassa() {
      if (passa) { passa.hidden = !(caricato && proposto && proposto !== caricato); }
    }

    function carica() {
      if (!caricato && proposto) {
        caricato = proposto;
        player.setAttribute('src', caricato);
      }
      mostraPassa();
    }

    function imposta(apertoOra, conFuoco) {
      radice.setAttribute('data-aperto', apertoOra ? '1' : '0');
      riduci.setAttribute('aria-expanded', String(apertoOra));
      apri.setAttribute('aria-expanded', String(apertoOra));
      if (apertoOra) { carica(); }
      if (conFuoco) { (apertoOra ? riduci : apri).focus({ preventScroll: true }); }
    }

    function visibile() {
      radice.hidden = !(proposto || caricato);
    }

    function scriviOra(dati) {
      if (!ora) { return; }
      if (!dati || !dati.inAscolto || !dati.brano) {
        ora.hidden = true;
        ora.textContent = '';
        return;
      }
      const pezzi = [dati.brano.titolo, dati.brano.artisti].filter(Boolean).join(' — ');
      const dove = dati.contesto && dati.contesto.nome ? ' · ' + dati.contesto.nome : '';
      ora.textContent = (etichetta ? etichetta + ' · ' : '') + pezzi + dove;
      ora.hidden = !pezzi;
    }

    function aggiorna() {
      if (!segui || typeof fetch !== 'function') { return Promise.resolve(); }
      return fetch('/api/spotify/ora', { cache: 'no-store', credentials: 'omit' })
        .then(function (risposta) { return risposta.ok ? risposta.json() : null; })
        .catch(function () { return null; })
        .then(function (dati) {
          const suo = dati && dati.inAscolto && buono(dati.src) ? dati.src : '';
          proposto = suo || riserva;
          scriviOra(suo ? dati : null);
          visibile();
          if (aperto()) { carica(); } else { mostraPassa(); }
        });
    }

    riduci.addEventListener('click', function () {
      salva('0');
      imposta(false, true);
    });

    apri.addEventListener('click', function () {
      salva('1');
      imposta(true, true);
    });

    if (passa) {
      passa.addEventListener('click', function () {
        if (!proposto) { return; }
        caricato = proposto;
        player.setAttribute('src', caricato);
        mostraPassa();
      });
    }

    radice.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && aperto()) {
        salva('0');
        imposta(false, true);
      }
    });

    const ricordato = leggi();
    const inizio = ricordato === null ? radice.getAttribute('data-aperto') === '1' : ricordato === '1';

    aggiorna().then(function () {
      imposta(inizio, false);
      visibile();
    });

    if (segui) {
      setInterval(function () {
        if (document.visibilityState === 'visible') { aggiorna(); }
      }, OGNI_MS);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') { aggiorna(); }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
})();
