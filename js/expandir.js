(function (GC) {
  // Expandir para a tela inteira: as telas sobre o mapa (#sobre) e as gavetas da direita (Alertas com o
  // detalhe do alerta, Maia). A escolha fica guardada por grupo, só neste navegador (conveniência de quem usa):
  // 'tela' (todas as telas sobre o mapa), 'alertas' (lista e detalhe) e 'maia'.
  const CHAVE = 'gc.expandir';
  let memoria = {};
  const ler = () => {
    try { const v = JSON.parse(window.localStorage.getItem(CHAVE)); if (v && typeof v === 'object') memoria = v; } catch (e) { /* fica a memória */ }
    return memoria;
  };
  const gravar = () => { try { window.localStorage.setItem(CHAVE, JSON.stringify(memoria)); } catch (e) { /* sem armazenamento */ } };

  const ROTULO = { true: 'Recolher', false: 'Expandir para a tela inteira' };

  GC.expandir = {
    ligado: (grupo) => !!ler()[grupo],
    marcar(grupo, sim) { ler(); if (sim) memoria[grupo] = true; else delete memoria[grupo]; gravar(); return !!sim; },
    alternar(grupo) { return GC.expandir.marcar(grupo, !GC.expandir.ligado(grupo)); },
    // O botão: os dois ícones moram nele e o CSS mostra o certo pelo aria-pressed.
    html: (grupo, classe = '') => {
      const sim = GC.expandir.ligado(grupo);
      return `<button type="button" class="btn-expandir ${classe}" data-expandir="${grupo}" aria-pressed="${sim}" title="${ROTULO[sim]}" aria-label="${ROTULO[sim]}"><i class="ti ti-arrows-maximize" aria-hidden="true"></i><i class="ti ti-arrows-minimize" aria-hidden="true"></i></button>`;
    },
    // Acerta os botões já desenhados (dentro de raiz) depois de uma troca.
    marcarBotoes(raiz, grupo) {
      const sim = GC.expandir.ligado(grupo);
      raiz.querySelectorAll(`[data-expandir="${grupo}"]`).forEach((b) => {
        b.setAttribute('aria-pressed', String(sim));
        b.title = ROTULO[sim];
        b.setAttribute('aria-label', ROTULO[sim]);
      });
    },
  };
})(window.GC = window.GC || {});
