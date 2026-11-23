(function (GC) {
  // Tela "Usuários e permissões" (#/usuarios e #/usuarios/perfis; #/usuarios/permissoes, de antes, abre Perfis).
  // Pessoas: lista com busca e filtros, cadastrar, editar, desativar/reativar e gerar acesso provisório.
  // Perfis de acesso: js/tela-perfis.js desenha a aba (todos veem o que cada perfil pode; só quem tem 'perfis.gerir' muda).
  // As regras de quem mexe em quem estão em js/usuarios.js (GC.podeGerirUsuario); a tela só esconde o que não pode.
  const esc = (t) => GC.escaparHtml(t);
  const nomePapel = (u) => { const x = GC.papelDoUsuario(u); return x ? x.nome : u.perfil; };
  const SITUACOES = [['ativos', 'Ativos'], ['pendentes', 'Aguardando primeiro acesso'], ['desativados', 'Desativados'], ['todos', 'Todos']];
  const quando = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca entrou');

  // opcoes: { aoAba(aba), aoCriar(d), aoEditar(id, d), aoDesativar(id), aoReativar(id), aoReenviar(id), perfis }
  // perfis: as ações da aba Perfis de acesso (js/tela-perfis.js: aoIr, aoCriar, aoEditar, aoExcluir, aoRestaurar).
  // Cada ação devolve o resultado de js/usuarios.js ({ ok, motivo, erros, usuario, senhaProvisoria }).
  GC.criarTelaUsuarios = function (el, opcoes) {
    // area: '' = todas, '-' = sem secretaria (cidade toda), senão o id da pasta.
    const f = { texto: '', perfil: '', area: '', situacao: 'ativos' };
    let estado = null;
    let assinatura = '';
    let aviso = '';
    const painelPerfis = GC.criarPainelPerfis && opcoes.perfis ? GC.criarPainelPerfis(opcoes.perfis) : null;

    const pode = (alvo, acao) => GC.podeGerirUsuario(estado.autor, alvo, acao);
    const situacao = (u) => (!u.ativo ? 'desativado' : u.provisoria ? 'pendente' : 'ativo');
    const nomeArea = (a) => (a ? estado.nomeArea(a) : '');

    // A casca (título, abas, aviso) nasce uma vez; trocar de aba só marca a aba e redesenha o painel.
    let cascaDe = '';
    function desenharCasca() {
      const { setor } = estado;
      const chave = JSON.stringify([setor, !!(estado.perfis && painelPerfis), pode(null, 'criar')]);
      if (chave === cascaDe && el.querySelector('.us-painel')) return;
      cascaDe = chave;
      el.innerHTML = `
        <header class="sec-topo"><div><h2>👥 Usuários e permissões</h2>
          <p>${setor ? `As pessoas da ${esc(nomeArea(setor))} que acessam o painel, e o que cada perfil pode.` : 'Quem acessa o painel e o que cada perfil pode fazer.'}</p></div>
          <span class="sec-acoes">${pode(null, 'criar') ? '<button type="button" class="btn-primario us-novo"><i class="ti ti-user-plus" aria-hidden="true"></i> Cadastrar usuário</button>' : ''}</span></header>
        <nav class="us-abas" role="tablist" aria-label="Usuários e permissões">
          <a role="tab" href="#/usuarios" data-aba="pessoas"><i class="ti ti-users" aria-hidden="true"></i> Pessoas</a>
          ${estado.perfis && painelPerfis ? '<a role="tab" href="#/usuarios/perfis" data-aba="perfis"><i class="ti ti-shield-cog" aria-hidden="true"></i> Perfis de acesso</a>' : ''}
        </nav>
        <p class="us-aviso" role="status" hidden></p>
        <div class="us-painel"></div>`;
      el.querySelectorAll('[data-aba]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); aviso = ''; opcoes.aoAba(a.dataset.aba); }; });
      const novo = el.querySelector('.us-novo');
      if (novo) novo.onclick = () => abrirFormulario(null);
    }

    function desenhar() {
      const { aba, autor } = estado;
      menusSoltos().forEach((m) => m.remove());
      desenharCasca();
      el.querySelectorAll('[data-aba]').forEach((a) => a.setAttribute('aria-selected', String(a.dataset.aba === aba)));
      const novo = el.querySelector('.us-novo');
      if (novo) novo.hidden = aba !== 'pessoas';
      const p = el.querySelector('.us-aviso');
      p.innerHTML = aviso;
      p.hidden = !aviso;
      if (!aviso) p.classList.remove('us-aviso-erro');
      if (aba === 'perfis' && estado.perfis && painelPerfis) painelPerfis.mostrar(el.querySelector('.us-painel'), estado.perfis);
      else desenharPessoas(autor);
    }

    // ---- Pessoas ----
    function desenharPessoas(autor) {
      const painel = el.querySelector('.us-painel');
      const geral = GC.alcanceUsuarios(autor) === 'cidade';
      // Um cartão só: busca e perfil em cima, a situação em botões com o número, a tabela embaixo.
      painel.innerHTML = `
        <section class="rel-cartao us-pessoas">
          <div class="us-barra">
            <form class="us-filtros" role="search" aria-label="Filtrar usuários">
              <label class="us-busca"><i class="ti ti-search" aria-hidden="true"></i><input type="search" name="texto" value="${esc(f.texto)}" placeholder="Buscar nome, e-mail, cargo ou secretaria…" aria-label="Buscar usuário"></label>
              ${geral ? `<label class="us-sel"><span>Secretaria</span><select name="area"><option value="">Todas</option><option value="-">Cidade toda (sem secretaria)</option>${estado.areas.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}</select></label>
              <label class="us-sel"><span>Perfil</span><select name="perfil"><option value="">Todos</option>${GC.perfisAcesso.lista().map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></label>` : ''}
              <button type="button" class="us-limpar" hidden><i class="ti ti-x" aria-hidden="true"></i> Limpar filtros</button>
            </form>
            <div class="us-situacoes" role="group" aria-label="Situação"></div>
          </div>
          <div class="us-lista"></div>
        </section>`;
      const form = painel.querySelector('form');
      form.onsubmit = (ev) => ev.preventDefault();
      if (form.perfil) { form.perfil.value = f.perfil; form.perfil.onchange = () => { f.perfil = form.perfil.value; desenharTabela(); }; }
      if (form.area) { form.area.value = f.area; form.area.onchange = () => { f.area = form.area.value; desenharTabela(); }; }
      form.texto.oninput = () => { f.texto = form.texto.value; desenharTabela(); };
      painel.querySelector('.us-limpar').onclick = () => {
        Object.assign(f, { texto: '', perfil: '', area: '', situacao: 'ativos' });
        form.texto.value = '';
        if (form.perfil) form.perfil.value = '';
        if (form.area) form.area.value = '';
        desenharTabela();
        form.texto.focus();
      };
      painel.querySelector('.us-situacoes').onclick = (ev) => {
        const b = ev.target.closest('[data-situacao]');
        if (!b) return;
        f.situacao = b.dataset.situacao;
        desenharTabela();
      };
      desenharTabela();
    }

    const naSituacao = (u, sit) => {
      const s = situacao(u);
      if (sit === 'ativos') return s !== 'desativado';
      if (sit === 'pendentes') return s === 'pendente';
      if (sit === 'desativados') return s === 'desativado';
      return true;
    };

    // Busca e perfil, sem a situação (os botões de situação contam sobre isto).
    function noRecorte() {
      const t = f.texto.trim().toLowerCase();
      return estado.usuarios.filter((u) => {
        if (f.perfil && (GC.papelDoUsuario(u) || {}).id !== f.perfil) return false;
        if (f.area && (u.area || '-') !== f.area) return false;
        return !t || [u.nome, u.email, u.cargo, nomeArea(u.area)].join(' ').toLowerCase().includes(t);
      });
    }

    function desenharSituacoes(base) {
      const caixa = el.querySelector('.us-situacoes');
      if (!caixa) return;
      const limpar = el.querySelector('.us-limpar');
      if (limpar) limpar.hidden = !(f.texto.trim() || f.perfil || f.area || f.situacao !== 'ativos');
      caixa.innerHTML = SITUACOES.map(([v, r]) => {
        const n = base.filter((u) => naSituacao(u, v)).length;
        const vazio = !n && v !== 'ativos' && v !== 'todos';
        return `<button type="button" class="us-sit us-sit-${v}" data-situacao="${v}" aria-pressed="${f.situacao === v}"${vazio && f.situacao !== v ? ' hidden' : ''}>${r}<span class="us-sit-n">${n}</span></button>`;
      }).join('');
    }

    function filtrados() {
      const base = noRecorte();
      desenharSituacoes(base);
      return base.filter((u) => naSituacao(u, f.situacao)).sort((a, b) => (a.area ? 1 : 0) - (b.area ? 1 : 0)
        || (estado.areas.findIndex((x) => x.id === a.area) - estado.areas.findIndex((x) => x.id === b.area))
        || (a.perfil === b.perfil ? 0 : a.perfil === 'prefeito' ? -1 : 1)
        || ((GC.nivelDe(a) === 'unidade' ? 1 : 0) - (GC.nivelDe(b) === 'unidade' ? 1 : 0))
        || a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    function desenharTabela() {
      const caixa = el.querySelector('.us-lista');
      menusSoltos().forEach((m) => m.remove()); // menu aberto de uma tabela que vai sumir
      const lista = filtrados();
      const { autor, ultimoAcesso } = estado;
      if (!lista.length) { caixa.innerHTML = '<p class="au-vazio"><i class="ti ti-user-search" aria-hidden="true"></i> Nenhum usuário com esses filtros.</p>'; return; }
      const porGrupo = new Map();
      lista.forEach((u) => porGrupo.set(u.area || '', (porGrupo.get(u.area || '') || 0) + 1));
      const chip = { ativo: '<span class="us-chip us-chip-ok">Ativo</span>', pendente: '<span class="us-chip us-chip-pendente">Aguardando primeiro acesso</span>', desativado: '<span class="us-chip us-chip-off">Desativado</span>' };
      caixa.innerHTML = `<div class="rel-tabela-wrap"><table class="sec-tabela us-tabela">
        <caption class="so-leitor">Usuários do painel</caption>
        <thead><tr><th scope="col">Pessoa</th><th scope="col">Perfil</th><th scope="col">Situação</th><th scope="col">Último acesso</th><th scope="col"><span class="so-leitor">Ações</span></th></tr></thead>
        <tbody>${lista.map((u, i) => {
          // A lista já vem por secretaria: uma linha de grupo quando a pasta muda (só se há mais de uma).
          const grupo = u.area || '';
          const anterior = i ? lista[i - 1].area || '' : null;
          const tituloGrupo = grupo !== anterior && porGrupo.size > 1
            ? `<tr class="us-grupo"><th scope="rowgroup" colspan="5">${esc(grupo ? nomeArea(grupo) : 'Cidade toda')}<small>${porGrupo.get(grupo)} ${porGrupo.get(grupo) === 1 ? 'pessoa' : 'pessoas'}</small></th></tr>` : '';
          const s = situacao(u);
          const eu = u.id === autor.id;
          // Editar e Reativar ficam à vista; o que mexe no acesso (senha, desativar) fica no menu ⋯.
          const noMenu = [
            pode(u, 'editar') && s !== 'desativado' && !eu ? `<button type="button" role="menuitem" data-acao="reenviar" data-id="${esc(u.id)}"><i class="ti ti-key" aria-hidden="true"></i><span>Gerar novo acesso<small>Senha provisória; a atual deixa de valer</small></span></button>` : '',
            s !== 'desativado' && pode(u, 'desativar') && !eu ? `<button type="button" role="menuitem" class="us-menu-perigo" data-acao="desativar" data-id="${esc(u.id)}"><i class="ti ti-user-off" aria-hidden="true"></i><span>Desativar<small>Deixa de entrar no painel</small></span></button>` : '',
          ].filter(Boolean);
          const botoes = [
            pode(u, 'editar') ? `<button type="button" class="us-acao" data-acao="editar" data-id="${esc(u.id)}" title="Editar ${esc(u.nome)}"><i class="ti ti-pencil" aria-hidden="true"></i> Editar</button>` : '',
            s === 'desativado' && pode(u, 'editar') ? `<button type="button" class="us-acao" data-acao="reativar" data-id="${esc(u.id)}" title="Reativar ${esc(u.nome)}"><i class="ti ti-user-check" aria-hidden="true"></i> Reativar</button>` : '',
            noMenu.length ? `<details class="us-mais"><summary class="us-acao us-acao-icone" title="Mais ações" aria-label="Mais ações para ${esc(u.nome)}"><i class="ti ti-dots" aria-hidden="true"></i></summary><div class="us-menu" role="menu" aria-label="Mais ações para ${esc(u.nome)}">${noMenu.join('<hr class="us-menu-sep">')}</div></details>` : '',
          ].join('');
          const visao = (GC.papelDoUsuario(u) || {}).visao === 'pasta' ? 'pasta' : 'cidade';
          return `${tituloGrupo}<tr class="${s === 'desativado' ? 'us-off' : ''}${eu ? ' us-eu' : ''}">
            <td><div class="us-pessoa"><span class="ct-avatar us-avatar us-avatar-${visao}" aria-hidden="true">${esc(u.iniciais)}</span><span class="us-pessoa-txt"><b>${esc(u.nome)}${eu ? ' <span class="us-voce">você</span>' : ''}</b><small>${esc(u.cargo)}</small><small class="us-email">${esc(u.email)}</small></span></div></td>
            <td><span class="us-papel us-papel-${visao}"><i class="ti ${visao === 'pasta' ? 'ti-building' : 'ti-building-community'}" aria-hidden="true"></i>${esc(nomePapel(u))}</span>${u.area && porGrupo.size < 2 ? `<small>${esc(nomeArea(u.area))}</small>` : ''}</td>
            <td>${chip[s]}</td>
            <td class="us-quando">${esc(quando(ultimoAcesso[u.id]))}</td>
            <td class="us-acoes">${botoes || '<span class="au-traco" title="Fora do que o seu perfil gerencia">—</span>'}</td>
          </tr>`;
        }).join('')}</tbody></table></div>
        <p class="au-rodape">${lista.length} ${lista.length === 1 ? 'usuário' : 'usuários'}</p>`;
      caixa.querySelectorAll('[data-acao]').forEach((b) => {
        const u = estado.usuarios.find((x) => x.id === b.dataset.id);
        b.onclick = () => {
          fecharMenus();
          if (b.dataset.acao === 'editar') abrirFormulario(u);
          else if (b.dataset.acao === 'desativar') confirmarDesativar(u);
          else if (b.dataset.acao === 'reativar') resultado(opcoes.aoReativar(u.id), `${u.nome} pode entrar de novo no painel.`);
          else if (b.dataset.acao === 'reenviar') confirmarReenvio(u);
        };
      });
      caixa.querySelectorAll('.us-mais').forEach(ligarMenu);
    }

    // ---- menu ⋯ da linha ----
    // Aberto, o menu vai para o <body> em position: fixed: a tabela rola de lado e a tela tem transform
    // (a animação de entrada), o que cortaria ou deslocaria o menu. Fechado, volta para a linha.
    const fecharMenus = (exceto) => el.querySelectorAll('.us-mais[open]').forEach((d) => { if (d !== exceto) d.open = false; });
    const menusSoltos = () => document.querySelectorAll('body > .us-menu');
    let abertoEm = 0;
    function posicionar(d) {
      const menu = d._menu;
      const r = d.querySelector('summary').getBoundingClientRect();
      const h = menu.offsetHeight;
      const w = menu.offsetWidth;
      const cabeEmbaixo = r.bottom + 6 + h < window.innerHeight - 8;
      menu.style.top = `${cabeEmbaixo ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
      menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    }
    function ligarMenu(d) {
      const resumo = d.querySelector('summary');
      const menu = d.querySelector('.us-menu');
      d._menu = menu;
      const itens = () => [...menu.querySelectorAll('[role="menuitem"]')];
      resumo.setAttribute('aria-haspopup', 'menu');
      resumo.setAttribute('aria-expanded', 'false');
      d.addEventListener('toggle', () => {
        resumo.setAttribute('aria-expanded', String(d.open));
        if (!d.open) { if (menu.parentNode !== d) d.appendChild(menu); return; }
        fecharMenus(d);
        abertoEm = Date.now();
        document.body.appendChild(menu);
        posicionar(d);
        const primeiro = itens()[0];
        if (primeiro) primeiro.focus({ preventScroll: true });
      });
      menu.addEventListener('keydown', (ev) => {
        const lista = itens();
        const i = lista.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') { ev.preventDefault(); lista[(i + 1) % lista.length].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); lista[(i - 1 + lista.length) % lista.length].focus(); }
        else if (ev.key === 'Tab') { ev.preventDefault(); d.open = false; resumo.focus(); }
      });
    }
    // Esc fecha só o menu. Na captura do window: o Esc geral (app.js, captura no document) fecharia a tela.
    window.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      const aberto = el.querySelector('.us-mais[open]');
      if (!aberto) return;
      ev.preventDefault();
      ev.stopPropagation();
      aberto.open = false;
      aberto.querySelector('summary').focus();
    }, true);
    // Clique fora fecha. A rolagem que vem junto com o clique de abrir só reposiciona; depois, fecha.
    document.addEventListener('click', (ev) => { if (!ev.target.closest('.us-mais, .us-menu')) fecharMenus(); });
    const aoRolar = () => {
      const aberto = el.querySelector('.us-mais[open]');
      if (!aberto) return;
      if (Date.now() - abertoEm < 250) posicionar(aberto); else fecharMenus();
    };
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', () => fecharMenus());

    const MOTIVOS = {
      permissao: 'O seu perfil não permite essa mudança.',
      'ultimo-geral': 'É preciso manter ao menos um gestor geral ativo.',
    };
    function resultado(r, textoOk) {
      aviso = r.ok ? `<i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(textoOk)}` : `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(MOTIVOS[r.motivo] || 'Não foi possível concluir.')}`;
      const p = el.querySelector('.us-aviso');
      if (p) { p.innerHTML = aviso; p.hidden = false; p.classList.toggle('us-aviso-erro', !r.ok); }
      return r;
    }

    // ---- diálogos ----
    function dialogo(html, aoEnviar) {
      const dlg = document.createElement('dialog');
      dlg.className = 'cr-dialogo us-dialogo';
      dlg.innerHTML = `<form method="dialog" class="cr-dialogo-form" novalidate>${html}</form>`;
      document.body.appendChild(dlg);
      const form = dlg.querySelector('form');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!ev.submitter || ev.submitter.value !== 'ok') { dlg.close(); return; }
        if (aoEnviar(form) !== false) dlg.close();
      });
      dlg.addEventListener('close', () => dlg.remove());
      dlg.showModal();
      return dlg;
    }

    function abrirFormulario(u) {
      const { autor, areas } = estado;
      const novo = !u;
      const podePerfil = novo ? GC.podeGerirUsuario(autor, null, 'perfil') : pode(u, 'perfil') && u.id !== autor.id;
      const papelAtual = u ? (GC.papelDoUsuario(u) || {}).id : 'secretario';
      const areaAtual = u ? u.area : GC.alcanceUsuarios(autor) === 'pasta' ? autor.area : '';
      const opcao = (x) => `<option value="${esc(x.id)}"${x.id === papelAtual ? ' selected' : ''}>${esc(x.nome)}</option>`;
      const papeis = GC.perfisAcesso.lista();
      dialogo(`
        <h3>${novo ? 'Cadastrar usuário' : `Editar ${esc(u.nome)}`}</h3>
        <p class="cr-dialogo-sub">${novo ? 'A pessoa recebe uma senha provisória e cria a dela no primeiro acesso.' : 'O e-mail não muda: é o login da pessoa.'}</p>
        <label class="ct-campo">Nome completo<input name="nome" autocomplete="off" value="${u ? esc(u.nome) : ''}" required></label>
        <p class="us-erro" data-erro="nome" hidden></p>
        <label class="ct-campo">E-mail${novo ? '' : ' (login)'}<input name="email" type="email" autocomplete="off" value="${u ? esc(u.email) : ''}" ${novo ? 'required' : 'disabled'}></label>
        <p class="us-erro" data-erro="email" hidden></p>
        <label class="ct-campo">Cargo<input name="cargo" autocomplete="off" value="${u ? esc(u.cargo) : ''}" placeholder="Ex.: Coordenadora de Atenção Básica" required></label>
        <p class="us-erro" data-erro="cargo" hidden></p>
        ${podePerfil ? `
        <label class="ct-campo us-perfil">Perfil de acesso<select name="papel">
          <optgroup label="Cidade toda">${papeis.filter((x) => x.visao === 'cidade').map(opcao).join('')}</optgroup>
          <optgroup label="Uma secretaria">${papeis.filter((x) => x.visao === 'pasta').map(opcao).join('')}</optgroup>
          <optgroup label="Portal do servidor">${[GC.papelPorId('servidor')].filter(Boolean).map(opcao).join('')}</optgroup>
        </select></label>
        <p class="us-erro" data-erro="perfil" hidden></p>
        <label class="ct-campo us-area">Secretaria<select name="area"><option value="">Escolha…</option>${areas.map((a) => `<option value="${esc(a.id)}"${a.id === areaAtual ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
        <p class="us-erro" data-erro="area" hidden></p>`
        : `<p class="us-fixo"><i class="ti ti-lock" aria-hidden="true"></i> Perfil: <b>${esc(u ? nomePapel(u) : GC.papelPorId('secretario').nome)}</b>${areaAtual ? ` · ${esc(nomeArea(areaAtual))}` : ''}${GC.alcanceUsuarios(autor) === 'pasta' ? '. Só o gestor geral muda perfil e secretaria.' : ''}</p>`}
        <p class="us-erro" data-erro="geral" hidden></p>
        <div class="cr-dialogo-botoes">
          <button type="submit" value="voltar" class="btn-sec">Cancelar</button>
          <button type="submit" value="ok" class="btn-primario">${novo ? 'Cadastrar' : 'Salvar'}</button>
        </div>`, (form) => {
        const d = { nome: form.nome.value, cargo: form.cargo.value };
        if (novo) d.email = form.email.value;
        if (podePerfil) { d.papel = form.papel.value; d.area = form.area.value; }
        const r = novo ? opcoes.aoCriar(d) : opcoes.aoEditar(u.id, d);
        form.querySelectorAll('.us-erro').forEach((p) => { p.hidden = true; });
        if (!r.ok) {
          const erros = r.erros || { geral: MOTIVOS[r.motivo] || 'Não foi possível salvar.' };
          Object.entries(erros).forEach(([k, msg]) => { const p = form.querySelector(`[data-erro="${k}"]`) || form.querySelector('[data-erro="geral"]'); p.textContent = msg; p.hidden = false; });
          const primeiro = form.querySelector(`[name="${Object.keys(erros)[0]}"]`);
          if (primeiro) primeiro.focus();
          return false;
        }
        if (novo) mostrarSenha(r.usuario, r.senhaProvisoria, 'Usuário cadastrado');
        else resultado(r, r.mudou && r.mudou.length ? `Alterações de ${r.usuario.nome} salvas.` : 'Nada mudou.');
        return true;
      });
      // Secretaria só aparece para perfil de uma secretaria.
      const dlg = document.querySelector('.us-dialogo');
      const sel = dlg.querySelector('[name="papel"]');
      const marcarArea = () => { const a = dlg.querySelector('.us-area'); if (a && sel) a.hidden = !['pasta', 'pessoal'].includes((GC.papelPorId(sel.value) || {}).visao); };
      if (sel) sel.onchange = marcarArea;
      marcarArea();
    }

    function mostrarSenha(u, senha, titulo) {
      resultado({ ok: true }, `${titulo}: ${u.nome}.`);
      const dlg = dialogo(`
        <h3>${esc(titulo)}</h3>
        <p class="cr-dialogo-sub">Passe esta senha provisória a <b>${esc(u.nome)}</b> por um canal seguro (pessoalmente ou por telefone). No primeiro acesso, a pessoa cria a própria senha.</p>
        <div class="us-senha"><code>${esc(senha)}</code><button type="button" class="btn-sec us-copiar"><i class="ti ti-copy" aria-hidden="true"></i> Copiar</button></div>
        <p class="us-fixo"><i class="ti ti-eye-off" aria-hidden="true"></i> Ela não aparece de novo. Se perder, gere um novo acesso.</p>
        <p class="us-fixo">Login: <b>${esc(u.email)}</b></p>
        <div class="cr-dialogo-botoes"><button type="submit" value="voltar" class="btn-primario">Pronto</button></div>`, () => true);
      dlg.querySelector('.us-copiar').onclick = async (ev) => {
        try { await navigator.clipboard.writeText(senha); ev.currentTarget.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Copiada'; } catch (e) { /* sem área de transferência: a senha está na tela */ }
      };
    }

    function confirmarDesativar(u) {
      dialogo(`
        <h3>Desativar ${esc(u.nome)}?</h3>
        <p class="cr-dialogo-sub">A pessoa deixa de entrar no painel e a sessão aberta termina. O histórico dela continua na auditoria, e dá para reativar depois.</p>
        <p class="us-erro" data-erro="geral" hidden></p>
        <div class="cr-dialogo-botoes">
          <button type="submit" value="voltar" class="btn-sec">Cancelar</button>
          <button type="submit" value="ok" class="btn-primario us-btn-perigo">Desativar</button>
        </div>`, (form) => {
        const r = opcoes.aoDesativar(u.id);
        if (!r.ok) { const p = form.querySelector('[data-erro="geral"]'); p.textContent = MOTIVOS[r.motivo] || 'Não foi possível desativar.'; p.hidden = false; return false; }
        resultado(r, `${u.nome} foi desativado(a).`);
        return true;
      });
    }

    function confirmarReenvio(u) {
      dialogo(`
        <h3>Gerar novo acesso para ${esc(u.nome)}?</h3>
        <p class="cr-dialogo-sub">A senha atual deixa de valer. A pessoa entra com uma senha provisória e cria uma nova. Use quando ela esqueceu a senha e não consegue recuperar pelo e-mail.</p>
        <div class="cr-dialogo-botoes">
          <button type="submit" value="voltar" class="btn-sec">Cancelar</button>
          <button type="submit" value="ok" class="btn-primario">Gerar senha provisória</button>
        </div>`, () => {
        const r = opcoes.aoReenviar(u.id);
        if (r.ok) setTimeout(() => mostrarSenha(r.usuario, r.senhaProvisoria, 'Novo acesso gerado'));
        else resultado(r, '');
        return true;
      });
    }

    const assinar = (e) => JSON.stringify([e.aba, e.autor && e.autor.id, e.usuarios.map((u) => [u.id, u.nome, u.cargo, u.perfil, u.area, u.papel, u.nivel, u.ativo, !!u.provisoria]),
      e.perfis ? [e.perfis.rota, e.perfis.emUso, GC.perfisAcesso.lista().map((x) => [x.id, x.nome, x.atualizadoEm || null, Object.keys(x.permissoes).length])] : null]);
    return {
      mostrar(e) { if (!estado || e.aba !== estado.aba) aviso = ''; estado = e; assinatura = assinar(e); desenhar(); },
      atualizar(e) {
        const nova = assinar(e);
        estado = e;
        if (nova === assinatura) return;
        assinatura = nova;
        const foco = document.activeElement && document.activeElement.name === 'texto' && el.contains(document.activeElement);
        desenhar();
        if (foco) { const i = el.querySelector('[name="texto"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      },
    };
  };
})(window.GC = window.GC || {});
