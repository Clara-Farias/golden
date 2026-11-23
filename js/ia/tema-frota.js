(function (GC) {
  // Tema da Maia (IA roteirizada): frota. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { plural, camada, unicos } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 70, // empate de palavras-chave: vence o menor
    // Antes de "mobilidade": "quantos ônibus estão rodando?" é frota, não trânsito.
    id: 'frota',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['frota', { termo: 'ambulanc', peso: 3 }, { termo: 'samu', peso: 3, inteira: true }, 'garagem', 'manutenc', 'rodando', { termo: 'concession', peso: 3 }, { termo: 'espera no ponto', peso: 3 }, { termo: 'ponto de onibus', peso: 3 }, { termo: 'linha', peso: 1 }],
    // Pergunta de volta ("Você quer saber da frota de ônibus e ambulâncias ou …?") e "Você quis dizer…".
    nome: 'Frota e ônibus',
    assunto: 'da frota de ônibus e ambulâncias',
    exemplo: 'Quantos ônibus e ambulâncias estão rodando?',
    disponivel: () => !!GC.frota,
    responder(ctx) {
      const r = GC.frota.resumo();
      const o = r.onibus;
      const a = r.ambulancias;
      const pior = r.linhas[0];
      const oc = pior && pior.ocorrenciaId && (ctx.ocorrencias || []).find((x) => x.id === pior.ocorrenciaId);
      const vencidas = o.preventivaVencida + a.preventivaVencida;
      return {
        texto: `Hoje rodam ${o.operando} de ${o.necessarios} ônibus necessários (${o.disponibilidadePct}%, meta do contrato ${o.metaDisponibilidadePct}%) e ${a.operando} de ${a.necessarios} ambulâncias (${a.disponibilidadePct}%). Em manutenção: ${o.corretiva} ônibus e ${plural(a.corretiva, 'ambulância', 'ambulâncias')}; ${vencidas} veículos rodam com a preventiva vencida.${o.foraDoContrato ? ` A ${o.operadora} está abaixo do contrato (${o.viagensPct}% das viagens, meta ${o.metaViagensPct}%): cabe notificar, com multa estimada de R$ ${o.multaEstimadaMil} mil no mês.` : ''}${pior && pior.situacao !== 'ok' ? ` A pior espera nos pontos é na ${pior.nome}: ${pior.esperaMin} min, para ${pior.intervaloMin} programados.` : ''} O SAMU está com tempo de resposta de ${a.tempoRespostaMin} min (meta ${a.metaTempoRespostaMin}).`,
        grafico: { tipo: 'barra', titulo: 'Espera nos pontos × intervalo programado', rotulos: r.linhas.map((x) => `Linha ${x.id}`), series: [{ nome: 'Espera real', valores: r.linhas.map((x) => x.esperaMin) }, { nome: 'Programado', valores: r.linhas.map((x) => x.intervaloMin) }], unidade: 'min' },
        ...(r.linhasCriticas.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.linhasCriticas.flatMap((x) => x.bairros)), legenda: 'Bairros servidos por linha com espera crítica' } } : {}),
        acoes: [...(pior ? [camada(`Ver a ${pior.nome} no mapa`, 'frota', pior.id)] : []), ...(oc ? [{ rotulo: `Ver o alerta: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['mobilidade'], fontes: ['mobilidade.gps_onibus', 'concessao.disponibilidade_frota', 'samu.frota'], consulta: "SELECT frota, status, COUNT(*) FROM (SELECT 'onibus' AS frota, status FROM concessao.disponibilidade_frota UNION ALL SELECT 'ambulancia', status FROM samu.frota) f WHERE data = hoje() GROUP BY frota, status" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'hoje', registros: () => { const f = GC.frota.resumo(); return f.onibus.total + f.ambulancias.total; } },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'disponibilidade_frota < meta_contrato OU espera_ponto > 1,8 × intervalo_programado',
  });
})(window.GC = window.GC || {});
