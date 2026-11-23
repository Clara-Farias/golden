(function (GC) {
  // Linha do tempo além dos alertas: leitos, B.O.s, obras, frota e coleta num instante do último ano, e a
  // comparação de dois períodos (de 1 a GC.MAX_DIAS_COMPARAR dias). Mesmo princípio do histórico dos alertas
  // (js/linha-tempo.js): cidade fictícia, sem registro real do passado, então cada dia é simulado de forma
  // determinística a partir dos números de hoje e das séries mensais de cada domínio. Em "agora" o valor
  // simulado é o de hoje: a linha do tempo não salta ao voltar ao vivo. Puro: sem DOM, testável em Node.
  const DIA = 86400000;
  const HORA = 3600000;

  // Número entre 0 e 1 fixo para cada texto (FNV-1a + mistura): o mesmo dia dá sempre o mesmo valor.
  function ruido(chave) {
    let h = 2166136261;
    for (let i = 0; i < chave.length; i++) { h ^= chave.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const doisDig = (n) => String(n).padStart(2, '0');
  // "2026-11-05" do dia (local) do instante t.
  const isoDia = (t) => { const d = new Date(t); return `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`; };
  const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
  const media = (lista) => (lista.length ? lista.reduce((s, n) => s + n, 0) / lista.length : 0);
  const umaCasa = (n) => Math.round(n * 10) / 10;

  // Valor da série mensal no mês de t (a série fecha no mês passado; o mês corrente usa o último ponto e,
  // antes do começo da série, fica o primeiro). Devolve a razão para o último ponto (1 = como hoje).
  function fatorMes(valores, t, agora) {
    const a = new Date(agora);
    const d = new Date(t);
    const mesesAtras = (a.getFullYear() * 12 + a.getMonth()) - (d.getFullYear() * 12 + d.getMonth());
    const i = limitar(valores.length - Math.max(1, mesesAtras), 0, valores.length - 1);
    return valores[i] / valores[valores.length - 1];
  }

  // ---- Leitos ----
  // Ocupação no instante: a de hoje + a diferença da série mensal + a curva do dia (pico no fim da tarde) +
  // um desvio de cada unidade em cada dia, menos o mesmo cálculo em agora (em agora, dá a ocupação de hoje).
  function desvioLeitos(u, t, agora) {
    const serie = GC.data.leitos.serie.meses;
    const mes = (fatorMes(serie, t, agora) - 1) * serie[serie.length - 1];
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    const curva = 3 * Math.cos((2 * Math.PI * (h - 17)) / 24);
    const dia = (ruido(`leito|${u.id}|${isoDia(t)}`) - 0.5) * 9;
    return mes + curva + dia;
  }
  GC.leitosEm = function (t, agora) {
    const unidades = GC.data.leitos.unidades.map((u) => {
      const delta = (desvioLeitos(u, t, agora) - desvioLeitos(u, agora, agora)) / 100;
      return Object.assign({}, u, {
        grupos: u.grupos.map((g) => Object.assign({}, g, { ocupados: limitar(Math.round(g.ocupados + g.total * delta), 0, g.total) })),
        // Atendimentos do dia até a hora de t (o de hoje é o total do dia até agora).
        atendimentosHoje: Object.fromEntries(Object.entries(u.atendimentosHoje).map(([k, n]) => {
          const fracao = limitar((t - GC.inicioDoDia(t)) / DIA, 0.02, 1) / limitar((agora - GC.inicioDoDia(agora)) / DIA, 0.02, 1);
          return [k, Math.round(n * Math.min(fracao, 2.5) * (0.8 + 0.4 * ruido(`atend|${u.id}|${k}|${isoDia(t)}`)))];
        })),
      });
    });
    return GC.leitos.resumo(unidades);
  };

  // ---- Segurança (B.O.s) ----
  // B.O.s de um dia por bairro: a média diária dos 30 dias × o mês na série de criminalidade × um sorteio
  // do dia (0,7 a 1,3), repartidos pelo peso de cada bairro (com um desvio do bairro naquele dia).
  const cacheBO = new Map();
  function boDoDia(inicio, agora) {
    const chave = `${inicio}|${GC.inicioDoDia(agora)}`;
    if (cacheBO.has(chave)) return cacheBO.get(chave);
    const d = GC.data.seguranca;
    const total30 = Object.values(d.porBairro30d).reduce((s, n) => s + n, 0);
    const iso = isoDia(inicio);
    const totalDia = (total30 / 30) * fatorMes(GC.data.series.criminalidadeMensal.valores, inicio, agora) * (0.7 + 0.6 * ruido(`bo|${iso}`));
    const porBairro = {};
    Object.entries(d.porBairro30d).forEach(([b, n]) => {
      porBairro[b] = Math.round(totalDia * (n / total30) * (0.6 + 0.8 * ruido(`bo|${b}|${iso}`)));
    });
    cacheBO.set(chave, porBairro);
    return porBairro;
  }
  // Os B.O.s entre ini e fim (o dia de fim entra só até a hora, em proporção).
  function boEntre(ini, fim, agora) {
    const porBairro = {};
    for (let dia = GC.inicioDoDia(ini); dia < fim; dia = GC.inicioDoDia(dia + DIA + HORA)) {
      const fracao = limitar((Math.min(fim, dia + DIA) - Math.max(ini, dia)) / DIA, 0, 1);
      Object.entries(boDoDia(dia, agora)).forEach(([b, n]) => { porBairro[b] = (porBairro[b] || 0) + n * fracao; });
    }
    Object.keys(porBairro).forEach((b) => { porBairro[b] = Math.round(porBairro[b]); });
    return { porBairro, total: Object.values(porBairro).reduce((s, n) => s + n, 0) };
  }
  // No instante: os 30 dias até t (o mesmo período do mapa de calor ao vivo) e o dia de t até a hora.
  GC.boEm = function (t, agora) {
    const trinta = boEntre(t - 30 * DIA, t, agora);
    return { porBairro30d: trinta.porBairro, total30d: trinta.total, noDia: boEntre(GC.inicioDoDia(t), t, agora).total };
  };

  // ---- Obras ----
  // A obra no dia de t: antes do início ela não existe; entre o início e o último avanço registrado, o
  // avanço e o gasto crescem em linha reta; depois, ficam os de hoje. A situação (atrasada, paralisada…)
  // sai do avaliar de js/data-obras.js com a data de t.
  GC.obrasEm = function (t, setor = null) {
    const hoje = isoDia(t);
    const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const lista = GC.data.obras.obras.filter((ob) => ob.inicio <= hoje).map((ob) => {
      if (hoje >= ob.ultimoAvanco) return ob;
      const fracao = limitar((dia(hoje) - dia(ob.inicio)) / Math.max(DIA, dia(ob.ultimoAvanco) - dia(ob.inicio)), 0, 1);
      return Object.assign({}, ob, {
        avancoPct: Math.round(ob.avancoPct * fracao),
        gastoMi: umaCasa(ob.gastoMi * fracao),
        ultimoAvanco: hoje,
        // A previsão nova só aparece depois de vencida a original (antes, ninguém sabia do atraso).
        previsaoAtual: hoje <= ob.previsaoOriginal ? ob.previsaoOriginal : ob.previsaoAtual,
      });
    });
    return GC.obras.resumo(setor, hoje, lista);
  };

  // ---- Frota e coleta (só números do dia, para a comparação e a faixa do instante) ----
  GC.frotaEm = function (t, agora = t) {
    const r = GC.frota.resumo();
    const iso = isoDia(t);
    const hoje = isoDia(agora) === iso;
    const desvio = hoje ? 0 : (ruido(`frota|${iso}`) - 0.45) * 10;
    return {
      disponibilidadePct: limitar(Math.round(r.onibus.disponibilidadePct + desvio), 60, 100),
      viagensPct: limitar(Math.round(r.onibus.viagensPct + (hoje ? 0 : (ruido(`viagens|${iso}`) - 0.45) * 8)), 60, 100),
      tempoRespostaMin: Math.max(5, Math.round(r.ambulancias.tempoRespostaMin + (hoje ? 0 : (ruido(`samu|${iso}`) - 0.5) * 6))),
    };
  };
  GC.coletaEm = function (t, agora = t) {
    const r = GC.coleta.resumo();
    const iso = isoDia(t);
    const hoje = isoDia(agora) === iso;
    return { noPrazoPct: limitar(Math.round(r.noPrazoPct + (hoje ? 0 : (ruido(`coleta|${iso}`) - 0.4) * 10)), 50, 100) };
  };

  // ---- Faixa do instante ----
  // O que a barra da linha do tempo mostra além dos alertas: leitos, B.O.s do dia, obras atrasadas e frota.
  GC.indicadoresEm = function (t, agora) {
    const leitos = GC.data.leitos ? GC.leitosEm(t, agora) : null;
    const bo = GC.data.seguranca ? GC.boEm(t, agora) : null;
    const obras = GC.data.obras ? GC.obrasEm(t) : null;
    const frota = GC.data.frota ? GC.frotaEm(t, agora) : null;
    return { leitos, bo, obras, frota };
  };

  // ======================= Comparar dois períodos =======================
  // Período = { tipo, inicio, ate, fim, dias }: de `inicio` até o fim do dia `ate` (hoje termina em agora,
  // não à meia-noite). Qualquer tamanho de 1 a GC.MAX_DIAS_COMPARAR dias; tipo é 'dia', 'semana' ou 'mes'
  // quando tem 1, 7 ou 30 dias (só rótulo) e 'livre' no resto.
  GC.TIPOS_PERIODO = { dia: { dias: 1, rotulo: 'Dia' }, semana: { dias: 7, rotulo: '7 dias' }, mes: { dias: 30, rotulo: '30 dias' } };
  GC.MAX_DIAS_COMPARAR = 92;
  const diaMais = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
  GC.periodoEntre = function (inicio, ate, agora) {
    const i = GC.inicioDoDia(Math.min(inicio, ate));
    const a = GC.inicioDoDia(Math.max(inicio, ate));
    const fimDia = diaMais(a, 1);
    const dias = Math.round((fimDia - i) / DIA);
    const tipo = (Object.entries(GC.TIPOS_PERIODO).find(([, t]) => t.dias === dias) || ['livre'])[0];
    return { tipo, ate: a, inicio: i, fim: Math.min(fimDia, agora), dias };
  };
  // n dias terminando no dia `ate`.
  GC.periodoDeDias = function (n, ate, agora) {
    return GC.periodoEntre(diaMais(ate, -(Math.max(1, n) - 1)), ate, agora);
  };
  GC.periodo = function (tipo, ate, agora) {
    return GC.periodoDeDias((GC.TIPOS_PERIODO[tipo] || GC.TIPOS_PERIODO.dia).dias, ate, agora);
  };
  // O período do mesmo tamanho logo antes.
  GC.periodoAnterior = function (p, agora) {
    return GC.periodoDeDias(p.dias, diaMais(p.inicio, -1), agora);
  };
  // Encaixa o período dentro de [min, max] (início do primeiro e do último dia possíveis), sem mudar o tamanho.
  GC.encaixarPeriodo = function (p, min, max, agora) {
    if (p.inicio < min) return GC.periodoDeDias(p.dias, diaMais(min, p.dias - 1), agora);
    if (p.ate > max) return GC.periodoDeDias(p.dias, max, agora);
    return p;
  };

  // Atalhos do período principal (o que termina no dia da régua): Hoje, Ontem, últimos 7 e 30 dias, este
  // mês e o mês passado. Devolve [{ id, rotulo, inicio, ate }].
  GC.atalhosPeriodo = function (agora) {
    const hoje = GC.inicioDoDia(agora);
    const d = new Date(hoje);
    const inicioMes = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return [
      { id: 'hoje', rotulo: 'Hoje', inicio: hoje, ate: hoje },
      { id: 'ontem', rotulo: 'Ontem', inicio: diaMais(hoje, -1), ate: diaMais(hoje, -1) },
      { id: 'ult7', rotulo: 'Últimos 7 dias', inicio: diaMais(hoje, -6), ate: hoje },
      { id: 'ult30', rotulo: 'Últimos 30 dias', inicio: diaMais(hoje, -29), ate: hoje },
      { id: 'esteMes', rotulo: 'Este mês', inicio: inicioMes, ate: hoje },
      { id: 'mesPassado', rotulo: 'Mês passado', inicio: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), ate: diaMais(inicioMes, -1) },
    ];
  };

  // Com o que comparar, conforme o tamanho do período. Só as que dão um período diferente: "Semana passada"
  // só para períodos de até 6 dias e "Mês passado" só abaixo de 28 dias (acima disso cairiam em cima do
  // "Logo antes" ou do próprio período). A escolha no calendário é o modo 'livre', resolvido na tela.
  GC.referenciasComparar = function (dias) {
    const refs = [{ id: 'anterior', rotulo: dias === 1 ? 'Dia anterior' : `${dias} dias anteriores`, titulo: 'O período do mesmo tamanho logo antes' }];
    if (dias < 7) refs.push({ id: 'semana', rotulo: 'Semana passada', titulo: dias === 1 ? 'O mesmo dia da semana, 7 dias antes' : 'Os mesmos dias da semana, 7 dias antes' });
    if (dias < 28) refs.push({ id: 'mes', rotulo: 'Mês passado', titulo: 'Os mesmos dias, um mês antes' });
    return refs;
  };
  // O modo vale para o tamanho? Senão, volta ao período anterior.
  GC.referenciaValida = function (dias, modo) {
    if (modo === 'livre') return 'livre';
    return GC.referenciasComparar(dias).some((r) => r.id === modo) ? modo : 'anterior';
  };
  // O período de comparação de pa pelo modo (anterior, semana, mes), do mesmo tamanho.
  GC.periodoReferencia = function (pa, modo, agora) {
    if (modo === 'semana') return GC.periodoDeDias(pa.dias, diaMais(pa.ate, -7), agora);
    if (modo === 'mes') return GC.periodoDeDias(pa.dias, GC.mesesAntes(pa.ate, 1), agora);
    return GC.periodoAnterior(pa, agora);
  };

  // Linha de apoio de cada cartão: quantos dias o período tem e, para a comparação, onde ela fica em
  // relação ao período (para ninguém precisar contar se há dia faltando ou repetido entre os dois).
  // "30 dias · até agora" | "30 dias · logo antes, sem intervalo" | "7 dias · intervalo de 24 dias" | "7 dias · 3 dias em comum".
  GC.detalhePeriodo = function (p, agora, base = null) {
    const dias = `${p.dias} ${p.dias === 1 ? 'dia' : 'dias'}`;
    // Cortado em agora: o fim cai no próprio último dia (o período inteiro termina na meia-noite seguinte).
    if (!base) return GC.inicioDoDia(p.fim) === p.ate ? `${dias} · até agora` : dias;
    if (p.fim === base.inicio) return `${dias} · logo antes, sem intervalo`;
    if (base.fim === p.inicio) return `${dias} · logo depois, sem intervalo`;
    const contar = (de, ate) => Math.round((GC.inicioDoDia(ate) - GC.inicioDoDia(de)) / (24 * 3600000));
    if (p.inicio < base.fim && base.inicio < p.fim) {
      const comum = contar(Math.max(p.inicio, base.inicio), Math.min(p.fim, base.fim) + 3600000 * 23);
      return `${dias} · ${comum} ${comum === 1 ? 'dia' : 'dias'} em comum`;
    }
    const vao = p.ate < base.ate ? contar(p.ate, base.inicio) - 1 : contar(base.ate, p.inicio) - 1;
    return `${dias} · intervalo de ${vao} ${vao === 1 ? 'dia' : 'dias'}`;
  };

  // "05/11", "30/10 a 05/11", "07/10 a 05/11/26" (outro ano leva o ano).
  GC.rotuloPeriodo = function (p, agora) {
    const curto = (t) => {
      const d = new Date(t);
      const ano = d.getFullYear() !== new Date(agora).getFullYear() ? `/${String(d.getFullYear()).slice(-2)}` : '';
      return `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}${ano}`;
    };
    return p.dias === 1 ? GC.rotuloDia(p.ate, agora) : `${curto(p.inicio)} a ${curto(p.ate)}`;
  };

  // Instantes de amostra no período (4 por dia: 3h, 9h, 15h e 21h), sem passar de agora.
  function amostras(p, agora) {
    const ts = [];
    for (let dia = p.inicio; dia < p.fim; dia = GC.inicioDoDia(dia + DIA + HORA)) {
      [3, 9, 15, 21].forEach((h) => { const t = dia + h * HORA; if (t <= agora) ts.push(t); });
    }
    return ts.length ? ts : [Math.min(p.fim, agora) - 60000];
  }

  // Tudo o que um período resume. noFiltro(o) aplica os filtros do mapa aos alertas (secretaria, bairro).
  GC.resumoPeriodo = function (data, p, agora, ocorrencias = [], noFiltro = () => true) {
    // Alertas abertos no período: o histórico de cada dia (já cortado em agora) e as da sessão.
    const hist = [];
    for (let dia = p.inicio; dia < p.fim; dia = GC.inicioDoDia(dia + DIA + HORA)) hist.push(...GC.historicoDoDia(data, dia));
    const eventos = GC.historicoAte(hist, agora).filter((e) => e.abre >= p.inicio && e.abre < p.fim && noFiltro(e.o));
    const daSessao = ocorrencias.filter((o) => o.criadaEm >= p.inicio && o.criadaEm < p.fim && noFiltro(o));
    const alertas = [...eventos.map((e) => e.o), ...daSessao];
    const porArea = {};
    const porBairro = {};
    alertas.forEach((o) => {
      porArea[o.area] = (porArea[o.area] || 0) + 1;
      porBairro[o.bairroId] = (porBairro[o.bairroId] || 0) + 1;
    });
    // Tempo até resolver: as do histórico que fecharam e as da sessão já resolvidas.
    const horas = [...eventos.filter((e) => e.fecha <= agora).map((e) => (e.fecha - e.abre) / HORA),
      ...daSessao.filter((o) => o.resolvidaEm).map((o) => (o.resolvidaEm - o.criadaEm) / HORA)];

    const ts = amostras(p, agora);
    const leitos = data.leitos ? ts.map((t) => GC.leitosEm(t, agora)) : [];
    const dias = [];
    for (let dia = p.inicio; dia < p.fim; dia = GC.inicioDoDia(dia + DIA + HORA)) dias.push(Math.min(dia + DIA - 60000, agora));
    const obras = data.obras ? GC.obrasEm(dias[dias.length - 1] || p.ate) : null;
    const bo = data.seguranca ? boEntre(p.inicio, p.fim, agora) : null;
    return {
      periodo: p,
      alertas: {
        total: alertas.length,
        criticas: alertas.filter((o) => o.severidade === 'critica').length,
        porArea, porBairro,
        // Onde cada alerta abriu (os dois mapas lado a lado da comparação).
        pontos: alertas.filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng))
          .map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, severidade: o.severidade, titulo: o.titulo, bairroId: o.bairroId })),
        tempoMedioH: horas.length ? umaCasa(media(horas)) : null,
      },
      leitos: leitos.length ? { pct: Math.round(media(leitos.map((r) => r.pct))), utiPct: Math.round(media(leitos.map((r) => r.utiPct))) } : null,
      bo,
      obras: obras ? { atrasadas: obras.atrasadas, emAndamento: obras.emAndamento, concluidas: obras.concluidas } : null,
      frota: data.frota ? { disponibilidadePct: Math.round(media(dias.map((t) => GC.frotaEm(t, agora).disponibilidadePct))), tempoRespostaMin: Math.round(media(dias.map((t) => GC.frotaEm(t, agora).tempoRespostaMin))) } : null,
      coleta: data.coleta ? { noPrazoPct: Math.round(media(dias.map((t) => GC.coletaEm(t, agora).noPrazoPct))) } : null,
    };
  };

  // Variação de b para a (a é o período escolhido, b o de comparação). melhor: 'menos' ou 'mais'.
  function linha(id, rotulo, icone, a, b, melhor, unidade = '') {
    if (a === null || a === undefined || b === null || b === undefined) return null;
    const delta = umaCasa(a - b);
    const pct = b ? Math.round(((a - b) / b) * 100) : (a ? 100 : 0);
    const tom = delta === 0 ? 'igual' : (delta < 0) === (melhor === 'menos') ? 'melhor' : 'pior';
    return { id, rotulo, icone, a, b, delta, pct, tom, unidade };
  }

  // Comparação: linhas por domínio, secretarias e bairros com a variação dos alertas e os níveis para pintar
  // no mapa (só os bairros onde os alertas subiram: 1 a 4, como o telão).
  GC.compararPeriodos = function (data, pa, pb, agora, ocorrencias = [], noFiltro = () => true) {
    const a = GC.resumoPeriodo(data, pa, agora, ocorrencias, noFiltro);
    const b = GC.resumoPeriodo(data, pb, agora, ocorrencias, noFiltro);
    // Períodos de tamanhos diferentes não acontecem pela interface, mas a média por dia mantém a conta justa.
    const linhas = [
      linha('alertas', 'Alertas abertos', 'ti-alert-triangle', a.alertas.total, b.alertas.total, 'menos'),
      linha('criticas', 'Alertas críticos', 'ti-urgent', a.alertas.criticas, b.alertas.criticas, 'menos'),
      linha('resolver', 'Tempo médio até resolver', 'ti-clock-check', a.alertas.tempoMedioH, b.alertas.tempoMedioH, 'menos', ' h'),
      a.leitos && linha('leitos', 'Ocupação dos leitos', 'ti-bed', a.leitos.pct, b.leitos.pct, 'menos', '%'),
      a.leitos && linha('uti', 'Ocupação da UTI', 'ti-heartbeat', a.leitos.utiPct, b.leitos.utiPct, 'menos', '%'),
      a.bo && linha('bo', 'B.O.s registrados', 'ti-shield', a.bo.total, b.bo.total, 'menos'),
      a.obras && linha('obras', 'Obras atrasadas', 'ti-crane', a.obras.atrasadas, b.obras.atrasadas, 'menos'),
      a.frota && linha('frota', 'Ônibus disponíveis', 'ti-bus', a.frota.disponibilidadePct, b.frota.disponibilidadePct, 'mais', '%'),
      a.frota && linha('samu', 'Resposta do SAMU', 'ti-ambulance', a.frota.tempoRespostaMin, b.frota.tempoRespostaMin, 'menos', ' min'),
      a.coleta && linha('coleta', 'Coleta no prazo', 'ti-truck', a.coleta.noPrazoPct, b.coleta.noPrazoPct, 'mais', '%'),
    ].filter(Boolean);

    const variacoes = (ca, cb, lista) => lista.map((x) => ({ id: x.id, nome: x.nome, a: ca[x.id] || 0, b: cb[x.id] || 0, delta: (ca[x.id] || 0) - (cb[x.id] || 0) }))
      .filter((x) => x.a || x.b)
      .sort((x, y) => y.delta - x.delta || y.a - x.a);
    const bairros = variacoes(a.alertas.porBairro, b.alertas.porBairro, data.bairros);
    const areas = variacoes(a.alertas.porArea, b.alertas.porArea, data.areas);
    const maior = Math.max(1, ...bairros.map((x) => x.delta));
    const niveis = Object.fromEntries(bairros.filter((x) => x.delta > 0).map((x) => [x.id, limitar(Math.ceil((x.delta / maior) * 4), 1, 4)]));
    return { a, b, linhas, bairros, areas, niveis };
  };
})(window.GC = window.GC || {});
