(function () {
  'use strict';

  var madre = null;
  try { madre = window.opener; } catch (err) { madre = null; }
  if (!madre || madre === window) { return; }

  var grezzo = location.hash ? location.hash.slice(1) : '';
  if (!grezzo || (grezzo.indexOf('access_token=') === -1 && grezzo.indexOf('error=') === -1)) { return; }

  var p = {};
  grezzo.split('&').forEach(function (pezzo) {
    var uguale = pezzo.indexOf('=');
    if (uguale <= 0) { return; }
    try {
      p[decodeURIComponent(pezzo.slice(0, uguale))] = decodeURIComponent(pezzo.slice(uguale + 1).replace(/\+/g, ' '));
    } catch (err) { }
  });

  var dati = {
    tipo: 'sb-account-ritorno',
    state: p.state || '',
    access_token: p.access_token || '',
    error: p.error || ''
  };

  try { history.replaceState(null, '', location.pathname + location.search); } catch (err) { }

  try { madre.postMessage(dati, location.origin); } catch (err) { }

  try {
    if (typeof BroadcastChannel === 'function') {
      var canale = new BroadcastChannel('sb-account');
      canale.postMessage(dati);
      canale.close();
    }
  } catch (err) { }

  try { window.close(); } catch (err) { }
}());
