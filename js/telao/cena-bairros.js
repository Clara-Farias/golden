(function (GC) {
  // Telão · bairros pela carga de ocorrências abertas: o mapa pinta cada bairro de amarelo (menos) a
  // vinho (mais), nas cores do mapa de calor, e o cartão lista os mais carregados. A carga pesa a
  // gravidade (crítica 3, alta 2, média 1), como no widget "Bairros em calor" (GC.calorBairros).
  // Sem nenhuma aberta, a cena é pulada.
  const MAX = 5;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'bairros',
    ordem: 50,
    nome: 'Bairros mais carregados',
    descricao: 'O mapa pinta os bairros pela quantidade e gravidade das ocorrências abertas',
    montar({ dados }) {
      if (!GC.calorBairros || !GC.data || !GC.data.bairros) return null;
      const esc = GC.escaparHtml;
      const todos = GC.calorBairros(dados.todas || [], GC.data.bairros);
      const com = todos.filter((b) => b.n).sort((a, b) => b.peso - a.peso || b.n - a.n || a.nome.localeCompare(b.nome));
      if (!com.length) return null;
      const linhas = com.slice(0, MAX).map((b) => `<li><i class="tb-nivel nivel-${b.nivel}" aria-hidden="true"></i><span class="tb-nome">${esc(b.nome)}</span>`
        + `<span class="tb-conta">${plural(b.n, 'aberta', 'abertas')}${b.criticas ? ` · <b>${plural(b.criticas, 'crítica', 'críticas')}</b>` : ''}</span></li>`).join('');
      const resto = com.length - MAX;
      const titulo = com.length === 1 ? `Só ${com[0].nome} tem ocorrências abertas`
        : `${com[0].nome} é o bairro mais carregado, entre ${com.length} com ocorrências abertas`;
      return {
        rotulo: 'Bairros',
        sub: 'Ocorrências abertas, pesando a gravidade',
        titulo,
        html: `<ol class="tb-lista">${linhas}</ol>${resto > 0 ? `<div class="tc-seguir">e mais ${plural(resto, 'bairro', 'bairros')} com ocorrências</div>` : ''}`
          + '<p class="ts-legenda tb-legenda"><span>menos</span><i class="nivel-1"></i><i class="nivel-2"></i><i class="nivel-3"></i><i class="nivel-4"></i><span>mais</span></p>',
        niveis: Object.fromEntries(todos.map((b) => [b.id, b.nivel])),
      };
    },
  });
})(window.GC = window.GC || {});
