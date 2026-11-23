(function (GC) {
  // Comparar períodos, lado a lado: dois mapas da cidade sobre o palco, um para cada período da comparação
  // da linha do tempo (js/modos-mapa.js). Cada um pinta os bairros pelo número de alertas abertos naquele
  // período (a MESMA escala nos dois, para a cor querer dizer a mesma coisa) e põe um ponto em cada alerta.
  // Os dois andam juntos: arrastar ou dar zoom num move o outro; passar o mouse num bairro mostra os dois números.
  // Os números vêm do GC.compararPeriodos (os mesmos da tabela do painel "Comparar").
  const ML = GC.mapaLogica;
  const COR_SEV = { critica: '#dc2626', alta: '#c2410c', media: '#eab308' };
  const FUNDO = { claro: '#edf2f2', escuro: '#0b1d22' };
  const esc = (t) => GC.escaparHtml(String(t));
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const semMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TROCA_PONTOS_MS = 180;

  // O topo da escala comum: o bairro com mais alertas em qualquer dos dois períodos (mínimo 1).
  GC.escalaComparacao = function (r) {
    const todos = [...Object.values(r.a.alertas.porBairro), ...Object.values(r.b.alertas.porBairro)];
    return Math.max(1, ...todos);
  };

  GC.criarMapasComparacao = function (palco) {
    const el = document.createElement('section');
    el.className = 'cmp-mapas';
    el.hidden = true;
    el.setAttribute('aria-label', 'Os dois períodos lado a lado');
    const lado = (k, rotulo) => `
      <div class="cmp-lado ${k}">
        <div class="cmp-cab vidro"><span class="cmp-rot">${rotulo}</span><b class="cmp-quando"></b><span class="cmp-total"></span>${k === 'a' ? '<span class="cmp-delta" hidden></span>' : ''}</div>
        <div class="cmp-mapa" role="img"></div>
      </div>`;
    el.innerHTML = `${lado('a', 'Período')}${lado('b', 'Comparar com')}
      <div class="cmp-legenda vidro" aria-hidden="true">
        <span class="cmp-leg-tit">Alertas no bairro</span>
        <span class="cmp-leg-barra" style="background: ${ML.gradienteCalorCss()}"></span>
        <span class="cmp-leg-esc"><span>0</span><span class="cmp-leg-max"></span></span>
        <span class="cmp-leg-sev">${Object.entries(COR_SEV).map(([k, c]) => `<i style="background:${c}"></i>${{ critica: 'Crítica', alta: 'Alta', media: 'Média' }[k]}`).join('')}</span>
      </div>
      <p class="cmp-dica vidro" role="note" hidden><i class="ti ti-hand-move" aria-hidden="true"></i>Arraste ou dê zoom: os dois mapas andam juntos. Passe o mouse num bairro para ver os dois números.</p>`;
    palco.appendChild(el);

    // Dica de uso: aparece ao abrir até a pessoa mexer num mapa pela primeira vez (fica lembrado no
    // navegador); de qualquer jeito, some sozinha depois de alguns segundos.
    const dica = el.querySelector('.cmp-dica');
    const CHAVE_DICA = 'gc.dica.cmpMapas';
    const dicaVista = () => { try { return localStorage.getItem(CHAVE_DICA) === '1'; } catch (e) { return false; } };
    let tDica = null;
    function esconderDica(lembrar) {
      clearTimeout(tDica);
      if (lembrar) { try { localStorage.setItem(CHAVE_DICA, '1'); } catch (e) { /* sem armazenamento: só nesta vez */ } }
      if (dica.hidden || dica.classList.contains('some')) return;
      dica.classList.add('some');
      tDica = setTimeout(() => { dica.hidden = true; }, 400);
    }
    function mostrarDica() {
      if (dicaVista()) return;
      clearTimeout(tDica);
      dica.hidden = false;
      dica.classList.remove('some');
      tDica = setTimeout(() => esconderDica(false), 9000);
    }
    el.addEventListener('pointerdown', () => esconderDica(true));
    el.addEventListener('wheel', () => esconderDica(true), { passive: true });

    const tema = () => (document.body.classList.contains('mapa-escuro') ? 'escuro' : 'claro');
    const mapas = {}; // k → { mapa, pronto, popup }

    // O que flutua sobre o palco (cabeçalho, menu lateral, barra da linha do tempo): os cabeçalhos dos mapas
    // ficam fora do caminho e a cidade é enquadrada no espaço que sobra.
    function margens() {
      const palco = el.getBoundingClientRect();
      // getClientRects, não offsetParent: o menu é position: fixed (offsetParent null mesmo à vista).
      const caixa = (s) => { const x = document.querySelector(s); return x && !x.hidden && x.getClientRects().length ? x.getBoundingClientRect() : null; };
      const topo = caixa('.topo');
      const menu = caixa('#menu');
      const barra = caixa('.linha-tempo');
      const painel = caixa('.lt-comp');
      // O painel "Comparar" fica sobre a barra; a cidade vai acima dele quando ainda sobra mapa para ver.
      const fundo = painel && painel.top - palco.top - (topo ? topo.bottom - palco.top : 0) >= 320 ? painel.top : barra && barra.top;
      const m = {
        topo: Math.max(0, topo ? topo.bottom - palco.top : 0),
        esq: Math.max(0, menu ? menu.right - palco.left : 0),
        baixo: Math.max(0, fundo ? palco.bottom - fundo : 0),
      };
      el.style.setProperty('--cmp-topo', `${m.topo}px`);
      el.style.setProperty('--cmp-esq', `${m.esq}px`);
      return m;
    }
    function enquadrar(k, m) {
      const x = mapas[k];
      if (!x) return;
      const w = x.mapa.getContainer().clientWidth;
      const h = x.mapa.getContainer().clientHeight;
      // A mesma folga nos dois: os dois mostram exatamente o mesmo pedaço da cidade.
      const lado = { top: m.topo + 84, bottom: m.baixo + 16, left: m.esq + 16, right: 16 };
      // Pouco espaço (janela baixa, celular): enquadra no mapa inteiro.
      const pad = lado.top + lado.bottom > h * 0.7 || lado.left + lado.right > w * 0.7 ? 16 : lado;
      x.mapa.fitBounds(ML.limites(GC.data.bairros), { padding: pad, duration: 0 });
    }
    let atual = null; // { r, rotulos, max }
    let movendo = false;

    function semMapa() {
      el.querySelectorAll('.cmp-mapa').forEach((m) => {
        m.innerHTML = '<p class="cmp-sem-mapa">O mapa não abriu neste navegador. Os números estão na vista "Tabela".</p>';
      });
    }

    function criar(k) {
      const caixa = el.querySelector(`.cmp-lado.${k} .cmp-mapa`);
      const t = tema();
      const mapa = new maplibregl.Map({
        container: caixa,
        style: { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {},
          layers: [{ id: 'background', type: 'background', paint: { 'background-color': FUNDO[t] } }] },
        bounds: ML.limites(GC.data.bairros), maxZoom: 16, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false,
      });
      mapa.touchZoomRotate.disableRotation();
      mapa.keyboard.disableRotation();
      const m = { mapa, pronto: false, popup: null, tema: t };
      mapas[k] = m;
      mapa.on('style.load', () => {
        const c = ML.CORES_TEMA[t];
        mapa.addSource('mascara', { type: 'geojson', data: ML.geoMascara(GC.data.bairros) });
        mapa.addLayer({ id: 'mascara', type: 'fill', source: 'mascara', paint: { 'fill-color': c.mascara, 'fill-opacity': c.mascaraOpacidade } });
        mapa.addSource('bairros', { type: 'geojson', data: ML.geoBairros(GC.data.bairros), promoteId: 'id' });
        const paradas = ML.paradasCalor().flatMap(([pos, cor]) => [pos, cor]);
        mapa.addLayer({ id: 'bairros', type: 'fill', source: 'bairros', paint: {
          'fill-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'p'], 0], ...paradas],
          'fill-opacity': ['case', ['>', ['coalesce', ['feature-state', 'p'], 0], 0], 0.55, 0.03],
          // Trocar de período: as cores dos bairros passam de um valor para o outro, sem salto.
          'fill-opacity-transition': { duration: 550 }, 'fill-color-transition': { duration: 550 },
        } });
        mapa.addLayer({ id: 'bairros-contorno', type: 'line', source: 'bairros', paint: { 'line-color': c.bairro, 'line-width': 1, 'line-opacity': 0.4 } });
        mapa.addLayer({ id: 'bairros-sob', type: 'line', source: 'bairros', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.selecionado, 'line-width': 2.5 } });
        mapa.addSource('pontos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapa.addLayer({ id: 'pontos', type: 'circle', source: 'pontos', paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 6],
          'circle-color': ['match', ['get', 'severidade'], 'critica', COR_SEV.critica, 'alta', COR_SEV.alta, COR_SEV.media],
          'circle-stroke-color': t === 'escuro' ? '#0b1d22' : '#ffffff', 'circle-stroke-width': 1,
          'circle-opacity': 1, 'circle-stroke-opacity': 1,
          'circle-opacity-transition': { duration: TROCA_PONTOS_MS }, 'circle-stroke-opacity-transition': { duration: TROCA_PONTOS_MS },
        } });
        mapa.addSource('rotulos', { type: 'geojson', data: ML.geoRotulos(GC.data.bairros) });
        mapa.addLayer({ id: 'rotulos', type: 'symbol', source: 'rotulos', layout: {
          'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9.5, 14, 12],
          'text-max-width': 7, 'text-anchor': 'top', 'text-offset': [0, 1.2],
          'text-allow-overlap': GC.data.bairros.length <= 20, 'symbol-sort-key': ['-', 0, ['get', 'populacao']] },
          paint: { 'text-color': c.rotulo, 'text-halo-color': c.halo, 'text-halo-width': 1.5 } });
        m.pronto = true;
        pintar(k);
      });
      // Um move o outro (o "movendo" evita o vai e volta).
      mapa.on('move', () => {
        if (movendo) return;
        const outro = mapas[k === 'a' ? 'b' : 'a'];
        if (!outro) return;
        movendo = true;
        outro.mapa.jumpTo({ center: mapa.getCenter(), zoom: mapa.getZoom() });
        movendo = false;
      });
      mapa.on('mousemove', 'bairros', (e) => mostrarBairro(e.features.length ? e.features[0].id : null));
      mapa.on('mouseleave', 'bairros', () => mostrarBairro(null));
      return m;
    }

    // O mesmo bairro marcado nos dois mapas, com o número de cada período.
    let sob = null;
    function mostrarBairro(id) {
      if (id === sob) return;
      sob = id;
      const b = id && GC.data.bairros.find((x) => x.id === id);
      ['a', 'b'].forEach((k) => {
        const m = mapas[k];
        if (!m || !m.pronto) return;
        m.mapa.setFilter('bairros-sob', ['==', ['get', 'id'], id || '']);
        m.mapa.getCanvas().style.cursor = id ? 'pointer' : '';
        if (m.popup) { m.popup.remove(); m.popup = null; }
        if (!b || !atual) return;
        const n = atual.r[k].alertas.porBairro[id] || 0;
        m.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'cmp-popup' })
          .setLngLat([b.centro[1], b.centro[0]])
          .setHTML(`<b>${esc(b.nome)}</b><span>${plural(n, 'alerta', 'alertas')}</span>`)
          .addTo(m.mapa);
      });
    }

    function pintar(k) {
      const m = mapas[k];
      if (!m || !m.pronto || !atual) return;
      const res = atual.r[k];
      GC.data.bairros.forEach((b) => {
        const n = res.alertas.porBairro[b.id] || 0;
        m.mapa.setFeatureState({ source: 'bairros', id: b.id }, { p: n ? n / atual.max : 0 });
      });
      const dados = { type: 'FeatureCollection', features: (res.alertas.pontos || []).map((p) => ({
        type: 'Feature', properties: { severidade: p.severidade }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) };
      // O app repinta a cada render: os pontos só trocam quando o período ou os alertas mudam. Na troca, os
      // de antes somem, os novos aparecem (em vez de pular de um conjunto para o outro).
      const chave = `${atual.rotulos[k]}|${res.alertas.total}|${dados.features.length}`;
      if (chave === m.pontosChave) return;
      const primeira = !m.pontosChave;
      m.pontosChave = chave;
      clearTimeout(m.trocaPontos);
      const opacidade = (v) => { m.mapa.setPaintProperty('pontos', 'circle-opacity', v); m.mapa.setPaintProperty('pontos', 'circle-stroke-opacity', v); };
      if (primeira || semMovimento()) { m.mapa.getSource('pontos').setData(dados); return; }
      opacidade(0);
      m.trocaPontos = setTimeout(() => {
        if (!mapas[k] || mapas[k] !== m) return;
        m.mapa.getSource('pontos').setData(dados);
        opacidade(1);
      }, TROCA_PONTOS_MS);
    }

    // Os números do cabeçalho contam do valor anterior até o novo (~0,5 s) quando o período muda.
    const mostrados = {}; // k → { total, criticas }
    const textoTotal = (t, c) => `${plural(t, 'alerta', 'alertas')} · ${plural(c, 'crítico', 'críticos')}`;
    function contar(alvo, k, para) {
      const de = mostrados[k];
      if (de && de.total === para.total && de.criticas === para.criticas) return; // igual: deixa a contagem em curso terminar
      mostrados[k] = para;
      cancelAnimationFrame(alvo._conta);
      if (!de || semMovimento()) { alvo.textContent = textoTotal(para.total, para.criticas); return; }
      const t0 = performance.now();
      const passo = (t) => {
        const x = Math.min(1, (t - t0) / 500);
        const e = 1 - Math.pow(1 - x, 3);
        alvo.textContent = textoTotal(Math.round(de.total + (para.total - de.total) * e), Math.round(de.criticas + (para.criticas - de.criticas) * e));
        if (x < 1) alvo._conta = requestAnimationFrame(passo);
      };
      alvo._conta = requestAnimationFrame(passo);
      GC.repetirAnimacao(alvo.closest('.cmp-cab'), 'mudou');
    }
    // Selo no período A: quantos alertas a mais ou a menos que no período de comparação.
    function selo() {
      const s = el.querySelector('.cmp-delta');
      if (!s) return;
      const a = atual.r.a.alertas.total;
      const b = atual.r.b.alertas.total;
      const d = a - b;
      s.hidden = false;
      s.className = `cmp-delta ${d > 0 ? 'pior' : d < 0 ? 'melhor' : 'igual'}`;
      const pct = b ? Math.round((Math.abs(d) / b) * 100) : null;
      s.innerHTML = d === 0 ? '<i class="ti ti-equal" aria-hidden="true"></i>igual ao outro período'
        : `<i class="ti ${d > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}" aria-hidden="true"></i>${Math.abs(d)} ${d > 0 ? 'a mais' : 'a menos'}${pct !== null ? ` (${d > 0 ? '+' : '−'}${pct}%)` : ''}`;
    }
    function cabecalhos() {
      selo();
      ['a', 'b'].forEach((k) => {
        const lado = el.querySelector(`.cmp-lado.${k}`);
        const al = atual.r[k].alertas;
        lado.querySelector('.cmp-quando').textContent = atual.rotulos[k];
        contar(lado.querySelector('.cmp-total'), k, { total: al.total, criticas: al.criticas });
        lado.querySelector('.cmp-mapa').setAttribute('aria-label', `Mapa de ${atual.rotulos[k]}: ${plural(al.total, 'alerta aberto', 'alertas abertos')}, ${plural(al.criticas, 'crítico', 'críticos')}.`);
      });
      el.querySelector('.cmp-leg-max').textContent = String(atual.max);
    }

    // r: resultado do GC.compararPeriodos; rotulos: { a, b } (os períodos em texto).
    function mostrar(r, rotulos) {
      atual = { r, rotulos, max: GC.escalaComparacao(r) };
      const abrindo = el.hidden || el.classList.contains('saindo');
      if (el.hidden) Object.keys(mostrados).forEach((k) => delete mostrados[k]); // reabrindo: sem contar do valor velho
      GC.mostrarAnimado(el);
      document.body.classList.add('com-mapas-lado');
      cabecalhos();
      if (!GC.mapaDisponivel()) return semMapa();
      if (abrindo) mostrarDica();
      // Trocou o tema desde a última vez: refaz os dois mapas com as cores certas.
      if (mapas.a && mapas.a.tema !== tema()) esconderMapas();
      const novos = !mapas.a;
      ['a', 'b'].forEach((k) => {
        if (!mapas[k]) criar(k);
        else if (abrindo) mapas[k].mapa.resize();
        pintar(k);
      });
      // Ao abrir, a cidade inteira; trocando de período com os mapas abertos, o enquadramento fica.
      if (novos || abrindo) enquadrar('a', margens());
      sob = null;
    }
    function esconderMapas() {
      ['a', 'b'].forEach((k) => { if (mapas[k]) { clearTimeout(mapas[k].trocaPontos); mapas[k].mapa.remove(); delete mapas[k]; } });
    }
    function esconder() {
      if (el.hidden || el.classList.contains('saindo')) return;
      mostrarBairro(null);
      // A classe sai no fim da animação: até lá a legenda e os widgets do mapa principal não voltam por cima.
      GC.esconderAnimado(el, () => document.body.classList.remove('com-mapas-lado'));
    }
    window.addEventListener('resize', () => { if (!el.hidden) { Object.values(mapas).forEach((m) => m.mapa.resize()); margens(); } });
    // Tema do mapa trocado com os dois abertos: refaz nas cores novas (o mostrar compara o tema).
    new MutationObserver(() => {
      if (!el.hidden && atual && mapas.a && mapas.a.tema !== tema()) mostrar(atual.r, atual.rotulos);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return { mostrar, esconder, aberto: () => !el.hidden };
  };
})(window.GC = window.GC || {});
