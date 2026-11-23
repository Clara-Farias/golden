(function (GC) {
  // Tema da Maia (IA roteirizada): seguranca. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, area, ranking, calor, maisGrave, focarPrimeira, agora, camada, sinal, pct, minuscula, soma } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 110, // empate de palavras-chave: vence o menor
    id: 'seguranca',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['crime', { termo: 'criminal', peso: 3 }, 'seguranc', 'violenc', { termo: 'roubo', peso: 3 }, { termo: 'assalto', peso: 3 }],
    // Pergunta de volta ("Você quer saber da segurança ou …?") e "Você quis dizer…".
    nome: 'Segurança',
    assunto: 'da segurança',
    exemplo: 'Como evoluiu a criminalidade?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'seguranca',
    responder(ctx) {
      const s = GC.data.series.criminalidadeMensal;
      const variacao = Math.round(((s.valores[s.valores.length - 1] - s.valores[0]) / s.valores[0]) * 100);
      // Com os B.O.s carregados: bairro mais crítico, hoje × média e a camada fixa de calor.
      const bo = GC.seguranca && GC.seguranca.resumo();
      const critico = bo ? bairro(bo.bairroCritico.id).nome : bairro(ranking(GC.data.historico30d.seguranca)[0][0]).nome;
      return {
        texto: `A criminalidade caiu ${Math.abs(variacao)}% desde maio (${s.valores[0]} → ${s.valores[s.valores.length - 1]} ocorrências/mês), mas outubro teve leve alta. ${critico} concentra os registros do mês${bo ? ` (${bo.bairroCritico.pct}% dos B.O.s). Hoje já são ${bo.hoje} B.O.s até ${bo.ateHora}, ${sinal(bo.hojeVariacaoPct)} sobre a média de ${bo.mediaDia.toLocaleString('pt-BR')} por dia; o tipo mais comum é ${minuscula(bo.porTipo[0].tipo)}` : ''}.${agora(maisGrave(ctx, (o) => o.area === 'seguranca'))}`,
        grafico: { tipo: 'linha', titulo: 'Ocorrências de segurança por mês', rotulos: s.rotulos, series: [{ nome: 'Ocorrências', valores: s.valores }], unidade: 'ocorrências' },
        mapa: calor('seguranca', ctx, 'Ocorrências de segurança — últimos 30 dias'),
        acoes: [...focarPrimeira(ctx, (o) => o.area === 'seguranca'), ...(bo ? [camada('Ligar o mapa de calor dos B.O.s', 'calor-bo')] : [])],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['seguranca'], fontes: ['seguranca.ocorrencias', 'seguranca.boletins'], consulta: "SELECT mes, COUNT(*) FROM seguranca.ocorrencias WHERE data >= '2026-05-01' GROUP BY mes ORDER BY mes" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'mai a out/2026', registros: () => soma(GC.data.series.criminalidadeMensal.valores) },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'ocorrencias_seguranca_bairro > média_4_semanas × 1,3',
  });
})(window.GC = window.GC || {});
