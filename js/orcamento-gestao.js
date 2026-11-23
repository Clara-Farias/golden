(function (GC) {
  // Gestão orçamentária (workshop de 18/11: "incorporar o acompanhamento orçamentário, dotações de recursos federais,
  // contratos vigentes e controle de prazos de vencimento e licitações"). Só lógica, sem DOM: a tela é
  // js/tela-orcamento.js e a Maia lê daqui (js/ia/tema-orcamento.js).
  // A execução por secretaria vem do MESMO GC.gestao.orcamento() do widget Orçamento e os contratos do MESMO
  // GC.gestao.contratos() (js/data-gestao.js). Novo aqui: o que entra por fora do tesouro (transferências federais e
  // estaduais, convênios e emendas, com prazo de execução e de prestação de contas), as licitações em andamento e o
  // que liga uma coisa à outra (contrato que vence sem licitação aberta, recurso que pode voltar a Brasília).
  // Números simulados, escalados com a população da cidade aberta (como os outros data-*).
  const BASE_POP = 250000;
  const fator = () => ((GC.cidade && GC.cidade.populacao) || BASE_POP) / BASE_POP;
  const mi = (n) => Math.round(n * fator() * 10) / 10;
  const r1 = (n) => Math.round(n * 10) / 10;
  const DIA = 86400000;
  const hoje = () => (GC.relogio ? GC.relogio.hoje : new Date().toISOString().slice(0, 10));
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const emDias = (n) => new Date(utc(hoje()) + n * DIA).toISOString().slice(0, 10);
  const mesDoAno = () => +hoje().slice(5, 7);

  GC.FONTES_RECURSO = {
    federal: { nome: 'Transferência federal', curto: 'Federal', icone: 'building-bank' },
    estadual: { nome: 'Transferência estadual', curto: 'Estadual', icone: 'building' },
    emenda: { nome: 'Emenda parlamentar', curto: 'Emenda', icone: 'gavel' },
    convenio: { nome: 'Convênio', curto: 'Convênio', icone: 'file-certificate' },
  };

  // Recursos de fora do tesouro municipal. prazoDias: até quando dá para executar (empenhar e pagar); depois disso
  // o saldo volta a quem mandou. contasDias: prestação de contas. meta: título do compromisso do plano de governo.
  const RECURSOS = [
    { id: 'rc-fns-ubs', nome: 'Ampliação da Atenção Primária (fundo a fundo)', fonte: 'federal', orgao: 'Ministério da Saúde · FNS', area: 'saude', valor: 18.4, recebidoPct: 100, executadoPct: 71, prazoDias: 410, contasDias: 120, meta: 'Reduzir a espera nas UBS para 60 min' },
    { id: 'rc-pac-drenagem', nome: 'Drenagem da Lagoa Azul (Novo PAC)', fonte: 'federal', orgao: 'Ministério das Cidades · Caixa', area: 'infraestrutura', valor: 24.0, recebidoPct: 40, executadoPct: 22, prazoDias: 78, contasDias: 30, meta: 'Rede subterrânea no Centro' },
    { id: 'rc-fnde-creche', nome: 'Construção de creches (Proinfância)', fonte: 'federal', orgao: 'Ministério da Educação · FNDE', area: 'educacao', valor: 9.6, recebidoPct: 60, executadoPct: 38, prazoDias: 54, contasDias: 60, meta: 'Abrir 300 vagas de creche' },
    { id: 'rc-pnae', nome: 'Alimentação escolar (PNAE)', fonte: 'federal', orgao: 'Ministério da Educação · FNDE', area: 'educacao', valor: 6.2, recebidoPct: 90, executadoPct: 86, prazoDias: 43, contasDias: 90 },
    { id: 'rc-midr-sirenes', nome: 'Sistema de alerta e sirenes', fonte: 'federal', orgao: 'Ministério da Integração · Defesa Civil Nacional', area: 'defesa_civil', valor: 3.1, recebidoPct: 100, executadoPct: 64, prazoDias: 35, contasDias: 30, meta: 'Sirenes em todas as áreas de risco' },
    { id: 'rc-suas', nome: 'Proteção social básica (SUAS)', fonte: 'federal', orgao: 'Ministério do Desenvolvimento Social · FNAS', area: 'assistencia', valor: 4.8, recebidoPct: 83, executadoPct: 79, prazoDias: 160, contasDias: 90 },
    { id: 'rc-est-cameras', nome: 'Videomonitoramento integrado', fonte: 'estadual', orgao: 'Governo do Estado · Segurança Pública', area: 'seguranca', valor: 5.5, recebidoPct: 50, executadoPct: 41, prazoDias: 120, contasDias: 60, meta: 'Câmeras em todas as praças' },
    { id: 'rc-est-asfalto', nome: 'Programa estadual de pavimentação', fonte: 'estadual', orgao: 'Governo do Estado · Infraestrutura', area: 'infraestrutura', valor: 12.0, recebidoPct: 70, executadoPct: 58, prazoDias: 200, contasDias: 60, meta: 'Recapear 40 km de vias' },
    { id: 'rc-emenda-semaforos', nome: 'Semáforos inteligentes no Centro', fonte: 'emenda', orgao: 'Emenda individual · Dep. federal', area: 'mobilidade', valor: 2.4, recebidoPct: 100, executadoPct: 18, prazoDias: 62, contasDias: 30, meta: 'Semáforos inteligentes no Centro' },
    { id: 'rc-emenda-ecoponto', nome: 'Ecopontos nos bairros', fonte: 'emenda', orgao: 'Emenda de bancada', area: 'limpeza', valor: 1.8, recebidoPct: 100, executadoPct: 47, prazoDias: 150, contasDias: 60, meta: 'Ecopontos em todos os bairros' },
    { id: 'rc-conv-onibus', nome: 'Renovação da frota com ar-condicionado', fonte: 'convenio', orgao: 'BNDES · Refrota', area: 'mobilidade', valor: 14.0, recebidoPct: 30, executadoPct: 30, prazoDias: 300, contasDias: 90 },
  ];

  // Contratos além dos do widget (js/data-gestao.js): mais um de cada pasta grande, para a lista de vencimentos.
  const CONTRATOS_EXTRA = [
    { id: 'ct-ambulancia', nome: 'Locação de ambulâncias', empresa: 'Rota Vida Locações', area: 'saude', valorMi: 7, venceDias: 33, slaPct: 92, metaSlaPct: 95, multaMil: 6 },
    { id: 'ct-transporte-escolar', nome: 'Transporte escolar rural', empresa: 'Caminho Certo', area: 'educacao', valorMi: 5, venceDias: 95, slaPct: 97, metaSlaPct: 95, multaMil: 0 },
    { id: 'ct-semaforos', nome: 'Manutenção de semáforos', empresa: 'Sinal Verde Engenharia', area: 'mobilidade', valorMi: 3, venceDias: 58, slaPct: 88, metaSlaPct: 92, multaMil: 4 },
  ];

  // Licitações em andamento. substitui: o contrato que ela renova (para checar se termina antes de ele vencer).
  // fase: índice de GC.FASES_LICITACAO; concluiEm: dias até a homologação prevista.
  GC.FASES_LICITACAO = ['Planejamento', 'Edital publicado', 'Propostas', 'Julgamento', 'Homologada'];
  const LICITACOES = [
    { id: 'lc-luz', objeto: 'Manutenção da iluminação pública (LED)', area: 'infraestrutura', modalidade: 'Concorrência', valor: 13.5, fase: 3, concluiEm: 18, substitui: 'ct-luz' },
    { id: 'lc-lixo', objeto: 'Coleta e destinação de resíduos', area: 'limpeza', modalidade: 'Concorrência', valor: 41, fase: 1, concluiEm: 95, substitui: 'ct-lixo' },
    { id: 'lc-ambulancia', objeto: 'Locação de ambulâncias', area: 'saude', modalidade: 'Pregão eletrônico', valor: 7.6, fase: 0, concluiEm: 60, substitui: 'ct-ambulancia' },
    { id: 'lc-vigil', objeto: 'Vigilância patrimonial', area: 'seguranca', modalidade: 'Pregão eletrônico', valor: 9.4, fase: 2, concluiEm: 30, substitui: 'ct-vigil' },
    { id: 'lc-creche', objeto: 'Obra de 2 creches (Proinfância)', area: 'educacao', modalidade: 'Concorrência', valor: 8.9, fase: 2, concluiEm: 40, recurso: 'rc-fnde-creche' },
    { id: 'lc-drenagem', objeto: 'Drenagem da Lagoa Azul · lote 2', area: 'infraestrutura', modalidade: 'Concorrência', valor: 14.2, fase: 1, concluiEm: 70, recurso: 'rc-pac-drenagem' },
    { id: 'lc-semaforos', objeto: 'Semáforos inteligentes (fornecimento e instalação)', area: 'mobilidade', modalidade: 'Pregão eletrônico', valor: 2.3, fase: 4, concluiEm: 0, recurso: 'rc-emenda-semaforos' },
    { id: 'lc-merenda', objeto: 'Gêneros alimentícios · agricultura familiar', area: 'educacao', modalidade: 'Chamada pública', valor: 2.1, fase: 4, concluiEm: 0 },
  ];

  // Onde o PAGO deveria estar no mês: o pagamento corre cerca de um mês e meio atrás do empenho (medição, nota,
  // liquidação), então em novembro o esperado é ~79%, não 92%.
  const ESPERADO_PCT = () => Math.max(0, Math.round(((mesDoAno() - 1.5) / 12) * 100));
  const LIMITE_ATRASO_PP = 20;

  // Regras de alerta do orçamento (pauta do Paulo Fiuza, item 4): limites que a prefeitura ajusta na tela
  // Orçamento → "Regras de alerta". Guardadas por cidade (gc.orcamento.regras.<cidade>).
  const REGRAS_PADRAO = {
    recursoRiscoDias: 90, recursoRiscoExec: 70, // risco de devolução: faltam até N dias e executou menos de X%
    recursoAtencaoDias: 180, recursoAtencaoExec: 50,
    contratoJanelaDias: 120, // contrato que vence em até N dias precisa de licitação aberta
    contratoCriticoDias: 30, // ...e é crítico a partir de N dias
    atrasoPp: LIMITE_ATRASO_PP, // pasta atrasada: pago N pontos abaixo do esperado no mês
  };
  const chaveRegras = () => `gc.orcamento.regras.${GC.cidade ? GC.cidade.id : 'media'}`;
  function regras() {
    let s = null;
    try { s = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(chaveRegras())) : null; } catch (e) { s = null; }
    return Object.assign({}, REGRAS_PADRAO, s || {});
  }
  // Valida e grava. Devolve { ok, erros }.
  function salvarRegras(dados) {
    const r = Object.assign({}, regras());
    const erros = {};
    const LIM = { recursoRiscoDias: [15, 365], recursoRiscoExec: [10, 100], recursoAtencaoDias: [30, 540], recursoAtencaoExec: [5, 100], contratoJanelaDias: [30, 365], contratoCriticoDias: [5, 120], atrasoPp: [5, 60] };
    Object.keys(LIM).forEach((k) => {
      if (dados[k] === undefined) return;
      const v = Math.round(Number(dados[k]));
      if (!Number.isFinite(v) || v < LIM[k][0] || v > LIM[k][1]) erros[k] = `Use um número de ${LIM[k][0]} a ${LIM[k][1]}.`;
      else r[k] = v;
    });
    if (!erros.recursoAtencaoDias && r.recursoAtencaoDias <= r.recursoRiscoDias) erros.recursoAtencaoDias = 'A atenção começa antes do risco: use mais dias que no risco.';
    if (!erros.contratoCriticoDias && r.contratoCriticoDias >= r.contratoJanelaDias) erros.contratoCriticoDias = 'O prazo crítico tem de ser menor que a janela da licitação.';
    if (Object.keys(erros).length) return { ok: false, erros };
    try { localStorage.setItem(chaveRegras(), JSON.stringify(r)); } catch (e) { /* vale até recarregar */ }
    return { ok: true, regras: r };
  }
  function restaurarRegras() { try { localStorage.removeItem(chaveRegras()); } catch (e) { /* nada */ } }

  // Situação de um recurso externo: o executado contra o tempo que resta até o prazo.
  function situacaoRecurso(r) {
    const R = regras();
    if (r.executadoPct >= 95) return 'concluido';
    if (r.prazoDias <= R.recursoRiscoDias && r.executadoPct < R.recursoRiscoExec) return 'risco';
    if (r.prazoDias <= R.recursoAtencaoDias && r.executadoPct < R.recursoAtencaoExec) return 'atencao';
    return 'em_dia';
  }
  GC.SITUACAO_RECURSO = { risco: 'Risco de devolução', atencao: 'Atenção', em_dia: 'Em dia', concluido: 'Executado' };

  function recursos(areas) {
    return RECURSOS.filter((r) => !areas || areas.includes(r.area)).map((r) => {
      const valorMi = mi(r.valor);
      const saldoMi = r1(valorMi * (1 - r.executadoPct / 100));
      const situacao = situacaoRecurso(r);
      return Object.assign({}, r, {
        valorMi, saldoMi, recebidoMi: r1(valorMi * r.recebidoPct / 100), executadoMi: r1(valorMi * r.executadoPct / 100),
        prazo: emDias(r.prazoDias), contas: emDias(r.prazoDias + r.contasDias), situacao,
        emRiscoMi: situacao === 'risco' ? saldoMi : 0,
      });
    }).sort((a, b) => (['risco', 'atencao', 'em_dia', 'concluido'].indexOf(a.situacao) - ['risco', 'atencao', 'em_dia', 'concluido'].indexOf(b.situacao)) || (a.prazoDias - b.prazoDias));
  }

  function contratos(areas) {
    const agora = GC.agora ? GC.agora() : Date.now();
    const base = GC.gestao && GC.gestao.contratos ? GC.gestao.contratos(agora).lista : [];
    const extra = CONTRATOS_EXTRA.map((c) => Object.assign({}, c, { valorMi: mi(c.valorMi), multaMil: Math.round(c.multaMil * fator()), vence: emDias(c.venceDias), foraSla: c.slaPct < c.metaSlaPct, vencendo: c.venceDias <= 60 }));
    return [...base, ...extra].filter((c) => !areas || (c.area && areas.includes(c.area))).map((c) => {
      const lic = LICITACOES.find((l) => l.substitui === c.id);
      // Cobertura: a licitação que renova o contrato termina antes de ele vencer?
      let cobertura = 'sem_licitacao';
      if (c.venceDias > regras().contratoJanelaDias) cobertura = 'nao_precisa';
      else if (lic && lic.concluiEm <= c.venceDias - 5) cobertura = 'coberto';
      else if (lic) cobertura = 'apertado';
      return Object.assign({}, c, { licitacao: lic ? lic.id : null, cobertura });
    }).sort((a, b) => a.venceDias - b.venceDias);
  }
  GC.COBERTURA_CONTRATO = { coberto: 'Licitação termina antes', apertado: 'Licitação não termina a tempo', sem_licitacao: 'Sem licitação aberta', get nao_precisa() { return `Vence depois de ${regras().contratoJanelaDias} dias`; } };

  function licitacoes(areas) {
    const cts = contratos(null);
    return LICITACOES.filter((l) => !areas || areas.includes(l.area)).map((l) => {
      const c = l.substitui ? cts.find((x) => x.id === l.substitui) : null;
      const rec = l.recurso ? RECURSOS.find((x) => x.id === l.recurso) : null;
      const atrasa = (c && l.concluiEm > c.venceDias - 5) || (rec && l.concluiEm > rec.prazoDias - 30);
      return Object.assign({}, l, {
        valorMi: mi(l.valor), faseNome: GC.FASES_LICITACAO[l.fase], conclusao: emDias(l.concluiEm),
        contrato: c ? { id: c.id, nome: c.nome, venceDias: c.venceDias } : null,
        recursoNome: rec ? rec.nome : null, prazoRecursoDias: rec ? rec.prazoDias : null,
        situacao: l.fase === 4 ? 'homologada' : atrasa ? 'risco' : 'no_prazo',
      });
    }).sort((a, b) => (a.situacao === 'risco' ? -1 : 0) - (b.situacao === 'risco' ? -1 : 0) || a.fase - b.fase);
  }

  // Execução por secretaria (dotação, empenhado, liquidado, pago) contra o esperado pelo mês do ano.
  function execucao(areas) {
    const o = GC.gestao && GC.gestao.orcamento ? GC.gestao.orcamento({ mesDoAno: mesDoAno() }) : { areas: [] };
    const esperado = ESPERADO_PCT();
    const lista = o.areas.filter((a) => !areas || areas.includes(a.id)).map((a) => {
      const liquidadoPct = Math.round(a.pagoPct + (a.empenhadoPct - a.pagoPct) * 0.55);
      return Object.assign({}, a, { liquidadoPct, liquidadoMi: r1(a.previstoMi * liquidadoPct / 100), atrasoPp: Math.max(0, esperado - a.pagoPct) });
    });
    const soma = (k) => r1(lista.reduce((s, a) => s + a[k], 0));
    const previstoMi = soma('previstoMi');
    const pct = (k) => (previstoMi ? Math.round((soma(k) / previstoMi) * 100) : 0);
    return { esperadoPct: esperado, previstoMi, empenhadoMi: soma('empenhadoMi'), liquidadoMi: soma('liquidadoMi'), pagoMi: soma('pagoMi'), empenhadoPct: pct('empenhadoMi'), liquidadoPct: pct('liquidadoMi'), pagoPct: pct('pagoMi'), areas: lista, atrasadas: lista.filter((a) => a.atrasoPp >= regras().atrasoPp).sort((a, b) => b.atrasoPp - a.atrasoPp) };
  }

  // O que precisa do gestor, em ordem: contrato que vence sem cobertura, recurso que pode voltar, pasta atrasada.
  function pendencias(r) {
    const p = [];
    r.contratos.filter((c) => c.cobertura === 'sem_licitacao' || c.cobertura === 'apertado').forEach((c) => p.push({
      tipo: 'contrato', id: c.id, gravidade: c.venceDias <= regras().contratoCriticoDias ? 'critica' : 'alta', area: c.area,
      titulo: `${c.nome}: vence em ${c.venceDias} dias`, texto: c.cobertura === 'sem_licitacao' ? 'Não há licitação aberta para substituir. Risco de o serviço parar ou de contrato emergencial.' : 'A licitação aberta não termina antes do vencimento. Avaliar aditivo de prazo.',
    }));
    r.recursos.filter((x) => x.situacao === 'risco').forEach((x) => p.push({
      tipo: 'recurso', id: x.id, gravidade: x.prazoDias <= 60 ? 'critica' : 'alta', area: x.area,
      titulo: `${x.nome}: ${x.executadoPct}% executado`, texto: `Faltam ${x.prazoDias} dias para o prazo de ${GC.FONTES_RECURSO[x.fonte].curto.toLowerCase()} (${x.orgao}). Saldo de R$ ${fmtMi(x.saldoMi)} pode ser devolvido.`,
    }));
    r.execucao.atrasadas.forEach((a) => p.push({
      tipo: 'execucao', id: a.id, gravidade: 'media', area: a.id,
      titulo: `${a.nome}: pagou ${a.pagoPct}% do orçamento`, texto: `${a.atrasoPp} pontos abaixo do esperado para o mês (${r.execucao.esperadoPct}%).`,
    }));
    const ordem = { critica: 0, alta: 1, media: 2 };
    return p.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
  }

  // R$ milhões em texto: 1,2 mi; 1.234,5 mi vira 1,2 bi.
  function fmtMi(v) {
    if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }

  function resumo({ areas = null } = {}) {
    const r = { execucao: execucao(areas), recursos: recursos(areas), contratos: contratos(areas), licitacoes: licitacoes(areas) };
    const ext = r.recursos;
    r.externo = {
      totalMi: r1(ext.reduce((s, x) => s + x.valorMi, 0)),
      executadoMi: r1(ext.reduce((s, x) => s + x.executadoMi, 0)),
      emRiscoMi: r1(ext.reduce((s, x) => s + x.emRiscoMi, 0)),
      porFonte: Object.keys(GC.FONTES_RECURSO).map((f) => ({ fonte: f, valorMi: r1(ext.filter((x) => x.fonte === f).reduce((s, x) => s + x.valorMi, 0)), n: ext.filter((x) => x.fonte === f).length })).filter((x) => x.n),
      emRisco: ext.filter((x) => x.situacao === 'risco'),
    };
    r.vencendo90 = r.contratos.filter((c) => c.venceDias <= 90);
    r.semCobertura = r.contratos.filter((c) => c.cobertura === 'sem_licitacao' || c.cobertura === 'apertado');
    r.licitacoesRisco = r.licitacoes.filter((l) => l.situacao === 'risco');
    r.pendencias = pendencias(r);
    r.arrecadacao = GC.gestao && GC.gestao.arrecadacao ? GC.gestao.arrecadacao() : null;
    return r;
  }

  GC.orcamentoGestao = { resumo, recursos, contratos, licitacoes, execucao, fmtMi, LIMITE_ATRASO_PP, REGRAS_PADRAO, regras, salvarRegras, restaurarRegras, limiteAtraso: () => regras().atrasoPp };
})(window.GC = window.GC || {});
