(function () {
  'use strict';

  const DATI = window.DATI || {};
  const CONF = DATI.account || null;
  const LURK = DATI.lurk || {};

  const CLIENT_ID = String((CONF && CONF.clientId) || '').trim();

  const SCOPE = (LURK.messaggio && LURK.messaggio.attivo === true) ? 'user:write:chat' : '';

  const CHIAVE_STATO_OAUTH = 'sb-account-state';
  const CHIAVE_TOKEN = 'sb-account-token';
  const CHIAVE_VALIDATO = 'sb-account-validato';
  const CHIAVE_NOME = 'sb-account-nome';
  const CHIAVE_UTENTE = 'sb-account-utente';
  const CHIAVE_AVATAR = 'sb-account-avatar';

  const VALIDITA = 3600000;
  const FRESCHEZZA = 30000;
  const DURATA_AVVISO = 8000;

  const RIPIEGHI = {
    entra: 'Collegati con Twitch',
    esci: 'Scollega e revoca',
    collegato: 'Collegato come {nome}'
  };

  const TESTI = {};
  const nodi = {};
  const comandi = {};
  const iscritti = [];

  const vivo = {
    collegato: false,
    id: '',
    nome: '',
    avatar: '',
    occupato: false
  };

  let statoAtteso = '';
  let laFinestra = null;
  let timerFinestra = null;
  let timerAvviso = null;
  let ascoltoAperto = false;

  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  function crea(tag, classe, contenuto) {
    const n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (contenuto != null) { n.textContent = contenuto; }
    return n;
  }

  function bottone(etichetta, classe, quando) {
    const b = crea('button', classe, etichetta);
    b.type = 'button';
    b.addEventListener('click', quando);
    return b;
  }

  function daSessione(chiave) {
    try { return sessionStorage.getItem(chiave); } catch (err) { return null; }
  }

  function inSessione(chiave, valore) {
    try { sessionStorage.setItem(chiave, valore); } catch (err) { }
  }

  function viaSessione(chiave) {
    try { sessionStorage.removeItem(chiave); } catch (err) { }
  }

  function testo(nome) { return TESTI[nome] || ''; }

  function avviso(messaggio) {
    if (!nodi.stato) { return; }
    nodi.stato.textContent = messaggio || '';
    clearTimeout(timerAvviso);
    if (!messaggio) { return; }
    timerAvviso = setTimeout(function () {
      timerAvviso = null;
      if (nodi.stato) { nodi.stato.textContent = ''; }
    }, DURATA_AVVISO);
  }

  function istantanea() {
    return {
      collegato: vivo.collegato,
      id: vivo.id,
      nome: vivo.nome,
      avatar: vivo.avatar,
      occupato: vivo.occupato
    };
  }

  function informa(fn) {
    try {
      fn(istantanea());
    } catch (err) {
      console.warn('account: callback rotta', err);
    }
  }

  function avvisa() {
    dipingi();
    iscritti.forEach(informa);
  }

  function attivo() {
    if (!CONF || CONF.attivo !== true) { return false; }
    if (!CLIENT_ID) { return false; }
    if (!window.crypto) { return false; }
    if (location.protocol === 'https:') { return true; }
    return inSviluppo();
  }

  function inSviluppo() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  function motivoSpento() {
    if (!CONF || CONF.attivo !== true) {
      const m = String((CONF && CONF.motivo) || '');
      if (m === 'senzaClientId') {
        return 'manca client id';
      }
      return 'spento dal pannello';
    }
    if (location.protocol !== 'https:' && !inSviluppo()) {
      return 'serve https';
    }
    if (!window.crypto) {
      return 'niente crypto';
    }
    return '';
  }

  function scriviDiagnosi() {
    if (attivo() || !inSviluppo() || !nodi.blocco) { return; }
    const perche = motivoSpento();
    if (!perche) { return; }
    nodi.blocco.appendChild(crea('p', 'account__diagnosi',
      'Il collegamento con Twitch non è attivo: ' + perche
      + ' Questo avviso lo vedi solo tu, perché il sito sta girando in locale: sul sito '
      + 'pubblicato non compare a nessuno.'));
  }

  function casuale() {
    try {
      const byte = new Uint8Array(16);
      window.crypto.getRandomValues(byte);
      let s = '';
      for (let i = 0; i < byte.length; i++) { s += ('0' + byte[i].toString(16)).slice(-2); }
      return s;
    } catch (err) {
      return '';
    }
  }

  function ritorno() {
    return frase(CONF.urlRitorno, '') || (location.origin + location.pathname);
  }

  function entra() {
    if (!attivo() || vivo.collegato) { return; }

    const st = casuale();
    if (!st) { avviso('Il browser non offre un generatore casuale sicuro: il collegamento non si può fare.'); return; }

    inSessione(CHIAVE_STATO_OAUTH, st);
    statoAtteso = st;

    const url = 'https://id.twitch.tv/oauth2/authorize' +
      '?response_type=token' +
      '&client_id=' + encodeURIComponent(CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(ritorno()) +
      '&scope=' + encodeURIComponent(SCOPE) +
      '&state=' + encodeURIComponent(st);

    if (apriFinestrella(url)) { return; }

    statoAtteso = '';
    try { location.assign(url); } catch (err) { avviso('Non sono riuscito ad aprire la pagina di Twitch.'); }
  }

  function apriFinestrella(url) {
    let finestra = null;
    try {
      const larghezza = 520;
      const altezza = 760;
      const sinistra = Math.max(0, Math.round((window.screen.width - larghezza) / 2));
      const alto = Math.max(0, Math.round((window.screen.height - altezza) / 2));
      finestra = window.open(url, 'sb-account-twitch',
        'popup=yes,width=' + larghezza + ',height=' + altezza + ',left=' + sinistra + ',top=' + alto);
    } catch (err) {
      return false;
    }
    if (!finestra) { return false; }

    laFinestra = finestra;
    ascoltaRitorno();
    sorvegliaFinestrella();
    try { finestra.focus(); } catch (err) { }
    return true;
  }

  function ascoltaRitorno() {
    if (ascoltoAperto) { return; }
    ascoltoAperto = true;

    window.addEventListener('message', function (evento) {
      if (!evento || evento.origin !== location.origin) { return; }
      accogli(evento.data);
    });

    try {
      if (typeof BroadcastChannel === 'function') {
        new BroadcastChannel('sb-account').addEventListener('message', function (evento) {
          accogli(evento && evento.data);
        });
      }
    } catch (err) { }
  }

  function accogli(dati) {
    if (!dati || dati.tipo !== 'sb-account-ritorno') { return; }

    if (!statoAtteso) { return; }

    if (dati.state !== statoAtteso) {
      avviso('Il ritorno da Twitch non corrisponde alla richiesta partita da qui: collegamento annullato.');
      return;
    }

    statoAtteso = '';
    viaSessione(CHIAVE_STATO_OAUTH);
    chiudiFinestrella();

    if (dati.error) {
      avviso(dati.error === 'access_denied'
        ? 'Collegamento annullato: non hai dato il permesso a Twitch.'
        : 'Twitch ha rifiutato il collegamento.');
      return;
    }
    if (!dati.access_token) { return; }

    inSessione(CHIAVE_TOKEN, dati.access_token);
    viaSessione(CHIAVE_VALIDATO);

    vivo.occupato = true;
    avvisa();
    valida(true).then(function (ok) {
      vivo.occupato = false;
      avvisa();
      if (!ok && daSessione(CHIAVE_TOKEN)) {
        avviso('Non sono riuscito a verificare il collegamento con Twitch: riprova fra poco.');
      }
    });
  }

  function sorvegliaFinestrella() {
    if (timerFinestra) { clearInterval(timerFinestra); }
    timerFinestra = setInterval(function () {
      let chiusa = false;
      try { chiusa = !laFinestra || laFinestra.closed; } catch (err) { chiusa = true; }
      if (!chiusa) { return; }

      clearInterval(timerFinestra);
      timerFinestra = null;
      laFinestra = null;
      if (!statoAtteso) { return; }

      statoAtteso = '';
      viaSessione(CHIAVE_STATO_OAUTH);
      avviso('Collegamento annullato: la finestra di Twitch è stata chiusa.');
    }, 800);
  }

  function chiudiFinestrella() {
    if (timerFinestra) { clearInterval(timerFinestra); timerFinestra = null; }
    const f = laFinestra;
    laFinestra = null;
    if (!f) { return; }
    try { if (!f.closed) { f.close(); } } catch (err) { }
  }

  function coppie(grezzo) {
    const fuori = {};
    grezzo.split('&').forEach(function (pezzo) {
      const uguale = pezzo.indexOf('=');
      if (uguale <= 0) { return; }
      try {
        fuori[decodeURIComponent(pezzo.slice(0, uguale))] = decodeURIComponent(pezzo.slice(uguale + 1).replace(/\+/g, ' '));
      } catch (err) { }
    });
    return fuori;
  }

  function pulisciUrl() {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (err) {
      try { location.hash = ''; } catch (err2) { }
    }
  }

  function leggiRitorno() {
    const grezzo = location.hash ? location.hash.slice(1) : '';
    if (!grezzo || grezzo.indexOf('=') === -1) { return; }

    const p = coppie(grezzo);
    if (!p.access_token && !p.error) { return; }

    pulisciUrl();

    const atteso = daSessione(CHIAVE_STATO_OAUTH);
    viaSessione(CHIAVE_STATO_OAUTH);

    if (!atteso || p.state !== atteso) {
      avviso('Il ritorno da Twitch non corrisponde alla richiesta partita da qui: collegamento annullato.');
      return;
    }
    if (p.error) {
      avviso(p.error === 'access_denied'
        ? 'Collegamento annullato: non hai dato il permesso a Twitch.'
        : 'Twitch ha rifiutato il collegamento.');
      return;
    }

    inSessione(CHIAVE_TOKEN, p.access_token);
    viaSessione(CHIAVE_VALIDATO);

    valida(true).then(function (ok) {
      if (ok) { tornaAlProfilo(); return; }
      if (daSessione(CHIAVE_TOKEN)) {
        avviso('Non sono riuscito a verificare il collegamento con Twitch: riprova fra poco.');
      }
    });
  }

  function tornaAlProfilo() {
    const bersaglio = document.getElementById('diretta');
    if (!bersaglio) { return; }

    let dolce = false;
    try {
      dolce = !(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) { dolce = false; }
    try {
      bersaglio.scrollIntoView({ behavior: dolce ? 'smooth' : 'auto', block: 'start' });
    } catch (err) {
      try { bersaglio.scrollIntoView(); } catch (err2) { }
    }
    try {
      bersaglio.setAttribute('tabindex', '-1');
      bersaglio.focus({ preventScroll: true });
    } catch (err) { }
  }

  function dimentica(messaggio) {
    viaSessione(CHIAVE_TOKEN);
    viaSessione(CHIAVE_VALIDATO);
    viaSessione(CHIAVE_NOME);
    viaSessione(CHIAVE_UTENTE);
    viaSessione(CHIAVE_AVATAR);
    vivo.collegato = false;
    vivo.id = '';
    vivo.nome = '';
    vivo.avatar = '';
    avvisa();
    if (messaggio) { avviso(messaggio); }
  }

  function valida(forza) {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token) { return Promise.resolve(false); }

    const quando = Number(daSessione(CHIAVE_VALIDATO)) || 0;
    if (quando && vivo.id) {
      const eta = Date.now() - quando;
      if (!forza && eta < VALIDITA) { return Promise.resolve(true); }
      if (forza && eta < FRESCHEZZA) { return Promise.resolve(true); }
    }

    return fetch('https://id.twitch.tv/oauth2/validate', {
      method: 'GET',
      headers: { Authorization: 'OAuth ' + token }
    }).then(function (r) {
      if (r.status === 401) {
        dimentica('Il collegamento con Twitch è scaduto: ricollegati.');
        return false;
      }
      if (!r.ok) { return false; }

      return r.json().then(function (d) {
        if (!d || !d.user_id) { dimentica(''); return false; }
        if (d.client_id && d.client_id !== CLIENT_ID) {
          dimentica('Il token non appartiene a questa applicazione: collegamento annullato.');
          return false;
        }

        vivo.id = String(d.user_id);
        if (!vivo.nome) { vivo.nome = String(d.login || ''); }
        vivo.collegato = true;
        inSessione(CHIAVE_VALIDATO, String(Date.now()));
        inSessione(CHIAVE_NOME, vivo.nome);
        inSessione(CHIAVE_UTENTE, vivo.id);
        avvisa();
        if (!vivo.avatar) { profilo(); }
        return true;
      }, function () { return false; });
    }, function () {
      return false;
    });
  }

  function profilo() {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token || !vivo.id) { return; }

    fetch('https://api.twitch.tv/helix/users', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': CLIENT_ID }
    }).then(function (r) {
      if (!r || !r.ok) { return null; }
      return r.json();
    }).then(function (d) {
      const voce = (d && Array.isArray(d.data)) ? d.data[0] : null;
      if (!voce) { return; }

      const nome = String(voce.display_name || '').trim();
      if (nome) { vivo.nome = nome; inSessione(CHIAVE_NOME, nome); }

      const immagine = String(voce.profile_image_url || '').trim();
      if (/^https:\/\//i.test(immagine)) {
        vivo.avatar = immagine;
        inSessione(CHIAVE_AVATAR, immagine);
      }
      avvisa();
    }, function () { });
  }

  function ripristina() {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token) { avvisa(); return; }

    vivo.id = daSessione(CHIAVE_UTENTE) || '';
    vivo.nome = daSessione(CHIAVE_NOME) || '';
    vivo.avatar = daSessione(CHIAVE_AVATAR) || '';
    vivo.collegato = !!vivo.id;
    avvisa();
    valida(false);
  }

  function esci() {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token) { dimentica(''); return; }

    vivo.occupato = true;
    avvisa();

    fetch('https://id.twitch.tv/oauth2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=' + encodeURIComponent(CLIENT_ID) + '&token=' + encodeURIComponent(token)
    }).then(function (r) {
      if (r.ok) {
        avviso('Collegamento revocato su Twitch.');
      } else {
        avviso('Twitch non ha revocato il token (errore ' + r.status + '): toglilo a mano da Impostazioni → Connessioni.');
      }
    }, function () {
      avviso('Non sono riuscito a contattare Twitch: il token resta valido finché non lo togli da Impostazioni → Connessioni.');
    }).then(function () {
      vivo.occupato = false;
      dimentica('');
    });
  }

  function costruisci() {
    comandi.avatar = crea('img', 'account__avatar');
    comandi.avatar.hidden = true;
    comandi.avatar.setAttribute('alt', '');
    comandi.avatar.setAttribute('width', '28');
    comandi.avatar.setAttribute('height', '28');
    comandi.avatar.setAttribute('aria-hidden', 'true');
    comandi.avatar.setAttribute('loading', 'lazy');
    comandi.avatar.addEventListener('error', function () {
      vivo.avatar = '';
      comandi.avatar.hidden = true;
    });
    nodi.tessera.appendChild(comandi.avatar);

    comandi.chi = crea('span', 'account__chi', '');
    comandi.chi.hidden = true;
    nodi.tessera.appendChild(comandi.chi);

    comandi.entra = bottone(testo('entra'), 'btn btn--vuoto', entra);
    nodi.tessera.appendChild(comandi.entra);

    comandi.esci = bottone(testo('esci'), 'btn btn--vuoto', esci);
    comandi.esci.hidden = true;
    nodi.tessera.appendChild(comandi.esci);
  }

  function dipingi() {
    if (!comandi.entra) { return; }

    comandi.entra.hidden = vivo.collegato;
    comandi.entra.disabled = vivo.occupato;
    comandi.esci.hidden = !vivo.collegato;
    comandi.esci.disabled = vivo.occupato;

    comandi.chi.hidden = !vivo.collegato;
    comandi.chi.textContent = vivo.collegato
      ? testo('collegato').replace(/\{nome\}/g, vivo.nome)
      : '';

    const mostraAvatar = vivo.collegato && !!vivo.avatar;
    comandi.avatar.hidden = !mostraAvatar;
    if (mostraAvatar && comandi.avatar.getAttribute('src') !== vivo.avatar) {
      comandi.avatar.setAttribute('src', vivo.avatar);
      comandi.avatar.setAttribute('alt', '');
    }

    if (nodi.nota) { nodi.nota.hidden = vivo.collegato; }
  }

  window.Account = {
    attivo: false,

    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },

    stato: istantanea,
    entra: entra,
    esci: esci,
    valida: valida,

    token: function () { return daSessione(CHIAVE_TOKEN) || ''; },
    id: function () { return vivo.id; },
    clientId: CLIENT_ID,

    avviso: avviso
  };

  function ascoltaVisibilita() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }
      if (vivo.collegato) { valida(false); }
    });
  }

  function avvia() {
    nodi.tessera = document.getElementById('account');
    if (!nodi.tessera) { return; }

    nodi.blocco = nodi.tessera.parentNode;
    nodi.nota = document.getElementById('account-nota');
    nodi.stato = document.getElementById('account-stato');

    const daiDati = (CONF && CONF.testi) || {};
    Object.keys(RIPIEGHI).forEach(function (chiave) {
      TESTI[chiave] = frase(daiDati[chiave], RIPIEGHI[chiave]);
    });

    if (!attivo()) {
      if (nodi.nota) { nodi.nota.hidden = true; }
      try { scriviDiagnosi(); } catch (err) { }
      return;
    }

    window.Account.attivo = true;
    costruisci();
    dipingi();

    try {
      ascoltaVisibilita();
      ripristina();
      leggiRitorno();
    } catch (err) {
      console.warn('[account] il collegamento con Twitch non è partito:', err);
    }
  }

  avvia();
}());
