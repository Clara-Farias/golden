(function (GC) {
  // v3: gaveta de Filtros, legenda (só informa) e as visualizações (seletor rápido ao lado
  // da busca, sobre o mapa + gaveta para gerenciar). Os filtros ligados se editam na gaveta.
  const esc = (t) => GC.escaparHtml(t);
  const SEV = [
    { id: 'critica', nome: 'Crítica' },
    { id: 'alta', nome: 'Alta' },
    { id: 'media', nome: 'Média' },
  ];
  const RECORTES = [
    { id: null, nome: 'Todas' },
    { id: 'criticas', nome: 'Só críticas' },
    { id: 'estourado', nome: 'Prazo estourado' },
    { id: 'andamento', nome: 'Em atendimento' },
  ];
  // Filtros de lista (vários valores): data-f → campo do estado e as opções.
  const LISTAS = {
    afetados: { campo: 'afetados', opcoes: () => GC.FAIXAS_AFETADOS },
    tempo: { campo: 'tempos', opcoes: () => GC.FAIXAS_TEMPO },
    origem: { campo: 'origens', opcoes: () => GC.ORIGENS },
  };
  const VAZIO = { recorte: null, severidades: [], areas: [], bairros: [], afetados: [], tempos: [], origens: [], multi: false, tratamento: null };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const cabecalho = (titulo, sub) => `
    <header class="gaveta-cab">
      <div><h2>${titulo}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <button type="button" class="gaveta-x" data-fechar aria-label="Fechar">✕</button>
    </header>`;

  // Alterna um item numa lista (devolve uma lista nova).
  const alternarEm = (lista, id) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  // Redesenhar com innerHTML destrói o controle com foco: guarda qual era (pelos data-*) e o devolve.
  const ATRIBUTOS_FOCO = ['data-f-bairro', 'data-f', 'data-vista', 'data-subir', 'data-descer', 'data-renomear', 'data-duplicar', 'data-excluir', 'data-menu', 'data-emoji'];
  function chaveDoFoco(raiz) {
    const a = document.activeElement;
    if (!a || a === raiz || !raiz.contains(a)) return null;
    const attr = ATRIBUTOS_FOCO.find((n) => a.hasAttribute(n));
    if (attr === 'data-f') return `[data-f="${a.dataset.f}"][data-v="${a.dataset.v}"]`;
    if (attr) return `[${attr}="${a.getAttribute(attr)}"]`;
    if (a.matches('summary')) return 'summary';
    const marca = [...a.attributes].find((x) => x.name.startsWith('data-'));
    return marca ? `[${marca.name}]` : null;
  }
  function devolverFoco(raiz, chave, reserva) {
    if (!chave) return;
    let alvo = raiz.querySelector(chave);
    if (!alvo || alvo.disabled) alvo = reserva ? raiz.querySelector(reserva) : null;
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    if (alvo.tagName === 'INPUT' && alvo.type !== 'checkbox') alvo.setSelectionRange(alvo.value.length, alvo.value.length);
  }

  // areasFixas: perfil de secretaria. A pasta é imposta pelo perfil: não aparece como filtro
  // removível, não conta no contador e as outras secretarias nem são oferecidas.
  GC.criarFiltrosUI = function (el, { aoMudar, aoFechar, aoSalvarVista, aoAlternarLegenda = null, areasFixas = null }) {
    let f = Object.assign({}, VAZIO);
    let buscaBairro = ''; // texto da busca na lista de bairros (sobrevive ao redesenho da gaveta)
    let maisAberto = false; // "Mais filtros" aberto (sobrevive ao redesenho)
    // Filtros que a pessoa ligou (a pasta fixa do perfil não conta).
    const contar = () => GC.contarFiltrosEstado(areasFixas ? Object.assign({}, f, { areas: [] }) : f);
    const contarMais = () => f.origens.length + (f.multi ? 1 : 0);

    function mudar(parcial) { aoMudar(Object.assign({}, f, parcial)); }

    // Um só ouvinte por contêiner: os botões trazem data-f (qual filtro) e data-v (valor).
    // "Só críticas" (Situação) e Gravidade dizem a mesma coisa: a última escolha vale e desliga a outra,
    // para não somar duas condições que se anulam (ex.: Só críticas + Média = 0 ocorrências).
    function aplicarClique(b) {
      const v = b.dataset.v === '' ? null : b.dataset.v;
      const tipo = b.dataset.f;
      if (tipo === 'recorte') mudar(v === 'criticas' ? { recorte: v, severidades: [] } : { recorte: v });
      if (tipo === 'sev') mudar(Object.assign({ severidades: alternarEm(f.severidades, v) }, f.recorte === 'criticas' ? { recorte: null } : {}));
      if (tipo === 'area' && !areasFixas) mudar({ areas: v === null ? [] : alternarEm(f.areas, v) });
      if (tipo === 'bairro') mudar({ bairros: v === null ? [] : alternarEm(f.bairros, v) });
      if (LISTAS[tipo]) { const c = LISTAS[tipo].campo; mudar({ [c]: v === null ? [] : alternarEm(f[c], v) }); }
      if (tipo === 'multi') mudar({ multi: !f.multi });
      if (tipo === 'tratamento') mudar({ tratamento: v === f.tratamento ? null : v });
    }

    // ---- gaveta ----
    el.gaveta.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) return aplicarClique(b);
      const resumo = e.target.closest('.mais-filtros > summary');
      if (resumo) { maisAberto = !resumo.parentElement.open; return; }
      if (e.target.closest('[data-fechar]')) return aoFechar();
      if (e.target.closest('[data-limpar]')) return aoMudar(VAZIO);
      if (e.target.closest('[data-salvar-vista]')) return aoSalvarVista();
    });

    // Seleção múltipla. Poucos bairros: um botão por bairro (liga/desliga). Cidade grande (dezenas de
    // bairros): lista com busca e caixas de marcar, em ordem alfabética.
    const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function seletorBairro() {
      const bairros = GC.data.bairros;
      if (bairros.length <= 20) return `<div class="chips">${chip('bairro', null, 'Todos', !f.bairros.length)}${bairros.map((b) => chip('bairro', b.id, esc(b.nome), f.bairros.includes(b.id))).join('')}</div>`;
      const ordem = [...bairros].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const q = normalizar(buscaBairro.trim());
      const n = f.bairros.length;
      return `<div class="multi-bairro">
          <div class="mb-topo">
            <input type="search" class="mb-busca" data-busca-bairro placeholder="Buscar entre ${bairros.length} bairros…" aria-label="Buscar bairro" value="${esc(buscaBairro)}">
            <button type="button" class="mb-limpar" data-f="bairro" data-v=""${n ? '' : ' disabled'}>${n ? `Limpar (${n})` : 'Todos'}</button>
          </div>
          <div class="mb-lista" role="group" aria-label="Bairros">${ordem.map((b) => `<label class="mb-item${f.bairros.includes(b.id) ? ' marcado' : ''}"${q && !normalizar(b.nome).includes(q) ? ' hidden' : ''} data-nome="${esc(normalizar(b.nome))}"><input type="checkbox" data-f-bairro="${b.id}"${f.bairros.includes(b.id) ? ' checked' : ''}> ${esc(b.nome)}</label>`).join('')}</div>
          <p class="mb-vazio" hidden>Nenhum bairro com esse nome.</p>
        </div>`;
    }
    function filtrarListaBairros() {
      const q = normalizar(buscaBairro.trim());
      let visiveis = 0;
      el.gaveta.querySelectorAll('.mb-item').forEach((l) => { l.hidden = !!q && !l.dataset.nome.includes(q); if (!l.hidden) visiveis++; });
      const vazio = el.gaveta.querySelector('.mb-vazio');
      if (vazio) vazio.hidden = visiveis > 0;
    }
    el.gaveta.addEventListener('change', (e) => {
      const id = e.target.dataset && e.target.dataset.fBairro;
      if (id) mudar({ bairros: alternarEm(f.bairros, id) });
    });
    el.gaveta.addEventListener('input', (e) => {
      if (!e.target.matches('[data-busca-bairro]')) return;
      buscaBairro = e.target.value;
      filtrarListaBairros();
    });

    function chip(filtro, valor, rotulo, ativo, extra = '') {
      return `<button type="button" class="chip-f${ativo ? ' ativo' : ''}" data-f="${filtro}" data-v="${valor === null ? '' : valor}" aria-pressed="${ativo}">${extra}${rotulo}</button>`;
    }
    // Grupo de faixas (afetados, tempo, origem): nenhuma marcada = todas.
    function grupoLista(tipo, titulo) {
      const { campo, opcoes } = LISTAS[tipo];
      return `<fieldset><legend>${titulo} <small>(nenhuma = todas)</small></legend><div class="chips">${opcoes().map((x) => chip(tipo, x.id, esc(x.nome), f[campo].includes(x.id))).join('')}</div></fieldset>`;
    }

    function secretarias() {
      if (!areasFixas) return `<fieldset><legend>Secretarias</legend><div class="chips">${chip('area', null, 'Todas', !f.areas.length)}${GC.data.areas.map((a) => chip('area', a.id, esc(a.nome), f.areas.includes(a.id), `${a.emoji} `)).join('')}</div></fieldset>`;
      const nomes = areasFixas.map(area).filter(Boolean);
      return `<fieldset><legend>${nomes.length === 1 ? 'Sua pasta' : 'Suas pastas'}</legend><div class="chips">${nomes.map((a) => `<span class="chip-f fixo" title="Definido pelo seu perfil de acesso"><i class="ti ti-lock" aria-hidden="true"></i> ${a.emoji} ${esc(a.nome)}</span>`).join('')}</div>
        <p class="filtro-nota">Seu perfil mostra só ${nomes.length === 1 ? 'esta secretaria' : 'estas secretarias'}.</p></fieldset>`;
    }

    function desenharGaveta(total) {
      const n = contar();
      // A parte fixa: aviso para leitor de tela (o total não ocupa mais espaço na tela).
      if (!el.gaveta.querySelector('.filtros-anuncio')) {
        el.gaveta.innerHTML = '<p class="filtros-anuncio so-leitor" aria-live="polite"></p><div class="filtros-redesenho"></div>';
      }
      const caixa = el.gaveta.querySelector('.filtros-redesenho');
      const lista = el.gaveta.querySelector('.mb-lista');
      const rolagemLista = lista ? lista.scrollTop : 0;
      const foco = chaveDoFoco(el.gaveta);
      el.gaveta.querySelector('.filtros-anuncio').textContent = `${plural(total, 'ocorrência', 'ocorrências')} no mapa`;
      const nMais = contarMais();
      const abrirMais = maisAberto || nMais > 0;
      caixa.innerHTML = `
        <div class="gaveta-corpo">
          ${!total && n ? `<p class="filtros-zero"><b>Nenhuma ocorrência</b> com ${n === 1 ? 'este filtro' : 'estes filtros'}. <button type="button" class="link-acao" data-limpar>Limpar filtros</button></p>` : ''}
          <fieldset><legend>Situação</legend><div class="chips">${RECORTES.map((r) => chip('recorte', r.id, r.nome, f.recorte === r.id)).join('')}</div></fieldset>
          <fieldset><legend>Ação do gabinete</legend><div class="chips">${chip('tratamento', null, 'Todas', !f.tratamento)}${GC.TRATAMENTOS.map((x) => chip('tratamento', x.id, x.nome, f.tratamento === x.id)).join('')}</div></fieldset>
          <fieldset><legend>Gravidade <small>(nenhuma = todas)</small></legend><div class="chips">${SEV.map((s) => chip('sev', s.id, s.nome, f.severidades.includes(s.id), `<i class="bola ${s.id}"></i>`)).join('')}</div></fieldset>
          ${secretarias()}
          ${grupoLista('afetados', 'Pessoas afetadas')}
          ${grupoLista('tempo', 'Tempo aberta')}
          <fieldset><legend>Bairros <small>(nenhum = cidade inteira)</small></legend>${seletorBairro()}</fieldset>
          <details class="mais-filtros"${abrirMais ? ' open' : ''}>
            <summary>Mais filtros${nMais ? ` <span class="mais-n">${nMais}</span>` : ''}</summary>
            ${grupoLista('origem', 'Origem do aviso')}
            <fieldset><legend>Coordenação</legend><div class="chips">${chip('multi', null, 'Envolve mais de uma secretaria', f.multi, '🤝 ')}</div></fieldset>
          </details>
        </div>
        <footer class="gaveta-pe">
          <button type="button" class="btn-sec" data-limpar${n ? '' : ' disabled'}>Limpar tudo</button>
          <button type="button" class="btn-sec principal" data-salvar-vista>💾 Salvar como visualização</button>
        </footer>`;
      const novaLista = el.gaveta.querySelector('.mb-lista');
      if (novaLista) novaLista.scrollTop = rolagemLista;
      filtrarListaBairros();
      // Se o controle sumiu ou ficou desligado (ex.: "Limpar tudo"), o foco vai para o primeiro filtro.
      devolverFoco(caixa, foco, '[data-f]');
    }

    // ---- legenda: só explica o mapa (com contagem). Filtrar é na gaveta Filtros (um lugar só). ----
    // Aberta ou fechada também é parte da visualização (aoAlternarLegenda avisa o app).
    function abrirLegenda(abrir) {
      el.legenda.hidden = !abrir;
      el.btnLegenda.setAttribute('aria-expanded', String(abrir));
      el.btnLegenda.classList.toggle('ativo', abrir);
    }
    el.btnLegenda.addEventListener('click', () => {
      abrirLegenda(el.legenda.hidden);
      if (aoAlternarLegenda) aoAlternarLegenda(!el.legenda.hidden);
    });

    // Contagens e seções vêm de GC.htmlLegendaMapa (js/foco.js, testada); aqui só se guarda o estado.
    let ultimasVisiveis = [];
    let camadas = {};
    function desenharLegenda() {
      el.legenda.innerHTML = GC.htmlLegendaMapa(ultimasVisiveis, f, camadas);
    }
    // O mapa avisa quando liga/desliga uma camada (risco, B.O.s, conquistas, camada da IA).
    function definirCamadas(c) {
      camadas = c || {};
      desenharLegenda();
    }

    function atualizar(filtros, visiveis) {
      f = GC.normalizarEstado({ filtros }).filtros;
      ultimasVisiveis = visiveis;
      desenharGaveta(visiveis.length);
      desenharLegenda();
      const n = contar();
      const contador = el.btnFiltros.querySelector('.filtros-contador');
      contador.textContent = n;
      contador.hidden = !n;
    }

    return { atualizar, definirCamadas, abrirLegenda, legendaAberta: () => !el.legenda.hidden };
  };

  // ---- visualizações: seletor no topo da gaveta Filtros + gaveta para gerenciar ----
  GC.criarVistasUI = function (el, vistas, { estadoAtual, aoAplicar, aoAbrirGaveta, aoFechar, cameraAtual = null, aoEnquadramento = null }) {
    let editando = null; // id da visualização sendo renomeada
    let listaAberta = false; // lista do seletor aberta
    let salvando = false; // campo "Salvar como nova" aberto no seletor
    let rascunho = ''; // nome sendo digitado (sobrevive ao redesenho)
    let erroNome = false;
    let guardarEnq = false; // "Guardar também o zoom e a posição do mapa" marcado ao salvar uma nova

    // O que a visualização mostra, por extenso: "Saúde · Crítica · 2 bairros · 6 widgets".
    const resumo = (v) => {
      const n = GC.normalizarEstado(v);
      const partes = GC.resumoFiltros(n.filtros);
      const fix = (n.widgets.fixados || []).length;
      return `${partes.length ? partes.join(' · ') : 'Sem filtros'} · ${plural(n.widgets.ativos.length, 'widget', 'widgets')}`
        + `${n.mapa.camadas.length ? ` · ${plural(n.mapa.camadas.length, 'camada', 'camadas')}` : ''}${fix ? ` · ${fix} no mapa` : ''}${n.mapa.enquadramento ? ' · zoom próprio' : ''}`;
    };
    // O que se salva numa visualização nova: o estado da tela e, se pedido, o zoom e a posição do mapa.
    const enquadramentoAgora = () => (cameraAtual ? cameraAtual() : null);
    const estadoParaSalvar = () => { const e = estadoAtual(); return guardarEnq && enquadramentoAgora() ? Object.assign({}, e, { mapa: Object.assign({}, e.mapa, { enquadramento: enquadramentoAgora() }) }) : e; };
    const caixaEnq = (classe) => (cameraAtual ? `<label class="vista-enq ${classe}"><input type="checkbox" data-enq${guardarEnq ? ' checked' : ''}> Guardar também o zoom e a posição do mapa</label>` : '');
    const prontas = () => vistas.lista().filter((v) => v.fixa);
    const suas = () => vistas.lista().filter((v) => !v.fixa);

    // ---- seletor (topo da gaveta Filtros) ----
    function opcao(v, atual) {
      return `<button type="button" aria-pressed="${v.id === atual.id}" class="vista-opcao${v.id === atual.id ? ' ativo' : ''}" data-vista="${v.id}"><span>${v.emoji} ${esc(v.nome)}</span><small>${esc(resumo(v))}</small></button>`;
    }
    function desenharBarra() {
      const atual = vistas.atual();
      const alterada = vistas.alterada(estadoAtual());
      const foco = chaveDoFoco(el.barra);
      const lSuas = suas();
      let linha = '';
      if (salvando) {
        linha = `<form class="vista-inline" data-form-inline>
            <input class="vista-nome-inline" maxlength="40" placeholder="Nome, ex.: Chuva no Centro" aria-label="Nome da nova visualização" value="${esc(rascunho)}">
            <button type="submit" class="btn-sec principal">Salvar</button>
            <button type="button" class="btn-sec" data-cancelar-inline>Cancelar</button>
          </form>
          ${caixaEnq('vista-enq-inline')}
          ${erroNome ? '<p class="vista-erro vista-erro-inline">Dê um nome para a visualização.</p>' : ''}`;
      } else if (alterada) {
        linha = `<div class="vista-alterada">
            <span class="va-rotulo"><i class="ponto" aria-hidden="true"></i> Alterada</span>
            <span class="va-acoes">
              ${atual.fixa ? '' : '<button type="button" class="va-btn principal" data-salvar title="Guardar as mudanças nesta visualização">Salvar</button>'}
              <button type="button" class="va-btn${atual.fixa ? ' principal' : ''}" data-salvar-nova>Salvar como nova</button>
              <button type="button" class="va-btn" data-descartar title="Voltar ao que a visualização guarda">Descartar</button>
            </span>
          </div>`;
      }
      // A lista suspensa abre sob o seletor: no topo, o que fazer com as mudanças (ou o campo de nome).
      el.barra.innerHTML = `
        <button type="button" class="vista-atual" data-abrir aria-haspopup="true" aria-expanded="${listaAberta}" title="Trocar a visualização (filtros e widgets salvos)${alterada ? ' · alterada' : ''}">
          <span class="vista-atual-rotulo">Visualização</span> ${atual.emoji} <b>${esc(atual.nome)}</b>${alterada ? '<i class="alterada" aria-label="alterada">•</i>' : ''} <i class="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="vistas-lista-suspensa vidro" ${listaAberta ? '' : 'hidden'}>
          ${linha}
          ${lSuas.length ? `<p class="vl-titulo">Suas visualizações</p>${lSuas.map((v) => opcao(v, atual)).join('')}` : ''}
          <p class="vl-titulo">Prontas</p>
          ${prontas().map((v) => opcao(v, atual)).join('')}
          <hr>
          <button type="button" class="vista-opcao gerenciar" data-gerenciar><i class="ti ti-settings" aria-hidden="true"></i> Gerenciar visualizações…</button>
        </div>`;
      devolverFoco(el.barra, foco, '[data-abrir]');
      ajustarAltura();
    }
    // A lista nunca passa do espaço visível: vai do seletor até a doca de baixo (ou o fim da tela) e rola por dentro.
    function ajustarAltura() {
      const lista = el.barra.querySelector('.vistas-lista-suspensa');
      if (!lista || lista.hidden) return;
      const doca = document.querySelector('.doca-botoes');
      const caixaDoca = doca && doca.offsetParent !== null ? doca.getBoundingClientRect() : null;
      const fundo = Math.min(window.innerHeight, caixaDoca && caixaDoca.top > 0 ? caixaDoca.top : window.innerHeight) - 12;
      lista.style.left = '';
      const caixa = lista.getBoundingClientRect();
      lista.style.maxHeight = `${Math.max(160, Math.round(fundo - caixa.top))}px`;
      // Tela estreita: se passar da borda direita, puxa para a esquerda (12px de margem).
      const sobra = caixa.right - (window.innerWidth - 12);
      if (sobra > 0) lista.style.left = `${-Math.round(sobra)}px`;
    }
    window.addEventListener('resize', ajustarAltura);
    // Fechar a lista também desiste do nome que estava sendo digitado.
    function abrirLista(v) { listaAberta = v; if (!v) { salvando = false; rascunho = ''; erroNome = false; guardarEnq = false; } desenharBarra(); }
    function fecharSalvar() { salvando = false; rascunho = ''; erroNome = false; guardarEnq = false; desenharBarra(); }

    // Abre a lista do seletor já com o campo de nome (sem trocar de gaveta).
    function iniciarSalvar() {
      salvando = true; listaAberta = true; erroNome = false;
      desenharBarra();
      const i = el.barra.querySelector('.vista-nome-inline');
      if (i) { i.scrollIntoView({ block: 'nearest' }); i.focus({ preventScroll: true }); }
    }

    document.addEventListener('pointerdown', (e) => { if (listaAberta && !el.barra.contains(e.target)) abrirLista(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!listaAberta) return;
      // Esc no campo de nome só desiste do nome; fora dele, fecha a lista.
      if (salvando && el.barra.contains(document.activeElement)) fecharSalvar();
      else abrirLista(false);
      el.barra.querySelector('[data-abrir]').focus();
      e.stopImmediatePropagation();
    }, true);

    el.barra.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-abrir]')) return abrirLista(!listaAberta);
      const v = t.closest('[data-vista]');
      if (v) { listaAberta = false; const estado = vistas.selecionar(v.dataset.vista); if (estado) aoAplicar(estado); desenharBarra(); return; }
      if (t.closest('[data-salvar]')) { vistas.sobrescrever(vistas.atual().id, estadoAtual()); listaAberta = false; atualizar(); return el.barra.querySelector('[data-abrir]').focus(); }
      if (t.closest('[data-salvar-nova]')) return iniciarSalvar();
      if (t.closest('[data-descartar]')) { listaAberta = false; aoAplicar(vistas.selecionar(vistas.atual().id)); return el.barra.querySelector('[data-abrir]').focus(); }
      if (t.closest('[data-cancelar-inline]')) { fecharSalvar(); return el.barra.querySelector('[data-abrir]').focus(); }
      if (t.closest('[data-gerenciar]')) { listaAberta = false; desenharBarra(); aoAbrirGaveta(); }
    });
    el.barra.addEventListener('input', (e) => {
      if (!e.target.matches('.vista-nome-inline')) return;
      rascunho = e.target.value;
      if (erroNome) { erroNome = false; const p = el.barra.querySelector('.vista-erro-inline'); if (p) p.remove(); }
    });
    // A caixa "Guardar também o zoom" vale para o formulário da barra e o da gaveta (um estado só).
    const marcarEnq = (e) => { if (e.target.matches('[data-enq]')) guardarEnq = e.target.checked; };
    el.barra.addEventListener('change', marcarEnq);
    el.gaveta.addEventListener('change', marcarEnq);
    el.barra.addEventListener('submit', (e) => {
      e.preventDefault();
      const nova = vistas.salvarComo(rascunho, estadoParaSalvar());
      if (!nova) { erroNome = true; desenharBarra(); return; }
      if (aoEnquadramento) aoEnquadramento((nova.mapa || {}).enquadramento || null);
      salvando = false; rascunho = ''; erroNome = false; listaAberta = false; guardarEnq = false;
      atualizar();
      el.barra.querySelector('[data-abrir]').focus();
    });

    // ---- gaveta Visualizações (gerenciar) ----
    // De cima para baixo: a em uso (com o que fazer com as mudanças e o zoom), as suas, as prontas
    // e, no pé fixo, "Salvar o que está na tela". Cada salva tem um menu ⋯ (ícone, renomear, duplicar,
    // mover, excluir); excluir não pergunta: o aviso embaixo oferece "Desfazer".
    let menuAberto = null; // id da visualização com o menu ⋯ aberto
    let recem = null; // id da cópia recém-criada (destaque breve e dica no campo de nome)
    let rascunhoGaveta = ''; // nome digitado no pé (sobrevive ao redesenho)

    function focarNome() { setTimeout(() => { const i = el.gaveta.querySelector('.vista-nome'); if (i) i.focus(); }, 60); }

    function menu(v, i, total) {
      const op = (attr, ic, rotulo, desligado, classe = '') => `<button type="button" role="menuitem" class="vm-item${classe}" ${attr}="${v.id}"${desligado ? ' disabled' : ''}><i class="ti ti-${ic}" aria-hidden="true"></i> ${rotulo}</button>`;
      const emojis = (GC.EMOJIS_VISTA || []).map((x) => `<button type="button" class="vm-emoji${x.emoji === v.emoji ? ' ativo' : ''}" data-emoji="${x.emoji}" data-alvo="${v.id}" aria-pressed="${x.emoji === v.emoji}" title="${x.nome}" aria-label="Ícone ${x.nome}">${x.emoji}</button>`).join('');
      return `<div class="vista-menu vidro" role="menu" aria-label="Ações de ${esc(v.nome)}">
          <p class="vm-rotulo">Ícone</p>
          <div class="vm-emojis">${emojis}</div>
          <hr>
          ${op('data-renomear', 'pencil', 'Renomear')}
          ${op('data-duplicar', 'copy', 'Duplicar')}
          ${op('data-subir', 'arrow-up', 'Mover para cima', i === 0)}
          ${op('data-descer', 'arrow-down', 'Mover para baixo', i === total - 1)}
          <hr>
          ${op('data-excluir', 'trash', 'Excluir', false, ' perigo')}
        </div>`;
    }

    function item(v, atual, i, total) {
      const emUso = v.id === atual.id;
      let corpo;
      if (editando === v.id) {
        corpo = `<span class="vista-editar"><input class="vista-renomear" value="${esc(v.nome)}" maxlength="40" aria-label="Novo nome de ${esc(v.nome)}">
          <small>${recem === v.id ? 'Cópia criada. Dê um nome: ' : ''}Enter salva · Esc cancela</small></span>`;
      } else {
        const miolo = `<span class="vista-nome-linha"><span class="vista-emoji" aria-hidden="true">${v.emoji}</span><b>${esc(v.nome)}</b></span><small>${esc(resumo(v))}</small>`;
        // A em uso não se "aplica" de novo: o clique descartaria as mudanças sem avisar.
        corpo = emUso
          ? `<div class="vista-aplicar em-uso" aria-current="true">${miolo}</div>`
          : `<button type="button" class="vista-aplicar" data-vista="${v.id}" title="Usar esta visualização">${miolo}</button>`;
      }
      const selo = emUso ? '<small class="vista-em-uso"><i class="ti ti-check" aria-hidden="true"></i> Em uso</small>' : '';
      const acoes = v.fixa
        ? `<button type="button" class="icone" data-duplicar="${v.id}" title="Duplicar para editar" aria-label="Duplicar para editar: ${esc(v.nome)}"><i class="ti ti-copy" aria-hidden="true"></i></button>`
        : `<button type="button" class="icone" data-menu="${v.id}" aria-haspopup="menu" aria-expanded="${menuAberto === v.id}" title="Mais ações" aria-label="Mais ações: ${esc(v.nome)}"><i class="ti ti-dots" aria-hidden="true"></i></button>${menuAberto === v.id ? menu(v, i, total) : ''}`;
      return `<li class="${emUso ? 'atual' : ''}${recem === v.id ? ' recem' : ''}${menuAberto === v.id ? ' com-menu' : ''}" data-item="${v.id}">${corpo}<span class="vista-acoes">${selo}${acoes}</span></li>`;
    }

    // O cartão de cima: a visualização em uso, o que fazer com as mudanças e o zoom guardado.
    function cartaoAtual(atual, alterada) {
      const enq = (atual.mapa || {}).enquadramento;
      return `<section class="vista-cartao${alterada ? ' alterada' : ''}" aria-label="Visualização em uso">
          <p class="vc-rotulo">Em uso agora${alterada ? '<span class="vc-alterada"><i class="ponto" aria-hidden="true"></i> Alterada</span>' : ''}</p>
          <p class="vc-nome"><span class="vista-emoji" aria-hidden="true">${atual.emoji}</span> <b>${esc(atual.nome)}</b></p>
          <p class="vc-resumo">${esc(resumo(atual))}</p>
          ${alterada ? `<p class="vc-dica">O que está na tela é diferente do que ela guarda.</p>
          <div class="vc-acoes">${atual.fixa ? '' : '<button type="button" class="btn-sec principal" data-sobrescrever>Salvar nesta visualização</button>'}<button type="button" class="btn-sec" data-descartar-g>Descartar mudanças</button></div>` : ''}
          ${atual.fixa ? `<p class="vc-dica">Pronta: não muda. <button type="button" class="link-acao" data-duplicar="${atual.id}">Duplicar para editar</button></p>` : ''}
          ${!atual.fixa && cameraAtual ? `<div class="vc-enq"><span><i class="ti ti-focus-centered" aria-hidden="true"></i> Zoom e posição: <b>${enq ? 'guardados' : 'a cidade inteira'}</b></span>
            <span class="vc-enq-acoes"><button type="button" class="link-acao" data-guardar-enq>${enq ? 'Trocar pelos de agora' : 'Guardar os de agora'}</button>${enq ? '<button type="button" class="link-acao" data-tirar-enq>Voltar à cidade inteira</button>' : ''}</span></div>` : ''}
        </section>`;
    }

    function desenharGaveta() {
      const atual = vistas.atual();
      const alterada = vistas.alterada(estadoAtual());
      const foco = chaveDoFoco(el.gaveta);
      const lSuas = suas();
      const lProntas = prontas();
      const temNome = !!rascunhoGaveta.trim();
      el.gaveta.innerHTML = `
        ${cabecalho('🗂 Visualizações', 'Conjuntos de filtros, widgets e camadas. Troque pelo seletor ao lado da busca.')}
        <div class="gaveta-corpo">
          ${cartaoAtual(atual, alterada)}
          <h3 class="vl-secao">Suas visualizações${lSuas.length ? ` <small>${lSuas.length}</small>` : ''}</h3>
          ${lSuas.length
            ? `<ul class="vistas-lista">${lSuas.map((v, i) => item(v, atual, i, lSuas.length)).join('')}</ul>`
            : '<p class="vl-vazio">Você ainda não salvou nenhuma. Ajuste filtros e widgets e salve no pé desta gaveta, ou duplique uma pronta.</p>'}
          <h3 class="vl-secao">Prontas</h3>
          <ul class="vistas-lista">${lProntas.map((v, i) => item(v, atual, i, lProntas.length)).join('')}</ul>
        </div>
        <form class="vista-form gaveta-pe">
          <label class="vl-secao" for="vista-nome-nova">Salvar o que está na tela como nova</label>
          <span class="vista-form-linha"><input id="vista-nome-nova" class="vista-nome" maxlength="40" placeholder="Nome, ex.: Chuva no Centro" autocomplete="off" value="${esc(rascunhoGaveta)}"><button type="submit" class="btn-sec principal"${temNome ? '' : ' disabled'}>Salvar</button></span>
          <span class="vista-form-info">${caixaEnq('vista-enq-gaveta')}<small class="vista-contador" aria-live="polite"${rascunhoGaveta.length >= 30 ? '' : ' hidden'}>${rascunhoGaveta.length}/40</small></span>
          <p class="vista-erro" hidden>Dê um nome para a visualização.</p>
        </form>`;
      // Menu perto do fim da lista abre para cima, se couber; senão a lista rola até ele.
      const m = el.gaveta.querySelector('.vista-menu');
      if (m) {
        const corpo = el.gaveta.querySelector('.gaveta-corpo').getBoundingClientRect();
        const caixa = m.getBoundingClientRect();
        const li = m.closest('li').getBoundingClientRect();
        if (caixa.bottom > corpo.bottom && li.top - caixa.height - 4 >= corpo.top) m.classList.add('acima');
        else if (caixa.bottom > corpo.bottom) m.scrollIntoView({ block: 'nearest' });
      }
      const ren = el.gaveta.querySelector('.vista-renomear');
      if (ren) {
        ren.focus();
        ren.select();
        // Sai do campo antes de redesenhar (com o foco nele, atualizar() acharia que ainda está digitando).
        const concluir = (salvar) => {
          const id = editando;
          if (salvar) vistas.renomear(id, ren.value);
          editando = null;
          recem = null;
          ren.onblur = null;
          ren.blur();
          atualizar();
          const b = el.gaveta.querySelector(`[data-menu="${id}"]`);
          if (b) b.focus();
        };
        ren.onkeydown = (e) => { if (e.key === 'Enter') concluir(true); if (e.key === 'Escape') { e.stopPropagation(); concluir(false); } };
        ren.onblur = () => { if (editando) concluir(true); };
      } else devolverFoco(el.gaveta, foco, '.vista-nome');
      const nome = el.gaveta.querySelector('.vista-nome');
      const enviar = el.gaveta.querySelector('.vista-form [type="submit"]');
      const contador = el.gaveta.querySelector('.vista-contador');
      nome.oninput = () => {
        rascunhoGaveta = nome.value;
        el.gaveta.querySelector('.vista-erro').hidden = true;
        enviar.disabled = !nome.value.trim();
        contador.hidden = nome.value.length < 30;
        contador.textContent = `${nome.value.length}/40`;
      };
      el.gaveta.querySelector('.vista-form').onsubmit = (e) => {
        e.preventDefault();
        const nova = vistas.salvarComo(nome.value, estadoParaSalvar());
        if (!nova) { el.gaveta.querySelector('.vista-erro').hidden = false; nome.focus(); return; }
        if (aoEnquadramento) aoEnquadramento((nova.mapa || {}).enquadramento || null);
        guardarEnq = false;
        rascunhoGaveta = '';
        nome.value = '';
        nome.blur();
        atualizar();
        const li = el.gaveta.querySelector(`[data-item="${nova.id}"]`);
        if (li) li.scrollIntoView({ block: 'nearest' });
      };
    }

    function fecharMenu(focar) {
      const id = menuAberto;
      if (!id) return false;
      menuAberto = null;
      desenharGaveta();
      if (focar) { const b = el.gaveta.querySelector(`[data-menu="${id}"]`); if (b) b.focus(); }
      return true;
    }
    document.addEventListener('pointerdown', (e) => {
      if (menuAberto && !e.target.closest('.vista-menu') && !e.target.closest('[data-menu]')) fecharMenu(false);
    });
    // Esc com o menu aberto fecha só o menu (antes do Esc geral, que fecharia a gaveta).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !menuAberto || !el.gaveta.contains(document.activeElement)) return;
      fecharMenu(true);
      e.stopImmediatePropagation();
    }, true);

    // Excluir na hora; o aviso embaixo traz "Desfazer" (devolve na mesma posição).
    function excluir(idV) {
      const lista = suas();
      const pos = lista.findIndex((v) => v.id === idV);
      const v = lista[pos];
      if (!v) return;
      const eraAtual = vistas.atual().id === idV;
      menuAberto = null;
      vistas.remover(idV);
      if (eraAtual) aoAplicar(vistas.selecionar(vistas.atual().id));
      else atualizar();
      // O foco vai para a vizinha (ou para o campo de nome, se a lista esvaziou).
      const vizinha = suas()[Math.min(pos, suas().length - 1)];
      const alvo = vizinha && el.gaveta.querySelector(`[data-menu="${vizinha.id}"]`);
      (alvo || el.gaveta.querySelector('.vista-nome')).focus({ preventScroll: true });
      if (!GC.mostrarDesfazer) return;
      GC.mostrarDesfazer({ rotulo: `“${v.nome}” excluída`, semAtalho: true }, () => {
        if (!vistas.restaurar(v, pos)) return;
        if (eraAtual) aoAplicar(vistas.selecionar(v.id));
        else atualizar();
        if (GC.avisoDesfazer) GC.avisoDesfazer(`“${v.nome}” voltou`, true);
      });
    }

    el.gaveta.addEventListener('click', (e) => {
      const t = e.target;
      const id = (attr) => { const b = t.closest(`[${attr}]`); return b ? b.getAttribute(attr) : null; };
      if (t.closest('[data-fechar]')) return aoFechar();
      if (id('data-vista')) { menuAberto = null; const estado = vistas.selecionar(id('data-vista')); if (estado) aoAplicar(estado); return; }
      if (t.closest('[data-sobrescrever]')) { vistas.sobrescrever(vistas.atual().id, estadoAtual()); return atualizar(); }
      if (t.closest('[data-descartar-g]')) { aoAplicar(vistas.selecionar(vistas.atual().id)); const b = el.gaveta.querySelector('.vc-nome'); return b && b.scrollIntoView({ block: 'nearest' }); }
      const enqNovo = t.closest('[data-guardar-enq]') ? enquadramentoAgora() : t.closest('[data-tirar-enq]') ? null : undefined;
      if (enqNovo !== undefined) {
        vistas.guardarEnquadramento(vistas.atual().id, enqNovo);
        if (aoEnquadramento) aoEnquadramento((vistas.atual().mapa || {}).enquadramento || null);
        atualizar();
        const b = el.gaveta.querySelector('[data-guardar-enq]');
        if (b) b.focus();
        return;
      }
      const abrir = id('data-menu');
      if (abrir) {
        if (menuAberto === abrir) return fecharMenu(true);
        menuAberto = abrir; editando = null;
        desenharGaveta();
        const primeiro = el.gaveta.querySelector('.vista-menu .vm-emoji.ativo') || el.gaveta.querySelector('.vista-menu button');
        if (primeiro) primeiro.focus();
        return;
      }
      const em = t.closest('[data-emoji]');
      if (em) { vistas.trocarEmoji(em.dataset.alvo, em.dataset.emoji); desenharBarra(); desenharGaveta(); return; }
      const subir = id('data-subir');
      const mov = subir || id('data-descer');
      if (mov) {
        vistas.mover(mov, subir ? -1 : 1);
        atualizar();
        // Foco na mesma opção; se ela ficou desligada (chegou ao topo/fundo), na outra.
        const [mesma, outra] = subir ? ['data-subir', 'data-descer'] : ['data-descer', 'data-subir'];
        const alvo = el.gaveta.querySelector(`[${mesma}="${mov}"]:not(:disabled)`) || el.gaveta.querySelector(`[${outra}="${mov}"]:not(:disabled)`);
        if (alvo) alvo.focus();
        return;
      }
      if (id('data-renomear')) { editando = id('data-renomear'); menuAberto = null; return desenharGaveta(); }
      // Duplicar já abre o nome da cópia para editar, com destaque e a lista rolada até ela.
      if (id('data-duplicar')) {
        const c = vistas.duplicar(id('data-duplicar'));
        if (!c) return;
        editando = c.id; recem = c.id; menuAberto = null;
        desenharBarra(); desenharGaveta();
        const li = el.gaveta.querySelector(`[data-item="${c.id}"]`);
        if (li) {
          li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          setTimeout(() => li.classList.remove('recem'), 2400);
        }
        return;
      }
      const ex = id('data-excluir');
      if (ex) excluir(ex);
    });

    function atualizar() {
      desenharBarra();
      // Não redesenha a gaveta com o prefeito digitando um nome.
      const digitando = el.gaveta.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
      if (!digitando) desenharGaveta();
    }

    return { atualizar, focarNome, iniciarSalvar };
  };
})(window.GC = window.GC || {});
