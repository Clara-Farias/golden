(function (GC) {
  const PALCO_COMPACTO = 0.6; // abaixo disso, somem a faixa de atenção e a legenda

  // Sem mapa (biblioteca não carregou ou navegador sem WebGL): mesmo formato do mapa, sem efeito.
  // Proxy: qualquer função nova do mapa já vira "nada" aqui, sem precisar listar (era um ponto de conflito).
  // Só as que devolvem valor ficam explícitas; "then" fica de fora para o objeto não parecer uma Promise.
  function mapaOffline(el) {
    el.innerHTML = '<div class="mapa-offline">🗺 Mapa indisponível (sem conexão ou navegador sem suporte a mapas) — o restante do painel continua funcionando.</div>';
    const nada = () => {};
    const especiais = { sobrevoar: async () => false, temAlgoAberto: () => false };
    return new Proxy(especiais, {
      get: (alvo, nome) => (nome in alvo ? alvo[nome] : typeof nome === 'symbol' || nome === 'then' ? undefined : nada),
    });
  }

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  // Visualizações salvas no navegador (falha silenciosa sem armazenamento). Uma chave por perfil: o que o
  // gestor do setor escolhe não muda o painel do prefeito (o gestor geral continua com a chave de sempre).
  const p0 = GC.perfil || { id: 'prefeito' };
  const CHAVE_VISTAS = p0.id === 'prefeito' ? 'gc.vistas' : `gc.vistas.${p0.id}${p0.area ? `.${p0.area}` : ''}`;
  const armazenamentoVistas = {
    ler() { try { return JSON.parse(localStorage.getItem(CHAVE_VISTAS)); } catch (e) { return null; } },
    gravar(o) { try { localStorage.setItem(CHAVE_VISTAS, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
  };
  // Widgets fixados da Maia: uma chave por cidade (os bairros mudam) e por perfil, como as visualizações.
  const CHAVE_WIDGETS_IA = `gc.widgets-ia.${GC.cidade ? GC.cidade.id : 'media'}${CHAVE_VISTAS.slice('gc.vistas'.length)}`;
  const armazenamentoWidgetsIA = {
    ler() { try { return JSON.parse(localStorage.getItem(CHAVE_WIDGETS_IA)); } catch (e) { return null; } },
    gravar(o) { try { localStorage.setItem(CHAVE_WIDGETS_IA, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
  };

  // Conversas com a Maia (js/conversas.js): por cidade e perfil, como os widgets da Maia.
  const CHAVE_CONVERSAS = `gc.maia.conversas.${GC.cidade ? GC.cidade.id : 'media'}${CHAVE_VISTAS.slice('gc.vistas'.length)}`;
  const armazenamentoConversas = {
    ler() { try { return JSON.parse(localStorage.getItem(CHAVE_CONVERSAS)); } catch (e) { return null; } },
    gravar(o) { try { localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (GC.redirecionando) return; // perfil Cidadão: indo para o portal (js/perfil.js), nada do painel monta
    const $ = (id) => document.getElementById(id);
    const corpo = document.body;
    // Perfil de acesso (js/perfil.js): gestor geral, gestor do setor (travado na pasta) ou cidadão.
    const perfil = GC.perfil || { id: 'prefeito', area: null };
    const areasPerfil = GC.areasDoPerfil ? GC.areasDoPerfil() : null;
    const ehCidadao = GC.visaoDe(perfil) === 'portal';
    const daPasta = (o) => !areasPerfil || areasPerfil.includes(o.area);
    corpo.classList.add(`perfil-${perfil.id}`);
    const store = GC.criarStore(GC.data);
    GC.storeAtual = store; // os arquivos da Maia (js/ia/arquivos.js) montam com os mesmos dados das telas
    const btnLimpar = $('btn-limpar-camada');

    // ---- estado único: filtros + widgets + mapa (é o que uma visualização guarda) ----
    const areas = new Set(); // secretarias (acumulativas)
    const severidades = new Set(); // gravidades (nenhuma = todas)
    let bairros = []; // bairros em foco (vários pelo filtro; o clique no mapa foca um só)
    const bairroUnico = () => (bairros.length === 1 ? bairros[0] : null); // para o que só sabe falar de um bairro
    const filtroBairros = () => (bairros.length ? bairros.slice() : null); // null = cidade inteira
    let recorte = null; // situação: criticas | estourado | andamento
    // Antes de qualquer visualização ser aplicada: os widgets da Maia precisam estar no catálogo.
    const widgetsIA = GC.criarWidgetsIA ? GC.criarWidgetsIA(armazenamentoWidgetsIA) : null;
    let widgetsCfg = { ativos: (GC.WIDGETS_PADRAO || GC.WIDGETS.map((w) => w.id)).slice(), pulsos: null };
    const filtroAreas = () => [...areas];
    // Filtros por atributo da ocorrência: pessoas afetadas, tempo aberta, origem do aviso, várias secretarias.
    const SEM_ATRIBUTOS = { afetados: [], tempos: [], origens: [], multi: false, tratamento: null };
    let atributos = Object.assign({}, SEM_ATRIBUTOS);
    const estadoFiltros = () => Object.assign({ recorte, severidades: [...severidades], areas: filtroAreas(), bairros: bairros.slice() }, atributos);
    // O mapa: camadas ligadas e legenda aberta (o enquadramento só entra quando alguém o guarda de propósito).
    const estadoMapa = () => ({ camadas: camadas.estado(), legenda: filtrosUI.legendaAberta() });
    const estadoAtual = () => ({ filtros: estadoFiltros(), widgets: widgetsCfg, mapa: estadoMapa() });
    // Gravidade + atributos (secretaria, bairro e situação já vêm filtrados do store).
    const porSeveridade = (lista) => GC.filtrarPorAtributos(lista, estadoFiltros());
    // Valor calculado na primeira vez que alguém pede (e guardado para os próximos).
    const umaVez = (f) => { let feito = false; let v; return () => { if (!feito) { feito = true; v = f(); } return v; }; };
    const vistas = GC.criarVistas(armazenamentoVistas, { prontas: GC.vistasProntasDoPerfil ? GC.vistasProntasDoPerfil() : null });
    // Camadas e eventos que o perfil enxerga (gestor do setor: só a pasta dele; os outros, tudo).
    const podeCamada = (toggleId) => !GC.podeCamada || GC.podeCamada(toggleId);
    const doPerfil = (o) => !GC.ocorrenciaDoPerfil || GC.ocorrenciaDoPerfil(o);

    const contexto = () => ({ area: filtroAreas(), areasPerfil, bairro: bairroUnico(), bairros: bairros.slice(), ocorrencias: store.ocorrencias(), desempenho: store.desempenho(filtroBairros()) });

    const nomeSecretaria = (area) => (GC.data.areas.find((a) => a.id === area) || { secretaria: { nome: 'Secretaria' } }).secretaria.nome;

    // ---- o "app" que os módulos de js/app/ recebem: estado e ações compartilhadas ----
    // Os getters leem na hora da chamada: um módulo pode montar antes de outro que ele chama.
    let modoCrise = null; // montado depois do cabeçalho; o render roda antes disso (sem modo até lá)
    const app = {
      $, corpo, perfil, areasPerfil, ehCidadao, daPasta, doPerfil, podeCamada, store, nomeSecretaria,
      bairros: () => bairros, recorte: () => recorte, bairroUnico, filtroBairros, filtroAreas, estadoFiltros, porSeveridade, contexto,
      render, agir, detalhar, focar, perguntar, selecionarBairro, escolherBairro, noPainel, subirAoMapa, marcarCamadas,
      abrirCopiloto: () => abrirCopiloto(),
      // Liga uma camada do painel Camadas e foca um ponto dela (ex.: a obra da agenda de entregas).
      abrirCamada: (nome, id) => { abrirCamada(nome, id); marcarCamadas(); },
      // Filtros do mapa vindos de outra tela (Central de alertas): aplica sem mexer nos widgets.
      aplicarFiltros: (f) => aplicarEstado({ filtros: f, widgets: widgetsCfg }),
      // Gesto da secretaria (despachar, chegar, resolver, devolver, juntar) vindo de outra tela (Central de alertas).
      operar: (acao, oid, dados) => operarNaOcorrencia(acao, oid, dados),
      // Desfazer (js/app/desfazer.js): outras telas passam as próprias ações por aqui (lote, metas, regras).
      comDesfazer: (fn, opcoes) => desfazerApp.com(fn, opcoes),
      marcarOperacaoAplicada: (id) => opAplicados.add(id),
      get mapa() { return mapa; }, get gavetas() { return gavetas; }, get chat() { return chat; }, get gaveta() { return gaveta; },
      get decisao() { return decisao; }, // gaveta Alertas (abas Precisam de você, Todos ativos, Cobranças)
      get dashboard() { return dashboard; }, get widgetsUI() { return widgetsUI; }, get linhaTempo() { return linhaTempo; },
      get telao() { return telao; }, get rotas() { return rotas; }, get telas() { return telas; }, get doca() { return doca; },
      // Modo de crise (js/app/modo-crise.js): guarda o estado de antes e aplica a vista "Sala de crise".
      estadoAtual: () => estadoAtual(), aplicarEstado: (e) => aplicarEstado(e),
      get modoCrise() { return modoCrise; },
    };
    // Desfazer e confirmar: cada ação passa por desfazerApp.com; as críticas, antes, por desfazerApp.confirmarAntes.
    const desfazerApp = GC.criarAppDesfazer ? GC.criarAppDesfazer(app) : { com: (fn) => fn(), confirmarAntes: () => null };
    GC.appAtual = app; // telas e cartões montados fora do app.js usam as mesmas ações
    const tituloDe = (o) => { if (!o) return ''; const b = GC.data.bairros.find((x) => x.id === o.bairroId); return `${o.titulo}${b ? ` (${b.nome})` : ''}`; };
    // Rótulo do aviso "Desfazer": o nome da ação na auditoria e o alvo ("Priorizou a ocorrência: Buraco… (Centro)").
    const rotuloAcao = (chaveAuditoria, alvo) => `${((GC.ACOES_AUDITORIA || {})[chaveAuditoria] || { nome: 'Ação feita' }).nome}${alvo ? `: ${alvo}` : ''}`;

    // Atalhos para o que mora nos módulos (js/app/telas.js, doca.js, camadas.js, cabecalho.js).
    function noPainel(acao) { return telas.noPainel(acao); }
    function subirAoMapa() { doca.subirAoMapa(); }
    function marcarCamadas() { camadas.marcar(); atualizarVista(); }
    // Camada ou legenda mudou: o seletor de visualização mostra "Alterada" (sem redesenhar o painel inteiro).
    function atualizarVista() {
      try { vistasUI.atualizar(); marcarVistaNoBotao(); } catch (e) { /* ainda montando: o render() de abertura atualiza */ }
    }
    function abrirCamada(nome, id, opcoes) { camadas.abrir(nome, id, opcoes); }

    // ---- gavetas (uma por vez, pela direita) ----
    const gavetas = GC.criarGavetas($('gavetas'), {
      botoes: { atencao: $('btn-alertas'), filtros: $('btn-filtros'), camadas: $('btn-camadas') },
      aoTrocar(anterior, nova) {
        if (anterior === 'alerta' && nova !== 'alerta') gaveta.fechar();
        if (anterior === 'info' && nova !== 'info') fecharInfo();
        if (anterior === 'copiloto' && nova !== 'copiloto') chat.recolher(true);
        if (nova) corpo.dataset.gaveta = nova;
        else delete corpo.dataset.gaveta;
        $('chat-aba').classList.toggle('ativo', nova === 'copiloto');
        $('chat-aba').setAttribute('aria-expanded', String(nova === 'copiloto'));
        if (nova === 'vistas' || nova === 'filtros') vistasUI.atualizar();
        // Reaberta, a gaveta Filtros começa do topo (seletor de visualização à vista).
        if (nova === 'filtros') document.querySelector('#gaveta-filtros .filtros-rolagem').scrollTop = 0;
        if (nova === 'camadas') $('camadas-lista').scrollTop = 0;
        // Alertas: o mapa reenquadra no espaço que sobra à esquerda (nenhum pino fica sob a gaveta).
        if ((nova === 'atencao' || (anterior === 'atencao' && !nova)) && !mapa.temAlgoAberto()) setTimeout(() => mapa.ajustar(), 300);
      },
    });
    const abrirCopiloto = () => chat.recolher(false);

    // O enquadramento do mapa desconta o que flutua por cima (menu, cabeçalho, chips, faixa de baixo, gaveta).
    // Formato neutro { top, right, bottom, left } em px: cada motor de mapa converte para o seu.
    GC.margensMapa = function (n) {
      const palco = $('palco').getBoundingClientRect();
      const caixa = (el) => (el && !el.hidden && el.offsetParent !== null ? el.getBoundingClientRect() : null);
      const menu = caixa($('menu'));
      const topo = Math.max(...[document.querySelector('.topo'), $('btn-filtros'), $('vistas'), $('btn-camadas')].map(caixa).filter(Boolean).map((r) => r.bottom), palco.top) - palco.top;
      const base = corpo.classList.contains('compacto') ? null : caixa(document.querySelector('.base-palco'));
      let esq = menu ? Math.max(0, menu.right - palco.left) : 0;
      // A barra da linha do tempo, aberta, é mais alta que a faixa de baixo: a cidade fica acima dela.
      const barraTempo = caixa(document.querySelector('.linha-tempo'));
      const baixo = Math.max(0, ...[base, barraTempo].filter(Boolean).map((r) => palco.bottom - r.top));
      // Widgets fixados no mapa (em cinco lugares): o enquadramento desconta os cantos ocupados da direita e da
      // esquerda (a gaveta, se for maior) e a faixa de baixo no meio (escondida quando um painel da doca abre).
      let fixosDir = 0;
      let fixosBaixo = 0;
      if (caixa($('widgets-mapa'))) {
        document.querySelectorAll('#widgets-mapa .wm-lugar').forEach((l) => {
          if (!l.querySelector('.w-fixo') || !caixa(l)) return;
          const r = l.getBoundingClientRect();
          if (l.dataset.lugar.startsWith('dir')) fixosDir = Math.max(fixosDir, palco.right - r.left);
          if (l.dataset.lugar.startsWith('esq')) esq = Math.max(esq, r.right - palco.left);
          if (l.dataset.lugar === 'baixo') fixosBaixo = Math.max(0, palco.bottom - r.top);
        });
      }
      // A tabela do "Comparar" em coluna à direita (js/modos-mapa.js) também ocupa o lado direito.
      const lateral = caixa(document.querySelector('.lt-comp.lateral'));
      const dir = Math.max(gavetas.largura(), fixosDir, lateral ? palco.right - lateral.left : 0);
      const m = { top: topo + n, right: dir + n, bottom: Math.max(baixo, fixosBaixo) + n, left: esq + n };
      // Pouca área sobrando: melhor enquadrar no palco inteiro do que num buraco.
      if (m.left + m.right > palco.width * 0.75 || m.top + m.bottom > palco.height * 0.75) return GC.mapaLogica.margensUniformes(n);
      return m;
    };

    // Palco encolhido (rolagem): o mapa enquadra pela largura.
    GC.mapaEmFaixa = () => corpo.classList.contains('compacto') && !corpo.classList.contains('tela-aberta');

    // A legenda fixa nasce depois do mapa: guarda o último aviso de camadas até ela existir.
    let camadasLegenda = {};
    let legendaFixa = null;
    const mapa = GC.mapaDisponivel && GC.mapaDisponivel()
      ? GC.criarMapa($('mapa'), {
        aoAgir: agir, legenda: $('mapa-legenda'), aoMudarCamada: (ativa) => { btnLimpar.hidden = !ativa; if (!ativa) marcarSatisfacao(false); },
        aoMudarLegenda: (c) => { camadasLegenda = c; if (legendaFixa) legendaFixa.definirCamadas(c); },
        aoSelecionarBairro: clicarBairro, aoDetalhar: detalhar,
        // Popups dos pontos (risco, leitos, obras, escolas, frota…) aparecem na gaveta da direita.
        aoInfo: (conteudo, { fechar, lngLat }) => {
          const meu = abrirInfo(conteudo, fechar);
          if (lngLat) setTimeout(() => mapa.centralizarAoLado(lngLat, gavetas.largura()), 60);
          return () => { if (infoAtual === meu) { infoAtual = null; gavetas.fechar('info'); } };
        },
        aoLinhaTempo: () => linhaTempo && linhaTempo.alternar(),
        aoCidadeInteira: () => verCidadeInteira(),
        aoCarregar: () => tirarCarregando(),
      })
      : mapaOffline($('mapa'));

    // Tela de carregamento: sai quando o mapa carrega; sem mapa (offline) ou se demorar, sai assim mesmo.
    function tirarCarregando() {
      const tela = $('carregando');
      if (!tela || tela.classList.contains('saindo')) return;
      tela.classList.add('saindo');
      setTimeout(() => tela.remove(), 600);
    }
    if (GC.cidade && $('carregando-nome')) $('carregando-nome').textContent = GC.cidade.nome;
    setTimeout(tirarCarregando, GC.mapaDisponivel && GC.mapaDisponivel() ? 8000 : 300);

    // ---- gaveta "info": detalhe de um ponto do mapa ou de um bairro ----
    // Um conteúdo por vez; quem abriu recebe o aviso quando ela fecha (o popup escondido fecha junto).
    const painelInfo = $('gaveta-info');
    let infoAtual = null; // { aoFechar }
    function abrirInfo(conteudo, aoFechar) {
      fecharInfo();
      const meu = { aoFechar };
      infoAtual = meu;
      painelInfo.innerHTML = '<button type="button" class="gaveta-x info-fechar" aria-label="Fechar"><i class="ti ti-x" aria-hidden="true"></i></button>';
      painelInfo.querySelector('.info-fechar').onclick = () => gavetas.fechar('info');
      painelInfo.appendChild(conteudo);
      painelInfo.scrollTop = 0;
      gavetas.abrir('info');
      return meu;
    }
    function fecharInfo() {
      const atual = infoAtual;
      infoAtual = null;
      if (atual && atual.aoFechar) atual.aoFechar();
    }

    // Clique num bairro do mapa: só abre o painel dele à direita e o destaca no mapa (não filtra: um clique
    // sem querer não pode zerar os números do topo). Filtrar é o botão "Filtrar o painel por este bairro".
    // Clicar de novo no mesmo bairro fecha o painel.
    function clicarBairro(id) {
      if (infoBairro && infoAtual === infoBairro && infoBairro.id === id) { gavetas.fechar('info'); return; }
      abrirInfoBairro(id); // primeiro a gaveta: o enquadramento do bairro já desconta a largura dela
      if (!bairros.includes(id)) mapa.destacarBairro([id]);
    }
    function abrirInfoBairro(id) {
      const r = GC.resumoBairro(id, {
        ocorrencias: store.ocorrencias(),
        leitos: GC.leitos ? GC.leitos.resumo().unidades : [],
        escolas: GC.educacao ? GC.educacao.resumo().escolas : [],
        obras: GC.obras ? GC.obras.resumo().obras : [],
      });
      if (!r) return;
      const div = document.createElement('div');
      div.className = 'info-conteudo';
      const filtrado = bairros.length === 1 && bairros[0] === id;
      div.innerHTML = GC.htmlBairro(r, { filtrado });
      div.querySelectorAll('[data-ocorrencia]').forEach((b) => { b.onclick = () => detalhar(b.dataset.ocorrencia); });
      div.querySelector('[data-acao-bairro="cidade"]').onclick = () => verCidadeInteira();
      div.querySelector('[data-acao-bairro="perguntar"]').onclick = () => { abrirCopiloto(); perguntar(`Como está o bairro ${r.nome}?`); };
      div.querySelector('[data-acao-bairro="filtrar"]').onclick = () => {
        definirBairros(filtrado ? [] : [id]);
        abrirInfoBairro(id); // redesenha o botão com o estado novo
        if (filtrado) mapa.destacarBairro([id]); // sem filtro, continua destacado enquanto o painel está aberto
      };
      // Fechar o painel de um bairro só destacado (sem filtro) devolve o mapa ao enquadramento do filtro.
      const meu = abrirInfo(div, () => { if (infoBairro === meu) { infoBairro = null; if (!bairros.includes(id)) mapa.destacarBairro(bairros); } });
      infoBairro = meu;
      infoBairro.id = id;
    }
    // Painel do bairro aberto na gaveta (null = nenhum): some junto quando o bairro sai de foco.
    let infoBairro = null;
    function fecharInfoBairroSeSaiu() {
      // Só fecha quando o filtro passou para outro bairro (tirar o filtro não fecha: o painel abre pelo clique).
      if (infoBairro && bairros.length && !bairros.includes(infoBairro.id) && infoAtual === infoBairro) gavetas.fechar('info');
    }
    // "Ver a cidade inteira" (controle do mapa ou painel do bairro): tira o foco de bairro e o painel dele.
    function verCidadeInteira() {
      if (infoBairro && infoAtual === infoBairro) gavetas.fechar('info');
      if (bairros.length) definirBairros([]);
      mapa.visaoGeral();
    }

    // ---- linha do tempo (qualquer dia do último ano, escolhido no calendário) e modo telão ----
    // O histórico simulado de cada dia fica em cache em linha-tempo.js; desenharPinos o pede já cortado em agora.
    // Além dos alertas, a linha do tempo leva leitos, B.O.s e obras ao instante (camadas com noInstante e os
    // chips da barra, de js/linha-tempo-indicadores.js) e compara dois períodos (painel "Comparar").
    const pctTxt = (n) => `<b>${n}%</b>`;
    const mapasLado = GC.criarMapasComparacao ? GC.criarMapasComparacao($('palco')) : null;
    const linhaTempo = GC.criarLinhaTempoUI($('palco'), {
      agora: () => GC.agora(),
      aoMudar: () => desenharPinos(),
      // Chips do instante; ao vivo, os números de hoje (os mesmos dos widgets). Só os domínios do perfil.
      indicadores: (t) => {
        const agora = GC.agora();
        const chips = [];
        const ligadas = camadas.estado(); // o chip mostra se a camada dele está no mapa
        if (GC.leitos && podeCamada('toggle-leitos')) {
          const l = t === null ? GC.leitos.resumo() : GC.leitosEm(t, agora);
          chips.push({ camada: 'leitos', ligada: ligadas.includes('leitos'), icone: 'ti-bed', tom: l.utiPct >= 90 ? 'critica' : l.utiPct >= 80 ? 'atencao' : '',
            html: `Leitos ${pctTxt(l.pct)} · UTI ${pctTxt(l.utiPct)}`, titulo: 'Ocupação dos leitos da rede' });
        }
        if (GC.seguranca && podeCamada('toggle-calor-bo')) {
          const n = t === null ? GC.seguranca.resumo().hoje : GC.boEm(t, agora).noDia;
          chips.push({ camada: 'calor-bo', ligada: ligadas.includes('calor-bo'), icone: 'ti-shield', html: `<b>${n}</b> ${n === 1 ? 'B.O.' : 'B.O.s'} no dia`,
            titulo: 'Boletins de ocorrência do dia até esta hora (no mapa, o calor dos 30 dias)' });
        }
        if (GC.obras && podeCamada('toggle-obras')) {
          const o = t === null ? GC.obras.resumo() : GC.obrasEm(t);
          chips.push({ camada: 'obras', ligada: ligadas.includes('obras'), icone: 'ti-crane', tom: o.atrasadas ? 'atencao' : '',
            html: `<b>${o.atrasadas}</b> de ${o.emAndamento} obras atrasadas`, titulo: 'Obras atrasadas no dia' });
        }
        return chips;
      },
      // O chip é interruptor: ligada, o clique tira a camada do mapa (pelo mesmo caminho das visualizações).
      aoCamada: (nome) => {
        const ligadas = camadas.estado();
        if (ligadas.includes(nome)) camadas.aplicar(ligadas.filter((n) => n !== nome));
        else { camadas.abrir(nome, null, { manter: true }); camadas.marcar(); }
      },
      // Alertas seguem os filtros do mapa (secretaria e bairro); o resto é da cidade toda.
      comparar: (pa, pb) => {
        const fa = filtroAreas();
        return GC.compararPeriodos(GC.data, pa, pb, GC.agora(), store.todas(),
          (o) => (!fa.length || fa.includes(o.area)) && (!bairros.length || bairros.includes(o.bairroId)));
      },
      aoPintar: (niveis) => mapa.pintarNiveis(niveis),
      // "Dois mapas": um mapa para cada período (js/mapa-comparar.js).
      aoLadoALado: mapasLado ? (x) => (x ? mapasLado.mostrar(x.r, x.rotulos) : mapasLado.esconder()) : null,
      // A barra (aberta ou fechada) e a Tabela numa coluna à direita mudam o espaço livre: a cidade reenquadra no
      // que sobra (GC.margensMapa desconta as duas), como com uma gaveta.
      aoAbrirFechar: () => { if (!mapa.temAlgoAberto()) setTimeout(() => mapa.ajustar(), 300); },
      aoLateral: () => { if (!mapa.temAlgoAberto()) setTimeout(() => mapa.ajustar(), 300); },
      // Bairro da lista do "Comparar": levanta no mapa, sem mexer na câmera.
      aoApontarBairro: (id) => mapa.apontarBairro(id),
    });
    // Camada ligada ou desligada pelo painel Camadas ("Limpar todas", grupos): os chips acompanham.
    $('painel-camadas').addEventListener('change', () => linhaTempo.atualizarChips());
    // As ocorrências com pino no mapa agora (mesmos filtros do render).
    const noMapaAgora = () => porSeveridade(store.ocorrencias(filtroAreas(), bairros, recorte));
    // Mesmos filtros, para qualquer ocorrência, inclusive a que já saiu do mapa (resolvida): secretaria,
    // bairro, recorte e atributos. Uma resolvida nunca casa com "prazo estourado" nem "em andamento".
    const RECORTE_TELAO = { criticas: (o) => o.severidade === 'critica', estourado: (o) => GC.estourada(o), andamento: (o) => o.status === 'em_campo' };
    const noFiltroTelao = (o) => {
      const fa = filtroAreas();
      return (!fa.length || fa.includes(o.area)) && (!bairros.length || bairros.includes(o.bairroId))
        && (!recorte || (RECORTE_TELAO[recorte] && RECORTE_TELAO[recorte](o))) && porSeveridade([o]).length > 0;
    };
    const gabinetesNoTelao = () => telas.gabinetes.ativos().filter(telas.gabineteDaPasta).sort((a, b) => b.abertoEm - a.abertoEm);
    const telao = GC.criarTelao({
      mapa,
      // As que precisam do prefeito primeiro; sem nenhuma, as críticas ativas. O total é o de verdade:
      // o telão só percorre as 6 primeiras, mas o cartão da cidade diz quantas são.
      // Segue os mesmos filtros do mapa (visualização salva, áreas, bairros, gravidade): só entra na fila
      // o que tem pino na tela. Antes, uma "alta" com o filtro "Crítica" entrava na fila, a câmera não
      // tinha para onde ir e o telão pulava sem explicar.
      // soCriticas (ajuste do telão): a fila fica só com as críticas, entre as que pedem atenção ou não.
      lista: ({ soCriticas = false } = {}) => {
        const naTela = new Set(noMapaAgora().map((o) => o.id));
        const at = store.atencao().todas.filter((o) => naTela.has(o.id) && (!soCriticas || o.severidade === 'critica'));
        const criterio = at.length ? 'atencao' : 'criticas';
        const base = at.length ? at : noMapaAgora().filter((o) => o.severidade === 'critica');
        return { itens: base.slice(0, 6), total: base.length, criterio };
      },
      // Só as ativas e visíveis: uma resolvida (ou filtrada) no meio do ciclo sai da fila.
      buscar: (id) => noMapaAgora().find((o) => o.id === id) || null,
      // O que as cenas do telão (js/telao/) leem: as ativas com pino, todas (abertas e resolvidas), o
      // desempenho de 30 dias e as resolvidas na última hora, tudo dentro dos filtros do mapa.
      dados: () => {
        const agora = GC.agora();
        return {
          agora,
          ativas: noMapaAgora(),
          todas: store.todas().filter(noFiltroTelao),
          desempenho: store.desempenho(bairros, filtroAreas()),
          resolvidas: store.todas().filter((o) => o.status === 'resolvida' && o.resolvidaEm && agora - o.resolvidaEm <= 3600000 && noFiltroTelao(o))
            .sort((a, b) => b.resolvidaEm - a.resolvidaEm),
          // Gabinetes de crise ativos (da pasta do perfil), o mais recente primeiro, já com o resumo das tarefas.
          gabinetes: gabinetesNoTelao().map((g) => telas.gabinetes.resumo(g.id)).filter(Boolean),
        };
      },
      crises: () => gabinetesNoTelao().map((g) => g.titulo),
      noFiltro: (o) => noFiltroTelao(o),
      // Rodapé do telão: as mais recentes da cidade (abertas e resolvidas), dentro dos filtros.
      feed: () => GC.feedOcorrencias(store.todas().filter(noFiltroTelao), 12),
      armazenamento: {
        ler() { try { return JSON.parse(localStorage.getItem('gc.telao')); } catch (e) { return null; } },
        gravar(o) { try { localStorage.setItem('gc.telao', JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
      },
      // Rótulo do filtro ativo, para o telão dizer por que algumas ocorrências não aparecem.
      filtro: () => GC.resumoFiltros(areasPerfil ? Object.assign(estadoFiltros(), { areas: [] }) : estadoFiltros()).join(' · '),
      // O cartão do telão mostra o prazo de forma explícita ("a equipe deve chegar em até…"): o
      // "faltam 2 h" do resto do app não dizia faltam para quê.
      descrever: (o) => {
        const area = GC.data.areas.find((a) => a.id === o.area) || {};
        const restante = GC.prazoRestanteMin(o);
        const acao = { cobrar: '📣 Prefeito cobrou', priorizar: '⚡ Prefeito priorizou', gabinete: '🚨 Gabinete convocado' }[o.acaoPrefeito] || '';
        let prazo;
        if (o.status === 'em_campo') prazo = { estado: 'campo', texto: 'Equipe já está no local' };
        else if (GC.estourada(o)) prazo = { estado: 'atrasada', rotulo: 'Equipe atrasada há',tempo: GC.tempoTexto(-restante), detalhe: `prazo para chegar era ${GC.tempoTexto(o.prazoMin)}` };
        else prazo = { estado: 'correndo', rotulo: 'Equipe deve chegar em até', tempo: GC.tempoTexto(restante), usadoPct: Math.min(100, Math.max(0, (GC.tempoDePrazoMin(o) / o.prazoMin) * 100)) };
        return {
          gravidade: { critica: 'Crítica', alta: 'Alta', media: 'Média' }[o.severidade],
          onde: (GC.data.bairros.find((b) => b.id === o.bairroId) || {}).nome || '',
          area: `${area.emoji || ''} ${area.secretaria ? area.secretaria.nome : area.nome || ''}`.trim(),
          afetados: o.afetados || 0,
          // O prazo já tem o seu bloco: os motivos aqui são os outros (várias secretarias, caso repetido).
          motivos: GC.motivosAtencao(o).filter((m) => m.tipo !== 'prazo').map((m) => m.texto),
          acao,
          prazo,
        };
      },
      aoMudar: (ligado) => {
        if (ligado) { gavetas.fechar(); if (telas.tela() !== 'painel') rotas.ir({ tela: 'painel' }); if (linhaTempo.aberta()) linhaTempo.fechar(); }
      },
    });
    // "Modo telão" abre antes os ajustes (tempo, cenas, só críticas); "Entrar" grava e entra.
    const ajustesTelao = GC.criarAjustesTelao({
      ajustes: () => telao.ajustes(),
      aoEntrar: (novos) => { telao.ajustar(novos); telao.entrar(); },
    });
    $('btn-telao').addEventListener('click', () => ajustesTelao.abrir());
    // Dados (as tabelas por trás do painel) é só do gestor geral: a porta fica no menu ⋯.
    $('btn-dados').hidden = !!(GC.perfil && !GC.pode('dados.ver'));
    $('btn-dados').addEventListener('click', () => rotas.ir({ tela: 'dados', tabela: null }));

    // O mapa acompanha o próprio tamanho (rolagem encolhendo o palco, janela mudando).
    if (window.ResizeObserver) {
      let espera;
      // No telão, só recalcula: a câmera é dele (reenquadrar a cidade desfazia o voo até o alerta).
      new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(() => mapa.redimensionar({ manterCamera: telao.ativo() }), 150); }).observe($('mapa'));
    }

    let idsTabelas = null;
    const idsTabelasDados = () => (idsTabelas = idsTabelas || new Set(GC.tabelasDados(store).map((t) => t.id)));
    const chat = GC.criarChat(
      { mensagens: $('chat-mensagens'), sugestoes: $('chat-sugestoes'), form: $('chat-form'), input: $('chat-input'), btnResumo: $('btn-resumo'), app: document.querySelector('.app'), naoLidas: $('chat-nao-lidas'), botaoMaia: $('chat-aba'), btnRecolher: $('btn-recolher-chat'),
        btnConversas: $('btn-conversas'), btnNova: $('btn-nova-conversa'), painelConversas: $('chat-conversas') },
      {
        conversas: GC.criarConversas ? GC.criarConversas(armazenamentoConversas, { agora: () => (GC.agora ? GC.agora() : Date.now()) }) : null,
        aoPerguntar: perguntar,
        aoAcao: executar,
        aoRecolher: (recolhido) => (recolhido ? gavetas.fechar('copiloto') : gavetas.abrir('copiloto')),
        // Fonte da resposta que existe na tela Dados vira link para a tabela (as outras são dos sistemas das secretarias).
        tabelaExiste: (id) => idsTabelasDados().has(id),
        aoAbrirTabela: (id) => rotas.ir({ tela: 'dados', tabela: id }),
        aoFixarWidget: ({ pergunta, resposta }) => {
          if (!widgetsIA) return null;
          const r = widgetsIA.criar({ pergunta, grafico: resposta.grafico, cenario: resposta.cenario });
          if (r.widget) ligarWidgetIA(r.widget.id);
          return r;
        },
        aoVerWidget: (id) => verWidgetIA(id),
      },
    );
    $('chat-aba').addEventListener('click', () => chat.recolher(gavetas.aberta() === 'copiloto'));

    const dashboard = GC.criarDashboard(
      { menu: $('menu'), kpis: $('kpis') },
      {
        aoIr: (r) => rotas.ir(r),
        aoClicarNumero: clicarNumero,
        // Itens do menu que abrem uma gaveta (Alertas): voltam ao mapa e abrem a gaveta.
        aoGaveta: (g) => { if (telas.tela() !== 'painel') rotas.ir({ tela: 'painel' }); subirAoMapa(); gavetas.abrir(g); },
      },
    );

    // ---- filtros, legenda, visualizações e widgets ----
    const filtrosUI = GC.criarFiltrosUI(
      { gaveta: $('filtros-corpo'), legenda: $('mapa-legenda-fixa'), btnLegenda: document.querySelector('.legenda-alternar'), btnFiltros: $('btn-filtros') },
      { aoMudar: (f) => aplicarEstado({ filtros: f, widgets: widgetsCfg }), aoFechar: () => gavetas.fechar(), aoSalvarVista: () => vistasUI.iniciarSalvar(), aoAlternarLegenda: () => atualizarVista(), areasFixas: areasPerfil },
    );
    legendaFixa = filtrosUI;
    filtrosUI.definirCamadas(camadasLegenda);
    const vistasUI = GC.criarVistasUI(
      { barra: $('vistas'), gaveta: $('gaveta-vistas') },
      vistas,
      {
        estadoAtual, aoAplicar: aplicarEstado, aoAbrirGaveta: () => gavetas.abrir('vistas'), aoFechar: () => gavetas.fechar(),
        cameraAtual: () => (mapa.camera ? mapa.camera() : null),
        aoEnquadramento: (enq) => { if (mapa.definirInicio) mapa.definirInicio(enq); },
      },
    );
    $('filtros-fechar').onclick = () => gavetas.fechar('filtros');
    $('camadas-fechar').onclick = () => gavetas.fechar('camadas');

    // ---- busca rápida (lupa ao lado de Filtros): leva até o que foi achado ----
    const CAMADA_DA_BUSCA = { leito: 'leitos', escola: 'escolas', obra: 'obras', farmacia: 'farmacias', linha: 'frota', coleta: 'coleta', risco: 'risco' };
    GC.criarBuscaUI(
      { raiz: $('busca'), botao: $('btn-busca'), caixa: $('busca-caixa'), input: $('busca-input'), lista: $('busca-lista'), fechar: $('busca-fechar') },
      {
        itens: () => (GC.filtrarBuscaDoPerfil || ((x) => x))(GC.itensBusca({
          ocorrencias: store.ocorrencias(),
          leitos: GC.leitos ? GC.leitos.resumo().unidades : [],
          escolas: GC.educacao ? GC.educacao.resumo().escolas : [],
          obras: GC.obras ? GC.obras.resumo().obras : [],
          farmacias: GC.medicamentos && GC.medicamentos.farmacias ? GC.medicamentos.farmacias() : [],
          linhas: GC.frota ? GC.frota.resumo().linhas : [],
          rotas: GC.coleta ? GC.coleta.resumo().rotas : [],
          riscos: GC.risco ? GC.risco.resumo(store.ocorrencias()).areas : [],
        })),
        aoEscolher: (r) => {
          if (r.tipo === 'tela') return rotas.ir(r.rota);
          if (r.tipo === 'secretaria') return rotas.ir({ tela: 'secretaria', area: r.id });
          if (r.tipo === 'ocorrencia') return noPainel(() => detalhar(r.id));
          if (r.tipo === 'bairro') {
            return noPainel(() => {
              subirAoMapa();
              // Igual ao clique no mapa: abre a gaveta e destaca, sem filtrar (o filtro fica no botão da gaveta).
              abrirInfoBairro(r.id); // primeiro a gaveta: o enquadramento do bairro desconta a largura dela
              if (!bairros.includes(r.id)) mapa.destacarBairro([r.id]);
            });
          }
          if (CAMADA_DA_BUSCA[r.tipo]) { abrirCamada(CAMADA_DA_BUSCA[r.tipo], r.id); marcarCamadas(); }
        },
      },
    );

    // A visualização em uso aparece no seletor ao lado da busca; o botão Filtros só a cita na dica.
    function marcarVistaNoBotao() {
      const atual = vistas.atual();
      const alterada = vistas.alterada(estadoAtual());
      $('btn-filtros').title = `Filtros · visualização em uso: ${atual.nome}${alterada ? ' (alterada)' : ''}`;
    }

    function salvarVista() {
      gavetas.abrir('vistas');
      vistasUI.focarNome();
    }
    const widgetsUI = GC.criarWidgetsUI(
      { area: $('widgets'), mapa: $('widgets-mapa'), gaveta: $('gaveta-widgets'), escopo: $('dash-escopo'), botaoEditar: $('dash-editar'), aoConfigurar: () => gavetas.abrir('widgets'), aoFecharGaveta: () => gavetas.fechar('widgets') },
      {
        // Widgets novos (js/widgets-extra.js): ficha do indicador, alerta, gabinete, resumo.
        aoAbrirIndicador: (id) => rotas.ir({ tela: 'indicadores', alvo: id }),
        aoAbrirAlerta: (id) => noPainel(() => detalhar(id)),
        aoIrCrise: (id) => rotas.ir({ tela: 'crise', id }),
        aoResumo: (tipo, area) => {
          if (tipo === 'alertas') return noPainel(() => { subirAoMapa(); gavetas.abrir('atencao'); });
          if (tipo === 'chuva') return noPainel(() => { subirAoMapa(); $('toggle-risco').checked = true; mapa.alternarRisco(true); marcarCamadas(); });
          if (area) rotas.ir({ tela: 'secretaria', area });
        },
        // "Restaurar padrão": volta aos widgets da visualização em uso.
        aoRestaurar: () => aplicarEstado({ filtros: estadoFiltros(), widgets: vistas.atual().widgets }),
        infoVista: () => ({ nome: vistas.atual().nome, alterada: vistas.alterada(estadoAtual()) }),
        aoMudar: (w) => {
          if (widgetsIA) widgetsIA.marcarLigados(w.ativos || []); // escolha explícita na gaveta ou no ✕
          aplicarEstado({ filtros: estadoFiltros(), widgets: w });
        },
        // Widget fixado, tirado ou mudado de lugar ou tamanho no mapa: a cidade reenquadra no que sobra
        // (GC.margensMapa desconta os cantos ocupados), como com uma gaveta. Com bairro escolhido, a câmera fica.
        aoMudarLugares: () => { if (!bairros.length) setTimeout(() => mapa.redimensionar(), 300); },
        aoFechar: () => gavetas.fechar(),
        aoSalvarVista: salvarVista,
        aoAbrirSecretaria: (a) => rotas.ir({ tela: 'secretaria', area: a }),
        aoVerResolvida: (r) => { if (r && typeof r.lat === 'number') noPainel(() => { subirAoMapa(); mapa.mostrarResolvida(r); }); },
        aoSelecionarBairro: (id) => { selecionarBairro(id); subirAoMapa(); },
        // Item de um widget de domínio (data-camada + data-id): liga a camada e abre o ponto, sem tirar a camada
        // da IA nem o filtro de setor das obras (o widget continua mostrando o mesmo recorte).
        aoAbrirCamada: (nome, id) => { abrirCamada(nome, id, { manter: true }); marcarCamadas(); },
        // Bairros em destaque (busca ativa, violência): dado agregado, nunca o ponto de uma família.
        aoDestacarBairros: (bairros, legenda) => noPainel(() => {
          subirAoMapa();
          mapa.mostrarCamada({ tipo: 'destaque', bairros, legenda });
        }),
        // Filtro de setor do widget vale também para o mapa (e liga a camada).
        aoFiltrarObras: (setor) => {
          $('toggle-obras').checked = true; marcarCamadas();
          mapa.alternarObras(true);
          mapa.filtrarObras(setor);
        },
        // Widgets fixados da Maia: a pergunta é refeita a cada desenho (dados de agora).
        widgetsIA,
        graficoAtualIA: (w) => {
          try {
            const r = GC.ia.perguntar(w.pergunta, contexto());
            return r && r.grafico && (!w.cenario || r.cenario === w.cenario) ? r.grafico : null;
          } catch (e) { return null; }
        },
        aoPerguntarIA: (id) => {
          const w = widgetsIA && widgetsIA.buscar(id);
          if (!w) return;
          abrirCopiloto();
          perguntar(w.pergunta);
        },
        aoExcluirIA: (id) => {
          if (!widgetsIA || !widgetsIA.remover(id)) return;
          aplicarEstado({ filtros: estadoFiltros(), widgets: Object.assign({}, widgetsCfg, { ativos: widgetsCfg.ativos.filter((x) => x !== id) }) });
        },
      },
    );
    // Widget novo da Maia entra ligado, no topo do dashboard.
    function ligarWidgetIA(id) {
      if (widgetsCfg.ativos.includes(id)) return render();
      aplicarEstado({ filtros: estadoFiltros(), widgets: Object.assign({}, widgetsCfg, { ativos: [id, ...widgetsCfg.ativos] }) });
    }
    // "Ver no dashboard": abre "Indicadores" e leva até o widget, com um destaque rápido.
    function verWidgetIA(id) {
      if (!widgetsCfg.ativos.includes(id)) ligarWidgetIA(id);
      noPainel(() => {
        if (doca.abaDash() === 'metas') rotas.ir({ tela: 'painel' });
        doca.abrirDashboard(true);
        doca.escolherAba('widgets');
        setTimeout(() => {
          const alvo = document.querySelector(`[data-widget="${id}"]`);
          if (!alvo) return;
          alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
          alvo.classList.remove('w-ia-novo');
          void alvo.offsetWidth; // reinicia a animação
          alvo.classList.add('w-ia-novo');
        }, 350);
      });
    }
    // Alertas com uma tela aberta: volta ao mapa (a gaveta fala do mapa).
    $('btn-alertas').addEventListener('click', () => { if (telas.tela() !== 'painel') rotas.ir({ tela: 'painel' }); });

    // Aplica um estado inteiro (de uma visualização, da gaveta de filtros ou de widgets).
    function aplicarEstado(estado) {
      const e = GC.normalizarEstado(estado);
      const bairrosAntes = bairros.join(',');
      areas.clear(); e.filtros.areas.forEach((a) => areas.add(a));
      severidades.clear(); e.filtros.severidades.forEach((s) => severidades.add(s));
      recorte = e.filtros.recorte;
      bairros = e.filtros.bairros.slice();
      atributos = { afetados: e.filtros.afetados, tempos: e.filtros.tempos, origens: e.filtros.origens, multi: e.filtros.multi, tratamento: e.filtros.tratamento };
      if (areasPerfil) { areas.clear(); areasPerfil.forEach((a) => areas.add(a)); }
      widgetsCfg = GC.widgetsDoPerfil ? Object.assign({}, e.widgets, { ativos: GC.widgetsDoPerfil(e.widgets.ativos), pulsos: areasPerfil || e.widgets.pulsos }) : e.widgets;
      if (GC.widgetsDoPerfil && widgetsCfg.fixados) widgetsCfg.fixados = widgetsCfg.fixados.filter((id) => GC.widgetsDoPerfil([id]).includes(id));
      if (bairros.join(',') !== bairrosAntes) { mapa.destacarBairro(bairros); fecharInfoBairroSeSaiu(); }
      // Só quem traz o mapa (trocar ou descartar uma visualização) mexe nas camadas, na legenda e no enquadramento:
      // mudar um filtro ou um widget não desliga camada nenhuma.
      if (estado && estado.mapa) {
        camadas.aplicar(e.mapa.camadas);
        filtrosUI.abrirLegenda(e.mapa.legenda);
        if (mapa.definirInicio) mapa.definirInicio(e.mapa.enquadramento || null);
      }
      render();
    }

    // ---- telas sobre o mapa, rotas e gabinetes de crise (js/app/telas.js) ----
    const telas = GC.criarAppTelas(app);



    const gaveta = GC.criarGaveta($('gaveta'), {
      aoAgir: agir,
      aoCobranca: agirNaCobranca,
      aoOperar: operarNaOcorrencia,
      aoAjuda: agirNaAjuda,
      aoAcaoPrefeito: agirNaAcaoPrefeito,
      store,
      aoPerguntar: perguntarSobre,
      aoFechar: () => { mapa.acender(null); mapa.encerrarFoco(); gavetas.fechar('alerta'); },
    });

    // Gaveta Alertas: as exceções e todos os ativos. O item abre o detalhe com "← Alertas" para voltar.
    const decisao = GC.criarDecisao(
      { raiz: $('gaveta-atencao') },
      {
        aoAgir: agir,
        aoCobranca: agirNaCobranca,
        aoAjuda: agirNaAjuda,
        aoAcaoPrefeito: agirNaAcaoPrefeito,
        aoHistorico: () => { gavetas.fechar('atencao'); rotas.ir({ tela: 'cobrancas' }); },
        // "← Alertas" volta à lista com o cartão à vista; as setas do detalhe andam na ordem da lista.
        aoDetalhar: (id) => detalhar(id, {
          voltar: () => { mapa.acender(null); gavetas.abrir('atencao'); decisao.mostrarAberto(); },
          vizinhos: () => decisao.ordem(),
          aoIr: (outro) => decisao.abrir(outro),
        }),
        // Ao sair do item, o realce volta para o alerta aberto no detalhe (se houver).
        aoRealcar: (id) => mapa.acender(id || gaveta.abertaId()),
        aoFechar: () => gavetas.fechar('atencao'),
        aoAbrirCentral: () => rotas.ir({ tela: 'alertas' }),
      },
    );

    function escopoTexto() {
      const partes = [];
      if (bairros.length === 1) partes.push(`📍 ${GC.data.bairros.find((b) => b.id === bairros[0]).nome}`);
      else if (bairros.length > 1) partes.push(`📍 ${bairros.length} bairros`);
      if (areas.size) partes.push(filtroAreas().map((a) => GC.data.areas.find((x) => x.id === a).nome).join(', '));
      return partes.length ? partes.join(' · ') : 'cidade inteira';
    }


    // Pinos do mapa. Linha do tempo num instante passado: o que estava aberto naquela hora (com os filtros
    // de secretaria, bairro, situação e gravidade); o resto do painel continua ao vivo. A linha do tempo chama só
    // isto a cada passo (o render inteiro redesenha os widgets e não aguenta 12 passos por segundo).
    function desenharPinos(visiveis) {
      const fa = filtroAreas();
      const instante = linhaTempo ? linhaTempo.instante() : null;
      let noMapa = visiveis || porSeveridade(store.ocorrencias(fa, bairros, recorte));
      if (instante !== null) {
        noMapa = porSeveridade(GC.abertasEm(instante, store.todas(), GC.historicoEm(GC.data, instante, GC.agora()))
          .filter((o) => (!fa.length || fa.includes(o.area)) && (!bairros.length || bairros.includes(o.bairroId))
            && GC.casaRecorteEm(o, recorte, instante)));
      }
      if (linhaTempo && linhaTempo.aberta()) linhaTempo.marcar(noMapa.length);
      mapa.noInstante(instante); // leitos, calor dos B.O.s e obras no mesmo instante (cada camada ignora o que não mudou)
      mapa.renderOcorrencias(ehCidadao ? [] : noMapa);
    }


    function render() {
      // Primeiro o modo de crise: entrar ou sair da vista da crise muda o estado que o resto desenha.
      if (modoCrise) modoCrise.atualizar();
      marcarCamadas();
      const fa = filtroAreas();
      const visiveis = porSeveridade(store.ocorrencias(fa, bairros, recorte));
      desenharPinos(visiveis);
      if (linhaTempo.comparando()) linhaTempo.atualizarComparacao(); // filtros mudaram: os alertas comparados também
      filtrosUI.atualizar(estadoFiltros(), visiveis);
      vistasUI.atualizar();
      marcarVistaNoBotao();
      dashboard.marcarRecorte(recorte);
      dashboard.atualizarFaixa(store.kpis(fa, bairros));
      // Risco climático: recalculado com as ocorrências ativas (resolver um alagamento tira o "atingida").
      const risco = GC.risco.resumo(store.ocorrencias());
      mapa.atualizarRisco(risco);
      widgetsUI.atualizar(widgetsCfg, {
        kpis: store.kpis(fa, bairros),
        pulsos: store.pulsos(),
        desempenho: store.desempenho(filtroBairros(), fa),
        satisfacao: GC.data.satisfacaoPorBairro,
        leitos: GC.leitos.resumo(),
        seguranca: GC.seguranca.resumo(),
        risco,
        obras: GC.obras,
        educacao: GC.educacao.resumo(),
        frota: GC.frota.resumo(),
        coleta: GC.coleta.resumo(),
        medicamentos: GC.medicamentos.resumo(),
        social: GC.social ? GC.social.resumo() : null,
        bairro: bairroUnico(),
        escopo: escopoTexto(),
        // Widgets novos: calculados só se algum widget pedir (uma vez por desenho).
        agora: GC.agora(),
        ocorrencias: store.ocorrencias(),
        indicadores: umaVez(() => doca.estadoIndicadores().indicadores),
        atencao: umaVez(() => porSeveridade(store.atencao(fa, bairros, recorte).todas)),
        gabinetes: umaVez(() => telas.gabinetes.ativos().filter(telas.gabineteDaPasta)),
        resumoDia: umaVez(() => GC.resumoDoDia({
          atencao: store.atencao(fa, bairros, recorte).todas, tendencias: GC.data.tendencias, risco,
          gabinetesAtivos: telas.gabinetes.ativos().filter(telas.gabineteDaPasta), areas: fa, bairros: bairros.slice(), agora: GC.agora(), sugerirGabinete: GC.pode('crise.abrir', null, { perfil }),
        })),
        // Agenda de entregas (js/data-entregas.js) no recorte de secretarias e no bairro em foco.
        entregas: umaVez(() => (GC.entregas ? GC.entregas.resumo({ areas: fa.length ? fa : null, bairro: bairroUnico() }) : null)),
        resumoSemana: umaVez(() => GC.resumoDaSemana({ tendencias: GC.data.tendencias, conquistas: GC.data.conquistas, desempenho: GC.data.desempenho30d, areas: fa, agora: GC.agora() })),
        resumoBairro: (id) => GC.resumoBairro(id, {
          ocorrencias: store.ocorrencias(), leitos: GC.leitos.resumo().unidades,
          escolas: GC.educacao.resumo().escolas, obras: GC.obras.resumo ? GC.obras.resumo().obras : [],
        }),
      });
      telas.atualizar();
      doca.atualizar();
      const totalPerfil = store.atencao(areasPerfil).todas.length;
      dashboard.marcarContadorAlertas(totalPerfil);
      const at = store.atencao(fa, bairros, recorte);
      const todas = porSeveridade(at.todas);
      const temFiltro = GC.contarFiltrosEstado(estadoFiltros()) > 0;
      decisao.atualizar({ todas, ativos: visiveis }, { cidade: store.atencao().todas.length, temFiltro, modoCrise: modoCrise ? modoCrise.modo() : null });
      cabecalho.marcarBotaoAlertas(todas, temFiltro, totalPerfil, decisao.pendentesCobranca());
      // A gaveta aberta também acompanha o relógio (prazo estoura sem evento da própria ocorrência).
      if (gaveta.abertaId()) gaveta.atualizar(store.buscar(gaveta.abertaId()));
      const criticas = {};
      store.ocorrencias().filter((o) => o.severidade === 'critica').forEach((o) => { criticas[o.area] = (criticas[o.area] || 0) + 1; });
      dashboard.atualizarBadges(criticas);
    }

    // Ação do prefeito numa exceção (cartão, popup, gaveta ou Maia). Ação fora de hora é ignorada.
    // Gabinete de crise: além de avisar as secretarias, abre a sala do gabinete (tela própria).
    // Gabinete pede confirmação; toda ação vira um "Desfazer" (o gabinete desfeito fecha a sala e volta ao mapa).
    function agir(id, tipo, dados = {}) {
      const o = store.buscar(id);
      if (desfazerApp.confirmarAntes(`ocorrencia.${tipo}`, o, dados, (d) => agir(id, tipo, d))) return false;
      return desfazerApp.com(() => agirDeVez(id, tipo), {
        rotulo: rotuloAcao(`ocorrencia_${tipo}`, tituloDe(o)),
        ocorrencias: [id],
        depois: tipo === 'gabinete' ? () => { if (telas.tela() === 'crise') rotas.ir({ tela: 'painel' }); } : null,
      });
    }
    function agirDeVez(id, tipo) {
      const ok = store.agir(id, tipo);
      if (ok && GC.auditar) {
        const o = store.buscar(id);
        const b = GC.data.bairros.find((x) => x.id === o.bairroId);
        GC.auditar(`ocorrencia_${tipo}`, { alvo: `${o.titulo}${b ? ` (${b.nome})` : ''}`, areaAlvo: o.area, ref: { tipo: 'ocorrencia', id } });
      }
      if (ok && tipo === 'gabinete') {
        const g = telas.gabinetes.abrirDeOcorrencia(store.buscar(id));
        if (modoCrise) modoCrise.convocou(g); // quem convocou entra direto na vista da crise ao voltar ao mapa
        telas.irParaGabinete(g);
      }
      return ok;
    }

    // Resposta e decisão numa cobrança (bloco da gaveta e aba Cobranças). Devolve { ok, motivo } para o
    // formulário mostrar o erro. A regra de quem pode o quê fica em GC.podeNaCobranca (js/perfil.js).
    const PERMISSAO_COBRANCA = {
      previsao: 'responder', justificativa: 'responder', recurso: 'responder', novo_prazo: 'pedir_prazo',
      evidencia: 'encerrar', aprovar: 'decidir', recusar: 'decidir', recobrar: 'recobrar', ciente: 'ciente',
      aprovar_recurso: 'decidir_recurso', negar_recurso: 'decidir_recurso',
    };
    const AUDITORIA_COBRANCA = {
      previsao: 'cobranca_responder', justificativa: 'cobranca_responder', recurso: 'cobranca_responder',
      novo_prazo: 'cobranca_pedir_prazo', evidencia: 'cobranca_encerrar', aprovar: 'cobranca_aprovar_prazo',
      recusar: 'cobranca_recusar_prazo', recobrar: 'cobranca_recobrar', ciente: 'cobranca_ciente',
      aprovar_recurso: 'cobranca_aprovar_recurso', negar_recurso: 'cobranca_negar_recurso',
    };
    function agirNaCobranca(acao, id, dados = {}) {
      const c = GC.cobrancas && GC.cobrancas.buscar(id);
      if (c && desfazerApp.confirmarAntes(`cobranca.${acao}`, c, dados, (d) => agirNaCobranca(acao, id, d))) return { ok: false, motivo: 'confirmar' };
      return desfazerApp.com(() => agirNaCobrancaDeVez(acao, id, dados), {
        rotulo: rotuloAcao(AUDITORIA_COBRANCA[acao], c ? c.retrato.titulo : ''),
        ocorrencias: c ? [c.ocorrenciaId] : [],
      });
    }
    function agirNaCobrancaDeVez(acao, id, dados = {}) {
      const cb = GC.cobrancas;
      const c = cb && cb.buscar(id);
      if (!c) return { ok: false, motivo: 'nao_encontrada' };
      if (!GC.podeNaCobranca(PERMISSAO_COBRANCA[acao], c)) return { ok: false, motivo: 'estado' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : GC.visaoDe(perfil) === 'pasta' ? 'Secretaria' : 'Prefeito(a)';
      let r;
      if (acao === 'previsao' || acao === 'justificativa' || acao === 'recurso') r = cb.responder(id, Object.assign({ tipo: acao }, dados), quem);
      else if (acao === 'novo_prazo') r = cb.pedirNovoPrazo(id, dados.horas, dados.texto, quem);
      else if (acao === 'evidencia') r = cb.encerrar(id, dados, quem);
      else if (acao === 'aprovar' || acao === 'recusar') r = cb.decidirPrazo(id, acao === 'aprovar', dados.texto, quem);
      else if (acao === 'recobrar') r = cb.recobrar(id, { quem });
      else if (acao === 'ciente') r = cb.ciente(id, quem);
      else if (acao === 'aprovar_recurso' || acao === 'negar_recurso') r = cb.decidirRecurso(id, acao === 'aprovar_recurso', dados.texto, quem);
      else r = { ok: false, motivo: 'tipo' };
      if (!r.ok) return r;
      if (acao === 'evidencia') store.resolver(c.ocorrenciaId, dados.texto);
      const b = GC.data.bairros.find((x) => x.id === c.retrato.bairroId);
      if (GC.auditar) GC.auditar(AUDITORIA_COBRANCA[acao], { alvo: `${c.retrato.titulo}${b ? ` (${b.nome})` : ''}`, areaAlvo: c.area, detalhe: GC.resumoCobranca(r.cobranca), ref: { tipo: 'ocorrencia', id: c.ocorrenciaId } });
      // O painel já redesenhou no evento da cobrança, mas a gaveta esperou o formulário aberto: agora redesenha.
      if (gaveta.abertaId() === c.ocorrenciaId) gaveta.atualizar(store.buscar(c.ocorrenciaId), true);
      return r;
    }
    // Toda mudança numa cobrança (aqui, na secretaria simulada ou em outra aba) redesenha o painel.
    if (GC.cobrancas) {
      if (GC.CHAVE_COBRANCAS) window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_COBRANCAS) GC.cobrancas.recarregar(); });
      // Regras de alerta mudadas em outra aba: a store relê, redesenha e solta o que voltou a valer.
      if (GC.CHAVE_REGRAS) window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_REGRAS) GC.regrasAlerta.recarregar(); });
      GC.cobrancas.assinar(() => render());
    }

    // Operação da pasta (js/operacao.js): o secretário despacha, marca chegada, resolve, devolve e junta.
    // Cada gesto é aplicado na store desta aba e vai para o registro, que as outras abas aplicam nas delas.
    const opAplicados = new Set();
    const bytesDaFoto = (foto) => Math.round((String(foto).split(',')[1] || '').length * 0.75);
    // Resolver, devolver e juntar pedem confirmação. Desfeito, o gesto vai como "desfazer" às outras abas.
    function operarNaOcorrencia(acao, oid, dados = {}) {
      const o = store.buscar(oid);
      if (o && desfazerApp.confirmarAntes(`operacao.${acao}`, o, dados, (d) => operarNaOcorrencia(acao, oid, d))) return { ok: false, motivo: 'confirmar' };
      return desfazerApp.com(() => operarNaOcorrenciaDeVez(acao, oid, dados), {
        rotulo: rotuloAcao(`operacao_${acao}`, tituloDe(o)),
        ocorrencias: [oid, dados.principal],
        operacao: true,
      });
    }
    function operarNaOcorrenciaDeVez(acao, oid, dados = {}) {
      const o = store.buscar(oid);
      if (!o) return { ok: false, motivo: 'estado' };
      // Gestos de prazo (js/prazos.js, fase 2): permissão própria; aprovar e recusar são o "decidir" do prefeito.
      const doPrazo = (GC.TIPOS_PRAZO || []).includes(acao) || acao === 'aprovar_prazo' || acao === 'recusar_prazo';
      if (doPrazo) return operarNoPrazo(acao, o, dados);
      if (!GC.podeOperar(acao, o)) return { ok: false, motivo: 'permissao' };
      if (acao === 'resolver' && !String(dados.texto || '').trim()) return { ok: false, motivo: 'texto' };
      if (acao === 'resolver' && dados.foto && bytesDaFoto(dados.foto) > GC.FOTO_MAX_BYTES) return { ok: false, motivo: 'foto_grande' };
      if (acao === 'devolver' && !dados.para) return { ok: false, motivo: 'para' };
      if (acao === 'devolver' && !String(dados.motivo || '').trim()) return { ok: false, motivo: 'motivo' };
      if (acao === 'juntar' && !dados.principal) return { ok: false, motivo: 'principal' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : 'Secretaria';
      const antes = { area: o.area, tipo: o.tipo, titulo: o.titulo, bairroId: o.bairroId };
      const texto = String(dados.texto || '').trim();
      const evento = { tipo: acao, oid, equipeId: dados.equipeId || null, para: dados.para || null, motivo: String(dados.motivo || '').trim(), principal: dados.principal || null, usuarioId: dados.usuarioId || null, texto, foto: dados.foto || null, quem, t: GC.agora() };
      // Resolver com cobrança aberta: a mesma evidência encerra a cobrança (o prefeito vê nos dois lugares).
      const c = acao === 'resolver' && GC.cobrancas ? GC.cobrancas.aberta(oid) : null;
      if (c) GC.cobrancas.encerrar(c.id, { texto, foto: dados.foto || null }, quem);
      if (!GC.aplicarOperacao(store, evento)) return { ok: false, motivo: 'estado' };
      const gravado = GC.operacao.registrar(Object.assign({}, evento, { area: antes.area, tipoOcorrencia: antes.tipo, titulo: antes.titulo }));
      if (gravado) opAplicados.add(gravado.id);
      const b = GC.data.bairros.find((x) => x.id === antes.bairroId);
      const detalhe = acao === 'despachar' ? GC.nomeEquipe(evento.equipeId)
        : acao === 'devolver' ? `para ${GC.data.areas.find((a) => a.id === evento.para).secretaria.nome}: ${evento.motivo}`
          : acao === 'juntar' ? `a "${(store.buscar(evento.principal) || {}).titulo}"`
            : acao === 'delegar' ? (evento.usuarioId ? `a ${(GC.buscarUsuario(evento.usuarioId) || {}).nome}` : 'de volta ao secretário') : texto;
      if (GC.auditar) GC.auditar(`operacao_${acao}`, { alvo: `${antes.titulo}${b ? ` (${b.nome})` : ''}`, areaAlvo: antes.area, detalhe, ref: { tipo: 'ocorrencia', id: antes.id } });
      if (gaveta.abertaId() === oid) gaveta.atualizar(store.buscar(oid), true);
      return { ok: true };
    }
    // Prazo: pausar, retomar, pedir mais prazo (a pasta) e aprovar ou recusar o pedido (o prefeito).
    // Vai para o registro de operação, como os outros gestos, e para a auditoria (prazo_*).
    function operarNoPrazo(acao, o, dados = {}) {
      const decidir = acao === 'aprovar_prazo' || acao === 'recusar_prazo' || acao === 'decidir_prazo';
      if (!GC.podeNoPrazo(decidir ? 'decidir' : acao, o)) return { ok: false, motivo: 'permissao' };
      const motivoPausa = String(dados.motivoPausa || '');
      const texto = String(dados.texto || '').trim();
      if (acao === 'pausar' && !GC.MOTIVOS_PAUSA[motivoPausa]) return { ok: false, motivo: 'motivo_pausa' };
      if (acao === 'pausar' && motivoPausa === 'outro' && !texto) return { ok: false, motivo: 'texto_pausa' };
      const horas = Number(String(dados.horas || '').replace(',', '.'));
      if (acao === 'prorrogar' && !(horas > 0 && horas * 60 >= 10 && horas <= 720)) return { ok: false, motivo: 'horas' };
      if (acao === 'prorrogar' && !String(dados.motivo || '').trim()) return { ok: false, motivo: 'motivo_prazo' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : decidir ? 'Prefeito(a)' : 'Secretaria';
      const tipo = decidir ? 'decidir_prazo' : acao;
      const evento = { tipo, oid: o.id, motivoPausa, texto, minutos: Math.round(horas * 60) || null, motivo: String(dados.motivo || '').trim(),
        aprovar: acao === 'aprovar_prazo' || (acao === 'decidir_prazo' && !!dados.aprovar), quem, t: GC.agora() };
      const pedido = decidir ? GC.prorrogacaoPendente(o) : null;
      if (!GC.aplicarOperacao(store, evento)) return { ok: false, motivo: 'estado' };
      const gravado = GC.operacao.registrar(Object.assign({}, evento, { area: o.area, tipoOcorrencia: o.tipo, titulo: o.titulo }));
      if (gravado) opAplicados.add(gravado.id);
      const b = GC.data.bairros.find((x) => x.id === o.bairroId);
      const ultimo = (o.prorrogacoes || [])[(o.prorrogacoes || []).length - 1];
      const detalhe = tipo === 'pausar' ? `${GC.MOTIVOS_PAUSA[motivoPausa]}${texto ? ` · ${texto}` : ''}`
        : tipo === 'retomar' ? 'Prazo voltou a contar'
          : tipo === 'prorrogar' ? `Mais ${GC.tempoTexto(evento.minutos)} para ${GC.FASES_PRAZO[ultimo.fase]} (${ultimo.estado === 'automatica' ? 'valeu na hora' : 'aguarda o prefeito'}) · ${evento.motivo}`
            : `${evento.aprovar ? 'Aprovou' : 'Recusou'} mais ${GC.tempoTexto(pedido.minutos)} para ${GC.FASES_PRAZO[pedido.fase]}`;
      if (GC.auditar) GC.auditar(`prazo_${tipo === 'decidir_prazo' ? 'decidir' : tipo}`, { alvo: `${o.titulo}${b ? ` (${b.nome})` : ''}`, areaAlvo: o.area, detalhe, ref: { tipo: 'ocorrencia', id: o.id } });
      if (gaveta.abertaId() === o.id) gaveta.atualizar(store.buscar(o.id), true);
      render();
      return { ok: true };
    }
    // Pedido de ajuda entre secretarias (js/ajudas.js). "pedir" recebe o id da ocorrência; o resto, o do pedido.
    const AUDITORIA_AJUDA = { pedir: 'ajuda_pedir', aceitar: 'ajuda_aceitar', recusar: 'ajuda_recusar', concluir: 'ajuda_concluir', escalar: 'ajuda_escalar', determinar: 'ajuda_determinar', arquivar: 'ajuda_arquivar' };
    function agirNaAjuda(acao, id, dados = {}) {
      const a = GC.ajudas && acao !== 'pedir' ? GC.ajudas.buscar(id) : null;
      if (a && desfazerApp.confirmarAntes(`ajuda.${acao}`, a, dados, (d) => agirNaAjuda(acao, id, d))) return { ok: false, motivo: 'confirmar' };
      const o = acao === 'pedir' ? store.buscar(id) : null;
      return desfazerApp.com(() => agirNaAjudaDeVez(acao, id, dados), {
        rotulo: rotuloAcao(AUDITORIA_AJUDA[acao], o ? tituloDe(o) : a ? a.retrato.titulo : ''),
        ocorrencias: [o ? o.id : a ? a.ocorrenciaId : null],
      });
    }
    function agirNaAjudaDeVez(acao, id, dados = {}) {
      const aj = GC.ajudas;
      if (!aj || !AUDITORIA_AJUDA[acao]) return { ok: false, motivo: 'estado' };
      const alvo = acao === 'pedir' ? store.buscar(id) : aj.buscar(id);
      if (!alvo) return { ok: false, motivo: 'estado' };
      if (!GC.podeNaAjuda(acao, alvo)) return { ok: false, motivo: 'permissao' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : GC.visaoDe(perfil) === 'pasta' ? 'Secretaria' : 'Prefeito(a)';
      let r;
      if (acao === 'pedir') r = aj.pedir(alvo, { para: dados.para, tipo: dados.tipo, texto: dados.texto }, quem);
      else if (acao === 'aceitar') r = aj.aceitar(id, dados.minutos, dados.texto, quem);
      else if (acao === 'recusar') r = aj.recusar(id, dados.texto, quem);
      else if (acao === 'concluir') r = aj.concluir(id, dados.texto, quem);
      else if (acao === 'escalar') r = aj.escalar(id, dados.texto, quem);
      else if (acao === 'determinar') r = aj.determinar(id, dados.texto, quem);
      else r = aj.arquivar(id, dados.texto, quem);
      if (!r.ok) return r;
      const a = r.ajuda;
      const b = GC.data.bairros.find((x) => x.id === a.retrato.bairroId);
      const sec = (x) => GC.data.areas.find((y) => y.id === x).secretaria.nome;
      if (GC.auditar) GC.auditar(AUDITORIA_AJUDA[acao], { alvo: `${a.retrato.titulo}${b ? ` (${b.nome})` : ''}`, areaAlvo: a.de, ref: { tipo: 'ocorrencia', id: a.ocorrenciaId }, detalhe: `${sec(a.de)} → ${sec(a.para)}: ${GC.PEDIDOS_AJUDA[a.tipo]}${dados.texto ? ` · ${dados.texto}` : ''}` });
      if (gaveta.abertaId() === a.ocorrenciaId) gaveta.atualizar(store.buscar(a.ocorrenciaId), true);
      return r;
    }
    if (GC.ajudas) {
      if (GC.CHAVE_AJUDAS) window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_AJUDAS) GC.ajudas.recarregar(); });
      GC.ajudas.assinar(() => render());
    }

    // Mais ações do prefeito (js/acoes-prefeito.js): delegar, pedir explicação e adiar com motivo. Na ocorrência
    // (delegar, explicar, adiar) o id é o dela; no resto, o do registro. Quem pode: GC.podeNaAcaoPrefeito.
    const AUDITORIA_ACAO_PREFEITO = {
      delegar: 'prefeito_delegar', retomar: 'prefeito_retomar', retornar: 'delegacao_retornar',
      explicar: 'prefeito_explicacao', responder: 'explicacao_responder', perguntar: 'explicacao_perguntar', lida: 'explicacao_lida',
      adiar: 'prefeito_adiar', desfazer: 'prefeito_desfazer_adiamento',
      // segunda leva (spec 2026-11-13): os três primeiros mudam a ocorrência e vão pelo registro da operação
      definir_pasta: 'prefeito_definir_pasta', reabrir: 'prefeito_reabrir', falso_alarme: 'prefeito_falso_alarme',
      orgao: 'prefeito_orgao', retorno_orgao: 'orgao_retorno', avisar: 'prefeito_aviso', retirar_aviso: 'prefeito_retirar_aviso',
      reconhecer: 'prefeito_reconhecer', agendar: 'prefeito_agendar', agenda_feita: 'agenda_feita', agenda_cancelar: 'agenda_cancelar',
      seguir: 'acompanhar',
    };
    const NA_OCORRENCIA = ['delegar', 'explicar', 'adiar', 'definir_pasta', 'reabrir', 'falso_alarme', 'orgao', 'avisar', 'reconhecer', 'agendar', 'seguir'];
    const DA_STORE = ['definir_pasta', 'reabrir', 'falso_alarme'];
    // Antes de abrir a confirmação: o formulário está completo? (senão a janela abriria para nada)
    function faltaNaAcao(acao, d) {
      const t = String(d.texto || '').trim();
      if (acao === 'definir_pasta') return !d.para ? 'para' : !t ? 'texto' : null;
      if (acao === 'falso_alarme' || acao === 'reabrir') return !d.motivo ? 'motivo' : d.motivo === 'outro' && !t ? 'texto' : null;
      if (acao === 'orgao') return !d.orgao ? 'orgao' : d.orgao === 'outro' && !String(d.nomeOrgao || '').trim() ? 'nome_orgao' : !t ? 'texto' : !(d.dias > 0) ? 'dias' : null;
      if (acao === 'avisar') return !t ? 'texto' : null;
      return null;
    }
    function agirNaAcaoPrefeito(acao, id, dados = {}) {
      const naOc = NA_OCORRENCIA.includes(acao);
      const x = naOc ? store.buscar(id) : GC.acoesPrefeito && GC.acoesPrefeito.buscar(id);
      // Definir a pasta, falso alarme, ofício e aviso público pedem confirmação (texto em GC.ACOES_CRITICAS).
      if (x && naOc && !dados.confirmado) {
        const falta = faltaNaAcao(acao, dados);
        if (falta) return { ok: false, motivo: falta };
        if (desfazerApp.confirmarAntes(`acompanhar.${acao}`, x, dados, (d) => agirNaAcaoPrefeito(acao, id, d))) return { ok: false, motivo: 'confirmar' };
      }
      const seguindo = acao === 'seguir' && x && GC.acoesPrefeito && GC.usuarioAtual && GC.usuarioAtual() && GC.acoesPrefeito.acompanhamento(x.id, GC.usuarioAtual().id);
      return desfazerApp.com(() => agirNaAcaoPrefeitoDeVez(acao, id, dados), {
        rotulo: acao === 'seguir' ? `${seguindo ? 'Deixou de acompanhar' : 'Passou a acompanhar'}: ${tituloDe(x)}` : rotuloAcao(AUDITORIA_ACAO_PREFEITO[acao], x ? (naOc ? tituloDe(x) : x.retrato.titulo) : ''),
        ocorrencias: [x ? (naOc ? x.id : x.ocorrenciaId) : null],
        operacao: DA_STORE.includes(acao),
      });
    }
    // Gestos do gabinete que mudam a ocorrência: aplicados aqui e gravados no registro da operação (as outras abas aplicam).
    function gestoDoGabinete(acao, o, dados, quem) {
      const evento = { tipo: acao, oid: o.id, para: dados.para || null, motivo: acao === 'definir_pasta' ? String(dados.texto || '').trim() : dados.motivo, texto: String(dados.texto || '').trim(), quem, t: GC.agora() };
      const antes = { area: o.area, tipo: o.tipo, titulo: o.titulo };
      if (!GC.aplicarOperacao(store, evento)) return { ok: false, motivo: 'estado' };
      const gravado = GC.operacao && GC.operacao.registrar(Object.assign({}, evento, { area: antes.area, tipoOcorrencia: antes.tipo, titulo: antes.titulo }));
      if (gravado) opAplicados.add(gravado.id);
      return { ok: true, registro: { retrato: { titulo: o.titulo, bairroId: o.bairroId }, area: antes.area, ocorrenciaId: o.id, texto: evento.texto } };
    }
    function agirNaAcaoPrefeitoDeVez(acao, id, dados = {}) {
      const ap = GC.acoesPrefeito;
      if (!ap || !AUDITORIA_ACAO_PREFEITO[acao]) return { ok: false, motivo: 'estado' };
      const naOcorrencia = NA_OCORRENCIA.includes(acao);
      const alvo = naOcorrencia ? store.buscar(id) : ap.buscar(id);
      if (!alvo) return { ok: false, motivo: 'estado' };
      if (!GC.podeNaAcaoPrefeito(acao, alvo)) return { ok: false, motivo: 'permissao' };
      const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
      const quem = u ? u.nome : GC.visaoDe(perfil) === 'pasta' ? 'Secretaria' : 'Prefeito(a)';
      const de = { usuarioId: u ? u.id : null, quem };
      let r;
      if (DA_STORE.includes(acao)) r = gestoDoGabinete(acao, alvo, dados, quem);
      else if (acao === 'orgao') r = ap.acionarOrgao(alvo, { orgao: dados.orgao, nomeOrgao: dados.nomeOrgao, texto: dados.texto, dias: dados.dias }, de);
      else if (acao === 'retorno_orgao') r = ap.retornoOrgao(id, dados.texto, quem);
      else if (acao === 'avisar') r = ap.avisarPopulacao(alvo, { texto: dados.texto }, de);
      else if (acao === 'retirar_aviso') r = ap.retirarAviso(id, quem);
      else if (acao === 'reconhecer') r = ap.reconhecer(alvo, dados.texto, de);
      else if (acao === 'agendar') r = ap.agendar(alvo, { forma: dados.forma, quando: dados.quando, texto: dados.texto }, de);
      else if (acao === 'agenda_feita') r = ap.concluirAgenda(id, dados.texto, quem);
      else if (acao === 'agenda_cancelar') r = ap.cancelarAgenda(id, quem);
      else if (acao === 'seguir') r = ap.acompanhar(alvo, de);
      else if (acao === 'delegar') r = ap.delegar(alvo, { para: dados.para, texto: dados.texto }, de);
      else if (acao === 'explicar') r = ap.pedirExplicacao(alvo, dados.texto, de);
      else if (acao === 'adiar') r = ap.adiar(alvo, { motivo: dados.motivo, texto: dados.texto, horas: dados.horas }, de);
      else if (acao === 'retomar') r = ap.retomar(id, dados.texto, quem);
      else if (acao === 'retornar') r = ap.retornar(id, dados.texto, quem);
      else if (acao === 'responder') r = ap.explicar(id, dados.texto, quem);
      else if (acao === 'perguntar') r = ap.perguntarDeNovo(id, dados.texto, quem);
      else if (acao === 'lida') r = ap.darPorExplicada(id, quem);
      else r = ap.desfazerAdiamento(id, quem);
      if (!r.ok) return r;
      const x = r.registro;
      const b = GC.data.bairros.find((y) => y.id === x.retrato.bairroId);
      const comTexto = (base) => `${base}${x.texto ? ` · ${x.texto}` : ''}`;
      const nomeArea = (a) => (GC.data.areas.find((y) => y.id === a) || { secretaria: { nome: a } }).secretaria.nome;
      const detalhe = acao === 'delegar' ? comTexto(`a ${x.paraNome}`)
        : acao === 'adiar' ? `${comTexto(GC.MOTIVOS_ADIAMENTO[x.motivo])} (${x.horas} h)`
          : acao === 'definir_pasta' ? `${nomeArea(dados.para)}: ${x.texto}`
            : acao === 'reabrir' || acao === 'falso_alarme' ? `${(acao === 'reabrir' ? GC.MOTIVOS_REABRIR : GC.MOTIVOS_FALSO_ALARME)[dados.motivo]}${x.texto ? ` · ${x.texto}` : ''}`
              : acao === 'orgao' ? comTexto(`${x.orgaoNome}, retorno em ${x.dias} ${x.dias === 1 ? 'dia' : 'dias'}`)
                : acao === 'agendar' ? `${GC.FORMAS_AGENDA[x.forma]}, ${GC.quandoAgenda(x.quando)}`
                  : acao === 'seguir' ? (x.estado === 'ativo' ? 'Passou a acompanhar' : 'Deixou de acompanhar')
                    : String(dados.texto || '').trim() || (x.tipo ? GC.resumoAcaoPrefeito(x) : '');
      if (GC.auditar) GC.auditar(AUDITORIA_ACAO_PREFEITO[acao], { alvo: `${x.retrato.titulo}${b ? ` (${b.nome})` : ''}`, areaAlvo: x.area, detalhe, ref: { tipo: 'ocorrencia', id: x.ocorrenciaId } });
      if (gaveta.abertaId() === x.ocorrenciaId) gaveta.atualizar(store.buscar(x.ocorrenciaId), true);
      return r;
    }
    if (GC.acoesPrefeito) {
      if (GC.CHAVE_ACOES_PREFEITO) window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_ACOES_PREFEITO) GC.acoesPrefeito.recarregar(); });
      // Redesenha depois do que está rodando: ao abrir, a operação reaplicada (falso alarme, resolver) fecha registros
      // daqui antes de o painel terminar de montar, e um render() na hora quebraria a reaplicação dos eventos seguintes.
      let redesenhoPedido = false;
      GC.acoesPrefeito.assinar(() => {
        if (redesenhoPedido) return;
        redesenhoPedido = true;
        Promise.resolve().then(() => { redesenhoPedido = false; render(); });
      });
      // Resolvida (ou juntada): a delegação e o adiamento acabam; o pedido de explicação continua devido.
      store.assinar((e) => { if (e.ocorrencia && e.ocorrencia.status === 'resolvida') GC.acoesPrefeito.fecharDaOcorrencia(e.ocorrencia.id); });
    }

    if (GC.operacao) {
      // Ao abrir: aplica o que já está no registro (a operação sobrevive a recarregar a página).
      const aplicarPendentes = () => GC.operacao.pendentes(opAplicados).map((e) => {
        opAplicados.add(e.id);
        return GC.aplicarOperacao(store, e) ? e : null;
      }).filter(Boolean);
      aplicarPendentes();
      if (GC.CHAVE_OPERACAO) {
        window.addEventListener('storage', (e) => {
          if (e.key !== GC.CHAVE_OPERACAO) return;
          aplicarPendentes().forEach((ev) => GC.operacao.avisarRemoto(ev));
          render();
        });
      }
    }

    // "satisfação" liga/desliga o destaque dos bairros com menor satisfação.
    let satisfacaoNoMapa = false;
    function marcarSatisfacao(ativo) {
      satisfacaoNoMapa = ativo;
      if (typeof dashboard !== 'undefined') dashboard.marcarNumero('satisfacaoPct', ativo);
    }

    // Números do cabeçalho: os três primeiros filtram (clicar de novo desfaz); satisfação pergunta à IA.
    function clicarNumero(novo, chave) {
      if (chave === 'satisfacaoPct') {
        if (satisfacaoNoMapa) return mapa.limparEVoltar();
        abrirCopiloto();
        perguntar('Como está a satisfação por bairro?');
        return;
      }
      recorte = recorte === novo ? null : novo;
      render();
      if (telas.tela() !== 'painel') rotas.ir({ tela: 'painel' }); // filtrou: mostra o mapa
    }

    // Troca os bairros em foco (filtro). O painel do bairro que saiu de foco fecha junto.
    function definirBairros(lista) {
      bairros = lista.slice();
      mapa.destacarBairro(bairros);
      fecharInfoBairroSeSaiu();
      render();
    }
    // Atalhos de um bairro só (widgets, seletor): foca aquele bairro; o mesmo de novo (ou null) desfaz.
    function selecionarBairro(id) {
      definirBairros(!id || (bairros.length === 1 && bairros[0] === id) ? [] : [id]);
    }

    // Seletor de bairro (visão geral): escolhe exatamente aquele bairro (ou nenhum).
    function escolherBairro(id) {
      const alvo = id ? [id] : [];
      if (alvo.join(',') !== bairros.join(',')) definirBairros(alvo);
    }

    function focar(id) {
      const o = store.buscar(id);
      if (o && areas.size && !areas.has(o.area)) { areas.add(o.area); render(); }
      if (o && severidades.size && !severidades.has(o.severidade)) { severidades.add(o.severidade); render(); }
      // Escondida por afetados/tempo/origem: solta esses filtros para a ocorrência aparecer no mapa.
      if (o && !GC.filtrarPorAtributos([o], atributos).length) { atributos = Object.assign({}, SEM_ATRIBUTOS); render(); }
      if (o && bairros.length && !bairros.includes(o.bairroId)) definirBairros([]);
      subirAoMapa();
      mapa.focar(id);
    }

    // Detalhes de um alerta (popup "Ver detalhes", cartões de atenção, Central de alertas).
    function detalhar(id, opcoesDetalhe = {}) {
      const o = store.buscar(id);
      if (!o) return;
      subirAoMapa();
      gavetas.abrir('alerta');
      gaveta.abrir(o, opcoesDetalhe);
      mapa.acender(id);
      mapa.mostrarAoLado(id, gavetas.largura());
    }

    // "✨ Perguntar à IA" na gaveta: a IA recebe a ocorrência em foco no contexto.
    function perguntarSobre(id) {
      const o = store.buscar(id);
      if (!o) return;
      const texto = `Me explique o alerta: ${o.titulo}`;
      abrirCopiloto();
      chat.prefeito(texto);
      // Mesmo resolvida (fora da lista de ativas), a ocorrência em foco vai junto para a IA.
      const ctx = contexto();
      if (!ctx.ocorrencias.includes(o)) ctx.ocorrencias = [...ctx.ocorrencias, o];
      chat.ia(daIA(() => GC.ia.perguntar(texto, Object.assign(ctx, { ocorrenciaFoco: id }))));
    }


    function executar(acao) {
      const p = acao.payload || {};
      if (acao.tipo === 'mostrarMapa') noPainel(() => { subirAoMapa(); mapa.mostrarCamada(p.mapa); });
      else if (acao.tipo === 'agir') agir(p.ocorrenciaId, p.acao);
      // Lote da Maia: o botão é a confirmação. Só age onde a ação ainda vale (clicar de novo não cobra duas vezes).
      else if (acao.tipo === 'agirLote') {
        const feitas = (p.ocorrenciaIds || []).filter((id) => GC.acoesDisponiveis(store.buscar(id)).includes(p.acao));
        feitas.forEach((id) => agir(id, p.acao));
        const feito = p.acao === 'cobrar' ? '📣 Cobrança enviada' : '⚡ Prioridade dada';
        chat.ia({ texto: feitas.length
          ? `${feito} para ${feitas.length === 1 ? '1 ocorrência' : `${feitas.length} ocorrências`}. As secretarias respondem por aqui${feitas.length < p.ocorrenciaIds.length ? `; ${p.ocorrenciaIds.length - feitas.length} já tinham recebido uma ação ou foram resolvidas` : ''}.`
          : `Essas ocorrências já foram ${p.acao === 'cobrar' ? 'cobradas' : 'priorizadas'} ou resolvidas: nada a fazer.` }, { atrasoMs: 300 });
      }
      else if (acao.tipo === 'focarOcorrencia') noPainel(() => focar(p.ocorrenciaId));
      // Com tema (botão da pergunta de volta da Maia): a resposta escolhida aparece como fala do usuário.
      else if (acao.tipo === 'perguntar') perguntar(p.texto, p.tema ? { tema: p.tema, rotulo: acao.rotulo } : undefined);
      else if (acao.tipo === 'abrirCamada') abrirCamada(p.camada, p.id);
      else if (acao.tipo === 'abrirTela') rotas.ir(p.rota);
      else if (acao.tipo === 'criarAlerta') {
        const r = store.criarRegra(p);
        const regra = r.id && store.regrasAlerta ? store.regrasAlerta.buscar(r.id) : null;
        const ver = regra ? [{ rotulo: regra.rascunho ? '🔔 Revisar e ativar' : '🔔 Ver a regra', tipo: 'abrirTela', payload: { rota: { tela: 'regras', id: regra.id } } }] : [];
        // Com dado medido no painel, a regra já nasce ativa e mede sozinha; sem, fica rascunho para ligar a um tipo.
        const agora = regra && !regra.rascunho && GC.alvosQuePassam ? GC.alvosQuePassam(regra) : [];
        const texto = !r.id ? 'Não consegui salvar essa regra. Tente de novo pela Central de alertas.'
          : !r.criada ? `Essa regra já existe${regra && regra.rascunho ? ' como rascunho' : ''}: "${p.nome}".`
            : regra.rascunho ? `🔔 Rascunho salvo: "${p.nome}". O painel não mede "${p.expressao}" sozinho: escolha o tipo de alerta e as condições para ativar.`
              : `🔔 Regra ativa: "${regra.nome}" (${regra.palavras}). Ela lê ${GC.FONTES_MEDIDAS[GC.fonteDaRegra(regra)].nome} a cada passo${agora.length ? `; agora ${agora.length === 1 ? '1 passa' : `${agora.length} passam`} do limite (${agora.slice(0, 3).map((a) => a.nome).join(', ')})` : ' e, agora, ninguém passa do limite'}. Alerta que já está aberto no mesmo bairro não se repete.`;
        chat.ia({ texto, acoes: ver });
        if (r.criada && GC.auditar) {
          GC.auditar('regra_criada', { alvo: p.nome, areaAlvo: (regra && regra.area) || p.area || null, detalhe: regra && !regra.rascunho ? `Da Maia, ativa e medida: ${regra.palavras}` : `Rascunho da Maia: ${regra ? regra.expressao : p.expressao}` });
        }
      }
    }

    // Fronteira com a IA: aceita resposta síncrona ou Promise (IA real) e nunca deixa o chat travar.
    function daIA(chamada) {
      return Promise.resolve().then(chamada).then(GC.sanearResposta, (erro) => {
        console.error(erro);
        return GC.sanearResposta(null);
      });
    }

    // No mapa, a camada da resposta aparece na hora. Com uma tela aberta, a resposta
    // ganha "🗺 Ver no mapa" em vez de tirar o prefeito da tela onde ele está.
    // opcoes.tema: o tema já escolhido (a Maia perguntou de volta); opcoes.rotulo: o que aparece como fala.
    function perguntar(texto, opcoes = {}) {
      chat.prefeito(opcoes.rotulo || texto);
      // A memória da conversa atual vai junto: "e no mês passado?" continua a pergunta anterior.
      // A tela aberta (gabinete, relatório, Resumo do dia, Alertas) vai em foco: js/app/maia-telas.js.
      const foco = opcoes.foco || (GC.focoMaiaAtual ? GC.focoMaiaAtual() : null);
      const ctx = Object.assign(contexto(), { memoria: chat.memoria() }, opcoes.tema ? { tema: opcoes.tema } : {}, foco ? { foco } : {});
      const resposta = daIA(() => GC.ia.perguntar(texto, ctx)).then((r) => {
        const temas = r && GC.ia.areasDoTema ? GC.ia.areasDoTema(r.cenario) : null;
        if (areasPerfil && temas && !temas.some((a) => areasPerfil.includes(a))) {
          return { texto: `Como gestor(a) da ${nomeSecretaria(areasPerfil[0])}, você vê os dados da sua pasta. Esse tema é de outra secretaria: peça ao Gabinete do Prefeito ou pergunte sobre a ${nomeSecretaria(areasPerfil[0])}.` };
        }
        if (r && r.mapa && telas.tela() !== 'painel' && !(r.acoes || []).some((a) => a.tipo === 'mostrarMapa')) {
          r.acoes = [...(r.acoes || []), { rotulo: '🗺 Ver no mapa', tipo: 'mostrarMapa', payload: { mapa: r.mapa } }];
        }
        return r;
      });
      chat.ia(resposta).then((r) => {
        if (!r || !r.mapa || telas.tela() !== 'painel') return;
        mapa.mostrarCamada(r.mapa);
        marcarSatisfacao(r.cenario === 'satisfacao');
      });
    }

    // ---- a cidade anda sozinha: ocorrências novas, secretarias respondendo, aviso e Maia (js/app/simulacao.js) ----
    GC.criarAppSimulacao(app);


    // ---- doca: Resumo do dia, Resumo da semana e a gaveta de Indicadores (js/app/doca.js) ----
    const doca = GC.criarAppDoca(app);

    // ---- a Maia nas telas: botões "Perguntar à Maia" e o contexto da tela aberta (js/app/maia-telas.js) ----
    if (GC.criarAppMaiaTelas) GC.criarAppMaiaTelas(app);

    // Esc volta um passo por vez: gaveta → tela sobre o mapa → popup/camada/foco → bairro.
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || telao.ativo()) return; // no telão, o Esc é dele (sai do modo)
      if (document.querySelector('dialog[open]')) return; // com um modal aberto (detalhes do widget), o Esc fecha só ele
      if (gavetas.fechar()) { ev.stopImmediatePropagation(); return; }
      // Com o calendário aberto, o Esc fecha só ele; o próximo fecha a linha do tempo.
      if (linhaTempo.aberta()) { if (!linhaTempo.fecharCalendario()) linhaTempo.fechar(); ev.stopImmediatePropagation(); return; }
      if (telas.tela() !== 'painel') { rotas.ir({ tela: 'painel' }); ev.stopImmediatePropagation(); return; }
      const { resumoDia, resumoSemana, telaIndicadores, btnDash } = doca;
      const dashAberto = doca.dashAberto();
      if (resumoDia.aberto()) { resumoDia.alternar(true); $('btn-resumo-dia').focus(); ev.stopImmediatePropagation(); return; }
      if (resumoSemana.aberto()) { resumoSemana.alternar(true); $('btn-resumo-semana').focus(); ev.stopImmediatePropagation(); return; }
      // Ficha de indicador aberta: o Esc fecha só ela (volta à lista).
      if (dashAberto && !$('tela-indicadores').hidden && telaIndicadores.fichaAberta()) { rotas.ir({ tela: 'indicadores', alvo: null }); ev.stopImmediatePropagation(); return; }
      if (dashAberto && widgetsUI.editando()) { widgetsUI.alternarEdicao(false); $('dash-editar').focus(); ev.stopImmediatePropagation(); return; }
      if (dashAberto) { doca.fecharDashboard(); btnDash.focus(); ev.stopImmediatePropagation(); return; }
      if (mapa.temAlgoAberto()) mapa.limparEVoltar();
      else if (bairros.length) definirBairros([]);
    }, true);
    // ---- painel Camadas (js/app/camadas.js) ----
    const camadas = GC.criarAppCamadas(app);
    $('painel-camadas').addEventListener('change', () => atualizarVista());

    // ---- cabeçalho: botão Alertas, cidade, perfil, relógio e painéis suspensos (js/app/cabecalho.js) ----
    const cabecalho = GC.criarAppCabecalho(app);
    // ---- modo de crise: faixa, relógio da crise e vista "Sala de crise" (js/app/modo-crise.js) ----
    modoCrise = GC.criarAppModoCrise ? GC.criarAppModoCrise(app) : null;

    // Abertura: a visualização em uso (lembrada no navegador) define filtros e widgets.
    if (!location.hash && GC.rotaInicialDoPerfil) history.replaceState(null, '', GC.hashDe(GC.rotaInicialDoPerfil()));
    const rotas = GC.criarRotas(telas.mostrarTela);
    const vistaSetor = areasPerfil && GC.vistaDoSetor ? GC.vistaDoSetor(areasPerfil[0]) : null;
    aplicarEstado(vistas.selecionar(vistaSetor || vistas.atual().id));
    // Widgets da Maia que ficaram ligados voltam ao topo do dashboard (a visualização não os conhece).
    const iaLigados = widgetsIA ? widgetsIA.ligados().filter((id) => !widgetsCfg.ativos.includes(id)) : [];
    if (iaLigados.length) aplicarEstado({ filtros: estadoFiltros(), widgets: Object.assign({}, widgetsCfg, { ativos: [...iaLigados, ...widgetsCfg.ativos] }) });
    rotas.iniciar();
    setTimeout(() => mapa.redimensionar(), 320); // enquadra a cidade depois que o layout assentou
    // Ações prontas na caixa da Maia (js/ia/acoes-prontas.js): seguem o perfil e a tela aberta.
    if (GC.acoesProntasMaia) chat.acoesProntas(() => GC.acoesProntasMaia({ perfil: GC.perfil, foco: GC.focoMaiaAtual ? GC.focoMaiaAtual() : null, sugestoes: GC.ia.sugestoes }));
    else chat.sugestoes(GC.ia.sugestoes);
    const k = store.kpis(areasPerfil);
    const maisAtrasada = store.atencao(areasPerfil).cartoes[0];
    // A conversa de hoje volta como estava; o cumprimento é só na primeira do dia (tom-de-voz.md).
    const retomou = chat.retomar();
    if (retomou) { /* conversa retomada: sem cumprimento de novo */ } else if (areasPerfil) {
      chat.ia({
        texto: `${saudacao()}, secretário(a). A ${nomeSecretaria(areasPerfil[0])} tem ${k.criticas} ocorrências críticas e ${k.estouradas} com prazo estourado. Este painel mostra só a sua pasta.`,
        acoes: maisAtrasada ? [{ rotulo: 'Ver a mais atrasada', tipo: 'focarOcorrencia', payload: { ocorrenciaId: maisAtrasada.id } }] : [],
      }, { atrasoMs: 1200 });
    } else if (!ehCidadao) chat.ia({
      texto: `${saudacao()}, prefeito. ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} tem ${k.criticas} ocorrências críticas e ${k.estouradas} com prazo estourado. As secretarias já recebem tudo automaticamente; em 🔔 Alertas ficam só as que precisam da sua atenção.`,
      acoes: maisAtrasada ? [{ rotulo: 'Ver a mais atrasada', tipo: 'focarOcorrencia', payload: { ocorrenciaId: maisAtrasada.id } }] : [],
    }, { atrasoMs: 1200 });
  });
})(window.GC = window.GC || {});
