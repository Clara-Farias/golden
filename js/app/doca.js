(function (GC) {
  // Doca na base do mapa: Resumo do dia, Resumo da semana e a gaveta de Indicadores (aba Painel com os widgets
  // e aba Fichas, rota #/indicadores). Um painel da doca aberto por vez.
  // Recebe o app (js/app.js) e devolve o que o resto usa. Monta depois dos widgets (a aba consulta a edição deles).
  GC.criarAppDoca = function (app) {
    const { $, corpo, store, perfil, areasPerfil, ehCidadao } = app;

    // Item da caixa de entrada (Resumo do dia e Resumo de hoje): abre a ocorrência, a demanda, a sala ou a aba certa.
    function abrirItemCaixa(it) {
      if (it.tarefaId) return app.rotas.ir({ tela: 'tarefas', id: it.tarefaId }); // a tela leva até a demanda (a do gabinete, até a sala)
      if (it.gabineteId) return app.rotas.ir({ tela: 'crise', id: it.gabineteId }); // a sala pediu alguém da pasta
      if (it.indicadorId) return app.rotas.ir({ tela: 'secretaria', area: perfil.area }); // metas e plano ficam na página da pasta
      if (it.naAba && store.buscar(it.ocorrenciaId)) return app.detalhar(it.ocorrenciaId);
      // Sem a ocorrência nesta aba: a aba Cobranças tem as cobranças e os pedidos de ajuda.
      app.gavetas.abrir('atencao');
      app.decisao.mostrarAba('cobrancas');
    }

    // ---- Resumo do dia: cartão no canto do mapa (alertas, chuva, melhorou/piorou, decisões, gabinete) ----
    const resumoDia = GC.criarResumoDia($('resumo-dia'), {
      // Um painel da doca por vez: abrir o resumo fecha o dashboard e o resumo da semana.
      aoAlternar: (aberto) => { if (aberto) { abrirDashboard(false); resumoSemana.alternar(true); desdeVisita.alternar(true); fecharEssencial(); } },
      aoVerAlertas: () => app.gavetas.abrir('atencao'),
      aoAbrirAlerta: (id) => app.detalhar(id),
      // Item da caixa de entrada: abre a ocorrência (blocos da cobrança e da operação); sem ela nesta aba, a aba Cobranças.
      aoItemCaixa: (it) => abrirItemCaixa(it),
      aoAgir: (id, tipo) => app.agir(id, tipo),
      aoGabinete: (g) => (g.tipo === 'ativo' ? app.rotas.ir({ tela: 'crise', id: g.id }) : app.telas.abrirPreventivo(g.areaRiscoId)),
      aoDestaque: (d) => {
        if (d.tipo === 'alertas') return app.gavetas.abrir('atencao');
        if (d.tipo === 'caixa') return null; // a lista está logo abaixo
        if (d.tipo === 'metas') return app.rotas.ir({ tela: 'secretaria', area: d.area });
        if (d.tipo === 'antecipa') return d.alvo && store.buscar(d.alvo) ? app.detalhar(d.alvo) : null;
        if (d.tipo === 'chuva') {
          $('toggle-risco').checked = true; app.marcarCamadas();
          if (d.alvoRisco) app.mapa.focarRisco(d.alvoRisco);
          return;
        }
        if (d.area) app.rotas.ir({ tela: 'secretaria', area: d.area });
      },
    }, { botao: $('btn-resumo-dia'), contador: $('resumo-dia-n') });
    // Os dados do cartão também vão para a Maia ("Por onde começar hoje?", js/app/maia-telas.js).
    const atualizarResumoDia = () => resumoDia.atualizar(dadosResumoDia());
    const dadosResumoDia = () => GC.resumoDoDia({
      // Mesmo recorte do mapa e da gaveta de Alertas (secretaria, bairro e número clicado no topo).
      atencao: store.atencao(app.filtroAreas(), app.bairros(), app.recorte()).todas,
      tendencias: GC.data.tendencias,
      risco: GC.risco.resumo(store.ocorrencias()),
      gabinetesAtivos: app.telas.gabinetes.ativos().filter(app.telas.gabineteDaPasta),
      areas: app.filtroAreas(),
      bairros: app.bairros().slice(),
      agora: GC.agora(),
      sugerirGabinete: GC.pode('crise.abrir', null, { perfil }),
      // Gestor do setor: a caixa de entrada "Para fazer hoje" (js/caixa-entrada.js). Todos: o que vai estourar em 2 h.
      caixa: GC.visaoDe(perfil) === 'pasta' && GC.caixaDeEntrada
        ? GC.caixaDeEntrada({
          ocorrencias: store.ocorrencias(), cobrancas: GC.cobrancas || null, ajudas: GC.ajudas || null, pactos: GC.pactos || null, acoesPrefeito: GC.acoesPrefeito || null,
          tarefas: GC.tarefasUnificadas ? GC.tarefasUnificadas({ tarefas: GC.tarefas, gabinetes: app.telas.gabinetes }) : [],
          indicadores: GC.pactos ? estadoIndicadores().indicadores : [], usuario: GC.usuarioAtual ? GC.usuarioAtual() : null, area: perfil.area, agora: GC.agora(),
          // Em crise (com a pasta envolvida), as demandas do gabinete vêm antes de tudo (js/modo-crise.js).
          crise: !!(app.modoCrise && GC.criseMudaOrdem && GC.criseMudaOrdem(app.modoCrise.modo())),
          gabinetes: app.telas.gabinetes.ativos(),
        }) : null,
      // Prefeito: metas propostas pelas secretarias esperando ele (js/pactos.js).
      metasParaPactuar: GC.ladoPacto(perfil) === 'prefeito' && GC.pactos ? GC.pactos.pendentes('prefeito') : [],
      // Prefeito: metas cujo prazo venceu (apuradas) e que ninguém propôs para o próximo ciclo.
      metasVencidas: GC.ladoPacto(perfil) === 'prefeito' && GC.pactos && GC.pactos.vencidasSemNovoPacto ? GC.pactos.vencidasSemNovoPacto() : [],
      vaoEstourar: GC.vaoEstourar ? GC.vaoEstourar(store.ocorrencias(app.filtroAreas(), app.bairros(), app.recorte()), GC.agora()) : [],
    });
    // O secretário entra no painel pela caixa: com algo pendente, o Resumo do dia já abre aberto.
    if (GC.visaoDe(perfil) === 'pasta') {
      setTimeout(() => { const d = dadosResumoDia(); if (d.caixa && d.caixa.total && !dashAberto) { resumoDia.alternar(false); atualizarResumoDia(); } }, 0);
    }
    // ---- Resumo da semana: na doca, ao lado do Resumo do dia (mesmo lugar, um por vez) ----
    const resumoSemana = GC.criarResumoSemana($('resumo-semana'), {
      aoAlternar: (aberto) => { if (aberto) { abrirDashboard(false); resumoDia.alternar(true); desdeVisita.alternar(true); fecharEssencial(); atualizarResumoSemana(); } },
      aoAbrirSecretaria: (area) => app.rotas.ir({ tela: 'secretaria', area }),
      aoVerEntregas: (id) => {
        $('toggle-conquistas').checked = true; app.marcarCamadas();
        app.mapa.alternarConquistas(true);
        resumoSemana.alternar(true);
        app.noPainel(() => { subirAoMapa(); if (id) app.mapa.focarConquista(id); else app.mapa.visaoGeral(); });
      },
      aoPerguntar: (texto) => { app.abrirCopiloto(); app.perguntar(texto); },
    }, { botao: $('btn-resumo-semana') });
    function atualizarResumoSemana() {
      resumoSemana.atualizar(GC.resumoDaSemana({
        tendencias: GC.data.tendencias,
        conquistas: GC.data.conquistas,
        desempenho: GC.data.desempenho30d,
        areas: app.filtroAreas(),
        agora: GC.agora(),
      }));
    }

    // ---- Desde a sua última visita (js/desde-visita.js): o que mudou enquanto a pessoa esteve fora ----
    // A visita anterior é lida uma vez, ao abrir o painel; a de agora é gravada já (e de novo ao sair da página),
    // para a próxima visita comparar com esta. "Marcar tudo como visto" recomeça a contagem agora.
    const usuarioVisita = GC.usuarioAtual ? GC.usuarioAtual() : null;
    const visitaReg = GC.registroVisitaMapa({ cidade: GC.cidade ? GC.cidade.id : 'media', usuario: usuarioVisita ? usuarioVisita.id : 'demo' });
    const visitaAnterior = visitaReg.ler();
    let desdeVisitaT = visitaAnterior ? visitaAnterior.t : null;
    let fotoVisita = visitaAnterior ? visitaAnterior.ind : null;
    const fotoAgora = () => GC.fotoIndicadores(estadoIndicadores().indicadores);
    const desdeVisita = GC.criarDesdeVisita($('desde-visita'), {
      aoAlternar: (aberto) => { if (aberto) { abrirDashboard(false); resumoDia.alternar(true); resumoSemana.alternar(true); fecharEssencial(); atualizarDesdeVisita(); } },
      aoAbrir: (id) => { if (store.buscar(id)) app.detalhar(id); },
      aoIndicador: (id) => app.rotas.ir({ tela: 'indicadores', alvo: id }),
      // Bairros com novas: dado agregado (contagem por bairro), como o data-destaque dos widgets.
      aoVerBairros: (bairros) => app.noPainel(() => {
        subirAoMapa();
        desdeVisita.alternar(true); // o cartão sai da frente dos bairros pintados
        app.mapa.mostrarCamada({ tipo: 'destaque', bairros, legenda: 'Bairros com ocorrências novas desde a sua última visita' });
      }),
      aoVisto: () => {
        desdeVisitaT = GC.agora();
        fotoVisita = fotoAgora();
        visitaReg.gravar(desdeVisitaT, fotoVisita);
        atualizarDesdeVisita();
      },
    }, { botao: $('btn-desde-visita'), contador: $('desde-visita-n') });
    const noRecorte = (o) => (!areasPerfil || areasPerfil.includes(o.area)) && GC.noFiltroGlobal(o, app.estadoFiltros());
    const dadosDesdeVisita = () => GC.desdeAUltimaVisita({
      // Mesmo recorte do mapa (filtros e pasta do perfil), com as resolvidas.
      ocorrencias: store.todas().filter(noRecorte),
      resolvidasRecentes: (GC.data.resolvidasRecentes || []).filter(noRecorte),
      indicadores: estadoIndicadores().indicadores,
      fotoIndicadores: fotoVisita,
      desde: desdeVisitaT,
      agora: GC.agora(),
    });
    function atualizarDesdeVisita() { if (!ehCidadao) desdeVisita.atualizar(dadosDesdeVisita()); }

    // ---- Resumo de hoje (visão resumida, js/resumo-essencial.js): abre sozinho e fica até a pessoa fechar ----
    const resumoEss = !ehCidadao && GC.criarResumoEssencial && GC.visaoSimples && GC.visaoSimples.ligada() && $('resumo-essencial')
      ? GC.criarResumoEssencial($('resumo-essencial'), {
        aoAlternar: (aberto) => { if (aberto) { abrirDashboard(false); resumoDia.alternar(true); resumoSemana.alternar(true); desdeVisita.alternar(true); atualizarEssencial(); } },
        aoAgir: (id, tipo) => app.agir(id, tipo),
        aoAtualizar: () => app.render(),
        aoVerNoMapa: (id) => { resumoEss.alternar(true); app.focar(id); },
        aoIr: (rota) => app.rotas.ir(rota),
        aoAlertas: () => app.gavetas.abrir('atencao'),
        aoItemCaixa: (it) => abrirItemCaixa(it),
        aoPerguntar: (texto) => { app.abrirCopiloto(); app.perguntar(texto); },
      }, { botao: $('btn-resumo-essencial') }) : null;
    function fecharEssencial() { if (resumoEss && resumoEss.aberto()) resumoEss.alternar(true); }
    function atualizarEssencial() {
      if (!resumoEss) return;
      resumoEss.atualizar(GC.resumoEssencial({
        store, metas: GC.metasGoverno ? GC.metasGoverno.lista().filter((m) => !areasPerfil || areasPerfil.includes(m.area)) : [],
        orcamento: GC.orcamentoGestao ? GC.orcamentoGestao.resumo({ areas: areasPerfil || null }) : null, agora: GC.agora(),
        // Gestor do setor e diretor: a pasta e a caixa de entrada (o "para fazer hoje" de quem responde).
        areas: areasPerfil || null,
        caixa: areasPerfil ? dadosResumoDia().caixa : null,
        tarefas: GC.tarefas ? GC.tarefas.lista() : [],
      }));
    }
    if (resumoEss) setTimeout(() => { if (!dashAberto) { resumoEss.alternar(false); atualizarEssencial(); } }, 0);
    if (ehCidadao) $('btn-desde-visita').hidden = true;
    else {
      setTimeout(() => {
        visitaReg.gravar(GC.agora(), fotoAgora());
        const d = dadosDesdeVisita();
        desdeVisita.atualizar(d);
        // Abre sozinho quando há novidade de verdade (primeira visita ou fora há mais de meia hora) e nenhum
        // outro painel da doca abriu antes (a caixa do secretário tem a vez).
        const longe = !visitaAnterior || GC.agora() - visitaAnterior.t >= GC.AUSENCIA_ABRE_DESDE_VISITA_MIN * 60000;
        if (d.total && longe && !dashAberto && !resumoDia.aberto() && !resumoSemana.aberto() && !resumoEss) desdeVisita.alternar(false);
      }, 0);
      window.addEventListener('pagehide', () => visitaReg.gravar(GC.agora(), fotoAgora()));
    }

    // ---- Indicadores: catálogo com metas por porte de cidade (js/indicadores.js) ----
    const estadoIndicadores = () => ({
      cidade: (GC.cidade && GC.cidade.nome) || 'Vila Dourada',
      porte: (GC.cidade && GC.cidade.id) || 'media',
      indicadores: GC.avaliarIndicadores(GC.contextoIndicadores(store, { preventivos: app.telas.gabinetes.ativos().map((g) => g.areaRiscoId).filter(Boolean) }), { area: areasPerfil ? areasPerfil[0] : null, publico: ehCidadao }),
      publico: ehCidadao,
      titulo: areasPerfil ? 'Indicadores da pasta' : null,
    });
    const telaIndicadores = GC.criarTelaIndicadores($('tela-indicadores'), {
      aoAbrir: (id) => app.rotas.ir({ tela: 'indicadores', alvo: id }),
      aoSecretaria: (area) => app.rotas.ir({ tela: 'secretaria', area }),
      aoPerguntar: (ind) => { app.abrirCopiloto(); app.perguntar(GC.perguntaIndicador(ind)); },
    });

    // ---- gaveta de Indicadores: abre só no clique ("Indicadores" na doca) e cobre a tela inteira ----
    // É a única porta dos indicadores: aba Painel (widgets) e aba Fichas (catálogo, rota #/indicadores).
    // A rodinha do mouse não rola mais a página: sobre o mapa, ela dá zoom.
    const palco = $('palco');
    const painelDash = $('dashboard');
    const btnDash = $('ir-dashboard');
    let dashAberto = false;
    let esconderDash = null;
    // O cidadão não tem widgets: a gaveta dele é só o catálogo público.
    let abaDash = ehCidadao ? 'metas' : 'widgets';
    // O seletor de visualização (#vistas) muda para o cabeçalho da gaveta enquanto ela está aberta: a mesma
    // peça (lista, salvar, gerenciar), só em outro lugar. Fechada a gaveta, volta para cima do mapa.
    const vistasEl = $('vistas');
    function moverVistas(naGaveta) {
      if (naGaveta) painelDash.querySelector('.dash-abas').after(vistasEl);
      else $('mapa-controles').before(vistasEl);
    }
    function escolherAba(aba) {
      if (ehCidadao) aba = 'metas';
      abaDash = aba;
      painelDash.dataset.aba = aba; // na aba Indicadores o seletor de visualização some (não muda nada lá)
      painelDash.querySelectorAll('.dash-aba').forEach((b) => {
        const sel = b.dataset.aba === aba;
        b.setAttribute('aria-selected', String(sel));
        b.tabIndex = sel ? 0 : -1;
        b.classList.toggle('ativo', sel);
      });
      $('widgets').hidden = aba !== 'widgets';
      $('tela-indicadores').hidden = aba !== 'metas';
      $('dash-editar').hidden = aba !== 'widgets' || ehCidadao;
      if (aba !== 'widgets' && app.widgetsUI.editando()) app.widgetsUI.alternarEdicao(false);
    }
    escolherAba(abaDash);
    // Trocar de aba: a aba Metas tem rota própria (#/indicadores), o Painel fica em #/painel.
    function irParaAba(aba) {
      if (aba === 'metas') app.rotas.ir({ tela: 'indicadores', alvo: null });
      else { if (app.rotas.atual().tela === 'indicadores') app.rotas.ir({ tela: 'painel' }); escolherAba('widgets'); }
      painelDash.scrollTop = 0;
    }
    painelDash.querySelectorAll('.dash-aba').forEach((b) => {
      b.onclick = () => irParaAba(b.dataset.aba);
      b.onkeydown = (ev) => {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        const outra = painelDash.querySelector(`.dash-aba:not([data-aba="${b.dataset.aba}"])`);
        irParaAba(outra.dataset.aba);
        outra.focus();
      };
    });
    function aplicarPalco() {
      // A gaveta cobre o mapa inteiro (ele não encolhe mais). A linha do tempo fecha e volta ao vivo, para o mapa
      // não ficar no passado escondido atrás da gaveta.
      palco.style.height = `${window.innerHeight}px`;
      if (dashAberto && app.linhaTempo.aberta()) app.linhaTempo.fechar();
    }
    function abrirDashboard(valor = !dashAberto) {
      if (valor === dashAberto) return;
      dashAberto = valor;
      clearTimeout(esconderDash);
      moverVistas(valor);
      if (valor) {
        resumoDia.alternar(true);
        resumoSemana.alternar(true);
        desdeVisita.alternar(true);
        fecharEssencial();
        painelDash.hidden = false;
        painelDash.scrollTop = 0;
        requestAnimationFrame(() => corpo.classList.add('dash-aberto'));
      } else {
        if (app.widgetsUI.editando()) app.widgetsUI.alternarEdicao(false);
        corpo.classList.remove('dash-aberto');
        esconderDash = setTimeout(() => { if (!dashAberto) painelDash.hidden = true; }, 300);
      }
      btnDash.setAttribute('aria-expanded', String(valor));
      aplicarPalco();
      if (valor) $('dash-fechar').focus({ preventScroll: true });
    }
    // Fechar a gaveta na aba Metas também tira o #/indicadores do endereço.
    function fecharDashboard() {
      abrirDashboard(false);
      if (app.rotas.atual().tela === 'indicadores') app.rotas.ir({ tela: 'painel' });
    }
    GC.fecharDashboard = () => abrirDashboard(false); // telão e tour voltam ao mapa inteiro
    window.addEventListener('resize', aplicarPalco);
    aplicarPalco();
    function subirAoMapa() { if (dashAberto) fecharDashboard(); }
    // Reabre na última aba usada (a aba Metas pela rota, para o endereço acompanhar).
    btnDash.onclick = () => { if (abaDash === 'metas') app.rotas.ir({ tela: 'indicadores', alvo: null }); else abrirDashboard(true); };
    $('dash-fechar').onclick = () => { fecharDashboard(); btnDash.focus(); };
    // Clique fora do resumo aberto (e fora do botão dele) fecha o cartão.
    document.addEventListener('click', (ev) => {
      // Alvo que saiu da página no próprio clique (o cartão se redesenhou) também conta como dentro.
      if (!ev.target.isConnected || $('doca').contains(ev.target) || $('gavetas').contains(ev.target)) return;
      if (resumoDia.aberto()) resumoDia.alternar(true);
      if (resumoSemana.aberto()) resumoSemana.alternar(true);
      if (desdeVisita.aberto()) desdeVisita.alternar(true);
    });

    // A cada render: indicadores (se a aba está à vista) e os dois resumos.
    function atualizar() {
      if (!$('tela-indicadores').hidden) telaIndicadores.atualizar(estadoIndicadores());
      atualizarResumoDia();
      atualizarResumoSemana();
      atualizarDesdeVisita();
      atualizarEssencial();
    }

    return {
      atualizar, abrirDashboard, fecharDashboard, escolherAba, subirAoMapa, estadoIndicadores, telaIndicadores,
      resumoDia, resumoSemana, desdeVisita, btnDash, dadosResumoDia, resumoEssencial: () => resumoEss,
      dashAberto: () => dashAberto,
      abaDash: () => abaDash,
    };
  };
})(window.GC = window.GC || {});
