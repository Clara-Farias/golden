(function (GC) {
  // Tema da Maia (IA roteirizada): desempenho. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { area, ranking, agora, soma } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 160, // empate de palavras-chave: vence o menor
    id: 'desempenho',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'desempenh', peso: 3 }, 'prazo', { termo: 'atras', peso: 1 }, 'ranking', { termo: 'meta', peso: 1, inteira: true }],
    // Pergunta de volta ("Você quer saber dos prazos das secretarias ou …?") e "Você quis dizer…".
    nome: 'Prazos das secretarias',
    assunto: 'dos prazos das secretarias',
    exemplo: 'Quem está atrasando os prazos?',
    responder(contexto) {
      const d = contexto.desempenho;
      if (!d) return { texto: 'Ainda não tenho os números de desempenho.' };
      const pior = d.secretarias[0];
      const nome = area(pior.area).nome;
      const sobre = pior.pior
        ? `Quem mais atrasa é ${nome}: ${pior.noPrazoPct}% no prazo (meta 85%), tempo médio de ${pior.tempoMedioH.toLocaleString('pt-BR')} h.`
        : 'Todas as secretarias estão dentro da meta de 85% no prazo.';
      const agora = d.secretarias.filter((s) => s.atrasadas).map((s) => `${area(s.area).nome} (${s.atrasadas})`);
      return {
        texto: `Nos últimos 30 dias a cidade resolveu ${d.resumo.resolvidas} ocorrências, ${d.resumo.noPrazoPct}% no prazo. ${sobre}${agora.length ? ` Com prazo estourado agora: ${agora.join(', ')}.` : ''}`,
        grafico: { tipo: 'barra', titulo: '% resolvido no prazo — 30 dias', rotulos: d.secretarias.map((s) => area(s.area).nome), series: [{ nome: 'No prazo', valores: d.secretarias.map((s) => s.noPrazoPct) }], unidade: '%' },
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gestao.ocorrencias', 'gestao.prazos_sla'], consulta: 'SELECT secretaria, COUNT(*) AS resolvidas, AVG(resolvida_no_prazo) * 100 AS no_prazo_pct, AVG(horas_ate_resolver) FROM gestao.ocorrencias JOIN gestao.prazos_sla USING (gravidade) WHERE resolvida_em >= hoje() - 30 GROUP BY secretaria ORDER BY 3' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 30 dias', registros: () => soma(Object.fromEntries(Object.entries(GC.data.desempenho30d).map(([k, d]) => [k, d.resolvidas]))) },
  });
})(window.GC = window.GC || {});
