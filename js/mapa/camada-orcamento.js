(function (GC) {
  // Camada do mapa · Custo e orçamento: quanto do empenhado das secretarias chega a cada bairro (R$ por morador,
  // contra a média da cidade) e as obras que já receberam mais do que fizeram.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function orcamento(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    if (!GC.orcamento || !GC.gestao) return { api: { alternarOrcamento() {}, focarOrcamento() {} }, legenda: () => ({ orcamento: false }), fecharPopups() {} };

    const r = GC.orcamento.resumo();
    const num = (n, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
    const mi = (n) => `R$ ${num(n)} mi`;
    const porHab = (n) => `R$ ${n.toLocaleString('pt-BR')}`;
    const curto = (n) => `${num(n / 1000)} mil`; // R$ por morador no pino: "2,5 mil"
    const FAIXA = { baixo: 'Abaixo da média da cidade', medio: 'Perto da média da cidade', alto: 'Acima da média da cidade' };

    // ---- Bairro: empenhado no ano, R$ por morador e as secretarias que mais gastam ali ----
    function conteudoBairro(b) {
      const dif = Math.round((b.indice - 1) * 100);
      const comparado = dif === 0 ? 'igual à média' : `${Math.abs(dif)}% ${dif < 0 ? 'abaixo' : 'acima'} da média`;
      const areas = b.areas.slice(0, 3).map((a) => `<li><span>${esc(a.nome)}</span><b>${mi(a.mi)}</b></li>`).join('');
      const obras = b.obras
        ? `<div class="linha">🏗 ${b.obras} ${b.obras === 1 ? 'obra' : 'obras'} no bairro: ${mi(b.obrasContratoMi)} contratados, ${mi(b.obrasPagoMi)} pagos</div>`
        : '<div class="linha">Nenhuma obra em andamento no bairro</div>';
      return elementoDe(`<span class="sev orc-${b.faixa}">${FAIXA[b.faixa]}</span>
        <h3>💰 ${esc(b.nome)}</h3>
        <div class="linha">Empenhado pelas secretarias neste ano, sem o que é da cidade toda (sede e administração)</div>
        <ul class="orc-numeros">
          <li><b>${porHab(b.porHab)}</b><small>por morador · ${comparado} (${porHab(r.mediaPorHab)})</small></li>
          <li><b>${mi(b.empenhadoMi)}</b><small>empenhado no bairro · ${b.populacao.toLocaleString('pt-BR')} moradores</small></li>
        </ul>
        <ul class="orc-areas">${areas}</ul>
        ${obras}`, 'popup popup-orcamento');
    }
    // ---- Obra paga à frente do que foi feito ----
    function conteudoObra(o) {
      return elementoDe(`<span class="sev orc-alerta">Pago à frente do feito</span>
        <h3>🏗 ${esc(o.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(o.bairroId))} · ${esc(o.empresa)}</div>
        <ul class="orc-numeros">
          <li><b class="neg">${o.gastoPct}% pago</b><small>${mi(o.gastoMi)} de ${mi(o.contratoMi)}</small></li>
          <li><b>${o.avancoPct}% feito</b><small>${o.difPp} pontos de diferença</small></li>
        </ul>
        <div class="linha orc-destaque">Cerca de ${mi(o.aFrenteMi)} pagos além do que a obra andou: vale conferir a medição.</div>`, 'popup popup-orcamento');
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
    r.noMapa.forEach((b) => pinos.set(b.id, marcador(
      `<div class="marcador-equip marcador-orc-bairro ${b.faixa}">💰<b>${curto(b.porHab)}</b></div>`,
      `${b.nome}: ${porHab(b.porHab)} por morador (${FAIXA[b.faixa].toLowerCase()})`, () => conteudoBairro(b), b.lng, b.lat)));
    r.pagoAFrente.forEach((o) => pinos.set(o.id, marcador(
      `<div class="marcador-equip marcador-orc-obra">🏗<b>+${o.difPp}</b></div>`,
      `${o.nome}: ${o.gastoPct}% pago com ${o.avancoPct}% feito`, () => conteudoObra(o), o.lng, o.lat)));

    let visivel = false;
    function alternarOrcamento(v) {
      visivel = !!v;
      pinos.forEach((p) => { if (visivel) p.marker.addTo(mapa); else p.marker.remove(); });
      avisarLegenda();
    }
    // id: bairro (orc-<bairro>) ou obra paga à frente (orc-obra-<obra>).
    function focarOrcamento(id) {
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
      api: { alternarOrcamento, focarOrcamento },
      legenda: () => ({ orcamento: visivel }),
      fecharPopups() {
        pinos.forEach((p) => { if (p.popup.isOpen()) p.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
