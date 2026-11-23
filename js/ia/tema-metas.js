(function (GC) {
  // Tema da Maia (IA roteirizada): metas pactuadas, planos de ação e a pauta da reunião de resultados
  // (js/pactos.js, js/reuniao.js). O secretário pergunta da pasta dele; o prefeito, das metas que esperam ele
  // ou da pasta citada na pergunta ("reunião com a Saúde").
  const { plural, nomes } = GC.iaUtil;
  const REUNIAO = /reuni|pauta/;
  const VENCEU = /venc|cumpri|apura/; // "quais metas venceram?", "a meta foi cumprida?"
  const ACOES = /aco(es|ao) (do|de) plano|plano de acao.*atras|atrasad.*plano/; // 'quais ações do plano estão atrasadas?'
  const GOVERNO = /plano de governo|metas do governo|compromisso/; // 'quais metas do plano de governo estão críticas?'
  const RITMO = /ritmo|caminho/; // "a Saúde está no ritmo da meta?"
  const nomeArea = (id) => (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome;
  const ficha = (id) => (GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || { nome: id, unidade: '' };
  const fmt = (v, u) => (GC.formatarIndicador ? GC.formatarIndicador(v, u) : v);
  const mesBr = (m) => m.split('-').reverse().join('/');
  // Uma meta apurada em uma frase: "Espera média nas UBS (Saúde): meta 65 min até 10/2026, apurado 71 min, não cumprida".
  const apurada = (c, comPasta) => { const i = ficha(c.indicadorId); return `${i.nome}${comPasta ? ` (${nomeArea(c.area)})` : ''}: meta ${fmt(c.meta, i.unidade)} até ${mesBr(c.prazo)}, apurado ${fmt(c.valor, i.unidade)}, ${c.resultado === 'cumprida' ? 'cumprida' : 'não cumprida'}`; };

  function areaDaPergunta(q) {
    return (GC.data.areas.find((a) => q.includes(a.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) || q.includes(a.id.replace('_', ' '))) || {}).id || null;
  }

  function responder(ctx, q) {
    if (!GC.pactos || !GC.pautaReuniao || !GC.avaliarIndicadores || !GC.storeAtual) return { texto: 'As metas pactuadas não estão disponíveis agora.' };
    const setor = !!(ctx.areasPerfil && ctx.areasPerfil.length === 1);
    const area = setor ? ctx.areasPerfil[0] : areaDaPergunta(q);
    // Metas do plano de governo (fase 3, js/metas-governo.js): as críticas e em atenção, com o porquê.
    if (GOVERNO.test(q) && GC.metasGoverno) {
      const lista = GC.metasGoverno.lista({ area });
      const grave = lista.filter((m) => m.status === 'critico' || m.status === 'atencao')
        .sort((a, b) => (a.status === 'critico' ? 0 : 1) - (b.status === 'critico' ? 0 : 1));
      const onde = area ? `da ${nomeArea(area)}` : 'da cidade';
      const porque = (m) => (m.vencida ? `prazo ${m.prazo} vencido com ${m.progressoPct}%` : `${m.progressoPct}% feito, o esperado hoje era ${m.esperadoPct}% (prazo ${m.prazo})`);
      const linha = (m) => `• ${m.titulo}${area ? '' : ` (${nomeArea(m.area)})`}: ${m.status === 'critico' ? 'crítico' : 'atenção'}, ${porque(m)}. ${m.fonte ? m.fonte.texto : ''}`;
      const n = (s) => lista.filter((m) => m.status === s).length;
      return {
        texto: `Plano de governo ${onde}: ${plural(lista.length, 'compromisso', 'compromissos')}, ${n('concluida')} ${n('concluida') === 1 ? 'concluído' : 'concluídos'}, ${n('em_dia')} em dia, ${n('atencao')} em atenção e ${plural(n('critico'), 'crítico', 'críticos')}.${grave.length ? `\n${grave.map(linha).join('\n')}` : ' Nenhum atrás do esperado.'}`,
        acoes: [{ rotulo: area ? `Abrir o plano de governo da ${nomeArea(area)}` : 'Abrir o plano de governo', tipo: 'abrirTela', payload: { rota: { tela: 'metas', area: area || null } } }],
      };
    }
    // Ações do plano atrasadas (fase 2): da pasta, ou de todas para o prefeito; com o responsável e a cobrança.
    if (ACOES.test(q) && GC.pactos.acoesCobradas) {
      const cobradas = GC.pactos.acoesCobradas(area);
      const chaves = new Set(cobradas.map((a) => `${a.indicadorId}#${a.id}`));
      const lista = [...cobradas, ...GC.pactos.acoesVencidas(area).filter((a) => !chaves.has(`${a.indicadorId}#${a.id}`))];
      const resp = (a) => (GC.nomeResponsavelPlano ? GC.nomeResponsavelPlano(a, a.area) : '');
      const linha = (a) => `• ${a.texto} (${ficha(a.indicadorId).nome}${area ? '' : `, ${nomeArea(a.area)}`}): prazo era ${a.prazo.split('-').reverse().join('/')}, responsável ${resp(a)}${chaves.has(`${a.indicadorId}#${a.id}`) ? ', já cobrada, espera resposta' : ''}`;
      const onde = area ? `da ${nomeArea(area)}` : 'das secretarias';
      return {
        texto: lista.length ? `${plural(lista.length, 'ação do plano atrasada', 'ações do plano atrasadas')} ${onde}:\n${lista.map(linha).join('\n')}` : `Nenhuma ação de plano atrasada ${onde}.`,
        acoes: [...new Set(lista.map((a) => a.area))].slice(0, 2).map((ar) => ({ rotulo: `Abrir ${nomeArea(ar)}`, tipo: 'abrirTela', payload: { rota: { tela: 'secretaria', area: ar } } })),
      };
    }
    if (!area && VENCEU.test(q) && GC.pactos.vencidasSemNovoPacto) {
      const semNovo = GC.pactos.vencidasSemNovoPacto();
      const ciclos = GC.pactos.ciclosDa(null, GC.agora() - 30 * 86400000).filter((c) => c.resultado !== 'substituida');
      return {
        texto: ciclos.length || semNovo.length
          ? `${ciclos.length ? `Metas apuradas nos últimos 30 dias:\n${ciclos.map((c) => `• ${apurada(c, true)}`).join('\n')}` : 'Nenhuma meta apurada nos últimos 30 dias.'}${semNovo.length ? `\n${plural(semNovo.length, 'meta vencida ainda espera', 'metas vencidas ainda esperam')} o próximo pacto: ${nomes(semNovo.map((p) => nomeArea(p.area)))}.` : ''}`
          : 'Nenhuma meta pactuada venceu até agora.',
        acoes: semNovo.slice(0, 2).map((p) => ({ rotulo: `Abrir ${nomeArea(p.area)}`, tipo: 'abrirTela', payload: { rota: { tela: 'secretaria', area: p.area } } })),
      };
    }
    if (!area) {
      const pend = GC.pactos.pendentes('prefeito');
      const semNovo = GC.pactos.vencidasSemNovoPacto ? GC.pactos.vencidasSemNovoPacto() : [];
      const vencidas = GC.pactos.acoesVencidas();
      return {
        texto: `${pend.length ? `${plural(pend.length, 'meta proposta espera', 'metas propostas esperam')} você: ${nomes(pend.map((p) => (GC.data.areas.find((a) => a.id === p.area) || { nome: p.area }).nome))}.` : 'Nenhuma meta proposta espera você.'} ${vencidas.length ? `${plural(vencidas.length, 'ação de plano está atrasada', 'ações de plano estão atrasadas')} nas secretarias.` : 'Nenhuma ação de plano atrasada.'}${semNovo.length ? ` ${plural(semNovo.length, 'meta venceu', 'metas venceram')} sem novo pacto.` : ''} Para a pauta de uma pasta, pergunte "Prepare a reunião com a Saúde".`,
        acoes: pend.slice(0, 2).map((p) => ({ rotulo: `Abrir ${(GC.data.areas.find((a) => a.id === p.area) || { nome: p.area }).nome}`, tipo: 'abrirTela', payload: { rota: { tela: 'secretaria', area: p.area } } })),
      };
    }
    const store = GC.storeAtual;
    const inds = GC.avaliarIndicadores(GC.contextoIndicadores(store), { area });
    const pauta = GC.pautaReuniao({ area, indicadores: inds, pactos: GC.pactos, cobrancas: GC.cobrancas || null, ajudas: GC.ajudas || null, acoesPrefeito: GC.acoesPrefeito || null, ocorrencias: store.todas(), agora: GC.agora() });
    const abrir = { rotulo: 'Abrir metas dos indicadores e reunião', tipo: 'abrirTela', payload: { rota: { tela: 'secretaria', area } } };
    if (VENCEU.test(q) && !REUNIAO.test(q)) {
      const ciclos = pauta.metasApuradas || [];
      return {
        texto: ciclos.length ? `${pauta.nome}, metas apuradas nos últimos ${pauta.dias} dias:\n${ciclos.map((c) => `• ${apurada(c, false)}`).join('\n')}` : `Nenhuma meta da ${pauta.nome} venceu nos últimos ${pauta.dias} dias.`,
        acoes: [abrir],
      };
    }
    if (RITMO.test(q)) {
      const comPacto = inds.filter((i) => i.metaPactuada);
      const linha = (i) => `• ${i.nome}: ${fmt(i.valorAtual, i.unidade)}${typeof i.marcoAtual === 'number' ? `, marco deste mês ${fmt(i.marcoAtual, i.unidade)}` : ''}, meta ${fmt(i.metaAtual, i.unidade)} até ${mesBr(i.prazoPactuado)}: ${i.pactoVencido ? 'prazo vencido' : i.ritmo === 'no_ritmo' ? 'no ritmo' : i.ritmo === 'atrasado' ? 'atrasado' : 'sem caminho combinado'}`;
      return {
        texto: comPacto.length ? `${pauta.nome}, ritmo das metas pactuadas:\n${comPacto.map(linha).join('\n')}` : `A ${pauta.nome} ainda não tem meta pactuada: o ritmo só existe com um caminho combinado.`,
        acoes: [abrir],
      };
    }
    if (REUNIAO.test(q)) {
      return {
        texto: pauta.itens.length ? `Pauta da reunião de resultados da ${pauta.nome} (últimos ${pauta.dias} dias):\n${pauta.itens.map((it, i) => `${i + 1}. ${it.texto}`).join('\n')}` : `Nada fora do normal para a reunião com a ${pauta.nome}: indicadores na meta e nenhum pendente.`,
        acoes: [abrir],
      };
    }
    return {
      texto: `${pauta.nome}: ${pauta.metas.pactuadas} de ${pauta.metas.total} metas pactuadas${pauta.metas.emNegociacao.length ? `, ${pauta.metas.emNegociacao.length} em negociação` : ''}. ${pauta.foraDaMeta.length ? `${plural(pauta.foraDaMeta.length, 'indicador fora da meta', 'indicadores fora da meta')}${pauta.semPlano ? `, ${pauta.semPlano} sem plano de ação` : ''}${pauta.acoesVencidas ? `, ${plural(pauta.acoesVencidas, 'ação atrasada', 'ações atrasadas')}` : ''}.` : 'Todos os indicadores na meta.'}`,
      acoes: [abrir],
    };
  }

  GC.temasIA.push({
    ordem: 188, // empate de palavras-chave: vence o menor (depois de equipes, 187)
    id: 'metas',
    chaves: [{ termo: 'meta pactuada', peso: 4 }, { termo: 'metas pactuadas', peso: 4 }, { termo: 'pactu', peso: 3 }, { termo: 'plano de acao', peso: 3 }, { termo: 'reuniao de resultados', peso: 4 }, { termo: 'prepare a reuniao', peso: 4 }, { termo: 'metas da pasta', peso: 3 }, { termo: 'metas venceram', peso: 4 }, { termo: 'meta venceu', peso: 4 }, { termo: 'ritmo da meta', peso: 4 }, { termo: 'no ritmo', peso: 3 }, { termo: 'meta foi cumprida', peso: 4 }, { termo: 'plano de governo', peso: 4 }, { termo: 'compromisso', peso: 4 }, { termo: 'acoes do plano', peso: 4 }, { termo: 'acao do plano', peso: 4 }],
    nome: 'Metas pactuadas e reunião',
    assunto: 'das metas pactuadas e da reunião de resultados',
    exemplo: 'Prepare a reunião de resultados',
    responder,
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.metas_pactuadas', 'gabinete.planos_acao'], consulta: 'SELECT * FROM gabinete.metas_pactuadas JOIN gabinete.indicadores USING (indicador)' },
    base: { periodo: 'últimos 30 dias', registros: () => (GC.CATALOGO_INDICADORES || []).length },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
