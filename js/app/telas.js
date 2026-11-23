(function (GC) {
  // Telas sobre o mapa esmaecido (Relatórios, Alertas, Dados, Secretarias, Secretaria, Gabinete de crise), a troca
  // entre elas (rotas) e os gabinetes de crise. O Painel é o próprio mapa.
  // Recebe o app (js/app.js: estado e ações compartilhadas, ligados na hora da chamada) e devolve o que o resto usa.
  GC.criarAppTelas = function (app) {
    const { $, corpo, store, areasPerfil, daPasta, nomeSecretaria } = app;
    const TELAS = { relatorios: $('tela-relatorios'), alertas: $('tela-alertas'), dados: $('tela-dados'), secretarias: $('tela-secretarias'), secretaria: $('tela-secretaria'), crise: $('tela-crise'), conta: $('tela-conta'), auditoria: $('tela-auditoria'), cobrancas: $('tela-cobrancas'), usuarios: $('tela-usuarios'), regras: $('tela-regras'), prazos: $('tela-prazos'), personalizar: $('tela-personalizar'), aviso: $('tela-aviso'), cruzamento: $('tela-cruzamento'), sazonal: $('tela-sazonal'), entregas: $('tela-entregas'), metas: $('tela-metas'), orcamento: $('tela-orcamento'), tarefas: $('tela-tarefas'), publicacoes: $('tela-publicacoes'), governanca: $('tela-governanca'), fontes: $('tela-fontes') };
    // Registro na auditoria (js/auditoria.js) em nome de quem usa o painel.
    const auditar = (acao, dados) => { if (GC.auditar) GC.auditar(acao, dados); };

    // ---- Gabinete de crise: nasce do botão "Gabinete de crise" de uma ocorrência ou da previsão de chuva ----
    // Salvos no navegador (por cidade): recarregar a página não apaga a sala, o registro nem os comunicados.
    const CHAVE_GABINETES = `gc.gabinetes.${GC.cidade ? GC.cidade.id : 'media'}`;
    const gabinetes = GC.criarGabinetes({
      armazenamento: {
        ler() { try { return JSON.parse(localStorage.getItem(CHAVE_GABINETES)); } catch (e) { return null; } },
        gravar(o) { try { localStorage.setItem(CHAVE_GABINETES, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
      },
    });
    // #/crise é sempre a listagem (é para lá que o menu leva, mesmo depois de sair olhando uma sala);
    // um gabinete só abre com o id na rota (#/crise/<id>). #/crise/novo e id que não existe: listagem.
    // Outra aba (o prefeito cobra, a secretaria responde): relê os gabinetes e redesenha.
    window.addEventListener('storage', (e) => { if (e.key === CHAVE_GABINETES) { gabinetes.recarregar(); app.render(); } });
    const gabineteDaPasta = (g) => !areasPerfil || g.areas.some((a) => areasPerfil.includes(a));
    function gabineteDaRota(rota) {
      if (!rota || !rota.id || rota.id === GC.CRISE_NOVO) return null;
      const g = gabinetes.buscar(rota.id);
      return g && gabineteDaPasta(g) ? g : null;
    }
    // Abas: os ativos e o que está aberto; sem gabinete aberto, a listagem mostra todos (com o resumo de cada sala).
    const estadoCrise = (rota) => {
      const g = gabineteDaRota(rota);
      const lista = (g ? gabinetes.todos().filter((x) => x.id === g.id || !x.encerradoEm) : gabinetes.todos()).filter(gabineteDaPasta);
      const risco = GC.risco.resumo(store.ocorrencias());
      const comSala = new Set(gabinetes.ativos().map((x) => x.ocorrenciaId).filter(Boolean));
      return {
        atual: g ? gabinetes.resumo(g.id, g.ocorrenciaId ? store.buscar(g.ocorrenciaId) : null, g.areaRiscoId ? risco.areas.find((a) => a.id === g.areaRiscoId) : null) : null,
        gabinetes: lista,
        salas: g ? [] : lista.map((x) => gabinetes.resumo(x.id)),
        risco,
        // Ocorrências que pedem gabinete e ainda não têm sala aberta (a sala sobrevive ao recarregar; a ocorrência, não).
        candidatas: store.ocorrencias().filter((o) => GC.acoesDisponiveis(o).includes('gabinete') && !comSala.has(o.id)),
        dispensas: gabinetes.dispensas(),
        // Ocorrências abertas com posição: o mini-mapa da sala desenha as que caem perto do gabinete.
        pontos: g ? store.ocorrencias().filter((o) => o.status !== 'resolvida' && Number.isFinite(o.lat) && Number.isFinite(o.lng))
          .map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, titulo: o.titulo, severidade: o.severidade })) : [],
        rascunhos: g ? Object.fromEntries(GC.FASES_COMUNICADO.map((f) => [f.id, gabinetes.rascunho(g.id, f.id)])) : null,
      };
    };
    const irParaGabinete = (g) => { if (g) app.rotas.ir({ tela: 'crise', id: g.id }); };
    const abrirPreventivo = (areaId) => {
      const g = gabinetes.abrirPreventivo(GC.risco.resumo(store.ocorrencias()).areas.find((a) => a.id === areaId));
      if (g) auditar('crise_abrir', { alvo: g.titulo, areaAlvo: g.areas[0], ref: { tipo: 'gabinete', id: g.id } });
      if (g && app.modoCrise) app.modoCrise.convocou(g); // quem abriu entra direto na vista da crise ao voltar ao mapa
      irParaGabinete(g);
    };
    const tituloGabinete = (gid) => (gabinetes.buscar(gid) || {}).titulo || '';
    const atualizarCrise = () => {
      if (tela === 'crise' && !app.rotas.atual().modelos) telaCrise.atualizar(estadoCrise(app.rotas.atual()));
      // A faixa do modo de crise acompanha a sala (demanda concluída, gabinete encerrado) sem esperar o render.
      if (app.modoCrise) app.modoCrise.atualizar();
    };

    // ---- Modelos de gabinete (#/crise/modelos; registro em js/modelos-crise.js) ----
    // Só o gestor geral muda (crise.modelos); cada mudança vai à auditoria e vira um "Desfazer".
    const modelos = () => GC.modelosCrise;
    const nomeModeloCrise = (id) => ((modelos().buscar(id) || {}).nome || id);
    function noModelo(acao, fazer, alvo) {
      if (!GC.pode('crise.modelos', null)) return { ok: false, motivo: 'sem_permissao' };
      return app.comDesfazer(() => {
        const r = fazer();
        if (r && r.ok) auditar(acao, { alvo: (r.modelo && r.modelo.nome) || alvo });
        return r;
      }, { rotulo: `${((GC.ACOES_AUDITORIA || {})[acao] || { nome: 'Mudou modelo de gabinete' }).nome}: ${alvo}` });
    }
    const telaModelos = GC.criarTelaModelosCrise ? GC.criarTelaModelosCrise($('tela-crise'), {
      ir: (rota) => app.rotas.ir(rota),
      aoSalvar: (id, dados) => noModelo('crise_modelo_salvar', () => modelos().salvar(id, dados), nomeModeloCrise(id)),
      aoCriar: (base, dados) => noModelo('crise_modelo_criar', () => modelos().criar(base, dados), dados.nome),
      aoExcluir: (id) => noModelo('crise_modelo_excluir', () => modelos().excluir(id), nomeModeloCrise(id)),
      aoRestaurar: (id) => noModelo('crise_modelo_restaurar', () => modelos().restaurar(id), nomeModeloCrise(id)),
    }) : null;
    window.addEventListener('storage', (e) => {
      if (e.key !== GC.CHAVE_MODELOS_CRISE) return;
      modelos().recarregar();
      if (tela === 'crise' && app.rotas.atual().modelos && telaModelos) telaModelos.mostrar(app.rotas.atual());
    });
    const tarefaDe = (gid, tid) => gabinetes.buscar(gid).tarefas.find((x) => x.id === tid);

    const telaCrise = GC.criarTelaCrise($('tela-crise'), {
      aoAbrirGabinete: (id) => app.rotas.ir({ tela: 'crise', id: id === GC.CRISE_NOVO ? null : id }),
      // plano (opcional): tarefas e questões revisadas na listagem antes de convocar (js/crise.js, preparar).
      aoConvocar: (id, plano) => { if (plano) gabinetes.preparar(`oc:${id}`, plano); app.agir(id, 'gabinete', plano ? { confirmado: true } : {}); }, // a revisão já é a confirmação
      aoPreventivo: (areaId, plano) => { if (GC.podeNaCrise('abrir')) { if (plano) gabinetes.preparar(`prev:${areaId}`, plano); abrirPreventivo(areaId); } },
      aoIrModelos: (modelo) => app.rotas.ir({ tela: 'crise', id: null, modelos: true, modelo: modelo || null }),
      aoResponderQuestao: (gid, qid, texto) => {
        const g = gabinetes.buscar(gid);
        const q = g && (g.perguntas || []).find((x) => x.id === qid);
        if (!q || !(GC.podeNaCrise('gerir') || g.areas.some((a) => GC.podeNaCrise('avancar', a)))) return false;
        const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
        if (!gabinetes.responderPergunta(gid, qid, texto, u ? u.nome : null)) return false;
        auditar('crise_questao', { alvo: q.texto, detalhe: `${tituloGabinete(gid)} · ${texto}`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
        return true;
      },
      // para (opcional): { area } ou { usuarioId } (portal do servidor): a quem a questão é apontada.
      aoAdicionarQuestao: (gid, texto, para) => {
        if (!GC.podeNaCrise('gerir')) return null;
        const q = gabinetes.adicionarPergunta(gid, texto, para);
        if (q) atualizarCrise();
        return q;
      },
      // ---- Equipe da sala (portal do servidor): o secretário chama e passa; a sala pede alguém e responde às dúvidas ----
      aoChamarMembro: (gid, usuarioId) => {
        const g = gabinetes.buscar(gid);
        const u = GC.buscarUsuario(usuarioId);
        if (!g || !u || u.perfil !== 'servidor' || !GC.podeNoGabinete('chamar', g, u.area)) return false;
        const m = gabinetes.chamarMembro(gid, u, quemFaz());
        if (!m) return false;
        auditar('crise_membro', { alvo: u.nome, areaAlvo: u.area, detalhe: `${tituloGabinete(gid)} · chamado(a) para a sala`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
        return true;
      },
      aoDispensarMembro: (gid, usuarioId) => {
        const g = gabinetes.buscar(gid);
        const u = GC.buscarUsuario(usuarioId);
        if (!g || !u || !GC.podeNoGabinete('chamar', g, u.area) || !gabinetes.dispensarMembro(gid, usuarioId, quemFaz())) return false;
        auditar('crise_membro', { alvo: u.nome, areaAlvo: u.area, detalhe: `${tituloGabinete(gid)} · saiu da sala`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
        return true;
      },
      aoPedirMembro: (gid, area, motivo) => {
        const g = gabinetes.buscar(gid);
        if (!g || !GC.podeNoGabinete('pedir', g, area)) return null;
        const p = gabinetes.pedirMembro(gid, area, motivo, quemFaz());
        if (p) { auditar('crise_pedido_membro', { alvo: nomeSecretaria(area), areaAlvo: area, detalhe: `${tituloGabinete(gid)} · ${p.motivo}`, ref: { tipo: 'gabinete', id: gid } }); atualizarCrise(); }
        return p;
      },
      aoPassarDemandaSala: (gid, tid, usuarioId) => {
        const g = gabinetes.buscar(gid);
        const t = tarefaDe(gid, tid);
        if (!g || !t || !GC.podeNoGabinete('passar', g, t) || !gabinetes.passarDemandaSala(gid, tid, usuarioId || null, quemFaz())) return false;
        const u = usuarioId ? GC.buscarUsuario(usuarioId) : null;
        auditar('crise_membro', { alvo: t.texto, areaAlvo: t.area, detalhe: `${tituloGabinete(gid)} · ${u ? `passada a ${u.nome}` : 'voltou à secretaria'}`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
        return true;
      },
      aoResponderDuvidaSala: (gid, did, texto) => {
        const g = gabinetes.buscar(gid);
        if (!g || !GC.podeNoGabinete('esclarecer', g) || !gabinetes.responderDuvidaSala(gid, did, texto, quemFaz())) return false;
        const d = g.duvidas.find((x) => x.id === did);
        auditar('crise_duvida', { alvo: d.texto, areaAlvo: d.area, detalhe: `${tituloGabinete(gid)} · resposta: ${texto}`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
        return true;
      },
      aoAtualizarSala: (gid, texto) => {
        const g = gabinetes.buscar(gid);
        if (!g || !GC.podeNoGabinete('atualizar', g) || !gabinetes.enviarAtualizacao(gid, texto, quemFaz())) return false;
        auditar('crise_atualizacao', { alvo: tituloGabinete(gid), areaAlvo: (GC.perfil && GC.perfil.area) || null, detalhe: texto, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
        return true;
      },
      aoRemoverQuestao: (gid, qid) => { if (GC.podeNaCrise('gerir') && gabinetes.removerPergunta(gid, qid)) atualizarCrise(); },
      aoAvancar: (gid, tid) => {
        if (!GC.podeNaCrise('avancar', tarefaDe(gid, tid).area)) return;
        if (!gabinetes.avancarTarefa(gid, tid)) return;
        const t = tarefaDe(gid, tid);
        auditar('crise_avancar', { alvo: t.texto, areaAlvo: t.area, detalhe: `${tituloGabinete(gid)} · ${t.status === 'concluida' ? 'concluída' : 'iniciada'}`, ref: { tipo: 'gabinete', id: gid } });
        app.chat.secretaria(t.area, `${nomeSecretaria(t.area)}: ${t.status === 'concluida' ? 'concluímos' : 'iniciamos'} "${t.texto}".`);
        atualizarCrise();
      },
      aoCobrar: (gid, tid) => {
        if (!GC.podeNaCrise('cobrar', tarefaDe(gid, tid).area)) return;
        if (!gabinetes.cobrarTarefa(gid, tid)) return;
        const t = tarefaDe(gid, tid);
        auditar('crise_cobrar', { alvo: t.texto, areaAlvo: t.area, detalhe: tituloGabinete(gid), ref: { tipo: 'gabinete', id: gid } });
        // Sem resposta automática: a tarefa fica "aguardando resposta" até a secretaria responder.
        atualizarCrise();
      },
      aoResponder: (gid, tid, texto) => {
        if (!GC.podeNaCrise('responder', tarefaDe(gid, tid).area)) return;
        const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
        if (!gabinetes.responderCobranca(gid, tid, texto, u ? u.nome : null)) return;
        const t = tarefaDe(gid, tid);
        auditar('crise_responder', { alvo: t.texto, areaAlvo: t.area, detalhe: `${tituloGabinete(gid)} · ${texto}`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
      },
      // Devolve o comunicado publicado (ou null): a tela confirma e esvazia a caixa só quando publicou.
      aoPublicar: (gid, comunicado) => {
        if (!GC.podeNaCrise('comunicar')) return null;
        const c = gabinetes.publicarComunicado(gid, comunicado);
        if (c) {
          auditar('crise_comunicado', { alvo: tituloGabinete(gid), detalhe: `${c.canais.length} ${c.canais.length === 1 ? 'canal' : 'canais'}`, ref: { tipo: 'gabinete', id: gid } });
          atualizarCrise();
        }
        return c;
      },
      // Encerrado, a sala continua aberta (a rota tem o id) e mostra o balanço.
      aoEncerrar: (gid, opcoes) => {
        if (!GC.podeNaCrise('gerir') || !gabinetes.encerrar(gid, opcoes)) return;
        auditar('crise_encerrar', { alvo: tituloGabinete(gid), detalhe: (opcoes && opcoes.motivo) || '', ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
      },
      aoAdicionarTarefa: (gid, dados) => {
        if (!GC.podeNaCrise('gerir')) return null;
        const t = gabinetes.adicionarTarefa(gid, dados);
        if (!t) return null;
        auditar('crise_tarefa', { alvo: t.texto, areaAlvo: t.area, detalhe: tituloGabinete(gid), ref: { tipo: 'gabinete', id: gid } });
        app.chat.secretaria(t.area, `${nomeSecretaria(t.area)}: recebemos a nova demanda do gabinete ("${t.texto}").`);
        atualizarCrise();
        return t;
      },
      aoEstenderPrazo: (gid, tid, min) => {
        if (!GC.podeNaCrise('gerir') || !gabinetes.estenderPrazo(gid, tid, min)) return;
        const t = tarefaDe(gid, tid);
        auditar('crise_prazo', { alvo: t.texto, areaAlvo: t.area, detalhe: `+${min} min · ${tituloGabinete(gid)}`, ref: { tipo: 'gabinete', id: gid } });
        atualizarCrise();
      },
      aoDispensar: (chave, motivo) => { if (GC.podeNaCrise('abrir') && gabinetes.dispensar(chave, motivo)) atualizarCrise(); },
      aoReativar: (chave) => { if (GC.podeNaCrise('abrir') && gabinetes.reativar(chave)) atualizarCrise(); },
      aoAbrirAlerta: (id) => noPainel(() => app.detalhar(id)),
      aoVerNoMapa: (g) => {
        const o = g.ocorrenciaId && store.buscar(g.ocorrenciaId);
        if (o && o.status !== 'resolvida') return noPainel(() => app.focar(o.id));
        if (g.areaRiscoId) {
          $('toggle-risco').checked = true; app.marcarCamadas();
          return noPainel(() => { app.subirAoMapa(); app.mapa.focarRisco(g.areaRiscoId); });
        }
        noPainel(() => { app.selecionarBairro(g.bairroId); app.subirAoMapa(); });
      },
      aoPerguntar: (g) => {
        app.abrirCopiloto();
        app.perguntar(g.grupo === 'chuva' ? 'Qual o risco de chuva nas próximas horas e quem será afetado?'
          : g.grupo === 'energia' ? 'Como estão as quedas de energia?' : `Como está o bairro ${GC.data.bairros.find((b) => b.id === g.bairroId).nome}?`);
      },
    });
    const telaAlertas = GC.criarTelaAlertas($('tela-alertas'), {
      aoAgir: (id, tipo) => app.agir(id, tipo),
      aoAbrir: (id) => noPainel(() => app.detalhar(id)),
      aoVerNoMapa: (id) => noPainel(() => app.focar(id)),
      // Ações em lote: uma ação por ocorrência (cada uma audita), só onde ela ainda vale.
      // O lote inteiro vira um "Desfazer" só.
      aoLote: (ids, acao) => {
        let feitas = [];
        app.comDesfazer(() => {
          feitas = ids.filter((id) => { const o = store.buscar(id); return o && GC.acoesDisponiveis(o).includes(acao) && app.agir(id, acao) !== false; });
          return feitas.length > 0;
        }, { rotulo: () => `${acao === 'cobrar' ? 'Cobrou' : 'Priorizou'} ${feitas.length === 1 ? '1 ocorrência' : `${feitas.length} ocorrências`}`, ocorrencias: ids });
        return { feitas, ignoradas: ids.filter((id) => !feitas.includes(id)) };
      },
      aoExportar: (lista, { selecao } = {}) => {
        GC.baixarArquivo(GC.csvCentral(lista), `alertas-${GC.cidade ? GC.cidade.id : 'cidade'}-${new Date(GC.agora()).toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
        auditar('exportar', { alvo: 'Central de alertas', detalhe: `CSV · ${lista.length} ${lista.length === 1 ? 'ocorrência' : 'ocorrências'}${selecao ? ' selecionadas' : ''}` });
      },
      // Os Filtros do mapa: a gaveta abre por cima da tela; limpar volta à cidade inteira (o setor segue na pasta).
      aoFiltros: () => app.gavetas.abrir('filtros'),
      aoLimparFiltros: () => app.aplicarFiltros({ recorte: null, severidades: [], areas: [], bairros: [], afetados: [], tempos: [], origens: [], multi: false, tratamento: null }),
      // Relacionados: a secretaria junta a duplicada à principal (o mesmo gesto do detalhe, js/operacao.js).
      aoJuntar: (id, principal) => app.operar('juntar', id, { principal }),
      aoMarcarVisto: () => { visitaCentral = GC.agora(); gravarVisita(visitaCentral); telaAlertas.atualizar(estadoAlertas()); },
    });
    // Pausar, retomar e restaurar (lista e editor de regras, js/tela-regras.js). Quem pode o quê: GC.podeNaRegra;
    // a store solta as retidas sozinha quando a regra volta a valer.
    function telaAlertasRegra(id, acao, dados = {}) {
      const r = store.regrasAlerta && store.regrasAlerta.buscar(id);
      const rotulo = `${acao === 'pausar' ? 'Pausou' : acao === 'retomar' ? 'Retomou' : 'Restaurou'} a regra${r ? `: ${r.nome}` : ''}`;
      return app.comDesfazer(() => telaAlertasRegraDeVez(id, acao, dados), { rotulo });
    }
    function telaAlertasRegraDeVez(id, acao, dados = {}) {
      const reg = store.regrasAlerta;
      const r = reg && reg.buscar(id);
      if (!r || !GC.podeNaRegra(acao === 'retomar' ? 'pausar' : acao, r)) return false;
      const res = acao === 'pausar' ? reg.pausar(id, dados.minutos || null, quemEdita())
        : acao === 'retomar' ? reg.retomar(id)
          : acao === 'restaurar' ? reg.restaurar(id) : null;
      if (!res || !res.ok) return false;
      const base = { alvo: r.nome, areaAlvo: r.area || null, ref: { tipo: 'regra', id: r.id } };
      if (acao === 'restaurar') auditar('regra_restaurada', Object.assign(base, { detalhe: GC.mudancasRegra(res.antes, res.regra).join(' · ') || `Versão ${res.antes.versao} desfeita` }));
      else auditar('regra', Object.assign(base, { detalhe: acao === 'retomar' ? 'Retomada' : dados.minutos ? `Pausada por ${GC.tempoTexto(dados.minutos)}` : 'Pausada até reativar' }));
      return true;
    }
    // ---- Minha conta e Auditoria ----
    const sair = () => {
      auditar('sair');
      GC.sessao.sair();
      window.location.href = GC.urlEntrar({ motivo: 'saiu' });
    };
    const temaAtual = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro');
    const telaConta = GC.criarTelaConta ? GC.criarTelaConta($('tela-conta'), {
      aoTrocarSenha: (atual, nova) => {
        const u = GC.usuarioAtual();
        const r = GC.sessao.trocarSenha(u.id, atual, nova);
        if (r.ok) auditar('trocar_senha');
        return r;
      },
      aoSair: sair,
      aoEntrar: () => { window.location.href = GC.urlEntrar(); },
      aoVerAuditoria: () => app.rotas.ir({ tela: 'auditoria' }),
      // O botão de tema do mapa já sabe trocar mapa e interface juntos; sem mapa, troca só a interface.
      aoTema: (t) => {
        if (t === temaAtual()) return;
        const botao = document.querySelector('.ctrl-tema');
        if (botao) botao.click();
        else {
          try { localStorage.setItem('vd-mapa-tema', t); } catch (e) { /* sem armazenamento */ }
          GC.aplicarTemaInterface(t);
        }
        if (tela === 'conta') telaConta.atualizar(estadoConta());
      },
    }) : null;
    const estadoConta = () => {
      const u = GC.usuarioAtual();
      return {
        usuario: u,
        // O nome do perfil de acesso (do sistema ou criado), não só o tipo de painel.
        perfilRotulo: (GC.papelDe && GC.papelDe(app.perfil, u) || {}).nome || (GC.visaoDe(app.perfil) === 'pasta' ? 'Gestor do setor' : 'Gestor geral'),
        nomeArea: u && u.area ? nomeSecretaria(u.area) : null,
        login: !!GC.loginExigido,
        sessao: GC.loginExigido ? GC.sessao.dados() : null,
        acessos: u && GC.loginExigido ? GC.sessao.acessos(u.id) : [],
        atividade: u ? GC.auditoria.todos().filter((e) => e.usuarioId === u.id).slice(0, 10) : [],
        senhaTrocada: u ? GC.sessao.senhaTrocada(u.id) : false,
        tema: temaAtual(),
        agora: GC.agora(),
      };
    };
    const hojeArquivo = () => new Date(GC.agora()).toISOString().slice(0, 10);
    const telaAuditoria = GC.criarTelaAuditoria ? GC.criarTelaAuditoria($('tela-auditoria'), {
      aoExportar: (lista) => {
        GC.baixarArquivo(GC.csvAuditoria(lista), `auditoria-${GC.cidade ? GC.cidade.id : 'cidade'}-${hojeArquivo()}.csv`, 'text/csv;charset=utf-8');
        auditar('exportar', { alvo: 'Auditoria', detalhe: `CSV · ${lista.length} eventos` });
      },
      // Os filtros (menos a busca) vão para o endereço: dá para mandar o link de um recorte.
      aoFiltrar: (rota) => app.rotas.ir(rota),
      // O "Em quê" abre o item que a ação tocou (ocorrência, gabinete, demanda ou regra).
      aoAbrir: (ref) => {
        if (ref.tipo === 'ocorrencia') noPainel(() => app.detalhar(ref.id));
        else if (ref.tipo === 'gabinete') app.rotas.ir({ tela: 'crise', id: ref.id });
        else if (ref.tipo === 'tarefa') app.rotas.ir({ tela: 'tarefas', id: ref.id });
        else if (ref.tipo === 'regra') app.rotas.ir({ tela: 'regras', id: ref.id });
      },
    }) : null;
    // O item ainda existe e está no recorte de quem olha? Só então o "Em quê" vira link.
    const abrivelNaAuditoria = (ref) => {
      if (!ref) return false;
      if (ref.tipo === 'ocorrencia') { const o = store.buscar(ref.id); return !!o && (!areasPerfil || daPasta(o)); }
      if (ref.tipo === 'gabinete') { const g = gabinetes.buscar(ref.id); return !!g && gabineteDaPasta(g); }
      if (ref.tipo === 'tarefa') return !!(GC.tarefas && GC.tarefas.buscar(ref.id));
      if (ref.tipo === 'regra') return !!(store.regrasAlerta && store.regrasAlerta.buscar(ref.id));
      return false;
    };
    // ---- Histórico de cobranças (#/cobrancas, js/tela-cobrancas.js): as cobranças do painel + o histórico simulado ----
    let historicoDemo = null; // calculado uma vez (é o mesmo a cada abertura)
    const estadoCobrancas = () => {
      if (!historicoDemo) historicoDemo = GC.historicoDemoCobrancas ? GC.historicoDemoCobrancas(GC.agora()) : [];
      return {
        lista: [...(GC.cobrancas ? GC.cobrancas.todas() : []), ...historicoDemo],
        cobrancas: GC.cobrancas || null,
        agora: GC.agora(),
        areaFixa: areasPerfil ? areasPerfil[0] : null,
        existe: (id) => !!store.buscar(id),
      };
    };
    const telaCobrancas = GC.criarTelaCobrancas ? GC.criarTelaCobrancas($('tela-cobrancas'), {
      aoAbrir: (id) => noPainel(() => app.detalhar(id)),
      // Os filtros (menos a busca) vão para o endereço, como na Auditoria.
      aoFiltrar: (rota) => app.rotas.ir(rota),
      aoExportar: (lista) => {
        GC.baixarArquivo(GC.csvCobrancas(lista, GC.cobrancas, GC.agora()), `cobrancas-${GC.cidade ? GC.cidade.id : 'cidade'}-${new Date(GC.agora()).toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
        auditar('exportar', { alvo: 'Histórico de cobranças', detalhe: `CSV · ${lista.length} cobranças` });
      },
    }) : null;
    const estadoAuditoria = () => {
      const eventos = GC.auditoriaDoPerfil(GC.auditoria.todos());
      const ids = new Set(eventos.map((e) => e.usuarioId));
      return {
        eventos,
        usuarios: GC.data.usuarios.filter((u) => ids.has(u.id)),
        areas: areasPerfil ? null : GC.data.areas.map((a) => ({ id: a.id, nome: a.secretaria.nome })),
        setor: areasPerfil ? areasPerfil[0] : null,
        nomeArea: nomeSecretaria,
        abrivel: abrivelNaAuditoria,
        agora: GC.agora(),
      };
    };
    // ---- Parâmetros de prazo (js/tela-prazos.js; registro em js/prazos-parametros.js) ----
    // Só o gestor geral muda (GC.podeMudarParametrosPrazo); a auditoria guarda o que mudou.
    const estadoPrazos = () => {
      const reg = GC.parametrosPrazo;
      return {
        valores: reg ? reg.valores() : JSON.parse(JSON.stringify(GC.PARAMETROS_PRAZO_FABRICA || {})),
        fabrica: GC.PARAMETROS_PRAZO_FABRICA,
        podeMudar: !!reg && GC.podeMudarParametrosPrazo(),
        sobre: reg ? reg.sobre() : null,
        ocorrencias: store.ocorrencias(), // para o "Com estes valores" da barra
      };
    };
    const quemMudaPrazo = () => { const u = GC.usuarioAtual ? GC.usuarioAtual() : null; return u ? u.nome : null; };
    const telaPrazos = GC.criarTelaPrazos ? GC.criarTelaPrazos($('tela-prazos'), {
      aoSalvar: (valores) => {
        const reg = GC.parametrosPrazo;
        if (!reg || !GC.podeMudarParametrosPrazo()) return { ok: false, motivo: 'permissao' };
        // A tela só salva com mudança; o "Desfazer" volta o registro (gc.prazos.<cidade>) como estava.
        return app.comDesfazer(() => {
          const res = reg.salvar(valores, quemMudaPrazo());
          if (res.ok && res.mudancas.length) auditar('prazo_parametros', { alvo: 'Parâmetros de prazo', detalhe: res.mudancas.join('; ') });
          return res.semMudanca ? Object.assign({}, res, { ok: 'sem_mudanca' }) : res;
        }, { rotulo: 'Parâmetros de prazo salvos' });
      },
      aoRestaurar: () => {
        const reg = GC.parametrosPrazo;
        if (!reg || !GC.podeMudarParametrosPrazo()) return { ok: false, motivo: 'permissao' };
        return app.comDesfazer(() => {
          const res = reg.restaurar(quemMudaPrazo());
          if (res.ok) auditar('prazo_parametros', { alvo: 'Parâmetros de prazo', detalhe: `Voltou aos valores de fábrica${res.mudancas.length ? `: ${res.mudancas.join('; ')}` : ''}` });
          return res;
        }, { rotulo: 'Parâmetros de prazo de volta aos de fábrica' });
      },
    }) : null;
    if (GC.parametrosPrazo) GC.parametrosPrazo.assinar(() => { if (tela === 'prazos' && telaPrazos) telaPrazos.atualizar(estadoPrazos()); });

    // ---- Regras de alerta (js/tela-regras.js; registro em js/regras-alerta.js) ----
    // O setor vê as regras da pasta (e as sem secretaria); quem pode mudar decide GC.podeNaRegra.
    const regrasDoPerfil = () => store.regras().filter((r) => !areasPerfil || !r.area || areasPerfil.includes(r.area));
    const estadoRegras = () => ({
      regras: regrasDoPerfil(),
      podeRegra: (acao, r) => GC.podeNaRegra(acao, r),
      setor: areasPerfil ? areasPerfil[0] : null,
      areas: GC.data.areas.map((x) => ({ id: x.id, nome: x.secretaria.nome })),
      tipos: Object.keys(GC.data.regras).map((t) => ({ tipo: t, nome: t.charAt(0).toUpperCase() + t.slice(1), area: GC.areaDoTipo(t) })),
      bairros: GC.data.bairros,
      prazos: GC.data.prazoMin,
      atencao: GC.limitesAtencao(),
      podeLimites: GC.podeNaRegra('limites', { area: '*' }),
    });
    const NOME_SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
    const limitesTexto = (a) => `caso repetido ${a.recorrenteMin}+ (${a.recorrenteGravidades.map((g) => NOME_SEV[g]).join(', ') || 'nenhuma'}) · várias secretarias ${a.conjunta ? 'sim' : 'não'} · laranja a ${a.quasePct}% · avisa antes ${a.antecipar !== false ? 'sim' : 'não'}`;
    const quemEdita = () => { const u = GC.usuarioAtual ? GC.usuarioAtual() : null; return u ? u.nome : null; };
    const telaRegras = GC.criarTelaRegras ? GC.criarTelaRegras($('tela-regras'), {
      estado: estadoRegras,
      aoIr: (r) => app.rotas.ir(r),
      aoRegra: (id, acao, dados) => telaAlertasRegra(id, acao, dados),
      aoSalvar: (id, mudancas) => {
        const reg = store.regrasAlerta;
        const r = reg && reg.buscar(id);
        if (!r || !GC.podeNaRegra('editar', r)) return { ok: false, motivo: 'permissao' };
        // O tipo novo não pode tirar a regra da pasta do setor.
        if (mudancas.tipo && !GC.podeNaRegra('editar', { area: GC.areaDoTipo(mudancas.tipo) })) return { ok: false, motivo: 'permissao' };
        const res = reg.salvar(id, mudancas, quemEdita());
        if (res.ok) {
          const ativou = r.rascunho && !res.regra.rascunho;
          auditar('regra_editada', { alvo: res.regra.nome, areaAlvo: res.regra.area || null, detalhe: [ativou ? 'Rascunho ativado' : '', ...res.mudancas].filter(Boolean).join(' · ') || `Versão ${res.regra.versao}`, ref: { tipo: 'regra', id: res.regra.id } });
        }
        return res;
      },
      aoCriar: (dados) => {
        const reg = store.regrasAlerta;
        if (!reg || !GC.podeNaRegra('criar', { area: GC.areaDoTipo(dados.tipo) || (areasPerfil ? null : '*') })) return { ok: false, motivo: dados.tipo ? 'permissao' : 'tipo' };
        const res = reg.criar(dados, quemEdita());
        if (res.ok) auditar('regra_criada', { alvo: res.regra.nome, areaAlvo: res.regra.area || null, detalhe: `${res.regra.palavras} · ${res.regra.escopo.bairros.length ? `${res.regra.escopo.bairros.length} bairro(s)` : 'cidade inteira'}`, ref: { tipo: 'regra', id: res.regra.id } });
        return res;
      },
      aoSalvarAtencao: (limites) => {
        const reg = store.regrasAlerta;
        if (!reg || !GC.podeNaRegra('limites', { area: '*' })) return { ok: false, motivo: 'permissao' };
        const res = reg.salvarAtencao(limites, quemEdita());
        if (res.ok) auditar('regra_limites', { alvo: 'Precisam de você', detalhe: `${limitesTexto(res.antes)} → ${limitesTexto(res.atencao)}` });
        return res;
      },
      aoRestaurarAtencao: () => {
        const reg = store.regrasAlerta;
        if (!reg || !GC.podeNaRegra('limites', { area: '*' })) return { ok: false, motivo: 'permissao' };
        const res = reg.restaurarAtencao();
        if (res.ok) auditar('regra_limites', { alvo: 'Precisam de você', detalhe: `Voltou ao padrão: ${limitesTexto(res.atencao)}` });
        return res;
      },
      aoExcluir: (id) => {
        const reg = store.regrasAlerta;
        const r = reg && reg.buscar(id);
        if (!r || !GC.podeNaRegra('excluir', r)) return { ok: false, motivo: 'permissao' };
        const res = reg.excluir(id);
        if (res.ok) auditar('regra_excluida', { alvo: r.nome, areaAlvo: r.area || null, detalhe: r.palavras || r.expressao });
        return res;
      },
    }) : null;

    // ---- Usuários e permissões (js/tela-usuarios.js; regras em js/usuarios.js) ----
    const autor = () => GC.usuarioAtual();
    const rotuloUsuario = (u) => `${u.nome} (${u.email})`;
    const nomePapel = (u) => (GC.papelDoUsuario(u) || { nome: u.perfil }).nome;
    // perfil, papel e nível mudam juntos: tudo vira "perfil" (uma vez) no detalhe da auditoria.
    const NOME_CAMPO = { nome: 'nome', cargo: 'cargo', perfil: 'perfil', papel: 'perfil', nivel: 'perfil', area: 'secretaria' };
    // Toda ação de cadastro vai para a auditoria e a tela se redesenha com a lista nova.
    const cadastrar = (acao, r, detalhe) => {
      if (r.ok) {
        auditar(acao, { alvo: rotuloUsuario(r.usuario), areaAlvo: r.usuario.area, detalhe: typeof detalhe === 'function' ? detalhe(r) : detalhe || '' });
        if (tela === 'usuarios') telaUsuarios.atualizar(estadoUsuarios(app.rotas.atual()));
      }
      return r;
    };
    // Perfis de acesso (js/tela-perfis.js; registro em js/perfis-acesso.js): criar, editar e excluir vão para a auditoria.
    const usoDoPerfil = () => {
      const m = {};
      GC.data.usuarios.forEach((u) => { const x = GC.papelDoUsuario(u); if (x) m[x.id] = (m[x.id] || 0) + 1; });
      return m;
    };
    const NOME_CAMPO_PERFIL = { nome: 'nome', descricao: 'descrição', visao: 'visão', permissoes: 'permissões' };
    const noPerfil = (acao, r, detalhe) => {
      if (r.ok) {
        if (acao) auditar(acao, { alvo: r.perfil.nome, detalhe });
        if (tela === 'usuarios') telaUsuarios.atualizar(estadoUsuarios(app.rotas.atual()));
      }
      return r;
    };
    // Outra aba criou ou mudou um perfil: a tela aberta acompanha.
    window.addEventListener('storage', (e) => { if (e.key === 'vd-perfis' && tela === 'usuarios' && telaUsuarios) telaUsuarios.atualizar(estadoUsuarios(app.rotas.atual())); });
    const telaUsuarios = GC.criarTelaUsuarios ? GC.criarTelaUsuarios($('tela-usuarios'), {
      aoAba: (aba) => app.rotas.ir({ tela: 'usuarios', aba }),
      aoCriar: (d) => cadastrar('usuario_criar', GC.cadastro.criar(d, autor()), (r) => `${nomePapel(r.usuario)}${r.usuario.area ? ` · ${nomeSecretaria(r.usuario.area)}` : ''}`),
      aoEditar: (id, d) => {
        const r = GC.cadastro.editar(id, d, autor());
        if (r.ok && !r.mudou.length) return r;
        return cadastrar('usuario_editar', r, (x) => `Mudou: ${[...new Set(x.mudou.map((k) => NOME_CAMPO[k] || k))].join(', ')}${x.mudou.some((k) => ['perfil', 'papel', 'nivel'].includes(k)) ? ` · agora ${nomePapel(x.usuario)}` : ''}`);
      },
      perfis: {
        aoIr: (r) => app.rotas.ir({ tela: 'usuarios', aba: 'perfis', perfil: r.perfil || null, base: r.base || null }),
        aoCriar: (d) => noPerfil('perfil_criar', GC.perfisAcesso.criar(d, autor()), `A partir de ${(GC.papelPorId(d.base) || { nome: '—' }).nome} · ${Object.keys(GC.normalizarPermissoes(d.visao, d.permissoes)).length} permissões`),
        aoEditar: (id, d) => {
          const r = GC.perfisAcesso.editar(id, d, autor(), usoDoPerfil()[id] || 0);
          return noPerfil(r.ok && r.mudou.length ? 'perfil_editar' : null, r, r.ok ? `Mudou: ${r.mudou.map((k) => NOME_CAMPO_PERFIL[k] || k).join(', ')}` : '');
        },
        aoExcluir: (id) => noPerfil('perfil_excluir', GC.perfisAcesso.excluir(id, autor(), usoDoPerfil()[id] || 0), ''),
        aoRestaurar: (id) => {
          const r = GC.perfisAcesso.restaurar(id, autor());
          return noPerfil(r.ok && r.mudou.length ? 'perfil_restaurar' : null, r, 'Nome, descrição e permissões de fábrica');
        },
      },
      aoDesativar: (id) => cadastrar('usuario_desativar', GC.cadastro.desativar(id, autor())),
      aoReativar: (id) => cadastrar('usuario_reativar', GC.cadastro.reativar(id, autor())),
      aoReenviar: (id) => cadastrar('usuario_reenviar', GC.cadastro.reenviarAcesso(id, autor()), 'Senha provisória nova'),
    }) : null;
    // Último acesso de cada pessoa: a entrada mais recente na auditoria (o histórico simulado conta).
    const ultimosAcessos = () => {
      const m = {};
      GC.auditoria.todos().forEach((e) => { if (e.acao === 'entrar' && e.usuarioId && !m[e.usuarioId]) m[e.usuarioId] = e.t; });
      return m;
    };
    // rota: a de #/usuarios (aba, e na aba de perfis o perfil aberto e a base do novo).
    const estadoUsuarios = (rota) => {
      const r = rota && typeof rota === 'object' ? rota : { aba: rota };
      const aba = r.aba;
      const a = autor();
      const podePerfis = GC.perfisAcesso.podeGerir(a);
      const visiveis = GC.cadastro.visiveis(a);
      return {
        aba: aba === 'perfis' ? 'perfis' : 'pessoas',
        autor: a,
        usuarios: visiveis,
        areas: GC.data.areas.map((x) => ({ id: x.id, nome: x.secretaria.nome })),
        setor: areasPerfil ? areasPerfil[0] : null,
        nomeArea: nomeSecretaria,
        ultimoAcesso: ultimosAcessos(),
        // Perfis de acesso: todos que abrem Usuários veem; só quem tem 'perfis.gerir' muda.
        perfis: { rota: { perfil: r.perfil || null, base: r.base || null }, podeGerir: podePerfis, emUso: usoDoPerfil() },
      };
    };

    // ---- Acesso restrito e Página não encontrada (js/tela-aviso.js) ----
    const telaAviso = GC.criarTelaAviso ? GC.criarTelaAviso($('tela-aviso'), {
      aoIr: (r) => app.rotas.ir(r),
      aoBuscar: () => noPainel(() => { const b = $('btn-busca'); if (b) b.click(); }),
    }) : null;
    let ultimoNegado = null; // a mesma tentativa (re)desenhada não vira dois eventos na auditoria

    // Evento novo (ação aqui ou em outra parte do painel): a tela aberta acompanha.
    if (GC.auditoria) GC.auditoria.aoRegistrar(() => {
      if (tela === 'auditoria' && telaAuditoria) telaAuditoria.atualizar(estadoAuditoria());
      if (tela === 'conta' && telaConta) telaConta.atualizar(estadoConta());
    });
    const telaDados = GC.criarTelaDados($('tela-dados'), {
      aoAbrirTabela: (id) => app.rotas.ir({ tela: 'dados', tabela: id }),
      base: () => store,
    });
    const estadoDados = () => ({ resumo: GC.resumoDados(store), tabelas: GC.tabelasDados(store) });
    // Os números do topo são contados pela própria tela na lista da pasta (perfil) e no recorte dela.
    // O balanço de 30 dias (tempo médio, total de resolvidas) vem da store, no mesmo recorte.
    // Última visita à Central, por cidade e pessoa (localStorage). null = nunca veio (sem novidades para mostrar).
    let visitaCentral = null;
    const chaveVisita = () => { const u = GC.usuarioAtual ? GC.usuarioAtual() : null; return `gc.visitaCentral.${GC.cidade ? GC.cidade.id : 'media'}.${u ? u.id : 'demo'}`; };
    const lerVisita = () => { try { const v = Number(window.localStorage.getItem(chaveVisita())); return v > 0 ? v : null; } catch (e) { return null; } };
    const gravarVisita = (t) => { try { window.localStorage.setItem(chaveVisita(), String(t)); } catch (e) { /* sem armazenamento */ } };
    const estadoAlertas = () => ({
      ocorrencias: store.todas().filter(daPasta),
      historico: (GC.data.resolvidasRecentes || []).filter(daPasta),
      // Pastas do perfil (null = todas): recorta os casos recorrentes, que vêm do histórico da cidade.
      areas: areasPerfil || null,
      regras: store.regras().filter((r) => !areasPerfil || !r.area || areasPerfil.includes(r.area)),
      desempenho: (areas, bairros) => store.desempenho(bairros, areas || areasPerfil),
      // Os Filtros do mapa (o setor já está recortado na pasta: a secretaria não entra no filtro).
      filtros: areasPerfil ? Object.assign(app.estadoFiltros(), { areas: [] }) : app.estadoFiltros(),
      // Última visita à Central (antes desta): o que é novo ou mudou desde então aparece separado.
      visita: visitaCentral,
      // Modo de crise (js/modo-crise.js): o chip "Da crise" e o selo nas linhas.
      modoCrise: app.modoCrise ? app.modoCrise.modo() : null,
    });
    const telaRelatorios = GC.criarTelaRelatorios($('tela-relatorios'), {
      aoMudar: (r) => app.rotas.ir(r),
      // Itens do relatório levam ao que citam: a ocorrência (no mapa) ou a página da secretaria.
      aoAbrir: (l) => {
        if (l.tipo === 'ocorrencia') noPainel(() => app.detalhar(l.id));
        else if (l.tipo === 'secretaria') app.rotas.ir({ tela: 'secretaria', area: l.id });
      },
    });
    const relatorioDe = (r) => GC.montarRelatorio(store, r);
    // Cruzamento de dados (js/tela-cruzamento.js): o recorte do perfil vai junto (o setor só vê o que é da pasta).
    const ctxCruzamento = () => ({ ocorrencias: store.ocorrencias(), areas: areasPerfil });
    const telaCruzamento = GC.criarTelaCruzamento && TELAS.cruzamento ? GC.criarTelaCruzamento(TELAS.cruzamento, {
      aoIr: (r) => app.rotas.ir(r),
      // Recebe a camada pronta: os bairros pelo grupo (GC.cruzamento.mapa) ou um bairro só em destaque.
      aoVerNoMapa: (camada) => noPainel(() => { app.subirAoMapa(); app.mapa.mostrarCamada(camada); }),
      aoBaixar: (conteudo, nome) => GC.baixarArquivo(conteudo, nome, 'text/csv;charset=utf-8'),
    }) : null;
    // Calendário sazonal (js/tela-sazonal.js): a camada liga pelo próprio interruptor do painel Camadas.
    const telaSazonal = GC.criarTelaSazonal && TELAS.sazonal ? GC.criarTelaSazonal(TELAS.sazonal, {
      aoIr: (r) => app.rotas.ir(r),
      aoVerCamada: (nome) => {
        const t = $(`toggle-${nome}`);
        if (!t || (app.podeCamada && !app.podeCamada(`toggle-${nome}`))) return;
        if (!t.checked) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
        noPainel(() => { app.subirAoMapa(); app.mapa.visaoGeral(); });
      },
    }) : null;
    // Configuração do calendário sazonal (#/sazonal/config; registro em js/sazonal-registro.js), no mesmo painel.
    // Só o gestor geral muda (sazonal.editar); cada mudança vai à auditoria e vira um "Desfazer".
    const registroSazonal = () => GC.registroSazonal;
    const nomeTemporada = (id) => ((registroSazonal().buscar(id) || {}).nome || id);
    function naTemporada(acao, fazer, alvo) {
      if (!GC.pode('sazonal.editar', null)) return { ok: false, motivo: 'sem_permissao' };
      return app.comDesfazer(() => {
        const r = fazer();
        if (r && r.ok) auditar(acao, { alvo: (r.temporada && r.temporada.nome) || alvo });
        return r;
      }, { rotulo: `${((GC.ACOES_AUDITORIA || {})[acao] || { nome: 'Mudou o calendário sazonal' }).nome}: ${alvo}` });
    }
    const telaSazonalConfig = GC.criarTelaSazonalConfig && TELAS.sazonal ? GC.criarTelaSazonalConfig(TELAS.sazonal, {
      ir: (r) => app.rotas.ir(r),
      aoSalvar: (id, dados) => naTemporada('sazonal_salvar', () => registroSazonal().salvar(id, dados), nomeTemporada(id)),
      aoCriar: (base, dados) => naTemporada('sazonal_criar', () => registroSazonal().criar(base, dados), dados.nome),
      aoExcluir: (id) => naTemporada('sazonal_excluir', () => registroSazonal().excluir(id), nomeTemporada(id)),
      aoRestaurar: (id) => naTemporada('sazonal_restaurar', () => registroSazonal().restaurar(id), nomeTemporada(id)),
    }) : null;
    // Outra aba mudou o calendário (o registro já releu sozinho): a tela aberta se redesenha.
    window.addEventListener('storage', (e) => {
      if (e.key !== GC.CHAVE_SAZONAL || tela !== 'sazonal') return;
      const r = app.rotas.atual();
      if (r.config && telaSazonalConfig) { if (!r.temporada) telaSazonalConfig.mostrar(r); } else if (telaSazonal) telaSazonal.atualizar();
    });
    // ---- Tarefas (js/tarefas.js, js/tarefas-ui.js, tela #/tarefas em js/tela-tarefas.js) ----
    // Passar, começar, concluir, cobrar, responder, mudar o prazo e cancelar. Quem pode: GC.podeNaTarefa; cada ação
    // vai à auditoria (tarefa_*) e vira um "Desfazer". Tarefa ligada a um gabinete entra na lista dele (js/crise.js).
    const AUDITORIA_TAREFA = { passar: 'tarefa_passar', iniciar: 'tarefa_iniciar', concluir: 'tarefa_concluir', cobrar: 'tarefa_cobrar', responder: 'tarefa_responder', remarcar: 'tarefa_remarcar', cancelar: 'tarefa_cancelar', esclarecer: 'tarefa_esclarecer', pedir_atualizacao: 'tarefa_pedir_atualizacao' };
    const contextoTexto = (c) => (c.tipo === 'avulsa' ? 'avulsa' : `${GC.CONTEXTOS_TAREFA[c.tipo].nome}: ${c.nome}`);
    function quemFaz() {
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      return { id: u ? u.id : null, nome: u ? u.nome : (GC.visaoDe(GC.perfil) === 'pasta' ? 'Secretaria' : 'Prefeito(a)'), area: (GC.perfil && GC.perfil.area) || null };
    }
    function depoisDaTarefa(t) {
      // O detalhe aberto do alerta e a tela do calendário mostram o bloco de tarefas: redesenham na hora.
      const oid = t && t.contexto && t.contexto.tipo === 'alerta' ? t.contexto.id : null;
      if (oid && app.gaveta && app.gaveta.abertaId() === oid && store.buscar(oid)) app.gaveta.atualizar(store.buscar(oid), true);
      if (tela === 'sazonal' && telaSazonal && !app.rotas.atual().config) telaSazonal.atualizar();
      if (tela === 'tarefas' && telaTarefas) telaTarefas.mostrar(app.rotas.atual());
    }
    function agirNaTarefa(acao, id, dados = {}) {
      const reg = GC.tarefas;
      if (!reg || !AUDITORIA_TAREFA[acao]) return { ok: false, motivo: 'estado' };
      const quem = quemFaz();
      if (acao === 'passar') {
        const ctx = dados.contexto || { tipo: 'avulsa' };
        if (!GC.podeNaTarefa('passar', { area: dados.area })) return { ok: false, motivo: 'permissao' };
        if (ctx.tipo === 'gabinete') {
          if (!GC.podeNaCrise('gerir')) return { ok: false, motivo: 'permissao' };
          const g = gabinetes.buscar(ctx.id);
          if (!g || g.encerradoEm) return { ok: false, motivo: 'gabinete' };
          const texto = String(dados.texto || '').trim();
          const prazoMin = Math.round((Number(dados.prazoEm) - GC.agora()) / 60000);
          if (!texto) return { ok: false, motivo: 'texto' };
          if (!(prazoMin >= GC.LIMITES_TAREFA.prazoMinMin - 1)) return { ok: false, motivo: 'prazo' };
          const r = app.comDesfazer(() => {
            const t = gabinetes.adicionarTarefa(ctx.id, { area: dados.area, texto, prazoMin });
            if (!t) return { ok: false, motivo: 'texto' };
            auditar('crise_tarefa', { alvo: t.texto, areaAlvo: t.area, detalhe: tituloGabinete(ctx.id), ref: { tipo: 'gabinete', id: ctx.id } });
            atualizarCrise();
            return { ok: true, tarefaGabinete: t };
          }, { rotulo: `Passou demanda ao gabinete: ${texto}` });
          if (r && r.ok) depoisDaTarefa(null);
          return r;
        }
        const r = app.comDesfazer(() => {
          const x = reg.passar(dados, quem);
          if (x.ok) auditar('tarefa_passar', { alvo: x.tarefa.texto, areaAlvo: x.tarefa.area, detalhe: `${nomeSecretaria(x.tarefa.area)} · ${contextoTexto(x.tarefa.contexto)}`, ref: { tipo: 'tarefa', id: x.tarefa.id } });
          return x;
        }, { rotulo: `${GC.ACOES_AUDITORIA.tarefa_passar.nome}: ${String(dados.texto || '').trim()}` });
        if (r && r.ok) depoisDaTarefa(r.tarefa);
        return r;
      }
      const t = reg.buscar(id);
      if (!t) return { ok: false, motivo: 'nao_encontrada' };
      if (!GC.podeNaTarefa(acao, t)) return { ok: false, motivo: 'permissao' };
      const r = app.comDesfazer(() => {
        let x;
        if (acao === 'iniciar') x = reg.iniciar(id, quem);
        else if (acao === 'concluir') x = reg.concluir(id, dados.texto, quem);
        else if (acao === 'cobrar') x = reg.cobrar(id, quem);
        else if (acao === 'responder') x = reg.responder(id, dados.texto, quem);
        else if (acao === 'remarcar') x = reg.remarcar(id, dados.prazoEm, dados.texto, quem);
        else if (acao === 'esclarecer') x = reg.esclarecer(id, dados.texto, quem);
        else if (acao === 'pedir_atualizacao') x = reg.pedirAtualizacao(id, quem);
        else x = reg.cancelar(id, dados.texto, quem);
        if (x.ok) auditar(AUDITORIA_TAREFA[acao], { alvo: t.texto, areaAlvo: t.area, detalhe: [contextoTexto(t.contexto), dados.texto].filter(Boolean).join(' · '), ref: { tipo: 'tarefa', id: t.id } });
        return x;
      }, { rotulo: `${GC.ACOES_AUDITORIA[AUDITORIA_TAREFA[acao]].nome}: ${t.texto}` });
      if (r && r.ok) depoisDaTarefa(r.tarefa || t);
      return r;
    }
    GC.agirNaTarefa = agirNaTarefa;
    // O chip do contexto: a temporada abre no calendário, o alerta no detalhe, o gabinete na sala.
    GC.irParaContextoTarefa = function (tipo, id) {
      if (tipo === 'temporada') { app.rotas.ir({ tela: 'sazonal' }); if (telaSazonal) telaSazonal.selecionar(id); return; }
      if (tipo === 'alerta') { if (store.buscar(id)) noPainel(() => app.detalhar(id)); return; }
      if (tipo === 'gabinete') app.rotas.ir({ tela: 'crise', id });
    };
    const telaTarefas = GC.criarTelaTarefas && TELAS.tarefas ? GC.criarTelaTarefas(TELAS.tarefas, {
      ir: (r) => app.rotas.ir(r),
      dados: () => ({
        gabinetes,
        alertas: store.ocorrencias().filter((o) => o.status !== 'resolvida').map((o) => ({ id: o.id, nome: `${o.titulo} · ${(GC.data.bairros.find((b) => b.id === o.bairroId) || { nome: '' }).nome}`, area: o.area })),
      }),
    }) : null;
    if (GC.tarefas) {
      // Outra aba mudou as tarefas: relê e o painel acompanha (bloco do alerta, caixa, tela).
      window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_TAREFAS) GC.tarefas.recarregar(); });
      GC.tarefas.assinar((ev) => { if (ev.tipo === 'recarga') { app.render(); depoisDaTarefa(null); } });
    }
    // Agenda de entregas (js/tela-entregas.js): "Ver no mapa" liga a camada de obras e abre o pino.
    // Confirmar e remarcar (secretaria) e inauguração (prefeito) vão ao registro js/entregas-registro.js, com a
    // permissão (GC.pode 'entrega.*') e a auditoria entrega_*. A remarcação muda a data da obra: o painel redesenha.
    const PERMISSAO_ENTREGA = { confirmar: 'entrega.confirmar', remarcar: 'entrega.remarcar', inaugurar: 'entrega.inaugurar', desmarcar: 'entrega.inaugurar' };
    const podeNaEntrega = (acao, e) => !!(e && PERMISSAO_ENTREGA[acao] && GC.pode(PERMISSAO_ENTREGA[acao], { area: e.area }));
    function agirNaEntrega(acao, id, d = {}) {
      const reg = GC.registroEntregas;
      const e = reg && GC.entregas ? GC.entregas.lista().find((x) => x.id === id) : null;
      if (!e || !podeNaEntrega(acao, e)) return { ok: false, motivo: 'permissao' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = { quem: u ? u.id : null, quemNome: u ? u.nome : '' };
      const r = reg[acao](id, Object.assign({}, d, quem));
      if (r.ok) {
        const data = (iso) => iso.split('-').reverse().join('/');
        const detalhe = acao === 'remarcar' ? `de ${data(r.evento.de)} para ${data(r.evento.data)} · ${GC.MOTIVOS_REMARCAR[r.evento.motivo]}${r.evento.texto ? ` (${r.evento.texto})` : ''}`
          : acao === 'confirmar' ? `data ${data(r.evento.data)}`
            : acao === 'inaugurar' ? `${data(r.evento.dia)} às ${r.evento.hora} · ${r.evento.local}` : '';
        auditar(`entrega_${acao}`, { alvo: e.titulo, areaAlvo: e.area, detalhe });
      }
      return r;
    }
    const telaEntregas = GC.criarTelaEntregas && TELAS.entregas ? GC.criarTelaEntregas(TELAS.entregas, {
      aoIr: (r) => app.rotas.ir(r),
      aoVerObra: (id) => noPainel(() => { app.subirAoMapa(); app.abrirCamada('obras', id); }),
      pode: podeNaEntrega,
      aoAgir: agirNaEntrega,
      // Alerta aberto da obra (regra medida "entrega em risco", fonte obra_entrega): cobrar e acompanhar ficam
      // na Central; a agenda só aponta para ele.
      alertaDe: (e) => {
        if (!e || !e.origem.obra) return null;
        const fim = `|${e.origem.obra}`;
        return store.ocorrencias().find((o) => o.status !== 'resolvida' && o.alvoMedido && o.alvoMedido.endsWith(fim)) || null;
      },
      aoAbrirAlerta: (id) => noPainel(() => app.detalhar(id)),
      // Atalho do relatório com o recorte da agenda. O setor só abre o relatório da própria pasta (js/perfil.js),
      // que já tem a seção de entregas; a cidade abre o relatório de entregas (bairro como alvo, pasta como recorte).
      aoRelatorio: ({ pasta, bairro }) => app.rotas.ir(areasPerfil
        ? { tela: 'relatorios', tipo: 'secretaria', alvo: areasPerfil[0], periodo: '90' }
        : { tela: 'relatorios', tipo: 'entregas', alvo: bairro || '-', periodo: '90', secretarias: pasta ? [pasta] : [] }),
    }) : null;
    // Plano de governo (js/tela-metas.js + js/metas-governo.js). Quem pode o quê: GC.podeNaMetaGoverno (js/perfil.js).
    function agirNaMetaGoverno(acao, d = {}) {
      const mg = GC.metasGoverno;
      if (!mg) return { ok: false, motivo: 'permissao' };
      const meta = d.id ? mg.buscar(d.id) : null;
      const area = meta ? meta.area : d.area;
      if (!GC.podeNaMetaGoverno(acao === 'informar' ? 'informar' : 'editar', area)) return { ok: false, motivo: 'permissao' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : '';
      let r;
      if (acao === 'criar') r = mg.criar({ area: d.area, titulo: d.titulo, prazoMes: d.prazoMes, vinculo: d.vinculo }, quem);
      else if (acao === 'editar') r = mg.editar(d.id, { titulo: d.titulo, prazoMes: d.prazoMes, vinculo: d.vinculo }, quem);
      else if (acao === 'remover') r = mg.remover(d.id, quem);
      else if (acao === 'restaurar') r = mg.restaurar(d.id);
      else if (acao === 'informar') r = mg.informar(d.id, { progressoPct: d.progressoPct, nota: d.nota }, quem);
      else return { ok: false, motivo: 'permissao' };
      if (r.ok) {
        const titulo = meta ? meta.titulo : d.titulo;
        const detalhe = acao === 'informar' ? `${r.informe.progressoPct}%: ${r.informe.nota}` : acao === 'editar' ? Object.keys(r.mudanca).join(', ') : acao === 'criar' ? `prazo ${d.prazoMes}` : '';
        auditar(`meta_governo_${acao}`, { alvo: titulo, areaAlvo: area, detalhe });
      }
      return r;
    }
    const telaMetas = GC.criarTelaMetas && TELAS.metas ? GC.criarTelaMetas(TELAS.metas, {
      aoIr: (r) => app.rotas.ir(r),
      aoAgir: agirNaMetaGoverno,
      pode: (acao, area) => GC.podeNaMetaGoverno(acao, area),
    }) : null;
    // Orçamento e contratos (js/tela-orcamento.js, motor em js/orcamento-gestao.js).
    const telaOrcamento = GC.criarTelaOrcamento && TELAS.orcamento ? GC.criarTelaOrcamento(TELAS.orcamento, { aoIr: (r) => app.rotas.ir(r) }) : null;
    // Revisão de 23/11 (pauta do Paulo Fiuza): agenda de publicação, governança da Maia, fontes e integrações.
    const telaPublicacoes = GC.criarTelaPublicacoes && TELAS.publicacoes ? GC.criarTelaPublicacoes(TELAS.publicacoes) : null;
    const telaGovernanca = GC.criarTelaGovernanca && TELAS.governanca ? GC.criarTelaGovernanca(TELAS.governanca) : null;
    const telaFontes = GC.criarTelaFontes && TELAS.fontes ? GC.criarTelaFontes(TELAS.fontes) : null;
    if (GC.metasGoverno) {
      if (GC.CHAVE_METAS_GOVERNO) window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_METAS_GOVERNO) GC.metasGoverno.recarregar(); });
      GC.metasGoverno.assinar(() => { app.render(); if (telaMetas && tela === 'metas') telaMetas.atualizar(); });
      // Entrega remarcada ou entregue muda o progresso das metas ligadas a ela (antes de o painel redesenhar).
      if (GC.registroEntregas) GC.registroEntregas.ouvir(() => GC.metasGoverno.alinhar());
    }
    if (GC.pactos) GC.pactos.assinar(() => { if (telaMetas && tela === 'metas') telaMetas.atualizar(); });
    // Qualquer mudança no registro (nesta aba ou em outra) muda datas e situações: redesenha o painel e a agenda.
    if (GC.registroEntregas) GC.registroEntregas.ouvir(() => { app.render(); if (telaEntregas && tela === 'entregas') telaEntregas.atualizar(); });
    // Metas pactuadas, plano de ação e notas da reunião. Quem pode o quê: GC.podePactuar (js/perfil.js).
    const PERMISSAO_METAS = { propor: 'propor', aceitar: 'aceitar', plano: 'plano', encerrar: 'plano', nota: 'nota' };
    // Ações do plano (fase 2): permissão por ação do plano (GC.podeNaAcaoPlano: o diretor só nas dele).
    const PERMISSAO_ACAO_PLANO = { acao: 'marcar', feita: 'marcar', desfazer: 'marcar', editar_acao: 'editar', nova_acao: 'editar', cobrar_acao: 'cobrar', responder_acao: 'responder' };
    const AUDITORIA_METAS = {
      propor: 'pacto_propor', aceitar: 'pacto_aceitar', plano: 'plano_criar', acao: 'plano_acao', feita: 'plano_acao', desfazer: 'plano_acao', encerrar: 'plano_encerrar', nota: 'reuniao_nota',
      editar_acao: 'plano_editar', nova_acao: 'plano_nova_acao', cobrar_acao: 'plano_cobrar', responder_acao: 'plano_responder',
    };
    const indicadorAgora = (ind, area) => GC.avaliarIndicadores(GC.contextoIndicadores(store), { area }).find((i) => i.id === ind.id) || null;
    // Metas e plano de ação: cada gesto vira um "Desfazer" (o "desfazer" do próprio plano, marcar como não feita, também).
    function agirNasMetas(acao, d = {}) {
      const ind = d.indId ? GC.CATALOGO_INDICADORES.find((i) => i.id === d.indId) : null;
      return app.comDesfazer(() => agirNasMetasDeVez(acao, d), { rotulo: `${((GC.ACOES_AUDITORIA || {})[AUDITORIA_METAS[acao]] || { nome: 'Mudou a meta' }).nome}${ind ? `: ${ind.nome}` : ''}` });
    }
    function agirNasMetasDeVez(acao, d = {}) {
      const pc = GC.pactos;
      const ind = d.indId ? GC.CATALOGO_INDICADORES.find((i) => i.id === d.indId) : null;
      const area = ind ? ind.area : d.area;
      if (!pc) return { ok: false, motivo: 'permissao' };
      if (PERMISSAO_ACAO_PLANO[acao]) {
        const item = ind && d.acaoId != null ? pc.acao(ind.id, d.acaoId) : null;
        if (!ind || !GC.podeNaAcaoPlano(PERMISSAO_ACAO_PLANO[acao], item, area)) return { ok: false, motivo: 'permissao' };
      } else if (!PERMISSAO_METAS[acao] || !GC.podePactuar(PERMISSAO_METAS[acao], area)) return { ok: false, motivo: 'permissao' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : '';
      const lado = GC.ladoPacto();
      let r;
      if (PERMISSAO_ACAO_PLANO[acao]) {
        if (acao === 'acao') r = pc.marcarAcao(ind.id, d.acaoId, d.feita, { quem });
        else if (acao === 'feita') r = pc.marcarAcao(ind.id, d.acaoId, true, { quem, evidencia: { texto: d.texto, foto: d.foto } });
        else if (acao === 'desfazer') r = pc.marcarAcao(ind.id, d.acaoId, false, { quem });
        else if (acao === 'editar_acao') r = pc.editarAcao(ind.id, d.acaoId, { texto: d.texto, prazo: d.prazo, responsavel: d.responsavel || null }, quem);
        else if (acao === 'nova_acao') r = pc.adicionarAcao(ind.id, { texto: d.texto, prazo: d.prazo, responsavel: d.responsavel || null }, quem);
        else if (acao === 'cobrar_acao') r = pc.cobrarAcao(ind.id, d.acaoId, quem);
        else r = pc.responderCobrancaAcao(ind.id, d.acaoId, { tipo: d.tipo, prazo: d.prazo, texto: d.texto, foto: d.foto }, quem);
        if (r.ok && GC.auditar) {
          const a = r.acao;
          const detalhe = !a ? '' : acao === 'responder_acao' && d.tipo === 'nova_data' ? `${a.texto}: nova data ${d.prazo.split('-').reverse().join('/')} (${d.texto})`
            : (acao === 'feita' || acao === 'responder_acao') && a.evidencia ? `${a.texto}: ${a.evidencia.texto || 'com foto'}${a.evidencia.foto && a.evidencia.texto ? ' (com foto)' : ''}` : a.texto;
          GC.auditar(AUDITORIA_METAS[acao], { alvo: ind.nome, areaAlvo: area, detalhe });
        }
        return r;
      }
      if (acao === 'propor') r = pc.propor(ind, { valor: d.valor, prazo: d.prazo, motivo: d.motivo, marcos: d.marcos }, lado, quem);
      else if (acao === 'aceitar') {
        // Linha de base do ciclo: o valor do indicador no dia do aceite (o mesmo número do cartão).
        const atual = indicadorAgora(ind, area);
        r = pc.aceitar(ind.id, lado, quem, { linhaBase: atual ? atual.valorAtual : null });
      }
      else if (acao === 'plano') {
        // Valor do indicador no dia do plano: o efeito do plano compara com ele (GC.efeitoPlano).
        const atual = indicadorAgora(ind, area);
        r = pc.criarPlano(ind, { causa: d.causa, acoes: d.acoes, valorInicial: atual ? atual.valorAtual : null }, quem);
      }
      else if (acao === 'encerrar') r = pc.encerrarPlano(ind.id, '', quem);
      else r = pc.salvarNota(area, d.texto, quem);
      if (r.ok && GC.auditar) {
        const detalhe = acao === 'propor' ? `${d.valor} até ${d.prazo}: ${d.motivo}` : acao === 'aceitar' ? `${r.pacto.vigente.valor} até ${r.pacto.vigente.prazo}` : '';
        GC.auditar(AUDITORIA_METAS[acao], { alvo: ind ? ind.nome : nomeSecretaria(area), areaAlvo: area, detalhe });
      }
      return r;
    }
    if (GC.pactos) {
      if (GC.CHAVE_PACTOS) window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_PACTOS) GC.pactos.recarregar(); });
      GC.pactos.assinar(() => app.render());
    }

    const telaSecretaria = GC.criarTelaSecretaria ? GC.criarTelaSecretaria($('tela-secretaria'), {
      aoAbrirAlerta: (id) => noPainel(() => app.detalhar(id)),
      aoPerguntar: (texto) => { app.abrirCopiloto(); app.perguntar(texto); },
      aoGerarRelatorio: (a) => app.rotas.ir({ tela: 'relatorios', tipo: 'secretaria', alvo: a, periodo: '30' }),
      aoVerIndicadores: (a) => app.rotas.ir({ tela: 'indicadores', alvo: a }),
      equipesHtml: (a) => (GC.htmlEquipesPasta ? GC.htmlEquipesPasta(store, a) : ''),
      // Metas pactuadas, plano de ação e reunião de resultados (js/pactos.js, js/reuniao.js, js/pactos-ui.js).
      extrasHtml: (a) => {
        if (!GC.pactos || !GC.htmlMetasPasta) return '';
        const inds = GC.avaliarIndicadores(GC.contextoIndicadores(store), { area: a });
        const pauta = GC.pautaReuniao({ area: a, indicadores: inds, pactos: GC.pactos, cobrancas: GC.cobrancas || null, ajudas: GC.ajudas || null, acoesPrefeito: GC.acoesPrefeito || null, ocorrencias: store.todas(), agora: GC.agora() });
        return `<div class="sec-grade"><section class="painel-card sec-metas"><h3>Metas dos indicadores <small>pactuadas com o prefeito</small></h3>${GC.htmlMetasPasta(inds)}</section>
          <section class="painel-card sec-reuniao"><h3>Reunião de resultados</h3>${GC.htmlReuniao(pauta)}</section></div>`;
      },
      aoExtras: (el) => { if (GC.ligarPactos) GC.ligarPactos(el, { executar: agirNasMetas, aoConcluir: () => app.render() }); },
    }) : null;
    const telaSecretarias = GC.criarTelaSecretarias ? GC.criarTelaSecretarias($('tela-secretarias'), {
      aoSelecionarBairro: (id) => app.escolherBairro(id),
      // Chip da secretaria: filtra só esta tela (não mexe no filtro de secretarias do mapa).
      // Fica na rota (#/secretarias/<área>): Voltar desfaz a escolha e o link pode ser enviado.
      aoSelecionarArea: (a) => app.rotas.ir(a ? { tela: 'secretarias', area: a } : { tela: 'secretarias' }),
      aoAbrirSecretaria: (a) => app.rotas.ir({ tela: 'secretaria', area: a }),
      aoRelatorioExecutivo: () => app.rotas.ir({ tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }),
      aoRelatorioSecretaria: (a) => app.rotas.ir({ tela: 'relatorios', tipo: 'secretaria', alvo: a, periodo: '30' }),
      aoAbrirAlerta: (id) => noPainel(() => app.detalhar(id)),
      aoPerguntar: (texto) => { app.abrirCopiloto(); app.perguntar(texto); },
      aoVerResolvida: (r) => { if (r && typeof r.lat === 'number') noPainel(() => app.mapa.mostrarResolvida(r)); },
    }) : null;
    // ---- Personalização (js/tela-personalizar.js; regras em js/personalizacao.js) ----
    // Cada mudança vai para a auditoria e o painel inteiro passa a usar a aparência nova na hora.
    const cfgAparencia = () => GC.personalizacao.config();
    const ACAO_DO_NIVEL = { pessoal: 'aparencia_pessoal', pasta: 'aparencia_pasta', prefeitura: 'aparencia_todos' };
    const nomeModelo = (a) => {
      const m = GC.MODELOS_APARENCIA.find((x) => x.id === a.modelo);
      return `${m ? m.nome : a.modelo}${GC.aparenciaAjustada(a) ? ' (ajustado)' : ''}`;
    };
    // Nome do cabeçalho e título da aba: o da cidade, ou o que o gestor geral definiu.
    // Volta ao que js/app/cabecalho.js escreveu e deixa a personalização trocar o que for dela.
    function reaplicarMarca() {
      const cidade = GC.cidade ? GC.cidade.nome : 'Vila Dourada';
      $('cidade-nome').textContent = cidade;
      document.title = `${cidade} · ${areasPerfil ? GC.perfilRotulo() : 'Golden Atlas'}`;
      GC.personalizacao.aplicar();
    }
    const telaPersonalizar = GC.criarTelaPersonalizar && GC.personalizacao ? GC.criarTelaPersonalizar($('tela-personalizar'), {
      aoAplicar: ({ nivel, aparencia, marca }) => {
        const u = GC.usuarioAtual();
        const cfg = cfgAparencia();
        if (marca) {
          const antes = cfg.marca();
          const rm = cfg.salvarMarca(u, marca);
          if (!rm.ok) return rm;
          const depois = cfg.marca();
          const partes = [];
          if (antes.nome !== depois.nome) partes.push(`Nome: ${depois.nome}`);
          if (antes.nomeCabecalho !== depois.nomeCabecalho) partes.push(`Cabeçalho: ${depois.nomeCabecalho || 'nome da cidade'}`);
          if (antes.nomeOficial !== depois.nomeOficial) partes.push(`Nome oficial: ${depois.nomeOficial || 'o padrão'}`);
          if (antes.slogan !== depois.slogan) partes.push(`Slogan: ${depois.slogan || 'sem slogan'}`);
          if (JSON.stringify(antes.assistente) !== JSON.stringify(depois.assistente)) partes.push(`Assistente: ${depois.assistente.nome}`);
          if (JSON.stringify(antes.entrada) !== JSON.stringify(depois.entrada)) partes.push(`Entrada: fundo ${depois.entrada.estilo}, transição ${depois.entrada.transicao}`);
          if (antes.logo !== depois.logo) partes.push(depois.logo ? 'Logo novo' : 'Logo original');
          if (partes.length) auditar('marca', { alvo: depois.nome, detalhe: partes.join(' · ') });
        }
        const anterior = JSON.stringify(cfg.doNivel(nivel, u));
        const r = cfg.salvarAparencia(nivel, u, aparencia);
        if (!r.ok) return r;
        if (JSON.stringify(cfg.doNivel(nivel, u)) !== anterior) {
          auditar(ACAO_DO_NIVEL[nivel], { alvo: nomeModelo(aparencia), areaAlvo: nivel === 'pasta' ? u.area : null });
        }
        reaplicarMarca();
        return r;
      },
      aoVoltarPadrao: (nivel) => {
        const u = GC.usuarioAtual();
        const r = cfgAparencia().salvarAparencia(nivel, u, null);
        if (r.ok) {
          auditar(ACAO_DO_NIVEL[nivel], { alvo: nivel === 'prefeitura' ? 'Marca original' : 'Volta a seguir o padrão', areaAlvo: nivel === 'pasta' ? u.area : null });
          reaplicarMarca();
        }
        return r;
      },
      // Portal do Cidadão: o que mudou vai no detalhe da auditoria (cores, telefone, canais, assinatura).
      aoAplicarPortal: (dados) => {
        const cfg = cfgAparencia();
        const antes = cfg.portal();
        const r = cfg.salvarPortal(GC.usuarioAtual(), dados);
        if (!r.ok) return r;
        const depois = cfg.portal();
        const partes = [];
        if (JSON.stringify(antes.aparencia) !== JSON.stringify(depois.aparencia) || antes.segue !== depois.segue) partes.push(depois.segue ? 'Cores: as do painel' : `Cores: ${nomeModelo(depois.aparencia)}`);
        if (antes.atendimento.telefone !== depois.atendimento.telefone) partes.push(`Telefone: ${depois.atendimento.telefone}`);
        if (antes.atendimento.whatsapp !== depois.atendimento.whatsapp) partes.push(depois.atendimento.whatsapp ? `WhatsApp: ${depois.atendimento.whatsapp}` : 'Sem WhatsApp');
        if (antes.atendimento.email !== depois.atendimento.email) partes.push(depois.atendimento.email ? `Ouvidoria: ${depois.atendimento.email}` : 'Sem e-mail da ouvidoria');
        if (antes.assinatura !== depois.assinatura) partes.push(depois.assinatura ? 'Com assinatura' : 'Sem assinatura');
        if (partes.length) auditar('portal', { alvo: 'Portal do Cidadão', detalhe: partes.join(' · ') });
        return r;
      },
      aoRestaurarMarca: () => {
        const cfg = cfgAparencia();
        const r = cfg.restaurarMarca(GC.usuarioAtual());
        if (r.ok) {
          auditar('marca', { alvo: cfg.MARCA_PADRAO.nome, detalhe: 'Nome e logo originais' });
          reaplicarMarca();
        }
        return r;
      },
      // Cidade com exemplo de fábrica (Nova Aurora): apaga o que foi salvo e volta ao exemplo.
      aoRestaurarExemplo: () => {
        const cfg = cfgAparencia();
        const r = cfg.restaurarExemplo(GC.usuarioAtual());
        if (r.ok) {
          auditar('marca', { alvo: cfg.marca().nome, detalhe: 'Exemplo da demonstração restaurado' });
          reaplicarMarca();
        }
        return r;
      },
    }) : null;
    const estadoPersonalizar = () => {
      const u = GC.usuarioAtual();
      return {
        usuario: u,
        cfg: cfgAparencia(),
        nomeArea: u && u.area ? nomeSecretaria(u.area) : null,
        cidadeNome: GC.cidade ? GC.cidade.nome : 'Vila Dourada',
        perfilRotulo: GC.perfilRotulo ? GC.perfilRotulo() : 'Gestor geral',
      };
    };

    let tela = null;
    let rotaAnterior = null;
    let aoChegarNoPainel = null; // ação que espera o painel da tela sair da frente do mapa

    // Troca de tela suave: o esqueleto aparece por um instante e o conteúdo entra com fade.
    const esqueleto = $('esqueleto');
    let fimEsqueleto = null;
    function transicao(alvo) {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      clearTimeout(fimEsqueleto);
      esqueleto.hidden = false;
      alvo.classList.add('entrando');
      fimEsqueleto = setTimeout(() => {
        esqueleto.hidden = true;
        alvo.classList.remove('entrando');
      }, 280);
    }

    // Ajustes do "Montar" do relatório (/sem:, /sec:, /grav:, /cmp) mudam a rota, mas não são outra tela: sem transição.
    // A secretaria escolhida na visão geral (#/secretarias/<área>) também não é outra tela.
    // Os filtros da auditoria e do histórico de cobranças no endereço também não.
    const semAjustes = (r) => GC.hashDe(r).replace(/\/(?:sem|sec|grav):[^/]*|\/cmp$/g, '').replace(/^#\/secretarias\/.*/, '#/secretarias').replace(/^#\/auditoria\/.*/, '#/auditoria').replace(/^#\/cobrancas\/.*/, '#/cobrancas').replace(/^#\/usuarios\/.*/, '#/usuarios');

    // Troca de tela com View Transitions (Chrome e Edge): o painel que sai encolhe e some, o que entra
    // sobe e aparece (estilo em css/premium.css, #sobre). Sem suporte, com menos movimento ou indo para os
    // Indicadores (gaveta própria), troca direto com o esqueleto de sempre.
    function mostrarTela(rota) {
      const outra = rotaAnterior && semAjustes(rotaAnterior) !== semAjustes(rota);
      const comVT = outra && typeof document.startViewTransition === 'function' && !document.hidden
        && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)
        && rota.tela !== 'indicadores' && rotaAnterior.tela !== 'indicadores';
      if (!comVT) { trocarTela(rota, false); return; }
      document.documentElement.classList.add('vt-tela');
      // A transição já fez a entrada: sem esta marca, ao tirar o vt-tela a animação do #sobre (sobre-entra)
      // voltava a valer e tocava de novo, e a tela parecia carregar duas vezes. Sai quando o #sobre some.
      $('sobre').classList.add('ja-entrou');
      const vt = document.startViewTransition(() => trocarTela(rota, true));
      // Transição pulada (aba escondida, outra troca no meio): a tela já trocou; só não anima.
      vt.ready.catch(() => {});
      vt.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('vt-tela'));
    }

    function trocarTela(rota, comVT) {
      const { rotas, gavetas, doca } = app;
      // O perfil manda: rota fora dele sem equivalente mostra "Acesso restrito" (o endereço fica); com
      // equivalente, vai para ela (ex.: setor em #/secretarias → a própria secretaria).
      const negado = GC.motivoNegado ? GC.motivoNegado(rota) : null;
      const permitida = negado ? rota : GC.rotaDoPerfil ? GC.rotaDoPerfil(rota) : rota;
      if (GC.hashDe(permitida) !== GC.hashDe(rota)) { rotas.ir(permitida); return; }
      // #/cidadao: o cidadão tem portal próprio (cidadao.html); daqui, o gestor só "vê como cidadão".
      if (rota.tela === 'cidadao') { window.location.href = GC.urlDoPerfil('cidadao'); return; }
      const anterior = tela;
      const mudou = rotaAnterior && semAjustes(rotaAnterior) !== semAjustes(rota);
      rotaAnterior = rota;
      // #/indicadores não é uma tela sobre o mapa: abre a gaveta de baixo na aba "Fichas".
      const ehIndicadores = rota.tela === 'indicadores' && !negado;
      tela = negado || rota.tela === 'nao-encontrada' ? 'aviso' : ehIndicadores ? 'painel' : rota.tela;
      const noMapa = tela === 'painel';
      Object.entries(TELAS).forEach(([nome, el]) => { el.hidden = nome !== tela; });
      $('sobre').hidden = noMapa;
      if (noMapa) $('sobre').classList.remove('ja-entrou');
      corpo.classList.toggle('tela-aberta', !noMapa);
      app.dashboard.marcarTela(rota);
      if (!noMapa) {
        if (GC.fecharDashboard) GC.fecharDashboard(); // o mapa inteiro fica atrás do painel
        if (gavetas.aberta() && gavetas.aberta() !== 'copiloto') gavetas.fechar();
        if (mudou && !comVT) transicao(TELAS[tela]);
      }
      // Voltar ao mapa vindo de outra tela começa do topo (sem herdar a rolagem do dashboard).
      if (noMapa && anterior && anterior !== 'painel') window.scrollTo(0, 0);
      // No celular a gaveta ocupa a tela inteira: trocar de tela fecha até a Maia.
      if (mudou && gavetas.aberta() && window.matchMedia && window.matchMedia('(max-width: 720px)').matches) gavetas.fechar();
      if (noMapa && anterior && anterior !== 'painel') {
        // Espera o painel sair da frente (fade) e só então roda a ação pendente no mapa.
        setTimeout(() => {
          const acao = aoChegarNoPainel;
          aoChegarNoPainel = null;
          if (acao) acao();
        }, 120);
      }
      if (tela === 'secretaria' && telaSecretaria) telaSecretaria.mostrar(store.paginaSecretaria(rota.area));
      if (tela === 'secretarias' && telaSecretarias) telaSecretarias.mostrar(estadoSecretarias());
      if (tela === 'relatorios') telaRelatorios.mostrar(rota, relatorioDe(rota));
      if (tela === 'cruzamento' && telaCruzamento) telaCruzamento.mostrar(rota, ctxCruzamento());
      if (tela === 'sazonal' && rota.config && telaSazonalConfig) telaSazonalConfig.mostrar(rota);
      else if (tela === 'sazonal' && telaSazonal) telaSazonal.mostrar(rota, { areas: areasPerfil });
      if (tela === 'entregas' && telaEntregas) telaEntregas.mostrar(rota, { areas: areasPerfil });
      if (tela === 'metas' && telaMetas) telaMetas.mostrar(rota, { areas: areasPerfil });
      if (tela === 'orcamento' && telaOrcamento) telaOrcamento.mostrar(rota, { areas: areasPerfil });
      if (tela === 'tarefas' && telaTarefas) telaTarefas.mostrar(rota);
      if (tela === 'publicacoes' && telaPublicacoes) telaPublicacoes.mostrar(rota);
      if (tela === 'governanca' && telaGovernanca) telaGovernanca.mostrar(rota);
      if (tela === 'fontes' && telaFontes) telaFontes.mostrar(rota);
      // Ao entrar na Central: guarda a visita anterior (para as novidades) e marca esta como a última.
      if (tela === 'alertas' && anterior !== 'alertas') { visitaCentral = lerVisita(); gravarVisita(GC.agora()); }
      if (tela === 'alertas') telaAlertas.mostrar(estadoAlertas());
      if (tela === 'dados') telaDados.mostrar(rota.tabela, estadoDados());
      if (tela === 'crise' && rota.modelos && telaModelos) telaModelos.mostrar(rota);
      else if (tela === 'crise') telaCrise.mostrar(estadoCrise(rota));
      if (tela === 'conta' && telaConta) telaConta.mostrar(estadoConta());
      if (tela === 'auditoria' && telaAuditoria) telaAuditoria.mostrar(estadoAuditoria(), rota);
      if (tela === 'cobrancas' && telaCobrancas) telaCobrancas.mostrar(estadoCobrancas(), rota);
      if (tela === 'usuarios' && telaUsuarios) telaUsuarios.mostrar(estadoUsuarios(rota));
      if (tela === 'regras' && telaRegras) telaRegras.mostrar(rota, estadoRegras());
      if (tela === 'prazos' && telaPrazos) telaPrazos.mostrar(estadoPrazos());
      if (tela === 'personalizar' && telaPersonalizar) telaPersonalizar.mostrar(estadoPersonalizar());
      if (tela === 'aviso' && telaAviso) {
        if (negado) {
          telaAviso.mostrar(Object.assign({ tipo: 'negado', perfilRotulo: `Gestor do setor · ${GC.perfilRotulo()}`, inicio: { tela: 'secretaria', area: areasPerfil[0] } }, negado));
          if (ultimoNegado !== GC.hashDe(rota)) auditar('acesso_negado', { alvo: negado.tela, detalhe: GC.hashDe(rota) });
        } else telaAviso.mostrar({ tipo: 'nao-encontrada', caminho: rota.caminho });
      }
      ultimoNegado = negado ? GC.hashDe(rota) : null;
      if (ehIndicadores) {
        doca.abrirDashboard(true);
        doca.escolherAba('metas');
        doca.telaIndicadores.mostrar(rota.alvo, doca.estadoIndicadores());
      } else if (doca.dashAberto() && doca.abaDash() === 'metas' && !app.ehCidadao) doca.escolherAba('widgets'); // voltar (#/painel) com a gaveta aberta: Painel
      // Trocar a secretaria escolhida na visão geral mantém a rolagem.
      // Mudar um filtro da auditoria (vai para o endereço) também, e abrir ou fechar a ficha de uma meta do plano de governo.
      if (TELAS[tela] && !(tela === 'secretarias' && anterior === 'secretarias') && !(tela === 'auditoria' && anterior === 'auditoria') && !(tela === 'metas' && anterior === 'metas')) TELAS[tela].scrollTop = 0;
    }
    const estadoSecretarias = () => {
      const a = app.rotas.atual().area || null;
      const bs = app.filtroBairros();
      return {
        bairro: app.bairroUnico(),
        bairros: bs,
        area: a,
        desempenho: store.desempenho(bs, a ? [a] : null),
        pulsos: store.pulsos(bs),
        pagina: a ? store.paginaSecretaria(a) : null,
        bairrosDaArea: a ? store.bairrosDaSecretaria(a) : [],
      };
    };
    $('sobre-fechar').onclick = () => app.rotas.ir({ tela: 'painel' });
    // Expandir: a tela cobre o cabeçalho e vai de ponta a ponta (o menu lateral continua). Vale para todas as telas.
    if (GC.expandir && $('sobre-expandir')) {
      const sobre = $('sobre');
      const aplicarExpandir = () => {
        sobre.classList.toggle('expandida', GC.expandir.ligado('tela'));
        GC.expandir.marcarBotoes(sobre, 'tela');
      };
      aplicarExpandir();
      $('sobre-expandir').onclick = () => { GC.expandir.alternar('tela'); aplicarExpandir(); };
    }
    // Clique no mapa esmaecido também volta.
    document.querySelector('.esmaecer').onclick = () => app.rotas.ir({ tela: 'painel' });

    // Ações que precisam do mapa: fecha o painel da tela e age depois.
    function noPainel(acao) {
      if (tela === 'painel') return acao();
      aoChegarNoPainel = acao;
      app.rotas.ir({ tela: 'painel' });
    }

    // A cada render: a tela aberta acompanha os dados.
    function atualizar() {
      const rotas = app.rotas;
      if (tela === 'secretaria' && telaSecretaria) telaSecretaria.atualizar(store.paginaSecretaria(rotas.atual().area));
      if (tela === 'secretarias' && telaSecretarias) telaSecretarias.atualizar(estadoSecretarias());
      if (tela === 'relatorios') telaRelatorios.atualizar(relatorioDe(rotas.atual()));
      if (tela === 'cruzamento' && telaCruzamento) telaCruzamento.atualizar(ctxCruzamento());
      if (tela === 'alertas') telaAlertas.atualizar(estadoAlertas());
      if (tela === 'regras' && telaRegras) telaRegras.atualizar(estadoRegras());
      if (tela === 'crise' && rotas.atual().modelos && telaModelos) telaModelos.atualizar(rotas.atual());
      if (tela === 'sazonal' && rotas.atual().config && telaSazonalConfig) telaSazonalConfig.atualizar(rotas.atual());
      if (tela === 'tarefas' && telaTarefas) telaTarefas.atualizar();
      if (tela === 'orcamento' && telaOrcamento) telaOrcamento.atualizar();
      if (tela === 'dados') telaDados.atualizar(estadoDados());
      if (tela === 'cobrancas' && telaCobrancas) telaCobrancas.atualizar(estadoCobrancas());
      atualizarCrise();
    }

    // O que a Maia recebe da tela aberta (js/app/maia-telas.js): a sala de crise aberta ou o relatório da rota.
    function focoMaia() {
      const rota = app.rotas.atual();
      if (tela === 'crise') {
        const e = estadoCrise(rota);
        if (e.atual) return { tipo: 'gabinete', resumo: e.atual, rascunhos: e.rascunhos };
      }
      if (tela === 'relatorios' && rota && rota.tipo) return { tipo: 'relatorio', rel: relatorioDe(rota) };
      if (tela === 'cruzamento' && telaCruzamento && telaCruzamento.resultado()) return { tipo: 'cruzamento', res: telaCruzamento.resultado() };
      return null;
    }

    return { tela: () => tela, mostrarTela, noPainel, atualizar, gabinetes, gabineteDaPasta, irParaGabinete, abrirPreventivo, sair, focoMaia };
  };
})(window.GC = window.GC || {});
