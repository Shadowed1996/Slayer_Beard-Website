# CONTRATTO-6 — il sito pronto per un hosting Plesk con Node

**Data:** 17 settembre 2026
**Repository:** `Shadowed1996/Slayer_Beard-Website`, ramo `main`, a partire dal commit di fusione
`e0d726d` (la schedule di CONTRATTO-5 e i follower automatici insieme).
**Hosting di destinazione:** pannello **Plesk** su `plesk1.rhosting.network`, IP `185.242.180.191`,
con supporto Node (Phusion Passenger). **Il dominio pubblico non è ancora deciso.**

Questo contratto vale per tutto il lavoro descritto qui sotto e sta sopra alle abitudini di chi
scrive: dove dice «non si tocca», non si tocca.

---

## 1. Cosa si deve ottenere

Oggi il progetto è un sito statico più un server Node di amministrazione pensato per girare **in
locale** (`127.0.0.1:4173`, avviato a mano). Alla fine di questo lavoro lo stesso progetto deve
poter essere **caricato su un hosting Plesk con Node e funzionare senza modifiche a mano**:

1. il sito pubblico visibile al dominio, veloce e con le intestazioni giuste;
2. il pannello di amministrazione raggiungibile su `/pannello/` e sicuro da esporre a internet;
3. un solo file d'avvio che Plesk sappia lanciare, e le impostazioni tutte in variabili d'ambiente;
4. **niente di riconducibile a chi ha commissionato il sito** (nome, indirizzo di posta, percorsi
   del suo computer) in ciò che finisce online;
5. `index.html` **senza commenti**: codice pulito, come chiesto dal committente;
6. un pacchetto `.rar` in `Downloads`, pronto da caricare così com'è.

## 2. Le cose che non si toccano

- **La grafica del sito non cambia.** Nessuna modifica a `css/*.css` (a parte, se serve, i commenti
  di intestazione) e nessuna modifica ai `modelli/parziali/*.html` che cambi ciò che si vede.
  Se una pagina viene diversa da prima anche di un pixel, è un errore da segnalare, non una scelta.
- **I contenuti non si riscrivono.** `contenuti/contenuti.json` si tocca solo dove questo contratto
  lo dice (indirizzo pubblico, domini del player).
- **Non si cita Mobscene93**, né nel codice né nei documenti: il progetto è Slayer Beard.
- **Le prove non si indeboliscono.** `node server/autotest.js` deve finire con «TUTTO A POSTO» e il
  numero di prove non può scendere: oggi sono 182.
- Niente dipendenze npm: il server sta in piedi sulla libreria standard di Node e ci resta.
  `package.json` esiste per l'avvio e i metadati, non per installare pacchetti.
- Nessuna riscrittura della storia di git, nessun `git push --force`.

## 3. Il modello di funzionamento su Plesk (deciso, non da reinventare)

Plesk con l'estensione Node usa Passenger: si indicano **cartella dell'applicazione**, **document
root** e **file d'avvio**. Sul nostro progetto:

- cartella dell'applicazione e document root: la **stessa** cartella (la radice del progetto);
- file d'avvio: **`app.js`** nella radice;
- i file statici che esistono su disco (`index.html`, `css/`, `js/`, `img/`, `pannello/`,
  `contenuti/media/`, `contenuti/font/*.woff2`) li serve il server web, non Node: da qui l'utilità
  di `.htaccess`;
- tutto il resto — `/api/*` e qualunque percorso senza un file dietro — arriva a Node.

**Il pericolo da chiudere:** se il server web serve i file statici da sé, `server/dati/auth.json`
(l'impronta della password) e `server/dati/chiavi.js` (il *secret* di Twitch) diventerebbero
scaricabili. Per questo il lavoro deve chiudere quella porta **due volte**:

1. con le regole di `.htaccess` (e l'equivalente per nginx, scritto nella guida, perché su Plesk
   nginx può servire i file statici saltando `.htaccess`);
2. permettendo di tenere quei file **fuori dalla document root** con una variabile d'ambiente:
   è la protezione che non dipende dalla configurazione del server web.

## 4. Il lavoro, diviso per agente

Ogni file ha **un solo padrone**. Chi ha bisogno di una modifica in un file di un altro la chiede
nel proprio rapporto invece di farla.

### Agente NODO — l'avvio su hosting
**Possiede:** `app.js` (nuovo), `package.json` (nuovo), `.env.esempio` (nuovo),
`server/server.js`, `server/lib/percorsi.js`, `server/avvia.cmd`, `server/avvia.sh`.

1. **`app.js`**: il file d'avvio per Passenger. Legge la porta da `PORT` (quella che passa Plesk),
   poi `SB_PORTA`, poi 4173; l'indirizzo da `SB_HOST`, con `0.0.0.0` come valore di partenza quando
   si parte da `app.js` (in locale `node server/server.js` resta su `127.0.0.1` come adesso);
   imposta `TZ=Europe/Rome` se non è già impostata, **prima** di caricare qualunque altro modulo,
   perché gli orari della settimana sono italiani; non stampa il riquadro d'avvio come fa il
   comando locale, ma una riga sola.
2. **`package.json`**: `name` `slayer-beard-website`, `private: true`, `version` allineata al
   progetto, `main: app.js`, `scripts`: `start` (`node app.js`), `genera`, `prova`
   (`node server/autotest.js`), `engines.node >= 18.17`. **Nessun autore che sia una persona**:
   `"author": "slayer_beard"`. Nessuna dipendenza.
3. **`percorsi.js`**: variabili d'ambiente nuove, tutte facoltative e senza cambiare niente quando
   non ci sono: `SB_DATI` (la cartella di `auth.json`, `chiavi.js`, `twitch-accesso.json`) e
   `SB_BACKUP` (i backup). Servono per tenere i segreti fuori dalla document root. Se la cartella
   indicata non esiste, si crea al primo uso; se è indicata e non si può creare, si dice chiaro
   all'avvio invece di ripiegare in silenzio su una cartella dentro il sito.
4. **`server.js`**: porta da `PORT` prima di `SB_PORTA`; l'avvio non deve morire se
   `console.log` di un riquadro non serve; il resto del file non si riscrive.
5. Gli script `avvia.cmd` e `avvia.sh` restano per l'uso locale: si aggiornano solo se una riga
   smette di essere vera.

**Non** tocca `.htaccess`, `costruisci.js`, i documenti, `autotest.js`.

### Agente SERVE — il server web e la guida di messa online
**Possiede:** `.htaccess` (nuovo), `robots.txt` (nuovo), `docs/HOSTING.md` (nuovo).

1. **`.htaccess` ottimizzato**, con dentro, in sezioni commentate in italiano:
   - **negazioni**: `server/`, `contenuti/contenuti.json`, `contenuti/schema.js`,
     `contenuti/font/elenco.json`, `modelli/`, `docs/`, `*.md`, `package.json`, `.env*`,
     `app.js`, `.git*`, `.editorconfig`, `.gitattributes`. Devono restare raggiungibili
     `contenuti/media/**` e i font `contenuti/font/*.{woff2,woff,ttf,otf}`;
   - **compressione** (`mod_deflate`) su html, css, js, json, svg, xml, txt;
   - **cache**: `index.html` sempre rivalidato (`no-cache`); `css/` e `js/` con vita breve
     (un'ora, rivalidabile) perché li riscrive la pubblicazione e non hanno un'impronta nel nome;
     `img/`, `contenuti/media/`, `contenuti/font/` con vita lunga (30 giorni o più);
   - **intestazioni di sicurezza**: `X-Content-Type-Options`, `Referrer-Policy`,
     `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` sobria, HSTS **solo** dietro HTTPS;
   - **niente elenco delle cartelle**, tipi MIME per `.webp`, `.avif`, `.woff2`;
   - **da http a https** in modo indipendente dal dominio (nessun dominio scritto dentro);
   - una sezione **commentata** e chiaramente segnata per il `www` → senza `www` (o il contrario),
     da scommentare quando il dominio si sa.
   Ogni direttiva dentro `<IfModule>`: su un hosting condiviso un modulo che manca non deve
   buttare giù il sito con un 500.
2. **`robots.txt`**: tutto permesso tranne `/pannello/` e `/api/`; la riga `Sitemap:` la scrive la
   generazione (agente USCITA) quando l'indirizzo del sito è noto — qui si lascia il posto.
3. **`docs/HOSTING.md`**: la guida vera, in italiano, scritta per chi non programma. Deve
   contenere: cosa caricare e dove; i campi da compilare nell'estensione Node di Plesk (cartella,
   document root, file d'avvio `app.js`, `npm start`); **le variabili d'ambiente una per una**, con
   un esempio; il primo accesso al pannello e la password; l'avviso su nginx che serve i file
   statici (con le direttive nginx da incollare, equivalenti alle negazioni di `.htaccess`);
   cosa fare il giorno in cui si sa il dominio (indirizzo pubblico, domini del player Twitch,
   `www`, HSTS); come si aggiorna il sito in seguito; cosa **non** caricare mai
   (`server/dati/`, i backup). L'hosting è `plesk1.rhosting.network` (IP `185.242.180.191`):
   si può citare come pannello di controllo, ma **non** come indirizzo del sito.

**Non** tocca file `.js`, né `README.md`, né `CHANGELOG.md`.

### Agente USCITA — la pagina generata, pulita e con l'indirizzo giusto
**Possiede:** `server/lib/costruisci.js`, `server/genera.js`, `server/lib/controlli.js`,
`modelli/index.html` e `modelli/parziali/*.html` **solo per i commenti** (vedi sotto).

1. **`index.html` senza commenti.** La generazione deve scrivere una pagina **senza nemmeno un
   `<!-- … -->`** (oggi ne esce una quarantina, arrivano dai modelli). I commenti restano nei
   modelli, che sono il codice sorgente e devono restare spiegati: si toglie **in uscita**, non
   alla fonte. Attenzione: non si tocca il contenuto dei `<pre>`, non si rompono i commenti
   condizionali eventuali, e il testo dentro gli attributi non si guarda nemmeno. Si tolgono anche
   le righe rimaste vuote al loro posto, senza incollare fra loro tag che prima erano separati
   (una pagina che si vede diversa è un errore).
2. **Indirizzo pubblico da una variabile.** Se `config.sitoUrl` è vuoto ma c'è `SB_SITO`
   (`https://slayerbeard.com`), la generazione usa quello per il link canonico e per le
   anteprime social, e ne aggiunge l'host ai **domini del player Twitch**, così il player funziona
   appena il sito è online senza aprire il pannello. `config.sitoUrl`, se c'è, vince su `SB_SITO`.
3. **`sitemap.xml`**: la generazione la scrive nella radice quando l'indirizzo del sito è noto
   (da `config.sitoUrl` o da `SB_SITO`), con la sola pagina del sito e la data dell'ultima
   pubblicazione; e in quel caso mette la riga `Sitemap:` in `robots.txt`. Senza indirizzo non
   scrive niente e non si lamenta.
4. Gli avvertimenti di `controlli.js` devono tenere conto di `SB_SITO`: se l'indirizzo arriva da
   lì, l'avvertimento «manca l'indirizzo pubblico» non ha più motivo di comparire.
5. `genera.js` stampa in chiaro cosa ha scritto, compresa la sitemap.

**Non** tocca `app.js`, `.htaccess`, `autotest.js`, i documenti.

### Agente SCUDO — il pannello esposto a internet
**Possiede:** `server/lib/autenticazione.js`, `server/lib/statico.js`, `server/lib/api.js`,
`server/lib/risposte.js`.

Il pannello nasce per `localhost`; da domani sta su internet. Serve quel poco che manca:

1. **`X-Forwarded-For` non si crede sulla parola.** Oggi il freno ai tentativi di password prende
   il **primo** valore dell'intestazione, che la scrive chi chiama: bastano cinque richieste con
   un indirizzo finto ogni volta per non essere frenati mai. Dietro un proxy si prende l'**ultimo**
   salto (quello che aggiunge il proxy di casa), e solo quando si dichiara di stare dietro un
   proxy (`SB_DIETRO_PROXY=1`); senza dichiarazione vale l'indirizzo della connessione. Stesso
   ragionamento per `X-Forwarded-Proto` e il cookie `Secure`.
2. **Un freno anche sulle richieste che non sono l'accesso**, leggero: un tetto per indirizzo IP
   sulle rotte che scrivono, per non far lavorare il server gratis a chi prova a caso.
3. **`statico.js`**: la lista di ciò che non esce dal browser deve valere anche quando è Node a
   servire i file — `*.md`, `package.json`, `.env*`, `app.js`, `.git*`, `modelli/`, `docs/`,
   `contenuti/schema.js`, `contenuti/contenuti.json` — con le eccezioni di `contenuti/media/` e dei
   font, che servono al sito. Intestazioni di cache come quelle di `.htaccess` (`index.html`
   rivalidato sempre, immagini a vita lunga) e `X-Content-Type-Options` già c'è.
4. Le sessioni restano in memoria: un riavvio dell'applicazione fa rifare l'accesso, e va bene.
   **Non** si aggiunge un archivio delle sessioni su disco.
5. Se una scelta di sicurezza cambia il comportamento in locale, si spiega nel rapporto.

**Non** tocca `costruisci.js`, `app.js`, `.htaccess`, `autotest.js`, i documenti.

### Agente NOMI — via il nome del committente, dentro e fuori
**Possiede:** `LICENSE`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`,
`CODE_OF_CONDUCT.md`, `.github/**`, `docs/PANNELLO.md`, `docs/PRESENZA-TWITCH.md`,
`CONTRATTO.md`, `CONTRATTO-2.md`, `CONTRATTO-3.md`, `CONTRATTO-4.md`, `CONTRATTO-5.md`,
`contenuti/contenuti.json`.

1. **Nel pacchetto che va online non deve comparire niente di chi ha commissionato il sito.** Nel repository si fa
   quanto costa poco e non toglie senso:
   - `LICENSE`: il titolare del copyright diventa `slayer_beard` (non una persona con nome e
     cognome);
   - `CONTRIBUTING.md`, `README.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`: via il nome proprio;
     dove serve un contatto resta il canale GitHub del progetto, **mai** un indirizzo di posta;
   - `CONTRATTO*.md` e `docs/*`: i percorsi del computer di chi sviluppa diventano neutri
     (`<cartella di lavoro>\…`) senza cambiare il senso delle frasi;
   - nessun indirizzo di posta personale in nessun file: resta solo quello pubblico del canale
     (`slayerbeard@gmail.com`), che è contenuto del sito.
2. **`contenuti/contenuti.json`**: solo due cose, e solo se ci sono da sistemare — che l'indirizzo
   pubblico resti vuoto (lo passa `SB_SITO`) e che i domini del player non contengano indirizzi di
   prova sbagliati. Nessun testo del sito si riscrive.
3. **`CHANGELOG.md`**: la voce di questo lavoro, scritta come le altre.
4. **`README.md`**: la sezione sulla messa online rimanda a `docs/HOSTING.md` e dice le tre cose
   che cambiano per chi lavora in locale (`app.js`, `package.json`, le variabili d'ambiente).
5. **Da segnalare, non da fare:** nella storia di git i commit sono firmati con l'indirizzo di
   posta del committente, e quella non si riscrive (vedi §2). Va detto nel rapporto, con il
   rimedio per il futuro (`git config user.email` con l'indirizzo `@users.noreply.github.com` e
   l'impostazione di GitHub che tiene privato l'indirizzo).

**Non** tocca file `.js`, `.htaccess`, `docs/HOSTING.md`.

### Agente COLLAUDO — le prove (parte dopo i primi quattro)
**Possiede:** `server/autotest.js`.

1. Prove nuove per tutto ciò che è stato aggiunto: la porta e l'indirizzo letti dall'ambiente,
   `SB_DATI`/`SB_BACKUP` che spostano davvero i file, la pagina generata **senza commenti** e
   identica a prima per il resto, `SB_SITO` che entra in canonico, anteprime social e domini del
   player, la sitemap, `X-Forwarded-For` che non aggira più il freno, i file negati da
   `statico.js`.
2. La prova completa dal vivo: si avvia il server come lo avvierebbe Plesk
   (`PORT=4288 SB_HOST=127.0.0.1 node app.js`), si guarda il sito e il pannello con Chrome
   headless, si pubblica dal pannello e si controlla che `index.html` esca senza commenti e che la
   schedule e le immagini nuove siano al loro posto. **Una sola istanza di Chrome alla volta**
   (regola d'oro del progetto) e server spento a fine prove.
3. Fotografie in `foto/` della cartella di lavoro, elencate nel rapporto.
4. Se una prova rossa dipende dal lavoro di un altro agente, si scrive nel rapporto **con il file e
   la riga**: non si corregge il file di un altro.

## 5. Il pacchetto da caricare (lo fa chi coordina, alla fine)

Dentro il `.rar` in `Downloads`, con la radice del sito al primo livello:

**Ci va:** `app.js`, `package.json`, `.htaccess`, `robots.txt`, `.env.esempio`, `index.html`,
`css/`, `js/`, `img/`, `modelli/`, `contenuti/` (con `media/` e `font/`), `pannello/`,
`server/` **senza** `dati/` e **senza** il contenuto di `backup/`, `docs/HOSTING.md`,
`docs/PANNELLO.md`, e un `LEGGIMI-PRIMA.txt` con i passi in dieci righe.

`server/autotest.js` ci va: sull'hosting serve a controllare che l'installazione stia in piedi.

**Non ci va:** `.git/`, `.github/`, `CONTRATTO*.md`, `CHANGELOG.md`, `README.md`, `LICENSE`,
`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `Cattura.PNG`, `.editorconfig`,
`.gitattributes`, `.gitignore`, `server/dati/**`, `server/backup/**`, e qualunque file con dentro
il nome del committente.

Prima di comprimere si passa un controllo automatico: se in un file del pacchetto compare il nome
o il nome utente di chi ha commissionato il sito, un percorso del suo computer, un indirizzo di
posta che non sia quello pubblico del canale, o un dominio che non è quello vero, il pacchetto non
si fa. L'elenco preciso sta nello strumento che lo monta.

## 6. Come si lavora

- Cartella di lavoro: la scratchpad della sessione, sottocartella `slayer\`. La copia del
  repository su cui si scrive è `slayer\repo` — **è quella di GitHub, appena fusa**: si lavora lì.
- Ogni agente, appena finisce un passo, scrive `slayer\progresso\<NOME>.json`:
  `{ "nome": "NODO", "percento": 40, "passo": "app.js scritto, provo l'avvio", "aggiornato": "<ISO>" }`.
  Serve al cruscotto che il committente guarda: va aggiornato spesso, non solo alla fine.
- A lavoro finito, un rapporto in `slayer\rapporti\<nome>.md`: cosa ho cambiato e perché, cosa ho
  provato, cosa ho lasciato agli altri, cosa non ho potuto provare.
- Le decisioni che si prendono per conto proprio vanno in `slayer\decisioni\<nome>.md`.
- `node server/autotest.js` deve restare verde: chi rompe una prova la sistema, chi ha bisogno di
  cambiarne una **lo chiede a COLLAUDO nel rapporto**.
- Commit e push su GitHub li fa chi coordina, a lavoro finito e prove verdi. Gli agenti non
  committano.
