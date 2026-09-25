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

  let inVolo = null;
  let timerCaso = null;
  let timerControllo = null;
  let fallimenti = 0;
  let inAttesa = false;
  let ultimaVista = '';
  try { ultimaVista = sessionStorage.getItem(CHIAVE_VISTA) || ''; } catch (e) { ultimaVista = ''; }

  function caso(min, max) { return min + Math.random() * (max - min); }

  function occupato() {
    return !!(inVolo || document.hidden || document.querySelector('.pollo-gif.is-aperto'));
  }

  function suona() {
    if (!SUONI.length || typeof window.Audio !== 'function') { return; }
    let scelta = Math.floor(Math.random() * SUONI.length);
    if (SUONI.length > 1 && scelta === ultimoSuono) { scelta = (scelta + 1 + Math.floor(Math.random() * (SUONI.length - 1))) % SUONI.length; }
    ultimoSuono = scelta;
    try {
      const audio = new Audio(SUONI[scelta]);
      audio.volume = 0.7;
      const promessa = audio.play();
      if (promessa && typeof promessa.catch === 'function') { promessa.catch(function () { }); }
    } catch (e) { }
  }

  function traiettoria(largo, alto, lato) {
    const fuori = lato * 2.2;
    const verso = Math.floor(Math.random() * 4);
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

  function scintilla(x, y) {
    const s = document.createElement('span');
    s.className = 'meteora__scintilla';
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

  function lancia() {
    if (occupato()) { return false; }
    if (festa.fermo && festa.fermo()) { return false; }
    const largo = window.innerWidth;
    const alto = window.innerHeight;
    const lato = Math.round(Math.max(110, Math.min(190, largo * 0.1)));
    const via = traiettoria(largo, alto, lato);
    const durata = caso(3800, 5000);

    const nodo = document.createElement('button');
    nodo.type = 'button';
    nodo.className = 'meteora';
    nodo.setAttribute('aria-label', 'Prendi il polletto al volo!');
    nodo.style.setProperty('--meteora-lato', lato + 'px');
    const coda = document.createElement('span');
    coda.className = 'meteora__coda';
    const alone = document.createElement('span');
    alone.className = 'meteora__alone';
    const img = document.createElement('img');
    img.className = 'meteora__icona';
    img.src = ICONA;
    img.alt = '';
    img.draggable = false;
    nodo.appendChild(coda);
    nodo.appendChild(alone);
    nodo.appendChild(img);

    const volo = { nodo: nodo, finito: false, x: via.a.x, y: via.a.y };
    inVolo = volo;

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
      try { festa.esplodi(x, y); } catch (e) { }
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
      if (ora - ultimaScintilla > 45) {
        ultimaScintilla = ora;
        scintilla(p.x, p.y);
      }
      if (t >= 1) { togli(volo); return; }
      requestAnimationFrame(passo);
    }
    const p0 = punto(0, via);
    const p1 = punto(0.01, via);
    posa(p0.x, p0.y, Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI);
    document.body.appendChild(nodo);
    requestAnimationFrame(passo);
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
    if (typeof window.fetch !== 'function') { return; }
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
              if (!lancia()) { setTimeout(lancia, 1500); }
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

  window.PolloMeteora = { lancia: lancia };

  programma();
  controlla();
}());
