(function (GC) {
  // Maia no gabinete de crise (spec 2026-11-12, Maia v2, fase 5). Com uma sala aberta, o contexto traz
  // foco: { tipo: 'gabinete', resumo (gabinetes.resumo), rascunhos (um por fase do comunicado) }.
  // Responde "o que falta?" (andamento, atrasos, comunicado, encerramento) e escreve o comunicado da fase certa.
  // Pergunta de outro assunto devolve null e segue para os temas.
  GC.focosIA = GC.focosIA || {};
  const STATUS = /\b(o que falta|falta fazer|faltam|pendente\w*|andamento|situacao|status|como esta|como vai|resum\w*|atrasad\w*|proximo passo|proximos passos|o que fazer|quem esta|balanco|encerr\w*)\b/;
  const FASE_NOME = { alerta: 'alerta', atualizacao: 'atualização', normalizacao: 'normalização' };

  // Fase sugerida (a mesma da tela): sem comunicado ainda é alerta; com tudo feito, normalização; senão, atualização.
  function faseSugerida(r) {
    if (!r.gabinete.comunicados.length) return 'alerta';
    if (r.total && r.feitas === r.total) return 'normalizacao';
    return 'atualizacao';
  }

  function andamento(r) {
    const { plural, nomes } = GC.iaUtil;
    const tempo = GC.tempoTexto || ((m) => `${m} min`);
    const g = r.gabinete;
    if (g.encerradoEm && r.balanco) {
      const b = r.balanco;
      return `O gabinete "${g.titulo}" foi encerrado depois de ${tempo(b.duracaoMin)}: ${b.concluidas} de ${b.total} demandas concluídas, ${b.noPrazo} no prazo, ${plural(b.cobrancas, 'cobrança', 'cobranças')} e ${plural(b.comunicados, 'comunicado', 'comunicados')} à população.${b.motivo ? ` Motivo do encerramento: ${b.motivo}.` : ''}`;
    }
    const ativas = r.tarefas.filter((t) => !['concluida', 'cancelada'].includes(t.status));
    const atrasadas = ativas.filter((t) => t.atrasada).sort((a, b) => a.restanteMin - b.restanteMin);
    const noPrazo = ativas.filter((t) => !t.atrasada);
    let texto = `Gabinete "${g.titulo}" (${r.bairro}), aberto há ${tempo(r.abertoHaMin)}: ${r.feitas} de ${r.total} demandas concluídas (${r.pct}%).`;
    if (atrasadas.length) texto += ` ${atrasadas.length === 1 ? 'Uma está atrasada' : `${atrasadas.length} estão atrasadas`}: ${nomes(atrasadas.slice(0, 3).map((t) => `"${t.texto}" (${t.secretaria.nome}, ${tempo(-t.restanteMin)} além do prazo)`))}.`;
    if (noPrazo.length) {
      const sujeito = atrasadas.length ? (noPrazo.length === 1 ? 'Outra segue' : `Outras ${noPrazo.length} seguem`) : (noPrazo.length === 1 ? 'A demanda em aberto segue' : `As ${noPrazo.length} em aberto seguem`);
      texto += ` ${sujeito} no prazo.`;
    }
    texto += r.ultimoComunicado ? ` O último comunicado à população saiu há ${tempo(Math.round(((GC.agora ? GC.agora() : Date.now()) - r.ultimoComunicado.t) / 60000))}.` : ' Ainda não há comunicado à população.';
    if (r.sugestaoEncerrar) texto += ` ${r.sugestaoEncerrar} Sugiro avaliar o encerramento.`;
    else if (atrasadas.length) texto += ` Sugiro cobrar a ${atrasadas[0].secretaria.nome} pela demanda mais atrasada.`;
    else if (!r.ultimoComunicado) texto += ' Sugiro publicar o comunicado de alerta.';
    return texto;
  }

  GC.focosIA.gabinete = {
    responder(foco, ent) {
      const r = foco.resumo;
      if (!r || !r.gabinete) return null;
      const g = r.gabinete;
      const fontes = ['gabinete.salas_crise', 'gestao.ocorrencias', 'planejamento.bairros'];
      // Comunicado: o rascunho da fase sugerida, o mesmo que a aba Comunicado do gabinete mostra.
      if (ent.intencao === 'rascunho' && (!ent.documento || ent.documento === 'comunicado')) {
        if (g.encerradoEm) return { cenario: 'gabinete', texto: 'Este gabinete já foi encerrado: não há novos comunicados.' };
        const fase = faseSugerida(r);
        const d = (foco.rascunhos || {})[fase];
        if (!d || !d.texto) return null;
        return {
          cenario: 'gabinete',
          texto: `Rascunho do comunicado de ${FASE_NOME[fase]} do gabinete "${g.titulo}". O texto é editável; para publicar, use a aba Comunicado do gabinete, que escolhe os canais e registra o envio.`,
          documento: { tipo: 'comunicado', titulo: `Comunicado de ${FASE_NOME[fase]} · ${g.titulo}`, texto: d.texto, ...(d.sms ? { sms: d.sms.slice(0, 160) } : {}) },
          fontes,
        };
      }
      if (!STATUS.test(ent.q) && ent.q.split(' ').length > 3) return null;
      return {
        cenario: 'gabinete',
        texto: andamento(r),
        fontes,
        acoes: g.encerradoEm ? [] : [{ rotulo: 'Escreva o comunicado', tipo: 'perguntar', payload: { texto: 'Escreva o comunicado à população' } }],
      };
    },
  };
})(window.GC = window.GC || {});
