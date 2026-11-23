(function (GC) {
  // Tema da Maia (IA roteirizada): risco. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { plural, area, agora, camada, unicos, nomes, minuscula } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 20, // empate de palavras-chave: vence o menor
    id: 'risco',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['risco', { termo: 'desliz', peso: 3 }, { termo: 'encosta', peso: 3 }, { termo: 'previs', peso: 3 }, { termo: 'vai alag', peso: 3 }, { termo: 'vai chover', peso: 3 }, { termo: 'sirene', peso: 3 }, { termo: 'proximas horas', peso: 3 }],
    // Pergunta de volta ("Você quer saber da previsão e das áreas de risco ou …?") e "Você quis dizer…".
    nome: 'Previsão e áreas de risco',
    assunto: 'da previsão e das áreas de risco',
    exemplo: 'Onde vai alagar nas próximas horas?',
    disponivel: () => !!GC.risco,
    responder(ctx) {
      const r = GC.risco.resumo(ctx.ocorrencias || []);
      const p = r.previsao;
      const alvo = r.preventivo || r.altas[0] || r.areas[0];
      const preventivo = r.preventivo
        ? ` Onde ainda dá para agir antes: ${r.preventivo.nome}, risco de ${r.preventivo.tipo} em ~${r.preventivo.horasAte} h (${r.preventivo.familias} famílias). Sugiro ${minuscula(r.preventivo.acao)}.`
        : (r.altas.length ? ' Todas as áreas de risco alto já foram atingidas: o foco agora é o atendimento.' : '');
      return {
        texto: `A previsão é de ${p.janelas[p.janelas.length - 1].mm} mm de chuva nas próximas 24 h (${p.janelas[1].mm} mm em 6 h), e já choveu ${p.acumulado72h} mm em 72 h. ${r.altas.length ? `${plural(r.altas.length, 'área', 'áreas')} com risco alto: ${nomes(r.altas.map((a) => a.nome))}.` : 'Nenhuma área com risco alto.'}${preventivo}${r.atingidas.length ? ` ${plural(r.atingidas.length, 'área', 'áreas')} já têm alagamento ou deslizamento aberto.` : ''}`,
        grafico: { tipo: 'linha', titulo: 'Chuva prevista (acumulada)', rotulos: p.janelas.map((j) => `${j.horas} h`), series: [{ nome: 'Chuva', valores: p.janelas.map((j) => j.mm) }], unidade: 'mm' },
        ...(r.altas.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.altas.map((a) => a.bairroId)), legenda: 'Bairros com área de risco alto' } } : {}),
        acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'risco', alvo.id)] : [],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['defesa_civil'], fontes: ['defesa_civil.areas_risco', 'inmet.previsao_chuva', 'defesa_civil.ocorrencias'], consulta: 'SELECT a.area, a.limiar_mm, p.mm_acumulado, p.horas FROM defesa_civil.areas_risco a CROSS JOIN inmet.previsao_chuva p WHERE p.emitida_em = ultima_previsao() ORDER BY p.horas' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimas 72 h + próximas 24 h', registros: (c) => { const r = GC.risco.resumo(c.ocorrencias || []); return r.areas.length * r.previsao.janelas.length + (c.ocorrencias || []).filter((o) => o.area === 'defesa_civil').length; } },
    selo: 'previsao',
    // Regra do "🔔 Transformar em alerta".
    alerta: 'chuva_prevista_6h (+ acumulado_72h nas encostas) >= limiar_area',
  });
})(window.GC = window.GC || {});
