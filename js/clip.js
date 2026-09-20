/* =====================================================================
   clip.js — i quattro periodi della pagina delle clip

   Fa una cosa sola: quando si preme «24 ore», «3 giorni», «7 giorni» o
   «30 giorni», nasconde le clip che non ci stanno dentro e rimostra quelle
   che ci stanno. Tutto qui, e tutto in locale.

   PERCHÉ NON CHIEDE NIENTE A NESSUNO. Il sito è statico: online non c'è un
   programma che risponda alle domande di chi visita. E anche ci fosse, le
   chiavi di Twitch non devono arrivare nel browser — con quelle si parla a
   nome del canale, e una chiave dentro una pagina è una chiave regalata a
   chiunque apra il sorgente. Quindi le clip dei quattro periodi le ha già
   portate qui la pubblicazione (server/lib/twitch.js), ognuna con la sua
   data scritta in `data-quando`: qui si confronta quella data con l'ora di
   adesso, e si decide che cosa resta in pagina. Premere un bottone non
   scarica niente e non aspetta niente.

   L'ORA È QUELLA DI CHI GUARDA, e deve esserlo: «ultime 24 ore» vuol dire
   le ultime 24 ore adesso, non quelle del momento in cui il sito è stato
   pubblicato. Una pagina pubblicata tre giorni fa, aperta oggi, alla voce
   «24 ore» risponde onestamente che non c'è niente — invece di mostrare le
   clip di tre giorni fa fingendo che siano di stanotte. Le date sono
   assolute (ISO con la Z), quindi il conto torna anche da un altro fuso.

   SENZA DI ME la pagina resta intera: le card sono tutte stampate e
   visibili, e la barra dei periodi è `hidden` nel documento — la scopro io.
   Quattro bottoni che non fanno niente sarebbero peggio di nessun bottone.
   ===================================================================== */
(function () {
  'use strict';

  var ORA_MS = 60 * 60 * 1000;

  var barra = document.querySelector('[data-clip-periodi]');
  var elenco = document.querySelector('[data-clip-elenco]');
  if (!barra || !elenco) { return; }

  var bottoni = [].slice.call(barra.querySelectorAll('[data-ore]'));
  var vuoto = document.querySelector('[data-clip-vuoto]');
  var voci = [].slice.call(elenco.querySelectorAll('[data-quando]'));
  if (!bottoni.length || !voci.length) { return; }

  // Le date si leggono UNA volta sola, adesso, e non a ogni clic: sono
  // sempre le stesse, e un Date.parse per card per ogni bottone premuto è
  // lavoro rifatto. Una data illeggibile non deve far sparire la card in
  // silenzio: le si dà tempo zero, così sta in tutti i periodi e al massimo
  // si vede di troppo — che è il verso giusto in cui sbagliare.
  var schede = voci.map(function (voce) {
    var letta = Date.parse(voce.getAttribute('data-quando') || '');
    return { nodo: voce, quando: isNaN(letta) ? Date.now() : letta };
  });

  // Il tetto per periodo, scritto nel pannello e stampato nell'elenco. Se
  // manca o è storto non si mette nessun limite: meglio una pagina lunga di
  // una pagina che nasconde le clip senza motivo.
  var quante = parseInt(elenco.getAttribute('data-quante'), 10);
  if (!isFinite(quante) || quante < 1) { quante = schede.length; }

  /** Le ore del periodo acceso, lette dal bottone premuto. */
  function oreAccese() {
    for (var i = 0; i < bottoni.length; i++) {
      if (bottoni[i].getAttribute('aria-pressed') === 'true') {
        var ore = parseInt(bottoni[i].getAttribute('data-ore'), 10);
        if (isFinite(ore) && ore > 0) { return ore; }
      }
    }
    return 0;
  }

  /**
   * Mostra le clip del periodo e nasconde le altre.
   *
   * L'ordine non si tocca: le card sono già in pagina dalla più vista alla
   * meno vista (ci ha pensato la pubblicazione), quindi scorrerle in ordine
   * e fermarsi a `quante` vuol dire tenere le più viste del periodo, che è
   * esattamente quello che Twitch risponderebbe a quella domanda.
   */
  function applica(ore) {
    var limite = Date.now() - ore * ORA_MS;
    var mostrate = 0;

    for (var i = 0; i < schede.length; i++) {
      var dentro = schede[i].quando >= limite && mostrate < quante;
      // `hidden` e non una classe: una card nascosta così esce anche dalla
      // lettura di chi usa un lettore di schermo e dalla navigazione col
      // tabulatore, mentre `display:none` messo da una classe si dimentica
      // sempre in qualche foglio di stile.
      schede[i].nodo.hidden = !dentro;
      if (dentro) { mostrate++; }
    }

    if (vuoto) { vuoto.hidden = mostrate > 0; }
    return mostrate;
  }

  /** Accende un bottone e spegne gli altri, poi rifà il filtro. */
  function scegli(bottone) {
    for (var i = 0; i < bottoni.length; i++) {
      bottoni[i].setAttribute('aria-pressed', bottoni[i] === bottone ? 'true' : 'false');
    }
    applica(parseInt(bottone.getAttribute('data-ore'), 10) || 0);
  }

  for (var i = 0; i < bottoni.length; i++) {
    bottoni[i].addEventListener('click', function (evento) {
      scegli(evento.currentTarget);
    });
  }

  // Adesso che i bottoni funzionano, si possono far vedere.
  barra.hidden = false;

  // Il primo giro con il periodo che il documento dichiara acceso (il più
  // largo). Serve davvero: se la pagina è stata pubblicata giorni fa, anche
  // «30 giorni» ha delle card da nascondere, e senza questo si vedrebbero
  // clip più vecchie del periodo che il bottone dice di star mostrando.
  applica(oreAccese());
}());
