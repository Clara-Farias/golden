(function (GC) {
  // O que aparece em cada tela do painel (revisão de 19/11; blocos nomeados na de 23/11).
  // Cada tela tem blocos com nome (filtros, ranking, linha do tempo, tabelas…). Quem decide se um bloco aparece é a
  // "Minha visão" de cada pessoa (js/minha-visao.js): o modelo Resumida esconde os blocos marcados com
  // resumida: false, e a pessoa pode ligar e desligar cada um. O perfil "só resumida" não abre os blocos de detalhe.
  // Na tela, uma faixa diz o que ficou de fora, com "Ver a tela completa" (só nesta visita) e "Personalizar".
  // As telas não precisam saber disto: um observador refaz a marcação (data-rt) quando a tela redesenha, e o CSS
  // (css/resumo-telas.css) esconde.
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const todos = (el, sel) => [...el.querySelectorAll(sel)];
  const marcar = (els, v = 'detalhe') => els.forEach((e) => { if (e && !e.classList.contains('rt-faixa')) e.dataset.rt = v; });
  // Mostra os primeiros n itens de cada lista; o resto fica escondido.
  const limitar = (el, selLista, selItem, n) => todos(el, selLista).forEach((l) => {
    [...l.querySelectorAll(selItem)].filter((x) => x.parentElement === l).forEach((x, i) => { if (i >= n) x.dataset.rt = 'mais'; });
  });
  // Tabelas: só as colunas que importam (pelo título; coluna sem título, como "Abrir", fica; a de marcar em lote sai).
  const normal = (t) => t.toLowerCase().replace(/[↑↓⇅⇵]/g, '').replace(/\s+/g, ' ').trim();
  function colunas(el, selTabela, manter, { lote = true } = {}) {
    todos(el, selTabela).forEach((t) => {
      const ths = [...t.querySelectorAll('thead th')];
      const sai = ths.map((th) => {
        if (th.querySelector('input[type="checkbox"]')) return lote;
        const txt = normal(th.textContent);
        return !!manter && txt !== '' && !manter.some((m) => txt.startsWith(m));
      });
      ths.forEach((th, i) => { if (sai[i]) th.dataset.rt = 'mais'; });
      t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (sai[i]) td.dataset.rt = 'mais'; }));
    });
  }
  const cartaoCom = (el, txt) => todos(el, 'section.painel-card, section.rel-cartao').filter((s) => {
    const h = s.querySelector('h2, h3, h4');
    return h && h.textContent.trim().toLowerCase().startsWith(txt);
  });

  // Por tela: nome, onde fica a faixa e os blocos. resumida: false = fora no modelo Resumida.
  const TELAS = {
    secretarias: {
      nome: 'Secretarias', ancora: '.sec-topo',
      blocos: [
        { id: 'chips', nome: 'Atalhos das secretarias', esconder: (el) => marcar(todos(el, '.sec-chips')) },
        { id: 'ruim', nome: 'O que está ruim', esconder: (el) => marcar(todos(el, '.sec-ruim')) },
        { id: 'numeros', nome: 'Números do mês', esconder: (el) => marcar(todos(el, '.visao-desempenho .desemp-kpis, h3.sec-secao')) },
        { id: 'colunas', nome: 'Todas as colunas do ranking', resumida: false, esconder: (el) => colunas(el, '.desemp-tabela', ['secretaria', 'abertas', 'atrasadas', 'no prazo', 'plano'], { lote: false }) },
        { id: 'recentes', nome: 'Resolvidas recentemente', resumida: false, esconder: (el) => marcar(todos(el, '.desemp-recentes-card')) },
      ],
    },
    secretaria: {
      nome: 'Página da secretaria', ancora: '.sec-topo',
      blocos: [
        { id: 'indicadores', nome: 'Indicadores da pasta', esconder: (el) => marcar(todos(el, '.sec-ind-wrap')) },
        { id: 'alertas', nome: 'Alertas da pasta', esconder: (el) => marcar(cartaoCom(el, 'alertas da pasta')) },
        { id: 'grafico', nome: 'Gráfico do ano e compromissos', resumida: false, esconder: (el) => marcar(todos(el, '.sec-evolucao').map((x) => x.closest('.sec-grade'))) },
        { id: 'unidades', nome: 'Unidades', resumida: false, esconder: (el) => marcar(cartaoCom(el, 'unidades')) },
        { id: 'equipes', nome: 'Equipes agora', resumida: false, esconder: (el) => marcar(todos(el, '.sec-equipes')) },
        { id: 'metas', nome: 'Metas pactuadas', resumida: false, esconder: (el) => marcar(todos(el, '.sec-extras')) },
      ],
    },
    crise: {
      nome: 'Gabinete de crise', ancora: '.sec-topo',
      // Só a listagem de gabinetes (dentro de uma sala, tudo é ação e fica como está).
      vale: (el) => !!el.querySelector('.cr-lista-cab'),
      blocos: [
        { id: 'status', nome: 'Placar das crises', esconder: (el) => marcar(todos(el, '.cr-status')) },
        { id: 'todas', nome: 'Todas as decisões (não só as 3 primeiras)', resumida: false, esconder: (el) => limitar(el, '.cr-lista-decisoes ul, .cr-lista-decisoes ol', 'li', 3) },
        { id: 'contexto', nome: 'Previsão do tempo e áreas de risco', resumida: false, esconder: (el) => marcar(todos(el, '.cr-contexto')) },
      ],
    },
    relatorios: {
      nome: 'Relatórios', ancora: '.rel-topo',
      blocos: [
        { id: 'frases', nome: 'Resumo em frases', esconder: (el) => marcar(todos(el, '.rel-resumo')) },
        { id: 'numeros', nome: 'Números do período', esconder: (el) => marcar(todos(el, '.rel-numeros')) },
        { id: 'montar', nome: 'Montar o relatório', resumida: false, esconder: (el) => marcar(todos(el, '.rel-montar')) },
        { id: 'detalhes', nome: 'Tabelas detalhadas', resumida: false, esconder: (el) => marcar(todos(el, 'details.rel-detalhes, svg.ga-perfil')) },
      ],
    },
    entregas: {
      nome: 'Agenda de entregas', ancora: '.sec-topo',
      blocos: [
        { id: 'numeros', nome: 'Números', esconder: (el) => marcar(todos(el, '.en-kpis')) },
        { id: 'lado', nome: 'Vence nos próximos 30 dias', esconder: (el) => marcar(todos(el, '.en-lado')) },
        { id: 'filtros', nome: 'Filtros e meses', resumida: false, esconder: (el) => marcar(todos(el, '.en-barra-filtros')) },
        { id: 'tempo', nome: 'Linha do tempo', resumida: false, esconder: (el) => marcar(todos(el, '.en-tempo')) },
      ],
    },
    sazonal: {
      nome: 'Calendário sazonal', ancora: '.sec-topo',
      blocos: [
        { id: 'alerta', nome: 'Aviso de preparo atrasado', esconder: (el) => marcar(todos(el, '.sz-alerta')) },
        { id: 'numeros', nome: 'Números', esconder: (el) => marcar(todos(el, '.sz-kpis')) },
        { id: 'ano', nome: 'O ano inteiro', resumida: false, esconder: (el) => marcar(todos(el, '.sz-ano')) },
        { id: 'tabela', nome: 'Tabela de compromissos', resumida: false, esconder: (el) => marcar(todos(el, '.sz-tabela-rolagem').map((x) => x.closest('section'))) },
      ],
    },
    tarefas: {
      nome: 'Demandas', ancora: '.tf-topo',
      blocos: [
        { id: 'numeros', nome: 'Números', esconder: (el) => marcar(todos(el, '.tf-kpis')) },
        { id: 'filtros', nome: 'Busca e filtros', resumida: false, esconder: (el) => marcar(todos(el, '.tf-filtros, .tf-resumo, .tf-kpi.discreta')) },
        { id: 'todas', nome: 'Lista inteira (não só 5 por grupo)', resumida: false, esconder: (el) => limitar(el, '.tf-lista', 'li', 5) },
      ],
    },
    alertas: {
      nome: 'Central de alertas', ancora: '.sec-topo',
      blocos: [
        { id: 'numeros', nome: 'Números', esconder: (el) => marcar(todos(el, '.alr-kpis')) },
        { id: 'filtros', nome: 'Filtros', resumida: false, esconder: (el) => marcar(todos(el, '.alr-filtros, .alr-novidades')) },
        { id: 'recorrentes', nome: 'Casos recorrentes', resumida: false, esconder: (el) => marcar(todos(el, '.alr-recorrentes')) },
        { id: 'todas', nome: 'Lista inteira (não só as 10 primeiras)', resumida: false, esconder: (el) => limitar(el, '.alr-tabela tbody', 'tr', 10) },
        { id: 'lote', nome: 'Seleção em lote', resumida: false, esconder: (el) => { marcar(todos(el, '.alr-lote')); colunas(el, '.alr-tabela', null); } },
      ],
    },
    indicadores: {
      nome: 'Indicadores', ancora: '.ind-barra',
      blocos: [
        { id: 'vistas', nome: 'Outras vistas e filtros', resumida: false, esconder: (el) => marcar(todos(el, '.ind-vistas, .ind-filtros, .ind-info')) },
        { id: 'perto', nome: 'Indicadores perto da meta e na meta', resumida: false, esconder: (el) => marcar(todos(el, '.ind-grupo.sit-atencao, .ind-grupo.sit-ok, .ind-cartao.sit-atencao, .ind-cartao.sit-ok'), 'mais') },
      ],
    },
    publicacoes: {
      nome: 'Agenda de publicação', ancora: '.sec-topo',
      blocos: [
        { id: 'numeros', nome: 'Números', esconder: (el) => marcar(todos(el, '.en-kpis')) },
        { id: 'calendario', nome: 'Calendário da semana', resumida: false, esconder: (el) => marcar(todos(el, '.pb-semana')) },
        { id: 'publicados', nome: 'Publicados nos últimos 30 dias', resumida: false, esconder: (el) => marcar(todos(el, '.pb-lista-linha').map((x) => x.closest('section'))) },
      ],
    },
    governanca: {
      nome: 'Governança da Maia', ancora: '.sec-topo',
      blocos: [
        { id: 'registro', nome: 'O que a Maia fez', esconder: (el) => marcar(todos(el, '.gv-reg').map((x) => x.closest('section'))) },
        { id: 'permissoes', nome: 'Tabela de permissões', resumida: false, esconder: (el) => marcar(todos(el, '.gv-perm').map((x) => x.closest('section'))) },
      ],
    },
    fontes: {
      nome: 'Fontes e integrações', ancora: '.sec-topo',
      blocos: [
        { id: 'fluxo', nome: 'Como os dados chegam', resumida: false, esconder: (el) => marcar(todos(el, '.ft-fluxo')) },
        { id: 'emdia', nome: 'Fontes no prazo (não só as atrasadas)', resumida: false, esconder: (el) => marcar(todos(el, '.ft-tabela tbody tr.ok, .ft-tabela tbody tr.manual'), 'mais') },
      ],
    },
    // Orçamento: a própria tela recolhe o detalhe (js/tela-orcamento.js pergunta a GC.resumoTelas.visivel).
    orcamento: {
      nome: 'Orçamento', semFaixa: true,
      blocos: [{ id: 'detalhe', nome: 'Recursos de fora, contratos e licitações', resumida: false, esconder: () => {} }],
    },
  };

  const completa = {}; // tela → true quando a pessoa pediu "Ver a tela completa" (só nesta visita)
  const mv = () => GC.minhaVisao || null;
  // O bloco aparece? (Minha visão decide; sem ela, a visão resumida esconde os de resumida: false.)
  function visivel(nome, id) {
    const b = ((TELAS[nome] || {}).blocos || []).find((x) => x.id === id);
    if (!b) return true;
    const travado = mv() ? mv().travado(nome, id) : false;
    if (completa[nome] && !travado) return true;
    if (mv()) return mv().blocoVisivel(nome, id);
    return !(GC.visaoSimples && GC.visaoSimples.ligada() && b.resumida === false);
  }
  const ocultos = (nome) => (TELAS[nome].blocos || []).filter((b) => !visivel(nome, b.id));
  const lista = (nomes) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] || '');

  function faixaHtml(nome) {
    const fora = ocultos(nome);
    const podeAbrir = fora.some((b) => !(mv() && mv().travado(nome, b.id)));
    const personalizar = `<button type="button" class="rt-alternar rt-personalizar" data-rt-personalizar="${nome}">${ic('adjustments-horizontal')} Personalizar</button>`;
    if (completa[nome]) {
      return `${ic('layout-list')}<p><b>Tela completa.</b> Tudo à vista nesta visita.</p>
        <span class="rt-botoes"><button type="button" class="rt-alternar" data-rt-tela="${nome}">${ic('arrows-minimize')} Voltar à minha visão</button>${personalizar}</span>`;
    }
    const nomes = fora.map((b) => b.nome.replace(/ \(.*\)$/, '').toLowerCase());
    return `${ic('layout-rows')}<p><b>${mv() ? esc(mv().rotuloModelo()) : 'Visão resumida'}.</b> Fora desta tela: ${esc(lista(nomes))}.</p>
      <span class="rt-botoes">${podeAbrir ? `<button type="button" class="rt-alternar" data-rt-tela="${nome}">${ic('arrows-maximize')} Ver a tela completa</button>` : ''}${personalizar}</span>`;
  }

  function aplicarEm(nome, el) {
    const cfg = TELAS[nome];
    if (!el || !cfg || cfg.semFaixa) return;
    const ativa = !el.hidden && (!cfg.vale || cfg.vale(el));
    todos(el, '[data-rt]').forEach((x) => { delete x.dataset.rt; });
    const fora = ativa ? ocultos(nome) : [];
    fora.forEach((b) => { try { b.esconder(el); } catch (e) { /* tela em outro formato: o bloco fica à vista */ } });
    el.classList.toggle('rt-resumida', fora.length > 0);
    let faixa = el.querySelector(':scope .rt-faixa');
    const mostrarFaixa = ativa && (fora.length > 0 || completa[nome]);
    if (!mostrarFaixa) { if (faixa) faixa.remove(); return; }
    if (!faixa) {
      faixa = document.createElement('div');
      faixa.className = 'rt-faixa';
      faixa.setAttribute('role', 'note');
    }
    const html = faixaHtml(nome);
    if (faixa.dataset.html !== html) { faixa.innerHTML = html; faixa.dataset.html = html; }
    const ancora = el.querySelector(cfg.ancora);
    if (ancora && ancora.nextElementSibling !== faixa) ancora.after(faixa);
    else if (!ancora && el.firstElementChild !== faixa) el.prepend(faixa);
  }

  const reaplicar = {};
  function iniciar() {
    Object.keys(TELAS).forEach((nome) => {
      const el = document.getElementById(`tela-${nome}`);
      if (!el || TELAS[nome].semFaixa) return;
      let pendente = false;
      const agendar = () => {
        if (pendente) return;
        pendente = true;
        requestAnimationFrame(() => { pendente = false; aplicarEm(nome, el); });
      };
      reaplicar[nome] = agendar;
      new MutationObserver(agendar).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      el.addEventListener('click', (e) => {
        const p = e.target.closest('[data-rt-personalizar]');
        if (p && mv()) { mv().abrir(nome); return; }
        const b = e.target.closest('[data-rt-tela]');
        if (!b) return;
        completa[nome] = !completa[nome];
        aplicarEm(nome, el);
        const nova = el.querySelector('[data-rt-tela]');
        if (nova) nova.focus();
      });
      agendar();
    });
  }

  GC.resumoTelas = { TELAS, aplicarEm, visivel, reaplicarTudo: () => Object.values(reaplicar).forEach((f) => f()) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.GC = window.GC || {});
