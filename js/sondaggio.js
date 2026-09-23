(function () {
  'use strict';

  const INDIRIZZO = '/api/sondaggio';
  const INDIRIZZO_VOTO = '/api/sondaggio/voto';
  const OGNI_QUANTO = 20000;
  const SCADENZA_SOSPESO = 5 * 60 * 1000;

  const RIPIEGHI = {
    scadeTra: 'Chiude tra',
    chiuso: 'Sondaggio chiuso: ecco com\'è andata.',
    votato: 'Hai votato: ecco come sta andando.',
    voti: 'voti'
  };

  const sezione = document.getElementById('sondaggio');
  if (!sezione || typeof window.fetch !== 'function') { return; }
  sezione.hidden = true;

  const nodi = {
    domanda: document.getElementById('sondaggio-domanda'),
    stato: document.getElementById('sondaggio-stato'),
    risposte: document.getElementById('sondaggio-risposte'),
    errore: document.getElementById('sondaggio-errore'),
    dialogo: document.getElementById('sondaggio-login'),
    entra: document.getElementById('sondaggio-login-entra'),
    chiudi: document.getElementById('sondaggio-login-chiudi')
  };

  const daiDati = (window.DATI && window.DATI.sondaggio && window.DATI.sondaggio.testi) || {};
  const TESTI = {};
  Object.keys(RIPIEGHI).forEach(function (chiave) {
    const valore = typeof daiDati[chiave] === 'string' ? daiDati[chiave].trim() : '';
    TESTI[chiave] = valore || RIPIEGHI[chiave];
  });

  let attuale = null;
  let firma = '';
  let occupato = false;
  let sospeso = null;
  let timerLettura = 0;
  let timerOrologio = 0;
  let eraCollegato = false;

  function account() {
    return window.Account && window.Account.attivo ? window.Account : null;
  }

  function collegato() {
    const a = account();
    return !!(a && a.stato().collegato && a.token());
  }

  function intestazioni(conCorpo) {
    const testa = { Accept: 'application/json' };
    if (conCorpo) { testa['Content-Type'] = 'application/json'; }
    const a = account();
    if (a && collegato()) { testa.Authorization = 'Bearer ' + a.token(); }
    return testa;
  }

  function mostraErrore(testo) {
    nodi.errore.textContent = testo || '';
    nodi.errore.hidden = !testo;
  }

  function durata(ms) {
    const secondi = Math.max(0, Math.ceil(ms / 1000));
    const giorni = Math.floor(secondi / 86400);
    const ore = Math.floor((secondi % 86400) / 3600);
    const minuti = Math.floor((secondi % 3600) / 60);
    const resto = secondi % 60;
    if (giorni > 0) { return giorni + ' g' + (ore ? ' ' + ore + ' h' : ''); }
    if (ore > 0) { return ore + ' h' + (minuti ? ' ' + minuti + ' min' : ''); }
    if (minuti > 0) { return minuti + ' min' + (minuti < 5 && resto ? ' ' + resto + ' s' : ''); }
    return resto + ' s';
  }

  function righeDiStato() {
    const s = attuale;
    const pezzi = [];
    if (s.chiuso) {
      pezzi.push(TESTI.chiuso);
    } else {
      if (s.votato !== null) { pezzi.push(TESTI.votato); }
      pezzi.push(TESTI.scadeTra + ' ' + durata(Date.parse(s.scadeIl) - Date.now()));
    }
    if (typeof s.totale === 'number') { pezzi.push(s.totale + ' ' + TESTI.voti); }
    return pezzi.join(' · ');
  }

  function aggiornaOrologio() {
    if (!attuale) { return; }
    nodi.stato.textContent = righeDiStato();
    if (!attuale.chiuso && Date.parse(attuale.scadeIl) <= Date.now()) { leggi(); }
  }

  function percentuale(n, totale) {
    return totale > 0 ? Math.round((n / totale) * 100) : 0;
  }

  function vocePerRisultato(testo, indice) {
    const s = attuale;
    const n = s.conteggi[indice] || 0;
    const quota = percentuale(n, s.totale);
    const voce = document.createElement('div');
    voce.className = 'sondaggio__voce' + (s.votato === indice ? ' is-scelta' : '');
    const barra = document.createElement('span');
    barra.className = 'sondaggio__barra';
    barra.setAttribute('aria-hidden', 'true');
    barra.style.setProperty('--quota', quota + '%');
    const etichetta = document.createElement('span');
    etichetta.className = 'sondaggio__testo';
    etichetta.textContent = testo;
    const numero = document.createElement('span');
    numero.className = 'sondaggio__quota';
    numero.textContent = quota + '%';
    numero.title = n + ' ' + TESTI.voti;
    voce.append(barra, etichetta, numero);
    return voce;
  }

  function vocePerVoto(testo, indice) {
    const voce = document.createElement('button');
    voce.type = 'button';
    voce.className = 'sondaggio__voce';
    voce.disabled = occupato;
    const etichetta = document.createElement('span');
    etichetta.className = 'sondaggio__testo';
    etichetta.textContent = testo;
    voce.append(etichetta);
    voce.addEventListener('click', function () { vota(indice); });
    return voce;
  }

  function disegna() {
    const s = attuale;
    const risultati = s.chiuso || s.votato !== null;
    sezione.classList.toggle('is-risultati', risultati);
    nodi.domanda.textContent = s.domanda;
    const elenco = s.risposte.map(function (testo, indice) {
      const li = document.createElement('li');
      li.append(risultati ? vocePerRisultato(testo, indice) : vocePerVoto(testo, indice));
      return li;
    });
    nodi.risposte.replaceChildren.apply(nodi.risposte, elenco);
    aggiornaOrologio();
  }

  function mostra(sondaggio) {
    if (!sondaggio) {
      attuale = null;
      firma = '';
      sezione.hidden = true;
      return;
    }
    attuale = sondaggio;
    sezione.hidden = false;
    const nuova = JSON.stringify([sondaggio.id, sondaggio.chiuso, sondaggio.votato, sondaggio.conteggi, occupato]);
    if (nuova !== firma) {
      firma = nuova;
      disegna();
    } else {
      aggiornaOrologio();
    }
  }

  function leggi() {
    return fetch(INDIRIZZO, { headers: intestazioni(false), cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (dati) { if (dati) { mostra(dati.sondaggio); } })
      .catch(function () { });
  }

  function apriLogin(indice) {
    sospeso = { indice: indice, quando: Date.now(), id: attuale ? attuale.id : '' };
    nodi.entra.hidden = !account();
    if (typeof nodi.dialogo.showModal === 'function') {
      if (!nodi.dialogo.open) { nodi.dialogo.showModal(); }
    } else {
      nodi.dialogo.setAttribute('open', '');
    }
    (nodi.entra.hidden ? nodi.chiudi : nodi.entra).focus();
  }

  function chiudiLogin() {
    if (typeof nodi.dialogo.close === 'function') { nodi.dialogo.close(); } else { nodi.dialogo.removeAttribute('open'); }
  }

  function segnaOccupato(valore) {
    occupato = valore;
    Array.prototype.forEach.call(nodi.risposte.querySelectorAll('button'), function (b) { b.disabled = valore; });
  }

  function vota(indice) {
    if (!attuale || attuale.chiuso || occupato) { return; }
    mostraErrore('');
    if (!collegato()) { apriLogin(indice); return; }

    segnaOccupato(true);
    fetch(INDIRIZZO_VOTO, {
      method: 'POST',
      headers: intestazioni(true),
      credentials: 'same-origin',
      body: JSON.stringify({ id: attuale.id, risposta: indice })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (dati) { return { stato: r.status, dati: dati }; });
    }).then(function (esito) {
      segnaOccupato(false);
      if ((esito.stato === 200 || esito.stato === 409) && esito.dati.sondaggio) {
        mostra(esito.dati.sondaggio);
        return;
      }
      if (esito.stato === 401) {
        const a = account();
        if (a) { a.valida(true); }
        apriLogin(indice);
        return;
      }
      if (esito.stato === 410) { leggi(); }
      mostraErrore(esito.dati.errore || 'Il voto non è arrivato: riprova.');
    }).catch(function () {
      segnaOccupato(false);
      mostraErrore('Il voto non è arrivato: controlla la connessione e riprova.');
    });
  }

  function votaSospeso() {
    const s = sospeso;
    sospeso = null;
    if (!s || !attuale || attuale.id !== s.id || Date.now() - s.quando > SCADENZA_SOSPESO) { return; }
    if (attuale.chiuso || attuale.votato !== null) { return; }
    vota(s.indice);
  }

  nodi.entra.addEventListener('click', function () {
    const a = account();
    chiudiLogin();
    if (a) { a.entra(); }
  });
  nodi.chiudi.addEventListener('click', function () {
    sospeso = null;
    chiudiLogin();
  });
  nodi.dialogo.addEventListener('click', function (evento) {
    if (evento.target === nodi.dialogo) { sospeso = null; chiudiLogin(); }
  });
  nodi.dialogo.addEventListener('cancel', function () { sospeso = null; });

  function giro() {
    clearTimeout(timerLettura);
    timerLettura = setTimeout(function () {
      if (!document.hidden && attuale && !attuale.chiuso) {
        leggi().then(giro);
      } else {
        giro();
      }
    }, OGNI_QUANTO);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && attuale) { leggi(); }
  });

  if (window.Account && typeof window.Account.suStato === 'function') {
    window.Account.suStato(function (st) {
      const ora = !!(st && st.collegato);
      if (ora === eraCollegato) { return; }
      eraCollegato = ora;
      if (ora) {
        leggi().then(votaSospeso);
      } else {
        leggi();
      }
    });
  }

  timerOrologio = setInterval(aggiornaOrologio, 1000);
  leggi();
  giro();
}());
