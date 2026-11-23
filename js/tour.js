(function (GC) {
  // Tour guiado: o painel se apresenta passo a passo (menu ⋯ → Tour guiado, index.html?tour
  // ou index.html?tour=N para começar no passo N).
  // Só lê o DOM e troca o hash; o painel continua clicável durante o tour, então dá para seguir as dicas.
  // Passo de tela nova: rota e alvo (`#tela-<id>`); alvo que não existe ou está escondido põe o cartão no centro.
  const PASSOS = [
    {
      titulo: '👋 Bem-vindo à Vila Dourada',
      texto: 'Hoje a informação chega espalhada: uma ligação da Defesa Civil, um relatório da Saúde, uma planilha da Infraestrutura. Este painel junta tudo num lugar só. E o prefeito não é o gargalo: cada problema vai sozinho para a secretaria certa, com prazo para pôr equipe em campo e prazo para resolver.',
      dica: 'Use → e ← (ou os botões). Durante o tour o painel continua clicável.',
      rota: '#/painel',
      antes: () => { fecharGaveta(); fecharLinhaTempo(); if (GC.fecharDashboard) GC.fecharDashboard(); },
    },
    {
      titulo: 'Os números da cidade',
      texto: 'Críticas, prazos estourados e em atendimento: só o que pede ação. Cada número é um atalho para o filtro de situação (aparece como chip sobre o mapa); clicar de novo desfaz.',
      dica: 'Clique em "prazos estourados" e veja o mapa filtrar.',
      rota: '#/painel', alvo: '#kpis',
    },
    {
      titulo: 'O menu: uma tela para cada trabalho',
      texto: 'Na lateral ficam as telas do painel: o Mapa, o Gabinete de crise, as Secretarias, os Relatórios, o Cruzamento de dados, o Calendário sazonal, a Agenda de entregas, o Plano de governo e as Demandas. O botão de cima abre o menu com os nomes.',
      rota: '#/painel', alvo: '#menu', lado: 'direita',
      antes: () => { fecharGaveta(); window.scrollTo(0, 0); },
    },
    {
      titulo: '⚙ Filtros e visualização',
      texto: 'Tudo o que filtra fica aqui: a visualização (um jeito de olhar a cidade, salvo com filtros, widgets e camadas) e, abaixo, situação, gravidade, secretarias e bairro. Vale na hora para o mapa, os alertas e os indicadores. Os filtros ligados viram chips sobre o mapa; o ✕ tira um de cada vez.',
      dica: 'Troque a visualização para "Saúde", depois "Chuva e obras", e volte para "Cidade inteira".',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (gavetaDaVez() !== 'filtros') clicar('btn-filtros'); },
    },
    {
      titulo: 'Cada ponto é um problema',
      texto: 'Todos já estão com alguém, com responsável e prazo correndo. Cor = gravidade, ícone = tipo. Pontos próximos viram um círculo com o total; clicar nele aproxima. Os que pulsam passaram do prazo: esses, sim, são com o prefeito. A Legenda, no canto, explica as cores e conta o que está no mapa.',
      dica: 'Passe o mouse num ponto. Aperte N para simular uma ocorrência: ela chega já encaminhada.',
      rota: '#/painel', alvo: '#mapa',
      antes: () => { fecharGaveta(); window.scrollTo(0, 0); },
    },
    {
      titulo: '🗂 Camadas: a cidade funcionando',
      texto: 'Além dos problemas, o mapa mostra os serviços, em grupos: leitos, medicamentos, vigilância em saúde, áreas de risco, frota, trânsito, B.O.s, coleta, obras, escolas, prédios públicos, economia local, grandes eventos e mais. Com duas ou mais ligadas, "Só o que pede atenção" esconde o que está em dia; passar o mouse numa camada destaca só ela.',
      dica: 'Ligue "Áreas de risco": o Morro da Vila Nova está vermelho e ainda não foi atingido. Depois ligue "Coleta de lixo".',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { window.scrollTo(0, 0); if (gavetaDaVez() !== 'camadas') clicar('btn-camadas'); },
    },
    {
      titulo: '🕰 Linha do tempo',
      texto: 'O botão do relógio, no canto do mapa, volta no tempo: escolha um dia (até um ano atrás) e a hora, ou toque o dia inteiro em 24 segundos. "Comparar" põe dois períodos lado a lado, em dois mapas ou numa tabela, e mostra onde os alertas subiram. Enquanto você olha o passado, alerta novo chega numa linha discreta no alto.',
      dica: 'Clique no relógio, arraste a régua para a manhã e depois volte com "Ao vivo".',
      rota: '#/painel', alvo: '.ctrl-linha-tempo', lado: 'esquerda',
      antes: () => { fecharGaveta(); },
    },
    {
      titulo: '☀ Resumo do dia e da semana',
      texto: 'Na base do mapa: o Resumo do dia (o que pede decisão hoje e o que vai estourar em 2 horas), o Resumo da semana (o que andou e o que vem aí), "Desde a última visita" (o que mudou enquanto você esteve fora) e os Indicadores.',
      dica: 'Abra "Desde a última visita".',
      rota: '#/painel', alvo: '#doca', lado: 'acima',
      antes: () => { fecharGaveta(); fecharLinhaTempo(); },
    },
    {
      titulo: '🔔 Alertas: o que precisa de você',
      texto: 'Uma gaveta pela direita, sem cobrir o mapa. "Precisam de você" só traz o que fugiu do normal, e cada item diz o porquê: ⏰ prazo estourado ou perto de estourar, 🤝 mais de uma secretaria, 🔁 caso que se repete no bairro. "Ativos" lista tudo; "Cobranças" acompanha o que você cobrou, perguntou ou delegou.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (gavetaDaVez() !== 'atencao') clicar('btn-alertas'); },
    },
    {
      titulo: 'O detalhe mostra o motivo',
      texto: 'A regra que disparou, os números, a linha do tempo e os dois prazos: pôr equipe em campo e resolver. A secretaria trabalha por aqui: despacha a equipe, pausa com motivo, pede mais prazo ou devolve para a pasta certa.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (!gavetaAberta()) { const c = cartaoHospital(); if (c) c.click(); } },
    },
    {
      titulo: 'Agir: o prefeito não aciona, ele cobra',
      texto: '📣 Cobrar: a secretaria responde por escrito, no prazo. ⚡ Priorizar: o tempo que falta cai pela metade. 🚨 Gabinete de crise: reúne as secretarias. Em "Mais ações": pedir explicação, delegar, adiar com motivo, acionar órgão de fora, avisar a população. Errou? "Desfazer" (ou Ctrl+Z) volta atrás.',
      dica: 'Clique em 📣 Cobrar: a cobrança espera a resposta da secretaria (nada responde sozinho).',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (!gavetaAberta()) { const c = cartaoHospital(); if (c) c.click(); } },
    },
    {
      titulo: '🛞 Maia',
      texto: 'O prefeito também pode perguntar: leitos de UTI, onde vai alagar, obras atrasadas, o que vem aí na agenda de entregas… A resposta vem com gráfico, de onde saíram os números e um botão que abre a camada certa no mapa. O botão "Ações" traz pedidos prontos, como o briefing do dia, o relatório da semana e o card para as redes. A IA aqui é simulada.',
      dica: 'Pergunte "Como estão os leitos de UTI?" e clique no botão que abre o mapa. Esc limpa o mapa.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (gavetaDaVez() !== 'copiloto') clicar('chat-aba'); },
    },
    {
      titulo: '▦ Indicadores e widgets',
      texto: 'Indicadores, na base do mapa, sobe uma gaveta com duas abas: Painel (os widgets da visualização) e Fichas (cada indicador com meta, fórmula e fonte). Um widget pode ser fixado sobre o mapa pelo alfinete; quais aparecem, e em que ordem, se escolhe no botão Personalizar, no alto da gaveta.',
      dica: 'Fixe um widget no mapa pelo alfinete do cartão.',
      rota: '#/painel', alvo: '#widgets',
      antes: () => { fecharGaveta(); if (document.getElementById('ir-dashboard').getAttribute('aria-expanded') !== 'true') clicar('ir-dashboard'); },
    },
    {
      titulo: '🔔 Central de alertas',
      texto: 'A versão completa da gaveta Alertas: tudo o que está acontecendo, numa tabela que segue os filtros do mapa, com busca, agrupamento, casos recorrentes, cobrança em lote e CSV. As regras que disparam cada alerta ficam no atalho "Regras de alerta": regra gerando alarme demais? Pause.',
      dica: 'Marque duas linhas e veja as ações em lote.',
      rota: '#/alertas', alvo: '#tela-alertas',
    },
    {
      titulo: '🚨 Gabinete de crise',
      texto: 'Quando um problema envolve várias secretarias, o gabinete reúne todas, com demandas por pasta, prazos e as questões que a sala precisa responder, a partir de um modelo pronto para cada tipo de crise. Com um gabinete aberto, o painel entra no modo de crise: faixa no topo, relógio da crise e a vista "Sala de crise".',
      rota: '#/crise', alvo: '#tela-crise',
    },
    {
      titulo: 'Quem está dando conta',
      texto: 'Se o prefeito não aciona cada coisa, ele precisa saber quem entrega: quanto foi resolvido no mês, quanto ficou no prazo e quem está atrasando. Cada secretaria tem a sua página, com 12 meses de evolução, metas pactuadas e plano de ação.',
      rota: '#/secretarias', alvo: '#tela-secretarias',
    },
    {
      titulo: '🎯 Plano de governo',
      texto: 'Os compromissos da gestão, com o progresso tirado dos indicadores e das entregas ligadas a eles, ou informado pela secretaria. O placar no topo filtra por situação, e a ficha de cada compromisso abre ao lado.',
      rota: '#/metas', alvo: '#tela-metas',
    },
    {
      titulo: '📅 Agenda de entregas',
      texto: 'Toda obra, serviço e programa com data: o que vem aí, o que está fora do prazo e o que já foi entregue. A secretaria confirma ou remarca com motivo, e o prefeito marca a inauguração.',
      rota: '#/entregas', alvo: '#tela-entregas',
    },
    {
      titulo: '☀ Calendário sazonal',
      texto: 'Chuvas, dengue, férias, festas: o que costuma acontecer em cada mês, com o pico tirado do histórico e o que fazer antes. Cada ação pode virar uma demanda para a secretaria, com prazo sugerido na véspera da temporada.',
      rota: '#/sazonal', alvo: '#tela-sazonal',
    },
    {
      titulo: '📋 Demandas',
      texto: 'Tudo o que foi passado para alguém fazer, de um alerta, de uma temporada, do gabinete de crise ou avulso: quem faz, até quando e o que já andou. Quem executa recebe no Portal do servidor, dá notícia e tira dúvida por lá.',
      rota: '#/demandas', alvo: '#tela-tarefas',
    },
    {
      titulo: '📊 Cruzamento de dados',
      texto: 'Dois indicadores lado a lado, bairro por bairro: onde os dois estão ruins ao mesmo tempo? O resultado pinta o mapa em grupos e diz o quanto os dois andam juntos.',
      rota: '#/cruzamento', alvo: '#tela-cruzamento',
    },
    {
      titulo: 'Relatório pronto para a reunião',
      texto: 'O executivo dos últimos 30 dias, com recomendações: quem cobrar, sobre o quê e por quê. Também por secretaria, bairro, entregas ou comparação. "Montar" escolhe as seções; sai em PDF, Word ou Excel, com a marca da Prefeitura.',
      dica: 'Clique em ⬇ PDF.',
      rota: '#/relatorios/executivo/-/30', alvo: '#tela-relatorios',
    },
    {
      titulo: '🏙 Mais opções e a demonstração',
      texto: 'No seu avatar ficam o modo telão (para a sala de situação), os dados por trás dos números, regras de alerta, prazos, usuários e permissões, auditoria e personalização. Em Demonstração: três cidades de portes diferentes e o perfil, para ver o painel como secretário, diretor de unidade, servidor ou cidadão.',
      dica: 'Troque o perfil para um secretário e veja o "Para fazer hoje" no Resumo do dia.',
      rota: '#/painel', alvo: '#menu-mais', lado: 'esquerda',
      antes: () => {
        window.scrollTo(0, 0);
        const menu = document.getElementById('menu-mais');
        if (menu && menu.hidden) clicar('btn-mais');
      },
    },
    {
      titulo: 'É isso.',
      texto: 'Tudo o que o prefeito precisa saber da cidade, num lugar só: ele vê a cidade, entende o que saiu do normal (e o que vai sair, como a chuva nas encostas), age só ali e acompanha quem entrega. Próximos passos: dados reais das secretarias e a IA real.',
      rota: '#/painel',
      antes: () => { window.scrollTo(0, 0); const menu = document.getElementById('menu-mais'); if (menu && !menu.hidden) clicar('btn-mais'); },
    },
  ];

  // Qual gaveta (Filtros, Camadas, Widgets, Maia, alerta) está aberta.
  const gavetaDaVez = () => document.getElementById('gavetas').dataset.aberta || null;
  const gavetaAberta = () => gavetaDaVez() === 'alerta';
  const clicar = (id) => { const el = document.getElementById(id); if (el) el.click(); };

  // Qualquer gaveta fecha no Esc.
  function fecharGaveta() {
    if (gavetaDaVez()) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  // A linha do tempo ocupa a base do mapa: sai da frente no começo e no passo da doca.
  function fecharLinhaTempo() {
    if (!document.body.classList.contains('com-linha-tempo')) return;
    const b = document.querySelector('.ctrl-linha-tempo');
    if (b) b.click();
  }

  function cartaoHospital() {
    const cartoes = [...document.querySelectorAll('#gaveta-atencao .alerta-item')];
    return cartoes.find((c) => /hospital/i.test(c.textContent)) || cartoes[0];
  }

  // Alvo visível do passo (null: cartão no centro da tela).
  function elementoAlvo(passo) {
    const el = passo.alvo && document.querySelector(passo.alvo);
    return el && el.getBoundingClientRect().width ? el : null;
  }

  GC.criarTour = function () {
    const foco = document.createElement('div');
    foco.className = 'tour-foco';
    const cartao = document.createElement('div');
    cartao.className = 'tour-cartao';
    cartao.setAttribute('role', 'dialog');
    cartao.setAttribute('aria-live', 'polite');
    let atual = -1;
    let relogio = null;

    function posicionar() {
      const passo = PASSOS[atual];
      const el = passo && elementoAlvo(passo);
      const vw = innerWidth;
      const vh = innerHeight;
      const m = 16;
      const c = cartao.getBoundingClientRect();
      if (!el) {
        foco.classList.add('sem-alvo');
        Object.assign(foco.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
        Object.assign(cartao.style, { left: `${(vw - c.width) / 2}px`, top: `${(vh - c.height) / 2}px` });
        return;
      }
      foco.classList.remove('sem-alvo');
      // Recorta o alvo à janela (as telas com rolagem passam da altura da tela).
      const b = el.getBoundingClientRect();
      const r = { left: Math.max(b.left, 0), top: Math.max(b.top, 0), right: Math.min(b.right, vw), bottom: Math.min(b.bottom, vh) };
      Object.assign(foco.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.right - r.left + 12}px`, height: `${r.bottom - r.top + 12}px` });

      const limitar = (v, min, max) => Math.min(Math.max(v, min), max);
      const xAlinhado = limitar(r.left, m, vw - c.width - m);
      const yAlinhado = limitar(r.top, m, vh - c.height - m);
      const opcoes = [
        { lado: 'abaixo', left: xAlinhado, top: r.bottom + 14, cabe: r.bottom + 14 + c.height <= vh - m },
        { lado: 'acima', left: xAlinhado, top: r.top - 14 - c.height, cabe: r.top - 14 - c.height >= m },
        { lado: 'direita', left: r.right + 14, top: yAlinhado, cabe: r.right + 14 + c.width <= vw - m },
        { lado: 'esquerda', left: r.left - 14 - c.width, top: yAlinhado, cabe: r.left - 14 - c.width >= m },
      ].sort((a, b) => (b.lado === passo.lado) - (a.lado === passo.lado));
      // Alvo grande (uma tela inteira): o cartão fica por cima, no canto de baixo.
      const pos = opcoes.find((o) => o.cabe) || { left: limitar(r.right - c.width - 24, m, vw - c.width - m), top: limitar(r.bottom - c.height - 24, m, vh - c.height - m) };
      Object.assign(cartao.style, { left: `${pos.left}px`, top: `${pos.top}px` });
    }

    function desenhar() {
      const passo = PASSOS[atual];
      const ultimo = atual === PASSOS.length - 1;
      cartao.innerHTML = `
        <div class="tour-topo"><span>Passo ${atual + 1} de ${PASSOS.length}</span><button type="button" class="tour-sair" aria-label="Sair do tour">✕</button></div>
        <h3>${GC.escaparHtml(passo.titulo)}</h3>
        <p>${GC.escaparHtml(passo.texto)}</p>
        ${passo.dica ? `<p class="tour-dica">👉 ${GC.escaparHtml(passo.dica)}</p>` : ''}
        <div class="tour-barra"><i style="width:${((atual + 1) / PASSOS.length) * 100}%"></i></div>
        <div class="tour-pe">
          <button type="button" class="btn-sec tour-voltar"${atual === 0 ? ' disabled' : ''}>← Voltar</button>
          <button type="button" class="tour-proximo">${ultimo ? 'Concluir ✓' : 'Próximo →'}</button>
        </div>`;
      cartao.querySelector('.tour-sair').onclick = encerrar;
      cartao.querySelector('.tour-voltar').onclick = () => ir(atual - 1);
      cartao.querySelector('.tour-proximo').onclick = () => (ultimo ? encerrar() : ir(atual + 1));
      posicionar();
    }

    function ir(i) {
      if (i < 0 || i >= PASSOS.length) return;
      atual = i;
      const passo = PASSOS[i];
      const trocouTela = passo.rota && location.hash !== passo.rota;
      if (passo.rota && passo.rota !== '#/painel') { fecharGaveta(); fecharLinhaTempo(); }
      if (trocouTela) location.hash = passo.rota;
      // Vindo de outra tela, o painel dela leva um instante para sair da frente do mapa.
      if (passo.antes) setTimeout(passo.antes, trocouTela ? 450 : 0);
      desenhar();
    }

    function teclas(ev) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (ev.key === 'ArrowRight') ir(atual + 1);
      if (ev.key === 'ArrowLeft') ir(atual - 1);
    }

    function iniciar(passo = 1) {
      if (atual >= 0) return;
      document.body.append(foco, cartao);
      document.addEventListener('keydown', teclas);
      // Telas, gaveta e mapa mudam de tamanho com transições: o destaque acompanha.
      relogio = setInterval(posicionar, 200);
      addEventListener('resize', posicionar);
      ir(Math.min(Math.max(passo, 1), PASSOS.length) - 1);
    }

    function encerrar() {
      atual = -1;
      clearInterval(relogio);
      removeEventListener('resize', posicionar);
      document.removeEventListener('keydown', teclas);
      foco.remove();
      cartao.remove();
    }

    return { iniciar, encerrar, passos: PASSOS };
  };

  document.addEventListener('DOMContentLoaded', () => {
    const tour = GC.criarTour();
    document.getElementById('btn-tour').addEventListener('click', () => tour.iniciar());
    const pedido = location.search.match(/[?&]tour(?:=(\d+))?/);
    if (pedido) setTimeout(() => tour.iniciar(Number(pedido[1]) || 1), 1500);
  });
})(window.GC = window.GC || {});
