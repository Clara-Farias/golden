(function (GC) {
  // Tema da Maia (IA roteirizada): cobranças (js/cobrancas.js). O prefeito pergunta o que está sem resposta
  // e o que espera a decisão dele; o secretário, o que tem para responder. Os grupos são os da aba
  // "📣 Cobranças" da gaveta Alertas, para a Maia e a tela dizerem a mesma coisa.
  const { plural, bairro, area, nomes } = GC.iaUtil;
  const MAX_ITENS = 3;

  const rotulo = (c) => `${c.retrato.titulo} (${bairro(c.retrato.bairroId).nome})`;
  const focar = (c) => ({ rotulo: `Ver: ${c.retrato.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: c.ocorrenciaId } });

  function responder(ctx) {
    if (!GC.cobrancas) return { texto: 'As cobranças não estão disponíveis agora.' };
    const setor = !!(ctx.areasPerfil && ctx.areasPerfil.length === 1);
    const perfil = setor ? { id: 'setor', area: ctx.areasPerfil[0] } : { id: 'prefeito' };
    const { grupos } = GC.cobrancas.grupos(perfil);
    const g = (id) => (grupos.find((x) => x.id === id) || { itens: [] }).itens;
    const ativas = ctx.ocorrencias ? new Set(ctx.ocorrencias.map((o) => o.id)) : null;
    const acoesDe = (lista) => lista.filter((c) => !ativas || ativas.has(c.ocorrenciaId)).slice(0, MAX_ITENS).map(focar);

    if (setor) {
      const responder = [...g('responder'), ...g('recusado')];
      const andamento = g('andamento');
      if (!responder.length) {
        return {
          texto: andamento.length
            ? `Nada para responder agora. ${plural(andamento.length, 'cobrança está', 'cobranças estão')} em andamento: ${nomes(andamento.slice(0, MAX_ITENS).map(rotulo))}.`
            : 'Nenhuma cobrança do prefeito para a sua pasta agora.',
          acoes: acoesDe(andamento),
        };
      }
      const vencidas = responder.filter((c) => GC.cobrancas.vencida(c)).length;
      return {
        texto: `Você tem ${plural(responder.length, 'cobrança para responder', 'cobranças para responder')}${vencidas ? `, ${plural(vencidas, 'já vencida', 'já vencidas')}` : ''}: ${nomes(responder.slice(0, MAX_ITENS).map(rotulo))}. Responda com a previsão, uma justificativa, um pedido de recurso ou de novo prazo, em Alertas → Cobranças.`,
        acoes: acoesDe(responder),
      };
    }

    const esperam = g('esperam');
    const venceram = g('venceram');
    const andamento = g('andamento');
    if (!esperam.length && !venceram.length) {
      return {
        texto: andamento.length
          ? `Nenhuma cobrança espera você. ${plural(andamento.length, 'está', 'estão')} em andamento com as secretarias: ${nomes(andamento.slice(0, MAX_ITENS).map((c) => `${rotulo(c)}, ${GC.resumoCobranca(c).replace(/^📣 /, '').toLowerCase()}`))}.`
          : 'Você não tem cobranças em aberto.',
        acoes: acoesDe(andamento),
      };
    }
    const partes = [];
    if (esperam.length) partes.push(`${plural(esperam.length, 'espera', 'esperam')} a sua decisão (novo prazo ou pedido de recurso): ${nomes(esperam.slice(0, MAX_ITENS).map((c) => `${rotulo(c)}, da ${area(c.area).secretaria.nome}`))}.`);
    if (venceram.length) partes.push(`${plural(venceram.length, 'venceu', 'venceram')} sem resposta ou com a previsão estourada: ${nomes(venceram.slice(0, MAX_ITENS).map(rotulo))}. Dá para cobrar de novo.`);
    return { texto: `${partes.join(' ')} Tudo fica em Alertas → Cobranças.`, acoes: acoesDe([...esperam, ...venceram]) };
  }

  GC.temasIA.push({
    ordem: 185, // empate de palavras-chave: vence o menor (entre prioridade, 180, e o resto)
    id: 'cobrancas',
    // "cobranca" casa "cobranças" (a chave casa o começo da palavra).
    chaves: [{ termo: 'cobranca', peso: 3 }, { termo: 'responder', peso: 2, inteira: true }, { termo: 'novo prazo', peso: 3 }, { termo: 'sem resposta', peso: 3 }],
    nome: 'Cobranças',
    assunto: 'das cobranças do prefeito',
    exemplo: 'Quais cobranças estão sem resposta?',
    responder,
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.cobrancas'], consulta: "SELECT * FROM gabinete.cobrancas WHERE estado <> 'encerrada' ORDER BY prazo_resposta" },
    base: { periodo: 'em aberto agora', registros: () => (GC.cobrancas ? GC.cobrancas.todas().length : 0) },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
