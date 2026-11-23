(function (GC) {
  // Tema da Maia (IA roteirizada): calendário sazonal (js/data-sazonal.js). "O que vem por aí?", "o que preparar
  // para os próximos meses?". Citando uma época (dengue, volta às aulas…), responde só ela.
  const { plural, normalizar, camada, nomes, unicos } = GC.iaUtil;

  const nomeMes = (m) => GC.sazonal.NOMES_MES[m];
  const quando = (t) => (t.faltamMeses === 1 ? 'no mês que vem' : `em ${t.faltamMeses} meses`);
  const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const acoesTexto = (t) => nomes(t.acoes.map((a) => minuscula(a.texto) + (a.meta ? ` (${a.meta.progressoPct}%${a.meta.atrasada ? ', atrasada' : ''})` : '')));
  // Palavras que apontam uma época: o id e o nome normalizados, mais apelidos.
  const APELIDOS = { chuvas: ['chuvas de verao'], internacoes: ['internac'], dengue: ['dengue', 'arbovirose', 'mosquito'], 'volta-aulas': ['volta as aulas', 'ano letivo'], gripe: ['gripe', 'vacinac'], estiagem: ['estiagem', 'seca', 'queimada'], 'fim-de-ano': ['fim de ano', 'natal', 'festas'] };

  // Gráfico da série da temporada, nos 12 meses a partir do de hoje.
  function grafico(t, mes) {
    if (!t || !t.fonte) return null;
    const ordem = Array.from({ length: 12 }, (_, k) => (mes + k) % 12); // o mesmo mês do ano passado, daqui para a frente
    return { tipo: 'barra', titulo: `${t.fonte.rotulo} (12 meses)`, rotulos: ordem.map((m) => GC.sazonal.CURTOS[m]), series: [{ nome: t.fonte.rotulo, valores: ordem.map((m) => t.fonte.valoresPorMes[m]) }], unidade: t.fonte.unidade };
  }

  function sobreUma(t, s) {
    const pico = t.pico !== null ? `, com pico em ${nomeMes(t.pico)}${t.fonte ? ` (${t.fonte.valorPico} ${t.fonte.unidade} no ano passado)` : ''}` : '';
    const onde = t.situacao === 'pico' ? 'Estamos no pico agora.' : t.situacao === 'temporada' ? 'Já está em curso.'
      : t.situacao === 'preparo' ? `Começa ${quando(t)}: é hora de preparar.` : `Começa ${quando(t)}; a preparação abre ${plural(t.preparo.length, 'mês', 'meses')} antes.`;
    const atraso = t.metasAtrasadas.length ? ` Atenção: ${nomes(t.metasAtrasadas.map((a) => `${minuscula(a.meta.titulo)} em ${a.meta.progressoPct}%`))}, e a temporada já começou.` : '';
    return {
      texto: `${t.nome}: ${GC.sazonal.periodo(t)}${pico}, por causa de ${t.porque}. ${onde} O que fazer: ${acoesTexto(t)}.${atraso}`,
      grafico: grafico(t, s.mes),
      acoes: t.camada ? [camada('Ver no mapa', t.camada)] : [],
    };
  }

  function visaoGeral(s) {
    const curso = s.emCurso.map((t) => `${minuscula(t.nome)} (${GC.sazonal.periodo(t)}${t.pico !== null ? `, pico em ${nomeMes(t.pico)}` : ''})`);
    const preparo = s.emPreparo.map((t) => `${minuscula(t.nome)}, que começa ${quando(t)}: ${acoesTexto(t)}`);
    const partes = [`Em ${s.nomeMes}, ${curso.length ? `está em curso: ${nomes(curso)}.` : 'nenhuma temporada está em curso.'}`];
    if (s.atrasadas.length) partes.push(`${plural(s.atrasadas.length, 'compromisso de preparo está atrasado', 'compromissos de preparo estão atrasados')}: ${nomes(s.atrasadas.map((a) => `${minuscula(a.meta.titulo)} (${a.meta.progressoPct}%)`))}.`);
    partes.push(preparo.length ? `Para preparar agora: ${preparo.join('; ')}.` : 'Nada para preparar este mês.');
    if (s.proximas.length) partes.push(`Depois vem ${nomes(s.proximas.map((t) => `${minuscula(t.nome)} ${quando(t)}`))}.`);
    const comCamada = [...s.emCurso, ...s.emPreparo].find((t) => t.camada);
    const comSerie = [...s.emCurso, ...s.emPreparo].find((t) => t.fonte);
    return {
      texto: partes.join(' '),
      grafico: grafico(comSerie, s.mes),
      acoes: comCamada ? [camada(`Ver ${minuscula(comCamada.nome)} no mapa`, comCamada.camada)] : [],
    };
  }

  GC.temasIA.push({
    ordem: 190, // empate de palavras-chave: vence o menor (risco, saúde e educação respondem antes nos assuntos deles)
    id: 'sazonal',
    chaves: [{ termo: 'sazonal', peso: 3 }, { termo: 'temporada', peso: 3 }, { termo: 'epoca do ano', peso: 3 }, { termo: 'estacao do ano', peso: 3 },
      { termo: 'proximos meses', peso: 3 }, { termo: 'vem por ai', peso: 3 }, { termo: 'o que preparar', peso: 3 }, { termo: 'preparar para', peso: 2 },
      { termo: 'volta as aulas', peso: 3 }, { termo: 'campanha da gripe', peso: 3 }, { termo: 'estiagem', peso: 3 }, { termo: 'fim de ano', peso: 3 }],
    nome: 'Calendário sazonal',
    assunto: 'das épocas do ano e do que preparar',
    exemplo: 'O que preparar para os próximos meses?',
    disponivel: () => !!GC.sazonal,
    responder(ctx, pergunta) {
      const s = GC.sazonal.agora();
      const q = normalizar(pergunta || '');
      const citada = s.todas.find((t) => (APELIDOS[t.id] || []).some((p) => q.includes(p)) || q.includes(normalizar(t.nome)));
      const r = citada ? sobreUma(citada, s) : visaoGeral(s);
      if (!r.grafico) delete r.grafico;
      r.acoes.push({ rotulo: '📅 Abrir o calendário', tipo: 'abrirTela', payload: { rota: { tela: 'sazonal' } } });
      return r;
    },
    origem: { areas: unicos(GC.data && GC.data.sazonal ? GC.data.sazonal.temporadas.map((t) => t.area) : ['defesa_civil', 'saude']), fontes: ['secretarias.series_mensais', 'saude.ocupacao_leitos_mensal', 'plano_governo.metas'], consulta: 'SELECT area, mes, valor FROM secretarias.series_mensais WHERE mes >= add_months(mes_atual(), -12) UNION ALL SELECT area, titulo, progresso_pct FROM plano_governo.metas' },
    base: { periodo: '12 meses fechados + compromissos do plano', registros: () => GC.sazonal.temporadas().length * 12 },
    selo: 'analise',
    alerta: 'temporada iniciada E meta_de_preparo.progresso < 100%',
  });
})(window.GC = window.GC || {});
