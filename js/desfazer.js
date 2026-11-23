(function (GC) {
  // Desfazer e confirmar (spec: docs/specs/2026-11-12-vila-dourada-desfazer-e-confirmar-design.md). Só lógica, sem DOM.
  //
  // Desfazer: antes de cada ação, o app fotografa os registros guardados (cobranças, pedidos de ajuda, decisões do
  // prefeito, gabinetes, metas, regras, pedidos do cidadão) e as ocorrências que ela toca. Depois, guarda o retrato
  // de como ficou. Desfazer volta ao "antes" só o que a ação mudou, e só se ninguém mexeu depois (a secretaria já
  // respondeu, o cidadão relatou de novo): aí recusa, em vez de apagar o que outra pessoa fez. A pilha é desta aba,
  // vale por GC.JANELA_DESFAZER_MS e desfaz da mais recente para a mais antiga.
  //
  // Confirmar: as ações de efeito grande (convocar gabinete, resolver, devolver, juntar, determinar ajuda) pedem
  // confirmação antes. O texto da janela sai de GC.confirmacaoDe; a janela é de js/desfazer-ui.js.

  GC.JANELA_DESFAZER_MS = 5 * 60000;
  const MAX_PILHA = 10;
  const json = (v) => (v === undefined ? undefined : JSON.stringify(v));
  const copia = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const falha = (motivo) => ({ ok: false, motivo });

  // ---- confirmação ----
  const nomeSec = (area) => ((GC.data && GC.data.areas.find((a) => a.id === area)) || { secretaria: { nome: 'outra secretaria' } }).secretaria.nome;
  const aspas = (t) => `“${t}”`;
  // Chave "<grupo>.<ação>" → (alvo, dados) → { titulo, texto, sim }. alvo: a ocorrência ou o registro da ação.
  GC.ACOES_CRITICAS = {
    'ocorrencia.gabinete': (o) => ({
      titulo: 'Convocar gabinete de crise?',
      texto: `${(o.areasEnvolvidas || [o.area]).map(nomeSec).join(', ')} ${(o.areasEnvolvidas || []).length > 1 ? 'recebem' : 'recebe'} demandas com prazo agora, e a sala do gabinete abre para ${aspas(o.titulo)}.`,
      sim: 'Convocar gabinete',
    }),
    'operacao.resolver': (o) => ({
      titulo: 'Dar por resolvida?',
      texto: `${aspas(o.titulo)} sai do mapa${GC.cobrancas && GC.cobrancas.aberta(o.id) ? ' e a cobrança do prefeito fecha com esta evidência' : ''}. Quem acompanha é avisado.`,
      sim: 'Resolver',
    }),
    'cobranca.evidencia': (c) => ({
      titulo: 'Dar por resolvida?',
      texto: `${aspas(c.retrato.titulo)} sai do mapa e a cobrança fecha com esta evidência. O prefeito é avisado.`,
      sim: 'Resolver',
    }),
    'operacao.devolver': (o, d = {}) => ({
      titulo: `Devolver à ${nomeSec(d.para)}?`,
      texto: `${aspas(o.titulo)} sai da sua pasta e vai para a ${nomeSec(d.para)}. O prazo continua contando de quando o alerta abriu.`,
      sim: 'Devolver',
    }),
    'operacao.juntar': (o, d = {}) => {
      const p = d.principal && GC.storeAtual ? GC.storeAtual.buscar(d.principal) : null;
      return {
        titulo: 'Juntar como duplicada?',
        texto: `${aspas(o.titulo)} fecha e fica ligada a ${p ? aspas(p.titulo) : 'a ocorrência principal'}, que segue aberta.`,
        sim: 'Juntar',
      };
    },
    'ajuda.determinar': (a) => ({
      titulo: 'Determinar a ajuda?',
      texto: `A ${nomeSec(a.para)} passa a ter ${GC.tempoTexto ? GC.tempoTexto(GC.PREVISAO_DETERMINADA_MIN || 120) : '2 h'} para ajudar a ${nomeSec(a.de)}, por decisão sua.`,
      sim: 'Determinar',
    }),
    // Ações do gabinete, segunda leva (js/acoes-prefeito.js): mudam o dono, fecham, falam com fora ou com o público.
    'acompanhar.definir_pasta': (o, d = {}) => (d.para === o.area ? {
      titulo: `Definir que é da ${nomeSec(o.area)}?`,
      texto: `${aspas(o.titulo)} fica com a ${nomeSec(o.area)}, que não pode mais devolver.`,
      sim: 'Definir',
    } : {
      titulo: `Passar à ${nomeSec(d.para)}?`,
      texto: `${aspas(o.titulo)} sai da ${nomeSec(o.area)} e vai para a ${nomeSec(d.para)}, que não pode mais devolver. O atendimento recomeça lá.`,
      sim: 'Passar e definir',
    }),
    'acompanhar.falso_alarme': (o) => ({
      titulo: 'Marcar como falso alarme?',
      texto: `${aspas(o.titulo)} sai do mapa sem contar como resolvida${GC.cobrancas && GC.cobrancas.aberta(o.id) ? ', e a cobrança aberta fecha' : ''}. Conta contra a regra que disparou.`,
      sim: 'Marcar falso alarme',
    }),
    'acompanhar.orgao': (o, d = {}) => ({
      titulo: 'Registrar o ofício?',
      texto: `Fica registrado que a Prefeitura acionou ${d.orgao === 'outro' ? (d.nomeOrgao || 'o órgão') : ((GC.ORGAOS_EXTERNOS || {})[d.orgao] || 'o órgão')} sobre ${aspas(o.titulo)}, com retorno em até ${d.dias} ${Number(d.dias) === 1 ? 'dia' : 'dias'}.`,
      sim: 'Registrar ofício',
    }),
    'acompanhar.avisar': (o) => ({
      titulo: 'Publicar no Portal do Cidadão?',
      texto: `O aviso sobre ${aspas(o.titulo)} aparece para todos os moradores, em Avisos, até a ocorrência ser resolvida ou você retirar.`,
      sim: 'Publicar',
    }),
  };
  // O texto da janela, ou null quando a ação não pede confirmação.
  GC.confirmacaoDe = function (chave, alvo, dados) {
    const f = GC.ACOES_CRITICAS[chave];
    return f && alvo ? f(alvo, dados) : null;
  };

  // ---- desfazer ----
  // armazenamento: { ler(chave) → texto | null, gravar(chave, texto | null) } (o texto cru do localStorage).
  // chaves(): as chaves dos registros a fotografar; recarregar(chave): avisa o registro dessa chave nesta aba.
  GC.criarDesfazer = function ({ armazenamento, chaves = () => [], recarregar = () => {}, agora = () => (GC.agora ? GC.agora() : Date.now()), relogio = () => Date.now() } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => (k in memoria ? memoria[k] : null),
      gravar: (k, v) => { if (v == null) delete memoria[k]; else memoria[k] = v; },
    };
    let pilha = [];
    let seq = 0;
    const ouvintes = new Set();
    const emitir = (tipo, item) => ouvintes.forEach((fn) => fn({ tipo, item }));
    const valida = (it) => relogio() - it.em <= GC.JANELA_DESFAZER_MS;
    const limpar = () => { pilha = pilha.filter(valida); };

    // store: a store das ocorrências (retrato/restaurar); ocorrencias: ids que a ação pode mudar.
    function fotografar({ store = null, ocorrencias = [] } = {}) {
      const ks = [...new Set(chaves().filter(Boolean))];
      const ids = [...new Set(ocorrencias.filter(Boolean))].filter((id) => store && store.buscar(id));
      const antes = { chaves: {}, ocorrencias: {} };
      ks.forEach((k) => { antes.chaves[k] = A.ler(k); });
      ids.forEach((id) => { antes.ocorrencias[id] = store.retrato(id); });
      let depois = null;
      const foto = {
        antes,
        // Depois da ação: o que mudou, como ficou.
        fixar() {
          depois = { chaves: {}, ocorrencias: {} };
          ks.forEach((k) => { const v = A.ler(k); if (v !== antes.chaves[k]) depois.chaves[k] = v; });
          ids.forEach((id) => { const r = json(store.retrato(id)); if (r !== json(antes.ocorrencias[id])) depois.ocorrencias[id] = r; });
          return foto;
        },
        mudou: () => !!depois && (Object.keys(depois.chaves).length > 0 || Object.keys(depois.ocorrencias).length > 0),
        mudadas: () => (depois ? Object.keys(depois.ocorrencias) : []),
        // Ninguém mexeu desde a ação? Então volta tudo o que ela mudou ao "antes".
        restaurar() {
          if (!depois) return falha('sem_foto');
          const mexeuK = Object.keys(depois.chaves).some((k) => A.ler(k) !== depois.chaves[k]);
          const mexeuO = Object.keys(depois.ocorrencias).some((id) => !store.buscar(id) || json(store.retrato(id)) !== depois.ocorrencias[id]);
          if (mexeuK || mexeuO) return falha('mudou');
          Object.keys(depois.chaves).forEach((k) => { A.gravar(k, antes.chaves[k]); recarregar(k); });
          const retratos = {};
          Object.keys(depois.ocorrencias).forEach((id) => { store.restaurar(id, copia(antes.ocorrencias[id])); retratos[id] = antes.ocorrencias[id]; });
          return { ok: true, retratos };
        },
      };
      return foto;
    }

    return {
      fotografar,
      // item: { rotulo, foto, dados? } (dados: o que o app precisa para avisar as outras abas e auditar).
      registrar(item) {
        if (!item || !item.foto || !item.foto.mudou()) return null;
        limpar();
        const it = Object.assign({}, item, { id: `dz-${++seq}`, em: relogio(), t: agora() });
        pilha.push(it);
        pilha = pilha.slice(-MAX_PILHA);
        emitir('novo', it);
        return it;
      },
      // A mais recente que ainda vale.
      ultimo() { limpar(); return pilha[pilha.length - 1] || null; },
      // Desfaz a mais recente (ou a do id, se for ela). Devolve { ok, item, retratos } ou { ok: false, motivo }.
      desfazer(id) {
        limpar();
        const it = pilha[pilha.length - 1];
        if (!it) return falha('nada');
        if (id && it.id !== id) return falha('nao_e_a_ultima');
        const r = it.foto.restaurar();
        pilha.pop();
        if (!r.ok) { emitir('recusado', it); return Object.assign(r, { item: it }); }
        emitir('desfeito', it);
        return { ok: true, item: it, retratos: r.retratos };
      },
      descartar() { pilha = []; emitir('limpo', null); },
      tamanho: () => { limpar(); return pilha.length; },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };
})(window.GC = window.GC || {});
