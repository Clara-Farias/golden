(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.predios(dados do painel, opções).
  // Lê os dados sozinho (GC.predios, de js/data-predios.js); sem eles, devolve vazio.
  const { esc, plural, nomeBairro } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'predios', ordem: 85, nome: 'Manutenção de prédios', emoji: '🔧', icone: 'tools', categoria: 'cidade', descricao: 'Chamados abertos em escolas, UBS e prédios da Prefeitura, e vistorias vencidas' });

  // Manutenção de prédios públicos: o que é grave agora (chamado de gravidade alta ou vistoria vencida), os
  // chamados por tipo, as vistorias a vencer e a lista de prédios por situação.
  const SIT = { critica: 'Crítica', atencao: 'Atenção', ok: 'Em dia' };
  const dataBR = (iso) => iso.split('-').reverse().join('/');
  const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  const TIPO_EMOJI = { telhado: '🌧', ar: '🔧', eletrica: '💡', hidraulica: '🔧', acessibilidade: '👤' };

  function predios(r) {
    const graves = [
      ...r.chamadosGraves.map((x) => `<li data-camada="predios" data-id="${esc(x.predioId)}">⚠ <b>${esc(x.predioNome)}</b>: ${esc(x.titulo)} · há ${dias(x.diasAberto)}</li>`),
      ...r.vistoriasVencidas.map((v) => `<li data-camada="predios" data-id="${esc(v.predioId)}">📑 <b>${esc(v.predioNome)}</b>: ${esc(v.nome)} vencido desde ${dataBR(v.validade)}</li>`),
    ].join('');
    const tipos = Object.entries(GC.data.predios.tiposChamado)
      .map(([id, nome]) => `<li><span>${TIPO_EMOJI[id] || '🔧'} ${esc(nome)}</span><b>${r.porTipo[id] || 0}</b></li>`).join('');
    const aVencer = r.vistoriasAVencer.map((v) => `<li><button type="button" data-camada="predios" data-id="${esc(v.predioId)}" title="Ver no mapa">
        <span class="sit atencao">${v.faltamDias} d</span>
        <span class="nome">${esc(v.nome)}<small>${esc(v.predioNome)} · vence em ${dataBR(v.validade)}</small></span>
      </button></li>`).join('');
    const lista = r.predios.filter((p) => p.situacao !== 'ok').map((p) => `<li><button type="button" data-camada="predios" data-id="${esc(p.id)}" title="Ver no mapa">
        <span class="sit ${p.situacao}">${SIT[p.situacao]}</span>
        <span class="nome">${esc(p.nome)}<small>${esc(nomeBairro(p.bairroId))} · ${esc(p.pastaNome)} · ${esc(p.motivos[0] ? p.motivos[0].texto : '')}</small></span>
        <span class="qtd">${plural(p.chamados.length, 'chamado', 'chamados')}</span>
      </button></li>`).join('');
    const emDia = r.predios.length - r.criticos.length - r.emAtencao.length;
    return `<div class="w-predios">
      <div class="w-numeros">
        <div class="w-num ${r.criticos.length ? 'critica' : 'bom'}"><b>${r.criticos.length}</b><small>${r.criticos.length === 1 ? 'prédio em situação crítica' : 'prédios em situação crítica'} de ${r.predios.length}</small></div>
        <div class="w-num ${r.chamadosGraves.length ? 'critica' : ''}"><b>${r.chamados.length}</b><small>chamados abertos · ${r.chamadosGraves.length} de gravidade alta · ${r.chamadosAtrasados.length} fora do prazo</small></div>
        <div class="w-num ${r.vistoriasVencidas.length ? 'critica' : r.vistoriasAVencer.length ? 'alerta' : 'bom'}"><b>${r.vistoriasVencidas.length}</b><small>${r.vistoriasVencidas.length === 1 ? 'vistoria vencida' : 'vistorias vencidas'} · ${r.vistoriasAVencer.length} vencem em 30 dias</small></div>
      </div>
      ${graves ? `<ul class="w-obras-alertas">${graves}</ul>` : '<p class="w-predios-ok">✅ Nenhum chamado grave nem vistoria vencida.</p>'}
      <div class="w-seg-colunas w-det">
        <div>
          <h4>Prédios que pedem atenção <small>${plural(emDia, 'prédio em dia', 'prédios em dia')}</small></h4>
          <ul class="w-predios-lista">${lista}</ul>
        </div>
        <div>
          <h4>Chamados por tipo <small>${r.mediaDiasAberto} dias em aberto, em média</small></h4>
          <ul class="w-predios-tipos">${tipos}</ul>
          ${aVencer ? `<h4>Vistorias que vencem em 30 dias</h4><ul class="w-predios-lista">${aVencer}</ul>` : ''}
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.predios = () => (GC.predios ? predios(GC.predios.resumo()) : '');
})(window.GC = window.GC || {});
