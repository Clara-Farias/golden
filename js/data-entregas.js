(function (GC) {
  // Agenda de entregas: o que a prefeitura entregou, o que vai entregar e o que está em risco.
  // Spec: docs/specs/2026-11-12-vila-dourada-agenda-de-entregas-design.md.
  // Uma fonte por número. Três origens, sem cópia:
  //   - toda obra de js/data-obras.js vira uma entrega (datas, avanço e situação do mesmo GC.obras.resumo());
  //   - as conquistas (GC.data.conquistas) são a parte "entregue"; a ligada a uma obra (c.obra) é a mesma entrega;
  //   - as escritas aqui embaixo: serviços e programas que não são obra.
  // Carrega antes de js/cidade.js (que leva as escritas para os bairros das outras cidades) e só calcula na hora
  // da chamada: as metas das secretarias (js/data-secretarias.js) ainda não existem quando este arquivo roda.
  // Puro: sem DOM, testável em Node.
  const LIMITE_RISCO_PP = 15; // feito abaixo do esperado por mais que isso = em risco
  const MIN_DIAS_RISCO = 30; // obra com menos tempo de andamento ainda não tem ritmo para medir
  const DIA = 86400000;
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const dias = (de, ate) => Math.round((utc(ate) - utc(de)) / DIA);
  const data = (iso) => GC.relogio.data(iso);

  // Serviços e programas com dia de chegar ao morador. dataAtual só quando a data mudou (remarcada).
  // feita = já entregue. meta = título da meta da secretaria (js/data-secretarias.js) que a entrega cumpre.
  const escritas = [
    { id: 'en-matricula-online', titulo: 'Matrícula 100% online', tipo: 'servico', area: 'educacao', bairroId: null,
      dataOriginal: data('2026-02-02'), feita: true, meta: 'Matrícula 100% online',
      descricao: 'Matrícula da rede municipal feita pelo celular, sem fila na escola.' },
    { id: 'en-whatsapp-ubs', titulo: 'Lembrete de consulta por WhatsApp', tipo: 'programa', area: 'saude', bairroId: null,
      dataOriginal: data('2026-06-30'), feita: true, meta: 'Lembrete por WhatsApp em todas as UBS',
      descricao: 'Todas as UBS avisam a consulta um dia antes, e o paciente confirma ou desmarca pela mensagem.' },
    { id: 'en-bilhete-digital', titulo: 'Bilhete único digital', tipo: 'servico', area: 'mobilidade', bairroId: null,
      dataOriginal: data('2026-08-14'), feita: true, meta: 'Bilhete único digital',
      descricao: 'Passagem paga pelo celular, com integração entre as linhas em até 2 horas.' },
    { id: 'en-sirenes-serra', titulo: 'Sirenes nas áreas de risco do Alto da Serra', tipo: 'servico', area: 'defesa_civil', bairroId: 'alto_da_serra',
      dataOriginal: data('2026-03-31'), dataAtual: data('2026-12-18'), meta: 'Sirenes em todas as áreas de risco',
      descricao: 'Sirene e aviso por SMS para os moradores das encostas, antes do pico das chuvas.' },
    { id: 'en-seletiva-flores', titulo: 'Coleta seletiva no Jardim das Flores', tipo: 'servico', area: 'limpeza', bairroId: 'jardim_das_flores',
      dataOriginal: data('2026-11-23'), meta: 'Coleta seletiva em 30% dos domicílios',
      descricao: 'Caminhão da coleta seletiva uma vez por semana em todas as ruas do bairro.' },
  ];

  GC.data.entregas = { escritas, limiteRiscoPp: LIMITE_RISCO_PP, minDiasRisco: MIN_DIAS_RISCO };

  // Setor da obra → pasta. Cultura e Esporte não são pastas do painel: a Infraestrutura executa essas obras.
  const AREAS = ['infraestrutura', 'defesa_civil', 'saude', 'educacao', 'seguranca', 'mobilidade', 'limpeza'];
  const areaDaObra = (setor) => (AREAS.includes(setor) ? setor : 'infraestrutura');

  const SITUACOES = ['parada', 'atrasada', 'em_risco', 'no_prazo', 'entregue'];
  const DA_OBRA = { concluida: 'entregue', paralisada: 'parada', atrasada: 'atrasada', em_dia: 'no_prazo' };

  function metaDe(area, titulo) {
    if (!titulo) return null;
    const s = (GC.data.secretarias || {})[area];
    const m = s && (s.metas || []).find((x) => x.titulo === titulo);
    return m ? { area, titulo: m.titulo, progressoPct: m.progressoPct, prazo: m.prazo, status: m.status } : { area, titulo };
  }

  // Esperado pelo tempo corrido: (hoje − início) / (previsão atual − início).
  function esperadoDe(ob, hoje) {
    const total = dias(ob.inicio, ob.previsaoAtual);
    if (total <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((dias(ob.inicio, hoje) / total) * 100)));
  }

  function daObra(ob, hoje, conquista) {
    let situacao = DA_OBRA[ob.situacao];
    const andamento = situacao !== 'entregue';
    const esperadoPct = andamento ? esperadoDe(ob, hoje) : null;
    if (situacao === 'no_prazo' && dias(ob.inicio, hoje) >= MIN_DIAS_RISCO && esperadoPct - ob.avancoPct > LIMITE_RISCO_PP) situacao = 'em_risco';
    // Entregue: a data é a do dia em que ficou pronta (a da conquista, quando há uma).
    const entregueEm = conquista ? conquista.data : ob.previsaoAtual;
    return {
      id: conquista ? conquista.id : `obra:${ob.id}`,
      titulo: ob.nome, tipo: 'obra', area: areaDaObra(ob.setor), bairroId: ob.bairroId,
      lat: conquista ? conquista.lat : ob.lat, lng: conquista ? conquista.lng : ob.lng,
      dataOriginal: ob.previsaoOriginal,
      dataAtual: andamento ? ob.previsaoAtual : entregueEm,
      situacao, avancoPct: ob.avancoPct, esperadoPct,
      semAvancoDias: ob.semAvancoDias || 0,
      origem: { obra: ob.id }, conquista: conquista ? conquista.id : null,
      meta: conquista && conquista.meta ? metaDe(conquista.area, conquista.meta) : null,
      descricao: conquista ? conquista.descricao : '',
      empresa: ob.empresa || '', publica: true,
    };
  }

  function daConquista(c) {
    return {
      id: c.id, titulo: c.titulo, tipo: c.tipo || 'obra', area: c.area, bairroId: c.bairroId, lat: c.lat, lng: c.lng,
      dataOriginal: c.data, dataAtual: c.data, situacao: 'entregue', avancoPct: null, esperadoPct: null, semAvancoDias: 0,
      origem: { conquista: c.id }, conquista: c.id, meta: metaDe(c.area, c.meta),
      descricao: c.descricao || '', empresa: '', publica: true,
    };
  }

  // Escrita: entregue (feita), atrasada (passou do dia ou foi remarcada) ou no prazo. Nunca "em risco":
  // não há avanço medido para calcular o ritmo.
  function daEscrita(e, hoje) {
    const dataAtual = e.dataAtual || e.dataOriginal;
    const situacao = e.feita ? 'entregue' : (dataAtual > e.dataOriginal || dataAtual < hoje) ? 'atrasada' : 'no_prazo';
    return {
      id: e.id, titulo: e.titulo, tipo: e.tipo || 'servico', area: e.area, bairroId: e.bairroId || null, lat: null, lng: null,
      dataOriginal: e.dataOriginal, dataAtual, situacao, avancoPct: null, esperadoPct: null, semAvancoDias: 0,
      origem: { escrita: true }, conquista: null, meta: metaDe(e.area, e.meta),
      descricao: e.descricao || '', empresa: '', publica: e.publica !== false,
    };
  }

  // Todas as entregas, uma vez cada. Filtros: area, areas (lista), bairro, de/ate (dataAtual, aaaa-mm-dd), situacao
  // (uma ou lista). Ordem: pela data atual.
  function lista({ area = null, areas = null, bairro = null, de = null, ate = null, situacao = null, hoje = GC.relogio.hoje } = {}) {
    const conquistas = GC.data.conquistas || [];
    const porObra = Object.fromEntries(conquistas.filter((c) => c.obra).map((c) => [c.obra, c]));
    const obras = GC.obras && GC.obras.resumo ? GC.obras.resumo().obras : [];
    const todas = [
      ...obras.map((ob) => daObra(ob, hoje, porObra[ob.id])),
      ...conquistas.filter((c) => !c.obra || !obras.some((ob) => ob.id === c.obra)).map(daConquista),
      ...escritas.map((e) => daEscrita(e, hoje)),
    ].map((e) => Object.assign(e, {
      diasParaEntrega: dias(hoje, e.dataAtual), remarcada: e.dataAtual !== e.dataOriginal && e.situacao !== 'entregue',
      // Registro (js/entregas-registro.js): data confirmada, remarcações com motivo e inauguração marcada.
      registro: GC.registroEntregas ? GC.registroEntregas.estado(e.id, e.dataAtual) : null,
    }));
    const sits = situacao ? [].concat(situacao) : null;
    return todas.filter((e) => (!area || e.area === area) && (!areas || areas.includes(e.area))
      && (!bairro || e.bairroId === bairro) && (!de || e.dataAtual >= de) && (!ate || e.dataAtual <= ate)
      && (!sits || sits.includes(e.situacao)))
      .sort((a, b) => a.dataAtual.localeCompare(b.dataAtual) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }

  const somarDias = (iso, n) => new Date(utc(iso) + n * DIA).toISOString().slice(0, 10);
  // Gravidade para "precisam de atenção": parada, atrasada, em risco.
  const PESO = { parada: 0, atrasada: 1, em_risco: 2 };

  // Números do recorte para o widget, a tela e (fase 2) a Maia.
  function resumo(filtro = {}) {
    const hoje = filtro.hoje || GC.relogio.hoje;
    const todas = lista(Object.assign({}, filtro, { de: null, ate: null, situacao: null, hoje }));
    const ano = hoje.slice(0, 4);
    const abertas = todas.filter((e) => e.situacao !== 'entregue');
    const ate = (n) => abertas.filter((e) => e.dataAtual >= hoje && e.dataAtual <= somarDias(hoje, n));
    const atencao = abertas.filter((e) => e.situacao in PESO)
      .sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || a.dataAtual.localeCompare(b.dataAtual));
    return {
      hoje, todas,
      entregues: todas.filter((e) => e.situacao === 'entregue' && e.dataAtual.slice(0, 4) === ano),
      proximas30: ate(30), proximas90: ate(90),
      emRisco: abertas.filter((e) => e.situacao === 'em_risco'),
      atrasadas: abertas.filter((e) => e.situacao === 'atrasada'),
      paradas: abertas.filter((e) => e.situacao === 'parada'),
      atencao,
    };
  }

  // ---- palavras ----
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesAno = (iso) => `${MESES[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`;
  const diaMes = (iso) => `${+iso.slice(8, 10)} de ${MESES[+iso.slice(5, 7) - 1]}`;
  const ROTULOS = { entregue: 'Entregue', no_prazo: 'No prazo', em_risco: 'Em risco', atrasada: 'Atrasada', parada: 'Parada' };
  // No site da Prefeitura "em risco" não aparece (é uma projeção interna): a entrega aparece no prazo.
  const rotulo = (e, { publico = false } = {}) => ROTULOS[publico && e.situacao === 'em_risco' ? 'no_prazo' : e.situacao];

  // Uma linha que diz a situação: as mesmas palavras do widget público de obras ("nova previsão: …, era …").
  function situacaoEmPalavras(e, { publico = false } = {}) {
    // Remarcada dentro do mesmo mês: o mês não diz nada ("novembro, era novembro"), então vai o dia.
    const mesmoMes = e.remarcada && e.dataOriginal.slice(0, 7) === e.dataAtual.slice(0, 7);
    const quandoAgora = mesmoMes ? diaMes(e.dataAtual) : mesAno(e.dataAtual);
    const remarcada = e.remarcada ? ` (era ${mesmoMes ? diaMes(e.dataOriginal) : mesAno(e.dataOriginal)})` : '';
    if (e.situacao === 'entregue') return `entregue em ${diaMes(e.dataAtual)} de ${e.dataAtual.slice(0, 4)}`;
    if (e.situacao === 'parada') return `sem avanço há ${e.semAvancoDias} dias · previsão era ${mesAno(e.dataOriginal)}`;
    if (e.situacao === 'atrasada') return e.remarcada ? `nova previsão: ${quandoAgora}${remarcada}` : `previsão era ${mesAno(e.dataOriginal)}`;
    if (e.situacao === 'em_risco' && !publico) return `${e.avancoPct}% feito, o esperado hoje era ${e.esperadoPct}% · previsão ${mesAno(e.dataAtual)}`;
    return `prevista para ${quandoAgora}${remarcada}`;
  }

  // "hoje", "amanhã", "em 12 dias", "há 3 dias".
  function quando(e) {
    const n = e.diasParaEntrega;
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    if (n === -1) return 'ontem';
    return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
  }

  GC.entregas = { lista, resumo, situacaoEmPalavras, rotulo, quando, areaDaObra, mesAno, diaMes, SITUACOES, ROTULOS, MESES, CURTOS, LIMITE_RISCO_PP, MIN_DIAS_RISCO };
})(window.GC = window.GC || {});
