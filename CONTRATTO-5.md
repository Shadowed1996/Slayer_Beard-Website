# CONTRATTO 5 — quinta fase: la schedule rifatta e le grafiche nuove

Addendum vincolante a `CONTRATTO.md`, `CONTRATTO-2.md`, `CONTRATTO-3.md` e `CONTRATTO-4.md`, che
**restano validi in tutto** tranne le deroghe del §2: niente npm, niente framework, niente CDN oltre
Google Fonts ed `embed.twitch.tv`, Node >= 18 con soli moduli interni, `path.join` su Windows, tutto
in italiano, nessun `TODO`, nessun placeholder, commenti che spiegano il *perché*, tono asciutto,
niente dialoghi nativi del browser, niente esadecimali fuori da `tokens.css`/`tema.css`, niente
`!important` nei fogli scritti a mano.

Gli agenti lavorano **in parallelo su file disgiunti** (§9). I nomi qui sotto tengono insieme il lavoro:
si rispettano alla lettera. Se un nome è sbagliato o manca, lo si scrive nelle proprie decisioni (§10)
e lo si usa come proposto.

---

## 0. Cosa ha chiesto il committente

1. **Rivedere tutte le immagini del sito e adeguarle in modo ottimale**, usando le grafiche nuove che
   stanno in `<cartella locale>\grafiche` (sola lettura: non si scrive lì dentro).
2. **Rifare da capo la schedule** (la sezione «La settimana» e il suo editor nel pannello): ottimale,
   funzionante con il pannello admin, **con la possibilità di caricare immagini di sfondo**.

Il progetto è **solo Slayer Beard**. Mobscene93 **non** si usa come riferimento, né si cita.
Il lavoro parte dalla repository di GitHub (`Shadowed1996/Slayer_Beard-Website`, commit `b422c0a`),
clonata in `LAVORO\repo\`: è lì che si scrive. Un tentativo precedente di schedule, mai pubblicato, non
esiste più e non va recuperato.

---

## 1. Le grafiche nuove

| file in `grafiche\` | misure | cos'è |
|---|---|---|
| `Twitch profile Banner.png` | 1200×480 | il banner del canale: pollo a sinistra, città notturna, handle YouTube / TikTok / Instagram a destra |
| `foto storie canva.png` | 1920×1080 | la città notturna pulita, senza scritte: cielo stellato, grattacieli, nebbia viola |
| `overlaycam.png` | 2558×370 | la fascia della webcam: scritta «SLAYER_BEARD» a sfumatura viola-rosa e handle Instagram |
| `spoiler maratona.png` | 996×1413 | verticale, «STARTING» al neon sulla città: l'anteprima di una maratona |
| `stinger.png` | 2556×1234 | la città sfocata con due barre di luce diagonali |

Le immagini di oggi in `img/`: `avatar.png` 600×600 (199 kB), `banner.png` 1138×480 (536 kB, il banner
vecchio con «VOD»), `mascot.png` 337×421 (135 kB, fondo non trasparente, sfumato da `css/pollo.css`),
`og.png` 1200×630 (1077 kB, taglia a metà il pollo e gli handle), `favicon.png` 256×256 (90 kB).

---

## 2. Deroghe

1. **La sezione «settimana» cambia aspetto di proposito**, e con lei `js/dati.js` (ramo `orari`, testi
   nuovi). La regola d'oro (CONTRATTO-4 §15) resta valida per **tutto il resto** della pagina: fuori
   dalla sezione `#settimana`, dal ramo `orari` di `dati.js` e dai punti dove cambiano le immagini (§7),
   l'HTML generato non cambia di un byte.
2. **Un attributo `style` nella pagina**, solo così: `style="--fuoco: X% Y%; --velo: V"` (e
   `--intensita` per il fondale), con numeri già ripuliti dal server. Serve a posizionare le immagini
   caricate; la CSP ha già `style-src 'unsafe-inline'`. Nessun'altra proprietà in un `style`.
3. **Modelli**: in `settimana.html` elementi, classi e cicli nuovi sono ammessi (è una sezione rifatta).
   Negli altri parziali valgono ancora le regole del CONTRATTO-4 §5.1, tranne gli attributi delle
   immagini del §7.3.
4. **`config.orari` si sostituisce in blocco** nel salvataggio (`RAMI_IN_BLOCCO` di
   `server/lib/archivio.js`): con la fusione chiave per chiave un evento cancellato rinascerebbe.

---

## 3. I dati: `config.orari`

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

`giorni`, `ora`, `durataOre`, `fuso` restano com'erano (li usano conto alla rovescia e testi). `giorni`
resta l'unica fonte di «questo giorno c'è diretta»: la scheda di un giorno spento resta nei dati ma non
si stampa, così riaccendendo il giorno torna com'era.

### 3.1 Scheda di un giorno — `schede[n]`, sempre sette

```json
{ "ora": "", "durataOre": null, "titolo": "", "gioco": "", "nota": "",
  "immagine": "", "fuoco": { "x": 50, "y": 50 }, "velo": 60 }
```

| campo | regola |
|---|---|
| `ora` | `""` (vale l'ora di serie) oppure `HH:MM` 00:00–23:59 |
| `durataOre` | `null` (vale la durata di serie) oppure numero 0.5–24 a passi di 0.5 |
| `titolo` | testo semplice, una riga, al massimo **40** caratteri |
| `gioco` | testo semplice, una riga, al massimo **40** |
| `nota` | testo semplice, una riga, al massimo **120** |
| `immagine` | `""` oppure percorso del sito (§3.4) |
| `fuoco` | `{ x, y }` interi 0–100: il punto dell'immagine da tenere in vista (`object-position`) |
| `velo` | intero **30–90**, quanto si scurisce l'immagine sotto il testo; di serie **60** |

### 3.2 Evento speciale — `eventi[]`, al massimo **8**

Una diretta fuori programma con una data precisa (una maratona, uno speciale).

```json
{ "data": "2026-09-27", "ora": "15:00", "durataOre": 12, "titolo": "Maratona", "gioco": "", "nota": "",
  "immagine": "", "fuoco": { "x": 50, "y": 50 }, "velo": 60 }
```

| campo | regola |
|---|---|
| `data` | `AAAA-MM-GG`, data vera del calendario |
| `ora` | `HH:MM`, obbligatoria |
| `durataOre` | obbligatoria, 0.5–72 a passi di 0.5 |
| `titolo` | obbligatorio, 1–40 |
| `gioco` | 0–40 · `nota` 0–**160** · `immagine`, `fuoco`, `velo` come nella scheda |

Un evento **finito** (inizio + durata nel passato) resta nei dati — convalida e salvataggio lo accettano —
ma non si stampa sul sito; il pannello lo segna «Passato».

### 3.3 Fondale della sezione — `sfondo`

`immagine` (`""` o percorso §3.4), `fuoco` come sopra, `intensita` intero 0–100 (opacità del fondale in
percento; 0 lo spegne), di serie **30**. È lo strato decorativo dietro tutta la sezione, trattato come il
fondale della copertina (sfumato, velato), non un `background-image` grezzo.

### 3.4 Percorsi di immagine ammessi

`^(img|contenuti/media)/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\.(png|jpe?g|webp|avif|svg)$`, senza `..`.
Nient'altro: niente URL esterni, niente spazi, niente schemi.

### 3.5 Il modulo condiviso — `pannello/condivisi/orari.js` (DATI)

Come `pannello/condivisi/stili.js`: UMD senza dipendenze, funzioni pure, un file solo per server e
pannello, così convalida del pannello e del server non possono dire cose diverse.

```js
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.SBOrari = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () { /* … */ });
```

Il server: `require('../../pannello/condivisi/orari.js')`. Il pannello: `import '../condivisi/orari.js'`
(importato come modulo il file si esegue lo stesso e riempie `window.SBOrari`).

```js
SBOrari = {
  LIMITI,          // { titolo: 40, gioco: 40, nota: 120, notaEvento: 160, eventi: 8,
                   //   veloMin: 30, veloMax: 90, velo: 60, intensita: 30,
                   //   durataMin: 0.5, durataMax: 24, durataEventoMax: 72 }
  GIORNI,          // [{ n: 0, abbr: 'DOM', nome: 'Domenica', minuscolo: 'domenica' }, … n: 6]
  ORDINE,          // [1, 2, 3, 4, 5, 6, 0]
  RE_ORA, RE_DATA, RE_PERCORSO,

  schedaVuota(), eventoVuoto(), sfondoVuoto(),
  normalizza(orari),      // -> config.orari completo e pulito, mai lancia: sette schede, eventi oggetto,
                          //    numeri stretti al bordo, testi tagliati e su una riga, percorsi non validi -> ""
  problemi(orari),        // -> [{ percorso: 'schede.1.ora', messaggio: 'L\'ora di lunedì va scritta come 21:00.' }]
                          //    [] se va bene. Messaggi in italiano, con gli accenti, pronti da mostrare.
  percorsoValido(p),      // -> boolean (§3.4)
  oraDi(orari, giorno), durataDi(orari, giorno),   // effettive, con i ripieghi di serie
  fine(ora, durataOre),   // '21:00', 4 -> '01:00'
  istante(data, ora, fuso),        // 'AAAA-MM-GG', 'HH:MM', 'Europe/Rome' -> ms UTC (Intl, niente librerie)
  eventiFuturi(orari, adessoMs)    // -> [{ indice, inizio, termine, …evento }] non finiti, per inizio
};
```

---

## 4. Testi nuovi dello schema (gruppo `settimana`, DATI)

| chiave | etichetta | tipo | max | valore di partenza |
|---|---|---|---|---|
| `settimana.titoloEventi` | Titolo degli eventi speciali | testo | 40 | `Fuori programma` |
| `settimana.etichettaEvento` | Etichetta di un evento speciale | testo | 20 | `Speciale` |
| `settimana.etichettaInOnda` | Etichetta «in onda» sul nastro | testo | 20 | `In onda` |
| `settimana.etichettaDaTe` | Etichetta dell'ora nel fuso di chi guarda | testo | 20 | `Da te` |

Il campo `config.orari` diventa: etichetta **«Schedule della settimana»**, aiuto: «Giorni, ore, schede
con immagine di sfondo, eventi speciali e fondale della sezione. Da qui nascono anche il conto alla
rovescia della copertina e gli orari scritti nella pagina.»

---

## 5. Generazione (DATI)

### 5.1 Contesto per `modelli/parziali/settimana.html`

`settimana` — il ciclo, sette voci nell'ordine `ORDINE` (lunedì → domenica):

| nome | valore |
|---|---|
| `indice` | 0–6 (0 = domenica) |
| `abbr`, `nome` | `LUN`, `Lunedì` |
| `diretta` | booleano |
| `ora`, `fine` | `HH:MM` effettive; `""` nei giorni di riposo |
| `tag` | `settimana.etichettaDiretta` o `settimana.etichettaRiposo` |
| `titolo`, `gioco`, `nota` | testi; `""` nei giorni di riposo |
| `contenuto` | vero se c'è almeno uno fra titolo, gioco, nota |
| `immagine` | percorso o `""` (sempre `""` nei giorni di riposo) |
| `stile` | `--fuoco: 30% 20%; --velo: 0.6` se c'è l'immagine, altrimenti `""` |

`sito.eventi` — gli eventi non ancora finiti **all'istante della generazione**, per inizio:

| nome | valore |
|---|---|
| `indice` | posizione in `config.orari.eventi` (serve al pannello) |
| `data`, `ora`, `fine` | `2026-09-27`, `15:00`, `03:00` |
| `abbr`, `giorno`, `numero`, `mese`, `dataTesto` | `SAB`, `Sabato`, `27`, `set`, `sabato 27 settembre` |
| `inizio`, `termine` | istanti ISO in UTC (`2026-09-27T13:00:00.000Z`) |
| `titolo`, `gioco`, `nota`, `contenuto`, `immagine`, `stile` | come sopra (`contenuto` = gioco o nota) |

`sito.haEventi` — booleano. `sito.settimanaSfondo` — `{ immagine, stile }`, con `stile` =
`--fuoco: X% Y%; --intensita: 0.3`; `immagine` è `""` se manca o se `intensita` è 0.

`sito.orariTesto` tiene conto delle ore per giorno: «Lunedì, mercoledì e venerdì alle 21:00» se l'ora è
la stessa, altrimenti «Lunedì alle 21:00, mercoledì alle 18:30 e domenica alle 16:00».

### 5.2 `js/dati.js`

```js
orari: {
  giorni, ora, fuso, durataOre,              // come oggi
  ore:    { '1': '21:00', '3': '18:30' },    // ora effettiva di ogni giorno acceso
  durate: { '1': 4, '3': 3 },                // durata effettiva di ogni giorno acceso
  eventi: [{ inizio: '2026-09-27T13:00:00.000Z', termine: '2026-09-28T01:00:00.000Z', titolo: 'Maratona' }]
},
testi: { …come oggi, etichettaInOnda, etichettaDaTe, etichettaEvento }
```

### 5.3 Convalida e salvataggio

`server/lib/convalida.js` usa `SBOrari.problemi` per `config.orari` (un `contenuti.json` senza
`schede`/`eventi`/`sfondo` resta valido: si normalizza). La generazione e l'anteprima lavorano sempre su
`SBOrari.normalizza(config.orari)`. `RAMI_IN_BLOCCO` comprende `orari`.

---

## 6. Il sito (SITO)

### 6.1 Marcatura minima che gli altri possono dare per certa

- `section#settimana` con i suoi attributi di oggi (`data-sb-sezione`, `data-sb-riquadro`).
- Primo figlio: `div.settimana__sfondo[aria-hidden="true"]` con dentro, se c'è, `img.settimana__sfondo-img`
  e `style` sul `div`.
- `div.settimana__testa[data-sb-blocco="settimana.testa"]` e `div.settimana__piede[data-sb-blocco="settimana.piede"]`
  con i loro testi e marcatori di oggi.
- `ol#nastro.nastro[data-sb-parte="nastro"][data-sb-blocco="settimana.nastro"]` con sette
  `li.nastro__giorno[data-giorno="<indice>"]` (classi `is-diretta`, `con-immagine` dalla generazione;
  `is-oggi`, `is-prossima`, `is-in-onda`, `ha-evento` dal JavaScript). Dentro, se c'è, `img.nastro__sfondo`;
  `style` sul `li`.
- Se `sito.haEventi`: `div.eventi[data-sb-parte="eventi"][data-sb-blocco="settimana.eventi"]` con il titolo
  (`data-sb-testo="settimana.titoloEventi"`) e `li.evento[data-evento="<indice>"][data-inizio][data-fine]`,
  ognuno con `img.evento__sfondo` se c'è e `style` sul `li`.
- Tutto il resto (struttura interna, classi, posizione degli eventi prima o dopo il nastro) lo decide SITO
  e lo scrive nelle decisioni.

### 6.2 Aspetto

La lingua visiva è quella del sito: la regia. Grafite, linee da 1 px, etichette in monospazio maiuscolo,
viola per ciò che è scelto, ciano per ciò che è acceso, magenta raro (il segno di «oggi»). Solo token di
`tokens.css`, proprietà logiche, `color-mix`, commenti che spiegano il perché.

- **Computer (da 1100 px)**: sette colonne in una riga, nessuno scorrimento. I giorni di diretta sono
  **locandine** più larghe dei giorni di riposo (che restano stretti e spenti); l'immagine riempie la
  locandina con `object-fit: cover` e `object-position: var(--fuoco)`; il testo sta in basso su una
  velatura che dipende da `--velo`, in alto giorno e data. Altezza piena, da manifesto.
- **Tablet (760–1099 px)** e **Telefono (sotto 760 px)**: nessuno scorrimento laterale, i giorni restano
  in ordine, ogni giorno di diretta si legge intero con la sua immagine ben visibile (fascia orizzontale
  alta abbastanza da riconoscerla), i giorni di riposo diventano righe sottili.
- **Senza immagine** una locandina deve essere bella lo stesso (non una scatola vuota).
- **Eventi speciali**: schede ben visibili, con data grande, ora, titolo, gioco, nota e immagine;
  l'etichetta `settimana.etichettaEvento`. Un'immagine verticale come la «spoiler maratona» ci deve stare
  bene.
- **Fondale**: dietro la sezione, sfumato ai bordi e velato, con `opacity: var(--intensita)`.
- Leggibilità sopra le immagini garantita (contrasto AA del testo principale anche con un'immagine chiara
  e `velo` al minimo); `prefers-reduced-motion`; nessun `!important`, nessun esadecimale.
- Oggi, prossima, in onda: tre segni diversi e riconoscibili, che non spostano il contenuto.

### 6.3 JavaScript — `js/sito.js`

- **Conto alla rovescia** della copertina: la prossima partenza fra i giorni di diretta (con `ore` per
  giorno) **e** gli eventi (`orari.eventi`), la più vicina. «In onda» come oggi, con `durate` per giorno.
- **Nastro**: `is-oggi` (giorno nel fuso del canale), `is-prossima` (giorno della prossima diretta
  regolare, se la prossima partenza è un giorno e non un evento; altrimenti `is-prossima` va sul
  `li.evento`), `is-in-onda` sul giorno di oggi quando il player dice che il canale è acceso.
- **Date**: ogni giorno mostra la data della sua **prossima occorrenza** nel fuso del canale (oggi conta se
  la diretta di oggi non è ancora finita o se è un giorno di riposo), per esempio «22 set».
- **Ora di chi guarda**: se il fuso del visitatore dà un'ora diversa, sotto l'ora compare
  «`etichettaDaTe` 15:00» (giorni ed eventi).
- **Eventi**: un evento con `data-fine` passato sparisce; se non ne resta nessuno sparisce `div.eventi`.
  Un giorno la cui prossima occorrenza coincide con la data di un evento prende `ha-evento` e mostra
  `etichettaEvento`.
- Senza JavaScript la sezione è completa (orari, titoli, immagini): mancano solo date, segni e ora locale.
- Un solo timer per tutto, come oggi; il DOM si tocca solo quando un valore cambia.

---

## 7. Le immagini (IMMAGINI)

### 7.1 File da produrre (nomi fissi: DATI li scrive subito in `contenuti.json`)

| file | da | uso | chiave |
|---|---|---|---|
| `img/copertina.webp` | `foto storie canva.png` | fondale della copertina | `config.immagini.banner` |
| `img/avatar.webp` | `img/avatar.png` | binario, «chi sono», JSON-LD, pannello | `config.immagini.avatar` |
| `img/mascotte.webp` | il pollo: dal banner nuovo se se ne ricava un ritaglio pulito e trasparente, altrimenti `img/mascot.png` | il pollo accanto al player | `config.immagini.mascotte` |
| `img/og.jpg` | composta da banner nuovo e città, 1200×630, pollo e handle interi | anteprima social | `config.immagini.og` |
| `img/favicon.png` | `img/favicon.png`, 180×180 | linguetta e icona iOS | `config.immagini.favicon` |
| `img/settimana-sfondo.webp` | `stinger.png` | fondale della schedule | `config.orari.sfondo.immagine` |

Nella libreria del pannello (che elenca solo `contenuti/media/`), pronte da scegliere per le schede:
`contenuti/media/citta-notturna.webp`, `banner-twitch.webp`, `overlay-cam.webp`, `spoiler-maratona.webp`,
`stinger.webp`.

Misure e qualità le sceglie IMMAGINI guardando il risultato (obiettivo: nitide dove si vedono nitide, il
più leggere possibile; indicativamente fondali ≤ 250 kB, avatar e mascotte ≤ 60 kB, og ≤ 250 kB). Gli
strumenti: Chrome headless (canvas, `createImageBitmap` con `resizeQuality: 'high'`, `toBlob` in WebP e
JPEG) e `System.Drawing` di PowerShell. Niente pacchetti da installare. I PNG vecchi non più usati
(`avatar.png`, `banner.png`, `mascot.png`, `og.png`) si cancellano.

### 7.2 Caricamento ottimizzato nel pannello — `pannello/moduli/media.js`

```js
export async function preparaImmagine(file, { latoMax = 2400, qualita = 0.82 } = {})  // -> File
export async function caricaImmagine(file)   // -> Promise<string | null>: il percorso 'contenuti/media/…'
```

- `preparaImmagine`: PNG, JPEG o WebP oltre i 350 kB **o** con il lato lungo oltre `latoMax` → ridotta e
  riscritta in WebP nel browser; se il WebP non pesa meno, resta l'originale. SVG e GIF non si toccano.
  Il nome resta quello del file con estensione `.webp`.
- `caricaImmagine`: prepara, carica con l'API che esiste (`POST /api/media`), mostra gli errori con
  `avviso`, restituisce il percorso. Ogni caricamento della libreria passa anch'esso da `preparaImmagine`.

### 7.3 Nei modelli e nei fogli

Gli `<img>` di copertina, binario, «chi sono», pollo: `decoding="async"`, `loading="lazy"` dove
l'immagine non è nella prima schermata, e quello che serve perché non spostino la pagina. Il fondale
della copertina si inquadra di nuovo sulla città pulita (`css/regia.css`); il pollo si adatta alla
mascotte nuova (`css/pollo.css`). Riferimenti ai PNG vecchi aggiornati ovunque (commenti dei CSS,
`pannello/index.html`, prove dell'autotest escluse se sono stringhe d'esempio).

---

## 8. Il pannello (PANNELLO)

Un editor della schedule **fatto da capo**, in `pannello/moduli/settimana.js`, esportato come
`creaCampoOrari(campo, accesso, ctx)` e usato da `moduli/campi.js` per il tipo `orari` (stessa firma e
stesso contratto di ritorno degli altri campi). Stili in coda a `pannello/campi.css`. Usa
`window.SBOrari` per limiti, valori vuoti e problemi.

### 8.1 Cosa deve saper fare

- **Riepilogo** in testa: quante dirette a settimana, ora e durata di serie, fuso, prossimi eventi.
- Tre viste: **Settimana**, **Eventi speciali**, **Fondale**.
- **Settimana**: ora di serie, durata di serie, fuso; i sette giorni in ordine lunedì → domenica, ognuno
  con interruttore acceso/spento, riassunto (ora–fine · titolo) e miniatura; un giorno acceso si apre
  (uno alla volta) con ora, durata (i segnaposto dicono il valore di serie), titolo, gioco, nota con i
  contatori, e il **blocco immagine** (§8.2).
- **Eventi speciali**: elenco per data, «Passato» sugli eventi finiti, «Aggiungi evento» (fermo a 8),
  ogni evento con data, ora, durata, titolo, gioco, nota, blocco immagine, «Elimina» con conferma
  (`conferma` di `moduli/avvisi.js`).
- **Fondale**: blocco immagine con «Intensità» 0–100 al posto del velo.
- Errori sul campo con `SBOrari.problemi`, accanto alla casella che li causa.

### 8.2 Il blocco immagine (uguale per giorni, eventi e fondale)

- Riquadro di anteprima con l'immagine, la velatura come sul sito e il **punto di fuoco**: clic o
  trascinamento sull'immagine lo spostano, le frecce da tastiera anche.
- Due ritagli piccoli, **Computer** (verticale) e **Telefono** (orizzontale), che mostrano cosa resta in
  vista con quel fuoco.
- **Scegli dalla libreria** (`scegliImmagine` di `moduli/media.js`), **Carica dal computer**
  (`caricaImmagine`), **Togli**; si può anche **trascinare un file** sul riquadro.
- Cursore **Velo** 30–90 (per il fondale **Intensità** 0–100).

### 8.3 Con l'anteprima

- Cliccando un giorno nell'anteprima si apre quel giorno; cliccando un evento, quell'evento nella vista
  Eventi. Il modo: il motore seleziona la parte `nastro` o `eventi` come già fa, e l'editor guarda da
  quale `[data-giorno]` / `[data-evento]` è partito il clic (documento dell'iframe via
  `motore.documento()`, con `import('../editor/motore.js')` guardato da `try`, riagganciato a ogni
  `sb:anteprima-pronta`).
- Il giorno o l'evento aperto si evidenzia nell'anteprima (contorno ciano, stile iniettato nell'iframe) e
  ci si scorre quando lo si apre dal pannello.
- Fuoco, velo e intensità si vedono **subito** nell'anteprima (variabili CSS impostate sull'elemento
  dell'iframe), prima della ricarica normale.
- `pannello/editor/nomi.js`: parte nuova `eventi` (campi `config.orari`, `settimana.titoloEventi`,
  `settimana.etichettaEvento`), blocco `settimana.eventi`, nomi e descrizioni umani; `nastro` aggiunge
  `settimana.etichettaInOnda` e `settimana.etichettaDaTe`. Nella parte `stato` della copertina la
  schedule compare come riepilogo con il bottone **«Modifica la schedule»**, che seleziona la parte
  `nastro` (`motore.seleziona` + `motore.scorriA`), non come editor intero una seconda volta.
- Grafica: solo variabili `--p-*`, monospazio maiuscolo per le etichette, viola azioni, ciano acceso,
  bottoni e campi che il pannello ha già. Il pannello va da 380 a 760 px di larghezza: l'editor deve
  stare bene in tutte e due. Tastiera e fuoco visibile ovunque.

---

## 9. Proprietà dei file

| Agente | File di sua ESCLUSIVA proprietà |
|---|---|
| **DATI** | `pannello/condivisi/orari.js` (nuovo), `contenuti/schema.js`, `contenuti/contenuti.json`, `server/lib/convalida.js`, `server/lib/costruisci.js`, `server/lib/archivio.js`, `server/lib/media.js`, `server/modelli/dati.js.tpl`, `server/autotest.js` |
| **SITO** | `modelli/parziali/settimana.html`, `css/sezioni.css`, `js/sito.js` |
| **PANNELLO** | `pannello/moduli/settimana.js` (nuovo), `pannello/moduli/campi.js`, `pannello/campi.css`, `pannello/editor/nomi.js`, `pannello/editor/parti.js` |
| **IMMAGINI** | `img/**`, `contenuti/media/**`, `modelli/index.html`, `modelli/parziali/testa.html`, `regia.html`, `binario.html`, `chi.html`, `pollo.html`, `css/regia.css`, `css/pollo.css`, `css/tokens.css` (solo commenti), `pannello/moduli/media.js`, `pannello/index.html` |
| **COLLAUDO** (dopo) | prova completa, correzioni ovunque serva, annotate |
| **GUIDA** (dopo) | `README.md`, `docs/PANNELLO.md`, `CHANGELOG.md` |
| (integratore) | `CONTRATTO-5.md`, tutto il resto |

`index.html`, `js/dati.js` e `css/tema.css` alla radice restano **generati**: nessuno li scrive e nessuno
lancia `node server/genera.js` dentro `LAVORO\repo\`. Nessuno crea file oltre a quelli assegnati (prove
e appunti nella cartella di lavoro). Si leggono i file degli altri, si scrive solo nei propri. Una
richiesta a un altro agente va nelle proprie decisioni con `→ AGENTE:` davanti.

---

## 10. Convivenza

Cartella di lavoro: la scratchpad della sessione, `<cartella di lavoro>\slayer\`
(qui `LAVORO\`). La repository è `LAVORO\repo\`.

- **Niente git**: nessuno usa stash, checkout, reset, commit, push. Committa l'integratore.
- **Prove su copie**: `powershell -NoProfile -ExecutionPolicy Bypass -File LAVORO\strumenti\copia.ps1 -Agente <chiave>`
  crea `LAVORO\copie\<chiave>\` da `LAVORO\repo\` (senza `.git`, password `prova-editor-slayer-2026`);
  `-Aggiorna` ricopia i file cambiati tenendo `contenuti.json` della prova. Nella copia si può generare,
  salvare e pubblicare quanto si vuole. Il server si avvia **dentro la copia**:
  `$env:SB_PORTA='<porta>'; $env:SB_AGGIORNA_MIN='0'; node server/server.js`, e si spegne a fine prova.
- **Porte**: DATI 4281 · SITO 4282 · PANNELLO 4283 · IMMAGINI 4284 · COLLAUDO 4285 · GUIDA 4286.
- **Un solo Chrome headless alla volta**: `node LAVORO\strumenti\lucchetto.js prendi <chiave>` prima,
  `node LAVORO\strumenti\lucchetto.js lascia <chiave>` subito dopo (anche se la prova fallisce). Chrome:
  `C:\Program Files\Google\Chrome\Application\chrome.exe`, profilo in `LAVORO\chrome\<chiave>`, pilotato
  con il DevTools Protocol e il `WebSocket` di Node 24. Per le foto semplici c'è
  `node LAVORO\strumenti\foto.js <url> <uscita.png> [larghezza] [selettore|pagina] [altezza]`, che prende
  il lucchetto da sé. Le foto si **guardano** (strumento Read sul PNG), non si danno per buone.
- **Avanzamento**: `node LAVORO\strumenti\progresso.js <chiave> <percento> "<passo>"` a ogni passo vero,
  almeno ogni 20 minuti; 100 solo a lavoro finito e verificato. Il committente lo guarda sul Desktop.
- **Decisioni** che toccano gli altri: `LAVORO\decisioni\<chiave>.md`, una riga per decisione, subito.
- **Rapporto finale**: `LAVORO\rapporti\<chiave>.md` — cosa è fatto, file toccati, prove fatte con l'esito
  vero, cosa resta aperto, richieste agli altri.

---

## 11. Verifiche

- `node server/autotest.js` nella repository: le 146 prove di oggi passano, più quelle nuove di DATI.
- `node LAVORO\strumenti\regola-oro.js confronta <radice>`: le differenze con la base devono stare solo nei
  punti ammessi dal §2.1. Ognuno controlla che le proprie siano solo nella propria zona.
- Ogni agente prova il proprio pezzo nel browser vero su una copia, a 1400, 900 e 390 px dove ha senso,
  e scrive nel rapporto cosa ha provato e cosa no.
- **COLLAUDO** (dopo): con clic e tasti veri nel pannello — accesso · clic su un giorno nell'anteprima ·
  giorno acceso e spento · ora e durata propri · titolo, gioco, nota · immagine caricata dal computer
  (un PNG grande che deve arrivare WebP) · fuoco spostato e velo cambiato · evento aggiunto con immagine
  verticale · fondale cambiato e spento · Salva · Pubblica · sito controllato a 1400, 900 e 390 px, con
  conto alla rovescia, oggi, prossima, date e ora locale verificati a orologio finto · evento passato che
  sparisce · Annulla/Ripeti · copia di sicurezza ripristinata.

---

## 12. Decisioni prese durante il lavoro

_(Compilata dall'integratore dai file di `LAVORO\decisioni\`. Prevale sul testo sopra dove è in
conflitto.)_
