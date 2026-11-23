(function (GC) {
  // Camada do mapa · Grandes eventos: pino no local e círculo do perímetro, com o plano de operação no popup.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function eventos(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    const r = GC.eventos ? GC.eventos.resumo() : { eventos: [] };

    const SIT = { critica: 'Pede atenção', atencao: 'Plano pendente', ok: 'Plano pronto', realizado: 'Realizado' };
    const SIT_FRENTE = { pronto: 'pronto', pendente: 'pendente', atrasado: 'atrasado' };
    const EMOJI = { mobilidade: '🚌', saude: '🚑', limpeza: '🧹', seguranca: '🛡' };
    const COR = { critica: '#dc2626', atencao: '#eab308', ok: '#15803d', realizado: '#5b6b70' }; // as mesmas de tokens.css (--critica, --media, --positivo, --suave)
    const num = (x) => Number(x).toLocaleString('pt-BR');
    const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

    function quando(e) {
      const datas = e.inicio === e.fim ? dataCurta(e.inicio) : `${dataCurta(e.inicio)} a ${dataCurta(e.fim)}`;
      const rel = e.status === 'em_andamento' ? (e.duracao > 1 ? ` · dia ${e.diaAtual} de ${e.duracao}` : ' · hoje')
        : e.status === 'proximo' ? ` · em ${e.faltamDias} ${e.faltamDias === 1 ? 'dia' : 'dias'}` : '';
      return `${datas}, ${e.horario}${rel}`;
    }
    function publico(e) {
      if (e.desvioPct === null) return `<li><b>${num(e.publicoPrevisto)}</b><small>público previsto</small></li>`;
      const sinal = e.desvioPct > 0 ? '+' : '';
      return `<li><b>${num(e.publicoPrevisto)}</b><small>público previsto${e.parcial && e.duracao > 1 ? ` (${num(e.previstoComparavel)} até hoje)` : ''}</small></li>
        <li class="${e.lotado ? 'acima' : ''}"><b>${num(e.publicoReal)}</b><small>${e.parcial ? 'público até agora' : 'público real'} · ${sinal}${e.desvioPct}%</small></li>`;
    }
    function conteudo(e) {
      const frentes = e.frentes.map((f) => `<li class="${f.situacao}">
          <span>${EMOJI[f.id]} <b>${esc(f.nome)}</b> <i class="ev-sit ${f.situacao}">${SIT_FRENTE[f.situacao]}</i></span>
          <small>${esc(f.textoPrevisto)}${f.textoFeito ? `<br>Feito: ${esc(f.textoFeito)}` : ''}</small></li>`).join('');
      return elementoDe(`<span class="sev evento-${e.situacao}">${SIT[e.situacao]}</span>
        <h3>🎉 ${esc(e.nome)}</h3>
        <div class="linha">📍 ${esc(e.local.nome)} · ${esc(nomeBairro(e.bairroId))}</div>
        <div class="linha">📅 ${esc(quando(e))}</div>
        <ul class="evento-numeros">${publico(e)}</ul>
        <ul class="evento-frentes">${frentes}</ul>`, 'popup popup-evento');
    }

    const pinos = new Map(r.eventos.map((e) => {
      const falta = e.status === 'realizado' ? 0 : e.pendentes.length;
      const el = elementoDe(`<div class="marcador-equip marcador-evento ${e.situacao}">🎉${falta ? `<b>${falta}</b>` : ''}</div>`);
      GC.mapaLogica.marcarEmDia(el, 'eventos', e.situacao);
      el.title = `${e.nome}: ${SIT[e.situacao]}${falta ? ` · ${falta} ${falta === 1 ? 'frente sem ficar pronta' : 'frentes sem ficar prontas'}` : ''}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudo(e)));
      const marker = ctx.marcador({ element: el }).setLngLat([e.lng, e.lat]).setPopup(popup);
      return [e.id, { marker, popup, e }];
    }));

    // Perímetro: círculo de raioM metros em volta do pino, na cor da situação.
    function circulo(e, passos = 40) {
      const dLat = e.raioM / 111320;
      const dLng = e.raioM / (111320 * Math.cos((e.lat * Math.PI) / 180));
      const anel = Array.from({ length: passos + 1 }, (_, i) => {
        const a = (i / passos) * Math.PI * 2;
        return [+(e.lng + Math.cos(a) * dLng).toFixed(6), +(e.lat + Math.sin(a) * dLat).toFixed(6)];
      });
      return { type: 'Feature', properties: { id: e.id, cor: COR[e.situacao], situacao: e.situacao }, geometry: { type: 'Polygon', coordinates: [anel] } };
    }
    const geo = () => ({ type: 'FeatureCollection', features: r.eventos.map((e) => circulo(e)) });
    const CAMADAS = ['eventos-perimetro', 'eventos-perimetro-borda'];
    let visiveis = false;
    function montar() {
      if (!r.eventos.length || mapa.getSource('eventos')) return;
      const vis = visiveis ? 'visible' : 'none';
      const antes = mapa.getLayer('bairros-rotulo') ? 'bairros-rotulo' : undefined;
      mapa.addSource('eventos', { type: 'geojson', data: geo() });
      mapa.addLayer({ id: 'eventos-perimetro', type: 'fill', source: 'eventos', layout: { visibility: vis },
        paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': 0.1 } }, antes);
      mapa.addLayer({ id: 'eventos-perimetro-borda', type: 'line', source: 'eventos', layout: { visibility: vis },
        paint: { 'line-color': ['get', 'cor'], 'line-width': 1.6, 'line-dasharray': [3, 2] } }, antes);
      if (ctx.soAtencao()) filtrar(true);
    }

    // "Só o que pede atenção": o perímetro some junto com o pino em dia.
    function filtrar(v) {
      CAMADAS.forEach((id) => { if (mapa.getLayer(id)) mapa.setFilter(id, GC.mapaLogica.filtroAtencao('eventos', 'situacao', v)); });
    }
    function alternarEventos(visivel) {
      visiveis = !!visivel;
      pinos.forEach((x) => { if (visiveis) x.marker.addTo(mapa); else x.marker.remove(); });
      CAMADAS.forEach((id) => { if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', visiveis ? 'visible' : 'none'); });
      avisarLegenda();
    }
    function focarEvento(id) {
      const x = pinos.get(id);
      if (!x) return;
      if (!visiveis) alternarEventos(true);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(x.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarEventos, focarEvento },
      montar,
      desenhos: CAMADAS,
      soAtencao: filtrar,
      legenda: () => ({ eventos: visiveis }),
      fecharPopups() {
        pinos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
