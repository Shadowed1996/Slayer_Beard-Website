'use strict';

const TIPO_JSON = 'application/json; charset=utf-8';

function json(res, stato, corpo, intestazioni) {
  const buf = Buffer.from(JSON.stringify(corpo), 'utf8');
  const testa = Object.assign({
    'Content-Type': TIPO_JSON,
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, intestazioni || {});
  res.writeHead(stato, testa);
  if (res.req && res.req.method === 'HEAD') { res.end(); return; }
  res.end(buf);
}

function errore(res, stato, messaggio, extra) {
  json(res, stato, Object.assign({ errore: messaggio }, extra || {}));
}

function testo(res, stato, contenuto, tipo) {
  const buf = Buffer.from(contenuto, 'utf8');
  res.writeHead(stato, {
    'Content-Type': tipo || 'text/html; charset=utf-8',
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  if (res.req && res.req.method === 'HEAD') { res.end(); return; }
  res.end(buf);
}

function erroreHttp(stato, messaggio, extra) {
  const e = new Error(messaggio);
  e.stato = stato;
  if (extra) { Object.assign(e, extra); }
  return e;
}

module.exports = { json, errore, testo, erroreHttp, TIPO_JSON };
