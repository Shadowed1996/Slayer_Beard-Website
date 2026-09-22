(function () {
  'use strict';

  const FRENO = 220;
  const STACCO = 18;
  const BORDO = 12;
  const ETICHETTA = 'Messaggi del pollo';
  const TIPO_MUTO = 'Il pollo dice';
  const NOME_POLLO = 'Punzecchia il pollo: dice qualcosa a caso';

  const FACCE = ['🐔', '🍗', '🥚', '🐦', '🍿'];

  const ANGOLI = [-90, -45, 0, 45, 90, 135, 180, -135];
  const ANGOLI_STRETTI = [-90, 90];

  const FRASI_NOSTRE = [
    { tipo: 'Il pollo dice', testo: 'Stai leggendo questa frase invece di guardare la diretta. Ti capisco, ma insomma.' },
    { tipo: 'Il pollo dice', testo: 'Hai cliccato un pollo disegnato. Su un sito. Di sera. Va bene così.' },
    { tipo: 'Il pollo dice', testo: 'Sì, sono solo un pollo. No, non ho altro da darti. Eppure sei ancora qui.' },
    { tipo: 'Il pollo dice', testo: 'Ti sei fatto tutta la pagina per venire a punzecchiare me. Scelta coraggiosa.' },
    { tipo: 'Il pollo dice', testo: 'Ancora un clic e ti metto nei ringraziamenti come collaboratore.' },
    { tipo: 'Il pollo dice', testo: 'Bel clic. Preciso, elegante, completamente inutile.' },
    { tipo: 'Il pollo dice', testo: 'Se cliccassi «Segui» con questa costanza, saresti già nel mod team.' },
    { tipo: 'Il pollo dice', testo: 'Ti avverto: al centesimo clic non succede niente. Ma prova pure, io ho tempo.' },
    { tipo: 'Il pollo dice', testo: 'Stai procrastinando. Lo vedo. Sono un pollo, ma non sono scemo.' },
    { tipo: 'Il pollo dice', testo: 'Ogni volta che clicchi, da qualche parte una gallina sospira.' },
    { tipo: 'Il pollo dice', testo: 'Mi stai usando come antistress. Accetto il ruolo.' },
    { tipo: 'Il pollo dice', testo: 'Clicchi me e in chat non scrivi mai. Ti ho inquadrato.' },
    { tipo: 'Il pollo dice', testo: 'Questo bigliettino sparisce al prossimo clic. Un po\' come le tue buone intenzioni.' },
    { tipo: 'Il pollo dice', testo: 'Lurkare va benissimo. Cliccare un pollo per dieci minuti, un filo meno.' },
    { tipo: 'Il pollo dice', testo: 'Attenzione: stai interagendo con un pollo invece che con esseri umani.' },
    { tipo: 'Il pollo dice', testo: 'Non mi stanco, non mi offendo, non mi rompo. Tu invece tra poco sì.' },
    { tipo: 'Il pollo dice', testo: 'Sei sceso fin quaggiù nella pagina. Quasi nessuno arriva qui. Sei uno strano, e mi piaci.' },
    { tipo: 'Il pollo dice', testo: 'Ti stai divertendo più tu adesso che io in tutta la mia vita da avatar.' },
    { tipo: 'Il pollo dice', testo: 'Se stai leggendo anche questa, ormai tra noi è una relazione seria.' },
    { tipo: 'Il pollo dice', testo: 'La diretta è quella cosa grande che si muove, più in alto. Questo invece sono io.' },
    { tipo: 'Il pollo dice', testo: 'Fingo di essere sorpreso ogni volta che mi clicchi. È il mestiere.' },
    { tipo: 'Il pollo dice', testo: 'Hai il dito più veloce della tua connessione.' },
    { tipo: 'Il pollo dice', testo: 'Mentre clicchi, la schedule settimanale è lì che aspetta di essere letta. Ma no, tu clicca.' },
    { tipo: 'Il pollo dice', testo: 'Bravo. Bravissimo. Ora però vai a mettere il follow.' },

    { tipo: 'Battuta', testo: 'Perché il pollo ha attraversato la strada? Per non finire a cliccare polli su internet.' },
    { tipo: 'Battuta', testo: 'Il pollo voleva fare lo streamer, poi ha visto quanti clic servono. Ora fa questo.' },
    { tipo: 'Battuta', testo: 'Il pollo ha provato un horror e ha fatto le uova sode dalla paura. Tu invece guardi da dietro le dita, lo so.' },
    { tipo: 'Battuta', testo: 'Qual è il videogioco preferito del pollo? Quello dove si becca di tutto. Un po\' come te in ranked.' },
    { tipo: 'Battuta', testo: 'Il pollo ha comprato un monitor nuovo: ora fa cocoricò in 4K. Tu però mi guardi in 720.' },

    { tipo: 'Lo sapevi che', testo: 'I polli riconoscono e ricordano più di cento facce diverse. La tua, ormai, me la ricordo benissimo.' },
    { tipo: 'Lo sapevi che', testo: 'I polli vedono quattro colori, noi tre: anche l\'ultravioletto. Io ti vedo meglio di come tu veda la diretta.' },
    { tipo: 'Lo sapevi che', testo: 'Il volo più lungo mai registrato per un pollo è durato tredici secondi. Più della tua soglia di attenzione.' },
    { tipo: 'Lo sapevi che', testo: 'Il pollo è tra i parenti viventi più stretti del T-Rex. E tu lo stai punzecchiando con un dito.' },
    { tipo: 'Lo sapevi che', testo: 'I polli sognano davvero: hanno il sonno REM come noi. Stanotte sogno questo clic.' },
    { tipo: 'Lo sapevi che', testo: 'Le galline hanno un vero ordine di beccata. In questa pagina, in questo momento, tu stai sotto di me.' },
    { tipo: 'Lo sapevi che', testo: 'Sulla Terra ci sono più polli che qualsiasi altro uccello: parecchi miliardi. Siamo in maggioranza e ti guardiamo.' },
    { tipo: 'Lo sapevi che', testo: 'Le galline chiocciano ai pulcini prima che nascano e quelli rispondono da dentro l\'uovo. Più conversazione di quanta ne fai tu in chat.' }
  ];

  function el(tag, classe) {
    const e = document.createElement(tag);
    if (classe) { e.className = classe; }
    return e;
  }

  function via(e) {
    if (e && e.parentNode) { e.parentNode.removeChild(e); }
  }

  function ridotto() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function frasi() {
    const fuori = (window.DATI && window.DATI.spam) || null;
    if (!Array.isArray(fuori)) { return FRASI_NOSTRE; }

    const buone = [];
    for (let i = 0; i < fuori.length; i++) {
      const v = fuori[i];

      if (typeof v === 'string' && v.trim()) {
        buone.push({ tipo: TIPO_MUTO, testo: v.trim() });
        continue;
      }

      if (v && typeof v.testo === 'string' && v.testo.trim()) {
        buone.push({
          tipo: (typeof v.tipo === 'string' && v.tipo.trim()) ? v.tipo.trim() : TIPO_MUTO,
          testo: v.testo.trim()
        });
      }
    }

    return buone.length ? buone : FRASI_NOSTRE;
  }

  function mescola(lista) {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = lista[i]; lista[i] = lista[j]; lista[j] = t;
    }
    return lista;
  }

  let mazzo = [];
  let ultima = '';

  function pesca() {
    if (!mazzo.length) {
      mazzo = mescola(frasi().slice());
      if (mazzo.length > 1 && mazzo[mazzo.length - 1].testo === ultima) {
        mazzo.unshift(mazzo.pop());
      }
    }

    const voce = mazzo.pop();
    ultima = voce.testo;
    return voce;
  }

  let giro = [];
  let ultimoAngolo = null;

  function angolo() {
    if (!giro.length) {
      const stretto = document.documentElement.clientWidth < 700;
      giro = mescola((stretto ? ANGOLI_STRETTI : ANGOLI).slice());
      if (giro.length > 1 && giro[giro.length - 1] === ultimoAngolo) {
        giro.unshift(giro.pop());
      }
    }

    ultimoAngolo = giro.pop();
    return ultimoAngolo;
  }

  let pila = null;

  function laPila() {
    if (pila && document.contains(pila)) { return pila; }

    pila = el('div', 'spam');
    pila.setAttribute('aria-live', 'polite');
    pila.setAttribute('aria-label', ETICHETTA);
    document.body.appendChild(pila);
    return pila;
  }

  let ritratto = null;
  let corrente = null;

  function colloca(carta) {
    if (!ritratto || !pila) { return; }

    const r = ritratto.getBoundingClientRect();
    const p = pila.getBoundingClientRect();
    const w = carta.offsetWidth;
    const h = carta.offsetHeight;
    const a = carta.angolo * Math.PI / 180;

    const largo = document.documentElement.clientWidth;
    const alto = document.documentElement.clientHeight;

    let x = r.left + r.width / 2 + Math.cos(a) * (r.width / 2 + w / 2 + STACCO) - w / 2;
    let y = r.top + r.height / 2 + Math.sin(a) * (r.height / 2 + h / 2 + STACCO) - h / 2;

    x = Math.min(Math.max(x, BORDO), Math.max(BORDO, largo - w - BORDO));
    y = Math.min(Math.max(y, BORDO), Math.max(BORDO, alto - h - BORDO));

    carta.style.left = (x - p.left) + 'px';
    carta.style.top = (y - p.top) + 'px';
  }

  function chiudi(carta) {
    if (!carta || carta.dataset.via === '1') { return; }
    carta.dataset.via = '1';
    if (carta === corrente) { corrente = null; }

    if (ridotto()) { via(carta); return; }

    carta.classList.remove('is-dentro');
    carta.classList.add('is-via');
    setTimeout(function () { via(carta); }, 260);
  }

  function biglietto() {
    chiudi(corrente);

    const p = laPila();
    const voce = pesca();
    const carta = el('div', 'spam__carta');

    carta.angolo = angolo();
    carta.style.setProperty('--tilt', (Math.random() * 6 - 3).toFixed(2) + 'deg');
    carta.style.left = '-9999px';
    carta.style.top = '0px';

    const faccia = el('span', 'spam__faccia');
    faccia.setAttribute('aria-hidden', 'true');
    faccia.textContent = FACCE[Math.floor(Math.random() * FACCE.length)];

    const testo = el('p', 'spam__testo');
    const titolo = document.createElement('strong');
    titolo.textContent = voce.tipo;
    testo.appendChild(titolo);
    testo.appendChild(document.createTextNode(voce.testo));

    carta.appendChild(faccia);
    carta.appendChild(testo);
    p.appendChild(carta);

    colloca(carta);
    corrente = carta;

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { carta.classList.add('is-dentro'); });
    } else {
      carta.classList.add('is-dentro');
    }
  }

  function avvia() {
    const chi = document.getElementById('chi');
    ritratto = chi ? chi.querySelector('.chi__ritratto') : null;
    if (!ritratto) { return; }

    ritratto.classList.add('is-pollo');
    ritratto.setAttribute('role', 'button');
    ritratto.setAttribute('tabindex', '0');
    ritratto.setAttribute('aria-label', NOME_POLLO);

    let ultimoClic = 0;

    function punzecchia() {
      const ora = Date.now();
      if (ora - ultimoClic < FRENO) { return; }
      ultimoClic = ora;
      biglietto();
    }

    ritratto.addEventListener('click', punzecchia);

    ritratto.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        punzecchia();
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') { chiudi(corrente); }
    });

    window.addEventListener('resize', function () {
      if (corrente) { colloca(corrente); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }
}());
