(function (GC) {
  // Maia e o cruzamento de dados (motor em js/cruzamento.js, tela em js/tela-cruzamento.js).
  // - "cruze B.O.s com quedas de energia", "relação entre coleta no prazo e satisfação": a leitura, os bairros ruins
  //   nos dois destacados no mapa, "Abrir no cruzamento" e a planilha (arquivo 'cruzamento', via js/ia/arquivos.js).
  // - Com a tela do cruzamento aberta, "explique este cruzamento" responde sobre o par da tela (foco 'cruzamento').
  // Roda depois de js/ia/arquivos.js: envolve GC.ia.perguntar e devolve ao motor o que não é pedido de cruzamento.
  if (!GC.ia) return;
  const norm = (t) => ` ${GC.ia.normalizar(t)} `;
  const PEDIDO = /\bcruz\w*|correlac\w*|relacao entre|\bversus\b|\bvs\b| x |compar\w* .+ com /;
  const ctxDe = (contexto) => ({ ocorrencias: contexto.ocorrencias || (GC.storeAtual ? GC.storeAtual.ocorrencias() : []), areas: contexto.areasPerfil || null });
  const perfilDe = (contexto) => (contexto.areasPerfil ? { id: 'setor', area: contexto.areasPerfil[0] } : GC.perfil || { id: 'prefeito' });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // Resposta comum (pedido no chat e pergunta sobre a tela aberta).
  function resposta(res, { cenario, abrir = true } = {}) {
    const ambos = res.grupos.ambos;
    const primeiro = ambos[0];
    const acoes = [];
    if (abrir) acoes.push({ rotulo: '📊 Abrir no cruzamento', tipo: 'abrirTela', payload: { rota: { tela: 'cruzamento', a: res.a.id, b: res.b.id } } });
    if (primeiro) acoes.push({ rotulo: `Como está o bairro ${primeiro.nome}?`, tipo: 'perguntar', payload: { texto: `Como está o bairro ${primeiro.nome}?` } });
    return {
      cenario,
      selo: 'analise',
      texto: [`${res.a.nome} × ${res.b.nome}, nos ${plural(res.n, 'bairro', 'bairros')} com os dois números.`, ...res.leitura].join(' '),
      mapa: GC.cruzamento.mapa(res),
      acoes,
      ...(GC.arquivosMaia ? { arquivo: { modelo: 'cruzamento', params: { a: res.a.id, b: res.b.id, areas: (res.areas || []).join(',') }, titulo: `Cruzamento: ${res.a.nome} × ${res.b.nome}`, formatos: ['xlsx', 'csv'] } } : {}),
      fontes: res.fontes.slice(0, 8),
      memoria: { tema: null, bairros: ambos.slice(0, 5).map((p) => p.id), periodo: null },
    };
  }

  function cruzarPedido(texto, contexto) {
    if (!GC.cruzamento || !PEDIDO.test(norm(texto))) return null;
    const par = GC.cruzamento.interpretar(texto, perfilDe(contexto));
    if (!par) return null;
    const ctx = ctxDe(contexto);
    const res = GC.cruzamento.cruzar(par.a, par.b, ctx);
    if (!res) return null;
    res.areas = ctx.areas;
    return resposta(res, { cenario: 'cruzamento' });
  }

  // Foco da tela: "explique este cruzamento", "o que isso quer dizer?", "por onde começo?".
  GC.focosIA = GC.focosIA || {};
  const SOBRE_A_TELA = /\b(expli\w*|resum\w*|signific\w*|quer dizer|o que (isso|os numeros|o grafico|o cruzamento)|por onde comec\w*|o que fazer|esses bairros|este cruzamento)\b/;
  GC.focosIA.cruzamento = {
    responder(foco, ent) {
      if (!foco.res || ent.intencao || !SOBRE_A_TELA.test(ent.q)) return null;
      const r = resposta(foco.res, { cenario: 'cruzamento_tela', abrir: false });
      const p = foco.res.grupos.ambos[0];
      if (p) r.texto += ` Por onde começar: ${p.nome}, o mais distante da mediana nos dois (${GC.cruzamento.formatar(foco.res.a, p.a)}; ${GC.cruzamento.formatar(foco.res.b, p.b)}).`;
      return r;
    },
  };

  // Planilha do cruzamento: uma linha por bairro, o grupo e a relação (mesmo formato de relatório dos outros arquivos).
  if (GC.arquivosMaia) {
    GC.arquivosMaia.registrar('cruzamento', {
      nome: 'Cruzamento de dados',
      quando: () => false, // só nasce da resposta do cruzamento, nunca de um pedido solto de arquivo
      params: () => ({}),
      montar(p) {
        const res = GC.cruzamento.cruzar(p.a, p.b, { ocorrencias: GC.storeAtual ? GC.storeAtual.ocorrencias() : [], areas: p.areas ? p.areas.split(',') : null });
        const val = (i, v) => (v == null ? '' : v);
        const GRUPO = GC.cruzamento.rotulos(res);
        return {
          titulo: `Cruzamento: ${res.a.nome} × ${res.b.nome}`,
          subtitulo: 'Bairro a bairro, com os grupos pelas medianas da cidade',
          periodo: { rotulo: 'dados de agora (30 dias)' },
          kpis: [
            { rotulo: 'Relação', valor: res.forca.rotulo, detalhe: res.r == null ? '' : `Spearman ${String(res.r).replace('.', ',')}` },
            { rotulo: 'Bairros com os dois números', valor: String(res.n) },
            { rotulo: 'Ruins nos dois', valor: String(res.grupos.ambos.length) },
          ],
          topicos: res.leitura,
          secoes: [{
            titulo: 'Bairros', tipo: 'tabela', colunas: ['Bairro', `${res.a.nome} (${res.a.unidade})`, `${res.b.nome} (${res.b.unidade})`, 'Grupo'],
            linhas: GC.data.bairros.map((b) => { const x = res.pontos.find((y) => y.id === b.id); return [b.nome, val(res.a, x && x.a), val(res.b, x && x.b), x ? GRUPO[x.grupo] : 'sem dado']; }),
          }],
          fontes: res.fontes,
          nome: `cruzamento-${res.a.id}-${res.b.id}`,
        };
      },
      formatos: () => ['xlsx', 'csv'],
      texto: (d) => d.titulo,
    });
  }

  const original = GC.ia.perguntar;
  GC.ia.perguntar = function (texto, contexto = {}) {
    return cruzarPedido(texto, contexto) || original(texto, contexto);
  };
})(window.GC = window.GC || {});
