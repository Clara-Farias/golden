(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.numeros(dados do painel, opções).
  // Números-chave e satisfação por bairro (widgets gerais, sem domínio próprio).
  const { esc, horas } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'numeros', ordem: 10, nome: 'Números-chave', emoji: '🔢', icone: 'numbers', categoria: 'gestao', descricao: 'Críticas, prazos, atendimento, satisfação e tempo médio' });
  GC.registrarWidget({ id: 'satisfacao', ordem: 40, nome: 'Satisfação por bairro', emoji: '🙂', icone: 'mood-smile', categoria: 'cidadao', descricao: 'Satisfação dos moradores, do pior ao melhor bairro' });

  function numeros(k) {
    const itens = [
      ['critica', k.criticas, 'críticas ativas'],
      ['alerta', k.estouradas, 'com prazo estourado'],
      ['andamento', k.emAndamento, 'equipes em campo'],
      ['bom', `${k.satisfacaoPct}%`, 'satisfação'],
      ['', `${k.noPrazoPct}%`, 'resolvidas no prazo (30 dias)'],
      ['', horas(k.tempoMedioH), 'tempo médio de resolução'],
    ];
    return `<div class="w-numeros">${itens.map(([c, v, r]) => `<div class="w-num ${c}"><b>${v}</b><small>${r}</small></div>`).join('')}</div>`;
  }

  function satisfacao(porBairro, selecionado) {
    const todas = GC.data.bairros.map((b) => ({ b, v: porBairro[b.id] })).filter((x) => typeof x.v === 'number').sort((a, b) => a.v - b.v);
    // Cidade grande: só os 8 piores (e o bairro selecionado, se não estiver entre eles).
    const MAX = 8;
    const linhas = todas.length > 12 ? todas.filter((x, i) => i < MAX || x.b.id === selecionado) : todas;
    const nota = linhas.length < todas.length ? `<p class="w-legenda">Os ${MAX} bairros com menor satisfação, de ${todas.length}.</p>` : '';
    return `${nota}<ul class="w-satisf">${linhas.map(({ b, v }) => `
      <li><div class="w-satisf-linha${b.id === selecionado ? ' ativo' : ''}">
        <span>${esc(b.nome)}</span><i style="--v:${v}%" class="${v < 60 ? 'ruim' : v < 75 ? 'medio' : 'bom'}"></i><b>${v}%</b>
      </div></li>`).join('')}</ul>
      <p class="w-legenda" aria-label="Legenda das cores"><span><i style="background:var(--critica)"></i>abaixo de 60%</span><span><i style="background:var(--media)"></i>60% a 74%</span><span><i style="background:var(--positivo)"></i>75% ou mais</span></p>${avaliacoesPortal(selecionado)}`;
  }
  // As avaliações feitas no portal depois de um pedido resolvido (js/satisfacao.js), em separado: uma nota
  // mexe pouco no percentual da pesquisa, mas aqui aparece na hora.
  function avaliacoesPortal(bairroId) {
    if (!GC.satisfacao || !GC.pedidos) return '';
    const r = GC.satisfacao.resumoAvaliacoes({ bairroId: bairroId || null, dias: 30 });
    if (!r.n) return '';
    const media = r.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `<p class="w-legenda w-aval-portal">Portal do Cidadão${bairroId ? ` · ${esc((GC.data.bairros.find((b) => b.id === bairroId) || {}).nome || '')}` : ''}: <b>${media} de 5</b> em ${r.n} avaliaç${r.n > 1 ? 'ões' : 'ão'} após o atendimento (30 dias) · ${r.resolvidoPct}% dizem que o problema foi resolvido.</p>`;
  }

  GC.conteudoWidget.numeros = (d) => numeros(d.kpis);
  GC.conteudoWidget.satisfacao = (d) => satisfacao(d.satisfacao, d.bairro);
})(window.GC = window.GC || {});
