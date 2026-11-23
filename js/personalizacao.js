(function (GC) {
  // Personalização da aparência: paleta, fonte dos títulos, nome e logo da plataforma.
  // Três níveis, do mais geral ao mais pessoal (vence o último que estiver definido):
  //   prefeitura: padrão de todos. Só o gestor geral muda. É o único nível com nome, logo e a trava
  //               "cada pessoa pode escolher a própria paleta".
  //   pasta:      padrão de quem é de uma secretaria. O gestor do setor muda o da própria pasta.
  //   pessoal:    só para quem mudou. Qualquer gestor, se a prefeitura não travou.
  // Carregado no <head> (depois de js/tema.js): reaplica a última aparência salva antes de a página desenhar,
  // sem piscar. Quando o painel monta, js/app/cabecalho.js chama GC.personalizacao.aplicar() com o usuário real.
  // A tela é js/tela-personalizar.js (#/personalizar).

  // ---------- modelos prontos ----------
  // cores: principal (menu e cabeçalho), acao (botões, seleção, foco), acento (um destaque por tela), fundo.
  GC.MODELOS_APARENCIA = [
    { id: 'atlas', nome: 'Golden Atlas', descricao: 'A marca original: Titã, Egeu e Chama.', cores: { principal: '#0f4c5c', acao: '#008080', acento: '#f36f21', fundo: '#f3f6f6' }, fonte: 'sora' },
    { id: 'institucional', nome: 'Azul institucional', descricao: 'Sóbrio, para prefeituras de brasão azul.', cores: { principal: '#1e3a8a', acao: '#2563eb', acento: '#f59e0b', fundo: '#f4f6fb' }, fonte: 'sora' },
    { id: 'mata', nome: 'Verde mata', descricao: 'Verde escuro com dourado.', cores: { principal: '#14532d', acao: '#15803d', acento: '#ca8a04', fundo: '#f3f7f4' }, fonte: 'sora' },
    { id: 'vinho', nome: 'Vinho', descricao: 'Bordô com ouro velho.', cores: { principal: '#5b1a33', acao: '#9d2964', acento: '#d4a017', fundo: '#f8f4f5' }, fonte: 'sora' },
    { id: 'terracota', nome: 'Terracota', descricao: 'Tons de barro com azul petróleo.', cores: { principal: '#4a2c1a', acao: '#b45309', acento: '#0e7490', fundo: '#f8f5f1' }, fonte: 'inter' },
    { id: 'grafite', nome: 'Grafite', descricao: 'Neutro, quase sem cor. Bom para projetor.', cores: { principal: '#1f2937', acao: '#475569', acento: '#f36f21', fundo: '#f4f5f7' }, fonte: 'inter' },
  ];
  GC.FONTES_TITULO = [
    { id: 'sora', nome: 'Sora (marca)', css: "'Sora', 'Segoe UI', Helvetica, Arial, sans-serif" },
    { id: 'inter', nome: 'Inter (a mesma do texto)', css: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
    { id: 'sistema', nome: 'Fonte do sistema', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  ];
  GC.NIVEIS_PERSONALIZACAO = {
    pessoal: { nome: 'Só para mim', quem: 'Só você vê. Os outros continuam com o padrão.' },
    pasta: { nome: 'Padrão da secretaria', quem: 'Todas as pessoas da secretaria, menos quem escolheu uma aparência própria.' },
    prefeitura: { nome: 'Padrão de todos', quem: 'Todas as pessoas do painel, menos quem tem uma aparência da secretaria ou própria.' },
  };
  const MARCA_PADRAO = { nome: 'Golden Atlas', nomeCabecalho: '', nomeOficial: '', slogan: '', logo: null };
  // Nome que assina documentos (relatórios, Word, Excel): o oficial que o gestor geral escreveu, senão o padrão.
  GC.nomeOficialPrefeitura = (marca, cidade) => (marca && marca.nomeOficial) || (cidade ? `Prefeitura Municipal de ${cidade}` : 'Prefeitura Municipal');

  // ---------- exemplo de fábrica (demonstração) ----------
  // Uma cidade da demonstração já vem personalizada, para mostrar a tela em ação sem configurar nada:
  // Nova Aurora (grande) tem paleta própria, brasão, nome oficial, slogan, atendimento do portal e um padrão
  // da Secretaria de Saúde. Vale enquanto ninguém salvar nada nela; "Restaurar o exemplo" volta a ele.
  // As outras duas cidades ficam com a marca original, para comparar.
  // Brasão quadrado (escudo): lê bem sobre o menu escuro, no quadro branco do login e como ícone da aba.
  const BRASAO_AURORA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46" width="40" height="46">
    <path d="M2 2h36v19c0 12.5-8 20-18 23.5C10 41 2 33.5 2 21z" fill="#f2b705"/>
    <path d="M5.5 5.5h29v15.2c0 10.3-6.4 16.4-14.5 19.7C11.9 37.1 5.5 31 5.5 20.7z" fill="#0b3d6e"/>
    <path d="M13 24a7 7 0 0 1 14 0z" fill="#f2b705"/>
    <path d="M20 11v3M11.6 14.6l2 2M28.4 14.6l-2 2M9 24h2.6M29 24h-2.6" stroke="#f2b705" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M9.5 28.3q2.6-2 5.2 0t5.3 0 5.3 0 5.2 0M13 32.4q1.8-1.5 3.5 0t3.5 0 3.5 0 3.5 0" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`.replace(/\s*\n\s*/g, ' ');
  // Fundo da entrada do exemplo: um amanhecer sobre o mar e a orla (ilustração, no lugar de uma foto da cidade).
  const PREDIOS = [[0, 70], [60, 120], [130, 90], [190, 160], [260, 110], [320, 210], [380, 140], [450, 250], [520, 170],
    [590, 120], [650, 190], [720, 100], [1040, 120], [1100, 200], [1170, 150], [1230, 280], [1300, 180], [1370, 230], [1440, 130], [1510, 170], [1570, 90]];
  const AMANHECER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2a52"/><stop offset=".45" stop-color="#2f5d8a"/><stop offset=".7" stop-color="#f2a65a"/><stop offset=".78" stop-color="#ffd27a"/></linearGradient>
    <linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a25c"/><stop offset=".18" stop-color="#2c5a86"/><stop offset=".6" stop-color="#0b2a52"/></linearGradient></defs>
    <rect width="1600" height="540" fill="url(#c)"/>
    <circle cx="820" cy="520" r="110" fill="#ffe08a"/><circle cx="820" cy="520" r="190" fill="#ffe08a" opacity=".18"/>
    <path d="${PREDIOS.map(([x, h]) => `M${x} 540V${540 - Math.round(h * 0.8)}h56V540Z`).join("")}" fill="#13304f" opacity=".92"/>
    <rect y="540" width="1600" height="460" fill="url(#m)"/>
    <path d="M700 560h240M730 590h180M760 625h120M790 665h60" stroke="#ffe08a" stroke-width="6" stroke-linecap="round" opacity=".6"/>
    <path d="M0 760q50-14 100 0t100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0M0 860q50-14 100 0t100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0 100 0" fill="none" stroke="#ffffff" stroke-width="3" opacity=".18"/>
  </svg>`.replace(/\s*\n\s*/g, ' ');
  GC.PERSONALIZACAO_EXEMPLO = {
    grande: {
      prefeitura: {
        aparencia: { modelo: 'institucional', cores: { principal: '#0b3d6e', acao: '#0e7490', acento: '#f2b705', fundo: '#f2f6f9' }, fonte: 'sora' },
        marca: {
          nome: 'Painel Aurora',
          nomeCabecalho: 'Prefeitura de Nova Aurora',
          nomeOficial: 'Prefeitura da Cidade de Nova Aurora',
          slogan: 'Gestão 2025–2028 · Aurora para todos',
          logo: `data:image/svg+xml,${encodeURIComponent(BRASAO_AURORA)}`,
        },
        permitirPessoal: true,
        // A assistente se chama Iara (a mãe-d'água), com o sol do brasão no rosto e a cor do amanhecer.
        assistente: { nome: 'Iara', genero: 'f', forma: 'sol', cor: '#b45309', foto: null },
        entrada: { estilo: 'imagem', imagem: `data:image/svg+xml,${encodeURIComponent(AMANHECER)}`, veu: 45, transicao: 'esmaecer' },
        portal: {
          aparencia: null,
          atendimento: { telefone: '0800 000 0156', whatsapp: '00 90000-0156', email: 'ouvidoria@prefeitura.demo' },
          assinatura: false,
        },
      },
      pastas: { saude: { modelo: 'mata' } },
      pessoas: {},
    },
  };
  const LOGO_PADRAO = 'identidade-visual/logo/svg/reduzida-escuro.svg';
  GC.LOGO_MAX_BYTES = 200 * 1024;
  const BASE = GC.MODELOS_APARENCIA[0];

  // ---------- cores (puro, testável) ----------
  const HEX = /^#[0-9a-f]{6}$/i;
  GC.corValida = (c) => HEX.test(String(c || ''));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (r) => `#${r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
  GC.misturarCor = (a, b, t) => { const x = rgb(a); const y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  function luminancia(h) {
    const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  GC.contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  // Escurece (ou clareia) até chegar ao contraste mínimo com o fundo.
  function ate(cor, fundo, minimo, rumo) {
    let c = cor;
    for (let i = 0; i < 20 && GC.contraste(c, fundo) < minimo; i++) c = GC.misturarCor(c, rumo, 0.12);
    return c;
  }
  const TEXTO_ESCURO = '#17262b';
  const sobre = (cor) => (GC.contraste(cor, '#ffffff') >= GC.contraste(cor, TEXTO_ESCURO) ? '#ffffff' : TEXTO_ESCURO);

  // Aparência completa a partir de um pedaço (modelo + ajustes). Cor inválida volta à do modelo.
  GC.normalizarAparencia = function (a) {
    const m = GC.MODELOS_APARENCIA.find((x) => x.id === (a && a.modelo)) || BASE;
    const cores = {};
    Object.keys(BASE.cores).forEach((k) => { const c = a && a.cores && a.cores[k]; cores[k] = GC.corValida(c) ? c.toLowerCase() : m.cores[k]; });
    const fonte = GC.FONTES_TITULO.some((f) => f.id === (a && a.fonte)) ? a.fonte : m.fonte;
    return { modelo: m.id, cores, fonte };
  };
  const igualBase = (a) => JSON.stringify(GC.normalizarAparencia(a)) === JSON.stringify(GC.normalizarAparencia({ modelo: BASE.id }));
  // Ajustado à mão: alguma cor ou a fonte diferente do modelo escolhido.
  GC.aparenciaAjustada = (a) => { const n = GC.normalizarAparencia(a); return JSON.stringify(n) !== JSON.stringify(GC.normalizarAparencia({ modelo: n.modelo })); };

  // Variáveis CSS (tokens.css) de cada modo. Neutros, alertas e gráficos ficam como estão.
  GC.variaveisAparencia = function (aparencia) {
    const { cores: c, fonte } = GC.normalizarAparencia(aparencia);
    const fonteCss = GC.FONTES_TITULO.find((f) => f.id === fonte).css;
    const acaoEscuro = ate(GC.misturarCor(c.acao, '#ffffff', 0.25), '#11292f', 4.5, '#ffffff');
    const acentoEscuro = ate(c.acento, '#11292f', 3, '#ffffff');
    return {
      claro: {
        '--primaria': c.principal,
        '--primaria-escura': GC.misturarCor(c.principal, '#000000', 0.25),
        '--barra': c.principal,
        '--titulo': ate(c.principal, '#ffffff', 4.5, '#000000'),
        '--secundaria': c.acao,
        '--acao': c.acao,
        '--acao-hover': GC.misturarCor(c.acao, '#000000', 0.15),
        '--secundaria-texto': ate(c.acao, '#ffffff', 4.5, '#000000'),
        '--sobre-acao': sobre(c.acao),
        '--acento': c.acento,
        '--sobre-acento': sobre(c.acento),
        '--fundo': c.fundo,
        '--sup-2': GC.misturarCor(c.fundo, '#ffffff', 0.5),
        '--fonte-titulo': fonteCss,
      },
      escuro: {
        '--primaria': c.principal,
        '--primaria-escura': GC.misturarCor(c.principal, '#000000', 0.5),
        '--barra': GC.misturarCor(c.principal, '#000000', 0.5),
        '--titulo': ate(GC.misturarCor(c.principal, '#ffffff', 0.55), '#11292f', 4.5, '#ffffff'),
        '--secundaria': acaoEscuro,
        '--acao': acaoEscuro,
        '--acao-hover': GC.misturarCor(acaoEscuro, '#ffffff', 0.2),
        '--secundaria-texto': ate(acaoEscuro, '#11292f', 4.5, '#ffffff'),
        '--sobre-acao': sobre(acaoEscuro),
        '--acento': acentoEscuro,
        '--sobre-acento': sobre(acentoEscuro),
        // O claro mexe no fundo; no noturno ele volta ao de tokens.css (a regra do claro também vale aqui).
        '--fundo': '#0b1d22',
        '--sup-2': '#143038',
        '--fonte-titulo': fonteCss,
      },
    };
  };

  // Portal do Cidadão (css/cidadao.css): as mesmas cores com os nomes de lá. Atenção: no portal, --primaria é
  // a cor do botão (a "ação"), e --topo/--navy são a cor principal. O noturno do portal segue o aparelho.
  GC.variaveisPortal = function (aparencia) {
    const { cores: c, fonte } = GC.normalizarAparencia(aparencia);
    const fonteCss = GC.FONTES_TITULO.find((f) => f.id === fonte).css;
    const acaoEscuro = ate(GC.misturarCor(c.acao, '#ffffff', 0.25), '#11292f', 4.5, '#ffffff');
    const textoAcao = ate(c.acao, '#ffffff', 4.5, '#000000');
    return {
      claro: {
        '--navy': c.principal,
        '--navy-escuro': GC.misturarCor(c.principal, '#000000', 0.25),
        '--topo': c.principal,
        '--pino': c.principal,
        '--titulo': ate(c.principal, '#ffffff', 4.5, '#000000'),
        '--primaria': c.acao,
        '--primaria-hover': GC.misturarCor(c.acao, '#000000', 0.15),
        '--sobre-primaria': sobre(c.acao),
        '--ouro': c.acao,
        '--ouro-claro': GC.misturarCor(c.acao, '#ffffff', 0.5),
        '--ouro-fundo': GC.misturarCor(c.acao, '#ffffff', 0.88),
        '--ouro-texto': textoAcao,
        '--link': textoAcao,
        '--acento': c.acento,
        '--fundo': c.fundo,
        '--sup-2': GC.misturarCor(c.fundo, '#ffffff', 0.5),
        '--fonte-titulo': fonteCss,
      },
      escuro: {
        '--navy': GC.misturarCor(c.principal, '#000000', 0.6),
        '--navy-escuro': GC.misturarCor(c.principal, '#000000', 0.7),
        '--topo': GC.misturarCor(c.principal, '#000000', 0.6),
        '--primaria': acaoEscuro,
        '--primaria-hover': GC.misturarCor(acaoEscuro, '#ffffff', 0.2),
        '--sobre-primaria': sobre(acaoEscuro),
        '--ouro': acaoEscuro,
        '--ouro-claro': GC.misturarCor(acaoEscuro, '#ffffff', 0.3),
        '--ouro-fundo': GC.misturarCor(acaoEscuro, '#0b1d22', 0.78),
        '--ouro-texto': ate(acaoEscuro, '#11292f', 4.5, '#ffffff'),
        '--link': ate(acaoEscuro, '#11292f', 4.5, '#ffffff'),
        '--acento': ate(c.acento, '#11292f', 3, '#ffffff'),
        // Fundo e títulos do noturno de css/cidadao.css (a regra do claro também vale aqui).
        '--fundo': '#0b1d22',
        '--sup-2': '#143038',
        '--titulo': '#e7eff1',
        '--fonte-titulo': fonteCss,
      },
    };
  };

  // Atendimento ao cidadão: telefone (obrigatório, padrão 156), WhatsApp e e-mail da ouvidoria (opcionais).
  // Devolve { campo: mensagem } (vazio = tudo certo).
  // WhatsApp de demonstração (revisão de 19/11): o portal mostra o atendimento pelo WhatsApp sem precisar configurar.
  GC.ATENDIMENTO_PADRAO = { telefone: '156', whatsapp: '00 90000-0156', email: '' };
  GC.conferirAtendimento = function (a) {
    const erros = {};
    const tel = String((a && a.telefone) || '').trim();
    if (!/^[\d\s()+-]{3,20}$/.test(tel) || tel.replace(/\D/g, '').length < 3) erros.telefone = 'Digite o telefone (ex.: 156 ou 0800 123 4567).';
    const zap = String((a && a.whatsapp) || '').replace(/\D/g, '');
    if (zap && (zap.length < 10 || zap.length > 13)) erros.whatsapp = 'Digite o número com DDD (ex.: 11 91234-5678).';
    const email = String((a && a.email) || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = 'Digite um e-mail válido.';
    return erros;
  };
  // Link do WhatsApp: só dígitos, com o 55 do Brasil quando faltar.
  GC.linkWhatsapp = (n) => { const d = String(n || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : ''; };

  // Conferência de leitura (WCAG): o que fica difícil de ler com estas cores.
  GC.conferirContraste = function (aparencia) {
    const { cores: c } = GC.normalizarAparencia(aparencia);
    const v = GC.variaveisAparencia(aparencia).claro;
    const linha = (texto, a, b, minimo) => { const r = GC.contraste(a, b); return { texto, razao: Math.round(r * 10) / 10, minimo, ok: r >= minimo }; };
    return [
      linha('Texto e ícones claros sobre a cor principal (menu)', '#dde5e6', c.principal, 4.5),
      linha('Texto do botão principal', v['--sobre-acao'], c.acao, 4.5),
      linha('Cor de ação usada como texto ou link', v['--secundaria-texto'], '#ffffff', 4.5),
      linha('Texto do botão de destaque', v['--sobre-acento'], c.acento, 4.5),
      linha('Texto sobre o fundo', TEXTO_ESCURO, c.fundo, 4.5),
    ];
  };

  // ---------- assistente (IA): nome e rosto (puro, testável) ----------
  // Só o gestor geral muda, no "Padrão de todos". O rosto é um disco na cor da assistente com uma forma vazada
  // (máscara de css/marca.css, .maia-rosto::after) ou uma foto redonda. No código ela continua sendo a Maia.
  GC.ASSISTENTE_PADRAO = { nome: 'Maia', genero: 'f', forma: 'estrela', cor: '#6d28d9', foto: null };
  const raiosSol = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4; const p = (r, d) => `${(32 + r * Math.cos(a + d)).toFixed(1)} ${(32 + r * Math.sin(a + d)).toFixed(1)}`;
    return `M${p(13, -0.16)}L${p(21, 0)}L${p(13, 0.16)}Z`;
  }).join('');
  GC.FORMAS_ASSISTENTE = [
    { id: 'estrela', nome: 'Estrela', d: 'M32 12C36 28 36 28 52 32C36 36 36 36 32 52C28 36 28 36 12 32C28 28 28 28 32 12Z' },
    { id: 'brilhos', nome: 'Brilhos', d: 'M28 18C31 31 31 31 44 34C31 37 31 37 28 50C25 37 25 37 12 34C25 31 25 31 28 18ZM46 10C47.5 16.5 47.5 16.5 54 18C47.5 19.5 47.5 19.5 46 26C44.5 19.5 44.5 19.5 38 18C44.5 16.5 44.5 16.5 46 10Z' },
    { id: 'balao', nome: 'Balão de conversa', d: 'M17 17h30a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H31l-9 7v-7h-5a5 5 0 0 1-5-5V22a5 5 0 0 1 5-5Z' },
    { id: 'sol', nome: 'Sol', d: `M32 23a9 9 0 1 1 0 18 9 9 0 1 1 0-18Z${raiosSol}` },
    { id: 'folha', nome: 'Folha', d: 'M15 49C15 28 28 15 49 15C49 36 36 49 15 49Z' },
    { id: 'inicial', nome: 'Inicial do nome' },
  ];
  GC.FOTO_ASSISTENTE_MAX_BYTES = 200 * 1024;
  // Nome: 2 a 20 letras (com espaço, hífen e apóstrofo). Devolve null (pode) ou o motivo.
  GC.conferirNomeAssistente = function (nome) {
    const n = limpo(nome, 40);
    if (n.length < 2) return 'Digite o nome da assistente (2 letras ou mais).';
    if (n.length > 20) return 'Use até 20 letras.';
    if (!/^[\p{L}][\p{L} '’-]*$/u.test(n)) return 'Use só letras, sem números ou símbolos.';
    return null;
  };
  GC.normalizarAssistente = function (a) {
    const P = GC.ASSISTENTE_PADRAO;
    const nome = limpo(a && a.nome, 40);
    return {
      nome: nome && !GC.conferirNomeAssistente(nome) ? nome : P.nome,
      genero: a && a.genero === 'm' ? 'm' : 'f',
      forma: GC.FORMAS_ASSISTENTE.some((f) => f.id === (a && a.forma)) ? a.forma : P.forma,
      cor: a && GC.corValida(a.cor) ? a.cor.toLowerCase() : P.cor,
      foto: a && /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(a.foto || '') ? a.foto : null,
    };
  };
  const ehPadraoAssistente = (a) => JSON.stringify(GC.normalizarAssistente(a)) === JSON.stringify(GC.normalizarAssistente(null));
  // A forma vazada do rosto, como imagem SVG para a máscara. "inicial": a primeira letra do nome.
  GC.mascaraAssistente = function (a) {
    const n = GC.normalizarAssistente(a);
    const f = GC.FORMAS_ASSISTENTE.find((x) => x.id === n.forma);
    const desenho = f.d ? `<path d='${f.d}'/>`
      : `<text x='32' y='44.5' text-anchor='middle' font-family='Arial,Helvetica,sans-serif' font-weight='700' font-size='34'>${n.nome[0].toLocaleUpperCase('pt-BR').replace(/[<>&'"]/g, '')}</text>`;
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${desenho}</svg>`).replace(/'/g, '%27')}`;
  };
  // Cores da assistente nos dois modos (tokens.css: --ia, --ia-fundo, --ia-borda). O noturno clareia até ler.
  GC.variaveisAssistente = function (a) {
    const { cor } = GC.normalizarAssistente(a);
    const escuro = ate(GC.misturarCor(cor, '#ffffff', 0.35), '#11292f', 4.5, '#ffffff');
    return {
      claro: { '--ia': ate(cor, '#ffffff', 4.5, '#000000'), '--ia-fundo': GC.misturarCor(cor, '#ffffff', 0.92), '--ia-borda': GC.misturarCor(cor, '#ffffff', 0.72) },
      escuro: { '--ia': escuro, '--ia-fundo': GC.misturarCor(cor, '#0b1d22', 0.8), '--ia-borda': GC.misturarCor(cor, '#0b1d22', 0.55) },
    };
  };
  // Troca "Maia" pelo nome escolhido, acertando o artigo quando a assistente é "ele": "a Maia" → "o Léo",
  // "da Maia" → "do Léo", "à Maia" → "ao Léo", "na" → "no", "pela" → "pelo". "Maiara" e afins ficam como estão.
  const ARTIGO_M = { a: 'o', A: 'O', 'à': 'ao', 'À': 'Ao', da: 'do', Da: 'Do', na: 'no', Na: 'No', pela: 'pelo', Pela: 'Pelo' };
  GC.trocarNomeAssistente = function (texto, a) {
    const t = String(texto == null ? '' : texto);
    const n = GC.normalizarAssistente(a);
    if ((n.nome === 'Maia' && n.genero === 'f') || t.indexOf('Maia') < 0) return t;
    return t.replace(/(^|[^\p{L}])(?:(à|À|da|Da|na|Na|pela|Pela|a|A)(\s+))?Maia(?![\p{L}])/gu,
      (m, antes, art, espaco) => `${antes}${art ? `${n.genero === 'm' ? ARTIGO_M[art] : art}${espaco}` : ''}${n.nome}`);
  };

  // O contrário: devolve um nome já trocado para "Maia" (com o artigo de volta ao feminino). Serve para trocar
  // de nome com a página aberta: o texto que já dizia "o Léo" passa a dizer "a Maia" e, daí, o nome novo.
  const ARTIGO_F = { o: 'a', O: 'A', ao: 'à', Ao: 'À', do: 'da', Do: 'Da', no: 'na', No: 'Na', pelo: 'pela', Pelo: 'Pela' };
  GC.voltarNomeAssistente = function (texto, a) {
    const t = String(texto == null ? '' : texto);
    const n = GC.normalizarAssistente(a);
    if (n.nome === 'Maia' || t.indexOf(n.nome) < 0) return t;
    const nome = n.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const arts = n.genero === 'm' ? 'ao|Ao|do|Do|no|No|pelo|Pelo|o|O' : 'à|À|da|Da|na|Na|pela|Pela|a|A';
    return t.replace(new RegExp(`(^|[^\\p{L}])(?:(${arts})(\\s+))?${nome}(?![\\p{L}])`, 'gu'),
      (m, antes, art, espaco) => `${antes}${art ? `${n.genero === 'm' ? ARTIGO_F[art] : art}${espaco}` : ''}Maia`);
  };

  // ---------- entrada do painel: fundo e transição (puro, testável) ----------
  // estilo: 'grafismo' (o campo de símbolos da marca), 'liso' (só a cor principal) ou 'imagem' (foto com um véu na
  // cor principal, para o texto branco continuar legível). veu: 20 a 85 (%). transicao: do login ao painel.
  GC.ENTRADA_PADRAO = { estilo: 'grafismo', imagem: null, veu: 55, transicao: 'abrir' };
  GC.ESTILOS_FUNDO_ENTRADA = [
    { id: 'grafismo', nome: 'Grafismo da marca', descricao: 'O campo de símbolos, com um aceso.' },
    { id: 'liso', nome: 'Cor lisa', descricao: 'Só a cor principal.' },
    { id: 'imagem', nome: 'Imagem', descricao: 'Uma foto da cidade, com um véu na cor principal.' },
  ];
  GC.TRANSICOES_ENTRADA = [
    { id: 'abrir', nome: 'Abrir', descricao: 'O lado da marca se abre e cobre a tela.' },
    { id: 'esmaecer', nome: 'Esmaecer', descricao: 'A tela de abertura aparece aos poucos.' },
    { id: 'direta', nome: 'Direta', descricao: 'Vai ao painel sem animação.' },
  ];
  GC.FUNDO_MAX_BYTES = 900 * 1024;
  GC.normalizarEntrada = function (e) {
    const P = GC.ENTRADA_PADRAO;
    const imagem = e && /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(e.imagem || '') ? e.imagem : null;
    let estilo = GC.ESTILOS_FUNDO_ENTRADA.some((x) => x.id === (e && e.estilo)) ? e.estilo : P.estilo;
    if (estilo === 'imagem' && !imagem) estilo = P.estilo;
    const veu = e && e.veu != null && e.veu !== '' ? Math.round(Number(e.veu)) : NaN;
    return {
      estilo,
      imagem,
      veu: Number.isFinite(veu) ? Math.max(20, Math.min(85, veu)) : P.veu,
      transicao: GC.TRANSICOES_ENTRADA.some((x) => x.id === (e && e.transicao)) ? e.transicao : P.transicao,
    };
  };
  // CSS do fundo (para o lado da marca no login, a capa de saída e a abertura do painel). null = o grafismo.
  GC.fundoEntradaCss = function (e, principal) {
    const n = GC.normalizarEntrada(e);
    if (n.estilo === 'grafismo') return null;
    if (n.estilo === 'liso') return '';
    const c = GC.corValida(principal) ? principal : BASE.cores.principal;
    const [r, g, b] = rgb(c);
    // Mais claro em cima (a foto aparece) e mais fechado embaixo, onde fica o texto.
    const veu = (k) => `rgba(${r}, ${g}, ${b}, ${Math.min(0.95, (n.veu / 100) * k).toFixed(2)})`;
    return `linear-gradient(180deg, ${veu(0.7)} 0%, ${veu(1)} 55%, ${veu(1.25)} 100%), url("${n.imagem}") center / cover no-repeat`;
  };

  // ---------- quem pode o quê (puro, testável) ----------
  // Níveis que a pessoa pode editar. Cidadão (sem usuário) não personaliza nada.
  // Permissões 'aparencia.<nível>' e 'aparencia.marca' (js/permissoes.js, carregado antes no <head>).
  const quemPersonaliza = (u) => ({ perfil: { id: u.perfil, area: u.area }, usuario: u });
  GC.niveisDoUsuario = function (u) {
    if (!u || u.ativo === false || !GC.pode) return [];
    return ['pessoal', 'pasta', 'prefeitura'].filter((n) => GC.pode(`aparencia.${n}`, n === 'pasta' ? { area: u.area } : null, quemPersonaliza(u)));
  };
  // campo: 'aparencia' | 'marca' (nome, logo e a trava). config: o salvo (a trava vale para o nível pessoal).
  GC.podePersonalizar = function (u, nivel, campo = 'aparencia', config = null) {
    if (!GC.niveisDoUsuario(u).includes(nivel)) return false;
    if (campo === 'marca') return nivel === 'prefeitura' && GC.pode('aparencia.marca', null, quemPersonaliza(u));
    if (nivel === 'pessoal' && config && config.prefeitura && config.prefeitura.permitirPessoal === false) return false;
    return true;
  };

  // Logo enviado: imagem, até 200 KB. Devolve null (pode) ou o motivo.
  GC.conferirLogo = function (arquivo) {
    if (!arquivo) return 'Escolha um arquivo.';
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(arquivo.type)) return 'Use PNG, JPG, SVG ou WebP.';
    if (arquivo.size > GC.LOGO_MAX_BYTES) return `O arquivo tem ${Math.round(arquivo.size / 1024)} KB. O limite é ${GC.LOGO_MAX_BYTES / 1024} KB.`;
    return null;
  };
  const limpo = (t, max) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, max);

  // ---------- configuração salva ----------
  // armazenamento: { ler(), gravar(o) } com { prefeitura: { aparencia, marca, permitirPessoal }, pastas: { area: aparencia },
  // pessoas: { idDoUsuario: aparencia } }. Uma por cidade da demonstração.
  // fabrica (objeto ou função): a configuração que vale enquanto nada foi salvo (o exemplo da demonstração).
  GC.criarPersonalizacao = function ({ armazenamento, fabrica } = {}) {
    let mem = null;
    const S = armazenamento || { ler: () => mem, gravar: (o) => { mem = o; } };
    const deFabrica = () => { const f = typeof fabrica === 'function' ? fabrica() : fabrica; return f ? JSON.parse(JSON.stringify(f)) : null; };
    const ler = () => { const o = S.ler() || deFabrica() || {}; return { prefeitura: o.prefeitura || {}, pastas: o.pastas || {}, pessoas: o.pessoas || {} }; };
    // Exemplo: esta cidade tem um de fábrica? E ele ainda vale (ninguém salvou nada por cima)?
    const temExemplo = () => !!deFabrica();
    const noExemplo = () => temExemplo() && !S.ler();
    // Alguma coisa foi personalizada aqui (cores, marca, portal ou pastas)?
    function personalizada() {
      const o = ler();
      return !!(o.prefeitura.aparencia || o.prefeitura.marca || o.prefeitura.portal || o.prefeitura.assistente || o.prefeitura.entrada || Object.keys(o.pastas).length);
    }
    // Volta ao exemplo de fábrica (apaga o que foi salvo). Só o gestor geral.
    function restaurarExemplo(u) {
      if (!temExemplo()) return { ok: false, motivo: 'sem_exemplo' };
      if (!GC.podePersonalizar(u, 'prefeitura', 'marca')) return { ok: false, motivo: 'permissao' };
      S.gravar(null);
      return { ok: true };
    }

    // A aparência que vale para a pessoa e de onde ela vem ('original' | 'prefeitura' | 'pasta' | 'pessoal').
    function resolver(u) {
      const o = ler();
      const camadas = [['prefeitura', o.prefeitura.aparencia], ['pasta', u && u.area ? o.pastas[u.area] : null]];
      if (o.prefeitura.permitirPessoal !== false) camadas.push(['pessoal', u ? o.pessoas[u.id] : null]);
      let origem = 'original';
      let aparencia = { modelo: BASE.id };
      camadas.forEach(([nivel, a]) => { if (a) { origem = nivel; aparencia = a; } });
      return { aparencia: GC.normalizarAparencia(aparencia), origem, marca: marca(), permitirPessoal: o.prefeitura.permitirPessoal !== false };
    }
    function marca() {
      const p = ler().prefeitura;
      const m = p.marca || {};
      return {
        nome: m.nome || MARCA_PADRAO.nome, nomeCabecalho: m.nomeCabecalho || '', nomeOficial: m.nomeOficial || '', slogan: m.slogan || '', logo: m.logo || null,
        // Moram ao lado da marca (o "Restaurar nome e logo" não mexe neles), mas viajam com ela.
        assistente: GC.normalizarAssistente(p.assistente), entrada: GC.normalizarEntrada(p.entrada),
      };
    }
    // O que está salvo num nível (null = herda do nível de cima).
    function doNivel(nivel, u) {
      const o = ler();
      if (nivel === 'prefeitura') return o.prefeitura.aparencia || null;
      if (nivel === 'pasta') return (u && o.pastas[u.area]) || null;
      return (u && o.pessoas[u.id]) || null;
    }
    // O que a pessoa veria se apagasse este nível (para "voltar ao padrão").
    function herdado(nivel, u) {
      const o = ler();
      if (nivel === 'pessoal' && u && u.area && o.pastas[u.area]) return { aparencia: GC.normalizarAparencia(o.pastas[u.area]), origem: 'pasta' };
      if (nivel !== 'prefeitura' && o.prefeitura.aparencia) return { aparencia: GC.normalizarAparencia(o.prefeitura.aparencia), origem: 'prefeitura' };
      return { aparencia: GC.normalizarAparencia({ modelo: BASE.id }), origem: 'original' };
    }

    // aparencia: null apaga o nível (volta a herdar). Devolve { ok, motivo }.
    function salvarAparencia(nivel, u, aparencia) {
      const o = ler();
      if (!GC.podePersonalizar(u, nivel, 'aparencia', o)) return { ok: false, motivo: 'permissao' };
      const a = aparencia ? GC.normalizarAparencia(aparencia) : null;
      // No nível de todos, escolher a marca original é o mesmo que não ter padrão.
      const valor = nivel === 'prefeitura' && a && igualBase(a) ? null : a;
      if (nivel === 'prefeitura') o.prefeitura.aparencia = valor;
      else if (nivel === 'pasta') { if (valor) o.pastas[u.area] = valor; else delete o.pastas[u.area]; } else if (valor) o.pessoas[u.id] = valor; else delete o.pessoas[u.id];
      S.gravar(o);
      return { ok: true };
    }
    // dados: { nome, nomeCabecalho, nomeOficial, slogan, logo (data URL ou null), permitirPessoal }. Só o gestor geral.
    function salvarMarca(u, dados) {
      const o = ler();
      if (!GC.podePersonalizar(u, 'prefeitura', 'marca')) return { ok: false, motivo: 'permissao' };
      const nome = limpo(dados.nome, 40);
      if (!nome) return { ok: false, motivo: 'nome' };
      const logo = dados.logo && /^data:image\/(png|jpeg|svg\+xml|webp)[;,]/.test(dados.logo) ? dados.logo : null;
      o.prefeitura.marca = { nome, nomeCabecalho: limpo(dados.nomeCabecalho, 40), nomeOficial: limpo(dados.nomeOficial, 70), slogan: limpo(dados.slogan, 70), logo };
      o.prefeitura.permitirPessoal = dados.permitirPessoal !== false;
      // Assistente e entrada: só quando vierem (null volta ao padrão). Nome inválido não salva nada.
      if (dados.assistente !== undefined) {
        if (dados.assistente && GC.conferirNomeAssistente(dados.assistente.nome)) return { ok: false, motivo: 'assistente' };
        const a = dados.assistente ? GC.normalizarAssistente(dados.assistente) : null;
        if (a && !ehPadraoAssistente(a)) o.prefeitura.assistente = a; else delete o.prefeitura.assistente;
      }
      if (dados.entrada !== undefined) {
        const e = dados.entrada ? GC.normalizarEntrada(dados.entrada) : null;
        if (e && JSON.stringify(e) !== JSON.stringify(GC.normalizarEntrada(null))) o.prefeitura.entrada = e; else delete o.prefeitura.entrada;
      }
      S.gravar(o);
      return { ok: true };
    }
    function restaurarMarca(u) {
      const o = ler();
      if (!GC.podePersonalizar(u, 'prefeitura', 'marca')) return { ok: false, motivo: 'permissao' };
      delete o.prefeitura.marca;
      o.prefeitura.permitirPessoal = true;
      S.gravar(o);
      return { ok: true };
    }
    // ---- Portal do Cidadão: só o gestor geral; não há usuário do outro lado, então vale um nível só ----
    // portal: { aparencia (null = as mesmas cores do padrão de todos), atendimento, assinatura }.
    function portal() {
      const o = ler();
      const p = o.prefeitura.portal || {};
      const propria = p.aparencia || null;
      const doPainel = o.prefeitura.aparencia || null;
      return {
        aparencia: GC.normalizarAparencia(propria || doPainel || { modelo: BASE.id }),
        origem: propria ? 'portal' : doPainel ? 'prefeitura' : 'original',
        segue: !propria,
        marca: marca(),
        atendimento: Object.assign({}, GC.ATENDIMENTO_PADRAO, p.atendimento || {}),
        assinatura: p.assinatura !== false,
      };
    }
    // dados: { segue, aparencia, atendimento, assinatura }. Devolve { ok, motivo, erros }.
    function salvarPortal(u, dados) {
      const o = ler();
      if (!GC.podePersonalizar(u, 'prefeitura', 'marca')) return { ok: false, motivo: 'permissao' };
      const at = Object.assign({}, GC.ATENDIMENTO_PADRAO, dados.atendimento || {});
      const erros = GC.conferirAtendimento(at);
      if (Object.keys(erros).length) return { ok: false, motivo: 'atendimento', erros };
      o.prefeitura.portal = {
        aparencia: dados.segue || !dados.aparencia ? null : GC.normalizarAparencia(dados.aparencia),
        atendimento: { telefone: at.telefone.trim(), whatsapp: String(at.whatsapp || '').trim(), email: String(at.email || '').trim() },
        assinatura: dados.assinatura !== false,
      };
      S.gravar(o);
      return { ok: true };
    }
    return { ler, resolver, marca, doNivel, herdado, salvarAparencia, salvarMarca, restaurarMarca, portal, salvarPortal, temExemplo, noExemplo, personalizada, restaurarExemplo, MARCA_PADRAO };
  };

  // ---------- aplicar na página (navegador) ----------
  if (typeof document === 'undefined' || !document.documentElement) return;
  const CHAVE_APLICADA = 'vd-aparencia-aplicada';
  const declarar = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('');

  // Uma <style> no fim do <head>: o original (tokens.css) fica intacto e "voltar" é só apagar a regra.
  function aplicarCores(aparencia) {
    let el = document.getElementById('vd-aparencia');
    if (!aparencia || igualBase(aparencia)) { if (el) el.remove(); return; }
    const v = GC.variaveisAparencia(aparencia);
    if (!el) { el = document.createElement('style'); el.id = 'vd-aparencia'; }
    el.textContent = `html:root{${declarar(v.claro)}}html[data-tema="escuro"]{${declarar(v.escuro)}}`;
    document.head.appendChild(el); // sempre por último, depois de qualquer folha de estilo
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && document.documentElement.dataset.tema !== 'escuro') meta.content = v.claro['--primaria'];
  }

  // Nome, logo e o nome do cabeçalho (só o que o gestor geral definiu; o resto fica como veio).
  function aplicarMarca(m) {
    if (!m) return;
    document.querySelectorAll('.logo-atlas').forEach((img) => {
      img.src = m.logo || LOGO_PADRAO;
      img.alt = m.nome;
      img.classList.toggle('logo-propria', !!m.logo);
    });
    // Tela de abertura: o logo próprio no lugar do vertical da marca.
    const abertura = document.querySelector('.carregando-logo');
    if (abertura && m.logo) { abertura.src = m.logo; abertura.alt = m.nome; abertura.classList.add('logo-propria'); }
    // Título da aba: "<cabeçalho> · <plataforma ou pasta>".
    const partes = document.title.split(' · ');
    if (m.nomeCabecalho) {
      const n = document.getElementById('cidade-nome');
      if (n) n.textContent = m.nomeCabecalho;
      partes[0] = m.nomeCabecalho;
    }
    if (partes[partes.length - 1] === MARCA_PADRAO.nome) partes[partes.length - 1] = m.nome;
    document.title = partes.join(' · ');
  }

  // Favicon e ícone do celular: o logo próprio da prefeitura; sem ele, os da marca (guardados no data-original).
  function aplicarFavicon(logo) {
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
      if (!l.dataset.original) { l.dataset.original = l.getAttribute('href'); l.dataset.tipoOriginal = l.getAttribute('type') || ''; }
      const href = logo || l.dataset.original;
      if (l.getAttribute('href') !== href) l.setAttribute('href', href);
      // O favicon da marca é SVG; o logo próprio pode ser PNG, JPEG ou WebP.
      const tipo = logo ? (/^data:(image\/[\w+.-]+)/.exec(logo) || [])[1] : l.dataset.tipoOriginal;
      if (tipo) l.setAttribute('type', tipo); else l.removeAttribute('type');
    });
  }

  // ---- Assistente: cores, rosto e nome (painel) ----
  // Cores e rosto numa <style> própria; o nome é trocado no texto da página (e no que chega depois) por um
  // observador, para não espalhar o nome pelos ~100 textos que dizem "Maia". Quem marca [data-assistente-fixo]
  // fica de fora (os campos da própria tela de personalização).
  let assistenteAtual = GC.normalizarAssistente(null);
  GC.assistente = () => assistenteAtual;
  GC.textoAssistente = (t) => GC.trocarNomeAssistente(t, assistenteAtual);
  const ATRIBUTOS_NOME = ['title', 'aria-label', 'placeholder', 'alt', 'data-dica'];
  const precisaTrocar = () => !(assistenteAtual.nome === 'Maia' && assistenteAtual.genero === 'f');
  // Troca o nome num nó e no que está dentro dele. procura: o texto que interessa; trocar: a transformação.
  function trocarEm(no, procura = 'Maia', trocar = GC.textoAssistente) {
    if (!no || (procura === 'Maia' && !precisaTrocar())) return;
    const fixo = (el) => el && el.closest && el.closest('[data-assistente-fixo], script, style, textarea, [contenteditable="true"]');
    if (no.nodeType === 3) {
      if (no.nodeValue.indexOf(procura) >= 0 && !fixo(no.parentElement)) no.nodeValue = trocar(no.nodeValue);
      return;
    }
    if (no.nodeType !== 1 || fixo(no)) return;
    const elementos = [no, ...no.querySelectorAll('*')];
    elementos.forEach((el) => {
      if (fixo(el)) return;
      ATRIBUTOS_NOME.forEach((a) => { const v = el.getAttribute(a); if (v && v.indexOf(procura) >= 0) el.setAttribute(a, trocar(v)); });
    });
    const andar = document.createTreeWalker(no, NodeFilter.SHOW_TEXT);
    for (let t = andar.nextNode(); t; t = andar.nextNode()) {
      if (t.nodeValue.indexOf(procura) >= 0 && !fixo(t.parentElement)) t.nodeValue = trocar(t.nodeValue);
    }
  }
  let observador = null;
  function vigiarNome() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', vigiarNome, { once: true }); return; }
    if (!precisaTrocar()) { if (observador) { observador.disconnect(); observador = null; } return; }
    trocarEm(document.body);
    if (document.title.indexOf('Maia') >= 0) document.title = GC.textoAssistente(document.title);
    if (observador || typeof MutationObserver === 'undefined') return;
    observador = new MutationObserver((lista) => {
      lista.forEach((m) => {
        if (m.type === 'characterData') trocarEm(m.target);
        else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && v.indexOf('Maia') >= 0) trocarEm(m.target); } else m.addedNodes.forEach((n) => trocarEm(n));
      });
    });
    observador.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS_NOME });
  }
  function aplicarAssistente(a) {
    const anterior = assistenteAtual;
    assistenteAtual = GC.normalizarAssistente(a);
    let el = document.getElementById('vd-assistente');
    if (ehPadraoAssistente(assistenteAtual)) { if (el) el.remove(); } else {
      const v = GC.variaveisAssistente(assistenteAtual);
      const mascara = `url("${GC.mascaraAssistente(assistenteAtual)}") center / contain no-repeat`;
      const f = assistenteAtual.foto;
      if (!el) { el = document.createElement('style'); el.id = 'vd-assistente'; }
      // O portal segue o noturno do aparelho; o painel, o data-tema.
      const escuro = ehPortal ? `@media (prefers-color-scheme: dark){html:root{${declarar(v.escuro)}}}` : `html[data-tema="escuro"]{${declarar(v.escuro)}}`;
      el.textContent = `html:root{${declarar(v.claro)}}${escuro}`
        + (f ? `.maia-rosto{background:var(--cartao) url("${f}") center / cover no-repeat}.maia-rosto::after{display:none}`
          : `.maia-rosto::after{-webkit-mask:${mascara};mask:${mascara}}`);
      document.head.appendChild(el);
    }
    // Trocou de nome com a página aberta: o que já dizia o nome antigo volta a "Maia" e daí vai ao novo.
    if (anterior.nome !== assistenteAtual.nome || anterior.genero !== assistenteAtual.genero) {
      if (anterior.nome !== 'Maia' && document.body) {
        trocarEm(document.body, anterior.nome, (t) => GC.textoAssistente(GC.voltarNomeAssistente(t, anterior)));
        if (document.title.indexOf(anterior.nome) >= 0) document.title = GC.textoAssistente(GC.voltarNomeAssistente(document.title, anterior));
      }
      vigiarNome();
    }
  }

  // ---- Entrada: fundo do lado da marca (login), da capa de saída e da abertura do painel ----
  // Devolve true quando o fundo é o grafismo (quem chama desenha o campo de símbolos), false quando já pôs outro.
  function aplicarFundo(el, entrada, principal) {
    const css = GC.fundoEntradaCss(entrada, principal);
    if (css === null || !el) return true;
    el.style.background = css || '';
    el.classList.add('vd-fundo-proprio');
    return false;
  }

  // ---- Portal do Cidadão (cidadao.html carrega este arquivo com data-portal) ----
  const ehPortal = !!(document.currentScript && document.currentScript.hasAttribute('data-portal'));
  // Página de entrada (entrar.html carrega com data-entrada): ninguém entrou ainda, então vale o padrão de todos.
  const ehEntrada = !!(document.currentScript && document.currentScript.hasAttribute('data-entrada'));
  // O noturno do portal segue o aparelho (prefers-color-scheme), como em css/cidadao.css.
  function aplicarCoresPortal(aparencia) {
    let el = document.getElementById('vd-aparencia');
    if (!aparencia || igualBase(aparencia)) { if (el) el.remove(); return; }
    const v = GC.variaveisPortal(aparencia);
    if (!el) { el = document.createElement('style'); el.id = 'vd-aparencia'; }
    el.textContent = `html:root{${declarar(v.claro)}}@media (prefers-color-scheme: dark){html:root{${declarar(v.escuro)}}}`;
    document.head.appendChild(el);
    const meta = document.querySelector('meta[name="theme-color"][media*="light"]');
    if (meta) meta.content = v.claro['--topo'];
  }
  // Logo e nome no topo; a assinatura "Feito com o Golden Atlas" no rodapé.
  function aplicarMarcaPortal(r) {
    const ic = document.querySelector('.p-marca-ic');
    if (ic) {
      ic.classList.toggle('p-marca-logo', !!r.marca.logo);
      ic.innerHTML = r.marca.logo ? `<img src="${GC.escaparHtml ? GC.escaparHtml(r.marca.logo) : r.marca.logo}" alt="">` : '<i class="ti ti-building-community"></i>';
    }
    const nome = document.querySelector('.p-marca > span:last-child');
    if (nome && r.marca.nomeCabecalho) {
      nome.innerHTML = '';
      const b = document.createElement('b');
      b.id = 'p-cidade';
      b.textContent = r.marca.nomeCabecalho;
      nome.appendChild(b);
    }
    const assinatura = document.querySelector('.p-assinatura');
    if (assinatura) assinatura.hidden = !r.assinatura;
    // Slogan da gestão no rodapé, logo acima da assinatura.
    const rodape = document.querySelector('.p-rodape');
    if (rodape) {
      let s = rodape.querySelector('.p-slogan');
      if (r.marca.slogan) {
        if (!s) { s = document.createElement('p'); s.className = 'p-slogan'; rodape.insertBefore(s, assinatura || null); }
        s.textContent = r.marca.slogan;
      } else if (s) s.remove();
    }
  }

  // ---- antes de desenhar (este arquivo roda no <head>) ----
  // A cidade ainda não carregou (js/cidade.js vem depois): mesma regra de lá, ?cidade= ou a última escolhida.
  const CIDADES_DEMO = ['pequena', 'media', 'grande'];
  function cidadeNoHead() {
    try {
      const url = new URLSearchParams(window.location.search).get('cidade');
      if (CIDADES_DEMO.includes(url)) return url;
      const salva = localStorage.getItem('vd-cidade');
      if (CIDADES_DEMO.includes(salva)) return salva;
    } catch (e) { /* sem armazenamento */ }
    return 'media';
  }
  const chaveCidade = () => `vd-personalizacao.${GC.cidade ? GC.cidade.id : cidadeNoHead()}`;
  const raiz = document.documentElement;
  // Logo e nome próprios só existem depois que a página monta: até lá, o lugar deles fica reservado e vazio
  // (visibility), em vez de mostrar o logo original e trocar na frente de quem olha. Nunca mais que 3 s.
  function reservarMarca(m) {
    if (!m.logo && !m.nomeCabecalho) return;
    raiz.classList.add('vd-marca-pendente');
    setTimeout(() => raiz.classList.remove('vd-marca-pendente'), 3000);
  }
  const marcaPronta = () => raiz.classList.remove('vd-marca-pendente');

  // A configuração salva (uma por cidade). A chave é lida a cada acesso: no <head> vem da URL, depois de GC.cidade.
  // gravar(null) apaga a chave: a cidade volta ao exemplo de fábrica (se tiver um) ou à marca original.
  const armazenamentoDe = (chave) => ({
    ler() { try { return JSON.parse(localStorage.getItem(chave())); } catch (e) { return null; } },
    gravar(o) { try { if (o == null) localStorage.removeItem(chave()); else localStorage.setItem(chave(), JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
  });
  const cidadeAgora = () => (GC.cidade ? GC.cidade.id : cidadeNoHead());
  let instancia = null;
  function configSalva() {
    if (!instancia) {
      instancia = GC.criarPersonalizacao({ armazenamento: armazenamentoDe(chaveCidade), fabrica: () => GC.PERSONALIZACAO_EXEMPLO[cidadeAgora()] });
    }
    return instancia;
  }
  // A configuração de outra cidade da demonstração (seletor de cidade), só para ler.
  const outras = {};
  function daCidade(id) {
    if (id === cidadeAgora()) return configSalva();
    if (!outras[id]) outras[id] = GC.criarPersonalizacao({ armazenamento: armazenamentoDe(() => `vd-personalizacao.${id}`), fabrica: GC.PERSONALIZACAO_EXEMPLO[id] });
    return outras[id];
  }

  try {
    if (ehPortal) {
      // Portal: não há usuário, então tudo que vale já está na configuração salva. Aplica direto, sem piscar.
      const r = configSalva().portal();
      aplicarCoresPortal(r.aparencia);
      reservarMarca(r.marca);
      aplicarFavicon(r.marca.logo);
      if (!r.assinatura) raiz.classList.add('vd-sem-assinatura');
      // A Maia do portal (botão flutuante, js/portal-maia.js) tem o nome e a cor da assistente da Prefeitura.
      aplicarAssistente(r.marca.assistente);
    } else if (ehEntrada) {
      // Entrada: as cores e a marca da prefeitura (nunca as pessoais de quem usou o navegador antes).
      const r = configSalva().resolver(null);
      aplicarCores(r.aparencia);
      reservarMarca(r.marca);
      aplicarFavicon(r.marca.logo);
    } else {
      // Painel: a aparência depende de quem entrou (só conhecido depois). Usa a última aplicada neste navegador;
      // nome e logo são da prefeitura, então já dá para reservar o lugar deles.
      const salva = JSON.parse(localStorage.getItem(CHAVE_APLICADA) || 'null');
      if (salva && salva.aparencia) aplicarCores(salva.aparencia);
      const m = configSalva().marca();
      reservarMarca(m);
      aplicarFavicon(m.logo);
      aplicarAssistente(m.assistente);
    }
  } catch (e) { /* sem armazenamento: fica a marca original */ }

  GC.personalizacao = {
    config: configSalva,
    daCidade,
    // Aplica o que vale para quem usa o painel agora e guarda para a próxima abertura.
    aplicar() {
      const r = this.config().resolver(GC.usuarioAtual ? GC.usuarioAtual() : null);
      aplicarCores(r.aparencia);
      aplicarMarca(r.marca);
      aplicarAssistente(r.marca.assistente);
      aplicarFavicon(r.marca.logo);
      marcaPronta();
      try { localStorage.setItem(CHAVE_APLICADA, JSON.stringify({ aparencia: r.aparencia })); } catch (e) { /* sem armazenamento */ }
      return r;
    },
    // Portal do Cidadão: cores, logo, nome e assinatura (js/portal-cidadao.js chama depois de montar o topo).
    aplicarPortal() {
      const r = this.config().portal();
      aplicarCoresPortal(r.aparencia);
      aplicarMarcaPortal(r);
      aplicarFavicon(r.marca.logo);
      raiz.classList.toggle('vd-sem-assinatura', !r.assinatura);
      aplicarAssistente(r.marca.assistente);
      marcaPronta();
      return r;
    },
    // Página de entrada: cores e marca do padrão de todos. Quem monta a página (js/tela-entrar.js) põe nome e logo.
    aplicarEntrada() {
      const r = this.config().resolver(null);
      aplicarCores(r.aparencia);
      aplicarFavicon(r.marca.logo);
      marcaPronta();
      return r;
    },
    // Fundo da entrada (login, capa de saída, abertura do painel): o do padrão de todos, na cor principal de todos.
    entrada() { const c = this.config(); return { entrada: c.marca().entrada, principal: c.resolver(null).aparencia.cores.principal }; },
    aplicarFundo(el) { const x = this.entrada(); return aplicarFundo(el, x.entrada, x.principal); },
    LOGO_PADRAO,
  };
  // Telefone, WhatsApp e e-mail do atendimento, para os textos do portal (js/tela-cidadao.js, js/portal-cidadao.js).
  GC.atendimentoPortal = () => GC.personalizacao.config().portal().atendimento;
})(window.GC = window.GC || {});
