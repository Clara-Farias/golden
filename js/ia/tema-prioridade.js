(function (GC) {
  // Tema da Maia (IA roteirizada): prioridade. Duas perguntas das ações prontas da caixa da Maia
  // (js/ia/acoes-prontas.js): "O que devo fazer primeiro?" e "Qual bairro está pior hoje?".
  // O gestor do setor vê só a pasta dele. Com uma tela aberta que tem resposta própria (Resumo do dia,
  // Alertas), a resposta da tela vence: ela sabe mais do que a lista de ocorrências.
  const { plural, SEVERIDADE, PESO_SEVERIDADE, bairro, area, nomes } = GC.iaUtil;
  const PONTOS = { critica: 3, alta: 2, media: 1 };
  const EH_BAIRRO = /\bbairros?\b|\bregia\w*/;

  const dele = (ctx) => (o) => !ctx.areasPerfil || ctx.areasPerfil.includes(o.area);
  const horas = (min) => (min >= 60 ? plural(Math.round(min / 60), 'hora', 'horas') : `${min} min`);

  // A mais urgente: crítica antes de alta; entre iguais, a aberta há mais tempo.
  function primeiro(ctx) {
    const lista = (ctx.ocorrencias || []).filter(dele(ctx))
      .sort((a, b) => PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade] || (b.abertaHaMin || 0) - (a.abertaHaMin || 0));
    if (!lista.length) return { texto: 'Nada em aberto agora. É um bom momento para olhar as metas fora do prazo em Indicadores.' };
    const [o, o2] = lista;
    const pode = GC.acoesDisponiveis ? GC.acoesDisponiveis(o) : [];
    const acoes = [];
    if (pode.includes('cobrar')) acoes.push({ rotulo: `📣 Cobrar ${area(o.area).secretaria.nome}`, tipo: 'agir', payload: { ocorrenciaId: o.id, acao: 'cobrar' } });
    else if (pode.includes('priorizar')) acoes.push({ rotulo: '⚡ Priorizar', tipo: 'agir', payload: { ocorrenciaId: o.id, acao: 'priorizar' } });
    acoes.push({ rotulo: 'Ver no mapa', tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } });
    const estourada = GC.estourada && GC.estourada(o) ? ' (prazo estourado)' : '';
    return {
      texto: `Comece por ${o.titulo} (${bairro(o.bairroId).nome}). É ${SEVERIDADE[o.severidade]}, está aberta há ${horas(o.abertaHaMin || 0)}${estourada} e afeta cerca de ${(o.afetados || 0).toLocaleString('pt-BR')} pessoas. Está com a ${area(o.area).secretaria.nome}.${o2 ? ` Depois: ${o2.titulo} (${bairro(o2.bairroId).nome}).` : ''}`,
      acoes,
    };
  }

  // Gravidade das ocorrências abertas por bairro: crítica 3, alta 2, média 1.
  function piorBairro(ctx) {
    const pontos = {};
    (ctx.ocorrencias || []).filter(dele(ctx)).forEach((o) => {
      const p = pontos[o.bairroId] || (pontos[o.bairroId] = { id: o.bairroId, pontos: 0, n: 0, criticas: 0 });
      p.pontos += PONTOS[o.severidade] || 1;
      p.n += 1;
      if (o.severidade === 'critica') p.criticas += 1;
    });
    const r = Object.values(pontos).sort((a, b) => b.pontos - a.pontos || b.criticas - a.criticas);
    if (!r.length) return { texto: 'Nenhuma ocorrência aberta agora: nenhum bairro se destaca.' };
    const [p1, ...resto] = r;
    const sat = !ctx.areasPerfil && GC.data.satisfacaoPorBairro ? GC.data.satisfacaoPorBairro[p1.id] : null;
    const depois = resto.slice(0, 2).map((x) => `${bairro(x.id).nome} (${plural(x.n, 'aberta', 'abertas')})`);
    const nome = bairro(p1.id).nome;
    return {
      texto: `${nome} está pior agora: ${plural(p1.n, 'ocorrência aberta', 'ocorrências abertas')}, ${plural(p1.criticas, 'crítica', 'críticas')}${sat != null ? `, satisfação de ${sat}%` : ''}.${depois.length ? ` Depois vêm ${nomes(depois)}.` : ''} A conta soma a gravidade do que está aberto (crítica 3, alta 2, média 1).`,
      grafico: { tipo: 'barra', titulo: 'Gravidade das ocorrências abertas por bairro', rotulos: r.slice(0, 6).map((x) => bairro(x.id).nome), series: [{ nome: 'Pontos de gravidade', valores: r.slice(0, 6).map((x) => x.pontos) }], unidade: 'pontos' },
      acoes: [{ rotulo: `Como está o bairro ${nome}?`, tipo: 'perguntar', payload: { texto: `Como está o bairro ${nome}?` } }],
    };
  }

  GC.temasIA.push({
    ordem: 180, // empate de palavras-chave: vence o menor
    id: 'prioridade',
    // "pior" inteira para não casar "piorou" (que é do resumo e do "por que piorou?").
    chaves: [{ termo: 'primeiro', peso: 3, inteira: true }, { termo: 'urgente', peso: 3 }, { termo: 'pior', peso: 2, inteira: true }, { termo: 'critico', peso: 1, inteira: true }],
    nome: 'Prioridades de agora',
    assunto: 'do que fazer primeiro',
    exemplo: 'O que devo fazer primeiro?',
    responder(ctx, q, ent) {
      const tela = ctx.foco && (GC.focosIA || {})[ctx.foco.tipo];
      const daTela = tela && ent ? tela.responder(ctx.foco, ent, ctx) : null;
      if (daTela) return daTela;
      return EH_BAIRRO.test(q) ? piorBairro(ctx) : primeiro(ctx);
    },
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.ocorrencias'], consulta: "SELECT * FROM gabinete.ocorrencias WHERE status <> 'resolvida' ORDER BY severidade, aberta_em" },
    base: { periodo: 'em aberto agora', registros: () => GC.data.ocorrencias.length },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
