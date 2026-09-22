/* =====================================================================
   cima.js — il pulsante «GO TOP» del piede

   Compare SOLO quando il footer entra nello schermo, cioè quando la
   pagina è finita e l'unica cosa sensata da fare è tornare su. Sparisce
   appena si risale. Non c'è nessun handler su `scroll`: il lavoro lo fa
   un IntersectionObserver sul <footer class="piede">, stesso mestiere e
   stesso motivo per cui lo usa sito.js per le voci del binario — il
   browser calcola l'incrocio per conto suo, senza far girare codice a
   ogni pixel di rotella.

   TRE COSE VALGONO PER TUTTO IL FILE

   1. Il bottone non sta nel markup: lo costruisce questo file. Se il
      file non viene caricato, index.html resta quello di prima e non
      manca niente a nessuno. Se manca il footer, o manca
      IntersectionObserver, il blocco si disinnesca in silenzio: è una
      comodità, non può portarsi via la pagina.
   2. Nessuno stile si scrive qui. Il JS mette e toglie una sola classe,
      .is-visibile; il vestito è tutto in css/cima.css.
   3. Il testo va in pagina con textContent. Qui non arriva niente da
      fuori, ma la regola del progetto non si deroga per comodità.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Costanti
     ------------------------------------------------------------------
     SOGLIA: quanto footer deve essersi affacciato prima di accendere il
     bottone. A 0 si accenderebbe sul primo pixel, con un lampeggio
     fastidioso mentre si scorre piano; 0,15 vuol dire «il piede c'è
     davvero».
     GIOCO: sotto questi pixel di scorrimento siamo già in cima e il
     bottone non serve — succede sugli schermi alti, dove il footer si
     vede anche senza aver mai scrollato.
     ------------------------------------------------------------------ */
  var SOGLIA = 0.15;
  var GIOCO = 240;

  var ETICHETTA = 'GO TOP';
  var NOME = 'Torna in cima alla pagina';

  /* ------------------------------------------------------------------
     2. Il bottone
     ------------------------------------------------------------------
     Un <button type="button">: non è un link, non cambia indirizzo, non
     deve finire nella cronologia. La freccia è decorazione pura, quindi
     aria-hidden; il nome del comando lo danno il testo e l'aria-label,
     che serve perché sotto i 480px il testo è nascosto agli occhi.
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     3. La risalita
     ------------------------------------------------------------------
     Due mestieri separati, e vanno fatti tutti e due:

     · l'occhio torna su — con lo scorrimento morbido, tranne per chi ha
       chiesto meno movimento (la preferenza si rilegge a ogni clic: si
       può cambiare a pagina aperta);
     · il FUOCO torna su. Senza questa seconda metà, chi naviga col Tab
       premerebbe il bottone, vedrebbe la pagina in cima e poi col Tab
       successivo ripartirebbe dal footer. Si sposta il fuoco su <main>,
       reso raggiungibile con tabindex="-1" solo per il tempo necessario
       (stesso trucco dello skip link .salta).
     ------------------------------------------------------------------ */
  function ridotto() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function risali() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: ridotto() ? 'auto' : 'smooth' });
    } catch (err) {
      /* Firme vecchie di scrollTo: niente oggetto, niente morbido. */
      window.scrollTo(0, 0);
    }

    var meta = document.getElementById('contenuto') ||
               document.querySelector('main');
    if (!meta) { return; }

    var aveva = meta.hasAttribute('tabindex');
    if (!aveva) { meta.setAttribute('tabindex', '-1'); }

    try {
      /* preventScroll: il fuoco non deve trascinare la pagina e
         annullare lo scorrimento morbido appena partito. */
      meta.focus({ preventScroll: true });
    } catch (err) {
      meta.focus();
    }

    if (!aveva) {
      /* Il tabindex si toglie appena il fuoco se ne va: <main> non deve
         restare una tappa del Tab per il resto della visita. */
      meta.addEventListener('blur', function togli() {
        meta.removeAttribute('tabindex');
        meta.removeEventListener('blur', togli);
      });
    }
  }

  /* ------------------------------------------------------------------
     4. Avvio
     ------------------------------------------------------------------
     Ogni condizione che manca spegne il blocco prima di toccare il DOM.
     ------------------------------------------------------------------ */
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
        /* Sugli schermi molto alti il footer si vede senza aver mai
           scrollato: lì il bottone non avrebbe niente da fare. */
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
