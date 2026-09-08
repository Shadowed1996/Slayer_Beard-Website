/* =====================================================================
   pollo.js — AGENTE 2 · la mascotte accanto alla chat

   Il pollo non è più un'immagine appoggiata dietro al monitor: è un
   pulsante vivo, messo di fianco alla chat, che reagisce a quattro cose
   — i messaggi veri del canale, il visitatore che scrive nella chat
   incorporata, l'accensione della diretta e la modalità lurk quando si
   accende (CONTRATTO-3 §5.2). Quando non succede niente borbotta da
   solo, di rado (blocco 3-bis).

   Cinque stati, scritti in data-stato e vestiti da css/pollo.css:
   riposo, live, scrive, parla, contento. Qui dentro non si scrivono
   stili, tranne la parallasse (`translate` sulla radice).

   TRE COSE VALGONO PER TUTTO IL FILE

   1. Ogni blocco si disinnesca da solo se il suo elemento non c'è, e
      l'avvio li isola uno dall'altro: il pollo è una decorazione, non
      può portarsi via la pagina.
   2. Quello che arriva dalla chat è testo di sconosciuti. Finisce in
      pagina SOLO con textContent, mai con innerHTML, mai dentro un
      attributo. È l'unico punto di questo progetto che potrebbe
      diventare un buco di sicurezza vero, e sta tutto in `reagisci()`.
   3. Lo stato del canale e il fuoco dentro la chat non si leggono dal
      DOM: li dice window.Player (CONTRATTO-2 §6.2). Se player.js non
      c'è, il pollo resta comunque vivo con la chat IRC e con i clic.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Dati e costanti
     ------------------------------------------------------------------
     Tutto arriva da window.DATI.pollo (§6.3), che lo genera l'agente 4.
     Se manca, l'avvio (blocco 9) spegne tutto prima di toccare altro.
     ------------------------------------------------------------------ */
  const DATI = window.DATI || {};
  const POLLO = DATI.pollo || null;
  const TWITCH = DATI.twitch || {};

  const CANALE = frase(TWITCH.canale, 'slayer_beard').toLowerCase();

  const CHIAVE_NASCOSTO = 'sb-pollo-nascosto';

  const FINESTRA = 2500;      // una reazione ogni 2,5s, non una di più
  const FRASE_BASE = 3800;    // quanto resta su il fumetto, più il tempo di lettura
  const FRASE_PER_LETTERA = 45;
  const MAX_TESTO = 80;       // caratteri del messaggio mostrato, da contratto
  const MAX_NOME = 25;        // un display-name più lungo non esiste su Twitch
  const PARALLASSE = 12;      // pixel, come la vecchia mascotte di sito.js

  const RIPOSO_PRIMA = 45000;     // prima frase da fermo, dopo che il pollo si vede
  const RIPOSO_MIN = 60000;       // poi una ogni uno-due minuti, mai a cadenza fissa
  const RIPOSO_MAX = 120000;

  const TENTATIVI_MAX = 5;        // poi ci si arrende in silenzio
  const SESSIONE_BUONA = 60000;   // oltre questa durata la caduta è un incidente
  const ATTESA_NASCOSTA = 60000;  // pagina nascosta: dopo un minuto si chiude
  const SOGLIA_SCRIVE = 2000;     // vedi blocco 6: la deduzione «ha scritto»

  const nodi = {};
  const vivo = {
    inOnda: false,
    scrive: false,
    nascosto: false
  };

  let timerFrase = null;
  let timerRiposo = null;
  let riposoAcceso = false;
  let ultimaFrase = '';
  let dettoOffline = false;

  /* ------------------------------------------------------------------
     2. Micro-aiuti
     ------------------------------------------------------------------ */
  function frase(valore, ripiego) {
    return (typeof valore === 'string' && valore.trim()) ? valore.trim() : ripiego;
  }

  // Le frasi le sceglie chi amministra dal pannello: qui si accetta solo
  // ciò che è davvero una stringa piena, così un elenco lasciato a metà
  // non fa comparire un fumetto vuoto.
  function elenco(nome) {
    const voci = (POLLO && POLLO.frasi) ? POLLO.frasi[nome] : null;
    if (!Array.isArray(voci)) { return []; }
    return voci.filter(function (v) { return typeof v === 'string' && v.trim(); });
  }

  // Pescata a caso che evita di ripetere due volte di fila la stessa
  // frase: con tre o quattro frasi per elenco la ripetizione immediata si
  // nota subito e fa sembrare il pollo rotto.
  function pesca(voci) {
    if (!voci.length) { return ''; }
    if (voci.length === 1) { return voci[0]; }

    let scelta = ultimaFrase;
    for (let i = 0; i < 6 && scelta === ultimaFrase; i++) {
      scelta = voci[Math.floor(Math.random() * voci.length)];
    }
    ultimaFrase = scelta;
    return scelta;
  }

  /* ------------------------------------------------------------------
     3. Stato e fumetto
     ------------------------------------------------------------------
     Lo stato «di fondo» è quello a cui il pollo torna quando ha finito di
     parlare: sta scrivendo qualcuno? il canale è acceso? nessuno dei due?
     Gli stati momentanei (parla, contento) durano una frase e basta.
     ------------------------------------------------------------------ */
  function statoBase() {
    if (vivo.scrive) { return 'scrive'; }
    return vivo.inOnda ? 'live' : 'riposo';
  }

  function segnaStato(nome) {
    if (!nodi.pollo || nodi.pollo.getAttribute('data-stato') === nome) { return; }
    nodi.pollo.setAttribute('data-stato', nome);
  }

  function durataFrase(testo) {
    return FRASE_BASE + Math.min(testo.length, MAX_TESTO + 40) * FRASE_PER_LETTERA;
  }

  // Unico punto in cui il pollo parla. Il testo entra con textContent:
  // qualunque cosa contenga resta testo, anche se arriva dalla chat.
  function reazione(testo, statoMomentaneo) {
    segnaStato(statoMomentaneo || 'parla');
    clearTimeout(timerFrase);
    clearTimeout(timerRiposo);   // sta già succedendo qualcosa: il borbottio aspetta

    if (testo && nodi.fumetto && nodi.testo) {
      nodi.testo.textContent = testo;
      nodi.fumetto.hidden = false;
    }

    timerFrase = setTimeout(taci, durataFrase(testo || ''));
  }

  function taci() {
    if (nodi.fumetto) { nodi.fumetto.hidden = true; }
    segnaStato(statoBase());
    // Da qui riparte il conto del silenzio: è il punto in cui «non sta
    // succedendo niente» ricomincia davvero.
    armaRiposo();
  }

  /* ------------------------------------------------------------------
     3-bis. Il borbottio — l'unico consumatore di `frasi.riposo`
     ------------------------------------------------------------------
     Senza questo blocco quelle frasi non le leggerebbe nessuno: chi
     amministra le scriverebbe nel pannello, pubblicherebbe, e non
     vedrebbe succedere niente.

     La cadenza è lunga e non è mai la stessa: la prima dopo tre quarti di
     minuto da quando il pollo si vede, poi una ogni uno-due minuti, e solo
     se non sta succedendo nient'altro. Un pollo che parla a intervalli
     fissi diventa un tic e si smette di guardarlo.
     ------------------------------------------------------------------ */
  function armaRiposo(attesa) {
    if (!riposoAcceso) { return; }
    clearTimeout(timerRiposo);
    const quando = (typeof attesa === 'number')
      ? attesa
      : RIPOSO_MIN + Math.random() * (RIPOSO_MAX - RIPOSO_MIN);
    timerRiposo = setTimeout(borbotta, quando);
  }

  function borbotta() {
    if (!riposoAcceso || vivo.nascosto) { return; }

    // Si sta zitti se la pagina non si vede, se il visitatore sta scrivendo,
    // se un fumetto è già su o se la finestra del freno non è ancora scaduta:
    // il borbottio è l'ultima cosa in ordine di importanza, non deve mai
    // rubare il turno a una reazione vera. In tutti questi casi si riprova.
    const occupato =
      document.visibilityState === 'hidden' ||
      vivo.scrive ||
      !!timerFinestra ||
      (nodi.fumetto && !nodi.fumetto.hidden) ||
      (Date.now() - ultimaReazione < FINESTRA);

    if (occupato) { armaRiposo(); return; }

    const testo = pesca(elenco('riposo'));
    if (!testo) { return; }   // elenco vuoto: non si riarma, non servirebbe

    // Anche il borbottio conta per il freno: un messaggio di chat che arriva
    // subito dopo aspetta il suo turno come tutti.
    ultimaReazione = Date.now();
    reazione(testo, 'parla');   // il prossimo giro lo riarma taci()
  }

  /* ------------------------------------------------------------------
     4. Freno — una reazione ogni 2,5 secondi
     ------------------------------------------------------------------
     In una diretta affollata la chat arriva a raffica. Il pollo no: si
     tiene SOLO l'ultimo messaggio della finestra e si scarta il resto,
     invece di accodarli. Una coda farebbe commentare al pollo messaggi
     vecchi di mezzo minuto, che è peggio che non commentarli affatto.
     ------------------------------------------------------------------ */
  let inAttesa = null;
  let timerFinestra = null;
  let ultimaReazione = 0;

  function proponi(messaggio) {
    inAttesa = messaggio;
    if (timerFinestra) { return; }

    const passato = Date.now() - ultimaReazione;
    timerFinestra = setTimeout(scarica, Math.max(0, FINESTRA - passato));
  }

  function scarica() {
    timerFinestra = null;
    if (!inAttesa || vivo.nascosto) { inAttesa = null; return; }

    const messaggio = inAttesa;
    inAttesa = null;
    ultimaReazione = Date.now();
    reagisci(messaggio);
  }

  /* ------------------------------------------------------------------
     5. Chat vera del canale — IRC anonimo, sola lettura
     ------------------------------------------------------------------
     Twitch espone la chat su WebSocket senza autenticazione: si entra
     come `justinfan<numero>`, l'utente anonimo, e si legge. Nessun token,
     nessun cookie, nessun dato del visitatore esce di qui.

     `CAP REQ :twitch.tv/tags` serve solo per il display-name: senza i tag
     arriva il nick tutto minuscolo, e in chat la gente si chiama con le
     maiuscole giuste.

     La socket si apre TARDI, solo dopo che #diretta è stata vista almeno
     una volta: chi atterra sulla pagina e non scende mai non deve pagare
     una connessione che non gli serve.
     ------------------------------------------------------------------ */
  const irc = {
    socket: null,
    tentativi: 0,
    timerRitardo: null,
    timerNascosta: null,
    apertaIl: 0,
    nostra: false,     // chiusura decisa da noi: non è un guasto, non si riprova
    sospesa: false     // chiusa perché la pagina era nascosta: si riapre al ritorno
  };

  function manda(testo) {
    try {
      // readyState 1 = OPEN. Scrivere su una socket che si sta chiudendo
      // lancia, e non c'è niente da recuperare: l'evento close arriva
      // comunque e la riconnessione la decide quello.
      if (irc.socket && irc.socket.readyState === 1) { irc.socket.send(testo + '\r\n'); }
    } catch (err) { /* gestito da close */ }
  }

  function collega() {
    if (irc.socket || vivo.nascosto || typeof WebSocket !== 'function') { return; }

    let socket;
    try {
      socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (err) {
      // Alcune reti filtrano il wss e il costruttore lancia subito: si
      // ritenta col ritardo crescente e dopo cinque volte non si insiste.
      riprova();
      return;
    }

    irc.socket = socket;
    irc.nostra = false;

    socket.addEventListener('open', function () {
      irc.apertaIl = Date.now();
      manda('CAP REQ :twitch.tv/tags');
      manda('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000)));
      manda('JOIN #' + CANALE);
    });

    socket.addEventListener('message', function (e) {
      // Un solo evento può portare più righe: il protocollo le separa con
      // CR+LF e Twitch le accorpa spesso.
      String(e.data).split('\r\n').forEach(riga);
    });

    socket.addEventListener('close', function () {
      const durata = irc.apertaIl ? Date.now() - irc.apertaIl : 0;
      irc.socket = null;
      irc.apertaIl = 0;
      if (irc.nostra) { return; }

      // Una sessione che ha retto più di un minuto era buona: se cade è un
      // incidente di rete, non un rifiuto, e il conto dei tentativi
      // riparte. Senza questa riga una diretta di tre ore resterebbe muta
      // al primo sbalzo di connessione.
      if (durata > SESSIONE_BUONA) { irc.tentativi = 0; }
      riprova();
    });

    // L'evento error non porta informazioni utili e arriva sempre prima di
    // close: si tace qui e si decide di là.
    socket.addEventListener('error', function () { /* gestito da close */ });
  }

  function riprova() {
    if (irc.tentativi >= TENTATIVI_MAX || vivo.nascosto) { return; }

    const attesa = 1000 * Math.pow(2, irc.tentativi);   // 1s, 2s, 4s, 8s, 16s
    irc.tentativi++;
    clearTimeout(irc.timerRitardo);
    irc.timerRitardo = setTimeout(collega, attesa);
  }

  function scollega(sospendi) {
    clearTimeout(irc.timerRitardo);
    irc.timerRitardo = null;
    irc.sospesa = !!sospendi;

    if (!irc.socket) { return; }
    irc.nostra = true;
    try { irc.socket.close(); } catch (err) { /* già chiusa */ }
    irc.socket = null;
  }

  /* --- Lettura del protocollo ----------------------------------------
     Forma di una riga:  [@tag;tag] [:prefisso] COMANDO parametri
     I valori dei tag sono codificati (\s = spazio, \: = punto e virgola)
     e vanno decodificati, altrimenti i nomi con spazi arrivano storti.
     -------------------------------------------------------------------- */
  const CONTROLLO = /[\x00-\x1f\x7f]/g;   // caratteri di controllo: fuori da tutto

  function disescapa(valore) {
    return valore
      .replace(/\\s/g, ' ')
      .replace(/\\:/g, ';')
      .replace(/\\r/g, '')
      .replace(/\\n/g, '')
      .replace(/\\\\/g, '\\');
  }

  function leggiTag(pezzo) {
    const tag = {};
    pezzo.split(';').forEach(function (coppia) {
      const uguale = coppia.indexOf('=');
      if (uguale > 0) { tag[coppia.slice(0, uguale)] = disescapa(coppia.slice(uguale + 1)); }
    });
    return tag;
  }

  function analizza(testo) {
    let resto = testo;
    let tag = {};
    let prefisso = '';

    if (resto.charAt(0) === '@') {
      const spazio = resto.indexOf(' ');
      if (spazio === -1) { return null; }
      tag = leggiTag(resto.slice(1, spazio));
      resto = resto.slice(spazio + 1);
    }

    if (resto.charAt(0) === ':') {
      const spazio = resto.indexOf(' ');
      if (spazio === -1) { return null; }
      prefisso = resto.slice(1, spazio);
      resto = resto.slice(spazio + 1);
    }

    const spazio = resto.indexOf(' ');
    return {
      tag: tag,
      prefisso: prefisso,
      comando: spazio === -1 ? resto : resto.slice(0, spazio),
      parametri: spazio === -1 ? '' : resto.slice(spazio + 1)
    };
  }

  function ripulisciNome(valore) {
    const pulito = String(valore || '').replace(CONTROLLO, '').trim();
    return pulito.length > MAX_NOME ? pulito.slice(0, MAX_NOME) : pulito;
  }

  function riga(testo) {
    if (!testo) { return; }

    // Il PING arriva ogni cinque minuti circa: senza PONG Twitch chiude la
    // connessione e il pollo ammutolirebbe a metà diretta.
    if (testo.indexOf('PING') === 0) { manda('PONG :tmi.twitch.tv'); return; }

    const m = analizza(testo);
    if (!m || m.comando !== 'PRIVMSG') { return; }

    // parametri = «#canale :testo del messaggio», e il testo può contenere
    // altri due punti: si taglia solo sul primo « :».
    const stacco = m.parametri.indexOf(' :');
    if (stacco === -1) { return; }

    const corpo = m.parametri.slice(stacco + 2);
    const taglio = m.prefisso.indexOf('!');
    const nick = taglio > 0 ? m.prefisso.slice(0, taglio) : m.prefisso;
    const nome = ripulisciNome(m.tag['display-name'] || nick);
    if (!nome || !corpo.trim()) { return; }

    proponi({ nome: nome, testo: corpo });
  }

  /* --- Dal messaggio alla frase --------------------------------------
     mostraMessaggi falso (predefinito): nel fumetto va solo una frase di
     `frasi.chat` col {nome} sostituito. Vero: si aggiunge il messaggio,
     senza link, troncato a 80 caratteri, e sempre come testo puro.
     -------------------------------------------------------------------- */
  const URL_ESPLICITO = /(?:https?:\/\/|www\.)\S+/gi;
  const URL_NUDO = /\b[\w-]+\.(?:com|net|org|it|tv|gg|io|me|link|xyz|info|shop)\b(?:\/\S*)?/gi;

  function ripulisciMessaggio(testo) {
    const senzaLink = String(testo)
      .replace(URL_ESPLICITO, '')
      .replace(URL_NUDO, '')
      .replace(CONTROLLO, ' ');

    const compatto = senzaLink.replace(/\s+/g, ' ').trim();

    // Array.from e non slice: si conta per caratteri veri, così il taglio
    // non spezza a metà un'emoji, che in chat ce n'è a ogni riga.
    const lettere = Array.from(compatto);
    if (lettere.length <= MAX_TESTO) { return compatto; }
    return lettere.slice(0, MAX_TESTO - 1).join('') + '…';
  }

  function reagisci(messaggio) {
    let testo = pesca(elenco('chat')).replace(/\{nome\}/g, messaggio.nome);
    // Elenco `chat` vuoto: resta almeno il nome di chi ha scritto, che è
    // comunque la reazione che il committente ha chiesto.
    if (!testo) { testo = messaggio.nome; }

    if (POLLO.mostraMessaggi === true) {
      const corpo = ripulisciMessaggio(messaggio.testo);
      if (corpo) { testo += ' «' + corpo + '»'; }
    }

    reazione(testo, 'parla');
  }

  /* --- Attesa della sezione ------------------------------------------ */
  function quandoSiVede(elemento, fai) {
    if (!elemento) { return; }

    // Senza IntersectionObserver si rinuncia alla pigrizia, non al pollo:
    // sono browser che non esistono più e il degrado è banale.
    if (typeof IntersectionObserver !== 'function') { fai(); return; }

    const osservatore = new IntersectionObserver(function (voci) {
      for (let i = 0; i < voci.length; i++) {
        if (voci[i].isIntersecting) {
          osservatore.disconnect();
          fai();
          return;
        }
      }
    }, { threshold: 0 });

    osservatore.observe(elemento);
  }

  function chatVera() {
    if (!POLLO || POLLO.chatVera !== true) { return; }

    // Si osserva #diretta, la sezione del player; se il markup cambiasse
    // nome si ripiega sul pollo stesso, che sta lì dentro comunque.
    quandoSiVede(document.getElementById('diretta') || nodi.pollo, collega);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        // Non si chiude subito: cambiare scheda per dieci secondi non deve
        // costare una riconnessione al ritorno.
        clearTimeout(irc.timerNascosta);
        irc.timerNascosta = setTimeout(function () { scollega(true); }, ATTESA_NASCOSTA);
        return;
      }

      clearTimeout(irc.timerNascosta);
      irc.timerNascosta = null;

      if (irc.sospesa) {
        // La chiusura era nostra, non un guasto: il conto dei tentativi
        // riparte da zero.
        irc.sospesa = false;
        irc.tentativi = 0;
        collega();
      }
    });

    // pagehide e non unload: copre anche il ritorno indietro dalla cache
    // di navigazione, dove unload non viene emesso.
    window.addEventListener('pagehide', function () { scollega(false); });
  }

  /* ------------------------------------------------------------------
     6. Il visitatore che scrive nella chat incorporata
     ------------------------------------------------------------------
     ATTENZIONE: È UNA DEDUZIONE, NON UN FATTO. L'iframe della chat è di
     un altro dominio: non si leggono i tasti, non si legge il contenuto,
     e non c'è modo di sapere se un messaggio sia stato inviato davvero.
     L'unica cosa osservabile dall'esterno è che il fuoco della finestra è
     finito dentro l'iframe, ed è quello che window.Player.suChat riporta
     in `scrive` (§6.2).

     Quindi: fuoco dentro l'iframe -> il pollo si mette in ascolto; fuoco
     uscito dopo almeno due secondi -> si SCOMMETTE che qualcosa sia stato
     scritto. Se la scommessa sbaglia, il pollo dice una frase di troppo:
     è il costo massimo dell'errore, ed è accettabile.
     ------------------------------------------------------------------ */

  // Per il visitatore non c'è nessun nome da mettere al posto di {nome}:
  // si preferiscono le frasi di `chat` che il segnaposto non ce l'hanno
  // e, se ci fossero tutte, si ripiega su `click`, che parla al
  // visitatore. Meglio una frase pensata per un'altra occasione che una
  // frase con un buco al posto del nome.
  function fraseVisitatore() {
    const senzaNome = elenco('chat').filter(function (f) { return f.indexOf('{nome}') === -1; });
    return pesca(senzaNome.length ? senzaNome : elenco('click'));
  }

  function ascoltaPlayer() {
    const Player = window.Player;
    if (!Player) { return; }

    if (typeof Player.suStato === 'function') {
      let prima = true;

      Player.suStato(function (stato) {
        // ATTENZIONE alla firma: suStato passa un OGGETTO { inOnda, titolo },
        // non un booleano (il §6.2 del contratto la descriveva male). Leggere
        // il primo parametro come booleano darebbe sempre «in onda», perché un
        // oggetto è sempre truthy. L'agente 3 passa anche un secondo parametro
        // booleano di cortesia, ma la fonte vera è stato.inOnda.
        const acceso = !!(stato && stato.inOnda);
        const cambiato = acceso !== vivo.inOnda;
        vivo.inOnda = acceso;

        // La cresta accesa non passa da data-stato apposta: altrimenti si
        // spegnerebbe ogni volta che il pollo parla o becca.
        if (nodi.pollo) { nodi.pollo.classList.toggle('is-onda', acceso); }

        // La prima chiamata è l'istantanea di quando ci si iscrive: il
        // pollo non deve mettersi a parlare da solo appena aperta la pagina.
        if (prima) { prima = false; segnaStato(statoBase()); return; }
        if (!cambiato) { return; }

        if (acceso) { reazione(pesca(elenco('live')), 'contento'); return; }

        // La frase di «fuori onda» si dice una volta sola: lo stato può
        // rimbalzare (pubblicità, iframe che si ricarica) e un pollo che
        // ripete «Zzz» ogni due minuti è solo fastidioso.
        if (!dettoOffline) {
          dettoOffline = true;
          reazione(pesca(elenco('offline')), 'riposo');
        } else {
          segnaStato(statoBase());
        }
      });
    }

    if (typeof Player.suChat === 'function') {
      let prima = true;
      let entrato = 0;

      Player.suChat(function (chat) {
        const scrive = !!(chat && chat.scrive);

        if (prima) {
          prima = false;
          vivo.scrive = scrive;
          if (scrive) { entrato = Date.now(); }
          segnaStato(statoBase());
          return;
        }

        if (scrive === vivo.scrive) { return; }
        vivo.scrive = scrive;

        if (scrive) {
          entrato = Date.now();
          reazione(pesca(elenco('scrive')), 'scrive');
          return;
        }

        if (entrato && Date.now() - entrato >= SOGLIA_SCRIVE) {
          reazione(fraseVisitatore(), 'contento');
        } else {
          segnaStato(statoBase());
        }
        entrato = 0;
      });
    }
  }

  /* ------------------------------------------------------------------
     6-bis. La modalità lurk — il pollo commenta, non comanda
     ------------------------------------------------------------------
     Il clic sul pollo resta quello di prima (apre la chat, CONTRATTO-2
     §3.3): da window.Lurk si ascolta e basta (CONTRATTO-3 §5.2). Si parla
     in due soli momenti, l'accensione e la resa: la sentinella del lurk
     gira ogni 20 secondi e commentare ogni cambio di `salute` renderebbe
     il pollo logorroico.
     ------------------------------------------------------------------ */
  function ascoltaLurk() {
    const Lurk = window.Lurk;
    // La modalità lurk si spegne dal pannello: in quel caso js/lurk.js non
    // espone niente e qui non c'è nulla da ascoltare.
    if (!Lurk || typeof Lurk.suStato !== 'function') { return; }

    let prima = true;
    let acceso = false;
    let dettaResa = false;

    // Il freno del blocco 4 vale anche per il lurk: se il pollo ha appena
    // parlato si salta il turno invece di accodarlo, come per la chat.
    function puoParlare() {
      return !vivo.nascosto && Date.now() - ultimaReazione >= FINESTRA;
    }

    Lurk.suStato(function (stato) {
      const ora = !!(stato && stato.acceso);
      const eraAcceso = acceso;
      acceso = ora;

      // Come per Player.suStato: la prima chiamata è l'istantanea di quando
      // ci si iscrive, non un evento da commentare.
      if (prima) { prima = false; return; }

      if (ora && !eraAcceso) {
        dettaResa = false;   // sessione nuova: la resa torna dicibile
        if (puoParlare()) {
          ultimaReazione = Date.now();
          reazione(pesca(elenco('lurk')), 'contento');
        }
        return;
      }

      // L'unica salute commentata, e una volta sola: il lurk ha smesso di
      // riprovarci. Un elenco per «ci ho rinunciato» non c'è e non lo si
      // inventa — il pollo torna a dormire con le frasi di `offline`, e il
      // fatto preciso lo dice il pannello del lurk nella sua riga role="status".
      if (ora && stato.salute === 'resa' && !dettaResa && puoParlare()) {
        dettaResa = true;
        ultimaReazione = Date.now();
        reazione(pesca(elenco('offline')), 'riposo');
      }
    });
  }

  /* ------------------------------------------------------------------
     7. Comandi — clic sul pollo e bottone «nascondi»
     ------------------------------------------------------------------ */
  function comandi() {
    if (nodi.bottone) {
      nodi.bottone.addEventListener('click', function () {
        reazione(pesca(elenco('click')), 'contento');
        apriChat();
      });
    }

    if (nodi.chiudi) {
      nodi.chiudi.addEventListener('click', nascondi);
    }
  }

  function apriChat() {
    const toggle = document.getElementById('chat-toggle');
    // Il pollo APRE la chat, non la commuta: se è già aperta, un clic sul
    // pollo non deve richiuderla in faccia a chi stava leggendo.
    if (!toggle || toggle.getAttribute('aria-expanded') === 'true') { return; }
    try { toggle.click(); } catch (err) { /* il player non è montato */ }
  }

  // Il pollo comincia a borbottare solo quando lo si è visto almeno una volta:
  // parlare a vuoto mentre nessuno guarda serve solo a bruciare frasi.
  function riposo() {
    // Con prefers-reduced-motion il pollo non prende iniziativa: chi ha chiesto
    // meno movimento non vuole nemmeno un fumetto che compare da solo ogni
    // minuto. Continua a rispondere agli eventi veri, quelli sì.
    const fermo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (fermo || !elenco('riposo').length) { return; }

    riposoAcceso = true;
    quandoSiVede(nodi.pollo, function () { armaRiposo(RIPOSO_PRIMA); });
  }

  function nascondi() {
    vivo.nascosto = true;
    riposoAcceso = false;
    clearTimeout(timerRiposo);
    clearTimeout(timerFrase);
    if (nodi.pollo) { nodi.pollo.hidden = true; }

    // Niente socket aperta per una mascotte che non si vede.
    scollega(false);

    // In navigazione privata localStorage può lanciare al solo accesso: la
    // scelta vale comunque per questa visita, semplicemente non si ricorda.
    try { localStorage.setItem(CHIAVE_NASCOSTO, '1'); } catch (err) { /* ignorato */ }
  }

  function giaNascosto() {
    try {
      return localStorage.getItem(CHIAVE_NASCOSTO) === '1';
    } catch (err) {
      return false;
    }
  }

  /* ------------------------------------------------------------------
     8. Parallasse — dodici pixel, non uno di più
     ------------------------------------------------------------------
     È la funzione mascotte() che stava in sito.js, spostata qui insieme
     al pollo. Si scrive nella proprietà `translate` e non in `transform`
     perché le animazioni di stato girano su .pollo__img con `rotate` e
     `translate`: due elementi diversi, nessuno sovrascrive l'altro.
     Un solo requestAnimationFrame in volo per volta: il pointermove
     arriva anche a 240 Hz, il ridisegno no.
     ------------------------------------------------------------------ */
  function parallasse() {
    if (!nodi.pollo) { return; }

    const fermo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
    // Senza la proprietà `translate` si rinuncia all'effetto invece di
    // rischiare di sovrascrivere il transform del CSS: è una decorazione.
    const supportato = window.CSS && window.CSS.supports && window.CSS.supports('translate', '1px 1px');
    if (fermo || touch || !supportato) { return; }

    let x = 0;
    let y = 0;
    let inCoda = false;

    function disegna() {
      inCoda = false;
      nodi.pollo.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
    }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') { return; }
      // Scostamento dal centro della finestra, normalizzato fra -1 e 1.
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      x = Math.max(-1, Math.min(1, nx)) * PARALLASSE;
      y = Math.max(-1, Math.min(1, ny)) * (PARALLASSE * 0.6);
      if (!inCoda) {
        inCoda = true;
        requestAnimationFrame(disegna);
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     9. Avvio
     ------------------------------------------------------------------
     Il markup del pollo è sempre in pagina (il modello non lo mette sotto
     condizione): tocca a qui decidere se ha senso mostrarlo. Senza
     configurazione, o con `attivo` falso, il pollo si toglie invece di
     restare lì come un bottone che non fa niente — che per chi naviga da
     tastiera o con uno screen reader sarebbe peggio del pollo mancante.

     Ogni blocco parte isolato: se uno lancia, gli altri vanno lo stesso.
     ------------------------------------------------------------------ */
  function avvia() {
    nodi.pollo = document.getElementById('pollo');
    if (!nodi.pollo) { return; }

    if (!POLLO || POLLO.attivo !== true) {
      nodi.pollo.hidden = true;
      return;
    }

    if (giaNascosto()) {
      vivo.nascosto = true;
      nodi.pollo.hidden = true;
      return;
    }

    nodi.fumetto = document.getElementById('pollo-fumetto');
    nodi.testo = nodi.fumetto ? nodi.fumetto.querySelector('.pollo__testo') : null;
    // Il fumetto nasce hidden dal modello, ma qui non si dà per scontato: se
    // arrivasse aperto e vuoto, il borbottio lo vedrebbe come «sta già
    // parlando» e non partirebbe mai.
    if (nodi.fumetto) { nodi.fumetto.hidden = true; }
    nodi.bottone = document.getElementById('pollo-bottone');
    nodi.chiudi = document.getElementById('pollo-chiudi');

    [comandi, ascoltaPlayer, ascoltaLurk, parallasse, chatVera, riposo].forEach(function (blocco) {
      try {
        blocco();
      } catch (err) {
        console.warn('[pollo] blocco non avviato:', err);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
