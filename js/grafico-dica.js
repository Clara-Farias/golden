// Dica que segue o mouse nos gráficos de série (ficha do indicador: .ind-grafico[data-dica]).
// Uma linha vertical no mês mais perto do cursor, o ponto aceso e uma bolha com o mês, o valor e se
// está na meta. Só escuta eventos (delegação no document): não muda quem desenha o gráfico.
(function (GC) {
  if (typeof document === 'undefined') return;
  const NS = 'http://www.w3.org/2000/svg';

  function preparar(fig) {
    if (fig._dica) return fig._dica;
    const svg = fig.querySelector('svg');
    let pontos = [];
    let valores = [];
    try { pontos = JSON.parse(fig.dataset.dica || '[]'); valores = JSON.parse(fig.dataset.valores || '[]'); } catch (e) { return null; }
    if (!svg || !pontos.length) return null;
    const vb = svg.viewBox.baseVal;
    const linha = document.createElementNS(NS, 'line');
    linha.setAttribute('class', 'ind-mira');
    linha.setAttribute('y1', '6');
    linha.setAttribute('y2', String(vb.height - 22));
    const ponto = document.createElementNS(NS, 'circle');
    ponto.setAttribute('class', 'ind-mira-ponto');
    ponto.setAttribute('r', '5');
    svg.append(linha, ponto);
    const bolha = document.createElement('div');
    bolha.className = 'ind-bolha';
    bolha.setAttribute('aria-hidden', 'true');
    fig.appendChild(bolha);
    fig._dica = { svg, pontos, valores, linha, ponto, bolha, vb };
    return fig._dica;
  }

  function mostrar(fig, ev) {
    const d = preparar(fig);
    if (!d) return;
    const ctm = d.svg.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    let k = 0;
    d.pontos.forEach((q, i) => { if (Math.abs(q.x - p.x) < Math.abs(d.pontos[k].x - p.x)) k = i; });
    const q = d.pontos[k];
    d.linha.setAttribute('x1', q.x); d.linha.setAttribute('x2', q.x);
    d.ponto.setAttribute('cx', q.x); d.ponto.setAttribute('cy', q.y);
    const meta = Number(fig.dataset.metaValor);
    const v = d.valores[k];
    let sit = '';
    if (Number.isFinite(meta) && typeof v === 'number') {
      const ok = fig.dataset.polaridade === 'menor' ? v <= meta : v >= meta;
      sit = `<em class="${ok ? 'ok' : 'fora'}">${ok ? 'na meta' : 'fora da meta'}</em>`;
    }
    d.bolha.innerHTML = `<small>${GC.escaparHtml ? GC.escaparHtml(q.r) : q.r}</small><b>${GC.escaparHtml ? GC.escaparHtml(q.v) : q.v}</b>${sit}`;
    // Posição em pixels dentro da figura (a bolha fica acima do ponto e não sai pelas bordas).
    const caixa = fig.getBoundingClientRect();
    const tela = new DOMPoint(q.x, q.y).matrixTransform(ctm);
    const largura = d.bolha.offsetWidth || 90;
    const left = Math.max(0, Math.min(caixa.width - largura, tela.x - caixa.left - largura / 2));
    const altura = d.bolha.offsetHeight || 54;
    const acima = tela.y - caixa.top - altura - 10;
    // Sem espaço acima do ponto (valor no alto do gráfico): a bolha vai para baixo dele.
    d.bolha.style.transform = `translate(${left}px, ${acima >= 0 ? acima : tela.y - caixa.top + 12}px)`;
    fig.classList.add('com-dica');
  }

  document.addEventListener('pointermove', (ev) => {
    const fig = ev.target && ev.target.closest ? ev.target.closest('.ind-grafico[data-dica]') : null;
    document.querySelectorAll('.ind-grafico.com-dica').forEach((f) => { if (f !== fig) f.classList.remove('com-dica'); });
    if (fig) mostrar(fig, ev);
  }, { passive: true });
  document.addEventListener('pointerleave', () => document.querySelectorAll('.ind-grafico.com-dica').forEach((f) => f.classList.remove('com-dica')));
})(window.GC = window.GC || {});
