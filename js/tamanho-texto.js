(function (GC) {
  // Tamanho do texto do painel (revisão de 19/11): menu ⋯ → Leitura → A, A+ e A++. Vale para as telas, as gavetas,
  // o Resumo de hoje e os indicadores; o mapa e o cabeçalho ficam do mesmo tamanho. Fica neste navegador, por usuário.
  const NIVEIS = [1, 1.12, 1.25];
  const chave = () => {
    let u = null;
    try { u = typeof GC.usuarioAtual === 'function' ? GC.usuarioAtual() : null; } catch (e) { u = null; }
    return `gc.texto.${u ? u.id : 'demo'}`;
  };
  const ler = () => { try { return Math.min(2, Math.max(0, Number(localStorage.getItem(chave())) || 0)); } catch (e) { return 0; } };
  const gravar = (v) => { try { localStorage.setItem(chave(), String(v)); } catch (e) { /* vale até recarregar */ } };
  let nivel = 0;

  function aplicar() {
    const raiz = document.documentElement;
    raiz.style.setProperty('--tt-zoom', String(NIVEIS[nivel]));
    raiz.classList.toggle('tt-maior', nivel > 0);
    document.querySelectorAll('[data-tt]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.tt) === nivel)));
  }

  function montar() {
    nivel = ler();
    const menu = document.getElementById('menu-mais');
    if (menu && !menu.querySelector('.mais-leitura')) {
      const grupo = document.createElement('div');
      grupo.className = 'mais-grupo mais-leitura-grupo'; // sem .item-mais: o css/resumo-telas.css garante que aparece
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-labelledby', 'mais-g-leitura');
      grupo.innerHTML = `<p id="mais-g-leitura" class="mais-grupo-tit">Leitura</p>
        <div class="mais-leitura"><span>Tamanho do texto</span>
          <button type="button" data-tt="0" aria-label="Texto no tamanho normal">A</button>
          <button type="button" data-tt="1" class="tt-1" aria-label="Texto maior">A+</button>
          <button type="button" data-tt="2" class="tt-2" aria-label="Texto muito maior">A++</button></div>`;
      const antes = menu.querySelector('.mais-demo') || menu.querySelector('.mais-rodape');
      menu.insertBefore(grupo, antes);
      grupo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tt]');
        if (!b) return;
        e.stopPropagation();
        nivel = Number(b.dataset.tt) || 0;
        gravar(nivel);
        aplicar();
      });
    }
    aplicar();
  }

  GC.tamanhoTexto = { nivel: () => nivel, definir(v) { nivel = Math.min(2, Math.max(0, Number(v) || 0)); gravar(nivel); aplicar(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})(window.GC = window.GC || {});
