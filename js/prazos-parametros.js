(function (GC) {
  // Parâmetros de prazo (spec: docs/specs/2026-11-12-vila-dourada-prazos-fase2-design.md). Só lógica, sem DOM.
  // Guarda só o que o gestor geral mudou sobre os valores de fábrica e, ao carregar e a cada mudança, escreve nos
  // lugares que todo o painel já lê (GC.data.prazoMin, GC.data.prazoSolucaoMin, GC.PRAZO_RESPOSTA_MIN…).
  // Prazos por gravidade valem para ocorrências novas: as abertas guardam os delas.
  // Carregado depois de js/data-alertas.js e js/cidade.js, logo antes de js/regras-alerta.js.

  const SEVS = ['critica', 'alta', 'media'];
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const DIA = 1440;

  // Os valores de fábrica: os de js/data-alertas.js e js/prazos.js como vieram.
  const FABRICA = Object.freeze({
    atendimento: Object.assign({}, (GC.data && GC.data.prazoMin) || GC.prazosPadrao().atendimento),
    solucao: Object.assign({}, (GC.data && GC.data.prazoSolucaoMin) || GC.prazosPadrao().solucao),
    resposta: Object.assign({}, GC.PRAZO_RESPOSTA_MIN),
    ajudaMin: GC.PRAZO_RESPOSTA_AJUDA_MIN,
    determinadaMin: GC.PREVISAO_DETERMINADA_MIN,
    antecipaMin: GC.JANELA_ANTECIPA_MIN,
    pausaTetoMin: GC.PAUSA_TETO_MIN,
    prorrogacaoLivreMin: Object.assign({}, GC.PRORROGACAO_LIVRE_MIN),
  });
  GC.PARAMETROS_PRAZO_FABRICA = FABRICA;

  // Campos da tela, na ordem: [chave, gravidade|null, rótulo, mínimo, máximo] (minutos).
  GC.CAMPOS_PRAZO = [
    ...SEVS.map((s) => ['atendimento', s, 'Pôr equipe em campo', 10, 30 * DIA]),
    ...SEVS.map((s) => ['solucao', s, 'Resolver', 60, 90 * DIA]),
    ...SEVS.map((s) => ['prorrogacaoLivreMin', s, 'Mais prazo sem aprovação', 0, 30 * DIA]),
    ['pausaTetoMin', null, 'Pausa: volta ao prefeito depois de', 60, 30 * DIA],
    ...SEVS.map((s) => ['resposta', s, 'Responder cobrança ou explicação', 5, DIA]),
    ['ajudaMin', null, 'Responder pedido de ajuda', 5, DIA],
    ['determinadaMin', null, 'Ajuda determinada pelo prefeito', 10, 2 * DIA],
    ['antecipaMin', null, '"Vai estourar" na caixa do secretário', 10, DIA],
  ];
  const ler = (v, k, s) => (s ? v[k][s] : v[k]);
  const NOME_SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
  const tempo = (min) => (min === 0 ? 'nada' : GC.tempoTexto ? GC.tempoTexto(min) : `${min} min`);

  // Motivo do erro ou null. Resolver nunca menor que pôr equipe em campo.
  GC.validarParametrosPrazo = function (v) {
    for (const [k, s, , min, max] of GC.CAMPOS_PRAZO) {
      const x = ler(v, k, s);
      if (!Number.isInteger(x) || x < min || x > max) return `${k}${s ? `.${s}` : ''}`;
    }
    for (const s of SEVS) if (v.solucao[s] < v.atendimento[s]) return `solucao.${s}`;
    return null;
  };

  // O que mudou, em palavras (auditoria).
  GC.mudancasParametrosPrazo = function (antes, depois) {
    return GC.CAMPOS_PRAZO.filter(([k, s]) => ler(antes, k, s) !== ler(depois, k, s))
      .map(([k, s, rotulo]) => `${rotulo}${s ? ` (${NOME_SEV[s]})` : ''}: ${tempo(ler(antes, k, s))} → ${tempo(ler(depois, k, s))}`);
  };

  // Efeito de trocar os prazos por gravidade, medido nas ocorrências de agora (abertas e resolvidas na sessão).
  // Compara os dois jogos de valores pela mesma conta (prazos da gravidade, sem regra própria nem prorrogação):
  // quantas passaram ou passariam do prazo de pôr equipe em campo e do de resolver, e o "% no prazo" das resolvidas.
  GC.estimarParametrosPrazo = function (ocorrencias, depois, antes, agora = GC.agora ? GC.agora() : Date.now()) {
    const lista = (ocorrencias || []).filter((o) => o && !o.duplicadaDe && SEVS.includes(o.severidade) && o.criadaEm);
    const conta = (v) => {
      let atendimento = 0; let solucao = 0; let resolvidas = 0; let noPrazo = 0;
      lista.forEach((o) => {
        const ch = GC.chegadaDe ? GC.chegadaDe(o) : o.chegouEm;
        if (GC.tempoDePrazoMin(o, ch || agora) > v.atendimento[o.severidade]) atendimento += 1;
        const fim = o.status === 'resolvida' && o.resolvidaEm ? o.resolvidaEm : agora;
        const dentro = GC.tempoDePrazoMin(o, fim) <= v.solucao[o.severidade];
        if (!dentro) solucao += 1;
        if (o.status === 'resolvida' && o.resolvidaEm) { resolvidas += 1; if (dentro) noPrazo += 1; }
      });
      return { atendimento, solucao, noPrazoPct: resolvidas ? Math.round((noPrazo / resolvidas) * 100) : null, resolvidas };
    };
    const a = conta(antes);
    const d = conta(depois);
    return {
      total: lista.length,
      resolvidas: d.resolvidas,
      atendimento: { antes: a.atendimento, depois: d.atendimento },
      solucao: { antes: a.solucao, depois: d.solucao },
      noPrazoPct: d.resolvidas ? { antes: a.noPrazoPct, depois: d.noPrazoPct } : null,
    };
  };

  // Escreve os valores onde o painel lê. Objetos mudam no lugar (quem guardou a referência vê o novo valor).
  GC.aplicarParametrosPrazo = function (v) {
    if (GC.data) {
      GC.data.prazoMin = Object.assign(GC.data.prazoMin || {}, v.atendimento);
      GC.data.prazoSolucaoMin = Object.assign(GC.data.prazoSolucaoMin || {}, v.solucao);
    }
    Object.assign(GC.PRAZO_RESPOSTA_MIN, v.resposta);
    Object.assign(GC.PRORROGACAO_LIVRE_MIN, v.prorrogacaoLivreMin);
    GC.PRAZO_RESPOSTA_AJUDA_MIN = v.ajudaMin;
    GC.PREVISAO_DETERMINADA_MIN = v.determinadaMin;
    GC.JANELA_ANTECIPA_MIN = v.antecipaMin;
    GC.PAUSA_TETO_MIN = v.pausaTetoMin;
  };

  // armazenamento: { ler(k), gravar(k, v) }; sem ele, na memória. agora: relógio.
  GC.criarParametrosPrazo = function ({ armazenamento, chave = 'gc.prazos', agora = () => (GC.agora ? GC.agora() : Date.now()) } = {}) {
    const memoria = {};
    const A = armazenamento || { ler: (k) => (memoria[k] === undefined ? null : copia(memoria[k])), gravar: (k, v) => { memoria[k] = copia(v); } };
    const ouvintes = new Set();
    const emitir = (tipo) => ouvintes.forEach((fn) => fn({ tipo }));
    const guardado = () => A.ler(chave) || null;
    // Fábrica + o que foi mudado (campo a campo: um guardado antigo sem um campo novo fica com o de fábrica).
    function valores() {
      const g = guardado();
      const v = copia(FABRICA);
      if (g && g.valores) {
        GC.CAMPOS_PRAZO.forEach(([k, s]) => {
          const x = s ? (g.valores[k] || {})[s] : g.valores[k];
          if (Number.isInteger(x)) { if (s) v[k][s] = x; else v[k] = x; }
        });
      }
      return GC.validarParametrosPrazo(v) ? copia(FABRICA) : v;
    }
    const aplicar = () => GC.aplicarParametrosPrazo(valores());
    aplicar();
    return {
      valores,
      fabrica: () => copia(FABRICA),
      // Quem mudou e quando (null = de fábrica).
      sobre: () => { const g = guardado(); return g ? { editadaEm: g.editadaEm, editadaPor: g.editadaPor } : null; },
      // mudancas: o objeto de valores inteiro ou parte dele ({ solucao: { alta: 2880 } }).
      salvar(mudancas, quem = null) {
        const antes = valores();
        const depois = copia(antes);
        Object.keys(mudancas || {}).forEach((k) => {
          if (!(k in depois)) return;
          if (typeof depois[k] === 'object') Object.assign(depois[k], mudancas[k]);
          else depois[k] = mudancas[k];
        });
        const erro = GC.validarParametrosPrazo(depois);
        if (erro) return { ok: false, motivo: erro };
        const lista = GC.mudancasParametrosPrazo(antes, depois);
        if (!lista.length) return { ok: true, antes, valores: antes, mudancas: [], semMudanca: true };
        A.gravar(chave, { valores: depois, editadaEm: agora(), editadaPor: quem });
        aplicar();
        emitir('salvo');
        return { ok: true, antes, valores: valores(), mudancas: lista };
      },
      restaurar(quem = null) {
        const antes = valores();
        if (!guardado()) return { ok: false, motivo: 'fabrica' };
        A.gravar(chave, null);
        aplicar();
        emitir('restaurado');
        return { ok: true, antes, valores: valores(), mudancas: GC.mudancasParametrosPrazo(antes, valores()), quem };
      },
      // Outra aba gravou: relê e aplica.
      recarregar() { aplicar(); emitir('recarga'); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };

  // Instância do navegador, por cidade. Sem localStorage (testes), quem quiser cria a sua.
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.prazos.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_PRAZOS = chave;
    GC.parametrosPrazo = GC.criarParametrosPrazo({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
    if (window.addEventListener) window.addEventListener('storage', (e) => { if (e.key === chave) GC.parametrosPrazo.recarregar(); });
  }
})(window.GC = window.GC || {});
