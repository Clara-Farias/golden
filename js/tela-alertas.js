(function (GC) {
  // Central de alertas: todas as ocorrências numa tabela (segue os Filtros do mapa; situação, busca, ordenação
  // por coluna, seleção com ações em lote e exportação) e, ao lado, as regras de monitoramento.
  const esc = (t) => GC.escaparHtml(t);
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const PESO = { critica: 0, alta: 1, media: 2 };
  const ORDEM_MOTIVO = { prazo: 0, prorrogacao: 1, escalada: 2, pausa_longa: 3, vai_estourar: 4, conjunta: 5, recorrente: 6 }; // a mesma de js/store.js
  // Os nomes dos filtros são os mesmos dos números do topo (Abertas, Prazo estourado, Em campo).
  const SITUACOES = [['abertas', 'Abertas'], ['criticas', 'Críticas'], ['estourado', 'Prazo estourado'], ['em_campo', 'Em campo'], ['solucao', 'Solução atrasada'], ['resolvidas', 'Resolvidas']];
  const FILTRO = {
    abertas: (o) => o.status !== 'resolvida',
    criticas: (o) => o.status !== 'resolvida' && o.severidade === 'critica',
    estourado: (o) => GC.estourada(o),
    em_campo: (o) => o.status === 'em_campo',
    // Passou do prazo de solução ainda aberta (js/prazos.js). Não pede o prefeito: só aparece aqui e no detalhe.
    solucao: (o) => o.status !== 'resolvida' && GC.solucaoAtrasada(o),
    resolvidas: (o) => o.status === 'resolvida',
  };
  // Situação curta: o prazo já tem coluna própria.
  const STATUS = { encaminhada: '📡 Encaminhada', em_campo: '🚧 Em campo', resolvida: '✅ Resolvida' };
  const ACAO = { cobrar: '📣 cobrada', priorizar: '⚡ priorizada', gabinete: '🚨 gabinete' };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  // Sem equipe em campo, a coluna mostra o prazo de atendimento. Em campo, se a equipe chegou a tempo, até passar
  // do prazo de solução ("solução atrasada"). Na resolvida, se fechou no prazo de solução (js/prazos.js).
  GC.prazoAlerta = function (o) {
    if (o.status === 'resolvida') {
      return o.noPrazo === false ? { texto: 'resolvida fora do prazo', tom: 'ruim' } : { texto: 'resolvida no prazo', tom: 'ok' };
    }
    if (o.status === 'em_campo') {
      const p = GC.prazoDe(o);
      if (p.solucao.estourado) return { texto: `solução atrasada há ${GC.tempoTexto(-p.solucao.restanteMin)}`, tom: 'ruim' };
      const atraso = -p.atendimento.restanteMin;
      return atraso > 0 ? { texto: `equipe chegou ${GC.tempoTexto(atraso)} após o prazo`, tom: 'ruim' } : { texto: 'equipe chegou no prazo', tom: 'ok' };
    }
    const r = GC.prazoRestanteMin(o);
    return r < 0 ? { texto: `⏰ estourado há ${GC.tempoTexto(-r)}`, tom: 'estourado' } : { texto: `faltam ${GC.tempoTexto(r)}`, tom: '' };
  };

  // Números do topo: contados na mesma lista da tabela (perfil, secretaria e bairro da tela),
  // sem o filtro de situação, para não zerar ao clicar num chip.
  GC.resumoAlertas = function (lista) {
    const abertas = lista.filter((o) => o.status !== 'resolvida');
    return {
      abertas: abertas.length,
      estouradas: abertas.filter(GC.estourada).length,
      emCampo: abertas.filter((o) => o.status === 'em_campo').length,
    };
  };

  // Mesma prioridade da gaveta Alertas (gravidade, depois motivo); resolvidas por último, a mais recente primeiro.
  function ordenar(lista) {
    const chave = (o) => {
      const m = GC.motivosAtencao(o)[0];
      return m ? ORDEM_MOTIVO[m.tipo] : 5;
    };
    return lista.slice().sort((a, b) => (a.status === 'resolvida') - (b.status === 'resolvida')
      || (a.status === 'resolvida' ? b.resolvidaEm - a.resolvidaEm : 0)
      || PESO[a.severidade] - PESO[b.severidade]
      || chave(a) - chave(b)
      || GC.idadeMin(b) - GC.idadeMin(a));
  }

  function situacaoCurta(o) {
    if (o.status === 'resolvida') return `${STATUS.resolvida} há ${GC.tempoTexto((GC.agora() - o.resolvidaEm) / 60000)}`;
    return `${STATUS[o.status]}${o.acaoPrefeito ? ` · ${ACAO[o.acaoPrefeito]}` : GC.cobrancas && GC.cobrancas.aberta(o.id) ? ' · 📣 cobrada' : ''}`;
  }

  // Na tabela, o caso de sempre (encaminhada, ninguém agiu) fica apagado; o que é exceção ganha peso.
  function situacaoHtml(o) {
    const texto = situacaoCurta(o);
    const comum = o.status === 'resolvida' || (o.status === 'encaminhada' && texto === STATUS.encaminhada);
    return comum ? `<span class="suave">${esc(texto)}</span>` : `<b class="alr-sit-destaque">${esc(texto)}</b>`;
  }

  // Ação da linha: só o verbo (a secretaria já está na coluna ao lado). O nome inteiro fica no title.
  const ACAO_CURTA = { cobrar: ['📣', 'Cobrar'], priorizar: ['⚡', 'Priorizar'], gabinete: ['🚨', 'Gabinete'] };
  function acaoLinha(o) {
    const acao = GC.acoesDisponiveis(o)[0];
    if (!acao || !ACAO_CURTA[acao]) return GC.botoesAcao(o, { principal: true });
    const titulo = acao === 'cobrar' ? `Cobrar ${(area(o.area) || { nome: 'a secretaria' }).nome}` : acao === 'gabinete' ? 'Abrir o gabinete de crise' : 'Priorizar: o tempo que falta do prazo cai pela metade';
    return `<button type="button" class="btn-acao alr-acao-linha" data-acao="${acao}" title="${esc(titulo)}">${ACAO_CURTA[acao][0]} ${ACAO_CURTA[acao][1]}</button>`;
  }

  function prazo(o) {
    const p = GC.prazoAlerta(o);
    const classe = p.tom === 'estourado' || p.tom === 'ruim' ? 'prazo-estourado' : p.tom === 'ok' ? 'suave' : '';
    return classe ? `<span class="${classe}">${esc(p.texto)}</span>` : esc(p.texto);
  }

  // ---- Central mais produtiva: filtros globais, busca, ordenação, seleção e exportação (funções puras) ----

  // Os Filtros do mapa (gaveta Filtros, js/filtros.js) valem também aqui: secretaria (a principal ou uma das
  // envolvidas), bairro, recorte, gravidade e atributos. Depois, a situação da tela e a busca.
  const RECORTE = { criticas: (o) => o.severidade === 'critica', estourado: (o) => GC.estourada(o), andamento: (o) => o.status === 'em_campo' };
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  GC.noFiltroGlobal = function (o, filtros) {
    const f = filtros || {};
    const areas = f.areas || [];
    const bairros = f.bairros || [];
    if (areas.length && !areas.includes(o.area) && !(o.areasEnvolvidas || []).some((a) => areas.includes(a))) return false;
    if (bairros.length && !bairros.includes(o.bairroId)) return false;
    if (f.recorte && !(RECORTE[f.recorte] && RECORTE[f.recorte](o))) return false;
    return GC.filtrarPorAtributos ? GC.filtrarPorAtributos([o], f).length > 0 : true;
  };
  // Busca: título, tipo, bairro, secretarias, número da ocorrência e nome da regra (sem diferença de acento).
  GC.buscaCentral = function (o, texto) {
    const t = semAcento(texto).trim();
    if (!t) return true;
    const regra = o.regraDisparo ? o.regraDisparo.nome : '';
    const alvo = semAcento([o.id, o.titulo, o.tipo, (bairro(o.bairroId) || {}).nome, ...(o.areasEnvolvidas || [o.area]).map((a) => (area(a) || {}).nome), regra].join(' '));
    return t.split(/\s+/).every((p) => alvo.includes(p));
  };

  // Ordenação por coluna. coluna null = a prioridade de sempre (a mesma da gaveta Alertas).
  const ORDEM_STATUS = { encaminhada: 0, em_campo: 1, resolvida: 2 };
  const CHAVES = {
    gravidade: (o) => PESO[o.severidade],
    alerta: (o) => semAcento(o.titulo),
    secretaria: (o) => semAcento((area(o.area) || {}).nome),
    bairro: (o) => semAcento((bairro(o.bairroId) || {}).nome),
    // Prazo: o que vence (ou venceu) primeiro em cima; resolvidas por último, a mais recente antes.
    prazo: (o) => (o.status === 'resolvida' ? 1e9 + (GC.agora() - o.resolvidaEm) / 60000 : o.status === 'em_campo' ? 1e8 : GC.prazoRestanteMin(o)),
    situacao: (o) => ORDEM_STATUS[o.status] * 10 + (o.acaoPrefeito || (GC.cobrancas && GC.cobrancas.aberta(o.id)) ? 1 : 0),
  };
  GC.COLUNAS_CENTRAL = Object.keys(CHAVES);
  GC.ordenarCentral = function (lista, coluna, direcao = 'asc') {
    if (!coluna || !CHAVES[coluna]) return ordenar(lista);
    const k = CHAVES[coluna];
    const sinal = direcao === 'desc' ? -1 : 1;
    const base = ordenar(lista); // desempate: a prioridade de sempre
    const pos = new Map(base.map((o, i) => [o.id, i]));
    return base.slice().sort((a, b) => {
      const x = k(a);
      const y = k(b);
      const c = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y;
      return c * sinal || pos.get(a.id) - pos.get(b.id);
    });
  };

  // CSV da Central (o que está na tela, na ordem da tela). Separador ";" e BOM, como as outras exportações.
  GC.csvCentral = function (lista) {
    const campo = GC.campoCsv || ((v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`);
    const data = (t) => (t ? new Date(t).toLocaleString('pt-BR') : '');
    // Planilha sem emoji: os ícones da tela viram só o texto.
    const limpo = (t) => String(t || '').replace(/\p{Extended_Pictographic}️?\s?/gu, '').replace(/\s{2,}/g, ' ').trim();
    const cab = ['Número', 'Gravidade', 'Alerta', 'Tipo', 'Secretarias', 'Bairro', 'Prazo', 'Situação', 'Aberta em', 'Pessoas afetadas', 'Regra', 'Motivos de atenção'];
    const linhas = lista.map((o) => [
      o.id, SEV[o.severidade], o.titulo, o.tipo, (o.areasEnvolvidas || [o.area]).map((a) => (area(a) || {}).nome).join(' + '),
      (bairro(o.bairroId) || {}).nome, limpo(GC.prazoAlerta(o).texto), limpo(situacaoCurta(o)),
      data(o.criadaEm), o.afetados || 0, o.regraDisparo ? o.regraDisparo.nome : o.tipo,
      GC.motivosAtencao(o).map((m) => limpo(m.texto)).join(' · '),
    ]);
    return `﻿${[cab, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n')}\r\n`;
  };

  // Alertas relacionados: abertos do mesmo tipo no mesmo bairro, ou a menos de RAIO_RELACIONADAS_M um do outro.
  // O principal é o mais antigo (o que a cidade viu primeiro); os outros ficam embaixo dele na Central.
  // Devolve Map principalId → [ids relacionados]. Resolvidas não entram.
  GC.RAIO_RELACIONADAS_M = 400;
  const distM = (a, b) => {
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
    const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
  };
  GC.gruposRelacionados = function (lista) {
    const abertas = lista.filter((o) => o.status !== 'resolvida').slice().sort((a, b) => a.criadaEm - b.criadaEm || String(a.id).localeCompare(String(b.id)));
    const grupos = new Map();
    const dono = new Map();
    abertas.forEach((o) => {
      const principal = abertas.find((x) => x !== o && dono.get(x.id) === undefined && x.criadaEm <= o.criadaEm && x.tipo === o.tipo
        && (x.bairroId === o.bairroId || distM(x, o) <= GC.RAIO_RELACIONADAS_M) && abertas.indexOf(x) < abertas.indexOf(o));
      if (!principal) return;
      dono.set(o.id, principal.id);
      if (!grupos.has(principal.id)) grupos.set(principal.id, []);
      grupos.get(principal.id).push(o.id);
    });
    return grupos;
  };

  // Casos recorrentes: a mesma secretaria no mesmo bairro com mais de `limite` casos em 30 dias (o histórico de
  // GC.data.historico30d mais as ocorrências desta sessão). O limite é o mesmo do motivo "caso repetido" de
  // "Precisam de você" (GC.limitesAtencao().recorrenteMin). opcoes: { limite, filtros (do mapa), areas (do perfil) }.
  // Devolve [{ chave: 'area|bairro', area, bairroId, casos, historico, anterior, variacao, ocorrencias, abertas, tipos }],
  // primeiro os que têm caso aberto agora, depois os de mais casos.
  GC.casosRecorrentes = function (lista, opcoes = {}) {
    const limite = opcoes.limite || (GC.limitesAtencao ? GC.limitesAtencao().recorrenteMin : 6);
    const f = opcoes.filtros || {};
    const hist = GC.data.historico30d || {};
    const antes = GC.data.historicoMesAnterior || {};
    const pares = new Map();
    const par = (a, b) => {
      const k = `${a}|${b}`;
      if (!pares.has(k)) pares.set(k, { chave: k, area: a, bairroId: b, historico: (hist[a] || {})[b] || 0, anterior: (antes[a] || {})[b] || 0, ocorrencias: [] });
      return pares.get(k);
    };
    Object.entries(hist).forEach(([a, porBairro]) => Object.keys(porBairro).forEach((b) => par(a, b)));
    lista.forEach((o) => par(o.area, o.bairroId).ocorrencias.push(o));
    const noRecorte = (p) => (!opcoes.areas || opcoes.areas.includes(p.area))
      && (!(f.areas || []).length || f.areas.includes(p.area)) && (!(f.bairros || []).length || f.bairros.includes(p.bairroId));
    return [...pares.values()].filter(noRecorte).map((p) => {
      const casos = p.historico + p.ocorrencias.length;
      return Object.assign(p, { casos, variacao: casos - p.anterior, abertas: p.ocorrencias.filter((o) => o.status !== 'resolvida'), tipos: [...new Set(p.ocorrencias.map((o) => o.tipo))] });
    }).filter((p) => p.casos > limite)
      .sort((x, y) => (y.abertas.length > 0) - (x.abertas.length > 0) || y.casos - x.casos || x.chave.localeCompare(y.chave));
  };

  // Agrupar ocorrências parecidas na Central: por tipo de problema, bairro ou secretaria. A lista chega na ordem
  // da tela e cada grupo fica na posição da sua primeira ocorrência. Por tipo, os tipos que só têm uma ocorrência
  // vão juntos para o último grupo, "Sem parecidas". Modo sem chave (relacionados, nenhum): null.
  GC.MODOS_AGRUPAR = [['relacionados', 'Relacionados (mesmo tipo e lugar)'], ['tipo', 'Por tipo de problema'], ['bairro', 'Por bairro'], ['secretaria', 'Por secretaria'], ['nenhum', 'Sem agrupar']];
  const CHAVE_GRUPO = { tipo: (o) => o.tipo, bairro: (o) => o.bairroId, secretaria: (o) => o.area };
  const maiuscula = (t) => { const s = String(t || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const ROTULO_GRUPO = { tipo: maiuscula, bairro: (k) => (bairro(k) || { nome: k }).nome, secretaria: (k) => (area(k) || { nome: k }).nome };
  GC.agruparCentral = function (lista, modo) {
    const chave = CHAVE_GRUPO[modo];
    if (!chave) return null;
    const mapa = new Map();
    lista.forEach((o) => { const k = chave(o); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(o); });
    const grupo = (k, rotulo, itens, extra = {}) => {
      const abertas = itens.filter((o) => o.status !== 'resolvida');
      return Object.assign({
        chave: k, rotulo, itens,
        abertas: abertas.length,
        criticas: abertas.filter((o) => o.severidade === 'critica').length,
        estouradas: abertas.filter((o) => GC.estourada(o)).length,
        bairros: new Set(itens.map((o) => o.bairroId)).size,
        secretarias: new Set(itens.map((o) => o.area)).size,
      }, extra);
    };
    let grupos = [...mapa].map(([k, itens]) => grupo(k, ROTULO_GRUPO[modo](k), itens));
    if (modo === 'tipo') {
      const unicos = new Set(grupos.filter((g) => g.itens.length === 1).map((g) => g.itens[0].id));
      if (unicos.size > 1) grupos = [...grupos.filter((g) => g.itens.length > 1), grupo('_sem_parecidas', 'Sem parecidas', lista.filter((o) => unicos.has(o.id)), { outros: true })];
    }
    return grupos;
  };

  // Novidades desde a última visita à Central: o que nasceu depois e o que mudou depois (linha do tempo ou
  // resposta da secretaria à cobrança). Devolve Map id → { tipo: 'nova' | 'mudou', texto }. Sem visita: vazio.
  GC.novidadesDesde = function (lista, desde) {
    const novidades = new Map();
    if (!desde) return novidades;
    const limpo = (t) => String(t || '').replace(/\p{Extended_Pictographic}\uFE0F?\s?/gu, '').trim();
    lista.forEach((o) => {
      if (o.criadaEm > desde) { novidades.set(o.id, { tipo: 'nova', texto: 'nova desde a sua última visita' }); return; }
      const c = GC.cobrancas && GC.cobrancas.daOcorrencia ? GC.cobrancas.daOcorrencia(o.id) : null;
      const resposta = c && (c.respostas || []).filter((r) => r.em > desde && r.tipo !== 'recobranca').pop();
      const registro = (o.linhaTempo || []).filter((x) => x.t > desde).pop();
      if (resposta) novidades.set(o.id, { tipo: 'mudou', texto: 'a secretaria respondeu a cobrança' });
      else if (registro) novidades.set(o.id, { tipo: 'mudou', texto: limpo(registro.texto) });
    });
    return novidades;
  };

  // aoLote(ids, acao) → { feitas, ignoradas }; aoExportar(lista, { selecao }); aoFiltros() abre a gaveta Filtros;
  // aoLimparFiltros() limpa os filtros do mapa.
  // aoJuntar(id, principalId) (secretário: junta a duplicada); aoMarcarVisto() (novidades: "marcar tudo como visto").
  GC.criarTelaAlertas = function (el, { aoAgir, aoAbrir, aoVerNoMapa, aoLote, aoExportar, aoFiltros, aoLimparFiltros, aoJuntar, aoMarcarVisto }) {
    const filtro = { situacao: 'abertas', busca: '', recorrente: null }; // recorrente: 'area|bairro' de um caso recorrente
    let agrupar = 'relacionados'; // um de GC.MODOS_AGRUPAR
    const expandidos = new Set(); // principais com os relacionados à mostra
    const recolhidos = new Set(); // 'modo|chave' dos grupos fechados
    let recorrentes = []; // GC.casosRecorrentes do recorte de agora
    let recorrentePorChave = new Map();
    let todosRecorrentes = false; // false: só os REC_VISIVEIS primeiros cartões
    const REC_VISIVEIS = 4;
    let gruposAgora = []; // os grupos da tabela de agora (agrupar por tipo, bairro ou secretaria)
    let grupos = new Map();
    let novidades = new Map();
    let idsCrise = new Set(); // ocorrências ligadas ao gabinete de crise aberto (estado.modoCrise, js/modo-crise.js)
    const ordem = { coluna: null, direcao: 'asc' };
    const selecao = new Set();
    let aviso = null; // { texto, erro }
    let ultimo = null;
    let filhosAgora = new Map(); // relacionada → principal, na tabela de agora
    let visiveisAgora = []; // as ocorrências da tabela (na ordem da tela), para a seleção e a exportação
    // As regras moram só na tela "Regras de alerta" (#/regras, com pausar e restaurar): aqui fica o atalho,
    // com o número de pausadas (é o que muda o que chega à Central).
    el.innerHTML = `
      <header class="sec-topo"><div><h2>📋 Central de alertas</h2><p>Todas as ocorrências da cidade: prazo, situação e o que fazer em cada uma.</p></div>
        <span class="sec-acoes"><a class="btn-sec alr-regras-link" href="#/regras"><i class="ti ti-adjustments-alt" aria-hidden="true"></i> Regras de alerta <b class="alr-pausadas" hidden></b></a><button type="button" class="btn-sec alr-exportar"><i class="ti ti-download" aria-hidden="true"></i> Exportar CSV</button></span></header>
      <div class="alr-kpis" role="group" aria-label="Números do recorte (clique para filtrar a tabela)"></div>
      <div class="filtros alr-filtros">
        <span class="alr-situacoes" role="group" aria-label="Situação">${SITUACOES.map(([id, nome]) => `<button type="button" class="chip-filtro" data-situacao="${id}">${nome}</button>`).join('')}<button type="button" class="chip-filtro alr-chip-novidades" data-situacao="novidades" hidden>Novidades <b></b></button><button type="button" class="chip-filtro alr-chip-crise" data-situacao="crise" title="Só as ligadas ao gabinete de crise aberto" hidden>Da crise <b></b></button></span>
        <span class="alr-global" role="status"></span>
        <label class="alr-agrupar">Agrupar <select aria-label="Agrupar ocorrências parecidas">${GC.MODOS_AGRUPAR.map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('')}</select></label>
        <label class="au-busca alr-busca"><i class="ti ti-search" aria-hidden="true"></i><input type="search" placeholder="Buscar alerta, bairro, secretaria ou número…" aria-label="Buscar na Central"></label>
      </div>
      <div class="alr-novidades" role="status" hidden></div>
      <details class="rel-cartao alr-recorrentes"><summary><i class="ti ti-chevron-right alr-rec-seta" aria-hidden="true"></i><i class="ti ti-repeat" aria-hidden="true"></i> Casos recorrentes <b class="alr-rec-total"></b><small class="alr-rec-resumo"></small><small class="alr-rec-regra"></small></summary><div class="alr-rec-lista"></div></details>
      <div class="alr-lote" role="region" aria-label="Ações nas ocorrências selecionadas" hidden></div>
      <p class="alr-aviso" role="status" hidden></p>
      <section class="rel-cartao alr-tabela-wrap"></section>`;
    el.querySelectorAll('[data-situacao]').forEach((b) => { b.onclick = () => { filtro.situacao = b.dataset.situacao; desenhar(); }; });
    el.querySelector('.alr-agrupar select').onchange = (e) => { agrupar = e.target.value; desenhar(); };
    const busca = el.querySelector('.alr-busca input');
    busca.oninput = () => { filtro.busca = busca.value; desenhar(); };
    el.querySelector('.alr-exportar').onclick = () => {
      if (!visiveisAgora.length) { mostrarAviso('Nada para exportar neste recorte.', true); return; }
      aoExportar(visiveisAgora, { selecao: false });
    };

    const noRecorte = (o) => GC.noFiltroGlobal(o, ultimo.filtros) && GC.buscaCentral(o, filtro.busca)
      && (!filtro.recorrente || `${o.area}|${o.bairroId}` === filtro.recorrente);
    // Registro do histórico (sem gravidade nem regra): só secretaria, bairro e busca.
    const historicoNoRecorte = (r) => {
      const f = ultimo.filtros || {};
      return (!(f.areas || []).length || f.areas.includes(r.area)) && (!(f.bairros || []).length || f.bairros.includes(r.bairroId))
        && !f.recorte && !(f.severidades || []).length
        && (!filtro.busca.trim() || semAcento([r.titulo, (bairro(r.bairroId) || {}).nome, (area(r.area) || {}).nome].join(' ')).includes(semAcento(filtro.busca).trim()));
    };

    function mostrarAviso(texto, erro) {
      aviso = { texto, erro: !!erro };
      const p = el.querySelector('.alr-aviso');
      p.textContent = texto;
      p.hidden = false;
      p.classList.toggle('alr-aviso-erro', !!erro);
    }

    // extra: { relacionadas: n (principal de um grupo), principal: id (relacionada à mostra) }.
    function linha(o, extra = {}) {
      // A regra técnica sai da linha (ruído para quem decide) e fica no title do título e no detalhe.
      const classe = [o.status === 'resolvida' ? 'resolvida' : GC.estourada(o) && !GC.tratada(o) ? 'estourada' : '', selecao.has(o.id) ? 'selecionada' : '', extra.principal ? 'relacionada' : ''].filter(Boolean).join(' ');
      const nov = novidades.get(o.id);
      const badge = nov ? `<span class="alr-novo alr-novo-${nov.tipo}" title="${esc(nov.texto)}">${nov.tipo === 'nova' ? 'nova' : 'mudou'}</span>` : '';
      const rel = extra.relacionadas ? `<button type="button" class="alr-rel" data-expandir="${esc(o.id)}" aria-expanded="${expandidos.has(o.id)}" title="Alertas do mesmo tipo no mesmo bairro ou a menos de ${GC.RAIO_RELACIONADAS_M} m"><i class="ti ti-${expandidos.has(o.id) ? 'chevron-down' : 'chevron-right'}" aria-hidden="true"></i> +${extra.relacionadas} relacionad${extra.relacionadas > 1 ? 'os' : 'o'}</button>` : '';
      const rec = o.status !== 'resolvida' && recorrentePorChave.get(`${o.area}|${o.bairroId}`);
      const seloCrise = o.status !== 'resolvida' && idsCrise.has(o.id) ? '<span class="selo-crise" title="Ligada ao gabinete de crise aberto">Crise</span>' : '';
      const seloRec = rec ? `<span class="alr-recorrente" title="${esc(`Caso recorrente: ${rec.casos} casos de ${(area(rec.area) || {}).nome} em ${(bairro(rec.bairroId) || {}).nome} em 30 dias`)}"><i class="ti ti-repeat" aria-hidden="true"></i> recorrente</span>` : '';
      const principal = extra.principal ? ultimo.ocorrencias.find((x) => x.id === extra.principal) : null;
      const juntar = principal && aoJuntar && GC.podeOperar && GC.podeOperar('juntar', o) ? `<button type="button" class="btn-sec alr-juntar" data-juntar="${esc(o.id)}" data-principal="${esc(principal.id)}" title="Fecha esta como duplicada e soma as pessoas afetadas à principal">Juntar à principal</button>` : '';
      return `<tr data-id="${o.id}" data-abre-gaveta tabindex="0" class="${classe}">
          <td class="alr-marca"><input type="checkbox" data-marcar="${esc(o.id)}"${selecao.has(o.id) ? ' checked' : ''} aria-label="Selecionar ${esc(o.titulo)}"></td>
          <td><span class="sev ${o.severidade}">${SEV[o.severidade]}</span></td>
          <td>${extra.principal ? '<i class="ti ti-corner-down-right alr-rel-seta" aria-hidden="true"></i>' : ''}<b title="Regra: ${esc(GC.detalharOcorrencia(o).regra.expressao)}">${esc(o.titulo)}</b>${seloCrise}${badge}${seloRec}${rel}${nov && nov.tipo === 'mudou' ? `<small class="alr-mudou">${esc(nov.texto)}</small>` : ''}${juntar}</td>
          <td>${esc(o.areasEnvolvidas.map((a) => area(a).nome).join(' + '))}</td>
          <td>${esc(bairro(o.bairroId).nome)}</td>
          <td>${prazo(o)}</td>
          <td class="alr-situacao">${situacaoHtml(o)}</td>
          <td class="alr-acoes"><span class="alr-acao-principal">${acaoLinha(o)}</span>${o.status !== 'resolvida' ? '<button type="button" class="btn-acao alr-mapa" title="Ver no mapa" aria-label="Ver no mapa">🗺</button>' : ''}</td>
        </tr>`;
    }

    // Resolvidas antes desta sessão: só o registro (sem gravidade nem regra), não abrem detalhe nem entram na seleção.
    function linhaHistorica(r) {
      return `<tr class="resolvida historica">
          <td></td>
          <td><span class="suave">—</span></td>
          <td><b>${esc(r.titulo)}</b><small>registro do histórico</small></td>
          <td>${esc(area(r.area).nome)}</td>
          <td>${esc(bairro(r.bairroId).nome)}</td>
          <td>${r.atrasoMin ? `<span class="prazo-estourado">resolvida ${esc(GC.tempoTexto(r.atrasoMin))} após o prazo</span>` : '<span class="suave">resolvida no prazo</span>'}</td>
          <td class="alr-situacao">${esc(`${STATUS.resolvida} há ${GC.tempoTexto(r.haMin)}`)}</td>
          <td></td>
        </tr>`;
    }

    // Cabeçalho de um grupo de parecidas: nome, quantas, críticas e estouradas; a caixa marca o grupo inteiro.
    function linhaGrupo(g) {
      const aberto = !recolhidos.has(`${agrupar}|${g.chave}`);
      const marcadas = g.itens.filter((o) => selecao.has(o.id)).length;
      const nBairros = `em ${g.bairros} ${g.bairros === 1 ? 'bairro' : 'bairros'}`;
      const onde = agrupar === 'tipo' ? (g.outros ? 'um caso de cada tipo' : nBairros)
        : agrupar === 'bairro' ? `${g.secretarias} ${g.secretarias === 1 ? 'secretaria' : 'secretarias'}` : nBairros;
      const partes = [
        g.criticas ? `<span class="alr-grupo-critica">${g.criticas} crítica${g.criticas > 1 ? 's' : ''}</span>` : '',
        g.estouradas ? `<span class="prazo-estourado">${g.estouradas} com prazo estourado</span>` : '',
        esc(onde),
      ].filter(Boolean).join(' · ');
      return `<tr class="alr-grupo${g.outros ? ' outros' : ''}" data-grupo="${esc(g.chave)}">
          <td class="alr-marca"><input type="checkbox" data-marcar-grupo="${esc(g.chave)}"${marcadas && marcadas === g.itens.length ? ' checked' : ''}${marcadas && marcadas < g.itens.length ? ' data-parcial' : ''} aria-label="Selecionar o grupo ${esc(g.rotulo)}"></td>
          <td colspan="7"><button type="button" class="alr-grupo-btn" data-recolher="${esc(g.chave)}" aria-expanded="${aberto}"><i class="ti ti-${aberto ? 'chevron-down' : 'chevron-right'}" aria-hidden="true"></i> <b>${esc(g.rotulo)}</b> <span class="alr-grupo-n">${g.itens.length}</span></button> <small>${partes}</small></td>
        </tr>`;
    }

    // Faixa acima da tabela quando ela mostra só um caso recorrente.
    function faixaRecorrente() {
      if (!filtro.recorrente) return '';
      const [a, b] = filtro.recorrente.split('|');
      return `<p class="alr-rec-faixa"><i class="ti ti-repeat" aria-hidden="true"></i> <span>Só o caso recorrente <b>${esc((area(a) || { nome: a }).nome)} · ${esc((bairro(b) || { nome: b }).nome)}</b></span> <button type="button" class="alr-limpar-filtros" data-rec-limpar>Mostrar tudo</button></p>`;
    }

    // Cartões dos casos recorrentes (GC.casosRecorrentes): secretaria e bairro, casos em 30 dias, comparação com
    // o mês anterior, as abertas de agora e os atalhos (ver na tabela, relatório do bairro).
    function cartoesRecorrentes() {
      const lim = GC.limitesAtencao ? GC.limitesAtencao().recorrenteMin : 6;
      // Fechado de fábrica (a tabela vem primeiro): o título resume, e abre sozinho com um caso escolhido.
      const comAbertas = recorrentes.filter((p) => p.abertas.length).length;
      el.querySelector('.alr-rec-total').textContent = recorrentes.length;
      el.querySelector('.alr-rec-resumo').textContent = recorrentes.length ? `${comAbertas} com ${comAbertas === 1 ? 'caso aberto' : 'casos abertos'} agora` : '';
      el.querySelector('.alr-rec-regra').textContent = `mesma secretaria no mesmo bairro, mais de ${lim} casos em 30 dias`;
      if (filtro.recorrente) el.querySelector('.alr-recorrentes').open = true;
      const lista = el.querySelector('.alr-rec-lista');
      if (!recorrentes.length) { lista.innerHTML = '<p class="painel-vazio">Nenhum caso recorrente neste recorte.</p>'; return; }
      const mostrar = todosRecorrentes ? recorrentes : recorrentes.filter((p, i) => i < REC_VISIVEIS || p.chave === filtro.recorrente);
      lista.innerHTML = mostrar.map((p) => {
        const v = p.variacao;
        const varTexto = v > 0 ? `↑ ${v} a mais que no mês anterior` : v < 0 ? `↓ ${-v} a menos que no mês anterior` : 'igual ao mês anterior';
        const tipos = [...new Set(p.abertas.map((o) => o.tipo))].join(', ');
        const ativo = filtro.recorrente === p.chave;
        const ver = p.abertas.length
          ? `<button type="button" class="btn-sec" data-rec="${esc(p.chave)}" aria-pressed="${ativo}">${ativo ? 'Mostrar tudo' : `Ver ${p.abertas.length === 1 ? 'a aberta' : `as ${p.abertas.length} abertas`}`}</button>` : '';
        const relatorio = GC.hashDe ? `<a href="${GC.hashDe({ tela: 'relatorios', tipo: 'bairro', alvo: p.bairroId, periodo: '30' })}">Relatório do bairro</a>` : '';
        return `<article class="alr-rec${ativo ? ' ativo' : ''}${p.abertas.length ? ' com-abertas' : ''}">
            <h4>${esc((area(p.area) || { nome: p.area }).nome)} <span>· ${esc((bairro(p.bairroId) || { nome: p.bairroId }).nome)}</span></h4>
            <p class="alr-rec-num"><b>${p.casos}</b> casos em 30 dias <small class="${v > 0 ? 'ruim' : v < 0 ? 'bom' : ''}">${varTexto}</small></p>
            <p class="alr-rec-abertas">${p.abertas.length ? `${p.abertas.length} aberta${p.abertas.length > 1 ? 's' : ''} agora: ${esc(tipos)}` : 'Nenhuma aberta agora'}</p>
            <div class="alr-rec-acoes">${ver}${relatorio}</div>
          </article>`;
      }).join('') + (recorrentes.length > REC_VISIVEIS ? `<button type="button" class="alr-limpar-filtros alr-rec-mais" data-rec-mais>${todosRecorrentes ? 'Mostrar menos' : `Ver todos os ${recorrentes.length}`}</button>` : '');
      const mais = lista.querySelector('[data-rec-mais]');
      if (mais) mais.onclick = () => { todosRecorrentes = !todosRecorrentes; cartoesRecorrentes(); };
      lista.querySelectorAll('[data-rec]').forEach((b) => {
        b.onclick = () => {
          filtro.recorrente = filtro.recorrente === b.dataset.rec ? null : b.dataset.rec;
          if (filtro.recorrente && !['abertas', 'criticas', 'estourado'].includes(filtro.situacao)) filtro.situacao = 'abertas';
          desenhar();
          const de = el.querySelector(`[data-rec="${b.dataset.rec}"]`);
          if (de) de.focus();
        };
      });
    }

    const COLUNAS = [['gravidade', 'Gravidade'], ['alerta', 'Alerta'], ['secretaria', 'Secretaria'], ['bairro', 'Bairro'], ['prazo', 'Prazo'], ['situacao', 'Situação']];
    function cabecalho(todasMarcadas, algumaMarcada) {
      const th = ([id, nome]) => {
        const ativa = ordem.coluna === id;
        const sort = ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none';
        const seta = ativa ? (ordem.direcao === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrows-sort';
        return `<th scope="col" aria-sort="${sort}"><button type="button" class="alr-ordenar${ativa ? ' ativa' : ''}" data-ordenar="${id}" title="Ordenar por ${nome.toLowerCase()}">${nome} <i class="ti ti-${seta}" aria-hidden="true"></i></button></th>`;
      };
      return `<thead><tr><th scope="col" class="alr-marca"><input type="checkbox" data-marcar-todas aria-label="Selecionar todas as ocorrências da tabela"${todasMarcadas ? ' checked' : ''}${algumaMarcada && !todasMarcadas ? ' data-parcial' : ''}></th>${COLUNAS.map(th).join('')}<th scope="col"><span class="so-leitor">Ações</span></th></tr></thead>`;
    }

    function tabela(lista, historico, total) {
      const naSituacao = filtro.situacao === 'novidades' ? (o) => novidades.has(o.id)
        : filtro.situacao === 'crise' ? (o) => o.status !== 'resolvida' && idsCrise.has(o.id) : FILTRO[filtro.situacao];
      const visiveis = GC.ordenarCentral(lista.filter((o) => naSituacao(o) && noRecorte(o)), ordem.coluna, ordem.direcao);
      visiveisAgora = visiveis;
      // Relacionados: o relacionado some da lista e aparece embaixo do principal (quando o principal está na tabela).
      const ids = new Set(visiveis.map((o) => o.id));
      const filhoDe = new Map();
      const porGrupo = GC.agruparCentral(visiveis, agrupar);
      gruposAgora = porGrupo || [];
      if (agrupar === 'relacionados') grupos.forEach((filhos, pid) => { if (ids.has(pid)) filhos.filter((f) => ids.has(f)).forEach((f) => filhoDe.set(f, pid)); });
      const linhas = porGrupo ? porGrupo.map((g) => linhaGrupo(g) + (recolhidos.has(`${agrupar}|${g.chave}`) ? '' : g.itens.map((o) => linha(o)).join(''))) : visiveis.filter((o) => !filhoDe.has(o.id)).map((o) => {
        const filhos = visiveis.filter((x) => filhoDe.get(x.id) === o.id);
        const html = linha(o, { relacionadas: filhos.length });
        return filhos.length && expandidos.has(o.id) ? html + filhos.map((f) => linha(f, { principal: o.id })).join('') : html;
      });
      filhosAgora = filhoDe;
      // A seleção só guarda o que ainda está na tabela.
      [...selecao].forEach((id) => { if (!visiveis.some((o) => o.id === id)) selecao.delete(id); });
      const resolvidas = filtro.situacao === 'resolvidas';
      const antigas = resolvidas ? historico.filter(historicoNoRecorte).slice().sort((a, b) => a.haMin - b.haMin) : [];
      const n = visiveis.length + antigas.length;
      // As resolvidas listadas são só as recentes; o total do mês vem do balanço de 30 dias.
      const rodape = resolvidas && total > n
        ? `<p class="alr-nota">Mostrando as ${n} mais recentes de ${total.toLocaleString('pt-BR')} resolvidas nos últimos 30 dias. <a href="${GC.hashDe({ tela: 'relatorios', tipo: 'alertas', alvo: '-', periodo: '30' })}">Ver o relatório de alertas</a></p>`
        : '';
      if (!n) {
        const nome = filtro.situacao === 'novidades' ? 'novidades' : filtro.situacao === 'crise' ? 'da crise' : SITUACOES.find(([id]) => id === filtro.situacao)[1].toLowerCase();
        return `${faixaRecorrente()}<p class="painel-vazio">Nenhuma ocorrência ${resolvidas ? 'resolvida recentemente' : `em “${esc(nome)}”`} ${filtro.busca.trim() ? `com “${esc(filtro.busca.trim())}”` : 'neste recorte'}.</p>${rodape}`;
      }
      const marcadas = visiveis.filter((o) => selecao.has(o.id)).length;
      return `${faixaRecorrente()}<table class="sec-tabela alr-tabela${porGrupo ? ' agrupada' : ''}">${cabecalho(marcadas > 0 && marcadas === visiveis.length, marcadas > 0)}<tbody>
        ${linhas.join('')}${antigas.map(linhaHistorica).join('')}</tbody></table>
        <p class="au-rodape">${visiveis.length} ${visiveis.length === 1 ? 'ocorrência' : 'ocorrências'}${ordem.coluna ? ` · ordenadas por ${COLUNAS.find(([id]) => id === ordem.coluna)[1].toLowerCase()} <button type="button" class="alr-prioridade">voltar à prioridade</button>` : ' · por prioridade'}</p>${rodape}`;
    }

    // Barra das ações em lote: quantas selecionadas e quantas aceitam cada ação (o resto é ignorado, com aviso).
    function desenharLote() {
      const barra = el.querySelector('.alr-lote');
      const sel = visiveisAgora.filter((o) => selecao.has(o.id));
      barra.hidden = !sel.length;
      if (!sel.length) { barra.innerHTML = ''; return; }
      const podem = (acao) => sel.filter((o) => GC.acoesDisponiveis(o).includes(acao));
      const cobrar = podem('cobrar');
      const priorizar = podem('priorizar');
      barra.innerHTML = `
        <b>${sel.length} selecionada${sel.length > 1 ? 's' : ''}</b>
        <button type="button" class="btn-acao principal" data-lote="cobrar"${cobrar.length ? '' : ' disabled'} title="${cobrar.length ? 'Cobrar as secretarias destas ocorrências' : 'Nenhuma das selecionadas pode ser cobrada agora (prazo dentro do limite ou cobrança já aberta)'}">📣 Cobrar ${cobrar.length}</button>
        <button type="button" class="btn-acao" data-lote="priorizar"${priorizar.length ? '' : ' disabled'}>⚡ Priorizar ${priorizar.length}</button>
        <button type="button" class="btn-sec" data-lote="exportar"><i class="ti ti-download" aria-hidden="true"></i> Exportar seleção</button>
        <button type="button" class="alr-limpar-sel" data-lote="limpar">Limpar seleção</button>`;
      barra.querySelectorAll('[data-lote]').forEach((b) => {
        b.onclick = () => {
          const acao = b.dataset.lote;
          if (acao === 'limpar') { selecao.clear(); desenhar(); return; }
          if (acao === 'exportar') { aoExportar(sel, { selecao: true }); return; }
          const alvo = acao === 'cobrar' ? cobrar : priorizar;
          const secretarias = [...new Set(alvo.map((o) => (area(o.area) || {}).nome))];
          const pergunta = acao === 'cobrar'
            ? `Cobrar ${alvo.length === 1 ? '1 ocorrência' : `${alvo.length} ocorrências`} (${secretarias.join(', ')})? Cada secretaria recebe a cobrança com prazo de resposta.`
            : `Priorizar ${alvo.length === 1 ? '1 ocorrência' : `${alvo.length} ocorrências`}? O tempo que falta de cada prazo cai pela metade.`;
          // A janela do painel (js/desfazer-ui.js); sem ela (outra página), a do navegador.
          const pedir = GC.confirmar
            ? GC.confirmar({ titulo: acao === 'cobrar' ? 'Cobrar as secretarias?' : 'Priorizar as ocorrências?', texto: pergunta, sim: acao === 'cobrar' ? `Cobrar ${alvo.length}` : `Priorizar ${alvo.length}` })
            : Promise.resolve(window.confirm(pergunta));
          pedir.then((sim) => {
            if (!sim) return;
            const r = aoLote(alvo.map((o) => o.id), acao);
            const ignoradas = sel.length - r.feitas.length;
            const feito = acao === 'cobrar' ? `📣 ${r.feitas.length === 1 ? '1 cobrança enviada' : `${r.feitas.length} cobranças enviadas`}` : `⚡ ${r.feitas.length === 1 ? '1 ocorrência priorizada' : `${r.feitas.length} ocorrências priorizadas`}`;
            selecao.clear();
            mostrarAviso(`${feito}.${ignoradas ? ` ${ignoradas} ${ignoradas === 1 ? 'selecionada não aceitava' : 'selecionadas não aceitavam'} essa ação e ficaram como estavam.` : ''}`);
            desenhar();
          });
        };
      });
    }

    function desenhar() {
      if (!ultimo) return;
      const { ocorrencias, historico, regras: lista, desempenho, filtros } = ultimo;
      const f = filtros || {};
      // Números do topo: a lista da pasta com os filtros do mapa, sem a situação nem a busca (não zeram ao clicar num chip).
      const k = GC.resumoAlertas(ocorrencias.filter((o) => GC.noFiltroGlobal(o, f)));
      const d = desempenho((f.areas || []).length ? f.areas : null, (f.bairros || []).length ? f.bairros : null).resumo;
      // Por bairro não há tempo de resolução próprio: o número é o da cidade (ou da secretaria), e a nota diz isso.
      const notaTempo = (f.bairros || []).length ? 'sem dado por bairro: média geral' : `${d.resolvidas.toLocaleString('pt-BR')} resolvidas · ${d.noPrazoPct}% no prazo`;
      // Os três primeiros números são atalhos para o filtro de situação de mesmo nome.
      el.querySelector('.alr-kpis').innerHTML = [
        ['Abertas', k.abertas, '', '', 'abertas'], ['Prazo estourado', k.estouradas, k.estouradas ? 'ruim' : '', '', 'estourado'],
        ['Em campo', k.emCampo, '', '', 'em_campo'],
        ['Tempo médio de resolução · 30 dias', `${d.tempoMedioH.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`, '', notaTempo, null],
      ].map(([r, v, tom, nota, sit]) => {
        const corpo = `<small>${r}</small><b class="${tom}">${esc(String(v))}</b>${nota ? `<small class="alr-kpi-nota">${esc(nota)}</small>` : ''}`;
        if (!sit) return `<div class="rel-numero">${corpo}</div>`;
        const ativo = filtro.situacao === sit && !filtro.recorrente;
        return `<button type="button" class="rel-numero alr-kpi${ativo ? ' ativo' : ''}" data-kpi="${sit}" aria-pressed="${ativo}" title="Mostrar só: ${r.toLowerCase()}">${corpo}</button>`;
      }).join('');
      el.querySelectorAll('[data-kpi]').forEach((b) => { b.onclick = () => { filtro.situacao = b.dataset.kpi; filtro.recorrente = null; desenhar(); }; });
      // Os filtros do mapa valem aqui: um chip na linha dos filtros diz quais e leva à gaveta Filtros.
      const partes = GC.resumoFiltros ? GC.resumoFiltros(f) : [];
      grupos = GC.gruposRelacionados(ocorrencias);
      recorrentes = GC.casosRecorrentes(ocorrencias, { filtros: f, areas: ultimo.areas || null });
      recorrentePorChave = new Map(recorrentes.map((p) => [p.chave, p]));
      if (filtro.recorrente && !recorrentePorChave.has(filtro.recorrente)) filtro.recorrente = null;
      cartoesRecorrentes();
      novidades = GC.novidadesDesde(ocorrencias.filter((o) => GC.noFiltroGlobal(o, f)), ultimo.visita);
      if (filtro.situacao === 'novidades' && !novidades.size) filtro.situacao = 'abertas';
      // Da crise: o chip aparece só com gabinete de crise aberto e alguma ocorrência ligada a ele.
      const mc = ultimo.modoCrise;
      idsCrise = new Set(mc && mc.nivel !== 'nenhum' ? mc.ocorrenciaIds || [] : []);
      const nCrise = ocorrencias.filter((o) => o.status !== 'resolvida' && idsCrise.has(o.id) && GC.noFiltroGlobal(o, f)).length;
      if (filtro.situacao === 'crise' && !nCrise) filtro.situacao = 'abertas';
      const chipCrise = el.querySelector('.alr-chip-crise');
      chipCrise.hidden = !nCrise;
      chipCrise.querySelector('b').textContent = nCrise;
      const chipNov = el.querySelector('.alr-chip-novidades');
      chipNov.hidden = !novidades.size;
      chipNov.querySelector('b').textContent = novidades.size;
      const caixaNov = el.querySelector('.alr-novidades');
      const novas = [...novidades.values()].filter((x) => x.tipo === 'nova').length;
      caixaNov.hidden = !ultimo.visita;
      caixaNov.innerHTML = !ultimo.visita ? '' : novidades.size
        ? `<i class="ti ti-sparkles" aria-hidden="true"></i> <span>Desde a sua última visita (${esc(new Date(ultimo.visita).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}): <b>${novas} nova${novas === 1 ? '' : 's'}</b> e <b>${novidades.size - novas} com mudança</b>.</span>
          ${filtro.situacao === 'novidades' ? '' : '<button type="button" class="btn-sec" data-ver-novidades>Ver só as novidades</button>'}<button type="button" class="alr-limpar-filtros" data-marcar-visto>Marcar tudo como visto</button>`
        : '<i class="ti ti-circle-check" aria-hidden="true"></i> <span>Nada novo desde a sua última visita.</span>';
      const ver = caixaNov.querySelector('[data-ver-novidades]');
      if (ver) ver.onclick = () => { filtro.situacao = 'novidades'; desenhar(); };
      const visto = caixaNov.querySelector('[data-marcar-visto]');
      if (visto) visto.onclick = () => { if (filtro.situacao === 'novidades') filtro.situacao = 'abertas'; aoMarcarVisto && aoMarcarVisto(); };
      const global = el.querySelector('.alr-global');
      global.innerHTML = `<button type="button" class="alr-editar-filtros" title="${partes.length ? 'Os Filtros do mapa valem aqui. Clique para mudar.' : 'Sem filtros do mapa: a Central mostra a cidade inteira. Clique para filtrar.'}"><i class="ti ti-filter" aria-hidden="true"></i> ${partes.length ? `Filtros do mapa: <b>${esc(partes.join(' · '))}</b>` : 'Cidade inteira'}</button>${partes.length ? '<button type="button" class="alr-limpar-filtro" aria-label="Limpar os filtros do mapa" title="Limpar os filtros do mapa"><i class="ti ti-x" aria-hidden="true"></i></button>' : ''}`;
      global.classList.toggle('com-filtro', partes.length > 0);
      global.querySelector('.alr-editar-filtros').onclick = () => aoFiltros();
      const limpar = global.querySelector('.alr-limpar-filtro');
      if (limpar) limpar.onclick = () => aoLimparFiltros();
      el.querySelectorAll('[data-situacao]').forEach((b) => {
        const ativo = b.dataset.situacao === filtro.situacao;
        b.classList.toggle('ativo', ativo);
        b.setAttribute('aria-pressed', String(ativo));
      });
      const wrap = el.querySelector('.alr-tabela-wrap');
      wrap.innerHTML = tabela(ocorrencias, historico || [], d.resolvidas);
      wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
        tr.onclick = () => aoAbrir(tr.dataset.id);
        tr.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); aoAbrir(tr.dataset.id); } };
        tr.querySelectorAll('[data-acao]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); aoAgir(tr.dataset.id, b.dataset.acao); }; });
        const mapa = tr.querySelector('.alr-mapa');
        if (mapa) mapa.onclick = (e) => { e.stopPropagation(); aoVerNoMapa(tr.dataset.id); };
        const marca = tr.querySelector('[data-marcar]');
        marca.onclick = (e) => e.stopPropagation();
        marca.parentElement.onclick = (e) => e.stopPropagation();
        marca.onchange = () => {
          // Principal fechado: marcar leva junto os relacionados escondidos embaixo dele.
          const doGrupo = expandidos.has(tr.dataset.id) ? [] : [...filhosAgora].filter(([, pid]) => pid === tr.dataset.id).map(([fid]) => fid);
          [tr.dataset.id, ...doGrupo].forEach((id) => { if (marca.checked) selecao.add(id); else selecao.delete(id); });
          tr.classList.toggle('selecionada', marca.checked);
          atualizarMarcaTodas();
          desenharLote();
        };
      });
      wrap.querySelectorAll('[data-expandir]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          const id = b.dataset.expandir;
          if (expandidos.has(id)) expandidos.delete(id); else expandidos.add(id);
          desenhar();
          const de = el.querySelector(`[data-expandir="${id}"]`);
          if (de) de.focus();
        };
      });
      wrap.querySelectorAll('[data-recolher]').forEach((b) => {
        b.onclick = () => {
          const k = `${agrupar}|${b.dataset.recolher}`;
          if (recolhidos.has(k)) recolhidos.delete(k); else recolhidos.add(k);
          desenhar();
          const de = el.querySelector(`[data-recolher="${b.dataset.recolher}"]`);
          if (de) de.focus();
        };
      });
      wrap.querySelectorAll('[data-marcar-grupo]').forEach((c) => {
        c.indeterminate = c.hasAttribute('data-parcial');
        c.onchange = () => {
          const g = gruposAgora.find((x) => String(x.chave) === c.dataset.marcarGrupo);
          if (g) g.itens.forEach((o) => { if (c.checked) selecao.add(o.id); else selecao.delete(o.id); });
          desenhar();
        };
      });
      const limparRec = wrap.querySelector('[data-rec-limpar]');
      if (limparRec) limparRec.onclick = () => { filtro.recorrente = null; desenhar(); };
      wrap.querySelectorAll('[data-juntar]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          const r = aoJuntar(b.dataset.juntar, b.dataset.principal);
          mostrarAviso(r && r.ok ? 'Juntada à principal: ela fecha como duplicada e as pessoas afetadas somam na principal.' : 'Não foi possível juntar (só a secretaria da ocorrência junta, e as duas precisam ser da mesma pasta).', !(r && r.ok));
        };
      });
      const todas = wrap.querySelector('[data-marcar-todas]');
      if (todas) {
        todas.indeterminate = todas.hasAttribute('data-parcial');
        todas.onchange = () => {
          visiveisAgora.forEach((o) => { if (todas.checked) selecao.add(o.id); else selecao.delete(o.id); });
          desenhar();
        };
      }
      wrap.querySelectorAll('[data-ordenar]').forEach((b) => {
        b.onclick = () => {
          const col = b.dataset.ordenar;
          if (ordem.coluna === col) ordem.direcao = ordem.direcao === 'asc' ? 'desc' : 'asc';
          else { ordem.coluna = col; ordem.direcao = 'asc'; }
          desenhar();
          const de = el.querySelector(`[data-ordenar="${col}"]`);
          if (de) de.focus();
        };
      });
      const prioridade = wrap.querySelector('.alr-prioridade');
      if (prioridade) prioridade.onclick = () => { ordem.coluna = null; ordem.direcao = 'asc'; desenhar(); };
      desenharLote();
      // Atalho das regras: quantas estão pausadas (retendo alertas) no recorte do perfil.
      const pausadas = (lista || []).filter((r) => !r.rascunho && !r.ativa);
      const selo = el.querySelector('.alr-pausadas');
      selo.hidden = !pausadas.length;
      selo.textContent = pausadas.length ? `${pausadas.length} pausada${pausadas.length > 1 ? 's' : ''}` : '';
      el.querySelector('.alr-regras-link').title = pausadas.length
        ? `${pausadas.length} regra${pausadas.length > 1 ? 's' : ''} pausada${pausadas.length > 1 ? 's' : ''}: alertas novos dela${pausadas.length > 1 ? 's' : ''} ficam retidos`
        : 'O que faz cada alerta nascer: condições, gravidade, prazo e pausa';
    }

    function atualizarMarcaTodas() {
      const todas = el.querySelector('[data-marcar-todas]');
      if (!todas) return;
      const n = visiveisAgora.filter((o) => selecao.has(o.id)).length;
      todas.checked = n > 0 && n === visiveisAgora.length;
      todas.indeterminate = n > 0 && n < visiveisAgora.length;
    }

    function atualizar(estado) {
      ultimo = estado;
      GC.redesenharMantendo(el, ['.alr-tabela-wrap'], desenhar);
    }

    return { mostrar: atualizar, atualizar };
  };
})(window.GC = window.GC || {});
