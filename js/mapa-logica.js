(function (GC) {
  // Regras do mapa que não dependem da biblioteca (MapLibre, em js/map.js): GeoJSON, HTML de pinos,
  // popups e legenda, margens, escala de zoom e tema do fundo. Tudo puro e testável em Node.
  const ML = {};
  ML.SEVERIDADES = ['critica', 'alta', 'media'];

  // ---- Ocorrências ----

  // O que, ao mudar, exige redesenhar o pino (ícone, grupo, pulsar).
  ML.assinatura = (o) => `${o.status}|${o.severidade}|${o.acaoPrefeito || ''}|${GC.tratada(o)}|${GC.estourada(o)}`;
  // Pino pulsa: prazo estourado sem ação do prefeito.
  ML.pulsa = (o) => GC.estourada(o) && !GC.tratada(o); // cobrança vencida volta a pulsar

  // ---- HTML dos pinos e popups (o mesmo nos dois motores: paridade visual garantida) ----

  const SEV_NOME = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  // Sem selo no pino (poluía o mapa): "em campo" é o contorno azul; o detalhe fica no popup.
  const BADGE = {};
  ML.ZOOM_NOMES_RUA = 14; // escala MapLibre: só aparecem com o mapa aproximado
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  // Idade em texto curto (recebe minutos já arredondados).
  ML.tempo = function (min) {
    if (min < 60) return `${min} min`;
    if (min < 2880) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  };
  const idade = (o) => ML.tempo(Math.round(GC.idadeMin(o)));

  // Pino: emoji da área na cor da gravidade; contorno azul em campo; pulsa com prazo estourado.
  ML.htmlPino = function (o, { novo } = {}) {
    const classes = ['marcador', o.severidade, o.status];
    if (ML.pulsa(o)) classes.push('pulsar');
    if (novo) classes.push('surgir');
    const badge = BADGE[o.status] ? `<span class="status-badge">${BADGE[o.status]}</span>` : '';
    return `<div class="${classes.join(' ')}">${area(o.area).emoji}${badge}</div>`;
  };

  // Grupo de pinos próximos (de qualquer gravidade), na cor da pior; pulsa se esconder um prazo estourado.
  // Com a contagem por gravidade, ganha um anel com a proporção de cada uma e um nome acessível.
  ML.NIVEL = { critica: 3, alta: 2, media: 1 };
  ML.sevDoNivel = (n) => (n >= 3 ? 'critica' : n >= 2 ? 'alta' : 'media');
  const COR_SEV = { critica: '#dc2626', alta: '#c2410c', media: '#eab308' };
  ML.anelGrupo = function (contagem) {
    const total = ML.SEVERIDADES.reduce((s, k) => s + (contagem[k] || 0), 0) || 1;
    let ate = 0;
    const paradas = ML.SEVERIDADES.filter((k) => contagem[k]).map((k) => {
      const de = ate;
      ate += (contagem[k] / total) * 360;
      return `${COR_SEV[k]} ${Math.round(de)}deg ${Math.round(ate)}deg`;
    });
    return `conic-gradient(${paradas.join(', ')})`;
  };
  ML.rotuloGrupo = function (n, contagem) {
    const partes = ML.SEVERIDADES.filter((k) => contagem && contagem[k])
      .map((k) => `${contagem[k]} ${SEV_NOME[k].toLowerCase()}${contagem[k] > 1 ? 's' : ''}`);
    return `${n} ocorrências próximas${partes.length ? `: ${partes.join(', ')}` : ''}. Clique para aproximar.`;
  };
  ML.htmlGrupo = function (severidade, n, pulsar, contagem) {
    if (!contagem) return `<div class="grupo-pinos ${severidade}${pulsar ? ' pulsar' : ''}"><span>${n}</span></div>`;
    const rotulo = ML.rotuloGrupo(n, contagem);
    return `<div class="grupo-pinos ${severidade}${pulsar ? ' pulsar' : ''}${n >= 10 ? ' grande' : ''}" role="button" tabindex="0" aria-label="${rotulo}" title="${rotulo}" style="background:${ML.anelGrupo(contagem)}"><span class="${severidade}">${n}</span></div>`;
  };

  // Nome acessível do pino (leitor de tela): gravidade, título, bairro e situação.
  ML.rotuloPino = (o) => `${SEV_NOME[o.severidade]}: ${o.titulo} · ${bairro(o.bairroId).nome} · ${GC.situacao(o)}`;

  // Resumo ao passar o mouse (e ao realçar pelo cartão): o ponto se explica sem clicar.
  // Três níveis sem repetição: resumo (o quê e onde) → popup (situação, ações rápidas) → gaveta (o porquê).
  ML.htmlResumo = (o) => `<span class="resumo-sev ${o.severidade}">${SEV_NOME[o.severidade]}</span><b>${area(o.area).emoji} ${esc(o.titulo)}</b>${esc(bairro(o.bairroId).nome)} · há ${idade(o)}<br><u>clique para ver</u>`;

  // Miolo do popup (o motor embrulha em div.popup e liga os botões data-acao).
  ML.htmlPopup = (o) => `
        <span class="sev ${o.severidade}">${SEV_NOME[o.severidade]}</span>
        <h3>${area(o.area).emoji} ${esc(o.titulo)}</h3>
        <div class="linha">📍 ${esc(bairro(o.bairroId).nome)} · há ${idade(o)}</div>
        ${o.afetados ? `<div class="linha">👥 ~${o.afetados.toLocaleString('pt-BR')} pessoas afetadas</div>` : ''}
        <div class="fonte">Fonte: ${esc(o.fonte)}</div>
        <div class="linha situacao${ML.pulsa(o) ? ' estourada' : ''}">${esc(GC.situacao(o))}</div>
        <div class="linha responsavel">👤 ${esc(o.responsavel)}</div>
        <div class="popup-acoes">${GC.botoesAcao(o)}</div>`;

  // Pinos especiais: conquista (⭐, camada ligável) e resolvida (✅, temporária).
  ML.HTML_CONQUISTA = '<div class="marcador conquista surgir">⭐</div>';
  ML.HTML_RESOLVIDA = '<div class="marcador resolvida surgir">✅</div>';

  ML.htmlPopupConquista = (c) => `<div class="popup"><span class="sev" style="background:#15803d">Conquista</span>
        <h3>${area(c.area).emoji} ${esc(c.titulo)}</h3>
        <div class="linha">📍 ${esc(bairro(c.bairroId).nome)} · ${esc(c.data.split('-').reverse().join('/'))}</div>
        <div class="linha">${esc(c.descricao)}</div></div>`;

  ML.htmlPopupResolvida = function (r) {
    const situacao = r.atrasoMin ? `⏰ ${ML.tempo(r.atrasoMin)} atrasada` : 'no prazo';
    return `<div class="popup"><span class="sev" style="background:#15803d">Resolvida</span>
        <h3>${area(r.area).emoji} ${esc(r.titulo)}</h3>
        <div class="linha">📍 ${esc(bairro(r.bairroId).nome)} · resolvida ${r.haMin < 1 ? 'agora' : `há ${ML.tempo(r.haMin)}`} · ${situacao}</div></div>`;
  };

  // Cores do mapa de calor (posição 0–1 → cor), as mesmas nos dois motores e na barra da legenda.
  // Uma família só (âmbar → vinho): lê-se como "mais quente = pior" sem o arco-íris de radar de TV.
  ML.GRADIENTE_CALOR = { 0.2: '#fcd34d', 0.45: '#f59e0b', 0.7: '#c2410c', 1: '#b91c1c' };
  ML.CALOR_TRANSPARENTE = 'rgba(252, 211, 77, 0)';
  // Paradas [posição, cor] em ordem crescente. Não confiar na ordem das chaves: o JS põe '1' (cara de
  // inteiro) antes de '0.2', e o MapLibre exige paradas crescentes.
  ML.paradasCalor = () => Object.entries(ML.GRADIENTE_CALOR).map(([pos, cor]) => [Number(pos), cor]).sort((a, b) => a[0] - b[0]);
  // A barra das legendas sai das mesmas paradas do mapa: não há um segundo gradiente no CSS para divergir.
  ML.gradienteCalorCss = () => `linear-gradient(90deg, ${ML.paradasCalor().map(([pos, cor]) => `${cor} ${Math.round(pos * 100)}%`).join(', ')})`;
  ML.htmlBarraCalor = () => `<div class="barra-calor" style="background: ${ML.gradienteCalorCss()}" role="img" aria-label="Escala do calor: amarelo é menos, vinho é mais"></div><div class="barra-calor-escala" aria-hidden="true"><span>menos</span><span>mais</span></div>`;

  // Cores das camadas que a legenda fixa também explica (o motor pinta com as mesmas).
  ML.COR_DESTAQUE = '#6d28d9'; // bairros destacados pela IA
  ML.COR_RISCO = { alto: '#dc2626', medio: '#eab308', baixo: '#5b6b70' };

  // ---- "Só o que pede atenção" (painel Camadas) ----
  // Com duas ou mais camadas ligadas, os pinos em dia somem e ficam os que pedem atenção. Por tipo de pino:
  // as situações em dia (somem) e as que pedem atenção (ficam). O tests/mapa-atencao.test.js confere que toda
  // situação dos resumos dos domínios está numa das duas listas: situação nova precisa entrar aqui.
  // Ficam sempre: ocorrências, B.O.s (calor), conquistas e orçamento (dado de contexto, sem "em dia").
  // critica: a parte de atencao que é vermelha (o selo por bairro pinta pela pior).
  const SIT3 = () => ({ emDia: ['ok'], atencao: ['critica', 'atencao'], critica: ['critica'] });
  ML.SITUACOES_PINO = {
    leitos: SIT3(),
    escolas: SIT3(),
    obras: { emDia: ['em_dia', 'concluida'], atencao: ['paralisada', 'atrasada'], critica: ['paralisada', 'atrasada'] },
    frota: SIT3(), // garagens e bases do SAMU
    linhas: SIT3(), // linhas de ônibus (desenhadas)
    coleta: { emDia: ['agendada', 'concluida', 'sem_coleta_hoje'], atencao: ['atrasada', 'em_andamento'], critica: ['atrasada'] }, // rotas e caminhões (desenhadas)
    farmacias: SIT3(),
    transito: SIT3(),
    eventos: { emDia: ['ok', 'realizado'], atencao: ['critica', 'atencao'], critica: ['critica'] }, // pino e perímetro
    predios: SIT3(),
    ocupacoes: SIT3(),
    reurb: { emDia: ['em_dia', 'ok'], atencao: ['critica'], critica: ['critica'] },
    vigilancia: SIT3(), // pela classe do ponto
    economia: SIT3(), // bairros e alvarás (no mapa, só os atrasados)
    risco: { emDia: ['baixo'], atencao: ['alto', 'medio'], critica: ['alto'] }, // áreas (desenhadas)
  };
  ML.emDia = (tipo, situacao) => !!ML.SITUACOES_PINO[tipo] && ML.SITUACOES_PINO[tipo].emDia.includes(situacao);
  // Nível do pino: 'critica' | 'atencao' | 'ok'; tipo sem regra é 'neutro' (orçamento, conquistas).
  ML.nivelPino = (tipo, situacao) => {
    const s = ML.SITUACOES_PINO[tipo];
    if (!s) return 'neutro';
    if (s.emDia.includes(situacao)) return 'ok';
    return s.critica.includes(situacao) ? 'critica' : 'atencao';
  };
  // Marca o elemento do pino: o CSS (css/mapa-atencao.css) esconde o em dia quando o modo está ligado e o
  // selo por bairro (js/mapa/varias-camadas.js) lê o nível.
  ML.marcarEmDia = (el, tipo, situacao) => {
    el.classList.toggle('pino-em-dia', ML.emDia(tipo, situacao));
    el.dataset.nivel = ML.nivelPino(tipo, situacao);
    return el;
  };
  // Filtro do MapLibre para o que é desenhado (linhas, áreas): só o que pede atenção; null = tudo.
  ML.filtroAtencao = (tipo, prop, ligado) => (ligado ? ['!', ['in', ['get', prop], ['literal', ML.SITUACOES_PINO[tipo].emDia]]] : null);
  // camadas: o objeto da legenda (o legenda() de cada camada, mais conquistas e camada da IA).
  // A camada da IA não conta: ela é a resposta de uma pergunta, não uma camada ligada.
  const FORA_DA_CONTA = ['destaqueIA', 'calorIA', 'soAtencao'];
  ML.camadasLigadas = (camadas = {}) => Object.keys(camadas).filter((k) => camadas[k] === true && !FORA_DA_CONTA.includes(k)).length;
  ML.MIN_CAMADAS_ATENCAO = 2;
  ML.soAtencaoAtivo = (camadas, preferencia) => !!preferencia && ML.camadasLigadas(camadas) >= ML.MIN_CAMADAS_ATENCAO;

  // ---- Várias camadas ao mesmo tempo (js/mapa/varias-camadas.js, painel Camadas e legenda) ----
  // Nome da camada (o de CAMADAS em js/app/camadas.js) a partir do nome da função registrada em GC.camadasMapa.
  const MODULO_CAMADA = { educacao: 'escolas', medicamentos: 'farmacias', seguranca: 'calor-bo' };
  ML.nomeCamada = (modulo) => MODULO_CAMADA[modulo] || modulo;
  // Chave da legenda (o legenda() de cada camada) → nome da camada.
  ML.camadaDaLegenda = (chave) => (chave === 'calorBO' ? 'calor-bo' : chave);
  ML.EMOJI_CAMADA = {
    leitos: '🏥', escolas: '🎓', obras: '🏗', frota: '🚌', coleta: '🚛', farmacias: '💊', transito: '🚦', eventos: '🎉',
    predios: '🔧', habitacao: '🏠', vigilancia: '🦟', economia: '📈', orcamento: '💰', risco: '⚠', 'calor-bo': '🔥', conquistas: '⭐',
  };
  // Grupos do painel Camadas, cada um com "Ligar o grupo". O tests/mapa-camadas.test.js confere que toda
  // camada do painel está em um grupo só.
  ML.GRUPOS_CAMADAS = [
    { id: 'saude', nome: 'Saúde', camadas: ['leitos', 'farmacias', 'vigilancia'] },
    { id: 'chuva', nome: 'Chuva e moradia', camadas: ['risco', 'habitacao'] },
    { id: 'mobilidade', nome: 'Mobilidade e segurança', camadas: ['frota', 'transito', 'calor-bo'] },
    { id: 'cidade', nome: 'Serviços e obras', camadas: ['coleta', 'obras', 'predios', 'escolas'] },
    { id: 'gestao', nome: 'Economia e gestão', camadas: ['economia', 'orcamento', 'eventos', 'conquistas'] },
  ];
  // Menos detalhe: com 3 ou mais camadas, linhas mais finas e números nos pinos só com o mapa aproximado.
  ML.MIN_CAMADAS_DETALHE = 3;
  ML.FATOR_LINHA_REDUZIDA = 0.6;
  ML.OPACIDADE_ESMAECIDA = 0.2;
  // Zoom relativo ao da cidade inteira (o enquadramento inicial muda com a tela).
  ML.ZOOM_AGRUPAR_CAMADAS = 0.6; // abaixo de cidade + 0,6: selo por bairro
  ML.ZOOM_NUMEROS_CAMADAS = 1.3; // abaixo de cidade + 1,3, com 3 ou mais camadas: pino sem número
  ML.MIN_PINOS_AGRUPAR = 12; // com poucos pinos, agrupar só atrapalha
  ML.RAIO_SOBREPOSTOS_PX = 22;
  ML.agruparCamadasAtivo = ({ camadas, zoom, zoomCidade, pinos }) => ML.camadasLigadas(camadas) >= 2
    && zoom < zoomCidade + ML.ZOOM_AGRUPAR_CAMADAS && pinos >= ML.MIN_PINOS_AGRUPAR;

  // Selo por bairro: cada pino { camada, lat, lng, nivel } vai para o bairro de centro mais próximo.
  // Devolve [{ bairroId, nome, lat, lng, total, pior, camadas: [{ camada, n }] }], do pior para o melhor.
  const PESO_NIVEL = { critica: 0, atencao: 1, neutro: 2, ok: 3 };
  ML.agruparPorBairro = (pinos, bairros = GC.data.bairros) => {
    const grupos = new Map();
    pinos.forEach((p) => {
      let melhor = null;
      let dist = Infinity;
      bairros.forEach((b) => {
        const d = (b.centro[0] - p.lat) ** 2 + (b.centro[1] - p.lng) ** 2;
        if (d < dist) { dist = d; melhor = b; }
      });
      if (!melhor) return;
      if (!grupos.has(melhor.id)) grupos.set(melhor.id, { bairroId: melhor.id, nome: melhor.nome, lat: melhor.centro[0], lng: melhor.centro[1], total: 0, pior: 'ok', porCamada: {} });
      const g = grupos.get(melhor.id);
      g.total += 1;
      g.porCamada[p.camada] = (g.porCamada[p.camada] || 0) + 1;
      const nivel = p.nivel in PESO_NIVEL ? p.nivel : 'neutro';
      if (PESO_NIVEL[nivel] < PESO_NIVEL[g.pior]) g.pior = nivel;
    });
    return [...grupos.values()].map(({ porCamada, ...g }) => ({ ...g, camadas: Object.entries(porCamada).map(([camada, n]) => ({ camada, n })) }))
      .sort((a, z) => PESO_NIVEL[a.pior] - PESO_NIVEL[z.pior] || z.total - a.total);
  };
  ML.htmlSeloBairro = (g) => `<div class="selo-camadas ${g.pior}"><span class="selo-camadas-emojis" aria-hidden="true">${g.camadas.map((c) => `<i>${ML.EMOJI_CAMADA[c.camada] || '•'}${c.n > 1 ? `<small>${c.n}</small>` : ''}</i>`).join('')}</span></div>`;
  ML.tituloSeloBairro = (g) => `${g.nome}: ${g.total === 1 ? '1 ponto' : `${g.total} pontos`} nas camadas ligadas${g.pior === 'critica' ? ', com algo crítico' : g.pior === 'atencao' ? ', com algo pedindo atenção' : ''}. Clique para aproximar.`;

  // Pinos sobrepostos: os que estão a até raio px do clicado (posições já na tela, { x, y }).
  ML.sobrepostos = (alvo, pontos, raio = ML.RAIO_SOBREPOSTOS_PX) => pontos.filter((p) => Math.hypot(p.x - alvo.x, p.y - alvo.y) <= raio);

  // Legenda da camada da IA (o ✕ tira a camada; o motor liga o clique).
  ML.htmlLegenda = (texto, calor, grupos) => `<button type="button" class="legenda-fechar" title="Tirar esta camada do mapa" aria-label="Tirar esta camada do mapa">✕</button><strong>✨ ${esc(texto)}</strong>${calor ? ML.htmlBarraCalor() : ''}${grupos ? ML.htmlGrupos(grupos) : ''}`;

  // Bairros pintados por grupo (cruzamento de dados, js/cruzamento.js): 4 cores fixas, as mesmas da tela
  // (css/cruzamento.css). A cor sempre vem com a palavra na legenda.
  ML.GRUPOS = [
    { id: 'ambos', ordem: 1, cor: '#dc2626', rotulo: 'Ruim nos dois' },
    { id: 'soA', ordem: 2, cor: '#2b98b0', rotulo: 'Ruim só no 1º' },
    { id: 'soB', ordem: 3, cor: '#b46a00', rotulo: 'Ruim só no 2º' },
    { id: 'nenhum', ordem: 4, cor: '#a9c9b6', rotulo: 'Bem nos dois' },
  ];
  // { bairroId: grupo } → número do grupo por bairro (feature-state "grupo"); grupo desconhecido fica de fora.
  ML.ordemDosGrupos = (grupos) => Object.fromEntries(Object.entries(grupos || {})
    .map(([id, g]) => [id, (ML.GRUPOS.find((x) => x.id === g) || {}).ordem]).filter(([, n]) => n));
  // Legenda: os grupos com bairro, cada um com a cor, o rótulo (o do 1º e 2º indicador, se vier) e quantos são.
  ML.htmlGrupos = ({ grupos, rotulos = {} }) => {
    const conta = (g) => Object.values(grupos || {}).filter((x) => x === g).length;
    const itens = ML.GRUPOS.filter((g) => conta(g.id)).map((g) => `<li><i style="background:${g.cor}"></i>${esc(rotulos[g.id] || g.rotulo)} <small>${conta(g.id)}</small></li>`);
    return itens.length ? `<ul class="legenda-grupos">${itens.join('')}</ul>` : '';
  };

  // ---- Margens: formato neutro { top, right, bottom, left } em px ----

  ML.margensUniformes = (n) => ({ top: n, right: n, bottom: n, left: n });
  ML.margensMapLibre = (m) => ({ top: m.top, right: m.right, bottom: m.bottom, left: m.left });

  // ---- Zoom ----
  // O contrato da IA (mapa.foco.zoom) fala na escala web clássica, de ladrilhos de 256 px (a do OSM e do
  // Google, e a que o roteiro usa). O MapLibre usa ladrilhos de 512 px: o mesmo enquadramento é um nível
  // a menos nele.
  ML.zoomMapLibre = (zoomWeb) => zoomWeb - 1;

  // Limite de zoom out: um pouco além do enquadramento da cidade inteira (a entrada animada parte de 1,4
  // nível acima dele, e precisa caber). Mais longe que isso a cidade vira um ponto no meio do nada.
  ML.FOLGA_ZOOM_OUT = 1.5;
  ML.zoomMinimo = (zoomCidade) => Math.max(0, zoomCidade - ML.FOLGA_ZOOM_OUT);

  // ---- GeoJSON (coordenadas [lng, lat]; os dados guardam [lat, lng]) ----

  const ponto = (lat, lng, properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lng, lat] } });
  const colecao = (features) => ({ type: 'FeatureCollection', features });

  // Retângulo que envolve todos os bairros: [[oeste, sul], [leste, norte]].
  ML.limites = function (bairros) {
    const pts = bairros.flatMap((b) => b.poligono);
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  };

  // Polígonos dos bairros (anel fechado) com a contagem de ocorrências, para pintar e extrudar.
  ML.geoBairros = (bairros, contagem = {}) => colecao(bairros.map((b) => ({
    type: 'Feature',
    properties: { id: b.id, nome: b.nome, n: contagem[b.id] || 0 },
    geometry: { type: 'Polygon', coordinates: [[...b.poligono, b.poligono[0]].map(([lat, lng]) => [lng, lat])] },
  })));

  ML.geoRotulos = (bairros) => colecao(bairros.map((b) => ponto(b.centro[0], b.centro[1], { id: b.id, nome: b.nome, populacao: b.populacao || 0 })));

  // Ocorrências de uma gravidade (os grupos de pinos não misturam gravidades).
  ML.geoOcorrencias = (lista, severidade) => colecao(lista
    .filter((o) => o.severidade === severidade)
    .map((o) => ponto(o.lat, o.lng, { id: o.id, pulsa: ML.pulsa(o) ? 1 : 0 })));
  // Todas as ocorrências numa fonte só: pinos próximos se agrupam mesmo com gravidades diferentes.
  // Cada ponto leva o nível (3 crítica … 1 média) e um contador por gravidade para o anel do grupo.
  ML.geoTodas = (lista) => colecao(lista.map((o) => ponto(o.lat, o.lng, {
    id: o.id, pulsa: ML.pulsa(o) ? 1 : 0, nivel: ML.NIVEL[o.severidade] || 1,
    critica: o.severidade === 'critica' ? 1 : 0, alta: o.severidade === 'alta' ? 1 : 0, media: o.severidade === 'media' ? 1 : 0,
  })));

  ML.geoCalor = (pontos) => colecao(pontos.map((p) => ponto(p.lat, p.lng, { peso: p.peso })));

  // Retângulo de um bairro só (para enquadrá-lo).
  ML.limitesBairro = (bairro) => ML.limites([bairro]);

  // Contorno de cada bairro: destaque da IA (roxo) > selecionado (contínuo, grosso) > normal (tracejado).
  // Devolve um filtro por camada de linha: o tracejado não pode variar por feição, então são três camadas,
  // e filtros não enxergam feature-state, então vão pelo id. Cada bairro cai em exatamente uma.
  // selecionado: id, lista de ids (filtro com vários bairros) ou nada.
  ML.filtrosContorno = function (selecionado, destacados = []) {
    const em = (ids) => ['in', ['get', 'id'], ['literal', ids]];
    const selecionados = Array.isArray(selecionado) ? selecionado : selecionado ? [selecionado] : [];
    const sel = selecionados.filter((id) => !destacados.includes(id));
    return { normal: ['!', em([...destacados, ...sel])], selecionado: em(sel), destaque: em([...destacados]) };
  };

  ML.contagemPorBairro =(lista) => lista.reduce((n, o) => { n[o.bairroId] = (n[o.bairroId] || 0) + 1; return n; }, {});

  // Bairros que respiram em vermelho: têm ocorrência com prazo estourado e sem ação (a mesma regra do
  // pino que pulsava, ML.pulsa). É o único pulso contínuo do mapa (movimento.md).
  ML.bairrosEmAlerta = (lista) => [...new Set(lista.filter((o) => !o.historico && o.bairroId && ML.pulsa(o)).map((o) => o.bairroId))];

  // Perspectiva só de perto: a cidade inteira é vista de cima (pitch 0). Inclina ao olhar de perto:
  // um bairro escolhido, um voo até um ponto (pino de camada, conquista) e o detalhe de uma ocorrência.
  ML.PITCH_BAIRRO = 40;
  ML.PITCH_PERTO = 50;
  // Com o mapa inclinado a cidade "deita" e encolhe na tela: um pouco mais de zoom compensa.
  ML.ZOOM_PERSPECTIVA = 0.35;

  // Câmera ao abrir o detalhe de uma ocorrência: inclina mais que o repouso; a crítica inclina mais ainda
  // e gira de -12° a +12°, sempre o mesmo giro para a mesma ocorrência. null = só desliza (menos movimento,
  // telão, que tem câmera própria, ou histórico da linha do tempo).
  ML.cameraCinematica = function (o, { poucoMovimento = false, telao = false } = {}) {
    if (!o || o.historico || poucoMovimento || telao) return null;
    if (o.severidade !== 'critica') return { pitch: 52, bearing: 0, duracao: 900 };
    const hash = [...String(o.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    return { pitch: 58, bearing: (hash % 25) - 12, duracao: 1100 };
  };

  // Luz do mapa pela hora do dia (0 a 23,99): um véu de cor por cima do mapa, abaixo dos pinos.
  // Manhã dourada e fraca, meio-dia sem véu, fim de tarde âmbar, noite azul-escura. mistura: modo do CSS.
  ML.luzDoDia = function (hora) {
    const h = ((Number(hora) % 24) + 24) % 24;
    if (h >= 5 && h < 8) return { fase: 'amanhecer', cor: '#ffb36b', opacidade: 0.12, mistura: 'soft-light' };
    if (h >= 8 && h < 16) return { fase: 'dia', cor: '#ffffff', opacidade: 0, mistura: 'normal' };
    if (h >= 16 && h < 18.5) return { fase: 'tarde', cor: '#f59e3b', opacidade: 0.14, mistura: 'soft-light' };
    // Fim do dia e noite só tingem (soft-light, bem leve): em multiply o azul-marinho deixava o mapa claro cinza.
    // Quem quer o mapa escuro tem o tema escuro.
    if (h >= 18.5 && h < 20) return { fase: 'anoitecer', cor: '#5b4b8a', opacidade: 0.08, mistura: 'soft-light' };
    return { fase: 'noite', cor: '#1b2a4a', opacidade: 0.07, mistura: 'soft-light' };
  };

  // Entrada do mapa: ordem em que os bairros se desenham, do centro para fora (pelo ponto do rótulo).
  ML.ordemEntradaBairros = function (bairros) {
    const pts = ML.geoRotulos(bairros).features.map((f) => ({ id: f.properties.id, c: f.geometry.coordinates }));
    if (!pts.length) return [];
    const cx = pts.reduce((s, p) => s + p.c[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.c[1], 0) / pts.length;
    return pts.map((p) => ({ id: p.id, d: Math.hypot(p.c[0] - cx, p.c[1] - cy) })).sort((a, b) => a.d - b.d).map((p) => p.id);
  };

  // ---- Limite da cidade e máscara do entorno ----
  // Os bairros são uma grade com vértices compartilhados: aresta que aparece uma vez só é borda da cidade.
  // Encadeia essas arestas num anel [lng, lat] fechado. Se a grade não fechar um anel (dados à mão),
  // devolve null e quem chama usa os bairros um a um.
  ML.contornoCidade = function (bairros) {
    const chave = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    const arestas = new Map(); // chave da aresta (sem direção) → [a, b]
    bairros.forEach((b) => b.poligono.forEach((p, i) => {
      const q = b.poligono[(i + 1) % b.poligono.length];
      const k = [chave(p), chave(q)].sort().join('|');
      if (arestas.has(k)) arestas.set(k, null); else arestas.set(k, [p, q]);
    }));
    const vizinhos = new Map(); // vértice → vértices ligados por aresta de borda
    const pontoDe = new Map();
    [...arestas.values()].filter(Boolean).forEach(([p, q]) => {
      [[p, q], [q, p]].forEach(([a, b]) => {
        pontoDe.set(chave(a), a);
        if (!vizinhos.has(chave(a))) vizinhos.set(chave(a), []);
        vizinhos.get(chave(a)).push(chave(b));
      });
    });
    if (!vizinhos.size || [...vizinhos.values()].some((v) => v.length !== 2)) return null;
    const inicio = vizinhos.keys().next().value;
    const anel = [inicio];
    let anterior = null;
    let atual = inicio;
    for (;;) {
      const prox = vizinhos.get(atual).find((v) => v !== anterior);
      if (prox === inicio) break;
      if (anel.includes(prox)) return null;
      anel.push(prox);
      anterior = atual;
      atual = prox;
    }
    if (anel.length !== vizinhos.size) return null; // mais de uma "ilha": não é um contorno só
    const pts = anel.map((k) => { const [lat, lng] = pontoDe.get(k); return [lng, lat]; });
    return [...pts, pts[0]];
  };

  const anelBairro = (b) => [...b.poligono, b.poligono[0]].map(([lat, lng]) => [lng, lat]);
  // Véu sobre o mundo com um furo na forma da cidade: o entorno apaga e a cidade "acende".
  ML.geoMascara = function (bairros) {
    const mundo = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const contorno = ML.contornoCidade(bairros);
    const furos = contorno ? [contorno] : bairros.map(anelBairro);
    return colecao([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [mundo, ...furos] } }]);
  };
  // Linha do limite da cidade.
  ML.geoLimite = function (bairros) {
    const contorno = ML.contornoCidade(bairros);
    const aneis = contorno ? [contorno] : bairros.map(anelBairro);
    return colecao(aneis.map((a) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: a } })));
  };

  // ---- Camadas extras: total e quantas pedem atenção (para o painel Camadas) ----
  ML.resumoCamadas = function () {
    const out = {};
    const conta = (lista, f) => lista.filter(f).length;
    if (GC.educacao) {
      const l = GC.educacao.resumo().escolas;
      out.escolas = { total: l.length, alerta: conta(l, (x) => x.situacao === 'critica'), rotulo: ['crítica', 'críticas'] };
    }
    if (GC.obras) {
      const l = GC.obras.resumo().obras;
      out.obras = { total: l.length, alerta: conta(l, (x) => x.situacao === 'atrasada' || x.situacao === 'paralisada'), rotulo: ['atrasada', 'atrasadas'] };
    }
    if (GC.risco) {
      const l = GC.risco.resumo().areas;
      out.risco = { total: l.length, alerta: conta(l, (x) => x.nivel === 'alto'), rotulo: ['em risco alto', 'em risco alto'] };
    }
    if (GC.seguranca) out.calorBo = { total: GC.seguranca.resumo().total30d, alerta: 0 };
    if (GC.leitos) {
      const l = GC.leitos.resumo().unidades;
      out.leitos = { total: l.length, alerta: conta(l, (x) => x.situacao === 'critica'), rotulo: ['lotada', 'lotadas'] };
    }
    if (GC.frota) {
      const l = GC.frota.resumo().linhas;
      out.frota = { total: l.length, alerta: conta(l, (x) => x.situacao === 'critica'), rotulo: ['linha crítica', 'linhas críticas'] };
    }
    if (GC.medicamentos) {
      const l = GC.medicamentos.resumo().farmacias;
      out.farmacias = { total: l.length, alerta: l.filter((x) => x.rupturas.length).length, rotulo: ['UBS com falta', 'UBS com falta'] };
    }
    if (GC.coleta) {
      const l = GC.coleta.resumo().rotas;
      out.coleta = { total: l.length, alerta: conta(l, (x) => x.status === 'atrasada'), rotulo: ['atrasada', 'atrasadas'] };
    }
    if (GC.data && GC.data.conquistas) out.conquistas = { total: GC.data.conquistas.length, alerta: 0 };
    // Domínios que contam por conta própria (js/data-<domínio>.js: contagemCamada() → { total, alerta, rotulo }).
    ['vigilancia', 'transito', 'habitacao', 'predios', 'economia', 'orcamento', 'eventos'].forEach((d) => {
      if (GC[d] && GC[d].contagemCamada) out[d] = GC[d].contagemCamada();
    });
    return out;
  };

  // ---- Tema "Vila Dourada" do fundo vetorial ----
  // Cidade fictícia: some com nomes de lugares reais (cidades, rios, lagos), POIs e placas; tons do app.
  // Nomes de rua ficam: ajudam a localizar e não denunciam a cidade. "poi" casa só como palavra
  // (senão pegaria "point" em water_name_point_label).
  // Recebe uma camada do estilo e devolve o ajuste ({ layout } e/ou { paint }) ou null.
  const ESCONDER = /(^|[-_])poi([-_]|$)|place|shield|water_name|label_(city|town|village|state|country|other)/;
  const RUA = /highway|road|street|transportation/;

  // Cores das camadas da própria Vila Dourada (bairros, nomes, véu do entorno, limite) em cada tema.
  ML.TEMAS = ['claro', 'escuro'];
  ML.CORES_TEMA = {
    claro: { bairro: '#0f4c5c', selecionado: '#0f4c5c', rotulo: '#0f4c5c', halo: '#ffffff',
      mascara: '#dae2e3', mascaraOpacidade: 0.72, limite: '#0f4c5c', alerta: '#dc2626',
      luz: '#ffffff', luzOpacidade: 0.7, sombra: '#0b1d22', elevadoOpacidade: 0.5, ceu: '#e6eef0', neblina: '#eef3f4' },
    escuro: { bairro: '#7ea3d1', selecionado: '#dde5e6', rotulo: '#dde5e6', halo: '#0b1d22',
      mascara: '#0b1d22', mascaraOpacidade: 0.38, limite: '#c6d3d5', alerta: '#f87171',
      luz: '#9fdadd', luzOpacidade: 0.12, sombra: '#000000', elevadoOpacidade: 0.1, ceu: '#12303a', neblina: '#173540' },
  };
  // Tons das ruas do fundo "Ruas" (ML.camadasRuas), por tema.
  ML.CORES_RUAS = { claro: '#8fa5a9', escuro: '#5b7790' };

  // A cidade sobre o fundo. Com ruas, o filete de luz dos bairros (decoração) some e a cor pela quantidade de
  // ocorrências fica mais clara (é dado, não some). Os estados de passagem (chegou, destaque, selecionado,
  // mouse) não mudam: precisam aparecer. O véu de fora da cidade e os contornos também não mudam.
  ML.DENSIDADE_BAIRRO_MAX = { liso: 0.15, ruas: 0.06 };
  const est = (chave) => ['boolean', ['feature-state', chave], false];
  ML.opacidadeBairro = (comRuas = false) => ['case', est('oculto'), 0, est('chegou'), 0.3, est('destaque'), 0.25, est('sel'), 0.16, est('hover'), 0.14,
    ['interpolate', ['linear'], ['get', 'n'], 0, comRuas ? 0.01 : 0.02, 6, ML.DENSIDADE_BAIRRO_MAX[comRuas ? 'ruas' : 'liso']]];
  ML.opacidadeLuzBairro = (tema = 'claro', comRuas = false) => ['case', est('oculto'), 0, comRuas ? 0 : ML.CORES_TEMA[tema === 'escuro' ? 'escuro' : 'claro'].luzOpacidade];

  // ---- Fundo "Ruas" ----
  // Só a geometria das ruas, sem nome nenhum: a cidade é fictícia sobre coordenadas reais, e nome de rua de
  // verdade embaixo de bairro inventado confunde. Rios e lagos reais também ficam de fora (o litoral e as áreas
  // de alagamento da cidade não batem com eles). Clara de longe, mais nítida ao aproximar, sempre por baixo da
  // máscara e dos bairros.
  ML.FONTE_RUAS = { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '&copy; OpenStreetMap' };
  ML.CLASSES_RUAS = {
    principais: ['motorway', 'trunk', 'primary'],
    medias: ['secondary', 'tertiary'],
    locais: ['minor', 'service'],
  };
  const ZOOM_LOCAIS = 13; // ruas de bairro só de perto (de longe viram uma mancha)
  ML.camadasRuas = function (tema = 'claro') {
    const cor = ML.CORES_RUAS[tema === 'escuro' ? 'escuro' : 'claro'];
    const opac = (de, ate) => ['interpolate', ['linear'], ['zoom'], 11, de, 16, ate];
    const larg = (de, ate) => ['interpolate', ['exponential', 1.5], ['zoom'], 11, de, 17, ate];
    const camada = (id, classes, largura, opacidade, minzoom) => Object.assign({
      id, type: 'line', source: 'ruas', 'source-layer': 'transportation',
      filter: ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': cor, 'line-width': largura, 'line-opacity': opacidade },
    }, minzoom ? { minzoom } : {});
    // De baixo para cima: as maiores por cima das menores.
    return [
      camada('ruas-locais', ML.CLASSES_RUAS.locais, larg(0.4, 3), opac(0.18, 0.4), ZOOM_LOCAIS),
      camada('ruas-medias', ML.CLASSES_RUAS.medias, larg(0.6, 5), opac(0.28, 0.5)),
      camada('ruas-principais', ML.CLASSES_RUAS.principais, larg(1, 7), opac(0.35, 0.55)),
    ];
  };

  // Tema "sala de situação": fundo azul-petróleo (no quase preto de antes o mapa sumia); o que não tem regra própria escurece pelo tipo.
  const ESCURO = { fundo: '#173540', agua: '#1a3550', verde: '#1b3a3f', rua: '#2a4458', predio: '#1d3345', outro: '#183040', texto: '#9fb0c4' };
  function ajusteEscuro({ id, type }) {
    if (type === 'background') return { paint: { 'background-color': ESCURO.fundo } };
    if (type === 'symbol' && ESCONDER.test(id)) return { layout: { visibility: 'none' } };
    if (type === 'symbol') {
      const cor = { 'text-color': ESCURO.texto, 'text-halo-color': ESCURO.fundo };
      return RUA.test(id) ? { paint: cor, minzoom: ML.ZOOM_NOMES_RUA } : { paint: cor };
    }
    if (type === 'fill' && /water/.test(id)) return { paint: { 'fill-color': ESCURO.agua } };
    if (type === 'fill' && /park|landcover|landuse|wood|grass/.test(id)) return { paint: { 'fill-color': ESCURO.verde, 'fill-opacity': 0.5 } };
    if (type === 'fill' && /building/.test(id)) return { paint: { 'fill-color': ESCURO.predio, 'fill-outline-color': ESCURO.rua } };
    if (type === 'fill') return { paint: { 'fill-color': ESCURO.outro } };
    if (type === 'line' && /water/.test(id)) return { paint: { 'line-color': ESCURO.agua } };
    if (type === 'line' && RUA.test(id)) return { paint: { 'line-color': ESCURO.rua } };
    if (type === 'line') return { paint: { 'line-color': ESCURO.outro } };
    return null;
  }

  ML.ajusteTema = function (camada, tema = 'claro') {
    if (tema === 'escuro') return ajusteEscuro(camada);
    const { id, type } = camada;
    if (type === 'background') return { paint: { 'background-color': '#edf2f2' } };
    if (type === 'fill' && /water/.test(id)) return { paint: { 'fill-color': '#cddcec' } };
    if (type === 'fill' && /park|landcover|landuse|wood|grass/.test(id)) return { paint: { 'fill-opacity': 0.3 } };
    if (type === 'symbol' && ESCONDER.test(id)) return { layout: { visibility: 'none' } };
    if (type === 'line' && /highway|road|street|transportation/.test(id)) return { paint: { 'line-color': '#ffffff' } };
    // Nomes de rua só ao aproximar: na cidade inteira eram ruído atrás dos pinos.
    if (type === 'symbol' && /highway|road|street|transportation/.test(id)) return { minzoom: ML.ZOOM_NOMES_RUA };
    return null;
  };

  GC.mapaLogica = ML;
})(window.GC = window.GC || {});
