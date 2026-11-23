(function (GC) {
  // Montagem dos relatórios (executivo, secretaria, bairro, alertas): função pura sobre o store,
  // para a tela, o CSV e o PDF mostrarem exatamente os mesmos números.
  // Taxas e tempos = últimos 30 dias (store.desempenho). Contagens seguem o período pela curva
  // mensal de alertas (GC.alertasPorMes), cujo último mês é o total de 30 dias.
  // Meta de % no prazo: a do catálogo de indicadores (GAB01), com 85 quando ele não está carregado.
  const meta = () => (GC.metaNoPrazo ? GC.metaNoPrazo() : 85);
  const NADA = 'Nada a listar';
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const STATUS = { em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const STATUS_META = { concluida: 'Concluído', em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const SITUACAO = { ok: 'Normal', atencao: 'Atenção', critica: 'Crítica' };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const num = (n) => n.toLocaleString('pt-BR');
  const mi = (n) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  const horas = (h) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  const soma = (lista) => lista.reduce((s, n) => s + n, 0);

  function valorSerie(v, unidade) {
    if (unidade === 'min') return `${v} min`;
    if (unidade === '%') return `${v}%`;
    return num(v);
  }
  // Mês i da série (0 = nov/2025 ... 11 = out/2026).
  const rotuloMes = (i) => `${GC.data.mesesSerie[i]}/${i < 2 ? 2025 : 2026}`;

  // ---- período ----
  // Códigos: '7' e '30' (dias até agora), '90' e '12m' (meses fechados da série) e 'm<de>-<ate>',
  // um intervalo de meses escolhido (índices da série: 0 = nov/2025 ... 11 = out/2026).
  GC.periodoInfo = function (p) {
    if (p === '7' || p === '30') return { dias: Number(p) };
    if (p === '90') return { de: 9, ate: 11 };
    if (p === '12m') return { de: 0, ate: 11 };
    const m = /^m(\d{1,2})-(\d{1,2})$/.exec(String(p));
    if (m && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 11) return { de: Number(m[1]), ate: Number(m[2]) };
    return null;
  };
  GC.rotuloMesSerie = rotuloMes; // (GC.rotuloMes é o do calendário, em linha-tempo.js)
  const info = (p) => GC.periodoInfo(p) || { dias: 30 };
  const emMeses = (p) => info(p).de !== undefined;
  function periodoDe(p) {
    const i = info(p);
    if (i.de !== undefined) {
      return { rotulo: i.de === i.ate ? rotuloMes(i.de) : `${rotuloMes(i.de)} a ${rotuloMes(i.ate)}`, de: rotuloMes(i.de), ate: rotuloMes(i.ate) };
    }
    const data = (t) => new Date(t).toLocaleDateString('pt-BR');
    const ate = GC.agora();
    const de = ate - i.dias * 86400000;
    return { rotulo: `${data(de)} a ${data(ate)} (${i.dias} dias)`, de: data(de), ate: data(ate) };
  }

  // Quantas vezes o total de 30 dias cabe no período (pela curva mensal de alertas).
  function fator(p) {
    const i = info(p);
    if (i.de === undefined) return i.dias / 30;
    const m = GC.alertasPorMes();
    return soma(m.slice(i.de, i.ate + 1)) / m[11];
  }

  // Nomes legíveis das fontes (na tela e no PDF); o CSV leva o nome e o código técnico.
  const FONTES = {
    'gabinete.orcamento_2026': 'Orçamento 2026 (Gabinete)',
    'gestao.ocorrencias': 'Registro de ocorrências',
    'gestao.prazos_sla': 'Prazos de atendimento',
    'ouvidoria.pesquisa_satisfacao': 'Pesquisa de satisfação (Ouvidoria)',
    'planejamento.metas_governo': 'Compromissos do plano de governo',
    'gabinete.metas_pactuadas': 'Metas pactuadas com o prefeito',
    'planejamento.bairros': 'Cadastro de bairros',
    'monitoramento.regras': 'Regras de alerta',
    'monitoramento.alertas': 'Histórico de alertas',
    'obras.cronograma': 'Cronograma das obras',
    'planejamento.entregas': 'Agenda de entregas das secretarias',
  };
  GC.nomeFonte = (f) => FONTES[f] || f;
  const regraTexto = (r) => (GC.regraEmPalavras ? GC.regraEmPalavras(r) : r.expressao);
  const sufixo30 = (p) => (p === '30' ? '' : ' (30 dias)');
  // Contagens fora dos 30 dias são projeções, não registros: o valor leva "≈" e a nota diz como foi feita.
  const aprox = (p, n) => (p === '30' ? num(n) : `≈ ${num(n)}`);
  const notaEstimativa = (p) => (p === '30' ? null : p === '7' ? 'estimativa: 7/30 do total de 30 dias' : 'estimativa: ritmo de 30 dias × curva mensal de alertas');

  function tabela(id, titulo, colunas, linhas) {
    return linhas.length ? { id, titulo, tipo: 'tabela', colunas, linhas } : { id, titulo, tipo: 'tabela', colunas, linhas, vazio: NADA };
  }

  // Prazos (js/prazos.js, fase 3; spec docs/specs/2026-11-12-vila-dourada-prazos-fase3-design.md): equipe em campo e
  // resolvidas no prazo (30 dias) e, nas ocorrências do painel no recorte, pausas, pedidos de mais prazo e devoluções.
  // f: { areas, bairro, grav }; resumo: o de store.desempenho; daCidade: os % são os da cidade (relatório de bairro).
  function secaoPrazos(store, f, resumo, daCidade = false) {
    const lista = store.todas().filter((o) => (!f.areas || f.areas.includes(o.area)) && (!f.bairro || o.bairroId === f.bairro)
      && (!f.grav || f.grav.includes(o.severidade)));
    const r = GC.resumoPrazos(lista);
    const t = (min) => (min ? GC.tempoTexto(min) : '—');
    const pr = r.prorrogacoes;
    const cidade = daCidade ? ', cidade' : '';
    return tabela('prazos', 'Prazos', ['Item', 'Valor'], [
      [`Equipe em campo no prazo (30 dias${cidade})`, `${resumo.atendidoPct}% (mês anterior: ${resumo.atendidoPctAnt}%)`],
      [`Resolvidas no prazo (30 dias${cidade})`, `${resumo.noPrazoPct}% · ${metaTexto(resumo.noPrazoPct)}`],
      ['Abertas com o prazo de equipe estourado', num(r.estouradas)],
      ['Abertas com o prazo de resolver vencido', num(r.solucaoAtrasada)],
      ['Com o prazo pausado agora', r.pausaLonga ? `${num(r.pausadas)} (${num(r.pausaLonga)} há mais de ${GC.tempoTexto(GC.PAUSA_TETO_MIN)})` : num(r.pausadas)],
      ['Tempo com o prazo pausado', t(r.pausadoMin)],
      ['Por que pausaram', r.causasPausa.length ? r.causasPausa.map((c) => `${c.nome}: ${c.n}`).join('; ') : '—'],
      ['Pedidos de mais prazo', `${pr.automaticas} valeram na hora, ${pr.aprovadas} aprovados, ${pr.recusadas} recusados, ${pr.aguardando} aguardando o prefeito`],
      ['Prazo a mais concedido', t(pr.concedidasMin)],
      ['Devolvidas à pasta certa', r.devolucoes ? `${num(r.devolucoes)} (${t(r.perdidoMin)} na pasta errada)` : '0'],
    ]);
  }

  // Agenda de entregas (js/data-entregas.js): as entregues no período e todas as ainda não entregues (previstas,
  // em risco, atrasadas e paradas). Período em dias: de hoje para trás; em meses: os meses escolhidos da série
  // (o índice 11 é o mês passado). filtro = { areas, bairro }; coluna = 'bairro' ou 'secretaria'.
  function janelaEntregas(p) {
    const hoje = GC.relogio.hoje;
    const i = info(p);
    if (i.de === undefined) return [new Date(Date.parse(hoje) - i.dias * 86400000).toISOString().slice(0, 10), hoje];
    const mes = (k) => { const t = +hoje.slice(0, 4) * 12 + (+hoje.slice(5, 7) - 1) + (k - 12); return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
    return [`${mes(i.de)}-01`, `${mes(i.ate)}-31`];
  }
  const situacaoEntrega = (e) => `${GC.entregas.rotulo(e)}${e.situacao === 'em_risco' ? ` (${e.avancoPct}% feito, esperado ${e.esperadoPct}%)` : e.situacao === 'parada' ? ` (sem avanço há ${e.semAvancoDias} dias)` : ''}`;
  function secaoEntregas(p, filtro, coluna) {
    const data = (iso) => iso.split('-').reverse().join('/');
    const [de, ate] = janelaEntregas(p);
    const lista = GC.entregas ? GC.entregas.lista(filtro).filter((e) => e.situacao !== 'entregue' || (e.dataAtual >= de && e.dataAtual <= ate)) : [];
    const entregues = lista.filter((e) => e.situacao === 'entregue').length;
    const situacao = situacaoEntrega;
    return tabela('entregas', `Agenda de entregas · ${entregues} ${entregues === 1 ? 'entregue' : 'entregues'} no período, ${lista.length - entregues} a entregar`,
      ['Entrega', coluna === 'bairro' ? 'Bairro' : 'Secretaria', 'Data', 'Situação'],
      lista.map((e) => [e.titulo, coluna === 'bairro' ? (e.bairroId ? bairro(e.bairroId).nome : 'Cidade inteira') : area(e.area).secretaria.nome,
        `${data(e.dataAtual)}${e.remarcada ? ` (era ${data(e.dataOriginal)})` : ''}`, situacao(e)]));
  }

  // ---- recomendações (executivo) ----
  // Cada recomendação: texto completo (PDF/CSV), texto curto + etiqueta com o número (tela).
  // f (opcional): { areas, grav } do relatório; o filtro vale antes do corte de 5.
  GC.recomendacoesDetalhadas = function (store, f = {}) {
    const rec = [];
    const naArea = (id) => !f.areas || f.areas.includes(id);
    const naGrav = (o) => !f.grav || f.grav.includes(o.severidade);
    store.ocorrencias(f.areas || null, null, 'estourado').filter(naGrav)
      .sort((a, b) => GC.prazoRestanteMin(a) - GC.prazoRestanteMin(b))
      .forEach((o) => {
        const curto = `Cobrar a ${area(o.area).secretaria.nome} sobre ${o.titulo}`;
        const etiqueta = `estourado há ${GC.tempoTexto(-GC.prazoRestanteMin(o))}`;
        rec.push({ texto: `${curto} (${etiqueta})`, curto, etiqueta, tom: 'crit', link: { tipo: 'ocorrencia', id: o.id } });
      });
    store.desempenho(null).secretarias.filter((s) => naArea(s.area) && s.noPrazoPct < meta()).forEach((s) => {
      const curto = `Pedir plano de ação à ${area(s.area).secretaria.nome}`;
      rec.push({ texto: `${curto}: ${s.noPrazoPct}% no prazo (meta ${meta()}%)`, curto, etiqueta: `${s.noPrazoPct}% no prazo`, tom: 'at', link: { tipo: 'secretaria', id: s.area } });
    });
    GC.data.areas.filter((a) => naArea(a.id)).forEach((a) => ((GC.data.secretarias[a.id] || {}).metas || []).filter((m) => m.status === 'critico').forEach((m) => {
      rec.push({ texto: `Destravar a meta "${m.titulo}" (${a.secretaria.nome}, ${m.progressoPct}%, prazo ${m.prazo})`, curto: `Destravar a meta "${m.titulo}" (${a.nome})`, etiqueta: `${m.progressoPct}% · ${m.prazo}`, tom: 'at', link: { tipo: 'secretaria', id: a.id } });
    }));
    store.ocorrencias(f.areas || null).filter((o) => naGrav(o) && o.areasEnvolvidas.length > 1 && o.acaoPrefeito !== 'gabinete').forEach((o) => {
      const secs = o.areasEnvolvidas.map((x) => area(x).secretaria.nome);
      rec.push({ texto: `Convocar gabinete de crise para ${o.titulo} (${secs.join(' + ')})`, curto: `Convocar gabinete de crise para ${o.titulo}`, etiqueta: `${secs.length} secretarias`, tom: 'at', link: { tipo: 'ocorrencia', id: o.id } });
    });
    return rec.slice(0, 5);
  };
  GC.recomendacoes = (store, f) => GC.recomendacoesDetalhadas(store, f).map((r) => r.texto);

  // ---- painel da tela: 4 números, lista à esquerda, barras à direita ----
  const lista = (titulo, itens) => (itens.length ? { titulo, itens } : { titulo, itens, vazio: NADA });
  const barras = (titulo, itens, extra) => Object.assign(itens.length ? { titulo, barras: itens } : { titulo, barras: itens, vazio: NADA }, extra || {});
  const pct = (v, max) => (max ? Math.max(0, Math.min(100, Math.round((v / max) * 100))) : 0);
  const variacaoTexto = (atual, anterior, sufixo) => {
    const d = atual - anterior;
    if (!anterior || Math.abs(d) < 0.5) return '= mês anterior';
    return `${d > 0 ? '▲' : '▼'} ${sufixo === 'p.p.' ? `${Math.abs(Math.round(d))} p.p.` : `${Math.round(Math.abs(d / anterior) * 100)}%`} vs mês anterior`;
  };
  // Tendência com cor própria (nos indicadores onde é usada, subir é bom), separada da cor da meta:
  // "▼ 2 p.p." nunca sai verde só porque o valor ainda está na meta.
  const tendencia = (atual, anterior, sufixo) => {
    const d = atual - anterior;
    return { texto: variacaoTexto(atual, anterior, sufixo), tom: !anterior || Math.abs(d) < 0.5 ? '' : d > 0 ? 'ok' : 'ruim' };
  };
  // Texto ao lado do % no prazo: diz se está na meta, em vez de só repetir o número dela.
  const metaTexto = (v) => (v >= meta() ? `na meta (${meta()}%)` : `abaixo da meta de ${meta()}%`);
  // Indicadores em % (frequência, coleta no prazo) melhoram subindo; tempos e contagens, descendo.
  // A série pode dizer o contrário com melhor: 'maior' | 'menor'.
  const menorMelhor = (serie) => (serie.melhor ? serie.melhor === 'menor' : serie.unidade !== '%');

  // ---- executivo ----
  // f: { areas, grav } (fase 2). Sem filtro, os números são os de sempre.
  function executivo(store, p, f = {}) {
    const d = store.desempenho(null, f.areas || undefined);
    const sec = GC.data.secretarias;
    const areas = GC.data.areas.filter((a) => !f.areas || f.areas.includes(a.id));
    const dotacao = soma(areas.map((a) => sec[a.id].orcamento.dotacaoMi));
    const executado = Math.round(soma(areas.map((a) => sec[a.id].orcamento.dotacaoMi * sec[a.id].orcamento.executadoPct)) / dotacao);
    const resolvidas = Math.round(d.resumo.resolvidas * fator(p));
    const atencao = store.atencao(f.areas || undefined).todas.filter((o) => !f.grav || f.grav.includes(o.severidade));
    const filtrado = !!(f.areas || f.grav);
    const estouradas = filtrado ? store.ocorrencias(f.areas || null, null, 'estourado').filter((o) => !f.grav || f.grav.includes(o.severidade)).length : store.kpis().estouradas;
    const pulsos = store.pulsos();
    const desSec = d.secretarias.filter((s) => s.noFiltro);
    const pior = desSec.find((s) => s.pior);
    const quem = f.areas ? 'as secretarias do recorte' : 'a cidade';
    return {
      titulo: 'Relatório executivo do Gabinete',
      subtitulo: f.areas ? `Situação consolidada de ${areas.length === 1 ? '1 secretaria' : `${areas.length} secretarias`} (recorte)` : `Situação consolidada das ${GC.data.areas.length} secretarias`,
      kpis: [
        { id: 'orcamento', rotulo: 'Orçamento 2026', valor: mi(dotacao) },
        { id: 'executado', rotulo: 'Executado', valor: `${executado}%`, noCartao: true },
        Object.assign({ id: 'resolvidas', rotulo: 'Resolvidas no período', valor: aprox(p, resolvidas), anterior: num(d.resumo.resolvidasAnt), noCartao: true }, notaEstimativa(p) ? { detalhe: notaEstimativa(p) } : {}),
        { id: 'no-prazo', rotulo: `No prazo${sufixo30(p)}`, valor: `${d.resumo.noPrazoPct}%`, anterior: `${d.resumo.noPrazoPctAnt}%`, detalhe: `meta ${meta()}%`, noCartao: true },
        { id: 'atencao', rotulo: 'Precisam de atenção agora', valor: num(atencao.length), noCartao: true },
        Object.assign({ id: 'satisfacao', rotulo: 'Satisfação', valor: `${GC.data.indicadoresBase.satisfacaoPct}%` }, f.areas ? { detalhe: 'cidade inteira' } : {}),
      ],
      topicos: [
        `No período, ${quem} ${f.areas ? 'resolveram' : 'resolveu'} ${p === '30' ? num(resolvidas) : `cerca de ${num(resolvidas)} (${notaEstimativa(p)})`} ocorrências.`,
        `${d.resumo.noPrazoPct}% das ocorrências resolvidas nos últimos 30 dias ficaram no prazo (meta ${meta()}%).`,
        `${atencao.length === 1 ? '1 situação precisa' : `${atencao.length} situações precisam`} da atenção do prefeito agora${pior ? `; o menor índice no prazo é o de ${area(pior.area).nome} (${pior.noPrazoPct}%)` : ''}.`,
        `O orçamento ${f.areas ? 'das secretarias do recorte' : 'das secretarias'} soma ${mi(dotacao)}, com ${executado}% executado.`,
      ],
      secoes: [
        tabela('painel-secretarias', 'Painel das secretarias', ['Secretaria', 'Orçamento', 'Executado', `No prazo (30 dias)`, 'Status', 'Indicador principal'],
          areas.map((a) => {
            const pu = pulsos.find((x) => x.area === a.id);
            const s = d.secretarias.find((x) => x.area === a.id);
            return [a.secretaria.nome, mi(sec[a.id].orcamento.dotacaoMi), `${sec[a.id].orcamento.executadoPct}%`, `${s.noPrazoPct}%`, STATUS[pu.status], `${pu.rotulo}: ${pu.nivel} (${pu.variacao} ${pu.periodo})`];
          })),
        { id: 'execucao', titulo: 'Execução orçamentária', tipo: 'barras', itens: areas.map((a) => ({ rotulo: a.secretaria.nome, valor: sec[a.id].orcamento.executadoPct, texto: `${sec[a.id].orcamento.executadoPct}% de ${mi(sec[a.id].orcamento.dotacaoMi)}` })) },
        tabela('atencao-agora', 'Precisam da sua atenção agora', ['Ocorrência', 'Bairro', 'Motivo', 'Situação'],
          atencao.map((o) => [o.titulo, bairro(o.bairroId).nome, GC.motivosAtencao(o).map((m) => m.texto).join(' · '), GC.situacao(o)])),
        secaoPrazos(store, { areas: f.areas || null, grav: f.grav || null }, d.resumo),
        // Na tela já aparece como "O que fazer agora": fica só no PDF e no CSV.
        Object.assign({ id: 'recomendacoes', titulo: 'Recomendações', tipo: 'lista', soDocumento: true }, (() => { const itens = GC.recomendacoes(store, f); return itens.length ? { itens } : { itens, vazio: NADA }; })()),
      ],
      fontes: ['gabinete.orcamento_2026', 'gestao.ocorrencias', 'gestao.prazos_sla', 'ouvidoria.pesquisa_satisfacao'],
      painel: {
        kpis: [
          Object.assign({ rotulo: 'Resolvidas', valor: aprox(p, resolvidas) }, p === '30' ? { tendencia: tendencia(d.resumo.resolvidas, d.resumo.resolvidasAnt) } : { detalhe: notaEstimativa(p) }),
          // Duas leituras, duas cores: a tendência (vs mês anterior) e a situação frente à meta.
          { rotulo: `No prazo${sufixo30(p)}`, valor: `${d.resumo.noPrazoPct}%`, tendencia: tendencia(d.resumo.noPrazoPct, d.resumo.noPrazoPctAnt, 'p.p.'), detalhe: metaTexto(d.resumo.noPrazoPct), tom: d.resumo.noPrazoPct >= meta() ? 'ok' : 'ruim' },
          { rotulo: 'Precisam de atenção', valor: num(atencao.length), detalhe: `${estouradas} com prazo estourado`, tom: estouradas ? 'ruim' : 'ok' },
          { rotulo: 'Orçamento executado', valor: `${executado}%`, detalhe: `de ${mi(dotacao)}` },
        ],
        esquerda: lista('O que fazer agora', GC.recomendacoesDetalhadas(store, f).map((r) => ({ texto: r.curto, etiqueta: r.etiqueta, tom: r.tom, link: r.link }))),
        direita: barras('Secretarias · % no prazo', desSec.map((s) => {
          const pu = pulsos.find((x) => x.area === s.area);
          // Sem a etiqueta do indicador-chave: ao lado do % no prazo ela parecia contradizê-lo
          // ("92% · Crítico"). O indicador-chave segue na tabela "Painel das secretarias" e na página da secretaria.
          return { rotulo: area(s.area).nome, valor: s.noPrazoPct, texto: `${s.noPrazoPct}%`, tom: s.noPrazoPct < meta() ? 'ruim' : '', link: { tipo: 'secretaria', id: s.area },
            dica: `${pu.rotulo}: ${pu.nivel} (${STATUS[pu.status]})` };
        }), { meta: meta(), nota: `linha verde = meta ${meta()}%`, legenda: 'Barra: % das ocorrências resolvidas no prazo nos últimos 30 dias (vermelha abaixo da meta). Clique numa secretaria para ver o detalhe.' }),
      },
    };
  }

  // ---- secretaria ----
  function secretaria(store, p, id, f = {}) {
    const pg0 = store.paginaSecretaria(id);
    // Gravidade (fase 2): vale para os alertas ativos da pasta e tudo o que é contado neles.
    const pg = f.grav ? Object.assign({}, pg0, { alertas: pg0.alertas.filter((o) => f.grav.includes(o.severidade)) }) : pg0;
    const s = store.desempenho(null).secretarias.find((x) => x.area === id);
    const ant = store.desempenho(null, [id]).resumo;
    const serie = pg.serie;
    // Meses do período: em dias, os 2 últimos meses (a série é mensal); em meses, o intervalo escolhido.
    const pi = info(p);
    const inicio = pi.de !== undefined ? pi.de : 10;
    const fim = pi.de !== undefined ? pi.ate : 11;
    const criticas = pg.metas.filter((m) => m.status === 'critico');
    // Meta da série mês a mês: a que valia no fim de cada mês (GC.metaVigente: pactuada ou do catálogo). Sem
    // indicador do catálogo ligado à série, a meta escrita na série. A série termina no mês passado (índice 11).
    const indSerie = (GC.CATALOGO_INDICADORES || []).find((i) => i.serieArea === id);
    const metaNoMes = (k) => {
      if (!indSerie || !GC.metaVigente || !GC.relogio) return serie.meta;
      const mes = GC.somarMeses(GC.relogio.hoje.slice(0, 7), k - 12);
      return GC.metaVigente(indSerie, { em: GC.fimDoMes(mes) }).valor;
    };
    const metaPeriodo = metaNoMes(fim);
    // Metas pactuadas da pasta (js/pactos.js): uma linha por indicador do catálogo, com o último ciclo apurado.
    const indsPasta = (() => {
      if (!GC.avaliarIndicadores || !GC.contextoIndicadores) return [];
      try { return GC.avaliarIndicadores(GC.contextoIndicadores(store), { area: id }); } catch (e) { return []; }
    })();
    const RITMO = { no_ritmo: 'No ritmo', atrasado: 'Atrasado' };
    const SIT_IND = { ok: 'Na meta', atencao: 'Perto da meta', critico: 'Fora da meta', sem_dado: 'Sem dado' };
    const fmtInd = (v, u) => (GC.formatarIndicador ? GC.formatarIndicador(v, u) : v);
    const ultimoCiclo = (indId) => {
      const p = GC.pactos && GC.pactos.pacto(indId);
      const c = p && (p.ciclos || []).filter((x) => x.resultado !== 'substituida').pop();
      return c ? `${c.prazo.split('-').reverse().join('/')}: ${c.resultado === 'cumprida' ? 'cumprida' : 'não cumprida'}` : '—';
    };
    const pactuadas = indsPasta.filter((i) => i.metaPactuada);
    // Pasta sem unidades (ou com unidades sem métricas): a tabela sai só com nome, bairro e situação.
    const colunasUnid = ['Unidade', 'Bairro', ...((pg.unidades[0] || {}).metricas || []).map((m) => m.rotulo), 'Situação'];
    return {
      titulo: `Relatório da ${pg.secretaria.nome}`,
      subtitulo: 'Indicadores, evolução, metas, unidades e alertas da pasta',
      kpis: [
        { id: 'orcamento', rotulo: 'Orçamento 2026', valor: mi(pg.orcamento.dotacaoMi) },
        { id: 'executado', rotulo: 'Executado', valor: `${pg.orcamento.executadoPct}%`, noCartao: true },
        { id: 'no-prazo', rotulo: `No prazo${sufixo30(p)}`, valor: `${s.noPrazoPct}%`, anterior: `${ant.noPrazoPctAnt}%`, detalhe: `meta ${meta()}%`, noCartao: true },
        { id: 'tempo-medio', rotulo: `Tempo médio${sufixo30(p)}`, valor: horas(s.tempoMedioH), anterior: horas(ant.tempoMedioHAnt) },
        { id: 'alertas', rotulo: 'Alertas ativos', valor: num(pg.alertas.length), noCartao: true },
        { id: 'status', rotulo: 'Status', valor: STATUS[pg.status] },
      ],
      topicos: [
        `${pg.pulso.rotulo}: ${pg.pulso.nivel} (${pg.pulso.variacao} ${pg.pulso.periodo}), com meta de ${valorSerie(serie.meta, serie.unidade)}${indSerie && indsPasta.some((i) => i.id === indSerie.id && i.metaPactuada) ? ' (pactuada)' : ''}.`,
        `Nos últimos 30 dias, ${s.noPrazoPct}% das ocorrências da pasta foram resolvidas no prazo (meta ${meta()}%).`,
        criticas.length ? `${criticas.length === 1 ? 'Um compromisso do plano de governo está crítico' : `${criticas.length} compromissos do plano de governo estão críticos`}: ${criticas.map((m) => `"${m.titulo}" (${m.progressoPct}%)`).join(', ')}.` : 'Nenhum compromisso do plano de governo está crítico.',
        `Há ${pg.alertas.length} ${pg.alertas.length === 1 ? 'alerta ativo' : 'alertas ativos'} na pasta.`,
      ],
      secoes: [
        tabela('evolucao', `Evolução · ${serie.rotulo}`, ['Mês', 'Valor', 'Meta'],
          serie.meses.slice(inicio, fim + 1).map((v, i) => [rotuloMes(inicio + i), valorSerie(v, serie.unidade), valorSerie(metaNoMes(inicio + i), serie.unidade)])),
        tabela('metas', 'Compromissos do plano de governo', ['Compromisso', 'Progresso', 'Prazo', 'Situação'],
          pg.metas.map((m) => [m.titulo, `${m.progressoPct}%`, m.prazo, STATUS_META[m.status]])),
        secaoEntregas(p, { area: id }, 'bairro'),
        tabela('metas-pactuadas', `Metas pactuadas · ${pactuadas.length} de ${indsPasta.length}`, ['Indicador', 'Agora', 'Meta de referência', 'Meta pactuada', 'Situação', 'Ritmo', 'Último ciclo'],
          indsPasta.map((i) => [i.nome, fmtInd(i.valorAtual, i.unidade), fmtInd(i.metaDoPlano, i.unidade),
            i.metaPactuada ? `${fmtInd(i.metaAtual, i.unidade)} até ${String(i.prazoPactuado).split('-').reverse().join('/')}${i.pactoVencido ? ' (vencida)' : ''}` : '—',
            SIT_IND[i.situacao], i.ritmo ? RITMO[i.ritmo] : '—', ultimoCiclo(i.id)])),
        tabela('unidades', 'Unidades', colunasUnid, pg.unidades.map((u) => [u.nome, bairro(u.bairroId).nome, ...(u.metricas || []).map((m) => m.valor), SITUACAO[u.situacao]])),
        tabela('alertas-ativos', 'Alertas ativos', ['Ocorrência', 'Bairro', 'Gravidade', 'Situação'],
          pg.alertas.map((o) => [o.titulo, bairro(o.bairroId).nome, SEV[o.severidade], GC.situacao(o)])),
        secaoPrazos(store, { areas: [id], grav: f.grav || null }, Object.assign({}, ant, { atendidoPct: s.atendidoPct, noPrazoPct: s.noPrazoPct })),
      ],
      fontes: [pg.base.fonte, 'gestao.ocorrencias', 'gabinete.orcamento_2026', 'planejamento.metas_governo', ...(pactuadas.length ? ['gabinete.metas_pactuadas'] : [])],
      painel: (() => {
        // O gráfico mostra no mínimo 6 meses (2 barras não contam história); os meses fora do
        // período escolhido aparecem esmaecidos, como contexto.
        const iniGrafico = Math.min(inicio, Math.max(0, fim - 5));
        const janelaMeses = serie.meses.slice(iniGrafico, fim + 1);
        const max = Math.max(...janelaMeses, metaPeriodo);
        const menor = menorMelhor(serie);
        const pior = (v) => (menor ? v > metaPeriodo : v < metaPeriodo);
        const estouradas = pg.alertas.filter(GC.estourada).length;
        return {
          kpis: [
            { rotulo: pg.pulso.rotulo, valor: pg.pulso.nivel, detalhe: `${pg.pulso.variacao} ${pg.pulso.periodo}`, tom: pg.pulso.positivo ? 'ok' : 'ruim' },
            { rotulo: `No prazo${sufixo30(p)}`, valor: `${s.noPrazoPct}%`, detalhe: metaTexto(s.noPrazoPct), tom: s.noPrazoPct >= meta() ? 'ok' : 'ruim' },
            { rotulo: 'Alertas ativos', valor: num(pg.alertas.length), detalhe: estouradas ? `${estouradas} com prazo estourado` : 'nenhum com prazo estourado', tom: estouradas ? 'ruim' : 'ok' },
            { rotulo: 'Orçamento executado', valor: `${pg.orcamento.executadoPct}%`, detalhe: `de ${mi(pg.orcamento.dotacaoMi)}` },
          ],
          esquerda: lista('Compromissos do plano de governo', pg.metas.map((m) => ({ texto: m.titulo, etiqueta: `${m.progressoPct}% · ${m.prazo}`, tom: { critico: 'crit', atencao: 'at' }[m.status] || 'ok', progresso: m.progressoPct }))),
          direita: barras(`Evolução · ${serie.rotulo}`, janelaMeses.map((v, i) => Object.assign(
            { rotulo: rotuloMes(iniGrafico + i), valor: pct(v, max), texto: valorSerie(v, serie.unidade), tom: pior(v) ? 'ruim' : '' },
            iniGrafico + i < inicio ? { contexto: true } : {})),
          { meta: pct(metaPeriodo, max), nota: `linha verde = meta ${valorSerie(metaPeriodo, serie.unidade)}`,
            legenda: `${menor ? 'Menor' : 'Maior'} é melhor: barra vermelha = pior que a meta.${iniGrafico < inicio ? ' Meses esmaecidos ficam fora do período escolhido.' : ''}` }),
        };
      })(),
    };
  }

  // ---- bairro ----
  function relBairro(store, p, id, f = {}) {
    const b = bairro(id);
    const ativas = store.ocorrencias(null, id).filter((o) => !f.grav || f.grav.includes(o.severidade));
    const estouradas = ativas.filter(GC.estourada).length;
    const sat = GC.data.satisfacaoPorBairro[id];
    const satCidade = GC.data.indicadoresBase.satisfacaoPct;
    const hist = GC.data.historico30d;
    const casosArea = GC.data.areas.map((a) => ({ a, n: (hist[a.id] || {})[id] || 0, total: soma(Object.values(hist[a.id] || {})) }));
    const casos = soma(casosArea.map((x) => x.n));
    const casosCidade = soma(casosArea.map((x) => x.total));
    const popCidade = soma(GC.data.bairros.map((x) => x.populacao));
    const maior = casosArea.slice().sort((x, y) => y.n - x.n)[0];
    const porMil = (n, pop) => (n * 1000 / pop).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const unidades = GC.data.areas.flatMap((a) => (GC.data.secretarias[a.id].unidades || []).filter((u) => u.bairroId === id)
      .map((u) => [u.nome, a.secretaria.nome, SITUACAO[u.situacao]]));
    return {
      titulo: `Relatório do bairro ${b.nome}`,
      subtitulo: 'Visão intersetorial: todas as secretarias no mesmo bairro',
      kpis: [
        { id: 'populacao', rotulo: 'População', valor: num(b.populacao) },
        { id: 'ativas', rotulo: 'Ocorrências ativas', valor: num(ativas.length), noCartao: true },
        { id: 'estourados', rotulo: 'Prazos estourados', valor: num(estouradas), noCartao: true },
        { id: 'satisfacao', rotulo: 'Satisfação', valor: `${sat}%`, detalhe: `cidade: ${satCidade}%`, noCartao: true },
        { id: 'casos', rotulo: 'Casos registrados (30 dias)', valor: num(casos), noCartao: true },
      ],
      topicos: [
        `${b.nome} tem ${num(b.populacao)} moradores e ${ativas.length} ${ativas.length === 1 ? 'ocorrência ativa' : 'ocorrências ativas'} agora${estouradas ? `, ${estouradas} com prazo estourado` : ''}.`,
        `A satisfação é de ${sat}% (cidade: ${satCidade}%).`,
        maior.n ? `${maior.a.nome} concentra os casos do bairro nos últimos 30 dias (${maior.n}).` : 'Não houve casos registrados no bairro nos últimos 30 dias.',
      ],
      secoes: [
        tabela('comparacao', 'Comparação com a média da cidade', ['Indicador', b.nome, 'Média por bairro'], [
          ...casosArea.map((x) => [`${x.a.nome}: casos em 30 dias`, num(x.n), (x.total / GC.data.bairros.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })]),
          ['Casos por mil habitantes (30 dias)', porMil(casos, b.populacao), porMil(casosCidade, popCidade)],
          ['Satisfação', `${sat}%`, `${satCidade}%`],
        ]),
        tabela('unidades', 'Unidades no bairro', ['Unidade', 'Secretaria', 'Situação'], unidades),
        secaoEntregas(p, { bairro: id, areas: f.areas || null }, 'secretaria'),
        tabela('ocorrencias', 'Ocorrências ativas no bairro', ['Ocorrência', 'Secretaria', 'Gravidade', 'Situação'],
          ativas.map((o) => [o.titulo, area(o.area).secretaria.nome, SEV[o.severidade], GC.situacao(o)])),
        secaoPrazos(store, { bairro: id, areas: f.areas || null, grav: f.grav || null }, store.desempenho(id).resumo, true),
      ],
      fontes: ['planejamento.bairros', 'gestao.ocorrencias', 'ouvidoria.pesquisa_satisfacao', 'unidades das secretarias'],
      painel: (() => {
        const nBairros = GC.data.bairros.length;
        const comCasos = casosArea.filter((x) => x.n > 0 || x.total > 0);
        const max = Math.max(1, ...comCasos.map((x) => Math.max(x.n, x.total / nBairros)));
        return {
          kpis: [
            { rotulo: 'Ocorrências ativas', valor: num(ativas.length) },
            { rotulo: 'Prazos estourados', valor: num(estouradas), tom: estouradas ? 'ruim' : 'ok' },
            { rotulo: 'Satisfação', valor: `${sat}%`, detalhe: `cidade: ${satCidade}%`, tom: sat >= satCidade ? 'ok' : 'ruim' },
            { rotulo: 'Casos registrados (30 dias)', valor: num(casos), detalhe: `${porMil(casos, b.populacao)} por mil hab.` },
          ],
          esquerda: lista('Ocorrências ativas no bairro', ativas.map((o) => {
            const m = GC.motivosAtencao(o)[0];
            return { texto: o.titulo, etiqueta: m ? m.texto : GC.situacao(o), tom: GC.estourada(o) ? 'crit' : m ? 'at' : '', link: { tipo: 'ocorrencia', id: o.id } };
          })),
          direita: barras('Casos por secretaria (30 dias)', comCasos.map((x) => {
            const media = x.total / nBairros;
            // Vermelho só quando passa bem da média (mais de 1,5×); a média aparece como traço na barra.
            return { rotulo: x.a.nome, valor: pct(x.n, max), marca: pct(media, max), texto: `${x.n} · média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, tom: x.n > media * 1.5 && x.n - media >= 1 ? 'ruim' : '', link: { tipo: 'secretaria', id: x.a.id } };
          }), { nota: 'traço = média por bairro', legenda: 'Barra: casos do bairro em 30 dias. Traço escuro: média por bairro. Vermelho: mais de 1,5× a média.' }),
        };
      })(),
    };
  }

  // ---- entregas ----
  // A agenda de entregas (js/data-entregas.js, a mesma da tela #/entregas): entregues no período, o que vem nos
  // próximos 90 dias, o que está fora do prazo (atrasada, parada ou em risco), inaugurações e remarcações.
  // Alvo: um bairro ou '-' (a cidade); f.areas: recorte de secretarias. Relatório interno: "em risco" aparece.
  const PESO_FORA = { parada: 0, atrasada: 1, em_risco: 2 };
  function relEntregas(store, p, alvo, f = {}) {
    const hoje = GC.relogio.hoje;
    const b = alvo && alvo !== '-' ? bairro(alvo) : null;
    const todas = GC.entregas ? GC.entregas.lista({ areas: f.areas || null, bairro: b ? b.id : null }) : [];
    const [de, ate] = janelaEntregas(p);
    const data = (iso) => iso.split('-').reverse().join('/');
    const onde = (e) => (e.bairroId ? bairro(e.bairroId).nome : 'Cidade inteira');
    const nomeArea = (id) => area(id).nome;
    const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
    const comData = (e) => `${data(e.dataAtual)}${e.remarcada ? ` (era ${data(e.dataOriginal)})` : ''}`;
    const reg = (e) => e.registro || { remarcacoes: [] };

    const entregues = todas.filter((e) => e.situacao === 'entregue' && e.dataAtual >= de && e.dataAtual <= ate).reverse();
    const abertas = todas.filter((e) => e.situacao !== 'entregue');
    const em90 = new Date(Date.parse(hoje) + 90 * 86400000).toISOString().slice(0, 10);
    const proximas = abertas.filter((e) => e.dataAtual >= hoje && e.dataAtual <= em90);
    const fora = abertas.filter((e) => e.situacao in PESO_FORA)
      .sort((x, y) => PESO_FORA[x.situacao] - PESO_FORA[y.situacao] || x.dataAtual.localeCompare(y.dataAtual));
    const conta = (s) => fora.filter((e) => e.situacao === s).length;
    const partesFora = [['atrasada', 'atrasada', 'atrasadas'], ['parada', 'parada', 'paradas'], ['em_risco', 'em risco', 'em risco']]
      .filter(([s]) => conta(s)).map(([s, um, varios]) => plural(conta(s), um, varios));
    const noPrazo = abertas.filter((e) => e.situacao === 'no_prazo').length;
    const noPrazoPct = abertas.length ? Math.round((noPrazo / abertas.length) * 100) : null;
    const inaug = todas.filter((e) => reg(e).inauguracao && reg(e).inauguracao.dia >= hoje)
      .sort((x, y) => reg(x).inauguracao.dia.localeCompare(reg(y).inauguracao.dia));
    const remarcacoes = todas.flatMap((e) => (reg(e).remarcacoes || []).map((ev) => ({ e, ev }))).sort((x, y) => y.ev.em - x.ev.em);
    const motivo = (m) => ((GC.MOTIVOS_REMARCAR || {})[m] || m);
    // Por secretaria: só as que têm alguma entrega no recorte.
    const porArea = GC.data.areas.filter((a) => !f.areas || f.areas.includes(a.id)).map((a) => {
      const l = todas.filter((e) => e.area === a.id);
      return { a, entregues: entregues.filter((e) => e.area === a.id).length, abertas: l.filter((e) => e.situacao !== 'entregue').length, fora: fora.filter((e) => e.area === a.id).length };
    }).filter((x) => x.entregues || x.abertas);

    return {
      titulo: `Relatório de entregas${b ? ` · ${b.nome}` : ''}`,
      subtitulo: b ? 'O que o bairro recebeu e o que vem por aí' : 'O que a prefeitura entregou, o que vem por aí e o que está fora do prazo',
      kpis: [
        { id: 'entregues', rotulo: 'Entregues no período', valor: num(entregues.length), noCartao: true },
        { id: 'a-entregar', rotulo: 'A entregar', valor: num(abertas.length) },
        { id: 'proximas-90', rotulo: 'Próximos 90 dias', valor: num(proximas.length), noCartao: true },
        { id: 'fora-do-prazo', rotulo: 'Fora do prazo', valor: num(fora.length), detalhe: partesFora.join(', ') || 'todas no prazo', noCartao: true },
        { id: 'no-prazo', rotulo: 'A entregar no prazo', valor: noPrazoPct === null ? '—' : `${noPrazoPct}%`, noCartao: true },
        { id: 'inauguracoes', rotulo: 'Inaugurações marcadas', valor: num(inaug.length) },
      ],
      topicos: [
        `${plural(entregues.length, 'entrega feita', 'entregas feitas')} no período${b ? ` em ${b.nome}` : ''}; ${plural(abertas.length, 'a entregar', 'a entregar')}, ${num(proximas.length)} nos próximos 90 dias.`,
        fora.length ? `${plural(fora.length, 'entrega está fora do prazo', 'entregas estão fora do prazo')} (${partesFora.join(', ')}). A mais grave: ${fora[0].titulo}, ${GC.entregas.situacaoEmPalavras(fora[0])}.`
          : 'Todas as entregas a fazer estão no prazo.',
        inaug.length ? `${plural(inaug.length, 'inauguração marcada', 'inaugurações marcadas')}; a próxima é ${inaug[0].titulo}, em ${data(reg(inaug[0]).inauguracao.dia)}.` : 'Nenhuma inauguração marcada.',
      ],
      secoes: [
        tabela('entregues', 'Entregues no período', ['Entrega', 'Secretaria', 'Onde', 'Data'],
          entregues.map((e) => [e.titulo, nomeArea(e.area), onde(e), data(e.dataAtual)])),
        tabela('proximas', 'Próximos 90 dias', ['Entrega', 'Secretaria', 'Onde', 'Previsão', 'Situação'],
          proximas.map((e) => [e.titulo, nomeArea(e.area), onde(e), comData(e), situacaoEntrega(e)])),
        tabela('fora-do-prazo', 'Fora do prazo (atrasadas, paradas e em risco)', ['Entrega', 'Secretaria', 'Onde', 'Previsão', 'Situação'],
          fora.map((e) => [e.titulo, nomeArea(e.area), onde(e), comData(e), situacaoEntrega(e)])),
        tabela('inauguracoes', 'Inaugurações marcadas', ['Entrega', 'Dia', 'Hora', 'Local'],
          inaug.map((e) => [e.titulo, data(reg(e).inauguracao.dia), reg(e).inauguracao.hora, reg(e).inauguracao.local])),
        tabela('remarcacoes', 'Remarcações', ['Entrega', 'De', 'Para', 'Motivo'],
          remarcacoes.map(({ e, ev }) => [e.titulo, data(ev.de), data(ev.data), `${motivo(ev.motivo)}${ev.texto ? `: ${ev.texto}` : ''}`])),
        tabela('por-secretaria', 'Por secretaria', ['Secretaria', 'Entregues no período', 'A entregar', 'Fora do prazo'],
          porArea.map((x) => [x.a.secretaria.nome, num(x.entregues), num(x.abertas), num(x.fora)])),
      ],
      fontes: ['obras.cronograma', 'planejamento.entregas'],
      painel: (() => {
        const max = Math.max(1, ...porArea.map((x) => x.abertas + x.entregues));
        const item = (e, etiqueta, tom) => ({ texto: `${e.titulo} · ${nomeArea(e.area)}`, etiqueta, tom });
        return {
          kpis: [
            { rotulo: 'Entregues no período', valor: num(entregues.length), tom: 'ok' },
            { rotulo: 'Próximos 90 dias', valor: num(proximas.length), detalhe: `${num(abertas.length)} a entregar ao todo` },
            { rotulo: 'Fora do prazo', valor: num(fora.length), detalhe: partesFora.join(', ') || 'todas no prazo', tom: fora.length ? 'ruim' : 'ok' },
            { rotulo: 'Inaugurações marcadas', valor: num(inaug.length), detalhe: inaug.length ? `a próxima em ${data(reg(inaug[0]).inauguracao.dia)}` : '' },
          ],
          // Sem nada fora do prazo, a lista mostra o que vem por aí.
          esquerda: fora.length
            ? lista('Fora do prazo', fora.map((e) => item(e, GC.entregas.rotulo(e), e.situacao === 'em_risco' ? 'at' : 'crit')))
            : lista('Próximas entregas', proximas.map((e) => item(e, data(e.dataAtual), ''))),
          direita: barras('Entregas por secretaria', porArea.map((x) => ({
            rotulo: x.a.nome, valor: pct(x.abertas + x.entregues, max),
            texto: `${plural(x.entregues, 'entregue', 'entregues')} · ${num(x.abertas)} a entregar${x.fora ? ` · ${num(x.fora)} fora do prazo` : ''}`,
            tom: x.fora ? 'ruim' : '', link: { tipo: 'secretaria', id: x.a.id },
          })), { legenda: 'Barra: entregues no período mais as a entregar. Vermelho: a secretaria tem entrega fora do prazo.' }),
        };
      })(),
    };
  }

  // Arredonda as partes sem perder a soma: maiores restos levam a unidade que sobra.
  function repartir(partes, total) {
    const base = partes.map(Math.floor);
    let falta = total - soma(base);
    partes.map((v, i) => [v - base[i], i]).sort((x, y) => y[0] - x[0])
      .forEach(([, i]) => { if (falta > 0) { base[i]++; falta--; } });
    return base;
  }

  // ---- alertas ----
  // fl: { areas } (fase 2). Com recorte, só as regras das secretarias escolhidas; a curva mensal é a da
  // cidade vezes a parte do recorte nos 30 dias (estimativa, e a legenda diz).
  function alertas(store, p, fl = {}) {
    const f = fator(p);
    const d = store.desempenho(null, fl.areas || undefined).resumo;
    const todasRegras = Object.entries(GC.data.regras).map(([tipo, r]) => ({ tipo, r, area: GC.areaDoTipo(tipo) }));
    const regras = fl.areas ? todasRegras.filter((x) => x.area && fl.areas.includes(x.area)) : todasRegras;
    const parte = fl.areas ? soma(regras.map((x) => x.r.disparos30d)) / (GC.alertas30d() || 1) : 1;
    const curva = () => GC.alertasPorMes().map((v) => Math.round(v * parte));
    const total = Math.round(GC.alertas30d() * parte * f);
    const criticas = store.ocorrencias(fl.areas || null, null, 'criticas').length;
    const top = regras.slice().sort((a, b) => b.r.disparos30d - a.r.disparos30d)[0];
    const desemp = store.desempenho(null).secretarias;
    const areasRel = GC.data.areas.filter((a) => !fl.areas || fl.areas.includes(a.id));
    const grupos = areasRel.map((a) => ({ id: a.id, curto: a.nome, nome: a.secretaria.nome, n: soma(regras.filter((x) => x.area === a.id).map((x) => x.r.disparos30d)), prazo: `${desemp.find((s) => s.area === a.id).noPrazoPct}%` }));
    const semArea = fl.areas ? 0 : soma(regras.filter((x) => !x.area).map((x) => x.r.disparos30d));
    if (semArea) grupos.push({ curto: 'Outras', nome: 'Outras', n: semArea, prazo: '—' });
    const repartido = repartir(grupos.map((g) => g.n * f), total);
    const porArea = grupos.map((g, i) => [g.nome, String(repartido[i]), g.prazo]);
    const hist = GC.data.historico30d;
    const porBairro = GC.data.bairros.map((b) => [b.nome, soma(areasRel.map((a) => (hist[a.id] || {})[b.id] || 0))]).sort((x, y) => y[1] - x[1]);
    const secoes = [
      tabela('por-secretaria', 'Por secretaria', ['Secretaria', 'Disparos', 'No prazo (30 dias)'], porArea),
      tabela('por-regra', 'Por regra', ['Tipo', 'Regra', 'Expressão técnica', 'Fontes', 'Disparos (30 dias)'],
        regras.slice().sort((a, b) => b.r.disparos30d - a.r.disparos30d).map((x) => [x.tipo, regraTexto(x.r), x.r.expressao, x.r.fontes.join(' × '), String(x.r.disparos30d)])),
      tabela('por-bairro', 'Casos registrados por bairro (30 dias)', ['Bairro', 'Casos'], porBairro.map(([n, c]) => [n, String(c)])),
    ];
    if (emMeses(p)) {
      const m = curva();
      const { de: ini, ate } = info(p);
      const max = Math.max(...m.slice(ini, ate + 1));
      secoes.push({ id: 'por-mes', titulo: fl.areas ? 'Por mês (estimativa do recorte)' : 'Por mês', tipo: 'barras', itens: m.slice(ini, ate + 1).map((v, i) => ({ rotulo: rotuloMes(ini + i), valor: Math.round((v / max) * 100), texto: `${v} alertas` })) });
    }
    return {
      titulo: 'Relatório de alertas e monitoramento',
      subtitulo: 'Desempenho das regras automáticas e da resposta das secretarias',
      kpis: [
        Object.assign({ id: 'disparados', rotulo: 'Alertas disparados', valor: p === '7' ? aprox(p, total) : num(total), anterior: num(curva()[10]), noCartao: true }, p === '7' ? { detalhe: notaEstimativa(p) } : {}),
        { id: 'criticos', rotulo: 'Críticos agora', valor: num(criticas), noCartao: true },
        { id: 'no-prazo', rotulo: `Resolvidas no prazo${sufixo30(p)}`, valor: `${d.noPrazoPct}%`, anterior: `${d.noPrazoPctAnt}%`, detalhe: `meta ${meta()}%`, noCartao: true },
        { id: 'tempo-medio', rotulo: `Tempo médio de resposta${sufixo30(p)}`, valor: horas(d.tempoMedioH), anterior: horas(d.tempoMedioHAnt), noCartao: true },
      ],
      topicos: [
        `No período, as regras automáticas dispararam ${p === '7' ? `cerca de ${num(total)} (${notaEstimativa(p)})` : num(total)} alertas.`,
        `Nos últimos 30 dias, ${d.noPrazoPct}% das ocorrências${fl.areas ? ' das secretarias do recorte' : ''} foram resolvidas no prazo, com tempo médio de ${horas(d.tempoMedioH)}.`,
        top ? `A regra que mais disparou foi a de ${top.tipo} (${top.r.disparos30d} vezes em 30 dias).` : 'Nenhuma regra automática das secretarias do recorte disparou nos últimos 30 dias.',
      ],
      secoes,
      fontes: ['monitoramento.regras', 'monitoramento.alertas', 'gestao.ocorrencias', 'planejamento.bairros'],
      painel: (() => {
        const kpis = [
          { rotulo: 'Alertas disparados', valor: p === '7' ? aprox(p, total) : num(total), detalhe: p === '30' ? 'nos últimos 30 dias' : p === '7' ? notaEstimativa(p) : 'no período' },
          { rotulo: 'Críticos agora', valor: num(criticas), tom: criticas ? 'ruim' : 'ok' },
          { rotulo: `No prazo${sufixo30(p)}`, valor: `${d.noPrazoPct}%`, detalhe: metaTexto(d.noPrazoPct), tom: d.noPrazoPct >= meta() ? 'ok' : 'ruim' },
          { rotulo: `Tempo médio${sufixo30(p)}`, valor: horas(d.tempoMedioH) },
        ];
        const topo = regras.slice().sort((a, b) => b.r.disparos30d - a.r.disparos30d).slice(0, 5)
          .map((x) => ({ texto: `${x.tipo.charAt(0).toUpperCase()}${x.tipo.slice(1)}: ${regraTexto(x.r)}`, dica: `Regra técnica: ${x.r.expressao}`, etiqueta: `${x.r.disparos30d}× em 30 dias`, tom: '' }));
        let direita;
        if (emMeses(p)) {
          const m = curva();
          const { de: ini, ate } = info(p);
          const max = Math.max(...m.slice(ini, ate + 1));
          direita = barras('Disparos por mês', m.slice(ini, ate + 1).map((v, i) => ({ rotulo: rotuloMes(ini + i), valor: pct(v, max), texto: String(v) })), fl.areas ? { legenda: 'Estimativa: a curva mensal da cidade vezes a parte das secretarias do recorte nos últimos 30 dias.' } : null);
        } else {
          const max = Math.max(1, ...repartido);
          // Nome curto ("Secretaria de ..." não cabe no rótulo) e do maior para o menor.
          direita = barras('Disparos por secretaria', grupos
            .map((g, i) => ({ g, n: repartido[i] }))
            .sort((x, y) => y.n - x.n)
            .map(({ g, n }) => Object.assign({ rotulo: g.curto, valor: pct(n, max), texto: String(n) }, g.id ? { link: { tipo: 'secretaria', id: g.id } } : {})));
        }
        return { kpis, esquerda: lista('Regras que mais dispararam', topo), direita };
      })(),
    };
  }

  // ---- comparação lado a lado: bairros, secretarias ou dois períodos ----
  // Spec: "Relatórios de comparação" em docs/specs/2026-11-12-vila-dourada-relatorios-personalizaveis-design.md.
  // O alvo diz o modo: 'bairros:<id>,<id>', 'secretarias:<id>,<id>' (2 a 4) ou 'periodos:m<de>-<ate>' (o período A;
  // o B é o período do relatório). Os números vêm das mesmas fontes dos relatórios de bairro e de secretaria.
  GC.LIMITES_COMPARACAO = { min: 2, max: 4 };
  GC.lerAlvoComparacao = function (alvo) {
    const m = /^(bairros|secretarias|periodos):(.+)$/.exec(String(alvo || ''));
    if (!m) return null;
    if (m[1] === 'periodos') return /^m\d/.test(m[2]) && GC.periodoInfo(m[2]) ? { modo: 'periodos', base: m[2] } : null;
    const validos = (m[1] === 'bairros' ? GC.data.bairros : GC.data.areas).map((x) => x.id);
    const ids = [...new Set(m[2].split(','))].filter((id) => validos.includes(id));
    return ids.length >= GC.LIMITES_COMPARACAO.min && ids.length <= GC.LIMITES_COMPARACAO.max ? { modo: m[1], ids } : null;
  };
  GC.alvoComparacao = (c) => (c.modo === 'periodos' ? `periodos:${c.base}` : `${c.modo}:${c.ids.join(',')}`);
  // Padrões: os dois primeiros bairros (ou secretarias); períodos: 3 meses anteriores (A) × os 3 últimos (B).
  GC.comparacaoPadrao = (modo = 'bairros') => (modo === 'periodos' ? { alvo: 'periodos:m6-8', periodo: 'm9-11' }
    : { alvo: `${modo}:${(modo === 'secretarias' ? GC.data.areas : GC.data.bairros).slice(0, 2).map((x) => x.id).join(',')}`, periodo: '30' });

  const dec = (n, casas = 1) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const eNomes = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
  // O maior e o menor de uma lista de { nome, v }: "pior em X (n), melhor em Y (m)" no lado do "ruim".
  function extremos(lista, ruimAlto, fmt) {
    const ord = lista.slice().sort((a, b) => b.v - a.v);
    const [alto, baixo] = [ord[0], ord[ord.length - 1]];
    if (alto.v === baixo.v) return null;
    const [pior, melhor] = ruimAlto ? [alto, baixo] : [baixo, alto];
    return { pior, melhor, etiqueta: `${fmt(pior.v)} × ${fmt(melhor.v)}`, texto: `pior em ${pior.nome}, melhor em ${melhor.nome}` };
  }

  function compBairros(store, ids) {
    const hist = GC.data.historico30d;
    const nB = GC.data.bairros.length;
    const satCidade = GC.data.indicadoresBase.satisfacaoPct;
    const popCidade = soma(GC.data.bairros.map((x) => x.populacao));
    const todas = store.ocorrencias();
    const crit = (o) => o.severidade === 'critica';
    const casosCidade = soma(GC.data.areas.map((a) => soma(Object.values(hist[a.id] || {}))));
    const mediaPorMil = (casosCidade * 1000) / popCidade;
    const dados = ids.map((id) => {
      const b = bairro(id);
      const ativas = store.ocorrencias(null, id);
      const casosArea = GC.data.areas.map((a) => (hist[a.id] || {})[id] || 0);
      const casos = soma(casosArea);
      return { b, nome: b.nome, ativas, criticas: ativas.filter(crit).length, estouradas: ativas.filter(GC.estourada).length, sat: GC.data.satisfacaoPorBairro[id], casos, casosArea, porMil: (casos * 1000) / b.populacao };
    });
    const nomes = dados.map((x) => x.nome);
    const linha = (rotulo, f, media) => [rotulo, ...dados.map(f), media];
    const comparativo = [
      linha('População', (x) => num(x.b.populacao), num(Math.round(popCidade / nB))),
      linha('Ocorrências ativas', (x) => num(x.ativas.length), dec(todas.length / nB)),
      linha('Ocorrências críticas', (x) => num(x.criticas), dec(todas.filter(crit).length / nB)),
      linha('Prazos estourados', (x) => num(x.estouradas), dec(todas.filter(GC.estourada).length / nB)),
      linha('Satisfação', (x) => `${x.sat}%`, `${satCidade}%`),
      linha('Casos registrados (30 dias)', (x) => num(x.casos), dec(casosCidade / nB)),
      linha('Casos por mil habitantes (30 dias)', (x) => dec(x.porMil, 2), dec(mediaPorMil, 2)),
    ];
    const destaques = [
      ['Casos por mil habitantes', dados.map((x) => ({ nome: x.nome, v: x.porMil })), true, (v) => dec(v, 2)],
      ['Ocorrências ativas', dados.map((x) => ({ nome: x.nome, v: x.ativas.length })), true, num],
      ['Prazos estourados', dados.map((x) => ({ nome: x.nome, v: x.estouradas })), true, num],
      ['Satisfação', dados.map((x) => ({ nome: x.nome, v: x.sat })), false, (v) => `${v}%`],
    ].map(([rotulo, l, ruimAlto, fmt]) => { const e = extremos(l, ruimAlto, fmt); return e && { texto: `${rotulo}: ${e.texto}`, etiqueta: e.etiqueta, tom: rotulo === 'Prazos estourados' && e.pior.v ? 'crit' : 'at' }; }).filter(Boolean);
    const maisCasos = dados.slice().sort((a, b) => b.porMil - a.porMil)[0];
    const maisAtivas = dados.slice().sort((a, b) => b.ativas.length - a.ativas.length || b.estouradas - a.estouradas)[0];
    const porSat = dados.slice().sort((a, b) => a.sat - b.sat);
    const maxPorMil = Math.max(mediaPorMil, ...dados.map((x) => x.porMil)) || 1;
    return {
      titulo: 'Comparação entre bairros',
      subtitulo: eNomes(nomes),
      kpis: [],
      topicos: [
        `${eNomes(nomes)} lado a lado, nos últimos 30 dias.`,
        `${maisCasos.nome} tem a maior taxa de casos: ${dec(maisCasos.porMil, 2)} por mil habitantes (média da cidade: ${dec(mediaPorMil, 2)}).`,
        maisAtivas.ativas.length ? `${maisAtivas.nome} concentra mais ocorrências abertas agora (${maisAtivas.ativas.length}${maisAtivas.estouradas ? `, ${maisAtivas.estouradas} com prazo estourado` : ''}).` : 'Nenhum dos bairros tem ocorrência aberta agora.',
        `A satisfação vai de ${porSat[0].sat}% (${porSat[0].nome}) a ${porSat[porSat.length - 1].sat}% (${porSat[porSat.length - 1].nome}); a da cidade é ${satCidade}%.`,
      ],
      secoes: [
        tabela('comparativo', 'Comparativo', ['Indicador', ...nomes, 'Média da cidade'], comparativo),
        tabela('casos-por-secretaria', 'Casos por secretaria (30 dias)', ['Secretaria', ...nomes, 'Média por bairro'],
          GC.data.areas.map((a, i) => [a.nome, ...dados.map((x) => num(x.casosArea[i])), dec(soma(Object.values(hist[a.id] || {})) / nB)])),
        tabela('ocorrencias', 'Ocorrências ativas nos bairros', ['Ocorrência', 'Bairro', 'Secretaria', 'Gravidade', 'Situação'],
          dados.flatMap((x) => x.ativas.map((o) => [o.titulo, x.nome, area(o.area).secretaria.nome, SEV[o.severidade], GC.situacao(o)]))),
      ],
      fontes: ['planejamento.bairros', 'gestao.ocorrencias', 'ouvidoria.pesquisa_satisfacao'],
      painel: {
        kpis: dados.map((x) => ({ rotulo: x.nome, valor: dec(x.porMil, 2), detalhe: `casos por mil hab. · ${x.ativas.length} ${x.ativas.length === 1 ? 'ativa' : 'ativas'}`, tom: x.porMil > mediaPorMil * 1.2 ? 'ruim' : 'ok' })),
        esquerda: lista('O que muda de um para outro', destaques),
        direita: barras('Casos por mil habitantes (30 dias)', dados.map((x) => ({ rotulo: x.nome, valor: pct(x.porMil, maxPorMil), marca: pct(mediaPorMil, maxPorMil), texto: dec(x.porMil, 2), tom: x.porMil > mediaPorMil * 1.5 ? 'ruim' : '' })),
          { nota: 'traço = média da cidade', legenda: 'Barra: casos registrados em 30 dias por mil habitantes. Traço escuro: média da cidade. Vermelho: mais de 1,5× a média.' }),
      },
    };
  }

  function compSecretarias(store, ids) {
    const des = store.desempenho(null).secretarias;
    const pulsos = store.pulsos();
    const dados = ids.map((id) => {
      const a = area(id);
      const pg = store.paginaSecretaria(id);
      const s = des.find((x) => x.area === id);
      const ant = store.desempenho(null, [id]).resumo;
      return { a, nome: a.nome, pg, s, ant, pu: pulsos.find((x) => x.area === id) || {}, o: GC.data.secretarias[id].orcamento,
        metasCrit: pg.metas.filter((m) => m.status === 'critico').length, estouradas: pg.alertas.filter(GC.estourada).length };
    });
    const nomes = dados.map((x) => x.nome);
    const linha = (rotulo, f) => [rotulo, ...dados.map(f)];
    const comparativo = [
      linha('Resolvidas (30 dias)', (x) => num(x.s.resolvidas)),
      linha('No prazo (30 dias)', (x) => `${x.s.noPrazoPct}%`),
      linha('No prazo (mês anterior)', (x) => `${x.ant.noPrazoPctAnt}%`),
      linha('Tempo médio (30 dias)', (x) => horas(x.s.tempoMedioH)),
      linha('Tempo médio (mês anterior)', (x) => horas(x.ant.tempoMedioHAnt)),
      linha('Em aberto agora', (x) => num(x.s.abertas)),
      linha('Alertas ativos', (x) => num(x.pg.alertas.length)),
      linha('Prazos estourados', (x) => num(x.estouradas)),
      linha('Orçamento 2026', (x) => mi(x.o.dotacaoMi)),
      linha('Executado', (x) => `${x.o.executadoPct}%`),
      linha('Compromissos críticos do plano', (x) => num(x.metasCrit)),
      linha('Indicador principal', (x) => (x.pu.rotulo ? `${x.pu.rotulo}: ${x.pu.nivel}` : '—')),
    ];
    const destaques = [
      ['% no prazo', dados.map((x) => ({ nome: x.nome, v: x.s.noPrazoPct })), false, (v) => `${v}%`],
      ['Tempo médio', dados.map((x) => ({ nome: x.nome, v: x.s.tempoMedioH })), true, horas],
      ['Prazos estourados', dados.map((x) => ({ nome: x.nome, v: x.estouradas })), true, num],
      ['Orçamento executado', dados.map((x) => ({ nome: x.nome, v: x.o.executadoPct })), false, (v) => `${v}%`],
    ].map(([rotulo, l, ruimAlto, fmt]) => { const e = extremos(l, ruimAlto, fmt); return e && { texto: `${rotulo}: ${e.texto}`, etiqueta: e.etiqueta, tom: 'at' }; }).filter(Boolean);
    const porPrazo = dados.slice().sort((a, b) => a.s.noPrazoPct - b.s.noPrazoPct);
    const abaixo = dados.filter((x) => x.s.noPrazoPct < meta());
    const porTempo = dados.slice().sort((a, b) => a.s.tempoMedioH - b.s.tempoMedioH);
    const crit = dados.filter((x) => x.metasCrit);
    return {
      titulo: 'Comparação entre secretarias',
      subtitulo: eNomes(nomes),
      kpis: [],
      topicos: [
        `${eNomes(nomes)} lado a lado, nos últimos 30 dias e no mês anterior.`,
        `No prazo, ${porPrazo[porPrazo.length - 1].nome} lidera com ${porPrazo[porPrazo.length - 1].s.noPrazoPct}% e ${porPrazo[0].nome} fica com ${porPrazo[0].s.noPrazoPct}%; ${abaixo.length ? `abaixo da meta de ${meta()}%: ${eNomes(abaixo.map((x) => x.nome))}` : `todas na meta de ${meta()}%`}.`,
        `O tempo médio vai de ${horas(porTempo[0].s.tempoMedioH)} (${porTempo[0].nome}) a ${horas(porTempo[porTempo.length - 1].s.tempoMedioH)} (${porTempo[porTempo.length - 1].nome}).`,
        crit.length ? `Compromissos críticos do plano: ${eNomes(crit.map((x) => `${x.nome} (${x.metasCrit})`))}.` : 'Nenhuma delas tem compromisso do plano crítico.',
      ],
      secoes: [
        tabela('comparativo', 'Comparativo', ['Indicador', ...nomes], comparativo),
        tabela('metas', 'Compromissos do plano de governo', ['Secretaria', 'Compromisso', 'Progresso', 'Prazo', 'Situação'],
          dados.flatMap((x) => x.pg.metas.map((m) => [x.nome, m.titulo, `${m.progressoPct}%`, m.prazo, STATUS_META[m.status]]))),
        tabela('alertas-ativos', 'Alertas ativos', ['Ocorrência', 'Secretaria', 'Bairro', 'Gravidade', 'Situação'],
          dados.flatMap((x) => x.pg.alertas.map((o) => [o.titulo, x.nome, bairro(o.bairroId).nome, SEV[o.severidade], GC.situacao(o)]))),
      ],
      fontes: ['gestao.ocorrencias', 'gestao.prazos_sla', 'gabinete.orcamento_2026', 'planejamento.metas_governo'],
      painel: {
        kpis: dados.map((x) => ({ rotulo: `${x.nome} · no prazo`, valor: `${x.s.noPrazoPct}%`, tendencia: tendencia(x.s.noPrazoPct, x.ant.noPrazoPctAnt, 'p.p.'), detalhe: metaTexto(x.s.noPrazoPct), tom: x.s.noPrazoPct >= meta() ? 'ok' : 'ruim' })),
        esquerda: lista('O que muda de uma para outra', destaques),
        direita: barras('% no prazo (30 dias)', dados.map((x) => ({ rotulo: x.nome, valor: x.s.noPrazoPct, texto: `${x.s.noPrazoPct}%`, tom: x.s.noPrazoPct < meta() ? 'ruim' : '', link: { tipo: 'secretaria', id: x.a.id } })),
          { meta: meta(), nota: `linha verde = meta ${meta()}%`, legenda: 'Barra: % das ocorrências resolvidas no prazo nos últimos 30 dias (vermelha abaixo da meta).' }),
      },
    };
  }

  function compPeriodos(store, base, p) {
    const A = info(base);
    const B = info(p);
    const media = (l) => soma(l) / (l.length || 1);
    const fatia = (l, x) => l.slice(x.de, x.ate + 1);
    const rotA = periodoDe(base).rotulo;
    const rotB = periodoDe(p).rotulo;
    const curva = GC.alertasPorMes();
    const res30 = store.desempenho(null).resumo.resolvidas;
    // Variação de B sobre A, com a leitura pelo sentido do indicador ('menor' = cair é melhorar).
    const variacao = (a, b, melhor) => {
      const d = b - a;
      const rel = a ? d / Math.abs(a) : 0;
      const pctTxt = `${d > 0 ? '+' : d < 0 ? '−' : ''}${dec(Math.abs(rel) * 100, 0)}%`;
      const estavel = Math.abs(rel) < 0.02;
      const leitura = !melhor ? '—' : estavel ? 'estável' : (d < 0) === (melhor === 'menor') ? 'melhorou' : 'piorou';
      return { d, rel, pctTxt, leitura };
    };
    const itens = [];
    // Períodos de tamanhos diferentes: contagens viram média por mês (total de 9 meses contra 3 não se compara).
    const nA = A.ate - A.de + 1;
    const nB = B.ate - B.de + 1;
    const porMes = nA !== nB;
    const sufixoContagem = porMes ? ' (média por mês)' : '';
    const contagem = (total, n) => (porMes ? Math.round(total / n) : total);
    const alA = contagem(soma(fatia(curva, A)), nA);
    const alB = contagem(soma(fatia(curva, B)), nB);
    itens.push({ rotulo: `Alertas disparados${sufixoContagem}`, a: alA, b: alB, fmt: num, melhor: 'menor' });
    const rA = contagem(Math.round(res30 * fator(base)), nA);
    const rB = contagem(Math.round(res30 * fator(p)), nB);
    itens.push({ rotulo: `Resolvidas (estimativa${porMes ? ', média por mês' : ''})`, a: rA, b: rB, fmt: (v) => `≈ ${num(v)}`, melhor: null });
    GC.data.areas.forEach((a) => {
      const sr = store.paginaSecretaria(a.id).serie;
      if (!sr || !sr.meses) return;
      const mA = media(fatia(sr.meses, A));
      const mB = media(fatia(sr.meses, B));
      // Média com uma casa, no formato brasileiro ("65,3 min", "93,3%").
      const fmt = (v) => (sr.unidade === 'min' ? `${dec(v)} min` : sr.unidade === '%' ? `${dec(v)}%` : dec(v));
      itens.push({ rotulo: `${a.nome}: ${sr.rotulo} (média)`, a: mA, b: mB, fmt, melhor: menorMelhor(sr) ? 'menor' : 'maior', area: a.id });
    });
    itens.forEach((x) => Object.assign(x, variacao(x.a, x.b, x.melhor)));
    const melhoraram = itens.filter((x) => x.leitura === 'melhorou');
    const pioraram = itens.filter((x) => x.leitura === 'piorou');
    const mudancas = itens.filter((x) => x.melhor && x.leitura !== 'estável').sort((x, y) => Math.abs(y.rel) - Math.abs(x.rel));
    const al = itens[0];
    const mesesA = fatia(curva, A).map((v, i) => ({ mes: A.de + i, v, periodo: 'A' }));
    const mesesB = fatia(curva, B).map((v, i) => ({ mes: B.de + i, v, periodo: 'B' }));
    const maxMes = Math.max(...mesesA.map((x) => x.v), ...mesesB.map((x) => x.v));
    return {
      titulo: 'Comparação entre períodos',
      subtitulo: 'Alertas, resolvidas e o indicador principal de cada secretaria',
      periodo: { rotulo: `A: ${rotA} × B: ${rotB}`, de: periodoDe(base).de, ate: periodoDe(p).ate },
      kpis: [],
      topicos: [
        `Período A (${rotA}) contra o período B (${rotB}).`,
        `Os alertas disparados${porMes ? ' por mês, em média,' : ''} foram de ${num(al.a)} para ${num(al.b)} (${al.pctTxt}).`,
        `${melhoraram.length} ${melhoraram.length === 1 ? 'indicador melhorou' : 'indicadores melhoraram'} e ${pioraram.length} ${pioraram.length === 1 ? 'piorou' : 'pioraram'}${mudancas[0] ? `; a maior mudança foi em ${mudancas[0].rotulo.replace(/ \(média\)$/, '')} (${mudancas[0].pctTxt}, ${mudancas[0].leitura})` : ''}.`,
        porMes ? `Os períodos têm tamanhos diferentes (${nA} e ${nB} meses): alertas e resolvidas estão em média por mês. Resolvidas são estimativa: o ritmo de 30 dias vezes a curva mensal de alertas.` : 'Resolvidas por período são estimativa: o ritmo de 30 dias vezes a curva mensal de alertas.',
      ],
      secoes: [
        tabela('comparativo', 'Comparativo', ['Indicador', `A: ${rotA}`, `B: ${rotB}`, 'Diferença', 'Leitura'],
          itens.map((x) => [x.rotulo, x.fmt(x.a), x.fmt(x.b), x.pctTxt, x.leitura])),
        tabela('alertas-por-mes', 'Alertas por mês', ['Mês', 'Alertas', 'Período'],
          [...mesesA, ...mesesB].map((x) => [rotuloMes(x.mes), num(x.v), x.periodo])),
      ],
      fontes: ['monitoramento.alertas', 'gestao.ocorrencias', ...new Set(GC.data.areas.map((a) => (store.paginaSecretaria(a.id).base || {}).fonte).filter(Boolean))],
      painel: {
        kpis: [
          { rotulo: porMes ? 'Alertas por mês no período B' : 'Alertas no período B', valor: num(al.b), detalhe: `A: ${num(al.a)} (${al.pctTxt})`, tom: al.leitura === 'piorou' ? 'ruim' : al.leitura === 'melhorou' ? 'ok' : '' },
          { rotulo: porMes ? 'Resolvidas por mês no período B' : 'Resolvidas no período B', valor: `≈ ${num(itens[1].b)}`, detalhe: `A: ≈ ${num(itens[1].a)} (${itens[1].pctTxt})` },
          { rotulo: 'Indicadores que melhoraram', valor: num(melhoraram.length), detalhe: `de ${itens.filter((x) => x.melhor).length}`, tom: 'ok' },
          { rotulo: 'Indicadores que pioraram', valor: num(pioraram.length), detalhe: `de ${itens.filter((x) => x.melhor).length}`, tom: pioraram.length ? 'ruim' : 'ok' },
        ],
        esquerda: lista('Maiores mudanças de A para B', mudancas.slice(0, 6).map((x) => Object.assign({ texto: x.rotulo.replace(/ \(média\)$/, ''), etiqueta: `${x.leitura} ${x.pctTxt}`, tom: x.leitura === 'piorou' ? 'crit' : 'ok', dica: `A: ${x.fmt(x.a)} · B: ${x.fmt(x.b)}` }, x.area ? { link: { tipo: 'secretaria', id: x.area } } : {}))),
        direita: barras('Alertas por mês', [...mesesA, ...mesesB].map((x) => Object.assign({ rotulo: `${rotuloMes(x.mes)} · ${x.periodo}`, valor: pct(x.v, maxMes), texto: String(x.v) }, x.periodo === 'A' ? { contexto: true } : {})),
          { legenda: 'Esmaecidos: meses do período A. Fortes: meses do período B.' }),
      },
    };
  }

  function comparacao(store, p, alvo) {
    const c = GC.lerAlvoComparacao(alvo) || GC.lerAlvoComparacao(GC.comparacaoPadrao().alvo);
    if (c.modo === 'bairros') return compBairros(store, c.ids);
    if (c.modo === 'secretarias') return compSecretarias(store, c.ids);
    return compPeriodos(store, c.base, /^m\d/.test(p) && GC.periodoInfo(p) ? p : GC.comparacaoPadrao('periodos').periodo);
  }

  // ---- CSV: BOM (Excel abre acentuado), separador ';', aspas quando preciso ----
  const campo = (v) => {
    const t = String(v ?? '');
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  GC.campoCsv = campo;
  // Todos os indicadores do relatório (o painel da tela mostra só 4): a mesma tabela na tela, no CSV e no PDF.
  // A observação leva a meta e o aviso de estimativa.
  // Com "Comparar com o mês anterior" (só em 30 dias), entra a coluna "Mês anterior"; sem o dado, "—".
  GC.tabelaIndicadores = (rel) => (rel.filtros && rel.filtros.comparar
    ? { titulo: 'Indicadores', tipo: 'tabela', colunas: ['Indicador', 'Valor', 'Mês anterior', 'Observação'], linhas: rel.kpis.map((k) => [k.rotulo, k.valor, k.anterior || '—', k.detalhe || '']) }
    : { titulo: 'Indicadores', tipo: 'tabela', colunas: ['Indicador', 'Valor', 'Observação'], linhas: rel.kpis.map((k) => [k.rotulo, k.valor, k.detalhe || '']) });
  GC.relatorioCsv = function (rel) {
    const ind = GC.tabelaIndicadores(rel);
    const filtros = GC.rotuloFiltros ? GC.rotuloFiltros(rel) : '';
    const linhas = [[rel.titulo], [rel.periodo.rotulo], ...(filtros ? [[filtros]] : []), [], ind.colunas, ...ind.linhas, [], ['Resumo'], ...(rel.topicos || [rel.resumo]).map((t) => [t])];
    rel.secoes.forEach((s) => {
      linhas.push([], [s.titulo]);
      if (s.vazio) linhas.push([s.vazio]);
      else if (s.tipo === 'tabela') linhas.push(s.colunas, ...s.linhas);
      else if (s.tipo === 'lista') s.itens.forEach((t, i) => linhas.push([`${i + 1}. ${t}`]));
      else if (s.tipo === 'texto') linhas.push([s.texto]);
      else s.itens.forEach((b) => linhas.push([b.rotulo, b.texto]));
    });
    linhas.push([], ['Fontes', rel.fontes.map((f) => (GC.nomeFonte(f) === f ? f : `${GC.nomeFonte(f)} [${f}]`)).join(', ')]);
    return `﻿${linhas.map((l) => l.map(campo).join(';')).join('\r\n')}\r\n`;
  };

  // ---- personalização (docs/specs/2026-11-12-vila-dourada-relatorios-personalizaveis-design.md) ----
  // Observações do gestor: última seção do documento, em texto puro, até 1.000 caracteres.
  GC.LIMITE_OBSERVACOES = 1000;
  GC.comObservacoes = function (rel, texto) {
    const t = String(texto || '').trim().slice(0, GC.LIMITE_OBSERVACOES);
    const secoes = rel.secoes.filter((s) => s.id !== 'observacoes');
    if (t) secoes.push({ id: 'observacoes', titulo: 'Observações', tipo: 'texto', texto: t });
    return Object.assign({}, rel, { secoes });
  };

  // Tira os indicadores e as seções pedidos em `ocultar` (ids do tipo; desconhecidos são ignorados).
  // Esconder tudo não vale: o relatório sai completo. O resumo (tópicos) e o painel da tela não mudam.
  function aplicarOcultar(rel, ocultar) {
    const fora = new Set(ocultar || []);
    const partes = {
      indicadores: rel.kpis.map((k) => ({ id: k.id, rotulo: k.rotulo, visivel: !fora.has(k.id) })),
      secoes: rel.secoes.map((s) => ({ id: s.id, titulo: s.titulo, visivel: !fora.has(s.id), soDocumento: !!s.soDocumento })),
    };
    const kpis = rel.kpis.filter((k) => !fora.has(k.id));
    const secoes = rel.secoes.filter((s) => !fora.has(s.id));
    if (!kpis.length && !secoes.length) {
      partes.indicadores.forEach((x) => { x.visivel = true; });
      partes.secoes.forEach((x) => { x.visivel = true; });
      return Object.assign(rel, { partes, ocultos: [], versao: 'completa' });
    }
    const ocultos = [...rel.kpis, ...rel.secoes].filter((x) => fora.has(x.id)).map((x) => x.id);
    return Object.assign(rel, { kpis, secoes, partes, ocultos, versao: ocultos.length ? 'resumida' : 'completa' });
  }
  // "3 de 5 seções · 4 de 6 indicadores": o que sobrou, para quem recebe saber que não é o documento completo.
  GC.rotuloVersao = function (rel) {
    if (!rel.partes || rel.versao !== 'resumida') return '';
    const conta = (lista, um, varios) => {
      const v = lista.filter((x) => x.visivel).length;
      return v === lista.length ? null : `${v} de ${lista.length} ${lista.length === 1 ? um : varios}`;
    };
    return ['versão resumida', conta(rel.partes.secoes, 'seção', 'seções'), conta(rel.partes.indicadores, 'indicador', 'indicadores')].filter(Boolean).join(' · ');
  };

  // ---- filtros (fase 2): recorte de secretarias, gravidade e mês anterior ----
  GC.GRAVIDADES_RELATORIO = ['critica', 'alta', 'media'];
  const GRAV_NOME = { critica: 'crítica', alta: 'alta', media: 'média' };
  // Quais filtros valem em cada tipo. Secretaria e bairro não têm recorte; alertas não tem gravidade;
  // bairro não tem mês anterior nos dados (a coluna sairia toda com "—").
  // A comparação não tem filtros (o modo secretarias já traz o mês anterior).
  // Entregas: recorte de secretarias, sem gravidade (não são ocorrências) e sem mês anterior.
  GC.filtrosDoRelatorio = (tipo) => ({
    secretarias: tipo === 'executivo' || tipo === 'alertas' || tipo === 'entregas',
    gravidades: tipo !== 'alertas' && tipo !== 'comparacao' && tipo !== 'entregas',
    comparar: tipo !== 'bairro' && tipo !== 'comparacao' && tipo !== 'entregas',
  });
  // O que de fato vale: ids válidos, sem repetição; tudo marcado = sem filtro (null). Comparar só em 30 dias.
  function normalizarFiltros(tipo, periodo, { secretarias, gravidades, comparar }) {
    const vale = GC.filtrosDoRelatorio(tipo);
    const areas = vale.secretarias && secretarias ? GC.data.areas.map((a) => a.id).filter((id) => secretarias.includes(id)) : [];
    const grav = vale.gravidades && gravidades ? GC.GRAVIDADES_RELATORIO.filter((g) => gravidades.includes(g)) : [];
    return {
      areas: areas.length && areas.length < GC.data.areas.length ? areas : null,
      grav: grav.length && grav.length < GC.GRAVIDADES_RELATORIO.length ? grav : null,
      comparar: vale.comparar && !!comparar && periodo === '30',
    };
  }
  const eLista = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
  // "Recorte: Saúde e Obras · gravidade crítica e alta": vai no cabeçalho, no subtítulo dos arquivos e no CSV.
  GC.rotuloFiltros = function (rel) {
    const f = rel.filtros || {};
    return [
      f.areas ? `Recorte: ${eLista(f.areas.map((id) => area(id).nome))}` : '',
      f.grav ? `gravidade ${eLista(f.grav.map((g) => GRAV_NOME[g]))}` : '',
    ].filter(Boolean).join(' · ');
  };

  GC.montarRelatorio = function (store, { tipo, alvo, periodo, ocultar = [], observacoes = '', secretarias = null, gravidades = null, comparar = false }) {
    const f = normalizarFiltros(tipo, periodo, { secretarias, gravidades, comparar });
    let rel;
    if (tipo === 'secretaria') rel = secretaria(store, periodo, alvo, f);
    else if (tipo === 'bairro') rel = relBairro(store, periodo, alvo, f);
    else if (tipo === 'alertas') rel = alertas(store, periodo, f);
    else if (tipo === 'comparacao') rel = comparacao(store, periodo, alvo);
    else if (tipo === 'entregas') rel = relEntregas(store, periodo, alvo, f);
    else rel = executivo(store, periodo, f);
    // O resumo corrido (texto único) continua existindo; a tela e o PDF usam os tópicos.
    const completo = Object.assign({ tipo, alvo, periodo: periodoDe(periodo), codigoPeriodo: periodo }, rel, { resumo: rel.topicos.join(' '), filtros: f });
    return GC.comObservacoes(aplicarOcultar(completo, ocultar), observacoes);
  };
})(window.GC = window.GC || {});
