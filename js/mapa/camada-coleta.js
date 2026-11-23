(function (GC) {
  // Camada do mapa · Coleta de lixo: rotas e caminhões.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function coleta(ctx) {
    const { mapa, elementoDe, naGaveta, deCimaDoMapa, encerrarFoco, fecharPopups, marcarFoco, margens, esc, plural, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;

    // ======================= Coleta de lixo (rotas e caminhões) =======================
    // Rota tracejada na cor da situação de hoje (atrasada, em andamento, normal; cinza se não passa hoje) e o
    // caminhão onde está agora (parado, se atrasado). Liga/desliga pelo controle "Coleta de lixo".
    const COR_COLETA = { atrasada: '#dc2626', em_andamento: '#eab308', agendada: '#15803d', concluida: '#15803d', sem_coleta_hoje: '#8fa0a4' };
    const ROTULO_COLETA = { atrasada: 'Atrasada', em_andamento: 'Em andamento', agendada: 'Hoje, mais tarde', concluida: 'Concluída', sem_coleta_hoje: 'Não passa hoje' };
    let coletaVisivel = false;
    const coletaAtual = GC.coleta ? GC.coleta.resumo() : null;
    const trajetosColeta = new Map(coletaAtual ? coletaAtual.rotas.map((x, i) => [x.id, GC.coleta.trajeto(x, GC.data.bairros, i)]) : []);
    const geoColeta = () => ({ type: 'FeatureCollection', features: (coletaAtual ? coletaAtual.rotas : []).map((x) => ({
      type: 'Feature', properties: { id: x.id, status: x.status, tipo: x.tipo },
      geometry: { type: 'LineString', coordinates: trajetosColeta.get(x.id).map(([lat, lng]) => [lng, lat]) },
    })).filter((f) => f.geometry.coordinates.length >= 2) });
    function montarColeta() {
      if (!coletaAtual) return;
      mapa.addSource('coleta', { type: 'geojson', data: geoColeta() });
      mapa.addLayer({ id: 'coleta', type: 'line', source: 'coleta', layout: { visibility: coletaVisivel ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
        ...(ctx.soAtencao() ? { filter: GC.mapaLogica.filtroAtencao('coleta', 'status', true) } : {}),
        paint: {
          'line-color': ['match', ['get', 'status'], ...Object.entries(COR_COLETA).flat(), '#8fa0a4'],
          'line-width': ['match', ['get', 'status'], 'atrasada', 5, 'em_andamento', 4.5, 3],
          'line-dasharray': [2, 1.5],
          'line-opacity': ['match', ['get', 'status'], 'sem_coleta_hoje', 0.55, 0.9],
        } }, 'bairros-rotulo');
    }
    function htmlColeta(x) {
      const esc = GC.escaparHtml;
      const dias = x.dias.map((d) => GC.data.coleta.nomeDia[d]).join(', ');
      const andamento = x.status === 'em_andamento' ? ` · ${x.progressoPct}% do trajeto` : '';
      return `<div class="popup popup-coleta"><span class="sev coleta-${x.status}">${ROTULO_COLETA[x.status]}${andamento}</span>
        <h3>🚛 ${esc(x.nome)}</h3>
        <div class="linha">${x.tipo === 'seletiva' ? 'Coleta seletiva (recicláveis)' : 'Coleta domiciliar'} · ${esc(x.caminhao)}</div>
        <div class="linha">📅 ${esc(dias)} · ${esc(x.horario)}</div>
        <div class="linha">Bairros: ${esc(x.bairros.map(nomeBairro).join(', '))}</div>
        <div class="linha">${x.noPrazoPct}% das coletas no prazo (30 dias)${x.atrasoMedioDias ? ` · atraso médio de ${plural(x.atrasoMedioDias, 'dia', 'dias')}` : ''}</div>
        ${x.motivo ? `<div class="linha obra-alerta">⚠ ${esc(x.motivo)}</div>` : ''}</div>`;
    }
    const popupColeta = new maplibregl.Popup({ offset: 6, maxWidth: '300px', className: 'popup-ocorrencia' });
    popupColeta.on('close', () => encerrarFoco());
    naGaveta(popupColeta);
    function abrirColeta(id, lngLat) {
      const x = coletaAtual && coletaAtual.rotas.find((y) => y.id === id);
      if (!x) return;
      const pts = trajetosColeta.get(id);
      const [lat, lng] = lngLat ? [lngLat.lat, lngLat.lng] : GC.coleta.pontoNoTrajeto(pts, x.status === 'em_andamento' || x.status === 'atrasada' ? x.progressoPct / 100 : 0.5);
      popupColeta.setLngLat([lng, lat]).setHTML(htmlColeta(x)).addTo(mapa);
    }
    mapa.on('click', 'coleta', (e) => { if (!deCimaDoMapa(e) && e.features.length) abrirColeta(e.features[0].properties.id, e.lngLat); });
    mapa.on('mouseenter', 'coleta', () => { mapa.getCanvas().style.cursor = 'pointer'; });
    // Caminhões na rua hoje (em andamento ou parados por atraso), na fração do trajeto já feita.
    const caminhoes = new Map(coletaAtual ? coletaAtual.rotas.filter((x) => x.status === 'em_andamento' || x.status === 'atrasada').map((x) => {
      const [lat, lng] = GC.coleta.pontoNoTrajeto(trajetosColeta.get(x.id), x.progressoPct / 100);
      const el = elementoDe(`<div class="marcador-caminhao ${x.status}">🚛</div>`);
      GC.mapaLogica.marcarEmDia(el, 'coleta', x.status);
      el.title = `${x.caminhao} · ${x.nome}: ${ROTULO_COLETA[x.status]}`;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); fecharPopups(); abrirColeta(x.id); });
      return [x.id, ctx.marcador({ element: el }).setLngLat([lng, lat])];
    }) : []);
    function alternarColeta(visivel) {
      coletaVisivel = !!visivel;
      if (mapa.getLayer('coleta')) mapa.setLayoutProperty('coleta', 'visibility', coletaVisivel ? 'visible' : 'none');
      caminhoes.forEach((m) => { if (coletaVisivel) m.addTo(mapa); else m.remove(); });
      if (!coletaVisivel && popupColeta.isOpen()) popupColeta.remove();
      avisarLegenda();
    }
    // Foco numa rota (enquadra o trajeto) ou num bairro (enquadra o bairro e abre a primeira rota dele).
    function focarColeta(id) {
      alternarColeta(true);
      fecharPopups();
      let rotaId = id;
      if (!trajetosColeta.has(id)) {
        const c = coletaAtual && coletaAtual.calendario.find((b) => b.id === id);
        rotaId = c && c.rotas.find((r) => coletaAtual.rotas.find((x) => x.id === r && x.tipo === 'domiciliar'));
      }
      const pts = rotaId && trajetosColeta.get(rotaId);
      if (!pts) return;
      const lats = pts.map((p) => p[0]);
      const lngs = pts.map((p) => p[1]);
      mapa.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: margens(130), maxZoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => { abrirColeta(rotaId); marcarFoco(); });
    }

    return {
      api: { alternarColeta, focarColeta },
      legenda: () => ({ coleta: coletaVisivel }),
      montar: montarColeta,
      desenhos: ['coleta'],
      // "Só o que pede atenção": ficam as rotas atrasadas e em andamento.
      soAtencao(v) { if (mapa.getLayer('coleta')) mapa.setFilter('coleta', GC.mapaLogica.filtroAtencao('coleta', 'status', v)); },
      fecharPopups() {
        if (popupColeta.isOpen()) popupColeta.remove();
      },
      // Clique sobre esta camada não seleciona o bairro por baixo.
      bloqueiaClique: (ponto) => coletaVisivel && mapa.getLayer('coleta') && mapa.queryRenderedFeatures(ponto, { layers: ['coleta'] }).length > 0,
    };
  });
})(window.GC = window.GC || {});
