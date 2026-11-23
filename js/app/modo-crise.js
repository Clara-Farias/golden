(function (GC) {
  // Modo de crise no painel: a faixa embaixo do cabeçalho, o relógio da crise e a vista "Sala de crise".
  // A lógica (nível, principal, vista, texto da faixa) mora em js/modo-crise.js; aqui só desenho e entrar/sair.
  // O painel nunca troca sozinho a vista de quem está olhando outra coisa: só quem convocou entra direto
  // (convocou), os outros entram pelo botão da faixa. Ao sair (ou quando o último gabinete fecha), volta à
  // visualização de antes. Spec: docs/specs/2026-11-17-vila-dourada-modo-de-crise-design.md (fase 1).
  GC.criarAppModoCrise = function (app) {
    const { $, areasPerfil, store } = app;
    const esc = GC.escaparHtml;
    const faixa = $('crise-faixa');
    const topo = document.querySelector('.topo');
    const chip = $('crise-chip');
    if (!faixa || !GC.modoCrise) return { atualizar() {}, convocou() {}, relogio: () => null, modo: () => ({ nivel: 'nenhum' }) };

    // Escolha por gabinete e a visualização de antes: por cidade e por usuário (as abas da mesma pessoa combinam).
    const usuario = GC.usuarioAtual ? GC.usuarioAtual() : null;
    const chave = `gc.modoCrise.${GC.cidade ? GC.cidade.id : 'media'}.${usuario ? usuario.id : 'demo'}`;
    let local = null;
    try { local = window.localStorage; } catch (e) { /* sem armazenamento: em memória */ }
    const prefs = GC.criarPreferenciasCrise(local ? {
      ler: () => JSON.parse(local.getItem(chave)),
      gravar: (o) => local.setItem(chave, JSON.stringify(o)),
    } : null);

    let modo = { nivel: 'nenhum' };
    let naVista = null; // o gabinete cuja vista está aplicada nesta aba
    let aplicando = false; // aplicarEstado chama o render, que chama atualizar: sem volta
    let ultimaFaixa = '';

    const calcular = () => GC.modoCrise({ gabinetes: app.telas.gabinetes.ativos(), areas: areasPerfil, ocorrencias: store.ocorrencias() });
    const noPainel = () => app.telas.tela() === 'painel';
    const rota = () => (app.rotas && app.rotas.atual ? app.rotas.atual() : {});

    function aplicar(estado) {
      aplicando = true;
      try { app.aplicarEstado(estado); } finally { aplicando = false; }
    }

    function entrar() {
      const v = GC.vistaDaCrise(modo, { fixarGabinete: prefs.fixarGabinete() });
      if (!v) return;
      prefs.guardarAnterior(JSON.parse(JSON.stringify(app.estadoAtual())));
      prefs.marcar(modo.principal.id, 'dentro');
      naVista = modo.principal.id;
      aplicar(v);
      desenhar();
    }

    // A visualização de antes; sem ela (outra aba já voltou), a cidade inteira sem camadas.
    function voltar() {
      const anterior = prefs.tirarAnterior();
      naVista = null;
      const cidade = (GC.VISTAS_PRONTAS || [])[0];
      aplicar(anterior || { filtros: {}, widgets: cidade ? cidade.widgets : undefined, mapa: { camadas: [] } });
    }

    // "Gabinete no mapa": fixa ou solta o widget do gabinete sobre o mapa, só ele (filtros, camadas e os outros
    // fixados ficam). A escolha vale para as próximas vezes que a pessoa entrar na vista.
    const gabineteFixado = () => ((app.estadoAtual().widgets || {}).fixados || []).includes('crise');
    function fixarGabinete(sim) {
      prefs.marcarFixarGabinete(sim);
      const e = app.estadoAtual();
      const outros = (e.widgets.fixados || []).filter((id) => id !== 'crise');
      const fixados = sim ? ['crise', ...outros].slice(0, GC.MAX_FIXADOS_MAPA || 4) : outros;
      const ativos = sim && !(e.widgets.ativos || []).includes('crise') ? ['crise', ...(e.widgets.ativos || [])] : e.widgets.ativos;
      aplicar({ filtros: e.filtros, widgets: Object.assign({}, e.widgets, { fixados, ativos }) });
      desenhar();
    }

    function sair() {
      if (modo.principal) prefs.marcar(modo.principal.id, 'fora');
      voltar();
      desenhar();
    }

    // Quem convocou o gabinete (ou abriu o preventivo) entra direto na vista ao voltar ao mapa.
    // O gabinete nasce depois do render da ação: a faixa aparece logo em seguida, sem esperar o próximo passo.
    function convocou(g) { if (g && g.id) { prefs.marcar(g.id, 'dentro'); setTimeout(atualizar, 0); } }

    // Fixar ou soltar a faixa do cabeçalho. Solta, a crise continua à vista num selo na linha de contexto
    // (cor da gravidade), que fixa de novo com um clique. A escolha vale para esta pessoa nesta cidade.
    function fixarFaixa(sim) {
      prefs.marcarFaixaFixa(sim);
      desenhar();
      const alvo = sim ? faixa.querySelector('[data-cf="soltar"]') : chip;
      if (alvo) alvo.focus();
    }
    if (chip) chip.addEventListener('click', () => fixarFaixa(true));

    function desenhar() {
      const f = GC.faixaCrise(modo);
      document.body.classList.toggle('em-crise', !!f && f.nivel === 'crise');
      document.body.classList.toggle('em-prontidao', !!f && f.nivel === 'prontidao');
      const fixa = prefs.faixaFixa();
      topo.classList.toggle('com-crise', !!f && fixa);
      const g = modo.principal;
      const o = g && g.ocorrenciaId ? store.buscar(g.ocorrenciaId) : null;
      const sev = !f ? '' : f.nivel === 'prontidao' ? 'media' : (o && o.severidade) || 'alta';
      if (chip) {
        chip.hidden = !f || fixa;
        if (f && !fixa) {
          const nome = f.neutra ? f.titulo : `${f.rotulo}: ${f.titulo}`;
          chip.dataset.sev = sev;
          chip.title = `${nome}. Clique para fixar a faixa do gabinete no cabeçalho.`;
          chip.setAttribute('aria-label', `${nome}. Fixar a faixa do gabinete no cabeçalho`);
          const html = `<i class="ti ti-${f.nivel === 'crise' ? 'urgent' : 'cloud-storm'}" aria-hidden="true"></i><span>Gabinete</span><i class="ti ti-pin" aria-hidden="true"></i>`;
          if (chip.innerHTML !== html) chip.innerHTML = html;
        }
      }
      if (!f || !fixa) {
        if (!faixa.hidden) { faixa.hidden = true; faixa.innerHTML = ''; ultimaFaixa = ''; }
        return;
      }
      const r = rota();
      const naSala = g && r.tela === 'crise' && r.id === g.id;
      const dentro = g && naVista === g.id && noPainel();
      const partes = f.neutra ? [`há ${f.tempo}`] : [
        `há ${f.tempo}`, f.demandas,
        ...(f.atrasadas ? [`<b class="cf-atrasadas">${f.atrasadas} ${f.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</b>`] : []),
      ];
      const botoes = f.neutra ? '' : [
        f.mais ? `<button type="button" class="cf-botao cf-mais" data-cf="lista">+${f.mais} ${f.mais === 1 ? 'gabinete' : 'gabinetes'}</button>` : '',
        dentro ? (() => {
          const fixo = gabineteFixado();
          return `<button type="button" class="cf-botao cf-fixar" data-cf="fixar" aria-pressed="${fixo}" title="${fixo ? 'Tirar o cartão do gabinete de cima do mapa (continua em Indicadores)' : 'Fixar o cartão do gabinete sobre o mapa'}"><i class="ti ti-${fixo ? 'pinned' : 'pin'}" aria-hidden="true"></i> Gabinete no mapa</button>`;
        })() : '',
        dentro
          ? '<button type="button" class="cf-botao" data-cf="sair">Voltar ao painel normal</button>'
          : `<button type="button" class="cf-botao" data-cf="ver">${naSala ? 'Ver no mapa' : 'Ver como sala de crise'}</button>`,
        naSala ? '' : '<button type="button" class="cf-botao cf-principal" data-cf="sala">Ir para a sala</button>',
      ].join('');
      const soltar = '<button type="button" class="cf-soltar" data-cf="soltar" title="Desafixar do cabeçalho (fica um selo ao lado da hora)" aria-label="Desafixar a faixa do cabeçalho"><i class="ti ti-pinned" aria-hidden="true"></i></button>';
      const html = `<span class="cf-ic" aria-hidden="true"><i class="ti ti-${f.nivel === 'crise' ? 'urgent' : 'cloud-storm'}"></i></span>
        <span class="cf-texto"><b class="cf-rotulo">${esc(f.neutra ? f.titulo : f.rotulo)}</b>${f.neutra ? '' : `<span class="cf-titulo">${esc(f.titulo)}</span>`}
        <span class="cf-partes">${partes.map((p) => `<span>${p}</span>`).join('')}</span></span>
        <span class="cf-botoes">${botoes}${soltar}</span>`;
      faixa.dataset.sev = sev;
      faixa.dataset.nivel = f.nivel;
      if (html !== ultimaFaixa) { faixa.innerHTML = html; ultimaFaixa = html; }
      if (faixa.hidden) {
        faixa.hidden = false;
        faixa.classList.remove('cf-entrando');
        void faixa.offsetWidth; // o realce de entrada roda uma vez a cada vez que a faixa aparece
        faixa.classList.add('cf-entrando');
      }
    }

    faixa.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cf]');
      if (!b) return;
      const acao = b.dataset.cf;
      if (acao === 'sala' && modo.principal) app.rotas.ir({ tela: 'crise', id: modo.principal.id });
      else if (acao === 'lista') app.rotas.ir({ tela: 'crise' });
      else if (acao === 'sair') sair();
      else if (acao === 'soltar') fixarFaixa(false);
      else if (acao === 'fixar') {
        fixarGabinete(!gabineteFixado());
        const novo = faixa.querySelector('[data-cf="fixar"]');
        if (novo) novo.focus(); // a faixa se redesenha: o foco do teclado fica no botão
      }
      else if (acao === 'ver') {
        if (!noPainel()) app.rotas.ir({ tela: 'painel' });
        entrar();
      }
    });

    // Chamado a cada render: recalcula o modo, entra para quem escolheu "dentro" e volta quando a crise acaba.
    function atualizar() {
      if (aplicando) return;
      modo = calcular();
      prefs.limpar(app.telas.gabinetes.ativos().map((g) => g.id));
      if ((modo.nivel === 'nenhum' || !modo.envolvido) && prefs.anterior()) {
        voltar();
        if (GC.avisoDesfazer) GC.avisoDesfazer('O gabinete foi encerrado. O painel voltou à visualização de antes da crise.', true);
      } else if (modo.principal && noPainel() && naVista !== modo.principal.id && prefs.escolha(modo.principal.id) === 'dentro') {
        entrar();
        return;
      }
      desenhar();
      // Relógio: o tempo da crise; acabou a crise, volta na hora ao "Ao vivo · hora" (sem esperar o tique do cabeçalho).
      const rel = relogio();
      const elRel = $('relogio');
      if (rel) elRel.textContent = rel;
      else if (/^(Crise|Prontidão) há/.test(elRel.textContent)) elRel.textContent = `Ao vivo · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const base = document.title.replace(/^Crise · |^Prontidão · /, '');
      const prefixo = modo.nivel === 'crise' ? 'Crise · ' : modo.nivel === 'prontidao' ? 'Prontidão · ' : '';
      if (document.title !== prefixo + base) document.title = prefixo + base;
    }

    const relogio = () => GC.relogioCrise(modo);

    // Trocar de tela (sair da sala para o mapa) entra na vista de quem escolheu; o andamento das demandas
    // muda na sala sem render geral, então a faixa se refaz sozinha a cada 15 s.
    window.addEventListener('hashchange', () => setTimeout(atualizar, 0));
    setInterval(atualizar, 15000);

    return { atualizar, convocou, relogio, modo: () => modo, entrar, sair };
  };
})(window.GC = window.GC || {});
