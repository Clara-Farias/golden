(function (GC) {
  // Camada do mapa · Manutenção de prédios públicos: chamados abertos e vistorias de cada prédio.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa. Os prédios são os mesmos das camadas de escolas e
  // de saúde: o pino fica um pouco deslocado para não cobrir o pino da escola ou da UBS.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function predios(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    if (!GC.predios) return { api: { alternarPredios() {}, focarPredio() {} }, legenda: () => ({ predios: false }), fecharPopups() {} };

    const SIT = { critica: 'Crítica', atencao: 'Atenção', ok: 'Em dia' };
    const GRAV = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
    const VIS = { vencida: 'vencida', a_vencer: 'a vencer', ok: 'em dia' };
    const dataBR = (iso) => iso.split('-').reverse().join('/');
    const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

    function conteudo(p) {
      const chamados = p.chamados.map((x) => `<li class="${x.gravidade}">
          <span class="predio-grav ${x.gravidade}">${GRAV[x.gravidade]}</span>
          <span>${esc(x.titulo)}<small>${esc(x.tipoNome)} · aberto há ${dias(x.diasAberto)}${x.atrasado ? ` · <b>passou do prazo de ${dias(x.prazoDias)}</b>` : ''}</small></span></li>`).join('');
      const vistorias = p.vistorias.map((v) => `<li class="${v.situacao}"><span>${esc(v.nome)}</span>
          <small>${v.situacao === 'vencida' ? `venceu em ${dataBR(v.validade)}` : `vale até ${dataBR(v.validade)}`} · ${VIS[v.situacao]}</small></li>`).join('');
      return elementoDe(`<span class="sev predio-${p.situacao}">${SIT[p.situacao]}</span>
        <h3>🔧 ${esc(p.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(p.bairroId))} · usado por ${esc(p.pastaNome)} · manutenção da Infraestrutura</div>
        <h4 class="predio-tit">Chamados abertos</h4>
        ${chamados ? `<ul class="predio-chamados">${chamados}</ul>` : '<p class="predio-vazio">Nenhum chamado aberto.</p>'}
        <h4 class="predio-tit">Vistorias</h4>
        <ul class="predio-vistorias">${vistorias}</ul>`, 'popup popup-predio');
    }

    const titulo = (p) => `${p.nome}: ${SIT[p.situacao]}${p.chamados.length ? ` · ${p.chamados.length} ${p.chamados.length === 1 ? 'chamado aberto' : 'chamados abertos'}` : ''}${p.vencidas.length ? ` · ${p.vencidas.length} ${p.vencidas.length === 1 ? 'vistoria vencida' : 'vistorias vencidas'}` : ''}`;
    const pinos = new Map(GC.predios.resumo().predios.map((p) => {
      const n = p.chamados.length + p.vencidas.length;
      const el = elementoDe(`<div class="marcador-equip marcador-predio ${p.situacao}">🔧${n ? `<b>${n}</b>` : ''}</div>`);
      GC.mapaLogica.marcarEmDia(el, 'predios', p.situacao);
      el.title = titulo(p);
      const popup = popupSimples('');
      // Lê o prédio de novo ao abrir: dias em aberto e validade das vistorias andam com o relógio.
      popup.on('open', () => {
        const atual = GC.predios.resumo().predios.find((x) => x.id === p.id) || p;
        popup.setDOMContent(conteudo(atual));
      });
      // Prédio de outra camada (escola, UBS, hospital): pino deslocado para o lado do pino de lá.
      const marker = ctx.marcador({ element: el, offset: p.camada ? [16, -16] : [0, 0] }).setLngLat([p.lng, p.lat]).setPopup(popup);
      return [p.id, { marker, popup }];
    }));

    let visiveis = false;
    function alternarPredios(visivel) {
      visiveis = !!visivel;
      pinos.forEach((x) => { if (visiveis) x.marker.addTo(mapa); else x.marker.remove(); });
      avisarLegenda();
    }
    function focarPredio(id) {
      const x = pinos.get(id);
      if (!x) return;
      if (!visiveis) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(x.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarPredios, focarPredio },
      legenda: () => ({ predios: visiveis }),
      fecharPopups() {
        pinos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
