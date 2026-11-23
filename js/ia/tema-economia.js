(function (GC) {
  // Tema da Maia (IA roteirizada): economia local (empresas abertas e fechadas, emprego com carteira e a fila
  // de alvarás). O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave; a resposta muda o foco pelo
  // que a pergunta cita (alvará, emprego ou empresas).
  const { plural, camada, nomes } = GC.iaUtil;
  const sinal = (n) => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;

  GC.temasIA.push({
    ordem: 155, // empate de palavras-chave: vence o menor
    id: 'economia',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [
      { termo: 'alvara', peso: 4 }, { termo: 'empresa', peso: 3 }, { termo: 'emprego', peso: 3 }, { termo: 'desempreg', peso: 3 },
      { termo: 'caged', peso: 4 }, { termo: 'carteira assinada', peso: 4 }, { termo: 'com carteira', peso: 3 },
      { termo: 'economia', peso: 3 }, { termo: 'economic', peso: 3 }, { termo: 'cnpj', peso: 4 }, { termo: 'comercio', peso: 2 },
      { termo: 'vigilancia sanitaria', peso: 3 }, { termo: 'uso do solo', peso: 3 },
    ],
    // Pergunta de volta ("Você quer saber de … ou …?") e "Você quis dizer…".
    nome: 'Economia local',
    assunto: 'das empresas, do emprego e dos alvarás',
    exemplo: 'Quantos alvarás estão parados na fila?',
    disponivel: () => !!GC.economia,
    responder(ctx, q = '') {
      const r = GC.economia.resumo();
      const c = r.cidade;
      const fala = (t) => q.includes(t);
      const alvaraPrimeiro = fala('alvara') || fala('vigilancia') || fala('bombeiro') || fala('uso do solo') || fala('licenc');
      const empregoPrimeiro = !alvaraPrimeiro && (fala('empreg') || fala('carteira') || fala('caged') || fala('vaga'));
      const top = r.atrasados[0];
      const fechando = r.fechandoMais;
      const piorRegiao = r.regioes[r.regioes.length - 1];

      const tAlvara = r.atrasados.length
        ? `${plural(r.atrasados.length, 'alvará está parado', 'alvarás estão parados')} além do prazo de ${r.metaDias} dias, de ${r.fila.length} na fila, segurando ${plural(r.vagasTravadas, 'vaga prevista', 'vagas previstas')}.${r.gargalo ? ` O gargalo é ${r.gargalo.nome} (${plural(r.gargalo.atrasados, 'pedido', 'pedidos')}).` : ''} O mais antigo é ${top.nome} (${top.atividade.toLowerCase()}), ${top.diasNaFila} dias na fila, parado em ${top.etapaNome}: ${top.pendencia.charAt(0).toLowerCase()}${top.pendencia.slice(1)}.`
        : `Nenhum alvará parado além do prazo de ${r.metaDias} dias (${r.fila.length} na fila).`;
      const melhorRegiao = r.regioes[0];
      const tEmprego = `Saldo de vagas com carteira: ${sinal(c.empregosMes)} no último mês (${sinal(c.empregosMesAnterior)} no anterior) e ${sinal(c.empregos12)} em 12 meses.${melhorRegiao ? ` ${melhorRegiao.nome} puxa o saldo (${sinal(melhorRegiao.empregos12)})${piorRegiao !== melhorRegiao && piorRegiao.empregos12 < 0 ? `; ${piorRegiao.nome} fechou vagas (${sinal(piorRegiao.empregos12)})` : ''}.` : ''}`;
      const tEmpresas = `Em 12 meses, abriram ${c.abertas12.toLocaleString('pt-BR')} empresas e fecharam ${c.fechadas12.toLocaleString('pt-BR')}: saldo de ${sinal(c.saldo12)}.${fechando.length ? ` Fecham mais do que abrem: ${nomes(fechando.map((b) => `${b.nome} (${sinal(b.saldo12)})`))}.` : ''}`;

      const partes = alvaraPrimeiro ? [tAlvara, tEmpresas] : empregoPrimeiro ? [tEmprego, tEmpresas] : [tEmpresas, tEmprego, tAlvara];
      const grafico = alvaraPrimeiro
        ? { tipo: 'barra', titulo: 'Alvarás na fila por etapa', rotulos: r.porEtapa.map((e) => e.nome), series: [{ nome: 'Além do prazo', valores: r.porEtapa.map((e) => e.atrasados) }, { nome: 'Na fila', valores: r.porEtapa.map((e) => e.total) }], unidade: 'pedidos' }
        : empregoPrimeiro
          ? { tipo: 'barra', titulo: 'Saldo de vagas com carteira por mês', rotulos: r.meses, series: [{ nome: 'Saldo', valores: c.serieEmpregos }], unidade: 'vagas' }
          : { tipo: 'linha', titulo: 'Empresas abertas e fechadas por mês', rotulos: r.meses, series: [{ nome: 'Abertas', valores: c.serieAbertas }, { nome: 'Fechadas', valores: c.serieFechadas }], unidade: 'empresas' };
      const destaque = empregoPrimeiro
        ? (piorRegiao && piorRegiao.empregos12 < 0 ? { bairros: piorRegiao.bairros, legenda: `${piorRegiao.nome}: fechou vagas com carteira` } : null)
        : (fechando.length ? { bairros: fechando.map((b) => b.bairroId), legenda: 'Bairros que fecham mais empresas do que abrem' } : null);
      const acoes = [];
      if (alvaraPrimeiro && top) acoes.push(camada(`Ver o alvará de ${top.nome} no mapa`, 'economia', top.id));
      else if (fechando.length) acoes.push(camada(`Ver ${fechando[0].nome} no mapa`, 'economia', fechando[0].id));
      else acoes.push(camada('Ver a economia no mapa', 'economia'));
      return {
        texto: partes.join(' '),
        grafico,
        ...(destaque ? { mapa: { tipo: 'destaque', bairros: destaque.bairros, legenda: destaque.legenda } } : {}),
        acoes,
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    // Sem secretaria de desenvolvimento econômico: o alvará passa pela Saúde (Vigilância) e pela Infraestrutura (uso do solo).
    origem: { areas: ['infraestrutura', 'saude'], fontes: ['receita.cnpj_municipio', 'mte.caged', 'licenciamento.alvaras'], consulta: "SELECT a.protocolo, a.atividade, a.bairro, a.etapa, current_date - a.pedido_em AS dias FROM licenciamento.alvaras a WHERE a.situacao = 'em_analise' AND current_date - a.pedido_em > 30 ORDER BY dias DESC" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 12 meses', registros: () => { const r = GC.economia.resumo(); return r.cidade.abertas12 + r.cidade.fechadas12 + r.fila.length; } },
  });
})(window.GC = window.GC || {});
