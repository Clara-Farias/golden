(function (GC) {
  // Registro da agenda de entregas (fase 3 da spec docs/specs/2026-11-12-vila-dourada-agenda-de-entregas-design.md):
  // - a secretaria confirma a data ou remarca com motivo (a remarcação vira histórico);
  // - o prefeito marca (ou desmarca) a inauguração, com dia, hora e local.
  // Só lógica, sem DOM. Mesmo molde das cobranças: guardado no armazenamento (localStorage no navegador,
  // gc.entregas.<cidade>) e relido antes de cada mudança; as abas se falam pelo evento `storage`.
  // Uma data só: a remarcação muda a previsão atual da própria obra (GC.data.obras) ou da entrega escrita
  // (GC.data.entregas.escritas). Obras, entregas, Maia e relatórios leem a mesma data, e a situação é recalculada.
  // Quem pode o quê fica fora daqui (js/app/telas.js confere GC.pode e audita).

  GC.MOTIVOS_REMARCAR = {
    chuva: 'Chuva ou clima',
    fornecedor: 'Fornecedor ou material',
    licenca: 'Licença ou autorização',
    orcamento: 'Orçamento ou pagamento',
    projeto: 'Mudança no projeto',
    outro: 'Outro motivo',
  };
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const texto = (t) => String(t == null ? '' : t).trim().slice(0, 300);
  const falha = (motivo) => ({ ok: false, motivo });

  GC.criarRegistroEntregas = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), hoje = () => GC.relogio.hoje, chave = 'gc.entregas' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ler = () => { const v = A.ler(chave); return Array.isArray(v) ? v : []; };
    const ouvintes = new Set();
    const emitir = (tipo, ev) => ouvintes.forEach((fn) => fn({ tipo, evento: ev }));
    let seq = 0;

    // ---- a data na base: obra (previsaoAtual) ou entrega escrita (dataAtual) ----
    // A primeira aplicação guarda a data de origem, para que desfazer/recarregar volte a ela.
    function alvoDa(entregaId) {
      if (String(entregaId).startsWith('obra:')) {
        const ob = ((GC.data.obras || {}).obras || []).find((x) => x.id === entregaId.slice(5));
        return ob ? { obj: ob, campo: 'previsaoAtual' } : null;
      }
      const e = ((GC.data.entregas || {}).escritas || []).find((x) => x.id === entregaId);
      return e ? { obj: e, campo: 'dataAtual' } : null;
    }
    function aplicar() {
      const ultima = {};
      ler().filter((ev) => ev.tipo === 'remarcar').forEach((ev) => { ultima[ev.entregaId] = ev.data; });
      const tocar = (alvo, data) => {
        if (!('_dataBase' in alvo.obj)) Object.defineProperty(alvo.obj, '_dataBase', { value: alvo.obj[alvo.campo] || null, enumerable: false, writable: true });
        if (data) alvo.obj[alvo.campo] = data;
        else if (alvo.obj._dataBase) alvo.obj[alvo.campo] = alvo.obj._dataBase;
        else delete alvo.obj[alvo.campo];
      };
      ((GC.data.obras || {}).obras || []).forEach((ob) => tocar({ obj: ob, campo: 'previsaoAtual' }, ultima[`obra:${ob.id}`]));
      ((GC.data.entregas || {}).escritas || []).forEach((e) => tocar({ obj: e, campo: 'dataAtual' }, ultima[e.id]));
    }

    function registrar(ev) {
      const lista = ler();
      const novo = Object.assign({ id: `en-${agora().toString(36)}-${(seq++).toString(36)}`, em: agora() }, ev);
      lista.push(novo);
      A.gravar(chave, lista);
      aplicar();
      emitir(ev.tipo, novo);
      return { ok: true, evento: novo };
    }

    // A entrega como a agenda a vê agora (sem o registro, para não depender da ordem de carga).
    const entregaDe = (id) => (GC.entregas ? GC.entregas.lista().find((e) => e.id === id) : null);

    const api = {
      eventos: (entregaId = null) => ler().filter((ev) => !entregaId || ev.entregaId === entregaId),
      aplicar,
      // O que o registro diz da entrega: data confirmada, remarcações (da mais antiga à mais nova) e inauguração.
      estado(entregaId, dataAtual = null) {
        const evs = ler().filter((ev) => ev.entregaId === entregaId);
        const conf = evs.filter((ev) => ev.tipo === 'confirmar').pop() || null;
        const inaug = evs.filter((ev) => ev.tipo === 'inaugurar' || ev.tipo === 'desmarcar').pop() || null;
        return {
          confirmada: !!(conf && (!dataAtual || conf.data === dataAtual)),
          confirmacao: conf,
          remarcacoes: evs.filter((ev) => ev.tipo === 'remarcar'),
          inauguracao: inaug && inaug.tipo === 'inaugurar' ? inaug : null,
          historico: evs.slice(),
        };
      },
      // Inaugurações marcadas daqui para a frente (a agenda do gabinete as mostra).
      inauguracoes() {
        const ultima = {};
        ler().filter((ev) => ev.tipo === 'inaugurar' || ev.tipo === 'desmarcar').forEach((ev) => { ultima[ev.entregaId] = ev; });
        return Object.values(ultima).filter((ev) => ev.tipo === 'inaugurar' && ev.dia >= hoje()).sort((a, b) => `${a.dia}T${a.hora}`.localeCompare(`${b.dia}T${b.hora}`));
      },
      confirmar(entregaId, { quem = null, quemNome = '' } = {}) {
        const e = entregaDe(entregaId);
        if (!e) return falha('nao_encontrada');
        if (e.situacao === 'entregue') return falha('entregue');
        return registrar({ tipo: 'confirmar', entregaId, data: e.dataAtual, quem, quemNome });
      },
      remarcar(entregaId, { data, motivo, texto: obs = '', quem = null, quemNome = '' } = {}) {
        const e = entregaDe(entregaId);
        if (!e) return falha('nao_encontrada');
        if (e.situacao === 'entregue') return falha('entregue');
        if (!alvoDa(entregaId)) return falha('sem_data');
        if (!ISO.test(data || '') || data < hoje()) return falha('data');
        if (data === e.dataAtual) return falha('mesma_data');
        if (!GC.MOTIVOS_REMARCAR[motivo]) return falha('motivo');
        if (motivo === 'outro' && !texto(obs)) return falha('texto');
        return registrar({ tipo: 'remarcar', entregaId, de: e.dataAtual, data, motivo, texto: texto(obs), quem, quemNome });
      },
      inaugurar(entregaId, { dia, hora, local = '', quem = null, quemNome = '' } = {}) {
        if (!entregaDe(entregaId)) return falha('nao_encontrada');
        if (!ISO.test(dia || '') || dia < hoje()) return falha('data');
        if (!HORA.test(hora || '')) return falha('hora');
        if (!texto(local)) return falha('local');
        return registrar({ tipo: 'inaugurar', entregaId, dia, hora, local: texto(local), quem, quemNome });
      },
      desmarcar(entregaId, { quem = null, quemNome = '' } = {}) {
        if (!api.estado(entregaId).inauguracao) return falha('sem_inauguracao');
        return registrar({ tipo: 'desmarcar', entregaId, quem, quemNome });
      },
      ouvir(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
      // Outra aba mudou o registro: reaplica as datas e avisa quem desenha.
      recarregar() { aplicar(); emitir('externo', null); },
    };
    return api;
  };

  // Instância do navegador, por cidade; nos testes (sem localStorage), em memória.
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.entregas.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_ENTREGAS = chave;
    GC.registroEntregas = GC.criarRegistroEntregas({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
    if (window.addEventListener) window.addEventListener('storage', (e) => { if (e.key === chave) GC.registroEntregas.recarregar(); });
  } else GC.registroEntregas = GC.criarRegistroEntregas();
  GC.registroEntregas.aplicar();
})(window.GC = window.GC || {});
