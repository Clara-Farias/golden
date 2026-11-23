(function (GC) {
  // Tema da Maia (IA roteirizada): limpeza. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { normalizar, bairro, area, ranking, barraPorBairro, maisGrave, focarPrimeira, agora, camada, unicos, nomes, minuscula, casos30d } = GC.iaUtil;

  // Coleta com as rotas carregadas. Pergunta que cita um bairro ("quando passa o caminhão no Centro?")
  // responde o calendário daquele bairro; sem bairro, a situação das rotas de hoje.
  function coletaDasRotas(ctx, pergunta) {
    const r = GC.coleta.resumo();
    const nomeDia = GC.data.coleta.nomeDia;
    const dias = (lista) => (lista.length === 6 && !lista.includes('dom') ? 'de segunda a sábado' : nomes(lista.map((d) => nomeDia[d])));
    const q = normalizar(pergunta);
    const citado = r.calendario.slice().sort((a, b) => b.nome.length - a.nome.length).find((b) => q.includes(normalizar(b.nome)));
    if (citado) {
      const rota = r.rotas.find((x) => x.id === citado.rotas.find((id) => r.rotas.find((y) => y.id === id && y.tipo === 'domiciliar')));
      const sel = citado.seletiva.dias.length ? ` Os recicláveis passam ${dias(citado.seletiva.dias)} (${citado.seletiva.horario}).` : ' O bairro ainda não tem coleta seletiva.';
      return {
        texto: `No ${citado.nome}, o lixo comum é recolhido ${dias(citado.domiciliar.dias)}, das ${citado.domiciliar.horario.replace('–', ' às ')}.${sel} ${citado.atrasada ? `Atenção: a coleta está atrasada${rota && rota.motivo ? ` (${minuscula(rota.motivo)})` : ''}.` : `A próxima passagem é ${citado.domiciliar.proxima ? citado.domiciliar.proxima.texto : 'sem data'}.`}`,
        mapa: { tipo: 'destaque', bairros: [citado.id], legenda: `Coleta em ${citado.nome}` },
        acoes: [camada(`Ver a rota de ${citado.nome} no mapa`, 'coleta', citado.id)],
      };
    }
    const atrasada = r.atrasadas[0];
    const oc = atrasada && atrasada.ocorrenciaId && (ctx.ocorrencias || []).find((x) => x.id === atrasada.ocorrenciaId);
    return {
      texto: `Hoje (${nomeDia[r.diaHoje]}) ${r.deHoje.length} rotas têm coleta e ${r.emAndamento.length === 1 ? '1 caminhão está' : `${r.emAndamento.length} caminhões estão`} na rua.${atrasada ? ` A ${atrasada.nome} está atrasada: ${minuscula(atrasada.motivo || 'sem motivo informado')}.` : ' Nenhuma rota atrasada.'} No mês, ${r.noPrazoPct}% das coletas saíram no prazo (meta 95%) e ${r.seletivaPct}% do lixo foi para a seletiva. Pergunte "quando passa o caminhão no Centro?" para ver o calendário de um bairro.`,
      grafico: { tipo: 'barra', titulo: 'Coletas no prazo por rota (30 dias)', rotulos: r.rotas.map((x) => x.nome), series: [{ nome: 'No prazo', valores: r.rotas.map((x) => x.noPrazoPct) }], unidade: '%' },
      ...(r.atrasadas.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.atrasadas.flatMap((x) => x.bairros)), legenda: 'Bairros com coleta atrasada' } } : {}),
      acoes: [...(atrasada ? [camada(`Ver a ${atrasada.nome} no mapa`, 'coleta', atrasada.id)] : [camada('Ver as rotas no mapa', 'coleta')]), ...(oc ? [{ rotulo: `Ver o alerta: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
    };
  }

  GC.temasIA.push({
    ordem: 140, // empate de palavras-chave: vence o menor
    id: 'limpeza',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['lixo', 'coleta', 'limpeza', { termo: 'entulho', peso: 3 }, 'bueiro', 'caminhao', { termo: 'reciclav', peso: 3 }, { termo: 'seletiva', peso: 3 }],
    entendeBairro: true, // responde o calendário do bairro citado; o motor não acrescenta os números do bairro
    // Pergunta de volta ("Você quer saber da coleta de lixo ou …?") e "Você quis dizer…".
    nome: 'Coleta de lixo',
    assunto: 'da coleta de lixo',
    exemplo: 'Quando passa o caminhão de lixo no Centro?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'limpeza',
    responder(ctx, pergunta) {
      if (GC.coleta) return coletaDasRotas(ctx, pergunta);
      const hist = GC.data.historico30d.limpeza;
      const piores = ranking(hist).filter(([, n]) => n >= 3).map(([id]) => id);
      return {
        texto: `${piores.map((id) => bairro(id).nome).join(' e ')} concentram os atrasos de coleta no mês. ${agora(maisGrave(ctx, (o) => o.area === 'limpeza'))}`,
        grafico: barraPorBairro(hist, 'Ocorrências de limpeza por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
        mapa: { tipo: 'destaque', bairros: piores, legenda: 'Bairros com mais atrasos de coleta' },
        acoes: focarPrimeira(ctx, (o) => o.area === 'limpeza'),
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['limpeza'], fontes: ['limpeza.rotas_coleta', 'ouvidoria.chamados_156'], consulta: 'SELECT bairro, COUNT(*) FROM limpeza.rotas_coleta WHERE atraso_h > 48 AND data >= hoje() - 30 GROUP BY bairro' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 30 dias', registros: () => casos30d('limpeza') },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'coleta_atrasada_bairro > 48 h',
  });
})(window.GC = window.GC || {});
