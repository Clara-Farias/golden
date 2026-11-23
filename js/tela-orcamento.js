(function (GC) {
  // Tela "Orçamento e contratos" (#/orcamento[/<secretaria>]): o módulo de gestão orçamentária pedido no workshop de
  // 18/11. De cima para baixo, na ordem em que o gestor decide:
  //   1. "Precisa de você": contrato que vence sem licitação, recurso de fora que pode ser devolvido, pasta atrasada;
  //   2. quatro números (orçamento do ano, recursos de fora, contratos, licitações);
  //   3. execução por secretaria (empenhado, liquidado, pago contra o esperado pelo mês) e a receita própria;
  //   4. recursos federais, estaduais, emendas e convênios, com prazo de execução e de prestação de contas;
  //   5. contratos pelo vencimento, com a licitação que os substitui;
  //   6. licitações por fase.
  // O motor é js/orcamento-gestao.js. O setor vê só a própria pasta (ctx.areas). Botões: data-oc="<ação>".
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, cls) => GC.icone(nome, cls);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const R$ = (v) => `R$ ${GC.orcamentoGestao.fmtMi(v)}`;
  const dataBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id === 'assistencia' ? 'Assistência Social' : id || 'Prefeitura' }).nome;
  const quando = (d) => (d <= 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`);
  const SIT_CLS = { risco: 'critico', atencao: 'atencao', em_dia: 'ok', concluido: 'bom', homologada: 'bom', no_prazo: 'ok' };
  const COB_CLS = { coberto: 'ok', apertado: 'atencao', sem_licitacao: 'critico', nao_precisa: 'neutro' };
  const ABAS_FONTE = [['', 'Todas'], ['federal', 'Federais'], ['estadual', 'Estaduais'], ['emenda', 'Emendas'], ['convenio', 'Convênios']];

  GC.criarTelaOrcamento = function (el, { aoIr = () => {} } = {}) {
    let rota = { tela: 'orcamento' };
    let ctx = { areas: null };
    let fonte = '';
    let sel = null; // item em destaque (id), vindo de um clique em "Precisa de você"
    let detalhe = false; // visão resumida: recursos, contratos e licitações só a pedido

    const areasDaVez = () => {
      const minhas = ctx.areas && ctx.areas.length ? ctx.areas : null;
      if (rota.area && (!minhas || minhas.includes(rota.area))) return [rota.area];
      return minhas;
    };

    function barraExec(a, esperado) {
      // Três camadas na mesma barra (empenhado > liquidado > pago) e o traço do esperado pelo mês.
      return `<div class="oc-barra" role="img" aria-label="${esc(a.nome)}: empenhado ${a.empenhadoPct}%, liquidado ${a.liquidadoPct}%, pago ${a.pagoPct}%, esperado ${esperado}%">
          <span class="oc-b emp" style="width:${a.empenhadoPct}%"></span>
          <span class="oc-b liq" style="width:${a.liquidadoPct}%"></span>
          <span class="oc-b pag" style="width:${a.pagoPct}%"></span>
          <span class="oc-esperado" style="left:${esperado}%"></span>
        </div>`;
    }

    function render() {
      // Visão resumida (js/visao-simples.js): a tela para na execução; o detalhe abre num botão.
      const resumida = (GC.resumoTelas ? !GC.resumoTelas.visivel('orcamento', 'detalhe') : !!(GC.visaoSimples && GC.visaoSimples.ligada())) && !detalhe && !sel;
      const areas = areasDaVez();
      const r = GC.orcamentoGestao.resumo({ areas });
      const ex = r.execucao;
      const minhas = ctx.areas && ctx.areas.length ? ctx.areas : null;
      const titulo = areas && areas.length === 1 ? `Orçamento · ${nomeArea(areas[0])}` : 'Orçamento e contratos';

      // ---- filtro de pasta ----
      const opcoes = (minhas || ex.areas.map((a) => a.id).concat(GC.orcamentoGestao.execucao(null).areas.map((a) => a.id)))
        .filter((v, i, l) => l.indexOf(v) === i);
      const filtro = minhas && minhas.length === 1 ? '' : `<label class="oc-filtro">Pasta <select data-oc-filtro>
          <option value="">Todas as pastas</option>${opcoes.map((id) => `<option value="${esc(id)}"${rota.area === id ? ' selected' : ''}>${esc(nomeArea(id))}</option>`).join('')}</select></label>`;

      // ---- precisa de você ----
      const pend = r.pendencias.slice(0, 4);
      const ICONE_PEND = { contrato: 'file-alert', recurso: 'building-bank', execucao: 'chart-bar' };
      const pendencias = pend.length ? `<section class="oc-pend" aria-label="Precisa de você">
          <h3>${ic('alert-triangle')} Precisa de você <small>${plural(r.pendencias.length, 'ponto', 'pontos')}</small>
            <span class="oc-pend-acoes">${r.pendencias.some((p) => p.tipo !== 'execucao') && GC.orcamentoOficio ? `<button type="button" class="btn-sec oc-mini-bt" data-oc="oficio">${ic('file-text')} Ofícios com a Maia</button>` : ''}</span></h3>
          <div class="oc-pend-lista">${pend.map((p) => `<button type="button" class="oc-pend-item ${p.gravidade}" data-oc="ver" data-oc-id="${esc(p.id)}">
              <span class="oc-pend-ic">${ic(ICONE_PEND[p.tipo])}</span>
              <span><b>${esc(p.titulo)}</b><small>${esc(p.texto)}</small><em>${esc(nomeArea(p.area))}</em></span>
            </button>`).join('')}</div>
        </section>` : `<section class="oc-pend oc-pend-ok">${ic('circle-check')} Nada urgente no orçamento deste recorte: contratos cobertos e recursos de fora no ritmo.</section>`;

      // ---- números ----
      const kpi = (rot, n, texto, cls = '', alvo = '') => `<a class="oc-kpi ${cls}" href="#${alvo}" data-oc="rolar" data-oc-alvo="${alvo}"><small>${rot}</small><b>${n}</b><span>${texto}</span></a>`;
      const kpis = `<div class="oc-kpis">
          ${kpi('Orçamento 2026', R$(ex.previstoMi), `pago ${ex.pagoPct}% · esperado ${ex.esperadoPct}% até o mês`, ex.pagoPct < ex.esperadoPct - 10 ? 'atencao' : '', 'oc-exec')}
          ${kpi('Recursos de fora', R$(r.externo.totalMi), r.externo.emRiscoMi ? `${R$(r.externo.emRiscoMi)} podem ser devolvidos` : 'nenhum em risco de devolução', r.externo.emRiscoMi ? 'critico' : 'bom', 'oc-recursos')}
          ${kpi('Contratos vencendo', r.vencendo90.length, r.semCobertura.length ? `${plural(r.semCobertura.length, 'sem licitação a tempo', 'sem licitação a tempo')} · próximos 90 dias` : 'nos próximos 90 dias, todos cobertos', r.semCobertura.length ? 'critico' : '', 'oc-contratos')}
          ${kpi('Licitações', r.licitacoes.filter((l) => l.fase < 4).length, r.licitacoesRisco.length ? `${plural(r.licitacoesRisco.length, 'pode atrasar', 'podem atrasar')} contrato ou recurso` : 'em andamento, no prazo', r.licitacoesRisco.length ? 'atencao' : '', 'oc-licitacoes')}
        </div>`;

      // ---- execução por secretaria ----
      const linhasExec = ex.areas.slice().sort((a, b) => b.atrasoPp - a.atrasoPp || b.previstoMi - a.previstoMi).map((a) => `<li class="oc-exec-linha${a.atrasoPp >= GC.orcamentoGestao.limiteAtraso() ? ' atrasada' : ''}${sel === a.id ? ' sel' : ''}" id="oc-${esc(a.id)}">
          <span class="oc-exec-nome"><b>${esc(a.nome)}</b><small>${R$(a.previstoMi)}</small></span>
          ${barraExec(a, ex.esperadoPct)}
          <span class="oc-exec-num"><b>${a.pagoPct}%</b><small>${a.atrasoPp >= GC.orcamentoGestao.limiteAtraso() ? `${a.atrasoPp} pts atrás` : 'pago'}</small></span>
        </li>`).join('');
      const arr = r.arrecadacao;
      const receita = arr && !minhas ? `<section class="rel-cartao oc-receita">
          <h3>${ic('coins')} Receita própria <small>tributos do município</small></h3>
          <div class="oc-receita-topo"><b>${arr.anoPct.toLocaleString('pt-BR')}%</b><span>da meta do ano · ${R$(arr.anoMi)} de ${R$(arr.metaAnoMi)}</span></div>
          <ul class="oc-trib">${arr.tributos.map((t) => `<li><span>${esc(t.nome)}</span><span class="oc-mini"><span style="width:${Math.min(100, t.anoPct)}%"></span></span><b>${t.anoPct.toLocaleString('pt-BR')}%</b></li>`).join('')}</ul>
          <p class="oc-nota">${ic('info-circle')} Inadimplência do IPTU: <b>${String(arr.inadimplenciaIptuPct).replace('.', ',')}%</b>. Um Refis no Portal do Cidadão pode trazer parte de volta.</p>
        </section>` : '';
      const execucao = `<div class="oc-colunas${receita ? '' : ' uma'}">
          <section class="rel-cartao oc-exec" id="oc-exec">
            <h3>${ic('chart-bar')} Execução por secretaria <small>do orçamento do ano · o traço laranja é onde o pago deveria estar agora (${ex.esperadoPct}%, já contando o tempo entre empenhar e pagar)</small></h3>
            <p class="oc-legenda" aria-hidden="true"><span class="oc-l emp"></span>empenhado <span class="oc-l liq"></span>liquidado <span class="oc-l pag"></span>pago</p>
            <ul class="oc-exec-lista">${linhasExec}</ul>
            <p class="oc-total">Total: empenhado <b>${ex.empenhadoPct}%</b> · liquidado <b>${ex.liquidadoPct}%</b> · pago <b>${ex.pagoPct}%</b> de ${R$(ex.previstoMi)}</p>
          </section>
          ${receita}
        </div>`;

      // ---- recursos de fora ----
      const recs = r.recursos.filter((x) => !fonte || x.fonte === fonte);
      const abas = ABAS_FONTE.filter(([id]) => !id || r.recursos.some((x) => x.fonte === id)).map(([id, nome]) => {
        const n = id ? r.recursos.filter((x) => x.fonte === id).length : r.recursos.length;
        return `<button type="button" class="oc-aba${fonte === id ? ' ativa' : ''}" data-oc="fonte" data-oc-fonte="${id}" aria-pressed="${fonte === id}">${nome} <small>${n}</small></button>`;
      }).join('');
      const linhaRecurso = (x) => `<tr class="${sel === x.id ? 'sel' : ''}" id="oc-${esc(x.id)}">
          <td><span class="oc-fonte ${x.fonte}">${ic(GC.FONTES_RECURSO[x.fonte].icone)} ${esc(GC.FONTES_RECURSO[x.fonte].curto)}</span></td>
          <td><b>${esc(x.nome)}</b><small>${esc(x.orgao)} · ${esc(nomeArea(x.area))}</small>${x.meta ? `<button type="button" class="oc-meta" data-oc="meta" data-oc-area="${esc(x.area)}">${ic('target-arrow')} ${esc(x.meta)}</button>` : ''}</td>
          <td class="num">${R$(x.valorMi)}<small>recebido ${x.recebidoPct}%</small></td>
          <td><span class="oc-mini larga"><span style="width:${x.executadoPct}%"></span></span><small>${x.executadoPct}% executado · saldo ${R$(x.saldoMi)}</small></td>
          <td><b>${dataBr(x.prazo)}</b><small>${quando(x.prazoDias)} · contas até ${dataBr(x.contas)}</small></td>
          <td><span class="oc-selo ${SIT_CLS[x.situacao]}">${esc(GC.SITUACAO_RECURSO[x.situacao])}</span>${x.situacao === 'risco' ? `<button type="button" class="oc-maia" data-maia="O que fazer para não devolver o recurso de ${esc(x.nome)}?">${ic('sparkles')} Plano com a Maia</button>` : ''}${x.situacao === 'risco' || x.situacao === 'atencao' ? `<button type="button" class="oc-maia oc-oficio-bt" data-oc="oficio" data-oc-id="${esc(x.id)}">${ic('file-text')} Ofício com a Maia</button>` : ''}</td>
        </tr>`;
      const recursos = `<section class="rel-cartao oc-recursos" id="oc-recursos">
          <div class="oc-cab"><h3>${ic('building-bank')} Recursos de fora do tesouro <small>transferências, emendas e convênios · ${R$(r.externo.totalMi)}, ${R$(r.externo.executadoMi)} executados</small></h3>
          <div class="oc-abas" role="group" aria-label="Fonte do recurso">${abas}</div></div>
          ${recs.length ? `<div class="oc-tabela-caixa"><table class="oc-tabela"><thead><tr><th>Fonte</th><th>Recurso</th><th class="num">Valor</th><th>Execução</th><th>Prazo para executar</th><th>Situação</th></tr></thead>
          <tbody>${recs.map(linhaRecurso).join('')}</tbody></table></div>` : `<p class="oc-vazio">Nenhum recurso desta fonte neste recorte.</p>`}
        </section>`;

      // ---- contratos ----
      const corCob = (c) => (c.cobertura === 'sem_licitacao' && c.venceDias > 60 ? 'atencao' : COB_CLS[c.cobertura]);
      const linhaContrato = (c) => `<li class="oc-ct ${corCob(c)}${sel === c.id ? ' sel' : ''}" id="oc-${esc(c.id)}">
          <span class="oc-ct-dias"><b>${c.venceDias}</b><small>dias</small></span>
          <span class="oc-ct-txt"><b>${esc(c.nome)}</b><small>${esc(c.empresa)} · ${esc(nomeArea(c.area))} · ${R$(c.valorMi)}/ano · vence ${dataBr(c.vence)}</small>
            ${c.foraSla ? `<em class="oc-sla">${ic('alert-circle')} SLA ${c.slaPct}% (meta ${c.metaSlaPct}%)${c.multaMil ? ` · multas de R$ ${c.multaMil} mil` : ''}</em>` : ''}</span>
          <span class="oc-ct-fim"><span class="oc-selo ${corCob(c)}">${esc(GC.COBERTURA_CONTRATO[c.cobertura])}</span>${c.cobertura === 'sem_licitacao' || c.cobertura === 'apertado' ? `<button type="button" class="oc-maia oc-oficio-bt" data-oc="oficio" data-oc-id="${esc(c.id)}">${ic('file-text')} Memorando com a Maia</button>` : ''}</span>
        </li>`;
      const contratos = `<section class="rel-cartao oc-contratos" id="oc-contratos">
          <h3>${ic('file-certificate')} Contratos vigentes <small>pelo vencimento · ${plural(r.vencendo90.length, 'vence', 'vencem')} em 90 dias</small></h3>
          <ul class="oc-ct-lista">${r.contratos.map(linhaContrato).join('')}</ul>
        </section>`;

      // ---- licitações por fase ----
      const fases = GC.FASES_LICITACAO.map((nome, i) => {
        const ls = r.licitacoes.filter((l) => l.fase === i);
        return `<div class="oc-fase"><h4>${esc(nome)} <small>${ls.length}</small></h4>
          ${ls.map((l) => `<div class="oc-lic ${SIT_CLS[l.situacao]}${sel === l.id ? ' sel' : ''}" id="oc-${esc(l.id)}">
              <b>${esc(l.objeto)}</b>
              <small>${esc(l.modalidade)} · ${R$(l.valorMi)} · ${esc(nomeArea(l.area))}</small>
              ${l.fase < 4 ? `<small>homologação prevista ${dataBr(l.conclusao)}</small>` : ''}
              ${l.contrato ? `<em>renova: ${esc(l.contrato.nome)} (vence em ${l.contrato.venceDias} dias)</em>` : ''}
              ${l.recursoNome ? `<em>usa: ${esc(l.recursoNome)}</em>` : ''}
              ${l.situacao === 'risco' ? `<span class="oc-selo critico">Não termina a tempo</span>` : ''}
            </div>`).join('') || '<p class="oc-vazio">nenhuma</p>'}
        </div>`;
      }).join('');
      const licitacoes = `<section class="rel-cartao oc-licitacoes" id="oc-licitacoes">
          <h3>${ic('gavel')} Licitações em andamento <small>por fase · a borda vermelha é a que não termina antes do contrato ou do prazo do recurso</small></h3>
          <div class="oc-fases">${fases}</div>
        </section>`;

      el.innerHTML = `
        <header class="sec-topo oc-topo">
          <div>
            <h2>${ic('coin')} ${esc(titulo)}</h2>
            <p>Quanto a prefeitura tem, quanto já gastou, o que entra de fora e quais contratos e licitações vencem.</p>
            <details class="en-ajuda"><summary>${ic('info-circle')} De onde vêm estes dados</summary>
              <p>Execução: sistema de contabilidade (dotação, empenho, liquidação e pagamento do ano). Recursos de fora: Transferegov, FNS e FNDE, com o prazo de execução de cada termo. Contratos e licitações: sistema de compras. Os números da demonstração são simulados e acompanham o tamanho da cidade.</p>
            </details>
          </div>
          <span class="oc-acoes">${filtro}${GC.orcamentoOficio ? `<button type="button" class="btn-sec" data-oc="regras" title="Os limites que decidem o que vira alerta">${ic('bell-cog')} Regras de alerta</button>` : ''}<button type="button" class="btn-sec btn-maia-tela" data-maia="Como está o orçamento da prefeitura?"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia</button></span>
        </header>
        ${pendencias}
        ${kpis}
        ${execucao}
        ${resumida ? `<button type="button" class="btn-sec oc-detalhe" data-oc="detalhe">${ic('list-details')} Ver recursos de fora, contratos e licitações</button>` : `${recursos}
        ${contratos}
        ${licitacoes}`}`;

      if (sel) {
        const alvo = el.querySelector(`#oc-${CSS.escape(sel)}`);
        if (alvo) alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-oc]');
      if (!b || !el.contains(b)) return;
      const acao = b.dataset.oc;
      if (acao === 'fonte') { fonte = b.dataset.ocFonte; render(); return; }
      if (acao === 'ver') {
        sel = b.dataset.ocId;
        // Recurso escondido pela aba de fonte: volta para "Todas".
        fonte = '';
        render();
        return;
      }
      if (acao === 'rolar') {
        e.preventDefault();
        const alvo = el.querySelector(`#${b.dataset.ocAlvo}`);
        if (alvo) alvo.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      if (acao === 'meta') aoIr({ tela: 'metas', area: b.dataset.ocArea });
      if (acao === 'detalhe') { detalhe = true; render(); }
      // Regras de alerta e ofício com a Maia (js/orcamento-oficio.js).
      if (acao === 'regras' && GC.orcamentoOficio) GC.orcamentoOficio.abrirRegras({ aoSalvar: render });
      if (acao === 'oficio' && GC.orcamentoOficio) {
        GC.orcamentoOficio.abrir(b.dataset.ocId || null, {
          // "Ajustar com a Maia": manda o pedido pela porta de sempre das telas (data-maia, js/app/maia-telas.js).
          aoMaia: (txt) => { const t = document.createElement('button'); t.type = 'button'; t.hidden = true; t.dataset.maia = txt; el.appendChild(t); t.click(); t.remove(); },
        });
      }
    });
    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-oc-filtro]');
      if (!s) return;
      sel = null;
      aoIr({ tela: 'orcamento', area: s.value || null });
    });

    return {
      mostrar(r, c = {}) { rota = r || { tela: 'orcamento' }; ctx = Object.assign({ areas: null }, c); sel = null; render(); },
      atualizar() { render(); },
    };
  };
})(window.GC = window.GC || {});
