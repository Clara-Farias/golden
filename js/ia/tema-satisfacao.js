(function (GC) {
  // Tema da Maia (IA roteirizada): satisfacao. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 150, // empate de palavras-chave: vence o menor
    id: 'satisfacao',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'satisfa', peso: 3 }, 'avaliac', { termo: 'cidadao', peso: 1 }, 'opiniao'],
    // Pergunta de volta ("Você quer saber da satisfação dos moradores ou …?") e "Você quis dizer…".
    nome: 'Satisfação',
    assunto: 'da satisfação dos moradores',
    exemplo: 'Como está a satisfação por bairro?',
    responder() {
      const s = GC.data.satisfacaoPorBairro;
      const ord = Object.entries(s).sort((a, b) => a[1] - b[1]);
      const piores = ord.slice(0, 2).map(([id]) => id);
      return {
        texto: `A satisfação média da cidade está em ${GC.data.indicadoresBase.satisfacaoPct}%. Os pontos de atenção são ${bairro(ord[0][0]).nome} (${ord[0][1]}%) e ${bairro(ord[1][0]).nome} (${ord[1][1]}%), que também concentram ocorrências no mês. ${bairro(ord[ord.length - 1][0]).nome} lidera com ${ord[ord.length - 1][1]}%.`,
        grafico: { tipo: 'barra', titulo: 'Satisfação do cidadão por bairro', rotulos: ord.map(([id]) => bairro(id).nome), series: [{ nome: 'Satisfação', valores: ord.map(([, n]) => n) }], unidade: '%' },
        mapa: { tipo: 'destaque', bairros: piores, legenda: 'Bairros com menor satisfação' },
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['ouvidoria.pesquisa_satisfacao', 'ouvidoria.chamados_156', 'planejamento.bairros'], consulta: 'SELECT bairro, AVG(nota) * 10 AS satisfacao_pct FROM ouvidoria.pesquisa_satisfacao WHERE data >= hoje() - 30 GROUP BY bairro ORDER BY 2' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 30 dias', registros: () => GC.data.bairros.length },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
