/* =====================================================================
   player.js — AGENTE 3 · player Twitch e chat del monitor

   Erede diretto di sito-backup/js/twitch-player.js: la logica di embed è
   quella già collaudata sul campo (costruzione dei `parent`, doppio
   iframe, rilevamento dello stato, degrado con adblock e con file://),
   riportata sui nuovi hook del CONTRATTO §5 e sulla forma di window.DATI
   descritta in §6.3.

   ---------------------------------------------------------------------
   DOVE VIVE ADESSO IL MONITOR
   ---------------------------------------------------------------------
   Con il CONTRATTO-2 §2.2 il monitor esce dalla copertina e diventa la
   sezione #diretta, larga fino a --max-larghezza: il video sta in 16/9
   pieno e la chat, da 1000px in su, è una colonna dentro il telaio. Gli
   id sono rimasti gli stessi (#twitch-embed, #twitch-chat, #monitor-lato,
   #chat-toggle, #monitor-badge, #monitor-titolo, #apri-twitch, #spia,
   #spia-testo, #spia-grande, #stato-testo, #ultima), quindi qui è
   cambiato solo ciò che dipende dalla scena: le misure stanno in
   css/player.css e il telaio è dell'agente 1 in css/diretta.css.

   La mascotte non passa più da qui: è un blocco suo (js/pollo.js), che si
   iscrive a window.Player per sapere cosa succede — vedi §14.

   ---------------------------------------------------------------------
   PERCHÉ DUE IFRAME DISTINTI E NON `Twitch.Embed`
   ---------------------------------------------------------------------
   `Twitch.Embed` con layout "video-with-chat" produce UN SOLO iframe le
   cui proporzioni e i cui breakpoint interni li decide Twitch: la chat
   non si può nascondere e il telaio del monitor non lo controlliamo più.
   Qui servono due cose separate:

     VIDEO -> new Twitch.Player(...) dentro #twitch-embed. È l'unico modo
              per avere gli eventi ufficiali READY / ONLINE / OFFLINE /
              PLAY / PLAYBACK_BLOCKED, da cui dipende lo stato «in onda»,
              continuando a possedere il contenitore.
     CHAT  -> iframe manuale su www.twitch.tv/embed/<canale>/chat dentro
              #twitch-chat, montato in modo PIGRO alla prima apertura.

   Così mostrare e nascondere la chat (attributo `hidden` su
   #monitor-lato) non tocca il video, che continua a riprodurre.

   Se `window.Twitch` non esiste — embed/v1.js bloccato da un adblock o
   da una rete che filtra — si degrada a un iframe manuale su
   player.twitch.tv: si perdono gli eventi di stato, la diretta resta
   guardabile. Se non carica nemmeno quello, al posto del buco nero
   compare un riquadro che spiega il motivo e porta su Twitch.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Dati e costanti
     ------------------------------------------------------------------
     Ogni lettura di window.DATI ha un ripiego: se js/dati.js manca (per
     esempio si apre il modello a mano) il player deve partire lo stesso,
     non lanciare eccezioni. ------------------------------------------ */
  const DATI = window.DATI || {};
  const TWITCH = DATI.twitch || {};
  const TESTI = DATI.testi || {};

  const CANALE = frase(TWITCH.canale, 'slayer_beard');
  const CANALE_ENC = encodeURIComponent(CANALE);
  const URL_CANALE = 'https://www.twitch.tv/' + CANALE_ENC;
  const URL_POPOUT = 'https://www.twitch.tv/popout/' + CANALE_ENC + '/chat';

  const T = {
    live: frase(TESTI.statoLive, 'In onda adesso'),
    offline: frase(TESTI.statoOffline, 'Fuori onda'),
    verifica: frase(TESTI.statoVerifica, 'Controllo il canale'),
    chatApri: frase(TESTI.chatApri, 'Mostra la chat'),
    chatChiudi: frase(TESTI.chatChiudi, 'Nascondi la chat')
  };

  const ID_PALCO = 'player-palco';   // il costruttore dell'SDK vuole un id o un Element
  const MAX_PARENT = 25;             // oltre, Twitch risponde errorCode=TooManyParents
  const ATTESA_STATO = 15000;        // rete di sicurezza: 8s sono pochi su mobile e reti lente
  const ATTESA_SCHELETRO = 10000;    // lo scheletro non resta mai appeso
  const ATTESA_IFRAME = 9000;        // iframe manuale che non emette `load`: lo diamo per bloccato
  const RICONTROLLO = 90000;         // riconciliazione periodica dello stato (vedi §5)

  /* ------------------------------------------------------------------
     2. Stato interno e riferimenti al DOM
     ------------------------------------------------------------------ */
  const stato = {
    avviato: false,
    modalita: null,      // 'sdk' | 'iframe' | 'avviso'
    inOnda: null,        // null = non ancora risolto
    risolto: false,
    dedotto: false,      // stato concluso dal timeout, non ricevuto dal player
    bloccato: false,     // autoplay negato dal browser: NON significa «fuori onda»
    titolo: null,        // titolo della diretta, se mai lo sapremo (vedi §5)
    player: null,
    parent: [],
    parentQS: '',
    chatMontata: false,     // l'iframe della chat esiste davvero nel DOM
    chatImpossibile: false, // modalità avviso: non c'è niente da montare
    chatAperta: false,
    scrive: false,          // deduzione, non certezza: vedi §10
    fuocoAgganciato: false,
    // Stato della RIPRODUZIONE, che è una cosa diversa dallo stato del CANALE
    // (`inOnda`). Il canale può essere acceso mentre il video è fermo perché
    // il browser ha sospeso la scheda: è esattamente il caso che js/lurk.js
    // deve riconoscere, e con `inOnda` da solo non si distingue.
    riproduce: false,
    finito: false,          // OFFLINE/ENDED RICEVUTO, non dedotto dal timeout
    ultimoPlay: 0,          // quando è ripartito: serve ad azzerare i tentativi
    tentativi: 0,           // riavvii leggeri fatti in questa pagina
    ricostruzioni: 0,       // ricostruzioni complete: tetto duro a 2
    timerStato: null,
    timerScheletro: null,
    timerIframe: null,
    timerRicontrollo: null
  };

  const nodi = {};
  const iscritti = [];       // suStato: chi vuole sapere se il canale è acceso
  const iscrittiChat = [];   // suChat: chi vuole sapere cosa succede nella chat
  const iscrittiVideo = [];  // suVideo: chi vuole sapere se il VIDEO sta girando

  /* ------------------------------------------------------------------
     3. Micro-aiuti — tutto protetto: se un hook manca, si tace
     ------------------------------------------------------------------ */
  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  function crea(tag, classe, testo) {
    const n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (testo != null) { n.textContent = testo; }
    return n;
  }

  function scrivi(nodo, testo) { if (nodo) { nodo.textContent = testo; } }

  // #chat-toggle contiene un <svg> più il testo: scrivere textContent sul
  // bottone cancellerebbe l'icona. Il testo va isolato una volta sola in un
  // nodo suo, e da lì in poi si aggiorna quello.
  function nodoEtichetta(bottone, classe) {
    if (!bottone) { return null; }

    const gia = bottone.querySelector('.' + classe);
    if (gia) { return gia; }

    const span = document.createElement('span');
    span.className = classe;

    for (let i = 0; i < bottone.childNodes.length; i++) {
      const n = bottone.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        span.textContent = n.nodeValue.trim();
        bottone.replaceChild(span, n);
        return span;
      }
    }

    bottone.appendChild(span);
    return span;
  }

  function collega(href, classe, testo) {
    const a = crea('a', classe, testo);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // Le due spie (#spia nel binario, #spia-grande nel quadro) portano sempre
  // uno solo dei tre stati: si toglie tutto e si rimette quello giusto.
  function spie(classe) {
    [nodi.spia, nodi.spiaGrande].forEach(function (n) {
      if (!n) { return; }
      n.classList.remove('is-live', 'is-offline', 'is-verifica');
      n.classList.add(classe);
    });
  }

  /* ------------------------------------------------------------------
     4. Lista `parent` — il punto più delicato dell'intero player
     ------------------------------------------------------------------
     Twitch rifiuta l'embed se l'hostname della pagina non compare fra i
     `parent`, e — verificato sul campo — un solo valore non valido fa
     cadere l'INTERA richiesta, quindi player e chat insieme. Regole:
       - si parte sempre da localhost, 127.0.0.1 e location.hostname, poi
         si aggiungono i domini configurati (DATI.twitch.domini);
       - mai la porta, mai lo schema: location.hostname, non location.host;
       - per Twitch "dominio.it" e "www.dominio.it" sono host DIVERSI e
         vanno dichiarati entrambi;
       - gli indirizzi IP (anche di rete locale) e le forme malformate si
         scartano prima di spedirli, altrimenti uccidono tutto il resto;
       - tetto a 25 voci, che è il limite imposto da Twitch.
     ------------------------------------------------------------------ */
  function normalizzaHost(grezzo) {
    if (typeof grezzo !== 'string') { return ''; }
    let h = grezzo.trim().toLowerCase();
    if (!h) { return ''; }

    h = h.replace(/^[a-z][a-z0-9+.\-]*:\/\//, '');    // via lo schema
    h = h.split('/')[0].split('?')[0].split('#')[0];  // via percorso, query, ancora
    h = h.split('@').pop();                           // via un eventuale utente:password@

    if (h.charAt(0) === '[') {
      // IPv6 fra parentesi quadre. Le si tolgono per pulizia, ma il valore
      // verrà comunque scartato dalla regex qui sotto ed è giusto così:
      // Twitch rifiuta qualunque forma di IPv6 come parent.
      const fine = h.indexOf(']');
      h = fine > -1 ? h.slice(1, fine) : h.slice(1);
    } else {
      h = h.split(':')[0];                            // via la porta
    }

    if (!h || h === 'null' || h === 'undefined') { return ''; }
    if (h.indexOf('..') > -1) { return ''; }
    if (!/^[a-z0-9][a-z0-9.\-]*$/.test(h)) { return ''; }
    return h;
  }

  function eIpV4(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }

  // Twitch accetta solo hostname per etichette (a-z 0-9 -, mai in prima o
  // ultima posizione) oppure gli host locali localhost / 127.0.0.1, per i
  // quali autorizza qualsiasi porta e sia http sia https. Ogni altro IP,
  // anche privato, viene rifiutato con errorCode=InvalidParent.
  const ETICHETTA = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  function parentValido(h) {
    if (h === 'localhost' || h === '127.0.0.1') { return true; }
    if (eIpV4(h)) { return false; }
    if (h.length > 253) { return false; }
    const parti = h.split('.');
    if (parti.length < 2) { return false; }
    return parti.every(function (p) { return ETICHETTA.test(p); });
  }

  function costruisciParent() {
    const extra = Array.isArray(TWITCH.domini) ? TWITCH.domini : [];
    const grezzi = ['localhost', '127.0.0.1', location.hostname].concat(extra);
    const elenco = [];

    function aggiungi(h) {
      if (h && parentValido(h) && elenco.indexOf(h) === -1 && elenco.length < MAX_PARENT) {
        elenco.push(h);
      }
    }

    grezzi.forEach(function (voce) {
      const h = normalizzaHost(voce);
      if (!h) { return; }
      aggiungi(h);
      if (h.indexOf('www.') === 0) {
        aggiungi(h.slice(4));
      } else if (h.split('.').length === 2 && !eIpV4(h)) {
        // Solo per i domini a due etichette: su un sottodominio il prefisso
        // "www." genererebbe un host inesistente che consuma uno dei 25 slot.
        aggiungi('www.' + h);
      }
    });

    return elenco;
  }

  function queryParent(elenco) {
    return elenco.map(function (h) { return 'parent=' + encodeURIComponent(h); }).join('&');
  }

  /* ------------------------------------------------------------------
     5. Stato «in onda» — come lo si deduce, e perché così
     ------------------------------------------------------------------
     Per chi NON si è collegato col profilo del sito non esiste un modo
     garantito di conoscere lo stato del canale: l'API Helix vuole un token
     e senza login non ce n'è nessuno. Gli eventi ONLINE/OFFLINE dell'SDK
     sono nati come eventi di TRANSIZIONE e la documentazione non promette
     che vengano emessi al caricamento. Quindi, come nella versione
     precedente:

       - segnali POSITIVI (ONLINE, PLAY, PLAYING) -> in onda. Se il video
         parte, il canale trasmette: è l'informazione più affidabile;
       - segnali negativi (OFFLINE, ENDED) -> fuori onda;
       - PLAYBACK_BLOCKED (autoplay negato) NON è «fuori onda»: tenerli
         distinti evita di scrivere «Fuori onda» sopra una diretta vera;
       - se dopo ATTESA_STATO non è arrivato niente si conclude «fuori
         onda», ma segnandolo come DEDOTTO, non come dato ricevuto.

     Per lo stesso motivo il titolo della diretta resta `null`: l'SDK non
     lo espone, nessun getter lo restituisce.

     Chi INVECE si è collegato ha un token, e allora la deduzione lascia il
     posto alla risposta vera: js/canale.js interroga helix/streams e la
     consegna qui con dichiara(), che scavalca tutto quello che segue —
     stato e titolo compresi. Vedi il cappello di dichiara() più sotto.
     ------------------------------------------------------------------ */
  function informa(fn) {
    try {
      // Primo argomento: l'oggetto storico, che non cambia forma perché
      // sito.js ci legge dentro. Secondo: lo stesso valore già in booleano,
      // per chi si aspetta la firma abbreviata del CONTRATTO-2 §6.2.
      fn({ inOnda: stato.inOnda === true, titolo: stato.titolo }, stato.inOnda === true);
    } catch (err) {
      console.warn('[player] un iscritto a suStato è andato in errore:', err);
    }
  }

  function risolvi(inOnda) {
    if (stato.timerStato) {
      clearTimeout(stato.timerStato);
      stato.timerStato = null;
    }

    const valore = !!inOnda;
    const cambiato = !stato.risolto || stato.inOnda !== valore;

    stato.inOnda = valore;
    stato.risolto = true;
    nascondiScheletro();

    if (!cambiato) { return; }
    dipingi();
    iscritti.forEach(informa);
  }

  /**
   * La risposta di Twitch, quando c'è: la porta js/canale.js con una
   * GET helix/streams fatta col token del profilo del sito.
   *
   * È l'unica sorgente AUTOREVOLE di questo file, e per questo scavalca
   * tutto il resto: `data` vuoto in helix/streams significa fuori onda, non
   * «non lo so», mentre il timeout del §5 conclude «fuori onda» perché non
   * ha visto arrivare niente — che è un'altra cosa e viene infatti segnata
   * come DEDOTTA. Da qui arriva anche il titolo della diretta, che l'SDK
   * non espone con nessun getter.
   *
   * Non tocca la riproduzione e non riavvia niente: dice com'è il CANALE,
   * e chi deve farci qualcosa (js/lurk.js) è già iscritto a suStato.
   */
  function dichiara(inOnda, titolo) {
    const valore = !!inOnda;
    const nuovo = (typeof titolo === 'string' && titolo.trim()) ? titolo.trim() : stato.titolo;
    const cambiaTitolo = nuovo !== stato.titolo;
    const cambiaStato = !stato.risolto || stato.inOnda !== valore;

    stato.titolo = nuovo;
    // Ricevuto, non concluso: se un domani si volesse distinguere in
    // interfaccia fra «lo so» e «lo deduco», la differenza è già qui.
    stato.dedotto = false;

    risolvi(valore);

    // risolvi() dipinge e avvisa solo quando lo stato cambia. Qui può
    // cambiare il solo titolo — diretta che continua e streamer che lo
    // riscrive — e chi è iscritto lo legge dallo stesso oggetto.
    if (!cambiaStato && cambiaTitolo) {
      dipingi();
      iscritti.forEach(informa);
    }
  }

  const RIPRODUZIONE_VIVA = ['Playing', 'Buffering'];
  const RIPRODUZIONE_SPENTA = ['Idle', 'Ended'];

  // Riconciliazione periodica. NON interroga Twitch: getPlayerState() legge
  // la cache locale che l'SDK aggiorna con i postMessage in arrivo
  // dall'iframe, quindi costa zero richieste di rete. Serve solo a
  // rimettere in pari l'interfaccia se un evento si è perso per strada —
  // per esempio quando la scheda è rimasta ore in secondo piano.
  function riconcilia() {
    if (stato.modalita !== 'sdk' || !stato.player) { return; }

    let situazione = null;
    try {
      if (typeof stato.player.getPlayerState === 'function') {
        situazione = stato.player.getPlayerState();
      }
    } catch (err) {
      return;   // l'SDK non è nello stato giusto: si riprova al giro dopo
    }
    if (!situazione || typeof situazione.playback !== 'string') { return; }

    if (RIPRODUZIONE_VIVA.indexOf(situazione.playback) > -1) {
      risolvi(true);
      return;
    }
    // «Idle»/«Ended» da soli non bastano a dichiarare il canale spento: con
    // l'autoplay negato il player resta Idle anche a diretta accesa, e prima
    // della prima risoluzione non c'è nulla con cui confrontarli.
    if (RIPRODUZIONE_SPENTA.indexOf(situazione.playback) > -1 && stato.risolto && !stato.bloccato) {
      risolvi(false);
    }
  }

  /* ------------------------------------------------------------------
     5-bis. Lo stato della RIPRODUZIONE — quello che serve al lurk
     ------------------------------------------------------------------
     `inOnda` risponde a «il canale sta trasmettendo?». Qui si risponde a
     un'altra domanda: «il video sta davvero girando su questo schermo?».
     Sono cose diverse, e il caso che le separa è proprio quello per cui
     esiste js/lurk.js: canale acceso, scheda sospesa dal browser, video
     fermo, spettatore che sparisce dal conteggio di Twitch.

     Tutto quello che sta qui legge la cache locale dell'SDK: nessuna
     richiesta di rete, nessun costo per Twitch. Vale la pena ripeterlo
     perché la tentazione di interrogare Helix ogni venti secondi sarebbe
     un ottimo modo di farsi limitare.
     ------------------------------------------------------------------ */

  // getCurrentTime() su una DIRETTA non è documentato: può restituire null,
  // NaN, zero fisso o lanciare. Non lo si usa mai per concludere «fermo»;
  // serve solo come conferma in più quando c'è. Se manca, chi lo legge deve
  // trovarsi `null` e trarne le sue conclusioni — cioè nessuna.
  function tempoDelVideo() {
    if (stato.modalita !== 'sdk' || !stato.player) { return null; }
    try {
      if (typeof stato.player.getCurrentTime !== 'function') { return null; }
      const t = stato.player.getCurrentTime();
      return (typeof t === 'number' && isFinite(t)) ? t : null;
    } catch (err) {
      return null;
    }
  }

  function riproduzione() {
    if (stato.modalita !== 'sdk' || !stato.player) { return null; }
    try {
      if (typeof stato.player.getPlayerState !== 'function') { return null; }
      const s = stato.player.getPlayerState();
      return (s && typeof s.playback === 'string') ? s.playback : null;
    } catch (err) {
      return null;
    }
  }

  function situazioneVideo() {
    const playback = riproduzione();
    return {
      riproduce: playback ? RIPRODUZIONE_VIVA.indexOf(playback) > -1 : stato.riproduce,
      // «fermo» solo DOPO che il video era partito almeno una volta: prima
      // della prima riproduzione «Idle» è la normalità, non un guasto.
      fermo: playback ? (RIPRODUZIONE_SPENTA.indexOf(playback) > -1 && stato.risolto) : false,
      bloccato: stato.bloccato === true,
      finito: stato.finito === true,
      modalita: stato.modalita,
      playback: playback,
      tempo: tempoDelVideo()
    };
  }

  function informaVideo(fn) {
    try {
      fn(situazioneVideo());
    } catch (err) {
      console.warn('[player] un iscritto a suVideo è andato in errore:', err);
    }
  }

  function avvisaVideo() { iscrittiVideo.forEach(informaVideo); }

  // Chiamata dagli eventi PLAY/PLAYING/ONLINE. Il contatore dei tentativi non
  // si azzera subito: un riavvio che dura tre secondi e poi ricade non è un
  // successo, e azzerarlo lì dentro produrrebbe un ciclo infinito di riavvii
  // "riusciti". Si azzera al primo controllo utile dopo SESSIONE_BUONA.
  const SESSIONE_BUONA = 60000;

  function segnaRiproduzione(attiva) {
    const cambiato = stato.riproduce !== attiva;
    stato.riproduce = attiva;
    if (attiva) {
      stato.finito = false;
      stato.ultimoPlay = Date.now();
    }
    if (cambiato) { avvisaVideo(); }
  }

  function forseAzzeraTentativi() {
    if (stato.riproduce && stato.ultimoPlay && (Date.now() - stato.ultimoPlay) > SESSIONE_BUONA) {
      stato.tentativi = 0;
    }
  }

  /* ------------------------------------------------------------------
     5-ter. Rimettere in moto il video — i freni contano più dei livelli
     ------------------------------------------------------------------
     Il tetto sta QUI e non in js/lurk.js apposta: questo è l'unico posto
     che sa quante istanze di Twitch.Player sono state create in questa
     pagina, e quindi quante volte si è già pagato il prezzo documentato
     al §12 (i listener `message` che l'SDK non rimuove). Un contatore
     tenuto dal chiamante è un contatore che prima o poi qualcuno azzera.
     ------------------------------------------------------------------ */
  const MAX_TENTATIVI = 6;
  const MAX_RICOSTRUZIONI = 2;

  function riparti(livello) {
    forseAzzeraTentativi();

    // 1. Senza SDK non ci sono comandi: l'iframe manuale non espone play().
    if (stato.modalita !== 'sdk' || !stato.player) { return Promise.resolve('impossibile'); }

    // 2. Il freno più importante di tutti. Un canale che ha DICHIARATO di
    //    aver chiuso non ha nessuna sessione da tenere viva, e insistere
    //    vorrebbe dire ricaricare il player a vuoto finché la pagina è
    //    aperta. Attenzione: vale solo per lo stato ricevuto, non per
    //    quello dedotto dal timeout, che è un'ipotesi e non un fatto.
    if (stato.finito) { return Promise.resolve('niente'); }

    // 3. L'autoplay negato non si sblocca da codice: serve un gesto umano.
    if (stato.bloccato) { return Promise.resolve('impossibile'); }

    // 4. Senza rete non si prova nemmeno. Si usa solo il verso affidabile:
    //    `false` è quasi sempre vero, `true` non garantisce niente.
    if (navigator.onLine === false) { return Promise.resolve('niente'); }

    // 5. Il tetto.
    if (stato.tentativi >= MAX_TENTATIVI) { return Promise.resolve('impossibile'); }

    // 6. Non si riavvia mai un player che sta funzionando davanti a
    //    qualcuno che lo sta guardando.
    const ora = situazioneVideo();
    if (ora.riproduce && document.visibilityState === 'visible') {
      return Promise.resolve('niente');
    }

    stato.tentativi++;

    try {
      if (livello >= 3) {
        if (stato.ricostruzioni >= MAX_RICOSTRUZIONI) { return Promise.resolve('impossibile'); }
        stato.ricostruzioni++;
        return ricostruisci();
      }
      if (livello === 2 && typeof stato.player.setChannel === 'function') {
        stato.player.setChannel(CANALE);
        return Promise.resolve('ripartito');
      }
      if (typeof stato.player.play === 'function') {
        stato.player.play();
        return Promise.resolve('ripartito');
      }
    } catch (err) {
      console.warn('[player] riavvio fallito al livello ' + livello + ':', err);
      return Promise.resolve('impossibile');
    }

    return Promise.resolve('impossibile');
  }

  // Ricostruzione completa: costosa e visibile (qualche secondo di nero).
  // Si paga anche la fuga di listener descritta al §12, ed è il motivo del
  // tetto a due per caricamento di pagina.
  function ricostruisci() {
    try {
      if (typeof stato.player.destroy === 'function') { stato.player.destroy(); }
    } catch (err) {
      // Un destroy che lancia non deve impedire il rimontaggio: al massimo
      // resta un iframe orfano, che è meno grave di un player che non torna.
      console.warn('[player] destroy ha lanciato, procedo comunque:', err);
    }
    stato.player = null;
    stato.modalita = null;
    if (nodi.palco) { nodi.palco.innerHTML = ''; }
    montaPlayer();
    return Promise.resolve(stato.modalita === 'sdk' ? 'ripartito' : 'impossibile');
  }

  // Togliere il muto aiuta davvero: Chrome ed Edge proteggono dalla
  // sospensione le schede «audible», non quelle che stanno solo riproducendo.
  // Va chiamata da un gesto dell'utente. Il sito non lo fa mai da solo, e in
  // particolare non esiste da nessuna parte un volume finto a 0,01 per
  // simulare l'audio: sarebbe il gonfiaggio artificiale che Twitch punisce.
  function smuta() {
    if (stato.modalita !== 'sdk' || !stato.player) { return false; }
    try {
      if (typeof stato.player.setMuted === 'function') {
        stato.player.setMuted(false);
        return true;
      }
    } catch (err) {
      console.warn('[player] setMuted non disponibile:', err);
    }
    return false;
  }

  /* ------------------------------------------------------------------
     6. Dallo stato all'interfaccia
     ------------------------------------------------------------------ */
  function dipingi() {
    if (!stato.risolto) {
      // Stato iniziale onesto: «controllo il canale», mai un falso «fuori
      // onda» prima di saperlo davvero.
      spie('is-verifica');
      scrivi(nodi.spiaTesto, T.verifica);
      scrivi(nodi.statoTesto, T.verifica);
      scrivi(nodi.monitorTitolo, T.verifica);
      if (nodi.badge) { nodi.badge.hidden = true; }
      return;
    }

    if (stato.inOnda === true) {
      spie('is-live');
      scrivi(nodi.spiaTesto, T.live);
      scrivi(nodi.statoTesto, T.live);
      // Il titolo vero della diretta non è disponibile senza Helix: in sua
      // assenza il monitor porta l'indirizzo del canale, che è comunque
      // un'informazione e non un riempitivo.
      scrivi(nodi.monitorTitolo, stato.titolo || 'twitch.tv/' + CANALE);
      if (nodi.badge) { nodi.badge.hidden = false; }
      return;
    }

    spie('is-offline');
    scrivi(nodi.spiaTesto, T.offline);
    scrivi(nodi.statoTesto, T.offline);
    scrivi(nodi.monitorTitolo, 'twitch.tv/' + CANALE);
    if (nodi.badge) { nodi.badge.hidden = true; }
    // Il valore pubblicato, ma solo finché nessuno ne ha portato uno più
    // fresco: js/canale.js, per chi si è collegato col profilo del sito,
    // chiede a Twitch il titolo vero dell'ultima diretta e marca il nodo.
    // Riscriverci sopra quello di ieri sarebbe un passo indietro.
    if (nodi.ultima && nodi.ultima.getAttribute('data-fonte') !== 'twitch'
        && frase(DATI.ultimaDiretta, '')) {
      nodi.ultima.textContent = DATI.ultimaDiretta;
    }
  }

  /* ------------------------------------------------------------------
     7. Guscio del player: palco, scheletro, montaggio
     ------------------------------------------------------------------ */
  function nascondiScheletro() {
    if (stato.timerScheletro) {
      clearTimeout(stato.timerScheletro);
      stato.timerScheletro = null;
    }
    if (nodi.scheletro) { nodi.scheletro.classList.add('is-fatto'); }
  }

  function costruisciGuscio() {
    nodi.video.textContent = '';
    // La classe è nostra: serve a dare a #twitch-embed il contesto di
    // posizionamento per palco, scheletro e riquadri, senza toccare le
    // regole di .monitor__video, che sono dell'agente C.
    nodi.video.classList.add('player__contenitore');
    nodi.video.classList.remove('is-avviso');

    nodi.palco = crea('div', 'player__palco');
    nodi.palco.id = ID_PALCO;

    nodi.scheletro = crea('div', 'player__scheletro');
    nodi.scheletro.setAttribute('aria-hidden', 'true');

    nodi.video.appendChild(nodi.palco);
    nodi.video.appendChild(nodi.scheletro);

    // Se `load` o READY non arrivassero mai, lo scheletro lo chiudiamo noi:
    // meglio un riquadro vuoto che un'animazione di caricamento infinita.
    stato.timerScheletro = setTimeout(function () {
      stato.timerScheletro = null;
      if (nodi.scheletro) { nodi.scheletro.classList.add('is-fatto'); }
    }, ATTESA_SCHELETRO);
  }

  function iframeManuale() {
    const f = document.createElement('iframe');
    f.className = 'player__iframe';
    f.src = 'https://player.twitch.tv/?channel=' + CANALE_ENC + '&' + stato.parentQS +
            '&muted=true&autoplay=true';
    f.title = 'Diretta Twitch di ' + CANALE;
    // `allowfullscreen` per i browser vecchi, `allow` per la Permissions
    // Policy moderna. Senza `allow="autoplay"` l'autoplay non parte nemmeno
    // con muted=true: è l'attributo che si dimentica più spesso.
    f.setAttribute('allowfullscreen', 'true');
    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    f.setAttribute('scrolling', 'no');
    f.setAttribute('frameborder', '0');
    f.addEventListener('load', function () {
      if (stato.timerIframe) {
        clearTimeout(stato.timerIframe);
        stato.timerIframe = null;
      }
      nascondiScheletro();
    }, { once: true });
    nodi.palco.appendChild(f);
    return f;
  }

  function montaPlayer() {
    let montato = false;

    if (window.Twitch && typeof window.Twitch.Player === 'function') {
      try {
        stato.player = new window.Twitch.Player(ID_PALCO, {
          channel: CANALE,
          parent: stato.parent,
          width: '100%',
          height: '100%',
          muted: true,      // senza `muted` il browser rifiuta l'autoplay
          autoplay: true
        });

        const P = window.Twitch.Player;

        stato.player.addEventListener(P.READY, function () {
          nascondiScheletro();
          // L'SDK etichetta il proprio iframe con un generico title="Twitch":
          // in una pagina italiana vale la pena sostituirlo.
          const f = nodi.palco && nodi.palco.querySelector('iframe');
          if (f) { f.title = 'Diretta Twitch di ' + CANALE; }
        });

        [P.ONLINE, P.PLAY, P.PLAYING].forEach(function (evento) {
          if (evento) {
            stato.player.addEventListener(evento, function () {
              risolvi(true);
              segnaRiproduzione(true);
            });
          }
        });

        [P.OFFLINE, P.ENDED].forEach(function (evento) {
          if (evento) {
            stato.player.addEventListener(evento, function () {
              risolvi(false);
              // Il canale ha DICHIARATO di aver chiuso: è il fatto che
              // impedisce a riparti() di rilanciare a vuoto (freno 2).
              stato.finito = true;
              segnaRiproduzione(false);
            });
          }
        });

        // PAUSE non era ascoltato da nessuno, ed è l'evento più importante
        // per la modalità lurk: è quello che arriva quando il browser (o
        // l'utente) ferma il video. Senza, una pausa restava invisibile fino
        // alla riconciliazione periodica, novanta secondi dopo.
        if (P.PAUSE) {
          stato.player.addEventListener(P.PAUSE, function () {
            segnaRiproduzione(false);
          });
        }

        if (P.PLAYBACK_BLOCKED) {
          stato.player.addEventListener(P.PLAYBACK_BLOCKED, function () {
            nascondiScheletro();
            stato.bloccato = true;
            stato.riproduce = false;
            nodi.video.classList.add('is-bloccato');
            avvisaVideo();
          });
        }

        montato = true;
        stato.modalita = 'sdk';
      } catch (err) {
        console.warn('[player] Twitch.Player non utilizzabile, passo all’iframe manuale:', err);
        stato.player = null;
      }
    }

    if (!montato) {
      // Degrado di primo livello: l'SDK non c'è (quasi sempre un adblock che
      // filtra embed.twitch.tv), ma l'iframe di solito passa lo stesso.
      stato.modalita = 'iframe';
      iframeManuale();
      // Se non carica nemmeno l'iframe, non si lascia un rettangolo nero.
      stato.timerIframe = setTimeout(function () {
        stato.timerIframe = null;
        mostraAvviso('bloccato');
      }, ATTESA_IFRAME);
    } else {
      agganciaCaricamento();
    }
  }

  // Lo scheletro sparisce al primo `load` dell'iframe. Con l'SDK l'iframe lo
  // crea Twitch: lo si cerca per qualche tentativo a tempo, limitati — niente
  // observer permanenti, niente cicli infiniti.
  function agganciaCaricamento() {
    let tentativi = 0;
    (function cerca() {
      if (!nodi.palco) { return; }
      const f = nodi.palco.querySelector('iframe');
      if (f) {
        f.addEventListener('load', nascondiScheletro, { once: true });
        return;
      }
      if (++tentativi < 20) { setTimeout(cerca, 100); }
    }());
  }

  function armaTimeoutStato() {
    stato.timerStato = setTimeout(function () {
      stato.timerStato = null;
      if (stato.risolto) { return; }
      // Nessun segnale dal player: si conclude «fuori onda», ma si registra
      // che è una deduzione, non un dato ricevuto.
      stato.dedotto = true;
      risolvi(false);
    }, ATTESA_STATO);
  }

  /* ------------------------------------------------------------------
     8. Schermo intero
     ------------------------------------------------------------------
     Twitch chiede che l'embed non venga coperto e il suo player ha già il
     proprio pulsante nei controlli in basso. Questo esiste perché il video
     sta dentro un telaio nostro e il gesto naturale è ingrandire quello:
     compare solo col mouse sopra o da tastiera, e su touch il CSS lo
     toglie del tutto.

     A schermo intero va SOLO #twitch-embed, non tutto il telaio: la chat
     resta nella pagina dietro. È voluto — a schermo pieno il video deve
     prendersi tutto lo schermo, e chi vuole leggere la chat esce o usa la
     finestra a parte. ------------------------------------------------- */
  function nodoPieno() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function chiamaPieno(fn, contesto) {
    if (!fn) { return; }
    const esito = fn.call(contesto);
    if (esito && typeof esito.catch === 'function') {
      esito.catch(function () { /* richiesta rifiutata: si ignora */ });
    }
  }

  function sincronizzaPieno() {
    if (!nodi.pieno || !nodi.video) { return; }
    const attivo = nodoPieno() === nodi.video;
    const etichetta = attivo ? 'Esci da schermo intero' : 'Schermo intero';
    scrivi(nodi.pieno.querySelector('.player__pieno-testo'), etichetta);
    nodi.pieno.setAttribute('aria-label', etichetta);
    nodi.pieno.title = etichetta;
    nodi.pieno.classList.toggle('is-attivo', attivo);
    nodi.video.classList.toggle('is-pieno', attivo);
  }

  function preparaPieno() {
    const richiedi = nodi.video.requestFullscreen || nodi.video.webkitRequestFullscreen;
    if (!richiedi) { return; }   // es. iOS Safari sui <div>: niente API, niente bottone morto

    nodi.pieno = crea('button', 'player__pieno');
    nodi.pieno.type = 'button';
    nodi.pieno.appendChild(crea('span', 'player__pieno-icona'));
    nodi.pieno.appendChild(crea('span', 'player__pieno-testo', 'Schermo intero'));
    nodi.pieno.addEventListener('click', function () {
      try {
        if (nodoPieno()) {
          chiamaPieno(document.exitFullscreen || document.webkitExitFullscreen, document);
        } else {
          chiamaPieno(richiedi, nodi.video);
        }
      } catch (err) { /* niente schermo intero: non è un guasto */ }
    });
    nodi.video.appendChild(nodi.pieno);

    document.addEventListener('fullscreenchange', sincronizzaPieno);
    document.addEventListener('webkitfullscreenchange', sincronizzaPieno);
    sincronizzaPieno();
  }

  /* ------------------------------------------------------------------
     9. Chat — guscio e montaggio pigro
     ------------------------------------------------------------------ */
  function costruisciChat() {
    nodi.chat.textContent = '';
    nodi.chat.classList.add('chat__contenitore');
    // Ripartendo dopo un'assenza di rete il vecchio iframe è appena stato
    // staccato: tenerne il riferimento farebbe confrontare il fuoco con un
    // nodo che non è più in pagina.
    nodi.chatIframe = null;

    const testa = crea('div', 'chat__testa');
    testa.appendChild(crea('span', 'chat__titolo', 'Chat del canale'));

    // Via d'uscita per chi ha i cookie di terze parti bloccati: dentro
    // l'iframe risulterebbe scollegato e non potrebbe scrivere.
    const popout = collega(URL_POPOUT, 'chat__popout', 'Finestra a parte');
    popout.title = 'Apri la chat in una finestra separata';
    testa.appendChild(popout);

    nodi.chatChiudi = crea('button', 'chat__chiudi', '✕');
    nodi.chatChiudi.type = 'button';
    nodi.chatChiudi.setAttribute('aria-label', T.chatChiudi);
    nodi.chatChiudi.addEventListener('click', function () { apriChat(false, true); });
    testa.appendChild(nodi.chatChiudi);

    nodi.chatTelaio = crea('div', 'chat__telaio');
    nodi.chatScheletro = crea('div', 'chat__scheletro');
    nodi.chatScheletro.setAttribute('aria-hidden', 'true');
    nodi.chatTelaio.appendChild(nodi.chatScheletro);

    nodi.chat.appendChild(testa);
    nodi.chat.appendChild(nodi.chatTelaio);
  }

  function montaChat() {
    // chatImpossibile è la modalità avviso: lì al posto dell'iframe c'è il
    // riquadro spiegato, e non si deve montare niente.
    if (stato.chatMontata || stato.chatImpossibile || !nodi.chatTelaio) { return; }
    stato.chatMontata = true;

    const f = document.createElement('iframe');
    f.className = 'chat__iframe';
    // Forma attestata: www.twitch.tv/embed/<canale>/chat, con `darkpopout`
    // come flag nudo (tema scuro: non documentato, ma funzionante e non
    // deprecato). Niente attributo `sandbox`: è opzionale e, se incompleto
    // anche di una sola voce, rompe il login e l'invio dei messaggi.
    f.src = 'https://www.twitch.tv/embed/' + CANALE_ENC + '/chat?' + stato.parentQS + '&darkpopout';
    f.title = 'Chat Twitch di ' + CANALE;
    f.setAttribute('scrolling', 'no');
    f.setAttribute('frameborder', '0');
    f.addEventListener('load', function () {
      if (nodi.chatScheletro) { nodi.chatScheletro.classList.add('is-fatto'); }
    }, { once: true });

    nodi.chatIframe = f;
    nodi.chatTelaio.appendChild(f);
  }

  /* ------------------------------------------------------------------
     10. Apertura, chiusura e notifica di cosa succede nella chat
     ------------------------------------------------------------------
     Il markup arriva con #monitor-lato[hidden] e il bottone ad
     aria-expanded="false": la chat parte chiusa e resta chiusa finché non
     la si chiede. Così senza JS non resta un pannello vuoto, e l'iframe
     della chat non viene nemmeno scaricato se nessuno lo apre.
     Chiudere NON smonta l'iframe: riaprire è istantaneo e il video non si
     ricarica mai, perché sono due iframe separati.

     COSA SIGNIFICA `scrive`, E SOPRATTUTTO COSA NON SIGNIFICA
     L'iframe della chat sta su www.twitch.tv: è un'altra origine, quindi
     dalla pagina NON si leggono i tasti premuti, NON si sa se un
     messaggio è stato inviato davvero e nemmeno se dentro l'iframe il
     cursore è nella casella di testo o sull'elenco dei messaggi. L'unica
     cosa che il browser lascia osservare è che il fuoco è finito dentro
     quell'iframe: la finestra emette `blur` e document.activeElement
     diventa l'elemento <iframe>.

     `scrive` è quindi una DEDUZIONE — «il fuoco sta nella chat, è
     probabile che stia scrivendo» — e chi la consuma (js/pollo.js, che ci
     fa reagire la mascotte) deve saperlo: una reazione sbagliata di tanto
     in tanto è nell'ordine delle cose. Torna falso quando la finestra
     riprende il fuoco, quando la scheda passa in secondo piano e quando
     la chat viene chiusa. Il caso che resta impreciso è chi passa a
     un'altra applicazione con il fuoco nella chat: lì il browser non dice
     più niente finché non si torna sulla pagina.
     ------------------------------------------------------------------ */
  function statoChat() {
    return {
      aperta: stato.chatAperta,
      scrive: stato.scrive,
      montata: stato.chatMontata
    };
  }

  function informaChat(fn) {
    try {
      fn(statoChat());
    } catch (err) {
      console.warn('[player] un iscritto a suChat è andato in errore:', err);
    }
  }

  function annunciaChat() { iscrittiChat.forEach(informaChat); }

  function impostaScrive(valore) {
    const v = !!valore;
    if (stato.scrive === v) { return; }   // solo i cambi veri fanno rumore
    stato.scrive = v;
    annunciaChat();
  }

  function fuocoNellaChat() {
    return stato.chatAperta && !!nodi.chatIframe &&
           document.activeElement === nodi.chatIframe;
  }

  function alBlurFinestra() {
    // Alcuni browser aggiornano document.activeElement subito DOPO aver
    // emesso `blur`: si legge al giro successivo del ciclo eventi, così la
    // verifica vale ovunque e non solo dove l'ordine ci è comodo.
    setTimeout(function () { impostaScrive(fuocoNellaChat()); }, 0);
  }

  function alFocusFinestra() { impostaScrive(false); }

  function agganciaFuoco() {
    if (stato.fuocoAgganciato) { return; }   // avvia() può ripartire (vedi §11)
    stato.fuocoAgganciato = true;
    window.addEventListener('blur', alBlurFinestra);
    window.addEventListener('focus', alFocusFinestra);
  }

  function apriChat(aperta, tornaAlBottone) {
    stato.chatAperta = !!aperta;

    if (nodi.lato) { nodi.lato.hidden = !stato.chatAperta; }

    if (nodi.chatToggle) {
      nodi.chatToggle.setAttribute('aria-expanded', stato.chatAperta ? 'true' : 'false');
      scrivi(nodi.chatEtichetta, stato.chatAperta ? T.chatChiudi : T.chatApri);
    }

    if (stato.chatAperta) {
      montaChat();
    } else {
      // Chiusa: l'iframe finisce dietro a [hidden], non può più avere il
      // fuoco e qualunque deduzione su chi scrive decade.
      stato.scrive = false;
      if (tornaAlBottone && nodi.chatToggle) {
        // Chiusura dalla X interna: il focus non deve finire sul <body>.
        try { nodi.chatToggle.focus(); } catch (err) { /* non critico */ }
      }
    }

    // Una sola notifica per apertura o chiusura: montaChat() non annuncia da
    // sé perché viene chiamata solo da qui.
    annunciaChat();
  }

  /* ------------------------------------------------------------------
     11. Riquadro di avviso — al posto del buco nero
     ------------------------------------------------------------------
     motivo: 'file'     -> pagina aperta con doppio clic (protocollo file:)
             'host'     -> indirizzo che Twitch non accetta come parent
             'rete'     -> browser senza connessione
             'bloccato' -> SDK e iframe non caricati (adblock o rete filtrata)
     ------------------------------------------------------------------ */
  function copiaNegliAppunti(testo, bottone) {
    const originale = bottone.textContent;
    const ripristina = function () {
      setTimeout(function () { bottone.textContent = originale; }, 1800);
    };
    const fatto = function () { bottone.textContent = 'Copiato'; ripristina(); };
    const storico = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = testo;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        fatto();
      } catch (err) {
        bottone.textContent = 'Seleziona e copia';
        ripristina();
      }
    };

    // Con file:// il contesto non è sicuro e navigator.clipboard può non
    // esistere: si passa direttamente al metodo storico.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(testo).then(fatto, storico);
    } else {
      storico();
    }
  }

  function bloccoComando(comando) {
    const riga = crea('div', 'player__comando');
    riga.appendChild(crea('code', 'player__comando-testo', comando));
    const b = crea('button', 'player__comando-copia', 'Copia');
    b.type = 'button';
    b.setAttribute('aria-label', 'Copia il comando: ' + comando);
    b.addEventListener('click', function () { copiaNegliAppunti(comando, b); });
    riga.appendChild(b);
    return riga;
  }

  function costruisciAvviso(motivo, compatto) {
    const box = crea('div', 'player__riquadro' + (compatto ? ' player__riquadro--compatto' : ''));
    const cosa = compatto ? 'La chat' : 'Il player';

    if (motivo === 'host') {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Indirizzo non autorizzato'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non parte da questo indirizzo'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Twitch autorizza l’incorporamento solo verso un nome di dominio e rifiuta gli indirizzi IP ' +
        'come ' + (location.hostname || 'questo') + '. Apri il sito da localhost, oppure aggiungi il ' +
        'dominio pubblico all’elenco dei domini autorizzati dal pannello.'));

    } else if (motivo === 'rete') {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Rete assente'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non può caricarsi senza connessione'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Il browser risulta scollegato dalla rete, quindi l’incorporamento di Twitch non si può ' +
        'scaricare. Quando la connessione torna riparte da solo: non serve ricaricare la pagina.'));

    } else if (motivo === 'bloccato') {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Caricamento bloccato'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non si carica'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Il componente di Twitch non è arrivato: quasi sempre è un’estensione che blocca la pubblicità, ' +
        'oppure una rete che filtra i domini di Twitch. Il canale resta guardabile sul sito di Twitch, ' +
        'e il resto della pagina funziona normalmente.'));

    } else {
      box.appendChild(crea('span', 'player__riquadro-etichetta', 'Anteprima locale'));
      box.appendChild(crea('h3', 'player__riquadro-titolo', cosa + ' non parte da un file locale'));
      box.appendChild(crea('p', 'player__riquadro-testo',
        'Twitch autorizza l’incorporamento solo verso un dominio dichiarato, e con il protocollo ' +
        'file:// non esiste nessun hostname da autorizzare: serve un piccolo server locale.'));

      if (!compatto) {
        // Su Windows `python` spesso non è nel PATH: il comando che funziona
        // davvero è il launcher `py`.
        box.appendChild(bloccoComando('py -m http.server 5173'));
        box.appendChild(crea('p', 'player__riquadro-oppure', 'oppure, con Node:'));
        box.appendChild(bloccoComando('npx serve .'));
        box.appendChild(crea('p', 'player__riquadro-testo player__riquadro-testo--tenue',
          'Poi apri http://localhost:5173 : player e chat partono da soli.'));
      }
    }

    box.appendChild(collega(URL_CANALE, 'player__riquadro-btn', 'Apri il canale su Twitch'));
    return box;
  }

  function mostraAvviso(motivo) {
    if (stato.modalita === 'avviso') { return; }
    stato.modalita = 'avviso';
    fermaTimer();

    if (nodi.video) {
      nodi.video.textContent = '';
      nodi.video.classList.add('player__contenitore', 'is-avviso');
      nodi.video.appendChild(costruisciAvviso(motivo, false));
    }
    if (nodi.chat) {
      nodi.chat.textContent = '';
      nodi.chat.classList.add('chat__contenitore', 'is-avviso');
      nodi.chat.appendChild(costruisciAvviso(motivo, true));
    }

    nodi.palco = null;
    nodi.scheletro = null;
    nodi.pieno = null;
    nodi.chatTelaio = null;
    nodi.chatScheletro = null;
    nodi.chatIframe = null;
    // Qui un iframe da montare non c'è: lo si dichiara impossibile invece di
    // fingere che sia già montato, altrimenti suChat racconterebbe agli
    // iscritti una chat che non esiste.
    stato.chatImpossibile = true;
    stato.chatMontata = false;
    stato.scrive = false;
    stato.player = null;
    annunciaChat();

    // Differito di un giro: sito.js si iscrive con `defer` dopo di noi, e una
    // notifica sincrona qui la perderebbe chi non è ancora arrivato.
    setTimeout(function () { risolvi(false); }, 0);

    if (motivo === 'rete') {
      // Se la connessione torna si riprova, una volta sola: ricaricare la
      // pagina non deve essere compito dell'utente.
      window.addEventListener('online', function () {
        // Si riparte da zero: senza azzerare anche questi, la chat
        // risulterebbe già montata e il suo iframe non verrebbe mai creato.
        stato.avviato = false;
        stato.modalita = null;
        stato.chatMontata = false;
        stato.chatImpossibile = false;
        stato.chatAperta = false;
        stato.scrive = false;
        stato.risolto = false;
        stato.inOnda = null;
        stato.dedotto = false;
        stato.bloccato = false;
        avvia();
      }, { once: true });
    }
  }

  /* ------------------------------------------------------------------
     12. Pulizia
     ------------------------------------------------------------------ */
  function fermaTimer() {
    [['timerStato', clearTimeout], ['timerScheletro', clearTimeout],
      ['timerIframe', clearTimeout], ['timerRicontrollo', clearInterval]
    ].forEach(function (voce) {
      if (stato[voce[0]]) {
        voce[1](stato[voce[0]]);
        stato[voce[0]] = null;
      }
    });
  }

  function allaVisibilita() {
    if (document.visibilityState === 'visible') {
      riconcilia();   // si disinnesca da sé se non c'è un player SDK
    } else {
      // Scheda in secondo piano: qualunque cosa il visitatore stesse
      // scrivendo nella chat, adesso non la sta scrivendo.
      impostaScrive(false);
    }
  }

  function smonta() {
    fermaTimer();
    document.removeEventListener('fullscreenchange', sincronizzaPieno);
    document.removeEventListener('webkitfullscreenchange', sincronizzaPieno);
    document.removeEventListener('visibilitychange', allaVisibilita);
    window.removeEventListener('blur', alBlurFinestra);
    window.removeEventListener('focus', alFocusFinestra);
    stato.fuocoAgganciato = false;
    stato.scrive = false;
    // destroy() stacca l'iframe e i listener dell'SDK. Non si ricrea nulla:
    // una sola istanza per pagina, perché ogni `new Twitch.Player` lascia
    // dietro di sé un listener `message` che l'SDK non rimuove mai.
    if (stato.player && typeof stato.player.destroy === 'function') {
      try { stato.player.destroy(); } catch (err) { /* niente da fare */ }
    }
    stato.player = null;
  }

  /* ------------------------------------------------------------------
     13. Avvio
     ------------------------------------------------------------------ */
  function raccogliNodi() {
    nodi.video = document.getElementById('twitch-embed');
    nodi.chat = document.getElementById('twitch-chat');
    // Il pannello laterale è .monitor__lato: l'id è la via preferita, la
    // classe e il genitore della chat sono le reti di sicurezza.
    nodi.lato = document.getElementById('monitor-lato') ||
                document.querySelector('.monitor__lato') ||
                (nodi.chat && nodi.chat.parentElement);
    nodi.chatToggle = document.getElementById('chat-toggle');
    nodi.monitorTitolo = document.getElementById('monitor-titolo');
    nodi.badge = document.getElementById('monitor-badge');
    nodi.spia = document.getElementById('spia');
    nodi.spiaTesto = document.getElementById('spia-testo');
    nodi.spiaGrande = document.getElementById('spia-grande');
    nodi.statoTesto = document.getElementById('stato-testo');
    nodi.ultima = document.getElementById('ultima');
    nodi.apriTwitch = document.getElementById('apri-twitch');
  }

  function avvia() {
    if (stato.avviato) { return; }
    stato.avviato = true;

    raccogliNodi();
    dipingi();   // «controllo il canale», con la spia neutra

    if (nodi.apriTwitch) {
      if (!nodi.apriTwitch.getAttribute('href')) { nodi.apriTwitch.href = URL_CANALE; }
      nodi.apriTwitch.target = '_blank';
      nodi.apriTwitch.rel = 'noopener noreferrer';
    }

    if (nodi.chatToggle) {
      nodi.chatToggle.addEventListener('click', function () {
        apriChat(!stato.chatAperta, false);
      });
      if (!nodi.chatToggle.hasAttribute('aria-controls')) {
        nodi.chatToggle.setAttribute('aria-controls', 'twitch-chat');
      }
      // Allinea l'etichetta ai testi dei contenuti anche prima del primo clic,
      // senza toccare l'icona che sta nello stesso bottone.
      nodi.chatEtichetta = nodoEtichetta(nodi.chatToggle, 'js-etichetta');
      scrivi(nodi.chatEtichetta, T.chatApri);
      nodi.chatToggle.setAttribute('aria-expanded', 'false');
    }
    if (nodi.lato) { nodi.lato.hidden = true; }

    if (!nodi.video && !nodi.chat) { return; }   // pagina senza monitor: niente da fare

    if (navigator.onLine === false) {
      mostraAvviso('rete');
      return;
    }

    const parent = costruisciParent();
    // L'host che serve la pagina DEVE comparire fra i parent: se non c'è
    // (tipicamente un IP di rete locale, quando si prova il sito dal
    // telefono) Twitch rifiuta l'iframe e resterebbe un rettangolo nero
    // senza spiegazioni.
    const mioHost = normalizzaHost(location.hostname);
    const autorizzato = !mioHost || parent.indexOf(mioHost) > -1;

    if (location.protocol === 'file:' || !parent.length || !autorizzato) {
      mostraAvviso(location.protocol === 'file:' ? 'file' : 'host');
      return;
    }

    stato.parent = parent;
    stato.parentQS = queryParent(parent);

    if (nodi.video) {
      costruisciGuscio();
      montaPlayer();
      preparaPieno();
      armaTimeoutStato();   // solo se c'è davvero un player che può rispondere
      stato.timerRicontrollo = setInterval(riconcilia, RICONTROLLO);
    }

    if (nodi.chat) {
      costruisciChat();
      agganciaFuoco();
    }

    // Serve sia alla riconciliazione dello stato sia a spegnere `scrive`
    // quando la scheda passa dietro: si aggancia una volta per entrambi.
    document.addEventListener('visibilitychange', allaVisibilita);

    // La rete che cade A METÀ sessione non era gestita: il listener `online`
    // esisteva solo dentro mostraAvviso('rete'), cioè solo quando la rete
    // mancava già all'avvio. Se cadeva dopo, il player moriva in silenzio e
    // nessuno se ne accorgeva. Questi due sono permanenti e servono al lurk,
    // che deve sapere se ha senso provare a riavviare.
    window.addEventListener('offline', function () {
      segnaRiproduzione(false);
    });
    window.addEventListener('online', function () {
      // Non si riavvia niente da qui: si dice solo che si può riprovare.
      // Decidere se e quando rimettere in moto il video è di js/lurk.js,
      // che è l'unico a sapere se il visitatore lo ha chiesto.
      avvisaVideo();
    });

    // `pagehide` copre anche il ritorno indietro dalla cache di navigazione,
    // dove `unload` non viene emesso.
    window.addEventListener('pagehide', smonta, { once: true });
  }

  /* ------------------------------------------------------------------
     14. API pubblica — chi ha bisogno del player si iscrive qui
     ------------------------------------------------------------------
     Firme fissate dal CONTRATTO-2 §6.2. Entrambe chiamano subito la
     funzione con lo stato corrente al momento dell'iscrizione, così chi
     arriva tardi (pollo.js è l'ultimo script della pagina) non resta
     cieco in attesa del prossimo cambiamento, che potrebbe non arrivare
     mai. Nessun iscritto può far cadere il player: ogni chiamata è
     protetta, un errore di un iscritto finisce in console e basta.
     ------------------------------------------------------------------ */
  window.Player = {
    // fn({ inOnda, titolo }) — invariata: sito.js legge le proprietà
    // dell'oggetto. Il booleano arriva anche come secondo argomento.
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },

    // fn({ aperta, scrive, montata }) — `scrive` è la deduzione descritta
    // nel cappello del §10: fuoco dentro l'iframe, non certezza di tasti
    // premuti né di messaggi inviati.
    suChat: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscrittiChat.push(fn);
      informaChat(fn);
    },

    // --- CONTRATTO-3 §5.1: quello che serve alla modalità lurk ---

    // fn({ riproduce, fermo, bloccato, finito, modalita, playback, tempo })
    // Riguarda il VIDEO, non il canale: vedi il cappello del §5-bis.
    suVideo: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscrittiVideo.push(fn);
      informaVideo(fn);
    },

    // Lo stesso oggetto, letto al momento. Zero richieste di rete: legge la
    // cache che l'SDK aggiorna coi postMessage dell'iframe.
    diagnostica: situazioneVideo,

    // dichiara(inOnda, titolo) — la risposta di Twitch, non una deduzione.
    // La chiama js/canale.js con quello che dice helix/streams; nessun altro
    // deve chiamarla, perché nessun altro ha una fonte autorevole.
    dichiara: dichiara,

    // -> Promise<'ripartito'|'niente'|'impossibile'>
    //   'ripartito'   ha provato qualcosa
    //   'niente'      c'è un motivo per non fare nulla ADESSO (canale spento,
    //                 rete giù, video che sta già andando): riprovare più tardi
    //                 ha senso
    //   'impossibile' non ha senso riprovare in questa pagina
    riparti: riparti,

    // Va chiamata da un gesto dell'utente, altrimenti il browser la ignora.
    smuta: smuta
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
