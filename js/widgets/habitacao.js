(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.habitacao(dados do painel, opções).
  // O widget lê os dados sozinho (GC.habitacao); sem o módulo, fica vazio. Sem versão pública: as ocupações e a
  // fila falam de famílias, e o recorte é interno.
  const { esc, plural } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'habitacao', ordem: 95, nome: 'Habitação', emoji: '🏠', icone: 'home-heart', categoria: 'cidade', descricao: 'Ocupações irregulares em área de risco, fila de moradia e regularização de terrenos (REURB)' });

  const SIT_OCUPACAO = { critica: 'Risco', atencao: 'Cresce', ok: 'Estável' };
  const SIT_NUCLEO = { critica: 'Atrasada', em_dia: 'No prazo', ok: 'Concluída' };
  const MAX_FILA = 5;

  function habitacao(r) {
    if (!r) return '';
    const top = r.emRisco[0];
    const alerta = top ? `<div class="w-hab-alerta">
        <div><b>⚠ ${plural(r.familiasEmRisco, 'família mora', 'famílias moram')} em ocupações dentro de área de risco</b>
        <small>${plural(r.emRisco.length, 'ocupação', 'ocupações')} · ${r.emRiscoForaDaFila ? `${plural(r.emRiscoForaDaFila, 'família ainda fora', 'famílias ainda fora')} da fila de moradia` : 'todas já inscritas na fila de moradia'}</small></div>
        <button type="button" class="btn-sec" data-camada="habitacao" data-id="${esc(top.id)}">📍 Ver no mapa</button>
      </div>` : '<p class="w-hab-ok">✅ Nenhuma ocupação dentro de área de risco.</p>';

    const ocupacoes = r.ocupacoes.map((x) => `<li><button type="button" data-camada="habitacao" data-id="${esc(x.id)}" title="Ver ${esc(x.nome)} no mapa">
        <span class="sit ${x.situacao}">${SIT_OCUPACAO[x.situacao]}</span>
        <span class="nome">${esc(x.nome)}<small>${esc(GC.widgetUtil.nomeBairro(x.bairroId))} · ${x.emRisco ? `área de ${esc(x.areaRisco.tipo)}` : x.recente ? 'começou este ano' : x.crescendo ? `+${x.crescimentoPct}% em 12 meses` : `desde ${x.desde.slice(0, 4)}`}</small></span>
        <span class="num">${plural(x.familias, 'família', 'famílias')}</span>
      </button></li>`).join('');

    const fila = r.fila.slice(0, MAX_FILA).map((l) => `<li><button type="button" data-destaque="${esc(l.bairroId)}" data-legenda="Fila de moradia · bairro em destaque" title="Destacar ${esc(l.nome)} no mapa">
        <span class="nome">${esc(l.nome)}<small>${l.inscritas.toLocaleString('pt-BR')} inscritas · ${l.prioritarias} com prioridade</small></span>
        <span class="num ${l.esperaMeses >= 48 ? 'longa' : ''}">${l.esperaMeses} meses</span>
      </button></li>`).join('');

    const nucleos = r.reurb.map((n) => `<li><button type="button" data-camada="habitacao" data-id="${esc(n.id)}" title="Ver ${esc(n.nome)} no mapa">
        <span class="sit ${n.situacao}">${SIT_NUCLEO[n.situacao]}</span>
        <span class="nome">${esc(n.nome)}<small>${esc(n.modalidade)} · ${plural(n.lotes, 'lote', 'lotes')} · ${esc(n.etapaNome)}${n.atrasado ? ` · ${plural(n.diasAtraso, 'dia', 'dias')} de atraso` : ''}</small></span>
        <span class="hab-barra" aria-hidden="true"><i style="--p:${n.progressoPct}%"></i></span>
      </button></li>`).join('');

    const destaqueRisco = [...new Set(r.emRisco.map((x) => x.bairroId))].join(',');
    return `<div class="w-hab">
      ${alerta}
      <div class="w-numeros">
        <div class="w-num"><b>${r.familiasIrregulares.toLocaleString('pt-BR')}</b><small>famílias em ${plural(r.ocupacoes.length, 'ocupação irregular', 'ocupações irregulares')}</small></div>
        <div class="w-num ${r.emRisco.length ? 'critica' : 'bom'}"><b>${r.familiasEmRisco}</b><small>famílias em área de risco</small></div>
        <div class="w-num alerta"><b>${r.filaTotal.toLocaleString('pt-BR')}</b><small>famílias na fila de moradia · espera média de ${r.esperaMediaMeses} meses</small></div>
        <div class="w-num ${r.reurbAtrasados.length ? 'critica' : 'bom'}"><b>${r.reurbAtrasados.length}</b><small>${r.reurbAtrasados.length === 1 ? 'REURB atrasada' : 'REURBs atrasadas'} de ${r.reurbAndamento.length} em andamento · ${r.lotesTitulados} lotes já titulados</small></div>
      </div>
      <div class="w-seg-colunas w-det">
        <div>
          <h4>Ocupações irregulares</h4>
          <ul class="w-hab-lista">${ocupacoes}</ul>
          ${destaqueRisco ? `<button type="button" class="w-hab-link" data-destaque="${destaqueRisco}" data-legenda="Bairros com ocupação em área de risco">Destacar os bairros com ocupação em área de risco</button>` : ''}
        </div>
        <div>
          <h4>Fila de moradia <small>maior espera primeiro</small></h4>
          <ul class="w-hab-lista w-hab-fila">${fila}</ul>
          <p class="w-hab-prioridades">Prioridades: <b>${r.prioridades.areaRisco}</b> em área de risco · <b>${r.prioridades.idosos}</b> idosos · <b>${r.prioridades.pcd}</b> com deficiência</p>
          <h4>Regularização de terrenos (REURB)</h4>
          <ul class="w-hab-lista">${nucleos}</ul>
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.habitacao = () => (GC.habitacao ? habitacao(GC.habitacao.resumo()) : '');
})(window.GC = window.GC || {});
