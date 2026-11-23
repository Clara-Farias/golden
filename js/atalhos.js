// Atalhos visíveis: segurar Ctrl (⌘ no Mac) por meio segundo mostra a tecla em cima dos botões que têm
// atalho e um quadro com todos os atalhos. Soltar, apertar outra tecla ou trocar de janela esconde.
// Só mostra: os atalhos continuam onde já estavam (busca, desfazer, telão, simulação). Estilo em css/atalhos.css.
(function (GC) {
  const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
  const CTRL = MAC ? '⌘' : 'Ctrl';

  // Selos em cima dos botões (o primeiro visível de cada seletor).
  GC.SELOS_ATALHO = [
    { sel: '#btn-busca', tecla: `${CTRL} K` },
    { sel: '.dz-aviso:not([hidden]) .dz-botao', tecla: `${CTRL} Z` },
    { sel: '#dash-fechar', tecla: 'Esc' },
    { sel: '#sobre-fechar', tecla: 'Esc' },
    { sel: '.gavetas.aberta .gaveta-painel:not([hidden]) .gaveta-x', tecla: 'Esc' },
    { sel: '.ind-nav', tecla: '← →' },
    { sel: '.telao-pausar', tecla: 'Espaço' },
    { sel: '.telao-tema', tecla: 'T' },
  ];

  // O quadro: tudo o que o teclado faz no painel.
  GC.LISTA_ATALHOS = [
    { teclas: [CTRL, 'K'], texto: 'Buscar e agir (painel de comando)' },
    { teclas: ['/'], texto: 'Buscar' },
    { teclas: [CTRL, 'Z'], texto: 'Desfazer a última ação' },
    { teclas: ['Esc'], texto: 'Fechar o que está aberto' },
    { teclas: ['←', '→'], texto: 'Indicador ou compromisso anterior e seguinte' },
    { teclas: ['N'], texto: 'Simular uma ocorrência nova (demonstração)' },
    { teclas: ['Espaço'], texto: 'Telão: pausar e retomar' },
    { teclas: ['T'], texto: 'Telão: tema claro ou noturno' },
  ];

  if (typeof document === 'undefined') return;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const ESPERA_MS = 250;
  let timer = null;
  let aberto = false;
  let camada = null;

  const visivel = (el) => {
    if (!el || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };

  function mostrar() {
    if (aberto) return;
    aberto = true;
    camada = document.createElement('div');
    camada.className = 'atalhos-camada';
    camada.setAttribute('aria-hidden', 'true');
    GC.SELOS_ATALHO.forEach(({ sel, tecla }) => {
      const el = [...document.querySelectorAll(sel)].find(visivel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = document.createElement('kbd');
      s.className = 'atalho-selo';
      s.textContent = tecla;
      s.style.left = `${Math.round(r.left + r.width / 2)}px`;
      s.style.top = `${Math.round(r.top)}px`;
      camada.appendChild(s);
    });
    const quadro = document.createElement('div');
    quadro.className = 'atalhos-quadro';
    quadro.innerHTML = `<b>Atalhos do teclado</b><ul>${GC.LISTA_ATALHOS.map((a) => `<li><span>${a.teclas.map((t) => `<kbd>${esc(t)}</kbd>`).join('')}</span>${esc(a.texto)}</li>`).join('')}</ul><small>Qualquer tecla ou clique fecha</small>`;
    camada.appendChild(quadro);
    document.body.appendChild(camada);
  }
  function esconder() {
    clearTimeout(timer);
    timer = null;
    if (!aberto) return;
    aberto = false;
    if (camada) camada.remove();
    camada = null;
  }

  // Dois jeitos: segurar Ctrl mostra enquanto estiver apertado; um toque rápido no Ctrl sozinho abre e o
  // quadro fica até a próxima tecla, clique ou troca de janela. Ctrl com outra tecla (Ctrl+K, Ctrl+C) é
  // atalho de verdade: não abre nada.
  const ehCtrl = (e) => (MAC ? e.key === 'Meta' : e.key === 'Control');
  let apertouEm = 0;
  let outraTecla = false;
  let fixo = false; // aberto pelo toque: não fecha ao soltar o Ctrl
  window.addEventListener('keydown', (e) => {
    if (ehCtrl(e)) {
      if (e.repeat) return;
      if (fixo) { fixo = false; esconder(); return; } // outro toque no Ctrl fecha
      apertouEm = Date.now();
      outraTecla = false;
      clearTimeout(timer);
      timer = setTimeout(() => { if (!outraTecla && !aberto) mostrar(); }, ESPERA_MS);
      return;
    }
    outraTecla = true;
    fixo = false;
    esconder();
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!ehCtrl(e)) return;
    const toque = !outraTecla && Date.now() - apertouEm < ESPERA_MS;
    clearTimeout(timer);
    timer = null;
    if (toque && !aberto) { mostrar(); fixo = true; return; }
    if (!fixo) esconder();
  }, true);
  const fecharTudo = () => { fixo = false; esconder(); };
  window.addEventListener('blur', fecharTudo);
  document.addEventListener('pointerdown', fecharTudo, true);
  window.addEventListener('scroll', () => { if (aberto) fecharTudo(); }, true);
})(window.GC = window.GC || {});
