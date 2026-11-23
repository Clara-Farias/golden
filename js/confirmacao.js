// Confirmação com efeito: toda ação que passa pelo "Desfazer" (cobrar, despachar, resolver, priorizar,
// pausar regra, lote…) ganha uma recompensa visual. Um ✓ se desenha no botão que foi clicado, o cartão
// dele pulsa verde uma vez e o ✓ do aviso de baixo também se desenha. Só envolve GC.mostrarDesfazer
// (js/desfazer-ui.js): não muda as ações. Estilo em css/confirmacao.css.
(function (GC) {
  if (typeof document === 'undefined') return;
  const CHECK = '<svg class="ga-check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" pathLength="1"/><path d="M7 12.5l3.2 3.2L17 9" pathLength="1"/></svg>';
  // O que conta como "o cartão" do botão: do mais específico ao mais geral.
  const CARTAO = '.cb-cartao, .tf-cartao, .alr-linha, tr, .gv-bloco, .gaveta-painel section, .rd-item, .w-item, .widget, .ind-cartao, li, article, .sec-ind';
  const poucoMovimento = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // O último clique num botão: o elemento e onde ele estava (o app costuma redesenhar o cartão depois da ação).
  let ultimo = null;
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button, a, [role="button"]') : null;
    if (!b || b.closest('.dz-aviso')) return;
    ultimo = { el: b, rect: b.getBoundingClientRect(), cartao: b.closest(CARTAO), t: Date.now() };
  }, true);

  function checkNoBotao(rect) {
    const s = document.createElement('div');
    s.className = 'ga-feito-selo';
    s.innerHTML = CHECK;
    s.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    s.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }

  function pulsarCartao(cartao) {
    if (!cartao || !cartao.isConnected) return;
    cartao.classList.remove('ga-feito');
    void cartao.offsetWidth;
    cartao.classList.add('ga-feito');
    setTimeout(() => cartao.classList.remove('ga-feito'), 1300);
  }

  // Depois que o app redesenhou: o cartão antigo pode ter sido trocado. Procura o novo pelo mesmo id.
  function cartaoAtual(c) {
    if (!c) return null;
    if (c.isConnected) return c;
    const id = c.dataset && (c.dataset.id || c.dataset.oid || c.dataset.ocorrencia);
    return id ? document.querySelector(`[data-id="${CSS.escape(id)}"], [data-oid="${CSS.escape(id)}"]`) : null;
  }

  GC.celebrarAcao = function () {
    if (poucoMovimento()) return;
    const u = ultimo && Date.now() - ultimo.t < 2500 ? ultimo : null;
    ultimo = null;
    if (!u) return;
    checkNoBotao(u.rect);
    requestAnimationFrame(() => pulsarCartao(cartaoAtual(u.cartao)));
  };

  // Envolve o aviso "✓ Feito · Desfazer": o ✓ do texto vira o ✓ desenhado, e o resto celebra.
  function envolver() {
    const original = GC.mostrarDesfazer;
    if (!original || original._celebra) return;
    const novo = function (item, aoDesfazer) {
      const r = original.apply(this, arguments);
      const texto = document.querySelector('.dz-aviso .dz-texto');
      if (texto && /^✓\s/.test(texto.textContent)) {
        texto.textContent = texto.textContent.replace(/^✓\s*/, '');
        texto.insertAdjacentHTML('afterbegin', CHECK);
        const aviso = texto.closest('.dz-aviso');
        if (aviso) { aviso.classList.remove('dz-feito'); void aviso.offsetWidth; aviso.classList.add('dz-feito'); }
      }
      GC.celebrarAcao();
      return r;
    };
    novo._celebra = true;
    GC.mostrarDesfazer = novo;
  }
  envolver();
  // Se o desfazer-ui carregar depois (ordem de tags mudou), envolve quando a página terminar.
  document.addEventListener('DOMContentLoaded', envolver);
})(window.GC = window.GC || {});
