(function (GC) {
  // Telão · secretarias ordenadas pelo prazo cumprido nos últimos 30 dias, com a linha da meta.
  // Segue o filtro de secretarias do mapa; com menos de duas no filtro, não há o que comparar e a cena é pulada.
  const MAX = 8; // cabe na TV sem letra pequena; com mais, as 4 melhores e as 4 piores

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'secretarias',
    ordem: 20,
    nome: 'Prazo por secretaria',
    descricao: 'As secretarias da melhor para a pior no prazo cumprido, com a linha da meta',
    montar({ dados }) {
      if (!dados.desempenho) return null;
      const todas = dados.desempenho.secretarias.filter((s) => s.noFiltro)
        .slice().sort((a, b) => b.noPrazoPct - a.noPrazoPct || a.tempoMedioH - b.tempoMedioH);
      if (todas.length < 2) return null;
      const meta = todas[0].metaPrazoPct;
      const naMeta = todas.filter((s) => s.noPrazoPct >= meta).length;
      const vistas = todas.length > MAX ? [...todas.slice(0, MAX / 2), ...todas.slice(-MAX / 2)] : todas;
      const nome = (id) => { const a = ((GC.data && GC.data.areas) || []).find((x) => x.id === id); return a ? a.nome : id; };
      const esc = GC.escaparHtml;
      const linhas = vistas.map((s, i) => {
        const corte = todas.length > MAX && i === MAX / 2 ? ' corte' : '';
        return `<li class="${s.noPrazoPct < meta ? 'abaixo' : ''}${corte}"><span class="ts-nome">${esc(nome(s.area))}</span>`
          + `<span class="ts-barra" style="--v:${s.noPrazoPct}%;--meta:${meta}%" aria-hidden="true"><i></i></span><b>${s.noPrazoPct}%</b></li>`;
      }).join('');
      const titulo = naMeta === todas.length ? `Todas as ${todas.length} secretarias cumprem a meta de ${meta}% no prazo`
        : !naMeta ? `Nenhuma secretaria chega à meta de ${meta}% no prazo`
          : `${naMeta} de ${todas.length} secretarias cumprem a meta de ${meta}% no prazo`;
      return {
        rotulo: 'Prazo por secretaria',
        sub: 'Resolvidas no prazo · últimos 30 dias',
        titulo,
        html: `<ol class="ts-lista">${linhas}</ol><p class="ts-legenda"><i aria-hidden="true"></i> meta de ${meta}%</p>`,
      };
    },
  });
})(window.GC = window.GC || {});
