(function (GC) {
  // Camada do mapa · Segurança no trânsito: pontos críticos de acidente (cruzamentos e trechos), com a escola
  // mais próxima quando fica a menos de 300 m. Registrada em GC.camadasMapa: js/map.js chama esta função dentro
  // de GC.criarMapa com o ctx. api entra no objeto do mapa.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function transito(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    let visivel = false;
    const legenda = () => ({ transito: visivel });
    if (!GC.transito) {
      return {
        api: { alternarTransito(v) { visivel = !!v; avisarLegenda(); }, focarTransito() {} },
        legenda,
        fecharPopups() {},
      };
    }

    // Pino na cor da situação; o selo é o número de atropelamentos (quando houve).
    const SIT = { critica: 'Crítico', atencao: 'Atenção', ok: 'Monitorar' };
    const SENTIDO = { subindo: 'subindo', caindo: 'caindo', estavel: 'estável' };
    const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
    function conteudo(x) {
      const t = x.tendencia;
      return elementoDe(`<span class="sev transito-${x.situacao}">${SIT[x.situacao]}</span>
        <h3>🚦 ${esc(x.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(x.bairroId))} · ${x.tipo === 'cruzamento' ? 'Cruzamento' : 'Trecho de via'} · pico ${esc(x.pico)}</div>
        <ul class="transito-numeros">
          <li><b>${x.acidentes}</b><small>acidentes em 12 meses</small></li>
          <li><b>${x.comVitima}</b><small>com vítima · ${x.semVitima} sem vítima</small></li>
          <li class="${x.mortes ? 'grave' : ''}"><b>${x.mortes}</b><small>${x.mortes === 1 ? 'morte' : 'mortes'}</small></li>
          <li class="${x.atropelamentos ? 'grave' : ''}"><b>${x.atropelamentos}</b><small>${x.atropelamentos === 1 ? 'atropelamento' : 'atropelamentos'}</small></li>
        </ul>
        <div class="linha transito-tendencia ${t.sentido}">${t.atual} nos últimos 6 meses, ${t.anterior} nos 6 anteriores (${t.sentido === 'estavel' ? 'estável' : `${sinal(t.variacaoPct)}, ${SENTIDO[t.sentido]}`})</div>
        ${x.escola ? `<div class="linha transito-escola${x.atropelamentos ? ' grave' : ''}">🎓 ${esc(x.escola.nome)} a ${x.escola.distanciaM} m${x.atropelamentos ? ': atropelamentos perto da escola' : ''}</div>` : ''}
        <div class="linha acao">👉 ${esc(x.medida)}</div>`, 'popup popup-transito');
    }
    const pontos = new Map(GC.transito.resumo().pontos.map((x) => {
      const el = elementoDe(`<div class="marcador-equip marcador-transito ${x.situacao}${x.atropelamentoPertoEscola ? ' escola' : ''}">🚦${x.atropelamentos ? `<b>${x.atropelamentos}</b>` : ''}</div>`);
      GC.mapaLogica.marcarEmDia(el, 'transito', x.situacao);
      el.title = `${x.nome}: ${x.acidentes} acidentes em 12 meses${x.atropelamentos ? `, ${x.atropelamentos} ${x.atropelamentos === 1 ? 'atropelamento' : 'atropelamentos'}` : ''}${x.atropelamentoPertoEscola ? ' perto de escola' : ''}`;
      const popup = popupSimples('');
      // Recalcula na abertura: a escola mais próxima pode mudar com os dados da Educação.
      popup.on('open', () => {
        const atual = GC.transito.resumo().pontos.find((y) => y.id === x.id) || x;
        popup.setDOMContent(conteudo(atual));
      });
      const marker = ctx.marcador({ element: el }).setLngLat([x.lng, x.lat]).setPopup(popup);
      return [x.id, { marker, popup }];
    }));
    function alternarTransito(v) {
      visivel = !!v;
      pontos.forEach((x) => { if (visivel) x.marker.addTo(mapa); else x.marker.remove(); });
      avisarLegenda();
    }
    function focarTransito(id) {
      const x = pontos.get(id);
      if (!x) return;
      if (!visivel) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(x.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarTransito, focarTransito },
      legenda,
      fecharPopups() {
        pontos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
