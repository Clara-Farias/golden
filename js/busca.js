(function (GC) {
  // Busca rápida (lupa ao lado de Filtros): acha bairro, ocorrência, secretaria, hospital/UPA, escola,
  // obra, farmácia, linha de ônibus, rota da coleta, área de risco ou tela, e leva até ela.
  // GC.buscar é puro (testável em Node); GC.criarBuscaUI cuida do campo e da lista.
  const esc = (t) => GC.escaparHtml(t);
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

  // sinonimos: palavras que acham o tipo mesmo sem estar no nome ("hospital" acha a UPA).
  GC.TIPOS_BUSCA = {
    bairro: { nome: 'Bairro', icone: 'map-pin', sinonimos: 'bairro' },
    ocorrencia: { nome: 'Ocorrência', icone: 'alert-circle', sinonimos: 'ocorrencia problema chamado' },
    secretaria: { nome: 'Secretaria', icone: 'building', sinonimos: 'secretaria orgao' },
    leito: { nome: 'Saúde', icone: 'building-hospital', sinonimos: 'saude hospital posto pronto-socorro leito' },
    escola: { nome: 'Escola', icone: 'school', sinonimos: 'escola educacao ensino colegio creche' },
    obra: { nome: 'Obra', icone: 'crane', sinonimos: 'obra construcao reforma' },
    farmacia: { nome: 'Farmácia', icone: 'pill', sinonimos: 'farmacia ubs remedio medicamento' },
    linha: { nome: 'Linha de ônibus', icone: 'bus', sinonimos: 'linha onibus transporte' },
    coleta: { nome: 'Coleta', icone: 'truck', sinonimos: 'coleta lixo residuos' },
    risco: { nome: 'Área de risco', icone: 'alert-triangle', sinonimos: 'area risco' },
    tela: { nome: 'Tela', icone: 'layout', sinonimos: 'tela' },
    acao: { nome: 'Ação', icone: 'bolt', sinonimos: 'acao comando' },
  };

  // ---- Ações do painel de comando (Ctrl+K) ----
  // Cada ação aperta o botão que já existe na tela (assim a permissão e o comportamento são os dele).
  // Botão ausente ou escondido pelo perfil: a ação não aparece.
  GC.acoesComando = function () {
    const doc = typeof document !== 'undefined' ? document : null;
    const botao = (sel) => (doc ? doc.querySelector(sel) : null);
    const corpo = () => (doc ? doc.body.classList : { contains: () => false });
    const noMapa = (depois) => () => {
      if (!/^#\/painel/.test(location.hash) && location.hash) { location.hash = '#/painel'; setTimeout(depois, 350); } else depois();
    };
    const clicar = (sel, aberto) => () => { const b = botao(sel); if (b && !(aberto && aberto())) b.click(); };
    const ir = (rota) => () => { location.hash = GC.hashDe ? GC.hashDe(rota) : '#/painel'; };
    return [
      { id: 'alertas', sel: '#btn-alertas', rotulo: 'Ver o que precisa de mim', detalhe: 'Alertas · Precisam de você', icone: 'bell', chaves: 'alertas precisam cobrar prazo', executar: clicar('#btn-alertas', () => doc.querySelector('#btn-alertas').getAttribute('aria-expanded') === 'true') },
      { id: 'indicadores', sel: '#ir-dashboard', rotulo: 'Abrir os Indicadores', detalhe: 'Painel de widgets', icone: 'chart-bar', chaves: 'indicadores painel widgets numeros', executar: noMapa(clicar('#ir-dashboard', () => corpo().contains('dash-aberto'))) },
      { id: 'resumo', sel: '#btn-resumo-dia', rotulo: 'Resumo do dia', detalhe: 'O que mudou e o que decidir hoje', icone: 'sun', chaves: 'resumo dia hoje', executar: noMapa(clicar('#btn-resumo-dia', () => doc.querySelector('#btn-resumo-dia').getAttribute('aria-expanded') === 'true')) },
      { id: 'maia', sel: '#chat-aba', rotulo: 'Perguntar à Maia', detalhe: 'Assistente da prefeitura', icone: 'sparkles', chaves: 'maia ia perguntar assistente', executar: clicar('#chat-aba') },
      { id: 'relatorio', rotulo: 'Gerar o relatório executivo', detalhe: 'Últimos 30 dias', icone: 'file-text', chaves: 'relatorio executivo pdf', executar: ir({ tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }) },
      { id: 'filtros', sel: '#btn-filtros', rotulo: 'Filtrar o mapa', detalhe: 'Gravidade, secretaria, bairro', icone: 'adjustments', chaves: 'filtros filtrar', executar: noMapa(clicar('#btn-filtros')) },
      { id: 'camadas', sel: '#btn-camadas', rotulo: 'Ligar camadas do mapa', detalhe: 'Leitos, escolas, obras, frota…', icone: 'stack-2', chaves: 'camadas mapa leitos escolas obras', executar: noMapa(clicar('#btn-camadas')) },
      { id: 'tema', sel: '.ctrl-tema', rotulo: 'Trocar o tema do mapa', detalhe: 'Claro ou escuro', icone: 'moon', chaves: 'tema escuro claro noite', executar: noMapa(clicar('.ctrl-tema')) },
      { id: 'telao', sel: '#btn-telao', rotulo: 'Ligar o modo telão', detalhe: 'Para a sala de situação', icone: 'device-tv', chaves: 'telao projetor sala situacao', executar: noMapa(clicar('#btn-telao')) },
      { id: 'tour', sel: '#btn-tour', rotulo: 'Fazer o tour guiado', detalhe: 'Conheça o painel', icone: 'player-play', chaves: 'tour ajuda guia', executar: clicar('#btn-tour') },
    ].filter((a) => !a.sel || (doc && botao(a.sel) && !botao(a.sel).hidden))
      .map((a) => Object.assign(a, { tipo: 'acao', termos: normalizar([a.rotulo, a.chaves, GC.TIPOS_BUSCA.acao.sinonimos].join(' ')) }));
  };

  // Junta tudo o que pode ser buscado: [{ tipo, id, rotulo, detalhe, termos, severidade? }].
  // Cada fonte é opcional (cidade sem um dado não quebra a busca).
  // termos = nome + sinônimos do tipo + palavras-chave (bairro, subtipo). O detalhe é só para exibir:
  // números e palavras como "moradores" ou "ocupado" não entram, senão casam com tudo de um tipo.
  GC.itensBusca = function ({ data = GC.data, ocorrencias = [], leitos = [], escolas = [], obras = [], farmacias = [], linhas = [], rotas = [], riscos = [] } = {}) {
    const nomeBairro = (id) => (data.bairros.find((b) => b.id === id) || {}).nome || '';
    const juntar = (...partes) => partes.filter(Boolean).join(' · ');
    const itens = [];
    const add = (tipo, id, rotulo, detalhe, chaves = [], extra = {}) => {
      const t = GC.TIPOS_BUSCA[tipo];
      itens.push(Object.assign({ tipo, id, rotulo, detalhe, termos: normalizar([rotulo, t.sinonimos, ...chaves].filter(Boolean).join(' ')) }, extra));
    };
    data.bairros.forEach((b) => add('bairro', b.id, b.nome, `Bairro · ${Number(b.populacao || 0).toLocaleString('pt-BR')} moradores`));
    ocorrencias.forEach((o) => {
      const bairro = nomeBairro(o.bairroId);
      add('ocorrencia', o.id, o.titulo, juntar(SEV[o.severidade], bairro), [SEV[o.severidade], bairro], { severidade: o.severidade, area: o.area, areas: o.areasEnvolvidas || [] });
    });
    data.areas.forEach((a) => add('secretaria', a.id, (a.secretaria && a.secretaria.nome) || a.nome, `Secretaria · ${a.nome}`, [a.nome]));
    leitos.forEach((u) => {
      const bairro = nomeBairro(u.bairroId);
      add('leito', u.id, u.nome, juntar(u.tipo || 'Unidade de saúde', bairro, typeof u.pct === 'number' && `${u.pct}% ocupado`), [u.tipo, bairro]);
    });
    escolas.forEach((e) => add('escola', e.id, e.nome, juntar('Escola', nomeBairro(e.bairroId)), [nomeBairro(e.bairroId)]));
    obras.forEach((o) => add('obra', o.id, o.nome, juntar('Obra', nomeBairro(o.bairroId), typeof o.avancoPct === 'number' && `${o.avancoPct}% pronta`), [nomeBairro(o.bairroId)]));
    farmacias.forEach((f) => add('farmacia', f.id, f.nome, juntar('Farmácia / UBS', nomeBairro(f.bairroId)), [nomeBairro(f.bairroId)]));
    linhas.forEach((l) => add('linha', l.id, l.nome, juntar('Linha de ônibus', l.esperaMin && `espera de ${l.esperaMin} min`)));
    rotas.forEach((r) => add('coleta', r.id, r.nome, juntar('Coleta de lixo', r.horario)));
    riscos.forEach((a) => add('risco', a.id, a.nome, juntar('Área de risco', nomeBairro(a.bairroId)), [nomeBairro(a.bairroId)]));
    [
      ['alertas', 'Central de alertas', { tela: 'alertas' }],
      ['secretarias', 'Secretarias', { tela: 'secretarias' }],
      ['relatorios', 'Relatórios', { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }],
      ['cruzamento', 'Cruzamento de dados', { tela: 'cruzamento' }],
      ['sazonal', 'Calendário sazonal', { tela: 'sazonal' }],
      ['entregas', 'Agenda de entregas', { tela: 'entregas' }],
      ['metas', 'Plano de governo', { tela: 'metas', area: null }],
      ['tarefas', 'Demandas', { tela: 'tarefas', id: null }],
      ['dados', 'Dados', { tela: 'dados', tabela: null }],
    ].forEach(([id, nome, rota]) => add('tela', id, nome, 'Tela do painel', [], { rota }));
    return itens;
  };

  // Ordem: começa com o termo > alguma palavra começa com ele > contém. No empate, o tipo (bairro,
  // ocorrência, secretaria… na ordem de GC.TIPOS_BUSCA) e depois o nome. Várias palavras: todas precisam casar.
  const ORDEM_TIPO = Object.keys(GC.TIPOS_BUSCA);
  GC.buscar = function (termo, itens, limite = 8) {
    const q = normalizar(termo);
    if (!q) return [];
    const palavras = q.split(/\s+/);
    const pontuar = (it) => {
      if (!palavras.every((p) => it.termos.includes(p))) return -1;
      const rot = normalizar(it.rotulo);
      if (rot.startsWith(q)) return 3;
      if (rot.split(/[\s\-–·/]+/).some((w) => w.startsWith(palavras[0]))) return 2;
      return rot.includes(palavras[0]) ? 1 : 0;
    };
    return itens
      .map((it) => ({ it, p: pontuar(it) }))
      .filter((x) => x.p >= 0)
      .sort((a, b) => b.p - a.p || ORDEM_TIPO.indexOf(a.it.tipo) - ORDEM_TIPO.indexOf(b.it.tipo) || a.it.rotulo.localeCompare(b.it.rotulo, 'pt-BR'))
      .slice(0, limite)
      .map((x) => x.it);
  };

  // ---- interface: painel de comando (Ctrl+K, / ou a lupa) ----
  // el: { raiz, botao, caixa, input, lista, fechar }; itens(): lista atual; aoEscolher(item).
  // A caixa mora num <dialog> modal (camada do topo): abre no meio da tela, por cima do mapa, das telas e
  // dos Indicadores, com o fundo desfocado. Sem nada digitado, mostra ações rápidas e as críticas;
  // digitando, acha tudo (e as ações também). Ação escolhida roda direto; o resto vai para aoEscolher.
  GC.criarBuscaUI = function (el, { itens, aoEscolher }) {
    let resultados = [];
    let ativo = -1;
    let cache = null; // itens montados ao abrir (a cidade muda pouco enquanto se digita)
    let acoes = [];

    const dlg = document.createElement('dialog');
    dlg.className = 'comando';
    dlg.setAttribute('aria-label', 'Painel de comando');
    document.body.appendChild(dlg);
    dlg.appendChild(el.caixa);
    const dentro = (n) => !!n && (el.raiz.contains(n) || dlg.contains(n));
    el.input.placeholder = 'Buscar ou fazer: bairro, ocorrência, “relatório”, “telão”…';
    const atalho = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Ctrl K';
    if (el.botao) el.botao.title = `Buscar e agir (${atalho} ou /)`;

    const linha = (r, i) => {
      const t = GC.TIPOS_BUSCA[r.tipo];
      const icone = r.icone || t.icone;
      const fim = r.atalho ? `<kbd class="busca-tecla">${esc(r.atalho)}</kbd>` : `<span class="busca-tipo">${t.nome}</span>`;
      return `<li role="option" id="busca-op-${i}" class="busca-item${r.tipo === 'acao' ? ' acao' : ''}${i === ativo ? ' ativo' : ''}" aria-selected="${i === ativo}" data-i="${i}">
        <i class="ti ti-${icone} busca-ic${r.severidade ? ` ${r.severidade}` : ''}" aria-hidden="true"></i>
        <span class="busca-txt"><b>${esc(r.rotulo)}</b><small>${esc(r.detalhe || '')}</small></span>${fim}</li>`;
    };
    const grupo = (titulo) => `<li class="busca-grupo" role="presentation">${esc(titulo)}</li>`;

    function desenhar() {
      const q = el.input.value;
      let html = '';
      if (!q.trim()) {
        // Sem nada digitado: ações rápidas e o que é crítico agora.
        const rapidas = acoes.slice(0, 6);
        const criticas = (cache || []).filter((x) => x.tipo === 'ocorrencia' && x.severidade === 'critica').slice(0, 4);
        resultados = [...rapidas, ...criticas];
        if (rapidas.length) html += grupo('Ações rápidas') + rapidas.map((r, i) => linha(r, i)).join('');
        if (criticas.length) html += grupo('Críticas agora') + criticas.map((r, i) => linha(r, rapidas.length + i)).join('');
        if (!html) html = '<li class="busca-dica">Digite um bairro, ocorrência, escola, hospital, obra, linha de ônibus ou secretaria.</li>';
      } else {
        resultados = GC.buscar(q, [...acoes, ...(cache || [])], 9);
        html = resultados.length ? resultados.map(linha).join('') : `<li class="busca-dica">Nada encontrado para “${esc(q.trim())}”.</li>`;
      }
      if (ativo >= resultados.length) ativo = resultados.length - 1;
      el.lista.innerHTML = html;
      el.input.setAttribute('aria-activedescendant', ativo >= 0 ? `busca-op-${ativo}` : '');
      el.input.setAttribute('aria-expanded', String(resultados.length > 0));
    }

    function abrir() {
      cache = itens();
      acoes = GC.acoesComando ? GC.acoesComando() : [];
      el.raiz.classList.add('aberta');
      el.caixa.hidden = false;
      if (!dlg.open) dlg.showModal();
      el.botao.setAttribute('aria-expanded', 'true');
      ativo = 0;
      desenhar();
      el.input.focus(); // já, sem setTimeout: a lupa some ao abrir e o foco não pode cair no vazio
    }
    function fechar() {
      el.raiz.classList.remove('aberta');
      el.caixa.hidden = true;
      if (dlg.open) dlg.close();
      el.botao.setAttribute('aria-expanded', 'false');
      el.input.value = '';
      cache = null;
    }
    const aberta = () => !el.caixa.hidden;
    function escolher(i) {
      const r = resultados[i];
      if (!r) return;
      fechar();
      if (r.tipo === 'acao') { r.executar(); return; }
      aoEscolher(r);
    }

    el.botao.addEventListener('click', () => (aberta() ? fechar() : abrir()));
    el.input.addEventListener('input', () => { ativo = 0; desenhar(); });
    el.lista.addEventListener('pointerdown', (e) => e.preventDefault()); // não tira o foco do campo
    el.lista.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) escolher(Number(li.dataset.i)); });
    el.lista.addEventListener('mousemove', (e) => {
      const li = e.target.closest('[data-i]');
      if (li && Number(li.dataset.i) !== ativo) { ativo = Number(li.dataset.i); desenhar(); }
    });
    // Esc do próprio <dialog> (cancel): fecha pelo nosso caminho, para limpar o campo e a lupa.
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); el.botao.focus(); });
    // Teclas do campo na captura da janela: o Esc fecha a busca antes de fechar gaveta ou tela.
    window.addEventListener('keydown', (e) => {
      const ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K');
      if (!aberta()) {
        const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
        if (ctrlK || (e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); abrir(); }
        return;
      }
      if (ctrlK) { e.preventDefault(); fechar(); el.botao.focus(); return; }
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); fechar(); el.botao.focus(); return; }
      if (document.activeElement !== el.input) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!resultados.length) return;
        ativo = (ativo + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length;
        desenhar();
        const li = el.lista.querySelector('.ativo');
        if (li) li.scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') { e.preventDefault(); escolher(ativo >= 0 ? ativo : 0); }
    }, true);
    // Clique no fundo desfocado (o próprio <dialog>, fora da caixa) ou fora de tudo fecha.
    document.addEventListener('pointerdown', (e) => { if (aberta() && (e.target === dlg || !dentro(e.target))) fechar(); });
    // X do campo: no toque não há Esc e a lupa fica escondida enquanto a busca está aberta.
    if (el.fechar) el.fechar.addEventListener('click', () => { fechar(); el.botao.focus(); });
    // Sair pelo Tab fecha. Só quando o foco foi para outro controle: trocar de janela deixa o foco
    // no campo e um clique fora já fecha pelo pointerdown acima.
    dlg.addEventListener('focusout', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (aberta() && a && a !== document.body && !dentro(a)) fechar();
      }, 0);
    });

    return { abrir, fechar, aberta };
  };
})(window.GC = window.GC || {});
