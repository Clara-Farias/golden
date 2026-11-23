(function (GC) {
  // Visualizações: um conjunto nomeado de filtros + widgets. As prontas são fixas; as do prefeito
  // ficam no navegador. Lógica pura (sem DOM): o armazenamento é injetado.
  const SEVERIDADES = ['critica', 'alta', 'media'];
  const RECORTES = ['criticas', 'estourado', 'andamento'];

  // categoria: agrupa o catálogo na gaveta Widgets; icone: Tabler (o emoji fica para textos antigos e a IA).
  GC.CATEGORIAS_WIDGET = [
    { id: 'gestao', nome: 'Gestão', icone: 'building-bank', cor: '#0f4c5c' },
    { id: 'tempo_real', nome: 'Tempo real', icone: 'activity', cor: '#0f4c5c' },
    { id: 'saude', nome: 'Saúde', icone: 'stethoscope', cor: '#0f4c5c' },
    { id: 'seguranca', nome: 'Segurança', icone: 'shield', cor: '#0f4c5c' },
    { id: 'cidade', nome: 'Infraestrutura e serviços', icone: 'building-community', cor: '#0f4c5c' },
    { id: 'social', nome: 'Social e educação', icone: 'users-group', cor: '#0f4c5c' },
    { id: 'financas', nome: 'Dinheiro e contratos', icone: 'coin', cor: '#0f4c5c' },
    { id: 'cidadao', nome: 'Cidadão', icone: 'message-circle', cor: '#0f4c5c' },
    { id: 'util', nome: 'Utilitários', icone: 'tool', cor: '#0f4c5c' },
    { id: 'ia', nome: 'Criados pela Maia', icone: 'sparkles', cor: '#6d28d9' },
  ];
  // Catálogo dos widgets. Os de domínio (números, satisfação, leitos, obras, frota…) se registram no próprio
  // arquivo, em js/widgets/<id>.js, com GC.registrarWidget; aqui ficam os gerais e os de js/widgets-extra.js.
  // "ordem" é a posição na gaveta Widgets e no painel padrão (menor primeiro).
  GC.WIDGETS = [
    { id: 'pulsos', ordem: 20, nome: 'Pulso das secretarias', emoji: '📊', icone: 'chart-bar', categoria: 'gestao', opcoes: true, descricao: 'O indicador principal de cada secretaria' },
    { id: 'desempenho', ordem: 30, nome: 'Desempenho · 30 dias', emoji: '🏁', icone: 'flag', categoria: 'gestao', descricao: 'Resolvidas, prazo, ranking e resolvidas recentes' },
    // ---- novos (js/widgets-extra.js) ----
    { id: 'metas_risco', ordem: 140, nome: 'Metas em risco', emoji: '🎯', icone: 'target-arrow', categoria: 'gestao', descricao: 'Os indicadores mais longe da meta, com tendência e atalho para a ficha' },
    { id: 'placar_metas', ordem: 150, nome: 'Placar de metas', emoji: '🎯', icone: 'chart-donut', categoria: 'gestao', descricao: 'Quantos indicadores estão na meta, perto ou fora, e a variação desde o mês passado' },
    { id: 'resumo', ordem: 160, nome: 'Resumo da IA', emoji: '✨', icone: 'sparkles', categoria: 'gestao', opcoes: true, descricao: 'O que mudou hoje ou na semana em três frases, com atalhos' },
    { id: 'decisoes', ordem: 170, nome: 'Decisões pendentes', emoji: '⏳', icone: 'gavel', categoria: 'gestao', descricao: 'O que espera o prefeito: prazo, secretaria que pediu e o motivo' },
    { id: 'agenda', ordem: 180, nome: 'Agenda e prazos', emoji: '📅', icone: 'calendar-event', categoria: 'gestao', descricao: 'Próximos 14 dias: reuniões, audiências, contratos vencendo e entregas de obra' },
    { id: 'feed', ordem: 190, nome: 'Ocorrências ao vivo', emoji: '📡', icone: 'broadcast', categoria: 'tempo_real', descricao: 'As últimas ocorrências da cidade, com gravidade e bairro (bom para o telão)' },
    { id: 'linha24h', ordem: 200, nome: 'Últimas 24 horas', emoji: '🕒', icone: 'clock-hour-4', categoria: 'tempo_real', descricao: 'Ocorrências abertas por hora, com o pico do dia' },
    { id: 'calor_bairros', ordem: 210, nome: 'Bairros em calor', emoji: '🔥', icone: 'grid-pattern', categoria: 'tempo_real', descricao: 'Grade dos bairros colorida pelas ocorrências abertas; clique para ver no mapa' },
    { id: 'crise', ordem: 220, nome: 'Gabinete de crise', emoji: '🚨', icone: 'urgent', categoria: 'tempo_real', descricao: 'Gabinetes ativos: tarefas, tempo decorrido e o preventivo sugerido pela chuva' },
    { id: 'previsao', ordem: 230, nome: 'Previsão 48 h', emoji: '🌧', icone: 'cloud-rain', categoria: 'tempo_real', descricao: 'Chuva, chance e temperatura a cada 6 horas, com o limite de alerta' },
    { id: 'orcamento', ordem: 240, nome: 'Execução orçamentária', emoji: '💰', icone: 'report-money', categoria: 'financas', descricao: 'Previsto × empenhado × pago, por secretaria' },
    { id: 'contratos', ordem: 250, nome: 'Contratos e SLA', emoji: '📑', icone: 'file-certificate', categoria: 'financas', descricao: 'Concessionárias fora do SLA, multas estimadas e contratos vencendo' },
    { id: 'custos', ordem: 260, nome: 'Custo por serviço', emoji: '🧾', icone: 'receipt', categoria: 'financas', descricao: 'Quanto custa cada serviço e quanto variou desde o mês passado' },
    { id: 'arrecadacao', ordem: 270, nome: 'Arrecadação', emoji: '🏦', icone: 'building-bank', categoria: 'financas', descricao: 'IPTU, ISS, ITBI e taxas: mês e ano × meta' },
    { id: 'voz_cidadao', ordem: 280, nome: 'Voz do cidadão', emoji: '💬', icone: 'messages', categoria: 'cidadao', descricao: 'Pedidos por canal (156, app, WhatsApp, ouvidoria), temas e sentimento' },
    { id: 'resposta_cidadao', ordem: 290, nome: 'Resposta ao cidadão', emoji: '⏱', icone: 'clock-check', categoria: 'cidadao', descricao: 'Pedidos abertos, respondidos e atrasados, e o tempo por canal' },
    { id: 'bairro_foco', ordem: 300, nome: 'Bairro em foco', emoji: '📍', icone: 'map-pin', categoria: 'cidadao', opcoes: true, descricao: 'Um bairro escolhido: ocorrências, satisfação, segurança e serviços' },
    { id: 'iluminacao', ordem: 310, nome: 'Iluminação pública', emoji: '💡', icone: 'bulb', categoria: 'cidade', descricao: 'Pontos apagados, tempo de reparo e troca por LED' },
    { id: 'ambiente', ordem: 320, nome: 'Meio ambiente', emoji: '🌳', icone: 'trees', categoria: 'cidade', descricao: 'Qualidade do ar, poda pendente, áreas verdes e focos de queimada' },
    { id: 'assistencia', ordem: 330, nome: 'Assistência social', emoji: '🏠', icone: 'home-heart', categoria: 'social', descricao: 'Abrigos e vagas, Bolsa Família, atendimentos nos CRAS' },
    { id: 'kpi', ordem: 340, nome: 'Indicador em destaque', emoji: '📈', icone: 'chart-line', categoria: 'util', opcoes: true, descricao: 'Qualquer indicador do catálogo em um cartão grande com a série' },
    { id: 'comparativo', ordem: 350, nome: 'Comparar bairros', emoji: '⚖', icone: 'scale', categoria: 'util', opcoes: true, descricao: 'Dois bairros lado a lado: ocorrências, satisfação, B.O.s e serviços' },
    { id: 'nota', ordem: 360, nome: 'Nota fixada', emoji: '📝', icone: 'note', categoria: 'util', opcoes: true, descricao: 'Um lembrete do gestor, escrito direto no cartão' },
  ];
  // Todos do catálogo, menos os criados pela Maia (que entram ligados por conta própria).
  const todosWidgets = () => GC.WIDGETS.filter((w) => !w.ia).map((w) => w.id);
  // Ligados na visão "Cidade inteira": todos, menos os que repetem outro lugar (Números-chave = cabeçalho;
  // Desempenho = ranking da tela Secretarias). Continuam disponíveis em Configurar widgets.
  const REPETEM = ['numeros', 'desempenho'];
  // Os widgets novos (js/widgets-extra.js) começam fora do painel padrão: entram pela gaveta ou pelas sugestões.
  // Os de domínio mais novos (vigilância, trânsito, habitação, prédios, economia, eventos) também.
  const NOVOS = new Set((['metas_risco', 'placar_metas', 'resumo', 'decisoes', 'agenda', 'feed', 'linha24h',
    'vigilancia', 'transito', 'habitacao', 'predios', 'economia', 'eventos',
    'calor_bairros', 'crise', 'previsao', 'orcamento', 'contratos', 'custos', 'arrecadacao', 'voz_cidadao', 'resposta_cidadao', 'bairro_foco',
    'iluminacao', 'ambiente', 'assistencia', 'kpi', 'comparativo', 'nota']));
  // Mesma lista (mesmo array) que a visão "Cidade inteira" usa: registrar um widget atualiza as duas.
  GC.WIDGETS_PADRAO = [];
  const recalcularPadrao = () => GC.WIDGETS_PADRAO.splice(0, GC.WIDGETS_PADRAO.length, ...todosWidgets().filter((id) => !REPETEM.includes(id) && !NOVOS.has(id)));
  // Widget de domínio entra no catálogo na posição da sua "ordem" (registrar de novo o mesmo id substitui).
  GC.registrarWidget = function (w) {
    const i = GC.WIDGETS.findIndex((x) => x.id === w.id);
    if (i >= 0) GC.WIDGETS.splice(i, 1);
    GC.WIDGETS.push(w);
    GC.WIDGETS.sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity));
    recalcularPadrao();
  };
  GC.WIDGETS.forEach((w, i) => { if (w.ordem === undefined) w.ordem = 1000 + i; }); // os sem ordem ficam no fim, na ordem da lista
  recalcularPadrao();

  GC.VISTAS_PRONTAS = [
    { id: 'cidade', nome: 'Cidade inteira', emoji: '🏙', fixa: true, filtros: {}, widgets: { ativos: GC.WIDGETS_PADRAO } },
    { id: 'criticas', nome: 'Críticas agora', emoji: '🔴', fixa: true, filtros: { severidades: ['critica'] }, widgets: { ativos: ['numeros', 'desempenho'] } },
    { id: 'chuva', nome: 'Chuva e obras', emoji: '🌧', fixa: true, filtros: { areas: ['defesa_civil', 'infraestrutura'] }, widgets: { ativos: ['risco', 'obras', 'pulsos', 'numeros'], pulsos: ['defesa_civil', 'infraestrutura'] }, mapa: { camadas: ['risco', 'obras'] } },
    { id: 'saude', nome: 'Saúde', emoji: '🏥', fixa: true, filtros: { areas: ['saude'] }, widgets: { ativos: ['leitos', 'social', 'medicamentos', 'pulsos', 'desempenho', 'satisfacao'], pulsos: ['saude'] }, mapa: { camadas: ['leitos', 'farmacias'] } },
    { id: 'seguranca', nome: 'Segurança', emoji: '🛡', fixa: true, filtros: { areas: ['seguranca'] }, widgets: { ativos: ['seguranca', 'pulsos', 'desempenho'], pulsos: ['seguranca'] }, mapa: { camadas: ['calor-bo'] } },
    { id: 'educacao', nome: 'Educação', emoji: '🎓', fixa: true, filtros: { areas: ['educacao'] }, widgets: { ativos: ['educacao', 'social', 'pulsos', 'desempenho'], pulsos: ['educacao'] }, mapa: { camadas: ['escolas'] } },
    { id: 'frota', nome: 'Frota e transporte', emoji: '🚌', fixa: true, filtros: { areas: ['mobilidade'] }, widgets: { ativos: ['frota', 'pulsos', 'desempenho'], pulsos: ['mobilidade', 'saude'] }, mapa: { camadas: ['frota'] } },
    { id: 'limpeza', nome: 'Limpeza Urbana', emoji: '🚛', fixa: true, filtros: { areas: ['limpeza'] }, widgets: { ativos: ['coleta', 'pulsos', 'desempenho'], pulsos: ['limpeza'] }, mapa: { camadas: ['coleta'] } },
  ];

  const lista = (v) => (Array.isArray(v) ? v : []);
  const unicos = (v) => [...new Set(v)];
  const idsAreas = () => GC.data.areas.map((a) => a.id);
  const idsBairros = () => GC.data.bairros.map((b) => b.id);

  // ---- filtros por atributo da ocorrência (além de secretaria, bairro e situação) ----
  // Pessoas afetadas: o que atinge mais gente (a gravidade sozinha não diz isso).
  GC.FAIXAS_AFETADOS = [
    { id: 'ate100', nome: 'Até 100', curto: 'até 100 afetados', casa: (n) => n <= 100 },
    { id: 'ate1000', nome: '101 a 1.000', curto: '101 a 1.000 afetados', casa: (n) => n > 100 && n <= 1000 },
    { id: 'mais1000', nome: 'Mais de 1.000', curto: '+1.000 afetados', casa: (n) => n > 1000 },
  ];
  // Tempo aberta: o que acabou de chegar × o que está parado há dias.
  GC.FAIXAS_TEMPO = [
    { id: 'recentes', nome: 'Menos de 1 h', curto: 'aberta há < 1 h', casa: (m) => m < 60 },
    { id: 'horas', nome: '1 a 24 h', curto: 'aberta há 1–24 h', casa: (m) => m >= 60 && m < 1440 },
    { id: 'dias', nome: 'Mais de 1 dia', curto: 'aberta há +1 dia', casa: (m) => m >= 1440 },
  ];
  // Origem do aviso: quem avisou. Uma ocorrência pode ter mais de uma (ex.: sensor + chamados 156).
  GC.ORIGENS = [
    { id: 'cidadao', nome: 'Cidadão (156 / App)', curto: 'aviso do cidadão', padrao: /156|app cidad/i },
    { id: 'sistemas', nome: 'Sensores e sistemas', curto: 'sensores e sistemas', padrao: /sensor|c[âa]mera|integra|gps|sistema|concession|companhia|central/i },
    { id: 'equipes', nome: 'Equipes da prefeitura', curto: 'equipes da prefeitura', padrao: /vistoria|escala|diretoria|equipe|guarda|vigil[âa]ncia|boletin/i },
  ];
  const ids = (l) => l.map((x) => x.id);
  GC.origensDe = function (o) {
    if (Array.isArray(o.origens) && o.origens.length) return o.origens;
    const fonte = String(o.fonte || '');
    const achadas = GC.ORIGENS.filter((x) => x.padrao.test(fonte)).map((x) => x.id);
    return achadas.length ? achadas : ['equipes']; // sem pista: registro interno da prefeitura
  };
  const minutosAberta = (o) => (GC.idadeMin && typeof o.criadaEm === 'number' ? GC.idadeMin(o) : o.abertaHaMin || 0);
  const faixa = (faixas, escolhidas, valor) => !escolhidas.length || faixas.some((x) => escolhidas.includes(x.id) && x.casa(valor));

  // Aplica gravidade, afetados, tempo, origem e "várias secretarias" (secretaria, bairro e situação ficam no store).
  GC.filtrarPorAtributos = function (ocorrencias, filtros) {
    const f = GC.normalizarEstado({ filtros }).filtros;
    return ocorrencias.filter((o) => (!f.severidades.length || f.severidades.includes(o.severidade))
      && faixa(GC.FAIXAS_AFETADOS, f.afetados, o.afetados || 0)
      && faixa(GC.FAIXAS_TEMPO, f.tempos, minutosAberta(o))
      && (!f.origens.length || GC.origensDe(o).some((x) => f.origens.includes(x)))
      && (!f.multi || (o.areasEnvolvidas || []).length > 1)
      && GC.casaTratamento(o, f.tratamento));
  };

  // Tratamento: o gabinete já agiu (GC.tratada: priorizada, gabinete, cobrança no prazo, delegada, adiada,
  // explicação pedida…) ou ainda não. Cobrança vencida volta a "não tratada", como em "Precisam de você".
  GC.TRATAMENTOS = [
    { id: 'nao_tratadas', nome: 'Ainda não tratadas', curto: 'não tratadas' },
    { id: 'tratadas', nome: 'Já tratadas', curto: 'já tratadas' },
  ];
  GC.casaTratamento = function (o, tratamento) {
    if (!tratamento) return true;
    const t = !!(GC.tratada && GC.tratada(o));
    return tratamento === 'tratadas' ? t : !t;
  };

  // Camadas fixas do mapa que uma visualização guarda (os nomes de CAMADAS em js/app/camadas.js, na ordem do painel).
  GC.CAMADAS_MAPA = ['frota', 'transito', 'eventos', 'coleta', 'escolas', 'predios', 'obras', 'risco', 'habitacao', 'calor-bo', 'leitos', 'farmacias', 'vigilancia', 'economia', 'orcamento', 'conquistas'];
  // Widgets fixados sobre o mapa: poucos, para não cobrir a cidade.
  GC.MAX_FIXADOS_MAPA = 4;
  // Lugares onde um widget fixado pode ficar (arrastando pelo cabeçalho ou em "Ajustar"). O primeiro é o padrão.
  GC.LUGARES_WIDGET_MAPA = [
    { id: 'dir-cima', nome: 'Direita, em cima' },
    { id: 'dir-baixo', nome: 'Direita, embaixo' },
    { id: 'esq-cima', nome: 'Esquerda, em cima' },
    { id: 'esq-baixo', nome: 'Esquerda, embaixo' },
    { id: 'baixo', nome: 'Embaixo, no meio' },
  ];
  // Onde cai um widget recém-fixado: o primeiro canto vazio ou com espaço, nesta ordem. "Embaixo, no meio" só
  // por escolha (cobre o centro da cidade). Os de baixo nos lados dividem a coluna com os de cima, então só
  // entram quando as duas de cima já estão cheias. contagem: { lugar: nº de cartões }; cabeMais(lugar): ainda
  // cabe um cartão no lugar ocupado. Nada cabe: o canto com menos cartões.
  GC.ORDEM_FIXAR_MAPA = ['dir-cima', 'esq-cima', 'dir-baixo', 'esq-baixo'];
  GC.lugarParaFixar = function ({ contagem = {}, cabeMais = () => false } = {}) {
    const livre = GC.ORDEM_FIXAR_MAPA.find((l) => !contagem[l] || cabeMais(l));
    if (livre) return livre;
    return GC.ORDEM_FIXAR_MAPA.reduce((a, l) => ((contagem[l] || 0) < (contagem[a] || 0) ? l : a));
  };
  // Tamanho no mapa: 'p' só o resumo (o padrão), 'm' e 'l' o cartão inteiro, mais largo.
  GC.TAMANHOS_WIDGET_MAPA = [{ id: 'p', nome: 'Compacto' }, { id: 'm', nome: 'Médio' }, { id: 'l', nome: 'Largo' }];
  // Lugar e tamanho de cada fixado: só o que fugiu do padrão (o estado continua enxuto).
  function noMapaValido(n, fixados) {
    const r = {};
    if (!n || typeof n !== 'object') return r;
    const lugares = GC.LUGARES_WIDGET_MAPA.map((l) => l.id);
    const tams = GC.TAMANHOS_WIDGET_MAPA.map((t) => t.id);
    fixados.slice().sort().forEach((id) => {
      const x = n[id];
      if (!x || typeof x !== 'object') return;
      const v = {};
      if (lugares.includes(x.lugar) && x.lugar !== lugares[0]) v.lugar = x.lugar;
      if (tams.includes(x.tam) && x.tam !== tams[0]) v.tam = x.tam;
      if (Object.keys(v).length) r[id] = v;
    });
    return r;
  }
  const numero = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
  // Zoom e posição do mapa guardados pela visualização (null = a cidade inteira, que se ajusta à tela).
  function enquadramentoValido(q) {
    if (!q || !Array.isArray(q.centro) || !numero(q.centro[0], -180, 180) || !numero(q.centro[1], -90, 90) || !numero(q.zoom, 0, 22)) return null;
    return { centro: [arred(q.centro[0], 5), arred(q.centro[1], 5)], zoom: arred(q.zoom, 2) };
  }
  // O que o mapa mostra além das ocorrências: camadas ligadas, legenda aberta e o enquadramento.
  GC.normalizarMapa = function (m) {
    const x = m || {};
    const camadas = lista(x.camadas);
    const enq = enquadramentoValido(x.enquadramento);
    return Object.assign(
      { camadas: GC.CAMADAS_MAPA.filter((c) => camadas.includes(c)), legenda: x.legenda === true },
      enq ? { enquadramento: enq } : {},
    );
  };

  // Forma canônica: descarta o que for inválido e ordena o que não tem ordem (para comparar).
  GC.normalizarEstado = function (e) {
    const f = (e && e.filtros) || {};
    const w = (e && e.widgets) || {};
    const areas = idsAreas();
    const pulsos = unicos(lista(w.pulsos).filter((a) => areas.includes(a)));
    const todosIds = GC.WIDGETS.map((x) => x.id);
    const fixados = unicos(lista(w.fixados).filter((id) => todosIds.includes(id))).slice(0, GC.MAX_FIXADOS_MAPA);
    return {
      filtros: {
        recorte: RECORTES.includes(f.recorte) ? f.recorte : null,
        severidades: SEVERIDADES.filter((s) => lista(f.severidades).includes(s)),
        areas: areas.filter((a) => lista(f.areas).includes(a)),
        // Vários bairros (na ordem da cidade). Visualização salva antes da seleção múltipla traz "bairro".
        bairros: (() => { const escolhidos = [...lista(f.bairros), ...(f.bairro ? [f.bairro] : [])]; return idsBairros().filter((b) => escolhidos.includes(b)); })(),
        afetados: ids(GC.FAIXAS_AFETADOS).filter((x) => lista(f.afetados).includes(x)),
        tempos: ids(GC.FAIXAS_TEMPO).filter((x) => lista(f.tempos).includes(x)),
        origens: ids(GC.ORIGENS).filter((x) => lista(f.origens).includes(x)),
        multi: f.multi === true,
        tratamento: GC.TRATAMENTOS.some((x) => x.id === f.tratamento) ? f.tratamento : null,
      },
      widgets: {
        // A ordem dos widgets importa (é a ordem no dashboard).
        // Catálogo lido na hora: widgets da Maia (js/widgets-ia.js) entram nele depois do carregamento.
        ativos: (() => { const todos = GC.WIDGETS.map((x) => x.id); return Array.isArray(w.ativos) ? unicos(w.ativos.filter((id) => todos.includes(id))) : todosWidgets(); })(),
        pulsos: pulsos.length ? areas.filter((a) => pulsos.includes(a)) : null,
        // Tamanho e opções por widget só entram quando alguém mudou algo (o estado padrão continua enxuto).
        ...(() => { const t = tamanhosValidos(w.tamanhos); return Object.keys(t).length ? { tamanhos: t } : {}; })(),
        ...(() => { const o = opcoesValidas(w.opcoes); return Object.keys(o).length ? { opcoes: o } : {}; })(),
        // Fixados sobre o mapa (na ordem em que aparecem, de cima para baixo).
        ...(fixados.length ? { fixados } : {}),
        ...(() => { const n = noMapaValido(w.noMapa, fixados); return Object.keys(n).length ? { noMapa: n } : {}; })(),
      },
      mapa: GC.normalizarMapa(e && e.mapa),
    };
  };

  // 'p' = compacto (só os números), 'l' = largo (linha inteira); o médio é o padrão e não se guarda.
  GC.TAMANHOS_WIDGET = [{ id: 'p', nome: 'Compacto' }, { id: 'm', nome: 'Médio' }, { id: 'l', nome: 'Largo' }];
  function tamanhosValidos(t) {
    const r = {};
    if (!t || typeof t !== 'object') return r;
    const todos = GC.WIDGETS.map((x) => x.id);
    Object.keys(t).sort().forEach((id) => { if (todos.includes(id) && (t[id] === 'p' || t[id] === 'l')) r[id] = t[id]; });
    return r;
  }
  function opcoesValidas(o) {
    const r = {};
    if (!o || typeof o !== 'object') return r;
    const bairros = idsBairros();
    const ehBairro = (b) => typeof b === 'string' && bairros.includes(b);
    if (o.bairro_foco && ehBairro(o.bairro_foco.bairro)) r.bairro_foco = { bairro: o.bairro_foco.bairro };
    if (o.comparativo && ehBairro(o.comparativo.a) && ehBairro(o.comparativo.b) && o.comparativo.a !== o.comparativo.b) r.comparativo = { a: o.comparativo.a, b: o.comparativo.b };
    if (o.kpi && typeof o.kpi.ind === 'string' && /^[A-Z]{3}\d{2}$/.test(o.kpi.ind)) r.kpi = { ind: o.kpi.ind };
    if (o.nota && typeof o.nota.texto === 'string' && o.nota.texto.trim()) r.nota = { texto: o.nota.texto.slice(0, 500) };
    if (o.resumo && o.resumo.periodo === 'semana') r.resumo = { periodo: 'semana' };
    return r;
  }

  // O enquadramento não conta: o mapa se move sozinho (foco num alerta, gaveta abrindo) e a visualização
  // ficaria sempre "alterada". Ele só muda quando alguém o guarda de propósito.
  const semEnquadramento = (e) => { const n = GC.normalizarEstado(e); delete n.mapa.enquadramento; return n; };
  GC.estadosIguais = (a, b) => JSON.stringify(semEnquadramento(a)) === JSON.stringify(semEnquadramento(b));

  // Quantos filtros estão ligados (cada opção marcada conta 1).
  GC.contarFiltrosEstado = function (filtros) {
    const f = GC.normalizarEstado({ filtros }).filtros;
    return f.areas.length + f.severidades.length + f.bairros.length + (f.recorte ? 1 : 0)
      + f.afetados.length + f.tempos.length + f.origens.length + (f.multi ? 1 : 0) + (f.tratamento ? 1 : 0);
  };

  // O que uma visualização mostra, em poucas palavras (ex.: "Saúde · Crítica · 2 bairros").
  const NOMES_RECORTE = { criticas: 'Só críticas', estourado: 'Prazo estourado', andamento: 'Em atendimento' };
  const NOMES_SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const nomesDe = (faixas, escolhidas) => faixas.filter((x) => escolhidas.includes(x.id)).map((x) => x.curto).join(' ou ');
  GC.resumoFiltros = function (filtros) {
    const f = GC.normalizarEstado({ filtros }).filtros;
    const partes = [];
    if (f.areas.length) partes.push(f.areas.length > 2 ? `${f.areas.length} secretarias` : f.areas.map((a) => GC.data.areas.find((x) => x.id === a).nome).join(' + '));
    if (f.recorte) partes.push(NOMES_RECORTE[f.recorte]);
    if (f.severidades.length) partes.push(f.severidades.map((s) => NOMES_SEV[s]).join(' + '));
    if (f.bairros.length) partes.push(f.bairros.length > 1 ? `${f.bairros.length} bairros` : GC.data.bairros.find((b) => b.id === f.bairros[0]).nome);
    if (f.afetados.length) partes.push(nomesDe(GC.FAIXAS_AFETADOS, f.afetados));
    if (f.tempos.length) partes.push(nomesDe(GC.FAIXAS_TEMPO, f.tempos));
    if (f.origens.length) partes.push(nomesDe(GC.ORIGENS, f.origens));
    if (f.multi) partes.push('várias secretarias');
    if (f.tratamento) partes.push(GC.TRATAMENTOS.find((x) => x.id === f.tratamento).curto);
    return partes;
  };

  // Ícones que uma visualização salva pode ter (o emoji vira ícone em js/icones.js). O primeiro é o padrão.
  GC.EMOJIS_VISTA = [
    { emoji: '⭐', nome: 'Estrela' }, { emoji: '🏙', nome: 'Cidade' }, { emoji: '🔴', nome: 'Urgente' },
    { emoji: '🌧', nome: 'Chuva' }, { emoji: '🏥', nome: 'Saúde' }, { emoji: '🛡', nome: 'Segurança' },
    { emoji: '🎓', nome: 'Educação' }, { emoji: '🚌', nome: 'Transporte' }, { emoji: '🚛', nome: 'Limpeza' },
    { emoji: '🎯', nome: 'Metas' }, { emoji: '📊', nome: 'Números' }, { emoji: '📍', nome: 'Lugar' },
  ];
  const emojiValido = (e) => GC.EMOJIS_VISTA.some((x) => x.emoji === e);
  const emojiOu = (e) => (emojiValido(e) ? e : '⭐');

  // armazenamento: { ler() → objeto | null, gravar(objeto) }. Falhas de leitura/gravação não quebram nada.
  // opcoes.prontas: ids das visualizações prontas que este perfil pode escolher (sem: todas).
  GC.criarVistas = function (armazenamento, opcoes = {}) {
    // Na ordem pedida: a primeira é a padrão do perfil.
    const prontas = Array.isArray(opcoes.prontas)
      ? opcoes.prontas.map((id) => GC.VISTAS_PRONTAS.find((v) => v.id === id)).filter(Boolean) : GC.VISTAS_PRONTAS;
    let salvas = [];
    let atualId = 'cidade';
    let seq = 0;
    try {
      const lido = armazenamento && armazenamento.ler();
      if (lido && Array.isArray(lido.salvas)) {
        salvas = lido.salvas
          .filter((v) => v && typeof v.id === 'string' && typeof v.nome === 'string' && v.nome.trim())
          .map((v) => Object.assign({ id: v.id, nome: v.nome.trim().slice(0, 40), emoji: emojiOu(v.emoji) }, GC.normalizarEstado(v)));
      }
      if (lido && typeof lido.atual === 'string') atualId = lido.atual;
    } catch (e) { /* armazenamento ilegível: começa do zero */ }

    const todas = () => [...prontas, ...salvas];
    const buscar = (id) => todas().find((v) => v.id === id) || null;
    if (!buscar(atualId)) atualId = (todas()[0] || { id: 'cidade' }).id;

    function gravar() {
      try { if (armazenamento) armazenamento.gravar({ salvas, atual: atualId }); } catch (e) { /* sem armazenamento */ }
    }
    const nomeValido = (nome) => (typeof nome === 'string' ? nome.trim().slice(0, 40) : '');
    const estadoDe = (v) => GC.normalizarEstado(v);

    return {
      lista: todas,
      buscar,
      atual: () => buscar(atualId),
      // Devolve o estado (filtros + widgets) da visualização escolhida.
      selecionar(id) {
        const v = buscar(id);
        if (!v) return null;
        atualId = id;
        gravar();
        return estadoDe(v);
      },
      // O estado atual é diferente do que a visualização escolhida guarda?
      alterada: (estado) => !GC.estadosIguais(buscar(atualId), estado),
      salvarComo(nome, estado) {
        const n = nomeValido(nome);
        if (!n) return null;
        const v = Object.assign({ id: `v-${Date.now().toString(36)}-${++seq}`, nome: n, emoji: '⭐' }, estadoDe(estado));
        salvas.push(v);
        atualId = v.id;
        gravar();
        return v;
      },
      // Atualiza filtros, widgets e camadas. O enquadramento guardado continua, a não ser que o estado traga
      // um (ou null, para voltar à cidade inteira).
      sobrescrever(id, estado) {
        const i = salvas.findIndex((v) => v.id === id);
        if (i < 0) return false;
        const m = (estado && estado.mapa) || {};
        const enq = 'enquadramento' in m ? m.enquadramento : (salvas[i].mapa || {}).enquadramento;
        salvas[i] = Object.assign({}, salvas[i], estadoDe(Object.assign({}, estado, { mapa: Object.assign({}, m, { enquadramento: enq }) })));
        gravar();
        return true;
      },
      // Guarda o zoom e a posição do mapa numa visualização salva (null tira: volta à cidade inteira).
      guardarEnquadramento(id, enquadramento) {
        const v = salvas.find((x) => x.id === id);
        if (!v) return false;
        v.mapa = GC.normalizarMapa(Object.assign({}, v.mapa, { enquadramento }));
        gravar();
        return true;
      },
      renomear(id, nome) {
        const n = nomeValido(nome);
        const v = salvas.find((x) => x.id === id);
        if (!v || !n) return false;
        v.nome = n;
        gravar();
        return true;
      },
      // Troca o ícone de uma salva (só os de GC.EMOJIS_VISTA).
      trocarEmoji(id, emoji) {
        const v = salvas.find((x) => x.id === id);
        if (!v || !emojiValido(emoji)) return false;
        v.emoji = emoji;
        gravar();
        return true;
      },
      // Cópia editável (também das prontas). Não troca a visualização em uso.
      duplicar(id) {
        const v = buscar(id);
        if (!v) return null;
        const nome = `${v.nome} (cópia)`.slice(0, 40);
        const copia = Object.assign({ id: `v-${Date.now().toString(36)}-${++seq}`, nome, emoji: emojiOu(v.emoji) }, estadoDe(v));
        const i = salvas.findIndex((x) => x.id === id);
        salvas.splice(i < 0 ? salvas.length : i + 1, 0, copia);
        gravar();
        return copia;
      },
      // Sobe (-1) ou desce (+1) uma visualização salva na lista.
      mover(id, delta) {
        const i = salvas.findIndex((v) => v.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= salvas.length) return false;
        [salvas[i], salvas[j]] = [salvas[j], salvas[i]];
        gravar();
        return true;
      },
      remover(id) {
        const antes = salvas.length;
        salvas = salvas.filter((v) => v.id !== id);
        if (salvas.length === antes) return false;
        if (atualId === id) atualId = (prontas[0] || { id: 'cidade' }).id;
        gravar();
        return true;
      },
      // Devolve uma salva removida (o "Desfazer" da gaveta) na posição em que estava. Não troca a em uso.
      restaurar(v, posicao) {
        if (!v || typeof v.id !== 'string' || !nomeValido(v.nome) || buscar(v.id)) return false;
        const i = Number.isInteger(posicao) ? Math.max(0, Math.min(posicao, salvas.length)) : salvas.length;
        salvas.splice(i, 0, Object.assign({ id: v.id, nome: nomeValido(v.nome), emoji: emojiOu(v.emoji) }, estadoDe(v)));
        gravar();
        return true;
      },
    };
  };
})(window.GC = window.GC || {});
