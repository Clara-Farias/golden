(function (GC) {
  // Camada do mapa · Leitos: hospitais e UPAs.
  // Registrada em GC.camadasMapa: js/map.js chama esta função dentro de GC.criarMapa com o ctx (o mapa e os
  // ajudantes de popup e foco). api entra no objeto do mapa; montar roda a cada estilo carregado.
  GC.camadasMapa = GC.camadasMapa || [];
  GC.camadasMapa.push(function leitos(ctx) {
    const { mapa, abrirPopupDoPino, elementoDe, popupSimples, fecharPopups, marcarFoco, soltarFoco, aoDetalhar, esc, nomeBairro, ZOOM_FOCO, avisarLegenda } = ctx;

    // ======================= Leitos (hospitais e UPAs) =======================
    // Pino com a ocupação (a pior entre geral e UTI), na cor da situação. Liga/desliga pelo controle do mapa.
    const SIT_LEITO = { critica: 'Crítica', atencao: 'Atenção', ok: 'Folga' };
    function conteudoLeito(u) {
      const div = elementoDe('', 'popup popup-leito');
      const barras = u.grupos.map((x) => {
        const p = Math.round((x.ocupados / x.total) * 100);
        return `<li><span>${esc(x.rotulo)}</span><i class="${GC.leitos.situacao(p)}" style="--v:${p}%"></i><b>${x.ocupados}/${x.total}</b></li>`;
      }).join('');
      const tipos = Object.entries(u.atendimentosHoje).map(([t, n]) => `${esc(t)} ${n}`).join(' · ');
      div.innerHTML = `<span class="sev leito-${u.situacao}">${SIT_LEITO[u.situacao]}</span>
        <h3>${u.tipo === 'upa' ? '🚑' : '🏥'} ${esc(u.nome)}</h3>
        <div class="linha">📍 ${esc(nomeBairro(u.bairroId))} · <b>${u.pct}%</b> ocupado · ${u.livres} leitos livres</div>
        <ul class="leito-grupos">${barras}</ul>
        <div class="linha">🩺 ${u.atendimentos} atendimentos ${instante === null ? 'hoje' : `no dia até ${GC.rotuloHora(instante)}`} · ${tipos}</div>`;
      if (u.ocorrenciaId && aoDetalhar && instante === null) {
        const b = document.createElement('button');
        b.className = 'btn-detalhes';
        b.textContent = 'Ver alerta →';
        b.onclick = (e) => {
          e.stopPropagation();
          soltarFoco(); // o foco passa para a gaveta
          fecharPopups();
          setTimeout(() => aoDetalhar(u.ocorrenciaId));
        };
        div.appendChild(b);
      }
      return div;
    }
    // Pino e popup leem a unidade de "atual": ao vivo, a de hoje; na linha do tempo, a do instante (noInstante).
    let instante = null;
    const atual = new Map(GC.leitos.resumo().unidades.map((u) => [u.id, u]));
    function pintarPino(el, u) {
      GC.mapaLogica.marcarEmDia(el, 'leitos', u.situacao); // some em "Só o que pede atenção"
      el.innerHTML = `<div class="marcador-equip marcador-leito ${u.situacao}"><span>${u.tipo === 'upa' ? '🚑' : '🏥'}</span><b>${Math.max(u.pct, u.utiPct || 0)}%</b></div>`;
      const quando = instante === null ? '' : ` (às ${GC.rotuloHora(instante)} do dia escolhido)`;
      el.title = `${u.nome}: ${u.pct}% dos leitos ocupados${u.utiPct !== null ? ` · UTI ${u.utiPct}%` : ''}${quando}`;
      el.setAttribute('aria-label', el.title);
    }
    const leitos = new Map([...atual.values()].map((u) => {
      const el = elementoDe('');
      pintarPino(el, u);
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoLeito(atual.get(u.id))));
      const marker = ctx.marcador({ element: el }).setLngLat([u.lng, u.lat]).setPopup(popup);
      return [u.id, { marker, popup, el }];
    }));
    // Linha do tempo: a ocupação no instante t (null = a de hoje). O popup aberto acompanha.
    function noInstante(t) {
      if (t === instante) return;
      instante = t;
      const r = t === null ? GC.leitos.resumo() : GC.leitosEm(t, GC.agora());
      r.unidades.forEach((u) => {
        atual.set(u.id, u);
        const l = leitos.get(u.id);
        if (!l) return;
        pintarPino(l.el, u);
        if (l.popup.isOpen()) l.popup.setDOMContent(conteudoLeito(u));
      });
    }
    let leitosVisiveis = false;
    function alternarLeitos(visivel) {
      leitosVisiveis = !!visivel;
      leitos.forEach((l) => { if (leitosVisiveis) l.marker.addTo(mapa); else l.marker.remove(); });
      avisarLegenda();
    }
    function focarLeito(id) {
      const l = leitos.get(id);
      if (!l) return;
      if (!leitosVisiveis) l.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: l.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (abrirPopupDoPino(l.marker)) marcarFoco();
      });
    }

    return {
      api: { alternarLeitos, focarLeito },
      legenda: () => ({ leitos: leitosVisiveis }),
      noInstante,
      fecharPopups() {
        leitos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      },
    };
  });
})(window.GC = window.GC || {});
