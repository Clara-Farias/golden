(function (GC) {
  // Bloco "Atendimento · 30 dias" da visão geral das secretarias: números do mês, ranking
  // ordenável das secretarias, o que está ruim (clicável) e resolvidas recentemente.
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const horas = (h) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  const AMOSTRA_PEQUENA = 20; // abaixo disso, variação em número e não em %

  // Variação contra o mês anterior; "melhor" diz para que lado é bom.
  function variacaoTexto(atual, anterior, unidade, melhor) {
    const d = atual - anterior;
    if (Math.abs(d) < 0.05) return '<i class="igual">= mês anterior</i>';
    const subiu = d > 0;
    const bom = melhor === 'mais' ? subiu : !subiu;
    let valor;
    if (unidade === '%' && anterior < AMOSTRA_PEQUENA) valor = `${Math.abs(Math.round(d))}`;
    else if (unidade === '%') valor = `${Math.round(Math.abs((d / anterior) * 100))}%`;
    else if (unidade === 'p.p.') valor = `${Math.abs(Math.round(d))} p.p.`;
    else valor = horas(Math.abs(d));
    return `<i class="${bom ? 'melhor' : 'pior'}" title="Mês anterior: ${unidade === 'h' ? horas(anterior) : `${anterior}${unidade === 'p.p.' ? '%' : ''}`}">${subiu ? '▲' : '▼'} ${valor}</i>`;
  }

  GC.variacaoTexto = variacaoTexto;

  // Minigráfico dos 12 meses do indicador principal da secretaria (SVG inline).
  function sparkline(area) {
    const s = (GC.data.secretarias || {})[area];
    if (!s || !s.serie) return '';
    const v = s.serie.meses;
    const min = Math.min(...v, s.serie.meta);
    const max = Math.max(...v, s.serie.meta);
    const W = 64; const H = 18;
    const y = (n) => (max === min ? H / 2 : H - 2 - ((n - min) / (max - min)) * (H - 4));
    const pts = v.map((n, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.serie.rotulo)}: 12 meses">
      <line x1="0" x2="${W}" y1="${y(s.serie.meta).toFixed(1)}" y2="${y(s.serie.meta).toFixed(1)}" class="spark-meta"/>
      <polyline points="${pts}" class="spark-linha"/><circle cx="${W}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2" class="spark-fim"/></svg>`;
  }

  function metasEmDia(id) {
    const m = ((GC.data.secretarias || {})[id] || {}).metas || [];
    return {
      ok: m.filter((x) => x.status === 'em_dia' || x.status === 'concluida').length,
      total: m.length,
      critico: m.some((x) => x.status === 'critico'),
      status: m.map((x) => x.status),
    };
  }
  const STATUS_META = { concluida: 'concluído', em_dia: 'em dia', atencao: 'atenção', critico: 'crítico' };

  const COLUNAS = [
    { id: 'nome', rotulo: 'Secretaria', valor: (s) => area(s.area).nome, texto: true },
    { id: 'abertas', rotulo: 'Abertas', titulo: 'Ocorrências abertas agora', valor: (s) => s.abertas },
    { id: 'atrasadas', rotulo: 'Atrasadas', titulo: 'Com prazo estourado agora', valor: (s) => s.atrasadas },
    { id: 'resolvidas', rotulo: 'Resolvidas', titulo: 'Resolvidas em 30 dias', valor: (s) => s.resolvidas },
    { id: 'noPrazo', rotulo: 'No prazo', titulo: 'Resolvidas dentro do prazo para resolver (30 dias)', valor: (s) => s.noPrazoPct, cidade: true },
    // Equipe em campo dentro do prazo (js/prazos.js, fase 3). Sem meta própria: a meta é a do "no prazo".
    { id: 'equipe', rotulo: 'Equipe no prazo', titulo: 'Equipe em campo dentro do prazo (30 dias)', valor: (s) => s.atendidoPct, cidade: true, cls: 'col-equipe' },
    { id: 'tempo', rotulo: 'Tempo médio', titulo: 'Tempo médio até resolver (30 dias)', valor: (s) => s.tempoMedioH, cidade: true, cls: 'col-tempo' },
    { id: 'metas', rotulo: 'Plano', titulo: 'Compromissos do plano de governo em dia', valor: (s) => metasEmDia(s.area).ok / (metasEmDia(s.area).total || 1), cls: 'col-metas' },
    { id: 'serie', rotulo: '12 meses', titulo: 'Indicador principal da secretaria; a linha clara é a meta', cls: 'col-serie', semOrdem: true },
  ];
  // Ordem padrão: pior "no prazo" primeiro (como vem do store).
  const ordens = new WeakMap();

  function ordenar(lista, ordem) {
    if (!ordem) return lista;
    const c = COLUNAS.find((x) => x.id === ordem.col);
    const fator = ordem.asc ? 1 : -1;
    return lista.slice().sort((a, b) => {
      const va = c.valor(a); const vb = c.valor(b);
      return (c.texto ? String(va).localeCompare(String(vb), 'pt-BR') : va - vb) * fator;
    });
  }

  function celula(s, c, d) {
    const meta = s.metaPrazoPct || 85;
    switch (c.id) {
      case 'nome': return `<td class="col-nome">${area(s.area).secretaria.emoji} ${esc(area(s.area).nome)}</td>`;
      case 'abertas': return `<td>${s.abertas}</td>`;
      case 'atrasadas': return `<td class="${s.atrasadas ? 'abaixo' : 'zero'}">${s.atrasadas ? `⏰ ${s.atrasadas}` : '0'}</td>`;
      case 'resolvidas': return `<td>${s.resolvidas}</td>`;
      case 'noPrazo': return `<td class="col-prazo"><span class="${s.noPrazoPct < meta ? 'abaixo' : ''}">${s.noPrazoPct}%</span>
        <span class="mini-barra" title="meta ${meta}%"><i class="${s.noPrazoPct < meta ? 'ruim' : 'bom'}" style="width:${s.noPrazoPct}%"></i><b style="left:${meta}%"></b></span></td>`;
      case 'equipe': return `<td class="col-equipe">${s.atendidoPct}%</td>`;
      case 'tempo': return `<td class="col-tempo">${horas(s.tempoMedioH)}</td>`;
      case 'metas': {
        // Texto neutro; a cor fica nos quadradinhos (um por meta) e só vira alerta com meta crítica.
        const m = metasEmDia(s.area);
        const dica = m.status.map((x, i) => `compromisso ${i + 1}: ${STATUS_META[x] || x}`).join(' · ');
        return `<td class="col-metas${m.critico ? ' critico' : ''}" title="${esc(dica)}">${m.ok}/${m.total}
          <span class="metas-seg" aria-hidden="true">${m.status.map((x) => `<i class="st-${x}"></i>`).join('')}</span></td>`;
      }
      case 'serie': return `<td class="col-serie">${sparkline(s.area)}</td>`;
      default: return '<td></td>';
    }
  }

  // escolher: a linha escolhe a secretaria (visão geral) e a página abre pelo botão "Abrir" da linha;
  // sem ele (widget), a linha abre a página.
  function tabela(el, d, selecionada, escolher) {
    const ordem = ordens.get(el) || null;
    const lista = ordenar(d.secretarias, ordem);
    const cab = COLUNAS.map((c) => {
      const ativa = ordem && ordem.col === c.id;
      // Seta clara nas colunas que ordenam (mostra que dá para clicar); cheia na coluna ativa.
      const seta = ativa ? (ordem.asc ? ' ▲' : ' ▼') : ' <span class="ord-seta" aria-hidden="true">↕</span>';
      const extra = c.cidade && d.escopoCidade ? ' <small>(cidade)</small>' : '';
      const cls = [c.cls, c.texto ? 'col-nome' : ''].filter(Boolean).join(' ');
      if (c.semOrdem) return `<th class="${cls}" title="${esc(c.titulo || '')}">${c.rotulo}</th>`;
      return `<th class="${cls}" aria-sort="${ativa ? (ordem.asc ? 'ascending' : 'descending') : 'none'}"><button type="button" data-ordem="${c.id}" title="${esc(c.titulo || 'Ordenar')}">${c.rotulo}${extra}${seta}</button></th>`;
    }).join('');
    const linhas = lista.map((s) => {
      const cls = [
        s.pior && !d.escopoCidade ? 'pior' : '',
        s.noFiltro ? '' : 'fora-filtro',
        selecionada === s.area ? 'selecionada' : '',
        d.escopoCidade && !s.resolvidas && !s.abertas ? 'sem-casos' : '',
      ].filter(Boolean).join(' ');
      const nome = area(s.area).secretaria.nome;
      if (escolher) {
        const sel = selecionada === s.area;
        return `<tr class="${cls}" data-area="${s.area}" tabindex="0" aria-selected="${sel}" title="${sel ? 'Tirar a escolha' : `Ver o resumo: ${esc(nome)}`}">
          ${COLUNAS.map((c) => celula(s, c, d)).join('')}<td class="col-abrir"><button type="button" class="btn-abrir-sec" data-abrir="${s.area}" aria-label="Abrir a página: ${esc(nome)}" title="Abrir a página da secretaria"><span class="abrir-txt">Abrir </span>›</button></td></tr>`;
      }
      return `<tr class="${cls}" data-area="${s.area}" tabindex="0" title="Abrir a página: ${esc(nome)}">
        ${COLUNAS.map((c) => celula(s, c, d)).join('')}<td class="col-ir" aria-hidden="true">›</td></tr>`;
    }).join('');
    const ultima = escolher ? '<th class="col-abrir"><span class="sr-only">Página</span></th>' : '<th class="col-ir"></th>';
    return `<div class="desemp-tabela-rolagem"><table class="desemp-tabela${escolher ? ' escolhe' : ''}"><thead><tr>${cab}${ultima}</tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  // "O que está ruim": lista na lateral (widget) ou faixa no topo da visão geral (faixa: true).
  function ruimHtml(d, faixa) {
    const acoes = d.ruimAcoes || [];
    const itens = d.ruim.map((f, i) => {
      const a = acoes[i];
      const dica = a && a.area ? 'Ver esta secretaria' : a && a.bairro ? 'Ver este bairro' : '';
      return a ? `<li><button type="button" data-ruim="${i}" title="${dica}">${esc(f)} <span aria-hidden="true">›</span></button></li>` : `<li>${esc(f)}</li>`;
    }).join('');
    const cls = faixa ? ' desemp-faixa' : '';
    if (!d.ruim.length) return `<div class="painel-card desemp-ok${cls}"><h3>✅ Nada fora da meta</h3><p class="painel-vazio">Sem prazos estourados nem indicadores piorando neste recorte.</p></div>`;
    return `<div class="painel-card desemp-ruim${cls}"><h3>⚠️ O que está ruim${faixa ? ` <small>${d.ruim.length}</small>` : ''}</h3><ul>${itens}</ul></div>`;
  }

  // semKpis: a visão geral já mostra esses números no painel da secretaria escolhida.
  // Na visão geral (js/tela-secretarias.js): aoEscolherArea faz a linha escolher a secretaria (a página abre
  // pelo botão "Abrir" da linha) e alvoRuim recebe "O que está ruim" como faixa no topo da tela; o ranking
  // ocupa a largura toda, com as resolvidas embaixo.
  GC.desenharDesempenho = function (el, d, opcoes) {
    const { aoClicarArea, aoVerResolvida, aoAcaoRuim, aoEscolherArea = null, alvoRuim = null, selecionada = null, semKpis = false } = opcoes;
    const r = d.resumo;
    const meta = (d.secretarias[0] && d.secretarias[0].metaPrazoPct) || 85;
    const acoes = d.ruimAcoes || [];
    const escolher = !!aoEscolherArea;
    const dica = escolher ? 'clique na linha para ver o resumo · “Abrir” leva à página da secretaria' : 'clique na linha para abrir a página';
    const recentes = `<div class="painel-card desemp-recentes-card">
            <h3>✅ Resolvidas recentemente</h3>
            ${d.recentes.length ? `<ul class="desemp-recentes">${d.recentes.map((x, i) => `<li><button type="button" data-recente="${i}">
              <b>${esc(x.titulo)}</b><small>${esc(area(x.area).nome)} · ${x.haMin < 1 ? 'agora' : `há ${GC.tempoTexto(x.haMin)}`} · ${x.atrasoMin ? `<span class="abaixo">⏰ ${GC.tempoTexto(x.atrasoMin)} atrasada</span>` : 'no prazo'}</small>
            </button></li>`).join('')}</ul>` : '<p class="painel-vazio">Nada resolvido neste recorte ainda.</p>'}
          </div>`;
    if (alvoRuim) alvoRuim.innerHTML = ruimHtml(d, true);
    el.innerHTML = `
      ${semKpis ? '' : `<div class="desemp-kpis">
        <div><b>${r.resolvidas}</b><small>resolvidas</small>${variacaoTexto(r.resolvidas, r.resolvidasAnt, '%', 'mais')}</div>
        <div><b>${r.noPrazoPct}%</b><small>no prazo${d.escopoCidade ? ' (cidade)' : ''} · meta ${meta}%</small>${variacaoTexto(r.noPrazoPct, r.noPrazoPctAnt, 'p.p.', 'mais')}${r.atendidoPct != null ? `<small class="desemp-equipe">equipe em campo no prazo: ${r.atendidoPct}%</small>` : ''}</div>
        <div><b>${horas(r.tempoMedioH)}</b><small>tempo médio${d.escopoCidade ? ' (cidade)' : ''}</small>${variacaoTexto(r.tempoMedioH, r.tempoMedioHAnt, 'h', 'menos')}</div>
      </div>`}
      <div class="desemp-grade${alvoRuim ? ' empilhada' : ''}">
        <div class="painel-card desemp-ranking">
          <h3>Ranking das secretarias <small>${dica}</small></h3>
          ${tabela(el, d, selecionada, escolher)}
        </div>
        ${alvoRuim ? recentes : `<div class="desemp-lado">${ruimHtml(d, false)}${recentes}</div>`}
      </div>`;
    const naLinha = (tr) => (escolher ? aoEscolherArea(selecionada === tr.dataset.area ? null : tr.dataset.area) : aoClicarArea(tr.dataset.area));
    el.querySelectorAll('tr[data-area]').forEach((tr) => {
      tr.onclick = () => naLinha(tr);
      tr.onkeydown = (e) => {
        if (e.target !== tr) return; // Enter no botão "Abrir" é do botão
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); naLinha(tr); }
      };
    });
    el.querySelectorAll('[data-abrir]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); aoClicarArea(b.dataset.abrir); };
    });
    el.querySelectorAll('[data-ordem]').forEach((b) => {
      b.onclick = () => {
        const atual = ordens.get(el);
        const col = b.dataset.ordem;
        // 1º clique: maior primeiro (nome: A→Z); 2º inverte; 3º volta à ordem padrão.
        const inicioAsc = col === 'nome';
        let prox;
        if (!atual || atual.col !== col) prox = { col, asc: inicioAsc };
        else if (atual.asc === inicioAsc) prox = { col, asc: !inicioAsc };
        else prox = null;
        if (prox) ordens.set(el, prox); else ordens.delete(el);
        GC.desenharDesempenho(el, d, opcoes);
        const foco = el.querySelector(`[data-ordem="${col}"]`);
        if (foco) foco.focus();
      };
    });
    const ondeRuim = alvoRuim || el;
    ondeRuim.querySelectorAll('[data-ruim]').forEach((b) => { b.onclick = () => aoAcaoRuim && aoAcaoRuim(acoes[+b.dataset.ruim]); });
    el.querySelectorAll('[data-recente]').forEach((b) => { b.onclick = () => aoVerResolvida(d.recentes[+b.dataset.recente]); });
  };
})(window.GC = window.GC || {});
