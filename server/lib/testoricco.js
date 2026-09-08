'use strict';
/* =====================================================================
   testoricco.js — il poco HTML che il committente puo scrivere nei testi
   (CONTRATTO-2 §6.1 e §7).

   Serve a una cosa sola: far scrivere grassetto, corsivo, un a capo e un
   link dal pannello, senza che un testo sbagliato — o incollato da Word,
   o scritto da qualcuno che ha rubato la password — possa diventare uno
   script nella pagina pubblicata.

   Perche un parser scritto a mano e non una manciata di espressioni
   regolari: una regola sola tipo /<script.*?>/ inciampa su
   <scr<script>ipt>, su <img src=x onerror=alert(1)>, sugli attributi
   senza virgolette, sui tag non chiusi e sulle entita usate per
   ricomporre un '<'. Quel modo di fare e' il classico errore da stored
   XSS. Qui il testo viene letto una volta sola, spezzato in pezzi
   (testo / apertura / chiusura / roba da buttare) e poi RICOSTRUITO da
   zero: in uscita finisce solo cio che questo file ha deciso di
   scrivere, carattere per carattere. Niente del sorgente arriva in
   pagina cosi com'e.

   Le tre funzioni pubbliche lavorano tutte sullo stesso passaggio di
   lettura, cosi quello che `problemi()` racconta e' esattamente quello
   che `sanifica()` ha fatto davvero.
   ===================================================================== */

/* ------------------------------------------------------------------ */
/* LA LISTA BIANCA                                                     */
/* ------------------------------------------------------------------ */

/**
 * Tag ammessi e, per ognuno, gli attributi ammessi. Tutto il resto viene
 * tolto: e' una lista bianca, non una lista nera. Una lista nera va
 * aggiornata a ogni tag nuovo del web; questa no.
 */
const TAG_AMMESSI = {
  b: [], strong: [], i: [], em: [], u: [], s: [],
  br: [], small: [], mark: [], sup: [], sub: [], code: [],
  abbr: ['title'],
  span: ['class'],
  a: ['href', 'title']
};
for (const nome of Object.keys(TAG_AMMESSI)) { Object.freeze(TAG_AMMESSI[nome]); }
Object.freeze(TAG_AMMESSI);

/** Non hanno contenuto: non entrano nella pila degli aperti. */
const VUOTI = new Set(['br']);

/** Le uniche classi che lo <span> puo portare (CONTRATTO-2 §7). */
const CLASSI_SPAN = ['evidenza', 'tenue', 'mono'];

/**
 * Tag di blocco: non sono ammessi, ma segnano un a capo vero. Sparisce il
 * tag e al suo posto resta un <br>, altrimenti tre paragrafi incollati da
 * un documento diventano una riga sola.
 *
 * L'elenco e' lo stesso di `pannello/moduli/ricco.js`, di proposito: chi
 * scrive nella modalita' «Codice HTML» deve vedere nell'editor la stessa
 * cosa che poi finisce in pagina. Se una delle due liste cambia, cambia
 * anche l'altra.
 */
const BLOCCHI = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'figure', 'figcaption'
]);

/**
 * Blocchi che un altro dello stesso nome chiude da soli: <p>uno<p>due non
 * ha nessuna chiusura scritta, ma sono due paragrafi anche per il browser.
 * Senza questa regola l'a capo fra i due si perderebbe.
 */
const RIPETIBILI = new Set(['p', 'li', 'tr']);

/**
 * Attributi che accettiamo in ingresso senza lamentarci ma che NON
 * copiamo: li ricalcoliamo noi. Serve a rendere `sanifica()` idempotente
 * (sanifica(sanifica(x)) === sanifica(x)) senza rimproverare a chi
 * scrive un target="_blank" che ci siamo messi da soli.
 */
const IGNORATI = { a: ['target', 'rel'] };

/**
 * Elementi il cui CONTENUTO va buttato insieme al tag. Per tutti gli
 * altri tag vietati il testo dentro resta (lo dice il contratto), ma qui
 * il "testo" non e' testo: e' codice. Ributtarlo fuori come testo non
 * sarebbe pericoloso da solo, ma basta che a valle qualcuno lo rimetta
 * in un contesto diverso perche torni a essere eseguibile. Si toglie.
 */
const CONTENUTO_DA_BUTTARE = new Set([
  'script', 'style', 'textarea', 'title', 'iframe', 'noscript', 'noembed',
  'noframes', 'xmp', 'template', 'plaintext', 'svg', 'math', 'object', 'embed'
]);

/** Oltre questo livello di annidamento i tag vengono tolti: nessun testo
 *  vero ne ha bisogno, e un input costruito apposta non deve poter far
 *  crescere l'uscita a dismisura. */
const MAX_PROFONDITA = 24;

/** Quanti problemi al massimo si raccontano: sotto un campo del pannello
 *  ottanta righe rosse non aiutano nessuno. */
const MAX_MESSAGGI = 8;

/* ------------------------------------------------------------------ */
/* CARATTERI, ENTITA, ESCAPE                                           */
/* ------------------------------------------------------------------ */

/**
 * Escape per HTML. Vale sia nel testo sia dentro un attributo, percio
 * anche le virgolette e l'apostrofo: e' quello che rende impossibile
 * uscire da un attributo con un valore che arriva da fuori.
 */
function proteggi(testo) {
  return String(testo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Caratteri di controllo, separatori di riga Unicode e BOM: invisibili,
 * inutili nel testo di un sito, e usati apposta per spezzare i controlli
 * ("java[tab]script:" e' javascript: per il browser). Fuori sempre.
 * Restano tabulazione, a capo e ritorno a capo.
 */
const RE_CONTROLLI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u2028\u2029\ufeff]/g;
function senzaControlli(testo) { return String(testo).replace(RE_CONTROLLI, ''); }

/** Le entita per nome che ha senso conoscere in un sito italiano. */
const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—',
  ndash: '–', bull: '•', middot: '·', deg: '°',
  euro: '€', copy: '©', reg: '®', trade: '™',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì',
  ograve: 'ò', ugrave: 'ù', times: '×', shy: '\u00ad'
};

const RE_RIFERIMENTO = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,30});/g;

/**
 * Da un riferimento numerico al carattere vero. I casi impossibili
 * (zero, surrogati, oltre il massimo Unicode) diventano il segnaposto
 * U+FFFD invece del testo originale: lasciare "&#60;" com'era vorrebbe
 * dire consegnare a valle un '<' pronto a essere ricomposto.
 */
function carattereDaCodice(numero) {
  if (!Number.isFinite(numero) || numero <= 0 || numero > 0x10ffff) { return '\ufffd'; }
  if (numero >= 0xd800 && numero <= 0xdfff) { return '\ufffd'; }
  try { return String.fromCodePoint(numero); } catch (e) { return '\ufffd'; }
}

/**
 * Scioglie le entita di un pezzo di TESTO gia separato dai tag.
 *
 * Il punto delicato: sciogliere e poi ri-proteggere e' l'unico modo per
 * essere idempotenti (&amp; resta &amp;, non diventa &amp;amp;) senza
 * aprire la porta al giro classico "scrivo &lt;script&gt; e qualcuno a
 * valle lo decodifica". Qui il testo sciolto NON viene mai riletto in
 * cerca di tag: diventa subito una stringa protetta. Quindi &lt;script&gt;
 * torna fuori come &lt;script&gt;, cioe' resta testo, per sempre.
 */
function decodifica(testo) {
  if (testo.indexOf('&') === -1) { return testo; }
  return testo.replace(RE_RIFERIMENTO, function (intero, corpo) {
    if (corpo.charAt(0) === '#') {
      const esa = corpo.charAt(1) === 'x' || corpo.charAt(1) === 'X';
      return carattereDaCodice(parseInt(esa ? corpo.slice(2) : corpo.slice(1), esa ? 16 : 10));
    }
    return Object.prototype.hasOwnProperty.call(ENTITA, corpo) ? ENTITA[corpo] : intero;
  });
}

/** Testo su una riga sola, senza spazi doppi: per gli attributi e per i
 *  messaggi d'errore. */
function unaRiga(testo) { return senzaControlli(testo).replace(/\s+/g, ' ').trim(); }

/** Un pezzo di valore da mostrare in un messaggio, senza allagare la riga. */
function accorcia(testo, quanti) {
  const pulito = unaRiga(String(testo));
  const limite = quanti || 48;
  return pulito.length > limite ? pulito.slice(0, limite - 1) + '…' : pulito;
}

/* ------------------------------------------------------------------ */
/* INDIRIZZI                                                           */
/* ------------------------------------------------------------------ */

/**
 * Decide se un href e' accettabile e se punta fuori dal sito.
 *
 * Il controllo si fa su una copia "nuda" del valore: entita sciolte,
 * caratteri di controllo e spazi tolti, tutto minuscolo. E' l'unico modo
 * onesto, perche il browser fa la stessa cosa prima di guardare il
 * protocollo: per lui "JaVa&#9;script:" e "java script:" sono
 * javascript:. Confrontare il valore cosi com'e' stato battuto vorrebbe
 * dire lasciar passare tutte queste scritture.
 */
function esaminaUrl(grezzo) {
  const deciso = senzaControlli(decodifica(String(grezzo))).trim();
  const nudo = deciso.replace(/\s+/g, '').toLowerCase();

  if (!nudo) { return { ok: false, motivo: 'vuoto' }; }
  // // e \\ ereditano il protocollo della pagina e portano su un altro
  // dominio: il contratto li vieta esplicitamente.
  if (/^[/\\][/\\]/.test(nudo) || nudo.charAt(0) === '\\') {
    return { ok: false, motivo: 'protocollo-ereditato', valore: deciso };
  }

  const trovato = /^([a-z][a-z0-9+.-]*):/.exec(nudo);
  if (!trovato) {
    // Nessun protocollo: percorso relativo o ancora interna. Va bene.
    return { ok: true, valore: deciso, esterno: false };
  }
  const protocollo = trovato[1];
  if (protocollo === 'http' || protocollo === 'https') {
    if (!/^https?:\/\/[^/]/.test(nudo)) { return { ok: false, motivo: 'incompleto', valore: deciso }; }
    return { ok: true, valore: deciso, esterno: true };
  }
  if (protocollo === 'mailto') {
    if (!/^mailto:[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(nudo)) {
      return { ok: false, motivo: 'mailto', valore: deciso };
    }
    return { ok: true, valore: deciso, esterno: false };
  }
  return { ok: false, motivo: 'protocollo', protocollo: protocollo, valore: deciso };
}

/* ------------------------------------------------------------------ */
/* IL LETTORE — da stringa a pezzi                                     */
/* ------------------------------------------------------------------ */

/* Espressioni "appiccicate" (flag y): non cercano in giro, leggono solo
   a partire dalla posizione che diamo noi. Sono lo strumento del lettore,
   non il lettore. */
const RE_NOME = /[a-z][a-z0-9:._-]*/y;      // sul testo gia minuscolo
const RE_ATTRIBUTO = /[^\s/>=]+/y;          // idem
const RE_VALORE_NUDO = /[^\s>]*/y;
const SPAZIO = /\s/;

/**
 * Minuscolo delle sole lettere ASCII. NON si usa toLowerCase(): su certi
 * caratteri (la I con il punto del turco, U+0130) restituisce due
 * caratteri al posto di uno, e la copia minuscola non sarebbe piu lunga
 * quanto l'originale. Il lettore usa le due stringhe con gli stessi
 * indici — una per i nomi, l'altra per i valori — e uno scarto di un
 * carattere gli farebbe tagliare i pezzi nel punto sbagliato.
 * I nomi dei tag e degli attributi sono ASCII: non si perde niente.
 */
function minuscoloAscii(testo) {
  return testo.replace(/[A-Z]/g, (lettera) => lettera.toLowerCase());
}

function leggiNome(basso, posizione) {
  RE_NOME.lastIndex = posizione;
  const trovato = RE_NOME.exec(basso);
  return trovato ? trovato[0] : '';
}

/**
 * Legge un tag di apertura a partire dal '<'. Non si arrende mai: tag
 * senza '>' finale, virgolette mai chiuse, attributi senza valore, '='
 * sparsi — tutto viene consumato fino a dove si puo e il resto e' testo.
 * Un lettore che lancia su input malformato e' un lettore che, in
 * produzione, o fa saltare la generazione o fa passare tutto.
 */
function leggiApertura(testo, basso, partenza, fine) {
  const nome = leggiNome(basso, partenza + 1);
  const attributi = [];
  let autochiuso = false;
  let i = partenza + 1 + nome.length;

  while (i < fine) {
    const carattere = testo.charAt(i);
    if (carattere === '>') { i++; break; }
    if (carattere === '/') {
      if (testo.charAt(i + 1) === '>') { autochiuso = true; i += 2; break; }
      i++; continue;                       // barra sparsa: la ignora anche il browser
    }
    if (SPAZIO.test(carattere)) { i++; continue; }

    RE_ATTRIBUTO.lastIndex = i;
    const trovato = RE_ATTRIBUTO.exec(basso);
    if (!trovato || !trovato[0]) { i++; continue; }   // '=' isolato o carattere strano
    const attributo = trovato[0];
    i += attributo.length;

    while (i < fine && SPAZIO.test(testo.charAt(i))) { i++; }
    let valore = null;
    if (testo.charAt(i) === '=') {
      i++;
      while (i < fine && SPAZIO.test(testo.charAt(i))) { i++; }
      const virgoletta = testo.charAt(i);
      if (virgoletta === '"' || virgoletta === "'") {
        const chiusura = testo.indexOf(virgoletta, i + 1);
        if (chiusura === -1) { valore = testo.slice(i + 1); i = fine; }
        else { valore = testo.slice(i + 1, chiusura); i = chiusura + 1; }
      } else {
        RE_VALORE_NUDO.lastIndex = i;
        const grezzo = RE_VALORE_NUDO.exec(testo);
        valore = grezzo ? grezzo[0] : '';
        i += valore.length;
      }
    }
    attributi.push({ nome: attributo, valore: valore });
  }

  return { nome: nome, attributi: attributi, autochiuso: autochiuso, fine: i };
}

/**
 * Spezza il sorgente in pezzi:
 *   { tipo: 'testo',     valore, solo? }   solo = era un '<' spaiato
 *   { tipo: 'apre',      nome, attributi, autochiuso, svuotato? }
 *   { tipo: 'chiude',    nome }
 *   { tipo: 'scartato',  cosa }            commento, cdata, dichiarazione
 * Nient'altro: qui non si decide niente, si legge soltanto.
 */
function analizza(sorgente) {
  const testo = sorgente;
  const basso = minuscoloAscii(testo);     // una volta sola: serve a nomi e ricerche
  const fine = testo.length;
  const pezzi = [];
  let i = 0;
  let inizio = 0;                          // primo carattere di testo non ancora emesso

  const chiudiTesto = (dove) => {
    if (dove > inizio) { pezzi.push({ tipo: 'testo', valore: testo.slice(inizio, dove) }); }
  };

  while (i < fine) {
    if (testo.charAt(i) !== '<') { i++; continue; }
    const dopo = testo.charAt(i + 1);

    // <!-- ... -->, <![CDATA[...]]>, <!doctype>, <?...?>
    if (dopo === '!' || dopo === '?') {
      chiudiTesto(i);
      let cosa;
      let dove;
      if (basso.startsWith('<!--', i)) {
        cosa = 'commento';
        const c = testo.indexOf('-->', i + 4);
        dove = c === -1 ? fine : c + 3;
      } else if (basso.startsWith('<![cdata[', i)) {
        cosa = 'cdata';
        const c = testo.indexOf(']]>', i + 9);
        dove = c === -1 ? fine : c + 3;
      } else {
        cosa = 'dichiarazione';
        const c = testo.indexOf('>', i + 1);
        dove = c === -1 ? fine : c + 1;
      }
      pezzi.push({ tipo: 'scartato', cosa: cosa });
      i = dove; inizio = i;
      continue;
    }

    if (dopo === '/') {
      const nome = leggiNome(basso, i + 2);
      chiudiTesto(i);
      const da = i + 2 + nome.length;
      const c = testo.indexOf('>', da);
      const dove = c === -1 ? fine : c + 1;
      // "</>" o "</ ..." non chiudono niente: si buttano come una
      // dichiarazione qualsiasi.
      pezzi.push(nome ? { tipo: 'chiude', nome: nome } : { tipo: 'scartato', cosa: 'dichiarazione' });
      i = dove; inizio = i;
      continue;
    }

    if (dopo && /[a-zA-Z]/.test(dopo)) {
      const apertura = leggiApertura(testo, basso, i, fine);
      chiudiTesto(i);
      const pezzo = {
        tipo: 'apre', nome: apertura.nome, attributi: apertura.attributi, autochiuso: apertura.autochiuso
      };
      pezzi.push(pezzo);
      i = apertura.fine; inizio = i;

      if (CONTENUTO_DA_BUTTARE.has(apertura.nome) && !apertura.autochiuso) {
        pezzo.svuotato = true;
        const chiave = '</' + apertura.nome;
        const c = basso.indexOf(chiave, i);
        if (c === -1) { i = fine; }
        else {
          const g = testo.indexOf('>', c + chiave.length);
          i = g === -1 ? fine : g + 1;
        }
        inizio = i;
      }
      continue;
    }

    // '<' spaiato ("3 < 5", "<3"): resta testo, uscira' come &lt;.
    chiudiTesto(i);
    pezzi.push({ tipo: 'testo', valore: '<', solo: true });
    i += 1; inizio = i;
  }

  chiudiTesto(fine);
  return pezzi;
}

/* ------------------------------------------------------------------ */
/* LE REGOLE — da pezzi a HTML sicuro                                  */
/* ------------------------------------------------------------------ */

function primoValore(attributi, nome) {
  // Con un attributo ripetuto vale il primo, come nei browser: cosi non
  // si puo nascondere il valore vero dietro un doppione.
  for (const attributo of attributi) {
    if (attributo.nome === nome) { return attributo.valore === null ? '' : attributo.valore; }
  }
  return null;
}

/**
 * Il cuore: prende i pezzi e ricostruisce l'HTML tenendo la pila dei tag
 * aperti. Restituisce anche l'elenco dei guai, perche `problemi()` deve
 * raccontare esattamente cio che e' successo qui e non una seconda
 * versione della verita.
 *
 * Nella pila finiscono anche i tag ammessi che abbiamo deciso di NON
 * scrivere (un <a> con un indirizzo vietato, per esempio), segnati con
 * `emesso: false`. Servono a far consumare la loro chiusura al posto
 * giusto: altrimenti quel </a> sembrerebbe orfano e chi legge si
 * ritroverebbe due errori per uno sbaglio solo, o peggio verrebbe chiuso
 * un tag di qualcun altro.
 */
function elabora(sorgente) {
  const pezzi = analizza(String(sorgente));
  const fuori = [];
  const guai = [];
  const pila = [];

  const segnala = (codice, dati) => {
    if (guai.length < 60) { guai.push(Object.assign({ codice: codice }, dati || {})); }
  };
  const ultimoAperto = (nome) => {
    for (let i = pila.length - 1; i >= 0; i--) { if (pila[i].nome === nome) { return i; } }
    return -1;
  };
  // Chiude tutto quello che sta sopra (e compreso) il livello indicato.
  const chiudiFinoA = (livello) => {
    while (pila.length > livello) {
      const aperto = pila.pop();
      if (aperto.emesso) { fuori.push('</' + aperto.nome + '>'); }
    }
  };

  /* L'a capo lasciato da un blocco non si scrive subito: si segna e si
     scrive solo se dopo arriva davvero qualcosa. Cosi non escono <br> in
     testa al testo, non ne escono in coda, e dieci blocchi vuoti di fila
     ne lasciano al massimo uno. */
  let separatore = false;
  let scrittoQualcosa = false;
  const versaSeparatore = () => {
    // Niente a capo se non c'e' ancora niente sopra, e niente se l'ultima
    // cosa scritta era gia' un <br>: sono le due condizioni del pannello.
    if (separatore && scrittoQualcosa && fuori[fuori.length - 1] !== '<br>') { fuori.push('<br>'); }
    separatore = false;
  };

  for (const pezzo of pezzi) {
    if (pezzo.tipo === 'testo') {
      if (pezzo.solo) { segnala('minore'); }
      const testo = proteggi(senzaControlli(decodifica(pezzo.valore)));
      if (!testo) { continue; }
      // Solo il testo che si vede fa scattare l'a capo in sospeso: uno
      // spazio o un ritorno a capo fra due blocchi non e' contenuto.
      if (/\S/.test(testo)) { versaSeparatore(); scrittoQualcosa = true; }
      fuori.push(testo);
      continue;
    }

    if (pezzo.tipo === 'scartato') { segnala(pezzo.cosa); continue; }

    if (pezzo.tipo === 'chiude') {
      const nome = pezzo.nome;
      if (BLOCCHI.has(nome)) {
        // Il blocco finisce: al suo posto un a capo. Vale anche per una
        // chiusura spaiata, che nel browser vale un blocco vuoto.
        const livello = ultimoAperto(nome);
        if (livello !== -1) { chiudiFinoA(livello); }
        separatore = true;
        continue;
      }
      // Se il tag non era ammesso non l'abbiamo mai aperto: la sua
      // chiusura non deve poter chiudere quella di qualcun altro.
      if (!Object.prototype.hasOwnProperty.call(TAG_AMMESSI, nome) || VUOTI.has(nome)) { continue; }
      const livello = ultimoAperto(nome);
      if (livello === -1) { segnala('chiusura-orfana', { nome: nome }); continue; }
      // Se sopra c'e' altro, quello che sta sopra viene chiuso qui: e' il
      // caso di <b><i></b>, che nessuno scrive apposta.
      const sopra = pila[pila.length - 1];
      if (livello !== pila.length - 1 && sopra.emesso && pila[livello].emesso) {
        segnala('incrocio', { nome: nome, dentro: sopra.nome });
      }
      chiudiFinoA(livello);
      continue;
    }

    /* --- apertura --- */
    const nome = pezzo.nome;
    if (!Object.prototype.hasOwnProperty.call(TAG_AMMESSI, nome)) {
      // Il tag sparisce, il testo che contiene resta (tranne per gli
      // elementi svuotati dal lettore, dove non era testo ma codice).
      if (pezzo.svuotato) { segnala('tag-svuotato', { nome: nome }); continue; }
      if (!BLOCCHI.has(nome)) { segnala('tag-vietato', { nome: nome }); continue; }

      segnala('blocco-vietato', { nome: nome });
      // Un <p> che ne trova un altro aperto lo chiude: e' quello che fa
      // il browser, ed e' l'unico modo di vedere l'a capo quando le
      // chiusure non sono scritte.
      if (RIPETIBILI.has(nome)) {
        const livello = ultimoAperto(nome);
        if (livello !== -1) { chiudiFinoA(livello); separatore = true; }
      }
      // Il segnaposto serve alla chiusura, che deve trovare il suo blocco
      // e non quello di qualcun altro.
      if (!pezzo.autochiuso) { pila.push({ nome: nome, emesso: false }); }
      continue;
    }
    // Il segnaposto per i tag ammessi ma non scritti: la loro chiusura
    // deve trovare qualcosa da chiudere.
    const rinuncia = (codice, dati) => {
      segnala(codice, dati);
      if (!VUOTI.has(nome)) { pila.push({ nome: nome, emesso: false }); }
    };
    if (pila.length >= MAX_PROFONDITA) { rinuncia('troppo-annidato', { nome: nome }); continue; }

    const ammessi = TAG_AMMESSI[nome];
    const ignorati = IGNORATI[nome] || [];
    const valori = new Map();
    for (const attributo of pezzo.attributi) {
      if (ammessi.indexOf(attributo.nome) !== -1) {
        if (!valori.has(attributo.nome)) { valori.set(attributo.nome, attributo.valore === null ? '' : attributo.valore); }
        continue;
      }
      if (ignorati.indexOf(attributo.nome) !== -1) { continue; }   // lo rimettiamo noi
      segnala(/^on/.test(attributo.nome) ? 'attributo-evento' : 'attributo-vietato',
        { tag: nome, attributo: attributo.nome });
    }

    const scritti = [];

    if (nome === 'a') {
      // Un <a> dentro un <a> non e' HTML valido e nel browser produce
      // due link sovrapposti: il piu interno se ne va.
      if (pila.some((aperto) => aperto.nome === 'a' && aperto.emesso)) { rinuncia('link-annidato'); continue; }
      const href = primoValore(pezzo.attributi, 'href');
      if (href === null) { rinuncia('link-senza-indirizzo'); continue; }
      const esito = esaminaUrl(href);
      if (!esito.ok) {
        // Via il link, resta il testo: chi legge la pagina non perde
        // niente di quello che c'era scritto.
        if (esito.motivo === 'vuoto') { rinuncia('link-senza-indirizzo'); }
        else { rinuncia('link-vietato', { motivo: esito.motivo, protocollo: esito.protocollo, valore: esito.valore }); }
        continue;
      }
      scritti.push('href="' + proteggi(esito.valore) + '"');
      if (esito.esterno) {
        // noopener toglie all'altra pagina il riferimento a questa
        // (window.opener), noreferrer non le dice da dove arriva.
        scritti.push('target="_blank"', 'rel="noopener noreferrer"');
      }
    }

    if (valori.has('title')) {
      const titolo = unaRiga(decodifica(valori.get('title')));
      if (titolo) { scritti.push('title="' + proteggi(titolo) + '"'); }
    }

    if (nome === 'span' && valori.has('class')) {
      const buone = [];
      for (const grezza of String(valori.get('class')).split(/\s+/)) {
        if (!grezza) { continue; }
        const classe = decodifica(grezza).toLowerCase();
        if (CLASSI_SPAN.indexOf(classe) === -1) { segnala('classe-vietata', { classe: accorcia(grezza, 24) }); continue; }
        if (buone.indexOf(classe) === -1) { buone.push(classe); }
      }
      // Le classi uscite di qui vengono da CLASSI_SPAN, non dal
      // sorgente: sono stringhe nostre, non c'e' niente da riscappare.
      if (buone.length) { scritti.push('class="' + buone.join(' ') + '"'); }
    }

    versaSeparatore();
    fuori.push('<' + nome + (scritti.length ? ' ' + scritti.join(' ') : '') + '>');
    scrittoQualcosa = true;
    // <b/> non e' un tag vuoto: il browser lo tratta come <b>, e noi
    // pure, altrimenti il testo dopo perderebbe il grassetto.
    if (!VUOTI.has(nome)) { pila.push({ nome: nome, emesso: true }); }
  }

  // Quello che e' rimasto aperto si chiude qui: un <b> dimenticato non
  // deve poter ingrassare tutto il resto della pagina.
  while (pila.length) {
    const aperto = pila.pop();
    if (!aperto.emesso) { continue; }       // gia raccontato quando l'abbiamo tolto
    segnala('non-chiuso', { nome: aperto.nome });
    fuori.push('</' + aperto.nome + '>');
  }

  return { html: fuori.join(''), guai: guai };
}

/* ------------------------------------------------------------------ */
/* I MESSAGGI PER CHI SCRIVE                                           */
/* ------------------------------------------------------------------ */

/* Consigli per i tag che chi non programma prova davvero a scrivere. */
const CONSIGLI = [
  { tag: ['ul', 'ol', 'table', 'td', 'th', 'dl', 'dt', 'dd', 'main', 'aside', 'nav'],
    testo: ': il testo sta già dentro il suo blocco, per andare a capo basta il pulsante «A capo».' },
  { tag: ['img', 'picture', 'video', 'audio', 'source', 'canvas', 'svg', 'math'],
    testo: ': le immagini e i video si scelgono nel campo apposta, non si incollano nel testo.' },
  { tag: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'link', 'meta', 'base', 'noscript', 'template'],
    testo: ': nei testi non si può mettere codice, ed è anche pericoloso.' },
  { tag: ['font', 'center', 'big', 'marquee', 'blink', 'strike', 'tt'],
    testo: ': è un tag vecchio; per far risaltare una parola usa il grassetto o «evidenza».' }
];

function consiglioPer(nome) {
  for (const voce of CONSIGLI) { if (voce.tag.indexOf(nome) !== -1) { return voce.testo; } }
  return ': si possono usare solo grassetto, corsivo, sottolineato, a capo, link e poco altro.';
}

/** Da guaio strutturato a frase italiana, senza il nome del campo davanti. */
function descrivi(guaio) {
  const nome = guaio.nome;
  switch (guaio.codice) {
    case 'tag-vietato':
      return 'il tag `<' + nome + '>` non è ammesso' + consiglioPer(nome) + ' Il testo dentro è rimasto.';
    case 'blocco-vietato':
      return 'il tag `<' + nome + '>` non è ammesso: il testo dentro è rimasto e al posto del tag c\'è un a capo.'
        + ' I testi stanno già dentro il loro blocco, qui basta il pulsante «A capo».';
    case 'tag-svuotato':
      return 'il tag `<' + nome + '>` e quello che conteneva sono stati tolti per intero: nei testi non ci va del codice.';
    case 'attributo-evento':
      return 'nel tag `<' + guaio.tag + '>` l\'attributo `' + guaio.attributo + '` farebbe partire del codice: è stato tolto.';
    case 'attributo-vietato':
      if (guaio.attributo === 'style') {
        return 'nel tag `<' + guaio.tag + '>` l\'attributo `style` non è ammesso: colori e caratteri si cambiano dal gruppo «Aspetto».';
      }
      return 'nel tag `<' + guaio.tag + '>` l\'attributo `' + guaio.attributo + '` non è ammesso ed è stato tolto.';
    case 'link-vietato':
      if (guaio.motivo === 'protocollo') {
        return 'il link «' + accorcia(guaio.valore) + '» usa «' + guaio.protocollo + ':», che non è ammesso: si scrivono solo indirizzi che iniziano con http://, https://, mailto: oppure un percorso interno. Il collegamento è stato tolto, il testo è rimasto.';
      }
      if (guaio.motivo === 'protocollo-ereditato') {
        return 'il link «' + accorcia(guaio.valore) + '» va scritto per intero, con https:// davanti. Il collegamento è stato tolto, il testo è rimasto.';
      }
      if (guaio.motivo === 'incompleto') {
        return 'il link «' + accorcia(guaio.valore) + '» è incompleto: dopo https:// ci vuole almeno il nome del sito. Il collegamento è stato tolto, il testo è rimasto.';
      }
      return 'nel link «' + accorcia(guaio.valore) + '» manca un indirizzo email valido dopo mailto:. Il collegamento è stato tolto, il testo è rimasto.';
    case 'link-senza-indirizzo':
      return 'c\'è un link senza indirizzo: è stato tolto e il testo è rimasto.';
    case 'link-annidato':
      return 'c\'è un link dentro un altro link: quello interno è stato tolto.';
    case 'classe-vietata':
      return 'lo stile «' + guaio.classe + '» non esiste: per lo `<span>` si possono usare solo evidenza, tenue e mono.';
    case 'non-chiuso':
      return 'il tag `<' + nome + '>` è rimasto aperto: è stato chiuso in fondo al testo, ma conviene chiuderlo dove serve.';
    case 'chiusura-orfana':
      return 'c\'è un `</' + nome + '>` che chiude un tag mai aperto: è stato tolto.';
    case 'incrocio':
      return 'chiudendo `<' + nome + '>` era ancora aperto `<' + guaio.dentro + '>`: i tag vanno chiusi in ordine, prima l\'ultimo che hai aperto.';
    case 'troppo-annidato':
      return 'i tag sono annidati troppo in profondità: oltre il livello ' + MAX_PROFONDITA + ' vengono tolti.';
    case 'commento':
      return 'i commenti HTML (`<!-- ... -->`) vengono tolti dal testo pubblicato.';
    case 'cdata':
    case 'dichiarazione':
      return 'c\'è un pezzo scritto come `<!...>` che non è HTML valido: è stato tolto.';
    case 'minore':
      return 'il segno `<` da solo viene mostrato così com\'è: se volevi scrivere un tag, ricontrolla come l\'hai scritto.';
    default:
      return 'c\'è qualcosa che non va nel testo formattato ed è stato tolto.';
  }
}

function frase(etichetta, corpo) {
  if (!etichetta) { return corpo.charAt(0).toUpperCase() + corpo.slice(1); }
  return 'Nel campo «' + etichetta + '» ' + corpo;
}

/* ------------------------------------------------------------------ */
/* API PUBBLICA                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ripulisce il testo tenendo solo i tag ammessi. NON LANCIA MAI: e' la
 * funzione che gira in generazione, e una generazione che si ferma per
 * un apostrofo storto in un testo non serve a nessuno. Nel caso
 * impossibile in cui qualcosa vada storto si ripiega sul testo battuto,
 * protetto per intero: si vedranno i tag scritti a mano, che e' brutto,
 * ma non c'e' modo di far uscire un tag vero.
 */
function sanifica(html) {
  if (html === null || html === undefined) { return ''; }
  if (typeof html !== 'string') { return proteggi(senzaControlli(String(html))); }
  try {
    return elabora(html).html;
  } catch (e) {
    return proteggi(senzaControlli(html));
  }
}

/**
 * L'elenco dei problemi trovati, in italiano, pensato per stare
 * attaccato al campo nel pannello. `etichetta` e' il nome del campo come
 * lo legge chi amministra.
 */
function problemi(html, opzioni) {
  const etichetta = opzioni && opzioni.etichetta ? String(opzioni.etichetta) : '';
  if (html === null || html === undefined || html === '') { return []; }
  if (typeof html !== 'string') { return [frase(etichetta, 'deve essere un testo.')]; }

  let guai;
  try { guai = elabora(html).guai; }
  catch (e) { return [frase(etichetta, 'c\'è qualcosa che non si riesce a leggere: prova a togliere la formattazione e a riscriverlo.')]; }

  const fuori = [];
  const visti = new Set();
  for (const guaio of guai) {
    const messaggio = frase(etichetta, descrivi(guaio));
    if (visti.has(messaggio)) { continue; }
    visti.add(messaggio);
    fuori.push(messaggio);
  }
  if (fuori.length <= MAX_MESSAGGI) { return fuori; }
  const restanti = fuori.length - MAX_MESSAGGI;
  const corti = fuori.slice(0, MAX_MESSAGGI);
  corti.push(frase(etichetta, 'ci sono altri ' + restanti + ' problemi dello stesso genere: conviene ripulire la formattazione e riscrivere.'));
  return corti;
}

/**
 * Il testo senza tag: serve a contare i caratteri visibili e a riempire
 * gli attributi. Gli spazi si compattano come fa il browser quando
 * disegna la pagina, cosi il conto e' quello che si legge davvero.
 * Torna testo NUDO, non protetto: chi lo stampa lo passa da {{ }}.
 */
function soloTesto(html) {
  if (html === null || html === undefined) { return ''; }
  if (typeof html !== 'string') { return unaRiga(String(html)); }
  try {
    const fuori = [];
    for (const pezzo of analizza(html)) {
      if (pezzo.tipo === 'testo') { fuori.push(decodifica(pezzo.valore)); }
      // Un a capo vale uno spazio: in un attributo non puo starci, e nel
      // conto dei caratteri e' giusto che pesi quanto una spaziatura.
      // Un blocco vale altrettanto, visto che diventa un <br>.
      else if (pezzo.nome === 'br' || BLOCCHI.has(pezzo.nome)) { fuori.push(' '); }
    }
    return unaRiga(fuori.join(''));
  } catch (e) {
    return unaRiga(html.replace(/<[^>]*>/g, ' '));
  }
}

module.exports = { sanifica, problemi, soloTesto, TAG_AMMESSI };
