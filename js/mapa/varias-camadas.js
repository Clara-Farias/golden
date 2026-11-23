(function (GC) {
  // Várias camadas ligadas ao mesmo tempo. Não é um domínio: organiza os pinos e desenhos das outras camadas.
  // - Destacar uma camada: as outras (e as ocorrências) esmaecem. Quem pede é o painel Camadas e a legenda
  //   (js/app/camadas.js), por mapa.destacarCamada(nome | null).
  // - Menos detalhe com 3 ou mais camadas: linhas mais finas e, com o mapa afastado, pinos sem número.
  // - Selo por bairro: com a cidade inteira à vista, 2 ou mais camadas e muitos pinos, os pinos de cada bairro
  //   viram um selo (ícones das camadas, cor da pior situação); o clique aproxima.
  // - Pinos sobrepostos: o clique onde há mais de um pino abre a lista do que há ali.
  // Registrada por último em GC.camadasMapa (a tag vem depois de todas as camadas): lê o registro de pinos
  // (ctx.pinosDeCamada) e os desenhos (ids do MapLibre) de cada camada. Regras puras em js/mapa-logica.js.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function variasCamadas(ctx) {
    const { mapa, elementoDe, popupSimples, abrirPopupDoPino, esc } = ctx;
    const ML = GC.mapaLogica;
    const elemento = mapa.getContainer();
    const limites = ML.limites(GC.data.bairros);
    let estado = {}; // o objeto da legenda: quais camadas estão ligadas
    let destacada = null;
    let reduzido = false;

    // Zoom da cidade inteira na tela de agora (o enquadramento inicial muda com o tamanho da janela).
    const zoomCidade = () => {
      const cam = mapa.cameraForBounds(limites, { padding: ctx.margens(30) });
      return cam && typeof cam.zoom === 'number' ? cam.zoom : mapa.getZoom();
    };
    const escondidoPorAtencao = (el) => elemento.classList.contains('so-atencao') && el.classList.contains('pino-em-dia') && !el.classList.contains('pino-aberto');
    // Pinos de camada no mapa agora (sem os que o "Só o que pede atenção" esconde).
    const noMapa = () => ctx.pinosDeCamada().filter((p) => p.marker._map && !escondidoPorAtencao(p.marker.getElement()));
    const ligada = (nome) => Object.keys(estado).some((k) => estado[k] === true && ML.camadaDaLegenda(k) === nome);

    // ---- Desenhos (linhas, áreas, calor): opacidade ao destacar outra camada e largura com muitas camadas ----
    const PROP_OPACIDADE = { line: 'line-opacity', fill: 'fill-opacity', heatmap: 'heatmap-opacity', circle: 'circle-opacity' };
    const originais = new Map(); // `${id}|${prop}` → valor escrito pela camada
    function escalar(id, prop, fator) {
      const chave = `${id}|${prop}`;
      if (!originais.has(chave)) {
        if (fator === 1) return; // nunca mexido: nada a desfazer
        originais.set(chave, mapa.getPaintProperty(id, prop));
      }
      const orig = originais.get(chave);
      let valor = orig;
      if (fator !== 1) valor = orig === undefined || orig === null ? fator : typeof orig === 'number' ? orig * fator : ['*', orig, fator];
      try { mapa.setPaintProperty(id, prop, valor === undefined ? null : valor); } catch (e) { /* expressão que não aceita multiplicar: fica como está */ }
    }
    function pintarDesenhos() {
      ctx.camadasDoMapa().forEach((c) => (c.desenhos || []).forEach((id) => {
        const camada = mapa.getLayer(id);
        if (!camada) return;
        const opacidade = PROP_OPACIDADE[camada.type];
        if (opacidade) escalar(id, opacidade, destacada && destacada !== c.nome ? ML.OPACIDADE_ESMAECIDA : 1);
        if (camada.type === 'line') escalar(id, 'line-width', reduzido ? ML.FATOR_LINHA_REDUZIDA : 1);
      }));
    }

    // ---- Pinos: esmaecer o que não é da camada destacada ----
    function pintarPinos() {
      elemento.querySelectorAll('.maplibregl-marker').forEach((el) => {
        const daCamada = el.dataset.camada === destacada || (el.dataset.selo || '').split(',').includes(destacada);
        el.classList.toggle('esmaecido', !!destacada && !daCamada);
      });
    }
    function destacarCamada(nome) {
      destacada = nome && ligada(nome) ? nome : null;
      elemento.classList.toggle('camada-destacada', !!destacada);
      pintarPinos();
      pintarDesenhos();
    }

    // ---- Menos detalhe ----
    function atualizarDetalhe() {
      reduzido = ML.camadasLigadas(estado) >= ML.MIN_CAMADAS_DETALHE;
      elemento.classList.toggle('muitas-camadas', reduzido);
      elemento.classList.toggle('zoom-longe', mapa.getZoom() < zoomCidade() + ML.ZOOM_NUMEROS_CAMADAS);
    }

    // ---- Selo por bairro ----
    let selos = [];
    function agrupar() {
      selos.forEach((m) => m.remove());
      selos = [];
      const pinos = noMapa();
      const ativo = ML.agruparCamadasAtivo({ camadas: estado, zoom: mapa.getZoom(), zoomCidade: zoomCidade(), pinos: pinos.length });
      elemento.classList.toggle('camadas-agrupadas', ativo);
      if (!ativo) return;
      const grupos = ML.agruparPorBairro(pinos.map((p) => {
        const { lat, lng } = p.marker.getLngLat();
        return { camada: p.camada, lat, lng, nivel: p.marker.getElement().dataset.nivel || 'neutro' };
      }));
      selos = grupos.map((g) => {
        const el = elementoDe(ML.htmlSeloBairro(g), 'selo-camadas-wrap');
        el.dataset.selo = g.camadas.map((c) => c.camada).join(',');
        el.title = ML.tituloSeloBairro(g);
        el.setAttribute('aria-label', el.title);
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        const aproximar = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          mapa.flyTo({ center: [g.lng, g.lat], zoom: zoomCidade() + ML.ZOOM_NUMEROS_CAMADAS + 0.2, duration: 800 });
        };
        el.addEventListener('click', aproximar);
        el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') aproximar(ev); });
        // Um pouco abaixo do centro: o grupo de ocorrências do bairro fica no centro.
        return new maplibregl.Marker({ element: el, offset: [0, 30] }).setLngLat([g.lng, g.lat]).addTo(mapa);
      });
    }

    // ---- Pinos sobrepostos: lista do que há ali ----
    let lista = null;
    let repassar = false; // o clique que a própria lista repassa ao pino não abre a lista de novo
    function abrirLista(lngLat, juntos) {
      ctx.fecharPopups();
      const div = elementoDe(`<strong class="sobrepostos-titulo">${juntos.length} pontos neste lugar</strong><ul class="sobrepostos"></ul>`, 'popup popup-sobrepostos');
      const ul = div.querySelector('ul');
      juntos.forEach((p) => {
        const el = p.marker.getElement();
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sobreposto ${el.dataset.nivel || 'neutro'}`;
        b.innerHTML = `<span class="sobreposto-emoji" aria-hidden="true">${ML.EMOJI_CAMADA[p.camada] || '•'}</span><span>${esc(el.title || el.getAttribute('aria-label') || p.camada)}</span>`;
        b.addEventListener('click', () => {
          if (lista) lista.remove();
          if (p.marker.getPopup()) { abrirPopupDoPino(p.marker); return; }
          repassar = true; // pino sem popup próprio (caminhão da coleta): o clique dele abre o que ele sabe
          try { el.click(); } finally { repassar = false; }
        });
        const li = document.createElement('li');
        li.appendChild(b);
        ul.appendChild(li);
      });
      lista = popupSimples('').setDOMContent(div).setLngLat(lngLat).addTo(mapa);
    }
    // Fase de captura: decide antes do pino abrir o próprio popup.
    elemento.addEventListener('click', (ev) => {
      if (repassar || elemento.classList.contains('camadas-agrupadas')) return;
      const el = ev.target.closest && ev.target.closest('.maplibregl-marker[data-camada]');
      if (!el) return;
      const alvo = ctx.pinosDeCamada().find((p) => p.marker.getElement() === el);
      if (!alvo) return;
      const pontos = noMapa().map((p) => { const q = mapa.project(p.marker.getLngLat()); return { x: q.x, y: q.y, p }; });
      const juntos = ML.sobrepostos(mapa.project(alvo.marker.getLngLat()), pontos).map((x) => x.p);
      if (juntos.length < 2) return;
      ev.stopPropagation();
      ev.preventDefault();
      abrirLista(alvo.marker.getLngLat(), juntos);
    }, true);

    function aoMudarCamadas(e) {
      estado = e || {};
      if (destacada && !ligada(destacada)) destacada = null;
      elemento.classList.toggle('camada-destacada', !!destacada);
      atualizarDetalhe();
      agrupar();
      pintarDesenhos();
      pintarPinos();
    }
    mapa.on('zoomend', () => {
      atualizarDetalhe();
      agrupar();
      pintarPinos();
    });

    return {
      api: { destacarCamada },
      montar: pintarDesenhos, // o estilo recarregou (tema): as camadas recriaram os desenhos com o valor original
      aoMudarCamadas,
      fecharPopups() {
        if (lista && lista.isOpen()) lista.remove();
      },
    };
  });
})(window.GC = window.GC || {});
