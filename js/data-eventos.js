(function (GC) {
  // Grandes eventos: show, jogo, feira e festas da cidade, com o plano de operação por frente (ônibus extras,
  // SAMU de prontidão, limpeza depois do evento e agentes de segurança), o público previsto e o real.
  // Escrito à mão contra "hoje" = 05/11/2026 (GC.relogio.data desloca as datas). Os de dezembro são do
  // "Movimento de fim de ano" do calendário sazonal (js/data-sazonal.js, id 'fim-de-ano').
  //
  // Cada frente tem o previsto, o feito (só depois que o evento acontece) e se está pronta. prontoAte é o dia em
  // que a frente precisa estar pronta: passou desse dia sem ficar pronta, a frente está atrasada.
  const d = (iso) => GC.relogio.data(iso);

  // Frentes. area = secretaria responsável (ids de GC.data.areas).
  const mobilidade = (previsto, feito, pronto, prontoAte) => ({ id: 'mobilidade', area: 'mobilidade', previsto, feito, pronto, prontoAte: d(prontoAte) });
  const saude = (previsto, feito, pronto, prontoAte) => ({ id: 'saude', area: 'saude', previsto, feito, pronto, prontoAte: d(prontoAte) });
  const limpeza = (previsto, feito, pronto, prontoAte) => ({ id: 'limpeza', area: 'limpeza', previsto, feito, pronto, prontoAte: d(prontoAte) });
  const seguranca = (previsto, feito, pronto, prontoAte) => ({ id: 'seguranca', area: 'seguranca', previsto, feito, pronto, prontoAte: d(prontoAte) });

  // local: bairro + deslocamento do centro do bairro (dentro do polígono); raioM = perímetro do evento.
  // publicoReal: só nos que já aconteceram ou estão acontecendo (parcial, até agora, nos em andamento).
  const eventos = [
    {
      id: 'ev-maratona', nome: 'Meia Maratona da Vila Dourada', tipo: 'esporte',
      local: { nome: 'Orla da Lagoa Azul', bairroId: 'lagoa_azul', desloc: [0.002, 0.003] }, raioM: 600,
      inicio: d('2026-10-25'), fim: d('2026-10-25'), horario: '6h às 11h',
      publicoPrevisto: 6000, publicoReal: 7400,
      frentes: [
        mobilidade({ onibusExtras: 6, linhas: ['103'], interdicoes: 4 }, { onibusExtras: 6 }, true, '2026-10-23'),
        saude({ ambulancias: 3, postos: 2 }, { ambulancias: 3, postos: 2, atendimentos: 41, remocoes: 2 }, true, '2026-10-23'),
        limpeza({ equipes: 4, toneladas: 3, prazoHoras: 6 }, { equipes: 4, toneladas: 3.8, horas: 5 }, true, '2026-10-24'),
        seguranca({ agentes: 40 }, { agentes: 38, ocorrencias: 1 }, true, '2026-10-23'),
      ],
    },
    {
      id: 'ev-festival-porto', nome: 'Festival Gastronômico do Porto', tipo: 'festa',
      local: { nome: 'Cais do Porto', bairroId: 'porto_dourado', desloc: [0.002, 0.003] }, raioM: 450,
      inicio: d('2026-10-31'), fim: d('2026-11-01'), horario: '11h às 23h',
      publicoPrevisto: 15000, publicoReal: 21500,
      frentes: [
        mobilidade({ onibusExtras: 8, linhas: ['103', '105'], interdicoes: 3 }, { onibusExtras: 11 }, true, '2026-10-29'),
        saude({ ambulancias: 2, postos: 1 }, { ambulancias: 2, postos: 1, atendimentos: 63, remocoes: 5 }, true, '2026-10-29'),
        limpeza({ equipes: 5, toneladas: 9, prazoHoras: 8 }, { equipes: 7, toneladas: 14.2, horas: 13 }, true, '2026-10-30'),
        seguranca({ agentes: 60 }, { agentes: 72, ocorrencias: 6 }, true, '2026-10-29'),
      ],
    },
    {
      id: 'ev-expo', nome: 'Expo Vila Dourada', tipo: 'feira',
      local: { nome: 'Pavilhão de Exposições', bairroId: 'parque_industrial', desloc: [-0.002, -0.003] }, raioM: 400,
      inicio: d('2026-11-03'), fim: d('2026-11-08'), horario: '14h às 22h',
      publicoPrevisto: 36000, publicoReal: 14900,
      frentes: [
        mobilidade({ onibusExtras: 6, linhas: ['105'], interdicoes: 1 }, null, true, '2026-11-02'),
        saude({ ambulancias: 1, postos: 1 }, null, true, '2026-11-02'),
        limpeza({ equipes: 3, toneladas: 12, prazoHoras: 12 }, null, true, '2026-11-02'),
        seguranca({ agentes: 30 }, null, true, '2026-11-02'),
      ],
    },
    {
      id: 'ev-show-aniversario', nome: 'Show do aniversário da cidade', tipo: 'show',
      local: { nome: 'Praça Central', bairroId: 'centro', desloc: [0.001, 0.003] }, raioM: 350,
      inicio: d('2026-11-05'), fim: d('2026-11-05'), horario: '19h às 23h',
      publicoPrevisto: 25000, publicoReal: 31000,
      frentes: [
        mobilidade({ onibusExtras: 12, linhas: ['101', '102', '106'], interdicoes: 6 }, null, true, '2026-11-04'),
        saude({ ambulancias: 4, postos: 2 }, null, false, '2026-11-04'),
        limpeza({ equipes: 6, toneladas: 10, prazoHoras: 8 }, null, true, '2026-11-04'),
        seguranca({ agentes: 90 }, null, true, '2026-11-04'),
      ],
    },
    {
      id: 'ev-final-campeonato', nome: 'Final do Campeonato Municipal', tipo: 'esporte',
      local: { nome: 'Estádio Municipal', bairroId: 'vila_nova', desloc: [-0.002, 0.002] }, raioM: 400,
      inicio: d('2026-11-08'), fim: d('2026-11-08'), horario: '16h às 18h',
      publicoPrevisto: 9000, publicoReal: null,
      frentes: [
        mobilidade({ onibusExtras: 8, linhas: ['102', '103'], interdicoes: 2 }, null, true, '2026-11-06'),
        saude({ ambulancias: 2, postos: 1 }, null, false, '2026-11-06'),
        limpeza({ equipes: 3, toneladas: 4, prazoHoras: 6 }, null, false, '2026-11-07'),
        seguranca({ agentes: 70 }, null, false, '2026-11-04'),
      ],
    },
    {
      id: 'ev-natal-iluminado', nome: 'Abertura do Natal Iluminado', tipo: 'festa', temporada: 'fim-de-ano',
      local: { nome: 'Praça Central', bairroId: 'centro', desloc: [-0.002, -0.002] }, raioM: 400,
      inicio: d('2026-11-28'), fim: d('2026-11-28'), horario: '18h às 22h',
      publicoPrevisto: 18000, publicoReal: null,
      frentes: [
        mobilidade({ onibusExtras: 10, linhas: ['101', '106'], interdicoes: 5 }, null, false, '2026-11-25'),
        saude({ ambulancias: 3, postos: 2 }, null, true, '2026-11-25'),
        limpeza({ equipes: 5, toneladas: 7, prazoHoras: 8 }, null, false, '2026-11-26'),
        seguranca({ agentes: 80 }, null, false, '2026-11-25'),
      ],
    },
    {
      id: 'ev-reveillon', nome: 'Réveillon na Lagoa', tipo: 'show', temporada: 'fim-de-ano',
      local: { nome: 'Orla da Lagoa Azul', bairroId: 'lagoa_azul', desloc: [-0.002, -0.002] }, raioM: 700,
      inicio: d('2026-12-31'), fim: d('2026-12-31'), horario: '21h às 2h',
      publicoPrevisto: 45000, publicoReal: null,
      frentes: [
        mobilidade({ onibusExtras: 25, linhas: ['101', '102', '103', '104', '105', '106'], interdicoes: 10 }, null, false, '2026-12-28'),
        saude({ ambulancias: 6, postos: 4 }, null, false, '2026-12-28'),
        limpeza({ equipes: 10, toneladas: 25, prazoHoras: 10 }, null, false, '2026-12-29'),
        seguranca({ agentes: 160 }, null, false, '2026-12-28'),
      ],
    },
  ];

  GC.data.eventos = {
    eventos,
    // Público acima do previsto a partir deste desvio pede atenção (mais gente que o plano aguenta).
    limiteDesvioPct: 20,
    // Janela da camada e do widget: os que acabaram nos últimos 14 dias e os dos próximos 60.
    janelaPassadoDias: 14, janelaFuturoDias: 60,
  };

  // ---- cálculos ----
  const DIA = 86400000;
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const dias = (a, b) => Math.round((utc(b) - utc(a)) / DIA);
  const FRENTES = { mobilidade: 'Mobilidade', saude: 'Saúde', limpeza: 'Limpeza', seguranca: 'Segurança' };
  const PESO = { atrasado: 2, pendente: 1, pronto: 0 };

  function dentro([y, x], poligono) {
    let inside = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [yi, xi] = poligono[i];
      const [yj, xj] = poligono[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Posição calculada na hora (a cidade pode trocar os bairros): centro do bairro + deslocamento. Se o bairro
  // não existe nesta cidade, ou o ponto cairia fora dele, fica no centro do bairro (ou do primeiro bairro).
  function posicao(local) {
    const bs = GC.data.bairros || [];
    const b = bs.find((x) => x.id === local.bairroId) || bs.find((x) => x.id === 'centro') || bs[0];
    if (!b) return { lat: 0, lng: 0, bairroId: local.bairroId };
    const [lat, lng] = b.centro;
    const p = { lat: +(lat + local.desloc[0]).toFixed(5), lng: +(lng + local.desloc[1]).toFixed(5) };
    const ok = b.id === local.bairroId && (!b.poligono || dentro([p.lat, p.lng], b.poligono));
    return Object.assign(ok ? p : { lat, lng }, { bairroId: b.id });
  }

  // Nomes das linhas de ônibus reforçadas (js/data-frota.js), quando a frota está carregada.
  function linhasDe(ids) {
    const linhas = GC.data.frota ? GC.data.frota.linhas : [];
    return (ids || []).map((id) => {
      const l = linhas.find((x) => x.id === id);
      return { id, nome: l ? l.nome : `Linha ${id}` };
    });
  }

  // Situação de uma frente: pronta; atrasada (passou do dia de ficar pronta, ou o evento já começou); pendente.
  function situacaoFrente(f, ev, hoje) {
    if (f.pronto || f.feito) return 'pronto';
    if (dias(f.prontoAte, hoje) > 0 || dias(ev.inicio, hoje) >= 0) return 'atrasado';
    return 'pendente';
  }

  // Texto curto do previsto e do feito de cada frente.
  const n = (x) => Number(x).toLocaleString('pt-BR');
  const pl = (q, um, varios) => `${n(q)} ${Number(q) === 1 ? um : varios}`;
  // Devolve { textoPrevisto, textoFeito } (previsto e feito continuam os números).
  function textoFrente(f) {
    const p = f.previsto;
    const fe = f.feito;
    if (f.id === 'mobilidade') {
      const linhas = linhasDe(p.linhas).map((l) => l.id);
      return {
        textoPrevisto: `${pl(p.onibusExtras, 'ônibus extra', 'ônibus extras')}${linhas.length ? ` ${linhas.length === 1 ? 'na linha' : 'nas linhas'} ${linhas.join(', ')}` : ''}${p.interdicoes ? `, ${pl(p.interdicoes, 'rua interditada', 'ruas interditadas')}` : ''}`,
        textoFeito: fe ? `${pl(fe.onibusExtras, 'ônibus extra rodou', 'ônibus extras rodaram')}` : null,
      };
    }
    if (f.id === 'saude') {
      return {
        textoPrevisto: `${pl(p.ambulancias, 'ambulância', 'ambulâncias')} do SAMU de prontidão e ${pl(p.postos, 'posto médico', 'postos médicos')}`,
        textoFeito: fe ? `${pl(fe.atendimentos, 'atendimento', 'atendimentos')} e ${pl(fe.remocoes, 'remoção', 'remoções')} ao hospital` : null,
      };
    }
    if (f.id === 'limpeza') {
      return {
        textoPrevisto: `${pl(p.equipes, 'equipe', 'equipes')}, ${n(p.toneladas)} t previstas, limpeza em até ${p.prazoHoras} h depois do fim`,
        textoFeito: fe ? `${n(fe.toneladas)} t recolhidas em ${fe.horas} h${fe.horas > p.prazoHoras ? ` (prazo era ${p.prazoHoras} h)` : ''}` : null,
      };
    }
    return {
      textoPrevisto: `${pl(p.agentes, 'agente', 'agentes')} da Guarda e do trânsito`,
      textoFeito: fe ? `${pl(fe.agentes, 'agente', 'agentes')} em campo e ${pl(fe.ocorrencias, 'ocorrência', 'ocorrências')}` : null,
    };
  }

  // Um evento avaliado: status pela data, público comparável, desvio e situação do plano.
  function avaliar(ev, hoje = GC.relogio.hoje) {
    const status = dias(ev.fim, hoje) > 0 ? 'realizado' : dias(ev.inicio, hoje) >= 0 ? 'em_andamento' : 'proximo';
    const duracao = dias(ev.inicio, ev.fim) + 1;
    const diaAtual = status === 'em_andamento' ? dias(ev.inicio, hoje) + 1 : null;
    // Em andamento há vários dias: compara o público até agora com o previsto para os dias que já passaram.
    const previstoComparavel = status === 'em_andamento' && duracao > 1 ? Math.round((ev.publicoPrevisto * diaAtual) / duracao) : ev.publicoPrevisto;
    const temReal = status !== 'proximo' && ev.publicoReal !== null && ev.publicoReal !== undefined;
    const desvioPct = temReal ? Math.round(((ev.publicoReal - previstoComparavel) / previstoComparavel) * 100) : null;
    const frentes = ev.frentes.map((f) => Object.assign({}, f, { nome: FRENTES[f.id], situacao: situacaoFrente(f, ev, hoje) }, textoFrente(f)));
    const pior = frentes.reduce((s, f) => (PESO[f.situacao] > PESO[s] ? f.situacao : s), 'pronto');
    const limpezaFr = frentes.find((f) => f.id === 'limpeza');
    const limpezaAtrasou = !!(limpezaFr && limpezaFr.feito && limpezaFr.feito.horas > limpezaFr.previsto.prazoHoras);
    const lotado = desvioPct !== null && desvioPct >= GC.data.eventos.limiteDesvioPct;
    const temporada = ev.temporada && GC.data.sazonal ? (GC.data.sazonal.temporadas.find((t) => t.id === ev.temporada) || null) : null;
    return Object.assign({}, ev, posicao(ev.local), {
      status,
      duracao,
      diaAtual,
      faltamDias: status === 'proximo' ? dias(hoje, ev.inicio) : null,
      previstoComparavel,
      parcial: status === 'em_andamento',
      desvioPct,
      lotado,
      frentes,
      plano: status === 'realizado' ? 'pronto' : pior,
      pendentes: frentes.filter((f) => f.situacao !== 'pronto'),
      limpezaAtrasou,
      onibusExtras: (frentes.find((f) => f.id === 'mobilidade') || { previsto: { onibusExtras: 0 } }).previsto.onibusExtras,
      linhas: linhasDe((frentes.find((f) => f.id === 'mobilidade') || { previsto: {} }).previsto.linhas),
      temporadaNome: temporada ? temporada.nome : null,
      // Pede atenção: plano atrasado num evento que não acabou, ou público bem acima do previsto agora.
      atencao: status !== 'realizado' && (pior === 'atrasado' || lotado),
    });
  }

  // Situação do pino: crítica (pede atenção), atenção (plano pendente), ok (plano pronto), realizado.
  function situacaoPino(e) {
    if (e.status === 'realizado') return 'realizado';
    if (e.atencao) return 'critica';
    return e.plano === 'pendente' ? 'atencao' : 'ok';
  }

  function resumo(hoje = GC.relogio.hoje, lista = eventos) {
    const cfg = GC.data.eventos;
    const avaliados = lista.map((ev) => avaliar(ev, hoje))
      .filter((e) => dias(e.fim, hoje) <= cfg.janelaPassadoDias && dias(hoje, e.inicio) <= cfg.janelaFuturoDias)
      .map((e) => Object.assign(e, { situacao: situacaoPino(e) }))
      .sort((a, b) => utc(a.inicio) - utc(b.inicio));
    const emAndamento = avaliados.filter((e) => e.status === 'em_andamento');
    const proximos = avaliados.filter((e) => e.status === 'proximo');
    const realizados = avaliados.filter((e) => e.status === 'realizado').reverse(); // o mais recente primeiro
    const comReal = avaliados.filter((e) => e.desvioPct !== null);
    return {
      eventos: avaliados,
      emAndamento,
      proximos,
      realizados,
      proximos30: proximos.filter((e) => e.faltamDias <= 30),
      atencao: avaliados.filter((e) => e.atencao),
      planosAtrasados: avaliados.filter((e) => e.status !== 'realizado' && e.plano === 'atrasado'),
      planosPendentes: avaliados.filter((e) => e.status !== 'realizado' && e.plano === 'pendente'),
      acimaDoPrevisto: comReal.filter((e) => e.lotado),
      publicoPrevistoProximos: proximos.reduce((s, e) => s + e.publicoPrevisto, 0),
      onibusExtrasProximos: [...emAndamento, ...proximos].reduce((s, e) => s + e.onibusExtras, 0),
      limpezaAtrasada: realizados.filter((e) => e.limpezaAtrasou),
    };
  }

  // Número do interruptor no painel Camadas: quantos eventos no mapa e quantos pedem atenção.
  function contagemCamada() {
    const r = resumo();
    return { total: r.eventos.length, alerta: r.atencao.length, rotulo: ['evento', 'eventos'] };
  }

  GC.eventos = { resumo, avaliar, contagemCamada, dentro, FRENTES };
})(window.GC = window.GC || {});
