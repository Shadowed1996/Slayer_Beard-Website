(function () {
  'use strict';
  var box = document.getElementById('mnt-conto');
  if (!box) { return; }
  var fine = Date.parse(box.getAttribute('data-fine'));
  var ore = document.getElementById('mnt-ore');
  var min = document.getElementById('mnt-min');
  var sec = document.getElementById('mnt-sec');
  var etichetta = document.getElementById('mnt-conto-etichetta');
  var ultimoRicarico = Date.now();
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function aggiorna() {
    var resto = Math.max(0, Math.floor((fine - Date.now()) / 1000));
    ore.textContent = due(Math.floor(resto / 3600));
    min.textContent = due(Math.floor((resto % 3600) / 60));
    sec.textContent = due(resto % 60);
    if (resto > 0) { return; }
    if (!box.classList.contains('is-finito')) {
      box.classList.add('is-finito');
      etichetta.textContent = box.getAttribute('data-finito');
    }
    if (!document.hidden && Date.now() - ultimoRicarico > 30000) {
      ultimoRicarico = Date.now();
      location.reload();
    }
  }
  aggiorna();
  setInterval(aggiorna, 1000);
}());
