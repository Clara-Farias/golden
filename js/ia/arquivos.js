(function (GC) {
  // Arquivos da Maia: relatório, prestação de contas, briefing de visita ao bairro, pauta do secretariado e planilha.
  // O pedido vem em linguagem natural ("gere a pauta da reunião do secretariado"). A resposta traz o resumo no chat e
  // o campo `arquivo` ({ modelo, params, titulo, formatos }, ver js/contrato.js). Só dados, sem função: a conversa
  // guarda a resposta no navegador e o botão de baixar monta o arquivo de novo, com GC.montarArquivoMaia.
  // Todo arquivo tem a forma de um relatório da tela Relatórios ({ titulo, subtitulo, periodo, kpis, topicos, secoes,
  // fontes }): o PDF é o mesmo da tela (GC.relatorioPdf), o CSV também (GC.relatorioCsv); Word e Excel saem daqui.
  // Roda depois de ia-roteiro.js: envolve GC.ia.perguntar e devolve ao motor tudo o que não é pedido de arquivo.
  if (!GC.ia) return;
  const st = () => GC.storeAtual;
  const norm = (t) => ` ${GC.ia.normalizar(t)} `;
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const mi = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  const soma = (l) => l.reduce((s, n) => s + n, 0);
  const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
  const SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
  const META = { concluida: 'Concluído', em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const metaPrazo = () => (GC.metaNoPrazo ? GC.metaNoPrazo() : 85); // a mesma dos relatórios (GAB01, js/indicadores.js)
  const VERBO = /\b(gere|gerar|gera|monte|montar|monta|faca|fazer|faz|prepare|preparar|prepara|crie|criar|cria|baixar|baixe|exportar|exporte|quero|preciso)\b/;
  const PERIODOS = { 7: '7 dias', 30: '30 dias', 90: '90 dias', '12m': '12 meses' };
  const periodoDe = (q, padrao = '30') => (/12 meses|\bano\b|anual/.test(q) ? '12m' : /90 dias|trimestre|3 meses/.test(q) ? '90' : /7 dias|semana/.test(q) ? '7' : /30 dias|\bmes\b/.test(q) ? '30' : padrao);
  const daPasta = (ctx) => (o) => !ctx.areasPerfil || ctx.areasPerfil.includes(o.area || o);
  const nomeArq = (t) => GC.ia.normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tabela = (titulo, colunas, linhas, vazio) => (linhas.length ? { titulo, tipo: 'tabela', colunas, linhas } : { titulo, tipo: 'tabela', colunas, linhas, vazio: vazio || 'Nada a mostrar.' });
  const lista = (titulo, itens, vazio) => (itens.length ? { titulo, tipo: 'lista', itens } : { titulo, tipo: 'lista', itens, vazio: vazio || 'Nada a mostrar.' });
  const hojeMais = (dias) => new Date((GC.agora ? GC.agora() : Date.now()) + dias * 864e5).toLocaleDateString('pt-BR');

  // Bairro mais pesado agora (crítica 3, alta 2, média 1): padrão do briefing quando o pedido não diz qual.
  function piorBairro(areas) {
    const P = { critica: 3, alta: 2, media: 1 };
    const pts = {};
    st().ocorrencias().filter((o) => !areas || areas.includes(o.area)).forEach((o) => { pts[o.bairroId] = (pts[o.bairroId] || 0) + (P[o.severidade] || 1); });
    return Object.keys(pts).sort((a, b) => pts[b] - pts[a])[0] || GC.data.bairros[0].id;
  }

  // ---- os modelos: quando (pedido normalizado) → params (pedido, extrator, contexto) → montar (params) → texto ----
  const MODELOS = {
    relatorio: {
      nome: 'Relatório',
      quando: (q) => /\brelatorio/.test(q) && VERBO.test(q) && !/\bresum/.test(q),
      params(q, ent, ctx) {
        const periodo = periodoDe(q);
        if (ctx.areasPerfil) return { tipo: 'secretaria', alvo: ctx.areasPerfil[0], periodo };
        // "Relatório comparando Centro e Vila Nova" (ou duas secretarias): comparação lado a lado, até 4.
        const comparar = /\bcompar|\blado a lado|\bversus\b|\bvs\b/.test(q);
        if (comparar && ent.bairros.length >= 2) return { tipo: 'comparacao', alvo: `bairros:${ent.bairros.slice(0, 4).join(',')}`, periodo: '30' };
        if (comparar && ent.secretarias.length >= 2) return { tipo: 'comparacao', alvo: `secretarias:${ent.secretarias.slice(0, 4).join(',')}`, periodo: '30' };
        // "Relatório de entregas [do Centro]": a agenda de entregas (cidade ou bairro).
        if (/\bentrega/.test(q)) return { tipo: 'entregas', alvo: ent.bairros[0] || '-', periodo };
        if (ent.bairros.length) return { tipo: 'bairro', alvo: ent.bairros[0], periodo };
        if (ent.secretarias.length) return { tipo: 'secretaria', alvo: ent.secretarias[0], periodo };
        if (/\balerta/.test(q)) return { tipo: 'alertas', alvo: '-', periodo };
        return { tipo: 'executivo', alvo: '-', periodo };
      },
      montar: (p) => Object.assign(GC.montarRelatorio(st(), p), { nome: `relatorio-${p.tipo}-${p.alvo}-${p.periodo}` }),
      formatos: () => ['pdf', 'csv'],
      texto: (d) => `${d.titulo}, ${d.periodo.rotulo}. ${d.topicos.slice(0, 2).join(' ')} O arquivo traz também as tabelas e as fontes.`,
      acoes: (p) => [{ rotulo: '📄 Abrir na tela Relatórios', tipo: 'abrirTela', payload: { rota: { tela: 'relatorios', tipo: p.tipo, alvo: p.alvo, periodo: p.periodo } } }],
    },

    prestacao: {
      nome: 'Prestação de contas',
      quando: (q) => /prestacao de contas|prestar contas|para a camara|camara municipal/.test(q),
      params: (q) => ({ periodo: periodoDe(q), word: /\bword\b|docx|\bdoc\b/.test(q) ? 'sim' : 'nao' }),
      montar(p) {
        const s = st();
        const rel = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: p.periodo });
        const d = s.desempenho(null);
        const pulsos = s.pulsos();
        const sec = GC.data.secretarias;
        const metas = GC.data.areas.flatMap((a) => (sec[a.id].metas || []).map((m) => [a.secretaria.nome, m.titulo, `${m.progressoPct}%`, m.prazo, META[m.status] || m.status]));
        return {
          titulo: `Prestação de contas · ${rel.periodo.rotulo}`,
          subtitulo: 'Resultados das secretarias, orçamento, compromissos do plano de governo e o que ficou pendente',
          periodo: rel.periodo,
          kpis: rel.kpis,
          topicos: rel.topicos,
          secoes: [
            tabela('Resultados por secretaria (30 dias)', ['Secretaria', 'Resolvidas', 'No prazo', 'Tempo médio', 'Indicador principal'],
              GC.data.areas.map((a) => {
                const x = d.secretarias.find((y) => y.area === a.id);
                const pu = pulsos.find((y) => y.area === a.id) || {};
                return [a.secretaria.nome, num(x.resolvidas), `${x.noPrazoPct}%`, `${x.tempoMedioH.toLocaleString('pt-BR')} h`, pu.rotulo ? `${pu.rotulo}: ${pu.nivel} (${pu.variacao} ${pu.periodo})` : ''];
              })),
            tabela('Orçamento 2026', ['Secretaria', 'Dotação', 'Executado'], GC.data.areas.map((a) => [a.secretaria.nome, mi(sec[a.id].orcamento.dotacaoMi), `${sec[a.id].orcamento.executadoPct}%`])),
            tabela('Compromissos do plano de governo', ['Secretaria', 'Compromisso', 'Avanço', 'Prazo', 'Situação'], metas),
            tabela('O que ficou pendente', ['Ocorrência', 'Bairro', 'Secretaria', 'Situação'],
              s.atencao().todas.map((o) => [o.titulo, bairro(o.bairroId).nome, area(o.area).secretaria.nome, GC.situacao(o)]), 'Nada pendente.'),
          ],
          fontes: [...rel.fontes, 'gabinete.plano_de_governo'],
          nome: `prestacao-de-contas-${p.periodo}`,
        };
      },
      formatos: (p) => (p.word === 'sim' ? ['doc', 'pdf'] : ['pdf', 'doc']),
      texto: (d) => `${d.titulo}: ${d.topicos.slice(0, 2).join(' ')} O documento tem os resultados por secretaria, o orçamento, os compromissos do plano e o que ficou pendente.`,
    },

    briefing: {
      nome: 'Briefing de visita ao bairro',
      quando: (q) => /\bbriefing|visita ao bairro|visitar o bairro|vou (ao|no|na|a) bairro/.test(q),
      params: (q, ent, ctx) => ({ bairro: ent.bairros[0] || piorBairro(ctx.areasPerfil) }),
      montar(p) {
        const s = st();
        const rel = GC.montarRelatorio(s, { tipo: 'bairro', alvo: p.bairro, periodo: '30' });
        const b = bairro(p.bairro);
        const abertas = s.ocorrencias(null, p.bairro);
        const sat = GC.data.satisfacaoPorBairro[p.bairro];
        const satCidade = GC.data.indicadoresBase.satisfacaoPct;
        const unidades = GC.data.areas.flatMap((a) => (GC.data.secretarias[a.id].unidades || []).filter((u) => u.bairroId === p.bairro && u.situacao === 'critica').map((u) => u.nome));
        const atencao = [
          ...abertas.filter((o) => o.severidade === 'critica').map((o) => `Crítica em aberto: ${o.titulo} (${area(o.area).secretaria.nome}).`),
          ...abertas.filter((o) => o.severidade !== 'critica' && GC.estourada(o)).map((o) => `Prazo estourado: ${o.titulo}.`),
          ...(sat < satCidade ? [`Satisfação de ${sat}%, abaixo da média da cidade (${satCidade}%).`] : []),
          ...unidades.map((u) => `Unidade em situação crítica: ${u}.`),
        ];
        // Agenda de entregas (js/data-entregas.js): o que já foi entregue no bairro e o que vem por aí (as do prazo).
        const doBairro = GC.entregas ? GC.entregas.lista({ bairro: p.bairro }) : null;
        const entregas = [...(doBairro ? doBairro.filter((e) => e.situacao === 'entregue').reverse().map((e) => `Entregue: ${e.titulo} (${GC.entregas.diaMes(e.dataAtual)}).`)
            : (GC.data.conquistas || []).filter((x) => x.bairroId === p.bairro).map((x) => `Entregue: ${x.titulo}.`)),
          ...(doBairro ? doBairro.filter((e) => e.situacao !== 'entregue').map((e) => `${e.situacao === 'no_prazo' ? 'Vem aí' : 'Atenção'}: ${e.titulo}, ${GC.entregas.situacaoEmPalavras(e)}.`) : []),
          ...(GC.data.resolvidasRecentes || []).filter((x) => x.bairroId === p.bairro).map((x) => `Resolvida há pouco: ${x.titulo}.`)];
        return Object.assign({}, rel, {
          titulo: `Briefing de visita · ${b.nome}`,
          subtitulo: 'O que está aberto, as unidades e os pontos para a conversa com os moradores',
          secoes: [
            lista('Pontos de atenção para a conversa', atencao.slice(0, 8), 'Nenhum ponto crítico agora: bom momento para anunciar entregas e ouvir os moradores.'),
            lista('Entregas, resolvidas e o que vem por aí', entregas, 'Nenhuma entrega recente ou prevista no bairro.'),
            ...rel.secoes,
          ],
          nome: `briefing-${nomeArq(b.nome)}`,
          _atencao: atencao,
        });
      },
      formatos: () => ['pdf'],
      texto: (d) => `${d.titulo}: ${d.topicos[0]} ${d._atencao.length ? `Para a conversa: ${d._atencao.slice(0, 2).join(' ')}` : 'Nenhum ponto crítico agora: bom momento para anunciar entregas.'}`,
    },

    pauta: {
      nome: 'Pauta do secretariado',
      quando: (q) => /\bpauta\b|reuniao do secretariado|reuniao de secretarios|reuniao com (os )?secretarios/.test(q),
      params: (q, ent, ctx) => ({ areas: ctx.areasPerfil ? ctx.areasPerfil.join(',') : '' }),
      montar(p) {
        const s = st();
        const areas = p.areas ? p.areas.split(',') : null;
        const vale = (id) => !areas || areas.includes(id);
        const META_PRAZO = metaPrazo();
        const prazo = hojeMais(7);
        const abaixo = s.desempenho(null).secretarias.filter((x) => vale(x.area) && x.noPrazoPct < META_PRAZO);
        const metas = GC.data.areas.filter((a) => vale(a.id)).flatMap((a) => (GC.data.secretarias[a.id].metas || []).filter((m) => m.status === 'critico').map((m) => [a.secretaria.nome, m.titulo, `${m.progressoPct}%`, m.prazo]));
        const decisoes = s.atencao(areas).todas.slice(0, 10);
        const estouradas = decisoes.filter(GC.estourada).length;
        return {
          titulo: 'Pauta da reunião do secretariado',
          subtitulo: 'O que está fora da meta, o que pede decisão e os compromissos da reunião',
          periodo: { rotulo: `reunião de ${hojeMais(0)}` },
          kpis: [
            { rotulo: 'Pedem decisão', valor: num(decisoes.length), detalhe: `${estouradas} com prazo estourado` },
            { rotulo: 'Secretarias abaixo da meta de prazo', valor: num(abaixo.length), detalhe: `meta ${META_PRAZO}%` },
            { rotulo: 'Compromissos do plano em situação crítica', valor: num(metas.length) },
          ],
          topicos: [
            `${plural(decisoes.length, 'situação pede', 'situações pedem')} decisão${estouradas ? `, ${plural(estouradas, 'com prazo estourado', 'com prazo estourado')}` : ''}.`,
            abaixo.length ? `Abaixo da meta de ${META_PRAZO}% no prazo: ${abaixo.map((x) => `${area(x.area).nome} (${x.noPrazoPct}%)`).join(', ')}.` : `Todas as secretarias estão na meta de ${META_PRAZO}% no prazo.`,
            `Cada item tem um responsável e o prazo sugerido de ${prazo}.`,
          ],
          secoes: [
            tabela('1. Pedem decisão', ['Ocorrência', 'Bairro', 'Responsável', 'Motivo', 'Prazo'],
              decisoes.map((o) => [o.titulo, bairro(o.bairroId).nome, area(o.area).secretaria.nome, GC.motivosAtencao(o).map((m) => m.texto).join(' · '), prazo]), 'Nenhuma decisão pendente.'),
            tabela(`2. Secretarias abaixo da meta de prazo (${META_PRAZO}%)`, ['Secretaria', 'No prazo', 'Tempo médio', 'Em aberto', 'Prazo do plano'],
              abaixo.map((x) => [area(x.area).secretaria.nome, `${x.noPrazoPct}%`, `${x.tempoMedioH.toLocaleString('pt-BR')} h`, num(x.abertas), prazo]), 'Todas na meta.'),
            tabela('3. Compromissos do plano em situação crítica', ['Secretaria', 'Compromisso', 'Avanço', 'Prazo'], metas, 'Nenhum compromisso crítico.'),
            lista('4. Compromissos desta reunião', ['Responsável · o que entrega · até quando: ____________________', 'Responsável · o que entrega · até quando: ____________________', 'Responsável · o que entrega · até quando: ____________________']),
          ],
          fontes: ['gestao.ocorrencias', 'gestao.prazos_sla', 'gabinete.plano_de_governo'],
          nome: 'pauta-secretariado',
        };
      },
      formatos: () => ['pdf', 'doc'],
      texto: (d) => `Pauta pronta. ${d.topicos.join(' ')}`,
    },

    planilha: {
      nome: 'Planilha',
      quando: (q) => /\bexcel\b|\bplanilha|\bxlsx\b/.test(q),
      params: (q, ent, ctx) => ({
        foco: /secretaria|orcamento/.test(q) ? 'secretarias' : /bairro/.test(q) ? 'bairros' : /indicador|serie|meses|historico/.test(q) ? 'indicadores' : 'ocorrencias',
        areas: ctx.areasPerfil ? ctx.areasPerfil.join(',') : '',
      }),
      montar(p) {
        const s = st();
        const areas = p.areas ? p.areas.split(',') : null;
        const vale = (id) => !areas || areas.includes(id);
        const sec = GC.data.secretarias;
        const d = s.desempenho(null);
        const abertas = s.ocorrencias().filter((o) => vale(o.area));
        const hist = GC.data.historico30d;
        const abas = {
          ocorrencias: tabela('Ocorrências abertas', ['Ocorrência', 'Bairro', 'Secretaria', 'Gravidade', 'Situação', 'Aberta há (h)', 'Pessoas afetadas'],
            abertas.map((o) => [o.titulo, bairro(o.bairroId).nome, area(o.area).secretaria.nome, SEV[o.severidade], GC.situacao(o), Math.round((o.abertaHaMin || 0) / 6) / 10, o.afetados || 0]), 'Nenhuma ocorrência aberta.'),
          secretarias: tabela('Secretarias', ['Secretaria', 'Orçamento (R$ mi)', 'Executado (%)', 'Resolvidas (30 dias)', 'No prazo (%)', 'Tempo médio (h)', 'Em aberto'],
            d.secretarias.filter((x) => vale(x.area)).map((x) => [area(x.area).secretaria.nome, sec[x.area].orcamento.dotacaoMi, sec[x.area].orcamento.executadoPct, x.resolvidas, x.noPrazoPct, x.tempoMedioH, x.abertas])),
          bairros: tabela('Bairros', ['Bairro', 'População', 'Satisfação (%)', 'Ocorrências abertas', 'Casos (30 dias)'],
            GC.data.bairros.map((b) => [b.nome, b.populacao, GC.data.satisfacaoPorBairro[b.id], abertas.filter((o) => o.bairroId === b.id).length,
              soma(GC.data.areas.filter((a) => vale(a.id)).map((a) => (hist[a.id] || {})[b.id] || 0))])),
          indicadores: tabela('Indicadores em 12 meses', ['Secretaria', 'Indicador', 'Unidade', ...(GC.data.mesesSerie || []), 'Meta'],
            GC.data.areas.filter((a) => vale(a.id) && sec[a.id].serie).map((a) => { const sr = sec[a.id].serie; return [a.secretaria.nome, sr.rotulo, sr.unidade, ...sr.meses, sr.meta == null ? '' : sr.meta]; })),
        };
        const ordem = [p.foco, ...Object.keys(abas).filter((k) => k !== p.foco)];
        return {
          titulo: 'Base de dados da Prefeitura',
          subtitulo: areas ? `Dados da ${area(areas[0]).secretaria.nome}` : 'Ocorrências, secretarias, bairros e indicadores',
          periodo: { rotulo: `dados de ${hojeMais(0)}` },
          kpis: [
            { rotulo: 'Ocorrências abertas', valor: num(abertas.length) },
            { rotulo: 'Secretarias', valor: num(abas.secretarias.linhas.length) },
            { rotulo: 'Bairros', valor: num(GC.data.bairros.length) },
          ],
          topicos: ['Os números são os mesmos das telas do painel, no momento do download.'],
          secoes: ordem.map((k) => abas[k]),
          fontes: ['gestao.ocorrencias', 'gabinete.orcamento_2026', 'gestao.prazos_sla', 'planejamento.bairros', 'ouvidoria.pesquisa_satisfacao'],
          nome: `${nomeArq(GC.cidade ? GC.cidade.nome : 'vila dourada')}-${p.foco}`,
        };
      },
      formatos: () => ['xlsx', 'csv'],
      texto: (d) => `Planilha com ${d.secoes.length} abas (${d.secoes.map((x) => x.titulo).join(', ')}), com os mesmos números das telas. A primeira aba é ${d.secoes[0].titulo}.`,
    },
  };

  // Monta o documento de uma resposta guardada (o botão de baixar chama na hora do clique).
  GC.montarArquivoMaia = (arquivo) => MODELOS[arquivo.modelo].montar(arquivo.params || {});
  // Prévia no balão: { tipo: 'imagem', svg } (card) ou { tipo: 'audio', texto } (resumo em áudio); null sem prévia.
  GC.previaArquivoMaia = (arquivo) => {
    const m = MODELOS[arquivo.modelo];
    return m && m.previa ? m.previa(GC.montarArquivoMaia(arquivo)) : null;
  };

  function responder(texto, ctx) {
    const q = norm(texto);
    const id = Object.keys(MODELOS).find((k) => MODELOS[k].quando(q));
    if (!id || !st()) return null;
    const m = MODELOS[id];
    const ent = GC.iaEntender ? GC.iaEntender(texto) : { bairros: [], secretarias: [] };
    const params = m.params(q, ent, ctx || {});
    const doc = m.montar(params);
    return {
      cenario: `arquivo_${id}`,
      texto: m.texto(doc, params),
      arquivo: { modelo: id, params, titulo: doc.titulo, formatos: m.formatos(params) },
      acoes: m.acoes ? m.acoes(params) : [],
      ...(doc.fontes && doc.fontes.length ? { fontes: doc.fontes.slice(0, 8) } : {}),
      memoria: { tema: null, bairros: params.bairro ? [params.bairro] : [], periodo: null },
    };
  }
  // Outros arquivos (js/ia/cards.js, js/ia/audio.js) se registram aqui, com o mesmo formato de modelo e, se quiserem,
  // previa(doc) e baixar(doc, formato, nome). O id também precisa entrar em MODELOS_ARQUIVO de js/contrato.js.
  GC.arquivosMaia = {
    get modelos() { return Object.keys(MODELOS); },
    responder,
    registrar(id, modelo) { MODELOS[id] = modelo; },
  };

  const original = GC.ia.perguntar;
  GC.ia.perguntar = function (texto, contexto = {}) {
    // Rascunho e lote ("escreva…", "cobre todas…") continuam no motor.
    return responder(texto, contexto) || original(texto, contexto);
  };

  // ---- formatos (só no navegador) ----
  const DOWNLOAD = { pdf: 'PDF', doc: 'Word', xlsx: 'Excel', csv: 'CSV', png: 'PNG', svg: 'SVG editável', txt: 'roteiro (.txt)' };
  GC.formatosArquivoMaia = DOWNLOAD;
  // Baixa o arquivo no formato pedido. Devolve uma Promise (o Excel carrega a biblioteca na primeira vez).
  GC.baixarArquivoMaia = async function (arquivo, formato) {
    const doc = GC.montarArquivoMaia(arquivo);
    const data = new Date(GC.agora ? GC.agora() : Date.now()).toISOString().slice(0, 10);
    const nome = `${doc.nome}-${data}`;
    const m = MODELOS[arquivo.modelo];
    if (m.baixar) return m.baixar(doc, formato, nome);
    if (formato === 'pdf') {
      if (!GC.relatorioPdf || !window.jspdf) throw new Error('PDF indisponível sem internet');
      return GC.relatorioPdf(doc, GC.agora ? GC.agora() : Date.now(), `${nome}.pdf`);
    }
    // Word e Excel: os mesmos da tela Relatórios (js/relatorio-formatos.js); o Excel sem internet sai em CSV.
    if (formato === 'doc') return GC.relatorioWord(doc, `${nome}.doc`);
    if (formato === 'csv') return GC.baixarArquivo(GC.relatorioCsv(doc), `${nome}.csv`, 'text/csv;charset=utf-8');
    if (formato === 'xlsx') return GC.relatorioExcel(doc, `${nome}.xlsx`);
    return null;
  };
})(window.GC = window.GC || {});
