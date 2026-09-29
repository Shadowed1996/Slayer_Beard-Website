# Prossima sessione: Pollo Run (29/09/2026)

Branch: `feat/pollorun-pendenza` (non ancora in main). Prove: `npm run prova`, 449 passate.

## Cosa c'e di nuovo nel branch

1. **Discese e salite a tratti casuali** (6dfbca9)
   - Dal livello 3 ogni livello ha dei tratti in discesa o salita, con del piano in mezzo. Sono decisi dal seme del livello, in `creaTratti` / `M.tratti`.
   - Il pollo accelera in discesa (da +20% a +35%) e rallenta in salita (da -18% a -28%).
   - «Pronti ? Si scendeee» / «Pronti ? Si saleee» escono 2 s prima di ogni cambio.
   - Gli ostacoli seguono la velocita del punto in cui si trovano e sono sempre fattibili: la simulazione `avanza` usa `vicino()`.
2. **Passaggio morbido** (b6ab495)
   - `PENDENZA_RAMPA = 1.1`, cioe circa 1 s, con curva smootherstep in `pendenzaDi`.
   - Lampo al cambio 0.08.
3. **«ATTENTO CHE CADI !»** (d6ac141)
   - Solo a difficile ed estremo, dal livello 3: 45% dei livelli a difficile, 55% a estremo, dal seme.
   - Buca, poi pozzo di 8-12 s con ostacoli da schivare con A/D o le frecce (sul telefono, meta sinistra o destra dello schermo).
   - Poi si atterra in un tratto in discesa.
   - Il codice sta in `js/pollorun-caduta.js`, caricato da `js/pollorun.js`. I ganci sono in `js/pollorun-gioco.js`: `cadutaDi`, `trattiConCaduta`, `ambienteCaduta`, `seguiCaduta`, `quotaPercorso`.
   - I livelli con caduta durano di piu della durata della caduta, e la classifica lo sa.

## Da fare

1. L'utente deve ancora provare bene la caduta. Si prova in locale con `npm start`, poi http://localhost:4173.
2. Per forzarla durante la prova, modifiche temporanee in `js/pollorun-gioco.js` da NON committare:
   - `CADUTA_PROBABILITA = { difficile: 1, estremo: 1 }`
   - in `cadutaDi`, `x0 = Math.round(v * durata * (0.08 + 0 * r()))`
   - in `inizia`, `avviaLivello(Math.max(3, n))`, per partire dal livello 3
3. Quando va bene, fai lo zip per Plesk sul Desktop:
   - nome con data e ora, per esempio `Slayer_Beard_per-Plesk_AAAA-MM-GG_ore-HH.MM.zip`;
   - fatto con .NET ZipArchive e barre `/`, non con Compress-Archive;
   - deve contenere anche `js/pollorun-caduta.js`;
   - esclusi i contenuti e le pagine generate (vedi le regole sotto e lo zip precedente).
4. Poi, se l'utente conferma, unisci in main.

## Regole dell'utente (sempre)

- Zero commenti in qualsiasi file e niente trattino lungo (em dash).
- JS in stile ES5 con nomi italiani.
- Commit senza Co-Authored-By e senza righe Claude-Session.
- Non pushare senza conferma.
- Massimo 2-4 agenti insieme, un solo Chrome headless alla volta.
- Consegne sul Desktop sempre in zip con l'ora nel nome.
- Gli output di `npm run genera` (`contenuti/contenuti.json`, `index.html`, `js/dati.js`, `sitemap.xml`, `server/backup/*`, `giochi.html`) non si committano.
