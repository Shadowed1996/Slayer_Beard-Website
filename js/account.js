/* =====================================================================
   account.js — il profilo del sito, autenticato da Twitch

   È il login del sito, non un pezzo della modalità lurk. Prima viveva
   dentro js/lurk.js e ne condivideva la sorte: col messaggio in chat
   spento non esisteva nessun modo di collegarsi, e quindi non esisteva
   nemmeno il profilo. Adesso è il contrario — c'è un profilo del sito, e
   il messaggio in chat del lurk è uno dei suoi usi.

   CHI SI APPOGGIA QUI
     js/canale.js  chiede a Twitch quello che senza token non si può
                   sapere: se il canale è davvero in onda e il titolo
                   dell'ultima diretta (che senza questo resterebbe
                   quello scritto a mano nel pannello, e invecchierebbe).
     js/lurk.js    per il messaggio in chat: senza un account non c'è
                   nessuno a nome di cui parlare.

   COSA NON FA. Non ricorda nessuno. Il token vive in sessionStorage e
   muore con la scheda, non esiste nessun «resta collegato», e «Scollega»
   chiama davvero la revoca su Twitch invece di limitarsi a dimenticare.
   Non è una scelta di prudenza generica: il token che l'utente concede
   permette di scrivere in QUALSIASI canale di Twitch a suo nome —
   `broadcaster_id` è un parametro della richiesta, non un vincolo del
   token — e una cosa del genere non si lascia su un disco.

   IL LOGIN SI APRE IN UNA FINESTRELLA, e non è una preferenza estetica:
   l'implicit grant è una navigazione, e farla nella stessa scheda vuol
   dire ricaricare la pagina — cioè spegnere il lurk e fermare il video,
   rompendo per fare il login la sessione che il login accompagnava. Il
   pezzo dentro la finestrella è js/ritorno.js. Se il browser blocca le
   finestrelle si ricade sul redirect classico.

   INDICE
     1. Dati e costanti
     2. Micro-aiuti
     3. Quando il profilo è spento, e perché
     4. Il login (implicit grant): finestrella e redirect
     5. Validazione, profilo e revoca
     6. La tessera
     7. API pubblica — window.Account
     8. Avvio
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Dati e costanti
     ------------------------------------------------------------------
     Tutto arriva da window.DATI.account, che lo genera
     server/lib/costruisci.js con accountDi(). Le invarianti sono già
     imposte in generazione, ma js/dati.js è un file che si può modificare
     a mano dopo la generazione: un freno che vive solo dove non gira non
     è un freno, quindi qui si rifanno tutti i controlli.
     ------------------------------------------------------------------ */
  const DATI = window.DATI || {};
  const CONF = DATI.account || null;
  const LURK = DATI.lurk || {};

  const CLIENT_ID = String((CONF && CONF.clientId) || '').trim();

  // Gli scope si chiedono in base a quello che il sito fa davvero, non «per
  // sicurezza»: chiedere il permesso di scrivere in chat a chi vuole soltanto
  // vedere il proprio nome in cima alla pagina sarebbe chiedere troppo, e la
  // schermata di Twitch lo direbbe a chiare lettere.
  const SCOPE = (LURK.messaggio && LURK.messaggio.attivo === true) ? 'user:write:chat' : '';

  // Tutto quello che riguarda il token sta in sessionStorage e muore con la
  // scheda. Niente localStorage: qui non c'è niente da ricordare.
  const CHIAVE_STATO_OAUTH = 'sb-account-state';
  const CHIAVE_TOKEN = 'sb-account-token';
  const CHIAVE_VALIDATO = 'sb-account-validato';
  const CHIAVE_NOME = 'sb-account-nome';
  const CHIAVE_UTENTE = 'sb-account-utente';
  const CHIAVE_AVATAR = 'sb-account-avatar';

  const VALIDITA = 3600000;   // Twitch impone di rivalidare il token ogni ora
  // Una validazione di mezzo minuto fa è la stessa validazione. Serve al
  // ritorno dalla finestrella, dove si valida il token appena arrivato e
  // subito dopo lo si usa: senza questa soglia sarebbero due richieste
  // identiche a mezzo secondo l'una dall'altra. La regola di Twitch è «ogni
  // ora, e prima di ogni uso», non «due volte nello stesso secondo».
  const FRESCHEZZA = 30000;
  const DURATA_AVVISO = 8000;

  const RIPIEGHI = {
    entra: 'Collegati con Twitch',
    esci: 'Scollega e revoca',
    collegato: 'Collegato come {nome}'
  };

  const TESTI = {};
  const nodi = {};
  const comandi = {};
  const iscritti = [];

  // Lo stato che window.Account pubblica. È l'unica fonte: niente si legge
  // dal DOM, e niente si deduce dalla presenza di un bottone.
  const vivo = {
    collegato: false,
    id: '',
    nome: '',
    avatar: '',
    occupato: false      // una richiesta di collegamento o di revoca è per aria
  };

  let statoAtteso = '';        // lo `state` della richiesta OAuth in corso
  let laFinestra = null;       // la finestrella del login, quando c'è
  let timerFinestra = null;    // sorveglia se viene chiusa a mano
  let timerAvviso = null;
  let ascoltoAperto = false;   // gli ascolti del ritorno si mettono una volta sola

  /* ------------------------------------------------------------------
     2. Micro-aiuti — tutto protetto: dove il browser può lanciare, si tace
     ------------------------------------------------------------------ */
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

  // In navigazione privata l'accesso allo storage può lanciare da solo, prima
  // ancora di leggere: per questo anche il get è avvolto.
  function daSessione(chiave) {
    try { return sessionStorage.getItem(chiave); } catch (err) { return null; }
  }

  function inSessione(chiave, valore) {
    try { sessionStorage.setItem(chiave, valore); } catch (err) { /* si perde la memoria, non la funzione */ }
  }

  function viaSessione(chiave) {
    try { sessionStorage.removeItem(chiave); } catch (err) { /* idem */ }
  }

  function testo(nome) { return TESTI[nome] || ''; }

  function avviso(messaggio) {
    if (!nodi.stato) { return; }
    nodi.stato.textContent = messaggio || '';
    clearTimeout(timerAvviso);
    if (!messaggio) { return; }
    timerAvviso = setTimeout(function () {
      timerAvviso = null;
      if (nodi.stato) { nodi.stato.textContent = ''; }
    }, DURATA_AVVISO);
  }

  function istantanea() {
    return {
      collegato: vivo.collegato,
      id: vivo.id,
      nome: vivo.nome,
      avatar: vivo.avatar,
      occupato: vivo.occupato
    };
  }

  function informa(fn) {
    try {
      fn(istantanea());
    } catch (err) {
      console.warn('[account] un iscritto a suStato è andato in errore:', err);
    }
  }

  function avvisa() {
    dipingi();
    iscritti.forEach(informa);
  }

  /* ------------------------------------------------------------------
     3. Quando il profilo è spento, e perché
     ------------------------------------------------------------------ */

  // Il profilo è spento finché non ci sono TUTTE le condizioni. È lo stato di
  // partenza del progetto, non un'eccezione: senza Client ID non esiste
  // nessuna app da interrogare.
  function attivo() {
    if (!CONF || CONF.attivo !== true) { return false; }
    if (!CLIENT_ID) { return false; }
    if (typeof fetch !== 'function') { return false; }
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') { return false; }
    // Twitch esige HTTPS per il redirect_uri. L'unica eccezione registrabile è
    // l'anteprima locale, che è anche l'unico modo di collaudarlo.
    if (location.protocol === 'https:') { return true; }
    return inSviluppo();
  }

  // Siamo sul computer di chi amministra, non su un sito pubblicato. È l'unica
  // condizione in cui la pagina si permette di spiegare come mai il
  // collegamento con Twitch non c'è: a un visitatore non interessa, e
  // raccontargli com'è configurato il sito non serve a niente.
  function inSviluppo() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  /**
   * Perché il profilo non è in pagina. Sta qui e non nel pannello perché il
   * posto in cui uno se ne accorge è il sito, guardandolo: restare a cercare
   * un bottone che non può comparire, senza una riga che lo spieghi, è un
   * modo perfetto di perdere un pomeriggio.
   */
  function motivoSpento() {
    if (!CONF || CONF.attivo !== true) {
      const m = String((CONF && CONF.motivo) || '');
      if (m === 'senzaClientId') {
        return 'manca il Client ID dell’app Twitch, e senza quello non esiste nessuna applicazione '
          + 'a cui Twitch possa chiedere il permesso: la schermata di collegamento non può proprio '
          + 'comparire. Si registra su dev.twitch.tv/console/apps e si incolla nel pannello, gruppo '
          + '«Profilo del sito» → «Client ID dell’app Twitch». Poi Pubblica.';
      }
      return 'è spento nel pannello, gruppo «Profilo del sito» → «Permetti di collegarsi con '
        + 'Twitch». Poi Pubblica.';
    }
    if (location.protocol !== 'https:' && !inSviluppo()) {
      return 'Twitch pretende https per il collegamento, e questa pagina è servita in http.';
    }
    if (typeof fetch !== 'function' || !window.crypto || typeof window.crypto.getRandomValues !== 'function') {
      return 'questo browser non ha quello che serve per fare il collegamento in sicurezza.';
    }
    return '';
  }

  function scriviDiagnosi() {
    if (attivo() || !inSviluppo() || !nodi.blocco) { return; }
    const perche = motivoSpento();
    if (!perche) { return; }
    nodi.blocco.appendChild(crea('p', 'account__diagnosi',
      'Il collegamento con Twitch non è attivo: ' + perche
      + ' — Questo avviso lo vedi solo tu, perché il sito sta girando in locale: sul sito '
      + 'pubblicato non compare a nessuno.'));
  }

  /* ------------------------------------------------------------------
     4. Il login (implicit grant): finestrella e redirect
     ------------------------------------------------------------------
     Twitch non supporta PKCE e l'authorization code richiede un client
     secret, cioè un backend in produzione: resta l'implicit grant. Il secret
     non si usa mai da qui, non sta in nessun campo dello schema e non deve
     esistere nel browser. (Sul server locale sì, ma è un'altra cosa e non
     esce di lì: vedi server/lib/twitch.js.)

     LE DUE STRADE DEL RITORNO, tenute distinte apposta:

       la finestrella (normale) — il login si apre in una finestra a parte,
         questa pagina non si muove, il video non si ferma e il lurk resta
         acceso. Il token torna con un postMessage da js/ritorno.js.

       il redirect (ripiego) — se il browser blocca la finestrella si naviga
         via di qui. Al ritorno la pagina si ricarica da capo: si raccoglie
         il token, si riporta la persona dov'era e non parte nient'altro.
     ------------------------------------------------------------------ */

  // Senza `state` un attaccante può far tornare la vittima con un token suo, e
  // da lì in poi il sito parlerebbe a nome dell'aggressore.
  function casuale() {
    try {
      const byte = new Uint8Array(16);
      window.crypto.getRandomValues(byte);
      let s = '';
      for (let i = 0; i < byte.length; i++) { s += ('0' + byte[i].toString(16)).slice(-2); }
      return s;
    } catch (err) {
      return '';
    }
  }

  function ritorno() {
    // Se l'amministratore ha registrato un URL preciso si usa quello: deve
    // combaciare carattere per carattere con quello dichiarato su Twitch.
    return frase(CONF.urlRitorno, '') || (location.origin + location.pathname);
  }

  function entra() {
    if (!attivo() || vivo.collegato) { return; }

    const st = casuale();
    if (!st) { avviso('Il browser non offre un generatore casuale sicuro: il collegamento non si può fare.'); return; }

    // Lo `state` sta in tutt'e due i posti perché le strade del ritorno sono
    // due: la finestrella lo riporta indietro e si confronta con la variabile,
    // il redirect ricarica la pagina e allora l'unica memoria è la sessione.
    inSessione(CHIAVE_STATO_OAUTH, st);
    statoAtteso = st;

    const url = 'https://id.twitch.tv/oauth2/authorize' +
      '?response_type=token' +
      '&client_id=' + encodeURIComponent(CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(ritorno()) +
      // Vuoto quando il sito non ha niente da fare a nome di chi si collega:
      // Twitch restituisce comunque un token utente valido, che basta per
      // leggere il proprio profilo e i dati pubblici del canale.
      '&scope=' + encodeURIComponent(SCOPE) +
      '&state=' + encodeURIComponent(st);

    if (apriFinestrella(url)) { return; }

    // Finestrella rifiutata dal browser: si torna alla navigazione secca, che
    // funziona sempre e costa un giro in più (js/ritorno.js non entra in
    // gioco, e al ritorno si riparte da leggiRitorno()).
    statoAtteso = '';
    try { location.assign(url); } catch (err) { avviso('Non sono riuscito ad aprire la pagina di Twitch.'); }
  }

  function apriFinestrella(url) {
    let finestra = null;
    try {
      // Centrata sullo schermo di chi guarda, non sull'angolo. `noopener` NON
      // si mette: senza `opener` la finestrella non avrebbe nessuno a cui
      // consegnare il token, che è tutto il suo mestiere.
      const larghezza = 520;
      const altezza = 760;
      const sinistra = Math.max(0, Math.round((window.screen.width - larghezza) / 2));
      const alto = Math.max(0, Math.round((window.screen.height - altezza) / 2));
      finestra = window.open(url, 'sb-account-twitch',
        'popup=yes,width=' + larghezza + ',height=' + altezza + ',left=' + sinistra + ',top=' + alto);
    } catch (err) {
      return false;
    }
    if (!finestra) { return false; }

    laFinestra = finestra;
    ascoltaRitorno();
    sorvegliaFinestrella();
    try { finestra.focus(); } catch (err) { /* niente fuoco: si vede lo stesso */ }
    return true;
  }

  function ascoltaRitorno() {
    if (ascoltoAperto) { return; }
    ascoltoAperto = true;

    window.addEventListener('message', function (evento) {
      // Solo dalla nostra origine. È il controllo che conta: un token non si
      // accetta da nessun altro, e la finestrella è una nostra pagina.
      if (!evento || evento.origin !== location.origin) { return; }
      accogli(evento.data);
    });

    // Il gemello del canale di ritorno.js: serve solo se un domani Twitch
    // spezzasse il legame con `opener` mettendo una COOP sulle sue pagine.
    try {
      if (typeof BroadcastChannel === 'function') {
        new BroadcastChannel('sb-account').addEventListener('message', function (evento) {
          accogli(evento && evento.data);
        });
      }
    } catch (err) { /* niente canale: resta postMessage */ }
  }

  function accogli(dati) {
    if (!dati || dati.tipo !== 'sb-account-ritorno') { return; }

    // Nessuna richiesta in corso: è un messaggio vecchio, doppio, o partito da
    // un'altra scheda. Si scarta in silenzio.
    if (!statoAtteso) { return; }

    if (dati.state !== statoAtteso) {
      avviso('Il ritorno da Twitch non corrisponde alla richiesta partita da qui: collegamento annullato.');
      return;
    }

    // Vale una volta sola, comunque vada.
    statoAtteso = '';
    viaSessione(CHIAVE_STATO_OAUTH);
    chiudiFinestrella();

    if (dati.error) {
      avviso(dati.error === 'access_denied'
        ? 'Collegamento annullato: non hai dato il permesso a Twitch.'
        : 'Twitch ha rifiutato il collegamento.');
      return;
    }
    if (!dati.access_token) { return; }

    inSessione(CHIAVE_TOKEN, dati.access_token);
    viaSessione(CHIAVE_VALIDATO);

    vivo.occupato = true;
    avvisa();
    valida(true).then(function (ok) {
      vivo.occupato = false;
      avvisa();
      if (!ok && daSessione(CHIAVE_TOKEN)) {
        avviso('Non sono riuscito a verificare il collegamento con Twitch: riprova fra poco.');
      }
    });
  }

  // Chiusa a mano, senza aver consegnato niente. Non è un errore, ma va detto:
  // altrimenti resta un bottone premuto e nessuna conseguenza.
  function sorvegliaFinestrella() {
    if (timerFinestra) { clearInterval(timerFinestra); }
    timerFinestra = setInterval(function () {
      let chiusa = false;
      try { chiusa = !laFinestra || laFinestra.closed; } catch (err) { chiusa = true; }
      if (!chiusa) { return; }

      clearInterval(timerFinestra);
      timerFinestra = null;
      laFinestra = null;
      if (!statoAtteso) { return; }   // consegnato: se n'è già occupato accogli()

      statoAtteso = '';
      viaSessione(CHIAVE_STATO_OAUTH);
      avviso('Collegamento annullato: la finestra di Twitch è stata chiusa.');
    }, 800);
  }

  function chiudiFinestrella() {
    if (timerFinestra) { clearInterval(timerFinestra); timerFinestra = null; }
    const f = laFinestra;
    laFinestra = null;
    if (!f) { return; }
    // Di norma si è già chiusa da sé: questo è il caso in cui il browser le ha
    // impedito di farlo.
    try { if (!f.closed) { f.close(); } } catch (err) { /* si arrangia */ }
  }

  function coppie(grezzo) {
    const fuori = {};
    grezzo.split('&').forEach(function (pezzo) {
      const uguale = pezzo.indexOf('=');
      if (uguale <= 0) { return; }
      try {
        fuori[decodeURIComponent(pezzo.slice(0, uguale))] = decodeURIComponent(pezzo.slice(uguale + 1).replace(/\+/g, ' '));
      } catch (err) { /* pezzo malformato: si scarta */ }
    });
    return fuori;
  }

  function pulisciUrl() {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (err) {
      // Ripiego povero: resta un cancelletto nudo, ma il token sparisce
      // comunque dalla barra e dalla cronologia successiva.
      try { location.hash = ''; } catch (err2) { /* niente da fare */ }
    }
  }

  function leggiRitorno() {
    const grezzo = location.hash ? location.hash.slice(1) : '';
    if (!grezzo || grezzo.indexOf('=') === -1) { return; }

    const p = coppie(grezzo);
    if (!p.access_token && !p.error) { return; }   // è un'ancora normale, non un ritorno

    // Subito, prima di qualunque altra cosa: il fragment non arriva ai log dei
    // server, ma resta nella cronologia del browser.
    pulisciUrl();

    const atteso = daSessione(CHIAVE_STATO_OAUTH);
    viaSessione(CHIAVE_STATO_OAUTH);   // vale una volta sola, comunque vada

    if (!atteso || p.state !== atteso) {
      avviso('Il ritorno da Twitch non corrisponde alla richiesta partita da qui: collegamento annullato.');
      return;
    }
    if (p.error) {
      avviso(p.error === 'access_denied'
        ? 'Collegamento annullato: non hai dato il permesso a Twitch.'
        : 'Twitch ha rifiutato il collegamento.');
      return;
    }

    inSessione(CHIAVE_TOKEN, p.access_token);
    viaSessione(CHIAVE_VALIDATO);

    valida(true).then(function (ok) {
      if (ok) { tornaAlProfilo(); return; }
      if (daSessione(CHIAVE_TOKEN)) {
        avviso('Non sono riuscito a verificare il collegamento con Twitch: riprova fra poco.');
      }
    });
  }

  /**
   * Il ritorno dal redirect ricarica la pagina dall'inizio, e chi si è appena
   * collegato si ritrova in cima al sito: la propria tessera è due schermate
   * più giù e nessuno gli ha detto che deve scendere. Lo si riporta dov'era.
   *
   * Il fuoco va sulla SEZIONE, non su un bottone: un Invio battuto per inerzia
   * al ritorno da Twitch non deve far partire niente.
   */
  function tornaAlProfilo() {
    const bersaglio = document.getElementById('diretta');
    if (!bersaglio) { return; }

    let dolce = false;
    try {
      dolce = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) { dolce = false; }
    try {
      bersaglio.scrollIntoView({ behavior: dolce ? 'smooth' : 'auto', block: 'start' });
    } catch (err) {
      try { bersaglio.scrollIntoView(); } catch (err2) { /* si resta dove si è */ }
    }
    try {
      // tabindex -1: raggiungibile col fuoco da codice, ma fuori dal giro del
      // Tab, come vuole il pattern dei salti di navigazione.
      bersaglio.setAttribute('tabindex', '-1');
      bersaglio.focus({ preventScroll: true });
    } catch (err) { /* niente fuoco: resta la scrollata, che è il grosso */ }
  }

  /* ------------------------------------------------------------------
     5. Validazione, profilo e revoca
     ------------------------------------------------------------------
     Validare ogni ora è un requisito dichiarato da Twitch, non un consiglio.
     E setInterval da solo non basta: con la scheda congelata non scatta,
     quindi si confronta l'OROLOGIO a ogni ritorno in primo piano e comunque
     prima di ogni uso del token.
     ------------------------------------------------------------------ */
  function dimentica(messaggio) {
    viaSessione(CHIAVE_TOKEN);
    viaSessione(CHIAVE_VALIDATO);
    viaSessione(CHIAVE_NOME);
    viaSessione(CHIAVE_UTENTE);
    viaSessione(CHIAVE_AVATAR);
    vivo.collegato = false;
    vivo.id = '';
    vivo.nome = '';
    vivo.avatar = '';
    avvisa();
    if (messaggio) { avviso(messaggio); }
  }

  function valida(forza) {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token) { return Promise.resolve(false); }

    const quando = Number(daSessione(CHIAVE_VALIDATO)) || 0;
    if (quando && vivo.id) {
      const eta = Date.now() - quando;
      if (!forza && eta < VALIDITA) { return Promise.resolve(true); }
      if (forza && eta < FRESCHEZZA) { return Promise.resolve(true); }
    }

    return fetch('https://id.twitch.tv/oauth2/validate', {
      method: 'GET',
      headers: { Authorization: 'OAuth ' + token }
    }).then(function (r) {
      // 401 è l'unica risposta che dice davvero «questo token è morto». Un 500
      // o una rete che cade non sono un buon motivo per scollegare nessuno.
      if (r.status === 401) {
        dimentica('Il collegamento con Twitch è scaduto: ricollegati.');
        return false;
      }
      if (!r.ok) { return false; }

      return r.json().then(function (d) {
        if (!d || !d.user_id) { dimentica(''); return false; }
        // Un token emesso per un'altra applicazione non è nostro e non si usa:
        // è la contromisura al caso in cui arrivi da fuori.
        if (d.client_id && d.client_id !== CLIENT_ID) {
          dimentica('Il token non appartiene a questa applicazione: collegamento annullato.');
          return false;
        }

        vivo.id = String(d.user_id);
        // Il nome per esteso e l'immagine li porta profilo(); questo è il
        // ripiego finché non arriva, e resta se non arriva mai.
        if (!vivo.nome) { vivo.nome = String(d.login || ''); }
        vivo.collegato = true;
        inSessione(CHIAVE_VALIDATO, String(Date.now()));
        inSessione(CHIAVE_NOME, vivo.nome);
        inSessione(CHIAVE_UTENTE, vivo.id);
        avvisa();
        // Una volta sola per scheda: l'immagine non cambia mentre si guarda
        // una diretta, e sessionStorage se la ricorda per i ricaricamenti.
        if (!vivo.avatar) { profilo(); }
        return true;
      }, function () { return false; });
    }, function () {
      // Rete giù o richiesta bloccata: non si butta niente, si riproverà.
      return false;
    });
  }

  /**
   * Il profilo: nome per esteso e immagine, cioè quello che rende «collegato»
   * una cosa che si vede invece di una parola. Nessuno scope in più —
   * helix/users risponde su qualunque token utente valido — e nessun dato che
   * non sia già pubblico sul canale di quella persona. Niente email.
   *
   * È un di più, e si comporta come tale: se fallisce non succede niente,
   * resta il nome minuscolo che dà oauth2/validate e il resto funziona uguale.
   */
  function profilo() {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token || !vivo.id) { return; }

    fetch('https://api.twitch.tv/helix/users', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': CLIENT_ID }
    }).then(function (r) {
      if (!r || !r.ok) { return null; }
      return r.json();
    }).then(function (d) {
      const voce = (d && Array.isArray(d.data)) ? d.data[0] : null;
      if (!voce) { return; }

      // display_name è il nome con le maiuscole che la persona ha scelto;
      // `login` è la sua versione tutta minuscola. Si preferisce il primo.
      const nome = String(voce.display_name || '').trim();
      if (nome) { vivo.nome = nome; inSessione(CHIAVE_NOME, nome); }

      // Solo https, e solo un indirizzo: quello che arriva finisce in un
      // attributo src, e non si mette in pagina una stringa arbitraria.
      const immagine = String(voce.profile_image_url || '').trim();
      if (/^https:\/\//i.test(immagine)) {
        vivo.avatar = immagine;
        inSessione(CHIAVE_AVATAR, immagine);
      }
      avvisa();
    }, function () { /* profilo non disponibile: si resta con quello che c'è */ });
  }

  function ripristina() {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token) { avvisa(); return; }

    vivo.id = daSessione(CHIAVE_UTENTE) || '';
    vivo.nome = daSessione(CHIAVE_NOME) || '';
    vivo.avatar = daSessione(CHIAVE_AVATAR) || '';
    vivo.collegato = !!vivo.id;
    avvisa();
    // Se l'ora è già passata questa chiamata fa la richiesta vera; altrimenti
    // costa zero e si limita a confermare quello che c'è in sessione.
    valida(false);
  }

  function esci() {
    const token = daSessione(CHIAVE_TOKEN);
    if (!token) { dimentica(''); return; }

    vivo.occupato = true;
    avvisa();

    // Buttare il token senza revocarlo lo lascia valido su un server di Twitch
    // fino a sessanta giorni, e vale su qualunque canale. Se la revoca
    // fallisce lo si dice: fingere che sia andata sarebbe la bugia peggiore
    // di questo file.
    fetch('https://id.twitch.tv/oauth2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=' + encodeURIComponent(CLIENT_ID) + '&token=' + encodeURIComponent(token)
    }).then(function (r) {
      if (r.ok) {
        avviso('Collegamento revocato su Twitch.');
      } else {
        avviso('Twitch non ha revocato il token (errore ' + r.status + '): toglilo a mano da Impostazioni → Connessioni.');
      }
    }, function () {
      avviso('Non sono riuscito a contattare Twitch: il token resta valido finché non lo togli da Impostazioni → Connessioni.');
    }).then(function () {
      vivo.occupato = false;
      // Localmente si dimentica comunque: l'utente ha chiesto di scollegarsi.
      dimentica('');
    });
  }

  /* ------------------------------------------------------------------
     6. La tessera
     ------------------------------------------------------------------
     #account arriva vuoto dal modello ed è questo blocco a riempirlo: senza
     JavaScript in pagina non devono restare bottoni raggiungibili col Tab che
     non rispondono a niente.

     Da collegati è una tessera — immagine del profilo, nome, «scollega e
     revoca» — come su qualunque sito dove si entra col proprio account. Da
     scollegati è il bottone per entrare, e sta lì sempre: accedere al sito
     col proprio profilo è una cosa che si offre, non una che si nasconde
     dietro un interruttore.
     ------------------------------------------------------------------ */
  function costruisci() {
    // L'immagine arriva da helix/users e sta su static-cdn.jtvnw.net: è il
    // motivo per cui quel dominio è nell'img-src della CSP, ed è l'unico
    // dominio esterno da cui la pagina carichi un'immagine.
    comandi.avatar = crea('img', 'account__avatar');
    comandi.avatar.hidden = true;
    comandi.avatar.setAttribute('alt', '');
    comandi.avatar.setAttribute('width', '28');
    comandi.avatar.setAttribute('height', '28');
    // Decorativa: il nome accanto dice già chi sei, e un lettore di schermo
    // non deve annunciare due volte la stessa persona.
    comandi.avatar.setAttribute('aria-hidden', 'true');
    comandi.avatar.setAttribute('loading', 'lazy');
    // Se l'immagine non arriva (rete, CDN, CSP di un hosting più stretta)
    // sparisce invece di lasciare l'icona di immagine rotta.
    comandi.avatar.addEventListener('error', function () {
      vivo.avatar = '';
      comandi.avatar.hidden = true;
    });
    nodi.tessera.appendChild(comandi.avatar);

    comandi.chi = crea('span', 'account__chi', '');
    comandi.chi.hidden = true;
    nodi.tessera.appendChild(comandi.chi);

    comandi.entra = bottone(testo('entra'), 'btn btn--vuoto', entra);
    nodi.tessera.appendChild(comandi.entra);

    comandi.esci = bottone(testo('esci'), 'btn btn--vuoto', esci);
    comandi.esci.hidden = true;
    nodi.tessera.appendChild(comandi.esci);
  }

  function dipingi() {
    if (!comandi.entra) { return; }

    // Il bottone del login e la tessera non convivono mai: dopo il login
    // «Collegati con Twitch» non ha più niente da fare, e al suo posto c'è
    // «Scollega e revoca». (Prima restava in pagina per un bug di specificità
    // in css/base.css: `[hidden]` perdeva contro `.btn`, che arriva dopo.)
    comandi.entra.hidden = vivo.collegato;
    comandi.entra.disabled = vivo.occupato;
    comandi.esci.hidden = !vivo.collegato;
    comandi.esci.disabled = vivo.occupato;

    comandi.chi.hidden = !vivo.collegato;
    comandi.chi.textContent = vivo.collegato
      ? testo('collegato').replace(/\{nome\}/g, vivo.nome)
      : '';

    // Senza immagine la tessera non deve restare con un buco: si nasconde e
    // resta il nome, che è la parte che conta.
    const mostraAvatar = vivo.collegato && !!vivo.avatar;
    comandi.avatar.hidden = !mostraAvatar;
    if (mostraAvatar && comandi.avatar.getAttribute('src') !== vivo.avatar) {
      comandi.avatar.setAttribute('src', vivo.avatar);
      comandi.avatar.setAttribute('alt', '');
    }

    // La nota spiega perché collegarsi: a chi si è collegato non serve più.
    if (nodi.nota) { nodi.nota.hidden = vivo.collegato; }
  }

  /* ------------------------------------------------------------------
     7. API pubblica — window.Account
     ------------------------------------------------------------------
     La consumano js/canale.js e js/lurk.js, che si caricano DOPO questo
     file apposta. Come in player.js, suStato chiama subito con lo stato
     corrente: chi arriva tardi non deve restare cieco in attesa di un
     cambiamento che potrebbe non arrivare mai.

     `token()` restituisce una stringa e non una promessa apposta: chi lo usa
     deve prima chiamare `valida(true)`, che è il punto in cui si scopre che
     il token è morto costando meno di un 401 a metà strada.
     ------------------------------------------------------------------ */
  window.Account = {
    // Vero se il collegamento è configurato ed è possibile da questa pagina.
    attivo: false,

    // fn({ collegato, id, nome, avatar, occupato })
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      informa(fn);
    },

    stato: istantanea,
    entra: entra,
    esci: esci,
    valida: valida,

    token: function () { return daSessione(CHIAVE_TOKEN) || ''; },
    id: function () { return vivo.id; },
    clientId: CLIENT_ID,

    // La riga di stato del profilo, per chi ha qualcosa da dire sul
    // collegamento e non ha una regione sua (js/canale.js non ce l'ha).
    avviso: avviso
  };

  /* ------------------------------------------------------------------
     8. Avvio
     ------------------------------------------------------------------ */
  function ascoltaVisibilita() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }
      // L'orologio, non setInterval: con la scheda congelata l'intervallo non
      // scatta e il token resterebbe non validato per ore.
      if (vivo.collegato) { valida(false); }
    });
  }

  function avvia() {
    nodi.tessera = document.getElementById('account');
    if (!nodi.tessera) { return; }

    nodi.blocco = nodi.tessera.parentNode;
    nodi.nota = document.getElementById('account-nota');
    nodi.stato = document.getElementById('account-stato');

    // I testi si preparano una volta sola, con i ripieghi già applicati:
    // nessun testo è indispensabile, e un campo pubblicato vuoto deve dare
    // una frase di ripiego, non un bottone muto.
    const daiDati = (CONF && CONF.testi) || {};
    Object.keys(RIPIEGHI).forEach(function (chiave) {
      TESTI[chiave] = frase(daiDati[chiave], RIPIEGHI[chiave]);
    });

    if (!attivo()) {
      // Spento: la nota e la riga di stato non hanno niente da dire, e la
      // tessera resta vuota — quindi invisibile, per il :empty di
      // css/account.css. In locale si spiega perché.
      if (nodi.nota) { nodi.nota.hidden = true; }
      try { scriviDiagnosi(); } catch (err) { /* è un aiuto, non un obbligo */ }
      return;
    }

    window.Account.attivo = true;
    costruisci();
    dipingi();

    try {
      ascoltaVisibilita();
      ripristina();
      leggiRitorno();
    } catch (err) {
      console.warn('[account] il collegamento con Twitch non è partito:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
