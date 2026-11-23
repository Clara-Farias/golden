(function (GC) {
  // Tela "Histórico de cobranças" (#/cobrancas): todas as cobranças do prefeito, com filtro, números e o histórico
  // de cada uma. O prefeito vê todas as pastas; o secretário, só a dele. Regras em js/cobrancas-historico.js.
  // Visual da Auditoria (css/conta.css: .au-filtros, .au-linha, .au-periodo, .au-kpi, .au-delta, .au-limpar, .rel-numero) e da
  // lista de cobranças (css/cobrancas.css). No topo: os números (no prazo em destaque, com a meta e o período anterior), o
  // gráfico por dia (clique leva ao dia na lista) e os chips de situação com a contagem. Filtros no endereço: #/cobrancas[/periodo:7|90|tudo][/sit:<situação>][/sec:<área>][/recobradas].
  const esc = (t) => GC.escaparHtml(t);
  const MIN = 60000;
  const DIA = 1440 * MIN;
  const POR_PAGINA = 30;
  const PERIODO_PADRAO = '30';
  const PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['tudo', 'Tudo']];
  const ESTADOS = [['todas', 'Todas'], ['abertas', 'Em aberto'], ['vencidas', 'Venceram'], ['esperam', 'Esperam o prefeito'], ['encerradas', 'Encerradas']];
  const VAZIO = { estado: 'todas', area: '', periodo: PERIODO_PADRAO, recobradas: false };
  const area = (id) => GC.data.areas.find((a) => a.id === id) || { nome: id, secretaria: { nome: id, emoji: '' } };
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const num = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR') : v);
  const minTexto = (m) => (m === null ? '—' : GC.tempoTexto(Math.max(1, m)));
  const inicioDoDia = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function rotuloDia(t, agora) {
    const d = Math.round((inicioDoDia(agora) - inicioDoDia(t)) / DIA);
    if (d === 0) return 'Hoje';
    if (d === 1) return 'Ontem';
    const s = new Date(t).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s[0].toUpperCase() + s.slice(1);
  }

  // opcoes: { aoAbrir(ocorrenciaId) (só as que existem nesta aba), aoExportar(lista), aoFiltrar(rota)? }
  GC.criarTelaCobrancas = function (el, opcoes = {}) {
    const f = Object.assign({ busca: '' }, VAZIO);
    let mostrar = POR_PAGINA;
    let ultimo = null;
    const abertos = new Set(); // cobranças com o histórico aberto (sobrevive ao redesenho)
    // O quadro por secretaria recolhe (e fica assim ao redesenhar); no celular começa recolhido, para a lista subir.
    let pastasAbertas = !(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);

    el.innerHTML = `
      <header class="sec-topo"><div><h2>📣 Histórico de cobranças</h2><p class="hc-sub"></p></div>
        <span class="sec-acoes"><button type="button" class="btn-sec hc-csv"><i class="ti ti-download" aria-hidden="true"></i> Baixar CSV</button></span></header>
      <div class="hc-kpis"></div>
      <section class="rel-cartao hc-grafico" aria-labelledby="hc-graf-tit"></section>
      <form class="rel-cartao au-filtros hc-filtros" role="search" aria-label="Filtrar as cobranças">
        <div class="au-linha">
          <label class="au-busca"><i class="ti ti-search" aria-hidden="true"></i><input type="search" name="busca" placeholder="Buscar ocorrência ou bairro…" aria-label="Buscar nas cobranças"></label>
          <div class="au-periodo" role="group" aria-label="Período">${PERIODOS.map(([v, r]) => `<button type="button" data-periodo="${v}" aria-pressed="false">${r}</button>`).join('')}</div>
        </div>
        <div class="hc-chips-linha">
          <div class="hc-chips" role="group" aria-label="Situação"></div>
          <button type="button" class="au-limpar" hidden><i class="ti ti-x" aria-hidden="true"></i> Limpar filtros</button>
        </div>
      </form>
      <div class="hc-corpo">
        <section class="rel-cartao hc-pastas" aria-labelledby="hc-pastas-tit" hidden></section>
        <section class="rel-cartao hc-lista" aria-live="polite"></section>
      </div>`;

    const form = el.querySelector('.hc-filtros');
    form.onsubmit = (ev) => ev.preventDefault();
    const meta = () => (GC.metaNoPrazo ? GC.metaNoPrazo() : 85);
    // A cor da porcentagem no prazo: na meta, até 25 pontos abaixo, mais longe que isso.
    const nivelPct = (p) => (p === null ? '' : p >= meta() ? 'bom' : p >= meta() - 25 ? 'medio' : 'ruim');
    const barra = (p) => `<span class="hc-barra ${nivelPct(p)}" aria-hidden="true" style="--meta:${meta()}%"><span style="width:${p ?? 0}%"></span></span>`;
    // Primeira resposta de uma cobrança: minutos (null = sem resposta), prazo e se veio no prazo.
    function respostaDe(c) {
      const r = GC.primeiraRespostaCobranca(c);
      const minutos = r ? Math.round((r.em - c.em) / MIN) : null;
      const prazoMin = (GC.PRAZO_RESPOSTA_MIN || {})[c.retrato.severidade] || 120;
      return { minutos, prazoMin, noPrazo: minutos !== null && minutos <= prazoMin };
    }

    // Rota dos filtros (sem a busca) e o caminho de volta, validando cada valor.
    const rotaDe = () => ({
      tela: 'cobrancas',
      periodo: f.periodo !== PERIODO_PADRAO ? f.periodo : undefined,
      sit: f.estado !== 'todas' ? f.estado : undefined,
      sec: f.area || undefined,
      recobradas: f.recobradas || undefined,
    });
    function lerRota(rota = {}) {
      f.periodo = PERIODOS.some(([v]) => v === rota.periodo) ? rota.periodo : PERIODO_PADRAO;
      f.estado = ESTADOS.some(([v]) => v === rota.sit) ? rota.sit : 'todas';
      f.area = GC.data.areas.some((a) => a.id === rota.sec) ? rota.sec : '';
      f.recobradas = !!rota.recobradas;
    }
    // Mudou um filtro: volta ao começo da lista e, com rotas, grava no endereço (que chama mostrar de volta).
    function mudar(novo) {
      Object.assign(f, novo);
      mostrar = POR_PAGINA;
      if (opcoes.aoFiltrar) opcoes.aoFiltrar(rotaDe());
      else desenhar();
    }
    const filtroLigado = () => !!(f.busca || f.estado !== 'todas' || f.area || f.recobradas || f.periodo !== PERIODO_PADRAO);
    function limpar() { f.busca = ''; form.busca.value = ''; mudar(Object.assign({}, VAZIO)); }

    let atraso = null;
    form.busca.oninput = () => { clearTimeout(atraso); atraso = setTimeout(() => { f.busca = form.busca.value; mostrar = POR_PAGINA; desenhar(); }, 150); };
    form.querySelectorAll('[data-periodo]').forEach((b) => { b.onclick = () => mudar({ periodo: b.dataset.periodo }); });
    form.querySelector('.au-limpar').onclick = limpar;
    // Chips de situação (com a contagem) e os chips que tiram um filtro (secretaria, cobradas de novo).
    form.querySelector('.hc-chips').onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.estado) mudar({ estado: b.dataset.estado });
      else if (b.hasAttribute('data-tirar-pasta')) mudar({ area: '' });
      else if (b.hasAttribute('data-tirar-recobradas')) mudar({ recobradas: false });
    };
    el.querySelector('.hc-csv').onclick = () => { if (ultimo && opcoes.aoExportar) opcoes.aoExportar(filtradas()); };
    // Gráfico por dia: o clique leva a lista até o dia (mostra mais itens se ele ainda não apareceu).
    el.querySelector('.hc-grafico').onclick = (ev) => {
      const b = ev.target.closest('[data-hc-dia]');
      if (b) irAoDia(Number(b.dataset.hcDia));
    };
    function irAoDia(t) {
      const itens = filtradas();
      const i = itens.findIndex((c) => inicioDoDia(c.em) === t);
      if (i < 0) return;
      if (i >= mostrar) { mostrar = Math.ceil((i + 1) / POR_PAGINA) * POR_PAGINA; desenhar(); }
      const alvo = lista.querySelector(`.hc-dia[data-dia="${t}"]`);
      if (!alvo) return;
      const calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      alvo.scrollIntoView({ block: 'start', behavior: calmo ? 'auto' : 'smooth' });
      alvo.classList.remove('piscar');
      void alvo.offsetWidth; // reinicia a animação
      alvo.classList.add('piscar');
    }

    // Números que filtram: "Cobradas de novo" e "Vencidas agora" (ligam e desligam, como na Auditoria).
    el.querySelector('.hc-kpis').onclick = (ev) => {
      const b = ev.target.closest('[data-kpi]');
      if (!b) return;
      if (b.dataset.kpi === 'recobradas') mudar({ recobradas: !f.recobradas });
      if (b.dataset.kpi === 'vencidas') mudar({ estado: f.estado === 'vencidas' ? 'todas' : 'vencidas' });
    };
    // Quadro por secretaria: a pasta filtra a lista (de novo, tira o filtro).
    el.querySelector('.hc-pastas').onclick = (ev) => {
      if (ev.target.closest('.hc-pastas-tit')) {
        ev.preventDefault();
        pastasAbertas = !pastasAbertas;
        quadroPastas();
        return;
      }
      const b = ev.target.closest('[data-pasta]');
      if (b) mudar({ area: f.area === b.dataset.pasta ? '' : b.dataset.pasta });
    };

    const lista = el.querySelector('.hc-lista');
    lista.addEventListener('click', (e) => {
      if (e.target.closest('[data-hc-mais]')) { mostrar += POR_PAGINA; desenhar(); return; }
      if (e.target.closest('[data-hc-limpar]')) { limpar(); return; }
      const abrir = e.target.closest('[data-hc-abrir]');
      if (abrir) { if (opcoes.aoAbrir) opcoes.aoAbrir(abrir.dataset.hcAbrir); return; }
      const linha = e.target.closest('[data-hc-id]');
      if (!linha) return;
      const id = linha.dataset.hcId;
      if (abertos.has(id)) abertos.delete(id); else abertos.add(id);
      desenhar();
    });

    // semArea: o recorte de todos os filtros menos a secretaria (é o que o quadro por secretaria compara).
    // semEstado: sem o filtro de situação (é o que os chips contam). anterior: o mesmo recorte no período de antes.
    function filtradas({ semArea = false, semEstado = false, anterior = false } = {}) {
      const e = ultimo;
      const pasta = e.areaFixa || (semArea ? null : f.area || null);
      const dias = f.periodo === 'tudo' ? null : Number(f.periodo);
      if (anterior && !dias) return null;
      let itens = GC.filtrarCobrancas(e.lista, { area: pasta, estado: semEstado ? 'todas' : f.estado, dias: anterior ? dias * 2 : dias, busca: f.busca }, e.cobrancas, e.agora);
      if (anterior) itens = itens.filter((c) => c.em < e.agora - dias * DIA);
      return f.recobradas ? itens.filter((c) => c.vezes > 1) : itens;
    }

    // A situação sem repetir o selo: "Resolvida" + "com evidência", não "Resolvida" + "Resolvida com evidência".
    function detalheSituacao(c) {
      const t = GC.resumoCobranca(c, ultimo.agora).replace(/^\S+ /, '');
      if (c.estado !== 'encerrada') return t;
      return t.replace(/^Resolvida\s*/, '') || 'sem evidência registrada';
    }

    // Régua da 1ª resposta: o trilho vai até o maior entre o tempo e o prazo, com um traço no prazo; o que passou
    // dele fica vermelho. Sem resposta, nada (o "Aguardando" já diz).
    function regua(minutos, prazoMin, noPrazo) {
      if (minutos === null) return '';
      const fim = Math.max(minutos, prazoMin);
      const ate = Math.min(minutos, prazoMin);
      const prazo = (prazoMin / fim) * 100;
      return `<span class="hc-regua${noPrazo ? ' ok' : ' fora'}" aria-hidden="true" style="--prazo:${prazo.toFixed(1)}%">
        <span class="dentro" style="width:${((ate / fim) * 100).toFixed(1)}%"></span>${noPrazo ? '' : `<span class="passou" style="width:${(100 - prazo).toFixed(1)}%"></span>`}</span>`;
    }

    function linha(c) {
      const e = ultimo;
      const { minutos, prazoMin, noPrazo } = respostaDe(c);
      const aberto = abertos.has(c.id);
      const naAba = e.existe(c.ocorrenciaId);
      const sec = area(c.area).secretaria;
      // O tempo não depende só da cor: ícone, o prazo embaixo e o texto para leitor de tela.
      const resposta = minutos === null
        ? '<span class="hc-sem">Aguardando</span>'
        : `<b class="${noPrazo ? 'ok' : 'fora'}"><i class="ti ${noPrazo ? 'ti-circle-check' : 'ti-alert-triangle'}" aria-hidden="true"></i> ${GC.tempoTexto(Math.max(1, minutos))}<span class="sr-only">${noPrazo ? ', no prazo' : ', fora do prazo'}</span></b>`;
      // Encerrada é linha discreta; aberta, vencida ou esperando o prefeito vira cartão com a cor da situação.
      const sit = GC.situacaoHistoricoCobranca(c, e.cobrancas, e.agora);
      return `<li class="hc-item sit-${sit}${sit !== 'encerradas' ? ' destaque' : ''}${aberto ? ' aberto' : ''}">
        <button type="button" class="hc-linha" data-hc-id="${esc(c.id)}" aria-expanded="${aberto}">
          <span class="hc-quando"><time datetime="${new Date(c.em).toISOString()}">${hora(c.em)}</time></span>
          <span class="hc-oque"><b>${esc(c.retrato.titulo)}</b><small>${esc(bairro(c.retrato.bairroId).nome)}${e.areaFixa ? '' : ` · ${sec.emoji} ${esc(sec.nome)}`}</small>${c.vezes > 1 ? `<span class="hc-vezes"><i class="ti ti-repeat" aria-hidden="true"></i> cobrada ${c.vezes}×</span>` : ''}</span>
          <span class="hc-resp"><span class="hc-rot">1ª resposta </span>${resposta}${regua(minutos, prazoMin, noPrazo)}<small>prazo ${GC.tempoTexto(prazoMin)}</small></span>
          <span class="hc-situacao">${GC.seloCobranca ? GC.seloCobranca(c) : ''}<small>${esc(detalheSituacao(c))}</small></span>
          <i class="ti ti-chevron-down hc-seta" aria-hidden="true"></i>
        </button>
        ${aberto ? `<div class="hc-detalhe">${GC.htmlHistoricoCobranca ? GC.htmlHistoricoCobranca(c, { horas: true }) : ''}${naAba ? `<button type="button" class="alerta-ver" data-hc-abrir="${esc(c.ocorrenciaId)}">Abrir a ocorrência →</button>` : ''}</div>` : ''}
      </li>`;
    }

    // Itens com o cabeçalho do dia ("Hoje", "Ontem", "Segunda-feira, 9 de novembro"), preso ao rolar e com o resumo
    // do dia contado em todas as do filtro (não só nas já mostradas).
    function itensPorDia(parte, todas, agora) {
      const resumo = new Map();
      todas.forEach((c) => {
        const d = inicioDoDia(c.em);
        const r = resumo.get(d) || { n: 0, fora: 0, sem: 0 };
        const x = respostaDe(c);
        r.n += 1;
        if (x.minutos === null) r.sem += 1; else if (!x.noPrazo) r.fora += 1;
        resumo.set(d, r);
      });
      let dia = null;
      const out = [];
      parte.forEach((c) => {
        const d = inicioDoDia(c.em);
        if (d !== dia) {
          dia = d;
          const r = resumo.get(d);
          const extras = [r.fora && `<span class="fora">${r.fora} fora do prazo</span>`, r.sem && `<span class="sem">${r.sem} sem resposta</span>`].filter(Boolean);
          out.push(`<li class="hc-dia" data-dia="${d}"><b>${esc(rotuloDia(c.em, agora))}</b><small>${r.n} ${r.n === 1 ? 'cobrança' : 'cobranças'}${extras.length ? ` · ${extras.join(' · ')}` : ''}</small></li>`);
        }
        out.push(linha(c));
      });
      return out.join('');
    }

    // Quadro por secretaria (só a visão da cidade): quem responde pior em cima (vencidas, depois menor % no prazo).
    function quadroPastas() {
      const e = ultimo;
      const caixa = el.querySelector('.hc-pastas');
      caixa.hidden = !!e.areaFixa;
      if (e.areaFixa) return;
      const porPasta = {};
      filtradas({ semArea: true }).forEach((c) => { (porPasta[c.area] = porPasta[c.area] || []).push(c); });
      const linhas = Object.entries(porPasta)
        .map(([id, itens]) => ({ id, n: GC.estatisticasCobrancas(itens, e.cobrancas, e.agora) }))
        .sort((a, b) => b.n.vencidasAgora - a.n.vencidasAgora || (a.n.pctNoPrazo ?? 101) - (b.n.pctNoPrazo ?? 101) || b.n.total - a.n.total);
      const escolhida = f.area ? ` · <b>${esc(area(f.area).secretaria.nome)}</b>` : '';
      const cab = `<h3 id="hc-pastas-tit"><button type="button" class="hc-pastas-tit" aria-expanded="${pastasAbertas}" aria-controls="hc-pastas-corpo"><i class="ti ti-chevron-down hc-seta" aria-hidden="true"></i> Por secretaria</button> <small>${pastasAbertas ? 'quem responde pior aparece primeiro · clique para ver só as da pasta' : `${linhas.length} ${linhas.length === 1 ? 'pasta' : 'pastas'}${escolhida}`}</small></h3>`;
      caixa.classList.toggle('recolhido', !pastasAbertas);
      if (!pastasAbertas) { caixa.innerHTML = cab; return; }
      if (!linhas.length) { caixa.innerHTML = `${cab}<p class="hc-pastas-vazio">Nenhuma cobrança com estes filtros.</p>`; return; }
      caixa.innerHTML = `${cab}<div id="hc-pastas-corpo">
        <div class="hc-pastas-cab" aria-hidden="true"><span>Secretaria</span><span>Respondidas no prazo <em class="hc-meta-leg"><i></i> meta ${meta()}%</em></span><span>1ª resposta</span><span>De novo</span><span>Vencidas</span></div>
        <ul class="hc-pastas-lista">${linhas.map(({ id, n }) => {
          const sec = area(id).secretaria;
          const pct = n.pctNoPrazo;
          return `<li><button type="button" class="hc-pasta" data-pasta="${esc(id)}" aria-pressed="${f.area === id}">
            <span class="hc-pasta-nome">${sec.emoji} ${esc(sec.nome)}<small>${num(n.total)} ${n.total === 1 ? 'cobrança' : 'cobranças'}</small></span>
            <span class="hc-pasta-pct">${barra(pct)}<b class="${nivelPct(pct)}">${pct === null ? '—' : `${pct}%`}</b><span class="hc-rot"> no prazo</span></span>
            <span class="hc-pasta-tempo"><span class="hc-rot">1ª resposta </span>${minTexto(n.mediaPrimeiraRespostaMin)}</span>
            <span class="hc-pasta-n${n.recobradas ? ' alerta' : ' zero'}">${num(n.recobradas)}<span class="hc-rot"> de novo</span></span>
            <span class="hc-pasta-n${n.vencidasAgora ? ' critica' : ' zero'}">${num(n.vencidasAgora)}<span class="hc-rot"> vencidas</span></span>
          </button></li>`;
        }).join('')}</ul></div>`;
    }

    // Chips de situação com a contagem do recorte (sem o próprio filtro de situação), mais os filtros que se tiram.
    function chips() {
      const e = ultimo;
      const base = filtradas({ semEstado: true });
      const conta = { todas: base.length, abertas: 0, vencidas: 0, esperam: 0, encerradas: 0 };
      base.forEach((c) => {
        const s = GC.situacaoHistoricoCobranca(c, e.cobrancas, e.agora);
        conta[s] += 1;
        if (s !== 'encerradas' && s !== 'abertas') conta.abertas += 1;
      });
      const tom = { vencidas: 'critica', esperam: 'alerta' };
      const situacoes = ESTADOS.map(([v, r]) => `<button type="button" class="hc-chip${conta[v] && tom[v] ? ` ${tom[v]}` : ''}" data-estado="${v}" aria-pressed="${f.estado === v}">${r} <span class="hc-chip-n">${num(conta[v])}</span></button>`).join('');
      const tirar = (attr, rot, rotulo) => `<button type="button" class="hc-chip hc-chip-tirar" ${attr} aria-label="Tirar o filtro: ${esc(rotulo)}">${rot} <i class="ti ti-x" aria-hidden="true"></i></button>`;
      const sec = !e.areaFixa && f.area ? area(f.area).secretaria : null;
      form.querySelector('.hc-chips').innerHTML = situacoes
        + (sec ? tirar('data-tirar-pasta', `${sec.emoji} ${esc(sec.nome)}`, sec.nome) : '')
        + (f.recobradas ? tirar('data-tirar-recobradas', 'Cobradas de novo', 'cobradas de novo') : '');
    }

    function sincronizarCampos() {
      form.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === f.periodo)));
      chips();
      form.querySelector('.au-limpar').hidden = !filtroLigado();
    }

    // Variação em relação ao período de antes: "▲ 6 pts" (bom ou ruim conforme o número).
    function variacao(atual, antes, { menorMelhor = false, texto }) {
      if (atual === null || antes === null || antes === undefined) return '';
      const d = atual - antes;
      if (!d) return '<span class="au-delta"><i class="ti ti-equal" aria-hidden="true"></i> igual</span>';
      const bom = menorMelhor ? d < 0 : d > 0;
      return `<span class="au-delta ${bom ? 'bom' : 'ruim'}"><i class="ti ${d > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}" aria-hidden="true"></i> ${texto(Math.abs(d))}<span class="sr-only">${d > 0 ? ' a mais' : ' a menos'} que no período anterior</span></span>`;
    }

    function numeros(n) {
      const ant = filtradas({ anterior: true });
      const a = ant && ant.length ? GC.estatisticasCobrancas(ant, ultimo.cobrancas, ultimo.agora) : null;
      const antes = a ? `nos ${f.periodo} dias antes` : '';
      const pct = n.pctNoPrazo;
      const falta = pct === null ? '' : pct >= meta() ? 'na meta' : `${meta() - pct} pts abaixo da meta`;
      const destaque = `<div class="rel-numero hc-num-destaque">
          <small>Respondidas no prazo</small>
          <div class="hc-num-valor"><b class="${nivelPct(pct)}">${pct === null ? '—' : `${pct}%`}</b>${a ? variacao(pct, a.pctNoPrazo, { texto: (v) => `${v} pts` }) : ''}</div>
          ${barra(pct)}
          <span class="hc-num-ref">meta ${meta()}%${falta ? ` · ${falta}` : ''}${a && a.pctNoPrazo !== null ? ` · ${a.pctNoPrazo}% ${antes}` : ''}</span>
        </div>`;
      const tempo = `<div class="rel-numero">
          <small>1ª resposta (média)</small>
          <div class="hc-num-valor"><b>${minTexto(n.mediaPrimeiraRespostaMin)}</b>${a ? variacao(n.mediaPrimeiraRespostaMin, a.mediaPrimeiraRespostaMin, { menorMelhor: true, texto: (v) => GC.tempoTexto(Math.max(1, v)) }) : ''}</div>
          <span class="hc-num-ref">${n.respondidas} de ${n.total} respondidas</span>
        </div>`;
      const atalho = (kpi, rot, v, ligado, cls = '') => `<button type="button" class="rel-numero au-kpi ${cls}" data-kpi="${kpi}" aria-pressed="${ligado}">
        <small>${rot}</small><b>${num(v)}</b><span class="au-kpi-acao">${ligado ? '<i class="ti ti-x" aria-hidden="true"></i> Tirar o filtro' : '<i class="ti ti-filter" aria-hidden="true"></i> Ver só essas'}</span></button>`;
      const recobradas = atalho('recobradas', 'Cobradas de novo', n.recobradas, f.recobradas);
      const vencidas = atalho('vencidas', 'Vencidas agora', n.vencidasAgora, f.estado === 'vencidas', n.vencidasAgora ? 'hc-num-critico' : 'hc-num-zero');
      // Com alguma vencida, ela abre a fila; sem, vai para o fim.
      el.querySelector('.hc-kpis').innerHTML = n.vencidasAgora
        ? vencidas + destaque + tempo + recobradas
        : destaque + tempo + recobradas + vencidas;
      el.querySelector('.hc-kpis').classList.toggle('com-vencidas', !!n.vencidasAgora);
    }

    // Gráfico: uma barra por dia do período, empilhada em no prazo, fora do prazo e sem resposta.
    function grafico(itens) {
      const e = ultimo;
      const hoje = inicioDoDia(e.agora);
      const maisAntigo = itens.length ? inicioDoDia(itens[itens.length - 1].em) : hoje;
      const dias = f.periodo === 'tudo'
        ? Math.min(120, Math.round((hoje - maisAntigo) / DIA) + 1)
        : Number(f.periodo);
      const baldes = [];
      for (let i = dias - 1; i >= 0; i -= 1) {
        const d = new Date(hoje); d.setDate(d.getDate() - i); // pelo calendário (horário de verão não desloca o dia)
        baldes.push({ t: d.getTime(), ok: 0, fora: 0, sem: 0 });
      }
      const porDia = new Map(baldes.map((b) => [b.t, b]));
      itens.forEach((c) => {
        const b = porDia.get(inicioDoDia(c.em));
        if (!b) return;
        const r = respostaDe(c);
        b[r.minutos === null ? 'sem' : r.noPrazo ? 'ok' : 'fora'] += 1;
      });
      const total = (b) => b.ok + b.fora + b.sem;
      const maior = Math.max(1, ...baldes.map(total));
      const curto = (t) => new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
      const plural = (v, um, varios) => `${v} ${v === 1 ? um : varios}`;
      const barras = baldes.map((b) => {
        const n = total(b);
        const nome = b.t === hoje ? 'Hoje' : rotuloDia(b.t, e.agora);
        const partes = [b.ok && `${b.ok} no prazo`, b.fora && `${b.fora} fora do prazo`, b.sem && `${b.sem} sem resposta`].filter(Boolean).join(', ');
        const rot = n ? `${nome}: ${plural(n, 'cobrança', 'cobranças')} (${partes})` : `${nome}: nenhuma cobrança`;
        const pilha = `<span class="hc-pilha" style="height:${n ? Math.max(8, Math.round((n / maior) * 100)) : 0}%">${['sem', 'fora', 'ok'].map((k) => (b[k] ? `<i class="${k}" style="flex-grow:${b[k]}"></i>` : '')).join('')}</span>`;
        return n
          ? `<button type="button" class="hc-dia-barra${b.t === hoje ? ' hoje' : ''}" data-hc-dia="${b.t}" aria-label="${esc(rot)}. Ir até o dia na lista" title="${esc(rot)}">${pilha}</button>`
          : `<span class="hc-dia-barra vazio${b.t === hoje ? ' hoje' : ''}" title="${esc(rot)}" aria-hidden="true">${pilha}</span>`;
      }).join('');
      const meio = baldes[Math.floor(baldes.length / 2)];
      el.querySelector('.hc-grafico').innerHTML = `
        <div class="hc-graf-cab">
          <h3 id="hc-graf-tit">${plural(itens.length, 'cobrança', 'cobranças')} <small>${f.periodo === 'tudo' ? 'em todo o período' : `nos últimos ${f.periodo} dias`} · clique num dia para ir até ele</small></h3>
          <ul class="hc-legenda" aria-label="Legenda"><li><i class="ok"></i> No prazo</li><li><i class="fora"></i> Fora do prazo</li><li><i class="sem"></i> Sem resposta</li></ul>
        </div>
        <div class="hc-barras${baldes.length > 45 ? ' denso' : ''}" role="group" aria-label="Cobranças por dia">${barras}</div>
        <div class="hc-eixo" aria-hidden="true"><span>${curto(baldes[0].t)}</span>${baldes.length > 6 ? `<span>${curto(meio.t)}</span>` : ''}<span>Hoje</span></div>`;
    }

    function desenhar() {
      const e = ultimo;
      if (!e) return;
      sincronizarCampos();
      el.querySelector('.hc-sub').textContent = e.areaFixa
        ? `Cobranças do prefeito para a ${area(e.areaFixa).secretaria.nome}: quando chegaram, quanto a pasta levou para responder e como terminaram.`
        : 'Todas as cobranças às secretarias: quando foram feitas, quanto cada pasta levou para responder e como terminaram.';
      const itens = filtradas();
      const n = GC.estatisticasCobrancas(itens, e.cobrancas, e.agora);
      numeros(n);
      grafico(itens);
      quadroPastas();
      const rolagem = el.scrollTop;
      const parte = itens.slice(0, mostrar);
      lista.innerHTML = !itens.length
        ? `<div class="au-vazio"><p><i class="ti ti-filter-off" aria-hidden="true"></i> Nenhuma cobrança com estes filtros.</p>${filtroLigado() ? '<button type="button" class="btn-sec" data-hc-limpar>Limpar filtros</button>' : ''}</div>`
        : `${itens.some((c) => c.simulada) ? '<p class="op-nota hc-nota"><i class="ti ti-info-circle" aria-hidden="true"></i> As cobranças dos 30 dias antes da demonstração são simuladas; as de hoje são as feitas neste painel.</p>' : ''}
          <div class="hc-cab" aria-hidden="true"><span>Hora</span><span>Ocorrência</span><span>1ª resposta</span><span>Situação</span></div>
          <ul class="hc-itens">${itensPorDia(parte, itens, e.agora)}</ul>
          <p class="au-rodape">Mostrando ${num(parte.length)} de ${num(itens.length)}${itens.length > parte.length ? ` <button type="button" class="btn-sec" data-hc-mais>Mostrar mais ${Math.min(POR_PAGINA, itens.length - parte.length)}</button>` : ''}</p>`;
      el.scrollTop = rolagem;
    }

    // estado: { lista, cobrancas, agora, areaFixa (setor) ou null, existe(ocorrenciaId) }; rota: os filtros do endereço.
    function mostrarTela(estado, rota) {
      ultimo = estado;
      if (rota) lerRota(rota);
      desenhar();
    }
    function atualizar(estado) { ultimo = estado; desenhar(); }
    return { mostrar: mostrarTela, atualizar };
  };
})(window.GC = window.GC || {});
