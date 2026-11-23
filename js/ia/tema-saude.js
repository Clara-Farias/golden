(function (GC) {
  // Tema da Maia (IA roteirizada): saude. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, area, focarPrimeira, agora, pct } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 100, // empate de palavras-chave: vence o menor
    id: 'saude',
    // "hospital" ficou com o tema dos leitos (quando ele existe); aqui é a lotação das UBS.
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'ubs', peso: 3 }, 'saude', 'lotac', { termo: 'fila', peso: 1 }, 'medico', { termo: 'medica', inteira: true }, ...(GC.leitos ? [] : ['hospital'])],
    // Palavras que pedem outro assunto: tiram este tema (a não ser que ele tenha casado uma chave de peso 3).
    exclui: ['escola', 'creche', 'onibus'],
    // Pergunta de volta ("Você quer saber das UBS ou …?") e "Você quis dizer…".
    nome: 'UBS',
    assunto: 'das UBS',
    exemplo: 'Como está a lotação das UBS?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'saude',
    responder(ctx) {
      const ubs = GC.data.series.lotacaoUbs;
      const criticas = ubs.filter((u) => u.pct > 85);
      // A mais folgada (na Vila Dourada, a UBS Bela Vista, recém-inaugurada).
      const folgada = ubs.find((u) => u.bairroId === 'bela_vista') || ubs.reduce((a, b) => (b.pct < a.pct ? b : a));
      return {
        texto: `${criticas.length} unidades estão acima de 85% de lotação: ${criticas.map((u) => `${u.nome} (${u.pct}%)`).join(' e ')}. ${folgada.nome === 'UBS Bela Vista' ? 'A nova ' : 'A '}${folgada.nome} está com folga (${folgada.pct}%) — dá para redirecionar parte da demanda.`,
        grafico: { tipo: 'barra', titulo: 'Lotação das UBS agora', rotulos: ubs.map((u) => u.nome), series: [{ nome: 'Lotação', valores: ubs.map((u) => u.pct) }], unidade: '%' },
        mapa: { tipo: 'destaque', bairros: criticas.map((u) => u.bairroId), legenda: 'Bairros com UBS acima de 85%' },
        acoes: focarPrimeira(ctx, (o) => o.area === 'saude'),
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['saude'], fontes: ['saude.regulacao_ubs', 'saude.atendimentos_ubs', 'planejamento.bairros'], consulta: 'SELECT ubs, bairro, ocupacao_pct, AVG(espera_min) FROM saude.regulacao_ubs JOIN saude.atendimentos_ubs USING (ubs) WHERE data = hoje() GROUP BY ubs, bairro' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'hoje', registros: () => GC.data.series.lotacaoUbs.length * 2 },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'lotacao_ubs > 85% por 2 h',
  });
})(window.GC = window.GC || {});
