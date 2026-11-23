(function (GC) {
  // Plural pelo número (tom-de-voz.md): "1 rota atrasada", "3 rotas atrasadas", nunca "rota(s)".
  const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  // Mapa da cidade, sobre MapLibre GL. O app só conhece GC.criarMapa e o objeto que ela devolve.
  // Regras puras (GeoJSON, HTML dos pinos e popups, tema, margens) ficam em js/mapa-logica.js.
  // Veio do Leaflet em 2026-11; números calibrados lado a lado com ele: veja
  // docs/specs/2026-11-05-vila-dourada-migracao-maplibre-plano.md.
  const ML = GC.mapaLogica;
  // Bairros: cores do tema (ML.CORES_TEMA); roxo no destaque da IA.
  const ROXO = ML.COR_DESTAQUE;
  const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
  // Cidade fictícia: por padrão, fundo liso (sem ruas e nomes reais embaixo dos bairros inventados).
  // ?mapa=real liga o mapa de ruas (útil só para conferir escala).
  const BASE_REAL = (() => { try { return new URLSearchParams(window.location.search).get('mapa') === 'real'; } catch (e) { return false; } })();
  // Reserva se o estilo base não carregar (provedor fora, sem internet, firewall): fundo liso no tom do
  // tema, e bairros, pinos e camadas funcionando por cima. As fontes dos
  // nomes dos bairros vêm do mesmo provedor: sem ele, o MapLibre desenha as letras com a fonte local
  // (avisa no console, uma linha por letra) e os nomes continuam aparecendo.
  const ESTILO_RESERVA = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf2f2' } }],
  };
  const ESPERA_ESTILO = 8000; // ms sem o estilo base: desiste dele
  // 17 dá folga para abrir grupos de pinos muito próximos.
  const ZOOM_MAX = 17;
  // Zoom de "Ver no mapa" (o 15 da escala web clássica).
  const ZOOM_FOCO = ML.zoomMapLibre(15);
  // Raio dos grupos. O MapLibre agrupa pelo zoom inteiro de baixo (a 12,66 usa o 12), então na tela o raio
  // vale de 1x a 2x isto. Uma fonte só, com todas as gravidades: pinos que se encostariam viram um círculo
  // com o total (na cor da pior gravidade e um anel com a proporção de cada uma).
  // Até ZOOM_MAX - 1 agrupa; no zoom máximo, tudo solto.
  // 56 (era 44): com 44, grupos vizinhos se encostavam no zoom da cidade inteira e cobriam o nome dos bairros.
  const RAIO_GRUPO = 56;
  const FONTE = 'ocorrencias';

  // MapLibre carregado e WebGL disponível (VDI e navegadores travados às vezes não têm).
  GC.mapaDisponivel = function () {
    if (typeof maplibregl === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  };

  // Tema "Vila Dourada" (claro ou escuro) sobre o estilo base (regras em GC.mapaLogica.ajusteTema).
  // Guarda o valor original de cada propriedade que mexe: trocar de tema devolve tudo antes de aplicar o
  // novo (o escuro pinta camadas que o claro deixa como vieram). Só mexe nas camadas do estilo base.
  function criarTema(mapa) {
    let base = []; // camadas do estilo base (as nossas ficam de fora)
    let originais = new Map(); // "id|paint|prop" → valor do estilo
    const pegar = (id, tipo, k) => (tipo === 'paint' ? mapa.getPaintProperty(id, k) : mapa.getLayoutProperty(id, k));
    const definir = (id, tipo, k, v) => (tipo === 'paint' ? mapa.setPaintProperty(id, k, v) : mapa.setLayoutProperty(id, k, v));
    return {
      // Estilo novo (o base ou a reserva): esquece o anterior.
      lerBase() {
        base = mapa.getStyle().layers.map((c) => Object.assign({}, c));
        originais = new Map();
      },
      aplicar(tema) {
        originais.forEach((v, chave) => {
          const [id, tipo, k] = chave.split('|');
          try { if (k === 'minzoom') mapa.setLayerZoomRange(id, v[0], v[1]); else definir(id, tipo, k, v); } catch (e) { /* camada sumiu */ }
        });
        base.forEach((camada) => {
          const ajuste = ML.ajusteTema(camada, tema);
          if (!ajuste) return;
          const mexer = (tipo, k, v) => {
            const chave = `${camada.id}|${tipo}|${k}`;
            try {
              if (!originais.has(chave)) originais.set(chave, pegar(camada.id, tipo, k));
              definir(camada.id, tipo, k, v);
            } catch (e) {
              // Camada sem essa propriedade: fica como veio do estilo.
            }
          };
          Object.entries(ajuste.layout || {}).forEach(([k, v]) => mexer('layout', k, v));
          Object.entries(ajuste.paint || {}).forEach(([k, v]) => mexer('paint', k, v));
          if (ajuste.minzoom !== undefined) {
            const chave = `${camada.id}|zoom|minzoom`;
            if (!originais.has(chave)) originais.set(chave, [camada.minzoom ?? 0, camada.maxzoom ?? 24]);
            try { mapa.setLayerZoomRange(camada.id, ajuste.minzoom, camada.maxzoom ?? 24); } catch (e) { /* idem */ }
          }
        });
      },
    };
  }

  // Tema escolhido (fica no navegador; sem acesso ao armazenamento, começa claro).
  const CHAVE_TEMA = 'vd-mapa-tema';
  const lerTemaSalvo = () => { try { return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro'; } catch (e) { return 'claro'; } };
  const salvarTema = (t) => { try { localStorage.setItem(CHAVE_TEMA, t); } catch (e) { /* sem armazenamento */ } };

  // Abre o popup do pino no fim de um voo. O pino pode ter saído do mapa no meio do caminho (camada desligada,
  // "Limpar todas"): aí não abre nada (o MapLibre quebrava ao abrir o popup de um marcador fora do mapa).
  const abrirPopupDoPino = (marker) => {
    const popup = marker && marker.getPopup();
    if (!marker._map || !popup || popup.isOpen()) return false;
    // "Só o que pede atenção" esconde o pino em dia, mas não o que se pediu para ver (widget, busca, IA).
    const el = marker.getElement();
    el.classList.add('pino-aberto');
    popup.once('close', () => el.classList.remove('pino-aberto'));
    marker.togglePopup();
    return true;
  };
  const elementoDe = (html, classe = 'marcador-wrap') => {
    const el = document.createElement('div');
    el.className = classe;
    el.innerHTML = html;
    return el;
  };

  GC.criarMapa = function (elemento, opcoes) {
    const { aoAgir, legenda, aoMudarCamada, aoMudarLegenda, aoSelecionarBairro, aoDetalhar, aoRolarSemCtrl, aoInfo, aoLinhaTempo, aoCidadeInteira, aoCarregar } = opcoes;
    const limites = ML.limites(GC.data.bairros);
    // Enquadramento que desconta os elementos flutuantes (GC.margensMapa, definido pelo app).
    const margens = (n) => ML.margensMapLibre(GC.margensMapa ? GC.margensMapa(n) : ML.margensUniformes(n));
    const ms = (segundos) => segundos * 1000; // a API do mapa fala em segundos
    // Camadas de domínio (js/mapa/camada-*.js, registradas em GC.camadasMapa): criadas mais abaixo, com o ctx.
    const camadas = [];
    // Todo pino de camada (criado por ctx.marcador, mais as conquistas): { marker, camada }. js/mapa/varias-camadas.js
    // lê daqui para destacar, agrupar por bairro e listar os sobrepostos.
    const pinosDeCamada = [];

    // ---- Perspectiva só de perto ----
    // A cidade inteira é vista de cima. Inclina quando se olha algo de perto: um bairro escolhido
    // (ML.PITCH_BAIRRO), um voo até um ponto (ML.PITCH_PERTO, no flyTo logo abaixo) e o detalhe de uma
    // ocorrência (ML.cameraCinematica). Voltar à cidade desinclina. O telão tem a câmera própria.
    const emTelao = () => document.body.classList.contains('telao-ativo');
    const pitchBase = () => (!emTelao() && selecionado.length ? ML.PITCH_BAIRRO : 0);
    const zoomExtra = () => (pitchBase() ? ML.ZOOM_PERSPECTIVA : 0); // inclinada, a área encolhe: compensa no zoom

    const mapa = new maplibregl.Map({
      container: elemento,
      style: BASE_REAL ? ESTILO : ESTILO_RESERVA,
      bounds: limites,
      fitBoundsOptions: { padding: margens(30) },
      maxZoom: ZOOM_MAX,
      // Quem usa não gira nem inclina com o mouse: a inclinação é só a do foco.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // A atribuição vai para o canto de baixo (CSS a põe sob o botão Legenda), sempre recolhida no ⓘ.
      attributionControl: false,
    });
    mapa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: `${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} (cidade fictícia)` }), 'bottom-left');
    mapa.touchZoomRotate.disableRotation();
    mapa.keyboard.disableRotation();
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // Sem escala gráfica: ao lado da legenda só poluía (o mapa é de uma cidade só e ninguém mede distância nele).

    // Voo até um ponto de perto (pino de camada, conquista, ocorrência) inclina a câmera, se quem chamou não
    // escolheu a inclinação. Vale para todas as camadas sem mexer nelas (todas voam com ZOOM_FOCO).
    const voarOriginal = mapa.flyTo.bind(mapa);
    mapa.flyTo = (opcoesVoo, dados) => {
      const perto = opcoesVoo && opcoesVoo.pitch === undefined && typeof opcoesVoo.zoom === 'number' && opcoesVoo.zoom >= ZOOM_FOCO - 0.05;
      return voarOriginal(perto && !emTelao() ? Object.assign({}, opcoesVoo, { pitch: ML.PITCH_PERTO }) : opcoesVoo, dados);
    };

    // ---- Tema claro / escuro ("sala de situação") ----
    const tema = criarTema(mapa);
    let temaAtual = lerTemaSalvo();
    let botaoTema = null;
    const marcarBotaoTema = () => {
      document.body.classList.toggle('mapa-escuro', temaAtual === 'escuro');
      // Titã noturno (paleta.md): o tema vale para a interface toda, não só para o mapa.
      GC.aplicarTemaInterface(temaAtual);
      if (!botaoTema) return;
      const escuro = temaAtual === 'escuro';
      botaoTema.innerHTML = `<i class="ti ti-${escuro ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
      botaoTema.title = escuro ? 'Tema claro' : 'Tema noturno (sala de crise, uso à noite)';
      botaoTema.setAttribute('aria-label', botaoTema.title);
      botaoTema.setAttribute('aria-pressed', String(escuro));
    };
    // Um grupo só de controles extras: ver a cidade inteira, linha do tempo e tema.
    const botaoCtrl = (classe, icone, titulo, acao) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = classe;
      b.title = titulo;
      b.setAttribute('aria-label', titulo);
      b.innerHTML = `<i class="ti ti-${icone}" aria-hidden="true"></i>`;
      b.onclick = acao;
      return b;
    };
    mapa.addControl({
      onAdd() {
        const div = document.createElement('div');
        div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        div.appendChild(botaoCtrl('ctrl-cidade', 'focus-2', 'Ver a cidade inteira', () => (aoCidadeInteira ? aoCidadeInteira() : visaoGeral())));
        if (aoLinhaTempo) div.appendChild(botaoCtrl('ctrl-linha-tempo', 'history', 'Linha do tempo (escolha o dia e a hora)', () => aoLinhaTempo()));
        botaoTema = botaoCtrl('ctrl-tema', 'moon', '', () => trocarTema(temaAtual === 'escuro' ? 'claro' : 'escuro'));
        div.appendChild(botaoTema);
        marcarBotaoTema();
        return div;
      },
      onRemove() {},
    }, 'bottom-right');

    // Céu e neblina: com o mapa inclinado, o que está longe some aos poucos na cor do fundo (profundidade).
    function aplicarCeu() {
      const c = ML.CORES_TEMA[temaAtual];
      try {
        mapa.setSky({ 'sky-color': c.ceu, 'horizon-color': c.ceu, 'fog-color': c.neblina,
          'fog-ground-blend': 0.55, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.5, 'atmosphere-blend': 0 });
      } catch (e) { /* MapLibre sem céu: segue sem neblina */ }
    }

    // salvar: false é o tema do modo telão (escuro na TV), que não muda a escolha guardada de quem usa o painel.
    function trocarTema(t, { salvar = true } = {}) {
      if (t === temaAtual) return;
      temaAtual = t;
      if (salvar) salvarTema(t);
      marcarBotaoTema();
      if (!bairrosProntos()) return; // o estilo ainda carrega: style.load aplica
      tema.aplicar(t);
      pintarTemaProprio();
      aplicarCeu();
    }
    marcarBotaoTema();
    // A atribuição começa recolhida no ⓘ (aberta, ocupa uma faixa do mapa); clicar no ⓘ abre.
    // Zoom out limitado a pouco além da cidade inteira; o enquadramento depende do tamanho do mapa,
    // então o limite é recalculado quando ele muda (faixa do dashboard, gaveta aberta, janela).
    function limitarZoomOut() {
      const cam = mapa.cameraForBounds(limites, { padding: margens(30) });
      if (cam && Number.isFinite(cam.zoom)) mapa.setMinZoom(ML.zoomMinimo(cam.zoom));
    }
    limitarZoomOut();
    mapa.on('resize', limitarZoomOut);

    // Luz do dia, ondas de chegada e minimapa (js/mapa-ambiente.js).
    let ambiente = null;
    // Alerta que acabou de chegar fica fora dos grupos por um tempo: a onda abre no ponto e o pino aparece ali,
    // em vez de sumir dentro do grupo vizinho (o número do grupo só sobe depois).
    const SOLTA_MS = 15000;
    const recemChegadas = new Set();
    function chegou(o) {
      recemChegadas.add(o.id);
      setTimeout(() => { if (recemChegadas.delete(o.id)) atualizarFonte(); }, SOLTA_MS);
      if (ambiente) ambiente.onda(o);
      if (o.bairroId && !poucoMovimento()) {
        estadoBairro(o.bairroId, { chegou: true });
        setTimeout(() => estadoBairro(o.bairroId, { chegou: false }), 900);
      }
    }

    mapa.once('load', () => {
      const atrib = elemento.querySelector('.maplibregl-ctrl-attrib');
      if (atrib) atrib.classList.remove('maplibregl-compact-show');
      if (GC.criarAmbienteMapa) {
        ambiente = GC.criarAmbienteMapa(mapa, { bairros: GC.data.bairros, limites, poucoMovimento,
          aoClicarMinimapa: () => (aoCidadeInteira ? aoCidadeInteira() : visaoGeral()) });
      }
      entrada();
      if (aoCarregar) aoCarregar();
    });

    // ---- Entrada animada ----
    // A câmera chega de mais longe até a cidade, o véu do entorno aparece aos poucos e os pinos surgem em
    // sequência. Sem animação para quem pediu menos movimento. Enquanto ela roda, reenquadrar fica para depois.
    const poucoMovimento = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let introAte = poucoMovimento() ? 0 : Infinity; // até quando a entrada roda (Infinity = ainda não começou)
    let pinosNaEntrada = 0;
    const emEntrada = () => Date.now() < introAte;
    function entrada() {
      if (introAte !== Infinity) return;
      const DURACAO = 2200;
      introAte = Date.now() + DURACAO + 400;
      document.body.classList.add('mapa-entrando');
      // A visualização em uso pode ter zoom e posição próprios: a entrada termina neles.
      const cam = inicioProprio || mapa.cameraForBounds(limites, { padding: margens(30) });
      if (cam) {
        // Chega de longe até a cidade, vista de cima (com bairro já escolhido, já inclinada sobre ele).
        mapa.jumpTo({ center: cam.center, zoom: cam.zoom - 1.4, pitch: 0 });
        mapa.easeTo({ center: cam.center, zoom: cam.zoom + (inicioProprio ? 0 : zoomExtra()), pitch: pitchBase(), duration: DURACAO, easing: (t) => 1 - Math.pow(1 - t, 3) });
      }
      if (mapa.getLayer('mascara')) mapa.setPaintProperty('mascara', 'fill-opacity', ML.CORES_TEMA[temaAtual].mascaraOpacidade);
      revelarBairros();
      setTimeout(() => document.body.classList.remove('mapa-entrando'), DURACAO + 1200);
    }
    // Estilo base fora do ar: troca pela reserva (uma vez), por erro ou por demora.
    let estiloCarregou = false;
    let usandoReserva = !BASE_REAL; // fundo liso desde o início: nada a trocar
    const usarReserva = () => {
      if (estiloCarregou || usandoReserva) return;
      usandoReserva = true;
      mapa.setStyle(ESTILO_RESERVA);
    };
    mapa.on('error', (e) => { if (e && e.error && e.error.url === ESTILO) usarReserva(); });
    setTimeout(usarReserva, ESPERA_ESTILO);
    mapa.on('style.load', () => {
      estiloCarregou = true;
      tema.lerBase();
      tema.aplicar(temaAtual);
      montarBairros();
      if (ruasLigadas) montarRuas(); // o estilo novo apaga as camadas: refaz se a chave está ligada
      aplicarCeu();
      camadas.forEach((c) => { if (c.montar) c.montar(); }); // na ordem dos <script>: a de baixo fica por cima
      montarCalor();
      montarOcorrencias();
    });

    // A rodinha dá zoom (zoom nativo do MapLibre, em torno do cursor): a página não rola mais, o
    // dashboard abre só no clique em "Indicadores".
    if (aoRolarSemCtrl) elemento.addEventListener('wheel', aoRolarSemCtrl, { passive: true });

    // ======================= Bairros =======================
    let selecionado = []; // bairros em foco (clique no mapa ou filtro de bairros)
    let destacados = []; // bairros pintados pela IA (fase 4 liga)
    let gruposBairro = null; // cruzamento de dados: { bairroId: número do grupo } (null = desligado)
    let sobMouse = null;
    const bairroPorId = (id) => GC.data.bairros.find((b) => b.id === id);
    const bairrosProntos = () => !!mapa.getLayer('bairros-preenchimento');
    // O app pode selecionar um bairro antes do estilo carregar: o estado fica guardado e vale ao montar.
    const estadoBairro = (id, estado) => { if (bairrosProntos()) mapa.setFeatureState({ source: 'bairros', id }, estado); };

    // Ocorrências por bairro: o preenchimento fica mais denso onde há mais (de 2 % a 15 %).
    const geoBairrosAtual = () => ML.geoBairros(GC.data.bairros, ML.contagemPorBairro(lista()));
    function contarBairros() {
      const f = mapa.getSource('bairros');
      if (f) f.setData(geoBairrosAtual());
      atualizarHalo();
    }

    function montarBairros() {
      const cores = ML.CORES_TEMA[temaAtual];
      // Entorno apagado e limite fino e discreto: a cidade se destaca do resto do mapa sem moldura chamativa.
      mapa.addSource('mascara', { type: 'geojson', data: ML.geoMascara(GC.data.bairros) });
      mapa.addSource('limite', { type: 'geojson', data: ML.geoLimite(GC.data.bairros) });
      mapa.addLayer({ id: 'mascara', type: 'fill', source: 'mascara',
        // Na entrada, o véu nasce transparente e aparece com a transição (entrada() define o valor final).
        paint: { 'fill-color': cores.mascara, 'fill-opacity': introAte === Infinity ? 0 : cores.mascaraOpacidade,
          'fill-opacity-transition': { duration: 1400, delay: 300 }, 'fill-antialias': false } });
      mapa.addLayer({ id: 'limite', type: 'line', source: 'limite', layout: { 'line-join': 'round' },
        paint: { 'line-color': cores.limite, 'line-width': 1.5, 'line-opacity': 0.55 } });

      mapa.addSource('bairros', { type: 'geojson', data: geoBairrosAtual(), promoteId: 'id' });
      mapa.addSource('bairros-rotulos', { type: 'geojson', data: ML.geoRotulos(GC.data.bairros) });
      const muitosBairros = GC.data.bairros.length > 20;
      // Destaque > selecionado > mouse por cima > densidade de ocorrências.
      const estado = (chave) => ['boolean', ['feature-state', chave], false];
      // Na entrada, cada bairro nasce oculto e aparece do centro para fora (revelarBairros).
      const vaiEntrar = introAte === Infinity;
      mapa.addLayer({ id: 'bairros-preenchimento', type: 'fill', source: 'bairros', paint: {
        'fill-color': ['case', estado('destaque'), ROXO, cores.bairro],
        'fill-opacity': ML.opacidadeBairro(ruasLigadas), // mais clara com o fundo "Ruas"
        'fill-opacity-transition': { duration: 300 },
      } });
      // Modo telão: bairros pintados pelo nível de ocorrências abertas (feature-state "nivel", 1 a 4), nas
      // cores do mapa de calor (amarelo é menos, vinho é mais). Sem nível, transparente.
      const nivel = ['coalesce', ['feature-state', 'nivel'], 0];
      const coresNivel = ML.paradasCalor().map(([, cor]) => cor);
      mapa.addLayer({ id: 'bairros-nivel', type: 'fill', source: 'bairros', paint: {
        'fill-color': ['match', nivel, 1, coresNivel[0], 2, coresNivel[1], 3, coresNivel[2], 4, coresNivel[3], 'rgba(0, 0, 0, 0)'],
        'fill-opacity': ['case', ['>', nivel, 0], 0.5, 0],
      } });
      // Cruzamento de dados: bairros pelo grupo (feature-state "grupo", 1 a 4, ML.GRUPOS). Sem grupo, transparente.
      const grupo = ['coalesce', ['feature-state', 'grupo'], 0];
      mapa.addLayer({ id: 'bairros-grupo', type: 'fill', source: 'bairros', paint: {
        'fill-color': ['match', grupo, ...ML.GRUPOS.flatMap((g) => [g.ordem, g.cor]), 'rgba(0, 0, 0, 0)'],
        'fill-opacity': ['match', grupo, 0, 0, 4, 0.3, 0.55],
        'fill-opacity-transition': { duration: 300 },
      } });
      // Relevo: um filete de luz por baixo do contorno dá a borda dupla de maquete.
      mapa.addLayer({ id: 'bairros-luz', type: 'line', source: 'bairros', layout: { 'line-join': 'round' }, paint: {
        'line-color': cores.luz, 'line-width': 3,
        'line-opacity': ML.opacidadeLuzBairro(temaAtual, ruasLigadas), 'line-opacity-transition': { duration: 400 } } });
      // Halo dos bairros com prazo estourado e sem ação (ML.bairrosEmAlerta): respira em respirarHalo().
      mapa.addLayer({ id: 'bairros-alerta', type: 'fill', source: 'bairros', paint: {
        'fill-color': cores.alerta, 'fill-opacity': ['case', estado('oculto'), 0, estado('alerta'), 0.1, 0] } });
      mapa.addLayer({ id: 'bairros-alerta-borda', type: 'line', source: 'bairros', layout: { 'line-join': 'round' }, paint: {
        'line-color': cores.alerta, 'line-width': 2.5, 'line-blur': 1.5, 'line-opacity': ['case', estado('oculto'), 0, estado('alerta'), 0.6, 0] } });
      // Bairro sob o mouse "levanta": a sombra desce e o preenchimento e o contorno sobem alguns pixels.
      // Só o bairro do filtro aparece (levantarBairro); sem mouse, nenhum.
      mapa.addLayer({ id: 'bairros-elevado-sombra', type: 'line', source: 'bairros', filter: filtroElevado(null), layout: { 'line-join': 'round' }, paint: {
        'line-color': cores.sombra, 'line-width': 8, 'line-blur': 8, 'line-opacity': 0.16, 'line-translate': [0, 6] } });
      // O bairro levantado pega luz: tom claro por cima (no escuro, um véu leve).
      mapa.addLayer({ id: 'bairros-elevado', type: 'fill', source: 'bairros', filter: filtroElevado(null), paint: {
        'fill-color': cores.luz, 'fill-opacity': cores.elevadoOpacidade, 'fill-translate': [0, -3] } });
      mapa.addLayer({ id: 'bairros-elevado-borda', type: 'line', source: 'bairros', filter: filtroElevado(null), layout: { 'line-join': 'round' }, paint: {
        'line-color': cores.bairro, 'line-width': 1.5, 'line-opacity': 0.75, 'line-translate': [0, -3] } });
      mapa.addLayer({ id: 'bairros-contorno', type: 'line', source: 'bairros',
        // Contorno discreto (fino, contínuo, suave): o bairro se vê sem disputar com os pinos.
        paint: { 'line-color': cores.bairro, 'line-width': 1, 'line-opacity': ['case', estado('oculto'), 0, 0.35],
          'line-opacity-transition': { duration: 400 } } });
      mapa.addLayer({ id: 'bairros-contorno-sel', type: 'line', source: 'bairros',
        paint: { 'line-color': cores.selecionado, 'line-width': 3 } });
      mapa.addLayer({ id: 'bairros-contorno-destaque', type: 'line', source: 'bairros',
        paint: { 'line-color': ROXO, 'line-width': 2.5, 'line-opacity': 0.9 } });
      // Bairro apontado por uma lista (apontarBairro): contorno forte, visível sobre a pintura dos níveis.
      mapa.addLayer({ id: 'bairros-contorno-apontado', type: 'line', source: 'bairros', filter: filtroElevado(apontado),
        layout: { 'line-join': 'round' }, paint: { 'line-color': cores.selecionado, 'line-width': 3.5 } });
      // Nome sempre visível no centro do bairro, por cima de tudo.
      mapa.addLayer({ id: 'bairros-rotulo', type: 'symbol', source: 'bairros-rotulos',
        // Diminui com o zoom e quebra nomes longos: no celular, "Jardim das Flores" não atropela o vizinho.
        // Deitado no chão ('map'): em perspectiva, o nome ao fundo fica menor e o da frente maior.
        layout: { 'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Bold'], 'text-letter-spacing': 0.02, 'text-pitch-alignment': 'map',
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9.5, 12.5, 11, 14, 12.5], 'text-max-width': 7,
          // Abaixo do centro: o grupo de pinos do bairro costuma cair no centro e cobria o nome.
          // Pino por cima do nome: o hover mostra o nome inteiro (nomeNoHover).
          'text-anchor': 'top', 'text-offset': [0, 2.2],
          // Cidade com muitos bairros (a grande tem 121): nome que colide some, e o dos mais populosos fica.
          // Ao aproximar, aparecem os outros.
          'text-allow-overlap': !muitosBairros, 'text-ignore-placement': !muitosBairros,
          'symbol-sort-key': ['-', 0, ['get', 'populacao']] },
        paint: { 'text-color': cores.rotulo, 'text-halo-color': cores.halo, 'text-halo-width': 1.5,
          'text-opacity': vaiEntrar ? 0 : 1, 'text-opacity-transition': { duration: 600 } } });
      if (vaiEntrar) GC.data.bairros.forEach((b) => estadoBairro(b.id, { oculto: true }));
      pintarBairros();
      atualizarHalo();
    }

    // ---- Relevo: o bairro sob o mouse levanta (camadas bairros-elevado*) ----
    function filtroElevado(id) { return ['==', ['get', 'id'], id || '']; }
    const CAMADAS_ELEVADO = ['bairros-elevado-sombra', 'bairros-elevado', 'bairros-elevado-borda'];
    function levantarBairro(id) {
      CAMADAS_ELEVADO.forEach((l) => { if (mapa.getLayer(l)) mapa.setFilter(l, filtroElevado(id)); });
    }
    // ---- Nome do bairro no hover, por cima dos pinos ----
    // O nome fica parado no lugar de sempre (no mapa, embaixo dos pinos, que são HTML). Com o mouse no bairro,
    // num pino ou num grupo dele, uma etiqueta HTML com o mesmo nome, no mesmo lugar, aparece por cima de tudo,
    // e o nome do mapa daquele bairro some enquanto isso (senão ficam dois).
    let nomeHover = null;
    let nomeHoverId = null;
    // Mesmo tamanho do text-size de bairros-rotulo.
    const tamanhoRotulo = (z) => (z <= 11 ? 9.5 : z <= 12.5 ? 9.5 + (z - 11) : z <= 14 ? 11 + (z - 12.5) : 12.5);
    function nomeNoHover(id) {
      if (id === nomeHoverId) return;
      nomeHoverId = id || null;
      const b = id && GC.data.bairros.find((x) => x.id === id);
      if (mapa.getLayer('bairros-rotulo')) mapa.setFilter('bairros-rotulo', b ? ['!=', ['get', 'id'], b.id] : null);
      if (!b || !bairrosProntos()) { if (nomeHover) nomeHover.remove(); return; }
      if (!nomeHover) {
        const el = document.createElement('div');
        el.className = 'rotulo-bairro-hover';
        el.setAttribute('aria-hidden', 'true');
        nomeHover = new maplibregl.Marker({ element: el, anchor: 'top' });
      }
      const tam = tamanhoRotulo(mapa.getZoom());
      const c = ML.CORES_TEMA[temaAtual];
      const el = nomeHover.getElement();
      el.textContent = b.nome;
      el.style.fontSize = `${tam}px`;
      el.style.setProperty('--rotulo-cor', c.rotulo);
      el.style.setProperty('--rotulo-halo', c.halo);
      nomeHover.setOffset([0, Math.round(2.2 * tam)]).setLngLat([b.centro[1], b.centro[0]]).addTo(mapa);
    }
    // Bairro sob um ponto da tela (pino ou grupo, que tapam o mapa embaixo deles).
    function bairroNoPonto(lngLat) {
      if (!mapa.getLayer('bairros-preenchimento')) return null;
      const f = mapa.queryRenderedFeatures(mapa.project(lngLat), { layers: ['bairros-preenchimento'] })[0];
      return f ? f.id : null;
    }
    mapa.on('zoom', () => { if (nomeHoverId) { const id = nomeHoverId; nomeHoverId = null; nomeNoHover(id); } });

    // Bairro apontado por uma lista fora do mapa (os bairros do "Comparar"): levanta e ganha contorno forte.
    let apontado = null;
    function apontarBairro(id) {
      apontado = id || null;
      levantarBairro(apontado);
      if (mapa.getLayer('bairros-contorno-apontado')) mapa.setFilter('bairros-contorno-apontado', filtroElevado(apontado));
    }

    // ---- Entrada: os bairros se desenham do centro para fora e os nomes aparecem por último ----
    function revelarBairros() {
      if (!bairrosProntos()) return;
      const ordem = ML.ordemEntradaBairros(GC.data.bairros);
      const passo = Math.min(45, 1100 / Math.max(1, ordem.length));
      const INICIO = 500; // depois que a tela de carregamento some (600 ms de saída)
      ordem.forEach((id, i) => setTimeout(() => estadoBairro(id, { oculto: false }), INICIO + i * passo));
      const fim = INICIO + ordem.length * passo;
      setTimeout(() => { if (mapa.getLayer('bairros-rotulo')) mapa.setPaintProperty('bairros-rotulo', 'text-opacity', 1); }, fim);
      // Garantia: nada fica escondido se algum timer se perder (aba em segundo plano).
      setTimeout(() => {
        GC.data.bairros.forEach((b) => estadoBairro(b.id, { oculto: false }));
        if (mapa.getLayer('bairros-rotulo')) mapa.setPaintProperty('bairros-rotulo', 'text-opacity', 1);
      }, fim + 1500);
    }

    // ---- Halo dos bairros em alerta: o único pulso contínuo do mapa (os pinos ficam com anel parado) ----
    let bairrosEmAlerta = [];
    let respirando = false;
    const HALO_MS = 2400;
    function atualizarHalo() {
      if (!bairrosProntos()) return;
      const novos = ML.bairrosEmAlerta(lista());
      GC.data.bairros.forEach((b) => estadoBairro(b.id, { alerta: novos.includes(b.id) }));
      bairrosEmAlerta = novos;
      if (novos.length && !poucoMovimento()) respirarHalo();
    }
    function respirarHalo() {
      if (respirando) return;
      respirando = true;
      const alerta = ['boolean', ['feature-state', 'alerta'], false];
      const oculto = ['boolean', ['feature-state', 'oculto'], false];
      let ultimo = 0;
      const quadro = (t) => {
        if (!bairrosEmAlerta.length || !mapa.getLayer('bairros-alerta')) { respirando = false; return; }
        if (t - ultimo > 50 && !document.hidden) { // ~20 quadros por segundo bastam para um respiro lento
          ultimo = t;
          const k = 0.5 - 0.5 * Math.cos(((t % HALO_MS) / HALO_MS) * 2 * Math.PI);
          mapa.setPaintProperty('bairros-alerta', 'fill-opacity', ['case', oculto, 0, alerta, 0.04 + 0.12 * k, 0]);
          mapa.setPaintProperty('bairros-alerta-borda', 'line-opacity', ['case', oculto, 0, alerta, 0.25 + 0.55 * k, 0]);
        }
        requestAnimationFrame(quadro);
      };
      requestAnimationFrame(quadro);
    }

    // ======================= Fundo "Ruas" =======================
    // Chave no pé do painel Camadas (js/app/camadas.js). Não é camada de domínio: não conta, não some com
    // "Limpar todas" nem com "Só o que pede atenção". A fonte só é pedida na primeira vez que alguém liga.
    // Com ?mapa=real o estilo base já tem as ruas: nada a fazer.
    let ruasLigadas = false;
    const IDS_RUAS = ML.camadasRuas().map((c) => c.id);
    function montarRuas() {
      if (BASE_REAL && !usandoReserva) return;
      if (!mapa.getLayer('mascara')) return; // estilo ainda carregando: o style.load monta
      if (!mapa.getSource('ruas')) mapa.addSource('ruas', ML.FONTE_RUAS);
      ML.camadasRuas(temaAtual).forEach((c) => { if (!mapa.getLayer(c.id)) mapa.addLayer(c, 'mascara'); });
    }
    function mostrarRuas(v) {
      ruasLigadas = !!v;
      if (ruasLigadas) montarRuas();
      IDS_RUAS.forEach((id) => { if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', ruasLigadas ? 'visible' : 'none'); });
      cidadeSobreOFundo();
    }
    // Com ruas, a cidade fica mais limpa: sem o filete de luz e com a cor dos bairros mais clara (ML.opacidadeBairro).
    function cidadeSobreOFundo() {
      if (mapa.getLayer('bairros-preenchimento')) mapa.setPaintProperty('bairros-preenchimento', 'fill-opacity', ML.opacidadeBairro(ruasLigadas));
      if (mapa.getLayer('bairros-luz')) mapa.setPaintProperty('bairros-luz', 'line-opacity', ML.opacidadeLuzBairro(temaAtual, ruasLigadas));
    }

    // Troca de tema com o mapa montado: só repinta as cores das nossas camadas.
    function pintarTemaProprio() {
      const c = ML.CORES_TEMA[temaAtual];
      const p = (id, k, v) => { if (mapa.getLayer(id)) mapa.setPaintProperty(id, k, v); };
      IDS_RUAS.forEach((id) => p(id, 'line-color', ML.CORES_RUAS[temaAtual]));
      p('mascara', 'fill-color', c.mascara);
      p('mascara', 'fill-opacity', c.mascaraOpacidade);
      p('limite', 'line-color', c.limite);
      p('bairros-preenchimento', 'fill-color', ['case', ['boolean', ['feature-state', 'destaque'], false], ROXO, c.bairro]);
      p('bairros-contorno', 'line-color', c.bairro);
      p('bairros-contorno-sel', 'line-color', c.selecionado);
      p('bairros-contorno-apontado', 'line-color', c.selecionado);
      p('bairros-rotulo', 'text-color', c.rotulo);
      p('bairros-rotulo', 'text-halo-color', c.halo);
      p('bairros-alerta', 'fill-color', c.alerta);
      p('bairros-alerta-borda', 'line-color', c.alerta);
      p('bairros-luz', 'line-color', c.luz);
      p('bairros-luz', 'line-opacity', ML.opacidadeLuzBairro(temaAtual, ruasLigadas));
      p('bairros-elevado-sombra', 'line-color', c.sombra);
      p('bairros-elevado', 'fill-color', c.luz);
      p('bairros-elevado', 'fill-opacity', c.elevadoOpacidade);
      p('bairros-elevado-borda', 'line-color', c.bairro);
    }

    let niveisBairro = null; // { idDoBairro: 0 a 4 } do pintarNiveis, ou null
    function pintarBairros() {
      if (!bairrosProntos()) return;
      const f = ML.filtrosContorno(selecionado, destacados);
      mapa.setFilter('bairros-contorno', f.normal);
      mapa.setFilter('bairros-contorno-sel', f.selecionado);
      mapa.setFilter('bairros-contorno-destaque', f.destaque);
      // O nível (telão, Comparar) entra junto: o estilo que (re)carrega depois da pintura remonta as camadas e
      // apagaria a pintura pedida antes.
      GC.data.bairros.forEach((b) => estadoBairro(b.id, { sel: selecionado.includes(b.id), destaque: destacados.includes(b.id),
        grupo: (gruposBairro && gruposBairro[b.id]) || 0, nivel: (niveisBairro && niveisBairro[b.id]) || 0 }));
    }

    // Clique num pino, grupo ou popup chega ao mapa também: não pode selecionar o bairro por baixo.
    const deCimaDoMapa = (e) => !!(e.originalEvent && e.originalEvent.target.closest
      && e.originalEvent.target.closest('.maplibregl-marker, .maplibregl-popup'));
    mapa.on('click', 'bairros-preenchimento', (e) => {
      if (deCimaDoMapa(e) || !e.features.length) return;
      // Clique numa área de risco, linha de ônibus ou rota da coleta abre o item, não seleciona o bairro por baixo.
      if (camadas.some((c) => c.bloqueiaClique && c.bloqueiaClique(e.point))) return;
      if (aoSelecionarBairro) aoSelecionarBairro(e.features[0].id);
    });
    mapa.on('mousemove', 'bairros-preenchimento', (e) => {
      const id = e.features.length ? e.features[0].id : null;
      if (id === sobMouse) return;
      if (sobMouse) estadoBairro(sobMouse, { hover: false });
      sobMouse = id;
      if (id) estadoBairro(id, { hover: true });
      levantarBairro(id);
      nomeNoHover(id);
      mapa.getCanvas().style.cursor = 'pointer';
    });
    mapa.on('mouseleave', 'bairros-preenchimento', () => {
      if (sobMouse) estadoBairro(sobMouse, { hover: false });
      sobMouse = null;
      levantarBairro(null);
      nomeNoHover(null);
      mapa.getCanvas().style.cursor = '';
    });

    function destacarBairro(id) {
      selecionado = (Array.isArray(id) ? id : id ? [id] : []).filter((x) => bairroPorId(x));
      pintarBairros();
      voltarAoInicio(0.8);
    }

    // Enquadramento guardado pela visualização em uso ({ centro: [lng, lat], zoom } ou null = cidade inteira).
    let inicioProprio = null;
    function definirInicio(enq) {
      inicioProprio = enq && Array.isArray(enq.centro) ? { center: enq.centro, zoom: enq.zoom } : null;
    }

    // Enquadramento inicial: o bairro selecionado, o da visualização ou a cidade inteira.
    function voltarAoInicio(duracao = 0.6) {
      if (inicioProprio && !selecionado.length && !(GC.mapaEmFaixa && GC.mapaEmFaixa())) {
        mapa.easeTo({ center: inicioProprio.center, zoom: inicioProprio.zoom, pitch: pitchBase(), bearing: 0, duration: ms(duracao) });
        return;
      }
      const alvo = selecionado.length ? ML.limites(selecionado.map(bairroPorId)) : limites;
      // Mapa encolhido numa faixa (rolagem): com as margens normais a cidade ficava do tamanho de um selo.
      // Na faixa, margem mínima (só o cabeçalho flutua) e meio nível a mais de zoom: corta uma borda da
      // cidade, mas os pinos (agrupados) ficam legíveis.
      if (GC.mapaEmFaixa && GC.mapaEmFaixa()) {
        const cam = mapa.cameraForBounds(alvo, { padding: margens(6) });
        if (cam) mapa.easeTo({ center: cam.center, zoom: cam.zoom + 0.5 + zoomExtra(), pitch: pitchBase(), bearing: 0, duration: ms(duracao) });
        return;
      }
      // Volta à inclinação de repouso (perspectiva ou de cima) e sem giro, no mesmo movimento do enquadramento.
      const saindoDoFoco = Math.abs(mapa.getPitch() - pitchBase()) > 1 || mapa.getBearing();
      const cam = mapa.cameraForBounds(alvo, { padding: margens(selecionado.length ? 50 : 30), bearing: 0 });
      if (cam) { mapa.easeTo({ center: cam.center, zoom: cam.zoom + zoomExtra(), pitch: pitchBase(), bearing: 0, duration: ms(saindoDoFoco ? Math.max(duracao, 0.9) : duracao) }); return; }
      mapa.fitBounds(alvo, { padding: margens(selecionado.length ? 50 : 30), duration: ms(duracao) });
    }

    // ======================= Ocorrências =======================
    // Os pontos ficam em três fontes GeoJSON (uma por gravidade: grupos não misturam gravidades), com
    // agrupamento nativo. Pinos e grupos são marcadores HTML (HTML de mapa-logica.js, CSS de styles.css), sincronizados
    // com o que a fonte agrupou: quando o zoom cruza um nível inteiro, no fim de cada movimento e quando a
    // fonte termina de processar dados novos.
    const dados = new Map(); // id → { o, assinatura, novo }
    let primeiraRenderizacao = true;
    let geoAtual = ''; // JSON da última setData (evita reagrupar à toa)
    const pinos = new Map(); // id → { id, marker, el, popup }
    const grupos = new Map(); // chave → { marker, el, sev, clusterId, chave }
    let naTela = new Map(); // chave (id do pino ou chave do grupo) → item
    let acesoId = null; // ponto realçado pelo cartão/gaveta
    let grupoAceso = null; // grupo que contém o ponto realçado
    let emFoco = false; // foco temporário ("Ver no mapa", gaveta): ao terminar, volta ao enquadramento
    let pedidoFoco = 0; // só o pedido de foco mais recente segue

    const ocorrenciasProntas = () => !!mapa.getSource(FONTE);
    const fontesCarregadas = () => ocorrenciasProntas() && mapa.isSourceLoaded(FONTE);

    // Resumo ao passar o mouse: um só, reaproveitado.
    const dica = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'resumo-ml', anchor: 'bottom', offset: 20, maxWidth: '280px' });
    let dicaDe = null;
    function abrirDica(id) {
      const d = dados.get(id);
      if (!d) return;
      dicaDe = id;
      dica.setLngLat([d.o.lng, d.o.lat]).setHTML(`<div class="resumo-ponto">${ML.htmlResumo(d.o)}</div>`).addTo(mapa);
    }
    function fecharDica(id) {
      if (id && dicaDe !== id) return;
      dicaDe = null;
      dica.remove();
    }

    const geoAgrupavel = () => ML.geoTodas(lista().filter((o) => !recemChegadas.has(o.id)));
    function montarOcorrencias() {
      const geo = geoAgrupavel();
      geoAtual = JSON.stringify(geo);
      mapa.addSource(FONTE, { type: 'geojson', data: geo, cluster: true, clusterRadius: RAIO_GRUPO, clusterMaxZoom: ZOOM_MAX - 1,
        clusterProperties: {
          pulsa: ['+', ['get', 'pulsa']],
          nivel: ['max', ['get', 'nivel']],
          critica: ['+', ['get', 'critica']],
          alta: ['+', ['get', 'alta']],
          media: ['+', ['get', 'media']],
        } });
      // Camada invisível: só para a fonte carregar e os grupos poderem ser lidos.
      mapa.addLayer({ id: FONTE, type: 'circle', source: FONTE, paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
    }
    const lista = () => [...dados.values()].map((d) => d.o);

    // ---- Popup do pino ----
    function conteudoPopup(id) {
      const o = dados.get(id).o;
      const div = elementoDe(ML.htmlPopup(o), 'popup');
      div.querySelectorAll('[data-acao]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          setTimeout(() => aoAgir(o.id, b.dataset.acao));
        };
      });
      // As do histórico simulado não estão no store: não há gaveta de detalhes para abrir.
      if (aoDetalhar && !o.historico) {
        const det = document.createElement('button');
        det.className = 'btn-detalhes';
        det.dataset.abreGaveta = '';
        det.textContent = 'Ver detalhes →';
        det.onclick = (e) => {
          e.stopPropagation();
          emFoco = false; // o foco passa para a gaveta, sem voltar o mapa no meio
          fecharPopups();
          setTimeout(() => aoDetalhar(o.id));
        };
        div.appendChild(det);
      }
      return div;
    }
    const popupAberto = () => [...pinos.values()].find((p) => p.popup.isOpen());
    // Fecha todo popup (pinos, conquistas e a resolvida).
    function fecharPopups() {
      pinos.forEach((p) => { if (p.popup.isOpen()) p.popup.remove(); });
      conquistas.forEach((c) => { if (c.popup.isOpen()) c.popup.remove(); });
      if (resolvida && resolvida.popup.isOpen()) resolvida.popup.remove();
      camadas.forEach((c) => { if (c.fecharPopups) c.fecharPopups(); });
    }

    // ---- Popups que viram gaveta ----
    // Com o app, o conteúdo dos popups (risco, leitos, obras, escolas, frota…) aparece na gaveta da direita.
    // O popup continua "aberto" (escondido) para o resto do mapa funcionar igual: fechar a gaveta fecha o
    // popup, e clicar fora do ponto (que fecha o popup) fecha a gaveta. Ao fechar, o conteúdo volta para o
    // popup: os que recebem o HTML uma vez só (conquista, resolvida) abrem de novo inteiros.
    function naGaveta(popup) {
      if (!aoInfo) return popup;
      let fecharGaveta = null;
      let conteudo = null;
      let caixa = null;
      popup.on('open', () => {
        const el = popup.getElement();
        if (el) el.classList.add('popup-na-gaveta');
        setTimeout(() => { // depois de quem preenche o popup no próprio 'open'
          if (!popup.isOpen()) return;
          conteudo = popup.getElement().querySelector('.maplibregl-popup-content');
          caixa = document.createElement('div');
          caixa.className = 'info-conteudo';
          [...conteudo.childNodes].forEach((n) => {
            if (!(n.classList && n.classList.contains('maplibregl-popup-close-button'))) caixa.appendChild(n);
          });
          fecharGaveta = aoInfo(caixa, { fechar: () => { if (popup.isOpen()) popup.remove(); }, lngLat: popup.getLngLat() });
        });
      });
      popup.on('close', () => {
        if (conteudo && caixa) while (caixa.firstChild) conteudo.appendChild(caixa.firstChild);
        conteudo = null;
        caixa = null;
        const f = fecharGaveta;
        fecharGaveta = null;
        if (f) f();
      });
      return popup;
    }

    // ---- Pinos e grupos (elementos HTML) ----
    function marcarAceso(id) {
      const p = pinos.get(id);
      if (!p) return;
      const div = p.el.querySelector('.marcador');
      if (div) div.classList.toggle('acesa', id === acesoId);
      p.el.style.zIndex = id === acesoId ? '2' : '';
    }

    function criarPino(id) {
      const d = dados.get(id);
      const el = elementoDe(ML.htmlPino(d.o, { novo: d.novo }));
      el.dataset.id = id;
      d.novo = false;
      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px', className: 'popup-ocorrencia' });
      popup.on('open', () => { popup.setDOMContent(conteudoPopup(id)); fecharDica(); });
      popup.on('close', () => encerrarFoco());
      const marker = new maplibregl.Marker({ element: el }).setLngLat([d.o.lng, d.o.lat]);
      // Clique no pino abre o detalhe na gaveta da direita (com o app); sem app, o popup de sempre. As do
      // histórico simulado (linha do tempo) não estão no store: ficam com o popup, só de leitura.
      if (aoDetalhar && !d.o.historico) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          fecharDica();
          fecharPopups();
          aoDetalhar(id);
        });
      } else marker.setPopup(popup);
      if (emEntrada()) el.style.setProperty('--atraso', `${1300 + (pinosNaEntrada++) * 55}ms`);
      el.setAttribute('aria-label', ML.rotuloPino(d.o)); // o MapLibre põe "Map marker"
      el.addEventListener('mouseenter', () => { el.style.zIndex = '3'; if (!popup.isOpen()) abrirDica(id); nomeNoHover(d.o.bairroId); });
      el.addEventListener('mouseleave', () => { el.style.zIndex = id === acesoId ? '2' : ''; if (acesoId !== id) fecharDica(id); nomeNoHover(sobMouse); });
      const p = { id, marker, el, popup };
      pinos.set(id, p);
      marcarAceso(id);
      return p;
    }

    function criarGrupo(f, chave) {
      const props = f.properties;
      const sev = ML.sevDoNivel(props.nivel);
      const contagem = { critica: props.critica || 0, alta: props.alta || 0, media: props.media || 0 };
      const el = elementoDe(ML.htmlGrupo(sev, props.point_count, props.pulsa > 0, contagem));
      const marker = new maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates);
      if (emEntrada()) el.style.setProperty('--atraso', `${1300 + (pinosNaEntrada++) * 55}ms`);
      marker.getElement().setAttribute('aria-label', ML.rotuloGrupo(props.point_count, contagem));
      const g = { chave, sev, clusterId: props.cluster_id, el, marker };
      const abrir = async (e) => {
        e.stopPropagation();
        fecharDica();
        const z = await mapa.getSource(FONTE).getClusterExpansionZoom(props.cluster_id);
        mapa.easeTo({ center: f.geometry.coordinates, zoom: Math.min(ZOOM_MAX, z + 0.25) });
      };
      el.addEventListener('click', abrir);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });
      el.addEventListener('mouseenter', () => nomeNoHover(bairroNoPonto(f.geometry.coordinates)));
      el.addEventListener('mouseleave', () => nomeNoHover(sobMouse));
      grupos.set(chave, g);
      return g;
    }

    function sincronizar() {
      if (!fontesCarregadas()) return;
      const vivos = new Map();
      mapa.querySourceFeatures(FONTE).forEach((f) => {
        const p = f.properties;
        if (p.cluster) {
          // O id de um grupo se repete entre zooms e após dados novos: a chave leva também o conteúdo.
          const chave = `g:${p.cluster_id}:${p.point_count}:${p.pulsa}:${p.critica}:${p.alta}:${p.media}`;
          if (!vivos.has(chave)) vivos.set(chave, grupos.get(chave) || criarGrupo(f, chave));
        } else if (dados.has(p.id) && !vivos.has(p.id)) {
          vivos.set(p.id, pinos.get(p.id) || criarPino(p.id));
        }
      });
      // Recém-chegadas ficam fora da fonte agrupável: pino próprio, por cima dos grupos.
      recemChegadas.forEach((id) => {
        if (!dados.has(id)) { recemChegadas.delete(id); return; }
        vivos.set(id, pinos.get(id) || criarPino(id));
      });
      // Pino com popup aberto fica, mesmo que a fonte ainda esteja reagrupando (mudou de gravidade).
      const aberto = popupAberto();
      if (aberto && dados.has(aberto.id)) vivos.set(aberto.id, aberto);
      naTela.forEach((item, chave) => { if (!vivos.has(chave)) item.marker.remove(); });
      vivos.forEach((item, chave) => { if (!naTela.has(chave)) item.marker.addTo(mapa); });
      naTela = vivos;
      grupos.forEach((g, chave) => { if (!vivos.has(chave)) grupos.delete(chave); });
      // O ponto realçado pode ter entrado ou saído de um grupo.
      if (acesoId) realcarGrupo(acesoId);
    }

    let agendado = false;
    const agendar = () => {
      if (agendado) return;
      agendado = true;
      setTimeout(() => { agendado = false; sincronizar(); });
    };
    let ultimoNivel = null;
    mapa.on('render', () => {
      const nivel = Math.floor(mapa.getZoom());
      if (nivel !== ultimoNivel) { ultimoNivel = nivel; agendar(); }
    });
    mapa.on('moveend', agendar);
    mapa.on('sourcedata', (e) => { if (e.sourceId === FONTE && e.isSourceLoaded) agendar(); });

    function renderOcorrencias(novaLista) {
      const ids = new Set(novaLista.map((o) => o.id));
      for (const id of [...dados.keys()]) {
        if (ids.has(id)) continue;
        dados.delete(id);
        const p = pinos.get(id);
        if (p) {
          p.marker.remove(); // fecha o popup junto (e o foco termina)
          pinos.delete(id);
          naTela.delete(id);
        }
        fecharDica(id);
      }
      novaLista.forEach((o) => {
        const assinatura = ML.assinatura(o);
        const d = dados.get(o.id);
        if (!d) {
          dados.set(o.id, { o, assinatura, novo: !primeiraRenderizacao });
          // Chegou agora (não é filtro que voltou nem histórico): onda no ponto e o bairro acende um instante.
          if (!primeiraRenderizacao && !o.historico && GC.idadeMin && GC.idadeMin(o) < 3) chegou(o);
          return;
        }
        d.o = o;
        if (d.assinatura === assinatura) return;
        d.assinatura = assinatura;
        // Mudou o que se vê: redesenha o pino no lugar (o popup aberto continua aberto, com o texto novo).
        const p = pinos.get(o.id);
        if (p) {
          p.el.innerHTML = ML.htmlPino(o);
          p.el.setAttribute('aria-label', ML.rotuloPino(o));
          marcarAceso(o.id);
          if (p.popup.isOpen()) p.popup.setDOMContent(conteudoPopup(o.id));
        }
        if (dicaDe === o.id) abrirDica(o.id);
      });
      primeiraRenderizacao = false;
      atualizarFonte();
    }
    function atualizarFonte() {
      if (!ocorrenciasProntas()) return; // o estilo ainda carrega: montarOcorrencias usa estes dados
      const geo = geoAgrupavel();
      const json = JSON.stringify(geo);
      if (json !== geoAtual) {
        geoAtual = json;
        mapa.getSource(FONTE).setData(geo);
        contarBairros();
      }
      agendar();
    }

    // ---- Grupos que escondem um ponto ----
    // Grupo na tela que contém o ponto (null se ele está solto ou fora da tela). Assíncrono no MapLibre.
    async function grupoDe(id) {
      const d = dados.get(id);
      if (!d || naTela.has(id)) return null;
      for (const item of naTela.values()) {
        if (item.clusterId === undefined) continue;
        try {
          const folhas = await mapa.getSource(FONTE).getClusterLeaves(item.clusterId, Infinity, 0);
          if (folhas.some((f) => f.properties.id === id)) return item;
        } catch (e) {
          // Grupo desfeito no meio da consulta (zoom mudou): segue para o próximo.
        }
      }
      return null;
    }

    let pedidoRealce = 0;
    async function realcarGrupo(id) {
      const meu = ++pedidoRealce;
      const g = await grupoDe(id);
      if (meu !== pedidoRealce || acesoId !== id) return;
      if (grupoAceso && grupoAceso !== g) grupoAceso.el.querySelector('.grupo-pinos').classList.remove('acesa');
      grupoAceso = g;
      if (g) g.el.querySelector('.grupo-pinos').classList.add('acesa');
    }

    // Passar o mouse num cartão não mexe no zoom: se o ponto está agrupado, o grupo acende.
    function acender(id) {
      const anterior = acesoId;
      acesoId = id || null;
      if (anterior) {
        marcarAceso(anterior);
        fecharDica(anterior);
      }
      pedidoRealce++;
      if (grupoAceso) grupoAceso.el.querySelector('.grupo-pinos').classList.remove('acesa');
      grupoAceso = null;
      if (!acesoId) return;
      marcarAceso(acesoId);
      if (naTela.has(acesoId)) {
        const p = pinos.get(acesoId);
        if (!p.popup.isOpen()) abrirDica(acesoId);
      } else {
        realcarGrupo(acesoId);
      }
    }

    // ---- Foco ----
    // Espera só as fontes dos pontos (não o fundo inteiro, que demora mais) e a câmera parar.
    // Limite de 2 s: se algo travar, segue com o que houver.
    const esperarMapa = () => new Promise((ok) => {
      let feito = false;
      const ver = () => {
        if (feito || !fontesCarregadas() || mapa.isMoving()) return;
        feito = true;
        mapa.off('sourcedata', ver);
        mapa.off('moveend', ver);
        ok();
      };
      mapa.on('sourcedata', ver);
      mapa.on('moveend', ver);
      setTimeout(() => { if (!feito) { feito = true; mapa.off('sourcedata', ver); mapa.off('moveend', ver); ok(); } }, 2000);
      ver();
    });
    // Move a câmera e espera ela parar. O ouvinte entra ANTES do movimento: com "reduzir movimento" no
    // sistema, o MapLibre troca a animação por um salto e dispara o moveend dentro da própria chamada
    // (ouvir depois esperava para sempre e travava o foco e o telão). Limite de 4 s, como garantia.
    // Depois do moveend, espera também o mapa assentar (idle): após um salto, os pinos e grupos do novo
    // enquadramento só existem quando os blocos forem redesenhados.
    const esperarEvento = (evento, ms) => new Promise((ok) => {
      const fim = () => { clearTimeout(limite); mapa.off(evento, fim); ok(); };
      const limite = setTimeout(fim, ms);
      mapa.on(evento, fim);
    });
    const moverEEsperar = async (mover) => {
      const parou = esperarEvento('moveend', 4000);
      mover();
      await parou;
      await esperarEvento('idle', 1500);
    };

    // Ponto dentro de um grupo: dá o zoom que abre o grupo e só então segue. Só o pedido mais recente segue: um foco antigo (outro cartão clicado, ponto resolvido
    // ou filtrado) é descartado.
    async function mostrarNoGrupo(id, depois) {
      const meu = ++pedidoFoco;
      const valido = () => meu === pedidoFoco && dados.has(id);
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        await esperarMapa();
        if (!valido()) return;
        sincronizar();
        if (naTela.has(id)) { depois(valido); return; }
        const g = await grupoDe(id);
        if (!valido()) return;
        const o = dados.get(id).o;
        let zoom = mapa.getZoom();
        if (g) zoom = Math.max(zoom, await mapa.getSource(FONTE).getClusterExpansionZoom(g.clusterId));
        if (!valido()) return;
        // Sem grupo na tela, o ponto está fora dela: centraliza nele e tenta de novo.
        await moverEEsperar(() => mapa.easeTo({ center: [o.lng, o.lat], zoom: Math.min(ZOOM_MAX, zoom), duration: 500 }));
      }
      if (valido() && naTela.has(id)) depois(valido);
    }
    const cancelarFoco = () => { pedidoFoco++; };

    function encerrarFoco() {
      cancelarFoco();
      if (!emFoco) return;
      emFoco = false;
      voltarAoInicio();
    }

    function focar(id) {
      if (!dados.has(id)) return;
      emFoco = false;
      fecharPopups();
      mostrarNoGrupo(id, async (valido) => {
        const o = dados.get(id).o;
        // Nunca afasta o zoom: se o grupo só se abre acima do zoom de foco, voltar a ele o fecharia de novo.
        await moverEEsperar(() => mapa.flyTo({ center: [o.lng, o.lat], zoom: Math.max(ZOOM_FOCO, mapa.getZoom()), duration: 800 }));
        await esperarMapa();
        if (!valido()) return;
        sincronizar();
        // Com o app, o detalhe abre na gaveta da direita (e ela reposiciona o ponto ao lado dela).
        if (aoDetalhar && !o.historico) { aoDetalhar(id); return; }
        const p = pinos.get(id);
        if (p) abrirPopupDoPino(p.marker);
        emFoco = true;
      });
    }

    // Modo telão: um movimento só, contínuo e em linha reta, até o ponto: posição, zoom, inclinação e
    // giro mudam juntos. Entre dois alertas a câmera desliza de um ao outro sem se afastar (easeTo, não
    // o arco do flyTo, que subia e descia). O zoom final já é calculado antes de sair, alto o bastante
    // para o ponto estar solto (fora de grupo): assim não há zooms em degraus para abrir grupos.
    // Devolve uma promessa: true quando a câmera chegou ao ponto; false se o ponto não está no mapa
    // (resolvido, filtrado) ou se outro foco passou na frente. aoComecar() roda quando o voo começa.
    const LADO_MUNDO = 512; // pixels do mundo inteiro no zoom 0 (blocos de 512 px)
    function zoomParaSoltar(o) {
      const p = maplibregl.MercatorCoordinate.fromLngLat([o.lng, o.lat]);
      let menor = Infinity;
      dados.forEach(({ o: x }) => {
        if (x.id === o.id) return;
        const q = maplibregl.MercatorCoordinate.fromLngLat([x.lng, x.lat]);
        menor = Math.min(menor, Math.hypot(p.x - q.x, p.y - q.y));
      });
      if (!Number.isFinite(menor)) return 0;
      if (menor === 0) return ZOOM_MAX; // mesmo lugar: só se separam no zoom máximo
      // No zoom z, a distância em pixels é menor * 512 * 2^z; solto quando passa do raio do grupo.
      const z = Math.log2(RAIO_GRUPO / (menor * LADO_MUNDO)) + 0.3; // folga
      return z > ZOOM_MAX - 1 ? ZOOM_MAX : z;
    }
    // espacoEsquerda(): pixels ocupados à esquerda (o cartão do telão). O ponto fica no centro da área
    // livre, e o giro lento acontece em volta dele (o padding muda o centro da câmera).
    const SEM_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
    async function sobrevoar(id, { aoComecar, espacoEsquerda } = {}) {
      if (!dados.has(id)) return false;
      fecharPopups();
      fecharDica();
      const meu = ++pedidoFoco; // pausar ou outro sobrevoo no meio do voo cancela este
      const o = dados.get(id).o;
      // De -25° a +25°, sempre o mesmo para o mesmo ponto (hash do id: o tamanho dele quase não varia).
      const hash = [...o.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
      const giro = (hash % 51) - 25;
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_FOCO + 0.4, zoomParaSoltar(o)));
      if (aoComecar) aoComecar();
      acender(id);
      // Duração pela distância na tela: vizinhos perto, deslize curto; do outro lado da cidade, mais longo.
      const a = mapa.project(mapa.getCenter());
      const b = mapa.project([o.lng, o.lat]);
      const duracao = Math.round(Math.min(4500, Math.max(2200, 1400 + Math.hypot(b.x - a.x, b.y - a.y) * 1.6)));
      // Só espera a câmera parar (não o mapa assentar): o telão emenda o giro lento na mesma hora,
      // sem uma parada entre o deslize e o giro.
      const parou = esperarEvento('moveend', duracao + 1500);
      const esquerda = espacoEsquerda ? espacoEsquerda() : 0;
      mapa.easeTo({ center: [o.lng, o.lat], zoom, pitch: 50, bearing: giro, duration: duracao, essential: true,
        padding: Object.assign({}, SEM_PADDING, { left: esquerda }) });
      await parou;
      return meu === pedidoFoco && dados.has(id);
    }

    // Modo telão: anel pulsando na cor da gravidade em volta do ponto em foco. É um marcador à parte (não
    // o pino): aparece já no começo do voo, quando o pino ainda está dentro de um grupo, e marca o lugar
    // exato mesmo no meio de outros pinos. null tira o anel.
    let alvo = null;
    function marcarAlvo(id) {
      const d = id ? dados.get(id) : null;
      if (!d) {
        if (alvo) alvo.remove();
        alvo = null;
        return;
      }
      if (!alvo) alvo = new maplibregl.Marker({ element: elementoDe('<i></i><i></i>', 'telao-alvo') });
      const el = alvo.getElement();
      el.dataset.sev = d.o.severidade;
      el.style.zIndex = '1'; // abaixo do pino aceso (2): o anel envolve o pino, não o cobre
      alvo.setLngLat([d.o.lng, d.o.lat]).addTo(mapa);
    }

    // Leva um ponto qualquer para o centro da área que sobra à esquerda da gaveta.
    function centralizarAoLado(lngLat, larguraOcupada) {
      const tela = mapa.getContainer();
      const ponto = mapa.project(lngLat);
      const alvo = { x: (tela.clientWidth - larguraOcupada) / 2, y: tela.clientHeight / 2 };
      mapa.panBy([ponto.x - alvo.x, ponto.y - alvo.y], { duration: 600 });
    }

    // Leva o ponto para o centro da área que sobra à esquerda da gaveta.
    function mostrarAoLado(id, larguraOcupada) {
      if (!dados.has(id)) return;
      emFoco = true;
      mostrarNoGrupo(id, () => {
        const o = dados.get(id).o;
        // Câmera de perto (ML.cameraCinematica): inclina; a crítica inclina mais e gira um pouco, sempre o
        // mesmo giro para a mesma ocorrência. Ao fechar o detalhe, voltarAoInicio deixa o mapa de cima de novo.
        const cine = ML.cameraCinematica(o, { poucoMovimento: poucoMovimento(), telao: document.body.classList.contains('telao-ativo') });
        // Aproxima até o zoom de foco (nunca afasta: perto de um grupo aberto, afastar o fecharia de novo).
        const zoom = Math.min(ZOOM_MAX, Math.max(mapa.getZoom(), ZOOM_FOCO));
        if (cine) {
          mapa.easeTo({ center: [o.lng, o.lat], offset: [-larguraOcupada / 2, 0], zoom, pitch: cine.pitch, bearing: cine.bearing,
            duration: cine.duracao, easing: (t) => 1 - Math.pow(1 - t, 3) });
        } else {
          // Menos movimento (ou telão): vai direto, sem animar, ao mesmo enquadramento de perto.
          mapa.easeTo({ center: [o.lng, o.lat], offset: [-larguraOcupada / 2, 0], zoom, duration: 0 });
        }
        if (acesoId === id) {
          marcarAceso(id);
          abrirDica(id);
        }
      });
    }

    function fecharPopup(id) {
      const p = pinos.get(id);
      if (p && p.popup.isOpen()) p.popup.remove();
    }

    // ======================= Camadas da IA =======================
    let pontosCalor = null; // pontos do mapa de calor ligado (null = desligado)
    const vazio = { type: 'FeatureCollection', features: [] };

    // Mapa de calor: cores de ML.GRADIENTE_CALOR (as da legenda); por cima do preenchimento dos bairros, sob os nomes.
    function montarCalor() {
      mapa.addSource('calor', { type: 'geojson', data: pontosCalor ? ML.geoCalor(pontosCalor) : vazio });
      const cores = ML.paradasCalor().flat();
      mapa.addLayer({ id: 'calor', type: 'heatmap', source: 'calor', paint: {
        'heatmap-weight': ['get', 'peso'],
        // Calibrado no "onde mais alaga?": centro dos focos em amarelo/laranja, borda em azul.
        'heatmap-intensity': 2,
        'heatmap-radius': 55,
        'heatmap-opacity': 0.8,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, ML.CALOR_TRANSPARENTE, ...cores],
      } }, 'bairros-contorno');
    }


    function pintarCalor() {
      const f = mapa.getSource('calor');
      if (f) f.setData(pontosCalor ? ML.geoCalor(pontosCalor) : vazio);
    }

    // A legenda fixa explica as camadas ligadas: avisa o app a cada mudança.
    let conquistasVisiveis = false;
    // "Só o que pede atenção": o app guarda a preferência (painel Camadas); vale com 2 ou mais camadas ligadas
    // (ML.soAtencaoAtivo). Pinos em dia somem pelo CSS (classe no mapa); o que é desenhado, pelo soAtencao(v) da camada.
    let preferirAtencao = false;
    let soAtencao = false;
    function avisarLegenda() {
      const deCamadas = Object.assign({}, ...camadas.map((c) => (c.legenda ? c.legenda() : {}))); // risco, calorBO
      const estado = Object.assign(deCamadas, { conquistas: conquistasVisiveis, destaqueIA: destacados.length > 0 || !!gruposBairro, calorIA: !!pontosCalor });
      const ativo = ML.soAtencaoAtivo(estado, preferirAtencao);
      if (ativo !== soAtencao) {
        soAtencao = ativo;
        elemento.classList.toggle('so-atencao', ativo);
        camadas.forEach((c) => { if (c.soAtencao) c.soAtencao(ativo); });
      }
      estado.soAtencao = soAtencao;
      camadas.forEach((c) => { if (c.aoMudarCamadas) c.aoMudarCamadas(estado); }); // js/mapa/varias-camadas.js
      if (aoMudarLegenda) aoMudarLegenda(estado);
    }
    function preferirSoAtencao(v) {
      preferirAtencao = !!v;
      avisarLegenda();
    }

    function mostrarLegenda(texto, calor, grupos) {
      if (!legenda) return;
      legenda.innerHTML = ML.htmlLegenda(texto, calor, grupos);
      legenda.querySelector('.legenda-fechar').onclick = () => limparEVoltar();
      legenda.hidden = false;
    }

    function limparCamada() {
      pontosCalor = null;
      pintarCalor();
      destacados = [];
      gruposBairro = null;
      pintarBairros();
      if (legenda) legenda.hidden = true;
      avisarLegenda();
      if (aoMudarCamada) aoMudarCamada(false);
    }

    function mostrarCamada(m) {
      if (!m) return;
      limparCamada();
      if (m.tipo === 'calor') {
        pontosCalor = m.pontos;
        pintarCalor();
      }
      if (m.tipo === 'destaque') {
        destacados = m.bairros.filter((id) => bairroPorId(id));
        pintarBairros();
      }
      // Cruzamento de dados: todo bairro com dado ganha a cor do grupo; o enquadramento vai aos ruins (os 3 primeiros grupos).
      let ruins = [];
      if (m.tipo === 'grupos') {
        gruposBairro = ML.ordemDosGrupos(m.grupos);
        pintarBairros();
        ruins = Object.keys(gruposBairro).filter((id) => gruposBairro[id] < 4 && bairroPorId(id));
      }
      if (m.foco) mapa.flyTo({ center: [m.foco.lng, m.foco.lat], zoom: ML.zoomMapLibre(m.foco.zoom), duration: 1000 });
      else if (destacados.length) mapa.fitBounds(ML.limites(destacados.map(bairroPorId)), { padding: margens(60), duration: 1000 });
      else if (ruins.length) mapa.fitBounds(ML.limites(ruins.map(bairroPorId)), { padding: margens(60), duration: 1000 });
      mostrarLegenda(m.legenda || 'Camada da IA', m.tipo === 'calor', m.tipo === 'grupos' ? { grupos: m.grupos, rotulos: m.rotulos } : null);
      avisarLegenda();
      if (aoMudarCamada) aoMudarCamada(true);
    }

    // ======================= Conquistas e resolvida =======================
    // Popup de pino especial: mesmo visual; fechar qualquer popup encerra o foco.
    const popupSimples = (html) => {
      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px', className: 'popup-ocorrencia' }).setHTML(html);
      popup.on('close', () => encerrarFoco());
      return naGaveta(popup);
    };

    const conquistas = GC.data.conquistas.map((c) => {
      const popup = popupSimples(ML.htmlPopupConquista(c));
      const marker = new maplibregl.Marker({ element: elementoDe(ML.HTML_CONQUISTA) }).setLngLat([c.lng, c.lat]).setPopup(popup);
      marker.getElement().setAttribute('aria-label', 'Conquista: ' + c.titulo);
      marker.getElement().dataset.camada = 'conquistas';
      pinosDeCamada.push({ marker, camada: 'conquistas' });
      return { marker, popup };
    });
    function alternarConquistas(visivel) {
      conquistasVisiveis = !!visivel;
      conquistas.forEach((c) => { if (visivel) c.marker.addTo(mapa); else c.marker.remove(); });
      avisarLegenda();
    }
    // Resumo da semana: voa até a entrega e abre o popup dela (a camada de conquistas já vem ligada).
    function focarConquista(id) {
      const i = GC.data.conquistas.findIndex((c) => c.id === id);
      if (i < 0) return;
      const c = conquistas[i];
      fecharPopups();
      mapa.flyTo({ center: c.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] });
      mapa.once('moveend', () => { abrirPopupDoPino(c.marker); });
    }

    let resolvida = null; // ponto ✅ temporário de "Resolvidas recentemente"
    function tirarResolvida() {
      if (!resolvida) return;
      const r = resolvida;
      resolvida = null;
      r.marker.remove();
    }

    // Mostra onde foi uma ocorrência já resolvida (ela não está mais entre os pontos ativos).
    function mostrarResolvida(r) {
      tirarResolvida();
      emFoco = false;
      fecharPopups();
      const el = elementoDe(ML.HTML_RESOLVIDA);
      el.style.zIndex = '4';
      const popup = popupSimples(ML.htmlPopupResolvida(r));
      const atual = { popup, marker: new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(mapa) };
      resolvida = atual;
      popup.on('close', () => { if (resolvida === atual) tirarResolvida(); });
      mapa.flyTo({ center: [r.lng, r.lat], zoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => {
        if (resolvida !== atual) return;
        abrirPopupDoPino(atual.marker);
        emFoco = true;
      });
    }

    // Há algo temporário no mapa (popup, camada da IA, foco ou resolvida)?
    const temAlgoAberto = () => !!elemento.querySelector('.maplibregl-popup:not(.resumo-ml)') || !!pontosCalor
      || destacados.length > 0 || emFoco || !!resolvida;

    // O prefeito pediu para tirar a camada da IA (ou tudo): limpa e volta ao enquadramento inicial.
    function limparEVoltar() {
      cancelarFoco();
      emFoco = false;
      fecharPopups();
      tirarResolvida();
      limparCamada();
      voltarAoInicio();
    }

    // ======================= Camadas de domínio =======================
    // Leitos, obras, escolas, frota, coleta, farmácias, risco e calor dos B.O.s: um arquivo cada em js/mapa/.
    // O ctx é tudo o que elas enxergam daqui; o que devolvem em api vira método do mapa (o app não muda).
    const ctx = {
      mapa, elementoDe, popupSimples, naGaveta, abrirPopupDoPino, deCimaDoMapa, encerrarFoco, fecharPopups, margens, avisarLegenda, aoDetalhar,
      marcarFoco: () => { emFoco = true; },
      soltarFoco: () => { emFoco = false; },
      esc: GC.escaparHtml,
      plural,
      nomeBairro: (id) => (bairroPorId(id) || { nome: id }).nome,
      ZOOM_FOCO,
      soAtencao: () => soAtencao, // o montar de quem desenha (linhas, áreas) já nasce filtrado
      pinosDeCamada: () => pinosDeCamada,
      camadasDoMapa: () => camadas, // cada uma com nome e, se desenha no MapLibre, desenhos (ids)
    };
    // Cada camada recebe o ctx com o próprio nome e ctx.marcador, que cria o pino já marcado (data-camada) e registrado.
    (GC.camadasMapa || []).forEach((criar) => {
      const nome = ML.nomeCamada(criar.name);
      const c = criar(Object.assign({}, ctx, {
        camada: nome,
        marcador(opcoes) {
          const marker = new maplibregl.Marker(opcoes);
          marker.getElement().dataset.camada = nome;
          pinosDeCamada.push({ marker, camada: nome });
          return marker;
        },
      })) || {};
      c.nome = nome;
      camadas.push(c);
    });
    const apiCamadas = Object.assign({}, ...camadas.map((c) => c.api || {}));

    return {
      ...apiCamadas,
      preferirSoAtencao,
      mostrarRuas,
      renderOcorrencias,
      focar,
      fecharPopup,
      mostrarAoLado,
      encerrarFoco,
      acender,
      destacarBairro,
      // Levanta um bairro como se o mouse estivesse em cima (null baixa), sem mexer na câmera nem no filtro:
      // a lista de bairros do "Comparar" aponta onde cada um fica.
      apontarBairro,
      mostrarCamada,
      limparCamada,
      alternarConquistas,
      focarConquista,
      mostrarResolvida,
      limparEVoltar,
      temAlgoAberto,
      // Depois que a área do mapa muda de tamanho: recalcula e volta ao enquadramento inicial.
      ajustar() {
        mapa.resize();
        if (!emEntrada()) voltarAoInicio();
      },
      // O palco mudou de tamanho (rolagem, janela): recalcula e só reenquadra se nada estiver em foco.
      // manterCamera: só recalcula (o telão comanda a câmera; reenquadrar a cidade no meio do voo o
      // desfazia e deixava a câmera parada longe do alerta).
      redimensionar({ manterCamera = false } = {}) {
        mapa.resize();
        if (!manterCamera && !temAlgoAberto() && !emEntrada()) voltarAoInicio(0.4);
      },
      visaoGeral,
      // Visualização: o enquadramento que ela guarda vira o "início" do mapa; camera() é o que salvar.
      definirInicio(enq) { definirInicio(enq); if (!temAlgoAberto() && !emEntrada()) voltarAoInicio(0.8); },
      camera: () => { const c = mapa.getCenter(); return { centro: [c.lng, c.lat], zoom: mapa.getZoom() }; },
      sobrevoar,
      marcarAlvo,
      // Modo telão: tema só enquanto ele está ligado ('escuro' | 'claro'); null volta ao tema guardado.
      temaTemporario(t) { trocarTema(t || lerTemaSalvo(), { salvar: false }); },
      // Modo telão: pinta os bairros pelo nível ({ idDoBairro: 0 a 4 }); null apaga a pintura.
      // Guardado em niveisBairro: pedido antes de o mapa ficar pronto (ou com o estilo recarregando), vale quando
      // os bairros se montam (pintarBairros).
      pintarNiveis(niveis) {
        niveisBairro = niveis || null;
        GC.data.bairros.forEach((b) => estadoBairro(b.id, { nivel: (niveisBairro && niveisBairro[b.id]) || 0 }));
      },
      // Linha do tempo: cada camada que sabe mostrar o passado (noInstante na camada) redesenha no instante t
      // (null = ao vivo). As outras continuam como estão.
      noInstante(t) {
        camadas.forEach((c) => { if (c.noInstante) c.noInstante(t); });
      },
      // Modo telão: giro lento em volta do centro (linear, sem acelerar nem frear) e parar tudo.
      // O giro começa acelerando de leve (os primeiros 20%) e segue em velocidade constante: emenda no
      // fim do deslize sem tranco.
      girarDevagar: (graus, duracaoMs) => mapa.easeTo({ bearing: mapa.getBearing() + graus, duration: duracaoMs, essential: true,
        easing: (t) => (t < 0.2 ? (t * t) / 0.36 : (t - 0.1) / 0.9) }),
      pararCamera: () => { cancelarFoco(); mapa.stop(); },
      centralizarAoLado,
    };

    // A cidade inteira, de cima (desfaz a inclinação do modo telão).
    // esquerda: pixels ocupados à esquerda (o cartão do telão). A cidade fica no centro da área livre, e o
    // padding fica na câmera: o giro lento do telão gira em volta desse centro, não do meio da tela.
    function visaoGeral(duracao = 0.8, { esquerda = 0 } = {}) {
      cancelarFoco(); // um sobrevoo ainda abrindo grupos não pode voar depois daqui
      if (!esquerda) {
        const cam = mapa.cameraForBounds(limites, { padding: margens(30) });
        // padding zerado: desfaz o espaço do cartão que o telão reservou.
        if (cam) mapa.easeTo({ center: cam.center, zoom: cam.zoom + zoomExtra(), pitch: pitchBase(), bearing: 0, padding: SEM_PADDING, duration: ms(duracao) });
        return;
      }
      const pad = margens(30);
      pad.left = Math.max(pad.left, esquerda + 30);
      // O cameraForBounds soma o padding que a câmera já tem (o do voo do telão até um alerta): desconta,
      // senão a área livre fica negativa e a câmera não sai do lugar.
      const atual = mapa.getPadding();
      const pedir = {};
      ['top', 'right', 'bottom', 'left'].forEach((k) => { pedir[k] = Math.max(0, pad[k] - (atual[k] || 0)); });
      const cam = mapa.cameraForBounds(limites, { padding: pedir });
      if (!cam) return;
      const centro = [(limites[0][0] + limites[1][0]) / 2, (limites[0][1] + limites[1][1]) / 2];
      mapa.easeTo({ center: centro, zoom: cam.zoom, pitch: pitchBase(), bearing: 0, padding: pad, duration: ms(duracao) });
    }
  };
})(window.GC = window.GC || {});
