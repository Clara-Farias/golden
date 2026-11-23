(function (GC) {
  // Ações prontas da Maia: o catálogo que aparece na própria caixa da Maia (botão "Ações" e atalhos acima do campo).
  // Cada ação é um pedido pronto em linguagem natural; a Maia monta a resposta com os dados de agora, como se o
  // pedido tivesse sido digitado. Nada aqui responde: só diz o que pedir. O motor (js/ia-roteiro.js) continua o mesmo.
  // Uma ação = { id, icone (Tabler, sem o "ti-"), nome, descricao, formato, pergunta }.
  // O catálogo muda com o perfil (o gestor do setor não cobra a própria pasta) e com a tela aberta (contexto.foco).

  // O que a Maia faz na tela aberta (js/ia/foco-*.js). Vem primeiro no catálogo e nos atalhos.
  const DA_TELA = {
    gabinete: [
      { id: 'gabinete-falta', icone: 'checklist', nome: 'O que falta neste gabinete', descricao: 'Demandas atrasadas, último comunicado e o próximo passo da sala.', formato: 'Análise', pergunta: 'O que falta neste gabinete?' },
      { id: 'gabinete-comunicado', icone: 'speakerphone', nome: 'Comunicado da crise', descricao: 'O texto da fase sugerida, pronto para revisar e publicar na aba Comunicado.', formato: 'Texto editável', pergunta: 'Escreva o comunicado' },
    ],
    relatorio: [
      { id: 'relatorio-resumo', icone: 'file-description', nome: 'Resumir este relatório', descricao: 'Os três pontos principais, a tendência e o que fazer primeiro.', formato: 'Análise', pergunta: 'Resuma este relatório' },
    ],
    resumoDia: [
      { id: 'resumo-dia-comecar', icone: 'flag', nome: 'Por onde começar hoje', descricao: 'A primeira decisão do dia, com o motivo e a ação sugerida.', formato: 'Análise', pergunta: 'Por onde começar hoje?' },
    ],
    decisoes: [
      { id: 'decisoes-comecar', icone: 'list-check', nome: 'Organizar os alertas', descricao: 'Separa o que pede cobrança, o que pede gabinete e o que se repete no bairro.', formato: 'Análise', pergunta: 'Por onde começar?' },
    ],
    cruzamento: [
      { id: 'cruzamento-explicar', icone: 'chart-dots', nome: 'Explicar este cruzamento', descricao: 'A relação em palavras, os bairros ruins nos dois e por onde começar.', formato: 'Análise + mapa', pergunta: 'Explique este cruzamento' },
    ],
  };

  const ENTENDER = [
    { id: 'primeiro', icone: 'flag', nome: 'O que fazer primeiro', descricao: 'A ocorrência mais urgente agora, com a ação sugerida.', formato: 'Análise', pergunta: 'O que devo fazer primeiro?' },
    { id: 'resumo-semana', icone: 'calendar-stats', nome: 'Resumo da semana', descricao: 'O que melhorou e o que piorou, com o gráfico das variações.', formato: 'Análise + gráfico', pergunta: 'Resumo da semana' },
    { id: 'pior-bairro', icone: 'map-pin-exclamation', nome: 'Bairro mais crítico', descricao: 'Os bairros pela gravidade do que está aberto.', formato: 'Análise + gráfico', pergunta: 'Qual bairro está pior hoje?' },
    { id: 'porque', icone: 'trending-down', nome: 'Por que piorou', descricao: 'O indicador que mais piorou, os bairros que puxaram e o prazo da secretaria.', formato: 'Análise', pergunta: 'Por que piorou?' },
    { id: 'sazonal', icone: 'calendar-month', nome: 'O que preparar para os próximos meses', descricao: 'A temporada em curso, o que preparar agora para a próxima e os compromissos de preparo atrasados.', formato: 'Análise + gráfico', pergunta: 'O que preparar para os próximos meses?' },
    { id: 'entregas', icone: 'package', nome: 'O que vamos entregar', descricao: 'As entregas dos próximos 30 dias, as paradas, atrasadas ou em risco e o que já foi concluído no ano.', formato: 'Análise + gráfico', pergunta: 'O que vamos entregar nos próximos 30 dias?' },
    { id: 'entregas-risco', icone: 'alert-triangle', nome: 'Entregas em risco', descricao: 'As entregas paradas, atrasadas ou com o ritmo abaixo do esperado, da mais grave para a menos grave.', formato: 'Análise + mapa', pergunta: 'Quais entregas estão em risco ou atrasadas?' },
    { id: 'cruzar', icone: 'chart-dots', nome: 'Cruzar dois indicadores', descricao: 'Bairro a bairro: onde as duas coisas estão ruins ao mesmo tempo, com o mapa e a planilha.', formato: 'Análise + mapa', pergunta: 'Cruze B.O.s com quedas de energia', perguntaSetor: 'Cruze satisfação com ocorrências abertas' },
    { id: 'fazer-hoje', icone: 'inbox', nome: 'O que vai estourar', nomeSetor: 'O que fazer hoje', descricao: 'O que vai estourar o prazo nas próximas 2 h sem equipe; para a pasta, a caixa de entrada em ordem de urgência.', formato: 'Análise', pergunta: 'O que vai estourar nas próximas 2 horas?', perguntaSetor: 'O que eu preciso fazer hoje?' },
    { id: 'metas-reuniao', icone: 'target-arrow', nome: 'Metas e reunião de resultados', nomeSetor: 'Preparar a reunião de resultados', descricao: 'As metas que esperam pacto, os planos de ação atrasados e a pauta da reunião com a pasta.', formato: 'Análise', pergunta: 'Como estão as metas pactuadas?', perguntaSetor: 'Prepare a reunião de resultados' },
    { id: 'cobrancas', icone: 'speakerphone', nome: 'Cobranças sem resposta', nomeSetor: 'Cobranças para responder', descricao: 'O que espera a sua decisão, o que venceu sem resposta e o que está em andamento.', formato: 'Análise', pergunta: 'Quais cobranças estão sem resposta?', perguntaSetor: 'O que eu tenho para responder?' },
    { id: 'prazos', icone: 'clock-exclamation', nome: 'Quem está atrasando', descricao: 'As secretarias pelo atendimento no prazo nos últimos 30 dias.', formato: 'Análise + gráfico', pergunta: 'Quem está atrasando os prazos?', soGeral: true },
  ];

  const ESCREVER = [
    { id: 'oficio', icone: 'file-text', nome: 'Ofício de cobrança', descricao: 'Para a secretaria, com as ocorrências fora do prazo e o pedido de um plano em 48 h.', formato: 'Texto editável + PDF', pergunta: 'Escreva um ofício de cobrança', soGeral: true },
    { id: 'comunicado', icone: 'speakerphone', nome: 'Comunicado à população', descricao: 'Sobre a ocorrência mais grave, com a orientação e a versão SMS.', formato: 'Texto + SMS + PDF', pergunta: 'Escreva um comunicado à população' },
    { id: 'nota', icone: 'news', nome: 'Nota à imprensa', descricao: 'Casos do mês, variação, prazo e o atendimento do momento.', formato: 'Texto editável + PDF', pergunta: 'Escreva uma nota à imprensa' },
    { id: 'post', icone: 'brand-instagram', nome: 'Legenda para redes sociais', descricao: 'Entregas, números do mês e a próxima entrega; versão longa e curta. Junte com um card.', formato: 'Legenda + versão curta', pergunta: 'Escreva a legenda do post para as redes sociais' },
    { id: 'resposta', icone: 'message-reply', nome: 'Resposta ao cidadão', descricao: 'A situação do caso em aberto no bairro, sem prometer prazo vencido.', formato: 'Texto editável + PDF', pergunta: 'Escreva uma resposta ao cidadão' },
  ];

  // Arquivos para baixar (js/ia/arquivos.js): o resumo vem no chat e o arquivo sai com os dados de agora.
  const GERAR = [
    { id: 'relatorio', icone: 'report-analytics', nome: 'Relatório executivo', nomeSetor: 'Relatório da secretaria', descricao: 'Indicadores, painel das secretarias, o que precisa de atenção e as recomendações.', formato: 'PDF ou CSV', pergunta: 'Gere o relatório executivo dos últimos 30 dias', perguntaSetor: 'Gere o relatório da minha secretaria' },
    { id: 'prestacao', icone: 'building-bank', nome: 'Prestação de contas', descricao: 'Resultados por secretaria, orçamento, compromissos do plano e o que ficou pendente, para a Câmara ou a imprensa.', formato: 'PDF ou Word', pergunta: 'Gere a prestação de contas dos últimos 90 dias', soGeral: true },
    { id: 'briefing', icone: 'map-pin', nome: 'Briefing de visita ao bairro', descricao: 'O que está aberto, as unidades, as entregas e os pontos para a conversa. Sem bairro, o mais crítico.', formato: 'PDF', pergunta: 'Gere o briefing de visita ao bairro' },
    { id: 'pauta', icone: 'clipboard-list', nome: 'Pauta do secretariado', descricao: 'O que pede decisão, quem está fora da meta e os compromissos críticos do plano, com responsável e prazo.', formato: 'PDF ou Word', pergunta: 'Prepare a pauta da reunião do secretariado', soGeral: true },
    { id: 'planilha', icone: 'table', nome: 'Planilha da base', descricao: 'Ocorrências, secretarias, bairros e indicadores de 12 meses, uma aba cada.', formato: 'Excel ou CSV', pergunta: 'Gere uma planilha Excel com as ocorrências abertas' },
  ];

  // Para as redes e para ouvir (js/ia/cards.js, js/ia/audio.js): prévia no balão, PNG/SVG ou o player.
  const DIVULGAR = [
    { id: 'card-numero', icone: 'number', nome: 'Card: número em destaque', descricao: 'O indicador que mais melhorou (ou o da secretaria que você citar), com a variação.', formato: 'PNG 1080 × 1080', pergunta: 'Faça um card para as redes com o número em destaque' },
    { id: 'card-evolucao', icone: 'chart-bar', nome: 'Card: evolução em 6 meses', descricao: 'Mini gráfico de barras da série da secretaria, com a meta.', formato: 'PNG 1080 × 1080', pergunta: 'Faça um card para as redes com a evolução em 6 meses' },
    { id: 'card-aviso', icone: 'alert-triangle', nome: 'Card: aviso à população', descricao: 'Risco de chuva na área mais exposta, com a orientação e os telefones 199 e 193.', formato: 'PNG 1080 × 1080', pergunta: 'Faça um card para as redes com o aviso de chuva', soGeral: true },
    { id: 'card-entrega', icone: 'circle-check', nome: 'Card: entrega à população', descricao: 'A obra ou serviço entregue mais recente, com o bairro e a data.', formato: 'PNG 1080 × 1080', pergunta: 'Faça um card para as redes sobre a última entrega', soGeral: true },
    { id: 'audio', icone: 'headphones', nome: 'Resumo em áudio', descricao: 'O resumo da semana lido em voz alta, para ouvir no carro.', formato: 'Áudio + roteiro', pergunta: 'Leia o resumo da semana em voz alta' },
  ];

  // Em lote: a Maia lista o que vai fazer e só age no botão de confirmar.
  const AGIR = [
    { id: 'cobrar-atrasadas', icone: 'bell-ringing', nome: 'Cobrar as atrasadas', descricao: 'Lista as ocorrências com prazo estourado e cobra todas depois da sua confirmação.', formato: 'Pede confirmação', pergunta: 'Cobrar todas as atrasadas', soGeral: true },
    { id: 'priorizar-criticas', icone: 'bolt', nome: 'Priorizar as críticas', descricao: 'Lista as críticas em aberto e prioriza todas depois da sua confirmação.', formato: 'Pede confirmação', pergunta: 'Priorize todas as críticas' },
  ];

  // Atalhos acima do campo, sem tela aberta: os pedidos mais comuns.
  const ATALHOS = ['primeiro', 'resumo-semana', 'oficio', 'comunicado', 'pior-bairro'];

  // { grupos: [{ id, titulo, acoes }], atalhos: [ação] } para o perfil e a tela. Cidadão: nada.
  GC.acoesProntasMaia = function ({ perfil = GC.perfil, foco = null, sugestoes = [] } = {}) {
    if (perfil && GC.visaoDe(perfil) === 'portal') return { grupos: [], atalhos: [] };
    const setor = !!(perfil && GC.visaoDe(perfil) === 'pasta');
    const vale = (a) => !(setor && a.soGeral);
    // O gestor do setor tem o pedido da pasta dele (relatório da secretaria, cruzamento com o que é dele).
    const doPerfil = (a) => (setor && a.perguntaSetor ? Object.assign({}, a, { nome: a.nomeSetor || a.nome, pergunta: a.perguntaSetor }) : a);
    const daTela = (foco && DA_TELA[foco.tipo]) || [];
    const grupos = [
      { id: 'tela', titulo: 'Nesta tela', acoes: daTela },
      { id: 'entender', titulo: 'Entender', acoes: ENTENDER.filter(vale).map(doPerfil) },
      { id: 'escrever', titulo: 'Escrever', acoes: ESCREVER.filter(vale) },
      // O gestor do setor gera o relatório da própria pasta.
      { id: 'gerar', titulo: 'Gerar arquivo', acoes: GERAR.filter(vale).map(doPerfil) },
      { id: 'divulgar', titulo: 'Para as redes e para ouvir', acoes: DIVULGAR.filter(vale) },
      { id: 'agir', titulo: 'Agir em lote', acoes: AGIR.filter(vale) },
      { id: 'perguntas', titulo: 'Perguntas de exemplo', acoes: sugestoes.slice(0, 4).map((s, i) => ({ id: `pergunta-${i}`, icone: 'message-question', nome: s, pergunta: s })) },
    ].filter((g) => g.acoes.length);
    const todas = grupos.flatMap((g) => g.acoes);
    const comuns = ATALHOS.map((id) => todas.find((a) => a.id === id)).filter(Boolean);
    const atalhos = [...daTela, ...comuns].slice(0, 4);
    return { grupos, atalhos };
  };
})(window.GC = window.GC || {});
