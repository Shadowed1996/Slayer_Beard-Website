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
  Il file finisce in `server/dati/twitch.json`, con permessi ristretti dove il
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

- `README.md`: aggiunti i badge, l'indice della documentazione, le sezioni
  Licenza e Autore. Il resto del documento è rimasto invariato.
- `.gitignore` esteso con le cartelle degli editor e altri file temporanei.
- `.gitignore` esclude anche `server/dati/twitch.json`.
- La Content-Security-Policy accetta due host in piu in `img-src`,
  `clips-media-assets2.twitch.tv` e `clips-media-assets.twitch.tv`: sono le
  anteprime delle clip, e come `static-cdn.jtvnw.net` sono host di sole
  immagini.
- Le opzioni dei campi `scelta` possono essere `{ valore, etichetta }` e non
  solo stringhe secche: nel pannello si legge «Ultimo mese», nei dati resta
  `30`.

### Rimosso

- `RIPRENDI-DOMANI.md`: era l'appunto di un lavoro interrotto a metà, e quel
  lavoro adesso è chiuso. Quello che restava da dire è finito nel README, nel
  CONTRATTO-3 e in questo registro; il resto è nella storia del repository.

### Corretto

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
