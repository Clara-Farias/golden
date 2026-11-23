(function (GC) {
  // Tema da Maia (IA roteirizada): o que fazer hoje e o que vai estourar (js/caixa-entrada.js).
  // O secretário recebe a caixa de entrada da pasta, na ordem de urgência; o prefeito, o que vai estourar
  // nas próximas 2 h na cidade (ou no recorte), por secretaria.
  const { plural, bairro, area, nomes } = GC.iaUtil;
  const MAX = 4;

  const focar = (id, titulo) => ({ rotulo: `Ver: ${titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: id } });

  function responder(ctx) {
    if (!GC.caixaDeEntrada) return { texto: 'A caixa de entrada não está disponível agora.' };
    const ocorrencias = ctx.ocorrencias || [];
    const setor = !!(ctx.areasPerfil && ctx.areasPerfil.length === 1);
    const ativas = new Set(ocorrencias.map((o) => o.id));
    if (setor) {
      const caixa = GC.caixaDeEntrada({ ocorrencias, cobrancas: GC.cobrancas || null, area: ctx.areasPerfil[0], agora: GC.agora() });
      if (!caixa.total) return { texto: 'Nada pendente agora: nenhuma cobrança para responder, nada estourado ou perto de estourar sem equipe. A pasta está em dia.' };
      const linhas = caixa.itens.slice(0, MAX).map((it, i) => `${i + 1}. ${GC.TIPOS_CAIXA[it.tipo].rotulo}: ${it.titulo} (${bairro(it.bairroId).nome}), ${it.texto.charAt(0).toLowerCase()}${it.texto.slice(1)}. ${GC.TIPOS_CAIXA[it.tipo].passo}.`);
      return {
        texto: `Você tem ${plural(caixa.total, 'coisa para fazer hoje', 'coisas para fazer hoje')}, na ordem:\n${linhas.join('\n')}${caixa.total > MAX ? `\nE mais ${caixa.total - MAX} no Resumo do dia.` : ''}`,
        acoes: caixa.itens.filter((it) => ativas.has(it.ocorrenciaId)).slice(0, 3).map((it) => focar(it.ocorrenciaId, it.titulo)),
      };
    }
    const vao = GC.vaoEstourar(ocorrencias, GC.agora());
    if (!vao.length) return { texto: 'Nenhuma ocorrência sem equipe vai estourar o prazo nas próximas 2 horas.' };
    const porArea = {};
    vao.forEach((o) => { porArea[o.area] = (porArea[o.area] || 0) + 1; });
    return {
      texto: `${plural(vao.length, 'ocorrência vai', 'ocorrências vão')} estourar o prazo nas próximas 2 horas, ainda sem equipe: ${nomes(vao.slice(0, MAX).map((o) => `${o.titulo} (${bairro(o.bairroId).nome}, em ${GC.tempoCurto(GC.prazoRestanteMin(o))})`))}. Por secretaria: ${Object.keys(porArea).map((a) => `${area(a).nome} ${porArea[a]}`).join(', ')}.`,
      acoes: vao.slice(0, 3).map((o) => focar(o.id, o.titulo)),
    };
  }

  GC.temasIA.push({
    ordem: 183, // empate de palavras-chave: vence o menor (entre prioridade, 180, e cobranças, 185)
    id: 'caixa',
    chaves: [{ termo: 'fazer hoje', peso: 4 }, { termo: 'pendente', peso: 2 }, { termo: 'vai estourar', peso: 4 }, { termo: 'vao estourar', peso: 4 }, { termo: 'caixa de entrada', peso: 4 }],
    nome: 'Para fazer hoje',
    assunto: 'do que fazer hoje e do que vai estourar',
    exemplo: 'O que eu preciso fazer hoje?',
    responder,
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.ocorrencias', 'gabinete.cobrancas'], consulta: "SELECT * FROM gabinete.ocorrencias WHERE status = 'encaminhada' AND equipe IS NULL ORDER BY prazo" },
    base: { periodo: 'agora', registros: () => GC.data.ocorrencias.length },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
