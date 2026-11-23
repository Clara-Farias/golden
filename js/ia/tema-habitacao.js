(function (GC) {
  // Tema da Maia (IA roteirizada): habitação. Ocupações irregulares (as de área de risco primeiro), fila de
  // moradia e regularização fundiária (REURB). O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave.
  // "Área de risco" sozinha continua com o tema de risco (previsão): aqui só entra quando a pergunta fala de
  // ocupação, moradia ou regularização.
  const { plural, camada, unicos, nomes } = GC.iaUtil;
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const NIVEL = { alto: 'risco alto', medio: 'risco médio', baixo: 'risco baixo' };

  // Recorte pelos bairros citados na pergunta ("ocupações na Vila Nova"); sem nada no recorte, a cidade toda.
  function recortar(r, bairros) {
    if (!bairros || !bairros.length) return { r, onde: '' };
    const no = (x) => bairros.includes(x.bairroId);
    if (!r.ocupacoes.some(no) && !r.reurb.some(no)) return { r, onde: '' };
    const ocs = r.ocupacoes.filter(no);
    const emRisco = ocs.filter((x) => x.emRisco);
    const reurb = r.reurb.filter(no);
    const fila = r.fila.filter(no);
    const filaTotal = fila.reduce((s, l) => s + l.inscritas, 0);
    const familiasEmRisco = emRisco.reduce((s, x) => s + x.familias, 0);
    const naFila = fila.reduce((s, l) => s + l.prioridades.areaRisco, 0);
    return {
      onde: ` em ${nomes(bairros.map(nomeBairro))}`,
      r: Object.assign({}, r, {
        ocupacoes: ocs, emRisco, crescendo: ocs.filter((x) => !x.emRisco && x.crescendo),
        familiasIrregulares: ocs.reduce((s, x) => s + x.familias, 0), familiasEmRisco, emRiscoForaDaFila: Math.max(0, familiasEmRisco - naFila),
        fila, filaTotal, esperaMediaMeses: filaTotal ? Math.round(fila.reduce((s, l) => s + l.esperaMeses * l.inscritas, 0) / filaTotal) : 0,
        prioridades: { areaRisco: naFila, idosos: fila.reduce((s, l) => s + l.prioridades.idosos, 0), pcd: fila.reduce((s, l) => s + l.prioridades.pcd, 0) },
        reurb, reurbAndamento: reurb.filter((n) => !n.concluido), reurbAtrasados: reurb.filter((n) => n.atrasado),
        lotesEmProcesso: reurb.filter((n) => !n.concluido).reduce((s, n) => s + n.lotes, 0), lotesTitulados: reurb.filter((n) => n.concluido).reduce((s, n) => s + n.lotes, 0),
      }),
    };
  }

  function ocupacoes(r, onde) {
    if (!r.ocupacoes.length) return { texto: `Não há ocupação irregular mapeada${onde}.` };
    const top = r.emRisco[0] || r.ocupacoes[0];
    const risco = r.emRisco.map((x) => `${x.nome} (${nomeBairro(x.bairroId)}, ${plural(x.familias, 'família', 'famílias')}, área de ${x.areaRisco.tipo}${x.areaRisco.nivel ? ` com ${NIVEL[x.areaRisco.nivel]} agora` : ''})`);
    const altas = r.emRisco.filter((x) => x.areaRisco.nivel === 'alto');
    return {
      texto: `${plural(r.familiasIrregulares, 'família vive', 'famílias vivem')} em ${plural(r.ocupacoes.length, 'ocupação irregular', 'ocupações irregulares')}${onde}. `
        + (r.emRisco.length
          ? `${r.emRisco.length === 1 ? 'Uma delas fica' : `${r.emRisco.length} delas ficam`} dentro de área de risco da Defesa Civil, com ${plural(r.familiasEmRisco, 'família', 'famílias')}: ${nomes(risco)}.`
            + (r.emRiscoForaDaFila ? ` ${plural(r.emRiscoForaDaFila, 'dessas famílias ainda não está', 'dessas famílias ainda não estão')} na fila de moradia.` : '')
            + ` Sugiro ${altas.length ? `vistoria da Defesa Civil em ${nomes(altas.map((x) => x.nome))} antes da chuva e ` : ''}busca ativa para cadastrar as famílias no reassentamento.`
          : 'Nenhuma fica dentro de área de risco da Defesa Civil.')
        + (r.crescendo.length ? ` Também pedem atenção, porque estão crescendo: ${nomes(r.crescendo.map((x) => `${x.nome} (${x.recente ? 'começou há menos de um ano' : `+${x.crescimentoPct}% em 12 meses`})`))}.` : ''),
      grafico: { tipo: 'barra', titulo: 'Famílias por ocupação irregular', rotulos: r.ocupacoes.map((x) => x.nome), series: [{ nome: 'Famílias', valores: r.ocupacoes.map((x) => x.familias) }], unidade: 'famílias' },
      ...(r.emRisco.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.emRisco.map((x) => x.bairroId)), legenda: 'Bairros com ocupação em área de risco' } } : {}),
      acoes: [camada(`Ver ${top.nome} no mapa`, 'habitacao', top.id)],
    };
  }

  function fila(r, onde) {
    if (!r.fila.length) return { texto: `Não há fila de moradia registrada${onde}.` };
    const l = r.fila; // já vem da maior espera para a menor
    const maiores = l.slice(0, 3);
    return {
      texto: `${r.filaTotal.toLocaleString('pt-BR')} ${r.filaTotal === 1 ? 'família espera' : 'famílias esperam'} moradia${onde}, com espera média de ${r.esperaMediaMeses} meses. A maior espera é em ${nomes(maiores.map((x) => `${x.nome} (${x.esperaMeses} meses, ${x.inscritas.toLocaleString('pt-BR')} inscritas)`))}. Têm prioridade ${r.prioridades.areaRisco} famílias de área de risco, ${r.prioridades.idosos} com idosos e ${r.prioridades.pcd} com pessoa com deficiência.`
        + (r.emRiscoForaDaFila ? ` ${plural(r.emRiscoForaDaFila, 'família de ocupação em área de risco ainda não está inscrita', 'famílias de ocupações em área de risco ainda não estão inscritas')}: sugiro busca ativa para o cadastro.` : ''),
      grafico: { tipo: 'barra', titulo: 'Espera média na fila de moradia', rotulos: l.map((x) => x.nome), series: [{ nome: 'Espera média', valores: l.map((x) => x.esperaMeses) }], unidade: 'meses' },
      mapa: { tipo: 'destaque', bairros: maiores.map((x) => x.bairroId), legenda: 'Maior espera na fila de moradia' },
      acoes: r.emRisco.length ? [camada('Ver as ocupações em área de risco no mapa', 'habitacao', r.emRisco[0].id)] : [],
    };
  }

  function reurb(r, onde) {
    if (!r.reurb.length) return { texto: `Não há processo de regularização fundiária${onde}.` };
    const atrasados = r.reurbAtrasados;
    const alvo = atrasados[0] || r.reurbAndamento[0] || r.reurb[0];
    const proximo = r.reurbAndamento.filter((n) => !n.atrasado).sort((a, b) => a.diasParaPrazo - b.diasParaPrazo)[0];
    const concluidos = r.reurb.filter((n) => n.concluido);
    return {
      texto: `${plural(r.reurbAndamento.length, 'processo de regularização fundiária (REURB) está', 'processos de regularização fundiária (REURB) estão')} em andamento${onde}, somando ${plural(r.lotesEmProcesso, 'lote', 'lotes')}. `
        + (atrasados.length ? `${atrasados.length === 1 ? 'Um está' : `${atrasados.length} estão`} com a etapa atrasada: ${nomes(atrasados.map((n) => `${n.nome} (${n.etapaNome.toLowerCase()}, ${plural(n.diasAtraso, 'dia', 'dias')} de atraso)`))}.` : 'Nenhum está com a etapa atrasada.')
        + (proximo ? ` O próximo prazo é o de ${proximo.nome}, em ${plural(proximo.diasParaPrazo, 'dia', 'dias')} (${proximo.etapaNome.toLowerCase()}).` : '')
        + (concluidos.length ? ` Já foram entregues ${plural(r.lotesTitulados, 'título', 'títulos')} em ${nomes(concluidos.map((n) => n.nome))}.` : '')
        + ' Ocupação em área de risco não entra na REURB enquanto o risco não for resolvido: o caminho é o reassentamento.',
      grafico: { tipo: 'barra', titulo: 'Andamento da REURB por núcleo', rotulos: r.reurb.map((n) => n.nome), series: [{ nome: 'Etapas cumpridas', valores: r.reurb.map((n) => n.progressoPct) }], unidade: '%' },
      ...(atrasados.length ? { mapa: { tipo: 'destaque', bairros: unicos(atrasados.map((n) => n.bairroId)), legenda: 'Bairros com REURB atrasada' } } : {}),
      acoes: [camada(`Ver ${alvo.nome} no mapa`, 'habitacao', alvo.id)],
    };
  }

  const FILA = /(^| )(fila|moradia|casa propria|minha casa|aluguel social|inscri|espera|deficit)/;
  const REURB = /(^| )(reurb|regulariz|fundiari|escritura|titul|loteamento|terreno|lote)/;
  const OCUPACAO = /(^| )(ocupac|invas|favela|reassent)/;

  GC.temasIA.push({
    ordem: 85, // empate de palavras-chave: vence o menor (risco, 20, fica com "área de risco" sozinha)
    id: 'habitacao',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'habitac', peso: 3 }, { termo: 'moradia', peso: 3 }, { termo: 'ocupacao irregular', peso: 4 }, { termo: 'ocupacoes irregulares', peso: 4 },
      { termo: 'ocupacoes', peso: 3, inteira: true }, { termo: 'ocupacao', peso: 2, inteira: true }, { termo: 'invas', peso: 3 }, { termo: 'favela', peso: 3 },
      { termo: 'reurb', peso: 3, inteira: true }, { termo: 'regularizacao fundiaria', peso: 4 }, { termo: 'regulariz', peso: 3 }, { termo: 'fundiari', peso: 3 },
      { termo: 'escritura', peso: 3 }, { termo: 'loteamento', peso: 3 }, { termo: 'reassent', peso: 3 }, { termo: 'aluguel social', peso: 3 },
      { termo: 'casa propria', peso: 3 }, { termo: 'minha casa', peso: 3 }, { termo: 'reintegracao de posse', peso: 4 }],
    // "Ocupação" sozinha também é a dos leitos, das escolas e dos ônibus: lá, fica com o tema deles.
    exclui: ['leito', 'uti', 'hospital', 'upa', 'ubs', 'escola', 'creche', 'onibus', 'abrigo'],
    // Pergunta de volta ("Você quer saber das ocupações, da fila de moradia e da REURB ou …?") e "Você quis dizer…".
    nome: 'Habitação e ocupações',
    assunto: 'das ocupações irregulares, da fila de moradia e da regularização de terrenos',
    exemplo: 'Quais ocupações irregulares estão em área de risco?',
    disponivel: () => !!GC.habitacao,
    responder(ctx, q, ent) {
      const { r, onde } = recortar(GC.habitacao.resumo(), ent && ent.bairros);
      const texto = q || '';
      if (REURB.test(texto) && !OCUPACAO.test(texto)) return reurb(r, onde);
      if (FILA.test(texto) && !OCUPACAO.test(texto)) return fila(r, onde);
      return ocupacoes(r, onde);
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['infraestrutura'], fontes: ['habitacao.ocupacoes', 'habitacao.cadastro_fila', 'habitacao.reurb', 'defesa_civil.areas_risco'], consulta: 'SELECT o.nome, o.bairro, o.familias, a.area AS area_risco FROM habitacao.ocupacoes o LEFT JOIN defesa_civil.areas_risco a ON ST_Contains(a.poligono, o.ponto) ORDER BY (a.area IS NULL), o.familias DESC' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'cadastro atual', registros: () => { const r = GC.habitacao.resumo(); return r.ocupacoes.length + r.reurb.length + r.filaTotal; } },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'familias_ocupacao_em_area_risco > 0',
  });
})(window.GC = window.GC || {});
