(function (GC) {
  // Tema da Maia (IA roteirizada): equipes de campo (js/data-equipes.js, js/operacao.js). O secretário vê as
  // equipes da pasta, uma a uma; o prefeito, quantas estão livres em cada secretaria.
  const { plural, area, nomes } = GC.iaUtil;

  function responder(ctx) {
    const store = GC.storeAtual;
    if (!store || !GC.situacaoEquipes) return { texto: 'A situação das equipes não está disponível agora.' };
    const setor = !!(ctx.areasPerfil && ctx.areasPerfil.length === 1);
    if (setor) {
      const lista = GC.situacaoEquipes(store, ctx.areasPerfil[0]);
      const livres = lista.filter((e) => e.situacao === 'livre');
      const ocupadas = lista.filter((e) => e.situacao !== 'livre');
      const linha = (e) => `${e.nome} ${e.situacao === 'no_local' ? 'no local' : 'a caminho'} (${e.ocorrencia.titulo})`;
      return {
        texto: `${livres.length ? `${plural(livres.length, 'equipe livre', 'equipes livres')}: ${nomes(livres.map((e) => e.nome))}.` : 'Nenhuma equipe livre agora.'}${ocupadas.length ? ` Ocupadas: ${nomes(ocupadas.map(linha))}.` : ''} Para despachar, abra a ocorrência e use "Operação da pasta".`,
        acoes: ocupadas.slice(0, 3).map((e) => ({ rotulo: `Ver: ${e.ocorrencia.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: e.ocorrencia.id } })),
      };
    }
    const porArea = GC.data.areas.map((a) => {
      const l = GC.situacaoEquipes(store, a.id);
      return { a, livres: l.filter((e) => e.situacao === 'livre').length, total: l.length };
    });
    const semLivre = porArea.filter((x) => x.total && !x.livres);
    return {
      texto: `${semLivre.length ? `Sem equipe livre agora: ${nomes(semLivre.map((x) => x.a.secretaria.nome))}. ` : 'Toda secretaria tem ao menos uma equipe livre. '}Livres por pasta: ${porArea.map((x) => `${area(x.a.id).nome} ${x.livres}/${x.total}`).join(', ')}.`,
      grafico: { tipo: 'barra', titulo: 'Equipes livres por secretaria', rotulos: porArea.map((x) => area(x.a.id).nome), series: [{ nome: 'Livres', valores: porArea.map((x) => x.livres) }], unidade: 'equipes' },
    };
  }

  GC.temasIA.push({
    ordem: 187, // empate de palavras-chave: vence o menor (depois de cobranças, 185)
    id: 'equipes',
    chaves: [{ termo: 'equipe', peso: 3 }, { termo: 'despach', peso: 2 }, { termo: 'viatura', peso: 1 }, { termo: 'ambulancia', peso: 1 }],
    nome: 'Equipes de campo',
    assunto: 'das equipes de campo',
    exemplo: 'Quais equipes estão livres?',
    responder,
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['operacao.equipes'], consulta: 'SELECT * FROM operacao.equipes ORDER BY secretaria, situacao' },
    base: { periodo: 'agora', registros: () => (GC.data.equipes || []).length },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
