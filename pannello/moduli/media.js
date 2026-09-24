import { api, ErroreApi } from './api.js';
import { el, bottone, svuota, formattaPeso, formattaData, copiaTesto, urlRisorsa } from './dom.js';
import { avviso, avvisoAttesa, apriDialogo, conferma } from './avvisi.js';

const ESTENSIONI = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
const PESO_MASSIMO = 4 * 1024 * 1024;

const SOGLIA_PESO = 350 * 1024;

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

async function formatoDaiByte(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (da, a) => String.fromCharCode(...b.slice(da, a));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  return '';
}

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

export async function preparaImmagine(file, { latoMax = 2400, qualita = 0.82 } = {}) {
  if (!file) return file;
  const dalNome = estensioneDi(file.name);

  if (!RIDUCIBILI[dalNome]) return file;

  const formato = await formatoDaiByte(file);
  const nonSiApre = () => new Error('«' + file.name + '» non si apre come immagine: il file è rovinato o non è davvero un '
    + (dalNome === 'jpeg' ? 'JPG' : dalNome.toUpperCase()) + '.');

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

    const nomeGiusto = formato === (dalNome === 'jpeg' ? 'jpg' : dalNome) ? file.name : nomeCon(file.name, formato);
    const originale = nomeGiusto === file.name
      ? file
      : new File([file], nomeGiusto, { type: RIDUCIBILI[formato], lastModified: file.lastModified });

    if (file.size <= SOGLIA_PESO && latoLungo <= latoMax) return originale;

    const scala = Math.min(1, latoMax / latoLungo);
    const larghezza = Math.max(1, Math.round(bitmap.width * scala));
    const altezza = Math.max(1, Math.round(bitmap.height * scala));

    const ridotta = scala < 1
      ? await createImageBitmap(file, { resizeWidth: larghezza, resizeHeight: altezza, resizeQuality: 'high' })
      : bitmap;
    const tela = document.createElement('canvas');
    tela.width = larghezza;
    tela.height = altezza;
    tela.getContext('2d').drawImage(ridotta, 0, 0);
    if (ridotta !== bitmap) ridotta.close();

    const webp = await inBlob(tela, 'image/webp', qualita);
    tela.width = 0;

    if (!webp || webp.type !== 'image/webp' || webp.size >= originale.size) return originale;
    return new File([webp], nomeCon(file.name, 'webp'), { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function percorsoDellaRisposta(risposta) {
  const salvata = (risposta && (risposta.file || risposta.media || risposta.voce)) || null;
  return salvata ? String(salvata.percorso || salvata.url || salvata.path || '').replace(/^\/+/, '') : '';
}

export async function caricaImmagine(file) {
  if (!file) return null;
  if (!estensioneOk(file.name)) {
    avviso('«' + file.name + '» non è un formato accettato. Servono PNG, JPG, WEBP, GIF o SVG.',
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

    if (!percorso) percorso = (await api.media()).find((m) => m.nome === pronto.name)?.percorso || '';
    const nome = percorso ? percorso.split('/').pop() : pronto.name;
    inCorso.riuscito('Caricata: ' + nome + (ridotta ? ' · ' + formattaPeso(file.size) + ' → ' + formattaPeso(pronto.size) + ' in WebP' : ''));
    return percorso || null;
  } catch (errore) {
    inCorso.fallito(messaggioDi(errore, 'Caricamento non riuscito.'), 'Non ho caricato ' + file.name);
    return null;
  }
}

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
    el('p', { classe: 'zona__limiti', testo: 'PNG, JPG, WEBP, GIF, SVG · massimo 4 MB per file' }),
    scelta
  ]);

  const nodo = el('div', { classe: 'lavoro__corpo' }, [zona, stato, griglia]);

  async function carica(elencoFile) {
    const file = Array.from(elencoFile || []);
    if (!file.length) return;

    for (const f of file) {
      const percorso = await caricaImmagine(f);
      if (!percorso) continue;
      await aggiorna();

      if (modalita === 'scelta' && onScegli) { onScegli(percorso); return; }
    }
  }

  scelta.addEventListener('change', () => { carica(scelta.files); scelta.value = ''; });

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
