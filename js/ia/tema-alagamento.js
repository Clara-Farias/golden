(function (GC) {
  // Tema da Maia (IA roteirizada): alagamento. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, ranking, barraPorBairro, calor, focarPrimeira, casos30d } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 80, // empate de palavras-chave: vence o menor
    id: 'alagamento',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['alag', { termo: 'enchent', peso: 3 }, 'chuva', { termo: 'inund', peso: 3 }],
    // Pergunta de volta ("Você quer saber dos alagamentos do mês ou …?") e "Você quis dizer…".
    nome: 'Alagamentos',
    assunto: 'dos alagamentos do mês',
    exemplo: 'Onde mais alaga este mês?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'defesa_civil',
    responder(ctx) {
      const hist = GC.data.historico30d.defesa_civil;
      const total = Object.values(hist).reduce((s, n) => s + n, 0);
      const [topId, topN] = ranking(hist)[0];
      const ativos = (ctx.ocorrencias || []).filter((o) => o.tipo === 'alagamento');
      const mapa = calor('defesa_civil', ctx, 'Alagamentos — últimos 30 dias');
      return {
        texto: `${bairro(topId).nome} concentrou ${Math.round((topN / total) * 100)}% dos alagamentos nos últimos 30 dias (${topN} de ${total}). Agora há ${ativos.length} alagamentos ativos, ${ativos.filter((o) => o.severidade === 'critica').length} críticos. Destaquei as zonas de maior incidência no mapa.`,
        grafico: barraPorBairro(hist, 'Alagamentos por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
        mapa,
        acoes: [{ rotulo: 'Mostrar mapa de calor', tipo: 'mostrarMapa', payload: { mapa } }, ...focarPrimeira(ctx, (o) => o.tipo === 'alagamento')],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['defesa_civil'], fontes: ['defesa_civil.ocorrencias', 'defesa_civil.sensores_pluviometricos', 'planejamento.bairros'], consulta: "SELECT bairro, COUNT(*) FROM defesa_civil.ocorrencias WHERE tipo = 'alagamento' AND data >= hoje() - 30 GROUP BY bairro ORDER BY 2 DESC" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 30 dias', registros: () => casos30d('defesa_civil') },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'casos_alagamento_bairro > média_30d × 1,3',
  });
})(window.GC = window.GC || {});
