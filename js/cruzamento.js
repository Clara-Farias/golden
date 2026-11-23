(function (GC) {
  // Cruzamento de dados por bairro (motor, sem DOM). Usado pela tela #/cruzamento e pela Maia.
  // A pergunta é "onde as duas coisas estão ruins ao mesmo tempo?": cada bairro é um ponto, com os números que as
  // outras telas já mostram (histórico de 30 dias, satisfação, B.O.s, frequência escolar, área de risco, UBS, coleta,
  // CadÚnico). Nada é inventado para o cruzamento: cada indicador lê a mesma fonte do widget e do popup do bairro.
  // Contagens vêm por mil habitantes (senão o bairro mais populoso ganha sempre).
  // A relação é a de Spearman (pela ordem dos bairros): um bairro fora da curva não domina a conta.
  const D = () => GC.data;
  const soma = (l) => l.reduce((s, n) => s + n, 0);
  const media = (l) => (l.length ? soma(l) / l.length : 0);
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const area = (id) => D().areas.find((a) => a.id === id);
  const porMil = (n, b) => (b.populacao ? (n * 1000) / b.populacao : null);
  const doHistorico = (areas) => () => Object.fromEntries(D().bairros.map((b) => [b.id, r2(porMil(soma(areas().map((a) => (D().historico30d[a] || {})[b.id] || 0)), b))]));

  // ---- indicadores ----
  // { id, nome, curto, unidade, area (null = contexto, todo perfil vê), ruim: 'alto' | 'baixo', fonte, chaves,
  //   valores(ctx) → { bairroId: número | null }, serie? → a série mensal da cidade (12 meses) do mesmo conceito }
  function indicadores() {
    const d = D();
    const lista = [
      { id: 'casos', nome: 'Casos registrados em 30 dias', curto: 'casos registrados', unidade: 'por mil hab.', area: null, ruim: 'alto',
        fonte: 'Histórico das secretarias (30 dias)', chaves: ['casos', 'registros'], valores: doHistorico(() => d.areas.map((a) => a.id)) },
      { id: 'abertas', nome: 'Ocorrências abertas agora', curto: 'ocorrências abertas', unidade: 'por mil hab.', area: null, ruim: 'alto',
        fonte: 'Ocorrências em aberto', chaves: ['abertas', 'em aberto', 'ocorrencias abertas', 'ocorrencia'],
        valores: (ctx) => {
          const abertas = (ctx.ocorrencias || []).filter((o) => !ctx.areas || ctx.areas.includes(o.area));
          return Object.fromEntries(d.bairros.map((b) => [b.id, r2(porMil(abertas.filter((o) => o.bairroId === b.id).length, b))]));
        } },
      { id: 'satisfacao', nome: 'Satisfação dos moradores', curto: 'satisfação', unidade: '%', area: null, ruim: 'baixo',
        fonte: 'Ouvidoria · pesquisa de satisfação', chaves: ['satisfa', 'aprovacao', 'moradores'], valores: () => Object.assign({}, d.satisfacaoPorBairro) },
      { id: 'populacao', nome: 'População', curto: 'população', unidade: 'moradores', area: null, ruim: 'alto',
        fonte: 'Planejamento · bairros', chaves: ['populacao', 'habitantes', 'moradores por bairro'], valores: () => Object.fromEntries(d.bairros.map((b) => [b.id, b.populacao])) },
      // Um indicador de casos para cada secretaria (o recorte do gestor do setor).
      ...d.areas.map((a) => ({
        id: `casos_${a.id}`, nome: `Casos de ${a.nome} em 30 dias`, curto: `casos de ${a.nome}`, unidade: 'por mil hab.', area: a.id, ruim: 'alto',
        fonte: `Histórico da ${a.secretaria.nome} (30 dias)`, chaves: CHAVES_AREA[a.id] || [GC.ia ? GC.ia.normalizar(a.nome) : a.nome.toLowerCase()],
        valores: doHistorico(() => [a.id]),
        serie: () => (SERIE_MESMA[a.id] ? d.secretarias[a.id].serie : null),
      })),
      { id: 'bos', nome: 'B.O.s em 30 dias', curto: 'B.O.s', unidade: 'por mil hab.', area: 'seguranca', ruim: 'alto',
        fonte: 'Boletins de ocorrência (Polícia Civil) + Guarda Municipal', chaves: ['b.o', 'bos', 'boletim', 'crime', 'roubo', 'furto'],
        valores: () => Object.fromEntries(d.bairros.map((b) => [b.id, r2(porMil(((d.seguranca || {}).porBairro30d || {})[b.id] || 0, b))])),
        serie: () => d.secretarias.seguranca && d.secretarias.seguranca.serie },
      { id: 'frequencia', nome: 'Frequência escolar', curto: 'frequência escolar', unidade: '%', area: 'educacao', ruim: 'baixo',
        fonte: 'Diário de classe eletrônico', chaves: ['frequencia escolar', 'frequencia', 'falta escolar', 'evasao'],
        valores: () => Object.assign({}, (d.series || {}).frequenciaEscolar || {}),
        serie: () => d.secretarias.educacao && d.secretarias.educacao.serie },
      { id: 'risco', nome: 'Famílias em área de risco', curto: 'famílias em área de risco', unidade: 'por mil hab.', area: 'defesa_civil', ruim: 'alto',
        fonte: 'Mapeamento de áreas de risco da Defesa Civil', chaves: ['area de risco', 'familias em risco', 'encosta', 'deslizamento'],
        valores: () => {
          const areas = (d.risco && d.risco.areas) || [];
          return Object.fromEntries(d.bairros.map((b) => [b.id, r2(porMil(soma(areas.filter((x) => x.bairroId === b.id).map((x) => x.familias)), b))]));
        } },
      { id: 'ubs', nome: 'Lotação das UBS', curto: 'lotação das UBS', unidade: '%', area: 'saude', ruim: 'alto',
        fonte: 'Prontuário e agenda das UBS', chaves: ['lotacao', 'ubs', 'posto de saude'],
        // Só os bairros com UBS têm o número; os outros ficam sem dado (não viram zero).
        valores: () => Object.fromEntries(d.bairros.map((b) => { const u = ((d.series || {}).lotacaoUbs || []).find((x) => x.bairroId === b.id); return [b.id, u ? u.pct : null]; })) },
      { id: 'coleta', nome: 'Coleta no prazo', curto: 'coleta no prazo', unidade: '%', area: 'limpeza', ruim: 'baixo',
        fonte: 'GPS dos caminhões de coleta', chaves: ['coleta no prazo', 'coleta', 'lixo'],
        valores: () => Object.fromEntries(d.bairros.map((b) => {
          const rs = ((d.coleta || {}).rotas || []).filter((r) => r.bairros.includes(b.id));
          return [b.id, rs.length ? r1(media(rs.map((r) => r.noPrazoPct))) : null];
        })),
        serie: () => d.secretarias.limpeza && d.secretarias.limpeza.serie },
    ];
    if (GC.social) {
      const sb = () => Object.fromEntries(GC.social.resumo().bairros.map((b) => [b.id, b]));
      lista.push(
        { id: 'vulnerabilidade', nome: 'Vulnerabilidade social (CadÚnico)', curto: 'vulnerabilidade social', unidade: 'índice 0 a 100', area: null, ruim: 'alto',
          fonte: 'Cadastro Único (Assistência Social)', chaves: ['vulnerab', 'cadunico', 'pobreza', 'social'],
          valores: () => { const s = sb(); return Object.fromEntries(d.bairros.map((b) => [b.id, s[b.id] ? Math.round(s[b.id].vulnerabilidade * 100) : null])); } },
        { id: 'faltas', nome: 'Faltas em consultas (famílias vulneráveis)', curto: 'faltas em consultas', unidade: '%', area: 'saude', ruim: 'alto',
          fonte: 'CadÚnico × agenda das UBS', chaves: ['faltas em consulta', 'falta em consulta', 'faltas'],
          valores: () => { const s = sb(); return Object.fromEntries(d.bairros.map((b) => [b.id, s[b.id] ? s[b.id].taxaPct : null])); } },
      );
    }
    return lista;
  }
  // Palavras de cada secretaria para a Maia achar o indicador ("cruze alagamentos com ...").
  const CHAVES_AREA = {
    infraestrutura: ['energia', 'queda de luz', 'iluminacao', 'infraestrutura'],
    defesa_civil: ['alaga', 'enchente', 'defesa civil'],
    saude: ['casos de saude', 'atendimentos de saude', 'saude'],
    educacao: ['casos de educacao', 'escola'],
    seguranca: ['casos de seguranca', 'seguranca', 'violencia'],
    mobilidade: ['transito', 'mobilidade', 'acidente'],
    limpeza: ['limpeza', 'lixo acumulado', 'entulho'],
  };
  // Séries mensais da cidade que medem o mesmo que os casos da secretaria (as outras medem outra coisa:
  // espera, frequência, deslocamento, coleta no prazo, e não entram na linha do tempo como "casos").
  const SERIE_MESMA = { infraestrutura: true, defesa_civil: true };

  // Indicadores que o perfil pode cruzar: o gestor geral, todos; o do setor, os da pasta e os de contexto.
  function disponiveis(perfil = GC.perfil) {
    const todos = indicadores();
    const visao = perfil ? GC.visaoDe(perfil) : 'cidade';
    if (visao === 'cidade') return todos;
    if (visao === 'portal') return [];
    return todos.filter((i) => !i.area || i.area === perfil.area);
  }
  const indicador = (id) => indicadores().find((i) => i.id === id) || null;

  // ---- estatística ----
  // Postos com empate (média dos postos): base do Spearman.
  function postos(valores) {
    const ord = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = Array(valores.length);
    for (let i = 0; i < ord.length;) {
      let j = i;
      while (j + 1 < ord.length && ord[j + 1][0] === ord[i][0]) j++;
      const p = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[ord[k][1]] = p;
      i = j + 1;
    }
    return out;
  }
  function pearson(xs, ys) {
    if (xs.length < 3) return null;
    const mx = media(xs); const my = media(ys);
    let sxy = 0; let sxx = 0; let syy = 0;
    xs.forEach((x, k) => { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) ** 2; syy += (ys[k] - my) ** 2; });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const spearman = (xs, ys) => { const r = pearson(postos(xs), postos(ys)); return r == null ? null : r2(r); };
  // Mediana (ponto de corte dos grupos).
  const mediana = (l) => { const s = l.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // Força em palavras. Com poucos bairros, a mesma conta vale menos: abaixo de 8 bairros, nem se mede.
  function forca(r, n) {
    if (r == null || n < 8) return { nivel: 'nd', rotulo: 'poucos bairros para medir' };
    const a = Math.abs(r);
    const sentido = r > 0 ? 'direta' : 'inversa';
    if (a >= 0.6) return { nivel: 'forte', rotulo: `forte, ${sentido}`, sentido };
    if (a >= 0.35) return { nivel: 'moderada', rotulo: `moderada, ${sentido}`, sentido };
    if (a >= 0.15) return { nivel: 'fraca', rotulo: `fraca, ${sentido}`, sentido };
    return { nivel: 'nenhuma', rotulo: 'sem relação clara', sentido: null };
  }

  function formatar(i, v) {
    if (v == null) return 'sem dado';
    const casas = i.unidade === 'por mil hab.' ? 2 : i.unidade === '%' ? 1 : 0;
    const n = Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
    if (i.unidade === '%') return `${n}%`;
    if (i.unidade === 'moradores') return `${n} moradores`;
    if (i.unidade === 'índice 0 a 100') return `índice ${n}`;
    return `${n} ${i.unidade}`;
  }
  const rTexto = (r) => String(r).replace('.', ',');

  // Grupos dos bairros pelas medianas da cidade: ruim nos dois, só em A, só em B, bom nos dois.
  // "Ruim" segue o sentido do indicador (satisfação ruim é baixa; casos ruins são altos).
  const GRUPOS = {
    ambos: { rotulo: 'Ruim nos dois' },
    soA: { rotulo: 'Ruim só no 1º' },
    soB: { rotulo: 'Ruim só no 2º' },
    nenhum: { rotulo: 'Bem nos dois' },
  };

  // Linha do tempo (só quando os dois têm série mensal do mesmo conceito): índice com o 1º mês = 100 e a defasagem
  // (B depois de A em 1 mês) quando ela explica melhor do que o mesmo mês.
  function tempo(A, B) {
    const sa = A.serie && A.serie();
    const sb = B.serie && B.serie();
    if (!sa || !sb) return null;
    const ind = (s) => s.meses.map((v) => Math.round((v / (s.meses[0] || 1)) * 100));
    const mesmoMes = spearman(sa.meses, sb.meses);
    const depois = spearman(sa.meses.slice(0, -1), sb.meses.slice(1));
    const defasado = depois != null && mesmoMes != null && Math.abs(depois) >= Math.abs(mesmoMes) + 0.15;
    return { rotulos: (D().mesesSerie || []).slice(), a: ind(sa), b: ind(sb), rotuloA: sa.rotulo, rotuloB: sb.rotulo, r: mesmoMes, rDefasado: depois, defasado };
  }

  // cruzar('bos', 'casos_infraestrutura', { ocorrencias, areas }) → pontos, relação, grupos e a leitura em frases.
  function cruzar(aId, bId, ctx = {}) {
    const A = indicador(aId);
    const B = indicador(bId);
    if (!A || !B || A.id === B.id) return null;
    const va = A.valores(ctx);
    const vb = B.valores(ctx);
    const todos = D().bairros.map((b) => ({ id: b.id, nome: b.nome, a: va[b.id] ?? null, b: vb[b.id] ?? null }));
    const pontos = todos.filter((p) => p.a != null && p.b != null);
    const semDado = todos.filter((p) => p.a == null || p.b == null);
    const n = pontos.length;
    const r = n >= 3 ? spearman(pontos.map((p) => p.a), pontos.map((p) => p.b)) : null;
    const f = forca(r, n);
    const ma = n ? mediana(pontos.map((p) => p.a)) : null;
    const mb = n ? mediana(pontos.map((p) => p.b)) : null;
    const ruim = (i, v, m) => (i.ruim === 'alto' ? v > m : v < m);
    pontos.forEach((p) => {
      const ra = ruim(A, p.a, ma); const rb = ruim(B, p.b, mb);
      p.grupo = ra && rb ? 'ambos' : ra ? 'soA' : rb ? 'soB' : 'nenhum';
    });
    // Ordem dentro do grupo: os mais extremos primeiro (soma dos postos no sentido "ruim").
    const pa = postos(pontos.map((p) => (A.ruim === 'alto' ? p.a : -p.a)));
    const pb = postos(pontos.map((p) => (B.ruim === 'alto' ? p.b : -p.b)));
    pontos.forEach((p, k) => { p.peso = pa[k] + pb[k]; p.postoA = pa[k]; p.postoB = pb[k]; });
    const grupo = (g) => pontos.filter((p) => p.grupo === g).sort((x, y) => y.peso - x.peso);
    const grupos = Object.fromEntries(Object.keys(GRUPOS).map((g) => [g, grupo(g)]));
    // Fora do padrão: entre os 5 piores num indicador e na metade boa do outro (o outro não explica).
    const fora = pontos.filter((p) => (p.postoB > n - 5 && p.postoA <= n / 2) || (p.postoA > n - 5 && p.postoB <= n / 2));

    const leitura = [];
    const nomes = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || '');
    if (f.nivel === 'nd') leitura.push(`Só ${n} ${n === 1 ? 'bairro tem' : 'bairros têm'} os dois números: poucos para medir a relação.`);
    else if (f.nivel === 'nenhuma') leitura.push(`Nos ${n} bairros, ${A.curto} e ${B.curto} não andam juntos (ρ = ${rTexto(r)}).`);
    else {
      const pioraJunto = (f.sentido === 'direta') === (A.ruim === B.ruim);
      leitura.push(`Relação ${f.rotulo} nos ${n} bairros (ρ = ${rTexto(r)}): ${pioraJunto ? `onde ${A.curto} está pior, ${B.curto} também tende a estar` : `os dois tendem a ir em sentidos opostos: onde um está pior, o outro tende a estar melhor`}.`);
    }
    if (grupos.ambos.length) leitura.push(`Ruins nos dois: ${nomes(grupos.ambos.slice(0, 5).map((p) => p.nome))}${grupos.ambos.length > 5 ? ` e mais ${grupos.ambos.length - 5}` : ''}.`);
    else leitura.push('Nenhum bairro está do lado ruim nos dois ao mesmo tempo.');
    if (fora.length) leitura.push(`Fora do padrão: ${nomes(fora.slice(0, 3).map((p) => p.nome))}. ${fora.length === 1 ? 'Ali' : 'Nesses bairros'}, um dos números está entre os piores sem o outro acompanhar: a causa deve estar em outro lugar.`);
    if (semDado.length) leitura.push(`Sem dado em ${semDado.length} ${semDado.length === 1 ? 'bairro' : 'bairros'} (${[A, B].some((i) => i.id === 'ubs') ? 'sem UBS no bairro' : [A, B].some((i) => i.id === 'coleta') ? 'sem rota de coleta medida' : 'sem medição'}).`);
    leitura.push('Andar junto não prova que um causa o outro.');

    return {
      a: A, b: B, n, r, forca: f, medianaA: ma, medianaB: mb, pontos, semDado, grupos, fora, leitura, tempo: tempo(A, B),
      fontes: [A.fonte, B.fonte].filter((x, k, l) => l.indexOf(x) === k),
    };
  }

  // Pares prontos (atalhos da tela e da Maia), filtrados pelo perfil.
  const PRONTOS = [
    ['satisfacao', 'abertas', 'Satisfação × ocorrências abertas'],
    ['bos', 'casos_infraestrutura', 'B.O.s × quedas de energia'],
    ['casos_defesa_civil', 'risco', 'Alagamentos × famílias em área de risco'],
    ['frequencia', 'vulnerabilidade', 'Frequência escolar × vulnerabilidade'],
    ['faltas', 'vulnerabilidade', 'Faltas em consultas × vulnerabilidade'],
    ['coleta', 'satisfacao', 'Coleta no prazo × satisfação'],
  ];
  function prontos(perfil = GC.perfil) {
    const ok = new Set(disponiveis(perfil).map((i) => i.id));
    const lista = PRONTOS.filter(([a, b]) => ok.has(a) && ok.has(b)).map(([a, b, rotulo]) => ({ a, b, rotulo }));
    // Gestor do setor: os casos da pasta × satisfação vem primeiro.
    if (perfil && GC.visaoDe(perfil) === 'pasta' && ok.has(`casos_${perfil.area}`)) lista.unshift({ a: `casos_${perfil.area}`, b: 'satisfacao', rotulo: `${area(perfil.area).nome} × satisfação` });
    return lista;
  }

  // Lê "cruze B.O.s com quedas de energia" → { a, b } (os dois indicadores na ordem em que aparecem), ou null.
  function interpretar(texto, perfil = GC.perfil) {
    const norm = (t) => ` ${String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')} `;
    const q = norm(texto);
    // Cada casamento ocupa um trecho do pedido; um trecho só vale para um indicador. No mesmo ponto, a chave mais
    // longa ganha ("casos de saude" é da Saúde, não de "casos"; "coleta no prazo" não é "coleta" duas vezes).
    const casos = [];
    disponiveis(perfil).forEach((i) => i.chaves.forEach((k) => {
      for (let p = q.indexOf(k); p >= 0; p = q.indexOf(k, p + 1)) casos.push({ id: i.id, ini: p, fim: p + k.length });
    }));
    casos.sort((x, y) => x.ini - y.ini || (y.fim - y.ini) - (x.fim - x.ini));
    const aceitos = [];
    casos.forEach((c) => {
      if (aceitos.some((x) => x.id === c.id || (c.ini < x.fim && x.ini < c.fim))) return;
      aceitos.push(c);
    });
    aceitos.sort((x, y) => x.ini - y.ini);
    return aceitos.length >= 2 ? { a: aceitos[0].id, b: aceitos[1].id } : null;
  }

  // A camada do mapa principal (contrato: mapa.tipo 'grupos'): todo bairro com os dois números pintado pelo grupo,
  // com a legenda dizendo qual é o 1º e qual é o 2º.
  // Nomes dos grupos com os indicadores escritos ("Ruim só em B.O.s"): ninguém precisa lembrar qual é o 1º.
  const rotulos = (res) => ({ ambos: 'Ruim nos dois', soA: `Ruim só em ${res.a.curto}`, soB: `Ruim só em ${res.b.curto}`, nenhum: 'Bem nos dois' });
  const mapa = (res) => ({
    tipo: 'grupos',
    grupos: Object.fromEntries(res.pontos.map((p) => [p.id, p.grupo])),
    rotulos: rotulos(res),
    // Título curto: com a Maia aberta, a barra do mapa quebra em duas linhas e uma legenda larga cobre os botões.
    legenda: `${res.a.curto.charAt(0).toUpperCase()}${res.a.curto.slice(1)} × ${res.b.curto}`,
  });

  GC.cruzamento = { indicadores: disponiveis, indicador, cruzar, prontos, interpretar, formatar, spearman, mapa, rotulos, GRUPOS };
})(window.GC = window.GC || {});
