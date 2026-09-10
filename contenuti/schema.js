'use strict';
/* =====================================================================
   schema.js — la descrizione dei campi del sito (CONTRATTO §7,
   CONTRATTO-2 §5 e §10.1).

   È il file che rende il backend facile da modificare: il pannello non sa
   niente dei campi, li chiede a /api/contenuti e costruisce il form da qui.
   Aggiungere un campo al sito costa una riga in questo elenco e un {{…}}
   nel modello — niente altro, da nessuna parte.

   Ogni campo ha:
     chiave      il percorso dentro contenuti.json, con la stessa forma che
                 si usa nel modello: le chiavi di "testi" sono piatte
                 ("deck.titolo"), quelle di configurazione sono sotto
                 "config." ("config.twitch.canale");
     etichetta   in italiano, comprensibile a chi non programma;
     tipo        uno di TIPI, decide come lo disegna il pannello e come lo
                 controlla server/lib/convalida.js;
     aiuto       facoltativo, la riga sotto al campo: quando la scelta ha
                 una conseguenza, la conseguenza si scrive qui;
     max/min     lunghezza massima del testo, oppure intervallo del numero;
     facoltativo se vuoto va bene (per esempio un social non ancora attivo);
     slot        solo per il tipo "font": quale dei tre font del sito si sta
                 scegliendo, così la convalida sa in quale catalogo cercare.

   TESTO RICCO (CONTRATTO-2 §7). I campi di tipo "ricco" contengono un po'
   di HTML ristretto (grassetto, corsivo, <br>, link). Sono ricche SOLO le
   chiavi che finiscono dentro un elemento di testo e che il modello stampa
   con la tripla graffa. Restano semplici tutte quelle che finiscono dentro
   un attributo HTML (alt, aria-label, title) o dentro js/dati.js: lì
   l'HTML grezzo non verrebbe interpretato, verrebbe stampato, e la pagina
   si romperebbe. Su un campo "ricco" il "max" conta i caratteri visibili,
   non i tag.

   I gruppi seguono l'ordine della pagina — meta, marchio, deck, diretta,
   account, lurk, pollo, settimana, chi, supporto, saluti, piede — e in coda ci sono i due
   gruppi che non stanno in nessun punto della pagina perché valgono
   dappertutto: "canale" (i dati tecnici) e "aspetto" (colori e font).
   ===================================================================== */

// I quattro tipi in coda sono quelli nuovi del CONTRATTO-2 §5: li disegna
// l'agente 7 nel pannello e li controlla l'agente 5 nella convalida.
const TIPI = ['testo', 'testolungo', 'url', 'email', 'numero', 'immagine',
  'orario', 'orari', 'scelta', 'elencoTesti', 'elenco',
  'ricco', 'colore', 'font', 'interruttore'];

// Chiavi che il sistema gestisce da solo: non si modificano dal pannello e
// non devono comparire fra quelle "scoperte".
const SISTEMA = ['versione', 'aggiornatoIl'];

// I rami che NON si scrivono a mano: li riempie il server alla
// pubblicazione, chiedendoli a Twitch (server/lib/twitch.js). Non hanno un
// campo nello schema, e non devono averlo: un campo nel pannello sarebbe
// una casella che la pubblicazione successiva riscrive sotto le dita di chi
// l'ha appena compilata. La copertura li salta invece di segnalarli come
// chiavi scoperte, ed e l'unica eccezione ammessa alla regola «lo schema
// copre esattamente contenuti.json».
//
// `config.ultimaDiretta` NON sta qui: quello resta un campo scritto a mano,
// che il server si limita a tenere aggiornato se il collegamento c'e.
const GENERATI = ['config.clip.voci'];

// Le icone disponibili sono i file in modelli/icone/: se se ne aggiunge una
// si aggiunge qui il nome, e la generazione la trova da sola.
const ICONE_SOCIAL = ['twitch', 'youtube', 'instagram', 'tiktok'];
const ICONE_SUPPORTO = ['star', 'crown', 'gem', 'heart', 'coffee', 'mail'];

const gruppi = [
  {
    id: 'meta',
    titolo: 'Scheda della pagina',
    descrizione: 'Quello che si vede nella scheda del browser, su Google e quando il link viene incollato in chat.',
    campi: [
      { chiave: 'meta.titolo', etichetta: 'Titolo della pagina', tipo: 'testo', max: 70,
        aiuto: 'Compare nella linguetta del browser e come titolo nei risultati di ricerca.' },
      { chiave: 'meta.descrizione', etichetta: 'Descrizione per i motori di ricerca', tipo: 'testolungo', max: 180,
        aiuto: 'Due righe: è il testo grigio sotto al titolo su Google. Niente grassetti né link, finisce dentro un attributo.' },
      { chiave: 'meta.ogDescrizione', etichetta: 'Descrizione per i social', tipo: 'testolungo', max: 200,
        aiuto: 'Quella che appare nell\'anteprima quando il link viene condiviso.' },
      { chiave: 'meta.ogImmagineAlt', etichetta: 'Descrizione dell\'immagine di anteprima', tipo: 'testolungo', max: 220,
        aiuto: 'Serve a chi usa un lettore di schermo: descrivi cosa si vede nell\'immagine.' }
    ]
  },

  {
    id: 'marchio',
    titolo: 'Marchio e navigazione',
    descrizione: 'Il nome del canale e le sei voci del binario laterale, nell\'ordine in cui si incontrano scendendo.',
    campi: [
      { chiave: 'marchio.nome', etichetta: 'Nome del canale', tipo: 'testo', max: 30 },
      { chiave: 'marchio.ruolo', etichetta: 'Riga sotto al nome', tipo: 'testo', max: 60,
        aiuto: 'Per esempio il ruolo su Twitch e l\'anno di inizio.' },
      { chiave: 'nav.regia', etichetta: 'Voce del menu — Regia', tipo: 'testo', max: 20 },
      // Sei voci devono stare nel dock anche a 360px: le etichette vanno
      // tenute corte, altrimenti restano solo i punti.
      { chiave: 'nav.diretta', etichetta: 'Voce del menu — Diretta', tipo: 'testo', max: 20,
        aiuto: 'Sotto i 700px il dock mostra sei voci in fila: più corta è, meglio si legge.' },
      { chiave: 'nav.settimana', etichetta: 'Voce del menu — Settimana', tipo: 'testo', max: 20 },
      { chiave: 'nav.chi', etichetta: 'Voce del menu — Chi sono', tipo: 'testo', max: 20 },
      { chiave: 'nav.supporto', etichetta: 'Voce del menu — Supporto', tipo: 'testo', max: 20 },
      { chiave: 'nav.saluti', etichetta: 'Voce del menu — Saluti', tipo: 'testo', max: 20 },
      { chiave: 'nav.vaiAlCanale', etichetta: 'Testo del link al canale', tipo: 'testo', max: 40 }
    ]
  },

  {
    id: 'deck',
    titolo: 'Copertina',
    descrizione: 'La prima schermata: titolo, spie di stato e i quattro numeri del canale. Il player non sta più qui: è nella sezione «La diretta».',
    campi: [
      { chiave: 'deck.occhiello', etichetta: 'Occhiello sopra al titolo', tipo: 'testo', max: 40 },
      { chiave: 'deck.titolo', etichetta: 'Titolo', tipo: 'testo', max: 40,
        aiuto: 'È l\'unico titolo grande della pagina.' },
      { chiave: 'deck.sottotitolo', etichetta: 'Sottotitolo', tipo: 'ricco', max: 260,
        aiuto: 'Due righe scarse: è la prima cosa che si legge. Qui puoi usare grassetto, corsivo e a capo.' },
      { chiave: 'deck.ctaPrimaria', etichetta: 'Bottone principale', tipo: 'testo', max: 30,
        aiuto: 'Porta al canale su Twitch.' },
      { chiave: 'deck.ctaSecondaria', etichetta: 'Bottone secondario', tipo: 'testo', max: 30,
        aiuto: 'Non esce dal sito: fa scendere alla sezione con il player.' },
      { chiave: 'deck.statoLive', etichetta: 'Stato — in onda', tipo: 'testo', max: 40 },
      { chiave: 'deck.statoOffline', etichetta: 'Stato — fuori onda', tipo: 'testo', max: 40 },
      { chiave: 'deck.statoVerifica', etichetta: 'Stato — controllo in corso', tipo: 'testo', max: 40,
        aiuto: 'Si vede per un istante mentre il sito chiede a Twitch se il canale è acceso.' },
      { chiave: 'deck.etichettaProssima', etichetta: 'Etichetta «prossima diretta»', tipo: 'testo', max: 40 },
      { chiave: 'deck.etichettaUltima', etichetta: 'Etichetta «ultima diretta»', tipo: 'testo', max: 40 },
      { chiave: 'deck.etichettaStato', etichetta: 'Etichetta del riquadro di stato', tipo: 'testo', max: 40,
        aiuto: 'Non si vede: la leggono i lettori di schermo per annunciare il riquadro delle spie.' },
      { chiave: 'deck.dato1Valore', etichetta: 'Primo numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'deck.dato1Etichetta', etichetta: 'Primo numero — etichetta', tipo: 'testo', max: 30 },
      { chiave: 'deck.dato2Valore', etichetta: 'Secondo numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'deck.dato2Etichetta', etichetta: 'Secondo numero — etichetta', tipo: 'testo', max: 30 },
      { chiave: 'deck.dato3Valore', etichetta: 'Terzo numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'deck.dato3Etichetta', etichetta: 'Terzo numero — etichetta', tipo: 'testo', max: 30 },
      { chiave: 'deck.dato4Valore', etichetta: 'Quarto numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'deck.dato4Etichetta', etichetta: 'Quarto numero — etichetta', tipo: 'testo', max: 30 },
      { chiave: 'deck.scorri', etichetta: 'Invito a scendere', tipo: 'testo', max: 20 }
    ]
  },

  {
    id: 'diretta',
    titolo: 'La diretta',
    descrizione: 'La sezione del player: testo di presentazione, comandi della chat e nota per quando l\'embed non parte.',
    campi: [
      { chiave: 'diretta.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'diretta.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'diretta.testo', etichetta: 'Testo introduttivo', tipo: 'ricco', max: 240,
        aiuto: 'Una o due righe sopra al player.' },
      { chiave: 'diretta.nota', etichetta: 'Nota sotto al player', tipo: 'ricco', max: 300,
        aiuto: 'Cosa fare se il player non parte. Vale la pena tenerci un link a Twitch: è l\'unica via d\'uscita quando l\'embed viene bloccato.' },
      // Queste tre chiavi si chiamano ancora "deck." perché il player è nato
      // nella copertina: il nome resta com'è (lo leggono js/dati.js e il
      // modello), ma il campo sta dove sta la cosa che descrive.
      { chiave: 'deck.notaPlayer', etichetta: 'Riga dentro il piede del monitor', tipo: 'testolungo', max: 220,
        aiuto: 'Sta stretta sotto allo schermo, accanto ai bottoni: tienila breve.' },
      { chiave: 'deck.chatApri', etichetta: 'Bottone della chat — apri', tipo: 'testo', max: 30 },
      { chiave: 'deck.chatChiudi', etichetta: 'Bottone della chat — chiudi', tipo: 'testo', max: 30 }
    ]
  },

  // Il profilo del sito. Sta fra «diretta» e «lurk» perché la tessera è
  // stampata in cima alla sezione della diretta, sopra al pannello del lurk.
  //
  // Il login NON è più una cosa della modalità lurk: è un profilo del sito,
  // autenticato da Twitch, che vale anche col messaggio in chat spento. Da
  // qui passano la tessera dell'account, l'aggiornamento dell'ultima diretta
  // e lo stato del canale letto da Twitch invece che dedotto dal player. La
  // modalità lurk ci si appoggia — window.Account — invece di averne uno suo.
  {
    id: 'account',
    titolo: 'Profilo del sito (login con Twitch)',
    descrizione: 'Il login del sito: chi si collega ha una tessera col proprio nome e la propria immagine, e il sito può leggere da Twitch i dati che senza token non vedrebbe — se il canale è davvero in onda e il titolo dell\'ultima diretta. È lo stesso collegamento con cui la modalità lurk dice in chat che si sta guardando.',
    campi: [
      { chiave: 'config.account.attivo', etichetta: 'Permetti di collegarsi con Twitch', tipo: 'interruttore',
        aiuto: 'Spento, sul sito non compare nessun login: niente tessera, niente aggiornamento dell\'ultima diretta, e il messaggio in chat della modalità lurk resta spento comunque — senza account non c\'è nessuno a nome di cui parlare.' },
      // `forma` fa controllare a convalida.js che sia davvero un Client ID e
      // non un promemoria scritto a mano: un valore sbagliato qui non si
      // scopre salvando, si scopre quando un visitatore clicca e Twitch gli
      // risponde «invalid client».
      { chiave: 'config.account.clientId', etichetta: 'Client ID dell\'app Twitch', tipo: 'testo', max: 40, facoltativo: true, forma: 'clientIdTwitch',
        aiuto: 'Si crea su dev.twitch.tv/console/apps (serve la verifica in due passaggi sul tuo account). Il Client ID è pubblico per natura e finisce nella pagina: va bene. Il «client secret» invece NON va messo qui né in nessun altro campo del pannello: si imposta con «node server/imposta-twitch.js», resta sul computer di chi amministra e non finisce mai nel sito pubblicato.' },
      { chiave: 'config.account.urlRitorno', etichetta: 'Indirizzo di ritorno dopo il login', tipo: 'url', facoltativo: true,
        aiuto: 'Deve combaciare carattere per carattere con quello registrato su Twitch, barra finale compresa. Lasciato vuoto, il sito usa l\'indirizzo della pagina corrente. Per provare in locale registra anche http://localhost:4173/' },
      { chiave: 'account.entra', etichetta: 'Bottone — collegati con Twitch', tipo: 'testo', max: 40 },
      { chiave: 'account.esci', etichetta: 'Bottone — scollega', tipo: 'testo', max: 40,
        aiuto: 'Non si limita a dimenticare il collegamento: dice a Twitch di annullarlo davvero.' },
      { chiave: 'account.collegato', etichetta: 'Riga «collegato come»', tipo: 'testo', max: 60,
        aiuto: 'Puoi usare {nome}, sostituito dal nome dell\'account collegato.' },
      { chiave: 'account.nota', etichetta: 'A cosa serve collegarsi', tipo: 'ricco', max: 300,
        aiuto: 'La riga accanto al bottone, per chi non si è ancora collegato. Va detto che il collegamento muore chiudendo la scheda e che il sito non conserva niente.' }
    ]
  },

  // Il gruppo della modalità lurk sta fra «diretta» e «pollo» perché segue
  // l'ordine della pagina (CONTRATTO §7): il pannello del lurk è stampato
  // subito sotto al monitor. Il perché di tutta questa roba, e in particolare
  // perché NON esiste un invio automatico ripetuto, sta in
  // docs/PRESENZA-TWITCH.md: leggerlo prima di aggiungere campi qui.
  {
    id: 'lurk',
    titolo: 'Modalità lurk',
    descrizione: 'Tiene viva la diretta per chi guarda dal sito e si allontana, e — se lo accendi — permette di dire in chat che si sta guardando.',
    campi: [
      { chiave: 'config.lurk.attivo', etichetta: 'Mostra la modalità lurk', tipo: 'interruttore',
        aiuto: 'Spento, il pannello non compare per nessuno e il resto di questo gruppo non ha effetto.' },
      { chiave: 'lurk.titolo', etichetta: 'Titolo del pannello', tipo: 'testo', max: 40 },
      { chiave: 'lurk.spiegazione', etichetta: 'Cosa fa, spiegato al visitatore', tipo: 'ricco', max: 400,
        aiuto: 'Dev\'essere onesto: il sito riavvia il video, non «tiene presente» nessuno per magia. Twitch conta chi ha il video acceso, non chi scrive in chat.' },
      { chiave: 'lurk.notaAccount', etichetta: 'Nota sui cookie e sui punti canale', tipo: 'ricco', max: 400,
        aiuto: 'Se il browser blocca i cookie di terze parti, dentro il player incorporato il visitatore risulta anonimo: conta per il canale ma non prende punti né streak. Il sito non può accorgersene, quindi va detto.' },
      { chiave: 'lurk.notaMobile', etichetta: 'Nota per chi è da telefono', tipo: 'ricco', max: 300,
        aiuto: 'Su mobile il browser mette in pausa il video appena si cambia scheda e non c\'è rimedio. Meglio dirlo che far credere il contrario.' },

      { chiave: 'config.lurk.oreMax', etichetta: 'Dopo quante ore chiedere «ci sei ancora?»', tipo: 'numero', min: 1, max: 12,
        aiuto: 'Passate queste ore il pannello chiede conferma e, senza risposta, si spegne da solo. Serve a distinguere chi sta guardando da chi se n\'è andato lasciando la pagina aperta: non toglierlo.' },
      { chiave: 'config.lurk.tieniSchermoAcceso', etichetta: 'Offri di tenere acceso lo schermo', tipo: 'interruttore',
        aiuto: 'Acceso, compare un comando in più che impedisce allo schermo di spegnersi. Consuma batteria di chi guarda ed è spento di serie: resta comunque una scelta del visitatore, non parte da solo.' },

      { chiave: 'lurk.accendi', etichetta: 'Bottone — attiva', tipo: 'testo', max: 40 },
      { chiave: 'lurk.spegni', etichetta: 'Bottone — disattiva', tipo: 'testo', max: 40 },
      { chiave: 'lurk.audio', etichetta: 'Bottone — togli il muto', tipo: 'testo', max: 60,
        aiuto: 'Una scheda muta viene sospesa più facilmente dal browser. Il muto lo toglie il visitatore con un clic: il sito non lo fa mai da solo.' },
      { chiave: 'lurk.schermo', etichetta: 'Bottone — tieni acceso lo schermo', tipo: 'testo', max: 60,
        aiuto: 'Compare solo se hai acceso l\'interruttore qui sopra. Anche in quel caso lo schermo resta acceso solo se il visitatore preme il bottone: non succede mai da solo.' },
      { chiave: 'lurk.ripresa', etichetta: 'Domanda alla riapertura della pagina', tipo: 'testo', max: 80,
        aiuto: 'La modalità lurk non si riaccende da sola: si ricorda la scelta e si chiede conferma.' },
      { chiave: 'lurk.ciSei', etichetta: 'Domanda «ci sei ancora?»', tipo: 'testo', max: 80 },
      { chiave: 'lurk.ciSono', etichetta: 'Bottone — «sono qui»', tipo: 'testo', max: 30 },

      // Questi sette stati li scrive js/lurk.js con textContent: se fossero
      // «ricco», i tag verrebbero stampati letterali invece che interpretati.
      { chiave: 'lurk.statoSpento', etichetta: 'Stato — spenta', tipo: 'testo', max: 80 },
      { chiave: 'lurk.statoVivo', etichetta: 'Stato — il video sta andando', tipo: 'testo', max: 80 },
      { chiave: 'lurk.statoFermo', etichetta: 'Stato — il video si è fermato', tipo: 'testo', max: 80 },
      { chiave: 'lurk.statoRiparto', etichetta: 'Stato — sto riavviando', tipo: 'testo', max: 80 },
      { chiave: 'lurk.statoBloccato', etichetta: 'Stato — riproduzione bloccata dal browser', tipo: 'testo', max: 120,
        aiuto: 'Qui il sito non può fare niente da solo: l\'autoplay negato si sblocca solo con un gesto del visitatore.' },
      { chiave: 'lurk.statoAttesa', etichetta: 'Stato — canale fuori onda', tipo: 'testo', max: 100,
        aiuto: 'A canale spento non c\'è nessuna sessione da tenere viva: il lurk aspetta e non tocca il player.' },
      { chiave: 'lurk.chiuso', etichetta: 'Stato — spenta perché il canale è finito', tipo: 'testo', max: 100,
        aiuto: 'La modalità lurk vale solo a canale acceso: quando la diretta finisce si spegne da sola e scrive questa riga. Non è un ripiego, è la regola — a diretta spenta non c\'è nessuna sessione da tenere viva, e insistere sarebbe soltanto un player che si riavvia a vuoto.' },
      { chiave: 'lurk.statoResa', etichetta: 'Stato — ho smesso di provarci', tipo: 'testo', max: 100 },
      { chiave: 'lurk.statoNiente', etichetta: 'Stato — comandi del player non disponibili', tipo: 'testo', max: 100,
        aiuto: 'Succede quando l\'SDK di Twitch è bloccato da un adblock: resta il video, ma senza comandi non si può riavviare niente.' },
      { chiave: 'lurk.conto', etichetta: 'Contatore — senza riavvii', tipo: 'testo', max: 60,
        aiuto: 'Puoi usare {durata}, che viene sostituito da una cosa tipo «1h 12m».' },
      { chiave: 'lurk.contoRiavvii', etichetta: 'Contatore — con i riavvii', tipo: 'testo', max: 60,
        aiuto: 'Qui puoi usare {durata} e {riavvii}.' },

      // ---- Il messaggio in chat. Da qui in giù serve un'app Twitch. ----
      { chiave: 'config.lurk.messaggioAttivo', etichetta: 'Permetti di dire in chat che si sta guardando', tipo: 'interruttore',
        aiuto: 'ATTENZIONE: non aumenta il numero di spettatori — Twitch non conta chi scrive in chat, conta chi ha il video acceso. Serve solo a farsi vedere dalla chat e da chi trasmette. Richiede il profilo del sito acceso e il suo Client ID (gruppo «Profilo del sito»), altrimenti resta spento comunque.' },
      { chiave: 'config.lurk.frasi', etichetta: 'Frasi del messaggio di lurk', tipo: 'elencoTesti',
        aiuto: 'IMPORTANTE: devono DICHIARARE che si sta guardando in silenzio («Lurko dal sito»), non fingere presenza attiva («Ci sono, sono attivo!»). È la differenza fra un messaggio onesto e uno ingannevole, ed è l\'unica cosa che rende accettabile questa funzione: il codice è identico, cambia solo cosa c\'è scritto.' },
      { chiave: 'lurk.preavviso', etichetta: 'Avviso di cosa verrà detto in chat', tipo: 'testo', max: 90,
        aiuto: 'Compare a chi si è collegato, PRIMA che attivi il lurk: il messaggio parte da solo all\'attivazione, quindi va detto in anticipo cosa dirà. Usa {frase}, che viene sostituito dalla frase scelta.' },
      { chiave: 'lurk.invito', etichetta: 'Invito a collegarsi, all\'accensione', tipo: 'testo', max: 90,
        aiuto: 'Compare a chi accende la modalità lurk e non si è collegato con Twitch, sopra al bottone del collegamento. Usa {frase}: va detto qui che cosa verrà scritto in chat, prima che quella persona decida di collegarsi.' },
      { chiave: 'lurk.manda', etichetta: 'Bottone — dillo in chat', tipo: 'testo', max: 40,
        aiuto: 'Compare solo a chi ha un adblock che blocca l\'SDK di Twitch: lì il lurk non può riavviare niente e quindi non c\'è un\'attivazione a cui agganciare il messaggio, ma la persona sta guardando lo stesso. Un clic, un messaggio, con la frase dichiarata qui accanto.' },
      { chiave: 'lurk.inviato', etichetta: 'Conferma dopo l\'invio', tipo: 'testo', max: 80 }
    ]
  },

  {
    id: 'pollo',
    titolo: 'Il pollo',
    descrizione: 'La mascotte accanto al player: cosa dice, e se ascoltare davvero la chat del canale.',
    campi: [
      { chiave: 'config.pollo.attivo', etichetta: 'Mostra il pollo', tipo: 'interruttore',
        aiuto: 'Spento, la mascotte non compare per nessuno e il resto di questo gruppo non ha effetto.' },
      { chiave: 'pollo.etichetta', etichetta: 'Cosa fa il pollo, per chi non lo vede', tipo: 'testo', max: 60,
        aiuto: 'È l\'etichetta del bottone, letta dai lettori di schermo: descrivi l\'azione («Apri la chat del canale»), non l\'immagine.' },
      { chiave: 'pollo.nascondi', etichetta: 'Etichetta del bottone «nascondi»', tipo: 'testo', max: 40,
        aiuto: 'Chi lo usa non rivede il pollo: la scelta resta memorizzata nel suo browser.' },
      // Qui NON c'è una descrizione dell'immagine, e non è una dimenticanza:
      // il disegno del pollo sta dentro un bottone che ha già il suo nome
      // (l'etichetta qui sopra). Descrivendo anche l'immagine, un lettore di
      // schermo annuncerebbe due volte la stessa cosa.

      { chiave: 'config.pollo.chatVera', etichetta: 'Ascolta la chat vera del canale', tipo: 'interruttore',
        aiuto: 'Acceso, il sito si collega in sola lettura alla chat di Twitch e il pollo reagisce quando qualcuno scrive davvero. Spento, il pollo si limita a stato del canale e clic.' },
      { chiave: 'config.pollo.mostraMessaggi', etichetta: 'Mostra il testo dei messaggi nel fumetto', tipo: 'interruttore',
        aiuto: 'ATTENZIONE: acceso, sul sito finisce quello che la gente scrive in chat, insulti compresi, senza che nessuno lo abbia letto prima. Spento (consigliato) il pollo dice solo una frase tua con il nome di chi ha scritto.' },

      { chiave: 'config.pollo.frasi.riposo', etichetta: 'Frasi — quando non succede niente', tipo: 'elencoTesti',
        aiuto: 'Da tre a sei frasi brevi, nessuna vuota: il pollo ne pesca una a caso.' },
      { chiave: 'config.pollo.frasi.click', etichetta: 'Frasi — quando gli si clicca sopra', tipo: 'elencoTesti',
        aiuto: 'Il clic apre anche la chat: le frasi possono darlo per scontato.' },
      // Questo elenco serve a due momenti diversi: un messaggio dalla chat
      // vera (il nome si sa) e il visitatore che smette di scrivere nella
      // chat incorporata (il nome non si sa, l'iframe è di un altro dominio).
      // Per il secondo caso servono frasi che stiano in piedi senza {nome}.
      { chiave: 'config.pollo.frasi.chat', etichetta: 'Frasi — quando qualcuno scrive in chat', tipo: 'elencoTesti',
        aiuto: 'Qui, e solo qui, puoi scrivere {nome}: viene sostituito dal nome di chi ha scritto (negli altri elenchi resterebbe stampato così com\'è). Tienine almeno un paio SENZA {nome}: quando a scrivere sei tu nella chat qui sul sito, il nome non si sa e il pollo usa quelle.' },
      { chiave: 'config.pollo.frasi.scrive', etichetta: 'Frasi — mentre il visitatore scrive nella chat', tipo: 'elencoTesti',
        aiuto: 'Il sito non può leggere dentro la chat di Twitch: sa solo che il cursore è finito lì dentro. Evita frasi che diano per certo che il messaggio sia partito.' },
      { chiave: 'config.pollo.frasi.live', etichetta: 'Frasi — quando il canale va in onda', tipo: 'elencoTesti' },
      { chiave: 'config.pollo.frasi.lurk', etichetta: 'Frasi — quando si attiva la modalità lurk', tipo: 'elencoTesti',
        aiuto: 'Le dice quando il visitatore accende il lurk qui sopra. Se la modalità lurk è spenta, questo elenco non viene mai usato.' },
      { chiave: 'config.pollo.frasi.offline', etichetta: 'Frasi — quando il canale è spento', tipo: 'elencoTesti',
        aiuto: 'Meglio non scriverci dentro giorni e orari fissi: se cambi le dirette qui sotto, queste frasi resterebbero indietro.' }
    ]
  },

  // La vetrina delle clip sta in fondo alla sezione «diretta», sotto il
  // riquadro del lurk: quindi il gruppo viene dopo «pollo» e prima della
  // «settimana», come tutto il resto segue l'ordine in cui si scende.
  {
    id: 'clip',
    titolo: 'Le clip',
    descrizione: 'La vetrina dei momenti migliori, in fondo alla sezione «La diretta». Le clip le prende il server da Twitch a ogni pubblicazione: qui si decide quante, di che periodo, e come si presenta.',
    campi: [
      { chiave: 'config.clip.attivo', etichetta: 'Mostra le clip', tipo: 'interruttore',
        aiuto: 'Spento, la vetrina non compare per nessuno, il resto di questo gruppo non ha effetto e alla pubblicazione non viene chiesto niente a Twitch.' },
      { chiave: 'config.clip.quante', etichetta: 'Quante clip mostrare', tipo: 'numero', min: 1, max: 12,
        aiuto: 'Da 1 a 12. Sei è un buon numero: due righe da tre sui monitor larghi, una colonna sul telefono.' },
      { chiave: 'config.clip.periodo', etichetta: 'Fra le clip di quale periodo', tipo: 'scelta',
        opzioni: [
          { valore: '7', etichetta: 'Ultima settimana' },
          { valore: '30', etichetta: 'Ultimo mese' },
          { valore: '365', etichetta: 'Ultimo anno' },
          { valore: 'sempre', etichetta: 'Da sempre' }
        ],
        aiuto: 'Twitch le ordina per visualizzazioni, dalla più vista in giù. Periodo stretto = vetrina che cambia spesso ma può restare vuota nelle settimane fiacche; «da sempre» = sempre piena, ma sempre uguale.' },
      { chiave: 'clip.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'clip.titolo', etichetta: 'Titolo della vetrina', tipo: 'testo', max: 60 },
      { chiave: 'clip.testo', etichetta: 'Riga di presentazione', tipo: 'ricco', max: 220,
        aiuto: 'Una riga sotto al titolo. Può restare vuota.' },
      { chiave: 'clip.guarda', etichetta: 'Cosa fa il link della card, per chi non la vede', tipo: 'testo', max: 40,
        aiuto: 'Lo leggono i lettori di schermo, seguito dal titolo della clip: scrivi l\'azione («Guarda la clip»), non «clicca qui».' },
      { chiave: 'clip.visualizzazioni', etichetta: 'Parola per le visualizzazioni', tipo: 'testo', max: 30,
        aiuto: 'Compare dopo il numero: «1.2k visualizzazioni».' },
      { chiave: 'clip.di', etichetta: 'Parola prima del nome di chi l\'ha creata', tipo: 'testo', max: 20,
        aiuto: 'Le clip le ritaglia chi guarda, non chi trasmette: questo dice di chi è il merito. Per esempio «clip di».' }
    ]
  },

  {
    id: 'settimana',
    titolo: 'La settimana',
    descrizione: 'Il nastro dei sette giorni. I giorni di diretta si impostano qui: il nastro si ricalcola da solo.',
    campi: [
      { chiave: 'settimana.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'settimana.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'settimana.testo', etichetta: 'Testo introduttivo', tipo: 'ricco', max: 240 },
      { chiave: 'settimana.nota', etichetta: 'Nota in fondo', tipo: 'ricco', max: 300 },
      // Le quattro etichette del nastro finiscono anche in js/dati.js e nel
      // testo di un attributo: restano testo semplice, senza HTML.
      { chiave: 'settimana.etichettaDiretta', etichetta: 'Etichetta dei giorni con diretta', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaRiposo', etichetta: 'Etichetta dei giorni di riposo', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaOggi', etichetta: 'Etichetta «oggi»', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaProssima', etichetta: 'Etichetta «prossima»', tipo: 'testo', max: 20 },
      { chiave: 'settimana.cta', etichetta: 'Bottone in fondo alla sezione', tipo: 'testo', max: 30 },
      { chiave: 'config.orari', etichetta: 'Giorni e ora delle dirette', tipo: 'orari',
        aiuto: 'Da qui nascono il nastro della settimana e il conto alla rovescia.' }
    ]
  },

  {
    id: 'chi',
    titolo: 'Chi sono',
    descrizione: 'La parte editoriale: testo a colonna larga, note a margine e citazione.',
    campi: [
      { chiave: 'chi.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'chi.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'chi.apertura', etichetta: 'Paragrafo di apertura', tipo: 'ricco', max: 320,
        aiuto: 'Usato anche nella scheda strutturata per i motori di ricerca: lì conta solo il testo, la formattazione si perde.' },
      { chiave: 'chi.corpo1', etichetta: 'Primo paragrafo', tipo: 'ricco', max: 600 },
      { chiave: 'chi.citazione', etichetta: 'Citazione in grande', tipo: 'ricco', max: 200 },
      { chiave: 'chi.corpo2', etichetta: 'Secondo paragrafo', tipo: 'ricco', max: 600 },
      { chiave: 'chi.tag1', etichetta: 'Etichetta 1', tipo: 'testo', max: 40 },
      { chiave: 'chi.tag2', etichetta: 'Etichetta 2', tipo: 'testo', max: 40 },
      { chiave: 'chi.tag3', etichetta: 'Etichetta 3', tipo: 'testo', max: 40 },
      { chiave: 'chi.tag4', etichetta: 'Etichetta 4', tipo: 'testo', max: 40 },
      { chiave: 'chi.tag5', etichetta: 'Etichetta 5', tipo: 'testo', max: 40 },
      { chiave: 'chi.tag6', etichetta: 'Etichetta 6', tipo: 'testo', max: 40 },
      { chiave: 'chi.cta', etichetta: 'Bottone della sezione', tipo: 'testo', max: 40 },
      { chiave: 'chi.nota1Titolo', etichetta: 'Prima nota a margine — titolo', tipo: 'testo', max: 30 },
      { chiave: 'chi.nota1Testo', etichetta: 'Prima nota a margine — testo', tipo: 'ricco', max: 160 },
      { chiave: 'chi.nota2Titolo', etichetta: 'Seconda nota a margine — titolo', tipo: 'testo', max: 30 },
      { chiave: 'chi.nota2Testo', etichetta: 'Seconda nota a margine — testo', tipo: 'ricco', max: 160 },
      { chiave: 'chi.nota3Titolo', etichetta: 'Terza nota a margine — titolo', tipo: 'testo', max: 30 },
      { chiave: 'chi.nota3Testo', etichetta: 'Terza nota a margine — testo', tipo: 'ricco', max: 160 },
      { chiave: 'chi.dato1Valore', etichetta: 'Primo numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'chi.dato1Etichetta', etichetta: 'Primo numero — etichetta', tipo: 'testo', max: 40 },
      { chiave: 'chi.dato2Valore', etichetta: 'Secondo numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'chi.dato2Etichetta', etichetta: 'Secondo numero — etichetta', tipo: 'testo', max: 40 },
      { chiave: 'chi.dato3Valore', etichetta: 'Terzo numero — valore', tipo: 'testo', max: 12 },
      { chiave: 'chi.dato3Etichetta', etichetta: 'Terzo numero — etichetta', tipo: 'testo', max: 40 },
      { chiave: 'chi.ritrattoAlt', etichetta: 'Descrizione del ritratto', tipo: 'testolungo', max: 160,
        aiuto: 'Finisce nell\'attributo alt dell\'immagine: solo testo, niente formattazione.' }
    ]
  },

  {
    id: 'supporto',
    titolo: 'Come dare una mano',
    descrizione: 'Il listino delle righe di supporto. Una riga senza link sparisce dal sito invece di comparire rotta.',
    campi: [
      { chiave: 'supporto.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'supporto.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'supporto.testo', etichetta: 'Testo introduttivo', tipo: 'ricco', max: 320 },
      { chiave: 'supporto.chiusura', etichetta: 'Riga di chiusura', tipo: 'ricco', max: 240 },
      { chiave: 'config.supporto', etichetta: 'Righe del listino', tipo: 'elenco', etichettaVoce: 'titolo',
        aiuto: 'Le righe compaiono nell\'ordine in cui stanno qui.',
        campi: [
          { chiave: 'chiave', etichetta: 'Nome interno', tipo: 'testo', max: 30,
            aiuto: 'Non si vede sul sito: serve solo a distinguere le righe fra loro.' },
          { chiave: 'icona', etichetta: 'Icona', tipo: 'scelta', opzioni: ICONE_SUPPORTO,
            aiuto: 'Corrisponde al file modelli/icone/<nome>.svg.' },
          { chiave: 'titolo', etichetta: 'Titolo della riga', tipo: 'testo', max: 40 },
          { chiave: 'testo', etichetta: 'Spiegazione', tipo: 'ricco', max: 260 },
          { chiave: 'tag', etichetta: 'Etichetta a destra', tipo: 'testo', max: 20,
            aiuto: 'Per esempio il prezzo, oppure «Gratis».' },
          { chiave: 'cta', etichetta: 'Testo del bottone', tipo: 'testo', max: 30 },
          { chiave: 'url', etichetta: 'Link', tipo: 'url', facoltativo: true,
            aiuto: 'Vuoto = la riga sparisce dal sito.' }
        ] }
    ]
  },

  {
    id: 'saluti',
    titolo: 'Dove mi trovi',
    descrizione: 'Social e contatti, la schermata di fine diretta.',
    campi: [
      { chiave: 'saluti.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'saluti.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'saluti.testo', etichetta: 'Testo introduttivo', tipo: 'ricco', max: 240 },
      { chiave: 'saluti.contattiTitolo', etichetta: 'Contatti — titolo', tipo: 'testo', max: 40 },
      { chiave: 'saluti.contattiTesto', etichetta: 'Contatti — testo', tipo: 'ricco', max: 240 },
      // Il testo di questo bottone lo riscrive js/sito.js dopo la copia:
      // deve restare una stringa semplice, non un pezzo di HTML.
      { chiave: 'saluti.copiaBtn', etichetta: 'Bottone «copia l\'email»', tipo: 'testo', max: 30 },
      { chiave: 'saluti.copiaFatto', etichetta: 'Conferma dopo la copia', tipo: 'testo', max: 30 },
      { chiave: 'saluti.scriviBtn', etichetta: 'Bottone «scrivi una mail»', tipo: 'testo', max: 30 },
      { chiave: 'saluti.chiusura', etichetta: 'Riga di chiusura', tipo: 'ricco', max: 200 },
      { chiave: 'config.social', etichetta: 'Profili social', tipo: 'elenco', etichettaVoce: 'nome',
        aiuto: 'Compaiono nel binario e nella sezione dei saluti, nello stesso ordine.',
        campi: [
          { chiave: 'chiave', etichetta: 'Nome interno', tipo: 'testo', max: 30,
            aiuto: 'Non si vede sul sito: serve solo a distinguere le voci fra loro.' },
          { chiave: 'nome', etichetta: 'Nome', tipo: 'testo', max: 30 },
          { chiave: 'handle', etichetta: 'Come ti chiami là', tipo: 'testo', max: 60,
            aiuto: 'Per esempio @slayer_beard.' },
          { chiave: 'url', etichetta: 'Link', tipo: 'url', facoltativo: true,
            aiuto: 'Vuoto = la voce sparisce dal sito.' },
          { chiave: 'icona', etichetta: 'Icona', tipo: 'scelta', opzioni: ICONE_SOCIAL,
            aiuto: 'Corrisponde al file modelli/icone/<nome>.svg.' }
        ] }
    ]
  },

  {
    id: 'piede',
    titolo: 'Piede della pagina',
    descrizione: 'Le tre righe in fondo.',
    campi: [
      { chiave: 'footer.copy', etichetta: 'Riga del copyright', tipo: 'testo', max: 60,
        aiuto: 'L\'anno viene aggiunto dalla generazione, non scriverlo qui.' },
      { chiave: 'footer.disclaimer', etichetta: 'Avvertenza sui marchi', tipo: 'ricco', max: 300 },
      { chiave: 'footer.nota', etichetta: 'Nota finale', tipo: 'ricco', max: 80 }
    ]
  },

  {
    id: 'canale',
    titolo: 'Canale, contatti e immagini',
    descrizione: 'I dati tecnici: da qui passano il player, il conto alla rovescia e le immagini del sito.',
    campi: [
      { chiave: 'config.twitch.canale', etichetta: 'Nome del canale su Twitch', tipo: 'testo', max: 30,
        aiuto: 'Solo il nome, senza https://twitch.tv/ davanti. Da qui passano anche il player e la chat che ascolta il pollo.' },
      { chiave: 'config.twitch.idUtente', etichetta: 'ID numerico del canale', tipo: 'testo', max: 20,
        aiuto: 'Serve al player. Cambialo solo se cambia il canale.' },
      { chiave: 'config.twitch.domini', etichetta: 'Domini autorizzati al player', tipo: 'elencoTesti', facoltativo: true,
        aiuto: 'Il dominio da cui si pubblica il sito. localhost e 127.0.0.1 sono aggiunti da soli.' },
      { chiave: 'config.sitoUrl', etichetta: 'Indirizzo pubblico del sito', tipo: 'url', facoltativo: true,
        aiuto: 'Da riempire quando il sito è online, per esempio https://slayerbeard.it. Lasciandolo vuoto, i link di anteprima restano relativi.' },
      { chiave: 'config.email', etichetta: 'Indirizzo email pubblico', tipo: 'email' },
      { chiave: 'config.ultimaDiretta', etichetta: 'Ultima diretta', tipo: 'testo', max: 120,
        aiuto: 'Titolo dell\'ultima serata: compare nel quadro comandi. Lo riempie da sé la pubblicazione, chiedendolo a Twitch, se hai impostato il client secret con «node server/imposta-twitch.js»; senza quello resta il valore che scrivi qui.' },
      { chiave: 'config.dati.follower', etichetta: 'Follower', tipo: 'numero', min: 0, max: 100000000 },
      { chiave: 'config.dati.abbonati', etichetta: 'Abbonati', tipo: 'numero', min: 0, max: 1000000 },
      { chiave: 'config.dati.spettatoriMedi', etichetta: 'Spettatori medi', tipo: 'numero', min: 0, max: 1000000 },
      { chiave: 'config.dati.dal', etichetta: 'Su Twitch dall\'anno', tipo: 'numero', min: 2005, max: 2100 },
      { chiave: 'config.dati.lingua', etichetta: 'Lingue delle dirette', tipo: 'testo', max: 40 },
      { chiave: 'config.dati.ruolo', etichetta: 'Ruolo su Twitch', tipo: 'testo', max: 40 },
      { chiave: 'config.dati.prefissoEmote', etichetta: 'Prefisso delle emote', tipo: 'testo', max: 30 },
      { chiave: 'config.immagini.avatar', etichetta: 'Avatar', tipo: 'immagine' },
      { chiave: 'config.immagini.banner', etichetta: 'Banner della copertina', tipo: 'immagine' },
      { chiave: 'config.immagini.mascotte', etichetta: 'Mascotte', tipo: 'immagine',
        aiuto: 'È l\'immagine del pollo accanto al player. È decorativa: chi non la vede sente l\'etichetta del bottone, nel gruppo «Il pollo».' },
      { chiave: 'config.immagini.og', etichetta: 'Immagine di anteprima per i social', tipo: 'immagine',
        aiuto: '1200×630 pixel: è quella che si vede quando il link viene condiviso.' },
      { chiave: 'config.immagini.favicon', etichetta: 'Icona della linguetta', tipo: 'immagine' }
    ]
  },

  {
    id: 'aspetto',
    titolo: 'Aspetto',
    descrizione: 'Colori, font e forma di tutto il sito. Quello che scegli qui diventa css/tema.css alla pubblicazione: vale su ogni sezione insieme, non su una sola.',
    campi: [
      { chiave: 'config.tema.colori.viola', etichetta: 'Viola del marchio', tipo: 'colore',
        aiuto: 'La tinta guida: bottoni pieni, aloni dello sfondo, giorni con diretta. Cambiando questo cambia il sito intero.' },
      { chiave: 'config.tema.colori.violaCupo', etichetta: 'Viola profondo', tipo: 'colore',
        aiuto: 'La coda scura dei gradienti e degli aloni. Va tenuto più scuro del viola del marchio, altrimenti lo sfondo si appiattisce.' },
      { chiave: 'config.tema.colori.violaChiaro', etichetta: 'Viola chiaro (per scrivere)', tipo: 'colore',
        aiuto: 'Il viola usato per il testo e le icone: deve staccare dal fondo, il viola pieno non ce la fa.' },
      { chiave: 'config.tema.colori.ciano', etichetta: 'Ciano — tutto ciò che è «acceso»', tipo: 'colore',
        aiuto: 'Voce attiva del menu e anello di messa a fuoco: chi naviga da tastiera si orienta con questo colore.' },
      { chiave: 'config.tema.colori.magenta', etichetta: 'Magenta — accento raro', tipo: 'colore' },
      { chiave: 'config.tema.colori.live', etichetta: 'Colore «in onda»', tipo: 'colore',
        aiuto: 'La spia e il bollino LIVE.' },
      { chiave: 'config.tema.colori.ok', etichetta: 'Colore «fatto»', tipo: 'colore',
        aiuto: 'Per esempio la conferma dopo aver copiato l\'email.' },
      { chiave: 'config.tema.colori.allerta', etichetta: 'Colore «attenzione»', tipo: 'colore',
        aiuto: 'Verifica in corso, dato non disponibile.' },
      { chiave: 'config.tema.colori.fondo', etichetta: 'Fondo della pagina', tipo: 'colore',
        aiuto: 'Sceglierlo chiaro ribalta tutto il sito: linee e vetri diventano scuri da soli. Ricontrolla i tre colori del testo qui sotto, perché il testo chiaro su fondo chiaro sparisce.' },
      { chiave: 'config.tema.colori.testo', etichetta: 'Testo — titoli e testo forte', tipo: 'colore',
        aiuto: 'Deve stare almeno a 4,5:1 con il fondo, altrimenti il sito non è leggibile a tutti.' },
      { chiave: 'config.tema.colori.testoMedio', etichetta: 'Testo — paragrafi', tipo: 'colore',
        aiuto: 'È il colore che si legge di più: anche questo almeno a 4,5:1 con il fondo.' },
      { chiave: 'config.tema.colori.testoTenue', etichetta: 'Testo — note ed etichette', tipo: 'colore',
        aiuto: 'Il più scarico dei tre. Sotto 4,5:1 diventa illeggibile per chi ci vede poco: il pannello te lo dice.' },

      { chiave: 'config.tema.font.titolo', etichetta: 'Font dei titoli', tipo: 'font', slot: 'titolo',
        aiuto: 'Titoli e marchio. I font non di sistema si scaricano da Google Fonts: più ne cambi, più la pagina impiega ad arrivare.' },
      { chiave: 'config.tema.font.testo', etichetta: 'Font del testo', tipo: 'font', slot: 'testo',
        aiuto: 'Il font dei paragrafi: scegline uno che si legga bene in piccolo.' },
      { chiave: 'config.tema.font.mono', etichetta: 'Font della strumentazione', tipo: 'font', slot: 'mono',
        aiuto: 'Etichette maiuscole, numeri e conto alla rovescia. Deve essere a larghezza fissa, altrimenti il conto alla rovescia balla a ogni secondo.' },

      { chiave: 'config.tema.forma.raggio', etichetta: 'Arrotondamento degli angoli', tipo: 'numero', min: 0, max: 32,
        aiuto: 'In pixel. 0 = tutto squadrato. Gli angoli piccoli e quelli grandi si ricalcolano da questo.' },
      { chiave: 'config.tema.forma.maxLarghezza', etichetta: 'Larghezza massima del contenuto', tipo: 'numero', min: 900, max: 2200,
        aiuto: 'In pixel: oltre questa misura il contenuto smette di allargarsi e resta centrato. Vale anche per il player.' },
      { chiave: 'config.tema.forma.passo', etichetta: 'Unità di spaziatura', tipo: 'numero', min: 4, max: 16,
        aiuto: 'In pixel: tutti i margini del sito sono suoi multipli. Alzarlo distanzia ogni cosa, non solo una sezione.' },
      { chiave: 'config.tema.sfondo.aloni', etichetta: 'Intensità degli aloni sullo sfondo', tipo: 'numero', min: 0, max: 200,
        aiuto: '0 = fondo piatto, 100 = come adesso, 200 = doppio.' }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* COPERTURA                                                           */
/* ------------------------------------------------------------------ */

/** Tutti i campi, in fila, senza i gruppi intorno. */
function campi() {
  const fuori = [];
  for (const gruppo of gruppi) {
    for (const campo of gruppo.campi) { fuori.push(Object.assign({ gruppo: gruppo.id }, campo)); }
  }
  return fuori;
}

/** Il campo con questa chiave, oppure null. */
function campo(chiave) {
  for (const c of campi()) { if (c.chiave === chiave) { return c; } }
  return null;
}

function haChiave(oggetto, nome) {
  return oggetto !== null && typeof oggetto === 'object' && Object.prototype.hasOwnProperty.call(oggetto, nome);
}

/**
 * Segue un percorso dentro i contenuti con la stessa regola del motore di
 * template: prima la chiave letterale (in "testi" i punti fanno parte del
 * nome), poi la discesa segmento per segmento.
 */
function valoreDi(contenuti, chiave) {
  const radice = chiave.startsWith('config.') ? contenuti.config : contenuti.testi;
  const percorso = chiave.startsWith('config.') ? chiave.slice('config.'.length) : chiave;
  if (haChiave(radice, percorso)) { return { trovato: true, valore: radice[percorso] }; }

  let corrente = radice;
  for (const pezzo of percorso.split('.')) {
    if (!haChiave(corrente, pezzo)) { return { trovato: false, valore: undefined }; }
    corrente = corrente[pezzo];
  }
  return { trovato: true, valore: corrente };
}

/** Elenca le chiavi vere presenti nei contenuti, nella forma usata dallo schema. */
function chiaviDeiContenuti(contenuti) {
  const fuori = [];
  for (const chiave of Object.keys((contenuti && contenuti.testi) || {})) { fuori.push(chiave); }

  (function scendi(nodo, prefisso) {
    for (const nome of Object.keys(nodo || {})) {
      const valore = nodo[nome];
      const percorso = prefisso + '.' + nome;
      // Un oggetto si apre, un elenco no: gli elenchi sono un campo solo,
      // con i loro sottocampi descritti dentro al campo stesso.
      if (valore !== null && typeof valore === 'object' && !Array.isArray(valore)) { scendi(valore, percorso); }
      else { fuori.push(percorso); }
    }
  })((contenuti && contenuti.config) || {}, 'config');

  return fuori;
}

/**
 * Confronta schema e contenuti e restituisce l'elenco dei problemi.
 * Vuoto = copertura totale. Ogni voce è { tipo, chiave, messaggio }.
 * La chiama il server all'avvio e la generazione prima di scrivere.
 */
function verificaCopertura(contenuti) {
  const problemi = [];
  const tutti = campi();
  const dichiarate = new Set();

  for (const c of tutti) {
    if (dichiarate.has(c.chiave)) {
      problemi.push({ tipo: 'doppia', chiave: c.chiave, messaggio: 'La chiave "' + c.chiave + '" compare in più di un campo dello schema.' });
    }
    dichiarate.add(c.chiave);

    if (TIPI.indexOf(c.tipo) === -1) {
      problemi.push({ tipo: 'tipo', chiave: c.chiave, messaggio: 'Il campo "' + c.chiave + '" usa il tipo sconosciuto "' + c.tipo + '".' });
    }
    if (!c.etichetta) {
      problemi.push({ tipo: 'etichetta', chiave: c.chiave, messaggio: 'Il campo "' + c.chiave + '" non ha un\'etichetta.' });
    }
    // Un font senza slot non è controllabile: il catalogo di tema.js è
    // diviso per slot, e senza sapere quale non si sa dove cercarlo.
    if (c.tipo === 'font' && !c.slot) {
      problemi.push({ tipo: 'slot', chiave: c.chiave, messaggio: 'Il campo "' + c.chiave + '" è di tipo font ma non dice a quale slot appartiene (titolo, testo o mono).' });
    }

    const esito = valoreDi(contenuti, c.chiave);
    if (!esito.trovato) {
      problemi.push({ tipo: 'inesistente', chiave: c.chiave, messaggio: 'Il campo "' + c.chiave + '" punta a una chiave che in contenuti.json non esiste.' });
      continue;
    }

    // Per gli elenchi si controlla anche che i sottocampi coprano le voci vere.
    if (c.tipo === 'elenco' && Array.isArray(esito.valore)) {
      const dichiaratiVoce = new Set((c.campi || []).map((v) => v.chiave));
      const visti = new Set();
      for (const voce of esito.valore) {
        for (const nome of Object.keys(voce || {})) { visti.add(nome); }
      }
      for (const nome of visti) {
        if (!dichiaratiVoce.has(nome)) {
          problemi.push({ tipo: 'scoperta', chiave: c.chiave + '.' + nome, messaggio: 'Le voci di "' + c.chiave + '" hanno il campo "' + nome + '", che lo schema non descrive.' });
        }
      }
      for (const nome of dichiaratiVoce) {
        if (esito.valore.length && !visti.has(nome)) {
          problemi.push({ tipo: 'inesistente', chiave: c.chiave + '.' + nome, messaggio: 'Lo schema descrive "' + nome + '" dentro "' + c.chiave + '", ma nessuna voce ce l\'ha.' });
        }
      }
    }
  }

  for (const chiave of chiaviDeiContenuti(contenuti)) {
    if (dichiarate.has(chiave)) { continue; }
    // I rami riempiti dal server non hanno un campo, ed e voluto.
    if (GENERATI.indexOf(chiave) !== -1) { continue; }
    // Un campo che descrive un ramo intero (config.orari) copre le sue foglie.
    let coperta = false;
    if (chiave.startsWith('config.')) {
      const pezzi = chiave.split('.');
      for (let i = pezzi.length - 1; i > 1 && !coperta; i--) {
        if (dichiarate.has(pezzi.slice(0, i).join('.'))) { coperta = true; }
      }
    }
    if (!coperta) {
      problemi.push({ tipo: 'scoperta', chiave: chiave, messaggio: 'La chiave "' + chiave + '" esiste in contenuti.json ma nessun campo dello schema la descrive: dal pannello non si potrebbe modificare.' });
    }
  }

  for (const chiave of SISTEMA) {
    if (dichiarate.has(chiave)) {
      problemi.push({ tipo: 'doppia', chiave: chiave, messaggio: 'La chiave di sistema "' + chiave + '" non va descritta nello schema.' });
    }
  }

  for (const chiave of GENERATI) {
    if (dichiarate.has(chiave)) {
      problemi.push({ tipo: 'doppia', chiave: chiave, messaggio: 'La chiave "' + chiave + '" la riempie il server a ogni pubblicazione: un campo nel pannello sarebbe una casella riscritta sotto le dita di chi la compila.' });
    }
  }

  return problemi;
}

module.exports = { gruppi, TIPI, SISTEMA, GENERATI, campi, campo, valoreDi, chiaviDeiContenuti, verificaCopertura };
