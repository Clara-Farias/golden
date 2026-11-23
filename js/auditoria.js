(function (GC) {
  // Auditoria: quem fez o quê, quando e em quê. Grava no navegador (por cidade) o que acontece no painel e na
  // página de entrada, e junta um histórico simulado de 30 dias para a tela não abrir vazia.
  // Roda depois de js/sessao.js (GC.usuarioAtual). A tela é js/tela-auditoria.js (#/auditoria).
  const DIA = 24 * 60 * 60 * 1000;
  const MAX_GRAVADOS = 2000;

  GC.GRUPOS_AUDITORIA = [
    { id: 'acesso', nome: 'Acesso' },
    { id: 'conta', nome: 'Conta e senha' },
    { id: 'usuarios', nome: 'Usuários' },
    { id: 'ocorrencias', nome: 'Ocorrências' },
    { id: 'crise', nome: 'Gabinete de crise' },
    { id: 'metas', nome: 'Metas, plano de ação e plano de governo' },
    { id: 'tarefas', nome: 'Demandas' },
    { id: 'configuracao', nome: 'Configuração' },
    { id: 'exportacao', nome: 'Exportação' },
  ];

  // icone: nome do Tabler (ti-*). atencao: aparece destacado na tabela e conta no número "Acessos recusados".
  GC.ACOES_AUDITORIA = {
    entrar: { nome: 'Entrou no painel', grupo: 'acesso', icone: 'login-2' },
    sair: { nome: 'Saiu do painel', grupo: 'acesso', icone: 'logout' },
    entrar_falhou: { nome: 'Acesso recusado', grupo: 'acesso', icone: 'lock-x', atencao: true },
    bloqueio: { nome: 'Acesso bloqueado por tentativas', grupo: 'acesso', icone: 'lock', atencao: true },
    acesso_negado: { nome: 'Tentou abrir tela fora do perfil', grupo: 'acesso', icone: 'lock-access', atencao: true },
    codigo: { nome: 'Pediu código de recuperação', grupo: 'conta', icone: 'mail-forward' },
    redefinir_senha: { nome: 'Redefiniu a senha pelo código', grupo: 'conta', icone: 'key' },
    trocar_senha: { nome: 'Trocou a senha', grupo: 'conta', icone: 'key' },
    primeiro_acesso: { nome: 'Criou a senha no primeiro acesso', grupo: 'conta', icone: 'user-check' },
    usuario_criar: { nome: 'Cadastrou usuário', grupo: 'usuarios', icone: 'user-plus' },
    usuario_editar: { nome: 'Editou usuário', grupo: 'usuarios', icone: 'user-edit' },
    usuario_desativar: { nome: 'Desativou usuário', grupo: 'usuarios', icone: 'user-off' },
    perfil_criar: { nome: 'Criou perfil de acesso', grupo: 'usuarios', icone: 'shield-plus' },
    perfil_editar: { nome: 'Editou perfil de acesso', grupo: 'usuarios', icone: 'shield-cog' },
    perfil_excluir: { nome: 'Excluiu perfil de acesso', grupo: 'usuarios', icone: 'shield-x' },
    perfil_restaurar: { nome: 'Voltou perfil do sistema ao padrão', grupo: 'usuarios', icone: 'restore' },
    usuario_reativar: { nome: 'Reativou usuário', grupo: 'usuarios', icone: 'user-check' },
    usuario_reenviar: { nome: 'Gerou novo acesso provisório', grupo: 'usuarios', icone: 'key' },
    ocorrencia_cobrar: { nome: 'Cobrou a secretaria', grupo: 'ocorrencias', icone: 'speakerphone' },
    ocorrencia_priorizar: { nome: 'Priorizou a ocorrência', grupo: 'ocorrencias', icone: 'arrow-big-up-lines' },
    ocorrencia_gabinete: { nome: 'Convocou gabinete de crise', grupo: 'ocorrencias', icone: 'urgent' },
    cobranca_responder: { nome: 'Respondeu cobrança', grupo: 'ocorrencias', icone: 'message-reply' },
    cobranca_pedir_prazo: { nome: 'Pediu novo prazo', grupo: 'ocorrencias', icone: 'clock-plus' },
    cobranca_aprovar_prazo: { nome: 'Aprovou novo prazo', grupo: 'ocorrencias', icone: 'clock-check' },
    cobranca_recusar_prazo: { nome: 'Recusou novo prazo', grupo: 'ocorrencias', icone: 'clock-x' },
    cobranca_recobrar: { nome: 'Cobrou de novo', grupo: 'ocorrencias', icone: 'speakerphone' },
    cobranca_ciente: { nome: 'Ciente do pedido de recurso', grupo: 'ocorrencias', icone: 'eye-check' },
    cobranca_aprovar_recurso: { nome: 'Aprovou pedido de recurso', grupo: 'ocorrencias', icone: 'circle-check' },
    cobranca_negar_recurso: { nome: 'Negou pedido de recurso', grupo: 'ocorrencias', icone: 'circle-x' },
    cobranca_encerrar: { nome: 'Resolveu com evidência', grupo: 'ocorrencias', icone: 'circle-check' },
    operacao_despachar: { nome: 'Despachou equipe', grupo: 'ocorrencias', icone: 'car' },
    operacao_chegar: { nome: 'Marcou equipe no local', grupo: 'ocorrencias', icone: 'map-pin-check' },
    operacao_resolver: { nome: 'Resolveu a ocorrência', grupo: 'ocorrencias', icone: 'circle-check' },
    operacao_devolver: { nome: 'Devolveu à pasta certa', grupo: 'ocorrencias', icone: 'arrow-back-up' },
    operacao_juntar: { nome: 'Juntou duplicada', grupo: 'ocorrencias', icone: 'link' },
    operacao_delegar: { nome: 'Delegou a diretor de unidade', grupo: 'ocorrencias', icone: 'user-share' },
    prazo_pausar: { nome: 'Pausou o prazo da ocorrência', grupo: 'ocorrencias', icone: 'player-pause' },
    prazo_retomar: { nome: 'Retomou o prazo da ocorrência', grupo: 'ocorrencias', icone: 'player-play' },
    prazo_prorrogar: { nome: 'Pediu mais prazo', grupo: 'ocorrencias', icone: 'hourglass' },
    prazo_decidir: { nome: 'Decidiu pedido de mais prazo', grupo: 'ocorrencias', icone: 'hourglass-high' },
    prazo_parametros: { nome: 'Mudou os parâmetros de prazo', grupo: 'configuracao', icone: 'clock-cog' },
    pacto_propor: { nome: 'Propôs meta de indicador', grupo: 'metas', icone: 'target' },
    pacto_aceitar: { nome: 'Pactuou meta de indicador', grupo: 'metas', icone: 'target-arrow' },
    plano_criar: { nome: 'Registrou plano de ação', grupo: 'metas', icone: 'list-check' },
    plano_acao: { nome: 'Marcou ação do plano', grupo: 'metas', icone: 'checkbox' },
    plano_encerrar: { nome: 'Encerrou plano de ação', grupo: 'metas', icone: 'circle-check' },
    plano_editar: { nome: 'Mudou ação do plano', grupo: 'metas', icone: 'pencil' },
    plano_nova_acao: { nome: 'Acrescentou ação ao plano', grupo: 'metas', icone: 'list-check' },
    plano_cobrar: { nome: 'Cobrou ação do plano', grupo: 'metas', icone: 'speakerphone' },
    plano_responder: { nome: 'Respondeu cobrança de ação do plano', grupo: 'metas', icone: 'message-reply' },
    meta_governo_criar: { nome: 'Criou compromisso do plano de governo', grupo: 'metas', icone: 'flag-plus' },
    meta_governo_editar: { nome: 'Mudou compromisso do plano de governo', grupo: 'metas', icone: 'pencil' },
    meta_governo_remover: { nome: 'Removeu compromisso do plano de governo', grupo: 'metas', icone: 'trash' },
    meta_governo_restaurar: { nome: 'Restaurou compromisso do plano de governo', grupo: 'metas', icone: 'restore' },
    meta_governo_informar: { nome: 'Informou progresso de compromisso do plano de governo', grupo: 'metas', icone: 'progress-check' },
    reuniao_nota: { nome: 'Salvou notas da reunião', grupo: 'metas', icone: 'notes' },
    ajuda_pedir: { nome: 'Pediu ajuda a outra secretaria', grupo: 'ocorrencias', icone: 'heart-handshake' },
    ajuda_aceitar: { nome: 'Aceitou pedido de ajuda', grupo: 'ocorrencias', icone: 'circle-check' },
    ajuda_recusar: { nome: 'Recusou pedido de ajuda', grupo: 'ocorrencias', icone: 'circle-x' },
    ajuda_concluir: { nome: 'Concluiu ajuda', grupo: 'ocorrencias', icone: 'circle-check' },
    ajuda_escalar: { nome: 'Levou pedido de ajuda ao prefeito', grupo: 'ocorrencias', icone: 'arrow-up-right' },
    ajuda_determinar: { nome: 'Determinou ajuda entre secretarias', grupo: 'ocorrencias', icone: 'gavel' },
    ajuda_arquivar: { nome: 'Arquivou pedido de ajuda', grupo: 'ocorrencias', icone: 'archive' },
    prefeito_delegar: { nome: 'Delegou a decisão sobre a ocorrência', grupo: 'ocorrencias', icone: 'user-share' },
    prefeito_retomar: { nome: 'Retomou a decisão delegada', grupo: 'ocorrencias', icone: 'arrow-back-up' },
    delegacao_retornar: { nome: 'Deu o retorno da ocorrência delegada', grupo: 'ocorrencias', icone: 'message-reply' },
    prefeito_explicacao: { nome: 'Pediu explicação à secretaria', grupo: 'ocorrencias', icone: 'help-circle' },
    explicacao_responder: { nome: 'Respondeu ao pedido de explicação', grupo: 'ocorrencias', icone: 'message-reply' },
    explicacao_perguntar: { nome: 'Pediu mais explicação', grupo: 'ocorrencias', icone: 'help-circle' },
    explicacao_lida: { nome: 'Deu a explicação por recebida', grupo: 'ocorrencias', icone: 'eye-check' },
    prefeito_adiar: { nome: 'Adiou a ocorrência com motivo', grupo: 'ocorrencias', icone: 'clock-pause' },
    prefeito_desfazer_adiamento: { nome: 'Desfez o adiamento', grupo: 'ocorrencias', icone: 'clock-play' },
    acao_desfeita: { nome: 'Desfez a própria ação', grupo: 'ocorrencias', icone: 'arrow-back-up' },
    prefeito_definir_pasta: { nome: 'Definiu a pasta responsável', grupo: 'ocorrencias', icone: 'compass' },
    prefeito_reabrir: { nome: 'Reabriu a ocorrência', grupo: 'ocorrencias', icone: 'lock-open' },
    prefeito_falso_alarme: { nome: 'Marcou como falso alarme', grupo: 'ocorrencias', icone: 'ban' },
    prefeito_orgao: { nome: 'Acionou órgão de fora', grupo: 'ocorrencias', icone: 'building' },
    orgao_retorno: { nome: 'Registrou o retorno do órgão', grupo: 'ocorrencias', icone: 'message-reply' },
    prefeito_aviso: { nome: 'Publicou aviso à população', grupo: 'ocorrencias', icone: 'broadcast' },
    prefeito_retirar_aviso: { nome: 'Retirou o aviso do portal', grupo: 'ocorrencias', icone: 'broadcast-off' },
    prefeito_reconhecer: { nome: 'Reconheceu a equipe', grupo: 'ocorrencias', icone: 'thumb-up' },
    prefeito_agendar: { nome: 'Agendou visita ou conversa', grupo: 'ocorrencias', icone: 'calendar-plus' },
    agenda_feita: { nome: 'Marcou a visita ou conversa como feita', grupo: 'ocorrencias', icone: 'calendar-check' },
    agenda_cancelar: { nome: 'Cancelou a visita ou conversa', grupo: 'ocorrencias', icone: 'calendar-x' },
    acompanhar: { nome: 'Acompanhou a ocorrência', grupo: 'ocorrencias', icone: 'star' },
    crise_abrir: { nome: 'Abriu gabinete preventivo', grupo: 'crise', icone: 'urgent' },
    crise_tarefa: { nome: 'Criou demanda no gabinete', grupo: 'crise', icone: 'list-check' },
    crise_avancar: { nome: 'Avançou demanda do gabinete', grupo: 'crise', icone: 'player-track-next' },
    crise_cobrar: { nome: 'Cobrou demanda do gabinete', grupo: 'crise', icone: 'speakerphone' },
    crise_responder: { nome: 'Respondeu à cobrança do gabinete', grupo: 'crise', icone: 'message-reply' },
    crise_prazo: { nome: 'Estendeu prazo de demanda', grupo: 'crise', icone: 'clock-plus' },
    crise_comunicado: { nome: 'Publicou comunicado', grupo: 'crise', icone: 'news' },
    crise_encerrar: { nome: 'Encerrou gabinete', grupo: 'crise', icone: 'circle-check' },
    crise_questao: { nome: 'Respondeu questão do gabinete', grupo: 'crise', icone: 'help-circle' },
    tarefa_passar: { nome: 'Passou demanda', grupo: 'tarefas', icone: 'clipboard-plus' },
    tarefa_iniciar: { nome: 'Começou demanda', grupo: 'tarefas', icone: 'player-play' },
    tarefa_concluir: { nome: 'Concluiu demanda', grupo: 'tarefas', icone: 'clipboard-check' },
    tarefa_cobrar: { nome: 'Cobrou demanda', grupo: 'tarefas', icone: 'speakerphone' },
    tarefa_responder: { nome: 'Respondeu cobrança de demanda', grupo: 'tarefas', icone: 'message-reply' },
    tarefa_remarcar: { nome: 'Remarcou demanda', grupo: 'tarefas', icone: 'calendar-time' },
    tarefa_cancelar: { nome: 'Cancelou demanda', grupo: 'tarefas', icone: 'clipboard-x' },
    tarefa_atualizar: { nome: 'Deu notícia de demanda', grupo: 'tarefas', icone: 'message-2' },
    tarefa_duvida: { nome: 'Tirou dúvida sobre demanda', grupo: 'tarefas', icone: 'help-circle' },
    tarefa_esclarecer: { nome: 'Respondeu dúvida sobre demanda', grupo: 'tarefas', icone: 'message-check' },
    tarefa_pedir_atualizacao: { nome: 'Pediu notícia de demanda', grupo: 'tarefas', icone: 'bell-ringing' },
    crise_membro: { nome: 'Mudou a equipe da sala de crise', grupo: 'crise', icone: 'users-plus' },
    crise_pedido_membro: { nome: 'Pediu alguém da pasta para a sala', grupo: 'crise', icone: 'user-question' },
    crise_atualizacao: { nome: 'Mandou atualização à sala de crise', grupo: 'crise', icone: 'message-2' },
    crise_duvida: { nome: 'Dúvida da equipe na sala de crise', grupo: 'crise', icone: 'help-circle' },
    sazonal_salvar: { nome: 'Editou temporada do calendário sazonal', grupo: 'configuracao', icone: 'calendar-cog' },
    sazonal_criar: { nome: 'Criou temporada do calendário sazonal', grupo: 'configuracao', icone: 'calendar-plus' },
    sazonal_excluir: { nome: 'Removeu temporada do calendário sazonal', grupo: 'configuracao', icone: 'calendar-minus' },
    sazonal_restaurar: { nome: 'Restaurou temporada do calendário sazonal', grupo: 'configuracao', icone: 'refresh' },
    crise_modelo_salvar: { nome: 'Editou modelo de gabinete', grupo: 'crise', icone: 'template' },
    crise_modelo_criar: { nome: 'Criou modelo de gabinete', grupo: 'crise', icone: 'template' },
    crise_modelo_excluir: { nome: 'Removeu modelo de gabinete', grupo: 'crise', icone: 'trash' },
    crise_modelo_restaurar: { nome: 'Restaurou modelo de gabinete', grupo: 'crise', icone: 'refresh' },
    regra: { nome: 'Pausou ou retomou regra de alerta', grupo: 'configuracao', icone: 'adjustments' },
    regra_criada: { nome: 'Criou regra de alerta', grupo: 'configuracao', icone: 'bell-plus' },
    regra_editada: { nome: 'Editou regra de alerta', grupo: 'configuracao', icone: 'bell-cog' },
    regra_excluida: { nome: 'Excluiu regra de alerta', grupo: 'configuracao', icone: 'bell-minus' },
    regra_restaurada: { nome: 'Restaurou regra de alerta ao padrão', grupo: 'configuracao', icone: 'restore' },
    regra_limites: { nome: 'Mudou os limites de "Precisam de você"', grupo: 'configuracao', icone: 'adjustments-alt' },
    trocar_perfil: { nome: 'Trocou o perfil de acesso', grupo: 'configuracao', icone: 'user-cog' },
    trocar_cidade: { nome: 'Trocou a cidade da demonstração', grupo: 'configuracao', icone: 'building-community' },
    aparencia_pessoal: { nome: 'Mudou a própria aparência', grupo: 'conta', icone: 'brush' },
    aparencia_pasta: { nome: 'Mudou a aparência da pasta', grupo: 'configuracao', icone: 'palette' },
    aparencia_todos: { nome: 'Mudou a aparência padrão', grupo: 'configuracao', icone: 'palette' },
    marca: { nome: 'Mudou o nome ou o logo', grupo: 'configuracao', icone: 'photo-edit' },
    portal: { nome: 'Mudou o Portal do Cidadão', grupo: 'configuracao', icone: 'world' },
    entrega_confirmar: { nome: 'Confirmou a data de uma entrega', grupo: 'metas', icone: 'calendar-check' },
    entrega_remarcar: { nome: 'Remarcou uma entrega', grupo: 'metas', icone: 'calendar-repeat' },
    entrega_inaugurar: { nome: 'Marcou inauguração', grupo: 'metas', icone: 'confetti' },
    entrega_desmarcar: { nome: 'Desmarcou inauguração', grupo: 'metas', icone: 'calendar-x' },
    widget_site: { nome: 'Copiou código de widget para o site', grupo: 'configuracao', icone: 'code' },
    // O alvo diz o quê: Auditoria, Histórico de cobranças, Central de alertas.
    exportar: { nome: 'Exportou uma lista (CSV)', grupo: 'exportacao', icone: 'download' },
    relatorio_exportado: { nome: 'Baixou relatório', grupo: 'exportacao', icone: 'file-download' },
  };
  const A = GC.ACOES_AUDITORIA;

  // Número pseudoaleatório estável a partir de um texto (o mesmo histórico a cada carga da mesma cidade).
  function sorteador(texto) {
    let s = 0;
    for (const ch of String(texto)) s = (Math.imul(s, 31) + ch.codePointAt(0)) >>> 0;
    s = s || 1;
    const prox = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    return { prox, de: (lista) => lista[Math.floor(prox() * lista.length)], entre: (a, b) => a + Math.floor(prox() * (b - a + 1)) };
  }

  const nomeArea = (id) => {
    const a = ((GC.data && GC.data.areas) || []).find((x) => x.id === id);
    return a ? a.secretaria.nome : id;
  };

  // Histórico simulado: 30 dias de expediente, com o gabinete agindo nas ocorrências e as pastas no gabinete de crise.
  function historicoSimulado({ cidade, agora, usuarios }) {
    const r = sorteador(`auditoria-${cidade}`);
    const gab = usuarios.filter((u) => u.perfil === 'prefeito');
    const setor = usuarios.filter((u) => u.perfil === 'setor');
    if (!gab.length) return [];
    const ocorrencias = ((GC.data && GC.data.ocorrencias) || []).filter((o) => o.titulo);
    const bairro = (id) => ((GC.data.bairros || []).find((b) => b.id === id) || { nome: '' }).nome;
    const umaOcorrencia = () => {
      const o = r.de(ocorrencias);
      return o ? { alvo: `${o.titulo}${bairro(o.bairroId) ? ` (${bairro(o.bairroId)})` : ''}`, areaAlvo: o.area, ref: { tipo: 'ocorrencia', id: o.id } } : { alvo: 'Ocorrência', areaAlvo: null };
    };
    const hoje0 = new Date(agora);
    hoje0.setHours(0, 0, 0, 0);
    const eventos = [];
    const add = (t, u, acao, extra = {}) => { if (t < agora) eventos.push({ t, usuario: u, acao, ...extra }); };
    for (let d = 30; d >= 0; d -= 1) {
      const dia = hoje0.getTime() - d * DIA;
      const semana = new Date(dia).getDay();
      if (semana === 0) continue; // domingo: só o plantão (nada no histórico)
      const hora = (h, m) => dia + h * 3600000 + m * 60000;
      // Gabinete: entra de manhã, age em 1 a 3 ocorrências, às vezes mexe numa regra ou exporta.
      gab.forEach((u, i) => {
        if (i > 0 && r.prox() < 0.35) return;
        const h0 = r.entre(7, 9);
        add(hora(h0, r.entre(0, 59)), u, 'entrar');
        const n = r.entre(1, 3);
        for (let k = 0; k < n; k += 1) {
          add(hora(h0 + 1 + k * 2, r.entre(0, 59)), u, r.de(['ocorrencia_cobrar', 'ocorrencia_cobrar', 'ocorrencia_priorizar', 'ocorrencia_gabinete']), umaOcorrencia());
        }
        if (r.prox() < 0.12) add(hora(15, r.entre(0, 59)), u, 'regra', { alvo: r.de(['Prazo estourado', 'Várias secretarias', 'Caso repetido no bairro']), detalhe: r.de(['Pausada', 'Retomada']) });
        if (r.prox() < 0.08) add(hora(17, r.entre(0, 30)), u, 'exportar', { alvo: 'Auditoria', detalhe: 'CSV' });
        if (r.prox() < 0.6) add(hora(r.entre(18, 20), r.entre(0, 59)), u, 'sair');
      });
      // Pastas: algumas entram, avançam tarefas do gabinete e às vezes erram a senha.
      setor.forEach((u) => {
        if (r.prox() < 0.45) return;
        const h0 = r.entre(7, 10);
        if (r.prox() < 0.07) add(hora(h0, 1), u, 'entrar_falhou', { alvo: u.email, detalhe: 'Senha não confere' });
        add(hora(h0, r.entre(5, 59)), u, 'entrar');
        if (r.prox() < 0.5) add(hora(h0 + r.entre(1, 5), r.entre(0, 59)), u, r.de(['crise_avancar', 'crise_avancar', 'crise_comunicado']), { alvo: `Demanda da ${nomeArea(u.area)}`, areaAlvo: u.area });
        if (r.prox() < 0.03) add(hora(h0 + 1, 0), u, 'trocar_senha');
      });
      // Raramente, alguém de fora tenta um e-mail que não existe.
      if (r.prox() < 0.06) add(hora(r.entre(0, 5), r.entre(0, 59)), null, 'entrar_falhou', { alvo: `contato@${r.de(['gmail.com', 'prefeitura.demo', 'outlook.com'])}`, detalhe: 'E-mail não cadastrado' });
    }
    return eventos.map((e, i) => montarEvento({ ...e, id: `s${i}`, cidade }));
  }

  // ref: o item que a ação tocou, para a tela abrir ({ tipo: 'ocorrencia' | 'gabinete' | 'tarefa' | 'regra', id }).
  GC.TIPOS_REF_AUDITORIA = ['ocorrencia', 'gabinete', 'tarefa', 'regra'];
  const refValida = (r) => (r && GC.TIPOS_REF_AUDITORIA.includes(r.tipo) && r.id != null ? { tipo: r.tipo, id: String(r.id) } : null);

  function montarEvento({ id, t, usuario, acao, alvo = '', areaAlvo = null, detalhe = '', ref = null, cidade }) {
    const u = usuario || null;
    return {
      id,
      t,
      usuarioId: u ? u.id : null,
      quem: u ? u.nome : 'Não identificado',
      cargo: u ? u.cargo : '',
      perfil: u ? u.perfil : null,
      area: u ? u.area || null : null,
      cidade,
      acao,
      alvo: String(alvo || ''),
      areaAlvo: areaAlvo || null,
      detalhe: String(detalhe || ''),
      ref: refValida(ref),
    };
  }

  // armazenamento: { ler(), gravar(lista) }. cidade: id da cidade (cada cidade tem o seu histórico).
  GC.criarAuditoria = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), usuarios = () => (GC.data && GC.data.usuarios) || [], cidade = 'media', simulado = true } = {}) {
    let mem = [];
    const S = armazenamento || { ler: () => mem, gravar: (l) => { mem = l; } };
    const lista = () => (typeof usuarios === 'function' ? usuarios() : usuarios);
    const semente = simulado ? historicoSimulado({ cidade, agora: agora(), usuarios: lista() }) : [];
    const ouvintes = [];
    const gravados = () => (S.ler() || []).filter((e) => e && A[e.acao]);

    function registrar(acao, dados = {}) {
      if (!A[acao]) return null;
      const u = dados.usuario !== undefined ? dados.usuario : (dados.usuarioId ? lista().find((x) => x.id === dados.usuarioId) : null);
      const e = montarEvento({ id: `e${agora().toString(36)}${Math.random().toString(36).slice(2, 6)}`, t: agora(), usuario: u, acao, alvo: dados.alvo, areaAlvo: dados.areaAlvo, detalhe: dados.detalhe, ref: dados.ref, cidade });
      S.gravar([...gravados(), e].slice(-MAX_GRAVADOS));
      ouvintes.forEach((f) => f(e));
      return e;
    }

    // Do mais novo ao mais antigo, só da cidade.
    const todos = () => [...semente, ...gravados()].filter((e) => e.cidade === cidade).sort((a, b) => b.t - a.t);

    return { registrar, todos, aoRegistrar: (f) => ouvintes.push(f), cidade };
  };

  // ---- consultas (puras, testáveis) ----

  // O que o perfil enxerga: o gestor geral, tudo; o do setor, o que foi feito por gente da pasta ou tocou a pasta.
  // Permissão 'auditoria.ver': alcance 'cidade', tudo; 'pasta', o que foi feito na pasta ou a tocou.
  GC.auditoriaDoPerfil = function (lista, p = GC.perfil) {
    if (!p) return lista;
    const alcance = GC.alcance('auditoria.ver', { perfil: p });
    if (alcance === 'cidade') return lista;
    if (!alcance) return [];
    const areas = GC.areasDoRecorte(p);
    return lista.filter((e) => areas.includes(e.area) || areas.includes(e.areaAlvo));
  };

  // Entradas e saídas: a rotina que a tela esconde de fábrica e junta por pessoa e dia.
  GC.ACOES_ROTINA_AUDITORIA = ['entrar', 'sair'];
  const ROTINA = new Set(GC.ACOES_ROTINA_AUDITORIA);

  // filtros: { texto, usuarioId, grupo, acao, area, desde e ate (timestamps), atencao, semRotina }. area pega quem é da pasta
  // e o que tocou a pasta; grupo e acao aceitam vários separados por vírgula ('ocorrencias,crise'); atencao: só o que
  // pede atenção; semRotina: sem entradas e saídas (não vale quando a ação foi escolhida).
  GC.filtrarAuditoria = function (lista, f = {}) {
    const texto = String(f.texto || '').trim().toLowerCase();
    const grupos = f.grupo ? String(f.grupo).split(',') : null;
    const acoes = f.acao ? String(f.acao).split(',') : null;
    return lista.filter((e) => {
      if (f.usuarioId && e.usuarioId !== f.usuarioId) return false;
      if (grupos && !grupos.includes((A[e.acao] || {}).grupo)) return false;
      if (acoes && !acoes.includes(e.acao)) return false;
      if (f.semRotina && !acoes && ROTINA.has(e.acao)) return false;
      if (f.atencao && !(A[e.acao] || {}).atencao) return false;
      if (f.area && e.area !== f.area && e.areaAlvo !== f.area) return false;
      if (f.desde && e.t < f.desde) return false;
      if (f.ate && e.t > f.ate) return false;
      if (texto && ![e.quem, e.cargo, e.alvo, e.detalhe, (A[e.acao] || {}).nome].join(' ').toLowerCase().includes(texto)) return false;
      return true;
    });
  };

  // Junta as entradas (e as saídas) da mesma pessoa no mesmo dia num item só, no lugar da mais nova. A lista vem do
  // mais novo ao mais antigo. Devolve [{ i, e }] (i = posição na lista) ou [{ i, e, chave, vezes: [{ i, e }] }] para
  // os grupos de 2 ou mais; o que não é rotina nunca se junta.
  GC.agruparAuditoria = function (lista) {
    const dia = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const grupos = new Map();
    const itens = [];
    lista.forEach((e, i) => {
      if (!ROTINA.has(e.acao) || !e.usuarioId) { itens.push({ i, e }); return; }
      const chave = `${dia(e.t)}|${e.usuarioId}|${e.acao}`;
      const g = grupos.get(chave);
      if (g) { g.vezes.push({ i, e }); return; }
      const novo = { i, e, chave, vezes: [{ i, e }] };
      grupos.set(chave, novo);
      itens.push(novo);
    });
    return itens.map((it) => (it.vezes && it.vezes.length < 2 ? { i: it.i, e: it.e } : it));
  };

  GC.resumoAuditoria = (lista) => ({
    eventos: lista.length,
    pessoas: new Set(lista.map((e) => e.usuarioId).filter(Boolean)).size,
    ocorrencias: lista.filter((e) => (A[e.acao] || {}).grupo === 'ocorrencias' || (A[e.acao] || {}).grupo === 'crise').length,
    recusas: lista.filter((e) => (A[e.acao] || {}).atencao).length,
  });

  // Tendência dos números do topo. f: os mesmos filtros do filtrarAuditoria, com desde (null = tudo); agora: o fim.
  // Compara com a janela de mesmo tamanho logo antes, cortada na mesma hora ("Hoje" contra ontem até esta hora).
  // serie: os números por dia (por hora em "Hoje", até 30 dias em "Tudo"), do mais antigo ao mais novo.
  // Devolve { atual, anterior (null em "Tudo"), serie: [{ t, fim, resumo }], passo: 'dia' | 'hora' }.
  GC.tendenciaAuditoria = function (lista, f = {}, agora = Date.now()) {
    const dia = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const sem = Object.assign({}, f, { desde: null, ate: null });
    const todos = GC.filtrarAuditoria(lista, sem).filter((e) => e.t <= agora);
    const atualLista = f.desde ? todos.filter((e) => e.t >= f.desde) : todos;
    let anterior = null;
    if (f.desde) {
      const tam = dia(agora) - f.desde + 86400000; // os dias inteiros do período
      anterior = GC.resumoAuditoria(todos.filter((e) => e.t >= f.desde - tam && e.t <= agora - tam));
    }
    const porHora = f.desde && f.desde >= dia(agora);
    const marcos = [];
    if (porHora) {
      for (let h = 0; h <= new Date(agora).getHours(); h++) { const d = new Date(dia(agora)); d.setHours(h); marcos.push(d.getTime()); }
    } else {
      const inicio = f.desde || (todos.length ? dia(todos[todos.length - 1].t) : dia(agora));
      for (let d = new Date(dia(agora)); d.getTime() >= inicio && marcos.length < 30; d.setDate(d.getDate() - 1)) marcos.unshift(d.getTime());
    }
    const serie = marcos.map((t, k) => {
      const fim = k + 1 < marcos.length ? marcos[k + 1] : agora + 1;
      return { t, fim, resumo: GC.resumoAuditoria(atualLista.filter((e) => e.t >= t && e.t < fim)) };
    });
    return { atual: GC.resumoAuditoria(atualLista), anterior, serie, passo: porHora ? 'hora' : 'dia' };
  };

  const dataHora = (t) => {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  GC.dataHoraAuditoria = dataHora;
  const PERFIL_NOME = { prefeito: 'Gestor geral', setor: 'Gestor do setor' };
  const campo = (v) => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  GC.csvAuditoria = function (lista) {
    const cab = ['data_hora', 'pessoa', 'cargo', 'perfil', 'secretaria_da_pessoa', 'acao', 'alvo', 'secretaria_do_alvo', 'detalhe'];
    const linhas = lista.map((e) => [dataHora(e.t), e.quem, e.cargo, PERFIL_NOME[e.perfil] || '', e.area ? nomeArea(e.area) : '', (A[e.acao] || {}).nome || e.acao, e.alvo, e.areaAlvo ? nomeArea(e.areaAlvo) : '', e.detalhe]);
    return `﻿${[cab, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n')}\r\n`;
  };

  // ---- instância do navegador ----
  const cidadeAtual = () => {
    if (GC.cidade) return GC.cidade.id;
    try { return new URLSearchParams(window.location.search).get('cidade') || window.localStorage.getItem('vd-cidade') || 'media'; } catch (e) { return 'media'; }
  };
  const CHAVE = 'vd-auditoria';
  GC.auditoria = GC.criarAuditoria({
    cidade: cidadeAtual(),
    armazenamento: {
      ler() { try { return JSON.parse(window.localStorage.getItem(CHAVE)) || []; } catch (e) { return []; } },
      gravar(l) { try { window.localStorage.setItem(CHAVE, JSON.stringify(l)); } catch (e) { /* sem armazenamento */ } },
    },
  });
  // Registro em nome de quem está usando o painel (ou de dados.usuario, quando é outro: tela de entrada).
  GC.auditar = (acao, dados = {}) => GC.auditoria.registrar(acao, Object.assign({ usuario: GC.usuarioAtual ? GC.usuarioAtual() : null }, dados));
})(window.GC = window.GC || {});
