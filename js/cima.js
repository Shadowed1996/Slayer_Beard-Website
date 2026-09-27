(function () {
  'use strict';

  var SOGLIA = 0.15;
  var GIOCO = 240;

  var ETICHETTA = 'GO TOP';
  var NOME = 'Torna in cima alla pagina';

  function costruisci() {
    var bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'cima';
    bottone.setAttribute('aria-label', NOME);

    var freccia = document.createElement('span');
    freccia.className = 'cima__freccia';
    freccia.setAttribute('aria-hidden', 'true');

    var testo = document.createElement('span');
    testo.className = 'cima__testo';
    testo.textContent = ETICHETTA;

    bottone.appendChild(freccia);
    bottone.appendChild(testo);
    return bottone;
  }

  function ridotto() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function risali() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: ridotto() ? 'auto' : 'smooth' });
    } catch (err) {
      window.scrollTo(0, 0);
    }

    var meta = document.getElementById('contenuto') ||
               document.querySelector('main');
    if (!meta) { return; }

    var aveva = meta.hasAttribute('tabindex');
    if (!aveva) { meta.setAttribute('tabindex', '-1'); }

    try {
      meta.focus({ preventScroll: true });
    } catch (err) {
      meta.focus();
    }

    if (!aveva) {
      meta.addEventListener('blur', function togli() {
        meta.removeAttribute('tabindex');
        meta.removeEventListener('blur', togli);
      });
    }
  }

  function avvia() {
    var piede = document.querySelector('footer.piede') ||
                document.querySelector('footer');
    if (!piede || typeof IntersectionObserver !== 'function') { return; }

    var bottone = costruisci();
    document.body.appendChild(bottone);

    bottone.addEventListener('click', risali);

    var osservatore = new IntersectionObserver(function (voci) {
      for (var i = 0; i < voci.length; i++) {
        var dentro = voci[i].isIntersecting &&
                     voci[i].intersectionRatio >= SOGLIA;
        var vale = dentro && (window.pageYOffset || document.documentElement.scrollTop || 0) > GIOCO;
        bottone.classList.toggle('is-visibile', vale);
      }
    }, { threshold: [0, SOGLIA, 0.5] });

    osservatore.observe(piede);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }
}());
