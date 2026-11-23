(function (GC) {
  // Camada do mapa · Obras: pinos por situação, filtráveis por setor.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function obras(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;

    // ======================= Obras =======================
    // Pino de capacete na cor da situação (paralisada, atrasada, em dia, concluída). Liga/desliga pelo
    // controle do mapa; o widget de obras filtra por setor.
    const SIT_OBRA = { paralisada: 'Paralisada', atrasada: 'Atrasada', em_dia: 'No prazo', concluida: 'Concluída' };
    const dataBR = (iso) => iso.split('-').reverse().join('/');
    const mi = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
    function conteudoObra(ob) {
      const setor = GC.data.obras.setores.find((s) => s.id === ob.setor);
      const atraso = ob.diasAtraso ? ` · <b class="obra-atraso">${ob.diasAtraso} dias de atraso</b>` : '';
      const parada = ob.situacao === 'paralisada' ? `<div class="linha obra-alerta">⏸ Sem avanço há ${ob.semAvancoDias} dias</div>` : '';
      const gasto = ob.gastoAFrente ? `<div class="linha obra-alerta">💰 Pago ${ob.gastoPct}% do contrato com ${ob.avancoPct}% da obra feita</div>` : '';
      return elementoDe(`<span class="sev obra-${ob.situacao}">${SIT_OBRA[ob.situacao]}</span>
        <h3>🏗 ${esc(ob.nome)}</h3>
        <div class="linha">${setor.emoji} ${esc(setor.nome)} · 📍 ${esc(nomeBairro(ob.bairroId))} · ${esc(ob.empresa)}</div>
        <ul class="obra-barras">
          <li><span>Obra feita</span><i style="--v:${ob.avancoPct}%"></i><b>${ob.avancoPct}%</b></li>
          <li><span>Pago</span><i class="pago" style="--v:${Math.min(ob.gastoPct, 100)}%"></i><b>${ob.gastoPct}%</b></li>
        </ul>
        <div class="linha">Contrato ${mi(ob.contratoMi)} · pago ${mi(ob.gastoMi)}</div>
        <div class="linha">Início ${dataBR(ob.inicio)} · ${ob.diasEmAndamento} dias ${ob.situacao === 'concluida' ? 'de obra' : 'em andamento'}</div>
        <div class="linha">Previsão ${dataBR(ob.previsaoOriginal)}${ob.previsaoAtual !== ob.previsaoOriginal ? ` → ${ob.situacao === 'concluida' ? 'entregue' : 'agora'} ${dataBR(ob.previsaoAtual)}` : ''}${atraso}</div>
        ${parada}${gasto}`, 'popup popup-obra');
    }
    // Pino e popup leem a obra de "atual": ao vivo, a de hoje; na linha do tempo, a do dia escolhido
    // (avanço e situação daquele dia; a obra que ainda não tinha começado sai do mapa).
    const atual = new Map(GC.obras.resumo().obras.map((ob) => [ob.id, ob]));
    function pintarPino(el, ob) {
      GC.mapaLogica.marcarEmDia(el, 'obras', ob.situacao); // some em "Só o que pede atenção"
      el.innerHTML = `<div class="marcador-equip marcador-obra ${ob.situacao}">🏗</div>`;
      el.title = `${ob.nome}: ${SIT_OBRA[ob.situacao]}${ob.diasAtraso ? ` · ${ob.diasAtraso} dias de atraso` : ''}`;
      el.setAttribute('aria-label', 'Obra: ' + el.title);
    }
    const obras = new Map([...atual.values()].map((ob) => {
      const el = elementoDe('');
      pintarPino(el, ob);
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoObra(atual.get(ob.id))));
      const marker = ctx.marcador({ element: el }).setLngLat([ob.lng, ob.lat]).setPopup(popup);
      return [ob.id, { marker, popup, setor: ob.setor, el }];
    }));
    let obrasVisiveis = false;
    let setorObras = null;
    function pintarObras() {
      obras.forEach((ob, id) => {
        if (obrasVisiveis && atual.has(id) && (!setorObras || ob.setor === setorObras)) ob.marker.addTo(mapa);
        else ob.marker.remove();
      });
    }
    let diaDasObras = null;
    function noInstante(t) {
      const dia = t === null ? null : GC.inicioDoDia(t);
      if (dia === diaDasObras) return;
      diaDasObras = dia;
      const lista = dia === null ? GC.obras.resumo().obras : GC.obrasEm(t).obras;
      atual.clear();
      lista.forEach((ob) => {
        atual.set(ob.id, ob);
        const o = obras.get(ob.id);
        if (!o) return;
        pintarPino(o.el, ob);
        if (o.popup.isOpen()) o.popup.setDOMContent(conteudoObra(ob));
      });
      obras.forEach((o, id) => { if (!atual.has(id) && o.popup.isOpen()) o.popup.remove(); });
      pintarObras();
    }
    function alternarObras(visivel) { obrasVisiveis = !!visivel; pintarObras(); avisarLegenda(); }
    function filtrarObras(setor) { setorObras = setor || null; pintarObras(); }
    function focarObra(id) {
      const ob = obras.get(id);
      if (!ob) return;
      if (!ob.marker._map) ob.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: ob.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(ob.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarObras, filtrarObras, focarObra },
      legenda: () => ({ obras: obrasVisiveis }),
      noInstante,
      fecharPopups() {
        obras.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
