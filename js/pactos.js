(function (GC) {
  // Metas pactuadas, planos de ação e notas da reunião de resultados
  // (spec: docs/specs/2026-11-12-vila-dourada-metas-e-niveis-design.md). Só lógica, sem DOM.
  // Guardado no armazenamento (localStorage no navegador) e relido antes de cada mudança, como as cobranças.
  //
  // Pacto: por indicador. Quem propõe (setor ou prefeito) manda valor, prazo (aaaa-mm) e motivo; o outro lado
  // aceita (vira pactuada) ou contrapropõe. Pactuada, vale até uma nova proposta ser aceita.
  // Ciclo (spec: docs/specs/2026-11-12-vila-dourada-metas-ciclo-design.md): o aceite guarda a linha de base (o valor
  // do indicador no dia) e os marcos escritos à mão, se houver. No fim do mês do prazo a meta é apurada
  // (GC.apurarPactos): cumprida ou não cumprida, em pacto.ciclos. Apurada, continua valendo até o próximo aceite.
  // Plano: um ativo por indicador, com causa e até 5 ações { texto, prazo aaaa-mm-dd, feita }.

  const MAX_ACOES = 5;
  const texto = (t) => String(t == null ? '' : t).trim();
  const falha = (motivo) => ({ ok: false, motivo });
  const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const outroLado = (lado) => (lado === 'setor' ? 'prefeito' : 'setor');
  // Fim do dia do prazo (aaaa-mm-dd), no fuso de quem vê: a ação vence no dia seguinte.
  const fimDoDia = (dia) => { const [a, m, d] = dia.split('-').map(Number); return new Date(a, m - 1, d, 23, 59, 59).getTime(); };
  // O prazo 'aaaa-mm' vence no fim do mês.
  const fimDoMes = (mes) => { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 1).getTime() - 1; };
  const MAX_MARCOS = 12;
  // Ação do plano (fase 2). Planos gravados antes não têm responsavel, evidencia nem cobrancas: valem como vazios.
  const novaAcao = (id, a) => ({ id, texto: texto(a.texto), prazo: a.prazo, responsavel: a.responsavel || null, feita: false, feitaEm: null, feitaPor: null, evidencia: null, cobrancas: [] });
  const cobrancaAberta = (a) => (a.cobrancas || []).find((c) => !c.resposta) || null;
  // Foto da evidência: data URL de imagem até GC.FOTO_MAX_BYTES (o mesmo limite das cobranças).
  const fotoValida = (foto) => /^data:image\//.test(String(foto)) && Math.round((String(foto).split(',')[1] || '').length * 0.75) <= (GC.FOTO_MAX_BYTES || 300 * 1024);
  // Marcos escritos à mão: [{ mes 'aaaa-mm', valor }], antes do prazo, um por mês. Linhas vazias são ignoradas.
  function lerMarcos(lista, prazo) {
    const vazio = (v) => v == null || String(v).trim() === '';
    const preenchidos = (lista || []).filter((m) => m && (!vazio(m.mes) || !vazio(m.valor)));
    if (!preenchidos.length) return { marcos: null };
    if (preenchidos.length > MAX_MARCOS) return { erro: 'marcos' };
    const marcos = [];
    for (const m of preenchidos) {
      const valor = Number(m.valor);
      if (!MES.test(String(m.mes || '')) || vazio(m.valor) || !Number.isFinite(valor) || String(m.mes) >= prazo) return { erro: 'marcos' };
      if (marcos.some((x) => x.mes === m.mes)) return { erro: 'marcos' };
      marcos.push({ mes: m.mes, valor });
    }
    return { marcos: marcos.sort((a, b) => (a.mes < b.mes ? -1 : 1)) };
  }

  GC.criarPactos = function ({ armazenamento, agora: agoraPadrao = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.pactos' } = {}) {
    let agora = agoraPadrao; // comRelogio troca por um instante (semente de demonstração)
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const vazio = () => ({ pactos: {}, planos: {}, notas: {} });
    const ler = () => { const v = A.ler(chave); return v && typeof v === 'object' && v.pactos ? v : vazio(); };
    const ouvintes = new Set();
    let silencio = false; // comRelogio(t, fn, { silencio: true }): grava sem avisar os ouvintes (semente)
    const emitir = (tipo, extra) => { if (!silencio) ouvintes.forEach((fn) => fn(Object.assign({ tipo }, extra))); };
    function mudar(fn, evento) {
      const d = ler();
      const r = fn(d) || {};
      if (r.ok === false) return r;
      A.gravar(chave, d);
      // A meta pactuada vale também na série de 12 meses das secretarias (uma meta só em todas as telas).
      if (GC.pactos === api && GC.alinharMetasDasSeries) GC.alinharMetasDasSeries();
      emitir(evento, r);
      return Object.assign({ ok: true }, r);
    }

    const api = {
      // ---- pacto ----
      pacto: (indId) => ler().pactos[indId] || null,
      // A meta que vale: a pactuada, se houver (senão null, e vale a do catálogo).
      metaPactuada(indId) { const p = ler().pactos[indId]; return p && p.vigente ? p.vigente : null; },
      // ind: o indicador do catálogo (id, area); proposta: { valor, prazo 'aaaa-mm', motivo }; lado: 'setor' | 'prefeito'.
      propor(ind, proposta = {}, lado, quem = '') {
        if (!ind || !ind.id) return falha('indicador');
        if (lado !== 'setor' && lado !== 'prefeito') return falha('lado');
        const valor = Number(proposta.valor);
        if (proposta.valor === '' || proposta.valor == null || !Number.isFinite(valor)) return falha('valor');
        if (!MES.test(String(proposta.prazo || ''))) return falha('prazo');
        if (!texto(proposta.motivo)) return falha('motivo');
        const lm = lerMarcos(proposta.marcos, proposta.prazo);
        if (lm.erro) return falha(lm.erro);
        return mudar((d) => {
          const p = d.pactos[ind.id] || { indicadorId: ind.id, area: ind.area, vigente: null, proposta: null, historico: [] };
          if (p.proposta && p.proposta.lado === lado) return falha('ja_proposto');
          const t = agora();
          const tipo = p.proposta ? 'contraproposta' : 'proposta';
          p.proposta = { valor, prazo: proposta.prazo, motivo: texto(proposta.motivo), marcos: lm.marcos, lado, quem, em: t };
          p.historico.push({ tipo, valor, prazo: proposta.prazo, motivo: texto(proposta.motivo), marcos: lm.marcos, lado, quem, em: t });
          d.pactos[ind.id] = p;
          return { pacto: p };
        }, 'proposta');
      },
      // O outro lado aceita a proposta aberta: vira a meta pactuada. linhaBase: o valor do indicador agora
      // (a tela tem), ponto de partida do caminho até a meta. A vigente ainda não apurada fecha como "substituída".
      aceitar(indId, lado, quem = '', { linhaBase = null } = {}) {
        return mudar((d) => {
          const p = d.pactos[indId];
          if (!p || !p.proposta) return falha('sem_proposta');
          if (p.proposta.lado === lado) return falha('mesmo_lado');
          const t = agora();
          const base = typeof linhaBase === 'number' && Number.isFinite(linhaBase) ? linhaBase : null;
          p.ciclos = p.ciclos || [];
          if (p.vigente && !p.vigente.apurada) {
            p.ciclos.push({ resultado: 'substituida', meta: p.vigente.valor, prazo: p.vigente.prazo, linhaBase: p.vigente.linhaBase ?? null, pactuadaEm: p.vigente.pactuadaEm, valor: null, fonte: null, em: t });
          }
          const marcos = p.proposta.marcos || null;
          p.vigente = { valor: p.proposta.valor, prazo: p.proposta.prazo, pactuadaEm: t, linhaBase: base, marcos, apurada: null };
          p.historico.push({ tipo: 'aceite', valor: p.proposta.valor, prazo: p.proposta.prazo, linhaBase: base, marcos, lado, quem, em: t });
          p.proposta = null;
          return { pacto: p };
        }, 'pactuada');
      },
      // Pactos com o prazo vencido e ainda não apurados (todas as pastas).
      vencidos(t = agora()) {
        return Object.values(ler().pactos).filter((p) => p.vigente && !p.vigente.apurada && t > fimDoMes(p.vigente.prazo));
      },
      // Grava a apuração da meta vigente: { valor, fonte: 'serie' | 'agora', resultado: 'cumprida' | 'nao_cumprida' }.
      // Uma vez só por ciclo; a meta continua valendo (marcada vencida) até o próximo aceite.
      apurar(indId, apuracao = {}) {
        if (apuracao.resultado !== 'cumprida' && apuracao.resultado !== 'nao_cumprida') return falha('resultado');
        return mudar((d) => {
          const p = d.pactos[indId];
          if (!p || !p.vigente) return falha('sem_pacto');
          if (p.vigente.apurada) return falha('ja_apurada');
          const c = {
            resultado: apuracao.resultado, meta: p.vigente.valor, prazo: p.vigente.prazo, linhaBase: p.vigente.linhaBase ?? null,
            pactuadaEm: p.vigente.pactuadaEm, valor: apuracao.valor, fonte: apuracao.fonte || 'agora', em: agora(),
          };
          p.ciclos = p.ciclos || [];
          p.ciclos.push(c);
          p.vigente.apurada = c;
          return { pacto: p, ciclo: c };
        }, 'apurada');
      },
      // Ciclos fechados (apurados ou substituídos) da pasta, ou de todas, desde `desde`.
      ciclosDa(area = null, desde = 0) {
        return Object.values(ler().pactos).filter((p) => !area || p.area === area)
          .flatMap((p) => (p.ciclos || []).filter((c) => c.em >= desde).map((c) => Object.assign({ indicadorId: p.indicadorId, area: p.area }, c)));
      },
      // Metas apuradas que esperam o próximo ciclo (sem nova proposta). area: a pasta, ou todas.
      vencidasSemNovoPacto(area = null) {
        return Object.values(ler().pactos).filter((p) => p.vigente && p.vigente.apurada && !p.proposta && (!area || p.area === area));
      },
      marcarSimulado(indId) {
        return mudar((d) => { const p = d.pactos[indId]; if (!p) return falha('sem_pacto'); p.simulado = true; return { pacto: p }; }, 'simulado');
      },
      // Propostas que esperam este lado (a do outro lado). area: só a pasta (setor) ou todas (prefeito).
      pendentes(lado, area = null) {
        return Object.values(ler().pactos).filter((p) => p.proposta && p.proposta.lado === outroLado(lado) && (!area || p.area === area));
      },
      pactosDa: (area) => Object.values(ler().pactos).filter((p) => p.area === area),

      // ---- plano de ação ----
      planoAtivo(indId) { const p = (ler().planos[indId] || []).find((x) => x.estado === 'ativo'); return p || null; },
      planos: (indId) => (ler().planos[indId] || []).slice(),
      // plano: { causa, acoes: [{ texto, prazo, responsavel? }], valorInicial? } (fase 2, spec:
      // docs/specs/2026-11-12-vila-dourada-plano-de-acao-design.md). responsavel: id de usuário (null = o secretário);
      // valorInicial: o valor do indicador no dia, para o efeito do plano (GC.efeitoPlano).
      criarPlano(ind, plano = {}, quem = '') {
        if (!ind || !ind.id) return falha('indicador');
        if (!texto(plano.causa)) return falha('causa');
        const acoes = (plano.acoes || []).filter((a) => texto(a.texto));
        if (!acoes.length) return falha('acoes');
        if (acoes.length > MAX_ACOES) return falha('muitas_acoes');
        if (acoes.some((a) => !DIA.test(String(a.prazo || '')))) return falha('prazo');
        const inicial = Number(plano.valorInicial);
        return mudar((d) => {
          const lista = d.planos[ind.id] || [];
          if (lista.some((x) => x.estado === 'ativo')) return falha('ja_tem_plano');
          const t = agora();
          const p = {
            id: `pl-${ind.id}-${lista.length + 1}`, indicadorId: ind.id, area: ind.area, causa: texto(plano.causa), quem, em: t, estado: 'ativo',
            valorInicial: plano.valorInicial != null && plano.valorInicial !== '' && Number.isFinite(inicial) ? inicial : null,
            acoes: acoes.map((a, i) => novaAcao(i + 1, a)),
          };
          lista.push(p);
          d.planos[ind.id] = lista;
          return { plano: p };
        }, 'plano');
      },
      // Marca (ou desmarca) a ação. extra: { quem, evidencia: { texto, foto } } (os dois opcionais). Marcar feita fecha a
      // cobrança aberta da ação.
      marcarAcao(indId, acaoId, feita = true, extra = {}) {
        const ev = extra.evidencia || {};
        if (ev.foto && !fotoValida(ev.foto)) return falha('foto_grande');
        return mudar((d) => {
          const p = (d.planos[indId] || []).find((x) => x.estado === 'ativo');
          const a = p && p.acoes.find((x) => x.id === Number(acaoId));
          if (!a) return falha('acao');
          const t = agora();
          a.feita = !!feita;
          a.feitaEm = feita ? t : null;
          a.feitaPor = feita ? (extra.quem || '') : null;
          a.evidencia = feita && (texto(ev.texto) || ev.foto) ? { texto: texto(ev.texto), foto: ev.foto || null } : null;
          const aberta = feita && cobrancaAberta(a);
          if (aberta) aberta.resposta = { tipo: 'feita', texto: texto(ev.texto), em: t, quem: extra.quem || '' };
          return { plano: p, acao: a };
        }, 'acao');
      },
      // Muda texto, prazo e responsável de uma ação ainda não feita. mudanca: { texto?, prazo?, responsavel? }.
      editarAcao(indId, acaoId, mudanca = {}, quem = '') {
        if (mudanca.texto !== undefined && !texto(mudanca.texto)) return falha('texto');
        if (mudanca.prazo !== undefined && !DIA.test(String(mudanca.prazo || ''))) return falha('prazo');
        return mudar((d) => {
          const p = (d.planos[indId] || []).find((x) => x.estado === 'ativo');
          const a = p && p.acoes.find((x) => x.id === Number(acaoId));
          if (!a) return falha('acao');
          if (a.feita) return falha('ja_feita');
          const de = {}; const para = {};
          [['texto', texto(mudanca.texto)], ['prazo', mudanca.prazo], ['responsavel', mudanca.responsavel || null]].forEach(([campo, v]) => {
            if (mudanca[campo] === undefined || (a[campo] ?? null) === v) return;
            de[campo] = a[campo] ?? null; para[campo] = v; a[campo] = v;
          });
          if (!Object.keys(para).length) return falha('sem_mudanca');
          a.alteracoes = a.alteracoes || [];
          a.alteracoes.push({ em: agora(), quem, de, para });
          return { plano: p, acao: a };
        }, 'acao_editada');
      },
      // Acrescenta uma ação ao plano ativo (até 5).
      adicionarAcao(indId, acao = {}, quem = '') {
        if (!texto(acao.texto)) return falha('texto');
        if (!DIA.test(String(acao.prazo || ''))) return falha('prazo');
        return mudar((d) => {
          const p = (d.planos[indId] || []).find((x) => x.estado === 'ativo');
          if (!p) return falha('sem_plano');
          if (p.acoes.length >= MAX_ACOES) return falha('muitas_acoes');
          const a = Object.assign(novaAcao(Math.max(0, ...p.acoes.map((x) => x.id)) + 1, acao), { criadaPor: quem, criadaEm: agora() });
          p.acoes.push(a);
          return { plano: p, acao: a };
        }, 'acao_nova');
      },
      // Cobrança leve do prefeito: só ação atrasada e sem cobrança aberta.
      cobrarAcao(indId, acaoId, quem = '') {
        return mudar((d) => {
          const p = (d.planos[indId] || []).find((x) => x.estado === 'ativo');
          const a = p && p.acoes.find((x) => x.id === Number(acaoId));
          if (!a) return falha('acao');
          const t = agora();
          if (a.feita || t <= fimDoDia(a.prazo)) return falha('nao_atrasada');
          if (cobrancaAberta(a)) return falha('ja_cobrada');
          a.cobrancas = a.cobrancas || [];
          a.cobrancas.push({ em: t, quem, resposta: null });
          return { plano: p, acao: a };
        }, 'acao_cobrada');
      },
      // Resposta à cobrança: { tipo: 'nova_data', prazo, texto } (o prazo vira a nova data, hoje ou depois) ou
      // { tipo: 'feita', texto, foto } (marca a ação feita com a evidência).
      responderCobrancaAcao(indId, acaoId, resposta = {}, quem = '') {
        if (resposta.tipo === 'feita') {
          const a0 = api.acao(indId, acaoId);
          if (!a0 || !cobrancaAberta(a0)) return falha('sem_cobranca');
          return api.marcarAcao(indId, acaoId, true, { quem, evidencia: { texto: resposta.texto, foto: resposta.foto } });
        }
        if (resposta.tipo !== 'nova_data') return falha('tipo');
        if (!DIA.test(String(resposta.prazo || ''))) return falha('prazo');
        if (fimDoDia(resposta.prazo) < agora()) return falha('prazo_passado');
        if (!texto(resposta.texto)) return falha('motivo');
        return mudar((d) => {
          const p = (d.planos[indId] || []).find((x) => x.estado === 'ativo');
          const a = p && p.acoes.find((x) => x.id === Number(acaoId));
          if (!a) return falha('acao');
          const c = cobrancaAberta(a);
          if (!c) return falha('sem_cobranca');
          const t = agora();
          c.resposta = { tipo: 'nova_data', prazo: resposta.prazo, prazoAntes: a.prazo, texto: texto(resposta.texto), em: t, quem };
          a.alteracoes = a.alteracoes || [];
          a.alteracoes.push({ em: t, quem, de: { prazo: a.prazo }, para: { prazo: resposta.prazo }, porCobranca: true });
          a.prazo = resposta.prazo;
          return { plano: p, acao: a };
        }, 'acao_respondida');
      },
      acao(indId, acaoId) {
        const p = (ler().planos[indId] || []).find((x) => x.estado === 'ativo');
        return (p && p.acoes.find((x) => x.id === Number(acaoId))) || null;
      },
      // Ações de planos ativos com cobrança do prefeito ainda sem resposta (da pasta, ou todas).
      acoesCobradas(area = null) {
        const lista = [];
        Object.values(ler().planos).forEach((ps) => ps.filter((p) => p.estado === 'ativo' && (!area || p.area === area))
          .forEach((p) => p.acoes.filter((a) => !a.feita && cobrancaAberta(a)).forEach((a) => lista.push(Object.assign({ indicadorId: p.indicadorId, area: p.area, cobranca: cobrancaAberta(a) }, a)))));
        return lista;
      },
      encerrarPlano(indId, motivo = '', quem = '') {
        return mudar((d) => {
          const p = (d.planos[indId] || []).find((x) => x.estado === 'ativo');
          if (!p) return falha('sem_plano');
          p.estado = 'concluido';
          p.encerradoEm = agora();
          p.motivoEncerramento = texto(motivo);
          p.encerradoPor = quem;
          return { plano: p };
        }, 'plano_encerrado');
      },
      // Ações de planos ativos (da pasta, ou todas) com o prazo passado e não feitas.
      acoesVencidas(area = null, t = agora()) {
        const lista = [];
        Object.values(ler().planos).forEach((ps) => ps.filter((p) => p.estado === 'ativo' && (!area || p.area === area))
          .forEach((p) => p.acoes.filter((a) => !a.feita && t > fimDoDia(a.prazo)).forEach((a) => lista.push(Object.assign({ indicadorId: p.indicadorId, area: p.area }, a)))));
        return lista;
      },

      // ---- notas da reunião de resultados (o que a pasta vai levar) ----
      nota: (area) => ler().notas[area] || null,
      salvarNota(area, conteudo, quem = '') {
        if (!area) return falha('area');
        return mudar((d) => { d.notas[area] = { texto: texto(conteudo), quem, em: agora() }; return { nota: d.notas[area] }; }, 'nota');
      },

      recarregar() { if (GC.pactos === api && GC.alinharMetasDasSeries) GC.alinharMetasDasSeries(); emitir('recarga', {}); },
      vazio: () => { const d = ler(); return !Object.keys(d.pactos).length && !Object.keys(d.planos).length; },
      // Roda fn com o relógio parado em t (a semente de demonstração grava o aceite no passado). silencio: sem avisar
      // os ouvintes (a semente roda antes de o painel terminar de montar e não vira aviso de "meta aceita").
      comRelogio(t, fn, { silencio: calado = false } = {}) {
        const antes = agora; const antesSil = silencio;
        agora = () => t; silencio = calado;
        try { return fn(); } finally { agora = antes; silencio = antesSil; }
      },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
    return api;
  };

  // Apuração das metas com o prazo vencido (só lógica; js/app/simulacao.js chama ao abrir e a cada passo).
  // indicadores: os avaliados (GC.avaliarIndicadores), para o valor atual e a polaridade. O valor apurado é o
  // ponto da série no mês do prazo, se o mês está nela; senão o valor de agora. Sem valor, espera.
  GC.apurarPactos = function (pactos, indicadores = [], agora = (GC.agora ? GC.agora() : Date.now())) {
    if (!pactos) return [];
    const feitas = [];
    pactos.vencidos(agora).forEach((p) => {
      const ind = indicadores.find((i) => i.id === p.indicadorId);
      if (!ind) return;
      const daSerie = GC.valorNoMes ? GC.valorNoMes(ind, p.vigente.prazo) : null;
      const valor = typeof daSerie === 'number' ? daSerie : ind.valorAtual;
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return;
      const meta = p.vigente.valor;
      const cumpriu = ind.polaridade === 'menor' ? valor <= meta : valor >= meta;
      const r = pactos.apurar(p.indicadorId, { valor, fonte: typeof daSerie === 'number' ? 'serie' : 'agora', resultado: cumpriu ? 'cumprida' : 'nao_cumprida' });
      if (r.ok) feitas.push(Object.assign({ indicadorId: p.indicadorId, area: p.area }, r.ciclo));
    });
    return feitas;
  };

  // Efeito do plano: o valor do indicador quando o plano foi criado × agora (i: o indicador avaliado).
  // Devolve { inicial, atual, delta, melhorou } (melhorou pela polaridade; null se não mudou) ou null sem os dois valores.
  GC.efeitoPlano = function (plano, i) {
    if (!plano || !i || typeof plano.valorInicial !== 'number' || typeof i.valorAtual !== 'number') return null;
    const delta = Math.round((i.valorAtual - plano.valorInicial) * 100) / 100;
    return { inicial: plano.valorInicial, atual: i.valorAtual, delta, melhorou: delta === 0 ? null : (i.polaridade === 'menor' ? delta < 0 : delta > 0) };
  };

  // Pactos de demonstração (simulado: true): só entram com o registro vazio, na primeira abertura.
  // Espera nas UBS (SAU03): 65 min até o último mês fechado; a série mostra, na abertura, que não foi cumprida.
  // Coleta no prazo (LIM01): 93% em três meses, aceita há um mês, para mostrar o ritmo.
  GC.semearPactosDemo = function (pactos, agora = (GC.agora ? GC.agora() : Date.now())) {
    if (!pactos || !pactos.vazio() || !GC.CATALOGO_INDICADORES || !GC.relogio || !GC.somarMeses) return false;
    const DIA = 86400000;
    const mesHoje = GC.relogio.hoje.slice(0, 7);
    const SEMENTE = [
      { id: 'SAU03', valor: 65, prazo: GC.somarMeses(mesHoje, -1), diasAtras: 185, motivo: 'Duas UBS em reforma até setembro; os 60 min só depois delas' },
      { id: 'LIM01', valor: 93, prazo: GC.somarMeses(mesHoje, 3), diasAtras: 30, motivo: 'Dois caminhões novos chegam em dezembro' },
    ];
    let ok = false;
    SEMENTE.forEach((s) => {
      const ind = GC.CATALOGO_INDICADORES.find((i) => i.id === s.id);
      if (!ind) return;
      const quando = agora - s.diasAtras * DIA;
      const base = GC.valorNoMes ? GC.valorNoMes(ind, GC.mesDe(quando)) : null;
      pactos.comRelogio(quando, () => {
        pactos.propor(ind, { valor: s.valor, prazo: s.prazo, motivo: s.motivo }, 'setor', 'Simulado');
        if (pactos.aceitar(s.id, 'prefeito', 'Simulado', { linhaBase: base }).ok) { pactos.marcarSimulado(s.id); ok = true; }
      }, { silencio: true });
    });
    return ok;
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.pactos.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_PACTOS = chave;
    GC.pactos = GC.criarPactos({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  } else GC.pactos = GC.criarPactos();
})(window.GC = window.GC || {});
