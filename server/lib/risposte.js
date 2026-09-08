'use strict';
/* =====================================================================
   risposte.js — un solo posto in cui si decide la forma delle risposte.

   Regola del contratto (§8): tutto JSON tranne i file statici e l'anteprima,
   e ogni errore e `{ errore: "messaggio in italiano" }` con lo stato HTTP
   giusto. Chi vuole aggiungere dettagli (l'elenco degli errori di convalida,
   per esempio) passa `extra`.
   ===================================================================== */

const TIPO_JSON = 'application/json; charset=utf-8';

/** Risposta JSON. */
function json(res, stato, corpo, intestazioni) {
  const buf = Buffer.from(JSON.stringify(corpo), 'utf8');
  const testa = Object.assign({
    'Content-Type': TIPO_JSON,
    'Content-Length': String(buf.length),
    // Il pannello non deve mai vedere una risposta API vecchia.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, intestazioni || {});
  res.writeHead(stato, testa);
  if (res.req && res.req.method === 'HEAD') { res.end(); return; }
  res.end(buf);
}

/** Risposta di errore, sempre nella stessa forma. */
function errore(res, stato, messaggio, extra) {
  json(res, stato, Object.assign({ errore: messaggio }, extra || {}));
}

/** Risposta non JSON: serve all'anteprima HTML. */
function testo(res, stato, contenuto, tipo) {
  const buf = Buffer.from(contenuto, 'utf8');
  res.writeHead(stato, {
    'Content-Type': tipo || 'text/html; charset=utf-8',
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store'
  });
  if (res.req && res.req.method === 'HEAD') { res.end(); return; }
  res.end(buf);
}

/**
 * Errore con stato HTTP attaccato: i moduli lo lanciano, il router lo
 * traduce in risposta senza dover conoscere il caso per caso.
 */
function erroreHttp(stato, messaggio, extra) {
  const e = new Error(messaggio);
  e.stato = stato;
  if (extra) { Object.assign(e, extra); }
  return e;
}

module.exports = { json, errore, testo, erroreHttp, TIPO_JSON };
