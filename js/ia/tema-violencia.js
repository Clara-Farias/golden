(function (GC) {
  // Tema da Maia (IA roteirizada): violencia. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, sinal, nomes } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 50, // empate de palavras-chave: vence o menor
    id: 'violencia',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['mulher', 'crianc', { termo: 'domestic', peso: 3 }, { termo: 'feminic', peso: 3 }, { termo: 'violencia contra', peso: 3 }, { termo: 'maria da penha', peso: 3 }],
    // Pergunta de volta ("Você quer saber da violência contra mulheres e crianças ou …?") e "Você quis dizer…".
    nome: 'Violência contra mulheres e crianças',
    assunto: 'da violência contra mulheres e crianças',
    exemplo: 'Como está a violência contra a mulher?',
    disponivel: () => !!GC.seguranca,
    responder() {
      const v = GC.seguranca.resumo().violencia;
      const top = v.porBairro.slice(0, 3);
      return {
        texto: `Foram ${v.mes} casos de violência contra mulheres e crianças no último mês (${v.mulheres} contra mulheres e ${v.criancas} contra crianças e adolescentes): ${sinal(v.variacaoPct)} sobre o mês anterior e ${sinal(v.variacaoAnoPct)} em 12 meses. Os bairros com mais casos são ${nomes(top.map((b) => bairro(b.id).nome))}. Para proteger as vítimas, mostro só números por bairro, nunca endereços.`,
        grafico: { tipo: 'linha', titulo: 'Violência contra mulheres e crianças por mês', rotulos: v.serie.map((x) => x.mes), series: [{ nome: 'Casos', valores: v.serie.map((x) => x.total) }], unidade: 'casos' },
        mapa: { tipo: 'destaque', bairros: top.map((b) => b.id), legenda: 'Bairros com mais casos de violência contra mulheres e crianças' },
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['seguranca'], fontes: ['seguranca.boletins', 'assistencia.rede_protecao', 'planejamento.bairros'], consulta: "SELECT bairro, COUNT(*) FROM seguranca.boletins WHERE natureza IN ('violencia_domestica', 'violencia_crianca_adolescente') AND data >= inicio_mes() GROUP BY bairro" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'mês atual', registros: () => GC.seguranca.resumo().violencia.mes },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'casos_violencia_mulher_crianca_mes > mes_anterior × 1,1',
  });
})(window.GC = window.GC || {});
