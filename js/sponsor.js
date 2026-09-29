(function () {
  'use strict';

  function istante(valore) {
    if (!valore) { return null; }
    var ms = Date.parse(valore);
    return isNaN(ms) ? null : ms;
  }

  function scaduto(nodo, ora) {
    var da = istante(nodo.getAttribute('data-da'));
    var a = istante(nodo.getAttribute('data-a'));
    if (da !== null && ora < da) { return true; }
    if (a !== null && ora >= a) { return true; }
    return false;
  }

  function ripulisci() {
    var ora = Date.now();
    var schede = document.querySelectorAll('.sponsor__voce');
    var rimaste = 0;

    for (var i = 0; i < schede.length; i++) {
      var fuori = scaduto(schede[i], ora);
      schede[i].hidden = fuori;

      if (!fuori && !schede[i].closest('[data-sponsor-fila-copia]')) { rimaste++; }
    }

    var sezione = document.getElementById('sponsor');
    if (sezione) { sezione.hidden = rimaste === 0; }

    return rimaste;
  }

  function misuraNastro() {
    var nastro = document.querySelector('[data-sponsor-nastro]');
    var fila = document.querySelector('[data-sponsor-fila]');
    if (!nastro || !fila) { return; }

    var ferma = fila.scrollWidth <= nastro.clientWidth + 2;
    nastro.classList.toggle('is-ferma', ferma);
  }

  var LATO_MAX = 480;
  var lavorati = {};

  function coloreDelBordo(px, l, a) {
    var campioni = [];
    var passo = Math.max(1, Math.round((l + a) / 120));
    var x, y;
    for (x = 0; x < l; x += passo) { campioni.push((x) * 4, ((a - 1) * l + x) * 4); }
    for (y = 0; y < a; y += passo) { campioni.push((y * l) * 4, (y * l + l - 1) * 4); }

    var trasparenti = 0, r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < campioni.length; i++) {
      var k = campioni[i];
      if (px[k + 3] < 200) { trasparenti++; continue; }
      r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
    }
    if (trasparenti > campioni.length * 0.3 || !n) { return null; }
    r /= n; g /= n; b /= n;

    var simili = 0;
    for (var j = 0; j < campioni.length; j++) {
      var q = campioni[j];
      if (Math.abs(px[q] - r) + Math.abs(px[q + 1] - g) + Math.abs(px[q + 2] - b) < 60) { simili++; }
    }
    return simili >= campioni.length * 0.8 ? [r, g, b] : null;
  }

  function ritaglia(img) {
    var scala = Math.min(1, LATO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    var l = Math.max(1, Math.round(img.naturalWidth * scala));
    var a = Math.max(1, Math.round(img.naturalHeight * scala));
    var tela = document.createElement('canvas');
    tela.width = l;
    tela.height = a;
    var ctx = tela.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, l, a);
    var dati = ctx.getImageData(0, 0, l, a);
    var px = dati.data;

    var fondo = coloreDelBordo(px, l, a);
    if (fondo) {
      for (var i = 0; i < px.length; i += 4) {
        var d = Math.sqrt(Math.pow(px[i] - fondo[0], 2) + Math.pow(px[i + 1] - fondo[1], 2) + Math.pow(px[i + 2] - fondo[2], 2));
        var t = Math.min(1, Math.max(0, (d - 24) / 56));
        px[i + 3] = Math.round(px[i + 3] * t);
      }
    }

    var x0 = l, y0 = a, x1 = -1, y1 = -1, somma = 0, peso = 0;
    for (var y = 0; y < a; y++) {
      for (var x = 0; x < l; x++) {
        var k = (y * l + x) * 4;
        var alfa = px[k + 3];
        if (alfa < 24) { continue; }
        if (x < x0) { x0 = x; }
        if (x > x1) { x1 = x; }
        if (y < y0) { y0 = y; }
        if (y > y1) { y1 = y; }
        somma += (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) * alfa;
        peso += alfa;
      }
    }
    if (x1 < 0) { return null; }

    ctx.putImageData(dati, 0, 0);
    var taglio = document.createElement('canvas');
    taglio.width = x1 - x0 + 1;
    taglio.height = y1 - y0 + 1;
    taglio.getContext('2d').drawImage(tela, x0, y0, taglio.width, taglio.height, 0, 0, taglio.width, taglio.height);

    return { src: taglio.toDataURL('image/png'), scuro: somma / peso < 70 };
  }

  function preparaLogo(img) {
    var fatto = function (esito) {
      if (esito) {
        img.src = esito.src;
        img.classList.toggle('is-scuro', esito.scuro);
      } else {
        img.classList.add('is-grezzo');
      }
      img.classList.add('is-pronto');
      misuraNastro();
    };
    var parti = function () {
      var chiave = img.currentSrc || img.src;
      if (!lavorati[chiave]) {
        try { lavorati[chiave] = ritaglia(img); } catch (e) { lavorati[chiave] = null; }
      }
      fatto(lavorati[chiave]);
    };
    if (img.complete && img.naturalWidth) { parti(); return; }
    img.addEventListener('load', parti, { once: true });
    img.addEventListener('error', function () { fatto(null); }, { once: true });
  }

  function accenti() {
    var schede = document.querySelectorAll('.sponsor__voce');
    for (var i = 0; i < schede.length; i++) {
      var marca = schede[i].style.getPropertyValue('--marca').trim();
      var m = /^#([0-9a-f]{6})$/i.exec(marca);
      if (!m) { continue; }
      var n = parseInt(m[1], 16);
      var luce = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
      if (luce > 60) { schede[i].style.setProperty('--accento', marca); }
    }
  }

  function avvia() {
    ripulisci();
    misuraNastro();
    accenti();

    window.addEventListener('resize', misuraNastro);

    var sezione = document.getElementById('sponsor');
    if (sezione) { sezione.classList.add('is-js'); }

    var loghi = document.querySelectorAll('.sponsor__logo');
    for (var i = 0; i < loghi.length; i++) {
      loghi[i].loading = 'eager';
      preparaLogo(loghi[i]);
    }

    setTimeout(function () {
      var rimasti = document.querySelectorAll('.sponsor__logo:not(.is-pronto)');
      for (var j = 0; j < rimasti.length; j++) { rimasti[j].classList.add('is-grezzo', 'is-pronto'); }
    }, 4000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { ripulisci(); misuraNastro(); }
    });
  }

  avvia();
}());
