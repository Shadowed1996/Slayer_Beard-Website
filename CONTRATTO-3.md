# CONTRATTO 3 — terza fase: la modalità lurk

Addendum vincolante a `CONTRATTO.md` e `CONTRATTO-2.md`, che **restano validi in tutto**
(niente npm, niente framework, niente CDN oltre Google Fonts ed `embed.twitch.tv`, Node >= 18
con soli moduli interni, `path.join` su Windows, tutto in italiano, nessun `TODO`, nessun
placeholder, commenti che spiegano il *perché*).

**Prima di leggere questo documento, leggi [`docs/PRESENZA-TWITCH.md`](docs/PRESENZA-TWITCH.md).**
Contiene la ricerca da cui nasce tutta questa fase e, soprattutto, il fatto che ne determina il
disegno: **Twitch conta uno spettatore finché il video gira, e la chat non entra nel conteggio.**
Chi salta quella lettura costruirà la cosa sbagliata con le migliori intenzioni.

---

## 0. Cosa si costruisce, e cosa no

Il committente ha chiesto un modo perché gli spettatori veri — quelli che stanno guardando e si
allontanano dalla tastiera — **non spariscano dal conteggio**, e in più un tasto che mandi in
chat un messaggio di lurk a nome di chi si è collegato con Twitch.

Da qui due blocchi distinti, che **non si mescolano nel codice**:

| | Cosa fa | Login | Stato |
|---|---|---|---|
| **A — sessione viva** | sorveglia il player e lo fa ripartire quando il browser lo ferma | **no** | si costruisce |
| **B — messaggio di lurk** | un clic, **un** messaggio in chat a nome dell'utente | sì | si costruisce, **spento** finché non c'è un Client ID |
| ~~C — invio periodico~~ | ~~messaggi automatici a ripetizione~~ | — | **non si fa** |

Il terzo blocco è escluso e non va reintrodotto: viola le Community Guidelines e il Developer
Services Agreement, non aumenta il conteggio spettatori, e nell'unico scenario in cui potrebbe
girare in modo accettabile è ridondante rispetto ad A. Le motivazioni per esteso stanno nel §2 e
nel §6.3 di `docs/PRESENZA-TWITCH.md`.

**Conseguenza pratica sullo schema**: le chiavi `messaggioAutomatico`, `minutiFraMessaggi` e
`messaggiMax` **non esistono**. Un campo che non c'è è un campo che nessuno accenderà per
sbaglio fra un anno.

---

## 1. Proprietà dei file

| Agente | File di sua ESCLUSIVA proprietà |
|---|---|
| **L — LURK** | `js/lurk.js` (nuovo), `css/lurk.css` (nuovo), `modelli/parziali/lurk.html` (nuovo) |
| **3 — PLAYER** | `js/player.js` |
| **1 — DIRETTA** | `modelli/parziali/diretta.html` (una riga: l'include) |
| **2 — POLLO** | `js/pollo.js` |
| **4 — SERVER** | `server/lib/costruisci.js` |
| **6 — SCHEMA** | `contenuti/schema.js`, `contenuti/contenuti.json` |
| **9 — DOCS** | `README.md`, `docs/PANNELLO.md`, `server/autotest.js` |
| **integratore** | `modelli/index.html`, `modelli/parziali/testa.html`, `CONTRATTO-3.md` |

`index.html`, `js/dati.js` e `css/tema.css` alla radice restano **generati**: non si scrivono a
mano. `pannello/**` **non si tocca affatto**: i tipi di campo usati esistono già e l'interfaccia
si costruisce da sola dallo schema.

`css/tokens.css` e `server/lib/tema.js` **non si toccano**: `css/lurk.css` riusa i token esistenti
(`--ok`, `--allerta`, `--live`, `--ciano`, `--pannello`, `--linea`) e non contiene **nessun
valore esadecimale** (CONTRATTO-2 §11). Un token nuovo obbligherebbe a toccare anche il motore
del tema, che deve saperlo riscrivere.

---

## 2. Il guscio — `modelli/parziali/lurk.html` (agente L)

Incluso da `diretta.html` come **fratello** di `.diretta__scena`, fra la scena e
`p.diretta__nota`. Fuori dalla scena apposta: la scena è il contesto di posizionamento del pollo
e gli riserva la corsia, e metterci dentro un pannello largo obbligherebbe a rinegoziare
`css/diretta.css` e `css/pollo.css`.

```
{{#se config.lurk.attivo}}{{> parziali/lurk}}{{/se}}
```

Il parziale produce esattamente:

```
section#lurk.lurk[aria-labelledby="lurk-titolo"]
  h3#lurk-titolo.lurk__titolo        {{lurk.titolo}}
  p.lurk__spiegazione                {{{lurk.spiegazione}}}     <- ricco
  div#lurk-comandi.lurk__comandi     <- VUOTO, lo riempie js/lurk.js
  p#lurk-stato.lurk__stato[role="status"][aria-live="polite"]
  p#lurk-conto.lurk__conto           <- SENZA aria-live (vedi sotto)
  p.lurk__account                    {{{lurk.notaAccount}}}     <- ricco
  p.lurk__mobile                     {{{lurk.notaMobile}}}      <- ricco
```

`#lurk-comandi` è vuoto **per contratto**, come `#twitch-embed`: senza JavaScript non devono
restare in pagina bottoni raggiungibili col Tab che non rispondono a niente.

`#lurk-conto` **non ha `aria-live`** e non deve averlo: contiene un contatore che cambia ogni
secondo, e annunciarlo farebbe parlare un lettore di schermo in continuazione. È lo stesso
motivo per cui il fumetto del pollo è `aria-hidden` (CONTRATTO-2 §2.3).

---

## 3. Il blocco A — tenere viva la sessione video

### 3.1 Il comando

**Il clic sul pollo NON si tocca**: apre la chat, è fissato dal CONTRATTO-2 §3.3. Il pollo
*commenta* il lurk, non lo comanda.

`button#lurk-toggle[aria-pressed]` accende e spegne. **Mai attivazione automatica.** La scelta
si ricorda in `localStorage` (`sb-lurk-acceso`, in `try/catch` come `sb-pollo-nascosto`), ma alla
riapertura il pannello dice «l'avevi lasciata accesa» e **aspetta un clic**: il sito non fa
ripartire da solo un meccanismo che riavvia il player sul computer di qualcun altro.

### 3.2 Rilevamento — quattro gradini

Nessuno dei gradini bassi può da solo dichiarare la morte della sessione.

1. **Eventi dell'SDK.** `PAUSE` → ferma, riavviabile. `ENDED`/`OFFLINE` → il canale ha smesso,
   **non c'è niente da tenere vivo**. `PLAYBACK_BLOCKED` → mai partita, serve un gesto umano.
   `PLAY`/`PLAYING`/`ONLINE` → viva, azzera gli allarmi.
2. **Sentinella ogni 20 s** a pagina visibile: legge la cache dell'SDK, **zero richieste di
   rete**. `Idle`/`Ended` dopo essere stato in onda → morta. `Buffering` per **tre cicli
   consecutivi** → stallo; un buffering isolato è normale e non si tocca.
3. **Avanzamento del tempo**: se `playback` dice `Playing` ma `getCurrentTime()` non cresce per
   due cicli, la sessione è ferma pur dichiarandosi viva. **Se il getter manca, lancia, o non
   restituisce un numero, questo gradino si autoesclude e non conclude niente.** Mai dedurre
   «fermo» dall'assenza di un dato.
4. **Contorno**: `navigator.onLine === false` blocca ogni tentativo. Si usa **solo in questo
   verso**: `false` è affidabile, `true` non garantisce che internet ci sia.

`RICONTROLLO` (90 s) in `player.js` **non si abbassa**: la cadenza fitta è un timer di
`js/lurk.js`, così chi guarda normalmente non paga niente.

### 3.3 Riavvio — tre livelli e sei freni

Livelli: `play()` → `setChannel(CANALE)` → ricostruzione (`destroy()` + `new Twitch.Player`,
**massimo due volte per caricamento di pagina**, contatore che non si azzera mai da solo).

`Player.riparti()` **rifiuta** se anche una sola è vera:

1. `modalita !== 'sdk'` — con l'iframe manuale non ci sono né eventi né `play()`;
2. **il canale è dichiarato fuori onda** (`OFFLINE`/`ENDED` ricevuti, non dedotti) — è il freno
   più importante: un canale spento non ha una sessione da tenere viva;
3. `bloccato` (autoplay negato) — ripartire non lo sblocca, serve un gesto;
4. `navigator.onLine === false`;
5. tetto esaurito (6 tentativi leggeri + 2 ricostruzioni per pagina);
6. **il video sta andando e la pagina è visibile** — non si riavvia mai un player funzionante in
   faccia a chi sta guardando.

Attese crescenti: 5 s, 15 s, 45 s, 2 min, poi resa. Il contatore si azzera **solo** dopo un
`PLAY` che regge più di 60 secondi.

**I freni e il tetto vivono dentro `player.js`**, non nel chiamante: è l'unico che sa quante
istanze di `Twitch.Player` ha creato in questa pagina.

### 3.4 Quello che non si fa mai

- **Niente volume finto.** Togliere il muto d'ufficio e mettere il volume a 0,01 per far
  risultare la scheda «audible» è il gonfiaggio artificiale per cui Twitch disabilita l'autoplay
  negli embed. Fuori discussione. Si offre **un bottone** che toglie il muto, e lo preme l'utente.
- **Niente occlusione del player**: nessun `display:none`, `opacity:0`, dimensione sotto
  400×300, overlay sopra il monitor. Il pannello sta **sotto**, mai sopra.
- **Nessun secondo player nascosto.**
- **Nessun riavvio con il video che va.**

### 3.5 Il limite di durata — non è opzionale

Dopo `config.lurk.oreMax` ore il pannello chiede «ci sei ancora?» e, senza risposta entro
qualche minuto, **si spegne da solo**.

È ciò che separa questa funzione da un miner di punti canale, che le Community Guidelines
vietano espressamente («Cheat the Twitch rewards system»). Rimettere in piedi la sessione di chi
è lì è legittimo; tenerla accesa all'infinito per chi se n'è andato no. Chi toglie questo
controllo per «comodità» sposta la funzione dalla parte sbagliata del confine.

La funzione **non si presenta mai** come «accumula punti canale mentre sei AFK».

---

## 4. Il blocco B — login e messaggio di lurk

### 4.1 Un clic, un messaggio

Nessun timer. Nessuna ripetizione. **Un atto umano, un messaggio.**

- **La frase si mostra PRIMA dell'invio.** L'utente deve vedere cosa sta per dire a suo nome,
  non scoprirlo dopo.
- **Al ritorno dall'OAuth non parte niente in automatico**: si chiede conferma. Un redirect non
  deve mai produrre un messaggio non voluto.
- Freno: **un invio al minuto**, e comunque uno solo per volta.

### 4.2 Il testo è la parte che conta

La frase di partenza è **«Hey! Lurko dal sito»**. Con lo **stesso identico codice**, una frase
come «Ci sono, sono attivo!» sposterebbe la funzione dalla parte sbagliata del regolamento:
«lurko» *dichiara* l'assenza, «ci sono» la maschera.

Per questo le frasi stanno in `contenuti.json` sotto il controllo dell'amministratore, e il campo
porta una riga di aiuto che lo spiega. **È l'unico punto del progetto in cui un campo di testo
può rendere illecita una funzione lecita.**

### 4.3 OAuth — implicit grant

Twitch non supporta PKCE, e l'authorization code richiede un client secret, che richiederebbe un
backend. Resta l'**implicit grant** (l'app va registrata come *confidential*; il secret viene
generato e **non si usa mai**, non si scrive da nessuna parte, non esiste un campo per lui nello
schema e non deve esistere).

Obblighi, tutti non negoziabili:

- `state` casuale da `crypto.getRandomValues`, confrontato al ritorno. Senza, un attaccante può
  far tornare la vittima con un token suo.
- `history.replaceState` **subito** al ritorno: il fragment non arriva ai log dei server, ma
  resta nella cronologia.
- Token in **`sessionStorage`**, mai `localStorage`: muore con la scheda, ed è la scelta giusta
  perché il caso d'uso dura quanto la scheda. **Non si offre un interruttore «ricorda il
  login»**: sarebbe un campo che peggiora la sicurezza altrui, spuntato da chi non sa cosa
  comporta.
- **Validazione ogni ora** su `id.twitch.tv/oauth2/validate` — è un requisito dichiarato da
  Twitch, non un consiglio. **`setInterval` da solo non basta**: con la scheda congelata non
  scatta. Si salva l'orologio e si ricontrolla a ogni ritorno in primo piano, e comunque **prima
  di ogni invio**.
- **«Scollega e revoca»** chiama davvero `POST id.twitch.tv/oauth2/revoke`. Buttare il token
  senza revocarlo lo lascia valido su un server di Twitch fino a 60 giorni.

### 4.4 L'invio

`POST https://api.twitch.tv/helix/chat/messages`, header **solo**
`Authorization: Bearer`, `Client-Id`, `Content-Type` — qualunque header in più fa fallire il
preflight CORS, ed è la causa reale di quasi tutti i «CORS error» che si leggono sui forum.

**Un 200 non significa messaggio arrivato.** Si legge `data[0].is_sent`, e se è falso si traduce
`drop_reason` in italiano: sono cose che il visitatore può risolvere (solo-follower, solo-
abbonati, slow mode, duplicato, verifica email mancante, ban). Da sito statico non si può sapere
in anticipo se il messaggio passerà: si prova e si dice com'è andata.

### 4.5 Il rischio, dichiarato

Un token con `user:write:chat` permette di scrivere in **qualsiasi canale di Twitch** a nome di
chi si è collegato: `broadcaster_id` è un parametro della richiesta, non un vincolo del token.

Per questo il blocco B **nasce spento** (`clientId` vuoto) e per questo l'integratore aggiunge
una **Content-Security-Policy** in `modelli/parziali/testa.html`.

---

## 5. Interfacce fra agenti — firme esatte

### 5.1 `window.Player` (agente 3) — esteso, retrocompatibile

`suStato` e `suChat` **restano invariate**, firme comprese: `suStato` riceve un **oggetto**, non
un booleano (la trappola già documentata nel CONTRATTO-2 §6.2).

```js
window.Player = {
  suStato(fn),          // invariata
  suChat(fn),           // invariata

  suVideo(fn),          // NUOVA. fn({ riproduce, fermo, bloccato, finito,
                        //             modalita, playback, tempo })
                        //   riproduce  playback è 'Playing' o 'Buffering'
                        //   fermo      'Idle'/'Ended' dopo essere stato in onda
                        //   bloccato   PLAYBACK_BLOCKED: autoplay negato
                        //   finito     il canale ha dichiarato OFFLINE/ENDED
                        //   modalita   'sdk' | 'iframe' | 'avviso'
                        //   playback   la stringa grezza dell'SDK, che serve a
                        //              distinguere 'Buffering' da 'Playing'
                        //   tempo      getCurrentTime(), oppure null
                        // Chiama subito con lo stato corrente, come le altre due.
                        // NON c'è `daQuando`: quando la modalità lurk è stata
                        // accesa lo sa js/lurk.js, non il player.

  diagnostica(),        // -> lo stesso oggetto, letto al momento.
                        // Nessuna richiesta di rete: legge la cache dell'SDK.

  riparti(livello),     // -> Promise<'ripartito'|'niente'|'impossibile'>
                        // I sei freni del §3.3 vivono QUI.

  smuta()               // -> boolean. Toglie il muto. Va chiamata da un gesto
                        // utente, altrimenti il browser la ignora.
};
```

### 5.2 `window.Lurk` (agente L) — lo consuma il pollo

```js
window.Lurk = {
  suStato(fn),   // fn({ acceso, salute, riavvii, daQuando, collegato, nome, inviati })
                 // salute: 'spento'|'vivo'|'fermo'|'riparto'|'bloccato'|'attesa'
                 //        |'resa'|'niente'
                 // `niente` è il caso del §7: SDK bloccato, nessun comando del
                 // player, quindi non c'è proprio niente da sorvegliare.
  accendi(), spegni()
};
```

`js/pollo.js` guadagna un `ascoltaLurk()` gemello di `ascoltaPlayer()` e un elenco `frasi.lurk`.
Poche righe: il pollo non si gonfia.

### 5.3 Ordine di caricamento

`js/lurk.js` va **prima** di `js/pollo.js`: lurk si iscrive a `window.Player` (già caricato), il
pollo si iscrive a `window.Lurk` (che deve quindi esistere).

```html
<link rel="stylesheet" href="css/pollo.css">
<link rel="stylesheet" href="css/lurk.css">
...
<script src="js/dati.js"></script>
<script src="https://embed.twitch.tv/embed/v1.js"></script>
<script src="js/player.js" defer></script>
<script src="js/sito.js"   defer></script>
<script src="js/lurk.js"   defer></script>
<script src="js/pollo.js"  defer></script>
```

---

## 6. Configurazione (agente 6)

### 6.1 `contenuti.json` → `config.lurk`

```json
"lurk": {
  "attivo": true,
  "tieniSchermoAcceso": false,
  "oreMax": 3,
  "messaggioAttivo": false,
  "clientId": "",
  "urlRitorno": "",
  "frasi": ["Hey! Lurko dal sito.", "..."]
}
```

### 6.2 `contenuti.json` → `testi`

`lurk.titolo`, `lurk.spiegazione`, `lurk.notaAccount`, `lurk.notaMobile`, `lurk.accendi`,
`lurk.spegni`, `lurk.audio`, `lurk.statoSpento`, `lurk.statoVivo`, `lurk.statoFermo`,
`lurk.statoRiparto`, `lurk.statoBloccato`, `lurk.statoAttesa`, `lurk.statoResa`,
`lurk.ciSei`, `lurk.ciSono`, `lurk.entra`, `lurk.esci`, `lurk.manda`, `lurk.conferma`,
`lurk.annulla`, `lurk.altraFrase`, `lurk.inviato`.

**Regola dei tipi (CONTRATTO-2 §7.1), da rispettare alla lettera:**

- `ricco` **solo** `lurk.spiegazione`, `lurk.notaAccount`, `lurk.notaMobile` — stampate dal
  modello con la tripla graffa e mai lette dal JavaScript;
- **`testo` tutto il resto**, e in particolare **tutti gli stati**: li scrive `js/lurk.js` con
  `textContent`, quindi l'HTML verrebbe stampato letterale. Stesso motivo per cui
  `deck.statoLive` e `saluti.copiaBtn` sono rimasti `testo`.

### 6.3 Il gruppo nello schema

Va inserito **fra `diretta` e `pollo`**: segue l'ordine della pagina (CONTRATTO §7). Usa solo
tipi già esistenti — `interruttore`, `testo`, `url`, `numero`, `elencoTesti`, `ricco` — perciò
**`pannello/` non si tocca**.

Aiuti obbligatori: su `clientId` va detto che è pubblico per natura e **che il client secret non
va messo lì né altrove**; su `urlRitorno` che deve combaciare carattere per carattere con quello
registrato su Twitch; su `frasi` la regola del §4.2; su `messaggioAttivo` che **non aumenta il
numero di spettatori**.

### 6.4 `js/dati.js` (agente 4)

Una `lurkDi(config, testi)` modellata su `polloDi()`. **`server/modelli/dati.js.tpl` non si
tocca**: stampa già tutto l'oggetto, cambia solo chi lo riempie.

Invarianti **imposte in generazione**, non nel browser:

- `messaggio.attivo` è vero **solo se** `messaggioAttivo === true` **e** `clientId` non è vuoto
  **e** almeno una frase non è vuota;
- `oreMax` viene riportato entro 1..12.

`js/lurk.js` **rifà comunque** i controlli: `js/dati.js` è un file che si può modificare a mano
dopo la generazione, e un freno che vive solo dove non gira non è un freno.

---

## 7. Degrado

| Situazione | Cosa succede |
|---|---|
| **Senza JavaScript** | restano titolo, spiegazione e note. `#lurk-comandi` è vuoto: nessun bottone morto |
| **`config.lurk.attivo` falso** | il parziale non viene incluso; `js/lurk.js` non trova `#lurk` e si disinnesca |
| **`clientId` vuoto** | il blocco B sparisce, A funziona normalmente. **È lo stato di partenza** |
| **SDK bloccato / `file://`** | `modalita !== 'sdk'` → il lurk dice che non ha i comandi del player e si spegne |
| **`http://` non locale** | il blocco B si spegne: Twitch esige HTTPS per il `redirect_uri` |
| **`prefers-reduced-motion`** | nessuna animazione; il cambio di testo resta |
| **320–2560 px** | fascia a righe che si impila, mai una griglia rigida |

---

## 8. Qualità — invariata e non negoziabile

Vale tutto il §12 del CONTRATTO e il §12 del CONTRATTO-2. In più, specifico di questa fase:

- **Nessuna promessa di «zero buchi»**: i `minute-watched` viaggiano a ~60 s, quindi fra la morte
  della sessione e il riavvio riuscito passa comunque fino a un minuto. Il pannello non deve
  raccontare altro.
- **Il caso mobile si dichiara, non si nasconde**: il browser mette in pausa appena si esce dalla
  scheda e da qui non si rimedia. Il bottone non si nasconde su mobile.
- **La riga sull'account si scrive**: se i cookie di terze parti sono bloccati, dentro l'embed
  l'utente conta per il canale ma non per i propri punti e streak, e il sito non può nemmeno
  rilevarlo. Va detto, e va offerto il collegamento a Twitch.
- Ogni blocco JS si disinnesca da solo se il suo elemento non esiste.
- Commenti in italiano che spiegano il perché. Tono asciutto.
