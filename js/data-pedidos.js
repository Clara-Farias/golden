(function (GC) {
  // Pedidos de moradores que já estavam no portal quando a demonstração começa (js/pedidos.js os usa como
  // estado inicial). Tempos em minutos atrás; posições pelo centro do bairro (vale para as três cidades).
  // O buraco com 9 relatos é o momento da demo: o 10º relato faz a ocorrência subir para "alta" no painel.
  const bs = GC.data.bairros;
  const bairro = (k) => bs[k % bs.length];
  const ponto = (k, dLat, dLng) => {
    const b = bairro(k);
    return { bairroId: b.id, lat: +(b.centro[0] + dLat).toFixed(5), lng: +(b.centro[1] + dLng).toFixed(5) };
  };
  const sec = (area) => ((GC.data.areas.find((a) => a.id === area) || {}).secretaria || { nome: 'Secretaria' }).nome;

  const pontos = [
    Object.assign({ id: 'pt-d1', tipo: 'buraco', area: 'infraestrutura', relatos: 9, haMin: 1560, situacao: 'encaminhado', detalhe: `Na fila da ${sec('infraestrutura')}`,
      linha: [['recebido', 'Pedido recebido', 1560], ['encaminhado', `Na fila da ${sec('infraestrutura')}`, 1555]] }, ponto(6, 0.0021, -0.0018)),
    Object.assign({ id: 'pt-d2', tipo: 'iluminacao', area: 'infraestrutura', relatos: 3, haMin: 300, situacao: 'em_campo', detalhe: 'Equipe no local',
      linha: [['recebido', 'Pedido recebido', 300], ['encaminhado', `Na fila da ${sec('infraestrutura')}`, 296], ['encaminhado', 'Equipe a caminho', 60], ['em_campo', 'Equipe no local', 25]] }, ponto(2, -0.0016, 0.0024)),
    Object.assign({ id: 'pt-d3', tipo: 'entulho', area: 'limpeza', relatos: 4, haMin: 4320, situacao: 'resolvido', detalhe: 'Serviço feito',
      evidencia: { texto: 'Entulho recolhido e calçada lavada. Placa de "proibido jogar lixo" instalada na esquina.', haMin: 2900 },
      linha: [['recebido', 'Pedido recebido', 4320], ['encaminhado', `Na fila da ${sec('limpeza')}`, 4315], ['em_campo', 'Equipe no local', 3000], ['resolvido', 'Serviço feito', 2900]] }, ponto(5, -0.0024, 0.0012)),
    Object.assign({ id: 'pt-d4', tipo: 'bueiro', area: 'limpeza', relatos: 2, haMin: 2880, situacao: 'resolvido', detalhe: 'Serviço feito',
      evidencia: { texto: 'Bueiro desobstruído: 3 sacos de folhas e areia retirados.', haMin: 2400 },
      linha: [['recebido', 'Pedido recebido', 2880], ['encaminhado', `Na fila da ${sec('limpeza')}`, 2875], ['em_campo', 'Equipe no local', 2460], ['resolvido', 'Serviço feito', 2400]] }, ponto(4, 0.0018, 0.0026)),
    Object.assign({ id: 'pt-d5', tipo: 'arvore', area: 'defesa_civil', relatos: 1, haMin: 90, situacao: 'encaminhado', detalhe: 'Equipe a caminho',
      linha: [['recebido', 'Pedido recebido', 90], ['encaminhado', `Na fila da ${sec('defesa_civil')}`, 86], ['encaminhado', 'Equipe a caminho', 20]] }, ponto(0, -0.002, -0.0022)),
  ];

  const pedidos = [];
  const relatos = (pontoId, lista) => lista.forEach(([haMin, descricao, avaliacao]) => pedidos.push({ pontoId, haMin, descricao, avaliacao: avaliacao || null }));
  relatos('pt-d1', [
    [1560, 'Buraco grande na faixa da direita, carro já furou pneu.'], [1490, ''], [1310, 'Está aumentando com a chuva.'], [1100, ''],
    [900, 'Moto quase caiu aqui ontem à noite.'], [640, ''], [420, 'Fica em frente à padaria.'], [260, ''], [95, 'Continua aberto.'],
  ]);
  relatos('pt-d2', [[300, 'Três postes apagados seguidos, rua muito escura.'], [210, ''], [150, 'Perigoso para quem volta do ponto de ônibus.']]);
  relatos('pt-d3', [
    [4320, 'Entulho de obra na calçada, tem que andar pela rua.', { nota: 5, resolvido: true, comentario: 'Rápido e bem feito.', haMin: 2700 }],
    [4200, '', { nota: 4, resolvido: true, comentario: '', haMin: 2600 }],
    [3900, 'Já tem rato.', { nota: 2, resolvido: true, comentario: 'Demorou dois dias.', haMin: 2500 }],
    [3600, ''],
  ]);
  relatos('pt-d4', [
    [2880, 'Bueiro entupido, a rua alaga com qualquer chuva.', { nota: 4, resolvido: true, comentario: '', haMin: 2300 }],
    [2700, '', { nota: 5, resolvido: true, comentario: 'Obrigada!', haMin: 2200 }],
  ]);
  relatos('pt-d5', [[90, 'Galho grande caído em cima da fiação.']]);

  GC.data.pedidosIniciais = { pontos, pedidos };
})(window.GC = window.GC || {});
