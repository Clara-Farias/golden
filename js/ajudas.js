(function (GC) {
  // Pedidos de ajuda entre secretarias (spec: docs/specs/2026-11-12-vila-dourada-ajuda-entre-pastas-design.md).
  // A pasta da ocorrência pede; a pasta pedida aceita (com previsão) ou recusa (com motivo). Recusado ou parado,
  // quem pediu leva ao prefeito, que determina a ajuda ou arquiva. Só lógica, sem DOM; guardado no armazenamento
  // (localStorage no navegador) e relido antes de cada mudança, como as cobranças (js/cobrancas.js).

  const MIN = 60000;
  // Prazos (sem resposta em 1 h = parado; determinada pelo prefeito = 2 h): GC.PRAZO_RESPOSTA_AJUDA_MIN e
  // GC.PREVISAO_DETERMINADA_MIN, em js/prazos.js.
  GC.PEDIDOS_AJUDA = {
    equipe: 'Equipe de apoio',
    equipamento: 'Equipamento ou veículo',
    autorizacao: 'Autorização ou informação',
    acao_conjunta: 'Ação conjunta no local',
  };
  GC.ESTADOS_AJUDA = { aberto: 'Aguardando resposta', aceito: 'Aceito', recusado: 'Recusado', concluido: 'Concluído', arquivado: 'Arquivado' };

  const texto = (t) => String(t == null ? '' : t).trim();
  const falha = (motivo) => ({ ok: false, motivo });
  const nomeSec = (area) => ((GC.data && GC.data.areas.find((a) => a.id === area)) || { secretaria: { nome: 'outra secretaria' } }).secretaria.nome;
  const fechado = (a) => a.estado === 'concluido' || a.estado === 'arquivado';

  // Parado: aberto sem resposta no prazo, ou aceito com a previsão estourada.
  const paradoEm = (a, t) => (a.estado === 'aberto' && t > a.prazoRespostaEm) || (a.estado === 'aceito' && !!a.previsaoEm && t > a.previsaoEm);

  // Situação do pedido em uma linha.
  GC.resumoAjuda = function (a, t = GC.agora ? GC.agora() : Date.now()) {
    const tt = (ms) => (GC.tempoTexto ? GC.tempoTexto(Math.max(1, Math.round(ms / MIN))) : `${Math.max(1, Math.round(ms / MIN))} min`);
    const para = nomeSec(a.para);
    const escalado = a.escalado && !a.decididoEm ? ' · levado ao prefeito' : '';
    if (a.estado === 'concluido') return `🤝 ${para} concluiu a ajuda`;
    if (a.estado === 'arquivado') return '🤝 Pedido arquivado pelo prefeito';
    if (a.estado === 'recusado') return `🤝 ${para} recusou${escalado}`;
    if (a.estado === 'aberto') return paradoEm(a, t) ? `🤝 ${para} sem resposta há ${tt(t - a.prazoRespostaEm)}${escalado}` : `🤝 Aguardando ${para} · resposta em até ${tt(a.prazoRespostaEm - t)}`;
    const quem = a.determinado ? `${para} (determinado pelo prefeito)` : para;
    return paradoEm(a, t) ? `🤝 ${quem}: previsão estourou há ${tt(t - a.previsaoEm)}${escalado}` : `🤝 ${quem} chega em ${tt(a.previsaoEm - t)}`;
  };

  GC.criarAjudas = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.ajudas' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ler = () => { const v = A.ler(chave); return Array.isArray(v) ? v : []; };
    let lista = ler();
    const ouvintes = new Set();
    const emitir = (tipo, a) => ouvintes.forEach((fn) => fn({ tipo, ajuda: a }));
    const parado = (a, t = agora()) => !!a && paradoEm(a, t);

    function mudar(id, fn, evento) {
      lista = ler();
      const a = lista.find((x) => x.id === id);
      if (!a) return falha('nao_encontrado');
      const r = fn(a) || { ok: true };
      if (!r.ok) return r;
      A.gravar(chave, lista);
      emitir(evento, a);
      return { ok: true, ajuda: a };
    }
    const passo = (a, tipo, extra) => a.respostas.push(Object.assign({ tipo, em: agora() }, extra));

    return {
      parado,
      todas: () => (lista = ler()).slice(),
      buscar: (id) => (lista = ler()).find((a) => a.id === id) || null,
      daOcorrencia: (oid) => (lista = ler()).filter((a) => a.ocorrenciaId === oid),

      // pedido: { para, tipo, texto }. Um pedido em andamento por ocorrência e pasta pedida.
      pedir(o, pedido = {}, quem = 'Secretaria') {
        if (!o || o.status === 'resolvida') return falha('ocorrencia');
        if (!pedido.para || !GC.data.areas.some((x) => x.id === pedido.para)) return falha('para');
        if (pedido.para === o.area) return falha('mesma_pasta');
        if (!GC.PEDIDOS_AJUDA[pedido.tipo]) return falha('tipo');
        if (!texto(pedido.texto)) return falha('texto');
        lista = ler();
        if (lista.some((a) => a.ocorrenciaId === o.id && a.para === pedido.para && !fechado(a) && a.estado !== 'recusado')) return falha('ja_pedido');
        const t = agora();
        const a = {
          id: `aj-${o.id}-${pedido.para}-${t}-${lista.filter((x) => x.ocorrenciaId === o.id).length + 1}`,
          ocorrenciaId: o.id,
          retrato: { titulo: o.titulo, bairroId: o.bairroId, severidade: o.severidade },
          de: o.area,
          para: pedido.para,
          tipo: pedido.tipo,
          texto: texto(pedido.texto),
          quem,
          em: t,
          prazoRespostaEm: t + GC.PRAZO_RESPOSTA_AJUDA_MIN * MIN,
          estado: 'aberto',
          previsaoEm: null,
          escalado: false,
          decididoEm: null,
          determinado: false,
          respostas: [],
        };
        lista.push(a);
        A.gravar(chave, lista);
        emitir('novo', a);
        return { ok: true, ajuda: a };
      },

      aceitar(id, minutos, obs = '', quem = 'Secretaria', simulada = false) {
        return mudar(id, (a) => {
          if (a.estado !== 'aberto') return falha('estado');
          const m = Math.round(Number(minutos));
          if (!(m > 0)) return falha('minutos');
          a.estado = 'aceito';
          a.previsaoEm = agora() + m * MIN;
          passo(a, 'aceito', { minutos: m, texto: texto(obs), quem, simulada });
          return null;
        }, 'aceito');
      },

      recusar(id, motivo, quem = 'Secretaria', simulada = false) {
        return mudar(id, (a) => {
          if (a.estado !== 'aberto') return falha('estado');
          if (!texto(motivo)) return falha('motivo');
          a.estado = 'recusado';
          passo(a, 'recusado', { texto: texto(motivo), quem, simulada });
          return null;
        }, 'recusado');
      },

      concluir(id, obs = '', quem = 'Secretaria', simulada = false) {
        return mudar(id, (a) => {
          if (a.estado !== 'aceito') return falha('estado');
          a.estado = 'concluido';
          passo(a, 'concluido', { texto: texto(obs), quem, simulada });
          return null;
        }, 'concluido');
      },

      // Quem pediu leva ao prefeito o pedido recusado ou parado.
      escalar(id, obs = '', quem = 'Secretaria') {
        return mudar(id, (a) => {
          if (a.escalado && !a.decididoEm) return falha('ja_escalado');
          if (a.estado !== 'recusado' && !paradoEm(a, agora())) return falha('nao_parado');
          a.escalado = true;
          a.decididoEm = null;
          passo(a, 'escalado', { texto: texto(obs), quem });
          return null;
        }, 'escalado');
      },

      // O prefeito determina a ajuda: a pasta pedida tem 2 h.
      determinar(id, obs = '', quem = 'Prefeito(a)') {
        return mudar(id, (a) => {
          if (!a.escalado || a.decididoEm || fechado(a)) return falha('estado');
          const t = agora();
          a.estado = 'aceito';
          a.determinado = true;
          a.decididoEm = t;
          a.previsaoEm = t + GC.PREVISAO_DETERMINADA_MIN * MIN;
          passo(a, 'determinado', { texto: texto(obs), quem });
          return null;
        }, 'determinado');
      },

      arquivar(id, obs = '', quem = 'Prefeito(a)') {
        return mudar(id, (a) => {
          if (!a.escalado || a.decididoEm || fechado(a)) return falha('estado');
          a.estado = 'arquivado';
          a.decididoEm = agora();
          passo(a, 'arquivado', { texto: texto(obs), quem });
          return null;
        }, 'arquivado');
      },

      // Grupos da seção "Pedidos entre secretarias" para quem está vendo, e quantos esperam essa pessoa.
      grupos(perfil = { id: 'prefeito' }, t = agora()) {
        lista = ler();
        const ativos = lista.filter((a) => !fechado(a));
        const recentes = lista.filter((a) => fechado(a) && t - (a.respostas.length ? a.respostas[a.respostas.length - 1].em : a.em) < 24 * 60 * MIN);
        let grupos;
        if (GC.visaoDe(perfil) === 'pasta') {
          const x = perfil.area;
          const levar = ativos.filter((a) => a.de === x && !a.escalado && (a.estado === 'recusado' || paradoEm(a, t)));
          // Para a pasta pedida: o aberto, para responder, e o que o prefeito determinou, para cumprir.
          const recebidos = ativos.filter((a) => a.para === x && (a.estado === 'aberto' || (a.determinado && a.estado === 'aceito')));
          grupos = [
            { id: 'recebidos', titulo: 'Pedidos para a sua pasta', itens: recebidos, conta: true },
            { id: 'levar', titulo: 'Seus pedidos parados ou recusados', itens: levar, conta: true },
            { id: 'andamento', titulo: 'Pedidos em andamento', itens: ativos.filter((a) => (a.de === x || a.para === x) && !levar.includes(a) && !recebidos.includes(a)) },
            { id: 'fechados', titulo: 'Fechados nas últimas 24 h', itens: recentes.filter((a) => a.de === x || a.para === x) },
          ];
        } else {
          grupos = [
            { id: 'escalados', titulo: 'Pedidos levados a você', itens: ativos.filter((a) => a.escalado && !a.decididoEm), conta: true },
            { id: 'andamento', titulo: 'Pedidos entre secretarias', itens: ativos.filter((a) => !(a.escalado && !a.decididoEm)) },
          ];
        }
        return { grupos, pendentes: grupos.filter((g) => g.conta).reduce((s, g) => s + g.itens.length, 0) };
      },

      recarregar() { lista = ler(); emitir('recarga', null); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.ajudas.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_AJUDAS = chave;
    GC.ajudas = GC.criarAjudas({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  } else GC.ajudas = GC.criarAjudas();
})(window.GC = window.GC || {});
