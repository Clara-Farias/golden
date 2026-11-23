(function (GC) {
  // v3: dashboard abaixo do mapa (widgets ligados, na ordem escolhida) e a gaveta Widgets.
  const esc = (t) => GC.escaparHtml(t);
  const widget = (id) => GC.WIDGETS.find((w) => w.id === id);

  GC.criarWidgetsUI = function (el, { aoMudar, aoFechar, aoSalvarVista, aoAbrirSecretaria, aoVerResolvida, aoSelecionarBairro, aoAbrirCamada, aoDestacarBairros, aoFiltrarObras, widgetsIA, graficoAtualIA, aoPerguntarIA, aoExcluirIA, aoAbrirIndicador, aoAbrirAlerta, aoIrCrise, aoResumo, aoRestaurar, infoVista, aoMudarLugares }) {
    let cfg = { ativos: (GC.WIDGETS_PADRAO || GC.WIDGETS.map((w) => w.id)).slice(), pulsos: null };
    const mudar = (parcial) => aoMudar(Object.assign({}, cfg, parcial));

    // Conteúdo de cada widget: um arquivo por domínio em js/widgets/<id>.js (GC.conteudoWidget).
    const conteudo = GC.conteudoWidget;
    let setorObras = null;
    let dadosObras = null; // últimos dados do painel: o chip de setor redesenha só o widget de obras

    // Conteúdo de um widget num elemento (o cartão no dashboard ou o corpo do modal de detalhes).
    function preencher(corpo, id, d) {
        if (id === 'pulsos') {
          const lista = GC.widgetsVisiveis(d.pulsos, cfg.pulsos);
          corpo.innerHTML = `<div class="pulsos">${lista.map((p) => GC.cartaoPulso(p)).join('')}</div><a class="w-link" href="#/secretarias">Ranking e detalhes na tela Secretarias →</a>`;
        }
        if (id === 'desempenho') GC.desenharDesempenho(corpo, d.desempenho, { aoClicarArea: aoAbrirSecretaria, aoVerResolvida });
        if (id === 'obras') dadosObras = d;
        if (conteudo[id]) corpo.innerHTML = conteudo[id](d, id === 'obras' ? { setor: setorObras } : (cfg.opcoes || {})[id] || {});
        if (GC.WIDGETS_EXTRA && GC.WIDGETS_EXTRA[id]) {
          try { corpo.innerHTML = GC.WIDGETS_EXTRA[id](d, (cfg.opcoes || {})[id] || {}); } catch (e) { corpo.innerHTML = '<p class="wx-vazio">Não foi possível montar este widget agora.</p>'; if (window.console) console.error(e); }
        }
        if (GC.ehWidgetIA && GC.ehWidgetIA(id) && widgetsIA) {
          const w = widgetsIA.buscar(id);
          if (w) corpo.innerHTML = GC.htmlWidgetIA(w, graficoAtualIA ? graficoAtualIA(w) : null);
        }
    }

    // ---- encaixe (masonry): cada cartão ocupa tantas linhas finas da grade quanto a sua altura, então um
    // cartão baixo não deixa buraco ao lado de um alto. A ordem escolhida continua (esquerda → direita).
    const LINHA = 4;
    const VAO = 14;
    const spans = {}; // última altura conhecida: o redesenho já nasce encaixado, sem pulo
    function encaixar(w) {
      const h = w.getBoundingClientRect().height;
      if (!h) return;
      const n = Math.ceil((h + VAO) / LINHA);
      spans[w.dataset.widget] = n;
      w.style.gridRowEnd = `span ${n}`;
    }
    const observador = window.ResizeObserver ? new ResizeObserver((lista) => lista.forEach((x) => encaixar(x.target))) : null;
    if (observador) el.area.classList.add('encaixe');

    // ---- colunas: a grade tem sempre um número PAR de meias-colunas; o Médio ocupa 2, o Compacto 1, o Largo todas.
    // Assim o Compacto fica de fato mais estreito (antes ele só escondia o conteúdo e seguia com a largura do Médio).
    const LARGURA_MEDIO = 460;
    function medirColunas() {
      const w = el.area.clientWidth;
      if (!w) return;
      const medios = Math.max(1, Math.floor((w + VAO) / (LARGURA_MEDIO + VAO)));
      el.area.style.setProperty('--w-cols', String(medios * 2));
      // Estreito demais para meia coluna (celular, gaveta apertada): o Compacto ocupa a linha toda.
      el.area.classList.toggle('w-estreito', w < 620);
    }
    if (window.ResizeObserver) new ResizeObserver(medirColunas).observe(el.area);

    // ---- Compacto: mostra só o bloco-resumo do widget (números, placar, KPI…, ou o primeiro bloco do corpo)
    // e esconde os irmãos dele em cada nível. Antes era uma lista fixa de classes no CSS, e os widgets fora dela
    // ficavam só com o título.
    const RESUMO_P = '.w-numeros, .wx-compacto, .wx-placar, .wx-kpi, .pulsos, [data-resumo-p]';
    // Fora do resumo: detalhe, legendas, rótulos ("ao vivo") e os seletores do próprio cartão (no Compacto,
    // as opções ficam na gaveta Widgets).
    const NAO_RESUMO = '.w-det, .w-legenda, .wx-sub, .w-link, .w-mais, .wx-ao-vivo, .wx-comp-sel';
    function marcarCompacto(corpo) {
      let alvo = corpo.querySelector(RESUMO_P);
      if (!alvo) {
        let n = corpo;
        while (n.children.length === 1 && n.firstElementChild.tagName === 'DIV') n = n.firstElementChild;
        const blocos = [...n.children].filter((x) => !x.matches(NAO_RESUMO));
        // Um parágrafo solto (aviso curto) só é o resumo se não houver bloco de conteúdo ao lado.
        alvo = blocos.find((x) => x.tagName !== 'P') || blocos[0] || null;
      }
      if (!alvo) return; // corpo vazio ou só texto solto: fica como está
      alvo.classList.add('w-p-resumo');
      for (let n = alvo; n && n !== corpo; n = n.parentElement) {
        [...n.parentElement.children].forEach((irmao) => { if (irmao !== n) irmao.classList.add('w-p-oculto'); });
      }
    }

    // ---- modal de detalhes ----
    const modal = document.getElementById('w-modal');
    let modalId = null;
    let ultimoDados = null;
    function desenharModal() {
      const corpo = modal.querySelector('.w-modal-corpo');
      const rolagem = corpo.scrollTop;
      corpo.innerHTML = `<div class="widget widget-${modalId} w-no-modal"><div class="w-corpo"></div></div>`;
      preencher(corpo.querySelector('.w-corpo'), modalId, ultimoDados);
      corpo.scrollTop = rolagem;
    }
    function abrirModal(id) {
      if (!modal || !ultimoDados) return;
      modalId = id;
      modal.querySelector('#w-modal-titulo').innerHTML = `${iconeWidget(id)} ${esc(widget(id).nome)}`;
      modal.querySelector('.w-modal-corpo').scrollTop = 0;
      desenharModal();
      if (!modal.open) modal.showModal();
    }
    function fecharModal() { if (modal && modal.open) modal.close(); }
    if (modal) {
      modal.addEventListener('close', () => {
        const id = modalId;
        modalId = null;
        const b = id && el.area.querySelector(`[data-detalhes="${id}"]`);
        if (b) b.focus({ preventScroll: true });
      });
      modal.addEventListener('click', (e) => {
        // Clique no fundo escuro (fora da caixa) ou no X fecha.
        if (e.target === modal || e.target.closest('[data-fechar-modal]')) return fecharModal();
        const vaiAoMapa = e.target.closest('[data-leito],[data-calor-bo],[data-escola],[data-frota],[data-coleta],[data-farmacia],[data-obra],[data-risco],[data-social],[data-violencia],[data-pulso],[data-ver-bairro],[data-abrir-alerta],[data-abrir-ind],[data-ir-crise]')
          && !e.target.closest('[data-setor-obra]');
        clique(e);
        if (vaiAoMapa) fecharModal(); // a ação leva ao mapa: o modal sai da frente
      });
      modal.addEventListener('change', mudouCampo);
      modal.addEventListener('input', digitou);
    }

    // ---- ícone e categoria ----
    const categoria = (id) => (GC.CATEGORIAS_WIDGET || []).find((c) => c.id === (widget(id).ia ? 'ia' : widget(id).categoria)) || { id: 'util', nome: 'Outros', icone: 'tool', cor: '#0f4c5c' };
    function iconeWidget(id) {
      const w = widget(id);
      if (w.icone && GC.icone) return GC.icone(w.icone);
      return w.emoji || '';
    }
    const ladrilho = (id) => `<span class="w-ladrilho" style="--cor:${categoria(id).cor}">${iconeWidget(id)}</span>`;

    // ---- modo edição (no próprio painel) e aviso de desfazer ----
    let editando = false;
    let arrastando = null; // id do widget (ou do catálogo, com "novo:")
    let desfazer = null;
    let toastTimer = null;
    const toast = document.createElement('div');
    toast.className = 'w-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.hidden = true;
    document.body.appendChild(toast); // no body: fica acima da gaveta de Indicadores e das gavetas da direita
    const anuncio = document.createElement('div');
    anuncio.className = 'sr-only';
    anuncio.setAttribute('aria-live', 'assertive');
    (el.area.parentElement || document.body).appendChild(anuncio);
    const anunciar = (t) => { anuncio.textContent = ''; setTimeout(() => { anuncio.textContent = t; }, 30); };

    function mostrarToast(texto, acao) {
      desfazer = acao;
      toast.innerHTML = `<span>${texto}</span>${acao ? '<button type="button" data-desfazer>Desfazer</button>' : ''}<button type="button" class="w-toast-x" data-toast-fechar aria-label="Fechar aviso">✕</button>`;
      toast.hidden = false;
      toast.classList.remove('saindo');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(esconderToast, 7000);
    }
    function esconderToast() { toast.classList.add('saindo'); setTimeout(() => { toast.hidden = true; desfazer = null; }, 200); }
    toast.addEventListener('click', (e) => {
      if (e.target.closest('[data-desfazer]') && desfazer) { const f = desfazer; desfazer = null; f(); esconderToast(); }
      if (e.target.closest('[data-toast-fechar]')) esconderToast();
    });

    function ocultar(id) {
      const i = cfg.ativos.indexOf(id);
      if (i < 0) return;
      mudar({ ativos: cfg.ativos.filter((x) => x !== id) });
      mostrarToast(`<b>${esc(widget(id).nome)}</b> saiu do painel.`, () => {
        const a = cfg.ativos.filter((x) => x !== id);
        a.splice(Math.min(i, a.length), 0, id);
        mudar({ ativos: a });
      });
    }
    function adicionar(id, pos) {
      if (cfg.ativos.includes(id)) return;
      const a = cfg.ativos.slice();
      a.splice(pos === undefined ? a.length : pos, 0, id);
      // Na gaveta, o item continua no lugar com "✓ No painel" (o catálogo não pula), até a gaveta fechar.
      recentes.add(id);
      mudar({ ativos: a });
      anunciar(`${widget(id).nome} adicionado ao painel, posição ${a.indexOf(id) + 1} de ${a.length}.`);
      mostrarToast(`<b>${esc(widget(id).nome)}</b> entrou no painel (${a.indexOf(id) + 1}º de ${a.length}).`, () => {
        recentes.delete(id);
        mudar({ ativos: cfg.ativos.filter((x) => x !== id) });
      });
      // Leva até o widget novo e dá um destaque rápido.
      setTimeout(() => {
        const alvo = el.area.querySelector(`[data-widget="${id}"]`);
        if (!alvo) return;
        if (el.area.offsetParent) alvo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        alvo.classList.add('w-recem');
        setTimeout(() => alvo.classList.remove('w-recem'), 1600);
      }, 60);
    }
    function moverPara(id, j) {
      const a = cfg.ativos.filter((x) => x !== id);
      const k = Math.max(0, Math.min(a.length, j));
      a.splice(k, 0, id);
      if (a.join() === cfg.ativos.join()) return;
      mudar({ ativos: a });
      anunciar(`${widget(id).nome}: posição ${k + 1} de ${a.length}.`);
    }
    function definirTamanho(id, t) {
      const tam = Object.assign({}, cfg.tamanhos || {});
      if (t === 'm') delete tam[id]; else tam[id] = t;
      mudar({ tamanhos: tam });
    }
    function definirOpcao(id, campo, valor) {
      const op = Object.assign({}, cfg.opcoes || {});
      op[id] = Object.assign({}, op[id] || {}, { [campo]: valor });
      if (id === 'resumo') op[id] = { periodo: valor };
      mudar({ opcoes: op });
    }
    function alternarEdicao(forcar) {
      editando = typeof forcar === 'boolean' ? forcar : !editando;
      el.area.classList.toggle('editando', editando);
      if (el.botaoEditar) {
        el.botaoEditar.setAttribute('aria-pressed', String(editando));
        // O mesmo botão sai da edição: o rótulo diz isso (antes só mudava a cor).
        const rot = el.botaoEditar.querySelector('.rot');
        if (rot) rot.textContent = editando ? 'Concluir' : 'Personalizar';
        el.botaoEditar.title = editando ? 'Concluir a personalização (Esc)' : 'Adicionar, ordenar, redimensionar e ocultar widgets';
      }
      if (ultimoDados) desenharArea(ultimoDados);
      // "Personalizar" é um gesto só: a edição no painel (ordem, tamanho, ocultar) e a gaveta para adicionar.
      if (editando) {
        abaGaveta = 'adicionar';
        recentes.clear();
        desenharGaveta();
        if (el.aoConfigurar) el.aoConfigurar();
        mostrarToast('Arraste os cartões pela alça, escolha P, M ou L ou oculte. Na gaveta ao lado, adicione widgets. Para sair: Concluir ou Esc.', null);
      } else {
        esconderToast();
        if (el.aoFecharGaveta) el.aoFecharGaveta(); // só fecha se a aberta for a Widgets
      }
    }

    // ---- widgets fixados no mapa (cfg.fixados): cartões compactos sobre o mapa, salvos com a visualização ----
    const fixados = () => cfg.fixados || [];
    const estaFixado = (id) => fixados().includes(id);
    function botaoFixar(id, classe) {
      const f = estaFixado(id);
      const rot = f ? `Tirar ${esc(widget(id).nome)} do mapa` : `Fixar ${esc(widget(id).nome)} no mapa`;
      return `<button type="button" class="${classe}${f ? ' ativo' : ''}" data-fixar="${id}" aria-pressed="${f}" title="${f ? 'Tirar do mapa' : 'Fixar no mapa'}" aria-label="${rot}">${GC.icone ? GC.icone(f ? 'pinned' : 'pin') : 'Fixar'}</button>`;
    }
    function alternarFixado(id) {
      if (estaFixado(id)) {
        mudar({ fixados: fixados().filter((x) => x !== id) });
        if (aoMudarLugares) aoMudarLugares();
        return anunciar(`${widget(id).nome} saiu do mapa.`);
      }
      if (fixados().length >= GC.MAX_FIXADOS_MAPA) {
        return mostrarToast(`Cabem até ${GC.MAX_FIXADOS_MAPA} widgets no mapa. Tire um (no próprio cartão do mapa) para fixar <b>${esc(widget(id).nome)}</b>.`, null);
      }
      const lugar = lugarParaNovo();
      ajustarNoMapa(id, { lugar }, [...fixados(), id]);
      mostrarToast(`<b>${esc(widget(id).nome)}</b> fixado no mapa (${esc(nomeLugar(lugar).toLowerCase())}).`, () => mudar({ fixados: fixados().filter((x) => x !== id) }));
    }
    // O lugar do recém-fixado: o primeiro canto com espaço (GC.lugarParaFixar). Um lugar de cima ocupado ainda
    // recebe mais um se a coluna tem a altura de um cartão sobrando; os de baixo ocupados contam como cheios.
    const ALTURA_CARTAO_NOVO = 210;
    function lugarParaNovo() {
      const contagem = {};
      fixados().filter((id) => widget(id)).forEach((id) => { const l = noMapa(id).lugar; contagem[l] = (contagem[l] || 0) + 1; });
      const cabeMais = (lugar) => {
        if (!lugar.endsWith('-cima') || !el.mapa || el.mapa.hidden) return false;
        const l = el.mapa.querySelector(`.wm-lugar[data-lugar="${lugar}"]`);
        return !!l && l.scrollHeight + 10 + ALTURA_CARTAO_NOVO <= l.clientHeight;
      };
      return GC.lugarParaFixar ? GC.lugarParaFixar({ contagem, cabeMais }) : LUGARES()[0].id;
    }
    // Lugar e tamanho de cada fixado (cfg.noMapa, só o que fugiu do padrão: direita em cima, Compacto).
    const LUGARES = () => (GC.LUGARES_WIDGET_MAPA || [{ id: 'dir-cima', nome: 'Direita, em cima' }]);
    const nomeLugar = (l) => (LUGARES().find((x) => x.id === l) || LUGARES()[0]).nome;
    const noMapa = (id) => Object.assign({ lugar: LUGARES()[0].id, tam: 'p' }, (cfg.noMapa || {})[id] || {});
    function ajustarNoMapa(id, parcial, ordem) {
      const n = Object.assign({}, cfg.noMapa || {});
      n[id] = Object.assign({}, n[id] || {}, parcial);
      mudar(Object.assign({ noMapa: n }, ordem ? { fixados: ordem } : {}));
      if (aoMudarLugares) aoMudarLugares(); // os cantos ocupados mudaram: o mapa reenquadra no que sobra
    }
    // Um cartão: ajustes (tamanho e lugar) abertos em no máximo um por vez.
    let ajustesMapa = null;
    function cartaoMapa(id) {
      const { lugar, tam } = noMapa(id);
      const nome = esc(widget(id).nome);
      const i = GC.icone || (() => '');
      const ajustes = ajustesMapa === id ? `
          <div class="wm-ajustes" role="group" aria-label="Ajustar ${nome} no mapa">
            <span class="wm-aj-rot">Tamanho</span>
            <span class="w-tam" role="group" aria-label="Tamanho">${['p', 'm', 'l'].map((x) => `<button type="button" data-tam-mapa="${x}" data-alvo="${id}" class="${tam === x ? 'ativo' : ''}" aria-pressed="${tam === x}" title="${TAM_ROT[x]}">${x.toUpperCase()}</button>`).join('')}</span>
            <span class="wm-aj-rot wm-aj-lugar">Lugar no mapa</span>
            <span class="wm-lugares" role="group" aria-label="Lugar no mapa">${LUGARES().map((l) => `<button type="button" class="wm-l-${l.id}${lugar === l.id ? ' ativo' : ''}" data-lugar-mapa="${l.id}" data-alvo="${id}" aria-pressed="${lugar === l.id}" title="${esc(l.nome)}" aria-label="${esc(l.nome)}"></button>`).join('')}</span>
            <small class="wm-aj-dica">Ou arraste o cartão pelo cabeçalho.</small>
          </div>` : '';
      return `<section class="widget widget-${id} w-fixo wm-${tam}${tam === 'p' ? ' tam-p' : ''}" data-widget-mapa="${id}" style="--cor:${categoria(id).cor}" aria-label="${nome}">
          <header>
            <button type="button" class="w-fixo-btn wm-alca" data-alca-mapa="${id}" title="Arraste para outro lugar do mapa" aria-label="Mover ${nome} (${esc(nomeLugar(lugar))}). Setas para mudar a ordem.">${i('grip-vertical') || '⋮⋮'}</button>
            <h3 title="${nome}" data-arrastar-mapa="${id}">${ladrilho(id)} <span class="w-titulo">${nome}</span></h3>
            <button type="button" class="w-fixo-btn${ajustesMapa === id ? ' ativo' : ''}" data-ajustar-mapa="${id}" aria-expanded="${ajustesMapa === id}" title="Tamanho e lugar" aria-label="Tamanho e lugar de ${nome}">${i('adjustments-horizontal') || '⚙'}</button>
            <button type="button" class="w-fixo-btn" data-detalhes="${id}" aria-haspopup="dialog" title="Ver detalhes" aria-label="Ver detalhes de ${nome}">${i('arrows-maximize') || '+'}</button>
            ${botaoFixar(id, 'w-fixo-btn')}
          </header>${ajustes}
          <div class="w-corpo"></div>
        </section>`;
    }
    // Compacto mostra o resumo (o número que importa); Médio e Largo, o cartão inteiro. O resto abre em "Ver detalhes".
    let pendenteMapa = null; // redesenho que chegou no meio de um arraste: fica para quando soltar
    let ultimoDadosMapa = null;
    function desenharMapa(d) {
      if (!el.mapa) return;
      ultimoDadosMapa = d;
      if (arrasteMapa) { pendenteMapa = d; return; }
      const ids = fixados().filter((id) => widget(id));
      el.mapa.hidden = !ids.length || !d;
      if (el.mapa.hidden) { el.mapa.innerHTML = ''; return; }
      if (ajustesMapa && !ids.includes(ajustesMapa)) ajustesMapa = null;
      const rolagens = {};
      el.mapa.querySelectorAll('.wm-lugar').forEach((l) => { rolagens[l.dataset.lugar] = l.scrollTop; });
      const foco = (() => {
        const a = document.activeElement;
        if (!a || !el.mapa.contains(a)) return null;
        const k = ['data-alca-mapa', 'data-ajustar-mapa', 'data-tam-mapa', 'data-lugar-mapa', 'data-detalhes', 'data-fixar'].find((x) => a.hasAttribute(x));
        return k ? `[${k}="${a.getAttribute(k)}"]${a.dataset.alvo ? `[data-alvo="${a.dataset.alvo}"]` : ''}` : null;
      })();
      el.mapa.innerHTML = LUGARES().map((l) => {
        const aqui = ids.filter((id) => noMapa(id).lugar === l.id);
        return `<div class="wm-lugar" data-lugar="${l.id}" data-rotulo="${esc(l.nome)}">${aqui.map(cartaoMapa).join('')}</div>`;
      }).join('');
      ids.forEach((id) => {
        const corpo = el.mapa.querySelector(`[data-widget-mapa="${id}"] .w-corpo`);
        preencher(corpo, id, d);
        if (noMapa(id).tam === 'p') marcarCompacto(corpo);
      });
      el.mapa.querySelectorAll('.wm-lugar').forEach((l) => { if (rolagens[l.dataset.lugar]) l.scrollTop = rolagens[l.dataset.lugar]; });
      if (foco) { const n = el.mapa.querySelector(foco); if (n) n.focus({ preventScroll: true }); }
      if (observadorMapa) { observadorMapa.disconnect(); el.mapa.querySelectorAll('.w-fixo').forEach((w) => observadorMapa.observe(w)); }
      marcarTransbordo();
    }
    const redesenharMapa = () => { if (ultimoDadosMapa) desenharMapa(ultimoDadosMapa); };

    // ---- coluna com mais cartões do que cabe (tela baixa, cartões Médio/Largo): sem isso o último ficava
    // cortado ou escondido na rolagem, sem sinal. A borda esmaece e "Mais N" rola até o próximo escondido. ----
    const celular = () => !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
    function escondidosEmbaixo(l) {
      const fim = l.getBoundingClientRect().bottom + 2;
      return [...l.querySelectorAll(':scope > .w-fixo')].filter((w) => w.getBoundingClientRect().bottom > fim);
    }
    let quadroTransbordo = 0;
    function marcarTransbordo() {
      if (!el.mapa) return;
      cancelAnimationFrame(quadroTransbordo);
      quadroTransbordo = requestAnimationFrame(() => {
        const parado = !el.mapa.hidden && !celular() && !arrasteMapa;
        const base = el.mapa.getBoundingClientRect();
        el.mapa.querySelectorAll('.wm-lugar').forEach((l) => {
          const fora = !parado || l.dataset.lugar === 'baixo' ? [] : escondidosEmbaixo(l);
          l.classList.toggle('wm-transborda', fora.length > 0);
          let b = el.mapa.querySelector(`.wm-mais[data-mais-mapa="${l.dataset.lugar}"]`);
          if (!fora.length) { if (b) b.remove(); return; }
          const r = l.getBoundingClientRect();
          if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.className = 'wm-mais';
            b.dataset.maisMapa = l.dataset.lugar;
            el.mapa.appendChild(b);
          }
          const nomes = fora.map((w) => widget(w.dataset.widgetMapa)).filter(Boolean).map((w) => w.nome);
          b.title = nomes.join(', ');
          b.setAttribute('aria-label', `Mais ${fora.length} ${fora.length === 1 ? 'widget' : 'widgets'} abaixo: ${nomes.join(', ')}`);
          b.innerHTML = `Mais ${fora.length} ${GC.icone ? GC.icone('chevron-down') : '↓'}`;
          b.style.left = `${r.left - base.left + r.width / 2 - b.offsetWidth / 2}px`;
          b.style.top = `${r.bottom - base.top - b.offsetHeight - 6}px`;
        });
      });
    }
    // "Mais N": o próximo cartão escondido sobe até aparecer inteiro (ou até o topo, se for mais alto que a coluna).
    function rolarAoProximo(lugar) {
      const l = el.mapa.querySelector(`.wm-lugar[data-lugar="${lugar}"]`);
      const w = l && escondidosEmbaixo(l)[0];
      if (!w) return;
      const rl = l.getBoundingClientRect(); const rw = w.getBoundingClientRect();
      const passo = rw.height > rl.height ? rw.top - rl.top : rw.bottom - rl.bottom + 4;
      l.scrollBy({ top: passo, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    const observadorMapa = el.mapa && window.ResizeObserver ? new ResizeObserver(() => marcarTransbordo()) : null;
    if (el.mapa) {
      el.mapa.addEventListener('scroll', () => marcarTransbordo(), true);
      window.addEventListener('resize', () => marcarTransbordo());
    }

    // ---- arrastar o cartão do mapa para outro lugar (pelo cabeçalho ou pela alça) ----
    let arrasteMapa = null;
    function lugarMaisPerto(x, y) {
      let melhor = null;
      el.mapa.querySelectorAll('.wm-lugar').forEach((l) => {
        const r = l.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const dist = Math.hypot(dx, dy);
        // Empate (o ponteiro dentro de dois lugares): vence o de centro mais perto.
        const centro = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (!melhor || dist < melhor.dist || (dist === melhor.dist && centro < melhor.centro)) melhor = { l, dist, centro };
      });
      return melhor && melhor.l;
    }
    function moverMarcador(x, y) {
      const a = arrasteMapa;
      const alvo = lugarMaisPerto(x, y);
      if (!alvo) return;
      const linha = alvo.dataset.lugar === 'baixo';
      const irmaos = [...alvo.querySelectorAll('.widget[data-widget-mapa]')].filter((w) => w !== a.cartao);
      const depois = irmaos.find((w) => { const r = w.getBoundingClientRect(); return linha ? x < r.left + r.width / 2 : y < r.top + r.height / 2; });
      if (depois) alvo.insertBefore(a.marcador, depois); else alvo.appendChild(a.marcador);
      el.mapa.querySelectorAll('.wm-lugar').forEach((l) => l.classList.toggle('wm-alvo', l === alvo));
    }
    function iniciarArrasteMapa(e, id) {
      const cartao = el.mapa.querySelector(`[data-widget-mapa="${id}"]`);
      if (!cartao) return;
      const r = cartao.getBoundingClientRect();
      arrasteMapa = { id, cartao, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, ativo: false, ponteiro: e.pointerId };
    }
    function comecarDeVerdade() {
      const a = arrasteMapa;
      a.ativo = true;
      a.marcador = document.createElement('div');
      a.marcador.className = 'wm-marcador';
      a.marcador.style.height = `${Math.min(a.h, 160)}px`;
      a.marcador.style.width = `${a.w}px`;
      a.cartao.parentElement.insertBefore(a.marcador, a.cartao);
      el.mapa.classList.add('wm-arrastando');
      a.cartao.classList.add('wm-voando');
      a.cartao.style.width = `${a.w}px`;
      document.body.appendChild(a.cartao); // fora do lugar: segue o ponteiro por cima de tudo
    }
    function seguir(e) {
      const a = arrasteMapa;
      if (!a || e.pointerId !== a.ponteiro) return;
      if (!a.ativo) {
        if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 5) return;
        comecarDeVerdade();
      }
      e.preventDefault();
      a.cartao.style.transform = `translate(${e.clientX - a.dx}px, ${e.clientY - a.dy}px)`;
      moverMarcador(e.clientX, e.clientY);
    }
    function soltar(e, cancelar) {
      const a = arrasteMapa;
      if (!a || (e && e.pointerId !== a.ponteiro)) return;
      arrasteMapa = null;
      if (!a.ativo) return; // foi só um clique
      const destino = a.marcador.parentElement;
      const lugar = destino && destino.dataset.lugar;
      // A ordem nova: os cartões de cada lugar como ficaram na tela (o marcador no lugar do que voou).
      const ordem = [];
      el.mapa.querySelectorAll('.wm-lugar').forEach((l) => [...l.children].forEach((c) => {
        if (c === a.marcador) ordem.push(a.id);
        else if (c.dataset.widgetMapa) ordem.push(c.dataset.widgetMapa);
      }));
      a.cartao.remove();
      el.mapa.classList.remove('wm-arrastando');
      const antes = noMapa(a.id).lugar;
      const pendente = pendenteMapa;
      pendenteMapa = null;
      if (cancelar || !lugar) { if (pendente) desenharMapa(pendente); else redesenharMapa(); return; }
      const mudouOrdem = ordem.join() !== fixados().join();
      if (lugar === antes && !mudouOrdem) { if (pendente) desenharMapa(pendente); else redesenharMapa(); return; }
      if (pendente) ultimoDadosMapa = pendente;
      ajustarNoMapa(a.id, { lugar }, ordem);
      if (lugar !== antes) anunciar(`${widget(a.id).nome}: ${nomeLugar(lugar)}.`);
      // O cartão pousa com um destaque rápido.
      setTimeout(() => {
        const n = el.mapa.querySelector(`[data-widget-mapa="${a.id}"]`);
        if (n) { n.classList.add('w-recem'); setTimeout(() => n.classList.remove('w-recem'), 1200); }
      }, 30);
    }
    if (el.mapa) {
      el.mapa.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !window.matchMedia || window.matchMedia('(max-width: 760px)').matches) return;
        const p = e.target.closest('[data-alca-mapa], [data-arrastar-mapa]');
        if (!p) return;
        iniciarArrasteMapa(e, p.dataset.alcaMapa || p.dataset.arrastarMapa);
      });
      window.addEventListener('pointermove', seguir, { passive: false });
      window.addEventListener('pointerup', (e) => soltar(e, false));
      window.addEventListener('pointercancel', (e) => soltar(e, true));
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && arrasteMapa && arrasteMapa.ativo) { e.stopPropagation(); soltar(null, true); } }, true);
      // Teclado na alça: setas mudam a ordem dentro do lugar.
      el.mapa.addEventListener('keydown', (e) => {
        const b = e.target.closest('[data-alca-mapa]');
        if (!b) return;
        const id = b.dataset.alcaMapa;
        const lugar = noMapa(id).lugar;
        const doLugar = fixados().filter((x) => noMapa(x).lugar === lugar);
        const k = doLugar.indexOf(id);
        const passo = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
        if (!passo) return;
        e.preventDefault();
        const vizinho = doLugar[k + passo];
        if (!vizinho) return;
        const ordem = fixados().slice();
        const a = ordem.indexOf(id); const v = ordem.indexOf(vizinho);
        [ordem[a], ordem[v]] = [ordem[v], ordem[a]];
        mudar({ fixados: ordem });
        anunciar(`${widget(id).nome}: ${k + passo + 1}º de ${doLugar.length} em ${nomeLugar(lugar)}.`);
      });
    }
    // Cliques próprios do cartão do mapa (os outros seguem para clique()).
    function cliqueMapa(e) {
      const mais = e.target.closest('[data-mais-mapa]');
      if (mais) { rolarAoProximo(mais.dataset.maisMapa); return true; }
      const aj =e.target.closest('[data-ajustar-mapa]');
      if (aj) { ajustesMapa = ajustesMapa === aj.dataset.ajustarMapa ? null : aj.dataset.ajustarMapa; redesenharMapa(); return true; }
      const tm = e.target.closest('[data-tam-mapa]');
      if (tm) { ajustarNoMapa(tm.dataset.alvo, { tam: tm.dataset.tamMapa }); return true; }
      const lg = e.target.closest('[data-lugar-mapa]');
      if (lg) {
        const id = lg.dataset.alvo;
        // Vai para o fim do lugar novo.
        const ordem = [...fixados().filter((x) => x !== id), id];
        ajustarNoMapa(id, { lugar: lg.dataset.lugarMapa }, ordem);
        anunciar(`${widget(id).nome}: ${nomeLugar(lg.dataset.lugarMapa)}.`);
        return true;
      }
      return !!e.target.closest('[data-alca-mapa], [data-arrastar-mapa]');
    }

    // ---- desenho do painel ----
    const TAM_ROT = { p: 'Compacto', m: 'Médio', l: 'Largo' };
    function cabecalho(id, i) {
      const t = (cfg.tamanhos || {})[id] || 'm';
      const edicao = editando ? `
        <span class="w-edicao">
          <span class="w-tam" role="group" aria-label="Tamanho de ${esc(widget(id).nome)}">${['p', 'm', 'l'].map((x) => `<button type="button" data-tamanho="${x}" data-alvo="${id}" class="${t === x ? 'ativo' : ''}" aria-pressed="${t === x}" title="${TAM_ROT[x]}">${x.toUpperCase()}</button>`).join('')}</span>
        </span>` : '';
      return `<header>
          ${editando ? `<button type="button" class="w-alca" data-alca="${id}" aria-label="Mover ${esc(widget(id).nome)} (posição ${i + 1} de ${cfg.ativos.length}). Setas para mover." title="Arraste para mudar a ordem">${GC.icone ? GC.icone('grip-vertical') : '⋮⋮'}</button>` : ''}
          <h3 title="${esc(widget(id).nome)}">${ladrilho(id)} <span class="w-titulo">${esc(widget(id).nome)}</span></h3>
          ${edicao}
          ${botaoFixar(id, 'w-fixar')}
          ${editando ? `<button type="button" class="w-ocultar" data-ocultar="${id}" title="Tirar do painel" aria-label="Tirar ${esc(widget(id).nome)} do painel">${GC.icone ? GC.icone('eye-off') : '✕'}</button>` : ''}
        </header>`;
    }

    // Guarda o campo em foco (select/textarea de opção) para devolver depois do redesenho.
    function focoAtual(raiz) {
      const a = document.activeElement;
      if (!a || !raiz.contains(a)) return null;
      const w = a.closest('[data-widget]');
      const chave = ['data-opcao', 'data-alca', 'data-tamanho', 'data-ocultar', 'data-fixar'].find((k) => a.hasAttribute(k));
      if (!w || !chave) return null;
      return { w: w.dataset.widget, sel: `[${chave}="${a.getAttribute(chave)}"]${a.dataset.campo ? `[data-campo="${a.dataset.campo}"]` : ''}${a.dataset.tamanho ? `[data-alvo="${a.dataset.alvo}"]` : ''}`, ini: a.selectionStart, fim: a.selectionEnd };
    }
    function devolverFoco(f, raiz) {
      if (!f) return;
      const n = raiz.querySelector(`[data-widget="${f.w}"] ${f.sel}`);
      if (!n) return;
      n.focus({ preventScroll: true });
      if (typeof f.ini === 'number' && n.setSelectionRange) try { n.setSelectionRange(f.ini, f.fim); } catch (e) { /* select não tem seleção */ }
    }

    function desenharArea(d) {
      ultimoDados = d;
      el.escopo.textContent = d.escopo || '';
      if (observador) observador.disconnect();
      if (!cfg.ativos.length) {
        el.area.innerHTML = `<div class="w-vazio"><p>Nenhum widget no painel.</p><button type="button" class="btn-sec principal" data-configurar>${GC.icone ? GC.icone('layout-dashboard') : ''} Escolher widgets</button></div>`;
        fecharModal();
        return;
      }
      // FLIP: onde cada cartão estava antes do redesenho (para deslizar até o lugar novo).
      const antes = {};
      if (!semMovimento()) el.area.querySelectorAll('.widget[data-widget]').forEach((w) => { antes[w.dataset.widget] = w.getBoundingClientRect(); });
      const foco = focoAtual(el.area);
      el.area.innerHTML = cfg.ativos.map((id, i) => {
        const t = (cfg.tamanhos || {})[id];
        return `<section class="widget widget-${id}${t ? ` tam-${t}` : ''}" data-widget="${id}" style="--cor:${categoria(id).cor}${spans[id] ? `;grid-row-end: span ${spans[id]}` : ''}"${editando ? ' draggable="true"' : ''}>
          ${cabecalho(id, i)}
          <div class="w-corpo"></div>
        </section>`;
      }).join('');
      cfg.ativos.forEach((id) => {
        const sec = el.area.querySelector(`[data-widget="${id}"]`);
        preencher(sec.querySelector('.w-corpo'), id, d);
        const compacto = (cfg.tamanhos || {})[id] === 'p';
        if (compacto) marcarCompacto(sec.querySelector('.w-corpo'));
        // Tem detalhe guardado para o modal (ou está Compacto, com parte escondida): o cartão ganha o "Ver detalhes".
        if (compacto || sec.querySelector('.w-det')) {
          sec.insertAdjacentHTML('beforeend', `<button type="button" class="w-mais" data-detalhes="${id}" aria-haspopup="dialog">Ver detalhes <i class="ti ti-arrow-up-right" aria-hidden="true"></i></button>`);
        }
        if (observador) observador.observe(sec);
      });
      // Já visível: encaixa agora (o observador cobre o resto: abrir a gaveta, gráfico que carrega depois, resize).
      medirColunas();
      if (observador && el.area.offsetParent) el.area.querySelectorAll('.widget').forEach(encaixar);
      devolverFoco(foco, el.area);
      // FLIP: desliza de onde estava (só os que mudaram de lugar).
      Object.keys(antes).forEach((id) => {
        const w = el.area.querySelector(`[data-widget="${id}"]`);
        if (!w) return;
        const b = antes[id]; const a = w.getBoundingClientRect();
        const dx = b.left - a.left; const dy = b.top - a.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        w.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      });
      // Modal aberto: acompanha os números novos (ou fecha, se o widget foi desligado).
      if (modal && modal.open && modalId) {
        if (cfg.ativos.includes(modalId) || estaFixado(modalId)) desenharModal();
        else fecharModal();
      }
    }
    const semMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Cliques do cartão e do modal (as mesmas ações: ver no mapa, filtrar obras, abrir secretaria…).
    function clique(e) {
      const t = e.target;
      const det = t.closest('[data-detalhes]');
      if (det) return abrirModal(det.dataset.detalhes);
      const ocultarB = t.closest('[data-ocultar]');
      if (ocultarB) return ocultar(ocultarB.dataset.ocultar);
      const fx = t.closest('[data-fixar]');
      if (fx) return alternarFixado(fx.dataset.fixar);
      const tam = t.closest('[data-tamanho]');
      if (tam) return definirTamanho(tam.dataset.alvo, tam.dataset.tamanho);
      const opc = t.closest('button[data-opcao]');
      if (opc) return definirOpcao(opc.dataset.opcao, opc.dataset.campo || 'periodo', opc.dataset.valor);
      const ind = t.closest('[data-abrir-ind]');
      if (ind) return aoAbrirIndicador && aoAbrirIndicador(ind.dataset.abrirInd);
      const al = t.closest('[data-abrir-alerta]');
      if (al) return aoAbrirAlerta && aoAbrirAlerta(al.dataset.abrirAlerta);
      const vb = t.closest('[data-ver-bairro]');
      if (vb) return aoSelecionarBairro && aoSelecionarBairro(vb.dataset.verBairro);
      const cr = t.closest('[data-ir-crise]');
      if (cr) return aoIrCrise && aoIrCrise(cr.dataset.irCrise);
      const rs = t.closest('[data-resumo]');
      if (rs) return aoResumo && aoResumo(rs.dataset.resumo, rs.dataset.area || null);
      // Item de domínio: data-camada="<camada do mapa>" data-id="<ponto>" liga a camada e abre o ponto;
      // data-destaque="<bairros, por vírgula>" data-legenda="..." destaca bairros (dado agregado, nunca um ponto).
      const cam = t.closest('[data-camada]');
      if (cam) return aoAbrirCamada && aoAbrirCamada(cam.dataset.camada, cam.dataset.id || null);
      const dq = t.closest('[data-destaque]');
      if (dq) return aoDestacarBairros && aoDestacarBairros(dq.dataset.destaque.split(','), dq.dataset.legenda || '');
      const so = t.closest('[data-setor-obra]');
      if (so) {
        setorObras = so.dataset.setorObra || null;
        const corpo = el.area.querySelector('[data-widget="obras"] .w-corpo');
        if (corpo && dadosObras) corpo.innerHTML = conteudo.obras(dadosObras, { setor: setorObras });
        if (modalId === 'obras') desenharModal();
        return aoFiltrarObras && aoFiltrarObras(setorObras);
      }
      const p = t.closest('[data-pulso]');
      if (p) return aoAbrirSecretaria(p.dataset.pulso);
      const ip = t.closest('[data-ia-perguntar]');
      if (ip) return aoPerguntarIA && aoPerguntarIA(ip.dataset.iaPerguntar);
      // Satisfação só informa: filtrar por bairro é na gaveta Filtros (ou clicando no bairro no mapa).
      if (t.closest('[data-configurar]')) return el.aoConfigurar();
    }
    // Selects das opções (bairro, indicador, comparar) e a nota (salva ao parar de digitar).
    function mudouCampo(e) {
      const c = e.target.closest('select[data-opcao], textarea[data-opcao]');
      if (c) definirOpcao(c.dataset.opcao, c.dataset.campo, c.value);
    }
    let notaTimer = null;
    function digitou(e) {
      const c = e.target.closest('textarea[data-opcao]');
      if (!c) return;
      clearTimeout(notaTimer);
      notaTimer = setTimeout(() => definirOpcao(c.dataset.opcao, c.dataset.campo, c.value), 700);
    }
    el.area.addEventListener('click', clique);
    // Cartões fixados no mapa: ajustes próprios (tamanho, lugar) e, no resto, as mesmas ações do painel.
    if (el.mapa) el.mapa.addEventListener('click', (e) => { if (!cliqueMapa(e)) clique(e); });
    el.area.addEventListener('change', mudouCampo);
    el.area.addEventListener('input', digitou);

    // Teclado na alça: setas movem o widget (o foco acompanha).
    el.area.addEventListener('keydown', (e) => {
      const a = e.target.closest('[data-alca]');
      if (!a) return;
      const id = a.dataset.alca; const i = cfg.ativos.indexOf(id);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); moverPara(id, i - 1); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); moverPara(id, i + 1); }
      if (e.key === 'Home') { e.preventDefault(); moverPara(id, 0); }
      if (e.key === 'End') { e.preventDefault(); moverPara(id, cfg.ativos.length - 1); }
    });

    // Arrastar e soltar no painel (em edição) — e do catálogo da gaveta para o painel.
    function posicaoNoPainel(x, y) {
      const cartoes = [...el.area.querySelectorAll('.widget[data-widget]')].filter((w) => w.dataset.widget !== arrastando);
      // Ponteiro em cima de um cartão: antes dele na metade de cima (cartão largo) ou da esquerda; senão, depois.
      const largura = el.area.getBoundingClientRect().width;
      const sob = cartoes.findIndex((w) => { const r = w.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
      if (sob >= 0) {
        const r = cartoes[sob].getBoundingClientRect();
        const antes = r.width > largura * 0.75 ? y < r.top + Math.min(r.height, 200) / 2 : x < r.left + r.width / 2;
        return antes ? sob : sob + 1;
      }
      let melhor = cartoes.length; let dist = Infinity;
      cartoes.forEach((w, k) => {
        const r = w.getBoundingClientRect();
        const cx = r.left + r.width / 2; const cy = r.top + Math.min(r.height, 160) / 2;
        const dd = Math.hypot(x - cx, y - cy);
        if (dd < dist) { dist = dd; melhor = (x < cx || y < r.top + 40) ? k : k + 1; }
      });
      return melhor;
    }
    function marcarAlvo(k) {
      el.area.querySelectorAll('.w-alvo-antes, .w-alvo-depois').forEach((w) => w.classList.remove('w-alvo-antes', 'w-alvo-depois'));
      const cartoes = [...el.area.querySelectorAll('.widget[data-widget]')].filter((w) => w.dataset.widget !== arrastando);
      if (cartoes[k]) cartoes[k].classList.add('w-alvo-antes');
      else if (cartoes.length) cartoes[cartoes.length - 1].classList.add('w-alvo-depois');
    }
    el.area.addEventListener('dragstart', (e) => {
      const w = e.target.closest('.widget[data-widget]');
      if (!editando || !w) return;
      arrastando = w.dataset.widget;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastando);
      setTimeout(() => w.classList.add('w-arrastando'), 0);
    });
    el.area.addEventListener('dragover', (e) => {
      const tipos = [...(e.dataTransfer.types || [])];
      if (!arrastando && !tipos.includes('text/x-widget-novo')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = arrastando ? 'move' : 'copy';
      marcarAlvo(posicaoNoPainel(e.clientX, e.clientY));
    });
    el.area.addEventListener('dragleave', (e) => { if (!el.area.contains(e.relatedTarget)) marcarAlvo(-1); });
    el.area.addEventListener('drop', (e) => {
      e.preventDefault();
      const k = posicaoNoPainel(e.clientX, e.clientY);
      marcarAlvo(-1);
      const novo = e.dataTransfer.getData('text/x-widget-novo');
      if (novo) { arrastando = null; return adicionar(novo, k); }
      if (arrastando) { const id = arrastando; arrastando = null; moverPara(id, k); }
    });
    el.area.addEventListener('dragend', () => { arrastando = null; marcarAlvo(-1); el.area.querySelectorAll('.w-arrastando').forEach((w) => w.classList.remove('w-arrastando')); });

    // ---- gaveta Widgets: "No painel" (ordem, tamanho, opções) e o catálogo "Disponíveis" ----
    let busca = '';
    let categoriaFiltro = null;
    const opcoesAbertas = new Set();
    const previas = new Set();
    let confirmarExcluir = null;
    let ultimoHtmlGaveta = '';
    // Duas abas: "No painel" (ordem, tamanho, opções) e "Adicionar" (sugestões, Maia e catálogo).
    let abaGaveta = 'painel';
    // Adicionados nesta abertura da gaveta: ficam no catálogo com "✓ No painel" em vez de sumir.
    const recentes = new Set();
    const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const casa = (id) => !busca || sem(`${widget(id).nome} ${widget(id).descricao} ${categoria(id).nome}`).includes(sem(busca));

    function opcoesHtml(id) {
      const op = (cfg.opcoes || {})[id] || {};
      if (id === 'pulsos') {
        const marcados = cfg.pulsos || GC.data.areas.map((a) => a.id);
        return `<fieldset class="w-sub"><legend>Secretarias no pulso</legend>${GC.data.areas.map((a) => `<label><input type="checkbox" data-pulso-area="${a.id}"${marcados.includes(a.id) ? ' checked' : ''}> ${a.secretaria.emoji} ${esc(a.nome)}</label>`).join('')}</fieldset>`;
      }
      const sel = (campo, lista, atual, rotulo) => `<label class="w-sub-campo">${rotulo}<select data-opcao="${id}" data-campo="${campo}"><option value="">Automático</option>${lista.map((x) => `<option value="${esc(x.id)}"${x.id === atual ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`;
      const bairros = GC.data.bairros.map((b) => ({ id: b.id, nome: b.nome }));
      if (id === 'bairro_foco') return `<div class="w-sub">${sel('bairro', bairros, op.bairro, 'Bairro')}</div>`;
      if (id === 'comparativo') return `<div class="w-sub">${sel('a', bairros, op.a, 'Bairro A')}${sel('b', bairros, op.b, 'Bairro B')}</div>`;
      if (id === 'kpi') return `<div class="w-sub">${sel('ind', (GC.CATALOGO_INDICADORES || []).map((i) => ({ id: i.id, nome: `${i.id} · ${i.nome}` })), op.ind, 'Indicador')}</div>`;
      if (id === 'resumo') return `<div class="w-sub"><label class="w-sub-campo">Período<select data-opcao="resumo" data-campo="periodo"><option value="dia">Hoje</option><option value="semana"${op.periodo === 'semana' ? ' selected' : ''}>Semana</option></select></label></div>`;
      if (id === 'nota') return '<p class="w-sub w-sub-dica">O texto da nota é escrito direto no cartão.</p>';
      return '';
    }

    // Widget com versão pública (GC.conteudoPublico, embed.html): atalho para o código do site da Prefeitura.
    // A janela fica em js/embed/dialogo.js; quem pode, em GC.podeIncorporarWidgets (js/perfil.js).
    const podeSite = () => !!(GC.abrirIncorporar && GC.podeIncorporarWidgets && GC.podeIncorporarWidgets());
    const botaoSite = (id) => (podeSite() && GC.conteudoPublico && GC.conteudoPublico[id]
      ? `<button type="button" class="icone" data-incorporar="${id}" title="Colocar no site da Prefeitura" aria-label="Colocar ${esc(widget(id).nome)} no site da Prefeitura">${GC.icone ? GC.icone('code') : 'Site'}</button>` : '');

    function itemNoPainel(id, i) {
      const t = (cfg.tamanhos || {})[id] || 'm';
      const temOpcoes = !!widget(id).opcoes;
      const aberto = opcoesAbertas.has(id);
      const ia = widget(id).ia;
      const w = ia && widgetsIA ? widgetsIA.buscar(id) : null;
      const nome = esc(widget(id).nome);
      const ic = (n) => (GC.icone ? GC.icone(n) : '');
      const fixado = estaFixado(id);
      const temSite = podeSite() && GC.conteudoPublico && GC.conteudoPublico[id];
      // Uma linha: alça, nome, tamanho e "Mais". O resto (mover, fixar, site, opções, tirar) abre por baixo,
      // com nome escrito em cada botão (antes eram seis ícones soltos).
      return `<li class="w-item ligado${aberto ? ' aberto' : ''}" data-item="${id}" draggable="true">
        <button type="button" class="w-alca" data-alca-lista="${id}" aria-label="Mover ${nome} (posição ${i + 1} de ${cfg.ativos.length}). Setas para mover." title="Arraste para mudar a ordem">${GC.icone ? GC.icone('grip-vertical') : '⋮⋮'}</button>
        ${ladrilho(id)}
        <span class="w-item-txt"><b>${nome}${fixado ? ` <span class="w-selo-mapa" title="Fixado no mapa">${ic('pinned')}<span class="sr-only">fixado no mapa</span></span>` : ''}</b><small title="${esc(widget(id).descricao)}">${ia && w ? `“${esc(w.pergunta || widget(id).nome)}”` : esc(widget(id).descricao)}</small></span>
        <span class="w-tam" role="group" aria-label="Tamanho de ${nome}">${['p', 'm', 'l'].map((x) => `<button type="button" data-tamanho="${x}" data-alvo="${id}" class="${t === x ? 'ativo' : ''}" aria-pressed="${t === x}" title="${TAM_ROT[x]}">${x.toUpperCase()}</button>`).join('')}</span>
        <button type="button" class="icone w-mais-acoes${aberto ? ' ativo' : ''}" data-opcoes="${id}" aria-expanded="${aberto}" title="Mais ações" aria-label="Mais ações de ${nome}">${ic('dots')}</button>
        ${aberto ? `<div class="w-item-opcoes">
          <div class="w-acoes-rot">
            <button type="button" class="btn-sec" data-subir="${id}"${i === 0 ? ' disabled' : ''}>${ic('arrow-up')} Subir</button>
            <button type="button" class="btn-sec" data-descer="${id}"${i === cfg.ativos.length - 1 ? ' disabled' : ''}>${ic('arrow-down')} Descer</button>
            <button type="button" class="btn-sec${fixado ? ' ativo' : ''}" data-fixar="${id}" aria-pressed="${fixado}">${ic(fixado ? 'pinned-off' : 'pin')} ${fixado ? 'Tirar do mapa' : 'Fixar no mapa'}</button>
            ${temSite ? `<button type="button" class="btn-sec" data-incorporar="${id}">${ic('code')} No site da Prefeitura</button>` : ''}
            <button type="button" class="btn-sec w-perigo" data-remover="${id}">${ic('eye-off')} Tirar do painel</button>
          </div>
          ${temOpcoes ? opcoesHtml(id) : ''}
        </div>` : ''}
      </li>`;
    }

    // "Adicionar", ou "✓ No painel" logo depois de adicionar (clicar de novo tira).
    function botaoAdicionar(id) {
      const nome = esc(widget(id).nome);
      if (cfg.ativos.includes(id)) {
        return `<button type="button" class="btn-sec w-add w-no-painel" data-remover="${id}" aria-pressed="true" title="Tirar do painel" aria-label="${nome} está no painel. Tirar do painel">${GC.icone ? GC.icone('check') : '✓'} No painel</button>`;
      }
      return `<button type="button" class="btn-sec w-add" data-ligar-btn="${id}" aria-label="Adicionar ${nome} ao painel">${GC.icone ? GC.icone('plus') : '+'} Adicionar</button>`;
    }

    function itemCatalogo(id) {
      const ia = widget(id).ia;
      const w = ia && widgetsIA ? widgetsIA.buscar(id) : null;
      const quando = w && w.criadoEm ? new Date(w.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
      const confirmando = confirmarExcluir === id;
      return `<li class="w-item" data-item="${id}" draggable="true" data-catalogo="${id}">
        ${ladrilho(id)}
        <span class="w-item-txt"><b>${esc(widget(id).nome)}</b><small title="${esc(widget(id).descricao)}">${ia && w ? `“${esc(w.pergunta || '')}”${quando ? ` · criado em ${quando}` : ''}` : esc(widget(id).descricao)}</small></span>
        <span class="w-item-acoes">
          ${botaoSite(id)}
          <button type="button" class="icone${previas.has(id) ? ' ativo' : ''}" data-previa="${id}" aria-expanded="${previas.has(id)}" title="Prévia com os dados de agora" aria-label="Prévia de ${esc(widget(id).nome)}">${GC.icone ? GC.icone('eye') : '👁'}</button>
          ${ia ? `<button type="button" class="icone${confirmando ? ' perigo' : ''}" data-excluir-ia="${id}" title="${confirmando ? 'Clique de novo para excluir' : 'Excluir este widget da Maia'}" aria-label="${confirmando ? 'Confirmar exclusão de' : 'Excluir'} ${esc(widget(id).nome)}">${confirmando ? 'Excluir?' : (GC.icone ? GC.icone('trash') : '🗑')}</button>` : ''}
          ${botaoAdicionar(id)}
        </span>
        ${previas.has(id) ? `<div class="w-previa" aria-hidden="true"><div class="widget widget-${id} w-no-previa"><div class="w-corpo" data-previa-corpo="${id}"></div></div></div>` : ''}
      </li>`;
    }

    // Widget da Maia: pergunta de origem, data, se está no painel, e excluir com confirmação.
    function itemIA(id) {
      const w = widgetsIA ? widgetsIA.buscar(id) : null;
      const quando = w && w.criadoEm ? new Date(w.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      const ligado = cfg.ativos.includes(id);
      const confirmando = confirmarExcluir === id;
      return `<li class="w-item w-item-ia" data-item-ia="${id}">
        ${ladrilho(id)}
        <span class="w-item-txt"><b>${esc(widget(id).nome)}</b><small title="${esc(w ? w.pergunta : '')}">“${esc(w ? w.pergunta : widget(id).nome)}”</small>
          <em class="w-pos">${quando ? `criado em ${quando}` : 'da Maia'} · ${ligado ? `no painel (${cfg.ativos.indexOf(id) + 1}º)` : 'fora do painel'}</em></span>
        <span class="w-item-acoes">
          <button type="button" class="icone" data-ia-perguntar-gaveta="${id}" title="Refazer a pergunta à Maia" aria-label="Perguntar de novo: ${esc(w ? w.pergunta : '')}">${GC.icone ? GC.icone('message-circle') : '💬'}</button>
          <button type="button" class="icone${confirmando ? ' perigo' : ''}" data-excluir-ia="${id}" title="${confirmando ? 'Clique de novo para excluir' : 'Excluir este widget da Maia'}" aria-label="${confirmando ? 'Confirmar exclusão de' : 'Excluir'} ${esc(widget(id).nome)}">${confirmando ? 'Excluir?' : (GC.icone ? GC.icone('trash') : '🗑')}</button>
          ${ligado ? `<button type="button" class="btn-sec w-add" data-remover="${id}">${GC.icone ? GC.icone('eye-off') : ''} Tirar do painel</button>`
            : `<button type="button" class="btn-sec w-add" data-ligar-btn="${id}">${GC.icone ? GC.icone('plus') : '+'} Adicionar</button>`}
        </span>
      </li>`;
    }

    function desenharGaveta() {
      const d = ultimoDados || {};
      // Os da Maia têm seção própria (pergunta de origem e data), fora do catálogo "Disponíveis".
      const doCopiloto = GC.WIDGETS.filter((w) => w.ia).map((w) => w.id);
      // Na aba Adicionar, os recém-adicionados continuam no lugar (com "✓ No painel").
      const disponiveis = GC.WIDGETS.map((w) => w.id).filter((id) => (!cfg.ativos.includes(id) || recentes.has(id)) && !widget(id).ia);
      const todos = GC.WIDGETS.map((w) => w.id);
      const cats = (GC.CATEGORIAS_WIDGET || []).filter((c) => todos.some((id) => categoria(id).id === c.id));
      if (categoriaFiltro && !cats.some((c) => c.id === categoriaFiltro)) categoriaFiltro = null;
      // A categoria vale só para a aba Adicionar (é onde se procura); a busca vale para as duas.
      const cat = abaGaveta === 'adicionar' ? categoriaFiltro : null;
      const passa = (id) => casa(id) && (!cat || categoria(id).id === cat);
      const filtrados = disponiveis.filter(passa);
      const noPainel = cfg.ativos.filter((id) => casa(id));
      const iaVisiveis = doCopiloto.filter(passa);
      const nomeFiltro = cat ? (cats.find((c) => c.id === cat) || {}).nome : '';
      const ic = (n, c) => (GC.icone ? GC.icone(n, c) : '');
      let sugestoes = [];
      try {
        sugestoes = GC.sugerirWidgets ? GC.sugerirWidgets({
          ativos: cfg.ativos.filter((id) => !recentes.has(id)), risco: d.risco, gabinetes: typeof d.gabinetes === 'function' ? d.gabinetes() : [],
          indicadores: typeof d.indicadores === 'function' ? d.indicadores() : [], atencao: typeof d.atencao === 'function' ? d.atencao() : [],
          contratos: GC.gestao ? GC.gestao.contratos(d.agora) : null,
        }).filter((s) => GC.WIDGETS.some((w) => w.id === s.id)) : [];
      } catch (e) { sugestoes = []; }
      const vista = infoVista ? infoVista() : null;
      const alterada = !!(vista && vista.alterada);
      const grupos = (GC.CATEGORIAS_WIDGET || []).map((c) => {
        const ids = filtrados.filter((id) => categoria(id).id === c.id);
        return ids.length ? `<li class="w-grupo"><h4>${ic(c.icone)} ${esc(c.nome)} <small>${ids.length}</small></h4><ul class="w-lista">${ids.map(itemCatalogo).join('')}</ul></li>` : '';
      }).join('');
      const nDisp = GC.WIDGETS.filter((w) => !cfg.ativos.includes(w.id) && !w.ia).length;
      // Buscando na aba Adicionar um widget que já está no painel: um atalho para a outra aba.
      const jaNoPainel = abaGaveta === 'adicionar' && busca ? cfg.ativos.filter((id) => casa(id) && !recentes.has(id)).length : 0;
      const aba = (id, rot, n) => `<button type="button" role="tab" class="w-aba${abaGaveta === id ? ' ativo' : ''}" data-aba-gaveta="${id}" aria-selected="${abaGaveta === id}" aria-controls="w-aba-corpo"${abaGaveta === id ? '' : ' tabindex="-1"'}>${rot} <small>${n}</small></button>`;
      const site = podeSite() ? `<section class="w-site w-site-pe"><span>${ic('world-www')}<b>No site da Prefeitura</b><small>${Object.keys(GC.conteudoPublico || {}).length} widgets têm versão para o cidadão, com código para colar.</small></span>
            <button type="button" class="btn-sec" data-incorporar="">${ic('code')} Configurar e copiar código</button></section>` : '';
      const corpoPainel = `
          <section class="w-secao">
            ${noPainel.length ? `<p class="w-dica">Arraste pela alça ou use as setas do teclado para mudar a ordem.</p><ul class="w-lista w-lista-painel" data-lista-painel>${noPainel.map((id) => itemNoPainel(id, cfg.ativos.indexOf(id))).join('')}</ul>`
              : `<p class="w-vazio-lista">${!cfg.ativos.length ? 'O painel está vazio.' : 'Nenhum widget do painel com esse nome.'} <button type="button" class="w-link-btn" data-aba-gaveta="adicionar">Adicionar widgets</button></p>`}
          </section>
          ${site}`;
      const corpoAdicionar = `
          ${jaNoPainel ? `<p class="w-dica">${jaNoPainel === 1 ? '1 widget com esse nome já está' : `${jaNoPainel} widgets com esse nome já estão`} no painel. <button type="button" class="w-link-btn" data-aba-gaveta="painel">Ver no painel</button></p>` : ''}
          ${sugestoes.length && !busca && !cat ? `<section class="w-sugestoes"><h3>${ic('sparkles', 'ic-ia')} Sugerido agora</h3><ul>${sugestoes.map((s) => `<li>${ladrilho(s.id)}<span><b>${esc(widget(s.id).nome)}</b><small>${esc(s.motivo)}</small></span>${botaoAdicionar(s.id)}</li>`).join('')}</ul></section>` : ''}
          ${cat && !iaVisiveis.length ? '' : `<section class="w-secao w-secao-ia">
            <h3>${ic('sparkles', 'ic-ia')} Criados pela Maia <small>${doCopiloto.length}</small></h3>
            ${iaVisiveis.length ? `<ul class="w-lista">${iaVisiveis.map(itemIA).join('')}</ul>`
              : `<p class="w-vazio-lista">${doCopiloto.length ? 'Nenhum widget da Maia com esse nome.' : 'Pergunte à Maia e use “Fixar como widget” num gráfico da resposta: ele aparece aqui, com a pergunta e a data.'}</p>`}
          </section>`}
          ${cat === 'ia' ? '' : `<section class="w-secao">
            <h3>Disponíveis <small>${nDisp}</small></h3>
            ${filtrados.length ? `<ul class="w-grupos">${grupos}</ul>` : `<p class="w-vazio-lista">${cat && !busca ? `Todos os widgets de ${esc(nomeFiltro)} já estão no painel.` : 'Nenhum widget encontrado.'}</p>`}
          </section>`}`;
      const html = `
        <header class="gaveta-cab">
          <div><h2>${ic('layout-dashboard')} Widgets</h2><p>O que aparece no painel de Indicadores, em que ordem e em que tamanho.</p></div>
          <button type="button" class="gaveta-x" data-fechar aria-label="Fechar">${GC.icone ? GC.icone('x') : '✕'}</button>
        </header>
        <div class="w-abas" role="tablist" aria-label="Widgets">${aba('painel', 'No painel', cfg.ativos.length)}${aba('adicionar', 'Adicionar', nDisp)}</div>
        <div class="w-busca">
          <label class="w-busca-campo">${ic('search')}<input type="search" data-busca-widget placeholder="${abaGaveta === 'painel' ? 'Buscar no painel…' : 'Buscar widget…'}" value="${esc(busca)}" aria-label="Buscar widget"></label>
          ${abaGaveta === 'adicionar' ? `<label class="w-cat-campo">${ic('filter')}<span class="sr-only">Categoria</span><select data-cat-sel aria-label="Categoria">
            <option value="">Todas as categorias</option>
            ${cats.map((c) => `<option value="${c.id}"${categoriaFiltro === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
          </select></label>` : ''}
        </div>
        <div class="gaveta-corpo" id="w-aba-corpo" role="tabpanel">
          ${abaGaveta === 'painel' ? corpoPainel : corpoAdicionar}
        </div>
        <footer class="gaveta-pe">
          <div class="w-pe-txt">${alterada ? `<small class="w-alterada">${ic('point-filled', 'ic-alerta')} Alterações não salvas em <b>${esc(vista.nome)}</b></small>` : `<small>Visualização em uso: <b>${esc(vista ? vista.nome : '')}</b></small>`}
            <button type="button" class="w-link-btn" data-restaurar>Restaurar padrão</button></div>
          <button type="button" class="btn-sec${alterada ? ' principal' : ''}" data-salvar-vista>${ic('device-floppy')} Salvar como visualização</button>
        </footer>`;
      if (html === ultimoHtmlGaveta) return;
      ultimoHtmlGaveta = html;
      const corpo = el.gaveta.querySelector('.gaveta-corpo');
      // Trocou de aba: começa do topo; senão, mantém a rolagem.
      const rolagem = corpo && abaDesenhada === abaGaveta ? corpo.scrollTop : 0;
      abaDesenhada = abaGaveta;
      const a = document.activeElement;
      const naBusca = a && a.hasAttribute && a.hasAttribute('data-busca-widget');
      const pos = naBusca ? a.selectionStart : null;
      const focoSel = !naBusca && a && el.gaveta.contains(a) ? ['data-ligar-btn', 'data-subir', 'data-descer', 'data-remover', 'data-opcoes', 'data-previa', 'data-tamanho', 'data-cat-sel', 'data-aba-gaveta', 'data-alca-lista', 'data-excluir-ia', 'data-incorporar', 'data-fixar'].find((k) => a.hasAttribute(k)) : null;
      const focoVal = focoSel ? a.getAttribute(focoSel) : null;
      const focoAlvo = focoSel === 'data-tamanho' ? a.dataset.alvo : null;
      el.gaveta.innerHTML = html;
      const corpoNovo = el.gaveta.querySelector('.gaveta-corpo');
      if (corpoNovo) corpoNovo.scrollTop = rolagem;
      el.gaveta.querySelectorAll('[data-previa-corpo]').forEach((c) => { if (ultimoDados) preencher(c, c.dataset.previaCorpo, ultimoDados); });
      if (naBusca) { const i = el.gaveta.querySelector('[data-busca-widget]'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* ok */ } }
      if (focoSel) {
        let n = el.gaveta.querySelector(`[${focoSel}="${CSS.escape(focoVal)}"]${focoAlvo ? `[data-alvo="${focoAlvo}"]` : ''}`);
        // Adicionou: o foco vai para o item no painel.
        if (!n && focoSel === 'data-ligar-btn') n = el.gaveta.querySelector(`[data-remover="${CSS.escape(focoVal)}"]`) || el.gaveta.querySelector(`[data-alca-lista="${CSS.escape(focoVal)}"]`);
        // Tirou pelo "✓ No painel": o foco volta ao "Adicionar" do mesmo item.
        if (!n && focoSel === 'data-remover') n = el.gaveta.querySelector(`[data-ligar-btn="${CSS.escape(focoVal)}"]`);
        if (n) n.focus({ preventScroll: true });
      }
    }

    let abaDesenhada = null;
    function trocarAba(aba) {
      if (aba === abaGaveta) return;
      abaGaveta = aba;
      recentes.clear();
      desenharGaveta();
    }
    // Gaveta fechada: os recém-adicionados saem do catálogo na próxima abertura.
    // (As gavetas da direita dividem uma raiz; a aberta é a do data-aberta dela.)
    const raizGavetas = el.gaveta.parentElement;
    const gavetaAberta = () => !!raizGavetas && !raizGavetas.hidden && raizGavetas.dataset.aberta === el.gaveta.dataset.gaveta;
    if (raizGavetas) {
      new MutationObserver(() => { if (!gavetaAberta() && recentes.size) { recentes.clear(); desenharGaveta(); } })
        .observe(raizGavetas, { attributes: true, attributeFilter: ['data-aberta', 'hidden'] });
    }

    function mover(id, passo) {
      const i = cfg.ativos.indexOf(id);
      if (i < 0) return;
      moverPara(id, i + passo);
    }

    el.gaveta.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-fechar]')) return aoFechar();
      if (t.closest('[data-salvar-vista]')) return aoSalvarVista();
      if (t.closest('[data-restaurar]')) {
        const antes = { ativos: cfg.ativos.slice(), pulsos: cfg.pulsos, tamanhos: cfg.tamanhos, opcoes: cfg.opcoes };
        if (aoRestaurar) aoRestaurar();
        return mostrarToast('Painel restaurado para o padrão da visualização.', () => mudar(antes));
      }
      if (t.closest('[data-editar-painel]')) { aoFechar(); return alternarEdicao(true); }
      const site = t.closest('[data-incorporar]');
      if (site) return GC.abrirIncorporar(site.dataset.incorporar || null);
      const cat = t.closest('[data-cat]');
      if (cat) { categoriaFiltro = cat.dataset.cat || null; return desenharGaveta(); }
      const ab = t.closest('[data-aba-gaveta]');
      if (ab) { trocarAba(ab.dataset.abaGaveta); const n = el.gaveta.querySelector(`.w-aba[data-aba-gaveta="${abaGaveta}"]`); if (n) n.focus({ preventScroll: true }); return; }
      const s = t.closest('[data-subir]');
      if (s) return mover(s.dataset.subir, -1);
      const d = t.closest('[data-descer]');
      if (d) return mover(d.dataset.descer, 1);
      const fx = t.closest('[data-fixar]');
      if (fx) return alternarFixado(fx.dataset.fixar);
      const r = t.closest('[data-remover]');
      if (r) return ocultar(r.dataset.remover);
      const add = t.closest('[data-ligar-btn]');
      if (add) return adicionar(add.dataset.ligarBtn);
      const tam = t.closest('[data-tamanho]');
      if (tam) return definirTamanho(tam.dataset.alvo, tam.dataset.tamanho);
      const op = t.closest('[data-opcoes]');
      if (op) { const id = op.dataset.opcoes; if (opcoesAbertas.has(id)) opcoesAbertas.delete(id); else opcoesAbertas.add(id); return desenharGaveta(); }
      const ip = t.closest('[data-ia-perguntar-gaveta]');
      if (ip) return aoPerguntarIA && aoPerguntarIA(ip.dataset.iaPerguntarGaveta);
      const pv = t.closest('[data-previa]');
      if (pv) { const id = pv.dataset.previa; if (previas.has(id)) previas.delete(id); else previas.add(id); return desenharGaveta(); }
      const x = t.closest('[data-excluir-ia]');
      if (x) {
        const id = x.dataset.excluirIa;
        if (confirmarExcluir !== id) { confirmarExcluir = id; setTimeout(() => { if (confirmarExcluir === id) { confirmarExcluir = null; desenharGaveta(); } }, 4000); return desenharGaveta(); }
        confirmarExcluir = null;
        return aoExcluirIA && aoExcluirIA(id);
      }
    });
    el.gaveta.addEventListener('input', (e) => {
      if (e.target.hasAttribute('data-busca-widget')) { busca = e.target.value; desenharGaveta(); }
    });
    el.gaveta.addEventListener('change', (e) => {
      const t = e.target;
      if (t.hasAttribute('data-cat-sel')) { categoriaFiltro = t.value || null; return desenharGaveta(); }
      if (t.dataset.pulsoArea) {
        const marcados = [...el.gaveta.querySelectorAll('[data-pulso-area]:checked')].map((c) => c.dataset.pulsoArea);
        // Todas marcadas (ou nenhuma) = sem escolha: o widget mostra as 7.
        mudar({ pulsos: marcados.length && marcados.length < GC.data.areas.length ? marcados : null });
      }
      if (t.matches('select[data-opcao]')) definirOpcao(t.dataset.opcao, t.dataset.campo, t.value || undefined);
    });
    // Teclado na alça da lista: setas movem.
    el.gaveta.addEventListener('keydown', (e) => {
      // Abas: setas trocam (padrão de tablist).
      const ab = e.target.closest('.w-aba[data-aba-gaveta]');
      if (ab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        trocarAba(ab.dataset.abaGaveta === 'painel' ? 'adicionar' : 'painel');
        const n = el.gaveta.querySelector(`.w-aba[data-aba-gaveta="${abaGaveta}"]`);
        if (n) n.focus();
        return;
      }
      const a = e.target.closest('[data-alca-lista]');
      if (!a) return;
      const id = a.dataset.alcaLista; const i = cfg.ativos.indexOf(id);
      if (e.key === 'ArrowUp') { e.preventDefault(); moverPara(id, i - 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); moverPara(id, i + 1); }
    });
    // Arrastar na lista "No painel" (reordenar) e do catálogo (para a lista ou direto para o painel).
    let arrastoLista = null;
    el.gaveta.addEventListener('dragstart', (e) => {
      const it = e.target.closest('[data-item]');
      if (!it) return;
      arrastoLista = it.dataset.item;
      if (it.dataset.catalogo) e.dataTransfer.setData('text/x-widget-novo', arrastoLista);
      e.dataTransfer.setData('text/plain', arrastoLista);
      e.dataTransfer.effectAllowed = 'copyMove';
      setTimeout(() => it.classList.add('w-arrastando'), 0);
    });
    const alvoLista = (y) => {
      const itens = [...el.gaveta.querySelectorAll('[data-lista-painel] > [data-item]')].filter((x) => x.dataset.item !== arrastoLista);
      const k = itens.findIndex((x) => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
      return { itens, k: k < 0 ? itens.length : k };
    };
    el.gaveta.addEventListener('dragover', (e) => {
      if (!arrastoLista || !e.target.closest('[data-lista-painel], .w-secao')) return;
      e.preventDefault();
      const { itens, k } = alvoLista(e.clientY);
      el.gaveta.querySelectorAll('.w-alvo-antes, .w-alvo-depois').forEach((x) => x.classList.remove('w-alvo-antes', 'w-alvo-depois'));
      if (itens[k]) itens[k].classList.add('w-alvo-antes'); else if (itens.length) itens[itens.length - 1].classList.add('w-alvo-depois');
    });
    el.gaveta.addEventListener('drop', (e) => {
      if (!arrastoLista) return;
      e.preventDefault();
      const id = arrastoLista; arrastoLista = null;
      const { itens, k } = alvoLista(e.clientY);
      const destino = itens[k] ? cfg.ativos.indexOf(itens[k].dataset.item) : cfg.ativos.length;
      if (cfg.ativos.includes(id)) moverPara(id, destino > cfg.ativos.indexOf(id) ? destino - 1 : destino);
      else adicionar(id, destino);
    });
    el.gaveta.addEventListener('dragend', () => {
      arrastoLista = null;
      el.gaveta.querySelectorAll('.w-arrastando, .w-alvo-antes, .w-alvo-depois').forEach((x) => x.classList.remove('w-arrastando', 'w-alvo-antes', 'w-alvo-depois'));
    });

    if (el.botaoEditar) el.botaoEditar.addEventListener('click', () => alternarEdicao());

    function atualizar(novoCfg, dados) {
      cfg = GC.normalizarEstado({ widgets: novoCfg }).widgets;
      desenharMapa(dados);
      desenharArea(dados);
      desenharGaveta();
    }

    return { atualizar, alternarEdicao, editando: () => editando };
  };
})(window.GC = window.GC || {});
