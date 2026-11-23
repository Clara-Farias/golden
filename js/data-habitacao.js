(function (GC) {
  // Habitação: ocupações irregulares (sobretudo as que estão em área de risco da Defesa Civil), fila de moradia
  // por bairro e processos de regularização fundiária (REURB) por núcleo. Não há secretaria de habitação em
  // GC.data.areas: quem responde é a Infraestrutura (area: 'infraestrutura').
  // Escrito à mão, mas coerente: quatro ocupações ficam de propósito dentro das áreas de js/data-risco.js
  // (Encosta do Alto da Serra, Margem da Lagoa Azul, Morro da Vila Nova e Córrego do Porto). Se a ocupação
  // está ou não em risco é calculado na hora, pelos polígonos da Defesa Civil.
  const AREA = 'infraestrutura';
  const CRESCIMENTO_ATENCAO = 25; // % de famílias a mais em 12 meses que já pede atenção
  const RECENTE_MESES = 12; // ocupação com menos tempo que isso ainda está se formando

  // Bairro que não existe na cidade aberta (a pequena tem outros nomes): um bairro dela, sempre o mesmo para o id.
  const centroDe = (id) => {
    const bs = GC.data.bairros;
    const b = bs.find((x) => x.id === id);
    if (b) return b.centro;
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return bs[h % bs.length].centro;
  };
  const ponto = (bairroId, [dLat, dLng]) => {
    const [lat, lng] = centroDe(bairroId);
    return { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) };
  };

  // o(id, nome, bairro, desloc, famílias hoje, domicílios, famílias há 12 meses, desde, terreno)
  const o = (id, nome, bairroId, desloc, familias, domicilios, familiasAnoPassado, desde, terreno) =>
    Object.assign({ id, nome, bairroId, familias, domicilios, familiasAnoPassado, desde: GC.relogio.data(desde), terreno }, ponto(bairroId, desloc));

  const ocupacoes = [
    o('ocup-encosta', 'Ocupação da Encosta', 'alto_da_serra', [-0.003, -0.002], 38, 34, 31, '2019-03-10', 'publico'),
    o('ocup-beira-lagoa', 'Comunidade Beira-Lagoa', 'lagoa_azul', [0.0025, 0.0035], 52, 47, 49, '2016-07-01', 'publico'),
    o('ocup-morro', 'Ocupação do Morro', 'vila_nova', [0.0045, 0.003], 31, 28, 22, '2021-05-15', 'privado'),
    o('ocup-corrego', 'Beco do Córrego', 'porto_dourado', [-0.0025, 0.0025], 24, 21, 20, '2022-11-20', 'publico'),
    o('ocup-trilhos', 'Ocupação dos Trilhos', 'parque_industrial', [0.003, 0.004], 45, 41, 44, '2014-02-01', 'publico'),
    o('ocup-porto-velho', 'Vila do Porto Velho', 'porto_dourado', [0.004, -0.003], 63, 58, 61, '2009-01-01', 'publico'),
    o('ocup-esperanca', 'Vila Esperança', 'bela_vista', [0.004, -0.004], 19, 17, 8, '2025-09-12', 'privado'),
    o('ocup-acacias', 'Terreno da Rua das Acácias', 'jardim_das_flores', [-0.004, 0.003], 12, 12, 0, '2026-06-03', 'privado'),
  ];

  // Fila de moradia por bairro (cadastro habitacional): famílias inscritas, espera média em meses e prioridades
  // legais. areaRisco = inscritas que moram nas ocupações em área de risco do bairro.
  const f = (bairroId, inscritas, esperaMeses, areaRisco, idosos, pcd) => ({ bairroId, inscritas, esperaMeses, prioridades: { areaRisco, idosos, pcd } });
  const fila = [
    f('alto_da_serra', 410, 46, 21, 58, 19),
    f('bela_vista', 260, 31, 0, 44, 12),
    f('jardim_das_flores', 290, 34, 0, 39, 15),
    f('parque_industrial', 330, 40, 0, 37, 14),
    f('lagoa_azul', 520, 52, 30, 61, 22),
    f('centro', 380, 29, 0, 72, 25),
    f('vila_nova', 610, 49, 12, 80, 27),
    f('porto_dourado', 470, 44, 18, 55, 20),
  ];

  // REURB: regularização fundiária por núcleo. REURB-S (interesse social, a Prefeitura paga) ou REURB-E
  // (interesse específico, o morador paga). prazoEtapa = quando a etapa atual deveria terminar.
  const ETAPAS = [
    { id: 'requerimento', nome: 'Requerimento' },
    { id: 'levantamento', nome: 'Levantamento topográfico' },
    { id: 'projeto', nome: 'Projeto urbanístico' },
    { id: 'aprovacao', nome: 'Aprovação' },
    { id: 'titulacao', nome: 'Entrega dos títulos' },
    { id: 'concluido', nome: 'Concluído' },
  ];
  const n = (id, nome, bairroId, desloc, modalidade, lotes, etapa, abertoEm, prazoEtapa, extra = {}) =>
    Object.assign({ id, nome, bairroId, modalidade, lotes, etapa, abertoEm: GC.relogio.data(abertoEm), prazoEtapa: prazoEtapa ? GC.relogio.data(prazoEtapa) : null }, ponto(bairroId, desloc), extra);
  const reurb = [
    n('reurb-trilhos', 'Núcleo dos Trilhos', 'parque_industrial', [0.0035, 0.0048], 'REURB-S', 41, 'projeto', '2024-03-18', '2026-09-30', { ocupacaoId: 'ocup-trilhos' }),
    n('reurb-porto-velho', 'Núcleo Porto Velho', 'porto_dourado', [0.0048, -0.0022], 'REURB-S', 58, 'titulacao', '2022-08-10', '2026-12-15', { ocupacaoId: 'ocup-porto-velho' }),
    n('reurb-jardim-alto', 'Loteamento Jardim Alto', 'jardim_das_flores', [0.004, 0.004], 'REURB-E', 86, 'levantamento', '2026-02-02', '2026-10-20'),
    n('reurb-sao-jorge', 'Vila São Jorge', 'vila_nova', [-0.004, -0.004], 'REURB-S', 72, 'aprovacao', '2023-05-05', '2026-11-28'),
    n('reurb-rua-velha', 'Cortiços da Rua Velha', 'centro', [0.002, 0.005], 'REURB-S', 26, 'requerimento', '2026-10-01', '2026-12-31'),
    n('reurb-bela-vista', 'Conjunto Bela Vista I', 'bela_vista', [-0.003, 0.004], 'REURB-S', 120, 'concluido', '2021-04-12', null, { concluidoEm: GC.relogio.data('2026-08-21') }),
  ];

  GC.data.habitacao = { area: AREA, ocupacoes, fila, reurb, etapas: ETAPAS, limite: { crescimentoAtencao: CRESCIMENTO_ATENCAO, recenteMeses: RECENTE_MESES } };

  // ---- cálculos ----
  const DIA_MS = 86400000;
  const hoje = () => GC.relogio.hoje;
  const dias = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / DIA_MS);
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const soma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);

  // Área de risco da Defesa Civil que contém o ponto (lida na hora; sem o módulo de risco, nenhuma).
  function areaDeRisco(p) {
    if (!GC.risco || !GC.data.risco) return null;
    const a = GC.data.risco.areas.find((x) => GC.risco.dentro([p.lat, p.lng], x.poligono));
    if (!a) return null;
    const av = GC.risco.avaliar ? GC.risco.avaliar(a) : a;
    return { id: a.id, nome: a.nome, tipo: a.tipo, nivel: av.nivel || null };
  }

  const ORDEM = { critica: 0, atencao: 1, em_dia: 1, ok: 2 };
  function avaliarOcupacao(x) {
    const risco = areaDeRisco(x);
    const meses = Math.floor(dias(x.desde, hoje()) / 30.44);
    const crescimentoPct = x.familiasAnoPassado ? Math.round(((x.familias - x.familiasAnoPassado) / x.familiasAnoPassado) * 100) : null;
    const recente = meses < RECENTE_MESES;
    const crescendo = recente || (crescimentoPct !== null && crescimentoPct >= CRESCIMENTO_ATENCAO);
    const reurbDela = reurb.find((r) => r.ocupacaoId === x.id) || null;
    const motivos = [];
    if (risco) motivos.push({ tipo: 'risco', critico: true, texto: `Dentro da área de risco ${risco.nome} (${risco.tipo})` });
    if (recente) motivos.push({ tipo: 'recente', critico: false, texto: `Começou há ${meses} ${meses === 1 ? 'mês' : 'meses'}` });
    else if (crescendo) motivos.push({ tipo: 'crescimento', critico: false, texto: `${crescimentoPct}% mais famílias em 12 meses` });
    const situacao = risco ? 'critica' : crescendo ? 'atencao' : 'ok';
    return Object.assign({}, x, { emRisco: !!risco, areaRisco: risco, meses, crescimentoPct, recente, crescendo, reurbId: reurbDela && reurbDela.id, motivos, situacao });
  }

  function avaliarNucleo(r) {
    const i = ETAPAS.findIndex((e) => e.id === r.etapa);
    const concluido = r.etapa === 'concluido';
    const atraso = !concluido && r.prazoEtapa ? dias(r.prazoEtapa, hoje()) : 0;
    const atrasado = atraso > 0;
    return Object.assign({}, r, {
      etapaIdx: i,
      etapaNome: ETAPAS[i].nome,
      progressoPct: Math.round((i / (ETAPAS.length - 1)) * 100),
      concluido,
      atrasado,
      diasAtraso: atrasado ? atraso : 0,
      diasParaPrazo: !concluido && r.prazoEtapa && !atrasado ? -atraso : null,
      emRisco: !!areaDeRisco(r),
      situacao: concluido ? 'ok' : atrasado ? 'critica' : 'em_dia',
    });
  }

  function resumo() {
    const ocs = ocupacoes.map(avaliarOcupacao)
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || b.familias - a.familias);
    const emRisco = ocs.filter((x) => x.emRisco);
    const familiasEmRisco = soma(emRisco, (x) => x.familias);

    const linhas = fila.map((l) => Object.assign({}, l, {
      nome: nomeBairro(l.bairroId),
      prioritarias: l.prioridades.areaRisco + l.prioridades.idosos + l.prioridades.pcd,
      familiasEmRisco: soma(emRisco.filter((x) => x.bairroId === l.bairroId), (x) => x.familias),
    })).sort((a, b) => b.esperaMeses - a.esperaMeses || b.inscritas - a.inscritas);
    const filaTotal = soma(linhas, (l) => l.inscritas);
    const prioridades = { areaRisco: soma(linhas, (l) => l.prioridades.areaRisco), idosos: soma(linhas, (l) => l.prioridades.idosos), pcd: soma(linhas, (l) => l.prioridades.pcd) };

    const nucleos = reurb.map(avaliarNucleo)
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || b.diasAtraso - a.diasAtraso || a.etapaIdx - b.etapaIdx);
    const andamento = nucleos.filter((r) => !r.concluido);

    return {
      ocupacoes: ocs,
      emRisco,
      crescendo: ocs.filter((x) => !x.emRisco && x.crescendo),
      familiasIrregulares: soma(ocs, (x) => x.familias),
      domiciliosIrregulares: soma(ocs, (x) => x.domicilios),
      familiasEmRisco,
      // Famílias em área de risco que ainda não estão inscritas na fila: onde a busca ativa faz diferença.
      emRiscoForaDaFila: Math.max(0, familiasEmRisco - prioridades.areaRisco),
      fila: linhas,
      filaTotal,
      esperaMediaMeses: filaTotal ? Math.round(soma(linhas, (l) => l.esperaMeses * l.inscritas) / filaTotal) : 0,
      prioridades,
      reurb: nucleos,
      reurbAndamento: andamento,
      reurbAtrasados: nucleos.filter((r) => r.atrasado),
      lotesEmProcesso: soma(andamento, (r) => r.lotes),
      lotesTitulados: soma(nucleos.filter((r) => r.concluido), (r) => r.lotes),
    };
  }

  // Número do interruptor da camada no painel Camadas: ocupações no mapa e quantas estão em área de risco.
  function contagemCamada() {
    const r = resumo();
    return { total: r.ocupacoes.length, alerta: r.emRisco.length, rotulo: ['ocupação', 'ocupações'] };
  }

  GC.habitacao = { resumo, contagemCamada, avaliarOcupacao, avaliarNucleo, areaDeRisco, ETAPAS };
})(window.GC = window.GC || {});
