(function (GC) {
  // Satisfação dos moradores com fonte única: a pesquisa (GC.data, 1.840 respostas) somada às avaliações feitas
  // no portal depois de um pedido resolvido (js/pedidos.js; nota 4 ou 5 = satisfeito). O resultado é gravado no
  // lugar, em GC.data.indicadoresBase.satisfacaoPct e GC.data.satisfacaoPorBairro: indicadores, cruzamento,
  // widgets, relatórios e Maia continuam lendo de lá. As avaliações da demonstração inicial não entram na conta
  // (já fazem parte da pesquisa); sem avaliação nova, os números são os de antes.
  const RESPOSTAS_PESQUISA = 1840;
  let pesquisa = null;
  const guardarPesquisa = () => {
    if (pesquisa) return pesquisa;
    const ib = GC.data.indicadoresBase;
    pesquisa = { cidade: ib.satisfacaoPct, porBairro: Object.assign({}, GC.data.satisfacaoPorBairro), fonte: ib.satisfacaoFonte };
    GC.data.satisfacaoPesquisa = pesquisa;
    return pesquisa;
  };
  const satisfeito = (a) => (a.nota >= 4 ? 100 : 0);
  const misturar = (base, peso, lista) => Math.round((base * peso + lista.reduce((s, a) => s + satisfeito(a), 0)) / (peso + lista.length));

  GC.satisfacao = {
    // Recalcula a partir do registro de pedidos (o do navegador, ou outro nos testes).
    recalcular(pedidos = GC.pedidos) {
      const p = guardarPesquisa();
      const novas = pedidos ? pedidos.avaliacoes({ novas: true }) : [];
      const bairros = GC.data.bairros;
      const pesoBairro = RESPOSTAS_PESQUISA / bairros.length;
      bairros.forEach((b) => {
        if (p.porBairro[b.id] === undefined) return;
        GC.data.satisfacaoPorBairro[b.id] = misturar(p.porBairro[b.id], pesoBairro, novas.filter((a) => a.bairroId === b.id));
      });
      GC.data.indicadoresBase.satisfacaoPct = misturar(p.cidade, RESPOSTAS_PESQUISA, novas);
      GC.data.indicadoresBase.satisfacaoFonte = novas.length
        ? `${p.fonte} + ${novas.length} avaliaç${novas.length > 1 ? 'ões' : 'ão'} do portal`
        : p.fonte;
      return { cidade: GC.data.indicadoresBase.satisfacaoPct, novas: novas.length };
    },
    // Avaliações do portal em separado (uma nota mexe pouco numa base grande): média de 1 a 5 e quantas.
    // { bairroId, dias }
    resumoAvaliacoes({ bairroId = null, dias = 30 } = {}, pedidos = GC.pedidos) {
      const lista = pedidos ? pedidos.avaliacoes({ bairroId, dias }) : [];
      const media = lista.length ? lista.reduce((s, a) => s + a.nota, 0) / lista.length : null;
      return { n: lista.length, media, resolvidoPct: lista.length ? Math.round((lista.filter((a) => a.resolvido).length / lista.length) * 100) : null };
    },
  };

  if (GC.pedidos) {
    GC.satisfacao.recalcular();
    GC.pedidos.assinar((e) => { if (e.tipo === 'avaliacao' || e.tipo === 'recarga') GC.satisfacao.recalcular(); });
  }
})(window.GC = window.GC || {});
