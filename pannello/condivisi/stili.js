(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.SBStili = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function congela(valore) {
    if (valore && typeof valore === 'object' && !Object.isFrozen(valore)) {
      Object.freeze(valore);
      Object.keys(valore).forEach(function (k) { congela(valore[k]); });
    }
    return valore;
  }

  const DISPOSITIVI = congela(['computer', 'tablet', 'telefono']);

  const CASCATA = congela({
    tablet: '(max-width: 1099.98px)',
    telefono: '(max-width: 759.98px)'
  });

  const FASCE = congela({
    telefono: '(max-width: 759.98px)',
    tablet: '(min-width: 760px) and (max-width: 1099.98px)',
    computer: '(min-width: 1100px)'
  });

  const LARGHEZZE = congela({ telefono: 375, tablet: 900, computer: 1100 });

  const COLORI_TEMA = congela({
    viola: '--viola',
    violaCupo: '--viola-cupo',
    violaChiaro: '--viola-chiaro',
    ciano: '--ciano',
    magenta: '--magenta',
    live: '--live',
    ok: '--ok',
    allerta: '--allerta',
    fondo: '--fondo',
    testo: '--testo',
    testoMedio: '--testo-medio',
    testoTenue: '--testo-tenue'
  });

  const SEZIONI = congela(['binario', 'regia', 'diretta', 'sondaggio', 'settimana', 'chi', 'supporto', 'saluti', 'sponsor', 'piede']);
  const SEZIONI_ORDINABILI = congela(['regia', 'diretta', 'sondaggio', 'settimana', 'chi', 'supporto', 'saluti', 'sponsor']);

  const SEZIONE_BLOCCATA = 'regia';

  const RIQUADRI = congela(['regia', 'settimana', 'chi', 'supporto', 'saluti', 'sponsor', 'piede']);

  const PROTETTI = congela(['sezione:diretta', 'parte:monitor']);
  const VIETATE_AI_PROTETTI = congela(['nascosto', 'opacita', 'larghezzaMax']);
  const LATI_PROTETTI = congela({ margine: { min: 0 }, riempimento: { max: 40 } });

  const MAX_BERSAGLI = 1000;

  const MAX_BLOCCHI = 50;

  const MAX_VERTICALE = 2000;

  const TIPI_BERSAGLIO = {
    testo: /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/,
    immagine: /^config\.immagini\.[a-z][A-Za-z0-9]*$/,
    parte: /^[a-z][a-z0-9-]{0,40}$/,
    blocco: /^[a-z][a-z0-9-]{0,40}\.[a-z][a-z0-9-]{0,40}$/,
    sezione: null
  };
  const ATTRIBUTI = {
    testo: 'data-sb-testo',
    immagine: 'data-sb-immagine',
    parte: 'data-sb-parte',
    blocco: 'data-sb-blocco',
    sezione: 'data-sb-sezione'
  };

  const MAX_LUNGHEZZA_BERSAGLIO = 200;

  const TUTTI = ['testo', 'immagine', 'parte', 'blocco', 'sezione'];
  const SENZA_IMMAGINE = ['testo', 'parte', 'blocco', 'sezione'];
  const CONTENITORI = ['parte', 'blocco', 'sezione'];

  const PROPRIETA = congela([
    { nome: 'colore', css: 'color', tipo: 'colore', etichetta: 'Colore del testo', gruppo: 'colori', tipi: SENZA_IMMAGINE },
    { nome: 'sfondoColore', css: 'background-color', tipo: 'colore', etichetta: 'Colore di sfondo', gruppo: 'colori', tipi: TUTTI },
    { nome: 'bordoColore', css: 'border-color', tipo: 'colore', etichetta: 'Colore del bordo', gruppo: 'bordi', tipi: TUTTI },
    { nome: 'sfondoImmagine', css: 'background-image', tipo: 'immagine', etichetta: 'Immagine di sfondo', gruppo: 'sfondo', tipi: CONTENITORI },
    { nome: 'sfondoDimensione', css: 'background-size', tipo: 'scelta', etichetta: 'Grandezza dell\'immagine', gruppo: 'sfondo', tipi: CONTENITORI,
      valori: [
        { valore: 'copri', css: 'cover', etichetta: 'Copre tutto' },
        { valore: 'contieni', css: 'contain', etichetta: 'Intera' },
        { valore: 'originale', css: 'auto', etichetta: 'Grandezza originale' }
      ] },
    { nome: 'sfondoPosizione', css: 'background-position', tipo: 'scelta', etichetta: 'Posizione dell\'immagine', gruppo: 'sfondo', tipi: CONTENITORI,
      valori: [
        { valore: 'centro', css: 'center', etichetta: 'Al centro' },
        { valore: 'alto', css: 'top', etichetta: 'In alto' },
        { valore: 'basso', css: 'bottom', etichetta: 'In basso' },
        { valore: 'sinistra', css: 'left', etichetta: 'A sinistra' },
        { valore: 'destra', css: 'right', etichetta: 'A destra' }
      ] },
    { nome: 'font', css: 'font-family', tipo: 'font', etichetta: 'Font', gruppo: 'tipografia', tipi: SENZA_IMMAGINE },
    { nome: 'dimensione', css: 'font-size', tipo: 'misura', etichetta: 'Dimensione', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      unita: {
        px: { min: 8, max: 200, passo: 1, decimali: 2 },
        rem: { min: 0.5, max: 12, passo: 0.05, decimali: 3 }
      } },
    { nome: 'peso', css: 'font-weight', tipo: 'numero', etichetta: 'Spessore', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      min: 100, max: 900, passo: 100, decimali: 0, unita: '' },
    { nome: 'corsivo', css: 'font-style', tipo: 'interruttore', etichetta: 'Corsivo', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      valori: [
        { valore: true, css: 'italic', etichetta: 'Corsivo' },
        { valore: false, css: 'normal', etichetta: 'Dritto' }
      ] },
    { nome: 'maiuscole', css: 'text-transform', tipo: 'scelta', etichetta: 'Maiuscole', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      valori: [
        { valore: 'nessuna', css: 'none', etichetta: 'Come è scritto' },
        { valore: 'maiuscole', css: 'uppercase', etichetta: 'Tutto maiuscolo' },
        { valore: 'minuscole', css: 'lowercase', etichetta: 'Tutto minuscolo' },
        { valore: 'iniziali', css: 'capitalize', etichetta: 'Iniziali maiuscole' }
      ] },
    { nome: 'spaziatura', css: 'letter-spacing', tipo: 'numero', etichetta: 'Spazio fra le lettere', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      min: -0.2, max: 1, passo: 0.01, decimali: 3, unita: 'em' },
    { nome: 'interlinea', css: 'line-height', tipo: 'numero', etichetta: 'Interlinea', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      min: 0.6, max: 3, passo: 0.05, decimali: 2, unita: '' },
    { nome: 'allineamento', css: 'text-align', tipo: 'scelta', etichetta: 'Allineamento', gruppo: 'tipografia', tipi: SENZA_IMMAGINE,
      valori: [
        { valore: 'sinistra', css: 'left', etichetta: 'A sinistra' },
        { valore: 'centro', css: 'center', etichetta: 'Al centro' },
        { valore: 'destra', css: 'right', etichetta: 'A destra' },
        { valore: 'giustificato', css: 'justify', etichetta: 'Giustificato' }
      ] },
    { nome: 'riempimento', css: 'padding', tipo: 'lati', etichetta: 'Spazio interno', gruppo: 'spazi', tipi: TUTTI,
      min: 0, max: 400, passo: 1, decimali: 2, unita: 'px' },
    { nome: 'margine', css: 'margin', tipo: 'lati', etichetta: 'Spazio esterno', gruppo: 'spazi', tipi: TUTTI,
      min: -400, max: 400, passo: 1, decimali: 2, unita: 'px' },
    { nome: 'bordoSpessore', css: 'border-width', tipo: 'numero', etichetta: 'Spessore del bordo', gruppo: 'bordi', tipi: TUTTI,
      min: 0, max: 20, passo: 1, decimali: 2, unita: 'px' },
    { nome: 'raggio', css: 'border-radius', tipo: 'numero', etichetta: 'Angoli arrotondati', gruppo: 'bordi', tipi: TUTTI,
      min: 0, max: 200, passo: 1, decimali: 2, unita: 'px' },
    { nome: 'opacita', css: 'opacity', tipo: 'numero', etichetta: 'Opacità', gruppo: 'effetti', tipi: TUTTI,
      min: 0, max: 100, passo: 1, decimali: 0, unita: '%' },

    { nome: 'bagliore', css: 'text-shadow', tipo: 'scelta', etichetta: 'Bagliore', gruppo: 'effetti', tipi: TUTTI,
      valori: [
        { valore: 'nessuno', css: 'none', etichetta: 'Nessuno' },
        { valore: 'viola', css: 'var(--bagliore-viola)', etichetta: 'Viola' },
        { valore: 'ciano', css: 'var(--bagliore-ciano)', etichetta: 'Ciano' }
      ] },
    { nome: 'nascosto', css: 'display', tipo: 'visibilita', etichetta: 'Nascosto', gruppo: 'visibilita', tipi: TUTTI },
    { nome: 'larghezzaMax', css: 'max-width', tipo: 'misura', etichetta: 'Larghezza massima', gruppo: 'larghezza', tipi: TUTTI,
      unita: {
        px: { min: 0, max: 4000, passo: 1, decimali: 2 },
        '%': { min: 0, max: 100, passo: 1, decimali: 2 }
      } }
  ]);

  const PER_NOME = {};
  PROPRIETA.forEach(function (p) { PER_NOME[p.nome] = p; });

  const LATI = [['sopra', 'top'], ['destra', 'right'], ['sotto', 'bottom'], ['sinistra', 'left']];
  const RUOLI_FONT = ['titolo', 'testo', 'mono'];

  const RE_ESADECIMALE = /^#[0-9a-fA-F]{6}$/;
  const RE_NUMERO_TESTO = /^\s*-?\d+(\.\d+)?\s*$/;
  const RE_PERCORSO_IMMAGINE = /^(img|contenuti\/media)\/[A-Za-z0-9._\/-]+\.(png|jpe?g|webp|svg|gif|avif)$/i;
  const RE_ID_FONT = /^[0-9a-f]{16}$/;
  const RE_FILE_FONT = /^[A-Za-z0-9_-]{1,64}\.(woff2|woff|ttf|otf)$/;

  const RE_NOME_FAMIGLIA = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;

  const RE_RIPIEGO = /^[A-Za-z0-9 ,'-]{1,200}$/;
  const RE_BASE = /^[A-Za-z0-9._\/-]{0,100}$/;
  const FORMATI_FONT = { woff2: 'woff2', woff: 'woff', truetype: 'truetype', opentype: 'opentype', ttf: 'truetype', otf: 'opentype' };

  function propria(oggetto, chiave) {
    return Object.prototype.hasOwnProperty.call(oggetto, chiave);
  }

  function oggetto(v) {
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  }

  function numero(valore) {
    let n = NaN;
    if (typeof valore === 'number') n = valore;
    else if (typeof valore === 'string' && RE_NUMERO_TESTO.test(valore)) n = parseFloat(valore);
    return isFinite(n) ? n : null;
  }

  function arrotonda(n, decimali) {
    const k = Math.pow(10, decimali || 0);
    const r = Math.round(n * k) / k;
    return r === 0 ? 0 : r;
  }

  function stringi(valore, min, max, decimali, passo) {
    let n = numero(valore);
    if (n === null) return null;
    n = Math.min(max, Math.max(min, n));
    if (passo && decimali === 0) n = Math.min(max, Math.max(min, Math.round(n / passo) * passo));
    return arrotonda(n, decimali);
  }

  function formatta(n, decimali) {
    const d = decimali === undefined ? 2 : decimali;
    const r = arrotonda(Number(n), d);
    if (!isFinite(r) || r === 0) return '0';
    const testo = r.toFixed(d);
    return testo.indexOf('.') === -1 ? testo : testo.replace(/\.?0+$/, '');
  }

  function leggiBersaglio(id) {
    if (typeof id !== 'string' || id.length > MAX_LUNGHEZZA_BERSAGLIO) return null;
    const taglio = id.indexOf(':');
    if (taglio < 1) return null;
    const tipo = id.slice(0, taglio);
    const chiave = id.slice(taglio + 1);
    if (!propria(TIPI_BERSAGLIO, tipo)) return null;
    if (tipo === 'sezione') return SEZIONI.indexOf(chiave) !== -1 ? { tipo: tipo, chiave: chiave } : null;
    if (!TIPI_BERSAGLIO[tipo].test(chiave)) return null;

    if (tipo === 'blocco' && RIQUADRI.indexOf(chiave.slice(0, chiave.indexOf('.'))) === -1) return null;
    return { tipo: tipo, chiave: chiave };
  }

  function selettoreDi(id) {
    const b = leggiBersaglio(id);
    return b ? '[' + ATTRIBUTI[b.tipo] + '="' + b.chiave + '"]' : null;
  }

  function protetto(id) {
    return PROTETTI.indexOf(id) !== -1;
  }

  function chiama(funzione, argomento) {
    if (typeof funzione !== 'function') return undefined;
    try { return funzione(argomento); } catch (e) { return null; }
  }

  function pulisciColore(valore) {
    if (typeof valore !== 'string') return null;
    const v = valore.trim();
    if (RE_ESADECIMALE.test(v)) return v;
    if (v.indexOf('var:') === 0 && propria(COLORI_TEMA, v.slice(4))) return v;
    return null;
  }

  function pulisciImmagine(valore) {
    if (typeof valore !== 'string') return null;
    if (valore === 'nessuna') return valore;
    if (valore.length > 300 || valore.indexOf('..') !== -1 || valore.indexOf('//') !== -1) return null;
    return RE_PERCORSO_IMMAGINE.test(valore) ? valore : null;
  }

  function pulisciScelta(definizione, valore) {
    for (let i = 0; i < definizione.valori.length; i++) {
      if (definizione.valori[i].valore === valore) return valore;
    }
    return null;
  }

  function pulisciFont(valore, opzioni) {
    if (typeof valore !== 'string') return null;
    const taglio = valore.indexOf(':');
    if (taglio < 1) return null;
    const specie = valore.slice(0, taglio);
    const resto = valore.slice(taglio + 1);
    const o = opzioni || {};
    if (specie === 'ruolo') return RUOLI_FONT.indexOf(resto) !== -1 ? valore : null;
    if (specie === 'famiglia') {
      if (!RE_NOME_FAMIGLIA.test(resto)) return null;
      if (typeof o.famiglia === 'function' && !voceFamiglia(resto, o)) return null;
      return valore;
    }
    if (specie === 'caricato') {
      if (!RE_ID_FONT.test(resto)) return null;
      if (typeof o.font === 'function' && !voceFont(resto, o)) return null;
      return valore;
    }
    return null;
  }

  function pulisciMisura(definizione, valore) {
    const o = oggetto(valore);
    if (!o || typeof o.unita !== 'string' || !propria(definizione.unita, o.unita)) return null;
    const u = definizione.unita[o.unita];
    const n = stringi(o.valore, u.min, u.max, u.decimali);
    return n === null ? null : { valore: n, unita: o.unita };
  }

  function pulisciLati(definizione, valore, limiti) {
    const o = oggetto(valore);
    if (!o) return null;
    const fuori = {};
    let qualcuno = false;
    LATI.forEach(function (coppia) {
      if (!propria(o, coppia[0])) return;
      if (limiti) {
        const grezzo = numero(o[coppia[0]]);
        if (grezzo !== null && ((limiti.min !== undefined && grezzo < limiti.min) || (limiti.max !== undefined && grezzo > limiti.max))) return;
      }
      const n = stringi(o[coppia[0]], definizione.min, definizione.max, definizione.decimali);
      if (n === null) return;
      fuori[coppia[0]] = n;
      qualcuno = true;
    });
    return qualcuno ? fuori : null;
  }

  function pulisciValore(bersaglio, proprieta, valore, opzioni) {
    if (typeof proprieta !== 'string' || !propria(PER_NOME, proprieta)) return null;
    let id = null;
    if (bersaglio !== null && bersaglio !== undefined) {
      const letto = typeof bersaglio === 'string' ? leggiBersaglio(bersaglio)
        : (oggetto(bersaglio) ? leggiBersaglio(bersaglio.tipo + ':' + bersaglio.chiave) : null);
      if (!letto) return null;
      id = letto.tipo + ':' + letto.chiave;
    }
    if (id && protetto(id) && VIETATE_AI_PROTETTI.indexOf(proprieta) !== -1) return null;

    const d = PER_NOME[proprieta];
    switch (d.tipo) {
      case 'colore': return pulisciColore(valore);
      case 'immagine': return pulisciImmagine(valore);
      case 'scelta': return pulisciScelta(d, valore);
      case 'font': return pulisciFont(valore, opzioni);
      case 'misura': return pulisciMisura(d, valore);
      case 'numero': return stringi(valore, d.min, d.max, d.decimali, d.passo);
      case 'lati':
        return pulisciLati(d, valore, id && protetto(id) ? LATI_PROTETTI[proprieta] : undefined);
      case 'interruttore':
      case 'visibilita': return typeof valore === 'boolean' ? valore : null;
      default: return null;
    }
  }

  function pulisciStili(stili, opzioni) {
    const fuori = {};
    const origine = oggetto(stili);
    if (!origine) return fuori;
    const chiavi = Object.keys(origine);
    let contati = 0;
    for (let i = 0; i < chiavi.length && contati < MAX_BERSAGLI; i++) {
      const id = chiavi[i];
      if (!leggiBersaglio(id)) continue;
      const voce = oggetto(origine[id]);
      if (!voce) continue;
      const pulita = {};
      let qualcosa = false;
      DISPOSITIVI.forEach(function (dispositivo) {
        const valori = propria(voce, dispositivo) ? oggetto(voce[dispositivo]) : null;
        if (!valori) return;
        const puliti = {};
        let piena = false;
        PROPRIETA.forEach(function (d) {
          if (!propria(valori, d.nome)) return;
          const v = pulisciValore(id, d.nome, valori[d.nome], opzioni);
          if (v === null) return;

          if (d.tipo === 'visibilita' && v === false && dispositivo === 'computer') return;
          puliti[d.nome] = v;
          piena = true;
        });
        if (piena) { pulita[dispositivo] = puliti; qualcosa = true; }
      });
      if (qualcosa) { fuori[id] = pulita; contati++; }
    }
    return fuori;
  }

  function risolvi(voce, dispositivo, proprieta) {
    const v = oggetto(voce);
    const partenza = DISPOSITIVI.indexOf(dispositivo);
    if (!v || partenza === -1) return null;
    for (let i = partenza; i >= 0; i--) {
      const valori = oggetto(v[DISPOSITIVI[i]]);
      if (valori && propria(valori, proprieta) && valori[proprieta] !== null && valori[proprieta] !== undefined) {
        return { valore: valori[proprieta], da: DISPOSITIVI[i] };
      }
    }
    return null;
  }

  function voceFamiglia(nome, opzioni) {
    const voce = oggetto(chiama(opzioni && opzioni.famiglia, nome));
    if (!voce || voce.nome !== nome || !RE_NOME_FAMIGLIA.test(voce.nome)) return null;
    return voce;
  }

  function voceFont(id, opzioni) {
    const voce = oggetto(chiama(opzioni && opzioni.font, id));
    if (!voce || voce.id !== id || typeof voce.file !== 'string' || !RE_FILE_FONT.test(voce.file)) return null;
    return voce;
  }

  function prefisso(opzioni) {
    const base = opzioni && typeof opzioni.base === 'string' ? opzioni.base : '';
    return RE_BASE.test(base) ? base : '';
  }

  function formatoDi(voce) {
    if (typeof voce.formato === 'string' && propria(FORMATI_FONT, voce.formato)) return FORMATI_FONT[voce.formato];
    return FORMATI_FONT[voce.file.slice(voce.file.lastIndexOf('.') + 1)];
  }

  function fontFace(voce, opzioni) {
    const v = oggetto(voce);
    if (!v || typeof v.id !== 'string' || !RE_ID_FONT.test(v.id) || typeof v.file !== 'string' || !RE_FILE_FONT.test(v.file)) return '';
    return '@font-face {\n' +
      '  font-family: \'sb-' + v.id + '\';\n' +
      '  src: url(\'' + prefisso(opzioni) + 'contenuti/font/' + v.file + '\') format(\'' + formatoDi(v) + '\');\n' +
      '  font-display: swap;\n' +
      '}';
  }

  function coloreCss(v) {
    return v.indexOf('var:') === 0 ? 'var(' + COLORI_TEMA[v.slice(4)] + ')' : v;
  }

  function sceltaCss(definizione, v) {
    for (let i = 0; i < definizione.valori.length; i++) {
      if (definizione.valori[i].valore === v) return definizione.valori[i].css;
    }
    return null;
  }

  function dichiarazioni(bersaglio, valori, opzioni, raccolta) {
    const fuori = [];
    function metti(proprieta, valore) { fuori.push(proprieta + ': ' + valore + ' !important;'); }
    const immagine = bersaglio.tipo === 'immagine';

    PROPRIETA.forEach(function (d) {
      if (!propria(valori, d.nome)) return;
      const v = valori[d.nome];
      switch (d.tipo) {
        case 'colore':
          metti(d.css, coloreCss(v));
          break;
        case 'immagine':
          metti(d.css, v === 'nessuna' ? 'none' : 'url(\'' + prefisso(opzioni) + v + '\')');
          break;
        case 'scelta':
          if (d.nome === 'bagliore' && immagine) {
            metti('filter', v === 'nessuno' ? 'none' : 'drop-shadow(' + sceltaCss(d, v) + ')');
          } else {
            metti(d.css, sceltaCss(d, v));
          }
          break;
        case 'interruttore':
          metti(d.css, v ? 'italic' : 'normal');
          break;
        case 'font': {
          const taglio = v.indexOf(':');
          const specie = v.slice(0, taglio);
          const resto = v.slice(taglio + 1);
          if (specie === 'ruolo') {
            metti(d.css, 'var(--font-' + resto + ')');
          } else if (specie === 'famiglia') {
            const voce = voceFamiglia(resto, opzioni);
            if (!voce) break;
            const ripiego = typeof voce.ripiego === 'string' && RE_RIPIEGO.test(voce.ripiego) ? voce.ripiego : 'var(--font-testo)';
            metti(d.css, '\'' + voce.nome + '\', ' + ripiego);
          } else if (specie === 'caricato') {
            const voce = voceFont(resto, opzioni);
            if (!voce) break;
            metti(d.css, '\'sb-' + resto + '\', var(--font-testo)');
            if (!propria(raccolta.visti, resto)) {
              raccolta.visti[resto] = true;
              const regola = fontFace(voce, opzioni);
              if (regola) raccolta.regole.push(regola);
            }
          }
          break;
        }
        case 'misura':
          metti(d.css, formatta(v.valore, d.unita[v.unita].decimali) + v.unita);
          break;
        case 'numero':
          if (d.nome === 'opacita') {
            metti(d.css, formatta(v / 100, 2));
          } else {
            metti(d.css, formatta(v, d.decimali) + d.unita);

            if (d.nome === 'bordoSpessore' && v > 0) metti('border-style', 'solid');
          }
          break;
        case 'lati':
          LATI.forEach(function (coppia) {
            if (propria(v, coppia[0])) metti(d.css + '-' + coppia[1], formatta(v[coppia[0]], d.decimali) + d.unita);
          });
          break;
        default:
          break;
      }
    });
    return fuori;
  }

  function blocchiNascosto(puliti, bersagli) {
    const fuori = [];
    ['computer', 'tablet', 'telefono'].forEach(function (fascia) {
      const regole = [];
      bersagli.forEach(function (id) {
        const effettivo = risolvi(puliti[id], fascia, 'nascosto');
        if (!effettivo || effettivo.valore !== true) return;
        regole.push('  ' + selettoreDi(id) + ' {\n    display: none !important;\n  }');
      });
      if (regole.length) fuori.push('@media ' + FASCE[fascia] + ' {\n' + regole.join('\n') + '\n}');
    });
    return fuori;
  }

  function stiliCss(stili, opzioni) {
    const puliti = pulisciStili(stili, opzioni);
    const bersagli = Object.keys(puliti);
    if (!bersagli.length) return '';

    const raccolta = { visti: {}, regole: [] };
    let blocchi = [];

    DISPOSITIVI.forEach(function (dispositivo) {
      const media = propria(CASCATA, dispositivo) ? CASCATA[dispositivo] : null;
      const rientro = media ? '  ' : '';
      const regole = [];
      bersagli.forEach(function (id) {
        const valori = puliti[id][dispositivo];
        if (!valori) return;
        const righe = dichiarazioni(leggiBersaglio(id), valori, opzioni, raccolta);
        if (!righe.length) return;
        regole.push(rientro + selettoreDi(id) + ' {\n' +
          righe.map(function (r) { return rientro + '  ' + r; }).join('\n') + '\n' +
          rientro + '}');
      });
      if (!regole.length) return;
      blocchi.push(media ? '@media ' + media + ' {\n' + regole.join('\n') + '\n}' : regole.join('\n'));
    });
    blocchi = blocchi.concat(blocchiNascosto(puliti, bersagli));

    if (!blocchi.length) return '';
    return raccolta.regole.concat(blocchi).join('\n');
  }

  const RE_BLOCCO = /^[a-z][a-z0-9-]{0,40}\.[a-z][a-z0-9-]{0,40}$/;

  function pulisciRettangolo(valore) {
    const o = oggetto(valore);
    if (!o) return null;
    const x = stringi(o.x, 0, 100, 2);
    const y = stringi(o.y, 0, MAX_VERTICALE, 2);
    const l = stringi(o.l, 0, 100, 2);
    const a = stringi(o.a, 0, MAX_VERTICALE, 2);
    if (x === null || y === null || l === null || a === null) return null;
    return { x: x, y: y, l: l, a: a };
  }

  function pulisciDisposizione(disposizione) {
    const blocchi = oggetto(oggetto(disposizione) && disposizione.blocchi);
    const fuori = {};
    if (!blocchi) return { blocchi: fuori };
    RIQUADRI.forEach(function (riquadro) {
      if (!propria(blocchi, riquadro) || !Array.isArray(blocchi[riquadro])) return;
      const visti = {};
      const elenco = [];
      const origine = blocchi[riquadro];
      for (let i = 0; i < origine.length && elenco.length < MAX_BLOCCHI; i++) {
        const voce = oggetto(origine[i]);
        if (!voce || typeof voce.id !== 'string' || !RE_BLOCCO.test(voce.id)) continue;
        if (voce.id.slice(0, voce.id.indexOf('.')) !== riquadro || propria(visti, voce.id)) continue;
        visti[voce.id] = true;
        const pos = oggetto(voce.pos) || {};
        const pulita = {};
        ['telefono', 'tablet', 'computer'].forEach(function (d) {
          pulita[d] = propria(pos, d) ? pulisciRettangolo(pos[d]) : null;
        });
        elenco.push({ id: voce.id, pos: pulita });
      }
      fuori[riquadro] = elenco;
    });
    return { blocchi: fuori };
  }

  function disposizioneCss(disposizione, opzioni) {
    const presente = opzioni && typeof opzioni.presente === 'function' ? opzioni.presente : null;
    const blocchi = pulisciDisposizione(disposizione).blocchi;
    const fuori = [];

    ['telefono', 'tablet', 'computer'].forEach(function (fascia) {
      const regole = [];
      RIQUADRI.forEach(function (riquadro) {
        if (!propria(blocchi, riquadro)) return;
        const messi = [];
        blocchi[riquadro].forEach(function (voce) {
          const r = voce.pos[fascia];
          if (!r) return;
          if (presente) {
            let c = false;
            try { c = presente(riquadro, voce.id) === true; } catch (e) { c = false; }
            if (!c) return;
          }
          messi.push({ id: voce.id, r: r });
        });
        if (!messi.length) return;

        let m = 1;
        messi.forEach(function (p) { m = Math.max(m, p.r.y + p.r.a); });
        const riq = '[data-sb-riquadro="' + riquadro + '"]';
        regole.push(
          '  ' + riq + ' {\n' +
          '    position: relative !important;\n' +
          '    container-type: inline-size;\n' +
          '    aspect-ratio: 100 / ' + formatta(m, 2) + ';\n' +
          '  }'
        );
        messi.forEach(function (p) {
          regole.push(
            '  ' + riq + ' [data-sb-blocco="' + p.id + '"] {\n' +
            '    position: absolute !important;\n' +
            '    left: calc(' + formatta(p.r.x, 2) + ' * 1cqw) !important;\n' +
            '    top: calc(' + formatta(p.r.y, 2) + ' * 1cqw) !important;\n' +
            '    width: calc(' + formatta(p.r.l, 2) + ' * 1cqw) !important;\n' +
            '    min-height: calc(' + formatta(p.r.a, 2) + ' * 1cqw) !important;\n' +
            '    height: auto !important;\n' +
            '    margin: 0 !important;\n' +
            '    max-width: none !important;\n' +
            '  }'
          );
        });
      });
      if (regole.length) fuori.push('@media ' + FASCE[fascia] + ' {\n' + regole.join('\n') + '\n}');
    });

    return fuori.join('\n');
  }

  function pulisciSezioni(sezioni) {
    const origine = Array.isArray(sezioni) ? sezioni : [];
    const visti = {};
    const fuori = [];
    for (let i = 0; i < origine.length && i < 100; i++) {
      const voce = oggetto(origine[i]);
      const id = voce && typeof voce.id === 'string' ? voce.id.trim() : '';
      if (SEZIONI_ORDINABILI.indexOf(id) === -1 || propria(visti, id)) continue;
      visti[id] = true;

      fuori.push({ id: id, attiva: typeof voce.attiva === 'boolean' ? voce.attiva : true });
    }
    SEZIONI_ORDINABILI.forEach(function (id, i) {
      if (propria(visti, id)) return;
      let dopo = -1;
      for (let j = i - 1; j >= 0 && dopo === -1; j--) {
        for (let k = 0; k < fuori.length; k++) {
          if (fuori[k].id === SEZIONI_ORDINABILI[j]) { dopo = k; break; }
        }
      }
      fuori.splice(dopo + 1, 0, { id: id, attiva: true });
      visti[id] = true;
    });
    const regia = fuori.filter(function (v) { return v.id === SEZIONE_BLOCCATA; })[0];
    regia.attiva = true;
    return [regia].concat(fuori.filter(function (v) { return v.id !== SEZIONE_BLOCCATA; }));
  }

  return {
    DISPOSITIVI: DISPOSITIVI,
    CASCATA: CASCATA,
    FASCE: FASCE,
    LARGHEZZE: LARGHEZZE,
    COLORI_TEMA: COLORI_TEMA,
    SEZIONI: SEZIONI,
    SEZIONI_ORDINABILI: SEZIONI_ORDINABILI,
    RIQUADRI: RIQUADRI,
    PROTETTI: PROTETTI,
    VIETATE_AI_PROTETTI: VIETATE_AI_PROTETTI,
    LATI_PROTETTI: LATI_PROTETTI,
    PROPRIETA: PROPRIETA,
    MAX_BERSAGLI: MAX_BERSAGLI,

    leggiBersaglio: leggiBersaglio,
    selettoreDi: selettoreDi,
    pulisciValore: pulisciValore,
    pulisciStili: pulisciStili,
    stiliCss: stiliCss,
    risolvi: risolvi,
    pulisciDisposizione: pulisciDisposizione,
    disposizioneCss: disposizioneCss,
    pulisciSezioni: pulisciSezioni,

    fontFace: fontFace
  };
});
