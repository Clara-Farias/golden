(function (GC) {
  // Tarefas: o que alguém passa para uma secretaria fazer, ligado a uma temporada do calendário sazonal, a um alerta
  // (ocorrência), a um gabinete de crise ou a nada (avulsa). Só lógica, sem DOM; guardado em localStorage
  // (gc.tarefas.<cidade>) e relido antes de cada mudança, no molde dos pedidos de ajuda (js/ajudas.js).
  //
  // O gabinete de crise continua com a lista dele (js/crise.js): passar tarefa num gabinete usa
  // gabinetes.adicionarTarefa, e GC.tarefasUnificadas junta as duas listas para a tela #/tarefas e a caixa.
  // Quem passa e quem faz: GC.podeNaTarefa (js/perfil.js), chaves tarefa.* em js/permissoes.js.
  //
  // tarefa: { id, texto, area, responsavelId (null = a secretaria), prazoEm, contexto: { tipo, id, nome },
  //   status: 'a_fazer' | 'fazendo' | 'feita' | 'cancelada', criadaEm, criadaPor: { id, nome, area },
  //   feitaEm, evidencia, cobradaEm, respostaPendente, cobrancas, historico: [{ t, texto, quem, tipo? }],
  //   ultimaAtualizacaoEm, atualizacaoPedidaEm, duvida: { texto, t, quem } | null, esclarecidaEm }
  // Portal do servidor (spec 2026-11-17): quem faz dá notícia (atualizar), tira dúvida (duvidar) com quem passou, que
  // responde (esclarecer); quem acompanha pede notícia sem cobrar (pedirAtualizacao). Nenhum deles muda status ou prazo.

  const MIN = 60000;
  GC.CONTEXTOS_TAREFA = {
    temporada: { nome: 'Temporada', icone: 'calendar-month' },
    alerta: { nome: 'Alerta', icone: 'alert-triangle' },
    gabinete: { nome: 'Gabinete de crise', icone: 'building-community' },
    avulsa: { nome: 'Avulsa', icone: 'clipboard-list' },
  };
  GC.STATUS_TAREFA = { a_fazer: 'A fazer', fazendo: 'Em andamento', feita: 'Feita', cancelada: 'Cancelada' };
  // Prazos prontos do formulário (minutos a partir de agora). "Até uma data" fica no próprio formulário.
  GC.PRAZOS_TAREFA = [
    [120, 'Em 2 horas'], [240, 'Em 4 horas'], [480, 'Em 8 horas'], [1440, 'Em 1 dia'], [3 * 1440, 'Em 3 dias'],
    [7 * 1440, 'Em 1 semana'], [14 * 1440, 'Em 2 semanas'], [30 * 1440, 'Em 1 mês'],
  ];
  GC.LIMITES_TAREFA = { texto: 160, resposta: 300, prazoMinMin: 30, prazoMaxDias: 400 };
  GC.ERROS_TAREFA = {
    texto: 'Diga o que precisa ser feito.',
    area: 'Escolha a secretaria.',
    responsavel: 'Essa pessoa não é da secretaria escolhida.',
    prazo: 'O prazo vai de 30 minutos a pouco mais de um ano.',
    contexto: 'Escolha a que a demanda está ligada.',
    estado: 'Essa demanda já mudou. Atualize a tela.',
    evidencia: 'Conte o que foi feito.',
    resposta: 'Escreva a resposta à cobrança.',
    atualizacao: 'Conte como está a demanda.',
    duvida: 'Escreva a sua dúvida.',
    esclarecimento: 'Escreva a resposta à dúvida.',
    duvida_aberta: 'Já há uma dúvida esperando resposta.',
    ja_pedida: 'A notícia já foi pedida. Espere a resposta.',
    motivo: 'Diga o motivo.',
    permissao: 'Você não pode fazer isso nesta demanda.',
    nao_encontrada: 'Essa demanda não existe mais.',
    gabinete: 'Esse gabinete não está mais aberto.',
  };

  const limpo = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);
  const falha = (motivo) => ({ ok: false, motivo });
  const aberta = (t) => t.status === 'a_fazer' || t.status === 'fazendo';
  GC.tarefaAberta = aberta;
  GC.tarefaAtrasada = (t, agora = GC.agora ? GC.agora() : Date.now()) => aberta(t) && agora > t.prazoEm;

  // "vence em 2 dias", "atrasada há 3 h", "feita há 1 dia".
  GC.prazoTarefaTexto = function (t, agora = GC.agora ? GC.agora() : Date.now()) {
    const tt = (ms) => (GC.tempoTexto ? GC.tempoTexto(Math.max(1, Math.round(ms / MIN))) : `${Math.max(1, Math.round(ms / MIN))} min`);
    if (t.status === 'feita') return `feita há ${tt(agora - (t.feitaEm || agora))}`;
    if (t.status === 'cancelada') return 'cancelada';
    return agora > t.prazoEm ? `atrasada há ${tt(agora - t.prazoEm)}` : `vence em ${tt(t.prazoEm - agora)}`;
  };

  GC.criarTarefas = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.tarefas' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { if (v == null) delete memoria[k]; else memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ler = () => { const v = A.ler(chave); return v && Array.isArray(v.lista) ? v : { seq: 0, lista: [] }; };
    let estado = ler();
    const ouvintes = new Set();
    const emitir = (tipo, t) => ouvintes.forEach((fn) => fn({ tipo, tarefa: t }));
    const gravar = () => A.gravar(chave, estado);
    const nota = (t, texto, quem, tipo) => { t.historico.push(Object.assign({ t: agora(), texto, quem: quem || '' }, tipo ? { tipo } : {})); };

    // Confere os campos de uma tarefa nova. d: { texto, area, responsavelId, prazoEm, contexto: { tipo, id, nome } }.
    function validar(d) {
      const L = GC.LIMITES_TAREFA;
      const texto = limpo(d.texto, L.texto);
      if (!texto) return falha('texto');
      if (!((GC.data && GC.data.areas) || []).some((a) => a.id === d.area)) return falha('area');
      const responsavelId = d.responsavelId || null;
      const podemReceber = GC.responsaveisDemanda || GC.responsaveisPlano;
      if (responsavelId && !(podemReceber ? podemReceber(d.area) : []).some((u) => u.id === responsavelId)) return falha('responsavel');
      const prazoEm = Math.round(Number(d.prazoEm));
      const t = agora();
      if (!(prazoEm >= t + L.prazoMinMin * MIN - MIN && prazoEm <= t + L.prazoMaxDias * 1440 * MIN)) return falha('prazo');
      const c = d.contexto || { tipo: 'avulsa' };
      if (!GC.CONTEXTOS_TAREFA[c.tipo] || c.tipo === 'gabinete' || (c.tipo !== 'avulsa' && !c.id)) return falha('contexto');
      const dados = { texto, area: d.area, responsavelId, prazoEm, contexto: c.tipo === 'avulsa' ? { tipo: 'avulsa', id: null, nome: '' } : { tipo: c.tipo, id: String(c.id), nome: limpo(c.nome, 120) } };
      // Opcionais: onde é (endereço e bairro) e o que fazer em mais palavras. O portal do servidor mostra os dois.
      const lugar = d.local || {};
      const local = { texto: limpo(lugar.texto, 160), bairroId: ((GC.data && GC.data.bairros) || []).some((b) => b.id === lugar.bairroId) ? lugar.bairroId : null };
      if (local.texto || local.bairroId) dados.local = local;
      const detalhe = limpo(d.detalhe, 600);
      if (detalhe) dados.detalhe = detalhe;
      return { ok: true, dados };
    }

    function passar(d, quem = {}) {
      estado = ler();
      const v = validar(d || {});
      if (!v.ok) return v;
      const t = Object.assign({ id: `tf-${++estado.seq}` }, v.dados, {
        status: 'a_fazer', criadaEm: agora(), criadaPor: { id: quem.id || null, nome: quem.nome || '', area: quem.area || null },
        feitaEm: null, evidencia: '', cobradaEm: null, respostaPendente: false, cobrancas: 0, historico: [],
      });
      nota(t, 'Demanda passada', quem.nome);
      estado.lista.push(t);
      gravar();
      emitir('passar', t);
      return { ok: true, tarefa: t };
    }

    function mudar(id, fn, evento) {
      estado = ler();
      const t = estado.lista.find((x) => x.id === id);
      if (!t) return falha('nao_encontrada');
      const r = fn(t) || { ok: true };
      if (!r.ok) return r;
      gravar();
      emitir(evento, t);
      return { ok: true, tarefa: t };
    }

    const iniciar = (id, quem = {}) => mudar(id, (t) => {
      if (t.status !== 'a_fazer') return falha('estado');
      t.status = 'fazendo';
      nota(t, 'Começou', quem.nome);
      return null;
    }, 'iniciar');

    const concluir = (id, evidencia, quem = {}) => mudar(id, (t) => {
      if (!aberta(t)) return falha('estado');
      const e = limpo(evidencia, GC.LIMITES_TAREFA.resposta);
      if (!e) return falha('evidencia');
      Object.assign(t, { status: 'feita', feitaEm: agora(), evidencia: e, respostaPendente: false, atualizacaoPedidaEm: null });
      nota(t, `Feita: ${e}`, quem.nome);
      return null;
    }, 'concluir');

    const cancelar = (id, motivo, quem = {}) => mudar(id, (t) => {
      if (!aberta(t)) return falha('estado');
      const m = limpo(motivo, GC.LIMITES_TAREFA.resposta);
      if (!m) return falha('motivo');
      Object.assign(t, { status: 'cancelada', respostaPendente: false });
      nota(t, `Cancelada: ${m}`, quem.nome);
      return null;
    }, 'cancelar');

    // A cobrança espera a resposta de quem faz (nada responde sozinho).
    const cobrar = (id, quem = {}) => mudar(id, (t) => {
      if (!aberta(t) || t.respostaPendente) return falha('estado');
      Object.assign(t, { cobradaEm: agora(), respostaPendente: true, cobrancas: (t.cobrancas || 0) + 1 });
      nota(t, 'Cobrou', quem.nome);
      return null;
    }, 'cobrar');

    const responder = (id, texto, quem = {}) => mudar(id, (t) => {
      if (!t.respostaPendente) return falha('estado');
      const r = limpo(texto, GC.LIMITES_TAREFA.resposta);
      if (!r) return falha('resposta');
      t.respostaPendente = false;
      nota(t, `Respondeu à cobrança: ${r}`, quem.nome);
      return null;
    }, 'responder');

    const remarcar = (id, prazoEm, motivo, quem = {}) => mudar(id, (t) => {
      if (!aberta(t)) return falha('estado');
      const p = Math.round(Number(prazoEm));
      if (!(p > agora())) return falha('prazo');
      const m = limpo(motivo, GC.LIMITES_TAREFA.resposta);
      if (!m) return falha('motivo');
      const de = t.prazoEm;
      t.prazoEm = p;
      nota(t, `Prazo mudou (${new Date(de).toLocaleDateString('pt-BR')} → ${new Date(p).toLocaleDateString('pt-BR')}): ${m}`, quem.nome);
      return null;
    }, 'remarcar');

    // Notícia do andamento: não muda status nem prazo; atende o pedido de notícia, se havia um.
    const atualizar = (id, texto, quem = {}) => mudar(id, (t) => {
      if (!aberta(t)) return falha('estado');
      const a = limpo(texto, GC.LIMITES_TAREFA.resposta);
      if (!a) return falha('atualizacao');
      Object.assign(t, { ultimaAtualizacaoEm: agora(), atualizacaoPedidaEm: null });
      nota(t, a, quem.nome, 'atualizacao');
      return null;
    }, 'atualizar');

    // Quem faz pergunta a quem passou (uma dúvida por vez). Não pausa o prazo.
    const duvidar = (id, texto, quem = {}) => mudar(id, (t) => {
      if (!aberta(t)) return falha('estado');
      if (t.duvida) return falha('duvida_aberta');
      const d = limpo(texto, GC.LIMITES_TAREFA.resposta);
      if (!d) return falha('duvida');
      t.duvida = { texto: d, t: agora(), quem: quem.nome || '' };
      nota(t, `Dúvida: ${d}`, quem.nome, 'duvida');
      return null;
    }, 'duvidar');

    const esclarecer = (id, texto, quem = {}) => mudar(id, (t) => {
      if (!t.duvida) return falha('estado');
      const r = limpo(texto, GC.LIMITES_TAREFA.resposta);
      if (!r) return falha('esclarecimento');
      Object.assign(t, { duvida: null, esclarecidaEm: agora() });
      nota(t, `Resposta à dúvida: ${r}`, quem.nome, 'esclarecimento');
      return null;
    }, 'esclarecer');

    // Pedir notícia sem cobrar: fica pendente até quem faz atualizar (ou concluir).
    const pedirAtualizacao = (id, quem = {}) => mudar(id, (t) => {
      if (!aberta(t)) return falha('estado');
      if (t.atualizacaoPedidaEm) return falha('ja_pedida');
      t.atualizacaoPedidaEm = agora();
      nota(t, 'Pediu notícia do andamento', quem.nome, 'pedido');
      return null;
    }, 'pedir_atualizacao');

    const lista = () => estado.lista.slice();
    const buscar = (id) => estado.lista.find((t) => t.id === id) || null;
    const doContexto = (tipo, id) => estado.lista.filter((t) => t.contexto.tipo === tipo && t.contexto.id === String(id));

    return {
      passar, iniciar, concluir, cancelar, cobrar, responder, remarcar, atualizar, duvidar, esclarecer, pedirAtualizacao, validar, lista, buscar, doContexto,
      recarregar() { estado = ler(); emitir('recarga', null); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };

  // As tarefas do registro e as dos gabinetes numa lista só, no mesmo formato. As do gabinete trazem
  // origem 'gabinete' e são feitas na sala (a tela leva até ela). gabinetes: o registro de js/crise.js (ou null).
  const STATUS_GABINETE = { a_fazer: 'a_fazer', em_andamento: 'fazendo', concluida: 'feita', cancelada: 'cancelada' };
  GC.tarefasUnificadas = function ({ tarefas = GC.tarefas, gabinetes = null } = {}) {
    const doRegistro = tarefas ? tarefas.lista().map((t) => Object.assign({ origem: 'registro' }, t)) : [];
    const lista = gabinetes && gabinetes.todos ? gabinetes.todos() : [];
    const doGabinete = lista.flatMap((g) => (g.tarefas || []).map((t) => ({
      origem: 'gabinete', id: `${g.id}:${t.id}`, gabineteId: g.id, tarefaGabineteId: t.id,
      texto: t.texto, area: t.area, responsavelId: t.responsavelId || null, // passada a um servidor da sala
      prazoEm: (t.criadaEm || g.abertoEm || 0) + (t.prazoMin || 0) * MIN,
      contexto: { tipo: 'gabinete', id: g.id, nome: g.titulo },
      // Gabinete encerrado: o que ficou aberto não cobra mais ninguém.
      status: g.encerradoEm && !['concluida', 'cancelada'].includes(t.status) ? 'cancelada' : (STATUS_GABINETE[t.status] || 'a_fazer'),
      criadaEm: t.criadaEm, criadaPor: { id: null, nome: 'Gabinete de crise', area: null },
      feitaEm: t.concluidaEm || null, evidencia: '', cobradaEm: t.cobradaEm || null, respostaPendente: !!t.respostaPendente,
      cobrancas: t.cobrancas || 0, historico: [],
    })));
    return [...doRegistro, ...doGabinete];
  };

  // Instância do navegador, por cidade. Sem localStorage (testes), só memória.
  const local = (() => { try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch (e) { return null; } })();
  GC.CHAVE_TAREFAS = `gc.tarefas.${GC.cidade ? GC.cidade.id : 'media'}`;
  GC.tarefas = GC.criarTarefas(local ? {
    chave: GC.CHAVE_TAREFAS,
    armazenamento: {
      ler(k) { try { return JSON.parse(local.getItem(k)); } catch (e) { return null; } },
      gravar(k, v) { try { if (v == null) local.removeItem(k); else local.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
    },
  } : { chave: GC.CHAVE_TAREFAS });
})(window.GC = window.GC || {});
