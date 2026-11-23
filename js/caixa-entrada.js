(function (GC) {
  // Caixa de entrada do secretário ("Para fazer hoje") e aviso antecipado de prazo
  // (spec: docs/specs/2026-11-12-vila-dourada-caixa-de-entrada-design.md). Só lógica, sem DOM.
  // Uma ocorrência aparece uma vez, no tipo mais urgente; dentro do tipo, o que vence primeiro vem antes.

  const MIN = 60000;
  // "Vai estourar": prazo acabando nas próximas GC.JANELA_ANTECIPA_MIN (2 h), em js/prazos.js.
  const NO_LOCAL_LONGO_MIN = 240; // equipe no local há mais de 4 h: conferir se já dá para resolver
  const ORDEM = ['cobranca', 'explicacao', 'acao_cobrada', 'tarefa_cobrada', 'pessoa_gabinete', 'tarefa_duvida', 'delegada_prefeito', 'agenda_prefeito', 'ajuda_recebida', 'estourada', 'vai_estourar', 'tarefa_atrasada', 'pausa_longa', 'reaberta', 'pasta_definida', 'devolvida', 'delegada', 'ajuda_parada', 'meta_proposta', 'meta_vencida', 'acao_vencida', 'tarefa_vence', 'meta_sem_plano', 'no_local_longo'];
  GC.TIPOS_CAIXA = {
    cobranca: { rotulo: 'Cobrança do prefeito', passo: 'Responder' },
    explicacao: { rotulo: 'O prefeito pediu explicação', passo: 'Explicar' },
    acao_cobrada: { rotulo: 'O prefeito cobrou uma ação do plano', passo: 'Dar nova data ou marcar feita' },
    tarefa_cobrada: { rotulo: 'Demanda cobrada', passo: 'Responder' },
    tarefa_duvida: { rotulo: 'Dúvida sobre uma demanda', passo: 'Responder a dúvida' },
    pessoa_gabinete: { rotulo: 'A sala de crise pediu alguém da pasta', passo: 'Chamar um servidor' },
    tarefa_atrasada: { rotulo: 'Demanda atrasada', passo: 'Fazer ou pedir novo prazo' },
    tarefa_vence: { rotulo: 'Demanda vence em breve', passo: 'Fazer' },
    delegada_prefeito: { rotulo: 'O prefeito delegou a você', passo: 'Decidir e dar o retorno' },
    agenda_prefeito: { rotulo: 'Agenda com o prefeito', passo: 'Preparar' },
    reaberta: { rotulo: 'Reaberta pelo prefeito', passo: 'Despachar equipe' },
    pasta_definida: { rotulo: 'O prefeito definiu que é sua', passo: 'Despachar equipe' },
    ajuda_recebida: { rotulo: 'Pedido de outra secretaria', passo: 'Aceitar ou recusar' },
    estourada: { rotulo: 'Prazo estourado', passo: 'Despachar equipe' },
    vai_estourar: { rotulo: 'Vai estourar', passo: 'Despachar equipe' },
    devolvida: { rotulo: 'Chegou devolvida', passo: 'Despachar equipe' },
    delegada: { rotulo: 'Delegada a você', passo: 'Abrir e atender' },
    ajuda_parada: { rotulo: 'Seu pedido de ajuda parou', passo: 'Levar ao prefeito' },
    meta_proposta: { rotulo: 'Meta proposta pelo prefeito', passo: 'Aceitar ou contrapropor' },
    meta_vencida: { rotulo: 'Prazo da meta venceu', passo: 'Propor a meta do próximo ciclo' },
    acao_vencida: { rotulo: 'Ação do plano atrasada', passo: 'Fazer ou marcar feita' },
    meta_sem_plano: { rotulo: 'Fora da meta sem plano', passo: 'Registrar plano de ação' },
    no_local_longo: { rotulo: 'Equipe no local há muito tempo', passo: 'Conferir e resolver' },
    pausa_longa: { rotulo: 'Prazo pausado há muito tempo', passo: 'Retomar ou explicar ao prefeito' },
  };

  const restanteMin = (o, agora) => GC.prazoDe(o, agora).atendimento.restanteMin;
  const venceEm = (o) => GC.prazoDe(o).atendimento.limiteEm;
  // Na janela de horas, o minuto importa ("1 h 40 min", não "2 h"); acima de um dia, o texto de sempre.
  const tempo = (bruto) => {
    const min = Math.max(1, Math.round(bruto));
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
    return GC.tempoTexto ? GC.tempoTexto(min) : `${Math.round(min / 1440)} dias`;
  };
  GC.tempoCurto = tempo; // também no aviso antecipado (js/app/simulacao.js)
  const semEquipe = (o) => o.status === 'encaminhada' && !o.equipeId;

  // As da lista que vão estourar na janela: sem equipe, prazo ainda não estourado e acabando em até `janela` min.
  GC.vaoEstourar = function (ocorrencias, agora = GC.agora(), janela = GC.JANELA_ANTECIPA_MIN) {
    return (ocorrencias || [])
      .filter((o) => semEquipe(o) && !(GC.pausaAtual && GC.pausaAtual(o)) && restanteMin(o, agora) > 0 && restanteMin(o, agora) <= janela)
      .sort((a, b) => restanteMin(a, agora) - restanteMin(b, agora));
  };

  // ocorrencias: as abertas (a store filtra); cobrancas: GC.cobrancas (ou null); ajudas: GC.ajudas (ou null);
  // area: a pasta do secretário. Os itens de pedido de ajuda são do pedido (não contam como "a ocorrência já apareceu").
  // pactos: GC.pactos (ou null); indicadores: os avaliados da pasta (GC.avaliarIndicadores), para "fora da meta sem plano".
  // usuario: quem vê. O diretor de unidade (nivel 'unidade') vê só as ocorrências delegadas a ele, sem metas nem pedidos.
  // acoesPrefeito: GC.acoesPrefeito (ou null): explicações pedidas à pasta e ocorrências que o prefeito delegou a quem vê.
  // tarefas: a lista unificada (GC.tarefasUnificadas: registro e gabinetes). Entra o que é da pasta e cabe a quem vê:
  // o diretor, só as passadas a ele; o secretário, as da secretaria ou passadas a ele (as de um diretor são do diretor).
  // crise: há gabinete de crise aberto com a pasta envolvida (GC.criseMudaOrdem, js/modo-crise.js). As demandas do
  // gabinete passam à frente de todo o resto; fora isso, a ordem dos tipos é a de sempre.
  const VENCE_EM_BREVE_MIN = 24 * 60;
  // gabinetes: os gabinetes ativos (js/crise.js): o pedido de "alguém da pasta" da sala vai ao secretário.
  GC.caixaDeEntrada = function ({ ocorrencias = [], cobrancas = null, ajudas = null, pactos = null, acoesPrefeito = null, tarefas = [], indicadores = [], usuario = null, area, agora = GC.agora(), crise = false, gabinetes = [] } = {}) {
    const diretor = !!usuario && GC.nivelDe(usuario) === 'unidade'; // perfil criado com alcance 'delegadas' também
    const daPasta = ocorrencias.filter((o) => o.area === area && o.status !== 'resolvida' && (!diretor || o.delegadoA === usuario.id));
    // Ações do plano (fase 2): o diretor vê só as de que é responsável; metas e pedidos continuam só do secretário.
    const pactosAcoes = pactos;
    const minhaAcao = (a) => !diretor || a.responsavel === usuario.id;
    if (diretor) { ajudas = null; pactos = null; indicadores = []; }
    const itens = [];
    const usadas = new Set();
    const por = (tipo, o, extra) => {
      if (o && usadas.has(o.id)) return;
      if (o) usadas.add(o.id);
      itens.push(Object.assign({ tipo, ocorrenciaId: o ? o.id : null, titulo: o ? o.titulo : '', bairroId: o ? o.bairroId : null, severidade: o ? o.severidade : 'media' }, extra));
    };

    // 1. Cobranças para responder (com o retrato: a ocorrência pode não estar nesta aba).
    if (cobrancas) {
      const g = cobrancas.grupos({ id: 'setor', area }, agora).grupos;
      const responder = g.filter((x) => x.id === 'responder' || x.id === 'recusado').flatMap((x) => x.itens)
        .sort((a, b) => cobrancas.limite(a) - cobrancas.limite(b));
      responder.forEach((c) => {
        const o = daPasta.find((x) => x.id === c.ocorrenciaId) || null;
        if (diretor && !o) return; // o diretor responde só a cobrança do que é dele
        if (o && usadas.has(o.id)) return;
        if (o) usadas.add(o.id);
        itens.push({
          tipo: 'cobranca', ocorrenciaId: c.ocorrenciaId, cobrancaId: c.id, naAba: !!o,
          titulo: c.retrato.titulo, bairroId: c.retrato.bairroId, severidade: c.retrato.severidade,
          texto: GC.resumoCobranca ? GC.resumoCobranca(c, agora).replace(/^📣 /, '') : 'Responder ao prefeito',
          venceEm: cobrancas.limite(c),
        });
      });
    }

    // Explicações pedidas pelo prefeito e o que ele delegou a quem vê (js/acoes-prefeito.js). Não ocupam a
    // ocorrência: ela pode aparecer de novo pelo prazo (são duas coisas a fazer).
    if (acoesPrefeito) {
      const naAba = (oid) => ocorrencias.some((o) => o.id === oid);
      acoesPrefeito.todas()
        .filter((r) => r.tipo === 'explicacao' && r.estado === 'aberta' && r.area === area && (!diretor || daPasta.some((o) => o.id === r.ocorrenciaId)))
        .sort((a, b) => a.prazoRespostaEm - b.prazoRespostaEm)
        .forEach((r) => itens.push({
          tipo: 'explicacao', ocorrenciaId: r.ocorrenciaId, acaoPrefeitoId: r.id, naAba: naAba(r.ocorrenciaId),
          titulo: r.retrato.titulo, bairroId: r.retrato.bairroId, severidade: r.retrato.severidade, venceEm: r.prazoRespostaEm,
          texto: `“${r.passos.filter((p) => p.tipo === 'pergunta').map((p) => p.texto).pop() || r.pergunta}”${agora > r.prazoRespostaEm ? ' · prazo de resposta passou' : ''}`,
        }));
      if (usuario) {
        acoesPrefeito.todas().filter((r) => r.tipo === 'delegacao' && r.estado === 'ativa' && r.para === usuario.id).forEach((r) => itens.push({
          tipo: 'delegada_prefeito', ocorrenciaId: r.ocorrenciaId, acaoPrefeitoId: r.id, naAba: naAba(r.ocorrenciaId),
          titulo: r.retrato.titulo, bairroId: r.retrato.bairroId, severidade: r.retrato.severidade, venceEm: null,
          texto: r.texto ? `Orientação: ${r.texto}` : `Delegada por ${r.de.quem}`,
        }));
      }
      // Visita ou conversa com o prefeito marcada, sobre ocorrência da pasta.
      acoesPrefeito.todas().filter((r) => r.tipo === 'agenda' && r.estado === 'marcada' && r.area === area && r.quando > agora - 2 * 60 * MIN && (!diretor || daPasta.some((o) => o.id === r.ocorrenciaId)))
        .sort((a, b) => a.quando - b.quando)
        .forEach((r) => itens.push({
          tipo: 'agenda_prefeito', ocorrenciaId: r.ocorrenciaId, acaoPrefeitoId: r.id, naAba: naAba(r.ocorrenciaId),
          titulo: r.retrato.titulo, bairroId: r.retrato.bairroId, severidade: r.retrato.severidade, venceEm: r.quando,
          texto: `${GC.FORMAS_AGENDA[r.forma]}: ${GC.quandoAgenda ? GC.quandoAgenda(r.quando) : ''}${r.texto ? ` · ${r.texto}` : ''}`,
        }));
    }

    // O prefeito reabriu ou definiu que é da pasta, e ainda não há equipe (js/acoes-prefeito.js, gestos na store).
    daPasta.filter((o) => semEquipe(o) && (o.reaberturas || []).length).forEach((o) => {
      const r = o.reaberturas[o.reaberturas.length - 1];
      por('reaberta', o, { texto: `${(GC.MOTIVOS_REABRIR || {})[r.motivo] || 'Reaberta'}${r.texto ? ` · ${r.texto}` : ''}`, venceEm: venceEm(o), naAba: true });
    });
    daPasta.filter((o) => semEquipe(o) && o.pastaDefinida && o.pastaDefinida.area === area && o.pastaDefinida.de !== area)
      .forEach((o) => por('pasta_definida', o, { texto: `O prefeito definiu que é da sua pasta: ${o.pastaDefinida.motivo}`, venceEm: venceEm(o), naAba: true }));

    // Pedidos de ajuda entre secretarias (js/ajudas.js): os recebidos para responder e os seus que pararam.
    if (ajudas) {
      const g = ajudas.grupos({ id: 'setor', area }, agora).grupos;
      const doGrupo = (gid) => (g.find((x) => x.id === gid) || { itens: [] }).itens;
      const sec = (id) => (GC.data.areas.find((a) => a.id === id) || { secretaria: { nome: 'outra pasta' } }).secretaria.nome;
      const item = (tipo, a, txt) => ({
        tipo, ocorrenciaId: a.ocorrenciaId, ajudaId: a.id, naAba: daPasta.some((o) => o.id === a.ocorrenciaId) || ocorrencias.some((o) => o.id === a.ocorrenciaId),
        titulo: a.retrato.titulo, bairroId: a.retrato.bairroId, severidade: a.retrato.severidade, texto: txt, venceEm: a.prazoRespostaEm,
      });
      doGrupo('recebidos').forEach((a) => itens.push(a.determinado
        ? Object.assign(item('ajuda_recebida', a, `O prefeito determinou a ajuda à ${sec(a.de)}: ${a.texto}`), { passo: 'Cumprir e concluir' })
        : item('ajuda_recebida', a, `${sec(a.de)} pede ${GC.PEDIDOS_AJUDA[a.tipo].toLowerCase()}: ${a.texto}`)));
      doGrupo('levar').forEach((a) => itens.push(item('ajuda_parada', a, GC.resumoAjuda(a, agora).replace(/^🤝 /, ''))));
    }

    // 2. Prazo estourado e sem equipe (o mais estourado primeiro).
    daPasta.filter((o) => semEquipe(o) && restanteMin(o, agora) < 0)
      .sort((a, b) => restanteMin(a, agora) - restanteMin(b, agora))
      .forEach((o) => por('estourada', o, { texto: `Estourou há ${tempo(-restanteMin(o, agora))} · sem equipe`, venceEm: venceEm(o), naAba: true }));

    // 3. Vai estourar nas próximas 2 h.
    GC.vaoEstourar(daPasta, agora).forEach((o) => por('vai_estourar', o, { texto: `Estoura em ${tempo(restanteMin(o, agora))} · sem equipe`, venceEm: venceEm(o), naAba: true }));

    // 4. Chegou devolvida de outra pasta e ainda sem equipe.
    daPasta.filter((o) => semEquipe(o) && (o.devolucoes || []).length && o.devolucoes[o.devolucoes.length - 1].para === area)
      .forEach((o) => {
        const d = o.devolucoes[o.devolucoes.length - 1];
        const de = (GC.data.areas.find((a) => a.id === d.de) || { secretaria: { nome: 'outra pasta' } }).secretaria.nome;
        por('devolvida', o, { texto: `Devolvida pela ${de}: ${d.motivo}`, venceEm: venceEm(o), naAba: true });
      });

    // Ações do plano de ação (js/pactos.js): a cobrada pelo prefeito (uma vez, no tipo mais urgente) e a atrasada.
    if (pactosAcoes) {
      const nomeAc = (id) => (indicadores.find((i) => i.id === id) || (GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || { nome: id }).nome;
      const diaBr = (d) => d.split('-').reverse().join('/');
      const cobradas = pactosAcoes.acoesCobradas ? pactosAcoes.acoesCobradas(area).filter(minhaAcao) : [];
      const chave = (a) => `${a.indicadorId}#${a.id}`;
      cobradas.forEach((a) => itens.push({
        tipo: 'acao_cobrada', indicadorId: a.indicadorId, acaoId: a.id, titulo: nomeAc(a.indicadorId), bairroId: null, severidade: 'alta', naAba: false,
        texto: `${a.texto} · prazo era ${diaBr(a.prazo)}${a.cobranca && a.cobranca.quem ? ` · cobrada por ${a.cobranca.quem}` : ''}`,
      }));
      const jaCobradas = new Set(cobradas.map(chave));
      pactosAcoes.acoesVencidas(area, agora).filter((a) => minhaAcao(a) && !jaCobradas.has(chave(a))).forEach((a) => itens.push({
        tipo: 'acao_vencida', indicadorId: a.indicadorId, acaoId: a.id, titulo: nomeAc(a.indicadorId), bairroId: null, severidade: 'alta', naAba: false,
        texto: `${a.texto} · prazo era ${diaBr(a.prazo)}`,
      }));
    }

    // Tarefas (js/tarefas.js e as dos gabinetes): cobrada, atrasada e vencendo nas próximas 24 h. Uma vez cada.
    const minhasTarefas = (tarefas || []).filter((t) => t.area === area && GC.tarefaAberta && GC.tarefaAberta(t)
      && (diretor ? !!usuario && t.responsavelId === usuario.id : !t.responsavelId || (!!usuario && t.responsavelId === usuario.id)));
    const ctx = (t) => (t.contexto.tipo === 'avulsa' ? '' : ` · ${t.contexto.nome}`);
    minhasTarefas.forEach((t) => {
      const tipo = t.respostaPendente ? 'tarefa_cobrada' : agora > t.prazoEm ? 'tarefa_atrasada' : t.prazoEm - agora <= VENCE_EM_BREVE_MIN * MIN ? 'tarefa_vence' : null;
      if (!tipo) return;
      itens.push({
        tipo, tarefaId: t.id, titulo: t.texto, bairroId: null, severidade: tipo === 'tarefa_vence' ? 'media' : 'alta', naAba: false, venceEm: t.prazoEm,
        texto: `${GC.prazoTarefaTexto ? GC.prazoTarefaTexto(t, agora) : ''}${ctx(t)}`,
        passo: t.origem === 'gabinete' ? 'Abrir na sala' : undefined,
        daCrise: t.origem === 'gabinete',
      });
    });

    // A sala de crise pediu alguém da pasta (portal do servidor, fase 2): o secretário escolhe quem chamar.
    if (!diretor) {
      (gabinetes || []).filter((g) => !g.encerradoEm).forEach((g) => (g.pedidosMembro || []).filter((p) => p.area === area && !p.atendidoEm)
        .forEach((p) => itens.push({
          tipo: 'pessoa_gabinete', gabineteId: g.id, titulo: g.titulo, bairroId: g.bairroId || null, severidade: 'alta', naAba: false, venceEm: p.t,
          texto: p.motivo, daCrise: true,
        })));
    }

    // Dúvida de quem faz (portal do servidor): o secretário responde às das demandas da pasta passadas a outra pessoa
    // (diretor ou servidor); o diretor, às das demandas que ele mesmo passou.
    (tarefas || []).filter((t) => t.area === area && t.duvida && GC.tarefaAberta && GC.tarefaAberta(t) && t.responsavelId
      && (!usuario || t.responsavelId !== usuario.id)
      && (diretor ? !!usuario && !!t.criadaPor && t.criadaPor.id === usuario.id : true))
      .forEach((t) => itens.push({
        tipo: 'tarefa_duvida', tarefaId: t.id, titulo: t.texto, bairroId: null, severidade: 'media', naAba: false, venceEm: t.prazoEm,
        texto: `${t.duvida.quem ? `${t.duvida.quem}: ` : ''}${t.duvida.texto}`,
      }));

    // Metas (js/pactos.js): a proposta do prefeito, a meta vencida e o indicador fora da meta sem plano.
    if (pactos) {
      const nomeInd = (id) => (indicadores.find((i) => i.id === id) || (GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || { nome: id }).nome;
      pactos.pendentes('setor', area).forEach((p) => itens.push({
        tipo: 'meta_proposta', indicadorId: p.indicadorId, titulo: nomeInd(p.indicadorId), bairroId: null, severidade: 'media', naAba: false,
        texto: `O prefeito propõe ${p.proposta.valor} até ${p.proposta.prazo}: ${p.proposta.motivo}`,
      }));
      // O prazo da meta pactuada venceu (apurada por GC.apurarPactos) e ninguém propôs o próximo ciclo.
      if (pactos.vencidasSemNovoPacto) {
        const unidade = (id) => (indicadores.find((i) => i.id === id) || (GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || {}).unidade || '';
        const fmt = (v, id) => (GC.formatarIndicador ? GC.formatarIndicador(v, unidade(id)) : v);
        pactos.vencidasSemNovoPacto(area).forEach((p) => {
          const c = p.vigente.apurada;
          itens.push({
            tipo: 'meta_vencida', indicadorId: p.indicadorId, titulo: nomeInd(p.indicadorId), bairroId: null, severidade: c.resultado === 'cumprida' ? 'media' : 'alta', naAba: false,
            texto: `Meta de ${fmt(c.meta, p.indicadorId)} até ${c.prazo.split('-').reverse().join('/')}: ${c.resultado === 'cumprida' ? 'cumprida' : 'não cumprida'} (apurado ${fmt(c.valor, p.indicadorId)})`,
          });
        });
      }
      // Fora da meta mas no ritmo do caminho combinado (GC.ritmoIndicador): não pede plano.
      indicadores.filter((i) => i.area === area && i.situacao === 'critico' && i.ritmo !== 'no_ritmo' && !pactos.planoAtivo(i.id)).forEach((i) => itens.push({
        tipo: 'meta_sem_plano', indicadorId: i.id, titulo: i.nome, bairroId: null, severidade: 'alta', naAba: false,
        texto: `${GC.formatarIndicador ? GC.formatarIndicador(i.valorAtual, i.unidade) : i.valorAtual}, meta ${GC.formatarIndicador ? GC.formatarIndicador(i.metaAtual, i.unidade) : i.metaAtual}`,
      }));
    }

    // Diretor de unidade: o resto do que foi delegado a ele também entra (o que já apareceu num tipo urgente, não).
    if (diretor) {
      daPasta.forEach((o) => por('delegada', o, {
        texto: o.status === 'em_campo' ? 'Equipe no local · falta resolver' : o.equipeId ? 'Equipe a caminho' : `Sem equipe · prazo em ${tempo(restanteMin(o, agora))}`,
        venceEm: venceEm(o), naAba: true,
      }));
    }

    // Prazo pausado além do teto dos parâmetros (js/prazos.js): o prefeito também vê.
    daPasta.filter((o) => GC.pausaLonga && GC.pausaLonga(o, agora))
      .forEach((o) => {
        const pa = GC.pausaAtual(o);
        por('pausa_longa', o, { texto: `Prazo pausado há ${tempo((agora - pa.desde) / MIN)}: ${GC.MOTIVOS_PAUSA[pa.motivo] || pa.motivo}`, venceEm: pa.desde, naAba: true });
      });

    // 5. Equipe no local há mais de 4 h.
    daPasta.filter((o) => o.status === 'em_campo' && o.equipeId && o.despachadaEm && (agora - o.despachadaEm) / MIN > NO_LOCAL_LONGO_MIN)
      .sort((a, b) => a.despachadaEm - b.despachadaEm)
      .forEach((o) => por('no_local_longo', o, {
        texto: `${GC.nomeEquipe ? GC.nomeEquipe(o.equipeId) : 'Equipe'} no local há ${tempo((agora - o.despachadaEm) / MIN)}`,
        venceEm: o.despachadaEm, naAba: true,
      }));

    itens.sort((a, b) => (crise ? (b.daCrise === true) - (a.daCrise === true) : 0) || ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
    const porTipo = {};
    itens.forEach((i) => { porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1; });
    return { itens, total: itens.length, porTipo };
  };
})(window.GC = window.GC || {});
