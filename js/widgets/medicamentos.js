(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.medicamentos(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'medicamentos', ordem: 120, nome: 'Medicamentos', emoji: '💊', icone: 'pill', categoria: 'saude', descricao: 'Faltas nas UBS, previsão da IA, compras e remanejamentos sugeridos' });

  // Medicamentos: faltas nas UBS, a previsão da IA (o que vai faltar e por quê), o que comprar e o que
  // remanejar entre UBS antes de comprar; a tabela mostra os dias de cobertura de cada item na rede.
  const ST_MED = { ruptura: 'Em falta', critico: 'Crítico', atencao: 'Atenção', ok: 'Em dia', excesso: 'Sobrando' };
  function medicamentos(r) {
    if (!r) return '';
    const n = (v) => v.toLocaleString('pt-BR');
    const previsao = r.vaoFaltar.map((x) => {
      const porque = x.motivoIA ? ` · consumo previsto +${Math.round((x.fatorIA - 1) * 100)}% (${esc(x.motivoIA)})` : '';
      const acao = x.pedido ? `pedido de ${n(x.pedido)} chega em ${x.chegaEmDias} dias: antecipar a entrega` : `comprar ${n(x.compraSugerida)} (${esc(x.apresentacao)})`;
      return `<li><b>${esc(x.nome)}</b> acaba em ~${n(Math.floor(x.dias))} dias${porque}. 👉 ${acao}</li>`;
    }).join('');
    const remanejar = r.remanejamentos.map((x) => `<li data-camada="farmacias" data-id="${x.paraId}">🔄 ${n(x.qtd)} (${esc(x.apresentacao)}) de <b>${esc(x.medicamento)}</b>: ${esc(x.de)} → ${esc(x.para)}</li>`).join('');
    const maxDias = 90;
    const itens = r.itens.map((x) => `<li><span>${esc(x.nome)}<small>${esc(x.uso)} · ${n(x.consumoPrevistoDia)}/dia${x.ubsEmRuptura.length ? ` · <em>falta: ${esc(x.ubsEmRuptura.join(', '))}</em>` : ''}</small></span>
        <i style="--v:${Math.min(100, Math.round((x.dias / maxDias) * 100))}%" class="${x.dias < 15 ? 'ruim' : x.dias < 30 ? 'medio' : 'bom'}"></i><b>${n(Math.floor(x.dias))} d</b></li>`).join('');
    const ubs = r.farmacias.map((f) => `<li><button type="button" data-camada="farmacias" data-id="${f.id}" title="Ver no mapa">
        <span class="sit ${f.situacao}">${f.rupturas.length ? `${f.rupturas.length} em falta` : f.criticos.length ? 'Baixo' : 'Em dia'}</span>
        <span class="nome">${esc(f.nome)}<small>${[...f.rupturas, ...f.criticos].map((x) => `${esc(x.nome)} (${x.situacao === 'ruptura' ? 'em falta' : `${n(Math.floor(x.dias))} d`})`).join(' · ') || 'todos os itens com mais de 7 dias'}</small></span>
      </button></li>`).join('');
    return `<div class="w-med">
      <div class="w-numeros">
        <div class="w-num ${r.rupturas ? 'critica' : 'bom'}"><b>${r.rupturas}</b><small>itens em falta em ${r.ubsComRuptura.length} UBS</small></div>
        <div class="w-num ${r.vaoFaltar.length ? 'alerta' : 'bom'}"><b>${r.vaoFaltar.length}</b><small>itens vão faltar na rede antes da reposição (previsão da IA)</small></div>
        <div class="w-num"><b>${r.remanejamentos.length}</b><small>remanejamentos sugeridos entre UBS</small></div>
        <div class="w-num"><b>${r.excesso.length}</b><small>itens sobrando (mais de 60 dias)</small></div>
      </div>
      <div class="w-med-ia">
        <h4>✨ Previsão da IA</h4>
        ${previsao ? `<ul>${previsao}</ul>` : '<p>Nenhum item deve faltar antes da reposição.</p>'}
        ${remanejar ? `<div class="w-det"><h4>Remanejar antes de comprar</h4><ul class="w-med-reman">${remanejar}</ul></div>` : ''}
      </div>
      <div class="w-seg-colunas w-det">
        <div><h4>Dias de estoque na rede <small>com o consumo previsto</small></h4><ul class="w-barras w-med-itens">${itens}</ul></div>
        <div><h4>Farmácias das UBS</h4><ul class="w-edu-lista w-med-ubs">${ubs}</ul></div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.medicamentos = (d) => medicamentos(d.medicamentos);

  // ---- Versão pública (embed.html): "tem o meu remédio na UBS?". O morador escolhe a UBS e vê cada remédio
  // como "Tem", "Acabando" ou "Em falta", com onde ainda tem. Sem estoque em números, compras nem previsão da IA.
  const { ic, escolha, listaE } = GC.widgetUtil;
  const SIT_PUB = { ruptura: ['Em falta', 'critica'], critico: ['Acabando', 'atencao'] };
  const temNa = (x) => x.situacao !== 'ruptura' && x.situacao !== 'critico';
  function medicamentosPublico(op = {}) {
    const fs = GC.medicamentos.farmacias().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const f = fs.find((x) => x.id === op.ubs) || null;
    const campo = escolha('ubs', 'Sua unidade de saúde', 'Escolha a UBS', fs.map((x) => ({ id: x.id, nome: x.nome })), f ? f.id : '');
    const dica = '<p class="vp-fonte">Leve a receita e o cartão do SUS. A lista mostra os remédios mais procurados da farmácia básica.</p>';
    if (!f) {
      const lista = fs.map((x) => {
        const falta = x.rupturas.length;
        return `<li><span class="vp-nivel ${falta ? 'atencao' : 'ok'}">${falta ? `${falta} em falta` : 'Tudo em dia'}</span>
          <span>${esc(x.nome)}<small>${falta ? `Falta: ${esc(listaE(x.rupturas.map((m) => m.nome)))}` : 'todos os remédios da lista'}</small></span></li>`;
      }).join('');
      return `<div class="vp-med">${campo}<h3>Como estão as farmácias das UBS</h3><ul class="vp-lista">${lista}</ul>${dica}</div>`;
    }
    const meds = GC.data.medicamentos.medicamentos;
    const ordem = (x) => (x.situacao === 'ruptura' ? 0 : x.situacao === 'critico' ? 1 : 2); // em falta, acabando, tem
    const itens = f.itens.slice().sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => {
      const [rotulo, cls] = SIT_PUB[x.situacao] || ['Tem', 'ok'];
      const uso = (meds.find((m) => m.id === x.id) || {}).uso;
      const outras = x.situacao === 'ruptura'
        ? fs.filter((o) => o.id !== f.id && temNa(o.itens.find((i) => i.id === x.id))).map((o) => o.nome) : [];
      const onde = x.situacao === 'ruptura' ? (outras.length ? ` · tem na ${esc(listaE(outras))}` : ' · em falta na rede, reposição a caminho') : '';
      return `<li><span class="vp-nivel ${cls}">${rotulo}</span><span>${esc(x.nome)}<small>${esc(uso || '')}${onde}</small></span></li>`;
    }).join('');
    return `<div class="vp-med">${campo}
      ${f.rupturas.length ? `<div class="vp-faixa atencao">${ic('pill')}<div><b>${f.rupturas.length === 1 ? '1 remédio em falta' : `${f.rupturas.length} remédios em falta`} nesta UBS</b>
        <span>Veja abaixo onde ainda tem.</span></div></div>` : `<div class="vp-faixa ok">${ic('circle-check')}<div><b>Todos os remédios da lista disponíveis</b><span>Alguns podem estar acabando: confira abaixo.</span></div></div>`}
      <ul class="vp-lista">${itens}</ul>${dica}</div>`;
  }
  GC.conteudoPublico.medicamentos = {
    nome: 'Remédios nas UBS',
    descricao: 'Quais remédios tem na farmácia de cada UBS e onde procurar o que falta',
    opcoes: [{ id: 'ubs', rotulo: 'UBS já escolhida', valores: () => GC.medicamentos.farmacias().map((x) => ({ id: x.id, nome: x.nome })) }],
    montar: medicamentosPublico,
  };
})(window.GC = window.GC || {});
