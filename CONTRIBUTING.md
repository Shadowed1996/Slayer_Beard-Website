# Come contribuire

Grazie per l'interesse. Prima di tutto una cosa che è giusto dire subito.

## I contributi esterni non sono aperti

Questo è un progetto **proprietario** (vedi [`LICENSE`](LICENSE)): il sito di
un canale Twitch preciso, non una libreria da riusare. Le pull request non
richieste **non vengono accettate**, per quanto ben fatte.

Restano benvenute:

- le **segnalazioni di problemi**, tramite le issue;
- le **proposte di miglioramento**, sempre tramite issue, prima di scrivere
  una riga di codice;
- il lavoro di chi è stato **espressamente invitato** a collaborare.

Questo documento serve soprattutto a quest'ultimo caso, e a chi riprende in
mano il progetto dopo mesi.

## Prima di scrivere codice: leggi i contratti

Il progetto ha regole scritte, e non sono suggerimenti. Sono in
[`CONTRATTO.md`](CONTRATTO.md), [`CONTRATTO-2.md`](CONTRATTO-2.md) e
[`CONTRATTO-3.md`](CONTRATTO-3.md), e vanno letti in quest'ordine. In sintesi,
i vincoli che non si negoziano:

- **niente npm, niente dipendenze, niente framework.** Node.js 18 o superiore
  con i soli moduli interni (`node:fs`, `node:path`, `node:http`, `node:crypto`);
- **niente CDN** oltre a Google Fonts ed `embed.twitch.tv`;
- **tutto in italiano**: nomi di file, di cartelle, di funzioni, di variabili,
  messaggi ed etichette;
- `path.join` per ogni percorso: il progetto nasce su Windows e deve
  comportarsi identico su Linux e macOS;
- **nessun `TODO`, nessun segnaposto** lasciato nel codice;
- i commenti spiegano il **perché**, non il cosa.

## Segnalare un problema

Apri una issue usando i template: [Segnalazione di
bug](.github/ISSUE_TEMPLATE/bug_report.yml) o [Richiesta di
funzionalità](.github/ISSUE_TEMPLATE/richiesta_funzionalita.yml). Compila i
campi: passi per riprodurre, comportamento atteso, ambiente e log fanno la
differenza fra una segnalazione utile e una che resta ferma.

Per i problemi di **sicurezza** non si usano le issue: si segue
[`SECURITY.md`](SECURITY.md).

## I file generati non si modificano

È l'errore più facile da fare e il più fastidioso da scoprire. Tre file
nascono dalla generazione e vengono **riscritti a ogni pubblicazione**:

| File generato | Nasce da |
|---|---|
| `index.html` | `modelli/index.html` + `modelli/parziali/` + `contenuti/contenuti.json` |
| `js/dati.js` | `server/modelli/dati.js.tpl` + `contenuti/contenuti.json` |
| `css/tema.css` | il gruppo «Aspetto» di `contenuti.json`, tramite `server/lib/tema.js` |

Se modifichi uno di questi a mano, la prima `node server/genera.js` cancella
il lavoro senza avvisare. Si interviene **a monte**: sui modelli, sui contenuti
o sul generatore.

## Flusso di lavoro

1. Parti da `main` aggiornato.
2. Crea un branch con nome `tipo/descrizione-breve`, per esempio
   `fix/player-parent-mancante` o `feat/campo-orari-festivi`.
3. **Un argomento per pull request.** Una PR che tocca il pollo, il tema e il
   pannello insieme è tre PR travestite da una.
4. Prima di aprirla, lancia il collaudo:

   ```bash
   node server/autotest.js     # motore dei modelli, convalida, tema, API, lurk
   node server/genera.js       # la generazione deve chiudersi senza errori
   ```

5. Apri la PR compilando il [template](.github/PULL_REQUEST_TEMPLATE.md).

> **Il metro è zero fallimenti.** `node server/autotest.js` passa per intero su
> `main` — **146 prove su 146** — e una modifica che ne rompe una è una modifica
> da sistemare, non un numero da confrontare. Se la tua modifica cambia un
> comportamento di proposito, aggiorna la prova che lo descriveva: una prova che
> racconta un programma che non esiste più è peggio di nessuna prova.
>
> Il collaudo non tocca la rete, nemmeno nella sezione sul collegamento con
> Twitch: quello che si prova lì è come si comporta una pubblicazione quando
> Twitch **non** risponde.

## Convenzione dei commit

[Conventional Commits](https://www.conventionalcommits.org/it/), con la
descrizione **in italiano**, all'infinito o all'indicativo, minuscola e senza
punto finale.

| Prefisso | Quando |
|---|---|
| `feat:` | una funzionalità nuova |
| `fix:` | la correzione di un difetto |
| `docs:` | solo documentazione |
| `style:` | formattazione, senza effetti sul comportamento |
| `refactor:` | riorganizzazione a comportamento invariato |
| `perf:` | prestazioni |
| `test:` | collaudo |
| `chore:` | manutenzione, configurazione, dipendenze |

```
feat(lurk): aggiungere il tetto ai messaggi per caricamento di pagina
fix(player): rimettere il dominio senza www fra i parent di Twitch
docs(pannello): spiegare la differenza fra Salva e Pubblica
```

## Stile del codice

Le convenzioni qui sotto sono **osservate nei file esistenti**: prima di
introdurne di nuove, guarda come è scritto il file che stai toccando.

### In generale

- indentazione a **2 spazi**, mai tabulazioni;
- fine riga **LF**, codifica **UTF-8**, con gli accenti veri (`è`, `à`, `perché`);
- riga finale sempre presente, nessuno spazio in coda alle righe
  (vedi [`.editorconfig`](.editorconfig));
- ogni file si apre con un blocco di commento che dice **a cosa serve** e
  quali decisioni ha preso.

### JavaScript

- `'use strict';` in testa a ogni modulo del server;
- `server/` e `contenuti/schema.js` usano **CommonJS** (`require`,
  `module.exports`); `pannello/moduli/` usa i **moduli ES** (`import`,
  `export`), perché il browser li carica come tali;
- apici singoli, punto e virgola sempre, `const` di regola e `let` solo quando
  serve davvero;
- nomi in **italiano** e in `camelCase` per funzioni e variabili,
  `MAIUSCOLO_CON_UNDERSCORE` per le costanti di modulo;
- niente dipendenze esterne: se serve una funzione, si scrive.

### CSS

- **nessun valore esadecimale** fuori da `css/tokens.css`: tutto passa dai
  token, e il tema li riscrive;
- un foglio per area (`regia.css`, `diretta.css`, `player.css`, `pollo.css`,
  `lurk.css`…): quello che vale per tutte le sezioni sta in `base.css`;
- l'ordine di caricamento dei fogli è vincolante ed è dichiarato in
  `modelli/index.html`.

### Aggiungere un campo modificabile dal pannello

Tre passi, in tre file, e non uno di più:

1. la chiave e il suo valore in `contenuti/contenuti.json`;
2. il segnaposto `{{la.tua.chiave}}` dove serve, in `modelli/`;
3. la descrizione del campo in `contenuti/schema.js` (etichetta, tipo, aiuto).

Il pannello si costruisce da solo: **non si tocca `pannello/`**. Se salti il
terzo passo, il controllo di copertura te lo dice all'avvio del server.

## Checklist prima di aprire una pull request

- [ ] `node server/autotest.js` passa per intero (146 prove su 146)
- [ ] `node server/genera.js` si chiude senza errori e senza avvertimenti nuovi
- [ ] non ho modificato a mano `index.html`, `js/dati.js` o `css/tema.css`
- [ ] il sito è stato provato da un server vero, non con `file://`
- [ ] la PR tratta **un solo** argomento
- [ ] indentazione, lingua e stile seguono i file già presenti
- [ ] ho aggiornato la documentazione toccata (`README.md`, `docs/…`)
- [ ] ho aggiunto una voce a [`CHANGELOG.md`](CHANGELOG.md) se la modifica si vede
- [ ] **nessun segreto** committato: password, token Twitch, Client ID privati,
      `server/dati/auth.json`
- [ ] i messaggi di commit seguono la convenzione qui sopra

## Autore

Filippo — [@Shadowed1996](https://github.com/Shadowed1996)
