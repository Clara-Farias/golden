(function (GC) {
  // Tema da Maia (IA roteirizada): educacao. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, area, maisGrave, camada, unicos, pct, nomes, soma } = GC.iaUtil;

  // Educação com a rede escolar carregada: professores faltando, escola mais grave, evasão e escolaridade.
  function educacaoDaRede(ctx) {
    const r = GC.educacao.resumo();
    const top = r.escolas[0];
    const PROSA = {
      professor: () => `faltam ${top.faltando} professores`,
      evasao: () => `a evasão chegou a ${pct(top.evasaoPct)}`,
      frequencia: () => `a frequência caiu para ${top.frequenciaPct}%`,
      fila: () => `há ${top.fila} crianças na fila`,
      lotacao: () => `está com ${top.ocupacaoPct}% da capacidade`,
    };
    const motivos = top.motivos.filter((m) => m.critico).map((m) => PROSA[m.tipo]());
    const faltam = r.escolas.filter((x) => x.faltando > 0);
    const oc = maisGrave(ctx, (x) => x.area === 'educacao' && x.bairroId === top.bairroId);
    return {
      texto: `A rede tem ${r.alunos.toLocaleString('pt-BR')} alunos em ${r.escolas.length} escolas e faltam ${r.faltando} professores (${r.aulasPerdidasSemana.toLocaleString('pt-BR')} aulas perdidas por semana). A situação mais grave é na ${top.nome}${motivos.length ? `: ${nomes(motivos)}` : ''}.${oc ? ` Hoje há um agravante: ${oc.titulo}.` : ''} A evasão média está em ${pct(r.evasaoPct)}${r.evasaoAlta.length ? `, acima de 4% em ${nomes(r.evasaoAlta.map((x) => x.nome))}` : ''}, e a frequência em ${pct(r.frequenciaPct)}. ${pct(r.alfabetizacao3anoPct)} das crianças estão alfabetizadas no 3º ano; entre os adultos, ${pct(r.cidade.ensinoMedio25)} concluíram o ensino médio.`,
      ...(faltam.length ? { grafico: { tipo: 'barra', titulo: 'Professores faltando por escola', rotulos: faltam.map((x) => x.nome), series: [{ nome: 'Professores faltando', valores: faltam.map((x) => x.faltando) }], unidade: 'professores' } } : {}),
      mapa: { tipo: 'destaque', bairros: unicos(r.escolas.filter((x) => x.situacao === 'critica').map((x) => x.bairroId).concat(top.bairroId)), legenda: 'Bairros com escola em situação crítica' },
      acoes: [camada(`Ver ${top.nome} no mapa`, 'escolas', top.id), ...(oc ? [{ rotulo: `Ver no mapa: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
    };
  }

  GC.temasIA.push({
    ordem: 130, // empate de palavras-chave: vence o menor
    id: 'educacao',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['escola', 'educa', { termo: 'evasao', peso: 3 }, 'matricula', 'aula', 'aluno', 'professor', { termo: 'alfabet', peso: 3 }, 'ensino medio', 'creche', { termo: 'fila', peso: 1 }],
    // Pergunta de volta ("Você quer saber das escolas e creches ou …?") e "Você quis dizer…".
    nome: 'Escolas e creches',
    assunto: 'das escolas e creches',
    exemplo: 'Onde faltam professores?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'educacao',
    responder(ctx) {
      if (GC.educacao) return educacaoDaRede(ctx);
      const f = GC.data.series.frequenciaEscolar;
      const ord = Object.entries(f).sort((a, b) => a[1] - b[1]);
      const media = Math.round(Object.values(f).reduce((s, n) => s + n, 0) / ord.length);
      return {
        texto: `A frequência escolar média da rede está em ${media}%. O ponto de atenção é ${bairro(ord[0][0]).nome} (${ord[0][1]}%).${(() => { const o = maisGrave(ctx, (x) => x.area === 'educacao' && x.bairroId === ord[0][0]); return o ? ` Hoje há um agravante: ${o.titulo}.` : ''; })()}`,
        grafico: { tipo: 'barra', titulo: 'Frequência escolar por bairro', rotulos: ord.map(([id]) => bairro(id).nome), series: [{ nome: 'Frequência', valores: ord.map(([, n]) => n) }], unidade: '%' },
        mapa: { tipo: 'destaque', bairros: [ord[0][0]], legenda: 'Menor frequência escolar' },
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['educacao'], fontes: ['educacao.frequencia', 'planejamento.bairros'], consulta: 'SELECT bairro, AVG(frequencia_pct) FROM educacao.frequencia WHERE mes = mes_atual() GROUP BY bairro ORDER BY 2' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'mês atual', registros: () => (GC.educacao ? GC.educacao.resumo().alunos : soma(GC.data.series.frequenciaEscolar)) },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'frequencia_escolar_bairro < 92%',
  });
})(window.GC = window.GC || {});
