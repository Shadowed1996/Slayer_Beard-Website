# Il pannello — guida per chi aggiorna il sito

Questa guida è per chi deve cambiare i testi, i link, gli orari, le immagini
e adesso anche i colori del sito. Non serve saper programmare: si legge
dall'inizio alla fine una volta sola, poi si torna a cercare il pezzo che serve.

---

## 1. La cosa più importante, prima di tutto

Nel pannello ci sono due bottoni che sembrano simili e fanno due cose diverse.

| Bottone | Cosa fa | Chi se ne accorge |
|---|---|---|
| **Salva** | Mette da parte le tue modifiche sul server. | Nessuno. Il sito che vede il pubblico **non cambia**. |
| **Pubblica** | Riscrive il sito vero con quello che hai salvato. | **Tutti.** Da quel momento chi apre il sito vede le modifiche. |

C'è una terza cosa, in mezzo, che è facile confondere con le altre due:
**guardare**. L'anteprima ti fa vedere le modifiche anche prima di salvarle,
ma vederle non le salva e non le pubblica. In ordine:

**modifichi → guardi → salvi → pubblichi.**

I quattro passi sono scritti anche in fondo alla colonna di sinistra, e quello
a cui sei arrivato si accende da solo.

Quindi: si lavora, si **salva** quante volte si vuole, e si **pubblica** solo
quando è tutto come deve essere.

Se premi Pubblica mentre hai modifiche non salvate, il pannello se ne accorge e
ti propone di salvarle prima: basta dire di sì.

> **Che cosa riscrive «Pubblica»**: tre file. La pagina (`index.html`), i dati
> che servono al JavaScript del sito (`js/dati.js`) e il foglio dei colori
> (`css/tema.css`). Te lo ricorda anche la finestra di conferma. Se il sito sta
> su un hosting esterno, dopo aver pubblicato vanno caricati **tutti e tre**:
> caricare solo la pagina lascia online i colori vecchi.

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

Per spegnere tutto, torna nella finestra nera e premi `Ctrl+C`.

---

## 3. Entrare

**La prima volta in assoluto** il server non ha ancora una password. Il pannello
se ne accorge da solo e ti mostra la schermata «crea la password»: scrivila due
volte (almeno 8 caratteri) e premi *Crea la password ed entra*.

> Scrivi quella password anche da qualche altra parte al sicuro. Non si recupera.

**Tutte le altre volte** ti chiede solo la password. Il tasto *Mostra* accanto al
campo serve a rileggere quello che hai scritto, se temi un errore di battitura.

**Se hai perso la password:** dal computer dove gira il sito, ferma il server e
scrivi `node server/imposta-password.js`. Ti farà scegliere una password nuova.

**Per uscire** c'è l'icona con la freccia che esce dalla porta, in alto a destra.
Se hai modifiche non salvate, il pannello te lo dice prima di lasciarti uscire.

---

## 4. Come è fatta la schermata

- **In alto**: il nome del canale, una spia con scritto *Tutto salvato* oppure
  *Modifiche non salvate*, la data dell'ultima pubblicazione, e i bottoni
  **Salva**, **Pubblica**, l'occhio dell'**anteprima** e l'uscita.
- **A sinistra**, dall'alto in basso: la **casella di ricerca**, l'elenco delle
  sezioni del sito, gli strumenti **Immagini** e **Copie di sicurezza**, e il
  promemoria dei quattro passi.
- **Al centro**: i campi della sezione che hai scelto.
- **A destra**, quando la apri: l'**anteprima**.

Le sezioni, nell'ordine in cui si incontrano scendendo per il sito:

| Sezione | Cosa contiene |
|---|---|
| Scheda della pagina | Titolo e descrizioni per Google e per le anteprime dei link |
| Marchio e navigazione | Nome del canale e le sei voci del menu laterale |
| Copertina | La prima schermata: titolo, spie, i quattro numeri del canale |
| La diretta | La sezione del player: testi intorno al video e bottoni della chat |
| Modalità lurk | Il riquadro sotto al video per chi guarda e si allontana |
| Il pollo | La mascotte accanto alla chat: cosa dice e cosa ascolta |
| La settimana | Il calendario dei sette giorni, e i **giorni e l'ora delle dirette** |
| Chi sono | Il testo lungo, le note a margine, la citazione |
| Come dare una mano | Il listino del supporto |
| Dove mi trovi | Social e contatti |
| Piede della pagina | Le tre righe in fondo |
| Canale, contatti e immagini | I dati tecnici: canale Twitch, email, immagini |
| Aspetto | Colori, caratteri e forma di tutto il sito |

Su telefono o su una finestra stretta la colonna di sinistra si nasconde: si
riapre con il bottone a tre righe in alto a sinistra.

Sotto ogni campo, quando c'è, trovi una riga più piccola che spiega a cosa serve
quel campo. Sui testi lunghi, in basso a destra, c'è il conteggio dei caratteri:
quando diventa arancione sei vicino al limite, quando diventa rosso l'hai passato.

In fondo alla colonna c'è **Mostra i nomi tecnici dei campi**: acceso, sotto ogni
etichetta compare il nome vero della chiave (per esempio `deck.titolo`). Serve
solo se stai parlando al telefono con chi ha scritto il sito.

---

## 5. Trovare un campo in fretta

I campi sono più di quaranta e scorrere le sezioni a mano non basta più.

In cima alla colonna di sinistra c'è la casella **Cerca un campo…**
(scorciatoia: `Ctrl+K`, `Cmd+K` su Mac). Scrivi due o tre lettere del nome del
campo — «citazione», «follower», «fondo» — e sotto compare l'elenco di quelli
che ci somigliano, con scritto in che sezione stanno.

- Si sceglie con le **frecce su e giù** e `Invio`, o con il mouse.
- Il pannello apre la sezione giusta, scorre fino al campo e lo evidenzia per un
  istante, così lo trovi con l'occhio.
- `Esc` chiude l'elenco.

---

## 6. Cambiare un testo

1. A sinistra, scegli la sezione (per esempio *Copertina*).
2. Clicca dentro il campo e scrivi.
3. La spia in alto diventa arancione: **Modifiche non salvate**.
4. Premi **Salva** (oppure `Ctrl+S`).
5. Quando sei contento di come è venuto tutto, premi **Pubblica**.

Se chiudi la finestra del browser con modifiche non salvate, il browser ti
avvisa. Se dici di uscire lo stesso, quelle modifiche si perdono.

---

## 7. Testi con grassetto, corsivo, link e a capo

Alcuni campi — i testi dei paragrafi, le note, la citazione, le spiegazioni del
supporto — non sono caselle nude: hanno una **barretta di pulsanti** sopra.

| Pulsante | Cosa fa | Scorciatoia |
|---|---|---|
| **G** | Grassetto | `Ctrl+B` |
| *C* | Corsivo | `Ctrl+I` |
| S | Sottolineato | `Ctrl+U` |
| Link | Trasforma la parte selezionata in un collegamento | |
| ↵ | Va a capo dentro lo stesso paragrafo | `Invio` |
| Pulisci | Toglie grassetto, corsivo e link dalla selezione | |
| `</>` | Mostra il codice, per chi sa cosa sta facendo | |

Per fare un link: **seleziona le parole**, premi *Link*, scrivi l'indirizzo e
premi *Applica*. Gli indirizzi devono cominciare con `https://`, `http://`,
`mailto:` oppure essere un percorso interno al sito. Un link che va fuori si apre
da solo in una scheda nuova: non c'è niente da impostare.

Il contatore in basso a destra conta **le lettere che si leggono**, non la
formattazione: mettere in grassetto una parola non consuma caratteri.

### Perché non tutto l'HTML è ammesso

Nei testi si può usare solo un piccolo elenco di cose: grassetto, corsivo,
sottolineato, barrato, a capo, testo piccolo, evidenziato, apice, pedice,
`codice`, abbreviazioni e link. Tutto il resto **viene tolto quando il sito
viene generato**: sparisce il pezzo di codice, resta il testo che c'era dentro.

Non è una scortesia, sono due motivi seri:

1. **Sicurezza.** Se un testo potesse contenere qualunque cosa, chiunque
   riuscisse a entrare qui dentro potrebbe infilare del codice nel sito che
   vedono i visitatori. Con la lista corta, il peggio che può succedere è che un
   pezzo di testo venga scritto storto.
2. **Il sito resta in piedi.** Titoli, riquadri, immagini e colonne hanno già il
   loro posto: incollandoli dentro un paragrafo si romperebbe l'impaginazione.
   Le immagini si scelgono nel campo apposta, i colori nel gruppo *Aspetto*, i
   titoli nel campo del titolo.

Se scrivi qualcosa che non è ammesso, il pannello **te lo dice sotto il campo**,
in italiano, spiegando cosa ha tolto e perché. Non aspetta la pubblicazione.

Un dettaglio comodo: se incolli un testo da Word o da una pagina web, la
formattazione strana viene ripulita **al momento di incollare**. Quello che vedi
è quello che finirà sul sito.

---

## 8. Guardare com'è venuto prima di pubblicare

Il bottone con l'**occhio**, in alto a destra, apre l'anteprima di fianco al form.

L'anteprima mostra il sito **con le modifiche in corso, anche quelle non ancora
salvate**. È il modo di provare le cose: scrivi, guardi, e se non ti piace torni
indietro senza aver salvato niente.

- La casella **Automatica** (accesa di serie) rigenera l'anteprima poco dopo che
  hai smesso di scrivere. Se la spegni, si aggiorna solo quando premi *Aggiorna*.
- *A tutta pagina* la allarga su tutta la finestra.
- *Scheda nuova* apre in una scheda a parte la **bozza già salvata sul server**:
  è l'unica delle tre che non conosce le modifiche non salvate. Comodo per
  guardarla sul telefono.

Sotto il titolo dell'anteprima c'è sempre una riga che dice cosa stai guardando
in questo momento: *«Mostra le modifiche in corso, comprese quelle non salvate.
Il sito pubblicato non è ancora cambiato.»*

Se un testo è a metà e la pagina non si riesce a comporre, l'anteprima lo dice
con un messaggio rosso invece di sbiancare: continua a scrivere, si riprende da
sola.

### Le cose da guardare prima di mandarlo online

Subito dopo aver pubblicato può comparire un avviso azzurro intitolato **«N cose
da guardare prima di mandarlo online»**. Non è un errore e non è successo
niente di male: la pubblicazione è andata a buon fine.

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

## 9. Cambiare un'immagine

1. Vai nella sezione che contiene l'immagine (per esempio *Canale, contatti e
   immagini* per l'avatar e per il disegno del pollo).
2. Sotto l'anteprima dell'immagine premi **Scegli o carica**.
3. Si apre la libreria. Da lì puoi:
   - **cliccare un'immagine già presente** per usarla subito;
   - **trascinare un file** dentro il riquadro tratteggiato per caricarlo;
   - premere **Scegli un file** e prenderlo dal computer.
4. Appena l'immagine è caricata viene scelta da sola.
5. **Salva**, controlla in anteprima, **Pubblica**.

Formati accettati: PNG, JPG, WEBP, SVG. Massimo 4 MB per file.

Il bottone **Togli** svuota il campo: l'immagine sparisce dal sito ma il file
resta nella libreria.

### Gestire la libreria

La voce **Immagini** nella colonna di sinistra apre la libreria intera. Per ogni
file puoi copiare il percorso o eliminarlo.

Un'immagine ancora usata da qualche parte nel sito **non si può eliminare**: il
server rifiuta e il pannello ti dice dove è usata. Per toglierla davvero: vai
prima nel campo che la usa, mettine un'altra, salva, e poi torna qui a
eliminarla.

---

## 10. Aggiungere un social (o una voce del supporto)

I social e le voci del supporto sono **elenchi**: si comportano tutti allo stesso
modo.

1. Vai nella sezione giusta (*Dove mi trovi* per i social, *Come dare una mano*
   per il supporto).
2. In fondo all'elenco premi **Aggiungi una voce**: nasce una voce vuota, già
   aperta.
3. Riempi i campi: nome, indirizzo, icona, e quello che c'è.
4. **Salva**.

Sulla riga di ogni voce ci sono tre bottoni:

- **freccia su** / **freccia giù** — cambiano l'ordine in cui compaiono sul sito;
- **cestino** — elimina la voce, chiedendoti conferma prima.

Cliccando sul titolo della voce la chiudi o la riapri: comodo quando l'elenco è
lungo.

> **Un social che non hai ancora**: lascia il campo dell'indirizzo **vuoto**.
> La voce resta qui nel pannello ma **non compare sul sito**, invece di comparire
> come un link rotto. Quando il profilo esisterà, basterà scrivere l'indirizzo.

---

## 11. Cambiare i giorni e l'ora delle dirette

Nella sezione **La settimana** c'è il campo **Giorni e ora delle dirette**. È
fatto di quattro pezzi:

- i **sette giorni**: si accendono e si spengono cliccandoli (accesi = si va in
  diretta);
- **Ora di inizio**: si scrive come `21:00`;
- **Durata (ore)**: quante ore dura di solito una diretta;
- **Fuso orario**: lascialo su `Europe/Rome` a meno che tu non abbia traslocato.

Sotto trovi una riga che ti rilegge quello che hai scelto a parole. Se dice
quello che intendevi, è giusto.

Questi valori comandano il calendario della settimana e il conto alla rovescia
del sito: cambiarli qui li cambia in tutte e due i posti.

---

## 12. La modalità lurk

Sotto al video, nella sezione «La diretta» del sito, può comparire un secondo
riquadro: la **modalità lurk**. Le sue impostazioni stanno tutte nella sezione
**Modalità lurk** del pannello, fra *La diretta* e *Il pollo*.

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

Acceso, mostra una riga che dice in ogni momento cosa sta succedendo. Gli stati
possibili sono **sette**, e le parole le scrivi tu nei campi *Stato — …*:

- **spenta** — il visitatore non l'ha accesa. È lo stato di partenza.
- **il video sta andando** — tutto a posto, non c'è niente da fare.
- **il video si è fermato** — il browser l'ha messo in pausa: sta per riprovare.
- **sto riavviando** — ci sta provando. Fra un tentativo e l'altro aspetta
  sempre di più: 5 secondi, poi 15, poi 45, poi 2 minuti.
- **riproduzione bloccata dal browser** — il browser ha vietato la partenza
  automatica del video. Serve un clic della persona: da qui non si rimedia.
- **canale fuori onda** — la diretta è finita. Non c'è nessuna sessione da
  tenere viva: il lurk aspetta e non tocca più niente.
- **ho smesso di provarci** — i tentativi sono finiti. Si riparte ricaricando la
  pagina.

Sotto alla riga di stato c'è un contatore, del tipo «viva da 1h 12m · 2
riavvii», e i bottoni per attivare, disattivare e togliere il muto.

### I campi, uno per uno

**Mostra la modalità lurk** — l'interruttore principale. **Spento, il riquadro
non compare per nessuno** e il resto della sezione non ha più effetto. È il modo
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
della pagina, la domanda «ci sei ancora?», i sette stati e le due righe del
contatore. Nei due campi del contatore puoi scrivere `{durata}` e `{riavvii}`,
che vengono sostituiti dai numeri veri; negli altri campi le parentesi graffe
resterebbero stampate così come sono.

Il bottone *togli il muto* merita una riga a parte. Una scheda muta viene
sospesa dal browser più facilmente di una che sta suonando, quindi togliere il
muto aiuta davvero. Ma il sito **non lo toglie mai da solo**: sarebbe il trucco
per cui Twitch ha cominciato a bloccare i video incorporati nei siti. Offre il
bottone, e lo preme chi guarda.

### Dire in chat che si sta guardando

Sotto c'è il secondo pezzo della sezione: un bottone che manda in chat **un**
messaggio a nome di chi lo preme. **Di serie è spento**, e per accenderlo devi
prima registrare un'applicazione su Twitch — le istruzioni sono più sotto.

Prima di tutto il resto, la cosa che conta:

> **Questo messaggio non fa salire il numero di spettatori.** Twitch non conta
> chi scrive in chat: conta chi ha il video acceso. Se lo accendi sperando di
> vedere il contatore salire, resterai deluso. Serve a un'altra cosa — farsi
> vedere da chi legge la chat e da chi sta trasmettendo — e va acceso solo se è
> quella che vuoi.

**Permetti di dire in chat che si sta guardando** — l'interruttore. Anche
acceso, resta senza effetto finché non ci sono un Client ID e almeno una frase.

**Client ID dell'app Twitch** — il codice dell'applicazione che registri tu. È
pubblico per sua natura e finisce dentro la pagina del sito: va bene così, è
fatto per essere visto.

**Indirizzo di ritorno dopo il login** — l'indirizzo su cui il visitatore torna
dopo aver detto sì a Twitch. Deve **combaciare carattere per carattere** con
quello registrato su Twitch, barra finale compresa. Lasciato vuoto, il sito usa
l'indirizzo della pagina in cui si trova.

**Frasi del messaggio di lurk** — l'elenco da cui il sito pesca. Leggi il
riquadro qui sotto **prima** di scriverle.

**I bottoni e le righe di questa parte** — *collegati con Twitch*, *scollega*,
la riga «collegato come {nome}», l'invito che compare accendendo il lurk,
l'avviso di cosa verrà detto in chat, il bottone *dillo in chat* e la conferma
dopo l'invio. Nell'invito e nell'avviso puoi scrivere `{frase}`, che viene
sostituito dalla frase vera: **toglierlo è una pessima idea**, perché è l'unico
punto in cui chi sta per collegarsi legge che cosa verrà detto a nome suo.

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
6. Da quella pagina può dirlo al massimo **tre volte**, e comunque non più di
   una al minuto: spegnere e riaccendere il lurk dieci volte non deve
   diventare dieci messaggi in chat. Per ricominciare si ricarica la pagina.

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

Si fa una volta sola, e solo se vuoi accendere il messaggio in chat.

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
   dell'app Twitch* del pannello, accendi l'interruttore, poi **Salva** e
   **Pubblica**.

> **Il «client secret» non va copiato da nessuna parte.** Nella stessa pagina
> Twitch te ne offre uno: qui non serve, non c'è nessun campo dove metterlo, e
> non deve essercene uno. Tutto quello che scrivi nel pannello finisce dentro la
> pagina del sito, che chiunque può leggere: un secret lì dentro sarebbe un
> secret regalato al primo che passa.

### Quando qualcosa non va

**Il riquadro del lurk non compare sul sito**
Controlla che *Mostra la modalità lurk* sia acceso e che tu abbia
**pubblicato** dopo averlo acceso.

**Il bottone «collegati con Twitch» non c'è, né sopra al video né accendendo il lurk**
**Guarda il sito da `http://localhost:4173/`: te lo dice lui.** Quando il
collegamento è spento, in fondo al riquadro della modalità lurk compare una riga
che spiega esattamente cosa manca — il Client ID, le frasi, o l'interruttore. Su
`localhost` e basta: sul sito pubblicato quella riga non compare a nessuno.

Nel 99% dei casi **manca il Client ID**, oppure l'elenco delle frasi è vuoto:
senza tutti e due il collegamento resta spento anche con l'interruttore acceso,
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
pannello adesso rifiuta di salvare un Client ID che non ha nemmeno la forma
giusta — trenta caratteri, solo minuscole e cifre — ma un codice ben scritto che
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

## 13. Il pollo

Accanto al player, nella sezione «La diretta», c'è la mascotte: un pollo che fa
da bottone per aprire la chat e che ogni tanto dice una frase in un fumetto.

Le sue impostazioni stanno tutte nella sezione **Il pollo**.

### Cosa dice

Sette elenchi di frasi, uno per situazione: quando non succede niente, quando
gli si clicca sopra, quando qualcuno scrive in chat, mentre qualcuno sta
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
  dal sito per tutti** e il resto di questa sezione non ha più effetto.
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

## 14. Aspetto: colori, caratteri e forma

La sezione **Aspetto**, in fondo alla colonna, cambia il sito **intero** in una
volta: non è la sezione di una pagina, è la pelle di tutte.

In cima ci sono le **combinazioni pronte**: cinque bottoni, ognuno vestito dei
propri colori. Un clic riscrive tutti i colori e i caratteri qui sotto. È il modo
più veloce per capire dove si vuole andare: provale, poi correggi a mano quello
che non ti torna. Niente va online finché non pubblichi.

Accanto c'è **Ripristina i colori di partenza**, che rimette tutto com'era:
chiede conferma, perché butta via le prove che hai fatto.

### I colori, uno per uno

Ogni colore ha tre cose: il quadratino che apre il selettore del sistema, la
casella dove puoi incollare il codice (si scrive per esteso, `#8b2fff`: sei cifre
dopo il cancelletto, non tre) e — sotto — **il rapporto di contrasto**.

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
tutti e tre subito dopo aver cambiato il fondo — o parti da una combinazione
pronta chiara (*Carta chiara*) e ritocca da lì.

### I caratteri

Tre menu: **titoli**, **testo** e **strumentazione** (le etichette maiuscole, i
numeri, il conto alla rovescia). Si sceglie da un elenco chiuso, ogni voce è
scritta nel carattere vero, così si vede prima di scegliere. Sotto al menu c'è
scritto cosa userebbe il sito se quel carattere non arrivasse.

Due avvertenze pratiche: i caratteri che non sono «di sistema» vengono scaricati
da Google e appesantiscono un po' il caricamento della pagina (sceglierne tre
diversi costa di più che tenerne due uguali), e per la **strumentazione** conviene
restare su un carattere a larghezza fissa, altrimenti il conto alla rovescia
balla a ogni secondo.

### Forma e sfondo

- **Arrotondamento degli angoli**: 0 è tutto squadrato. Gli angoli piccoli e
  quelli grandi si ricalcolano da questo numero.
- **Larghezza massima del contenuto**: oltre questa misura il sito smette di
  allargarsi e resta centrato. Vale anche per il player.
- **Unità di spaziatura**: tutti i margini del sito sono suoi multipli. Alzarla
  distanzia ogni cosa, non solo una sezione: si tocca con prudenza.
- **Intensità degli aloni sullo sfondo**: le macchie di colore dietro alla
  pagina. 0 = fondo piatto, 100 = come adesso, 200 = doppio.

Con l'anteprima aperta i colori cambiano **sotto gli occhi**, senza ricaricare
niente. E come sempre: finché non premi Pubblica, il sito vero è quello di prima.

---

## 15. Se qualcosa va storto: tornare indietro

Ogni volta che pubblichi, il server mette da parte una **copia di sicurezza** del
sito com'era prima: la pagina, i dati, il foglio dei colori e i contenuti.

1. Nella colonna di sinistra scegli **Copie di sicurezza**.
2. Trovi l'elenco, dalla più recente, con la data scritta per esteso.
3. Premi **Ripristina** sulla copia a cui vuoi tornare.
4. Il pannello ti chiede conferma **due volte**: la seconda con una casella da
   spuntare. È voluto: questa è l'unica operazione che riscrive il sito senza
   passare da una modifica tua.

Prima di ripristinare, il server salva una copia anche dello stato di adesso:
quindi pure un ripristino sbagliato si può annullare tornando in questa stessa
pagina.

Dopo il ripristino il pannello ricarica tutto dal server. Le modifiche non
salvate che avevi in corso si perdono: salva prima, se ti servono.

Le copie conservate sono le venti più recenti; le più vecchie spariscono da sole.

---

## 16. Scorciatoie da tastiera

| Tasti | Cosa fanno |
|---|---|
| `Ctrl+S` (`Cmd+S` su Mac) | Salva la bozza |
| `Ctrl+K` (`Cmd+K`) | Va alla ricerca dei campi |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Grassetto, corsivo, sottolineato (dentro i campi con la barretta) |
| `Tab` / `Shift+Tab` | Passano da un campo all'altro |
| `Invio` su un bottone | Lo preme |
| `Esc` | Chiude la finestra di conferma aperta, l'elenco della ricerca, o la colonna delle sezioni |

Tutto il pannello si usa anche senza mouse: il campo o il bottone su cui sei ha
sempre un bordo azzurro ben visibile.

---

## 17. Quando qualcosa non funziona

**«Non riesco a contattare il server»**
La finestra nera con `node server/server.js` è stata chiusa o il computer è stato
riavviato. Riaprila e premi *Riprova*.

**«La sessione è scaduta»**
Sei rimasto fermo troppo a lungo. Il pannello ti riporta alla password e ti dice
che le modifiche in corso sono ancora lì: rientra e le ritrovi come le avevi
lasciate. Non ricaricare la pagina prima di essere rientrato.

**Il server ha rifiutato il salvataggio**
In cima al form compare un riquadro rosso con l'elenco dei problemi, la sezione
che li contiene si accende in rosso nella colonna di sinistra, e il messaggio
compare **sotto il campo che l'ha causato**. Correggi, e il messaggio sparisce da
solo. Cliccando una voce dell'elenco rosso salti direttamente a quel campo.

**«Il tag … non è ammesso» sotto un campo di testo**
Hai incollato o scritto del codice che nei testi non si può usare. Il messaggio
dice cosa è stato tolto: quasi sempre basta usare i pulsanti della barretta
(capitolo 7). Il testo che c'era dentro non si perde.

**Ho pubblicato ma sul sito non vedo niente di nuovo**
Ricarica la pagina del sito tenendo premuto `Ctrl` mentre premi `F5`: il browser
tiene in memoria la versione vecchia. Se il sito sta su un hosting esterno,
controlla di aver caricato **tutti e tre** i file rigenerati, `css/tema.css`
compreso: se manca quello, i testi cambiano e i colori no.

**Ho cambiato i colori e non cambia niente sul sito pubblicato**
Quasi sempre è il file dei colori non caricato online (vedi qui sopra). In locale
invece basta ripubblicare: i colori vivono in un file a parte, che si riscrive
solo con Pubblica.

**Il testo non si legge più**
Vai in *Aspetto* e guarda il rapporto di contrasto dei tre colori del testo
(capitolo 14). Se non è almeno **AA**, alza il contrasto o premi *Ripristina i
colori di partenza*.

**Il pollo non dice niente / non compare**
Nell'ordine: controlla che *Mostra il pollo* sia acceso; che gli elenchi di frasi
non siano vuoti; che tu abbia **pubblicato** dopo aver cambiato queste cose. Se
il fumetto non nomina mai nessuno, può essere che *Ascolta la chat vera del
canale* sia spento, o che in chat non stia scrivendo nessuno. Ricorda anche che
se hai chiuso il pollo con la «x» quel browser non te lo rimostra: apri il sito
in una finestra anonima per controllare.

**La modalità lurk non compare, o non riavvia niente**
Controlla che *Mostra la modalità lurk* sia acceso e di aver **pubblicato** dopo
averlo acceso. Se il riquadro c'è ma dice che i comandi del video non sono
disponibili, è un blocco della pubblicità che sta fermando il programma di
Twitch: capitolo 12.

**Il messaggio in chat non parte**
Quasi sempre è un'impostazione della chat — solo per chi segue, solo per
abbonati, slow mode — o l'email non verificata sull'account di chi scrive.
L'elenco completo è nel capitolo 12. E ricorda che quel messaggio **non fa
salire il numero di spettatori**: non serve a quello.

**Il player di Twitch non parte nell'anteprima**
Normale in anteprima locale: dipende dal browser che blocca i contenuti di
terze parti. Sul sito pubblicato funziona.

**L'anteprima dice «non si è potuta comporre»**
Un campo è a metà o contiene qualcosa che la pagina non riesce a usare. Il
messaggio dice dove. Sistemalo e l'anteprima riparte da sola: non hai rotto
niente, il sito pubblicato non è stato toccato.

**Non riesco a eliminare un'immagine**
È ancora usata da qualche parte. Il messaggio ti dice dove: cambiala lì, salva, e
poi riprova.

**Ho fatto un disastro**
Vai in *Copie di sicurezza* e ripristina la copia di prima (capitolo 15). Se il
disastro non è ancora stato pubblicato, basta ricaricare la pagina del pannello
senza salvare: le modifiche non salvate spariscono e torna la bozza di prima.

---

## 18. Riassunto in cinque righe

1. `node server/server.js`, poi `http://localhost:4173/pannello/`.
2. Trova il campo (`Ctrl+K`) e cambia quello che ti serve.
3. Guarda l'**anteprima**: mostra anche quello che non hai salvato.
4. **Salva** (`Ctrl+S`) — il sito non cambia ancora.
5. **Pubblica** — adesso lo vedono tutti.
