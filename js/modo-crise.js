(function (GC) {
  // Modo de crise: o painel inteiro reage enquanto há gabinete de crise aberto. Não é um registro novo: o estado
  // sai dos gabinetes ativos (js/crise.js). Abrir um gabinete liga o modo, encerrar o último desliga. Aqui mora só
  // a lógica (testável); a faixa e a vista "Sala de crise" ficam em js/app/modo-crise.js.
  // Spec: docs/specs/2026-11-17-vila-dourada-modo-de-crise-design.md (fase 1).
  const unicos = (l) => [...new Set(l.filter((x) => x !== null && x !== undefined))];
  const FIM = ['concluida', 'cancelada'];
  const RAIO_M = () => GC.RAIO_RELACIONADAS_M || 400;

  const distM = (a, b) => {
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
    const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
  };

  // Demandas do gabinete agora: feitas, válidas (sem as canceladas) e atrasadas.
  GC.demandasDoGabinete = function (g, agora = GC.agora()) {
    const validas = (g.tarefas || []).filter((t) => t.status !== 'cancelada');
    return {
      feitas: validas.filter((t) => t.status === 'concluida').length,
      total: validas.length,
      atrasadas: validas.filter((t) => !FIM.includes(t.status) && agora - t.criadaEm > t.prazoMin * 60000).length,
    };
  };

  const ehCrise = (g) => g.origem !== 'previsao';

  // gabinetes: os ativos (todos, sem recorte). areas: as pastas do perfil (GC.areasDoPerfil; null = a cidade).
  // ocorrencias: as da store (para achar as ligadas à crise).
  GC.modoCrise = function ({ gabinetes = [], areas = null, ocorrencias = [], agora = GC.agora() } = {}) {
    const ativos = gabinetes.filter((g) => g && !g.encerradoEm);
    if (!ativos.length) return { nivel: 'nenhum', gabinetes: [], principal: null, bairros: [], pastas: [], ocorrenciaIds: [], envolvido: false, desde: null };
    const daPasta = areas ? ativos.filter((g) => (g.areas || []).some((a) => areas.includes(a))) : ativos;
    const envolvido = daPasta.length > 0;
    // Pasta de fora: só sabe que há crise (a faixa neutra), sem detalhe de gabinete que ela não vê.
    if (!envolvido) {
      return { nivel: ativos.some(ehCrise) ? 'crise' : 'prontidao', gabinetes: [], principal: null, bairros: [], pastas: [], ocorrenciaIds: [], envolvido: false, desde: Math.min(...ativos.map((g) => g.abertoEm)) };
    }
    // O principal: o de crise antes do preventivo, depois o com mais demandas atrasadas, depois o mais recente.
    const ordenados = daPasta.slice().sort((a, b) => (ehCrise(b) - ehCrise(a))
      || (GC.demandasDoGabinete(b, agora).atrasadas - GC.demandasDoGabinete(a, agora).atrasadas)
      || (b.abertoEm - a.abertoEm));
    const principal = ordenados[0];
    // Ligadas: a de origem e as abertas do mesmo tipo no bairro do gabinete ou a menos de 400 m da de origem.
    const abertas = ocorrencias.filter((o) => o.status !== 'resolvida');
    const ligadas = new Set();
    daPasta.forEach((g) => {
      const origem = g.ocorrenciaId ? ocorrencias.find((o) => o.id === g.ocorrenciaId) : null;
      if (g.ocorrenciaId) ligadas.add(g.ocorrenciaId);
      abertas.forEach((o) => {
        if (o.tipo !== g.tipo) return;
        if (o.bairroId === g.bairroId || (origem && distM(o, origem) <= RAIO_M())) ligadas.add(o.id);
      });
    });
    return {
      nivel: daPasta.some(ehCrise) ? 'crise' : 'prontidao',
      gabinetes: ordenados,
      principal,
      bairros: unicos(ordenados.map((g) => g.bairroId)),
      pastas: unicos(ordenados.flatMap((g) => g.areas || [])),
      ocorrenciaIds: [...ligadas],
      envolvido: true,
      desde: principal.abertoEm,
    };
  };

  // A vista "Sala de crise": um estado de visualização (filtros, widgets, mapa) para o aplicarEstado do app.
  // Widgets: o do gabinete fixado no mapa, os números, o pulso das pastas e os do modelo. Camadas: as do modelo.
  // fixarGabinete: false deixa o widget do gabinete só na gaveta de Indicadores (escolha de cada pessoa, na faixa).
  GC.vistaDaCrise = function (modo, { fixarGabinete = true } = {}) {
    if (!modo || !modo.principal) return null;
    const g = modo.principal;
    const painel = g.painel || (GC.painelDoModelo ? GC.painelDoModelo(GC.modelosCrise && g.modeloId ? GC.modelosCrise.buscar(g.modeloId) : { grupo: g.grupo }) : { camadas: [], widgets: [] });
    return {
      filtros: { bairros: modo.bairros.slice() },
      widgets: {
        ativos: unicos(['crise', 'numeros', 'pulsos', ...(painel.widgets || [])]),
        pulsos: modo.pastas.slice(),
        fixados: fixarGabinete ? ['crise'] : [],
      },
      // Legenda fechada: aberta, ela cobre o widget do gabinete fixado no canto direito.
      mapa: { camadas: (painel.camadas || []).slice(), legenda: false },
    };
  };

  // A crise muda a ordem só no nível 'crise' e para quem está envolvido (prontidão e pasta de fora: nada muda).
  GC.criseMudaOrdem = (modo) => !!modo && modo.nivel === 'crise' && modo.envolvido;

  // "Precisam de você" e Central na crise (fase 2): as da crise primeiro; as de fora que podem esperar (nem crítica,
  // nem com prazo estourado, nem escalada pela regra) num grupo recolhido. Nenhum prazo muda: é só ordem e agrupamento.
  // Devolve { crise, normal, esperar }, cada um na ordem em que veio. Sem crise, tudo em `normal`.
  GC.podeEsperarCrise = (o) => o.severidade !== 'critica' && !(GC.estourada && GC.estourada(o))
    && !(GC.motivosAtencao ? GC.motivosAtencao(o) : []).some((m) => m.tipo === 'prazo' || m.tipo === 'escalada');
  GC.ordenarNaCrise = function (lista, modo) {
    if (!GC.criseMudaOrdem(modo)) return { crise: [], normal: lista.slice(), esperar: [] };
    const ids = new Set(modo.ocorrenciaIds);
    const r = { crise: [], normal: [], esperar: [] };
    lista.forEach((o) => {
      if (ids.has(o.id)) r.crise.push(o);
      else if (GC.podeEsperarCrise(o)) r.esperar.push(o);
      else r.normal.push(o);
    });
    return r;
  };
  GC.daCrise = (o, modo) => !!modo && modo.nivel !== 'nenhum' && (modo.ocorrenciaIds || []).includes(o.id);

  // Cronômetro da crise, mais fino que GC.tempoTexto: "40 min", "1 h 12", "2 dias".
  GC.duracaoCrise = function (min) {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m} min`;
    if (m < 2880) return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
    return `${Math.floor(m / 1440)} dias`;
  };

  // O texto da faixa: { nivel, titulo, tempo, demandas, atrasadas, mais }. agora: para o "há 1 h 12".
  GC.faixaCrise = function (modo, agora = GC.agora()) {
    if (!modo || modo.nivel === 'nenhum') return null;
    const tempo = GC.duracaoCrise((agora - modo.desde) / 60000);
    if (!modo.envolvido) {
      return { nivel: modo.nivel, neutra: true, titulo: modo.nivel === 'crise' ? 'Gabinete de crise ativo na cidade' : 'Gabinete preventivo ativo na cidade', tempo, demandas: null, atrasadas: 0, mais: 0 };
    }
    const g = modo.principal;
    const d = GC.demandasDoGabinete(g, agora);
    return {
      nivel: modo.nivel,
      neutra: false,
      rotulo: modo.nivel === 'crise' ? 'Gabinete de crise' : 'Gabinete preventivo',
      titulo: g.titulo,
      tempo,
      demandas: `${d.feitas} de ${d.total} ${d.total === 1 ? 'demanda' : 'demandas'}`,
      atrasadas: d.atrasadas,
      mais: modo.gabinetes.length - 1,
    };
  };

  // "Crise há 1 h 12" no lugar de "Ao vivo · 23:42" (linha de contexto do cabeçalho).
  GC.relogioCrise = function (modo, agora = GC.agora()) {
    const f = GC.faixaCrise(modo, agora);
    if (!f) return null;
    return `${f.nivel === 'crise' ? 'Crise' : 'Prontidão'} há ${f.tempo}`;
  };

  // Escolha de cada usuário por gabinete ('dentro' = na vista da crise, 'fora' = no painel normal) e a
  // visualização de antes de entrar (para voltar). arm: { ler(), gravar(o) } (localStorage em
  // gc.modoCrise.<cidade>.<usuário>); sem ele, em memória.
  GC.criarPreferenciasCrise = function (arm) {
    // fixarGabinete: o widget do gabinete fica fixado sobre o mapa na vista "Sala de crise" (padrão: sim).
    // faixaFixa: a faixa do gabinete fica no cabeçalho (padrão: sim); solta, vira só um selo na linha de contexto.
    let estado = { escolhas: {}, anterior: null, fixarGabinete: true, faixaFixa: true };
    // Relê a cada uso: outra aba da mesma pessoa pode ter mudado (entrou, saiu, voltou).
    const ler = () => {
      try { const lido = arm && arm.ler(); if (lido && typeof lido === 'object') estado = { escolhas: lido.escolhas || {}, anterior: lido.anterior || null, fixarGabinete: lido.fixarGabinete !== false, faixaFixa: lido.faixaFixa !== false }; } catch (e) { /* fica o que tinha */ }
      return estado;
    };
    ler();
    const gravar = () => { try { if (arm) arm.gravar(estado); } catch (e) { /* sem armazenamento */ } };
    return {
      escolha: (gid) => ler().escolhas[gid] || null,
      marcar(gid, valor) { if (!gid) return; ler().escolhas[gid] = valor; gravar(); },
      anterior: () => ler().anterior,
      fixarGabinete: () => ler().fixarGabinete,
      marcarFixarGabinete(v) { ler().fixarGabinete = !!v; gravar(); },
      faixaFixa: () => ler().faixaFixa,
      marcarFaixaFixa(v) { ler().faixaFixa = !!v; gravar(); },
      // Guarda só a primeira: entrar de novo (outro gabinete, recarregar) não troca a visualização de antes da crise.
      guardarAnterior(e) { if (!ler().anterior) { estado.anterior = e; gravar(); } },
      tirarAnterior() { const e = ler().anterior; estado.anterior = null; gravar(); return e; },
      // Esquece as escolhas dos gabinetes que já fecharam.
      limpar(idsAtivos) {
        ler();
        const antes = Object.keys(estado.escolhas).length;
        Object.keys(estado.escolhas).forEach((gid) => { if (!idsAtivos.includes(gid)) delete estado.escolhas[gid]; });
        if (Object.keys(estado.escolhas).length !== antes) gravar();
      },
    };
  };
})(window.GC = window.GC || {});
