# Riprendi da qui — lavoro sospeso il 7 settembre 2026

Quattro punti chiesti, **tre finiti e uno a metà**. Il sito gira: `node server/genera.js`
è andato a buon fine e `index.html`, `js/dati.js`, `css/tema.css` sono rigenerati e coerenti.

Quello che manca è tutto **lato server** (punto 4) più il rifacimento del collaudo e della
documentazione. Niente di quello che resta blocca il sito: si può aprire e provare così com'è.

---

## Stato dei quattro punti

### 1. «Collegati con Twitch» resta dopo il login — FATTO

Non era un problema di logica ma di CSS. In `css/base.css` la regola `[hidden] { display: none }`
stava alla riga 99, `.btn { display: inline-flex }` alla 255. Hanno la **stessa specificità**
(0,1,0), e a parità vince l'ultima arrivata: qualunque bottone nascosto da JavaScript restava in
pagina. Non riguardava solo il login — valeva per ogni `.btn[hidden]` del sito.

Corretto in `css/base.css` portando la regola a `[hidden][hidden] { display: none }`, cioè
specificità (0,2,0), senza `!important`: così `css/pollo.css` (caricato dopo) può ancora fare la
sua eccezione e far sfumare il fumetto con l'opacità.

Dopo il login adesso restano soltanto la tessera («Collegato come X») e **Scollega e revoca**,
che chiama davvero `oauth2/revoke` su Twitch.

### 2. Login come profilo del sito, non del solo player — FATTO

Il collegamento con Twitch era **dentro** `js/lurk.js`: col messaggio in chat spento non esisteva
nemmeno il modo di collegarsi. Adesso è un modulo suo.

- **`js/account.js`** (nuovo) — `window.Account`: `suStato`, `stato`, `entra`, `esci`, `valida`,
  `token`, `id`, `clientId`, `avviso`. Token in `sessionStorage`, finestrella + ripiego su
  redirect, `state` controllato, revoca vera. Vive anche col lurk spento.
- **`js/lurk.js`** — perse le sezioni 10 e 11 (login, validazione, revoca, profilo). Adesso chiede
  ad `Account` chi è collegato e usa il suo token per l'unica richiesta che gli serve.
- **`css/account.css`** (nuovo) — la tessera; da `css/lurk.css` sono spariti `.lurk-account`,
  `.lurk__chi`, `.lurk__avatar`, `.lurk__diagnosi`.
- **`modelli/parziali/diretta.html`** — `#lurk-account` è diventato `#account`, con `#account-nota`
  e `#account-stato`. La posizione è la stessa di prima (in cima alla sezione «Diretta»), come
  deciso.
- **`js/ritorno.js`** — il messaggio è `sb-account-ritorno`, il canale `sb-account`.

**Configurazione spostata** (`contenuti/contenuti.json` + `contenuti/schema.js`):

| prima | adesso |
|---|---|
| `config.lurk.clientId` | `config.account.clientId` |
| `config.lurk.urlRitorno` | `config.account.urlRitorno` |
| — | `config.account.attivo` (nuovo) |
| `lurk.entra` / `lurk.esci` / `lurk.collegato` | `account.entra` / `account.esci` / `account.collegato` |
| — | `account.nota` (nuovo, `ricco`) |
| — | `lurk.chiuso` (nuovo, per il punto 3) |

Nuovo gruppo del pannello **«Profilo del sito (login con Twitch)»**, fra «diretta» e «lurk».
`server/lib/costruisci.js` ha una `accountDi()` nuova e `lurkDi()` prende il profilo come terzo
argomento: senza profilo il messaggio in chat resta spento comunque (`motivo: 'senzaAccount'`).

### 3. Lurk solo a canale acceso — FATTO

Sezione 10 nuova in `js/lurk.js`. La cosa da non perdere di vista è la distinzione fra i due casi
opposti, che dal solo `inOnda` del player **non si distinguono**:

- «la diretta è finita» → si spegne tutto;
- «il nostro video si è fermato» → si riavvia, ed è il mestiere del file.

`player.js` conclude «fuori onda» anche quando la sua riconciliazione periodica trova il video
fermo — cioè proprio nel caso in cui il lurk deve intervenire. Per questo `fuoriOndaCerto()`
guarda solo due sorgenti che non si confondono: `window.Canale` (la risposta di `helix/streams`,
per chi è collegato) e `finito`, cioè un OFFLINE/ENDED **ricevuto** dall'SDK.

Conseguenze applicate: l'interruttore è disabilitato a canale spento (con `title` che spiega
perché, e la riga di stato che dice «Il canale è fuori onda»), `accendi()` rifiuta anche se
chiamata da `window.Lurk.accendi()`, la diretta che finisce chiama `chiudiPerFineDiretta()` — che
spegne, lo dice con `lurk.chiuso` e **conserva** la scelta in `localStorage` (la persona non ha
cambiato idea, è finita la diretta), e `invia()` non manda niente in chat a canale spento.

### 4. «Ultima diretta» ferma a venerdì — META

È un campo scritto a mano (`config.ultimaDiretta`) e nessuno lo aggiorna. Twitch non dà nessun
dato senza token, quindi la scelta presa è **doppia sorgente**:

- **fatto** — `js/canale.js` (nuovo): per chi si è collegato col profilo, chiede a Twitch
  `helix/streams` (in onda + titolo, che va anche a `Player.dichiara()` e rende autorevole lo
  stato del canale) e `helix/videos?type=archive&first=1` per il titolo dell'ultima diretta, con
  ripiego su `helix/channels`. Un giro ogni 2 minuti, solo a pagina visibile, solo da collegati.
  `js/player.js` ha la nuova `Player.dichiara(inOnda, titolo)` e non riscrive più `#ultima`
  quando il nodo porta `data-fonte="twitch"`.
- **da fare** — il pezzo che serve ai **visitatori anonimi**: alla pubblicazione il server locale
  chiede a Twitch il titolo con un app token (`client_credentials`) e lo scrive in
  `contenuti.json`, così il valore pubblicato è fresco per tutti.

---

## Cosa manca, in ordine

1. **`server/lib/twitch.js`** (da scrivere). Legge `server/dati/twitch.json`
   (`{ clientId, clientSecret }`), prende un app token da `id.twitch.tv/oauth2/token` con
   `grant_type=client_credentials` e lo tiene in cache con la sua scadenza. Espone
   `aggiornaUltimaDiretta()`: `GET helix/videos?user_id=<config.twitch.idUtente>&type=archive&first=1`,
   ripiego su `helix/channels`, e se il titolo è cambiato lo scrive in `config.ultimaDiretta` via
   `archivio.leggi()` / `archivio.salva()`. **Non deve mai svuotare il valore esistente**: se
   Twitch non risponde, si tiene quello che c'è.
2. **`server/imposta-twitch.js`** (da scrivere). Come `imposta-password.js`: scrive
   `server/dati/twitch.json` con permessi ristretti. Il secret **non** va nello schema, non va in
   `contenuti.json` e non finisce mai nel sito generato — sta solo lì.
3. **Aggancio.** `costruisci.genera()` è sincrona e va lasciata tale: la chiamata a Twitch va
   fatta *prima*, nei due chiamanti — `server/genera.js` (CLI) e `rottaPubblica()` in
   `server/lib/api.js` (che diventa `async`). Esito da riportare nell'output del comando e nella
   risposta JSON della pubblicazione.
4. **`server/lib/percorsi.js`**: aggiungere `twitch: path.join(radice, 'server', 'dati', 'twitch.json')`.
5. **Collaudo.** `node server/autotest.js` → **12 prove fallite su 117**, tutte conseguenze volute
   del rifacimento. Da aggiornare:
   - `2. Convalida` → i quattro controlli d'insieme parlano di `config.account.*` adesso, non
     `config.lurk.*` (vedi `server/lib/controlli.js`, già riscritto);
   - `3. Copertura` → l'ordine dei gruppi attesi ha `account` fra `diretta` e `lurk`;
   - `7. Modalità lurk` → `messaggio.clientId`/`urlRitorno` non esistono più nel ramo `lurk`, il
     motivo `senzaClientId` è diventato `senzaAccount`, l'elenco dei testi obbligatori perde
     `entra`/`esci`/`collegato` e guadagna `chiuso`, l'ordine degli script è
     `ritorno, dati, player, sito, account, canale, lurk, pollo`, e il gruppo che precede `lurk`
     è `account`.
   Vanno poi **aggiunte** prove nuove per: il ramo `account` di `window.DATI`, l'invariante «senza
   profilo il messaggio in chat resta spento», e la forma di `twitch.json`.
6. **Documentazione.** `README.md` (capitoli «La modalità lurk» e «Cose da fare quando il sito va
   online»), `docs/PANNELLO.md` (gruppo nuovo), e una riga onesta nel `CONTRATTO-3.md`: quel file
   dice «il client secret non si usa mai, non sta in nessun campo dello schema e non deve
   esistere». Resta vero per il **browser**; va aggiunto che sul server locale, usato solo alla
   pubblicazione e mai pubblicato, esiste ed è una cosa diversa.

---

## Da provare a mano quando riprendi

Il collaudo non copre il browser, e queste quattro cose si vedono solo aprendo il sito
(`node server/server.js`, poi <http://localhost:4173>):

- collegarsi con Twitch e controllare che «Collegati con Twitch» **sparisca** (punto 1);
- che la tessera compaia in cima alla sezione «Diretta» con immagine e nome;
- che a canale spento l'interruttore del lurk sia **grigio e non premibile**, con la riga «Il
  canale è fuori onda»; e che accendendolo a canale acceso e poi chiudendo la diretta il riquadro
  si spenga da solo dicendo perché;
- che da collegati «Ultima diretta» nel quadro comandi cambi da sé entro pochi secondi.

Attenzione a una cosa non verificata: `js/account.js` chiede lo scope `user:write:chat` solo se il
messaggio in chat del lurk è acceso, altrimenti manda `scope=` **vuoto**. Con la configurazione
attuale (messaggio acceso) il caso non si presenta, ma se un domani si spegne il messaggio va
controllato che Twitch accetti l'implicit grant senza scope invece di rispondere `invalid_scope`.

---

## File toccati

Nuovi: `js/account.js`, `js/canale.js`, `css/account.css`.
Modificati: `css/base.css`, `css/lurk.css`, `js/lurk.js`, `js/player.js`, `js/ritorno.js`,
`modelli/index.html`, `modelli/parziali/diretta.html`, `contenuti/contenuti.json`,
`contenuti/schema.js`, `server/lib/costruisci.js`, `server/lib/controlli.js`.
Rigenerati: `index.html`, `js/dati.js`, `css/tema.css` (backup in
`server/backup/2026-09-07T00-39-59-982Z/`).
