(function (GC) {
  // Tema da Maia (IA roteirizada): pedidos de ajuda entre secretarias (js/ajudas.js). O secretário vê os pedidos
  // para a pasta dele e os dele que pararam; o prefeito, os levados a ele e os que estão parados na cidade.
  const { plural, bairro, nomes } = GC.iaUtil;
  const MAX = 3;
  const sec = (id) => (GC.data.areas.find((a) => a.id === id) || { secretaria: { nome: id } }).secretaria.nome;
  const rotulo = (a) => `${a.retrato.titulo} (${bairro(a.retrato.bairroId).nome}): ${sec(a.de)} pede à ${sec(a.para)}`;

  function responder(ctx) {
    if (!GC.ajudas) return { texto: 'Os pedidos entre secretarias não estão disponíveis agora.' };
    const ativas = new Set((ctx.ocorrencias || []).map((o) => o.id));
    const acoes = (lista) => lista.filter((a) => ativas.has(a.ocorrenciaId)).slice(0, MAX)
      .map((a) => ({ rotulo: `Ver: ${a.retrato.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: a.ocorrenciaId } }));
    const setor = !!(ctx.areasPerfil && ctx.areasPerfil.length === 1);
    const g = GC.ajudas.grupos(setor ? { id: 'setor', area: ctx.areasPerfil[0] } : { id: 'prefeito' }).grupos;
    const de = (id) => (g.find((x) => x.id === id) || { itens: [] }).itens;
    if (setor) {
      const recebidos = de('recebidos');
      const levar = de('levar');
      if (!recebidos.length && !levar.length) return { texto: `Nenhum pedido de ajuda espera você.${de('andamento').length ? ` ${plural(de('andamento').length, 'pedido segue', 'pedidos seguem')} em andamento.` : ''} Para pedir ajuda, abra a ocorrência e use "Ajuda de outras secretarias".` };
      const partes = [];
      if (recebidos.length) partes.push(`${plural(recebidos.length, 'pedido de outra pasta espera', 'pedidos de outras pastas esperam')} a sua resposta: ${nomes(recebidos.slice(0, MAX).map(rotulo))}.`);
      if (levar.length) partes.push(`${plural(levar.length, 'pedido seu parou ou foi recusado', 'pedidos seus pararam ou foram recusados')}: ${nomes(levar.slice(0, MAX).map(rotulo))}. Você pode levar ao prefeito.`);
      return { texto: partes.join(' '), acoes: acoes([...recebidos, ...levar]) };
    }
    const escalados = de('escalados');
    const parados = de('andamento').filter((a) => a.estado === 'recusado' || GC.ajudas.parado(a));
    if (!escalados.length && !parados.length) return { texto: `Nenhum pedido entre secretarias espera você ou está parado.${de('andamento').length ? ` ${plural(de('andamento').length, 'segue', 'seguem')} em andamento.` : ''}` };
    const partes = [];
    if (escalados.length) partes.push(`${plural(escalados.length, 'pedido foi levado', 'pedidos foram levados')} a você: ${nomes(escalados.slice(0, MAX).map(rotulo))}. Determine a ajuda ou arquive, em Alertas → Cobranças.`);
    if (parados.length) partes.push(`${plural(parados.length, 'pedido está parado', 'pedidos estão parados')} entre as pastas: ${nomes(parados.slice(0, MAX).map(rotulo))}.`);
    return { texto: partes.join(' '), acoes: acoes([...escalados, ...parados]) };
  }

  GC.temasIA.push({
    ordem: 186, // empate de palavras-chave: vence o menor (entre cobranças, 185, e equipes, 187)
    id: 'ajuda',
    chaves: [{ termo: 'pedido de ajuda', peso: 4 }, { termo: 'pedidos de ajuda', peso: 4 }, { termo: 'ajuda', peso: 2, inteira: true }, { termo: 'entre secretarias', peso: 3 }, { termo: 'outra secretaria', peso: 2 }],
    nome: 'Pedidos entre secretarias',
    assunto: 'dos pedidos de ajuda entre secretarias',
    exemplo: 'Quais pedidos de ajuda estão parados?',
    responder,
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.pedidos_ajuda'], consulta: "SELECT * FROM gabinete.pedidos_ajuda WHERE estado NOT IN ('concluido', 'arquivado')" },
    base: { periodo: 'em andamento agora', registros: () => (GC.ajudas ? GC.ajudas.todas().length : 0) },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
