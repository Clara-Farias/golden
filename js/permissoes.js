(function (GC) {
  // Permissões e perfis de acesso (papéis). Fase 1 de "perfis e permissões": o catálogo de permissões, os perfis
  // do sistema (o mesmo comportamento de antes) e GC.pode, que decide tudo. As funções GC.pode* de js/perfil.js,
  // js/usuarios.js e js/personalizacao.js são atalhos para cá e guardam só as regras do objeto (ocorrência
  // resolvida, quem recebeu a delegação, a trava de quem se desativa). O tests/permissoes.test.js confere que a
  // resposta é a mesma da lógica antiga em todas as combinações.
  //
  // Três coisas separadas:
  // - permissão: o que se faz (chave fixa, abaixo);
  // - perfil (papel): um conjunto de permissões, cada uma com um alcance;
  // - recorte: a pasta do usuário (hoje GC.perfil.area).
  // Alcances: 'cidade' (sem restrição), 'pasta' (só nas pastas do perfil) e 'delegadas' (na pasta, e só o que
  // foi delegado ao usuário).
  // Carregado antes de js/personalizacao.js (no <head>) e sem dependências: só lê GC.usuarioAtual na hora da chamada.

  GC.ALCANCES = [
    { id: 'cidade', nome: 'Cidade toda' },
    { id: 'pasta', nome: 'Só a pasta' },
    { id: 'delegadas', nome: 'Só o que foi delegado à pessoa' },
  ];

  // Catálogo: cada chave é uma permissão. Ação nova que alguém pode ou não fazer ganha uma chave aqui e um
  // alcance em cada perfil do sistema que a tem.
  const G = (grupo, itens) => itens.map(([id, nome]) => ({ id, grupo, nome }));
  GC.PERMISSOES = [
    ...G('Ocorrências', [
      ['ocorrencia.priorizar', 'Priorizar ocorrência'],
      ['ocorrencia.cobrar', 'Cobrar a secretaria pela ocorrência'],
      ['ocorrencia.gabinete', 'Convocar gabinete de crise para a ocorrência'],
    ]),
    ...G('Acompanhamento do gabinete', [
      ['acompanhar.delegar', 'Delegar ocorrência a uma pessoa'],
      ['acompanhar.explicar', 'Pedir explicação'],
      ['acompanhar.adiar', 'Adiar com motivo'],
      ['acompanhar.retomar', 'Retomar o adiado'],
      ['acompanhar.perguntar', 'Perguntar de novo'],
      ['acompanhar.lida', 'Dar a explicação por lida'],
      ['acompanhar.desfazer', 'Desfazer o adiamento'],
      ['acompanhar.responder', 'Responder explicação pedida'],
      ['acompanhar.definir_pasta', 'Definir a pasta responsável'],
      ['acompanhar.reabrir', 'Reabrir ocorrência resolvida'],
      ['acompanhar.falso_alarme', 'Marcar como falso alarme'],
      ['acompanhar.orgao', 'Acionar órgão de fora'],
      ['acompanhar.avisar', 'Avisar a população pelo portal'],
      ['acompanhar.reconhecer', 'Reconhecer a equipe'],
      ['acompanhar.agendar', 'Agendar visita ou conversa'],
      ['acompanhar.seguir', 'Acompanhar ocorrência (receber avisos)'],
    ]),
    ...G('Cobranças', [
      ['cobranca.recobrar', 'Cobrar de novo'],
      ['cobranca.decidir', 'Aprovar ou recusar novo prazo'],
      ['cobranca.ciente', 'Dar ciência do recurso'],
      ['cobranca.decidir_recurso', 'Aprovar ou negar pedido de recurso'],
      ['cobranca.responder', 'Responder cobrança'],
      ['cobranca.pedir_prazo', 'Pedir novo prazo'],
      ['cobranca.encerrar', 'Encerrar cobrança com evidência'],
    ]),
    ...G('Operação da pasta', [
      ['operacao.despachar', 'Despachar equipe'],
      ['operacao.chegar', 'Marcar chegada da equipe'],
      ['operacao.resolver', 'Resolver ocorrência'],
      ['operacao.devolver', 'Devolver a outra pasta'],
      ['operacao.juntar', 'Juntar duplicadas'],
      ['operacao.delegar', 'Delegar a diretor de unidade'],
    ]),
    ...G('Prazos', [
      ['prazo.pausar', 'Pausar o prazo da ocorrência'],
      ['prazo.retomar', 'Retomar o prazo pausado'],
      ['prazo.prorrogar', 'Pedir mais prazo'],
      ['prazo.decidir', 'Aprovar ou recusar pedido de mais prazo'],
      ['prazo.parametros', 'Parâmetros de prazo'],
    ]),
    ...G('Pedidos de ajuda', [
      ['ajuda.pedir', 'Pedir ajuda a outra secretaria'],
      ['ajuda.aceitar', 'Aceitar pedido de ajuda'],
      ['ajuda.recusar', 'Recusar pedido de ajuda'],
      ['ajuda.concluir', 'Concluir pedido de ajuda'],
      ['ajuda.escalar', 'Levar pedido ao prefeito'],
      ['ajuda.determinar', 'Determinar pedido levado ao prefeito'],
      ['ajuda.arquivar', 'Arquivar pedido levado ao prefeito'],
    ]),
    ...G('Metas pactuadas e plano de governo', [
      ['pacto.propor', 'Propor meta'],
      ['pacto.aceitar', 'Aceitar meta'],
      ['pacto.plano', 'Plano de ação'],
      ['pacto.nota', 'Notas da reunião de resultados'],
      ['pacto.acao', 'Marcar ação do plano feita e responder cobrança da ação'],
      ['pacto.cobrar_acao', 'Cobrar ação atrasada do plano'],
      ['meta_governo.editar', 'Criar, editar, remover e restaurar compromisso do plano de governo'],
      ['meta_governo.informar', 'Informar o progresso de compromisso do plano de governo'],
    ]),
    ...G('Regras de alerta', [
      ['regra.ver', 'Ver regras'],
      ['regra.criar', 'Criar regra'],
      ['regra.editar', 'Editar regra'],
      ['regra.pausar', 'Pausar regra'],
      ['regra.restaurar', 'Restaurar regra'],
      ['regra.excluir', 'Excluir regra'],
      ['regra.limites', 'Limites de "Precisam de você"'],
    ]),
    ...G('Agenda de entregas', [
      ['entrega.confirmar', 'Confirmar a data de uma entrega'],
      ['entrega.remarcar', 'Remarcar entrega com motivo'],
      ['entrega.inaugurar', 'Marcar ou desmarcar inauguração'],
    ]),
    ...G('Gabinete de crise', [
      ['crise.abrir', 'Abrir gabinete e preventivos'],
      ['crise.gerir', 'Gerir e encerrar gabinete'],
      ['crise.comunicar', 'Publicar comunicados'],
      ['crise.cobrar', 'Cobrar demanda'],
      ['crise.avancar', 'Avançar demanda'],
      ['crise.responder', 'Responder cobrança de demanda'],
      ['crise.modelos', 'Criar e editar modelos de gabinete'],
    ]),
    // Portal do servidor (fase 2): quem da pasta está na sala. A sala (gestor geral) não chama pessoa: pede.
    ...G('Equipe da sala de crise', [
      ['sala.chamar', 'Chamar servidor da pasta para a sala e passar demanda da sala a ele'],
      ['sala.atualizar', 'Enviar atualização à sala'],
      ['sala.duvida', 'Mandar dúvida à sala'],
      ['sala.questao', 'Responder questão da sala apontada à pessoa ou à pasta dela'],
    ]),
    ...G('Demandas', [
      ['tarefa.passar', 'Passar, remarcar e cancelar demanda'],
      ['tarefa.fazer', 'Atender a demanda e responder cobrança'],
      ['tarefa.cobrar', 'Cobrar demanda'],
    ]),
    ...G('Calendário sazonal', [
      ['sazonal.editar', 'Criar, editar e remover temporadas do calendário sazonal'],
    ]),
    ...G('Dados e registros', [
      ['dados.ver', 'Dados (tabelas e exportação)'],
      ['auditoria.ver', 'Auditoria'],
    ]),
    ...G('Conta e plataforma', [
      ['usuarios.gerir', 'Criar, editar e desativar usuários'],
      ['usuarios.perfil', 'Mudar perfil e pasta de usuários'],
      ['perfis.gerir', 'Criar, editar e excluir perfis de acesso'],
      ['aparencia.pessoal', 'Aparência pessoal'],
      ['aparencia.pasta', 'Aparência padrão da pasta'],
      ['aparencia.prefeitura', 'Aparência padrão de todos'],
      ['aparencia.marca', 'Nome e logo da plataforma'],
      ['widgets.site', 'Widgets no site da Prefeitura'],
    ]),
  ];
  const CHAVES = new Set(GC.PERMISSOES.map((x) => x.id));

  // Perfis do sistema. O gestor geral ajusta nome, descrição e permissões (js/perfis-acesso.js grava o ajuste e o
  // aplica nestes objetos); a visão e o id não mudam. GC.PERFIS_FABRICA guarda o padrão de fábrica.
  // São os perfis e níveis de antes: o gestor geral (perfil 'prefeito'), o
  // secretário e o diretor de unidade (perfil 'setor', nível em js/data-usuarios.js) e o cidadão.
  // pagina: 'painel' | 'portal' | 'servidor'; visao: 'cidade' | 'pasta' | 'pessoal' (o recorte do menu, dos widgets e
  // das camadas; 'pessoal' é o portal do servidor, servidor.html: só o que foi passado à pessoa, sem nada de gestão).
  const todas = (prefixo, alcance) => GC.PERMISSOES.filter((x) => x.id.startsWith(prefixo)).reduce((o, x) => Object.assign(o, { [x.id]: alcance }), {});
  const so = (ids, alcance) => ids.reduce((o, id) => Object.assign(o, { [id]: alcance }), {});
  const DA_PASTA_COMUM = {
    ...so(['ocorrencia.priorizar'], 'pasta'),
    ...so(['acompanhar.seguir'], 'pasta'), // acompanhar é pessoal: cada um segue o que é da pasta
    ...so(['regra.ver', 'regra.criar', 'regra.editar', 'regra.pausar', 'regra.restaurar'], 'pasta'),
    ...so(['crise.avancar', 'crise.responder'], 'pasta'),
    ...so(['sala.atualizar', 'sala.duvida'], 'pasta'),
    ...so(['usuarios.gerir', 'aparencia.pasta', 'auditoria.ver'], 'pasta'),
    ...so(['aparencia.pessoal'], 'cidade'),
  };
  // Como o painel abre para o perfil (workshop de 18/11: alternar entre a visão simples e a completa).
  // completa: tudo, e a pessoa pode passar para a resumida; resumida: abre resumida e pode passar para a completa;
  // so_resumida: sempre resumida, sem a troca. A visão resumida é o mesmo painel com menos informação
  // (js/visao-simples.js, js/resumo-essencial.js).
  GC.EXIBICOES = {
    completa: { nome: 'Completa', explica: 'Abre com todas as telas, filtros e camadas. A pessoa pode passar para a resumida.' },
    resumida: { nome: 'Resumida', explica: 'Abre com o Resumo de hoje e só as telas principais. A pessoa pode passar para a completa.' },
    so_resumida: { nome: 'Só resumida', explica: 'Sempre resumida, sem a troca. Para quem só acompanha.' },
  };
  GC.PERFIS_SISTEMA = [
    {
      id: 'gestor_geral', nome: 'Gestor geral', descricao: 'Prefeito(a), Gabinete e Planejamento: vê e decide em tudo.', sistema: true, pagina: 'painel', visao: 'cidade', exibicao: 'completa',
      permissoes: {
        ...todas('ocorrencia.', 'cidade'),
        ...so(['acompanhar.delegar', 'acompanhar.explicar', 'acompanhar.adiar', 'acompanhar.retomar', 'acompanhar.perguntar', 'acompanhar.lida', 'acompanhar.desfazer'], 'cidade'),
        ...so(['acompanhar.definir_pasta', 'acompanhar.reabrir', 'acompanhar.falso_alarme', 'acompanhar.orgao', 'acompanhar.avisar', 'acompanhar.reconhecer', 'acompanhar.agendar', 'acompanhar.seguir'], 'cidade'),
        ...so(['cobranca.recobrar', 'cobranca.decidir', 'cobranca.ciente', 'cobranca.decidir_recurso'], 'cidade'),
        ...so(['ajuda.determinar', 'ajuda.arquivar'], 'cidade'),
        ...so(['prazo.decidir', 'prazo.parametros'], 'cidade'),
        ...so(['pacto.propor', 'pacto.aceitar', 'pacto.cobrar_acao', 'meta_governo.editar', 'meta_governo.informar'], 'cidade'),
        ...todas('regra.', 'cidade'),
        ...todas('crise.', 'cidade'),
        ...so(['sazonal.editar'], 'cidade'), // a pasta só vê a configuração
        ...so(['tarefa.passar', 'tarefa.cobrar'], 'cidade'), // a demanda é feita pela secretaria
        ...so(['entrega.inaugurar'], 'cidade'), // a data da entrega é da secretaria; o prefeito marca a inauguração
        ...so(['dados.ver', 'auditoria.ver'], 'cidade'),
        ...so(['usuarios.gerir', 'usuarios.perfil', 'perfis.gerir', 'aparencia.pessoal', 'aparencia.prefeitura', 'aparencia.marca', 'widgets.site'], 'cidade'),
      },
    },
    {
      id: 'secretario', nome: 'Secretário(a)', descricao: 'Responsável pela secretaria: responde cobranças, opera a pasta e pactua metas.', sistema: true, pagina: 'painel', visao: 'pasta', exibicao: 'completa',
      permissoes: {
        ...DA_PASTA_COMUM,
        ...so(['acompanhar.responder'], 'pasta'),
        ...so(['cobranca.responder', 'cobranca.pedir_prazo', 'cobranca.encerrar'], 'pasta'),
        ...todas('operacao.', 'pasta'),
        ...so(['prazo.pausar', 'prazo.retomar', 'prazo.prorrogar'], 'pasta'),
        ...so(['ajuda.pedir', 'ajuda.aceitar', 'ajuda.recusar', 'ajuda.concluir', 'ajuda.escalar'], 'pasta'),
        ...so(['entrega.confirmar', 'entrega.remarcar'], 'pasta'),
        ...so(['tarefa.passar', 'tarefa.fazer', 'tarefa.cobrar'], 'pasta'), // passa e cobra dentro da pasta (aos diretores)
        ...so(['sala.chamar'], 'pasta'), // quem chama servidor para a sala de crise é o secretário da pasta
        ...so(['pacto.propor', 'pacto.aceitar', 'pacto.plano', 'pacto.nota', 'pacto.acao', 'meta_governo.informar'], 'pasta'), // cobrar a ação é do prefeito
      },
    },
    {
      id: 'diretor_unidade', nome: 'Diretor(a) de unidade', descricao: 'Diretor(a) de unidade: vê a pasta e age só no que o secretário delegou.', sistema: true, pagina: 'painel', visao: 'pasta', exibicao: 'resumida',
      permissoes: {
        ...DA_PASTA_COMUM,
        ...so(['acompanhar.responder'], 'delegadas'),
        ...so(['cobranca.responder', 'cobranca.pedir_prazo', 'cobranca.encerrar'], 'delegadas'),
        ...so(['operacao.despachar', 'operacao.chegar', 'operacao.resolver'], 'delegadas'),
        ...so(['prazo.pausar', 'prazo.retomar', 'prazo.prorrogar'], 'delegadas'),
        ...so(['pacto.acao'], 'delegadas'), // só as ações do plano de que ele é o responsável
        ...so(['tarefa.fazer'], 'delegadas'), // só as demandas passadas a ele
      },
    },
    // Workshop de 18/11: versão simplificada para gestores com acesso reduzido (vice-prefeito, assessoria, conselho).
    // Vê a cidade toda, sempre na visão simples (js/visao-simples.js), e não age: só acompanha ocorrências.
    {
      id: 'gestor_consulta', nome: 'Gestor (visão resumida)', descricao: 'Vice-prefeito(a), assessoria ou conselho: acompanha a cidade toda na visão resumida, sem agir.', sistema: true, pagina: 'painel', visao: 'cidade', exibicao: 'so_resumida',
      permissoes: { ...so(['acompanhar.seguir'], 'cidade'), ...so(['aparencia.pessoal'], 'cidade') },
    },
    // Quem executa (portal do servidor, servidor.html): faz só as demandas passadas a ele. Spec:
    // docs/specs/2026-11-17-vila-dourada-portal-do-servidor-design.md.
    {
      id: 'servidor', nome: 'Servidor(a)', descricao: 'Recebe demandas da pasta: atualiza, tira dúvidas e conclui o que foi passado a ele.', sistema: true, pagina: 'servidor', visao: 'pessoal',
      permissoes: {
        ...so(['tarefa.fazer'], 'delegadas'), // só as demandas passadas a ele
        // Na sala de crise em que é membro: as demandas da sala passadas a ele, as questões apontadas a ele (ou à pasta
        // dele), as atualizações e as dúvidas.
        ...so(['crise.avancar', 'crise.responder', 'sala.atualizar', 'sala.duvida', 'sala.questao'], 'delegadas'),
        ...so(['aparencia.pessoal'], 'cidade'),
      },
    },
    { id: 'cidadao', nome: 'Cidadão', sistema: true, pagina: 'portal', visao: 'cidade', permissoes: {} },
  ];
  const PAPEL = Object.fromEntries(GC.PERFIS_SISTEMA.map((x) => [x.id, x]));
  // Padrão de fábrica (cópia): o que "Voltar ao padrão" restaura e o que decide os alcances de cada visão.
  GC.PERFIS_FABRICA = Object.fromEntries(GC.PERFIS_SISTEMA.map((x) => [x.id, { nome: x.nome, descricao: x.descricao || '', exibicao: x.exibicao || 'completa', permissoes: Object.assign({}, x.permissoes) }]));

  // Perfil pelo id: os do sistema e os criados pelo gestor (js/perfis-acesso.js, carregado logo depois).
  GC.papelPorId = (id) => (id && (PAPEL[id] || (GC.perfisAcesso ? GC.perfisAcesso.buscar(id) : null))) || null;
  // O perfil de acesso (o tipo de painel: 'prefeito' = cidade toda, 'setor' = uma pasta, 'cidadao' = portal) que
  // combina com o papel. É o que fica gravado no usuário (u.perfil) e na URL (?perfil=).
  // 'servidor': o portal do servidor (servidor.html), também de uma pasta.
  GC.perfilDoPapel = (papel) => (!papel ? null : papel.pagina === 'portal' ? 'cidadao' : papel.pagina === 'servidor' ? 'servidor' : papel.visao === 'cidade' ? 'prefeito' : 'setor');
  // Perfis de acesso que pertencem a uma pasta (precisam de área).
  GC.perfilDePasta = (id) => id === 'setor' || id === 'servidor';
  const compativel = (papel, p) => !!papel && GC.perfilDoPapel(papel) === p.id && (!GC.perfilDePasta(p.id) || !!p.area);

  // Nível dentro da pasta: o secretário e o diretor de unidade ('unidade'). u: o usuário (padrão: o que está usando
  // o painel; null = nenhum). Sem usuário conhecido, vale o secretário. Com perfil criado, é diretor quem só age no
  // que foi delegado a ele em alguma permissão (alcance 'delegadas').
  const usuarioDe = (u) => (u !== undefined ? u : GC.usuarioAtual ? GC.usuarioAtual() : null);
  // O servidor (portal do servidor) tem o nível 'servidor'.
  GC.nivelDe = (u) => {
    const x = usuarioDe(u);
    if (x && x.perfil === 'servidor') return 'servidor';
    const proprio = x && x.papel ? GC.papelPorId(x.papel) : null;
    if (proprio) return Object.values(proprio.permissoes).includes('delegadas') ? 'unidade' : 'secretario';
    return x && x.nivel === 'unidade' ? 'unidade' : 'secretario';
  };

  // Perfil (papel) de quem usa: p é o perfil de acesso { id, area, papel? } (GC.perfil), u o usuário. Vale, nesta
  // ordem: o papel escolhido para o perfil aberto (p.papel: ?papel=, "Ver o painel como"), o perfil próprio do
  // usuário (u.papel, do cadastro) quando ele é o do perfil aberto, e o perfil do sistema. Papel que não combina com
  // o perfil aberto (um perfil de pasta no painel da cidade) é ignorado. Gestor do setor sem pasta não tem papel.
  let memoUsuario = { t: 0, u: null };
  function usuarioComPapelDoSistema() {
    const agora = Date.now();
    if (agora - memoUsuario.t > 1000) {
      const x = usuarioDe(undefined);
      memoUsuario = { t: agora, u: x && x.papel && PAPEL[x.papel] ? x : null };
    }
    return memoUsuario.u;
  }
  GC.papelDe = function (p, u) {
    if (!p) return null;
    if (p.papel) { const x = GC.papelPorId(p.papel); if (compativel(x, p)) return x; }
    // Só olha o usuário quando há perfil criado (GC.pode roda muito: sem isso, cada chamada leria a sessão).
    // Perfil do sistema gravado no usuário (o de visão resumida, 'gestor_consulta') também vale; para não ler a
    // sessão a cada chamada, o usuário atual é guardado por 1 s.
    const x = GC.perfisAcesso && GC.perfisAcesso.temCriados() ? usuarioDe(u) : u !== undefined ? u : usuarioComPapelDoSistema();
    if (x && x.papel && x.perfil === p.id && (x.area || null) === (p.area || null)) {
      const y = GC.papelPorId(x.papel);
      if (compativel(y, p)) return y;
    }
    if (p.id === 'prefeito') return PAPEL.gestor_geral;
    if (p.id === 'setor') return p.area ? PAPEL[GC.nivelDe(u) === 'unidade' ? 'diretor_unidade' : 'secretario'] : null;
    if (p.id === 'servidor') return p.area ? PAPEL.servidor : null;
    if (p.id === 'cidadao') return PAPEL.cidadao;
    return null;
  };
  // ---- o que um perfil criado pode ter ----
  // Permissões e alcances que cabem numa visão: as que os perfis do sistema daquela visão usam. Na visão da cidade,
  // sempre 'cidade'. Na da pasta, 'pasta' (ou 'delegadas', se algum perfil do sistema a usa); a aparência pessoal
  // (alcance 'cidade' nos perfis de pasta) vale só para a própria pessoa. Assim um perfil de pasta não ganha o lado
  // de quem cobra, nem um da cidade o de quem responde.
  // Pelo padrão de fábrica: ajustar um perfil do sistema não muda o que cabe em cada visão.
  const DO_PAINEL = GC.PERFIS_SISTEMA.filter((x) => x.pagina === 'painel').map((x) => ({ visao: x.visao, permissoes: GC.PERFIS_FABRICA[x.id].permissoes }));
  GC.alcancesPermitidos = function (visao, chave) {
    const usados = new Set(DO_PAINEL.filter((x) => x.visao === visao && x.permissoes[chave]).map((x) => x.permissoes[chave]));
    if (!usados.size) return [];
    if (visao === 'cidade' || usados.has('cidade')) return ['cidade'];
    return Object.values(GC.PERFIS_FABRICA).some((x) => x.permissoes[chave] === 'delegadas') ? ['pasta', 'delegadas'] : ['pasta'];
  };
  GC.chavesDaVisao = (visao) => GC.PERMISSOES.filter((x) => GC.alcancesPermitidos(visao, x.id).length).map((x) => x.id);
  // Só as permissões e alcances que cabem na visão (o resto cai fora).
  GC.normalizarPermissoes = function (visao, permissoes) {
    const o = {};
    Object.entries(permissoes || {}).forEach(([chave, alcance]) => { if (GC.alcancesPermitidos(visao, chave).includes(alcance)) o[chave] = alcance; });
    return o;
  };

  // Pastas do recorte (o setor e o servidor têm uma).
  GC.areasDoRecorte = (p) => (p && GC.perfilDePasta(p.id) && p.area ? [p.area] : []);

  // O que a pessoa enxerga: 'cidade' (o painel inteiro), 'pasta' (o painel recortado nas pastas dela), 'pessoal' (o
  // portal do servidor: só o que foi passado a ela) ou 'portal' (o Portal do Cidadão). null: sem perfil. É o que decide menu, telas, widgets, camadas, filtros e o lado da
  // cobrança e da meta (a pasta responde, a cidade cobra). Para "pode fazer X?", use GC.pode.
  GC.visaoDe = function (p = GC.perfil, u) {
    const papel = GC.papelDe(p, u);
    if (!papel) return null;
    return papel.pagina === 'portal' ? 'portal' : papel.visao;
  };

  const quemDe = (quem = {}) => ({ perfil: quem.perfil !== undefined ? quem.perfil : GC.perfil, usuario: quem.usuario });

  // Alcance que quem tem na permissão (null = não tem).
  GC.alcance = function (chave, quem) {
    const q = quemDe(quem);
    const papel = GC.papelDe(q.perfil, q.usuario);
    return (papel && CHAVES.has(chave) && papel.permissoes[chave]) || null;
  };

  // Pode? chave: a permissão; escopo: { area, delegada } do alvo (sem escopo: tem a permissão em algum alcance);
  // quem: { perfil, usuario } (padrão: GC.perfil e o usuário atual).
  GC.pode = function (chave, escopo, quem) {
    const q = quemDe(quem);
    const alcance = GC.alcance(chave, q);
    if (!alcance) return false;
    if (!escopo || alcance === 'cidade') return true;
    const naPasta = !!escopo.area && GC.areasDoRecorte(q.perfil).includes(escopo.area);
    if (alcance === 'pasta') return naPasta;
    return naPasta && escopo.delegada === true; // 'delegadas'
  };
})(window.GC = window.GC || {});
