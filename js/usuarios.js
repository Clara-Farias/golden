(function (GC) {
  // Cadastro de usuários da demonstração: criar, editar, desativar/reativar e gerar acesso provisório.
  // Os usuários de js/data-usuarios.js são a base; o que muda fica no navegador (como um "por cima" da base).
  // Cada pessoa tem um perfil de acesso (papel): um do sistema (gestor geral, secretário, diretor de unidade) ou um
  // criado pelo gestor (js/perfis-acesso.js, guardado em u.papel). u.perfil ('prefeito' | 'setor') e u.nivel saem
  // do papel. Quem gerencia: o gestor geral, todo mundo; o gestor do setor, só as pessoas da própria pasta (e sem
  // mudar perfil). Ninguém desativa a si mesmo, e sempre sobra ao menos um gestor geral (do sistema) ativo.
  // Roda depois de js/data-usuarios.js e antes de js/sessao.js (que usa ativo e provisoria).
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normal = (e) => String(e || '').trim().toLowerCase();
  const limpo = (t) => String(t || '').trim().replace(/\s+/g, ' ');
  const iniciais = (nome) => nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const areaValida = (a) => ((GC.data && GC.data.areas) || []).some((x) => x.id === a);

  // Senha provisória fácil de ditar: sem letras e números que se confundem (0/O, 1/l/I).
  GC.gerarSenhaProvisoria = function (sorteio = Math.random) {
    const L = 'abcdefghjkmnpqrstuvwxyz';
    const N = '23456789';
    const pega = (c) => c[Math.floor(sorteio() * c.length)];
    return `${pega(L)}${pega(L)}${pega(N)}${pega(L)}-${pega(N)}${pega(L)}${pega(N)}${pega(L)}`;
  };

  // Quem pode mexer em quem (puro, testável). acao: 'ver' | 'criar' | 'editar' | 'desativar' | 'perfil'.
  // Permissões 'usuarios.gerir' e 'usuarios.perfil' (js/permissoes.js); com alcance 'pasta', só gente da pasta.
  const quemAutor = (autor) => ({ perfil: { id: autor.perfil, area: autor.area }, usuario: autor });

  // Perfil (papel) gravado no usuário: o criado (u.papel) ou o do sistema pelo perfil e nível.
  GC.papelDoUsuario = function (u) {
    if (!u) return null;
    const proprio = u.papel ? GC.papelPorId(u.papel) : null;
    if (proprio) return proprio;
    if (u.perfil === 'prefeito') return GC.papelPorId('gestor_geral');
    if (u.perfil === 'setor') return GC.papelPorId(u.nivel === 'unidade' ? 'diretor_unidade' : 'secretario');
    if (u.perfil === 'servidor') return GC.papelPorId('servidor');
    return null;
  };
  // Campos do usuário para um papel: { perfil, area, nivel, papel }. Os do sistema não gravam papel.
  GC.camposDoPapel = function (papelId, area) {
    const x = GC.papelPorId(papelId);
    const perfil = GC.perfilDoPapel(x);
    if (!x || !perfil || perfil === 'cidadao') return null;
    const pasta = GC.perfilDePasta(perfil);
    return {
      perfil,
      area: pasta ? area || null : null,
      nivel: x.id === 'diretor_unidade' ? 'unidade' : x.id === 'servidor' ? 'servidor' : pasta && x.sistema ? 'secretario' : null,
      papel: x.sistema ? null : x.id,
    };
  };
  // Gestor geral do sistema: quem nunca pode faltar (é quem cria perfis e muda o perfil dos outros).
  const geralDoSistema = (u) => u.perfil === 'prefeito' && !u.papel;
  // Alcance de quem gerencia usuários: 'cidade' (todo mundo), 'pasta' (a gente da pasta) ou null.
  GC.alcanceUsuarios = (autor) => (autor ? GC.alcance('usuarios.gerir', quemAutor(autor)) : null);
  GC.podeGerirUsuario = function (autor, alvo, acao = 'editar') {
    if (!autor || autor.ativo === false) return false;
    const quem = quemAutor(autor);
    const chave = acao === 'perfil' ? 'usuarios.perfil' : 'usuarios.gerir';
    const alcance = GC.alcance(chave, quem);
    if (!alcance) return false;
    // Ninguém se desativa nem muda o próprio perfil (evita se trancar fora por engano).
    if (alvo && alvo.id === autor.id && (acao === 'desativar' || acao === 'perfil')) return false;
    if (alcance === 'cidade') return true;
    if (!alvo) return acao === 'criar';
    return GC.perfilDePasta(alvo.perfil) && GC.pode(chave, { area: alvo.area }, quem); // o secretário cadastra os servidores da pasta
  };

  // armazenamento: { ler(), gravar(o) } com { criados: [usuário], alterados: { id: campos } }.
  GC.criarCadastro = function ({ base, armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), aoMudar = () => {} } = {}) {
    let mem = { criados: [], alterados: {} };
    const S = armazenamento || { ler: () => mem, gravar: (o) => { mem = o; } };
    const ler = () => { const o = S.ler() || {}; return { criados: o.criados || [], alterados: o.alterados || {} }; };
    const gravar = (o) => { S.gravar(o); aoMudar(); };
    const baseLista = () => (typeof base === 'function' ? base() : base) || [];

    function lista() {
      const o = ler();
      const montar = (u) => {
        const x = Object.assign({ ativo: true, provisoria: null }, u, o.alterados[u.id] || {});
        x.iniciais = iniciais(x.nome);
        return x;
      };
      return [...baseLista().map(montar), ...o.criados.map(montar)];
    }
    const buscar = (id) => lista().find((u) => u.id === id) || null;
    const ativosGerais = () => lista().filter((u) => geralDoSistema(u) && u.ativo);

    function alterar(id, campos) {
      const o = ler();
      const criado = o.criados.find((u) => u.id === id);
      if (criado) Object.assign(criado, campos);
      else o.alterados[id] = Object.assign(o.alterados[id] || {}, campos);
      gravar(o);
    }

    // Papel pedido: d.papel ou, como antes, d.perfil ('prefeito' | 'setor'; o setor mantém o nível que a pessoa tinha).
    const papelPedido = (d, alvo) => {
      if (d.papel) return d.papel;
      if (d.perfil === 'prefeito') return 'gestor_geral';
      if (d.perfil === 'setor') return alvo && alvo.perfil === 'setor' && !alvo.papel && alvo.nivel === 'unidade' ? 'diretor_unidade' : 'secretario';
      return null;
    };

    // Confere os campos (nome, e-mail, cargo, papel, área). Devolve { campo: mensagem } (vazio = tudo certo).
    function conferir(d, { novo, id } = {}) {
      const erros = {};
      if (limpo(d.nome).split(' ').length < 2) erros.nome = 'Digite nome e sobrenome.';
      if (novo) {
        if (!EMAIL.test(normal(d.email))) erros.email = 'Digite um e-mail válido.';
        else if (lista().some((u) => u.email === normal(d.email) && u.id !== id)) erros.email = 'Já existe um usuário com este e-mail.';
      }
      if (!limpo(d.cargo)) erros.cargo = 'Digite o cargo.';
      const campos = GC.camposDoPapel(d.papel, d.area);
      if (!campos) erros.perfil = 'Escolha o perfil.';
      else if (GC.perfilDePasta(campos.perfil) && !areaValida(d.area)) erros.area = 'Escolha a secretaria.';
      return erros;
    }

    function criar(dados, autor) {
      if (!GC.podeGerirUsuario(autor, null, 'criar')) return { ok: false, motivo: 'permissao' };
      const d = Object.assign({}, dados, { papel: papelPedido(dados, null) });
      // Quem gerencia só a pasta cadastra secretário(a) da própria pasta (mudar perfil é do gestor geral).
      if (GC.alcanceUsuarios(autor) === 'pasta') { d.papel = 'secretario'; d.area = autor.area; }
      const erros = conferir(d, { novo: true });
      if (Object.keys(erros).length) return { ok: false, motivo: 'campos', erros };
      const senha = GC.gerarSenhaProvisoria();
      const u = {
        id: `u-${agora().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        nome: limpo(d.nome),
        cargo: limpo(d.cargo),
        email: normal(d.email),
        ...GC.camposDoPapel(d.papel, d.area),
        ativo: true,
        provisoria: GC.resumoSenha(senha),
        criadoEm: agora(),
        criadoPor: autor.id,
      };
      const o = ler();
      o.criados.push(u);
      gravar(o);
      return { ok: true, usuario: buscar(u.id), senhaProvisoria: senha };
    }

    function editar(id, dados, autor) {
      const alvo = buscar(id);
      if (!alvo || !GC.podeGerirUsuario(autor, alvo, 'editar')) return { ok: false, motivo: 'permissao' };
      const papelAtual = (GC.papelDoUsuario(alvo) || {}).id || null;
      const pedido = dados.papel !== undefined || dados.perfil !== undefined ? papelPedido(dados, alvo) : papelAtual;
      const novoPapel = GC.papelPorId(pedido);
      const areaPedida = dados.area !== undefined ? dados.area : alvo.area;
      const mudaPerfil = pedido !== papelAtual || (GC.perfilDoPapel(novoPapel) === 'setor' && areaPedida !== alvo.area);
      if (mudaPerfil && !GC.podeGerirUsuario(autor, alvo, 'perfil')) return { ok: false, motivo: 'permissao' };
      const d = {
        nome: dados.nome !== undefined ? dados.nome : alvo.nome,
        cargo: dados.cargo !== undefined ? dados.cargo : alvo.cargo,
        papel: mudaPerfil ? pedido : papelAtual,
        area: mudaPerfil ? areaPedida : alvo.area,
      };
      const erros = conferir(d, { id });
      if (Object.keys(erros).length) return { ok: false, motivo: 'campos', erros };
      const doPapel = GC.camposDoPapel(d.papel, d.area);
      if (geralDoSistema(alvo) && !geralDoSistema(doPapel) && alvo.ativo && ativosGerais().length <= 1) return { ok: false, motivo: 'ultimo-geral' };
      const campos = { nome: limpo(d.nome), cargo: limpo(d.cargo), ...doPapel };
      const mudou = Object.keys(campos).filter((k) => (campos[k] || null) !== (alvo[k] || null));
      if (!mudou.length) return { ok: true, usuario: alvo, mudou };
      alterar(id, campos);
      return { ok: true, usuario: buscar(id), mudou };
    }

    function definirAtivo(id, ativo, autor) {
      const alvo = buscar(id);
      if (!alvo || !GC.podeGerirUsuario(autor, alvo, ativo ? 'editar' : 'desativar')) return { ok: false, motivo: 'permissao' };
      if (!ativo && geralDoSistema(alvo) && ativosGerais().length <= 1) return { ok: false, motivo: 'ultimo-geral' };
      if (alvo.ativo === ativo) return { ok: true, usuario: alvo };
      alterar(id, { ativo });
      return { ok: true, usuario: buscar(id) };
    }

    // Senha provisória nova: a pessoa cria a dela no próximo acesso (serve também para "esqueceu e travou").
    function reenviarAcesso(id, autor) {
      const alvo = buscar(id);
      if (!alvo || !alvo.ativo || !GC.podeGerirUsuario(autor, alvo, 'editar')) return { ok: false, motivo: 'permissao' };
      const senha = GC.gerarSenhaProvisoria();
      alterar(id, { provisoria: GC.resumoSenha(senha) });
      return { ok: true, usuario: buscar(id), senhaProvisoria: senha };
    }

    return {
      lista,
      buscar,
      criar,
      editar,
      desativar: (id, autor) => definirAtivo(id, false, autor),
      reativar: (id, autor) => definirAtivo(id, true, autor),
      reenviarAcesso,
      concluirPrimeiroAcesso: (id) => { if (buscar(id) && buscar(id).provisoria) alterar(id, { provisoria: null }); },
      // Quem o autor enxerga na tela de usuários: o geral, todo mundo; o setor, a própria pasta.
      visiveis: (autor) => { const a = GC.alcanceUsuarios(autor); return lista().filter((u) => a === 'cidade' || (a === 'pasta' && u.perfil === 'setor' && u.area === autor.area)); },
    };
  };

  // ---- instância do navegador: GC.data.usuarios passa a ser a lista com o que mudou (o mesmo array, atualizado) ----
  const CHAVE = 'vd-login-cadastro';
  if (!GC.resumoSenha) {
    // js/sessao.js define o resumo de verdade; aqui só para o caso de o cadastro carregar antes.
    GC.resumoSenha = (s) => { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return `f${h.toString(16).padStart(8, '0')}`; };
  }
  const base = (GC.data.usuarios || []).slice();
  GC.data.usuariosBase = base;
  const sincronizar = () => { const l = GC.cadastro.lista(); GC.data.usuarios.splice(0, GC.data.usuarios.length, ...l); };
  GC.cadastro = GC.criarCadastro({
    base,
    armazenamento: {
      ler() { try { return JSON.parse(window.localStorage.getItem(CHAVE)); } catch (e) { return null; } },
      gravar(o) { try { window.localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
    },
    aoMudar: () => sincronizar(),
  });
  sincronizar();
})(window.GC = window.GC || {});
