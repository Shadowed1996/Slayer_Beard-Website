# Politica di sicurezza

Il progetto è il sito del canale Twitch **slayer_beard** più il pannello di
amministrazione che lo genera. Le due parti hanno un'esposizione molto diversa,
e conviene tenerle distinte fin da subito:

- **il sito pubblicato è statico** — `index.html`, `css/`, `js/`, `img/`: non
  parla con nessun server del progetto, non ha un database e non conserva dati
  dei visitatori;
- **il server e il pannello girano in locale** (`127.0.0.1:4173` di serie) e non
  vanno esposti su Internet. Non sono pensati per stare online.

## Versioni supportate

Riceve correzioni soltanto l'ultima versione presente sul branch `main`.

| Versione | Supportata |
|---|---|
| `main` (ultima pubblicazione) | Sì |
| Revisioni precedenti, copie in `server/backup/` | No |

## Come segnalare una vulnerabilità

**Non aprire una issue pubblica** per un problema di sicurezza.

1. Vai nella scheda **Security** del repository e scegli
   **Report a vulnerability**: apre una GitHub Security Advisory privata,
   visibile solo al titolare del repository.
2. In alternativa, contatta [@Shadowed1996](https://github.com/Shadowed1996)
   su GitHub.

Le segnalazioni non vanno inviate per altri canali, e in nessun caso vanno
pubblicate prima che sia disponibile una correzione.

### Cosa includere nella segnalazione

Più la segnalazione è precisa, prima si chiude:

- descrizione del problema e impatto concreto (cosa riesce a fare un
  attaccante che oggi non dovrebbe poter fare);
- **quale parte** riguarda: sito statico generato, pannello, server di
  amministrazione, generazione, oppure l'integrazione con Twitch;
- passi per riprodurlo, nell'ordine, con i valori usati;
- ambiente: sistema operativo, versione di Node.js, browser e versione;
- eventuali log della console, richieste di rete o schermate;
- se lo hai, un suggerimento di correzione.

### Tempi di risposta

| Fase | Tempo indicativo |
|---|---|
| Primo riscontro | entro 7 giorni |
| Valutazione e conferma | entro 14 giorni |
| Correzione o piano di rientro | concordato in base alla gravità |

Il progetto è curato da una sola persona nel tempo libero: i tempi sono un
impegno serio ma non contrattuale.

## Divulgazione responsabile

Chi segnala in buona fede, senza danneggiare dati o servizi e senza divulgare
il problema prima della correzione, **non subirà alcuna azione legale** da
parte del titolare. Su richiesta, il contributo viene riconosciuto nella nota
di rilascio della correzione.

## Punti sensibili noti

Sono le aree su cui vale la pena guardare per prime. Non sono vulnerabilità
aperte: sono le parti dove un errore costerebbe di più.

- **Password del pannello.** Una sola password, con hash `scrypt` salvato in
  `server/dati/auth.json` (file escluso dal versionamento tramite
  `.gitignore`). Le sessioni vivono in memoria e scadono; i tentativi di
  accesso sono limitati per indirizzo IP.
- **Percorsi delle richieste.** Il server risolve i percorsi dentro una radice
  e rifiuta tutto ciò che ne esce (`server/lib/percorsi.js`): un
  *path traversal* che sfuggisse a quel controllo è una vulnerabilità.
- **Testo ricco.** I campi di tipo `ricco` accettano un sottoinsieme di HTML e
  vengono ripuliti in generazione da `server/lib/testoricco.js`. Un tag o un
  attributo che superi il filtro e finisca in `index.html` è una
  vulnerabilità (XSS memorizzato).
- **Caricamento di immagini** dal pannello, in `contenuti/media/`.
- **Token Twitch del visitatore.** Il collegamento facoltativo con Twitch usa
  l'*implicit grant*: il token vive in `sessionStorage`, muore con la scheda,
  non viene mai inviato a un server del progetto e «Scollega» ne chiede la
  revoca a Twitch. Qualunque percorso che lo faccia sopravvivere alla scheda,
  lo scriva su disco o lo mandi altrove è una vulnerabilità.
- **Content Security Policy** della pagina generata e domini esterni
  consentiti (Twitch, Google Fonts, `static-cdn.jtvnw.net` per le immagini
  dei profili).

## Fuori ambito

Non sono considerate vulnerabilità di questo progetto:

- l'esposizione volontaria del server di amministrazione su una rete pubblica
  o su Internet: **non è previsto** e non va fatto;
- problemi che richiedono un accesso già amministrativo alla macchina su cui
  gira il server, o la password del pannello già nota;
- vulnerabilità di Twitch, del suo player, della sua chat o delle sue API, e
  in generale di servizi di terze parti: vanno segnalate a chi li gestisce;
- il comportamento dei cookie di terze parti dentro l'embed di Twitch, che il
  sito non può né leggere né controllare (vedi
  [`docs/PRESENZA-TWITCH.md`](docs/PRESENZA-TWITCH.md));
- la mancata riproduzione del player aprendo `index.html` con `file://`: è un
  requisito di Twitch sul parametro `parent`, ed è documentato;
- risultati di scanner automatici senza una dimostrazione di impatto reale;
- assenza di intestazioni di sicurezza dipendenti dall'hosting scelto per il
  sito statico;
- attacchi di *social engineering*, *phishing* o accesso fisico alla macchina;
- denial of service ottenuto con un volume di richieste anomalo verso un
  server che, per definizione, gira in locale.
