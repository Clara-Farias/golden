(function (GC) {
  // "Minha fila" do portal do servidor (servidor.html): o que espera a pessoa nas demandas passadas a ela e nas salas
  // de crise para as quais foi chamada. Só lógica, sem DOM. Uma demanda aparece uma vez, no tipo mais urgente; dentro
  // do tipo, a que vence primeiro. Spec: docs/specs/2026-11-17-vila-dourada-portal-do-servidor-design.md (fases 1 e 2).
  const MIN = 60000;
  const VENCE_EM_BREVE_MIN = 24 * 60;
  const RESPOSTA_RECENTE_MIN = 3 * 24 * 60; // a resposta da dúvida fica na fila por até 3 dias, ou até a pessoa dar notícia

  GC.TIPOS_FILA_SERVIDOR = {
    questao_gabinete: { rotulo: 'A sala de crise pergunta', passo: 'Responder', icone: 'help-hexagon' },
    cobrada: { rotulo: 'Cobraram você', passo: 'Responder', icone: 'speakerphone' },
    chamado_gabinete: { rotulo: 'Chamaram você para a sala de crise', passo: 'Abrir a sala', icone: 'urgent' },
    noticia_pedida: { rotulo: 'Pediram notícia', passo: 'Dar notícia', icone: 'bell-ringing' },
    atrasada: { rotulo: 'Atrasada', passo: 'Fazer ou dar notícia', icone: 'alert-triangle' },
    duvida_respondida: { rotulo: 'Responderam sua dúvida', passo: 'Ler a resposta', icone: 'message-check' },
    sala_demanda: { rotulo: 'Demanda da sala de crise', passo: 'Fazer', icone: 'building-community' },
    vence: { rotulo: 'Vence em breve', passo: 'Fazer', icone: 'clock' },
    nova: { rotulo: 'Nova demanda', passo: 'Começar', icone: 'clipboard-plus' },
  };
  const ORDEM = Object.keys(GC.TIPOS_FILA_SERVIDOR);
  const FIM_SALA = ['concluida', 'cancelada'];

  // Tipo da demanda na fila (null = nada esperando): o mais urgente.
  GC.tipoNaFila = function (t, agora = GC.agora ? GC.agora() : Date.now()) {
    if (!GC.tarefaAberta(t)) return null;
    if (t.respostaPendente) return 'cobrada';
    if (t.atualizacaoPedidaEm) return 'noticia_pedida';
    if (agora > t.prazoEm) return 'atrasada';
    if (t.esclarecidaEm && t.esclarecidaEm > (t.ultimaAtualizacaoEm || 0) && agora - t.esclarecidaEm <= RESPOSTA_RECENTE_MIN * MIN) return 'duvida_respondida';
    if (t.prazoEm - agora <= VENCE_EM_BREVE_MIN * MIN) return 'vence';
    if (t.status === 'a_fazer') return 'nova';
    return null;
  };

  // Salas de crise abertas em que a pessoa está (membro ativo).
  GC.salasDoServidor = (gabinetes, usuario) => (usuario ? (gabinetes || []).filter((g) => !g.encerradoEm && (g.membros || []).some((m) => m.usuarioId === usuario.id && !m.saiuEm)) : []);
  const membroDe = (g, u) => (g.membros || []).find((m) => m.usuarioId === u.id && !m.saiuEm);
  // Questões da sala que esperam a pessoa: apontadas a ela, ou à pasta dela.
  GC.questoesParaServidor = (g, u) => (g.perguntas || []).filter((q) => q.para && (q.para.usuarioId === u.id || (!q.para.usuarioId && q.para.area === u.area)));
  const prazoSala = (g, t) => (t.criadaEm || g.abertoEm || 0) + (t.prazoMin || 0) * MIN;

  // O que espera a pessoa nas salas (cada item com o gabinete).
  function itensDasSalas(salas, u, agora) {
    const itens = [];
    salas.forEach((g) => {
      const m = membroDe(g, u);
      GC.questoesParaServidor(g, u).filter((q) => !q.resposta)
        .forEach((q) => itens.push({ tipo: 'questao_gabinete', gabinete: g, questao: q, prazoEm: g.abertoEm }));
      g.tarefas.filter((t) => t.responsavelId === u.id && !FIM_SALA.includes(t.status)).forEach((t) => {
        const prazoEm = prazoSala(g, t);
        itens.push({ tipo: t.respostaPendente ? 'cobrada' : agora > prazoEm ? 'atrasada' : 'sala_demanda', gabinete: g, tarefaSala: t, prazoEm });
      });
      if (m && !m.vistoEm) itens.push({ tipo: 'chamado_gabinete', gabinete: g, prazoEm: m.chamadoEm });
      (g.duvidas || []).filter((d) => d.usuarioId === u.id && d.resposta && (!m || !m.vistoEm || d.respondidaEm > m.vistoEm))
        .forEach((d) => itens.push({ tipo: 'duvida_respondida', gabinete: g, duvida: d, prazoEm: d.respondidaEm }));
    });
    return itens;
  }

  // tarefas: a lista do registro (GC.tarefas.lista()); gabinetes: os do registro de js/crise.js (todos ou os ativos);
  // usuario: quem usa o portal. Devolve { itens: [{ tipo, tarefa } | { tipo, gabinete, questao | tarefaSala | duvida }],
  // salas, abertas, atrasadas, esperandoResposta, feitasSemana }.
  GC.filaDoServidor = function ({ tarefas = [], gabinetes = [], usuario = null, agora = GC.agora ? GC.agora() : Date.now() } = {}) {
    const minhas = usuario ? tarefas.filter((t) => t.responsavelId === usuario.id && t.area === usuario.area) : [];
    const abertas = minhas.filter(GC.tarefaAberta);
    const salas = GC.salasDoServidor(gabinetes, usuario);
    const daSala = usuario ? salas.flatMap((g) => g.tarefas.filter((t) => t.responsavelId === usuario.id && !FIM_SALA.includes(t.status)).map((t) => ({ g, t }))) : [];
    const itens = [
      ...abertas.map((t) => ({ tipo: GC.tipoNaFila(t, agora), tarefa: t, prazoEm: t.prazoEm })).filter((x) => x.tipo),
      ...(usuario ? itensDasSalas(salas, usuario, agora) : []),
    ].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo) || a.prazoEm - b.prazoEm);
    return {
      itens,
      salas,
      abertas: abertas.length + daSala.length,
      atrasadas: abertas.filter((t) => agora > t.prazoEm).length + daSala.filter(({ g, t }) => agora > prazoSala(g, t)).length,
      // dúvidas que a pessoa mandou e ainda não voltaram (nas demandas e nas salas)
      esperandoResposta: abertas.filter((t) => t.duvida).length + salas.reduce((n, g) => n + (g.duvidas || []).filter((d) => d.usuarioId === usuario.id && !d.resposta).length, 0),
      feitasSemana: minhas.filter((t) => t.status === 'feita' && t.feitaEm && agora - t.feitaEm <= 7 * 1440 * MIN).length,
    };
  };
})(window.GC = window.GC || {});
