(function (GC) {
  // Telão · boas notícias: o que foi resolvido na última hora (dentro dos filtros do mapa). Sem nenhuma na
  // última hora, o balanço dos 30 dias comparado ao mês anterior, para a cena nunca ficar vazia.
  const MAX = 4;
  const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
  const decimal = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const nomeBairro = (id) => { const b = ((GC.data && GC.data.bairros) || []).find((x) => x.id === id); return b ? b.nome : ''; };

  function haQuanto(min) {
    if (min < 1) return 'agora';
    return `há ${GC.tempoTexto(min)}`;
  }

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'resolvidas',
    ordem: 30,
    nome: 'Resolvidas',
    descricao: 'O que foi resolvido na última hora; sem nenhuma, o balanço de 30 dias',
    montar({ dados }) {
      const esc = GC.escaparHtml;
      const lista = dados.resolvidas || [];
      if (lista.length) {
        const noPrazo = lista.filter((o) => o.noPrazo).length;
        const itens = lista.slice(0, MAX).map((o) => `<li><i class="ti ti-circle-check" aria-hidden="true"></i>`
          + `<span>${esc(o.titulo)}<small>${esc(nomeBairro(o.bairroId))} · ${o.noPrazo ? 'dentro do prazo' : 'fora do prazo'}</small></span>`
          + `<time>${haQuanto((dados.agora - o.resolvidaEm) / 60000)}</time></li>`).join('');
        const resto = lista.length - MAX;
        return {
          rotulo: 'Resolvidas',
          sub: 'Última hora',
          titulo: `${plural(lista.length, 'ocorrência resolvida', 'ocorrências resolvidas')} na última hora, ${noPrazo === lista.length ? (lista.length === 1 ? 'dentro do prazo' : 'todas dentro do prazo') : `${noPrazo} dentro do prazo`}`,
          html: `<ul class="tr-lista">${itens}</ul>${resto > 0 ? `<div class="tc-seguir">e mais ${resto}</div>` : ''}`,
        };
      }
      const r = dados.desempenho && dados.desempenho.resumo;
      if (!r || !r.resolvidas) return null;
      const comp = (agora, antes, unidade, menorMelhor) => {
        const d = Math.round((agora - antes) * 10) / 10;
        if (!d) return '<small class="tn-var">igual ao mês anterior</small>';
        const melhor = menorMelhor ? d < 0 : d > 0;
        return `<small class="tn-var ${melhor ? 'melhor' : 'pior'}">${d > 0 ? '▲' : '▼'} ${decimal(Math.abs(d))}${unidade} sobre o mês anterior</small>`;
      };
      return {
        rotulo: 'Resolvidas',
        sub: 'Últimos 30 dias',
        titulo: `${plural(r.resolvidas, 'ocorrência resolvida', 'ocorrências resolvidas')} em 30 dias`,
        html: `<div class="tn-grade tres">
          <div class="tn-num"><b>${r.resolvidas.toLocaleString('pt-BR')}</b><span>resolvidas</span>${comp(r.resolvidas, r.resolvidasAnt, '', false)}</div>
          <div class="tn-num"><b>${r.noPrazoPct}%</b><span>dentro do prazo</span>${comp(r.noPrazoPct, r.noPrazoPctAnt, ' p.p.', false)}</div>
          <div class="tn-num"><b>${decimal(r.tempoMedioH)} h</b><span>tempo médio de resposta</span>${comp(r.tempoMedioH, r.tempoMedioHAnt, ' h', true)}</div>
        </div>`,
      };
    },
  });
})(window.GC = window.GC || {});
