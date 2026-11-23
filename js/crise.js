(function (GC) {
  // Plural pelo número (tom-de-voz.md): "1 rota atrasada", "3 rotas atrasadas", nunca "rota(s)".
  const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  // Gabinete de crise: quando o prefeito convoca o gabinete (numa ocorrência que envolve várias
  // secretarias) ou abre um gabinete preventivo a partir da previsão de chuva, nasce uma sala com
  // tarefas por secretaria (com prazo, "Cobrar" e "Avançar"), o registro da crise em ordem
  // cronológica e o comunicado à população. Só lógica: a tela fica em tela-crise.js.
  GC.agora = GC.agora || (() => Date.now());
  GC.TAREFA_STATUS = ['a_fazer', 'em_andamento', 'concluida'];
  const TEXTO_STATUS = { em_andamento: 'iniciou', concluida: 'concluiu' };
  const MORADORES_POR_FAMILIA = 3.2;

  // O que vem pronto em cada tipo de crise (tarefas por secretaria, questões, orientação do comunicado)
  // mora nos modelos editáveis de js/modelos-crise.js (GC.modelosCrise). O gabinete copia o modelo ao abrir.
  const registroModelos = () => GC.modelosCrise || (GC.modelosCrise = GC.criarModelosCrise());
  const modeloDe = (tipo, modeloId) => (modeloId && registroModelos().buscar(modeloId)) || registroModelos().doTipo(tipo);
  // Gabinetes salvos antes dos modelos não têm a orientação copiada: vale a do modelo de fábrica do grupo.
  const daFabricaDoGrupo = (grupo) => (GC.MODELOS_CRISE_FABRICA || []).find((m) => m.grupo === grupo) || {};
  const orientacaoDe = (g) => g.orientacao || daFabricaDoGrupo(g.grupo).orientacao || '';
  const orientacaoCurtaDe = (g) => g.orientacaoCurta || daFabricaDoGrupo(g.grupo).orientacaoCurta || '';

  // publico: canais com o mesmo público alcançam as mesmas pessoas (SMS e WhatsApp chegam aos
  // moradores da área); no alcance total conta só o maior de cada público, sem somar gente repetida.
  GC.CANAIS_COMUNICADO = [
    { id: 'sms', nome: 'SMS Defesa Civil (40199)', publico: 'moradores', alcance: (g) => g.moradores },
    { id: 'whatsapp', nome: 'WhatsApp da Prefeitura', publico: 'moradores', alcance: (g) => Math.round(g.moradores * 0.6) },
    { id: 'redes', nome: 'Redes sociais e site', publico: 'redes', alcance: () => 18000 },
    { id: 'radio', nome: 'Rádios locais', publico: 'radio', alcance: () => 25000 },
  ];
  // Quantas mensagens um SMS vira: 160 caracteres (153 por parte) no alfabeto GSM; com acento fora
  // dele (á, ã, ç, õ...), o SMS vai em Unicode: 70 caracteres (67 por parte).
  const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM7_EXT = '^{}\\[~]|€';
  GC.partesSms = function (texto) {
    const t = String(texto || '');
    if (!t) return 0;
    const chars = [...t];
    if (chars.every((c) => GSM7.includes(c) || GSM7_EXT.includes(c))) {
      const n = chars.reduce((s, c) => s + (GSM7_EXT.includes(c) ? 2 : 1), 0);
      return n <= 160 ? 1 : Math.ceil(n / 153);
    }
    return chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
  };

  GC.alcanceComunicado = function (g, ids) {
    const maior = {};
    GC.CANAIS_COMUNICADO.filter((c) => (ids || []).includes(c.id)).forEach((c) => {
      maior[c.publico] = Math.max(maior[c.publico] || 0, c.alcance(g));
    });
    return Object.values(maior).reduce((s, n) => s + n, 0);
  };

  const bairroNome = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const secretaria = (area) => (GC.data.areas.find((a) => a.id === area) || { secretaria: { nome: 'Secretaria', emoji: '🏛' } }).secretaria;
  const preencher = (texto, b, l) => texto.replace(/\{b\}/g, b).replace(/\{l\}/g, l);
  const unicos = (lista) => [...new Set(lista)];

  // Secretarias que um gabinete aciona: as da origem + as que o modelo chama sempre (só as que existem).
  // A tela de listagem usa para dizer, antes de abrir, quem será notificado.
  GC.areasDoGabinete = function (tipo, areasBase, modeloId) {
    const m = modeloDe(tipo, modeloId);
    const sempre = ((m && m.tarefas) || []).filter((t) => t.sempre !== false).map((t) => t.area);
    return unicos([...(areasBase || []), ...sempre]).filter((a) => GC.data.areas.some((x) => x.id === a));
  };

  // O que o modelo põe na sala, já com bairro e local preenchidos: cada secretaria chamada recebe as
  // tarefas dela no modelo (ou a tarefa padrão, se a pasta está na ocorrência e o modelo não prevê nada
  // para ela). É o que a tela mostra para revisar antes de convocar; o que voltar editado vira o plano.
  GC.planoGabinete = function ({ tipo, areasBase, bairroId, local, modeloId } = {}) {
    const m = modeloDe(tipo, modeloId);
    const areas = GC.areasDoGabinete(tipo, areasBase, m && m.id);
    const b = bairroNome(bairroId);
    const l = local || b;
    const padrao = GC.TAREFA_PADRAO_CRISE || { texto: 'Plano de ação da pasta para {l} em {b}', prazoMin: 120 };
    const tarefas = [];
    areas.forEach((area) => {
      const doModelo = ((m && m.tarefas) || []).filter((t) => t.area === area);
      (doModelo.length ? doModelo : [padrao]).forEach((t) => tarefas.push({ area, texto: preencher(t.texto, b, l), prazoMin: t.prazoMin }));
    });
    return { modeloId: m ? m.id : null, modeloNome: m ? m.nome : '', areas, tarefas, perguntas: ((m && m.perguntas) || []).slice() };
  };

  // O local de uma ocorrência sem o começo do título ("Alagamento na Rua XV" → "Rua XV").
  GC.localDaOcorrencia = (o) => o.titulo.replace(/^[A-ZÁÉÍÓÚ][^ ]* (na|no|em|da|do|de|próximo à) /i, '') || o.titulo;

  // Versão curta para SMS: sem acentos (o SMS fica no alfabeto GSM, 160 caracteres) e numa mensagem só.
  const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[·–—]/g, '-').replace(/[“”]/g, '"');
  // partes: a primeira é obrigatória; as outras saem do fim até o texto caber numa mensagem.
  function caberSms(partes) {
    const lista = partes.filter(Boolean).map(semAcento);
    while (lista.length > 1 && GC.partesSms(lista.join(' ')) > 1) lista.pop();
    let texto = lista.join(' ');
    while (GC.partesSms(texto) > 1) texto = `${texto.slice(0, -4).trim()}...`;
    return texto;
  }

  GC.FASES_COMUNICADO = [
    { id: 'alerta', nome: 'Alerta' },
    { id: 'atualizacao', nome: 'Atualização' },
    { id: 'normalizacao', nome: 'Normalização' },
  ];
  const STATUS_FIM = ['concluida', 'cancelada'];
  const DISPENSA_MIN = 6 * 60; // uma decisão dispensada volta a aparecer depois de 6 h

  // opcoes.armazenamento (opcional): { ler() → objeto salvo | null, gravar(objeto) }. Sem ele, só memória.
  GC.criarGabinetes = function (opcoes = {}) {
    const lista = [];
    let dispensas = [];
    let seq = 0;
    const arm = opcoes.armazenamento || null;

    // Salva tudo a cada mudança: recarregar a página não apaga a sala, o registro nem os comunicados.
    function persistir() {
      if (!arm) return;
      try { arm.gravar({ versao: 1, seq, gabinetes: lista, dispensas }); } catch (e) { /* sem espaço ou bloqueado: segue em memória */ }
    }
    if (arm) {
      try {
        const salvo = arm.ler();
        if (salvo && salvo.versao === 1 && Array.isArray(salvo.gabinetes)) {
          lista.push(...salvo.gabinetes);
          dispensas = Array.isArray(salvo.dispensas) ? salvo.dispensas : [];
          seq = Math.max(Number(salvo.seq) || 0, lista.length);
        }
      } catch (e) { /* salvo corrompido: começa vazio */ }
    }

    const buscar = (id) => lista.find((g) => g.id === id) || null;
    const registrar = (g, texto, quem = 'Gabinete do Prefeito') => g.registro.push({ t: GC.agora(), quem, texto });
    const aberta = (gid) => { const g = buscar(gid); return g && !g.encerradoEm ? g : null; };
    const tempo = (min) => (GC.tempoTexto ? GC.tempoTexto(min) : `${min} min`);

    // Plano revisado na tela antes de convocar (tarefas e questões mudadas): vale para a próxima abertura
    // da mesma ocorrência ou área de risco, por 10 min (convocar passa pela janela de confirmação).
    let preparado = null;
    function preparar(chave, plano) {
      preparado = chave && plano ? { chave, plano, t: GC.agora() } : null;
      return !!preparado;
    }
    function tomarPreparado(chave) {
      const p = preparado && preparado.chave === chave && GC.agora() - preparado.t < 10 * 60000 ? preparado.plano : null;
      if (preparado && preparado.chave === chave) preparado = null;
      return p;
    }

    // Plano editado: só o que é válido (secretaria que existe, texto, prazo > 0). Sem nenhuma tarefa
    // válida, fica o do modelo.
    function limparPlano(plano, base) {
      if (!plano) return base;
      const L = GC.LIMITES_MODELO_CRISE || { texto: 160, perguntas: 10, tarefas: 15 };
      const tarefas = (plano.tarefas || []).map((t) => ({ area: t.area, texto: String(t.texto || '').trim().slice(0, L.texto), prazoMin: Math.round(Number(t.prazoMin)) }))
        .filter((t) => t.texto && t.prazoMin > 0 && GC.data.areas.some((a) => a.id === t.area)).slice(0, L.tarefas + 10);
      const perguntas = Array.isArray(plano.perguntas)
        ? [...new Set(plano.perguntas.map((q) => String(q || '').trim().slice(0, L.texto)).filter(Boolean))].slice(0, L.perguntas + 10)
        : base.perguntas;
      return Object.assign({}, base, { tarefas: tarefas.length ? tarefas : base.tarefas, perguntas, editado: true });
    }

    function montar({ id, origem, ocorrenciaId, titulo, tipo, bairroId, local, areasBase, moradores, areaRiscoId, plano, modeloId }) {
      const modelo = modeloDe(tipo, (plano && plano.modeloId) || modeloId);
      const base = GC.planoGabinete({ tipo, areasBase, bairroId, local, modeloId: modelo && modelo.id });
      const p = limparPlano(plano, base);
      const agora = GC.agora();
      const tarefas = p.tarefas.map((t, i) => ({ id: `t${i + 1}`, area: t.area, texto: t.texto, prazoMin: t.prazoMin, status: 'a_fazer', criadaEm: agora, cobrancas: 0, concluidaEm: null }));
      const areas = unicos(tarefas.map((t) => t.area));
      const perguntas = p.perguntas.map((texto, i) => ({ id: `q${i + 1}`, texto, resposta: null, respondidaEm: null, quem: null }));
      const g = {
        id, origem, ocorrenciaId: ocorrenciaId || null, areaRiscoId: areaRiscoId || null, titulo, tipo,
        grupo: (modelo && modelo.grupo) || 'geral', modeloId: modelo ? modelo.id : null, modeloNome: modelo ? modelo.nome : '',
        orientacao: (modelo && modelo.orientacao) || '', orientacaoCurta: (modelo && modelo.orientacaoCurta) || '',
        // Como o painel fica durante esta crise (js/modo-crise.js): copiado ao abrir, como as questões.
        painel: GC.painelDoModelo ? GC.painelDoModelo(modelo) : { camadas: [], widgets: [] },
        bairroId, local, areas, moradores: Math.round(moradores || 0), abertoEm: agora, encerradoEm: null, motivoEncerramento: null,
        tarefas, perguntas, registro: [], comunicados: [],
        // Portal do servidor (fase 2): quem foi chamado para a sala, os pedidos de pessoa e as dúvidas da equipe.
        membros: [], pedidosMembro: [], duvidas: [],
      };
      registrar(g, origem === 'previsao'
        ? `Gabinete preventivo aberto a partir da previsão de chuva para ${local}`
        : `Gabinete de crise convocado para "${titulo}"`);
      if (modelo) registrar(g, `Modelo "${modelo.nome}"${p.editado ? ', ajustado antes de abrir' : ''}: ${plural(tarefas.length, 'demanda', 'demandas')} e ${plural(perguntas.length, 'questão', 'questões')} a responder`);
      registrar(g, `${areas.length} secretarias notificadas com demandas e prazos: ${areas.map((a) => secretaria(a).nome).join(', ')}`);
      lista.push(g);
      persistir();
      return g;
    }

    // A partir de uma ocorrência (normalmente a que pediu "Gabinete de crise"). Uma sala por ocorrência.
    // plano (opcional): o que a tela revisou; sem ele, o preparado para esta ocorrência ou o modelo do tipo.
    function abrirDeOcorrencia(o, plano) {
      if (!o) return null;
      const existente = lista.find((g) => g.ocorrenciaId === o.id && !g.encerradoEm);
      if (existente) return existente;
      return montar({
        id: `g-${o.id}-${++seq}`, origem: 'ocorrencia', ocorrenciaId: o.id, titulo: o.titulo, tipo: o.tipo, bairroId: o.bairroId,
        local: GC.localDaOcorrencia(o),
        areasBase: o.areasEnvolvidas || [o.area], moradores: o.afetados,
        plano: plano || tomarPreparado(`oc:${o.id}`),
      });
    }

    // Preventivo: uma área de risco avaliada por GC.risco (antes de a chuva chegar).
    function abrirPreventivo(a, plano) {
      if (!a) return null;
      const existente = lista.find((g) => g.areaRiscoId === a.id && !g.encerradoEm);
      if (existente) return existente;
      return montar({
        id: `g-risco-${a.id}-${++seq}`, origem: 'previsao', areaRiscoId: a.id, titulo: `Risco de ${a.tipo}: ${a.nome}`, tipo: a.tipo,
        bairroId: a.bairroId, local: a.nome, areasBase: ['defesa_civil'], moradores: a.familias * MORADORES_POR_FAMILIA,
        plano: plano || tomarPreparado(`prev:${a.id}`),
      });
    }

    // quem (opcional): a pessoa que avançou (o servidor, no portal dele); sem ela, assina a secretaria.
    function avancarTarefa(gid, tid, quem) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      if (!t || STATUS_FIM.includes(t.status)) return false;
      t.status = GC.TAREFA_STATUS[GC.TAREFA_STATUS.indexOf(t.status) + 1];
      if (t.status === 'concluida') { t.concluidaEm = GC.agora(); t.respostaPendente = false; } // concluir responde a cobrança
      registrar(g, `${TEXTO_STATUS[t.status]}: ${t.texto}`, quem && quem.nome ? assinatura(quem) : secretaria(t.area).nome);
      persistir();
      return true;
    }

    function cobrarTarefa(gid, tid) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      if (!t || STATUS_FIM.includes(t.status)) return false;
      t.cobrancas++;
      // A secretaria responde (não há resposta automática): a tarefa fica "aguardando resposta" até ela responder.
      t.respostaPendente = true;
      t.cobradaEm = GC.agora();
      registrar(g, `Prefeito cobrou a ${secretaria(t.area).nome}: ${t.texto}`);
      persistir();
      return true;
    }

    // Resposta da secretaria à cobrança da tarefa (texto obrigatório: o que está sendo feito e quando fica pronto).
    function responderCobranca(gid, tid, texto, quem) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      const limpo = String(texto || '').trim();
      if (!t || !t.respostaPendente || !limpo) return false;
      t.respostaPendente = false;
      t.respostas = (t.respostas || []).concat({ t: GC.agora(), texto: limpo, quem: quem || secretaria(t.area).nome });
      registrar(g, `Resposta à cobrança (${t.texto}): ${limpo}`, quem ? `${quem} · ${secretaria(t.area).nome}` : secretaria(t.area).nome);
      persistir();
      return true;
    }

    // Questões da sala (vêm do modelo; a sala pode pôr outras ou tirar). A resposta vai ao registro;
    // responder de novo troca a resposta (a anterior fica no registro).
    const pergunta = (g, qid) => (g && (g.perguntas || []).find((q) => q.id === qid)) || null;
    function responderPergunta(gid, qid, texto, quem) {
      const g = aberta(gid);
      const q = pergunta(g, qid);
      const limpo = String(texto || '').trim().slice(0, 300);
      if (!q || !limpo || limpo === q.resposta) return false;
      q.resposta = limpo;
      q.respondidaEm = GC.agora();
      q.quem = quem || null;
      registrar(g, `${q.texto} → ${limpo}`, quem || 'Gabinete do Prefeito');
      persistir();
      return true;
    }
    // para (opcional): a quem a questão é apontada, { area } (uma secretaria da sala) ou { usuarioId, nome } (um
    // membro da sala). Sem ele, é da sala inteira, como antes.
    function adicionarPergunta(gid, texto, para) {
      const g = aberta(gid);
      const limpo = String(texto || '').trim().slice(0, 160);
      if (!g || !limpo) return null;
      g.perguntas = g.perguntas || [];
      if (g.perguntas.some((q) => q.texto.toLowerCase() === limpo.toLowerCase())) return null;
      const n = g.perguntas.reduce((m, q) => Math.max(m, Number(String(q.id).slice(1)) || 0), 0) + 1;
      const destino = paraValido(g, para);
      const q = Object.assign({ id: `q${n}`, texto: limpo, resposta: null, respondidaEm: null, quem: null, avulsa: true }, destino ? { para: destino } : {});
      g.perguntas.push(q);
      registrar(g, `Nova questão para ${destino ? nomePara(destino) : 'a sala'}: ${limpo}`);
      persistir();
      return q;
    }
    function removerPergunta(gid, qid) {
      const g = aberta(gid);
      const q = pergunta(g, qid);
      if (!q) return false;
      g.perguntas = g.perguntas.filter((x) => x !== q);
      registrar(g, `Questão retirada da sala: ${q.texto}`);
      persistir();
      return true;
    }

    // ---------- Equipe da sala (portal do servidor, fase 2) ----------
    // O secretário da pasta chama servidores da pasta para a sala (g.membros); a sala só pede "mais alguém da pasta"
    // (g.pedidosMembro), que cai na caixa do secretário. A demanda da sala pode ir a um membro da pasta dela
    // (t.responsavelId), a questão pode ser apontada a uma pasta ou a um membro (q.para) e a equipe manda
    // atualizações (no registro, tipo 'atualizacao') e dúvidas (g.duvidas), que quem gere a sala responde.
    // quem: { id, nome, area } de quem age; usuario: { id, nome, area } do servidor.
    const doGabinete = (g) => { g.membros = g.membros || []; g.pedidosMembro = g.pedidosMembro || []; g.duvidas = g.duvidas || []; return g; };
    const membroAtivo = (g, uid) => (g && uid ? (g.membros || []).find((m) => m.usuarioId === uid && !m.saiuEm) || null : null);
    const nomeQuem = (quem) => (quem && quem.nome) || 'Gabinete do Prefeito';
    const assinatura = (quem) => (quem && quem.nome ? (quem.area ? `${quem.nome} · ${secretaria(quem.area).nome}` : quem.nome) : 'Gabinete do Prefeito');
    function paraValido(g, para) {
      if (!para) return null;
      if (para.usuarioId) { const m = membroAtivo(g, para.usuarioId); return m ? { usuarioId: m.usuarioId, nome: m.nome, area: m.area } : null; }
      if (para.area && (g.areas || []).includes(para.area)) return { area: para.area };
      return null;
    }
    const nomePara = (p) => (p.usuarioId ? p.nome : `a ${secretaria(p.area).nome}`);
    const proximoId = (lista, letra) => `${letra}${(lista || []).reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0) + 1}`;

    function chamarMembro(gid, usuario, quem) {
      const g = aberta(gid);
      if (!g || !usuario || !usuario.id || !GC.data.areas.some((a) => a.id === usuario.area)) return null;
      doGabinete(g);
      if (membroAtivo(g, usuario.id)) return null;
      const m = { usuarioId: usuario.id, nome: usuario.nome || '', cargo: usuario.cargo || '', area: usuario.area, chamadoPor: nomeQuem(quem), chamadoEm: GC.agora(), saiuEm: null, vistoEm: null };
      g.membros.push(m);
      if (!g.areas.includes(usuario.area)) g.areas.push(usuario.area);
      // Chamar atende o pedido de pessoa daquela pasta que estava aberto (o mais antigo).
      const pedido = g.pedidosMembro.find((p) => p.area === usuario.area && !p.atendidoEm);
      if (pedido) Object.assign(pedido, { atendidoEm: GC.agora(), atendidoPor: nomeQuem(quem), usuarioId: usuario.id });
      registrar(g, `${m.nome}${m.cargo ? ` (${m.cargo})` : ''} foi chamado(a) para a sala`, assinatura(quem));
      persistir();
      return m;
    }
    function dispensarMembro(gid, usuarioId, quem) {
      const g = aberta(gid);
      const m = membroAtivo(g, usuarioId);
      if (!m) return false;
      m.saiuEm = GC.agora();
      // O que estava com ele volta à secretaria.
      g.tarefas.forEach((t) => { if (t.responsavelId === usuarioId && !STATUS_FIM.includes(t.status)) t.responsavelId = null; });
      registrar(g, `${m.nome} saiu da sala`, assinatura(quem));
      persistir();
      return true;
    }
    // A sala pede alguém da pasta (o secretário escolhe quem). Um pedido aberto por pasta.
    function pedirMembro(gid, area, motivo, quem) {
      const g = aberta(gid);
      const limpo = String(motivo || '').trim().slice(0, 200);
      if (!g || !GC.data.areas.some((a) => a.id === area) || !limpo) return null;
      doGabinete(g);
      if (g.pedidosMembro.some((p) => p.area === area && !p.atendidoEm)) return null;
      const p = { id: proximoId(g.pedidosMembro, 'p'), area, motivo: limpo, t: GC.agora(), pedidoPor: nomeQuem(quem), atendidoEm: null, atendidoPor: null };
      g.pedidosMembro.push(p);
      if (!g.areas.includes(area)) g.areas.push(area);
      registrar(g, `A sala pediu alguém da ${secretaria(area).nome}: ${limpo}`, assinatura(quem));
      persistir();
      return p;
    }
    // A demanda da sala vai a um membro da pasta dela (ou volta à secretaria, com usuarioId null).
    function passarDemandaSala(gid, tid, usuarioId, quem) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      if (!t || STATUS_FIM.includes(t.status)) return false;
      if (usuarioId) {
        const m = membroAtivo(g, usuarioId);
        if (!m || m.area !== t.area || t.responsavelId === usuarioId) return false;
        t.responsavelId = usuarioId;
        registrar(g, `Demanda passada a ${m.nome}: ${t.texto}`, assinatura(quem));
      } else {
        if (!t.responsavelId) return false;
        t.responsavelId = null;
        registrar(g, `Demanda voltou à ${secretaria(t.area).nome}: ${t.texto}`, assinatura(quem));
      }
      persistir();
      return true;
    }
    // Notícia da equipe: entra no registro com o nome de quem mandou.
    function enviarAtualizacao(gid, texto, quem) {
      const g = aberta(gid);
      const limpo = String(texto || '').trim().slice(0, 300);
      if (!g || !limpo) return null;
      const r = { t: GC.agora(), quem: assinatura(quem), texto: limpo, tipo: 'atualizacao' };
      g.registro.push(r);
      persistir();
      return r;
    }
    // Dúvida da equipe para a sala (quem gere responde). Vai ao registro também.
    function perguntarASala(gid, texto, quem) {
      const g = aberta(gid);
      const limpo = String(texto || '').trim().slice(0, 300);
      if (!g || !limpo) return null;
      doGabinete(g);
      const d = { id: proximoId(g.duvidas, 'd'), texto: limpo, t: GC.agora(), usuarioId: (quem && quem.id) || null, quem: nomeQuem(quem), area: (quem && quem.area) || null, resposta: null, respondidaEm: null, respondidaPor: null };
      g.duvidas.push(d);
      registrar(g, `Dúvida para a sala: ${limpo}`, assinatura(quem));
      persistir();
      return d;
    }
    function responderDuvidaSala(gid, did, texto, quem) {
      const g = aberta(gid);
      const d = g && (g.duvidas || []).find((x) => x.id === did);
      const limpo = String(texto || '').trim().slice(0, 300);
      if (!d || d.resposta || !limpo) return false;
      Object.assign(d, { resposta: limpo, respondidaEm: GC.agora(), respondidaPor: nomeQuem(quem) });
      registrar(g, `Resposta à dúvida de ${d.quem} (${d.texto}): ${limpo}`, assinatura(quem));
      persistir();
      return true;
    }
    // O servidor abriu a sala: o chamado e as respostas até agora deixam de ser novidade na fila dele.
    function marcarVisto(gid, usuarioId) {
      const g = aberta(gid);
      const m = membroAtivo(g, usuarioId);
      if (!m) return false;
      m.vistoEm = GC.agora();
      persistir();
      return true;
    }

    // Outra aba gravou (evento storage): relê do armazenamento.
    function recarregar() {
      if (!arm) return;
      try {
        const salvo = arm.ler();
        if (salvo && salvo.versao === 1 && Array.isArray(salvo.gabinetes)) {
          lista.splice(0, lista.length, ...salvo.gabinetes);
          dispensas = Array.isArray(salvo.dispensas) ? salvo.dispensas : [];
          seq = Math.max(Number(salvo.seq) || 0, lista.length);
        }
      } catch (e) { /* salvo corrompido: segue com o que tem */ }
    }

    // Tarefa avulsa, criada na sala (a crise pediu algo que o modelo não previu).
    function adicionarTarefa(gid, { area, texto, prazoMin } = {}) {
      const g = aberta(gid);
      const limpo = String(texto || '').trim();
      const prazo = Math.round(Number(prazoMin));
      if (!g || !limpo || !GC.data.areas.some((a) => a.id === area) || !(prazo > 0)) return null;
      const n = g.tarefas.reduce((m, t) => Math.max(m, Number(String(t.id).slice(1)) || 0), 0) + 1;
      const t = { id: `t${n}`, area, texto: limpo, prazoMin: prazo, status: 'a_fazer', criadaEm: GC.agora(), cobrancas: 0, concluidaEm: null, avulsa: true };
      g.tarefas.push(t);
      if (!g.areas.includes(area)) g.areas.push(area);
      registrar(g, `Nova demanda para a ${secretaria(area).nome} (prazo de ${tempo(prazo)}): ${limpo}`);
      persistir();
      return t;
    }

    // Mais tempo para uma tarefa (a secretaria pediu, ou o cenário mudou). Fica no registro.
    function estenderPrazo(gid, tid, minutos) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      const m = Math.round(Number(minutos));
      if (!t || STATUS_FIM.includes(t.status) || !(m > 0)) return false;
      t.prazoMin += m;
      registrar(g, `Prazo estendido em ${tempo(m)} para a ${secretaria(t.area).nome}: ${t.texto}`);
      persistir();
      return true;
    }

    // Textos prontos para o prefeito revisar, por fase da crise: o completo (WhatsApp, redes, rádio)
    // e o curto para SMS (uma mensagem).
    function rascunho(gid, fase = 'alerta') {
      const g = buscar(gid);
      if (!g) return { texto: '', sms: '' };
      const cidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
      const bairro = bairroNome(g.bairroId);
      const prev = g.origem === 'previsao';
      const assunto = prev ? `o risco de ${g.tipo} em ${g.local}` : `${g.titulo.charAt(0).toLowerCase()}${g.titulo.slice(1)}`;
      const curto = prev ? `risco de ${g.tipo} em ${g.local}` : g.titulo;
      const ativas = g.tarefas.filter((t) => t.status !== 'cancelada');
      const feitas = ativas.filter((t) => t.status === 'concluida').length;
      const emergencias = 'Emergências: Defesa Civil 199 · Bombeiros 193 · SAMU 192.';
      if (fase === 'normalizacao') {
        return {
          texto: `A Prefeitura de ${cidade} informa que a situação sobre ${assunto} (${bairro}) está normalizada. Obrigada pela colaboração de todos. Em caso de emergência: Defesa Civil 199 · Bombeiros 193 · SAMU 192.`,
          sms: caberSms([`Prefeitura de ${cidade}: situacao normalizada em ${bairro}.`, 'Obrigada pela colaboracao.', 'Emergencia: 199.']),
        };
      }
      if (fase === 'atualizacao') {
        return {
          texto: `Atualização da Prefeitura de ${cidade} sobre ${assunto} (${bairro}): ${feitas} de ${ativas.length} ações concluídas e as equipes seguem em campo. ${orientacaoDe(g)} ${emergencias}`,
          sms: caberSms([`Prefeitura de ${cidade}: ${curto} - equipes em campo, ${feitas}/${ativas.length} acoes concluidas.`, orientacaoCurtaDe(g), 'Emergencia: 199.']),
        };
      }
      const abertura = prev
        ? `A Prefeitura de ${cidade} alerta para risco de ${g.tipo} em ${g.local} (${bairro}) nas próximas horas.`
        : `A Prefeitura de ${cidade} informa: ${assunto} (${bairro}).`;
      return {
        texto: `${abertura} ${g.areas.length} secretarias já estão em campo. ${orientacaoDe(g)} ${emergencias}`,
        sms: caberSms([`Prefeitura de ${cidade}: ${curto} (${bairro}).`, orientacaoCurtaDe(g), 'Emergencia: 199.']),
      };
    }
    const rascunhoComunicado = (gid) => rascunho(gid, 'alerta').texto;

    // textoSms (opcional): a versão curta que vai pelo SMS; os outros canais levam o texto completo.
    function publicarComunicado(gid, { texto, canais, textoSms, fase } = {}) {
      const g = aberta(gid);
      const escolhidos = GC.CANAIS_COMUNICADO.filter((c) => (canais || []).includes(c.id));
      if (!g || !String(texto || '').trim() || !escolhidos.length) return null;
      const sms = escolhidos.some((x) => x.id === 'sms') && String(textoSms || '').trim() ? String(textoSms).trim() : null;
      const c = { t: GC.agora(), texto: String(texto).trim(), textoSms: sms, fase: fase || null, canais: escolhidos.map((x) => x.id), alcance: GC.alcanceComunicado(g, escolhidos.map((x) => x.id)) };
      g.comunicados.push(c);
      registrar(g, `Comunicado publicado (${escolhidos.map((x) => x.nome).join(', ')}) · alcance estimado de ${c.alcance.toLocaleString('pt-BR')} pessoas`);
      persistir();
      return c;
    }

    // motivo (opcional) vai ao registro e ao balanço; cancelarPendentes marca o que sobrou como
    // "cancelada" (não fica "A fazer" para sempre numa sala fechada).
    function encerrar(gid, { motivo, cancelarPendentes } = {}) {
      const g = aberta(gid);
      if (!g) return false;
      const agora = GC.agora();
      g.encerradoEm = agora;
      g.motivoEncerramento = String(motivo || '').trim() || null;
      const pendentes = g.tarefas.filter((t) => !STATUS_FIM.includes(t.status));
      if (cancelarPendentes) pendentes.forEach((t) => { t.status = 'cancelada'; t.canceladaEm = agora; });
      const quando = pendentes.length
        ? `Gabinete encerrado com ${plural(pendentes.length, 'demanda', 'demandas')} em aberto${cancelarPendentes ? ' (canceladas)' : ''}`
        : 'Gabinete encerrado: todas as demandas concluídas';
      registrar(g, g.motivoEncerramento ? `${quando}. Motivo: ${g.motivoEncerramento}` : quando);
      persistir();
      return true;
    }

    // Balanço da sala: duração, tempo de resposta por secretaria, cobranças e comunicados.
    function balanco(g) {
      const fim = g.encerradoEm || GC.agora();
      const noPrazo = (t) => t.concluidaEm - t.criadaEm <= t.prazoMin * 60000;
      const porArea = g.areas.map((area) => {
        const ts = g.tarefas.filter((t) => t.area === area);
        const concluidas = ts.filter((t) => t.status === 'concluida');
        return {
          area, secretaria: secretaria(area), total: ts.length, concluidas: concluidas.length,
          canceladas: ts.filter((t) => t.status === 'cancelada').length,
          noPrazo: concluidas.filter(noPrazo).length,
          minutos: concluidas.length ? Math.round(concluidas.reduce((s, t) => s + (t.concluidaEm - t.criadaEm), 0) / concluidas.length / 60000) : null,
          cobrancas: ts.reduce((s, t) => s + t.cobrancas, 0),
        };
      }).filter((x) => x.total);
      const concluidas = g.tarefas.filter((t) => t.status === 'concluida');
      return {
        duracaoMin: Math.round((fim - g.abertoEm) / 60000),
        concluidas: concluidas.length,
        canceladas: g.tarefas.filter((t) => t.status === 'cancelada').length,
        total: g.tarefas.length,
        noPrazo: concluidas.filter(noPrazo).length,
        cobrancas: g.tarefas.reduce((s, t) => s + t.cobrancas, 0),
        comunicados: g.comunicados.length,
        alcance: g.comunicados.reduce((m, c) => Math.max(m, c.alcance), 0),
        motivo: g.motivoEncerramento || null,
        porArea,
      };
    }

    // Números e listas que a tela mostra. ocorrencia (opcional): a de origem, para somar a linha do tempo
    // dela e sugerir o encerramento quando ela é resolvida. areaRisco (opcional): a área do gabinete
    // preventivo, reavaliada; sem risco alto, sugere encerrar.
    function resumo(gid, ocorrencia, areaRisco) {
      const g = buscar(gid);
      if (!g) return null;
      // Encerrado, o relógio do gabinete para: prazos e atrasos ficam como estavam no encerramento.
      const agora = g.encerradoEm || GC.agora();
      const tarefas = g.tarefas.map((t) => Object.assign({}, t, {
        secretaria: secretaria(t.area),
        atrasada: !STATUS_FIM.includes(t.status) && agora - t.criadaEm > t.prazoMin * 60000,
        restanteMin: Math.round(t.prazoMin - (agora - t.criadaEm) / 60000),
      }));
      const validas = tarefas.filter((t) => t.status !== 'cancelada');
      const feitas = validas.filter((t) => t.status === 'concluida').length;
      const daOcorrencia = ocorrencia && ocorrencia.id === g.ocorrenciaId
        ? (ocorrencia.linhaTempo || []).map((x) => ({ t: x.t, quem: secretaria(ocorrencia.area).nome, texto: x.texto, ocorrencia: true }))
        : [];
      let sugestaoEncerrar = null;
      if (!g.encerradoEm) {
        if (ocorrencia && ocorrencia.id === g.ocorrenciaId && ocorrencia.status === 'resolvida') sugestaoEncerrar = 'A ocorrência de origem foi resolvida.';
        else if (areaRisco && areaRisco.id === g.areaRiscoId && areaRisco.nivel !== 'alto') sugestaoEncerrar = `A previsão baixou o risco de ${areaRisco.nome} para ${areaRisco.nivel === 'medio' ? 'médio' : areaRisco.nivel}.`;
        else if (validas.length && feitas === validas.length) sugestaoEncerrar = 'Todas as demandas foram concluídas.';
      }
      return {
        gabinete: g,
        bairro: bairroNome(g.bairroId),
        tarefas,
        feitas,
        total: validas.length,
        canceladas: tarefas.length - validas.length,
        pct: validas.length ? Math.round((feitas / validas.length) * 100) : 0,
        atrasadas: tarefas.filter((t) => t.atrasada).length,
        abertoHaMin: Math.round((agora - g.abertoEm) / 60000),
        // Mais recente primeiro; empate (mesmo instante) mantém a ordem em que aconteceu, invertida.
        registro: [...daOcorrencia, ...g.registro].map((x, i) => Object.assign({ i }, x)).sort((a, b) => b.t - a.t || b.i - a.i),
        perguntas: g.perguntas || [],
        respondidas: (g.perguntas || []).filter((q) => q.resposta).length,
        // Equipe da sala (portal do servidor): quem está nela, os pedidos de pessoa abertos e as dúvidas sem resposta.
        membros: (g.membros || []).filter((m) => !m.saiuEm),
        pedidosMembro: (g.pedidosMembro || []).filter((p) => !p.atendidoEm),
        duvidas: g.duvidas || [],
        duvidasAbertas: (g.duvidas || []).filter((d) => !d.resposta).length,
        ultimoComunicado: g.comunicados[g.comunicados.length - 1] || null,
        sugestaoEncerrar,
        balanco: g.encerradoEm ? balanco(g) : null,
      };
    }

    // Decisões dispensadas na listagem ("Defesa Civil já em campo"): somem por 6 h, com o motivo guardado.
    const vigentes = () => dispensas.filter((d) => GC.agora() - d.t < DISPENSA_MIN * 60000);
    function dispensar(chave, motivo) {
      if (!chave) return false;
      dispensas = dispensas.filter((d) => d.chave !== chave);
      dispensas.push({ chave, motivo: String(motivo || '').trim() || 'Sem motivo informado', t: GC.agora() });
      persistir();
      return true;
    }
    function reativar(chave) {
      const antes = dispensas.length;
      dispensas = dispensas.filter((d) => d.chave !== chave);
      if (dispensas.length === antes) return false;
      persistir();
      return true;
    }

    return {
      abrirDeOcorrencia,
      abrirPreventivo,
      preparar,
      responderPergunta,
      adicionarPergunta,
      removerPergunta,
      chamarMembro,
      dispensarMembro,
      pedirMembro,
      passarDemandaSala,
      enviarAtualizacao,
      perguntarASala,
      responderDuvidaSala,
      marcarVisto,
      membroAtivo: (gid, uid) => membroAtivo(buscar(gid), uid),
      avancarTarefa,
      cobrarTarefa,
      responderCobranca,
      recarregar,
      adicionarTarefa,
      estenderPrazo,
      rascunho,
      rascunhoComunicado,
      publicarComunicado,
      encerrar,
      resumo,
      buscar,
      dispensar,
      reativar,
      dispensas: vigentes,
      todos: () => lista.slice(),
      ativos: () => lista.filter((g) => !g.encerradoEm),
    };
  };
})(window.GC = window.GC || {});
