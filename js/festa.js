(function () {
  'use strict';

  const DATI = window.DATI || {};
  const SORGENTE = (DATI.meteora && Array.isArray(DATI.meteora.icone) && DATI.meteora.icone.length) ? DATI.meteora
    : ((DATI.chi && Array.isArray(DATI.chi.icone)) ? DATI.chi : {});
  const RE_ICONA = /^icone_slayer\/[^/?#]+$/;
  const ICONE = (Array.isArray(SORGENTE.icone) ? SORGENTE.icone : [])
    .filter(function (src) { return typeof src === 'string' && RE_ICONA.test(src) && src.indexOf('..') === -1; });
  const PRINCIPALE = (typeof SORGENTE.icona === 'string' && RE_ICONA.test(SORGENTE.icona)) ? SORGENTE.icona : (ICONE[0] || '');
  const COLORI = ['var(--ciano, #22e0ff)', 'var(--magenta, #ff2fa0)', 'var(--viola, #8b2fff)', 'var(--allerta, #ffc65c)'];
  const MASSIMO = 280;

  const quieto = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let strato = null;
  let particelle = [];
  let acceso = false;
  let ultimo = 0;

  function fermo() { return !!(quieto && quieto.matches); }

  function livello() {
    if (strato && strato.isConnected) { return strato; }
    strato = document.createElement('div');
    strato.className = 'festa';
    strato.setAttribute('aria-hidden', 'true');
    document.body.appendChild(strato);
    return strato;
  }

  function caso(min, max) { return min + Math.random() * (max - min); }

  function iconaNodo(src, lato) {
    const img = document.createElement('img');
    img.className = 'festa__icona';
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.style.width = lato + 'px';
    img.style.height = lato + 'px';
    return img;
  }

  function coriandoloNodo(lato) {
    const pezzo = document.createElement('span');
    pezzo.className = 'festa__coriandolo';
    pezzo.style.width = lato + 'px';
    pezzo.style.height = (lato * caso(0.4, 0.7)) + 'px';
    pezzo.style.background = COLORI[Math.floor(Math.random() * COLORI.length)];
    return pezzo;
  }

  function aggiungi(nodo, dati) {
    if (particelle.length >= MASSIMO) {
      const vecchia = particelle.shift();
      if (vecchia.nodo.parentNode) { vecchia.nodo.parentNode.removeChild(vecchia.nodo); }
    }
    livello().appendChild(nodo);
    dati.nodo = nodo;
    dati.eta = 0;
    particelle.push(dati);
    disegnaUna(dati);
    avvia();
  }

  function disegnaUna(p) {
    const resto = p.eta < p.ritardo ? 0 : Math.max(0, 1 - Math.max(0, p.eta - p.ritardo - p.durata * p.dissolvenza) / (p.durata * (1 - p.dissolvenza)));
    const ondeggia = p.oscilla ? Math.sin((p.eta + p.fase) * p.oscilla) * p.ampiezza : 0;
    p.nodo.style.opacity = String(p.eta < p.ritardo ? 0 : resto);
    p.nodo.style.transform = 'translate3d(' + (p.x + ondeggia).toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0) translate(-50%,-50%) rotate(' + p.r.toFixed(1) + 'deg) scale(' + p.s.toFixed(3) + ')';
  }

  function passo(ora) {
    const dt = ultimo ? Math.min(0.05, (ora - ultimo) / 1000) : 0;
    ultimo = ora;
    const altezza = window.innerHeight;
    particelle = particelle.filter(function (p) {
      p.eta += dt;
      if (p.eta >= p.ritardo) {
        const t = dt;
        p.vy += p.gravita * t;
        p.vx *= Math.pow(p.attrito, t * 60);
        p.vy *= Math.pow(p.attrito, t * 60);
        if (p.vmax && p.vy > p.vmax) { p.vy = p.vmax; }
        p.x += p.vx * t;
        p.y += p.vy * t;
        p.r += p.vr * t;
        if (p.cresce) { p.s = Math.min(p.sFine, p.s + p.cresce * t); }
      }
      const finita = p.eta >= p.ritardo + p.durata || (p.gravita > 0 && p.y > altezza + 120);
      if (finita) {
        if (p.nodo.parentNode) { p.nodo.parentNode.removeChild(p.nodo); }
        return false;
      }
      disegnaUna(p);
      return true;
    });
    if (particelle.length) {
      requestAnimationFrame(passo);
    } else {
      acceso = false;
      ultimo = 0;
    }
  }

  function avvia() {
    if (acceso) { return; }
    acceso = true;
    ultimo = 0;
    requestAnimationFrame(passo);
  }

  function base(x, y) {
    return { x: x, y: y, vx: 0, vy: 0, r: 0, vr: 0, s: 1, gravita: 0, attrito: 1, durata: 1, dissolvenza: 0.6, ritardo: 0, oscilla: 0, ampiezza: 0, fase: 0 };
  }

  function centroDi(elemento) {
    const r = elemento.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, largo: r.width, alto: r.height, cima: r.top };
  }

  function sbuffo(elemento) {
    if (!PRINCIPALE || !elemento) { return; }
    const c = centroDi(elemento);
    const lato = Math.round(Math.max(34, Math.min(48, c.largo * 0.22)));
    const p = base(c.x + caso(-c.largo * 0.18, c.largo * 0.18), c.cima + lato * 0.2);
    if (fermo()) {
      p.durata = 1.1;
      p.dissolvenza = 0.5;
    } else {
      p.vy = -caso(170, 220);
      p.gravita = 150;
      p.vx = caso(-30, 30);
      p.r = caso(-18, 18);
      p.vr = caso(-40, 40);
      p.s = 0.3;
      p.sFine = 1;
      p.cresce = 4.5;
      p.durata = 1.25;
      p.dissolvenza = 0.55;
    }
    aggiungi(iconaNodo(PRINCIPALE, lato), p);
  }

  function spruzzo(elemento) {
    if (!ICONE.length || !elemento || fermo()) { return; }
    const c = centroDi(elemento);
    const quante = Math.max(ICONE.length, 18);
    const scarto = Math.random() * Math.PI * 2;
    for (let i = 0; i < quante; i++) {
      const angolo = scarto + (i / quante) * Math.PI * 2 + caso(-0.12, 0.12);
      const forza = caso(420, 760);
      const lato = Math.round(caso(34, 56));
      const p = base(c.x, c.y);
      p.vx = Math.cos(angolo) * forza;
      p.vy = Math.sin(angolo) * forza - 160;
      p.gravita = 900;
      p.attrito = 0.985;
      p.vr = caso(-540, 540);
      p.s = 0.4;
      p.sFine = 1;
      p.cresce = 5;
      p.durata = caso(1.4, 1.9);
      p.dissolvenza = 0.65;
      aggiungi(iconaNodo(ICONE[i % ICONE.length], lato), p);
    }
    for (let k = 0; k < 16; k++) {
      const angolo = Math.random() * Math.PI * 2;
      const forza = caso(260, 620);
      const p = base(c.x, c.y);
      p.vx = Math.cos(angolo) * forza;
      p.vy = Math.sin(angolo) * forza - 120;
      p.gravita = 800;
      p.attrito = 0.98;
      p.vr = caso(-720, 720);
      p.durata = caso(0.9, 1.4);
      aggiungi(coriandoloNodo(caso(7, 12)), p);
    }
  }

  function lampo(x, y) {
    const anello = document.createElement('span');
    anello.className = 'festa__lampo';
    anello.style.left = x + 'px';
    anello.style.top = y + 'px';
    livello().appendChild(anello);
    setTimeout(function () { if (anello.parentNode) { anello.parentNode.removeChild(anello); } }, 900);
  }

  function pioggia(quante) {
    if (!ICONE.length) { return; }
    if (fermo()) { return; }
    const largo = window.innerWidth;
    const totale = quante || Math.round(Math.max(40, Math.min(90, largo / 18)));
    for (let i = 0; i < totale; i++) {
      const lato = Math.round(caso(30, 64));
      const p = base(caso(0, largo), -caso(40, 120));
      p.vy = caso(140, 320);
      p.vmax = caso(280, 460);
      p.gravita = 260;
      p.vx = caso(-30, 30);
      p.vr = caso(-160, 160);
      p.r = caso(-40, 40);
      p.oscilla = caso(2, 4);
      p.ampiezza = caso(10, 34);
      p.fase = caso(0, 6);
      p.ritardo = caso(0, 2.2);
      p.durata = 6;
      p.dissolvenza = 0.85;
      aggiungi(iconaNodo(ICONE[i % ICONE.length], lato), p);
    }
    for (let k = 0; k < Math.round(totale * 0.45); k++) {
      const p = base(caso(0, largo), -caso(20, 80));
      p.vy = caso(120, 260);
      p.vmax = caso(200, 340);
      p.gravita = 200;
      p.vr = caso(-500, 500);
      p.oscilla = caso(3, 6);
      p.ampiezza = caso(8, 22);
      p.fase = caso(0, 6);
      p.ritardo = caso(0, 2.5);
      p.durata = 6;
      p.dissolvenza = 0.85;
      aggiungi(coriandoloNodo(caso(8, 13)), p);
    }
  }

  function esplodi(x, y) {
    lampo(x, y);
    if (fermo()) { return; }
    const finto = { getBoundingClientRect: function () { return { left: x, top: y, width: 0, height: 0 }; } };
    spruzzo(finto);
    setTimeout(function () { pioggia(); }, 250);
  }

  window.PolloFesta = {
    icona: PRINCIPALE,
    icone: ICONE.slice(),
    fermo: fermo,
    sbuffo: sbuffo,
    spruzzo: spruzzo,
    pioggia: pioggia,
    esplodi: esplodi
  };
}());
