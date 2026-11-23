(function (GC) {
  // Tela "Calendário sazonal" (#/sazonal ou #/sazonal/<mês curto>): o ano inteiro das épocas que pedem algo da
  // prefeitura, agrupado por secretaria; o que um mês escolhido pede (em curso, preparar, depois); o detalhe de uma
  // temporada (de onde vem o pico, o que fazer, as metas) e a lista das metas de preparo.
  // O motor é js/data-sazonal.js (o mesmo do widget e da Maia); aqui é só o desenho.
  // Spec: docs/specs/2026-11-12-vila-dourada-calendario-sazonal-design.md.
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, cls) => GC.icone(nome, cls);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Rota → mês olhado (0 a 11); sem mês ou mês desconhecido, o do cenário.
  GC.mesDaRotaSazonal = (rota) => {
    const m = rota && rota.mes ? GC.sazonal.CURTOS.indexOf(rota.mes) : -1;
    return m >= 0 ? m : GC.sazonal.mesCenario();
  };

  // Barras da série da temporada, jan a dez: o pico em destaque, o mês olhado contornado.
  function barras(t, mes) {
    const v = t.fonte.valoresPorMes;
    const max = Math.max(...v.filter((x) => x !== null));
    const W = 360; const H = 120; const B = 18; const passo = W / 12;
    const cols = v.map((x, m) => {
      const h = x === null ? 0 : Math.max(2, (x / max) * (H - B - 16));
      const cls = [m === t.pico ? 'pico' : t.meses.includes(m) ? 'em' : '', m === mes ? 'olhado' : ''].filter(Boolean).join(' ');
      const xx = m * passo + 4;
      return `<g class="${cls}"><rect x="${xx.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(passo - 8).toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(GC.sazonal.NOMES_MES[m])}: ${x} ${esc(t.fonte.unidade)}</title></rect>
        <text x="${(xx + (passo - 8) / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${GC.sazonal.CURTOS[m]}</text>
        ${m === t.pico ? `<text class="valor" x="${(xx + (passo - 8) / 2).toFixed(1)}" y="${(H - B - h - 4).toFixed(1)}" text-anchor="middle">${x}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="sz-barras" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.fonte.rotulo)} por mês, pico em ${esc(GC.sazonal.NOMES_MES[t.pico])} com ${t.fonte.valorPico} ${esc(t.fonte.unidade)}">${cols}</svg>`;
  }

  // Tom da célula pela intensidade do mês (0,4 a 1): degraus da escala sequencial dos tokens (--viz-seq-*).
  // Época sem série (marco) fica no tom do meio.
  const tom = (i) => (i == null ? 500 : i >= 1 ? 700 : i >= 0.85 ? 600 : i >= 0.7 ? 500 : i >= 0.55 ? 400 : 300);

  GC.criarTelaSazonal = function (el, { aoIr = () => {}, aoVerCamada = () => {} } = {}) {
    let rota = { tela: 'sazonal' };
    let ctx = { areas: null };
    let sel = null; // id da temporada aberta no detalhe
    let rolarGrade = true; // na primeira vez e ao trocar de mês, a grade rola até o mês escolhido (celular)

    function desenhar() {
      const mes = GC.mesDaRotaSazonal(rota);
      const hoje = GC.sazonal.mesCenario();
      const s = GC.sazonal.agora(mes);
      const minhas = ctx.areas || null; // setor: a pasta vem primeiro e em destaque
      const daPasta = (t) => !minhas || minhas.includes(t.area);
      // A pasta do perfil vem primeiro nas listas do mês e abre o detalhe de partida.
      const primeiroDaPasta = (lista) => [...lista].sort((a, b) => daPasta(b) - daPasta(a));
      const emCursoOrd = primeiroDaPasta(s.emCurso);
      const emPreparoOrd = primeiroDaPasta(s.emPreparo);
      if (!sel || !s.todas.some((t) => t.id === sel)) sel = (emCursoOrd[0] || emPreparoOrd[0] || s.todas[0]).id;
      const aberta = s.todas.find((t) => t.id === sel);
      const { meta, nomeArea, quando } = GC.sazonalUi;
      const NOME = GC.sazonal.NOMES_MES;
      const CURTO = GC.sazonal.CURTOS;

      // Seletor de mês: anterior, o mês escolhido, próximo e "Hoje". Tudo com largura fixa: trocar de mês não
      // mexe nos botões de lugar (o "Hoje" está sempre lá; no mês de hoje, fica marcado e parado).
      const ant = (mes + 11) % 12; const prox = (mes + 1) % 12;
      const ehHoje = mes === hoje;
      const seletor = `<div class="sz-seletor" role="group" aria-label="Mês do calendário">
          <button type="button" class="sz-seta" data-saz-mes="${CURTO[ant]}" aria-label="Mês anterior: ${NOME[ant]}">${ic('chevron-left')}</button>
          <b>${esc(maiuscula(s.nomeMes))}</b>
          <button type="button" class="sz-seta" data-saz-mes="${CURTO[prox]}" aria-label="Próximo mês: ${NOME[prox]}">${ic('chevron-right')}</button>
          <button type="button" class="sz-hoje${ehHoje ? ' ativo' : ''}"${ehHoje ? ' disabled aria-current="date"' : ` data-saz-mes="${CURTO[hoje]}"`} title="${ehHoje ? `${maiuscula(NOME[hoje])} é o mês de hoje` : `Voltar para ${NOME[hoje]}`}">Hoje</button>
        </div>`;

      // Metas de preparo atrasadas: o que pede ação, logo abaixo do título.
      const n = s.atrasadas.length;
      const alerta = n ? `<div class="w-saz-alerta sz-alerta" role="status">${ic('alert-triangle', 'ic-alerta')}<div>
          <b>${plural(n, 'compromisso de preparo atrasado', 'compromissos de preparo atrasados')}: a temporada já começou</b>
          <ul>${s.atrasadas.map((a, k) => `<li><button type="button" class="sz-link" data-saz-temp="${esc(a.temporadaId)}" data-saz-foco="alerta-${k}" data-saz-ver>${esc(a.meta.titulo)}</button> <span>${esc(a.temporada)} · ${a.meta.progressoPct}%</span></li>`).join('')}</ul>
        </div></div>` : '';

      // Grade do ano: secretarias (a do perfil primeiro), uma linha por temporada.
      const areas = [...new Set(s.todas.map((t) => t.area))].sort((a, b) => (daPasta({ area: b }) - daPasta({ area: a })));
      const cab = CURTO.map((c, m) => `<button type="button" class="${m === mes ? 'olhado' : ''}${m === hoje ? ' hoje' : ''}" data-saz-mes="${c}" aria-pressed="${m === mes}" title="Ver ${NOME[m]}">${c}${m === hoje ? '<small>hoje</small>' : ''}</button>`).join('');
      const linha = (t) => {
        const cel = Array.from({ length: 12 }, (_, m) => {
          const em = t.meses.includes(m);
          const cls = [em ? `em t${tom(t.intensidade ? t.intensidade[m] : null)}` : t.preparo.includes(m) ? 'prep' : '', m === t.pico ? 'pico' : '', m === hoje ? 'hoje' : ''].filter(Boolean).join(' ');
          return `<i class="${cls}"></i>`;
        }).join('');
        const origem = t.origem === 'marco'
          ? `<span class="sz-origem" title="Data conhecida do calendário da cidade">${ic('calendar-event')}</span>`
          : `<span class="sz-origem" title="Meses e pico calculados da série da secretaria">${ic('chart-line')}</span>`;
        const leitura = `${t.nome}: ${GC.sazonal.periodo(t)}${t.pico !== null ? `, pico em ${NOME[t.pico]}` : ''}; preparar ${plural(t.preparo.length, 'mês', 'meses')} antes`;
        return `<li><button type="button" class="sz-linha${t.id === sel ? ' sel' : ''}${daPasta(t) ? '' : ' fora-pasta'}" data-saz-temp="${esc(t.id)}" data-saz-foco="linha-${esc(t.id)}" data-saz-ver aria-pressed="${t.id === sel}" aria-label="${esc(leitura)}">
          <span class="nome">${ic(t.icone)}<span class="nome-txt">${esc(t.nome)}</span>${origem}</span>
          <span class="cel" aria-hidden="true">${cel}</span></button></li>`;
      };
      const grade = areas.map((a) => `<li class="sz-area"><h4>${esc(nomeArea(a))}${minhas && minhas.includes(a) ? ' <span class="sz-sua">sua pasta</span>' : ''}</h4>
        <ul>${s.todas.filter((t) => t.area === a).map(linha).join('')}</ul></li>`).join('');

      // O mês escolhido: cartões compactos (o que fazer fica no detalhe); clicar abre a temporada ao lado.
      const cartao = (t, rotulo) => {
        const atr = t.metasAtrasadas.length;
        return `<button type="button" class="sz-cartao ${t.situacao}${t.id === sel ? ' sel' : ''}${daPasta(t) ? '' : ' fora-pasta'}" data-saz-temp="${esc(t.id)}" data-saz-foco="cartao-${esc(t.id)}" data-saz-ver aria-pressed="${t.id === sel}">
          <span class="sz-cartao-txt"><span class="w-saz-tag">${esc(rotulo)}</span>
          <b>${ic(t.icone)} ${esc(t.nome)}</b>
          <small>${esc(nomeArea(t.area))} · ${esc(GC.sazonal.periodo(t))}</small>
          ${atr ? `<span class="sz-selo ruim">${ic('alert-triangle')} ${plural(atr, 'compromisso atrasado', 'compromissos atrasados')}</span>` : ''}</span>
          ${ic('chevron-right', 'sz-cartao-ir')}
        </button>`;
      };
      const emCurso = emCursoOrd.map((t) => cartao(t, t.situacao === 'pico' ? 'No pico' : 'Em curso')).join('');
      const preparo = emPreparoOrd.map((t) => cartao(t, `Começa ${quando(t)}`)).join('');
      const depois = s.proximas.length ? `<p class="sz-depois">Depois: ${s.proximas.map((t) => `<button type="button" class="sz-link" data-saz-temp="${esc(t.id)}" data-saz-foco="depois-${esc(t.id)}" data-saz-ver>${esc(t.nome)}</button> ${quando(t)}`).join(' · ')}</p>` : '';

      // Detalhe da temporada aberta. Tarefas (js/tarefas-ui.js): o prazo sugerido é a véspera do começo da temporada.
      const podePassar = !!GC.podeNaTarefa && (GC.data.areas || []).some((a) => GC.podeNaTarefa('passar', { area: a.id }));
      const prazoAntes = (t) => {
        if (t.situacao === 'pico' || t.situacao === 'temporada') return null;
        const hojeD = new Date(GC.agora());
        const ano = hojeD.getFullYear() + (t.inicio < hojeD.getMonth() ? 1 : 0);
        const em = new Date(ano, t.inicio, 1).getTime() - 60000;
        return { em, rotulo: `Antes da temporada (até ${new Date(em).toLocaleDateString('pt-BR')})` };
      };
      const base = aberta.fonte
        ? `<p class="sz-base">Pico em <b>${esc(NOME[aberta.pico])}</b>: ${aberta.fonte.valorPico} ${esc(aberta.fonte.unidade)} no ano passado. Meses com pelo menos ${Math.round(GC.sazonal.LIMIAR * 100)}% do pior valor contam como temporada.</p>${barras(aberta, mes)}<p class="sz-fonte">Base: ${esc(aberta.fonte.rotulo)}, a mesma série da página da secretaria.</p>`
        : '<p class="sz-base">Data conhecida do calendário da cidade. A base não tem série mensal para esta época, então o calendário não mostra intensidade nem pico.</p>';
      const detalhe = `<section class="rel-cartao sz-detalhe" id="sz-detalhe" tabindex="-1" aria-label="Detalhe: ${esc(aberta.nome)}">
          <h3>${ic(aberta.icone)} ${esc(aberta.nome)} <small>${esc(nomeArea(aberta.area))} · ${esc(GC.sazonal.periodo(aberta))}</small></h3>
          <p>Por causa de ${esc(aberta.porque)}. Preparar ${plural(aberta.preparo.length, 'mês', 'meses')} antes${aberta.preparo.length ? ` (${aberta.preparo.map((m) => CURTO[m]).join(', ')})` : ''}.</p>
          ${base}
          <h4>O que fazer</h4>
          <ul class="w-saz-acoes">${aberta.acoes.map((a) => `<li>${esc(a.texto)}${a.meta ? meta(a.meta) : ''}${podePassar ? `<button type="button" class="tf-prefill" data-tf-prefill="${esc(a.texto)}" title="Passar como demanda">Passar</button>` : ''}</li>`).join('')}</ul>
          <span class="sz-detalhe-acoes">
            ${aberta.camada ? `<button type="button" class="btn-sec" data-saz-camada="${esc(aberta.camada)}">${ic('map-pin')} Ver no mapa</button>` : ''}
            <button type="button" class="btn-sec btn-maia-tela" data-maia="${esc(`Como está a preparação para ${aberta.nome.toLowerCase()}?`)}"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia</button>
          </span>
          ${GC.htmlBlocoTarefas ? GC.htmlBlocoTarefas({ tipo: 'temporada', id: aberta.id, nome: aberta.nome, area: aberta.area, prazoSugerido: prazoAntes(aberta) }) : ''}
        </section>`;

      // Metas de preparo de todas as temporadas, vistas do mês escolhido: atrasadas primeiro, concluídas por último.
      const peso = (m) => (m.atrasada ? 0 : m.concluida ? 2 : 1);
      const metas = s.todas.flatMap((t) => t.acoes.filter((a) => a.meta).map((a) => ({ t, m: a.meta })))
        .sort((a, b) => peso(a.m) - peso(b.m));
      const concluidas = metas.filter((x) => x.m.concluida).length;
      const situacaoMeta = (m) => (m.concluida ? ['ok', 'Concluído', ''] : m.atrasada ? ['atrasada', 'Atrasado', 'A temporada já começou e o compromisso não chegou a 100%'] : ['', `Prazo ${m.prazo}`, '']);
      const tabela = metas.length ? `<div class="sz-tabela-rolagem"><table class="sec-tabela sz-metas"><thead><tr><th>Temporada</th><th>Secretaria</th><th>Compromisso do plano</th><th>Progresso</th><th>Situação</th></tr></thead><tbody>
          ${metas.map(({ t, m }, k) => { const [cls, txt, dica] = situacaoMeta(m); return `<tr class="${daPasta(t) ? '' : 'fora-pasta'}">
            <td><button type="button" class="sz-link" data-saz-temp="${esc(t.id)}" data-saz-foco="meta-${k}" data-saz-ver>${esc(t.nome)}</button></td><td>${esc(nomeArea(t.area))}</td><td>${esc(m.titulo)}</td>
            <td class="sz-prog-cel"><span class="sz-prog ${cls}"><i style="width:${Math.min(100, m.progressoPct)}%"></i></span> ${m.progressoPct}%</td>
            <td><span class="sz-selo ${cls === 'atrasada' ? 'ruim' : cls}"${dica ? ` title="${esc(dica)}"` : ''}>${cls === 'atrasada' ? ic('alert-triangle') + ' ' : cls === 'ok' ? ic('check') + ' ' : ''}${esc(txt)}</span></td></tr>`; }).join('')}
        </tbody></table></div>` : '<p>Nenhum compromisso do plano ligado às temporadas.</p>';

      el.innerHTML = `
        <header class="sec-topo sz-topo">
          <div><h2>📅 Calendário sazonal</h2><p>As épocas do ano que pedem algo da prefeitura e o que preparar antes de cada uma.</p></div>
          <span class="sz-topo-acoes">${seletor}${GC.pode && GC.pode('sazonal.editar', null) ? `<button type="button" class="btn-sec sz-config" data-saz-config title="Temporadas, meses, preparo e o que fazer">${ic('settings')} Configurar</button>` : ''}<button type="button" class="btn-sec btn-maia-tela" data-maia="O que preparar para os próximos meses?"><i class="ti ti-sparkles" aria-hidden="true"></i> O que preparar, com a Maia</button></span>
        </header>
        ${alerta}
        <div class="sz-kpis" aria-live="polite">
          <div class="sz-kpi"><small>Em curso em ${esc(s.nomeMes)}</small><b>${plural(s.emCurso.length, 'temporada', 'temporadas')}</b><span>${esc(s.emCurso.map((t) => t.nome).join(', ') || 'nenhuma')}</span></div>
          <div class="sz-kpi"><small>Preparar agora</small><b>${plural(s.emPreparo.length, 'temporada', 'temporadas')}</b><span>${esc(s.emPreparo.map((t) => t.nome).join(', ') || 'nada')}</span></div>
          <div class="sz-kpi${n ? ' ruim' : ''}"><small>Compromissos de preparo</small><b>${n ? plural(n, 'atrasado', 'atrasados') : 'em dia'}</b><span>${concluidas} de ${metas.length} concluídos</span></div>
        </div>
        <div class="sz-colunas">
          <section class="rel-cartao sz-mes">
            <h3>Em ${esc(s.nomeMes)}</h3>
            <h4>Em curso</h4>${emCurso || '<p class="w-saz-vazio">Nenhuma temporada neste mês.</p>'}
            <h4>Preparar</h4>${preparo || '<p class="w-saz-vazio">Nada para preparar neste mês.</p>'}
            ${depois}
          </section>
          ${detalhe}
        </div>
        <section class="rel-cartao sz-ano">
          <div class="sz-ano-topo">
            <h3>O ano <small>clique num mês ou numa temporada</small></h3>
            <p class="w-saz-legenda sz-legenda" aria-hidden="true"><span><i class="sz-escala"></i>temporada (mais escuro = pior)</span> <span><i class="sz-leg-pico"></i>pico</span> <span><i class="prep"></i>preparar</span> <span><i class="sz-leg-hoje"></i>hoje</span></p>
          </div>
          <div class="sz-grade" style="--m:${mes}">
            <div class="sz-cab"><span class="sz-cab-nome"></span><span class="cel">${cab}</span></div>
            <ul>${grade}</ul>
          </div>
        </section>
        <section class="rel-cartao">
          <h3>Compromissos de preparo <small>os compromissos do plano ligados a cada temporada</small></h3>
          ${tabela}
        </section>`;

      // Celular: a grade rola na horizontal; mostra o mês escolhido em vez de janeiro.
      if (rolarGrade && el.querySelector) {
        rolarGrade = false;
        const g = el.querySelector('.sz-grade');
        const b = g && g.querySelector('.sz-cab button.olhado');
        const nome = g && g.querySelector('.sz-cab-nome');
        if (b && g.scrollWidth > g.clientWidth) g.scrollLeft = Math.max(0, b.offsetLeft - (nome ? nome.offsetWidth : 0) - b.offsetWidth * 2);
      }
    }

    // Tarefas da temporada: os cliques do bloco (passar, concluir, cobrar…) e o redesenho depois.
    if (GC.ligarTarefas && el.addEventListener) GC.ligarTarefas(el, { aoConcluir: () => desenhar() });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-saz-config]')) return aoIr({ tela: 'sazonal', config: true });
      const m = e.target.closest('[data-saz-mes]');
      if (m) return aoIr({ tela: 'sazonal', mes: m.dataset.sazMes === GC.sazonal.CURTOS[GC.sazonal.mesCenario()] ? null : m.dataset.sazMes });
      const t = e.target.closest('[data-saz-temp]');
      if (t) {
        const foco = t.dataset.sazFoco;
        const ver = t.hasAttribute('data-saz-ver');
        sel = t.dataset.sazTemp;
        desenhar();
        // Fora da grade (cartão, alerta, tabela), o detalhe pode ficar longe da vista: leva até ele.
        const d = el.querySelector('#sz-detalhe');
        if (ver && d) {
          const r = d.getBoundingClientRect();
          if (r.top < 0 || r.top > window.innerHeight - 120) { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); d.focus({ preventScroll: true }); return; }
        }
        const b = foco && [...el.querySelectorAll('[data-saz-foco]')].find((x) => x.dataset.sazFoco === foco);
        if (b) b.focus({ preventScroll: true });
        return;
      }
      const c = e.target.closest('[data-saz-camada], .w-saz-item [data-camada]');
      if (c) aoVerCamada(c.dataset.sazCamada || c.dataset.camada);
    });

    return {
      // Trocar de mês recomeça o detalhe pela temporada daquele mês.
      mostrar(r, c) { if (r && (r.mes || null) !== (rota.mes || null)) { rolarGrade = true; sel = null; } rota = r || rota; ctx = c || ctx; desenhar(); },
      atualizar(c) {
        ctx = c || ctx;
        if (el.querySelector && el.querySelector('.tf-bloco .cb-form:not([hidden])')) return; // não apaga o que está sendo escrito
        desenhar();
      },
      // Abre uma temporada no detalhe (o chip de uma tarefa leva até ela).
      selecionar(id) { if (GC.sazonal.temporadas().some((t) => t.id === id)) { sel = id; desenhar(); const d = el.querySelector && el.querySelector('#sz-detalhe'); if (d) d.scrollIntoView({ block: 'start' }); } },
    };
  };
})(window.GC = window.GC || {});
