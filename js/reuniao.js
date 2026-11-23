(function (GC) {
  // Pauta da reunião de resultados entre o prefeito e uma secretaria (spec:
  // docs/specs/2026-11-12-vila-dourada-metas-e-niveis-design.md). Só lógica: junta o que já existe
  // (indicadores avaliados, pactos e planos, cobranças, pedidos de ajuda e devoluções) num período.

  const MIN = 60000;
  const DIA = 1440 * MIN;
  const RESPOSTA_SECRETARIA = ['previsao', 'justificativa', 'recurso', 'novo_prazo', 'evidencia'];

  // indicadores: a lista de GC.avaliarIndicadores da pasta; pactos/cobrancas/ajudas: os registros (ou null);
  // ocorrencias: store.todas() (para as devoluções). dias: o período olhado (padrão 30).
  GC.pautaReuniao = function ({ area, indicadores = [], pactos = null, cobrancas = null, ajudas = null, acoesPrefeito = null, ocorrencias = [], agora = GC.agora(), dias = 30 } = {}) {
    const desde = agora - dias * DIA;
    const nome = (GC.data.areas.find((a) => a.id === area) || { secretaria: { nome: area } }).secretaria.nome;
    const daPasta = indicadores.filter((i) => i.area === area);

    // 1. Indicadores fora da meta, com o plano (ou a falta dele).
    const vencidas = pactos ? pactos.acoesVencidas(area, agora) : [];
    const foraDaMeta = daPasta.filter((i) => i.situacao === 'critico' || i.situacao === 'atencao')
      .sort((a, b) => (a.situacao === 'critico' ? 0 : 1) - (b.situacao === 'critico' ? 0 : 1))
      .map((i) => {
        const plano = pactos ? pactos.planoAtivo(i.id) : null;
        return {
          id: i.id, nome: i.nome, situacao: i.situacao, valor: i.valorAtual, meta: i.metaAtual, unidade: i.unidade, metaPactuada: !!i.metaPactuada, ritmo: i.ritmo || null,
          plano: plano ? {
            causa: plano.causa, total: plano.acoes.length, feitas: plano.acoes.filter((a) => a.feita).length, vencidas: vencidas.filter((v) => v.indicadorId === i.id).length,
            // Fase 2: ações cobradas pelo prefeito ainda sem resposta e o efeito (valor no dia do plano × agora).
            cobradas: plano.acoes.filter((a) => !a.feita && (a.cobrancas || []).some((c) => !c.resposta)).length,
            efeito: GC.efeitoPlano ? GC.efeitoPlano(plano, i) : null,
          } : null,
        };
      });

    // 2. Metas: pactuadas, em negociação (com quem está a bola) e sem pacto.
    const pactosDa = pactos ? pactos.pactosDa(area) : [];
    const metas = {
      pactuadas: pactosDa.filter((p) => p.vigente).length,
      emNegociacao: pactosDa.filter((p) => p.proposta).map((p) => ({ id: p.indicadorId, nome: (daPasta.find((i) => i.id === p.indicadorId) || { nome: p.indicadorId }).nome, unidade: (daPasta.find((i) => i.id === p.indicadorId) || {}).unidade || '', valor: p.proposta.valor, prazo: p.proposta.prazo, comQuem: p.proposta.lado === 'setor' ? 'prefeito' : 'setor' })),
      semPacto: daPasta.filter((i) => !pactosDa.some((p) => p.indicadorId === i.id && (p.vigente || p.proposta))).length,
      total: daPasta.length,
    };
    // Metas apuradas no período (o prazo venceu: cumprida ou não). As substituídas por um novo pacto não entram.
    const nomeInd = (id) => (daPasta.find((i) => i.id === id) || (GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || { nome: id });
    const metasApuradas = pactos && pactos.ciclosDa
      ? pactos.ciclosDa(area, desde).filter((c) => c.resultado !== 'substituida')
        .map((c) => Object.assign({ nome: nomeInd(c.indicadorId).nome, unidade: nomeInd(c.indicadorId).unidade || '' }, c))
      : [];

    // 3. Cobranças do período: quantas, quantas respondidas dentro do prazo de resposta, quantas vencidas agora.
    const cobs = cobrancas ? cobrancas.lista({ area }).filter((c) => c.em >= desde) : [];
    const prazoResp = (c) => ((GC.PRAZO_RESPOSTA_MIN || {})[c.retrato.severidade] || 120) * MIN;
    const primeira = (c) => c.respostas.find((r) => RESPOSTA_SECRETARIA.includes(r.tipo) && !r.semEvidencia);
    const cobrancasPeriodo = {
      total: cobs.length,
      noPrazo: cobs.filter((c) => { const r = primeira(c); return r && r.em - c.em <= prazoResp(c); }).length,
      vencidas: cobs.filter((c) => cobrancas.vencida(c, agora)).length,
      abertas: cobs.filter((c) => c.estado !== 'encerrada').length,
    };

    // 4. Pedidos de ajuda entre secretarias no período.
    const ajs = ajudas ? ajudas.todas().filter((a) => a.em >= desde && (a.de === area || a.para === area)) : [];
    const ajudasPeriodo = {
      pedidos: ajs.filter((a) => a.de === area).length,
      recebidos: ajs.filter((a) => a.para === area).length,
      recusadosPelaPasta: ajs.filter((a) => a.para === area && a.respostas.some((r) => r.tipo === 'recusado')).length,
      levadosAoPrefeito: ajs.filter((a) => a.escalado && (a.de === area || a.para === area)).length,
    };

    // 5. Devoluções: o que a pasta devolveu e o que chegou devolvido para ela.
    const devs = ocorrencias.flatMap((o) => (o.devolucoes || []).filter((d) => d.t >= desde).map((d) => Object.assign({ titulo: o.titulo, tipo: o.tipo }, d)));
    const devolucoes = { feitas: devs.filter((d) => d.de === area).length, recebidas: devs.filter((d) => d.para === area).length };

    // A pauta em tópicos, na ordem da conversa.
    const fmt = (v, u) => (GC.formatarIndicador ? GC.formatarIndicador(v, u) : u === '%' ? `${v}%` : `${v} ${u}`);
    const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
    const itens = [];
    foraDaMeta.forEach((f) => itens.push({
      tipo: f.plano ? (f.plano.vencidas ? 'plano_atrasado' : 'com_plano') : f.ritmo === 'no_ritmo' ? 'no_ritmo' : 'sem_plano', indicadorId: f.id,
      texto: `${f.nome}: ${fmt(f.valor, f.unidade)}, meta ${fmt(f.meta, f.unidade)}${f.metaPactuada ? ' (pactuada)' : ''}. `
        + (f.plano ? `Plano: ${f.plano.feitas} de ${plural(f.plano.total, 'ação feita', 'ações feitas')}${f.plano.vencidas ? `, ${plural(f.plano.vencidas, 'atrasada', 'atrasadas')}` : ''}${f.plano.cobradas ? ` (${plural(f.plano.cobradas, 'cobrada', 'cobradas')} pelo prefeito)` : ''}.`
          + (f.plano.efeito ? ` Desde o plano: ${fmt(f.plano.efeito.inicial, f.unidade)} → ${fmt(f.plano.efeito.atual, f.unidade)}${f.plano.efeito.melhorou === null ? ', sem mudança' : f.plano.efeito.melhorou ? ', melhorou' : ', piorou'}.` : '') : f.ritmo === 'no_ritmo' ? 'Sem plano, mas no ritmo do caminho combinado.' : 'Sem plano de ação.'),
    }));
    metasApuradas.forEach((c) => itens.push({
      tipo: c.resultado === 'cumprida' ? 'meta_cumprida' : 'meta_nao_cumprida', indicadorId: c.indicadorId,
      texto: `${c.nome}: meta ${fmt(c.meta, c.unidade)} até ${c.prazo.split('-').reverse().join('/')}, apurado ${fmt(c.valor, c.unidade)}. ${c.resultado === 'cumprida' ? 'Cumprida.' : 'Não cumprida.'}`,
    }));
    metas.emNegociacao.forEach((m) => itens.push({ tipo: 'meta_negociacao', indicadorId: m.id, texto: `Meta em negociação: ${m.nome}, proposta de ${m.unidade ? fmt(m.valor, m.unidade) : m.valor} até ${m.prazo.split('-').reverse().join('/')}. Está com ${m.comQuem === 'prefeito' ? 'o prefeito' : 'a secretaria'}.` }));
    if (cobrancasPeriodo.total) itens.push({ tipo: 'cobrancas', texto: `Cobranças em ${dias} dias: ${cobrancasPeriodo.total}, ${cobrancasPeriodo.noPrazo} respondidas no prazo${cobrancasPeriodo.vencidas ? `, ${plural(cobrancasPeriodo.vencidas, 'vencida agora', 'vencidas agora')}` : ''}.` });
    if (ajudasPeriodo.pedidos || ajudasPeriodo.recebidos) itens.push({ tipo: 'ajudas', texto: `Pedidos de ajuda: ${ajudasPeriodo.pedidos} feitos, ${ajudasPeriodo.recebidos} recebidos${ajudasPeriodo.recusadosPelaPasta ? ` (${ajudasPeriodo.recusadosPelaPasta} recusados pela pasta)` : ''}${ajudasPeriodo.levadosAoPrefeito ? `, ${ajudasPeriodo.levadosAoPrefeito} levados ao prefeito` : ''}.` });
    // Reconhecimentos do prefeito à pasta no período (js/acoes-prefeito.js): também é resultado.
    const reconhecimentos = acoesPrefeito && acoesPrefeito.reconhecimentos ? acoesPrefeito.reconhecimentos(area, desde).length : 0;
    if (reconhecimentos) itens.push({ tipo: 'reconhecimentos', texto: `Reconhecimentos do prefeito: ${reconhecimentos} em ${dias} dias.` });
    if (devolucoes.feitas || devolucoes.recebidas) itens.push({ tipo: 'devolucoes', texto: `Encaminhamento errado: ${devolucoes.feitas} devolvidas pela pasta, ${devolucoes.recebidas} recebidas devolvidas.` });

    return {
      area, nome, dias, foraDaMeta, semPlano: foraDaMeta.filter((f) => !f.plano && f.ritmo !== 'no_ritmo').length, acoesVencidas: vencidas.length,
      metas, metasApuradas, cobrancas: cobrancasPeriodo, ajudas: ajudasPeriodo, devolucoes, reconhecimentos, itens,
      nota: pactos ? pactos.nota(area) : null,
    };
  };
})(window.GC = window.GC || {});
