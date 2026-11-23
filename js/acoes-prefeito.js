(function (GC) {
  // Mais ações do prefeito sobre uma ocorrência, além de cobrar, priorizar e convocar gabinete
  // (spec: docs/specs/2026-11-12-vila-dourada-mais-acoes-do-prefeito-design.md):
  // - delegar a alguém (chefe de gabinete ou secretário de uma pasta envolvida), que dá o retorno;
  // - pedir explicação: a secretaria responde por escrito, dentro do sistema, no prazo de resposta da cobrança;
  // - adiar com motivo: a ocorrência sai de "Precisam de você" até a hora marcada (o prazo da secretaria não muda).
  // Só lógica, sem DOM. Mesmo molde das cobranças (js/cobrancas.js): guardado no armazenamento (localStorage no
  // navegador, gc.acoesPrefeito.<cidade>) e relido antes de cada mudança, porque o prefeito e o secretário
  // mexem no mesmo registro em abas diferentes. Nada aqui usa o.acaoPrefeito: priorizar e gabinete seguem lá.

  const MIN = 60000;
  GC.TIPOS_ACAO_PREFEITO = { delegacao: 'Delegação', explicacao: 'Pedido de explicação', adiamento: 'Adiamento' };
  GC.MOTIVOS_ADIAMENTO = {
    clima: 'Esperar o tempo melhorar',
    verba: 'Esperar verba ou licitação',
    outra_acao: 'Depende de outra ação em curso',
    baixo_impacto: 'Impacto baixo agora',
    outro: 'Outro motivo',
  };
  GC.HORAS_ADIAMENTO = [2, 6, 24, 72];
  const PRAZO_EXPLICACAO = (sev) => ((GC.PRAZO_RESPOSTA_MIN || {})[sev] || (GC.PRAZO_RESPOSTA_MIN || {}).media || 120) * MIN;

  // Segunda leva (spec: docs/specs/2026-11-13-vila-dourada-acoes-do-prefeito-2-design.md): órgão de fora, aviso à
  // população, acompanhar, reconhecer a equipe e agendar visita ou conversa moram aqui. Definir a pasta, reabrir e
  // falso alarme mudam a ocorrência: são gestos da store, que viajam pelo registro da operação (js/operacao.js).
  Object.assign(GC.TIPOS_ACAO_PREFEITO, {
    orgao: 'Órgão de fora acionado', aviso: 'Aviso à população', acompanhamento: 'Acompanhamento',
    reconhecimento: 'Reconhecimento', agenda: 'Visita ou conversa',
  });
  GC.ORGAOS_EXTERNOS = {
    energia: 'Concessionária de energia',
    agua: 'Companhia de água e esgoto',
    estado: 'Governo do estado',
    rodovia: 'Concessionária da rodovia',
    policia: 'Polícia Militar',
    bombeiros: 'Corpo de Bombeiros',
    outro: 'Outro órgão',
  };
  GC.DIAS_RETORNO_ORGAO = [1, 3, 7];
  GC.FORMAS_AGENDA = { visita: 'Visita ao local', conversa: 'Conversa com o secretário' };
  GC.MOTIVOS_REABRIR = {
    evidencia: 'A evidência não mostra o serviço feito',
    cidadao: 'O morador diz que não foi resolvido',
    voltou: 'O problema voltou',
    outro: 'Outro motivo',
  };
  GC.MOTIVOS_FALSO_ALARME = {
    dado_errado: 'O dado que disparou estava errado',
    ja_resolvido: 'Já estava resolvido quando disparou',
    nao_e_problema: 'Não é um problema da Prefeitura',
    outro: 'Outro motivo',
  };
  // Tipos que contam como "alguém está cuidando" (a ocorrência desce em "Precisam de você").
  const TRATAM = ['delegacao', 'explicacao', 'adiamento', 'orgao', 'agenda'];
  const DIA = 24 * 60 * MIN;
  const nomeSec = (area) => ((GC.data && GC.data.areas.find((a) => a.id === area)) || { secretaria: { nome: 'a secretaria' } }).secretaria.nome;
  const nomeBairro = (id) => ((GC.data && GC.data.bairros.find((b) => b.id === id)) || { nome: '' }).nome;
  const quandoTexto = (t) => { const d = new Date(t); return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };
  GC.quandoAgenda = quandoTexto;
  // Texto proposto para o aviso à população (o prefeito revisa antes de publicar).
  // Falsos alarmes por regra (ou tipo, nas ocorrências sem regra): o que a store marcou. Mostra onde a regra erra.
  GC.falsosAlarmes = function (store) {
    const n = {};
    (store && store.todas ? store.todas() : []).filter((o) => o.falsoAlarme).forEach((o) => { const k = o.falsoAlarme.regraId; n[k] = (n[k] || 0) + 1; });
    return n;
  };
  GC.textoAvisoPublico = (o) => `${o.titulo}${nomeBairro(o.bairroId) ? ` (${nomeBairro(o.bairroId)})` : ''}. A ${nomeSec(o.area)} já está cuidando. Se puder, evite a região e acompanhe as atualizações por aqui.`;

  const texto = (t) => String(t == null ? '' : t).trim();
  const falha = (motivo) => ({ ok: false, motivo });
  const tt = (ms) => (GC.tempoTexto ? GC.tempoTexto(Math.max(1, Math.round(ms / MIN))) : `${Math.max(1, Math.round(ms / MIN))} min`);
  const nomeUsuario = (id) => ((GC.buscarUsuario && GC.buscarUsuario(id)) || { nome: 'outra pessoa' }).nome;

  // Situação de cada registro, calculada (t: agora).
  const ativa = (r, t) => {
    if (r.tipo === 'delegacao') return r.estado === 'ativa';
    if (r.tipo === 'explicacao') return r.estado === 'aberta' || r.estado === 'respondida';
    if (r.tipo === 'orgao') return r.estado === 'aguardando';
    if (r.tipo === 'aviso') return r.estado === 'publicado';
    if (r.tipo === 'acompanhamento') return r.estado === 'ativo';
    if (r.tipo === 'reconhecimento') return false; // é um registro, não fica "em curso"
    if (r.tipo === 'agenda') return r.estado === 'marcada' && t < r.quando + 2 * 60 * MIN; // até 2 h depois da hora
    return r.estado === 'ativo' && t < r.ate; // adiamento: só vale até a hora marcada
  };
  // Sem resposta no prazo: a explicação da secretaria e o retorno do órgão de fora.
  const vencidaEm = (r, t) => (r.tipo === 'explicacao' && r.estado === 'aberta' && t > r.prazoRespostaEm)
    || (r.tipo === 'orgao' && r.estado === 'aguardando' && t > r.prazoRetornoEm);

  // Pessoas a quem o prefeito pode delegar: o gabinete (menos quem delega) e o secretário de cada pasta envolvida.
  GC.candidatosDelegacao = function (o, eu = null) {
    const usuarios = ((GC.data && GC.data.usuarios) || []).filter((u) => u.ativo !== false);
    const areas = (o && (o.areasEnvolvidas || [o.area])) || [];
    const gabinete = usuarios.filter((u) => u.perfil === 'prefeito' && u.id !== eu);
    const secretarios = areas.map((a) => usuarios.find((u) => u.perfil === 'setor' && u.area === a && GC.nivelDe(u) !== 'unidade')).filter(Boolean);
    return [...gabinete, ...secretarios];
  };

  // Situação em uma linha (detalhe, cartões, aba Cobranças).
  GC.resumoAcaoPrefeito = function (r, t = GC.agora ? GC.agora() : Date.now()) {
    if (r.tipo === 'delegacao') {
      if (r.estado === 'concluida') return `👤 ${r.paraNome} deu o retorno`;
      if (r.estado === 'retomada') return '👤 Você retomou a decisão';
      if (r.estado === 'encerrada') return `👤 Estava com ${r.paraNome} · ocorrência encerrada`;
      return `👤 Delegada a ${r.paraNome} há ${tt(t - r.em)}`;
    }
    if (r.tipo === 'explicacao') {
      if (r.estado === 'encerrada') return '❓ Explicação recebida';
      if (r.estado === 'respondida') return '❓ A secretaria explicou · o prefeito ainda não leu';
      return vencidaEm(r, t) ? `❓ Explicação pedida · sem resposta há ${tt(t - r.prazoRespostaEm)}` : `❓ Explicação pedida · resposta em até ${tt(r.prazoRespostaEm - t)}`;
    }
    if (r.tipo === 'orgao') {
      const org = r.orgaoNome;
      if (r.estado === 'respondido') return `🏢 ${org} respondeu`;
      if (r.estado === 'encerrado') return `🏢 ${org} · ocorrência encerrada`;
      return vencidaEm(r, t) ? `🏢 ${org} sem retorno há ${tt(t - r.prazoRetornoEm)}` : `🏢 Aguardando ${org} · retorno até ${quandoTexto(r.prazoRetornoEm).split(' às')[0]}`;
    }
    if (r.tipo === 'aviso') return r.estado === 'publicado' ? '📢 Aviso no Portal do Cidadão' : '📢 Aviso retirado do portal';
    if (r.tipo === 'acompanhamento') return r.estado === 'ativo' ? '⭐ Você acompanha' : '⭐ Acompanhamento encerrado';
    if (r.tipo === 'reconhecimento') return `👏 Reconhecimento à ${nomeSec(r.area)}`;
    if (r.tipo === 'agenda') {
      const forma = GC.FORMAS_AGENDA[r.forma] || 'Agenda';
      if (r.estado === 'feita') return `📅 ${forma} feita`;
      if (r.estado === 'cancelada') return `📅 ${forma} cancelada`;
      return t < r.quando ? `📅 ${forma} marcada para ${quandoTexto(r.quando)}` : `📅 ${forma} era ${quandoTexto(r.quando)} · marque se foi feita`;
    }
    if (r.estado === 'retomado') return '🕰 Adiamento desfeito';
    const motivo = GC.MOTIVOS_ADIAMENTO[r.motivo] || 'adiada';
    return t < r.ate ? `🕰 Adiada por mais ${tt(r.ate - t)} · ${motivo}` : `🕰 O adiamento acabou há ${tt(t - r.ate)}`;
  };

  GC.criarAcoesPrefeito = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.acoesPrefeito' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ler = () => { const v = A.ler(chave); return Array.isArray(v) ? v : []; };
    let lista = ler();
    const ouvintes = new Set();
    const emitir = (tipo, r) => ouvintes.forEach((fn) => fn({ tipo, registro: r }));
    const passo = (r, tipo, extra) => r.passos.push(Object.assign({ tipo, em: agora() }, extra));

    function mudar(id, fn, evento) {
      lista = ler();
      const r = lista.find((x) => x.id === id);
      if (!r) return falha('nao_encontrado');
      const res = fn(r) || { ok: true };
      if (!res.ok) return res;
      A.gravar(chave, lista);
      emitir(evento, r);
      return { ok: true, registro: r };
    }

    // A ativa do tipo para a ocorrência (no máximo uma de cada).
    const ativaDe = (oid, tipo, t = agora()) => ler().find((r) => r.ocorrenciaId === oid && r.tipo === tipo && ativa(r, t)) || null;

    // aceitaResolvida: reconhecer a equipe vale também depois de resolvida.
    function criar(o, tipo, de, extra, { aceitaResolvida = false } = {}) {
      if (!o || (o.status === 'resolvida' && !aceitaResolvida)) return falha('ocorrencia');
      if (ativaDe(o.id, tipo)) return falha('ja_existe');
      lista = ler();
      const t = agora();
      const r = Object.assign({
        id: `ap-${tipo}-${o.id}-${t}-${lista.length + 1}`,
        tipo,
        ocorrenciaId: o.id,
        area: o.area,
        retrato: { titulo: o.titulo, bairroId: o.bairroId, severidade: o.severidade },
        de: { usuarioId: de.usuarioId || null, quem: de.quem || 'Prefeito(a)' },
        em: t,
        passos: [],
      }, extra(t));
      lista.push(r);
      A.gravar(chave, lista);
      emitir('novo', r);
      return { ok: true, registro: r };
    }

    const api = {
      ativa: (r, t = agora()) => ativa(r, t),
      vencida: (r, t = agora()) => vencidaEm(r, t),
      todas: () => (lista = ler()).slice(),
      buscar: (id) => (lista = ler()).find((r) => r.id === id) || null,
      daOcorrencia: (oid) => (lista = ler()).filter((r) => r.ocorrenciaId === oid),
      ativaDe,

      // ---- delegar ----
      // pedido: { para: id do usuário, texto: orientação (opcional) }.
      delegar(o, pedido = {}, de = {}) {
        const alvo = GC.buscarUsuario ? GC.buscarUsuario(pedido.para) : null;
        if (!alvo || !GC.candidatosDelegacao(o, de.usuarioId).some((u) => u.id === alvo.id)) return falha('para');
        return criar(o, 'delegacao', de, () => ({ para: alvo.id, paraNome: alvo.nome, paraCargo: alvo.cargo || '', texto: texto(pedido.texto), estado: 'ativa' }));
      },
      // Quem recebeu dá o retorno (o que decidiu ou fez): a delegação termina.
      retornar(id, retorno, quem = 'Responsável') {
        return mudar(id, (r) => {
          if (r.tipo !== 'delegacao' || r.estado !== 'ativa') return falha('estado');
          if (!texto(retorno)) return falha('texto');
          r.estado = 'concluida';
          passo(r, 'retorno', { texto: texto(retorno), quem });
          return null;
        }, 'retorno');
      },
      // O prefeito pega a decisão de volta.
      retomar(id, obs = '', quem = 'Prefeito(a)') {
        return mudar(id, (r) => {
          if (r.tipo !== 'delegacao' || r.estado !== 'ativa') return falha('estado');
          r.estado = 'retomada';
          passo(r, 'retomada', { texto: texto(obs), quem });
          return null;
        }, 'retomada');
      },

      // ---- pedir explicação ----
      pedirExplicacao(o, pergunta, de = {}) {
        if (!texto(pergunta)) return falha('texto');
        return criar(o, 'explicacao', de, (t) => ({ pergunta: texto(pergunta), estado: 'aberta', prazoRespostaEm: t + PRAZO_EXPLICACAO(o.severidade) }));
      },
      explicar(id, resposta, quem = 'Secretaria', simulada = false) {
        return mudar(id, (r) => {
          if (r.tipo !== 'explicacao' || r.estado !== 'aberta') return falha('estado');
          if (!texto(resposta)) return falha('texto');
          r.estado = 'respondida';
          passo(r, 'resposta', { texto: texto(resposta), quem, simulada: !!simulada });
          return null;
        }, 'resposta');
      },
      // O prefeito leu e quer saber mais: volta para a secretaria, com novo prazo.
      perguntarDeNovo(id, pergunta, quem = 'Prefeito(a)') {
        return mudar(id, (r) => {
          if (r.tipo !== 'explicacao' || r.estado !== 'respondida') return falha('estado');
          if (!texto(pergunta)) return falha('texto');
          r.estado = 'aberta';
          r.prazoRespostaEm = agora() + PRAZO_EXPLICACAO(r.retrato.severidade);
          passo(r, 'pergunta', { texto: texto(pergunta), quem });
          return null;
        }, 'pergunta');
      },
      // O prefeito leu e está satisfeito.
      darPorExplicada(id, quem = 'Prefeito(a)') {
        return mudar(id, (r) => {
          if (r.tipo !== 'explicacao' || r.estado !== 'respondida') return falha('estado');
          r.estado = 'encerrada';
          passo(r, 'lida', { quem });
          return null;
        }, 'lida');
      },

      // ---- adiar com motivo ----
      // pedido: { motivo: chave de GC.MOTIVOS_ADIAMENTO, texto, horas }. "Outro motivo" exige o texto.
      adiar(o, pedido = {}, de = {}) {
        if (!GC.MOTIVOS_ADIAMENTO[pedido.motivo]) return falha('motivo');
        if (pedido.motivo === 'outro' && !texto(pedido.texto)) return falha('texto');
        const h = Number(pedido.horas);
        if (!(h > 0)) return falha('horas');
        if (ativaDe(o && o.id, 'adiamento')) return falha('ja_existe');
        return criar(o, 'adiamento', de, (t) => ({ motivo: pedido.motivo, texto: texto(pedido.texto), horas: h, ate: t + h * 60 * MIN, estado: 'ativo' }));
      },
      // Desfaz antes da hora: a ocorrência volta a pedir atenção agora.
      desfazerAdiamento(id, quem = 'Prefeito(a)') {
        return mudar(id, (r) => {
          if (r.tipo !== 'adiamento' || !ativa(r, agora())) return falha('estado');
          r.estado = 'retomado';
          passo(r, 'retomado', { quem });
          return null;
        }, 'retomado');
      },

      // ---- acionar órgão de fora ----
      // pedido: { orgao: chave de GC.ORGAOS_EXTERNOS, texto: o que se pediu, dias: prazo para o retorno }. O órgão não
      // está no sistema: o gabinete registra o ofício e, quando o retorno chega, registra o que ele disse.
      acionarOrgao(o, pedido = {}, de = {}) {
        if (!GC.ORGAOS_EXTERNOS[pedido.orgao]) return falha('orgao');
        if (pedido.orgao === 'outro' && !texto(pedido.nomeOrgao)) return falha('nome_orgao');
        if (!texto(pedido.texto)) return falha('texto');
        const d = Number(pedido.dias);
        if (!(d > 0)) return falha('dias');
        const nome = pedido.orgao === 'outro' ? texto(pedido.nomeOrgao) : GC.ORGAOS_EXTERNOS[pedido.orgao];
        return criar(o, 'orgao', de, (t) => ({ orgao: pedido.orgao, orgaoNome: nome, texto: texto(pedido.texto), dias: d, prazoRetornoEm: t + d * DIA, estado: 'aguardando' }));
      },
      retornoOrgao(id, resposta, quem = 'Gabinete') {
        return mudar(id, (r) => {
          if (r.tipo !== 'orgao' || r.estado !== 'aguardando') return falha('estado');
          if (!texto(resposta)) return falha('texto');
          r.estado = 'respondido';
          passo(r, 'retorno_orgao', { texto: texto(resposta), quem });
          return null;
        }, 'retorno_orgao');
      },

      // ---- avisar a população (Portal do Cidadão) ----
      avisarPopulacao(o, pedido = {}, de = {}) {
        if (!texto(pedido.texto)) return falha('texto');
        return criar(o, 'aviso', de, () => ({ titulo: `${o.titulo}${nomeBairro(o.bairroId) ? ` (${nomeBairro(o.bairroId)})` : ''}`, texto: texto(pedido.texto), bairroId: o.bairroId, estado: 'publicado' }));
      },
      retirarAviso(id, quem = 'Gabinete') {
        return mudar(id, (r) => {
          if (r.tipo !== 'aviso' || r.estado !== 'publicado') return falha('estado');
          r.estado = 'retirado';
          passo(r, 'retirado', { quem });
          return null;
        }, 'retirado');
      },
      // O que o portal mostra: os avisos publicados, do mais novo para o mais antigo.
      avisosPublicos: () => ler().filter((r) => r.tipo === 'aviso' && r.estado === 'publicado').sort((a, b) => b.em - a.em)
        .map((r) => ({ id: r.id, titulo: r.titulo, texto: r.texto, bairroId: r.bairroId, t: r.em })),

      // ---- acompanhar (pessoal: cada usuário acompanha as suas) ----
      acompanhamento: (oid, uid) => ler().find((r) => r.tipo === 'acompanhamento' && r.ocorrenciaId === oid && r.estado === 'ativo' && r.de.usuarioId === uid) || null,
      // Liga ou desliga. Devolve o registro (o de antes, ao desligar).
      acompanhar(o, de = {}) {
        if (!o || !de.usuarioId) return falha('usuario');
        const atual = api.acompanhamento(o.id, de.usuarioId);
        if (atual) {
          return mudar(atual.id, (r) => { r.estado = 'encerrado'; passo(r, 'deixou', { quem: de.quem }); return null; }, 'deixou');
        }
        if (o.status === 'resolvida') return falha('ocorrencia');
        lista = ler();
        const t = agora();
        const r = { id: `ap-acompanhamento-${o.id}-${de.usuarioId}-${t}`, tipo: 'acompanhamento', ocorrenciaId: o.id, area: o.area, retrato: { titulo: o.titulo, bairroId: o.bairroId, severidade: o.severidade }, de: { usuarioId: de.usuarioId, quem: de.quem || '' }, em: t, estado: 'ativo', passos: [] };
        lista.push(r);
        A.gravar(chave, lista);
        emitir('novo', r);
        return { ok: true, registro: r };
      },
      // Quem acompanha a ocorrência (inclusive quem acabou de ter o acompanhamento encerrado pela resolução).
      quemAcompanha(oid, t = agora()) {
        return ler().filter((r) => r.tipo === 'acompanhamento' && r.ocorrenciaId === oid
          && (r.estado === 'ativo' || (r.passos.length && r.passos[r.passos.length - 1].tipo === 'encerrada' && t - r.passos[r.passos.length - 1].em < 10000)))
          .map((r) => r.de.usuarioId);
      },

      // ---- reconhecer a equipe ----
      // Com equipe em campo ou depois de resolvida; um por ocorrência.
      reconhecer(o, mensagem, de = {}) {
        if (!o || (o.status !== 'em_campo' && o.status !== 'resolvida') || o.falsoAlarme || o.duplicadaDe) return falha('ocorrencia');
        if (!texto(mensagem)) return falha('texto');
        if (ler().some((r) => r.tipo === 'reconhecimento' && r.ocorrenciaId === o.id)) return falha('ja_existe');
        return criar(o, 'reconhecimento', de, () => ({ texto: texto(mensagem), equipeId: o.equipeId || null, estado: 'enviado' }), { aceitaResolvida: true });
      },
      // Os reconhecimentos de uma pasta num período (pauta da reunião de resultados).
      reconhecimentos: (area, desde = 0) => ler().filter((r) => r.tipo === 'reconhecimento' && (!area || r.area === area) && r.em >= desde),

      // ---- agendar visita ou conversa ----
      // pedido: { forma: 'visita' | 'conversa', quando: timestamp, texto }.
      agendar(o, pedido = {}, de = {}) {
        if (!GC.FORMAS_AGENDA[pedido.forma]) return falha('forma');
        const q = Number(pedido.quando);
        if (!(q > agora())) return falha('quando');
        return criar(o, 'agenda', de, () => ({ forma: pedido.forma, quando: q, texto: texto(pedido.texto), estado: 'marcada' }));
      },
      concluirAgenda(id, nota = '', quem = 'Gabinete') {
        return mudar(id, (r) => {
          if (r.tipo !== 'agenda' || r.estado !== 'marcada') return falha('estado');
          r.estado = 'feita';
          passo(r, 'feita', { texto: texto(nota), quem });
          return null;
        }, 'feita');
      },
      cancelarAgenda(id, quem = 'Gabinete') {
        return mudar(id, (r) => {
          if (r.tipo !== 'agenda' || r.estado !== 'marcada') return falha('estado');
          r.estado = 'cancelada';
          passo(r, 'cancelada', { quem });
          return null;
        }, 'cancelada');
      },
      // Para a agenda do gabinete (GC.gestao.agenda): as marcadas que ainda vão acontecer.
      agendaDoGabinete: (t = agora()) => ler().filter((r) => r.tipo === 'agenda' && r.estado === 'marcada' && r.quando >= t - 2 * 60 * MIN)
        .map((r) => ({ tipo: r.forma === 'visita' ? 'visita' : 'reuniao', titulo: `${GC.FORMAS_AGENDA[r.forma]}: ${r.retrato.titulo}`, quando: r.quando, local: r.forma === 'visita' ? nomeBairro(r.retrato.bairroId) : nomeSec(r.area), alvo: r.ocorrenciaId })),

      // A ocorrência foi resolvida (ou juntada, ou devolvida): delegação, adiamento, aviso e órgão de fora perdem o
      // sentido. Continuam: o pedido de explicação (a secretaria ainda deve a resposta) e a visita ou conversa marcada.
      fecharDaOcorrencia(oid) {
        lista = ler();
        const t = agora();
        const ESTADO_FIM = { delegacao: 'encerrada', adiamento: 'retomado', aviso: 'retirado', orgao: 'encerrado', acompanhamento: 'encerrado' };
        const abertas = lista.filter((r) => r.ocorrenciaId === oid && ESTADO_FIM[r.tipo] && ativa(r, t));
        if (!abertas.length) return 0;
        abertas.forEach((r) => {
          r.estado = ESTADO_FIM[r.tipo];
          r.passos.push({ tipo: 'encerrada', em: t, quem: 'Sistema' });
        });
        A.gravar(chave, lista);
        abertas.forEach((r) => emitir('encerrada', r));
        return abertas.length;
      },

      // Alguém está cuidando (a ocorrência sai do alarme e desce em "Precisam de você"): delegada, adiada até
      // a hora marcada, ou explicação pedida e ainda no prazo (vencida volta a pedir atenção).
      tratando(o, t = agora()) {
        if (!o) return false;
        return ler().some((r) => r.ocorrenciaId === o.id && TRATAM.includes(r.tipo) && ativa(r, t) && !vencidaEm(r, t));
      },

      // A linha de situação que vale para a ocorrência, nesta ordem (acompanhar e reconhecer não entram).
      situacao(oid, t = agora()) {
        const regs = ler().filter((r) => r.ocorrenciaId === oid && ativa(r, t));
        const r = ['adiamento', 'orgao', 'explicacao', 'agenda', 'delegacao', 'aviso'].map((tp) => regs.find((x) => x.tipo === tp)).find(Boolean);
        return r ? GC.resumoAcaoPrefeito(r, t) : '';
      },

      // Grupos da aba Cobranças para quem vê, e quantos esperam essa pessoa.
      // perfil: { id: 'prefeito' } ou { id: 'setor', area }; usuario: quem vê (delegações endereçadas a ele).
      grupos(perfil = { id: 'prefeito' }, usuario = null, t = agora()) {
        lista = ler();
        const eu = usuario && usuario.id;
        const recentes = (r) => !ativa(r, t) && t - (r.passos.length ? r.passos[r.passos.length - 1].em : r.em) < 24 * 60 * MIN;
        const porPrazo = (a, b) => (a.prazoRespostaEm || a.em) - (b.prazoRespostaEm || b.em);
        const paraMim = lista.filter((r) => r.tipo === 'delegacao' && r.estado === 'ativa' && eu && r.para === eu);
        let grupos;
        if (GC.visaoDe(perfil) === 'pasta') {
          const diretor = !!usuario && GC.nivelDe(usuario) === 'unidade';
          const daPasta = lista.filter((r) => r.area === perfil.area);
          const delegadaAoDiretor = (r) => !diretor || (GC.storeAtual && (GC.storeAtual.buscar(r.ocorrenciaId) || {}).delegadoA === eu);
          const EM_CURSO = ['adiamento', 'orgao', 'agenda', 'aviso'];
          grupos = [
            { id: 'explicar', titulo: 'Explicações que o prefeito pediu', itens: daPasta.filter((r) => r.tipo === 'explicacao' && r.estado === 'aberta' && delegadaAoDiretor(r)).sort(porPrazo), conta: true },
            { id: 'delegadas', titulo: 'Delegadas a você pelo prefeito', itens: paraMim, conta: true },
            { id: 'andamento', titulo: 'Decisões do prefeito em curso na pasta', itens: daPasta.filter((r) => ((r.tipo === 'explicacao' && r.estado === 'respondida') || EM_CURSO.includes(r.tipo)) && ativa(r, t)) },
            { id: 'reconhecimentos', titulo: 'Reconhecimentos do prefeito (7 dias)', itens: daPasta.filter((r) => r.tipo === 'reconhecimento' && t - r.em < 7 * DIA).sort((a, b) => b.em - a.em) },
            { id: 'recentes', titulo: 'Encerradas nas últimas 24 h', itens: daPasta.filter((r) => !['adiamento', 'reconhecimento', 'acompanhamento'].includes(r.tipo) && recentes(r)) },
            { id: 'acompanhando', titulo: 'Você acompanha', itens: lista.filter((r) => r.tipo === 'acompanhamento' && r.estado === 'ativo' && eu && r.de.usuarioId === eu) },
          ];
        } else {
          const meus = (r) => r.tipo === 'acompanhamento' && r.estado === 'ativo' && eu && r.de.usuarioId === eu;
          grupos = [
            { id: 'ler', titulo: 'Explicações para ler', itens: lista.filter((r) => r.tipo === 'explicacao' && r.estado === 'respondida'), conta: true },
            { id: 'delegadas', titulo: 'Delegadas a você', itens: paraMim, conta: true },
            { id: 'sem_resposta', titulo: 'Sem resposta no prazo (secretarias e órgãos de fora)', itens: lista.filter((r) => vencidaEm(r, t)).sort(porPrazo), conta: true },
            { id: 'andamento', titulo: 'Decisões em curso', itens: lista.filter((r) => ativa(r, t) && r.tipo !== 'acompanhamento' && !vencidaEm(r, t) && !(r.tipo === 'explicacao' && r.estado === 'respondida') && !paraMim.includes(r)).sort((a, b) => b.em - a.em) },
            { id: 'acompanhando', titulo: 'Você acompanha', itens: lista.filter(meus).sort((a, b) => b.em - a.em) },
          ];
        }
        return { grupos, pendentes: grupos.filter((g) => g.conta).reduce((s, g) => s + g.itens.length, 0) };
      },

      recarregar() { lista = ler(); emitir('recarga', null); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
    return api;
  };

  // Instância do navegador, por cidade.
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.acoesPrefeito.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_ACOES_PREFEITO = chave;
    const cache = { bruto: undefined, valor: null };
    GC.acoesPrefeito = GC.criarAcoesPrefeito({
      chave,
      armazenamento: {
        // Lido a cada desenho (tratada, situação): só reinterpreta quando o texto guardado mudou.
        ler(k) {
          try {
            const bruto = window.localStorage.getItem(k);
            if (bruto !== cache.bruto) { cache.bruto = bruto; cache.valor = JSON.parse(bruto); }
            return cache.valor;
          } catch (e) { return null; }
        },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  } else GC.acoesPrefeito = GC.criarAcoesPrefeito();
})(window.GC = window.GC || {});
