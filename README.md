# slayer_beard — sito ufficiale

![Stato](https://img.shields.io/badge/stato-in%20sviluppo-yellow)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2018-339933)
![Dipendenze](https://img.shields.io/badge/dipendenze-nessuna-informational)
![Licenza](https://img.shields.io/badge/licenza-proprietaria-lightgrey)

Sito del canale Twitch [slayer_beard](https://www.twitch.tv/slayer_beard), con dietro un piccolo
CMS per modificarne ogni testo, numero, link, immagine, colore e carattere senza aprire un editor
di codice: si clicca la cosa da cambiare direttamente nell'anteprima del sito.

Due cose da tenere a mente, perché spiegano tutto il resto:

1. **Il sito pubblicato è statico.** `index.html` è un file generato: chi visita il sito non
   scarica nessun JSON e non parla con nessun server. Va bene qualsiasi hosting.
2. **Il server serve solo a chi amministra.** Gira in due modi: sul computer di chi lavora
   (`node server/server.js`, come è sempre stato) oppure su un hosting con Node, dove lo avvia
   `app.js`, per avere il pannello online. Chi visita il sito non lo tocca in nessuno dei due casi.

```
contenuti/contenuti.json   ← la verità: tutti i testi e la configurazione
modelli/index.html         ← la struttura, con i segnaposto {{...}}
        │
        │  node server/genera.js   (oppure il bottone «Pubblica» nel pannello)
        ▼
index.html + js/dati.js + css/tema.css   ← file statici, pronti da caricare online
```

I file generati sono **tre**, non due: dalla configurazione dei colori e dei caratteri nasce
`css/tema.css` esattamente come dai testi nasce `index.html`.

---

## Avvio rapido

Serve **Node.js 18 o superiore** e nient'altro. Nessun `npm install`, nessuna dipendenza.

```bash
node server/imposta-password.js     # solo la prima volta: crea la password del pannello
node server/server.js               # avvia sito e pannello
```

Poi apri:

- **http://localhost:4173** — il sito
- **http://localhost:4173/pannello/** — il pannello di modifica

Su Windows puoi fare doppio clic su `server/avvia.cmd`; su Linux e macOS c'è
`server/avvia.sh`. Tutti e due accettano `--guarda`.

Il sito **non va aperto con doppio clic su `index.html`**: con il protocollo `file://` Twitch
rifiuta di caricare il player, perché pretende un dominio valido nel parametro `parent`. Il
riquadro del player lo spiega da sé e offre un bottone per aprire la diretta su Twitch, ma il
video non parte. Serve un server, anche banale.

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `node server/server.js` | avvia sito + pannello su http://localhost:4173 |
| `node server/server.js --guarda` | idem, e rigenera a ogni modifica di `modelli/`, `contenuti/` o `server/modelli/` |
| `SB_AGGIORNA_MIN=30 node server/server.js` | ogni quanti minuti chiedere a Twitch «Ultima diretta» e le clip: 10 di serie, `0` per non chiedere mai |
| `node server/genera.js` | genera `index.html`, `js/dati.js` e `css/tema.css` e basta, senza avviare niente |
| `node server/imposta-password.js` | crea o cambia la password del pannello |
| `node server/imposta-twitch.js <clientId> <secret>` | scrive `server/dati/chiavi.js`, l'unico file in cui stanno le chiavi (facoltativo, vedi sotto) |
| `node server/imposta-twitch.js --prova` | chiede subito il titolo a Twitch e dice com'è andata, senza scrivere niente |
| `node server/autotest.js` | collaudo: motore dei modelli, convalida, testo ricco, tema, generazione, API, modalità lurk, collegamento con Twitch, vetrina delle clip, schedule |

La porta si cambia con la variabile d'ambiente `SB_PORTA` (per esempio
`SB_PORTA=4174 node server/server.js`). Il collaudo lavora in una cartella temporanea e non
tocca i file del progetto: si può lanciare quando si vuole.

---

## Struttura

```
sito/
├─ index.html            ← GENERATO. Non modificarlo a mano: la prossima
│                          pubblicazione lo riscrive e perdi tutto.
├─ js/
│  ├─ dati.js            ← GENERATO. Configurazione letta dal front-end.
│  ├─ player.js          player Twitch: embed, stato in onda, chat
│  ├─ sito.js            navigazione, conto alla rovescia, schedule (date, segni, eventi), copia email
│  ├─ account.js         il profilo del sito: login con Twitch, tessera, revoca
│  ├─ canale.js          per chi è collegato: stato del canale e titolo dell'ultima diretta
│  ├─ lurk.js            la modalità lurk: sorveglia il video e lo fa ripartire
│  ├─ ritorno.js         la finestrella del login Twitch: consegna il token e si chiude
│  └─ pollo.js           la mascotte: reagisce alla chat (vedi sotto)
├─ css/
│  ├─ tokens.css         valori di partenza: palette, misure, tipografia
│  ├─ tema.css           ← GENERATO dal gruppo «Aspetto»: riscrive i token
│  ├─ base.css           reset, tipografia, bottoni, binario di navigazione
│  ├─ regia.css          la copertina
│  ├─ diretta.css        la sezione del player
│  ├─ sezioni.css        settimana, chi sono, supporto, saluti
│  ├─ player.css         interno del player e della chat
│  ├─ pollo.css          il pollo: posizione, fumetto, animazioni
│  ├─ clip.css           la vetrina delle clip, in fondo alla «diretta»
│  ├─ account.css        la tessera di chi si è collegato con Twitch
│  └─ lurk.css           il pannello della modalità lurk, sotto al monitor
├─ img/                  le immagini fisse: avatar, mascotte, copertina, anteprima
│                        social, favicon, fondale della schedule (capitolo «Le immagini»)
│
├─ contenuti/
│  ├─ contenuti.json     ← LA VERITÀ: testi e configurazione, compresi ordine delle
│  │                       sezioni, stili degli elementi e posizioni dei blocchi
│  ├─ schema.js          descrive i campi: il pannello si costruisce da qui
│  ├─ media/             la libreria del pannello: le immagini caricate e le cinque
│  │                     grafiche del canale già pronte
│  └─ font/              font caricati dal pannello, con elenco.json
├─ modelli/
│  ├─ index.html         la struttura della pagina, con i {{segnaposto}}; le sezioni
│  │                     di <main> le mette la generazione, nell'ordine scelto
│  ├─ parziali/          le sezioni e i pezzi della pagina, con i marcatori data-sb-*
│  │  ├─ lurk.html       il pannello della modalità lurk, dentro «diretta»
│  │  └─ clip.html       la vetrina delle clip, in fondo a «diretta»
│  └─ icone/             le icone SVG, una per file
├─ server/               il CMS: generazione, API, sessioni, backup, media, tema
│  ├─ lib/controlli.js   i controlli d'insieme: avvertimenti, mai errori
│  ├─ lib/chiavi.js      LE CHIAVI: un file solo, e da lì le prende tutto
│  ├─ lib/twitch.js      l'unico punto in cui il server locale chiama Twitch
│  ├─ lib/font.js        i font caricati: formato, limite di 2 MB, elenco, dove sono usati
│  ├─ modelli/chiavi.esempio.js  il modello da copiare, con le istruzioni
│  └─ dati/              password del pannello e chiavi.js. Non si carica
│                        online e non sta nel controllo di versione.
├─ pannello/             l'interfaccia di amministrazione: l'editor unico
│  ├─ index.html         barra alta, pannello laterale, anteprima al centro
│  ├─ pannello.js        la base: accesso, bozza, Salva, Pubblica, convalida
│  ├─ editor/            i moduli dell'editor: guscio, ponte, motore (anteprima,
│  │                     selezione, blocchi), contenuti, stile, parti, nomi, impostazioni
│  ├─ condivisi/stili.js il generatore degli stili e delle posizioni, lo stesso file
│  │                     per il pannello e per il server
│  ├─ condivisi/orari.js le regole della schedule: limiti, forma pulita, errori, fusi
│  │                     orari. Anche lui un file solo per pannello e server
│  └─ moduli/            i mattoni comuni: API, campi dallo schema, testo ricco, media
│                        (con la riduzione in WebP), backup, l'editor della schedule
├─ app.js                il file d'avvio per un hosting con Node: fuso, porta e
│                        indirizzo dall'ambiente, poi lo stesso server di server/
├─ package.json          avvio e metadati (`npm start`), zero dipendenze
├─ .htaccess             regole del server web: nega server/ e i file di lavoro,
│                        compressione, cache, intestazioni di sicurezza
├─ robots.txt            tutto permesso tranne /pannello/ e /api/
├─ docs/HOSTING.md       la guida della messa online, passo per passo
├─ docs/PANNELLO.md      guida per chi amministra il sito
├─ docs/PRESENZA-TWITCH.md  studio su presenza, lurk e login Twitch: come Twitch conta
│                           davvero gli spettatori, e cosa consente il regolamento
├─ CONTRATTO.md          le regole con cui è stato costruito
├─ CONTRATTO-2.md        l'addendum della seconda fase: diretta, pollo, tema, testo ricco
├─ CONTRATTO-3.md        l'addendum della terza fase: la modalità lurk
├─ CONTRATTO-4.md        l'addendum della quarta fase: l'editor unico del pannello
├─ CONTRATTO-5.md        l'addendum della quinta fase: la schedule rifatta e le grafiche nuove
├─ CONTRATTO-6.md        l'addendum della sesta fase: il sito pronto per un hosting con Node
└─ Cattura.PNG           cattura della pagina del canale su Twitch — banner, riquadro
                         fuori onda, handle social. Non è un'anteprima di questo sito.
```

Le sezioni della pagina, nell'ordine di partenza: **regia** (la copertina), **diretta** (il player,
grande, con la chat e il pollo accanto, e in fondo la vetrina delle clip), **settimana**, **chi
sono**, **supporto**, **saluti**. Dal pannello si possono riordinare e nascondere (la copertina
resta sempre prima e accesa); il binario laterale e il piede ci sono sempre. Il binario ha una
voce per ogni sezione accesa, quindi al massimo sei — e resta a sei: la vetrina delle clip sta
dentro «diretta» proprio per non chiederne una settima, che sotto i 400 px non ci starebbe. Ci si
arriva da un bottone in testa a «diretta», non dal binario.

La versione precedente del sito è conservata fuori dal repository, in una cartella locale
`sito-backup/`: serve solo come riferimento storico, non è collegata a niente.

---

## Modificare il sito

### Il modo normale: il pannello

Avvia il server, apri **http://localhost:4173/pannello/**, entra con la password, modifica.
La prima volta, se la password non c'è ancora, il pannello la fa creare lui.

Il pannello è un **editor unico**, sul modello di quelli per costruire siti: l'anteprima del sito
sta al centro, e si clicca direttamente la cosa da cambiare. A sinistra un pannello laterale,
largo quanto vuoi, mostra i controlli dell'elemento scelto in tre schede:

- **Contenuto** — il testo (che si scrive anche direttamente sulla pagina, con doppio clic),
  l'immagine, i dati di una parte (social, listino, schedule della settimana, pollo, lurk,
  clip, profilo), l'interruttore di una sezione;
- **Stile** — font, dimensione, colori (anche collegati ai colori del tema), sfondo, spazi,
  bordi, bagliore, opacità, **diversi per Telefono, Tablet e Computer**;
- **Avanzate** — nascondere un elemento su un dispositivo, larghezza massima, **posizione dei
  blocchi**, che si trascinano dentro la loro sezione.

Le sezioni si riordinano e si nascondono dal Navigatore (il menu laterale del sito le segue da
solo), e dal menu ☰ si arriva a colori, combinazioni pronte e font del sito — **anche caricati
dal computer** —, alla libreria delle immagini, alle copie di sicurezza e al cambio della
password. Ci sono Annulla e Ripeti, la ricerca dei campi con `Ctrl+K`, e sugli schermi stretti il
pannello diventa un cassetto.

Ci sono due bottoni distinti, e la differenza conta:

- **Salva** scrive in `contenuti/contenuti.json`. Il sito pubblicato **non cambia**. Puoi
  salvare venti volte e pensarci su.
- **Pubblica** rigenera `index.html`, `js/dati.js` e `css/tema.css`. Da quel momento il sito
  è cambiato.

L'anteprima nel pannello mostra anche le modifiche **non ancora salvate**: la pagina viene resa
al volo dal server e buttata via, senza toccare niente sul disco. È la pagina **senza il
JavaScript del sito** — dentro l'editor il player di Twitch sarebbe una seconda sessione video
della stessa persona, e il pollo aprirebbe una connessione alla chat a ogni ricarica — quindi lì
non ci sono player né chat: testi, immagini, colori, stili e posizioni si vedono invece come sul
sito.

Prima di pubblicare, ogni pubblicazione mette una copia dei file in `server/backup/` (i tre file
generati più `contenuti.json`), e dal pannello si torna indietro con un clic. La guida completa,
limiti compresi, è in [`docs/PANNELLO.md`](docs/PANNELLO.md).

### Il modo diretto: a mano

Apri `contenuti/contenuti.json`, cambia quello che ti serve, poi `node server/genera.js`.
È lo stesso identico risultato: il pannello non fa altro che scrivere in quel file.

### Aggiungere un campo nuovo al sito

Tre passi, in tre file diversi:

1. aggiungi la chiave in `contenuti/contenuti.json` con il suo valore;
2. aggiungi il segnaposto `{{la.tua.chiave}}` dove serve, in `modelli/`;
3. descrivi il campo in `contenuti/schema.js` (etichetta, tipo, aiuto).

Il pannello lo mostrerà da solo: non si tocca una riga di `pannello/`. Se salti il terzo passo,
il controllo di copertura te lo dice all'avvio invece di lasciartelo scoprire fra sei mesi.

Perché il testo **si possa cliccare nell'anteprima**, c'è un quarto passo facoltativo: sull'elemento
che contiene solo quel segnaposto aggiungi `data-sb-testo="la.tua.chiave"`, in coda al tag. Senza,
il campo si cambia lo stesso, dall'elenco *Testi che non si vedono in pagina* della sua sezione. I
marcatori `data-sb-*`, le parti, i blocchi e le altre regole dell'editor sono in
[`CONTRATTO-4.md`](CONTRATTO-4.md); la mappa dei file è nell'ultimo capitolo di
[`docs/PANNELLO.md`](docs/PANNELLO.md).

I tipi di campo sono: `testo`, `testolungo`, `ricco`, `url`, `email`, `numero`, `immagine`,
`orario`, `orari`, `scelta`, `colore`, `font`, `interruttore`, `elencoTesti`, `elenco`.

### I tre rami dell'editor

Tre rami di `contenuti.json` non hanno un campo nello schema, perché li scrive l'editor con
controlli suoi: `config.sezioni` (ordine e visibilità delle sezioni), `config.stili` (lo stile di
ogni elemento, per dispositivo) e `config.disposizione` (le posizioni dei blocchi). Sono elencati in
`EDITOR` dentro `contenuti/schema.js`, saltati dalla copertura come `GENERATI`.

Il CSS che ne esce lo scrive **un solo file**, `pannello/condivisi/stili.js`, usato sia dal pannello
per l'anteprima sia dal server per la pagina pubblicata: anteprima e sito non possono dire due cose
diverse. Nella pagina finisce in `<style id="sb-disposizione">` e `<style id="sb-stili">`, e solo se
c'è qualcosa da scrivere. Il server ripulisce i tre rami prima di convalidarli: un valore storto si
scarta, non blocca il salvataggio del resto. Con i valori di partenza la pagina generata è identica a
quella di prima dell'editor, a parte gli attributi `data-sb-*` e `font-src 'self'` nella CSP.

### La schedule, vista dal codice

La sezione «La settimana» nasce da un campo solo, **«Schedule della settimana»** (`config.orari`,
tipo `orari`), che nel pannello ha un editor tutto suo: `pannello/moduli/settimana.js`. Dentro ci
sono i giorni di diretta con ora, durata e fuso di serie, sette schede (una per giorno, 0 =
domenica), fino a otto eventi speciali con una data e il fondale della sezione.

Le regole — limiti, forma pulita, messaggi d'errore, conti con i fusi orari e l'ora legale — stanno
in **un file solo**, `pannello/condivisi/orari.js`, che usano sia il pannello per gli errori accanto
alle caselle sia il server per convalidare e generare: il pannello non può accettare una nota che il
salvataggio poi rifiuta. Come i tre rami qui sopra, `config.orari` si salva **in blocco**: con la
fusione chiave per chiave un evento cancellato nel pannello rinascerebbe dal file salvato.

Come si usa è nel capitolo *La schedule della settimana* qui sotto; il modello dei dati con i suoi
limiti, cosa arriva alla pagina e a `js/dati.js` e la compatibilità con il formato di prima sono
nell'ultimo capitolo di [`docs/PANNELLO.md`](docs/PANNELLO.md).

### Testo con grassetto, corsivo e link

I campi di tipo `ricco` accettano un po' di HTML: `b strong i em u s br small mark sup sub code`,
`abbr[title]`, `span[class]` con classe `evidenza`, `tenue` o `mono`, e `a[href,title]` verso
`http`, `https`, `mailto` o un percorso interno. **Tutto il resto viene tolto in generazione** da
`server/lib/testoricco.js`: il tag sparisce, il testo dentro resta, e i `<` avanzati diventano
`&lt;`. I link verso l'esterno ricevono `target="_blank" rel="noopener noreferrer"`.

Restano testo semplice, senza HTML, tutte le chiavi che finiscono dentro un attributo o dentro
`js/dati.js`: lì il markup non verrebbe interpretato, verrebbe stampato.

---

## La schedule della settimana

La sezione «La settimana» mostra i sette giorni come **locandine**: i giorni di diretta con ora,
titolo, gioco, una nota e, se vuoi, un'immagine; i giorni di riposo come strisce strette e spente.
Sotto il nastro possono comparire gli **eventi speciali** — una maratona, una serata fuori
programma — ognuno con la sua data, e dietro tutta la sezione c'è un **fondale**, un'immagine
sfumata ai bordi e velata. Dagli stessi dati nascono il conto alla rovescia della copertina e gli
orari scritti nella pagina.

Si cambia tutto dal pannello, senza aprire file. Gli orari sono sempre quelli del fuso del canale
(di serie `Europe/Rome`); chi guarda da un altro fuso vede sotto l'ora anche la sua, con «Da te»
davanti.

### Aprire l'editor

1. Avvia il server e apri **http://localhost:4173/pannello/** (capitolo *Avvio rapido*).
2. Nell'anteprima scendi alla sezione «La settimana» e **clicca un giorno**. Il pannello a sinistra
   apre l'editor della schedule proprio su quel giorno. Un clic su un evento speciale apre
   quell'evento.

Ci si arriva anche in altri due modi: clicca il riquadro delle spie nella copertina e premi
**Modifica la schedule**, oppure premi `Ctrl+K` e scrivi «schedule».

In cima all'editor c'è un **riepilogo**: quante dirette a settimana, ora e durata di serie, fuso,
eventi in arrivo, e i sette giorni in miniatura (un clic su un giorno lo apre). Sotto ci sono tre
linguette: **Settimana**, **Eventi speciali** e **Fondale**.

### Cambiare giorni e orari: linguetta «Settimana»

1. In alto ci sono **Ora di serie** (scritta come `21:00`), **Durata di serie** (in ore, a passi di
   mezz'ora: `4`, `2,5`) e **Fuso orario**. Valgono per ogni giorno che non ha un orario suo.
2. Sotto ci sono i sette giorni, da lunedì a domenica. L'**interruttore** accanto al nome accende o
   spegne la diretta di quel giorno.
3. Clicca il nome di un giorno acceso per aprire la sua scheda. Se ne apre uno alla volta.
   - **Ora di inizio** e **Durata (ore)**: lasciale vuote e valgono quelle di serie (le caselle vuote
     te le ricordano). Scrivile solo se quel giorno è diverso. L'ora si può battere anche come
     `2130`: uscendo dalla casella diventa `21:30`. Sotto, una riga rilegge il risultato, per esempio
     «In onda dalle 21:00 alle 01:00 del giorno dopo · 4 h».
   - **Titolo** (fino a 40 caratteri), **Gioco** (40) e **Nota** (120): facoltativi, su una riga
     sola, con il contatore.
   - **Immagine di sfondo**: la locandina di quel giorno (qui sotto).
4. **Salva**, guarda l'anteprima, **Pubblica**.

Un giorno spento **tiene la sua scheda**: sul sito non si vede niente di suo, ma riaccendendolo
ritrovi titolo, gioco, nota e immagine com'erano.

Se una casella è sbagliata — un'ora come `25:00`, una durata di 30 ore — l'errore compare accanto
alla casella appena ne esci, la riga del giorno dice quanti errori ha, e il salvataggio non passa
finché non li correggi.

### Aggiungere un evento speciale: linguetta «Eventi speciali»

Un evento è una diretta **fuori programma con una data precisa**.

1. Premi **Aggiungi evento**. Nasce già aperto, con la data di oggi e l'ora e la durata di serie.
2. Scrivi il **Titolo** (obbligatorio, fino a 40 caratteri) e sistema **Data**, **Ora di inizio** e
   **Durata (ore)** (fino a 72 ore, a passi di mezz'ora). Se vuoi aggiungi **Gioco** (40), **Nota**
   (160) e un'immagine.
3. **Salva** e **Pubblica**.

Sul sito l'evento compare sotto il nastro, con la data grande e l'etichetta «Speciale»; se cade in
uno dei giorni che il nastro sta mostrando, anche quel giorno prende lo stesso segno. Il conto alla
rovescia della copertina lo conta come una diretta: se viene prima della prossima serata normale,
conta verso l'evento.

Gli eventi sono **al massimo otto**. Un evento **finito** resta nel pannello, in fondo all'elenco
sotto «Passati», ma dal sito **sparisce da solo**, anche senza ripubblicare. Per fare posto a uno
nuovo si elimina un evento passato con **Elimina evento**, che chiede conferma.

### Mettere un'immagine di sfondo

Il **blocco immagine** è lo stesso in tre posti: nella scheda di un giorno, in un evento e nella
linguetta **Fondale**, che è l'immagine dietro tutta la sezione.

1. Apri il giorno, l'evento o la linguetta **Fondale**.
2. Scegli l'immagine in uno di tre modi:
   - **Scegli dalla libreria** — le immagini già caricate, comprese le cinque grafiche del canale
     che ci sono di partenza (capitolo *Le immagini*);
   - **Carica dal computer** — un file PNG, JPG, WEBP o SVG;
   - **trascina un file** direttamente sul riquadro dell'immagine.
3. Sistema il **punto di fuoco** e il **Velo** (per il fondale, l'**Intensità**): qui sotto cosa
   sono. Quello che cambi si vede subito anche nell'anteprima.
4. **Salva** e **Pubblica**.

**Togli** toglie l'immagine da quel posto; il file resta nella libreria. Una locandina senza
immagine sul sito si disegna lo stesso, con un tratto della città notturna e il nome del giorno in
filigrana.

Non serve preparare la foto prima: una foto grande **il pannello la rimpicciolisce e la converte in
WebP da solo**, prima di caricarla (capitolo *Le immagini*).

### Il fuoco, il velo e l'intensità

- **Il fuoco** è il punto dell'immagine che deve restare **sempre in vista**. La stessa immagine sul
  computer riempie una locandina verticale e sul telefono una fascia orizzontale: qualcosa si taglia
  per forza, e il fuoco dice che cosa tenere — una faccia, una scritta. Si sceglie cliccando o
  trascinando sull'immagine, dove compare un mirino; da tastiera con le frecce (`Maiusc` + frecce
  per passi di 10) e con `Inizio` o il bottone **Centra** per tornare al centro. Accanto, due
  ritagli piccoli, **Computer** e **Telefono**, fanno vedere che cosa resta in vista sull'uno e
  sull'altro. Un'immagine appena scelta riparte sempre dal centro.
- **Il velo** (giorni ed eventi, da 30 a 90, di serie 60) è quanto si scurisce l'immagine sotto le
  scritte. Più velo vuol dire testo più leggibile e immagine più scura; le scritte restano leggibili
  anche al minimo, perché hanno una sfumatura loro.
- **L'intensità** (solo il fondale, da 0 a 100, di serie 30) è quanto si vede il fondale dietro la
  sezione. A **0 è spento**: sul sito l'immagine non viene nemmeno scaricata, e la linguetta dice
  «Spento».

### Cosa vedi nell'anteprima, e cosa no

L'anteprima del pannello mostra la sezione con giorni, orari, titoli, immagini, eventi e fondale, e
il giorno o l'evento che hai aperto ha un contorno ciano. Non mostra le **date** sui giorni, i segni
**Oggi**, **Prossima** e **In onda** e l'ora di chi guarda: li aggiunge il JavaScript del sito mentre
gira, e nell'anteprima il JavaScript del sito non c'è (capitolo *Modificare il sito*). Per vederli,
**Pubblica** e apri il sito.

La guida completa dell'editor, con tutti i casi, è nel capitolo 11 di
[`docs/PANNELLO.md`](docs/PANNELLO.md).

---

## I controlli d'insieme

`server/lib/controlli.js` guarda il documento **intero** e stampa avvertimenti —
mai errori, non blocca niente. Esiste perché la convalida guarda un campo per
volta, e nessun campo preso da solo è sbagliato quando l'indirizzo di ritorno del
login punta a `localhost` mentre il sito sta su `slayerbeard.com`: sono due valori
leciti che insieme fanno un login rotto per tutti i visitatori.

Li stampano `node server/genera.js` in fondo alla generazione e l'avvio del
server; il pannello li mostra subito dopo aver pubblicato, in un avviso che non
scade. Coprono esattamente la lista qui sotto — che finora esisteva solo in
prosa, in questo file, e la prosa non parla.

---

## Cose da fare quando il sito va online

La guida della messa online è **[`docs/HOSTING.md`](docs/HOSTING.md)**: cosa caricare e dove, i
campi da compilare nel pannello dell'hosting, le variabili d'ambiente una per una, il primo accesso
al pannello online e il dominio, che adesso si sa: **`slayerbeard.com`**, senza `www`. Qui sotto
restano le cose che si fanno da questa parte, prima di caricare.

1. **Domini di Twitch.** Nel pannello, menu ☰ → «Canale, contatti e immagini», aggiungi il
   dominio del sito **con e senza `www`**: `slayerbeard.com` e `www.slayerbeard.com`, che per
   Twitch sono due nomi diversi. `localhost`, `127.0.0.1` e l'indirizzo da cui la pagina è
   davvero aperta ci sono sempre — li dichiara il sito da sé — quindi questa lista è la rete di
   sicurezza, non l'unica cosa che tiene in piedi il player. Se l'indirizzo del sito arriva dalla
   variabile `SB_SITO` invece che dal campo del pannello, quei due nomi li mette da sé la
   pubblicazione; se è scritto nel pannello — com'è adesso — vanno scritti a mano.
2. **Indirizzo pubblico del sito.** Nella stessa vista, ed è **`https://slayerbeard.com`**:
   riempie il `<link rel="canonical">` e l'`og:url`. Lasciato vuoto, la pagina usa `./` e funziona
   lo stesso, ma le anteprime social sono più fragili. I testi delle anteprime stanno in menu ☰ →
   «Google e social». Su un hosting con Node lo stesso indirizzo si può passare con la variabile
   `SB_SITO`, senza scriverlo nel pannello: se il campo è pieno, vince il campo. Vedi
   [`docs/HOSTING.md`](docs/HOSTING.md).
3. **«Ultima diretta», se vuoi che si aggiorni da sé.** È facoltativo e si fa una volta sola:
   `node server/imposta-twitch.js <clientId> <clientSecret>`, con le due chiavi di un'app
   registrata su [dev.twitch.tv](https://dev.twitch.tv/console/apps) — può essere la stessa del
   «Profilo del sito». Da quel momento ogni **Pubblica** chiede a Twitch il titolo dell'ultima
   diretta e lo scrive nei contenuti, così è fresco anche per chi visita il sito senza collegare
   nessun account. Senza, quel campo resta una casella da riempire a mano, e il sito funziona
   esattamente come prima. Il capitolo qui sotto spiega il resto.
4. **Pubblica**, poi **carica online**. Cosa si carica dipende da che cosa vuoi online, e le due
   risposte sono molto diverse.

   **Il sito da solo**, con il pannello che resta sul computer di chi lavora: i tre file generati
   — `index.html`, `js/dati.js` e **`css/tema.css`** — più `css/`, `js/`, `img/`,
   **`contenuti/media/`** se il sito usa un'immagine della libreria (una caricata dal pannello, o
   una delle grafiche del canale scelta per un giorno, un evento o il fondale) e
   **`contenuti/font/`** se hai caricato font (bastano i file dei font: `elenco.json` serve solo
   al pannello). Qui `server/`, `pannello/` e `modelli/` non servono, e su un hosting pubblico
   **è meglio non caricarli affatto**.

   **Il sito con il pannello online**: si carica **il progetto intero** — `app.js`,
   `package.json`, `.htaccess`, `robots.txt`, i tre file generati, `css/`, `js/`, `img/`,
   `contenuti/`, `modelli/`, `pannello/` e `server/`. `modelli/` in particolare **serve davvero**:
   ogni «Pubblica» rigenera la pagina da lì e da `contenuti/contenuti.json`, e senza quei file il
   bottone non ha da dove ripartire. Le due sole eccezioni, che non si caricano mai, sono
   **`server/dati/`** (la password del pannello e le chiavi di Twitch) e **`server/backup/`**.

   Attenzione, in tutti e due i casi: i file generati sono tre — `index.html`, `js/dati.js` e
   **`css/tema.css`**. Se carichi solo l'HTML, il sito online resta con i colori e i caratteri di
   `tokens.css` e non si capisce perché. E se l'hosting aggiunge una Content-Security-Policy sua,
   deve permettere i font del sito stesso (`font-src 'self'`), come fa quella della pagina.

Per il **solo sito** va bene qualsiasi hosting statico — Netlify, Vercel, GitHub Pages, un FTP —
perché è HTML e basta. Per avere **anche il pannello online** ci vuole un hosting con Node, ed è
quello scelto: i passi, uno per uno, stanno in [`docs/HOSTING.md`](docs/HOSTING.md), comprese le
cose da non caricare mai e come mettere al riparo quello che resta.

### Cosa cambia per chi lavora in locale

Per l'hosting sono arrivati tre pezzi, e nessuno dei tre cambia il modo di lavorare qui:

- **`app.js`**, nella radice, è il file d'avvio dell'hosting: imposta il fuso `Europe/Rome`, ascolta
  su tutte le interfacce e sulla porta che gli passa l'hosting, e avvia lo stesso server di
  `server/server.js`, con le stesse rotte e lo stesso pannello. In locale
  `node server/server.js` resta quello di sempre, su `127.0.0.1:4173`; per provare l'avvio
  dell'hosting sul proprio computer basta `PORT=4288 SB_HOST=127.0.0.1 node app.js`.
- **`package.json`** c'è per l'avvio e i metadati: `npm start` lancia `node app.js`, e ci sono gli
  script per generare e per il collaudo. **Nessuna dipendenza e nessun `npm install`**: la regola
  del progetto non è cambiata.
- **Le impostazioni stanno in variabili d'ambiente**, tutte facoltative: senza nessuna di esse il
  progetto si comporta come prima. `PORT` e `SB_PORTA` per la porta, `SB_HOST` per l'indirizzo di
  ascolto, `SB_DATI` e `SB_BACKUP` per tenere le chiavi e i backup fuori dalla cartella pubblica,
  `SB_SITO` per l'indirizzo del sito. L'elenco completo, con un esempio, è in `.env.esempio` e
  spiegato riga per riga in [`docs/HOSTING.md`](docs/HOSTING.md).

---

## Le chiavi: un file solo

Tutto quello che è una chiave sta in **`server/dati/chiavi.js`**, e da lì lo prende chiunque ne
abbia bisogno. Prima erano sparse — il Client ID nel pannello e quindi in `contenuti.json`, e di
nuovo insieme al secret in un file per il server — e due copie dello stesso valore sono due cose
che prima o poi smettono di essere d'accordo.

```js
module.exports = {
  twitch: {
    clientId: '...',      // pubblico per natura: finisce nella pagina
    clientSecret: '...'   // segreto: non esce mai da server/
  }
};
```

Si scrive in due modi, a scelta:

```bash
node server/imposta-twitch.js <clientId> <clientSecret>
```

oppure a mano, copiando **`server/modelli/chiavi.esempio.js`** in `server/dati/chiavi.js`: è un
normale file JavaScript, con le istruzioni dentro.

**È un `.js` e non un `.json` apposta**: un file di configurazione che si compila a mano ha
bisogno di commenti, e JSON non li ammette — senza, chi lo apre fra sei mesi trova due stringhe
vuote e nessuna idea di cosa infilarci. Il prezzo è che il file viene eseguito, quindi
`server/lib/chiavi.js` controlla la forma di quello che esporta invece di fidarsi: un file che
esporta un numero, un elenco o niente viene detto, non lasciato scoprire tre funzioni più in là.

### Dove finisce ciascuna delle due

| | Dove arriva | Perché |
|---|---|---|
| `clientId` | fino dentro `index.html` | Il browser deve mandarlo a Twitch per il login: è pubblico per natura |
| `clientSecret` | **da nessuna parte** | Serve solo al server locale per prendere un app token |

Alla pubblicazione il Client ID viene **copiato da sé** nel campo del pannello e quindi nella
pagina. Il campo resta visibile — così vedi qual è — ma non è più una cosa da scrivere due volte:
lo riscrive ogni pubblicazione. Se `chiavi.js` non c'è, quel campo resta quello che hai scritto a
mano e non cambia niente: chi non usa `chiavi.js` non si accorge che esiste.

Il collaudo verifica tutte e tre le cose che contano: che il Client ID arrivi davvero fino ai
contenuti, che **non** venga svuotato quando il file manca, e che il secret non compaia in nessuno
dei tre file generati.

### Cosa non c'è dentro, e perché

**La password del pannello.** Non è una chiave da copiare: è un hash `scrypt` che scrive
`node server/imposta-password.js`, e sta in `server/dati/auth.json`. Metterla in un file che si
apre con l'editor sarebbe un invito a scriverla in chiaro.

### Modificarlo a server acceso

Si può. `server/lib/chiavi.js` butta la cache di `require` prima di ogni lettura, quindi una
chiave cambiata vale dal giro successivo — dieci minuti al massimo — senza riavviare niente.

> **`server/dati/` non si carica online e non sta nel controllo di versione.** Il `.gitignore`
> esclude sia `chiavi.js` sia `auth.json`, e il collaudo controlla che continui a farlo. Il
> modello `chiavi.esempio.js` invece sta nel repository apposta, ed è vuoto: un modello con dentro
> una chiave vera sarebbe una chiave vera nel repository, e anche questo è una prova del collaudo.

---

## «Ultima diretta» che si aggiorna da sé

Il campo *Ultima diretta*, nella copertina, era una casella da riempire a mano — e nessuno la
riempiva. Adesso ha **due sorgenti**, e nessuna delle due è obbligatoria:

1. **Chi si è collegato col profilo del sito** lo vede aggiornarsi da solo dopo pochi secondi:
   `js/canale.js` chiede a Twitch `helix/streams` e `helix/videos` col token di quella persona,
   un giro ogni due minuti, solo a pagina visibile. Non richiede niente da configurare oltre al
   Client ID del gruppo «Profilo del sito».
2. **Tutti gli altri** — cioè la quasi totalità di chi passa — vedono quello che c'era scritto
   in `contenuti.json` al momento della pubblicazione. Perché lì dentro ci sia il titolo giusto,
   il **server locale** lo chiede a Twitch **prima di generare**, con le chiavi di
   `server/dati/chiavi.js`.
3. **E senza che nessuno prema niente**: finché `node server/server.js` gira, ogni dieci minuti
   rifà da sé lo stesso lavoro e, se il titolo è cambiato, ripubblica. È la sorgente che serve
   davvero, perché la seconda dipende da qualcuno che si ricordi di pubblicare — ed è esattamente
   quello che non succede.

Si configura una volta:

```bash
node server/imposta-twitch.js <clientId> <clientSecret>
node server/imposta-twitch.js --prova     # controlla che funzioni
```

Le due chiavi stanno su [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps), nella
scheda dell'applicazione: il Client ID è lo stesso che si mette nel pannello, il secret si genera
lì con *New Secret*. Il file si toglie con `--togli`, e allora il campo torna a essere una casella
da riempire a mano.

### L'aggiornamento automatico, e la regola che non scavalca

Finché il server locale gira fa un giro ogni **dieci minuti** (`SB_AGGIORNA_MIN`, `0` per
spegnerlo) e, quando trova qualcosa di nuovo, **ripubblica da sé**. Vale sia per «Ultima diretta»
sia per la vetrina delle clip.

Non è un secondo modo di pubblicare: è lo stesso, chiamato da un timer invece che da un bottone.
E proprio per questo non può scavalcare la regola su cui è costruito tutto il resto — **Salva e
Pubblica sono due cose diverse**, e chi ha salvato una bozza senza pubblicarla l'ha fatto apposta.
Quindi il giro automatico guarda **prima** se il sito pubblicato è già allineato alla bozza:

- **se lo è**, rigenera — l'unica differenza sarà il titolo fresco;
- **se non lo è**, aggiorna solo `contenuti.json` e lascia la pubblicazione a te, dicendolo in
  console.

In modalità `--guarda` la distinzione è già sospesa di suo (lì qualunque salvataggio rigenera, ed
è dichiarato), quindi il giro automatico non rigenera una seconda volta: ci pensa la sorveglianza.

Se Twitch non risponde, il giro lo scrive e riprova al giro dopo. Il server non si ferma, e il
valore che c'era resta dov'era.

> **Il sito online è un'altra cosa.** Questo tiene fresca la copia sul computer dove gira il
> server. Se il sito sta su un hosting esterno, i file generati vanno comunque caricati: finché
> non c'è un passo di caricamento automatico, «si aggiorna da solo» vuol dire «in locale si
> aggiorna da solo, e quando carichi porti su l'ultimo».

**Il client secret non si mette da nessun'altra parte.** Non nel pannello, non in
`contenuti.json`, non nel sito generato: sta in `server/dati/chiavi.js` accanto alla password del
pannello, è escluso dal controllo di versione, e `server/` non si carica online. Il token che il
server ne ricava è un *app token* (`client_credentials`): non appartiene a nessuna persona, non
legge niente di privato e non può scrivere in chat. Il CONTRATTO-3 §4.3 diceva che il secret «non
deve esistere» — resta vero per il browser, ed è discusso nel §4.6 dello stesso documento.

**Se Twitch non risponde non succede niente.** La pubblicazione va avanti, il titolo che c'era
resta dov'era, e il pannello lo dice in un avviso invece di lasciar credere che si sia aggiornato.
Vale anche per il caso opposto: se Twitch risponde ma non ha nessun titolo da dare — un canale
senza VOD, per esempio — il campo **non** viene svuotato.

Il titolo che si prende è quello dell'ultimo VOD (`helix/videos?type=archive`), cioè quello che
c'era scritto *durante* l'ultima diretta. I VOD però scadono — sette giorni per gli affiliati — e
chi li tiene spenti non ne ha nessuno: in quel caso si ripiega su `helix/channels`, che dà il
titolo **attuale** del canale, quello che si vedrà alla prossima accensione. È un ripiego, non un
equivalente, ed è comunque meglio di un campo fermo a mesi fa.

---

## Follower e abbonati che si aggiornano da sé

I numeri del canale — i follower nella copertina e in «Chi sono», gli abbonati in «Chi sono» —
erano scritti a mano e invecchiavano come «Ultima diretta». Adesso li chiede a Twitch lo stesso
server, negli stessi momenti: a ogni Pubblica e, col server acceso, ogni dieci minuti.

C'è però un passo in più. L'app token che basta per il titolo e le clip **qui non basta**: Twitch
dà il totale dei follower solo a un token di una persona, e gli abbonati solo al **proprietario
del canale** con il permesso `channel:read:subscriptions`. Quindi slayer_beard autorizza il server
**una volta sola**:

```bash
node server/imposta-twitch.js <clientId> <clientSecret>   # se non l'hai già fatto
node server/imposta-twitch.js --collega
```

Il comando stampa un codice: si apre [twitch.tv/activate](https://www.twitch.tv/activate) **con
l'account del canale**, si inserisce il codice e si accetta. Il server salva l'autorizzazione in
`server/dati/twitch-accesso.json` e da lì fa tutto da sé. `--prova` ora controlla anche i numeri;
`--scollega` toglie l'autorizzazione.

Cosa viene riscritto, e cosa no:

- `config.dati.follower` e `config.dati.abbonati`, sempre;
- nessuna casella di testo: i follower in copertina la pagina li stampa da `config.dati.follower`,
  e gli abbonati oggi non compaiono in pagina (i tre numeri di «Chi sono» sono stati tolti) e restano
  solo in `config.dati.abbonati`. Il meccanismo che riscrive una casella **solo se contiene un numero
  e nient'altro** c'è ancora, con l'elenco `CAMPI_NUMERI` di `server/lib/twitch.js` vuoto.

Le regole sono quelle di tutto il resto: **non lancia mai e non svuota mai**. Se Twitch non
risponde, o nega gli abbonati, restano i numeri che c'erano e il resoconto lo dice.

> **L'autorizzazione scade se il server resta spento a lungo.** Twitch sostituisce il refresh
> token a ogni rinnovo e lascia scadere quello non usato dopo 30 giorni. Col server acceso si
> rinnova da sé ogni quattro ore; se resta spento più a lungo, il resoconto dice di rifare
> `--collega`, e nel frattempo i numeri restano quelli dell'ultima volta.

**Il file dell'autorizzazione è un segreto come `chiavi.js`.** Sta in `server/dati/`, è escluso dal
controllo di versione, non finisce nei file generati (una prova del collaudo lo verifica) e dà
accesso **soltanto** alla lettura degli abbonati: non può scrivere in chat né cambiare niente del
canale. La deroga è motivata nel CONTRATTO-3, §4.7.

---

## La vetrina delle clip

In fondo alla sezione «diretta», sotto al riquadro del lurk, può comparire una griglia con le
clip più viste del canale: anteprima, durata, visualizzazioni, data e nome di chi l'ha ritagliata.

**È tutta statica.** Nessun `id` è contratto con del JavaScript, e senza JS funziona per intero:
l'elenco viene stampato dentro `index.html` alla pubblicazione, non caricato dal browser. Il sito
pubblicato resta quello che era — HTML che non parla con nessuno — e in cambio la vetrina
invecchia fra una pubblicazione e l'altra invece di aggiornarsi in tempo reale. Per un canale che
va in onda quattro sere a settimana è lo scambio giusto.

**Non ha una voce nel binario, ed è voluto.** `css/base.css` stringe il dock finché *sei*
etichette ci stanno anche a 320 px, e la settima le farebbe traboccare: il commento che lo spiega
è lì da quando il dock è nato. Le clip sono l'archivio di quello che succede nel monitor lì
sopra, quindi stanno dentro la stessa sezione invece di chiederne una propria. Una prova del
collaudo controlla che le voci restino sei.

**Al posto della voce nel dock c'è un bottone in testa alla «diretta».** `.clip__vai` in
`modelli/parziali/diretta.html` è un'ancora verso `#clip`, l'id della vetrina: funziona col
JavaScript spento, si stampa con la stessa condizione della vetrina — `clip.attivo` nel contesto
è già «acceso **e** almeno una clip», perché un bottone verso un'ancora inesistente porta in cima
alla pagina e non lo spiega a nessuno — e porta l'etichetta di `clip.titolo`, la chiave che si
scrive nel pannello, invece di una settima stringa da tenere d'accordo con la prima. Senza, la
vetrina la trovava solo chi scorreva fino in fondo a una sezione lunga.

**Serve il collegamento con Twitch** (`node server/imposta-twitch.js`, capitolo qui sopra): è lo
stesso app token che aggiorna «Ultima diretta». Senza, la vetrina resta spenta e nel pannello si
può accendere quanto si vuole senza che compaia niente — non ci sarebbe niente da mostrare.
Quel caso non resta muto: `server/lib/controlli.js` lo dice fra gli avvertimenti d'insieme —
interruttore acceso ed elenco ancora vuoto vuol dire «pubblica una volta», ed è la generazione
che va a prendere le clip.

Dal pannello — si clicca la vetrina nell'anteprima, parte **«Le clip»**; da spenta si accende
dalla sezione «La diretta» — si scelgono tre cose: se mostrarla, **quante** clip (da 1 a
12) e **di quale periodo** — ultima settimana, ultimo mese, ultimo anno, o da sempre. Twitch le
ordina per visualizzazioni, dalla più vista in giù. Periodo stretto significa vetrina che cambia
spesso ma che può restare vuota nelle settimane fiacche; «da sempre» significa vetrina sempre
piena e sempre uguale.

L'elenco vero sta in `config.clip.voci` ed è **l'unico ramo di `contenuti.json` che riempie il
server**, senza un campo nello schema: una casella nel pannello sarebbe una casella riscritta
sotto le dita di chi la compila. La copertura dello schema lo salta apposta (`GENERATI` in
`contenuti/schema.js`) e il collaudo verifica tutte e due le cose. Gli altri rami senza campo sono
i tre dell'editor (`EDITOR`), che invece scrive il pannello: capitolo *Modificare il sito*.

**Le anteprime.** Le serve Twitch da `clips-media-assets2.twitch.tv` (e da
`clips-media-assets.twitch.tv`, per le clip vecchie) e da `static-cdn.jtvnw.net`, che è lo stesso
host degli avatar e quello da cui arrivano le clip ritagliate di recente: sono i tre host di
`img-src` nella Content-Security-Policy, e sono tutti e tre host di sole immagini.
`server/lib/twitch.js` **scarta** le anteprime che arrivano da un host diverso invece
di stamparle e lasciarle bloccare in silenzio — un'immagine che la CSP ferma non lo dice a
nessuno — e la generazione lo scrive in fondo, così si sa che è successo. La card senza anteprima
resta comunque in piedi, col suo fondo: meglio una clip senza immagine che una clip in meno. Il
collaudo controlla che i due elenchi, quello del modulo e quello della CSP, non prendano strade
diverse.

Come per «Ultima diretta», **se Twitch non risponde non succede niente**: la pubblicazione va
avanti e la vetrina resta quella di prima. Anche se Twitch risponde ma non ha nessuna clip per il
periodo scelto, l'elenco **non** viene svuotato.

---

## Colori e caratteri

**Non si toccano più a mano.** Si cambiano dal pannello, menu ☰ → «Impostazioni del sito» (nello
schema è il gruppo «Aspetto»): dodici colori, tre caratteri, l'arrotondamento degli angoli, la
larghezza massima, l'unità di spaziatura e l'intensità degli aloni dello sfondo, più cinque
combinazioni pronte. Alla pubblicazione quella configurazione diventa `css/tema.css`, che viene
caricato subito dopo `css/tokens.css` e ne riscrive i token.

- `css/tokens.css` è il **punto di partenza**: definisce tutti i token con i valori originali.
  Se `tema.css` manca, il sito è comunque completo e nessuno se ne accorge.
- `css/tema.css` è **generato**: ha in testa l'avvertenza «non si modifica a mano», e qualunque
  modifica fatta lì dentro sparisce alla generazione successiva.
- Nessun altro foglio di stile contiene un valore esadecimale. L'unica eccezione è il CSS che
  scrive l'editor in `<style id="sb-stili">`, e solo quando nella scheda Stile si sceglie un
  colore libero: i colori del tema escono come `var(--token)` e seguono il tema.

Oltre al tema, ogni elemento della pagina può avere **uno stile suo**, per Telefono, Tablet e
Computer (scheda Stile del pannello, `config.stili`). Quelle regole stanno nella pagina, in
`<style id="sb-stili">`, e battono i fogli del sito con `!important`: è l'unico posto dove il
progetto lo ammette, perché lì c'è una scelta esplicita su un elemento preciso.

I token derivati — vetri, veli, linee, gradienti, aloni, bagliori, i due raggi minori — non si
scelgono: si **calcolano** dai dodici colori e dai tre numeri, in `server/lib/tema.js`. E la
polarità si ribalta da sola: linee e vetri sono bianchi con alpha finché il fondo è scuro, e
diventano neri appena la luminanza del fondo supera 0,5. Senza quel calcolo il primo tema chiaro
farebbe sparire tutte le linee del sito.

I caratteri si scelgono da un catalogo, uno per slot (titoli, testo, strumentazione), e la
generazione compone da sé l'indirizzo di Google Fonts con le sole famiglie e i soli pesi che
servono. Se sono tutti caratteri di sistema, quell'indirizzo resta vuoto e la pagina non contatta
nessuno.

Il viola ufficiale di Twitch (`--twitch`) è l'unico colore che il tema non tocca: è un marchio
altrui e resta quello di `tokens.css`.

---

## Le immagini

Le immagini del sito sono **file locali**, non indirizzi del CDN di Twitch, ed è una scelta voluta:
quegli indirizzi cambiano a ogni modifica del profilo, e un'immagine che sparisce da sola è peggio
di una da aggiornare a mano. Stanno in due cartelle.

### Le immagini fisse: `img/`

Sono ricavate dalle grafiche del canale e alleggerite una per una, guardando il risultato alle misure
in cui si vedono davvero.

| File | Misure · peso | Dove si vede | Dove si cambia nel pannello |
|---|---|---|---|
| `img/copertina.webp` | 1920×1080 · 44 kB | il fondale della copertina: la città notturna, senza scritte | menu ☰ → «Canale, contatti e immagini» → *Banner della copertina* |
| `img/avatar.webp` | 256×256 · 7 kB | il menu laterale, il ritratto di «Chi sono» e i dati strutturati per Google | un clic sull'avatar o sul ritratto nell'anteprima, oppure *Avatar* nella stessa vista |
| `img/mascotte.webp` | 386×556 · 22 kB | il pollo accanto al player | un clic sul pollo nell'anteprima, oppure *Mascotte* |
| `img/og.jpg` | 1200×630 · 77 kB | l'anteprima del link quando viene condiviso | *Immagine di anteprima per i social* |
| `img/favicon.png` | 180×180 · 16 kB | la linguetta del browser e l'icona sulla schermata dell'iPhone | *Icona della linguetta* |
| `img/settimana-sfondo.webp` | 1920×927 · 23 kB | il fondale della sezione «La settimana» | editor della schedule, linguetta **Fondale** |

Prima erano cinque PNG da 2037 kB in tutto (`avatar.png`, `banner.png`, `mascot.png`, `og.png`,
`favicon.png`); le cinque immagini che li sostituiscono pesano 165 kB, e 188 kB contando anche il
fondale nuovo della schedule. I PNG vecchi non ci sono più.

Qualche cosa da sapere prima di cambiarle:

- **La mascotte ha la trasparenza vera.** Il pollo è scontornato, con la cresta e il contorno interi,
  e sta bene su qualunque fondo. Se la cambi, usa un'immagine con lo sfondo trasparente e
  proporzioni simili: posizione e oscillazioni in `css/pollo.css` sono tarate su questa.
- **L'icona della linguetta resta un PNG**, perché la pagina la dichiara così
  (`type="image/png"`). Un PNG piccolo come quello si carica com'è, senza conversione (qui sotto).
- **L'anteprima social conviene lasciarla in JPG** da 1200×630 e sotto i 350 kB: così parte com'è.
  Un file più pesante verrebbe riscritto in WebP, e non tutti i servizi che disegnano le anteprime
  dei link lo sanno leggere.
- **`copertina.webp` e `settimana-sfondo.webp` le usa anche `css/sezioni.css`**, come trama delle
  locandine e degli eventi senza immagine. Sostituendo il file con lo stesso nome cambiano anche
  quelle; rinominandolo, vanno aggiornati i due `url()` del foglio.

Scegliere un'immagine nuova dal pannello **non cancella il file vecchio**: il campo punta alla nuova,
che sta nella libreria, e quello di prima resta in `img/` senza essere usato. Chi preferisce può
anche sostituire a mano un file di `img/` tenendo lo stesso nome, estensione compresa.

### La libreria: `contenuti/media/`

È la cartella della **libreria del pannello** (menu ☰ → **Immagini**): ci finiscono le immagini
caricate dal pannello, e di partenza ci sono già cinque grafiche del canale, pronte da scegliere per
i giorni, gli eventi e il fondale della schedule.

| File | Misure · peso | Cos'è |
|---|---|---|
| `citta-notturna.webp` | 1920×1080 · 65 kB | la città notturna pulita: cielo stellato, grattacieli, nebbia viola |
| `banner-twitch.webp` | 1200×480 · 36 kB | il banner del canale, con il pollo e gli handle social |
| `overlay-cam.webp` | 1920×278 · 30 kB | la fascia della webcam con la scritta «SLAYER_BEARD» |
| `spoiler-maratona.webp` | 996×1413 · 26 kB | verticale, «STARTING» al neon sulla città: fatta per un evento |
| `stinger.webp` | 1920×927 · 27 kB | la città sfocata con due barre di luce diagonali |

Nella libreria ogni immagine dice dove è usata, schedule compresa («Schedule · lunedì», «Schedule ·
fondale della sezione»), e un'immagine ancora in uso non si può cancellare.

### Il caricamento: il pannello converte in WebP

Una foto presa dal telefono o un PNG esportato a 4K pesano megabyte, e il sito li farebbe scaricare a
ogni visita. Per questo **ogni immagine caricata dal pannello** — dalla libreria, dal blocco immagine
della schedule o trascinata sopra — passa prima dal browser, che la prepara:

- un **PNG, JPG o WEBP** che pesa più di **350 kB**, o che ha il lato lungo oltre i **2400 pixel**,
  viene rimpicciolito a 2400 pixel al massimo e riscritto in **WebP**, con lo stesso nome e
  l'estensione `.webp`;
- se il WebP non pesa meno dell'originale, o se il browser non sa scrivere WebP, parte l'originale;
- sotto soglia l'immagine parte com'è: ricodificare un file già leggero toglie qualità per
  risparmiare poco;
- gli **SVG** e le **animazioni** (PNG e WebP animati) non si toccano; le GIF non si caricano;
- un file che si chiama `.png` ma dentro non è un'immagine viene fermato subito, con un messaggio,
  senza spedire niente;
- il limite dei **4 MB** vale **dopo** la preparazione: una foto da 9 MB che diventa un WebP da
  600 kB si carica.

L'avviso a fine caricamento dice com'è andata, con il peso di prima e di dopo. Il server scrive poi
il nome in minuscolo, con i trattini al posto degli spazi, e se il nome è già preso aggiunge `-2`,
`-3`: una «Foto Storie.png» grande diventa `contenuti/media/foto-storie.webp`.

---

## Il pollo e la chat di Twitch

Accanto al player, nella sezione «diretta», c'è la mascotte — il pollo. Non è una decorazione
ferma: è un bottone che apre la chat e che dice una frase in un fumetto quando succede qualcosa.
Le frasi si scrivono dal pannello, gruppo «Il pollo»: sette elenchi, uno per situazione.

Reagisce a tre cose:

1. **I messaggi veri della chat del canale.** `js/pollo.js` apre una connessione WebSocket a
   `wss://irc-ws.chat.twitch.tv`, entra come utente anonimo (`justinfan<numero a caso>`) e
   **legge e basta**. Nessuna autenticazione, nessun token, nessun cookie, nessun dato del
   visitatore esce di lì, e non si può scrivere in chat da qui. La socket si apre **tardi**, solo
   dopo che la sezione della diretta è stata vista almeno una volta, si chiude quando la pagina
   viene lasciata o resta nascosta per un minuto, e riprova al massimo cinque volte con attesa
   crescente. Se non parte — rete che filtra il `wss`, browser vecchio, canale spento — **non
   succede niente**: il pollo continua a funzionare con le altre due sorgenti.
2. **Il visitatore che scrive nella chat incorporata.** Qui c'è un limite dichiarato: l'iframe
   della chat è di un altro dominio, quindi il sito **non può leggere né i tasti né i messaggi**.
   L'unica cosa che si sa è che il fuoco è entrato dentro quell'iframe e poi ne è uscito. Il
   pollo lo tratta come «qualcuno sta scrivendo»: è una **deduzione**, non una certezza, ed è
   scritto anche nei commenti del codice.
3. **Lo stato del canale** (in onda / fuori onda), il clic sul pollo, che apre la chat, e
   l'accensione della modalità lurk qui sotto.

Il fumetto è `aria-hidden`: i messaggi non vengono annunciati dai lettori di schermo, sarebbe uno
spam continuo. L'unica cosa esposta è il bottone, con la sua etichetta.

**Come si spegne.** Tre livelli, dal più forte al più leggero:

- dal pannello, gruppo «Il pollo», interruttore **Mostra il pollo** spento: la mascotte non
  compare per nessuno e il resto del gruppo non ha effetto;
- interruttore **Ascolta la chat vera del canale** spento: il pollo resta, ma non si collega a
  Twitch e reagisce solo allo stato del canale e ai clic;
- dal sito, il visitatore chiude il pollo con la sua «x»: la scelta resta memorizzata nel suo
  browser (`localStorage`, chiave `sb-pollo-nascosto`) e vale solo per lui.

C'è poi l'interruttore **Mostra il testo dei messaggi nel fumetto**, spento di serie e con un
rischio dichiarato: acceso, sul sito finisce quello che la gente scrive in chat, insulti
compresi, senza che nessuno lo abbia letto prima. Il testo viene comunque inserito solo con
`textContent`, troncato a 80 caratteri e ripulito dagli URL — non può diventare codice, ma resta
quello che qualcuno ha scritto.

### La modalità lurk

Sotto al monitor, sempre nella sezione «diretta», c'è un secondo riquadro: la **modalità lurk**.
Riguarda solo chi guarda la diretta **dal sito** e a un certo punto si allontana dalla tastiera.
Il disegno di tutta questa parte discende da un fatto verificato in
[`docs/PRESENZA-TWITCH.md`](docs/PRESENZA-TWITCH.md): **Twitch conta uno spettatore finché il suo
video gira, e la chat non entra nel conteggio.** Le regole con cui è stata costruita stanno in
[`CONTRATTO-3.md`](CONTRATTO-3.md).

**Cosa fa.** Sorveglia il player e lo fa ripartire quando il browser lo ferma. Il conteggio degli
spettatori dipende dalla sessione video: se la scheda viene sospesa o il video va in pausa, quella
persona esce dal conteggio pur essendo ancora davanti allo schermo. `js/lurk.js` se ne accorge da
quattro segnali — gli eventi dell'SDK di Twitch, una sentinella ogni 20 secondi a pagina visibile,
il tempo di riproduzione che smette di avanzare, e `navigator.onLine` quando dichiara che la rete
non c'è — e chiede a `js/player.js` di riprovare: prima `play()`, poi il cambio di canale, e solo
alla fine la ricostruzione del player, al massimo due volte per caricamento di pagina. Le attese
fra un tentativo e l'altro crescono — 5 s, 15 s, 45 s, 2 minuti — e poi si arrende dicendolo.

**Cosa non fa.** Non aggiunge spettatori finti: rimette in piedi la sessione di una persona vera
che sta ancora guardando, e nient'altro. Non toglie il muto da sé (c'è un bottone, lo preme il
visitatore), non nasconde né rimpicciolisce il player, non apre nessun secondo player e non
riavvia mai un video che sta andando. E il messaggio di lurk — il blocco descritto più sotto —
**non fa salire il numero di spettatori**: serve solo a farsi vedere da chi legge la chat. Chi si
aspetta il contrario resterà deluso, ed è meglio saperlo prima di accenderlo.

**Non promette continuità.** I `minute-watched` di Twitch viaggiano a circa 60 secondi: fra la
morte della sessione e il riavvio riuscito passa comunque **fino a un minuto**. Il pannello dice
questo e non di più.

**Si spegne da sola, ed è voluto.** Dopo le ore impostate nel pannello (campo *Dopo quante ore
chiedere «ci sei ancora?»*, di serie tre) il riquadro chiede conferma e, senza risposta entro
qualche minuto, si disattiva. Non è una scomodità da togliere: è ciò che separa questa
funzione da un miner di punti canale, pratica che le Community Guidelines di Twitch vietano
espressamente. Rimettere in piedi la sessione di chi è lì è legittimo; tenerla accesa
all'infinito per chi se n'è andato no. Per lo stesso motivo la funzione non si presenta mai
come «accumula punti mentre sei via».

**Su telefono non funziona, e il riquadro lo dice.** iOS e Android mettono in pausa il video
appena si cambia scheda, i timer vengono sospesi, e da un sito di terze parti non c'è rimedio. Il
bottone non si nasconde su mobile: si dichiara il limite e si lascia decidere.

**I cookie di terze parti.** Dentro l'embed la sessione Twitch del visitatore viaggia sui cookie
di terze parti. Se il browser li blocca — Safari lo fa da anni, Firefox li isola per dominio,
Chrome li sta restringendo — quella persona **conta per il canale ma non per sé**: niente punti
canale, niente watch streak. Il sito non può nemmeno accorgersene, perché l'iframe è di un altro
dominio: si può solo dirlo una volta, chiaramente, e offrire il collegamento a twitch.tv. Per un
abbonato che tiene alla propria streak la risposta onesta è guardare da lì.

**Come si spegne.** Dal pannello, gruppo «Modalità lurk», interruttore **Mostra la modalità
lurk** spento: il riquadro non compare per nessuno e il resto del gruppo non ha effetto. Sul sito,
non parte mai da sola: la accende il visitatore con un clic, e alla riapertura della pagina il
riquadro ricorda la scelta (`localStorage`, chiave `sb-lurk-acceso`) ma **aspetta un altro clic**.

**Il messaggio di lurk.** È il secondo blocco, e **nasce spento**. Un clic manda in chat **un**
messaggio a nome di chi si è collegato con Twitch: nessun timer, nessuna ripetizione, e la frase
viene mostrata prima di partire, con quelle parole esatte. **Il collegamento con Twitch si chiede
accendendo il lurk**: finché il riquadro è spento non c'è nessun bottone di login: chi passa e non
accende niente non deve vedersi proporre di collegare il proprio account. All'accensione — che
funziona comunque, senza account, perché il blocco A non ne ha mai avuto bisogno — compare la
domanda «vuoi dirlo anche in chat?», con la frase e il bottone. Il messaggio poi parte **con
l'accensione del lurk**, non da un bottone suo.

Gli ingressi sono **due, e la sessione una**: in cima alla sezione «diretta» c'è un
«Collegati con Twitch» sempre disponibile, e chi lo usa si ritrova lì la propria **tessera** —
immagine del profilo, nome per esteso, «scollega e revoca» — come su qualunque sito dove si entra
col proprio account. L'avatar e il nome li porta una `GET helix/users` fatta col token che c'è
già: nessuno scope in più, nessun dato che non sia pubblico sul canale di quella persona, e
niente email. È un di più e si comporta come tale — se quella richiesta fallisce resta il nome
minuscolo di `oauth2/validate` e non cambia nient'altro. Per l'immagine c'è l'unico dominio
esterno dell'`img-src`, `static-cdn.jtvnw.net`, che è un host di sole immagini.

Il login si apre in una **finestrella**, e non è una preferenza estetica: l'implicit grant è una
navigazione, e farla nella stessa scheda vorrebbe dire ricaricare la pagina — cioè spegnere il
lurk e fermare il video, rompendo per fare il login la sessione che il login accompagnava. Con la
finestrella la pagina non si muove, il video continua, e il messaggio parte appena il token
arriva. Il pezzo dentro la finestrella è `js/ritorno.js`: consegna il token a chi l'ha aperta con
un `postMessage` alla propria origine e si chiude. È il **primo script della pagina e non è
differito** apposta, perché deve chiudere la finestrella prima che `player.js` ci monti dentro un
secondo player — che sarebbe una seconda sessione video della stessa persona, vietata dal
CONTRATTO-3 §3.4. Se il browser blocca le finestrelle si ricade sul redirect classico, e lì al
ritorno **non parte niente**: la pagina si limita a riportare chi si è appena collegato dov'era,
tre schermate più giù, e aspetta il clic. Il tetto è di **tre messaggi per caricamento di pagina**, e comunque uno al
minuto: spegnere e riaccendere il lurk dieci volte non deve diventare dieci righe in chat. L'unica
eccezione alla regola «parte con l'accensione» è chi ha un adblock che filtra l'SDK di Twitch: lì
il lurk non si può accendere affatto — l'interruttore non viene proprio costruito, perché sarebbe
un bottone che non fa mai niente — e al suo posto compare *Dillo in chat*, che resta un clic e un
messaggio. Per accenderlo servono il profilo del sito acceso col suo Client ID
(`config.account.clientId`, gruppo «Profilo del sito», vuoto di serie) e almeno una frase: senza, la
generazione lo lascia spento comunque — e siccome un blocco spento è un blocco invisibile, in
**locale** il riquadro scrive in fondo una riga che dice quale delle tre cose manca. Solo su
`localhost`: sul sito pubblicato quella riga non compare a nessuno, e il motivo per cui esiste è
che senza si resta a premere «Attiva» aspettando un login che non può comparire. Il token che l'utente concede permette di scrivere in
**qualsiasi** canale di Twitch a suo nome — `broadcaster_id` è un parametro della richiesta, non
un vincolo del token — quindi vive in `sessionStorage` e muore con la scheda, non esiste nessun
«ricorda il login», e «Scollega» chiama davvero la revoca su Twitch invece di limitarsi a
dimenticare il token. Le frasi si scrivono dal pannello e devono **dichiarare** il lurk («Lurko
dal sito»), non fingere presenza attiva: il codice è identico, cambia solo cosa c'è scritto.

La guida per chi amministra è il capitolo *La modalità lurk* di
[`docs/PANNELLO.md`](docs/PANNELLO.md).

---

## Accessibilità e compatibilità

Contrasti verificati secondo WCAG AA — e il pannello mostra il rapporto di contrasto mentre si
scelgono i colori, così non si pubblica un testo illeggibile per sbaglio. Navigazione completa da
tastiera, skip link, landmark ARIA, rispetto di `prefers-reduced-motion`. Regge da 320 px a
2560 px senza scroll orizzontale.

Senza JavaScript la pagina resta leggibile e completa: si perdono solo il player, il conto alla
rovescia, l'evidenziazione della sezione corrente, il pollo e, sul nastro della settimana, le date,
i segni «oggi», «prossima» e «in onda» e l'ora di chi guarda. I contenuti, gli orari, le immagini
della schedule, gli eventi speciali e i link sono già nell'HTML generato.

Browser: versioni correnti di Chrome, Edge, Firefox e Safari.

---

## Documentazione

Il progetto è documentato più di quanto sembri, e questo README è solo la porta
d'ingresso: qui sotto c'è cosa leggere e quando.

| Documento | A cosa serve |
|---|---|
| [`docs/HOSTING.md`](docs/HOSTING.md) | **La guida della messa online.** Cosa caricare e dove, i campi dell'estensione Node del pannello dell'hosting, le variabili d'ambiente una per una, il primo accesso al pannello online, cosa fare quando il dominio si sa e cosa non caricare mai. |
| [`docs/PANNELLO.md`](docs/PANNELLO.md) | **La guida per chi aggiorna il sito.** Come si entra nel pannello, la differenza fra *Salva* e *Pubblica*, gruppo per gruppo cosa fa ogni campo, le immagini, i colori, i backup e il ripristino. Non serve saper programmare: è il documento da dare in mano a chi deve cambiare un orario. |
| [`docs/PRESENZA-TWITCH.md`](docs/PRESENZA-TWITCH.md) | **Lo studio da leggere prima di toccare la modalità lurk.** Come Twitch conta davvero gli spettatori, perché la chat non entra nel conteggio, cosa succede ai cookie di terze parti, e cosa il regolamento di Twitch consente e cosa no. Da qui discende ogni scelta di `js/lurk.js`, spegnimento automatico compreso. |
| [`CONTRATTO.md`](CONTRATTO.md) | Le regole con cui il sito è stato costruito: niente npm, niente framework, niente CDN, tutto in italiano. Vale ancora, tranne i tre punti superati dall'addendum. |
| [`CONTRATTO-2.md`](CONTRATTO-2.md) | L'addendum della seconda fase: la sezione «diretta», il pollo, il tema modificabile e il testo ricco. |
| [`CONTRATTO-3.md`](CONTRATTO-3.md) | L'addendum della terza fase: la modalità lurk e il collegamento con Twitch. |
| [`CONTRATTO-4.md`](CONTRATTO-4.md) | L'addendum della quarta fase: l'editor unico del pannello, con i marcatori `data-sb-*`, le parti, i blocchi e i tre rami dell'editor. |
| [`CONTRATTO-5.md`](CONTRATTO-5.md) | L'addendum della quinta fase: la schedule rifatta (`config.orari` con schede, eventi speciali e fondale) e le grafiche nuove del sito. |
| [`CONTRATTO-6.md`](CONTRATTO-6.md) | L'addendum della sesta fase: il sito pronto per un hosting con Node (file d'avvio, variabili d'ambiente, server web, pannello esposto a internet). |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Come si lavora al codice: flusso di lavoro, convenzione dei commit, stile, checklist prima di una pull request. |
| [`SECURITY.md`](SECURITY.md) | Come segnalare una vulnerabilità, i punti sensibili noti e i casi fuori ambito. |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Il codice di condotta della comunità. |
| [`CHANGELOG.md`](CHANGELOG.md) | Il registro delle modifiche, versione per versione. |

`node server/autotest.js` passa per intero: **182 prove su 182**. Il collaudo non
tocca la rete nemmeno nella sezione sul collegamento con Twitch — quello che si
prova lì è che una pubblicazione regga quando Twitch non risponde, e un collaudo
che dipendesse da Twitch sarebbe rosso proprio il giorno in cui deve dimostrarlo.

---

## Terze parti

Il sito non ha dipendenze da installare, ma a pagina aperta parla con tre
soggetti esterni, e vale la pena sapere quali:

- **Twitch** — il player e la chat sono incorporati da `embed.twitch.tv`, con
  l'SDK servito da Twitch stessa. Se il collegamento è configurato, alla
  pubblicazione anche il **server locale** chiama `id.twitch.tv` e
  `api.twitch.tv` per il titolo dell'ultima diretta: succede sul computer di
  chi amministra, non nel browser di chi visita. Marchio, logo e colore istituzionale sono di
  Twitch Interactive, Inc.; il loro uso qui identifica il canale e nient'altro.
  Il player, la chat e il collegamento facoltativo con l'account sono soggetti
  alle condizioni d'uso e alle Community Guidelines di Twitch.
- **Google Fonts** — i caratteri scelti dal pannello vengono serviti da
  `fonts.googleapis.com`, con le rispettive licenze aperte. Se si scelgono solo
  caratteri di sistema quell'indirizzo resta vuoto e la pagina non contatta
  nessuno.
- **`static-cdn.jtvnw.net`**, **`clips-media-assets2.twitch.tv`** e
  **`clips-media-assets.twitch.tv`** — i tre domini esterni ammessi in
  `img-src` oltre al sito stesso. Il primo serve le immagini di profilo di
  Twitch, gli altri due le anteprime delle clip. Sono tutti host di sole
  immagini: non eseguono niente, e nessun'altra cosa della pagina viene da lì.

Le immagini in `img/` e in `contenuti/media/` e la cattura `Cattura.PNG`
ritraggono materiale grafico del canale slayer_beard e non sono coperte dalla
licenza di questo progetto.

---

## Licenza

Progetto **proprietario, tutti i diritti riservati**. Copia, redistribuzione,
modifica e opere derivate non sono consentite senza permesso scritto del
titolare. Il testo completo è in [`LICENSE`](LICENSE).

Le componenti di terze parti elencate qui sopra restano soggette alle proprie
licenze.

---

## Titolare

Il progetto è di **slayer_beard**.

Per richieste di licenza, autorizzazioni o collaborazioni, e per tutto ciò che
non è un difetto o una proposta, il canale è il repository su GitHub:
[Slayer_Beard-Website](https://github.com/Shadowed1996/Slayer_Beard-Website).
