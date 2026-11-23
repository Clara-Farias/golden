(function (GC) {
  // Camada do mapa · Frota: linhas de ônibus, garagem e bases do SAMU.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function frota(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, naGaveta, deCimaDoMapa, encerrarFoco, fecharPopups, marcarFoco, margens, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;

    // ======================= Frota (garagem, bases do SAMU e linhas de ônibus) =======================
    // Linhas: traço pelos centros dos bairros, na cor da espera nos pontos; garagem e bases: pino com
    // "operando / necessários". Tudo liga/desliga junto pelo controle "Frota".
    const COR_LINHA = { critica: '#dc2626', atencao: '#eab308', ok: '#2563eb' };
    let frotaVisivel = false;
    let frotaAtual = GC.frota ? GC.frota.resumo() : null;
    function geoLinhas(r) {
      const centro = (id) => (GC.data.bairros.find((b) => b.id === id) || {}).centro;
      return { type: 'FeatureCollection', features: (r ? r.linhas : []).map((x, i) => {
        const desvio = (i - 2.5) * 0.0009; // linhas que passam pelos mesmos bairros não se sobrepõem
        const pts = x.bairros.map(centro).filter(Boolean).map(([lat, lng]) => [lng + desvio, lat + desvio]);
        return { type: 'Feature', properties: { id: x.id, situacao: x.situacao }, geometry: { type: 'LineString', coordinates: pts } };
      }).filter((f) => f.geometry.coordinates.length >= 2) };
    }
    function montarLinhas() {
      if (!frotaAtual) return;
      mapa.addSource('linhas', { type: 'geojson', data: geoLinhas(frotaAtual) });
      mapa.addLayer({ id: 'linhas', type: 'line', source: 'linhas', layout: { visibility: frotaVisivel ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
        ...(ctx.soAtencao() ? { filter: GC.mapaLogica.filtroAtencao('linhas', 'situacao', true) } : {}),
        paint: { 'line-color': ['match', ['get', 'situacao'], 'critica', COR_LINHA.critica, 'atencao', COR_LINHA.atencao, COR_LINHA.ok],
          'line-width': ['match', ['get', 'situacao'], 'critica', 6, 'atencao', 5, 3.5], 'line-opacity': 0.8 } }, 'bairros-rotulo');
    }
    const SIT_LINHA = { critica: 'Espera crítica', atencao: 'Atenção', ok: 'Normal' };
    function htmlLinha(x) {
      const esc = GC.escaparHtml;
      return `<div class="popup popup-linha"><span class="sev linha-${x.situacao}">${SIT_LINHA[x.situacao]}</span>
        <h3>🚌 ${esc(x.nome)}</h3>
        <div class="linha">Espera média nos pontos: <b>${x.esperaMin} min</b> (programado: a cada ${x.intervaloMin} min)</div>
        <div class="linha">${x.viagensPct}% das viagens de hoje cumpridas</div>
        <div class="linha">Passa por ${esc(x.bairros.filter((b, i, a) => a.indexOf(b) === i).map(nomeBairro).join(', '))}</div></div>`;
    }
    const popupLinha = new maplibregl.Popup({ offset: 6, maxWidth: '300px', className: 'popup-ocorrencia' });
    popupLinha.on('close', () => encerrarFoco());
    naGaveta(popupLinha);
    function abrirLinha(id, lngLat) {
      const x = frotaAtual && frotaAtual.linhas.find((y) => y.id === id);
      const f = geoLinhas(frotaAtual).features.find((y) => y.properties.id === id);
      if (!x || !f) return;
      const c = f.geometry.coordinates;
      popupLinha.setLngLat(lngLat || c[Math.floor(c.length / 2)]).setHTML(htmlLinha(x)).addTo(mapa);
    }
    mapa.on('click', 'linhas', (e) => { if (!deCimaDoMapa(e) && e.features.length) abrirLinha(e.features[0].properties.id, e.lngLat); });
    mapa.on('mouseenter', 'linhas', () => { mapa.getCanvas().style.cursor = 'pointer'; });
    
    function conteudoFrota(b) {
      const samu = b.tipo === 'samu';
      const extra = samu
        ? `<div class="linha">⏱ Tempo de resposta: <b>${b.tempoRespostaMin} min</b> · ${b.chamadosHoje} chamados hoje</div>`
        : `<div class="linha">Operadora: ${esc(GC.data.frota.contrato.operadora)} (concessão)</div>`;
      return elementoDe(`<span class="sev frota-${b.disponibilidadePct >= 95 ? 'ok' : b.disponibilidadePct >= 85 ? 'atencao' : 'critica'}">${b.disponibilidadePct}% disponível</span>
        <h3>${samu ? '🚑' : '🚌'} ${esc(b.nome)}</h3>
        <ul class="escola-numeros">
          <li><b>${b.operando}/${b.necessarios}</b><small>${samu ? 'ambulâncias' : 'ônibus'} rodando / necessários</small></li>
          <li><b>${b.corretiva}</b><small>em manutenção corretiva</small></li>
          <li><b>${b.preventiva}</b><small>em preventiva hoje</small></li>
          <li><b>${b.preventivaVencida}</b><small>rodando com preventiva vencida</small></li>
        </ul>${extra}`, 'popup popup-frota');
    }
    const frotaPinos = new Map(frotaAtual ? [...frotaAtual.garagens, ...frotaAtual.bases].map((b) => {
      const sit = b.disponibilidadePct >= 95 ? 'ok' : b.disponibilidadePct >= 85 ? 'atencao' : 'critica';
      const el = elementoDe(`<div class="marcador-frota ${sit}">${b.tipo === 'samu' ? '🚑' : '🚌'}<b>${b.operando}/${b.necessarios}</b></div>`);
      GC.mapaLogica.marcarEmDia(el, 'frota', sit);
      el.title = `${b.nome}: ${b.operando} de ${b.necessarios} rodando`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoFrota(b)));
      return [b.id, { marker: ctx.marcador({ element: el }).setLngLat([b.lng, b.lat]).setPopup(popup), popup }];
    }) : []);
    function alternarFrota(visivel) {
      frotaVisivel = !!visivel;
      if (mapa.getLayer('linhas')) mapa.setLayoutProperty('linhas', 'visibility', frotaVisivel ? 'visible' : 'none');
      frotaPinos.forEach((x) => { if (frotaVisivel) x.marker.addTo(mapa); else x.marker.remove(); });
      if (!frotaVisivel && popupLinha.isOpen()) popupLinha.remove();
      avisarLegenda();
    }
    // Foco numa linha (enquadra o trajeto) ou numa garagem/base (abre o pino).
    function focarFrota(id) {
      alternarFrota(true);
      fecharPopups();
      const pino = frotaPinos.get(id);
      if (pino) {
        mapa.flyTo({ center: pino.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] });
        mapa.once('moveend', () => { if (abrirPopupDoPino(pino.marker)) marcarFoco(); });
        return;
      }
      const f = geoLinhas(frotaAtual).features.find((y) => y.properties.id === id);
      if (!f) return;
      const c = f.geometry.coordinates;
      const lngs = c.map((p) => p[0]);
      const lats = c.map((p) => p[1]);
      mapa.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: margens(120), maxZoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => { abrirLinha(id); marcarFoco(); });
    }

    return {
      api: { alternarFrota, focarFrota },
      legenda: () => ({ frota: frotaVisivel }),
      montar: montarLinhas,
      desenhos: ['linhas'],
      // "Só o que pede atenção": linhas normais somem.
      soAtencao(v) { if (mapa.getLayer('linhas')) mapa.setFilter('linhas', GC.mapaLogica.filtroAtencao('linhas', 'situacao', v)); },
      fecharPopups() {
        frotaPinos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
        if (popupLinha.isOpen()) popupLinha.remove();
      },
      // Clique sobre esta camada não seleciona o bairro por baixo.
      bloqueiaClique: (ponto) => frotaVisivel && mapa.getLayer('linhas') && mapa.queryRenderedFeatures(ponto, { layers: ['linhas'] }).length > 0,
    };
  });
})(window.GC = window.GC || {});
