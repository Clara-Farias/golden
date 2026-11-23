(function (GC) {
  // Sessão da demonstração: entrar, sair, validade, bloqueio por tentativas, código de recuperação e troca de senha.
  // Tudo fica no navegador (localStorage): é um protótipo, não segurança de verdade. A tela de entrada diz isso.
  // Login opcional: só com ?login=1 o painel exige sessão (js/perfil.js manda para entrar.html).
  // Roda depois de js/data-usuarios.js e antes de js/perfil.js.
  const MIN = 60 * 1000;
  GC.SESSAO_REGRAS = {
    duracaoMin: 8 * 60, // um expediente
    manterMin: 30 * 24 * 60, // "manter conectado neste navegador"
    maxErros: 5,
    bloqueioMin: 5,
    codigoMin: 10,
    codigoTentativas: 3,
    govbrNivelMin: 'prata', // conta gov.br bronze não entra no painel (só cadastro, sem validação de identidade)
  };
  const R = GC.SESSAO_REGRAS;
  const normal = (e) => String(e || '').trim().toLowerCase();

  // ---- gov.br (simulado): a conta gov.br diz o CPF e o nível; o painel liga o CPF ao usuário cadastrado ----
  // Na versão real, o CPF vem do Login Único (OpenID Connect) e fica no cadastro do usuário. Aqui, cada usuário
  // fictício tem um CPF fictício (com dígitos verificadores válidos) tirado do id, e o nível é inventado.
  GC.NIVEIS_GOVBR = ['bronze', 'prata', 'ouro'];
  GC.cpfDemo = function (texto) {
    let h = 7;
    for (const ch of String(texto)) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
    const d = Array.from({ length: 9 }, (_, i) => { h = (h * 16807) % 2147483647; return (h + i) % 10; });
    if (d.every((x) => x === d[0])) d[8] = (d[8] + 1) % 10; // 111.111.111-xx não é CPF
    const dig = (arr) => { const s = arr.reduce((t, x, i) => t + x * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    d.push(dig(d));
    d.push(dig(d));
    const c = d.join('');
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  };
  // Como o gov.br mostra o CPF: só os dígitos do meio.
  GC.mascararCpf = (cpf) => `***.${String(cpf).slice(4, 7)}.${String(cpf).slice(8, 11)}-**`;
  const NIVEL_GOVBR_DEMO = { 'u-prefeita': 'ouro', 'u-gabinete': 'ouro', 'u-limpeza': 'bronze' };
  GC.contaGovbr = (u) => ({ nome: u.nome, cpf: GC.cpfDemo(u.id), nivel: u.govbrNivel || NIVEL_GOVBR_DEMO[u.id] || 'prata' });
  // Uma pessoa com conta gov.br que não tem cadastro no painel (para mostrar a recusa).
  GC.CONTA_GOVBR_SEM_CADASTRO = { nome: 'Marcos Vieira', cpf: GC.cpfDemo('sem-cadastro-no-painel'), nivel: 'ouro' };
  GC.nivelGovbrBasta = (nivel) => GC.NIVEIS_GOVBR.indexOf(nivel) >= GC.NIVEIS_GOVBR.indexOf(R.govbrNivelMin);

  // Resumo não criptográfico (FNV-1a): evita guardar a senha nova em texto puro, nada além disso.
  GC.resumoSenha = function (s) {
    let h = 0x811c9dc5;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return `f${h.toString(16).padStart(8, '0')}`;
  };

  // Regras da senha nova, na ordem em que a tela mostra. Cada uma diz se foi atendida.
  GC.regrasSenha = function (senha, usuario) {
    const s = String(senha || '');
    const partes = usuario ? [...usuario.nome.toLowerCase().split(/\s+/), usuario.email.split('@')[0]].filter((p) => p.length >= 3) : [];
    return [
      { id: 'tamanho', texto: 'Pelo menos 8 caracteres', ok: s.length >= 8 },
      { id: 'letra-numero', texto: 'Letras e números', ok: /[a-zA-ZÀ-ÿ]/.test(s) && /\d/.test(s) },
      { id: 'pessoal', texto: 'Sem o seu nome ou e-mail', ok: !!s && !partes.some((p) => s.toLowerCase().includes(p)) },
    ];
  };
  GC.senhaValida = (senha, usuario) => GC.regrasSenha(senha, usuario).every((r) => r.ok);

  // armazenamento: { ler(chave), gravar(chave, valor), apagar(chave) }. agora: relógio (testes controlam).
  // cadastro: o de js/usuarios.js (limpa a senha provisória quando a pessoa cria a dela).
  GC.criarSessao = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), usuarios = () => GC.data.usuarios, cadastro = () => GC.cadastro } = {}) {
    const mem = {};
    const A = armazenamento || {
      ler: (k) => (k in mem ? JSON.parse(mem[k]) : null),
      gravar: (k, v) => { mem[k] = JSON.stringify(v); },
      apagar: (k) => { delete mem[k]; },
    };
    const lista = () => (typeof usuarios === 'function' ? usuarios() : usuarios);
    const porId = (id) => lista().find((u) => u.id === id) || null;
    const porEmail = (e) => lista().find((u) => u.email === normal(e)) || null;
    const ativo = (u) => !!u && u.ativo !== false;
    const limparProvisoria = (u) => { const c = typeof cadastro === 'function' ? cadastro() : cadastro; if (c && u.provisoria) c.concluirPrimeiroAcesso(u.id); };

    const senhas = () => A.ler('senhas') || {};
    const senhaConfere = (u, senha) => {
      if (u.provisoria) return GC.resumoSenha(senha) === u.provisoria; // cadastrado agora ou com acesso refeito
      const trocada = senhas()[u.id];
      return trocada ? trocada === GC.resumoSenha(senha) : senha === GC.SENHA_DEMO;
    };
    const gravarSenha = (u, senha) => A.gravar('senhas', Object.assign(senhas(), { [u.id]: GC.resumoSenha(senha) }));

    // ---- tentativas erradas (por e-mail digitado, exista ou não: a resposta é a mesma) ----
    const erros = () => A.ler('erros') || {};
    function bloqueio(email) {
      const e = erros()[normal(email)];
      if (!e || !e.ate) return null;
      const resta = e.ate - agora();
      return resta > 0 ? Math.ceil(resta / MIN) : null;
    }
    function errar(email) {
      const todos = erros();
      const k = normal(email);
      const e = todos[k] && !(todos[k].ate && todos[k].ate <= agora()) ? todos[k] : { n: 0, ate: null };
      e.n += 1;
      if (e.n >= R.maxErros) e.ate = agora() + R.bloqueioMin * MIN;
      todos[k] = e;
      A.gravar('erros', todos);
      return e;
    }
    function zerarErros(email) {
      const todos = erros();
      delete todos[normal(email)];
      A.gravar('erros', todos);
    }

    // ---- sessão ----
    function abrir(u, manter) {
      const inicio = agora();
      const acessos = A.ler('acessos') || {};
      acessos[u.id] = [inicio, ...(acessos[u.id] || [])].slice(0, 10);
      A.gravar('acessos', acessos);
      A.gravar('sessao', { usuarioId: u.id, inicio, expira: inicio + (manter ? R.manterMin : R.duracaoMin) * MIN, manter: !!manter });
      A.gravar('ultimo', u.id); // "Continuar como…" na próxima entrada (sair não apaga; "Usar outra conta" apaga)
      return u;
    }
    function situacao() {
      const s = A.ler('sessao');
      if (!s || !ativo(porId(s.usuarioId))) return 'nenhuma';
      return s.expira > agora() ? 'ativa' : 'vencida';
    }
    const atual = () => (situacao() === 'ativa' ? porId(A.ler('sessao').usuarioId) : null);

    function entrar(email, senha, { manter = false } = {}) {
      const resta = bloqueio(email);
      if (resta) return { ok: false, motivo: 'bloqueado', restanteMin: resta };
      const u = porEmail(email);
      if (u && ativo(u) && senhaConfere(u, senha)) {
        zerarErros(email);
        if (u.provisoria) return primeiro(u, manter);
        return { ok: true, usuario: abrir(u, manter) };
      }
      // Usuário desativado recebe a mesma resposta de senha errada (a auditoria sabe a diferença por inativo).
      const e = errar(email);
      const inativo = !!u && !ativo(u);
      if (e.ate) return { ok: false, motivo: 'bloqueado', restanteMin: R.bloqueioMin, acabouDeBloquear: true, usuario: u, inativo };
      return { ok: false, motivo: 'credenciais', tentativasRestantes: R.maxErros - e.n, usuario: u, inativo };
    }

    // ---- gov.br: conta = { cpf, nivel }, o que o gov.br devolve depois de a pessoa confirmar quem é ----
    // Não conta tentativa nem bloqueia (quem confere a identidade é o gov.br). Senha provisória não pede troca:
    // a pessoa entrou sem senha. Sem cadastro, desativado ou nível baixo: recusa com o motivo (o CPF já foi confirmado,
    // então dizer "você não tem acesso" não revela nada a um estranho).
    function entrarGovbr(conta, { manter = false } = {}) {
      const cpf = String((conta && conta.cpf) || '');
      const u = cpf ? lista().find((x) => GC.contaGovbr(x).cpf === cpf) || null : null;
      if (!u) return { ok: false, motivo: 'sem_cadastro' };
      if (!ativo(u)) return { ok: false, motivo: 'inativo', usuario: u };
      if (!GC.nivelGovbrBasta(conta.nivel)) return { ok: false, motivo: 'nivel', usuario: u, nivel: conta.nivel };
      return { ok: true, usuario: abrir(u, manter) };
    }

    // ---- primeiro acesso: a senha provisória confere, mas a sessão só abre depois de criar a senha própria ----
    function primeiro(u, manter) {
      A.gravar('primeiro', { usuarioId: u.id, expira: agora() + R.codigoMin * MIN, manter: !!manter });
      return { ok: true, primeiroAcesso: true, usuario: u };
    }
    function pendentePrimeiro() {
      const p = A.ler('primeiro');
      const u = p && porId(p.usuarioId);
      return p && p.expira > agora() && ativo(u) && u.provisoria ? { usuario: u, manter: p.manter } : null;
    }
    function definirPrimeiraSenha(nova) {
      const p = pendentePrimeiro();
      if (!p) return { ok: false, motivo: 'expirou' };
      if (!GC.senhaValida(nova, p.usuario)) return { ok: false, motivo: 'senha' };
      gravarSenha(p.usuario, nova);
      limparProvisoria(p.usuario);
      A.apagar('primeiro');
      return { ok: true, usuario: abrir(porId(p.usuario.id), p.manter) };
    }

    // ---- recuperação: código de 6 dígitos (na demonstração, ele aparece na "caixa de entrada" da tela) ----
    function pedirCodigo(email) {
      const u = porEmail(email);
      if (!ativo(u)) { A.apagar('recuperacao'); return u ? { enviado: true, codigo: null, usuario: u } : { enviado: true, codigo: null }; }
      const codigo = String(100000 + Math.floor(Math.random() * 900000));
      const expira = agora() + R.codigoMin * MIN;
      A.gravar('recuperacao', { email: u.email, codigo, expira, tentativas: 0, conferido: false });
      return { enviado: true, codigo, expira, usuario: u };
    }
    function conferirCodigo(email, codigo) {
      const r = A.ler('recuperacao');
      if (!r || r.email !== normal(email)) return { ok: false, motivo: 'invalido' };
      if (r.expira <= agora()) { A.apagar('recuperacao'); return { ok: false, motivo: 'expirou' }; }
      if (String(codigo || '').trim() !== r.codigo) {
        r.tentativas += 1;
        if (r.tentativas >= R.codigoTentativas) { A.apagar('recuperacao'); return { ok: false, motivo: 'tentativas' }; }
        A.gravar('recuperacao', r);
        return { ok: false, motivo: 'invalido', restantes: R.codigoTentativas - r.tentativas };
      }
      r.conferido = true;
      A.gravar('recuperacao', r);
      return { ok: true };
    }
    function redefinirSenha(email, codigo, nova) {
      const r = A.ler('recuperacao');
      const u = porEmail(email);
      if (!u || !r || r.email !== u.email || !r.conferido || r.codigo !== String(codigo || '').trim() || r.expira <= agora()) return { ok: false, motivo: 'codigo' };
      if (!GC.senhaValida(nova, u)) return { ok: false, motivo: 'senha' };
      gravarSenha(u, nova);
      limparProvisoria(u);
      A.apagar('recuperacao');
      zerarErros(u.email);
      return { ok: true, usuario: u };
    }

    function trocarSenha(usuarioId, atualSenha, nova) {
      const u = porId(usuarioId);
      if (!u) return { ok: false, motivo: 'usuario' };
      if (!senhaConfere(u, atualSenha)) return { ok: false, motivo: 'atual' };
      if (atualSenha === nova) return { ok: false, motivo: 'igual' };
      if (!GC.senhaValida(nova, u)) return { ok: false, motivo: 'senha' };
      gravarSenha(u, nova);
      return { ok: true };
    }

    return {
      atual,
      situacao,
      entrar,
      entrarGovbr,
      // Atalho da demonstração ("Entrar como…"): abre a sessão sem senha. Vale só neste protótipo.
      // Quem ainda tem senha provisória vai para o primeiro acesso, como na entrada normal.
      entrarComo: (usuarioId, opcoes = {}) => {
        const u = porId(usuarioId);
        if (!ativo(u)) return { ok: false };
        return u.provisoria ? primeiro(u, opcoes.manter) : { ok: true, usuario: abrir(u, opcoes.manter) };
      },
      pendentePrimeiro,
      definirPrimeiraSenha,
      sair() { A.apagar('sessao'); },
      // Quem entrou por último neste navegador (só o id fica guardado), se ainda está ativo.
      ultimo: () => { const u = porId(A.ler('ultimo')); return ativo(u) ? u : null; },
      esquecerUltimo() { A.apagar('ultimo'); },
      dados: () => A.ler('sessao'),
      // Acessos do usuário, do mais novo ao mais antigo (o primeiro é o desta sessão).
      acessos: (usuarioId) => ((A.ler('acessos') || {})[usuarioId] || []).slice(),
      senhaTrocada: (usuarioId) => !!senhas()[usuarioId],
      bloqueio,
      pedirCodigo,
      conferirCodigo,
      redefinirSenha,
      trocarSenha,
    };
  };

  // ---- instância do navegador ----
  const local = {
    ler(k) { try { return JSON.parse(window.localStorage.getItem(`vd-login-${k}`)); } catch (e) { return null; } },
    gravar(k, v) { try { window.localStorage.setItem(`vd-login-${k}`, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
    apagar(k) { try { window.localStorage.removeItem(`vd-login-${k}`); } catch (e) { /* sem armazenamento */ } },
  };
  GC.sessao = GC.criarSessao({ armazenamento: local });
  GC.loginExigido = (() => {
    if (GC.loginForcado !== undefined) return !!GC.loginForcado;
    try { return new URLSearchParams(window.location.search).get('login') === '1'; } catch (e) { return false; }
  })();

  // Quem está usando o painel: o usuário da sessão, se ela é do perfil aberto; senão o usuário de demonstração do perfil.
  GC.usuarioAtual = function () {
    const p = GC.perfil;
    const u = GC.sessao.atual();
    if (u && p && u.perfil === p.id && (u.area || null) === (p.area || null)) return u;
    // Demonstração sem login: ?usuario=<id> escolhe outro usuário do mesmo perfil (o diretor de unidade, por exemplo).
    if (!GC.loginExigido && GC.buscarUsuario) {
      let id = null;
      try { id = new URLSearchParams(window.location.search).get('usuario'); } catch (e) { /* sem location */ }
      const escolhido = id ? GC.buscarUsuario(id) : null;
      if (escolhido && p && escolhido.perfil === p.id && (escolhido.area || null) === (p.area || null) && escolhido.ativo !== false) return escolhido;
    }
    return GC.usuarioDoPerfil ? GC.usuarioDoPerfil(p || { id: 'prefeito' }) : null;
  };

  // entrar.html, levando a cidade e o ?login=1; motivo: 'saiu' | 'vencida'; volta: a rota (#/...) para depois de entrar.
  GC.urlEntrar = function ({ motivo = null, volta = null } = {}, base = window.location.href) {
    const atual = new URL(base);
    const u = new URL('entrar.html', atual);
    u.search = atual.search;
    ['perfil', 'area', 'motivo', 'volta'].forEach((k) => u.searchParams.delete(k));
    u.searchParams.set('login', '1');
    if (motivo) u.searchParams.set('motivo', motivo);
    if (volta && volta !== '#' && volta !== '#/') u.searchParams.set('volta', volta);
    u.hash = '';
    return u.toString();
  };

  // Painel do usuário que acabou de entrar: perfil e pasta dele, a cidade de antes e a rota pedida (se houver).
  GC.urlDepoisDeEntrar = function (usuario, base = window.location.href) {
    const atual = new URL(base);
    // O servidor vai ao portal do servidor (servidor.html); os gestores, ao painel.
    const u = new URL(usuario.perfil === 'servidor' ? 'servidor.html' : 'index.html', atual);
    u.search = atual.search;
    const volta = atual.searchParams.get('volta');
    ['motivo', 'volta', 'area'].forEach((k) => u.searchParams.delete(k));
    u.searchParams.set('login', '1');
    u.searchParams.set('perfil', usuario.perfil);
    if (usuario.area) u.searchParams.set('area', usuario.area);
    u.hash = volta && /^#\/[\w\-/%.]*$/.test(volta) ? volta : '';
    return u.toString();
  };
})(window.GC = window.GC || {});
