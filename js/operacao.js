(function (GC) {
  // Operação da pasta (spec: docs/specs/2026-11-12-vila-dourada-operacao-da-pasta-design.md).
  // O secretário despacha equipe, marca a chegada, resolve, devolve à pasta certa e junta duplicadas.
  // Cada gesto vira um evento num registro guardado (localStorage no navegador): cada aba aplica à própria
  // store os eventos que ainda não aplicou (ao abrir e quando outra aba grava). Só lógica, sem DOM.

  const TIPOS = ['despachar', 'chegar', 'resolver', 'devolver', 'juntar', 'delegar'];
  const MAX_EVENTOS = 300;
  GC.TIPOS_OPERACAO = TIPOS;
  // Gestos de prazo (js/prazos.js, fase 2): também viajam por este registro, com permissão própria (GC.podeNoPrazo).
  const TIPOS_PRAZO = ['pausar', 'retomar', 'prorrogar', 'decidir_prazo'];
  GC.TIPOS_PRAZO = TIPOS_PRAZO;
  // Gestos do gabinete que mudam a ocorrência (js/acoes-prefeito.js): também viajam por aqui, com permissão própria
  // (GC.podeNaAcaoPrefeito, chaves acompanhar.*).
  const TIPOS_GABINETE = ['definir_pasta', 'reabrir', 'falso_alarme'];
  GC.TIPOS_GABINETE = TIPOS_GABINETE;
  GC.SITUACAO_EQUIPE = { livre: 'Livre', deslocamento: 'A caminho', no_local: 'No local' };

  GC.criarOperacao = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.operacao' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ler = () => { const v = A.ler(chave); return Array.isArray(v) ? v : []; };
    const ouvintes = new Set();
    const emitir = (tipo, evento) => ouvintes.forEach((fn) => fn({ tipo, evento }));
    let seq = 0;

    return {
      // evento: { tipo, oid, area, quem, ...dados }. Devolve o evento gravado (com id e t).
      registrar(evento) {
        // "desfazer" não é um gesto (fora de GC.TIPOS_OPERACAO e das permissões): leva os retratos de antes (js/desfazer.js).
        const desfazer = evento.tipo === 'desfazer' && !!evento.retratos;
        if (!(TIPOS.includes(evento.tipo) || TIPOS_PRAZO.includes(evento.tipo) || TIPOS_GABINETE.includes(evento.tipo) || desfazer) || !evento.oid) return null;
        const t = agora();
        const e = Object.assign({}, evento, { id: `op-${t}-${++seq}-${Math.random().toString(36).slice(2, 6)}`, t });
        const lista = ler();
        lista.push(e);
        A.gravar(chave, lista.slice(-MAX_EVENTOS));
        emitir('novo', e);
        return e;
      },
      todos: () => ler().slice(),
      // Os que esta aba ainda não aplicou, em ordem.
      pendentes: (aplicados) => ler().filter((e) => !aplicados.has(e.id)),
      // Regra (tipo de ocorrência) → quantas devoluções. Mostra onde o encaminhamento automático erra.
      devolucoesPorTipo() {
        const n = {};
        ler().filter((e) => e.tipo === 'devolver' && e.tipoOcorrencia).forEach((e) => { n[e.tipoOcorrencia] = (n[e.tipoOcorrencia] || 0) + 1; });
        return n;
      },
      recarregar() { emitir('recarga', null); },
      // Um evento de outra aba acabou de ser aplicado aqui: quem avisa o usuário (simulacao.js) escuta isto.
      avisarRemoto(evento) { emitir('remoto', evento); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };

  // Aplica um evento do registro na store desta aba. Devolve false se não deu (ocorrência que esta aba
  // não tem, ou que já mudou): o evento fica no registro do mesmo jeito.
  GC.aplicarOperacao = function (store, e) {
    if (!e || !store.buscar(e.oid)) return false;
    if (e.tipo === 'despachar') return store.despachar(e.oid, e.equipeId, e.t);
    if (e.tipo === 'chegar') return store.chegar(e.oid, e.t);
    if (e.tipo === 'resolver') return store.resolver(e.oid, e.texto, { foto: e.foto || null, quem: e.quem, t: e.t });
    if (e.tipo === 'devolver') return store.devolver(e.oid, e.para, e.motivo, e.t);
    if (e.tipo === 'juntar') return store.juntar(e.oid, e.principal, e.t);
    if (e.tipo === 'delegar') return store.delegar(e.oid, e.usuarioId || null, e.t);
    if (e.tipo === 'pausar') return store.pausar(e.oid, { motivo: e.motivoPausa, texto: e.texto, quem: e.quem }, e.t);
    if (e.tipo === 'retomar') return store.retomar(e.oid, { quem: e.quem }, e.t);
    if (e.tipo === 'prorrogar') return !!store.prorrogar(e.oid, { minutos: e.minutos, motivo: e.motivo, quem: e.quem }, e.t);
    if (e.tipo === 'decidir_prazo') return store.decidirProrrogacao(e.oid, !!e.aprovar, { quem: e.quem }, e.t);
    if (e.tipo === 'definir_pasta') return store.definirPasta(e.oid, e.para, e.motivo, e.quem, e.t);
    if (e.tipo === 'reabrir') return store.reabrir(e.oid, e.motivo, e.texto, e.quem, e.t);
    if (e.tipo === 'falso_alarme') return store.falsoAlarme(e.oid, e.motivo, e.texto, e.quem, e.t);
    // Quem fez desfez: cada ocorrência que o gesto mudou volta ao retrato de antes.
    if (e.tipo === 'desfazer') return Object.entries(e.retratos || {}).map(([id, r]) => !!store.restaurar && store.restaurar(id, r)).some(Boolean);
    return false;
  };

  // Equipes da pasta com a situação de agora, a partir das ocorrências da store.
  // [{ id, nome, area, base, situacao: livre|deslocamento|no_local, ocorrencia, desde }]
  GC.situacaoEquipes = function (store, area) {
    const abertas = store.todas().filter((o) => o.status !== 'resolvida' && o.equipeId);
    return GC.equipesDaArea(area).map((e) => {
      const o = abertas.find((x) => x.equipeId === e.id) || null;
      const situacao = !o ? 'livre' : o.status === 'em_campo' ? 'no_local' : 'deslocamento';
      return Object.assign({}, e, { situacao, ocorrencia: o, desde: o ? o.despachadaEm || o.criadaEm : null });
    });
  };
  GC.equipeLivre = (store, area) => GC.situacaoEquipes(store, area).find((e) => e.situacao === 'livre') || null;

  // Candidatas para juntar uma duplicada: abertas da mesma pasta, mesmo tipo primeiro, depois mesmo bairro.
  GC.candidatasDuplicada = function (store, o) {
    const peso = (x) => (x.tipo === o.tipo ? 0 : 2) + (x.bairroId === o.bairroId ? 0 : 1);
    return store.todas()
      .filter((x) => x.id !== o.id && x.status !== 'resolvida' && x.area === o.area)
      .sort((a, b) => peso(a) - peso(b) || a.criadaEm - b.criadaEm)
      .slice(0, 8);
  };

  // Instância do navegador, por cidade.
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.operacao.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_OPERACAO = chave;
    GC.operacao = GC.criarOperacao({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  } else GC.operacao = GC.criarOperacao();
})(window.GC = window.GC || {});
