(function (GC) {
  // "Resumo de hoje" (visão resumida, js/visao-simples.js): o cartão da doca que abre sozinho sobre o mapa e junta,
  // num lugar só, o que a pessoa precisa saber do dia: a manchete (montada dos dados), quatro números, as ocorrências
  // que pedem decisão (com Cobrar e Ver no mapa), o plano de governo por eixo e o orçamento.
  // Mesmo cartão de vidro e mesmo cabeçalho do Resumo do dia e de "Desde a sua última visita" (css/resumo-dia.css,
  // css/doca.css). Só monta na visão resumida; a doca (js/app/doca.js) cuida de um painel aberto por vez.
  // cb: aoAlternar(aberto), aoAgir(id, tipo), aoVerNoMapa(id), aoIr(rota), aoPerguntar(texto).
  const esc = (t) => GC.escaparHtml(t);
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const nomeSec = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { secretaria: { nome: 'Prefeitura' } }).secretaria.nome;
  const curtoSec = (id) => nomeSec(id).replace(/^Secretaria (de |da |do )?/, '');
  const bairroNome = (id) => ((GC.data.bairros || []).find((b) => b.id === id) || {}).nome || '';
  const R$ = (v) => `R$ ${GC.orcamentoGestao.fmtMi(v)}`;
  const SEV = { critica: ['Crítica', 'critico'], alta: ['Alta', 'atencao'], media: ['Média', 'info'], baixa: ['Baixa', 'info'] };
  function tempo(min) {
    const m = Math.max(1, Math.round(Math.abs(min)));
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} h` : plural(Math.round(h / 24), 'dia', 'dias');
  }

  // Os dados do cartão (puro: também serve à Maia e aos testes).
  // areas: a pasta do perfil (null = cidade toda). caixa: a caixa de entrada do setor (js/caixa-entrada.js), que é
  // o "precisa de você" de quem responde: cobranças, demandas, pedidos de ajuda. tarefas: as demandas da pasta.
  GC.resumoEssencial = function ({ store, metas = [], orcamento = null, agora = Date.now(), areas = null, caixa = null, tarefas = [] }) {
    const k = store.kpis(areas);
    if (areas && store.desempenho) { const d = store.desempenho(null, areas); if (d && d.resumo) k.noPrazoPct = d.resumo.noPrazoPct; }
    const todas = store.atencao(areas).todas;
    const daPasta = !!(areas && areas.length);
    const conta = (s) => metas.filter((m) => m.status === s).length;
    const porPasta = {};
    store.ocorrencias().filter(GC.estourada).forEach((o) => { porPasta[o.area] = (porPasta[o.area] || 0) + 1; });
    const pastas = Object.entries(porPasta).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => curtoSec(id));
    const contrato = orcamento && orcamento.pendencias.find((p) => p.tipo === 'contrato' && p.gravidade === 'critica');
    const abertas = store.ocorrencias(areas).length;
    // Demandas da pasta passadas à equipe (js/tarefas.js): em aberto e atrasadas.
    const dem = tarefas.filter((t) => (!daPasta || areas.includes(t.area)) && !['feita', 'cancelada'].includes(t.status));
    const demAtrasadas = dem.filter((t) => t.prazoEm < agora).length;
    const pt = caixa ? caixa.porTipo || {} : {};
    const manchete = daPasta
      ? `${curtoSec(areas[0])}: ${plural(abertas, 'ocorrência aberta', 'ocorrências abertas')}, ${k.estouradas} com prazo estourado`
      : k.criticas ? `${plural(k.criticas, 'ocorrência crítica', 'ocorrências críticas')}, ${k.estouradas} com prazo estourado` : 'Nenhuma ocorrência crítica agora';
    const subPasta = [
      pt.cobranca ? `${plural(pt.cobranca, 'cobrança do prefeito', 'cobranças do prefeito')} para responder.` : 'Nenhuma cobrança do prefeito pendente.',
      dem.length ? `${plural(dem.length, 'demanda da equipe em aberto', 'demandas da equipe em aberto')}${demAtrasadas ? `, ${demAtrasadas} ${demAtrasadas === 1 ? 'atrasada' : 'atrasadas'}` : ''}.` : '',
      conta('critico') ? `${plural(conta('critico'), 'compromisso do plano crítico', 'compromissos do plano críticos')}.` : '',
    ].filter(Boolean).join(' ');
    const sub = daPasta ? subPasta : [
      pastas.length ? `${pastas.join(' e ')} ${pastas.length > 1 ? 'concentram' : 'concentra'} os atrasos.` : 'Atendimentos dentro do prazo.',
      conta('critico') ? `${plural(conta('critico'), 'compromisso do plano crítico', 'compromissos do plano críticos')}.` : '',
      contrato ? (() => { const [nome, resto] = contrato.titulo.split(': '); return `Contrato de ${nome.charAt(0).toLowerCase()}${nome.slice(1)} ${resto} sem licitação.`; })() : '',
    ].filter(Boolean).join(' ');
    const eixos = (GC.EIXOS_GOVERNO || []).map((e) => {
      const ms = metas.filter((m) => e.areas.includes(m.area));
      if (!ms.length) return null;
      const media = (f) => Math.round(ms.reduce((s, m) => s + f(m), 0) / ms.length);
      return { id: e.id, nome: e.nome, feito: media((m) => m.progressoPct), esperado: media((m) => (m.status === 'concluida' ? 100 : m.esperadoPct)), criticos: ms.filter((m) => m.status === 'critico').length };
    }).filter(Boolean);
    // Na pasta, o que pede ação vem da caixa de entrada (com o passo a dar); na cidade, das ocorrências fora do normal.
    const itensCaixa = daPasta && caixa ? caixa.itens : null;
    return { k, todas, daPasta, abertas, itensCaixa, demandas: { abertas: dem.length, atrasadas: demAtrasadas }, decisoes: todas.slice(0, 3), metas: { total: metas.length, concluidas: conta('concluida'), criticas: conta('critico') }, eixos, orcamento, manchete, sub, agora };
  };

  GC.criarResumoEssencial = function (el, cb, { botao = null } = {}) {
    let recolhido = true;
    let ultimo = null;
    let confirmando = null;
    let aviso = null;

    function linhaDecisao(o) {
      const [sev, tom] = SEV[o.severidade] || SEV.media;
      const est = GC.estourada(o);
      const prazo = o.status === 'em_campo' ? 'equipe no local' : est ? `prazo estourado há ${tempo(GC.prazoRestanteMin(o))}` : `prazo em ${tempo(GC.prazoRestanteMin(o))}`;
      const podeCobrar = GC.acoesDisponiveis(o).includes('cobrar');
      if (confirmando === o.id) {
        return `<li><div class="rs-item re-dec tom-${tom} re-conf"><span><b>Cobrar a ${esc(nomeSec(o.area))}?</b><small>${esc(o.titulo)} · a secretaria responde com previsão</small></span>
          <span class="re-bt"><button type="button" class="btn-acao principal" data-re="sim" data-id="${esc(o.id)}">Confirmar</button><button type="button" class="btn-sec" data-re="nao">Cancelar</button></span></div></li>`;
      }
      return `<li><div class="rs-item re-dec tom-${tom}">
          <span><b>${esc(o.titulo)}</b><small>${sev} · ${esc(bairroNome(o.bairroId))} · ${esc(curtoSec(o.area))} · <em class="${est ? 're-ruim' : ''}">${esc(prazo)}</em></small></span>
          <span class="re-bt">${podeCobrar ? `<button type="button" class="btn-sec" data-re="cobrar" data-id="${esc(o.id)}">${ic('speakerphone')} Cobrar</button>` : ''}
          <button type="button" class="btn-sec" data-re="mapa" data-id="${esc(o.id)}" title="Ver no mapa">${ic('map-pin')} Ver</button></span>
        </div></li>`;
    }
    // Item da caixa de entrada do setor: o que é, o passo e um botão que leva até lá.
    let caixaAtual = [];
    function linhaCaixa(it, i) {
      const tipo = (GC.TIPOS_CAIXA || {})[it.tipo] || { rotulo: it.tipo, passo: 'Abrir' };
      const tom = ['cobranca', 'explicacao', 'estourada', 'tarefa_atrasada', 'acao_cobrada', 'tarefa_cobrada'].includes(it.tipo) ? 'critico' : it.severidade === 'critica' ? 'critico' : 'atencao';
      return `<li><div class="rs-item re-dec tom-${tom}">
          <span><b>${esc(it.titulo || tipo.rotulo)}</b><small>${esc(tipo.rotulo)}${it.texto ? ` · ${esc(it.texto)}` : ''}</small></span>
          <span class="re-bt"><button type="button" class="btn-sec" data-re="caixa" data-i="${i}">${esc(tipo.passo)} ${ic('arrow-right')}</button></span>
        </div></li>`;
    }
    const barra = (feito, esperado, tom) => `<span class="re-barra tom-${tom}" role="img" aria-label="${feito}% feito, esperado ${esperado}%"><i style="width:${Math.min(100, feito)}%"></i><em style="left:${Math.min(99.5, esperado)}%"></em></span>`;

    function corpo(r) {
      const d = new Date(r.agora);
      const quando = `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const k = r.k;
      const ex = r.orcamento ? r.orcamento.execucao : null;
      const num = (n, rot, tom, alvo) => `<button type="button" class="rs-num re-num tom-${tom}" ${alvo ? `data-re="ir" data-tela="${alvo}"` : 'disabled'}><b>${n}</b><small>${rot}</small></button>`;
      return `<header class="rd-cab"><h2>${ic('sun')} Resumo de hoje <small>${esc(quando)}</small></h2>
          <button type="button" class="rd-x" data-re="recolher" aria-label="Ocultar o resumo" title="Ocultar o resumo">−</button></header>${GC.grafismo ? GC.grafismo.regua(160, 6, 12) : ''}
        <div class="re-manchete"><b>${esc(r.manchete)}</b><span>${esc(r.sub)}</span></div>
        <div class="rd-destaques rs-numeros dv-numeros">
          ${r.daPasta ? num(r.abertas, `ocorrências abertas · ${k.estouradas} estouradas`, k.estouradas ? 'critico' : 'ok', null) : num(k.criticas, 'ocorrências críticas', k.estouradas ? 'critico' : 'ok', null)}
          ${num(`${k.noPrazoPct}%`, 'no prazo (30 dias)', k.noPrazoPct < 80 ? 'atencao' : 'ok', null)}
          ${num(`${r.metas.concluidas}/${r.metas.total}`, 'compromissos concluídos', r.metas.criticas ? 'atencao' : 'ok', 'metas')}
          ${ex ? num(`${ex.pagoPct}%`, 'do orçamento pago', ex.pagoPct < ex.esperadoPct - 10 ? 'atencao' : 'ok', 'orcamento') : ''}
        </div>
        ${r.itensCaixa ? `<div class="rd-sub"><h3>${ic('inbox')} Para fazer hoje</h3>${r.itensCaixa.length > 3 ? `<button type="button" class="rd-link" data-re="tarefas">ver tudo →</button>` : ''}</div>
          ${(caixaAtual = r.itensCaixa.slice(0, 3)).length ? `<ul class="rs-lista">${caixaAtual.map(linhaCaixa).join('')}</ul>` : `<p class="dv-vazio">${ic('circle-check')} Nada pendente para você agora.</p>`}`
        : `<div class="rd-sub"><h3>${ic('alert-triangle')} Precisa da sua decisão</h3>${r.todas.length > r.decisoes.length ? `<button type="button" class="rd-link" data-re="alertas">ver as ${r.todas.length} →</button>` : ''}</div>
        ${aviso ? `<p class="re-aviso ${aviso.tipo}" role="status">${ic(aviso.tipo === 'ok' ? 'circle-check' : 'alert-circle')} ${esc(aviso.texto)}</p>` : ''}
        ${r.decisoes.length ? `<ul class="rs-lista">${r.decisoes.map(linhaDecisao).join('')}</ul>` : `<p class="dv-vazio">${ic('circle-check')} Nada esperando a sua decisão agora.</p>`}`}
        <div class="re-colunas">
          <div>
            <div class="rd-sub"><h3>${ic('target-arrow')} Plano de governo</h3><button type="button" class="rd-link" data-re="ir" data-tela="metas">abrir →</button></div>
            <ul class="re-eixos">${r.eixos.map((x) => `<li><span><b>${esc(x.nome)}</b><small>${x.feito}% · esperado ${x.esperado}%${x.criticos ? ` · <em class="re-ruim">${plural(x.criticos, 'crítico', 'críticos')}</em>` : ''}</small></span>${barra(x.feito, x.esperado, x.feito < x.esperado - 25 ? 'critico' : x.feito < x.esperado - 10 ? 'atencao' : 'ok')}</li>`).join('')}</ul>
          </div>
          ${r.orcamento ? `<div>
            <div class="rd-sub"><h3>${ic('coin')} Orçamento</h3><button type="button" class="rd-link" data-re="ir" data-tela="orcamento">abrir →</button></div>
            <ul class="re-fatos">
              <li>${barra(ex.pagoPct, ex.esperadoPct, ex.pagoPct < ex.esperadoPct - 10 ? 'atencao' : 'ok')}<small><b>${ex.pagoPct}%</b> pago de ${R$(ex.previstoMi)} · esperado ${ex.esperadoPct}%</small></li>
              ${r.orcamento.externo.emRiscoMi ? `<li class="re-ruim-linha">${ic('building-bank')}<small><b>${R$(r.orcamento.externo.emRiscoMi)}</b> de recursos federais e emendas com risco de devolução</small></li>` : ''}
              ${r.orcamento.semCobertura.length ? `<li class="re-ruim-linha">${ic('file-alert')}<small><b>${plural(r.orcamento.semCobertura.length, 'contrato vence', 'contratos vencem')}</b> em 90 dias sem licitação a tempo</small></li>` : ''}
            </ul>
          </div>` : ''}
        </div>
        <div class="re-pe"><button type="button" class="btn-sec btn-maia-tela" data-re="maia" data-texto="O que fazer primeiro?"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia: o que fazer primeiro?</button></div>`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-re]');
      if (!b) return;
      const a = b.dataset.re;
      if (a === 'recolher') return alternar(true);
      if (a === 'cobrar') { confirmando = b.dataset.id; aviso = null; return desenhar(); }
      if (a === 'nao') { confirmando = null; return desenhar(); }
      if (a === 'sim') {
        const o = GC.storeAtual.buscar(b.dataset.id);
        const ok = cb.aoAgir(b.dataset.id, 'cobrar');
        confirmando = null;
        aviso = ok !== false ? { tipo: 'ok', texto: `Cobrança enviada à ${nomeSec(o.area)}. A resposta chega na Maia.` } : { tipo: 'erro', texto: 'Não foi possível cobrar: a ocorrência já foi cobrada ou resolvida.' };
        return cb.aoAtualizar ? cb.aoAtualizar() : desenhar();
      }
      if (a === 'mapa') return cb.aoVerNoMapa(b.dataset.id);
      if (a === 'ir') return cb.aoIr({ tela: b.dataset.tela, area: null });
      if (a === 'alertas') return cb.aoAlertas();
      if (a === 'caixa') return cb.aoItemCaixa && cb.aoItemCaixa(caixaAtual[Number(b.dataset.i)]);
      if (a === 'tarefas') return cb.aoIr({ tela: 'tarefas', id: null });
      if (a === 'maia') return cb.aoPerguntar(b.dataset.texto);
    });

    let ultimoHtml = '';
    function desenhar() {
      if (recolhido || !ultimo) return;
      const html = corpo(ultimo);
      if (html === ultimoHtml) return; // o painel redesenha a cada passo da cidade: sem mudança, não mexe (foco e rolagem)
      ultimoHtml = html;
      el.innerHTML = html;
    }
    function alternar(valor = !recolhido) {
      if (valor === recolhido) return;
      recolhido = valor;
      el.hidden = recolhido;
      if (botao) { botao.setAttribute('aria-expanded', String(!recolhido)); botao.classList.toggle('ativo', !recolhido); }
      if (cb.aoAlternar) cb.aoAlternar(!recolhido);
      ultimoHtml = '';
      desenhar();
    }
    if (botao) botao.addEventListener('click', () => alternar());
    function atualizar(r) { ultimo = r; desenhar(); }
    return { atualizar, alternar, aberto: () => !recolhido };
  };
})(window.GC = window.GC || {});
