# CONTRATTO-7 — La pagina «I giochi» (giochi.html)

Pagina a parte, come clip.html e sponsor.html, con tutti i giochi che slayer_beard ha portato in live: copertina ufficiale Twitch, tipologia (generi), quante dirette / ore / clip, prima e ultima volta, clip migliore. Filtri per tipologia e ordinamento lato browser.

## Regole per tutti

- **NESSUN COMMENTO** in nessun file di codice (JS, CSS, HTML, modelli): né nuovi, né lasciati in quelli che tocchi. Se tocchi un file che ne ha, toglili tutti in modo sicuro (stringhe, regex e URL restano).
- Niente dipendenze npm. Node >= 18.17, `node:https` come fa `server/lib/twitch.js`.
- Tutto ciò che arriva da fuori finisce in pagina solo con escape (`{{…}}`) o `textContent`.
- Nessun host immagini nuovo: le copertine sono su `static-cdn.jtvnw.net`, già in `img-src`. La CSP non si tocca.
- Ogni testo nuovo in `contenuti/schema.js` ha `predefinito` (il contenuti.json online è più vecchio del programma).
- Alla fine `node server/autotest.js` deve dire TUTTO A POSTO. Dopo ogni `node server/genera.js` esegui `git checkout -- server/backup`.
- Non fare commit. Non toccare `contenuti/contenuti.json` a mano salvo quanto detto sotto.

## Il file dati — `server/dati/giochi-twitch.json` (proprietà dell'agente A, letto dall'agente B)

```json
{
  "letteIl": "2026-09-24T10:00:00.000Z",
  "giochi": [
    {
      "id": "2092725748",
      "nome": "Horizon Zero Dawn Remastered",
      "copertina": "https://static-cdn.jtvnw.net/ttv-boxart/2092725748_IGDB-285x380.jpg",
      "generi": ["Azione", "Open world"],
      "dirette": 8,
      "ore": 19.9,
      "clip": 3,
      "primaVolta": "2026-09-14",
      "ultimaVolta": "2026-09-21",
      "clipMigliore": { "titolo": "…", "url": "https://www.twitch.tv/slayer_beard/clip/…", "anteprima": "https://…", "visualizzazioni": 120 }
    }
  ]
}
```

- `copertina` è sempre un URL completo `https://static-cdn.jtvnw.net/ttv-boxart/…-285x380.jpg`, oppure `""`.
- `generi` in italiano, al massimo 3. `clipMigliore` può essere `null`. Date `AAAA-MM-GG`.
- Se il file manca o è rotto, B ripiega su `server/modelli/giochi-seme.json` (55 giochi veri raccolti oggi; lì `copertina` è solo il pezzo `9891_IGDB_it-it`, da completare in `https://static-cdn.jtvnw.net/ttv-boxart/<pezzo>-285x380.jpg`).
- Percorso in `server/lib/percorsi.js`: `giochiTwitch` accanto a `emoteTwitch`, anche nel rimappaggio `SB_DATI`. Lo aggiunge A. B lo usa con `P.giochiTwitch`.

## Agente A — i dati da Twitch

File suoi: `server/lib/giochi.js` (nuovo), `server/lib/percorsi.js`, `server/lib/api.js` (rottaPubblica), `server/genera.js`, `pannello/pannello.js` (solo la riga del messaggio), l'avvio del server (dove parte l'app), la sezione di test nuova `proveGiochiDati` in `server/autotest.js`.

1. `aggiornaGiochi()` in `server/lib/giochi.js`, stesso contratto di `twitch.aggiornaEmote`: non lancia mai, stati `spento | senzaCanale | aggiornato | fallito`, e `raccontaGiochi(esito)` con una riga in italiano. Con esito `fallito` il file vecchio resta.
   - Usa `twitch.helix` / credenziali / `config.twitch.idUtente` (esporta da twitch.js quello che serve).
   - **Clip**: tutte, `GET /helix/clips?broadcaster_id=&first=100` seguendo `pagination.cursor`, al massimo 10 pagine, senza periodo. Per ogni `game_id`: numero di clip, data più vecchia e più recente, clip con più visualizzazioni (titolo, url, thumbnail_url se l'host è in `HOST_ANTEPRIME`, view_count).
   - **Registro delle dirette**: `server/dati/giochi-registro.json`. Mentre il canale è in onda il server annota ogni 10 minuti `{gameId, nome, slot}` dove slot è l'ora arrotondata ai 10 minuti (`2026-09-24T21:10`); gli slot si deduplicano, così più copie dell'app (Passenger) non contano doppio. Ore = slot × 10 min; dirette = giorni distinti. Il controllo periodico parte con l'app, usa `GET /helix/streams?user_id=`, non gira nei test né se Twitch non è configurato, e non tiene stato condiviso in memoria. Anche `aggiornaGiochi` annota uno slot se il canale è in onda.
   - **Seme**: `server/modelli/giochi-seme.json` si fonde sempre (dirette, ore, clip e date si sommano o si prendono il massimo e minimo sensati: il seme vale come storico fino al 2026-09-24, il registro da lì in poi).
   - **Giochi**: `GET /helix/games?id=…` (fino a 100 id per chiamata) per nome e `box_art_url` (sostituisci `{width}x{height}` con `285x380`) e `igdb_id`.
   - **Tipologia**: IGDB con le stesse credenziali Twitch — `POST https://api.igdb.com/v4/games`, header `Client-ID` e `Authorization: Bearer <app token>`, corpo `fields id,genres.name,themes.name; where id = (1,2,3); limit 500;`. Traduci in italiano con una tabella (Shooter→Sparatutto, Role-playing (RPG)→GDR, Platform→Platform, Adventure→Avventura, Horror (tema)→Horror, Simulator→Simulazione, Puzzle→Puzzle, Indie→Indie, Sport→Sport, Racing→Corse, Strategy/RTS/Turn-based→Strategia, Fighting→Picchiaduro, Survival (tema)→Sopravvivenza, Open world (tema)→Open world, Party→Party game, Quiz/Trivia→Quiz, Hack and slash→Azione, Action (tema)→Azione, Stealth→Stealth…). Temi prima dei generi quando sono Horror/Survival/Open world. Max 3. Se IGDB fallisce si tengono i generi del file precedente o del seme: IGDB non deve mai far fallire tutto.
   - Scrive `server/dati/giochi-twitch.json` con `scriviAtomico`, ordinato per ultimaVolta decrescente.
2. Aggancia `aggiornaGiochi` in `rottaPubblica` (prima di `costruisci.genera`) e in `server/genera.js`, con la riga nel pannello come le altre (`giochi:` nella risposta).
3. Test: funzioni pure esportate (raggruppamento clip, fusione con seme e registro, traduzione generi, slot) provate con dati finti; nessuna chiamata di rete nei test.

## Agente B — la pagina e il pannello

File suoi: `contenuti/schema.js` (gruppo nuovo `giochi`), `server/lib/costruisci.js`, `modelli/giochi.html`, `modelli/parziali/testa-giochi.html`, `modelli/parziali/gioco-card.html`, `css/giochi.css`, `js/giochi.js`, il punto della home che porta alla pagina, `server/lib/percorsi.js` solo per `giochiHtml`/`modelloGiochi` (A aggiunge `giochiTwitch`: non sovrascriverlo, modifica con Edit mirati), la sezione di test nuova `provePaginaGiochi` in `server/autotest.js` e le asserzioni esistenti che contano le pagine (sitemap, `pagine` della manutenzione).

1. Schema, gruppo `giochi` (dopo `clip`): `config.giochi.attivo` (interruttore, predefinito true), testi `giochi.occhiello`, `giochi.titolo`, `giochi.testo` (ricco), `giochi.paginaTitolo`, `giochi.paginaTesto` (ricco), `giochi.paginaTorna`, `giochi.invito` (testo del bottone in home), `giochi.tutti` (filtro «Tutti»), `giochi.ordina`, `giochi.ordinaRecenti`, `giochi.ordinaOre`, `giochi.ordinaNome`, `giochi.dirette`, `giochi.ore`, `giochi.clip`, `giochi.ultimaVolta`, `giochi.clipMigliore`, `giochi.vuoto`; `config.giochi.nascosti` (elencoTesti: nomi o id da non mostrare, predefinito `["Just Chatting","Quattro chiacchiere","IRL","Special Events","Eventi speciali"]`); `config.giochi.correzioni` (elenco `{gioco, generi (testo, separati da virgola), copertina (immagine, facoltativa)}`, predefinito `[]`) per correggere a mano. Tutto con predefinito.
2. `giochiDi(config, testi)` in costruisci.js: legge `P.giochiTwitch` (ripiego sul seme), toglie i nascosti, applica le correzioni, formatta in italiano (`ore` «19,9 ore», date «14 settembre 2026», numeri col punto), calcola l'elenco delle tipologie presenti con i conteggi. Pagina scritta/tolta come `scriviPaginaClip`, voce in sitemap, anche nella manutenzione, anche nell'allineamento dopo il ripristino (`allineaGiochiDopoRipristino`, agganciato in api.js accanto agli altri — è l'unica riga di api.js che tocchi).
3. `modelli/giochi.html` sullo scheletro di `modelli/sponsor.html`: testata con ritorno alla home, filtri a pillola per tipologia (bottoni con `data-tipo`), selettore d'ordine, griglia di card copertina 285×380 (lazy, `alt` = nome), nome, pillole dei generi, «8 dirette · 19,9 ore · 3 clip», «ultima volta: …», link «Clip migliore» se c'è. Ogni card porta `data-generi`, `data-ore`, `data-ultima`, `data-nome` per `js/giochi.js`.
4. `js/giochi.js`: filtro per tipologia (più tipologie = unione, «Tutti» azzera), ordinamento, conteggio visibile in un `role="status"`, stato nell'URL (`?tipo=Horror&ordine=ore`), niente dipendenze, funziona anche con JS spento (tutte le card visibili).
5. `css/giochi.css`: stile del sito (token di `css/tokens.css`, niente esadecimali nuovi), griglia responsiva (2 colonne a 360px, fino a 6 su schermi larghi), card con copertina, leggero sollevamento all'hover, `prefers-reduced-motion` rispettato.
6. Home: un bottone/invito verso `giochi.html` (in «Chi sono» oppure accanto all'invito delle clip — scegli il posto più naturale), solo se la pagina esiste. Il binario resta a 6 voci.
7. Test: `giochiDi` (nascosti, correzioni, formati, tipologie), pagina scritta/tolta, sitemap, card con escape, invito in home solo con pagina attiva.
