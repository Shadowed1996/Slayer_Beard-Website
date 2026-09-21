# Registro delle modifiche

Tutte le modifiche degne di nota a questo progetto vengono annotate qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/)
e il progetto adotta il [Versionamento Semantico](https://semver.org/lang/it/).

La storia di questo repository comincia con un **commit iniziale unico**, che
contiene il sito già arrivato alla terza fase di costruzione: le voci della
versione `1.0.0` descrivono quindi ciò che quel commit ha portato, raggruppato
per le tre fasi documentate in [`CONTRATTO.md`](CONTRATTO.md),
[`CONTRATTO-2.md`](CONTRATTO-2.md) e [`CONTRATTO-3.md`](CONTRATTO-3.md).

## [Non rilasciato]

### Aggiunto

- **Una pagina con tutte le clip, dove il periodo lo sceglie chi guarda.**
  `clip.html` è la seconda pagina del sito — il resto resta una pagina sola con
  sei sezioni — e nasce da `modelli/clip.html` come `index.html` nasce dal suo.
  Ci sono **tutte** le clip, non le sei della vetrina, e quattro bottoni
  (**24 ore, 3 giorni, 7 giorni, 30 giorni**) cambiano quello che si vede
  **senza ricaricare niente**. Il bottone in testa a «La diretta» porta qui, e
  sotto la vetrina c'è il secondo modo di arrivarci; la vetrina in home resta
  com'era, l'assaggio di chi sta scorrendo la sezione.
- **Il filtro non chiede niente a nessuno, ed è il punto.** Il sito è statico e
  le chiavi di Twitch non devono arrivare in un browser: quindi «e quelle delle
  ultime 24 ore?» non è una domanda che si possa fare da online. Alla
  pubblicazione il server chiede a Twitch le migliori di **ciascuno** dei quattro
  periodi (`clipArchivio` in `server/lib/twitch.js`) e le unisce senza doppioni —
  quattro richieste e non una, perché le trenta clip più viste del mese possono
  benissimo essere tutte di tre settimane fa e lasciare le ultime 24 ore vuote.
  Le clip finiscono tutte dentro la pagina con la loro data (`data-quando`), e
  `js/clip.js` nasconde e rimostra quello che è già lì. Senza JavaScript la
  pagina resta intera: si vedono tutte le clip e i bottoni non compaiono affatto.
  Se in un periodo non c'è niente lo dice — «Nessuna clip in questo periodo.» —
  invece di restare bianca.
- **`config.clip.quanteArchivio`**, nella parte «Le clip» del pannello: quante
  clip il server porta a casa **per ogni periodo** (da 4 a 50, di serie 12). È il
  prezzo in peso della pagina, ed è l'unica impostazione nuova.
- **I campi nati dopo la messa online non rompono più la prima Pubblica.** Nuova
  proprietà `predefinito` nello schema e `schema.completa()`: un campo aggiunto
  oggi, su un `contenuti.json` scritto ieri, nasce col suo valore di partenza
  invece di far fallire la generazione con «punta a una chiave che non esiste».
  Serviva adesso — le dieci chiavi nuove delle clip sarebbero state dieci motivi
  di guasto sul sito già online, che `docs/HOSTING.md` dice giustamente di
  aggiornare **senza** sovrascrivere i contenuti — e servirà a ogni campo nuovo
  da qui in avanti.
- **La vetrina delle clip è accesa, e adesso si trova.** L'interruttore
  `config.clip.attivo` parte acceso, e in testa a «La diretta» c'è **un bottone
  con scritto il titolo della vetrina** (`.clip__vai`) che porta all'ancora
  `#clip` in fondo alla sezione. Il binario resta a sei voci — la settima non ci
  sta a 320 px — ma la vetrina non è più raggiungibile solo scorrendo fino in
  fondo a una sezione lunga. Il bottone è un'ancora, quindi funziona senza
  JavaScript, si stampa con la stessa condizione della vetrina («acceso **e**
  almeno una clip»), e l'etichetta è la chiave `clip.titolo` già esistente: una
  stringa sola da tenere aggiornata, non due.
- **Il pannello dice perché la vetrina accesa non si vede.** Nuovo avvertimento
  d'insieme (`server/lib/controlli.js`): interruttore acceso ed elenco ancora
  vuoto significa «pubblica una volta», perché è la pubblicazione ad andare a
  prendere le clip su Twitch. Non è un errore e non ferma niente — è la riga che
  mancava fra le cose da guardare prima di mandare il sito online.
- **`static-cdn.jtvnw.net` fra gli host delle anteprime** (`HOST_ANTEPRIME` in
  `server/lib/twitch.js`): è quello da cui Twitch serve le clip ritagliate di
  recente. La Content-Security-Policy lo conosceva già — è lo stesso host degli
  avatar — quindi quelle card restavano senza immagine per un filtro nostro, non
  per un divieto del browser.
- **Il progetto è pronto per un hosting con Node.** Finora sito e pannello
  nascevano per girare in locale (`127.0.0.1:4173`, avviati a mano); adesso lo
  stesso progetto si carica su un hosting con Node — il caso di partenza è un
  pannello Plesk con Passenger — e parte senza modifiche a mano. Le regole di
  questa fase stanno in `CONTRATTO-6.md`.
- **`app.js`**, il file d'avvio che l'hosting deve conoscere: imposta
  `TZ=Europe/Rome` prima di qualunque `require` (gli orari della schedule sono
  italiani, e un hosting in UTC farebbe cadere il lunedì sera di domenica),
  legge la porta da `PORT` e poi da `SB_PORTA`, ascolta su `0.0.0.0` a meno che
  `SB_HOST` non dica altro, e stampa una riga sola invece del riquadro d'avvio,
  perché dall'altra parte c'è un file di log e non un terminale. Poi avvia lo
  stesso server di `server/server.js`: stesse rotte, stesse API, stesso
  pannello. In locale non cambia niente.
- **`package.json`**: `npm start` per l'avvio, più gli script per generare e per
  il collaudo, `engines.node >= 18.17`, `private: true`. **Nessuna dipendenza e
  nessun `npm install`**: la regola del progetto resta quella.
- **Le impostazioni passano dalle variabili d'ambiente**, tutte facoltative e
  senza cambiare niente quando non ci sono, elencate in `.env.esempio`:
  `PORT`/`SB_PORTA` e `SB_HOST` per l'ascolto, `SB_DATI` e `SB_BACKUP` per
  tenere la password del pannello, `chiavi.js` e i backup **fuori dalla cartella
  pubblica** — la protezione che non dipende da come è configurato il server
  web — e `SB_SITO` per l'indirizzo pubblico del sito.
- **L'indirizzo pubblico può arrivare dall'ambiente.** Se il campo del pannello
  è vuoto ma c'è `SB_SITO`, la pubblicazione lo usa per il link canonico e per
  le anteprime social, e ne aggiunge l'host — con e senza `www` — ai domini del
  player Twitch: il player funziona appena il sito è online, senza dover aprire
  il pannello. Se il campo del pannello è pieno, vince il campo; e
  l'avvertimento «manca l'indirizzo pubblico» non compare più quando
  l'indirizzo c'è, anche se arriva da lì.
- **`.htaccess`**: le protezioni che Node applica da sé riscritte per il server
  web, che i file esistenti li consegna da solo senza passare da Node. Nega
  `server/`, `contenuti/contenuti.json`, `modelli/`, `docs/`, i `*.md`,
  `package.json`, `.env*`, `app.js` e i file di git, lasciando fuori dal divieto
  le immagini della libreria e i font, che al sito servono; poi compressione,
  cache (`index.html` sempre rivalidato, immagini e font a vita lunga),
  intestazioni di sicurezza, `http` → `https` senza nominare nessun dominio, e
  una sezione per il `www` da scommentare il giorno in cui il dominio si sa.
  Ogni direttiva sta dentro un `<IfModule>`: su un hosting condiviso un modulo
  che manca non deve buttare giù il sito.
- **`robots.txt`**: tutto aperto tranne `/pannello/` e `/api/`. La riga
  `Sitemap:` la scrive la pubblicazione quando l'indirizzo del sito è noto.
- **`docs/HOSTING.md`**, la guida della messa online per chi non programma:
  cosa caricare e dove, i campi da compilare nell'estensione Node, le variabili
  d'ambiente una per una, il primo accesso al pannello online, l'avviso su nginx
  che serve i file statici saltando `.htaccess`, cosa fare quando il dominio si
  sa e cosa non caricare mai (`server/dati/`, i backup).
- **La prima password non se la sceglie chi passa di lì.** Finché la password
  non esiste, il pannello la fa creare a chi arriva: sul computer di casa va
  benissimo, su un sito pubblico vuol dire che fra l'avvio dell'applicazione e
  il primo accesso del proprietario la porta è aperta, e `/pannello/` è uno dei
  percorsi che i bot provano di serie. Adesso la creazione è libera solo da un
  indirizzo locale; da fuori serve `SB_PRIMO_ACCESSO=1` fra le variabili
  dell'applicazione — si accende, si crea la password, si spegne — e chi bussa
  senza si prende un 403 che dice esattamente questo. Basta la **presenza** di
  `X-Forwarded-For` perché la richiesta non conti come locale: dietro un proxy
  che sta sulla stessa macchina ogni visitatore sembrerebbe `127.0.0.1`, e chi
  ha dimenticato di dichiarare il proxy non deve ritrovarsi la porta aperta.
  A password creata il controllo non esiste più, quindi una variabile lasciata
  accesa per distrazione non apre niente.
- **`sitemap.xml`**, scritta nella radice dalla pubblicazione quando l'indirizzo
  del sito è noto: una pagina sola, perché il sito è una pagina sola, con la
  data dell'ultima pubblicazione. Nello stesso momento la riga `Sitemap:` entra
  in fondo a `robots.txt` — se c'era già si sostituisce dov'è, invece di
  aggiungerne una seconda. Senza indirizzo non si scrive niente e nessuno si
  lamenta: una sitemap che dichiara «./» sarebbe peggio di nessuna sitemap.
- **I tre tempi di pazienza del server**: 30 secondi per mandare le
  intestazioni, 3 minuti per l'intera richiesta (il corpo più grosso che il
  server accetta è un'immagine da 4 MB) e 15 secondi di attesa fra due
  richieste sulla stessa connessione. In locale non servivano a niente; su
  internet aprire connessioni e non parlare è la forma di disturbo più antica e
  più economica che ci sia.
- `README.md`: la sezione della messa online rimanda alla guida e dice cosa
  cambia per chi lavora in locale (cioè quasi niente).

- **Follower e abbonati si aggiornano da soli.** Il server li chiede a Twitch
  (`helix/channels/followers` e `helix/subscriptions`) a ogni pubblicazione e,
  col server acceso, ogni dieci minuti, e li scrive in `config.dati` e nelle
  caselle `deck.dato1Valore`, `chi.dato1Valore` e `chi.dato2Valore`. Le caselle
  si riscrivono solo se contengono un numero nudo, così quello che si scrive a
  mano nel pannello resta com'è.
- Serve l'autorizzazione del canale: `node server/imposta-twitch.js --collega`
  usa il flusso a codice di Twitch (twitch.tv/activate) e salva il refresh
  token in `server/dati/twitch-accesso.json`, escluso dal controllo di
  versione. Il token si rinnova da sé e il refresh token nuovo si salva a ogni
  rinnovo. Arrivano anche `--scollega`, e `--prova` che controlla i numeri.
- Il pannello mostra l'esito dei numeri dopo la pubblicazione, come per le clip.
- Sei prove nuove nella sezione 9 del collaudo: formato dei numeri, caselle
  scritte a mano che non si toccano, stati senza chiavi o autorizzazione, file
  rotto, resoconti, refresh token mai nei file generati e sempre nel
  `.gitignore`.
- `CONTRATTO-3.md` §4.7: la deroga motivata sul token utente nel server locale.

- **«Chi sono» rifatta, grafica e testi.** Il ritratto è grande e storto come
  una figurina, con la didascalia a etichetta, e sta accanto al racconto invece
  che in fondo. La citazione è un fumetto della chat, i tag sono adesivi con un
  pallino colorato, le tre note sono bigliettini in fila e i numeri del canale
  stanno sotto, grandi e col gradiente del titolo. I testi sono riscritti più
  semplici e diretti, senza aggiungere fatti nuovi (è sparito quello del
  «pollaio», che nessuno aveva confermato). Il markup non cambia: cambiano
  `css/sezioni.css` §3 e i testi `chi.*` in `contenuti.json`. Deroga motivata
  in `CONTRATTO.md` §2.

- **La schedule della settimana, rifatta da capo.** Il nastro era una fila di
  sette giorni con un'ora sola per tutti: una diretta alle 18:30 del mercoledì
  non si poteva scrivere, e la sezione non aveva niente da mostrare oltre a un
  orario. Adesso ogni giorno di diretta è una **locandina** con ora e durata
  sue, titolo, gioco, nota e un'immagine di sfondo con punto di fuoco e velo; i
  giorni di riposo restano strisce strette. Sul computer i sette giorni stanno
  in una riga, sotto i 1100 px vanno uno sotto l'altro, senza scorrimento di
  lato. La scheda di un giorno spento resta nei dati: riaccendendolo torna
  com'era. Il ramo è `config.orari` nella forma nuova, le regole sono in
  `CONTRATTO-5.md`.
- **Gli eventi speciali**: fino a otto dirette fuori programma con una data
  precisa — una maratona, uno speciale — con ora, durata fino a 72 ore, titolo,
  gioco, nota e immagine. Compaiono sotto il nastro, contano per il conto alla
  rovescia e, finiti, spariscono dal sito da soli: la pagina generata non stampa
  quelli già passati, e quelli che finiscono dopo la pubblicazione li toglie
  `js/sito.js`. Il sito non annuncia la maratona di ieri; nel pannello restano,
  segnati «Passato».
- **Il fondale della sezione**: un'immagine dietro tutta «La settimana»,
  sfumata ai bordi e velata come quella della copertina, con il punto di fuoco
  e un'intensità da 0 a 100. A 0 l'immagine non si stampa nemmeno, invece di
  farla scaricare per poi disegnarla trasparente.
- Sul sito, mentre gira: la data della prossima volta sopra ogni giorno, tre
  segni diversi per oggi, prossima diretta e in onda, «Speciale» sul giorno in
  cui cade un evento, e l'ora di chi guarda da un altro fuso («Da te 15:00»).
  Il conto alla rovescia usa l'ora e la durata di ogni giorno e gli eventi.
  Senza JavaScript la sezione resta completa: mancano solo date, segni e ora
  locale.
- `pannello/condivisi/orari.js` (`SBOrari`): le regole della schedule in **un
  file solo** per server e pannello, come `stili.js` per gli stili. Limiti,
  forma pulita (`normalizza`, che non lancia mai), messaggi d'errore in italiano
  (`problemi`), fusi orari e ora legale con `Intl`. Con due copie, prima o poi
  il pannello accetterebbe una nota che il server rifiuta al salvataggio.
- `pannello/moduli/settimana.js`, l'editor della schedule: riepilogo, tre
  linguette (Settimana, Eventi speciali, Fondale), un giorno aperto alla volta,
  errori accanto alla casella che li causa. Il **blocco immagine** è uguale per
  giorni, eventi e fondale: libreria, caricamento dal computer o file
  trascinato, punto di fuoco con il mouse o con la tastiera, ritagli Computer e
  Telefono, velo o intensità. Un clic su un giorno o su un evento nell'anteprima
  apre il posto giusto, quello aperto si contorna di ciano, e fuoco, velo e
  intensità si vedono nell'anteprima subito, prima della ricarica.
- La parte **Eventi speciali** in `pannello/editor/nomi.js`, e nella parte
  «stato» della copertina il riepilogo della schedule con il bottone **Modifica
  la schedule**, invece di un secondo editor intero.
- Quattro testi nel gruppo «La settimana»: `settimana.titoloEventi`,
  `settimana.etichettaEvento`, `settimana.etichettaInOnda` e
  `settimana.etichettaDaTe`.
- **Le grafiche nuove del canale, e un sito molto più leggero.** Le immagini
  erano PNG pesanti e vecchi: un banner con la scritta «VOD», un'anteprima
  social che tagliava a metà il pollo e gli handle, una mascotte con il fondo
  non trasparente sfumata a forza da una maschera. Adesso ci sono
  `img/copertina.webp` (la città notturna pulita), `img/avatar.webp`,
  `img/mascotte.webp` (il pollo scontornato dal banner nuovo, con la
  trasparenza vera), `img/og.jpg`, `img/favicon.png` a 180×180 e
  `img/settimana-sfondo.webp` per il fondale. I cinque PNG di prima pesavano
  2037 kB; le cinque immagini che li sostituiscono pesano 165 kB, 188 kB con il
  fondale nuovo.
- Cinque grafiche del canale già pronte nella libreria, in `contenuti/media/`:
  la città notturna, il banner di Twitch, la fascia della webcam, la locandina
  verticale «STARTING» e lo stinger, da scegliere per giorni, eventi e fondale.
- **Il pannello converte in WebP le immagini che carica.** Con
  `preparaImmagine`, in `pannello/moduli/media.js`, un PNG, JPG o WebP oltre i
  350 kB o oltre i 2400 pixel di lato viene ridotto e riscritto in WebP nel
  browser, prima di partire; se il WebP non pesa meno parte l'originale, e SVG
  e animazioni non si toccano. Una foto presa dal telefono diventava un file da
  megabyte che il sito faceva scaricare a ogni visita, o si fermava contro il
  limite dei 4 MB: adesso il limite si controlla dopo la riduzione. Vale per
  ogni caricamento, dalla libreria, dal blocco immagine o trascinando un file.
- Sezione 11 del collaudo, *La schedule*: 26 prove su regole e messaggi, ora
  legale a Roma e in altri fusi, eventi finiti, contesto della pagina,
  `js/dati.js`, salvataggio in blocco e immagini in uso. In tutto sono 172.
- `README.md`: i capitoli *La schedule della settimana* e *Le immagini*.
  `docs/PANNELLO.md`: la schedule nel capitolo 11, le foto alleggerite nel
  capitolo 8, il modello dei dati e l'editor nel capitolo 28. `CONTRATTO-5.md`.
- **L'editor unico del pannello.** Il pannello era un elenco di gruppi di campi
  da sfogliare, e per cambiare un titolo bisognava prima indovinare in quale
  gruppo stava. Adesso l'anteprima del sito sta al centro, anche con le
  modifiche non ancora salvate, e si clicca direttamente la cosa da cambiare:
  un pannello laterale ne mostra i controlli in tre schede, Contenuto, Stile e
  Avanzate. I testi si scrivono sul posto, le immagini si cambiano
  cliccandole. Le regole sono in `CONTRATTO-4.md`, la guida in
  `docs/PANNELLO.md`.
- **Uno stile per ogni elemento, diverso su Telefono, Tablet e Computer**
  (`config.stili`): font, dimensione, colori — anche collegati ai colori del
  tema, così ne seguono i cambi —, sfondo, spazi, bordi, bagliore, opacità,
  visibilità per dispositivo e larghezza massima.
- **Blocchi da spostare e ridimensionare** dentro la loro sezione, per
  dispositivo (`config.disposizione`), e **sezioni da riordinare e nascondere**
  dal Navigatore (`config.sezioni`). Il menu laterale segue le sezioni da solo,
  e i link verso una sezione spenta spariscono invece di restare morti.
- `pannello/condivisi/stili.js`, il generatore degli stili e delle posizioni,
  usato dal pannello per l'anteprima e dal server per la pagina: il CSS dal vivo
  e quello pubblicato sono lo stesso testo, al byte.
- **Font caricati dal computer** — WOFF2, WOFF, TTF e OTF fino a 2 MB,
  riconosciuti da quello che c'è dentro il file e non dal nome — in
  `contenuti/font/`, per tutto il sito o per un elemento solo. Li gestiscono
  `server/lib/font.js` e le rotte `/api/font`.
- Il menu ☰ con Impostazioni del sito (colori, combinazioni pronte, font,
  forma), Struttura della pagina, Canale e immagini, Google e social, Immagini,
  Copie di sicurezza e il **cambio della password** dal pannello
  (`POST /api/password`), che chiude gli accessi aperti altrove. Annulla e
  Ripeti, la ricerca dei campi con `Ctrl+K`, il pannello largo a piacere da 380
  a 760 px e, sugli schermi stretti, il cassetto.
- L'anteprima dell'editor è la pagina **senza il JavaScript del sito**
  (`POST /api/anteprima` con `editor: true`): dentro l'editor il player di
  Twitch sarebbe una seconda sessione video della stessa persona, e il pollo
  aprirebbe una connessione alla chat a ogni ricarica.
- Il player di Twitch **non si nasconde, non diventa trasparente, non si
  rimpicciolisce e non si copre**: per «La diretta» quei controlli non ci sono,
  e il server scarta i valori vietati arrivati per altre strade. Un player
  coperto è quello che Twitch tratta come gonfiaggio degli spettatori.
- I marcatori `data-sb-*` nei modelli (sezioni, riquadri, blocchi, parti,
  testi, immagini) e `font-src 'self'` nella CSP. Con i valori di partenza la
  pagina generata resta identica a quella di prima, a parte questi.
- **Tutte le chiavi in un file solo: `server/dati/chiavi.js`.** Prima il Client
  ID stava scritto in due posti — il campo del pannello, e quindi
  `contenuti.json`, più il file del server insieme al secret — e due copie
  dello stesso valore sono due cose che prima o poi smettono di essere
  d'accordo. Adesso si scrive una volta e da lì lo prendono il login del sito,
  «Ultima diretta» e la vetrina delle clip.
- Alla pubblicazione il Client ID viene **copiato da sé** da `chiavi.js` dentro
  `config.account.clientId`, e quindi nella pagina. Non svuota mai il campo: chi
  non usa `chiavi.js` non si accorge che esiste.
- `server/modelli/chiavi.esempio.js`, il modello da copiare, con dentro le
  istruzioni. È un `.js` e non un `.json` apposta: un file che si compila a mano
  ha bisogno di commenti, e JSON non li ammette. `server/lib/chiavi.js` in
  cambio controlla la forma di quello che il file esporta invece di fidarsi.
- Le chiavi si possono cambiare **a server acceso**: la cache di `require` viene
  buttata prima di ogni lettura, quindi il valore nuovo vale dal giro dopo.
- **«Ultima diretta» e le clip si aggiornano da sole, senza premere niente.**
  Finché `node server/server.js` gira fa un giro ogni dieci minuti
  (`SB_AGGIORNA_MIN`, `0` per spegnerlo) e, se qualcosa è cambiato,
  ripubblica. Prima si aggiornava solo alla pubblicazione, il che voleva dire
  che senza un Pubblica il campo restava indietro — cioè il difetto per cui
  era stato scritto a mano.
- L'aggiornamento automatico **non scavalca la distinzione fra Salva e
  Pubblica**: guarda prima se il sito pubblicato è già allineato alla bozza e,
  se non lo è, aggiorna `contenuti.json` e lascia la pubblicazione a chi di
  dovere invece di mandare online una bozza che qualcuno stava trattenendo.
- All'avvio il server dice se il collegamento con Twitch manca, invece di
  tacere: è la prima cosa da sapere quando «Ultima diretta» non cambia.
- **La vetrina delle clip**, in fondo alla sezione «La diretta»: le clip più
  viste del canale, con anteprima, durata, visualizzazioni, data e nome di chi
  le ha ritagliate. `server/lib/twitch.js` le chiede a `helix/clips` a ogni
  pubblicazione e le scrive in `config.clip.voci`; dal pannello si scelgono
  quante (1–12) e di quale periodo (settimana, mese, anno, sempre).
  È **interamente statica**: nessun `id` è contratto con del JavaScript e senza
  JS funziona per intero. Come per «Ultima diretta», Twitch che non risponde non
  svuota niente e non fa fallire la pubblicazione.
- La vetrina **non aggiunge una voce nel binario**, e sta dentro «diretta» per
  questo: `css/base.css` è tarato perché sei etichette ci stiano anche a 320 px,
  e la settima le farebbe traboccare. Una prova del collaudo lo tiene fermo.
- `contenuti/schema.js`: `GENERATI`, i rami che riempie il server e che non
  hanno — né devono avere — un campo nel pannello. È l'unica eccezione ammessa
  alla regola «lo schema copre esattamente `contenuti.json`», e la copertura la
  applica in tutte e due le direzioni: non segnala quei rami come scoperti, e
  segnala chi provasse a descriverli.
- `css/clip.css` e `modelli/parziali/clip.html`, più il gruppo «Le clip» nello
  schema e il capitolo 14 di `docs/PANNELLO.md`.
- Sezione 10 del collaudo, *La vetrina delle clip*: tredici prove, fra cui che
  gli host delle anteprime siano gli stessi nel modulo che le filtra e nella CSP
  che le lascia passare — un'immagine bloccata dalla Content-Security-Policy non
  lo dice a nessuno, ed è il guasto che si scoprirebbe solo guardando il sito.
- **«Ultima diretta» si aggiorna da sé anche per i visitatori anonimi.**
  `server/lib/twitch.js` prende un app token (`client_credentials`) e, prima di
  ogni generazione, chiede a Twitch il titolo dell'ultimo VOD
  (`helix/videos?type=archive`, con ripiego su `helix/channels`) e lo scrive in
  `config.ultimaDiretta`. Non lancia mai e **non svuota mai** il valore
  esistente: se Twitch non risponde la pubblicazione va avanti con quello che
  c'era. Chiude il quarto punto lasciato aperto dal rifacimento del profilo.
- `node server/imposta-twitch.js <clientId> <clientSecret>` per configurare quel
  collegamento, con `--prova` per verificarlo subito e `--togli` per rimuoverlo.
  Il file finisce in `server/dati/chiavi.js`, con permessi ristretti dove il
  sistema li ha, ed è escluso dal controllo di versione.
- Sezione 9 del collaudo, *Collegamento con Twitch*: otto prove che non toccano
  la rete, perché quello che dev'essere dimostrato è come si comporta una
  pubblicazione quando Twitch **non** risponde. Fra queste, due invarianti
  verificate e non promesse: il client secret non compare in nessuno dei file
  generati, e `.gitignore` continua a escluderlo.
- Prove nuove sul ramo `account` di `window.DATI` — forma, motivo dello
  spegnimento, e l'invariante «senza profilo del sito il messaggio in chat resta
  spento» nelle due direzioni.
- `CONTRATTO-3.md` §4.6: la deroga motivata sul client secret e su `node:https`,
  più un avviso in testa al documento che elenca i cinque punti superati dal
  rifacimento del profilo.
- `README.md`: capitolo *«Ultima diretta» che si aggiorna da sé*.
- `docs/PANNELLO.md`: capitolo 12, *Il profilo del sito (login con Twitch)*.
- `LICENSE`: licenza d'uso proprietaria, tutti i diritti riservati.
- `SECURITY.md` con la politica di sicurezza, i punti sensibili noti e i casi
  fuori ambito.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` e questo `CHANGELOG.md`.
- Template per le issue (segnalazione di bug, richiesta di funzionalità) e per
  le pull request, più `CODEOWNERS`.
- Workflow di verifica non bloccante (`.github/workflows/verifica.yml`) e
  configurazione di Dependabot per gli aggiornamenti delle GitHub Actions.
- `.editorconfig` e `.gitattributes` allineati alle convenzioni del progetto.

### Modificato
- **Il messaggio di lurk ora parte da solo ogni 10 minuti.** Con la modalità lurk
  accesa e l'utente collegato con Twitch, il primo messaggio parte
  all'accensione come prima; poi ne parte uno ogni dieci minuti, finché il lurk
  resta acceso (`CADENZA_INVIO` in `js/lurk.js`). Le frasi girano **a mazzo**:
  si dicono tutte, in ordine casuale, prima di ripeterne una. Il tetto di tre
  messaggi per pagina non c'è più. Restano i freni: niente messaggi a canale
  spento, niente mentre il sito chiede «ci sei ancora?», e dopo `oreMax` ore
  senza risposta si spegne tutto. È la Strada B2 che `docs/PRESENZA-TWITCH.md`
  §6.3 escludeva: la deroga è motivata nel `CONTRATTO-3.md` §4.1, con i rischi
  verso il regolamento di Twitch. I testi di ripiego di `lurk.preavviso` e
  `lurk.invito` in `js/lurk.js` dicono che il messaggio si ripete; quelli veri
  stanno nei contenuti del sito, che questa modifica non tocca, e si
  aggiornano dal pannello.

- **In home niente più clip: un invito alla pagina delle clip.** In fondo alla
  «diretta», al posto della vetrina con le card, ci sono un titolo («Migliori
  highlights»), una riga di presentazione e il bottone «Vai alle clip» verso
  `clip.html`. I tre testi sono nuovi (`clip.invitoTitolo`, `clip.invitoTesto`,
  `clip.invitoBottone`) e hanno un predefinito, quindi compaiono anche su un
  sito già online senza toccare il pannello; si cambiano cliccandoli
  nell'anteprima. L'invito esce solo se la pagina delle clip esiste.

- **Il sito ha un dominio: `slayerbeard.com`.** `config.sitoUrl` nei contenuti è
  `https://slayerbeard.com`, e da lì la pubblicazione prende il link canonico,
  l'`og:url` delle anteprime social, il `<loc>` della sitemap e la riga
  `Sitemap:` di `robots.txt`. L'indirizzo buono è **senza `www`**:
  `www.slayerbeard.com` funziona, ma `.htaccess` lo manda lì sopra con un 301.
  Il marchio invece resta `slayer_beard`, con l'underscore: in un dominio non ci
  può stare, ed è il motivo per cui i due si scrivono diversi.
- I domini autorizzati per il player si scrivono nel pannello —
  `slayerbeard.com` e `www.slayerbeard.com`, che per Twitch sono due nomi
  diversi. La pubblicazione li aggiunge da sé **solo** quando l'indirizzo arriva
  da `SB_SITO`; quando è scritto nel pannello, come adesso, la lista è quella
  che c'è scritta. La pagina, per suo conto, dichiara sempre `localhost`,
  `127.0.0.1` e l'indirizzo da cui è stata aperta.

- **Del committente non resta niente nei file.** Il titolare del copyright in
  `LICENSE` è `slayer_beard` e non una persona con nome e cognome; `README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` e i template delle
  issue non fanno più il nome di nessuno e, dove serve un contatto, mandano al
  repository del progetto su GitHub — **mai** a un indirizzo di posta; nei
  `CONTRATTO*.md` i percorsi del computer di chi ha commissionato il lavoro
  sono diventati neutri (`<cartella di lavoro>\…`), senza cambiare il senso
  delle frasi. L'indirizzo di posta che resta nel sito è quello pubblico del
  canale, che è un contenuto e ci deve stare.

- **La pagina pubblicata esce senza nemmeno un commento HTML.** I commenti
  restano nei modelli, che sono il sorgente e devono restare spiegati: si
  tolgono in uscita, sulla pagina già composta, scorrendola un pezzo per volta
  invece che con una sostituzione cieca. Quello che sta dentro un attributo,
  uno `<script>` o un `<pre>` non viene nemmeno guardato, i commenti
  condizionali restano (dentro c'è marcatura vera) e lo spazio si comporta come
  prima, così due tag che erano separati non si ritrovano attaccati. Del
  vecchio `<!-- … -->` non resta neanche la riga vuota.

- **Il pannello è pronto a stare su internet.** `X-Forwarded-For` non si crede
  più sulla parola: il freno ai tentativi di password guardava il **primo**
  valore dell'intestazione, cioè quello che scrive chi bussa, e bastava
  cambiarlo a ogni richiesta per non essere frenati mai. Adesso l'intestazione
  si guarda solo se chi installa dichiara di stare dietro un proxy
  (`SB_DIETRO_PROXY=1`) e si prende l'**ultimo** salto; senza dichiarazione vale
  l'indirizzo della connessione. Stesso ragionamento per `X-Forwarded-Proto` e
  il cookie `Secure`. In locale non cambia niente.
- Le rotte che scrivono hanno un freno per indirizzo IP, leggero: chi prova a
  caso non fa lavorare il server gratis.
- `server/lib/statico.js` nega le stesse cose di `.htaccess` anche quando è Node
  a servire i file — i documenti (`*.md`), `package.json`, `.env*`, `app.js`,
  `.git*`, `modelli/` e `docs/` — lasciando fuori dal divieto la libreria di
  immagini e i font, che al sito servono. Non è un doppione: se `.htaccess`
  manca, o se nginx lo scavalca, questo è l'ultimo rimasto a dire di no.

- «Chi sono» si apre con il nome: «Sono Michele, in arte slayer_beard.»
- Il primo adesivo di «Chi sono» dice «Variety streamer» invece di «Un po' di tutto».
- Follower aggiornati a 3.624 (erano 3.619). Il numero è scritto a mano in tre
  punti di `contenuti.json` — `deck.dato1Valore`, `chi.dato1Valore` e
  `config.dati.follower` — e non arriva da Twitch: va ritoccato ogni tanto.
- L'affiliazione è dal 2020, non dal 2013: corretta la riga del marchio
  («Twitch Affiliate · dal 2020»), che compare sotto l'avatar di «Chi sono» e
  nella scheda per i motori di ricerca.
- «Chi sono» ha i testi scritti da slayer_beard: le live da agosto 2020 nate
  come sfida personale, la citazione sul sorriso e i giochi della settimana.
  Il titolo della sezione diventa «Chi sono» e l'occhiello sopra passa a
  «slayer_beard», per non ripetere la stessa parola due volte.
- La nota in fondo al piede non parla più di come è fatto il sito («Fatto in
  casa, senza framework.») ma del pollo: «Nessun pollo è stato maltrattato
  durante la costruzione di questo sito.»
- `config.orari` ha la forma nuova: ai quattro valori di sempre (`giorni`,
  `ora`, `durataOre`, `fuso`) si aggiungono `schede`, `eventi` e `sfondo`. Un
  `contenuti.json` della forma vecchia resta valido e al primo salvataggio si
  completa da sé, con il fondale spento. Il campo nel pannello si chiama
  «Schedule della settimana».
- **La durata di serie va a passi di mezz'ora**, da 0,5 a 24 ore: prima
  bastava un numero maggiore di 0. È la regola delle schede e degli eventi:
  una sola regola per tutte le durate, e le caselle del pannello, che vanno a
  mezz'ore, arrivano a ogni valore che la convalida accetta. Una durata come
  `3.75` va riscritta.
- `config.orari` si salva **in blocco** (`RAMI_IN_BLOCCO` di
  `server/lib/archivio.js`), come i tre rami dell'editor: con la fusione chiave
  per chiave un evento cancellato nel pannello rinasceva dal file salvato.
- La convalida della schedule (`server/lib/convalida.js`) usa
  `SBOrari.problemi` e indica la casella esatta, per esempio
  `config.orari.schede.1.ora`, invece di un messaggio solo per tutto il campo.
- `config.orari` sta nelle parti «nastro» ed «eventi» e non più nella parte
  «stato»: la ricerca e gli errori del server portano sempre dove c'è l'editor.
- `config.immagini` punta ai file nuovi, e i quattro `<img>` di copertina, menu
  laterale, «chi sono» e pollo hanno `decoding="async"`; avatar, ritratto e
  pollo anche le misure che tengono il posto prima che l'immagine arrivi, e
  ritratto e pollo, fuori dalla prima schermata, `loading="lazy"`. `css/regia.css` inquadra di nuovo la città della copertina;
  `css/pollo.css` segue le proporzioni della mascotte nuova, senza più la
  maschera che ne sfumava il fondo.
- `README.md`: aggiunti i badge, l'indice della documentazione, le sezioni
  Licenza e Autore. Il resto del documento è rimasto invariato.
- `.gitignore` esteso con le cartelle degli editor e altri file temporanei.
- `.gitignore` esclude anche `server/dati/chiavi.js`.
- La Content-Security-Policy accetta due host in piu in `img-src`,
  `clips-media-assets2.twitch.tv` e `clips-media-assets.twitch.tv`: sono le
  anteprime delle clip, e come `static-cdn.jtvnw.net` sono host di sole
  immagini.
- Le opzioni dei campi `scelta` possono essere `{ valore, etichetta }` e non
  solo stringhe secche: nel pannello si legge «Ultimo mese», nei dati resta
  `30`.

### Rimosso

- `img/avatar.png`, `img/banner.png`, `img/mascot.png` e `img/og.png`:
  sostituiti dalle immagini nuove, nessun file scritto a mano li cita più.
  L'`index.html` generato li cita finché non si ripubblica: va rigenerato prima
  di caricare il sito online.
- Il vecchio editor degli orari (`campoOrari`) e l'export `GIORNI` di
  `pannello/moduli/campi.js`: il tipo `orari` lo disegna
  `pannello/moduli/settimana.js`, e nessun altro file li usava.
- `RIPRENDI-DOMANI.md`: era l'appunto di un lavoro interrotto a metà, e quel
  lavoro adesso è chiuso. Quello che restava da dire è finito nel README, nel
  CONTRATTO-3 e in questo registro; il resto è nella storia del repository.
- **I tre numeri sotto le note di «Chi sono»** (follower, abbonati, «~25 in
  chat a serata») tolti dal modello `modelli/parziali/chi.html`, insieme ai
  loro cinque campi `chi.dato*` nello schema e nei contenuti e alle regole
  `.chi__dati` di `css/sezioni.css`. Toglierli a mano da `index.html` non
  bastava: la pubblicazione successiva li rimetteva. I follower restano in
  copertina; gli abbonati si aggiornano ancora in `config.dati.abbonati`, ma
  nessuna casella li mostra più (`CAMPI_NUMERI` in `server/lib/twitch.js` è
  vuoto). Il collaudo prova la riscrittura delle caselle con una casella finta.
- La nota «Password persa? Dal computer dove gira il sito: `node
  server/imposta-password.js`» sotto il login del pannello. La vedeva chiunque
  aprisse `/pannello/`, e a un estraneo diceva come è fatto il server e con
  quale comando si cambia la password. Chi gestisce il sito la trova in
  `docs/PANNELLO.md` §3.

### Corretto
- **L'evento speciale si prende la schedule da mezzanotte del suo giorno.**
  La maratona «SlayerFest | Day 4» comincia alle 11:00, e fino a quell'ora il
  nastro tornava la settimana di sempre, senza orari sbarrati. Ora dalle 00:00
  del giorno dell'evento ogni serata che gli cade sotto esce «Speciale», con il
  titolo dell'evento e l'orario sbarrato (`programmaSostituito` in
  `pannello/condivisi/orari.js`, stessa regola in `js/sito.js`). Il conto alla
  rovescia e la categoria di Twitch guardano ancora l'ora vera di inizio.

- **Le icone social nel binario a sinistra si vedono come devono.** Sono
  disegnate a tratto, ma `css/base.css` dava loro `fill: currentColor`: i
  contorni si riempivano, e Twitch e Instagram diventavano due macchie mentre
  TikTok sembrava una nota musicale. Tolto il riempimento, le icone passano
  da 17 a 19px e quella di TikTok (`modelli/icone/tiktok.svg`) è ridisegnata
  con il ricciolo aperto, così si riconosce.

- **La libreria sapeva dove era usata un'immagine, ma non nella schedule.**
  `usoDi` di `pannello/pannello.js` guardava solo i campi di tipo immagine, e
  la finestra «Elimino…» proponeva di cancellare la locandina di un giorno come
  se non servisse a niente. Adesso elenca «Schedule · lunedì», «Schedule ·
  evento «…»» e «Schedule · fondale della sezione»; il server, dal canto suo,
  la cancellazione la rifiutava già.
- L'anteprima dell'editor non ripulisce più come testo ricco un testo semplice
  che sta dentro un elenco (una riga del listino, per esempio): un «<Quake>»
  scritto lì spariva dall'anteprima mentre sul sito si leggeva. Adesso si risale
  al campo che contiene quel testo e si guarda il tipo vero.
- Un blocco largo quanto il contenuto non salta più a sinistra al primo
  spostamento, nemmeno se lo si muove solo in verticale o con le frecce: il
  limite a destra partiva da una misura presa sul bordo sbagliato.
- La mascotte aveva la cresta tagliata e il fondo non trasparente; l'anteprima
  social tagliava a metà il pollo e gli handle. Le immagini nuove li tengono
  interi.
- Il resoconto delle clip distingue i due motivi per cui può essere spento —
  manca il collegamento, oppure la vetrina non è accesa nel pannello — invece
  di mandare a controllare il posto sbagliato.
- Gli errori di Twitch non spezzano più la riga di resoconto: il corpo della
  risposta arriva con un a capo dentro e veniva stampato così com'era.
- **Il collaudo torna verde: 128 prove su 128** (erano 12 fallite su 117). Le
  prove che parlavano di `config.lurk.clientId`, dell'ordine dei gruppi e
  dell'ordine degli script erano rimaste indietro rispetto al rifacimento del
  profilo del sito, e descrivevano un programma che non esisteva più.
- La rotta `POST /api/pubblica` e `node server/genera.js` sono diventate
  asincrone: la chiamata a Twitch avviene **prima** di generare, perché
  `costruisci.genera()` rilegge `contenuti.json` da capo e va lasciata sincrona.
- Il pannello dice, a pubblicazione finita, se «Ultima diretta» è stata
  aggiornata o no. Senza collegamento configurato non dice niente: è il caso
  normale di chi quel campo lo scrive a mano.

## [1.0.0] — 2026-09-08

Commit iniziale: `Commit iniziale: sito Slayer Beard`.

### Aggiunto

#### Il sito (prima fase — `CONTRATTO.md`)

- Sito statico a pagina unica del canale Twitch **slayer_beard**, con sei
  sezioni: regia, diretta, settimana, chi sono, supporto, saluti, e il binario
  di navigazione laterale che diventa dock sotto i 1100 px.
- Generazione da modelli: `modelli/index.html` con i segnaposto `{{…}}`,
  `modelli/parziali/` per le sezioni e `modelli/icone/` per le icone SVG.
- `contenuti/contenuti.json` come unica fonte dei testi e della
  configurazione, e `contenuti/schema.js` che descrive ogni campo.
- Generatore `node server/genera.js`, che produce `index.html`, `js/dati.js` e
  `css/tema.css`, con copia di sicurezza in `server/backup/` prima di ogni
  scrittura.
- Server di amministrazione locale (`node server/server.js`, porta `4173` o
  `SB_PORTA`) con opzione `--guarda` per rigenerare a ogni modifica, avviabile
  anche da `server/avvia.cmd` e `server/avvia.sh`.
- Pannello di amministrazione in `pannello/`, costruito automaticamente a
  partire dallo schema dei campi.
- Accesso al pannello con password unica, hash `scrypt` in
  `server/dati/auth.json`, sessioni in memoria e freno ai tentativi
  (`node server/imposta-password.js`).
- Collaudo del backend senza dipendenze: `node server/autotest.js`.
- Player e chat di Twitch, stato in onda / fuori onda, conto alla rovescia per
  la prossima diretta.
- Accessibilità: contrasti WCAG AA, navigazione da tastiera, skip link,
  landmark ARIA, rispetto di `prefers-reduced-motion`; la pagina resta
  leggibile anche senza JavaScript.
- Documentazione: `docs/PANNELLO.md`, guida per chi aggiorna il sito.

#### Diretta, pollo, tema e testo ricco (seconda fase — `CONTRATTO-2.md`)

- Sezione «diretta» con il player grande, la chat affiancata e la mascotte.
- Il pollo: mascotte interattiva che legge la chat del canale in sola lettura
  via WebSocket anonimo, reagisce allo stato del canale e mostra frasi
  configurabili dal pannello; disattivabile su tre livelli.
- Tema modificabile dal pannello (gruppo «Aspetto»): dodici colori, tre
  caratteri e le misure di base diventano `css/tema.css`, con i token derivati
  calcolati da `server/lib/tema.js` e la polarità che si ribalta da sola sui
  fondi chiari.
- Campi di tipo `ricco`: sottoinsieme di HTML consentito, ripulito in
  generazione da `server/lib/testoricco.js`.
- Caricamento delle immagini dal pannello in `contenuti/media/`, anteprima dal
  vivo delle modifiche non ancora salvate e ripristino dei backup con un clic.
- Controlli d'insieme (`server/lib/controlli.js`): avvertimenti sul documento
  intero, mai errori bloccanti.

#### La modalità lurk (terza fase — `CONTRATTO-3.md`)

- Modalità lurk sotto al player: sorveglia la sessione video e la fa
  ripartire quando il browser la ferma, con tentativi a intervalli crescenti e
  un tetto per caricamento di pagina.
- Spegnimento automatico dopo le ore impostate, con richiesta di conferma:
  scelta deliberata per restare dentro le Community Guidelines di Twitch.
- Collegamento facoltativo con Twitch tramite *implicit grant* in una
  finestrella (`js/ritorno.js`), con il token in `sessionStorage`, la tessera
  del profilo e la revoca vera allo scollegamento.
- Messaggio di lurk in chat, spento di serie, con tetto di tre messaggi per
  caricamento di pagina e non più di uno al minuto.
- Documentazione: `docs/PRESENZA-TWITCH.md`, lo studio su come Twitch conta
  davvero gli spettatori, da cui discende il disegno di tutta questa parte.

### Note

- `RIPRENDI-DOMANI.md` annota il lavoro sospeso il 7 settembre 2026: tre punti
  chiusi e uno ancora aperto lato server. Non è documentazione di rilascio.

[Non rilasciato]: https://github.com/Shadowed1996/Slayer_Beard-Website/compare/main...HEAD
[1.0.0]: https://github.com/Shadowed1996/Slayer_Beard-Website/releases/tag/v1.0.0
