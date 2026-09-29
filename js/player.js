(function () {
  'use strict';

  const DATI = window.DATI || {};
  const TWITCH = DATI.twitch || {};
  const TESTI = DATI.testi || {};

  const CANALE = frase(TWITCH.canale, 'slayer_beard');
  const CANALE_ENC = encodeURIComponent(CANALE);
  const URL_CANALE = 'https://www.twitch.tv/' + CANALE_ENC;
  const URL_POPOUT = 'https://www.twitch.tv/popout/' + CANALE_ENC + '/chat';

  const T = {
    live: frase(TESTI.statoLive, 'In onda adesso'),
    offline: frase(TESTI.statoOffline, 'Fuori onda'),
    verifica: frase(TESTI.statoVerifica, 'Controllo il canale'),
    chatApri: frase(TESTI.chatApri, 'Mostra la chat'),
    chatChiudi: frase(TESTI.chatChiudi, 'Nascondi la chat')
  };

  const ID_PALCO = 'player-palco';
  const MAX_PARENT = 25;
  const ATTESA_STATO = 15000;
  const ATTESA_SCHELETRO = 10000;
  const ATTESA_IFRAME = 9000;
  const RICONTROLLO = 90000;

  const stato = {
    avviato: false,
    modalita: null,
    inOnda: null,
    risolto: false,
    dedotto: false,
    bloccato: false,
    titolo: null,
    player: null,
    parent: [],
    parentQS: '',
    chatMontata: false,
    chatImpossibile: false,
    chatAperta: false,
    scrive: false,
    fuocoAgganciato: false,
    riproduce: false,
    finito: false,
    ultimoPlay: 0,
    tentativi: 0,
    ricostruzioni: 0,
    timerStato: null,
    timerScheletro: null,
    timerIframe: null,
    timerRicontrollo: null
  };

  const nodi = {};
  const iscritti = [];
  const iscrittiChat = [];
  const iscrittiVideo = [];

  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  function crea(tag, classe, testo) {
    const n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (testo != null) { n.textContent = testo; }
    return n;
  }

  function scrivi(nodo, testo) { if (nodo) { nodo.textContent = testo; } }

  function nodoEtichetta(bottone, classe) {
    if (!bottone) { return null; }

    const gia = bottone.querySelector('.' + classe);
    if (gia) { return gia; }

    const span = document.createElement('span');
    span.className = classe;

    for (let i = 0; i < bottone.childNodes.length; i++) {
      const n = bottone.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        span.textContent = n.nodeValue.trim();
        bottone.replaceChild(span, n);
        return span;
      }
    }

    bottone.appendChild(span);
    return span;
  }

  function collega(href, classe, testo) {
    const a = crea('a', classe, testo);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function spie(classe) {
    [nodi.spia, nodi.spiaGrande].forEach(function (n) {
      if (!n) { return; }
      n.classList.remove('is-live', 'is-offline', 'is-verifica');
      n.classList.add(classe);
    });
  }

  function normalizzaHost(grezzo) {
    if (typeof grezzo !== 'string') { return ''; }
    let h = grezzo.trim().toLowerCase();
    if (!h) { return ''; }

    h = h.replace(/^[a-z][a-z0-9+.\-]*:\/\//, '');
    h = h.split('/')[0].split('?')[0].split('#')[0];
    h = h.split('@').pop();

    if (h.charAt(0) === '[') {
      const fine = h.indexOf(']');
      h = fine > -1 ? h.slice(1, fine) : h.slice(1);
    } else {
      h = h.split(':')[0];
    }

    if (!h || h === 'null' || h === 'undefined') { return ''; }
    if (h.indexOf('..') > -1) { return ''; }
    if (!/^[a-z0-9][a-z0-9.\-]*$/.test(h)) { return ''; }
    return h;
  }

  function eIpV4(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }

  const ETICHETTA = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  function parentValido(h) {
    if (h === 'localhost' || h === '127.0.0.1') { return true; }
    if (eIpV4(h)) { return false; }
    if (h.length > 253) { return false; }
    const parti = h.split('.');
    if (parti.length < 2) { return false; }
    return parti.every(function (p) { return ETICHETTA.test(p); });
  }

  function costruisciParent() {
    const extra = Array.isArray(TWITCH.domini) ? TWITCH.domini : [];
    const grezzi = ['localhost', '127.0.0.1', location.hostname].concat(extra);
    const elenco = [];

    function aggiungi(h) {
      if (h && parentValido(h) && elenco.indexOf(h) === -1 && elenco.length < MAX_PARENT) {
        elenco.push(h);
      }
    }

    grezzi.forEach(function (voce) {
      const h = normalizzaHost(voce);
      if (!h) { return; }
      aggiungi(h);
      if (h.indexOf('www.') === 0) {
        aggiungi(h.slice(4));
      } else if (h.split('.').length === 2 && !eIpV4(h)) {
        aggiungi('www.' + h);
      }
    });

    return elenco;
  }

  function queryParent(elenco) {
    return elenco.map(function (h) { return 'parent=' + encodeURIComponent(h); }).join('&');
  }

  function informa(fn) {
    try {
      fn({ inOnda: stato.inOnda === true, titolo: stato.titolo }, stato.inOnda === true);
    } catch (err) {
      console.warn('[player] un iscritto a suStato è andato in errore:', err);
    }
  }

  function risolvi(inOnda) {
    if (stato.timerStato) {
      clearTimeout(stato.timerStato);
      stato.timerStato = null;
    }

    const valore = !!inOnda;
    const cambiato = !stato.risolto || stato.inOnda !== valore;

    stato.inOnda = valore;
    stato.risolto = true;
    nascondiScheletro();

    if (!cambiato) { return; }
    dipingi();
    iscritti.forEach(informa);
  }

  function dichiara(inOnda, titolo) {
    const valore = !!inOnda;
    const nuovo = (typeof titolo === 'string' && titolo.trim()) ? titolo.trim() : stato.titolo;
    const cambiaTitolo = nuovo !== stato.titolo;
    const cambiaStato = !stato.risolto || stato.inOnda !== valore;

    stato.titolo = nuovo;
    stato.dedotto = false;

    risolvi(valore);

    if (!cambiaStato && cambiaTitolo) {
      dipingi();
      iscritti.forEach(informa);
    }
  }

  const RIPRODUZIONE_VIVA = ['Playing', 'Buffering'];
  const RIPRODUZIONE_SPENTA = ['Idle', 'Ended'];

  function riconcilia() {
    if (stato.modalita !== 'sdk' || !stato.player) { return; }

    let situazione = null;
    try {
      if (typeof stato.player.getPlayerState === 'function') {
        situazione = stato.player.getPlayerState();
      }
    } catch (err) {
      return;
    }
    if (!situazione || typeof situazione.playback !== 'string') { return; }

    if (RIPRODUZIONE_VIVA.indexOf(situazione.playback) > -1) {
      risolvi(true);
      return;
    }
    if (RIPRODUZIONE_SPENTA.indexOf(situazione.playback) > -1 && stato.risolto && !stato.bloccato) {
      risolvi(false);
    }
  }

  function tempoDelVideo() {
    if (stato.modalita !== 'sdk' || !stato.player) { return null; }
    try {
      if (typeof stato.player.getCurrentTime !== 'function') { return null; }
      const t = stato.player.getCurrentTime();
      return (typeof t === 'number' && isFinite(t)) ? t : null;
    } catch (err) {
      return null;
    }
  }

  function mutoDelVideo() {
    if (stato.modalita !== 'sdk' || !stato.player) { return null; }
    try {
      if (typeof stato.player.getMuted !== 'function') { return null; }
      const m = stato.player.getMuted();
      return typeof m === 'boolean' ? m : null;
    } catch (err) {
      return null;
    }
  }

  function riproduzione() {
    if (stato.modalita !== 'sdk' || !stato.player) { return null; }
    try {
      if (typeof stato.player.getPlayerState !== 'function') { return null; }
      const s = stato.player.getPlayerState();
      return (s && typeof s.playback === 'string') ? s.playback : null;
    } catch (err) {
      return null;
    }
  }

  function situazioneVideo() {
    const playback = riproduzione();
    return {
      riproduce: playback ? RIPRODUZIONE_VIVA.indexOf(playback) > -1 : stato.riproduce,
      fermo: playback ? (RIPRODUZIONE_SPENTA.indexOf(playback) > -1 && stato.risolto) : false,
      bloccato: stato.bloccato === true,
      finito: stato.finito === true,
      modalita: stato.modalita,
      playback: playback,
      tempo: tempoDelVideo(),
      muto: mutoDelVideo()
    };
  }

  function informaVideo(fn) {
    try {
      fn(situazioneVideo());
    } catch (err) {
      console.warn('[player] un iscritto a suVideo è andato in errore:', err);
    }
  }

  function avvisaVideo() { iscrittiVideo.forEach(informaVideo); }

  const SESSIONE_BUONA = 60000;

  function segnaRiproduzione(attiva) {
    const cambiato = stato.riproduce !== attiva;
    stato.riproduce = attiva;
    if (attiva) {
      stato.finito = false;
      stato.ultimoPlay = Date.now();
    }
    if (cambiato) { avvisaVideo(); }
  }

  function forseAzzeraTentativi() {
    if (stato.riproduce && stato.ultimoPlay && (Date.now() - stato.ultimoPlay) > SESSIONE_BUONA) {
      stato.tentativi = 0;
    }
  }

  const MAX_TENTATIVI = 6;
  const MAX_RICOSTRUZIONI = 2;

  function riparti(livello) {
    forseAzzeraTentativi();

    if (stato.modalita !== 'sdk' || !stato.player) { return Promise.resolve('impossibile'); }

    if (stato.finito) { return Promise.resolve('niente'); }

    if (stato.bloccato) { return Promise.resolve('impossibile'); }

    if (navigator.onLine === false) { return Promise.resolve('niente'); }

    if (stato.tentativi >= MAX_TENTATIVI) { return Promise.resolve('impossibile'); }

    const ora = situazioneVideo();
    if (ora.riproduce && document.visibilityState === 'visible') {
      return Promise.resolve('niente');
    }

    stato.tentativi++;

    try {
      if (livello >= 3) {
        if (stato.ricostruzioni >= MAX_RICOSTRUZIONI) { return Promise.resolve('impossibile'); }
        stato.ricostruzioni++;
        return ricostruisci();
      }
      if (livello === 2 && typeof stato.player.setChannel === 'function') {
        stato.player.setChannel(CANALE);
        return Promise.resolve('ripartito');
      }
      if (typeof stato.player.play === 'function') {
        stato.player.play();
        return Promise.resolve('ripartito');
      }
    } catch (err) {
      console.warn('[player] riavvio fallito al livello ' + livello + ':', err);
      return Promise.resolve('impossibile');
    }

    return Promise.resolve('impossibile');
  }

  function ricostruisci() {
    try {
      if (typeof stato.player.destroy === 'function') { stato.player.destroy(); }
    } catch (err) {
      console.warn('[player] destroy ha lanciato, procedo comunque:', err);
    }
    stato.player = null;
    stato.modalita = null;
    if (nodi.palco) { nodi.palco.innerHTML = ''; }
    montaPlayer();
    return Promise.resolve(stato.modalita === 'sdk' ? 'ripartito' : 'impossibile');
  }

  function smuta() {
    if (stato.modalita !== 'sdk' || !stato.player) { return false; }
    try {
      if (typeof stato.player.setMuted === 'function') {
        stato.player.setMuted(false);
        return true;
      }
    } catch (err) {
      console.warn('[player] setMuted non disponibile:', err);
    }
    return false;
  }

  function dipingi() {
    if (!stato.risolto) {
      spie('is-verifica');
      scrivi(nodi.spiaTesto, T.verifica);
      scrivi(nodi.statoTesto, T.verifica);
      scrivi(nodi.monitorTitolo, T.verifica);
      if (nodi.badge) { nodi.badge.hidden = true; }
      return;
    }

    if (stato.inOnda === true) {
      spie('is-live');
      scrivi(nodi.spiaTesto, T.live);
      scrivi(nodi.statoTesto, T.live);
      scrivi(nodi.monitorTitolo, stato.titolo || 'twitch.tv/' + CANALE);
      if (nodi.badge) { nodi.badge.hidden = false; }
      return;
    }

    spie('is-offline');
    scrivi(nodi.spiaTesto, T.offline);
    scrivi(nodi.statoTesto, T.offline);
    scrivi(nodi.monitorTitolo, 'twitch.tv/' + CANALE);
    if (nodi.badge) { nodi.badge.hidden = true; }
    if (nodi.ultima && nodi.ultima.getAttribute('data-fonte') !== 'twitch'
        && frase(DATI.ultimaDiretta, '')) {
      nodi.ultima.textContent = DATI.ultimaDiretta;
    }
  }

  function nascondiScheletro() {
    if (stato.timerScheletro) {
      clearTimeout(stato.timerScheletro);
      stato.timerScheletro = null;
    }
    if (nodi.scheletro) { nodi.scheletro.classList.add('is-fatto'); }
  }

  function costruisciGuscio() {
    nodi.video.textContent = '';
    nodi.video.classList.add('player__contenitore');
    nodi.video.classList.remove('is-avviso');

    nodi.palco = crea('div', 'player__palco');
    nodi.palco.id = ID_PALCO;

    nodi.scheletro = crea('div', 'player__scheletro');
    nodi.scheletro.setAttribute('aria-hidden', 'true');

    nodi.video.appendChild(nodi.palco);
    nodi.video.appendChild(nodi.scheletro);

    stato.timerScheletro = setTimeout(function () {
      stato.timerScheletro = null;
      if (nodi.scheletro) { nodi.scheletro.classList.add('is-fatto'); }
    }, ATTESA_SCHELETRO);
  }

  function iframeManuale() {
    const f = document.createElement('iframe');
    f.className = 'player__iframe';
    f.src = 'https://player.twitch.tv/?channel=' + CANALE_ENC + '&' + stato.parentQS +
            '&muted=true&autoplay=true';
    f.title = 'Diretta Twitch di ' + CANALE;
    f.setAttribute('allowfullscreen', 'true');
    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    f.setAttribute('scrolling', 'no');
    f.setAttribute('frameborder', '0');
    f.addEventListener('load', function () {
      if (stato.timerIframe) {
        clearTimeout(stato.timerIframe);
        stato.timerIframe = null;
      }
      nascondiScheletro();
    }, { once: true });
    nodi.palco.appendChild(f);
    return f;
  }

  function montaPlayer() {
    let montato = false;

    if (window.Twitch && typeof window.Twitch.Player === 'function') {
      try {
        stato.player = new window.Twitch.Player(ID_PALCO, {
          channel: CANALE,
          parent: stato.parent,
          width: '100%',
          height: '100%',
          muted: true,
          autoplay: true
        });

        const P = window.Twitch.Player;

        stato.player.addEventListener(P.READY, function () {
          nascondiScheletro();
          const f = nodi.palco && nodi.palco.querySelector('iframe');
          if (f) { f.title = 'Diretta Twitch di ' + CANALE; }
        });

        [P.ONLINE, P.PLAY, P.PLAYING].forEach(function (evento) {
          if (evento) {
            stato.player.addEventListener(evento, function () {
              risolvi(true);
              segnaRiproduzione(true);
            });
          }
        });

        [P.OFFLINE, P.ENDED].forEach(function (evento) {
          if (evento) {
            stato.player.addEventListener(evento, function () {
              risolvi(false);
              stato.finito = true;
              segnaRiproduzione(false);
            });
          }
        });

        if (P.PAUSE) {
          stato.player.addEventListener(P.PAUSE, function () {
            segnaRiproduzione(false);
          });
        }

        if (P.PLAYBACK_BLOCKED) {
          stato.player.addEventListener(P.PLAYBACK_BLOCKED, function () {
            nascondiScheletro();
            stato.bloccato = true;
            stato.riproduce = false;
            nodi.video.classList.add('is-bloccato');
            avvisaVideo();
          });
        }

        montato = true;
        stato.modalita = 'sdk';
      } catch (err) {
        console.warn('[player] Twitch.Player non utilizzabile, passo all’iframe manuale:', err);
        stato.player = null;
      }
    }

    if (!montato) {
      stato.modalita = 'iframe';
      iframeManuale();
      stato.timerIframe = setTimeout(function () {
        stato.timerIframe = null;
        mostraAvviso('bloccato');
      }, ATTESA_IFRAME);
    } else {
      agganciaCaricamento();
    }
  }

  function agganciaCaricamento() {
    let tentativi = 0;
    (function cerca() {
      if (!nodi.palco) { return; }
      const f = nodi.palco.querySelector('iframe');
      if (f) {
        f.addEventListener('load', nascondiScheletro, { once: true });
        return;
      }
      if (++tentativi < 20) { setTimeout(cerca, 100); }
    }());
  }

  function armaTimeoutStato() {
    stato.timerStato = setTimeout(function () {
      stato.timerStato = null;
      if (stato.risolto) { return; }
      stato.dedotto = true;
      risolvi(false);
    }, ATTESA_STATO);
  }

  function nodoPieno() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function chiamaPieno(fn, contesto) {
    if (!fn) { return; }
    const esito = fn.call(contesto);
    if (esito && typeof esito.catch === 'function') {
      esito.catch(function () { });
    }
  }

  function sincronizzaPieno() {
    if (!nodi.pieno || !nodi.video) { return; }
    const attivo = nodoPieno() === nodi.video;
    const etichetta = attivo ? 'Esci da schermo intero' : 'Schermo intero';
    scrivi(nodi.pieno.querySelector('.player__pieno-testo'), etichetta);
    nodi.pieno.setAttribute('aria-label', etichetta);
    nodi.pieno.title = etichetta;
    nodi.pieno.classList.toggle('is-attivo', attivo);
    nodi.video.classList.toggle('is-pieno', attivo);
  }

  function preparaPieno() {
    const richiedi = nodi.video.requestFullscreen || nodi.video.webkitRequestFullscreen;
    if (!richiedi) { return; }

    nodi.pieno = crea('button', 'player__pieno');
    nodi.pieno.type = 'button';
    nodi.pieno.appendChild(crea('span', 'player__pieno-icona'));
    nodi.pieno.appendChild(crea('span', 'player__pieno-testo', 'Schermo intero'));
    nodi.pieno.addEventListener('click', function () {
      try {
        if (nodoPieno()) {
          chiamaPieno(document.exitFullscreen || document.webkitExitFullscreen, document);
        } else {
          chiamaPieno(richiedi, nodi.video);
        }
      } catch (err) { }
    });
    nodi.video.appendChild(nodi.pieno);

    document.addEventListener('fullscreenchange', sincronizzaPieno);
    document.addEventListener('webkitfullscreenchange', sincronizzaPieno);
    sincronizzaPieno();
  }

  function costruisciChat() {
    nodi.chat.textContent = '';
    nodi.chat.classList.add('chat__contenitore');
    nodi.chatIframe = null;

    const testa = crea('div', 'chat__testa');
    testa.appendChild(crea('span', 'chat__titolo', 'Chat del canale'));

    const popout = collega(URL_POPOUT, 'chat__popout', 'Finestra a parte');
    popout.title = 'Apri la chat in una finestra separata';
    testa.appendChild(popout);

    nodi.chatChiudi = crea('button', 'chat__chiudi', '✕');
    nodi.chatChiudi.type = 'button';
    nodi.chatChiudi.setAttribute('aria-label', T.chatChiudi);
    nodi.chatChiudi.addEventListener('click', function () { apriChat(false, true); });
    testa.appendChild(nodi.chatChiudi);

    nodi.chatTelaio = crea('div', 'chat__telaio');
    nodi.chatScheletro = crea('div', 'chat__scheletro');
    nodi.chatScheletro.setAttribute('aria-hidden', 'true');
    nodi.chatTelaio.appendChild(nodi.chatScheletro);

    nodi.chat.appendChild(testa);
    nodi.chat.appendChild(nodi.chatTelaio);
  }

  function montaChat() {
    if (stato.chatMontata || stato.chatImpossibile || !nodi.chatTelaio) { return; }
    stato.chatMontata = true;

    const f = document.createElement('iframe');
    f.className = 'chat__iframe';
    f.src = 'https://www.twitch.tv/embed/' + CANALE_ENC + '/chat?' + stato.parentQS + '&darkpopout';
    f.title = 'Chat Twitch di ' + CANALE;
    f.setAttribute('scrolling', 'no');
    f.setAttribute('frameborder', '0');
    f.addEventListener('load', function () {
      if (nodi.chatScheletro) { nodi.chatScheletro.classList.add('is-fatto'); }
    }, { once: true });

    nodi.chatIframe = f;
    nodi.chatTelaio.appendChild(f);
  }

  function statoChat() {
    return {
      aperta: stato.chatAperta,
      scrive: stato.scrive,
      montata: stato.chatMontata
    };
  }

  function informaChat(fn) {
    try {
      fn(statoChat());
    } catch (err) {
      console.warn('[player] un iscritto a suChat è andato in errore:', err);
    }
  }

  function annunciaChat() { iscrittiChat.forEach(informaChat); }

  function impostaScrive(valore) {
    const v = !!valore;
    if (stato.scrive === v) { return; }
    stato.scrive = v;
    annunciaChat();
  }

  function fuocoNellaChat() {
    return stato.chatAperta && !!nodi.chatIframe &&
           document.activeElement === nodi.chatIframe;
  }

  function alBlurFinestra() {
    setTimeout(function () { impostaScrive(fuocoNellaChat()); }, 0);
  }

  function alFocusFinestra() { impostaScrive(false); }

  function agganciaFuoco() {
    if (stato.fuocoAgganciato) { return; }
    stato.fuocoAgganciato = true;
    window.addEventListener('blur', alBlurFinestra);
    window.addEventListener('focus', alFocusFinestra);
  }

  function apriChat(aperta, tornaAlBottone) {
    stato.chatAperta = !!aperta;

    if (nodi.lato) { nodi.lato.hidden = !stato.chatAperta; }

    if (nodi.chatToggle) {
      nodi.chatToggle.setAttribute('aria-expanded', stato.chatAperta ? 'true' : 'false');
      scrivi(nodi.chatEtichetta, stato.chatAperta ? T.chatChiudi : T.chatApri);
    }

    if (stato.chatAperta) {
      montaChat();
    } else {
      stato.scrive = false;
      if (tornaAlBottone && nodi.chatToggle) {
        try { nodi.chatToggle.focus(); } catch (err) { }
      }
    }

    annunciaChat();
  }

  function copiaNegliAppunti(testo, bottone) {
    const originale = bottone.textContent;
    const ripristina = function () {
      setTimeout(function () { bottone.textContent = originale; }, 1800);
    };
    const fatto = function () { bottone.textContent = 'Copiato'; ripristina(); };
    const storico = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = testo;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        fatto();
      } catch (err) {
        bottone.textContent = 'Seleziona e copia';
        ripristina();
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(testo).then(fatto, storico);
    } else {
      storico();
    }
  }

  function bloccoComando(comando) {
    const riga = crea('div', 'player__comando');
    riga.appendChild(crea('code', 'player__comando-testo', comando));
    const b = crea('button', 'player__comando-copia', 'Copia');
    b.type = 'button';
    b.setAttribute('aria-label', 'Copia il comando: ' + comando);
    b.addEventListener('click', function () { copiaNegliAppunti(comando, b); });
    riga.appendChild(b);
    return riga;
  }

  function costruisciAvviso(motivo, compatto) {
    const box = crea('div', 'player__riquadro' + (compatto ? ' player__riquadro--compatto' : ''));
    const cosa = compatto ? 'La chat' : 'Il player';

    if (motivo === 'host') {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Indirizzo non autorizzato'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non parte da questo indirizzo'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Twitch autorizza l’incorporamento solo verso un nome di dominio e rifiuta gli indirizzi IP ' +
        'come ' + (location.hostname || 'questo') + '. Apri il sito da localhost, oppure aggiungi il ' +
        'dominio pubblico all’elenco dei domini autorizzati dal pannello.'));

    } else if (motivo === 'rete') {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Rete assente'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non può caricarsi senza connessione'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Il browser risulta scollegato dalla rete, quindi l’incorporamento di Twitch non si può ' +
        'scaricare. Quando la connessione torna riparte da solo: non serve ricaricare la pagina.'));

    } else if (motivo === 'bloccato') {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Caricamento bloccato'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non si carica'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Il componente di Twitch non è arrivato: quasi sempre è un’estensione che blocca la pubblicità, ' +
        'oppure una rete che filtra i domini di Twitch. Il canale resta guardabile sul sito di Twitch, ' +
        'e il resto della pagina funziona normalmente.'));

    } else {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Anteprima locale'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non parte da un file locale'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Twitch autorizza l’incorporamento solo verso un dominio dichiarato, e con il protocollo ' +
        'file:// non esiste nessun hostname da autorizzare: serve un piccolo server locale.'));

      if (!compatto) {
        box.appendChild(bloccoComando('py -m http.server 5173'));
        box.appendChild(crea('p', 'player__riquadro-oppure', 'oppure, con Node:'));
        box.appendChild(bloccoComando('npx serve .'));
        box.appendChild(crea('p', 'player__riquadro-testo player__riquadro-testo--tenue',
          'Poi apri http://localhost:5173 : player e chat partono da soli.'));
      }
    }

    box.appendChild(collega(URL_CANALE, 'player__riquadro-btn', 'Apri il canale su Twitch'));
    return box;
  }

  function mostraAvviso(motivo) {
    if (stato.modalita === 'avviso') { return; }
    stato.modalita = 'avviso';
    fermaTimer();

    if (nodi.video) {
      nodi.video.textContent = '';
      nodi.video.classList.add('player__contenitore', 'is-avviso');
      nodi.video.appendChild(costruisciAvviso(motivo, false));
    }
    if (nodi.chat) {
      nodi.chat.textContent = '';
      nodi.chat.classList.add('chat__contenitore', 'is-avviso');
      nodi.chat.appendChild(costruisciAvviso(motivo, true));
    }

    nodi.palco = null;
    nodi.scheletro = null;
    nodi.pieno = null;
    nodi.chatTelaio = null;
    nodi.chatScheletro = null;
    nodi.chatIframe = null;
    stato.chatImpossibile = true;
    stato.chatMontata = false;
    stato.scrive = false;
    stato.player = null;
    annunciaChat();

    setTimeout(function () { risolvi(false); }, 0);

    if (motivo === 'rete') {
      window.addEventListener('online', function () {
        stato.avviato = false;
        stato.modalita = null;
        stato.chatMontata = false;
        stato.chatImpossibile = false;
        stato.chatAperta = false;
        stato.scrive = false;
        stato.risolto = false;
        stato.inOnda = null;
        stato.dedotto = false;
        stato.bloccato = false;
        avvia();
      }, { once: true });
    }
  }

  function fermaTimer() {
    [['timerStato', clearTimeout], ['timerScheletro', clearTimeout],
      ['timerIframe', clearTimeout], ['timerRicontrollo', clearInterval]
    ].forEach(function (voce) {
      if (stato[voce[0]]) {
        voce[1](stato[voce[0]]);
        stato[voce[0]] = null;
      }
    });
  }

  function allaVisibilita() {
    if (document.visibilityState === 'visible') {
      riconcilia();
    } else {
      impostaScrive(false);
    }
  }

  function smonta() {
    fermaTimer();
    document.removeEventListener('fullscreenchange', sincronizzaPieno);
    document.removeEventListener('webkitfullscreenchange', sincronizzaPieno);
    document.removeEventListener('visibilitychange', allaVisibilita);
    window.removeEventListener('blur', alBlurFinestra);
    window.removeEventListener('focus', alFocusFinestra);
    stato.fuocoAgganciato = false;
    stato.scrive = false;
    if (stato.player && typeof stato.player.destroy === 'function') {
      try { stato.player.destroy(); } catch (err) { }
    }
    stato.player = null;
  }

  function raccogliNodi() {
    nodi.video = document.getElementById('twitch-embed');
    nodi.chat = document.getElementById('twitch-chat');
    nodi.lato = document.getElementById('monitor-lato') ||
                document.querySelector('.monitor__lato') ||
                (nodi.chat && nodi.chat.parentElement);
    nodi.chatToggle = document.getElementById('chat-toggle');
    nodi.monitorTitolo = document.getElementById('monitor-titolo');
    nodi.badge = document.getElementById('monitor-badge');
    nodi.spia = document.getElementById('spia');
    nodi.spiaTesto = document.getElementById('spia-testo');
    nodi.spiaGrande = document.getElementById('spia-grande');
    nodi.statoTesto = document.getElementById('stato-testo');
    nodi.ultima = document.getElementById('ultima');
    nodi.apriTwitch = document.getElementById('apri-twitch');
  }

  function avvia() {
    if (stato.avviato) { return; }
    stato.avviato = true;

    raccogliNodi();
    dipingi();

    if (nodi.apriTwitch) {
      if (!nodi.apriTwitch.getAttribute('href')) { nodi.apriTwitch.href = URL_CANALE; }
      nodi.apriTwitch.target = '_blank';
      nodi.apriTwitch.rel = 'noopener noreferrer';
    }

    if (nodi.chatToggle) {
      nodi.chatToggle.addEventListener('click', function () {
        apriChat(!stato.chatAperta, false);
      });
      if (!nodi.chatToggle.hasAttribute('aria-controls')) {
        nodi.chatToggle.setAttribute('aria-controls', 'twitch-chat');
      }
      nodi.chatEtichetta = nodoEtichetta(nodi.chatToggle, 'js-etichetta');
      scrivi(nodi.chatEtichetta, T.chatApri);
      nodi.chatToggle.setAttribute('aria-expanded', 'false');
    }
    if (nodi.lato) { nodi.lato.hidden = true; }

    if (!nodi.video && !nodi.chat) { return; }

    if (navigator.onLine === false) {
      mostraAvviso('rete');
      return;
    }

    const parent = costruisciParent();
    const mioHost = normalizzaHost(location.hostname);
    const autorizzato = !mioHost || parent.indexOf(mioHost) > -1;

    if (location.protocol === 'file:' || !parent.length || !autorizzato) {
      mostraAvviso(location.protocol === 'file:' ? 'file' : 'host');
      return;
    }

    stato.parent = parent;
    stato.parentQS = queryParent(parent);

    if (nodi.video) {
      costruisciGuscio();
      montaPlayer();
      preparaPieno();
      armaTimeoutStato();
      stato.timerRicontrollo = setInterval(riconcilia, RICONTROLLO);
    }

    if (nodi.chat) {
      costruisciChat();
      agganciaFuoco();
    }

    document.addEventListener('visibilitychange', allaVisibilita);

    window.addEventListener('offline', function () {
      segnaRiproduzione(false);
    });
    window.addEventListener('online', function () {
      avvisaVideo();
    });

    window.addEventListener('pagehide', smonta, { once: true });
  }

  window.Player = {
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },

    suChat: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscrittiChat.push(fn);
      informaChat(fn);
    },

    suVideo: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscrittiVideo.push(fn);
      informaVideo(fn);
    },

    diagnostica: situazioneVideo,

    dichiara: dichiara,

    riparti: riparti,

    smuta: smuta
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
