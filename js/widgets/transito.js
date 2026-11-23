(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.transito(dados do painel, opções).
  // Lê os dados sozinho (GC.transito, js/data-transito.js); sem eles, devolve vazio.
  const { esc, plural, nomeBairro } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'transito', ordem: 65, nome: 'Segurança no trânsito', emoji: '🚦', icone: 'car-crash', categoria: 'seguranca', descricao: 'Pontos críticos de acidente, mortes, atropelamentos perto de escolas e a medida sugerida' });

  const SIT = { critica: 'Crítico', atencao: 'Atenção', ok: 'Monitorar' };
  const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
  function transito(r) {
    const t = r.tendencia;
    const escolas = r.pertoEscola.map((x) => `<li data-camada="transito" data-id="${x.id}">⚠ <b>${esc(x.nome)}</b>: ${plural(x.atropelamentos, 'atropelamento', 'atropelamentos')} a ${x.escola.distanciaM} m da ${esc(x.escola.nome)}. 👉 ${esc(x.medida)}</li>`).join('');
    const lista = r.pontos.map((x) => `<li><button type="button" data-camada="transito" data-id="${x.id}" title="Ver no mapa">
        <span class="sit ${x.situacao}">${SIT[x.situacao]}</span>
        <span class="nome">${esc(x.nome)}<small>${esc(nomeBairro(x.bairroId))} · ${x.acidentes} acidentes · ${x.comVitima} com vítima${x.mortes ? ` · ${plural(x.mortes, 'morte', 'mortes')}` : ''}${x.escola ? ` · ${esc(x.escola.nome)} a ${x.escola.distanciaM} m` : ''}</small></span>
        <span class="tend ${x.tendencia.sentido}">${x.tendencia.sentido === 'estavel' ? 'estável' : sinal(x.tendencia.variacaoPct)}</span>
      </button></li>`).join('');
    const bairrosEscola = [...new Set(r.pertoEscola.map((x) => x.bairroId))];
    return `<div class="w-transito">
      <div class="w-numeros">
        <div class="w-num ${t.sentido === 'subindo' ? 'alerta' : t.sentido === 'caindo' ? 'bom' : ''}"><b>${r.acidentes.toLocaleString('pt-BR')}</b><small>acidentes em ${esc(r.periodo)} · ${sinal(t.variacaoPct)} no último semestre</small></div>
        <div class="w-num ${r.mortes ? 'critica' : 'bom'}"><b>${r.mortes}</b><small>${r.mortes === 1 ? 'morte' : 'mortes'} · ${r.comVitima} acidentes com vítima</small></div>
        <div class="w-num ${r.atropelamentosPertoEscola ? 'critica' : 'bom'}"${bairrosEscola.length ? ` data-destaque="${bairrosEscola.join(',')}" data-legenda="Bairros com atropelamento perto de escola"` : ''}><b>${r.atropelamentosPertoEscola}</b><small>de ${plural(r.atropelamentos, 'atropelamento', 'atropelamentos')} foram a menos de ${GC.data.transito.raioEscolaM} m de uma escola</small></div>
      </div>
      ${escolas ? `<ul class="w-obras-alertas w-transito-escolas">${escolas}</ul>` : ''}
      <div class="w-det">
        <h4>Pontos críticos <small>${esc(r.fonte)}</small></h4>
        <ul class="w-transito-lista">${lista}</ul>
      </div>
    </div>`;
  }

  GC.conteudoWidget.transito = () => (GC.transito && GC.data.transito ? transito(GC.transito.resumo()) : '');
})(window.GC = window.GC || {});
