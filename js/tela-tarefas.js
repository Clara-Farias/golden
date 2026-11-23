(function (GC) {
  // Tela Tarefas (#/tarefas ou #/tarefas/<id>): tudo o que foi passado às secretarias, numa lista só, juntando o
  // registro (js/tarefas.js: tarefas de temporada, de alerta e avulsas) e as tarefas dos gabinetes de crise
  // (GC.tarefasUnificadas). As abas de situação (com os números) ficam no topo; abaixo, busca e filtros pelo que a
  // tarefa está ligada, pela secretaria e "Minhas" (no celular, recolhidos no botão "Filtros"). A lista se agrupa
  // pela urgência do prazo (GC.urgenciaTarefa). "Passar tarefa" escolhe a que ligar. Cada um vê o que
  // GC.tarefasVisiveis deixa; as ações vêm de js/tarefas-ui.js.
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, cls) => GC.icone(nome, cls);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const DIA = 1440 * 60000;
  const PADRAO = { situacao: 'abertas', ligada: 'todas', area: '', minhas: false, busca: '' };
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Grupos pela urgência; feitas e canceladas por último.
  const GRUPOS = [
    ['atrasada', 'Atrasadas'], ['hoje', 'Vencem hoje'], ['semana', 'Vencem nos próximos 7 dias'], ['depois', 'Depois'],
  ];

  // dados(): { gabinetes, alertas: [{ id, nome, area }] } (js/app/telas.js); ir(rota).
  GC.criarTelaTarefas = function (el, cb) {
    const filtro = Object.assign({}, PADRAO);
    let filtrosAbertos = false; // só no celular: o corpo dos filtros recolhido
    let rota = { tela: 'tarefas', id: null };
    let ultimo = null;

    const todas = () => GC.tarefasVisiveis(GC.tarefasUnificadas({ tarefas: GC.tarefas, gabinetes: cb.dados().gabinetes }));
    const eu = () => (GC.usuarioAtual ? GC.usuarioAtual() : null);
    const minha = (t) => { const u = eu(); return !!u && (t.responsavelId === u.id || (t.criadaPor && t.criadaPor.id === u.id)); };
    const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id || '' }).nome;
    const nomeUsuario = (id) => { const u = id && GC.buscarUsuario ? GC.buscarUsuario(id) : null; return u ? u.nome : ''; };
    const textoBusca = (t) => normal([t.texto, t.contexto && t.contexto.nome, nomeArea(t.area), nomeUsuario(t.responsavelId), t.criadaPor && t.criadaPor.nome].join(' '));

    const naSituacao = (t, sit, agora) => {
      if (sit === 'abertas') return GC.tarefaAberta(t);
      if (sit === 'atrasadas') return GC.tarefaAtrasada(t, agora);
      if (sit === 'cobradas') return GC.tarefaAberta(t) && t.respostaPendente;
      if (sit === 'feitas') return t.status === 'feita';
      return true;
    };
    // Todos os filtros menos um (o que se está contando: os números de cada aba e de cada chip dizem o que vem ao clicar).
    function filtrar(lista, menos) {
      const agora = GC.agora();
      const termos = normal(filtro.busca).split(/\s+/).filter(Boolean);
      return lista.filter((t) => {
        if (menos !== 'ligada' && filtro.ligada !== 'todas' && t.contexto.tipo !== filtro.ligada) return false;
        if (filtro.area && t.area !== filtro.area) return false;
        if (filtro.minhas && !minha(t)) return false;
        if (termos.length) { const txt = textoBusca(t); if (!termos.every((p) => txt.includes(p))) return false; }
        return menos === 'situacao' || naSituacao(t, filtro.situacao, agora);
      });
    }

    function grupos(lista) {
      const agora = GC.agora();
      const g = GRUPOS.map(([u, titulo]) => [u, titulo, lista.filter((t) => GC.urgenciaTarefa(t, agora) === u).sort((a, b) => a.prazoEm - b.prazoEm)]);
      g.push(['feita', 'Feitas', lista.filter((t) => t.status === 'feita').sort((a, b) => (b.feitaEm || 0) - (a.feitaEm || 0))]);
      g.push(['cancelada', 'Canceladas', lista.filter((t) => t.status === 'cancelada')]);
      return g.filter(([, , l]) => l.length);
    }

    // Escolhas do "Passar tarefa": só o que a pessoa pode ligar (gabinete: quem gere a crise).
    function escolhas() {
      const d = cb.dados();
      const minhasAreas = (GC.data.areas || []).filter((a) => GC.podeNaTarefa('passar', { area: a.id })).map((a) => a.id);
      const temporadas = GC.sazonal ? GC.sazonal.temporadas().map((t) => ({ id: t.id, nome: `${t.nome} (${GC.sazonal.periodo(t)})`, area: t.area })) : [];
      const alertas = (d.alertas || []).filter((o) => GC.visaoDe(GC.perfil) === 'cidade' || minhasAreas.includes(o.area));
      const gabinetes = GC.podeNaCrise && GC.podeNaCrise('gerir') && d.gabinetes ? d.gabinetes.ativos().map((g) => ({ id: g.id, nome: g.titulo, area: (g.areas || [])[0] || '' })) : [];
      return { temporadas, alertas, gabinetes };
    }

    const filtrosAtivos = () => (filtro.ligada !== 'todas') + !!filtro.area + !!filtro.minhas;
    const algumFiltro = () => filtrosAtivos() > 0 || !!filtro.busca.trim();

    function desenhar() {
      const base = todas();
      const agora = GC.agora();
      const semSit = filtrar(base, 'situacao');
      const conta = (sit) => semSit.filter((t) => naSituacao(t, sit, agora)).length;
      const lista = filtrar(base);
      const feitas30 = semSit.filter((t) => t.status === 'feita' && t.feitaEm > agora - 30 * DIA);
      const noPrazo = feitas30.filter((t) => t.feitaEm <= t.prazoEm).length;
      const podePassar = (GC.data.areas || []).some((a) => GC.podeNaTarefa('passar', { area: a.id }));
      const cidade = GC.visaoDe(GC.perfil) === 'cidade';
      const semLigada = filtrar(base, 'ligada');
      const contaLigada = (tipo) => semLigada.filter((t) => tipo === 'todas' || t.contexto.tipo === tipo).length;

      // Abas baixas: rótulo e número na mesma linha; o complemento vai ao lado só quando diz algo.
      const aba = (valor, rotulo, n, cls = '', sub = '', titulo = '') => {
        const ativo = filtro.situacao === valor;
        return `<button type="button" class="tf-kpi${cls}${ativo ? ' ativo' : ''}" data-tf-filtro="situacao" data-valor="${valor}" aria-pressed="${ativo}"${titulo ? ` title="${esc(titulo)}"` : ''}><small>${rotulo}</small><b>${n}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
      };
      // Chip sem nada para mostrar some (a não ser o escolhido).
      const chip = (grupo, valor, rotulo, n) => {
        const ativo = filtro[grupo] === valor;
        if (n === 0 && !ativo) return '';
        return `<button type="button" class="tf-chip${ativo ? ' ativo' : ''}" data-tf-filtro="${grupo}" data-valor="${esc(valor)}" aria-pressed="${ativo}">${rotulo}${n != null ? ` <b>${n}</b>` : ''}</button>`;
      };
      const nAtrasadas = conta('atrasadas');
      const nCobradas = conta('cobradas');
      const pctPrazo = feitas30.length ? `${Math.round((noPrazo / feitas30.length) * 100)}% no prazo` : '';
      const nFiltros = filtrosAtivos();

      const limpar = '<button type="button" class="tf-limpar" data-tf-limpar>Limpar filtros</button>';
      const vazio = base.length
        ? `<div class="tf-vazio grande">${ic('list-search')}<p><b>Nenhuma demanda ${filtro.situacao === 'todas' ? '' : `${{ abertas: 'aberta', atrasadas: 'atrasada', cobradas: 'cobrada', feitas: 'feita' }[filtro.situacao]} `}com esses filtros.</b></p>${algumFiltro() ? `<p>${limpar}</p>` : ''}</div>`
        : `<div class="tf-vazio grande">${ic('clipboard-list')}<p><b>Nenhuma demanda ainda.</b></p><p>Passe uma demanda daqui, do detalhe de um alerta, de uma temporada do calendário ou da sala de um gabinete de crise.</p></div>`;

      const focoBusca = el.querySelector && document.activeElement && document.activeElement.matches('[data-tf-busca]')
        ? document.activeElement.selectionStart : null;

      el.innerHTML = `<div class="tf-topo" data-tf-caixa>
        <header class="sec-topo"><div>
          <h2>📋 Demandas</h2>
          <p>O que foi passado às secretarias e em que pé está.</p>
        </div>${podePassar ? `<span class="sec-acoes"><button type="button" class="btn-primario" data-tf-form="passar" aria-expanded="false" aria-haspopup="dialog">${ic('plus')} Passar demanda</button></span>` : ''}</header>
        ${podePassar ? GC.htmlFormTarefa(null, escolhas(), '', { folha: true }) : ''}</div>
        <div class="tf-kpis" role="group" aria-label="Situação">
          ${aba('abertas', 'Abertas', conta('abertas'))}
          ${aba('atrasadas', 'Atrasadas', nAtrasadas, nAtrasadas ? ' ruim' : '')}
          ${aba('cobradas', 'Cobradas, sem resposta', nCobradas, nCobradas ? ' alerta' : '')}
          ${aba('feitas', 'Feitas', conta('feitas'), '', pctPrazo, pctPrazo ? `${pctPrazo} nos últimos 30 dias` : 'Nenhuma feita nos últimos 30 dias')}
          ${aba('todas', 'Todas', semSit.length, ' discreta', '', 'Inclusive as canceladas')}
        </div>
        <section class="tf-filtros" aria-label="Filtros">
          <div class="tf-filtros-topo">
            <label class="tf-busca">${ic('search')}<span class="sr-only">Buscar</span><input type="search" data-tf-busca value="${esc(filtro.busca)}" placeholder="Buscar demandas" title="Busca no texto, no que está ligado, na secretaria e nas pessoas" autocomplete="off"></label>
            <button type="button" class="btn-sec tf-filtros-botao" data-tf-filtros-abrir aria-expanded="${filtrosAbertos}">${ic('adjustments-horizontal')} Filtros${nFiltros ? ` <b>${nFiltros}</b>` : ''}</button>
          </div>
          <div class="tf-filtros-corpo${filtrosAbertos ? ' aberto' : ''}">
            <div class="tf-filtro-linha"><span>Ligada a</span>${chip('ligada', 'todas', 'Tudo', contaLigada('todas'))}${['temporada', 'alerta', 'gabinete', 'avulsa'].map((t) => chip('ligada', t, `${ic(GC.CONTEXTOS_TAREFA[t].icone)} ${GC.CONTEXTOS_TAREFA[t].nome}`, contaLigada(t))).join('')}</div>
            <div class="tf-filtro-linha">
              ${cidade ? `<label class="tf-sel"><span>Secretaria</span><select data-tf-area><option value="">Todas</option>${(GC.data.areas || []).map((a) => `<option value="${esc(a.id)}"${filtro.area === a.id ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>` : ''}
              <button type="button" class="tf-chip${filtro.minhas ? ' ativo' : ''}" data-tf-minhas aria-pressed="${filtro.minhas}" title="As que passei ou que estão comigo">${ic('user')} Minhas</button>
              ${algumFiltro() ? limpar : ''}
            </div>
          </div>
        </section>
        <p class="tf-resumo">${plural(lista.length, 'demanda', 'demandas')}${algumFiltro() ? ' com os filtros' : ''}</p>
        ${lista.length ? grupos(lista).map(([u, titulo, l]) => `<section class="tf-grupo ${u}"><h3>${esc(titulo)} <small>${l.length}</small></h3><ul class="tf-lista">${l.map((t) => GC.htmlCartaoTarefa(t, { aberto: t.id === rota.id })).join('')}</ul></section>`).join('') : vazio}`;

      // A busca redesenha a tela: o cursor volta para onde estava.
      if (focoBusca != null) {
        const b = el.querySelector('[data-tf-busca]');
        b.focus();
        b.setSelectionRange(focoBusca, focoBusca);
      }
      // Veio de um link (#/tarefas/<id>): leva até a tarefa.
      if (rota.id && el.querySelector) {
        const c = el.querySelector(`[data-tf-cartao="${CSS.escape(rota.id)}"]`);
        if (c) setTimeout(() => c.scrollIntoView({ block: 'center' }), 0);
      }
    }

    if (el.addEventListener) {
      GC.ligarTarefas(el, { aoConcluir: () => desenhar() });
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-tf-limpar]')) {
          Object.assign(filtro, PADRAO, { situacao: filtro.situacao });
          desenhar();
          return;
        }
        if (e.target.closest('[data-tf-filtros-abrir]')) { filtrosAbertos = !filtrosAbertos; desenhar(); return; }
        if (e.target.closest('[data-tf-minhas]')) { filtro.minhas = !filtro.minhas; desenhar(); return; }
        const b = e.target.closest('[data-tf-filtro]');
        if (!b) return;
        filtro[b.dataset.tfFiltro] = b.dataset.valor;
        desenhar();
      });
      el.addEventListener('change', (e) => {
        if (e.target.matches('[data-tf-area]')) { filtro.area = e.target.value; desenhar(); }
      });
      el.addEventListener('input', (e) => {
        if (e.target.matches('[data-tf-busca]')) { filtro.busca = e.target.value; desenhar(); }
      });
    }

    // O retrato: a tela só se redesenha sozinha quando a lista muda (outra aba, desfazer, gabinete) e nenhum
    // formulário está aberto (pode haver texto digitado).
    const retrato = () => JSON.stringify(todas().map((t) => [t.id, t.status, t.respostaPendente, t.prazoEm]));
    function mostrar(r) {
      rota = r || rota;
      // Link para uma tarefa feita ou cancelada: o filtro abre para ela aparecer.
      const alvo = rota.id && todas().find((t) => t.id === rota.id);
      if (alvo && !GC.tarefaAberta(alvo)) filtro.situacao = 'todas';
      ultimo = retrato();
      desenhar();
    }
    function atualizar() {
      if (el.querySelector && el.querySelector('.cb-form:not([hidden])')) return;
      if (retrato() !== ultimo) { ultimo = retrato(); desenhar(); }
    }
    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
