(function () {
  'use strict';

  var corpo = document.body;
  if (!corpo) { return; }

  var AVATAR_OK = 'https://static-cdn.jtvnw.net/';
  var api = corpo.getAttribute('data-api') || '';
  var ogni = Math.max(5, Math.min(60, parseInt(corpo.getAttribute('data-aggiorna'), 10) || 15));
  var quante = Math.max(1, Math.min(50, parseInt(corpo.getAttribute('data-righe'), 10) || 10));
  var conAvatar = corpo.getAttribute('data-avatar') !== '0';
  var titolo = document.getElementById('obs-titolo');
  var etag = '';
  var inCorso = false;
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!api || api.charAt(0) !== '/' || api.charAt(1) === '/') { return; }

  var colonne = [];
  Array.prototype.forEach.call(document.querySelectorAll('.obs__colonna'), function (sezione) {
    var lista = sezione.querySelector('.obs__righe');
    if (!lista) { return; }
    colonne.push({ chiave: sezione.getAttribute('data-difficolta') || '', lista: lista, vuoto: sezione.querySelector('.obs__vuoto') });
  });
  if (!colonne.length) { return; }

  function span(classe, testo) {
    var s = document.createElement('span');
    s.className = classe;
    if (testo !== undefined) { s.textContent = String(testo); }
    return s;
  }

  function posizioni(lista) {
    var mappa = {};
    Array.prototype.forEach.call(lista.querySelectorAll('.obs__riga'), function (li) {
      var login = li.getAttribute('data-login');
      if (login && !Object.prototype.hasOwnProperty.call(mappa, login)) { mappa[login] = parseInt(li.getAttribute('data-pos'), 10) || 0; }
    });
    return mappa;
  }

  function creaRiga(voce, prima) {
    var li = document.createElement('li');
    var pos = parseInt(voce.pos, 10) || 0;
    var login = typeof voce.login === 'string' ? voce.login : '';
    var livello = parseInt(voce.livello, 10) || 0;
    li.className = 'obs__riga' + (pos >= 1 && pos <= 3 ? ' obs__riga--' + pos : '');
    li.setAttribute('data-pos', String(pos));
    li.setAttribute('data-login', login);
    li.appendChild(span('obs__pos', pos));
    if (conAvatar) {
      if (typeof voce.avatar === 'string' && voce.avatar.indexOf(AVATAR_OK) === 0) {
        var img = document.createElement('img');
        img.className = 'obs__avatar';
        img.alt = '';
        img.width = 40;
        img.height = 40;
        img.referrerPolicy = 'no-referrer';
        img.src = voce.avatar;
        li.appendChild(img);
      } else {
        li.appendChild(span('obs__avatar obs__avatar--vuoto'));
      }
    }
    li.appendChild(span('obs__nome', typeof voce.nome === 'string' && voce.nome ? voce.nome : login));
    var lv = span('obs__livello');
    var piccolo = document.createElement('small');
    piccolo.textContent = 'LV';
    lv.appendChild(piccolo);
    lv.appendChild(document.createTextNode(String(livello)));
    li.appendChild(lv);
    if (!quieto && prima && login) {
      if (!Object.prototype.hasOwnProperty.call(prima, login)) { li.classList.add('is-nuova'); }
      else if (pos && prima[login] > pos) { li.classList.add('is-sale'); }
    }
    return li;
  }

  function disegnaColonna(colonna, voci, animare) {
    var prima = animare ? posizioni(colonna.lista) : null;
    var frammento = document.createDocumentFragment();
    voci.slice(0, quante).forEach(function (v) {
      if (v && typeof v === 'object') { frammento.appendChild(creaRiga(v, prima)); }
    });
    while (colonna.lista.firstChild) { colonna.lista.removeChild(colonna.lista.firstChild); }
    colonna.lista.appendChild(frammento);
    if (colonna.vuoto) { colonna.vuoto.hidden = colonna.lista.children.length > 0; }
  }

  var scheda = document.querySelector('.obs__scheda');

  function adatta() {
    if (!scheda) { return; }
    scheda.style.transform = '';
    var alta = scheda.getBoundingClientRect().height;
    var spazio = window.innerHeight - 32;
    if (alta > 0 && spazio > 0 && alta > spazio) {
      scheda.style.transformOrigin = 'top left';
      scheda.style.transform = 'scale(' + Math.max(0.4, spazio / alta).toFixed(4) + ')';
    }
  }

  function disegna(dati) {
    if (!dati || typeof dati !== 'object') { return; }
    colonne.forEach(function (colonna) {
      var voci = null;
      if (dati.gruppi && typeof dati.gruppi === 'object' && Array.isArray(dati.gruppi[colonna.chiave])) { voci = dati.gruppi[colonna.chiave]; }
      else if (Array.isArray(dati.righe) && dati.difficolta === colonna.chiave) { voci = dati.righe; }
      if (voci) { disegnaColonna(colonna, voci, true); }
    });
    if (titolo && typeof dati.titolo === 'string' && dati.titolo) { titolo.textContent = dati.titolo; }
    adatta();
  }

  function aggiorna() {
    if (inCorso) { return; }
    inCorso = true;
    var intestazioni = { 'Accept': 'application/json' };
    if (etag) { intestazioni['If-None-Match'] = etag; }
    fetch(api, { credentials: 'omit', headers: intestazioni, cache: 'no-cache' }).then(function (r) {
      if (r.status === 304 || !r.ok) { return null; }
      var nuovo = r.headers.get('ETag');
      return r.json().then(function (dati) {
        if (nuovo) { etag = nuovo; }
        return dati;
      });
    }).then(function (dati) {
      if (dati) { disegna(dati); }
    }).catch(function () {
      return null;
    }).then(function () {
      inCorso = false;
    });
  }

  adatta();
  window.addEventListener('resize', adatta);
  aggiorna();
  setInterval(aggiorna, ogni * 1000);
})();
