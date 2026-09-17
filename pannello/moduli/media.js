/* =====================================================================
   media.js — la libreria delle immagini.

   Lo stesso pezzo di interfaccia serve due volte: come sezione del
   pannello (si carica, si copia il percorso, si elimina) e come finestra
   di scelta quando un campo di tipo «immagine» chiede una foto. Cambia la
   modalita', non il codice.

   Il server rifiuta la cancellazione di un file ancora citato nei
   contenuti: quel rifiuto (409) non e' un guasto ma una risposta, e va
   spiegato con parole, non con un codice.

   Ogni immagine che parte da qui passa prima da preparaImmagine()
   (CONTRATTO-5 §7.2): una foto da 5 MB presa dal telefono o un PNG
   esportato a 4K diventano un WebP di qualche centinaio di kB prima di
   lasciare il browser. Il sito poi la scarica a ogni visita, e il pannello
   la carica in un attimo invece di sbattere contro il limite dei 4 MB.
   ===================================================================== */

import { api, ErroreApi } from './api.js';
import { el, bottone, svuota, formattaPeso, formattaData, copiaTesto, urlRisorsa } from './dom.js';
import { avviso, avvisoAttesa, apriDialogo, conferma } from './avvisi.js';

/* Formati e peso del contratto §8. Il controllo qui davanti non sostituisce
   quello del server: evita solo di spedire 12 MB per sentirsi dire di no.
   Il peso si guarda DOPO la preparazione: un PNG da 9 MB che diventa un
   WebP da 600 kB è un caricamento buono, non un file da rifiutare. */
const ESTENSIONI = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const PESO_MASSIMO = 4 * 1024 * 1024;

/* Sotto questa soglia (e dentro latoMax) un'immagine si lascia com'è:
   ricodificare un file già leggero toglie qualità per risparmiare poco. */
const SOGLIA_PESO = 350 * 1024;

/* I formati che il browser sa ridurre e riscrivere. SVG è testo e si
   ingrandisce senza perdere niente; una GIF può essere animata e ridotta
   a un fotogramma perderebbe il movimento: nessuno dei due si tocca. */
const RIDUCIBILI = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function estensioneDi(nome) {
  const testo = String(nome || '').toLowerCase();
  const punto = testo.lastIndexOf('.');
  return punto > 0 ? testo.slice(punto + 1) : '';
}

function estensioneOk(nome) {
  return ESTENSIONI.includes(estensioneDi(nome));
}

function messaggioDi(errore, ripiego) {
  return errore instanceof ErroreApi ? errore.message : ripiego;
}

/* --- preparazione ---------------------------------------------------- */

/** Il formato vero dai primi byte, indipendente dal nome: 'png' | 'jpg' | 'webp' | 'gif' | ''. */
async function formatoDaiByte(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (da, a) => String.fromCharCode(...b.slice(da, a));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  return '';
}

/**
 * Vero se il file è un'animazione (PNG animato o WebP animato). Riscriverlo
 * da una tela ne terrebbe solo il primo fotogramma, quindi si lascia com'è.
 * Si leggono solo le intestazioni: nel PNG il pezzo acTL sta per regola
 * prima dei dati dell'immagine, nel WebP c'è un bit apposta in VP8X.
 */
async function animata(file, formato) {
  if (formato === 'webp') {
    const b = new Uint8Array(await file.slice(0, 21).arrayBuffer());
    return String.fromCharCode(...b.slice(12, 16)) === 'VP8X' && (b[20] & 0x02) !== 0;
  }
  if (formato !== 'png') return false;
  let posto = 8;
  for (let giri = 0; giri < 64 && posto + 8 <= file.size; giri++) {
    const testa = new DataView(await file.slice(posto, posto + 8).arrayBuffer());
    const tipo = String.fromCharCode(testa.getUint8(4), testa.getUint8(5), testa.getUint8(6), testa.getUint8(7));
    if (tipo === 'acTL') return true;
    if (tipo === 'IDAT' || tipo === 'IEND') return false;
    posto += 12 + testa.getUint32(0);
  }
  return false;
}

function nomeCon(nome, estensione) {
  const testo = String(nome || 'immagine');
  const punto = testo.lastIndexOf('.');
  return (punto > 0 ? testo.slice(0, punto) : testo) + '.' + estensione;
}

function inBlob(tela, tipo, qualita) {
  return new Promise((risolvi) => tela.toBlob(risolvi, tipo, qualita));
}

/**
 * Prepara un'immagine per il caricamento (CONTRATTO-5 §7.2).
 *
 * PNG, JPEG e WebP oltre i 350 kB, o con il lato lungo oltre `latoMax`,
 * si riducono (se serve) e si riscrivono in WebP nel browser. Se il WebP
 * non pesa meno dell'originale, resta l'originale. SVG, GIF, formati
 * sconosciuti e animazioni tornano indietro così come sono: il controllo
 * del formato lo fa chi carica, e l'ultima parola resta al server.
 *
 * @param {File} file
 * @param {{ latoMax?: number, qualita?: number }} opzioni
 * @returns {Promise<File>} il file da caricare: nuovo (nome.webp) oppure lo stesso
 * @throws {Error} con un messaggio già scritto per chi usa il pannello, se un
 *   PNG/JPEG/WebP non si apre come immagine (file rovinato, o con il nome sbagliato)
 */
export async function preparaImmagine(file, { latoMax = 2400, qualita = 0.82 } = {}) {
  if (!file) return file;
  const dalNome = estensioneDi(file.name);
  // Solo i raster che il browser sa riscrivere; tutto il resto (svg, gif, …) non si tocca.
  if (!RIDUCIBILI[dalNome]) return file;

  const formato = await formatoDaiByte(file);
  const nonSiApre = () => new Error('«' + file.name + '» non si apre come immagine: il file è rovinato o non è davvero un '
    + (dalNome === 'jpeg' ? 'JPG' : dalNome.toUpperCase()) + '.');
  // Dal nome un raster, dentro no (un testo rinominato, una GIF chiamata .png):
  // meglio dirlo qui con parole chiare che farselo rifiutare dal server.
  if (!RIDUCIBILI[formato]) throw nonSiApre();
  if (await animata(file, formato)) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw nonSiApre();
  }

  try {
    const latoLungo = Math.max(bitmap.width, bitmap.height);
    // Il contenuto conta più del nome: un JPEG salvato come .png il server lo
    // rifiuterebbe con un errore poco chiaro. Se non c'è niente da ridurre si
    // corregge solo l'estensione e il file parte com'è.
    const nomeGiusto = formato === (dalNome === 'jpeg' ? 'jpg' : dalNome) ? file.name : nomeCon(file.name, formato);
    const originale = nomeGiusto === file.name
      ? file
      : new File([file], nomeGiusto, { type: RIDUCIBILI[formato], lastModified: file.lastModified });

    if (file.size <= SOGLIA_PESO && latoLungo <= latoMax) return originale;

    const scala = Math.min(1, latoMax / latoLungo);
    const larghezza = Math.max(1, Math.round(bitmap.width * scala));
    const altezza = Math.max(1, Math.round(bitmap.height * scala));

    // La riduzione la fa createImageBitmap con il filtro migliore del browser:
    // disegnare in piccolo su una tela userebbe il filtro veloce e seghettato.
    const ridotta = scala < 1
      ? await createImageBitmap(file, { resizeWidth: larghezza, resizeHeight: altezza, resizeQuality: 'high' })
      : bitmap;
    const tela = document.createElement('canvas');
    tela.width = larghezza;
    tela.height = altezza;
    tela.getContext('2d').drawImage(ridotta, 0, 0);
    if (ridotta !== bitmap) ridotta.close();

    const webp = await inBlob(tela, 'image/webp', qualita);
    tela.width = 0; // libera subito la memoria della tela: una foto da 24 MP ne occupa quasi 100 MB
    // Un browser che non sa scrivere WebP restituisce un PNG: in quel caso, o se
    // il WebP non conviene, parte l'originale.
    if (!webp || webp.type !== 'image/webp' || webp.size >= originale.size) return originale;
    return new File([webp], nomeCon(file.name, 'webp'), { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

/** Il percorso restituito dal server dopo un caricamento, o '' se non c'è. */
function percorsoDellaRisposta(risposta) {
  const salvata = (risposta && (risposta.file || risposta.media || risposta.voce)) || null;
  return salvata ? String(salvata.percorso || salvata.url || salvata.path || '').replace(/^\/+/, '') : '';
}

/**
 * Prepara e carica un'immagine nella libreria (POST /api/media).
 * Gli errori li mostra lei con un avviso, chi chiama non deve farlo.
 *
 * @param {File} file
 * @returns {Promise<string|null>} il percorso 'contenuti/media/…', o null se non è andata
 */
export async function caricaImmagine(file) {
  if (!file) return null;
  if (!estensioneOk(file.name)) {
    avviso('«' + file.name + '» non è un formato accettato. Servono PNG, JPG, WEBP o SVG.',
      { tipo: 'errore', titolo: 'Formato non valido' });
    return null;
  }

  const inCorso = avvisoAttesa('Preparo ' + file.name + '…');
  let pronto;
  try {
    pronto = await preparaImmagine(file);
  } catch (errore) {
    inCorso.fallito(errore && errore.message ? errore.message : 'Non riesco a leggere il file.', 'Non ho caricato ' + file.name);
    return null;
  }

  if (pronto.size > PESO_MASSIMO) {
    inCorso.fallito('«' + file.name + '» pesa ' + formattaPeso(pronto.size)
      + (pronto === file ? '' : ' anche dopo la riduzione') + ': il massimo è 4 MB.', 'File troppo grande');
    return null;
  }

  const ridotta = pronto !== file && pronto.type === 'image/webp';
  inCorso.aggiorna('Sto caricando ' + pronto.name + (ridotta ? ' (' + formattaPeso(file.size) + ' → ' + formattaPeso(pronto.size) + ')' : '') + '…');
  try {
    const risposta = await api.caricaMedia(pronto);
    let percorso = percorsoDellaRisposta(risposta);
    // Un server che non rimanda il percorso: lo si cerca nell'elenco per nome.
    if (!percorso) percorso = (await api.media()).find((m) => m.nome === pronto.name)?.percorso || '';
    const nome = percorso ? percorso.split('/').pop() : pronto.name;
    inCorso.riuscito('Caricata: ' + nome + (ridotta ? ' · ' + formattaPeso(file.size) + ' → ' + formattaPeso(pronto.size) + ' in WebP' : ''));
    return percorso || null;
  } catch (errore) {
    inCorso.fallito(messaggioDi(errore, 'Caricamento non riuscito.'), 'Non ho caricato ' + file.name);
    return null;
  }
}

/**
 * Costruisce la libreria.
 *
 * @param {object} opzioni
 *   - modalita: 'gestione' | 'scelta'
 *   - onScegli(percorso): chiamata in modalita' scelta
 *   - usoDi(percorso): elenco leggibile dei campi che usano quel file
 *   - valoreCorrente: percorso gia' impostato nel campo che ha aperto la scelta
 */
export function creaLibreria({ modalita = 'gestione', onScegli = null, usoDi = () => [], valoreCorrente = '' } = {}) {
  const griglia = el('div', { classe: 'media' });
  const stato = el('p', { classe: 'campo__aiuto', testo: 'Carico l\'elenco…' });
  const scelta = el('input', {
    type: 'file', hidden: true, multiple: true,
    accept: ESTENSIONI.map((e) => '.' + e).join(',')
  });

  const zona = el('div', { classe: 'zona' }, [
    el('p', { testo: 'Trascina qui le immagini, oppure scegli un file dal computer.' }),
    bottone({ testo: 'Scegli un file', ico: 'immagine', classe: 'btn btn--primario', su: () => scelta.click() }),
    el('p', { classe: 'zona__limiti', testo: 'PNG, JPG, WEBP, SVG · massimo 4 MB per file' }),
    scelta
  ]);

  const nodo = el('div', { classe: 'lavoro__corpo' }, [zona, stato, griglia]);

  /* --- caricamento --------------------------------------------------- */

  async function carica(elencoFile) {
    const file = Array.from(elencoFile || []);
    if (!file.length) return;

    // Uno alla volta: più foto grandi ridotte insieme terrebbero in memoria
    // tutte le loro tele nello stesso momento.
    for (const f of file) {
      const percorso = await caricaImmagine(f);
      if (!percorso) continue;
      await aggiorna();

      // Chi carica dentro la finestra di scelta vuole quella foto lì per
      // lì: gliela si passa subito, senza fargliela ricercare a mano.
      if (modalita === 'scelta' && onScegli) { onScegli(percorso); return; }
    }
  }

  scelta.addEventListener('change', () => { carica(scelta.files); scelta.value = ''; });

  // Senza preventDefault su dragover il browser apre il file al posto nostro.
  for (const evento of ['dragenter', 'dragover']) {
    zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.add('is-sopra'); });
  }
  zona.addEventListener('dragleave', (e) => {
    if (zona.contains(e.relatedTarget)) return;
    zona.classList.remove('is-sopra');
  });
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('is-sopra');
    if (e.dataTransfer && e.dataTransfer.files) carica(e.dataTransfer.files);
  });

  /* --- eliminazione -------------------------------------------------- */

  async function elimina(file) {
    const usato = usoDi(file.percorso);

    const ok = await conferma({
      titolo: 'Elimino ' + file.nome + '?',
      testo: usato.length
        ? ['Questa immagine risulta usata nella bozza. Finché è collegata a un campo il server rifiuterà di cancellarla.']
        : ['Il file viene cancellato dal disco del server. Non si torna indietro.'],
      dettagli: usato.length
        ? el('div', { classe: 'dialogo__elenco' }, usato.map((u) => el('span', { testo: '· ' + u })))
        : null,
      conferma: 'Elimina il file',
      pericolo: true
    });
    if (!ok) return;

    const inCorso = avvisoAttesa('Sto eliminando ' + file.nome + '…');
    try {
      await api.eliminaMedia(file.nome);
      inCorso.riuscito('Eliminata: ' + file.nome);
      await aggiorna();
    } catch (errore) {
      inCorso.chiudi();
      if (errore instanceof ErroreApi && errore.stato === 409) {
        // Caso previsto dal contratto: il file e' ancora citato nei contenuti.
        await apriDialogo({
          titolo: 'Immagine ancora in uso',
          ico: 'attenzione',
          pericolo: true,
          contenuto: [
            el('p', { testo: errore.message }),
            el('p', { testo: 'Per eliminarla: apri il campo che la usa, scegli un\'altra immagine, salva, e riprova da qui.' }),
            usato.length ? el('div', { classe: 'dialogo__elenco' }, usato.map((u) => el('span', { testo: '· ' + u }))) : null
          ],
          bottoni: [{ testo: 'Ho capito', valore: null, primario: true }]
        });
      } else {
        avviso(messaggioDi(errore, 'Eliminazione non riuscita.'), { tipo: 'errore', titolo: 'Niente da fare' });
      }
    }
  }

  /* --- griglia ------------------------------------------------------- */

  function scheda(file) {
    const usato = usoDi(file.percorso);
    const scelto = String(valoreCorrente || '').replace(/^\/+/, '') === file.percorso;

    const figura = el('div', { classe: 'media__figura' }, [
      el('img', { src: urlRisorsa(file.percorso), alt: '', loading: 'lazy' })
    ]);
    const meta = [
      Number.isFinite(file.dimensione) ? formattaPeso(file.dimensione) : null,
      file.data ? formattaData(file.data) : null
    ].filter(Boolean).join(' · ');

    const info = el('div', { classe: 'media__info' }, [
      el('p', { classe: 'media__nome', testo: file.nome, title: file.percorso }),
      el('p', { classe: 'media__meta', testo: meta })
    ]);

    const card = el('div', { classe: 'media__scheda' + (scelto ? ' is-scelta' : '') });

    if (modalita === 'scelta') {
      card.append(el('button', {
        type: 'button', classe: 'media__scelta',
        'aria-label': 'Usa ' + file.nome + (scelto ? ' (già scelta)' : ''),
        su: { click: () => onScegli && onScegli(file.percorso) }
      }, [figura, info]));
      return card;
    }

    card.append(figura, info);
    if (usato.length) card.append(el('p', { classe: 'media__usata', testo: 'In uso: ' + usato.join(', ') }));
    card.append(el('div', { classe: 'media__azioni' }, [
      bottone({
        testo: 'Copia percorso', ico: 'copia', classe: 'btn btn--minimo',
        su: async () => {
          const fatto = await copiaTesto(file.percorso);
          avviso(fatto ? 'Percorso copiato: ' + file.percorso : 'Non sono riuscito a copiare. Il percorso è ' + file.percorso,
            { tipo: fatto ? 'ok' : 'info' });
        }
      }),
      bottone({ testo: 'Elimina', ico: 'cestino', classe: 'btn btn--minimo btn--pericolo', su: () => elimina(file) })
    ]));
    return card;
  }

  async function aggiorna() {
    stato.textContent = 'Carico l\'elenco…';
    try {
      const file = await api.media();
      svuota(griglia);
      stato.textContent = file.length
        ? (file.length === 1 ? '1 immagine nella libreria.' : file.length + ' immagini nella libreria.')
        : 'La libreria è vuota: carica la prima immagine qui sopra.';
      for (const f of file) griglia.append(scheda(f));
    } catch (errore) {
      svuota(griglia);
      stato.textContent = messaggioDi(errore, 'Non riesco a leggere l\'elenco delle immagini.');
    }
  }

  return { nodo, aggiorna };
}

/**
 * Finestra di scelta usata dai campi di tipo «immagine».
 * Torna il percorso scelto, oppure null se si chiude senza scegliere.
 */
export async function scegliImmagine({ usoDi = () => [], valoreCorrente = '' } = {}) {
  const risultato = await apriDialogo({
    titolo: 'Libreria immagini',
    ico: 'immagine',
    largo: true,
    contenuto: (chiudi) => {
      const libreria = creaLibreria({
        modalita: 'scelta',
        valoreCorrente,
        usoDi,
        onScegli: (percorso) => chiudi(percorso)
      });
      libreria.aggiorna();
      return [
        el('p', { testo: 'Scegli un\'immagine, oppure caricane una nuova trascinandola qui dentro.' }),
        libreria.nodo
      ];
    },
    bottoni: [{ testo: 'Annulla', valore: null }]
  });

  return typeof risultato === 'string' ? risultato : null;
}
