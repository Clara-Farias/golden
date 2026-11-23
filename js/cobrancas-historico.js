(function (GC) {
  // Histórico de cobranças (tela #/cobrancas, js/tela-cobrancas.js): filtro, números e o histórico simulado dos
  // 30 dias anteriores à demonstração (como a auditoria, para a tela não abrir vazia). Só lógica, sem DOM.
  // As cobranças de verdade ficam em GC.cobrancas (js/cobrancas.js) e nunca são apagadas pelo histórico.

  const MIN = 60000;
  const DIA = 1440 * MIN;
  const RESPOSTA = ['previsao', 'justificativa', 'recurso', 'novo_prazo', 'evidencia'];

  // Primeira resposta da secretaria (o que conta para "respondida no prazo"); a nota do sistema não vale.
  GC.primeiraRespostaCobranca = (c) => c.respostas.find((r) => RESPOSTA.includes(r.tipo) && !r.semEvidencia) || null;
  const prazoResposta = (c) => ((GC.PRAZO_RESPOSTA_MIN || {})[c.retrato.severidade] || 120) * MIN;

  // Situação para o filtro: 'encerradas', 'esperam' (novo prazo ou recurso esperando o prefeito), 'vencidas', 'abertas'.
  GC.situacaoHistoricoCobranca = function (c, cb, t) {
    if (c.estado === 'encerrada') return 'encerradas';
    if (c.estado === 'novo_prazo' || (cb && cb.recursoPendente(c))) return 'esperam';
    if (cb && cb.vencida(c, t)) return 'vencidas';
    return 'abertas';
  };

  // filtro: { area, estado ('todas' | 'abertas' | 'vencidas' | 'esperam' | 'encerradas'), dias (null = tudo), busca }
  GC.filtrarCobrancas = function (lista, { area = null, estado = 'todas', dias = null, busca = '' } = {}, cb = null, t = GC.agora()) {
    const termo = String(busca || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const bairro = (id) => ((GC.data.bairros || []).find((b) => b.id === id) || { nome: '' }).nome;
    return lista
      .filter((c) => !area || c.area === area)
      .filter((c) => !dias || c.em >= t - dias * DIA)
      .filter((c) => {
        if (estado === 'todas') return true;
        const s = GC.situacaoHistoricoCobranca(c, cb, t);
        return estado === 'abertas' ? s !== 'encerradas' : s === estado;
      })
      .filter((c) => !termo || norm(`${c.retrato.titulo} ${bairro(c.retrato.bairroId)}`).includes(termo))
      .sort((a, b) => b.em - a.em);
  };

  // Números do topo da tela.
  GC.estatisticasCobrancas = function (lista, cb = null, t = GC.agora()) {
    const respondidas = lista.filter((c) => GC.primeiraRespostaCobranca(c));
    const tempos = respondidas.map((c) => (GC.primeiraRespostaCobranca(c).em - c.em) / MIN);
    const noPrazo = respondidas.filter((c) => GC.primeiraRespostaCobranca(c).em - c.em <= prazoResposta(c)).length;
    return {
      total: lista.length,
      respondidas: respondidas.length,
      noPrazo,
      pctNoPrazo: lista.length ? Math.round((noPrazo / lista.length) * 100) : null,
      mediaPrimeiraRespostaMin: tempos.length ? Math.round(tempos.reduce((s, x) => s + x, 0) / tempos.length) : null,
      recobradas: lista.filter((c) => c.vezes > 1).length,
      vencidasAgora: lista.filter((c) => GC.situacaoHistoricoCobranca(c, cb, t) === 'vencidas').length,
      abertas: lista.filter((c) => c.estado !== 'encerrada').length,
    };
  };

  // CSV (separador ;) do que está na tela.
  GC.csvCobrancas = function (lista, cb = null, t = GC.agora()) {
    const sec = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { secretaria: { nome: id } }).secretaria.nome;
    const bairro = (id) => ((GC.data.bairros || []).find((b) => b.id === id) || { nome: id }).nome;
    const data = (ms) => new Date(ms).toLocaleString('pt-BR');
    const campo = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const cab = ['cobrada_em', 'ocorrencia', 'bairro', 'secretaria', 'situacao', 'vezes', 'primeira_resposta_min', 'no_prazo', 'resumo'];
    const linhas = lista.map((c) => {
      const r = GC.primeiraRespostaCobranca(c);
      const min = r ? Math.round((r.em - c.em) / MIN) : '';
      return [data(c.em), c.retrato.titulo, bairro(c.retrato.bairroId), sec(c.area), GC.situacaoHistoricoCobranca(c, cb, t), c.vezes, min,
        r ? (r.em - c.em <= prazoResposta(c) ? 'sim' : 'não') : '', GC.resumoCobranca ? GC.resumoCobranca(c, t).replace(/^\S+ /, '') : ''].map(campo).join(';');
    });
    return [cab.join(';'), ...linhas].join('\n');
  };

  // Histórico simulado: cobranças encerradas nos 30 dias antes de hoje, a partir das ocorrências da cidade.
  // Determinístico (mesmo resultado a cada abertura). simulada: true em cada uma, e a tela avisa.
  GC.historicoDemoCobrancas = function (agora = GC.agora(), quantas = 24) {
    const modelos = [...(GC.data.ocorrencias || []), ...(GC.data.ocorrenciasExtras || [])].filter((o) => o.area);
    if (!modelos.length) return [];
    let semente = 7;
    const rnd = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };
    const resp = (area) => ((GC.data.responsaveis || {})[area] || [])[0] || 'Secretaria';
    const lista = [];
    for (let i = 0; i < quantas; i += 1) {
      const o = modelos[Math.floor(rnd() * modelos.length)];
      const em = agora - (1 + i * 1.2 + rnd()) * DIA;
      const prazo = ((GC.PRAZO_RESPOSTA_MIN || {})[o.severidade] || 120) * MIN;
      const quem = resp(o.area);
      const sorte = rnd();
      const respostas = [];
      let vezes = 1;
      let t = em;
      if (sorte < 0.12) { // ninguém respondeu no prazo: o prefeito cobrou de novo
        t = em + prazo + 20 * MIN; vezes = 2;
        respostas.push({ tipo: 'recobranca', quem: 'Prefeito(a)', em: t });
      }
      if (sorte >= 0.12 && sorte < 0.24) {
        t += 25 * MIN;
        respostas.push({ tipo: 'justificativa', motivo: sorte < 0.18 ? 'falta_equipe' : 'clima', texto: 'Equipe em outro atendimento no turno.', quem, em: t });
      }
      if (sorte >= 0.24 && sorte < 0.32) {
        t += 30 * MIN;
        respostas.push({ tipo: 'novo_prazo', horas: 6, texto: 'Depende de material que chega à tarde.', quem, em: t });
        t += 15 * MIN;
        respostas.push({ tipo: 'decisao', aprovado: true, horas: 6, texto: '', quem: 'Prefeito(a)', em: t });
      }
      const atraso = sorte > 0.85 ? prazo * 1.4 : prazo * (0.2 + rnd() * 0.6); // ~15% respondem fora do prazo
      t = Math.max(t, em) + (respostas.length ? 10 * MIN : atraso);
      const minutos = 20 + Math.round(rnd() * 8) * 10;
      respostas.push({ tipo: 'previsao', minutos, texto: '', quem, em: t });
      t += minutos * MIN;
      respostas.push({ tipo: 'evidencia', texto: 'Atendimento concluído no local.', foto: null, quem, em: t });
      lista.push({
        id: `cb-hist-${i + 1}`, ocorrenciaId: `${o.id}-hist-${i + 1}`, area: o.area,
        retrato: { titulo: o.titulo, bairroId: o.bairroId, severidade: o.severidade, prazoMin: 0, criadaEm: em - 3 * 60 * MIN },
        de: { usuarioId: null, quem: 'Prefeito(a)' }, em, vezes, prazoRespostaEm: em + prazo, estado: 'encerrada',
        previsaoEm: null, novoPrazoPedido: null, encerradaEm: t, respostas, simulada: true,
      });
    }
    return lista;
  };
})(window.GC = window.GC || {});
