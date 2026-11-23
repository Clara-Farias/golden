(function (GC) {
  // Camada do mapa · Risco climático: áreas da Defesa Civil × chuva prevista.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function risco(ctx) {
    const { mapa, naGaveta, deCimaDoMapa, encerrarFoco, fecharPopups, marcarFoco, margens, avisarLegenda, esc, ZOOM_FOCO } = ctx;
    const ML = GC.mapaLogica;

    // Áreas de risco da Defesa Civil × chuva prevista: polígono na cor do nível (vermelho = risco em até 6 h),
    // contorno tracejado se já atingida. Liga/desliga pelo controle do mapa; clique abre o detalhe.
    const COR_RISCO = ML.COR_RISCO;
    const ROTULO_NIVEL = { alto: 'Risco alto', medio: 'Risco médio', baixo: 'Risco baixo' };
    let riscoVisivel = false;
    let riscoAtual = GC.risco ? GC.risco.resumo() : null;
    const geoRisco = (r) => ({ type: 'FeatureCollection', features: (r ? r.areas : []).map((a) => ({
      type: 'Feature',
      properties: { id: a.id, nivel: a.nivel, atingida: a.atingida },
      geometry: { type: 'Polygon', coordinates: [[...a.poligono, a.poligono[0]].map(([lat, lng]) => [lng, lat])] },
    })) });
    function montarRisco() {
      if (!riscoAtual) return;
      const vis = riscoVisivel ? 'visible' : 'none';
      const cor = ['match', ['get', 'nivel'], 'alto', COR_RISCO.alto, 'medio', COR_RISCO.medio, COR_RISCO.baixo];
      mapa.addSource('risco', { type: 'geojson', data: geoRisco(riscoAtual), promoteId: 'id' });
      mapa.addLayer({ id: 'risco-preenchimento', type: 'fill', source: 'risco', layout: { visibility: vis },
        paint: { 'fill-color': cor, 'fill-opacity': ['match', ['get', 'nivel'], 'alto', 0.22, 'medio', 0.18, 0.12] } }, 'bairros-rotulo');
      // Hachura a 16° por cima da cor (manual, Acessibilidade): a área se lê sem depender da cor.
      if (GC.grafismo) {
        Object.entries({ alto: COR_RISCO.alto, medio: '#17262b', baixo: COR_RISCO.baixo }).forEach(([k, c]) => {
          const nome = `ga-hachura-${k}`;
          if (!mapa.hasImage(nome)) { const img = GC.grafismo.hachuraImagem(c); if (img) mapa.addImage(nome, { width: img.width, height: img.height, data: img.data }, { pixelRatio: img.pixelRatio }); }
        });
        mapa.addLayer({ id: 'risco-hachura', type: 'fill', source: 'risco', layout: { visibility: vis },
          paint: { 'fill-pattern': ['match', ['get', 'nivel'], 'alto', 'ga-hachura-alto', 'medio', 'ga-hachura-medio', 'ga-hachura-baixo'] } }, 'bairros-rotulo');
      }
      mapa.addLayer({ id: 'risco-contorno', type: 'line', source: 'risco', layout: { visibility: vis },
        paint: { 'line-color': cor, 'line-width': ['case', ['get', 'atingida'], 3, 1.8] } }, 'bairros-rotulo');
      if (ctx.soAtencao()) filtrarRisco(true);
    }
    const CAMADAS_RISCO = ['risco-preenchimento', 'risco-hachura', 'risco-contorno'];
    function filtrarRisco(v) {
      CAMADAS_RISCO.forEach((id) => { if (mapa.getLayer(id)) mapa.setFilter(id, ML.filtroAtencao('risco', 'nivel', v)); });
    }
    function htmlRisco(a) {
      const esc = GC.escaparHtml;
      const p = riscoAtual.previsao;
      const quando = a.horasAte === null ? 'a chuva prevista não chega ao limiar em 24 h' : `chuva passa do limiar em ~${a.horasAte} h`;
      const base = a.tipo === 'deslizamento' ? ` (já choveu ${p.acumulado72h} mm em 72 h)` : '';
      return `<div class="popup popup-risco"><span class="sev risco-${a.nivel}">${ROTULO_NIVEL[a.nivel]}</span>
        <h3>${a.tipo === 'deslizamento' ? '⛰' : '🌧'} ${esc(a.nome)}</h3>
        <div class="linha">${a.tipo === 'deslizamento' ? 'Deslizamento' : 'Alagamento'} · ${esc(quando)}</div>
        <div class="linha">Limiar ${a.limiarMm} mm${esc(base)} · previsão 24 h: ${p.janelas[p.janelas.length - 1].mm} mm</div>
        <div class="linha">👥 ${a.familias} famílias na área${a.atingida ? ' · <b class="risco-atingida">🚨 já atingida agora</b>' : ''}</div>
        <div class="linha acao">👉 ${esc(a.acao)}</div></div>`;
    }
    const popupRisco = new maplibregl.Popup({ offset: 6, maxWidth: '300px', className: 'popup-ocorrencia' });
    popupRisco.on('close', () => encerrarFoco());
    naGaveta(popupRisco);
    function abrirRisco(id, lngLat) {
      const a = riscoAtual && riscoAtual.areas.find((x) => x.id === id);
      if (!a) return;
      const centro = lngLat || [a.poligono.reduce((s, q) => s + q[1], 0) / a.poligono.length, a.poligono.reduce((s, q) => s + q[0], 0) / a.poligono.length];
      popupRisco.setLngLat(centro).setHTML(htmlRisco(a)).addTo(mapa);
    }
    mapa.on('click', 'risco-preenchimento', (e) => {
      if (deCimaDoMapa(e) || !e.features.length) return;
      abrirRisco(e.features[0].properties.id, e.lngLat);
    });
    mapa.on('mouseenter', 'risco-preenchimento', () => { mapa.getCanvas().style.cursor = 'pointer'; });
    function alternarRisco(visivel) {
      riscoVisivel = !!visivel;
      ['risco-preenchimento', 'risco-hachura', 'risco-contorno'].forEach((id) => {
        if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', riscoVisivel ? 'visible' : 'none');
      });
      if (!riscoVisivel && popupRisco.isOpen()) popupRisco.remove();
      avisarLegenda();
    }
    // O app recalcula a cada mudança (ocorrência resolvida deixa de "atingir" a área).
    function atualizarRisco(r) {
      riscoAtual = r;
      const f = mapa.getSource('risco');
      if (f) f.setData(geoRisco(r));
    }
    function focarRisco(id) {
      const a = riscoAtual && riscoAtual.areas.find((x) => x.id === id);
      if (!a) return;
      alternarRisco(true);
      fecharPopups();
      mapa.fitBounds(ML.limites([a]), { padding: margens(120), maxZoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => { abrirRisco(id); marcarFoco(); });
    }

    return {
      api: { alternarRisco, atualizarRisco, focarRisco },
      montar: montarRisco,
      desenhos: CAMADAS_RISCO,
      // "Só o que pede atenção": áreas de risco baixo somem.
      soAtencao: filtrarRisco,
      fecharPopups() {
        if (popupRisco.isOpen()) popupRisco.remove();
      },
      // Clique sobre esta camada não seleciona o bairro por baixo.
      bloqueiaClique: (ponto) => riscoVisivel && mapa.getLayer('risco-preenchimento') && mapa.queryRenderedFeatures(ponto, { layers: ['risco-preenchimento'] }).length > 0,
      legenda: () => ({ risco: riscoVisivel }),
    };
  });
})(window.GC = window.GC || {});
