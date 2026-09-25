(function () {
  'use strict';
  var tela = document.getElementById('mnt-gioco');
  if (!tela || !tela.getContext) { return; }
  var ctx = tela.getContext('2d');
  if (!ctx) { return; }
  var corpo = document.body;
  var fermo = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var tocco = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var CHIAVE_RECORD = 'sb-pollo-record';
  var G = 33.3;
  var V0 = 10;
  var ARIA = 2 * V0 / G;
  var V_INIZIO = 6.5;
  var V_MAX = 15;
  var SPINTA = 0.15;
  var PROPORZIONE = 386 / 556;

  var stile = getComputedStyle(document.documentElement);
  function tinta(nome, ripiego) {
    var valore = stile.getPropertyValue(nome).trim();
    return valore || ripiego;
  }
  var C = {
    viola: tinta('--viola', '#8b2fff'),
    violaChiaro: tinta('--viola-chiaro', '#c5a4ff'),
    ciano: tinta('--ciano', '#22e0ff'),
    magenta: tinta('--magenta', '#ff2fa0'),
    allerta: tinta('--allerta', '#ffc65c'),
    fondo: tinta('--fondo', '#07070c'),
    testo: tinta('--testo', '#f4f1ff')
  };
  var MONO = tinta('--font-mono', 'monospace');
  var TITOLO = tinta('--font-titolo', 'sans-serif');

  var pollo = new Image();
  var polloPronto = false;
  pollo.onload = function () { polloPronto = true; disegna(); };
  pollo.src = tela.getAttribute('data-pollo') || '';

  var record = 0;
  try { record = parseInt(localStorage.getItem(CHIAVE_RECORD), 10) || 0; } catch (e) { record = 0; }

  var W = 0, H = 0, dpr = 1, U = 40, orizzonte = 0, suolo = 0, polloX = 0;
  var stato = 'fermo';
  var t = 0, deriva = 0, avanzato = 0, velocita = 0, punti = 0, traguardo = 0, bagliore = 0;
  var y = 0, vy = 0, aTerra = true, giro = 0, prenotato = 0, scia = 0;
  var ostacoli = [], scintille = [], prossimo = 0, lampo = 0, scossa = 0, fineDa = 0, nuovoRecord = false;
  var ultimo = 0, acceso = false;

  function casuale(seme) {
    return function () {
      seme = (seme * 16807) % 2147483647;
      return (seme - 1) / 2147483646;
    };
  }

  function creaMonti(picchi, seme) {
    var r = casuale(seme);
    var punti = [];
    for (var i = 0; i < picchi; i++) {
      punti.push({ x: (i + 0.15 * r()) / picchi, h: 0.04 + 0.14 * r() });
      punti.push({ x: (i + 0.5 + 0.25 * (r() - 0.5)) / picchi, h: 0.45 + 0.55 * r() });
    }
    return punti;
  }

  var montiLontani = creaMonti(9, 7919);
  var montiVicini = creaMonti(5, 104729);

  function misura() {
    var r = tela.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width;
    H = r.height;
    tela.width = Math.max(1, Math.round(W * dpr));
    tela.height = Math.max(1, Math.round(H * dpr));
    U = Math.max(40, Math.min(96, H * 0.34));
    orizzonte = H * 0.58;
    suolo = orizzonte + (H - orizzonte) * 0.8;
    polloX = Math.max(14, Math.min(W * 0.07, 110));
  }

  function larghezzaPollo() { return U * PROPORZIONE; }

  function sole() {
    var r = Math.min(H * 0.5, W * 0.22);
    var cx = W * 0.72;
    var cy = orizzonte;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, cy - r, 0, cy);
    g.addColorStop(0, C.allerta);
    g.addColorStop(0.55, C.magenta);
    g.addColorStop(1, C.viola);
    ctx.fillStyle = g;
    ctx.shadowColor = C.magenta;
    ctx.shadowBlur = r * 0.45;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < 6; i++) {
      ctx.fillRect(cx - r - 2, cy - r * (0.52 - i * 0.09), r * 2 + 4, r * (0.018 + i * 0.013));
    }
    ctx.globalCompositeOperation = 'destination-over';
    var cielo = ctx.createLinearGradient(0, 0, 0, orizzonte);
    cielo.addColorStop(0, 'rgba(0, 0, 0, 0)');
    cielo.addColorStop(1, C.viola);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = cielo;
    ctx.fillRect(0, 0, W, orizzonte);
    ctx.restore();
  }

  function disegnaMonti(punti, largo, alto, passo, linea, rete) {
    var vertici = [];
    var partenza = -(passo % largo) - largo;
    for (var base = partenza; base < W + largo; base += largo) {
      for (var i = 0; i < punti.length; i++) {
        vertici.push({ x: base + punti[i].x * largo, y: orizzonte - punti[i].h * alto, cima: i % 2 === 1 });
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vertici[0].x, orizzonte);
    for (var v = 0; v < vertici.length; v++) { ctx.lineTo(vertici[v].x, vertici[v].y); }
    ctx.lineTo(vertici[vertici.length - 1].x, orizzonte);
    ctx.closePath();
    ctx.fillStyle = C.fondo;
    ctx.fill();
    ctx.save();
    ctx.clip();
    var velo = ctx.createLinearGradient(0, orizzonte - alto, 0, orizzonte);
    velo.addColorStop(0, rete);
    velo.addColorStop(1, C.fondo);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = velo;
    ctx.fillRect(0, orizzonte - alto, W, alto);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = rete;
    for (var riga = orizzonte - alto; riga < orizzonte; riga += 5) { ctx.fillRect(0, riga, W, 1); }
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = rete;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var k = 1; k < vertici.length - 1; k++) {
      if (!vertici[k].cima) { continue; }
      var cima = vertici[k];
      var sx = vertici[k - 1];
      var dx = vertici[k + 1];
      for (var f = 0; f <= 4; f++) {
        var destinazione = sx.x + (dx.x - sx.x) * (f / 4);
        ctx.moveTo(cima.x, cima.y);
        ctx.lineTo(destinazione, orizzonte);
      }
      ctx.moveTo(sx.x, sx.y);
      ctx.lineTo((cima.x + dx.x) / 2, orizzonte);
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(vertici[0].x, vertici[0].y);
    for (var n = 1; n < vertici.length; n++) { ctx.lineTo(vertici[n].x, vertici[n].y); }
    ctx.strokeStyle = linea;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.shadowColor = linea;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }

  function terreno() {
    ctx.save();
    ctx.fillStyle = C.fondo;
    ctx.fillRect(0, orizzonte, W, H - orizzonte);
    var velo = ctx.createLinearGradient(0, orizzonte, 0, H);
    velo.addColorStop(0, C.viola);
    velo.addColorStop(1, C.fondo);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = velo;
    ctx.fillRect(0, orizzonte, W, H - orizzonte);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = C.magenta;
    ctx.lineWidth = 1;
    ctx.beginPath();
    var fondoY = H - orizzonte;
    for (var j = 1; j <= 8; j++) {
      var riga = orizzonte + Math.pow(j / 8, 1.7) * fondoY;
      ctx.moveTo(0, riga);
      ctx.lineTo(W, riga);
    }
    var s2 = U * 2.2;
    var s1 = s2 * 0.12;
    var fPollo = (suolo - orizzonte) / fondoY;
    var sPollo = s1 + (s2 - s1) * fPollo;
    var spost = (deriva * s2 / sPollo) % s2;
    var quanti = Math.ceil(W / (2 * s1)) + 2;
    var soglia = 0.18;
    var sSoglia = (s1 + (s2 - s1) * soglia) / s2;
    for (var i = -quanti; i <= quanti; i++) {
      var lontano = i * s2 - spost;
      ctx.moveTo(W / 2 + lontano * sSoglia, orizzonte + soglia * fondoY);
      ctx.lineTo(W / 2 + lontano, H);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    for (var m = -quanti; m <= quanti; m++) {
      var via = m * s2 - spost;
      ctx.moveTo(W / 2 + via * s1 / s2, orizzonte);
      ctx.lineTo(W / 2 + via * sSoglia, orizzonte + soglia * fondoY);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, orizzonte);
    ctx.lineTo(W, orizzonte);
    ctx.strokeStyle = C.ciano;
    ctx.lineWidth = 2;
    ctx.shadowColor = C.ciano;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }

  function punta(x, base, largo, alto, colore) {
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + largo / 2, base - alto);
    ctx.lineTo(x + largo, base);
    ctx.closePath();
    ctx.fillStyle = C.fondo;
    ctx.fill();
    ctx.strokeStyle = colore;
    ctx.lineWidth = 2;
    ctx.shadowColor = colore;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + largo * 0.3, base - 2);
    ctx.lineTo(x + largo / 2, base - alto * 0.55);
    ctx.lineTo(x + largo * 0.7, base - 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function blocco(x, cimaY, largo, alto, colore) {
    ctx.fillStyle = C.fondo;
    ctx.fillRect(x, cimaY, largo, alto);
    ctx.strokeStyle = colore;
    ctx.lineWidth = 2;
    ctx.shadowColor = colore;
    ctx.shadowBlur = 12;
    ctx.strokeRect(x + 1, cimaY + 1, largo - 2, alto - 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.45;
    var dentro = Math.min(largo, alto) * 0.22;
    ctx.strokeRect(x + dentro, cimaY + dentro, largo - dentro * 2, alto - dentro * 2);
    ctx.globalAlpha = 1;
  }

  function disegnaOstacoli() {
    ctx.save();
    for (var i = 0; i < ostacoli.length; i++) {
      var o = ostacoli[i];
      if (o.tipo === 'punta') { punta(o.x, suolo, o.w, o.h, C.ciano); }
      if (o.tipo === 'doppia') { punta(o.x, suolo, o.w / 2, o.h, C.ciano); punta(o.x + o.w / 2, suolo, o.w / 2, o.h, C.ciano); }
      if (o.tipo === 'blocco') { blocco(o.x, suolo - o.h, o.w, o.h, C.allerta); }
      if (o.tipo === 'alto') {
        var corpoAlto = o.h - U * 0.4;
        blocco(o.x, suolo - corpoAlto, o.w, corpoAlto, C.allerta);
        punta(o.x + o.w * 0.15, suolo - corpoAlto, o.w * 0.7, U * 0.4, C.ciano);
      }
    }
    ctx.restore();
  }

  function disegnaScintille() {
    ctx.save();
    for (var i = 0; i < scintille.length; i++) {
      var s = scintille[i];
      ctx.globalAlpha = Math.max(0, s.vita / s.durata);
      ctx.fillStyle = s.colore;
      ctx.fillRect(s.x - s.lato / 2, s.y - s.lato / 2, s.lato, s.lato);
    }
    ctx.restore();
  }

  function disegnaPollo() {
    var w = larghezzaPollo();
    var h = U;
    var cx = polloX + w / 2;
    var piedi = suolo + y;
    var sobbalzo = 0;
    var rotazione = 0;
    if (stato === 'corsa' && aTerra) {
      sobbalzo = -Math.abs(Math.sin(t * 16)) * U * 0.07;
      rotazione = Math.sin(t * 16) * 0.07;
    } else if (stato === 'corsa') {
      rotazione = giro;
    } else if (stato === 'fine') {
      rotazione = -0.35;
    } else if (!fermo) {
      sobbalzo = -Math.abs(Math.sin(t * 3)) * U * 0.03;
    }
    ctx.save();
    var altezzaSalto = Math.min(1, -y / (U * 1.5));
    ctx.globalAlpha = 0.45 * (1 - altezzaSalto * 0.6);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, suolo, w * 0.42 * (1 - altezzaSalto * 0.4), U * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(cx, piedi - h / 2 + sobbalzo);
    ctx.rotate(rotazione);
    ctx.shadowColor = stato === 'fine' ? C.magenta : C.ciano;
    ctx.shadowBlur = 10;
    if (polloPronto) {
      ctx.drawImage(pollo, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = C.allerta;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function cinque(n) {
    var testo = String(Math.min(99999, n));
    while (testo.length < 5) { testo = '0' + testo; }
    return testo;
  }

  function scritta(testo, x, yy, dimensione, peso, famiglia, colore, allinea) {
    ctx.font = peso + ' ' + Math.round(dimensione) + 'px ' + famiglia;
    ctx.textAlign = allinea;
    ctx.fillStyle = colore;
    ctx.fillText(testo, x, yy);
  }

  function hud() {
    var fs = Math.max(12, U * 0.3);
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.shadowColor = C.ciano;
    ctx.shadowBlur = 8;
    if (stato !== 'fermo') {
      var nascosto = bagliore > 0 && Math.floor(bagliore * 10) % 2 === 0;
      if (!nascosto) { scritta(cinque(punti), W - 16, 10, fs, '600', MONO, C.ciano, 'right'); }
      if (record > 0) {
        ctx.shadowBlur = 0;
        var largoPunti = ctx.measureText('00000').width;
        scritta('HI ' + cinque(record), W - 16 - largoPunti - fs, 10, fs, '600', MONO, C.violaChiaro, 'right');
      }
    } else if (record > 0) {
      ctx.shadowBlur = 0;
      scritta('HI ' + cinque(record), W - 16, 10, fs, '600', MONO, C.violaChiaro, 'right');
    }
    ctx.restore();
  }

  function messaggi() {
    var fs = Math.max(11, U * 0.26);
    var parti = tocco ? 'TOCCA' : 'SPAZIO';
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    if (stato === 'fermo') {
      var x = polloX + larghezzaPollo() + U * 0.35;
      ctx.shadowColor = C.magenta;
      ctx.shadowBlur = 10;
      scritta('POLLO RUN', x, suolo - U * 0.6, fs * 1.15, '700', MONO, C.magenta, 'left');
      ctx.shadowBlur = 0;
      ctx.globalAlpha = fermo ? 1 : 0.55 + 0.45 * Math.sin(t * 4);
      scritta(parti + ' per correre', x, suolo - U * 0.18, fs, '500', MONO, C.testo, 'left');
    }
    if (stato === 'corsa' && punti < 20) {
      ctx.globalAlpha = 1 - punti / 20;
      scritta(parti + (tocco ? '' : ' / ↑') + ' per saltare', W / 2, orizzonte * 0.5, fs, '500', MONO, C.testo, 'center');
    }
    if (stato === 'fine') {
      var gx = W / 2;
      var gy = orizzonte * 0.62;
      var grande = Math.max(24, U * 0.7);
      scritta('GAME OVER', gx - 2, gy, grande, '700', TITOLO, C.magenta, 'center');
      scritta('GAME OVER', gx + 2, gy, grande, '700', TITOLO, C.ciano, 'center');
      scritta('GAME OVER', gx, gy, grande, '700', TITOLO, C.testo, 'center');
      if (nuovoRecord) {
        ctx.shadowColor = C.allerta;
        ctx.shadowBlur = 10;
        scritta('NUOVO RECORD!', gx, gy - grande * 0.95, fs, '700', MONO, C.allerta, 'center');
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = fermo ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
      scritta(parti + ' per riprovare' + (tocco ? '' : ' · ESC per uscire'), gx, gy + fs * 1.6, fs, '500', MONO, C.testo, 'center');
    }
    ctx.restore();
  }

  function disegna() {
    if (!W || !H) { return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (scossa > 0) {
      var forza = scossa / 0.35;
      ctx.translate((Math.random() - 0.5) * U * 0.3 * forza, (Math.random() - 0.5) * U * 0.2 * forza);
    }
    sole();
    disegnaMonti(montiLontani, Math.max(W * 1.1, 600), orizzonte * 0.62, deriva * 0.06, C.viola, C.violaChiaro);
    disegnaMonti(montiVicini, Math.max(W * 0.8, 480), orizzonte * 0.4, deriva * 0.16, C.ciano, C.magenta);
    terreno();
    disegnaOstacoli();
    disegnaScintille();
    disegnaPollo();
    ctx.restore();
    hud();
    messaggi();
    if (lampo > 0) {
      ctx.save();
      ctx.globalAlpha = lampo * 0.45;
      ctx.fillStyle = C.testo;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function crea() {
    var tipi = ['punta', 'punta'];
    if (punti > 60) { tipi.push('doppia', 'blocco'); }
    if (punti > 250) { tipi.push('alto', 'doppia'); }
    var tipo = tipi[Math.floor(Math.random() * tipi.length)];
    var o = { tipo: tipo, x: W + 10, w: U * 0.56, h: U * 0.62 };
    if (tipo === 'doppia') { o.w = U * 1.1; }
    if (tipo === 'blocco') { o.w = U * 0.62; o.h = U * 0.62; }
    if (tipo === 'alto') { o.w = U * 0.6; o.h = U * 1.05; }
    ostacoli.push(o);
    prossimo = o.w + velocita * (0.72 + Math.random() * 0.8) + (Math.random() < 0.2 ? velocita * 0.6 : 0);
  }

  function sovrapposti(a0, a1, b0, b1, c0, c1, d0, d1) {
    return a0 < a1 && b0 < b1 && a0 < c1 && c0 < a1 && b0 < d1 && d0 < b1;
  }

  function urta() {
    var w = larghezzaPollo();
    var x0 = polloX + w * 0.24;
    var x1 = polloX + w * 0.76;
    var y1 = suolo + y - U * 0.04;
    var y0 = suolo + y - U * 0.8;
    for (var i = 0; i < ostacoli.length; i++) {
      var o = ostacoli[i];
      if (o.x > x1 || o.x + o.w < x0) { continue; }
      if (o.tipo === 'punta' && sovrapposti(x0, x1, y0, y1, o.x + o.w * 0.3, o.x + o.w * 0.7, suolo - o.h * 0.75, suolo)) { return true; }
      if (o.tipo === 'doppia' && sovrapposti(x0, x1, y0, y1, o.x + o.w * 0.15, o.x + o.w * 0.85, suolo - o.h * 0.75, suolo)) { return true; }
      if (o.tipo === 'blocco' && sovrapposti(x0, x1, y0, y1, o.x + 2, o.x + o.w - 2, suolo - o.h + 2, suolo)) { return true; }
      if (o.tipo === 'alto' && sovrapposti(x0, x1, y0, y1, o.x + 2, o.x + o.w - 2, suolo - o.h + U * 0.15, suolo)) { return true; }
    }
    return false;
  }

  function scintilla(x, yy, vx, vyy, colore, durata, lato) {
    scintille.push({ x: x, y: yy, vx: vx, vy: vyy, colore: colore, vita: durata, durata: durata, lato: lato });
  }

  function schianto() {
    stato = 'fine';
    fineDa = t;
    lampo = 1;
    scossa = fermo ? 0 : 0.35;
    nuovoRecord = punti > record;
    if (nuovoRecord) {
      record = punti;
      try { localStorage.setItem(CHIAVE_RECORD, String(record)); } catch (e) { }
    }
    var cx = polloX + larghezzaPollo() / 2;
    var cy = suolo + y - U / 2;
    for (var i = 0; i < 26; i++) {
      var angolo = Math.random() * Math.PI * 2;
      var forza = U * (2 + Math.random() * 5);
      scintilla(cx, cy, Math.cos(angolo) * forza, Math.sin(angolo) * forza - U * 2, i % 3 === 0 ? C.allerta : (i % 2 ? C.ciano : C.magenta), 0.5 + Math.random() * 0.5, U * (0.06 + Math.random() * 0.08));
    }
  }

  function inizia() {
    stato = 'corsa';
    avanzato = 0;
    punti = 0;
    traguardo = 0;
    bagliore = 0;
    velocita = V_INIZIO * U;
    ostacoli = [];
    prossimo = Math.max(W * 0.55, U * 8);
    y = 0;
    vy = 0;
    aTerra = true;
    giro = 0;
    prenotato = 0;
    nuovoRecord = false;
    corpo.classList.add('is-gioca');
    chiedi();
  }

  function torna() {
    stato = 'fermo';
    ostacoli = [];
    y = 0;
    vy = 0;
    aTerra = true;
    giro = 0;
    corpo.classList.remove('is-gioca');
    chiedi();
  }

  function salta() {
    if (stato === 'fermo') { inizia(); return; }
    if (stato === 'fine') {
      if (t - fineDa > 0.4) { inizia(); }
      return;
    }
    if (aTerra) {
      vy = -V0 * U;
      aTerra = false;
      giro = 0;
    } else {
      prenotato = 0.14;
    }
  }

  function aggiorna(dt) {
    t += dt;
    lampo = Math.max(0, lampo - dt * 3);
    scossa = Math.max(0, scossa - dt);
    bagliore = Math.max(0, bagliore - dt);
    if (stato === 'fermo' && !fermo) { deriva += U * 0.6 * dt; }
    if (stato === 'corsa') {
      velocita = Math.min(V_MAX * U, velocita + SPINTA * U * dt);
      var passo = velocita * dt;
      avanzato += passo;
      deriva += passo;
      punti = Math.floor(avanzato / U * 1.5);
      if (Math.floor(punti / 100) > traguardo) {
        traguardo = Math.floor(punti / 100);
        bagliore = 0.8;
      }
      prenotato = Math.max(0, prenotato - dt);
      if (!aTerra) {
        vy += G * U * dt;
        y += vy * dt;
        giro += dt * Math.PI * 2 / ARIA;
        if (y >= 0) {
          y = 0;
          vy = 0;
          aTerra = true;
          giro = 0;
          if (prenotato > 0) {
            prenotato = 0;
            vy = -V0 * U;
            aTerra = false;
          }
        }
      }
      for (var i = ostacoli.length - 1; i >= 0; i--) {
        ostacoli[i].x -= passo;
        if (ostacoli[i].x + ostacoli[i].w < -20) { ostacoli.splice(i, 1); }
      }
      prossimo -= passo;
      if (prossimo <= 0) { crea(); }
      scia -= dt;
      if (aTerra && scia <= 0) {
        scia = 0.04;
        scintilla(polloX + larghezzaPollo() * 0.25, suolo - 3, -velocita * 0.25 - Math.random() * U, -Math.random() * U * 1.5, Math.random() < 0.5 ? C.ciano : C.magenta, 0.4, U * 0.07);
      }
      if (urta()) { schianto(); }
    }
    if (stato === 'fine' && t - fineDa > 8) { torna(); }
    for (var k = scintille.length - 1; k >= 0; k--) {
      var s = scintille[k];
      s.vita -= dt;
      if (s.vita <= 0) { scintille.splice(k, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += G * U * 0.3 * dt;
    }
  }

  function serveMoto() {
    return !fermo || stato !== 'fermo' || lampo > 0 || scintille.length > 0;
  }

  function ciclo(ora) {
    acceso = false;
    var dt = ultimo ? Math.min(0.05, (ora - ultimo) / 1000) : 0;
    ultimo = ora;
    aggiorna(dt);
    disegna();
    if (serveMoto()) { chiedi(); } else { ultimo = 0; }
  }

  function chiedi() {
    if (acceso || document.hidden) { return; }
    acceso = true;
    requestAnimationFrame(ciclo);
  }

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape' && stato !== 'fermo') { torna(); return; }
    var tasto = evento.code === 'Space' || evento.key === ' ' || evento.key === 'ArrowUp';
    if (!tasto || evento.altKey || evento.ctrlKey || evento.metaKey) { return; }
    var bersaglio = evento.target;
    if (stato === 'fermo' && bersaglio && bersaglio.closest && bersaglio.closest('a, button, input, textarea, select')) { return; }
    evento.preventDefault();
    if (evento.repeat && stato !== 'corsa') { return; }
    salta();
  });

  document.addEventListener('pointerdown', function (evento) {
    if (evento.button) { return; }
    var bersaglio = evento.target;
    if (bersaglio && bersaglio.closest && bersaglio.closest('#mnt-musica')) { return; }
    if (stato === 'fermo') {
      if (bersaglio && bersaglio.closest && bersaglio.closest('a, button, .mnt__monitor')) { return; }
      if (evento.clientY < tela.getBoundingClientRect().top) { return; }
    }
    salta();
  });

  document.addEventListener('visibilitychange', function () {
    ultimo = 0;
    if (!document.hidden) { chiedi(); }
  });

  window.addEventListener('resize', function () {
    misura();
    if (stato !== 'fermo') { torna(); }
    disegna();
  });

  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(disegna); }

  misura();
  disegna();
  chiedi();
}());

(function () {
  'use strict';
  var CHIAVE = 'sb-guardia-ricaricato';
  var anteprima = location.pathname.indexOf('/api/') === 0;
  var inCorso = false;
  function giaRicaricato(timbro) {
    try { return sessionStorage.getItem(CHIAVE) === timbro; } catch (e) { return false; }
  }
  function ricorda(timbro) {
    try { sessionStorage.setItem(CHIAVE, timbro); } catch (e) { }
  }
  function controlla() {
    if (anteprima || inCorso || typeof window.fetch !== 'function') { return; }
    inCorso = true;
    fetch('stato-sito.json?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (risposta) { return risposta.ok ? risposta.json() : null; })
      .then(function (stato) {
        inCorso = false;
        if (!stato || stato.manutenzione !== false) { return; }
        var timbro = String(stato.pubblicatoIl || '');
        if (giaRicaricato(timbro)) { return; }
        ricorda(timbro);
        location.reload();
      })
      .catch(function () { inCorso = false; });
  }
  setInterval(controlla, 30000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { controlla(); }
  });
  window.addEventListener('pageshow', controlla);

  var audio = document.getElementById('mnt-audio');
  var tasto = document.getElementById('mnt-musica');
  if (audio && tasto) {
    var CHIAVE_MUSICA = 'sb-manutenzione-musica';
    var spenta = false;
    try { spenta = sessionStorage.getItem(CHIAVE_MUSICA) === 'no'; } catch (e) { }
    audio.volume = 0.2;
    var segna = function () {
      var suona = !audio.paused;
      tasto.classList.toggle('is-suona', suona);
      tasto.setAttribute('aria-pressed', suona ? 'true' : 'false');
      tasto.setAttribute('aria-label', suona ? 'Ferma la musica d’attesa' : 'Fai partire la musica d’attesa');
    };
    var parti = function () {
      var promessa = audio.play();
      if (promessa && typeof promessa.catch === 'function') { promessa.catch(function () { }); }
    };
    var alPrimoGesto = function (evento) {
      if (evento && tasto.contains(evento.target)) { return; }
      document.removeEventListener('pointerdown', alPrimoGesto, true);
      document.removeEventListener('keydown', alPrimoGesto, true);
      if (!spenta && audio.paused) { parti(); }
    };
    tasto.addEventListener('click', function () {
      document.removeEventListener('pointerdown', alPrimoGesto, true);
      document.removeEventListener('keydown', alPrimoGesto, true);
      spenta = !audio.paused;
      if (spenta) { audio.pause(); } else { parti(); }
      try { sessionStorage.setItem(CHIAVE_MUSICA, spenta ? 'no' : 'si'); } catch (e) { }
    });
    audio.addEventListener('play', segna);
    audio.addEventListener('pause', segna);
    audio.addEventListener('error', function () { tasto.hidden = true; });
    if (!spenta) {
      document.addEventListener('pointerdown', alPrimoGesto, true);
      document.addEventListener('keydown', alPrimoGesto, true);
      if (!anteprima) { parti(); }
    }
  }

  var box = document.getElementById('mnt-conto');
  if (!box) { return; }
  var fine = Date.parse(box.getAttribute('data-fine'));
  var ore = document.getElementById('mnt-ore');
  var min = document.getElementById('mnt-min');
  var sec = document.getElementById('mnt-sec');
  var etichetta = document.getElementById('mnt-conto-etichetta');
  var conto = null;
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function aggiorna() {
    var resto = Math.max(0, Math.floor((fine - Date.now()) / 1000));
    ore.textContent = due(Math.floor(resto / 3600));
    min.textContent = due(Math.floor((resto % 3600) / 60));
    sec.textContent = due(resto % 60);
    if (resto > 0) { return; }
    box.classList.add('is-finito');
    etichetta.textContent = box.getAttribute('data-finito');
    clearInterval(conto);
    controlla();
  }
  aggiorna();
  if (!box.classList.contains('is-finito')) { conto = setInterval(aggiorna, 1000); }
}());
