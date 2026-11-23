(function (GC) {
  // Tema da Maia (IA roteirizada): segurança no trânsito (acidentes, pontos críticos, atropelamentos perto de
  // escolas). O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave e completa a resposta com origem,
  // base, selo e alerta daqui. Congestionamento e semáforo continuam no tema mobilidade; crime, no segurança.
  const { plural, bairro, camada, unicos, sinal, minuscula } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 115, // entre segurança (110) e mobilidade (120); empate de palavras-chave: vence o menor
    id: 'transito',
    // Só palavras próprias do assunto: "trânsito" sozinho e "semáforo" ficam com a mobilidade.
    chaves: [
      { termo: 'acident', peso: 3 }, { termo: 'atropel', peso: 3 }, { termo: 'colis', peso: 3 },
      { termo: 'faixa elevada', peso: 3 }, { termo: 'seguranca no transito', peso: 4 }, { termo: 'seguranca viaria', peso: 4 },
      { termo: 'mortes no transito', peso: 4 },
    ],
    nome: 'Segurança no trânsito',
    assunto: 'dos acidentes e atropelamentos',
    exemplo: 'Onde há mais acidentes de trânsito?',
    disponivel: () => !!GC.transito,
    responder() {
      const r = GC.transito.resumo();
      const t = r.tendencia;
      const pior = r.pontos[0];
      const escola = r.pertoEscola[0];
      const escolas = r.pertoEscola.length
        ? ` ${plural(r.atropelamentosPertoEscola, 'atropelamento foi', 'atropelamentos foram')} a menos de ${GC.data.transito.raioEscolaM} m de uma escola, em ${plural(r.pertoEscola.length, 'ponto', 'pontos')}. O mais grave é ${escola.nome}, perto da ${escola.escola.nome} (${plural(escola.atropelamentos, 'atropelamento', 'atropelamentos')}). Sugiro ${minuscula(escola.medida)}.`
        : ' Nenhum atropelamento perto de escola no período.';
      const top = r.pontos.slice(0, 5);
      return {
        texto: `Foram ${r.acidentes} acidentes nos últimos ${r.periodo}, ${r.comVitima} com vítima e ${plural(r.mortes, 'morte', 'mortes')}. No último semestre foram ${t.atual}, ${sinal(t.variacaoPct)} sobre os 6 meses anteriores. O ponto mais grave é ${pior.nome} (${bairro(pior.bairroId).nome}), com ${pior.acidentes} acidentes${pior.mortes ? ` e ${plural(pior.mortes, 'morte', 'mortes')}` : ''}.${escolas}`,
        grafico: { tipo: 'barra', titulo: 'Acidentes por ponto crítico · 12 meses', rotulos: top.map((x) => x.nome), series: [{ nome: 'Com vítima', valores: top.map((x) => x.comVitima) }, { nome: 'Sem vítima', valores: top.map((x) => x.semVitima) }], unidade: 'acidentes' },
        ...(r.pertoEscola.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.pertoEscola.map((x) => x.bairroId)), legenda: 'Bairros com atropelamento perto de escola' } } : {}),
        acoes: [
          ...(escola ? [camada(`Ver ${escola.nome} no mapa`, 'transito', escola.id)] : []),
          ...(pior && (!escola || pior.id !== escola.id) ? [camada(`Ver ${pior.nome} no mapa`, 'transito', pior.id)] : []),
        ],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['mobilidade'], fontes: ['mobilidade.acidentes', 'saude.samu_atendimentos', 'educacao.escolas'], consulta: 'SELECT ponto, COUNT(*) FILTER (WHERE vitimas > 0) AS com_vitima, SUM(mortes), COUNT(*) FILTER (WHERE atropelamento) FROM mobilidade.acidentes WHERE data >= hoje() - 365 GROUP BY ponto ORDER BY 2 DESC' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 12 meses', registros: () => GC.transito.resumo().acidentes },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'atropelamentos_perto_escola_90d >= 2',
  });
})(window.GC = window.GC || {});
