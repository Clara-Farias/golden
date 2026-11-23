(function (GC) {
  // Prazos (spec: docs/specs/2026-11-12-vila-dourada-prazos-design.md). Só lógica, sem DOM.
  // Toda ocorrência tem dois prazos, contados desde que nasceu:
  // - atendimento (o.prazoMin): pôr equipe em campo. É o de "estourada", "vai estourar", cobrança e caixa de entrada;
  // - solução (o.prazoSolucaoMin): resolver. É o do "% no prazo" (o.noPrazo, gravado ao resolver).
  // Quem precisa de limite ou de tempo restante lê GC.prazoDe; ninguém mais calcula criadaEm + prazoMin.
  // Também guarda os prazos de resposta (cobrança, explicação, pedido de ajuda) e a janela do "vai estourar".

  const MIN = 60000;
  GC.agora = GC.agora || (() => Date.now());

  // ---- Prazos de resposta (quem lê: js/cobrancas.js, js/acoes-prefeito.js, js/ajudas.js, js/caixa-entrada.js) ----
  GC.PRAZO_RESPOSTA_MIN = { critica: 30, alta: 60, media: 120 }; // cobrança e explicação pedida, por gravidade
  GC.PRAZO_RESPOSTA_AJUDA_MIN = 60; // pedido de ajuda sem resposta em 1 h está parado
  GC.PREVISAO_DETERMINADA_MIN = 120; // o prefeito determina a ajuda: a pasta pedida tem 2 h
  GC.JANELA_ANTECIPA_MIN = 120; // "vai estourar" na caixa do secretário: prazo acabando nas próximas 2 h
  // Fase 2 (spec: docs/specs/2026-11-12-vila-dourada-prazos-fase2-design.md).
  GC.PAUSA_TETO_MIN = 4320; // pausada há mais de 72 h: volta a pedir o prefeito
  GC.PRORROGACAO_LIVRE_MIN = { critica: 120, alta: 720, media: 1440 }; // a pasta prorroga sozinha até isso, uma vez
  // Os valores acima e os prazos por gravidade podem mudar na tela de parâmetros (js/prazos-parametros.js).

  // ---- Prazos da ocorrência por gravidade ----
  // Os números moram em js/data-alertas.js (GC.data.prazoMin e GC.data.prazoSolucaoMin); estes são o reserva.
  const ATENDIMENTO_RESERVA = { critica: 120, alta: 1440, media: 4320 };
  const SOLUCAO_RESERVA = { critica: 1440, alta: 4320, media: 10080 };
  GC.prazosPadrao = function () {
    const d = GC.data || {};
    return {
      atendimento: Object.assign({}, ATENDIMENTO_RESERVA, d.prazoMin || {}),
      solucao: Object.assign({}, SOLUCAO_RESERVA, d.prazoSolucaoMin || {}),
    };
  };

  // Prazos de uma ocorrência nova: os da regra, se ela tiver próprios, senão os da gravidade.
  // A solução nunca é menor que o atendimento (resolver inclui chegar).
  GC.prazosIniciais = function (severidade, { atendimentoMin = null, solucaoMin = null } = {}) {
    const p = GC.prazosPadrao();
    const atendimento = atendimentoMin || p.atendimento[severidade] || 1440;
    const solucao = Math.max(atendimento, solucaoMin || p.solucao[severidade] || atendimento);
    return { atendimento, solucao };
  };

  // ---- Relógio do prazo: a idade menos o tempo pausado ----
  GC.MOTIVOS_PAUSA = {
    terceiro: 'Aguardando concessionária ou terceiro',
    cidadao: 'Aguardando o cidadão',
    clima: 'Chuva ou clima',
    material: 'Falta material',
    contratacao: 'Contratação ou licitação',
    outro: 'Outro motivo',
  };
  // A pausa aberta (a última, sem fim), se houver.
  GC.pausaAtual = (o) => { const ps = (o && o.pausas) || []; const ult = ps[ps.length - 1]; return ult && !ult.ate ? ult : null; };
  // Minutos pausados entre a abertura e ref.
  GC.pausadoMin = function (o, ref = GC.agora()) {
    return ((o && o.pausas) || []).reduce((s, p) => {
      const ini = Math.max(p.desde, o.criadaEm);
      const fim = Math.min(p.ate || ref, ref);
      return s + Math.max(0, fim - ini) / MIN;
    }, 0);
  };
  GC.idadeMin = (o) => (GC.agora() - o.criadaEm) / MIN; // idade real ("aberta há…")
  // Tempo que conta para o prazo: a idade menos as pausas.
  GC.tempoDePrazoMin = (o, ref = GC.agora()) => (ref - o.criadaEm) / MIN - GC.pausadoMin(o, ref);
  // Atendimento: o que falta para pôr equipe em campo (negativo = estourado).
  GC.prazoRestanteMin = (o) => o.prazoMin - GC.tempoDePrazoMin(o);
  // Estourada = ainda sem equipe em campo e já passou do prazo de atendimento (única regra usada no painel).
  // Pausar não apaga o estouro: o restante fica parado no negativo.
  GC.estourada = (o) => o.status === 'encaminhada' && GC.prazoRestanteMin(o) < 0;

  // Quando a equipe chegou (o.chegouEm). Sem o registro, conta a abertura para quem já nasceu em campo e a
  // resolução para quem foi resolvida sem passar por "em campo".
  const chegada = (o) => o.chegouEm || (o.status === 'resolvida' ? o.resolvidaEm : o.status === 'em_campo' ? o.criadaEm : null);
  GC.chegadaDe = chegada;

  function fase(o, totalMin, cumpridoEm, agora) {
    const total = Math.max(1, totalMin || 1);
    const ref = cumpridoEm || agora;
    const usado = GC.tempoDePrazoMin(o, ref);
    const restanteMin = total - usado;
    return {
      totalMin: total,
      // Quando vence, se o relógio seguir andando daqui (pausada, o limite escorrega).
      limiteEm: ref + restanteMin * MIN,
      restanteMin,
      usadoPct: Math.max(0, Math.min(100, (usado / total) * 100)),
      estourado: restanteMin < 0,
      cumpridoEm: cumpridoEm || null,
      pausada: !cumpridoEm && !!GC.pausaAtual(o),
    };
  }

  // Os dois prazos da ocorrência. Depois de cumprida (chegou / resolveu), a fase para de contar.
  GC.prazoDe = function (o, agora = GC.agora()) {
    const solucaoMin = o.prazoSolucaoMin || GC.prazosIniciais(o.severidade, { atendimentoMin: o.prazoMin }).solucao;
    return {
      atendimento: fase(o, o.prazoMin, chegada(o), agora),
      solucao: fase(o, Math.max(o.prazoMin || 0, solucaoMin), o.status === 'resolvida' ? o.resolvidaEm : null, agora),
    };
  };
  // A fase que está correndo: atendimento sem equipe no local, senão solução.
  GC.faseCorrendo = (o) => (o.status === 'encaminhada' && !o.chegouEm ? 'atendimento' : 'solucao');

  // Passou do prazo de solução: aberta e vencida, ou resolvida fora do prazo. Juntada a outra não conta.
  GC.solucaoAtrasada = function (o, agora = GC.agora()) {
    if (!o || o.duplicadaDe) return false;
    if (o.status === 'resolvida') return o.noPrazo === false;
    return GC.prazoDe(o, agora).solucao.estourado;
  };
  // Pausada há mais que o teto dos parâmetros.
  GC.pausaLonga = function (o, agora = GC.agora()) {
    const p = o && o.status !== 'resolvida' ? GC.pausaAtual(o) : null;
    return !!p && (agora - p.desde) / MIN > GC.PAUSA_TETO_MIN;
  };

  // ---- Histórico (o.historicoPrazo) ----
  const MOTIVOS = {
    abertura_regra: 'Prazos da regra',
    abertura_gravidade: 'Prazos da gravidade',
    priorizado: 'Prefeito priorizou: o tempo que faltava caiu pela metade',
    prorrogado: 'Prorrogado',
    devolvida: 'Devolvida à pasta certa: o prazo para pôr equipe em campo recomeçou',
  };
  GC.MOTIVOS_PRAZO = MOTIVOS;
  // Registra a mudança e devolve o item. Quem muda o prazo da ocorrência passa por aqui.
  GC.registrarPrazo = function (o, motivo, em = GC.agora(), extra = {}) {
    const item = Object.assign({ em, motivo, atendimentoMin: o.prazoMin, solucaoMin: o.prazoSolucaoMin, texto: MOTIVOS[motivo] || motivo }, extra);
    o.historicoPrazo = [...(o.historicoPrazo || []), item];
    return item;
  };

  // Corta pela metade o tempo que falta nos dois prazos (cortar o prazo inteiro faria estourar na hora).
  GC.encurtarPrazos = function (o, agora = GC.agora()) {
    const usado = GC.tempoDePrazoMin(o, agora);
    const p = GC.prazoDe(o, agora);
    if (!p.atendimento.cumpridoEm) o.prazoMin = Math.round(usado + Math.max(0, p.atendimento.restanteMin) / 2);
    o.prazoSolucaoMin = Math.max(o.prazoMin, Math.round(usado + Math.max(0, p.solucao.restanteMin) / 2));
    return GC.registrarPrazo(o, 'priorizado', agora);
  };

  // ---- Prorrogação ----
  const FASE_TEXTO = { atendimento: 'pôr equipe em campo', solucao: 'resolver' };
  GC.FASES_PRAZO = FASE_TEXTO;
  GC.prorrogacaoPendente = (o) => ((o && o.prorrogacoes) || []).find((p) => p.estado === 'pendente') || null;
  // Vale na hora ('automatica') ou vai ao prefeito ('pendente'): até o limite da gravidade, uma vez por ocorrência.
  GC.estadoNovaProrrogacao = function (o, minutos) {
    const livre = (GC.PRORROGACAO_LIVRE_MIN || {})[o.severidade] || 0;
    const usou = (o.prorrogacoes || []).some((p) => p.estado === 'automatica');
    return livre > 0 && !usou && minutos <= livre ? 'automatica' : 'pendente';
  };
  // Soma os minutos na fase pedida (a solução nunca fica menor que o atendimento) e registra.
  GC.aplicarProrrogacao = function (o, p, em = GC.agora()) {
    if (p.fase === 'atendimento') o.prazoMin += p.minutos;
    else o.prazoSolucaoMin = (o.prazoSolucaoMin || 0) + p.minutos;
    o.prazoSolucaoMin = Math.max(o.prazoSolucaoMin || 0, o.prazoMin);
    const como = p.estado === 'automatica' ? 'pela pasta' : 'com aprovação do prefeito';
    const quanto = GC.tempoTexto ? GC.tempoTexto(p.minutos) : `${p.minutos} min`;
    return GC.registrarPrazo(o, 'prorrogado', em, { fase: p.fase, minutos: p.minutos, quem: p.decididaPor || p.quem,
      texto: `Prorrogado ${como}: mais ${quanto} para ${FASE_TEXTO[p.fase]}` });
  };

  // ---- Devolução: o atendimento recomeça na pasta certa ----
  // Prazo de atendimento da abertura (o primeiro do histórico) contado de agora; a solução ganha o tempo de prazo
  // que passou na pasta errada (desde a abertura ou a devolução anterior). Chamar antes de gravar a devolução nova.
  GC.reiniciarNaDevolucao = function (o, de, em = GC.agora()) {
    const devs = o.devolucoes || [];
    const inicio = (devs[devs.length - 1] || {}).t || o.criadaEm;
    const usado = GC.tempoDePrazoMin(o, em);
    const perdido = Math.max(0, usado - GC.tempoDePrazoMin(o, inicio));
    const original = ((o.historicoPrazo || [])[0] || {}).atendimentoMin || GC.prazosIniciais(o.severidade).atendimento;
    o.prazoMin = Math.round(usado + original);
    o.prazoSolucaoMin = Math.max(Math.round((o.prazoSolucaoMin || 0) + perdido), o.prazoMin);
    return GC.registrarPrazo(o, 'devolvida', em, { de, perdidoMin: Math.round(perdido) });
  };
  // ---- Resumo para relatório (fase 3): o que aconteceu com os prazos nas ocorrências do painel ----
  // ocorrencias: as da store (abertas e resolvidas), já no recorte do relatório. Juntadas a outra não contam.
  GC.resumoPrazos = function (ocorrencias, agora = GC.agora()) {
    const lista = (ocorrencias || []).filter((o) => !o.duplicadaDe);
    const abertas = lista.filter((o) => o.status !== 'resolvida');
    const prorrogacoes = lista.flatMap((o) => o.prorrogacoes || []);
    const conta = (estado) => prorrogacoes.filter((p) => p.estado === estado).length;
    const concedidas = prorrogacoes.filter((p) => p.estado === 'automatica' || p.estado === 'aprovada');
    const devolucoes = lista.flatMap((o) => (o.historicoPrazo || []).filter((h) => h.motivo === 'devolvida'));
    const causas = {};
    lista.forEach((o) => (o.pausas || []).forEach((p) => { causas[p.motivo] = (causas[p.motivo] || 0) + 1; }));
    return {
      abertas: abertas.length,
      estouradas: abertas.filter(GC.estourada).length,
      solucaoAtrasada: abertas.filter((o) => GC.solucaoAtrasada(o, agora)).length,
      pausadas: abertas.filter((o) => GC.pausaAtual(o)).length,
      pausaLonga: abertas.filter((o) => GC.pausaLonga(o, agora)).length,
      pausadoMin: Math.round(lista.reduce((s, o) => s + GC.pausadoMin(o, o.resolvidaEm || agora), 0)),
      causasPausa: Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => ({ motivo, nome: GC.MOTIVOS_PAUSA[motivo] || motivo, n })),
      prorrogacoes: { automaticas: conta('automatica'), aprovadas: conta('aprovada'), recusadas: conta('recusada'), aguardando: conta('pendente'),
        concedidasMin: concedidas.reduce((s, p) => s + p.minutos, 0) },
      devolucoes: devolucoes.length,
      perdidoMin: devolucoes.reduce((s, h) => s + (h.perdidoMin || 0), 0),
    };
  };
})(window.GC = window.GC || {});
