(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.economia(dados do painel, opções).
  // Lê os dados sozinho (GC.economia); sem o arquivo de dados, devolve vazio.
  const { esc, plural } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'economia', ordem: 135, nome: 'Economia local', emoji: '📈', icone: 'building-store', categoria: 'gestao', descricao: 'Empresas abertas e fechadas, alvarás parados na fila e emprego com carteira por região' });

  const sinal = (n) => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;
  const SIT = { critica: 'Fecha mais', atencao: 'Virando', ok: 'Abre mais' };

  // Saldo de vagas com carteira, mês a mês: barra para cima (criou vagas) ou para baixo (fechou).
  function barras(meses, serie) {
    const max = Math.max(...serie.map(Math.abs), 1);
    return serie.map((n, i) => `<li title="${esc(meses[i])}: ${sinal(n)} vagas">
        <span class="pos">${n > 0 ? `<i style="--h:${Math.round((n / max) * 100)}%"></i>` : ''}</span>
        <span class="neg">${n < 0 ? `<i style="--h:${Math.round((-n / max) * 100)}%"></i>` : ''}</span>
        <small>${esc(meses[i])}</small></li>`).join('');
  }

  function economia(r) {
    const c = r.cidade;
    const alvaras = r.atrasados.map((x) => `<li><button type="button" data-camada="economia" data-id="${x.id}" title="Ver no mapa">
        <span class="dias ${x.situacao}">${x.diasNaFila} dias</span>
        <span class="nome">${esc(x.nome)}<small>${esc(x.atividade)} · parado em ${esc(x.etapaNome)} · ${plural(x.vagas, 'vaga prevista', 'vagas previstas')}</small></span>
      </button></li>`).join('');
    const bairros = r.bairros.map((b) => `<li><button type="button" data-camada="economia" data-id="${b.id}" title="Ver ${esc(b.nome)} no mapa">
        <span class="sit ${b.situacao}">${SIT[b.situacao]}</span>
        <span class="nome">${esc(b.nome)}<small>${b.abertas12} abertas · ${b.fechadas12} fechadas</small></span>
        <span class="saldo ${b.saldo12 < 0 ? 'neg' : 'pos'}">${sinal(b.saldo12)}</span>
      </button></li>`).join('');
    const regioes = r.regioes.map((g) => `<li data-destaque="${g.bairros.join(',')}" data-legenda="${esc(g.nome)}: ${sinal(g.empregos12)} vagas com carteira em 12 meses">
        <span>${esc(g.nome)}</span><b class="${g.empregos12 < 0 ? 'neg' : 'pos'}">${sinal(g.empregos12)}</b></li>`).join('');
    const gargalo = r.gargalo
      ? `<p class="w-eco-gargalo">⏳ O gargalo é ${esc(r.gargalo.nome)}: ${plural(r.gargalo.atrasados, 'pedido parado', 'pedidos parados')} além do prazo.</p>` : '';
    return `<div class="w-eco">
      <div class="w-numeros">
        <div class="w-num ${c.saldo12 < 0 ? 'critica' : 'bom'}"><b>${sinal(c.saldo12)}</b><small>saldo de empresas em 12 meses · ${c.abertas12.toLocaleString('pt-BR')} abertas, ${c.fechadas12.toLocaleString('pt-BR')} fechadas</small></div>
        <div class="w-num ${c.empregosMes < 0 ? 'critica' : 'bom'}"><b>${sinal(c.empregosMes)}</b><small>vagas com carteira no último mês · ${sinal(c.empregos12)} em 12 meses</small></div>
        <div class="w-num ${r.atrasados.length ? 'critica' : 'bom'}"><b>${r.atrasados.length}</b><small>${r.atrasados.length === 1 ? 'alvará parado' : 'alvarás parados'} além de ${r.metaDias} dias · ${plural(r.vagasTravadas, 'vaga travada', 'vagas travadas')}</small></div>
      </div>
      ${gargalo}
      <div class="w-seg-colunas w-det">
        <div>
          <h4>Alvarás fora do prazo <small>de ${plural(r.fila.length, 'pedido', 'pedidos')} na fila</small></h4>
          ${alvaras ? `<ul class="w-eco-lista">${alvaras}</ul>` : '<p class="w-eco-ok">✅ Nenhum alvará parado além do prazo.</p>'}
        </div>
        <div>
          <h4>Emprego com carteira <small>saldo de vagas por mês (cidade)</small></h4>
          <ul class="w-eco-barras">${barras(r.meses, c.serieEmpregos)}</ul>
          <h4>Por região <small>12 meses</small></h4>
          <ul class="w-eco-regioes">${regioes}</ul>
        </div>
      </div>
      <div class="w-det">
        <h4>Empresas por bairro <small>saldo em 12 meses</small></h4>
        <ul class="w-eco-lista w-eco-bairros">${bairros}</ul>
      </div>
    </div>`;
  }

  GC.conteudoWidget.economia = () => (GC.economia ? economia(GC.economia.resumo()) : '');
})(window.GC = window.GC || {});
