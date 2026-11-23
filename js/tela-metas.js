(function (GC) {
  // Tela "Plano de governo" (#/metas[/<secretaria ou ->[/<meta>]]): as metas do plano de governo (calculadas pelos
  // dados ou informadas pela pasta, js/metas-governo.js). Placar que filtra pela situação, chips de secretaria com as
  // críticas e três vistas (por situação, por secretaria, por prazo; a escolha fica em vd-mg-vista). Cada cartão abre a
  // ficha da meta (ao lado; no celular, uma folha): evolução, de onde vem o número, entregas, informes e as ações
  // (informar, editar, voltar ao original, remover). As metas pactuadas (js/pactos.js) são metas de indicador: moram
  // na ficha do indicador e na página da secretaria; aqui só um atalho.
  // Spec: docs/specs/2026-11-12-vila-dourada-metas-governo-design.md. Botões: data-mg="<ação>"; formulários: data-mg-tipo.
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, cls) => GC.icone(nome, cls);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMes = (m) => `${MESES[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}`;
  const somarMes = (m, n) => { const t = +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const area = (id) => (GC.data.areas || []).find((a) => a.id === id) || { id, nome: id, secretaria: { nome: id, emoji: '' } };
  const fmt = (v, u) => (GC.formatarIndicador ? GC.formatarIndicador(v, u) : v);
  const ORDEM_STATUS = { critico: 0, atencao: 1, em_dia: 2, concluida: 3 };
  const SELO = { critico: 'vencida', atencao: 'aberta', em_dia: 'andamento', concluida: 'ok' };
  const ORDEM_PLACAR = ['critico', 'atencao', 'em_dia', 'concluida'];
  const PLACAR = {
    critico: { nome: 'Críticos', texto: 'prazo vencido ou muito atrás', cls: 'critico' },
    atencao: { nome: 'Atenção', texto: 'atrás de onde deveriam estar', cls: 'atencao' },
    em_dia: { nome: 'Em dia', texto: 'no ritmo do prazo', cls: '' },
    concluida: { nome: 'Concluídos', texto: 'já cumpridos', cls: 'bom' },
  };
  // Eixos estratégicos do plano (workshop de 18/11: o painel do plano de governo deve refletir a estratégia da gestão,
  // não só a lista de compromissos). Cada eixo junta pastas; pasta fora de todos cai em "Outros compromissos".
  GC.EIXOS_GOVERNO = GC.EIXOS_GOVERNO || [
    { id: 'pessoas', nome: 'Cuidar das pessoas', objetivo: 'Atendimento de saúde mais rápido e proteção a quem mais precisa.', icone: 'heart-handshake', areas: ['saude', 'assistencia'] },
    { id: 'educacao', nome: 'Educação que transforma', objetivo: 'Vaga, matrícula fácil e escola em condições.', icone: 'school', areas: ['educacao'] },
    { id: 'segura', nome: 'Cidade segura e preparada', objetivo: 'Menos crimes e resposta rápida a chuva e risco.', icone: 'shield-check', areas: ['seguranca', 'defesa_civil'] },
    { id: 'funciona', nome: 'Cidade que funciona', objetivo: 'Rua boa, trânsito que anda e cidade limpa.', icone: 'building-community', areas: ['infraestrutura', 'mobilidade', 'limpeza'] },
  ];
  const eixoDaArea = (id) => GC.EIXOS_GOVERNO.find((e) => e.areas.includes(id)) || { id: 'outros', nome: 'Outros compromissos', objetivo: '', icone: 'dots', areas: [] };
  // Recurso de fora (js/orcamento-gestao.js) ligado ao compromisso pelo título.
  const recursoDaMeta = (m) => (GC.orcamentoGestao ? GC.orcamentoGestao.recursos(null).find((r) => r.meta === m.titulo) : null);
  const VISTAS = [
    { id: 'eixo', nome: 'Por eixo', icone: 'hierarchy-2' },
    { id: 'situacao', nome: 'Por situação', icone: 'traffic-lights' },
    { id: 'secretaria', nome: 'Por secretaria', icone: 'building-bank' },
    { id: 'prazo', nome: 'Por prazo', icone: 'calendar' },
  ];
  const ICONE_FONTE ={ indicador: 'chart-line', serie: 'chart-bar', entregas: 'package', informada: 'message-2' };

  GC.ERROS_META_GOVERNO = {
    area: 'Escolha a secretaria.', titulo: 'Escreva o compromisso.', titulo_repetido: 'Já há um compromisso com este nome na secretaria.', prazo: 'Escolha o prazo.',
    vinculo: 'Confira de onde vem o número.', vinculo_indicador: 'Escolha um indicador.', vinculo_valores: 'Confira os valores de partida e de chegada.',
    vinculo_serie: 'Esta secretaria não tem série.', vinculo_entregas: 'Escolha ao menos uma entrega.', sem_mudanca: 'Nada mudou.', meta: 'O compromisso mudou. Veja de novo.',
    progresso: 'O progresso vai de 0 a 100.', nota: 'Diga o que mudou (ex.: 18 de 32 ecopontos).', calculada: 'Este compromisso é calculado pelos dados.', permissao: 'Não é do seu papel.',
  };

  // Campos do vínculo (criar e editar). v: o vínculo atual; areaMeta: a pasta (para a série).
  function camposVinculo(v = { tipo: 'informada' }) {
    const ind = (GC.CATALOGO_INDICADORES || []).filter((i) => i.area);
    const entregas = GC.entregas ? GC.entregas.lista() : [];
    const opc = (val, nome, atual) => `<option value="${esc(val)}"${val === atual ? ' selected' : ''}>${esc(nome)}</option>`;
    const ids = v.ids || [];
    return `<fieldset class="mg-vinculo" data-mg-vinculo="${esc(v.tipo)}">
      <label class="cb-campo">De onde vem o número<select name="tipo" data-mg-tipo-vinculo>${Object.entries(GC.TIPOS_VINCULO_META).map(([k, n]) => opc(k, n, v.tipo)).join('')}</select></label>
      <div class="pc-linha mg-so" data-so="indicador"><label class="cb-campo">Indicador<select name="indicador">${ind.map((i) => opc(i.id, `${i.nome} · ${area(i.area).nome}`, v.id)).join('')}</select></label>
        <span class="pc-linha"><label class="cb-campo">Partida<input type="number" step="any" name="de" value="${esc(v.de ?? '')}"></label><label class="cb-campo">Chegada<input type="number" step="any" name="ate" value="${esc(v.ate ?? '')}"></label></span></div>
      <div class="mg-so" data-so="serie"><label class="cb-campo">Reduzir a série da secretaria em (%)<input type="number" step="any" min="1" max="100" name="reducaoPct" value="${esc(v.reducaoPct ?? 20)}"></label></div>
      <div class="mg-so" data-so="entregas"><label class="cb-campo">Entregas (Ctrl para escolher mais de uma)<select name="entregas" multiple size="5">${entregas.map((e) => `<option value="${esc(e.id)}"${ids.includes(e.id) ? ' selected' : ''}>${esc(e.titulo)} · ${esc(area(e.area).nome)}</option>`).join('')}</select></label></div>
    </fieldset>`;
  }
  const lerVinculo = (form, areaMeta) => {
    const f = new FormData(form);
    const tipo = f.get('tipo');
    if (tipo === 'indicador') return { tipo, id: f.get('indicador'), de: f.get('de'), ate: f.get('ate') };
    if (tipo === 'serie') return { tipo, area: areaMeta, reducaoPct: f.get('reducaoPct') };
    if (tipo === 'entregas') return { tipo, ids: f.getAll('entregas') };
    return { tipo: 'informada' };
  };
  const rodape = (rotulo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${rotulo}</button><button type="button" class="btn-sec" data-mg-fechar>Cancelar</button></div>`;

  // ---- tempo em meses (para o gráfico da ficha) ----
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idxMes = (m) => +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1); // 'aaaa-mm' → meses desde o ano 0
  const idxData = (d) => { const x = new Date(d); return x.getFullYear() * 12 + x.getMonth() + (x.getDate() - 1) / 31; };
  const rotuloIdx = (i) => `${MESES_CURTOS[Math.floor(i) % 12]}/${String(Math.floor(Math.floor(i) / 12)).slice(2)}`;
  const idxHoje = () => { const h = GC.relogio.hoje; return idxMes(h.slice(0, 7)) + (+h.slice(8, 10) - 1) / 31; };

  // Pontos reais da evolução: os informes da pasta ou a série do indicador ligado (convertida em % do caminho).
  function pontosEvolucao(m, ind) {
    const v = m.vinculo || { tipo: 'informada' };
    let pontos = [];
    if (v.tipo === 'indicador' && ind && ind.serieAtual && ind.serieAtual.meses && v.ate !== v.de) {
      const s = ind.serieAtual;
      const n = s.meses.length;
      const ultimo = Math.floor(idxHoje()) - (s.rotulos[n - 1] === 'agora' ? 0 : 1);
      pontos = s.meses.map((valor, k) => ({ x: ultimo - (n - 1 - k) + 0.5, y: Math.max(0, Math.min(100, ((valor - v.de) / (v.ate - v.de)) * 100)) }));
    } else if (v.tipo === 'informada') {
      pontos = (m.informes || []).filter((x) => x.em).map((x) => ({ x: idxData(x.em), y: x.progressoPct }));
    }
    pontos.push({ x: idxHoje(), y: m.progressoPct, agora: true });
    return pontos.sort((a, b) => a.x - b.x);
  }

  // Gráfico da ficha: a linha tracejada é o caminho até o prazo (onde a meta deveria estar), a cheia é o que andou.
  function graficoEvolucao(m, ind) {
    if (!m.prazoMes) return '';
    const pontos = pontosEvolucao(m, ind);
    const x0 = idxMes(m.inicio || '2025-01');
    const xPrazo = idxMes(m.prazoMes) + 1;
    const xh = idxHoje();
    const x1 = Math.max(xPrazo, xh + 0.5);
    const L = 340; const A = 150; const mx = 10; const topo = 14; const base = 24;
    const x = (i) => mx + ((Math.max(x0, i) - x0) / (x1 - x0)) * (L - 2 * mx);
    const y = (p) => topo + (A - topo - base) * (1 - p / 100);
    const pts = pontos.filter((p) => p.x >= x0).map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    const agora = pontos.find((p) => p.agora);
    const grade = [0, 50, 100].map((p) => `<line x1="${mx}" x2="${L - mx}" y1="${y(p)}" y2="${y(p)}" class="mg-g-grade"/><text x="${mx}" y="${y(p) - 3}" class="mg-g-eixo">${p}%</text>`).join('');
    const ancora = (xx) => (xx < 40 ? 'start' : xx > L - 40 ? 'end' : 'middle');
    return `<figure class="mg-grafico s-${m.status}">
      <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Evolução: ${m.progressoPct}% hoje; pelo caminho até o prazo, deveria estar em ${m.esperadoPct}%">
        ${grade}
        <line x1="${x(x0)}" y1="${y(0)}" x2="${x(xPrazo)}" y2="${y(100)}" class="mg-g-esperado"/>
        ${xPrazo < x1 ? `<rect x="${x(xPrazo).toFixed(1)}" y="${topo}" width="${(x(x1) - x(xPrazo)).toFixed(1)}" height="${A - topo - base}" class="mg-g-vencido"/>` : ''}
        <line x1="${x(xh).toFixed(1)}" x2="${x(xh).toFixed(1)}" y1="${topo - 6}" y2="${A - base}" class="mg-g-hoje"/>
        <text x="${x(xh).toFixed(1)}" y="${topo - 8 < 8 ? 8 : topo - 8}" text-anchor="${ancora(x(xh))}" class="mg-g-eixo forte">hoje</text>
        ${pts.includes(' ') ? `<polyline points="${pts}" class="mg-g-real"/>` : ''}
        ${agora ? `<circle cx="${x(agora.x).toFixed(1)}" cy="${y(agora.y).toFixed(1)}" r="4" class="mg-g-ponto"/>` : ''}
        <text x="${x(x0)}" y="${A - 6}" class="mg-g-eixo">${rotuloIdx(x0)}</text>
        <text x="${x(xPrazo).toFixed(1)}" y="${A - 6}" text-anchor="${ancora(x(xPrazo))}" class="mg-g-eixo">prazo ${rotuloIdx(xPrazo - 1)}</text>
      </svg>
      <figcaption>${ic('chart-line')} <span>Linha cheia: o que andou${(m.vinculo || {}).tipo === 'indicador' ? ' (pelo indicador, nos últimos 12 meses)' : (m.informes || []).length ? ' (pelos informes da pasta)' : ''}. Tracejada: o caminho até o prazo.</span></figcaption>
    </figure>`;
  }

  // O cartão da lista: um botão que abre a ficha. A secretaria aparece nas vistas que não agrupam por ela.
  function cartaoMeta(m, comPasta, ativo) {
    const a = area(m.area);
    const aberta = m.status !== 'concluida';
    return `<li><button type="button" class="mg-meta s-${m.status}${ativo ? ' ativo' : ''}" data-mg-abrir="${esc(m.id)}" aria-pressed="${ativo}">
      <span class="mg-meta-topo">
        <span class="mg-meta-nome">${comPasta ? `<small class="mg-meta-pasta">${esc(a.secretaria.emoji || '')} ${esc(a.nome)}</small>` : ''}<span class="mg-meta-titulo">${esc(m.titulo)}</span></span>
        <span class="cb-selo ${SELO[m.status]}">${esc(GC.STATUS_META_GOVERNO[m.status])}</span>
      </span>
      <span class="mg-progresso">
        <b class="mg-pct">${m.progressoPct}%</b>
        <span class="mg-barra" role="img" aria-label="${m.progressoPct}% feito${aberta ? `; hoje deveria estar em ${m.esperadoPct}%` : ''}"><i style="--v:${m.progressoPct}%"></i>${aberta ? `<em class="${m.esperadoPct > 90 ? 'fim' : m.esperadoPct < 6 ? 'ini' : ''}" style="--e:${m.esperadoPct}%"><span>hoje</span></em>` : ''}</span>
      </span>
      <span class="mg-numeros">${aberta ? `deveria estar em ${m.esperadoPct}% · ` : ''}prazo ${esc(m.prazo)}${m.vencida ? ' · <b class="mg-vencida">prazo vencido</b>' : ''}</span>
      ${(() => { const r = aberta ? recursoDaMeta(m) : null; return r ? `<span class="mg-recurso ${r.situacao}">${GC.icone('building-bank')} ${esc(GC.FONTES_RECURSO[r.fonte].curto)}: R$ ${GC.orcamentoGestao.fmtMi(r.valorMi)} · ${r.executadoPct}% executado${r.situacao === 'risco' ? ' · pode ser devolvido' : ''}</span>` : ''; })()}
    </button></li>`;
  }

  // A ficha da meta: progresso, evolução, de onde vem o número, entregas, informes e as ações de quem pode.
  function fichaMeta(m, { pode, ind, pos, total }) {
    const id = esc(m.id);
    const a = area(m.area);
    const fonte = m.fonte || { tipo: 'informada', texto: '' };
    const v = m.vinculo || { tipo: 'informada' };
    const podeInformar = fonte.tipo === 'informada' && v.tipo === 'informada' && pode('informar', m.area);
    const podeEditar = pode('editar', m.area);
    const aberta = m.status !== 'concluida';
    const mesesFalta = m.prazoMes ? idxMes(m.prazoMes) - Math.floor(idxHoje()) : null;
    const prazoTexto = !aberta ? `prazo ${esc(m.prazo)}` : m.vencida ? `<b class="mg-vencida">prazo vencido (${esc(m.prazo)})</b>`
      : mesesFalta === 0 ? `prazo ${esc(m.prazo)}: vence este mês` : `prazo ${esc(m.prazo)}: ${plural(mesesFalta, 'mês', 'meses')} pela frente`;
    const semInforme = fonte.tipo === 'informada' && !(m.informe && m.informe.em);
    const textoFonte = !semInforme ? fonte.texto : m.progressoPct === 0 ? 'A pasta ainda não informou o progresso.' : 'Número de partida do plano de governo; a pasta ainda não mandou informe.';
    const informes = (m.informes || []).slice().reverse();
    const nav = total > 1 ? `<span class="mg-ficha-nav">
        <button type="button" class="gaveta-x" data-mg-nav="-1" aria-label="Compromisso anterior" title="Anterior (←)"${pos === 0 ? ' disabled' : ''}>${ic('chevron-left')}</button>
        <small>${pos + 1}/${total}</small>
        <button type="button" class="gaveta-x" data-mg-nav="1" aria-label="Próximo compromisso" title="Próxima (→)"${pos === total - 1 ? ' disabled' : ''}>${ic('chevron-right')}</button></span>` : '';
    const acoes = [];
    if (podeInformar) acoes.push('<button type="button" class="btn-acao principal" data-mg-form="informar">Informar progresso</button>');
    if (podeEditar) acoes.push('<button type="button" class="btn-sec" data-mg-form="editar">Editar</button>');
    if (podeEditar && m.alterada) acoes.push(`<button type="button" class="btn-sec" data-mg="restaurar" data-mg-id="${id}">Voltar ao original</button>`);
    if (podeEditar) acoes.push(`<button type="button" class="btn-sec mg-perigo" data-mg="remover" data-mg-id="${id}">Remover</button>`);
    acoes.push(`<button type="button" class="btn-sec btn-maia-tela mg-ficha-maia" data-maia="${esc(`Como está o compromisso “${m.titulo}” do plano de governo e o que falta para cumprir no prazo?`)}"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia</button>`);
    return `<aside class="mg-ficha s-${m.status}" data-mg-caixa="${id}" data-mg-ficha="${id}" aria-label="Ficha do compromisso" tabindex="-1">
      <header class="mg-ficha-cab">
        <div><p class="mg-ficha-sobre">${esc(a.secretaria.emoji || '')} ${esc(a.secretaria.nome)}${m.origem === 'criada' ? ' · criada no painel' : m.alterada ? ' · mudada no painel' : ''}</p>
          <h3>${esc(m.titulo)}</h3></div>
        <div class="mg-ficha-ctrl">${nav}<button type="button" class="gaveta-x" data-mg-fechar-ficha aria-label="Fechar a ficha" title="Fechar (Esc)">${ic('x')}</button></div>
      </header>
      <div class="mg-ficha-corpo">
        <div class="mg-ficha-valor"><b>${m.progressoPct}%</b><span class="cb-selo ${SELO[m.status]}">${esc(GC.STATUS_META_GOVERNO[m.status])}</span>
          <small>${aberta ? `hoje deveria estar em ${m.esperadoPct}%${m.esperadoPct > m.progressoPct ? ` (${m.esperadoPct - m.progressoPct} pontos atrás)` : ''} · ` : ''}${prazoTexto}</small></div>
        ${graficoEvolucao(m, ind)}
        <section class="mg-ficha-sec"><h4>De onde vem o número</h4>
          <p>${ic(ICONE_FONTE[fonte.tipo] || 'info-circle')} <b>${esc(GC.TIPOS_VINCULO_META[v.tipo] || '')}</b>${textoFonte ? `: ${esc(textoFonte)}` : ''}</p>
          ${v.tipo === 'indicador' && v.id ? `<p><a href="#/indicadores/${esc(v.id)}">${ic('target-arrow')} Ver a ficha do indicador</a> <small>com a meta de referência e a pactuada</small></p>` : ''}</section>
        ${m.entregas && m.entregas.length ? `<section class="mg-ficha-sec"><h4>Entregas deste compromisso</h4><ul class="mg-ficha-lista">${m.entregas.map((e) => `<li><a href="#/entregas/${esc(e.dataAtual.slice(0, 7))}">${esc(e.titulo)}</a> <small>${esc(GC.entregas ? GC.entregas.ROTULOS[e.situacao] : e.situacao)} · ${esc(e.dataAtual.split('-').reverse().join('/'))}</small></li>`).join('')}</ul></section>` : ''}
        ${v.tipo === 'informada' ? `<section class="mg-ficha-sec"><h4>Informes da pasta${informes.length ? ` <small>${informes.length}</small>` : ''}</h4>
          ${informes.length ? `<ul class="mg-ficha-lista">${informes.map((x) => `<li><b>${x.progressoPct}%</b> · ${esc(x.nota)} <small>${new Date(x.em).toLocaleDateString('pt-BR')}${x.quem ? ` · ${esc(x.quem)}` : ''}</small></li>`).join('')}</ul>` : '<p class="mg-ficha-vazio">Nenhum informe ainda.</p>'}</section>` : ''}
        ${m.alterada && m.tituloOriginal && m.tituloOriginal !== m.titulo ? `<p class="mg-aviso">Nome mudado (era “${esc(m.tituloOriginal)}”): o calendário sazonal e a agenda de entregas citam o compromisso pelo nome antigo e deixam de ligar a ele.</p>` : ''}
        ${podeInformar ? `<form class="cb-form" data-mg-tipo="informar" data-mg-id="${id}" hidden>
          <p class="cb-form-tit">Progresso de hoje</p>
          <div class="pc-linha"><label class="cb-campo">Feito (%)<input type="number" min="0" max="100" step="1" name="progressoPct" value="${m.progressoPct}"></label>
          <label class="cb-campo">O que mudou<input type="text" name="nota" maxlength="200" placeholder="Ex.: 18 de 32 ecopontos prontos"></label></div>
          ${rodape('Informar')}</form>` : ''}
        ${podeEditar ? `<form class="cb-form" data-mg-tipo="editar" data-mg-id="${id}" data-mg-area="${esc(m.area)}" hidden>
          <p class="cb-form-tit">Mudar o compromisso</p>
          <label class="cb-campo">Compromisso<input type="text" name="titulo" maxlength="140" value="${esc(m.titulo)}"></label>
          <label class="cb-campo">Prazo<input type="month" name="prazoMes" value="${esc(m.prazoMes || '')}"></label>
          ${camposVinculo(m.vinculo)}
          ${rodape('Salvar')}</form>` : ''}
      </div>
      <footer class="mg-ficha-acoes">${acoes.join('')}</footer>
    </aside>`;
  }

  GC.criarTelaMetas = function (el, { aoIr = () => {}, aoAgir = () => ({ ok: false }), pode = () => false } = {}) {
    let rota = { tela: 'metas', area: null };
    let ctx = { areas: null };
    // Situação escolhida no placar (filtra a lista) e como agrupar (guardado por navegador, sem garantia).
    let sitFiltro = null;
    let vista = (() => { try { return localStorage.getItem('vd-mg-vista'); } catch (e) { return null; } })();
    // Visão resumida (js/visao-simples.js): abre por eixo, a leitura da estratégia.
    if (GC.visaoSimples && GC.visaoSimples.ligada()) vista = 'eixo';
    else if (!VISTAS.some((v) => v.id === vista)) vista = 'situacao';
    let ordem = []; // ids na ordem da lista à vista (navegação ← → na ficha)
    let aberta = null; // id da meta com a ficha aberta (vem da rota)

    const irPara = (id) => aoIr(Object.assign({ tela: 'metas', area: rota.area || null }, id ? { id } : {}));

    function desenhar() {
      const mg = GC.metasGoverno;
      if (!mg) { el.innerHTML = '<p class="painel-vazio">O plano de governo não está disponível agora.</p>'; return; }
      const minhas = ctx.areas || null;
      const filtro = rota.area && (GC.data.areas || []).some((a) => a.id === rota.area) ? rota.area : (minhas && minhas.length === 1 ? minhas[0] : null);
      const naPasta = (a) => !filtro || a === filtro;
      const metas = mg.lista().filter((m) => naPasta(m.area));
      const removidas = mg.lista({ removidas: true }).filter((m) => m.removida && naPasta(m.area));
      const conta = (s) => metas.filter((m) => m.status === s).length;
      const hoje = GC.relogio.hoje.slice(0, 7);
      const escolhida = metas.find((m) => m.id === rota.id) || null;
      aberta = escolhida ? escolhida.id : null;

      // Indicadores avaliados: os pactuados (atalho no fim) e o ligado à meta aberta (gráfico da ficha).
      let indicadores = [];
      try { indicadores = GC.avaliarIndicadores(GC.contextoIndicadores(GC.storeAtual || null)); } catch (e) { indicadores = []; }
      const pactuadas = indicadores.filter((i) => i.metaPactuada && naPasta(i.area));

      const podeCriar = (GC.data.areas || []).some((a) => pode('editar', a.id));
      const modo = filtro && vista === 'secretaria' ? 'situacao' : vista; // com uma pasta só, agrupar por secretaria não diz nada
      const comPasta = !filtro && modo !== 'secretaria';
      const visiveis = metas.filter((m) => !sitFiltro || m.status === sitFiltro);
      const porGravidade = (x, y) => ORDEM_STATUS[x.status] - ORDEM_STATUS[y.status] || (x.prazoMes || '').localeCompare(y.prazoMes || '');
      ordem = [];
      const grupo = (titulo, lista, { cls = '', recolhido = false } = {}) => {
        if (!lista.length) return '';
        lista.forEach((m) => ordem.push(m.id));
        const fechado = recolhido && !lista.some((m) => m.id === aberta);
        const cab = `<span class="mg-grupo-ponto"></span>${titulo} <small>${lista.length}</small>`;
        const itens = `<ul class="mg-lista">${lista.map((m) => cartaoMeta(m, comPasta, m.id === aberta)).join('')}</ul>`;
        return recolhido
          ? `<details class="mg-grupo-sec"${fechado ? '' : ' open'}><summary class="mg-grupo ${cls}">${cab}</summary>${itens}</details>`
          : `<section class="mg-grupo-sec"><h3 class="mg-grupo ${cls}">${cab}</h3>${itens}</section>`;
      };

      // Três jeitos de ver a mesma lista: pela situação (o padrão), pela secretaria ou pelo prazo.
      let grupos = '';
      if (modo === 'eixo') {
        const eixos = [...GC.EIXOS_GOVERNO, eixoDaArea('__')];
        grupos = eixos.map((e) => grupo(`${ic(e.icone)} ${esc(e.nome)}`, visiveis.filter((m) => eixoDaArea(m.area).id === e.id).sort(porGravidade))).join('');
      } else if (modo === 'secretaria') {
        grupos = (GC.data.areas || []).map((a) => grupo(`${esc(a.secretaria.emoji || '')} ${esc(a.secretaria.nome)}`,
          visiveis.filter((m) => m.area === a.id).sort(porGravidade))).join('');
      } else if (modo === 'prazo') {
        const abertas = visiveis.filter((m) => m.status !== 'concluida');
        const meses = [...new Set(abertas.filter((m) => !m.vencida).map((m) => m.prazoMes || ''))].sort();
        grupos = grupo('Prazo vencido', abertas.filter((m) => m.vencida).sort(porGravidade), { cls: 'g-critico' })
          + meses.map((mes) => grupo(mes ? esc(nomeMes(mes).charAt(0).toUpperCase() + nomeMes(mes).slice(1)) : 'Sem prazo',
            abertas.filter((m) => !m.vencida && (m.prazoMes || '') === mes).sort(porGravidade), { cls: mes && mes <= somarMes(hoje, 2) ? 'g-atencao' : '' })).join('')
          + grupo('Concluídos', visiveis.filter((m) => m.status === 'concluida'), { cls: 'g-concluida', recolhido: sitFiltro !== 'concluida' });
      } else {
        grupos = ORDEM_PLACAR.map((s) => grupo(PLACAR[s].nome, visiveis.filter((m) => m.status === s).sort(porGravidade),
          { cls: `g-${s}`, recolhido: s === 'concluida' && sitFiltro !== 'concluida' })).join('');
      }

      // Estratégia (workshop de 18/11): um cartão por eixo, com o ritmo dos compromissos, os críticos e o dinheiro do eixo.
      // Clicar agrupa a lista por eixo. Só na visão da cidade toda (na pasta, o eixo é um só).
      const exec = GC.orcamentoGestao ? GC.orcamentoGestao.execucao(null) : null;
      // Eixos editáveis (js/plano-eixos.js): só quem edita todas as pastas (o gestor geral).
      const editaEixos = !!GC.planoEixos && (GC.data.areas || []).every((a) => pode('editar', a.id));
      const cabEixos = filtro ? '' : `<div class="mg-eixos-cab"><h3>${ic('hierarchy-2')} Eixos estratégicos <small>${GC.EIXOS_GOVERNO.length} eixos · cada um junta pastas</small></h3>${editaEixos ? `<button type="button" class="btn-sec oc-mini-bt" data-mg="eixos">${ic('pencil')} Editar eixos</button>` : ''}</div>`;
      const estrategia = filtro ? '' : `${cabEixos}<section class="mg-eixos" aria-label="Eixos estratégicos do plano">${GC.EIXOS_GOVERNO.map((e) => {
        const ms = metas.filter((m) => e.areas.includes(m.area));
        if (!ms.length) return '';
        const media = (k) => Math.round(ms.reduce((s, m) => s + (m[k] || 0), 0) / ms.length);
        const feito = media('progressoPct');
        const esperado = Math.round(ms.reduce((s, m) => s + (m.status === 'concluida' ? 100 : m.esperadoPct || 0), 0) / ms.length);
        const criticos = ms.filter((m) => m.status === 'critico').length;
        const orc = exec ? exec.areas.filter((a) => e.areas.includes(a.id)) : [];
        const prev = orc.reduce((s, a) => s + a.previstoMi, 0);
        const pago = orc.reduce((s, a) => s + a.pagoMi, 0);
        const cls = feito < esperado - 25 ? 'critico' : feito < esperado - 10 ? 'atencao' : 'ok';
        return `<button type="button" class="mg-eixo ${cls}" data-mg-vista="eixo" title="Agrupar os compromissos por eixo">
            <span class="mg-eixo-nome">${ic(e.icone)} ${esc(e.nome)}</span>
            <small class="mg-eixo-obj">${esc(e.objetivo)}</small>
            <span class="mg-eixo-barra" role="img" aria-label="${feito}% feito; deveria estar em ${esperado}%"><i style="width:${feito}%"></i><em style="left:${esperado}%"></em></span>
            <span class="mg-eixo-num"><b>${feito}%</b> feito · deveria ${esperado}% · ${plural(ms.length, 'compromisso', 'compromissos')}${criticos ? ` · <b class="mg-vencida">${plural(criticos, 'crítico', 'críticos')}</b>` : ''}</span>
            ${prev ? `<span class="mg-eixo-orc">${GC.icone('coin')} R$ ${GC.orcamentoGestao.fmtMi(Math.round(pago * 10) / 10)} pagos de R$ ${GC.orcamentoGestao.fmtMi(Math.round(prev * 10) / 10)}</span>` : ''}
          </button>`;
      }).join('')}</section>`;

      // Placar: cada número filtra a lista (clique de novo para ver todas).
      const placar = ORDEM_PLACAR.map((s) => {
        const n = conta(s);
        const p = PLACAR[s];
        return `<button type="button" class="en-kpi ${n || s === 'concluida' ? p.cls : ''}${sitFiltro === s ? ' ativo' : ''}" data-mg-sit="${s}" aria-pressed="${sitFiltro === s}" title="${sitFiltro === s ? 'Mostrar todos' : `Mostrar só: ${p.nome.toLowerCase()}`}">
          <small>${p.nome}</small><b>${n}</b><span>${s === 'concluida' ? `de ${plural(metas.length, 'compromisso', 'compromissos')} do plano` : p.texto}</span></button>`;
      }).join('');

      // Atalho para as metas pactuadas: cada uma abre a ficha do indicador (onde ficam o pacto, o ciclo e o caminho).
      const ritmoPacto = (i) => (i.pactoVencido ? 'prazo vencido' : i.ritmo === 'no_ritmo' ? 'no ritmo' : i.ritmo === 'atrasado' ? 'atrasada' : '');
      const atalhoPactuadas = pactuadas.length ? `<aside class="mg-pactuadas">
          <p>${ic('target-arrow')} <b>${pactuadas.length === 1 ? 'Um indicador tem meta pactuada' : `${pactuadas.length} indicadores têm meta pactuada`}</b> com a secretaria. O pacto e o plano de ação ficam na ficha do indicador:</p>
          <ul class="mg-pactuadas-lista">${pactuadas.map((i) => `<li><a href="#/indicadores/${esc(i.id)}">${esc(i.nome)}</a> <small>${esc(area(i.area).nome)} · meta ${esc(fmt(i.metaAtual, i.unidade))}${ritmoPacto(i) ? ` · ${ritmoPacto(i)}` : ''}</small></li>`).join('')}</ul>
        </aside>` : '';

      // Chips de secretaria com o número de críticas (o mesmo jeito dos filtros dos indicadores).
      const criticasDa = (id) => mg.lista({ area: id }).filter((m) => m.status === 'critico').length;
      const chip = (href, nome, ativo, n) => `<a href="${href}" class="mg-chip${ativo ? ' ativo' : ''}"${ativo ? ' aria-current="page"' : ''}>${nome}${n ? ` <span class="mg-n-critico" title="${plural(n, 'crítico', 'críticos')}">${n}</span>` : ''}</a>`;
      const chips = !minhas ? `<nav class="mg-chips" aria-label="Secretaria">
          ${chip('#/metas', 'Todas', !filtro, mg.lista().filter((m) => m.status === 'critico').length)}
          ${(GC.data.areas || []).filter((a) => mg.lista({ area: a.id }).length).map((a) => chip(`#/metas/${esc(a.id)}`, esc(a.nome), filtro === a.id, criticasDa(a.id))).join('')}
        </nav>` : '';
      const vistas = `<div class="mg-vistas" role="group" aria-label="Agrupar os compromissos">
          ${VISTAS.filter((v) => !(filtro && v.id === 'secretaria')).map((v) => `<button type="button" data-mg-vista="${v.id}" class="${modo === v.id ? 'ativo' : ''}" aria-pressed="${modo === v.id}" aria-label="${v.nome}" title="${v.nome}">${ic(v.icone)}<span>${v.nome}</span></button>`).join('')}
        </div>`;

      // A meta aberta sai da ordem só se o filtro de situação a esconder: aí a navegação usa todas.
      if (escolhida && !ordem.includes(escolhida.id)) ordem = metas.slice().sort(porGravidade).map((m) => m.id);
      const ind = escolhida && escolhida.vinculo && escolhida.vinculo.tipo === 'indicador' ? indicadores.find((i) => i.id === escolhida.vinculo.id) : null;
      const ficha = escolhida ? fichaMeta(escolhida, { pode, ind, pos: ordem.indexOf(escolhida.id), total: ordem.length }) : '';

      // Redesenhar não pode perder a rolagem da ficha nem um formulário aberto nela.
      const corpoAntes = el.querySelector('.mg-ficha-corpo');
      const fichaAntes = el.querySelector('[data-mg-ficha]');
      const mesmaFicha = fichaAntes && fichaAntes.dataset.mgFicha === aberta;
      const rolagemFicha = mesmaFicha && corpoAntes ? corpoAntes.scrollTop : 0;

      el.innerHTML = `
        <header class="sec-topo mg-topo">
          <div><h2>🎯 Plano de governo${filtro ? ` · ${esc(area(filtro).secretaria.nome)}` : ''}</h2>
            <p>O que o governo prometeu e se vai dar tempo. A marca “hoje” na barra é onde cada compromisso deveria estar agora; clique num deles para ver a ficha.</p></div>
          <span class="en-topo-acoes">
            ${podeCriar ? `<button type="button" class="btn-acao principal" data-mg-form="criar">${ic('plus')} Novo compromisso</button>` : ''}
            <button type="button" class="btn-sec btn-maia-tela" data-maia="${esc(filtro ? `Quais compromissos do plano de governo da ${area(filtro).nome} estão críticos?` : 'Quais compromissos do plano de governo estão críticos?')}"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia</button>
            ${GC.planoEixos ? `<button type="button" class="btn-sec" data-mg="pdf" title="Relatório do plano por eixo, para imprimir ou enviar">${ic('file-type-pdf')} PDF do plano</button>` : ''}
            <button type="button" class="btn-sec mg-so-icone" data-mg="csv" aria-label="Baixar os compromissos em CSV" title="Baixar os compromissos em CSV">${ic('download')}</button>
          </span>
        </header>
        <div data-mg-caixa="topo">
          ${podeCriar ? `<form class="cb-form mg-form-nova" data-mg-tipo="criar" hidden>
            <p class="cb-form-tit">Novo compromisso do plano de governo</p>
            <div class="pc-linha mg-linha-3"><label class="cb-campo">Secretaria<select name="area">${(GC.data.areas || []).filter((a) => pode('editar', a.id)).map((a) => `<option value="${esc(a.id)}"${a.id === filtro ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
            <label class="cb-campo">Compromisso<input type="text" name="titulo" maxlength="140" placeholder="Ex.: Iluminar todas as quadras esportivas"></label>
            <label class="cb-campo">Prazo<input type="month" name="prazoMes" value="${esc(somarMes(hoje, 12))}"></label></div>
            ${camposVinculo()}
            ${rodape('Criar compromisso')}</form>` : ''}
        </div>
        ${estrategia}
        <div class="en-kpis mg-placar" role="group" aria-label="Filtrar pela situação">${placar}</div>
        <div class="mg-ferramentas">${chips}${vistas}</div>
        ${sitFiltro ? `<p class="mg-filtro-ativo">Mostrando só: <b>${PLACAR[sitFiltro].nome.toLowerCase()}</b> · <button type="button" class="mg-link" data-mg-sit="">mostrar todos</button></p>` : ''}
        <div class="mg-corpo${ficha ? ' com-ficha' : ''}">
          <div class="mg-principal">
            <div class="mg-grupos" aria-live="polite">${grupos || '<p class="en-vazio">Nenhum compromisso neste recorte.</p>'}</div>
            ${removidas.length && removidas.some((m) => pode('editar', m.area)) ? `<details class="mg-removidas"><summary>Compromissos removidos (${removidas.length})</summary><ul>${removidas.map((m) => `<li>${esc(m.titulo)} <small>${esc(area(m.area).nome)}</small> <button type="button" class="btn-sec" data-mg="restaurar" data-mg-id="${esc(m.id)}">Restaurar</button></li>`).join('')}</ul></details>` : ''}
            ${atalhoPactuadas}
          </div>
          ${ficha ? `<div class="mg-ficha-fundo" data-mg-fechar-ficha aria-hidden="true"></div>${ficha}` : ''}
        </div>`;
      // Campos do vínculo: mostra só os do tipo escolhido.
      el.querySelectorAll('[data-mg-vinculo]').forEach(atualizarVinculo);
      const corpo = el.querySelector('.mg-ficha-corpo');
      if (corpo && rolagemFicha) corpo.scrollTop = rolagemFicha;
    }
    function atualizarVinculo(fs) {
      const tipo = fs.querySelector('[data-mg-tipo-vinculo]').value;
      fs.dataset.mgVinculo = tipo;
      fs.querySelectorAll('.mg-so').forEach((x) => { x.hidden = x.dataset.so !== tipo; });
    }
    function navegar(passo) {
      const k = ordem.indexOf(aberta);
      const j = k + passo;
      if (k < 0 || j < 0 || j >= ordem.length) return;
      irPara(ordem[j]);
    }

    el.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-mg-tipo-vinculo]');
      if (sel) atualizarVinculo(sel.closest('[data-mg-vinculo]'));
    });
    // Com a ficha aberta: Esc fecha só ela. O Esc geral do painel (js/app.js) escuta na captura do document e voltaria ao
    // mapa; por isso este escuta na captura da janela, que vem antes, e só quando o foco está nesta tela (com a Maia
    // ou uma confirmação por cima, o Esc é delas).
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !aberta || el.hidden || document.querySelector('.cf-fundo, dialog[open]')) return;
      const foco = document.activeElement;
      if (foco && foco !== document.body && !el.contains(foco)) return;
      e.stopPropagation();
      e.preventDefault();
      irPara(null);
    }, true);
    // ← → trocam de meta (na ficha ou num cartão, fora dos campos).
    el.addEventListener('keydown', (e) => {
      if (!aberta || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest('input, textarea, select') || !e.target.closest('[data-mg-ficha], .mg-meta')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); navegar(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); navegar(-1); }
    });

    el.addEventListener('click', (e) => {
      const filtroSit = e.target.closest('[data-mg-sit]');
      if (filtroSit) {
        const s = filtroSit.dataset.mgSit || null;
        sitFiltro = sitFiltro === s ? null : s;
        desenhar();
        const foco = el.querySelector(`[data-mg-sit="${s || ''}"]`) || el.querySelector('[data-mg-sit]');
        if (foco) foco.focus({ preventScroll: true });
        return;
      }
      const botaoVista = e.target.closest('[data-mg-vista]');
      if (botaoVista) {
        vista = botaoVista.dataset.mgVista;
        try { localStorage.setItem('vd-mg-vista', vista); } catch (err) { /* sem armazenamento */ }
        desenhar();
        const foco = el.querySelector(`[data-mg-vista="${vista}"]`);
        if (foco) foco.focus({ preventScroll: true });
        return;
      }
      const cartao = e.target.closest('[data-mg-abrir]');
      if (cartao) { irPara(cartao.dataset.mgAbrir === aberta ? null : cartao.dataset.mgAbrir); return; }
      if (e.target.closest('[data-mg-fechar-ficha]')) { irPara(null); return; }
      const nav = e.target.closest('[data-mg-nav]');
      if (nav) { navegar(Number(nav.dataset.mgNav)); return; }
      const alvo = e.target.closest('[data-mg], [data-mg-form], [data-mg-fechar]');
      if (!alvo || !el.contains(alvo)) return;
      if (alvo.matches('[data-mg-form]')) {
        const dono = alvo.matches('[data-mg-form="criar"]') ? el.querySelector('[data-mg-caixa="topo"]') : alvo.closest('[data-mg-caixa]');
        if (!dono) return;
        let aberto = null;
        dono.querySelectorAll('form.cb-form[data-mg-tipo]').forEach((f) => {
          f.hidden = f.dataset.mgTipo !== alvo.dataset.mgForm || !f.hidden;
          if (!f.hidden) aberto = f;
        });
        if (aberto) {
          aberto.scrollIntoView({ block: 'nearest', behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          const campo = aberto.querySelector('input, select');
          if (campo) campo.focus({ preventScroll: true });
        }
        return;
      }
      if (alvo.matches('[data-mg-fechar]')) { alvo.closest('.cb-form').hidden = true; return; }
      const acao = alvo.dataset.mg;
      if (acao === 'pdf' && GC.planoEixos) {
        const filtro = rota.area || (ctx.areas && ctx.areas.length === 1 ? ctx.areas[0] : null);
        if (!GC.planoEixos.pdf({ area: filtro }) && GC.avisar) GC.avisar('O gerador de PDF não carregou (precisa de internet).');
        return;
      }
      if (acao === 'eixos' && GC.planoEixos) { GC.planoEixos.abrirEditor({ aoSalvar: desenhar }); return; }
      if (acao === 'csv') {
        const filtro = rota.area || (ctx.areas && ctx.areas.length === 1 ? ctx.areas[0] : null);
        const lista = GC.metasGoverno.lista({ area: filtro });
        if (GC.baixarArquivo) GC.baixarArquivo(GC.csvMetasGoverno(lista), `compromissos-plano-de-governo${filtro ? `-${filtro}` : ''}.csv`, 'text/csv;charset=utf-8');
        return;
      }
      const agir = () => {
        const r = aoAgir(acao, { id: alvo.dataset.mgId }) || { ok: false };
        if (!r.ok) window.alert(GC.ERROS_META_GOVERNO[r.motivo] || 'Não deu certo. Tente de novo.');
        else if (acao === 'remover' && alvo.dataset.mgId === aberta) irPara(null);
      };
      if (acao !== 'remover') { agir(); return; }
      const texto = 'O compromisso sai do plano de governo e das telas. Um compromisso do plano original pode ser restaurado depois.';
      const pedir = GC.confirmar
        ? GC.confirmar({ titulo: 'Remover este compromisso?', texto, sim: 'Remover compromisso', perigo: true })
        : Promise.resolve(window.confirm(texto));
      pedir.then((ok) => { if (ok) agir(); });
    });
    el.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-mg-tipo]');
      if (!form) return;
      e.preventDefault();
      const f = new FormData(form);
      const tipo = form.dataset.mgTipo;
      let dados;
      if (tipo === 'informar') dados = { id: form.dataset.mgId, progressoPct: f.get('progressoPct'), nota: f.get('nota') };
      else if (tipo === 'editar') dados = { id: form.dataset.mgId, titulo: f.get('titulo'), prazoMes: f.get('prazoMes'), vinculo: lerVinculo(form, form.dataset.mgArea) };
      else dados = { area: f.get('area'), titulo: f.get('titulo'), prazoMes: f.get('prazoMes'), vinculo: lerVinculo(form, f.get('area')) };
      const r = aoAgir(tipo, dados) || { ok: false };
      const erro = form.querySelector('.cb-erro');
      if (!r.ok) { if (erro) erro.textContent = GC.ERROS_META_GOVERNO[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      // Meta nova: a ficha dela abre (o registro já avisou a tela, que redesenhou).
      if (tipo === 'criar' && r.meta) irPara(r.meta.id); else desenhar();
    });

    return {
      mostrar(r, c = {}) {
        const antes = aberta;
        rota = r || rota;
        ctx = Object.assign({ areas: null }, c);
        desenhar();
        // Ficha que acabou de abrir (ou trocou): o foco vai para ela, sem pular a página.
        if (aberta && aberta !== antes) {
          const f = el.querySelector('[data-mg-ficha]');
          if (f) f.focus({ preventScroll: true });
          const cartao = el.querySelector(`[data-mg-abrir="${CSS.escape(aberta)}"]`);
          if (cartao && cartao.scrollIntoView) cartao.scrollIntoView({ block: 'nearest' });
        } else if (!aberta && antes) {
          const cartao = el.querySelector(`[data-mg-abrir="${CSS.escape(antes)}"]`);
          if (cartao) cartao.focus({ preventScroll: true });
        }
      },
      atualizar() { if (!el.hidden) desenhar(); },
      fichaAberta: () => !!aberta,
    };
  };
})(window.GC = window.GC || {});
