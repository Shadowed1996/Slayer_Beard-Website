(function () {
  'use strict';

  var CHIAVE_APERTO = 'sb-musica-aperto';
  var CHIAVE_VOLUME = 'sb-musica-volume';
  var CHIAVE_MUTO = 'sb-musica-muto';
  var CHIAVE_CASUALE = 'sb-musica-casuale';

  var VOLUME_DI_SERIE = 70;
  var BARRE = 56;
  var CAMPIONI_AL_SECONDO = 8000;
  var SFILA_AL_SECONDO = 26;
  var LATO_TINTA = 16;
  var TINTA_MINIMA = 150;

  var nodi = null;
  var tracce = [];
  var testi = {};
  var indice = 0;
  var caricata = -1;
  var trascina = false;
  var casuale = false;
  var ordine = [];
  var posizione = 0;
  var videoAndava = false;
  var lurkAcceso = false;
  var iscritti = [];
  var picchi = {};
  var inAnalisi = {};
  var voci = [];
  var tinte = null;
  var tinteCover = {};

  function leggi(chiave) {
    try { return window.localStorage.getItem(chiave); } catch (err) { return null; }
  }

  function scrivi(chiave, valore) {
    try { window.localStorage.setItem(chiave, String(valore)); } catch (err) { return; }
  }

  function orologio(secondi) {
    if (typeof secondi !== 'number' || !isFinite(secondi) || secondi < 0) { return '0:00'; }
    var interi = Math.floor(secondi);
    var minuti = Math.floor(interi / 60);
    var resto = interi % 60;
    return minuti + ':' + (resto < 10 ? '0' : '') + resto;
  }

  function dueCifre(numero) {
    return (numero < 10 ? '0' : '') + numero;
  }

  function riempi(cursore, quota) {
    cursore.style.setProperty('--musica-riempito', Math.max(0, Math.min(100, quota)) + '%');
  }

  function suona() {
    return !!(nodi && nodi.audio.src && !nodi.audio.paused && !nodi.audio.ended);
  }

  function aperto() {
    return !!(nodi && nodi.guscio.getAttribute('data-aperto') === '1');
  }

  function situazione() {
    var voce = tracce[indice] || null;
    return {
      suona: suona(),
      aperto: aperto(),
      indice: indice,
      quante: tracce.length,
      titolo: voce ? voce.titolo : '',
      artista: voce ? voce.artista : ''
    };
  }

  function informa(fn) {
    try {
      fn(situazione());
    } catch (err) {
      console.warn('[musica] un iscritto a suStato è andato in errore:', err);
    }
  }

  function avvisa() {
    for (var i = 0; i < iscritti.length; i++) { informa(iscritti[i]); }
  }

  function dillo(messaggio) {
    nodi.stato.textContent = messaggio || '';
  }

  /* ---------------------------------------------------------------- */

  function colori() {
    if (tinte) { return tinte; }
    var stile = getComputedStyle(document.documentElement);
    var ripiego = getComputedStyle(nodi.tela).color;
    tinte = {
      fatto: stile.getPropertyValue('--ciano').trim() || ripiego,
      restante: stile.getPropertyValue('--linea-comando').trim() || ripiego
    };
    return tinte;
  }

  function tintaDi(immagine) {
    var tela = document.createElement('canvas');
    tela.width = LATO_TINTA;
    tela.height = LATO_TINTA;
    var contesto = tela.getContext ? tela.getContext('2d') : null;
    if (!contesto) { return null; }
    contesto.drawImage(immagine, 0, 0, LATO_TINTA, LATO_TINTA);

    var dati;
    try {
      dati = contesto.getImageData(0, 0, LATO_TINTA, LATO_TINTA).data;
    } catch (err) {
      return null;
    }

    var rosso = 0, verde = 0, blu = 0, peso = 0;
    for (var i = 0; i < dati.length; i += 4) {
      if (dati[i + 3] < 128) { continue; }
      var massimo = Math.max(dati[i], dati[i + 1], dati[i + 2]);
      var minimo = Math.min(dati[i], dati[i + 1], dati[i + 2]);
      var quanto = 1 + ((massimo - minimo) / 255) * 3;
      rosso += dati[i] * quanto;
      verde += dati[i + 1] * quanto;
      blu += dati[i + 2] * quanto;
      peso += quanto;
    }
    if (!peso) { return null; }

    var fuori = [Math.round(rosso / peso), Math.round(verde / peso), Math.round(blu / peso)];
    var luce = Math.max(fuori[0], fuori[1], fuori[2]);
    if (luce > 0 && luce < TINTA_MINIMA) {
      var spinta = TINTA_MINIMA / luce;
      fuori = [
        Math.min(255, Math.round(fuori[0] * spinta)),
        Math.min(255, Math.round(fuori[1] * spinta)),
        Math.min(255, Math.round(fuori[2] * spinta))
      ];
    }
    return fuori;
  }

  function tingi(voce) {
    if (!voce || !voce.cover) {
      nodi.riquadro.style.removeProperty('--musica-rgb');
      return;
    }
    if (tinteCover[voce.cover]) {
      nodi.riquadro.style.setProperty('--musica-rgb', tinteCover[voce.cover]);
      return;
    }
    var immagine = new Image();
    immagine.onload = function () {
      var trovata = tintaDi(immagine);
      if (!trovata) { return; }
      tinteCover[voce.cover] = trovata.join(' ');
      if (tracce[indice] && tracce[indice].cover === voce.cover) {
        nodi.riquadro.style.setProperty('--musica-rgb', tinteCover[voce.cover]);
      }
    };
    immagine.src = voce.cover;
  }

  function ondaFinta(src) {
    var lista = [];
    var seme = 0;
    for (var c = 0; c < src.length; c++) { seme = (seme * 31 + src.charCodeAt(c)) % 9973; }
    for (var i = 0; i < BARRE; i++) {
      seme = (seme * 1103515245 + 12345) % 2147483648;
      var caso = (seme / 2147483648);
      var arco = Math.sin((i / BARRE) * Math.PI);
      lista.push(0.25 + arco * 0.45 + caso * 0.3);
    }
    return lista;
  }

  function disegnaOnda() {
    if (!nodi || !nodi.tela) { return; }
    var contesto = nodi.tela.getContext ? nodi.tela.getContext('2d') : null;
    if (!contesto) { return; }

    var voce = tracce[indice];
    var lista = (voce && picchi[voce.src]) || (voce ? ondaFinta(voce.src) : []);
    if (!lista.length) { return; }

    var densita = window.devicePixelRatio || 1;
    var largo = Math.max(1, Math.round(nodi.onda.clientWidth * densita));
    var alto = Math.max(1, Math.round(nodi.onda.clientHeight * densita));
    if (nodi.tela.width !== largo || nodi.tela.height !== alto) {
      nodi.tela.width = largo;
      nodi.tela.height = alto;
    }

    var durata = nodi.audio.duration;
    var quota = (typeof durata === 'number' && isFinite(durata) && durata > 0)
      ? nodi.audio.currentTime / durata
      : 0;
    if (trascina) { quota = (parseInt(nodi.cursore.value, 10) || 0) / 1000; }

    var tinta = colori();
    var passo = largo / lista.length;
    var spessore = Math.max(1, passo * 0.55);
    contesto.clearRect(0, 0, largo, alto);

    for (var i = 0; i < lista.length; i++) {
      var altezza = Math.max(2 * densita, lista[i] * alto);
      var x = i * passo + (passo - spessore) / 2;
      var y = (alto - altezza) / 2;
      contesto.fillStyle = ((i + 0.5) / lista.length) <= quota ? tinta.fatto : tinta.restante;
      contesto.globalAlpha = ((i + 0.5) / lista.length) <= quota ? 1 : 0.55;
      contesto.beginPath();
      if (typeof contesto.roundRect === 'function') {
        contesto.roundRect(x, y, spessore, altezza, spessore / 2);
      } else {
        contesto.rect(x, y, spessore, altezza);
      }
      contesto.fill();
    }
    contesto.globalAlpha = 1;
  }

  function analizza(voce) {
    if (!voce || picchi[voce.src] || inAnalisi[voce.src]) { return; }
    var Contesto = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (typeof window.fetch !== 'function' || typeof Contesto !== 'function') { return; }
    inAnalisi[voce.src] = true;

    window.fetch(voce.src).then(function (risposta) {
      if (!risposta.ok) { throw new Error('http ' + risposta.status); }
      return risposta.arrayBuffer();
    }).then(function (dati) {
      var contesto = new Contesto(1, 1, CAMPIONI_AL_SECONDO);
      return contesto.decodeAudioData(dati);
    }).then(function (suono) {
      var campioni = suono.getChannelData(0);
      var perBarra = Math.floor(campioni.length / BARRE) || 1;
      var lista = [];
      var massimo = 0;
      for (var i = 0; i < BARRE; i++) {
        var cima = 0;
        var da = i * perBarra;
        var a = Math.min(campioni.length, da + perBarra);
        for (var j = da; j < a; j++) {
          var valore = campioni[j] < 0 ? -campioni[j] : campioni[j];
          if (valore > cima) { cima = valore; }
        }
        lista.push(cima);
        if (cima > massimo) { massimo = cima; }
      }
      for (var k = 0; k < lista.length; k++) {
        lista[k] = massimo > 0 ? Math.max(0.12, lista[k] / massimo) : 0.12;
      }
      picchi[voce.src] = lista;
      delete inAnalisi[voce.src];
      disegnaOnda();
    })['catch'](function (err) {
      delete inAnalisi[voce.src];
      console.warn('[musica] non sono riuscito a leggere la forma d onda:', err);
    });
  }

  /* ---------------------------------------------------------------- */

  function misuraScorrimento() {
    var titolo = nodi.titolo;
    titolo.classList.remove('is-lunga');
    titolo.style.removeProperty('--musica-corsa');
    titolo.style.removeProperty('--musica-sfila');
    var corsa = titolo.scrollWidth - nodi.scorri.clientWidth;
    if (corsa > 4) {
      titolo.style.setProperty('--musica-corsa', '-' + corsa + 'px');
      titolo.style.setProperty('--musica-sfila', Math.max(4, corsa / SFILA_AL_SECONDO) + 's');
      titolo.classList.add('is-lunga');
    }
  }

  function segnaElenco() {
    for (var i = 0; i < voci.length; i++) {
      var attiva = i === indice;
      voci[i].classList.toggle('is-attiva', attiva);
      voci[i].setAttribute('aria-current', attiva ? 'true' : 'false');
    }
  }

  function costruisciElenco() {
    voci = [];
    var pezzi = document.createDocumentFragment();
    for (var i = 0; i < tracce.length; i++) {
      var riga = document.createElement('li');
      var bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = 'musica__voce';

      var numero = document.createElement('span');
      numero.className = 'musica__numero';
      numero.textContent = dueCifre(i + 1);

      var nome = document.createElement('span');
      nome.className = 'musica__nome';
      nome.textContent = tracce[i].artista
        ? tracce[i].titolo + ' · ' + tracce[i].artista
        : tracce[i].titolo;

      bottone.appendChild(numero);
      bottone.appendChild(nome);
      bottone.addEventListener('click', saltaA(i));
      riga.appendChild(bottone);
      pezzi.appendChild(riga);
      voci.push(bottone);
    }
    nodi.elenco.replaceChildren(pezzi);
    segnaElenco();
  }

  function saltaA(quale) {
    return function () {
      carica(quale, true);
      mostraElenco(false);
    };
  }

  function mostraElenco(mostra) {
    nodi.elenco.hidden = !mostra;
    nodi.elencoApri.setAttribute('aria-expanded', mostra ? 'true' : 'false');
    if (mostra && voci[indice]) { voci[indice].focus(); }
  }

  /* ---------------------------------------------------------------- */

  function mostraTraccia() {
    var voce = tracce[indice];
    if (!voce) { return; }
    nodi.titolo.textContent = voce.titolo;
    nodi.artista.textContent = voce.artista;
    nodi.conta.textContent = dueCifre(indice + 1) + '/' + dueCifre(tracce.length);

    if (voce.cover) {
      nodi.cover.src = voce.cover;
      nodi.cover.hidden = false;
    } else {
      nodi.cover.removeAttribute('src');
      nodi.cover.hidden = true;
    }
    nodi.guscio.classList.toggle('is-copertina', !!voce.cover);
    tingi(voce);
    misuraScorrimento();
    segnaElenco();
  }

  function carica(quale, poiSuona) {
    if (!tracce.length) { return; }
    indice = ((quale % tracce.length) + tracce.length) % tracce.length;
    var dove = ordine.indexOf(indice);
    if (dove > -1) { posizione = dove; }
    mostraTraccia();

    if (caricata !== indice) {
      caricata = indice;
      nodi.audio.src = tracce[indice].src;
      nodi.audio.load();
      nodi.cursore.value = 0;
      nodi.cursore.disabled = true;
      nodi.trascorso.textContent = '0:00';
      nodi.durata.textContent = '0:00';
      disegnaOnda();
      analizza(tracce[indice]);
    }

    if (poiSuona) { parti(); }
    avvisa();
  }

  function parti() {
    if (!tracce.length) { return; }
    if (!nodi.audio.src) { carica(indice, false); }
    var promessa = nodi.audio.play();
    if (promessa && typeof promessa['catch'] === 'function') {
      promessa['catch'](function (err) {
        dillo(testi.bloccato || '');
        console.warn('[musica] il browser ha rifiutato la riproduzione:', err);
        dipingi();
      });
    }
  }

  function ferma() {
    nodi.audio.pause();
  }

  function alterna() {
    if (suona()) { ferma(); } else { parti(); }
  }

  function rimescola(primo) {
    var lista = [];
    for (var i = 0; i < tracce.length; i++) { lista.push(i); }

    if (casuale) {
      for (var j = lista.length - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var scambio = lista[j];
        lista[j] = lista[k];
        lista[k] = scambio;
      }
      var dove = lista.indexOf(primo);
      if (dove > 0) {
        lista.splice(dove, 1);
        lista.unshift(primo);
      }
    }

    ordine = lista;
    posizione = Math.max(0, ordine.indexOf(primo));
  }

  function successiva(automatica) {
    if (!tracce.length) { return; }
    var poiSuona = automatica || suona();
    var prossima = posizione + 1;
    if (prossima >= ordine.length) {
      if (casuale) {
        rimescola(indice);
        prossima = ordine.length > 1 ? 1 : 0;
      } else {
        prossima = 0;
      }
    }
    carica(ordine[prossima], poiSuona);
  }

  function precedente() {
    if (!tracce.length) { return; }
    if (nodi.audio.currentTime > 3) {
      nodi.audio.currentTime = 0;
      return;
    }
    var prima = posizione - 1;
    if (prima < 0) { prima = ordine.length - 1; }
    carica(ordine[prima], suona());
  }

  function alternaCasuale() {
    casuale = !casuale;
    scrivi(CHIAVE_CASUALE, casuale ? '1' : '0');
    rimescola(indice);
    dipingiCasuale();
  }

  function dipingiCasuale() {
    nodi.guscio.classList.toggle('is-casuale', casuale);
    nodi.casuale.setAttribute('aria-pressed', casuale ? 'true' : 'false');
    var etichetta = casuale ? testi.ordine : testi.casuale;
    nodi.casuale.setAttribute('aria-label', etichetta);
    nodi.casuale.setAttribute('title', etichetta);
  }

  /* ---------------------------------------------------------------- */

  function dipingi() {
    var acceso = suona();
    nodi.guscio.classList.toggle('is-suona', acceso);
    var etichetta = acceso ? testi.pausa : testi.play;
    nodi.play.setAttribute('aria-label', etichetta);
    nodi.play.setAttribute('title', etichetta);
    avvisa();
  }

  function segnaTempo() {
    var durata = nodi.audio.duration;
    if (typeof durata === 'number' && isFinite(durata) && durata > 0) {
      nodi.cursore.disabled = false;
      nodi.durata.textContent = orologio(durata);
      if (!trascina) {
        nodi.cursore.value = String(Math.round((nodi.audio.currentTime / durata) * 1000));
      }
    }
    if (!trascina) { nodi.trascorso.textContent = orologio(nodi.audio.currentTime); }
    disegnaOnda();
  }

  function applicaVolume(livello, dallUtente) {
    var pulito = Math.max(0, Math.min(100, Math.round(livello)));
    nodi.audio.volume = pulito / 100;
    nodi.livello.value = String(pulito);
    riempi(nodi.livello, pulito);
    if (dallUtente) {
      scrivi(CHIAVE_VOLUME, pulito);
      if (pulito > 0 && nodi.audio.muted) { applicaMuto(false, true); }
    }
  }

  function applicaMuto(muta, dallUtente) {
    nodi.audio.muted = !!muta;
    nodi.guscio.classList.toggle('is-muta', !!muta);
    var etichetta = muta ? testi.suono : testi.muto;
    nodi.muto.setAttribute('aria-label', etichetta);
    nodi.muto.setAttribute('title', etichetta);
    if (dallUtente) { scrivi(CHIAVE_MUTO, muta ? '1' : '0'); }
  }

  /* ---------------------------------------------------------------- */

  function apriChiudi(apri, dalGesto) {
    nodi.guscio.setAttribute('data-aperto', apri ? '1' : '0');
    nodi.riduci.setAttribute('aria-expanded', apri ? 'true' : 'false');
    nodi.apri.setAttribute('aria-expanded', apri ? 'true' : 'false');
    scrivi(CHIAVE_APERTO, apri ? '1' : '0');
    if (!apri) { mostraElenco(false); }
    if (dalGesto) {
      if (apri) { nodi.play.focus(); } else { nodi.apri.focus(); }
    }
    if (apri) {
      misuraScorrimento();
      disegnaOnda();
    }
    avvisa();
  }

  /* ---------------------------------------------------------------- */

  function collegaDiretta() {
    if (window.Player && typeof window.Player.suVideo === 'function') {
      window.Player.suVideo(function (video) {
        var adesso = !!(video && video.riproduce);
        if (adesso && !videoAndava && suona()) { ferma(); }
        videoAndava = adesso;
      });
    }

    if (window.Lurk && typeof window.Lurk.suStato === 'function') {
      window.Lurk.suStato(function (lurk) {
        var adesso = !!(lurk && lurk.acceso);
        if (adesso && !lurkAcceso && suona()) { ferma(); }
        lurkAcceso = adesso;
      });
    }
  }

  /* ---------------------------------------------------------------- */

  function prendiNodi() {
    var guscio = document.getElementById('musica');
    if (!guscio) { return null; }
    var pezzi = {
      guscio: guscio,
      riquadro: document.getElementById('musica-riquadro'),
      riduci: document.getElementById('musica-riduci'),
      apri: document.getElementById('musica-apri'),
      conta: document.getElementById('musica-conta'),
      titolo: document.getElementById('musica-titolo'),
      artista: document.getElementById('musica-artista'),
      casuale: document.getElementById('musica-casuale'),
      cover: document.getElementById('musica-cover'),
      cursore: document.getElementById('musica-cursore'),
      tela: document.getElementById('musica-tela'),
      trascorso: document.getElementById('musica-trascorso'),
      durata: document.getElementById('musica-durata'),
      precedente: document.getElementById('musica-precedente'),
      play: document.getElementById('musica-play'),
      successiva: document.getElementById('musica-successiva'),
      muto: document.getElementById('musica-muto'),
      livello: document.getElementById('musica-livello'),
      elenco: document.getElementById('musica-elenco'),
      elencoApri: document.getElementById('musica-elenco-apri'),
      stato: document.getElementById('musica-stato'),
      audio: document.getElementById('musica-audio')
    };
    for (var chiave in pezzi) {
      if (Object.prototype.hasOwnProperty.call(pezzi, chiave) && !pezzi[chiave]) { return null; }
    }
    pezzi.scorri = pezzi.titolo.parentNode;
    pezzi.onda = pezzi.tela.parentNode;
    return pezzi;
  }

  function avvia() {
    var dati = (window.DATI && window.DATI.musica) ? window.DATI.musica : null;
    if (!dati || !Array.isArray(dati.tracce) || !dati.tracce.length) { return; }

    nodi = prendiNodi();
    if (!nodi) { return; }
    if (typeof nodi.audio.canPlayType !== 'function') { return; }

    tracce = dati.tracce;
    testi = dati.testi || {};

    nodi.guscio.hidden = false;
    costruisciElenco();

    var salvato = leggi(CHIAVE_APERTO);
    apriChiudi(salvato === null ? dati.aperto !== false : salvato === '1', false);

    var volume = parseInt(leggi(CHIAVE_VOLUME), 10);
    applicaVolume(isNaN(volume) ? VOLUME_DI_SERIE : volume, false);
    applicaMuto(leggi(CHIAVE_MUTO) === '1', false);

    var salvatoCasuale = leggi(CHIAVE_CASUALE);
    casuale = salvatoCasuale === null ? dati.casuale === true : salvatoCasuale === '1';
    dipingiCasuale();
    rimescola(casuale ? Math.floor(Math.random() * tracce.length) : 0);
    carica(ordine[0], false);

    nodi.play.addEventListener('click', alterna);
    nodi.precedente.addEventListener('click', precedente);
    nodi.successiva.addEventListener('click', function () { successiva(false); });
    nodi.riduci.addEventListener('click', function () { apriChiudi(false, true); });
    nodi.apri.addEventListener('click', function () { apriChiudi(true, true); });
    nodi.muto.addEventListener('click', function () { applicaMuto(!nodi.audio.muted, true); });
    nodi.casuale.addEventListener('click', alternaCasuale);
    nodi.elencoApri.addEventListener('click', function () { mostraElenco(nodi.elenco.hidden); });

    nodi.livello.addEventListener('input', function () {
      applicaVolume(parseInt(nodi.livello.value, 10) || 0, true);
    });

    nodi.cursore.addEventListener('input', function () {
      trascina = true;
      var quota = (parseInt(nodi.cursore.value, 10) || 0) / 1000;
      var durata = nodi.audio.duration;
      if (typeof durata === 'number' && isFinite(durata)) {
        nodi.trascorso.textContent = orologio(durata * quota);
      }
      disegnaOnda();
    });

    nodi.cursore.addEventListener('change', function () {
      var durata = nodi.audio.duration;
      if (typeof durata === 'number' && isFinite(durata) && durata > 0) {
        nodi.audio.currentTime = durata * ((parseInt(nodi.cursore.value, 10) || 0) / 1000);
      }
      trascina = false;
      disegnaOnda();
    });

    nodi.audio.addEventListener('play', dipingi);
    nodi.audio.addEventListener('pause', dipingi);
    nodi.audio.addEventListener('timeupdate', segnaTempo);
    nodi.audio.addEventListener('loadedmetadata', function () {
      dillo('');
      segnaTempo();
    });
    nodi.audio.addEventListener('ended', function () { successiva(true); });
    nodi.audio.addEventListener('error', function () {
      dillo(testi.errore || '');
      console.warn('[musica] traccia non caricabile:', tracce[indice] ? tracce[indice].src : '');
    });

    nodi.guscio.addEventListener('keydown', function (evento) {
      if (evento.key !== 'Escape') { return; }
      evento.stopPropagation();
      if (!nodi.elenco.hidden) {
        mostraElenco(false);
        nodi.elencoApri.focus();
        return;
      }
      if (aperto()) { apriChiudi(false, true); }
    });

    window.addEventListener('resize', function () {
      misuraScorrimento();
      disegnaOnda();
    });

    window.addEventListener('pagehide', function () { ferma(); }, { once: true });

    collegaDiretta();
    dipingi();
  }

  window.Musica = {
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },
    parti: function () { if (nodi) { parti(); } },
    ferma: function () { if (nodi) { ferma(); } },
    successiva: function () { if (nodi) { successiva(false); } },
    precedente: function () { if (nodi) { precedente(); } }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
