(function (GC) {
  // Camada do mapa · Vigilância em Saúde: pontos estratégicos do Aedes e chamados de zoonoses.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function vigilancia(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    if (!GC.vigilancia) return { api: { alternarVigilancia() {}, focarVigilancia() {} }, legenda: () => ({ vigilancia: false }), fecharPopups() {} };

    // Pino na cor da situação: vermelho = foco ativo ou chamado esperando equipe; amarelo = em andamento; verde = resolvido.
    // O número no selo é de depósitos com larva na última visita (só nos focos ativos).
    const quando = (n) => (n === 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`);
    function conteudo(p) {
      const aedes = p.grupo === 'aedes';
      return elementoDe(`<span class="sev vigilancia-${p.classe}">${esc(p.rotuloSituacao)}</span>
        <h3>${aedes ? '🦟' : '🐾'} ${esc(p.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(p.bairroId))} · ${esc(p.rotuloTipo)}</div>
        <ul class="vigilancia-numeros">
          ${aedes
            ? `<li><b>${p.depositos}</b><small>${p.depositos === 1 ? 'depósito com larva' : 'depósitos com larva'}</small></li>
               <li><b>${quando(p.dias)}</b><small>última visita</small></li>`
            : `<li><b>${quando(p.dias)}</b><small>chamado aberto</small></li>
               <li><b>CCZ</b><small>Controle de Zoonoses</small></li>`}
        </ul>
        <p class="vigilancia-nota">${esc(p.nota)}</p>`, 'popup popup-vigilancia');
    }

    const pinos = new Map(GC.vigilancia.resumo().pontos.map((p) => {
      const selo = p.situacao === 'foco' && p.depositos ? `<b>${p.depositos}</b>` : '';
      const el = elementoDe(`<div class="marcador-equip marcador-vigilancia ${p.grupo} ${p.classe}">${p.grupo === 'aedes' ? '🦟' : '🐾'}${selo}</div>`);
      GC.mapaLogica.marcarEmDia(el, 'vigilancia', p.classe);
      el.title = `${p.nome}: ${p.rotuloSituacao}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudo(p)));
      const marker = ctx.marcador({ element: el }).setLngLat([p.lng, p.lat]).setPopup(popup);
      return [p.id, { marker, popup }];
    }));

    let visivel = false;
    function alternarVigilancia(v) {
      visivel = !!v;
      pinos.forEach((x) => { if (visivel) x.marker.addTo(mapa); else x.marker.remove(); });
      avisarLegenda();
    }
    function focarVigilancia(id) {
      const x = pinos.get(id);
      if (!x) return;
      if (!visivel) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(x.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarVigilancia, focarVigilancia },
      legenda: () => ({ vigilancia: visivel }),
      fecharPopups() {
        pinos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
