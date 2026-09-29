(function () {
  'use strict';

  const DATI = window.DATI || {};
  const TWITCH = DATI.twitch || {};
  const CANALE = String(TWITCH.idUtente || '').trim();

  const GIRO = 120000;
  const RIPROVA = 30000;

  const nodi = {};
  const iscritti = [];

  const vivo = {
    inOnda: null,
    titolo: '',
    ultima: '',
    follower: null,
    quando: 0
  };

  let timer = null;
  let inVolo = false;
  let ultimaLettura = 0;

  function account() {
    const A = window.Account;
    return (A && A.attivo === true && typeof A.token === 'function') ? A : null;
  }

  function player(metodo) {
    const P = window.Player;
    return (P && typeof P[metodo] === 'function') ? P : null;
  }

  function istantanea() {
    return { inOnda: vivo.inOnda, titolo: vivo.titolo, ultima: vivo.ultima, quando: vivo.quando };
  }

  function avvisa() {
    iscritti.forEach(function (fn) {
      try {
        fn(istantanea());
      } catch (err) {
        console.warn('canale - errore in un ascoltatore', err);
      }
    });
  }

  function chiediGrezzo(percorso) {
    const A = account();
    if (!A) { return Promise.resolve(null); }
    const token = A.token();
    if (!token) { return Promise.resolve(null); }

    return fetch('https://api.twitch.tv/helix/' + percorso, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': A.clientId }
    }).then(function (r) {
      if (!r || !r.ok) { return null; }
      return r.json();
    }, function () {
      return null;
    }).then(function (d) {
      return (d && typeof d === 'object') ? d : null;
    }, function () {
      return null;
    });
  }

  function chiedi(percorso) {
    return chiediGrezzo(percorso).then(function (d) {
      return (d && Array.isArray(d.data)) ? d.data : null;
    });
  }

  function numeroTesto(valore) {
    const n = Math.max(0, Math.round(Number(valore) || 0));
    const cifre = String(n);
    let fuori = '';
    for (let i = 0; i < cifre.length; i++) {
      if (i > 0 && (cifre.length - i) % 3 === 0) { fuori += '.'; }
      fuori += cifre[i];
    }
    return fuori;
  }

  function chiediDiretta() {
    return chiedi('streams?user_id=' + encodeURIComponent(CANALE)).then(function (data) {
      if (data === null) { return false; }

      const voce = data[0] || null;
      const acceso = !!voce;
      const titolo = voce ? String(voce.title || '').trim() : '';

      vivo.inOnda = acceso;
      vivo.titolo = titolo;
      vivo.quando = Date.now();

      const P = player('dichiara');
      if (P) { P.dichiara(acceso, titolo); }
      return true;
    });
  }

  function chiediUltima() {
    return chiedi('videos?user_id=' + encodeURIComponent(CANALE) + '&type=archive&first=1&sort=time')
      .then(function (data) {
        const voce = (data && data[0]) || null;
        const titolo = voce ? String(voce.title || '').trim() : '';
        if (titolo) { return titolo; }
        return chiedi('channels?broadcaster_id=' + encodeURIComponent(CANALE)).then(function (canali) {
          const c = (canali && canali[0]) || null;
          return c ? String(c.title || '').trim() : '';
        });
      })
      .then(function (titolo) {
        if (!titolo || titolo === vivo.ultima) { return; }
        vivo.ultima = titolo;
        scriviUltima(titolo);
      });
  }

  function chiediFollower() {
    return chiediGrezzo('channels/followers?broadcaster_id=' + encodeURIComponent(CANALE) + '&first=1')
      .then(function (d) {
        const totale = (d && d.total !== null && d.total !== undefined && d.total !== '') ? Number(d.total) : NaN;
        if (!isFinite(totale) || totale < 0) { return; }
        const tondo = Math.round(totale);
        if (tondo === vivo.follower) { return; }
        vivo.follower = tondo;
        scriviFollower(tondo);
      });
  }

  function scriviFollower(totale) {
    const testo = numeroTesto(totale);
    for (let i = 0; i < nodi.follower.length; i++) {
      nodi.follower[i].textContent = testo;
      nodi.follower[i].setAttribute('data-fonte', 'twitch');
    }
  }

  function scriviUltima(titolo) {
    if (!nodi.ultima) { return; }
    nodi.ultima.textContent = titolo;
    nodi.ultima.setAttribute('data-fonte', 'twitch');
    avvisa();
  }

  function giro() {
    if (inVolo || !account() || !CANALE) { return; }
    if (document.visibilityState !== 'visible') { return; }
    if (!window.Account.stato().collegato) { return; }

    inVolo = true;
    ultimaLettura = Date.now();

    Promise.resolve(window.Account.valida(false))
      .then(function (ok) {
        if (!ok) { return null; }
        return chiediDiretta().then(function (andata) {
          if (!andata) { return null; }
          return chiediUltima().then(chiediFollower);
        });
      })
      .then(null, function (err) { console.warn('[canale] giro non riuscito:', err); })
      .then(function () {
        inVolo = false;
        avvisa();
      });
  }

  function avvia() {
    if (!CANALE) { return; }
    nodi.ultima = document.getElementById('ultima');
    nodi.follower = Array.prototype.slice.call(document.querySelectorAll('[data-follower]'));

    const A = account();
    if (!A) { return; }

    A.suStato(function (stato) {
      if (!stato.collegato) {
        ferma();
        return;
      }
      accendi();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }
      if (!window.Account.stato().collegato) { return; }
      if (Date.now() - ultimaLettura >= GIRO) { giro(); }
      accendi();
    });
  }

  function accendi() {
    giro();
    if (timer) { return; }
    timer = setInterval(function () {
      if (Date.now() - ultimaLettura < RIPROVA) { return; }
      giro();
    }, GIRO);
  }

  function ferma() {
    if (timer) { clearInterval(timer); timer = null; }
    vivo.inOnda = null;
    vivo.titolo = '';
    avvisa();
  }

  window.Canale = {
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      try { fn(istantanea()); } catch (err) { console.warn('[canale] iscritto in errore:', err); }
    },
    stato: istantanea,
    aggiorna: giro
  };

  avvia();
}());
