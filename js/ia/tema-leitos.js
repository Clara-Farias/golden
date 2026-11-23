(function (GC) {
  // Tema da Maia (IA roteirizada): leitos. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { plural, agora, camada, unicos, pct } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 30, // empate de palavras-chave: vence o menor
    id: 'leitos',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'leito', peso: 3 }, { termo: 'uti', peso: 3, inteira: true }, { termo: 'internac', peso: 3 }, 'hospital', { termo: 'upa', peso: 3, inteira: true }, 'vaga de'],
    // Pergunta de volta ("Você quer saber dos leitos e da UTI ou …?") e "Você quis dizer…".
    nome: 'Leitos',
    assunto: 'dos leitos e da UTI',
    exemplo: 'Como estão os leitos de UTI?',
    disponivel: () => !!GC.leitos,
    responder(ctx) {
      const r = GC.leitos.resumo();
      const top = r.unidades[0];
      // Transferência só para o mesmo tipo de leito crítico: UTI adulto não vai para UTI neonatal nem para sala vermelha.
      const tipoUti = (top.grupos.find((g) => g.uti) || {}).rotulo;
      const vagasUti = (u) => u.grupos.filter((g) => g.uti && g.rotulo === tipoUti).reduce((s, g) => s + g.total - g.ocupados, 0);
      const folga = tipoUti && r.unidades.filter((u) => u.id !== top.id && vagasUti(u) > 0).sort((a, b) => vagasUti(b) - vagasUti(a))[0];
      const oc = top.ocorrenciaId && (ctx.ocorrencias || []).find((o) => o.id === top.ocorrenciaId);
      const apertadas = r.unidades.filter((u) => u.situacao !== 'ok');
      return {
        texto: `A rede está com ${r.pct}% dos leitos ocupados (${r.livres} livres de ${r.total}) e a UTI com ${r.utiPct}% (${r.utiLivres} vagas). O ponto crítico é ${top.nome}: ${top.utiPct !== null ? `UTI com ${top.utiPct}% e ` : ''}${top.pct}% no geral.${folga ? ` Dá para transferir pacientes para ${folga.nome}, que tem ${plural(vagasUti(folga), 'vaga', 'vagas')} de ${tipoUti}.` : ''} Hoje foram ${r.atendimentosHoje.total.toLocaleString('pt-BR')} atendimentos na rede.`,
        grafico: { tipo: 'barra', titulo: 'Ocupação dos leitos por unidade', rotulos: r.unidades.map((u) => u.nome), series: [{ nome: 'Geral', valores: r.unidades.map((u) => u.pct) }, { nome: 'UTI', valores: r.unidades.map((u) => u.utiPct || 0) }], unidade: '%' },
        ...(apertadas.length ? { mapa: { tipo: 'destaque', bairros: unicos(apertadas.map((u) => u.bairroId)), legenda: 'Bairros com unidade de saúde acima de 80%' } } : {}),
        acoes: [camada(`Ver ${top.nome} no mapa`, 'leitos', top.id), ...(oc ? [{ rotulo: `Ver o alerta: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['saude'], fontes: ['saude.central_leitos', 'saude.atendimentos', 'planejamento.bairros'], consulta: 'SELECT unidade, tipo_leito, SUM(total), SUM(ocupados) FROM saude.central_leitos WHERE atualizado_em >= agora() - 1h GROUP BY unidade, tipo_leito' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'última hora', registros: () => GC.leitos.resumo().unidades.reduce((s, u) => s + (u.grupos || []).length, 0) },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'ocupacao_uti > 90% OU ocupacao_leitos > 85%',
  });
})(window.GC = window.GC || {});
