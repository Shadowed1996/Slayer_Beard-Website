'use strict';

const TIPI = ['testo', 'testolungo', 'url', 'email', 'numero', 'immagine',
  'orario', 'orari', 'scelta', 'elencoTesti', 'elenco',
  'ricco', 'colore', 'font', 'interruttore', 'dataora'];

const SISTEMA = ['versione', 'aggiornatoIl'];

const GENERATI = ['config.clip.voci', 'config.clip.archivio', 'config.iscrittiYoutube'];

const EDITOR = ['config.sezioni', 'config.stili', 'config.disposizione'];

function diEditor(chiave) {
  return EDITOR.some((ramo) => chiave === ramo || chiave.startsWith(ramo + '.'));
}

const ICONE_SOCIAL = ['twitch', 'youtube', 'instagram', 'tiktok', 'discord', 'telegram', 'amazon-wishlist', 'amazon'];
const ICONE_SUPPORTO = ['star', 'crown', 'gem', 'heart', 'coffee', 'mail', 'amazon-wishlist'];
const ICONE_FORMATI = ['microfono', 'controller', 'etichetta', 'schermo', 'regalo', 'chat', 'star', 'heart', 'gem', 'mail'];

const GIF_RAFFICA = [
  { immagine: 'img/pollo-gif/raffica-ufficio.gif', scritta: 'VUOI ROMPERE IL MOUSE?' },
  { immagine: 'img/pollo-gif/raffica-gatto-gamer.gif', scritta: 'HAI ROTTO.' },
  { immagine: 'img/pollo-gif/raffica-portatile.gif', scritta: 'IL MOUSE HA CHIAMATO IL SINDACATO' },
  { immagine: 'img/pollo-gif/raffica-gatto-bottone.gif', scritta: 'NON È UN BOTTONE, È UN POLLO' },
  { immagine: 'img/pollo-gif/raffica-polli-tocco.gif', scritta: 'SMETTILA DI TOCCARMI' }
];

const GIF_SCROLL = [
  { immagine: 'img/pollo-gif/scroll-uccello-stordito.gif', scritta: 'TI GIRA LA TESTA?' },
  { immagine: 'img/pollo-gif/scroll-occhi-spirale.gif', scritta: 'DECIDITI: SU O GIÙ?' },
  { immagine: 'img/pollo-gif/scroll-vomito.gif', scritta: 'SU E GIÙ, SU E GIÙ… BLEAH' },
  { immagine: 'img/pollo-gif/scroll-psichedelico.gif', scritta: 'HAI IL MAL DI MARE?' }
];

const GIF_INSISTENZA = [
  { immagine: 'img/pollo-gif/insistenza-gatto.gif', scritta: 'NON HAI DI MEGLIO DA FARE?' },
  { immagine: 'img/pollo-gif/insistenza-cane.gif', scritta: 'ANCORA TU?' },
  { immagine: 'img/pollo-gif/insistenza-polli-sguardo.gif', scritta: 'SEMPRE QUI SEI?' },
  { immagine: 'img/pollo-gif/insistenza-polli-tavolo.gif', scritta: 'VAI A SEGUIRE LA LIVE, INVECE' },
  { immagine: 'img/pollo-gif/insistenza-alice.gif', scritta: 'CI SIAMO ANNOIATI, EH?' }
];

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
        aiuto: 'Serve a chi usa un lettore di schermo: descrivi cosa si vede nell\'immagine.' },
      { chiave: 'config.twitch.direttaCondivisa', etichetta: 'Diretta condivisa in corso', tipo: 'interruttore', facoltativo: true, predefinito: false,
        aiuto: 'Quando fai una live insieme a un altro canale, ognuno resta sul proprio: il player e la diretta non cambiano. Acceso, il messaggio del pollo esce con «[LURKO DA SLAYER_BEARD]» davanti alla frase, così chi legge una chat unita alle due capisce da dove arriva. Accendilo prima di iniziare, spegnilo (e pubblica) quando la condivisa finisce.' }
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

      { chiave: 'deck.dato1Etichetta', etichetta: 'Primo numero — etichetta', tipo: 'testo', max: 30,
        aiuto: 'Il valore è il numero vero dei follower del canale (campo «Follower» in «Canale e contatti»), che la pubblicazione aggiorna da Twitch.' },
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
    descrizione: 'La sezione del player: comandi della chat e nota per quando l\'embed non parte.',
    campi: [
      { chiave: 'diretta.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'diretta.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'diretta.nota', etichetta: 'Nota sotto al player', tipo: 'ricco', max: 300,
        aiuto: 'Cosa fare se il player non parte. Vale la pena tenerci un link a Twitch: è l\'unica via d\'uscita quando l\'embed viene bloccato.' },

      { chiave: 'deck.notaPlayer', etichetta: 'Riga dentro il piede del monitor', tipo: 'testolungo', max: 220,
        aiuto: 'Sta stretta sotto allo schermo, accanto ai bottoni: tienila breve.' },
      { chiave: 'deck.chatApri', etichetta: 'Bottone della chat — apri', tipo: 'testo', max: 30 },
      { chiave: 'deck.chatChiudi', etichetta: 'Bottone della chat — chiudi', tipo: 'testo', max: 30 }
    ]
  },

  {
    id: 'account',
    titolo: 'Profilo del sito (login con Twitch)',
    descrizione: 'Il login del sito: chi si collega ha una tessera col proprio nome e la propria immagine, e il sito può leggere da Twitch i dati che senza token non vedrebbe — se il canale è davvero in onda e il titolo dell\'ultima diretta. È lo stesso collegamento con cui la modalità lurk dice in chat che si sta guardando.',
    campi: [
      { chiave: 'config.account.attivo', etichetta: 'Permetti di collegarsi con Twitch', tipo: 'interruttore',
        aiuto: 'Spento, sul sito non compare nessun login: niente tessera, niente aggiornamento dell\'ultima diretta, e il messaggio in chat della modalità lurk resta spento comunque — senza account non c\'è nessuno a nome di cui parlare.' },

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
      { chiave: 'lurk.manutenzione', etichetta: 'Stato — spenta perché il sito va in manutenzione', tipo: 'testo', max: 100,
        predefinito: 'Il sito va in manutenzione: ho spento la modalità lurk.',
        aiuto: 'Quando dal pannello si accende la modalità manutenzione, le pagine già aperte se ne accorgono e si ricaricano. Il messaggio in chat però smette di partire subito, prima della ricarica: questa è la riga che lo dice. Finita la manutenzione, la scheda che era accesa riprende da sola.' },
      { chiave: 'lurk.statoResa', etichetta: 'Stato — ho smesso di provarci', tipo: 'testo', max: 100 },
      { chiave: 'lurk.statoNiente', etichetta: 'Stato — comandi del player non disponibili', tipo: 'testo', max: 100,
        aiuto: 'Succede quando l\'SDK di Twitch è bloccato da un adblock: resta il video, ma senza comandi non si può riavviare niente.' },
      { chiave: 'lurk.conto', etichetta: 'Contatore — senza riavvii', tipo: 'testo', max: 60,
        aiuto: 'Puoi usare {durata}, che viene sostituito da una cosa tipo «1h 12m».' },
      { chiave: 'lurk.contoRiavvii', etichetta: 'Contatore — con i riavvii', tipo: 'testo', max: 60,
        aiuto: 'Qui puoi usare {durata} e {riavvii}.' },

      { chiave: 'config.lurk.messaggioAttivo', etichetta: 'Permetti di dire in chat che si sta guardando', tipo: 'interruttore',
        aiuto: 'ATTENZIONE: non aumenta il numero di spettatori — Twitch non conta chi scrive in chat, conta chi ha il video acceso. Serve solo a farsi vedere dalla chat e da chi trasmette. Richiede il profilo del sito acceso e il suo Client ID (gruppo «Profilo del sito»), altrimenti resta spento comunque.' },
      { chiave: 'config.lurk.frasi', etichetta: 'Frasi del messaggio di lurk', tipo: 'elencoTesti',
        aiuto: 'IMPORTANTE: devono DICHIARARE che si sta guardando in silenzio («Lurko dal sito»), non fingere presenza attiva («Ci sono, sono attivo!»). È la differenza fra un messaggio onesto e uno ingannevole, ed è l\'unica cosa che rende accettabile questa funzione: il codice è identico, cambia solo cosa c\'è scritto.' },

      { chiave: 'config.lurk.minutiFraMessaggi', etichetta: 'Ogni quanti minuti ripetere il messaggio in chat', tipo: 'numero', min: 2, max: 120, predefinito: 10,
        aiuto: 'Da 2 a 120, di serie 10. Col lurk acceso il primo messaggio parte all\'attivazione, poi uno ogni tot minuti finché resta acceso. Più è basso, più è facile che Twitch o i moderatori lo prendano per spam: e a rimetterci è l\'account di chi guarda.' },
      { chiave: 'lurk.preavviso', etichetta: 'Avviso di cosa verrà detto in chat', tipo: 'testo', max: 90,
        aiuto: 'Compare a chi si è collegato, PRIMA che attivi il lurk: il messaggio parte da solo all\'attivazione e poi si ripete, quindi va detto in anticipo cosa dirà. Usa {frase}, che viene sostituito dalla frase scelta, e {minuti}, che diventa l\'intervallo impostato qui sopra.' },
      { chiave: 'lurk.invito', etichetta: 'Invito a collegarsi, all\'accensione', tipo: 'testo', max: 90,
        aiuto: 'Compare a chi accende la modalità lurk e non si è collegato con Twitch, sopra al bottone del collegamento. Usa {frase}: va detto qui che cosa verrà scritto in chat, prima che quella persona decida di collegarsi. {minuti} diventa l\'intervallo fra un messaggio e l\'altro.' },
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

      { chiave: 'config.pollo.chatVera', etichetta: 'Ascolta la chat vera del canale', tipo: 'interruttore',
        aiuto: 'Acceso, il sito si collega in sola lettura alla chat di Twitch e il pollo reagisce quando qualcuno scrive davvero. Spento, il pollo si limita a stato del canale e clic.' },
      { chiave: 'config.pollo.mostraMessaggi', etichetta: 'Mostra il testo dei messaggi nel fumetto', tipo: 'interruttore',
        aiuto: 'ATTENZIONE: acceso, sul sito finisce quello che la gente scrive in chat, insulti compresi, senza che nessuno lo abbia letto prima. Spento (consigliato) il pollo dice solo una frase tua con il nome di chi ha scritto.' },

      { chiave: 'config.pollo.frasi.riposo', etichetta: 'Frasi — quando non succede niente', tipo: 'elencoTesti',
        aiuto: 'Da tre a sei frasi brevi, nessuna vuota: il pollo ne pesca una a caso.' },
      { chiave: 'config.pollo.frasi.click', etichetta: 'Frasi — quando gli si clicca sopra', tipo: 'elencoTesti',
        aiuto: 'Il clic apre anche la chat: le frasi possono darlo per scontato.' },

      { chiave: 'config.pollo.frasi.chat', etichetta: 'Frasi — quando qualcuno scrive in chat', tipo: 'elencoTesti',
        aiuto: 'Qui, e solo qui, puoi scrivere {nome}: viene sostituito dal nome di chi ha scritto (negli altri elenchi resterebbe stampato così com\'è). Tienine almeno un paio SENZA {nome}: quando a scrivere sei tu nella chat qui sul sito, il nome non si sa e il pollo usa quelle.' },
      { chiave: 'config.pollo.frasi.scrive', etichetta: 'Frasi — mentre il visitatore scrive nella chat', tipo: 'elencoTesti',
        aiuto: 'Il sito non può leggere dentro la chat di Twitch: sa solo che il cursore è finito lì dentro. Evita frasi che diano per certo che il messaggio sia partito.' },
      { chiave: 'config.pollo.frasi.live', etichetta: 'Frasi — quando il canale va in onda', tipo: 'elencoTesti' },
      { chiave: 'config.pollo.frasi.lurk', etichetta: 'Frasi — quando si attiva la modalità lurk', tipo: 'elencoTesti',
        aiuto: 'Le dice quando il visitatore accende il lurk qui sopra. Se la modalità lurk è spenta, questo elenco non viene mai usato.' },
      { chiave: 'config.pollo.frasi.offline', etichetta: 'Frasi — quando il canale è spento', tipo: 'elencoTesti',
        aiuto: 'Meglio non scriverci dentro giorni e orari fissi: se cambi le dirette qui sotto, queste frasi resterebbero indietro.' },

      { chiave: 'config.slayer.attivo', etichetta: 'Sorpresa «slayer»: canzone e polletti', tipo: 'interruttore', predefinito: true,
        aiuto: 'Chi scrive «slayer» con la tastiera, in qualunque pagina del sito, fa partire per 21 secondi la pioggia di polletti con la canzone «J (mp3cut.net).mp3» della cartella mp3. Non parte scrivendo dentro una casella di testo e si ferma con Esc. Spenta, la sorpresa non esiste: lo script non viene nemmeno caricato. Vale dalla prossima Pubblica, ed è indipendente dal pollo qui sopra.' },
      { chiave: 'config.pollorun.attivo', etichetta: 'Pollo Run sul sito: scrivi «pollorun»', tipo: 'interruttore', predefinito: true,
        aiuto: 'Chi scrive «pollorun» con la tastiera, in qualunque pagina del sito, apre a tutto schermo il gioco Pollo Run, lo stesso della pagina di manutenzione, anche a sito acceso. Il tasto Esc (o la x in alto) lo chiude. Non parte scrivendo dentro una casella di testo. Spento, il gioco non esiste: lo script non viene nemmeno caricato. Le frasi che compaiono a fine livello e le canzoni del gioco sono quelle del gruppo «Modalità manutenzione», le stesse della pagina di manutenzione. Vale dalla prossima Pubblica.' },
      { chiave: 'config.classifica.attiva', etichetta: 'Pollo Run — classifica con l\'accesso Twitch', tipo: 'interruttore', predefinito: false,
        aiuto: 'Accesa, chi gioca a Pollo Run (sul sito scrivendo «pollorun» e nella pagina di manutenzione) ed è collegato con Twitch entra in classifica: conta il livello più alto completato, una classifica per ogni difficoltà, e a pari livello vince chi ci è arrivato prima. Un livello conta solo se è stato giocato davvero dall\'inizio alla fine. Spenta, il gioco resta com\'è e nessuno viene registrato. Vale dalla prossima Pubblica.' },
      { chiave: 'config.classifica.titolo', etichetta: 'Pollo Run — titolo della classifica', tipo: 'testo', max: 60, predefinito: 'Classifica di Pollo Run',
        aiuto: 'Compare in cima alla classifica, anche nell\'overlay per OBS.' },
      { chiave: 'config.classifica.righe', etichetta: 'Pollo Run — quanti giocatori mostrare', tipo: 'numero', min: 3, max: 25, predefinito: 10,
        aiuto: 'Quante righe ha la classifica, sul sito e nell\'overlay per OBS (nell\'indirizzo dell\'overlay si può cambiare con «righe=»).' },
      { chiave: 'config.classifica.difficoltaObs', etichetta: 'Pollo Run — difficoltà mostrata nell\'overlay per OBS', tipo: 'scelta', predefinito: 'medio',
        opzioni: [
          { valore: 'facile', etichetta: 'Facile' },
          { valore: 'medio', etichetta: 'Medio' },
          { valore: 'difficile', etichetta: 'Difficile' },
          { valore: 'estremo', etichetta: 'Estremo' },
          { valore: 'tutte', etichetta: 'Tutte e quattro, affiancate' }
        ],
        aiuto: 'L\'overlay si aggiunge in OBS come «Browser» con l\'indirizzo del sito seguito da /api/classifica/obs. Questa è la difficoltà che mostra se nell\'indirizzo non c\'è «difficolta=».' },
      { chiave: 'config.classifica.avatar', etichetta: 'Pollo Run — mostra le foto profilo di Twitch', tipo: 'interruttore', predefinito: true,
        aiuto: 'Accesa, accanto a ogni nome c\'è la foto profilo di Twitch. Spenta, solo posizione, nome e livello.' },
      { chiave: 'config.classifica.aggiornaSecondi', etichetta: 'Pollo Run — ogni quanti secondi si aggiorna l\'overlay', tipo: 'numero', min: 5, max: 60, predefinito: 15,
        aiuto: 'L\'overlay per OBS richiede la classifica ogni tanti secondi e si ridisegna solo se è cambiata.' }
    ]
  },

  {
    id: 'clip',
    titolo: 'Le clip',
    descrizione: 'La vetrina dei momenti migliori, in fondo alla sezione «La diretta», e la pagina «clip.html» con tutte quante, dove è chi visita a scegliere il periodo e a cercare una clip per titolo o autore. Le clip le prende il server da Twitch a ogni pubblicazione: qui si decide quante, di che periodo, e come si presentano.',
    campi: [
      { chiave: 'config.clip.attivo', etichetta: 'Mostra le clip', tipo: 'interruttore',
        aiuto: 'Spento, la vetrina non compare per nessuno, il resto di questo gruppo non ha effetto e alla pubblicazione non viene chiesto niente a Twitch. Acceso, compare in fondo a «La diretta», con un bottone in testa alla sezione che ci porta — ma solo dopo la prima Pubblica: è lì che il server va a prendere le clip su Twitch.' },
      { chiave: 'config.clip.quante', etichetta: 'Quante clip mostrare', tipo: 'numero', min: 1, max: 12,
        aiuto: 'Da 1 a 12. Sei è un buon numero: due righe da tre sui monitor larghi, una colonna sul telefono.' },
      { chiave: 'config.clip.periodo', etichetta: 'Fra le clip di quale periodo', tipo: 'scelta',
        opzioni: [
          { valore: '7', etichetta: 'Ultima settimana' },
          { valore: '30', etichetta: 'Ultimo mese' },
          { valore: '365', etichetta: 'Ultimo anno' },
          { valore: 'sempre', etichetta: 'Da sempre' }
        ],
        aiuto: 'Twitch le ordina per visualizzazioni, dalla più vista in giù. Periodo stretto = vetrina che cambia spesso ma può restare vuota nelle settimane fiacche; «da sempre» = sempre piena, ma sempre uguale. Vale per la vetrina in home: nella pagina «Tutte le clip» il periodo lo sceglie chi visita.' },

      { chiave: 'config.clip.quanteArchivio', etichetta: 'Quante clip nella pagina, per ogni periodo', tipo: 'numero', min: 4, max: 50, predefinito: 12,
        aiuto: 'Da 4 a 50, di serie 12. La pagina «clip.html» le porta già tutte dentro di sé e chi visita sceglie il periodo (24 ore, 3 giorni, 7 giorni, 30 giorni) senza aspettare niente: il prezzo è il peso della pagina, perché ogni clip in più è un\'anteprima in più da scaricare. Alzalo se il canale ne produce tante.' },
      { chiave: 'clip.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'clip.titolo', etichetta: 'Titolo della vetrina', tipo: 'testo', max: 60 },
      { chiave: 'clip.testo', etichetta: 'Riga di presentazione', tipo: 'ricco', max: 220,
        aiuto: 'Una riga sotto al titolo. Può restare vuota.' },

      { chiave: 'clip.invitoTitolo', etichetta: 'Home — titolo dell\'invito alle clip', tipo: 'testo', max: 60, predefinito: 'Migliori highlights',
        aiuto: 'In home, in fondo a «La diretta», al posto delle clip: il titolo sopra il bottone che porta alla pagina.' },
      { chiave: 'clip.invitoTesto', etichetta: 'Home — riga sotto il titolo', tipo: 'ricco', max: 160, facoltativo: true,
        predefinito: 'I momenti più belli delle live, ritagliati da chi guardava. Tutti in una pagina: il periodo lo scegli tu.',
        aiuto: 'Una riga breve. Può restare vuota.' },
      { chiave: 'clip.invitoBottone', etichetta: 'Home — scritta del bottone', tipo: 'testo', max: 30, predefinito: 'Vai alle clip',
        aiuto: 'Il bottone che porta alla pagina con tutte le clip.' },
      { chiave: 'clip.guarda', etichetta: 'Cosa fa il link della card, per chi non la vede', tipo: 'testo', max: 40,
        aiuto: 'Lo leggono i lettori di schermo, seguito dal titolo della clip: scrivi l\'azione («Guarda la clip»), non «clicca qui».' },
      { chiave: 'clip.visualizzazioni', etichetta: 'Parola per le visualizzazioni', tipo: 'testo', max: 30,
        aiuto: 'Compare dopo il numero: «1.2k visualizzazioni».' },
      { chiave: 'clip.di', etichetta: 'Parola prima del nome di chi l\'ha creata', tipo: 'testo', max: 20,
        aiuto: 'Le clip le ritaglia chi guarda, non chi trasmette: questo dice di chi è il merito. Per esempio «clip di».' },

      { chiave: 'clip.paginaTitolo', etichetta: 'Pagina — titolo', tipo: 'testo', max: 60, predefinito: 'Tutte le clip',
        aiuto: 'Il titolo della pagina «clip.html», e anche il link che ci porta da sotto la vetrina in home.' },
      { chiave: 'clip.paginaTesto', etichetta: 'Pagina — riga di presentazione', tipo: 'ricco', max: 220, predefinito: 'Le clip più viste del canale. Scegli il periodo: cambia quello che vedi, non la pagina.',
        aiuto: 'Una riga sotto al titolo della pagina. Può restare vuota. È anche la descrizione che finisce su Google, ripulita dal grassetto.' },
      { chiave: 'clip.paginaTorna', etichetta: 'Pagina — link per tornare al sito', tipo: 'testo', max: 30, predefinito: 'Torna al sito',
        aiuto: 'La pagina delle clip non ha il menu del sito: questo è il modo di tornare indietro, in alto a sinistra.' },
      { chiave: 'clip.filtroEtichetta', etichetta: 'Pagina — etichetta dei periodi', tipo: 'testo', max: 40, predefinito: 'Periodo',
        aiuto: 'La parola sopra ai quattro bottoni. La leggono anche i lettori di schermo, per dire di che gruppo di bottoni si tratta.' },
      { chiave: 'clip.filtro24ore', etichetta: 'Pagina — primo periodo', tipo: 'testo', max: 20, predefinito: '24 ore' },
      { chiave: 'clip.filtro3giorni', etichetta: 'Pagina — secondo periodo', tipo: 'testo', max: 20, predefinito: '3 giorni' },
      { chiave: 'clip.filtro7giorni', etichetta: 'Pagina — terzo periodo', tipo: 'testo', max: 20, predefinito: '7 giorni' },
      { chiave: 'clip.filtro30giorni', etichetta: 'Pagina — quarto periodo', tipo: 'testo', max: 20, predefinito: '30 giorni',
        aiuto: 'È il periodo da cui la pagina parte: chi arriva vede queste, e stringendo il periodo ne vede meno.' },
      { chiave: 'clip.vuoto', etichetta: 'Pagina — quando in un periodo non c\'è niente', tipo: 'testo', max: 120, predefinito: 'Nessuna clip in questo periodo.',
        aiuto: 'Capita davvero, ed è giusto che si veda: in una settimana tranquilla le 24 ore possono essere vuote anche se il mese è pieno. Meglio una riga che lo dice che una pagina bianca.' },
      { chiave: 'clip.cercaEtichetta', etichetta: 'Pagina — etichetta della ricerca', tipo: 'testo', max: 30, predefinito: 'Cerca',
        aiuto: 'La parola sopra alla barra di ricerca. La leggono anche i lettori di schermo.' },
      { chiave: 'clip.cercaSegnaposto', etichetta: 'Pagina — testo dentro la barra di ricerca', tipo: 'testo', max: 40, predefinito: 'Titolo o autore della clip',
        aiuto: 'Si vede finché la barra è vuota: dice su cosa si cerca.' },
      { chiave: 'clip.cercaPulisci', etichetta: 'Pagina — bottone che cancella la ricerca', tipo: 'testo', max: 40, predefinito: 'Cancella la ricerca',
        aiuto: 'Il bottone con la X dentro la barra non ha parole: questa la leggono i lettori di schermo.' },
      { chiave: 'clip.cercaUna', etichetta: 'Pagina — «clip trovata» (una sola)', tipo: 'testo', max: 20, predefinito: 'clip trovata',
        aiuto: 'Compare dopo il numero, mentre si cerca: «1 clip trovata».' },
      { chiave: 'clip.cercaTante', etichetta: 'Pagina — «clip trovate» (più di una, o nessuna)', tipo: 'testo', max: 20, predefinito: 'clip trovate',
        aiuto: 'Compare dopo il numero, mentre si cerca: «7 clip trovate».' },
      { chiave: 'clip.cercaVuoto', etichetta: 'Pagina — quando la ricerca non trova niente', tipo: 'testo', max: 120, predefinito: 'Nessuna clip corrisponde alla ricerca in questo periodo.',
        aiuto: 'La ricerca vale dentro al periodo scelto: una clip più vecchia si trova allargando il periodo.' }
    ]
  },

  {
    id: 'giochi',
    titolo: 'I giochi',
    descrizione: 'La pagina «giochi.html» con tutti i giochi portati in live: copertina ufficiale di Twitch, tipologia, quante dirette, ore e clip, prima e ultima volta. I numeri li raccoglie il server da Twitch a ogni pubblicazione; qui si decidono le parole, cosa non mostrare e le correzioni a mano. In home, in «Chi sono», compare un invito che porta alla pagina.',
    campi: [
      { chiave: 'config.giochi.attivo', etichetta: 'Mostra la pagina dei giochi', tipo: 'interruttore', predefinito: true,
        aiuto: 'Spento, la pagina «giochi.html» viene tolta dal sito e l\'invito in home sparisce. Acceso, la pagina si pubblica a ogni Pubblica, se c\'è almeno un gioco da mostrare.' },
      { chiave: 'giochi.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40, predefinito: 'Lo storico delle live' },
      { chiave: 'giochi.titolo', etichetta: 'Home — titolo dell\'invito', tipo: 'testo', max: 60, predefinito: 'I giochi della live',
        aiuto: 'In home, in fondo alla «Diretta», accanto all\'invito delle clip: il titolo sopra il bottone che porta alla pagina dei giochi.' },
      { chiave: 'giochi.testo', etichetta: 'Home — riga sotto il titolo', tipo: 'ricco', max: 220, facoltativo: true,
        predefinito: 'Scopri i giochi che ho portato in live: dagli horror ai party game con la chat, dagli shooter ai puzzle game.' },
      { chiave: 'giochi.invito', etichetta: 'Home — scritta del bottone', tipo: 'testo', max: 30, predefinito: 'Vedi tutti i giochi',
        aiuto: 'Il bottone che porta alla pagina «giochi.html».' },
      { chiave: 'giochi.paginaTitolo', etichetta: 'Pagina — titolo', tipo: 'testo', max: 60, predefinito: 'I giochi',
        aiuto: 'Il titolo della pagina «giochi.html», e anche quello che si legge nella scheda del browser.' },
      { chiave: 'giochi.paginaTesto', etichetta: 'Pagina — riga di presentazione', tipo: 'ricco', max: 220,
        predefinito: 'Ogni gioco portato in live sul canale. Filtra per tipologia e ordina come preferisci.' },
      { chiave: 'giochi.paginaTorna', etichetta: 'Pagina — link per tornare al sito', tipo: 'testo', max: 30, predefinito: 'Torna al sito',
        aiuto: 'La pagina dei giochi non ha il menu del sito: questo è il modo di tornare indietro, in alto a sinistra.' },
      { chiave: 'giochi.filtri', etichetta: 'Pagina — etichetta dei filtri', tipo: 'testo', max: 30, predefinito: 'Tipologia',
        aiuto: 'Il titoletto sopra le pillole delle tipologie. Lo leggono anche i lettori di schermo.' },
      { chiave: 'giochi.tutti', etichetta: 'Pagina — filtro «tutti»', tipo: 'testo', max: 20, predefinito: 'Tutti',
        aiuto: 'La prima pillola: toglie tutti i filtri.' },
      { chiave: 'giochi.ordina', etichetta: 'Pagina — etichetta dell\'ordine', tipo: 'testo', max: 20, predefinito: 'Ordina per' },
      { chiave: 'giochi.ordinaRecenti', etichetta: 'Pagina — ordine per data', tipo: 'testo', max: 30, predefinito: 'Giocati di recente',
        aiuto: 'È l\'ordine con cui la pagina si apre.' },
      { chiave: 'giochi.ordinaOre', etichetta: 'Pagina — ordine per ore', tipo: 'testo', max: 30, predefinito: 'Più ore in live' },
      { chiave: 'giochi.ordinaNome', etichetta: 'Pagina — ordine alfabetico', tipo: 'testo', max: 30, predefinito: 'Nome (A-Z)' },
      { chiave: 'giochi.gioco', etichetta: 'Parola per un gioco', tipo: 'testo', max: 20, predefinito: 'gioco',
        aiuto: 'Serve al conteggio sopra la griglia quando ne resta uno solo: «1 gioco».' },
      { chiave: 'giochi.giochi', etichetta: 'Parola per più giochi', tipo: 'testo', max: 20, predefinito: 'giochi',
        aiuto: 'Il conteggio sopra la griglia e in testa alla pagina: «24 giochi».' },
      { chiave: 'giochi.diretta', etichetta: 'Parola per una diretta', tipo: 'testo', max: 20, predefinito: 'diretta' },
      { chiave: 'giochi.dirette', etichetta: 'Parola per più dirette', tipo: 'testo', max: 20, predefinito: 'dirette' },
      { chiave: 'giochi.ora', etichetta: 'Parola per un\'ora', tipo: 'testo', max: 20, predefinito: 'ora' },
      { chiave: 'giochi.ore', etichetta: 'Parola per le ore', tipo: 'testo', max: 20, predefinito: 'ore' },
      { chiave: 'giochi.clip', etichetta: 'Parola per le clip', tipo: 'testo', max: 20, predefinito: 'clip' },
      { chiave: 'giochi.ultimaVolta', etichetta: 'Parola prima dell\'ultima data', tipo: 'testo', max: 30, predefinito: 'Ultima volta',
        aiuto: 'Sulla card: «Ultima volta 14 settembre 2026».' },
      { chiave: 'giochi.clipMigliore', etichetta: 'Link alla clip migliore', tipo: 'testo', max: 30, predefinito: 'Clip migliore',
        aiuto: 'Compare sulla card solo se il gioco ha almeno una clip.' },
      { chiave: 'giochi.vuoto', etichetta: 'Pagina — quando il filtro non trova niente', tipo: 'testo', max: 120,
        predefinito: 'Nessun gioco di questa tipologia, per ora.' },
      { chiave: 'giochi.cercaEtichetta', etichetta: 'Pagina — etichetta della ricerca', tipo: 'testo', max: 30, predefinito: 'Cerca',
        aiuto: 'La parola sopra alla barra di ricerca. La leggono anche i lettori di schermo.' },
      { chiave: 'giochi.cercaSegnaposto', etichetta: 'Pagina — testo dentro la barra di ricerca', tipo: 'testo', max: 40, predefinito: 'Nome o tipologia del gioco',
        aiuto: 'Si vede finché la barra è vuota: dice su cosa si cerca. La ricerca guarda il nome e le tipologie, e lavora insieme ai filtri.' },
      { chiave: 'giochi.cercaPulisci', etichetta: 'Pagina — bottone che cancella la ricerca', tipo: 'testo', max: 40, predefinito: 'Cancella la ricerca',
        aiuto: 'Il bottone con la X dentro la barra non ha parole: questa la leggono i lettori di schermo.' },
      { chiave: 'giochi.cercaVuoto', etichetta: 'Pagina — quando la ricerca non trova niente', tipo: 'testo', max: 120,
        predefinito: 'Nessun gioco corrisponde alla ricerca. Prova con un altro nome o togli i filtri.' },
      { chiave: 'config.giochi.nascosti', etichetta: 'Giochi da non mostrare', tipo: 'elencoTesti', facoltativo: true,
        predefinito: ['Just Chatting', 'Quattro chiacchiere', 'IRL', 'Special Events', 'Eventi speciali'],
        aiuto: 'Un nome per riga, scritto come su Twitch (maiuscole e minuscole non contano), oppure l\'id del gioco. Serve per le categorie che non sono giochi, come «Just Chatting».' },
      { chiave: 'config.giochi.correzioni', etichetta: 'Correzioni a mano', tipo: 'elenco', etichettaVoce: 'gioco', predefinito: [],
        aiuto: 'Quando Twitch sbaglia la tipologia o la copertina di un gioco, la correggi qui: vale a ogni pubblicazione, anche dopo che i dati si aggiornano.',
        campi: [
          { chiave: 'gioco', etichetta: 'Gioco', tipo: 'testo', max: 80, predefinito: 'Nome del gioco',
            aiuto: 'Il nome come compare sulla pagina, oppure l\'id di Twitch.' },
          { chiave: 'generi', etichetta: 'Tipologie', tipo: 'testo', max: 80, facoltativo: true, predefinito: '',
            aiuto: 'Separate da una virgola, al massimo tre: per esempio «Horror, Sopravvivenza». Vuoto: restano quelle di Twitch.' },
          { chiave: 'copertina', etichetta: 'Copertina', tipo: 'immagine', facoltativo: true, predefinito: '',
            aiuto: 'Meglio in verticale, 285×380. Vuota: resta quella di Twitch.' }
        ] }
    ]
  },

  {
    id: 'sondaggio',
    titolo: 'Il sondaggio',
    descrizione: 'Le scritte del riquadro del sondaggio. Domanda, risposte e durata non stanno qui: si creano dal menu, alla voce «Sondaggi», e vanno online subito, senza pubblicare.',
    campi: [
      { chiave: 'sondaggio.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40, predefinito: 'Sondaggio' },
      { chiave: 'sondaggio.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60, predefinito: 'Dì la tua',
        aiuto: 'Sta sopra alla domanda, che invece cambia a ogni sondaggio.' },
      { chiave: 'sondaggio.nota', etichetta: 'Riga sotto alle risposte', tipo: 'testo', max: 120, predefinito: 'Si vota una volta sola, con il proprio account Twitch.' },
      { chiave: 'sondaggio.scadeTra', etichetta: 'Prima del conto alla rovescia', tipo: 'testo', max: 30, predefinito: 'Chiude tra',
        aiuto: 'Per esempio «Chiude tra 2 h 15 min».' },
      { chiave: 'sondaggio.chiuso', etichetta: 'Quando il sondaggio è finito', tipo: 'testo', max: 60, predefinito: 'Sondaggio chiuso: ecco com\'è andata.' },
      { chiave: 'sondaggio.votato', etichetta: 'Dopo il voto', tipo: 'testo', max: 80, predefinito: 'Hai votato: ecco come sta andando.' },
      { chiave: 'sondaggio.voti', etichetta: 'Parola dopo il numero dei voti', tipo: 'testo', max: 20, predefinito: 'voti',
        aiuto: 'Per esempio «42 voti».' },
      { chiave: 'sondaggio.loginTitolo', etichetta: 'Avviso di login — titolo', tipo: 'testo', max: 60, predefinito: 'Per votare serve Twitch',
        aiuto: 'Si apre quando chi non è collegato clicca una risposta.' },
      { chiave: 'sondaggio.loginTesto', etichetta: 'Avviso di login — testo', tipo: 'testolungo', max: 240,
        predefinito: 'Possono votare solo gli utenti collegati al sito con il proprio account Twitch: così ogni persona vota una volta sola.' },
      { chiave: 'sondaggio.loginBtn', etichetta: 'Avviso di login — bottone', tipo: 'testo', max: 30, predefinito: 'Collegati con Twitch' },
      { chiave: 'sondaggio.loginChiudi', etichetta: 'Avviso di login — chiudi', tipo: 'testo', max: 30, predefinito: 'Non ora' }
    ]
  },

  {
    id: 'settimana',
    titolo: 'La settimana',
    descrizione: 'La schedule: i sette giorni con le loro locandine, gli eventi fuori programma e il fondale della sezione. Si imposta tutto qui, e la sezione si ricalcola da sola.',
    campi: [
      { chiave: 'settimana.occhiello', etichetta: 'Occhiello', tipo: 'testo', max: 40 },
      { chiave: 'settimana.titolo', etichetta: 'Titolo della sezione', tipo: 'testo', max: 60 },
      { chiave: 'settimana.testo', etichetta: 'Testo introduttivo', tipo: 'ricco', max: 240 },
      { chiave: 'settimana.nota', etichetta: 'Nota in fondo', tipo: 'ricco', max: 300 },

      { chiave: 'settimana.etichettaDiretta', etichetta: 'Etichetta dei giorni con diretta', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaRiposo', etichetta: 'Etichetta dei giorni di riposo', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaOggi', etichetta: 'Etichetta «oggi»', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaProssima', etichetta: 'Etichetta «prossima»', tipo: 'testo', max: 20 },
      { chiave: 'settimana.etichettaInOnda', etichetta: 'Etichetta «in onda» sul nastro', tipo: 'testo', max: 20,
        aiuto: 'Compare sul giorno di oggi mentre il canale è acceso.' },
      { chiave: 'settimana.etichettaDaTe', etichetta: 'Etichetta dell\'ora nel fuso di chi guarda', tipo: 'testo', max: 20,
        aiuto: 'Chi guarda da un altro fuso vede sotto l\'ora anche la sua, con questa parola davanti: «Da te 15:00».' },
      { chiave: 'settimana.titoloEventi', etichetta: 'Titolo degli eventi speciali', tipo: 'testo', max: 40,
        aiuto: 'Sta sopra le dirette fuori programma. Senza eventi in arrivo non si vede.' },
      { chiave: 'settimana.etichettaEvento', etichetta: 'Etichetta di un evento speciale', tipo: 'testo', max: 20,
        aiuto: 'Il bollino su ogni evento, e sul giorno della settimana in cui ne cade uno.' },
      { chiave: 'settimana.etichettaFino', etichetta: 'Etichetta «fino a»', tipo: 'testo', max: 20, facoltativo: true, predefinito: 'Al massimo fino a',
        aiuto: 'Sta sopra la data limite di un evento speciale, quando la compili.' },
      { chiave: 'settimana.etichettaSaltata', etichetta: 'Etichetta di una diretta saltata', tipo: 'testo', max: 20, facoltativo: true, predefinito: 'Niente live',
        aiuto: 'Sta sopra il motivo, sul giorno che hai segnato come saltato.' },
      { chiave: 'settimana.cta', etichetta: 'Bottone in fondo alla sezione', tipo: 'testo', max: 30 },
      { chiave: 'config.orari', etichetta: 'Schedule della settimana', tipo: 'orari',
        aiuto: 'Giorni, ore, schede con immagine di sfondo, eventi speciali e fondale della sezione. Da qui nascono anche il conto alla rovescia della copertina e gli orari scritti nella pagina.' }
    ]
  },

  {
    id: 'chi',
    titolo: 'Chi sono',
    descrizione: 'La parte personale: il racconto, la citazione a fumetto, le note e i numeri del canale.',
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
      { chiave: 'chi.ritrattoAlt', etichetta: 'Descrizione del ritratto', tipo: 'testolungo', max: 160,
        aiuto: 'Finisce nell\'attributo alt dell\'immagine: solo testo, niente formattazione.' },

      { chiave: 'config.chi.frasi', etichetta: 'Frasi del pollo — quando si clicca il ritratto', tipo: 'elencoTesti',
        facoltativo: true, predefinito: [],
        aiuto: 'Cliccando il pollo del ritratto qui in «Chi sono» compare in un fumetto una di queste frasi, a caso, mai la stessa due volte di fila. Una riga per frase, lunghe quanto vuoi. EMOTE: scrivi il nome esatto come in chat (per esempio slayer156Love o Kappa), staccato da spazi: sul sito diventa l\'immagine dell\'emote. Valgono le emote del canale e quelle globali di Twitch, e compaiono dopo la Pubblica, quando il server le va a prendere. Le emoji normali (😂❤️) funzionano sempre. Lasciato vuoto, il ritratto resta una semplice immagine.' },
      { chiave: 'config.chi.gifOgni', etichetta: 'GIF «non hai di meglio da fare?» — ogni quanti clic', tipo: 'numero', min: 0, max: 100,
        facoltativo: true, predefinito: 5,
        aiuto: 'Ogni tot clic sul ritratto si apre a sorpresa una GIF dell\'elenco «insistenza» qui sotto. 0 = mai.' },
      { chiave: 'config.chi.gifRaffica', etichetta: 'GIF — quando si clicca troppo veloce', tipo: 'elenco', etichettaVoce: 'scritta',
        facoltativo: true, predefinito: GIF_RAFFICA,
        aiuto: 'Per ora NON vengono usate: chi clicca a raffica il ritratto (10 clic in 3 secondi) lo fa congelare e schizzare intorno i polletti, senza GIF. L\'elenco resta qui nel caso la si voglia rimettere.',
        campi: [
          { chiave: 'immagine', etichetta: 'GIF', tipo: 'immagine' },
          { chiave: 'scritta', etichetta: 'Scritta sulla GIF', tipo: 'testo', max: 80, facoltativo: true, predefinito: '',
            aiuto: 'Vuota: ne pesca una da «Scritte di riserva» qui sotto.' }
        ] },
      { chiave: 'config.chi.scritteRaffica', etichetta: 'Scritte di riserva — clic troppo veloci', tipo: 'elencoTesti',
        aiuto: 'Per ora non vengono usate, come le GIF qui sopra.',
        facoltativo: true, predefinito: ['VUOI ROMPERE IL MOUSE?', 'HAI ROTTO.', 'PIANO, IL TASTO SINISTRO HA UNA FAMIGLIA', 'CALMA, SONO UN POLLO, NON UN PUNCHING BALL'] },
      { chiave: 'config.chi.gifInsistenza', etichetta: 'GIF — ogni tot clic', tipo: 'elenco', etichettaVoce: 'scritta',
        facoltativo: true, predefinito: GIF_INSISTENZA,
        aiuto: 'Una di queste GIF si apre ogni tot clic (il numero qui sopra), con la sua scritta.',
        campi: [
          { chiave: 'immagine', etichetta: 'GIF', tipo: 'immagine' },
          { chiave: 'scritta', etichetta: 'Scritta sulla GIF', tipo: 'testo', max: 80, facoltativo: true, predefinito: '',
            aiuto: 'Vuota: ne pesca una da «Scritte di riserva» qui sotto.' }
        ] },
      { chiave: 'config.chi.scritteInsistenza', etichetta: 'Scritte di riserva — ogni tot clic', tipo: 'elencoTesti',
        facoltativo: true, predefinito: ['NON HAI DI MEGLIO DA FARE?', 'SEMPRE QUI SEI?', 'VAI A SEGUIRE LA LIVE, INVECE', 'IL POLLO TI STA GIUDICANDO'] },
      { chiave: 'config.chi.gifScroll', etichetta: 'GIF — quando si scorre su e giù come matti', tipo: 'elenco', etichettaVoce: 'scritta',
        facoltativo: true, predefinito: GIF_SCROLL,
        aiuto: 'Chi scorre la pagina su e giù di continuo (quattro cambi di direzione in due secondi e mezzo) si becca una di queste GIF. Al massimo una ogni 20 secondi.',
        campi: [
          { chiave: 'immagine', etichetta: 'GIF', tipo: 'immagine' },
          { chiave: 'scritta', etichetta: 'Scritta sulla GIF', tipo: 'testo', max: 80, facoltativo: true, predefinito: '',
            aiuto: 'Vuota: ne pesca una da «Scritte di riserva» qui sotto.' }
        ] },
      { chiave: 'config.chi.scritteScroll', etichetta: 'Scritte di riserva — scroll su e giù', tipo: 'elencoTesti',
        facoltativo: true, predefinito: ['TI GIRA LA TESTA?', 'HAI IL MAL DI MARE?', 'DECIDITI: SU O GIÙ?'] }
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

      { chiave: 'saluti.copiaBtn', etichetta: 'Bottone «copia l\'email»', tipo: 'testo', max: 30 },
      { chiave: 'saluti.copiaFatto', etichetta: 'Conferma dopo la copia', tipo: 'testo', max: 30 },
      { chiave: 'saluti.scriviBtn', etichetta: 'Bottone «scrivi una mail»', tipo: 'testo', max: 30 },
      { chiave: 'config.referral.attivo', etichetta: 'Mostra il riquadro del referral Amazon', tipo: 'interruttore', predefinito: false,
        aiuto: 'Sta sotto «Scrivimi», nella colonna di destra. Spento non compare, e il link non finisce in pagina.' },
      { chiave: 'config.referral.url', etichetta: 'Link referral Amazon', tipo: 'url', facoltativo: true, predefinito: '',
        aiuto: 'Il tuo link di affiliazione. Vuoto: il riquadro non compare, anche se l\'interruttore è acceso.' },
      { chiave: 'saluti.referralTitolo', etichetta: 'Referral — titolo', tipo: 'testo', max: 40, predefinito: 'Referral Amazon' },
      { chiave: 'saluti.referralTesto', etichetta: 'Referral — come funziona', tipo: 'ricco', max: 320,
        predefinito: 'Se entri su Amazon da questo link e compri qualcosa entro 24 ore, a te costa esattamente uguale ma ad Amazon risulta che sei passato di qui, e a me arriva una piccola percentuale. Non serve comprare quello che vedi: vale su tutto il sito.',
        aiuto: 'Spiega il patto a chi legge. Meglio dire chiaro che non costa niente in più: è la domanda che si fanno tutti.' },
      { chiave: 'saluti.referralBtn', etichetta: 'Referral — bottone', tipo: 'testo', max: 30, predefinito: 'Apri Amazon' },
      { chiave: 'saluti.referralNota', etichetta: 'Referral — dichiarazione obbligatoria', tipo: 'testo', max: 160,
        predefinito: 'In qualità di Affiliato Amazon, ricevo un guadagno dagli acquisti idonei.',
        aiuto: 'NON toglierla e non riscriverla a piacere: il programma Affiliazione Amazon obbliga a dichiarare il rapporto, e senza si rischia l\'esclusione. Questa è la formula italiana ufficiale.' },
      { chiave: 'saluti.chiusura', etichetta: 'Riga di chiusura', tipo: 'ricco', max: 200 },
      { chiave: 'saluti.goalEtichetta', etichetta: 'Parola prima del goal', tipo: 'testo', max: 20, predefinito: 'Goal',
        aiuto: 'Accanto ai numeri dei social: «Iscritti 3.670 / Goal 5.000».' },
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
            aiuto: 'Corrisponde al file modelli/icone/<nome>.svg.' },

          { chiave: 'contatore', etichetta: 'Numero accanto alla voce', tipo: 'scelta',
            opzioni: [
              { valore: 'nessuno', etichetta: 'Nessuno' },
              { valore: 'twitch', etichetta: 'Follower di Twitch (automatico)' },
              { valore: 'youtube', etichetta: 'Iscritti del canale YouTube nel link (automatico)' }
            ],
            predefinito: 'nessuno',
            predefinitoVoce: (voce) => (voce.icona === 'twitch' || voce.icona === 'youtube' ? voce.icona : 'nessuno'),
            aiuto: 'Il numero lo prende il server a ogni pubblicazione e ogni dieci minuti. Per YouTube serve la chiave API (docs/HOSTING.md).' },
          { chiave: 'contatoreEtichetta', etichetta: 'Parola prima del numero', tipo: 'testo', max: 20, facoltativo: true,
            predefinito: 'Iscritti',
            aiuto: 'Per esempio Iscritti o Follower.' },
          { chiave: 'goal', etichetta: 'Goal', tipo: 'numero', min: 0, max: 100000000, predefinito: 0,
            aiuto: '0 = niente goal. Si vede solo accanto a un numero automatico.' }
        ] }
    ]
  },

  {
    id: 'sponsor',
    titolo: 'Sponsor e collaborazioni',
    descrizione: 'La pagina «sponsor.html», pensata per i marchi che valutano una collaborazione: i numeri veri del canale, i formati possibili, chi collabora già (con logo, descrizione, link e codice sconto) e come scriverti. In home, sotto «Dove mi trovi», una striscia con i loghi. Una collaborazione finita sparisce dal sito da sola quando arriva la data che le hai messo, e resta qui pronta a tornare.',
    campi: [
      { chiave: 'config.sponsor.attivo', etichetta: 'Pubblica la pagina degli sponsor', tipo: 'interruttore', predefinito: false,
        aiuto: 'Acceso, «sponsor.html» va online a ogni Pubblica, anche quando non hai ancora nessuno sponsor: presenta il canale ai marchi. La striscia in home compare solo se c\'è almeno uno sponsor con il link scritto e dentro il suo periodo. Spento, la pagina viene tolta dal sito e la striscia sparisce.' },

      { chiave: 'sponsor.occhiello', etichetta: 'Home — occhiello', tipo: 'testo', max: 40, predefinito: 'Chi sostiene il canale' },
      { chiave: 'sponsor.titolo', etichetta: 'Home — titolo della striscia', tipo: 'testo', max: 60, predefinito: 'Sponsor e partner' },
      { chiave: 'sponsor.testo', etichetta: 'Home — riga di presentazione', tipo: 'ricco', max: 220, facoltativo: true,
        predefinito: 'Chi mi dà una mano a portare avanti le dirette. Ogni logo porta al loro sito.',
        aiuto: 'Una riga sotto al titolo, in home. Può restare vuota.' },
      { chiave: 'sponsor.vaiBtn', etichetta: 'Home — scritta del bottone', tipo: 'testo', max: 30, predefinito: 'Tutti gli sponsor',
        aiuto: 'Il bottone in fondo alla striscia, che porta alla pagina degli sponsor.' },
      { chiave: 'config.sponsor.invitoHome', etichetta: 'Home — invito anche senza sponsor', tipo: 'interruttore', predefinito: false,
        aiuto: 'Acceso, quando non c\'è nessuno sponsor attivo la home mostra al posto della striscia un invito con un bottone verso la pagina. Spento, senza sponsor in home non compare niente.' },
      { chiave: 'sponsor.invitoTitolo', etichetta: 'Home — titolo dell\'invito', tipo: 'testo', max: 60, predefinito: 'Collabora con il canale',
        aiuto: 'Si vede solo con l\'invito acceso e nessuno sponsor attivo.' },
      { chiave: 'sponsor.invitoTesto', etichetta: 'Home — riga dell\'invito', tipo: 'ricco', max: 220, facoltativo: true,
        predefinito: 'Hai un marchio che parla a chi gioca? Nella pagina dedicata trovi i numeri del canale e i modi per collaborare.' },
      { chiave: 'sponsor.invitoBtn', etichetta: 'Home — bottone dell\'invito', tipo: 'testo', max: 30, predefinito: 'Scopri come collaborare' },

      { chiave: 'sponsor.paginaTorna', etichetta: 'Pagina — link per tornare al sito', tipo: 'testo', max: 30, predefinito: 'Torna al sito',
        aiuto: 'La pagina degli sponsor non ha il menu del sito: questo è il modo di tornare indietro, in alto a sinistra.' },
      { chiave: 'sponsor.paginaOcchiello', etichetta: 'Pagina — occhiello', tipo: 'testo', max: 40, predefinito: 'Collaborazioni',
        aiuto: 'La parola piccola sopra il titolo della pagina.' },
      { chiave: 'sponsor.paginaTitolo', etichetta: 'Pagina — titolo', tipo: 'testo', max: 60, predefinito: 'Porta il tuo marchio in diretta',
        aiuto: 'Il titolo grande della pagina «sponsor.html», e anche quello che si legge nella scheda del browser.' },
      { chiave: 'sponsor.paginaTesto', etichetta: 'Pagina — presentazione', tipo: 'ricco', max: 320,
        predefinito: 'Un canale Twitch italiano di gaming, con dirette fisse ogni settimana e una chat che partecipa davvero. Qui trovi i numeri del canale, i modi in cui possiamo collaborare e chi lo fa già.',
        aiuto: 'Le righe sotto al titolo. È anche la descrizione che finisce su Google, ripulita dal grassetto.' },
      { chiave: 'config.sponsor.copertina', etichetta: 'Pagina — immagine di apertura', tipo: 'immagine', facoltativo: true, predefinito: '',
        aiuto: 'La foto grande accanto al titolo: meglio orizzontale, almeno 1200 pixel di larghezza. Vuota: usa il banner della copertina del sito.' },
      { chiave: 'sponsor.ctaContatto', etichetta: 'Pagina — bottone verso i contatti', tipo: 'testo', max: 36, predefinito: 'Proponi una collaborazione',
        aiuto: 'Il bottone principale in apertura: porta giù, ai contatti.' },
      { chiave: 'sponsor.ctaCanale', etichetta: 'Pagina — bottone verso il canale', tipo: 'testo', max: 30, predefinito: 'Guarda il canale',
        aiuto: 'Il secondo bottone in apertura: apre il canale Twitch in una scheda nuova.' },

      { chiave: 'config.sponsor.mostraNumeri', etichetta: 'Pagina — mostra i numeri del canale', tipo: 'interruttore', predefinito: true },
      { chiave: 'sponsor.numeriOcchiello', etichetta: 'Numeri — occhiello', tipo: 'testo', max: 40, predefinito: 'Il canale' },
      { chiave: 'sponsor.numeriTitolo', etichetta: 'Numeri — titolo', tipo: 'testo', max: 60, predefinito: 'I numeri del canale' },
      { chiave: 'sponsor.numeriTesto', etichetta: 'Numeri — presentazione', tipo: 'ricco', max: 240, facoltativo: true,
        predefinito: 'Dati presi dal canale, non stime: chi guarda è una community piccola ma presente, che torna diretta dopo diretta.' },
      { chiave: 'config.sponsor.numeri', etichetta: 'I numeri da mostrare', tipo: 'elenco', etichettaVoce: 'etichetta',
        predefinito: [
          { dato: 'follower', etichetta: 'Follower su Twitch', valore: '' },
          { dato: 'spettatori', etichetta: 'Spettatori medi', valore: '' },
          { dato: 'settimana', etichetta: 'Dirette a settimana', valore: '' },
          { dato: 'ore', etichetta: 'Ore di diretta', valore: '' },
          { dato: 'giochi', etichetta: 'Giochi portati in live', valore: '' },
          { dato: 'dal', etichetta: 'Su Twitch dal', valore: '' }
        ],
        aiuto: 'I valori li prende il sito da solo: i follower da Twitch, spettatori medi e anno dal gruppo «Il canale», le dirette a settimana dalla schedule, ore e giochi dallo storico delle live. Un numero che il sito non conosce (o che vale zero) non compare: niente cifre inventate.',
        campi: [
          { chiave: 'dato', etichetta: 'Numero', tipo: 'scelta', predefinito: 'follower',
            opzioni: [
              { valore: 'follower', etichetta: 'Follower di Twitch (automatico)' },
              { valore: 'spettatori', etichetta: 'Spettatori medi (dal gruppo «Il canale»)' },
              { valore: 'abbonati', etichetta: 'Abbonati (dal gruppo «Il canale»)' },
              { valore: 'settimana', etichetta: 'Dirette a settimana (dalla schedule)' },
              { valore: 'ore', etichetta: 'Ore di diretta (dallo storico delle live)' },
              { valore: 'giochi', etichetta: 'Giochi portati in live (dallo storico)' },
              { valore: 'clip', etichetta: 'Clip create dalla chat (dallo storico)' },
              { valore: 'dal', etichetta: 'Anno di arrivo su Twitch (dal gruppo «Il canale»)' },
              { valore: 'lingua', etichetta: 'Lingue delle dirette (dal gruppo «Il canale»)' },
              { valore: 'mano', etichetta: 'Scritto a mano' }
            ] },
          { chiave: 'etichetta', etichetta: 'Cosa c\'è scritto sotto', tipo: 'testo', max: 40, predefinito: 'Follower su Twitch' },
          { chiave: 'valore', etichetta: 'Valore scritto a mano', tipo: 'testo', max: 16, facoltativo: true, predefinito: '',
            aiuto: 'Serve solo con «Scritto a mano»: per esempio «18-34» o «70%». Scrivi solo cose vere e verificabili.' }
        ] },
      { chiave: 'sponsor.numeriNota', etichetta: 'Numeri — nota sotto le cifre', tipo: 'ricco', max: 200, facoltativo: true,
        predefinito: 'I follower arrivano direttamente da Twitch; ore e giochi dallo storico delle dirette.' },
      { chiave: 'sponsor.numeriData', etichetta: 'Numeri — parola prima della data', tipo: 'testo', max: 30, predefinito: 'Aggiornati al',
        aiuto: 'Accanto alla nota: «Aggiornati al 27 settembre 2026». La data è quella dell\'ultima pubblicazione.' },

      { chiave: 'config.sponsor.mostraFormati', etichetta: 'Pagina — mostra i formati di collaborazione', tipo: 'interruttore', predefinito: true },
      { chiave: 'sponsor.formatiOcchiello', etichetta: 'Formati — occhiello', tipo: 'testo', max: 40, predefinito: 'Collaborare' },
      { chiave: 'sponsor.formatiTitolo', etichetta: 'Formati — titolo', tipo: 'testo', max: 60, predefinito: 'Come possiamo lavorare insieme' },
      { chiave: 'sponsor.formatiTesto', etichetta: 'Formati — presentazione', tipo: 'ricco', max: 240, facoltativo: true,
        predefinito: 'Ogni collaborazione si costruisce insieme: questi sono i formati più richiesti, da combinare come serve al tuo marchio.' },
      { chiave: 'config.sponsor.formati', etichetta: 'I formati', tipo: 'elenco', etichettaVoce: 'titolo',
        predefinito: [
          { titolo: 'Menzione in diretta', testo: 'Il tuo marchio presentato a voce durante le live, con il link fisso in chat e nel pannello del canale.', icona: 'microfono' },
          { titolo: 'Prodotto in prova', testo: 'Periferiche, giochi o accessori usati davvero in diretta, con un parere sincero davanti alla chat.', icona: 'controller' },
          { titolo: 'Codice sconto dedicato', testo: 'Un codice riservato alla community: fa risparmiare chi guarda e ti dice con precisione quanto rende la collaborazione.', icona: 'etichetta' },
          { titolo: 'Logo sul canale e sul sito', testo: 'Il logo nel pannello di Twitch, nella striscia della home e in questa pagina, con il link al tuo sito.', icona: 'schermo' }
        ],
        aiuto: 'Le schede della sezione «Come possiamo lavorare insieme», nell\'ordine in cui stanno qui.',
        campi: [
          { chiave: 'titolo', etichetta: 'Titolo', tipo: 'testo', max: 50, predefinito: 'Nuovo formato' },
          { chiave: 'testo', etichetta: 'Spiegazione', tipo: 'ricco', max: 240, facoltativo: true, predefinito: '' },
          { chiave: 'icona', etichetta: 'Icona', tipo: 'scelta', opzioni: ICONE_FORMATI, predefinito: 'star' }
        ] },

      { chiave: 'config.sponsor.mostraPartner', etichetta: 'Pagina — mostra gli sponsor attuali', tipo: 'interruttore', predefinito: true,
        aiuto: 'Spento, la pagina presenta solo il canale e i contatti: utile se preferisci non mostrare chi collabora già.' },
      { chiave: 'sponsor.partnerOcchiello', etichetta: 'Sponsor attuali — occhiello', tipo: 'testo', max: 40, predefinito: 'Chi c\'è già' },
      { chiave: 'sponsor.partnerTitolo', etichetta: 'Sponsor attuali — titolo', tipo: 'testo', max: 60, predefinito: 'Sponsor e partner' },
      { chiave: 'sponsor.partnerTesto', etichetta: 'Sponsor attuali — presentazione', tipo: 'ricco', max: 240, facoltativo: true,
        predefinito: 'I marchi che sostengono il canale oggi. Ogni scheda porta al loro sito; dove c\'è un codice, è riservato a chi segue le dirette.' },
      { chiave: 'sponsor.partnerVuotoTitolo', etichetta: 'Sponsor attuali — titolo quando non c\'è nessuno', tipo: 'testo', max: 60, predefinito: 'Il primo posto è libero' },
      { chiave: 'sponsor.partnerVuotoTesto', etichetta: 'Sponsor attuali — riga quando non c\'è nessuno', tipo: 'ricco', max: 220, facoltativo: true,
        predefinito: 'In questo momento nessun marchio affianca il canale: il primo può essere il tuo.' },
      { chiave: 'sponsor.paginaVuota', etichetta: 'Sponsor attuali — quando scadono tutti con la pagina online', tipo: 'testo', max: 120,
        predefinito: 'Nessuno sponsor attivo in questo momento.',
        aiuto: 'Si vede solo se l\'ultima collaborazione scade mentre la pagina è già online: lo dice, invece di lasciare un buco.' },
      { chiave: 'sponsor.visita', etichetta: 'Cosa fa il link, per chi non lo vede', tipo: 'testo', max: 40, predefinito: 'Vai al sito di',
        aiuto: 'Lo leggono i lettori di schermo, seguito dal nome dello sponsor: scrivi l\'azione, non «clicca qui».' },
      { chiave: 'sponsor.vaiScheda', etichetta: 'Scritta del bottone sulla scheda', tipo: 'testo', max: 24, predefinito: 'Vai al sito',
        aiuto: 'Il bottone in fondo a ogni scheda. Accanto, più piccolo, compare l\'indirizzo vero.' },
      { chiave: 'sponsor.evidenzaTag', etichetta: 'Etichetta di chi è in evidenza', tipo: 'testo', max: 20, predefinito: 'In evidenza',
        aiuto: 'La scritta sulla scheda di chi è segnato «in evidenza».' },
      { chiave: 'sponsor.nuovoTag', etichetta: 'Etichetta di chi è appena arrivato', tipo: 'testo', max: 20, predefinito: 'Nuovo partner',
        aiuto: 'Compare da sola sulla scheda di chi ha la data di inizio negli ultimi trenta giorni, e sparisce da sola quando i trenta giorni passano.' },
      { chiave: 'sponsor.dalEtichetta', etichetta: 'Parola prima dell\'anno di inizio', tipo: 'testo', max: 20, predefinito: 'Partner dal',
        aiuto: 'Sulla scheda, sotto il nome: «Partner dal 2026». Si vede solo per chi ha la data di inizio scritta.' },
      { chiave: 'sponsor.codiceEtichetta', etichetta: 'Parola sopra il codice sconto', tipo: 'testo', max: 30, predefinito: 'Codice sconto' },
      { chiave: 'sponsor.copia', etichetta: 'Bottone che copia', tipo: 'testo', max: 20, predefinito: 'Copia',
        aiuto: 'Accanto al codice sconto e all\'indirizzo email: lo copia con un tocco.' },
      { chiave: 'sponsor.copiato', etichetta: 'Conferma della copia', tipo: 'testo', max: 20, predefinito: 'Copiato' },

      { chiave: 'config.sponsor.voci', etichetta: 'Gli sponsor', tipo: 'elenco', etichettaVoce: 'nome', predefinito: [],
        aiuto: 'Compaiono nell\'ordine in cui stanno qui, con quelli «in evidenza» davanti agli altri. Uno sponsor senza link non si vede sul sito.',
        campi: [
          { chiave: 'chiave', etichetta: 'Nome interno', tipo: 'testo', max: 30, predefinito: 'sponsor',
            aiuto: 'Non si vede sul sito: serve a distinguere le voci fra loro, e deve essere diverso da quello delle altre.' },
          { chiave: 'nome', etichetta: 'Nome', tipo: 'testo', max: 40, predefinito: 'Nuovo sponsor' },
          { chiave: 'logo', etichetta: 'Logo', tipo: 'immagine', facoltativo: true, predefinito: '',
            aiuto: 'Caricalo dalla libreria delle immagini. Meglio un PNG, un WebP o un SVG con lo sfondo trasparente: sulla scheda sta su un fondo chiaro. Senza logo si vede il nome scritto.' },
          { chiave: 'testo', etichetta: 'Chi sono, in breve', tipo: 'ricco', max: 320, facoltativo: true, predefinito: '',
            aiuto: 'Si legge nella pagina «sponsor.html». In home la striscia mostra solo il logo e il nome.' },
          { chiave: 'categoria', etichetta: 'Categoria', tipo: 'testo', max: 24, facoltativo: true, predefinito: '',
            aiuto: 'Per esempio Hardware, Energy drink, Abbigliamento: compare come etichetta sulla scheda.' },
          { chiave: 'codice', etichetta: 'Codice sconto', tipo: 'testo', max: 30, facoltativo: true, predefinito: '',
            aiuto: 'Vuoto = niente codice. Sulla scheda compare con il bottone per copiarlo.' },
          { chiave: 'codiceNota', etichetta: 'Cosa dà il codice', tipo: 'testo', max: 80, facoltativo: true, predefinito: '',
            aiuto: 'Per esempio «10% su tutto il negozio». Si vede sotto il codice.' },
          { chiave: 'colore', etichetta: 'Colore del marchio', tipo: 'colore', facoltativo: true, predefinito: '',
            aiuto: 'Tinge il bordo e l\'alone della sua scheda. Prendilo dal logo dello sponsor. Vuoto: usa il viola del sito.' },
          { chiave: 'url', etichetta: 'Link al loro sito', tipo: 'url', facoltativo: true, predefinito: '',
            aiuto: 'Vuoto = lo sponsor non compare sul sito. Vale solo un indirizzo http o https; il link esce con rel="sponsored", come Google chiede per le collaborazioni pagate.' },
          { chiave: 'da', etichetta: 'Attivo dal', tipo: 'dataora', facoltativo: true, predefinito: '',
            aiuto: 'Vuoto = da subito. Prima di questa data lo sponsor non si vede: puoi preparare la scheda in anticipo e pubblicarla senza pensieri.' },
          { chiave: 'a', etichetta: 'Attivo fino al', tipo: 'dataora', facoltativo: true, predefinito: '',
            aiuto: 'Vuoto = senza scadenza. Passata questa data lo sponsor sparisce dal sito da solo, anche senza una pubblicazione nuova: la voce resta qui, e per farlo tornare basta cambiare la data.' },
          { chiave: 'evidenza', etichetta: 'In evidenza', tipo: 'interruttore', predefinito: false,
            aiuto: 'Passa davanti agli altri, nella striscia e nella pagina, con la scheda più grande e la sua etichetta.' }
        ] },

      { chiave: 'sponsor.contattoOcchiello', etichetta: 'Contatti — occhiello', tipo: 'testo', max: 40, predefinito: 'Contatti' },
      { chiave: 'sponsor.contattoTitolo', etichetta: 'Contatti — titolo', tipo: 'testo', max: 60, predefinito: 'Parliamone' },
      { chiave: 'sponsor.contattoTesto', etichetta: 'Contatti — presentazione', tipo: 'ricco', max: 320, facoltativo: true,
        predefinito: 'Scrivimi due righe su chi sei, cosa proponi e in che periodo: rispondo di persona a ogni proposta seria.' },
      { chiave: 'config.sponsor.email', etichetta: 'Contatti — indirizzo email', tipo: 'email', facoltativo: true, predefinito: '',
        aiuto: 'Vuoto: usa l\'indirizzo email pubblico del sito (gruppo «Il canale»).' },
      { chiave: 'sponsor.contattoOggetto', etichetta: 'Contatti — oggetto della email', tipo: 'testo', max: 60, predefinito: 'Proposta di collaborazione',
        aiuto: 'Il bottone apre il programma di posta con questo oggetto già scritto.' },
      { chiave: 'sponsor.contattoBtn', etichetta: 'Contatti — bottone', tipo: 'testo', max: 30, predefinito: 'Scrivimi una email' },
      { chiave: 'config.sponsor.mediaKit', etichetta: 'Contatti — link al media kit', tipo: 'url', facoltativo: true, predefinito: '',
        aiuto: 'Facoltativo: l\'indirizzo di un PDF o di una pagina con il media kit. Vuoto, il bottone non compare.' },
      { chiave: 'sponsor.mediaKitBtn', etichetta: 'Contatti — bottone del media kit', tipo: 'testo', max: 30, predefinito: 'Scarica il media kit' },
      { chiave: 'config.sponsor.polletto', etichetta: 'Contatti — il polletto accanto', tipo: 'interruttore', predefinito: true,
        aiuto: 'La mascotte del canale accanto ai contatti. È la stessa immagine della mascotte del sito.' }
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
    id: 'musica',
    titolo: 'Musica di sottofondo',
    descrizione: 'Un lettore piccolo in basso a destra, con le tracce che carichi tu nella cartella del sito. Parte sempre in pausa: la musica la sceglie chi visita, non la pagina.',
    campi: [
      { chiave: 'config.musica.attivo', etichetta: 'Mostra il lettore', tipo: 'interruttore', predefinito: false,
        aiuto: 'Spento, il lettore non compare e la pagina non scarica nessuna traccia.' },
      { chiave: 'config.musica.aperto', etichetta: 'Aperto alla prima visita', tipo: 'interruttore', predefinito: false,
        aiuto: 'Spento, chi arriva vede solo il bottone tondo e apre il lettore se gli va; acceso, lo trova già aperto. Poi vale la scelta di ognuno, che il sito si ricorda.' },
      { chiave: 'config.musica.casuale', etichetta: 'Ordine casuale alla prima visita', tipo: 'interruttore', predefinito: false,
        aiuto: 'Acceso, chi arriva trova già attivo il mescolamento. Poi vale la scelta di ognuno, che il sito si ricorda.' },
      { chiave: 'config.musica.cartella', etichetta: 'Cartella dei file', tipo: 'testo', max: 40, predefinito: 'mp3',
        aiuto: 'La cartella del sito dove hai caricato gli mp3, senza barre: «mp3». I file si caricano da Plesk, non da qui.' },
      { chiave: 'config.musica.icona', etichetta: 'Icona del bottone tondo', tipo: 'immagine', facoltativo: true, predefinito: '',
        aiuto: 'Il bottone in basso a destra che riapre il lettore quando è ridotto. Vuoto: ci sta il disegno delle note. Con un\'immagine: la tua, ritagliata tonda. Meglio quadrata e non troppo piccola (da 96 px in su), PNG o WebP con lo sfondo trasparente.' },
      { chiave: 'musica.titolo', etichetta: 'Scritta sopra il lettore', tipo: 'testo', max: 40, predefinito: 'In sottofondo',
        aiuto: 'Una parola o due, per esempio «In sottofondo» o «La playlist del canale».' },
      { chiave: 'musica.play', etichetta: 'Bottone play', tipo: 'testo', max: 40, predefinito: 'Fai partire la musica',
        aiuto: 'Lo leggono i lettori di schermo e compare passandoci sopra col mouse.' },
      { chiave: 'musica.pausa', etichetta: 'Bottone pausa', tipo: 'testo', max: 40, predefinito: 'Metti in pausa' },
      { chiave: 'musica.precedente', etichetta: 'Bottone traccia precedente', tipo: 'testo', max: 40, predefinito: 'Traccia precedente' },
      { chiave: 'musica.successiva', etichetta: 'Bottone traccia successiva', tipo: 'testo', max: 40, predefinito: 'Traccia successiva' },
      { chiave: 'musica.casuale', etichetta: 'Bottone per accendere l\u0027ordine casuale', tipo: 'testo', max: 40, predefinito: 'Mescola le tracce' },
      { chiave: 'musica.ordine', etichetta: 'Bottone per tornare all\u0027ordine della lista', tipo: 'testo', max: 40, predefinito: 'Rimetti in ordine',
        aiuto: 'Lo stesso bottone di sopra, quando il mescolamento è già acceso.' },
      { chiave: 'musica.avanzamento', etichetta: 'Barra di avanzamento', tipo: 'testo', max: 40, predefinito: 'Punto della traccia' },
      { chiave: 'musica.volume', etichetta: 'Cursore del volume', tipo: 'testo', max: 40, predefinito: 'Volume' },
      { chiave: 'musica.muto', etichetta: 'Bottone per togliere l\'audio', tipo: 'testo', max: 40, predefinito: 'Togli l\'audio' },
      { chiave: 'musica.suono', etichetta: 'Bottone per rimettere l\'audio', tipo: 'testo', max: 40, predefinito: 'Rimetti l\'audio' },
      { chiave: 'musica.elenco', etichetta: 'Bottone che apre la lista delle tracce', tipo: 'testo', max: 40, predefinito: 'Scegli la traccia',
        aiuto: 'Si apre cliccando il titolo della traccia nel lettore.' },
      { chiave: 'musica.riduci', etichetta: 'Bottone per ridurre il lettore', tipo: 'testo', max: 40, predefinito: 'Riduci il lettore' },
      { chiave: 'musica.apri', etichetta: 'Bottone per riaprire il lettore', tipo: 'testo', max: 40, predefinito: 'Apri il lettore',
        aiuto: 'Il bottone tondo che resta quando il lettore e ridotto.' },
      { chiave: 'musica.errore', etichetta: 'Avviso se una traccia non si carica', tipo: 'testo', max: 80, predefinito: 'Questa traccia non si carica.',
        aiuto: 'Compare sotto i comandi. Quasi sempre vuol dire che il nome del file qui sotto non corrisponde a quello caricato su Plesk.' },
      { chiave: 'musica.bloccato', etichetta: 'Avviso se il browser rifiuta di suonare', tipo: 'testo', max: 80, predefinito: 'Premi di nuovo play.',
        aiuto: 'I browser non fanno partire l\'audio senza un clic: capita se la musica prova a ripartire da sola.' },
      { chiave: 'config.tracce', etichetta: 'Le tracce', tipo: 'elenco', etichettaVoce: 'titolo', predefinito: [],
        aiuto: 'Suonano nell\'ordine in cui stanno qui. La durata la legge il lettore dal file, non va scritta.',
        campi: [
          { chiave: 'titolo', etichetta: 'Titolo', tipo: 'testo', max: 60 },
          { chiave: 'artista', etichetta: 'Artista', tipo: 'testo', max: 60 },
          { chiave: 'file', etichetta: 'Nome del file', tipo: 'testo', max: 120,
            aiuto: 'Esattamente come si chiama nella cartella, estensione compresa: «keygen-funk.mp3».' },
          { chiave: 'cover', etichetta: 'Copertina', tipo: 'immagine', facoltativo: true, predefinito: '',
            aiuto: 'Quadrata, almeno 200x200. Si carica da «Immagini» come tutte le altre. Dal suo colore il lettore tinge anche il proprio sfondo. Vuota: resta il vinile.' },
          { chiave: 'link', etichetta: 'Link alla traccia', tipo: 'url', facoltativo: true,
            aiuto: 'La pagina dell\'artista o della traccia, per dare credito. Vuoto = nessun link.' }
        ] }
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
        aiuto: 'I domini da cui si apre il sito: servono a Twitch per lasciar partire il player. Qui vanno solo i domini in più: l\'indirizzo pubblico qui sotto (con e senza www), localhost e 127.0.0.1 li aggiunge da sé la pubblicazione.' },
      { chiave: 'config.sitoUrl', etichetta: 'Indirizzo pubblico del sito', tipo: 'url', facoltativo: true,
        aiuto: 'L\'indirizzo con cui la gente apre il sito: https://slayerbeard.com. Da qui escono il link canonico, le anteprime social e la sitemap. Lasciandolo vuoto, i link di anteprima restano relativi.' },
      { chiave: 'config.email', etichetta: 'Indirizzo email pubblico', tipo: 'email' },
      { chiave: 'config.ultimaDiretta', etichetta: 'Ultima diretta', tipo: 'testo', max: 130,
        aiuto: 'Titolo dell\'ultima serata: compare nel quadro comandi. Lo riempie da sé la pubblicazione, chiedendolo a Twitch, se hai impostato il client secret con «node server/imposta-twitch.js»; senza quello resta il valore che scrivi qui.' },
      { chiave: 'config.dati.follower', etichetta: 'Follower', tipo: 'numero', min: 0, max: 100000000,
        aiuto: 'È il primo numero della copertina e di «Chi sono». Lo aggiorna da sé la pubblicazione, chiedendolo a Twitch, se hai impostato il client secret con «node server/imposta-twitch.js»; senza quello resta il valore che scrivi qui.' },
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
  },

  {
    id: 'manutenzione',
    titolo: 'Modalità manutenzione',
    descrizione: 'Mette il sito in pausa: al posto delle pagine chi lo apre vede la pagina di manutenzione, con il link a Twitch e ai social. In fondo al gruppo ci sono le frasi e le canzoni di Pollo Run: valgono sia per la pagina di manutenzione sia per il gioco che si apre scrivendo «pollorun» sul sito, anche a manutenzione spenta.',
    campi: [
      { chiave: 'config.manutenzione.attiva', etichetta: 'Sito in manutenzione', tipo: 'interruttore', predefinito: false,
        aiuto: 'Acceso, salva e premi Pubblica: da quel momento tutti i visitatori vedono la pagina di manutenzione, sulla home e su clip.html, e si fermano player di Twitch, modalità lurk con i suoi messaggi in chat, pollo, musica e sondaggi. Spento, salva e premi Pubblica: torna il sito normale. L\'anteprima qui nel pannello mostra sempre il sito vero, così puoi continuare a lavorarci.' },
      { chiave: 'config.manutenzione.fine', etichetta: 'Si riparte il', tipo: 'dataora', facoltativo: true, predefinito: '',
        aiuto: 'Giorno e ora italiana in cui pensi di riaprire: la pagina mostra il conto alla rovescia e, arrivata l\'ora, si ricarica da sola ogni 30 secondi finché non ripubblichi il sito normale. Vuoto: niente conto alla rovescia.' },
      { chiave: 'manutenzione.stato', etichetta: 'Scritta nella pillola in alto', tipo: 'testo', max: 40,
        predefinito: 'Fuori onda · Manutenzione' },
      { chiave: 'manutenzione.occhiello', etichetta: 'Occhiello sopra al nome', tipo: 'testo', max: 60,
        predefinito: 'Stiamo sistemando la regia' },
      { chiave: 'manutenzione.messaggio', etichetta: 'Messaggio ai visitatori', tipo: 'ricco', max: 300,
        predefinito: 'Il sito è in manutenzione e <strong>torna presto</strong>, più bello di prima. Nel frattempo la diretta non si ferma: ci vediamo su Twitch.',
        aiuto: 'Il paragrafo sotto al conto alla rovescia. Puoi usare grassetto e corsivo.' },
      { chiave: 'manutenzione.contoPrima', etichetta: 'Inizio della scritta del conto alla rovescia', tipo: 'testo', max: 30,
        predefinito: 'Si riparte',
        aiuto: 'La pagina ci aggiunge da sé giorno e ora: «Si riparte alle 13:30 · mancano», oppure «Si riparte il 24/09 alle 13:30 · mancano» se non è oggi.' },
      { chiave: 'manutenzione.contoFinito', etichetta: 'Scritta a conto alla rovescia finito', tipo: 'testo', max: 80,
        predefinito: 'Ci siamo: riaccendiamo la regia…',
        aiuto: 'Compare quando il conto arriva a zero, mentre la pagina aspetta che il sito venga ripubblicato.' },
      { chiave: 'manutenzione.bottone', etichetta: 'Bottone per Twitch', tipo: 'testo', max: 30,
        predefinito: 'Guarda su Twitch' },
      { chiave: 'config.manutenzione.nastro', etichetta: 'Frasi del nastro che scorre in basso', tipo: 'elencoTesti',
        predefinito: ['Lavori in corso', 'La regia si sta rifacendo il look', 'Torniamo presto', 'Intanto: twitch.tv/slayer_beard', 'Il pollo sorveglia il cantiere'],
        aiuto: 'Scorrono una dopo l\'altra, separate da un puntino.' },
      { chiave: 'config.manutenzione.scherno', etichetta: 'Pollo Run — frasi di scherno', tipo: 'elencoTesti', facoltativo: true,
        predefinito: ['Bravo, hai ottenuto il coglione d\'oro', 'Ti senti forte?', 'Ti stai divertendo?', 'Samminca',
          'Il pollo corre meglio di te', 'Ancora vivo? Strano.', 'Ok, adesso si fa sul serio', 'Non hai niente di meglio da fare?'],
        aiuto: 'Quando finisci un livello del gioco compare una di queste frasi, a caso e senza ripetersi finché non sono finite. Tienile corte (massimo 80 caratteri). Valgono sia nella pagina di manutenzione sia nel gioco che si apre scrivendo «pollorun» sul sito. Vuoto: le frasi predefinite.' },
      { chiave: 'config.pollorun.canzoni', etichetta: 'Pollo Run — le canzoni del gioco', tipo: 'elenco', etichettaVoce: 'titolo',
        predefinito: [
          { titolo: 'Stereo Madness', file: 'ForeverBound - Stereo Madness.mp3', autore: 'ForeverBound' },
          { titolo: 'Back On Track', file: 'DJVI - Back On Track.mp3', autore: 'DJVI' },
          { titolo: 'Polargeist', file: 'Step - Polargeist.mp3', autore: 'Step' },
          { titolo: 'Dry Out', file: 'DJVI - Dry Out.mp3', autore: 'DJVI' },
          { titolo: 'Base After Base', file: 'DJVI - Base After Base.mp3', autore: 'DJVI' },
          { titolo: 'Can\'t Let Go', file: 'DJVI - Can\'t Let Go.mp3', autore: 'DJVI' },
          { titolo: 'Jumper', file: 'Waterflame - Jumper.mp3', autore: 'Waterflame' },
          { titolo: 'Time Machine', file: 'Waterflame - Time Machine.mp3', autore: 'Waterflame' },
          { titolo: 'Cycles', file: 'DJVI - Cycles.mp3', autore: 'DJVI' },
          { titolo: 'xStep', file: 'DJVI - xStep.mp3', autore: 'DJVI' },
          { titolo: 'Clutterfunk', file: 'Waterflame - Clutterfunk.mp3', autore: 'Waterflame' },
          { titolo: 'Theory of Everything', file: 'DJVI - Theory of Everything.mp3', autore: 'DJVI' }
        ],
        aiuto: 'Le canzoni che possono suonare durante Pollo Run, sia nella pagina di manutenzione sia nel gioco che si apre scrivendo «pollorun» sul sito. Per aggiungerne una: carica il file da Plesk nella cartella «mp3» del sito, scrivi qui lo stesso identico nome del file, poi Salva e Pubblica. Le voci il cui file non c\'è nella cartella «mp3» al momento della Pubblica vengono ignorate; se non ne resta nessuna, o se la pagina non è ancora stata ripubblicata, suona «DJVI - Back On Track.mp3». L\'ordine dell\'elenco è l\'ordine dei livelli.',
        campi: [
          { chiave: 'titolo', etichetta: 'Titolo', tipo: 'testo', max: 60, predefinito: 'Titolo della canzone',
            aiuto: 'Compare sullo schermo del gioco mentre la canzone suona.' },
          { chiave: 'file', etichetta: 'Nome del file', tipo: 'testo', max: 100, forma: 'fileAudio', predefinito: '',
            aiuto: 'Solo il nome del file dentro la cartella «mp3», scritto esattamente com\'è (maiuscole, spazi e apostrofi compresi), per esempio «DJVI - Back On Track.mp3». Niente cartelle. Formati: .mp3, .ogg, .wav, .m4a.' },
          { chiave: 'autore', etichetta: 'Autore', tipo: 'testo', max: 60, facoltativo: true, predefinito: '',
            aiuto: 'Facoltativo: compare accanto al titolo.' }
        ] },
      { chiave: 'config.pollorun.modo', etichetta: 'Pollo Run — quale canzone suona', tipo: 'scelta', predefinito: 'ordine',
        opzioni: [
          { valore: 'fissa', etichetta: 'Sempre la stessa canzone' },
          { valore: 'ordine', etichetta: 'Una diversa a ogni livello, nell\'ordine dell\'elenco' },
          { valore: 'caso', etichetta: 'Una a caso a ogni livello' }
        ],
        aiuto: 'Vale sia nella pagina di manutenzione sia nel gioco che si apre scrivendo «pollorun» sul sito. «Nell\'ordine dell\'elenco»: il livello 1 suona la prima canzone disponibile, il 2 la seconda, e finite si ricomincia. «A caso»: a ogni livello una canzone diversa da quella di prima. Dopo una morte, quando si riprova il livello con SPAZIO, riparte la stessa canzone dall\'inizio. I livelli durano da circa un minuto (livello 1) fino a due minuti e mezzo.' },
      { chiave: 'config.pollorun.canzoneFissa', etichetta: 'Pollo Run — numero della canzone «sempre la stessa»', tipo: 'numero', min: 1, max: 50, predefinito: 2,
        aiuto: 'Conta solo con «Sempre la stessa canzone», nella pagina di manutenzione e nel gioco che si apre scrivendo «pollorun» sul sito. È la posizione nell\'elenco qui sopra: 1 = la prima, 2 = la seconda (di serie «Back On Track»). Se quella canzone non ha il file nella cartella «mp3», suona la prima disponibile.' },
      { chiave: 'config.pollorun.stile', etichetta: 'Pollo Run — stile grafico', tipo: 'scelta', predefinito: 'synthwave',
        opzioni: [
          { valore: 'synthwave', etichetta: 'Synthwave: sole, montagne e griglia al neon' },
          { valore: 'geometrydash', etichetta: 'Geometry Dash: cubo, sfondo colorato, blocchi neri' }
        ],
        aiuto: 'Vale sia nella pagina di manutenzione sia nel gioco che si apre scrivendo «pollorun» sul sito. «Synthwave» (di serie): sole a righe, montagne al neon, pavimento a griglia in prospettiva e il pollo com\'è. «Geometry Dash»: il pollo dentro un cubo, uno sfondo a colori che cambia a ogni livello, blocchi e punte neri col bordo bianco e seghe al posto dei rombi. I livelli, la difficoltà e le canzoni sono gli stessi. Ricordati Salva e Pubblica.' }
    ]
  },

  {
    id: 'meteora',
    titolo: 'Meteora col polletto',
    descrizione: 'Il polletto che attraversa la home come una stella cadente: chi lo prende al volo lo fa esplodere in una pioggia di icone. La lanci tu con «Lancia meteora», oppure parte da sola se accendi il timer.',
    campi: [
      { chiave: 'config.meteora.timer', etichetta: 'Timer automatico', tipo: 'interruttore', facoltativo: true, predefinito: false,
        aiuto: 'Spento (consigliato per la sorpresa): la meteora parte solo quando premi «Lancia meteora». Acceso, salva e premi Pubblica: ogni visitatore della home la vede passare da sola, a caso, fra i minuti scritti qui sotto.' },
      { chiave: 'config.meteora.ogniMin', etichetta: 'Timer — al più presto dopo (minuti)', tipo: 'numero', min: 1, max: 120, facoltativo: true, predefinito: 3,
        aiuto: 'Conta solo con il timer acceso. Il tempo parte da quando il visitatore apre la pagina, e riparte dopo ogni passaggio.' },
      { chiave: 'config.meteora.ogniMax', etichetta: 'Timer — al più tardi dopo (minuti)', tipo: 'numero', min: 1, max: 120, facoltativo: true, predefinito: 8,
        aiuto: 'Fra questo numero e quello sopra il sito sceglie un momento a caso, diverso per ogni visitatore.' }
    ]
  }
];

function campi() {
  const fuori = [];
  for (const gruppo of gruppi) {
    for (const campo of gruppo.campi) { fuori.push(Object.assign({ gruppo: gruppo.id }, campo)); }
  }
  return fuori;
}

function campo(chiave) {
  for (const c of campi()) { if (c.chiave === chiave) { return c; } }
  return null;
}

function haChiave(oggetto, nome) {
  return oggetto !== null && typeof oggetto === 'object' && Object.prototype.hasOwnProperty.call(oggetto, nome);
}

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

function chiaviDeiContenuti(contenuti) {
  const fuori = [];
  for (const chiave of Object.keys((contenuti && contenuti.testi) || {})) { fuori.push(chiave); }

  (function scendi(nodo, prefisso) {
    for (const nome of Object.keys(nodo || {})) {
      const valore = nodo[nome];
      const percorso = prefisso + '.' + nome;

      if (valore !== null && typeof valore === 'object' && !Array.isArray(valore)) { scendi(valore, percorso); }
      else { fuori.push(percorso); }
    }
  })((contenuti && contenuti.config) || {}, 'config');

  return fuori;
}

function copiaValore(valore) {
  return (valore !== null && typeof valore === 'object') ? JSON.parse(JSON.stringify(valore)) : valore;
}

function scrivi(contenuti, chiave, valore) {
  if (!chiave.startsWith('config.')) {
    contenuti.testi[chiave] = valore;
    return;
  }
  const pezzi = chiave.slice('config.'.length).split('.');
  let corrente = contenuti.config;
  for (let i = 0; i < pezzi.length - 1; i++) {
    const nome = pezzi[i];
    if (!haChiave(corrente, nome) || corrente[nome] === null || typeof corrente[nome] !== 'object' || Array.isArray(corrente[nome])) {
      corrente[nome] = {};
    }
    corrente = corrente[nome];
  }
  corrente[pezzi[pezzi.length - 1]] = valore;
}

const SUPERATE = [
  'spotify.titolo',
  'spotify.ascolta',
  'spotify.passa',
  'spotify.nascondi',
  'spotify.mostra',
  'config.spotify',
  'diretta.testo',
  'sponsor.altri'
];

const RINNOVATE = {
  'sponsor.paginaTitolo': ['Gli sponsor'],
  'sponsor.paginaTesto': ['Le realtà che sostengono il canale, divise per categoria. Ogni scheda porta al loro sito.']
};

function rinnova(contenuti) {
  const rinnovate = [];
  for (const chiave of Object.keys(RINNOVATE)) {
    if (!haChiave(contenuti.testi, chiave)) { continue; }
    if (RINNOVATE[chiave].indexOf(contenuti.testi[chiave]) === -1) { continue; }
    const c = campo(chiave);
    if (!c || !Object.prototype.hasOwnProperty.call(c, 'predefinito')) { continue; }
    contenuti.testi[chiave] = c.predefinito;
    rinnovate.push(chiave);
  }
  return rinnovate;
}

function cancella(contenuti, chiave) {
  if (!chiave.startsWith('config.')) {
    if (!haChiave(contenuti.testi, chiave)) { return false; }
    delete contenuti.testi[chiave];
    return true;
  }
  const pezzi = chiave.slice('config.'.length).split('.');
  let corrente = contenuti.config;
  for (let i = 0; i < pezzi.length - 1; i++) {
    const nome = pezzi[i];
    if (!haChiave(corrente, nome) || corrente[nome] === null || typeof corrente[nome] !== 'object') { return false; }
    corrente = corrente[nome];
  }
  const ultimo = pezzi[pezzi.length - 1];
  if (!haChiave(corrente, ultimo)) { return false; }
  delete corrente[ultimo];
  return true;
}

function dimentica(contenuti) {
  if (!contenuti || typeof contenuti !== 'object') { return []; }
  if (!contenuti.testi || typeof contenuti.testi !== 'object') { return []; }
  if (!contenuti.config || typeof contenuti.config !== 'object') { return []; }

  const tolte = [];
  for (const chiave of SUPERATE) {
    if (cancella(contenuti, chiave)) { tolte.push(chiave); }
  }
  return tolte;
}

function completa(contenuti) {
  if (!contenuti || typeof contenuti !== 'object') { return []; }
  if (!contenuti.testi || typeof contenuti.testi !== 'object') { return []; }
  if (!contenuti.config || typeof contenuti.config !== 'object') { return []; }

  dimentica(contenuti);
  rinnova(contenuti);

  const aggiunte = [];
  for (const c of campi()) {
    if (c.tipo === 'elenco') { completaVoci(contenuti, c, aggiunte); }
    if (!Object.prototype.hasOwnProperty.call(c, 'predefinito')) { continue; }
    if (valoreDi(contenuti, c.chiave).trovato) { continue; }
    scrivi(contenuti, c.chiave, copiaValore(c.predefinito));
    aggiunte.push(c.chiave);
  }
  return aggiunte;
}

function completaVoci(contenuti, campo, aggiunte) {
  const esito = valoreDi(contenuti, campo.chiave);
  if (!esito.trovato || !Array.isArray(esito.valore)) { return; }
  esito.valore.forEach((voce, i) => {
    if (!voce || typeof voce !== 'object' || Array.isArray(voce)) { return; }
    for (const sotto of campo.campi || []) {
      if (!Object.prototype.hasOwnProperty.call(sotto, 'predefinito')) { continue; }
      if (haChiave(voce, sotto.chiave)) { continue; }
      voce[sotto.chiave] = typeof sotto.predefinitoVoce === 'function'
        ? sotto.predefinitoVoce(voce) : copiaValore(sotto.predefinito);
      aggiunte.push(campo.chiave + '[' + i + '].' + sotto.chiave);
    }
  });
}

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

    if (c.tipo === 'font' && !c.slot) {
      problemi.push({ tipo: 'slot', chiave: c.chiave, messaggio: 'Il campo "' + c.chiave + '" è di tipo font ma non dice a quale slot appartiene (titolo, testo o mono).' });
    }

    const esito = valoreDi(contenuti, c.chiave);
    if (!esito.trovato) {

      if (Object.prototype.hasOwnProperty.call(c, 'predefinito')) { continue; }
      problemi.push({ tipo: 'inesistente', chiave: c.chiave, messaggio: 'Il campo "' + c.chiave + '" punta a una chiave che in contenuti.json non esiste.' });
      continue;
    }

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

    if (GENERATI.indexOf(chiave) !== -1) { continue; }

    if (diEditor(chiave)) { continue; }

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

  for (const c of tutti) {
    if (diEditor(c.chiave)) {
      problemi.push({ tipo: 'doppia', chiave: c.chiave, messaggio: 'La chiave "' + c.chiave + '" la scrive l\'editor con controlli suoi: un campo nel form sarebbe una seconda strada per la stessa modifica.' });
    }
  }

  return problemi;
}

module.exports = { gruppi, TIPI, SISTEMA, GENERATI, EDITOR, SUPERATE, campi, campo, valoreDi, chiaviDeiContenuti, verificaCopertura, completa, dimentica, rinnova, RINNOVATE };
