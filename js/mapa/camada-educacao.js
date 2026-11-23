(function (GC) {
  // Camada do mapa · Educação: escolas da rede.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function educacao(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;

    // ======================= Escolas =======================
    // Pino na cor da situação (falta de professor, evasão, frequência, fila); o número é de professores faltando.
    const SIT_ESCOLA = { critica: 'Crítica', atencao: 'Atenção', ok: 'Em dia' };
    function conteudoEscola(x) {
      const pct = (n) => (n === null ? '—' : `${n.toLocaleString('pt-BR')}%`);
      const motivos = x.motivos.map((m) => `<li class="${m.critico ? 'critico' : ''}">${esc(m.texto)}</li>`).join('');
      return elementoDe(`<span class="sev escola-${x.situacao}">${SIT_ESCOLA[x.situacao]}</span>
        <h3>🎓 ${esc(x.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(x.bairroId))} · ${x.tipo === 'cmei' ? 'Educação infantil' : 'Ensino fundamental'}</div>
        <ul class="escola-numeros">
          <li><b>${x.alunos}</b><small>${x.tipo === 'cmei' ? 'crianças' : 'alunos'} · ${x.ocupacaoPct}% da capacidade</small></li>
          <li><b>${x.professores}/${x.necessarios}</b><small>professores · ${x.alunosPorProfessor.toLocaleString('pt-BR')} alunos por professor</small></li>
          <li><b>${x.frequenciaPct}%</b><small>frequência</small></li>
          <li><b>${pct(x.evasaoPct)}</b><small>evasão no ano</small></li>
          ${x.alfabetizacao3anoPct !== null ? `<li><b>${x.alfabetizacao3anoPct}%</b><small>alfabetizados no 3º ano</small></li>` : ''}
          ${x.fila ? `<li><b>${x.fila}</b><small>na fila de espera</small></li>` : ''}
        </ul>
        ${motivos ? `<ul class="escola-motivos">${motivos}</ul>` : ''}`, 'popup popup-escola');
    }
    const escolas = new Map(GC.educacao.resumo().escolas.map((x) => {
      const el = elementoDe(`<div class="marcador-equip marcador-escola ${x.situacao}">🎓${x.faltando ? `<b>-${x.faltando}</b>` : ''}</div>`);
      GC.mapaLogica.marcarEmDia(el, 'escolas', x.situacao);
      el.title = `${x.nome}: ${SIT_ESCOLA[x.situacao]}${x.faltando ? ` · ${x.faltando} ${x.faltando === 1 ? 'professor' : 'professores'} faltando` : ''}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoEscola(x)));
      const marker = ctx.marcador({ element: el }).setLngLat([x.lng, x.lat]).setPopup(popup);
      return [x.id, { marker, popup }];
    }));
    let escolasVisiveis = false;
    function alternarEscolas(visivel) {
      escolasVisiveis = !!visivel;
      escolas.forEach((x) => { if (escolasVisiveis) x.marker.addTo(mapa); else x.marker.remove(); });
      avisarLegenda();
    }
    function focarEscola(id) {
      const x = escolas.get(id);
      if (!x) return;
      if (!escolasVisiveis) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(x.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarEscolas, focarEscola },
      legenda: () => ({ escolas: escolasVisiveis }),
      fecharPopups() {
        escolas.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
