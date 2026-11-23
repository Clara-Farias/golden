(function (GC) {
  // Camada do mapa · Habitação: ocupações irregulares (vermelho = dentro de área de risco da Defesa Civil) e
  // núcleos de regularização fundiária (REURB). Registrada em GC.camadasMapa: js/map.js chama esta função
  // dentro de GC.criarMapa com o ctx. api entra no objeto do mapa.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function habitacao(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, plural, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;
    if (!GC.habitacao) return { api: { alternarHabitacao() {}, focarHabitacao() {} }, legenda: () => ({ habitacao: false }), fecharPopups() {} };

    const SIT_OCUPACAO = { critica: 'Em área de risco', atencao: 'Crescendo', ok: 'Acompanhada' };
    const SIT_NUCLEO = { critica: 'REURB atrasada', em_dia: 'REURB no prazo', ok: 'REURB concluída' };
    const data = (iso) => iso.split('-').reverse().join('/');
    const mesAno = (iso) => { const [a, m] = iso.split('-'); return `${m}/${a}`; };
    const pl = plural || ((n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`);

    function conteudoOcupacao(x) {
      const motivos = x.motivos.map((m) => `<li class="${m.critico ? 'critico' : ''}">${esc(m.texto)}</li>`).join('');
      return elementoDe(`<span class="sev hab-${x.situacao}">${SIT_OCUPACAO[x.situacao]}</span>
        <h3>🏠 ${esc(x.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(x.bairroId))} · ocupação irregular desde ${mesAno(x.desde)} · terreno ${x.terreno === 'publico' ? 'público' : 'particular'}</div>
        <ul class="hab-numeros">
          <li><b>${x.familias}</b><small>famílias · ${x.domicilios} domicílios</small></li>
          <li><b>${x.crescimentoPct === null ? 'nova' : `${x.crescimentoPct > 0 ? '+' : ''}${x.crescimentoPct}%`}</b><small>famílias em 12 meses</small></li>
        </ul>
        ${motivos ? `<ul class="hab-motivos">${motivos}</ul>` : ''}
        ${x.emRisco ? '<p class="hab-acao">Sugestão: vistoria da Defesa Civil e cadastro das famílias para reassentamento.</p>' : ''}
        ${x.reurbId ? '<p class="hab-nota">Tem processo de regularização (REURB) aberto.</p>' : ''}`, 'popup popup-habitacao');
    }
    function conteudoNucleo(r) {
      const prazo = r.concluido
        ? `Títulos entregues em ${data(r.concluidoEm)}`
        : r.atrasado ? `Etapa atrasada há ${pl(r.diasAtraso, 'dia', 'dias')} (prazo ${data(r.prazoEtapa)})`
          : `Prazo da etapa: ${data(r.prazoEtapa)} (faltam ${pl(r.diasParaPrazo, 'dia', 'dias')})`;
      return elementoDe(`<span class="sev hab-${r.situacao}">${SIT_NUCLEO[r.situacao]}</span>
        <h3>📋 ${esc(r.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(r.bairroId))} · ${esc(r.modalidade)} · ${pl(r.lotes, 'lote', 'lotes')}</div>
        <div class="hab-etapa"><span>${esc(r.etapaNome)}</span><i style="--p:${r.progressoPct}%"></i></div>
        <p class="${r.atrasado ? 'hab-atraso' : 'hab-nota'}">${prazo}</p>
        <p class="hab-nota">Aberto em ${data(r.abertoEm)}.</p>`, 'popup popup-habitacao');
    }

    function pino(html, titulo, conteudo, x) {
      const el = elementoDe(html);
      el.title = titulo;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudo(x)));
      const marker = ctx.marcador({ element: el }).setLngLat([x.lng, x.lat]).setPopup(popup);
      return [x.id, { marker, popup }];
    }
    const r = GC.habitacao.resumo();
    const pinos = new Map([
      ...r.ocupacoes.map((x) => pino(
        `<div class="marcador-equip marcador-habitacao ${x.situacao}">🏠${x.emRisco ? `<b>${x.familias}</b>` : ''}</div>`,
        `${x.nome}: ${SIT_OCUPACAO[x.situacao]} · ${pl(x.familias, 'família', 'famílias')}`, conteudoOcupacao, x)),
      ...r.reurb.map((n) => pino(
        `<div class="marcador-equip marcador-reurb ${n.situacao}">📋</div>`,
        `${n.nome}: ${SIT_NUCLEO[n.situacao]} · ${n.etapaNome}`, conteudoNucleo, n)),
    ]);

    // Em dia somem em "Só o que pede atenção".
    r.ocupacoes.forEach((x) => GC.mapaLogica.marcarEmDia(pinos.get(x.id).marker.getElement(), 'ocupacoes', x.situacao));
    r.reurb.forEach((n) => GC.mapaLogica.marcarEmDia(pinos.get(n.id).marker.getElement(), 'reurb', n.situacao));

    let visiveis = false;
    function alternarHabitacao(visivel) {
      visiveis = !!visivel;
      pinos.forEach((x) => { if (visiveis) x.marker.addTo(mapa); else x.marker.remove(); });
      avisarLegenda();
    }
    function focarHabitacao(id) {
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
      api: { alternarHabitacao, focarHabitacao },
      legenda: () => ({ habitacao: visiveis }),
      fecharPopups() {
        pinos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
