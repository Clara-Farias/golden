(function (GC) {
  // Tema da Maia (IA roteirizada): mobilidade. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, area, ranking, barraPorBairro, calor, maisGrave, focarPrimeira, agora, casos30d } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 120, // empate de palavras-chave: vence o menor
    id: 'mobilidade',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['transito', 'trafego', { termo: 'congestion', peso: 3 }, 'mobilidade', 'onibus', { termo: 'semaforo', peso: 3 }],
    // Pergunta de volta ("Você quer saber do trânsito ou …?") e "Você quis dizer…".
    nome: 'Trânsito',
    assunto: 'do trânsito',
    exemplo: 'Onde está o trânsito mais crítico?',
    // Área cujos casos por bairro o tema conta: o motor compara com o mês anterior e explica o "por que piorou?".
    historico: 'mobilidade',
    responder(ctx) {
      const hist = GC.data.historico30d.mobilidade;
      const [[topId], [segId]] = ranking(hist);
      return {
        texto: `O trânsito crítico está concentrado nos bairros ${bairro(topId).nome} e ${bairro(segId).nome}, com pico entre ${GC.data.series.picoTransito}.${agora(maisGrave(ctx, (o) => o.area === 'mobilidade'))}`,
        grafico: barraPorBairro(hist, 'Ocorrências de trânsito por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
        mapa: calor('mobilidade', ctx, 'Pontos críticos de trânsito'),
        acoes: focarPrimeira(ctx, (o) => o.area === 'mobilidade'),
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['mobilidade'], fontes: ['mobilidade.central_trafego', 'mobilidade.gps_onibus', 'planejamento.bairros'], consulta: 'SELECT bairro, COUNT(*) FROM mobilidade.central_trafego WHERE data >= hoje() - 30 GROUP BY bairro ORDER BY 2 DESC' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 30 dias', registros: () => casos30d('mobilidade') },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'tempo_deslocamento > média_30d × 1,2',
  });
})(window.GC = window.GC || {});
