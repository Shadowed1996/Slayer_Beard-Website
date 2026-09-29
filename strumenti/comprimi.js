'use strict';

const fs = require('node:fs');
const path = require('node:path');

let esbuild;
try {
  esbuild = require(process.env.SB_ESBUILD || 'esbuild');
} catch (e) {
  console.error('Manca esbuild: npm i --no-save esbuild, oppure SB_ESBUILD=percorso/di/esbuild');
  process.exit(1);
}

const [destinazione, ...file] = process.argv.slice(2);
if (!destinazione || !file.length) {
  console.error('Uso: node strumenti/comprimi.js <cartella di uscita> <file.js|file.css> ...');
  process.exit(1);
}

let prima = 0;
let dopo = 0;
for (const f of file) {
  const sorgente = fs.readFileSync(f, 'utf8');
  const css = f.endsWith('.css');
  const esito = esbuild.transformSync(sorgente, {
    loader: css ? 'css' : 'js',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    target: css ? ['chrome105', 'firefox110', 'safari16'] : 'es2017'
  });
  const uscita = path.join(destinazione, f);
  fs.mkdirSync(path.dirname(uscita), { recursive: true });
  fs.writeFileSync(uscita, esito.code);
  prima += Buffer.byteLength(sorgente);
  dopo += Buffer.byteLength(esito.code);
}
console.log(file.length + ' file, da ' + Math.round(prima / 1024) + ' KB a ' + Math.round(dopo / 1024) + ' KB');
