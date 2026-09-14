# CONTRATTO 4 — quarta fase: l'editor unico

Addendum vincolante a `CONTRATTO.md`, `CONTRATTO-2.md` e `CONTRATTO-3.md`, che **restano validi in
tutto** tranne le deroghe dichiarate nel §2 (niente npm, niente framework, niente CDN oltre Google
Fonts ed `embed.twitch.tv`, Node >= 18 con soli moduli interni, `path.join` su Windows, tutto in
italiano, nessun `TODO`, nessun placeholder, commenti che spiegano il *perché*, tono asciutto).

Gli agenti lavorano **in parallelo su file disgiunti** (§13). I nomi qui sotto sono l'unica cosa che
tiene insieme il lavoro: si rispettano alla lettera. Se un nome è sbagliato o manca, non lo si inventa
diverso: lo si scrive nel proprio file di decisioni (§14) e lo si usa lì come proposto.

---

## 0. Cosa ha chiesto il committente

Portare su questo sito **la stessa logica tecnica** del pannello di Mobscene93 — l'editor unico in
stile Elementor — **tenendo la grafica di Slayer Beard**:

- il **sito pubblicato non cambia aspetto**: con i valori di partenza le pagine generate restano
  identiche a prima, a parte gli attributi `data-sb-*` (regola d'oro, §15);
- il **pannello** cambia struttura (anteprima al centro, pannello laterale grande con schede
  Contenuto / Stile / Avanzate, menu ☰) ma **parla la lingua visiva della regia** (§12): grafite,
  linee da 1 px, etichette in monospazio maiuscolo, viola per le azioni, ciano per ciò che è acceso.
  Niente magenta neon, niente Oswald, niente di Mobscene93 che si veda.

In pratica, chi amministra:

1. vede **l'anteprima vera** del sito su Telefono / Tablet / Computer, anche con le modifiche non
   salvate, con lo zoom automatico quando il Computer non ci sta;
2. **clicca qualunque cosa** — un testo, un'immagine, una parte guidata dai dati, un blocco, una
   sezione — e la modifica dal pannello laterale;
3. scrive i testi **sul posto**, cambia le immagini cliccandole;
4. cambia lo **stile di ogni elemento** per dispositivo, con i **colori del tema collegati**;
5. **sposta e ridimensiona i blocchi** dentro la loro sezione, per dispositivo;
6. **riordina e nasconde le sezioni** dal Navigatore;
7. gestisce colori, font (anche **caricandone di propri**) e forma del sito dalle Impostazioni;
8. ha **Annulla / Ripeti**, **Salva** distinto da **Pubblica**, le **Copie di sicurezza**, le
   **Immagini**, la **password**.

Una cosa sola per ogni modifica: nessuna voce doppione, nessun campo che non fa niente sul sito.

---

## 1. Il riferimento: Mobscene93

Il codice che funziona già sta in `C:\Users\Filippo\Desktop\PROGETTI\Mobscene93-Website` (**sola
lettura**: non si scrive lì dentro, nemmeno un file temporaneo). Si legge per capire la logica e le
trappole già risolte, poi si **riscrive** in questo progetto con i suoi nomi, i suoi moduli e il suo
stile. Non si copia un file così com'è: Mobscene93 usa script classici e nomi inglesi, qui il pannello
è fatto di moduli ES e i nomi sono italiani.

| Da leggere | Perché |
|---|---|
| `BRIEF-ADMIN-V2.md` §4, §9, §10, **§10.11** | la regola geometrica, il registro dei blocchi, l'editor unico, le decisioni vere prese durante il lavoro |
| `docs/EDITOR-PORTABILE.md` | cosa si porta, la regola che protegge la grafica, le trappole già incontrate (§7) |
| `admin/js/panel-editor-engine.js` | MOTORE: anteprima, zoom, selezione, trascinamento, CSS dal vivo |
| `admin/js/panel-editor-content.js` | CONTENUTI: testi sul posto, immagini |
| `admin/js/panel-style.js` | STILE: schede Stile e Avanzate |
| `admin/shared/style-css.js` | DATI: generatore unico degli stili (UMD) |
| `admin/js/panel-widgets.js` | PARTI: widget, sezioni, Navigatore, nomi umani |
| `admin/js/panel-theme.js` | TEMA: controlli colore e font, libreria dei font |
| `admin/js/editor-shell.js`, `admin/css/editor-shell.css` | GUSCIO: struttura, schede, ☰, Annulla/Ripeti, sincronizzazione |
| `build.js` (`layoutCss`, `renderPage`), `lib/api.js` (`/api/preview`, `/api/fonts`), `lib/fonts.js` | SERVER |

### 1.1 Corrispondenza dei nomi

| Mobscene93 | Slayer Beard |
|---|---|
| `admin/admin.js` (base del pannello) | `pannello/pannello.js` |
| `window.MobAdminExt` | `ponte` — `pannello/editor/ponte.js` (§9.2) |
| `window.MobEditor` | `motore` — `pannello/editor/motore.js` (§10) |
| `window.MobShell` | `pannello/editor/guscio.js` |
| `window.MobWidgets` | `pannello/editor/parti.js` + `pannello/editor/nomi.js` |
| `window.MobTheme` | `pannello/editor/impostazioni.js` |
| `window.MobStyleCss` (`admin/shared/style-css.js`) | `window.SBStili` / `require` — `pannello/condivisi/stili.js` (§8) |
| `content.text` | `testi` |
| `content.theme` | `config.tema` (esiste già, CONTRATTO-2 §4.2) |
| `content.sections` | `config.sezioni` (§4.1) |
| `content.styles` | `config.stili` (§4.2) |
| `content.layout.blocks` | `config.disposizione.blocchi` (§4.3) |
| `data-cms` · `data-cms-src` · `data-widget` · `data-canvas` · `data-block` · `id` di sezione | `data-sb-testo` · `data-sb-immagine` · `data-sb-parte` · `data-sb-riquadro` · `data-sb-blocco` · `data-sb-sezione` |
| `desktop` · `tablet` · `mobile` | `computer` · `tablet` · `telefono` |
| `text:` `image:` `widget:` `block:` `section:` | `testo:` `immagine:` `parte:` `blocco:` `sezione:` |
| `mob:dirty` · `mob:ready` · `mob:breakpoint` · `mob:preview-ready` · `mob:inspectors` | `sb:modifica` · `sb:pronto` · `sb:dispositivo` · `sb:anteprima-pronta` · `sb:ispettori` |
| `<style id="mob-layout">` · `<style id="mob-styles">` | `<style id="sb-disposizione">` · `<style id="sb-stili">` |
| `mob-layout-live` · `mob-styles-live` | `sb-disposizione-dal-vivo` · `sb-stili-dal-vivo` (e `sb-tema-dal-vivo`, che c'è già) |
| `POST /api/preview` + `GET /api/preview/index.html` | `POST /api/anteprima` con `editor: true` (§6.3) |
| `/api/fonts` | `/api/font` (§7) |
| Versioni salvate (`content/revisions`) | Copie di sicurezza (`server/backup`, esistono già) |

---

## 2. Deroghe ai contratti precedenti

Poche e motivate. Tutto il resto dei contratti precedenti vale.

1. **`!important` nel CSS generato dall'editor.** CONTRATTO §12 lo vieta. Qui è ammesso **solo**
   dentro `<style id="sb-stili">`, `<style id="sb-disposizione">` e nei loro gemelli iniettati dal
   motore nell'anteprima. Sono scelte esplicite di chi amministra su un elemento preciso e devono
   battere i fogli di sezione, che hanno selettori più forti di un attributo. Nei fogli scritti a mano
   il divieto resta intero.
2. **Colori esadecimali nel CSS generato dall'editor.** CONTRATTO-2 §11 li ammette solo in
   `tokens.css` e `tema.css`. Dentro `sb-stili` compare un esadecimale **solo** quando chi amministra
   sceglie un colore libero; i colori del tema escono come `var(--token)`. Nei fogli scritti a mano e
   nei file nuovi del pannello (che usano le variabili `--p-*` di `pannello.css`) il divieto resta.
3. **Il pannello cambia struttura.** CONTRATTO §9 e CONTRATTO-2 §10 descrivono colonna dei gruppi +
   form + anteprima laterale. L'editor unico le sostituisce. **Quello che il pannello sa fare resta**
   (convalida sul campo, `Ctrl+S`, avviso prima di chiudere, ricerca dei campi, media, backup, preset
   e contrasto dei colori): cambia dove sta. **Il pannello continua a costruire i campi dallo
   schema**: nessuna conoscenza dei campi scritta a mano, tranne la mappa parti → chiavi (§5.4), che
   è un dato di impaginazione e non una definizione di campo.
4. **Tre rami di `contenuti.json` senza campo nello schema**: `config.sezioni`, `config.stili`,
   `config.disposizione`. Li scrive l'editor con controlli suoi. Stanno in `EDITOR` dentro
   `contenuti/schema.js`, saltati dalla copertura come già `GENERATI`, e li controlla la convalida
   con funzioni dedicate (§8, §6.5).
5. **La generazione rende le sezioni in un ordine che viene dai dati** (§6.1): `modelli/index.html`
   non include più a mano le sei sezioni di `main` una dopo l'altra.
6. **L'anteprima dell'editor non esegue gli script del sito** (§6.3). È la pagina senza JavaScript,
   che il CONTRATTO §12 dichiara completa. Motivo: dentro l'editor il player di Twitch sarebbe una
   seconda sessione video della stessa persona, vietata dal CONTRATTO-3 §3.4, e il pollo aprirebbe
   una socket IRC a ogni ricarica.

---

## 3. Bande dei dispositivi

Tre numeri, **gli stessi ovunque** (generatore condiviso, generazione, motore, stile):

| dispositivo | per gli stili (cascata) | per posizioni e «nascosto» (fasce esclusive) | larghezza dell'anteprima |
|---|---|---|---|
| `computer` | base, senza media query | `(min-width: 1100px)` | `max(1100, spazio disponibile)` |
| `tablet` | `@media (max-width: 1099.98px)` | `(min-width: 760px) and (max-width: 1099.98px)` | 900 |
| `telefono` | `@media (max-width: 759.98px)` | `(max-width: 759.98px)` | 375 |

1100 è il confine binario ↔ dock di `css/base.css`; 760 è il primo confine di `css/regia.css`.

---

## 4. Dati nuovi in `contenuti.json` (agente DATI)

### 4.1 `config.sezioni` — ordine e visibilità

```json
"sezioni": [
  { "id": "regia",     "attiva": true },
  { "id": "diretta",   "attiva": true },
  { "id": "settimana", "attiva": true },
  { "id": "chi",       "attiva": true },
  { "id": "supporto",  "attiva": true },
  { "id": "saluti",    "attiva": true }
]
```

- id ammessi, ciascuno una volta sola: `SEZIONI_ORDINABILI` = `regia, diretta, settimana, chi,
  supporto, saluti`. Un id sconosciuto si scarta, un doppione vale la prima volta, un id mancante si
  rimette in coda nell'ordine di partenza e attivo.
- `regia` è **bloccata**: sempre prima e sempre attiva, comunque sia scritto l'elenco (è la
  copertina e contiene l'unico `<h1>`).
- `binario` e `piede` **non** stanno nell'elenco: ci sono sempre.
- Il binario ha una voce per ogni sezione attiva, nello stesso ordine. Le voci restano al massimo sei:
  la taratura del dock a 320 px non cambia.

### 4.2 `config.stili` — stile per elemento e per dispositivo

```json
"stili": {
  "testo:deck.titolo": {
    "computer": { "colore": "var:ciano", "dimensione": { "valore": 72, "unita": "px" } },
    "telefono": { "dimensione": { "valore": 38, "unita": "px" } }
  },
  "sezione:chi": { "tablet": { "nascosto": true } }
}
```

**Bersagli** (la chiave): `<tipo>:<chiave>`, al massimo 1000.

| tipo | chiave | selettore |
|---|---|---|
| `testo` | chiave dello schema, es. `deck.titolo`, `config.email` | `[data-sb-testo="<chiave>"]` |
| `immagine` | `config.immagini.<nome>` | `[data-sb-immagine="<chiave>"]` |
| `parte` | nome del registro §5.4 | `[data-sb-parte="<nome>"]` |
| `blocco` | `<riquadro>.<nome>` | `[data-sb-blocco="<chiave>"]` |
| `sezione` | `binario, regia, diretta, settimana, chi, supporto, saluti, piede` | `[data-sb-sezione="<chiave>"]` |

Formati: `testo` `^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$`; `immagine` `^config\.immagini\.[a-z][A-Za-z0-9]*$`;
`parte` `^[a-z][a-z0-9-]{0,40}$`; `blocco` `^[a-z][a-z0-9-]{0,40}\.[a-z][a-z0-9-]{0,40}$`.

**Dispositivi**: `computer`, `tablet`, `telefono`; un dispositivo vuoto non si salva, un bersaglio
senza dispositivi nemmeno.

**Proprietà** — tutte facoltative; un valore fuori regola si scarta da solo senza far cadere il resto;
un numero fuori intervallo si **stringe al bordo**:

| proprietà | CSS | valore ammesso |
|---|---|---|
| `colore` | `color` | `#rrggbb` oppure `var:<chiave>` fra le 12 di `config.tema.colori` |
| `sfondoColore` | `background-color` | come `colore` |
| `bordoColore` | `border-color` | come `colore` |
| `sfondoImmagine` | `background-image` | percorso `img/…` o `contenuti/media/…` con estensione immagine (`png jpg jpeg webp svg gif avif`), niente `..`, niente schemi, niente spazi; oppure `"nessuna"` → `none` |
| `sfondoDimensione` | `background-size` | `copri` → `cover` · `contieni` → `contain` · `originale` → `auto` |
| `sfondoPosizione` | `background-position` | `centro` `alto` `basso` `sinistra` `destra` → `center top bottom left right` |
| `font` | `font-family` | `ruolo:titolo` · `ruolo:testo` · `ruolo:mono` → `var(--font-titolo)` …; `famiglia:<nome del catalogo>` → `'<nome>', <ripiego del catalogo>`; `caricato:<id>` → `'sb-<id>', var(--font-testo)` più il suo `@font-face` |
| `dimensione` | `font-size` | `{ valore, unita }` con `px` 8–200 o `rem` 0.5–12 |
| `peso` | `font-weight` | 100–900 a passi di 100 |
| `corsivo` | `font-style` | booleano → `italic` / `normal` |
| `maiuscole` | `text-transform` | `nessuna` `maiuscole` `minuscole` `iniziali` → `none uppercase lowercase capitalize` |
| `spaziatura` | `letter-spacing` | em, −0.2–1 |
| `interlinea` | `line-height` | 0.6–3 |
| `allineamento` | `text-align` | `sinistra` `centro` `destra` `giustificato` |
| `riempimento` | `padding` | `{ sopra, destra, sotto, sinistra }` in px 0–400; un lato assente non si tocca |
| `margine` | `margin` | come sopra, px −400–400 |
| `bordoSpessore` | `border-width` (+ `border-style: solid` se > 0) | px 0–20 |
| `raggio` | `border-radius` | px 0–200 |
| `opacita` | `opacity` | 0–100, esce diviso 100 |
| `bagliore` | vedi sotto | `nessuno` `viola` `ciano` |
| `nascosto` | `display: none` | booleano **per dispositivo**, valore effettivo ereditato (§8) |
| `larghezzaMax` | `max-width` | `{ valore, unita }` con `px` 0–4000 o `%` 0–100 |

Mappa dei 12 colori del tema sui token: `viola --viola`, `violaCupo --viola-cupo`, `violaChiaro
--viola-chiaro`, `ciano --ciano`, `magenta --magenta`, `live --live`, `ok --ok`, `allerta --allerta`,
`fondo --fondo`, `testo --testo`, `testoMedio --testo-medio`, `testoTenue --testo-tenue`.

`bagliore`: i token `--bagliore-viola` / `--bagliore-ciano` di `tokens.css` sono scritti per
`box-shadow`/`drop-shadow`. DATI legge la loro forma reale e sceglie la proprietà che li accetta senza
invalidarsi (`filter: drop-shadow(var(--bagliore-…))` se non valgono come `text-shadow`); `nessuno`
toglie quello che il sito mette. La scelta si scrive nelle decisioni.

**Parti protette** (CONTRATTO-3 §3.4, niente occlusione del player): per `sezione:diretta` e
`parte:monitor` le proprietà `nascosto` e `opacita` **non esistono** — il generatore le scarta e la
scheda non le offre. La sezione intera si toglie dal Navigatore, che non la stampa affatto.

### 4.3 `config.disposizione` — blocchi posizionati

```json
"disposizione": {
  "blocchi": {
    "chi": [
      { "id": "chi.corpo",    "pos": { "telefono": null, "tablet": null, "computer": { "x": 0, "y": 0, "l": 58, "a": 70 } } },
      { "id": "chi.ritratto", "pos": { "telefono": null, "tablet": null, "computer": null } }
    ]
  }
}
```

- `RIQUADRI` ammessi: `regia, settimana, chi, supporto, saluti, piede`. **Mai** `diretta` né `binario`.
- `id` del blocco: `<riquadro>.<nome>`, con il prefisso uguale al riquadro in cui sta.
- `pos` ha **esattamente** `telefono`, `tablet`, `computer`, ciascuno `null` o `{ x, y, l, a }`.
- Unità: percentuale della **larghezza del contenuto del riquadro**, anche per `y` e `a`.
  `x` e `l` in 0–100, `y` e `a` in 0–2000, arrotondati a due decimali.

**Regola geometrica** — la stessa di Mobscene93 (`BRIEF-ADMIN-V2.md` §4), vincolante per DATI e MOTORE.
Per ogni fascia esclusiva del §3, in ordine telefono → tablet → computer, e per ogni riquadro con
almeno un blocco posizionato in quella fascia **e presente nella pagina**:

```css
@media (min-width: 1100px) {
  [data-sb-riquadro="chi"] {
    position: relative !important;
    container-type: inline-size;
    aspect-ratio: 100 / 70;
  }
  [data-sb-riquadro="chi"] [data-sb-blocco="chi.corpo"] {
    position: absolute !important;
    left: calc(0 * 1cqw) !important;
    top: calc(0 * 1cqw) !important;
    width: calc(58 * 1cqw) !important;
    min-height: calc(70 * 1cqw) !important;
    height: auto !important;
    margin: 0 !important;
    max-width: none !important;
  }
}
```

`aspect-ratio: 100 / M` con `M = max(1, max(y + a))`. Rientro di 2 spazi dentro la media query, 4 per
le proprietà, una per riga. Numeri senza zeri finali (`48.5`, `0`, `70.25`). Si saltano: riquadri non
ammessi, id non validi o col prefisso sbagliato, id ripetuti (vale il primo), `pos` con un campo non
numerico, blocchi che la pagina non ha. **Il testo che esce dal generatore condiviso e quello del
motore sono lo stesso, al byte.**

Misura nel motore (pixel → unità): `cw = riquadro.clientWidth − paddingLeft − paddingRight`;
`ox = rettangoloRiquadro.left + borderLeftWidth`; `oy = rettangoloRiquadro.top + borderTopWidth`;
`x = (rettangoloBlocco.left − ox) / cw × 100`, `y = (rettangoloBlocco.top − oy) / cw × 100`,
`l = larghezza / cw × 100`, `a = altezza / cw × 100`, due decimali.

### 4.4 Font caricati

- File in `contenuti/font/<id>.<woff2|woff|ttf|otf>`, elenco in `contenuti/font/elenco.json`:
  `[{ "id", "etichetta", "file", "formato", "caricatoIl" }]`. `id` = 16 cifre esadecimali generate dal
  server. Massimo 2 MB; formato verificato dai primi byte (`wOF2`, `wOFF`, `0x00010000` o `true`,
  `OTTO`), non dall'estensione.
- Uno slot di `config.tema.font` (`titolo`, `testo`, `mono`) accetta, oltre ai nomi del catalogo,
  `caricato:<id>` di un font esistente.
- `@font-face` di un font caricato: `font-family: 'sb-<id>'`, `src: url('<percorso>')
  format('<formato>')`, `font-display: swap`. Il percorso è relativo a chi lo carica: da
  `css/tema.css` `../contenuti/font/<file>`, da `<style>` dentro la pagina `contenuti/font/<file>`.
- Un font in uso (in uno slot o in `config.stili`) non si cancella senza conferma esplicita (§7).
- Da mettere online: `contenuti/font/` insieme a `contenuti/media/` (GUIDA lo scrive).

### 4.5 Valori di partenza

In `contenuti.json`: `config.sezioni` con le sei sezioni attive nell'ordine di oggi, `config.stili`
= `{}`, `config.disposizione` = `{ "blocchi": {} }`. Con questi valori il sito generato è identico a
prima a parte gli attributi `data-sb-*` (§15).

---

## 5. Marcatori nei modelli (agente MARCATORI)

### 5.1 Regole

1. Nei modelli si aggiungono **solo attributi `data-sb-*`** e i cicli/condizioni del §5.2. Nessun
   elemento nuovo, nessuna classe nuova, nessun `id` nuovo, nessun cambio di rientro o di a capo.
2. Gli attributi **restano nella pagina pubblicata** (come `data-widget` a Mobscene93): servono al
   motore, a `sb-stili` e a `sb-disposizione` sul sito vero.
3. `data-sb-sezione="<id>"` su: `aside#binario` (`binario`), `section#regia`, `section#diretta`,
   `section#settimana`, `section#chi`, `section#supporto`, `section#saluti`, `footer.piede` (`piede`).
4. `data-sb-testo="<chiave dello schema>"` su un elemento il cui contenuto è **esattamente un solo
   segnaposto** (`{{chiave}}` o `{{{chiave}}}`) di un campo di tipo `testo`, `testolungo` o `ricco`.
   Vale anche dentro un ciclo, se il valore dell'attributo è una chiave dello schema (le voci del
   binario: `data-sb-testo="{{chiave}}"`). Non si marcano: valori calcolati (`sito.*`), voci di elenchi
   di `config` (`config.social[].nome`, `config.supporto[].titolo`: si modificano dalla loro parte),
   `config.ultimaDiretta` (lo riscrive Twitch), elementi con testo misto (`© {{sito.anno}}
   {{footer.copy}}`), testi dentro attributi. Una chiave può comparire su più elementi.
5. `data-sb-immagine="config.immagini.<nome>"` su un `<img>` il cui `src` è esattamente quel
   segnaposto. Se il suo `alt` è un segnaposto di una chiave dello schema, anche
   `data-sb-alt="<chiave>"`.
6. `data-sb-parte="<nome>"` sul contenitore **già esistente** di una parte guidata dai dati (§5.4),
   **dentro** l'eventuale blocco, così la catena resta testo ⊂ parte ⊂ blocco ⊂ sezione.
7. `data-sb-riquadro="<sezione>"` e `data-sb-blocco="<sezione>.<nome>"` (§5.5).

### 5.2 Sezioni in ordine e link verso sezioni spente

- Il binario scrive le voci con un ciclo su `sito.voci` (§6.1): con i valori di partenza l'HTML è
  identico a quello di oggi, rientri e a capo compresi.
- Ogni `<a href="#<sezione>">` che punta a una sezione ordinabile diversa da `regia` si avvolge in
  `{{#se sito.attiva.<sezione>}}…{{/se}}`, messo in modo che con la sezione attiva l'uscita non cambi
  di un byte. Una sezione spenta non lascia link morti.
- `main` in `modelli/index.html` lo scrive SERVER (§6.1).

### 5.3 Catena di selezione

Dal più interno al più esterno: `testo:` / `immagine:` → `parte:` → `blocco:` → `sezione:`. Un elemento
che è insieme parte e blocco dà due voci con lo stesso elemento (prima la parte).

### 5.4 Registro delle parti

Le parti sono i punti della pagina che vengono da dati strutturati o da configurazione. Nella scheda
Contenuto mostrano **i campi dello schema elencati qui**, disegnati con `creaCampo`.

| parte | elemento (parziale) | campi nella scheda Contenuto |
|---|---|---|
| `social` | `ul.binario__social` (binario) **e** `ul#social` (saluti) | `config.social` |
| `stato` | `div.quadro__stato` (regia) | `deck.etichettaStato`, `deck.statoVerifica`, `deck.statoLive`, `deck.statoOffline`, `deck.etichettaProssima`, `deck.etichettaUltima`, `config.ultimaDiretta`, `config.orari` |
| `monitor` | `div.monitor` (diretta) | `deck.notaPlayer`, `deck.chatApri`, `deck.chatChiudi`, `nav.vaiAlCanale`, `config.twitch.canale` |
| `account` | `div.account` (diretta, se stampato) | tutto il gruppo `account` |
| `pollo` | `div#pollo` (pollo, se stampato) | tutto il gruppo `pollo` |
| `lurk` | `section#lurk` (lurk, se stampato) | tutto il gruppo `lurk` |
| `clip` | `div.clip` (clip, se stampato) | tutto il gruppo `clip` |
| `nastro` | `ol#nastro` (settimana) | `config.orari`, `settimana.etichettaDiretta`, `settimana.etichettaRiposo`, `settimana.etichettaOggi`, `settimana.etichettaProssima` |
| `listino` | `ol#listino` (supporto) | `config.supporto` |

Gruppi dello schema ↔ sezioni (per i «testi che non si vedono in pagina», §11.3): `marchio` ↔
`binario`, `deck` ↔ `regia`, `diretta` ↔ `diretta`, `settimana` ↔ `settimana`, `chi` ↔ `chi`,
`supporto` ↔ `supporto`, `saluti` ↔ `saluti`, `piede` ↔ `piede`. I gruppi `account`, `lurk`, `pollo`,
`clip` stanno nelle loro parti dentro `diretta`. Tre gruppi non stanno in nessun punto della pagina e
diventano viste del menu ☰: `meta` → «Google e social», `canale` → «Canale, contatti e immagini»,
`aspetto` → «Impostazioni del sito».

### 5.5 Riquadri e blocchi

Proposta di partenza. MARCATORI la **verifica nel browser** e può cambiare elementi e nomi, rispettando
le regole; il registro finale va nelle decisioni (§14) e da lì in `nomi.js` (PARTI).

| riquadro | elemento del riquadro | blocchi proposti |
|---|---|---|
| `regia` | `div.regia__griglia` | `regia.quadro` → `div.quadro` · `regia.dati` → `ul.quadro__dati` |
| `settimana` | `section#settimana` | `settimana.testa` → `div.settimana__testa` · `settimana.nastro` → `ol#nastro` · `settimana.piede` → `div.settimana__piede` |
| `chi` | `section#chi` | `chi.corpo` → `div.chi__corpo` · `chi.margine` → `aside.chi__margine` · `chi.ritratto` → `figure.chi__ritratto` |
| `supporto` | `section#supporto` | `supporto.testa` → `div.sezione__testa` · `supporto.listino` → `ol#listino` · `supporto.chiusura` → `p.supporto__chiusura` |
| `saluti` | `section#saluti` | `saluti.social` → `div.saluti__social` · `saluti.contatti` → `div.contatti` · `saluti.chiusura` → `p.saluti__chiusura` |
| `piede` | `footer.piede` | `piede.copy` · `piede.disclaimer` · `piede.nota` (i tre `p`) |

Vincoli, tutti verificati con il browser:

- il riquadro ha una **larghezza che non dipende dal contenuto**;
- il riquadro **non** è il contenitore grid/flex che assegna `grid-area`, `grid-column`, `grid-row` o
  `order` ai blocchi (in `chi` quel contenitore è `.chi__griglia`: per questo il riquadro proposto è la
  sezione). Fra riquadro e blocco non ci deve essere nessun antenato posizionato o con `transform`,
  `filter`, `contain`, `will-change`: altrimenti il blocco assoluto si misura su un altro rettangolo;
- 2–5 blocchi per riquadro, raggruppamenti che esistono già;
- **mai** dentro `#binario` (è `position: fixed`), `#diretta`, il pollo, elementi `sticky` come
  riquadro, `.regia__sfondo`.

---

## 6. Generazione e anteprima (agente SERVER)

### 6.1 Contesto nuovo

`costruisciContesto` aggiunge:

- `sito.sezioni` — le sezioni attive di `config.sezioni` in ordine;
- `sito.attiva` — `{ regia: true, diretta, settimana, chi, supporto, saluti }` booleani;
- `sito.voci` — per il binario: `[{ id, chiave, testo }]` delle sezioni attive, `chiave` = `nav.<id>`
  e `testo` il suo valore;
- `sito.corpo` — l'HTML delle sezioni attive, ciascuna resa dal suo parziale, in ordine: è quello che
  `modelli/index.html` stampa in `main` con `{{{sito.corpo}}}`. Il motore dei modelli non ha inclusioni
  dinamiche e non gliene serve una: la concatenazione la fa la generazione;
- `sito.cssStili`, `sito.cssDisposizione` — il CSS del §4.2 e del §4.3 (`''` se niente), prodotto con
  `pannello/condivisi/stili.js`. `modelli/index.html` li stampa **solo se non vuoti**, dopo l'ultimo
  `<link rel="stylesheet">`, in `<style id="sb-disposizione">` e poi `<style id="sb-stili">`. Un `<`
  dentro il CSS esce come `\3C `.
- `sito.fontUrl` comprende anche le famiglie del catalogo usate in `config.stili`.

Con i valori di partenza `index.html`, `js/dati.js` e `css/tema.css` restano identici (§15): SERVER lo
verifica con lo strumento del §15 dopo ogni passo.

### 6.2 Tema e font caricati

`server/lib/tema.js`: gli slot con `caricato:<id>` emettono il loro `@font-face` in testa a
`css/tema.css` e `--font-<slot>: 'sb-<id>', <ripiego dello slot>`. Con i font del catalogo niente
cambia.

### 6.3 Anteprima dell'editor

`POST /api/anteprima` con corpo `{ contenuti, editor: true }` (senza `editor` resta com'è oggi) rende
l'HTML dei contenuti in arrivo uniti a quelli salvati, e prima di rispondere:

1. toglie **tutti** gli `<script src="…">` (resta il JSON-LD, che non è eseguibile);
2. mette `<base href="/">` come primo figlio di `<head>`;
3. stampa **sempre** `<style id="sb-disposizione">` e `<style id="sb-stili">`, anche vuoti, così il
   motore li trova e li spegne quando inietta i suoi.

### 6.4 Unione dei salvataggi

`archivio.unisci`: `config.sezioni`, `config.stili` e `config.disposizione` si **sostituiscono in
blocco** quando arrivano. Con la fusione chiave per chiave uno stile tolto nel pannello rinascerebbe
dal salvato.

### 6.5 Pulizia prima di salvare e di generare

`PUT /api/contenuti`, `POST /api/anteprima` e la generazione passano i tre rami da `pulisciSezioni`,
`pulisciStili`, `pulisciDisposizione` (§8) **prima** della convalida: un valore sbagliato si scarta,
non blocca il salvataggio del resto. La convalida (DATI) controlla solo la forma che resta.

---

## 7. API nuove (agente SERVER)

Tutte con sessione, `Origin` estraneo rifiutato, errori `{ errore: "…" }` in italiano.

| Metodo e percorso | Fa |
|---|---|
| `POST /api/anteprima` `{ contenuti, editor: true }` | §6.3 |
| `GET /api/font` | `{ font: [{ id, etichetta, file, formato, caricatoIl, usatoIn: ["Impostazioni · Titoli", "Stile di testo:deck.titolo"] }] }` |
| `POST /api/font` | `multipart/form-data` con `file` e `etichetta` → `201 { ok, font }`; `413` oltre 2 MB, `415` formato non riconosciuto |
| `DELETE /api/font/<id>` | `409 { errore, usatoIn }` se in uso; con `?forza=1` cancella lo stesso |
| `POST /api/password` `{ attuale, nuova }` | `200 { ok }`; `403` se `attuale` è sbagliata; `422` se `nuova` è più corta di `MIN_PASSWORD`. Le altre sessioni si chiudono |

`GET /api/contenuti` aggiunge `editor: { font: <come GET /api/font>, sezioni: SEZIONI_ORDINABILI, riquadri: RIQUADRI }`.
`server/lib/statico.js` serve `contenuti/font/` come già `contenuti/media/`.

`server/lib/font.js` (nuovo): `elenco()`, `salva(corpo, tipoContenuto)`, `elimina(id, contenuti, { forza })`,
`esiste(id)`, `voce(id)`, `usatoIn(id, contenuti)`, `MAX_BYTE`. DATI usa `esiste(id)` nella convalida
degli slot.

---

## 8. Generatore condiviso — `pannello/condivisi/stili.js` (agente DATI)

Un file solo per server e pannello: **anteprima e sito pubblicato non possono divergere**. UMD senza
dipendenze, funzioni pure (niente DOM, niente `fs`):

```js
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.SBStili = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () { /* … */ });
```

Il server lo carica con `require('../../pannello/condivisi/stili.js')`; il pannello con un
`<script src="condivisi/stili.js">` classico prima del modulo, e i moduli lo leggono da
`window.SBStili`.

```js
SBStili = {
  DISPOSITIVI,          // ['computer', 'tablet', 'telefono']
  CASCATA,              // { tablet: '(max-width: 1099.98px)', telefono: '(max-width: 759.98px)' }
  FASCE,                // { telefono: '(max-width: 759.98px)', tablet: '(min-width: 760px) and (max-width: 1099.98px)', computer: '(min-width: 1100px)' }
  LARGHEZZE,            // { telefono: 375, tablet: 900, computer: 1100 }  (computer = minimo)
  COLORI_TEMA,          // { viola: '--viola', …12 }
  SEZIONI,              // ['binario','regia','diretta','settimana','chi','supporto','saluti','piede']
  SEZIONI_ORDINABILI,   // ['regia','diretta','settimana','chi','supporto','saluti']
  RIQUADRI,             // ['regia','settimana','chi','supporto','saluti','piede']
  PROTETTI,             // ['sezione:diretta', 'parte:monitor']
  VIETATE_AI_PROTETTI,  // ['nascosto', 'opacita']
  PROPRIETA,            // [{ nome, css, tipo, min, max, passo, unita, valori, etichetta, gruppo }] in ordine d'uscita
  MAX_BERSAGLI,         // 1000

  leggiBersaglio(id),               // -> { tipo, chiave } | null
  selettoreDi(id),                  // -> '[data-sb-testo="deck.titolo"]' | null
  pulisciValore(bersaglio, proprieta, valore, opzioni),   // -> valore pulito | null
  pulisciStili(stili, opzioni),     // -> oggetto pulito (mai lancia)
  stiliCss(stili, opzioni),         // -> stringa ('' se niente)
  risolvi(voce, dispositivo, proprieta),  // -> { valore, da } con la cascata telefono ← tablet ← computer
  pulisciDisposizione(disposizione),      // -> { blocchi: { … } }
  disposizioneCss(disposizione, { presente(riquadro, id) }),   // -> stringa
  pulisciSezioni(sezioni)           // -> elenco normalizzato del §4.1
};
```

`opzioni` di `pulisci*`/`stiliCss`: `{ famiglia(nome) -> { nome, ripiego } | null, font(id) -> { id, file, formato } | null, base: '' }`.
Senza `famiglia` o `font` le dichiarazioni che ne hanno bisogno si saltano; `ruolo:` funziona sempre.

Uscita di `stiliCss`: in testa gli `@font-face` dei `caricato:` usati; poi le regole `computer`, poi
`@media (max-width: 1099.98px)`, poi `@media (max-width: 759.98px)`; in fondo i blocchi di `nascosto` a
fasce esclusive (`computer`, `tablet`, `telefono`) con `display: none !important` per ogni bersaglio in
cui il valore **effettivo** è vero. `nascosto: false` su computer è il default e non si salva; su
tablet e telefono `false` fa ricomparire un elemento nascosto da un dispositivo più grande. Ogni
dichiarazione con `!important`.

`server/lib/convalida.js` (DATI): per i tre rami controlla solo la forma rimasta dopo la pulizia; per
`config.tema.font.*` accetta `caricato:<id>` se `font.esiste(id)`. `contenuti/schema.js`: `EDITOR =
['config.sezioni', 'config.stili', 'config.disposizione']`, saltati dalla copertura ed esportati.

---

## 9. Il pannello: struttura dell'editor (agente GUSCIO)

### 9.1 Dopo l'accesso

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ☰  [avatar] slayer_beard · <elemento>   [Telefono][Tablet][Computer]  ↶ ↷      │
│                                      ● stato   [Salva · bozza] [Pubblica]        │
├────────────────────────────────┬────────────────────────────────────────────────┤
│ PANNELLO                        │                                                │
│ 480 px, trascinabile 380–760,   │            ANTEPRIMA DEL SITO                  │
│ larghezza ricordata             │         (telaio del dispositivo, zoom)         │
│ Pagina › Chi sono › Titolo      │                                                │
│ [CONTENUTO][STILE][AVANZATE]    │                                                │
│  …controlli…                    │                                                │
└────────────────────────────────┴────────────────────────────────────────────────┘
```

- Il pannello sta **a sinistra**, come la colonna di oggi.
- **Nessuna selezione** → vista «Pagina»: il Navigatore (PARTI), le scorciatoie alle viste del menu e
  i quattro passi «Come si lavora» che il pannello ha già.
- **Menu ☰** — viste dentro il pannello, con «← Torna all'editor»: Impostazioni del sito (TEMA),
  Struttura della pagina (Navigatore di PARTI), Canale, contatti e immagini (gruppo `canale`), Google
  e social (gruppo `meta`), Immagini (`creaLibreria`), Copie di sicurezza (`creaBackup`), Password,
  Esci.
- **Ricerca dei campi** (`Ctrl+K`) resta: un risultato con marcatore in pagina seleziona l'elemento
  nell'anteprima; gli altri aprono la vista o la parte dove sta il campo.
- **Errori di convalida** al salvataggio: un riepilogo cliccabile che porta al campo (elemento
  nell'anteprima, parte o vista).
- Sotto i 1024 px il pannello è a scomparsa sopra l'anteprima.
- **Annulla / Ripeti**: istantanee di `{ testi, config }` su `sb:modifica` con attesa di 400 ms,
  massimo 50. `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Maiusc+Z` fuori da campi e testi in scrittura. Dopo un
  ripristino: `sb:sostituito`, riallineamento completo e ricarica dell'anteprima.
- Resta tutto quello che c'è: `Ctrl+S`, avviso prima di chiudere, sessione scaduta con ripresa,
  pubblicazione con i suoi avvisi (Twitch, clip, controlli).
- I moduli dell'editor si caricano con `import()` dinamico: se uno manca o lancia, l'editor parte lo
  stesso e lo dice in un avviso.

### 9.2 Il ponte — `pannello/editor/ponte.js`

Tutti i moduli dell'editor lo importano: `import { ponte } from './ponte.js'`. Lo riempie
`pannello.js` all'avvio.

```js
export const ponte = {
  pronto: false,                 // true dopo il primo caricamento dei contenuti
  stato: null,                   // lo stato vivo di pannello.js: { dati: { versione, aggiornatoIl, testi, config }, schema, tema, stato }
  api: null,                     // il client di moduli/api.js, esteso: anteprima({ contenuti, editor }), font(), caricaFont(file, etichetta),
                                 // eliminaFont(id, { forza }), cambiaPassword(attuale, nuova)
  leggi(chiave),                 // leggiChiave(stato.dati, chiave)
  scrivi(chiave, valore, { strutturale = false } = {}),   // scriviChiave + spia «non salvato» + evento sb:modifica
  segnala(chiave, { strutturale = false } = {}),          // solo l'evento, dopo una modifica fatta sul posto (es. config.stili)
  campo(chiave),                 // la definizione del campo nello schema (anche i campi dentro gli elenchi: no) | null
  gruppo(id), gruppoDi(chiave),  // il gruppo dello schema | null
  etichetta(chiave),             // l'etichetta del campo, o la chiave
  creaCampo(campo),              // -> controllo di moduli/campi.js già collegato a leggi/scrivi; ogni modifica emette sb:modifica
  scegliImmagine(valoreCorrente),// -> Promise<percorso | null>
  salva(), pubblica(),
  avviso, conferma, apriDialogo  // quelli di moduli/avvisi.js
};
```

### 9.3 Eventi sul `document` del pannello

| evento | `detail` | chi lo emette |
|---|---|---|
| `sb:pronto` | `{}` | GUSCIO, contenuti caricati e editor montato (si ripete a ogni nuovo accesso) |
| `sb:modifica` | `{ chiave, strutturale }` | il ponte |
| `sb:sostituito` | `{ motivo: 'annulla'|'ripeti'|'ripristino'|'ricarica' }` | GUSCIO: `stato.dati` è un oggetto nuovo, chi ne tiene copie le rilegge |
| `sb:dispositivo` | `{ dispositivo }` | MOTORE |
| `sb:anteprima-pronta` | `{}` | MOTORE, dopo ogni caricamento dell'anteprima |
| `sb:ispettori` | `{ scheda }` | MOTORE, quando qualcuno registra un ispettore |

### 9.4 Sincronizzazione (la orchestra GUSCIO)

Su `sb:modifica`: chiave che inizia con una chiave di `testi` o con `config.immagini` →
`motore.aggiornaTesti()`; `config.tema` → `motore.aggiornaTema()`; `config.stili` →
`motore.aggiornaStili()`; `config.disposizione` → `motore.aggiornaDisposizione()`; tutto il resto, e
ogni `strutturale`, → `motore.ricarica({ tieniScorrimento: true })` dopo 700 ms di calma. Durante una
ricarica chiesta da GUSCIO la selezione si conserva e il campo in cui si scrive non perde il fuoco.

---

## 10. Il motore — `pannello/editor/motore.js` (agente MOTORE)

```js
export const motore = {
  monta(contenitore, { dispositivo }),     // -> Promise; crea telaio + iframe dentro il contenitore
  ricarica({ tieniScorrimento = false }),  // -> Promise; POST /api/anteprima editor:true, document.write nell'iframe
  documento(), finestra(),                 // dell'iframe, o null

  impostaDispositivo(d), dispositivo(),    // 'telefono' | 'tablet' | 'computer'; emette sb:dispositivo
  impostaZoom('adatta' | 'reale'), zoom(), // zoom() -> { modo, scala, adatta }

  seleziona(id), selezione(), percorso(),  // percorso() -> [meta] dalla sezione alla selezione
  suSelezione(fn),                         // -> funzione che toglie l'iscrizione
  evidenzia(id | null), scorriA(id),

  registraIspettore(fn, { scheda: 'contenuto'|'stile'|'avanzate', ordine, quando(meta) }),
  disegnaIspettori(scheda, contenitore, meta),   // -> numero di riquadri disegnati; non svuota il contenitore

  posizione(idBlocco, dispositivo), impostaPosizione(idBlocco, pos | null),

  aggiornaTesti(),        // riapplica testi e immagini dallo stato ai marcatori (salta il testo in scrittura)
  aggiornaTema(),         // POST /api/tema -> <style id="sb-tema-dal-vivo">
  aggiornaStili(),        // SBStili.stiliCss -> <style id="sb-stili-dal-vivo">, spegne #sb-stili
  aggiornaDisposizione(), // SBStili.disposizioneCss -> <style id="sb-disposizione-dal-vivo">, spegne #sb-disposizione
  chiaveGuidata(chiave),  // vero se il testo arriva da un elenco e non si scrive sul posto
  contorni(acceso), griglia(acceso)
};
```

`meta = { id, tipo: 'testo'|'immagine'|'parte'|'blocco'|'sezione', chiave, el, sezione, etichetta,
puoPosizionare, riquadro, genitore }` — `genitore` è il meta successivo della catena (`null` in cima),
`etichetta` il nome umano da `pannello/editor/nomi.js` (PARTI), `riquadro` il riquadro più vicino di un
blocco (`el.parentElement.closest('[data-sb-riquadro]')`).

Obblighi presi da Mobscene93 (§10.4 e §10.11 del brief, trappole del §7 della guida), in breve:

- struttura `telaio > zoom > cornice > iframe`: l'iframe è largo quanto il dispositivo, la cornice si
  scala; il motore lavora **solo in coordinate dell'iframe**, maniglie ed etichette si ingrandiscono di
  `1/scala`;
- nell'iframe blocca la navigazione (link, invio di form), aggiunge solo i propri `<style>` e listener;
- selezione con clic, contorno al passaggio, etichetta; `Esc` sale al genitore; frecce / Maiusc+frecce
  / Alt+frecce spostano o ridimensionano il blocco scelto; `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y` premuti
  nell'iframe si rilanciano sul `document` del pannello;
- maniglie solo con `puoPosizionare`; al primo spostamento in un riquadro fissa anche gli altri blocchi
  dove sono; «Riporta al posto originale» li rimette nel flusso;
- scrive `config.disposizione.blocchi.<riquadro>` e chiama `ponte.segnala('config.disposizione')`;
- registra da sé l'ispettore delle posizioni: scheda `avanzate`, `quando: meta.puoPosizionare`;
- un elemento nascosto al dispositivo corrente non disegna riquadro né etichetta.

---

## 11. Gli ispettori

### 11.1 CONTENUTI — `pannello/editor/contenuti.js`

`registraIspettore(render, { scheda: 'contenuto', ordine: 10, quando: tipo testo o immagine })`.

- **Testi**: doppio clic sul testo o «Scrivi qui» → scrittura sul posto. Tipo `ricco`: grassetto,
  corsivo, sottolineato, link, a capo, pulisci, con la **stessa** lista di tag del server
  (`moduli/ricco.js` → `sanifica`); tipo `testo`/`testolungo`: solo testo, niente HTML (l'incolla si
  ripulisce). A ogni input `ponte.scrivi(chiave, valore)`. `max` dello schema con contatore dei
  caratteri visibili e avviso quando si supera. `Esc` o `Ctrl+Invio` chiudono.
- Nella scheda: etichetta e aiuto dallo schema, il campo stesso (`ponte.creaCampo`), e per i testi
  guidati da un elenco (`motore.chiaveGuidata`) il rimando alla parte che li contiene.
- **Immagini**: miniatura, «Cambia immagine» (`ponte.scegliImmagine`, che carica anche dal computer),
  campo `alt` se c'è `data-sb-alt`.

### 11.2 STILE — `pannello/editor/stile.js`

`registraIspettore(renderStile, { scheda: 'stile', ordine: 10 })` e
`registraIspettore(renderAvanzate, { scheda: 'avanzate', ordine: 50 })`.

- Gruppi: Tipografia (solo testo, parte, blocco, sezione), Colori, Sfondo, Spazi, Bordi, Effetti; in
  Avanzate: Visibilità per dispositivo, Larghezza massima, «Ripristina lo stile di questo elemento».
- Selettore del dispositivo collegato a quello della barra (`motore.impostaDispositivo`), valore
  ereditato da un dispositivo più grande indicato, segnaposto «come nel sito» letti con
  `getComputedStyle` sull'elemento nell'iframe.
- Colori con `coloreControllo`, font con `fontControllo` (TEMA). Ogni valore passa da
  `SBStili.pulisciValore`; cursori con min/max di `SBStili.PROPRIETA`.
- Scrive `config.stili[bersaglio][dispositivo][proprietà]`, toglie i vuoti, e **una volta per
  fotogramma** `ponte.segnala('config.stili')` + `motore.aggiornaStili()`.
- Bersagli protetti (§4.2) e qualunque elemento che contiene `#twitch-embed`: niente «nascosto» e
  niente opacità, con una riga che spiega perché.

### 11.3 PARTI — `pannello/editor/parti.js` e `pannello/editor/nomi.js`

- `nomi.js`: `nomeSezione(id)`, `nomeParte(nome)`, `nomeBlocco(id)`, `descrizioneParte(nome)`,
  `descrizioneSezione(id)`. **Unica fonte** dei nomi umani per percorso, barra e pannello.
- Ispettore `parte` (scheda contenuto, ordine 20): titolo, frase, i campi del registro §5.4 con
  `ponte.creaCampo`.
- Ispettore `sezione` (scheda contenuto, ordine 20): interruttore «Mostra questa sezione» su
  `config.sezioni` (strutturale; `regia`, `binario`, `piede` bloccate); per `diretta` gli interruttori
  delle parti che possono non essere stampate (`config.account.attivo`, `config.lurk.attivo`,
  `config.pollo.attivo`, `config.clip.attivo`); «Cosa contiene» (parti, blocchi, testi cliccabili →
  `motore.seleziona`); «Testi che non si vedono in pagina»: i campi del gruppo della sezione che non
  hanno un marcatore nell'anteprima e non stanno in una parte (stati per i lettori di schermo, alt,
  etichette usate dal JavaScript), disegnati con `ponte.creaCampo`.
- `disegnaNavigatore(contenitore)`: `binario` in cima e `piede` in fondo fissi; le sei sezioni con ↑ ↓
  e trascinamento, occhio per la visibilità, `regia` bloccata; clic → `motore.seleziona` +
  `motore.scorriA`; passaggio del mouse → `motore.evidenzia`.

### 11.4 TEMA — `pannello/editor/impostazioni.js`

- `disegnaImpostazioni(contenitore)`: i campi del gruppo `aspetto` (con `ponte.creaCampo`), la barra
  dei preset (`creaBarraTema` di `moduli/tema.js`), la libreria dei **font caricati** (elenco, carica,
  elimina con avviso di uso e conferma per forzare). Dopo ogni modifica `motore.aggiornaTema()` al
  massimo una volta per fotogramma.
- `coloreControllo({ etichetta, valore, alCambio, vuoto })` → nodo con `leggi()` / `imposta(v)`: i 12
  colori del tema come campioni (`var:<chiave>`), colore libero `#RRGGBB`, «come nel sito» (`null`).
- `fontControllo({ etichetta, valore, alCambio, vuoto })`: `ruolo:titolo|testo|mono` in cima, poi il
  catalogo (`famiglia:<nome>`), poi i caricati (`caricato:<id>`), «come nel sito» (`null`).
- `caricaFont()` → Promise `{ catalogo, caricati }`; `voceFont(id)` e `voceFamiglia(nome)` per le
  `opzioni` di `SBStili`.
- In `moduli/campi.js` il campo `font` degli slot elenca anche i font caricati.

---

## 12. Grafica: il pannello parla la lingua della regia

- Solo le variabili di `pannello.css` (`--p-fondo`, `--p-pannello*`, `--p-linea*`, `--p-testo*`,
  `--p-viola`, `--p-ciano`, `--p-magenta`, `--p-ok`, `--p-allerta`, `--p-errore`, `--p-raggio*`,
  `--p-passo`, `--p-mono`, `--p-font`, le durate). Nessun esadecimale nei CSS nuovi del pannello; se
  serve una variabile nuova la aggiunge GUSCIO in `pannello.css`.
- Etichette, schede, occhielli, nomi di sezione: `--p-mono`, maiuscolo, spaziatura larga, come la
  strumentazione del sito. Linee da 1 px. Superfici piatte.
- **Viola** per l'azione principale e ciò che è scelto; **ciano** per ciò che è acceso: fuoco,
  elemento selezionato nell'anteprima, maniglie; **magenta** col contagocce.
- Nell'anteprima: contorno di selezione ciano, contorno al passaggio `--p-linea-viva`, etichetta in
  monospazio su fondo `--p-pannello`.
- Bottoni, campi, dialoghi e avvisi: quelli che il pannello ha già (`.btn`, `.campo`, `apriDialogo`,
  `avviso`). Niente componenti nuovi se ne esiste uno.
- `prefers-reduced-motion`, fuoco sempre visibile, navigazione da tastiera: come nel resto del
  pannello. Da 360 px in su.

---

## 13. Proprietà dei file

| Agente | File di sua ESCLUSIVA proprietà |
|---|---|
| **DATI** | `pannello/condivisi/stili.js` (nuovo), `server/lib/convalida.js`, `contenuti/schema.js`, `contenuti/contenuti.json` |
| **SERVER** | `modelli/index.html`, `server/lib/costruisci.js`, `server/lib/api.js`, `server/lib/archivio.js`, `server/lib/tema.js`, `server/lib/statico.js`, `server/lib/percorsi.js`, `server/lib/autenticazione.js`, `server/lib/modello.js`, `server/lib/backup.js`, `server/lib/media.js`, `server/lib/font.js` (nuovo), `server/server.js`, `server/genera.js`, `contenuti/font/` (nuova, con `elenco.json` vuoto `[]`) |
| **MARCATORI** | `modelli/parziali/*.html` |
| **MOTORE** | `pannello/editor/motore.js`, `pannello/editor/motore.css` |
| **CONTENUTI** | `pannello/editor/contenuti.js`, `pannello/editor/contenuti.css` |
| **STILE** | `pannello/editor/stile.js`, `pannello/editor/stile.css` |
| **PARTI** | `pannello/editor/parti.js`, `pannello/editor/parti.css`, `pannello/editor/nomi.js` |
| **TEMA** | `pannello/editor/impostazioni.js`, `pannello/editor/impostazioni.css`, `pannello/moduli/tema.js`, `pannello/moduli/campi.js`, `pannello/campi.css` |
| **GUSCIO** | `pannello/index.html`, `pannello/pannello.js`, `pannello/pannello.css`, `pannello/editor/ponte.js`, `pannello/editor/guscio.js`, `pannello/editor/guscio.css`, `pannello/moduli/api.js`, `pannello/moduli/avvisi.js`, `pannello/moduli/dom.js`, `pannello/moduli/elenchi.js`, `pannello/moduli/media.js`, `pannello/moduli/backup.js`, `pannello/moduli/ricco.js` |
| **COLLAUDO** (dopo) | `server/autotest.js`, correzioni ovunque serva, annotate |
| **GUIDA** (dopo) | `README.md`, `docs/PANNELLO.md`, `CHANGELOG.md` |
| (integratore) | `CONTRATTO-4.md`, i CSS del sito (`css/*`), `img/**` |

`index.html`, `js/dati.js` e `css/tema.css` alla radice restano **generati**: nessuno li scrive e
nessuno lancia `node server/genera.js` sul repository vero. Nessuno crea file oltre a quelli assegnati
(i propri test e appunti vanno nella cartella di lavoro del §14). I CSS del sito non si toccano: se a
qualcuno sembra necessario, lo scrive nelle decisioni e decide l'integratore.

Per lavorare in parallelo senza vedersi il codice, ognuno **legge** i file degli altri quando esistono
e le loro decisioni (§14), ma scrive solo i suoi. Una richiesta a un altro agente si scrive nelle
proprie decisioni con `→ AGENTE:` davanti.

---

## 14. Convivenza fra agenti

Cartella di lavoro: `C:\Users\Filippo\AppData\Local\Temp\claude\C--Users-Filippo\b42f1f6d-a46d-4933-9710-77b63174b769\scratchpad\slayer\`
(qui sotto `LAVORO\`).

- **Niente git**: nessuno usa stash, checkout, reset, commit, push. Committa l'integratore.
- **Prove su copie**: `powershell -NoProfile -ExecutionPolicy Bypass -File LAVORO\strumenti\copia.ps1 -Agente <chiave>`
  crea `LAVORO\copie\<chiave>\` (senza `.git`, senza `server\dati` veri, password
  `prova-editor-slayer-2026`); `-Aggiorna` ricopia i file cambiati tenendo i contenuti della prova.
  Il server di prova si avvia **dentro la copia** con `SB_PORTA` sulla propria porta e
  `SB_AGGIORNA_MIN=0`, e si spegne a fine prova. **Mai** salvare o pubblicare sul repository vero.
- **Porte**: DATI 4181 · SERVER 4182 · MARCATORI 4183 · MOTORE 4184 · CONTENUTI 4185 · STILE 4186 ·
  PARTI 4187 · TEMA 4188 · GUSCIO 4189 · COLLAUDO 4191. (4173 è del server vero, 4190 del cruscotto.)
- **Un solo Chrome headless alla volta**: `node LAVORO\strumenti\lucchetto.js prendi <chiave>` prima
  di avviarlo, `node LAVORO\strumenti\lucchetto.js lascia <chiave>` appena chiuso (anche se la prova
  fallisce). Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`, profilo in
  `LAVORO\chrome\<chiave>`. Si pilota con il DevTools Protocol e il `WebSocket` integrato di Node 24.
- **Avanzamento**: `node LAVORO\strumenti\progresso.js <chiave> <percento> "<passo>"` a ogni passo
  vero (almeno ogni 20 minuti); 100 solo a lavoro finito e verificato. Il committente lo guarda su
  http://127.0.0.1:4190.
- **Decisioni** che toccano gli altri: `LAVORO\decisioni\<chiave>.md`, una riga per decisione, subito,
  non a fine lavoro. Si leggono quelle degli altri prima di integrare.
- **Rapporto finale**: `LAVORO\rapporti\<chiave>.md` — cosa è fatto, file toccati, prove fatte con
  l'esito vero, cosa resta aperto, richieste agli altri.
- Italiano, zero dipendenze, niente dialoghi nativi del browser (`alert`, `confirm`, `prompt`).

---

## 15. Verifiche

- **Regola d'oro** (SERVER, MARCATORI, DATI dopo ogni passo che tocca la generazione):
  `node LAVORO\strumenti\regola-oro.js confronta [radice]` rende le pagine con il codice della radice
  (di serie il repository) e le confronta con la base salvata prima di cominciare, ignorando gli
  attributi `data-sb-*` e gli istanti. Deve dire «regola d'oro rispettata».
- **Collaudo esistente**: `node server/autotest.js` resta a 146 prove su 146 (le prove nuove le
  aggiunge COLLAUDO).
- **Ogni agente** prova il proprio pezzo nel browser vero su una copia, per quanto gli altri pezzi
  esistono già, e scrive nel rapporto cosa ha provato e cosa no.
- **COLLAUDO** (dopo): la prova completa del §9 di `docs/EDITOR-PORTABILE.md` adattata a questo sito,
  con clic e tasti veri: accesso · titolo cliccato e riscritto · stile con colore del tema e dimensione
  diversa su Telefono · Salva · Pubblica · pagina controllata · colore del tema cambiato · font caricato,
  usato e cancellato · immagine cambiata · parte modificata e anteprima ricaricata · sezione nascosta e
  riordinata (binario compreso) · blocco spostato su un solo dispositivo · «nascosto» su Computer e
  «mostra» su Telefono · Annulla/Ripeti · copia di sicurezza ripristinata · password cambiata.
  Confronto al pixel del sito generato prima/dopo a 1400 e 390 px con i valori di partenza.

---

## 16. Decisioni prese durante il lavoro

_(Compilata dall'integratore dai file di `LAVORO\decisioni\`. Prevale sul testo sopra dove è in
conflitto.)_

### 16.1 Decisioni dell'integratore

- **CSP e font caricati.** In `modelli/parziali/testa.html` la riga è `font-src 'self' https://fonts.gstatic.com;`,
  senza condizioni: senza `'self'` il browser blocca i font di `contenuti/font/` (verificato da SERVER).
  È l'unica differenza, oltre ai `data-sb-*`, che la regola d'oro accetta.
- **Player protetto, chiuso del tutto.** Per `sezione:diretta` e `parte:monitor`:
  `VIETATE_AI_PROTETTI = ['nascosto', 'opacita', 'larghezzaMax']`; nel `margine` ogni lato negativo si
  scarta; nel `riempimento` ogni lato oltre 40 si scarta. I numeri stanno in `SBStili.LATI_PROTETTI`
  (`{ margine: { min: 0 }, riempimento: { max: 40 } }`), unica fonte per generatore, convalida e scheda
  Stile. Bordo (fino a 20 px) e raggio restano ammessi: non coprono e non rimpiccioliscono il player.
- **Altezza dei riquadri con blocchi posizionati.** Resta la regola del §4.3 così com'è, come su
  Mobscene93: quando i blocchi escono dal flusso il riquadro prende `aspect-ratio: 100 / M` sul
  border-box, quindi la sua altezza cambia di qualche decina di pixel (misure in `decisioni/marcatori.md`
  nota 7). I blocchi non si spostano; si sposta il contenuto che viene dopo. Va detto nella guida.
- **Nota doppia nella vista «Struttura della pagina»**: si toglie la nota della vista, resta
  l'introduzione del Navigatore.
- **`sb:scrittura { chiave, aperta }`** (evento nuovo di CONTENUTI): con `aperta: true` il guscio porta
  davanti la scheda Contenuto (e apre il cassetto sotto i 1024 px).

### 16.2 Firme e forme fissate durante il lavoro (dettagli nei file di decisione)

- **DATI** — `leggiBersaglio`, `selettoreDi`, `pulisciValore(bersaglio, proprieta, valore, opzioni)`,
  `pulisciStili`, `stiliCss`, `risolvi` (→ `{ valore, da }` | `null`), `pulisciDisposizione`,
  `disposizioneCss(disposizione, { presente })`, `pulisciSezioni`, più `fontFace(voce, { base })`.
  Tabelle congelate. `bagliore`: `text-shadow` su testi/parti/blocchi/sezioni, `filter: drop-shadow`
  solo sulle immagini, mai `filter` sui contenitori. Id dei font caricati: 16 esadecimali minuscole.
  Un ramo dell'editor assente in `contenuti.json` non è un errore.
- **SERVER** — `sito.voci`, `sito.attiva`, `sito.sezioni`, `sito.corpo`; i due `<style>` subito dopo
  `css/lurk.css`, stampati solo se pieni. Voce di un font: `{ id, etichetta, file, formato, caricatoIl }`
  con `formato` fra `woff2 woff truetype opentype`. Uno slot `caricato:<id>` di un font eliminato torna
  alla famiglia di partenza nella pulizia, prima della convalida. I file generati si scrivono con
  riprovo se Windows li tiene occupati.
- **MARCATORI** — attributi sempre in coda al tag. Non marcati di proposito: `#monitor-titolo`,
  `<title>`, `code#email`, i testi misti (svg + testo, `© anno copy`). I due link a `#diretta` della
  copertina compaiono solo con la sezione accesa. Registro finale di riquadri, blocchi e parti in
  `decisioni/marcatori.md`: la proposta del §5.5 è rimasta senza cambi.
- **MOTORE** — meta con `elRiquadro`, `alt`, `guidata` in più; la selezione non passa da `null`
  durante una ricarica. Il motore toglie da sé ogni `<script>` eseguibile prima di `document.write`.
  Ripiego sulla bozza salvata se la rotta dell'anteprima manca. «Riporta al posto originale» svuota
  fino a `{ blocchi: {} }`.
- **CONTENUTI** — scrittura sul posto con `contenteditable` + `data-sb-scrittura`; il motore ignora
  tasti e clic che partono da lì. Aprire e chiudere senza scrivere non sporca la bozza.
- **STILE** — ispettori registrati all'import (`stile` ordine 10, `avanzate` ordine 50); scrive il
  minimo e al massimo una volta per fotogramma; controlli di ripiego se `impostazioni.js` manca.
- **PARTI** — `nomi.js` unica fonte dei nomi, con `REGISTRO_PARTI`, `chiaviParte`, `partiDellaChiave`,
  `sezioneDelGruppo`, `gruppoDellaSezione`. `config.sezioni` si scrive sempre come elenco nuovo passato
  da `pulisciSezioni`.
- **TEMA** — firme di `coloreControllo`, `fontControllo`, `caricaFont`, `voceFont`, `voceFamiglia`,
  `coloriTema`, `disegnaImpostazioni`. «Font di sistema» non è una `famiglia:`. Eliminare un font toglie
  anche le sue voci da `config.stili`.
- **GUSCIO** — firme del ponte, ordine dei fogli in `index.html`, caricamento dei moduli con
  `Promise.allSettled` e avviso unico per chi manca, container query `lato` (pannello 380–760 px),
  Annulla/Ripeti a istantanee (max 50), variabili nuove `--p-*` in `pannello.css`.
