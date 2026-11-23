(function (GC) {
  // Cálculos do layout com o mapa no centro (sem DOM): legenda do que está no mapa, contadores
  // dos títulos recolhidos (filtros, atenção, secretarias), widgets escolhidos e urgência dos grupos de pinos.
  const SEVERIDADES = ['critica', 'alta', 'media'];

  GC.resumoLegenda = function (lista) {
    const severidades = SEVERIDADES
      .map((chave) => ({ chave, n: lista.filter((o) => o.severidade === chave).length }))
      .filter((s) => s.n > 0);
    // sort é estável: no empate fica a ordem de GC.data.areas.
    const tipos = GC.data.areas
      .map((a) => ({ area: a.id, emoji: a.emoji, nome: a.nome, n: lista.filter((o) => o.area === a.id).length }))
      .filter((t) => t.n > 0)
      .sort((x, y) => y.n - x.n);
    return { severidades, tipos, total: lista.length };
  };

  const NOME_SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };

  // Camadas de pontos e linhas do painel Camadas: o que cada cor quer dizer (as mesmas cores dos pinos em
  // css/dominios/ e das linhas em js/mapa/). traco: amostra em linha (rotas e linhas de ônibus).
  // Na ordem do painel Camadas; risco, B.O.s e conquistas têm desenho próprio em htmlLegendaMapa.
  const SIT = { critica: 'var(--critica)', atencao: 'var(--media)', ok: 'var(--positivo)' };
  GC.LEGENDA_CAMADAS = [
    { chave: 'frota', titulo: 'Frota e linhas', emoji: '🚌', traco: true,
      itens: [['#dc2626', 'Linha com espera crítica'], ['#eab308', 'Linha em atenção'], ['#2563eb', 'Linha normal']],
      nota: 'garagens e bases do SAMU: veículos rodando / necessários' },
    { chave: 'coleta', titulo: 'Coleta de lixo', emoji: '🚛', traco: true,
      itens: [['#dc2626', 'Rota atrasada'], ['#eab308', 'Em andamento'], ['#15803d', 'Feita ou mais tarde hoje'], ['#8fa0a4', 'Não passa hoje']] },
    { chave: 'escolas', titulo: 'Escolas', emoji: '🎓',
      itens: [[SIT.critica, 'Crítica'], [SIT.atencao, 'Atenção'], [SIT.ok, 'Em dia']],
      nota: 'número no pino: professores faltando' },
    { chave: 'obras', titulo: 'Obras', emoji: '🏗',
      itens: [['#7f1d1d', 'Paralisada'], [SIT.critica, 'Atrasada'], ['var(--navy)', 'No prazo'], [SIT.ok, 'Concluída']] },
    { chave: 'leitos', titulo: 'Leitos', emoji: '🏥',
      itens: [[SIT.critica, 'Ocupação crítica'], [SIT.atencao, 'Atenção'], [SIT.ok, 'Com folga']],
      nota: 'número no pino: % ocupado (o pior entre geral e UTI)' },
    { chave: 'farmacias', titulo: 'Medicamentos', emoji: '💊',
      itens: [[SIT.critica, 'Medicamento em falta'], [SIT.atencao, 'Estoque baixo'], [SIT.ok, 'Estoque em dia']],
      nota: 'número no pino: itens em falta' },
    { chave: 'transito', titulo: 'Segurança no trânsito', emoji: '🚦',
      itens: [[SIT.critica, 'Crítico'], [SIT.atencao, 'Atenção'], [SIT.ok, 'Monitorar']],
      nota: 'número no pino: atropelamentos; contorno tracejado: atropelamento perto de escola' },
    { chave: 'eventos', titulo: 'Grandes eventos', emoji: '🎉',
      itens: [[SIT.critica, 'Pede atenção'], [SIT.atencao, 'Plano pendente'], [SIT.ok, 'Plano pronto'], ['var(--suave)', 'Realizado']],
      nota: 'número no pino: frentes do plano que não estão prontas; círculo: perímetro do evento' },
    { chave: 'predios', titulo: 'Prédios públicos', emoji: '🔧',
      itens: [[SIT.critica, 'Chamado grave ou vistoria vencida'], [SIT.atencao, 'Chamado aberto ou vistoria vence em 30 dias'], [SIT.ok, 'Em dia']],
      nota: 'número no pino: chamados abertos mais vistorias vencidas' },
    { chave: 'habitacao', titulo: 'Habitação', emoji: '🏠',
      itens: [[SIT.critica, 'Ocupação em área de risco ou REURB atrasada'], [SIT.atencao, 'Ocupação crescendo'], ['var(--suave)', 'Ocupação estável'], ['var(--navy)', 'REURB no prazo'], [SIT.ok, 'REURB concluída']],
      nota: 'número no pino: famílias na ocupação em área de risco' },
    { chave: 'vigilancia', titulo: 'Vigilância em saúde', emoji: '🦟',
      itens: [[SIT.critica, 'Foco ativo ou chamado esperando equipe'], [SIT.atencao, 'Tratado ou equipe atendendo'], [SIT.ok, 'Sem foco ou encerrado']],
      nota: 'borda tracejada: zoonoses; número no pino: depósitos com larva' },
    { chave: 'economia', titulo: 'Economia local', emoji: '📈',
      itens: [[SIT.ok, 'Bairro abre mais empresas do que fecha'], [SIT.atencao, 'Fechando mais há 3 meses ou alvará além de 30 dias'], [SIT.critica, 'Fecha mais do que abre ou alvará além de 60 dias']],
      nota: 'quadrado: saldo de empresas do bairro; redondo: alvará parado, com os dias na fila' },
    { chave: 'orcamento', titulo: 'Custo e orçamento', emoji: '💰',
      itens: [['var(--media)', 'Bairro recebe menos de 85% da média por morador'], ['var(--suave)', 'Perto da média da cidade'], ['var(--primaria)', 'Recebe mais de 115% da média'], [SIT.critica, 'Obra paga à frente do que foi feito']],
      nota: 'quadrado: empenhado no bairro por morador (R$ mil); redondo: pontos de pago acima do feito' },
  ];

  // HTML da legenda fixa: só o que está no mapa (contagens de GC.resumoLegenda, sem linhas zeradas) e
  // uma seção por camada ligada. filtros: { severidades, areas } marcam o que está filtrado.
  // camadas: { risco, calorBO, conquistas, destaqueIA, calorIA, frota, coleta, escolas, obras, leitos, farmacias }
  // (o mapa avisa quando mudam; cada camada de js/mapa/ diz se está ligada pelo legenda()).
  GC.htmlLegendaMapa = function (lista, filtros = {}, camadas = {}) {
    const esc = (t) => GC.escaparHtml(t);
    const ML = GC.mapaLogica;
    const sevs = filtros.severidades || [];
    const areas = filtros.areas || [];
    const r = GC.resumoLegenda(lista);
    const linha = (rotulo, n, filtrado) => `<li class="leg-linha${filtrado ? ' filtrado' : ''}">${rotulo}<small>${n}</small></li>`;
    const amostra = (cor, borda) => `<i class="leg-amostra" style="background:${cor}${borda ? `;border-color:${borda}` : ''}" aria-hidden="true"></i>`;
    const secao = (titulo, corpo) => `<hr><div class="leg-secao"><strong>${titulo}</strong>${corpo}</div>`;

    const total = r.total === 1 ? '1 ocorrência' : `${r.total} ocorrências`;
    let html = `<p class="leg-dica">No mapa agora: ${total} · para filtrar, use Filtros</p>`;
    if (!r.total) {
      html += '<p class="leg-vazio">Nenhuma ocorrência no mapa com os filtros atuais.</p>';
    } else {
      html += `<ul class="leg-lista" aria-label="Por gravidade">${r.severidades.map((s) => linha(`<i class="bola ${s.chave}" aria-hidden="true"></i>${NOME_SEV[s.chave]}`, s.n, sevs.includes(s.chave))).join('')}</ul>`;
      html += `<hr><ul class="leg-lista" aria-label="Por secretaria">${r.tipos.map((t) => linha(`<span class="leg-emoji" aria-hidden="true">${t.emoji}</span>${esc(t.nome)}`, t.n, areas.includes(t.area))).join('')}</ul>`;
      // Mini-pinos com as mesmas classes do mapa (.marcador, .grupo-pinos): o desenho acompanha o do mapa.
      const pino = (classes) => `<span class="leg-pino" aria-hidden="true"><span class="marcador ${classes}"></span></span>`;
      const anel = ML.anelGrupo({ critica: 1, alta: 2, media: 2 });
      const grupo = `<span class="leg-pino" aria-hidden="true"><span class="grupo-pinos critica" style="background:${anel}"><span class="critica">5</span></span></span>`;
      html += `<hr><ul class="leg-lista leg-simbolos" aria-label="Como ler os pinos">
        <li class="leg-item">${pino('alta em_campo')}Contorno azul: equipe em campo</li>
        <li class="leg-item">${pino('critica pulsar')}Anel vermelho: prazo estourado</li>
        <li class="leg-item"><span class="leg-pino" aria-hidden="true"><span class="leg-bairro-alerta"></span></span>Bairro respirando em vermelho: tem prazo estourado sem ação</li>
        <li class="leg-item">${grupo}Círculo com número: pinos próximos (cor do mais grave, o anel mostra a mistura)</li>
      </ul>`;
    }

    if (camadas.destaqueIA) html += secao('Camada da IA', `<div class="leg-item">${amostra(ML.COR_DESTAQUE)}Bairro destacado pela IA</div>`);
    if (camadas.calorIA) html += secao('Calor da IA', ML.htmlBarraCalor());
    // "Só o que pede atenção" ligado (2 ou mais camadas): diz o que sumiu e devolve tudo num clique (js/app/camadas.js).
    if (camadas.soAtencao) {
      html += `<hr><p class="leg-atencao"><i class="ti ti-filter" aria-hidden="true"></i><span>Só o que pede atenção: o que está em dia não aparece.</span><button type="button" class="leg-mostrar-tudo" data-mostrar-tudo>Mostrar tudo</button></p>`;
    }
    // Camadas ligadas: uma parte cada (frota, coleta, escolas, obras, leitos, farmácias... risco, B.O.s, conquistas).
    const cor = (c, traco) => `<i class="leg-amostra${traco ? ' leg-traco' : ' leg-bola'}" style="background:${c}" aria-hidden="true"></i>`;
    const partes = GC.LEGENDA_CAMADAS.filter((x) => camadas[x.chave]).map((x) => ({
      camada: ML.camadaDaLegenda(x.chave), emoji: x.emoji, titulo: x.titulo,
      corpo: x.itens.map(([c, t]) => `<div class="leg-item">${cor(c, x.traco)}${esc(t)}</div>`).join('')
        + (x.nota ? `<div class="leg-item leg-nota">${esc(x.nota)}</div>` : ''),
    }));
    if (camadas.risco) {
      partes.push({ camada: 'risco', emoji: ML.EMOJI_CAMADA.risco, titulo: 'Áreas de risco',
        corpo: ['alto', 'medio', 'baixo'].map((n) => `<div class="leg-item">${amostra(ML.COR_RISCO[n], ML.COR_RISCO[n])}${{ alto: 'Risco alto (chuva em até 6 h)', medio: 'Risco médio', baixo: 'Risco baixo' }[n]}</div>`).join('')
          + '<div class="leg-item leg-nota">contorno grosso = área já atingida</div>' });
    }
    if (camadas.calorBO) partes.push({ camada: 'calor-bo', emoji: ML.EMOJI_CAMADA['calor-bo'], titulo: 'B.O.s (30 dias)', corpo: ML.htmlBarraCalor() });
    if (camadas.conquistas) partes.push({ camada: 'conquistas', emoji: ML.EMOJI_CAMADA.conquistas, titulo: 'Conquistas', corpo: '<div class="leg-item"><span class="leg-amostra leg-conquista" aria-hidden="true"><i class="ti ti-star"></i></span>Entrega concluída (clique para ver)</div>' });

    // O olho destaca a camada no mapa (as outras esmaecem; js/app/camadas.js liga o clique).
    const olho = (p) => `<button type="button" class="leg-destacar" data-fixar-camada="${p.camada}" aria-pressed="false" title="Destacar no mapa" aria-label="Destacar ${esc(p.titulo)} no mapa"><i class="ti ti-eye" aria-hidden="true"></i></button>`;
    const tituloParte = (p) => `<span class="leg-emoji" aria-hidden="true">${p.emoji}</span> ${esc(p.titulo)}`;
    if (partes.length >= ML.MIN_CAMADAS_DETALHE) {
      // Muitas camadas: a escala de cores aparece uma vez só e cada camada vira uma linha que abre o detalhe.
      const emDia = camadas.soAtencao ? 'Em dia (não aparece agora)' : 'Em dia';
      html += `<hr><div class="leg-secao leg-escala"><strong>Cores das camadas</strong>
        <div class="leg-item">${cor(SIT.critica)}Crítico</div><div class="leg-item">${cor(SIT.atencao)}Pede atenção</div><div class="leg-item">${cor(SIT.ok)}${emDia}</div>
        <div class="leg-item leg-nota">cada camada tem detalhes próprios: abra para ver</div></div>`;
      html += `<div class="leg-camadas">${partes.map((p) => `<details class="leg-camada" data-camada-leg="${p.camada}"><summary>${tituloParte(p)}${olho(p)}</summary>${p.corpo}</details>`).join('')}</div>`;
    } else {
      partes.forEach((p) => {
        html += `<hr><div class="leg-secao" data-camada-leg="${p.camada}"><strong class="leg-secao-titulo">${tituloParte(p)}${olho(p)}</strong>${p.corpo}</div>`;
      });
    }
    return html;
  };

  GC.contarFiltros = (areas, bairro) => areas.length + (bairro ? 1 : 0);

  // Com filtro, o total da cidade aparece junto: nada urgente fica escondido pelo filtro.
  GC.tituloAtencao = function (filtradas, cidade, temFiltro) {
    return temFiltro && filtradas !== cidade ? `(${filtradas} · ${cidade} na cidade)` : `(${filtradas})`;
  };

  GC.contarPiorando = (pulsos) => pulsos.filter((p) => p.positivo === false).length;

  // Escolha vazia, corrompida ou só com ids que não existem mais: mostra todas.
  GC.widgetsVisiveis = function (pulsos, escolhidos) {
    if (!Array.isArray(escolhidos)) return pulsos;
    const visiveis = pulsos.filter((p) => escolhidos.includes(p.area));
    return visiveis.length ? visiveis : pulsos;
  };

  // Um grupo de pinos mostra a maior gravidade e pulsa se esconder um prazo estourado (mesma regra do pino).
  GC.urgenciaGrupo = function (ocorrencias) {
    const severidade = SEVERIDADES.find((s) => ocorrencias.some((o) => o.severidade === s)) || 'media';
    const pulsar = ocorrencias.some((o) => GC.estourada(o) && !GC.tratada(o));
    return { severidade, pulsar };
  };
})(window.GC = window.GC || {});
