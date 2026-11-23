(function (GC) {
  // Movimento do Portal do Cidadão (identidade-visual/movimento.md, temperatura "portal": macio).
  // Só lógica de quando animar; o como mora em css/cidadao-movimento.css. Com "reduzir movimento" ligado
  // no aparelho, nada se mexe: as seções aparecem direto, os números entram com o valor final.
  const reduzido = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MS_CASCATA = 900; // tempo para a cascata terminar (6 itens × 40 ms + 300 ms, com folga)

  // Liga uma classe por um tempo (para a animação rodar uma vez e não voltar a cada atualização).
  function pulsoDeClasse(el, classe, ms) {
    if (!el) return;
    el.classList.remove(classe);
    void el.offsetWidth;
    el.classList.add(classe);
    clearTimeout(el[`_fim_${classe}`]);
    el[`_fim_${classe}`] = setTimeout(() => el.classList.remove(classe), ms);
  }

  // Primeira contagem (item 8): de 0 ao valor, algarismos tabulares, curva de saída.
  function contar(el, ate, ms = 500) {
    if (!el || !Number.isFinite(ate)) return;
    if (reduzido() || ate === 0) { el.textContent = String(ate); return; }
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const k = 1 - (1 - p) ** 3;
      el.textContent = String(Math.round(ate * k));
      if (p < 1) requestAnimationFrame(passo);
    };
    el.textContent = '0';
    requestAnimationFrame(passo);
  }

  GC.movimentoPortal = {
    reduzido,
    pulsoDeClasse,
    contar,

    // Chegada da página: a capa entra em cascata uma vez.
    chegar() {
      if (reduzido()) return;
      pulsoDeClasse(document.body, 'p-chegando', 1200);
    },

    // Seções que aparecem ao entrar na tela: sobem 8 px com fade, filhos em cascata de 40 ms (máx. 6).
    // aoVer(el) roda uma vez, quando a seção aparece (ex.: a contagem dos números).
    revelar(alvos, aoVer) {
      const lista = alvos.filter(Boolean);
      const mostrar = (el) => {
        el.classList.add('p-visto');
        if (!reduzido()) pulsoDeClasse(el, 'p-animando', MS_CASCATA);
        if (aoVer) aoVer(el);
      };
      if (reduzido() || !('IntersectionObserver' in window)) { lista.forEach(mostrar); return; }
      document.documentElement.classList.add('p-revelar');
      const io = new IntersectionObserver((entradas) => entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        mostrar(e.target);
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      lista.forEach((el) => io.observe(el));
      // Impressão: tudo à vista, mesmo o que ainda não passou pela tela.
      window.addEventListener('beforeprint', () => lista.forEach((el) => { if (!el.classList.contains('p-visto')) { io.unobserve(el); el.classList.add('p-visto'); } }));
    },

    // Número mudou (item 7): o valor que trocou desde o último desenho acende uma vez em Egeu.
    // Cada número tem data-num (a chave) e data-v (o valor); a memória é de quem chama.
    marcarMudancas(raiz, memoria) {
      if (!raiz) return;
      raiz.querySelectorAll('[data-num]').forEach((el) => {
        const k = el.dataset.num;
        const v = el.dataset.v !== undefined ? el.dataset.v : el.textContent;
        if (memoria.has(k) && memoria.get(k) !== v && !reduzido()) pulsoDeClasse(el, 'p-mudou', 700);
        memoria.set(k, v);
      });
    },

    // Itens novos numa lista (aviso que chegou): entram uma vez. A primeira passada só memoriza.
    marcarNovos(raiz, seletor, atributo, memoria) {
      if (!raiz) return memoria;
      const els = [...raiz.querySelectorAll(seletor)];
      const ids = new Set(els.map((el) => el.getAttribute(atributo)));
      if (memoria && !reduzido()) els.forEach((el) => { if (!memoria.has(el.getAttribute(atributo))) pulsoDeClasse(el, 'p-novo', 800); });
      return ids;
    },

    // Alvo de foco (item 3): anéis que fecham sobre o item, uma vez.
    alvo(el) { pulsoDeClasse(el, 'p-destacado', 700); },

    // Tudo calmo (item 14): as curvas de nível se desenham devagar, uma vez.
    desenharCurvas(svg) {
      if (!svg || reduzido()) return;
      svg.querySelectorAll('path').forEach((p) => p.setAttribute('pathLength', '1'));
      pulsoDeClasse(svg, 'p-curvas-desenhando', 1400);
    },

    // Saída de painel (mapa em tela cheia, folha): roda a animação de saída e só então termina.
    sair(els, fim, ms = 200) {
      if (reduzido()) { fim(); return null; }
      els.forEach((el) => el && el.classList.add('p-saindo'));
      return setTimeout(() => { els.forEach((el) => el && el.classList.remove('p-saindo')); fim(); }, ms);
    },
  };
})(window.GC = window.GC || {});
