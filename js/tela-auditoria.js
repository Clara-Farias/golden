(function (GC) {
  // Tela "Auditoria" (#/auditoria): quem fez o quê, quando e em quê. Números do recorte (os dois últimos filtram),
  // filtros (busca, período, pessoa, tipo, ação, secretaria, só o que pede atenção), tabela por dia com "Mostrar mais"
  // e CSV do que está filtrado. Os filtros, menos a busca, vão para o endereço:
  // #/auditoria[/periodo:1|30|tudo][/tipo:<grupo>][/acao:<ação>][/sec:<área>][/pessoa:<id>][/atencao][/entradas]
  // (js/rotas.js). Entradas e saídas ficam escondidas de fábrica ("Mostrar entradas e saídas" as traz) e, à vista,
  // se juntam por pessoa e dia (GC.agruparAuditoria), abrindo ao clicar em "N vezes".
  // No celular, cada evento vira um cartão e os filtros além da busca e do período ficam atrás de "Filtros".
  // O recorte por perfil (o setor só vê a pasta) chega pronto em estado.eventos (js/auditoria.js).
  const esc = (t) => GC.escaparHtml(t);
  const POR_PAGINA = 40;
  const DIA = 86400000;
  const PERIODOS = [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['tudo', 'Tudo']];
  const PERIODO_PADRAO = '7';
  const OCORRENCIAS_E_CRISE = 'ocorrencias,crise';
  const VAZIO = { usuarioId: '', grupo: '', acao: '', area: '', periodo: PERIODO_PADRAO, atencao: false, entradas: false };
  const CORES_AVATAR = 6;

  const inicioDoDia = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function rotuloDia(t, agora) {
    const d = Math.round((inicioDoDia(agora) - inicioDoDia(t)) / DIA);
    if (d === 0) return 'Hoje';
    if (d === 1) return 'Ontem';
    const s = new Date(t).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s[0].toUpperCase() + s.slice(1);
  }
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ROTULO_REF = { ocorrencia: 'Abrir a ocorrência', gabinete: 'Abrir o gabinete de crise', tarefa: 'Abrir a demanda', regra: 'Abrir a regra' };
  // Iniciais: primeira e última palavra do nome ("Ana Beatriz Souza" → AS).
  const iniciais = (nome) => { const p = String(nome || '').split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : ''; };
  // Cor do avatar: a mesma para a mesma pasta (ou pessoa, sem pasta).
  const corAvatar = (chave) => { let h = 0; for (const c of String(chave || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % CORES_AVATAR; };

  // opcoes: { aoExportar(lista), aoFiltrar(rota)?, aoAbrir(ref)? }
  GC.criarTelaAuditoria = function (el, opcoes) {
    const f = Object.assign({ texto: '' }, VAZIO);
    let mostrar = POR_PAGINA;
    let estado = null;
    let assinatura = '';
    let parte = [];
    const abertos = new Set();

    el.innerHTML = `
      <header class="sec-topo"><div><h2>🔍 Auditoria</h2><p class="au-sub"></p></div>
        <span class="sec-acoes"><button type="button" class="btn-sec au-csv"><i class="ti ti-download" aria-hidden="true"></i> Baixar CSV</button></span></header>
      <div class="alr-kpis au-kpis"></div>
      <form class="rel-cartao au-filtros" role="search" aria-label="Filtrar a auditoria">
        <div class="au-linha">
          <label class="au-busca"><i class="ti ti-search" aria-hidden="true"></i><input type="search" name="texto" placeholder="Buscar pessoa, ocorrência…" aria-label="Buscar pessoa, ocorrência ou detalhe na auditoria"></label>
          <div class="au-periodo" role="group" aria-label="Período">${PERIODOS.map(([v, r]) => `<button type="button" data-periodo="${v}" aria-pressed="false">${r}</button>`).join('')}</div>
          <button type="button" class="btn-sec au-abrir-filtros" aria-expanded="false" aria-controls="au-mais-filtros"><i class="ti ti-adjustments-horizontal" aria-hidden="true"></i> Filtros<span class="au-conta-filtros"></span></button>
        </div>
        <div class="au-linha au-mais-filtros" id="au-mais-filtros">
          <label>Pessoa<select name="usuarioId"></select></label>
          <label>Tipo<select name="grupo"><option value="">Todos</option><option value="${OCORRENCIAS_E_CRISE}">Ocorrências e gabinete de crise</option>${GC.GRUPOS_AUDITORIA.map((g) => `<option value="${g.id}">${esc(g.nome)}</option>`).join('')}</select></label>
          <label>Ação<select name="acao"></select></label>
          <label class="au-area">Secretaria<select name="area"></select></label>
          <span class="au-chaves">
            <button type="button" class="au-chave au-so-atencao" aria-pressed="false"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Só o que pede atenção</button>
            <button type="button" class="au-chave au-entradas" aria-pressed="false"><i class="ti ti-login-2" aria-hidden="true"></i> <span class="au-entradas-txt">Mostrar entradas e saídas</span></button>
            <button type="button" class="au-limpar" hidden><i class="ti ti-x" aria-hidden="true"></i> Limpar filtros</button>
          </span>
        </div>
      </form>
      <section class="rel-cartao au-lista" aria-live="polite"></section>`;

    const form = el.querySelector('.au-filtros');
    form.onsubmit = (ev) => ev.preventDefault();

    // Rota dos filtros (sem a busca) e o caminho de volta, validando cada valor.
    const rotaDe = () => ({
      tela: 'auditoria',
      periodo: f.periodo !== PERIODO_PADRAO ? f.periodo : undefined,
      tipo: f.grupo || undefined,
      acao: f.acao || undefined,
      sec: f.area || undefined,
      pessoa: f.usuarioId || undefined,
      atencao: f.atencao || undefined,
      entradas: f.entradas || undefined,
    });
    const gruposDe = (grupo) => (grupo ? grupo.split(',') : null);
    // A ação escolhida precisa caber no tipo; se não cabe, sai.
    function acertarAcao() {
      const gs = gruposDe(f.grupo);
      if (f.acao && (!GC.ACOES_AUDITORIA[f.acao] || (gs && !gs.includes(GC.ACOES_AUDITORIA[f.acao].grupo)))) f.acao = '';
    }
    function lerRota(rota = {}) {
      const grupos = [OCORRENCIAS_E_CRISE, ...GC.GRUPOS_AUDITORIA.map((g) => g.id)];
      f.periodo = PERIODOS.some(([v]) => v === rota.periodo) ? rota.periodo : PERIODO_PADRAO;
      f.grupo = grupos.includes(rota.tipo) ? rota.tipo : '';
      f.acao = rota.acao && GC.ACOES_AUDITORIA[rota.acao] ? rota.acao : '';
      f.area = estado.areas && estado.areas.some((a) => a.id === rota.sec) ? rota.sec : '';
      f.usuarioId = estado.usuarios.some((u) => u.id === rota.pessoa) ? rota.pessoa : '';
      f.atencao = !!rota.atencao;
      f.entradas = !!rota.entradas;
      acertarAcao();
    }
    // Mudou um filtro: volta ao começo da lista e, com rotas, grava no endereço (que chama mostrar de volta).
    function mudar(novo) {
      Object.assign(f, novo);
      acertarAcao();
      mostrar = POR_PAGINA;
      if (opcoes.aoFiltrar) opcoes.aoFiltrar(rotaDe());
      else { sincronizarCampos(); desenhar(); }
    }

    let atraso = null;
    form.texto.oninput = () => { clearTimeout(atraso); atraso = setTimeout(() => { f.texto = form.texto.value; mostrar = POR_PAGINA; desenhar(); }, 150); };
    ['usuarioId', 'grupo', 'acao', 'area'].forEach((n) => { form[n].onchange = () => mudar({ [n]: form[n].value }); });
    form.querySelectorAll('[data-periodo]').forEach((b) => { b.onclick = () => mudar({ periodo: b.dataset.periodo }); });
    form.querySelector('.au-so-atencao').onclick = () => mudar({ atencao: !f.atencao });
    form.querySelector('.au-entradas').onclick = () => mudar({ entradas: !f.entradas });
    form.querySelector('.au-limpar').onclick = () => { f.texto = ''; form.texto.value = ''; mudar(Object.assign({}, VAZIO)); };
    const abrirFiltros = form.querySelector('.au-abrir-filtros');
    abrirFiltros.onclick = () => {
      const aberto = !form.classList.contains('aberto');
      form.classList.toggle('aberto', aberto);
      abrirFiltros.setAttribute('aria-expanded', String(aberto));
    };
    el.querySelector('.au-csv').onclick = () => opcoes.aoExportar(filtrados());

    // Números que filtram: "Em ocorrências e crise" liga o Tipo; "Acessos recusados", o "Só o que pede atenção".
    el.querySelector('.au-kpis').onclick = (ev) => {
      const b = ev.target.closest('[data-kpi]');
      if (!b) return;
      if (b.dataset.kpi === 'ocorrencias') mudar({ grupo: f.grupo === OCORRENCIAS_E_CRISE ? '' : OCORRENCIAS_E_CRISE });
      if (b.dataset.kpi === 'atencao') mudar({ atencao: !f.atencao });
    };
    // Na lista: a pessoa filtra por ela; a ação filtra por ela; o "Em quê" abre o item; "N vezes" abre o grupo;
    // "Mostrar mais" e "Limpar filtros".
    el.querySelector('.au-lista').onclick = (ev) => {
      const pessoa = ev.target.closest('[data-pessoa]');
      if (pessoa) { mudar({ usuarioId: pessoa.dataset.pessoa }); return; }
      const acao = ev.target.closest('[data-filtrar-acao]');
      if (acao) { mudar({ acao: acao.dataset.filtrarAcao, grupo: '' }); return; }
      const grupo = ev.target.closest('[data-grupo-abrir]');
      if (grupo) {
        const k = grupo.dataset.grupoAbrir;
        if (abertos.has(k)) abertos.delete(k); else abertos.add(k);
        redesenhar();
        const b = el.querySelector(`[data-grupo-abrir="${CSS.escape(k)}"]`);
        if (b) b.focus();
        return;
      }
      const abrir = ev.target.closest('[data-abrir]');
      if (abrir && opcoes.aoAbrir) { const e = parte[Number(abrir.dataset.abrir)]; if (e && e.ref) opcoes.aoAbrir(e.ref); return; }
      if (ev.target.closest('.au-limpar-vazio')) { form.querySelector('.au-limpar').click(); return; }
      if (ev.target.closest('.au-mais')) { mostrar += POR_PAGINA; redesenhar(); }
    };
    const redesenhar = () => { if (GC.redesenharMantendo) GC.redesenharMantendo(el, ['.rel-tabela-wrap'], desenhar); else desenhar(); };

    function desde() { return f.periodo === 'tudo' ? null : inicioDoDia(estado.agora) - (Number(f.periodo) - 1) * DIA; }
    const filtroAtual = (semRotina = !f.entradas) => ({ texto: f.texto, usuarioId: f.usuarioId, grupo: f.grupo, acao: f.acao, area: f.area, desde: desde(), atencao: f.atencao, semRotina });
    function filtrados(semRotina) { return GC.filtrarAuditoria(estado.eventos, filtroAtual(semRotina)); }

    function opcoesSelect() {
      const { usuarios, areas } = estado;
      form.usuarioId.innerHTML = `<option value="">Todas</option>${usuarios.map((u) => `<option value="${esc(u.id)}">${esc(u.nome)} · ${esc(u.cargo)}</option>`).join('')}`;
      const temArea = areas && areas.length > 1;
      form.querySelector('.au-area').hidden = !temArea;
      if (temArea) form.area.innerHTML = `<option value="">Todas</option>${areas.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}`;
    }
    // Ações do campo "Ação": só as que aparecem nos eventos (e a escolhida), no tipo escolhido, agrupadas por tipo.
    function opcoesAcao() {
      const usadas = new Set(estado.eventos.map((e) => e.acao));
      if (f.acao) usadas.add(f.acao);
      const gs = gruposDe(f.grupo);
      const blocos = GC.GRUPOS_AUDITORIA.filter((g) => !gs || gs.includes(g.id)).map((g) => {
        const acoes = Object.entries(GC.ACOES_AUDITORIA).filter(([id, a]) => a.grupo === g.id && usadas.has(id))
          .sort((x, y) => x[1].nome.localeCompare(y[1].nome, 'pt-BR'));
        if (!acoes.length) return '';
        const ops = acoes.map(([id, a]) => `<option value="${esc(id)}">${esc(a.nome)}</option>`).join('');
        return gs && gs.length === 1 ? ops : `<optgroup label="${esc(g.nome)}">${ops}</optgroup>`;
      }).join('');
      form.acao.innerHTML = `<option value="">Todas</option>${blocos}`;
      form.acao.value = f.acao;
    }
    function sincronizarCampos() {
      form.usuarioId.value = f.usuarioId;
      form.grupo.value = f.grupo;
      opcoesAcao();
      if (!form.querySelector('.au-area').hidden) form.area.value = f.area;
      form.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === f.periodo)));
      form.querySelector('.au-so-atencao').setAttribute('aria-pressed', String(f.atencao));
      const ent = form.querySelector('.au-entradas');
      ent.setAttribute('aria-pressed', String(f.entradas));
      ent.hidden = !!f.acao; // com a ação escolhida, ela manda
      const extras = [f.usuarioId, f.grupo, f.acao, f.area, f.atencao, f.entradas].filter(Boolean).length;
      form.querySelector('.au-conta-filtros').textContent = extras ? ` (${extras})` : '';
      form.querySelector('.au-limpar').hidden = !filtroLigado();
    }
    const filtroLigado = () => !!(f.texto || f.usuarioId || f.grupo || f.acao || f.area || f.atencao || f.entradas || f.periodo !== PERIODO_PADRAO);

    function celulaPessoa(e) {
      const nome = e.usuarioId && e.usuarioId !== f.usuarioId
        ? `<button type="button" class="au-link" data-pessoa="${esc(e.usuarioId)}" title="Ver só o que ${esc(e.quem)} fez">${esc(e.quem)}</button>`
        : `<b>${esc(e.quem)}</b>`;
      const ini = e.usuarioId ? iniciais(e.quem) : '';
      const av = ini
        ? `<span class="au-av au-av-${corAvatar(e.area || e.usuarioId)}" aria-hidden="true">${esc(ini)}</span>`
        : '<span class="au-av au-av-anonimo" aria-hidden="true"><i class="ti ti-user-question"></i></span>';
      return `<td class="au-quem"><span class="au-pessoa">${av}<span class="au-pessoa-txt">${nome}${e.cargo ? `<small>${esc(e.cargo)}</small>` : ''}</span></span></td>`;
    }
    function celulaAcao(e, extra = '') {
      const a = GC.ACOES_AUDITORIA[e.acao];
      const nome = e.acao !== f.acao
        ? `<button type="button" class="au-link au-acao-link" data-filtrar-acao="${esc(e.acao)}" title="Ver só “${esc(a.nome)}”">${esc(a.nome)}</button>`
        : `<span>${esc(a.nome)}</span>`;
      return `<td class="au-acao" data-grupo="${esc(a.grupo)}"><span class="au-acao-in"><span class="au-ic" aria-hidden="true"><i class="ti ti-${a.icone}"></i></span>${nome}${extra}</span></td>`;
    }
    // "Em quê": o item (link quando abre), o detalhe e, quando há item, a secretaria dele. Sem nada, a célula fica vazia.
    function celulaAlvo(e, i) {
      const { nomeArea, abrivel } = estado;
      const alvo = !e.alvo ? ''
        : abrivel && abrivel(e.ref)
          ? `<button type="button" class="au-link au-alvo-link" data-abrir="${i}" title="${ROTULO_REF[e.ref.tipo]}">${esc(e.alvo)} <i class="ti ti-arrow-up-right" aria-hidden="true"></i></button>`
          : `<span>${esc(e.alvo)}</span>`;
      const sec = e.alvo ? (e.areaAlvo || e.area) : e.areaAlvo;
      const linhas = [e.detalhe ? `<small>${esc(e.detalhe)}</small>` : '', sec ? `<small class="au-alvo-sec"><i class="ti ti-building" aria-hidden="true"></i> ${esc(nomeArea(sec))}</small>` : ''].join('');
      return `<td class="au-alvo${alvo || linhas ? '' : ' au-sem'}">${alvo}${linhas}</td>`;
    }
    const celulaHora = (e, texto = hora(e.t)) => `<td class="au-hora"><time datetime="${new Date(e.t).toISOString()}" title="${esc(GC.dataHoraAuditoria(e.t))}">${texto}</time></td>`;

    function linhaEvento(e, i) {
      const a = GC.ACOES_AUDITORIA[e.acao];
      return `<tr class="${a.atencao ? 'au-atencao' : ''}">${celulaHora(e)}${celulaPessoa(e)}${celulaAcao(e)}${celulaAlvo(e, i)}</tr>`;
    }
    // Grupo de entradas (ou saídas) da mesma pessoa no dia: uma linha com o intervalo e "N vezes", que abre a lista.
    function linhasGrupo(g) {
      const aberto = abertos.has(g.chave);
      const maisVelho = g.vezes[g.vezes.length - 1].e;
      const intervalo = `${hora(maisVelho.t)}<span class="au-ate">–${hora(g.e.t)}</span>`;
      const botao = `<button type="button" class="au-vezes" data-grupo-abrir="${esc(g.chave)}" aria-expanded="${aberto}" title="${aberto ? 'Recolher' : 'Ver cada uma'}">${g.vezes.length} vezes <i class="ti ti-chevron-${aberto ? 'up' : 'down'}" aria-hidden="true"></i></button>`;
      const cab = `<tr class="au-grupo${aberto ? ' aberto' : ''}">${celulaHora(g.e, intervalo)}${celulaPessoa(g.e)}${celulaAcao(g.e, botao)}${celulaAlvo(g.e, g.i)}</tr>`;
      if (!aberto) return [cab];
      return [cab, ...g.vezes.map(({ e, i }) => `<tr class="au-sublinha">${celulaHora(e)}<td class="au-quem au-sem"></td><td class="au-acao au-sem"></td>${celulaAlvo(e, i)}</tr>`)];
    }

    function desenhar() {
      const { setor, nomeArea, agora } = estado;
      el.querySelector('.au-sub').textContent = setor
        ? `O que foi feito no painel por gente da ${nomeArea(setor)} ou em ocorrências e demandas da pasta.`
        : 'Quem fez o quê no painel, quando e em quê: acessos, ações nas ocorrências, gabinetes de crise e configurações.';
      sincronizarCampos();

      const lista = filtrados();
      const escondidas = f.entradas || f.acao ? 0 : filtrados(false).length - lista.length;
      form.querySelector('.au-entradas-txt').textContent = f.entradas ? 'Esconder entradas e saídas'
        : `Mostrar entradas e saídas${escondidas ? ` (${escondidas.toLocaleString('pt-BR')})` : ''}`;

      const n = (v) => v.toLocaleString('pt-BR');
      const tend = GC.tendenciaAuditoria(estado.eventos, filtroAtual(), agora);
      const r = tend.atual;
      // Cada número: ícone, valor, variação contra a janela anterior e um minigráfico por dia (por hora em "Hoje").
      const ROT_ANTES = { 1: 'ontem até esta hora', 7: 'os 7 dias antes', 30: 'os 30 dias antes' };
      function variacao(chave, subirEhRuim) {
        if (!tend.anterior) return `<span class="au-delta-ref">sem comparação · gráfico dos últimos ${tend.serie.length} dias</span>`;
        const a = r[chave], b = tend.anterior[chave], d = a - b;
        const ref = `<span class="au-delta-ref">vs ${ROT_ANTES[f.periodo]} (${n(b)})</span>`;
        if (!d) return `<span class="au-delta igual"><i class="ti ti-equal" aria-hidden="true"></i> igual</span>${ref}`;
        const txt = b >= 10 ? `${Math.round(Math.abs(d) / b * 100)}%` : n(Math.abs(d));
        const cls = subirEhRuim ? (d > 0 ? 'ruim' : 'bom') : 'neutro';
        const seta = d > 0 ? 'arrow-up-right' : 'arrow-down-right';
        return `<span class="au-delta ${cls}"><i class="ti ti-${seta}" aria-hidden="true"></i> <span class="so-leitor">${d > 0 ? 'subiu' : 'caiu'} </span>${d > 0 ? '+' : '−'}${txt}</span>${ref}`;
      }
      const ROT_BARRA = (p) => (tend.passo === 'hora' ? `${new Date(p.t).getHours()}h`
        : new Date(p.t).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'numeric' }));
      function grafico(chave, unidade) {
        if (tend.serie.length < 2) return '';
        const max = Math.max(1, ...tend.serie.map((p) => p.resumo[chave]));
        const barras = tend.serie.map((p, k) => {
          const v = p.resumo[chave];
          const atual = k === tend.serie.length - 1;
          return `<i class="${atual ? 'atual' : ''}${v ? '' : ' zero'}" style="height:${v ? Math.max(12, Math.round(v / max * 100)) : 0}%" title="${esc(ROT_BARRA(p))}: ${n(v)} ${unidade}"></i>`;
        }).join('');
        return `<span class="au-spark" aria-hidden="true">${barras}</span>`;
      }
      const corpo = (chave, rot, icone, unidade, subirEhRuim) => `
        <span class="au-num-topo"><small>${rot}</small><span class="au-num-ic" aria-hidden="true"><i class="ti ti-${icone}"></i></span></span>
        <span class="au-num-valor"><b>${n(r[chave])}</b>${variacao(chave, subirEhRuim)}</span>
        ${grafico(chave, unidade)}`;
      const numero = (chave, rot, icone, unidade) => `<div class="rel-numero au-num" data-num="${chave}">${corpo(chave, rot, icone, unidade, false)}</div>`;
      const atalho = (kpi, chave, rot, icone, unidade, ligado, dica, subirEhRuim, cls = '') => `<button type="button" class="rel-numero au-num au-kpi ${cls}" data-num="${chave}" data-kpi="${kpi}" aria-pressed="${ligado}" title="${dica}">
        ${corpo(chave, rot, icone, unidade, subirEhRuim)}<span class="au-kpi-acao">${ligado ? '<i class="ti ti-x" aria-hidden="true"></i> Tirar o filtro' : '<i class="ti ti-filter" aria-hidden="true"></i> Ver só esses'}</span></button>`;
      el.querySelector('.au-kpis').innerHTML = [
        numero('eventos', 'Eventos', 'activity', 'eventos'),
        numero('pessoas', 'Pessoas', 'users', 'pessoas'),
        atalho('ocorrencias', 'ocorrencias', 'Em ocorrências e crise', 'urgent', 'ações', f.grupo === OCORRENCIAS_E_CRISE, 'Ver só as ações em ocorrências e gabinetes de crise', false),
        atalho('atencao', 'recusas', 'Acessos recusados', 'lock-x', 'recusados', f.atencao, 'Ver só o que pede atenção: acessos recusados, bloqueios e telas fora do perfil', true, r.recusas ? 'au-num-alerta' : ''),
      ].join('');

      const caixa = el.querySelector('.au-lista');
      if (!lista.length) {
        parte = [];
        const dica = escondidas ? `<p class="au-vazio-dica">Há ${n(escondidas)} entradas e saídas escondidas.</p>` : '';
        caixa.innerHTML = `<div class="au-vazio"><p><i class="ti ti-list-search" aria-hidden="true"></i> Nenhum evento com esses filtros.</p>${dica}
          ${filtroLigado() ? '<button type="button" class="btn-sec au-limpar-vazio"><i class="ti ti-x" aria-hidden="true"></i> Limpar filtros</button>' : ''}</div>`;
        return;
      }
      parte = lista.slice(0, mostrar);
      let dia = null;
      const linhas = [];
      GC.agruparAuditoria(parte).forEach((it) => {
        const d = inicioDoDia(it.e.t);
        if (d !== dia) { dia = d; linhas.push(`<tr class="au-dia"><th colspan="4" scope="colgroup">${esc(rotuloDia(it.e.t, agora))}</th></tr>`); }
        if (it.vezes) linhas.push(...linhasGrupo(it)); else linhas.push(linhaEvento(it.e, it.i));
      });
      caixa.innerHTML = `
        <div class="rel-tabela-wrap"><table class="sec-tabela au-tabela">
          <caption class="so-leitor">Eventos da auditoria, do mais novo ao mais antigo</caption>
          <colgroup><col class="au-col-hora"><col class="au-col-quem"><col class="au-col-acao"><col></colgroup>
          <thead><tr><th scope="col">Hora</th><th scope="col">Pessoa</th><th scope="col">Ação</th><th scope="col">Em quê</th></tr></thead>
          <tbody>${linhas.join('')}</tbody></table></div>
        <p class="au-rodape">Mostrando ${n(parte.length)} de ${n(lista.length)}${lista.length > parte.length ? ' <button type="button" class="btn-sec au-mais">Mostrar mais</button>' : ''}</p>`;
    }

    const assinar = (e) => `${e.eventos.length}:${e.eventos[0] ? e.eventos[0].id : ''}`;
    return {
      // rota: a de #/auditoria (filtros no endereço); sem ela, os filtros de agora continuam.
      mostrar(e, rota) {
        estado = e;
        assinatura = assinar(e);
        opcoesSelect();
        if (rota) lerRota(rota);
        mostrar = POR_PAGINA;
        desenhar();
      },
      atualizar(e) {
        const nova = assinar(e);
        estado = e;
        if (nova === assinatura) return;
        assinatura = nova;
        const foco = document.activeElement === form.texto;
        desenhar();
        if (foco) form.texto.focus();
      },
    };
  };
})(window.GC = window.GC || {});
