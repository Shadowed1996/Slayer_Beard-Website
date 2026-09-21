# Il pannello — guida per chi aggiorna il sito

Questa guida è per chi deve cambiare i testi, i link, gli orari, le immagini, i
colori e l'aspetto del sito. Non serve saper programmare: si legge dall'inizio
alla fine una volta sola, poi si torna a cercare il pezzo che serve.

L'idea di fondo è una sola: **il sito è lì in mezzo, clicchi la cosa che vuoi
cambiare e la cambi.** Non c'è più un elenco di sezioni da sfogliare: un
titolo si cambia cliccando il titolo, un'immagine cliccando l'immagine, un
colore cliccando l'elemento che lo porta.

L'ultimo capitolo, *Per chi mette le mani nel codice*, è per chi lavora sui
file del sito. Tutto il resto è per chi usa il pannello.

---

## 1. La cosa più importante, prima di tutto

Nel pannello ci sono due bottoni che sembrano simili e fanno due cose diverse.

| Bottone | Cosa fa | Chi se ne accorge |
|---|---|---|
| **Salva** | Mette da parte le tue modifiche sul server. | Nessuno. Il sito che vede il pubblico **non cambia**. |
| **Pubblica** | Riscrive il sito vero con quello che hai salvato. | **Tutti.** Da quel momento chi apre il sito vede le modifiche. |

C'è una terza cosa, in mezzo, che è facile confondere con le altre due:
**guardare**. L'anteprima al centro del pannello ti fa vedere le modifiche anche
prima di salvarle, ma vederle non le salva e non le pubblica. In ordine:

**modifichi → guardi → salvi → pubblichi.**

I quattro passi sono scritti anche nella vista *Pagina* del pannello, sotto
*Come si lavora*, e quello a cui sei arrivato si accende da solo.

Quindi: si lavora, si **salva** quante volte si vuole, e si **pubblica** solo
quando è tutto come deve essere. Vale per tutto: testi, orari, colori, font,
stili degli elementi, posizioni dei blocchi, ordine delle sezioni.

Se premi Pubblica mentre hai modifiche non salvate, il pannello se ne accorge e
apre la finestra *Ci sono modifiche non salvate*: premi **Salva e pubblica**.

> **Che cosa riscrive «Pubblica»**: tre file. La pagina (`index.html`), i dati
> che servono al JavaScript del sito (`js/dati.js`) e il foglio dei colori
> (`css/tema.css`). Te lo ricorda anche la finestra *Pubblico il sito?*. Se il
> sito sta su un hosting esterno, dopo aver pubblicato vanno caricati **tutti e
> tre**: caricare solo la pagina lascia online i colori vecchi. E se hai
> caricato immagini o font dal pannello, vanno caricate anche le cartelle
> `contenuti/media/` e `contenuti/font/`.

---

## 2. Accendere il sito e aprire il pannello

Sul computer dove sta il sito:

1. Apri il **Prompt dei comandi** (o il Terminale) nella cartella del sito.
2. Scrivi questo e premi Invio:

   ```
   node server/server.js
   ```

3. Lascia quella finestra aperta. Se la chiudi, il pannello smette di funzionare.
4. Apri il browser su:

   ```
   http://localhost:4173/pannello/
   ```

La porta di serie è la **4173**. Se è già occupata da un altro programma, il
server lo dice e si avvia su un'altra porta così:
`SB_PORTA=4174 node server/server.js` (e allora l'indirizzo diventa
`http://localhost:4174/pannello/`). Il sito, senza `/pannello/`, sta allo stesso
indirizzo: `http://localhost:4173/`.

Il pannello è l'attrezzo del server, non una pagina del sito pubblicato: da qui
si apre sul computer dove quel server gira.

Per spegnere tutto, torna nella finestra nera e premi `Ctrl+C`.

**Se il sito sta su un hosting**, i primi tre passi non ci sono: il server è già
acceso e il pannello sta su `https://slayerbeard.com/pannello/`. Non serve nessun
comando e non c'è niente da spegnere, serve solo la password — il primo accesso è
nel capitolo 6 di [`HOSTING.md`](HOSTING.md).

---

## 3. Entrare e uscire

**La prima volta in assoluto** il server non ha ancora una password. Il pannello
se ne accorge da solo e ti mostra la schermata per crearla: scrivila due volte
(almeno 8 caratteri, la seconda nel campo *Ripeti la password*) e premi **Crea
la password ed entra**.

> Scrivi quella password anche da qualche altra parte al sicuro. Non si recupera:
> si può solo cambiare.

**Tutte le altre volte** ti chiede solo la password: scrivila e premi **Entra nel
pannello**. Il tasto **Mostra** accanto al campo serve a rileggere quello che
hai scritto, se temi un errore di battitura.

**Se hai perso la password:** dal computer dove gira il sito, ferma il server e
scrivi `node server/imposta-password.js`. Ti farà scegliere una password nuova.
Se invece la ricordi e vuoi solo cambiarla, si fa dal pannello: capitolo 14,
*Password*.

**Se il sito sta su un hosting**, cambia il posto, non la sostanza: il file della
password può stare fuori dalla cartella del sito, dove punta la variabile
`SB_DATI`, ed è lì che va cercato; e la **prima** password si può creare solo dopo
aver acceso `SB_PRIMO_ACCESSO=1`, che poi si spegne subito. I passi, uno per uno,
sono nel capitolo 6 di [`HOSTING.md`](HOSTING.md).

**Se la sessione scade** (sei rimasto fermo troppo a lungo) il pannello ti riporta
alla password e ti dice che le modifiche in corso sono ancora lì. Rientra e le
ritrovi come le avevi lasciate. Non ricaricare la pagina prima di essere
rientrato.

**Per uscire** apri il menu **☰** in alto a sinistra e scegli **Esci**. Se hai
modifiche non salvate, il pannello chiede *Esco senza salvare?*: **Esci
comunque** le butta via, **Resto qui** ti lascia dentro.

---

## 4. Come è fatta la schermata

Appena entri vedi tre parti: la barra in alto, il pannello a sinistra e
l'anteprima del sito al centro.

### La barra in alto

Da sinistra a destra:

- **☰** — il menu del pannello: impostazioni, immagini, copie di sicurezza,
  password, uscita (capitolo 14);
- **Pannello** — c'è solo quando la finestra è stretta: apre e chiude il
  pannello laterale (capitolo 24);
- l'avatar e **slayer_beard** — un clic apre il sito pubblicato in una scheda
  nuova. Accanto c'è il nome di quello che hai selezionato adesso: «Pagina»
  quando non hai selezionato niente, oppure per esempio «Titolo», «Chi sono»,
  «Monitor del player»;
- **Telefono · Tablet · Computer** — su quale schermo guardi e lavori (qui
  sotto);
- **↶ ↷** — Annulla e Ripeti (qui sotto);
- la **spia**: *Tutto salvato* (verde) oppure *Modifiche non salvate*
  (arancione, lampeggia). Mentre il pannello lavora dice *Sto salvando…* o
  *Sto pubblicando…*;
- sotto la spia, quando pubblicasti l'ultima volta: per esempio *Pubblicato 3
  giorni fa*, con *· da ripubblicare* se hai salvato cose che non sono ancora
  online, oppure *Mai pubblicato*;
- **Salva** (*bozza · il sito non cambia*) e **Pubblica** (*riscrive il sito*).
  Salva resta spento quando non c'è niente da salvare.

Sulle finestre meno larghe alcune scritte della barra spariscono (la data, le
note sotto Salva e Pubblica, i nomi dei dispositivi): i bottoni restano, e
passandoci sopra col mouse dicono lo stesso cosa fanno.

### Il pannello a sinistra

In cima c'è sempre la casella **Cerca un campo…** (capitolo 17). Sotto, il
pannello mostra una di tre cose:

- **la vista «Pagina»**, quando non hai selezionato niente;
- **i controlli dell'elemento che hai cliccato**, con le schede *Contenuto*,
  *Stile* e *Avanzate* (capitoli 5 e 6);
- **una vista del menu ☰**, con **Torna all'editor** in cima.

Il pannello **si allarga e si stringe**: trascina la riga verticale che lo separa
dall'anteprima. Va da 380 a 760 pixel; il doppio clic sulla riga lo rimette
com'era (480). Si regola anche da tastiera: porta il fuoco sulla riga e usa le
frecce (con `Maiusc` il passo è più lungo), `Inizio` e `Fine` per il minimo e il
massimo, `Invio` per la misura di partenza. Il pannello si ricorda la larghezza
e l'ultima scheda che hai usato.

### La vista «Pagina»

È quello che vedi appena entri, e ogni volta che togli la selezione.

- In cima quattro scorciatoie: **Impostazioni del sito**, **Canale e
  immagini**, **Google e social**, **Immagini**. Aprono le stesse viste del
  menu ☰.
- **Sezioni della pagina**: l'elenco delle sezioni dall'alto in basso, il
  Navigatore (capitolo 12). Da qui si cambiano ordine e visibilità.
- **Come si lavora**: i quattro passi — *Clicca e modifica*, *Guarda
  l'anteprima*, *Salva la bozza*, *Pubblica* — con acceso quello che tocca adesso.
- In fondo, la riga con l'ultima pubblicazione.

Per tornare alla vista Pagina: clicca **Pagina** all'inizio del percorso, oppure
clicca lo spazio intorno alla pagina nell'anteprima (quando la pagina è più stretta
dello spazio, come con Telefono e Tablet).

### L'anteprima al centro

È il tuo sito, dentro il pannello, **con le modifiche in corso, anche quelle non
salvate**. Qui cliccare serve solo a scegliere cosa modificare: i link non
portano da nessuna parte e i moduli non si inviano.

L'anteprima mostra la pagina **senza il JavaScript del sito**: niente player vivo,
niente chat, niente conto alla rovescia, niente pollo che parla. È voluto, e il
perché sta nel capitolo 26. Testi, immagini, colori, stili e posizioni si vedono
invece come sul sito vero.

Quando l'anteprima si sta caricando compare *Carico l'anteprima del sito…*;
dopo una modifica che chiede di rifare la pagina, *Aggiorno l'anteprima…*. Se
qualcosa va storto compare *L'anteprima non si è caricata.* con il bottone
**Riprova**.

### Telefono, Tablet, Computer

Il sito si vede in modo diverso sui tre schermi, e l'anteprima cambia con lui:

| Bottone | Quanto è larga la pagina nell'anteprima |
|---|---|
| **Telefono** | 375 pixel |
| **Tablet** | 900 pixel |
| **Computer** | almeno 1100 pixel, di più se lo spazio c'è |

Se la pagina non ci sta nello spazio (succede quasi sempre con Computer),
l'anteprima **si rimpicciolisce da sola** per starci tutta. Allora compare
l'indicatore **Zoom** con la percentuale e un bottone: **100%** la mostra a
grandezza vera (poi si scorre di lato), **Adatta** la rimpicciolisce di nuovo.
Il sito è sempre lo stesso: cambia solo quanto lo vedi grande. Ogni volta che
cambi dispositivo, l'anteprima riparte adattata allo spazio.

Il dispositivo scelto conta anche per le modifiche: **stile, visibilità e
posizione dei blocchi si impostano per dispositivo** (capitoli 10 e 13). Testi,
immagini e dati invece sono gli stessi dappertutto.

### Annulla e Ripeti

**↶** torna indietro di una modifica, **↷** la rifà. Vanno anche con `Ctrl+Z` e
`Ctrl+Y` (oppure `Ctrl+Maiusc+Z`). Il pannello si ricorda le ultime 50
modifiche; una raffica di tasti battuti di fila conta come una modifica sola.

- Vale anche dopo aver salvato: quello che annulli torna *da salvare*.
- Mentre stai scrivendo dentro un campo o dentro un testo sulla pagina,
  `Ctrl+Z` annulla le lettere di quel campo, come in ogni programma. Esci dal
  campo (o premi `Esc`) e poi `Ctrl+Z`, oppure usa **↶** in alto.
- La memoria delle modifiche riparte da zero quando rientri nel pannello e
  quando ripristini una copia di sicurezza.

---

## 5. Scegliere un elemento

Passando col mouse sull'anteprima, un contorno sottile ti mostra cosa
selezioneresti. Quando clicchi, il contorno diventa pieno, azzurro, e compare
un'etichetta col nome. Nel pannello compaiono subito i controlli di quell'elemento.

Gli elementi sono uno dentro l'altro, dal più piccolo al più grande:

**testo o immagine → parte → blocco → sezione**

- un **testo** o un'**immagine**: il titolo, un paragrafo, l'avatar;
- una **parte**: un pezzo di pagina che viene da dati o impostazioni, come il
  listino del supporto o il pollo (capitolo 11);
- un **blocco**: un gruppo di cose che stanno insieme dentro una sezione, come
  «Racconto» o «Ritratto» in *Chi sono*. I blocchi si possono spostare
  (capitolo 13);
- una **sezione**: *Copertina*, *La diretta*, *Chi sono*… (capitolo 12).

Il clic prende sempre la cosa più piccola. Per salire a quella che la contiene
hai tre strade:

- il **percorso** in cima al pannello, per esempio
  *Pagina › Chi sono › Racconto › Titolo della sezione*: ogni nome si clicca;
- il bottone **Seleziona il contenitore**, che sotto dice il nome del
  contenitore;
- il tasto **`Esc`** con il fuoco nell'anteprima: ogni pressione sale di un
  livello.

Qualche caso da sapere:

- Alcuni elementi sono due cose insieme, per esempio la *Riga di chiusura* di
  *Come dare una mano* è sia un testo sia un blocco. Il clic prende il testo,
  `Esc` passa al blocco.
- Il **banner della copertina** sta dietro a tutto e col clic non si prende:
  seleziona la sezione *Copertina* e cercalo in *Cosa contiene*, oppure cambialo
  da menu ☰ → *Canale, contatti e immagini*.
- Un elemento **nascosto sul dispositivo che stai guardando** non ha contorno
  né etichetta. Lo ritrovi passando a un altro dispositivo, oppure nell'elenco
  *Cosa contiene* della sua sezione, dove è segnato *non si vede qui*.

---

## 6. Le tre schede: Contenuto, Stile, Avanzate

Sotto il nome dell'elemento selezionato ci sono tre schede.

| Scheda | Cosa ci trovi |
|---|---|
| **Contenuto** | cosa c'è scritto, quale immagine, i dati di una parte (orari, social, listino…), l'interruttore di una sezione |
| **Stile** | font, dimensione, colori, sfondo, spazi, bordi, bagliore, opacità |
| **Avanzate** | visibilità per dispositivo, larghezza massima, posizione dei blocchi, ripristino dello stile |

Non tutti gli elementi hanno qualcosa in tutte le schede. Un blocco, per
esempio, non ha niente da scrivere: la scheda Contenuto lo dice (*Qui non c'è
niente da scrivere*) e offre **Vai a Stile**, **Vai a Avanzate** e **Seleziona
il contenitore**.

Il pannello si ricorda l'ultima scheda aperta. Se fai doppio clic su un testo
nell'anteprima mentre sei in Stile o Avanzate, la scheda Contenuto torna davanti
da sola: è lì che stanno i bottoni per scrivere.

Da tastiera, con il fuoco su una scheda, le frecce destra e sinistra passano
alle altre.

---

## 7. Cambiare un testo

1. Clicca il testo nell'anteprima.
2. Nella scheda **Contenuto** premi **Scrivi qui**. Oppure fai **doppio clic** sul
   testo.
3. Scrivi direttamente sulla pagina. Il testo in scrittura ha un contorno
   tratteggiato, e nel pannello c'è scritto *Stai scrivendo sulla pagina*.
4. Quando hai finito premi **Fatto**, oppure `Esc`, oppure `Ctrl+Invio`. Anche un
   clic su un altro elemento chiude la scrittura.
5. La spia in alto diventa arancione: **Modifiche non salvate**. Premi **Salva**
   (oppure `Ctrl+S`, che funziona anche mentre scrivi).

**Rimetti com'era** riporta il testo com'era quando hai cominciato a scriverci.
Aprire un testo e chiuderlo senza cambiare niente non conta come modifica.

Sotto *Scrivi qui*, in **Oppure dal pannello**, c'è lo stesso testo in un campo
normale: è la stessa cosa, scegli il modo più comodo. Sopra, una riga dice che
tipo di testo è (*Testo* oppure *Testo con formattazione*) e in che parte del
sito sta, e c'è la spiegazione del campo quando esiste.

Se lo stesso testo compare in più punti della pagina, cambiandolo cambia
dappertutto.

### Testi semplici e testi con formattazione

- **Testo** (titoli, etichette, bottoni): solo lettere. `Invio` non va a capo, e
  quello che incolli arriva senza formattazione.
- **Testo con formattazione** (paragrafi, note, la citazione): mentre scrivi, nella
  scheda Contenuto compare una barretta.

| Pulsante | Cosa fa | Scorciatoia |
|---|---|---|
| **G** | Grassetto | `Ctrl+B` |
| *C* | Corsivo | `Ctrl+I` |
| S | Sottolineato | `Ctrl+U` |
| Link | Trasforma la parte selezionata in un collegamento | `Ctrl+K` |
| ↵ | Va a capo dentro lo stesso paragrafo | `Invio` |
| Pulisci | Toglie grassetto, corsivo, sottolineato e link | |

Per fare un link: **seleziona le parole**, premi *Link*, scrivi l'indirizzo e
premi **Applica** (o `Invio`). **Togli il link** lo toglie, **Lascia stare** chiude
la riga senza cambiare niente. Gli indirizzi devono cominciare con `https://`,
`http://`, `mailto:` oppure essere un percorso interno al sito (`/…` o `#settimana`).
Un link che va fuori si apre da solo in una scheda nuova: non c'è niente da
impostare.

Il campo *Oppure dal pannello* dei testi con formattazione ha la stessa barretta,
più il pulsante `</>` che mostra il codice, per chi sa cosa sta facendo.

### Il limite dei caratteri

Ogni testo ha un massimo. Mentre scrivi, nella scheda c'è il conto, per esempio
*23 / 60*: diventa arancione quando sei vicino al limite e rosso quando l'hai
passato. Nei testi con formattazione si contano **le lettere che si leggono**,
non la formattazione: mettere in grassetto una parola non consuma caratteri.

Se passi il limite il testo sulla pagina si contorna di rosso, compare l'avviso
*«…» è troppo lungo* e il salvataggio non passa finché non accorci.

### Perché alcuni testi «rimandano» da un'altra parte

Certi testi non sono scritti a mano: la pagina li costruisce da un elenco, per
esempio i nomi dei social o le righe del listino. Riscritti sulla pagina, alla
pubblicazione tornerebbero come prima.

Per questo, cliccandoli, il pannello non ti fa scrivere: ti dice da dove arrivano
e offre il bottone **Apri i controlli di «…»**, che porta dritto alla parte giusta.

I testi dei giorni e degli eventi della *Settimana* (titolo, gioco, nota, ora)
fanno ancora meno giri: un clic su un giorno o su un evento nell'anteprima apre
direttamente la sua scheda nell'editor della schedule (capitolo 11).

### Perché non tutto l'HTML è ammesso

Nei testi si può usare solo un piccolo elenco di cose: grassetto, corsivo,
sottolineato, barrato, a capo, testo piccolo, evidenziato, apice, pedice,
`codice`, abbreviazioni e link. Tutto il resto **viene tolto**: sparisce il pezzo
di codice, resta il testo che c'era dentro.

Non è una scortesia, sono due motivi seri:

1. **Sicurezza.** Se un testo potesse contenere qualunque cosa, chiunque
   riuscisse a entrare qui dentro potrebbe infilare del codice nel sito che
   vedono i visitatori. Con la lista corta, il peggio che può succedere è che un
   pezzo di testo venga scritto storto.
2. **Il sito resta in piedi.** Titoli, riquadri, immagini e colonne hanno già il
   loro posto: incollandoli dentro un paragrafo si romperebbe l'impaginazione.
   Le immagini si scelgono cliccando l'immagine, i colori dalla scheda Stile o
   dalle Impostazioni del sito.

Se incolli un testo da Word o da una pagina web, la formattazione strana viene
ripulita **al momento di incollare**. Quello che vedi è quello che finirà sul
sito. Se nel campo del pannello scrivi qualcosa che non è ammesso, il pannello
te lo dice sotto il campo, in italiano, spiegando cosa ha tolto e perché.

---

## 8. Cambiare un'immagine

1. Clicca l'immagine nell'anteprima.
2. Nella scheda **Contenuto** premi **Cambia immagine**. Anche il doppio clic
   sull'immagine fa la stessa cosa.
3. Si apre la **Libreria immagini**. Da lì puoi:
   - **cliccare un'immagine già presente** per usarla subito;
   - **trascinare un file** dentro la finestra per caricarlo;
   - premere **Scegli un file** e prenderlo dal computer.
4. Appena l'immagine è caricata viene scelta da sola.
5. Guarda l'anteprima, **Salva**, **Pubblica**.

Formati accettati: PNG, JPG, WEBP, SVG. Massimo 4 MB per file, **dopo** la
preparazione qui sotto.

### Le foto grandi le alleggerisce il pannello

Non serve rimpicciolire le foto prima di caricarle. Ogni immagine che carichi dal
pannello — dalla libreria, dal blocco immagine della schedule, trascinata sopra —
il browser la prepara prima di spedirla:

- un **PNG, JPG o WEBP** che pesa più di **350 kB**, o che ha il lato lungo oltre i
  **2400 pixel**, viene rimpicciolito a 2400 pixel al massimo e riscritto in
  **WebP**: `foto.png` arriva come `foto.webp`;
- se il WebP non pesa meno dell'originale, parte l'originale;
- un'immagine già leggera parte com'è, e così gli **SVG** e le immagini
  **animate**;
- un file che si chiama `.png` ma dentro non è un'immagine viene fermato subito,
  con un messaggio.

L'avviso a fine caricamento dice com'è andata, per esempio che una foto da 1,6 MB
è arrivata come WebP da poche decine di kB. Il server scrive il nome in minuscolo,
con i trattini al posto degli spazi, e se c'è già un file con quel nome aggiunge
`-2`: niente viene sovrascritto.

Due casi in cui conviene caricare un file già pronto e leggero, così parte
com'è: l'**icona della linguetta**, che deve restare un PNG, e l'**immagine di
anteprima per i social**, meglio un JPG da 1200×630 sotto i 350 kB, perché non
tutti i servizi che disegnano le anteprime dei link leggono il WebP.

Nella scheda trovi anche la miniatura e il nome del file. Se la stessa immagine
compare in più punti (l'avatar, per esempio), il pannello lo dice: *cambiandola,
cambia dappertutto*. Se l'immagine ha una descrizione per chi usa un lettore di
schermo (il ritratto di *Chi sono*), sotto c'è il suo campo: descrivi cosa si
vede, non scrivere solo il nome. Le immagini decorative non ne hanno bisogno, e
il pannello lo dice.

Le immagini della pagina che si cliccano sono l'avatar (nel menu laterale), il
ritratto di *Chi sono* e il disegno del pollo. Le immagini della *Settimana* — la
locandina di un giorno, quella di un evento speciale e il fondale dietro la sezione
— si cambiano dall'editor della schedule (capitolo 11). Le altre — il banner della
copertina, l'immagine di anteprima per i social, l'icona della linguetta — stanno
in menu ☰ → **Canale, contatti e immagini**: lì ogni immagine ha **Scegli o
carica** e **Togli** (che svuota il campo: il file resta nella libreria).

### Gestire la libreria

Menu ☰ → **Immagini** apre la libreria intera. Per ogni file puoi premere **Copia
percorso** o **Elimina**, e vedi dove è usato: anche nella schedule, per esempio
*Schedule · lunedì* o *Schedule · fondale della sezione*.

Di partenza la libreria ha già cinque grafiche del canale, pronte per la schedule:
la città notturna (`citta-notturna.webp`), il banner di Twitch
(`banner-twitch.webp`), la fascia della webcam (`overlay-cam.webp`), la locandina
verticale «STARTING» (`spoiler-maratona.webp`) e la città con le barre di luce
(`stinger.webp`).

Un'immagine ancora usata da qualche parte nel sito **non si può eliminare**: il
pannello apre *Immagine ancora in uso* e ti dice dove. Per toglierla davvero: cambia
prima l'immagine lì dove è usata, salva, e poi torna qui a eliminarla.

---

## 9. Lo stile di un elemento

Clicca un elemento e apri la scheda **Stile**. I controlli sono raggruppati, e
ogni gruppo si apre e si chiude cliccando il suo nome:

- **Tipografia** — *Font*, *Dimensione* (in pixel o in rem), *Spessore*,
  *Corsivo*, *Maiuscole*, *Spazio fra le lettere*, *Interlinea*,
  *Allineamento*. Non c'è sulle immagini.
- **Colori** — *Colore del testo* (non sulle immagini) e *Colore di sfondo*.
- **Sfondo** — *Immagine di sfondo* (bottone **Scegli un'immagine**),
  *Grandezza dell'immagine* (*Copre tutto*, *Intera*, *Grandezza originale*) e
  *Posizione dell'immagine*. Solo su parti, blocchi e sezioni.
- **Spazi** — *Spazio esterno* e *Spazio interno*, lato per lato, in pixel. Col
  lucchetto chiuso (*Stesso valore sui quattro lati*) scrivi un numero una volta
  e vale per tutti e quattro. Lo spazio esterno può essere negativo.
- **Bordi** — *Spessore del bordo*, *Colore del bordo*, *Angoli arrotondati*.
- **Effetti** — *Bagliore* (*Nessuno*, *Viola*, *Ciano*) e *Opacità*.

Il numerino accanto al nome di un gruppo dice quanti valori hai cambiato su quel
dispositivo. Il pannello si ricorda quali gruppi tieni aperti.

Tutto quello che cambi si vede subito nell'anteprima. Ogni valore ha dei limiti
(una dimensione del testo va da 8 a 200 pixel, per esempio): un numero fuori
dai limiti si riporta al bordo più vicino.

### Colori del tema o colore libero

Quando apri un controllo del colore hai tre strade.

- **Colori del tema** — i 12 colori del sito, divisi in *Marchio*, *Stati* e
  *Fondo e testo* (Viola del marchio, Ciano, In onda, Paragrafi…). Scegliendone
  uno, l'elemento resta **collegato**: se un giorno cambi quel colore nelle
  Impostazioni del sito, cambia anche qui. Lo riconosci dall'etichetta **tema** e
  dalla riga *Collegato al colore del tema «…»*. È la scelta migliore quasi sempre.
- **Colore libero** — un colore qualsiasi, dalla tavolozza o scrivendo il
  **Codice** (sei cifre dopo il cancelletto, per esempio `#8b2fff`). Resta fisso:
  non segue i cambi del tema.
- **Come nel sito** — nessun colore scelto qui: resta quello che il sito ha già.
  Su Tablet e Telefono si chiama *Come su Computer* o *Come su Tablet*.

Con i font funziona allo stesso modo:

- **Font del tema** — titoli, testo, strumentazione: seguono i font scelti nelle
  Impostazioni del sito;
- **Catalogo** — una famiglia precisa: resta fissa;
- **Caricati da te** — i font che hai caricato (capitolo 16);
- **Come nel sito**.

### Valori ereditati e ripristino

Accanto al nome di ogni controllo c'è un pallino:

- **acceso**: il valore l'hai scelto tu, su questo dispositivo;
- **con la scritta «da Computer: …»** (o «da Tablet: …»): il valore arriva da un
  dispositivo più grande;
- **spento**: l'elemento è come nel sito.

La freccia tonda **↺** accanto a un controllo toglie quel valore su questo
dispositivo: torna quello ereditato, o quello del sito.

Per l'immagine di sfondo c'è un caso in più. Se su Computer hai messo
un'immagine e sul telefono non la vuoi, passa a Telefono e premi **Nessuna su
Telefono**. Per riaverla, lì compare **Usa quella di Computer**.

Per ricominciare da capo con un elemento c'è la scheda **Avanzate** →
**Ripristina lo stile di questo elemento** (capitolo 10).

---

## 10. Telefono, Tablet e Computer: uno stile per dispositivo

In cima alle schede Stile e Avanzate c'è scritto **Stai cambiando Computer** (o
Tablet, o Telefono), con i tre bottoni per cambiare. Sono collegati a quelli della
barra in alto: cambi da una parte, cambia anche l'altra, e cambia l'anteprima. Un
puntino accanto a un dispositivo dice che lì l'elemento ha delle modifiche.

Funziona a cascata, **dal più grande al più piccolo**:

- quello che imposti su **Computer** vale ovunque;
- quello che imposti su **Tablet** vale sui tablet, e anche sui telefoni se lì non
  scegli altro;
- quello che imposti su **Telefono** vale solo sui telefoni.

Così puoi avere un titolo grande sul computer e più piccolo sul telefono,
cambiando solo quello che serve: il resto lo eredita.

### Nascondere un elemento su un dispositivo

Nella scheda **Avanzate**, in *Visibilità per dispositivo*, c'è l'interruttore
**Nascondi su Computer** (o Tablet, o Telefono). Anche qui vale la cascata.

- Nascosto su **Computer**, sparisce anche su Tablet e Telefono. Se lo vuoi
  vedere su uno di quei due, passa a quel dispositivo e premi **Mostra su questo
  dispositivo**.
- Se cambi idea, lo stesso bottone diventa **Nascondi come su Computer** e
  rimette le cose come sul dispositivo più grande.
- Nascosto solo su **Telefono**, resta visibile su Tablet e Computer.

Sotto l'interruttore un piccolo riepilogo dice, per i tre dispositivi, se
l'elemento è *visibile* o *nascosto* e da dove arriva la scelta. Nell'anteprima
un elemento nascosto sparisce davvero: per ritrovarlo passa a un altro
dispositivo, oppure usa il percorso in alto o *Cosa contiene* della sua sezione.

«Mostra su questo dispositivo» rimette l'elemento **come lo prevede il sito**, non
lo fa comparire per forza: se il sito stesso lo nasconde su quello schermo (i link
social del menu laterale sul telefono, per esempio), resta nascosto.

### Larghezza e ripristino

Sempre in **Avanzate**:

- **Larghezza massima** — quanto può allargarsi l'elemento, in pixel o in
  percentuale dello spazio che ha intorno;
- **Ripristina lo stile di questo elemento** — toglie font, colori, sfondo,
  spazi, bordi, effetti, visibilità e larghezza su tutti e tre i dispositivi.
  Chiede conferma (*Ripristinare lo stile?*). Testo, immagini e posizione restano
  come sono, e finché non salvi si torna indietro con Annulla. Sopra il bottone
  c'è scritto su quali dispositivi l'elemento ha uno stile cambiato.

La sezione *La diretta* e il *Monitor del player* hanno meno scelte degli altri:
il perché sta nel capitolo 26.

---

## 11. Le parti guidate dai dati

Alcune parti della pagina non sono testi fissi: sono elenchi e impostazioni.
Clicca la parte nell'anteprima (o un suo spazio vuoto, o sali con `Esc` da un
testo che ci sta dentro) e i suoi controlli compaiono nella scheda **Contenuto**,
con il nome della parte e una riga che spiega cosa fa.

| Parte | Dove la clicchi nell'anteprima | Cosa cambi |
|---|---|---|
| **Link social** | le icone social del menu laterale, oppure i profili in *Dove mi trovi* | *Profili social*: nome, come ti chiami là, link, icona, ordine. Valgono in tutti e due i punti |
| **Riquadro di stato** | il riquadro delle spie nella *Copertina* | le parole delle spie (in onda, fuori onda, controllo in corso), le etichette «prossima diretta» e «ultima diretta», *Ultima diretta*; in fondo il riepilogo della schedule con **Modifica la schedule** |
| **Monitor del player** | la cornice del player nella *Diretta* | la riga sotto lo schermo, i bottoni della chat, il testo del link al canale, il nome del canale su Twitch |
| **Profilo del sito** | la tessera o il bottone *Collegati con Twitch* in cima alla *Diretta* | capitolo 19 |
| **Il pollo** | la mascotte accanto al player | capitolo 22 |
| **Modalità lurk** | il riquadro sotto il player | capitolo 20 |
| **Le clip** | l'invito in fondo alla *Diretta* (titolo, riga, bottone «Vai alle clip») e la pagina `clip.html` | capitolo 21 |
| **Nastro della settimana** | i sette giorni della *Settimana* | *Schedule della settimana*, aperta sulla linguetta **Settimana**, e le etichette scritte sui giorni |
| **Eventi speciali** | le schede fuori programma sotto il nastro (ci sono solo se c'è almeno un evento in arrivo) | *Schedule della settimana*, aperta sulla linguetta **Eventi speciali**, il titolo del riquadro e l'etichetta degli eventi |
| **Listino del supporto** | l'elenco delle righe in *Come dare una mano* | *Righe del listino* |

Due casi particolari:

- Il **disegno del pollo** è un'immagine: il clic lo seleziona come immagine, e
  `Esc` sale alla parte. La piccola «x» accanto al pollo seleziona direttamente la
  parte.
- **Profilo del sito, Il pollo, Modalità lurk e Le clip si possono spegnere**, e
  una parte spenta non è nella pagina, quindi nell'anteprima non si clicca. Si
  riaccende dalla sezione *La diretta* (capitolo 12, *Parti che si possono
  spegnere*). I suoi campi si raggiungono anche da spenta con la ricerca `Ctrl+K`.
  Se spegni una parte dal suo stesso interruttore, il pannello ti porta sulla
  *Diretta*, dove si riaccende.

### Gli elenchi: social e listino

I social e le righe del listino sono **elenchi**: si comportano tutti allo stesso
modo.

1. Clicca la parte (i social o il listino).
2. In fondo all'elenco premi **Aggiungi una voce**: nasce una voce vuota, già
   aperta.
3. Riempi i campi: nome, link, icona, e quello che c'è.
4. **Salva**.

Sulla riga di ogni voce ci sono tre bottoni: **freccia su** e **freccia giù**
cambiano l'ordine in cui compaiono sul sito, il **cestino** elimina la voce
chiedendo conferma prima. Cliccando il titolo della voce la chiudi o la riapri.

Gli elenchi di frasi (quelle del pollo, per esempio) funzionano uguale, con
**Aggiungi una riga**.

> **Un social che non hai ancora**: lascia il campo del link **vuoto**. La voce
> resta nel pannello ma **non compare sul sito**, invece di comparire come un link
> rotto. Lo stesso vale per una riga del listino senza link.

Mentre scrivi in una voce l'anteprima si rifà da sola dopo un attimo: il campo
in cui stai scrivendo non perde il cursore.

### La schedule della settimana

La schedule è quello che si vede nella sezione *La settimana*: i sette giorni come
locandine, gli eventi speciali con la loro data e il fondale dietro la sezione. Dagli
stessi dati nascono il conto alla rovescia della copertina e gli orari scritti
nella pagina: cambiarli qui li cambia dappertutto.

**Come ci arrivi.**

- **Clicca un giorno** nella *Settimana*: si apre l'editor proprio su quel giorno.
  Se è un giorno di riposo, il pannello ti porta sulla sua riga con il fuoco
  sull'interruttore che lo accende.
- **Clicca un evento speciale** sotto il nastro: si apre quell'evento.
- Dal *Riquadro di stato* della copertina: in fondo c'è il riepilogo della schedule
  con il bottone **Modifica la schedule**, che seleziona il nastro e ci scorre.
- Con la ricerca: `Ctrl+K` e «schedule».

In cima all'editor c'è il **riepilogo**: quante dirette a settimana, ora e durata
di serie, fuso, quanti eventi in arrivo, i sette giorni in miniatura (accesi in
ciano, con la loro locandina in trasparenza: un clic apre il giorno) e, se c'è, il
prossimo evento o quello in onda.

Sotto ci sono tre **linguette**: **Settimana** (con quanti giorni sono accesi, per
esempio *4/7*), **Eventi speciali** (con quanti eventi ci sono) e **Fondale**
(*Acceso* o *Spento*). Una linguetta con un pallino rosso ha un errore dentro. Da
tastiera, con il fuoco su una linguetta, le frecce passano alle altre, `Inizio` e
`Fine` alla prima e all'ultima.

#### Settimana: giorni, ore, schede

In alto l'**orario di serie**, che vale per ogni giorno acceso che non ha un orario
suo:

- **Ora di serie** — scritta come `21:00`;
- **Durata di serie** — in ore, da mezz'ora a 24, a passi di mezz'ora (`4`, `2,5`);
- **Fuso orario** — lascialo su `Europe/Rome` a meno che il canale non abbia
  traslocato; scrivendo, il pannello propone i nomi dei fusi.

Sotto ci sono **i sette giorni**, da lunedì a domenica. Ogni riga ha:

- l'**interruttore** — accende o spegne la diretta di quel giorno. Accendendolo il
  giorno si apre da solo;
- il nome e un **riassunto**: *21:00–01:00 · titolo* per un giorno acceso, *Riposo*
  per uno spento (con *· scheda tenuta da parte* se la scheda ha qualcosa dentro);
- il segno **Orario suo** quando quel giorno ha un'ora o una durata diverse da quelle
  di serie;
- la sua locandina in piccolo, se ha un'immagine.

Un clic sul nome apre la **scheda del giorno** (una alla volta; un giorno spento non
si apre):

- **Ora di inizio** e **Durata (ore)** — vuote valgono quelle di serie, e la casella
  vuota te lo ricorda (*21:00 (di serie)*). Scrivile solo se quel giorno è diverso.
  L'ora si può battere anche come `2130` o `9`: uscendo dalla casella diventa
  `21:30` o `09:00`. Sotto, una riga rilegge il risultato: *In onda dalle 21:00 alle
  01:00 del giorno dopo · 4 h*;
- **Titolo** (fino a 40 caratteri), **Gioco** (40) e **Nota** (120, una riga in più
  sotto titolo e gioco) — facoltativi, su una riga sola, con il contatore. Un a capo
  incollato diventa uno spazio;
- **Immagine di sfondo** — il blocco immagine, qui sotto.

Un giorno spento **tiene la sua scheda**: sul sito non stampa niente di suo, ma
riaccendendolo ritrovi titolo, gioco, nota e immagine com'erano.

#### Eventi speciali

Un evento è una diretta **fuori programma con una data precisa**: una maratona, uno
speciale.

- **Aggiungi evento** ne crea uno già aperto, con la data di oggi e l'ora e la
  durata di serie, e il cursore sul titolo. Accanto c'è il conto, per esempio
  *2 / 8*: gli eventi sono **al massimo otto**, e all'ottavo il bottone si spegne e
  il pannello lo dice.
- L'elenco è in ordine di data: prima quelli in arrivo, poi quelli con la data
  ancora da sistemare, poi, sotto **Passati**, quelli finiti. Ogni riga ha la data
  come un foglio di calendario, il titolo, l'orario con la durata e il gioco, e i
  segni **In onda** o **Passato**.

Dentro un evento:

- **Data**, **Ora di inizio** e **Durata (ore)** — tutte e tre obbligatorie; la
  durata va da mezz'ora a 72 ore, a passi di mezz'ora. Sotto, una riga rilegge
  l'orario con i giorni veri, per esempio *dalle 15:00 di domenica 27 settembre alle
  03:00 di lunedì 28 settembre · 12 h*. Finché data, ora e durata non sono giuste,
  la riga lo dice e l'evento non compare sul sito;
- **Titolo** — obbligatorio, fino a 40 caratteri;
- **Gioco** (40) e **Nota** (160);
- **Immagine di sfondo** — il blocco immagine, qui sotto. Un'immagine verticale,
  come la locandina «STARTING» della libreria, ci sta bene;
- **Elimina evento** — chiede conferma. Finché non chiudi il pannello, l'evento
  eliminato torna con **↶**.

Un evento **finito** resta nel pannello, segnato *Passato*, ma dal sito sparisce da
solo: la pagina pubblicata non mostra gli eventi già finiti quando è stata
pubblicata, e quelli che finiscono dopo li toglie il sito mentre gira. Per fare posto
a un evento nuovo, elimina quelli passati.

#### Fondale

L'immagine dietro tutta la sezione *La settimana*, sfumata ai bordi e velata come il
fondale della copertina. Ha lo stesso blocco immagine dei giorni, con
**Intensità** al posto del velo. Di partenza c'è la città con le barre di luce, a
intensità 30. Con la linguetta *Fondale* aperta, nell'anteprima si contorna tutta la
sezione.

#### Il blocco immagine

È uguale per i giorni, gli eventi e il fondale.

- **L'immagine** — se non c'è, il riquadro dice *Nessuna immagine* e che cosa
  succede senza: una locandina si disegna lo stesso, con i colori del sito; la
  sezione senza fondale resta sul suo fondo scuro. Se c'è, sopra compare il nome del
  file.
- **Scegli dalla libreria**, **Carica dal computer** (PNG, JPG, WEBP o SVG; una foto
  grande la alleggerisce il pannello, capitolo 8) oppure **trascina un file** sul
  riquadro. **Togli** la toglie da qui; il file resta nella libreria.
- **Il punto di fuoco** — il punto dell'immagine che deve restare **sempre in
  vista**. Sul computer la locandina di un giorno è verticale, sul telefono è una
  fascia orizzontale: l'immagine si taglia per forza, e il fuoco dice che cosa tenere.
  Clicca o trascina sull'immagine, dove c'è il mirino; da tastiera le frecce spostano
  di 1, `Maiusc` + frecce di 10, `Inizio` torna al centro, come il bottone
  **Centra**. Sotto, *Fuoco 50 · 50* dice dov'è. Un'immagine appena scelta riparte
  sempre dal centro.
- **I ritagli Computer e Telefono** — due miniature che mostrano che cosa resta in
  vista con quel fuoco sui due schermi, con le proporzioni vere della pagina.
- **Velo** (giorni ed eventi) — da 30 a 90, di serie 60: quanto si scurisce
  l'immagine sotto le scritte. Più velo, testo più leggibile e immagine più scura.
  Le scritte restano leggibili anche al minimo, perché hanno una sfumatura loro.
- **Intensità** (solo il fondale) — da 0 a 100, di serie 30: quanto si vede il
  fondale. A 0 dice *Spenta*, e sul sito l'immagine non viene nemmeno scaricata.

Fuoco, velo e intensità si vedono **subito nell'anteprima**, mentre trascini o
sposti il cursore. Un'immagine che non si trova più (un file cancellato a mano) lo
dice nel riquadro: sceglila di nuovo o toglila.

#### Errori

Le regole sono quelle del server, quindi il pannello non lascia passare niente che
il salvataggio rifiuterebbe. L'errore compare **accanto alla casella** quando ne
esci (mentre scrivi può solo sparire, così un'ora a metà non ti sgrida), la riga
chiusa del giorno o dell'evento dice quanti errori ha (*1 errore*), e la linguetta ha
il pallino rosso. Premendo **Salva** con degli errori il pannello non salva, apre il
primo posto da correggere e ci mette il fuoco. Finché un orario è sbagliato, i
riassunti dicono *Orario da correggere* invece di fare un conto su un valore che non
hai scritto.

#### Con l'anteprima

- Il giorno o l'evento aperto nel pannello ha un **contorno ciano** nell'anteprima,
  che ci scorre quando lo apri dal pannello.
- **↶** e **↷** funzionano anche qui: l'editor si ridisegna con i dati di prima e
  riapre la stessa linguetta e lo stesso giorno.
- Nell'anteprima non ci sono le **date** sui giorni, i segni **Oggi**, **Prossima** e
  **In onda**, né l'ora di chi guarda: li aggiunge il sito mentre gira (capitolo 26).

#### Sul sito

- **Sul computer** (da 1100 pixel) i sette giorni stanno in una riga: i giorni di
  diretta sono locandine alte, con l'immagine, la data e il giorno in alto e ora,
  titolo, gioco e nota in basso; i giorni di riposo sono strisce strette e spente.
- **Su tablet e telefono** i giorni vanno uno sotto l'altro: quelli di diretta sono
  fasce orizzontali con l'immagine ben visibile, quelli di riposo righe sottili.
  Niente scorrimento di lato.
- **Gli eventi speciali** stanno sotto il nastro, fino a due per riga, con la
  locandina, la data grande e l'etichetta *Speciale*.
- Mentre gira, il sito scrive sopra ogni giorno la **data** della sua prossima volta
  (*22 set*) e tre segni: **Oggi** (una barra magenta), **Prossima** (un contorno
  viola) e **In onda** (un contorno rosso con la spia). Un giorno la cui data
  coincide con quella di un evento speciale prende l'etichetta *Speciale*. Chi guarda
  da un altro fuso vede sotto l'ora anche la sua: *Da te 15:00*.
- **Un evento in corso ha la precedenza su tutto.** Il giorno la cui diretta regolare
  gli finisce sotto si legge spento — orario sbarrato, sotto il titolo dell'evento — e
  non è più né *Prossima* né *In onda*: in onda c'è l'evento. Quando l'evento finisce
  il giorno torna quello di sempre da solo, senza ripubblicare il sito.
- Il **conto alla rovescia** della copertina va verso la partenza più vicina, che sia
  una serata normale o un evento speciale, con l'ora e la durata di ogni giorno.

Le parole *Diretta*, *Riposo*, *Oggi*, *Prossima*, *In onda*, *Da te*, *Speciale* e
il titolo *Fuori programma* sopra gli eventi si cambiano sotto l'editor, nelle parti
**Nastro della settimana** ed **Eventi speciali**. Quando non ci sono eventi in
arrivo la parte *Eventi speciali* non è nella pagina: i suoi due testi si trovano con
`Ctrl+K`.

---

## 12. Le sezioni della pagina

Le sezioni, dall'alto in basso come sono di partenza:

| Sezione | Cosa contiene |
|---|---|
| **Menu laterale** | il nome del canale, le voci che portano alle sezioni, la spia di stato e i link social. Sul computer sta di lato; su tablet e telefono diventa la barra in basso |
| **Copertina** | la prima schermata: il titolo grande, le spie di stato, i due bottoni e i quattro numeri del canale |
| **La diretta** | il player di Twitch con la chat, il profilo del sito, il pollo, la modalità lurk e la vetrina delle clip |
| **La settimana** | il nastro dei sette giorni, gli eventi speciali, il fondale dietro la sezione, la nota e il bottone in fondo |
| **Chi sono** | il racconto, la citazione, le note a margine e il ritratto |
| **Come dare una mano** | il listino del supporto, il testo di apertura e la riga di chiusura |
| **Dove mi trovi** | i profili social, l'email con i bottoni per copiarla o scrivere, la riga di chiusura |
| **Piede della pagina** | copyright, avvertenza sui marchi e nota finale |

### Selezionare una sezione

Clicca uno spazio vuoto della sezione, oppure il suo nome nel Navigatore, oppure
sali con `Esc` da qualcosa che ci sta dentro. Nella scheda **Contenuto** trovi:

- **Mostra questa sezione** — l'interruttore. Spento, la sezione sparisce dalla
  pagina, dal menu laterale e dai link che la puntano (capitolo qui sotto).
  Accanto c'è scritto cosa succede. Appena la spegni la sezione esce
  dall'anteprima, e il pannello ti ricorda che si riaccende dall'occhio del
  Navigatore;
- per **La diretta**, **Parti che si possono spegnere**: *Permetti di collegarsi
  con Twitch*, *Mostra la modalità lurk*, *Mostra il pollo*, *Mostra le clip*. Una
  parte spenta non viene nemmeno scritta nella pagina;
- **Cosa contiene** — le *Parti con i loro dati*, i *Blocchi* e i *Testi e
  immagini* della sezione. Un clic seleziona quella cosa nell'anteprima, e passando
  col mouse la vedi evidenziata. Quello che sul dispositivo attuale non si vede è
  segnato *non si vede qui*;
- **Testi che non si vedono in pagina** — i campi della sezione che nell'anteprima
  non si possono cliccare: righe lette solo dai lettori di schermo, testi che il
  sito scrive da solo mentre gira, parole attaccate a un'icona o a un numero (la
  riga del copyright, i bottoni dell'email, la riga sotto il nome del canale). Si
  cambiano da qui.

Tre sezioni **non si spengono e non si spostano**, e al posto dell'interruttore
hanno un lucchetto con il perché: il **Menu laterale** (porta a tutte le altre),
la **Copertina** (sta sempre prima: contiene il titolo principale della pagina) e
il **Piede della pagina**.

### Riordinare e nascondere: il Navigatore

Il Navigatore è l'elenco delle sezioni. Lo trovi nella vista **Pagina**, sotto
*Sezioni della pagina*, e in menu ☰ → **Struttura della pagina**.

- Il **Menu laterale** è in cima e il **Piede della pagina** in fondo, con la
  scritta *sempre*. La **Copertina** è la prima, con la scritta *fissa*.
- **Clicca un nome** per andare a quella sezione nell'anteprima e selezionarla.
  Passando col mouse, la sezione si evidenzia.
- Per **cambiare l'ordine**: trascina la maniglia a sinistra del nome, oppure usa
  i bottoni **↑** e **↓**. Da tastiera, con il fuoco sulla maniglia, le frecce su e
  giù spostano la sezione e `Inizio` e `Fine` la portano al primo o all'ultimo
  posto libero.
- L'**occhio** mostra o nasconde la sezione sul sito. Le sezioni nascoste restano
  nell'elenco con la scritta *nascosta*.

Dopo uno spostamento o una riaccensione l'anteprima si rifà e scorre fino a quella
sezione.

### Cosa succede al menu laterale

Il menu laterale segue da solo le sezioni:

- ha **una voce per ogni sezione accesa**, nello stesso ordine della pagina;
- una sezione nascosta **non ha voce**, e i link che la pagina stessa ha verso di
  lei spariscono. Per esempio, con *La diretta* spenta, dalla copertina spariscono
  il bottone che porta al player e la freccia per scendere: non restano link
  morti;
- le voci restano **al massimo sei**, come prima: il menu è pensato perché sei
  etichette stiano anche sul telefono più stretto.

Una sezione nascosta non viene scritta nella pagina, ma **i suoi contenuti restano
tutti salvati**: riaccendendola torna com'era. Come tutto il resto, sul sito vero
cambia dopo **Salva** e **Pubblica**.

> Spegnere **La diretta** toglie dalla pagina anche il player, il pollo, la
> modalità lurk e le clip. È l'unico modo di togliere il player: nascosto,
> trasparente o rimpicciolito non si può (capitolo 26).

---

## 13. Spostare e ridimensionare i blocchi

Le sezioni sono fatte di **blocchi**: gruppi di cose che stanno insieme. Un
blocco si può spostare e ridimensionare **dentro la sua sezione**, e la posizione
vale **solo per il dispositivo** che hai scelto nella barra.

| Sezione | Blocchi |
|---|---|
| Copertina | Quadro comandi · I quattro numeri |
| La settimana | Titolo e introduzione · Nastro dei sette giorni · Eventi speciali (solo con almeno un evento in arrivo) · Nota e bottone |
| Chi sono | Racconto · Note a margine · Ritratto |
| Come dare una mano | Titolo e introduzione · Listino · Riga di chiusura |
| Dove mi trovi | Titolo e social · Contatti · Riga di chiusura |
| Piede della pagina | Copyright · Avvertenza sui marchi · Nota finale |

Il *Menu laterale* e *La diretta* non hanno blocchi spostabili.

**Come si seleziona un blocco.** Se clicchi un testo, selezioni il testo: premi
`Esc` o **Seleziona il contenitore** finché nel percorso compare il nome del
blocco. Oppure seleziona la sezione e clicca il blocco in *Cosa contiene*. Un
blocco spostabile ha il simbolo **✥** davanti al nome nell'etichetta. Per vedere
dove sono tutti i blocchi, menu ☰ → **Mostra i contorni dei blocchi
nell'anteprima**.

**Come si sposta.**

- Trascina il blocco (o la sua etichetta) per spostarlo.
- Trascina i quadratini sugli angoli e sui lati per cambiarne la misura.
- Il blocco si aggancia a una griglia invisibile, un centesimo della larghezza per
  volta. Tieni premuto `Maiusc` mentre trascini per muoverlo liberamente. `Esc`
  durante il trascinamento lo annulla.
- Da tastiera: le **frecce** spostano di 1, **`Maiusc` + frecce** di 5, **`Alt` +
  frecce** cambiano la misura.
- Nella scheda **Avanzate**, sotto *Posizione · Computer* (o Tablet, o Telefono),
  puoi scrivere i numeri: **Da sinistra**, **Dall'alto**, **Larghezza**, **Altezza
  minima**. Sono percentuali della larghezza della sezione, anche in verticale.

Sopra i numeri c'è scritto se il blocco ha una *Posizione libera* su quel
dispositivo o una *Posizione automatica* (segue l'impaginazione del sito), e se ha
una posizione libera anche su altri dispositivi.

Tre cose importanti:

- **La posizione vale solo per il dispositivo che hai scelto.** Se sposti un blocco
  su Computer, su Tablet e Telefono resta dov'era.
- **Quello che non sposti resta al suo posto**, con l'impaginazione del sito.
- **Quando sposti il primo blocco di una sezione, gli altri si fermano dove sono.**
  Altrimenti, uscito un blocco, gli altri risalirebbero a riempire il buco.

I bottoni della scheda Avanzate:

- **Riporta al posto originale** — il blocco torna dov'era, su questo dispositivo.
  Se gli altri blocchi erano stati fermati solo per fargli spazio e non li hai più
  toccati, tornano a posto anche loro;
- **Fissa gli altri blocchi** — blocca adesso tutti i blocchi della sezione dove
  si trovano, così li sposti uno per uno senza che saltino;
- **Riporta tutto il riquadro** — tutti i blocchi della sezione tornano come nel
  sito, su questo dispositivo.

Prima di spostare blocchi leggi il capitolo 26: quando un blocco esce dal suo posto
la sezione può cambiare un poco di altezza, e un blocco reso molto stretto può
schiacciarsi.

---

## 14. Il menu ☰

Qui ci sono le cose che non stanno su un punto preciso della pagina. Il menu si
apre col bottone **☰** in alto a sinistra e si chiude premendolo di nuovo o con
`Esc`. Ogni voce si apre dentro il pannello, con **Torna all'editor** in cima; un
clic nell'anteprima fa tornare all'editor anche lui.

| Voce | Cosa c'è |
|---|---|
| **Impostazioni del sito** | colori, font (anche caricati da te) e forma di tutto il sito — capitoli 15 e 16 |
| **Struttura della pagina** | ordine e visibilità delle sezioni: il Navigatore — capitolo 12 |
| **Canale, contatti e immagini** | canale Twitch, email, numeri del canale, immagini del sito |
| **Google e social** | come appare il sito nelle ricerche e nei link condivisi |
| **Immagini** | la libreria: carica e gestisci i file — capitolo 8 |
| **Copie di sicurezza** | torna a com'era il sito prima di una pubblicazione — capitolo 23 |
| **Password** | cambia la password del pannello |
| **Esci** | chiude la sessione |

Sotto le voci ci sono due gruppi di comandi.

**Pannello**

- **Mostra i nomi tecnici dei campi** — acceso, sotto ogni etichetta compare il
  nome vero della chiave (per esempio `deck.titolo`). Serve solo se stai parlando
  al telefono con chi ha scritto il sito.
- **Mostra i contorni dei blocchi nell'anteprima** — un tratteggio intorno a
  sezioni e blocchi spostabili.
- **Ricarica l'anteprima** — richiede di nuovo la pagina al server, con le
  modifiche in corso.

**Sito**

- **Apri il sito pubblicato** — il sito vero, in una scheda nuova.
- **Apri la bozza salvata in una scheda nuova** — la bozza già salvata sul server,
  senza le modifiche non salvate.

### Canale, contatti e immagini

I dati tecnici: da qui passano il player, il conto alla rovescia e le immagini del
sito. *Nome del canale su Twitch*, *ID numerico del canale*, *Domini autorizzati al
player*, *Indirizzo pubblico del sito*, *Indirizzo email pubblico*, *Ultima
diretta*, i numeri del canale (follower, abbonati, spettatori medi…) e le immagini:
avatar, banner della copertina, mascotte, immagine di anteprima per i social,
icona della linguetta.

L'email che si vede in *Dove mi trovi* non si clicca nell'anteprima: si cambia da
qui.

### Google e social

Quello che si vede nella linguetta del browser, su Google e quando il link viene
incollato in chat: *Titolo della pagina*, *Descrizione per i motori di ricerca*,
*Descrizione per i social*, *Descrizione dell'immagine di anteprima*. Questi testi
non stanno su nessun punto visibile della pagina, quindi si cambiano solo da qui
(l'immagine di anteprima stessa sta in *Canale, contatti e immagini*).

### Password

Per cambiare la password con cui entri: **Password attuale**, **Password nuova**
(almeno 8 caratteri), **Ripeti la password nuova**, poi **Cambia la password**.

- Serve scrivere anche quella di adesso: un computer lasciato aperto non basta a
  cambiarla. Se è sbagliata, il pannello lo dice sotto i campi; dopo cinque
  tentativi sbagliati bisogna aspettare un po' prima di riprovare.
- Appena la cambi, **gli accessi aperti su altri computer o in altre schede vengono
  chiusi**: lì bisognerà rientrare con la password nuova. Tu resti dentro.

Se la password l'hai persa, da qui non si recupera: capitolo 3.

---

## 15. Impostazioni del sito: colori, combinazioni pronte, font e forma

Menu ☰ → **Impostazioni del sito** cambia il sito **intero** in una volta: non è
l'aspetto di un elemento, è la pelle di tutti. In cima quattro bottoni ti portano
alla parte che serve: **Combinazioni pronte**, **Colori**, **Font**, **Forma e
sfondo**.

Le modifiche si vedono subito nell'anteprima; sul sito arrivano dopo **Salva** e
**Pubblica**, dentro `css/tema.css`.

### Combinazioni pronte

Cinque bottoni, ognuno vestito dei propri colori: *Regia viola*, *Officina ambra*,
*Sala verde*, *Neon magenta*, *Carta chiara*. Un clic riscrive tutti i colori e i
font qui sotto. È il modo più veloce per capire dove si vuole andare: provale, poi
correggi a mano quello che non ti torna. Un clic su una combinazione conta come
una modifica sola: **↶** la toglie tutta.

Accanto c'è **Ripristina i colori di partenza**, che rimette tutto com'era: chiede
conferma (*Rimetto i colori di partenza?*), perché butta via le prove che hai fatto.

### Colori

In cima alla parte dei colori c'è **Si legge?**: il riepilogo del contrasto dei
colori del testo sul fondo (titoli e testo forte, paragrafi, note ed etichette,
viola per scrivere). Se uno scende sotto 4,5:1, lo dice.

Sotto, i dodici colori. Ognuno ha tre cose: il quadratino che apre il selettore del
sistema, la casella dove puoi incollare il codice (si scrive per esteso, `#8b2fff`:
sei cifre dopo il cancelletto, non tre) e — sotto — **il rapporto di contrasto**.

Gli elementi a cui nella scheda Stile hai dato un colore del tema cambiano insieme a
lui.

### Che cos'è il contrasto e quando preoccuparsi

Il contrasto è quanto un colore stacca da quello che ha dietro. Si misura con un
numero da 1 a 21: 1 vuol dire due colori identici, 21 è nero su bianco. Le regole
internazionali di accessibilità (le WCAG) dicono che il testo normale deve stare
**almeno a 4,5:1**, altrimenti chi ha la vista stanca, uno schermo scadente o il
sole in faccia semplicemente non lo legge.

Il pannello te lo calcola mentre scegli e ti dice il verdetto:

| Cosa leggi | Vuol dire | Che fare |
|---|---|---|
| **AAA** | oltre 7:1 | Perfetto. |
| **AA** | fra 4,5:1 e 7:1 | Va bene, anche per il testo piccolo. È l'obiettivo. |
| **solo testo grande** | fra 3:1 e 4,5:1 | Regge solo per i titoloni. Su un colore di testo, **cambialo**. |
| **insufficiente** | sotto 3:1 | Non si legge. Da correggere sempre. |

Sotto trovi anche una riga di prova — *«Aa — testo di prova, 21:00»* — scritta
davvero con quella coppia di colori. Se non la leggi lì, non la leggerà nessuno
sul sito.

I tre colori del testo (*titoli e testo forte*, *paragrafi*, *note ed etichette*)
sono quelli su cui vale la pena essere pignoli: sono le parole che la gente deve
leggere. Sul viola dei bottoni o sul colore «in onda» un contrasto un po' più
basso si può accettare, perché lì non c'è testo lungo.

### Il fondo chiaro

Se metti un **fondo chiaro** succedono due cose. Una la fa il sito da solo: le
righine e i vetri dei riquadri, che sul nero sono bianchi, diventano scuri, se no
sparirebbero. L'altra tocca a te: i tre colori del testo erano chiari perché il
fondo era nero, e su carta bianca non si vedono più. Controlla il contrasto di
tutti e tre subito dopo aver cambiato il fondo — o parti dalla combinazione pronta
*Carta chiara* e ritocca da lì.

### Font

Tre menu: **Font dei titoli**, **Font del testo** e **Font della strumentazione**
(le etichette maiuscole, i numeri, il conto alla rovescia). Ogni menu ha le famiglie
del catalogo e, sotto *Caricati da te*, i font che hai caricato tu. Sotto al menu
c'è scritto cosa userebbe il sito se quel font non arrivasse.

Due avvertenze pratiche: i font del catalogo che non sono «di sistema» vengono
scaricati da Google e appesantiscono un po' il caricamento della pagina (sceglierne
tre diversi costa di più che tenerne due uguali), e per la **strumentazione**
conviene restare su un font a larghezza fissa, altrimenti il conto alla rovescia
balla a ogni secondo.

Sotto i tre menu c'è la libreria **Font caricati da te**: capitolo 16.

### Forma e sfondo

- **Arrotondamento degli angoli**: 0 è tutto squadrato. Gli angoli piccoli e
  quelli grandi si ricalcolano da questo numero.
- **Larghezza massima del contenuto**: oltre questa misura il sito smette di
  allargarsi e resta centrato. Vale anche per il player.
- **Unità di spaziatura**: tutti i margini del sito sono suoi multipli. Alzarla
  distanzia ogni cosa, non solo una sezione: si tocca con prudenza.
- **Intensità degli aloni sullo sfondo**: le macchie di colore dietro alla
  pagina. 0 = fondo piatto, 100 = come adesso, 200 = doppio.

---

## 16. I font caricati dal computer

Oltre ai font del catalogo puoi usare **font tuoi**. Stanno sul tuo server, non su
Google: il sito li serve da sé.

### Caricare un font

In menu ☰ → **Impostazioni del sito** → **Font**, scendi fino a **Font caricati da
te**.

1. Trascina il file nel riquadro, oppure premi **Scegli un file**.
2. In **Nome** il pannello propone il nome del file: cambialo se vuoi, è il nome che
   vedrai nei menu.
3. Premi **Carica il font**.

Vanno bene **WOFF2, WOFF, TTF e OTF**, fino a **2 MB**. Se un file è più grande, di
solito la versione WOFF2 dello stesso font pesa molto meno. Il server riconosce il
formato **da quello che c'è dentro il file**, non dal nome: un file rinominato o
rovinato viene rifiutato con un messaggio, e anche una raccolta di più font (`.ttc`),
perché il sito ne usa uno alla volta.

Usa solo font che hai il diritto di mettere su un sito: quelli con licenza libera
come la SIL Open Font License vanno benissimo.

Caricato il font, **il sito non cambia**: compare nell'elenco (scritto nel font
stesso, con formato e data) e nei menu. Si usa in due modi:

- per **tutto il sito**: sceglilo in *Font dei titoli*, *Font del testo* o *Font
  della strumentazione*, sotto *Caricati da te*;
- per **un elemento solo**: scheda **Stile** → *Tipografia* → *Font*, sotto
  *Caricati da te*.

Poi, come sempre, **Salva** e **Pubblica**. Nell'elenco ogni font dice dove è in uso
nella bozza (*In uso: Font dei titoli, lo stile di un elemento*) oppure *Non usato
nella bozza*.

### Dove finiscono

I file vanno nella cartella **`contenuti/font/`** del sito, con un nome scelto dal
server, e l'elenco sta in `contenuti/font/elenco.json`. Se il sito sta su un hosting
esterno e usi un font caricato, **quella cartella va caricata online** insieme agli
altri file, come `contenuti/media/` per le immagini. Senza, il sito online usa il
font di ripiego.

### Eliminare un font

Premi **Elimina** accanto al font.

- **Se la bozza non lo usa**, il pannello chiede *Elimino questo font?*: il file
  viene cancellato dal server e non si recupera. **Elimina** conferma.
- **Se la bozza lo usa**, il pannello chiede *Elimino un font che stai usando?* ed
  elenca dove. **Elimina lo stesso** lo cancella, e subito dopo: i font del sito che
  lo usavano tornano al **font di partenza**, e gli elementi che lo usavano nella
  scheda Stile tornano al font del sito. Sono modifiche non salvate: guarda
  l'anteprima e poi **Salva**.
- **Se lo usa solo la versione salvata** (l'hai già tolto dalla bozza ma non hai
  ancora salvato), compare una seconda domanda, *Il font è usato nella versione
  salvata*. Confermando, il font si cancella e al prossimo salvataggio lì torna il
  font di partenza.

Se un font cancellato rientra nella bozza (con Annulla, o ripristinando una copia di
sicurezza), sotto il suo menu compare *Questo font caricato non c'è più: scegline un
altro*. Il salvataggio non si blocca: al suo posto il server rimette il font di
partenza. Le copie di sicurezza non contengono i file dei font.

---

## 17. Trovare un campo in fretta

In cima al pannello c'è la casella **Cerca un campo…** (scorciatoia: `Ctrl+K`,
`Cmd+K` su Mac; funziona anche con il fuoco nell'anteprima). Scrivi due o tre
lettere del nome del campo — «citazione», «follower», «fondo», «schedule» — e sotto
compare l'elenco di quelli che ci somigliano, con scritto dove stanno.

- Si sceglie con le **frecce su e giù** e `Invio`, o con il mouse.
- Il pannello ti porta **dove il campo sta davvero**: seleziona il testo o
  l'immagine nell'anteprima, oppure la parte che lo contiene, oppure la sezione,
  oppure apre la vista del menu giusta. Poi scorre fino al campo e lo evidenzia per
  un istante.
- Se il campo sta in una parte spenta (il pollo, le clip…), si apre una vista con i
  campi di quella parte, anche se nell'anteprima non c'è.
- `Esc` svuota la casella e chiude l'elenco.

Dentro un testo con formattazione in scrittura, `Ctrl+K` apre invece la riga del
link.

---

## 18. Guardare com'è venuto prima di pubblicare

L'anteprima al centro è già il modo di guardare: mostra il sito **con le modifiche
in corso, comprese quelle non salvate**. Scrivi, guardi, e se non ti piace torni
indietro con **↶** senza aver salvato niente.

- Testi, immagini, colori, stili e posizioni cambiano **sotto gli occhi**.
- Le modifiche che cambiano la struttura (una voce aggiunta a un elenco, una
  sezione spostata, un giorno di diretta) fanno rifare la pagina dopo un attimo di
  calma: l'anteprima tiene la posizione e l'elemento selezionato.
- **Passa da Telefono, Tablet e Computer** prima di pubblicare: uno stile o una
  posizione cambiati su un dispositivo non si vedono sugli altri.
- Se l'anteprima ti sembra indietro, menu ☰ → **Ricarica l'anteprima**.
- Per vedere il sito vero con il player e tutto il resto, menu ☰ → **Apri il sito
  pubblicato**.

### Le cose da guardare prima di mandarlo online

Subito dopo aver pubblicato può comparire un avviso intitolato **«N cose da
guardare prima di mandarlo online»**. Non è un errore e non è successo niente di
male: la pubblicazione è andata a buon fine.

Sono i controlli che nessun campo può fare da solo, perché riguardano due valori
insieme. Nessuno di questi valori, guardato per conto suo, è sbagliato:

- il sito dichiara di stare su un dominio che **non è fra quelli autorizzati per
  il player** — online resterebbe un riquadro nero al posto del video;
- manca l'**indirizzo pubblico del sito**;
- il messaggio in chat è acceso ma **manca il Client ID**;
- l'**indirizzo di ritorno del login punta altrove** rispetto al sito: dopo il
  login i visitatori finirebbero su un altro indirizzo, con il loro token
  Twitch dentro. È la trappola classica di chi ha provato in locale e poi ha
  pubblicato senza ripensarci.

L'avviso resta lì finché non lo chiudi tu, apposta: sono cose da leggere, non da
intravedere. Le stesse righe le stampa il terminale a ogni `node
server/genera.js` e a ogni avvio del server.

---

## 19. Il profilo del sito (login con Twitch)

In cima alla sezione «La diretta» può comparire un bottone **Collegati con
Twitch**. Chi lo usa si ritrova lì la propria **tessera** — immagine del profilo,
nome, e un *scollega e revoca* — come su qualunque sito dove si entra col proprio
account.

Nel pannello è la parte **Profilo del sito**: clicca la tessera o il bottone
nell'anteprima. **Di serie è spento**, e finché è spento sul sito non compare
nessun bottone e nell'anteprima la parte non c'è: si accende selezionando la sezione
*La diretta* → *Parti che si possono spegnere* → **Permetti di collegarsi con
Twitch**. Chi passa e non accende niente non deve vedersi proporre di collegare il
proprio account.

### A che serve

Tre cose, e nessuna delle tre è obbligatoria:

1. **Mettere la faccia a chi guarda dal sito.** È il motivo più semplice.
2. **Tenere aggiornata «Ultima diretta»** nella copertina: chi è collegato la
   vede aggiornarsi da sola dopo pochi secondi, perché il sito può chiedere a
   Twitch il titolo col token di quella persona. Per tutti gli altri c'è
   l'aggiornamento alla pubblicazione, spiegato in fondo a questo capitolo.
3. **Permettere il messaggio in chat della modalità lurk** (capitolo 20). Quel
   messaggio parte a nome di chi si è collegato: senza profilo non c'è nessuno a
   nome di cui scrivere, e resta spento comunque anche col suo interruttore
   acceso.

### I campi, uno per uno

**Permetti di collegarsi con Twitch** — l'interruttore principale. Spento, il
bottone *Collegati con Twitch* non compare per nessuno e il resto della parte non
ha effetto.

**Client ID dell'app Twitch** — il codice dell'applicazione che registri tu
(istruzioni nel capitolo 20, *Registrare l'applicazione su Twitch*). È pubblico
per sua natura e finisce dentro la pagina del sito: va bene così, è fatto per
essere visto. Senza, l'interruttore resta senza effetto.

**Indirizzo di ritorno dopo il login** — l'indirizzo su cui il visitatore torna
dopo aver detto sì a Twitch. Deve **combaciare carattere per carattere** con
quello registrato su Twitch, barra finale compresa. Lasciato vuoto, il sito usa
l'indirizzo della pagina in cui si trova.

**I testi** — *collegati con Twitch*, *scollega*, la riga «collegato come
{nome}», e una nota che puoi scrivere accanto al bottone per dire alla gente
perché dovrebbe collegarsi. Nella riga «collegato come» puoi scrivere `{nome}`,
che viene sostituito dal nome vero.

### Cosa il sito sa di chi si collega

Solo quello che è già pubblico sul canale di quella persona: **nome e immagine
del profilo**, e nient'altro. Nessuna email. Il permesso di scrivere in chat si
chiede **solo** se il messaggio di lurk è acceso.

Il token vive nella scheda del browser e **muore quando la scheda si chiude**:
non esiste nessun «ricorda il login», ed è voluto — quel token permetterebbe di
scrivere a nome di quella persona in *qualsiasi* canale di Twitch, non solo nel
tuo. *Scollega* non si limita a dimenticarlo: chiama davvero la revoca su
Twitch.

### «Ultima diretta» che si aggiorna da sé, per tutti

Il campo *Ultima diretta* della copertina si aggiorna da solo per chi è
collegato. Per **tutti gli altri** — cioè la quasi totalità di chi passa — resta
quello che c'era scritto al momento della pubblicazione.

Se vuoi che sia fresco anche per loro, c'è un comando da dare **una volta sola**,
sul computer dove gira il pannello:

```bash
node server/imposta-twitch.js <clientId> <clientSecret>
node server/imposta-twitch.js --prova
```

Da quel momento **ogni Pubblica** chiede a Twitch il titolo dell'ultima diretta
e lo scrive nei contenuti prima di generare la pagina. E non solo: finché il
server è acceso lo rifà **da solo ogni dieci minuti**, e se il titolo è cambiato
ripubblica senza che tu debba premere niente.

> **Una bozza salvata non viene mai pubblicata al posto tuo.** Se hai salvato
> qualcosa e non l'hai ancora pubblicato, l'aggiornamento automatico si ferma:
> aggiorna il titolo nei contenuti e ti lascia il bottone. Lo scrive nella
> finestra del server. Salva e Pubblica restano due cose diverse anche quando a
> premere è un timer.

Il pannello te lo dice a pubblicazione finita: se è andata, con un avviso
*Ultima diretta aggiornata*; se non è andata — Twitch giù, chiavi sbagliate, rete
assente — con *Ultima diretta non aggiornata*, e il titolo che c'era **resta
dov'era**. Non viene mai svuotato.

Il **client secret** serve solo a questo comando e non va scritto da nessun'altra
parte: non c'è nessun campo per lui nel pannello, e non deve essercene uno.
Finisce in `server/dati/chiavi.js` — l'unico file in cui stanno le chiavi di
questo sito — accanto alla password del pannello, in una cartella che non si
carica mai online. Da quel file il **Client ID** viene copiato da sé, a ogni
pubblicazione, nel campo qui sopra: così non è una cosa da scrivere due volte.

Se non dai quel comando non succede niente di male: *Ultima diretta* resta una
casella che riempi a mano quando ti va, nel *Riquadro di stato* della copertina o
in menu ☰ → *Canale, contatti e immagini*.

### Follower e abbonati che si aggiornano da sé

Anche i numeri del canale — i **follower** in copertina e gli **abbonati**, che
per ora il server si tiene da parte senza mostrarli — possono aggiornarsi da soli. Serve un passo in più,
sempre **una volta sola**, e lo deve fare **slayer_beard con il suo account**:
Twitch mostra gli abbonati solo al proprietario del canale.

```bash
node server/imposta-twitch.js --collega
```

Il comando scrive un codice. Apri **twitch.tv/activate** entrando come
slayer_beard, scrivi il codice e accetta: Twitch chiede soltanto il permesso di
*leggere* gli abbonati. Fatto questo, i due numeri si aggiornano a ogni
Pubblica e, col server acceso, ogni dieci minuti.

Due cose da sapere:

- **Se il server resta spento per più di un mese** Twitch fa scadere
  l'autorizzazione. Te ne accorgi dall'avviso dopo la pubblicazione: basta
  rilanciare `--collega`. Nel frattempo restano i numeri dell'ultima volta.

Per togliere l'autorizzazione: `node server/imposta-twitch.js --scollega`.

---

## 20. La modalità lurk

Sotto al video, nella sezione «La diretta» del sito, può comparire un secondo
riquadro: la **modalità lurk**. Nel pannello è la parte **Modalità lurk**: clicca il
riquadro nell'anteprima. Se è spenta non è nella pagina: si riaccende da *La
diretta* → *Parti che si possono spegnere* → **Mostra la modalità lurk**.

Nell'anteprima il riquadro è fermo (non c'è il player): le parole si vedono, il
funzionamento si prova sul sito.

### A che serve, e a chi

Twitch conta uno spettatore finché **il suo video sta girando**. Se qualcuno
lascia la pagina aperta e si allontana, prima o poi il browser mette in pausa il
video per risparmiare, e da quel momento quella persona **smette di essere
contata** — anche se è ancora lì e torna fra dieci minuti.

La modalità lurk fa una cosa sola: si accorge che il video si è fermato e lo fa
ripartire.

Due cose da sapere prima di accenderla, perché evitano una delusione:

- **Serve solo a chi guarda dal sito.** La maggior parte degli spettatori guarda
  su twitch.tv o dall'app del telefono, e per loro questa funzione non esiste
  proprio: chi arriva dal sito è una minoranza. È una comodità per quella
  minoranza, non una leva sui numeri del canale.
- **Non gonfia niente, e non è istantanea.** Non aggiunge spettatori finti:
  rimette in piedi il video di una persona vera che sta ancora guardando. E fra
  il momento in cui il video si ferma e quello in cui riparte passa comunque
  **fino a un minuto**, perché Twitch aggiorna il conteggio a scatti di circa
  sessanta secondi.

Sul **telefono non funziona**, ed è bene saperlo: iOS e Android mettono in pausa
il video appena si cambia scheda, e da un sito esterno non c'è rimedio. Il
riquadro lo dice al visitatore invece di far finta di niente — è il campo *Nota
per chi è da telefono*.

### Cosa vede lo spettatore

Il lurk **non parte mai da solo**: c'è un bottone e lo preme chi guarda. Se
quella persona l'aveva già usato, alla riapertura della pagina il riquadro se lo
ricorda, ma chiede comunque un altro clic prima di rimettersi in moto.

Acceso, mostra una riga che dice in ogni momento cosa sta succedendo. Le parole
degli stati le scrivi tu nei campi *Stato — …*:

- **spenta** — il visitatore non l'ha accesa. È lo stato di partenza.
- **il video sta andando** — tutto a posto, non c'è niente da fare.
- **il video si è fermato** — il browser l'ha messo in pausa: sta per riprovare.
- **sto riavviando** — ci sta provando. Fra un tentativo e l'altro aspetta
  sempre di più: 5 secondi, poi 15, poi 45, poi 2 minuti.
- **riproduzione bloccata dal browser** — il browser ha vietato la partenza
  automatica del video. Serve un clic della persona: da qui non si rimedia.
- **canale fuori onda** — la diretta non c'è. Non c'è nessuna sessione da
  tenere viva: il lurk aspetta e non tocca più niente.
- **spenta perché il canale è finito** — la diretta è finita mentre il lurk era
  acceso, e il lurk si è spento da solo.
- **ho smesso di provarci** — i tentativi sono finiti. Si riparte ricaricando la
  pagina.
- **comandi del player non disponibili** — un blocco della pubblicità sta
  fermando il programma di Twitch che comanda il video.

Sotto alla riga di stato c'è un contatore, del tipo «viva da 1h 12m · 2
riavvii», e i bottoni per attivare, disattivare e togliere il muto.

### I campi, uno per uno

**Mostra la modalità lurk** — l'interruttore principale. **Spento, il riquadro
non compare per nessuno** e il resto della parte non ha più effetto. È il modo
di togliere tutto di mezzo.

**Titolo del pannello** — l'intestazione del riquadro.

**Cosa fa, spiegato al visitatore** — il paragrafo sotto al titolo. Tienilo
onesto: il sito riavvia il video, non «tiene presente» nessuno per magia.

**Nota sui cookie e sui punti canale** — una riga da non togliere, perché dice
una cosa che il sito non può verificare da solo. Dentro il player incorporato la
sessione Twitch di chi guarda viaggia sui **cookie di terze parti**: se il suo
browser li blocca — Safari lo fa da anni, gli altri li stanno restringendo —
quella persona **conta per il canale ma non per sé**: niente punti canale,
niente watch streak. Il sito non se ne può accorgere, perché il player è di un
altro sito e sta dentro una finestrella chiusa. Quindi si dice una volta, in
chiaro, e si lascia lì il collegamento a twitch.tv: chi tiene alla propria
streak deve guardare da lì, anche se questo vuol dire mandarlo via dal sito.

**Nota per chi è da telefono** — il caso del telefono, spiegato qui sopra.

**Dopo quante ore chiedere «ci sei ancora?»** — da 1 a 12, di serie 3. Passate
quelle ore il riquadro chiede conferma e, se non risponde nessuno entro qualche
minuto, **si spegne da solo**.

> Non alzarlo a 12 «per comodità». Questo controllo è la cosa che distingue la
> modalità lurk dai programmi che tengono accesa una diretta per raccogliere
> punti mentre davanti allo schermo non c'è nessuno — pratica che il regolamento
> di Twitch vieta. Rimettere in piedi il video di chi è lì è una cosa; tenerlo
> acceso tutta la notte per chi se n'è andato è un'altra. Ed è anche un
> servizio: nessuno vuole scoprire di aver lasciato una diretta accesa fino al
> mattino.

**Offri di tenere acceso lo schermo** — spento di serie. Acceso, nel riquadro
compare un comando in più che impedisce allo schermo del visitatore di
spegnersi. Consuma la sua batteria, quindi resta una scelta sua: non si attiva
mai da solo insieme al lurk.

**I testi dei bottoni, delle domande e degli stati** — sono le parole che legge
chi guarda: *attiva*, *disattiva*, *togli il muto*, la domanda alla riapertura
della pagina, la domanda «ci sei ancora?», gli stati e le due righe del
contatore. Nei due campi del contatore puoi scrivere `{durata}` e `{riavvii}`,
che vengono sostituiti dai numeri veri; negli altri campi le parentesi graffe
resterebbero stampate così come sono.

Il bottone *togli il muto* merita una riga a parte. Una scheda muta viene
sospesa dal browser più facilmente di una che sta suonando, quindi togliere il
muto aiuta davvero. Ma il sito **non lo toglie mai da solo**: sarebbe il trucco
per cui Twitch ha cominciato a bloccare i video incorporati nei siti. Offre il
bottone, e lo preme chi guarda.

### Dire in chat che si sta guardando

Nella stessa parte c'è il secondo pezzo: un bottone che manda in chat **un**
messaggio a nome di chi lo preme. **Di serie è spento**, e per accenderlo devi
prima registrare un'applicazione su Twitch — le istruzioni sono più sotto.

Prima di tutto il resto, la cosa che conta:

> **Questo messaggio non fa salire il numero di spettatori.** Twitch non conta
> chi scrive in chat: conta chi ha il video acceso. Se lo accendi sperando di
> vedere il contatore salire, resterai deluso. Serve a un'altra cosa — farsi
> vedere da chi legge la chat e da chi sta trasmettendo — e va acceso solo se è
> quella che vuoi.

**Permetti di dire in chat che si sta guardando** — l'interruttore. Anche
acceso, resta senza effetto finché non ci sono il **profilo del sito** acceso
col suo Client ID (capitolo 19) e almeno una frase.

> Il Client ID e l'indirizzo di ritorno **non stanno qui**: sono del profilo
> del sito, perché il login non è una cosa della modalità lurk — si può entrare
> col proprio account anche col lurk spento. Il messaggio in chat è soltanto uno
> degli usi di quel collegamento.

**Frasi del messaggio di lurk** — l'elenco da cui il sito pesca. Leggi il
riquadro qui sotto **prima** di scriverle.

**I bottoni e le righe di questa parte** — l'invito che compare accendendo il lurk,
l'avviso di cosa verrà detto in chat, il bottone *dillo in chat* e la conferma
dopo l'invio. Nell'invito e nell'avviso puoi scrivere `{frase}`, che viene
sostituito dalla frase vera: **toglierlo è una pessima idea**, perché è l'unico
punto in cui chi sta per collegarsi legge che cosa verrà detto a nome suo. E
puoi scrivere `{minuti}`, che diventa l'intervallo fra un messaggio e l'altro:
per esempio *«Col lurk attivo dirò in chat, ogni {minuti} minuti, frasi come:
«{frase}»»*.

Come funziona, per quando devi spiegarlo a qualcuno:

1. Sopra al video, in cima alla sezione *La diretta*, c'è **Collegati con
   Twitch** (il testo lo scegli tu). Chi vuole entra col proprio account
   quando gli pare, come su qualunque sito. Appena l'ha fatto, al posto del
   bottone compare la sua **tessera**: l'immagine del profilo di Twitch, il
   suo nome, e il bottone per scollegarsi. Il sito non chiede niente di più
   di quello che è già pubblico sul suo canale, e non vede la sua email.
2. Chi non si è collegato se lo vede chiedere quando serve davvero. Preme
   *Attiva la modalità lurk*: il lurk **parte subito** — quella parte non ha
   mai avuto bisogno di un account — e nello stesso momento, sotto ai
   comandi, compare la domanda *«Vuoi dire in chat che stai guardando? Dirò:
   "Hey! Lurko dal sito."»*, con sotto lo stesso bottone di collegamento.
   La frase è quella vera, quella che partirà: si legge **prima** di
   collegarsi, non dopo. Sono due porte per la stessa stanza: il
   collegamento è uno solo, e vale per tutte e due.
3. Se lo preme, si apre una **finestrella** con la pagina di Twitch, che gli
   chiede se permette al sito di scrivere in chat a nome suo. Il sito **resta
   dov'è**: il video non si ferma, il lurk non si spegne. Se dice di no, o
   chiude la finestrella, non è successo niente e il lurk continua a
   funzionare.
4. Appena autorizza, la finestrella si chiude da sola, in cima alla sezione
   compare la sua tessera con avatar e nome, e — se aveva acceso il lurk —
   **parte il messaggio in chat**: quello annunciato al punto 2, con quelle
   parole esatte.
5. Da lì in avanti, finché resta su quella scheda, accendere il lurk vuol dire
   dirlo in chat: il messaggio è la conseguenza dichiarata dell'accensione, non
   un bottone in più da premere.
6. Finché il lurk resta acceso, il messaggio **si ripete da solo** ogni tot
   minuti, con le frasi a rotazione: si dicono tutte prima di ripeterne una.
   L'intervallo lo scegli tu nel campo **Ogni quanti minuti ripetere il
   messaggio in chat** (da 2 a 120, di serie 10). Si ferma quando il lurk si
   spegne, quando finisce la diretta e mentre il sito chiede «ci sei ancora?».
   Più l'intervallo è basso, più è facile che Twitch o i moderatori lo
   prendano per spam, e a rimetterci è l'account di chi guarda.

> **Se il browser blocca le finestrelle** il sito se ne accorge e passa alla
> strada lunga: va su Twitch nella stessa scheda e poi torna indietro. In quel
> caso la pagina si ricarica, quindi il lurk si spegne, il riquadro dice
> *«L'avevi lasciata accesa: la riattivo?»* e serve un secondo clic — che è
> anche quello che manda il messaggio. Al ritorno da solo **non parte mai
> niente**: una pagina ricaricata da un indirizzo qualsiasi non deve poter
> parlare a nome di chi la apre.

Non c'è nessun invio automatico e nessuna ripetizione, e non è una
dimenticanza: mandare messaggi a ripetizione a nome di qualcun altro è vietato
dal regolamento di Twitch, e comunque non aumenterebbe gli spettatori. Il
collegamento vive solo finché resta aperta quella scheda del browser, e
*scollega* non si limita a dimenticarlo: dice a Twitch di annullarlo davvero.

C'è un solo caso in cui compare un bottone in più, **Dillo in chat**: quando il
visitatore ha un adblock che blocca l'SDK di Twitch. Lì il sito non ha i comandi
del player, quindi la modalità lurk non si può nemmeno accendere e non ci
sarebbe niente a cui agganciare il messaggio — ma quella persona sta guardando
lo stesso, e resta un clic e un messaggio come tutti gli altri.

> ### La regola delle frasi
>
> Le frasi devono **dichiarare** che quella persona sta guardando in silenzio —
> «Lurko dal sito», «Sono in lurk, buona diretta» — e **non** far credere che
> stia partecipando — «Ci sono, sono attivo!», «Sto seguendo e commentando».
>
> Sembra una sfumatura, e non lo è. Il codice che manda il messaggio è identico
> nei due casi: cambia solo quello che c'è scritto dentro. Una frase che
> dichiara il lurk è un messaggio onesto, uguale a quello che quella persona
> scriverebbe a mano. Una frase che finge presenza attiva racconta a chi legge
> la chat una cosa che non è vera, e sposta la funzione dalla parte sbagliata
> del regolamento di Twitch.
>
> **È l'unico punto di tutto il sito in cui il testo che scrivi in un campo può
> rendere scorretta una funzione corretta.** Per questo le frasi stanno qui e
> non dentro al codice: la scelta è tua, e la responsabilità pure.

### Registrare l'applicazione su Twitch

Si fa una volta sola, e solo se vuoi accendere il login o il messaggio in chat.

1. Sull'account Twitch del canale attiva la **verifica in due passaggi** (2FA),
   se non l'hai già fatto. Senza, Twitch non lascia registrare nessuna
   applicazione.
2. Vai su **https://dev.twitch.tv/console/apps** e premi *Register Your
   Application*.
3. **Name**: quello che vuoi, purché non sia già usato da qualcun altro su
   Twitch.
4. **OAuth Redirect URLs**: l'indirizzo della pagina del sito su cui la gente
   deve tornare dopo il login, cioè di norma l'indirizzo pubblico del sito. Deve
   combaciare **carattere per carattere** con quello che scriverai nel campo
   *Indirizzo di ritorno dopo il login*: per Twitch `https://iltuosito.it/` e
   `https://iltuosito.it` sono due indirizzi diversi. Se vuoi fare le prove sul
   tuo computer, registra **anche** `http://localhost:4173/`: fuori da
   `localhost` Twitch pretende `https://`.
5. **Category**: quella che ti sembra più adatta, non cambia niente.
6. **Client Type**: **Confidential**.
7. Salva. Twitch ti mostra un **Client ID**: copialo nel campo *Client ID
   dell'app Twitch* della parte **Profilo del sito** (capitolo 19), accendi
   *Permetti di collegarsi con Twitch*, poi **Salva** e **Pubblica**.

> **Il «client secret» non va copiato nel pannello.** Nella stessa pagina Twitch
> te ne offre uno: nel pannello non serve, non c'è nessun campo dove metterlo, e
> non deve essercene uno. Tutto quello che scrivi nel pannello finisce dentro la
> pagina del sito, che chiunque può leggere: un secret lì dentro sarebbe un
> secret regalato al primo che passa.
>
> C'è **un solo posto** dove quel secret ha senso, e non è il pannello: il
> comando `node server/imposta-twitch.js`, che serve ad aggiornare da sé «Ultima
> diretta» e che lo tiene sul tuo computer, in una cartella che non si carica
> online. È spiegato in fondo al capitolo 19.

### Quando qualcosa non va

**Il riquadro del lurk non compare sul sito**
Controlla che *Mostra la modalità lurk* sia acceso e che tu abbia
**pubblicato** dopo averlo acceso.

**Il bottone «collegati con Twitch» non c'è, né sopra al video né accendendo il lurk**
**Guarda il sito da `http://localhost:4173/`: te lo dice lui.** Quando il
collegamento è spento, in fondo al riquadro della modalità lurk compare una riga
che spiega esattamente cosa manca — il Client ID, le frasi, o l'interruttore. Su
`localhost` e basta: sul sito pubblicato quella riga non compare a nessuno.

Nel 99% dei casi **manca il Client ID** — che sta nella parte *Profilo del
sito*, non qui — oppure l'elenco delle frasi è vuoto: senza tutti e due il
collegamento resta spento anche con l'interruttore acceso,
e sul sito non compare proprio niente. È lo stato in cui nasce il progetto.
Ricordati di **pubblicare** dopo aver messo il Client ID: il sito legge il file
generato, non il pannello.

Se invece stai provando su un indirizzo che non è `localhost` e non è
`https://`, Twitch rifiuta il login e il sito non mostra il bottone: è una
regola di Twitch, non del pannello.

**Compare il nome ma non l'immagine del profilo**
La tessera funziona lo stesso: l'avatar è un di più e, se non arriva, sparisce
invece di lasciare un riquadro rotto. Succede se l'hosting aggiunge una
Content-Security-Policy propria, più stretta di quella della pagina: le immagini
di profilo di Twitch stanno su `static-cdn.jtvnw.net` e vanno permesse in
`img-src`.

**Twitch risponde `{"status":400,"message":"invalid client"}`**
Il Client ID non è quello di nessuna applicazione esistente: quasi sempre è
rimasto un valore di prova nel campo, oppure è stato copiato a metà. Vai su
dev.twitch.tv/console/apps, ricopia il Client ID per intero e **ripubblica**. Il
pannello rifiuta di salvare un Client ID che non ha nemmeno la forma giusta —
trenta caratteri, solo minuscole e cifre — ma un codice ben scritto che
appartiene a un'applicazione cancellata può dirlo solo Twitch.

**La finestrella del login non si apre, o si apre e non succede niente**
Se il browser blocca le finestrelle il sito passa da solo alla strada lunga
(stessa scheda, con ricaricamento) e serve un clic in più: è previsto, non è
rotto. Se invece la finestrella si apre, l'autorizzazione va a buon fine e poi
non succede niente, chiudila e riprova: il sito dice *«Collegamento annullato:
la finestra di Twitch è stata chiusa»* quando la chiudi prima di aver
autorizzato, ed è il modo di accorgersene.

**Twitch risponde `invalid redirect uri`**
L'*Indirizzo di ritorno dopo il login* non combacia con nessuno degli *OAuth
Redirect URLs* registrati nell'applicazione. Per Twitch `https://sito.it/` e
`https://sito.it` sono due indirizzi diversi: si confrontano carattere per
carattere, barra finale compresa.

**Il login funziona in locale e non online (o viceversa)**
Gli indirizzi registrati su Twitch devono essere **due**: quello di produzione e
`http://localhost:4173/`. E il campo *Indirizzo di ritorno* deve contenere
quello giusto per il posto in cui il sito sta girando davvero: se resta scritto
`http://localhost:4173/` su un sito pubblicato, dopo il login i visitatori
finiscono sul loro computer invece che sul sito. Il terminale lo dice a ogni
generazione, e il pannello subito dopo aver pubblicato.

**Il messaggio non parte**
Twitch accetta la richiesta ma può rifiutare il messaggio, e il riquadro dice
perché. Le cause tipiche sono impostazioni della chat o dell'account di chi
scrive, non del pannello: chat **solo per chi segue** (e quella persona non
segue, o non da abbastanza tempo), chat **solo per abbonati**, **slow mode**
(ha scritto da troppo poco), messaggio **identico** al precedente, **email non
verificata** sull'account Twitch, o un ban nel canale.

**Il video non riparte, e lo stato dice che i comandi non sono disponibili**
Un blocco della pubblicità sta impedendo il caricamento del programma di Twitch
che comanda il video. Il video si vede lo stesso, ma nessuno può farlo
ripartire. Si risolve solo dalla parte di chi guarda: mettere il sito fra le
eccezioni del blocco, oppure spegnerlo su questa pagina.

---

## 21. Le clip

In fondo alla sezione «La diretta» del sito, sotto al riquadro della modalità
lurk, può comparire una griglia con **le clip più viste del canale**: anteprima,
durata, quante volte è stata guardata, quando, e il nome di chi l'ha ritagliata.
Nel pannello è la parte **Le clip**: clicca la vetrina nell'anteprima.

L'interruttore è **acceso**, e in fondo a «La diretta» compare l'invito
«Migliori highlights» con il bottone che porta alla pagina di tutte le clip. Si
spegne — insieme all'invito — da *La diretta* → *Parti che si possono spegnere*
→ **Mostra le clip**.

> Acceso non basta: la vetrina compare **dopo la prima Pubblica**, perché è lì
> che il server va a prendere le clip su Twitch. Finché l'elenco è vuoto non si
> stampa niente — né l'invito né il bottone — e il pannello te lo dice in
> chiaro fra le cose da guardare prima di mandare il sito online.

### Le clip non le scegli tu, e non è un limite

Le clip le ritaglia chi guarda, e Twitch sa quali sono state viste di più: la
vetrina prende quelle, in quell'ordine, e si aggiorna **da sola a ogni
Pubblica**. Non c'è un elenco da compilare e non c'è niente da tenere
aggiornato — che è esattamente il motivo per cui esiste, invece di essere
l'ennesimo campo che invecchia.

> **Serve il collegamento con Twitch.** È lo stesso del capitolo 19, quello che
> tiene fresca «Ultima diretta»: `node server/imposta-twitch.js`. Senza, puoi
> accendere l'interruttore quanto vuoi ma sul sito non compare niente, perché
> non c'è niente da mostrare. Se ti sembra di aver acceso tutto e non vedi la
> vetrina, comincia da lì.

### I campi, uno per uno

**Mostra le clip** — l'interruttore principale. Spento, la vetrina non compare
per nessuno, il resto della parte non ha effetto, e alla pubblicazione non
viene chiesto niente a Twitch. Acceso, compare in fondo a «La diretta» l'invito
alla pagina delle clip.

**Quante clip mostrare** — da 1 a 12. Sei è un buon numero: due righe da tre sui
monitor larghi, una colonna sul telefono. Se lo abbassi, la vetrina si accorcia
subito, senza aspettare il prossimo giro.

**Fra le clip di quale periodo** — quattro scelte, e la differenza conta:

| Periodo | Cosa ottieni |
|---|---|
| Ultima settimana | Cambia in continuazione. Nelle settimane fiacche può restare vuota, e allora la vetrina sparisce. |
| Ultimo mese | Il compromesso: cambia spesso e quasi mai resta vuota. |
| Ultimo anno | Cambia poco, ma sono le clip che valgono. |
| Da sempre | Sempre piena, sempre uguale. La memoria storica del canale. |

Se Twitch non trova nessuna clip nel periodo scelto, le clip che c'erano
**restano**: non ti ritrovi la vetrina svuotata perché è stata una settimana
tranquilla.

> Questo periodo vale per la **vetrina in home**. Nella pagina «Tutte le clip»
> il periodo lo sceglie chi visita, e non c'entra niente con questo campo.

**Quante clip nella pagina, per ogni periodo** — da 4 a 50, di serie 12. È
l'unico campo della pagina «Tutte le clip» (qui sotto): quante clip il server
va a prendere per **ciascuno** dei quattro periodi. Sono anche quante se ne
possono vedere alla volta. Alzarlo fa una pagina più ricca e più pesante: ogni
clip in più è un'anteprima in più da scaricare.

**Occhiello, titolo e riga di presentazione** — le tre righe sopra alla griglia,
come in ogni altra sezione. La riga di presentazione può restare vuota.

**Le tre parole delle card** — quella che descrive il link per chi non vede lo
schermo («Guarda la clip»), quella dopo il numero delle visualizzazioni, e
quella prima del nome di chi ha ritagliato la clip («clip di»).

### Perché non c'è nel menu laterale, e come ci si arriva lo stesso

Il menu del sito ha al massimo sei voci, e sul telefono diventa la barra in basso:
sei etichette ci stanno anche su uno schermo da 320 px, la settima no. Le clip
sono l'archivio di quello che succede nel video lì sopra, quindi stanno dentro la
stessa sezione «La diretta» invece di chiederne una tutta loro.

Restava il fatto che «La diretta» è lunga e la vetrina sta in fondo: la trovava
solo chi scorreva fino là. Per questo in testa alla sezione c'è **un bottone con
scritto il titolo della vetrina** — quello che scrivi tu nel campo *Titolo della
vetrina*, non una settima riga da tenere d'accordo con la prima — che porta
alle clip. Compare e sparisce insieme alle clip: se non ce n'è nessuna, non c'è
nemmeno un bottone che prometta di portarti da nessuna parte.

### La pagina «Tutte le clip»

Il bottone qui sopra non scende più alla vetrina: apre **`clip.html`**, una
pagina tutta sua con **tutte** le clip che il server ha trovato. Ci si arriva
anche dal link sotto alla vetrina, e da lì si torna al sito col link in alto a
sinistra.

La differenza vera è che qui **il periodo lo sceglie chi guarda**, con quattro
bottoni: **24 ore, 3 giorni, 7 giorni, 30 giorni**. Si parte da 30 giorni, cioè
da tutto, e stringendo si vede di meno. Cambiare periodo **non ricarica la
pagina** e non fa aspettare nessuno: le clip sono già tutte dentro la pagina, e
il sito si limita a nascondere quelle fuori periodo.

> **Perché funziona così.** Il sito pubblicato è fatto di file, non c'è un
> programma che risponda alle domande di chi visita, e le chiavi di Twitch non
> devono finire dentro una pagina — con quelle si parla a nome del canale. Così
> la domanda la fa il server **alla pubblicazione**, una volta per tutti: chiede
> a Twitch le migliori di ciascuno dei quattro periodi e le incorpora tutte.

Due conseguenze da sapere, perché si vedono:

- **Le date contano dal momento in cui uno apre la pagina**, non da quando hai
  pubblicato. Se pubblichi oggi e qualcuno apre il sito fra tre giorni, alla
  voce «24 ore» non trova niente — ed è la risposta giusta: quelle clip hanno
  tre giorni. Pubblicando si rinfresca tutto.
- **Un periodo può essere vuoto anche col mese pieno.** La pagina lo dice
  («Nessuna clip in questo periodo») invece di restare bianca.

I testi della pagina — titolo, riga di presentazione, il link per tornare
indietro, le quattro etichette dei periodi e la riga di quando non c'è niente —
si scrivono nella stessa parte **Le clip** del pannello, insieme a tutto il
resto. Hanno già un valore di partenza sensato: si toccano solo se si vuole.

Se spegni **Mostra le clip**, o se Twitch non ne restituisce nessuna, la pagina
**non viene scritta affatto** e, se c'era, la pubblicazione la **toglie** dal
sito: niente pagine orfane che restano online e su Google quando il bottone che
ci portava non c'è più.

### Quando qualcosa non va

**Ho acceso l'interruttore e non compare niente**
È il caso che il pannello ti dice da sé: a interruttore acceso ed elenco ancora
vuoto, fra le cose da guardare prima di mandare il sito online compare una riga
sulle clip. Nell'ordine: hai dato `node server/imposta-twitch.js`? Hai
**pubblicato** dopo aver acceso l'interruttore? Il canale ha davvero delle clip
nel periodo scelto? Prova ad allargare il periodo a «da sempre»: se compaiono,
era quello.

**Le card ci sono ma le immagini no**
Twitch serve le anteprime da tre indirizzi noti. Se una clip ha l'anteprima
altrove, il server la scarta e te lo scrive alla pubblicazione — la card resta,
col suo fondo scuro, e non è un guasto. Se invece **nessuna** immagine si vede,
di solito è l'hosting che aggiunge una propria Content-Security-Policy più
stretta di quella della pagina: vanno permessi `clips-media-assets2.twitch.tv`,
`clips-media-assets.twitch.tv` e `static-cdn.jtvnw.net` in `img-src`. È lo stesso
problema dell'avatar della tessera, nel capitolo 20.

**Le clip sono vecchie**
Si aggiornano a ogni **Pubblica** e, se il collegamento con Twitch c'è, a ogni
giro automatico del server. Se il server è spento da un mese e non pubblichi, la
vetrina ha un mese.

---

## 22. Il pollo

Accanto al player, nella sezione «La diretta», c'è la mascotte: un pollo che fa
da bottone per aprire la chat e che ogni tanto dice una frase in un fumetto.

Nel pannello è la parte **Il pollo**: nell'anteprima il clic sul disegno seleziona
l'immagine (per cambiarla), `Esc` sale alla parte; la piccola «x» accanto seleziona
subito la parte. Nell'anteprima il pollo è fermo e non parla: le frasi si provano sul
sito.

### Cosa dice

Sette elenchi di frasi, uno per situazione: quando non succede niente, quando
gli si clicca sopra, quando qualcuno scrive in chat, mentre il visitatore sta
scrivendo, quando il canale va in onda, quando un visitatore accende la modalità
lurk, quando il canale è spento. Tienine tre o quattro per elenco, brevi, e non
lasciarne nessuna vuota: il pollo ne pesca una a caso. Si aggiunge
una frase con **Aggiungi una riga** in fondo all'elenco, e si riordina o si
elimina con le frecce e il cestino, come per i social.

Solo nell'elenco **«quando qualcuno scrive in chat»** puoi scrivere `{nome}`:
viene sostituito con il nome di chi ha scritto. Negli altri elenchi resterebbe
stampato così com'è. Tienine almeno un paio **senza** `{nome}`: in un caso (vedi
sotto) il nome non si sa.

### Cosa ascolta

- **Mostra il pollo** — l'interruttore principale. **Spento, il pollo sparisce
  dal sito per tutti** e il resto di questa parte non ha più effetto. Si riaccende
  da *La diretta* → *Parti che si possono spegnere*.
- **Ascolta la chat vera del canale** — acceso, il sito si collega alla chat di
  Twitch **in sola lettura**, come farebbe uno spettatore che guarda senza aver
  fatto l'accesso: non usa la tua password, non può scrivere in chat, non manda
  a Twitch nessun dato di chi sta visitando il sito. Serve solo a far reagire il
  pollo quando qualcuno scrive davvero. Spento, il pollo resta ma si limita allo
  stato del canale e ai clic.
- **Mostra il testo dei messaggi nel fumetto** — vedi il riquadro qui sotto.

> ### Attenzione: «Mostra il testo dei messaggi»
>
> Spento (com'è di serie), il pollo dice **una frase tua** con dentro il nome di
> chi ha scritto: «Coccodè, parla Tizio».
>
> Acceso, il pollo ripete nel fumetto **quello che la gente ha scritto in chat**.
> Sul sito finisce anche l'insulto, la parolaccia o il link sgradevole, senza che
> nessuno lo abbia letto prima. Il testo viene accorciato e i link vengono tolti,
> ma resta quello che ha scritto uno sconosciuto.
>
> Accendilo solo se sai chi c'è nella tua chat e se qualcuno la sta guardando.

C'è poi una cosa che il pollo **non può** sapere, ed è giusto dirla: quando sei
tu (o un visitatore) a scrivere nella chat incorporata nel sito, il pollo
capisce solo che il cursore è finito lì dentro. Non legge i tasti e non sa se il
messaggio è partito davvero: la chat di Twitch è di un altro sito e sta dentro
una finestrella chiusa. Per questo le frasi dell'elenco *«mentre il visitatore
scrive»* non dovrebbero dare per certo che il messaggio sia stato inviato.

### Come lo si toglie di mezzo

- **Tu, per tutti**: interruttore *Mostra il pollo*, spento, poi Salva e Pubblica.
- **Solo la chat**: interruttore *Ascolta la chat vera del canale*, spento.
- **Un visitatore, per sé**: sul sito c'è una piccola «x» accanto al pollo. Chi
  la preme non lo rivede più su quel browser. È una scelta sua e non tocca il
  sito degli altri.

---

## 23. Se qualcosa va storto: tornare indietro

Ogni volta che pubblichi, il server mette da parte una **copia di sicurezza** del
sito com'era prima: la pagina, i dati, il foglio dei colori e i contenuti (testi,
stili, posizioni dei blocchi e ordine delle sezioni compresi).

1. Apri il menu **☰** e scegli **Copie di sicurezza**.
2. Trovi l'elenco, dalla più recente, con la data scritta per esteso.
3. Premi **Ripristina** sulla copia a cui vuoi tornare.
4. Il pannello ti chiede conferma **due volte**: prima *Torno alla copia del …?*
   con **Continua**, poi *Ultima conferma* con una casella da spuntare e
   **Ripristina adesso**. È voluto: questa è l'unica operazione che riscrive il
   sito senza passare da una modifica tua.

Prima di ripristinare, il server salva una copia anche dello stato di adesso:
quindi pure un ripristino sbagliato si può annullare tornando in questa stessa
vista.

Dopo il ripristino il pannello ricarica tutto dal server. Le modifiche non
salvate che avevi in corso si perdono, e Annulla riparte da zero: salva prima, se
ti servono.

Le copie conservate sono le venti più recenti; le più vecchie spariscono da sole.
Le copie non contengono i file delle immagini e dei font caricati: se nel frattempo
ne hai eliminato uno, nel sito ripristinato manca. Un font lascia il posto al font
di ripiego; un'immagine va ricaricata.

---

## 24. Il pannello su uno schermo stretto

Sotto i 1024 pixel di larghezza (un portatile piccolo, una finestra stretta, un
tablet) l'anteprima prende tutto lo spazio e il pannello diventa **un cassetto**
che scivola sopra di lei da sinistra.

- Si apre e si chiude col bottone **Pannello** in alto a sinistra (sotto i 760
  pixel resta solo l'icona).
- Si apre da solo quando clicchi un elemento nell'anteprima, quando apri il menu
  **☰**, quando cerchi un campo con `Ctrl+K` e quando cominci a scrivere un testo
  sulla pagina.
- `Esc` lo chiude, con il fuoco dentro il pannello.
- La riga per allargarlo non c'è: il cassetto è largo quanto serve.

Sulla barra in alto la spia resta, ma senza scritta: il bottone **Salva** acceso
dice la stessa cosa. Sotto i 760 pixel la barra va su più righe, con i
dispositivi sotto. Il pannello si usa fino a 360 pixel di larghezza; per lavori
lunghi, però, uno schermo largo è molto più comodo.

---

## 25. Scorciatoie da tastiera

| Tasti | Cosa fanno |
|---|---|
| `Ctrl+S` (`Cmd+S` su Mac) | Salva la bozza, anche dall'anteprima e mentre scrivi un testo |
| `Ctrl+K` (`Cmd+K`) | Va alla ricerca dei campi. Dentro un testo con formattazione in scrittura, apre la riga del link |
| `Ctrl+Z` | Annulla l'ultima modifica (dentro un campo annulla le lettere del campo) |
| `Ctrl+Y` oppure `Ctrl+Maiusc+Z` | Ripete la modifica annullata |
| `Esc` nell'anteprima | Sale al contenitore dell'elemento selezionato; durante un trascinamento lo annulla |
| `Esc` o `Ctrl+Invio` in un testo in scrittura | Finisce di scrivere |
| `Esc` nel pannello | Chiude la vista del menu aperta, l'elenco della ricerca, o il cassetto sugli schermi stretti |
| Frecce, con un blocco selezionato | Spostano il blocco di 1 |
| `Maiusc` + frecce | Spostano il blocco di 5 |
| `Alt` + frecce | Cambiano la misura del blocco |
| `Maiusc` mentre trascini un blocco | Lo stacca dalla griglia |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Grassetto, corsivo, sottolineato nei testi con formattazione |
| Frecce su una scheda | Passano fra Contenuto, Stile e Avanzate |
| Frecce su e giù sulla maniglia di una sezione | Spostano la sezione nel Navigatore; `Inizio` e `Fine` la portano in cima o in fondo |
| Frecce sulla riga del pannello | Allargano o stringono il pannello; `Invio` lo rimette a 480 pixel |
| `Tab` / `Maiusc+Tab` | Passano da un comando all'altro |

Tutto il pannello si usa anche senza mouse: il campo o il bottone su cui sei ha
sempre un bordo ben visibile.

---

## 26. Da sapere: i limiti veri

Qui ci sono le cose che il pannello non fa, o fa in un modo che è bene conoscere
prima. Nessuna è un guasto: sono scelte, ognuna col suo perché.

### Il player di Twitch non si nasconde, non diventa trasparente, non si rimpicciolisce e non si copre

Sulla sezione **La diretta** e sulla parte **Monitor del player** (e, nella scheda
Stile, su qualunque elemento che contiene il player) valgono queste regole:

- **niente «Nascondi»**: la visibilità per dispositivo non c'è;
- **niente «Opacità»**;
- **niente «Larghezza massima»**;
- lo **Spazio esterno** non va sotto 0: un lato con un numero negativo si scarta;
- lo **Spazio interno** arriva al massimo a **40 pixel** per lato: un lato oltre 40
  si scarta;
- restano **bordo** (fino a 20 pixel), **colore del bordo**, **angoli
  arrotondati**, e tutto il resto della scheda Stile: font, colori, sfondo,
  bagliore.

Nel pannello i controlli vietati non compaiono, e una riga lo spiega. Se un valore
vietato arrivasse lo stesso (a mano in `contenuti.json`, per esempio), il server lo
scarta al salvataggio e alla pubblicazione.

**Perché.** Le regole di Twitch per i player incorporati vietano di nasconderlo,
renderlo trasparente, rimpicciolirlo sotto i 400×300 pixel o metterci qualcosa
sopra. Un player coperto o invisibile è quello che Twitch tratta come gonfiaggio
degli spettatori: chi guarda dal sito rischierebbe di non essere contato, e il
canale di vedersi bloccare l'incorporamento. Uno spazio interno enorme o un
margine negativo sono solo due modi più furbi di rimpicciolirlo o di farlo finire
sotto un'altra sezione.

Se il player non lo vuoi proprio, la strada c'è ed è pulita: **spegni tutta la
sezione La diretta** con l'occhio del Navigatore. Spenta, la sezione non viene
proprio scritta nella pagina, player compreso.

### Al primo spostamento di un blocco, la sezione cambia un poco di altezza

Quando sposti il primo blocco di una sezione, tutti i blocchi escono dal loro posto
normale e si fermano dove sono (capitolo 13). I blocchi non si muovono di un
pixel, ma la sezione smette di prendere l'altezza dal suo contenuto e la prende
dalla posizione dei suoi blocchi: il suo margine sopra e sotto non conta più.

Risultato: la sezione diventa un po' più alta o un po' più bassa — di solito
qualche decina di pixel, fino a un'ottantina sulla copertina vista da telefono — e
**tutto quello che sta sotto sale o scende di altrettanto**. Non è un salto del
pannello. Se non ti piace, allarga o stringi l'ultimo blocco con le maniglie,
oppure premi **Riporta tutto il riquadro** e la sezione torna com'era.

### I blocchi resi molto stretti possono schiacciarsi

L'impaginazione interna di alcuni blocchi segue la larghezza **dello schermo**, non
quella del blocco: il *Listino* va su una riga sola sugli schermi larghi, il
*Nastro dei sette giorni* mette i giorni in sette locandine affiancate, gli *Eventi
speciali* ne mettono due per riga, il *Quadro comandi* e il *Titolo e introduzione*
della settimana vanno su due colonne. Se su Computer rendi
uno di questi blocchi molto stretto, dentro non si riorganizza come farebbe sul
telefono: si schiaccia, fino a una lettera per riga. Stringili con giudizio, e
guarda il risultato prima di pubblicare.

### Alcuni testi non hanno un punto da cliccare

Nell'anteprima si clicca solo un testo che è tutto suo. Restano fuori:

- i **testi misti**, attaccati a un'icona o a un numero: la riga del copyright (con
  l'anno davanti), i bottoni *copia l'email* e *scrivi una mail*, la riga sotto il
  nome del canale. Si cambiano dalla loro sezione, in **Testi che non si vedono in
  pagina** (capitolo 12);
- il **titolo della linguetta** e le descrizioni per Google e per i social: menu ☰ →
  **Google e social**;
- l'**indirizzo email**: menu ☰ → **Canale, contatti e immagini**;
- il titolo sopra il player, che il sito riscrive da solo mentre gira.

Per tutti vale anche la ricerca `Ctrl+K`, che porta dritta al campo.

### Un link scritto a mano verso una sezione non sparisce

Quando spegni una sezione, il sito toglie da solo le voci del menu e i link che la
pagina stessa ha verso di lei. Ma se in un **testo con formattazione** hai scritto tu
un link come `#chi`, quello resta: il pannello non riscrive i tuoi testi. Spegnendo
la sezione, cercalo e toglilo, altrimenti sul sito porta a un punto che non c'è.

### L'anteprima non esegue il JavaScript del sito

Nell'anteprima non c'è il player vivo, non c'è la chat, il pollo non parla, il conto
alla rovescia è fermo, la spia dice sempre *controllo il canale* e il riquadro del
lurk non si accende. Sul nastro della settimana mancano le date, i segni *Oggi*,
*Prossima* e *In onda* e l'ora di chi guarda. Testi, immagini, colori, stili e
posizioni si vedono invece come sul sito, e così giorni, eventi e fondale della
schedule.

**Perché.** Dentro l'editor il player sarebbe una **seconda sessione video** della
stessa persona, che le regole di Twitch vietano (e che l'anteprima rifarebbe a ogni
modifica), e il pollo aprirebbe una nuova connessione alla chat a ogni ricarica. La
pagina senza JavaScript, invece, è completa di tutti i contenuti: è quella che serve
per modificarli. Il sito vero, con il player e tutto il resto, si guarda da menu ☰ →
**Apri il sito pubblicato**.

---

## 27. Quando qualcosa non funziona

**«Non riesco a contattare il server»**
La finestra nera con `node server/server.js` è stata chiusa o il computer è stato
riavviato. Riaprila e premi **Riprova**.

**«La sessione è scaduta»**
Sei rimasto fermo troppo a lungo. Il pannello ti riporta alla password e ti dice
che le modifiche in corso sono ancora lì: rientra e le ritrovi come le avevi
lasciate. Non ricaricare la pagina prima di essere rientrato.

**Il server ha rifiutato il salvataggio**
In cima al pannello compare un riquadro rosso, *Il server ha rifiutato il
salvataggio*, con l'elenco dei campi da correggere. Il pannello ti porta da solo al
primo, e cliccando una voce dell'elenco salti a quel campo: nell'anteprima, nella
parte che lo contiene o nella vista del menu. Il messaggio compare **sotto il campo
che l'ha causato**; correggi, e sparisce da solo.

**«Il tag … non è ammesso» sotto un campo di testo**
Hai incollato o scritto del codice che nei testi non si può usare. Il messaggio
dice cosa è stato tolto: quasi sempre basta usare i pulsanti della barretta
(capitolo 7). Il testo che c'era dentro non si perde.

**L'anteprima dice «L'anteprima non si è caricata» o «L'anteprima non si carica»**
Controlla che il server sia acceso e premi **Riprova**. Se un campo è a metà e la
pagina non si riesce a comporre, l'anteprima lo dice invece di sbiancare: sistemalo
e riprova. Il sito pubblicato non è stato toccato.

**Clicco nell'anteprima e non succede niente**
Se sei in una vista del menu, un clic nell'anteprima ti riporta all'editor. Se stai
scrivendo un testo sulla pagina, i clic dentro quel testo servono a scrivere: premi
**Fatto** o `Esc`. Se clicchi il banner della copertina, non si prende: capitolo 5.

**Non trovo più un elemento che ho nascosto**
Passa a un altro dispositivo, oppure seleziona la sua sezione e cercalo in *Cosa
contiene*: c'è ancora, con la scritta *non si vede qui*.

**Non trovo una sezione**
È spenta: nel Navigatore ha la scritta *nascosta*. Riaccendila con l'occhio.

**Un blocco è finito in un posto strano**
Selezionalo, scheda **Avanzate**, **Riporta al posto originale**. Se tutta la
sezione è in disordine, **Riporta tutto il riquadro**. Ricorda che le posizioni
valgono per dispositivo: controlla di essere su quello giusto.

**`Ctrl+Z` non annulla quello che mi aspetto**
Se sei dentro un testo o un campo, annulla le lettere di quel campo. Premi `Esc` (o
clicca fuori) e poi `Ctrl+Z`, oppure usa **↶** in alto.

**Ho pubblicato ma sul sito non vedo niente di nuovo**
Ricarica la pagina del sito tenendo premuto `Ctrl` mentre premi `F5`: il browser
tiene in memoria la versione vecchia. Se il sito sta su un hosting esterno,
controlla di aver caricato **tutti e tre** i file rigenerati, `css/tema.css`
compreso, e le cartelle `contenuti/media/` e `contenuti/font/` se servono.

**Ho cambiato i colori e non cambia niente sul sito pubblicato**
Quasi sempre è il file dei colori non caricato online (vedi qui sopra). In locale
invece basta ripubblicare: i colori vivono in un file a parte, che si riscrive
solo con Pubblica.

**Un font caricato si vede nel pannello e non sul sito online**
Manca online la cartella `contenuti/font/`. Oppure l'hosting aggiunge una
Content-Security-Policy propria che non permette i font del sito stesso
(`font-src 'self'`).

**Il font non si carica: «formato non riconosciuto» o «supera il limite di 2 MB»**
Vanno bene solo WOFF2, WOFF, TTF e OTF veri, fino a 2 MB (capitolo 16). Cerca la
versione WOFF2 dello stesso font.

**Il testo non si legge più**
Apri menu ☰ → *Impostazioni del sito* e guarda *Si legge?* e il contrasto dei tre
colori del testo (capitolo 15). Se non è almeno **AA**, alza il contrasto o premi
**Ripristina i colori di partenza**. Se il problema è un solo elemento, selezionalo
e guarda la scheda Stile, oppure **Ripristina lo stile di questo elemento**.

**Il pollo non dice niente / non compare**
Nell'ordine: controlla che *Mostra il pollo* sia acceso; che gli elenchi di frasi
non siano vuoti; che tu abbia **pubblicato** dopo aver cambiato queste cose. Se
il fumetto non nomina mai nessuno, può essere che *Ascolta la chat vera del
canale* sia spento, o che in chat non stia scrivendo nessuno. Ricorda anche che
se hai chiuso il pollo con la «x» quel browser non te lo rimostra: apri il sito
in una finestra anonima per controllare. Nell'anteprima del pannello il pollo non
parla mai: capitolo 26.

**La modalità lurk non compare, o non riavvia niente**
Controlla che *Mostra la modalità lurk* sia acceso e di aver **pubblicato** dopo
averlo acceso. Se il riquadro c'è ma dice che i comandi del video non sono
disponibili, è un blocco della pubblicità che sta fermando il programma di
Twitch: capitolo 20.

**Il messaggio in chat non parte**
Quasi sempre è un'impostazione della chat — solo per chi segue, solo per
abbonati, slow mode — o l'email non verificata sull'account di chi scrive.
L'elenco completo è nel capitolo 20. E ricorda che quel messaggio **non fa
salire il numero di spettatori**: non serve a quello.

**Il player di Twitch non parte nell'anteprima**
Nell'anteprima del pannello non parte mai, apposta (capitolo 26). Sul sito, se non
parte in locale, dipende di solito dal browser che blocca i contenuti di terze
parti.

**Non riesco a eliminare un'immagine**
È ancora usata da qualche parte, anche solo come locandina di un giorno, di un evento
o come fondale della schedule. Il messaggio ti dice dove: cambiala lì, salva, e poi
riprova.

**La foto che ho caricato ha cambiato nome, o è diventata `.webp`**
È voluto: il pannello l'ha alleggerita prima di caricarla, e il server scrive i nomi
in minuscolo con i trattini al posto degli spazi (capitolo 8).

**Ho messo un'immagine a un giorno, ma sul sito non si vede**
Nell'ordine: il giorno è acceso? Un giorno di riposo non mostra niente di suo. Hai
**pubblicato**? Se il sito sta su un hosting esterno, hai caricato online la cartella
`contenuti/media/`?

**L'immagine di un giorno sul telefono è tagliata male**
Sposta il punto di fuoco sulla parte che conta e guarda il ritaglio *Telefono* nel
blocco immagine (capitolo 11).

**Ho aggiunto un evento speciale e sul sito non c'è**
Nell'ordine: hai **pubblicato**? Data, ora e durata sono giuste (la riga sotto le
caselle lo dice)? L'evento è già finito? Un evento finito sparisce dal sito da solo, e
nel pannello è segnato *Passato*.

**«Aggiungi evento» è spento**
Gli eventi sono al massimo otto. Elimina quelli passati per fare posto.

**Un riquadro dice «Questa parte non si è aperta» o «Un pezzo dell'editor manca»**
C'è qualcosa che non torna in un pezzo del pannello. Il resto funziona, e Salva e
Pubblica non perdono niente: salva il tuo lavoro, ricarica la pagina e, se il
messaggio resta, segnalalo a chi ha fatto il sito.

**Ho fatto un disastro**
Se non l'hai ancora pubblicato, premi **↶** finché serve, oppure ricarica la pagina
del pannello senza salvare: le modifiche non salvate spariscono e torna la bozza di
prima. Se l'hai pubblicato, vai in *Copie di sicurezza* e ripristina la copia di
prima (capitolo 23).

---

## 28. Per chi mette le mani nel codice

Questo capitolo è per chi lavora sui file. Le regole vincolanti, i nomi e i
formati esatti stanno in [`CONTRATTO-4.md`](../CONTRATTO-4.md) per l'editor e in
[`CONTRATTO-5.md`](../CONTRATTO-5.md) per la schedule e le immagini, che valgono
insieme ai contratti precedenti; qui c'è la mappa per orientarsi, con i numeri presi
dal codice.

### Come è fatto

L'editor è un insieme di moduli ES, senza dipendenze, caricati da `pannello.js`.
Il guscio li importa con `import()`: se uno manca o lancia, l'editor parte lo
stesso e un avviso dice cosa non c'è.

| File | Cosa fa |
|---|---|
| `pannello/index.html` | la pagina del pannello: accesso, barra alta, `#pannello`, `#maniglia`, `#anteprima` |
| `pannello/pannello.js` | la base: accesso, sessione, bozza, spia, Salva, Pubblica, convalida, contesto dei campi; riempie il ponte |
| `pannello/editor/ponte.js` | il ponte fra `pannello.js` e i moduli dell'editor: `leggi`, `scrivi`, `segnala`, `creaCampo`, `api`, avvisi |
| `pannello/editor/guscio.js` · `guscio.css` | la struttura: vista Pagina, schede, percorso, menu ☰ e viste, ricerca `Ctrl+K`, riepilogo errori, Annulla/Ripeti, cassetto, sincronizzazione con l'anteprima |
| `pannello/editor/motore.js` · `motore.css` | l'anteprima in un iframe: zoom, selezione, contorni, trascinamento e maniglie, CSS dal vivo, ispettore delle posizioni |
| `pannello/editor/contenuti.js` · `contenuti.css` | scheda Contenuto di testi e immagini: scrittura sul posto, barra del testo ricco, limite dei caratteri, cambio immagine |
| `pannello/editor/stile.js` · `stile.css` | schede Stile e Avanzate: gruppi, dispositivo, eredità, visibilità, larghezza, ripristino, regole del player |
| `pannello/editor/parti.js` · `parti.css` | ispettori di parti e sezioni, Navigatore, vista di una parte spenta |
| `pannello/editor/nomi.js` | l'unica fonte dei nomi umani di sezioni, parti e blocchi; registro delle parti; gruppi dello schema ↔ sezioni |
| `pannello/editor/impostazioni.js` · `impostazioni.css` | vista Impostazioni del sito, controlli di colore e font usati anche da Stile, libreria dei font caricati |
| `pannello/condivisi/stili.js` | il generatore condiviso (UMD, funzioni pure): lo stesso file lo usano il server e il pannello |
| `pannello/condivisi/orari.js` | le regole della schedule (`SBOrari`, UMD, funzioni pure): limiti, forma pulita, problemi, fusi orari; anche lui per server e pannello |
| `pannello/moduli/settimana.js` | l'editor della schedule: riepilogo, linguette, giorni, eventi, fondale, blocco immagine, legame con l'anteprima |
| `pannello/moduli/*.js` | i mattoni che c'erano già: API, campi dallo schema, testo ricco, elenchi, media (con la preparazione delle immagini), backup, tema, avvisi |

Il pannello continua a costruire i campi dallo schema (`contenuti/schema.js`):
nessun campo è scritto a mano nei moduli. L'unica conoscenza di impaginazione è in
`nomi.js` (quali campi mostra ogni parte, a quale sezione appartiene ogni gruppo).

### Il generatore condiviso

`pannello/condivisi/stili.js` si carica con `require('../../pannello/condivisi/stili.js')`
dal server e con un `<script>` classico nel pannello (`window.SBStili`). Contiene i
vocabolari (dispositivi, bande delle media query, colori del tema, sezioni, riquadri,
proprietà con i loro limiti, bersagli protetti) e le funzioni che puliscono e
trasformano in CSS i tre rami dell'editor: `pulisciSezioni`, `pulisciStili`,
`stiliCss`, `risolvi`, `pulisciDisposizione`, `disposizioneCss`, `fontFace`.
Siccome anteprima e generazione chiamano lo stesso codice, **il CSS dal vivo e quello
pubblicato sono lo stesso testo, al byte**. Una regola nuova si scrive lì, e solo lì.

### I tre rami di `contenuti.json`

Stanno in `config`, non hanno un campo nello schema (sono in `EDITOR` dentro
`contenuti/schema.js`, saltati dalla copertura) e li scrive solo l'editor:

- **`config.sezioni`** — ordine e visibilità delle sei sezioni ordinabili:
  `[{ "id": "regia", "attiva": true }, { "id": "chi", "attiva": false }, …]`.
  `regia` è sempre prima e accesa; `binario` e `piede` non ci sono perché ci sono
  sempre.
- **`config.stili`** — stile per elemento e per dispositivo. La chiave è il
  bersaglio `<tipo>:<chiave>` (`testo:deck.titolo`, `parte:social`,
  `blocco:chi.corpo`, `sezione:chi`), dentro ci sono `computer`, `tablet`,
  `telefono` con le proprietà: `{ "testo:deck.titolo": { "computer": { "colore":
  "var:ciano" }, "telefono": { "dimensione": { "valore": 38, "unita": "px" } } } }`.
- **`config.disposizione`** — posizioni dei blocchi per riquadro e dispositivo, in
  percentuale della larghezza del riquadro: `{ "blocchi": { "chi": [{ "id":
  "chi.corpo", "pos": { "telefono": null, "tablet": null, "computer": { "x": 0,
  "y": 0, "l": 58, "a": 70 } } }] } }`.

Il server li ripulisce **prima** di convalidare (`costruisci.pulisciEditor`, in
`PUT /api/contenuti`, `POST /api/anteprima` e nella generazione): un valore storto si
scarta invece di bloccare il salvataggio. `archivio.unisci` li sostituisce in blocco,
così uno stile tolto nel pannello non rinasce da quello salvato. Un ramo assente è
valido. Con i valori di partenza (sei sezioni accese, `stili` vuoto, `blocchi` vuoto)
la pagina generata è identica a quella di prima dell'editor, a parte gli attributi
`data-sb-*` e `font-src 'self'` nella CSP.

In `RAMI_IN_BLOCCO` di `server/lib/archivio.js` c'è anche un quarto ramo, `orari`,
che però un campo nello schema ce l'ha: capitolo *La schedule* qui sotto.

### La pagina e i marcatori

- `modelli/index.html` stampa le sezioni con `{{{sito.corpo}}}`: le compone la
  generazione nell'ordine di `config.sezioni`. Il menu laterale scrive le voci con un
  ciclo su `sito.voci`, e i link verso una sezione stanno sotto
  `{{#se sito.attiva.<sezione>}}`.
- Il CSS degli stili e delle posizioni esce in `<style id="sb-disposizione">` e
  `<style id="sb-stili">`, subito dopo l'ultimo foglio, solo se non è vuoto.
- I modelli in `modelli/parziali/` hanno gli attributi che l'editor legge:
  `data-sb-sezione`, `data-sb-riquadro`, `data-sb-blocco`, `data-sb-parte`,
  `data-sb-testo`, `data-sb-immagine`, `data-sb-alt`. Restano nella pagina pubblicata:
  li usano i due `<style>`.

Tre ricette:

- **un testo nuovo che si clicca**: `data-sb-testo="<chiave>"` in coda al tag di un
  elemento che contiene **solo** il segnaposto di un campo `testo`, `testolungo` o
  `ricco`;
- **una parte nuova**: `data-sb-parte="<nome>"` sul suo contenitore, e una riga in
  `REGISTRO_PARTI` e nei nomi di `nomi.js`;
- **un blocco nuovo**: `data-sb-blocco="<riquadro>.<nome>"` dentro un elemento con
  `data-sb-riquadro`, e il nome in `nomi.js`. Il riquadro deve avere una larghezza
  che non dipende dal contenuto, e fra riquadro e blocco non ci deve essere niente di
  posizionato: i vincoli completi sono nel §5.5 del contratto.

### Server, font e API

- `server/lib/font.js` gestisce `contenuti/font/`: riconosce il formato dai primi
  byte, tiene `elenco.json`, calcola dove un font è usato. `server/lib/statico.js`
  serve i file dei font (non `elenco.json`); `server/lib/tema.js` scrive
  l'`@font-face` dei font caricati negli slot del tema.
- Rotte nuove, tutte con sessione: `POST /api/anteprima` con `editor: true` (la
  pagina senza script, con `<base href="/">`), `GET /api/font`, `POST /api/font`,
  `DELETE /api/font/<id>` (`?forza=1`), `POST /api/password`. `GET /api/contenuti`
  aggiunge il blocco `editor`.
- I moduli dell'editor si parlano con eventi sul `document` del pannello:
  `sb:pronto`, `sb:modifica`, `sb:sostituito`, `sb:dispositivo`,
  `sb:anteprima-pronta`, `sb:ispettori`, `sb:scrittura`.

### La schedule: il ramo `config.orari`

I numeri qui sotto sono quelli di `pannello/condivisi/orari.js`, che è la fonte vera: se
un giorno cambiano lì, questa tabella è da aggiornare.

```json
"orari": {
  "giorni": [1, 3, 5, 0],
  "ora": "21:00",
  "durataOre": 4,
  "fuso": "Europe/Rome",
  "schede": [ …sette schede, indice 0 = domenica… ],
  "eventi": [],
  "sfondo": { "immagine": "img/settimana-sfondo.webp", "fuoco": { "x": 50, "y": 50 }, "intensita": 30 }
}
```

`giorni` resta l'**unica fonte** di «quel giorno c'è diretta»: la scheda di un giorno
spento resta nei dati, ma la generazione non ne stampa niente. Così riaccendendolo
torna com'era.

| Campo | Regola | Ripiego (`PREDEFINITI`) |
|---|---|---|
| `giorni` | interi 0–6 (0 = domenica), almeno uno, senza doppioni | — |
| `ora` | `HH:MM`, da 00:00 a 23:59 | `21:00` |
| `durataOre` | da 0,5 a 24, a passi di 0,5 | `4` |
| `fuso` | un fuso che `Intl` conosce | `Europe/Rome` |

**Scheda di un giorno** — `schede[n]`, sempre sette:

| Campo | Regola | In `schedaVuota()` |
|---|---|---|
| `ora` | `""` (vale quella di serie) oppure `HH:MM` | `""` |
| `durataOre` | `null` (vale quella di serie) oppure da 0,5 a 24 a passi di 0,5 | `null` |
| `titolo` · `gioco` · `nota` | testo semplice su una riga: al massimo 40 · 40 · 120 caratteri | `""` |
| `immagine` | `""` oppure un percorso ammesso (qui sotto) | `""` |
| `fuoco` | `{ x, y }` interi 0–100: il punto da tenere in vista (`object-position`) | `{ x: 50, y: 50 }` |
| `velo` | intero da 30 a 90 | `60` |

**Evento speciale** — `eventi[i]`, al massimo **8**:

| Campo | Regola | In `eventoVuoto()` |
|---|---|---|
| `data` | `AAAA-MM-GG`, una data che esiste nel calendario; obbligatoria | `""` |
| `ora` | `HH:MM`; obbligatoria | `""` |
| `durataOre` | da 0,5 a 72, a passi di 0,5; obbligatoria | `null` |
| `titolo` | da 1 a 40 caratteri; obbligatorio | `""` |
| `gioco` · `nota` | al massimo 40 · 160 caratteri | `""` |
| `immagine` · `fuoco` · `velo` | come nella scheda | come nella scheda |

`eventoVuoto()` lascia vuoti data, ora e durata di proposito: un evento con una data
inventata finirebbe sul sito prima che qualcuno l'abbia scelta. È il pannello, con
**Aggiungi evento**, a riempirli con la data di oggi e l'ora e la durata di serie. Un
evento **finito** (inizio più durata nel passato) resta valido e resta nei dati: non si
stampa, e basta.

**Fondale** — `sfondo`: `immagine` e `fuoco` come nella scheda, `intensita` intero da
0 a 100 (di serie 30; 0 lo spegne). In `sfondoVuoto()` l'immagine è vuota.

**Percorsi di immagine** — solo file del sito, `RE_PERCORSO` e niente `..`:

```
^(img|contenuti/media)/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\.(png|jpe?g|webp|avif|svg)$
```

Niente indirizzi esterni, spazi, virgolette o schemi: il percorso finisce in un `src`,
e il fuoco che gli sta accanto in un attributo `style`.

### Il modulo condiviso `SBOrari`

`pannello/condivisi/orari.js` è un UMD senza dipendenze, come `stili.js`. Il server lo
carica con `require('../../pannello/condivisi/orari.js')`; nel pannello lo importa
`moduli/settimana.js` con `import '../condivisi/orari.js'`, che esegue il file e riempie
`window.SBOrari`. Funzioni pure e tabelle congelate; l'unica cosa che viene da fuori è
`Intl`, che conosce l'ora legale di ogni fuso senza tabelle scritte a mano.

| Nome | Cosa dà |
|---|---|
| `LIMITI` | `titolo` 40, `gioco` 40, `nota` 120, `notaEvento` 160, `eventi` 8, `veloMin` 30, `veloMax` 90, `velo` 60, `intensitaMin` 0, `intensitaMax` 100, `intensita` 30, `fuocoMin` 0, `fuocoMax` 100, `fuoco` 50, `durataMin` 0.5, `durataMax` 24, `durataEventoMax` 72, `passoDurata` 0.5 |
| `PREDEFINITI` | `{ ora: '21:00', durataOre: 4, fuso: 'Europe/Rome' }`, i ripieghi quando il ramo è rotto o manca |
| `GIORNI` · `ORDINE` · `MESI` | `[{ n: 0, abbr: 'DOM', nome: 'Domenica', minuscolo: 'domenica' }, …]` · `[1, 2, 3, 4, 5, 6, 0]`, l'ordine di lettura · `[{ nome: 'gennaio', abbr: 'gen' }, …]` |
| `RE_ORA` · `RE_DATA` · `RE_PERCORSO` | le tre espressioni regolari; che la data esista lo dice `dataValida`, il `..` lo esclude `percorsoValido` |
| `schedaVuota()` · `eventoVuoto()` · `sfondoVuoto()` | i valori vuoti, un oggetto nuovo a ogni chiamata |
| `normalizza(orari)` | il ramo completo e pulito, e **non lancia mai**: sette schede; eventi al massimo 8, sempre oggetti e sempre al loro indice (un evento rotto non fa scalare gli altri); durate arrotondate alla mezz'ora e strette al bordo; testi su una riga e tagliati senza spezzare le emoji; percorsi non ammessi svuotati; fuso inesistente → `Europe/Rome` |
| `problemi(orari)` | `[{ percorso, messaggio }]`, `[]` se va bene; messaggi in italiano pronti da mostrare. Tollerante sulle assenze, severo sui valori che ci sono |
| `percorsoValido(p)` · `fusoValido(f)` · `dataValida(d)` | booleani |
| `oraDi(orari, giorno)` · `durataDi(orari, giorno)` | ora e durata effettive di un giorno, con i ripieghi di serie |
| `fine(ora, durataOre)` | l'ora di fine sull'orologio: `'21:00', 4` → `'01:00'` |
| `istante(data, ora, fuso)` | i millisecondi UTC di quell'orologio in quel fuso, `NaN` se qualcosa non si legge. L'ora che non esiste al cambio d'ora scivola avanti (29/03/2026 02:30 a Roma → 03:30), l'ora che esiste due volte è la prima |
| `oraNelFuso(ms, fuso)` · `giornoDellaSettimana(data)` | `'HH:MM'` a quell'istante · 0–6, `-1` se la data non esiste |
| `eventiFuturi(orari, adessoMs)` | gli eventi non ancora finiti, dal primo che parte: `[{ indice, inizio, termine, …evento }]`, istanti in ms ed evento normalizzato; quelli in corso ci sono |
| `eventoAttivo(orari, adessoMs)` | l'evento **acceso adesso** (`inizio <= adesso < termine`) o `null`; a due sovrapposti vince quello cominciato prima, che è quello che si sta già guardando |
| `programmaSostituito(orari, adessoMs)` | `{ evento, giorni }`: l'evento acceso e, giorno per giorno (0–6), se la sua diretta regolare **finisce sotto** all'evento. Sfiorarsi non conta: la serata che comincia quando la maratona finisce si fa davvero. L'evento comanda da **mezzanotte del suo giorno** (fuso del canale), non dall'ora di inizio; `js/sito.js` fa lo stesso nel browser |

`normalizza` e `problemi` hanno due mestieri diversi. `normalizza` serve a **leggere**:
generazione, anteprima e riassunti del pannello devono mostrare qualcosa anche con una
casella a metà. `problemi` serve a **salvare**: 45 caratteri in un titolo si dicono a
chi li ha scritti, non si tagliano alle sue spalle. I suoi percorsi sono `''` (il ramo
intero), `giorni`, `ora`, `durataOre`, `fuso`, `schede`, `schede.N`,
`schede.N.<campo>`, `eventi`, `eventi.N`, `eventi.N.<campo>`, `sfondo`,
`sfondo.immagine`, `sfondo.fuoco`, `sfondo.intensita`; un fuoco sbagliato è
`….fuoco`, non `….fuoco.x`.

### Convalida, salvataggio e generazione della schedule

- `server/lib/convalida.js` passa `config.orari` a `SBOrari.problemi`. Ogni errore esce
  come `{ chiave: 'config.orari.schede.1.ora', messaggio, percorso: 'schede.1.ora' }`;
  un ramo che non è nemmeno un oggetto dà `chiave: 'config.orari'` e `percorso: ''`. Il
  pannello risale da solo dalla chiave al campo `config.orari`, e più errori sullo
  stesso campo non si coprono a vicenda.
- `costruisci.pulisciEditor` normalizza `config.orari` **solo se è già valido**: un ramo
  buono si completa (sette schede, eventi, fondale) senza cambiare niente di quello che
  si vede, e uno sbagliato arriva com'è alla convalida, che dice che cosa non va.
- `server/lib/archivio.js` ha `orari` in `RAMI_IN_BLOCCO`: il ramo si sostituisce
  intero, e il pannello lo manda sempre intero. Con la fusione chiave per chiave un
  evento cancellato rinascerebbe dal file salvato.
- Generazione e anteprima lavorano sempre su `SBOrari.normalizza(config.orari)`,
  compreso `{{config.orari.ora}}` della copertina.
- L'istante che decide quali eventi sono finiti è **uno solo** per la pagina e per
  `js/dati.js`: `costruisci.rendi(contenuti, { adesso })` in millisecondi, oppure
  `{ quando }` in ISO, altrimenti `Date.now()`.
- `server/lib/media.js` (`doveUsato`) scende dentro elenchi e oggetti: un'immagine di
  una scheda, di un evento o del fondale risulta in uso, e cancellarla risponde 409.
  Nel pannello `usoDi` di `pannello.js` la elenca come *Schedule · lunedì*,
  *Schedule · evento «…»*, *Schedule · fondale della sezione*.

### Dalla schedule alla pagina

`modelli/parziali/settimana.html` riceve:

**`settimana`** — il ciclo dei sette giorni, in ordine `ORDINE` (lunedì → domenica):

| Nome | Valore |
|---|---|
| `indice` | 0–6 (0 = domenica), finisce in `data-giorno` |
| `abbr` · `nome` | `LUN` · `Lunedì` |
| `diretta` | booleano |
| `ora` · `fine` | `HH:MM` effettive; `""` nei giorni di riposo |
| `tag` | `settimana.etichettaDiretta` o `settimana.etichettaRiposo` |
| `titolo` · `gioco` · `nota` | i testi; `""` nei giorni di riposo, anche se la scheda li ha |
| `contenuto` | vero se c'è almeno uno fra titolo, gioco e nota |
| `immagine` | il percorso, o `""` (sempre `""` nei giorni di riposo) |
| `stile` | `--fuoco: 30% 20%; --velo: 0.6` se c'è l'immagine, altrimenti `""` |

**`sito.eventi`** — gli eventi non ancora finiti all'istante della generazione, dal primo
che parte: `indice` (la posizione in `config.orari.eventi`, finisce in `data-evento`),
`data`, `ora`, `fine` (letta sull'orologio del canale all'istante di termine, giusta
anche a cavallo del cambio d'ora), `abbr` · `giorno` · `numero` · `mese` · `dataTesto`
(`DOM` · `Domenica` · `27` · `set` · `domenica 27 settembre`), `inizio` · `termine`
(ISO in UTC, per `data-inizio` e `data-fine`), `titolo`, `gioco`, `nota`, `contenuto`
(gioco o nota), `immagine`, `stile`.

**`sito.haEventi`** — booleano. **`sito.settimanaSfondo`** — `{ immagine, stile }`, con
`stile` = `--fuoco: 50% 50%; --intensita: 0.3`; tutti e due `""` se l'immagine manca o
l'intensità è 0, così un fondale spento non si scarica nemmeno. **`sito.orariTesto`** —
«Lunedì, mercoledì, venerdì e domenica alle 21:00» se l'ora è la stessa, «Lunedì alle
18:30, mercoledì alle 21:00 e domenica alle 16:00» se non lo è.

Gli attributi `style` della sezione portano solo `--fuoco`, `--velo` e `--intensita`,
con numeri ristretti un'altra volta dal server lì dove li scrive (CONTRATTO-5 §2.2):
nessun valore scritto da chi amministra ci passa accanto. `--velo` e `--intensita` sono
frazioni fra 0 e 1.

La marcatura su cui contano pannello e `js/sito.js`: `div.settimana__sfondo` primo
figlio di `section#settimana` (con dentro `img.settimana__sfondo-img` se c'è) ·
`ol#nastro[data-sb-parte="nastro"][data-sb-blocco="settimana.nastro"]` con sette
`li.nastro__giorno[data-giorno]` · solo se ci sono eventi,
`div.eventi[data-sb-parte="eventi"][data-sb-blocco="settimana.eventi"]` con i
`li.evento[data-evento][data-inizio][data-fine]`. Dentro giorni ed eventi **non c'è
nessun `data-sb-testo`**, apposta: il clic nell'anteprima deve arrivare alla parte e al
suo `[data-giorno]` o `[data-evento]`, non fermarsi su un testo. Le altre scelte di
marcatura e di foglio sono spiegate nei commenti di `modelli/parziali/settimana.html` e
di `css/sezioni.css`.

**`js/dati.js`** — il ramo `orari` di `window.DATI`:

```js
orari: {
  giorni: [1, 3, 5, 0], ora: '21:00', fuso: 'Europe/Rome', durataOre: 4,  // come prima
  ore:    { '0': '21:00', '1': '18:30', '3': '21:00', '5': '21:00' },   // ora effettiva di ogni giorno acceso
  durate: { '0': 4, '1': 2.5, '3': 4, '5': 4 },                         // durata effettiva di ogni giorno acceso
  eventi: [{ indice: 0, data: '2026-09-27', inizio: '2026-09-27T13:00:00.000Z',
             termine: '2026-09-28T01:00:00.000Z', titolo: 'Maratona' }]
}
```

e in `testi`, dopo `etichettaProssima`, `etichettaInOnda`, `etichettaDaTe` ed
`etichettaEvento`. `js/sito.js` non conosce le regole delle schede: per lui un giorno
acceso ha un'ora e una durata, punto. Con un solo timer calcola il conto alla rovescia
(la partenza più vicina fra giorni ed eventi; a pari istante vince l'evento), la data
della prossima volta di ogni giorno, i segni `is-oggi`, `is-prossima`, `is-in-onda` e
`ha-evento`, l'ora di chi guarda, e toglie i `li.evento` finiti (con `div.eventi`
nascosto quando non ne resta nessuno). Il DOM lo tocca solo quando un valore cambia.

### L'editor della schedule: `pannello/moduli/settimana.js`

`moduli/campi.js` lo carica con `import()` all'avvio, non con un import statico: un
guasto lì dentro, o `condivisi/orari.js` che non arriva, non si porta via il pannello.
Se il modulo non è ancora arrivato quando si disegna il campo, il campo nasce come
contenitore e gli gira le richieste fatte nel frattempo; se non arriva affatto, lo dice.
`valoreVuoto('orari')` è `SBOrari.normalizza({})`. La radice dell'editor ha anche la
classe `orari`, così `moduli/tema.js` continua a saltarla. Gli stili sono le classi
`.palinsesto*` in coda a `pannello/campi.css`, con due container query (`palinsesto` e
`riepilogo`): l'editor sta bene da 380 a 760 px e nelle viste del menu.

Esporta tre cose:

- **`creaCampoOrari(campo, accesso, ctx)`** — il contratto degli altri campi (`chiave`,
  `campo`, `nodo`, `valida()`, `mostraErrore(testo)`, `pulisci()`, `fuoco()`) più
  `apriVista(id)` (`'settimana'`, `'eventi'`, `'fondale'`), `apriGiorno(n, opzioni)` e
  `apriEvento(i, opzioni)`.
- **`creaRiepilogoOrari({ leggi, suGiorno })`** → `{ nodo, aggiorna }` — il riepilogo,
  in testa all'editor e da solo nella parte `stato`. Si aggiorna da sé a ogni
  `sb:modifica` di `config.orari` e a ogni `sb:sostituito`; con `suGiorno` i giorni in
  miniatura sono bottoni.
- **`creaBloccoImmagine({ etichetta, valore, modo, ritagli, alCambio, scegliImmagine,
  descrizione, vuoto, aiutoLivello })`** → `{ nodo, imposta(valore), valore(),
  mostraErrori(messaggi), fuoco() }` — il blocco immagine, un pezzo a sé che non sa
  niente dei dati. `modo` è `'velo'` (30–90), `'intensita'` (0–100) o `'nessuno'`;
  `alCambio(nuovo, { dalVivo })` ha `dalVivo` vero durante un gesto che continua
  (trascinamento, cursore tenuto) e falso sul valore definitivo.

Tre regole spiegano il resto del file:

1. **Le regole non stanno qui.** Limiti, valori vuoti, ore effettive e problemi arrivano
   da `window.SBOrari`: il pannello non può dire «va bene» a una durata che il server
   rifiuta.
2. **Si scrive quello che si è scritto.** Una casella con `25:00` finisce nei dati così,
   e l'errore compare accanto. Le sole correzioni sono visibili: all'uscita un'ora
   `2130` diventa `21:30`, un a capo incollato diventa uno spazio. Prima di scrivere
   dentro schede, eventi o sfondo, `struttura()` crea quello che manca e non tocca i
   valori che ci sono, giusti o sbagliati.
3. **Il DOM non si rifà mentre si scrive.** Righe, caselle e immagini nascono una volta;
   a ogni modifica si riscrivono solo i riassunti (miniature, righe, contatori). Un
   editor ridisegnato a ogni tasto perderebbe il fuoco a metà parola.

**Linguette ed errori.** Le tre viste sono un `tablist` con frecce, `Inizio` e `Fine`.
`ricordo` (vista, giorno, evento aperti) è condiviso fra le istanze: dopo Annulla
(`sb:sostituito`) l'editor si ridisegna da capo e riapre lo stesso posto. `problemi()`
gira a ogni scrittura, ma gli errori si mostrano solo sui percorsi toccati (all'uscita
dalla casella), oppure tutti dopo `valida()` o un rifiuto del server; la casella in cui
si sta scrivendo può solo perderli. Fuoco e velo non hanno una casella: i loro errori
vanno sulla riga d'errore del blocco immagine.

**`RITAGLI`** — i rapporti larghezza / altezza delle miniature Computer e Telefono,
misurati sulla pagina vera:

| Uso | Computer | Telefono |
|---|---|---|
| `giorno` | `2 / 3` | `16 / 9` |
| `evento` | `3 / 4` | `5 / 4` |
| `sfondo` | `4 / 3` | `2 / 3` |

Servono solo a far vedere che cosa resta in vista con quel fuoco. Se `css/sezioni.css`
cambia le proporzioni di locandine, eventi o fondale, vanno ritoccati qui.

**Il legame con l'anteprima** passa dal motore, chiesto con
`import('../editor/motore.js')` e usato sempre dentro un `try`: senza motore l'editor
funziona lo stesso.

- **Clic nell'anteprima** — il motore seleziona la parte `nastro` o `eventi` con il suo
  ascoltatore in cattura, quindi prima; l'editor ascolta i clic sul documento
  dell'iframe (`motore.documento()`, riagganciato a ogni `sb:anteprima-pronta`) e apre
  il giorno o l'evento del `li.nastro__giorno[data-giorno]` o `li.evento[data-evento]`
  più vicino. Risponde l'istanza dell'editor che si vede.
- **Contorno** — `<style id="sb-palinsesto-evidenza">` iniettato nell'iframe, con
  `var(--sbm-ciano)` del motore, sul giorno o sull'evento aperto, oppure su
  `#settimana` con la linguetta Fondale. Si rimette a ogni `sb:anteprima-pronta` e a
  ogni cambio di selezione (`motore.suSelezione`).
- **Dal vivo** — fuoco, velo e intensità si scrivono subito con
  `style.setProperty('--fuoco' | '--velo' | '--intensita')` sull'elemento dell'iframe
  (`li[data-giorno]`, `li[data-evento]`, `div.settimana__sfondo`), con le frazioni
  della generazione, prima della ricarica normale. Durante un gesto i dati si scrivono
  al più una volta per fotogramma.
- **Scorrimento** — aprendo un giorno o un evento dal pannello, l'anteprima ci scorre se
  è fuori vista.

### Le parti `stato`, `nastro` ed `eventi` in `nomi.js`

- **`nastro`** — `config.orari` più le etichette `settimana.etichettaDiretta`,
  `etichettaRiposo`, `etichettaOggi`, `etichettaProssima`, `etichettaInOnda` ed
  `etichettaDaTe`. Blocco `settimana.nastro`.
- **`eventi`**, nuova, dopo `nastro` — `config.orari`, `settimana.titoloEventi` e
  `settimana.etichettaEvento`. Blocco `settimana.eventi`, nome *Eventi speciali*.
- **`stato`** — **non** ha più `config.orari`. Così la ricerca e gli errori del server su
  `config.orari.*` portano sempre dove c'è l'editor vero: `partiDellaChiave('config.orari')`
  → `['nastro', 'eventi']`. Nella parte `stato` `parti.js` disegna solo il riepilogo
  (`creaRiepilogoOrari`) e il bottone **Modifica la schedule**
  (`motore.seleziona('parte:nastro')` e `motore.scorriA`), con un avviso se il nastro
  non è nell'anteprima.

`parti.js` apre la schedule sulla vista della parte (`nastro` → Settimana, `eventi` →
Eventi speciali) quando la parte **entra** nel pannello, non a ogni ricarica
dell'anteprima: chi sta lavorando su un'altra linguetta resta lì.

### Caricare immagini: `preparaImmagine` e `caricaImmagine`

In `pannello/moduli/media.js`:

```js
export async function preparaImmagine(file, { latoMax = 2400, qualita = 0.82 } = {})  // -> Promise<File>
export async function caricaImmagine(file)                                           // -> Promise<string | null>
```

**`preparaImmagine`**:

- guarda l'estensione del nome: si toccano solo `png`, `jpg`, `jpeg` e `webp`; tutto il
  resto (SVG, GIF, estensioni sconosciute) torna identico;
- legge il formato vero dai primi byte: un file con il nome da PNG, JPG o WebP che dentro
  non lo è **lancia un `Error`** con il messaggio già scritto per chi usa il pannello;
- PNG e WebP **animati** tornano identici: ridisegnati terrebbero solo il primo
  fotogramma;
- sotto i **350 kB** e dentro `latoMax` il file parte com'è; se il contenuto non
  corrisponde al nome (un JPEG salvato come `.png`) parte con l'estensione giusta, che
  il server altrimenti rifiuterebbe;
- oltre soglia riduce con `createImageBitmap(file, { resizeWidth, resizeHeight,
  resizeQuality: 'high' })` (il filtro buono del browser, non quello veloce di una tela
  rimpicciolita), disegna su una tela e scrive con `toBlob('image/webp', qualita)`; il
  file nuovo si chiama come prima, con `.webp`;
- se il browser non sa scrivere WebP (e restituisce un PNG) o il WebP non pesa meno,
  parte l'originale.

**`caricaImmagine`** controlla l'estensione (PNG, JPG, WEBP, SVG), prepara, controlla i
**4 MB dopo** la preparazione, carica con `api.caricaMedia` (`POST /api/media`) e mostra
lei gli avvisi: attesa, riuscita con il peso prima e dopo, errore. Restituisce
`'contenuti/media/<nome>'` oppure `null`, e **non lancia**: chi la chiama non deve
mostrare altri avvisi. `creaLibreria` carica ogni file con `caricaImmagine`, uno alla
volta (più foto grandi insieme terrebbero in memoria tutte le loro tele); il blocco
immagine della schedule la usa per **Carica dal computer** e per il file trascinato.
L'ultima parola resta al server: formati ammessi, 4 MB, nome ripulito da
`normalizzaNome` e mai sovrascritto (`-2`, `-3`).

### Compatibilità con il formato di prima

- Un `contenuti.json` con `config.orari` nella forma vecchia — `{ giorni, ora,
  durataOre, fuso }`, senza `schede`, `eventi` e `sfondo` — **resta valido**:
  `problemi()` tollera le assenze. Al primo salvataggio `pulisciEditor` lo completa con
  sette schede vuote, `eventi: []` e un fondale vuoto: il fondale **non** si accende da
  solo.
- Una scheda o un evento senza `fuoco` o `velo` valgono con quelli di serie.
- **Una regola è più stretta di prima**: la durata di serie va da 0,5 a 24 **a passi di
  mezz'ora**, mentre prima bastava un numero maggiore di 0 e fino a 24. Una durata come
  `3.75` non passa più la convalida e va riscritta; nell'anteprima `normalizza` la
  arrotonda intanto a `4`.
- L'editor, prima di scrivere dentro schede, eventi o sfondo, crea la parte che manca e
  non tocca il resto.
- `js/sito.js` accetta anche un `js/dati.js` vecchio, senza `ore`, `durate` ed `eventi`:
  ogni giorno vale con l'ora e la durata di serie, e le etichette nuove ripiegano sui
  valori di partenza (*In onda*, *Da te*, *Speciale*).
- Il vecchio `campoOrari` e l'export `GIORNI` di `moduli/campi.js` non esistono più;
  nessun altro file li usava.

Il collaudo resta `node server/autotest.js`, con la sezione 11, *La schedule*: 172 prove
in tutto.

---

## 29. Riassunto in cinque righe

1. `node server/server.js`, poi `http://localhost:4173/pannello/`.
2. Clicca nell'anteprima la cosa da cambiare (o trovala con `Ctrl+K`).
3. Cambiala dalle schede **Contenuto**, **Stile** e **Avanzate**, guardando anche Telefono e Tablet.
4. **Salva** (`Ctrl+S`) — il sito non cambia ancora.
5. **Pubblica** — adesso lo vedono tutti.
