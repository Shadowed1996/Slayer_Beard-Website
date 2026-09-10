# CONTRATTO — sito slayer_beard, seconda costruzione

> **Leggi prima [`CONTRATTO-2.md`](CONTRATTO-2.md).** Questo documento descrive la costruzione
> del sito e resta valido nelle sue regole (§0, §12 su tutte), ma su tre punti è **superato**
> dall'addendum della seconda fase, che ha aggiunto la sezione `#diretta`, il pollo, il tema
> modificabile e il testo ricco:
>
> - §6 — i file generati sono **tre**, non due: `index.html`, `js/dati.js` e `css/tema.css`;
> - §7 — i gruppi dello schema sono **quindici**: `meta, marchio, deck, diretta, account, lurk,
>   pollo, clip, settimana, chi, supporto, saluti, piede, canale, aspetto` — `account` e `lurk`
>   sono arrivati con la terza fase, `clip` dopo — e ai tipi di campo se ne sono aggiunti
>   quattro (`ricco`, `colore`, `font`, `interruttore`). Vale ancora che lo schema copre
>   esattamente `contenuti.json`, con **una** eccezione dichiarata: i rami che riempie il server
>   a ogni pubblicazione (`GENERATI` in `contenuti/schema.js`), che non hanno un campo perché
>   una casella riscritta a ogni Pubblica sarebbe peggio di nessuna casella;
> - §8 — l'API ha due rotte in più, `POST /api/anteprima` e `POST /api/tema`, e la porta si
>   cambia con `SB_PORTA` (qui sotto è scritto `SB_PORT`, che non è mai esistito nel codice).

Documento vincolante. Sei agenti lavorano **in parallelo su file disgiunti**.
I nomi qui sotto vanno rispettati alla lettera: sono l'unica cosa che tiene insieme il lavoro.

---

## 0. Regole assolute

- Scrivi **solo** i file di tua proprietà (§1). Non toccare gli altri, nemmeno per una virgola.
- Niente npm, niente build tool, niente framework, niente CDN **tranne Google Fonts** e
  `embed.twitch.tv`. Node ≥ 18, solo moduli interni (`node:http`, `node:fs`, `node:path`,
  `node:crypto`, `node:url`, `node:zlib`).
- Il progetto gira su **Windows** (`path.join`, mai `/` concatenate a mano) ma deve funzionare
  anche su Linux e macOS.
- Tutto in **italiano**: interfaccia, messaggi, commenti, documentazione. `lang="it"`.
- Nessun placeholder, nessun `TODO`, nessun `lorem ipsum`, nessuna funzione lasciata a metà.
- Commenta dove la scelta non è ovvia, spiegando **perché**, non ripetendo cosa fa la riga.
  Tono asciutto, niente entusiasmo.
- Non creare file oltre a quelli assegnati.

### 0.1 Da dove veniamo — cosa NON rifare

La prima versione del sito sta in `C:\Users\Filippo\Desktop\sito-backup\` (sola lettura, non
scrivere lì). Era modellata troppo da vicino su babbalucy.it: **barra di navigazione orizzontale
in alto, hero centrato sopra il banner, sezioni impilate tutte uguali (occhiello + titolo +
testo + griglia di card), orari come griglia di 7 card, supporto come griglia di card, social
come griglia di card.**

Quel ritmo è vietato. La struttura nuova è descritta in §2 e §5: leggila e seguila.
Puoi consultare il backup per i **dati reali**, per il **player Twitch** (logica collaudata) e
per lo stile dei commenti. Non copiarne il layout.

---

## 1. Proprietà dei file

| Agente | File di sua ESCLUSIVA proprietà |
|---|---|
| **A — MODELLI** | `modelli/index.html`, `modelli/parziali/*.html`, `modelli/icone/*.svg` |
| **B — BASE** | `css/tokens.css`, `css/base.css` |
| **C — SEZIONI** | `css/regia.css`, `css/sezioni.css` |
| **D — JS** | `js/sito.js`, `js/player.js`, `css/player.css` |
| **E — BACKEND** | `server/**` (tutto), `contenuti/schema.js` |
| **F — PANNELLO** | `pannello/**` (tutto), `docs/PANNELLO.md` |
| (integratore) | `contenuti/contenuti.json`, `CONTRATTO.md`, `README.md`, `img/**` |

`index.html` e `js/dati.js` alla radice **non si scrivono a mano da nessuno**: sono l'output
della generazione (§6). Se ti sembra necessario modificarli, la risposta è no: si cambia il
modello, il contenuto, o il contratto.

`contenuti/contenuti.json` **esiste già ed è la verità**. Nessuno lo modifica: A ci legge le
chiavi, E ci legge la forma dei dati. Se manca una chiave che ti serve, segnalalo nel resoconto
finale invece di inventarla.

---

## 2. Il concetto — «REGIA»

Il sito è una **sala regia**: strumentazione, monitor, spie, etichette in monospazio.
Non è un volantino con le sezioni impilate.

Tre scelte strutturali che lo separano dalla versione precedente e dal reference:

1. **Nessuna barra in alto.** La navigazione è un **binario verticale fisso a sinistra**
   (desktop) che diventa un **dock galleggiante in basso** (mobile). Contiene marchio, le
   cinque voci, la spia dello stato del canale e i social in piccolo. Nessun menu a panino:
   cinque voci ci stanno anche su 360 px.
2. **Il player è la prima cosa che si vede**, dentro la copertina, non in una sezione a parte.
   La copertina è divisa in due colonne asimmetriche: a sinistra il **quadro comandi** (titolo,
   spia in onda, conto alla rovescia, strumentazione con i numeri del canale), a destra il
   **monitor** con dentro la diretta.
3. **Ogni sezione ha una forma sua.** La settimana è un **nastro orizzontale** a sette colonne,
   non una griglia di card. «Chi sono» è **editoriale**: testo a colonna larga, note a margine,
   citazione grande. Il supporto è un **listino a righe**, non card. La chiusura è una
   **schermata di fine diretta** con social e contatti insieme.

Palette e forme: grafite quasi nera, linee da 1 px, viola del marchio come accento, ciano per
tutto ciò che è «acceso», magenta col contagocce. Etichette maiuscole spaziate in monospazio.

---

## 3. Ordine di caricamento (il modello lo rispetta esattamente)

```html
<link rel="stylesheet" href="css/tokens.css">   <!-- B: variabili -->
<link rel="stylesheet" href="css/base.css">     <!-- B: reset, tipografia, bottoni, binario -->
<link rel="stylesheet" href="css/regia.css">    <!-- C: copertina, quadro, monitor -->
<link rel="stylesheet" href="css/sezioni.css">  <!-- C: settimana, chi, supporto, saluti, piede -->
<link rel="stylesheet" href="css/player.css">   <!-- D: interno del player e della chat -->
...
<script src="js/dati.js"></script>              <!-- generato: window.DATI -->
<script src="https://embed.twitch.tv/embed/v1.js"></script>
<script src="js/player.js" defer></script>
<script src="js/sito.js" defer></script>
```

`tokens.css` è primo: definisce le variabili, tutti gli altri le consumano con `var()`.
**Nessun file oltre a `tokens.css` contiene un colore esadecimale.**

---

## 4. Design token — B li DEFINISCE, gli altri li USANO

Nomi obbligatori (B può aggiungerne, non rinominarne):

```
/* superfici */      --fondo --fondo-2 --pannello --pannello-2 --velo
/* linee */          --linea --linea-forte --linea-viva
/* testo */          --testo --testo-medio --testo-tenue
/* marchio */        --viola --viola-cupo --twitch --ciano --magenta
/* stati */          --live --ok --allerta
/* composizioni */   --grad-pagina --grad-titolo --grad-pannello
/* bagliori */       --bagliore-viola --bagliore-ciano
/* forma */          --raggio --raggio-s --raggio-pill --ombra --ombra-morbida
/* tipografia */     --font-titolo --font-testo --font-mono
/* misure */         --binario-w --dock-h --max-larghezza --passo
```

- `--grad-pagina` contiene **tutto** lo sfondo del `body`: `base.css` fa solo
  `body { background: var(--grad-pagina); }`.
- `--binario-w` = larghezza del binario laterale (88px). `--dock-h` = altezza del dock mobile (64px).
- `--max-larghezza` = 1360px. `--passo` = unità di spaziatura base (8px).

### Font (caricati da Google Fonts nel modello, `display=swap`, con fallback di sistema)

- `--font-titolo`: `'Space Grotesk'` 500/700 — titoli e marchio.
- `--font-testo`: `'Manrope'` 400/600 — testo corrente.
- `--font-mono`: `'JetBrains Mono'` 400/500 — etichette maiuscole, numeri, conto alla rovescia,
  tutto ciò che deve sembrare strumentazione.

Sono font diversi da quelli della versione precedente (Chakra Petch / Inter): è voluto.

### Palette di partenza (derivata dagli asset reali)

mascotte viola `#8b2fff` e `#7B1FA2`, cresta ciano `#22e0ff`, lettering magenta `#ff2fa0`,
viola Twitch `#9146ff`, fondo quasi nero `#07070c`. B può raffinare, resta in questa famiglia.
Contrasti WCAG AA obbligatori sul testo.

---

## 5. Scheletro DOM — l'agente A produce ESATTAMENTE questi hook

Convenzione BEM leggero: `.blocco__elemento`, modificatori `.is-*`.
Gli `id` elencati sono **contratto con il JS**: non rinominarli, non toglierli.

```
a.salta[href="#contenuto"]

aside#binario.binario                          ← rail a sinistra / dock in basso
  a.binario__marchio[href="#regia"] > img.binario__avatar + span.binario__nome
  nav.binario__nav[aria-label="Sezioni"]
     a.binario__voce[href="#regia"]      > span.binario__punto + span.binario__testo
     a.binario__voce[href="#settimana"]  ·  #chi  ·  #supporto  ·  #saluti
  .binario__stato
     span#spia.spia + span#spia-testo.binario__stato-testo
  ul.binario__social > li > a.binario__social-voce[href][title][rel] > svg

main#contenuto

 section#regia.regia
   .regia__sfondo   (banner, decorativo, aria-hidden)
   .regia__griglia
     .quadro                                   ← colonna stretta, sticky da 1100px
       p.quadro__occhiello
       h1#titolo.quadro__titolo
       p.quadro__sottotitolo
       .quadro__stato
          .stato__riga > span#spia-grande.spia + span#stato-testo
          dl.stato__dati
             dt (etichettaProssima) + dd > time#conto.conto
             dt (etichettaUltima)   + dd#ultima
       .quadro__azioni > a.btn.btn--pieno[href=twitch] + a.btn.btn--vuoto[href="#settimana"]
       ul.quadro__dati > li.dato > b.dato__valore + span.dato__etichetta      (4 righe)
     .monitor
       .monitor__telaio
         .monitor__barra
            span.monitor__punti (3 punti decorativi)
            span#monitor-titolo.monitor__titolo
            span#monitor-badge.monitor__badge[hidden]  ("LIVE")
         .monitor__schermo
            #twitch-embed.monitor__video     ← VUOTO: lo riempie l'agente D
         .monitor__lato[hidden]
            #twitch-chat.monitor__chat       ← VUOTO: lo riempie l'agente D
         .monitor__piede
            button#chat-toggle[aria-expanded="false"][aria-controls="twitch-chat"]
            p.monitor__nota
            a#apri-twitch.monitor__link[href]
       img#mascotte.regia__mascotte
   a.regia__scorri[href="#settimana"] > span + svg

 section#settimana.settimana
   .sezione__testa.settimana__testa
      p.sezione__occhiello + h2.sezione__titolo + p.sezione__testo
   ol#nastro.nastro                             ← 7 li generati dalla generazione
      li.nastro__giorno[data-giorno="0..6"]
         span.nastro__abbr + b.nastro__ora + span.nastro__tag
   .settimana__piede > p.settimana__nota + a.btn.btn--vuoto

 section#chi.chi
   .chi__griglia
     .chi__corpo
        p.sezione__occhiello + h2.sezione__titolo
        p.chi__apertura + p + blockquote.chi__citazione + p
        ul.chi__tag > li.tag                     (6)
        a.btn.btn--pieno
     aside.chi__margine
        .nota > h3.nota__titolo + p.nota__testo   (3)
        ul.chi__dati > li > b + span              (3)
     figure.chi__ritratto > img + figcaption

 section#supporto.supporto
   .sezione__testa
   ol#listino.listino                            ← righe generate dalla generazione
      li.listino__riga
         span.listino__icona > svg
         .listino__corpo > h3.listino__titolo + p.listino__testo
         span.listino__tag
         a.listino__azione[href]
   p.supporto__chiusura

 section#saluti.saluti
   .saluti__griglia
     .saluti__social
        p.sezione__occhiello + h2.sezione__titolo + p.sezione__testo
        ul#social.social > li > a.social__voce > svg + span.social__nome + span.social__handle
     .contatti
        h3.contatti__titolo + p.contatti__testo
        p > code#email.contatti__email
        .contatti__azioni
           button#copia-email.btn.btn--vuoto + a#scrivi-email.btn.btn--pieno
   p.saluti__chiusura

footer.piede
  p.piede__copy + p.piede__disclaimer + p.piede__nota
```

Regole non negoziabili per A:

- Un solo `<h1>` in pagina (`#titolo`). Gerarchia `h1 → h2 → h3` senza salti.
- `#twitch-embed` e `#twitch-chat` sono **vuoti**: li riempie il JS dell'agente D.
- Ogni sezione ha `aria-labelledby` che punta all'`id` del proprio `h2`.
- Immagini decorative: `alt=""` e `aria-hidden="true"`. Immagini di contenuto: `alt` dal contenuto.
- `<html lang="it">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- Meta Open Graph e Twitter Card completi, `<link rel="canonical">`, `application/ld+json`
  con `Person` + `sameAs` dai social.

---

## 6. Generazione — come nasce `index.html`

```
modelli/index.html  +  contenuti/contenuti.json
        │
        │   node server/genera.js      (oppure POST /api/pubblica)
        ▼
index.html   +   js/dati.js            ← file statici, pronti da pubblicare
```

Il sito pubblicato è **statico**: chi lo visita non scarica nessun JSON e non parla col server.
Il server serve solo a chi amministra.

### 6.1 Sintassi del modello (motore scritto da E, ~150 righe, zero dipendenze)

| Sintassi | Significato |
|---|---|
| `{{chiave}}` | valore, **con escape** di `& < > " '` — sicuro sia nel testo sia dentro un attributo |
| `{{{chiave}}}` | valore **grezzo**, senza escape — ammesso solo per `{{{svg}}}` |
| `{{#ogni elenco}} … {{/ogni}}` | ripete il blocco per ogni voce; dentro, le chiavi sono quelle della voce |
| `{{#se chiave}} … {{/se}}` | mostra il blocco se il valore è non vuoto (`""`, `0`, `[]`, `false` = vuoto) |
| `{{^se chiave}} … {{/se}}` | il contrario |
| `{{> parziali/nome}}` | include `modelli/parziali/nome.html` |

Dentro `{{#ogni}}`: `{{@indice}}` (da 0), `{{@numero}}` (da 1), `{{@primo}}`, `{{@ultimo}}`.
Le chiavi sono percorsi con il punto: `{{config.twitch.canale}}`.
Una chiave assente è un **errore di generazione**, non una stringa vuota: si spacca subito e si
capisce perché.

### 6.2 Contesto disponibile nel modello

- tutte le chiavi di `testi`: `{{deck.titolo}}`, `{{chi.citazione}}`, …
- tutta la configurazione sotto `config`: `{{config.email}}`, `{{config.immagini.avatar}}`, …
- elenchi già filtrati e arricchiti dalla generazione:
  - `social` — solo le voci con `url` non vuoto; ogni voce ha in più `svg` (contenuto di
    `modelli/icone/<icona>.svg`);
  - `supporto` — solo le voci con `url` non vuoto; stessa aggiunta `svg`;
  - `settimana` — **sempre 7 voci**, da domenica-lunedì secondo `config.orari.giorni`, ognuna:
    `{ indice: 0..6, abbr: "LUN", nome: "Lunedì", diretta: true|false, ora: "21:00"|"", tag: "Diretta"|"Riposo" }`
    (`abbr` e `nome` in italiano, `tag` preso da `settimana.etichettaDiretta` / `.etichettaRiposo`);
- calcolati, sotto `sito`:
  - `sito.urlCanale` (`https://www.twitch.tv/<canale>`), `sito.urlChat`, `sito.mailto`,
    `sito.anno` (anno corrente), `sito.generatoIl` (ISO), `sito.orariTesto`
    (es. «Lunedì, mercoledì, venerdì e domenica alle 21:00»).

### 6.3 `js/dati.js` — quello che il front-end può leggere a runtime

Generato da `server/modelli/dati.js.tpl`. Forma **esatta**, D ci si appoggia:

```js
window.DATI = {
  twitch:  { canale: "slayer_beard", idUtente: "47738247", domini: [] },
  orari:   { giorni: [1,3,5,0], ora: "21:00", fuso: "Europe/Rome", durataOre: 4 },
  email:   "slayerbeard@gmail.com",
  ultimaDiretta: "…",
  testi: {
    statoLive: "…", statoOffline: "…", statoVerifica: "…",
    chatApri: "…", chatChiudi: "…",
    etichettaOggi: "…", etichettaProssima: "…",
    copiaBtn: "…", copiaFatto: "…"
  }
};
```

A `domini` la generazione aggiunge sempre `localhost` e `127.0.0.1`; il JS aggiunge da sé
`location.hostname`.

### 6.4 Ordine della pubblicazione — E lo rispetta, in questo ordine

1. **Backup** di `index.html` e `js/dati.js` in `server/backup/<ISO>/`, con dentro anche la
   copia di `contenuti.json`.
2. **Convalida** dei contenuti contro `contenuti/schema.js`: se fallisce, si ferma qui e non
   scrive niente.
3. **Render** del modello e del template di `dati.js`.
4. **Scrittura atomica**: si scrive su `<file>.tmp` nella stessa cartella e poi `rename`.
   Mai un `index.html` a metà se il processo muore.
5. Aggiornamento di `aggiornatoIl` in `contenuti.json`.

---

## 7. Schema dei campi — `contenuti/schema.js` (agente E)

È il file che rende il backend «facile da modificare»: **il pannello si costruisce da qui**.
Aggiungere un campo al sito deve costare *una riga nello schema e un `{{…}}` nel modello*.

```js
module.exports = {
  gruppi: [
    {
      id: 'deck',
      titolo: 'Copertina e regia',
      descrizione: 'La prima schermata: titolo, spie, numeri del canale.',
      campi: [
        { chiave: 'deck.titolo', etichetta: 'Titolo', tipo: 'testo', max: 40 },
        { chiave: 'deck.sottotitolo', etichetta: 'Sottotitolo', tipo: 'testolungo', max: 260,
          aiuto: 'Due righe scarse: è la prima cosa che si legge.' },
        { chiave: 'config.orari', etichetta: 'Giorni di diretta', tipo: 'orari' },
        { chiave: 'config.social', etichetta: 'Profili social', tipo: 'elenco',
          etichettaVoce: 'nome',
          campi: [
            { chiave: 'nome',   etichetta: 'Nome',   tipo: 'testo' },
            { chiave: 'url',    etichetta: 'Link',   tipo: 'url', aiuto: 'Vuoto = la voce sparisce dal sito.' },
            { chiave: 'icona',  etichetta: 'Icona',  tipo: 'scelta', opzioni: ['twitch','youtube','instagram','tiktok'] }
          ] }
      ]
    }
  ]
};
```

Tipi ammessi: `testo`, `testolungo`, `url`, `email`, `numero`, `immagine`, `orario`, `orari`,
`scelta`, `elencoTesti`, `elenco`.

Obblighi:

- **Copertura totale**: ogni chiave di `contenuti.json` compare esattamente una volta nello
  schema. `verificaCopertura()` esce con errore se qualcosa manca o è di troppo, e viene
  chiamata all'avvio del server e dalla generazione.
- Ogni campo ha un'etichetta in italiano comprensibile a chi non programma: non `deck.dato1Valore`
  ma «Primo numero — valore».
- I gruppi seguono l'ordine della pagina: `meta`, `marchio`, `deck`, `settimana`, `chi`,
  `supporto`, `saluti`, `piede`, `canale` (twitch, email, immagini).

---

## 8. API del server (agente E) — JSON, tutte sotto `/api`

| Metodo e percorso | Fa |
|---|---|
| `GET /api/sessione` | `{ autenticato: bool, primoAvvio: bool }` |
| `POST /api/entra` | `{ password }` → cookie di sessione `HttpOnly`, `SameSite=Strict` |
| `POST /api/esci` | chiude la sessione |
| `GET /api/contenuti` | `{ versione, aggiornatoIl, testi, config, schema, stato }` |
| `PUT /api/contenuti` | salva su `contenuti.json` **senza** pubblicare; convalida prima |
| `POST /api/pubblica` | esegue §6.4 e risponde `{ ok, backup, durataMs }` |
| `GET /api/anteprima` | HTML renderizzato **al volo**, senza scrivere su disco |
| `GET /api/media` | elenco dei file in `contenuti/media/` |
| `POST /api/media` | carica un'immagine (png/jpg/webp/svg, max 4 MB) |
| `DELETE /api/media/<nome>` | cancella, rifiutando i file citati nei contenuti |
| `GET /api/backup` | elenco dei backup con data e dimensione |
| `POST /api/backup/<id>/ripristina` | rimette in piedi quel backup (dopo averne fatto uno nuovo) |

Fuori da `/api`: `/` serve il sito statico dal disco, `/pannello/` serve il pannello.
Tutte le rotte che modificano qualcosa richiedono la sessione e rifiutano richieste con
`Origin` estraneo. Errori: `{ errore: "messaggio in italiano" }` con lo stato HTTP giusto.

**Autenticazione**: password singola, hash `scrypt` con sale, in `server/dati/auth.json`
(creato da `node server/imposta-password.js`). Al primo avvio senza password il server lo dice
in console e il pannello mostra la schermata di creazione. Niente password in chiaro, mai.

### Comandi

```
node server/server.js              avvia sito + pannello su http://localhost:4173
node server/server.js --guarda     idem, e rigenera a ogni modifica di modelli/ o contenuti/
node server/genera.js              genera e basta, senza server (per la pubblicazione)
node server/imposta-password.js    crea o cambia la password del pannello
node server/autotest.js            collaudo: motore, convalida, generazione, API
```

---

## 9. Pannello (agente F) — `pannello/`

UI di amministrazione, ES2020 puro nel browser, nessun bundler, nessun import da CDN.
**Non contiene nessuna conoscenza dei campi**: li chiede a `/api/contenuti` e costruisce il
form dallo schema. Aggiungere un campo allo schema deve farlo comparire nel pannello **senza
toccare una riga di `pannello/`**.

Deve avere, tutto funzionante:

- accesso con password, e schermata di creazione password al primo avvio;
- colonna dei gruppi a sinistra, form a destra, campi generati dallo schema (§7);
- editor degli elenchi: aggiungi, elimina, riordina (su/giù), con l'etichetta della voce presa
  da `etichettaVoce`;
- stato «modifiche non salvate» sempre visibile, avviso prima di chiudere la pagina,
  `Ctrl+S` = salva;
- **Salva** (PUT) e **Pubblica** (POST) distinti e spiegati: salvare non cambia il sito.
- anteprima in `<iframe>` da `/api/anteprima`, aggiornabile senza pubblicare;
- libreria media con trascinamento del file, anteprima, copia del percorso, eliminazione;
- elenco backup con ripristino e conferma esplicita;
- errori di convalida mostrati **sul campo che li ha causati**, non in un avviso generico;
- funziona da 360 px in su, navigabile da tastiera, `prefers-reduced-motion` rispettato.

`docs/PANNELLO.md`: guida per chi amministra, scritta per chi non programma — accesso,
modifica, pubblicazione, media, backup, e cosa fare quando qualcosa non va.

---

## 10. Comportamenti front-end (agente D)

### `js/sito.js`
- **Binario**: evidenzia la voce della sezione visibile (`IntersectionObserver`, non `scroll`),
  aggiunge `.is-attiva`, aggiorna `aria-current="true"`.
- **Conto alla rovescia** `#conto`: tempo alla prossima diretta calcolato da `DATI.orari` nel
  fuso `Europe/Rome` **anche se il visitatore è in un altro fuso**, ora legale compresa.
  Formato `2g 04:31:07`, aggiornato ogni secondo, `datetime` sull'elemento `<time>`.
  Se il canale è in onda, al posto del conto va il testo di `statoLive`.
- **Nastro**: marca `.is-oggi` sul giorno corrente e `.is-prossima` sulla prossima diretta.
- **Copia email**: `#copia-email` usa `navigator.clipboard` con fallback, mostra `copiaFatto`
  per 2 secondi, `aria-live="polite"`.
- **Mascotte** `#mascotte`: reagisce al mouse con uno scostamento minimo (parallasse ≤ 12px),
  ferma con `prefers-reduced-motion`. Poche righe, niente libreria.
- Ogni funzione si disinnesca da sola se il suo elemento non esiste: il JS non deve mai
  spaccare la pagina.

### `js/player.js` + `css/player.css`
- Porta la logica **già collaudata** di `sito-backup/js/twitch-player.js` (leggila: gestisce
  `parent`, stato live, chat, schermo intero, fallback `file://`, adblock) e adattala ai nuovi
  hook: `#twitch-embed`, `#twitch-chat`, `#chat-toggle`, `#monitor-badge`, `#monitor-titolo`,
  `#spia`, `#spia-testo`, `#spia-grande`, `#stato-testo`, `#ultima`.
- Espone `window.Player = { suStato(fn) }`: `sito.js` si iscrive per sapere se è in onda,
  invece di guardare il DOM.
- Se l'embed non può partire (protocollo `file://`, SDK bloccato, canale offline) mostra dentro
  il monitor un riquadro spiegato in italiano e un bottone che apre Twitch. Non si rompe niente.
- `css/player.css` stila **solo** l'interno del player e della chat (`.player__*`, `.chat__*`).
  Il telaio del monitor (`.monitor__*`) è dell'agente C: non scriverlo.

---

## 11. Dati reali del canale (verificati al 3 settembre 2026)

Sono già in `contenuti/contenuti.json` e nessuno li inventa diversi:

canale `slayer_beard` · id `47738247` · Twitch Affiliate dal 2013 · 3.619 follower ·
90 abbonati · ~25 spettatori medi · emote `slayer156` · ITA/ENG ·
dirette lunedì, mercoledì, venerdì e domenica alle 21:00 (Europe/Rome), circa 4 ore ·
email `slayerbeard@gmail.com` · Instagram e TikTok `@slayer_beard` ·
YouTube e donazioni: **non ancora attivi**, URL vuoto — devono sparire dal sito, non comparire rotti.

Immagini in `img/`: `avatar.png` (600×600, primo piano molto ravvicinato: usalo tondo e piccolo),
`mascot.png` (**il fondo viola non è trasparente**: va sfumato con `mask-image`, mai su fondo
chiaro), `banner.png`, `og.png` (1200×630), `favicon.png`.

---

## 12. Qualità — vale per tutti

- Nessuno scroll orizzontale da 320 px a 2560 px.
- Contrasti WCAG AA, focus **visibile** su tutto ciò che si può mettere a fuoco, skip link
  funzionante, landmark corretti.
- `prefers-reduced-motion: reduce` ferma animazioni, parallasse e transizioni.
- Niente `!important` se non per annullare uno stile di terze parti (l'iframe Twitch).
- Il sito deve reggere **senza JavaScript**: contenuti, orari e link sono già nell'HTML
  generato; senza JS si perdono solo conto alla rovescia, player e scrollspy.
