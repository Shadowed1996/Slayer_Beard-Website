# Mettere il sito online su un hosting Plesk con Node

Questa è la guida per portare il sito slayer_beard da un computer di casa a un
hosting vero, e per tenerlo su. È scritta per chi amministra il sito, non per un
sistemista: dove serve una parola tecnica, la parola è spiegata.

Il pannello di controllo dell'hosting è **Plesk**, e si apre da
`https://plesk1.rhosting.network` (l'indirizzo numerico della macchina è
`185.242.180.191`). Attenzione a non confonderlo con l'indirizzo del sito: quello
è il *pannello dell'hosting*, il posto da cui si comandano le cose.

**L'indirizzo del sito è `https://slayerbeard.com`**, senza `www`. Anche
`www.slayerbeard.com` funziona, ma rimanda lì sopra: l'indirizzo buono, quello da
scrivere nei messaggi e da dare a Twitch, è uno solo ed è senza `www`.

> **Quanto ci vuole:** un'ora la prima volta, dieci minuti tutte le volte dopo.
> Non serve saper programmare, ma serve leggere tutto. I capitoli 3, 4 e 8 sono
> quelli che, se saltati, fanno sembrare rotto un sito che rotto non è; i
> capitoli **6** (la password del pannello) e **7** (nginx) sono quelli che, se
> saltati, lasciano il sito aperto a chi passa.

---

## Indice

1. [Com'è fatto il sito, in dieci righe](#1-comè-fatto-il-sito-in-dieci-righe)
2. [Prima di cominciare](#2-prima-di-cominciare)
3. [Cosa si carica, e dove](#3-cosa-si-carica-e-dove)
4. [I campi da compilare in Plesk](#4-i-campi-da-compilare-in-plesk)
5. [Le variabili d'ambiente, una per una](#5-le-variabili-dambiente-una-per-una)
6. [Il primo accesso al pannello](#6-il-primo-accesso-al-pannello)
7. [L'avviso su nginx (da leggere, non da saltare)](#7-lavviso-su-nginx-da-leggere-non-da-saltare)
8. [Il dominio: slayerbeard.com](#8-il-dominio-slayerbeardcom)
9. [Aggiornare il sito, dopo](#9-aggiornare-il-sito-dopo)
10. [Cosa non si carica mai](#10-cosa-non-si-carica-mai)
11. [Se qualcosa non va](#11-se-qualcosa-non-va)

---

## 1. Com'è fatto il sito, in dieci righe

Il sito che vede la gente è **statico**: è un file `index.html` più i fogli di
stile, il JavaScript e le immagini. Nessun visitatore parla con nessun
programma: apre una pagina già scritta, e basta.

Accanto al sito c'è un **piccolo programma Node**, che serve solo a chi
amministra. Fa due cose: tiene in piedi il pannello di modifica su `/pannello/`,
e ogni tanto chiede a Twitch il titolo dell'ultima diretta, le clip e i numeri
del canale, riscrivendo la pagina quando cambiano.

Sull'hosting le due cose convivono così:

- i file che **esistono sul disco** (`index.html`, `css/`, `js/`, `img/`,
  `pannello/`, le immagini e i font) li consegna il **server web**, che è veloce
  e non disturba Node;
- tutto il resto — `/api/...` e qualunque indirizzo dietro al quale non c'è un
  file — arriva a **Node**.

Il programma che fa da porta d'ingresso a Node si chiama **Passenger**, ed è
quello che l'estensione Node di Plesk usa dietro le quinte. A noi interessa una
cosa sola: Passenger vuole sapere **quale file avviare**, e quel file è `app.js`,
nella cartella principale del sito.

---

## 2. Prima di cominciare

Serve avere sottomano:

- **l'accesso a Plesk** (nome utente e password del pannello di controllo);
- **l'archivio del sito**, cioè il `.rar` preparato per il caricamento, oppure
  la cartella del progetto;
- **una password nuova per il pannello di modifica**, di almeno 8 caratteri.
  Sceglila adesso e scrivila in un posto sicuro: non si recupera, si può solo
  cambiare;
- facoltativo, ma consigliato: le **due chiavi dell'applicazione Twitch**
  (Client ID e Client Secret), quelle che si prendono da
  `dev.twitch.tv/console/apps`. Servono a far aggiornare da sé «Ultima diretta»,
  la vetrina delle clip e i numeri del canale. Senza, il sito funziona lo stesso
  e quei campi restano da riempire a mano.

Sull'hosting deve essere attiva l'estensione **Node.js** di Plesk, con una
versione di Node **18.17 o superiore**. Si controlla in Plesk, alla voce
*Node.js* del dominio: se non c'è, la si attiva dal negozio delle estensioni o la
si chiede a chi gestisce il server.

Il sito **non ha nessuna dipendenza da installare**: niente `npm install`,
nessun pacchetto da scaricare. Sta in piedi con la sola libreria di Node. È una
scelta del progetto, e semplifica molto questa pagina.

---

## 3. Cosa si carica, e dove

In Plesk il dominio ha una cartella, che di solito si chiama `httpdocs`. **Tutto
il contenuto dell'archivio va lì dentro, al primo livello**: deve risultare che
`httpdocs/index.html` e `httpdocs/app.js` esistano. Se dopo aver scompattato
trovi `httpdocs/slayer-beard/index.html`, sposta su di un livello: è l'errore
più comune e fa vedere una pagina vuota.

Il modo più semplice: Plesk → **File Manager** → entra in `httpdocs` → **Upload**
l'archivio → menu del file → **Extract Files**. In alternativa va benissimo un
programma FTP.

Alla fine, dentro `httpdocs`, ci devono essere:

| Cosa | Che roba è |
|---|---|
| `index.html` | la pagina del sito, già generata |
| `css/` `js/` `img/` | stili, script e immagini fisse |
| `contenuti/` | i testi e la configurazione, più `media/` (la libreria delle immagini) e `font/` |
| `modelli/` | la struttura da cui nasce `index.html` |
| `pannello/` | il pannello di modifica |
| `server/` | il programma: generazione, API, sessioni |
| `app.js` | il file che Passenger avvia |
| `package.json` | il nome, la versione e i comandi del progetto |
| `.htaccess` | le regole del server web (capitolo 7) |
| `robots.txt` | cosa possono guardare i motori di ricerca |
| `.env.esempio` | il modello delle impostazioni, da leggere e non da modificare |
| `docs/HOSTING.md` `docs/PANNELLO.md` | questa guida e la guida del pannello |

**I file che cominciano con un punto** (`.htaccess`, `.env.esempio`) su molti
programmi sono nascosti: nel File Manager di Plesk si vedono spuntando
*Show Hidden Files* nelle impostazioni in alto a destra. Se dopo il caricamento
`.htaccess` non c'è, il sito funziona lo stesso ma **senza le protezioni**: è
proprio il file che non deve mancare.

Il capitolo 10 dice cosa invece **non** deve finire lì dentro, ed è altrettanto
importante.

---

## 4. I campi da compilare in Plesk

Plesk → il dominio → **Node.js**. Si aprono pochi campi, e sono questi.

| Campo | Cosa scriverci | Perché |
|---|---|---|
| **Node.js Version** | la più recente disponibile, comunque non sotto la 18.17 | sotto quella versione mancano cose che il programma usa |
| **Document Root** | `/httpdocs` | è la cartella che il server web mostra al mondo |
| **Application Mode** | `production` | niente messaggi di sviluppo verso l'esterno |
| **Application Root** | `/httpdocs` | **la stessa cartella della Document Root**: è il modello scelto per questo progetto |
| **Application Startup File** | `app.js` | il file che Passenger avvia. Non `server/server.js`: quello è l'avvio locale |
| **Custom environment variables** | vedi capitolo 5 | le impostazioni del sito |

Poi, in fondo alla pagina, c'è un bottone **NPM Install**: **non serve** e si può
saltare, perché il progetto non ha dipendenze. Se lo premi non succede niente di
male, ma non fa niente di utile.

Quando i campi sono a posto si preme **Enable Node.js** (o **Restart App**, se
era già acceso). Se tutto è andato bene, la pagina di Plesk dice che
l'applicazione è in esecuzione.

> **Application Root uguale a Document Root non è una svista.** Di solito si
> tengono separate, per non esporre il codice. Qui sono la stessa cartella
> apposta, perché il pannello di modifica lavora *sui file del sito*: deve
> riscrivere `index.html`, `css/tema.css` e `js/dati.js` dove il server web li
> legge. Il prezzo di questa scelta è che nella cartella pubblica ci sono anche
> gli attrezzi — ed è il motivo per cui esistono `.htaccess`, il capitolo 7 e la
> variabile `SB_DATI`.

### Il comando di avvio

Passenger avvia `app.js` da sé: non c'è un comando da scrivere. Se da qualche
parte ti viene chiesto un comando di avvio, quello giusto è:

```
npm start
```

che è scritto dentro `package.json` e vuol dire `node app.js`.

### Provare prima, sul computer di casa

Se vuoi vedere come si comporterà l'applicazione **prima** di caricarla, nella
cartella del progetto puoi avviarla esattamente come la avvia Plesk:

```
PORT=4288 SB_HOST=127.0.0.1 node app.js
```

Deve stampare **una riga sola**, con l'indirizzo di ascolto e la cartella che sta
servendo, e il sito deve rispondere su `http://localhost:4288/`. Se invece stampa
un errore, quello è lo stesso errore che finirebbe nel log dell'hosting — meglio
leggerlo qui.

---

## 5. Le variabili d'ambiente, una per una

Sono le impostazioni del sito. Si scrivono in Plesk → il dominio → **Node.js** →
**Custom environment variables**, una riga per variabile: a sinistra il nome, a
destra il valore. Dopo averle cambiate **bisogna premere Restart App**,
altrimenti il programma continua con quelle vecchie.

Nella cartella del sito c'è anche `.env.esempio`: è questo stesso elenco in forma
di file, da leggere come promemoria. **Non va rinominato in `.env`**, e non va
compilato: su Plesk le variabili si mettono nel pannello, non in un file. Se una
variabile compare lì ma non qui, vince quello che dice questo capitolo.

### Le tre che contano davvero

#### `SB_DATI` — dove stanno i segreti

```
SB_DATI = ../dati-slayer
```

È **la variabile più importante di tutta questa pagina.** Dice al programma di
tenere fuori dalla cartella pubblica i tre file che non devono essere scaricabili
da nessuno:

- `auth.json` — l'impronta della password del pannello;
- `chiavi.js` — il Client Secret dell'applicazione Twitch;
- `twitch-accesso.json` — l'autorizzazione che il canale dà al server.

Senza questa variabile quei file stanno in `httpdocs/server/dati/`, cioè
**dentro** la cartella che il server web mostra al mondo, e restano al sicuro
solo finché `.htaccess` (o la configurazione di nginx del capitolo 7) fa il suo
mestiere. Con questa variabile stanno altrove, e non c'è configurazione sbagliata
che possa esporli: è una porta chiusa a chiave, non una porta con il cartello.

**Come si sceglie il percorso.** Deve essere una cartella **fuori** da
`httpdocs`, ma dentro lo spazio dell'account. In Plesk la struttura è questa:

```
la tua area
├── httpdocs/        ← il sito: tutto quello che c'è qui dentro è pubblico
├── dati-slayer/     ← QUI: i segreti, fuori dal sito
└── backup-slayer/   ← e qui i backup (vedi SB_BACKUP)
```

**`..` è il modo più semplice di scriverlo, e funziona.** Passenger avvia
l'applicazione dentro `httpdocs`, quindi `../dati-slayer` vuol dire «un livello
sopra `httpdocs`», cioè la tua area: esattamente la cartella `dati-slayer` del
disegno qui sopra. Non serve sapere il percorso assoluto della macchina, e non
serve cambiare niente se un giorno l'hosting cambia.

Se preferisci scriverlo per esteso, il percorso assoluto della tua area lo dice
Plesk: File Manager → la voce in alto, oppure *Web Hosting Access* → *Home
directory*. Su Plesk ha di solito la forma `/var/www/vhosts/<dominio>/`, e allora
il valore diventa `/var/www/vhosts/<dominio>/dati-slayer`. Le due scritture sono
equivalenti: la relativa è solo più difficile da sbagliare.

La cartella non devi crearla a mano: se non c'è, il programma la crea al primo
avvio. Se invece è indicata e non può essere creata (per esempio perché il
percorso è sbagliato), il programma **lo dice nel log e si ferma**, invece di
ripiegare in silenzio su una cartella dentro il sito: è voluto, perché un ripiego
silenzioso ti farebbe credere di essere protetto quando non lo sei.

**Come vedi in dieci secondi che ha funzionato.** Dopo il primo accesso al
pannello (capitolo 6), apri il File Manager di Plesk: accanto a `httpdocs` deve
essere comparsa la cartella `dati-slayer` con dentro `auth.json`, e dentro
`httpdocs/server/` **non** deve esserci nessuna cartella `dati`. Se è il
contrario, la variabile non è stata letta: controlla di averla scritta nella
pagina Node.js del dominio giusto e di aver premuto *Restart App*.

#### `SB_BACKUP` — dove stanno le copie di sicurezza

```
SB_BACKUP = ../backup-slayer
```

Ogni volta che premi **Pubblica**, prima di riscrivere il sito il programma ne
mette da parte una copia (i tre file generati più i contenuti), e dal pannello si
torna indietro con un clic. Quelle copie contengono il sito per intero: meglio
fuori dalla cartella pubblica anche loro. Vale la stessa regola di `SB_DATI` —
cartella creata al primo uso, errore chiaro se non si può.

#### `SB_PRIMO_ACCESSO` — l'interruttore della prima password

```
SB_PRIMO_ACCESSO = 1
```

Si accende per pochi minuti, il tempo di creare la password del pannello, e poi
**si spegne**. Finché la password non esiste, questa variabile è l'unica cosa che
permette di sceglierla dall'esterno: senza, il pannello chiuso a chiave resta
chiuso a chiave anche per chi arriva per primo.

Da un indirizzo **locale** (il computer su cui gira il programma) la creazione
resta libera e la variabile non serve: è il caso di chi lavora in casa. Serve
solo da internet, che è il caso dell'hosting.

**Il giro completo, con le schermate, sta nel capitolo 6**, ed è la prima cosa da
fare dopo aver acceso l'applicazione.

#### `SB_SITO` — forzare l'indirizzo pubblico del sito

```
SB_SITO = https://slayerbeard.com
```

L'indirizzo pubblico del sito serve a **tre** cose, ed è bene sapere quali:

1. **il link canonico e le anteprime social** — la riga che dice a Google qual è
   l'indirizzo buono, e quella che riempie l'anteprima quando il link viene
   condiviso su WhatsApp, Discord o i social;
2. **i domini autorizzati per il player di Twitch** — e li aggiunge **tutti e
   due**, `slayerbeard.com` *e* `www.slayerbeard.com`: per Twitch sono due
   «genitori» diversi, e senza il player resta un rettangolo nero;
3. **`sitemap.xml` e la riga `Sitemap:` in `robots.txt`** — la mappa del sito per
   i motori di ricerca, scritta alla pubblicazione.

**Di solito questa variabile non serve.** L'indirizzo sta già nei contenuti del
sito, alla voce *Indirizzo pubblico del sito* del pannello (menu ☰ → *Canale,
contatti e immagini*), ed è lì che si cambia: **il pannello vince su
`SB_SITO`**.

`SB_SITO` serve quando si vuole **forzare** un indirizzo diverso dall'esterno,
senza toccare i contenuti. Il caso tipico è una copia di prova del sito su un
altro indirizzo: gli stessi contenuti, ma canonico, anteprime e player che
parlano dell'indirizzo di prova invece che di quello vero.

Se la usi, scrivila **esattamente così**: con `https://` davanti, **senza `www`**
e **senza barra finale**. E ricordati che, in tutti e due i casi, l'indirizzo
entra nella pagina solo con una **Pubblica**: né la variabile né il campo del
pannello riscrivono niente da soli.

### Le altre

#### `SB_DIETRO_PROXY`

```
SB_DIETRO_PROXY = 1
```

**Su Plesk va messa a 1.** Dice al programma che davanti a lui c'è un altro
server (su Plesk è nginx), e che quindi l'indirizzo di chi bussa non è quello
della connessione ma quello scritto nell'ultima riga che il proxy aggiunge.

Se **manca** su Plesk succedono due cose, tutte e due brutte:

- il freno sui tentativi di password conta **tutti i visitatori come un
  indirizzo solo** (quello di nginx): basta che qualcuno provi cinque password
  sbagliate perché il pannello si chiuda in faccia anche a te;
- il cookie della sessione **non viene mai marcato `Secure`**, perché il
  programma crede di stare su `http`.

**Se la metti a 1 dove un proxy non c'è**, invece, chi bussa può scriversi da sé
l'indirizzo che vuole e il freno smette di frenare. Quindi: `1` su Plesk, niente
sul computer di casa.

> **Se il pannello risponde «Richiesta rifiutata: arriva da un altro sito» a ogni
> salvataggio**, il problema è vicino: è il proxy che riscrive l'intestazione
> `Host` con qualcosa di diverso dal dominio del sito. Si guarda in Plesk →
> **Apache & nginx Settings**, nelle direttive nginx aggiuntive, che l'`Host`
> passato ad Apache sia il dominio vero.

#### `TZ`

```
TZ = Europe/Rome
```

Il fuso orario. La schedule della settimana ragiona in ore italiane: su una
macchina impostata su un altro fuso i giorni di diretta comparirebbero
sfasati. `app.js` la imposta da sé su `Europe/Rome` se non la trova, quindi
scriverla è facoltativo — ma scriverla la rende visibile a chi guarda le
impostazioni, e non costa niente.

#### `SB_AGGIORNA_MIN`

```
SB_AGGIORNA_MIN = 10
```

Ogni quanti minuti chiedere a Twitch il titolo dell'ultima diretta, le clip e i
numeri del canale. Dieci è il valore di serie e va bene: si scrive solo se lo si
vuole diverso. **`0` spegne l'aggiornamento automatico**, e allora quei dati si
aggiornano soltanto quando premi Pubblica.

#### `PORT`

**Non si scrive.** La mette Passenger, e il programma la legge da lì. Se ne
scrivi una tua rischi solo di litigare con l'hosting. (Esiste anche `SB_PORTA`,
ma è per l'uso sul computer di casa: sull'hosting non serve.)

#### `NODE_ENV`

La imposta Plesk quando scegli *Application Mode: production*. Non c'è niente da
fare a mano.

### L'elenco completo, da copiare

Queste quattro si mettono e non si toccano più:

| Nome | Valore |
|---|---|
| `SB_DATI` | `../dati-slayer` |
| `SB_BACKUP` | `../backup-slayer` |
| `SB_DIETRO_PROXY` | `1` |
| `TZ` | `Europe/Rome` |

Si copiano così come sono scritte, niente da sostituire: i due `..` valgono «un
livello sopra `httpdocs`», cioè la tua area. Niente virgolette e niente barra
finale.

E poi ce n'è una che si accende e si spegne subito:

| Nome | Valore | Quando |
|---|---|---|
| `SB_PRIMO_ACCESSO` | `1` | solo il tempo di creare la password del pannello (capitolo 6), poi **si toglie** |

`SB_SITO` **non è nell'elenco apposta**: l'indirizzo del sito
(`https://slayerbeard.com`) sta già nei contenuti e si cambia dal pannello. La
variabile serve solo a forzarne un altro, per esempio su una copia di prova.

Dopo ogni modifica: **Restart App**.

---

## 6. Il primo accesso al pannello

Il pannello di modifica sta su **`https://slayerbeard.com/pannello/`**: è
l'indirizzo del sito con `/pannello/` in fondo.

**La password si crea come primissima cosa, appena l'applicazione è accesa.** È
il passo che chiude il sito a chi non deve entrarci, e finché non è fatto il sito
è aperto.

Il motivo, detto chiaro: finché la password non esiste, il pannello mostra la
schermata «scegline una» a chiunque la apra. Su un computer di casa non è un
problema — ci arrivi solo tu. Su internet sarebbe un invito: il primo estraneo
che passa da `https://slayerbeard.com/pannello/` si fa la password e si prende il
sito. Per questo dall'hosting quella schermata **non compare** se non la si
autorizza a mano.

### Come si fa, in tre mosse

1. **Accendi l'interruttore.** Plesk → il dominio → **Node.js** → *Custom
   environment variables*: aggiungi

   ```
   SB_PRIMO_ACCESSO = 1
   ```

   e premi **Restart App**.

2. **Crea la password.** Apri `https://slayerbeard.com/pannello/`: adesso compare
   la schermata per sceglierla. Scrivila due volte (almeno 8 caratteri) e premi
   **Crea la password ed entra**. Scrivila anche da qualche altra parte al
   sicuro: non si recupera, si può solo cambiare.

3. **Spegni l'interruttore.** Torna in Plesk, **togli** `SB_PRIMO_ACCESSO` (o
   mettila a `0`) e premi di nuovo **Restart App**.

Il terzo passo non è una formalità: lasciata accesa, quella variabile rimette il
sito nella condizione di prima il giorno in cui, per qualsiasi motivo, il file
della password non si trovasse più. Sono dieci secondi, si fanno subito.

> **Con l'accesso SSH si fa anche senza variabile.** Plesk → **SSH Terminal**,
> nella cartella del sito:
> ```
> node server/imposta-password.js <la-password>
> ```
> La password viene creata direttamente e `SB_PRIMO_ACCESSO` non serve mai. È la
> strada preferibile se hai SSH.

**Tutte le altre volte** il pannello ti chiede solo la password.

### Se un giorno il pannello ti chiede di crearne una nuova

Se apri il pannello, la password l'avevi già fatta, e ti compare la schermata
«scegli una password»: **fermati e chiedi aiuto.** Non crearne una nuova.

Vuol dire che il file della password (`auth.json`) non è dove il programma lo
cerca, e quasi sempre la causa è una di queste due: `SB_DATI` è stata cambiata e
punta a un'altra cartella, oppure la cartella che indica non è scrivibile e il
file non è mai stato salvato. Creare una password nuova non sistema niente e
nasconde il problema: si guarda prima `SB_DATI` e il `error_log` del dominio.

**Se invece la password l'hai persa davvero** non si recupera. Si rimedia da
Plesk → **SSH Terminal**, nella cartella del sito:

```
node server/imposta-password.js
```

Se l'accesso SSH non c'è, si cancella il file `auth.json` dalla cartella indicata
da `SB_DATI` e si rifanno le tre mosse qui sopra, `SB_PRIMO_ACCESSO` compresa.

Il resto — come si modificano testi, immagini, colori e schedule — sta in
[`PANNELLO.md`](PANNELLO.md), che è la guida vera del pannello.

### Le due cose che restano diverse rispetto al computer di casa

- **Le sessioni stanno in memoria.** Se l'applicazione viene riavviata (un
  **Restart App**, un aggiornamento, un riavvio della macchina) chi era dentro al
  pannello deve rifare l'accesso. Non è un guasto: è una scelta, perché un
  archivio delle sessioni su disco sarebbe un'altra cosa da proteggere. Le
  modifiche salvate non si perdono, solo l'accesso.
- **`--guarda` non c'è.** Sull'hosting il sito si rigenera quando premi
  **Pubblica**, o quando l'aggiornamento automatico trova qualcosa di nuovo su
  Twitch. Non c'è nessuna sorveglianza dei file, e non serve.

---

## 7. L'avviso su nginx (da leggere, non da saltare)

**Questo è il capitolo che protegge i segreti del sito. Se salti tutto il resto,
leggi questo.**

Su Plesk davanti ad Apache c'è **nginx**, e di serie è nginx a consegnare
direttamente i file statici, per velocità. Il punto è questo: **nginx non legge
`.htaccess`**. Tutte le negazioni scritte lì dentro, per i file che nginx serve
da sé, semplicemente non esistono.

Il rischio, in concreto: senza far niente, chiunque scriva nel browser
`https://slayerbeard.com/server/dati/chiavi.js` si scarica il Client Secret di
Twitch, e con `https://slayerbeard.com/server/dati/auth.json` l'impronta della
password del pannello.

Ci sono due modi di chiudere la porta. **Fanne almeno uno.** Farli tutti e due
non fa male a nessuno.

### Modo A — dire a nginx le stesse cose (consigliato)

Plesk → il dominio → **Apache & nginx Settings** → riquadro **Additional nginx
directives**. Incolla dentro questo blocco, poi **OK** (Plesk controlla la
sintassi da sé e si rifiuta di salvare se c'è un errore di battitura):

```nginx
# --- slayer_beard: quello che non deve uscire dal sito ---------------
# Stesse negazioni di .htaccess, perche nginx .htaccess non lo legge.

# Il server: dentro c'e la password del pannello e il secret di Twitch.
location ~ ^/(server|modelli|docs)/ {
    return 403;
}

# Di contenuti/ escono solo le immagini della libreria e i file dei font:
# contenuti.json, schema.js ed elenco.json restano dentro.
location ~ ^/contenuti/(?!media/|font/[^/]+\.(woff2|woff|ttf|otf)$) {
    return 403;
}

# Il file d'avvio e i file di progetto di Node.
location ~ ^/(app\.js|package(-lock)?\.json)$ {
    return 403;
}

# I documenti: guide, changelog, contratti.
location ~ \.md$ {
    return 403;
}

# Tutti i file che cominciano con un punto (.env, .git, .htaccess...),
# tranne .well-known/, che serve al rinnovo del certificato.
location ~ /\.(?!well-known/) {
    return 403;
}
```

### Modo B — far consegnare tutto ad Apache

Nella stessa pagina **Apache & nginx Settings** c'è la casella **Serve static
files directly by nginx** (in qualche versione: *Smart static files processing*).
**Togliendo la spunta**, nginx smette di consegnare i file da sé e passa ogni
richiesta ad Apache — che `.htaccess` lo legge, e quindi le regole tornano a
valere tutte.

È la strada più semplice e non richiede di incollare niente. Costa un po' di
velocità sulle immagini, che su un sito di questa taglia non si nota.

### Come si controlla che abbia funzionato

Apri il browser e prova questi tre indirizzi, copiandoli così come sono:

| Indirizzo | Cosa deve rispondere |
|---|---|
| `https://slayerbeard.com/server/dati/auth.json` | **403** (o 404) — mai il contenuto del file |
| `https://slayerbeard.com/contenuti/contenuti.json` | **403** (o 404) |
| `https://slayerbeard.com/contenuti/media/citta-notturna.webp` | **l'immagine**, che deve continuare a vedersi |

Se il primo o il secondo ti fanno scaricare un file, non è stato fatto né il modo
A né il modo B: torna indietro e rifai il capitolo. Se il terzo dà 403, una
regola è stata copiata storta: il sito perderebbe le immagini della schedule.

> **E questo è il motivo per cui `SB_DATI` esiste** (capitolo 5). Con i segreti
> fuori da `httpdocs`, anche se questo capitolo viene sbagliato non c'è niente da
> scaricare: la protezione smette di dipendere da una casella spuntata nel posto
> giusto. Metti `SB_DATI`.

---

## 8. Il dominio: slayerbeard.com

Il dominio del sito è **`slayerbeard.com`**, e l'indirizzo buono è
**`https://slayerbeard.com`**, senza `www`. `www.slayerbeard.com` funziona lo
stesso, ma rimanda lì sopra.

Questi otto passi si fanno **una volta sola**, in quest'ordine, e senza saltarne
nessuno: sono quelli che accendono il player di Twitch e le anteprime dei link,
che altrimenti restano spenti.

**1. Il certificato HTTPS — prima di tutto il resto.** Plesk → il dominio →
**SSL/TLS Certificates** → *Get it free* (Let's Encrypt). **Spunta tutti e due
gli indirizzi**, `slayerbeard.com` **e** `www.slayerbeard.com`: se il certificato
non copre anche quello con `www`, chi arriva con `www` vede un avviso di sicurezza
del browser prima ancora di essere rimandato sull'indirizzo buono.

Questo è il punto 1 e non un punto qualsiasi: `.htaccess` manda tutti da `http` a
`https`, e senza certificato li manderebbe su una pagina di errore. Una volta
preso, il rinnovo è automatico — a patto che `.well-known/` resti raggiungibile,
ed è già previsto dalle regole.

**2. L'indirizzo pubblico è già nei contenuti.** Il campo *Indirizzo pubblico del
sito* (pannello → menu ☰ → *Canale, contatti e immagini*) dice già
`https://slayerbeard.com`. **Controlla che sia così** e vai avanti: non serve
nessuna variabile d'ambiente. Solo se volessi forzare un indirizzo diverso —
tipicamente una copia di prova — si usa `SB_SITO` (capitolo 5).

**3. Pubblica.** Entra nel pannello (`https://slayerbeard.com/pannello/`) e premi
**Pubblica**. È il passo che porta davvero il dominio dentro la pagina:
l'indirizzo da solo non riscrive niente, serve una pubblicazione. Da quel momento
ci sono il link canonico, le anteprime social, **tutti e due** i domini fra
quelli autorizzati per il player (`slayerbeard.com` e `www.slayerbeard.com`, che
per Twitch sono due cose diverse), `sitemap.xml` e la riga `Sitemap:` dentro
`robots.txt`.

**4. Il login con Twitch: registra l'indirizzo di ritorno.** È il passo che
sembra più tecnico e in realtà è due clic, e se manca chi preme «Collegati con
Twitch» riceve un errore di Twitch (`redirect_mismatch`) senza capire perché.

Nei contenuti l'*Indirizzo di ritorno del login* dice già
`https://slayerbeard.com/`. Lo stesso indirizzo va registrato **anche dall'altra
parte**, da Twitch:

1. apri `https://dev.twitch.tv/console/apps` ed entra nell'applicazione del sito;
2. alla voce **OAuth Redirect URLs** aggiungi:

   ```
   https://slayerbeard.com/
   ```

3. tieni nell'elenco anche `http://localhost:4173/`: Twitch ne accetta più di
   uno, e senza quello non si può più provare il login sul computer di casa;
4. salva.

**Twitch confronta la stringa esatta**, carattere per carattere: la barra finale
ci va, e `http` non vale al posto di `https`. Un indirizzo scritto quasi giusto
è un indirizzo sbagliato.

**5. Il rimando da `www`: è già fatto.** Nel file `.htaccess`, sezione 2, la
regola è **attiva**: `www.slayerbeard.com` → `https://slayerbeard.com`, con un 301
(«trasloco definitivo»). Non c'è niente da scommentare. Se un giorno si volesse il
contrario — indirizzo buono *con* `www` — nel commento sopra la regola c'è scritta
la riga da cambiare, ed è una riga sola; ma allora vanno cambiati anche
l'*Indirizzo pubblico del sito* nel pannello e l'indirizzo di ritorno del punto 4,
da tutte e due le parti.

`slayerbeard.com` compare in `.htaccess` in due punti soli, tutti e due nella
prima metà del file: la regola della sezione 2 e la riga della sezione 1 che le
lascia il passo. Nel resto del file non c'è nessun dominio.

**6. HSTS: non c'è niente da fare.** La riga c'è già in `.htaccess` e si accende
da sé quando le richieste arrivano in HTTPS. Due cose da sapere:

- è l'unica istruzione del file che **non si annulla togliendola**: il browser di
  chi è già passato si ricorda per un anno che questo sito parla solo `https`. Va
  bene così, ed è esattamente il motivo per cui il certificato è il punto 1;
- restano fuori apposta `includeSubDomains` e `preload`. Il primo estenderebbe
  l'obbligo dell'`https` a *tutti* i sottodomini di `slayerbeard.com`, compresi
  quelli che non esistono ancora: si aggiunge quando si è sicuri che nessun
  sottodominio giri in `http`. Il secondo fa entrare il dominio in un elenco che
  i browser si portano dentro, e uscirne si chiede a mano e ci vogliono mesi.
  Il commento sopra la regola, in `.htaccess`, dice come si scrivono e quando.

**7. Le chiavi di Twitch: si rifanno sull'hosting.** Il file
`server/dati/chiavi.js` — dove stanno il Client ID e il Client Secret
dell'applicazione Twitch — **non viaggia nel pacchetto**, perché è un segreto e i
segreti non si copiano da una macchina all'altra. Sull'hosting va rifatto, in uno
dei due modi:

- da Plesk → **SSH Terminal**, nella cartella del sito:

  ```
  node server/imposta-twitch.js <clientId> <clientSecret>
  ```

- oppure a mano: si copia `server/modelli/chiavi.esempio.js` nella cartella dei
  dati (quella di `SB_DATI`) col nome `chiavi.js` e si riempiono le due stringhe.
  È un normale file di testo, con le istruzioni dentro.

Senza, il sito funziona, ma **«Ultima diretta», la vetrina delle clip e i numeri
del canale restano quelli scritti a mano** e non si aggiornano più da soli.

Poi c'è un passo in più per **follower e abbonati**, che Twitch dà solo al
proprietario del canale. Due modi, a seconda che tu abbia l'SSH o no:

**Con l'SSH:**

```
node server/imposta-twitch.js --collega
```

Il comando stampa un codice e chiede di aprire `https://www.twitch.tv/activate`
**con l'account del canale**, inserire il codice e accettare. Va fatto una volta
sola: da lì in poi il server si rinnova da sé. Con `--prova` si controlla che
funzioni tutto.

**Senza l'SSH:** lo stesso collegamento si fa dal pannello. Vai in
`https://slayerbeard.com/pannello/` → menu ☰ → **Canale, contatti e immagini**,
e in fondo trovi **«Collegati per i numeri»**. Premi il bottone, apri l'indirizzo
di Twitch che compare **con l'account del canale**, inserisci il codice e
accetta: la pagina del pannello aspetta la conferma da sola e mostra «Collegato
come...» appena Twitch risponde. Da quel momento il server si rinnova da sé,
esattamente come con l'SSH — è la stessa autorizzazione, solo chiesta dal
browser invece che dal terminale. Il bottone diventa «Scollega» se un giorno
vuoi togliere l'autorizzazione.

In entrambi i casi **è l'unico passo di tutta questa guida che richiede il
browser di chi amministra**, e le due chiavi del punto precedente (Client ID e
Client Secret) devono già essere a posto: senza, il bottone risponde con
l'errore che lo dice.

**8. Le prove finali.** Rifai le tre prove del capitolo 7 sugli indirizzi veri, e
aggiungi queste sei. Dieci minuti in tutto, e sono il collaudo del lavoro:

| Scrivi nel browser | Deve succedere |
|---|---|
| `http://slayerbeard.com` | finisce su `https://slayerbeard.com` |
| `http://www.slayerbeard.com` | finisce su `https://slayerbeard.com`, con un **301** e un salto solo |
| `https://www.slayerbeard.com/` | finisce su `https://slayerbeard.com/` |
| `https://slayerbeard.com/pannello/` | **chiede la password** (non la fa creare: se la fa creare, capitolo 6) |
| `https://slayerbeard.com/robots.txt` | si legge, e in fondo c'è `Sitemap: https://slayerbeard.com/sitemap.xml` |
| `https://slayerbeard.com/sitemap.xml` | si legge, e dentro c'è `https://slayerbeard.com/` |

E due prove sul sito, guardandolo:

- **il player di Twitch deve partire.** Se è un rettangolo nero, manca il punto 3;
- **«Collegati con Twitch» deve funzionare**: si preme, si accetta su Twitch, si
  torna su `https://slayerbeard.com/` e la tessera mostra il nome dell'utente. Se
  invece Twitch risponde con un errore tipo `redirect_mismatch`, manca il punto 4.

---

## 9. Aggiornare il sito, dopo

### I testi, le immagini, i colori, la schedule

**Non si ricarica niente.** Si entra nel pannello su
`https://slayerbeard.com/pannello/`, si modifica, si preme **Salva** e poi
**Pubblica**. Il sito
cambia da solo: il programma riscrive `index.html`, `js/dati.js` e
`css/tema.css` direttamente sull'hosting.

Ricorda la differenza, che è tutta la logica del pannello:

- **Salva** mette via il lavoro. Il sito online **non cambia**. Puoi salvare
  venti volte e pensarci su.
- **Pubblica** riscrive il sito. Da quel momento la gente vede le modifiche.

Prima di ogni pubblicazione il programma mette da parte una copia, e dal pannello
(menu ☰ → *Copie di sicurezza*) si torna indietro con un clic.

### Una versione nuova del programma

Quando arriva una versione nuova del progetto — codice, non contenuti — si fa
così:

1. Nel pannello, **Pubblica** (per essere sicuri che i contenuti sull'hosting
   siano quelli buoni), poi menu ☰ → *Copie di sicurezza* → scarica una copia.
2. Carica i file nuovi in `httpdocs`, sovrascrivendo. **Non toccare**
   `contenuti/contenuti.json` e `contenuti/media/`: sono i tuoi testi e le tue
   immagini, e la versione nuova non li porta.
3. Plesk → **Node.js** → **Restart App**.
4. Entra nel pannello e premi **Pubblica**: rigenera la pagina con il codice
   nuovo.
5. Guarda il sito.

Se qualcosa non torna, dalla stessa pagina di Plesk c'è il **log** (voce *Logs*
del dominio, file `error_log`): il programma scrive lì quello che non gli piace,
in italiano.

### Controllare che l'installazione stia in piedi

Nell'archivio c'è il collaudo del progetto. Da Plesk → **SSH Terminal**, nella
cartella del sito:

```
npm run prova
```

(che è la stessa cosa di `node server/autotest.js`). Deve finire con
**«TUTTO A POSTO»**. Lavora in una cartella temporanea e non
tocca i file del sito: si può lanciare quando si vuole, anche a sito acceso.

---

## 10. Cosa non si carica mai

Tre cose, e sono tre cose serie.

**1. `server/dati/`** — la cartella con `auth.json` (l'impronta della password
del pannello), `chiavi.js` (il Client Secret di Twitch) e `twitch-accesso.json`
(l'autorizzazione del canale). Non si carica da un computer all'altro, non si
copia dentro un archivio, non si manda per posta. Quei file **si ricreano
sull'hosting**: la password come dice il capitolo 6, le chiavi e
l'autorizzazione del canale come dice il capitolo 8, punto 7. E vanno messi dove
dice `SB_DATI`, fuori dalla cartella pubblica.

**2. Il contenuto di `server/backup/`** — sono copie complete del sito, con
dentro tutto. Non servono a niente sull'hosting nuovo e occupano spazio: la
cartella si crea vuota da sé.

**3. Tutto quello che non è il sito** — `.git/`, i contratti, il changelog, il
`README`, la licenza, le catture dello schermo, i file di configurazione degli
editor. Non fanno danno, ma stanno nella cartella pubblica senza motivo, e ogni
file in più è una cosa in più da tenere chiusa.

> E una regola che vale per tutte e tre: **niente che riporti a una persona**.
> Nome, cognome, indirizzo di posta personale. Nella cartella pubblica ci va il
> sito del canale, non l'anagrafe di chi lo costruisce.

---

## 11. Se qualcosa non va

| Cosa vedi | Cos'è quasi sempre |
|---|---|
| **Pagina bianca, o l'elenco dei file** | l'archivio è stato scompattato in una sottocartella: dentro `httpdocs` deve esserci direttamente `index.html` (capitolo 3) |
| **500 su tutto il sito, appena caricato `.htaccess`** | l'hosting non permette a `.htaccess` una delle direttive. Il nome della riga è nel `error_log` del dominio; si commenta una sezione alla volta partendo dall'ultima (il file spiega come, in testa) |
| **Il sito si vede ma `/pannello/` dà 404** | Node non è partito: Plesk → Node.js, controlla *Application Startup File* = `app.js` e premi **Restart App** |
| **Il pannello si apre ma «Salva» dà errore** | quasi sempre i permessi di scrittura sulla cartella, o un `SB_DATI` che punta a un percorso che non esiste. Il motivo è scritto nel `error_log` |
| **Il player di Twitch è un rettangolo nero** | manca il dominio fra quelli autorizzati: capitolo 8, punti 2 e 3 (l'indirizzo nei contenuti, poi **Pubblica**) |
| **Twitch dice `redirect_mismatch` al login** | l'indirizzo di ritorno non è registrato su `dev.twitch.tv`, o è scritto senza la barra finale: capitolo 8, punto 4 |
| **Il pannello mostra «scegli una password» a chi ce l'aveva già** | `auth.json` non si trova: `SB_DATI` cambiata o cartella non scrivibile. **Non crearne una nuova**, guarda il `error_log` (capitolo 6) |
| **Su `/pannello/` non si riesce a creare la prima password** | è voluto: da internet serve `SB_PRIMO_ACCESSO=1` e un riavvio (capitolo 6), oppure `node server/imposta-password.js` da SSH |
| **«Richiesta rifiutata: arriva da un altro sito» a ogni salvataggio** | il proxy riscrive l'intestazione `Host`: Plesk → Apache & nginx Settings, controlla le direttive nginx (capitolo 5, `SB_DIETRO_PROXY`) |
| **Il pannello non fa più entrare nessuno dopo pochi tentativi** | manca `SB_DIETRO_PROXY=1`: il freno conta tutti i visitatori come un indirizzo solo (capitolo 5) |
| **I colori sono sbagliati, sembra un altro sito** | manca `css/tema.css`: premi **Pubblica** nel pannello e torna |
| **Le immagini della schedule non si vedono** | una regola di nginx copiata storta blocca `contenuti/media/`: capitolo 7, terza prova |
| **Il browser gira a vuoto fra http e https** | il certificato non c'è ancora. Prendilo (capitolo 8, punto 1) oppure commenta la sezione 1 di `.htaccess` |
| **Avviso di sicurezza del browser arrivando con `www`** | il certificato copre `slayerbeard.com` ma non `www.slayerbeard.com`: rifallo spuntando tutti e due (capitolo 8, punto 1) |
| **`www.slayerbeard.com` non rimanda al sito** | in Plesk `www` non è un alias del dominio, oppure la sezione 2 di `.htaccess` è stata modificata. Il dominio compare in due punti soli del file, tutti e due nella prima metà |
| **In `robots.txt` manca la riga `Sitemap:`** | dopo aver messo `SB_SITO` non è stata premuta **Pubblica**: quella riga la scrive la pubblicazione, non si mette a mano |
| **Chi era nel pannello è stato buttato fuori** | c'è stato un **Restart App**: le sessioni stanno in memoria, si rientra con la password e le modifiche salvate ci sono ancora |
| **«Ultima diretta» e i numeri non si aggiornano** | manca il collegamento con Twitch (`node server/imposta-twitch.js`), oppure `SB_AGGIORNA_MIN` è a `0` |

Dove guardare, in ordine: il **`error_log`** del dominio (Plesk → il dominio →
*Logs*), che è dove il programma scrive cosa non gli piace; la pagina **Node.js**
di Plesk, che dice se l'applicazione è accesa; e il collaudo,
`node server/autotest.js`, che dice se l'installazione è a posto.
