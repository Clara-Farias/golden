(function (GC) {
  // Tema da Maia (IA roteirizada): energia. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, ranking, barraPorBairro, calor, focarPrimeira, casos30d } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 90, // empate de palavras-chave: vence o menor
    id: 'energia',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['energia', 'luz', { termo: 'apagao', peso: 3 }, { termo: 'queda', peso: 1 }, 'eletric'],
    // Palavras que pedem outro assunto: tiram este tema (a não ser que ele tenha casado uma chave de peso 3).
    exclui: ['arvore', 'barreira', 'muro', 'ponte'],
    // Pergunta de volta ("Você quer saber da falta de energia ou …?") e "Você quis dizer…".
    nome: 'Energia',
    assunto: 'da falta de energia',
    exemplo: 'Quais bairros têm mais falta de energia?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'infraestrutura',
    responder(ctx) {
      const hist = GC.data.historico30d.infraestrutura;
      const [topId, topN] = ranking(hist)[0];
      const ativos = (ctx.ocorrencias || []).filter((o) => o.tipo === 'queda de energia');
      const afetados = ativos.reduce((s, o) => s + o.afetados, 0);
      const mapa = calor('infraestrutura', ctx, 'Quedas de energia — últimos 30 dias');
      return {
        texto: `${bairro(topId).nome} lidera com ${topN} ocorrências de energia nos últimos 30 dias. Neste momento são ${ativos.length} quedas ativas afetando cerca de ${afetados.toLocaleString('pt-BR')} pessoas. Sugiro pedir à concessionária um plano para a rede de ${bairro(topId).nome}.`,
        grafico: barraPorBairro(hist, 'Ocorrências de energia por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
        mapa,
        acoes: focarPrimeira(ctx, (o) => o.tipo === 'queda de energia'),
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['infraestrutura'], fontes: ['infraestrutura.ocorrencias', 'concessionaria.interrupcoes', 'planejamento.bairros'], consulta: "SELECT bairro, COUNT(*), SUM(imoveis_afetados) FROM infraestrutura.ocorrencias WHERE tipo = 'queda de energia' AND data >= hoje() - 30 GROUP BY bairro" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 30 dias', registros: () => casos30d('infraestrutura') },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'quedas_energia_bairro > média_30d × 1,3',
  });
})(window.GC = window.GC || {});
