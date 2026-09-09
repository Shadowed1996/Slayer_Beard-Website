## Descrizione

<!-- Cosa cambia e perché. Se risolve un problema, parti dal problema. -->

## Tipo di modifica

- [ ] `fix` — correzione di un difetto
- [ ] `feat` — funzionalità nuova
- [ ] `docs` — solo documentazione
- [ ] `style` — formattazione, senza effetti sul comportamento
- [ ] `refactor` — riorganizzazione a comportamento invariato
- [ ] `perf` — prestazioni
- [ ] `test` — collaudo
- [ ] `chore` — manutenzione o configurazione

## Issue collegata

<!-- Per esempio: Chiude #12 -->

## Come è stato provato

<!-- Comandi lanciati, browser usati, cosa hai guardato per essere sicuro che funzioni. -->

```bash
node server/autotest.js
node server/genera.js
node server/server.js
```

- Browser provati:
- Larghezze provate (il sito regge da 320 px a 2560 px):

## Checklist

- [ ] `node server/autotest.js` non introduce fallimenti **nuovi** rispetto a `main`
      (il riferimento attuale è 12 prove fallite su 117, vedi `RIPRENDI-DOMANI.md`)
- [ ] `node server/genera.js` si chiude senza errori e senza avvertimenti nuovi
- [ ] Non ho modificato a mano i file generati: `index.html`, `js/dati.js`, `css/tema.css`
- [ ] La PR tratta **un solo** argomento
- [ ] Indentazione a 2 spazi, fine riga LF, testi in italiano con gli accenti veri
- [ ] Nessun valore esadecimale introdotto fuori da `css/tokens.css`
- [ ] Se ho aggiunto un campo, l'ho fatto in tutti e tre i punti: `contenuti.json`, `modelli/`, `contenuti/schema.js`
- [ ] Documentazione aggiornata (`README.md`, `docs/…`) dove serviva
- [ ] Voce aggiunta a `CHANGELOG.md` se la modifica si vede
- [ ] **Nessun segreto committato**: password, token Twitch, Client ID privati, `server/dati/auth.json`
- [ ] I messaggi di commit seguono la convenzione di [`CONTRIBUTING.md`](https://github.com/Shadowed1996/Slayer_Beard-Website/blob/main/CONTRIBUTING.md)

## Note per chi revisiona

<!-- Punti su cui vuoi un occhio in più, decisioni discutibili, cose lasciate fuori di proposito. -->
