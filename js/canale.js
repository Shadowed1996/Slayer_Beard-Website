/* =====================================================================
   canale.js — quello che di Twitch si sa solo con un token

   Il player sa se il VIDEO sta girando, e da lì js/player.js deduce se il
   canale è acceso. È una deduzione onesta ma è una deduzione, e di due
   cose non sa proprio niente: il titolo della diretta e il titolo
   dell'ULTIMA diretta. Nessun getter dell'SDK li espone, e senza token
   l'API di Twitch non risponde a nessuno.

   Da quando il sito ha un profilo (js/account.js) un token c'è, per chi
   si è collegato. Questo file lo usa per chiedere a Twitch le due cose
   che mancavano:

     GET helix/streams  →  il canale è in onda? con che titolo?
                           È l'unica risposta AUTOREVOLE: la passa a
                           window.Player, che smette di dedurre.
     GET helix/videos   →  il titolo dell'ultima diretta registrata.
                           Se il canale non tiene i VOD si ripiega su
                           helix/channels, che dà comunque l'ultimo
                           titolo impostato.
     GET helix/channels/followers
                        →  quanti seguono il canale. Senza lo scope da
                           moderatore la lista arriva vuota ma `total`
                           c'è sempre, ed è l'unica cosa che serve: va
                           nei numeri della copertina e di «Chi sono»,
                           che la pubblicazione ha già riempito col
                           valore preso dal server.

   NIENTE SCOPE IN PIÙ. Tutt'e quattro rispondono a qualunque token utente
   valido e danno soltanto dati già pubblici sulla pagina del canale.
   Chi non si è collegato non perde niente di quello che aveva prima: il
   player continua a dedurre lo stato, e «Ultima diretta» resta il valore
   scritto nel pannello — che la pubblicazione, se il server è
   configurato, aggiorna da sé (server/lib/twitch.js).

   COSTO. Una richiesta ogni due minuti, e solo a pagina visibile, solo
   per chi è collegato. Con la scheda dietro non parte niente: lo stato
   del canale non serve a chi non sta guardando, e Twitch limita per
   Client ID, cioè su tutti i visitatori insieme.
   ===================================================================== */
(function () {
  'use strict';

  const DATI = window.DATI || {};
  const TWITCH = DATI.twitch || {};
  const CANALE = String(TWITCH.idUtente || '').trim();

  const GIRO = 120000;        // due minuti: uno stato del canale non cambia più in fretta
  const RIPROVA = 30000;      // dopo un errore di rete si riprova prima, ma non subito

  const nodi = {};
  const iscritti = [];

  const vivo = {
    inOnda: null,      // null = non lo sappiamo ancora (o non lo sapremo mai)
    titolo: '',        // titolo della diretta in corso
    ultima: '',        // titolo dell'ultima diretta registrata
    follower: null,    // quanti seguono il canale (null = non ancora chiesto)
    quando: 0          // quando è arrivata l'ultima risposta buona
  };

  let timer = null;
  let inVolo = false;
  let ultimaLettura = 0;

  /* --- Micro-aiuti ---------------------------------------------------- */

  function account() {
    const A = window.Account;
    return (A && A.attivo === true && typeof A.token === 'function') ? A : null;
  }

  function player(metodo) {
    const P = window.Player;
    return (P && typeof P[metodo] === 'function') ? P : null;
  }

  function istantanea() {
    return { inOnda: vivo.inOnda, titolo: vivo.titolo, ultima: vivo.ultima, quando: vivo.quando };
  }

  function avvisa() {
    iscritti.forEach(function (fn) {
      try {
        fn(istantanea());
      } catch (err) {
        console.warn('[canale] un iscritto a suStato è andato in errore:', err);
      }
    });
  }

  /** Una GET a Helix col token di chi si è collegato: la risposta intera, o null se non va. */
  function chiediGrezzo(percorso) {
    const A = account();
    if (!A) { return Promise.resolve(null); }
    const token = A.token();
    if (!token) { return Promise.resolve(null); }

    return fetch('https://api.twitch.tv/helix/' + percorso, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': A.clientId }
    }).then(function (r) {
      // 401 lo gestisce account.js alla prossima validazione: qui non si
      // scollega nessuno per una richiesta di contorno andata storta.
      if (!r || !r.ok) { return null; }
      return r.json();
    }, function () {
      return null;
    }).then(function (d) {
      return (d && typeof d === 'object') ? d : null;
    }, function () {
      return null;
    });
  }

  /** La stessa GET, ma risolve al solo elenco `data` (null se non va). */
  function chiedi(percorso) {
    return chiediGrezzo(percorso).then(function (d) {
      return (d && Array.isArray(d.data)) ? d.data : null;
    });
  }

  /** «3.619»: il punto delle migliaia a mano, come fa la generazione, così i due non divergono. */
  function numeroTesto(valore) {
    const n = Math.max(0, Math.round(Number(valore) || 0));
    const cifre = String(n);
    let fuori = '';
    for (let i = 0; i < cifre.length; i++) {
      if (i > 0 && (cifre.length - i) % 3 === 0) { fuori += '.'; }
      fuori += cifre[i];
    }
    return fuori;
  }

  /* --- Le tre domande ------------------------------------------------- */

  /**
   * In onda o no, e con che titolo. `data` vuoto significa fuori onda, e non
   * «non lo so»: è la differenza fra questa risposta e la deduzione del
   * player, ed è il motivo per cui vale la pena farla.
   */
  function chiediDiretta() {
    return chiedi('streams?user_id=' + encodeURIComponent(CANALE)).then(function (data) {
      if (data === null) { return false; }     // richiesta fallita: non si conclude niente

      const voce = data[0] || null;
      const acceso = !!voce;
      const titolo = voce ? String(voce.title || '').trim() : '';

      vivo.inOnda = acceso;
      vivo.titolo = titolo;
      vivo.quando = Date.now();

      // La verità arriva al player, che da qui in poi non deve più dedurre.
      const P = player('dichiara');
      if (P) { P.dichiara(acceso, titolo); }
      return true;
    });
  }

  /**
   * Il titolo dell'ultima diretta. Prima il VOD, che è la registrazione della
   * serata; se il canale non tiene i VOD si ripiega sul titolo del canale,
   * che dopo una diretta resta quello con cui la diretta è finita.
   */
  function chiediUltima() {
    return chiedi('videos?user_id=' + encodeURIComponent(CANALE) + '&type=archive&first=1&sort=time')
      .then(function (data) {
        const voce = (data && data[0]) || null;
        const titolo = voce ? String(voce.title || '').trim() : '';
        if (titolo) { return titolo; }
        return chiedi('channels?broadcaster_id=' + encodeURIComponent(CANALE)).then(function (canali) {
          const c = (canali && canali[0]) || null;
          return c ? String(c.title || '').trim() : '';
        });
      })
      .then(function (titolo) {
        if (!titolo || titolo === vivo.ultima) { return; }
        vivo.ultima = titolo;
        scriviUltima(titolo);
      });
  }

  /**
   * Quanti seguono il canale. `total` arriva anche senza scope: con un token
   * qualsiasi la lista è vuota, ma il totale c'è. Un totale che non si legge
   * lascia in pagina il numero pubblicato: è vecchio di una pubblicazione,
   * non sbagliato.
   */
  function chiediFollower() {
    return chiediGrezzo('channels/followers?broadcaster_id=' + encodeURIComponent(CANALE) + '&first=1')
      .then(function (d) {
        // Number(null) è 0: un totale assente non deve diventare «zero follower».
        const totale = (d && d.total !== null && d.total !== undefined && d.total !== '') ? Number(d.total) : NaN;
        if (!isFinite(totale) || totale < 0) { return; }
        const tondo = Math.round(totale);
        if (tondo === vivo.follower) { return; }
        vivo.follower = tondo;
        scriviFollower(tondo);
      });
  }

  /** I numeri marcati data-follower: uno in copertina, uno in «Chi sono». */
  function scriviFollower(totale) {
    const testo = numeroTesto(totale);
    for (let i = 0; i < nodi.follower.length; i++) {
      nodi.follower[i].textContent = testo;
      nodi.follower[i].setAttribute('data-fonte', 'twitch');
    }
  }

  /**
   * La riga «Ultima diretta» del quadro comandi. La scrive anche js/player.js
   * all'avvio, col valore pubblicato: qui si sovrascrive con quello vero, e
   * solo quando è arrivato davvero. Un valore vecchio è meglio di un buco.
   */
  function scriviUltima(titolo) {
    if (!nodi.ultima) { return; }
    nodi.ultima.textContent = titolo;
    // Il marchio serve a js/player.js, che nel suo `dipingi()` riscrive quel
    // nodo col valore pubblicato ogni volta che il canale risulta fuori onda:
    // senza questa riga, il titolo vero durerebbe fino al primo ridisegno.
    nodi.ultima.setAttribute('data-fonte', 'twitch');
    avvisa();
  }

  /* --- Il giro -------------------------------------------------------- */

  function giro() {
    if (inVolo || !account() || !CANALE) { return; }
    if (document.visibilityState !== 'visible') { return; }
    if (!window.Account.stato().collegato) { return; }

    inVolo = true;
    ultimaLettura = Date.now();

    // Il token si rivalida prima di usarlo: è l'unico momento in cui sapere
    // che è morto costa meno che scoprirlo con un 401 a metà strada.
    Promise.resolve(window.Account.valida(false))
      .then(function (ok) {
        if (!ok) { return null; }
        return chiediDiretta().then(function (andata) {
          // Se la prima richiesta non è nemmeno partita, le altre non partono:
          // è quasi sempre la stessa rete che non c'è.
          if (!andata) { return null; }
          return chiediUltima().then(chiediFollower);
        });
      })
      .then(null, function (err) { console.warn('[canale] giro non riuscito:', err); })
      .then(function () {
        inVolo = false;
        avvisa();
      });
  }

  function avvia() {
    if (!CANALE) { return; }
    nodi.ultima = document.getElementById('ultima');
    nodi.follower = Array.prototype.slice.call(document.querySelectorAll('[data-follower]'));

    const A = account();
    if (!A) { return; }   // profilo spento: qui non c'è niente da fare

    A.suStato(function (stato) {
      if (!stato.collegato) {
        ferma();
        return;
      }
      // Appena qualcuno si collega si guarda subito, senza aspettare il giro:
      // è il momento in cui il dato in pagina è più vecchio.
      accendi();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }
      if (!window.Account.stato().collegato) { return; }
      // In secondo piano l'intervallo viene rallentato e poi congelato: al
      // ritorno si recupera solo se è passato abbastanza tempo, invece di
      // sparare una richiesta a ogni cambio di scheda.
      if (Date.now() - ultimaLettura >= GIRO) { giro(); }
      accendi();
    });
  }

  function accendi() {
    giro();
    if (timer) { return; }
    timer = setInterval(function () {
      // Il ritmo si allunga da solo quando le richieste non riescono: `giro`
      // non fa niente a pagina nascosta, e questo è il caso più comune.
      if (Date.now() - ultimaLettura < RIPROVA) { return; }
      giro();
    }, GIRO);
  }

  function ferma() {
    if (timer) { clearInterval(timer); timer = null; }
    vivo.inOnda = null;
    vivo.titolo = '';
    avvisa();
  }

  /* --- API pubblica --------------------------------------------------- */

  window.Canale = {
    // fn({ inOnda, titolo, ultima, quando }) — `inOnda` è null finché non
    // c'è una risposta di Twitch: null NON vuol dire «fuori onda».
    suStato: function (fn) {
      if (typeof fn !== 'function') { return; }
      iscritti.push(fn);
      try { fn(istantanea()); } catch (err) { console.warn('[canale] iscritto in errore:', err); }
    },
    stato: istantanea,
    // Per chi vuole forzare una lettura (il collaudo, la console).
    aggiorna: giro
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
}());
