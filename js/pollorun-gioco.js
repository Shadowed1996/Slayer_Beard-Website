(function () {
  'use strict';

  var G = 33.3;
  var V0 = 10;
  var ARIA = 2 * V0 / G;
  var PASSO = 1 / 120;
  var MEZZO = 0.2;
  var CORPO_BASSO = 0.06;
  var CORPO_ALTO = 0.66;
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

  function curva(nl) {
    var k = Math.max(0, nl - 1);
    return {
      tau: Math.max(0.12, 0.5 - 0.025 * k),
      quieteMin: Math.max(0.1, 0.6 - 0.035 * k),
      quieteMax: Math.max(0.42, 1.5 - 0.08 * k)
    };
  }

  var PROFILI = {
    facile: { v: 0.82, quiete: 1.6, margine: 1, scala: 0.7, spinta: 0 },
    medio: { v: 1, quiete: 1, margine: 1, scala: 1, spinta: 0 },
    difficile: { v: 1.15, quiete: 0.7, margine: 0.9, scala: 1, spinta: 1.5 },
    estremo: { v: 1.3, quiete: 0.45, margine: 0.8, scala: 1, spinta: 6 }
  };
  var DIFFICOLTA = ['facile', 'medio', 'difficile', 'estremo'];

  function profiloDi(difficolta) {
    return PROFILI.hasOwnProperty(difficolta) ? PROFILI[difficolta] : PROFILI.medio;
  }

  function nomeDifficolta(difficolta) {
    return PROFILI.hasOwnProperty(difficolta) ? difficolta : 'medio';
  }

  function sbloccoDi(profilo, nl) {
    return nl + (nl - 1) * (profilo.scala - 1) + profilo.spinta;
  }

  function curvaDi(profilo, nl) {
    var c = curva(nl);
    return { tau: c.tau * profilo.margine, quieteMin: c.quieteMin * profilo.quiete, quieteMax: c.quieteMax * profilo.quiete };
  }

  function parametri(n, difficolta) {
    var profilo = profiloDi(difficolta);
    var k = Math.max(0, n - 1);
    var v = (k < 12.8 ? 8.6 + 0.5 * k : Math.min(17, 15 + 0.12 * (k - 12.8))) * profilo.v;
    var inizio = curvaDi(profilo, n);
    var fine = curvaDi(profilo, n + 1);
    var durata = Math.min(150, 60 + 4 * k);
    return {
      n: n,
      difficolta: nomeDifficolta(difficolta),
      v: v,
      J: ARIA * v,
      tau: inizio.tau,
      tauFine: fine.tau,
      mx: v * fine.tau * 0.3,
      durata: durata,
      lunghezza: Math.round(v * durata),
      quieteMin: inizio.quieteMin,
      quieteMax: inizio.quieteMax,
      tema: k % TEMI
    };
  }

  function velocitaDi(s) {
    return s.v * s.fr * (s.t < RAMPA_T ? RAMPA_0 + (1 - RAMPA_0) * s.t / RAMPA_T : 1);
  }

  function nuovoStato(v) {
    return { x: 0, alt: 0, va: 0, aTerra: true, salto: false, salti: 0, buf: 0, richiesta: false, morto: 0, t: 0, v: v, fr: 1 };
  }

  function statoIniziale(v) {
    var s = nuovoStato(v);
    s.x = 0.75 * v;
    s.t = RAMPA_T;
    return s;
  }

  function copia(s) {
    return { x: s.x, alt: s.alt, va: s.va, aTerra: s.aTerra, salto: s.salto, salti: s.salti, buf: s.buf, richiesta: s.richiesta, morto: s.morto, t: s.t, v: s.v, fr: s.fr };
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
        s.salti++;
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
            s.salti++;
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
      n: P.n, difficolta: P.difficolta, v: P.v, J: P.J, tau: P.tau, mx: P.mx, lunghezza: P.lunghezza, durata: P.durata, tema: P.tema,
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
    { nome: 'punte', semplice: true, da: 1.2, peso: 4, crea: figPunte },
    { nome: 'blocco', semplice: true, da: 1.45, peso: 3, crea: figBlocco },
    { nome: 'piattaforma', semplice: true, da: 1.75, peso: 3, crea: figPiattaforma },
    { nome: 'piattaformaPunte', da: 2.3, peso: 3, crea: figPiattaformaPunte },
    { nome: 'catena', da: 3, peso: 3, crea: figCatena },
    { nome: 'buca', da: 3.8, peso: 3, crea: figBuca },
    { nome: 'scala', da: 4.8, peso: 2, crea: figScala },
    { nome: 'bucaPunta', da: 5.6, peso: 2, crea: figBucaPunta },
    { nome: 'romboPunta', da: 6.2, peso: 2, crea: figRomboPunta },
    { nome: 'vallata', da: 7, peso: 2, crea: figVallata },
    { nome: 'isole', da: 8, peso: 2, crea: figIsole },
    { nome: 'piattaformaRombo', da: 9, peso: 2, crea: figPiattaformaRombo },
    { nome: 'catenaMista', da: 10.2, peso: 2, crea: figCatenaMista },
    { nome: 'scalaPunte', da: 12, peso: 2, crea: figScalaPunte }
  ];

  function scegli(nl, avanzamento, r, moltiplicatori, ultima) {
    var pesi = [];
    var totale = 0;
    for (var i = 0; i < FIGURE.length; i++) {
      var f = FIGURE[i];
      var peso = 0;
      if (nl >= f.da) {
        var salita = nl - f.da;
        var equilibrio = f.semplice ? Math.max(0.15, 1 - 0.07 * salita) : 1 + Math.min(1.2, 0.1 * salita);
        peso = f.peso * moltiplicatori[i] * equilibrio * (f.semplice ? 1.35 - 0.7 * avanzamento : 0.65 + 0.7 * avanzamento) * (Math.floor(nl) === Math.floor(f.da) ? 3 : 1) * (f.nome === ultima ? 0.35 : 1);
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

  function creaLivello(n, difficolta) {
    var profilo = profiloDi(difficolta);
    var P = parametri(n, difficolta);
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
      var nl = n + avanzamento;
      var nf = sbloccoDi(profilo, nl);
      var locale = curvaDi(profilo, nl);
      var mxLocale = P.v * locale.tau * 0.3;
      var accettata = false;
      for (var scelta = 0; scelta < 6 && !accettata; scelta++) {
        var ripeti = scelta === 0 && ultima && r() < 0.22;
        var f = ripeti ? ultima : scegli(nf, avanzamento, r, moltiplicatori, ultima && ultima.nome);
        var seme = ripeti ? ultimaSeme : 1 + Math.floor(rSeme() * 2000000000);
        var quiete = (locale.quieteMin + Math.pow(r(), 1 + nl / 8) * (locale.quieteMax - locale.quieteMin)) * (1.35 - 0.75 * avanzamento);
        for (var t = 0; t < TENTATIVI && !accettata; t++) {
          var s = 1 + 0.25 * t;
          var c = { x: Math.max(fine + (0.36 + P.v * quiete) * s, fronte[0].x + 2 * mxLocale + MEZZO + 0.3, P.v * 1.7), v: P.v, J: P.J, tau: locale.tau, n: nf, s: s, r: casuale(seme) };
          var els = f.crea(c);
          if (!els) { continue; }
          var fineFigura = fineDi(els);
          if (fineFigura > limite) { break; }
          var salvato = proponi(M, els);
          var dopo = avanza(M, fronte, fineFigura + mxLocale + 2 * MEZZO + 0.3, mxLocale);
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
    difficolta: DIFFICOLTA.slice(),
    profili: PROFILI,
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
  var CHIAVE_DIFFICOLTA = 'sb-pollo-difficolta';
  var DIFFICOLTA = Livelli.difficolta || ['facile', 'medio', 'difficile', 'estremo'];
  var ROSSO = '#ff3b4f';
  var PROPORZIONE = 386 / 556;
  var LATO_CUBO = 0.66;
  var DURATA_FRENATA = 1.5;
  var ATTESA_ARRIVO = 0.7;
  var ATTESA_RIPROVA = 0.4;
  var RITORNO_FINE = 12;
  var NERO = '#04061a';
  var BIANCO = '#ffffff';
  var GIALLO = '#ffe14a';
  var PERMUTAZIONI = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
  var TAVOLOZZE = [
    { cielo: ['#3a7bff', '#0e3aa8'], terra: '#0a2a80', accento: '#35e6ff', cubo: ['#ffe45c', '#ffa11f'] },
    { cielo: ['#a04dff', '#4b1a94'], terra: '#331070', accento: '#ff7af0', cubo: ['#b8ff5c', '#2fd14f'] },
    { cielo: ['#2ed573', '#0b6b3a'], terra: '#075028', accento: '#e8ff4d', cubo: ['#ff7ac8', '#e0308f'] },
    { cielo: ['#ff5aa5', '#9c1460'], terra: '#680e40', accento: '#ffe14a', cubo: ['#5cf2ff', '#1f9fe0'] },
    { cielo: ['#ff9f30', '#a84a08'], terra: '#733205', accento: '#fff36a', cubo: ['#5c7cff', '#2a3fd0'] },
    { cielo: ['#1fd6cc', '#0a6480'], terra: '#08485a', accento: '#ff6b9a', cubo: ['#ffe45c', '#ffa11f'] },
    { cielo: ['#ff5252', '#8f1010'], terra: '#5e0808', accento: '#ffc04a', cubo: ['#5cf2ff', '#1f9fe0'] },
    { cielo: ['#6668ff', '#1c1c78'], terra: '#121256', accento: '#78ffb4', cubo: ['#ffe45c', '#ffa11f'] }
  ];

  function rgbDi(esadecimale) {
    var n = parseInt(esadecimale.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mescola(a, b, quota) {
    var da = rgbDi(a);
    var verso = rgbDi(b);
    var r = Math.round(da[0] + (verso[0] - da[0]) * quota);
    var g = Math.round(da[1] + (verso[1] - da[1]) * quota);
    var bl = Math.round(da[2] + (verso[2] - da[2]) * quota);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function coloriDi(livello, avanzamento) {
    var a = TAVOLOZZE[(Math.max(1, livello) - 1) % TAVOLOZZE.length];
    var b = TAVOLOZZE[Math.max(1, livello) % TAVOLOZZE.length];
    return {
      cieloAlto: mescola(a.cielo[0], b.cielo[0], avanzamento),
      cieloBasso: mescola(a.cielo[1], b.cielo[1], avanzamento),
      terra: mescola(a.terra, b.terra, avanzamento),
      accento: mescola(a.accento, b.accento, avanzamento),
      cubo0: mescola(a.cubo[0], b.cubo[0], avanzamento),
      cubo1: mescola(a.cubo[1], b.cubo[1], avanzamento)
    };
  }

  function disordine(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function tempoTesto(secondi) {
    var s = Math.max(0, Math.round(secondi));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function casuale(seme) {
    return function () {
      seme = (seme * 16807) % 2147483647;
      return (seme - 1) / 2147483646;
    };
  }

  function crea(opzioni) {
    var tela = opzioni.tela;
    var ctx = tela && tela.getContext ? tela.getContext('2d') : null;
    if (!ctx) { return { avvia: function () { }, ferma: function () { }, distruggi: function () { } }; }
    var sipario = !!opzioni.sipario;
    var gd = opzioni.stile === 'geometrydash';
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

    var canzoni = [];
    var elencoCanzoni = Array.isArray(opzioni.canzoni) ? opzioni.canzoni : [];
    for (var c = 0; c < elencoCanzoni.length; c++) {
      var voce = elencoCanzoni[c];
      if (voce && typeof voce.file === 'string' && voce.file) {
        canzoni.push({ titolo: String(voce.titolo || ''), autore: String(voce.autore || ''), file: voce.file });
      }
    }
    var modoCanzoni = opzioni.modo === 'fissa' || opzioni.modo === 'caso' ? opzioni.modo : 'ordine';
    var canzoneFissa = Math.max(0, parseInt(opzioni.fissa, 10) || 0);
    var primaCanzone = parseInt(opzioni.primaCanzone, 10);
    var canzone = null;
    var canzoneDelLivello = 0;

    var difficolta = 'medio';
    try {
      var difficoltaLetta = localStorage.getItem(CHIAVE_DIFFICOLTA);
      if (DIFFICOLTA.indexOf(difficoltaLetta) !== -1) { difficolta = difficoltaLetta; }
    } catch (e) { difficolta = 'medio'; }
    var zone = [];

    function chiaveLivello() {
      return difficolta === 'medio' ? CHIAVE_LIVELLO : CHIAVE_LIVELLO + '-' + difficolta;
    }

    function leggiRaggiunto() {
      try { return Math.max(1, parseInt(localStorage.getItem(chiaveLivello()), 10) || 1); } catch (e) { return 1; }
    }

    var raggiunto = leggiRaggiunto();

    var W = 0, H = 0, dpr = 1, U = 40, orizzonte = 0, suolo = 0, polloX = 0;
    var stato = 'fermo';
    var t = 0, tStato = 0, tArrivo = 0, tInizioTentativo = 0, deriva = 0, fondo = gd ? 0 : 1;
    var livello = 1, tentativo = 1, durataLivello = 0;
    var M = null, S = null, prossimoM = null;
    var tema = creaTema(0);
    var colori = coloriDi(1, 0);
    var attorno = Livelli.nuovoAttorno();
    var resto = 0, angolo = 0, giro = 0, scia = 0;
    var scintille = [], onde = [], lampo = 0, scossa = 0, frase = '', frasePagina = null;
    var ultimo = 0, acceso = false, attivo = false, idFrame = 0;
    var timerPrecalcolo = 0;

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
      if (gd) {
        U = Math.max(34, Math.min(96, H * 0.21));
        suolo = H * 0.8;
        orizzonte = suolo * 0.7;
        polloX = Math.max(24, Math.min(W * 0.1, 150));
      } else {
        U = Math.max(34, Math.min(96, H * 0.229));
        orizzonte = H * 0.58;
        suolo = orizzonte + (H - orizzonte) * 0.66;
        polloX = Math.max(14, Math.min(W * 0.07, 110));
      }
    }

    function latoCubo() { return U * LATO_CUBO; }
    function larghezzaGiocatore() { return gd ? latoCubo() : U * PROPORZIONE; }
    function centroPollo() { return polloX + larghezzaGiocatore() / 2; }
    function sx(x) { return centroPollo() + (x - (S ? S.x : 0)) * U; }
    function sy(alt) { return suolo - alt * U; }

    function rettangoloTondo(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

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

    function quadrati(lato, sposta, alfa, seme) {
      var righe = Math.ceil(suolo / lato) + 1;
      var primaColonna = Math.floor(sposta / lato);
      var colonne = Math.ceil(W / lato) + 2;
      ctx.fillStyle = BIANCO;
      for (var col = 0; col < colonne; col++) {
        var indice = primaColonna + col;
        for (var r = 0; r < righe; r++) {
          var v = disordine(indice, r + seme);
          if (v < 0.42) { continue; }
          ctx.globalAlpha = fondo * alfa * (0.5 + v);
          ctx.fillRect(indice * lato - sposta + lato * 0.06, suolo - (r + 1) * lato + lato * 0.06, lato * 0.88, lato * 0.88);
        }
      }
    }

    function sfondoGD() {
      if (fondo <= 0.01) { return; }
      var gradiente = ctx.createLinearGradient(0, 0, 0, H);
      gradiente.addColorStop(0, colori.cieloAlto);
      gradiente.addColorStop(1, colori.cieloBasso);
      ctx.save();
      ctx.globalAlpha = fondo;
      ctx.fillStyle = gradiente;
      ctx.fillRect(0, 0, W, H);
      quadrati(2.6 * U, deriva * 0.22, 0.07, 11);
      quadrati(4.4 * U, deriva * 0.42, 0.05, 29);
      ctx.globalAlpha = 1;
      var sfumatura = ctx.createLinearGradient(0, 0, 0, H * 0.32);
      sfumatura.addColorStop(0, 'rgba(0,0,0,1)');
      sfumatura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = sfumatura;
      ctx.fillRect(0, 0, W, H * 0.32);
      ctx.restore();
    }

    function sfondo() {
      if (gd) { sfondoGD(); return; }
      sole();
      disegnaMonti(montiLontani, Math.max(W * 1.1, 600), orizzonte * 0.62, deriva * 0.06, tema.lontani, tema.reteLontani);
      disegnaMonti(montiVicini, Math.max(W * 0.8, 480), orizzonte * 0.4, deriva * 0.16, tema.vicini, tema.reteVicini);
      terreno();
    }

    function disegnaSuolo() {
      var segmenti = M ? M.suoli : [{ x0: -1000, x1: 1000 }];
      var buche = M ? M.buche : [];
      var altezza = H - suolo;
      var origine = centroPollo() - deriva;
      var tessera = K.TESSERA * U * 2;
      var passoTacche = K.TESSERA * U * 4;
      var colLinea = gd ? BIANCO : tema.orizzonte;
      var colBagliore = gd ? colori.accento : tema.orizzonte;
      var colMuro = gd ? 'rgba(255,255,255,0.75)' : tema.griglia;
      ctx.save();
      for (var b = 0; b < buche.length; b++) {
        var bx0 = Math.max(-4, sx(buche[b].x0));
        var bx1 = Math.min(W + 4, sx(buche[b].x1));
        if (bx1 <= bx0) { continue; }
        var abisso = ctx.createLinearGradient(0, suolo, 0, H);
        if (gd) {
          abisso.addColorStop(0, 'rgba(0,0,0,0)');
          abisso.addColorStop(1, 'rgba(0,0,0,0.62)');
          ctx.globalAlpha = 1;
        } else {
          abisso.addColorStop(0, C.fondo);
          abisso.addColorStop(1, tema.griglia);
          ctx.globalAlpha = 0.95;
        }
        ctx.fillStyle = abisso;
        ctx.fillRect(bx0, suolo, bx1 - bx0, altezza + 2);
      }
      ctx.globalAlpha = 1;
      for (var i = 0; i < segmenti.length; i++) {
        var x0 = M ? sx(segmenti[i].x0) : 0;
        var x1 = M ? sx(segmenti[i].x1) : W;
        if (x1 < -4 || x0 > W + 4) { continue; }
        x0 = Math.max(-4, x0);
        x1 = Math.min(W + 4, x1);
        if (gd) {
          ctx.fillStyle = colori.terra;
          ctx.fillRect(x0, suolo, x1 - x0, altezza + 2);
          var luceGd = ctx.createLinearGradient(0, suolo, 0, H);
          luceGd.addColorStop(0, 'rgba(255,255,255,0.3)');
          luceGd.addColorStop(0.4, 'rgba(255,255,255,0)');
          luceGd.addColorStop(1, 'rgba(0,0,0,0.25)');
          ctx.fillStyle = luceGd;
          ctx.fillRect(x0, suolo, x1 - x0, altezza + 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (var tx = origine + Math.ceil((x0 - origine) / tessera) * tessera; tx < x1; tx += tessera) {
            ctx.moveTo(tx, suolo + 2);
            ctx.lineTo(tx, H);
          }
          ctx.moveTo(x0, suolo + altezza * 0.55);
          ctx.lineTo(x1, suolo + altezza * 0.55);
          ctx.stroke();
        } else {
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
          for (var ty = origine + Math.ceil((x0 - origine) / passoTacche) * passoTacche; ty < x1; ty += passoTacche) {
            ctx.moveTo(ty, suolo + 2);
            ctx.lineTo(ty, H);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = colLinea;
        ctx.lineWidth = gd ? 3 : 2;
        ctx.shadowColor = colBagliore;
        ctx.shadowBlur = gd ? 12 : 10;
        ctx.beginPath();
        ctx.moveTo(x0, suolo);
        ctx.lineTo(x1, suolo);
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (M) {
          ctx.strokeStyle = colMuro;
          ctx.lineWidth = 3;
          if (!gd) { ctx.shadowColor = tema.griglia; ctx.shadowBlur = 8; }
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

    function punta(x, base, largo, alto) {
      var bordo = gd ? BIANCO : C.ciano;
      var alone = gd ? colori.accento : C.ciano;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x + largo / 2, base - alto);
      ctx.lineTo(x + largo, base);
      ctx.closePath();
      ctx.fillStyle = gd ? NERO : C.fondo;
      ctx.fill();
      ctx.strokeStyle = bordo;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = alone;
      ctx.shadowBlur = gd ? 10 : 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = gd ? 0.55 : 0.5;
      ctx.strokeStyle = gd ? colori.accento : bordo;
      ctx.beginPath();
      ctx.moveTo(x + largo * (gd ? 0.28 : 0.3), base - (gd ? 3 : 2));
      ctx.lineTo(x + largo / 2, base - alto * (gd ? 0.56 : 0.55));
      ctx.lineTo(x + largo * (gd ? 0.72 : 0.7), base - (gd ? 3 : 2));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function blocco(x, cimaY, largo, alto) {
      var bordo = gd ? BIANCO : C.allerta;
      var alone = gd ? colori.accento : C.allerta;
      ctx.fillStyle = gd ? 'rgba(4,6,26,0.92)' : C.fondo;
      ctx.fillRect(x, cimaY, largo, alto);
      if (gd) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 2, cimaY + 2, largo - 4, Math.min(alto * 0.16, 8));
      }
      ctx.strokeStyle = bordo;
      ctx.lineWidth = 2;
      ctx.shadowColor = alone;
      ctx.shadowBlur = gd ? 10 : 12;
      ctx.strokeRect(x + 1, cimaY + 1, largo - 2, alto - 2);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = gd ? colori.accento : bordo;
      ctx.globalAlpha = gd ? 0.6 : 0.45;
      var lato = K.TESSERA * U;
      var colonne = Math.max(1, Math.round(largo / lato));
      var righe = Math.max(1, Math.round(alto / lato));
      var cw = largo / colonne;
      var rh = alto / righe;
      var dentro = Math.min(cw, rh) * (gd ? 0.2 : 0.22);
      for (var r = 0; r < righe; r++) {
        for (var col = 0; col < colonne; col++) {
          ctx.strokeRect(x + col * cw + dentro, cimaY + r * rh + dentro, cw - dentro * 2, rh - dentro * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    function sega(cx, cy, raggio) {
      var denti = 8;
      var rotazione = ridotto ? 0 : t * 7;
      ctx.beginPath();
      for (var i = 0; i < denti * 2; i++) {
        var a = rotazione + i * Math.PI / denti;
        var r = i % 2 === 0 ? raggio : raggio * 0.72;
        var px = cx + Math.cos(a) * r;
        var py = cy + Math.sin(a) * r;
        if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
      }
      ctx.closePath();
      ctx.fillStyle = NERO;
      ctx.fill();
      ctx.strokeStyle = BIANCO;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#ff3b5c';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx, cy, raggio * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3b5c';
      ctx.fill();
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
          for (var n = 0; n < e.n; n++) { punta(x + n * K.PUNTA_L * U, sy(e.base), K.PUNTA_L * U, K.PUNTA_A * U); }
        } else if (e.k === 'b') {
          var cima = sy(e.t);
          blocco(x, cima, e.w * U, (e.pil ? H + 4 : suolo) - cima);
        } else if (e.k === 'r') {
          if (gd) {
            sega(x + K.ROMBO_L * U / 2, sy(e.base) - K.ROMBO_A * U / 2, K.ROMBO_L * U * 0.52);
          } else {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(x + K.ROMBO_L * U / 2, suolo, K.ROMBO_L * U * 0.3, U * 0.04, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            rombo(x + K.ROMBO_L * U / 2, sy(e.base) - K.ROMBO_A * U / 2, K.ROMBO_L * U, K.ROMBO_A * U, C.magenta);
          }
        }
      }
      ctx.restore();
    }

    function disegnaTraguardo() {
      if (!M) { return; }
      var x = sx(M.lunghezza);
      var larg = U * 1.7;
      if (x < -larg || x > W + larg) { return; }
      var alto = Math.min(U * (gd ? 2.6 : 2.4), suolo - 8);
      var colore = gd ? BIANCO : C.allerta;
      ctx.save();
      var tenda = ctx.createLinearGradient(0, suolo - alto, 0, suolo);
      if (gd) {
        tenda.addColorStop(0, 'rgba(255,255,255,0.05)');
        tenda.addColorStop(1, 'rgba(255,255,255,0.55)');
        ctx.globalAlpha = 1;
      } else {
        tenda.addColorStop(0, C.allerta);
        tenda.addColorStop(1, C.fondo);
        ctx.globalAlpha = 0.2;
      }
      ctx.fillStyle = tenda;
      ctx.fillRect(x - larg / 2, suolo - alto, larg, alto);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colore;
      ctx.lineWidth = gd ? 4 : 3;
      ctx.shadowColor = gd ? colori.accento : C.allerta;
      ctx.shadowBlur = gd ? 16 : 14;
      ctx.beginPath();
      ctx.moveTo(x - larg / 2, suolo);
      ctx.lineTo(x - larg / 2, suolo - alto);
      if (!gd) { ctx.lineTo(x + larg / 2, suolo - alto); ctx.lineTo(x + larg / 2, suolo); }
      if (gd) { ctx.moveTo(x + larg / 2, suolo); ctx.lineTo(x + larg / 2, suolo - alto); }
      ctx.stroke();
      ctx.shadowBlur = 0;
      var quadro = larg / 8;
      for (var col = 0; col < 8; col++) {
        for (var r = 0; r < 2; r++) {
          ctx.fillStyle = (col + r) % 2 === 0 ? colore : (gd ? NERO : C.fondo);
          ctx.fillRect(x - larg / 2 + col * quadro, suolo - alto - quadro * (r + 1) + (gd ? 0 : 1), quadro, quadro);
        }
      }
      if (!gd) {
        ctx.strokeStyle = colore;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - larg / 2, suolo - alto - quadro * 2 + 1, larg, quadro * 2);
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
      for (var k = 0; k < onde.length; k++) {
        var o = onde[k];
        ctx.globalAlpha = Math.max(0, o.vita / o.durata);
        ctx.strokeStyle = BIANCO;
        ctx.lineWidth = Math.max(2, U * 0.06 * (o.vita / o.durata));
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.raggio, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function disegnaCubo() {
      if (stato === 'fine') { return; }
      var lato = latoCubo();
      var cx = centroPollo();
      var alt = S ? S.alt : 0;
      var piedi = suolo - alt * U;
      var rimbalzo = 0;
      if (stato === 'fermo' && !ridotto) { rimbalzo = -Math.abs(Math.sin(t * 3)) * U * 0.05; }
      if (stato === 'vinto' && S && S.aTerra && !ridotto) { rimbalzo = -Math.abs(Math.sin(t * 5)) * U * 0.06; }
      var altezzaSalto = Math.min(1, Math.max(0, alt) / 1.5);
      var sopraBuca = M && S && S.alt < -0.05;
      ctx.save();
      if (!sopraBuca) {
        ctx.globalAlpha = 0.4 * (1 - altezzaSalto * 0.6);
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(cx, suolo, lato * 0.55 * (1 - altezzaSalto * 0.4), U * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.translate(cx, piedi - lato / 2 + rimbalzo);
      ctx.rotate(angolo);
      var faccia = ctx.createLinearGradient(-lato / 2, -lato / 2, lato / 2, lato / 2);
      faccia.addColorStop(0, colori.cubo0);
      faccia.addColorStop(1, colori.cubo1);
      ctx.shadowColor = colori.accento;
      ctx.shadowBlur = 14;
      rettangoloTondo(-lato / 2, -lato / 2, lato, lato, lato * 0.14);
      ctx.fillStyle = faccia;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(2, U * 0.045);
      ctx.strokeStyle = BIANCO;
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      rettangoloTondo(-lato * 0.34, -lato * 0.34, lato * 0.68, lato * 0.68, lato * 0.08);
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.globalAlpha = 1;
      var altezzaFaccia = lato * 0.86;
      if (polloPronto) {
        ctx.drawImage(pollo, -altezzaFaccia * PROPORZIONE / 2, -altezzaFaccia / 2, altezzaFaccia * PROPORZIONE, altezzaFaccia);
      }
      ctx.restore();
    }

    function disegnaPollo() {
      var w = larghezzaGiocatore();
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
      var sopraBuca = M && S && stato !== 'fine' && S.alt < -0.05;
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

    function scritta(testo, x, yy, dimensione, peso, famiglia, colore, allinea, contorno) {
      ctx.font = peso + ' ' + Math.round(dimensione) + 'px ' + famiglia;
      ctx.textAlign = allinea;
      if (contorno) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, dimensione * 0.22);
        ctx.strokeStyle = 'rgba(0,0,0,0.72)';
        ctx.strokeText(testo, x, yy);
      }
      ctx.fillStyle = colore;
      ctx.fillText(testo, x, yy);
    }

    function adatta(testo, largo, massimo, famiglia, peso) {
      var righe = testo ? [testo] : [];
      ctx.font = peso + ' ' + Math.round(massimo) + 'px ' + famiglia;
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
      return { righe: righe, dimensione: Math.max(10, massimo * Math.min(1, largo / piuLarga)) };
    }

    function glitch(testo, x, yy, dim, scarto) {
      scritta(testo, x - scarto, yy, dim, '700', TITOLO, C.magenta, 'center', false);
      scritta(testo, x + scarto, yy, dim, '700', TITOLO, C.ciano, 'center', false);
      scritta(testo, x, yy, dim, '700', TITOLO, C.testo, 'center', false);
    }

    function testoCanzone() {
      if (!canzone || !canzone.titolo) { return ''; }
      return '♪ ' + canzone.titolo + (canzone.autore ? ' — ' + canzone.autore : '');
    }

    function etichetta(d) {
      return d.toUpperCase();
    }

    function coloreDifficolta(d) {
      if (d === 'estremo') { return ROSSO; }
      return gd ? GIALLO : C.ciano;
    }

    function dopoLivello(testo, x, yy, fs, contorno) {
      var largo = ctx.measureText(testo).width;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= 0.9;
      scritta(etichetta(difficolta), x + largo + fs * 0.7, yy + fs * 0.18, fs * 0.72, '700', MONO, difficolta === 'estremo' ? ROSSO : (gd ? BIANCO : C.violaChiaro), 'left', contorno);
      ctx.restore();
    }

    function inRiga(testo, x, yy, dim, peso, famiglia, colore, contorno) {
      ctx.font = peso + ' ' + Math.round(dim) + 'px ' + famiglia;
      var largo = ctx.measureText(testo).width;
      var spazio = Math.max(40, W - x - 12);
      scritta(testo, x, yy, largo > spazio ? Math.max(8, Math.floor(dim * spazio / largo)) : dim, peso, famiglia, colore, 'left', contorno);
    }

    function riservaDestra() {
      var ingombro = opzioni.ingombro;
      if (!ingombro || !ingombro.getBoundingClientRect || ingombro.hidden) { return 0; }
      var a = ingombro.getBoundingClientRect();
      var b = tela.getBoundingClientRect();
      if (!a.width || a.bottom <= (b.top || 0) + suolo || a.left >= (b.left || 0) + W) { return 0; }
      return Math.max(0, (b.left || 0) + W - a.left + 8);
    }

    function selettore(x, fs, contorno) {
      var voci = [];
      var separatore = ' · ';
      var fascia = Math.max(20, H - suolo);
      var dim = Math.min(fs, fascia * 0.5);
      ctx.font = '700 ' + Math.round(dim) + 'px ' + MONO;
      var totale = 0;
      var i;
      for (i = 0; i < DIFFICOLTA.length; i++) { totale += ctx.measureText(etichetta(DIFFICOLTA[i])).width + (i ? ctx.measureText(separatore).width : 0); }
      var spazio = Math.max(60, W - x - 12 - riservaDestra());
      if (totale > spazio) { dim = Math.max(9, Math.floor(dim * spazio / totale)); }
      var yy = suolo + fascia / 2 + dim * 0.35;
      ctx.font = '700 ' + Math.round(dim) + 'px ' + MONO;
      var larghezzaSeparatore = ctx.measureText(separatore).width;
      var cx = x;
      for (i = 0; i < DIFFICOLTA.length; i++) {
        var largo = ctx.measureText(etichetta(DIFFICOLTA[i])).width;
        voci.push({ d: DIFFICOLTA[i], x: cx, largo: largo });
        cx += largo + larghezzaSeparatore;
      }
      zone = [];
      var altoZona = Math.max(30, dim * 1.8);
      for (i = 0; i < voci.length; i++) {
        var v = voci[i];
        ctx.save();
        if (i) {
          ctx.globalAlpha *= 0.55;
          scritta(separatore, v.x - larghezzaSeparatore, yy, dim, '700', MONO, gd ? BIANCO : C.violaChiaro, 'left', false);
          ctx.globalAlpha /= 0.55;
        }
        if (v.d === difficolta) {
          ctx.shadowColor = coloreDifficolta(v.d);
          ctx.shadowBlur = gd ? 10 : 12;
          scritta(etichetta(v.d), v.x, yy, dim, '700', MONO, coloreDifficolta(v.d), 'left', contorno);
          ctx.shadowBlur = 0;
          ctx.fillStyle = coloreDifficolta(v.d);
          ctx.fillRect(v.x, yy + dim * 0.28, v.largo, Math.max(2, dim * 0.12));
        } else {
          ctx.globalAlpha *= 0.75;
          scritta(etichetta(v.d), v.x, yy, dim, '700', MONO, v.d === 'estremo' ? ROSSO : (gd ? BIANCO : C.violaChiaro), 'left', contorno);
        }
        ctx.restore();
        var centro = yy - dim * 0.35;
        zone.push({ d: v.d, x0: v.x - larghezzaSeparatore / 2, x1: v.x + v.largo + larghezzaSeparatore / 2, y0: centro - altoZona / 2, y1: centro + altoZona / 2 });
      }
      ctx.font = '600 ' + Math.round(dim * 0.85) + 'px ' + MONO;
      var suggerimento = cx - larghezzaSeparatore + ctx.measureText('  ←/→').width;
      if (!tocco && suggerimento <= W - 12 - riservaDestra()) {
        ctx.save();
        ctx.globalAlpha *= 0.5;
        scritta('  ←/→', cx - larghezzaSeparatore, yy, dim * 0.85, '600', MONO, gd ? BIANCO : C.violaChiaro, 'left', false);
        ctx.restore();
      }
    }

    function hudGD() {
      var fs = Math.max(12, Math.min(22, U * 0.27));
      ctx.save();
      ctx.textBaseline = 'top';
      if (stato === 'fermo') {
        if (raggiunto > 1) { scritta('MIGLIORE LIVELLO ' + raggiunto, W - 16, 12, fs, '700', MONO, BIANCO, 'right', true); }
        ctx.restore();
        return;
      }
      var avanzamento = M ? Math.max(0, Math.min(1, S.x / M.lunghezza)) : 0;
      var largo = Math.max(140, Math.min(W * 0.4, 520));
      var alto = Math.max(9, Math.min(16, U * 0.15));
      var bx = (W - largo) / 2;
      var by = 14;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      rettangoloTondo(bx - 3, by - 3, largo + 6, alto + 6, (alto + 6) / 2);
      ctx.fill();
      var riempi = ctx.createLinearGradient(bx, 0, bx + largo, 0);
      riempi.addColorStop(0, colori.accento);
      riempi.addColorStop(1, BIANCO);
      ctx.fillStyle = riempi;
      if (avanzamento > 0.004) {
        rettangoloTondo(bx, by, Math.max(alto, largo * avanzamento), alto, alto / 2);
        ctx.fill();
      }
      ctx.strokeStyle = BIANCO;
      ctx.lineWidth = 2;
      rettangoloTondo(bx - 3, by - 3, largo + 6, alto + 6, (alto + 6) / 2);
      ctx.stroke();
      scritta(Math.floor(avanzamento * 100) + '%', bx + largo + 14, by - fs * 0.25, fs * 1.15, '800', TITOLO, BIANCO, 'left', true);
      scritta('LIVELLO ' + livello, 16, 12, fs, '800', TITOLO, BIANCO, 'left', true);
      dopoLivello('LIVELLO ' + livello, 16, 12, fs, true);
      if (raggiunto > livello) { scritta('MIGLIORE LIVELLO ' + raggiunto, 16, 12 + fs * 1.3, fs * 0.8, '700', MONO, BIANCO, 'left', true); }
      var nota = testoCanzone();
      if (nota && t - tInizioTentativo < 6) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (6 - (t - tInizioTentativo)) / 1.2));
        scritta(nota, W - 16, 12, fs * 0.9, '700', TITOLO, BIANCO, 'right', true);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function hudSynth() {
      var fs = Math.max(12, U * 0.3);
      ctx.save();
      ctx.textBaseline = 'top';
      if (stato === 'fermo') {
        if (raggiunto > 1) {
          scritta('MIGLIORE LIVELLO ' + raggiunto, W - 16, 10, fs, '600', MONO, C.violaChiaro, 'right', false);
        }
        ctx.restore();
        return;
      }
      ctx.shadowColor = C.ciano;
      ctx.shadowBlur = 8;
      scritta('LIVELLO ' + livello, 16, 10, fs, '600', MONO, C.ciano, 'left', false);
      ctx.shadowBlur = 0;
      dopoLivello('LIVELLO ' + livello, 16, 10, fs, false);
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
      scritta(Math.floor(avanzamento * 100) + '%', 16 + largo + 8, by - fs * 0.15, fs * 0.85, '600', MONO, C.violaChiaro, 'left', false);
      scritta('TENTATIVO ' + tentativo, W - 16, 10, fs * 0.85, '600', MONO, C.violaChiaro, 'right', false);
      var riga = 10 + fs * 1.2;
      if (raggiunto > livello) {
        scritta('MIGLIORE LIVELLO ' + raggiunto, W - 16, riga, fs * 0.85, '500', MONO, C.violaChiaro, 'right', false);
        riga += fs * 1.1;
      }
      var nota = testoCanzone();
      if (nota && t - tInizioTentativo < 6) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (6 - (t - tInizioTentativo)) / 1.2));
        scritta(nota, W - 16, riga, fs * 0.85, '500', MONO, C.testo, 'right', false);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function hud() {
      if (gd) { hudGD(); } else { hudSynth(); }
    }

    function disegnaTesteMondo() {
      if (!M || stato !== 'corsa') { return; }
      var x = sx(4.6);
      if (x < -W || x > W + 200) { return; }
      var grande = Math.max(18, U * 0.62);
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      scritta('TENTATIVO ' + tentativo, x, suolo - U * 2.15, grande, '800', TITOLO, BIANCO, 'center', true);
      ctx.restore();
    }

    function disegnaIntro(fs) {
      var eta = t - tInizioTentativo;
      var durata = 2.4;
      if (eta > durata) { return; }
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = Math.max(0, Math.min(1, eta / 0.2, (durata - eta) / 0.6));
      ctx.shadowColor = C.allerta;
      ctx.shadowBlur = 12;
      var y = Math.max(fs * 2.4, orizzonte * 0.42);
      scritta('LIVELLO ' + livello, W / 2, y, fs * 2, '700', MONO, C.allerta, 'center', false);
      ctx.shadowBlur = 0;
      if (tentativo > 1) { scritta('TENTATIVO ' + tentativo, W / 2, y + fs * 1.5, fs, '500', MONO, C.violaChiaro, 'center', false); }
      ctx.restore();
    }

    function disegnaVittoriaGD() {
      var eta = t - tArrivo - 0.25;
      if (eta <= 0) { return; }
      var fs = Math.max(11, Math.min(20, U * 0.24));
      var pw = Math.min(W - 24, Math.max(280, Math.min(760, W * 0.86)));
      var fsTitolo = Math.max(16, Math.min(40, U * 0.44));
      if (!frasePagina || frasePagina.W !== W || frasePagina.U !== U) {
        frasePagina = adatta(frase, pw - 48, Math.max(14, Math.min(34, U * 0.38)), TITOLO, '800');
        frasePagina.W = W;
        frasePagina.U = U;
      }
      var righe = frasePagina.righe;
      var dim = frasePagina.dimensione;
      var nota = testoCanzone();
      var altoFrase = righe.length * dim * 1.18;
      var ph = 20 + fsTitolo * 1.35 + (righe.length ? altoFrase + 8 : 0) + fs * 1.6 + (nota ? fs * 1.45 : 0) + fs * 2.3 + 14;
      ph = Math.min(ph, H - 12);
      var px = (W - pw) / 2;
      var py = Math.max(6, (H - ph) / 2);
      var zoom = ridotto ? 1 : 1 + 0.2 * Math.max(0, 1 - eta / 0.25);
      ctx.save();
      ctx.globalAlpha = Math.min(1, eta / 0.2);
      ctx.translate(W / 2, py + ph / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -(py + ph / 2));
      rettangoloTondo(px, py, pw, ph, 14);
      ctx.fillStyle = 'rgba(4,8,34,0.9)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = BIANCO;
      ctx.shadowColor = colori.accento;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.textBaseline = 'top';
      var y = py + 16;
      scritta('LIVELLO ' + livello + ' COMPLETATO!', W / 2, y, fsTitolo, '900', TITOLO, GIALLO, 'center', true);
      y += fsTitolo * 1.35;
      for (var r = 0; r < righe.length; r++) {
        scritta(righe[r], W / 2 + 2, y + r * dim * 1.18 + 2, dim, '800', TITOLO, colori.accento, 'center', false);
        scritta(righe[r], W / 2, y + r * dim * 1.18, dim, '800', TITOLO, BIANCO, 'center', true);
      }
      if (righe.length) { y += altoFrase + 8; }
      scritta(etichetta(difficolta) + '   TENTATIVI ' + tentativo + '   SALTI ' + S.salti + '   TEMPO ' + tempoTesto(durataLivello), W / 2, y, fs, '700', MONO, BIANCO, 'center', false);
      y += fs * 1.6;
      if (nota) {
        ctx.globalAlpha *= 0.85;
        scritta(nota, W / 2, y, fs * 0.95, '600', TITOLO, BIANCO, 'center', false);
        ctx.globalAlpha /= 0.85;
        y += fs * 1.45;
      }
      if (t - tArrivo > ATTESA_ARRIVO) {
        ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        scritta('SPAZIO per il livello ' + (livello + 1), W / 2, y + fs * 0.5, fs * 1.1, '800', MONO, GIALLO, 'center', true);
      }
      ctx.restore();
    }

    function disegnaVittoriaSynth(fs) {
      var eta = t - tArrivo - ATTESA_ARRIVO * 0.3;
      if (eta <= 0) { return; }
      var fsTitolo = fs * 1.1;
      var nota = testoCanzone();
      var riservato = fsTitolo * 1.6 + fs * (nota ? 4.4 : 3);
      if (!frasePagina || frasePagina.W !== W || frasePagina.U !== U) {
        var larghezzaFrase = Math.max(60, W - 32);
        var massimo = Math.max(18, U * 0.45);
        frasePagina = adatta(frase, larghezzaFrase, massimo, TITOLO, '700');
        var spazio = orizzonte - 14 - riservato;
        if (frasePagina.righe.length) { frasePagina.dimensione = Math.max(11, Math.min(frasePagina.dimensione, spazio / (frasePagina.righe.length * 1.1))); }
        frasePagina.W = W;
        frasePagina.U = U;
      }
      var righe = frasePagina.righe;
      var dim = frasePagina.dimensione;
      var alto = fsTitolo * 1.6 + righe.length * dim * 1.1 + fs * (nota ? 4.4 : 3);
      var cima = Math.max(8, (orizzonte - alto) / 2);
      var zoom = ridotto ? 1 : 1 + 0.25 * Math.max(0, 1 - eta / 0.25);
      ctx.save();
      ctx.globalAlpha = Math.min(1, eta / 0.2) * 0.55;
      ctx.fillStyle = C.fondo;
      ctx.fillRect(0, cima - 8, W, alto + 16);
      ctx.globalAlpha = Math.min(1, eta / 0.2);
      ctx.translate(W / 2, cima + alto / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(0, -alto / 2);
      ctx.textBaseline = 'top';
      ctx.shadowColor = C.allerta;
      ctx.shadowBlur = 10;
      scritta('LIVELLO ' + livello + ' COMPLETATO', 0, 0, fsTitolo, '700', MONO, C.allerta, 'center', false);
      ctx.shadowBlur = 0;
      var scarto = ridotto ? 2 : 2 + (Math.random() < 0.12 ? U * 0.05 : 0);
      var y = fsTitolo * 1.6;
      for (var r = 0; r < righe.length; r++) { glitch(righe[r], 0, y + r * dim * 1.1, dim, scarto); }
      y += righe.length * dim * 1.1 + fs * 0.4;
      scritta(etichetta(difficolta) + '   TENTATIVI ' + tentativo + '   SALTI ' + S.salti + '   TEMPO ' + tempoTesto(durataLivello), 0, y, fs * 0.9, '500', MONO, C.violaChiaro, 'center', false);
      y += fs * 1.3;
      if (nota) {
        scritta(nota, 0, y, fs * 0.9, '500', MONO, C.violaChiaro, 'center', false);
        y += fs * 1.3;
      }
      if (t - tArrivo > ATTESA_ARRIVO) {
        ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        scritta('SPAZIO per il livello ' + (livello + 1), 0, y + fs * 0.3, fs, '500', MONO, C.testo, 'center', false);
      }
      ctx.restore();
    }

    function disegnaFine(fs) {
      var gx = W / 2;
      var gy = gd ? suolo * 0.42 : orizzonte * 0.62;
      var grande = Math.max(24, U * 0.7);
      if (gd) {
        scritta('GAME OVER', gx, gy, grande, '900', TITOLO, BIANCO, 'center', true);
        ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        scritta('SPAZIO per riprovare il livello ' + livello + ' · ESC per uscire', gx, gy + fs * 1.7, fs, '700', MONO, BIANCO, 'center', true);
      } else {
        glitch('GAME OVER', gx, gy, grande, 2);
        ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        scritta('SPAZIO per riprovare il livello ' + livello + ' · ESC per uscire', gx, gy + fs * 1.6, fs, '500', MONO, C.testo, 'center', false);
      }
      ctx.globalAlpha = 1;
    }

    function messaggi() {
      var fs = Math.max(11, Math.min(22, U * 0.26));
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      if (stato !== 'fermo') { zone = []; }
      if (stato === 'fermo') {
        if (gd) {
          var xg = Math.min(polloX, 20);
          selettore(xg, fs, true);
          ctx.shadowColor = '#35e6ff';
          ctx.shadowBlur = 12;
          inRiga('POLLO RUN', xg, suolo - U * 2.35, fs * 1.9, '900', TITOLO, BIANCO, true);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = ridotto ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
          inRiga((tocco ? 'Dal computer: ' : '') + 'SPAZIO per correre', xg, suolo - U * 1.75, fs, '700', MONO, BIANCO, true);
          ctx.globalAlpha = 1;
          if (raggiunto > 1) { inRiga('INVIO: riprendi dal livello ' + raggiunto, xg, suolo - U * 1.3, fs * 0.9, '600', MONO, GIALLO, true); }
        } else {
          var x = polloX + larghezzaGiocatore() + U * 0.35;
          selettore(polloX, fs * 0.95, false);
          ctx.shadowColor = C.magenta;
          ctx.shadowBlur = 10;
          inRiga('POLLO RUN', x, suolo - U * 0.95, fs * 1.15, '700', MONO, C.magenta, false);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = ridotto ? 1 : 0.55 + 0.45 * Math.sin(t * 4);
          inRiga((tocco ? 'Dal computer: ' : '') + 'SPAZIO per correre', x, suolo - U * 0.55, fs, '500', MONO, C.testo, false);
          ctx.globalAlpha = 1;
          if (raggiunto > 1) { inRiga('INVIO: riprendi dal livello ' + raggiunto, x, suolo - U * 0.2, fs * 0.9, '500', MONO, C.violaChiaro, false); }
        }
      }
      if (stato === 'corsa') {
        if (gd) { disegnaTesteMondo(); } else { disegnaIntro(fs); }
        if (livello === 1 && tentativo === 1 && t - tInizioTentativo > 2.4 && t - tInizioTentativo < 7) {
          ctx.globalAlpha = Math.min(1, (7 - (t - tInizioTentativo)) / 1);
          scritta('SPAZIO / ↑ per saltare', W / 2, (gd ? suolo * 0.4 : orizzonte * 0.5), fs, '500', MONO, gd ? BIANCO : C.testo, 'center', gd);
          ctx.globalAlpha = 1;
        }
      }
      if (stato === 'vinto') { if (gd) { disegnaVittoriaGD(); } else { disegnaVittoriaSynth(fs); } }
      if (stato === 'fine') { disegnaFine(fs); }
      ctx.restore();
    }

    function disegna() {
      if (!W || !H) { return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (scossa > 0) {
        var forza = scossa / 0.35;
        ctx.translate((Math.random() - 0.5) * U * 0.25 * forza, (Math.random() - 0.5) * U * 0.18 * forza);
      }
      sfondo();
      disegnaSuolo();
      disegnaMondo();
      disegnaTraguardo();
      disegnaScintille();
      if (gd) { disegnaCubo(); } else { disegnaPollo(); }
      ctx.restore();
      hud();
      messaggi();
      if (lampo > 0) {
        ctx.save();
        ctx.globalAlpha = lampo * (gd ? 0.5 : 0.45);
        ctx.fillStyle = gd ? BIANCO : C.testo;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    function scintilla(x, yy, vx, vyy, colore, durata, lato) {
      scintille.push({ x: x, y: yy, vx: vx, vy: vyy, colore: colore, vita: durata, durata: durata, lato: lato });
    }

    function suonaCanzone(voceScelta) {
      if (typeof opzioni.suCanzone === 'function') { opzioni.suCanzone(voceScelta); }
    }

    function scegliCanzone(n) {
      if (!canzoni.length) { return null; }
      var indice;
      if (modoCanzoni === 'fissa') {
        indice = canzoneFissa % canzoni.length;
      } else if (modoCanzoni === 'caso') {
        if (canzone && canzoneDelLivello === n) {
          indice = canzone.indice;
        } else if (!canzone && primaCanzone >= 0 && primaCanzone < canzoni.length) {
          indice = primaCanzone;
        } else {
          indice = Math.floor(Math.random() * canzoni.length);
          if (canzoni.length > 1 && canzone && indice === canzone.indice) { indice = (indice + 1 + Math.floor(Math.random() * (canzoni.length - 1))) % canzoni.length; }
        }
      } else {
        indice = (n - 1) % canzoni.length;
      }
      var scelta = canzoni[indice];
      return { titolo: scelta.titolo, autore: scelta.autore, file: scelta.file, indice: indice };
    }

    function schianto() {
      stato = 'fine';
      tStato = t;
      lampo = 1;
      scossa = ridotto ? 0 : 0.35;
      var cx = centroPollo();
      var cy = sy(Math.max(S.alt, -0.4)) - (gd ? latoCubo() : U) / 2;
      var pezzi = gd ? [colori.cubo0, colori.cubo1, BIANCO, colori.accento] : [C.allerta, C.ciano, C.magenta];
      for (var i = 0; i < 26; i++) {
        var a = Math.random() * Math.PI * 2;
        var forza = U * (2 + Math.random() * 5);
        scintilla(cx, cy, Math.cos(a) * forza, Math.sin(a) * forza - U * 2, pezzi[i % pezzi.length], 0.5 + Math.random() * 0.6, U * (0.06 + Math.random() * 0.1));
      }
      if (gd) { onde.push({ x: cx, y: cy, raggio: U * 0.3, vita: 0.55, durata: 0.55, crescita: U * 5 }); }
      suonaCanzone(null);
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
      try { localStorage.setItem(chiaveLivello(), String(raggiunto)); } catch (e) { }
    }

    function scegliDifficolta(nuova) {
      if (stato !== 'fermo' || DIFFICOLTA.indexOf(nuova) === -1 || nuova === difficolta) { return; }
      difficolta = nuova;
      raggiunto = leggiRaggiunto();
      try { localStorage.setItem(CHIAVE_DIFFICOLTA, difficolta); } catch (e) { }
      if (timerPrecalcolo) { clearTimeout(timerPrecalcolo); }
      timerPrecalcolo = setTimeout(function () { precalcola(1); }, 400);
      chiedi();
    }

    function stessoLivello(mondo, n) {
      return !!mondo && mondo.n === n && mondo.difficolta === difficolta;
    }

    function precalcola(n) {
      timerPrecalcolo = 0;
      if (!stessoLivello(prossimoM, n)) { prossimoM = Livelli.crea(n, difficolta); }
    }

    function arriva() {
      stato = 'vinto';
      tStato = t;
      tArrivo = t;
      durataLivello = t - tInizioTentativo;
      frase = pesca();
      frasePagina = null;
      lampo = 0.6;
      raggiunto = Math.max(raggiunto, livello + 1);
      ricorda();
      S.richiesta = true;
      var cx = sx(M.lunghezza);
      var tinte = gd ? [colori.accento, BIANCO, colori.cubo0, colori.cubo1] : [C.allerta, C.ciano, C.magenta, C.violaChiaro];
      for (var i = 0; i < 70; i++) {
        var a = -Math.PI * (0.1 + 0.8 * Math.random());
        var forza = U * (3 + Math.random() * 7);
        scintilla(cx, suolo - U * 1.2, Math.cos(a) * forza, Math.sin(a) * forza, tinte[i % tinte.length], 0.9 + Math.random() * 0.9, U * (0.05 + Math.random() * 0.08));
      }
      if (!timerPrecalcolo) { timerPrecalcolo = setTimeout(function () { precalcola(livello + 1); }, 60); }
    }

    function avviaLivello(n) {
      if (n === livello && M && M.n === n && stato !== 'fermo') { tentativo++; } else { tentativo = 1; }
      livello = n;
      if (!stessoLivello(M, n)) { M = stessoLivello(prossimoM, n) ? prossimoM : Livelli.crea(n, difficolta); }
      if (stessoLivello(prossimoM, n)) { prossimoM = null; }
      S = Livelli.nuovoStato(M.v);
      tema = creaTema(M.tema);
      resto = 0;
      angolo = 0;
      giro = 0;
      scintille = [];
      onde = [];
      frasePagina = null;
      stato = 'corsa';
      tStato = t;
      tInizioTentativo = t;
      if (n > raggiunto) { raggiunto = n; ricorda(); }
      canzone = scegliCanzone(n);
      canzoneDelLivello = n;
      suonaCanzone(canzone);
      chiedi();
    }

    function inizia(n) {
      var prima = stato;
      tentativo = 0;
      livello = 0;
      M = null;
      if (prima === 'fermo' && opzioni.suPartita) { opzioni.suPartita(true); }
      avviaLivello(Math.max(1, n));
    }

    function torna() {
      var eraInGioco = stato !== 'fermo';
      stato = 'fermo';
      M = null;
      S = null;
      tema = creaTema(0);
      colori = coloriDi(1, 0);
      scintille = [];
      onde = [];
      if (eraInGioco) {
        suonaCanzone(null);
        if (opzioni.suPartita) { opzioni.suPartita(false); }
      }
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
      if (gd) {
        var bersaglio = stato === 'fermo' ? 0 : 1;
        fondo += (bersaglio - fondo) * Math.min(1, dt * 6);
        if (Math.abs(bersaglio - fondo) < 0.01) { fondo = bersaglio; }
      }
      if (stato === 'fermo' && !ridotto) { deriva += U * 0.6 * dt; }
      if (stato === 'corsa' || stato === 'vinto') {
        aggiornaFisica(dt);
        if (S) {
          deriva = S.x * U;
          if (!S.aTerra) {
            angolo += dt * Math.PI / K.ARIA;
            if (S.salto) { giro += dt * Math.PI * 2 / K.ARIA; }
          } else {
            var verso = Math.round(angolo / (Math.PI / 2)) * (Math.PI / 2);
            angolo += (verso - angolo) * Math.min(1, dt * 20);
            giro = 0;
          }
          if (stato === 'corsa' && S.aTerra) {
            scia -= dt;
            if (scia <= 0) {
              if (gd) {
                scia = 0.035;
                scintilla(centroPollo() - latoCubo() * 0.4, suolo - 3, -U * 3 - Math.random() * U * 2, -Math.random() * U * 1.4, Math.random() < 0.5 ? colori.accento : BIANCO, 0.35, U * 0.08);
              } else {
                scia = 0.04;
                scintilla(polloX + larghezzaGiocatore() * 0.25, suolo - 3, -U * 4 - Math.random() * U, -Math.random() * U * 1.5, Math.random() < 0.5 ? C.ciano : C.magenta, 0.4, U * 0.07);
              }
            }
          }
        }
        if (gd) { colori = coloriDi(livello, M && S ? Math.max(0, Math.min(1, S.x / M.lunghezza)) : 0); }
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
      for (var w = onde.length - 1; w >= 0; w--) {
        var o = onde[w];
        o.vita -= dt;
        if (o.vita <= 0) { onde.splice(w, 1); continue; }
        o.raggio += o.crescita * dt;
      }
    }

    function serveMoto() {
      return !ridotto || stato !== 'fermo' || lampo > 0 || scintille.length > 0 || onde.length > 0 || (gd && fondo > 0.01);
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
      if (stato === 'fermo' && !evento.altKey && !evento.ctrlKey && !evento.metaKey) {
        var sposta = evento.key === 'ArrowLeft' ? -1 : (evento.key === 'ArrowRight' ? 1 : 0);
        var cifra = evento.key && evento.key.length === 1 ? '1234'.indexOf(evento.key) : -1;
        if (sposta || cifra !== -1) {
          var dove = evento.target;
          if (dove && dove.closest && dove.closest('a, button, input, textarea, select')) { return; }
          evento.preventDefault();
          var attuale = DIFFICOLTA.indexOf(difficolta);
          scegliDifficolta(DIFFICOLTA[cifra !== -1 ? cifra : Math.max(0, Math.min(DIFFICOLTA.length - 1, attuale + sposta))]);
          return;
        }
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

    function zonaSotto(evento) {
      if (!zone.length || typeof evento.clientX !== 'number') { return null; }
      var r = tela.getBoundingClientRect();
      var largo = r.width || W;
      var alto = r.height || H;
      var x = (evento.clientX - (r.left || 0)) * (W / largo);
      var y = (evento.clientY - (r.top || 0)) * (H / alto);
      for (var i = 0; i < zone.length; i++) {
        var z = zone[i];
        if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) { return z; }
      }
      return null;
    }

    function sopraTela(bersaglio) {
      if (bersaglio === tela) { return true; }
      if (!bersaglio || !bersaglio.getBoundingClientRect) { return false; }
      if (bersaglio === document.body || bersaglio === document.documentElement) { return true; }
      var a = bersaglio.getBoundingClientRect();
      var b = tela.getBoundingClientRect();
      return a.width >= b.width * 0.95 && a.height >= b.height * 0.95;
    }

    function suClic(evento) {
      if (evento.button) { return; }
      var bersaglio = evento.target;
      if (bersaglio && bersaglio.closest && bersaglio.closest('#mnt-audio-box, a, button, input')) { return; }
      if (stato === 'fermo') {
        var zona = sopraTela(bersaglio) ? zonaSotto(evento) : null;
        if (zona) { scegliDifficolta(zona.d); }
        return;
      }
      if (stato !== 'corsa') { return; }
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
      if (!timerPrecalcolo) { timerPrecalcolo = setTimeout(function () { precalcola(1); }, 400); }
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
