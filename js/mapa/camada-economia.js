(function (GC) {
  // Camada do mapa · Economia local: saldo de empresas por bairro e alvarás parados além do prazo.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function economia(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    if (!GC.economia) return { api: { alternarEconomia() {}, focarEconomia() {} }, legenda: () => ({ economia: false }), fecharPopups() {} };

    const r = GC.economia.resumo();
    const sinal = (n) => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;
    const SIT_BAIRRO = { critica: 'Fecha mais do que abre', atencao: 'Fechando mais nos últimos 3 meses', ok: 'Abre mais do que fecha' };
    const SIT_ALVARA = { critica: 'Mais que o dobro do prazo', atencao: 'Fora do prazo' };

    // ---- Bairro: saldo de empresas em 12 meses e emprego com carteira ----
    function conteudoBairro(b) {
      return elementoDe(`<span class="sev eco-${b.situacao}">${SIT_BAIRRO[b.situacao]}</span>
        <h3>📈 ${esc(b.nome)}</h3>
        <div class="linha">Empresas e emprego formal nos últimos 12 meses</div>
        <ul class="eco-numeros">
          <li><b>${b.abertas12}</b><small>empresas abertas</small></li>
          <li><b>${b.fechadas12}</b><small>empresas fechadas</small></li>
          <li><b class="${b.saldo12 < 0 ? 'neg' : 'pos'}">${sinal(b.saldo12)}</b><small>saldo de empresas · no último mês ${sinal(b.saldoMes)}</small></li>
          <li><b class="${b.empregos12 < 0 ? 'neg' : 'pos'}">${sinal(b.empregos12)}</b><small>vagas com carteira · no último mês ${sinal(b.empregosMes)}</small></li>
        </ul>
        <div class="linha">${b.estoque.toLocaleString('pt-BR')} empregos formais no bairro</div>`, 'popup popup-economia');
    }
    // ---- Alvará parado: empresa, etapa que travou, dias na fila ----
    function conteudoAlvara(x) {
      return elementoDe(`<span class="sev eco-${x.situacao}">${SIT_ALVARA[x.situacao]}</span>
        <h3>📑 ${esc(x.nome)}</h3>
        <div class="linha">${esc(x.atividade)} · 📍 ${esc(nomeBairro(x.bairroId))} · ${esc(x.protocolo)}</div>
        <ul class="eco-numeros">
          <li><b class="neg">${x.diasNaFila} dias</b><small>na fila · prazo de ${r.metaDias} dias</small></li>
          <li><b>${x.diasNaEtapa} dias</b><small>parado em ${esc(x.etapaNome)}</small></li>
          <li><b>${x.vagas}</b><small>vagas previstas</small></li>
        </ul>
        <div class="linha eco-pendencia">⏳ ${esc(x.pendencia)}</div>
        <div class="linha">Responde: ${esc(x.responsavel)}</div>`, 'popup popup-economia');
    }

    function marcador(html, titulo, conteudo, lng, lat) {
      const el = elementoDe(html);
      el.title = titulo;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudo()));
      const marker = ctx.marcador({ element: el }).setLngLat([lng, lat]).setPopup(popup);
      return { marker, popup };
    }
    const pinos = new Map();
    r.bairros.forEach((b) => pinos.set(b.id, marcador(
      `<div class="marcador-equip marcador-eco-bairro ${b.situacao}">${b.saldo12 < 0 ? '📉' : '📈'}<b>${sinal(b.saldo12)}</b></div>`,
      `${b.nome}: saldo de ${sinal(b.saldo12)} empresas em 12 meses`, () => conteudoBairro(b), b.lng, b.lat)));
    r.atrasados.forEach((x) => pinos.set(x.id, marcador(
      `<div class="marcador-equip marcador-alvara ${x.situacao}">📑<b>${x.diasNaFila}d</b></div>`,
      `Alvará de ${x.nome}: ${x.diasNaFila} dias na fila, parado em ${x.etapaNome}`, () => conteudoAlvara(x), x.lng, x.lat)));

    // Bairros em dia somem em "Só o que pede atenção" (os alvarás no mapa já são só os atrasados).
    r.bairros.forEach((b) => GC.mapaLogica.marcarEmDia(pinos.get(b.id).marker.getElement(), 'economia', b.situacao));
    r.atrasados.forEach((x) => GC.mapaLogica.marcarEmDia(pinos.get(x.id).marker.getElement(), 'economia', x.situacao));

    let visivel = false;
    function alternarEconomia(v) {
      visivel = !!v;
      pinos.forEach((p) => { if (visivel) p.marker.addTo(mapa); else p.marker.remove(); });
      avisarLegenda();
    }
    // id: alvará (alv-…) ou bairro (eco-<bairro>).
    function focarEconomia(id) {
      const p = pinos.get(id);
      if (!p) return;
      if (!visivel) p.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: p.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(p.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarEconomia, focarEconomia },
      legenda: () => ({ economia: visivel }),
      fecharPopups() {
        pinos.forEach((p) => { if (p.popup.isOpen()) p.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
