(function () {
  'use strict';

  const DATI = window.DATI || {};
  const METEORA = (DATI.meteora && typeof DATI.meteora === 'object') ? DATI.meteora : {};
  const festa = window.PolloFesta || null;
  const ICONA = festa && festa.icona ? festa.icona : '';
  if (!ICONA || !document.body) { return; }

  const OGNI_QUANTO = 15000;
  const VALIDA_PER = 45000;
  const CHIAVE_VISTA = 'sb-meteora-vista';
  const MINUTO = 60000;
  const RE_SUONO = /^suoni_meteora\/[^/?#]+$/;
  const SUONI = (Array.isArray(METEORA.suoni) ? METEORA.suoni : [])
    .filter(function (src) { return typeof src === 'string' && RE_SUONO.test(src) && src.indexOf('..') === -1; });
  let ultimoSuono = -1;
  const HALLOWEEN = METEORA.halloween === true;
  const SVG = 'http://www.w3.org/2000/svg';
  const ETICHETTE = {
    pollo: 'Prendi il polletto al volo!',
    zucca: 'Prendi la zucca al volo!',
    teschio: 'Prendi il teschio al volo!',
    strega: 'Prendi il polletto stregato al volo!'
  };

  let inVolo = null;
  let timerCaso = null;
  let timerControllo = null;
  let fallimenti = 0;
  let inAttesa = false;
  let ultimaVista = '';
  try { ultimaVista = sessionStorage.getItem(CHIAVE_VISTA) || ''; } catch (e) { ultimaVista = ''; }

  function caso(min, max) { return min + Math.random() * (max - min); }

  function nascosto() {
    return !!(document.hidden || document.querySelector('.pollo-gif.is-aperto'));
  }

  function occupato() {
    return !!(inVolo || nascosto());
  }

  function suona() {
    if (!SUONI.length) { return; }
    let scelta = Math.floor(Math.random() * SUONI.length);
    if (SUONI.length > 1 && scelta === ultimoSuono) { scelta = (scelta + 1 + Math.floor(Math.random() * (SUONI.length - 1))) % SUONI.length; }
    ultimoSuono = scelta;
    try {
      const audio = new Audio(SUONI[scelta]);
      audio.volume = 0.7;
      const promessa = audio.play();
      if (promessa) { promessa.catch(function () { }); }
    } catch (e) { }
  }

  function traiettoria(largo, alto, lato, versi) {
    const fuori = lato * 2.2;
    const verso = versi ? versi[Math.floor(Math.random() * versi.length)] : Math.floor(Math.random() * 4);
    let a;
    let b;
    if (verso === 0) {
      a = { x: -fuori, y: caso(alto * 0.12, alto * 0.7) };
      b = { x: largo + fuori, y: caso(alto * 0.12, alto * 0.8) };
    } else if (verso === 1) {
      a = { x: largo + fuori, y: caso(alto * 0.12, alto * 0.7) };
      b = { x: -fuori, y: caso(alto * 0.12, alto * 0.8) };
    } else if (verso === 2) {
      a = { x: caso(-fuori, largo * 0.35), y: -fuori };
      b = { x: caso(largo * 0.65, largo + fuori), y: alto + fuori };
    } else {
      a = { x: caso(largo * 0.65, largo + fuori), y: -fuori };
      b = { x: caso(-fuori, largo * 0.35), y: alto + fuori };
    }
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lunghezza = Math.hypot(dx, dy) || 1;
    const curva = caso(-0.18, 0.18) * lunghezza;
    const c = { x: mx - dy / lunghezza * curva, y: my + dx / lunghezza * curva };
    return { a: a, b: b, c: c };
  }

  function punto(t, via) {
    const u = 1 - t;
    return {
      x: u * u * via.a.x + 2 * u * t * via.c.x + t * t * via.b.x,
      y: u * u * via.a.y + 2 * u * t * via.c.y + t * t * via.b.y
    };
  }

  function scintilla(x, y, tipo) {
    const s = document.createElement('span');
    s.className = 'meteora__scintilla' + (tipo === 'zucca' || tipo === 'teschio' || tipo === 'strega' ? ' meteora__scintilla--' + tipo : '');
    s.setAttribute('aria-hidden', 'true');
    s.style.transform = 'translate3d(' + (x + caso(-10, 10)).toFixed(1) + 'px,' + (y + caso(-10, 10)).toFixed(1) + 'px,0)';
    s.style.setProperty('--sx', caso(-26, 26).toFixed(0) + 'px');
    s.style.setProperty('--sy', caso(8, 40).toFixed(0) + 'px');
    document.body.appendChild(s);
    setTimeout(function () { if (s.parentNode) { s.parentNode.removeChild(s); } }, 750);
  }

  function togli(volo) {
    volo.finito = true;
    if (volo.nodo.parentNode) { volo.nodo.parentNode.removeChild(volo.nodo); }
    if (inVolo === volo) { inVolo = null; }
  }

  function disegno(nome, attributi, figli) {
    const nodo = document.createElementNS(SVG, nome);
    Object.keys(attributi).forEach(function (chiave) { nodo.setAttribute(chiave, attributi[chiave]); });
    (figli || []).forEach(function (figlio) { nodo.appendChild(figlio); });
    return nodo;
  }

  function tela(figli) {
    const nodo = disegno('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' }, figli);
    nodo.setAttribute('class', 'meteora__icona');
    return nodo;
  }

  function zucca() {
    return tela([
      disegno('path', { d: 'M46 27 Q46 13 57 8 L61 13 Q53 17 54 27 Z', fill: '#4f8a2e' }),
      disegno('ellipse', { cx: '31', cy: '59', rx: '24', ry: '31', fill: '#c9560c' }),
      disegno('ellipse', { cx: '69', cy: '59', rx: '24', ry: '31', fill: '#c9560c' }),
      disegno('ellipse', { cx: '50', cy: '59', rx: '26', ry: '33', fill: '#ff7a1a' }),
      disegno('path', { d: 'M30 53 L38 39 L46 53 Z M54 53 L62 39 L70 53 Z M47 61 L50 56 L53 61 Z M27 66 L34 72 L41 67 L47 73 L53 67 L59 73 L66 67 L73 66 Q67 85 50 86 Q33 85 27 66 Z', fill: '#ffd23f' })
    ]);
  }

  function teschio() {
    return tela([
      disegno('circle', { cx: '50', cy: '44', r: '31', fill: '#efe6d2' }),
      disegno('rect', { x: '33', y: '62', width: '34', height: '24', rx: '7', fill: '#efe6d2' }),
      disegno('ellipse', { cx: '38', cy: '47', rx: '9', ry: '10', fill: '#0b0712' }),
      disegno('ellipse', { cx: '62', cy: '47', rx: '9', ry: '10', fill: '#0b0712' }),
      disegno('circle', { cx: '38', cy: '48', r: '3.4', fill: '#8dff5a' }),
      disegno('circle', { cx: '62', cy: '48', r: '3.4', fill: '#8dff5a' }),
      disegno('path', { d: 'M50 57 L45 66 L55 66 Z', fill: '#0b0712' }),
      disegno('path', { d: 'M42 71 V85 M50 71 V85 M58 71 V85', stroke: '#0b0712', 'stroke-width': '3', fill: 'none' })
    ]);
  }

  function strega() {
    const coscia = disegno('image', { x: '6', y: '14', width: '86', height: '86', preserveAspectRatio: 'xMidYMid meet' });
    coscia.setAttribute('href', ICONA);
    const cappello = disegno('g', { transform: 'translate(40 24) rotate(-24)' }, [
      disegno('path', { d: 'M-15 0 Q-11 -16 -3 -31 Q-8 -41 -23 -43 Q-2 -40 3 -29 Q8 -15 15 0 Z', fill: '#1d1030', stroke: '#8b2fff', 'stroke-width': '1.6' }),
      disegno('path', { d: 'M-14 -4 L14 -4 L12 -11 L-12 -11 Z', fill: '#ff7a1a' }),
      disegno('rect', { x: '-3', y: '-11', width: '6', height: '7', fill: '#ffd23f' }),
      disegno('ellipse', { cx: '0', cy: '0', rx: '27', ry: '6', fill: '#1d1030', stroke: '#8b2fff', 'stroke-width': '1.6' })
    ]);
    return tela([coscia, cappello]);
  }

  function figura(tipo) {
    if (tipo === 'zucca') { return zucca(); }
    if (tipo === 'teschio') { return teschio(); }
    if (tipo === 'strega') { return strega(); }
    const img = document.createElement('img');
    img.className = 'meteora__icona';
    img.src = ICONA;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  function scoppio(x, y, gruppo) {
    if (!gruppo) {
      try { festa.esplodi(x, y); } catch (e) { }
      return;
    }
    gruppo.prese++;
    if (gruppo.prese >= gruppo.quante) {
      try { festa.esplodi(x, y); } catch (e) { }
      return;
    }
    const finto = { getBoundingClientRect: function () { return { left: x, top: y, width: 0, height: 0 }; } };
    try { festa.spruzzo(finto); } catch (e) { }
  }

  function vola(opzioni) {
    const largo = window.innerWidth;
    const alto = window.innerHeight;
    const lato = opzioni.lato;
    const via = traiettoria(largo, alto, lato, opzioni.versi);
    const durata = opzioni.durata;
    const tipo = opzioni.tipo;
    const gruppo = opzioni.gruppo || null;
    const ogniScintilla = gruppo ? 90 : 45;

    const nodo = document.createElement('button');
    nodo.type = 'button';
    nodo.className = 'meteora' + (tipo === 'pollo' ? '' : ' meteora--' + tipo);
    nodo.setAttribute('aria-label', ETICHETTE[tipo] || ETICHETTE.pollo);
    nodo.style.setProperty('--meteora-lato', lato + 'px');
    const coda = document.createElement('span');
    coda.className = 'meteora__coda';
    const alone = document.createElement('span');
    alone.className = 'meteora__alone';
    nodo.appendChild(coda);
    nodo.appendChild(alone);
    nodo.appendChild(figura(tipo));

    const volo = { nodo: nodo, finito: false, x: via.a.x, y: via.a.y };

    function posa(x, y, angolo) {
      volo.x = x;
      volo.y = y;
      nodo.style.transform = 'translate3d(' + (x - lato / 2).toFixed(1) + 'px,' + (y - lato / 2).toFixed(1) + 'px,0)';
      nodo.style.setProperty('--meteora-angolo', angolo.toFixed(1) + 'deg');
    }

    function esplodi(evento) {
      if (volo.finito) { return; }
      if (evento) { evento.preventDefault(); }
      const x = volo.x;
      const y = volo.y;
      togli(volo);
      suona();
      scoppio(x, y, gruppo);
    }

    nodo.addEventListener('pointerdown', esplodi);
    nodo.addEventListener('click', esplodi);

    const inizio = performance.now();
    let ultimaScintilla = 0;
    function passo(ora) {
      if (volo.finito) { return; }
      const t = Math.min(1, (ora - inizio) / durata);
      const p = punto(t, via);
      const q = punto(Math.min(1, t + 0.01), via);
      posa(p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI);
      if (ora - ultimaScintilla > ogniScintilla) {
        ultimaScintilla = ora;
        scintilla(p.x, p.y, tipo);
      }
      if (t >= 1) { togli(volo); return; }
      requestAnimationFrame(passo);
    }
    const p0 = punto(0, via);
    const p1 = punto(0.01, via);
    posa(p0.x, p0.y, Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI);
    document.body.appendChild(nodo);
    requestAnimationFrame(passo);
    return volo;
  }

  function lancia() {
    if (occupato()) { return false; }
    if (festa.fermo && festa.fermo()) { return false; }
    const lato = Math.round(Math.max(110, Math.min(190, window.innerWidth * 0.1)));
    inVolo = vola({ tipo: 'pollo', lato: lato, durata: caso(3800, 5000) });
    return true;
  }

  function pioggia() {
    if (nascosto()) { return false; }
    if (festa.fermo && festa.fermo()) { return false; }
    const largo = window.innerWidth;
    const quante = Math.max(8, Math.min(16, Math.round(largo / 110)));
    const tipi = HALLOWEEN ? ['zucca', 'teschio', 'strega'] : ['pollo'];
    const base = Math.max(110, Math.min(190, largo * 0.1));
    const gruppo = { quante: quante, prese: 0 };
    const scelti = [];
    for (let i = 0; i < quante; i++) { scelti.push(tipi[i % tipi.length]); }
    scelti.sort(function () { return Math.random() - 0.5; });
    scelti.forEach(function (tipo, i) {
      setTimeout(function () {
        vola({ tipo: tipo, lato: Math.round(base * caso(0.55, 0.85)), durata: caso(3400, 5000), versi: [2, 3, 2, 3, 0, 1], gruppo: gruppo });
      }, i * 420 + caso(0, 260));
    });
    return true;
  }

  function quandoVisibile(fai) {
    if (!document.hidden) { fai(); return; }
    if (inAttesa) { return; }
    inAttesa = true;
    document.addEventListener('visibilitychange', function aspetta() {
      if (document.hidden) { return; }
      document.removeEventListener('visibilitychange', aspetta);
      inAttesa = false;
      setTimeout(fai, 1200);
    });
  }

  function programma() {
    clearTimeout(timerCaso);
    if (METEORA.timer !== true) { return; }
    const min = Number(METEORA.ogniMin) > 0 ? Number(METEORA.ogniMin) : 3;
    const max = Number(METEORA.ogniMax) >= min ? Number(METEORA.ogniMax) : min;
    timerCaso = setTimeout(function () {
      quandoVisibile(function () {
        if (!lancia()) {
          timerCaso = setTimeout(programma, 8000);
          return;
        }
        programma();
      });
    }, caso(min, max) * MINUTO);
  }

  function segnaVista(id) {
    ultimaVista = id;
    try { sessionStorage.setItem(CHIAVE_VISTA, id); } catch (e) { }
  }

  function controlla() {
    clearTimeout(timerControllo);
    if (document.hidden) { return; }
    fetch('/api/meteora?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (risposta) {
        if (risposta.status === 404) { fallimenti += 3; return null; }
        return risposta.ok ? risposta.json() : null;
      })
      .then(function (stato) {
        if (stato && typeof stato.id === 'string') {
          fallimenti = 0;
          if (stato.id && stato.id !== ultimaVista) {
            const eta = Date.parse(stato.adesso) - Date.parse(stato.inviataIl);
            segnaVista(stato.id);
            if (Number.isFinite(eta) && eta >= 0 && eta < VALIDA_PER) {
              const parti = stato.tipo === 'pioggia' ? pioggia : lancia;
              if (!parti()) { setTimeout(parti, 1500); }
            }
          }
        } else {
          fallimenti++;
        }
        riprogramma();
      })
      .catch(function () {
        fallimenti++;
        riprogramma();
      });
  }

  function riprogramma() {
    clearTimeout(timerControllo);
    if (fallimenti >= 9) { return; }
    timerControllo = setTimeout(controlla, OGNI_QUANTO * (fallimenti > 2 ? 4 : 1));
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { controlla(); }
  });

  window.PolloMeteora = { lancia: lancia, pioggia: pioggia };

  programma();
  controlla();
}());
