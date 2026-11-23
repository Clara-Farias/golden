(function (GC) {
  // Menu em trilho flutuante (navegação entre telas), números-chave do cabeçalho,
  // contadores do menu e o cartão de pulso (usado no widget e na visão geral).
  // rotulo e curto: [singular, plural]. O curto vale em tela estreita (css/cabecalho.css), antes de a faixa rolar.
  const NUMEROS = [
    { chave: 'criticas', rotulo: ['crítica', 'críticas'], curto: ['crítica', 'críticas'], classe: 'critico', recorte: 'criticas', dica: 'Mostrar só as críticas' },
    { chave: 'estouradas', rotulo: ['prazo estourado', 'prazos estourados'], curto: ['estourado', 'estourados'], classe: 'alerta', recorte: 'estourado', dica: 'Mostrar só as com prazo estourado' },
    { chave: 'emAndamento', rotulo: ['em atendimento', 'em atendimento'], curto: ['atendendo', 'atendendo'], classe: 'andamento', recorte: 'andamento', dica: 'Mostrar só as que estão em atendimento' },
    // Satisfação saiu do cabeçalho (fica no widget e no dashboard): no topo só o que pede ação.
  ];
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);

  // Uma animação por número: a nova cancela a anterior (duas renderizações seguidas não deixam o valor velho por último).
  function contar(el, de, para, sufixo) {
    const inicio = performance.now();
    const dur = 600;
    const vez = (el._contagem = (el._contagem || 0) + 1);
    const passo = (agora) => {
      if (el._contagem !== vez) return;
      const t = Math.min(1, (agora - inicio) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(de + (para - de) * e) + (sufixo || '');
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // Seletor de bairro (usado no Painel e na visão geral das secretarias).
  GC.seletorBairro = function (aoSelecionar) {
    const label = document.createElement('label');
    label.className = 'seletor-bairro';
    label.innerHTML = `📍 Bairro <select aria-label="Bairro"><option value="">Cidade inteira</option>${GC.data.bairros.slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')).map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join('')}</select>`;
    const select = label.querySelector('select');
    select.onchange = () => aoSelecionar(select.value || null);
    return { el: label, marcar: (id) => { select.value = id || ''; } };
  };

  GC.criarDashboard = function (el, opcoes) {
    const { aoIr, aoClicarNumero } = opcoes;

    // ---- menu de telas ----
    // O perfil de acesso troca o menu (setor: as telas da pasta; cidadão: "Para você", mapa e indicadores públicos).
    const ITENS_GESTOR = [
      // Seis destinos. Cada secretaria abre de dentro da tela Secretarias (antes eram 7 ícones parecidos).
      { rota: { tela: 'painel' }, emoji: '🗺', nome: 'Mapa' },
      // Alertas fica fora do menu: a porta é o botão Alertas do cabeçalho (gaveta), e a Central
      // completa abre pelo rodapé dela.
      { rota: { tela: 'crise', id: null }, emoji: '🚨', nome: 'Gabinete de crise' },
      { rota: { tela: 'secretarias' }, emoji: '🏛', nome: 'Secretarias', inclui: ['secretaria'] },
      // Indicadores fica fora do menu: a porta é "Indicadores", na doca da base do mapa.
      { rota: { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }, emoji: '📄', nome: 'Relatórios' },
      { rota: { tela: 'cruzamento' }, emoji: '📊', nome: 'Cruzamento de dados' },
      { rota: { tela: 'sazonal' }, emoji: '📅', nome: 'Calendário sazonal' },
      { rota: { tela: 'entregas' }, emoji: '📦', nome: 'Agenda de entregas' },
      { rota: { tela: 'metas', area: null }, emoji: '🎯', nome: 'Plano de governo' },
      // Workshop de 18/11: acompanhamento orçamentário, recursos federais, contratos e licitações.
      { rota: { tela: 'orcamento', area: null }, emoji: '🧾', nome: 'Orçamento' },
      { rota: { tela: 'tarefas', id: null }, emoji: '📋', nome: 'Demandas' },
      // Revisão de 23/11: posts da Maia e da Comunicação, do rascunho à publicação.
      { rota: { tela: 'publicacoes' }, emoji: '📣', nome: 'Agenda de publicação' },
      // Auditoria, Usuários e Minha conta ficam no menu ⋯ do cabeçalho.
      // Dados fica fora do menu: a porta é "Dados", no menu ⋯ do cabeçalho.
    ];
    const DO_PERFIL = GC.menuDoPerfil ? GC.menuDoPerfil(ITENS_GESTOR) : ITENS_GESTOR;
    // Visão simples (js/visao-simples.js): só os destinos principais.
    const ITENS = GC.visaoSimples ? GC.visaoSimples.menu(DO_PERFIL) : DO_PERFIL;
    if (GC.visaoSimples) GC.visaoSimples.aplicar();
    el.menu.innerHTML = '<div class="menu-marca"><button type="button" class="menu-alternar" aria-expanded="false">☰</button><img class="logo logo-atlas" src="identidade-visual/logo/svg/reduzida-escuro.svg" alt="Golden Atlas" width="103" height="30"></div>';
    const itens = [];

    // Menu recolhível (☰): começa recolhido; aberto, flutua por cima do mapa.
    const app = document.querySelector('.app');
    const btnMenu = el.menu.querySelector('.menu-alternar');
    function recolherMenu(valor) {
      app.classList.toggle('menu-recolhido', valor);
      btnMenu.title = valor ? 'Expandir o menu' : 'Recolher o menu';
      btnMenu.setAttribute('aria-label', btnMenu.title);
      btnMenu.setAttribute('aria-expanded', String(!valor));
    }
    btnMenu.onclick = () => recolherMenu(!app.classList.contains('menu-recolhido'));
    recolherMenu(true);
    // Clique fora do menu aberto e Esc também recolhem (aberto, ele cobre o título das telas).
    document.addEventListener('click', (ev) => {
      if (!app.classList.contains('menu-recolhido') && !el.menu.contains(ev.target)) recolherMenu(true);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !app.classList.contains('menu-recolhido')) { recolherMenu(true); btnMenu.focus(); }
    });
    ITENS.forEach((i) => {
      if (i.grupo) {
        el.menu.insertAdjacentHTML('beforeend', `<div class="menu-grupo">${esc(i.grupo)}</div>`);
        return;
      }
      const b = document.createElement('a');
      b.className = `menu-item${i.area ? ' sub' : ''}`;
      b.href = GC.hashDe(i.rota);
      b.title = i.nome;
      b.innerHTML = `<span class="menu-emoji">${i.emoji}</span><span class="menu-nome">${esc(i.nome)}</span>`;
      // Alertas abre a gaveta sobre o mapa (a Central completa fica no rodapé dela).
      // Escolher um destino também recolhe o menu.
      b.onclick = (e) => { e.preventDefault(); recolherMenu(true); if (i.gaveta && opcoes.aoGaveta) opcoes.aoGaveta(i.gaveta); else aoIr(i.rota); };
      itens.push({ b, i });
      el.menu.appendChild(b);
    });

    // Troca de visão no pé do menu (o perfil de visão resumida não troca).
    if (GC.visaoSimples && !GC.visaoSimples.forcada() && !(GC.visaoDe && GC.visaoDe(GC.perfil) === 'portal')) {
      const simples = GC.visaoSimples.ligada();
      const t = document.createElement('a');
      t.href = '#';
      t.className = 'menu-item menu-visao';
      t.title = simples ? 'Voltar à visão completa: todas as telas, filtros e camadas' : 'Visão resumida: o mesmo painel, só com o essencial e o Resumo de hoje';
      t.innerHTML = `<span class="menu-emoji"><i class="ti ti-${simples ? 'layout-grid' : 'layout-list'}" aria-hidden="true"></i></span><span class="menu-nome">${simples ? 'Visão completa' : 'Visão resumida'}</span>`;
      t.onclick = (e) => { e.preventDefault(); GC.visaoSimples.alternar(!simples); };
      el.menu.appendChild(t);
    }
    // Minha visão (js/minha-visao.js): montar o próprio painel. Vale também para o perfil "só resumida".
    if (GC.minhaVisao && !(GC.visaoDe && GC.visaoDe(GC.perfil) === 'portal')) {
      const mvb = document.createElement('a');
      mvb.href = '#';
      mvb.className = 'menu-item menu-minha-visao';
      mvb.title = `Minha visão: ${GC.minhaVisao.rotuloModelo()}. Escolha o modelo, a arrumação, as telas e o que aparece em cada uma.`;
      mvb.innerHTML = '<span class="menu-emoji"><i class="ti ti-adjustments-horizontal" aria-hidden="true"></i></span><span class="menu-nome">Minha visão</span>';
      mvb.onclick = (e) => { e.preventDefault(); GC.minhaVisao.abrir(); };
      el.menu.appendChild(mvb);
    }

    function marcarTela(rota) {
      itens.forEach(({ b, i }) => {
        // Relatórios fica ativo em qualquer relatório (tipo, alvo e período mudam).
        // Secretarias fica ativo também na página de uma secretaria.
        const ativo = (i.rota.tela === rota.tela && (rota.tela === 'relatorios' || rota.tela === 'cidadao' || rota.tela === 'crise' || rota.tela === 'cruzamento' || rota.tela === 'metas' || rota.tela === 'orcamento' || i.rota.area === rota.area))
          || (i.inclui || []).includes(rota.tela);
        b.classList.toggle('ativo', ativo);
        if (ativo) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
    }

    // Contador do item "Alertas": quantas precisam de atenção agora (o mesmo número do bloco).
    function marcarContadorAlertas(n) {
      const item = itens.find(({ i }) => i.contador);
      if (!item) return;
      let badge = item.b.querySelector('.badge');
      if (!n) { if (badge) badge.remove(); return; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; item.b.appendChild(badge); }
      badge.textContent = n;
    }

    // Número de ocorrências críticas por secretaria, no menu.
    function atualizarBadges(contagem) {
      itens.filter(({ i }) => i.area).forEach(({ b, i }) => {
        let badge = b.querySelector('.badge');
        const n = contagem[i.area] || 0;
        if (!n) { if (badge) badge.remove(); return; }
        if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; b.appendChild(badge); }
        badge.textContent = n;
      });
    }

    // ---- faixa de números ----
    el.kpis.innerHTML = `${NUMEROS.map((n) => `
      <button type="button" class="faixa-num ${n.classe}" data-numero="${n.chave}" title="${n.dica}"><b data-chave="${n.chave}">0${n.sufixo || ''}</b> <span class="fn-rot">${n.rotulo[1]}</span><span class="fn-curto">${n.curto[1]}</span><i class="ti ti-x fn-x" aria-hidden="true"></i></button>`).join('')}`;
    el.kpis.querySelectorAll('[data-numero]').forEach((b) => {
      const n = NUMEROS.find((x) => x.chave === b.dataset.numero);
      b.onclick = () => aoClicarNumero(n.recorte || null, n.chave);
    });

    // Faixa estreita (menu e Maia abertos): os números rolam de lado. Um degradê na borda mostra que há
    // mais do que cabe, e a roda do mouse rola na horizontal.
    function marcarTransbordo() {
      const f = el.kpis;
      const max = f.scrollWidth - f.clientWidth;
      f.classList.toggle('mais-esq', max > 1 && f.scrollLeft > 1);
      f.classList.toggle('mais-dir', max > 1 && f.scrollLeft < max - 1);
    }
    el.kpis.addEventListener('scroll', marcarTransbordo, { passive: true });
    el.kpis.addEventListener('wheel', (ev) => {
      const f = el.kpis;
      if (f.scrollWidth <= f.clientWidth || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      f.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }, { passive: false });
    if (typeof ResizeObserver === 'function') new ResizeObserver(marcarTransbordo).observe(el.kpis);
    // Um número rolado para fora some sob o degradê: o foco do teclado o traz de volta à vista.
    el.kpis.addEventListener('focusin', (ev) => ev.target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

    // Dica e rótulo do leitor de tela: ligado, o número diz que o clique tira o filtro (o × mostra o mesmo).
    const anteriores = {};
    function rotular(b) {
      const n = NUMEROS.find((x) => x.chave === b.dataset.numero);
      const v = anteriores[n.chave] || 0;
      const nome = n.rotulo[v === 1 ? 0 : 1];
      const ativo = b.classList.contains('ativo');
      b.title = ativo ? `Tirar o filtro: ${n.rotulo[1]}` : n.dica;
      b.setAttribute('aria-label', `${v} ${nome}. ${ativo ? 'Filtro ligado; clique para tirar' : n.dica}`);
    }

    // Realça o número cujo recorte está ativo (um por vez).
    function marcarRecorte(recorte) {
      NUMEROS.forEach((n) => {
        const b = el.kpis.querySelector(`[data-numero="${n.chave}"]`);
        const ativo = !!n.recorte && n.recorte === recorte;
        b.classList.toggle('ativo', ativo);
        if (n.recorte) b.setAttribute('aria-pressed', String(ativo));
        rotular(b);
      });
    }

    function atualizarFaixa(kpis) {
      NUMEROS.forEach((n) => {
        const alvo = el.kpis.querySelector(`[data-chave="${n.chave}"]`);
        const de = anteriores[n.chave] || 0;
        if (de !== kpis[n.chave]) contar(alvo, de, kpis[n.chave], n.sufixo);
        anteriores[n.chave] = kpis[n.chave];
        // Concordância pelo valor final ("1 crítica", "8 críticas"); o leitor de tela ouve a frase inteira.
        const i = kpis[n.chave] === 1 ? 0 : 1;
        const b = alvo.parentElement;
        b.classList.toggle('zero', kpis[n.chave] === 0);
        b.querySelector('.fn-rot').textContent = n.rotulo[i];
        b.querySelector('.fn-curto').textContent = n.curto[i];
        rotular(b);
      });
      marcarTransbordo();
    }

    function marcarNumero(chave, ativo) {
      const b = el.kpis.querySelector(`[data-numero="${chave}"]`);
      if (!b) return; // número que não está no cabeçalho (ex.: satisfação)
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-pressed', String(ativo));
      rotular(b);
    }

    return { recolherMenu, marcarTela, atualizarFaixa, atualizarBadges, marcarContadorAlertas, marcarRecorte, marcarNumero };
  };

  // HTML de um cartão de pulso (Painel e visão geral das secretarias).
  // comNome: mostra a secretaria dona do indicador.
  GC.cartaoPulso = function (p, { comNome = false } = {}) {
    const a = area(p.area);
    const tom = p.neutro ? 'neutro' : p.positivo ? 'melhor' : 'pior';
    return `<button type="button" class="pulso status-${p.status}" data-pulso="${p.area}" title="${p.fonte ? `Fonte: ${esc(p.fonte)} · ` : ''}Abrir a página: ${esc(a.secretaria.nome)}">
      ${comNome ? `<span class="pulso-dono">${esc(a.nome)}</span>` : ''}
      <span class="pulso-rotulo">${a.secretaria.emoji} ${esc(p.rotulo)}</span>
      <b>${esc(p.nivel)}</b>
      <span class="pulso-var ${tom}">${esc(p.variacao)}${p.periodo ? ` ${p.periodo}` : ''}</span>
    </button>`;
  };
})(window.GC = window.GC || {});
