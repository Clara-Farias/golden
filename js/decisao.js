(function (GC) {
  // Gaveta "Alertas" (pela direita, como Filtros e Maia): substitui a faixa que cobria o mapa.
  // Duas abas: "Precisam de você" (só as exceções: prazo estourado, mais de uma secretaria, caso
  // repetido) e "Todos ativos" (tudo o que está no mapa com os filtros atuais). Cada item abre o
  // detalhe na mesma gaveta, com "← Alertas" para voltar à lista.
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' }; // gravidade da ocorrência: o mesmo rótulo em todo o painel
  const ORDEM = { critica: 0, alta: 1, media: 2 };
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  // O que o prefeito já fez e quando: o cartão continua na lista (a ocorrência segue aberta), mas desce.
  const FEITO = { cobrar: '📣 Você cobrou', priorizar: '⚡ Você priorizou', gabinete: '🚨 Você convocou o gabinete' };
  const feito = (o) => {
    if (!o.acaoPrefeito) {
      const c = GC.cobrancas && GC.cobrancas.aberta(o.id);
      if (c) return GC.resumoCobranca(c);
      return GC.acoesPrefeito ? GC.acoesPrefeito.situacao(o.id) : ''; // delegada, explicação pedida ou adiada
    }
    return `${FEITO[o.acaoPrefeito]}${o.acaoEm ? ` há ${GC.tempoTexto(Math.max(1, (GC.agora() - o.acaoEm) / 60000))}` : ''}`;
  };

  // Grupos de "Precisam de você", pelo motivo mais urgente de cada ocorrência (motivos em GC.motivosAtencao).
  const GRUPOS = [['prazo', 'Prazo estourado'], ['escalada', 'Escalados pela regra'], ['decidir_prazo', 'Pedem decisão sobre o prazo'],
    ['vai_estourar', 'Vão estourar'], ['conjunta', 'Mais de uma secretaria'], ['recorrente', 'Bairro com casos repetidos'], ['outros', 'Outros']];
  const GRUPO_DO_MOTIVO = { prazo: 'prazo', escalada: 'escalada', prorrogacao: 'decidir_prazo', pausa_longa: 'decidir_prazo', vai_estourar: 'vai_estourar', conjunta: 'conjunta', recorrente: 'recorrente' };
  const ORDEM_GRUPO = Object.fromEntries(GRUPOS.map(([id], i) => [id, i]));
  const grupoDe = (o) => GC.motivosAtencao(o).map((m) => GRUPO_DO_MOTIVO[m.tipo] || 'outros')
    .sort((a, b) => ORDEM_GRUPO[a] - ORDEM_GRUPO[b])[0] || 'outros';

  // Ativos em ordem de urgência: gravidade e, dentro dela, o prazo que vence primeiro.
  GC.ordenarAtivos = (lista) => lista.slice().sort((a, b) => (ORDEM[a.severidade] - ORDEM[b.severidade])
    || (GC.prazoRestanteMin(a) - GC.prazoRestanteMin(b)));

  // Ordens da gaveta. "padrao" é a de cada aba (por motivo em "Precisam de você", urgência em "Ativos");
  // as outras deixam a lista corrida, sem os grupos. Prazo, bairro e secretaria usam as chaves da Central.
  GC.ORDENS_ALERTAS = [
    ['padrao', 'Por motivo', 'Mais urgente'], ['prazo', 'Prazo'], ['recentes', 'Mais novos'], ['antigos', 'Mais antigos'],
    ['bairro', 'Bairro'], ['secretaria', 'Secretaria'],
  ];
  GC.ordenarAlertas = function (lista, ordem) {
    if (ordem === 'recentes' || ordem === 'antigos') {
      const s = ordem === 'recentes' ? -1 : 1;
      const base = GC.ordenarAtivos(lista);
      const pos = new Map(base.map((o, i) => [o.id, i]));
      return base.sort((a, b) => ((a.criadaEm || 0) - (b.criadaEm || 0)) * s || pos.get(a.id) - pos.get(b.id));
    }
    if (GC.ordenarCentral && ['prazo', 'bairro', 'secretaria'].includes(ordem)) return GC.ordenarCentral(lista, ordem, 'asc');
    return GC.ordenarAtivos(lista);
  };
  // Busca da gaveta: a mesma da Central (título, tipo, bairro, secretarias, número, regra; sem acento).
  const naBusca = (o, texto) => (GC.buscaCentral ? GC.buscaCentral(o, texto)
    : String(o.titulo || '').toLowerCase().includes(String(texto || '').trim().toLowerCase()));

  GC.criarDecisao = function (el, opcoes) {
    const { aoAgir, aoDetalhar, aoRealcar, aoFechar, aoAbrirCentral, aoCobranca, aoAjuda, aoAcaoPrefeito, aoHistorico } = opcoes;
    let aba = 'atencao'; // atencao | ativos | cobrancas
    let abaEscolhida = false; // o secretário com cobrança para responder abre direto em Cobranças, até escolher outra
    let ultimo = { todas: [], ativos: [] };
    let extraUlt = { cidade: 0, temFiltro: false, modoCrise: null }; // modoCrise: GC.modoCrise de agora (js/modo-crise.js)
    let esperarAberto = false; // o grupo "Pode esperar a crise" continua como a pessoa deixou entre um desenho e outro
    let aberto = null; // o alerta aberto no detalhe: o cartão fica marcado para a pessoa não perder o lugar ao voltar

    // Cabeçalho curto (a lista é o que importa): título, abas que cabem na largura e uma linha de contexto.
    // A explicação longa fica atrás do "i"; a Maia e a Central, no rodapé.
    el.raiz.innerHTML = `
      <header class="gaveta-cab">
        <div><h2>🔔 Alertas</h2></div>
        <div class="gaveta-cab-acoes">${GC.expandir ? GC.expandir.html('alertas', 'gaveta-x') : ''}<button type="button" class="gaveta-x" aria-label="Fechar Alertas">✕</button></div>
      </header>
      <div class="alertas-abas" role="tablist" aria-label="Quais alertas">
        <button type="button" role="tab" data-aba="atencao" title="O que fugiu do normal e pede você">Precisam de você <b></b></button>
        <button type="button" role="tab" data-aba="ativos" title="Tudo o que está no mapa agora">Ativos <b></b></button>
        ${GC.cobrancas && GC.htmlCobrancas ? '<button type="button" role="tab" data-aba="cobrancas" title="Cobranças, pedidos de explicação, delegações e pedidos de ajuda">Cobranças <b></b></button>' : ''}
      </div>
      <div class="alertas-contexto">
        <label class="alertas-busca"><i class="ti ti-search" aria-hidden="true"></i>
          <input type="search" placeholder="Buscar" aria-label="Buscar nos alertas" autocomplete="off" spellcheck="false">
          <button type="button" class="alertas-limpar" aria-label="Limpar a busca" title="Limpar a busca" hidden>✕</button>
        </label>
        <label class="alertas-ordem" title="Ordenar a lista"><i class="ti ti-arrows-sort" aria-hidden="true"></i>
          <select aria-label="Ordenar a lista"></select>
        </label>
        <span class="alertas-resumo"></span>
        <button type="button" class="alertas-info" aria-expanded="false" aria-controls="alertas-explica" aria-label="O que entra nesta lista?" title="O que entra nesta lista?"><i class="ti ti-info-circle" aria-hidden="true"></i></button>
      </div>
      <p class="alertas-explica" id="alertas-explica" hidden><b class="alertas-explica-resumo"></b> <span class="alertas-explica-texto"></span></p>
      <div class="gaveta-corpo alertas-lista" role="tabpanel"></div>
      <footer class="gaveta-pe">
        <button type="button" class="btn-maia-tela btn-maia-alertas" data-maia="Por onde começar?" data-maia-foco="decisoes">🛞 Por onde começar?</button>
        <button type="button" class="btn-sec alertas-central">Central completa →</button>
      </footer>`;
    const lista = el.raiz.querySelector('.alertas-lista');
    const abas = [...el.raiz.querySelectorAll('[data-aba]')];
    el.raiz.querySelector('.gaveta-x:not([data-expandir])').onclick = () => aoFechar && aoFechar();
    el.raiz.querySelector('.alertas-central').onclick = () => aoAbrirCentral && aoAbrirCentral();
    const info = el.raiz.querySelector('.alertas-info');
    const explica = el.raiz.querySelector('.alertas-explica');
    info.onclick = () => { explica.hidden = !explica.hidden; info.setAttribute('aria-expanded', String(!explica.hidden)); };
    abas.forEach((b) => { b.onclick = () => { aba = b.dataset.aba; abaEscolhida = true; lista.scrollTop = 0; desenhar(); }; });
    // Busca e ordem: na mesma linha do "i", para a lista não perder altura. A ordem é guardada por aba.
    let busca = '';
    const ordemDaAba = { atencao: 'padrao', ativos: 'padrao' };
    const campoBusca = el.raiz.querySelector('.alertas-busca input');
    const limparBusca = el.raiz.querySelector('.alertas-limpar');
    const selOrdem = el.raiz.querySelector('.alertas-ordem select');
    const ferramentas = [el.raiz.querySelector('.alertas-busca'), el.raiz.querySelector('.alertas-ordem')];
    campoBusca.addEventListener('input', () => { busca = campoBusca.value; lista.scrollTop = 0; desenhar(); });
    campoBusca.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && campoBusca.value) { e.stopPropagation(); campoBusca.value = ''; busca = ''; desenhar(); }
    });
    limparBusca.onclick = () => { campoBusca.value = ''; busca = ''; desenhar(); campoBusca.focus(); };
    selOrdem.onchange = () => { ordemDaAba[aba] = selOrdem.value; lista.scrollTop = 0; desenhar(); };
    lista.addEventListener('click', (e) => {
      if (e.target.closest('[data-limpar-busca]')) limparBusca.onclick();
    });
    const btnMaia = el.raiz.querySelector('.btn-maia-alertas');
    lista.addEventListener('click', (e) => { if (aoHistorico && e.target.closest('[data-cb-historico]')) aoHistorico(); });
    // Aba Cobranças: botões e formulários da lista (o item abre o detalhe da ocorrência, com "← Alertas").
    if (GC.ligarCobranca && aoCobranca) {
      GC.ligarCobranca(lista, { executar: aoCobranca, abrir: (oid) => aoDetalhar(oid), aoConcluir: () => desenhar() });
    }
    // Pedidos de ajuda entre secretarias (js/ajudas.js) moram na mesma aba, numa seção própria.
    if (GC.ligarAjuda && aoAjuda) GC.ligarAjuda(lista, { executar: aoAjuda, abrir: (oid) => aoDetalhar(oid), aoConcluir: () => desenhar() });
    // Delegações, explicações e adiamentos do prefeito (js/acoes-prefeito.js): também na mesma aba.
    if (GC.ligarAcoesPrefeito && aoAcaoPrefeito) GC.ligarAcoesPrefeito(lista, { executar: aoAcaoPrefeito, abrir: (oid) => aoDetalhar(oid), aoConcluir: () => desenhar() });
    const pendentesCobranca = () => (GC.cobrancas ? GC.cobrancas.grupos(GC.perfil || { id: 'prefeito' }).pendentes : 0)
      + (GC.ajudas ? GC.ajudas.grupos(GC.perfil || { id: 'prefeito' }).pendentes : 0)
      + (GC.pendentesAcoesPrefeito ? GC.pendentesAcoesPrefeito(GC.perfil || { id: 'prefeito' }) : 0);

    // Abre o detalhe e marca o cartão (também pelas setas "anterior / próximo" do detalhe).
    function abrirItem(id) {
      aberto = id;
      lista.querySelectorAll('.alerta-item').forEach((n) => n.classList.toggle('aberto', n.dataset.id === id));
      aoDetalhar(id);
    }
    // Ao voltar do detalhe: o cartão aberto à vista na lista.
    function mostrarAberto() {
      const n = aberto && [...lista.querySelectorAll('.alerta-item')].find((x) => x.dataset.id === aberto);
      if (!n) return;
      const d = n.closest('details');
      if (d && !d.open) return;
      n.scrollIntoView({ block: 'nearest' });
    }
    // Os alertas na ordem em que a lista mostra agora (para o "anterior / próximo" do detalhe).
    const ordem = () => [...lista.querySelectorAll('.alerta-item')].map((n) => n.dataset.id);

    function ligar(node, o) {
      node.onclick = () => abrirItem(o.id);
      node.onkeydown = (e) => { if (e.key === 'Enter' && e.target === node) abrirItem(o.id); };
      node.onmouseenter = () => aoRealcar(o.id);
      node.onmouseleave = () => aoRealcar(null);
      node.querySelectorAll('[data-acao]').forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); aoAgir(o.id, b.dataset.acao); };
      });
    }

    const envolvidas = (o) => o.areasEnvolvidas.map((a) => `${area(a).secretaria.emoji} ${esc(area(a).nome)}`).join(' + ');

    // Etiqueta do motivo principal, curta para caber ao lado do título (o texto completo fica no title).
    function chipMotivo(m, o) {
      if (m.tipo === 'prazo') return `⏰ ${GC.tempoTexto(-GC.prazoRestanteMin(o))} de atraso`;
      if (m.tipo === 'recorrente') { const n = /(\d+º)/.exec(m.texto); return n ? `🔁 ${n[1]} chamado` : m.curto; }
      return m.curto || m.texto;
    }

    // Etiqueta no canto do cartão: o atraso (+2 h) ou o que falta quando vai estourar. É o que se lê ao correr a lista.
    function etiquetaPrazo(o) {
      if (o.status !== 'encaminhada') return '';
      const r = GC.prazoRestanteMin(o);
      if (r < 0) return `<span class="alerta-atraso" title="Prazo para pôr equipe em campo estourado há ${esc(GC.tempoTexto(-r))}">+${esc(GC.tempoTexto(-r))}</span>`;
      const quase = (GC.limitesAtencao ? GC.limitesAtencao().quasePct : 75) / 100;
      if (GC.tempoDePrazoMin(o) / o.prazoMin >= quase) return `<span class="alerta-atraso quase" title="Faltam ${esc(GC.tempoTexto(r))} para o prazo">${esc(GC.tempoTexto(r))}</span>`;
      return '';
    }

    // Barra do prazo para pôr equipe em campo: quanto já foi consumido. Em campo, a barra some e fica o texto.
    function prazoBarra(o) {
      if (o.status !== 'encaminhada') return `<div class="alerta-prazo"><span>${esc(GC.situacao(o))}</span></div>`;
      const usado = GC.tempoDePrazoMin(o) / o.prazoMin;
      const r = GC.prazoRestanteMin(o);
      // "Quase": a fração do prazo dos limites de atenção (js/regras-alerta.js; padrão 75%).
      const quase = (GC.limitesAtencao ? GC.limitesAtencao().quasePct : 75) / 100;
      const tom = usado >= 1 ? 'estourado' : usado >= quase ? 'quase' : '';
      // O atraso já está na etiqueta do canto: aqui fica o que falta acontecer e o tamanho do prazo.
      const texto = r < 0 ? `prazo de ${GC.tempoTexto(o.prazoMin)}` : `faltam ${GC.tempoTexto(r)} de ${GC.tempoTexto(o.prazoMin)}`;
      const comCobranca = (GC.cobrancas && GC.cobrancas.aberta(o.id)) || (GC.acoesPrefeito && GC.acoesPrefeito.situacao(o.id)) || GC.pausaAtual(o);
      const legenda = o.acaoPrefeito || comCobranca ? GC.situacao(o) : texto;
      const rotulo = r < 0 ? `estourado há ${GC.tempoTexto(-r)}, sem equipe em campo · ${texto}` : texto;
      return `<div class="alerta-prazo ${tom}"><i class="barra" role="img" aria-label="Prazo: ${esc(rotulo)}"><b style="width:${Math.round(Math.min(1, usado) * 100)}%"></b></i><span title="${esc(legenda)}">${esc(legenda)}</span></div>`;
    }

    // Cartão em 3 linhas: título com o atraso no canto, onde e quem (com o motivo), e prazo com a ação.
    // A gravidade fica só na barra lateral (o nome dela vai no aria-label); o vermelho fica na etiqueta do atraso.
    function item(o) {
      const div = document.createElement('article');
      const tratada = aba === 'atencao' && GC.tratada(o);
      const daCrise = GC.daCrise ? GC.daCrise(o, extraUlt.modoCrise) : false; // selo "Crise" (js/modo-crise.js)
      div.className = `alerta-item ${o.severidade}${GC.estourada(o) && !GC.tratada(o) ? ' estourada' : ''}${tratada ? ' tratada' : ''}${daCrise ? ' da-crise' : ''}${o.id === aberto ? ' aberto' : ''}`;
      div.dataset.abreGaveta = '';
      div.dataset.id = o.id;
      div.tabIndex = 0;
      div.setAttribute('aria-label', `${SEV[o.severidade]}: ${o.titulo}, ${bairro(o.bairroId).nome}${tratada ? `. ${feito(o)}` : ''}`);
      // Prazo estourado e "vai estourar" já estão na barra do prazo: a etiqueta mostra o motivo seguinte
      // (várias secretarias, recorrente, escalada...), para o vermelho não se repetir quatro vezes no cartão.
      const todos = GC.motivosAtencao(o);
      const naBarra = (m) => (m.tipo === 'prazo' || m.tipo === 'vai_estourar') && o.status === 'encaminhada';
      const [principal, ...outros] = todos.filter((m) => !naBarra(m));
      const chip = tratada ? `<span class="alerta-chip m-feito">${esc(feito(o))}</span>`
        : principal ? `<span class="alerta-chip m-${principal.tipo}" title="${esc(principal.texto)}">${esc(chipMotivo(principal, o))}</span>` : '';
      const extras = (tratada ? [principal, ...outros].filter(Boolean) : outros)
        .map((m) => `<span class="motivo-mini m-${m.tipo}" title="${esc(m.texto)}">${esc(m.curto || m.texto)}</span>`).join('');
      // O cartão inteiro abre o detalhe (sem seta nem segundo botão). Já tratada: sem botão, a situação basta.
      div.innerHTML = `
        <div class="alerta-topo"><h3>${daCrise ? '<span class="selo-crise" title="Ligada ao gabinete de crise aberto">Crise</span> ' : ''}${esc(o.titulo)}</h3>${tratada ? '' : etiquetaPrazo(o)}</div>
        <div class="alerta-tag"><span class="alerta-onde">${esc(bairro(o.bairroId).nome)} · ${envolvidas(o)}</span>${chip}${extras}</div>
        <div class="alerta-pe">${prazoBarra(o)}${tratada ? '' : GC.botoesAcao(o, { principal: true })}</div>`;
      ligar(div, o);
      return div;
    }

    function desenhar() {
      const { todas, ativos } = ultimo;
      const total = aba === 'atencao' ? todas : ativos;
      const buscando = !!busca.trim();
      const ordemAgora = ordemDaAba[aba] || 'padrao';
      const filtrados = buscando ? total.filter((o) => naBusca(o, busca)) : total;
      const itens = ordemAgora === 'padrao' ? filtrados : GC.ordenarAlertas(filtrados, ordemAgora);
      ferramentas.forEach((f) => { f.hidden = aba === 'cobrancas'; });
      if (aba !== 'cobrancas') {
        selOrdem.innerHTML = GC.ORDENS_ALERTAS.map(([id, nome, nomeAtivos]) => `<option value="${id}"${id === ordemAgora ? ' selected' : ''}>${esc(aba === 'ativos' && nomeAtivos ? nomeAtivos : nome)}</option>`).join('');
        selOrdem.parentElement.classList.toggle('mudada', ordemAgora !== 'padrao');
        campoBusca.placeholder = `Buscar em ${total.length}${extraUlt.temFiltro ? ' (com filtros)' : ''}`;
        limparBusca.hidden = !buscando;
      }
      const nCobrancas = pendentesCobranca();
      abas.forEach((b) => {
        const ativa = b.dataset.aba === aba;
        b.classList.toggle('ativo', ativa);
        b.setAttribute('aria-selected', String(ativa));
        const n = b.dataset.aba === 'atencao' ? todas.length : b.dataset.aba === 'cobrancas' ? nCobrancas : ativos.length;
        b.querySelector('b').textContent = n;
        b.querySelector('b').classList.toggle('zero', !n); // zero apagado, mas à vista: a aba não parece desligada
      });
      btnMaia.hidden = aba === 'cobrancas';
      const resumo = el.raiz.querySelector('.alertas-resumo');
      const onde = extraUlt.temFiltro ? `com os filtros · ${extraUlt.cidade} na cidade` : 'cidade inteira';
      const explicaTexto = el.raiz.querySelector('.alertas-explica-texto');
      const explicaResumo = el.raiz.querySelector('.alertas-explica-resumo');
      resumo.hidden = aba !== 'cobrancas'; // nas outras abas o resumo vai para o "i": a linha é da busca e da ordem
      if (aba === 'cobrancas') {
        const setor = !!GC.perfil && GC.visaoDe(GC.perfil) === 'pasta';
        explicaResumo.textContent = '';
        explicaTexto.textContent = setor
          ? 'Cobranças e pedidos de explicação do prefeito para a sua pasta. Responda aqui mesmo.'
          : 'O que você cobrou, delegou, perguntou ou adiou, e em que pé está cada um. Os pedidos de ajuda entre secretarias também ficam aqui.';
        resumo.textContent = setor ? 'Para a sua pasta responder' : 'O que você pediu e em que pé está';
        // Não redesenha com um formulário aberto (o relógio do painel redesenha a cada 20 s).
        if (lista.querySelector('.cb-form:not([hidden])')) return;
        const rolagem = lista.scrollTop;
        const p = GC.perfil || { id: 'prefeito' };
        // Depois das cobranças: explicações, delegações e adiamentos (js/acoes-prefeito-ui.js), e então os pedidos de ajuda.
        const doPrefeito = GC.htmlAcoesPrefeitoLista ? GC.htmlAcoesPrefeitoLista(p) : '';
        const pedidos = doPrefeito + (GC.htmlAjudasLista ? GC.htmlAjudasLista(p) : '');
        const temCobranca = GC.cobrancas.grupos(p).grupos.some((g) => g.itens.length);
        lista.innerHTML = (temCobranca || !pedidos ? GC.htmlCobrancas(p) : '') + pedidos
          + (aoHistorico ? '<p class="cb-ver-historico"><button type="button" class="btn-sec" data-cb-historico>📣 Histórico completo de cobranças →</button></p>' : '');
        lista.scrollTop = rolagem;
        return;
      }
      explicaTexto.textContent = aba === 'atencao'
        ? 'Tudo já foi encaminhado às secretarias. Aqui fica só o que fugiu do normal: prazo estourado ou perto de estourar, alerta escalado pela regra, mais de uma secretaria ou bairro com muitos chamados da mesma secretaria.'
        : 'Tudo o que está no mapa agora, do mais urgente para o menos urgente: gravidade e, dentro dela, o prazo que vence primeiro.';
      explicaResumo.textContent = `${aba === 'atencao' ? `${todas.length} de ${ativos.length} ativos` : `${ativos.length} ativos`} · ${onde}.`;
      const rolagem = lista.scrollTop;
      lista.innerHTML = '';
      if (buscando) {
        lista.insertAdjacentHTML('beforeend', itens.length
          ? `<p class="alertas-achados">${itens.length} de ${total.length} com “${esc(busca.trim())}” <button type="button" class="alertas-link" data-limpar-busca>Limpar</button></p>`
          : `<p class="decisao-vazio">Nenhum alerta com “${esc(busca.trim())}” nesta aba. <button type="button" class="alertas-link" data-limpar-busca>Limpar a busca</button></p>`);
        if (!itens.length) return;
      }
      if (!itens.length) {
        lista.innerHTML = aba === 'atencao' ? GC.htmlCalmo('Nada fugiu do normal agora.', 'decisao-vazio') : '<p class="decisao-vazio">Nenhuma ocorrência ativa com estes filtros.</p>';
        return;
      }
      if (aba === 'atencao' && ordemAgora !== 'padrao') {
        // Ordem escolhida: lista corrida, sem os grupos; as que você já tratou continuam no fim.
        const pendentes = itens.filter((o) => !GC.tratada(o));
        const tratadas = itens.filter((o) => GC.tratada(o));
        pendentes.forEach((o) => lista.appendChild(item(o)));
        if (tratadas.length) {
          lista.insertAdjacentHTML('beforeend', `<h3 class="alertas-divisor">✓ Você já agiu · ${tratadas.length} aguardando a secretaria</h3>`);
          tratadas.forEach((o) => lista.appendChild(item(o)));
        }
      } else if (aba === 'atencao') {
        // Por motivo: os grupos na ordem de urgência, a ordem da store dentro de cada um; depois, as que você já tratou.
        // Em crise (js/modo-crise.js): as da crise no topo e as de fora que podem esperar num grupo recolhido no fim.
        // Nenhum prazo muda: é só ordem.
        const pendentes = itens.filter((o) => !GC.tratada(o));
        const tratadas = itens.filter((o) => GC.tratada(o));
        const naCrise = GC.ordenarNaCrise ? GC.ordenarNaCrise(pendentes, extraUlt.modoCrise) : { crise: [], normal: pendentes, esperar: [] };
        if (naCrise.crise.length) {
          lista.insertAdjacentHTML('beforeend', `<h3 class="alertas-grupo g-crise">Da crise agora <b>${naCrise.crise.length}</b></h3>`);
          naCrise.crise.forEach((o) => lista.appendChild(item(o)));
        }
        const porGrupo = new Map(GRUPOS.map(([id]) => [id, []]));
        naCrise.normal.forEach((o) => porGrupo.get(grupoDe(o)).push(o));
        GRUPOS.forEach(([id, nome]) => {
          const doGrupo = porGrupo.get(id);
          if (!doGrupo.length) return;
          lista.insertAdjacentHTML('beforeend', `<h3 class="alertas-grupo g-${id}">${esc(nome)} <b>${doGrupo.length}</b></h3>`);
          doGrupo.forEach((o) => lista.appendChild(item(o)));
        });
        if (naCrise.esperar.length) {
          const det = document.createElement('details');
          det.className = 'alertas-esperar';
          det.open = esperarAberto;
          det.innerHTML = `<summary class="alertas-grupo g-esperar">Pode esperar a crise <b>${naCrise.esperar.length}</b>
            <small>Nem crítica nem com prazo estourado. O prazo de cada uma continua correndo.</small></summary>`;
          det.addEventListener('toggle', () => { esperarAberto = det.open; });
          naCrise.esperar.forEach((o) => det.appendChild(item(o)));
          lista.appendChild(det);
        }
        if (tratadas.length) {
          lista.insertAdjacentHTML('beforeend', `<h3 class="alertas-divisor">✓ Você já agiu · ${tratadas.length} aguardando a secretaria</h3>`);
          tratadas.forEach((o) => lista.appendChild(item(o)));
        }
      } else {
        itens.forEach((o) => lista.appendChild(item(o)));
      }
      lista.scrollTop = rolagem;
    }

    // estado: { todas: exceções, ativos: tudo que está no mapa }; extra: total da cidade e se há filtro.
    function atualizar(estado, extra = { cidade: estado.todas.length, temFiltro: false }) {
      ultimo = { todas: estado.todas, ativos: GC.ordenarAtivos(estado.ativos || estado.todas) };
      extraUlt = extra;
      if (!abaEscolhida && GC.perfil && GC.visaoDe(GC.perfil) === 'pasta' && pendentesCobranca()) aba = 'cobrancas';
      desenhar();
    }

    return { atualizar, mostrarAba: (a) => { aba = a; abaEscolhida = true; desenhar(); }, pendentesCobranca, abrir: abrirItem, ordem, mostrarAberto };
  };
})(window.GC = window.GC || {});
