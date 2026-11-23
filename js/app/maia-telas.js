(function (GC) {
  // A Maia nas telas (spec 2026-11-12, Maia v2, fase 5): gabinete de crise, relatórios, Resumo do dia e gaveta de
  // Alertas. Qualquer botão com data-maia="<pergunta>" abre a Maia e pergunta com o contexto da tela
  // (data-maia-foco="decisoes" | "resumoDia" força a tela quando o botão está num cartão ou numa gaveta).
  // GC.focoMaiaAtual() dá o mesmo contexto às perguntas digitadas no chat enquanto a tela está aberta.
  GC.criarAppMaiaTelas = function (app) {
    const { store } = app;

    function foco(tipo) {
      if (tipo === 'decisoes' || (!tipo && app.gavetas.aberta() === 'atencao')) {
        return { tipo: 'decisoes', lista: store.atencao(app.filtroAreas(), app.bairros(), app.recorte()).todas };
      }
      if (tipo === 'resumoDia' || (!tipo && app.doca.resumoDia.aberto())) return { tipo: 'resumoDia', resumo: app.doca.dadosResumoDia() };
      return app.telas.focoMaia();
    }
    GC.focoMaiaAtual = () => foco(null);

    // Na captura: os cartões e gavetas têm os próprios cliques; este só olha para [data-maia].
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-maia]');
      if (!b) return;
      e.preventDefault();
      const f = foco(b.dataset.maiaFoco || null);
      app.abrirCopiloto();
      app.perguntar(b.dataset.maia, f ? { foco: f } : {});
    }, true);

    return { foco };
  };
})(window.GC = window.GC || {});
