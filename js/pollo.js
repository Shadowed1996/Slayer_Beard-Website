(function () {
  'use strict';

  const DATI = window.DATI || {};
  const POLLO = DATI.pollo || null;
  const TWITCH = DATI.twitch || {};

  const CANALE = frase(TWITCH.canale, 'slayer_beard').toLowerCase();

  const CHIAVE_NASCOSTO = 'sb-pollo-nascosto';

  const FINESTRA = 2500;
  const FRASE_BASE = 3800;
  const FRASE_PER_LETTERA = 45;
  const MAX_TESTO = 80;
  const MAX_NOME = 25;
  const PARALLASSE = 12;

  const RIPOSO_PRIMA = 45000;
  const RIPOSO_MIN = 60000;
  const RIPOSO_MAX = 120000;

  const TENTATIVI_MAX = 5;
  const IRC_STABILE = 60000;
  const ATTESA_NASCOSTA = 60000;
  const SOGLIA_SCRIVE = 2000;

  const nodi = {};
  const vivo = {
    inOnda: false,
    scrive: false,
    nascosto: false
  };

  let timerFrase = null;
  let timerRiposo = null;
  let riposoAcceso = false;
  let ultimaFrase = '';
  let dettoOffline = false;

  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  function elenco(nome) {
    const voci = (POLLO && POLLO.frasi) ? POLLO.frasi[nome] : null;
    if (!Array.isArray(voci)) { return []; }
    return voci.filter(function (v) { return typeof v === 'string' && v.trim(); });
  }

  function pesca(voci) {
    if (!voci.length) { return ''; }
    if (voci.length === 1) { return voci[0]; }

    let scelta = ultimaFrase;
    for (let i = 0; i < 6 && scelta === ultimaFrase; i++) {
      scelta = voci[Math.floor(Math.random() * voci.length)];
    }
    ultimaFrase = scelta;
    return scelta;
  }

  function statoBase() {
    if (vivo.scrive) { return 'scrive'; }
    return vivo.inOnda ? 'live' : 'riposo';
  }

  function segnaStato(nome) {
    if (!nodi.pollo || nodi.pollo.getAttribute('data-stato') === nome) { return; }
    nodi.pollo.setAttribute('data-stato', nome);
  }

  function durataFrase(testo) {
    return FRASE_BASE + Math.min(testo.length, MAX_TESTO + 40) * FRASE_PER_LETTERA;
  }

  function reazione(testo, statoMomentaneo) {
    segnaStato(statoMomentaneo || 'parla');
    clearTimeout(timerFrase);
    clearTimeout(timerRiposo);

    if (testo && nodi.fumetto && nodi.testo) {
      nodi.testo.textContent = testo;
      nodi.fumetto.hidden = false;
    }

    timerFrase = setTimeout(taci, durataFrase(testo || ''));
  }

  function taci() {
    if (nodi.fumetto) { nodi.fumetto.hidden = true; }
    segnaStato(statoBase());
    armaRiposo();
  }

  function armaRiposo(attesa) {
    if (!riposoAcceso) { return; }
    clearTimeout(timerRiposo);
    const quando = (typeof attesa === 'number')
      ? attesa
      : RIPOSO_MIN + Math.random() * (RIPOSO_MAX - RIPOSO_MIN);
    timerRiposo = setTimeout(borbotta, quando);
  }

  function borbotta() {
    if (!riposoAcceso || vivo.nascosto) { return; }

    const occupato =
      document.visibilityState === 'hidden' ||
      vivo.scrive ||
      !!timerFinestra ||
      (nodi.fumetto && !nodi.fumetto.hidden) ||
      (Date.now() - ultimaReazione < FINESTRA);

    if (occupato) { armaRiposo(); return; }

    const testo = pesca(elenco('riposo'));
    if (!testo) { return; }

    ultimaReazione = Date.now();
    reazione(testo, 'parla');
  }

  let inAttesa = null;
  let timerFinestra = null;
  let ultimaReazione = 0;

  function proponi(messaggio) {
    inAttesa = messaggio;
    if (timerFinestra) { return; }

    const passato = Date.now() - ultimaReazione;
    timerFinestra = setTimeout(scarica, Math.max(0, FINESTRA - passato));
  }

  function scarica() {
    timerFinestra = null;
    if (!inAttesa || vivo.nascosto) { inAttesa = null; return; }

    const messaggio = inAttesa;
    inAttesa = null;
    ultimaReazione = Date.now();
    reagisci(messaggio);
  }

  const irc = {
    socket: null,
    tentativi: 0,
    timerRitardo: null,
    timerNascosta: null,
    apertaIl: 0,
    nostra: false,
    sospesa: false
  };

  function manda(testo) {
    try {
      if (irc.socket && irc.socket.readyState === 1) { irc.socket.send(testo + '\r\n'); }
    } catch (err) { }
  }

  function collega() {
    if (irc.socket || vivo.nascosto) { return; }

    let socket;
    try {
      socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (err) {
      riprova();
      return;
    }

    irc.socket = socket;
    irc.nostra = false;

    socket.addEventListener('open', function () {
      irc.apertaIl = Date.now();
      manda('CAP REQ :twitch.tv/tags');
      manda('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000)));
      manda('JOIN #' + CANALE);
    });

    socket.addEventListener('message', function (e) {
      String(e.data).split('\r\n').forEach(riga);
    });

    socket.addEventListener('close', function () {
      const durata = irc.apertaIl ? Date.now() - irc.apertaIl : 0;
      irc.socket = null;
      irc.apertaIl = 0;
      if (irc.nostra) { return; }

      if (durata > IRC_STABILE) { irc.tentativi = 0; }
      riprova();
    });

    socket.addEventListener('error', function () { });
  }

  function riprova() {
    if (irc.tentativi >= TENTATIVI_MAX || vivo.nascosto) { return; }

    const attesa = 1000 * Math.pow(2, irc.tentativi);
    irc.tentativi++;
    clearTimeout(irc.timerRitardo);
    irc.timerRitardo = setTimeout(collega, attesa);
  }

  function scollega(sospendi) {
    clearTimeout(irc.timerRitardo);
    irc.timerRitardo = null;
    irc.sospesa = !!sospendi;

    if (!irc.socket) { return; }
    irc.nostra = true;
    try { irc.socket.close(); } catch (err) { }
    irc.socket = null;
  }

  const CONTROLLO = /[\x00-\x1f\x7f]/g;

  function disescapa(valore) {
    return valore
      .replace(/\\s/g, ' ')
      .replace(/\\:/g, ';')
      .replace(/\\r/g, '')
      .replace(/\\n/g, '')
      .replace(/\\\\/g, '\\');
  }

  function leggiTag(pezzo) {
    const tag = {};
    pezzo.split(';').forEach(function (coppia) {
      const uguale = coppia.indexOf('=');
      if (uguale > 0) { tag[coppia.slice(0, uguale)] = disescapa(coppia.slice(uguale + 1)); }
    });
    return tag;
  }

  function analizza(testo) {
    let resto = testo;
    let tag = {};
    let prefisso = '';

    if (resto.charAt(0) === '@') {
      const spazio = resto.indexOf(' ');
      if (spazio === -1) { return null; }
      tag = leggiTag(resto.slice(1, spazio));
      resto = resto.slice(spazio + 1);
    }

    if (resto.charAt(0) === ':') {
      const spazio = resto.indexOf(' ');
      if (spazio === -1) { return null; }
      prefisso = resto.slice(1, spazio);
      resto = resto.slice(spazio + 1);
    }

    const spazio = resto.indexOf(' ');
    return {
      tag: tag,
      prefisso: prefisso,
      comando: spazio === -1 ? resto : resto.slice(0, spazio),
      parametri: spazio === -1 ? '' : resto.slice(spazio + 1)
    };
  }

  function ripulisciNome(valore) {
    const pulito = String(valore || '').replace(CONTROLLO, '').trim();
    return pulito.length > MAX_NOME ? pulito.slice(0, MAX_NOME) : pulito;
  }

  function riga(testo) {
    if (!testo) { return; }

    if (testo.indexOf('PING') === 0) { manda('PONG :tmi.twitch.tv'); return; }

    const m = analizza(testo);
    if (!m || m.comando !== 'PRIVMSG') { return; }

    const stacco = m.parametri.indexOf(' :');
    if (stacco === -1) { return; }

    const corpo = m.parametri.slice(stacco + 2);
    const taglio = m.prefisso.indexOf('!');
    const nick = taglio > 0 ? m.prefisso.slice(0, taglio) : m.prefisso;
    const nome = ripulisciNome(m.tag['display-name'] || nick);
    if (!nome || !corpo.trim()) { return; }

    proponi({ nome: nome, testo: corpo });
  }

  const URL_ESPLICITO = /(?:https?:\/\/|www\.)\S+/gi;
  const URL_NUDO = /\b[\w-]+\.(?:com|net|org|it|tv|gg|io|me|link|xyz|info|shop)\b(?:\/\S*)?/gi;

  function ripulisciMessaggio(testo) {
    const senzaLink = String(testo)
      .replace(URL_ESPLICITO, '')
      .replace(URL_NUDO, '')
      .replace(CONTROLLO, ' ');

    const compatto = senzaLink.replace(/\s+/g, ' ').trim();

    const lettere = Array.from(compatto);
    if (lettere.length <= MAX_TESTO) { return compatto; }
    return lettere.slice(0, MAX_TESTO - 3).join('') + '...';
  }

  function reagisci(messaggio) {
    let testo = pesca(elenco('chat')).replace(/\{nome\}/g, messaggio.nome);
    if (!testo) { testo = messaggio.nome; }

    if (POLLO.mostraMessaggi === true) {
      const corpo = ripulisciMessaggio(messaggio.testo);
      if (corpo) { testo += ' "' + corpo + '"'; }
    }

    reazione(testo, 'parla');
  }

  function quandoSiVede(elemento, fai) {
    if (!elemento) { return; }

    const osservatore = new IntersectionObserver(function (voci) {
      for (let i = 0; i < voci.length; i++) {
        if (voci[i].isIntersecting) {
          osservatore.disconnect();
          fai();
          return;
        }
      }
    }, { threshold: 0 });

    osservatore.observe(elemento);
  }

  function chatVera() {
    if (!POLLO || POLLO.chatVera !== true) { return; }

    quandoSiVede(document.getElementById('diretta') || nodi.pollo, collega);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        clearTimeout(irc.timerNascosta);
        irc.timerNascosta = setTimeout(function () { scollega(true); }, ATTESA_NASCOSTA);
        return;
      }

      clearTimeout(irc.timerNascosta);
      irc.timerNascosta = null;

      if (irc.sospesa) {
        irc.sospesa = false;
        irc.tentativi = 0;
        collega();
      }
    });

    window.addEventListener('pagehide', function () { scollega(false); });
  }

  function fraseVisitatore() {
    const senzaNome = elenco('chat').filter(function (f) { return f.indexOf('{nome}') === -1; });
    return pesca(senzaNome.length ? senzaNome : elenco('click'));
  }

  function ascoltaPlayer() {
    const Player = window.Player;
    if (!Player) { return; }

    let primoStato = true;
    Player.suStato(function (stato) {
      const acceso = !!(stato && stato.inOnda);
      const cambiato = acceso !== vivo.inOnda;
      vivo.inOnda = acceso;

      if (nodi.pollo) { nodi.pollo.classList.toggle('is-onda', acceso); }

      if (primoStato) { primoStato = false; segnaStato(statoBase()); return; }
      if (!cambiato) { return; }

      if (acceso) { reazione(pesca(elenco('live')), 'contento'); return; }

      if (!dettoOffline) {
        dettoOffline = true;
        reazione(pesca(elenco('offline')), 'riposo');
      } else {
        segnaStato(statoBase());
      }
    });

    let primaChat = true;
    let entrato = 0;
    Player.suChat(function (chat) {
      const scrive = !!(chat && chat.scrive);

      if (primaChat) {
        primaChat = false;
        vivo.scrive = scrive;
        if (scrive) { entrato = Date.now(); }
        segnaStato(statoBase());
        return;
      }

      if (scrive === vivo.scrive) { return; }
      vivo.scrive = scrive;

      if (scrive) {
        entrato = Date.now();
        reazione(pesca(elenco('scrive')), 'scrive');
        return;
      }

      if (entrato && Date.now() - entrato >= SOGLIA_SCRIVE) {
        reazione(fraseVisitatore(), 'contento');
      } else {
        segnaStato(statoBase());
      }
      entrato = 0;
    });
  }

  function ascoltaLurk() {
    const Lurk = window.Lurk;
    if (!Lurk) { return; }

    let prima = true;
    let acceso = false;
    let dettaResa = false;

    function puoParlare() {
      return !vivo.nascosto && Date.now() - ultimaReazione >= FINESTRA;
    }

    Lurk.suStato(function (stato) {
      const ora = !!(stato && stato.acceso);
      const eraAcceso = acceso;
      acceso = ora;

      if (prima) { prima = false; return; }

      if (ora && !eraAcceso) {
        dettaResa = false;
        if (puoParlare()) {
          ultimaReazione = Date.now();
          reazione(pesca(elenco('lurk')), 'contento');
        }
        return;
      }

      if (ora && stato.salute === 'resa' && !dettaResa && puoParlare()) {
        dettaResa = true;
        ultimaReazione = Date.now();
        reazione(pesca(elenco('offline')), 'riposo');
      }
    });
  }

  function comandi() {
    if (nodi.bottone) {
      nodi.bottone.addEventListener('click', function () {
        reazione(pesca(elenco('click')), 'contento');
        apriChat();
      });
    }

    if (nodi.chiudi) {
      nodi.chiudi.addEventListener('click', nascondi);
    }
  }

  function apriChat() {
    const toggle = document.getElementById('chat-toggle');
    if (!toggle || toggle.getAttribute('aria-expanded') === 'true') { return; }
    try { toggle.click(); } catch (err) { }
  }

  function riposo() {
    const fermo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (fermo || !elenco('riposo').length) { return; }

    riposoAcceso = true;
    quandoSiVede(nodi.pollo, function () { armaRiposo(RIPOSO_PRIMA); });
  }

  function nascondi() {
    vivo.nascosto = true;
    riposoAcceso = false;
    clearTimeout(timerRiposo);
    clearTimeout(timerFrase);
    if (nodi.pollo) { nodi.pollo.hidden = true; }

    scollega(false);

    try { localStorage.setItem(CHIAVE_NASCOSTO, '1'); } catch (err) { }
  }

  function giaNascosto() {
    try {
      return localStorage.getItem(CHIAVE_NASCOSTO) === '1';
    } catch (err) {
      return false;
    }
  }

  function parallasse() {
    if (!nodi.pollo) { return; }

    const fermo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia('(hover: none)').matches;
    const supportato = window.CSS && window.CSS.supports && window.CSS.supports('translate', '1px 1px');
    if (fermo || touch || !supportato) { return; }

    let x = 0;
    let y = 0;
    let inCoda = false;

    function disegna() {
      inCoda = false;
      nodi.pollo.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
    }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') { return; }
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      x = Math.max(-1, Math.min(1, nx)) * PARALLASSE;
      y = Math.max(-1, Math.min(1, ny)) * (PARALLASSE * 0.6);
      if (!inCoda) {
        inCoda = true;
        requestAnimationFrame(disegna);
      }
    }, { passive: true });
  }

  function avvia() {
    nodi.pollo = document.getElementById('pollo');
    if (!nodi.pollo) { return; }

    if (!POLLO || POLLO.attivo !== true) {
      nodi.pollo.hidden = true;
      return;
    }

    if (giaNascosto()) {
      vivo.nascosto = true;
      nodi.pollo.hidden = true;
      return;
    }

    nodi.fumetto = document.getElementById('pollo-fumetto');
    nodi.testo = nodi.fumetto ? nodi.fumetto.querySelector('.pollo__testo') : null;
    if (nodi.fumetto) { nodi.fumetto.hidden = true; }
    nodi.bottone = document.getElementById('pollo-bottone');
    nodi.chiudi = document.getElementById('pollo-chiudi');

    comandi();
    ascoltaPlayer();
    ascoltaLurk();
    parallasse();
    chatVera();
    riposo();
  }

  avvia();
}());
