(function (GC) {
  // Camada do mapa · Segurança: mapa de calor dos B.O.s (30 dias).
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function seguranca(ctx) {
    const { mapa, avisarLegenda } = ctx;
    const ML = GC.mapaLogica;

    // Calor dos B.O.s (30 dias): camada fixa do prefeito, liga/desliga pelo controle do mapa. Fica sob a
    // camada da IA e usa as mesmas cores; montada de novo se o estilo trocar (reserva).
    let calorBOVisivel = false;
    // Linha do tempo: o calor dos 30 dias até o instante (null = os 30 dias até hoje). Recalcula de hora em
    // hora do instante: tocar o dia não refaz a fonte 12 vezes por segundo.
    let horaDoCalor = null;
    const pontos = () => (horaDoCalor === null ? GC.seguranca.pontosCalor() : GC.seguranca.pontosCalor(GC.boEm(horaDoCalor, GC.agora()).porBairro30d));
    function noInstante(t) {
      const hora = t === null ? null : Math.floor(t / 3600000) * 3600000;
      if (hora === horaDoCalor) return;
      horaDoCalor = hora;
      const fonte = mapa.getSource && mapa.getSource('calor-bo');
      if (fonte) fonte.setData(ML.geoCalor(pontos()));
    }
    function montarCalorBO() {
      if (!GC.seguranca) return;
      mapa.addSource('calor-bo', { type: 'geojson', data: ML.geoCalor(pontos()) });
      mapa.addLayer({ id: 'calor-bo', type: 'heatmap', source: 'calor-bo', layout: { visibility: calorBOVisivel ? 'visible' : 'none' }, paint: {
        'heatmap-weight': ['get', 'peso'],
        // Calibrado para o Centro (92 B.O.s) chegar ao vermelho e o Alto da Serra (20) ficar azul.
        // Com zoom, o raio cresce (a mancha não vira pontinhos) e a intensidade cai (não satura tudo de vermelho).
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 12, 2.2, 15, 0.7],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 42, 15, 80],
        'heatmap-opacity': 0.6,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, ML.CALOR_TRANSPARENTE, ...ML.paradasCalor().flat()],
      } }, 'bairros-contorno');
    }
    function alternarCalorBO(visivel) {
      calorBOVisivel = !!visivel;
      if (mapa.getLayer('calor-bo')) mapa.setLayoutProperty('calor-bo', 'visibility', calorBOVisivel ? 'visible' : 'none');
      avisarLegenda();
    }

    return {
      api: { alternarCalorBO },
      montar: montarCalorBO,
      desenhos: ['calor-bo'], // esmaece quando outra camada é destacada (js/mapa/varias-camadas.js)
      noInstante,
      legenda: () => ({ calorBO: calorBOVisivel }),
    };
  });
})(window.GC = window.GC || {});
