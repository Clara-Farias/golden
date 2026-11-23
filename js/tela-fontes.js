(function (GC) {
  // Fontes e integrações (pauta do Paulo Fiuza, item 8): de onde vem cada dado do painel, como chega, quando foi
  // atualizado e quais telas usam. Rota #/fontes. Uma fonte atrasada aparece aqui, na Governança da Maia (a Maia
  // avisa quando responde com dado velho) e pode ser cobrada do responsável ("Pedir atualização").
  // Demonstração: os sistemas e os horários são simulados a partir do relógio do painel.
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const MIN = 60000;
  const agora = () => (GC.agora ? GC.agora() : Date.now());
  GC.TIPOS_FONTE = {
    api: { nome: 'Integração automática', icone: 'plug-connected' },
    arquivo: { nome: 'Arquivo enviado', icone: 'file-upload' },
    sensor: { nome: 'Sensor ou GPS', icone: 'antenna' },
    manual: { nome: 'Lançamento manual', icone: 'keyboard' },
  };
  // haMin: há quantos minutos chegou o último dado; prazoMin: de quanto em quanto tempo deveria chegar.
  const FONTES = [
    { id: 'ocorrencias', nome: 'Ocorrências e pedidos', sistema: '156, app da prefeitura e Portal do Cidadão', tipo: 'api', prazoMin: 5, haMin: 1, area: null, telas: ['painel', 'alertas', 'secretarias'] },
    { id: 'ubs', nome: 'Lotação e espera nas UBS', sistema: 'e-SUS APS (Ministério da Saúde)', tipo: 'api', prazoMin: 30, haMin: 12, area: 'saude', telas: ['secretaria', 'indicadores'] },
    { id: 'leitos', nome: 'Leitos e UTI', sistema: 'Central de regulação · CNES', tipo: 'api', prazoMin: 60, haMin: 24, area: 'saude', telas: ['painel', 'secretaria', 'crise'] },
    { id: 'remedios', nome: 'Estoque de remédios', sistema: 'Hórus (farmácia básica)', tipo: 'arquivo', prazoMin: 1440, haMin: 610, area: 'saude', telas: ['secretaria', 'cidadao'] },
    { id: 'escolas', nome: 'Matrículas, vagas e frequência', sistema: 'Sistema de gestão escolar · Educacenso', tipo: 'api', prazoMin: 1440, haMin: 300, area: 'educacao', telas: ['secretaria', 'cidadao', 'indicadores'] },
    { id: 'chuva', nome: 'Chuva e nível dos rios', sistema: 'Pluviômetros CEMADEN · INMET', tipo: 'sensor', prazoMin: 15, haMin: 6, area: 'defesa_civil', telas: ['painel', 'crise', 'sazonal'] },
    { id: 'onibus', nome: 'Ônibus em tempo real', sistema: 'GTFS-RT das concessionárias', tipo: 'sensor', prazoMin: 5, haMin: 2, area: 'mobilidade', telas: ['painel', 'secretaria'] },
    { id: 'transito', nome: 'Trânsito e lentidão', sistema: 'Parceria de dados de trânsito', tipo: 'api', prazoMin: 15, haMin: 26 * 60, area: 'mobilidade', telas: ['painel', 'secretaria'] },
    { id: 'coleta', nome: 'Rotas da coleta de lixo', sistema: 'GPS dos caminhões', tipo: 'sensor', prazoMin: 10, haMin: 4, area: 'limpeza', telas: ['painel', 'secretaria', 'cidadao'] },
    { id: 'cameras', nome: 'Câmeras e segurança', sistema: 'Centro de operações (CICC)', tipo: 'api', prazoMin: 15, haMin: 9, area: 'seguranca', telas: ['painel', 'secretaria'] },
    { id: 'contabilidade', nome: 'Orçamento e execução', sistema: 'Sistema de contabilidade (SIAFIC)', tipo: 'arquivo', prazoMin: 1440, haMin: 140, area: null, telas: ['orcamento', 'metas'] },
    { id: 'transferencias', nome: 'Recursos federais e convênios', sistema: 'Transferegov · FNS · FNDE', tipo: 'api', prazoMin: 1440, haMin: 520, area: null, telas: ['orcamento'] },
    { id: 'contratos', nome: 'Contratos e licitações', sistema: 'Sistema de compras · PNCP', tipo: 'api', prazoMin: 1440, haMin: 800, area: null, telas: ['orcamento'] },
    { id: 'tributos', nome: 'IPTU, ISS e inadimplência', sistema: 'Sistema tributário', tipo: 'arquivo', prazoMin: 1440, haMin: 3 * 1440 + 200, area: null, telas: ['orcamento', 'cidadao'] },
    { id: 'cadunico', nome: 'Cadastro Único', sistema: 'CadÚnico (base municipal)', tipo: 'arquivo', prazoMin: 30 * 1440, haMin: 12 * 1440, area: 'assistencia', telas: ['indicadores', 'cidadao'] },
    { id: 'satisfacao', nome: 'Satisfação do cidadão', sistema: 'Pesquisa no portal e no 156', tipo: 'manual', prazoMin: 30 * 1440, haMin: 21 * 1440, area: null, telas: ['indicadores'] },
    { id: 'metas', nome: 'Compromissos do plano de governo', sistema: 'Lançado pelas secretarias no painel', tipo: 'manual', prazoMin: 7 * 1440, haMin: 2 * 1440, area: null, telas: ['metas'] },
  ];
  const NOME_TELA = { painel: 'Mapa', alertas: 'Alertas', secretarias: 'Secretarias', secretaria: 'Secretaria', indicadores: 'Indicadores', crise: 'Crise', cidadao: 'Portal do Cidadão', sazonal: 'Sazonal', orcamento: 'Orçamento', metas: 'Plano de governo' };
  const HASH_TELA = { painel: '#/painel', alertas: '#/alertas', secretarias: '#/secretarias', indicadores: '#/indicadores', crise: '#/crise', sazonal: '#/sazonal', orcamento: '#/orcamento', metas: '#/metas' };
  const pedidos = {};

  function situacao(f) {
    if (pedidos[f.id] && agora() - pedidos[f.id] < 10 * MIN) return 'pedida';
    if (f.tipo === 'manual') return f.haMin > f.prazoMin ? 'atrasada' : 'manual';
    if (f.haMin > f.prazoMin * 3) return 'atrasada';
    if (f.haMin > f.prazoMin) return 'atencao';
    return 'ok';
  }
  GC.SITUACAO_FONTE = { ok: 'No prazo', atencao: 'Um pouco atrasada', atrasada: 'Atrasada', manual: 'Manual', pedida: 'Atualização pedida' };
  const SIT_CLS = { ok: 'ok', atencao: 'atencao', atrasada: 'critico', manual: 'neutro', pedida: 'atencao' };
  function lista() { return FONTES.map((f) => Object.assign({}, f, { situacao: situacao(f), em: agora() - f.haMin * MIN })); }
  function tempo(min) {
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    const d = Math.round(min / 1440);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  const freq = (min) => (min < 60 ? `a cada ${min} min` : min < 1440 ? `a cada ${Math.round(min / 60)} h` : min === 1440 ? 'uma vez por dia' : min < 30 * 1440 ? `a cada ${Math.round(min / 1440)} dias` : 'uma vez por mês');
  GC.fontesDados = { lista, atrasadas: () => lista().filter((f) => f.situacao === 'atrasada'), tempo };

  GC.criarTelaFontes = function (el) {
    let filtro = '';
    let msg = '';
    const nomeArea = (id) => (id ? ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome : 'Gabinete e Fazenda');
    function desenhar() {
      const fs = lista();
      const conta = (s) => fs.filter((f) => f.situacao === s).length;
      const vis = fs.filter((f) => !filtro || f.situacao === filtro || (filtro === 'atrasada' && f.situacao === 'atencao'))
        .sort((a, b) => ['atrasada', 'atencao', 'pedida', 'manual', 'ok'].indexOf(a.situacao) - ['atrasada', 'atencao', 'pedida', 'manual', 'ok'].indexOf(b.situacao));
      const kpi = (rot, n, texto, cls, f) => `<button type="button" class="en-kpi ${cls}${filtro === f ? ' ativo' : ''}" data-ft="${f}" aria-pressed="${filtro === f}"><small>${rot}</small><b>${n}</b><span>${texto}</span></button>`;
      el.innerHTML = `
        <header class="sec-topo ft-topo">
          <div><h2>${ic('database-cog')} Fontes e integrações</h2>
            <p>De onde vem cada número do painel, como ele chega e quando foi atualizado. Dado atrasado fica marcado aqui e nas respostas da Maia.</p></div>
          <span class="en-topo-acoes"><button type="button" class="btn-sec btn-maia-tela" data-maia="Quais dados do painel estão desatualizados?"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia</button></span>
        </header>
        ${msg ? `<p class="pb-msg" role="status">${ic('circle-check')} ${esc(msg)}</p>` : ''}
        <div class="en-kpis">
          ${kpi('Fontes ligadas', fs.length, `${fs.filter((f) => f.tipo !== 'manual').length} automáticas · ${fs.filter((f) => f.tipo === 'manual').length} manuais`, '', '')}
          ${kpi('No prazo', conta('ok'), 'chegando na frequência combinada', 'bom', 'ok')}
          ${kpi('Atrasadas', conta('atrasada') + conta('atencao'), conta('atrasada') ? `${conta('atrasada')} bem atrasadas` : 'nenhuma bem atrasada', conta('atrasada') ? 'ruim' : '', 'atrasada')}
          ${kpi('Manuais', conta('manual'), 'lançadas por pessoas', '', 'manual')}
        </div>
        <section class="rel-cartao ft-fluxo" aria-label="Como os dados chegam">
          <ol class="ft-passos">
            <li>${ic('plug-connected')}<b>Sistemas da prefeitura e parceiros</b><small>saúde, escola, contabilidade, compras, sensores</small></li>
            <li>${ic('arrows-shuffle')}<b>Integração</b><small>automática, por arquivo ou lançada à mão</small></li>
            <li>${ic('shield-check')}<b>Conferência</b><small>formato, duplicados e dado pessoal (LGPD)</small></li>
            <li>${ic('layout-dashboard')}<b>Painel, portal e Maia</b><small>cada número diz de onde veio</small></li>
          </ol>
        </section>
        <section class="rel-cartao">
          <h3>${ic('list-details')} Fontes <small>${vis.length} ${filtro ? `· ${esc(GC.SITUACAO_FONTE[filtro] || '')}` : 'no total'}</small></h3>
          <div class="ft-tabela-caixa"><table class="sec-tabela ft-tabela">
            <thead><tr><th>Dado</th><th>Como chega</th><th>Última atualização</th><th>Usado em</th><th>Responsável</th><th></th></tr></thead>
            <tbody>${vis.map((f) => `<tr class="${f.situacao}">
              <td><b>${esc(f.nome)}</b><small>${esc(f.sistema)}</small></td>
              <td><span class="ft-tipo">${ic(GC.TIPOS_FONTE[f.tipo].icone)} ${esc(GC.TIPOS_FONTE[f.tipo].nome)}</span><small>${esc(freq(f.prazoMin))}</small></td>
              <td><span class="oc-selo ${SIT_CLS[f.situacao]}">${esc(GC.SITUACAO_FONTE[f.situacao])}</span><small>${esc(tempo(f.haMin))} · ${esc(new Date(f.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</small></td>
              <td><span class="ft-telas">${f.telas.map((t) => (HASH_TELA[t] ? `<a href="${HASH_TELA[t]}">${esc(NOME_TELA[t])}</a>` : `<span>${esc(NOME_TELA[t])}</span>`)).join('')}</span></td>
              <td>${esc(nomeArea(f.area))}</td>
              <td>${f.situacao === 'atrasada' || f.situacao === 'atencao' ? `<button type="button" class="btn-sec oc-mini-bt" data-ft-pedir="${f.id}">${ic('refresh')} Pedir atualização</button>` : ''}</td>
            </tr>`).join('')}</tbody></table></div>
          <p class="oc-nota">${ic('info-circle')} Demonstração: os sistemas e horários são simulados. Numa prefeitura, cada linha é uma integração configurada com a TI.</p>
        </section>`;
    }
    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-ft]');
      if (k) { filtro = filtro === k.dataset.ft ? '' : k.dataset.ft; msg = ''; desenhar(); return; }
      const p = e.target.closest('[data-ft-pedir]');
      if (p) {
        const f = FONTES.find((x) => x.id === p.dataset.ftPedir);
        pedidos[f.id] = agora();
        msg = `Pedido de atualização enviado ao responsável por "${f.nome}" (${nomeArea(f.area)}).`;
        if (GC.auditar) GC.auditar('fonte_pedir', { alvo: f.nome, detalhe: f.sistema });
        desenhar();
      }
    });
    return { mostrar() { desenhar(); }, atualizar() { /* muda pelos próprios botões */ } };
  };
})(window.GC = window.GC || {});
