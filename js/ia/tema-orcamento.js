(function (GC) {
  // Tema da Maia (IA roteirizada): gestão orçamentária (workshop de 18/11). Responde sobre a execução do orçamento,
  // os recursos de fora (federais, estaduais, emendas e convênios) que podem ser devolvidos, os contratos que vencem
  // e as licitações. O foco muda pelo que a pergunta cita. Os números vêm de js/orcamento-gestao.js.
  const { plural, nomes } = GC.iaUtil;
  const R$ = (v) => `R$ ${GC.orcamentoGestao.fmtMi(v)}`;
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id === 'assistencia' ? 'Assistência Social' : 'Prefeitura' }).nome;
  const abrir = (rotulo, area) => ({ rotulo, tipo: 'abrirTela', payload: { rota: { tela: 'orcamento', area: area || null } } });

  GC.temasIA.push({
    ordem: 150,
    id: 'orcamento',
    chaves: [
      { termo: 'orcament', peso: 4 }, { termo: 'dotac', peso: 4 }, { termo: 'empenh', peso: 4 }, { termo: 'liquidad', peso: 3 },
      { termo: 'licitac', peso: 4 }, { termo: 'pregao', peso: 4 }, { termo: 'edital', peso: 3 }, { termo: 'contrato', peso: 2 },
      { termo: 'vencend', peso: 2 }, { termo: 'vencimento', peso: 2 }, { termo: 'convenio', peso: 4 }, { termo: 'emenda', peso: 4 },
      { termo: 'recurso federal', peso: 5 }, { termo: 'recursos federais', peso: 5 }, { termo: 'transferencia', peso: 3 },
      { termo: 'devolv', peso: 3 }, { termo: 'devoluc', peso: 3 }, { termo: 'prestacao de contas', peso: 4 }, { termo: 'gasto', peso: 2 },
      { termo: 'dinheiro', peso: 2 }, { termo: 'verba', peso: 3 }, { termo: 'fnde', peso: 4 }, { termo: 'pac', peso: 2, inteira: true },
    ],
    nome: 'Orçamento e contratos',
    assunto: 'do orçamento, dos recursos de fora, dos contratos e das licitações',
    exemplo: 'Tem recurso federal que pode ser devolvido?',
    disponivel: () => !!(GC.orcamentoGestao && GC.gestao),
    responder(ctx, q = '') {
      const areas = ctx && ctx.areasPerfil && ctx.areasPerfil.length ? ctx.areasPerfil : null;
      const r = GC.orcamentoGestao.resumo({ areas });
      const fala = (...t) => t.some((x) => q.includes(x));
      const foco = fala('contrato', 'vencend', 'vencimento') ? 'contrato'
        : fala('licitac', 'pregao', 'edital') ? 'licitacao'
          : fala('federal', 'convenio', 'emenda', 'transferencia', 'devol', 'prestacao', 'fnde', 'pac', 'verba') ? 'recurso' : 'geral';
      const ex = r.execucao;

      const tExec = `O orçamento ${areas ? `da ${nomeArea(areas[0])}` : 'do ano'} é de ${R$(ex.previstoMi)}: ${ex.empenhadoPct}% empenhado e ${ex.pagoPct}% pago, contra ${ex.esperadoPct}% esperados para agora.${ex.atrasadas.length ? ` Mais atrás: ${nomes(ex.atrasadas.slice(0, 3).map((a) => `${a.nome} (${a.pagoPct}% pago)`))}.` : ' Nenhuma pasta muito atrás.'}`;
      const risco = r.externo.emRisco;
      const tRec = risco.length
        ? `${plural(risco.length, 'recurso de fora corre', 'recursos de fora correm')} risco de devolução, somando ${R$(r.externo.emRiscoMi)}: ${nomes(risco.slice(0, 3).map((x) => `${x.nome} (${x.executadoPct}% executado, prazo em ${x.prazoDias} dias)`))}. O caminho é empenhar o saldo antes do prazo ou pedir prorrogação ao órgão, com justificativa.`
        : r.recursos.length === 1 ? `O recurso de fora (${r.recursos[0].nome}, ${R$(r.externo.totalMi)}) não corre risco de devolução agora.` : r.recursos.length ? `Nenhum dos ${r.recursos.length} recursos de fora (${R$(r.externo.totalMi)}) corre risco de devolução agora.` : 'Não há recurso de fora neste recorte.';
      const sem = r.semCobertura;
      const tCt = sem.length
        ? `${plural(r.vencendo90.length, 'contrato vence', 'contratos vencem')} em 90 dias; ${plural(sem.length, 'não tem', 'não têm')} licitação que termine a tempo: ${nomes(sem.slice(0, 3).map((c) => `${c.nome} (${c.venceDias} dias${c.cobertura === 'sem_licitacao' ? ', sem licitação aberta' : ''})`))}. Sem ação, o caminho vira aditivo de prazo ou contrato emergencial.`
        : `${plural(r.vencendo90.length, 'contrato vence', 'contratos vencem')} em 90 dias, todos com licitação que termina antes.`;
      const abertas = r.licitacoes.filter((l) => l.fase < 4);
      const tLic = `${plural(abertas.length, 'licitação está', 'licitações estão')} em andamento${r.licitacoesRisco.length ? `; ${plural(r.licitacoesRisco.length, 'pode', 'podem')} atrasar contrato ou recurso: ${nomes(r.licitacoesRisco.slice(0, 3).map((l) => `${l.objeto} (${l.faseNome.toLowerCase()})`))}` : ', todas no prazo'}.`;

      const partes = foco === 'recurso' ? [tRec, tExec] : foco === 'contrato' ? [tCt, tLic] : foco === 'licitacao' ? [tLic, tCt] : [tExec, tRec, tCt];
      const grafico = foco === 'recurso'
        ? { tipo: 'barra', titulo: 'Recursos de fora: executado × saldo', rotulos: r.recursos.slice(0, 6).map((x) => x.nome.split(' (')[0].slice(0, 28)), series: [{ nome: 'Executado', valores: r.recursos.slice(0, 6).map((x) => x.executadoMi) }, { nome: 'Saldo', valores: r.recursos.slice(0, 6).map((x) => x.saldoMi) }], unidade: 'R$ mi' }
        : foco === 'contrato' || foco === 'licitacao'
          ? { tipo: 'barra', titulo: 'Dias até o vencimento dos contratos', rotulos: r.contratos.slice(0, 7).map((c) => c.nome.slice(0, 26)), series: [{ nome: 'Dias', valores: r.contratos.slice(0, 7).map((c) => c.venceDias) }], unidade: 'dias' }
          : { tipo: 'barra', titulo: 'Orçamento pago por secretaria (%)', rotulos: ex.areas.map((a) => a.nome), series: [{ nome: 'Pago', valores: ex.areas.map((a) => a.pagoPct) }, { nome: 'Esperado', valores: ex.areas.map(() => ex.esperadoPct) }], unidade: '%' };
      const acoes = [abrir(areas ? 'Abrir o orçamento da pasta' : 'Abrir orçamento e contratos', areas ? areas[0] : null)];
      if (foco !== 'recurso' && risco.length) acoes.push({ rotulo: 'Recursos que podem ser devolvidos', tipo: 'perguntar', payload: { texto: 'Tem recurso federal que pode ser devolvido?' } });
      if (foco !== 'contrato' && sem.length) acoes.push({ rotulo: 'Contratos que vencem sem licitação', tipo: 'perguntar', payload: { texto: 'Quais contratos vencem sem licitação?' } });
      return { texto: partes.join(' '), grafico, acoes };
    },
    origem: { areas: ['infraestrutura', 'saude', 'educacao'], fontes: ['contabilidade.execucao_2026', 'transferegov.termos', 'compras.contratos', 'compras.licitacoes'], consulta: "SELECT t.objeto, t.orgao, t.valor, t.executado, t.prazo_execucao - current_date AS dias FROM transferegov.termos t WHERE t.situacao = 'em_execucao' AND t.executado / t.valor < 0.7 AND t.prazo_execucao - current_date <= 90 ORDER BY dias" },
    base: { periodo: 'exercício 2026', registros: () => { const r = GC.orcamentoGestao.resumo(); return r.recursos.length + r.contratos.length + r.licitacoes.length + r.execucao.areas.length * 12; } },
  });
})(window.GC = window.GC || {});
