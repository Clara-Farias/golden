(function (GC) {
  // Cabeçalho: botão Alertas (contador e dica), altura do topo, seletores de cidade e de perfil, relógio
  // e os painéis suspensos (menu ⋯ e Camadas). Monta depois do Esc geral do app: o Esc dos suspensos vem depois dele.
  const MOTIVO_ALERTA = {
    prazo: ['com prazo estourado', 'com prazo estourado'],
    conjunta: ['envolve várias secretarias', 'envolvem várias secretarias'],
    recorrente: ['caso repetido no bairro', 'casos repetidos no bairro'],
  };

  GC.criarAppCabecalho = function (app) {
    const { $, perfil, areasPerfil, ehCidadao } = app;

    // Botão Alertas do cabeçalho: o número é o da gaveta (segue os filtros). O title diz de onde ele vem
    // (Alertas são exceções, não "críticas": prazo estourado, várias secretarias ou caso repetido) e,
    // com filtro, quantos há no total, que é o número do menu.
    let tituloAlertas = '';
    // cobrancas: quantas cobranças esperam quem está vendo (resposta do secretário, decisão do prefeito).
    function marcarBotaoAlertas(lista, temFiltro, total, cobrancas = 0) {
      const filtrado = temFiltro || lista.length !== total;
      const porMotivo = {};
      lista.forEach((o) => { const m = GC.motivosAtencao(o)[0]; if (m) porMotivo[m.tipo] = (porMotivo[m.tipo] || 0) + 1; });
      const partes = Object.keys(MOTIVO_ALERTA).filter((t) => porMotivo[t]).map((t) => `${porMotivo[t]} ${MOTIVO_ALERTA[t][porMotivo[t] === 1 ? 0 : 1]}`);
      if (cobrancas) partes.push(cobrancas === 1 ? '1 cobrança esperando você' : `${cobrancas} cobranças esperando você`);
      const n = lista.length + cobrancas;
      const qtd = n === 1 ? '1 precisa' : `${n} precisam`;
      const titulo = `Alertas: ${qtd} de você${filtrado ? ` no recorte atual (${total} no total)` : ''}`
        + (partes.length ? `. ${partes.join(' · ')}` : '');
      // O número diz o que conta: "16 para você" sem filtro; com filtro, "2 de 16" (o total do perfil).
      // Em tela estreita fica só o número (css/cabecalho.css esconde o complemento).
      const contador = $('alertas-contador');
      const doTotal = total + cobrancas;
      contador.innerHTML = filtrado && doTotal > n
        ? `${n}<span class="cont-mais"> de ${doTotal}</span>`
        : `${n}<span class="cont-mais"> para você</span>`;
      contador.hidden = !n;
      contador.classList.toggle('filtrado', filtrado);
      if (titulo !== tituloAlertas) {
        tituloAlertas = titulo;
        $('btn-alertas').title = titulo;
        $('btn-alertas').setAttribute('aria-label', titulo);
      }
    }

    // A altura do cabeçalho muda com a largura (quebra de linha): o que vem abaixo dele acompanha.
    const topoEl = document.querySelector('.topo');
    const medirTopo = () => document.documentElement.style.setProperty('--topo-h', `${topoEl.offsetHeight}px`);
    medirTopo();
    if (window.ResizeObserver) new ResizeObserver(medirTopo).observe(topoEl);

    // Cidade da demonstração (pequena, média, grande): trocar recarrega a página com os dados da outra cidade.
    if (GC.cidade) {
      const hab = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi hab.` : `${Math.round(n / 1000)} mil hab.`);
      $('cidade-nome').textContent = GC.cidade.nome;
      document.title = `${GC.cidade.nome} · Golden Atlas`;
      const sel = $('cidade-sel');
      // "marca própria": a cidade tem personalização (Nova Aurora já vem com o exemplo de fábrica).
      const propria = (id) => { try { return !!(GC.personalizacao && GC.personalizacao.daCidade(id).personalizada()); } catch (e) { return false; } };
      sel.innerHTML = GC.CIDADES.map((c) => `<option value="${c.id}"${c.id === GC.cidade.id ? ' selected' : ''}>${GC.escaparHtml(`${c.nome} · ${hab(c.populacao)}${propria(c.id) ? ' · marca própria' : ''}`)}</option>`).join('');
      sel.addEventListener('change', () => {
        const nova = GC.CIDADES.find((c) => c.id === sel.value);
        if (GC.auditar) GC.auditar('trocar_cidade', { alvo: nova ? nova.nome : sel.value, detalhe: `Antes: ${GC.cidade.nome}` });
        GC.escolherCidade(sel.value);
      });
    }

    // Perfil de acesso: rótulo no cabeçalho e seletor no menu ⋯ (trocar recarrega a página, como a cidade).
    if (GC.PERFIS) {
      const esc = GC.escaparHtml;
      // Perfil criado pelo gestor (ou o "Ver como" da tela de perfis): o nome dele vai junto.
      const papel = GC.papelDe ? GC.papelDe(perfil) : null;
      const doPapel = papel && (!papel.sistema || perfil.papel || papel.id === 'diretor_unidade') && GC.perfilRotulo() !== papel.nome ? ` · ${papel.nome}` : '';
      const dica = perfil.papel ? 'Vendo o painel como este perfil. Troque o perfil no menu ⋯ para sair.' : 'Perfil de acesso';
      $('topo-perfil').insertAdjacentHTML('beforeend', `<span class="perfil-chip${perfil.papel ? ' perfil-chip-vendo' : ''}" title="${esc(dica)}">${perfil.papel ? 'Vendo como: ' : ''}${esc(GC.perfilRotulo())}${esc(doPapel)}</span>`);
      document.title = `${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} · ${ehCidadao ? 'Prefeitura' : areasPerfil ? GC.perfilRotulo() : 'Golden Atlas'}`;
      const sel = $('perfil-sel');
      const valor = perfil.id === 'setor' ? `setor:${perfil.area}` : perfil.id;
      const p = (id) => GC.PERFIS.find((x) => x.id === id);
      // Para testar a visão resumida sem mexer na URL (revisão de 19/11): o vice (só resumida) e um diretor de unidade.
      const EXEMPLOS = [
        { valor: 'prefeito::u-vice', usuario: 'u-vice', rotulo: 'Vice-prefeito (só visão resumida)' },
        { valor: 'setor:saude:u-saude-d1', usuario: 'u-saude-d1', rotulo: 'Diretor(a) de unidade · Saúde (começa resumida)' },
      ].filter((x) => !GC.usuarioPorId || GC.usuarioPorId(x.usuario));
      sel.innerHTML = `<option value="prefeito">${esc(p('prefeito').emoji)} Gestor geral (Prefeito)</option>
        <optgroup label="Gestor do setor">${GC.data.areas.map((a) => `<option value="setor:${a.id}">${esc(a.secretaria.nome)}</option>`).join('')}</optgroup>
        <optgroup label="Servidor (portal do servidor)">${GC.data.areas.map((a) => `<option value="servidor:${a.id}">${esc(a.secretaria.nome)}</option>`).join('')}</optgroup>
        <option value="cidadao">${esc(p('cidadao').emoji)} Cidadão</option>
        <optgroup label="Usuários com visão resumida">${EXEMPLOS.map((x) => `<option value="${x.valor}">${esc(x.rotulo)}</option>`).join('')}</optgroup>`;
      const usuarioUrl = new URLSearchParams(window.location.search).get('usuario');
      sel.value = (EXEMPLOS.find((x) => x.usuario === usuarioUrl) || {}).valor || valor;
      $('perfil-desc').textContent = p(perfil.id).descricao;
      sel.addEventListener('change', () => {
        const [id, area, usuario] = sel.value.split(':');
        if (GC.auditar) GC.auditar('trocar_perfil', { alvo: sel.options[sel.selectedIndex].text.trim(), detalhe: `Antes: ${GC.perfilRotulo()}` });
        GC.escolherPerfil(id, area || undefined, usuario || undefined);
      });
    }

    // Conta: "Minha conta" no topo do menu ⋯ com o nome de quem usa o painel. Com login (?login=1), o perfil é
    // o do usuário: o seletor de perfil dá lugar a "Sair". Sem login, "Entrar com usuário" leva à página de entrada.
    const usuario = GC.usuarioAtual ? GC.usuarioAtual() : null;
    if (usuario && $('btn-conta')) {
      $('conta-nome').textContent = usuario.nome;
      $('conta-cargo').textContent = usuario.cargo;
      // Avatar no cabeçalho: é o próprio botão do menu ⋯ (um avatar só; dentro do menu fica o nome e o cargo).
      const avatar = $('btn-mais');
      if (avatar && usuario.iniciais) {
        $('avatar-iniciais').textContent = usuario.iniciais;
        $('avatar-iniciais').hidden = false;
        avatar.classList.add('com-avatar');
        avatar.title = `${usuario.nome}${usuario.cargo ? ` · ${usuario.cargo}` : ''}. Conta e mais opções`;
        avatar.setAttribute('aria-label', `${usuario.nome}: conta e mais opções`);
      }
      $('btn-conta').addEventListener('click', () => app.rotas.ir({ tela: 'conta' }));
      const login = !!GC.loginExigido;
      $('perfil-campo').hidden = login;
      $('perfil-desc').hidden = login;
      $('btn-sair').hidden = !login;
      $('btn-entrar').hidden = login;
      $('btn-sair').addEventListener('click', () => app.telas.sair());
      $('btn-entrar').addEventListener('click', () => { window.location.href = GC.urlEntrar(); });
    }
    // Auditoria e Usuários: no menu ⋯ (o setor vê a da pasta); Privacidade abre a página própria com a cidade.
    if ($('btn-auditoria')) $('btn-auditoria').addEventListener('click', () => app.rotas.ir({ tela: 'auditoria' }));
    if ($('btn-historico-cobrancas')) $('btn-historico-cobrancas').addEventListener('click', () => app.rotas.ir({ tela: 'cobrancas' }));
    if ($('btn-usuarios')) $('btn-usuarios').addEventListener('click', () => app.rotas.ir({ tela: 'usuarios', aba: 'pessoas' }));
    if ($('btn-regras')) $('btn-regras').addEventListener('click', () => app.rotas.ir({ tela: 'regras', id: null }));
    if ($('btn-prazos')) $('btn-prazos').addEventListener('click', () => app.rotas.ir({ tela: 'prazos' }));
    if ($('btn-personalizar')) $('btn-personalizar').addEventListener('click', () => app.rotas.ir({ tela: 'personalizar' }));
    if ($('btn-governanca')) $('btn-governanca').addEventListener('click', () => app.rotas.ir({ tela: 'governanca' }));
    if ($('btn-fontes')) $('btn-fontes').addEventListener('click', () => app.rotas.ir({ tela: 'fontes' }));
    if ($('link-privacidade')) {
      const u = new URL('privacidade.html', window.location.href);
      if (GC.cidade) u.searchParams.set('cidade', GC.cidade.id);
      if (GC.loginExigido) u.searchParams.set('login', '1');
      $('link-privacidade').href = u.toString();
    }

    // "Ao vivo · 23:42" na linha de contexto: dá para conferir se o dado está fresco. A data inteira fica no title.
    const relogio = () => {
      const d = new Date();
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const completa = d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      // Em crise, o relógio vira o tempo da crise ("Crise há 1 h 12", js/app/modo-crise.js); a hora fica no title.
      const crise = app.modoCrise ? app.modoCrise.relogio() : null;
      $('relogio').textContent = crise || `Ao vivo · ${hora}`;
      $('relogio').parentElement.title = `Dados ao vivo · atualizado ${completa}`;
    };
    relogio();
    setInterval(relogio, 30000);

    // ---- painéis suspensos (menu ⋯): fecham no clique fora e no Esc. Camadas é gaveta (js/app.js). ----
    // O menu mora no <body>, fora do palco: o palco (position: fixed) é uma camada própria abaixo das gavetas
    // da direita, e o menu dentro dele ficava atrás de Filtros e Camadas. Ao abrir, ele se alinha ao avatar.
    const menuMais = $('menu-mais');
    document.body.appendChild(menuMais);
    menuMais.classList.add('menu-mais-solto');
    const alinharMenu = () => {
      if (menuMais.hidden) return;
      const r = $('btn-mais').getBoundingClientRect();
      menuMais.style.top = `${Math.round(r.bottom + 8)}px`;
      menuMais.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - r.right))}px`;
    };
    window.addEventListener('resize', alinharMenu);
    const suspensos = [
      { botao: $('btn-mais'), painel: menuMais },
    ];
    function abrirSuspenso(alvo, abrir) {
      suspensos.forEach((s) => {
        const aberto = s === alvo && abrir;
        s.painel.hidden = !aberto;
        if (aberto && s.painel === menuMais) alinharMenu();
        s.botao.setAttribute('aria-expanded', String(aberto));
        s.botao.classList.toggle('ativo', aberto);
      });
    }
    suspensos.forEach((s) => {
      s.botao.addEventListener('click', (ev) => { ev.stopPropagation(); abrirSuspenso(s, s.painel.hidden); });
    });
    document.addEventListener('pointerdown', (ev) => {
      if (!suspensos.some((s) => s.botao.contains(ev.target) || s.painel.contains(ev.target))) abrirSuspenso(null, false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && suspensos.some((s) => !s.painel.hidden)) { abrirSuspenso(null, false); ev.stopImmediatePropagation(); }
    }, true);
    // Itens do menu ⋯ fecham o menu depois de agir (Tour começa; o modo telão abre).
    $('menu-mais').querySelectorAll('.item-mais').forEach((b) => b.addEventListener('click', () => abrirSuspenso(null, false)));
    // Trocar de tela fecha o menu (o Esc geral troca a rota antes de o Esc do menu rodar).
    window.addEventListener('hashchange', () => abrirSuspenso(null, false));
    // Setas para cima e para baixo andam pelos itens e campos do menu; Home e End vão às pontas.
    $('menu-mais').addEventListener('keydown', (ev) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key) || ev.target.tagName === 'SELECT') return;
      const itens = [...$('menu-mais').querySelectorAll('.item-mais, select')].filter((x) => x.offsetParent);
      if (!itens.length) return;
      const i = itens.indexOf(document.activeElement);
      const prox = ev.key === 'Home' ? 0 : ev.key === 'End' ? itens.length - 1
        : ev.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length;
      itens[prox].focus();
      ev.preventDefault();
    });
    $('btn-mais').addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown') return;
      ev.preventDefault();
      abrirSuspenso(suspensos[0], true);
      const primeiro = $('menu-mais').querySelector('.item-mais');
      if (primeiro) primeiro.focus();
    });

    // Aparência (js/personalizacao.js): cores, nome e logo de quem usa o painel, depois do nome da cidade e do título.
    if (GC.personalizacao) GC.personalizacao.aplicar();

    return { marcarBotaoAlertas };
  };
})(window.GC = window.GC || {});
