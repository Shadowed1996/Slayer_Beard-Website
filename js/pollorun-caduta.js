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
  var INGRESSO = 0.5;
  var SVANISCE = 0.2;
  var TESTO = 'ATTENTO CHE CADI !';
  var VENTO = 34;
  var PIUME = 6;

  var casuale = window.PolloRun.livelli.casuale;

  function misure(difficolta, n) {
    var estremo = difficolta === 'estremo';
    var k = Math.max(0, (n || 3) - 3);
    return {
      discesa: (estremo ? 6 : 5.2) + Math.min(1.4, 0.07 * k),
      laterale: estremo ? 7.6 : 7,
      pochi: 2,
      tanti: estremo ? 4 : 3,
      corto: 0.8,
      lungo: estremo ? 2.3 : 2,
      sparso: 1.2,
      pausaMin: estremo ? 0.42 : 0.5,
      pausaMax: estremo ? 0.72 : 0.85
    };
  }

  function sparsi(r, m, y, limite) {
    var L = LARGO / 2;
    var quanti = m.pochi + Math.floor(r() * (m.tanti - m.pochi + 1));
    var gruppo = [];
    for (var i = 0; i < quanti; i++) {
      var w = m.corto + r() * (m.lungo - m.corto);
      var lato = r();
      var x0 = lato < 0.15 ? -L : (lato < 0.3 ? L - w : -L + r() * (LARGO - w));
      var yy = Math.min(limite, y + r() * m.sparso);
      gruppo.push({ t: yy / m.discesa, y: yy, tipo: 'sparso', pezzi: [[x0, x0 + w]] });
    }
    gruppo.sort(function (a, b) { return a.y - b.y; });
    return gruppo;
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

  function attraversa(vivi, passi, gruppo, m) {
    var g = griglia(m);
    var indice = passi;
    var fondo = gruppo[gruppo.length - 1].y;
    var fine = Math.ceil((fondo + SPESSORE + ALTO_POLLO) / m.discesa / PASSO) + 1;
    var corrente = vivi;
    var alcuno = true;
    while (indice < fine && alcuno) {
      indice++;
      var yc = m.discesa * (indice * PASSO);
      var attive = [];
      for (var k = 0; k < gruppo.length; k++) {
        if (yc + ALTO_POLLO > gruppo[k].y && yc - ALTO_POLLO < gruppo[k].y + SPESSORE) { attive.push(gruppo[k]); }
      }
      var nuovi = [];
      alcuno = false;
      for (var j = 0; j < corrente.length; j++) {
        var vivo = corrente[j] || corrente[j - 1] || corrente[j + 1] ? 1 : 0;
        for (var q = 0; vivo && q < attive.length; q++) {
          if (tocca((j - g.N) * g.cella, yc, attive[q])) { vivo = 0; }
        }
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

  function schema(caduta, difficolta, n, seme) {
    var m = misure(difficolta, n);
    var r = casuale(seme || caduta.seme || 1);
    var tempo = caduta.durata - TUFFO;
    var ultima = tempo - ARRIVO;
    var limite = m.discesa * ultima;
    var file = [];
    var insieme = [];
    for (var j = 0; j <= 2 * griglia(m).N; j++) { insieme.push(j === griglia(m).N ? 1 : 0); }
    var passi = 0;
    var tr = INIZIO;
    while (tr < ultima) {
      var presa = null;
      for (var prova = 0; prova < 14 && !presa; prova++) {
        var gruppo = sparsi(r, m, m.discesa * tr, limite);
        if (gruppo[0].y < m.discesa * passi * PASSO + ALTO_POLLO) { break; }
        var dopo = attraversa(insieme, passi, gruppo, m);
        if (piuLargo(dopo.insieme, m) >= MARGINE) { presa = { gruppo: gruppo, dopo: dopo }; }
      }
      if (presa) {
        for (var k = 0; k < presa.gruppo.length; k++) { file.push(presa.gruppo[k]); }
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
    var st = { fase: 'no', M: null, schema: null, tt: 0, tp: 0, passi: 0, px: 0, resto: 0, prossima: 0, tAvviso: -1, xArrivo: 0, alt0: 0, passiUscita: 1, tUscita: 0 };
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
      st.schema = schema(M.caduta, M.difficolta, M.n, 1 + Math.floor(Math.random() * 2000000000));
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

    function inCorso() { return st.fase === 'tuffo' || st.fase === 'pozzo' || st.fase === 'uscita'; }

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
      if (st.fase !== 'pozzo' && st.fase !== 'uscita') { return ''; }
      var sc = st.schema;
      var m = sc.misure;
      var bordo = LARGO / 2 - RAGGIO;
      var ultimo = Math.round(sc.tempo / PASSO);
      var soglia = st.fase === 'pozzo' ? passiUscita() : 0;
      st.resto += dt;
      while (st.resto >= PASSO - 1e-9) {
        st.resto -= PASSO;
        st.passi++;
        st.tp = st.passi * PASSO;
        if (st.fase === 'pozzo') {
          st.px = Math.max(-bordo, Math.min(bordo, st.px + verso() * m.laterale * PASSO));
          var yc = m.discesa * st.tp;
          while (st.prossima < sc.file.length && sc.file[st.prossima].y + SPESSORE < yc - ALTO_POLLO) { st.prossima++; }
          for (var i = st.prossima; i < sc.file.length && sc.file[i].y < yc + ALTO_POLLO; i++) {
            if (tocca(st.px, yc, sc.file[i])) {
              st.fase = 'morto';
              return 'morto';
            }
          }
          if (st.passi >= ultimo - soglia) { esci(S, ultimo); }
        } else {
          S.alt = st.alt0 * Math.max(0, (ultimo - st.passi) / st.passiUscita);
        }
        if (st.passi >= ultimo) {
          atterra(S);
          return 'atterrato';
        }
      }
      return '';
    }

    function passiUscita() {
      var a = ambiente();
      var v = vista(a);
      var distanza = v.piediY - (v.cy + v.alto / 2);
      var secondi = distanza / (st.schema.misure.discesa * v.su);
      return Math.round(Math.max(0.15, Math.min(ARRIVO - 0.1, secondi)) / PASSO);
    }

    function esci(S, ultimo) {
      var a = ambiente();
      var v = vista(a);
      var c = st.M.caduta;
      st.xArrivo = v.x;
      st.passiUscita = Math.max(1, ultimo - st.passi);
      var piediY = a.piedi ? a.piedi(v.x, v.giroArrivo) : v.piediY;
      st.alt0 = Math.max(0, (piediY - (v.y + v.alto / 2)) / ((a.U || v.su) * Math.cos(v.giroArrivo)));
      st.tUscita = st.tp;
      st.fase = 'uscita';
      S.x = c.x1;
      S.alt = st.alt0;
      S.va = -st.alt0 / (st.passiUscita * PASSO);
      S.aTerra = false;
      S.salto = false;
      S.richiesta = false;
      tasti.lato = 0;
    }

    function avanzamento(S, M) {
      var c = M.caduta;
      var w = c.x1 - c.x0;
      var totale = M.lunghezza - w + M.v * c.durata;
      var x = S.x;
      if (st.fase === 'tuffo' || st.fase === 'pozzo' || st.fase === 'uscita' || st.fase === 'morto') { x = c.x0 + M.v * (st.tt + st.tp); } else if (st.fase === 'fatta') { x = S.x - w + M.v * c.durata; }
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
      var alto = a.polloAlto || a.U;
      var su = a.gd ? alto / 0.8 : alto / (ALTO_POLLO * 2.2);
      return Math.max(12, Math.min(su, (a.W - 32) / (LARGO + 1)));
    }

    function morbido(q) {
      q = Math.max(0, Math.min(1, q));
      return q * q * (3 - 2 * q);
    }

    function angoloArrivo(a) {
      var tratti = st.M && st.M.tratti;
      if (!tratti) { return 0; }
      for (var i = 0; i < tratti.length; i++) {
        if (tratti[i].caduta) { return -tratti[i].verso * tratti[i].a * (a.ridotto ? 0.25 : 1); }
      }
      return 0;
    }

    function vista(a) {
      var su = scala(a);
      var alto = su * (a.gd ? 0.8 : ALTO_POLLO * 2.2);
      var giroArrivo = angoloArrivo(a);
      var cx = a.W / 2;
      var cy = Math.max(alto * 0.6 + 8, a.H * 0.16);
      var uscita = st.fase === 'uscita';
      var x = uscita ? st.xArrivo : cx + st.px * su;
      var piediY = a.piedi ? a.piedi(x, giroArrivo) : (typeof a.suolo === 'number' ? a.suolo : a.H * 0.8);
      var y = -alto + (cy + alto) * morbido(st.tp / INGRESSO);
      if (uscita && a.S) {
        var sopra = a.S.alt * (a.U || su) + alto / 2;
        x += Math.sin(giroArrivo) * sopra;
        y = piediY - Math.cos(giroArrivo) * sopra;
      }
      return { su: su, alto: alto, cx: cx, cy: cy, giroArrivo: giroArrivo, giro: uscita ? giroArrivo : 0, x: x, y: y, piediY: piediY };
    }

    function xArrivo() {
      return st.fase === 'uscita' || st.fase === 'fatta' ? st.xArrivo : null;
    }

    function punto() {
      if (st.fase !== 'morto') { return null; }
      var v = vista(ambiente());
      return { x: v.x, y: v.y };
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

    function disegnaPiume(a, x, y, su) {
      var ctx = a.ctx;
      ctx.save();
      ctx.fillStyle = a.gd ? a.BIANCO : a.C.ciano;
      for (var i = 0; i < PIUME; i++) {
        var fase = (a.t * 1.4 + i / PIUME) % 1;
        var px = x + Math.sin(i * 2.1 + a.t * 3) * su * 0.5 * (0.4 + fase);
        var py = y - su * 0.2 - fase * su * 3.2;
        ctx.save();
        ctx.globalAlpha = (1 - fase) * 0.7;
        ctx.translate(px, py);
        ctx.rotate(a.t * 4 + i);
        if (a.gd) {
          ctx.fillRect(-su * 0.06, -su * 0.06, su * 0.12, su * 0.12);
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, su * 0.13, su * 0.045, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    function disegnaPolloPozzo(a, x, y, su, morto, giro) {
      var fuori = giro ? 1 : 0;
      var ctx = a.ctx;
      var dondola = a.ridotto ? 0 : (Math.sin(a.t * 9) * 0.08 + Math.sin(a.t * 31) * 0.035) * (1 - fuori);
      ctx.save();
      ctx.translate(x, y);
      if (a.gd) {
        if (morto) { ctx.restore(); return; }
        var lato = su * 0.8;
        ctx.rotate((verso() * 0.2 + dondola) * (1 - fuori) + giro * fuori);
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
        ctx.rotate(morto ? -0.35 : (verso() * 0.25 + dondola) * (1 - fuori) + giro * fuori);
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
      if (st.fase !== 'pozzo' && st.fase !== 'morto' && st.fase !== 'uscita') { return false; }
      var a = ambiente();
      var alfa = 1;
      if (st.fase === 'uscita') {
        alfa = 1 - (st.tp - st.tUscita) / SVANISCE;
        if (alfa <= 0) { return false; }
      }
      var ctx = a.ctx;
      var sc = st.schema;
      var m = sc.misure;
      var v = vista(a);
      var su = v.su;
      var cx = v.cx;
      var cy = v.cy;
      var yc = m.discesa * st.tp;
      var sinistra = cx - LARGO / 2 * su;
      var destra = cx + LARGO / 2 * su;
      var sposta = (yc * su) % (su * 1.5);
      var i;
      ctx.save();
      ctx.globalAlpha = st.fase === 'pozzo' ? Math.min(1, st.tp / 0.25) : alfa;
      if (a.gd) {
        var cielo = ctx.createLinearGradient(0, 0, 0, a.H);
        cielo.addColorStop(0, a.colori.cieloAlto);
        cielo.addColorStop(1, a.colori.cieloBasso);
        ctx.fillStyle = cielo;
      } else {
        ctx.fillStyle = a.C.fondo;
      }
      ctx.fillRect(0, 0, a.W, a.H);
      var fondo = ctx.globalAlpha;
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
        ctx.strokeStyle = a.gd ? a.BIANCO : a.C.ciano;
        ctx.lineCap = 'round';
        var ciclo = a.H + su * 6;
        for (i = 0; i < VENTO; i++) {
          var fase = (i * 0.618) % 1;
          var veloce = 1.4 + ((i * 0.37) % 1) * 1.6;
          var sx = sinistra + su * 0.2 + fase * (destra - sinistra - su * 0.4);
          var sy = a.H + su * 3 - ((i * 173 + a.t * veloce * m.discesa * su) % ciclo);
          var lungo = su * (0.8 + veloce * 0.9);
          var ondeggia = Math.sin(a.t * 2.3 + i) * su * 0.25;
          ctx.globalAlpha = fondo * (0.12 + 0.2 * ((i * 0.53) % 1));
          ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
          ctx.beginPath();
          ctx.moveTo(sx + ondeggia, sy);
          ctx.quadraticCurveTo(sx + ondeggia * 1.8, sy + lungo / 2, sx, sy + lungo);
          ctx.stroke();
        }
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
      ctx.globalAlpha = fondo;
      for (i = 0; i < sc.file.length; i++) {
        var f = sc.file[i];
        var y0 = cy + (f.y - yc) * su;
        if (y0 > a.H + su || y0 + SPESSORE * su < -su) { continue; }
        for (var k = 0; k < f.pezzi.length; k++) {
          var p = f.pezzi[k];
          blocchetto(a, cx + p[0] * su, y0, (p[1] - p[0]) * su, su);
        }
      }
      if (!a.ridotto && st.fase === 'pozzo') { disegnaPiume(a, v.x, v.y, su); }
      disegnaPolloPozzo(a, v.x, v.y, su, st.fase === 'morto', v.giro);
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
      xArrivo: xArrivo,
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
