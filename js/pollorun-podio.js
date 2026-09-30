(function () {
  'use strict';

  var DIFFICOLTA = ['facile', 'medio', 'difficile', 'estremo'];
  var NOMI = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile', estremo: 'Estremo' };
  var RIGHE = 50;
  var VALIDA_MS = 15000;
  var AVATAR = 'https://static-cdn.jtvnw.net/';

  function nodo(tag, classe, testo) {
    var n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (testo !== undefined) { n.textContent = testo; }
    return n;
  }

  function coppa(classe) {
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
    var tracce = ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4', 'M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M8.5 20h7', 'M10 17h4v3h-4z'];
    for (var i = 0; i < tracce.length; i++) {
      var traccia = document.createElementNS(spazio, 'path');
      traccia.setAttribute('d', tracce[i]);
      icona.appendChild(traccia);
    }
    return icona;
  }

  function scarica(difficolta) {
    var promessa;
    try {
      promessa = fetch('api/classifica?difficolta=' + encodeURIComponent(difficolta) + '&n=' + RIGHE, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    } catch (errore) { promessa = null; }
    if (!promessa || typeof promessa.then !== 'function') { return null; }
    return promessa.then(function (risposta) {
      if (!risposta || !risposta.ok) { return null; }
      return risposta.json().then(function (dati) { return dati && typeof dati === 'object' ? dati : null; }, function () { return null; });
    }, function () { return null; });
  }

  function crea(opzioni) {
    var scelte = opzioni || {};
    var stato = { aperto: false, difficolta: 'medio', giro: 0, cache: {}, prima: null, fermato: false };

    var bottone = nodo('button', scelte.classeBottone || 'podio-apri');
    bottone.type = 'button';
    bottone.setAttribute('aria-haspopup', 'dialog');
    bottone.setAttribute('aria-controls', 'podio');
    bottone.setAttribute('aria-expanded', 'false');
    bottone.setAttribute('title', 'Classifica');
    var icona = coppa('podio-apri__icona');
    if (icona) { bottone.appendChild(icona); }
    if (scelte.conTesto) {
      bottone.appendChild(nodo('span', 'podio-apri__testo', 'Classifica'));
    } else {
      bottone.setAttribute('aria-label', 'Apri la classifica');
    }

    var velo = nodo('div', 'podio');
    velo.id = 'podio';
    velo.hidden = true;
    var scheda = nodo('div', 'podio__scheda');
    scheda.setAttribute('role', 'dialog');
    scheda.setAttribute('aria-modal', 'true');
    scheda.setAttribute('aria-labelledby', 'podio-titolo');
    scheda.tabIndex = -1;

    var testa = nodo('div', 'podio__testa');
    var titolo = nodo('h2', 'podio__titolo', 'Classifica di Pollo Run');
    titolo.id = 'podio-titolo';
    var chiudi = nodo('button', 'podio__chiudi', '×');
    chiudi.type = 'button';
    chiudi.setAttribute('aria-label', 'Chiudi la classifica');
    testa.appendChild(titolo);
    testa.appendChild(chiudi);

    var schede = nodo('div', 'podio__schede');
    schede.setAttribute('role', 'tablist');
    schede.setAttribute('aria-label', 'Difficoltà');
    var linguette = {};
    DIFFICOLTA.forEach(function (d) {
      var l = nodo('button', 'podio__linguetta podio__linguetta--' + d, NOMI[d]);
      l.type = 'button';
      l.id = 'podio-' + d;
      l.setAttribute('role', 'tab');
      l.setAttribute('aria-controls', 'podio-elenco');
      l.addEventListener('click', function () { mostra(d); });
      linguette[d] = l;
      schede.appendChild(l);
    });

    var avviso = nodo('p', 'podio__avviso');
    avviso.setAttribute('role', 'status');
    avviso.setAttribute('aria-live', 'polite');
    var elenco = nodo('ol', 'podio__elenco');
    elenco.id = 'podio-elenco';
    elenco.setAttribute('role', 'tabpanel');
    elenco.tabIndex = 0;
    var tu = nodo('p', 'podio__tu');

    scheda.appendChild(testa);
    scheda.appendChild(schede);
    scheda.appendChild(avviso);
    scheda.appendChild(elenco);
    scheda.appendChild(tu);
    velo.appendChild(scheda);

    function io() {
      var dati = null;
      try { dati = typeof scelte.io === 'function' ? scelte.io() : null; } catch (errore) { dati = null; }
      return dati && typeof dati === 'object' && dati.login ? dati : null;
    }

    function gioco() {
      try { return typeof scelte.gioco === 'function' ? scelte.gioco() : null; } catch (errore) { return null; }
    }

    function scriviTu(d, dati) {
      var chi = io();
      if (!chi) {
        tu.textContent = scelte.invito || 'Entra con Twitch per comparire in classifica';
        return;
      }
      var righe = dati && Array.isArray(dati.righe) ? dati.righe : [];
      for (var i = 0; i < righe.length; i++) {
        if (righe[i] && righe[i].login === chi.login) {
          tu.textContent = 'Sei ' + righe[i].pos + '° su ' + (dati.totale || righe.length) + ' a ' + NOMI[d] + ', con il livello ' + righe[i].livello;
          return;
        }
      }
      var migliore = chi.migliori && Number(chi.migliori[d]);
      if (migliore > 0) {
        tu.textContent = 'Il tuo migliore a ' + NOMI[d] + ' è il livello ' + Math.floor(migliore) + ', fuori dai primi ' + righe.length;
        return;
      }
      tu.textContent = 'Non sei ancora in classifica a ' + NOMI[d] + ': completa un livello per entrarci';
    }

    function riga(voce, chi) {
      var li = nodo('li', 'podio__riga' + (voce.pos <= 3 ? ' is-podio is-' + voce.pos : '') + (chi && voce.login === chi.login ? ' is-tu' : ''));
      li.appendChild(nodo('span', 'podio__pos', String(voce.pos)));
      var avatar = typeof voce.avatar === 'string' && voce.avatar.indexOf(AVATAR) === 0 ? voce.avatar : '';
      if (avatar) {
        var img = nodo('img', 'podio__avatar');
        img.alt = '';
        img.width = 28;
        img.height = 28;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
        img.src = avatar;
        li.appendChild(img);
      } else {
        li.appendChild(nodo('span', 'podio__avatar podio__avatar--vuoto'));
      }
      li.appendChild(nodo('span', 'podio__nome', String(voce.nome || voce.login || '')));
      li.appendChild(nodo('span', 'podio__livello', 'Liv. ' + voce.livello));
      return li;
    }

    function dipingi(d, dati) {
      elenco.textContent = '';
      if (!dati) {
        avviso.textContent = 'La classifica ora non risponde, riprova tra poco';
        tu.textContent = '';
        return;
      }
      if (typeof dati.titolo === 'string' && dati.titolo.trim()) { titolo.textContent = dati.titolo.trim(); }
      var righe = Array.isArray(dati.righe) ? dati.righe : [];
      avviso.textContent = righe.length ? '' : 'Ancora nessuno in classifica a ' + NOMI[d] + ': il primo posto è libero';
      var chi = io();
      for (var i = 0; i < righe.length; i++) {
        if (righe[i] && typeof righe[i] === 'object') { elenco.appendChild(riga(righe[i], chi)); }
      }
      scriviTu(d, dati);
      var mia = elenco.querySelector('.is-tu');
      if (mia && typeof mia.scrollIntoView === 'function') {
        try { mia.scrollIntoView({ block: 'nearest' }); } catch (errore) { }
      } else {
        elenco.scrollTop = 0;
      }
    }

    function mostra(d) {
      if (DIFFICOLTA.indexOf(d) === -1) { d = 'medio'; }
      stato.difficolta = d;
      DIFFICOLTA.forEach(function (x) {
        var scelta = x === d;
        linguette[x].setAttribute('aria-selected', scelta ? 'true' : 'false');
        linguette[x].tabIndex = scelta ? 0 : -1;
        linguette[x].classList.toggle('is-scelta', scelta);
      });
      elenco.setAttribute('aria-labelledby', 'podio-' + d);
      var giro = ++stato.giro;
      var salvata = stato.cache[d];
      if (salvata && Date.now() - salvata.quando < VALIDA_MS) {
        dipingi(d, salvata.dati);
        return;
      }
      elenco.textContent = '';
      tu.textContent = '';
      avviso.textContent = 'Carico la classifica…';
      var promessa = scarica(d);
      if (!promessa) { dipingi(d, null); return; }
      promessa.then(function (dati) {
        if (giro !== stato.giro || !stato.aperto) { return; }
        if (dati) { stato.cache[d] = { quando: Date.now(), dati: dati }; }
        dipingi(d, dati);
      });
    }

    function apri() {
      if (stato.aperto) { return; }
      stato.aperto = true;
      stato.prima = document.activeElement;
      var g = gioco();
      stato.fermato = false;
      if (g && typeof g.ferma === 'function') {
        try { g.ferma(); stato.fermato = true; } catch (errore) { }
      }
      var d = 'medio';
      if (g && typeof g.difficolta === 'function') {
        try { d = g.difficolta(); } catch (errore) { d = 'medio'; }
      }
      velo.hidden = false;
      bottone.setAttribute('aria-expanded', 'true');
      document.addEventListener('keydown', suTasto, true);
      mostra(d);
      try { linguette[stato.difficolta].focus({ preventScroll: true }); } catch (errore) { }
    }

    function richiudi() {
      if (!stato.aperto) { return; }
      stato.aperto = false;
      stato.giro++;
      velo.hidden = true;
      bottone.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', suTasto, true);
      var g = gioco();
      if (stato.fermato && g && typeof g.avvia === 'function') {
        try { g.avvia(); } catch (errore) { }
      }
      stato.fermato = false;
      try {
        if (scelte.fuoco) { scelte.fuoco.focus({ preventScroll: true }); } else { bottone.blur(); }
      } catch (errore) { }
    }

    function suTasto(evento) {
      if (!stato.aperto) { return; }
      if (evento.key === 'Escape') {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        richiudi();
        return;
      }
      var passo = evento.key === 'ArrowRight' ? 1 : (evento.key === 'ArrowLeft' ? -1 : 0);
      if (passo && evento.target && evento.target.getAttribute && evento.target.getAttribute('role') === 'tab') {
        evento.preventDefault();
        var i = (DIFFICOLTA.indexOf(stato.difficolta) + passo + DIFFICOLTA.length) % DIFFICOLTA.length;
        mostra(DIFFICOLTA[i]);
        try { linguette[DIFFICOLTA[i]].focus({ preventScroll: true }); } catch (errore) { }
        return;
      }
      if (evento.key === 'Tab') {
        var fuochi = [linguette[stato.difficolta], elenco, chiudi];
        var qui = fuochi.indexOf(document.activeElement);
        var dopo = (qui === -1 ? 0 : qui + (evento.shiftKey ? -1 : 1) + fuochi.length) % fuochi.length;
        evento.preventDefault();
        try { fuochi[dopo].focus({ preventScroll: true }); } catch (errore) { }
      }
      evento.stopPropagation();
    }

    bottone.addEventListener('click', function () { if (stato.aperto) { richiudi(); } else { apri(); } });
    chiudi.addEventListener('click', richiudi);
    velo.addEventListener('pointerdown', function (evento) {
      evento.stopPropagation();
      if (evento.target === velo) { richiudi(); }
    });
    bottone.addEventListener('pointerdown', function (evento) { evento.stopPropagation(); });

    (scelte.dentro || document.body).appendChild(velo);

    return {
      bottone: bottone,
      apri: apri,
      chiudi: richiudi,
      aperto: function () { return stato.aperto; },
      scordati: function (d) { if (d) { delete stato.cache[d]; } else { stato.cache = {}; } },
      togli: function () {
        richiudi();
        if (velo.parentNode) { velo.parentNode.removeChild(velo); }
      }
    };
  }

  window.PolloRunPodio = { crea: crea };
}());
