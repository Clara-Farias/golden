(function (GC) {
  // Visão resumida × visão completa (workshop de 18/11: "opções de navegação mais enxutas ou alternância entre
  // visões simples e complexas, para gestores com diferentes perfis e familiaridade com tecnologia").
  // A visão resumida é o mesmo painel (mapa, cabeçalho, menu, doca e telas), com menos informação:
  //   - o "Resumo de hoje" aberto sobre o mapa (js/resumo-essencial.js);
  //   - o menu com as telas de acompanhamento (GC.TELAS_VISAO_SIMPLES), cada uma resumida (js/resumo-telas.js);
  //   - sem filtros, camadas, visualizações salvas, widgets no mapa e itens de administração (css/visao-simples.css);
  //   - Plano de governo por eixo e Orçamento sem o detalhe de recursos, contratos e licitações.
  // Quem decide como o painel abre é o perfil de acesso (GC.EXIBICOES em js/permissoes.js, editável em Usuários e
  // permissões → Perfis): completa, resumida ou só resumida. Nas duas primeiras a pessoa troca pelo pé do menu, e a
  // escolha fica neste navegador, por usuário (vd-visao.<usuário>). Em "só resumida" não há troca.
  const chave = () => {
    let u = null;
    try { u = typeof GC.usuarioAtual === 'function' ? GC.usuarioAtual() : null; } catch (e) { u = null; }
    return `vd-visao.${u ? u.id : 'demo'}`;
  };
  const ler = () => { try { return localStorage.getItem(chave()); } catch (e) { return null; } };
  const gravar = (v) => { try { localStorage.setItem(chave(), v); } catch (e) { /* sem armazenamento: vale até recarregar */ } };
  // Destinos do menu na visão resumida (pela tela da rota). Desde a revisão de 19/11 a visão resumida não corta
  // módulos: todas as telas de acompanhamento ficam, cada uma resumida (js/resumo-telas.js). Só o Cruzamento de
  // dados (ferramenta de análise) fica para a visão completa. 'secretaria' é a "Minha secretaria" do setor.
  GC.TELAS_VISAO_SIMPLES = ['painel', 'crise', 'secretarias', 'secretaria', 'relatorios', 'sazonal', 'entregas', 'metas', 'orcamento', 'tarefas', 'alertas', 'indicadores', 'publicacoes', 'governanca', 'fontes'];

  // O perfil em uso (com o "Vendo como" da URL, se houver).
  function papelAtual() {
    try { return GC.papelDe ? GC.papelDe(GC.perfil) : null; } catch (e) { return null; }
  }
  const exibicao = () => { const p = papelAtual(); return (p && GC.EXIBICOES && GC.EXIBICOES[p.exibicao]) ? p.exibicao : 'completa'; };
  const forcada = () => exibicao() === 'so_resumida';
  function ligada() {
    if (GC.visaoDe && GC.visaoDe(GC.perfil) === 'portal') return false;
    if (forcada()) return true;
    // Minha visão (js/minha-visao.js), quando a pessoa já salvou a dela: o mapa simples é a visão resumida.
    const mv = GC.minhaVisao && GC.minhaVisao.salva();
    if (mv && mv.mapa) return mv.mapa === 'simples';
    const guardada = ler();
    if (guardada === 'simples') return true;
    if (guardada === 'completa') return false;
    return exibicao() === 'resumida';
  }

  function aplicar() { document.documentElement.classList.toggle('visao-simples', ligada()); }

  GC.visaoSimples = {
    ligada,
    forcada,
    exibicao,
    alternar(valor) {
      if (forcada()) return;
      const simples = valor === undefined ? !ligada() : valor;
      gravar(simples ? 'simples' : 'completa');
      // A troca rápida do pé do menu vira um modelo da Minha visão (Resumida ou Completa).
      if (GC.minhaVisao) GC.minhaVisao.definir({ mapa: simples ? 'simples' : 'completo', arrumacao: 'padrao', blocos: {} });
      aplicar();
      // O menu e a doca são montados uma vez: recarregar é o jeito simples e sem resto de estado.
      window.location.reload();
    },
    // Filtra os itens do menu (js/dashboard.js) na visão resumida.
    menu(itens) {
      const fora = (i) => !!(GC.minhaVisao && i.rota && GC.minhaVisao.ocultaNoMenu(i.rota.tela));
      if (!ligada()) return itens.filter((i) => !fora(i));
      return itens.filter((i) => !i.grupo && GC.TELAS_VISAO_SIMPLES.includes(i.rota.tela) && !fora(i));
    },
    aplicar,
  };
})(window.GC = window.GC || {});
