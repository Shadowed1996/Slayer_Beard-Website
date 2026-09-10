# slayer_beard — sito ufficiale

![Stato](https://img.shields.io/badge/stato-in%20sviluppo-yellow)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2018-339933)
![Dipendenze](https://img.shields.io/badge/dipendenze-nessuna-informational)
![Licenza](https://img.shields.io/badge/licenza-proprietaria-lightgrey)

Sito del canale Twitch [slayer_beard](https://www.twitch.tv/slayer_beard), con dietro un piccolo
CMS per modificarne ogni testo, numero, link, immagine, colore e carattere senza aprire un editor
di codice.

Due cose da tenere a mente, perché spiegano tutto il resto:

1. **Il sito pubblicato è statico.** `index.html` è un file generato: chi visita il sito non
   scarica nessun JSON e non parla con nessun server. Va bene qualsiasi hosting.
2. **Il server serve solo a chi amministra.** Gira sul computer di casa, non in produzione.

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
| `node server/autotest.js` | collaudo: motore dei modelli, convalida, testo ricco, tema, generazione, API, modalità lurk, collegamento con Twitch, vetrina delle clip |

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
│  ├─ sito.js            navigazione, conto alla rovescia, settimana, copia email
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
├─ img/                  avatar, mascotte, banner, anteprima social, favicon
│
├─ contenuti/
│  ├─ contenuti.json     ← LA VERITÀ: testi e configurazione
│  ├─ schema.js          descrive i campi: il pannello si costruisce da qui
│  └─ media/             immagini caricate dal pannello
├─ modelli/
│  ├─ index.html         la struttura della pagina, con i {{segnaposto}}
│  ├─ parziali/          le sezioni, incluse con {{> parziali/nome}}
│  │  ├─ lurk.html       il pannello della modalità lurk, dentro «diretta»
│  │  └─ clip.html       la vetrina delle clip, in fondo a «diretta»
│  └─ icone/             le icone SVG, una per file
├─ server/               il CMS: generazione, API, sessioni, backup, media, tema
│  ├─ lib/controlli.js   i controlli d'insieme: avvertimenti, mai errori
│  ├─ lib/chiavi.js      LE CHIAVI: un file solo, e da lì le prende tutto
│  ├─ lib/twitch.js      l'unico punto in cui il server locale chiama Twitch
│  ├─ modelli/chiavi.esempio.js  il modello da copiare, con le istruzioni
│  └─ dati/              password del pannello e chiavi.js. Non si carica
│                        online e non sta nel controllo di versione.
├─ pannello/             l'interfaccia di amministrazione
├─ docs/PANNELLO.md      guida per chi amministra il sito
├─ docs/PRESENZA-TWITCH.md  studio su presenza, lurk e login Twitch: come Twitch conta
│                           davvero gli spettatori, e cosa consente il regolamento
├─ CONTRATTO.md          le regole con cui è stato costruito
├─ CONTRATTO-2.md        l'addendum della seconda fase: diretta, pollo, tema, testo ricco
├─ CONTRATTO-3.md        l'addendum della terza fase: la modalità lurk
└─ Cattura.PNG           cattura della pagina del canale su Twitch — banner, riquadro
                         fuori onda, handle social. Non è un'anteprima di questo sito.
```

Le sezioni della pagina, nell'ordine: **regia** (la copertina), **diretta** (il player, grande,
con la chat e il pollo accanto, e in fondo la vetrina delle clip), **settimana**, **chi sono**,
**supporto**, **saluti**. Il binario laterale ha quindi sei voci — e resta a sei: la vetrina delle
clip sta dentro «diretta» proprio per non chiederne una settima, che sotto i 400 px non ci
starebbe.

La versione precedente del sito è conservata in `Desktop/sito-backup/`: serve solo come
riferimento storico, non è collegata a niente.

---

## Modificare il sito

### Il modo normale: il pannello

Avvia il server, apri **http://localhost:4173/pannello/**, entra con la password, modifica.

Ci sono due bottoni distinti, e la differenza conta:

- **Salva** scrive in `contenuti/contenuti.json`. Il sito pubblicato **non cambia**. Puoi
  salvare venti volte e pensarci su.
- **Pubblica** rigenera `index.html`, `js/dati.js` e `css/tema.css`. Da quel momento il sito
  è cambiato.

L'anteprima nel pannello mostra anche le modifiche **non ancora salvate**: la pagina viene resa
al volo dal server e buttata via, senza toccare niente sul disco.

Prima di pubblicare, ogni pubblicazione mette una copia dei file in `server/backup/` (i tre file
generati più `contenuti.json`), e dal pannello si torna indietro con un clic. La guida completa
è in [`docs/PANNELLO.md`](docs/PANNELLO.md).

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

I tipi di campo sono: `testo`, `testolungo`, `ricco`, `url`, `email`, `numero`, `immagine`,
`orario`, `orari`, `scelta`, `colore`, `font`, `interruttore`, `elencoTesti`, `elenco`.

### Testo con grassetto, corsivo e link

I campi di tipo `ricco` accettano un po' di HTML: `b strong i em u s br small mark sup sub code`,
`abbr[title]`, `span[class]` con classe `evidenza`, `tenue` o `mono`, e `a[href,title]` verso
`http`, `https`, `mailto` o un percorso interno. **Tutto il resto viene tolto in generazione** da
`server/lib/testoricco.js`: il tag sparisce, il testo dentro resta, e i `<` avanzati diventano
`&lt;`. I link verso l'esterno ricevono `target="_blank" rel="noopener noreferrer"`.

Restano testo semplice, senza HTML, tutte le chiavi che finiscono dentro un attributo o dentro
`js/dati.js`: lì il markup non verrebbe interpretato, verrebbe stampato.

---

## I controlli d'insieme

`server/lib/controlli.js` guarda il documento **intero** e stampa avvertimenti —
mai errori, non blocca niente. Esiste perché la convalida guarda un campo per
volta, e nessun campo preso da solo è sbagliato quando l'indirizzo di ritorno del
login punta a `localhost` mentre il sito sta su `slayerbeard.it`: sono due valori
leciti che insieme fanno un login rotto per tutti i visitatori.

Li stampano `node server/genera.js` in fondo alla generazione e l'avvio del
server; il pannello li mostra subito dopo aver pubblicato, in un avviso che non
scade. Coprono esattamente la lista qui sotto — che finora esisteva solo in
prosa, in questo file, e la prosa non parla.

---

## Cose da fare quando il sito va online

1. **Domini di Twitch.** Nel pannello, gruppo «Canale, contatti e immagini», aggiungi il dominio
   di produzione con e senza `www` (per esempio `slayerbeard.it` e `www.slayerbeard.it`). Senza,
   il player non parte: `localhost` e `127.0.0.1` sono già inclusi da soli.
2. **Indirizzo pubblico del sito.** Nello stesso gruppo: riempie il `<link rel="canonical">` e
   l'`og:url`. Lasciato vuoto, la pagina usa `./` e funziona lo stesso, ma le anteprime social
   sono più fragili. I testi delle anteprime stanno nel gruppo «Scheda della pagina».
3. **«Ultima diretta», se vuoi che si aggiorni da sé.** È facoltativo e si fa una volta sola:
   `node server/imposta-twitch.js <clientId> <clientSecret>`, con le due chiavi di un'app
   registrata su [dev.twitch.tv](https://dev.twitch.tv/console/apps) — può essere la stessa del
   «Profilo del sito». Da quel momento ogni **Pubblica** chiede a Twitch il titolo dell'ultima
   diretta e lo scrive nei contenuti, così è fresco anche per chi visita il sito senza collegare
   nessun account. Senza, quel campo resta una casella da riempire a mano, e il sito funziona
   esattamente come prima. Il capitolo qui sotto spiega il resto.
4. **Pubblica**, poi **carica online** il contenuto della cartella: `index.html`, `css/`, `js/`,
   `img/`, e `contenuti/media/` se hai caricato immagini dal pannello.
   Attenzione: i file generati sono tre — `index.html`, `js/dati.js` e **`css/tema.css`**. Se
   carichi solo l'HTML, il sito online resta con i colori e i caratteri di `tokens.css` e non si
   capisce perché.
   Non serve caricare `server/`, `pannello/`, `modelli/`, né il resto di `contenuti/`: sono gli
   attrezzi, non il sito. Se il tuo hosting è pubblico, **è meglio non caricarli affatto**.

Netlify, Vercel, GitHub Pages o un FTP qualsiasi vanno tutti bene: è HTML statico.

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

**Serve il collegamento con Twitch** (`node server/imposta-twitch.js`, capitolo qui sopra): è lo
stesso app token che aggiorna «Ultima diretta». Senza, la vetrina resta spenta e nel pannello si
può accendere quanto si vuole senza che compaia niente — non ci sarebbe niente da mostrare.

Dal pannello, gruppo **«Le clip»**, si scelgono tre cose: se mostrarla, **quante** clip (da 1 a
12) e **di quale periodo** — ultima settimana, ultimo mese, ultimo anno, o da sempre. Twitch le
ordina per visualizzazioni, dalla più vista in giù. Periodo stretto significa vetrina che cambia
spesso ma che può restare vuota nelle settimane fiacche; «da sempre» significa vetrina sempre
piena e sempre uguale.

L'elenco vero sta in `config.clip.voci` ed è **l'unico ramo di `contenuti.json` che non ha un
campo nello schema**: lo riempie il server a ogni pubblicazione, e una casella nel pannello
sarebbe una casella riscritta sotto le dita di chi la compila. La copertura dello schema lo salta
apposta (`GENERATI` in `contenuti/schema.js`) e il collaudo verifica tutte e due le cose.

**Le anteprime.** Le serve Twitch da `clips-media-assets2.twitch.tv` (e da
`clips-media-assets.twitch.tv`, per le clip vecchie): sono i due host che si sono aggiunti a
`img-src` nella Content-Security-Policy, e come `static-cdn.jtvnw.net` sono host di sole
immagini. `server/lib/twitch.js` **scarta** le anteprime che arrivano da un host diverso invece
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

**Non si toccano più a mano.** Si cambiano dal pannello, gruppo «Aspetto»: dodici colori, tre
caratteri, l'arrotondamento degli angoli, la larghezza massima, l'unità di spaziatura e
l'intensità degli aloni dello sfondo. Alla pubblicazione quella configurazione diventa
`css/tema.css`, che viene caricato subito dopo `css/tokens.css` e ne riscrive i token.

- `css/tokens.css` è il **punto di partenza**: definisce tutti i token con i valori originali.
  Se `tema.css` manca, il sito è comunque completo e nessuno se ne accorge.
- `css/tema.css` è **generato**: ha in testa l'avvertenza «non si modifica a mano», e qualunque
  modifica fatta lì dentro sparisce alla generazione successiva.
- Nessun altro foglio di stile contiene un valore esadecimale.

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

Le immagini in `img/` sono copie locali degli asset del canale Twitch, scelta voluta: gli URL del
CDN di Twitch cambiano a ogni modifica del profilo. Se lo streamer cambia avatar o banner, vanno
riscaricate e sostituite tenendo gli stessi nomi. Attenzione a `mascot.png`: il fondo viola
**non è trasparente**, nel CSS è sfumato con `mask-image` e non va messo su fondi chiari.

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
rovescia, l'evidenziazione della sezione corrente e il pollo. I contenuti, gli orari e i link
sono già nell'HTML generato.

Browser: versioni correnti di Chrome, Edge, Firefox e Safari.

---

## Documentazione

Il progetto è documentato più di quanto sembri, e questo README è solo la porta
d'ingresso: qui sotto c'è cosa leggere e quando.

| Documento | A cosa serve |
|---|---|
| [`docs/PANNELLO.md`](docs/PANNELLO.md) | **La guida per chi aggiorna il sito.** Come si entra nel pannello, la differenza fra *Salva* e *Pubblica*, gruppo per gruppo cosa fa ogni campo, le immagini, i colori, i backup e il ripristino. Non serve saper programmare: è il documento da dare in mano a chi deve cambiare un orario. |
| [`docs/PRESENZA-TWITCH.md`](docs/PRESENZA-TWITCH.md) | **Lo studio da leggere prima di toccare la modalità lurk.** Come Twitch conta davvero gli spettatori, perché la chat non entra nel conteggio, cosa succede ai cookie di terze parti, e cosa il regolamento di Twitch consente e cosa no. Da qui discende ogni scelta di `js/lurk.js`, spegnimento automatico compreso. |
| [`CONTRATTO.md`](CONTRATTO.md) | Le regole con cui il sito è stato costruito: niente npm, niente framework, niente CDN, tutto in italiano. Vale ancora, tranne i tre punti superati dall'addendum. |
| [`CONTRATTO-2.md`](CONTRATTO-2.md) | L'addendum della seconda fase: la sezione «diretta», il pollo, il tema modificabile e il testo ricco. |
| [`CONTRATTO-3.md`](CONTRATTO-3.md) | L'addendum della terza fase: la modalità lurk e il collegamento con Twitch. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Come si lavora al codice: flusso di lavoro, convenzione dei commit, stile, checklist prima di una pull request. |
| [`SECURITY.md`](SECURITY.md) | Come segnalare una vulnerabilità, i punti sensibili noti e i casi fuori ambito. |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Il codice di condotta della comunità. |
| [`CHANGELOG.md`](CHANGELOG.md) | Il registro delle modifiche, versione per versione. |

`node server/autotest.js` passa per intero: **146 prove su 146**. Il collaudo non
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

Le immagini in `img/` e la cattura `Cattura.PNG` ritraggono materiale grafico
del canale slayer_beard e non sono coperte dalla licenza di questo progetto.

---

## Licenza

Progetto **proprietario, tutti i diritti riservati**. Copia, redistribuzione,
modifica e opere derivate non sono consentite senza permesso scritto del
titolare. Il testo completo è in [`LICENSE`](LICENSE).

Le componenti di terze parti elencate qui sopra restano soggette alle proprie
licenze.

---

## Autore

Filippo — [@Shadowed1996](https://github.com/Shadowed1996)

Per richieste di licenza, autorizzazioni o collaborazioni, e per tutto ciò che
non è un difetto o una proposta, il contatto è il profilo GitHub.
