/* =====================================================================
   lurk.js — AGENTE L · la modalità lurk

   Due blocchi distinti che non si mescolano (CONTRATTO-3 §0):

     A — SESSIONE VIVA. Sorveglia il video e lo fa ripartire quando il
         browser lo ferma. Nessun login, nessun token. È l'unica parte
         che agisce sul meccanismo giusto: Twitch conta uno spettatore
         finché il video gira, anche mutato e anche in secondo piano
         (docs/PRESENZA-TWITCH.md §1.1). Quando i lurker spariscono non
         è per un timeout AFK — che non esiste — ma perché la sessione
         video è morta (§1.4).

     B — MESSAGGIO DI LURK. Un clic dell'utente, UN messaggio in chat a
         nome suo. Niente timer, niente ripetizioni: quella era la
         Strada B2 del §6.3, ed è fuori perimetro perché è spam e
         perché non aggiunge un solo spettatore al conteggio (§1.3).
         Questo blocco nasce spento e resta spento finché non ci sono
         un profilo del sito acceso e almeno una frase.

   IL LOGIN NON STA PIÙ QUI. Il collegamento con Twitch è diventato il
   profilo del sito — js/account.js, window.Account — e vale su tutto il
   sito anche col messaggio in chat spento. Qui dentro non c'è più nessun
   token, nessuna finestrella e nessuna revoca: si chiede ad Account chi
   è collegato e si usa il suo token per l'unica richiesta che serve.
   Prima era il contrario, e col messaggio spento non esisteva nemmeno il
   modo di collegarsi.

   CINQUE COSE VALGONO PER TUTTO IL FILE

   1. Si disinnesca da solo: senza #lurk, senza window.DATI.lurk o con
      `attivo` falso non costruisce niente e non tocca niente.
   2. MAI attivazione automatica. La scelta si ricorda in localStorage,
      ma alla riapertura il pannello dice «l'avevi lasciata accesa» e
      aspetta un clic: il sito non fa ripartire da solo un meccanismo
      che riavvia il player sul computer di qualcun altro.
   3. SOLO A CANALE ACCESO, e senza eccezioni. A diretta spenta non
      esiste nessuna sessione da tenere viva: l'interruttore non si può
      nemmeno premere, e se la diretta finisce mentre il lurk è acceso
      il lurk si spegne da sé. Insistere vorrebbe dire riavviare a vuoto
      il player di qualcun altro — vedi `fuoriOndaCerto()`, che è il
      punto in cui si distingue «la diretta è finita» da «il nostro
      video si è fermato», che sono esattamente i due casi opposti.
   4. I sei freni e il tetto del riavvio vivono dentro js/player.js, non
      qui (CONTRATTO-3 §3.3). Qui si interpreta soltanto la risposta di
      Player.riparti(): 'ripartito', 'niente', 'impossibile'.
   5. Il limite di durata del §3.5 NON è opzionale: è ciò che separa
      questa funzione da un miner di punti canale. Dopo `oreMax` ore si
      chiede «ci sei ancora?» e senza risposta si spegne tutto.

   INDICE
     1. Dati e costanti
     2. Micro-aiuti
     3. Il pannello: salute, spia, contatore
     4. Gli iscritti a window.Lurk
     5. A — la sentinella: quattro gradini, nessuno decisivo da solo
     6. A — il riavvio a livelli
     7. A — accensione, spegnimento, memoria della scelta
     8. A — lo schermo acceso (wake lock)
     9. A — il limite di durata: «ci sei ancora?»
    10. Il canale acceso: l'unica condizione in cui tutto questo ha senso
    11. B — l'invio del messaggio, col token del profilo del sito
    12. B — la frase e il suo preavviso
    13. I comandi
    14. API pubblica — window.Lurk
    15. Avvio
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Dati e costanti
     ------------------------------------------------------------------
     Tutto arriva da window.DATI.lurk, che lo genera server/lib/costruisci.js
     con la funzione lurkDi(). Le invarianti sono già imposte in generazione
     (CONTRATTO-3 §6.4), ma js/dati.js è un file che si può modificare a mano
     dopo la generazione: un freno che vive solo dove non gira non è un freno,
     quindi qui si rifanno tutti i controlli.
     ------------------------------------------------------------------ */
  const DATI = window.DATI || {};
  const LURK = DATI.lurk || null;
  const TWITCH = DATI.twitch || {};
  const MESSAGGIO = (LURK && LURK.messaggio) || {};
  const PROFILO = DATI.account || {};

  // È il broadcaster_id della richiesta di invio: senza, il blocco B non ha
  // un canale a cui parlare e resta spento.
  const BROADCASTER = String(TWITCH.idUtente || '').trim();

  // Memoria della scelta, e l'unica cosa che questo file scrive: è una
  // preferenza, quindi localStorage. Del token non si occupa più nessuno qui
  // dentro — sta in sessionStorage, dentro js/account.js, e muore con la
  // scheda (CONTRATTO-3 §4.3).
  const CHIAVE_ACCESO = 'sb-lurk-acceso';

  const SENTINELLA = 20000;      // un giro ogni 20 s, e solo a pagina visibile
  const BATTITO = 1000;          // il contatore, il limite di durata, l'orologio
  const BUFFERING_MAX = 3;       // tre cicli di fila (~60 s) prima di chiamarlo stallo
  const FERMI_MAX = 2;           // due cicli col tempo che non cresce
  const SESSIONE_BUONA = 60000;  // sopra questa soglia il riavvio è riuscito davvero
  const ATTESE = [5000, 15000, 45000, 120000];   // 5 s, 15 s, 45 s, 2 min, poi resa

  const ATTESA_PRESENZA = 300000;   // cinque minuti per rispondere a «ci sei?»
  const DURATA_AVVISO = 7000;       // quanto resta un messaggio al posto dello stato

  const FRENO_INVIO = 60000;     // un invio al minuto, e comunque uno per volta

  // Tetto per caricamento di pagina. Il freno al minuto impedisce la raffica,
  // non la goccia: spegni e riaccendi il lurk cinque volte in un'ora e in chat
  // finiscono cinque messaggi, tutti voluti e tutti fastidiosi. Tre è il numero
  // oltre il quale non è più «un atto umano, un messaggio» ma un tic.
  const MESSAGGI_MAX = 3;

  // Nessun testo di stato è indispensabile: se il pannello è stato pubblicato
  // con un campo vuoto è meglio una frase di ripiego che una riga muta.
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
    statoResa: 'Non ci riesco più. Ricarica la pagina.',
    statoNiente: 'Da qui non posso: non ho i comandi del player.',
    conto: 'Viva da {durata}',
    contoRiavvii: 'Viva da {durata} · {riavvii} riavvii',
    preavviso: 'Attivando il lurk dirò in chat: «{frase}»',
    invito: 'Vuoi dire in chat che stai guardando? Dirò: «{frase}»',
    manda: 'Dillo in chat',
    inviato: 'Fatto: il messaggio è in chat.'
  };

  // I sette stati del §3.5 più `niente`, che è il caso «non ho i comandi».
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

  // I motivi per cui Twitch scarta un messaggio pur rispondendo 200. Sono cose
  // che il visitatore può risolvere, quindi si traducono: un codice grezzo in
  // pagina non aiuta nessuno (CONTRATTO-3 §4.4).
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

  // Lo stato che window.Lurk pubblica. È l'unica fonte: niente si legge dal DOM.
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

  let inOnda = false;         // lo dice Player.suStato, non si deduce dal DOM
  let vivoDa = 0;             // da quando il video regge: serve ad azzerare i tentativi

  let timerSentinella = null;
  let timerBattito = null;
  let timerRiavvio = null;
  let timerAvviso = null;

  let buffering = 0;          // cicli consecutivi in Buffering
  let fermi = 0;              // cicli consecutivi col tempo che non cresce
  let ultimoTempo = null;     // ultimo getCurrentTime() utile, oppure null
  let tentativo = 0;          // indice dentro ATTESE
  let inRiavvio = false;

  let vuoleSchermo = false;   // l'utente ha CHIESTO lo schermo acceso
  let presaSchermo = null;    // WakeLockSentinel, quando c'è

  let chiestoPresenza = 0;    // quando è comparso «ci sei ancora?»
  let ultimaPresenza = 0;     // ultima conferma di presenza (o accensione)

  let ultimaFrase = '';
  let fraseProssima = '';   // la frase che partira alla prossima accensione
  let ultimoInvio = 0;
  let inVolo = false;

  /* ------------------------------------------------------------------
     2. Micro-aiuti — tutto protetto: dove il browser può lanciare, si tace
     ------------------------------------------------------------------ */
  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  // I parametri non si chiamano `testo` apposta: più sotto `testo()` è la
  // funzione che pesca le etichette, e un parametro omonimo la coprirebbe
  // proprio dentro le due funzioni che costruiscono i nodi.
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

  // In navigazione privata l'accesso allo storage può lanciare da solo, prima
  // ancora di leggere: è il motivo per cui pollo.js avvolge anche il get.
  function daLocale(chiave) {
    try { return localStorage.getItem(chiave); } catch (err) { return null; }
  }

  function inLocale(chiave, valore) {
    try { localStorage.setItem(chiave, valore); } catch (err) { /* si perde la memoria, non la funzione */ }
  }

  // «1h 12m» sopra l'ora, «12m» sotto, «45s» nel primo minuto: le tre scale
  // che servono, senza mai stampare uno zero che non dice niente.
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

  // Il player può non esserci affatto (script bloccato, ordine cambiato): ogni
  // accesso passa di qui e nessuno di questi metodi è dato per scontato.
  function player(metodo) {
    const P = window.Player;
    return (P && typeof P[metodo] === 'function') ? P : null;
  }

  function diagnostica() {
    const P = player('diagnostica');
    if (!P) { return null; }
    try { return P.diagnostica(); } catch (err) { return null; }
  }

  // Il blocco A esiste solo con l'SDK: con l'iframe manuale (quasi sempre un
  // adblock che filtra embed.twitch.tv) non ci sono né eventi né play(), e un
  // interruttore che promette di tenere viva la sessione sarebbe una bugia.
  // Si decide QUI, una volta, invece di scoprirlo al primo clic: player.js
  // fissa `modalita` dentro montaPlayer(), che gira prima di questo file.
  function comandiPronti() {
    const d = diagnostica();
    return !!(d && d.modalita === 'sdk' && player('riparti'));
  }

  // Il profilo del sito (js/account.js). Può non esserci affatto — script
  // bloccato, profilo spento nel pannello — e allora il blocco A funziona
  // uguale: non ha mai avuto bisogno di un account.
  function account() {
    const A = window.Account;
    return (A && A.attivo === true) ? A : null;
  }

  /* ------------------------------------------------------------------
     3. Il pannello: salute, spia, contatore
     ------------------------------------------------------------------
     La salute va in data-salute su #lurk, dove css/lurk.css la legge per
     colorare la pastiglia. Il testo va in #lurk-stato con textContent: i
     testi di stato sono di tipo `testo` e non `ricco` proprio per questo
     (CONTRATTO-3 §6.2), quindi eventuale HTML resterebbe stampato letterale.
     ------------------------------------------------------------------ */
  function preparaStato() {
    if (!nodi.stato) { return; }
    nodi.stato.textContent = '';

    // La pastiglia è decorativa: il testo accanto dice già tutto, e farla
    // leggere a un lettore di schermo aggiungerebbe rumore e basta.
    const spia = crea('span', 'lurk__spia');
    spia.setAttribute('aria-hidden', 'true');
    nodi.stato.appendChild(spia);

    nodi.statoTesto = crea('span', '', '');
    nodi.stato.appendChild(nodi.statoTesto);
  }

  function scriviStato() {
    if (!nodi.statoTesto) { return; }
    // La domanda di presenza ha la precedenza su tutto: è l'unica riga a cui
    // l'utente deve rispondere, e #lurk-stato è già la regione annunciata.
    if (chiestoPresenza) { nodi.statoTesto.textContent = testo('ciSei'); return; }

    // A riquadro spento la riga dice «Spenta.», che è vero ma non spiega
    // perché l'interruttore non si possa premere. Se il canale è fuori onda
    // il motivo è quello, e va detto: senza, resta un bottone grigio senza
    // ragione — la cosa che manda la gente a ricaricare la pagina a caso.
    if (vivo.salute === 'spento' && comandiPronti() && !canaleAcceso()) {
      nodi.statoTesto.textContent = testo('statoAttesa');
      return;
    }

    nodi.statoTesto.textContent = testo(TESTO_DI[vivo.salute] || 'statoSpento');
  }

  // Un messaggio che prende il posto dello stato per qualche secondo. Serve al
  // blocco B (esito dell'invio, errori del token) e non può avere una regione
  // sua: #lurk-stato è già role="status", e due regioni live nello stesso
  // pannello si darebbero il cambio parlandosi sopra.
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
    // Un avviso in corso non si scavalca: sparisce da solo fra pochi secondi e
    // scriviStato() rimette la riga giusta.
    if (!timerAvviso) { scriviStato(); }
    avvisa();
  }

  function aggiornaConto() {
    if (!nodi.conto) { return; }
    if (!vivo.acceso) { nodi.conto.textContent = ''; return; }

    const modello = vivo.riavvii > 0 ? testo('contoRiavvii') : testo('conto');
    nodi.conto.textContent = modello
      .replace(/\{durata\}/g, durata(Date.now() - vivo.daQuando))
      .replace(/\{riavvii\}/g, String(vivo.riavvii));
  }

  /* ------------------------------------------------------------------
     4. Gli iscritti a window.Lurk
     ------------------------------------------------------------------
     Li consuma js/pollo.js. Come in player.js §14, un iscritto che lancia
     finisce in console e non si porta via il lurk: è una decorazione che si
     iscrive a un meccanismo di servizio, non il contrario.
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     5. A — la sentinella: quattro gradini, nessuno decisivo da solo
     ------------------------------------------------------------------
     Gira ogni 20 s e SOLO a pagina visibile. Legge Player.diagnostica(), che
     costa zero richieste di rete: è la cache che l'SDK aggiorna con i
     postMessage dell'iframe. Interrogare Helix ogni venti secondi sarebbe un
     ottimo modo di farsi limitare.

     Il gradino del tempo si AUTOESCLUDE se `tempo` è null: getCurrentTime()
     su una diretta non è documentato e può restituire null, NaN o zero fisso.
     Dedurre «fermo» dall'assenza di un dato è l'errore che il §3.2 vieta
     esplicitamente, ed è anche quello che farebbe partire riavvii a vuoto.
     ------------------------------------------------------------------ */
  function azzeraAllarmi() {
    buffering = 0;
    fermi = 0;
    ultimoTempo = null;
  }

  function ciclo() {
    if (!vivo.acceso) { return; }
    if (document.visibilityState !== 'visible') { return; }

    const d = diagnostica();

    // Senza SDK non ci sono né eventi né play(): non c'è niente da sorvegliare
    // e niente da riavviare. Si dichiara e si smette, invece di girare a vuoto.
    if (!d || d.modalita !== 'sdk') {
      segnaSalute('niente');
      fermaSentinella();
      return;
    }

    // L'autoplay negato non si sblocca da codice: serve un gesto umano. Il
    // riavvio qui peggiorerebbe le cose, quindi si dice cosa fare e si aspetta.
    if (d.bloccato) {
      azzeraAllarmi();
      segnaSalute('bloccato');
      return;
    }

    // Il freno più importante, e vale prima di ogni altra cosa: un canale che
    // ha smesso non ha nessuna sessione da tenere viva. E siccome la modalità
    // lurk vale SOLO a canale acceso, qui non ci si limita ad aspettare: si
    // spegne. Ma solo quando la diretta è finita per davvero — «il video si è
    // fermato» è il caso opposto, ed è quello per cui questo file esiste.
    if (fuoriOndaCerto()) { chiudiPerFineDiretta(); return; }

    // Fuori onda per DEDUZIONE: il player non ha visto arrivare niente, o la
    // sua riconciliazione ha trovato il video fermo. Non basta a dichiarare
    // finita la diretta e non basta a riavviare: si aspetta, che è la sola
    // risposta onesta quando non si sa.
    if (!inOnda) {
      azzeraAllarmi();
      segnaSalute('attesa');
      return;
    }

    if (d.riproduce) {
      // Gradino 2: un buffering isolato è normalissimo e non si tocca. Tre di
      // fila, cioè un minuto abbondante, sono uno stallo.
      buffering = (d.playback === 'Buffering') ? buffering + 1 : 0;

      // Gradino 3: il tempo che non cresce mentre il player si dichiara vivo.
      if (typeof d.tempo === 'number') {
        if (ultimoTempo !== null && d.tempo <= ultimoTempo) { fermi++; } else { fermi = 0; }
        ultimoTempo = d.tempo;
      } else {
        // Il dato non c'è: questo gradino non conclude NIENTE e si azzera, così
        // non resta un conteggio vecchio ad aspettare di far scattare un
        // riavvio la prima volta che il getter torna a rispondere.
        fermi = 0;
        ultimoTempo = null;
      }

      if (buffering >= BUFFERING_MAX || fermi >= FERMI_MAX) { concludiFermo(); return; }

      // Con un riavvio già in coda non si torna a dire «vivo» su due piedi:
      // `riproduce` è vero anche nello stallo silenzioso, cioè nel caso che ha
      // appena concluso «fermo», e riscriverlo qui farebbe lampeggiare lo stato
      // avanti e indietro a ogni giro. Se il video è tornato davvero da solo,
      // il tentativo parte, player.js risponde 'niente' per il suo sesto freno
      // (video che va, pagina visibile) e il giro dopo si torna a «vivo».
      if (timerRiavvio || inRiavvio) { return; }

      segnaSalute('vivo');
      // Il riavvio è riuscito davvero solo se la sessione regge: azzerare il
      // conteggio appena riparte produrrebbe un ciclo infinito di riavvii
      // «riusciti» che ricadono dopo tre secondi.
      if (vivoDa && (Date.now() - vivoDa) > SESSIONE_BUONA) { tentativo = 0; }
      return;
    }

    // Gradino 1, il più autorevole: Idle/Ended DOPO essere stato in onda.
    if (d.fermo) { concludiFermo(); return; }

    // Nessun gradino conclude: si lascia com'è e si riprova fra venti secondi.
    // «Non lo so» è una risposta legittima, «fermo» no.
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

  /* ------------------------------------------------------------------
     6. A — il riavvio a livelli
     ------------------------------------------------------------------
     Qui NON si riproducono i sei freni né il tetto: stanno dentro player.js,
     che è l'unico a sapere quante istanze di Twitch.Player ha creato in questa
     pagina (CONTRATTO-3 §3.3). Da qui si chiama e si interpreta la risposta.

     Attese crescenti fra i tentativi: 5 s, 15 s, 45 s, 2 min, poi resa. I
     livelli salgono con loro — play(), setChannel(), ricostruzione — e la
     ricostruzione la rifiuta player.js stesso dopo due volte per pagina.
     ------------------------------------------------------------------ */
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
      // Non si dichiara «vivo» qui: lo dirà la sentinella quando vedrà il video
      // girare davvero. Un riavvio lanciato non è un riavvio riuscito.
      return;
    }

    if (esito === 'impossibile') {
      segnaSalute('resa');
      fermaSentinella();
      return;
    }

    // 'niente': c'è un motivo per non fare nulla ADESSO — canale spento, rete
    // giù, oppure il video sta già andando davanti a chi guarda. Non si insiste
    // e non si consuma un tentativo: al prossimo giro la sentinella rivaluta.
  }

  /* ------------------------------------------------------------------
     7. A — accensione, spegnimento, memoria della scelta
     ------------------------------------------------------------------ */
  function accendi() {
    if (vivo.acceso) { return; }

    // Senza i comandi del player non si parte proprio: non è un degrado
    // parziale, è l'assenza di qualunque cosa da fare.
    const d = diagnostica();
    if (!d || d.modalita !== 'sdk' || !player('riparti')) {
      segnaSalute('niente');
      return;
    }

    // A canale spento non si accende, e non è un ripiego: è la regola. Non
    // c'è nessuna sessione video da tenere viva, quindi non c'è niente da
    // fare — e un riquadro «attivo» che non fa niente sarebbe una bugia
    // detta bene. L'interruttore è già disabilitato in questo caso: questo
    // è il freno che vale anche per window.Lurk.accendi(), che qualcuno può
    // chiamare dalla console o da un altro script.
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
    // Da qui esce l'invito a collegarsi: il lurk è acceso, e adesso — e solo
    // adesso — ha senso chiedere se lo si vuole anche dire in chat.
    dipingiAccesso();
    if (nodi.lurk) { nodi.lurk.classList.add('is-acceso'); }

    avviaSentinella();
    if (!timerBattito) { timerBattito = setInterval(battito, BATTITO); }

    // Stato iniziale letto dalla diagnosi che abbiamo già in mano, senza
    // dedurre niente che non ci sia. Il primo ciclo lo conferma o lo corregge
    // subito dopo; questo serve a non lasciare mai `acceso` con salute
    // «spento», che sarebbe una contraddizione per chi legge window.Lurk.
    if (d.bloccato) { segnaSalute('bloccato'); }
    else if (!inOnda) { segnaSalute('attesa'); }
    else if (d.riproduce) { segnaSalute('vivo'); }
    else { segnaSalute('fermo'); }

    ciclo();
    aggiornaConto();
    avvisa();

    // Il messaggio in chat parte QUI, da solo, come conseguenza dichiarata
    // dell'accensione. Non è un timer: un gesto dell'utente, un messaggio —
    // lo stesso rapporto 1:1 di un «!lurk» scritto a mano, che è ciò che lo
    // tiene fuori dallo spam (docs/PRESENZA-TWITCH.md §2.7). Un bottone a
    // parte da premere era solo attrito: chi deve premerlo tanto vale che
    // scriva in chat da sé.
    //
    // Parte solo se l'utente si è collegato: senza account non c'è nessuno a
    // nome di cui parlare, e il lurk funziona lo stesso — il blocco A non ha
    // mai avuto bisogno del login.
    if (bAttivo() && vivo.collegato) { mandaOra(); }
  }

  /**
   * La diretta è finita mentre il lurk era acceso.
   *
   * Si spegne tutto e lo si dice. Non è una scortesia verso chi aveva acceso
   * il riquadro: è l'unica cosa sensata da fare, perché da qui in avanti ogni
   * riavvio sarebbe un player rimesso in moto su un canale che non trasmette.
   * La scelta ricordata in localStorage non si tocca — la persona non ha
   * cambiato idea, è finita la diretta — così alla prossima serata il
   * riquadro dirà «l'avevi lasciata accesa» e aspetterà un clic.
   */
  function chiudiPerFineDiretta() {
    if (!vivo.acceso) { return; }
    const ricordo = daLocale(CHIAVE_ACCESO);
    spegni();
    if (ricordo === '1') { inLocale(CHIAVE_ACCESO, '1'); }
    segnaSalute('attesa');
    avviso(testo('chiuso'));
  }

  function spegni() {
    fermaSentinella();
    clearTimeout(timerRiavvio);
    timerRiavvio = null;
    if (timerBattito) { clearInterval(timerBattito); timerBattito = null; }

    vivo.acceso = false;
    vivo.daQuando = 0;
    chiestoPresenza = 0;
    tentativo = 0;
    azzeraAllarmi();
    lasciaSchermo();

    inLocale(CHIAVE_ACCESO, '0');
    if (nodi.lurk) { nodi.lurk.classList.remove('is-acceso'); }
    togliBottonePresenza();
    dipingiComandi();
    // Spento il lurk, l'invito a collegarsi sparisce con lui: non c'è più
    // niente da dichiarare in chat.
    dipingiAccesso();
    aggiornaConto();
    segnaSalute('spento');
    avvisa();
  }

  function commuta() {
    if (vivo.acceso) { spegni(); } else { accendi(); }
  }

  /* ------------------------------------------------------------------
     8. A — lo schermo acceso (wake lock)
     ------------------------------------------------------------------
     Interruttore separato e spento di serie, mai implicito nell'accensione del
     lurk: tiene acceso lo schermo di qualcun altro e gli consuma la batteria,
     quindi va chiesto a parte. Si acquisisce SOLO da un clic — a scheda
     nascosta la richiesta viene rifiutata comunque — e si perde da sola a ogni
     cambio di visibilità: al ritorno si riprende, ma solo se era stato chiesto.
     ------------------------------------------------------------------ */
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
      // Il rilascio arriva da solo quando la scheda va dietro: si prende nota
      // senza dimenticare che l'utente lo voleva, così al ritorno si riprende.
      try {
        presa.addEventListener('release', function () { presaSchermo = null; });
      } catch (err) { /* implementazione senza eventi: si scopre al ritorno */ }
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
      Promise.resolve(presa.release()).then(null, function () { /* già rilasciata */ });
    } catch (err) { /* già rilasciata */ }
    dipingiComandi();
  }

  function commutaSchermo() {
    if (vuoleSchermo) { lasciaSchermo(); } else { chiediSchermo(false); }
  }

  /* ------------------------------------------------------------------
     9. A — il limite di durata: «ci sei ancora?»
     ------------------------------------------------------------------
     Non è opzionale (CONTRATTO-3 §3.5). Rimettere in piedi la sessione di chi
     è lì è legittimo; tenerla accesa all'infinito per chi se n'è andato è la
     cosa che le Community Guidelines chiamano «cheat the Twitch rewards
     system». È anche un servizio: nessuno vuole scoprire di aver lasciato la
     diretta accesa tutta la notte.

     Il conto si tiene sull'OROLOGIO e non su un setTimeout lungo: con la
     scheda in secondo piano i timer vengono rallentati e poi congelati, e un
     setTimeout di tre ore scatterebbe quando gli pare.
     ------------------------------------------------------------------ */
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
      // Nessuna risposta entro cinque minuti: si spegne tutto. È il punto del
      // contratto che tiene la funzione dalla parte giusta del confine.
      if (ora - chiestoPresenza >= ATTESA_PRESENZA) { spegni(); }
      return;
    }

    if (ora - ultimaPresenza >= oreMax() * 3600000) { chiediPresenza(); }
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

  /* ------------------------------------------------------------------
     10. Il canale acceso: l'unica condizione in cui tutto questo ha senso
     ------------------------------------------------------------------
     Twitch conta uno spettatore finché il suo video gira. Se non c'è nessuna
     diretta non c'è nessun video da tenere in piedi: la modalità lurk non è
     «meno utile» a canale spento, è priva di oggetto. Da qui vengono le tre
     conseguenze che il resto del file applica senza discutere —
     l'interruttore non si può premere, l'accensione si rifiuta, e la diretta
     che finisce spegne il riquadro.

     LA DISTINZIONE CHE CONTA, e sbagliarla ribalta la funzione:

       «la diretta è finita»           → si spegne tutto
       «il nostro video si è fermato»  → si riavvia, ed è il mestiere del file

     Dal solo `inOnda` del player i due casi non si distinguono: player.js
     conclude «fuori onda» anche quando la sua riconciliazione periodica trova
     il video fermo, che è esattamente il caso in cui il lurk deve
     intervenire. Per questo `fuoriOndaCerto()` guarda soltanto due sorgenti
     che non possono confondersi:

       - window.Canale, cioè la risposta di helix/streams, per chi si è
         collegato col profilo del sito. È l'unica risposta autorevole;
       - `finito`, cioè un OFFLINE/ENDED RICEVUTO dall'SDK: è un evento
         arrivato, non una conclusione tratta da un timeout.

     Tutto il resto vale «non lo so», e a «non lo so» si aspetta.
     ------------------------------------------------------------------ */

  /**
   * Il canale è acceso adesso? Serve a decidere se l'interruttore si può
   * premere, quindi risponde di sì solo quando qualcosa lo dice davvero —
   * mai per il solo fatto di non saperlo.
   */
  function canaleAcceso() {
    // La risposta di Twitch, quando c'è, vince su tutto il resto.
    const daTwitch = statoDaTwitch();
    if (daTwitch !== null) { return daTwitch; }

    if (inOnda) { return true; }

    // Lo stato del player può non essere ancora risolto — i primi secondi di
    // una pagina appena aperta — e in quella finestra `inOnda` è falso senza
    // che nessuno abbia detto niente. Un video che sta girando è però già una
    // risposta: se il player riproduce, il canale trasmette.
    const d = diagnostica();
    return !!(d && d.riproduce && !d.finito);
  }

  /** true / false secondo helix/streams, null se non c'è nessuna risposta. */
  function statoDaTwitch() {
    const C = window.Canale;
    if (!C || typeof C.stato !== 'function') { return null; }
    let letto = null;
    try { letto = C.stato(); } catch (err) { return null; }
    if (!letto || typeof letto.inOnda !== 'boolean') { return null; }
    return letto.inOnda;
  }

  /**
   * La diretta è finita per davvero. Vedi il cappello qui sopra: qui NON
   * entra la deduzione del player, altrimenti il lurk si spegnerebbe da solo
   * proprio nel momento in cui deve rimettere in moto il video.
   */
  function fuoriOndaCerto() {
    const daTwitch = statoDaTwitch();
    if (daTwitch !== null) { return daTwitch === false; }
    const d = diagnostica();
    return !!(d && d.finito);
  }

  /* ------------------------------------------------------------------
     10-bis. Il messaggio in chat: quando c'è e quando non c'è
     ------------------------------------------------------------------
     Il blocco B è spento finché non ci sono TUTTE le condizioni. È lo stato
     di partenza del progetto, non un'eccezione: senza un profilo del sito
     non c'è nessuno a nome di cui parlare, e senza frasi non c'è niente da
     dire. Il login vero e proprio sta in js/account.js — token, finestrella,
     revoca: qui si guarda soltanto se esiste.
     ------------------------------------------------------------------ */
  function bAttivo() {
    if (!MESSAGGIO || MESSAGGIO.attivo !== true) { return false; }
    if (!BROADCASTER) { return false; }
    if (!FRASI.length) { return false; }
    if (typeof fetch !== 'function') { return false; }
    return !!account();
  }

  // Siamo sul computer di chi amministra, non su un sito pubblicato. È
  // l'unica condizione in cui la pagina si permette di spiegare come mai il
  // messaggio in chat non c'è: a un visitatore non interessa, e raccontargli
  // com'è configurato il sito non serve a niente.
  function inSviluppo() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  /**
   * Perché il blocco B non è in pagina. Sta qui e non nel pannello perché il
   * posto in cui uno si accorge che manca è il sito, guardandolo: restare a
   * premere «Attiva» aspettando un login che non può comparire, senza una
   * riga che lo spieghi, è un modo perfetto di perdere un pomeriggio.
   */
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

  /* ------------------------------------------------------------------
     11. B — l'invio del messaggio, col token del profilo del sito
     ------------------------------------------------------------------
     Header SOLO Authorization, Client-Id e Content-Type: qualunque header in
     più fa fallire il preflight CORS, ed è la causa reale di quasi tutti i
     «CORS error» che si leggono sui forum (docs/PRESENZA-TWITCH.md §3.3).

     E un 200 non significa messaggio arrivato: si legge data[0].is_sent e, se
     è falso, si traduce drop_reason. Da sito statico non si può sapere in
     anticipo se il messaggio passerà: si prova e si dice com'è andata.
     ------------------------------------------------------------------ */
  function invia(messaggio) {
    if (inVolo || !messaggio) { return; }

    const A = account();
    if (!A || !A.stato().collegato) {
      avviso('Per dirlo in chat serve il collegamento con Twitch, qui in cima alla sezione.');
      return;
    }

    // A canale spento non si scrive: «lurko dal sito» sotto una diretta finita
    // non lo legge nessuno, e il lurk stesso non si può nemmeno accendere.
    if (!canaleAcceso()) {
      avviso(testo('statoAttesa'));
      return;
    }

    // Il tetto conta i messaggi ARRIVATI in chat, non i tentativi: un invio
    // rifiutato da Twitch (slow mode, duplicato) non deve consumare il budget
    // di chi non ha ancora detto niente. Si azzera solo ricaricando la pagina,
    // che è un gesto abbastanza deliberato da non essere un tic.
    if (vivo.inviati >= MESSAGGI_MAX) {
      avviso('L’hai già detto ' + vivo.inviati + ' volte in chat da questa pagina: per ripeterlo, ricaricala.');
      return;
    }

    const resta = FRENO_INVIO - (Date.now() - ultimoInvio);
    if (ultimoInvio && resta > 0) {
      avviso('Un messaggio al minuto: riprova fra ' + Math.ceil(resta / 1000) + ' secondi.');
      return;
    }

    inVolo = true;
    ultimoInvio = Date.now();   // il freno conta dal tentativo, non dall'esito
    dipingiAccesso();

    // Rivalidazione prima di OGNI invio: è l'unico momento in cui sapere che il
    // token è morto costa meno che scoprirlo con un 401 a metà strada. La fa
    // js/account.js, che è l'unico a sapere quando l'ha fatta l'ultima volta.
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
          message: messaggio
        })
      });
    }).then(rispostaInvio).then(null, function (err) {
      if (err && err.message === 'scollegato') {
        avviso('Il collegamento con Twitch non è più valido: ricollegati e riprova.');
      } else {
        avviso('Twitch non ha risposto: controlla la connessione e riprova.');
      }
    }).then(function () {
      inVolo = false;
      dipingiAccesso();
    });
  }

  function rispostaInvio(r) {
    if (!r) { return null; }

    if (r.status === 401) {
      // Il token è morto: a buttarlo ci pensa js/account.js alla prossima
      // validazione, che è l'unico posto in cui si tocca. Da qui si dice
      // soltanto com'è andata.
      const A = account();
      if (A) { A.valida(true); }
      avviso('Il collegamento con Twitch è scaduto: ricollegati e riprova.');
      return null;
    }
    if (r.status === 403) {
      avviso('Twitch ha rifiutato la richiesta: manca il permesso di scrivere in chat, oppure il tuo account non può scrivere qui.');
      return null;
    }
    if (r.status === 422) {
      avviso('Twitch non ha accettato il messaggio: è troppo lungo o contiene qualcosa che la chat non ammette.');
      return null;
    }
    if (r.status === 429) {
      avviso('Troppe richieste in poco tempo: aspetta un minuto e riprova.');
      return null;
    }
    if (!r.ok) {
      avviso('Twitch ha risposto con un errore (' + r.status + '): riprova più tardi.');
      return null;
    }

    return r.json().then(function (d) {
      const voce = (d && Array.isArray(d.data)) ? d.data[0] : null;
      if (!voce) {
        avviso('Twitch ha risposto senza dire com’è andata: controlla in chat.');
        return null;
      }

      if (voce.is_sent === true) {
        vivo.inviati++;
        avvisa();
        avviso(testo('inviato'));
        return null;
      }

      const motivo = voce.drop_reason || {};
      const codice = String(motivo.code || '');
      avviso(MOTIVI[codice] || ('Twitch non ha pubblicato il messaggio' + (codice ? ' (' + codice + ')' : '') + '.'));
      return null;
    }, function () {
      avviso('La risposta di Twitch non si è lasciata leggere: controlla in chat.');
      return null;
    });
  }

  /* ------------------------------------------------------------------
     12. B — la frase e il suo preavviso
     ------------------------------------------------------------------
     La frase si vede SEMPRE prima di partire: chi è collegato legge nella
     barra dell'account che cosa verrà detto a suo nome, con quelle parole
     esatte, PRIMA di accendere il lurk. Non c'è una finestra di conferma
     perché l'invio non è più un comando a sé: è la conseguenza dichiarata
     dell'accensione, e un secondo clic per confermare il primo sarebbe
     proprio l'attrito che rendeva inutile il vecchio bottone.

     Ed è il punto in cui il testo conta più del codice — «lurko» dichiara
     l'assenza, «ci sono» la maschera, e con lo stesso identico codice la
     seconda formulazione sposterebbe la funzione dalla parte sbagliata del
     regolamento. Per questo le frasi stanno in contenuti.json.
     ------------------------------------------------------------------ */
  const FRASI = (function () {
    const voci = Array.isArray(MESSAGGIO.frasi) ? MESSAGGIO.frasi : [];
    return voci.filter(function (v) { return typeof v === 'string' && v.trim(); })
      .map(function (v) { return v.trim(); });
  }());

  // Pescata a rotazione che evita di ripetere l'ultima. Serve contro il
  // filtro anti-duplicato di Twitch, che scarta due messaggi identici
  // ravvicinati dallo stesso utente: qui i messaggi sono uno per accensione,
  // ma due accensioni ravvicinate sono del tutto normali.
  function pesca() {
    if (!FRASI.length) { return ''; }
    if (FRASI.length === 1) { return FRASI[0]; }

    let scelta = ultimaFrase;
    for (let i = 0; i < 6 && scelta === ultimaFrase; i++) {
      scelta = FRASI[Math.floor(Math.random() * FRASI.length)];
    }
    ultimaFrase = scelta;
    return scelta;
  }

  // La frase che partirà alla prossima accensione. Si sceglie in anticipo
  // proprio perché va mostrata prima: annunciarne una e mandarne un'altra
  // sarebbe peggio che non annunciarla affatto.
  function preparaFrase() {
    fraseProssima = pesca();
    dipingiAccesso();
  }

  // L'unico posto da cui parte un messaggio, chiamato dai tre momenti in cui
  // può partire: l'accensione del lurk, il ritorno dalla finestrella del
  // login a lurk già acceso, e il bottone di ripiego di chi non ha i comandi
  // del player. Manda SEMPRE la frase annunciata, poi ne prepara un'altra:
  // due accensioni ravvicinate con la stessa frase le scarterebbe Twitch,
  // che rifiuta due messaggi identici di fila dallo stesso utente.
  function mandaOra() {
    const scelta = fraseProssima || pesca();
    fraseProssima = '';
    invia(scelta);
    preparaFrase();
  }

  /* ------------------------------------------------------------------
     13. I comandi
     ------------------------------------------------------------------
     #lurk-comandi arriva vuoto dal modello ed è questo blocco a riempirlo:
     senza JavaScript in pagina non devono restare bottoni raggiungibili col
     Tab che non rispondono a niente (CONTRATTO-3 §2).

     Tutti i bottoni hanno testo vero, non solo un'icona, e il toggle porta un
     aria-pressed che viene aggiornato davvero.
     ------------------------------------------------------------------ */
  function costruisciComandi() {
    // --- Blocco A ---
    // Senza i comandi veri del player l'interruttore non si costruisce
    // affatto: prima c'era e, premuto, si limitava a rispondere «da qui non
    // posso». Un bottone che non fa mai niente è peggio di un bottone che non
    // c'è, e la riga di stato lo spiega già da sola.
    if (comandiPronti()) {
      comandi.toggle = bottone(testo('accendi'), 'btn btn--vuoto', commuta);
      comandi.toggle.id = 'lurk-toggle';
      comandi.toggle.setAttribute('aria-pressed', 'false');
      nodi.comandi.appendChild(comandi.toggle);
    }

    // Il bottone dell'audio esiste perché Chrome ed Edge proteggono dalla
    // sospensione le schede «audible», non quelle che stanno solo
    // riproducendo. Lo preme l'utente: qui non esiste nessun volume finto a
    // 0,01 per far risultare la scheda audible, che è il gonfiaggio
    // artificiale per cui Twitch disabilita l'autoplay negli embed.
    if (player('smuta')) {
      comandi.audio = bottone(testo('audio'), 'btn btn--vuoto', function () {
        const P = player('smuta');
        if (!P) { return; }
        // Va chiamata dentro il gestore del clic: fuori da un gesto utente il
        // browser la ignora in silenzio.
        if (!P.smuta()) { avviso('Da qui non riesco a togliere il muto: usa i comandi del player.'); }
      });
      nodi.comandi.appendChild(comandi.audio);
    }

    if (LURK.tieniSchermoAcceso === true && schermoDisponibile()) {
      comandi.schermo = bottone(testo('schermo'), 'btn btn--vuoto', commutaSchermo);
      comandi.schermo.setAttribute('aria-pressed', 'false');
      nodi.comandi.appendChild(comandi.schermo);
    }

    // --- Blocco B ---
    // Il login sta QUI, nella fila dei comandi, e non nella barra in cima:
    // si chiede nel momento in cui ha un senso chiederlo, cioè quando
    // qualcuno ha appena acceso il lurk. Prima era un bottone staccato,
    // sopra al monitor, in una barra che nessuno collegava al riquadro
    // qui sotto — e infatti non lo premeva nessuno.
    //
    // Quello che resta nella barra in cima è solo l'identità: chi sei e
    // come scollegarti. Dire CHI sei e dire al sito COSA fare col video
    // restano due cose diverse, ma «collegati» non era l'una né l'altra:
    // era il primo passo della seconda.
    if (!bAttivo()) { return; }

    // La frase esatta, prima di tutto il resto: chi legge deve sapere che
    // cosa verrà detto a nome suo PRIMA di premere qualunque cosa — prima
    // ancora di collegarsi, non solo prima di accendere il lurk. Ha
    // flex-basis:100% e si prende una riga sua sopra al bottone.
    comandi.frase = crea('span', 'lurk__preavviso', '');
    comandi.frase.hidden = true;
    nodi.comandi.appendChild(comandi.frase);

    // Pieno e non vuoto: quando compare è la cosa che si sta chiedendo di
    // fare, e deve leggersi come tale. L'etichetta è quella della tessera in
    // cima — stessa parola, stesso collegamento, stessa sessione: due porte,
    // una stanza.
    comandi.entra = bottone(etichettaEntra(), 'btn btn--pieno', function () {
      const A = account();
      if (A) { A.entra(); }
    });
    comandi.entra.hidden = true;
    nodi.comandi.appendChild(comandi.entra);

    // L'eccezione, e una sola: quando l'interruttore non esiste — SDK filtrato
    // da un adblock, player in iframe manuale — non c'è nessuna accensione a
    // cui agganciare il messaggio, e chi si è collegato resterebbe con un
    // collegamento e nessun modo di usarlo. Il video però sta girando lo
    // stesso e quella persona sta lurkando davvero, quindi il messaggio è
    // legittimo: torna il rapporto 1:1 del §4.1, un clic e un messaggio, con
    // la frase dichiarata qui accanto prima del clic.
    if (!comandi.toggle) {
      comandi.manda = bottone(testo('manda'), 'btn btn--vuoto', mandaOra);
      comandi.manda.hidden = true;
      nodi.comandi.appendChild(comandi.manda);
    }

    // La tessera dell'account NON si costruisce più qui: sta in cima alla
    // sezione ed è js/account.js a riempirla, perché il profilo è del sito e
    // non di questo riquadro. Qui resta soltanto la porta contestuale — il
    // bottone che compare accendendo il lurk — che chiama lo stesso login.
  }

  /** L'etichetta del login, presa dal profilo del sito: è il suo bottone. */
  function etichettaEntra() {
    return frase(PROFILO.testi && PROFILO.testi.entra, 'Collegati con Twitch');
  }

  function dipingiComandi() {
    if (comandi.toggle) {
      comandi.toggle.setAttribute('aria-pressed', vivo.acceso ? 'true' : 'false');
      comandi.toggle.textContent = vivo.acceso ? testo('spegni') : testo('accendi');

      // A canale spento l'interruttore non si preme: non c'è nessuna sessione
      // video da tenere viva, e un bottone che risponde «non posso» è peggio
      // di un bottone spento. Il perché lo scrive scriviStato() nella riga
      // qui sotto — un bottone grigio senza spiegazione manda la gente a
      // ricaricare la pagina a caso.
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

    // --- Il login dentro il pannello del lurk ---------------------------
    // Il secondo ingresso, quello contestuale: compare accendendo il lurk,
    // accanto alla frase che verrà detta. È lo stesso collegamento e la
    // stessa sessione del bottone qui sopra — due porte, una stanza.
    const serveLogin = !vivo.collegato && (vivo.acceso || !comandi.toggle);
    comandi.entra.hidden = !serveLogin;

    // La frase, in due momenti diversi e con due parole diverse:
    //   non collegato, lurk acceso → l'invito, sopra al bottone del login;
    //   collegato, lurk spento     → il preavviso di cosa dirà l'accensione.
    // In tutti e due i casi la frase esatta si legge PRIMA di premere, che è
    // l'unico obbligo non negoziabile di questo blocco (CONTRATTO-3 §4.1).
    if (comandi.frase) {
      let riga = '';
      if (serveLogin) { riga = testo('invito'); }
      else if (vivo.collegato && !vivo.acceso) { riga = testo('preavviso'); }
      comandi.frase.hidden = !riga;
      comandi.frase.textContent = riga.replace(/\{frase\}/g, fraseProssima || '');
    }

    // Il bottone di ripiego, quando c'è: si disabilita solo mentre una
    // richiesta è per aria. A tetto esaurito resta premibile apposta, perché
    // il motivo lo dice invia() nella riga di stato, e un bottone spento
    // senza spiegazione è la cosa che manda la gente a ricaricare a caso.
    if (comandi.manda) {
      comandi.manda.hidden = !vivo.collegato;
      comandi.manda.disabled = inVolo;
    }
  }

  /* ------------------------------------------------------------------
     14. API pubblica — window.Lurk
     ------------------------------------------------------------------
     La consuma js/pollo.js, che si carica DOPO questo file apposta
     (CONTRATTO-3 §5.3). Come player.js, suStato chiama subito con lo stato
     corrente: chi arriva tardi non deve restare cieco in attesa di un
     cambiamento che potrebbe non arrivare mai.
     ------------------------------------------------------------------ */
  window.Lurk = {
    // fn({ acceso, salute, riavvii, daQuando, collegato, nome, inviati })
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },
    accendi: accendi,
    spegni: spegni
  };

  /* ------------------------------------------------------------------
     15. Avvio
     ------------------------------------------------------------------
     Il parziale è incluso solo se config.lurk.attivo è vero, quindi di norma
     senza #lurk non c'è niente da fare. Ma il file deve reggere anche il caso
     in cui il markup ci sia e la configurazione dica di no: in quel caso il
     pannello si toglie invece di restare lì con dei comandi che non
     servirebbero a niente.
     ------------------------------------------------------------------ */
  function ascoltaPlayer() {
    const P = window.Player;
    if (!P) { return; }

    if (typeof P.suStato === 'function') {
      P.suStato(function (stato) {
        // ATTENZIONE alla firma: arriva un OGGETTO, non un booleano. Leggere il
        // primo parametro come booleano darebbe sempre «in onda», perché un
        // oggetto è sempre truthy (la trappola del CONTRATTO-2 §6.2).
        const acceso = !!(stato && stato.inOnda);
        if (acceso === inOnda) { return; }
        inOnda = acceso;

        // Il canale è tornato (o se n'è andato): la sentinella deve saperlo
        // adesso, non fra venti secondi.
        if (vivo.acceso) { ciclo(); }

        // E l'interruttore con lei: si accende quando la diretta comincia e
        // si spegne quando finisce, senza aspettare che qualcuno lo prema
        // per scoprire che non si può.
        dipingiComandi();
        if (!vivo.acceso && !timerAvviso) { scriviStato(); }
      });
    }

    // La risposta di Twitch, per chi si è collegato: è l'unica che distingue
    // «la diretta è finita» da «il nostro video si è fermato», ed è quindi
    // l'unica che può spegnere il riquadro. Vedi il §10.
    if (window.Canale && typeof window.Canale.suStato === 'function') {
      window.Canale.suStato(function (c) {
        if (!c || typeof c.inOnda !== 'boolean') { return; }
        if (c.inOnda === false && vivo.acceso) { chiudiPerFineDiretta(); return; }
        dipingiComandi();
        if (!vivo.acceso && !timerAvviso) { scriviStato(); }
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

        // Gradino 1 del §3.2: gli eventi dell'SDK sono istantanei e
        // autorevoli. PAUSE arriva quando il browser (o l'utente) ferma il
        // video, e aspettare la sentinella costerebbe fino a venti secondi.
        if (d.fermo && !d.finito && inOnda) { concludiFermo(); }
      });
    }
  }

  /**
   * Il profilo del sito. Qui non si fa nessun login: si guarda chi c'è.
   *
   * `vivo.collegato`, `vivo.nome` e `vivo.avatar` restano nell'istantanea di
   * window.Lurk perché js/pollo.js ci legge dentro, ma sono una COPIA di
   * quello che dice window.Account: la fonte è una sola, e non è questa.
   */
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

      // Si è appena collegato mentre il lurk era già acceso: l'accensione
      // aveva già dichiarato che cosa avrebbe detto in chat, e la frase era
      // in pagina prima che si premesse «Collegati». Il messaggio parte
      // adesso, che è il primo momento in cui si può.
      if (!primaCollegato && vivo.collegato && vivo.acceso) { mandaOra(); }
    });
  }

  function ascoltaVisibilita() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }

      // In secondo piano i timer vanno a uno al minuto e poi si congelano del
      // tutto: al ritorno si fa subito un ciclo di recupero, così dopo due ore
      // di congelamento si scopre entro un secondo che il video è morto invece
      // che entro venti.
      if (vivo.acceso) {
        avviaSentinella();
        ciclo();
        aggiornaConto();
        battito();
      }

      // Il wake lock si perde da solo a ogni cambio di visibilità: si
      // riacquisisce SOLO se era stato chiesto, mai di iniziativa.
      if (vuoleSchermo && !presaSchermo) { chiediSchermo(true); }

      // Del token si occupa js/account.js, che si iscrive alla visibilità per
      // conto suo: qui non c'è più niente da rivalidare.
    });

    // pagehide e non unload: copre anche il ritorno indietro dalla cache di
    // navigazione. Lo schermo altrui non resta acceso per una pagina che non
    // si sta più guardando.
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
    if (!nodi.comandi) { return; }   // senza la barra non c'è niente da costruire

    // I testi si preparano una volta sola, con i ripieghi già applicati.
    Object.keys(RIPIEGHI).forEach(function (chiave) {
      TESTI[chiave] = frase(LURK.testi ? LURK.testi[chiave] : '', RIPIEGHI[chiave]);
    });

    preparaStato();
    nodi.lurk.setAttribute('data-salute', 'spento');
    costruisciComandi();
    dipingiComandi();
    dipingiAccesso();

    [ascoltaPlayer, ascoltaVisibilita].forEach(function (blocco) {
      try {
        blocco();
      } catch (err) {
        console.warn('[lurk] blocco non avviato:', err);
      }
    });

    // Senza i comandi del player si dichiara e ci si ferma: non c'è nessuna
    // sessione su cui intervenire, e un bottone che promette di tenerla viva
    // sarebbe una bugia.
    if (!comandiPronti()) {
      segnaSalute('niente');
    } else if (daLocale(CHIAVE_ACCESO) === '1') {
      // Era accesa alla visita precedente: lo si dice e si aspetta un clic. Il
      // sito non fa ripartire da solo un meccanismo che riavvia il player sul
      // computer di qualcun altro.
      if (nodi.statoTesto) { nodi.statoTesto.textContent = testo('ripresa'); }
    } else {
      scriviStato();
    }

    if (bAttivo()) {
      try {
        // La frase si pesca subito: l'invito la nomina, e un invito che
        // promette «dirò: «»» non promette niente.
        preparaFrase();
        ascoltaAccount();
      } catch (err) {
        console.warn('[lurk] il collegamento con Twitch non è partito:', err);
      }
    } else {
      // Spento: in locale si dice perché, invece di lasciare il riquadro
      // muto e chi lo guarda a chiedersi dove sia finito il login.
      try { scriviDiagnosi(); } catch (err) { /* è un aiuto, non un obbligo */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
