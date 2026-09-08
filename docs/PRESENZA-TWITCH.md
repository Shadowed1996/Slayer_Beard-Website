# Presenza, lurk e login Twitch — da leggere prima di sviluppare

Documento di studio. Nessuna riga di codice è stata scritta: qui c'è cosa è stato verificato,
cosa se ne ricava, e cosa si è deciso di costruire. Va letto prima di aprire un editor, perché
la conclusione principale ribalta la premessa da cui si era partiti.

---

## Contesto

### L'obiettivo, nei termini in cui è stato precisato

**Non si vuole gonfiare niente.** Il problema riguarda gli spettatori **veri** — gli iscritti e
gli affezionati che stanno effettivamente guardando la diretta — che a un certo punto si
allontanano dalla tastiera restando in lurk, **e che poi si ritrovano a non essere più contati**.

Sono persone che stanno guardando davvero, che vogliono restare, e che vengono perse non per
scelta loro ma perché il browser o il telefono spengono la scheda alle loro spalle. Il sito deve
dare **un modo di supporto** perché quella presenza — reale — non svanisca.

Questa è una richiesta legittima, e la risposta esiste. Non passa dalla chat.

### Da dove si era partiti, e perché la strada è cambiata

La prima formulazione era: l'utente fa login con Twitch, preme un tasto «lurk», e il pollo
scrive periodicamente in chat a nome suo frasi a rotazione tipo «Hey! Ci sono, ti seguo dal
sito». La motivazione era che «se uno resta AFK troppo non viene più contato, e per questo hanno
inventato il riscatto punti che segna il lurk, o lo scrivere ogni tanto in chat».

È stata fatta una ricerca su tre fronti — come Twitch conta davvero la presenza, cosa consente
il regolamento, cosa è tecnicamente possibile da un sito statico. **La ricerca ha smentito quel
rimedio, ma ha confermato il problema.**

Il rimedio è sbagliato perché **la chat non entra nel conteggio spettatori** (§1.3): nessun
messaggio, per quanto frequente, rimette una persona fra i viewer. Il problema è invece reale,
e ha una causa precisa: **muore la sessione video** (§1.4). Da lì discende la soluzione, che è
sorvegliare quella sessione e rimetterla in piedi quando cade — la **Strada A** del §5.

### Cosa si è deciso di costruire

Due cose distinte, che rispondono a due bisogni distinti e vanno tenute separate anche nel
codice:

- **A — tenere viva la sessione video** (§5). È la risposta al problema del conteggio. Non
  richiede login né token.
- **B1 — il messaggio di lurk** (§6.2): l'utente si collega con Twitch, preme un tasto, e parte
  **un** messaggio a suo nome — «Hey! Lurko dal sito». Richiesto esplicitamente, è lecito, e
  serve al **valore sociale**: far sapere alla chat e allo streamer che quella persona c'è. Non
  incide sul conteggio, e il documento lo ripete dove serve.

**Resta fuori** l'invio periodico automatico (§6.3): viola il regolamento, non ottiene
l'obiettivo, ed è ridondante rispetto ad A. L'analisi resta nel documento perché era la
richiesta iniziale e perché serve a spiegare **perché non si fa**.

---

## 1. Come Twitch conta davvero la presenza

### 1.1 Il criterio è uno solo: il video sta girando

Documentazione ufficiale, *Understanding Viewer Count vs. Users in Chat*:

> «In order for someone to be counted towards your Viewer Count, they have to have your stream
> open — even if your stream is playing in another tab, they have your stream muted, or
> **they're watching your stream that's embedded on another page**.»

E le due FAQ dello stesso articolo:

> «Does a muted stream count as a view? **Yes!** […] so long as live video is playing.»
> «If I have a stream open playing live video in another tab, do I still count as a viewer?
> **Yes**, if live video is playing, **even if that tab is not in focus**.»

Non conta il fuoco della finestra, non conta l'audio, non conta l'interazione. Conta **la
sessione video**. L'aggiornamento del conteggio richiede «up to a few minutes».

### 1.2 Non esiste nessun timeout AFK

Non è stata trovata **nessuna** traccia — documentazione, annunci, changelog, segnalazioni — di
un prompt «sei ancora lì?» sul player Twitch. Quello è comportamento di Netflix e YouTube.

La prova empirica più forte è che l'intero ecosistema di AFK farming (drops miner, channel
points miner) gira **headless e 24/7 da anni**, senza che nessuno tocchi il mouse. Se ci fosse
un controllo di interazione, non funzionerebbe niente di tutto quello.

Il meccanismo interno è comunque una scatola nera dichiarata: un moderatore Twitch dei forum
dev, nel 2020, «The view count thing is a blackbox». Quello che si sa dal reverse engineering è
che il client manda circa ogni 60 secondi un evento `minute-watched` alla telemetria
(`spade.twitch.tv`) che dichiara anche `hidden` e `muted` — cioè **Twitch sa che sei in
background e mutato, e per policy dichiarata ti conta lo stesso**.

### 1.3 La chat non entra nel conteggio — questo è il punto che chiude la questione

Dallo stesso articolo ufficiale, testuale:

> «**Users in Chat do not count towards Viewer Count unless they are watching live video on the
> same device.**»

Sono due sistemi separati e solo parzialmente sovrapposti:

| | Viewer Count | Users in Chat |
|---|---|---|
| Su cosa si basa | sessione video attiva | connessione al socket di chat |
| Serve essere loggati | no | sì |
| Chi usa la chat popout o un client IRC | **non conteggiato** | conteggiato |
| Chi guarda il video senza chat | conteggiato | non conteggiato |
| Scrivere messaggi | **nessun effetto** | nessun effetto (basta essere connessi) |

**Conseguenza diretta: scrivere in chat non rimette nessuno nel conteggio spettatori.** La
funzione richiesta all'inizio, anche costruita alla perfezione, non produrrebbe l'effetto per
cui la si voleva. Non è una questione di implementazione: è il meccanismo che non passa di lì.

### 1.4 Perché allora i lurker spariscono davvero

Il fenomeno osservato è reale, ma la causa è un'altra: **muore la sessione video**.

- **Mobile** — l'app e i browser mobili mettono in pausa quando l'app va in background o si
  blocca lo schermo. È la causa più frequente in assoluto, ed è irrimediabile dal sito.
- **Desktop** — tab discarding e sleeping (Chrome Memory Saver, Edge sleeping tabs), standby
  del PC, stallo del player, scadenza del token di playback, caduta di rete.

In tutti questi casi il video smette di girare e in pochi minuti sparisci dal conteggio. Non
perché sei AFK, ma perché **non stai più guardando davvero**. L'unica cosa che rimette una
persona nel conteggio è **far ripartire il video**. Nessuna azione in chat lo fa.

Un fattore che ha alimentato molto questo folklore: nell'estate 2025 Twitch ha fatto un giro di
pulizia anti-viewbot che ha abbassato i conteggi di tutta la piattaforma (stime fra il 5% e il
24%), e molti streamer hanno letto il calo come «Twitch ha smesso di contare i lurker».

### 1.5 Il `!lurk` e i punti canale: a cosa servono davvero

- **`!lurk` non è di Twitch.** È una convenzione della community, realizzata come comando di un
  bot del canale (Nightbot, StreamElements) o come ricompensa punti canale personalizzata. Fra
  le ricompense native di Twitch non esiste nulla del genere.
- **Il suo effetto sulla piattaforma è zero**: non tocca il conteggio spettatori, non tocca le
  ore guardate, non tocca i Drops, e non tocca la chatter list (in cui eri già, essendo
  connesso alla chat). È **segnalazione sociale**: serve a far sentire visti i lurker e a dare
  allo streamer un'idea di chi c'è.
- **L'inversione causa-effetto è il cuore dell'equivoco**: il `!lurk` è nato perché lo streamer
  **non vede** i lurker, non perché Twitch **non li conti**.
- **I punti canale** maturano con la sessione video attiva e l'account loggato, circa 10 ogni 5
  minuti. Nessun rilevamento AFK: i miner accumulano punti headless da anni. Lo scrigno «Claim
  bonus» (+50 circa ogni 15 minuti) è puramente additivo — non riscattarlo **non interrompe**
  l'accumulo base e non toglie dal conteggio.

### 1.6 Verifica puntuale della premessa

| Affermazione di partenza | Verdetto | Perché |
|---|---|---|
| Se resti AFK troppo, non sei più contato | **Falsa come regola** | Il criterio è «finché il video gira». Nessun timeout, nessun prompt. |
| …però in pratica i lurker spariscono | **Vera, per cause tecniche** | Mobile in background, tab sospese, standby, stalli: muore la sessione video. |
| Hanno fatto il riscatto punti «lurk» per farsi contare | **Falsa** | Il lurk non è nativo ed è puramente sociale. Nessun legame col conteggio. |
| Scrivere in chat ogni tanto ti rimette nel conteggio | **Falsa — folklore** | Contraddetta testualmente dalla documentazione ufficiale (§1.3). |
| Chat e conteggio spettatori sono cose diverse | **Vera e ufficiale** | Insiemi distinti, solo in parte sovrapposti. |

### 1.7 La buona notizia: il sito fa già la cosa giusta

`js/player.js` incorpora il player con `muted: true` e `autoplay: true`, dentro una sezione
`#diretta` in cui il monitor è il contenuto principale, grande e non occluso.

Twitch dal **15 novembre 2023** disabilita l'autoplay negli embed «non sostanziali» — nascosti,
occlusi, a fondo pagina, o piazzati lì per gonfiare il conteggio. I requisiti sono HTTPS,
`parent` corretto per ogni dominio, **minimo 400×300 px**, player non occluso.

Il sito li rispetta tutti. **I visitatori che tengono aperta la pagina con la diretta in corso
sono già conteggiati come spettatori veri**, ufficialmente, embed compreso. Non serve fare
niente perché accada: sta già accadendo.

Questo ha un corollario da tenere a mente per tutto il resto del documento: **l'invio periodico
da un sito statico funziona solo finché la scheda resta aperta — ma se la scheda è aperta e il
video gira, quella persona è già contata.** Un invio automatico lavorerebbe esattamente quando è
inutile, e tacerebbe esattamente quando servirebbe.

### 1.8 Loggato o anonimo: cosa cambia per un abbonato

Qui c'è una distinzione che cambia la risposta a seconda di **per chi** deve valere la presenza.

**Per il canale**, non cambia niente: il conteggio spettatori include anche chi non è loggato e
perfino chi non ha un account Twitch. Uno spettatore anonimo dentro l'embed vale esattamente
quanto un abbonato.

**Per la persona**, cambia tutto. Punti canale, watch streak e Drops richiedono di **essere
loggati su Twitch**. E nell'embed la sessione Twitch dell'utente viaggia sui **cookie di terze
parti** — quelli che Safari blocca da anni, che Firefox isola per dominio, e che Chrome sta
progressivamente restringendo.

Conseguenza concreta, e va detta all'utente senza girarci intorno:

> Se il tuo browser blocca i cookie di terze parti, guardando dentro il nostro sito **conti per
> il canale ma non per te**: niente punti canale, niente streak. Il video va, il conteggio del
> canale ti include, ma per Twitch sei un anonimo.

E c'è un limite che non possiamo aggirare: l'iframe è di un altro dominio, quindi **il sito non
può sapere se l'embed è autenticato o no**. Non possiamo rilevarlo e mostrare un avviso mirato.
Possiamo solo dirlo una volta, chiaramente, e lasciare scegliere.

**Questo ha una conseguenza diretta sul disegno.** Per un abbonato che vuole che il suo lurk
valga *anche per lui*, la strada più affidabile non è il nostro sito: è **twitch.tv**. Il
pannello del lurk deve dirlo apertamente e offrire il collegamento — che nella pagina esiste
già, `#apri-twitch`. Un pannello che promette a un abbonato di tenerlo «presente» senza
spiegargli questa differenza gli sta raccontando una mezza verità.

La modalità lurk resta comunque utile: tiene viva la sessione per il conteggio del canale, e per
chi ha i cookie di terze parti attivi tiene viva anche la sua.

### 1.9 Il confine da non superare

Nell'elenco dei divieti delle Community Guidelines, accanto allo spam, c'è anche:

> «Cheat the Twitch rewards system (such as the **Drops or channel points** systems)»

È il confine che separa questa funzione dai *miner* di punti e Drops, che fanno tecnicamente una
cosa simile — tengono viva una sessione senza un umano davanti — e che sono la pratica che
quella riga vieta.

La differenza è **la persona**, e sta in due cose:

- **Rimettere in piedi una sessione caduta a qualcuno che è lì** — scheda aperta, computer
  acceso, se n'è andato in cucina — è legittimo: Twitch stessa dichiara che una scheda mutata e
  in secondo piano **conta**, quindi non stiamo creando uno spettatore, stiamo evitando di
  perderne uno vero.
- **Tenere una riproduzione accesa all'infinito per qualcuno che se n'è andato** è l'altra cosa,
  e non va fatta.

Da qui una scelta di disegno che il §5 deve rispettare: **la modalità lurk deve avere un limite
suo.** Dopo alcune ore chiede «ci sei ancora?» e, se nessuno risponde, si spegne da sola. È
paradossale — mettiamo noi il controllo di presenza che Twitch non fa — ma è esattamente ciò che
tiene la funzione dalla parte giusta del confine, ed è anche onesto verso l'utente: nessuno vuole
scoprire di aver lasciato una diretta accesa tutta la notte.

E una regola di comunicazione: la funzione **non si presenta mai come «accumula punti canale
mentre sei AFK»**. Si presenta per quello che è — non perdere la diretta che stavi già
guardando.

---

## 2. Il verdetto sul regolamento

Vale per l'invio **automatico e ripetuto**, che era la richiesta iniziale. Non è una zona
grigia: viola contemporaneamente tre testi.

### 2.1 Community Guidelines

Sezione *Spam, Scams, and Other Malicious Conduct*, frase-ombrello:

> «Any content or activity that disrupts, interrupts, harms, or otherwise violates the integrity
> of Twitch services or **another user's experience** or devices is prohibited.»

e nell'elenco puntato: «Post spam, such as large amounts of **repetitive, unwanted messages**».

Un messaggio ogni N minuti, pescato da una lista fissa, moltiplicato per ogni utente loggato sul
sito, è la definizione manualistica di spam. E le **frasi a rotazione non attenuano: aggravano**
— servono tecnicamente ad aggirare il filtro anti-duplicato di Twitch, che blocca messaggi
identici ravvicinati dallo stesso utente. Aggirare le contromisure della piattaforma è a sua
volta vietato.

### 2.2 Developer Services Agreement

> «You must **not design bots that engage in offensive or deceptive practices** (e.g., generate
> hate speech, **send spam**, offer false follows, etc.)»

Il DSA chiede anche consenso esplicito e opt-out per le comunicazioni in chat. Va letto per
quello che è: un **requisito minimo che si aggiunge** al divieto di bot ingannevoli, non una
licenza che lo sostituisce.

Vale anche la regola sugli scope: chiedere più permessi del necessario è motivo dichiarato di
sospensione dell'app.

### 2.3 Terms of Service

Vietano l'accesso automatizzato e il **bypass delle misure di protezione**, e — dettaglio che
conta — parlano di usare un account «without authorization from that user **and Twitch**».
Testualmente: il consenso del titolare dell'account è condizione **necessaria ma non
sufficiente**.

### 2.4 Il consenso dell'utente non sana la violazione

Quattro ragioni, in ordine di forza:

1. **Gli ingannati sono altri.** Le linee guida tutelano «another user's experience»: streamer,
   moderatori e altri spettatori leggono «Ci sono!» e credono che ci sia una persona. Nessuno di
   loro ha acconsentito, e non si può acconsentire per conto di terzi.
2. **I ToS richiedono anche l'autorizzazione di Twitch**, non solo quella dell'utente.
3. **Il DSA vieta i bot ingannevoli in modo incondizionato.** Nessuna formula di consenso
   trasforma lo spam in non-spam.
4. **Il fatto materiale non cambia**: il messaggio resta falso — dice «ci sono» mentre l'utente
   non c'è — e resta non richiesto dal canale che lo riceve.

Cosa il consenso **fa** cambiare davvero: sposta l'inquadramento da «app che dirotta account» a
«app che viola le regole con la complicità dell'utente». Riduce il rischio legale verso lo
sviluppatore, non quello di ban. Va comunque raccolto, ma non è il punto.

### 2.5 Chi paga, e quanto

| Chi | Cosa rischia |
|---|---|
| **Gli spettatori** | Sospensione della chat, crescente fino alla sospensione dell'account. Sono loro a mandare i messaggi, col loro nome. |
| **Il canale** | Dal maggio 2026 Twitch applica un **cap al CCV** ai canali associati a engagement artificiale, per un periodo fisso e crescente in caso di recidiva. Con l'affiliazione e la monetizzazione di mezzo. |
| **L'app** | Sospensione dell'accesso alle API e revoca del Client ID. |
| **Il sito** | Essendo il sito ufficiale del canale, lo streamer è il bersaglio naturale dell'enforcement, anche se i messaggi partono dagli account degli utenti. |

Due precisazioni di onestà, per non gonfiare l'accusa:

- **Non è viewbotting in senso stretto**: non gonfia né CCV né follower, perché la chat non
  incide sul conteggio (§1.3). Se qualcuno dovesse contestarlo, questa distinzione è corretta e
  va fatta valere.
- **Ma non serve il viewbotting perché scatti la sanzione**: bastano spam e pratica ingannevole,
  che stanno in piedi da soli.

L'enforcement, però, è **opaco e automatico**. Sul forum dev è documentato il caso di un bot
Tamagotchi che rispondeva solo a comandi, 1–2 messaggi al minuto, sospeso in modo permanente per
«malicious violations», con appelli respinti all'istante e nessuna spiegazione. Se un bot
innocuo si prende quel trattamento, un bot progettato per simulare presenza è ad altissimo
rischio. Su un canale Affiliate da ~25 spettatori medi, per giunta, qualsiasi anomalia nel
rapporto spettatori/chatter è vistosa — ed è proprio l'indicatore che Twitch ha dichiarato di
usare.

### 2.6 Perché Nightbot è lecito e un timer sul pollo no

| | Nightbot / StreamElements | Invio automatico dal sito |
|---|---|---|
| Identità | account proprio, riconoscibile | **il nome dell'utente umano** |
| Dichiarazione | Chat Bot Badge, sezione «Chat Bots» | indistinguibile da un umano |
| Chi autorizza | **il broadcaster**, nel proprio canale | il visitatore, sul canale di un altro |
| Trigger | comandi, eventi, timer impostati dal broadcaster | timer di un terzo sugli account di terzi |
| Controllo dei mod | ban del bot in un clic | i mod devono bannare **utenti reali**, uno per uno |
| Scopo | aggiungere funzionalità | **simulare presenza umana** |

La regola implicita, ricavabile da tutti i testi: **un bot è accettabile quando è riconoscibile
come bot ed è autorizzato da chi possiede lo spazio in cui parla.** Anche i timer di Nightbot
sono leciti per questo, non perché «i messaggi automatici vanno bene».

### 2.7 E il `!lurk` scritto a mano, allora?

La differenza è regolamentarmente decisiva, su tre assi. **È anche il motivo per cui la B1 del
§6.2 è lecita e la B2 del §6.3 no.**

1. **Volizione per messaggio.** `!lurk` = un atto umano → un messaggio. Un invio automatico =
   un atto umano (il login) → N messaggi indefiniti. Quando il rapporto non è 1:1, l'autore non
   è più l'utente: **la firma è sua, la volontà è dello scheduler**.
2. **Ripetizione.** Un `!lurk` non è ripetitivo. Sei messaggi l'ora per venti utenti sono 120
   messaggi l'ora generati da nessun essere umano.
3. **Intento.** `!lurk` è **onesto**: dichiara «non sono attivo, guardo in silenzio». Un invio
   automatico che dice «**ci sono**» proprio quando l'utente non c'è mascherala l'assenza invece
   di segnalarla — cioè, letteralmente, *deceptive*.

---

## 3. Fattibilità tecnica

Riassunto: **tecnicamente si può fare tutto, anche senza backend.** L'ostacolo non è tecnico.

### 3.1 Login OAuth da sito statico

| Flusso | Serve il secret | Usabile qui | Refresh |
|---|---|---|---|
| **Implicit grant** | no | **sì** | no |
| Authorization code | **sì** | no (serve backend) | sì |
| **Device Code Flow** | no (client «public») | **sì** | sì |
| Client credentials | sì | no (non dà identità utente) | no |

- **Twitch non supporta PKCE.** Confermato sui forum dev, richiesta aperta dal 2019. La
  soluzione moderna standard per le SPA qui non esiste.
- **Implicit grant è ancora attivo** e la documentazione lo consiglia esplicitamente per le app
  senza server. È deprecato *dallo standard* OAuth, non da Twitch: rischio futuro, non attuale.
  Token di **circa 60 giorni, non rinnovabile** (fonte community autorevole, non documentata
  ufficialmente).
- **Trappola da conoscere**: per usare l'implicit flow l'app va registrata come **confidential**
  (il secret viene generato e semplicemente non si usa mai). Registrandola come **public** si
  resta vincolati al solo Device Code Flow.
- **Device Code Flow**: token 4 ore + refresh senza secret, ma l'utente deve aprire
  `twitch.tv/activate` e digitare un codice. UX inaccettabile per un sito vetrina.

### 3.2 Invio dei messaggi

`POST https://api.twitch.tv/helix/chat/messages` con `broadcaster_id`, `sender_id`, `message`.
Serve **solo `user:write:chat`**, concesso dall'utente. **Il broadcaster non deve autorizzare
nulla** — ed è precisamente questo che rende la cosa possibile e problematica insieme.

Il messaggio appare come un normalissimo messaggio dell'utente: **nessun badge di bot**. Il
badge si ottiene solo con l'altro percorso (app access token + `user:bot` + `channel:bot` dal
broadcaster), che è quello dei bot dichiarati.

Limiti: 20 messaggi / 30 secondi per utente normale, più un anti-flood per canale non
documentato. Per un invio a clic siamo ordini di grandezza sotto. Il vincolo vero è il rifiuto
dei messaggi identici consecutivi.

### 3.3 CORS — verificato sul campo

Twitch non documenta i CORS. Verifica diretta del 6 settembre 2026: `POST /helix/chat/messages`
risponde al preflight con `Access-Control-Allow-Origin: *` e
`Access-Control-Allow-Headers: Authorization, Client-Id, Content-Type`. Tutti gli endpoint
`id.twitch.tv/oauth2/*` (validate, token, revoke, device) sono anch'essi CORS `*`.

**Si può fare tutto dal browser, senza proxy.** Regola pratica: mandare **solo** quei tre
header — qualsiasi header in più fa fallire il preflight, ed è la causa reale di quasi tutti i
«CORS error» segnalati sui forum.

### 3.4 Il token, e il rischio che nessuno considera

Un token con `user:write:chat` permette di scrivere **in qualsiasi canale di Twitch**, non solo
in questo: `broadcaster_id` è un parametro della richiesta, non un vincolo del token.

Quindi: un token valido **60 giorni**, non revocabile per singolo canale, su un sito pubblico.
**Una sola XSS = i token di tutti i visitatori**, e chi li ottiene ha una botnet di account
reali e verificati con cui spammare ovunque su Twitch. La responsabilità ricadrebbe sugli
utenti, non sul sito.

È esattamente il motivo per cui Twitch ha progettato le Extension in modo da rendere questo
pattern impraticabile: alla domanda «posso postare in chat come il viewer da una extension?» la
risposta ufficiale è che è sconsigliato, perché darebbe accesso di scrittura su qualsiasi canale
— un permesso che un viewer non concederebbe ragionevolmente.

Mitigazioni possibili, nessuna risolutiva: CSP stretta (il miglior rapporto costo/beneficio),
`sessionStorage` invece di `localStorage`, pulizia immediata del fragment `#access_token` con
`history.replaceState()`, e un pulsante di disconnessione che **revochi davvero** il token su
`POST id.twitch.tv/oauth2/revoke` invece di limitarsi a svuotare lo storage.

**Obbligo dichiarato da Twitch**: il token va validato all'avvio e **ogni ora** su
`GET id.twitch.tv/oauth2/validate`. Non è un consiglio, è un requisito contrattuale.

### 3.5 Il vincolo che nessuna API risolve

Un sito statico **non ha esecuzione in background**. «Periodicamente» significa:

- la scheda deve restare **aperta**;
- i browser fanno throttling aggressivo dei timer nelle schede in secondo piano (circa una
  esecuzione al minuto, e Chrome congela del tutto le schede inattive dopo qualche minuto);
- chiusa la scheda, finisce tutto.

Per un invio periodico reale servirebbe un componente server-side che **conserva i refresh token
degli utenti** — cioè il backend che il CONTRATTO esclude, più un database di token altrui, più
la responsabilità di custodirli, più gli obblighi GDPR che ne derivano.

---

## 4. Prima delle proposte: quanto vale la pena, davvero

Quattro cose vanno dette prima, altrimenti tutto il resto inganna.

1. **Qualsiasi cosa costruiamo aiuta solo chi guarda la diretta *da questo sito*.** La quasi
   totalità dei ~25 spettatori medi guarda su `twitch.tv`, dove il sito non può fare niente. Il
   bacino reale è una manciata di persone. Non è un buon motivo per non farlo — è un buon motivo
   per non spenderci un mese.
2. **Il messaggio in chat non aumenta il conteggio spettatori.** È il §1.3. Va detto una volta
   chiaramente e poi non si torna sull'argomento.
3. **Nemmeno la strada A garantisce zero buchi.** Twitch riceve i `minute-watched` circa ogni
   60 secondi: fra la morte della sessione e il riavvio riuscito passa comunque fino a un
   minuto in cui lo spettatore non è contato. Il guadagno è che il buco duri **secondi invece
   che ore**.
4. **Per un abbonato, il sito non è la strada più affidabile: lo è twitch.tv** (§1.8). Se i
   cookie di terze parti sono bloccati, dentro il nostro embed quella persona conta per il
   canale ma non per sé — niente punti, niente streak. La funzione va costruita dicendolo, non
   nascondendolo.

---

## 5. Strada A — tenere viva la sessione video

È l'unica che agisce sul meccanismo giusto: se il conteggio dipende dal video che gira, si
sorveglia il video e lo si fa ripartire quando si ferma.

### 5.1 Come si presenta

Un pannello nuovo **sotto il monitor**, dentro `#diretta`, mai sopra il player (occludere
l'embed violerebbe i requisiti di Twitch, §1.7). Nuovo parziale `modelli/parziali/lurk.html`
incluso con una riga condizionata da `diretta.html`, sulla falsariga di come è già incluso il
pollo.

Il comando **non va sul pollo**: il clic sul pollo apre la chat, è fissato dal CONTRATTO-2 §3.3
e sovraccaricarlo romperebbe quel contratto. Il pollo commenta il lurk, non lo comanda.

Un bottone `#lurk-toggle` con `aria-pressed` accende e spegne. **Mai attivazione automatica**:
il lurk consuma banda e batteria di qualcun altro e va chiesto. La scelta si ricorda in
`localStorage` (`sb-lurk-acceso`, in `try/catch` come `sb-pollo-nascosto`), ma alla riapertura
il pannello dice «l'avevi lasciata accesa» e **aspetta un clic**: il sito non prende iniziative
sul computer di altri.

Il parziale contiene **solo il guscio e i testi**: `#lurk-comandi` resta vuoto e lo riempie il
JavaScript, come già succede per `#twitch-embed`. Senza JavaScript non restano bottoni morti
raggiungibili col Tab.

### 5.2 Come si accorge che il video è morto

Quattro gradini, dal più affidabile al più congetturale. Nessuno dei gradini bassi può da solo
dichiarare la morte.

1. **Eventi dell'SDK** — istantanei e autorevoli. `PAUSE` → ferma, riavviabile. `ENDED`/`OFFLINE`
   → il canale ha smesso, **non c'è niente da tenere vivo**. `PLAYBACK_BLOCKED` → non è mai
   partita, serve un gesto dell'utente. `PLAY`/`PLAYING`/`ONLINE` → viva, azzera gli allarmi.
2. **Sentinella ogni 20 secondi** a pagina visibile, che legge la cache dell'SDK: **nessuna
   richiesta di rete**. `Idle`/`Ended` dopo essere stato in onda → morta. `Buffering` per tre
   cicli di fila (~60 s) → stallo; un buffering isolato è normale e non si tocca.
3. **Avanzamento del tempo** — l'unico modo di scoprire lo stallo silenzioso, cioè il player che
   dichiara `Playing` mentre è fermo su un frame.
4. **Contorno** — `navigator.onLine === false` blocca ogni tentativo. Si usa solo in questo
   verso: `false` è affidabile, `true` non garantisce niente.

**Quello che oggi manca in `js/player.js`**, verificato riga per riga: `P.PAUSE` non è ascoltato
da nessuno; la caduta di rete a metà sessione non è gestita (il listener `online` esiste solo se
la rete mancava all'avvio); nessuno legge `getEnded()` o `getCurrentTime()`. Il ricontrollo
periodico esiste ma è a 90 secondi — troppo per il lurk, e **non va abbassato per tutti**: la
cadenza fitta è un timer del lurk, così chi guarda normalmente non paga niente.

**Limite duro, da scrivere nel pannello:** con la scheda in secondo piano i browser portano i
timer a una esecuzione al minuto e dopo qualche minuto **congelano la pagina**. In background la
sentinella gira poco o non gira. Rimedio parziale: al ritorno in primo piano si fa subito un
ciclo di recupero, così dopo due ore di congelamento si scopre entro un secondo che il video è
morto, invece che entro venti.

### 5.3 Come lo fa ripartire, senza impazzire

Tre livelli: `play()` (costo zero, copre il 90% dei casi), `setChannel()` (riaggancia senza
creare un player nuovo), ricostruzione completa (costosa, 3-4 secondi di nero, e con una fuga di
listener già documentata nel codice) — **massimo due volte per caricamento di pagina**.

I freni contano più dei livelli. Il riavvio si rifiuta se: il player è in modalità iframe
manuale (non ci sono né eventi né `play()`); **il canale è dichiarato fuori onda** — il freno
più importante, un canale spento non ha una sessione da tenere viva; l'autoplay è stato negato;
la rete è giù; il tetto è esaurito; oppure il video sta andando e la pagina è visibile — non si
riavvia mai un player funzionante in faccia a chi sta guardando.

Attese crescenti fra i tentativi (5 s, 15 s, 45 s, 2 min, poi resa), e il contatore si azzera
solo dopo un `PLAY` che regge più di 60 secondi. Il tetto vive dentro `player.js`, non nel
chiamante: è l'unico che sa quante istanze ha creato.

### 5.4 La scheda sospesa, e la tentazione da evitare

La riproduzione protegge la scheda dalla sospensione, ma Chrome ed Edge misurano **«audible»**,
non «sta riproducendo». Il player parte mutato per forza (senza `muted` il browser nega
l'autoplay), quindi la protezione piena non c'è.

La mossa efficace è banale: **un bottone che toglie il muto**, con una riga che spiega perché
aiuta. Parte da un clic, quindi è legittimo.

**Quello che non si fa**, ed è la tentazione ovvia: togliere il muto d'ufficio e mettere il
volume a 0,01 per far risultare la scheda «audible». È esattamente il gonfiaggio artificiale per
cui Twitch disabilita l'autoplay negli embed. Fuori discussione.

**Screen Wake Lock**: non risolve il problema principale. Fallisce proprio quando servirebbe
(non si può acquisire a scheda nascosta) e si perde da solo al primo cambio di visibilità. Serve
a un caso solo e stretto — PC acceso, scheda in primo piano, persona che si allontana e schermo
che si spegnerebbe. Tiene acceso lo schermo di qualcun altro e consuma batteria: interruttore
**separato e spento di serie**, mai implicito nell'attivazione del lurk.

### 5.5 Cosa vede l'utente, e il mobile

Sette stati dichiarati in chiaro (`spento`, `attiva`, `il video si è fermato`, `rimetto in moto`,
`il browser ha bloccato la riproduzione`, `il canale è fuori onda`, `non ci riesco più`), più un
conteggio onesto: «viva da 1h 12m · 2 riavvii». Il contatore va in un elemento **senza**
`aria-live`, altrimenti un lettore di schermo parla ogni secondo — lo stesso problema che il
CONTRATTO-2 ha già risolto mettendo `aria-hidden` sul fumetto del pollo.

**Sul telefono non funziona, e va detto.** iOS e Android mettono in pausa il video appena la
scheda va in background, i timer sono sospesi del tutto, e il Picture-in-Picture non è attivabile
da noi perché l'iframe è di un altro dominio. Il bottone non si nasconde su mobile: si dice la
verità e si lascia decidere.

### 5.6 Le due cose che tengono la funzione onesta

Non sono dettagli di rifinitura: sono ciò che distingue questa funzione da un miner di punti, e
vanno costruite insieme al resto, non dopo.

**Il controllo di presenza nostro.** Dopo un numero di ore configurabile (proposta: 3, campo
`numero` nel pannello) il pannello chiede «ci sei ancora?» e, senza risposta entro qualche
minuto, **si spegne da solo**. È il §1.9: rimettere in piedi la sessione di chi è lì è
legittimo, tenerla accesa all'infinito per chi se n'è andato no. Ed è anche un servizio — nessuno
vuole scoprire di aver lasciato la diretta accesa tutta la notte.

**La riga sull'account.** Il pannello dice, una volta e chiaramente, che se il browser blocca i
cookie di terze parti il lurk dal sito vale **per il canale ma non per i propri punti e streak**,
e offre il collegamento a Twitch — `#apri-twitch` esiste già nel piede del monitor. Per un
abbonato che ci tiene alla sua streak, la risposta onesta è «guarda su twitch.tv», e il sito
deve dirla anche se significa mandare via la persona. Il testo sta in `contenuti.json`, non nel
codice.

---

## 6. Strada B — login Twitch e messaggio a nome dell'utente

### 6.1 Le scelte comuni

**Flusso: implicit grant.** Il Device Code Flow ha una UX inaccettabile per un bottone «fai
lurk», e il suo refresh token in caso di furto è **peggio**, non meglio: è rinnovabile per
sempre.

**Token in `sessionStorage`, non `localStorage`.** Muore alla chiusura della scheda. È meno
comodo ed è la scelta giusta: il caso d'uso dura esattamente quanto la scheda aperta, e non vale
la pena parcheggiare sul disco di uno spettatore un token da 60 giorni valido su tutto Twitch.
**Non si offre all'amministratore un interruttore «ricorda il login»**: sarebbe un campo che
peggiora la sicurezza altrui, spuntato da chi non sa cosa comporta.

Obblighi non negoziabili: `state` casuale contro il login forzato; pulizia immediata del
fragment con `history.replaceState`; **validazione oraria** che non si fida di `setInterval` ma
confronta l'orologio a ogni ritorno in primo piano; e un pulsante **«Scollega e revoca»** che
chiama davvero l'endpoint di revoca — buttare il token senza revocarlo lo lascia valido su un
server di Twitch per sessanta giorni.

**Un 200 non significa messaggio arrivato.** La risposta contiene `is_sent` e, se falso, un
`drop_reason`: modalità solo-follower, solo-abbonati, slow mode, duplicato, ban, verifica email
mancante. Vanno letti e tradotti in italiano, perché sono cose che il visitatore può risolvere.
Da sito statico **non si può sapere in anticipo** se il messaggio passerà: si prova e si dice
com'è andata.

**Nota di sicurezza che vale come prerequisito**: il sito oggi non ha nessuna Content-Security-
Policy, e con `mostraMessaggi` acceso stampa in pagina testo che arriva dalla chat. Introdurre
un token in una pagina senza CSP è una scelta, non una svista: o si fa la CSP, o si scrive nero
su bianco che si è deciso di non farla e perché.

### 6.2 B1 — un clic, un messaggio ✅ **in perimetro**

L'utente preme, parte **un** messaggio a suo nome. Nessun timer, nessuna ripetizione: un atto
umano, un messaggio. È indistinguibile dall'utente che scrive `!lurk` a mano, perché *è* lui che
lo scrive.

La frase di partenza è **«Hey! Lurko dal sito»**, e la formulazione va difesa così com'è:
**dichiara** il lurk invece di fingere presenza attiva. Le altre frasi dell'elenco
`config.lurk.frasi` devono restare sullo stesso registro — chi legge la chat deve capire che
quella persona sta guardando in silenzio, non che sta partecipando. Una frase come «Ci sono,
sono attivo!» rimetterebbe la funzione dalla parte sbagliata del §2.7, **con lo stesso codice
identico**: qui la differenza la fa il testo, non l'implementazione, e per questo il testo sta
in `contenuti.json` sotto il controllo dell'amministratore, con una riga di aiuto che lo spiega.

Due regole che lo tengono pulito: **la frase si mostra prima dell'invio** — l'utente deve vedere
cosa sta per dire a suo nome, non scoprirlo dopo — e **al ritorno dall'OAuth non parte niente in
automatico**: si chiede conferma. Un redirect non deve mai produrre un messaggio non voluto.
Più un freno di un invio al minuto.

### 6.3 B2 — invio periodico automatico ❌ **fuori perimetro**

Documentato perché era la richiesta iniziale, e perché serve sapere perché non si fa.

**Non ottiene l'obiettivo** (§1.3): scrivere in chat ogni dieci minuti non rimette nessuno nel
conteggio spettatori.

E c'è una contraddizione che chiude la questione da sola. Fra le salvaguardie minime ci sarebbe
«fermarsi quando la scheda è nascosta», obbligatoria per non spammare a vuoto. Ma **se la scheda
deve restare visibile, allora il video sta girando e quella persona era già contata**. B2 non
aggiunge nulla che A non faccia meglio: nell'unico scenario in cui sarebbe accettabile farlo
girare, è inutile.

Vincoli tecnici, se mai si volesse riprendere il discorso: la scheda deve restare aperta; i
timer in background vengono rallentati a uno al minuto e poi congelati, quindi un intervallo di
15 minuti verrebbe eseguito **in ritardo, male, o mai**; in standby non parte niente. Nessun
service worker rimedia — il background sync richiede una PWA installata, è solo Chromium, non
garantisce cadenze, e metterci dentro il token sarebbe peggio.

E resta il §2: viola le Community Guidelines e il Developer Services Agreement, e chi paga per
primo sono gli spettatori.

---

## 7. Confronto

| | A — sessione video | B1 — un clic | B2 — automatico |
|---|---|---|---|
| **In perimetro** | **sì** | **sì** | **no** |
| **Ottiene l'obiettivo del §1** | **sì**, è l'unico | no (vale il sociale) | **no** |
| **Regolamento** | nessun problema | lecito | **viola CG e DSA** |
| **Rischio per gli spettatori** | nessuno | basso (token) | ban della chat |
| **Rischio per il canale** | nessuno | basso | cap del CCV, monetizzazione |
| **Serve login** | **no** | sì | sì |
| **Serve un token pericoloso** | **no** | sì | sì |
| **Funziona su mobile** | no, e lo dice | sì | no |
| **Funziona a scheda chiusa** | no | — | no |
| **Costo** | medio | basso | medio |
| **Prerequisito CSP** | no | consigliato | sì |

---

## 8. Conclusione

Dato l'obiettivo — **non perdere spettatori veri che vanno in lurk** — la risposta è la
**Strada A**. Non è una scelta di ripiego fra tre opzioni: è l'unica che agisce sul meccanismo
che causa il problema. Il conteggio dipende dalla sessione video, la sessione muore per colpa
del browser, e A la sorveglia e la rimette in piedi. Le altre due lavorano su un canale — la
chat — che nel conteggio non entra.

**A non ha bisogno del login**: funziona senza OAuth, senza token, senza Client ID. Va costruita
per prima e da sola, perché è quella che risolve il problema, e perché tenerla indipendente
significa che resta in piedi anche se la parte con il login viene spenta o rimandata.

### Il messaggio di lurk

Dal sito parte anche **un messaggio in chat del tipo «Hey! Lurko dal sito»**, con il login su
Twitch. È la **B1** del §6.2, ed è la variante giusta delle due per tre ragioni:

1. **Un clic, un messaggio.** L'autore è davvero l'utente, non uno scheduler. È indistinguibile
   da un `!lurk` scritto a mano, e non c'è nessuna clausola che lo vieti.
2. **La frase è onesta.** «Lurko dal sito» *dichiara* il lurk; «Ci sono, ti seguo» fingerebbe
   presenza attiva. È esattamente la differenza fra segnalare l'assenza e mascherarla.
3. **Nessuna ripetizione**, quindi niente spam, niente filtro anti-duplicato da aggirare, niente
   moltiplicazione per il numero di utenti.

Cosa dà e cosa non dà: **non aggiunge un solo spettatore al conteggio** (§1.3). Serve al valore
sociale — far sapere allo streamer e alla chat che quella persona c'è e sta guardando dal sito —
che è poi il motivo per cui il `!lurk` esiste da sempre. È un buon motivo; semplicemente non è
quello del §1.

**Il prezzo da mettere in conto è il token**, ed è reale: `user:write:chat` consente di scrivere
in **qualsiasi** canale di Twitch a nome di chi si è collegato (§3.4). Le contromisure del §6.1
non sono facoltative, e la **decisione sulla CSP** va presa: o si scrive, o si mette per iscritto
perché si è scelto di non farla.

**Il limite da accettare in partenza**: A aiuta solo chi guarda **da questo sito**, e per un
abbonato che tiene alla propria streak la strada più sicura resta twitch.tv (§1.8). Il valore
reale è per quella manciata di persone che il sito ce l'hanno aperto — e la funzione va
dimensionata su quel numero, non sul totale degli spettatori.

---

## 9. Se si va avanti: cosa serve prima di scrivere codice

1. **Un `CONTRATTO-3.md`.** I file previsti (`js/lurk.js`, `css/lurk.css`,
   `modelli/parziali/lurk.html`) non appartengono a nessuno nei due contratti esistenti. La
   tabella di proprietà va scritta **prima** di ogni riga di codice.
2. **Le chiavi nuove**: un gruppo `lurk` in `contenuti/schema.js` fra `diretta` e `pollo`, e il
   ramo `config.lurk` in `contenuti.json` — **nello stesso commit**, perché il controllo di
   copertura si ferma se una chiave non è descritta. Solo tipi già esistenti (`interruttore`,
   `testo`, `url`, `numero`, `elencoTesti`, `ricco`): **`pannello/` non si tocca affatto**, si
   costruisce da sé.
3. **Regola dei tipi**: `ricco` solo per i testi stampati dal modello; tutti i testi di stato
   restano `testo`, perché li scrive il JavaScript con `textContent` e l'HTML verrebbe stampato
   letterale.
4. **`server/lib/costruisci.js`**: una `lurkDi()` modellata su `polloDi()`, con le invarianti
   imposte in generazione — niente Client ID o niente frasi, niente invio.
   `server/modelli/dati.js.tpl` **non si tocca**: cambia solo chi riempie l'oggetto.
5. **`js/player.js`** guadagna `PAUSE`, i listener di rete persistenti e tre metodi nuovi
   (`suVideo`, `diagnostica`, `riparti`), con i freni e il tetto **dentro** il player.
   `suStato` e `suChat` restano invariate, firme comprese.
6. **Ordine di caricamento**: `js/lurk.js` prima di `js/pollo.js`, perché il pollo si iscrive al
   lurk e il lurk si iscrive al player.
7. **Le chiavi del gruppo `lurk`**: `attivo`, `tieniSchermoAcceso`, `oreMax` (il controllo di
   presenza del §5.6) per la parte A; `messaggioAttivo`, `clientId`, `urlRitorno` e `frasi` per
   il messaggio di lurk. **Niente `messaggioAutomatico`, niente `minutiFraMessaggi`, niente
   `messaggiMax`**: sono le chiavi di B2, che resta fuori, e un campo che non esiste è un campo
   che nessuno accenderà per sbaglio fra un anno.
8. **`clientId` vuoto di partenza.** L'invariante in `costruisci.js` spegne il messaggio finché
   non c'è un Client ID e almeno una frase: così il sito pubblicato non chiede login a nessuno
   finché non è stata registrata l'app. La registrazione richiede 2FA sull'account Twitch e un
   `redirect_uri` che combaci **carattere per carattere**; in locale va registrato anche
   `http://localhost:4173`.
9. **La decisione sulla CSP va presa prima di scrivere `js/lurk.js`**, non dopo. Se si fa, serve
   `frame-src` per `player.twitch.tv` e `www.twitch.tv`, `script-src` per `embed.twitch.tv`,
   `style-src`/`font-src` per Google Fonts, `connect-src` per `api.twitch.tv`, `id.twitch.tv` e
   `wss://irc-ws.chat.twitch.tv`. Va in `modelli/parziali/testa.html`, che è dell'integratore, e
   non è un lavoro gratis: va contato, non scoperto a metà strada.

### Punti incerti, da collaudare e non da dare per buoni

- `setChannel()` sullo stesso canale potrebbe essere un no-op: se lo è, ogni recupero non banale
  diventa una ricostruzione, e il rapporto costo/beneficio di A peggiora parecchio.
- La semantica di `getCurrentTime()` su una diretta non è documentata: il rilevatore dello stallo
  deve **autoescludersi** se il dato non arriva, mai dedurre «fermo» dall'assenza di un valore.
- Che `PAUSE` arrivi anche quando è il browser a mettere in pausa è probabile, non promesso.
- La latenza dei `minute-watched` (~60 s) impedisce di promettere «zero buchi».
- Il giudizio sulla conformità dell'embed è di Twitch e può cambiare, e la sanzione ricadrebbe
  sul canale.

### Ordine dei lavori

**Primo tempo — la sessione viva (A), senza login.**
`CONTRATTO-3` → schema e contenuti → `costruisci.js` → `player.js` (**collaudare qui, prima di
proseguire**: se `setChannel()` e `getCurrentTime()` non rispondono come sperato, il disegno del
recupero va rivisto prima di costruirci sopra) → `lurk.html` + `lurk.css` + `lurk.js` → la riga
in `diretta.html` e l'integrazione → il pollo → **una serata di diretta vera come collaudo, con
il canale acceso**.

**Secondo tempo — il messaggio di lurk (B1).**
Decisione sulla CSP → registrazione dell'app su Twitch e Client ID nel pannello → il login
(`state`, ritorno, pulizia del fragment, validazione, «Scollega e revoca») → l'invio con
anteprima della frase e conferma → lettura di `is_sent` e traduzione dei `drop_reason` in
italiano → prova in chat vera, a canale acceso, con un account che non sia quello dello
streamer.

**Poi** documentazione (`README.md`, `docs/PANNELLO.md`) e collaudo automatico in
`server/autotest.js`.

Tenere i due tempi separati non è burocrazia: A è la parte che risolve il problema e non ha
controindicazioni, B1 è la parte che porta un token in pagina. Se il secondo tempo si complica —
la CSP, la registrazione dell'app, un `redirect_uri` che non combacia — il primo è già spedito e
funzionante.

Il collaudo sul campo non è una formalità finale: è l'unico modo di sapere se A serve davvero o
se il browser, su una macchina normale, non stacca mai la sessione. Se non stacca mai, la cosa
giusta da fare è **non spedire quella parte** e tenere solo il messaggio di lurk.

---

## Fonti

**Conteggio e presenza** — Twitch Help, *Understanding Viewer Count vs. Users in Chat* ·
Twitch Dev, *Embedding Video and Clips* · forum dev, *Do embed views count towards partnership*
(2020) e *Update Regarding Twitch Video Embed Autoplay Functionality* (20 ottobre 2023) ·
Twitch Blog, *Channel Points* (2019) e *Shared Viewership* (2024) · Kotaku sul buco degli embed
(2019) · Fortune sugli embed che gonfiano il CCV (2023) · TwitchDropsMiner e
Twitch-Channel-Points-Miner-v2 per il comportamento di `minute-watched` e l'assenza di
rilevamento AFK.

**Regolamento** — Twitch *Community Guidelines* (sezione Spam, Scams, and Other Malicious
Conduct) · *Terms of Service* (Prohibited Conduct) · *Developer Services Agreement* ·
*Monetized Streamer Agreement* · forum dev, *Repeated Bot Suspensions Despite Following
Guidelines* e *Posting in chat as viewer when using a Twitch extension* · Twitch Support su X
(28 luglio 2025) sul giro di pulizia anti-viewbot · Engadget e Tubefilter (7-8 maggio 2026)
sulle nuove sanzioni annunciate da Dan Clancy · Twitch contro i venditori di bot (2016) e contro
gli hate raider (2021).

**Tecnica** — Twitch Dev: *Getting OAuth Access Tokens*, *Refreshing Access Tokens*,
*Validating Tokens*, *Revoking Tokens*, *Scopes*, *Register Your App*, *Send Chat Message*,
*Chat & Chatbots*, *IRC Concepts*, *API Concepts* (rate limit) · forum dev: Device Code Flow
(2023), public vs confidential client (2025), assenza di PKCE (2024), durata dei token,
decommissionamento dei WebSocket non sicuri (2025) · verifica diretta dei CORS su
`api.twitch.tv` e `id.twitch.tv` effettuata il 6 settembre 2026.
