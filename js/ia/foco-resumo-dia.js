(function (GC) {
  // Maia no Resumo do dia (spec 2026-11-12, Maia v2, fase 5). Com o cartão aberto, o contexto traz
  // foco: { tipo: 'resumoDia', resumo (GC.resumoDoDia) }. "Por onde começar hoje?" põe em ordem as decisões,
  // a chuva, o que piorou e o gabinete. Pergunta de outro assunto devolve null e segue para os temas.
  GC.focosIA = GC.focosIA || {};
  const COMECAR = /\b(por onde comec\w*|comec\w* por|o que fazer|primeiro|prioridad\w*|prioriz\w* hoje|resum\w*|hoje|decid\w*|meu dia)\b/;
  const ACAO = { cobrar: 'cobrar a secretaria', priorizar: 'priorizar', gabinete: 'abrir o gabinete de crise' };

  GC.focosIA.resumoDia = {
    responder(foco, ent) {
      const r = foco.resumo;
      if (!r || ent.intencao || !COMECAR.test(ent.q)) return null;
      const { nomes } = GC.iaUtil;
      const partes = [];
      const [d1, d2] = r.decisoes || [];
      if (d1) partes.push(`Comece por ${d1.titulo} (${d1.bairro})${d1.motivo ? `: ${d1.motivo.replace(/^\p{Extended_Pictographic}️?\s*/u, '').toLowerCase()}` : ''}.${d1.acoes && d1.acoes[0] ? ` Sugiro ${ACAO[d1.acoes[0]] || d1.acoes[0]}.` : ''}`);
      else partes.push('Nenhuma decisão pendente agora: as secretarias já receberam tudo.');
      if (d2) partes.push(`Depois, ${d2.titulo} (${d2.bairro}).`);
      if (r.totalDecisoes > (r.decisoes || []).length) partes.push(`Há mais ${r.totalDecisoes - r.decisoes.length} na gaveta de Alertas.`);
      const chuva = (r.destaques || []).find((x) => x.tipo === 'chuva');
      if (chuva && chuva.tom === 'atencao') partes.push(`${chuva.rotulo}, com ${chuva.detalhe}.`);
      if (r.gabinete) partes.push(r.gabinete.tipo === 'ativo' ? `O gabinete "${r.gabinete.titulo}" segue ativo (${r.gabinete.detalhe}).` : `Vale considerar o gabinete preventivo (${r.gabinete.titulo}: ${r.gabinete.detalhe}).`);
      const piorou = (r.destaques || []).find((x) => x.tipo === 'piorou');
      if (piorou) partes.push(`No acompanhamento, o que mais piorou foi ${piorou.rotulo.replace(/^Piorou · /, '').toLowerCase()} (${piorou.detalhe}).`);
      const acoes = [];
      if (d1 && d1.acoes && d1.acoes[0] && d1.acoes[0] !== 'gabinete') acoes.push({ rotulo: `${d1.acoes[0] === 'cobrar' ? '📣 Cobrar' : '⚡ Priorizar'}: ${d1.titulo}`, tipo: 'agir', payload: { ocorrenciaId: d1.id, acao: d1.acoes[0] } });
      if (d1) acoes.push({ rotulo: `Ver no mapa: ${d1.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: d1.id } });
      if (piorou && piorou.area) acoes.push({ rotulo: 'Por que piorou?', tipo: 'perguntar', payload: { texto: 'Por que piorou?' } });
      return { cenario: 'resumoDia', texto: `${r.escopo ? `No recorte ${nomes(r.escopo.split(', '))}: ` : ''}${partes.join(' ')}`, acoes };
    },
  };
})(window.GC = window.GC || {});
