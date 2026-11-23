(function (GC) {
  // Tema da Maia (IA roteirizada): resumo. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { camada } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 170, // empate de palavras-chave: vence o menor
    id: 'resumo',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'resumo', peso: 3 }, { termo: 'semana', peso: 1 }, 'melhorou', 'piorou', { termo: 'balanco', peso: 3 }],
    // Pergunta de volta ("Você quer saber do resumo da semana ou …?") e "Você quis dizer…".
    nome: 'Resumo da semana',
    assunto: 'do resumo da semana',
    exemplo: 'O que melhorou e o que piorou na semana?',
    // Já é o quadro da semana: "Resumo da semana" não ganha o aviso de período que falta.
    periodos: ['semana'],
    responder() {
      const t = GC.data.tendencias;
      const bom = t.filter((x) => x.positivo).map((x) => `${x.rotulo} ${x.valor}`);
      const ruim = t.filter((x) => !x.positivo).map((x) => `${x.rotulo} ${x.valor}`);
      return {
        texto: `Resumo da semana em ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'}. ⚠️ Piorou: ${ruim.join('; ')}. ✅ Melhorou: ${bom.join('; ')}. A Prefeitura também entregou ${GC.data.conquistas.length} obras e serviços (estão na camada de conquistas).`,
        grafico: { tipo: 'barra', titulo: 'Variação dos indicadores (%)', rotulos: t.map((x) => x.rotulo), series: [{ nome: 'Variação', valores: t.map((x) => x.variacao) }], unidade: '%' },
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.indicadores', 'gabinete.conquistas'], consulta: 'SELECT indicador, valor, variacao_pct FROM gabinete.indicadores WHERE semana = semana_atual()' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'semana atual', registros: () => GC.data.tendencias.length },
    selo: 'analise',
  });
})(window.GC = window.GC || {});
