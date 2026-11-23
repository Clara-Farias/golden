(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.obras(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'obras', ordem: 80, nome: 'Obras públicas', emoji: '🏗', icone: 'crane', categoria: 'cidade', descricao: 'No prazo × atrasadas, por setor, com contrato, valor pago e avanço' });

  // Obras: números, chips de setor (filtram o widget e o mapa), alertas (paralisada, pago à frente do
  // feito) e a lista da mais atrasada à concluída, com obra feita × pago.
  const SIT_OBRA = { paralisada: 'Paralisada', atrasada: 'Atrasada', em_dia: 'No prazo', concluida: 'Concluída' };
  const reais = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  function obras(mod, { setor: setorObras = null } = {}) {
    if (!mod) return '';
    const r = mod.resumo(setorObras);
    const chips = [`<button type="button" class="chip ${setorObras ? '' : 'ativo'}" data-setor-obra="">Todas</button>`,
      ...r.porSetor.filter((s) => s.total).map((s) => `<button type="button" class="chip ${setorObras === s.id ? 'ativo' : ''}" data-setor-obra="${s.id}">${s.emoji} ${esc(s.nome)} <small>${s.total}${s.atrasadas ? ` · <em>${s.atrasadas} atras.</em>` : ''}</small></button>`)].join('');
    const alertas = [
      ...r.paralisadas.map((ob) => `<li data-camada="obras" data-id="${ob.id}">⏸ <b>${esc(ob.nome)}</b> sem avanço há ${ob.semAvancoDias} dias · ${ob.diasAtraso} dias de atraso</li>`),
      ...r.gastoAFrente.map((ob) => `<li data-camada="obras" data-id="${ob.id}">💰 <b>${esc(ob.nome)}</b>: pago ${ob.gastoPct}% do contrato com ${ob.avancoPct}% feito</li>`),
    ].join('');
    const lista = r.obras.map((ob) => `<li><button type="button" data-camada="obras" data-id="${ob.id}" title="Ver no mapa">
        <span class="sit ${ob.situacao}">${SIT_OBRA[ob.situacao]}</span>
        <span class="nome">${esc(ob.nome)}<small>${reais(ob.contratoMi)} · ${ob.diasAtraso ? `<em>${ob.diasAtraso} dias de atraso</em>` : ob.situacao === 'concluida' ? 'entregue no prazo' : `${ob.diasEmAndamento} dias em andamento`}</small></span>
        <span class="duas-barras"><i style="--v:${ob.avancoPct}%" title="Obra feita: ${ob.avancoPct}%"></i><i class="pago" style="--v:${Math.min(ob.gastoPct, 100)}%" title="Pago: ${ob.gastoPct}%"></i></span>
        <b>${ob.avancoPct}%</b>
      </button></li>`).join('');
    return `<div class="w-obras">
      <div class="w-numeros">
        <div class="w-num"><b>${r.emAndamento}</b><small>obras em andamento · ${r.noPrazo} no prazo</small></div>
        <div class="w-num ${r.atrasadas ? 'critica' : 'bom'}"><b>${r.atrasadas}</b><small>atrasadas · ${r.atrasoMedioDias} dias de atraso médio</small></div>
        <div class="w-num"><b>${reais(r.contratoMi)}</b><small>contratado · ${r.gastoPct}% já pago</small></div>
        <div class="w-num bom"><b>${r.concluidas}</b><small>entregues no ano</small></div>
      </div>
      <div class="w-obras-setores w-det">${chips}</div>
      ${alertas ? `<ul class="w-obras-alertas">${alertas}</ul>` : ''}
      <div class="w-obras-legenda w-det"><span><i></i> obra feita</span><span><i class="pago"></i> pago</span></div>
      <ul class="w-obras-lista w-det">${lista}</ul>
    </div>`;
  }

  GC.conteudoWidget.obras = (d, opcoes) => obras(d.obras, opcoes);

  // ---- Versão pública (embed.html): as obras da Prefeitura como um portal de transparência mostra.
  // Situação em palavras (inclusive atrasada e parada), quanto já foi feito, previsão de entrega, valor do
  // contrato e empresa. Sem os alertas internos (pago à frente do feito) e sem o setor que cuida.
  const { ic, nomeBairro, escolha } = GC.widgetUtil;
  const SIT_PUB = { em_dia: ['No prazo', 'ok'], atrasada: ['Atrasada', 'atencao'], paralisada: ['Parada', 'critica'], concluida: ['Entregue', 'entregue'] };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesAno = (iso) => `${MESES[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`;
  // R$ 1,9 milhão · R$ 12,6 milhões (tom-de-voz.md).
  const milhoes = (v) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${v < 2 ? 'milhão' : 'milhões'}`;
  function situacaoObra(ob) {
    if (ob.situacao === 'concluida') return `entregue em ${mesAno(ob.previsaoAtual)}`;
    if (ob.situacao === 'paralisada') return `sem avanço há ${ob.semAvancoDias} dias · previsão era ${mesAno(ob.previsaoOriginal)}`;
    if (ob.situacao === 'atrasada') return ob.previsaoAtual > ob.previsaoOriginal
      ? `nova previsão: ${mesAno(ob.previsaoAtual)} (era ${mesAno(ob.previsaoOriginal)})`
      : `previsão era ${mesAno(ob.previsaoOriginal)}`;
    return `entrega prevista para ${mesAno(ob.previsaoAtual)}`;
  }
  function obrasPublico(op = {}) {
    const r = GC.obras.resumo();
    const comObra = [...new Set(r.obras.map((ob) => ob.bairroId))]
      .map((id) => ({ id, nome: nomeBairro(id) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const bairro = comObra.some((b) => b.id === op.bairro) ? op.bairro : '';
    const lista = r.obras.filter((ob) => !bairro || ob.bairroId === bairro);
    const andamento = lista.filter((ob) => ob.situacao !== 'concluida').length;
    const itens = lista.map((ob) => {
      const [rotulo, cls] = SIT_PUB[ob.situacao];
      return `<li><span class="vp-nivel ${cls}">${rotulo}</span>
        <span class="vp-obra"><b>${esc(ob.nome)}</b><small>${esc(nomeBairro(ob.bairroId))} · ${esc(situacaoObra(ob))}</small>
          <span class="vp-barra" role="img" aria-label="${ob.avancoPct}% da obra feita"><i style="--v:${Math.min(ob.avancoPct, 100)}%"></i></span>
          <small>${ob.avancoPct}% feito · contrato de ${milhoes(ob.contratoMi)} · ${esc(ob.empresa)}</small></span></li>`;
    }).join('');
    return `<div class="vp-obras">
      ${escolha('bairro', 'Bairro', 'Toda a cidade', comObra, bairro)}
      <div class="vp-numeros">
        <div><b>${andamento}</b><small>${andamento === 1 ? 'obra em andamento' : 'obras em andamento'}</small></div>
        <div><b>${lista.length - andamento}</b><small>${lista.length - andamento === 1 ? 'entregue' : 'entregues'} no ano</small></div>
      </div>
      ${itens ? `<ul class="vp-lista">${itens}</ul>` : `<p class="vp-vazio">${ic('info-circle')} Nenhuma obra neste bairro agora.</p>`}
      <p class="vp-fonte">Valores dos contratos assinados. Dúvidas ou denúncias sobre uma obra: ${esc(GC.widgetUtil.telefone())}.</p>
    </div>`;
  }
  GC.conteudoPublico.obras = {
    nome: 'Obras da Prefeitura',
    descricao: 'Cada obra com a situação, quanto já foi feito, a previsão de entrega e o contrato',
    opcoes: [{ id: 'bairro', rotulo: 'Bairro já escolhido', valores: () => [...new Set(GC.obras.resumo().obras.map((ob) => ob.bairroId))].map((id) => ({ id, nome: nomeBairro(id) })) }],
    montar: obrasPublico,
  };
})(window.GC = window.GC || {});
