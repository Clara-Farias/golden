(function (GC) {
  // Usuários da demonstração (fictícios): o gabinete (perfil "prefeito") e um responsável por secretaria (perfil "setor").
  // Servem ao login opcional (?login=1, entrar.html), à tela Minha conta e à auditoria.
  // Todos começam com a mesma senha de demonstração; a troca de senha fica salva só neste navegador (js/sessao.js).
  GC.SENHA_DEMO = 'Atlas2026';
  GC.DOMINIO_DEMO = 'prefeitura.demo';

  const GABINETE = [
    { id: 'u-prefeita', nome: 'Helena Prado', cargo: 'Prefeita' },
    { id: 'u-gabinete', nome: 'Rafael Moura', cargo: 'Chefe de Gabinete' },
    // Perfil de acesso reduzido (visão simples, sem agir): js/permissoes.js, 'gestor_consulta'.
    { id: 'u-vice', nome: 'Otávio Lins', cargo: 'Vice-prefeito', papel: 'gestor_consulta' },
  ];
  // Um responsável por pasta. Pasta sem entrada aqui (cidade com outra lista) ganha um nome genérico.
  const DA_PASTA = {
    infraestrutura: { nome: 'Carlos Andrade', cargo: 'Secretário de Obras e Infraestrutura' },
    defesa_civil: { nome: 'Juliana Ribeiro', cargo: 'Coordenadora da Defesa Civil' },
    saude: { nome: 'Marina Costa', cargo: 'Secretária de Saúde' },
    educacao: { nome: 'Paulo Mendes', cargo: 'Secretário de Educação' },
    seguranca: { nome: 'Ricardo Alves', cargo: 'Secretário de Segurança' },
    mobilidade: { nome: 'Fernanda Lima', cargo: 'Secretária de Mobilidade' },
    limpeza: { nome: 'Tiago Rocha', cargo: 'Diretor de Limpeza Urbana' },
  };

  // Diretores de unidade (nível abaixo do secretário): dois por pasta. Veem a pasta, mas operam só o que o
  // secretário delegou a eles (js/perfil.js, GC.nivelDe). Spec: docs/specs/2026-11-12-vila-dourada-metas-e-niveis-design.md.
  const DIRETORES = {
    infraestrutura: [['Roberto Nunes', 'Diretor de Manutenção Urbana', 'Manutenção Urbana'], ['Sílvia Prates', 'Diretora de Obras Viárias', 'Obras Viárias']],
    defesa_civil: [['Marcos Teixeira', 'Coordenador de Áreas de Risco', 'Áreas de Risco'], ['Paula Duarte', 'Coordenadora de Abrigos', 'Abrigos']],
    saude: [['Ana Beatriz Souza', 'Diretora da UBS Central', 'UBS Central'], ['Lucas Ferreira', 'Diretor da UBS Vila Nova', 'UBS Vila Nova']],
    educacao: [['Cláudia Monteiro', 'Diretora da EM Centro', 'EM Centro'], ['Rogério Pinto', 'Diretor da EM Jardim', 'EM Jardim']],
    seguranca: [['Inspetor Davi Rocha', 'Inspetor da Guarda · Zona Norte', 'Guarda · Zona Norte'], ['Inspetora Lia Campos', 'Inspetora da Guarda · Zona Sul', 'Guarda · Zona Sul']],
    mobilidade: [['Bruno Sales', 'Diretor de Trânsito', 'Trânsito'], ['Renata Gomes', 'Diretora de Transporte Coletivo', 'Transporte Coletivo']],
    limpeza: [['Edson Lopes', 'Encarregado da Coleta · Norte', 'Coleta · Norte'], ['Vera Antunes', 'Encarregada da Varrição', 'Varrição']],
  };

  // Servidores (quem executa, portal do servidor em servidor.html): três por pasta. Recebem demandas e veem só o
  // que foi passado a eles. A equipe (js/data-equipes.js) vai junto quando a pessoa é de campo.
  // Spec: docs/specs/2026-11-17-vila-dourada-portal-do-servidor-design.md.
  const SERVIDORES = {
    infraestrutura: [['Jorge Batista', 'Encarregado de manutenção', 'Manutenção Urbana', 1], ['Simone Araújo', 'Engenheira civil', 'Obras Viárias', null], ['Wellington Cruz', 'Eletricista', 'Manutenção Urbana', 2]],
    defesa_civil: [['Ana Lima', 'Técnica de Defesa Civil', 'Áreas de Risco', 1], ['Diego Matos', 'Agente de Defesa Civil', 'Áreas de Risco', 2], ['Priscila Neves', 'Assistente social', 'Abrigos', null]],
    saude: [['Fábio Rezende', 'Enfermeiro', 'UBS Central', null], ['Larissa Moura', 'Agente comunitária de saúde', 'UBS Vila Nova', null], ['Henrique Sá', 'Socorrista do SAMU', 'SAMU', 1]],
    educacao: [['Tânia Castro', 'Coordenadora pedagógica', 'EM Centro', null], ['Márcio Paiva', 'Auxiliar de serviços escolares', 'EM Jardim', 1], ['Beatriz Fontes', 'Nutricionista escolar', 'Merenda', null]],
    seguranca: [['Guarda Ítalo Freitas', 'Guarda municipal', 'Guarda · Zona Norte', 1], ['Guarda Joana Brito', 'Guarda municipal', 'Guarda · Zona Sul', 2], ['Rafaela Dias', 'Operadora do videomonitoramento', 'Central de monitoramento', null]],
    mobilidade: [['Alexandre Reis', 'Agente de trânsito', 'Trânsito', 1], ['Natália Prado', 'Fiscal de transporte', 'Transporte Coletivo', null], ['Caio Bezerra', 'Técnico de semáforos', 'Trânsito', 2]],
    limpeza: [['Sérgio Mota', 'Motorista da coleta', 'Coleta · Norte', 1], ['Rosana Leite', 'Fiscal de limpeza', 'Varrição', null], ['Valdir Souza', 'Encarregado da varrição', 'Varrição', 2]],
  };

  // "Helena Prado" -> "helena.prado" (sem acento).
  const login = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/).join('.');
  const iniciais = (nome) => nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  function montar() {
    const areas = (GC.data && GC.data.areas) || [];
    const gabinete = GABINETE.map((u) => ({ ...u, perfil: 'prefeito', area: null }));
    const setor = areas.map((a) => {
      const base = DA_PASTA[a.id] || { nome: `Gestor(a) ${a.secretaria ? a.secretaria.nome : a.id}`, cargo: `Responsável pela ${a.secretaria ? a.secretaria.nome : a.id}` };
      return { id: `u-${a.id}`, ...base, perfil: 'setor', area: a.id, nivel: 'secretario' };
    });
    const diretores = areas.flatMap((a) => (DIRETORES[a.id] || []).map(([nome, cargo, unidade], i) => ({
      id: `u-${a.id}-d${i + 1}`, nome, cargo, unidade, perfil: 'setor', area: a.id, nivel: 'unidade',
    })));
    const servidores = areas.flatMap((a) => (SERVIDORES[a.id] || []).map(([nome, cargo, unidade, equipe], i) => ({
      id: `u-${a.id}-s${i + 1}`, nome, cargo, unidade, perfil: 'servidor', area: a.id, nivel: 'servidor',
      equipeId: equipe ? `eq-${a.id}-${equipe}` : null,
    })));
    return [...gabinete, ...setor, ...diretores, ...servidores].map((u) => ({ ...u, email: `${login(u.nome)}@${GC.DOMINIO_DEMO}`, iniciais: iniciais(u.nome) }));
  }

  GC.data = GC.data || {};
  GC.data.usuarios = montar();

  GC.buscarUsuario = (id) => GC.data.usuarios.find((u) => u.id === id) || null;
  GC.usuarioPorEmail = (email) => {
    const e = String(email || '').trim().toLowerCase();
    return GC.data.usuarios.find((u) => u.email === e) || null;
  };
  // Usuário de demonstração do perfil (sem login): a prefeita no gestor geral, o responsável da pasta no setor.
  GC.usuarioDoPerfil = (p) => {
    if (!p || p.id === 'cidadao') return null;
    const ativos = GC.data.usuarios.filter((u) => u.ativo !== false);
    // O da pasta é o secretário (o diretor de unidade entra por ?usuario= ou pelo login).
    // O do portal do servidor: o primeiro servidor da pasta.
    if (p.id === 'servidor') return ativos.find((u) => u.perfil === 'servidor' && u.area === p.area) || null;
    if (p.id === 'setor') return ativos.find((u) => u.perfil === 'setor' && u.area === p.area && u.nivel !== 'unidade') || ativos.find((u) => u.perfil === 'setor' && u.area === p.area) || null;
    return ativos.find((u) => u.perfil === 'prefeito') || null;
  };
})(window.GC = window.GC || {});
