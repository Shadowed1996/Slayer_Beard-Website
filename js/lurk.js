(function () {
  'use strict';

  const DATI = window.DATI || {};
  const LURK = DATI.lurk || null;
  const TWITCH = DATI.twitch || {};
  const MESSAGGIO = (LURK && LURK.messaggio) || {};
  const PROFILO = DATI.account || {};

  const BROADCASTER = String(TWITCH.idUtente || '').trim();

  const DIRETTA_CONDIVISA = TWITCH.direttaCondivisa === true;
  const ETICHETTA_CONDIVISA = '[LURKO DA SLAYER_BEARD] ';

  const CHIAVE_ACCESO = 'sb-lurk-acceso';

  const CHIAVE_SOSPESO = 'sb-lurk-sospeso';

  const SENTINELLA = 20000;
  const BATTITO = 1000;
  const BUFFERING_MAX = 3;
  const FERMI_MAX = 2;
  const SESSIONE_BUONA = 60000;
  const ATTESE = [5000, 15000, 45000, 120000];

  const ATTESA_PRESENZA = 300000;
  const DURATA_AVVISO = 7000;

  const FRENO_INVIO = 60000;

  const MINUTI_INVIO = (function () {
    const m = Number(MESSAGGIO.minuti);
    return isFinite(m) ? Math.min(120, Math.max(2, Math.round(m))) : 10;
  }());
  const CADENZA_INVIO = MINUTI_INVIO * 60000;
  const RIPROVA_INVIO = 60000;

  const TESTI = {};
  const RIPIEGHI = {
    accendi: 'Attiva la modalità lurk',
    spegni: 'Disattiva',
    audio: 'Togli il muto',
    schermo: 'Tieni acceso lo schermo',
    ripresa: 'L’avevi lasciata accesa: la riattivo?',
    ciSei: 'Ci sei ancora? Senza risposta spengo la modalità lurk.',
    ciSono: 'Sono qui',
    statoSpento: 'Spenta.',
    statoVivo: 'Attiva: il video sta andando.',
    statoFermo: 'Il video si è fermato.',
    statoRiparto: 'Rimetto in moto il video…',
    statoBloccato: 'Il browser ha bloccato la riproduzione: tocca il player.',
    statoAttesa: 'Il canale è fuori onda: non c’è niente da tenere vivo.',
    chiuso: 'Il canale è andato fuori onda: ho spento la modalità lurk.',
    manutenzione: 'Il sito va in manutenzione: ho spento la modalità lurk.',
    statoResa: 'Non ci riesco più. Ricarica la pagina.',
    statoNiente: 'Da qui non posso: non ho i comandi del player.',
    conto: 'Viva da {durata}',
    contoRiavvii: 'Viva da {durata} · {riavvii} riavvii',
    preavviso: 'Col lurk attivo dirò in chat, ogni {minuti} minuti, frasi come: «{frase}»',
    invito: 'Vuoi dire in chat che stai guardando? Ogni {minuti} minuti dirò frasi come: «{frase}»',
    manda: 'Dillo in chat',
    inviato: 'Fatto: il messaggio è in chat.'
  };

  const TESTO_DI = {
    spento: 'statoSpento',
    vivo: 'statoVivo',
    fermo: 'statoFermo',
    riparto: 'statoRiparto',
    bloccato: 'statoBloccato',
    attesa: 'statoAttesa',
    resa: 'statoResa',
    niente: 'statoNiente'
  };

  const MOTIVI = {
    msg_duplicate: 'Twitch blocca due messaggi identici di fila: prova con un’altra frase.',
    msg_followers_only: 'La chat accetta solo chi segue il canale da un po’: segui il canale e riprova.',
    msg_subs_only: 'La chat è riservata agli abbonati del canale.',
    msg_slowmode: 'La chat è in modalità lenta: aspetta qualche secondo e riprova.',
    msg_rejected: 'AutoMod ha messo il messaggio in attesa di un moderatore: potrebbe comparire più tardi.',
    msg_rejected_mandatory: 'AutoMod ha bloccato il messaggio prima che arrivasse in chat.',
    msg_channel_suspended: 'Il canale è sospeso: la chat non accetta messaggi.',
    msg_banned: 'Il tuo account non può scrivere in questa chat.',
    msg_verified_email: 'Questa chat richiede un indirizzo email verificato sul tuo account Twitch.',
    msg_requires_verified_phone_number: 'Questa chat richiede un numero di telefono verificato sul tuo account Twitch.',
    msg_emoteonly: 'La chat accetta solo emote in questo momento.',
    msg_r9k: 'La chat rifiuta i messaggi già visti: prova con un’altra frase.',
    msg_channel_blocked_term: 'Il canale ha bloccato una delle parole del messaggio.'
  };

  const nodi = {};
  const comandi = {};
  const iscritti = [];

  const vivo = {
    acceso: false,
    salute: 'spento',
    riavvii: 0,
    daQuando: 0,
    collegato: false,
    nome: '',
    avatar: '',
    inviati: 0
  };

  let inOnda = false;
  let inManutenzione = false;
  let sospeso = false;
  let vivoDa = 0;

  let timerSentinella = null;
  let timerBattito = null;
  let timerRiavvio = null;
  let timerAvviso = null;

  let buffering = 0;
  let fermi = 0;
  let ultimoTempo = null;
  let tentativo = 0;
  let inRiavvio = false;

  let vuoleSchermo = false;
  let presaSchermo = null;

  let chiestoPresenza = 0;
  let ultimaPresenza = 0;

  let ultimaFrase = '';
  let fraseProssima = '';
  let ultimoInvio = 0;
  let ultimoAutomatico = 0;
  let invioAutomatico = false;
  let erroreInvio = '';
  let mazzo = [];
  let inVolo = false;

  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  function crea(tag, classe, contenuto) {
    const n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (contenuto != null) { n.textContent = contenuto; }
    return n;
  }

  function bottone(etichetta, classe, quando) {
    const b = crea('button', classe, etichetta);
    b.type = 'button';
    b.addEventListener('click', quando);
    return b;
  }

  function daLocale(chiave) {
    try { return localStorage.getItem(chiave); } catch (err) { return null; }
  }

  function inLocale(chiave, valore) {
    try { localStorage.setItem(chiave, valore); } catch (err) {}
  }

  function daSessione(chiave) {
    try { return sessionStorage.getItem(chiave); } catch (err) { return null; }
  }

  function inSessione(chiave, valore) {
    try { sessionStorage.setItem(chiave, valore); } catch (err) {}
  }

  function scordaSessione(chiave) {
    try { sessionStorage.removeItem(chiave); } catch (err) {}
  }

  function durata(ms) {
    const totale = Math.max(0, Math.floor(ms / 1000));
    const ore = Math.floor(totale / 3600);
    const minuti = Math.floor((totale % 3600) / 60);
    if (ore > 0) { return ore + 'h ' + minuti + 'm'; }
    if (minuti > 0) { return minuti + 'm'; }
    return (totale % 60) + 's';
  }

  function testo(nome) {
    return TESTI[nome] || '';
  }

  function player(metodo) {
    const P = window.Player;
    return (P && typeof P[metodo] === 'function') ? P : null;
  }

  function diagnostica() {
    const P = player('diagnostica');
    if (!P) { return null; }
    try { return P.diagnostica(); } catch (err) { return null; }
  }

  function comandiPronti() {
    const d = diagnostica();
    return !!(d && d.modalita === 'sdk' && player('riparti'));
  }

  function account() {
    const A = window.Account;
    return (A && A.attivo === true) ? A : null;
  }

  function preparaStato() {
    if (!nodi.stato) { return; }
    nodi.stato.textContent = '';

    const spia = crea('span', 'lurk__spia');
    spia.setAttribute('aria-hidden', 'true');
    nodi.stato.appendChild(spia);

    nodi.statoTesto = crea('span', '', '');
    nodi.stato.appendChild(nodi.statoTesto);
  }

  function scriviStato() {
    if (!nodi.statoTesto) { return; }

    if (chiestoPresenza) { nodi.statoTesto.textContent = testo('ciSei'); return; }

    if (vivo.salute === 'spento' && comandiPronti() && !canaleAcceso()) {
      nodi.statoTesto.textContent = testo('statoAttesa');
      return;
    }

    nodi.statoTesto.textContent = testo(TESTO_DI[vivo.salute] || 'statoSpento');
  }

  function avviso(messaggio) {
    if (!nodi.statoTesto || !messaggio) { return; }
    nodi.statoTesto.textContent = messaggio;
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(function () {
      timerAvviso = null;
      scriviStato();
    }, DURATA_AVVISO);
  }

  function segnaSalute(nome) {
    if (vivo.salute === nome) { return; }
    vivo.salute = nome;
    if (nome === 'vivo') { vivoDa = Date.now(); }
    if (nodi.lurk) { nodi.lurk.setAttribute('data-salute', nome); }

    if (!timerAvviso) { scriviStato(); }
    avvisa();
  }

  function aggiornaConto() {
    if (!nodi.conto) { return; }
    if (!vivo.acceso) { nodi.conto.textContent = ''; return; }

    const modello = vivo.riavvii > 0 ? testo('contoRiavvii') : testo('conto');
    let riga = modello
      .replace(/\{durata\}/g, durata(Date.now() - vivo.daQuando))
      .replace(/\{riavvii\}/g, String(vivo.riavvii));

    if (ultimoAutomatico && vivo.collegato) {
      const manca = CADENZA_INVIO - (Date.now() - ultimoAutomatico);
      riga += ' · prossimo messaggio in chat fra ' + durata(Math.max(0, manca));
      if (erroreInvio) { riga += ' · l’ultimo non è partito: ' + erroreInvio; }
    }
    nodi.conto.textContent = riga;
  }

  function istantanea() {
    return {
      acceso: vivo.acceso,
      salute: vivo.salute,
      riavvii: vivo.riavvii,
      daQuando: vivo.daQuando,
      collegato: vivo.collegato,
      nome: vivo.nome,
      avatar: vivo.avatar,
      inviati: vivo.inviati
    };
  }

  function informa(fn) {
    try {
      fn(istantanea());
    } catch (err) {
      console.warn('[lurk] un iscritto a suStato è andato in errore:', err);
    }
  }

  function avvisa() { iscritti.forEach(informa); }

  function azzeraAllarmi() {
    buffering = 0;
    fermi = 0;
    ultimoTempo = null;
  }

  function ciclo() {
    if (!vivo.acceso) { return; }
    if (document.visibilityState !== 'visible') { return; }

    const d = diagnostica();

    if (!d || d.modalita !== 'sdk') {
      segnaSalute('niente');
      fermaSentinella();
      return;
    }

    if (d.bloccato) {
      azzeraAllarmi();
      segnaSalute('bloccato');
      return;
    }

    if (fuoriOndaCerto()) { chiudiPerFineDiretta(); return; }

    if (!inOnda) {
      azzeraAllarmi();
      segnaSalute('attesa');
      return;
    }

    if (d.riproduce) {

      buffering = (d.playback === 'Buffering') ? buffering + 1 : 0;

      if (typeof d.tempo === 'number') {
        if (ultimoTempo !== null && d.tempo <= ultimoTempo) { fermi++; } else { fermi = 0; }
        ultimoTempo = d.tempo;
      } else {

        fermi = 0;
        ultimoTempo = null;
      }

      if (buffering >= BUFFERING_MAX || fermi >= FERMI_MAX) { concludiFermo(); return; }

      if (timerRiavvio || inRiavvio) { return; }

      segnaSalute('vivo');

      if (vivoDa && (Date.now() - vivoDa) > SESSIONE_BUONA) { tentativo = 0; }
      return;
    }

    if (d.fermo) { concludiFermo(); return; }

  }

  function concludiFermo() {
    azzeraAllarmi();
    segnaSalute('fermo');
    programmaRiavvio();
  }

  function avviaSentinella() {
    fermaSentinella();
    timerSentinella = setInterval(ciclo, SENTINELLA);
  }

  function fermaSentinella() {
    if (timerSentinella) { clearInterval(timerSentinella); timerSentinella = null; }
  }

  function livelloDi(indice) {
    if (indice <= 0) { return 1; }
    if (indice === 1) { return 2; }
    return 3;
  }

  function programmaRiavvio() {
    if (timerRiavvio || inRiavvio || !vivo.acceso) { return; }

    if (tentativo >= ATTESE.length) {
      segnaSalute('resa');
      fermaSentinella();
      return;
    }

    timerRiavvio = setTimeout(provaRiavvio, ATTESE[tentativo]);
  }

  function provaRiavvio() {
    timerRiavvio = null;
    if (!vivo.acceso) { return; }

    const P = player('riparti');
    if (!P) { segnaSalute('niente'); fermaSentinella(); return; }

    inRiavvio = true;
    segnaSalute('riparto');

    let promessa;
    try {
      promessa = P.riparti(livelloDi(tentativo));
    } catch (err) {
      console.warn('[lurk] riparti() ha lanciato:', err);
      inRiavvio = false;
      return;
    }

    Promise.resolve(promessa).then(esitoRiavvio, function (err) {
      console.warn('[lurk] riparti() ha rifiutato:', err);
      inRiavvio = false;
    });
  }

  function esitoRiavvio(esito) {
    inRiavvio = false;
    if (!vivo.acceso) { return; }

    if (esito === 'ripartito') {
      vivo.riavvii++;
      tentativo++;
      aggiornaConto();
      avvisa();

      return;
    }

    if (esito === 'impossibile') {
      segnaSalute('resa');
      fermaSentinella();
      return;
    }

  }

  function accendi() {
    if (vivo.acceso) { return; }

    if (inManutenzione) { avviso(testo('manutenzione')); return; }

    const d = diagnostica();
    if (!d || d.modalita !== 'sdk' || !player('riparti')) {
      segnaSalute('niente');
      return;
    }

    if (!canaleAcceso()) {
      segnaSalute('spento');
      avviso(testo('statoAttesa'));
      dipingiComandi();
      return;
    }

    vivo.acceso = true;
    vivo.riavvii = 0;
    vivo.daQuando = Date.now();
    ultimaPresenza = Date.now();
    chiestoPresenza = 0;
    tentativo = 0;
    azzeraAllarmi();

    inLocale(CHIAVE_ACCESO, '1');
    dipingiComandi();

    dipingiAccesso();
    if (nodi.lurk) { nodi.lurk.classList.add('is-acceso'); }

    avviaSentinella();
    if (!timerBattito) { timerBattito = setInterval(battito, BATTITO); }

    if (d.bloccato) { segnaSalute('bloccato'); }
    else if (!inOnda) { segnaSalute('attesa'); }
    else if (d.riproduce) { segnaSalute('vivo'); }
    else { segnaSalute('fermo'); }

    ciclo();
    aggiornaConto();
    avvisa();

    if (bAttivo() && vivo.collegato) { mandaOra(); }
  }

  function chiudiPerFineDiretta() {
    if (!vivo.acceso) { return; }
    const ricordo = daLocale(CHIAVE_ACCESO);
    spegni();
    if (ricordo === '1') { inLocale(CHIAVE_ACCESO, '1'); }
    segnaSalute('attesa');
    avviso(testo('chiuso'));
  }

  function chiudiPerManutenzione() {
    if (inManutenzione) { return; }
    inManutenzione = true;
    if (!vivo.acceso) { return; }
    const ricordo = daLocale(CHIAVE_ACCESO);
    spegni();
    if (ricordo === '1') { inLocale(CHIAVE_ACCESO, '1'); }
    inSessione(CHIAVE_SOSPESO, '1');
    sospeso = true;
    segnaSalute('attesa');
    avviso(testo('manutenzione'));
  }

  function tentaRipresa() {
    if (!sospeso || inManutenzione) { return; }
    if (vivo.acceso) { dimenticaRipresa(); return; }

    if (!comandiPronti()) { return; }
    if (!canaleAcceso()) { return; }

    dimenticaRipresa();
    accendi();
  }

  function dimenticaRipresa() {
    sospeso = false;
    scordaSessione(CHIAVE_SOSPESO);
  }

  function spegni() {
    dimenticaRipresa();
    fermaSentinella();
    clearTimeout(timerRiavvio);
    timerRiavvio = null;
    if (timerBattito) { clearInterval(timerBattito); timerBattito = null; }

    vivo.acceso = false;
    vivo.daQuando = 0;
    ultimoAutomatico = 0;
    chiestoPresenza = 0;
    tentativo = 0;
    azzeraAllarmi();
    lasciaSchermo();

    inLocale(CHIAVE_ACCESO, '0');
    if (nodi.lurk) { nodi.lurk.classList.remove('is-acceso'); }
    togliBottonePresenza();
    dipingiComandi();

    dipingiAccesso();
    aggiornaConto();
    segnaSalute('spento');
    avvisa();
  }

  function commuta() {
    if (vivo.acceso) { spegni(); } else { accendi(); }
  }

  function schermoDisponibile() {
    return !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function');
  }

  function chiediSchermo(silenzioso) {
    if (!schermoDisponibile()) { return; }

    let promessa;
    try {
      promessa = navigator.wakeLock.request('screen');
    } catch (err) {
      if (!silenzioso) { avviso('Il browser non ha concesso di tenere acceso lo schermo.'); }
      return;
    }

    Promise.resolve(promessa).then(function (presa) {
      presaSchermo = presa;
      vuoleSchermo = true;

      try {
        presa.addEventListener('release', function () { presaSchermo = null; });
      } catch (err) {}
      dipingiComandi();
    }, function () {
      presaSchermo = null;
      if (!silenzioso) { avviso('Il browser non ha concesso di tenere acceso lo schermo.'); }
      dipingiComandi();
    });
  }

  function lasciaSchermo() {
    vuoleSchermo = false;
    const presa = presaSchermo;
    presaSchermo = null;
    if (!presa) { dipingiComandi(); return; }
    try {
      Promise.resolve(presa.release()).then(null, function () {});
    } catch (err) {}
    dipingiComandi();
  }

  function commutaSchermo() {
    if (vuoleSchermo) { lasciaSchermo(); } else { chiediSchermo(false); }
  }

  function oreMax() {
    let ore = Number(LURK && LURK.oreMax);
    if (!isFinite(ore)) { ore = 3; }
    return Math.min(12, Math.max(1, Math.round(ore)));
  }

  function battito() {
    if (!vivo.acceso) { return; }
    aggiornaConto();

    const ora = Date.now();

    if (chiestoPresenza) {

      if (ora - chiestoPresenza >= ATTESA_PRESENZA) { spegni(); }
      return;
    }

    if (ora - ultimaPresenza >= oreMax() * 3600000) { chiediPresenza(); return; }

    if (ultimoAutomatico && ora - ultimoAutomatico >= CADENZA_INVIO
        && bAttivo() && vivo.collegato && !fuoriOndaCerto()) {
      mandaOra(true);
    }
  }

  function chiediPresenza() {
    chiestoPresenza = Date.now();
    clearTimeout(timerAvviso);
    timerAvviso = null;
    scriviStato();

    if (!nodi.comandi || comandi.presenza) { return; }
    comandi.presenza = bottone(testo('ciSono'), 'btn btn--pieno', rispondiPresenza);
    nodi.comandi.appendChild(comandi.presenza);
  }

  function rispondiPresenza() {
    chiestoPresenza = 0;
    ultimaPresenza = Date.now();
    togliBottonePresenza();
    scriviStato();
  }

  function togliBottonePresenza() {
    if (!comandi.presenza) { return; }
    if (comandi.presenza.parentNode) { comandi.presenza.parentNode.removeChild(comandi.presenza); }
    comandi.presenza = null;
  }

  function canaleAcceso() {

    const daTwitch = statoDaTwitch();
    if (daTwitch !== null) { return daTwitch; }

    if (inOnda) { return true; }

    const d = diagnostica();
    return !!(d && d.riproduce && !d.finito);
  }

  function statoDaTwitch() {
    const C = window.Canale;
    if (!C || typeof C.stato !== 'function') { return null; }
    let letto = null;
    try { letto = C.stato(); } catch (err) { return null; }
    if (!letto || typeof letto.inOnda !== 'boolean') { return null; }
    return letto.inOnda;
  }

  function fuoriOndaCerto() {
    const daTwitch = statoDaTwitch();
    if (daTwitch !== null) { return daTwitch === false; }
    const d = diagnostica();
    return !!(d && d.finito);
  }

  function bAttivo() {

    if (inManutenzione) { return false; }
    if (!MESSAGGIO || MESSAGGIO.attivo !== true) { return false; }
    if (!BROADCASTER) { return false; }
    if (!FRASI.length) { return false; }
    if (typeof fetch !== 'function') { return false; }
    return !!account();
  }

  function inSviluppo() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  function motivoSpento() {
    if (!MESSAGGIO || MESSAGGIO.attivo !== true) {
      const m = String((MESSAGGIO && MESSAGGIO.motivo) || '');
      if (m === 'senzaAccount') {
        return 'il profilo del sito è spento, e senza un account collegato non c’è nessuno a nome '
          + 'di cui scrivere in chat. Si accende nel pannello, gruppo «Profilo del sito», dov’è '
          + 'finito anche il Client ID dell’app Twitch. Poi Pubblica.';
      }
      if (m === 'senzaFrasi') {
        return 'manca almeno una frase da dire in chat: pannello, gruppo «Modalità lurk» → «Frasi '
          + 'del messaggio di lurk». Poi Pubblica.';
      }
      return 'è spento nel pannello, gruppo «Modalità lurk» → «Permetti di dire in chat che si sta '
        + 'guardando». Poi Pubblica.';
    }

    if (!BROADCASTER) {
      return 'manca l’ID numerico del canale: pannello, gruppo «Canale, contatti e immagini».';
    }
    if (!account()) {
      return 'il profilo del sito non è disponibile su questa pagina: il motivo lo scrive '
        + 'js/account.js, nella sua riga di diagnosi qui sopra.';
    }
    if (typeof fetch !== 'function') {
      return 'questo browser non ha quello che serve per parlare con Twitch.';
    }
    return '';
  }

  function scriviDiagnosi() {
    if (bAttivo() || !inSviluppo() || !nodi.lurk) { return; }

    const perche = motivoSpento();
    if (!perche) { return; }

    const riga = crea('p', 'lurk__diagnosi',
      'Il messaggio in chat non è attivo: ' + perche
      + ' — Questo avviso lo vedi solo tu, perché il sito sta girando in locale: sul sito '
      + 'pubblicato non compare a nessuno.');
    nodi.lurk.appendChild(riga);
  }

  function nonPartito(motivo) {
    avviso(motivo);
    erroreInvio = motivo;
    console.warn('[lurk] messaggio in chat non partito:', motivo);
    if (vivo.acceso && ultimoAutomatico) {
      ultimoAutomatico = Date.now() - CADENZA_INVIO + RIPROVA_INVIO;
    }
    aggiornaConto();
  }

  function invia(messaggio, automatico) {
    if (inVolo || !messaggio) { return; }
    invioAutomatico = automatico === true;

    const A = account();
    if (!A || !A.stato().collegato) {
      nonPartito('Per dirlo in chat serve il collegamento con Twitch, qui in cima alla sezione.');
      return;
    }

    if (automatico ? fuoriOndaCerto() : !canaleAcceso()) {
      nonPartito(testo('statoAttesa'));
      return;
    }

    const resta = FRENO_INVIO - (Date.now() - ultimoInvio);
    if (ultimoInvio && resta > 0) {
      nonPartito('Un messaggio al minuto: riprova fra ' + Math.ceil(resta / 1000) + ' secondi.');
      return;
    }

    inVolo = true;
    ultimoInvio = Date.now();
    dipingiAccesso();

    Promise.resolve(A.valida(true)).then(function (ok) {
      const token = A.token();
      const chi = A.id();
      if (!ok || !token || !chi) { throw new Error('scollegato'); }

      return fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Client-Id': A.clientId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          broadcaster_id: BROADCASTER,
          sender_id: chi,
          message: DIRETTA_CONDIVISA ? ETICHETTA_CONDIVISA + messaggio : messaggio
        })
      });
    }).then(rispostaInvio).then(null, function (err) {
      if (err && err.message === 'scollegato') {
        nonPartito('Il collegamento con Twitch non è più valido: ricollegati e riprova.');
      } else {
        nonPartito('Twitch non ha risposto: controlla la connessione e riprova.');
      }
    }).then(function () {
      inVolo = false;
      dipingiAccesso();
    });
  }

  function rispostaInvio(r) {
    if (!r) { return null; }

    if (r.status === 401) {

      const A = account();
      if (A) { A.valida(true); }
      nonPartito('Il collegamento con Twitch è scaduto: ricollegati e riprova.');
      return null;
    }
    if (r.status === 403) {
      nonPartito('Twitch ha rifiutato la richiesta: manca il permesso di scrivere in chat, oppure il tuo account non può scrivere qui.');
      return null;
    }
    if (r.status === 422) {
      nonPartito('Twitch non ha accettato il messaggio: è troppo lungo o contiene qualcosa che la chat non ammette.');
      return null;
    }
    if (r.status === 429) {
      nonPartito('Troppe richieste in poco tempo: aspetta un minuto e riprova.');
      return null;
    }
    if (!r.ok) {
      nonPartito('Twitch ha risposto con un errore (' + r.status + '): riprova più tardi.');
      return null;
    }

    return r.json().then(function (d) {
      const voce = (d && Array.isArray(d.data)) ? d.data[0] : null;
      if (!voce) {
        nonPartito('Twitch ha risposto senza dire com’è andata: controlla in chat.');
        return null;
      }

      if (voce.is_sent === true) {
        vivo.inviati++;
        erroreInvio = '';
        aggiornaConto();
        avvisa();
        avviso(testo('inviato'));
        return null;
      }

      const motivo = voce.drop_reason || {};
      const codice = String(motivo.code || '');
      nonPartito(MOTIVI[codice] || ('Twitch non ha pubblicato il messaggio' + (codice ? ' (' + codice + ')' : '') + '.'));
      return null;
    }, function () {
      nonPartito('La risposta di Twitch non si è lasciata leggere: controlla in chat.');
      return null;
    });
  }

  const FRASI = (function () {
    const voci = Array.isArray(MESSAGGIO.frasi) ? MESSAGGIO.frasi : [];
    return voci.filter(function (v) { return typeof v === 'string' && v.trim(); })
      .map(function (v) { return v.trim(); });
  }());

  function pesca() {
    if (!FRASI.length) { return ''; }
    if (FRASI.length === 1) { return FRASI[0]; }

    if (!mazzo.length) {
      mazzo = FRASI.slice();
      for (let i = mazzo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = mazzo[i]; mazzo[i] = mazzo[j]; mazzo[j] = t;
      }

      if (mazzo[mazzo.length - 1] === ultimaFrase) {
        const t = mazzo[0]; mazzo[0] = mazzo[mazzo.length - 1]; mazzo[mazzo.length - 1] = t;
      }
    }
    ultimaFrase = mazzo.pop();
    return ultimaFrase;
  }

  function preparaFrase() {
    fraseProssima = pesca();
    dipingiAccesso();
  }

  function mandaOra(automatico) {
    const scelta = fraseProssima || pesca();
    fraseProssima = '';

    if (vivo.acceso) { ultimoAutomatico = Date.now(); }
    invia(scelta, automatico === true);
    preparaFrase();
  }

  function costruisciComandi() {

    if (comandiPronti()) {
      comandi.toggle = bottone(testo('accendi'), 'btn btn--vuoto', commuta);
      comandi.toggle.id = 'lurk-toggle';
      comandi.toggle.setAttribute('aria-pressed', 'false');
      nodi.comandi.appendChild(comandi.toggle);
    }

    if (player('smuta')) {
      comandi.audio = bottone(testo('audio'), 'btn btn--vuoto', function () {
        const P = player('smuta');
        if (!P) { return; }

        if (!P.smuta()) { avviso('Da qui non riesco a togliere il muto: usa i comandi del player.'); }
      });
      nodi.comandi.appendChild(comandi.audio);
    }

    if (LURK.tieniSchermoAcceso === true && schermoDisponibile()) {
      comandi.schermo = bottone(testo('schermo'), 'btn btn--vuoto', commutaSchermo);
      comandi.schermo.setAttribute('aria-pressed', 'false');
      nodi.comandi.appendChild(comandi.schermo);
    }

    if (!bAttivo()) { return; }

    comandi.frase = crea('span', 'lurk__preavviso', '');
    comandi.frase.hidden = true;
    nodi.comandi.appendChild(comandi.frase);

    comandi.entra = bottone(etichettaEntra(), 'btn btn--pieno', function () {
      const A = account();
      if (A) { A.entra(); }
    });
    comandi.entra.hidden = true;
    nodi.comandi.appendChild(comandi.entra);

    if (!comandi.toggle) {
      comandi.manda = bottone(testo('manda'), 'btn btn--vuoto', mandaOra);
      comandi.manda.hidden = true;
      nodi.comandi.appendChild(comandi.manda);
    }

  }

  function etichettaEntra() {
    return frase(PROFILO.testi && PROFILO.testi.entra, 'Collegati con Twitch');
  }

  function dipingiComandi() {
    if (comandi.toggle) {
      comandi.toggle.setAttribute('aria-pressed', vivo.acceso ? 'true' : 'false');
      comandi.toggle.textContent = vivo.acceso ? testo('spegni') : testo('accendi');

      const bloccato = !vivo.acceso && !canaleAcceso();
      comandi.toggle.disabled = bloccato;
      if (bloccato) { comandi.toggle.setAttribute('title', testo('statoAttesa')); }
      else { comandi.toggle.removeAttribute('title'); }
    }
    if (comandi.schermo) {
      comandi.schermo.setAttribute('aria-pressed', vuoleSchermo ? 'true' : 'false');
    }
  }

  function dipingiAccesso() {
    if (!comandi.entra) { return; }

    const serveLogin = !vivo.collegato && (vivo.acceso || !comandi.toggle);
    comandi.entra.hidden = !serveLogin;

    if (comandi.frase) {
      let riga = '';
      if (serveLogin) { riga = testo('invito'); }
      else if (vivo.collegato && !vivo.acceso) { riga = testo('preavviso'); }
      comandi.frase.hidden = !riga;
      comandi.frase.textContent = riga
        .replace(/\{frase\}/g, fraseProssima || '')
        .replace(/\{minuti\}/g, String(MINUTI_INVIO));
    }

    if (comandi.manda) {
      comandi.manda.hidden = !vivo.collegato;
      comandi.manda.disabled = inVolo;
    }
  }

  window.Lurk = {

    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },
    accendi: accendi,
    spegni: spegni
  };

  function ascoltaPlayer() {
    const P = window.Player;
    if (!P) { return; }

    if (typeof P.suStato === 'function') {
      P.suStato(function (stato) {

        const acceso = !!(stato && stato.inOnda);
        if (acceso === inOnda) { return; }
        inOnda = acceso;

        if (vivo.acceso) { ciclo(); }

        dipingiComandi();
        if (!vivo.acceso && !timerAvviso) { scriviStato(); }
        tentaRipresa();
      });
    }

    if (window.Canale && typeof window.Canale.suStato === 'function') {
      window.Canale.suStato(function (c) {
        if (!c || typeof c.inOnda !== 'boolean') { return; }
        if (c.inOnda === false && vivo.acceso) { chiudiPerFineDiretta(); return; }
        dipingiComandi();
        if (!vivo.acceso && !timerAvviso) { scriviStato(); }
        tentaRipresa();
      });
    }

    if (typeof P.suVideo === 'function') {
      P.suVideo(function (d) {
        if (!d || !vivo.acceso) { return; }

        if (d.bloccato) { azzeraAllarmi(); segnaSalute('bloccato'); return; }

        if (d.riproduce) {
          azzeraAllarmi();
          segnaSalute('vivo');
          return;
        }

        if (d.fermo && !d.finito && inOnda) { concludiFermo(); }
      });
    }
  }

  function ascoltaAccount() {
    const A = account();
    if (!A) { return; }

    A.suStato(function (chi) {
      const primaCollegato = vivo.collegato;
      vivo.collegato = !!chi.collegato;
      vivo.nome = chi.nome || '';
      vivo.avatar = chi.avatar || '';

      dipingiAccesso();
      avvisa();

      if (!primaCollegato && vivo.collegato && vivo.acceso) { mandaOra(); }
    });
  }

  function ascoltaManutenzione() {
    document.addEventListener('sb:manutenzione', function (evento) {
      const dettaglio = evento && evento.detail;
      if (dettaglio && dettaglio.attiva === false) { return; }
      chiudiPerManutenzione();
    });
  }

  function ascoltaVisibilita() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }

      if (vivo.acceso) {
        avviaSentinella();
        ciclo();
        aggiornaConto();
        battito();
      }

      if (vuoleSchermo && !presaSchermo) { chiediSchermo(true); }

      tentaRipresa();

    });

    window.addEventListener('pagehide', function () { lasciaSchermo(); });
  }

  function avvia() {
    nodi.lurk = document.getElementById('lurk');
    if (!nodi.lurk) { return; }

    if (!LURK || LURK.attivo !== true) {
      nodi.lurk.hidden = true;
      return;
    }

    nodi.comandi = document.getElementById('lurk-comandi');
    nodi.stato = document.getElementById('lurk-stato');
    nodi.conto = document.getElementById('lurk-conto');
    if (!nodi.comandi) { return; }

    Object.keys(RIPIEGHI).forEach(function (chiave) {
      TESTI[chiave] = frase(LURK.testi ? LURK.testi[chiave] : '', RIPIEGHI[chiave]);
    });

    sospeso = daSessione(CHIAVE_SOSPESO) === '1';

    preparaStato();
    nodi.lurk.setAttribute('data-salute', 'spento');
    costruisciComandi();
    dipingiComandi();
    dipingiAccesso();

    [ascoltaPlayer, ascoltaVisibilita, ascoltaManutenzione].forEach(function (blocco) {
      try {
        blocco();
      } catch (err) {
        console.warn('[lurk] blocco non avviato:', err);
      }
    });

    if (!comandiPronti()) {
      segnaSalute('niente');
    } else if (daLocale(CHIAVE_ACCESO) === '1') {

      if (nodi.statoTesto) { nodi.statoTesto.textContent = testo('ripresa'); }
    } else {
      scriviStato();
    }

    if (bAttivo()) {
      try {

        preparaFrase();
        ascoltaAccount();
      } catch (err) {
        console.warn('[lurk] il collegamento con Twitch non è partito:', err);
      }
    } else {

      try { scriviDiagnosi(); } catch (err) {}
    }

    tentaRipresa();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
