'use strict';

const path = require('node:path');

const { P } = require('./lib/percorsi');
const costruisci = require('./lib/costruisci');
const chiavi = require('./lib/chiavi');
const twitch = require('./lib/twitch');
const youtube = require('./lib/youtube');
const giochi = require('./lib/giochi');

const ROBOTS = {
  'aggiornato': 'riga Sitemap: aggiunta in fondo a robots.txt',
  'gia a posto': 'robots.txt aveva gia la riga Sitemap: giusta',
  'non c\'e': 'robots.txt non c\'e: la riga Sitemap: va aggiunta a mano quando ci sara',
  'non scritto': 'robots.txt non si e potuto scrivere: la riga Sitemap: va aggiunta a mano',
  'non provato': 'robots.txt non toccato'
};

function byteLeggibili(n) {
  if (n < 1024) { return n + ' B'; }
  if (n < 1024 * 1024) { return (n / 1024).toFixed(1) + ' kB'; }
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function esegui() {
  console.log('');
  console.log('  Generazione del sito');
  console.log('  radice: ' + P.radice);
  console.log('');

  const daChiavi = chiavi.sincronizzaClientId();
  if (chiavi.racconta(daChiavi)) { console.log('  ' + chiavi.racconta(daChiavi)); }

  const daTwitch = await twitch.aggiornaUltimaDiretta();
  if (daTwitch.stato !== 'spento') { console.log('  ' + twitch.racconta(daTwitch)); }
  const iFollower = await twitch.aggiornaFollower();
  if (iFollower.stato !== 'spento') { console.log('  ' + twitch.raccontaFollower(iFollower)); }
  const leClip = await twitch.aggiornaClip();
  if (leClip.stato !== 'spento') { console.log('  ' + twitch.raccontaClip(leClip)); }
  const iNumeri = await twitch.aggiornaNumeri();
  if (iNumeri.stato !== 'spento') { console.log('  ' + twitch.raccontaNumeri(iNumeri)); }

  const laCategoria = await twitch.aggiornaCategoria();
  if (laCategoria.stato !== 'spento') { console.log('  ' + twitch.raccontaCategoria(laCategoria)); }

  const gliIscritti = await youtube.aggiornaIscritti();
  if (youtube.racconta(gliIscritti)) { console.log('  ' + youtube.racconta(gliIscritti)); }
  const iGiochi = await giochi.aggiornaGiochi();
  if (iGiochi.stato !== 'spento') { console.log('  ' + giochi.raccontaGiochi(iGiochi)); }
  if (daTwitch.stato !== 'spento' || leClip.stato !== 'spento' || iNumeri.stato !== 'spento' || chiavi.racconta(daChiavi) ||
      youtube.racconta(gliIscritti) || iGiochi.stato !== 'spento') { console.log(''); }

  const esito = costruisci.genera();

  for (const scritto of esito.scritti) {
    console.log('  scritto   ' + scritto.file.padEnd(14) + byteLeggibili(scritto.byte));
  }

  const pagina = esito.paginaClip;
  if (pagina && pagina.stato === 'scritta') {
    console.log('  scritto   ' + pagina.file.padEnd(14) + byteLeggibili(pagina.byte));
  } else if (pagina && pagina.stato === 'tolta') {
    console.log('  tolta     clip.html: le clip sono spente o non ce n e nessuna');
  } else if (pagina && pagina.stato === 'non tolta') {
    console.log('  clip.html non si e potuta togliere (' + pagina.errore + '): va cancellata a mano');
  }

  const sponsor = esito.paginaSponsor;
  if (sponsor && sponsor.stato === 'scritta') {
    console.log('  scritto   ' + sponsor.file.padEnd(14) + byteLeggibili(sponsor.byte) +
      '   ' + esito.sponsor + (esito.sponsor === 1 ? ' sponsor' : ' sponsor'));
  } else if (sponsor && sponsor.stato === 'tolta') {
    console.log('  tolta     sponsor.html: gli sponsor sono spenti, oppure nessuno e nel suo periodo');
  } else if (sponsor && sponsor.stato === 'non tolta') {
    console.log('  sponsor.html non si e potuta togliere (' + sponsor.errore + '): va cancellata a mano');
  }

  const paginaGiochi = esito.paginaGiochi;
  if (paginaGiochi && paginaGiochi.stato === 'scritta') {
    console.log('  scritto   ' + paginaGiochi.file.padEnd(14) + byteLeggibili(paginaGiochi.byte));
  } else if (paginaGiochi && paginaGiochi.stato === 'tolta') {
    console.log('  tolta     giochi.html: la pagina dei giochi e spenta o vuota');
  } else if (paginaGiochi && paginaGiochi.stato === 'non tolta') {
    console.log('  giochi.html non si e potuta togliere (' + paginaGiochi.errore + '): va cancellata a mano');
  }

  const mappa = esito.sitemap;
  if (mappa && mappa.byte) {
    console.log('  scritto   ' + mappa.file.padEnd(14) + byteLeggibili(mappa.byte) + '   ' + mappa.indirizzo);
    console.log('  robots    ' + (ROBOTS[mappa.robots] || mappa.robots));
  } else if (mappa) {
    console.log('  sitemap   non scritta: ' + mappa.errore);
  } else {
    console.log('  sitemap   niente: manca l indirizzo pubblico (campo del pannello o SB_SITO)');
  }

  const stato = esito.statoSito;
  if (stato && stato.byte) {
    console.log('  scritto   ' + stato.file + '  ' + byteLeggibili(stato.byte) + '   manutenzione: ' + (stato.manutenzione ? 'si' : 'no'));
  } else if (stato) {
    console.log('  ' + stato.file + ' non scritto (' + stato.errore + '): le pagine gia aperte non se ne accorgono');
  }

  if (esito.manutenzione && esito.manutenzione.attiva) {
    console.log('  manutenzione ' + esito.manutenzione.pagine.join(' e ') +
      ' sono la pagina di manutenzione: per riaprire il sito spegni la modalita e ripubblica');
  }
  console.log('  backup    ' + esito.backup);
  console.log('  elenchi   ' + esito.social + ' social, ' + esito.supporto + ' righe di supporto (le voci senza link restano fuori)');
  console.log('');
  console.log('  Fatto in ' + esito.durataMs + ' ms. index.html, js/dati.js e css/tema.css');
  console.log('  sono pronti da pubblicare.');

  if (Array.isArray(esito.controlli) && esito.controlli.length) {
    console.log('');
    console.log('  Da guardare prima di mandarlo online:');
    for (const avvertimento of esito.controlli) {
      console.log('    - ' + avvertimento.chiave);
      console.log('      ' + avvertimento.messaggio);
    }
  }
  console.log('');
}

function racconta(err) {
  console.error('');
  console.error('  GENERAZIONE FALLITA');
  console.error('  ' + (err && err.message ? err.message : String(err)));

  if (err && Array.isArray(err.errori)) {
    console.error('');
    for (const e of err.errori) { console.error('    - ' + e.chiave + ': ' + e.messaggio); }
    console.error('');
    console.error('  Correggi i contenuti (dal pannello o in contenuti/contenuti.json) e riprova.');
  }
  if (err && Array.isArray(err.problemi)) {
    console.error('');
    for (const p of err.problemi) { console.error('    - ' + p.messaggio); }
    console.error('');
    console.error('  Sistema contenuti/schema.js: deve descrivere tutte le chiavi, e solo quelle che esistono.');
  }

  if (err && err.name === 'ErroreModello') {
    console.error('');
    console.error('  Il problema e nel modello, alla riga indicata qui sopra.');
  }
  console.error('');
}

if (require.main === module) {
  esegui().catch((err) => {
    racconta(err);
    process.exit(1);
  });
}

module.exports = { esegui };
