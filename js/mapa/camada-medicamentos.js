(function (GC) {
  // Camada do mapa · Medicamentos: farmácias das UBS.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function medicamentos(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;

    // ======================= Farmácias das UBS (estoque de medicamentos) =======================
    // Pino na cor da pior situação do estoque; o número é de itens em falta. O popup lista o que falta, o que
    // está acabando (dias de cobertura com o consumo previsto pela IA) e o remanejamento sugerido.
    const SIT_FARMACIA = { critica: 'Medicamento em falta', atencao: 'Estoque baixo', ok: 'Estoque em dia' };
    function conteudoFarmacia(f) {
      const r = GC.medicamentos.resumo();
      const linha = (x) => `<li class="${x.situacao}"><span>${esc(x.nome)}</span><b>${x.situacao === 'ruptura' ? 'em falta' : `${x.dias.toLocaleString('pt-BR')} dias`}</b></li>`;
      const alerta = [...f.rupturas, ...f.criticos];
      const chega = r.remanejamentos.filter((x) => x.paraId === f.id).map((x) => `<div class="linha">🔄 Remanejar ${x.qtd.toLocaleString('pt-BR')} (${esc(x.apresentacao)}) de ${esc(x.medicamento)} da ${esc(x.de)}</div>`).join('');
      const sai = r.remanejamentos.filter((x) => x.deId === f.id).map((x) => `<div class="linha">🔄 Pode ceder ${x.qtd.toLocaleString('pt-BR')} de ${esc(x.medicamento)} para a ${esc(x.para)}</div>`).join('');
      return elementoDe(`<span class="sev farmacia-${f.situacao}">${SIT_FARMACIA[f.situacao]}</span>
        <h3>💊 Farmácia da ${esc(f.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(f.bairroId))} · ${f.itens.length} itens da lista municipal</div>
        ${alerta.length ? `<ul class="farmacia-itens">${alerta.map(linha).join('')}</ul>` : '<div class="linha">Todos os itens com mais de 7 dias de estoque.</div>'}
        ${chega}${sai}`, 'popup popup-farmacia');
    }
    const farmacias = new Map(GC.medicamentos ? GC.medicamentos.resumo().farmacias.filter((f) => f.lat !== null).map((f) => {
      const el = elementoDe(`<div class="marcador-farmacia ${f.situacao}">💊${f.rupturas.length ? `<b>${f.rupturas.length}</b>` : ''}</div>`);
      GC.mapaLogica.marcarEmDia(el, 'farmacias', f.situacao);
      el.title = `Farmácia da ${f.nome}: ${SIT_FARMACIA[f.situacao]}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoFarmacia(f)));
      return [f.id, { marker: ctx.marcador({ element: el }).setLngLat([f.lng, f.lat]).setPopup(popup), popup }];
    }) : []);
    let farmaciasVisiveis = false;
    function alternarFarmacias(visivel) {
      farmaciasVisiveis = !!visivel;
      farmacias.forEach((x) => { if (farmaciasVisiveis) x.marker.addTo(mapa); else x.marker.remove(); });
      avisarLegenda();
    }
    function focarFarmacia(id) {
      const x = farmacias.get(id);
      if (!x) return;
      if (!farmaciasVisiveis) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => { if (abrirPopupDoPino(x.marker)) marcarFoco(); });
    }

    return {
      api: { alternarFarmacias, focarFarmacia },
      legenda: () => ({ farmacias: farmaciasVisiveis }),
      fecharPopups() {
        farmacias.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
