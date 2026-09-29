(function () {
  'use strict';

  var PASSO = 1 / 120;
  var LARGO = 8;
  var RAGGIO = 0.3;
  var ALTO_POLLO = 0.42;
  var SPESSORE = 0.55;
  var DENTI = 0.22;
  var TUFFO = 0.6;
  var INIZIO = 1.1;
  var ARRIVO = 1.4;
  var MARGINE = 0.3;
  var AVVISO = 2.6;
  var TESTO = 'ATTENTO CHE CADI !';

  function casuale(seme) {
    return function () {
      seme = (seme * 16807) % 2147483647;
      return (seme - 1) / 2147483646;
    };
  }

  function misure(difficolta, n) {
    var estremo = difficolta === 'estremo';
    var k = Math.max(0, (n || 3) - 3);
    return {
      discesa: (estremo ? 8.2 : 7) + Math.min(2.4, 0.12 * k),
      laterale: estremo ? 7.6 : 7,
      varco: estremo ? 1.55 : 1.8,
      pausaMin: estremo ? 0.52 : 0.64,
      pausaMax: estremo ? 0.86 : 1.06
    };
  }

  function forma(r, m) {
    var L = LARGO / 2;
    var tipo = Math.floor(r() * 5);
    var g = m.varco * (1 + 0.35 * r());
    if (tipo === 4) {
      var e = 0.7 + 0.6 * r();
      var mezzo = LARGO - 2 * e - 2 * g;
      if (mezzo >= 0.9) {
        var sposta = (r() - 0.5) * 0.6;
        return { tipo: 'tre', pezzi: [[-L, -L + e], [-mezzo / 2 + sposta, mezzo / 2 + sposta], [L - e, L]] };
      }
      tipo = 0;
    }
    if (tipo === 0) {
      var g1 = g * (1 + 0.5 * r());
      var g2 = g * (1 + 0.5 * r());
      if (LARGO - g1 - g2 < 1) { g2 = LARGO - g1 - 1; }
      return { tipo: 'centro', pezzi: [[-L + g1, L - g2]] };
    }
    if (tipo === 1) {
      var c = (r() - 0.5) * (LARGO - g - 2);
      return { tipo: 'bordi', pezzi: [[-L, c - g / 2], [c + g / 2, L]] };
    }
    if (tipo === 2) { return { tipo: 'sinistra', pezzi: [[-L + g, L]] }; }
    return { tipo: 'destra', pezzi: [[-L, L - g]] };
  }

  function tocca(x, yc, fila) {
    if (yc + ALTO_POLLO <= fila.y || yc - ALTO_POLLO >= fila.y + SPESSORE) { return false; }
    for (var i = 0; i < fila.pezzi.length; i++) {
      var p = fila.pezzi[i];
      if (x + RAGGIO > p[0] && x - RAGGIO < p[1]) { return true; }
    }
    return false;
  }

  function griglia(m) {
    var cella = m.laterale * PASSO;
    return { cella: cella, N: Math.floor((LARGO / 2 - RAGGIO) / cella) };
  }

  function attraversa(vivi, passi, fila, m) {
    var g = griglia(m);
    var indice = passi;
    var fine = Math.ceil((fila.y + SPESSORE + ALTO_POLLO) / m.discesa / PASSO) + 1;
    var tutta = { y: fila.y, pezzi: [[-1e9, 1e9]] };
    var corrente = vivi;
    var alcuno = true;
    while (indice < fine && alcuno) {
      indice++;
      var yc = m.discesa * (indice * PASSO);
      var attiva = tocca(0, yc, tutta);
      var nuovi = [];
      alcuno = false;
      for (var j = 0; j < corrente.length; j++) {
        var vivo = corrente[j] || corrente[j - 1] || corrente[j + 1] ? 1 : 0;
        if (vivo && attiva && tocca((j - g.N) * g.cella, yc, fila)) { vivo = 0; }
        if (vivo) { alcuno = true; }
        nuovi.push(vivo);
      }
      corrente = nuovi;
    }
    return { insieme: corrente, passi: indice };
  }

  function piuLargo(vivi, m) {
    var migliore = 0;
    var fila = 0;
    for (var j = 0; j < vivi.length; j++) {
      fila = vivi[j] ? fila + 1 : 0;
      migliore = Math.max(migliore, fila);
    }
    return migliore * griglia(m).cella;
  }

  function schema(caduta, difficolta, n) {
    var m = misure(difficolta, n);
    var r = casuale(caduta.seme || 1);
    var tempo = caduta.durata - TUFFO;
    var ultima = tempo - ARRIVO;
    var file = [];
    var insieme = [];
    for (var j = 0; j <= 2 * griglia(m).N; j++) { insieme.push(j === griglia(m).N ? 1 : 0); }
    var passi = 0;
    var tr = INIZIO;
    while (tr < ultima) {
      var presa = null;
      for (var prova = 0; prova < 14 && !presa; prova++) {
        var f = forma(r, m);
        var fila = { t: tr, y: m.discesa * tr, tipo: f.tipo, pezzi: f.pezzi };
        if (fila.y < m.discesa * passi * PASSO + ALTO_POLLO) { break; }
        var dopo = attraversa(insieme, passi, fila, m);
        if (piuLargo(dopo.insieme, m) >= MARGINE) { presa = { fila: fila, dopo: dopo }; }
      }
      if (presa) {
        file.push(presa.fila);
        insieme = presa.dopo.insieme;
        passi = presa.dopo.passi;
        tr += m.pausaMin + r() * (m.pausaMax - m.pausaMin);
      } else {
        tr += 0.3;
      }
    }
    return { misure: m, file: file, tempo: tempo };
  }

  function crea(ambiente) {
    var st = { fase: 'no', M: null, schema: null, chiave: '', tt: 0, tp: 0, passi: 0, px: 0, resto: 0, prossima: 0, tAvviso: -1 };
    var tasti = { sinistra: false, destra: false, lato: 0 };

    function azzera() {
      st.fase = 'no';
      st.M = null;
      tasti.sinistra = false;
      tasti.destra = false;
      tasti.lato = 0;
    }

    function prepara(M) {
      azzera();
      if (!M || !M.caduta) { return; }
      var chiave = M.n + ':' + M.difficolta;
      if (st.chiave !== chiave || !st.schema) {
        st.schema = schema(M.caduta, M.difficolta, M.n);
        st.chiave = chiave;
      }
      st.M = M;
      st.fase = 'attesa';
      st.tt = 0;
      st.tp = 0;
      st.passi = 0;
      st.px = 0;
      st.resto = 0;
      st.prossima = 0;
      st.tAvviso = -1;
    }

    function inCorso() { return st.fase === 'tuffo' || st.fase === 'pozzo'; }

    function entra(S, M) {
      if (st.fase !== 'attesa' || M !== st.M || S.x < M.caduta.x0 + 0.25) { return false; }
      st.fase = 'tuffo';
      st.tt = 0;
      S.aTerra = false;
      S.salto = false;
      return true;
    }

    function verso() {
      var d = (tasti.destra ? 1 : 0) - (tasti.sinistra ? 1 : 0) + tasti.lato;
      return d > 0 ? 1 : (d < 0 ? -1 : 0);
    }

    function atterra(S) {
      var c = st.M.caduta;
      S.x = c.x1;
      S.alt = 0;
      S.va = 0;
      S.aTerra = true;
      S.salto = false;
      S.richiesta = false;
      S.buf = 0;
      st.fase = 'fatta';
      tasti.lato = 0;
    }

    function aggiorna(dt, S) {
      if (st.fase === 'tuffo') {
        var c = st.M.caduta;
        st.tt += dt;
        var q = Math.min(1, st.tt / TUFFO);
        S.va -= 33.3 * dt;
        S.alt += S.va * dt;
        S.x = Math.min(c.x0 + (c.x1 - c.x0) * 0.6, S.x + S.v * dt * (1 - q));
        S.richiesta = false;
        if (st.tt >= TUFFO) {
          st.fase = 'pozzo';
          st.tp = 0;
          st.passi = 0;
          st.px = 0;
          st.resto = 0;
          st.prossima = 0;
        }
        return '';
      }
      if (st.fase !== 'pozzo') { return ''; }
      var sc = st.schema;
      var m = sc.misure;
      var bordo = LARGO / 2 - RAGGIO;
      st.resto += dt;
      while (st.resto >= PASSO - 1e-9) {
        st.resto -= PASSO;
        st.passi++;
        st.tp = st.passi * PASSO;
        st.px = Math.max(-bordo, Math.min(bordo, st.px + verso() * m.laterale * PASSO));
        var yc = m.discesa * st.tp;
        while (st.prossima < sc.file.length && sc.file[st.prossima].y + SPESSORE < yc - ALTO_POLLO) { st.prossima++; }
        for (var i = st.prossima; i < sc.file.length && sc.file[i].y < yc + ALTO_POLLO; i++) {
          if (tocca(st.px, yc, sc.file[i])) {
            st.fase = 'morto';
            return 'morto';
          }
        }
        if (st.passi >= Math.round(sc.tempo / PASSO)) {
          atterra(S);
          return 'atterrato';
        }
      }
      return '';
    }

    function avanzamento(S, M) {
      var c = M.caduta;
      var w = c.x1 - c.x0;
      var totale = M.lunghezza - w + M.v * c.durata;
      var x = S.x;
      if (st.fase === 'tuffo' || st.fase === 'pozzo' || st.fase === 'morto') { x = c.x0 + M.v * (st.tt + st.tp); } else if (st.fase === 'fatta') { x = S.x - w + M.v * c.durata; }
      return totale > 0 ? x / totale : 0;
    }

    function tasto(evento, giu) {
      var k = evento.key;
      var sinistra = k === 'a' || k === 'A' || k === 'ArrowLeft';
      var destra = k === 'd' || k === 'D' || k === 'ArrowRight';
      if (!sinistra && !destra) { return false; }
      if (evento.altKey || evento.ctrlKey || evento.metaKey) { return false; }
      if (sinistra) { tasti.sinistra = giu; }
      if (destra) { tasti.destra = giu; }
      if (giu && inCorso()) {
        if (evento.preventDefault) { evento.preventDefault(); }
        return true;
      }
      return false;
    }

    function tocco(evento, giu) {
      if (!giu) { tasti.lato = 0; return false; }
      if (st.fase !== 'pozzo' && st.fase !== 'tuffo') { return false; }
      var a = ambiente();
      if (typeof evento.clientX === 'number') {
        var r = a.tela.getBoundingClientRect();
        var largo = r.width || a.W;
        tasti.lato = (evento.clientX - (r.left || 0)) < largo / 2 ? -1 : 1;
      }
      return true;
    }

    function scala(a) {
      return Math.max(12, Math.min(a.U * 0.8, (a.W - 32) / (LARGO + 1), a.H / 10));
    }

    function punto() {
      if (st.fase !== 'morto') { return null; }
      var a = ambiente();
      var su = scala(a);
      return { x: a.W / 2 + st.px * su, y: a.H * 0.25 };
    }

    function disegnaBuca() {
      if (st.fase !== 'attesa' && st.fase !== 'tuffo') { return; }
      var a = ambiente();
      var ctx = a.ctx;
      var c = st.M.caduta;
      var x0 = a.sx(c.x0);
      var x1 = a.sx(c.x1);
      if (x1 < -a.margine - 4 || x0 > a.W + a.margine + 4) { return; }
      var fondoBuca = a.H + a.margine + 4;
      ctx.save();
      ctx.fillStyle = a.gd ? a.NERO : a.C.fondo;
      ctx.fillRect(x0, a.suolo - 2, x1 - x0, fondoBuca - a.suolo + 2);
      var abisso = ctx.createLinearGradient(0, a.suolo, 0, a.H);
      abisso.addColorStop(0, 'rgba(0,0,0,0)');
      abisso.addColorStop(1, a.gd ? a.colori.accento : a.C.magenta);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = abisso;
      ctx.fillRect(x0, a.suolo, x1 - x0, fondoBuca - a.suolo);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = a.gd ? a.BIANCO : a.C.allerta;
      ctx.lineWidth = 3;
      ctx.shadowColor = a.gd ? a.colori.accento : a.C.allerta;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x0, a.suolo);
      ctx.lineTo(x0, fondoBuca);
      ctx.moveTo(x1, a.suolo);
      ctx.lineTo(x1, fondoBuca);
      ctx.stroke();
      ctx.restore();
    }

    function blocchetto(a, x0, y0, w, su) {
      var ctx = a.ctx;
      var denti = DENTI * su;
      var corpo = SPESSORE * su - denti;
      var bordo = a.gd ? a.BIANCO : a.C.allerta;
      var alone = a.gd ? a.colori.accento : a.C.allerta;
      ctx.fillStyle = a.gd ? 'rgba(4,6,26,0.92)' : a.C.fondo;
      ctx.fillRect(x0, y0 + denti, w, corpo);
      ctx.strokeStyle = bordo;
      ctx.lineWidth = 2;
      ctx.shadowColor = alone;
      ctx.shadowBlur = a.gd ? 10 : 12;
      ctx.strokeRect(x0 + 1, y0 + denti + 1, w - 2, corpo - 2);
      var quanti = Math.max(1, Math.round(w / (su * 0.45)));
      var passo = w / quanti;
      ctx.beginPath();
      for (var i = 0; i < quanti; i++) {
        ctx.moveTo(x0 + i * passo, y0 + denti);
        ctx.lineTo(x0 + (i + 0.5) * passo, y0);
        ctx.lineTo(x0 + (i + 1) * passo, y0 + denti);
      }
      ctx.fillStyle = a.gd ? a.NERO : a.C.fondo;
      ctx.fill();
      ctx.strokeStyle = a.gd ? a.BIANCO : a.C.magenta;
      ctx.shadowColor = a.gd ? a.colori.accento : a.C.magenta;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function disegnaPolloPozzo(a, x, y, su, morto) {
      var ctx = a.ctx;
      var dondola = a.ridotto ? 0 : Math.sin(a.t * 9) * 0.08;
      ctx.save();
      ctx.translate(x, y);
      if (a.gd) {
        if (morto) { ctx.restore(); return; }
        var lato = su * 0.8;
        ctx.rotate(verso() * 0.2 + dondola);
        var faccia = ctx.createLinearGradient(-lato / 2, -lato / 2, lato / 2, lato / 2);
        faccia.addColorStop(0, a.colori.cubo0);
        faccia.addColorStop(1, a.colori.cubo1);
        ctx.shadowColor = a.colori.accento;
        ctx.shadowBlur = 14;
        a.rettangoloTondo(-lato / 2, -lato / 2, lato, lato, lato * 0.14);
        ctx.fillStyle = faccia;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = a.BIANCO;
        ctx.stroke();
        if (a.polloPronto) { ctx.drawImage(a.pollo, -lato * 0.86 * a.PROPORZIONE / 2, -lato * 0.43, lato * 0.86 * a.PROPORZIONE, lato * 0.86); }
      } else {
        var h = su * ALTO_POLLO * 2.2;
        var w = h * a.PROPORZIONE;
        ctx.rotate(morto ? -0.35 : verso() * 0.25 + dondola);
        ctx.shadowColor = morto ? a.C.magenta : a.C.ciano;
        ctx.shadowBlur = 10;
        if (a.polloPronto) {
          ctx.drawImage(a.pollo, -w / 2, -h / 2, w, h);
        } else {
          ctx.fillStyle = a.C.allerta;
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }
      }
      ctx.restore();
    }

    function disegnaPozzo() {
      if (st.fase !== 'pozzo' && st.fase !== 'morto') { return false; }
      var a = ambiente();
      var ctx = a.ctx;
      var sc = st.schema;
      var m = sc.misure;
      var su = scala(a);
      var cx = a.W / 2;
      var cy = a.H * 0.25;
      var yc = m.discesa * st.tp;
      var sinistra = cx - LARGO / 2 * su;
      var destra = cx + LARGO / 2 * su;
      var sposta = (yc * su) % (su * 1.5);
      var i;
      ctx.save();
      ctx.globalAlpha = st.fase === 'morto' ? 1 : Math.min(1, st.tp / 0.25);
      if (a.gd) {
        var cielo = ctx.createLinearGradient(0, 0, 0, a.H);
        cielo.addColorStop(0, a.colori.cieloAlto);
        cielo.addColorStop(1, a.colori.cieloBasso);
        ctx.fillStyle = cielo;
      } else {
        ctx.fillStyle = a.C.fondo;
      }
      ctx.fillRect(0, 0, a.W, a.H);
      ctx.save();
      ctx.globalAlpha *= a.gd ? 0.12 : 0.3;
      ctx.strokeStyle = a.gd ? a.BIANCO : a.tema.griglia;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var riga = -sposta; riga < a.H; riga += su * 1.5) {
        ctx.moveTo(sinistra, riga);
        ctx.lineTo(destra, riga);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = a.gd ? a.colori.terra : 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, sinistra, a.H);
      ctx.fillRect(destra, 0, a.W - destra, a.H);
      if (!a.ridotto) {
        ctx.save();
        ctx.globalAlpha *= 0.3;
        ctx.strokeStyle = a.gd ? a.BIANCO : a.C.ciano;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (i = 0; i < 14; i++) {
          var sx = sinistra + ((i * 0.618) % 1) * (destra - sinistra);
          var sy = a.H - ((i * 137 + yc * su * 1.6) % (a.H + su * 2)) + su;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy + su * 1.2);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = a.gd ? a.BIANCO : a.tema.orizzonte;
      ctx.lineWidth = 3;
      ctx.shadowColor = a.gd ? a.colori.accento : a.tema.orizzonte;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(sinistra, 0);
      ctx.lineTo(sinistra, a.H);
      ctx.moveTo(destra, 0);
      ctx.lineTo(destra, a.H);
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (i = 0; i < sc.file.length; i++) {
        var f = sc.file[i];
        var y0 = cy + (f.y - yc) * su;
        if (y0 > a.H + su || y0 + SPESSORE * su < -su) { continue; }
        for (var k = 0; k < f.pezzi.length; k++) {
          var p = f.pezzi[k];
          blocchetto(a, cx + p[0] * su, y0, (p[1] - p[0]) * su, su);
        }
      }
      var pavimento = cy + (m.discesa * sc.tempo + ALTO_POLLO - yc) * su;
      if (pavimento < a.H + su) {
        ctx.save();
        ctx.translate(cx, pavimento);
        ctx.rotate(-0.1);
        ctx.fillStyle = a.gd ? a.colori.terra : a.C.fondo;
        ctx.fillRect(-a.W, 0, a.W * 2, a.H * 2);
        ctx.strokeStyle = a.gd ? a.BIANCO : a.tema.orizzonte;
        ctx.lineWidth = 3;
        ctx.shadowColor = a.gd ? a.colori.accento : a.tema.orizzonte;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-a.W, 0);
        ctx.lineTo(a.W, 0);
        ctx.stroke();
        ctx.restore();
      }
      disegnaPolloPozzo(a, cx + st.px * su, cy, su, st.fase === 'morto');
      ctx.restore();
      if (st.fase === 'pozzo' && st.tp < 2.6) {
        var fs = Math.max(12, Math.min(22, a.U * 0.26));
        var aiuto = a.tocco ? 'Tieni premuto a sinistra o a destra' : 'A / D oppure ← → per spostarti';
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = Math.max(0, Math.min(1, (2.6 - st.tp) / 0.5));
        a.scritta(aiuto, a.W / 2, a.H - Math.max(18, fs * 1.2), a.stringi(aiuto, fs, '700', a.MONO, a.W - 32), '700', a.MONO, a.gd ? a.BIANCO : a.C.testo, 'center', a.gd);
        ctx.restore();
      }
      a.disegnaScintille();
      return true;
    }

    function disegnaTesti() {
      if (st.fase !== 'attesa' && st.fase !== 'tuffo') { return; }
      var a = ambiente();
      var S = a.S;
      var c = st.M.caduta;
      if (!S || S.x < c.x0 - st.M.v * AVVISO) { return; }
      if (st.tAvviso < 0) { st.tAvviso = a.t; }
      var eta = a.t - st.tAvviso;
      var alfa = Math.max(0, Math.min(1, eta / 0.25));
      if (st.fase === 'tuffo') { alfa = Math.max(0, 1 - st.tt / TUFFO); }
      if (alfa <= 0) { return; }
      var ctx = a.ctx;
      var dim = a.stringi(TESTO, Math.max(26, a.U * 0.85), '900', a.TITOLO, a.W - 32);
      var entrata = a.ridotto ? 1 : 1 + 0.18 * Math.max(0, 1 - eta / 0.3);
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = alfa;
      ctx.translate(a.W / 2, a.gd ? a.suolo * 0.4 : a.orizzonte * 0.42);
      ctx.scale(entrata, entrata);
      if (a.gd) {
        a.scritta(TESTO, 0, 0, dim, '900', a.TITOLO, a.C.allerta, 'center', true);
      } else {
        ctx.shadowColor = a.C.allerta;
        ctx.shadowBlur = 14;
        a.glitch(TESTO, 0, 0, dim, a.ridotto ? 2 : 2 + (Math.random() < 0.12 ? a.U * 0.05 : 0));
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    return {
      prepara: prepara,
      azzera: azzera,
      inCorso: inCorso,
      entra: entra,
      aggiorna: aggiorna,
      avanzamento: avanzamento,
      tasto: tasto,
      tocco: tocco,
      punto: punto,
      disegnaBuca: disegnaBuca,
      disegnaPozzo: disegnaPozzo,
      disegnaTesti: disegnaTesti,
      fase: function () { return st.fase; },
      schema: function () { return st.schema; }
    };
  }

  var PolloRun = window.PolloRun = window.PolloRun || {};
  PolloRun.caduta = {
    costanti: { PASSO: PASSO, LARGO: LARGO, RAGGIO: RAGGIO, ALTO_POLLO: ALTO_POLLO, SPESSORE: SPESSORE, TUFFO: TUFFO, INIZIO: INIZIO, ARRIVO: ARRIVO, MARGINE: MARGINE, TESTO: TESTO },
    misure: misure,
    schema: schema,
    tocca: tocca,
    crea: crea
  };
}());
