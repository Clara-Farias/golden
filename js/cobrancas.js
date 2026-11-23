(function (GC) {
  // Cobranças do prefeito com ciclo de vida (spec: docs/specs/2026-11-12-vila-dourada-cobrancas-design.md).
  // aberta → respondida (previsão, justificativa ou pedido de recurso) → encerrada (com evidência); o pedido de
  // novo prazo passa por novo_prazo até o prefeito aprovar (volta a respondida) ou recusar (volta a aberta).
  // "Vencida" é calculada: o limite (previsão ou prazo de resposta) passou sem a cobrança andar.
  // Só lógica, sem DOM. As cobranças ficam no armazenamento (localStorage no navegador), e toda mudança relê
  // antes de gravar: o prefeito numa aba e o secretário em outra mexem no mesmo registro.

  const MIN = 60000;
  // Prazo de resposta por gravidade: GC.PRAZO_RESPOSTA_MIN, em js/prazos.js.
  GC.MOTIVOS_JUSTIFICATIVA = {
    falta_equipe: 'Falta equipe',
    clima: 'Chuva ou clima',
    outra_pasta: 'Depende de outra secretaria',
    material: 'Falta material',
    outro: 'Outro motivo',
  };
  GC.PEDIDOS_RECURSO = { equipe: 'Equipe', veiculo: 'Veículo', material: 'Material', verba: 'Verba', outro: 'Outro' };
  GC.FOTO_MAX_BYTES = 300 * 1024;
  GC.ESTADOS_COBRANCA = { aberta: 'Sem resposta', respondida: 'Respondida', novo_prazo: 'Pediu novo prazo', encerrada: 'Resolvida' };

  const prazoResposta = (sev) => (GC.PRAZO_RESPOSTA_MIN[sev] || GC.PRAZO_RESPOSTA_MIN.media) * MIN;
  const texto = (t) => String(t == null ? '' : t).trim();
  const falha = (motivo) => ({ ok: false, motivo });
  // Tamanho aproximado de uma data URL em bytes (base64: 4 caracteres para 3 bytes).
  const bytesDaFoto = (foto) => Math.round((String(foto).split(',')[1] || '').length * 0.75);

  // O limite que está correndo: a previsão dada, senão o prazo de resposta.
  const limiteDe = (c) => (c.estado === 'respondida' && c.previsaoEm ? c.previsaoEm : c.prazoRespostaEm);
  const vencidaEm = (c, t) => !!c && (c.estado === 'aberta' || c.estado === 'respondida') && t > limiteDe(c);
  const ultimaDe = (c, tipo) => [...c.respostas].reverse().find((r) => !tipo || r.tipo === tipo) || null;
  // A resposta que diz em que pé está (sem as marcas do prefeito: ciente e recobrança).
  const ultimaDaSecretaria = (c) => [...c.respostas].reverse().find((r) => ['previsao', 'justificativa', 'recurso', 'novo_prazo', 'decisao', 'decisao_recurso'].includes(r.tipo)) || null;

  // Situação da cobrança em uma linha (cartões, gaveta, mapa). t: agora.
  GC.resumoCobranca = function (c, t = GC.agora ? GC.agora() : Date.now()) {
    const tt = (ms) => (GC.tempoTexto ? GC.tempoTexto(Math.max(1, Math.round(ms / MIN))) : `${Math.max(1, Math.round(ms / MIN))} min`);
    const vez = c.vezes > 1 ? ` ${c.vezes}×` : '';
    const venceu = vencidaEm(c, t);
    const r = ultimaDaSecretaria(c);
    if (c.estado === 'encerrada') {
      const ev = ultimaDe(c, 'evidencia') || {};
      return !ev.semEvidencia ? '✅ Resolvida com evidência' : ev.texto ? `📣 Encerrada · ${ev.texto}` : '✅ Resolvida';
    }
    if (c.estado === 'novo_prazo') return `📣 Pediu mais ${c.novoPrazoPedido.horas} h · aguarda o prefeito`;
    if (c.estado === 'aberta') {
      if (r && r.tipo === 'decisao_recurso') return venceu ? `📣 Recurso negado · sem resposta há ${tt(t - c.prazoRespostaEm)}` : `📣 Recurso negado · responder em ${tt(c.prazoRespostaEm - t)}`;
      if (r && r.tipo === 'decisao' && !r.aprovado) return venceu ? `📣 Prazo recusado · sem resposta há ${tt(t - c.prazoRespostaEm)}` : `📣 Prazo recusado · responder em ${tt(c.prazoRespostaEm - t)}`;
      return venceu ? `📣 Cobrada${vez} · sem resposta há ${tt(t - c.prazoRespostaEm)}` : `📣 Cobrada${vez} · resposta em até ${tt(c.prazoRespostaEm - t)}`;
    }
    if (r && (r.tipo === 'previsao' || (r.tipo === 'decisao' && r.aprovado))) {
      const nome = r.tipo === 'previsao' ? 'Previsão' : 'Novo prazo';
      return venceu ? `📣 ${nome} estourou há ${tt(t - c.previsaoEm)}` : `📣 ${nome}: ${r.tipo === 'previsao' ? 'chega em' : 'faltam'} ${tt(c.previsaoEm - t)}`;
    }
    if (r && r.tipo === 'decisao_recurso') return venceu ? `📣 Recurso aprovado · sem previsão há ${tt(t - c.prazoRespostaEm)}` : `📣 Recurso aprovado · previsão em até ${tt(c.prazoRespostaEm - t)}`;
    if (venceu) return `📣 Sem atualização há ${tt(t - c.prazoRespostaEm)}`;
    if (r && r.tipo === 'justificativa') return `📣 Justificou: ${GC.MOTIVOS_JUSTIFICATIVA[r.motivo]}`;
    if (r && r.tipo === 'recurso') return `📣 Pediu recurso: ${GC.PEDIDOS_RECURSO[r.pedido]}`;
    return '📣 Respondida';
  };

  GC.criarCobrancas = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.cobrancas' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ler = () => { const v = A.ler(chave); return Array.isArray(v) ? v : []; };
    let lista = ler();
    const ouvintes = new Set();
    const emitir = (tipo, c) => ouvintes.forEach((fn) => fn({ tipo, cobranca: c }));

    // Relê, aplica a mudança no registro e grava. fn devolve { ok, motivo } ou nada (ok).
    function mudar(id, fn, evento) {
      lista = ler();
      const c = lista.find((x) => x.id === id);
      if (!c) return falha('nao_encontrada');
      const r = fn(c) || { ok: true };
      if (!r.ok) return r;
      A.gravar(chave, lista);
      emitir(evento, c);
      return { ok: true, cobranca: c };
    }

    const limite = limiteDe;
    const vencida = (c, t = agora()) => vencidaEm(c, t);
    const ultima = ultimaDe;
    // Pedido de recurso que o prefeito ainda não viu (a resposta mais recente é o recurso).
    const recursoPendente = (c) => !!c && c.estado === 'respondida' && (ultima(c) || {}).tipo === 'recurso';
    const recusada = (c) => c.estado === 'aberta' && (ultima(c) || {}).tipo === 'decisao';

    const aberta = (oid) => ler().find((c) => c.ocorrenciaId === oid && c.estado !== 'encerrada') || null;

    return {
      vencida,
      limite,
      ultima,
      recursoPendente,
      todas: () => (lista = ler()).slice(),
      buscar: (id) => (lista = ler()).find((c) => c.id === id) || null,
      // A cobrança que vale para a ocorrência: a não encerrada, senão a última encerrada.
      daOcorrencia(oid) {
        lista = ler();
        const doId = lista.filter((c) => c.ocorrenciaId === oid);
        return doId.find((c) => c.estado !== 'encerrada') || doId[doId.length - 1] || null;
      },
      aberta,
      lista({ area, estado } = {}) {
        lista = ler();
        return lista.filter((c) => (!area || c.area === area) && (!estado || c.estado === estado));
      },

      cobrar(o, de = {}) {
        if (!o || o.status === 'resolvida') return falha('ocorrencia');
        if (aberta(o.id)) return falha('ja_cobrada');
        lista = ler();
        const t = agora();
        const c = {
          id: `cb-${o.id}-${t}`,
          ocorrenciaId: o.id,
          area: o.area,
          retrato: { titulo: o.titulo, bairroId: o.bairroId, severidade: o.severidade, prazoMin: o.prazoMin, criadaEm: o.criadaEm },
          de: { usuarioId: de.usuarioId || null, quem: de.quem || 'Prefeito(a)' },
          em: t,
          vezes: 1,
          prazoRespostaEm: t + prazoResposta(o.severidade),
          estado: 'aberta',
          previsaoEm: null,
          novoPrazoPedido: null,
          encerradaEm: null,
          respostas: [],
          simulada: false,
        };
        lista.push(c);
        A.gravar(chave, lista);
        emitir('nova', c);
        return { ok: true, cobranca: c };
      },

      // Só a vencida pode ser cobrada de novo: insistir antes não traz informação nova.
      recobrar(id, de = {}) {
        return mudar(id, (c) => {
          if (!vencida(c)) return falha('nao_vencida');
          const t = agora();
          c.vezes++;
          c.estado = 'aberta';
          c.previsaoEm = null;
          c.prazoRespostaEm = t + prazoResposta(c.retrato.severidade);
          c.respostas.push({ tipo: 'recobranca', quem: de.quem || 'Prefeito(a)', em: t });
          return null;
        }, 'recobrada');
      },

      // r: { tipo: 'previsao', minutos } | { tipo: 'justificativa', motivo, area?, texto? } | { tipo: 'recurso', pedido, texto }
      responder(id, r = {}, quem = 'Secretaria') {
        return mudar(id, (c) => {
          if (c.estado !== 'aberta' && c.estado !== 'respondida') return falha('estado');
          const t = agora();
          const base = { tipo: r.tipo, texto: texto(r.texto), quem, em: t, simulada: !!r.simulada };
          if (r.tipo === 'previsao') {
            const m = Math.round(Number(r.minutos));
            if (!(m > 0)) return falha('minutos');
            c.respostas.push(Object.assign(base, { minutos: m }));
            c.previsaoEm = t + m * MIN;
          } else if (r.tipo === 'justificativa') {
            if (!GC.MOTIVOS_JUSTIFICATIVA[r.motivo]) return falha('motivo');
            if (r.motivo === 'outra_pasta' && !r.area) return falha('area');
            if (r.motivo === 'outro' && !base.texto) return falha('texto');
            c.respostas.push(Object.assign(base, { motivo: r.motivo, area: r.area || null }));
            // Sem previsão, a secretaria deve uma atualização no mesmo prazo de resposta.
            c.previsaoEm = null;
            c.prazoRespostaEm = t + prazoResposta(c.retrato.severidade);
          } else if (r.tipo === 'recurso') {
            if (!GC.PEDIDOS_RECURSO[r.pedido]) return falha('pedido');
            if (!base.texto) return falha('texto');
            c.respostas.push(Object.assign(base, { pedido: r.pedido }));
            c.previsaoEm = null;
            c.prazoRespostaEm = t + prazoResposta(c.retrato.severidade);
          } else return falha('tipo');
          c.estado = 'respondida';
          if (r.simulada) c.simulada = true;
          return null;
        }, 'resposta');
      },

      pedirNovoPrazo(id, horas, motivo, quem = 'Secretaria', simulada = false) {
        return mudar(id, (c) => {
          if (c.estado !== 'aberta' && c.estado !== 'respondida') return falha('estado');
          const h = Number(horas);
          if (!(h > 0)) return falha('horas');
          if (!texto(motivo)) return falha('motivo');
          const t = agora();
          c.novoPrazoPedido = { horas: h, motivo: texto(motivo), em: t };
          c.respostas.push({ tipo: 'novo_prazo', horas: h, texto: texto(motivo), quem, em: t, simulada });
          c.estado = 'novo_prazo';
          return null;
        }, 'novo_prazo');
      },

      decidirPrazo(id, aprovado, motivo = '', quem = 'Prefeito(a)') {
        return mudar(id, (c) => {
          if (c.estado !== 'novo_prazo' || !c.novoPrazoPedido) return falha('estado');
          const t = agora();
          c.respostas.push({ tipo: 'decisao', aprovado: !!aprovado, horas: c.novoPrazoPedido.horas, texto: texto(motivo), quem, em: t });
          if (aprovado) {
            c.estado = 'respondida';
            c.previsaoEm = c.novoPrazoPedido.em + c.novoPrazoPedido.horas * 60 * MIN;
          } else c.estado = 'aberta'; // vale o prazo de resposta que já corria
          c.novoPrazoPedido = null;
          return null;
        }, 'decisao');
      },

      // O prefeito decide o pedido de recurso. Aprovado: a cobrança segue respondida e a secretaria deve a
      // previsão no prazo de resposta. Negado: volta a "sem resposta" (a secretaria responde de outro jeito).
      decidirRecurso(id, aprovado, motivo = '', quem = 'Prefeito(a)') {
        return mudar(id, (c) => {
          if (!recursoPendente(c)) return falha('estado');
          const t = agora();
          const pedido = (ultima(c, 'recurso') || {}).pedido || null;
          c.respostas.push({ tipo: 'decisao_recurso', aprovado: !!aprovado, pedido, texto: texto(motivo), quem, em: t });
          c.estado = aprovado ? 'respondida' : 'aberta';
          c.previsaoEm = null;
          c.prazoRespostaEm = t + prazoResposta(c.retrato.severidade);
          return null;
        }, 'decisao_recurso');
      },

      // Só registra que o prefeito viu o pedido de recurso (a tela usa decidirRecurso; fica por compatibilidade).
      ciente(id, quem = 'Prefeito(a)') {
        return mudar(id, (c) => {
          if (!recursoPendente(c)) return falha('estado');
          c.respostas.push({ tipo: 'ciente', quem, em: agora() });
          return null;
        }, 'ciente');
      },

      // evidencia: { texto (obrigatório), foto? (data URL), simulada? }
      encerrar(id, evidencia = {}, quem = 'Secretaria') {
        return mudar(id, (c) => {
          if (c.estado === 'encerrada') return falha('estado');
          if (!texto(evidencia.texto)) return falha('texto');
          if (evidencia.foto && bytesDaFoto(evidencia.foto) > GC.FOTO_MAX_BYTES) return falha('foto_grande');
          const t = agora();
          c.respostas.push({ tipo: 'evidencia', texto: texto(evidencia.texto), foto: evidencia.foto || null, quem, em: t, simulada: !!evidencia.simulada });
          c.estado = 'encerrada';
          c.encerradaEm = t;
          c.novoPrazoPedido = null;
          return null;
        }, 'encerrada');
      },

      // A ocorrência resolveu por outro caminho (ou foi devolvida, ou juntada): encerra sem evidência, e o
      // registro diz isso. nota: o porquê, quando não foi resolvida ("devolvida à Secretaria de Saúde").
      fecharDaOcorrencia(oid, nota = '') {
        const c = aberta(oid);
        if (!c) return falha('sem_cobranca');
        return mudar(c.id, (x) => {
          const t = agora();
          x.respostas.push({ tipo: 'evidencia', texto: texto(nota), semEvidencia: true, quem: 'Sistema', em: t });
          x.estado = 'encerrada';
          x.encerradaEm = t;
          x.novoPrazoPedido = null;
          return null;
        }, 'encerrada');
      },

      // Grupos da aba Cobranças para quem está vendo, e quantas esperam essa pessoa.
      // perfil: { id: 'prefeito' } ou { id: 'setor', area }.
      grupos(perfil = { id: 'prefeito' }, t = agora()) {
        lista = ler();
        const setor = GC.visaoDe(perfil) === 'pasta'; // a pasta responde; a cidade cobra
        const doPerfil = setor ? lista.filter((c) => c.area === perfil.area) : lista;
        const porLimite = (a, b) => limite(a) - limite(b);
        const encerradas = doPerfil.filter((c) => c.estado === 'encerrada' && t - c.encerradaEm < 24 * 60 * MIN)
          .sort((a, b) => b.encerradaEm - a.encerradaEm);
        let grupos;
        if (setor) {
          const responder = doPerfil.filter((c) => (c.estado === 'aberta' && !recusada(c)) || (c.estado === 'respondida' && vencida(c, t))).sort(porLimite);
          const recusadas = doPerfil.filter(recusada).sort(porLimite);
          const andamento = doPerfil.filter((c) => c.estado === 'novo_prazo' || (c.estado === 'respondida' && !vencida(c, t))).sort(porLimite);
          grupos = [
            { id: 'responder', titulo: 'Para responder', itens: responder, conta: true },
            { id: 'recusado', titulo: 'Prazo recusado', itens: recusadas, conta: true },
            { id: 'andamento', titulo: 'Em andamento', itens: andamento },
            { id: 'encerradas', titulo: 'Encerradas nas últimas 24 h', itens: encerradas },
          ];
        } else {
          const esperam = doPerfil.filter((c) => c.estado === 'novo_prazo' || recursoPendente(c)).sort((a, b) => a.em - b.em);
          const venceram = doPerfil.filter((c) => !esperam.includes(c) && vencida(c, t)).sort(porLimite);
          const andamento = doPerfil.filter((c) => (c.estado === 'aberta' || c.estado === 'respondida') && !esperam.includes(c) && !venceram.includes(c)).sort(porLimite);
          grupos = [
            { id: 'esperam', titulo: 'Esperam você', itens: esperam, conta: true },
            { id: 'venceram', titulo: 'Venceram', itens: venceram, conta: true },
            { id: 'andamento', titulo: 'Em andamento', itens: andamento },
            { id: 'encerradas', titulo: 'Encerradas nas últimas 24 h', itens: encerradas },
          ];
        }
        return { grupos, pendentes: grupos.filter((g) => g.conta).reduce((s, g) => s + g.itens.length, 0) };
      },

      // Outra aba gravou (evento storage): relê e avisa quem desenha.
      recarregar() { lista = ler(); emitir('recarga', null); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };

  // Instância do navegador, por cidade (a cobrança de uma cidade não aparece na outra).
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.cobrancas.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_COBRANCAS = chave;
    const cache = { bruto: undefined, valor: null };
    GC.cobrancas = GC.criarCobrancas({
      chave,
      armazenamento: {
        // Lido a cada desenho (acoesDisponiveis, situacao): só reinterpreta quando o texto guardado mudou.
        ler(k) {
          try {
            const bruto = window.localStorage.getItem(k);
            if (bruto !== cache.bruto) { cache.bruto = bruto; cache.valor = JSON.parse(bruto); }
            return cache.valor;
          } catch (e) { return null; }
        },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  } else GC.cobrancas = GC.criarCobrancas();
})(window.GC = window.GC || {});
