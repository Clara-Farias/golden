(function (GC) {
  // Perfis de acesso (da proposta "versão clara": GMX, GST e CID):
  // - prefeito (gestor geral): Prefeito(a), Gabinete, Planejamento. Vê e age em tudo.
  // - setor (gestor setorial): secretário(a) de uma pasta. Tudo travado na pasta dele; não cobra outras
  //   secretarias nem convoca gabinete (isso é do prefeito); prioriza o que é da pasta e avança as tarefas
  //   dela no gabinete de crise.
  // - cidadao: interface aberta. Avisos, "meu bairro", perguntas frequentes e indicadores públicos; nada
  //   interno (alertas, Maia, dashboard, dados, camadas sensíveis).
  // Escolha: ?perfil=prefeito|setor|cidadao (&area=<secretaria> no setor), senão o último escolhido, senão prefeito.
  // Trocar recarrega a página (como a troca de cidade): cada perfil abre limpo.
  // Roda depois de store.js (filtra GC.acoesDisponiveis) e antes da interface.

  GC.PERFIS = [
    { id: 'prefeito', nome: 'Gestor geral', quem: 'Prefeito(a), Gabinete e Planejamento', emoji: '🏛', descricao: 'Todas as secretarias, alertas, gabinete de crise, Maia e dados.' },
    { id: 'setor', nome: 'Gestor do setor', quem: 'Secretário(a) e coordenadores de uma pasta', emoji: '👤', descricao: 'Só a própria secretaria: alertas, indicadores, relatórios e as demandas dela nos gabinetes de crise.' },
    { id: 'servidor', nome: 'Servidor(a)', quem: 'Quem executa as demandas de uma pasta', emoji: '👤', descricao: 'Portal do servidor: as demandas passadas à pessoa, para atualizar, tirar dúvidas e concluir. Sem nada de gestão.' },
    { id: 'cidadao', nome: 'Cidadão', quem: 'Qualquer pessoa (interface aberta)', emoji: '👥', descricao: 'Avisos da Prefeitura, serviços do bairro, perguntas frequentes e indicadores públicos.' },
  ];

  const CHAVE = 'vd-perfil';
  const valido = (id) => GC.PERFIS.some((p) => p.id === id);
  const areaValida = (a) => ((GC.data && GC.data.areas) || []).some((x) => x.id === a);

  // Perfil a partir dos dados de entrada (testável): { id, area }. Setor sem área válida cai na primeira pasta.
  GC.resolverPerfil = function (id, area) {
    const pid = valido(id) ? id : 'prefeito';
    if (!GC.perfilDePasta(pid)) return { id: pid, area: null };
    return { id: pid, area: areaValida(area) ? area : GC.data.areas[0].id };
  };

  function escolher() {
    if (GC.perfilForcado) return GC.resolverPerfil(GC.perfilForcado.id, GC.perfilForcado.area);
    // Login ligado (?login=1, js/sessao.js): o perfil é o do usuário que entrou, não o da URL.
    const logado = GC.loginExigido && GC.sessao && GC.sessao.atual();
    if (logado) return GC.resolverPerfil(logado.perfil, logado.area);
    try {
      const q = new URLSearchParams(window.location.search);
      // "Ver o painel como este perfil" (tela de perfis): ?papel=<id> abre o painel com aquele perfil, sem login.
      const papel = q.get('papel') ? GC.papelPorId(q.get('papel')) : null;
      const doPapel = GC.perfilDoPapel(papel);
      if (doPapel && doPapel !== 'cidadao') return Object.assign(GC.resolverPerfil(doPapel, q.get('area')), { papel: papel.id });
      if (q.get('perfil')) return GC.resolverPerfil(q.get('perfil'), q.get('area'));
      const salvo = JSON.parse(window.localStorage.getItem(CHAVE) || 'null');
      if (salvo) return GC.resolverPerfil(salvo.id, salvo.area);
    } catch (e) { /* sem location/localStorage (testes, modo privado) */ }
    return GC.resolverPerfil('prefeito');
  }

  // Cada perfil tem a sua página: o cidadão, o Portal do Cidadão (cidadao.html), sem nada do painel do
  // gestor carregado; os gestores, o painel (index.html). A cidade da demonstração vai junto.
  // O servidor, o portal do servidor (servidor.html).
  GC.paginaDoPerfil = (id) => (id === 'cidadao' ? 'cidadao.html' : id === 'servidor' ? 'servidor.html' : 'index.html');
  GC.urlDoPerfil = function (id, area, base = window.location.href) {
    const p = GC.resolverPerfil(id, area);
    const atual = new URL(base);
    const u = new URL(GC.paginaDoPerfil(p.id), atual);
    u.search = atual.search;
    u.searchParams.set('perfil', p.id);
    if (p.area) u.searchParams.set('area', p.area); else u.searchParams.delete('area');
    u.searchParams.delete('papel'); // trocar de perfil sai do "Ver como"
    u.hash = '';
    return u.toString();
  };
  // Link para ver o painel como um perfil (do sistema ou criado): na pasta, a primeira secretaria, ou a pedida.
  GC.urlVerComo = function (papelId, area, base = window.location.href) {
    const papel = GC.papelPorId(papelId);
    const id = GC.perfilDoPapel(papel);
    if (!id || id === 'cidadao') return null;
    const u = new URL(GC.urlDoPerfil(id, area, base));
    u.searchParams.set('papel', papel.id);
    ['usuario', 'login'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  };

  // usuario (opcional): abre como esse usuário do perfil (?usuario=, sem login). Sem ele, sai o de antes.
  GC.escolherPerfil = function (id, area, usuario) {
    const p = GC.resolverPerfil(id, area);
    try { window.localStorage.setItem(CHAVE, JSON.stringify(p)); } catch (e) { /* segue pela URL */ }
    const u = new URL(GC.urlDoPerfil(p.id, p.area));
    if (usuario) u.searchParams.set('usuario', usuario); else u.searchParams.delete('usuario');
    window.location.href = u.toString();
  };

  GC.perfil = escolher();
  // O painel do gestor nunca abre no perfil Cidadão: vai direto para o portal (antes de montar qualquer coisa).
  const ehPainel = typeof document !== 'undefined' && document.body && document.body.dataset.pagina === 'gestor';
  // Portal do servidor (servidor.html): abre sempre como servidor. Com login, quem entrou com outro perfil vai para a
  // página dele; sem login, um perfil de outra página vira o servidor da mesma pasta (ou da primeira).
  const ehServidor = typeof document !== 'undefined' && document.body && document.body.dataset.pagina === 'servidor';
  if (ehServidor && GC.visaoDe(GC.perfil) !== 'pessoal') {
    const logado = GC.loginExigido && GC.sessao && GC.sessao.atual();
    if (logado) {
      GC.redirecionando = true;
      window.location.replace(GC.urlDoPerfil(logado.perfil, logado.area));
    } else GC.perfil = GC.resolverPerfil('servidor', GC.perfil.area);
  }
  if (ehServidor && !GC.redirecionando && GC.loginExigido && GC.sessao && !GC.sessao.atual()) {
    GC.redirecionando = true;
    window.location.replace(GC.urlEntrar({ motivo: GC.sessao.situacao() === 'vencida' ? 'vencida' : null, volta: window.location.hash }));
  }
  // Login ligado e sem sessão (ou vencida): entrar primeiro, voltando depois para a rota pedida.
  if (ehPainel && GC.loginExigido && GC.sessao && !GC.sessao.atual()) {
    GC.redirecionando = true;
    window.location.replace(GC.urlEntrar({ motivo: GC.sessao.situacao() === 'vencida' ? 'vencida' : null, volta: window.location.hash }));
  } else if (GC.visaoDe(GC.perfil) === 'portal' && ehPainel) {
    GC.redirecionando = true;
    window.location.replace(GC.urlDoPerfil('cidadao'));
  } else if (GC.visaoDe(GC.perfil) === 'pessoal' && ehPainel) {
    // O servidor não tem painel de gestão: vai para o portal do servidor.
    GC.redirecionando = true;
    window.location.replace(GC.urlDoPerfil('servidor', GC.perfil.area));
  }
  const nomeArea = (a) => (GC.data.areas.find((x) => x.id === a) || { secretaria: { nome: a } }).secretaria.nome;
  // Na cidade, o nome do perfil quando não é o gestor geral (ex.: "Gestor (visão resumida)", ou um perfil criado).
  GC.perfilRotulo = (p = GC.perfil) => {
    const v = GC.visaoDe(p);
    if (v === 'pasta') return nomeArea(p.area);
    if (v === 'pessoal') return `Servidor · ${nomeArea(p.area)}`;
    if (v === 'portal') return 'Visão do cidadão';
    const papel = GC.papelDe ? GC.papelDe(p) : null;
    return papel && papel.id !== 'gestor_geral' ? papel.nome : 'Gestor geral';
  };

  // ---- telas: o que cada perfil abre (o resto é redirecionado) ----
  // Devolve a própria rota quando pode; senão a rota equivalente permitida.
  GC.rotaDoPerfil = function (rota, p = GC.perfil) {
    const visao = GC.visaoDe(p);
    if (visao === 'cidade') return rota;
    if (visao === 'portal') {
      if (rota.tela === 'cidadao' || rota.tela === 'painel' || rota.tela === 'nao-encontrada') return rota;
      if (rota.tela === 'indicadores') return Object.assign({}, rota, { alvo: rota.alvo && GC.indicadorPublico && !GC.indicadorPublico(rota.alvo) ? null : rota.alvo });
      return { tela: 'cidadao' };
    }
    // setor
    const a = p.area;
    // Minha conta, a auditoria, os usuários e a personalização (as telas recortam a pasta) também valem para o setor.
    // O cruzamento também: a tela só oferece os indicadores da pasta e os de contexto (satisfação, população…).
    // O calendário sazonal mostra a cidade inteira, com a pasta em destaque (as épocas são contexto para todos).
    // A agenda de entregas também: abre na pasta, e as outras ficam esmaecidas quando o filtro sai dela.
    // O histórico de cobranças também: a tela recorta a pasta.
    if (['painel', 'alertas', 'crise', 'conta', 'auditoria', 'usuarios', 'regras', 'personalizar', 'cruzamento', 'sazonal', 'entregas', 'cobrancas', 'prazos', 'tarefas', 'publicacoes', 'fontes', 'nao-encontrada'].includes(rota.tela)) return rota;
    // Plano de governo: o setor vê a própria pasta (a tela recorta).
    if (rota.tela === 'metas') return rota.area === a ? rota : Object.assign({ tela: 'metas', area: a }, rota.id ? { id: rota.id } : {});
    // Orçamento: o setor vê só a própria pasta (a tela recorta).
    if (rota.tela === 'orcamento') return rota.area === a ? rota : { tela: 'orcamento', area: a };
    // A visão geral (com ou sem secretaria escolhida) vira a página da própria pasta.
    if (rota.tela === 'secretaria' || rota.tela === 'secretarias') return rota.tela === 'secretaria' && rota.area === a ? rota : { tela: 'secretaria', area: a };
    const daPasta = (id) => ((GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || {}).area === a;
    if (rota.tela === 'indicadores') return rota.alvo === a || daPasta(rota.alvo) ? rota : { tela: 'indicadores', alvo: a };
    if (rota.tela === 'relatorios') return rota.tipo === 'secretaria' && rota.alvo === a ? rota : { tela: 'relatorios', tipo: 'secretaria', alvo: a, periodo: GC.periodoDoRelatorio ? GC.periodoDoRelatorio('secretaria', rota.periodo) : '30' };
    return { tela: 'secretaria', area: a }; // dados, cidadão: fora do perfil
  };

  // Acesso negado: rota fora do perfil que NÃO tem equivalente (Dados, a página ou o relatório de outra
  // secretaria, os indicadores de outra pasta). O que tem equivalente (Secretarias → a minha, relatório
  // executivo → o da pasta) continua redirecionando em silêncio por rotaDoPerfil.
  // Devolve null (pode) ou { tela, quem }: o nome do que foi pedido e quem tem acesso.
  GC.motivoNegado = function (rota, p = GC.perfil) {
    if (!p || GC.visaoDe(p) !== 'pasta' || !rota) return null;
    const a = p.area;
    const outraArea = (x) => !!x && x !== a && GC.data.areas.some((y) => y.id === x);
    const daOutra = 'o gestor geral e a própria secretaria';
    if (rota.tela === 'dados' && !GC.pode('dados.ver', null, { perfil: p })) return { tela: 'Dados', quem: 'o gestor geral' };
    if (rota.tela === 'secretaria' && outraArea(rota.area)) return { tela: `a página da ${nomeArea(rota.area)}`, quem: daOutra };
    if (rota.tela === 'relatorios' && rota.tipo === 'secretaria' && outraArea(rota.alvo)) return { tela: `o relatório da ${nomeArea(rota.alvo)}`, quem: daOutra };
    if (rota.tela === 'indicadores' && rota.alvo) {
      const ind = (GC.CATALOGO_INDICADORES || []).find((i) => i.id === rota.alvo);
      const area = outraArea(rota.alvo) ? rota.alvo : ind && outraArea(ind.area) ? ind.area : null;
      if (area) return { tela: `os indicadores da ${nomeArea(area)}`, quem: daOutra };
    }
    return null;
  };

  // O que cada perfil pode (fixo por perfil; é o resumo das regras deste arquivo). Mostrado em Usuários e permissões.
  // Cada linha: [o quê, gestor geral, gestor do setor, cidadão]; '' = não pode.
  GC.MATRIZ_PERMISSOES = [
    ['Mapa e ocorrências', 'Todas', 'Só as da pasta', 'Só avisos públicos'],
    ['Alertas', 'Todos', 'Só os da pasta', ''],
    ['Regras de alerta', 'Todas: criar, editar, pausar, restaurar e excluir', 'Só as da pasta: criar, editar, pausar e restaurar', ''],
    ['Limites de "Precisam de você"', 'Sim', '', ''],
    ['Cobrar uma secretaria', 'Sim', '', ''],
    ['Responder cobrança (previsão, justificativa, recurso, novo prazo, evidência)', '', 'Só as da pasta', ''],
    ['Aprovar ou recusar novo prazo', 'Sim', '', ''],
    ['Aprovar ou negar pedido de recurso', 'Sim', '', ''],
    ['Pedir ajuda a outra secretaria (e responder aos pedidos)', '', 'Só as da pasta', ''],
    ['Determinar ou arquivar pedido de ajuda levado ao prefeito', 'Sim', '', ''],
    ['Delegar ocorrência, pedir explicação e adiar com motivo', 'Sim', '', ''],
    ['Definir a pasta responsável, reabrir resolvida e marcar falso alarme', 'Sim', '', ''],
    ['Acionar órgão de fora, avisar a população, agendar visita ou conversa e reconhecer a equipe', 'Sim', '', ''],
    ['Acompanhar ocorrência (receber avisos)', 'Sim', 'Só as da pasta', ''],
    ['Responder explicação pedida pelo prefeito', '', 'Só as da pasta (o diretor de unidade: só o que foi delegado a ele)', ''],
    ['Dar o retorno de uma ocorrência delegada pelo prefeito', 'Quem a recebeu', 'Quem a recebeu', ''],
    ['Operar a pasta (despachar equipe, chegada, resolver, devolver, juntar duplicadas)', '', 'Só as da pasta (o diretor de unidade: só despachar, chegada e resolver o que foi delegado a ele)', ''],
    ['Delegar ocorrência a diretor de unidade', '', 'Só o secretário', ''],
    ['Pausar e retomar o prazo, pedir mais prazo', '', 'Só as da pasta (o diretor de unidade: só o que foi delegado a ele)', ''],
    ['Aprovar ou recusar pedido de mais prazo da ocorrência', 'Sim', '', ''],
    ['Parâmetros de prazo', 'Ver e mudar', 'Só ver', ''],
    ['Pactuar as metas dos indicadores da pasta', 'Todas as pastas', 'Só a própria (o secretário)', ''],
    ['Plano de ação e notas da reunião de resultados', '', 'Só o secretário', ''],
    ['Marcar ação do plano feita e responder cobrança da ação', '', 'Só as da pasta (o diretor de unidade: só as ações de que é responsável)', ''],
    ['Cobrar ação atrasada do plano', 'Sim', '', ''],
    ['Criar, editar, remover e restaurar compromisso do plano de governo', 'Sim', '', ''],
    ['Informar o progresso de compromisso do plano de governo', 'Todas as pastas', 'Só a própria (o secretário)', ''],
    ['Priorizar ocorrência', 'Sim', 'Só as da pasta', ''],
    ['Gabinete de crise', 'Abrir, gerir e publicar comunicados', 'Avançar as demandas da pasta', ''],
    ['Modelos de gabinete (demandas e questões que já vêm prontas)', 'Criar, editar e remover', 'Só ver', ''],
    ['Calendário sazonal (temporadas e o que preparar)', 'Criar, editar e remover', 'Só ver', ''],
    ['Passar demanda (temporada, alerta, gabinete ou avulsa)', 'Para qualquer secretaria', 'Para a própria pasta e os diretores dela', ''],
    ['Atender a demanda e responder cobrança', '', 'Só as da pasta (o diretor de unidade: só as passadas a ele)', ''],
    ['Cobrar demanda', 'Todas', 'Só as passadas aos diretores da pasta', ''],
    ['Maia (IA)', 'Sim', 'Sim', ''],
    ['Secretarias', 'Todas', 'Só a própria', ''],
    ['Relatórios', 'Todos', 'Só o da pasta', ''],
    ['Indicadores', 'Todos', 'Só os da pasta', 'Só os públicos'],
    ['Camadas internas (B.O.s, leitos, remédios, frota)', 'Todas', 'Só as da pasta', ''],
    ['Dados (tabelas e exportação)', 'Sim', '', ''],
    ['Calendário sazonal', 'Sim', 'Sim, com a pasta em destaque', ''],
    ['Agenda de entregas', 'Sim', 'Sim, aberta na pasta', ''],
    ['Plano de governo (compromissos e prazos)', 'Todas as pastas', 'Só a própria', ''],
    ['Orçamento, recursos de fora, contratos e licitações', 'Todas as pastas', 'Só a própria', ''],
    ['Confirmar ou remarcar entrega', '', 'Só da pasta', ''],
    ['Marcar inauguração', 'Sim', '', ''],
    ['Auditoria', 'Tudo', 'Só a da pasta', ''],
    ['Usuários', 'Todos', 'Só os da pasta, sem mudar perfil', ''],
    ['Perfis de acesso (criar, editar e excluir)', 'Sim', '', ''],
    ['Personalização (cores e fonte)', 'A própria e o padrão de todos', 'A própria e o padrão da pasta', ''],
    ['Nome e logo da plataforma', 'Sim', '', ''],
    ['Widgets no site da Prefeitura (código para colar)', 'Sim', '', ''],
  ];

  // Quem pode o quê: as funções GC.pode* abaixo são atalhos para GC.pode (js/permissoes.js, o catálogo e os perfis
  // do sistema). Aqui ficam só as regras do objeto (ocorrência resolvida, delegação, tipo do registro).
  const quem = (p, u) => ({ perfil: p || null, usuario: u });

  // Código de widget para o site da Prefeitura (embed.html): publicar é decisão do gestor geral.
  GC.podeIncorporarWidgets = (p = GC.perfil) => GC.pode('widgets.site', null, quem(p));

  GC.rotaInicialDoPerfil = (p = GC.perfil) => (GC.visaoDe(p) === 'portal' ? { tela: 'cidadao' } : { tela: 'painel' });

  // ---- menu ----
  GC.menuDoPerfil = function (itens, p = GC.perfil) {
    const visao = GC.visaoDe(p);
    if (visao === 'cidade') return itens;
    if (visao === 'portal') {
      return [
        { rota: { tela: 'cidadao' }, emoji: '👥', nome: 'Para você' },
        { rota: { tela: 'painel' }, emoji: '🗺', nome: 'Mapa' },
        // Indicadores públicos: pela doca da base do mapa (a gaveta de Indicadores), como nos outros perfis.
      ];
    }
    const a = GC.data.areas.find((x) => x.id === p.area);
    return [
      { rota: { tela: 'painel' }, emoji: '🗺', nome: 'Mapa' },
      { rota: { tela: 'secretaria', area: p.area }, emoji: a.secretaria.emoji, nome: 'Minha secretaria', area: null },
      { rota: { tela: 'crise', id: null }, emoji: '🚨', nome: 'Gabinete de crise' },
      { rota: { tela: 'relatorios', tipo: 'secretaria', alvo: p.area, periodo: '30' }, emoji: '📄', nome: 'Relatório da pasta' },
      { rota: { tela: 'cruzamento' }, emoji: '📊', nome: 'Cruzamento de dados' },
      { rota: { tela: 'sazonal' }, emoji: '📅', nome: 'Calendário sazonal' },
      { rota: { tela: 'entregas' }, emoji: '📦', nome: 'Agenda de entregas' },
      { rota: { tela: 'metas', area: p.area }, emoji: '🎯', nome: 'Plano de governo' },
      { rota: { tela: 'orcamento', area: p.area }, emoji: '🧾', nome: 'Orçamento da pasta' },
      { rota: { tela: 'tarefas', id: null }, emoji: '📋', nome: 'Demandas' },
      { rota: { tela: 'publicacoes' }, emoji: '📣', nome: 'Agenda de publicação' },
      // Auditoria e Usuários ficam no menu ⋯ do cabeçalho.
    ];
  };

  // ---- ações sobre ocorrências ----
  // Setor: só "priorizar", e só no que é da pasta. Cidadão: nenhuma. A store usa GC.acoesDisponiveis
  // para validar store.agir, então a regra vale para todo botão e para a Maia.
  // Ação nova em GC.acoesDisponiveis (js/store.js) precisa da chave 'ocorrencia.<ação>' em js/permissoes.js.
  GC.filtrarAcoesDoPerfil = function (acoes, o, p = GC.perfil) {
    return acoes.filter((a) => GC.pode(`ocorrencia.${a}`, { area: o && o.area }, quem(p)));
  };
  if (GC.acoesDisponiveis && !GC.acoesDisponiveis.doPerfil) {
    const base = GC.acoesDisponiveis;
    GC.acoesDisponiveis = (o) => GC.filtrarAcoesDoPerfil(base(o), o);
    GC.acoesDisponiveis.doPerfil = true;
  }

  // Gabinete de crise: o prefeito faz tudo; o setor só avança as tarefas da pasta dele.
  // Cobrança (js/cobrancas.js): o prefeito cobra de novo, decide o novo prazo e dá ciência do recurso;
  // o secretário responde, pede prazo e encerra com evidência, só nas cobranças da pasta dele.
  // Níveis dentro da pasta (js/data-usuarios.js): o secretário e o diretor de unidade ('unidade'); GC.nivelDe
  // fica em js/permissoes.js. u: o usuário (padrão: o que está usando o painel).
  const usuarioDe = (u) => (u !== undefined ? u : GC.usuarioAtual ? GC.usuarioAtual() : null);
  // A ocorrência foi delegada a este usuário? (o: a ocorrência, ou o id dela, procurado na store das telas.)
  const delegadaA = (o, u) => {
    const x = usuarioDe(u);
    const oc = typeof o === 'string' ? (GC.storeAtual && GC.storeAtual.buscar(o)) : o;
    return !!(x && oc && oc.delegadoA === x.id);
  };

  // Cobrança: o prefeito recobra, decide o prazo e o recurso; a pasta responde, pede prazo e encerra (o diretor de
  // unidade, só na cobrança da ocorrência delegada a ele).
  GC.podeNaCobranca = function (acao, c, p = GC.perfil, u) {
    if (!p || !c) return false;
    return GC.pode(`cobranca.${acao}`, { area: c.area, delegada: delegadaA(c.ocorrenciaId, u) }, quem(p, u));
  };

  // Operação da pasta (js/operacao.js): despachar, chegar, resolver, devolver e juntar são do secretário,
  // só nas ocorrências abertas da pasta dele. O prefeito vê, não opera.
  // Diretor de unidade: despacha, marca chegada e resolve só o que foi delegado a ele; delegar, devolver e juntar
  // são do secretário.
  // Prazos (js/prazos.js, fase 2): pausar, retomar e pedir mais prazo são da pasta (o diretor, só no que foi
  // delegado a ele); decidir o pedido é do prefeito. acao: 'pausar' | 'retomar' | 'prorrogar' | 'decidir'.
  GC.podeNoPrazo = function (acao, o, p = GC.perfil, u) {
    if (!p || !o || o.status === 'resolvida' || !['pausar', 'retomar', 'prorrogar', 'decidir'].includes(acao)) return false;
    return GC.pode(`prazo.${acao}`, { area: o.area, delegada: delegadaA(o, u) }, quem(p, u));
  };
  // Parâmetros de prazo (tela #/prazos): só o gestor geral muda.
  GC.podeMudarParametrosPrazo = (p = GC.perfil, u) => !!p && GC.pode('prazo.parametros', { area: '*' }, quem(p, u));

  GC.podeOperar = function (acao, o, p = GC.perfil, u) {
    if (!p || !o || o.status === 'resolvida') return false;
    if (!(GC.TIPOS_OPERACAO || ['despachar', 'chegar', 'resolver', 'devolver', 'juntar', 'delegar']).includes(acao)) return false;
    if (acao === 'devolver' && o.pastaDefinida) return false; // o prefeito já definiu de quem é (js/acoes-prefeito.js)
    return GC.pode(`operacao.${acao}`, { area: o.area, delegada: delegadaA(o, u) }, quem(p, u));
  };

  // Metas pactuadas e plano de ação (js/pactos.js): o prefeito negocia a meta de qualquer pasta; o secretário, a
  // da pasta dele, e faz o plano de ação. O diretor de unidade só vê. acao: 'propor' | 'aceitar' | 'plano' | 'nota'.
  GC.podePactuar = function (acao, area, p = GC.perfil, u) {
    if (!p || !area) return false;
    return GC.pode(`pacto.${acao}`, { area }, quem(p, u));
  };
  // Lado da negociação de quem está vendo.
  GC.ladoPacto = (p = GC.perfil) => (GC.visaoDe(p) === 'cidade' ? 'prefeito' : 'setor');
  // Ação do plano de ação (fase 2, js/pactos.js). acao: 'marcar' (feita/desfeita) | 'responder' (cobrança da ação) |
  // 'cobrar' (o prefeito, ação atrasada) | 'editar' (texto, prazo, responsável, ação nova: quem faz o plano).
  // item: a ação ({ responsavel }); area: a pasta do plano. O diretor de unidade marca e responde só as ações dele.
  GC.podeNaAcaoPlano = function (acao, item, area, p = GC.perfil, u) {
    if (!p || !area) return false;
    if (acao === 'editar') return GC.pode('pacto.plano', { area }, quem(p, u));
    if (acao === 'cobrar') return GC.pode('pacto.cobrar_acao', { area }, quem(p, u));
    if (acao !== 'marcar' && acao !== 'responder') return false;
    const x = usuarioDe(u);
    return GC.pode('pacto.acao', { area, delegada: !!(x && item && item.responsavel === x.id) }, quem(p, u));
  };
  // Quem pode ser responsável por uma ação do plano: o secretário e os diretores de unidade da pasta.
  GC.responsaveisPlano = (area) => ((GC.data && GC.data.usuarios) || [])
    .filter((u) => u.perfil === 'setor' && u.area === area && u.ativo !== false)
    .sort((a, b) => (a.nivel === 'unidade') - (b.nivel === 'unidade'));
  // Quem pode receber uma demanda (js/tarefas.js): o secretário, os diretores de unidade e os servidores da pasta,
  // nesta ordem. As ações do plano de metas continuam só com secretário e diretores (GC.responsaveisPlano).
  GC.responsaveisDemanda = (area) => [
    ...GC.responsaveisPlano(area),
    ...((GC.data && GC.data.usuarios) || []).filter((u) => u.perfil === 'servidor' && u.area === area && u.ativo !== false),
  ];
  // Nome de quem responde pela ação (sem responsável: o secretário da pasta).
  // Metas do plano de governo (js/metas-governo.js). acao: 'editar' (criar, editar, remover, restaurar: o gestor geral) |
  // 'informar' (o progresso de meta sem dado: o gestor geral e o secretário da pasta).
  GC.podeNaMetaGoverno = function (acao, area, p = GC.perfil, u) {
    if (!p || !area || (acao !== 'editar' && acao !== 'informar')) return false;
    return GC.pode(`meta_governo.${acao}`, { area }, quem(p, u));
  };
  GC.nomeResponsavelPlano = (item, area) => {
    const u = item && item.responsavel && GC.buscarUsuario ? GC.buscarUsuario(item.responsavel) : null;
    if (u) return u.nome;
    const sec = GC.responsaveisPlano(area).find((x) => x.nivel !== 'unidade');
    return sec ? sec.nome : 'Secretário(a)';
  };

  // Tarefas (js/tarefas.js). acao: 'passar' (t = { area } da tarefa nova) | 'iniciar' | 'concluir' | 'responder' (quem faz:
  // a pasta; o diretor de unidade, só as passadas a ele) | 'cobrar' (o gestor geral cobra qualquer uma; o secretário,
  // só as que passou a um diretor da pasta) | 'remarcar' | 'cancelar' (quem passou, ou a visão da cidade).
  // As tarefas do gabinete (origem 'gabinete') são feitas na sala: aqui, nada.
  GC.podeNaTarefa = function (acao, t, p = GC.perfil, u) {
    if (!p || !t || t.origem === 'gabinete') return false;
    const x = usuarioDe(u);
    const q = quem(p, u);
    const area = t.area;
    if (acao === 'passar') return GC.pode('tarefa.passar', { area }, q);
    // Atualizar (dar notícia) e tirar dúvida: quem faz, como começar e concluir.
    if (['iniciar', 'concluir', 'responder', 'atualizar', 'duvidar'].includes(acao)) return GC.pode('tarefa.fazer', { area, delegada: !!(x && t.responsavelId === x.id) }, q);
    // Cobrar, pedir notícia e responder a dúvida: quem acompanha quem faz (a regra do cobrar).
    if (acao === 'cobrar' || acao === 'pedir_atualizacao' || acao === 'esclarecer') {
      if (x && t.responsavelId === x.id) return false; // ninguém se cobra nem responde a si
      if (acao === 'esclarecer' && x && t.criadaPor && t.criadaPor.id === x.id) return true; // quem passou responde
      return GC.pode('tarefa.cobrar', { area }, q) && (GC.visaoDe(p) === 'cidade' || !!t.responsavelId);
    }
    if (acao === 'remarcar' || acao === 'cancelar') {
      return GC.pode('tarefa.passar', { area }, q) && (GC.visaoDe(p) === 'cidade' || !!(x && t.criadaPor && t.criadaPor.id === x.id));
    }
    return false;
  };
  // O que cada um vê: a cidade, tudo; a pasta, as dela; o diretor de unidade, as passadas a ele e as que ele passou;
  // o servidor (visão pessoal), só as passadas a ele.
  GC.tarefasVisiveis = function (lista, p = GC.perfil, u) {
    const visao = GC.visaoDe(p);
    if (visao === 'cidade') return lista;
    if (visao === 'pessoal') {
      const eu = usuarioDe(u);
      return eu ? lista.filter((t) => t.responsavelId === eu.id && GC.areasDoRecorte(p).includes(t.area)) : [];
    }
    if (visao !== 'pasta') return [];
    const x = usuarioDe(u);
    const areas = GC.areasDoRecorte(p);
    const diretor = !!x && GC.nivelDe(x) === 'unidade';
    return lista.filter((t) => areas.includes(t.area) && (!diretor || t.responsavelId === x.id || (t.criadaPor && t.criadaPor.id === x.id)));
  };

  // Regras de alerta (js/regras-alerta.js). O gestor geral pode tudo. O do setor cria, edita, pausa e restaura
  // as regras da pasta (regra.area), mas não exclui. Para criar, regra é { area } da regra nova.
  // 'limites': o que leva uma ocorrência a "Precisam de você" (vale para a cidade toda: só o gestor geral).
  GC.podeNaRegra = function (acao, regra, p = GC.perfil) {
    if (!p || !regra) return false;
    return GC.pode(`regra.${acao}`, { area: regra.area }, quem(p));
  };

  // Pedido de ajuda entre secretarias (js/ajudas.js). alvo: o pedido (aceitar, recusar, concluir, escalar,
  // determinar, arquivar) ou, para "pedir", a ocorrência. Pedir e levar ao prefeito: a pasta da ocorrência;
  // aceitar e recusar: a pasta pedida; concluir: as duas; determinar e arquivar: o prefeito.
  // Pasta do pedido que conta para cada ação (concluir: qualquer das duas).
  const AREA_DA_AJUDA = { pedir: ['area'], aceitar: ['para'], recusar: ['para'], escalar: ['de'], concluir: ['de', 'para'], determinar: [null], arquivar: [null] };
  GC.podeNaAjuda = function (acao, alvo, p = GC.perfil) {
    if (!p || !alvo || !AREA_DA_AJUDA[acao]) return false;
    if (acao === 'pedir' && alvo.status === 'resolvida') return false;
    return AREA_DA_AJUDA[acao].some((campo) => GC.pode(`ajuda.${acao}`, { area: campo && alvo[campo] }, quem(p)));
  };

  // Mais ações do prefeito (js/acoes-prefeito.js). alvo: a ocorrência (delegar, explicar, adiar) ou o registro.
  // Delegar, pedir explicação, adiar, retomar, perguntar de novo, dar por explicada e desfazer o adiamento: o
  // gabinete. Explicar: a pasta da ocorrência (o diretor de unidade, só no que foi delegado a ele). Dar o retorno de
  // uma delegação: só quem a recebeu.
  GC.podeNaAcaoPrefeito = function (acao, alvo, p = GC.perfil, u) {
    if (!p || !alvo) return false;
    const x = usuarioDe(u);
    // Dar o retorno não é permissão do perfil: é de quem recebeu a delegação.
    if (acao === 'retornar') return alvo.tipo === 'delegacao' && alvo.estado === 'ativa' && !!x && alvo.para === x.id;
    if (['delegar', 'explicar', 'adiar'].includes(acao) && alvo.status === 'resolvida') return false;
    // Segunda leva (js/acoes-prefeito.js): a regra do objeto. alvo é a ocorrência, menos nos gestos sobre um registro
    // (retorno do órgão, retirar aviso, agenda feita ou cancelada), que usam a permissão de quem criou.
    const REGISTRO = { retorno_orgao: 'orgao', retirar_aviso: 'avisar', agenda_feita: 'agendar', agenda_cancelar: 'agendar' };
    if (REGISTRO[acao]) return GC.pode(`acompanhar.${REGISTRO[acao]}`, { area: alvo.area }, quem(p, u));
    if (['definir_pasta', 'falso_alarme', 'orgao', 'avisar', 'agendar', 'seguir'].includes(acao) && alvo.status === 'resolvida') return false;
    if (acao === 'falso_alarme' && alvo.pontoId) return false; // pedido de morador: alguém viu o problema
    if (acao === 'reabrir' && (alvo.status !== 'resolvida' || alvo.duplicadaDe)) return false;
    if (acao === 'reconhecer' && ((alvo.status !== 'em_campo' && alvo.status !== 'resolvida') || alvo.falsoAlarme || alvo.duplicadaDe)) return false;
    if (acao === 'responder' && alvo.tipo !== 'explicacao') return false;
    const delegada = acao === 'responder' && delegadaA(alvo.ocorrenciaId, u);
    return GC.pode(`acompanhar.${acao}`, { area: alvo.area, delegada }, quem(p, u));
  };

  // Gabinete de crise: o prefeito faz tudo; o setor avança e responde à cobrança das tarefas da pasta.
  GC.podeNaCrise = function (acao, areaTarefa, p = GC.perfil) {
    return GC.pode(`crise.${acao}`, { area: areaTarefa }, quem(p));
  };

  // Equipe da sala de crise (portal do servidor, fase 2). g: o gabinete; alvo: a pasta ('chamar', 'pedir'), a demanda
  // da sala ('passar', 'avancar', 'responder') ou a questão ('questao'). Sala encerrada: nada.
  // - ver: a cidade vê todas; a pasta, as que a envolvem; o servidor, só aquelas em que é membro.
  // - chamar / passar: o secretário da pasta (sala.chamar). pedir (alguém da pasta) e esclarecer (a dúvida): quem gere.
  // - avancar / responder: na visão pessoal, só a demanda da sala passada à pessoa; senão, como sempre (GC.podeNaCrise).
  // - questao: na visão pessoal, a apontada a ela ou à pasta dela; senão, quem gere ou a pasta que tem demanda na sala.
  // - atualizar / duvidar: o membro (servidor) ou a pasta envolvida.
  GC.podeNoGabinete = function (acao, g, alvo, p = GC.perfil, u) {
    if (!p || !g) return false;
    const x = usuarioDe(u);
    const q = quem(p, u);
    const visao = GC.visaoDe(p);
    const membro = !!x && (g.membros || []).some((m) => m.usuarioId === x.id && !m.saiuEm);
    if (acao === 'ver') return visao === 'cidade' || (visao === 'pasta' && g.areas.some((a) => GC.areasDoRecorte(p).includes(a))) || (visao === 'pessoal' && membro);
    if (g.encerradoEm) return false;
    if (acao === 'chamar') return GC.pode('sala.chamar', { area: alvo }, q);
    if (acao === 'passar') return !!alvo && GC.pode('sala.chamar', { area: alvo.area }, q);
    if (acao === 'pedir' || acao === 'esclarecer') return GC.pode('crise.gerir', null, q);
    if (acao === 'avancar' || acao === 'responder') {
      if (!alvo) return false;
      if (visao !== 'pessoal') return GC.pode(`crise.${acao}`, { area: alvo.area }, q);
      return membro && GC.pode(`crise.${acao}`, { area: alvo.area, delegada: !!x && alvo.responsavelId === x.id }, q);
    }
    if (acao === 'questao') {
      if (!alvo) return false;
      if (visao !== 'pessoal') return GC.pode('crise.gerir', null, q) || g.areas.some((a) => GC.pode('crise.avancar', { area: a }, q));
      const para = alvo.para || {};
      const minha = !!x && (para.usuarioId === x.id || (!para.usuarioId && para.area === x.area));
      return membro && minha && GC.pode('sala.questao', { area: x.area, delegada: true }, q);
    }
    if (acao === 'atualizar' || acao === 'duvidar') {
      const chave = acao === 'atualizar' ? 'sala.atualizar' : 'sala.duvida';
      if (visao === 'pessoal') return membro && GC.pode(chave, { area: x.area, delegada: true }, q);
      return visao === 'pasta' && g.areas.some((a) => GC.pode(chave, { area: a }, q));
    }
    return false;
  };
  // Quem a pasta pode chamar para a sala: os servidores ativos dela que ainda não estão lá.
  GC.servidoresParaSala = (g, area) => ((GC.data && GC.data.usuarios) || [])
    .filter((u) => u.perfil === 'servidor' && u.area === area && u.ativo !== false && !(g.membros || []).some((m) => m.usuarioId === u.id && !m.saiuEm));

  // Widgets do gestor do setor: os gerais (já filtrados pela pasta) + os temas da pasta. Visualização inicial dele.
  const WIDGETS_DA_AREA = {
    saude: ['leitos', 'medicamentos', 'social'], seguranca: ['seguranca'], educacao: ['educacao', 'social'], mobilidade: ['frota'],
    limpeza: ['coleta'], defesa_civil: ['risco'], infraestrutura: ['obras'],
  };
  const WIDGETS_GERAIS = ['numeros', 'pulsos', 'desempenho', 'satisfacao'];
  GC.widgetsDoPerfil = function (ativos, p = GC.perfil) {
    if (GC.visaoDe(p) !== 'pasta') return ativos;
    const pode = [...WIDGETS_GERAIS, ...(WIDGETS_DA_AREA[p.area] || [])];
    // Widgets fixados da Maia: o gestor do setor só consegue criá-los com temas da pasta dele.
    const filtrados = ativos.filter((id) => pode.includes(id) || (GC.ehWidgetIA && GC.ehWidgetIA(id)));
    return filtrados.length ? filtrados : pode.filter((id) => (GC.WIDGETS || []).some((w) => w.id === id));
  };
  const VISTA_DA_AREA = { saude: 'saude', seguranca: 'seguranca', educacao: 'educacao', mobilidade: 'frota', limpeza: 'limpeza', defesa_civil: 'chuva', infraestrutura: 'chuva' };
  GC.vistaDoSetor = (area) => VISTA_DA_AREA[area] || null;

  // Áreas que o perfil enxerga (null = todas). Usado para travar o filtro do gestor do setor.
  GC.areasDoPerfil = (p = GC.perfil) => (GC.visaoDe(p) === 'pasta' ? GC.areasDoRecorte(p) : null);

  // Camadas do mapa abertas ao cidadão (B.O.s, leitos, estoque de remédios e frota interna ficam de fora).
  GC.CAMADAS_PUBLICAS = ['toggle-risco', 'toggle-obras', 'toggle-escolas', 'toggle-coleta', 'toggle-conquistas'];

  // Camadas do gestor do setor: as públicas (contexto da cidade) + as internas da própria pasta.
  // B.O.s só para a Segurança; leitos e estoque de remédios só para a Saúde; a frota inclui o SAMU.
  // Vigilância em saúde é da Saúde; trânsito, da Mobilidade (a Educação e a Segurança também veem); prédios
  // públicos, da Infraestrutura e das pastas que os usam; habitação, da Infraestrutura e da Defesa Civil;
  // grandes eventos, das frentes do plano de operação. Economia local e custo e orçamento ficam só com o gestor geral.
  const CAMADAS_DA_AREA = {
    saude: ['toggle-leitos', 'toggle-farmacias', 'toggle-frota', 'toggle-vigilancia', 'toggle-predios', 'toggle-eventos'],
    seguranca: ['toggle-calor-bo', 'toggle-transito', 'toggle-eventos'],
    mobilidade: ['toggle-frota', 'toggle-transito', 'toggle-eventos'],
    educacao: ['toggle-transito', 'toggle-predios'],
    infraestrutura: ['toggle-predios', 'toggle-habitacao'],
    defesa_civil: ['toggle-habitacao'],
    limpeza: ['toggle-eventos'],
  };
  GC.camadasDoPerfil = (p = GC.perfil) => (GC.visaoDe(p) === 'pasta' ? [...GC.CAMADAS_PUBLICAS, ...(CAMADAS_DA_AREA[p.area] || [])] : null);
  GC.podeCamada = (toggleId, p = GC.perfil) => { const c = GC.camadasDoPerfil(p); return !c || c.includes(toggleId); };

  // Visualizações prontas que o perfil pode escolher (null = todas): o setor fica com a da pasta e "Críticas agora".
  GC.vistasProntasDoPerfil = (p = GC.perfil) => (GC.visaoDe(p) === 'pasta' ? [GC.vistaDoSetor(p.area), 'criticas'].filter(Boolean) : null);

  // Ocorrência (sozinha ou com várias secretarias) que diz respeito à pasta do perfil. Prefeito: todas.
  GC.ocorrenciaDoPerfil = function (o, p = GC.perfil) {
    if (GC.visaoDe(p) !== 'pasta') return true;
    return !!o && (o.area === p.area || (o.areasEnvolvidas || []).includes(p.area));
  };

  // Busca rápida: o setor acha os bairros, as ocorrências da pasta, a própria secretaria e as camadas que pode ver.
  const CAMADA_DO_ITEM = { leito: 'toggle-leitos', escola: 'toggle-escolas', obra: 'toggle-obras', farmacia: 'toggle-farmacias', linha: 'toggle-frota', coleta: 'toggle-coleta', risco: 'toggle-risco' };
  const TELAS_DO_SETOR = ['alertas', 'relatorios', 'cruzamento', 'sazonal', 'entregas', 'metas'];
  GC.filtrarBuscaDoPerfil = function (itens, p = GC.perfil) {
    if (GC.visaoDe(p) !== 'pasta') return itens;
    return itens.filter((it) => {
      if (it.tipo === 'secretaria') return it.id === p.area;
      if (it.tipo === 'tela') return TELAS_DO_SETOR.includes(it.id);
      if (it.tipo === 'ocorrencia') return it.area === p.area || (it.areas || []).includes(p.area);
      if (CAMADA_DO_ITEM[it.tipo]) return GC.podeCamada(CAMADA_DO_ITEM[it.tipo], p);
      return true;
    });
  };
})(window.GC = window.GC || {});
