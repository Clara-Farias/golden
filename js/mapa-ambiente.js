// Ambiente do mapa: luz pela hora do dia, ondas de chegada de ocorrência nova e minimapa de orientação.
// Ligado uma vez pelo js/map.js (GC.criarAmbienteMapa). Regras puras em js/mapa-logica.js (ML.luzDoDia);
// estilo em css/mapa-ambiente.css. Nada aqui muda dado: é só o que se vê.
(function (GC) {
  const ML = GC.mapaLogica;

  GC.criarAmbienteMapa = function (mapa, { bairros, limites, poucoMovimento, aoClicarMinimapa }) {
    const caixa = mapa.getCanvasContainer();
    const container = mapa.getContainer();

    // ---- 16 · Luz do dia: véu por cima do mapa e por baixo dos pinos ----
    const veu = document.createElement('div');
    veu.className = 'mapa-luz';
    veu.setAttribute('aria-hidden', 'true');
    caixa.insertBefore(veu, mapa.getCanvas().nextSibling);
    function atualizarLuz() {
      const agora = new Date(GC.agora ? GC.agora() : Date.now());
      const l = ML.luzDoDia(agora.getHours() + agora.getMinutes() / 60);
      veu.dataset.fase = l.fase;
      veu.style.setProperty('--luz-cor', l.cor);
      veu.style.setProperty('--luz-opacidade', String(l.opacidade));
      veu.style.mixBlendMode = l.mistura;
      veu.title = '';
    }
    atualizarLuz();
    setInterval(atualizarLuz, 60 * 1000);

    // ---- 17 · Onda de chegada: anel que se abre do ponto novo ----
    function onda(o) {
      if (!o || o.historico || poucoMovimento() || typeof o.lng !== 'number') return;
      const el = document.createElement('div');
      el.className = `onda-chegada ${o.severidade || ''}`;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<i></i><i></i>';
      const m = new maplibregl.Marker({ element: el }).setLngLat([o.lng, o.lat]).addTo(mapa);
      setTimeout(() => m.remove(), 2600);
    }

    // ---- 19 · Minimapa: a silhueta da cidade e o pedaço que está na tela ----
    // Aparece quando a câmera está perto (ou girada): longe, a cidade inteira já está à vista.
    const [[oeste, sul], [leste, norte]] = limites;
    const L = 120;
    const A = Math.max(60, Math.round(L * ((norte - sul) / (leste - oeste)) * 1.15));
    const px = (lng, lat) => [((lng - oeste) / (leste - oeste)) * (L - 8) + 4, ((norte - lat) / (norte - sul)) * (A - 8) + 4];
    const caminhoBairro = (b) => `M${b.poligono.map(([lat, lng]) => px(lng, lat).map((n) => n.toFixed(1)).join(',')).join('L')}Z`;
    const mini = document.createElement('button');
    mini.type = 'button';
    mini.className = 'mapa-minimapa';
    mini.title = 'Ver a cidade inteira';
    mini.setAttribute('aria-label', 'Minimapa: ver a cidade inteira');
    mini.innerHTML = `<svg viewBox="0 0 ${L} ${A}" width="${L}" height="${A}" aria-hidden="true">
      <path class="mm-cidade" d="${bairros.map(caminhoBairro).join(' ')}"/>
      <polygon class="mm-vista" points=""/></svg>`;
    mini.hidden = true;
    mini.addEventListener('click', () => aoClicarMinimapa && aoClicarMinimapa());
    container.appendChild(mini);
    const vista = mini.querySelector('.mm-vista');
    let zoomCidade = null;
    function zoomDaCidade() {
      if (zoomCidade === null) {
        const cam = mapa.cameraForBounds(limites, { padding: 30 });
        zoomCidade = cam && Number.isFinite(cam.zoom) ? cam.zoom : mapa.getZoom();
      }
      return zoomCidade;
    }
    mapa.on('resize', () => { zoomCidade = null; });
    function atualizarMinimapa() {
      const perto = mapa.getZoom() > zoomDaCidade() + 0.8 || Math.abs(mapa.getBearing()) > 2;
      if (!perto) { mini.hidden = true; return; }
      const c = mapa.getCanvas();
      const w = c.clientWidth; const h = c.clientHeight;
      // Os quatro cantos da tela no chão (em perspectiva, a vista é um trapézio).
      const cantos = [[0, h * 0.12], [w, h * 0.12], [w, h], [0, h]].map(([x, y]) => mapa.unproject([x, y]));
      vista.setAttribute('points', cantos.map((p) => px(p.lng, p.lat).map((n) => Math.max(-20, Math.min(L + 20, n)).toFixed(1)).join(',')).join(' '));
      mini.hidden = false;
    }
    mapa.on('move', atualizarMinimapa);
    mapa.on('load', atualizarMinimapa);

    return { onda, atualizarLuz, atualizarMinimapa };
  };
})(window.GC = window.GC || {});
