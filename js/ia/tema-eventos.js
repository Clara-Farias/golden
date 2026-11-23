(function (GC) {
  // Tema da Maia (IA roteirizada): grandes eventos (js/data-eventos.js). "Como está o plano do show?",
  // "O público do festival passou do previsto?". Citando um evento, responde só ele; senão, a visão geral.
  // Ordem 195: depois do calendário sazonal (190), que fica com "fim de ano" e "o que preparar".
  const { plural, normalizar, camada, nomes, minuscula } = GC.iaUtil;

  const num = (x) => Number(x).toLocaleString('pt-BR');
  const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
  // Palavras que apontam um evento, além do nome.
  const APELIDOS = {
    'ev-maratona': ['maratona', 'corrida'], 'ev-festival-porto': ['festival', 'gastronomic'], 'ev-expo': ['expo', 'feira de negocios', 'pavilhao'],
    'ev-show-aniversario': ['show', 'aniversario da cidade'], 'ev-final-campeonato': ['campeonato', 'final', 'jogo', 'estadio'],
    'ev-natal-iluminado': ['natal iluminado'], 'ev-reveillon': ['reveillon', 'virada'],
  };
  const citado = (q, e) => (APELIDOS[e.id] || []).some((p) => new RegExp(`(^|[^a-z0-9])${p}`).test(q)) || q.includes(normalizar(e.nome));

  function quando(e) {
    if (e.status === 'em_andamento') return e.duracao > 1 ? `em andamento (dia ${e.diaAtual} de ${e.duracao})` : `hoje, ${e.horario}`;
    if (e.status === 'proximo') return `em ${dataCurta(e.inicio)}, daqui a ${plural(e.faltamDias, 'dia', 'dias')}`;
    return `em ${e.inicio === e.fim ? dataCurta(e.inicio) : `${dataCurta(e.inicio)} a ${dataCurta(e.fim)}`}`;
  }
  function publico(e) {
    if (e.desvioPct === null) return `Público previsto: ${num(e.publicoPrevisto)} pessoas.`;
    const base = e.parcial && e.duracao > 1 ? `${num(e.previstoComparavel)} previstos até hoje` : `${num(e.publicoPrevisto)} previstos`;
    return `${e.parcial ? 'Público até agora' : 'Público real'}: ${num(e.publicoReal)} pessoas, ${sinal(e.desvioPct)} sobre os ${base}${e.lotado ? ', bem acima do que o plano previa' : ''}.`;
  }
  const SIT = { pronto: 'pronta', pendente: 'pendente', atrasado: 'atrasada' };
  const frentesAtrasadas = (e) => e.pendentes.filter((f) => f.situacao === 'atrasado');

  function sobreUm(e) {
    const partes = [`${e.nome}: ${e.local.nome}, ${quando(e)}.`, publico(e)];
    if (e.status === 'realizado') {
      partes.push(`O que foi feito: ${e.frentes.map((f) => `${minuscula(f.nome)}, ${f.textoFeito}`).join('; ')}.`);
      if (e.limpezaAtrasou) partes.push('A limpeza passou do prazo; para o próximo evento desse tamanho, sugiro mais equipes de limpeza.');
    } else {
      partes.push(`Plano: ${nomes(e.frentes.map((f) => `${minuscula(f.nome)} ${SIT[f.situacao]}`))}.`);
      const atr = frentesAtrasadas(e);
      if (atr.length) partes.push(`Atrasada: ${nomes(atr.map((f) => `${minuscula(f.nome)} (${f.textoPrevisto})`))}. Sugiro cobrar ${atr.length === 1 ? 'a secretaria' : 'as secretarias'} hoje.`);
      else if (e.pendentes.length) partes.push(`Ainda falta fechar ${nomes(e.pendentes.map((f) => minuscula(f.nome)))}.`);
      if (e.lotado && e.status === 'em_andamento') partes.push('Com mais gente que o previsto, sugiro reforçar ônibus na saída e a limpeza depois.');
    }
    return {
      texto: partes.join(' '),
      ...(e.desvioPct !== null ? { grafico: { tipo: 'barra', titulo: `Público: previsto × ${e.parcial ? 'até agora' : 'real'}`, rotulos: [e.nome], series: [{ nome: 'Previsto', valores: [e.previstoComparavel] }, { nome: e.parcial ? 'Até agora' : 'Real', valores: [e.publicoReal] }], unidade: 'pessoas' } } : {}),
      acoes: [camada(`Ver ${e.nome} no mapa`, 'eventos', e.id)],
    };
  }

  function visaoGeral(r) {
    const partes = [];
    if (r.emAndamento.length) partes.push(`Acontecendo agora: ${nomes(r.emAndamento.map((e) => `${e.nome} (${e.desvioPct === null ? `${num(e.publicoPrevisto)} previstos` : `${num(e.publicoReal)} pessoas, ${sinal(e.desvioPct)} sobre o previsto`})`))}.`);
    if (r.proximos.length) partes.push(`${plural(r.proximos.length, 'evento', 'eventos')} nos próximos ${GC.data.eventos.janelaFuturoDias} dias, com ${num(r.publicoPrevistoProximos)} pessoas previstas: ${nomes(r.proximos.map((e) => `${e.nome} (${dataCurta(e.inicio)})`))}.`);
    if (r.planosAtrasados.length) {
      partes.push(`O ponto de atenção é o plano de operação: ${nomes(r.planosAtrasados.map((e) => `${e.nome}, com ${nomes(frentesAtrasadas(e).map((f) => minuscula(f.nome)))} sem ficar ${frentesAtrasadas(e).length === 1 ? 'pronta' : 'prontas'}`))}.`);
    } else if (r.planosPendentes.length) partes.push(`Nenhum plano atrasado; ${plural(r.planosPendentes.length, 'plano ainda tem frente pendente', 'planos ainda têm frente pendente')}, no prazo.`);
    else partes.push('Todos os planos de operação estão prontos.');
    if (r.realizados.length) {
      const ult = r.realizados[0];
      partes.push(`No último, ${ult.nome}, vieram ${num(ult.publicoReal)} pessoas (${sinal(ult.desvioPct)} sobre o previsto)${ult.limpezaAtrasou ? ' e a limpeza passou do prazo' : ''}.`);
    }
    const alvo = r.planosAtrasados[0] || r.atencao[0] || r.emAndamento[0] || r.proximos[0] || r.eventos[0];
    const comReal = r.eventos.filter((e) => e.desvioPct !== null);
    return {
      texto: partes.join(' '),
      ...(comReal.length ? { grafico: { tipo: 'barra', titulo: 'Público previsto × real', rotulos: comReal.map((e) => e.nome), series: [{ nome: 'Previsto', valores: comReal.map((e) => e.previstoComparavel) }, { nome: 'Real', valores: comReal.map((e) => e.publicoReal) }], unidade: 'pessoas' } } : {}),
      acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'eventos', alvo.id)] : [],
    };
  }

  GC.temasIA.push({
    ordem: 195, // empate de palavras-chave: vence o menor (o calendário sazonal, 190, fica com "fim de ano")
    id: 'eventos',
    chaves: [{ termo: 'grande evento', peso: 3 }, { termo: 'grandes eventos', peso: 3 }, { termo: 'evento', peso: 2 },
      { termo: 'show', peso: 3, inteira: true }, { termo: 'festival', peso: 3 }, { termo: 'maratona', peso: 3 }, { termo: 'reveillon', peso: 3 },
      { termo: 'natal iluminado', peso: 3 }, { termo: 'campeonato', peso: 3 }, { termo: 'expo', peso: 3, inteira: true },
      { termo: 'publico previsto', peso: 3 }, { termo: 'publico real', peso: 3 }, { termo: 'onibus extra', peso: 3 },
      { termo: 'prontidao', peso: 3 }, { termo: 'plano de operacao', peso: 3 }],
    nome: 'Grandes eventos',
    assunto: 'dos grandes eventos e do plano de operação',
    exemplo: 'Como está o plano de operação dos grandes eventos?',
    disponivel: () => !!GC.eventos,
    responder(ctx, pergunta) {
      const r = GC.eventos.resumo();
      if (!r.eventos.length) return { texto: 'Não há grande evento nos últimos 14 dias nem nos próximos 60.', acoes: [] };
      const q = normalizar(pergunta || '');
      const um = r.eventos.find((e) => citado(q, e));
      return um ? sobreUm(um) : visaoGeral(r);
    },
    origem: { areas: ['mobilidade', 'saude', 'limpeza', 'seguranca'], fontes: ['eventos.agenda', 'eventos.plano_operacao', 'eventos.contagem_publico'], consulta: 'SELECT e.nome, e.inicio, e.publico_previsto, e.publico_real, p.frente, p.previsto, p.feito, p.pronto FROM eventos.agenda e JOIN eventos.plano_operacao p ON p.evento_id = e.id WHERE e.fim >= hoje() - 14 AND e.inicio <= hoje() + 60' },
    base: { periodo: 'últimos 14 dias + próximos 60', registros: () => GC.eventos.resumo().eventos.reduce((s, e) => s + 1 + e.frentes.length, 0) },
  });
})(window.GC = window.GC || {});
