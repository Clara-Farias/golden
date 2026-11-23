(function (GC) {
  // Gaveta sobre o mapa com tudo que justifica a decisão sobre um alerta:
  // regra, evidências, impacto, responsável, ação recomendada e linha do tempo.
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const STATUS = { encaminhada: '📡 Encaminhada', em_campo: '🚧 Equipe em campo', resolvida: '✅ Resolvida' };
  const NOME_SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  function tempo(min) {
    if (min < 60) return `${min} min`;
    if (min < 2880) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  }

  function relativo(t) {
    const min = Math.round((GC.agora() - t) / 60000);
    return min < 1 ? 'agora' : `há ${tempo(min)}`;
  }

  // Números das evidências em negrito ("19 de 20", "4 h", "90%"): o dado salta do texto. Escapa cada pedaço.
  const NUMERO = /\d+(?:[.,]\d+)?(?:\s?(?:de|\/)\s?\d+(?:[.,]\d+)?)?(?:\s?%|\s?h\b|\s?min\b|\s?dias?\b|\s?km\b)?/g;
  function realcarNumeros(texto) {
    const t = String(texto);
    let saida = '';
    let i = 0;
    t.replace(NUMERO, (m, pos) => { saida += `${esc(t.slice(i, pos))}<b>${esc(m)}</b>`; i = pos + m.length; return m; });
    return saida + esc(t.slice(i));
  }

  // Linha do tempo: com mais de 4 passos, os mais antigos ficam recolhidos.
  const PASSOS_A_VISTA = 4;

  GC.criarGaveta = function (el, opcoes) {
    const { aoAgir, aoPerguntar, aoFechar, aoCobranca, aoOperar, aoAjuda, aoAcaoPrefeito, store } = opcoes;
    // Blocos da cobrança e da operação da pasta: os cliques são delegados uma vez só (o conteúdo é
    // redesenhado a cada atualização).
    if (GC.ligarCobranca && aoCobranca) GC.ligarCobranca(el, { executar: aoCobranca, abrir: () => {} });
    if (GC.ligarOperacao && aoOperar) GC.ligarOperacao(el, { executar: aoOperar });
    if (GC.ligarAjuda && aoAjuda) GC.ligarAjuda(el, { executar: aoAjuda });
    if (GC.ligarAcoesPrefeito && aoAcaoPrefeito) GC.ligarAcoesPrefeito(el, { executar: aoAcaoPrefeito });
    // Tarefas passadas a partir deste alerta (js/tarefas-ui.js; a ação vai a GC.agirNaTarefa, em js/app/telas.js).
    if (GC.ligarTarefas) GC.ligarTarefas(el, {});
    let atual = null;
    let esconder = null;
    let voltar = null; // veio da gaveta Alertas: "← Alertas" volta para a lista
    let vizinhos = null; // () => ids na ordem da lista (setas "anterior / próximo")
    let aoIr = null; // (id) => abre outro alerta da lista

    // Desliza para fora e só então some.
    function fechar() {
      if (!atual) return;
      atual = null;
      el.classList.remove('aberta');
      clearTimeout(esconder);
      esconder = setTimeout(() => { if (!atual) el.hidden = true; }, 300);
      if (aoFechar) aoFechar();
    }

    function desenhar(o) {
      const d = GC.detalharOcorrencia(o);
      const sec = area(o.area).secretaria;
      const estourada = GC.estourada(o);
      const tratada = GC.tratada(o);
      const cobranca = GC.cobrancas ? GC.cobrancas.daOcorrencia(o.id) : null;
      const pendente = GC.estourada(o) && !tratada
        ? '<li class="pendente"><span>agora</span>⏰ Prazo estourado, sem equipe em campo</li>'
        : '';
      const itensTempo = o.linhaTempo.map((p) => `<li class="feito"><span>${relativo(p.t)}</span>${esc(p.texto)}</li>`);
      if (pendente) itensTempo.push(pendente);
      const antigos = itensTempo.length > PASSOS_A_VISTA ? itensTempo.slice(0, itensTempo.length - PASSOS_A_VISTA) : [];
      const recentes = itensTempo.slice(antigos.length);
      const linhaTempo = `${antigos.length ? `<details class="gaveta-tempo-antigos"><summary>${antigos.length} ${antigos.length === 1 ? 'passo anterior' : 'passos anteriores'}</summary><ul class="gaveta-tempo">${antigos.join('')}</ul></details>` : ''}
        <ul class="gaveta-tempo">${recentes.join('')}</ul>`;
      const responsavel = `<b>👤 ${esc(o.responsavel || '—')}</b>`;
      const restante = GC.prazoRestanteMin(o);
      const pct = Math.max(0, Math.min(100, (GC.tempoDePrazoMin(o) / o.prazoMin) * 100));
      const quase = (GC.limitesAtencao ? GC.limitesAtencao().quasePct : 75);
      // Depois de uma ação do prefeito, a faixa mostra o que foi feito (não mais o alarme).
      const alarme = estourada && !tratada;
      const comAcao = o.acaoPrefeito || (cobranca && cobranca.estado !== 'encerrada') || (GC.acoesPrefeito && GC.acoesPrefeito.situacao(o.id));
      // Os dois prazos (js/prazos.js) lado a lado, cada um com o seu nome: 1. pôr equipe em campo, 2. resolver.
      const fase = (n, rotulo, estado, valor, rodape, barraPct) => `<div class="gp-fase ${estado}">
          <span class="gp-rot"><i aria-hidden="true">${n}</i>${rotulo}</span>
          <span class="gp-val">${valor}</span>
          ${barraPct == null ? '' : `<span class="gp-barra" role="img" aria-label="${Math.round(barraPct)}% do prazo usado"><i style="width:${Math.round(barraPct)}%"></i></span>`}
          <small>${rodape}</small>
        </div>`;
      const atendimento = o.status === 'encaminhada'
        ? fase(1, 'Equipe em campo', estourada ? 'estourado' : pct >= quase ? 'quase' : '',
          estourada ? `Estourado há <b>${tempo(Math.round(-restante))}</b>` : `Faltam <b>${tempo(Math.round(restante))}</b>`,
          `prazo de ${NOME_SEV[o.severidade]}: ${tempo(o.prazoMin)}`, pct)
        : fase(1, 'Equipe em campo', 'feito', o.status === 'em_campo' ? '✓ Equipe no local' : '✓ Feito', `prazo de ${tempo(o.prazoMin)}`, null);
      const pz = GC.prazoDe(o);
      const sol = pz.solucao;
      const solucao = o.duplicadaDe ? '' : o.status === 'resolvida'
        ? fase(2, 'Resolver', o.noPrazo ? 'feito' : 'estourado', o.noPrazo ? '✓ Resolvida no prazo' : `Passou <b>${tempo(Math.round(-sol.restanteMin))}</b>`, `prazo de ${tempo(sol.totalMin)}`, null)
        : fase(2, 'Resolver', sol.estourado ? 'estourado' : '', sol.estourado
          ? `Atrasada há <b>${tempo(Math.round(-sol.restanteMin))}</b>`
          : `Até <b>${tempo(Math.round(sol.restanteMin))}</b>`, `prazo de ${tempo(sol.totalMin)}`, Math.min(100, sol.usadoPct));
      const historico = (o.historicoPrazo || []).length > 1
        ? `<details class="gaveta-historico-prazo"><summary>Mudanças no prazo</summary><ul>${o.historicoPrazo.map((h) => `<li><span>${relativo(h.em)}</span>${esc(h.texto)}: chegar em ${tempo(h.atendimentoMin)}, resolver em ${tempo(h.solucaoMin)}</li>`).join('')}</ul></details>`
        : '';
      // Anterior / próximo na ordem da gaveta Alertas (só quando veio de lá e o alerta está na lista).
      const lista = vizinhos ? vizinhos() : [];
      const pos = lista.indexOf(o.id);
      const nav = pos >= 0 && lista.length > 1
        ? `<div class="gaveta-nav" role="group" aria-label="Andar pela lista de alertas">
            <button type="button" class="gaveta-ir" data-ir="${esc(lista[pos - 1] || '')}" data-abre-gaveta ${pos === 0 ? 'disabled' : ''} aria-label="Alerta anterior" title="Alerta anterior"><i class="ti ti-chevron-up" aria-hidden="true"></i></button>
            <span>${pos + 1} de ${lista.length}</span>
            <button type="button" class="gaveta-ir" data-ir="${esc(lista[pos + 1] || '')}" data-abre-gaveta ${pos === lista.length - 1 ? 'disabled' : ''} aria-label="Próximo alerta" title="Próximo alerta"><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
          </div>`
        : '';
      const falsos = GC.falsosAlarmes && store ? (GC.falsosAlarmes(store)[o.regraId || o.tipo] || 0) : 0;
      // Ordem do detalhe: situação e prazo, o que fazer (Maia), por quê (regra, evidências, impacto), a operação
      // da pasta e as decisões, a linha do tempo. A barra de ações fica presa no pé.
      el.innerHTML = `
        <div class="gaveta-cabeca">
          ${voltar ? '<button type="button" class="gaveta-voltar" data-abre-gaveta>← Alertas</button>' : ''}
          ${nav}
          ${GC.expandir ? GC.expandir.html('alertas', 'gaveta-expandir') : ''}
          <button type="button" class="gaveta-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="gaveta-topo">
          <span class="sev ${o.severidade}">${SEV[o.severidade]}</span>
          ${STATUS[o.status] ? `<span class="gaveta-status ${o.status}">${STATUS[o.status]}</span>` : ''}
          ${GC.htmlEstrelaAcompanhar ? `<span class="gaveta-acompanhar" data-ap-caixa="estrela-${esc(o.id)}">${GC.htmlEstrelaAcompanhar(o)}</span>` : ''}
        </div>
        <h2>${area(o.area).emoji} ${esc(o.titulo)}</h2>
        <p class="gaveta-meta">${sec.emoji} ${esc(sec.nome)} · ${esc(bairro(o.bairroId).nome)} · aberta há ${tempo(Math.round(GC.idadeMin(o)))}</p>
        <section class="gaveta-prazo${alarme ? ' estourada' : ''}" aria-label="Prazos">
          <div class="gp-fases">${atendimento}${solucao}</div>
          <div class="gp-pe"><span class="gp-resp">Responsável ${responsavel}</span>${comAcao || o.status === 'em_campo' ? `<span class="gp-situacao">${esc(GC.situacao(o))}</span>` : ''}</div>
          ${historico}
        </section>
        ${o.status === 'resolvida' ? '' : `<section class="gaveta-ia" aria-label="Ação recomendada">
          <span class="gaveta-ia-rot">✨ Ação recomendada pela Maia</span>
          <p>${esc(d.acaoRecomendada)}</p>
        </section>`}
        <section class="gaveta-cartao gaveta-porque">
          <h3>Por que este alerta disparou</h3>
          <p class="gaveta-regra-texto">${esc(GC.regraEmPalavras(d.regra))}</p>
          <ul class="gaveta-evidencias">${d.evidencias.map((e) => `<li>${realcarNumeros(e)}</li>`).join('')}</ul>
          <div class="gaveta-impacto"><small>Impacto</small><b>${esc(d.impacto)}</b></div>
          <p class="gaveta-nota">Cruza <b>${d.regra.fontes.map(esc).join(' e ')}</b> · aconteceu ${d.regra.disparos30d}× nos últimos 30 dias${falsos ? ` · <b>${falsos} ${falsos === 1 ? 'falso alarme' : 'falsos alarmes'}</b> marcados pelo prefeito` : ''}</p>
          <details class="gaveta-tecnica"><summary>Ver regra técnica</summary><code class="gaveta-regra">${esc(d.regra.expressao)}</code></details>
        </section>
        ${GC.htmlEvidencia ? GC.htmlEvidencia(o) : ''}
        ${GC.htmlBlocoPedidos ? GC.htmlBlocoPedidos(o) : ''}
        ${GC.htmlBlocoOperacao && store ? GC.htmlBlocoOperacao(o, store) : ''}
        ${GC.htmlBlocoPrazo ? GC.htmlBlocoPrazo(o) : ''}
        ${GC.htmlBlocoAjuda ? GC.htmlBlocoAjuda(o) : ''}
        ${GC.htmlBlocoTarefas && !o.duplicadaDe ? GC.htmlBlocoTarefas({ tipo: 'alerta', id: o.id, nome: o.titulo, area: o.area }) : ''}
        ${cobranca && GC.htmlBlocoCobranca ? GC.htmlBlocoCobranca(cobranca) : ''}
        ${GC.htmlBlocoAcoesPrefeito ? GC.htmlBlocoAcoesPrefeito(o) : ''}
        <section class="gaveta-cartao gaveta-linha-tempo">
          <h3>Linha do tempo</h3>
          ${linhaTempo}
        </section>
        ${GC.htmlBarraAcoes
          // Uma barra só, fixa no pé: a ação recomendada, "Mais ações" em grupos e o formulário da vez (js/acoes-prefeito-ui.js).
          // A Maia vira um botão de ícone na mesma linha (o nome está no aria-label e no title).
          ? GC.htmlBarraAcoes(o, '<button type="button" class="btn-detalhes gaveta-perguntar so-icone" aria-label="Perguntar à Maia" title="Perguntar à Maia">🛞</button>')
          : `<div class="gaveta-botoes">${GC.botoesAcao(o, { completo: true })}<button type="button" class="btn-detalhes gaveta-perguntar">🛞 Perguntar à Maia</button></div>`}`;
      el.querySelector('.gaveta-fechar').onclick = fechar;
      const bv = el.querySelector('.gaveta-voltar');
      if (bv) bv.onclick = () => { const v = voltar; if (v) v(); };
      el.querySelectorAll('.gaveta-ir').forEach((b) => { b.onclick = () => { if (b.dataset.ir && aoIr) aoIr(b.dataset.ir); }; });
      el.querySelector('.gaveta-perguntar').onclick = () => aoPerguntar(o.id);
      el.querySelectorAll('[data-acao]').forEach((b) => { b.onclick = () => aoAgir(o.id, b.dataset.acao); });
    }

    function abrir(o, opcoesAbrir = {}) {
      if (!o) return;
      atual = o.id;
      voltar = opcoesAbrir.voltar || null;
      vizinhos = opcoesAbrir.vizinhos || null;
      aoIr = opcoesAbrir.aoIr || null;
      desenhar(o);
      clearTimeout(esconder);
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('aberta'));
      el.scrollTop = 0;
    }

    // Só redesenha se for a ocorrência aberta (mantém a rolagem). Com um formulário de resposta aberto,
    // espera (o relógio redesenha a cada 20 s e apagaria o que o secretário está escrevendo); forcar ignora isso.
    function atualizar(o, forcar) {
      if (!o || o.id !== atual) return;
      if (!forcar && el.querySelector('.cb-form:not([hidden]), .ap-menu:not([hidden])')) return;
      const rolagem = el.scrollTop;
      desenhar(o);
      el.scrollTop = rolagem;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    // Clique fora recolhe a gaveta (no mapa, num bairro, no chat...). Quem abre outro
    // alerta (cartões, "Ver detalhes") é marcado com data-abre-gaveta e só troca o conteúdo.
    document.addEventListener('pointerdown', (e) => {
      if (!atual || el.contains(e.target) || (e.target.closest && e.target.closest('[data-abre-gaveta]'))) return;
      fechar();
    });
    // Cliques e rolagem na gaveta não chegam ao mapa: ela fica fora de #mapa (é irmã dele no palco).

    return { abrir, atualizar, fechar, abertaId: () => atual };
  };
})(window.GC = window.GC || {});
