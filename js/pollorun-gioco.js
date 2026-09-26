(function () {
  'use strict';

  var G = 33.3;
  var V0 = 10;
  var ARIA = 2 * V0 / G;
  var PASSO = 1 / 120;
  var MEZZO = 0.18;
  var CORPO_BASSO = 0.08;
  var CORPO_ALTO = 0.8;
  var BUFFER = 0.14;
  var CADUTA = -0.9;
  var TESSERA = 0.62;
  var PUNTA_L = 0.56;
  var PUNTA_A = 0.62;
  var ROMBO_L = 0.62;
  var ROMBO_A = 0.55;
  var ROMBO_QUOTA = 1.2;
  var FONDO = -5;
  var RAMPA_T = 0.9;
  var RAMPA_0 = 0.55;
  var DECISIONE = 3;
  var TETTO_STATI = 700;
  var TENTATIVI = 8;
  var TEMI = 6;

  function casuale(seme) {
    return function () {
      seme = (seme * 16807) % 2147483647;
      return (seme - 1) / 2147483646;
    };
  }

  function parametri(n) {
    var k = Math.max(0, n - 1);
    var v = k < 12.8 ? 8.6 + 0.5 * k : Math.min(17, 15 + 0.12 * (k - 12.8));
    var tau = Math.max(0.12, 0.5 - 0.025 * k);
    var durata = Math.min(46, 22 + k);
    return {
      n: n,
      v: v,
      J: ARIA * v,
      tau: tau,
      mx: v * tau * 0.3,
      durata: durata,
      lunghezza: Math.round(v * durata),
      quieteMin: Math.max(0.1, 0.6 - 0.035 * k),
      quieteMax: Math.max(0.42, 1.5 - 0.08 * k),
      tema: k % TEMI
    };
  }

  function velocitaDi(s) {
    return s.v * s.fr * (s.t < RAMPA_T ? RAMPA_0 + (1 - RAMPA_0) * s.t / RAMPA_T : 1);
  }

  function nuovoStato(v) {
    return { x: 0, alt: 0, va: 0, aTerra: true, salto: false, buf: 0, richiesta: false, morto: 0, t: 0, v: v, fr: 1 };
  }

  function statoIniziale(v) {
    var s = nuovoStato(v);
    s.x = 0.75 * v;
    s.t = RAMPA_T;
    return s;
  }

  function copia(s) {
    return { x: s.x, alt: s.alt, va: s.va, aTerra: s.aTerra, salto: s.salto, buf: s.buf, richiesta: s.richiesta, morto: s.morto, t: s.t, v: s.v, fr: s.fr };
  }

  function nuovoAttorno() {
    return { solidi: [], pericoli: [], mx: 0 };
  }

  function primo(elenco, x) {
    var da = 0;
    var a = elenco.length;
    while (da < a) {
      var m = (da + a) >> 1;
      if (elenco[m].x0 < x) { da = m + 1; } else { a = m; }
    }
    return da;
  }

  function vicino(M, x, mx, at) {
    var da = x - MEZZO - mx - 0.2;
    var a = x + MEZZO + mx + 0.2;
    var i, e;
    at.solidi.length = 0;
    at.pericoli.length = 0;
    at.mx = mx;
    for (i = 0; i < M.suoli.length; i++) {
      e = M.suoli[i];
      if (e.x1 >= da && e.x0 <= a) { at.solidi.push(e); }
    }
    for (i = primo(M.solidi, da - M.lungoS); i < M.solidi.length && M.solidi[i].x0 <= a; i++) {
      e = M.solidi[i];
      if (e.x1 >= da) { at.solidi.push(e); }
    }
    for (i = primo(M.pericoli, da - M.lungoP); i < M.pericoli.length && M.pericoli[i].x0 <= a; i++) {
      e = M.pericoli[i];
      if (e.x1 >= da) { at.pericoli.push(e); }
    }
    return at;
  }

  function passo(s, at) {
    var mx = at.mx;
    var so = at.solidi;
    var pe = at.pericoli;
    var i, o;
    if (s.richiesta) {
      s.richiesta = false;
      if (s.aTerra) {
        s.va = V0;
        s.aTerra = false;
        s.salto = true;
      } else {
        s.buf = BUFFER;
      }
    }
    if (s.buf > 0) { s.buf = Math.max(0, s.buf - PASSO); }
    var prima = s.alt;
    s.t += PASSO;
    if (!s.aTerra) {
      s.va -= G * PASSO;
      s.alt += s.va * PASSO;
    }
    s.x += velocitaDi(s) * PASSO;
    var s0 = s.x - MEZZO;
    var s1 = s.x + MEZZO;
    if (!s.aTerra) {
      if (s.va <= 0) {
        var piano = -Infinity;
        for (i = 0; i < so.length; i++) {
          o = so[i];
          if (s1 > o.x0 + mx && s0 < o.x1 - mx && prima >= o.t - CORPO_BASSO && s.alt <= o.t && o.t > piano) { piano = o.t; }
        }
        if (piano > -Infinity) {
          s.alt = piano;
          s.va = 0;
          s.aTerra = true;
          s.salto = false;
          if (s.buf > 0) {
            s.buf = 0;
            s.va = V0;
            s.aTerra = false;
            s.salto = true;
          }
        }
      }
    } else {
      var appoggio = false;
      for (i = 0; i < so.length; i++) {
        o = so[i];
        if (s1 > o.x0 + mx && s0 < o.x1 - mx && Math.abs(o.t - s.alt) < 1e-9) { appoggio = true; break; }
      }
      if (!appoggio) {
        s.aTerra = false;
        s.va = 0;
      }
    }
    var basso = s.alt + CORPO_BASSO;
    var alto = s.alt + CORPO_ALTO;
    for (i = 0; i < so.length; i++) {
      o = so[i];
      if (s1 > o.x0 - mx && s0 < o.x1 + mx && basso < o.t && alto > o.b) { s.morto = 2; return; }
    }
    for (i = 0; i < pe.length; i++) {
      o = pe[i];
      if (s1 > o.x0 - mx && s0 < o.x1 + mx && alto > o.y0 && basso < o.y1) { s.morto = 1; return; }
    }
    if (s.alt < CADUTA) { s.morto = 3; }
  }

  function nuovoMondo(P) {
    return {
      n: P.n, v: P.v, J: P.J, tau: P.tau, mx: P.mx, lunghezza: P.lunghezza, durata: P.durata, tema: P.tema,
      el: [], solidi: [], pericoli: [], buche: [], suoli: [], lungoS: 0, lungoP: 0, figure: []
    };
  }

  function perX0(a, b) { return a.x0 - b.x0; }
  function perX(a, b) { return a.x - b.x; }

  function ricostruisciSuoli(M) {
    var suoli = [];
    var da = -1000;
    for (var i = 0; i < M.buche.length; i++) {
      suoli.push({ x0: da, x1: M.buche[i].x0, b: FONDO, t: 0 });
      da = M.buche[i].x1;
    }
    suoli.push({ x0: da, x1: 100000, b: FONDO, t: 0 });
    M.suoli = suoli;
  }

  function aggiungi(M, e) {
    var s;
    if (e.k === 'b') {
      e.x1 = e.x + e.w;
      s = { x0: e.x, x1: e.x1, b: e.b, t: e.t };
      M.solidi.push(s);
      M.lungoS = Math.max(M.lungoS, s.x1 - s.x0);
    } else if (e.k === 'p') {
      e.x1 = e.x + e.n * PUNTA_L;
      s = { x0: e.x + 0.28 * PUNTA_L, x1: e.x1 - 0.28 * PUNTA_L, y0: e.base, y1: e.base + 0.75 * PUNTA_A };
      M.pericoli.push(s);
      M.lungoP = Math.max(M.lungoP, s.x1 - s.x0);
    } else if (e.k === 'r') {
      e.x1 = e.x + ROMBO_L;
      s = { x0: e.x + 0.2 * ROMBO_L, x1: e.x + 0.8 * ROMBO_L, y0: e.base + 0.1 * ROMBO_A, y1: e.base + 0.85 * ROMBO_A };
      M.pericoli.push(s);
      M.lungoP = Math.max(M.lungoP, s.x1 - s.x0);
    } else if (e.k === 'u') {
      e.x1 = e.x + e.w;
      M.buche.push({ x0: e.x, x1: e.x1 });
    }
    M.el.push(e);
  }

  function proponi(M, elementi) {
    var salvato = { el: M.el.length, so: M.solidi.length, pe: M.pericoli.length, bu: M.buche.length };
    elementi.sort(perX);
    for (var i = 0; i < elementi.length; i++) { aggiungi(M, elementi[i]); }
    M.solidi.push.apply(M.solidi, M.solidi.splice(salvato.so).sort(perX0));
    M.pericoli.push.apply(M.pericoli, M.pericoli.splice(salvato.pe).sort(perX0));
    M.buche.push.apply(M.buche, M.buche.splice(salvato.bu).sort(perX0));
    ricostruisciSuoli(M);
    return salvato;
  }

  function annulla(M, salvato) {
    M.el.length = salvato.el;
    M.solidi.length = salvato.so;
    M.pericoli.length = salvato.pe;
    M.buche.length = salvato.bu;
    ricostruisciSuoli(M);
  }

  function chiave(s) {
    return ((Math.round(s.alt * 500) + 4000) * 8192 + (Math.round(s.va * 100) + 4096)) * 4 + (s.aTerra ? 2 : 0) + (s.buf > 0 ? 1 : 0);
  }

  function assottiglia(elenco) {
    if (elenco.length <= TETTO_STATI) { return elenco; }
    var passoDi = elenco.length / TETTO_STATI;
    var out = [];
    for (var i = 0; i < TETTO_STATI; i++) { out.push(elenco[Math.floor(i * passoDi)]); }
    return out;
  }

  function avanza(M, fronte, xFine, mx) {
    var at = nuovoAttorno();
    var corrente = fronte;
    var indice = Math.round(corrente[0].t / PASSO);
    while (corrente.length && corrente[0].x < xFine) {
      vicino(M, corrente[0].x, mx, at);
      var decide = indice % DECISIONE === 0;
      var prossimi = new Map();
      for (var i = 0; i < corrente.length; i++) {
        var s = corrente[i];
        var a = copia(s);
        passo(a, at);
        if (!a.morto) {
          prossimi.set(chiave(a), a);
          if (a.aTerra && !s.aTerra) {
            var subito = copia(a);
            subito.va = V0;
            subito.aTerra = false;
            subito.salto = true;
            prossimi.set(chiave(subito), subito);
          }
        }
        if (decide && s.aTerra) {
          var b = copia(s);
          b.richiesta = true;
          passo(b, at);
          if (!b.morto) { prossimi.set(chiave(b), b); }
        }
      }
      corrente = assottiglia(Array.from(prossimi.values()));
      indice++;
    }
    return corrente;
  }

  function tessere(w) { return Math.max(1, Math.round(w / TESSERA)) * TESSERA; }
  function punte(x, n, base) { return { k: 'p', x: x, n: n, base: base || 0 }; }
  function blocco(x, w, t, pilastro) { return { k: 'b', x: x, w: w, t: t, b: FONDO, pil: !!pilastro }; }
  function rombo(x, base) { return { k: 'r', x: x, base: base }; }
  function buca(x, w) { return { k: 'u', x: x, w: w }; }

  function figPunta(c) {
    return [punte(c.x, 1)];
  }

  function figPunte(c) {
    return [punte(c.x, 2 + (c.n >= 4 && c.r() < 0.5 ? 1 : 0))];
  }

  function figBlocco(c) {
    var alto = c.n >= 9 && c.r() < 0.4 ? 2 : 1;
    return [blocco(c.x, tessere(TESSERA * (1 + c.r() * 2.5)), alto * TESSERA)];
  }

  function figPiattaforma(c) {
    var alto = c.n >= 9 && c.r() < 0.35 ? 2 : 1;
    return [blocco(c.x, tessere(c.J * (0.45 + c.r() * 0.8)), alto * TESSERA)];
  }

  function figPiattaformaPunte(c) {
    var alto = c.n >= 12 && c.r() < 0.3 ? 2 : 1;
    var largo = tessere(c.J * (0.9 + c.r() * 0.5));
    var k = c.n >= 8 && c.r() < 0.4 ? 2 : 1;
    return [blocco(c.x, largo, alto * TESSERA), punte(c.x + largo * (0.4 + c.r() * 0.25), k, alto * TESSERA)];
  }

  function figCatena(c) {
    var k = 2 + Math.floor(c.r() * Math.min(4, 1 + (c.n - 5) / 3));
    var els = [];
    var x = c.x;
    for (var i = 0; i < k; i++) {
      els.push(punte(x, 1));
      x += 0.61 + c.v * c.tau * c.s * (0.6 + c.r() * 0.8);
    }
    return els;
  }

  function figBuca(c) {
    var massimo = Math.min(c.J + 0.36 - 0.6 * c.tau * c.v * c.s, c.J * 0.85);
    if (massimo < 1.8) { return null; }
    return [buca(c.x, 1.6 + c.r() * (massimo - 1.6))];
  }

  function figScala(c) {
    var largo = tessere(Math.max(1.9, c.J * (0.35 + c.r() * 0.25)));
    var els = [blocco(c.x, largo, TESSERA), blocco(c.x + largo, largo, 2 * TESSERA)];
    var cima = tessere(c.J * (0.4 + c.r() * 0.4));
    els.push(blocco(c.x + 2 * largo, cima, 2 * TESSERA));
    if (c.n >= 10 && c.r() < 0.5) { els.push(blocco(c.x + 2 * largo + cima, largo, TESSERA)); }
    return els;
  }

  function figBucaPunta(c) {
    var massimo = Math.min(c.J + 0.36 - 0.6 * c.tau * c.v * c.s, c.J * 0.7);
    if (massimo < 1.8) { return null; }
    var p = 1.6 + c.r() * (massimo - 1.6);
    var d = 0.5 + c.v * c.tau * c.s * (0.5 + c.r());
    return [buca(c.x, p), punte(c.x + p + d, 1 + (c.n >= 12 && c.r() < 0.4 ? 1 : 0))];
  }

  function figRomboPunta(c) {
    var d = 0.9 + c.v * c.tau * c.s * (0.6 + c.r() * 0.8);
    return [rombo(c.x, ROMBO_QUOTA), punte(c.x + ROMBO_L + d, 1 + (c.n >= 10 && c.r() < 0.4 ? 1 : 0))];
  }

  function figVallata(c) {
    var alto = c.n >= 10 && c.r() < 0.4 ? 2 : 1;
    var a = tessere(c.J * (0.35 + c.r() * 0.3));
    var b = tessere(c.J * (0.35 + c.r() * 0.3));
    var vuoto = c.J * (0.3 + c.r() * 0.35);
    var k = vuoto > 3 && c.r() < 0.5 ? 2 : 1;
    return [
      blocco(c.x, a, alto * TESSERA),
      punte(c.x + a + vuoto / 2 - k * PUNTA_L / 2, k, 0),
      blocco(c.x + a + vuoto, b, alto * TESSERA)
    ];
  }

  function figIsole(c) {
    var k = 2 + Math.floor(c.r() * Math.min(3, 1 + (c.n - 9) / 5));
    var x = c.x + 1.2 + c.r() * 0.8;
    var els = [];
    var altezza = 1;
    var fine = x;
    for (var i = 0; i < k; i++) {
      var largo = tessere(Math.max(1.2, c.v * c.tau * c.s * 1.2));
      altezza = Math.max(0, Math.min(2, altezza + Math.floor(c.r() * 3) - 1));
      els.push(blocco(x, largo, altezza * TESSERA, true));
      fine = x + largo;
      x = fine + c.J * (0.3 + c.r() * 0.45);
    }
    els.push(buca(c.x, fine + 1.2 - c.x));
    return els;
  }

  function figPiattaformaRombo(c) {
    var largo = tessere(c.J * (1 + c.r() * 0.5));
    return [blocco(c.x, largo, TESSERA), rombo(c.x + largo * (0.5 + c.r() * 0.2), TESSERA + ROMBO_QUOTA)];
  }

  function figCatenaMista(c) {
    var k = 3 + Math.floor(c.r() * Math.min(3, 1 + (c.n - 11) / 3));
    var els = [];
    var x = c.x;
    for (var i = 0; i < k; i++) {
      var largo;
      if (c.r() < 0.5) {
        els.push(punte(x, 1));
        largo = PUNTA_L;
      } else {
        els.push(blocco(x, TESSERA, TESSERA));
        largo = TESSERA;
      }
      x += largo + 0.1 + c.v * c.tau * c.s * (0.6 + c.r() * 0.8);
    }
    return els;
  }

  function figScalaPunte(c) {
    var largo = tessere(Math.max(2.4, c.J * (0.5 + c.r() * 0.25)));
    var els = [blocco(c.x, largo, TESSERA), punte(c.x + largo * 0.6, 1, TESSERA)];
    els.push(blocco(c.x + largo, largo, 2 * TESSERA));
    els.push(punte(c.x + largo * 1.6, 1, 2 * TESSERA));
    return els;
  }

  var FIGURE = [
    { nome: 'punta', semplice: true, da: 1, peso: 5, crea: figPunta },
    { nome: 'punte', semplice: true, da: 2, peso: 4, crea: figPunte },
    { nome: 'blocco', semplice: true, da: 2, peso: 3, crea: figBlocco },
    { nome: 'piattaforma', semplice: true, da: 3, peso: 3, crea: figPiattaforma },
    { nome: 'piattaformaPunte', da: 4, peso: 3, crea: figPiattaformaPunte },
    { nome: 'catena', da: 5, peso: 3, crea: figCatena },
    { nome: 'buca', da: 6, peso: 3, crea: figBuca },
    { nome: 'scala', da: 7, peso: 2, crea: figScala },
    { nome: 'bucaPunta', da: 8, peso: 2, crea: figBucaPunta },
    { nome: 'romboPunta', da: 8, peso: 2, crea: figRomboPunta },
    { nome: 'vallata', da: 9, peso: 2, crea: figVallata },
    { nome: 'isole', da: 10, peso: 2, crea: figIsole },
    { nome: 'piattaformaRombo', da: 11, peso: 2, crea: figPiattaformaRombo },
    { nome: 'catenaMista', da: 12, peso: 2, crea: figCatenaMista },
    { nome: 'scalaPunte', da: 14, peso: 2, crea: figScalaPunte }
  ];

  function scegli(P, r, moltiplicatori, ultima) {
    var pesi = [];
    var totale = 0;
    for (var i = 0; i < FIGURE.length; i++) {
      var f = FIGURE[i];
      var peso = 0;
      if (P.n >= f.da) {
        var salita = P.n - f.da;
        var equilibrio = f.semplice ? Math.max(0.15, 1 - 0.07 * salita) : 1 + Math.min(1.2, 0.1 * salita);
        peso = f.peso * moltiplicatori[i] * equilibrio * (P.n === f.da ? 3 : 1) * (f.nome === ultima ? 0.35 : 1);
      }
      pesi.push(peso);
      totale += peso;
    }
    var punto = r() * totale;
    for (var j = 0; j < pesi.length; j++) {
      punto -= pesi[j];
      if (punto <= 0 && pesi[j] > 0) { return FIGURE[j]; }
    }
    return FIGURE[0];
  }

  function fineDi(els) {
    var fine = 0;
    for (var i = 0; i < els.length; i++) { fine = Math.max(fine, els[i].x + (els[i].w || (els[i].k === 'p' ? els[i].n * PUNTA_L : ROMBO_L))); }
    return fine;
  }

  function creaLivello(n) {
    var P = parametri(n);
    var r = casuale(n * 104729 + 7);
    var rSeme = casuale(n * 7919 + 3);
    var M = nuovoMondo(P);
    var moltiplicatori = [];
    for (var m = 0; m < FIGURE.length; m++) { moltiplicatori.push(0.45 + 1.4 * r()); }
    var fronte = [statoIniziale(P.v)];
    var limite = P.lunghezza - P.v * 2;
    var fine = P.v * 1.7 - (0.36 + P.v * P.quieteMax);
    var ultima = null;
    var ultimaSeme = 0;
    while (fine < limite) {
      var avanzamento = Math.max(0, Math.min(1, (fine - P.v * 1.7) / (limite - P.v * 1.7)));
      var salita = Math.max(0, Math.min(1, (avanzamento - 0.08) / 0.62));
      var intensita = 1.25 - 0.65 * salita * salita * (3 - 2 * salita) + (avanzamento > 0.88 ? 0.3 : 0);
      var accettata = false;
      for (var scelta = 0; scelta < 6 && !accettata; scelta++) {
        var ripeti = scelta === 0 && ultima && r() < 0.22;
        var f = ripeti ? ultima : scegli(P, r, moltiplicatori, ultima && ultima.nome);
        var seme = ripeti ? ultimaSeme : 1 + Math.floor(rSeme() * 2000000000);
        var quiete = (P.quieteMin + Math.pow(r(), 1 + n / 8) * (P.quieteMax - P.quieteMin)) * intensita;
        for (var t = 0; t < TENTATIVI && !accettata; t++) {
          var s = 1 + 0.25 * t;
          var c = { x: Math.max(fine + (0.36 + P.v * quiete) * s, fronte[0].x + 2 * P.mx + MEZZO + 0.3, P.v * 1.7), v: P.v, J: P.J, tau: P.tau, n: n, s: s, r: casuale(seme) };
          var els = f.crea(c);
          if (!els) { continue; }
          var fineFigura = fineDi(els);
          if (fineFigura > limite) { break; }
          var salvato = proponi(M, els);
          var dopo = avanza(M, fronte, fineFigura + P.mx + 2 * MEZZO + 0.3, P.mx);
          if (dopo.length) {
            fronte = dopo;
            fine = fineFigura;
            accettata = true;
            M.figure.push(f.nome);
            ultima = f;
            ultimaSeme = seme;
          } else {
            annulla(M, salvato);
          }
        }
      }
      if (!accettata) {
        fine += P.v * 0.8;
        ultima = null;
      }
    }
    return M;
  }

  var PolloRun = window.PolloRun = window.PolloRun || {};
  PolloRun.livelli = {
    costanti: {
      G: G, V0: V0, ARIA: ARIA, PASSO: PASSO, MEZZO: MEZZO, CORPO_BASSO: CORPO_BASSO, CORPO_ALTO: CORPO_ALTO, BUFFER: BUFFER,
      CADUTA: CADUTA, TESSERA: TESSERA, PUNTA_L: PUNTA_L, PUNTA_A: PUNTA_A, ROMBO_L: ROMBO_L, ROMBO_A: ROMBO_A, ROMBO_QUOTA: ROMBO_QUOTA,
      FONDO: FONDO, RAMPA_T: RAMPA_T, RAMPA_0: RAMPA_0, TEMI: TEMI
    },
    parametri: parametri,
    crea: creaLivello,
    nuovoStato: nuovoStato,
    statoIniziale: statoIniziale,
    copia: copia,
    nuovoAttorno: nuovoAttorno,
    vicino: vicino,
    passo: passo,
    velocitaDi: velocitaDi
  };
}());

(function () {
  'use strict';

  var Livelli = window.PolloRun.livelli;
  var K = Livelli.costanti;
  var CHIAVE_LIVELLO = 'sb-pollo-livello';
  var PROPORZIONE = 386 / 556;
  var DURATA_FRENATA = 1.5;
  var ATTESA_ARRIVO = 0.7;
  var ATTESA_RIPROVA = 0.4;
  var RITORNO_FINE = 12;
  var PERMUTAZIONI = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];

  function crea(opzioni) {
    var tela = opzioni.tela;
    var ctx = tela && tela.getContext ? tela.getContext('2d') : null;
    if (!ctx) { return { avvia: function () { }, ferma: function () { }, distruggi: function () { } }; }
    var sipario = !!opzioni.sipario;
    var ridotto = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var tocco = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

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

    function creaTema(indice) {
      var base = [C.viola, C.ciano, C.magenta];
      var p = PERMUTAZIONI[indice % PERMUTAZIONI.length];
      var a = base[p[0]];
      var b = base[p[1]];
      var c = base[p[2]];
      return { cielo: a, sole: [C.allerta, c, a], lontani: a, reteLontani: C.violaChiaro, vicini: b, reteVicini: c, griglia: c, orizzonte: b };
    }

    var pollo = new Image();
    var polloPronto = false;
    pollo.onload = function () { polloPronto = true; if (attivo) { disegna(); } };
    pollo.src = opzioni.pollo || '';

    var frasi = [];
    var lette = Array.isArray(opzioni.frasi) ? opzioni.frasi : [];
    for (var f = 0; f < lette.length; f++) {
      if (typeof lette[f] === 'string' && lette[f].trim()) { frasi.push(lette[f].trim()); }
    }
    var mazzo = [];
    var ultimaFrase = '';

    var raggiunto = 1;
    try { raggiunto = Math.max(1, parseInt(localStorage.getItem(CHIAVE_LIVELLO), 10) || 1); } catch (e) { raggiunto = 1; }

    var W = 0, H = 0, dpr = 1, U = 40, orizzonte = 0, suolo = 0, polloX = 0;
    var stato = 'fermo';
    var t = 0, tStato = 0, tArrivo = 0, deriva = 0;
    var livello = 1, tentativo = 1, tentativiDi = 0;
    var M = null, S = null, prossimoM = null, tema = creaTema(0);
    var attorno = Livelli.nuovoAttorno();
    var resto = 0, giro = 0, scia = 0;
    var scintille = [], lampo = 0, scossa = 0, frase = '';
    var ultimo = 0, acceso = false, attivo = false, idFrame = 0;
    var timerPrecalcolo = 0;

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
      U = Math.max(34, Math.min(96, H * 0.229));
      orizzonte = H * 0.58;
      suolo = orizzonte + (H - orizzonte) * 0.66;
      polloX = Math.max(14, Math.min(W * 0.07, 110));
    }

    function larghezzaPollo() { return U * PROPORZIONE; }
    function centroPollo() { return polloX + larghezzaPollo() / 2; }
    function sx(x) { return centroPollo() + (x - (S ? S.x : 0)) * U; }
    function sy(alt) { return suolo - alt * U; }

    function sole() {
      var r = Math.min(H * 0.5, W * 0.22);
      var cx = W * 0.72;
      var cy = orizzonte;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.closePath();
      var g = ctx.createLinearGradient(0, cy - r, 0, cy);
      g.addColorStop(0, tema.sole[0]);
      g.addColorStop(0.55, tema.sole[1]);
      g.addColorStop(1, tema.sole[2]);
      ctx.fillStyle = g;
      ctx.shadowColor = tema.sole[1];
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
      cielo.addColorStop(1, tema.cielo);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = cielo;
      ctx.fillRect(0, 0, W, orizzonte);
      ctx.restore();
    }

    function disegnaMonti(punti, largo, alto, passoX, linea, rete) {
      var vertici = [];
      var partenza = -(passoX % largo) - largo;
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
        var sinistra = vertici[k - 1];
        var destra = vertici[k + 1];
        for (var f = 0; f <= 4; f++) {
          var destinazione = sinistra.x + (destra.x - sinistra.x) * (f / 4);
          ctx.moveTo(cima.x, cima.y);
          ctx.lineTo(destinazione, orizzonte);
        }
        ctx.moveTo(sinistra.x, sinistra.y);
        ctx.lineTo((cima.x + destra.x) / 2, orizzonte);
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
      velo.addColorStop(0, tema.cielo);
      velo.addColorStop(1, C.fondo);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = velo;
      ctx.fillRect(0, orizzonte, W, H - orizzonte);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = tema.griglia;
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
      ctx.strokeStyle = tema.orizzonte;
      ctx.lineWidth = 2;
      ctx.shadowColor = tema.orizzonte;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }

    function disegnaSuolo() {
      var segmenti = M ? M.suoli : [{ x0: -1000, x1: 1000 }];
      var buche = M ? M.buche : [];
      var altezza = H - suolo;
      ctx.save();
      for (var b = 0; b < buche.length; b++) {
        var bx0 = Math.max(-4, sx(buche[b].x0));
        var bx1 = Math.min(W + 4, sx(buche[b].x1));
        if (bx1 <= bx0) { continue; }
        var abisso = ctx.createLinearGradient(0, suolo, 0, H);
        abisso.addColorStop(0, C.fondo);
        abisso.addColorStop(1, tema.griglia);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = abisso;
        ctx.fillRect(bx0, suolo, bx1 - bx0, altezza + 2);
      }
      ctx.globalAlpha = 1;
      var passoTacche = K.TESSERA * U * 4;
      for (var i = 0; i < segmenti.length; i++) {
        var x0 = M ? sx(segmenti[i].x0) : 0;
        var x1 = M ? sx(segmenti[i].x1) : W;
        if (x1 < -4 || x0 > W + 4) { continue; }
        x0 = Math.max(-4, x0);
        x1 = Math.min(W + 4, x1);
        ctx.globalAlpha = 0.97;
        ctx.fillStyle = C.fondo;
        ctx.fillRect(x0, suolo, x1 - x0, altezza + 2);
        var luce = ctx.createLinearGradient(0, suolo, 0, H);
        luce.addColorStop(0, tema.orizzonte);
        luce.addColorStop(1, C.fondo);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = luce;
        ctx.fillRect(x0, suolo, x1 - x0, altezza + 2);
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = tema.griglia;
        ctx.lineWidth = 1;
        ctx.beginPath();
        var origine = centroPollo() - deriva;
        for (var tx = origine + Math.ceil((x0 - origine) / passoTacche) * passoTacche; tx < x1; tx += passoTacche) {
          ctx.moveTo(tx, suolo + 2);
          ctx.lineTo(tx, H);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x0, suolo);
        ctx.lineTo(x1, suolo);
        ctx.strokeStyle = tema.orizzonte;
        ctx.lineWidth = 2;
        ctx.shadowColor = tema.orizzonte;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (M) {
          ctx.strokeStyle = tema.griglia;
          ctx.lineWidth = 3;
          ctx.shadowColor = tema.griglia;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          if (i > 0 && sx(segmenti[i].x0) >= -4 && sx(segmenti[i].x0) <= W + 4) {
            ctx.moveTo(sx(segmenti[i].x0), suolo);
            ctx.lineTo(sx(segmenti[i].x0), H);
          }
          if (i < segmenti.length - 1 && sx(segmenti[i].x1) >= -4 && sx(segmenti[i].x1) <= W + 4) {
            ctx.moveTo(sx(segmenti[i].x1), suolo);
            ctx.lineTo(sx(segmenti[i].x1), H);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
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
      var lato = K.TESSERA * U;
      var colonne = Math.max(1, Math.round(largo / lato));
      var righe = Math.max(1, Math.round(alto / lato));
      var cw = largo / colonne;
      var rh = alto / righe;
      var dentro = Math.min(cw, rh) * 0.22;
      for (var r = 0; r < righe; r++) {
        for (var c = 0; c < colonne; c++) {
          ctx.strokeRect(x + c * cw + dentro, cimaY + r * rh + dentro, cw - dentro * 2, rh - dentro * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    function rombo(cx, cy, largo, alto, colore) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - alto / 2);
      ctx.lineTo(cx + largo / 2, cy);
      ctx.lineTo(cx, cy + alto / 2);
      ctx.lineTo(cx - largo / 2, cy);
      ctx.closePath();
      ctx.fillStyle = C.fondo;
      ctx.fill();
      ctx.strokeStyle = colore;
      ctx.lineWidth = 2;
      ctx.shadowColor = colore;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      var battito = ridotto ? 0.5 : 0.5 + 0.5 * Math.sin(t * 10);
      ctx.globalAlpha = 0.35 + 0.4 * battito;
      ctx.beginPath();
      ctx.moveTo(cx, cy - alto * 0.24);
      ctx.lineTo(cx + largo * 0.24, cy);
      ctx.lineTo(cx, cy + alto * 0.24);
      ctx.lineTo(cx - largo * 0.24, cy);
      ctx.closePath();
      ctx.fillStyle = colore;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function disegnaMondo() {
      if (!M) { return; }
      var da = S.x - (centroPollo() + 60) / U;
      var a = S.x + (W - centroPollo() + 60) / U;
      ctx.save();
      for (var i = 0; i < M.el.length; i++) {
        var e = M.el[i];
        if (e.x1 < da || e.x > a) { continue; }
        var x = sx(e.x);
        if (e.k === 'p') {
          for (var n = 0; n < e.n; n++) { punta(x + n * K.PUNTA_L * U, sy(e.base), K.PUNTA_L * U, K.PUNTA_A * U, C.ciano); }
        } else if (e.k === 'b') {
          var cima = sy(e.t);
          blocco(x, cima, e.w * U, (e.pil ? H + 4 : suolo) - cima, C.allerta);
        } else if (e.k === 'r') {
          var cy = sy(e.base) - K.ROMBO_A * U / 2;
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(x + K.ROMBO_L * U / 2, suolo, K.ROMBO_L * U * 0.3, U * 0.04, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          rombo(x + K.ROMBO_L * U / 2, cy, K.ROMBO_L * U, K.ROMBO_A * U, C.magenta);
        }
      }
      ctx.restore();
    }

    function disegnaTraguardo() {
      if (!M) { return; }
      var x = sx(M.lunghezza);
      var larg = U * 1.7;
      if (x < -larg || x > W + larg) { return; }
      var alto = Math.min(U * 2.4, suolo - 8);
      ctx.save();
      ctx.globalAlpha = 0.2;
      var tenda = ctx.createLinearGradient(0, suolo - alto, 0, suolo);
      tenda.addColorStop(0, C.allerta);
      tenda.addColorStop(1, C.fondo);
      ctx.fillStyle = tenda;
      ctx.fillRect(x - larg / 2, suolo - alto, larg, alto);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.allerta;
      ctx.lineWidth = 3;
      ctx.shadowColor = C.allerta;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(x - larg / 2, suolo);
      ctx.lineTo(x - larg / 2, suolo - alto);
      ctx.lineTo(x + larg / 2, suolo - alto);
      ctx.lineTo(x + larg / 2, suolo);
      ctx.stroke();
      ctx.shadowBlur = 0;
      var quadro = larg / 8;
      for (var c = 0; c < 8; c++) {
        for (var r = 0; r < 2; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? C.allerta : C.fondo;
          ctx.fillRect(x - larg / 2 + c * quadro, suolo - alto - quadro * (r + 1) + 1, quadro, quadro);
        }
      }
      ctx.strokeStyle = C.allerta;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - larg / 2, suolo - alto - quadro * 2 + 1, larg, quadro * 2);
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
      var cx = centroPollo();
      var alt = S ? S.alt : 0;
      var piedi = suolo - alt * U;
      var sobbalzo = 0;
      var rotazione = 0;
      var aTerra = !S || S.aTerra;
      if (stato === 'corsa' && aTerra) {
        sobbalzo = -Math.abs(Math.sin(t * 16)) * U * 0.07;
        rotazione = Math.sin(t * 16) * 0.07;
      } else if (stato === 'corsa') {
        rotazione = S.salto ? giro : Math.min(0.5, -S.va * 0.03);
      } else if (stato === 'fine') {
        rotazione = -0.35;
      } else if (stato === 'vinto') {
        rotazione = aTerra ? 0 : Math.sin(t * 8) * 0.1;
        if (aTerra && !ridotto) { sobbalzo = -Math.abs(Math.sin(t * 5)) * U * 0.05; }
      } else if (!ridotto) {
        sobbalzo = -Math.abs(Math.sin(t * 3)) * U * 0.03;
      }
      ctx.save();
      var altezzaSalto = Math.min(1, Math.max(0, alt) / 1.5);
      var sopraBuca = M && stato !== 'fine' && S.alt < -0.05;
      if (!sopraBuca) {
        ctx.globalAlpha = 0.45 * (1 - altezzaSalto * 0.6);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(cx, suolo, w * 0.42 * (1 - altezzaSalto * 0.4), U * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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

    function scritta(testo, x, yy, dimensione, peso, famiglia, colore, allinea) {
      ctx.font = peso + ' ' + Math.round(dimensione) + 'px ' + famiglia;
      ctx.textAlign = allinea;
      ctx.fillStyle = colore;
      ctx.fillText(testo, x, yy);
    }

    function hud() {
      var fs = Math.max(12, U * 0.28);
      ctx.save();
      ctx.textBaseline = 'top';
      if (stato === 'fermo') {
        if (raggiunto > 1) {
          scritta('MIGLIORE LIVELLO ' + raggiunto, W - 16, 10, fs, '600', MONO, C.violaChiaro, 'right');
        }
        ctx.restore();
        return;
      }
      ctx.shadowColor = C.ciano;
      ctx.shadowBlur = 8;
      scritta('LIVELLO ' + livello, 16, 10, fs, '600', MONO, C.ciano, 'left');
      ctx.shadowBlur = 0;
      var avanzamento = M ? Math.max(0, Math.min(1, S.x / M.lunghezza)) : 0;
      var largo = Math.min(W * 0.32, 240);
      var alto = Math.max(5, U * 0.07);
      var by = 10 + fs * 1.45;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = C.violaChiaro;
      ctx.fillRect(16, by, largo, alto);
      ctx.globalAlpha = 1;
      var riempi = ctx.createLinearGradient(16, 0, 16 + largo, 0);
      riempi.addColorStop(0, C.ciano);
      riempi.addColorStop(1, C.magenta);
      ctx.fillStyle = riempi;
      ctx.fillRect(16, by, largo * avanzamento, alto);
      scritta(Math.floor(avanzamento * 100) + '%', 16 + largo + 8, by - fs * 0.15, fs * 0.85, '600', MONO, C.violaChiaro, 'left');
      scritta('TENTATIVO ' + tentativo, W - 16, 10, fs * 0.85, '600', MONO, C.violaChiaro, 'right');
      if (raggiunto > livello) { scritta('MIGLIORE LIVELLO ' + raggiunto, W - 16, 10 + fs * 1.2, fs * 0.85, '500', MONO, C.violaChiaro, 'right'); }
      ctx.restore();
    }

    function impagina(testo, riservato) {
      var massimo = Math.max(18, U * 0.45);
      var largo = Math.max(60, W - 32);
      var righe = testo ? [testo] : [];
      ctx.font = '700 ' + Math.round(massimo) + 'px ' + TITOLO;
      if (testo && ctx.measureText(testo).width > largo) {
        var meta = testo.length / 2;
        var taglio = -1;
        for (var i = 1; i < testo.length - 1; i++) {
          if (testo.charAt(i) === ' ' && (taglio < 0 || Math.abs(i - meta) < Math.abs(taglio - meta))) { taglio = i; }
        }
        if (taglio > 0) { righe = [testo.slice(0, taglio), testo.slice(taglio + 1)]; }
      }
      var piuLarga = 1;
      for (var r = 0; r < righe.length; r++) { piuLarga = Math.max(piuLarga, ctx.measureText(righe[r]).width); }
      var dimensione = massimo * Math.min(1, largo / piuLarga);
      var spazio = orizzonte - 14 - riservato;
      if (righe.length) { dimensione = Math.min(dimensione, spazio / (righe.length * 1.1)); }
      return { righe: righe, dimensione: Math.max(11, dimensione) };
    }

    function glitch(testo, x, y, dim, scarto) {
      scritta(testo, x - scarto, y, dim, '700', TITOLO, C.magenta, 'center');
      scritta(testo, x + scarto, y, dim, '700', TITOLO, C.ciano, 'center');
      scritta(testo, x, y, dim, '700', TITOLO, C.testo, 'center');
    }

    function disegnaVittoria(fs) {
      var eta = t - tArrivo - ATTESA_ARRIVO * 0.3;
      if (eta <= 0) { return; }
      var fsTitolo = fs * 1.1;
      var riservato = fsTitolo * 1.6 + fs * 2.4;
      if (!frasePagina || frasePagina.W !== W || frasePagina.U !== U) {
        frasePagina = impagina(frase, riservato);
        frasePagina.W = W;
        frasePagina.U = U;
      }
      var righe = frasePagina.righe;
      var dim = frasePagina.dimensione;
      var alto = fsTitolo * 1.6 + righe.length * dim * 1.1 + fs * 2;
      var cima = Math.max(8, (orizzonte - alto) / 2);
      var zoom = ridotto ? 1 : 1 + 0.25 * Math.max(0, 1 - eta / 0.25);
      ctx.save();
      ctx.globalAlpha = Math.min(1, eta / 0.2);
      ctx.fillStyle = C.fondo;
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(0, cima - 8, W, alto + 16);
      ctx.globalAlpha = Math.min(1, eta / 0.2);
      ctx.translate(W / 2, cima + alto / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(0, -alto / 2);
      ctx.textBaseline = 'top';
      ctx.shadowColor = C.allerta;
      ctx.shadowBlur = 10;
      scritta('LIVELLO ' + livello + ' COMPLETATO', 0, 0, fsTitolo, '700', MONO, C.allerta, 'center');
      ctx.shadowBlur = 0;
      var scarto = ridotto ? 2 : 2 + (Math.random() < 0.12 ? U * 0.05 : 0);
      for (var r = 0; r < righe.length; r++) { glitch(righe[r], 0, fsTitolo * 1.6 + r * dim * 1.1, dim, scarto); }
      if (t - tArrivo > ATTESA_ARRIVO) {
        ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        scritta('SPAZIO per il livello ' + (livello + 1), 0, fsTitolo * 1.6 + righe.length * dim * 1.1 + fs * 0.6, fs, '500', MONO, C.testo, 'center');
      }
      ctx.restore();
    }

    function disegnaIntro(fs) {
      var eta = t - tStato;
      var durata = 2.4;
      if (eta > durata) { return; }
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = Math.max(0, Math.min(1, eta / 0.2, (durata - eta) / 0.6));
      ctx.shadowColor = C.allerta;
      ctx.shadowBlur = 12;
      var y = Math.max(fs * 2.4, orizzonte * 0.42);
      scritta('LIVELLO ' + livello, W / 2, y, fs * 2, '700', MONO, C.allerta, 'center');
      ctx.shadowBlur = 0;
      if (tentativo > 1) { scritta('TENTATIVO ' + tentativo, W / 2, y + fs * 1.5, fs, '500', MONO, C.violaChiaro, 'center'); }
      ctx.restore();
    }

    var frasePagina = null;

    function messaggi() {
      var fs = Math.max(11, U * 0.26);
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      if (stato === 'fermo') {
        var x = polloX + larghezzaPollo() + U * 0.35;
        ctx.shadowColor = C.magenta;
        ctx.shadowBlur = 10;
        scritta('POLLO RUN', x, suolo - U * 0.95, fs * 1.15, '700', MONO, C.magenta, 'left');
        ctx.shadowBlur = 0;
        ctx.globalAlpha = ridotto ? 1 : 0.55 + 0.45 * Math.sin(t * 4);
        scritta((tocco ? 'Dal computer: ' : '') + 'SPAZIO per correre', x, suolo - U * 0.55, fs, '500', MONO, C.testo, 'left');
        ctx.globalAlpha = 1;
        if (raggiunto > 1) { scritta('INVIO per riprendere dal livello ' + raggiunto, x, suolo - U * 0.2, fs * 0.9, '500', MONO, C.violaChiaro, 'left'); }
      }
      if (stato === 'corsa') {
        if (livello === 1 && tentativo === 1 && t - tStato > 2.4 && t - tStato < 7) {
          ctx.globalAlpha = Math.min(1, (7 - (t - tStato)) / 1);
          scritta('SPAZIO / ↑ per saltare', W / 2, orizzonte * 0.5, fs, '500', MONO, C.testo, 'center');
          ctx.globalAlpha = 1;
        }
        disegnaIntro(fs);
      }
      if (stato === 'vinto') { disegnaVittoria(fs); }
      if (stato === 'fine') {
        var gx = W / 2;
        var gy = orizzonte * 0.62;
        var grande = Math.max(24, U * 0.7);
        scritta('GAME OVER', gx - 2, gy, grande, '700', TITOLO, C.magenta, 'center');
        scritta('GAME OVER', gx + 2, gy, grande, '700', TITOLO, C.ciano, 'center');
        scritta('GAME OVER', gx, gy, grande, '700', TITOLO, C.testo, 'center');
        ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        scritta('SPAZIO per riprovare il livello ' + livello + ' · ESC per uscire', gx, gy + fs * 1.6, fs, '500', MONO, C.testo, 'center');
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
      disegnaMonti(montiLontani, Math.max(W * 1.1, 600), orizzonte * 0.62, deriva * 0.06, tema.lontani, tema.reteLontani);
      disegnaMonti(montiVicini, Math.max(W * 0.8, 480), orizzonte * 0.4, deriva * 0.16, tema.vicini, tema.reteVicini);
      terreno();
      disegnaSuolo();
      disegnaMondo();
      disegnaTraguardo();
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

    function scintilla(x, yy, vx, vyy, colore, durata, lato) {
      scintille.push({ x: x, y: yy, vx: vx, vy: vyy, colore: colore, vita: durata, durata: durata, lato: lato });
    }

    function schianto() {
      stato = 'fine';
      tStato = t;
      lampo = 1;
      scossa = ridotto ? 0 : 0.35;
      var cx = centroPollo();
      var cy = sy(Math.max(S.alt, -0.4)) - U / 2;
      for (var i = 0; i < 26; i++) {
        var angolo = Math.random() * Math.PI * 2;
        var forza = U * (2 + Math.random() * 5);
        scintilla(cx, cy, Math.cos(angolo) * forza, Math.sin(angolo) * forza - U * 2, i % 3 === 0 ? C.allerta : (i % 2 ? C.ciano : C.magenta), 0.5 + Math.random() * 0.5, U * (0.06 + Math.random() * 0.08));
      }
    }

    function pesca() {
      if (!frasi.length) { return ''; }
      if (!mazzo.length) {
        mazzo = frasi.slice();
        for (var i = mazzo.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tieni = mazzo[i];
          mazzo[i] = mazzo[j];
          mazzo[j] = tieni;
        }
        if (mazzo.length > 1 && mazzo[mazzo.length - 1] === ultimaFrase) { mazzo.unshift(mazzo.pop()); }
      }
      ultimaFrase = mazzo.pop();
      return ultimaFrase;
    }

    function ricorda() {
      try { localStorage.setItem(CHIAVE_LIVELLO, String(raggiunto)); } catch (e) { }
    }

    function precalcola(n) {
      timerPrecalcolo = 0;
      if (!prossimoM || prossimoM.n !== n) { prossimoM = Livelli.crea(n); }
    }

    function arriva() {
      stato = 'vinto';
      tStato = t;
      tArrivo = t;
      frase = pesca();
      frasePagina = null;
      lampo = 0.6;
      raggiunto = Math.max(raggiunto, livello + 1);
      ricorda();
      S.richiesta = true;
      var cx = sx(M.lunghezza);
      var colori = [C.allerta, C.ciano, C.magenta, C.violaChiaro];
      for (var i = 0; i < 70; i++) {
        var angolo = -Math.PI * (0.1 + 0.8 * Math.random());
        var forza = U * (3 + Math.random() * 7);
        scintilla(cx, suolo - U * 1.2, Math.cos(angolo) * forza, Math.sin(angolo) * forza, colori[i % colori.length], 0.9 + Math.random() * 0.9, U * (0.05 + Math.random() * 0.08));
      }
      if (!timerPrecalcolo) { timerPrecalcolo = setTimeout(function () { precalcola(livello + 1); }, 60); }
    }

    function avviaLivello(n) {
      if (n === livello && M && M.n === n && stato !== 'fermo') { tentativo++; } else { tentativo = 1; }
      livello = n;
      if (!M || M.n !== n) { M = prossimoM && prossimoM.n === n ? prossimoM : Livelli.crea(n); }
      if (prossimoM && prossimoM.n === n) { prossimoM = null; }
      S = Livelli.nuovoStato(M.v);
      tema = creaTema(M.tema);
      resto = 0;
      giro = 0;
      scintille = [];
      frasePagina = null;
      stato = 'corsa';
      tStato = t;
      if (n > raggiunto) { raggiunto = n; ricorda(); }
      chiedi();
    }

    function inizia(n) {
      var prima = stato;
      tentativo = 0;
      livello = 0;
      M = null;
      avviaLivello(Math.max(1, n));
      if (prima === 'fermo' && opzioni.suPartita) { opzioni.suPartita(true); }
    }

    function torna() {
      var eraInGioco = stato !== 'fermo';
      stato = 'fermo';
      M = null;
      S = null;
      tema = creaTema(0);
      scintille = [];
      if (eraInGioco && opzioni.suPartita) { opzioni.suPartita(false); }
      chiedi();
    }

    function salta() {
      if (stato === 'fermo') { inizia(1); return; }
      if (stato === 'fine') {
        if (t - tStato > ATTESA_RIPROVA) { avviaLivello(livello); }
        return;
      }
      if (stato === 'vinto') {
        if (t - tArrivo > ATTESA_ARRIVO) { avviaLivello(livello + 1); }
        return;
      }
      if (S) { S.richiesta = true; }
    }

    function aggiornaFisica(dt) {
      resto += dt;
      while (resto >= K.PASSO && (stato === 'corsa' || stato === 'vinto')) {
        resto -= K.PASSO;
        if (stato === 'vinto') {
          var quota = Math.max(0, 1 - (t - tArrivo) / DURATA_FRENATA);
          S.fr = quota * quota;
        }
        Livelli.vicino(M, S.x, 0, attorno);
        Livelli.passo(S, attorno);
        if (S.morto) { schianto(); return; }
        if (stato === 'corsa' && S.x >= M.lunghezza) { arriva(); }
      }
    }

    function aggiorna(dt) {
      t += dt;
      lampo = Math.max(0, lampo - dt * 3);
      scossa = Math.max(0, scossa - dt);
      if (stato === 'fermo' && !ridotto) { deriva += U * 0.6 * dt; }
      if (stato === 'corsa' || stato === 'vinto') {
        aggiornaFisica(dt);
        if (S) {
          deriva = S.x * U;
          if (S.aTerra) { giro = 0; } else if (S.salto) { giro += dt * Math.PI * 2 / K.ARIA; }
          if (stato === 'corsa' && S.aTerra) {
            scia -= dt;
            if (scia <= 0) {
              scia = 0.04;
              scintilla(polloX + larghezzaPollo() * 0.25, suolo - 3, -U * 4 - Math.random() * U, -Math.random() * U * 1.5, Math.random() < 0.5 ? C.ciano : C.magenta, 0.4, U * 0.07);
            }
          }
        }
      }
      if (stato === 'fine' && t - tStato > RITORNO_FINE) { torna(); }
      for (var k = scintille.length - 1; k >= 0; k--) {
        var s = scintille[k];
        s.vita -= dt;
        if (s.vita <= 0) { scintille.splice(k, 1); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += K.G * U * 0.3 * dt;
      }
    }

    function serveMoto() {
      return !ridotto || stato !== 'fermo' || lampo > 0 || scintille.length > 0;
    }

    function ciclo(ora) {
      acceso = false;
      var dt = ultimo ? Math.min(0.05, (ora - ultimo) / 1000) : 0;
      ultimo = ora;
      aggiorna(dt);
      disegna();
      if (attivo && serveMoto()) { chiedi(); } else { ultimo = 0; }
    }

    function chiedi() {
      if (!attivo || acceso || document.hidden) { return; }
      acceso = true;
      idFrame = requestAnimationFrame(ciclo);
    }

    function suTasto(evento) {
      if (evento.key === 'Escape') {
        if (stato !== 'fermo') { torna(); return; }
        if (sipario && opzioni.suChiudi) { opzioni.suChiudi(); }
        return;
      }
      var spazio = evento.code === 'Space' || evento.key === ' ';
      var invio = evento.key === 'Enter' && stato === 'fermo';
      var tasto = spazio || invio || (evento.key === 'ArrowUp' && stato === 'corsa');
      if (!tasto || evento.altKey || evento.ctrlKey || evento.metaKey) { return; }
      var bersaglio = evento.target;
      if (stato === 'fermo' && bersaglio && bersaglio.closest && bersaglio.closest('a, button, input, textarea, select')) { return; }
      evento.preventDefault();
      if (evento.repeat && stato !== 'corsa') { return; }
      if (invio) { inizia(raggiunto); return; }
      salta();
    }

    function suClic(evento) {
      if (evento.button || stato !== 'corsa') { return; }
      var bersaglio = evento.target;
      if (bersaglio && bersaglio.closest && bersaglio.closest('#mnt-audio-box, a, button, input')) { return; }
      salta();
    }

    function suVisibilita() {
      ultimo = 0;
      if (!document.hidden) { chiedi(); }
    }

    function suRidimensiona() {
      misura();
      if (stato !== 'fermo') { torna(); }
      disegna();
    }

    function avvia() {
      if (attivo) { return; }
      attivo = true;
      document.addEventListener('keydown', suTasto);
      document.addEventListener('pointerdown', suClic);
      document.addEventListener('visibilitychange', suVisibilita);
      window.addEventListener('resize', suRidimensiona);
      if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { if (attivo) { disegna(); } }); }
      misura();
      disegna();
      chiedi();
    }

    function ferma() {
      if (!attivo) { return; }
      if (stato !== 'fermo') { torna(); }
      attivo = false;
      cancelAnimationFrame(idFrame);
      acceso = false;
      ultimo = 0;
      if (timerPrecalcolo) { clearTimeout(timerPrecalcolo); timerPrecalcolo = 0; }
      document.removeEventListener('keydown', suTasto);
      document.removeEventListener('pointerdown', suClic);
      document.removeEventListener('visibilitychange', suVisibilita);
      window.removeEventListener('resize', suRidimensiona);
    }

    return { avvia: avvia, ferma: ferma, distruggi: ferma };
  }

  window.PolloRun.crea = crea;
}());
