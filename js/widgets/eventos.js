(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.eventos(dados do painel, opções).
  // Lê os dados sozinho (GC.eventos, de js/data-eventos.js); sem eles, devolve ''.
  const { esc, plural } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'eventos', ordem: 375, nome: 'Grandes eventos', emoji: '🎉', icone: 'confetti', categoria: 'cidade', descricao: 'Plano de operação dos eventos: ônibus extras, SAMU, limpeza e segurança, com público previsto e real' });

  const SIT = { critica: 'Atenção', atencao: 'Pendente', ok: 'Pronto', realizado: 'Feito' };
  const EMOJI = { mobilidade: '🚌', saude: '🚑', limpeza: '🧹', seguranca: '🛡' };
  const num = (x) => Number(x).toLocaleString('pt-BR');
  const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;

  function quando(e) {
    if (e.status === 'em_andamento') return e.duracao > 1 ? `dia ${e.diaAtual} de ${e.duracao}` : `hoje, ${e.horario}`;
    if (e.status === 'proximo') return `${dataCurta(e.inicio)} · em ${plural(e.faltamDias, 'dia', 'dias')}`;
    return e.inicio === e.fim ? dataCurta(e.inicio) : `${dataCurta(e.inicio)} a ${dataCurta(e.fim)}`;
  }
  function publico(e) {
    if (e.desvioPct === null) return `${num(e.publicoPrevisto)} previstos`;
    return `${num(e.publicoReal)} ${e.parcial ? 'até agora' : 'pessoas'} · <b class="ev-desvio ${e.lotado ? 'acima' : e.desvioPct < 0 ? 'abaixo' : ''}">${sinal(e.desvioPct)}</b> do previsto`;
  }
  // As quatro frentes do plano, como fichas na cor da situação.
  const frentes = (e) => e.frentes.map((f) => `<span class="ev-frente ${f.situacao}" title="${esc(`${f.nome}: ${f.textoPrevisto}${f.textoFeito ? `. Feito: ${f.textoFeito}` : ''}`)}">${EMOJI[f.id]} ${esc(f.nome)}</span>`).join('');

  function eventos(r) {
    if (!r || !r.eventos.length) return '';
    // O que pede atenção: plano atrasado em evento que não acabou, ou público bem acima do previsto agora.
    const alertas = r.atencao.map((e) => {
      const partes = [];
      if (e.plano === 'atrasado') partes.push(`${e.pendentes.filter((f) => f.situacao === 'atrasado').map((f) => f.nome.toLowerCase()).join(', ')} sem ficar ${e.pendentes.filter((f) => f.situacao === 'atrasado').length === 1 ? 'pronta' : 'prontas'}`);
      if (e.lotado) partes.push(`público ${sinal(e.desvioPct)} acima do previsto`);
      return `<li data-camada="eventos" data-id="${esc(e.id)}">⚠ <b>${esc(e.nome)}</b>: ${esc(partes.join(' e '))}</li>`;
    }).join('');
    const limpeza = r.limpezaAtrasada.map((e) => {
      const f = e.frentes.find((x) => x.id === 'limpeza');
      return `<li data-camada="eventos" data-id="${esc(e.id)}">🧹 <b>${esc(e.nome)}</b>: limpeza levou ${f.feito.horas} h (prazo era ${f.previsto.prazoHoras} h)</li>`;
    }).join('');
    const lista = r.eventos.map((e) => `<li><button type="button" data-camada="eventos" data-id="${esc(e.id)}" title="Ver no mapa">
        <span class="sit ${e.situacao}">${SIT[e.situacao]}</span>
        <span class="nome">${esc(e.nome)}<small>${esc(e.local.nome)} · ${quando(e)} · ${publico(e)}</small>
          <span class="ev-frentes">${frentes(e)}</span></span>
      </button></li>`).join('');
    const proxPub = r.publicoPrevistoProximos;
    return `<div class="w-eventos">
      <div class="w-numeros">
        <div class="w-num ${r.emAndamento.length ? 'andamento' : ''}"><b>${r.emAndamento.length}</b><small>${r.emAndamento.length === 1 ? 'evento acontecendo agora' : 'eventos acontecendo agora'}</small></div>
        <div class="w-num"><b>${r.proximos.length}</b><small>${r.proximos.length === 1 ? 'próximo evento' : 'próximos eventos'} · ${num(proxPub)} pessoas previstas</small></div>
        <div class="w-num ${r.planosAtrasados.length ? 'critica' : 'bom'}"><b>${r.planosAtrasados.length}</b><small>${r.planosAtrasados.length === 1 ? 'plano com frente atrasada' : 'planos com frente atrasada'}</small></div>
        <div class="w-num"><b>${r.onibusExtrasProximos}</b><small>ônibus extras programados</small></div>
      </div>
      ${alertas || limpeza ? `<ul class="w-obras-alertas">${alertas}${limpeza}</ul>` : ''}
      <div class="w-det">
        <h4>Eventos <small>últimos ${GC.data.eventos.janelaPassadoDias} dias e próximos ${GC.data.eventos.janelaFuturoDias}</small></h4>
        <ul class="w-ev-lista">${lista}</ul>
      </div>
    </div>`;
  }

  GC.conteudoWidget.eventos = () => (GC.eventos ? eventos(GC.eventos.resumo()) : '');
})(window.GC = window.GC || {});
