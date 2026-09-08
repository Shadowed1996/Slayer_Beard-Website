# CONTRATTO 2 — seconda fase, sito slayer_beard

Addendum vincolante al `CONTRATTO.md`, che **resta valido in tutto** (niente npm, niente
framework, niente CDN oltre Google Fonts ed `embed.twitch.tv`, Node >= 18 con soli moduli
interni, `path.join` su Windows, tutto in italiano, nessun `TODO`, nessun placeholder,
commenti che spiegano il *perché*).

Gli agenti lavorano **in parallelo su file disgiunti**. I nomi qui sotto sono l'unica cosa
che tiene insieme il lavoro: si rispettano alla lettera.

---

## 0. Cosa ha chiesto il committente

1. **Il pollo va spostato.** Adesso sbuca da dietro il player, dove non serve a niente.
   Va messo dove ha un senso e deve **reagire quando qualcuno scrive in chat**.
2. **Serve un backend che permetta di cambiare tutto il sito**: colori, testi, font,
   grassetto, `<br>` e in generale un po' di HTML nei testi. Deve venire fuori una cosa
   pulita, non un pannello con le toppe.
3. **Il player è troppo piccolo**: gli si dedica una sezione tutta sua.

---

## 1. Proprietà dei file — chi scrive cosa

| Agente | File di sua ESCLUSIVA proprietà |
|---|---|
| **1 — DIRETTA** | `modelli/parziali/regia.html`, `modelli/parziali/diretta.html` (nuovo), `modelli/parziali/binario.html`, `css/regia.css`, `css/diretta.css` (nuovo), `css/base.css` |
| **2 — POLLO** | `modelli/parziali/pollo.html` (nuovo), `css/pollo.css` (nuovo), `js/pollo.js` (nuovo), `js/sito.js` |
| **3 — PLAYER** | `js/player.js`, `css/player.css` |
| **4 — SERVER** | `server/lib/tema.js` (nuovo), `server/lib/costruisci.js`, `server/lib/api.js`, `server/lib/percorsi.js`, `server/lib/backup.js`, `server/genera.js`, `server/server.js`, `server/modelli/dati.js.tpl` |
| **5 — RICCO** | `server/lib/testoricco.js` (nuovo), `server/lib/convalida.js` |
| **6 — SCHEMA** | `contenuti/schema.js`, `contenuti/contenuti.json`, `modelli/parziali/chi.html`, `modelli/parziali/settimana.html`, `modelli/parziali/supporto.html`, `modelli/parziali/saluti.html`, `modelli/parziali/piede.html` |
| **7 — CAMPI** | `pannello/moduli/campi.js`, `pannello/moduli/ricco.js` (nuovo), `pannello/moduli/tema.js` (nuovo), `pannello/campi.css` (nuovo) |
| **8 — PANNELLO** | `pannello/index.html`, `pannello/pannello.js`, `pannello/pannello.css`, `pannello/moduli/api.js`, `pannello/moduli/avvisi.js`, `pannello/moduli/dom.js`, `pannello/moduli/elenchi.js`, `pannello/moduli/media.js`, `pannello/moduli/backup.js` |
| **9 — DOCS** (seconda ondata) | `README.md`, `docs/PANNELLO.md`, `server/autotest.js` |
| **integratore** | `modelli/index.html`, `modelli/parziali/testa.html`, `CONTRATTO-2.md` |

`index.html`, `js/dati.js` e `css/tema.css` alla radice **non si scrivono a mano da nessuno**:
sono l'output della generazione. Nessuno lancia `node server/genera.js`: lo fa l'integratore
alla fine. Nessuno crea file oltre a quelli assegnati.

---

## 2. Struttura nuova della pagina

L'ordine delle sezioni diventa:

```
#regia      copertina: quadro comandi a tutta larghezza, SENZA player
#diretta    NUOVA: il player, grande, con la chat e il pollo accanto
#settimana  invariata
#chi        invariata
#supporto   invariato
#saluti     invariato
```

Il binario laterale ha quindi **sei** voci: Regia, Diretta, Settimana, Chi sono, Supporto,
Saluti. Devono starci anche a 360 px (dock in basso): se sei voci non ci stanno con le
etichette, sotto una certa larghezza restano i punti e le etichette si accorciano, mai un
menu a panino.

### 2.1 `#regia` — la copertina senza monitor (agente 1)

Il monitor se ne va nella sezione nuova. La copertina diventa una vera copertina a tutta
larghezza. Gli `id` obbligatori restano invariati (`#titolo`, `#spia-grande`, `#stato-testo`,
`#conto`, `#ultima`): il JS ci si appoggia.

```
section#regia.regia[aria-labelledby="titolo"]
  .regia__sfondo[aria-hidden="true"] > img
  .regia__griglia
    .quadro
      p.quadro__occhiello                {{deck.occhiello}}
      h1#titolo.quadro__titolo           {{deck.titolo}}
      p.quadro__sottotitolo              {{{deck.sottotitolo}}}      <- testo ricco
      .quadro__stato[role="group"][aria-label="{{deck.etichettaStato}}"]
        p.stato__riga > span#spia-grande.spia[aria-hidden] + span#stato-testo
        dl.stato__dati
          dt {{deck.etichettaProssima}} + dd > time#conto.conto
          dt {{deck.etichettaUltima}}   + dd#ultima
      .quadro__azioni
        a.btn.btn--pieno[href="{{sito.urlCanale}}"]  {{deck.ctaPrimaria}}
        a.btn.btn--vuoto[href="#diretta"]            {{deck.ctaSecondaria}}
    ul.quadro__dati > li.dato > b.dato__valore + span.dato__etichetta     (4 righe)
  a.regia__scorri[href="#diretta"] > span + svg
```

Il secondo bottone e la freccia di scorrimento puntano a **`#diretta`**, non più a
`#settimana`. Senza il monitor la colonna destra resta vuota: la copertina va **ridisegnata**
perché regga a tutta larghezza (per esempio i quattro numeri in fascia orizzontale sotto al
quadro, il fondale più presente). Non deve sembrare una pagina a cui è stato tolto un pezzo.

### 2.2 `#diretta` — la sezione del player (agente 1 per il guscio)

```
section#diretta.diretta[aria-labelledby="diretta-titolo"]
  .diretta__testa
    p.sezione__occhiello                 {{diretta.occhiello}}
    h2#diretta-titolo.sezione__titolo    {{diretta.titolo}}
    p.sezione__testo                     {{{diretta.testo}}}
  .diretta__scena                        <- position: relative, è il contesto del pollo
    .monitor
      .monitor__telaio
        .monitor__barra
          span.monitor__punti[aria-hidden]  (3 svg)
          span#monitor-titolo.monitor__titolo   {{marchio.nome}}
          span#monitor-badge.monitor__badge[hidden]   LIVE
        .monitor__schermo > #twitch-embed.monitor__video      <- VUOTO, lo riempie l'agente 3
        #monitor-lato.monitor__lato[hidden] > #twitch-chat.monitor__chat  <- VUOTO, agente 3
        .monitor__piede
          button#chat-toggle[type=button][aria-expanded="false"][aria-controls="twitch-chat"]
          p.monitor__nota                 {{deck.notaPlayer}}
          a#apri-twitch.monitor__link[href="{{sito.urlCanale}}"]
    {{> parziali/pollo}}                 <- ultimo figlio della scena
  p.diretta__nota                        {{{diretta.nota}}}
```

**Il player deve essere grande.** La scena occupa fino a `--max-larghezza`, il video sta in
16/9 pieno, e a chat aperta (da 1000 px in su) la chat è una colonna laterale **dentro** il
telaio senza far scendere il video sotto i tre quarti della larghezza. Il monitor non è più
schiacciato in una colonna da 66 %: è il protagonista della sezione.

`.diretta__scena` dichiara `--pollo-larghezza` e **riserva lo spazio** del pollo
(`padding-inline-end`) da 1100 px in su. `css/diretta.css` non scrive nient'altro su `.pollo*`.

### 2.3 Il pollo (agente 2)

`modelli/parziali/pollo.html` produce esattamente:

```
.pollo#pollo[data-stato="riposo"]
  .pollo__fumetto#pollo-fumetto[aria-hidden="true"][hidden] > span.pollo__testo
  button#pollo-bottone.pollo__bottone[type="button"][aria-label="{{pollo.etichetta}}"]
    img.pollo__img[src="{{config.immagini.mascotte}}"][alt=""][aria-hidden="true"]
  button#pollo-chiudi.pollo__chiudi[type="button"][aria-label="{{pollo.nascondi}}"]
```

`css/pollo.css` possiede **tutto** ciò che riguarda `.pollo*`, posizionamento compreso: si
appoggia a `.diretta__scena` (relative) e a `--pollo-larghezza`. Vincoli non negoziabili:

- il pollo **non copre mai il video né i comandi del piede**, a nessuna larghezza;
- sotto i 1100 px sta sotto o al lato del telaio senza sovrapporsi ai comandi;
- niente scroll orizzontale a nessuna larghezza, da 320 px a 2560 px;
- `prefers-reduced-motion: reduce` ferma ogni animazione (resta il cambio di testo);
- il fumetto è `aria-hidden="true"`: i messaggi di chat **non** vanno annunciati dallo screen
  reader, sarebbe uno spam continuo. L'unica cosa esposta è il bottone, con la sua etichetta.

---

## 3. Comportamento del pollo — `js/pollo.js` (agente 2)

Il pollo è una mascotte che **reagisce alla chat**. Tre sorgenti, in ordine di importanza.

### 3.1 I messaggi veri della chat del canale — IRC anonimo

Twitch espone la chat in sola lettura via WebSocket, senza autenticazione e senza cookie:

```
wss://irc-ws.chat.twitch.tv:443
> CAP REQ :twitch.tv/tags
> NICK justinfan<numero a caso>
> JOIN #<canale>
< PING :tmi.twitch.tv          -> rispondere PONG :tmi.twitch.tv
< @badges=...;display-name=Tizio :tizio!tizio@tizio.tmi.twitch.tv PRIVMSG #canale :messaggio
```

Regole:

- si collega **solo** se `DATI.pollo.chatVera` è vero, e **solo** dopo che `#diretta` è stata
  vista almeno una volta (`IntersectionObserver`): non si apre una socket a chi atterra sulla
  pagina e non scende mai;
- si chiude su `pagehide` e quando la pagina resta nascosta (`visibilitychange`) per più di
  un minuto; riconnessione con attesa crescente (1s, 2s, 4s, 8s, 16s) e **massimo 5 tentativi**,
  poi si arrende in silenzio. Se la socket non parte non deve succedere assolutamente niente:
  il pollo continua a funzionare con le altre sorgenti;
- **al massimo una reazione ogni 2,5 secondi**: la chat può arrivare a raffica, il pollo no.
  Si tiene solo l'ultimo messaggio della finestra;
- `DATI.pollo.mostraMessaggi` falso (predefinito): nel fumetto va **solo** una frase presa da
  `frasi.chat`, con `{nome}` sostituito dal `display-name` dell'autore. Vero: si mostra anche
  il testo del messaggio, ma **sempre** scritto con `textContent`, troncato a 80 caratteri,
  con gli URL tolti. Mai `innerHTML` con roba che arriva dalla chat.

### 3.2 Il visitatore che scrive nella chat incorporata

L'iframe di Twitch è di un altro dominio: **non si possono leggere i tasti né sapere se il
messaggio è stato inviato davvero**. Quello che si può sapere, e che basta, è che il fuoco è
finito dentro l'iframe della chat. Lo dice l'agente 3 con `window.Player.suChat(fn)` (§6.2):
quando `scrive` diventa vero il pollo passa allo stato `scrive` e dice una frase di
`frasi.scrive`; quando torna falso dopo che ci è rimasto almeno due secondi, dice una frase di
`frasi.chat`. **Commentare nel codice che è una deduzione, non una certezza**: mentire nei
commenti è peggio che non avere la funzione.

### 3.3 Stato del canale e clic

- `window.Player.suStato(fn)`: in onda -> stato `live` e una frase di `frasi.live`; fuori onda
  -> stato `riposo` e una frase di `frasi.offline` (una volta sola, non a ripetizione).
- Clic sul pollo: dice una frase di `frasi.click` **e** apre la chat (`#chat-toggle`), che è la
  cosa utile che ci si aspetta da un pulsante a forma di pollo messo accanto alla chat.
- `#pollo-chiudi` nasconde il pollo e ricorda la scelta in `localStorage`
  (`sb-pollo-nascosto`), con `try/catch` perché in navigazione privata può lanciare.
- Parallasse col mouse <= 12 px, ripresa da `sito.js` (che perde la sua funzione `mascotte()`),
  spenta con `prefers-reduced-motion` e su touch.

Stati in `data-stato`: `riposo`, `live`, `scrive`, `parla`, `contento`. Il CSS ci attacca le
animazioni; il JS non scrive stili inline se non la parallasse (`translate`).

Se `DATI.pollo.attivo` è falso, `js/pollo.js` non fa niente e il pollo non compare.

---

## 4. Testi e configurazione nuovi — `contenuti/contenuti.json` (agente 6)

Chiavi **esatte**, nessuno le inventa diverse.

### 4.1 In `testi` (stringhe piatte)

```
"nav.diretta":        "Diretta"
"diretta.occhiello":  "In onda"
"diretta.titolo":     "La diretta"
"diretta.testo":      (una o due righe che presentano il player)
"diretta.nota":       (riga sotto al player: cosa fare se non parte)
"pollo.etichetta":    "Apri la chat del canale"        <- aria-label del bottone
"pollo.nascondi":     "Nascondi il pollo"
```

`deck.mascotteAlt` sparisce e basta: **non viene sostituita**. Una prima stesura di questo
addendum prevedeva `pollo.alt` al suo posto, ma il disegno del pollo sta dentro un bottone che
ha già il suo nome accessibile (`pollo.etichetta`): un `alt` in più farebbe annunciare due
volte la stessa cosa, e in pannello sarebbe un campo che si modifica senza che cambi niente.
L'immagine resta decorativa (`alt=""`, `aria-hidden`).

`deck.ctaSecondaria` cambia valore: da «Vedi la settimana» a «Guarda la diretta».
`deck.mascotteAlt` va **rimosso** da `contenuti.json` e dallo schema, come spiegato qui sopra.

### 4.2 In `config`

```json
"tema": {
  "colori": {
    "viola": "#8b2fff", "violaCupo": "#4b1391", "violaChiaro": "#c5a4ff",
    "ciano": "#22e0ff", "magenta": "#ff2fa0",
    "live": "#ff3d5e", "ok": "#35e0a1", "allerta": "#ffc65c",
    "fondo": "#07070c", "testo": "#f2f0f8", "testoMedio": "#c3bdd6", "testoTenue": "#9a93b0"
  },
  "font":  { "titolo": "Space Grotesk", "testo": "Manrope", "mono": "JetBrains Mono" },
  "forma": { "raggio": 14, "maxLarghezza": 1360, "passo": 8 },
  "sfondo": { "aloni": 100 }
},
"pollo": {
  "attivo": true,
  "chatVera": true,
  "mostraMessaggi": false,
  "frasi": {
    "riposo":  ["..."],
    "click":   ["..."],
    "chat":    ["{nome} ha scritto in chat!", "..."],
    "scrive":  ["Ti ascolto..."],
    "live":    ["Siamo in onda!"],
    "offline": ["Zzz... si riparte alle 21:00."]
  }
}
```

I valori di partenza li sceglie l'agente 6: frasi in italiano, tono del canale (il pollaio, il
verso del pollo), da tre a sei per elenco, nessuna vuota. `{nome}` è l'unico segnaposto
ammesso e vale solo dentro `frasi.chat`.

---

## 5. Tipi di campo nuovi (agenti 5, 6, 7)

Ai tipi esistenti (`testo`, `testolungo`, `url`, `email`, `numero`, `immagine`, `orario`,
`orari`, `scelta`, `elencoTesti`, `elenco`) se ne aggiungono **quattro**, con questi nomi
esatti:

| tipo | valore in JSON | convalida (agente 5) | pannello (agente 7) |
|---|---|---|---|
| `ricco` | stringa con HTML ristretto | §7 | editor con barra: grassetto, corsivo, link, a capo, pulisci, codice |
| `colore` | stringa `#rrggbb` | esadecimale a 6 cifre | selettore colore + casella esadecimale + rapporto di contrasto |
| `font` | nome della famiglia | deve stare nel catalogo di `server/lib/tema.js` per quello slot | menu con anteprima scritta nel font vero |
| `interruttore` | booleano | `true`/`false`, niente stringhe | interruttore, non una casella nuda |

`campo.max` su un campo `ricco` conta i **caratteri visibili**, non i tag.

---

## 6. Interfacce fra agenti — firme esatte

### 6.1 `server/lib/testoricco.js` (agente 5) — lo usa l'agente 4

```js
module.exports = {
  // Ripulisce il testo tenendo solo i tag ammessi. Non lancia mai: quello che
  // non è ammesso sparisce, il testo resta. È la funzione che gira in generazione.
  sanifica(html),                       // -> stringa sicura da mettere in pagina grezza
  // Elenco dei problemi trovati, in italiano, per la convalida del pannello.
  problemi(html, { etichetta }),        // -> [ 'messaggio', ... ]
  // Il testo senza tag, per contare i caratteri e per gli attributi.
  soloTesto(html),                      // -> stringa
  TAG_AMMESSI                           // -> { b: [], a: ['href','title'], ... }
};
```

### 6.2 `window.Player` (agente 3) — lo usa l'agente 2

```js
window.Player = {
  suStato(fn),   // fn({ inOnda, titolo })  — già esistente, non cambia.
                 // ATTENZIONE: riceve un OGGETTO, non un booleano (una prima
                 // stesura di questo addendum diceva il contrario). Chi si
                 // iscrive legge `s.inOnda`: un oggetto è sempre truthy, e
                 // trattarlo come booleano vuol dire risultare sempre in onda.
  suChat(fn)     // fn({ aperta: boolean, scrive: boolean, montata: boolean })
                 // NUOVA: chiamata a ogni cambio; `scrive` è vero mentre il
                 // fuoco sta dentro l'iframe della chat (window blur +
                 // document.activeElement === iframe).
};
```

Entrambe chiamano subito la funzione con lo stato corrente al momento dell'iscrizione, così
chi si iscrive tardi non resta cieco.

### 6.3 `window.DATI` (agente 4) — forma estesa

Resta tutto quello che c'è già (`twitch`, `orari`, `email`, `ultimaDiretta`, `testi`), e si
aggiunge:

```js
window.DATI.pollo = {
  attivo: true,
  chatVera: true,
  mostraMessaggi: false,
  frasi: { riposo: [], click: [], chat: [], scrive: [], live: [], offline: [] },
  testi: { etichetta: '...', nascondi: '...' }
};
```

### 6.4 `server/lib/tema.js` (agente 4)

```js
module.exports = {
  css(tema),          // -> il contenuto completo di css/tema.css (stringa)
  CATALOGO_FONT,      // -> { titolo: [famiglia...], testo: [...], mono: [...] }, ogni voce
                      //    { nome, pesi: [...], ripiego: 'stack di sistema', categoria }
  PRESET,             // -> [ { id, nome, tema } ] combinazioni pronte
  urlGoogleFonts(tema),   // -> URL css2 con le famiglie scelte, oppure '' se sono di sistema
  PREDEFINITO         // -> l'oggetto tema di partenza (quello del §4.2)
};
```

---

## 7. Testo ricco — l'HTML ammesso

Solo questi tag, solo questi attributi. Tutto il resto viene **tolto** (il contenuto testuale
resta), e i `<` avanzati vengono trasformati in `&lt;`.

```
b  strong  i  em  u  s  br  small  mark  sup  sub  code  abbr[title]
span[class]     con class fra: evidenza, tenue, mono
a[href,title]   href: http, https, mailto o percorso relativo; niente javascript:, data:, //
```

Regole:

- niente tag di blocco (`div`, `p`, `h1`...): i testi stanno dentro elementi che li hanno già;
- gli `<a>` verso l'esterno ricevono `target="_blank" rel="noopener noreferrer"` in generazione;
- i tag si chiudono: un `<b>` lasciato aperto viene chiuso dal sanificatore, non lasciato lì;
- `<br>` è ammesso ed è il motivo principale per cui questa roba esiste;
- **la sanificazione avviene in generazione** (agente 4, dentro `costruisci.js`): il contesto
  del modello contiene già i valori sicuri, e il modello li stampa con `{{{...}}}`.
  Un valore `ricco` non sanificato non deve poter finire in pagina.

### 7.1 Quali chiavi sono di tipo `ricco`

Lo dichiara lo schema (agente 6) e i modelli devono stamparle con la tripla graffa:

```
deck.sottotitolo          (agente 1)
diretta.testo             (agente 1)
diretta.nota              (agente 1)
settimana.testo           (agente 6)
settimana.nota            (agente 6)
chi.apertura              (agente 6)
chi.corpo1                (agente 6)
chi.corpo2                (agente 6)
chi.citazione             (agente 6)
chi.nota1Testo  chi.nota2Testo  chi.nota3Testo   (agente 6)
supporto.testo            (agente 6)
supporto.chiusura         (agente 6)
saluti.testo              (agente 6)
saluti.contattiTesto      (agente 6)
saluti.chiusura           (agente 6)
footer.disclaimer         (agente 6)
footer.nota               (agente 6)
config.supporto[].testo   (agente 6, dentro l'elenco)
```

**Restano di tipo `testo`/`testolungo`** (niente HTML) tutte le chiavi che finiscono in un
attributo o in `js/dati.js`: `meta.*`, `pollo.alt`, gli `alt` delle immagini, le etichette dei
bottoni, `deck.statoLive/statoOffline/statoVerifica`, `deck.chatApri/chatChiudi`,
`settimana.etichetta*`, `saluti.copiaBtn/copiaFatto`, i titoli.

---

## 8. Il tema — `css/tema.css`, generato (agente 4)

Nuovo file **generato** insieme a `index.html` e `js/dati.js`, caricato **subito dopo**
`css/tokens.css`, che resta il valore di partenza. `tema.css` contiene un solo blocco `:root`
che riscrive i token, con in testa il commento «file generato, non si modifica a mano».

Token da riscrivere, tutti derivati dai colori scelti (niente valori fissi nascosti):

```
--viola --viola-cupo --viola-chiaro --ciano --magenta --live --ok --allerta
--fondo --fondo-2 --pannello --pannello-2 --velo
--linea --linea-forte --linea-comando --linea-viva
--testo --testo-medio --testo-tenue
--grad-pagina --grad-titolo --grad-pannello
--bagliore-viola --bagliore-ciano
--font-titolo --font-testo --font-mono
--raggio --raggio-s --raggio-g --max-larghezza --passo
```

Obblighi:

- `--twitch` **non** si tocca: è il viola ufficiale di Twitch, è un marchio altrui.
- `--grad-pagina` si ricompone dai colori scelti e dall'intensità `sfondo.aloni`
  (0 = fondo piatto, 100 = come adesso, 200 = doppio). Le code restano `rgba(...,0)`, mai
  `transparent`.
- **Polarità automatica**: le linee e i vetri dei pannelli oggi sono bianchi con alpha perché
  il fondo è nero. Se chi amministra sceglie un fondo chiaro (luminanza relativa > 0,5) le
  linee e i veli devono diventare **scuri**, altrimenti spariscono. Si calcola la luminanza
  relativa del colore di fondo e si sceglie la polarità di conseguenza.
- I font finiscono in `--font-*` **con il loro stack di ripiego di sistema** dietro.
- `forma.raggio` guida `--raggio`, e da lì `--raggio-s` (circa 0,57x) e `--raggio-g` (circa 1,57x).

`modelli/parziali/testa.html` (integratore) carica i font da `{{sito.fontUrl}}`, che l'agente 4
mette nel contesto: URL `css2` con le famiglie scelte e i pesi del catalogo, `display=swap`.
Se sono tutte di sistema, `sito.fontUrl` è una stringa vuota e il modello non stampa il `<link>`.

---

## 9. API — cosa si aggiunge (agente 4)

| Metodo e percorso | Fa |
|---|---|
| `POST /api/anteprima` | corpo `{ contenuti }`: rende l'HTML dei contenuti **non ancora salvati**, senza scrivere niente. Serve all'anteprima dal vivo del pannello. Se il modello non riesce a rendere, `422` con il messaggio in italiano. |
| `POST /api/tema` | corpo `{ tema }`: risponde `{ css }` con il foglio del tema calcolato, senza salvarlo. Serve all'anteprima immediata dei colori. |

`GET /api/contenuti` guadagna la chiave
`tema: { font: CATALOGO_FONT, preset: PRESET, predefinito: PREDEFINITO }`.
`predefinito` non era nella prima stesura: senza, il bottone «ripristina i colori di partenza»
del pannello potrebbe solo rimettere i valori trovati all'apertura della pagina, che è un'altra
cosa e prima o poi inganna chi amministra.
`GET /api/anteprima` resta com'è.
La pubblicazione (§6.4 del contratto originale) scrive **tre** file: `index.html`, `js/dati.js`
e `css/tema.css`, e il backup ne conserva tre più `contenuti.json`.

Tutte le rotte nuove: sessione obbligatoria, `Origin` estraneo rifiutato, errori
`{ errore: "..." }` in italiano.

---

## 10. Pannello — cosa deve avere in più (agenti 7 e 8)

Il pannello **continua a non sapere niente dei campi**: li costruisce dallo schema. Le novità:

1. **Editor di testo ricco** (`pannello/moduli/ricco.js`): `contenteditable` con barra —
   Grassetto (`Ctrl+B`), Corsivo (`Ctrl+I`), Sottolineato, Link, A capo (`<br>`), Pulisci
   formattazione, e un interruttore **Codice HTML** che mostra il sorgente in una `textarea`.
   L'incolla va ripulito con la stessa lista del §7 (mai `innerHTML` col dato incollato).
   Contatore dei caratteri visibili. Nessuna libreria, nessun CDN.
2. **Gruppo «Aspetto»**: colori con selettore e casella esadecimale, **rapporto di contrasto
   calcolato e mostrato** (AA/AAA, con avviso quando scende sotto 4,5:1 per il testo), font
   con anteprima nel font vero, forma e intensità degli aloni, i **preset** e un bottone
   «ripristina i colori di partenza». I font di anteprima si caricano da Google Fonts, che è
   l'unico CDN ammesso.
3. **Anteprima dal vivo**: l'iframe usa `POST /api/anteprima` con i contenuti **in modifica**
   (non solo quelli salvati) e, per i colori, inietta il CSS di `POST /api/tema`. Deve
   aggiornarsi senza pubblicare e senza salvare.
4. **Ricerca dei campi**: una casella che filtra i campi per etichetta e porta al gruppo giusto.
   Con quaranta e passa campi, scorrere i gruppi a mano non basta più.
5. Resta tutto quello che c'è già: Salva diverso da Pubblica, modifiche non salvate sempre
   visibili, `Ctrl+S`, errori sul campo che li ha causati, media, backup, 360 px, tastiera,
   `prefers-reduced-motion`.

`pannello/campi.css` è nuovo e contiene **solo** gli stili dei widget nuovi
(`.ricco__*`, `.colore__*`, `.font__*`, `.interruttore__*`). L'agente 8 lo collega in
`pannello/index.html` dopo `pannello.css`.

### 10.1 Confine esatto fra agente 7 e agente 8

- `pannello/moduli/campi.js` **conserva tutti gli export che ha oggi**, con la stessa firma
  (`creaCampo`, `leggiChiave`, `scriviChiave`, `clona`, `uguali`, `guscio`, `valoreVuoto`,
  `valoreOpzione`, `etichettaOpzione`, `erroreLocale`, `attaccaErrore`, `chiaveRelativa`,
  `GIORNI`): li usano `elenchi.js`, `media.js` e `pannello.js`, che sono dell'agente 8.
  I tipi nuovi entrano dentro `creaCampo`, e il pannello se li ritrova senza saperne niente.
- `pannello/moduli/tema.js` (agente 7) è **solo DOM e matematica, niente fetch**:
  ```js
  export function creaBarraTema(ctx, { preset, onApplica })  // -> nodo con i preset e il ripristino
  export function contrasto(coloreA, coloreB)                // -> rapporto WCAG (numero)
  export function etichettaContrasto(rapporto)               // -> { livello, testo, grave }
  export function precaricaFont(nomi)                        // -> carica da Google Fonts le anteprime
  ```
  Le chiamate a `POST /api/tema` e `POST /api/anteprima` le fa l'agente 8 in `pannello.js`.
- Il gruppo dei colori nello schema (agente 6) ha `id: 'aspetto'`; il gruppo del pollo ha
  `id: 'pollo'`. L'agente 8 mette `creaBarraTema` in cima al gruppo `aspetto` e basta: tutto
  il resto del gruppo lo disegna lo schema come qualsiasi altro.

---

## 11. Ordine di caricamento aggiornato (lo scrive l'integratore)

```html
<link rel="stylesheet" href="css/tokens.css">   <!-- valori di partenza -->
<link rel="stylesheet" href="css/tema.css">     <!-- GENERATO: li riscrive -->
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/regia.css">
<link rel="stylesheet" href="css/diretta.css">
<link rel="stylesheet" href="css/sezioni.css">
<link rel="stylesheet" href="css/player.css">
<link rel="stylesheet" href="css/pollo.css">
...
<script src="js/dati.js"></script>
<script src="https://embed.twitch.tv/embed/v1.js"></script>
<script src="js/player.js" defer></script>
<script src="js/sito.js" defer></script>
<script src="js/pollo.js" defer></script>
```

**Nessun file oltre a `tokens.css` e `tema.css` contiene un colore esadecimale.**

---

## 12. Qualità — invariata e non negoziabile

- Nessuno scroll orizzontale da 320 px a 2560 px.
- Contrasti WCAG AA, focus visibile, skip link, landmark corretti, un solo `<h1>`.
- `prefers-reduced-motion: reduce` ferma animazioni e parallasse.
- Il sito regge **senza JavaScript**: si perdono player, conto alla rovescia, scrollspy e
  pollo, non i contenuti.
- Niente `!important` se non contro gli stili dell'iframe di Twitch, con **una** eccezione
  ammessa dopo la revisione: `[hidden] { display: none !important }` nel pannello. Senza, il
  `display` dichiarato da una classe batte l'attributo `hidden` del browser e restano a video
  cose che dovrebbero sparire (il corpo delle voci pieghevoli, la barra del link dell'editor
  ricco). È il rimedio standard, vale una riga sola, e toglierlo per rispettare la lettera del
  contratto peggiorerebbe il pannello. Va sempre accompagnato dal commento che dice perché.
- Ogni blocco JS si disinnesca da solo se il suo elemento non esiste.
- Commenti in italiano che spiegano il perché. Tono asciutto.
