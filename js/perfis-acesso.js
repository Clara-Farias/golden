(function (GC) {
  // Perfis de acesso: os criados pelo gestor e os ajustes dos perfis do sistema.
  // Um perfil novo nasce de duplicar outro e muda nome, descrição, visão e permissões. Os do sistema (js/permissoes.js)
  // mudam nome, descrição e permissões, nunca a visão: o registro guarda só o ajuste (sistema: { id: ajuste }) e o
  // aplica nos objetos de GC.PERFIS_SISTEMA, então quem lê o perfil (GC.pode inclusive) já recebe o ajustado.
  // "Voltar ao padrão" apaga o ajuste. O gestor geral nunca perde GC.PERMISSOES_ESSENCIAIS (senão ninguém desfaria).
  // Guardados no navegador (vd-perfis, como o cadastro de usuários em vd-login-cadastro) e relidos quando outra aba
  // grava (evento storage). Quem cria, edita e exclui: quem tem 'perfis.gerir' (o gestor geral).
  // Perfil em uso por alguém não se exclui. O usuário guarda o perfil em u.papel (js/usuarios.js).
  // Carregado no <head> logo depois de js/permissoes.js.
  const limpo = (t) => String(t || '').trim().replace(/\s+/g, ' ');
  const VISOES = ['cidade', 'pasta'];
  const MAX_NOME = 60;
  const MAX_DESCRICAO = 200;
  // O que o gestor geral não pode perder: sem isso, ninguém mexeria de novo em perfis e usuários.
  GC.PERMISSOES_ESSENCIAIS = ['perfis.gerir', 'usuarios.gerir', 'usuarios.perfil'];

  // armazenamento: { ler(), gravar(o) } com { criados: [perfil], sistema: { id: ajuste } }. agora: relógio (testes).
  GC.criarPerfisAcesso = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), aoMudar = () => {} } = {}) {
    let mem = { criados: [], sistema: {} };
    const S = armazenamento || { ler: () => mem, gravar: (o) => { mem = o; } };
    let cache = null; // a lista lida (GC.pode consulta muito: não relê o armazenamento a cada chamada)

    // Os perfis do sistema do painel (o do cidadão não se ajusta).
    const doSistema = (id) => GC.PERFIS_SISTEMA.find((x) => x.id === id && x.pagina === 'painel') || null;
    // Escreve fábrica + ajuste em cada perfil do sistema (no lugar: o PAPEL de js/permissoes.js aponta para eles).
    function aplicarSistema(ajustes) {
      GC.PERFIS_SISTEMA.filter((x) => x.pagina === 'painel').forEach((x) => {
        const f = GC.PERFIS_FABRICA[x.id];
        const a = ajustes[x.id];
        x.nome = (a && a.nome) || f.nome;
        x.descricao = a && a.descricao !== undefined ? a.descricao : f.descricao;
        x.exibicao = (a && a.exibicao) || f.exibicao || 'completa';
        x.permissoes = a && a.permissoes ? GC.normalizarPermissoes(x.visao, a.permissoes) : Object.assign({}, f.permissoes);
        x.alterado = !!a;
        x.atualizadoEm = a ? a.atualizadoEm : null;
      });
    }

    const ler = () => {
      if (!cache) {
        const o = S.ler() || {};
        cache = { criados: (o.criados || []).map(montar), sistema: Object.assign({}, o.sistema || {}) };
        aplicarSistema(cache.sistema);
      }
      return cache;
    };
    const gravar = (o) => {
      S.gravar({ criados: o.criados.map(({ sistema, pagina, ...resto }) => resto), sistema: o.sistema || {} });
      cache = null;
      ler();
      aoMudar();
    };
    // Todo perfil criado é do painel; sistema: false.
    function montar(x) { return Object.assign({}, x, { sistema: false, pagina: 'painel', exibicao: GC.EXIBICOES[x.exibicao] ? x.exibicao : 'completa', permissoes: GC.normalizarPermissoes(x.visao, x.permissoes) }); }

    const criados = () => ler().criados;
    const buscar = (id) => criados().find((x) => x.id === id) || null;
    const ajusteDe = (id) => ler().sistema[id] || null;
    const lista = () => { ler(); return [...GC.PERFIS_SISTEMA.filter((x) => x.pagina === 'painel'), ...criados()]; };
    const quemPode = (autor) => !!autor && autor.ativo !== false
      && GC.pode('perfis.gerir', null, { perfil: { id: autor.perfil, area: autor.area }, usuario: autor });

    // Confere nome, visão e permissões. Devolve { campo: mensagem } (vazio = certo).
    function conferir(d, id) {
      const erros = {};
      const nome = limpo(d.nome);
      if (nome.length < 3) erros.nome = 'Dê um nome ao perfil (ao menos 3 letras).';
      else if (nome.length > MAX_NOME) erros.nome = `Use até ${MAX_NOME} caracteres.`;
      else if (lista().some((x) => x.id !== id && x.nome.toLowerCase() === nome.toLowerCase())) erros.nome = 'Já existe um perfil com este nome.';
      if (limpo(d.descricao).length > MAX_DESCRICAO) erros.descricao = `Use até ${MAX_DESCRICAO} caracteres.`;
      if (d.exibicao !== undefined && !GC.EXIBICOES[d.exibicao]) erros.exibicao = 'Escolha como o painel abre.';
      // Quem administra (usuários ou perfis) precisa chegar a Usuários e permissões, que só aparece na visão completa:
      // perfil com essas permissões não fica preso na resumida.
      else if (d.exibicao === 'so_resumida' && (id === 'gestor_geral' || ['usuarios.gerir', 'perfis.gerir'].some((k) => (d.permissoes || {})[k]))) {
        erros.exibicao = 'Este perfil administra usuários: precisa poder voltar à visão completa, onde fica Usuários e permissões. Escolha "Resumida" ou tire a permissão de gerir usuários.';
      }
      if (!VISOES.includes(d.visao)) erros.visao = 'Escolha o que o perfil enxerga.';
      else if (!Object.keys(GC.normalizarPermissoes(d.visao, d.permissoes)).length) erros.permissoes = 'Marque ao menos uma permissão.';
      else if (id === 'gestor_geral') {
        const faltam = GC.PERMISSOES_ESSENCIAIS.filter((k) => !(d.permissoes || {})[k]);
        if (faltam.length) erros.permissoes = `O gestor geral precisa manter: ${faltam.map((k) => (GC.PERMISSOES.find((x) => x.id === k) || { nome: k }).nome).join('; ')}.`;
      }
      return erros;
    }

    function criar(dados, autor) {
      if (!quemPode(autor)) return { ok: false, motivo: 'permissao' };
      const erros = conferir(dados, null);
      if (Object.keys(erros).length) return { ok: false, motivo: 'campos', erros };
      const t = agora();
      const base = GC.papelPorId(dados.base);
      const x = {
        id: `pf-${t.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        nome: limpo(dados.nome),
        descricao: limpo(dados.descricao),
        visao: dados.visao,
        exibicao: GC.EXIBICOES[dados.exibicao] ? dados.exibicao : (base && base.exibicao) || 'completa',
        base: base ? base.id : null,
        permissoes: GC.normalizarPermissoes(dados.visao, dados.permissoes),
        criadoEm: t,
        criadoPor: autor.id,
        atualizadoEm: t,
      };
      const o = ler();
      gravar({ criados: [...o.criados, x], sistema: o.sistema });
      return { ok: true, perfil: buscar(x.id) };
    }

    // emUso: quantas pessoas usam o perfil (a visão de um perfil em uso não muda: o usuário ficaria sem pasta, ou com
    // pasta sobrando). Perfil do sistema: editarSistema.
    function editar(id, dados, autor, emUso = 0) {
      if (doSistema(id)) return editarSistema(id, dados, autor);
      const atual = buscar(id);
      if (!atual) return { ok: false, motivo: 'nao-existe' };
      if (!quemPode(autor)) return { ok: false, motivo: 'permissao' };
      const d = {
        nome: dados.nome !== undefined ? dados.nome : atual.nome,
        descricao: dados.descricao !== undefined ? dados.descricao : atual.descricao,
        visao: dados.visao !== undefined ? dados.visao : atual.visao,
        exibicao: dados.exibicao !== undefined ? dados.exibicao : atual.exibicao,
        permissoes: dados.permissoes !== undefined ? dados.permissoes : atual.permissoes,
      };
      if (d.visao !== atual.visao && emUso > 0) return { ok: false, motivo: 'visao-em-uso' };
      const erros = conferir(d, id);
      if (Object.keys(erros).length) return { ok: false, motivo: 'campos', erros };
      const campos = { nome: limpo(d.nome), descricao: limpo(d.descricao), visao: d.visao, exibicao: d.exibicao, permissoes: GC.normalizarPermissoes(d.visao, d.permissoes) };
      const mudou = Object.keys(campos).filter((k) => JSON.stringify(campos[k]) !== JSON.stringify(atual[k]));
      if (!mudou.length) return { ok: true, perfil: atual, mudou };
      const o = ler();
      gravar({ criados: o.criados.map((x) => (x.id === id ? Object.assign({}, x, campos, { atualizadoEm: agora(), atualizadoPor: autor.id }) : x)), sistema: o.sistema });
      return { ok: true, perfil: buscar(id), mudou };
    }

    // Permissões em ordem fixa, para comparar sem depender da ordem das chaves.
    const emOrdem = (p) => JSON.stringify(Object.keys(p).sort().map((k) => [k, p[k]]));

    // Perfil do sistema: nome, descrição e permissões (a visão fica). Igual à fábrica, o ajuste some.
    function editarSistema(id, dados, autor) {
      const atual = doSistema(id);
      if (!quemPode(autor)) return { ok: false, motivo: 'permissao' };
      if (dados.visao !== undefined && dados.visao !== atual.visao) return { ok: false, motivo: 'visao-sistema' };
      const d = {
        nome: dados.nome !== undefined ? dados.nome : atual.nome,
        descricao: dados.descricao !== undefined ? dados.descricao : atual.descricao,
        visao: atual.visao,
        exibicao: dados.exibicao !== undefined ? dados.exibicao : atual.exibicao,
        permissoes: dados.permissoes !== undefined ? dados.permissoes : atual.permissoes,
      };
      const erros = conferir(d, id);
      if (Object.keys(erros).length) return { ok: false, motivo: 'campos', erros };
      const campos = { nome: limpo(d.nome), descricao: limpo(d.descricao), exibicao: d.exibicao, permissoes: GC.normalizarPermissoes(atual.visao, d.permissoes) };
      const mudou = Object.keys(campos).filter((k) => (k === 'permissoes' ? emOrdem(campos[k]) !== emOrdem(atual[k]) : campos[k] !== atual[k]));
      if (!mudou.length) return { ok: true, perfil: atual, mudou };
      const f = GC.PERFIS_FABRICA[id];
      const deFabrica = campos.nome === f.nome && campos.descricao === f.descricao && campos.exibicao === f.exibicao && emOrdem(campos.permissoes) === emOrdem(f.permissoes);
      const o = ler();
      const sistema = Object.assign({}, o.sistema);
      if (deFabrica) delete sistema[id];
      else sistema[id] = Object.assign({}, campos, { atualizadoEm: agora(), atualizadoPor: autor.id });
      gravar({ criados: o.criados, sistema });
      return { ok: true, perfil: doSistema(id), mudou };
    }

    // Volta o perfil do sistema ao padrão de fábrica.
    function restaurar(id, autor) {
      if (!doSistema(id)) return { ok: false, motivo: 'nao-existe' };
      if (!quemPode(autor)) return { ok: false, motivo: 'permissao' };
      const o = ler();
      if (!o.sistema[id]) return { ok: true, perfil: doSistema(id), mudou: [] };
      const sistema = Object.assign({}, o.sistema);
      delete sistema[id];
      gravar({ criados: o.criados, sistema });
      return { ok: true, perfil: doSistema(id), mudou: ['fabrica'] };
    }

    function excluir(id, autor, emUso = 0) {
      if (doSistema(id)) return { ok: false, motivo: 'sistema' };
      const atual = buscar(id);
      if (!atual) return { ok: false, motivo: 'nao-existe' };
      if (!quemPode(autor)) return { ok: false, motivo: 'permissao' };
      if (emUso > 0) return { ok: false, motivo: 'em-uso' };
      const o = ler();
      gravar({ criados: o.criados.filter((x) => x.id !== id), sistema: o.sistema });
      return { ok: true, perfil: atual };
    }

    // Diferenças entre dois perfis, permissão a permissão: [{ chave, nome, grupo, a, b }] (a/b: alcance ou null).
    function comparar(idA, idB) {
      const a = GC.papelPorId(idA);
      const b = GC.papelPorId(idB);
      if (!a || !b) return [];
      return GC.PERMISSOES.filter((x) => (a.permissoes[x.id] || null) !== (b.permissoes[x.id] || null))
        .map((x) => ({ chave: x.id, nome: x.nome, grupo: x.grupo, a: a.permissoes[x.id] || null, b: b.permissoes[x.id] || null }));
    }

    ler(); // aplica os ajustes dos perfis do sistema já ao nascer
    return {
      lista,
      criados,
      buscar,
      ajusteDe,
      temCriados: () => criados().length > 0,
      podeGerir: quemPode,
      conferir,
      criar,
      editar,
      restaurar,
      excluir,
      comparar,
      recarregar: () => { cache = null; ler(); },
    };
  };

  // ---- instância do navegador ----
  // Sem localStorage (testes, modo privado), os perfis ficam na memória da página.
  const CHAVE = 'vd-perfis';
  let naMemoria = null;
  GC.perfisAcesso = GC.criarPerfisAcesso({
    armazenamento: {
      ler() { try { const s = window.localStorage.getItem(CHAVE); return s ? JSON.parse(s) : naMemoria; } catch (e) { return naMemoria; } },
      gravar(o) { naMemoria = o; try { window.localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
    },
  });
  try { window.addEventListener('storage', (e) => { if (e.key === CHAVE) GC.perfisAcesso.recarregar(); }); } catch (e) { /* sem janela (testes) */ }
})(window.GC = window.GC || {});
