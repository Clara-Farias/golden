(function (GC) {
  // Extrator único da Maia: lê bairro, secretaria, equipamento, período, comparação, porquê e intenção de
  // qualquer pergunta. Puro (testável em Node). O motor (js/ia-roteiro.js) usa o resultado para escolher o
  // tema e os temas o recebem como terceiro argumento de responder(ctx, q, entendido).
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Palavra inteira (com plural simples) dentro de q, já normalizado. Devolve a posição ou -1.
  const posicao = (q, termo) => {
    const m = new RegExp(`(^|[^a-z0-9])${escRe(termo)}s?(?=$|[^a-z0-9])`).exec(q);
    return m ? m.index + m[1].length : -1;
  };

  // Palavras que não servem de apelido de bairro: genéricas ou parecidas com o nome da cidade.
  const NAO_APELIDO = new Set(['vista', 'nova', 'novo', 'norte', 'oeste', 'sul', 'leste', 'centro', 'dourado', 'dourada', 'bairro', 'jardim', 'parque', 'vila', 'santa', 'santo', 'sao', 'alto', 'baixo', 'grande', 'industrial', 'real', 'velha', 'velho']);

  // Nome inteiro + apelidos ("Porto" → Porto Dourado). Refeito quando a lista de bairros muda (troca de cidade).
  let cacheBairros = null;
  function nomesDeBairro() {
    const bairros = (GC.data && GC.data.bairros) || [];
    if (cacheBairros && cacheBairros.lista === bairros) return cacheBairros.nomes;
    const contagem = {};
    const palavrasDe = (b) => normalizar(b.nome).split(' ').filter((w) => w.length >= 5 && !NAO_APELIDO.has(w));
    bairros.forEach((b) => new Set(palavrasDe(b)).forEach((w) => { contagem[w] = (contagem[w] || 0) + 1; }));
    const nomes = [];
    bairros.forEach((b) => {
      nomes.push({ id: b.id, termo: normalizar(b.nome) });
      palavrasDe(b).filter((w) => contagem[w] === 1).forEach((w) => nomes.push({ id: b.id, termo: w }));
    });
    nomes.sort((a, b) => b.termo.length - a.termo.length); // "vila nova" antes de "nova"
    cacheBairros = { lista: bairros, nomes };
    return nomes;
  }

  function acharBairros(q) {
    const achados = [];
    let resto = q;
    nomesDeBairro().forEach(({ id, termo }) => {
      const p = posicao(resto, termo);
      if (p < 0) return;
      if (!achados.some((a) => a.id === id)) achados.push({ id, p });
      resto = resto.slice(0, p) + ' '.repeat(termo.length) + resto.slice(p + termo.length); // não casa de novo dentro de outro nome
    });
    return achados.sort((a, b) => a.p - b.p).map((a) => a.id);
  }

  // Secretaria pelo nome da área ("Infraestrutura") ou da secretaria ("Secretaria de Saúde", "Limpeza Urbana").
  function acharSecretarias(q) {
    const areas = (GC.data && GC.data.areas) || [];
    const achadas = [];
    areas.forEach((a) => {
      const termos = [a.nome, a.secretaria && a.secretaria.nome].filter(Boolean).map(normalizar);
      const p = Math.min(...termos.map((t) => posicao(q, t)).filter((x) => x >= 0), Infinity);
      if (p !== Infinity) achadas.push({ id: a.id, p });
    });
    return achadas.sort((a, b) => a.p - b.p).map((a) => a.id);
  }

  // Equipamentos pelos sinônimos da busca rápida (js/busca.js): "creche" → escola, "posto" → leito.
  function acharEquipamentos(palavras) {
    const tipos = GC.TIPOS_BUSCA || {};
    return Object.keys(tipos).filter((tipo) => !['bairro', 'tela', 'secretaria', 'ocorrencia'].includes(tipo)
      && normalizar(tipos[tipo].sinonimos).split(' ').some((s) => s.length >= 4 && palavras.some((w) => w === s || w === `${s}s`)));
  }

  const PERIODOS = [
    [/\b(mes passado|ultimo mes|mes anterior)\b/, () => ({ id: 'mes_passado', rotulo: 'mês passado' })],
    [/\b(semana passada|ultima semana|semana anterior)\b/, () => ({ id: 'semana_passada', rotulo: 'semana passada' })],
    [/\bultimos (\d{1,3}) dias\b/, (m) => ({ id: 'dias', dias: Number(m[1]), rotulo: `últimos ${m[1]} dias` })],
    [/\bontem\b/, () => ({ id: 'ontem', rotulo: 'ontem' })],
    [/\b(hoje|agora|neste momento)\b/, () => ({ id: 'hoje', rotulo: 'hoje' })],
    [/\b(esta|nesta|essa|nessa|da|na) semana\b/, () => ({ id: 'semana', rotulo: 'esta semana' })],
    [/\b(este|neste|esse|nesse|do|no) mes\b/, () => ({ id: 'mes', rotulo: 'este mês' })],
    [/\b(este|neste|do|no) ano\b|\bano passado\b/, (m) => (m[0] === 'ano passado' ? { id: 'ano_passado', rotulo: 'ano passado' } : { id: 'ano', rotulo: 'este ano' })],
  ];
  function acharPeriodo(q) {
    for (const [re, criar] of PERIODOS) {
      const m = re.exec(q);
      if (m) return criar(m);
    }
    return null;
  }

  const DOCUMENTOS = [
    ['oficio', /\boficios?\b/],
    ['comunicado', /\b(comunicados?|aviso a populacao)\b/],
    ['nota', /\bnota (a|para a|pra) imprensa\b|\bnota oficial\b|\bpress release\b/],
    ['resposta', /\bresposta (ao|para o|pro) (cidadao|morador|municipe)\b/],
    ['post', /\b(post|posts|postagem|postagens|legenda)\b|\bredes sociais\b|\binstagram\b|\bfacebook\b/],
  ];
  const ESCREVER = /\b(escrev|redij|redig|rascunh|minut|elabor|prepar|faca um|faz um|monte um|crie um|cria um|gere um|gera um)\w*/;
  // Lote: "todas", "em lote" ou o plural de um grupo ("cobre as críticas", "priorize as atrasadas").
  const LOTE = /\b(todas|todos|em lote|de uma vez)\b|\b(as|os) (criticas|atrasadas|estouradas|vencidas|ocorrencias|alertas)\b/;
  const VERBO_LOTE = [['cobrar', /\bcobr\w*/], ['priorizar', /\bprioriz\w*/]];

  GC.iaEntender = function (texto) {
    const q = normalizar(texto);
    const palavras = q.split(/[^a-z0-9]+/).filter(Boolean);
    const documento = (DOCUMENTOS.find(([, re]) => re.test(q)) || [null])[0];
    const acao = (VERBO_LOTE.find(([, re]) => re.test(q)) || [null])[0];
    // "Quantos comunicados saíram?" não é pedido de rascunho: precisa do verbo, exceto ofício (que já é pedido).
    const escrever = ESCREVER.test(q);
    const rascunho = (documento && (escrever || documento === 'oficio')) || (escrever && /\b(carta|texto|mensagem|rascunho)\b/.test(q));
    const intencao = rascunho ? 'rascunho' : acao && LOTE.test(q) ? 'lote' : null;
    return {
      q,
      palavras,
      bairros: acharBairros(q),
      secretarias: acharSecretarias(q),
      equipamentos: acharEquipamentos(palavras),
      periodo: acharPeriodo(q),
      comparar: /\b(compar\w*|versus|vs|diferenca entre)\b/.test(q),
      // "explique a lotação" não é pedido de causa; "por que", "motivo" e "causa" são.
      porque: /\b(por ?que|porque|por qual motivo|qual o motivo|qual a causa|o que causou)\b/.test(q),
      intencao,
      documento,
      acao,
      // Recorte de ocorrências (ação em lote, ofício): só as críticas e/ou só as de prazo estourado.
      severidade: /\bcritic\w*/.test(q) ? 'critica' : null,
      estourado: /\b(estourad\w*|atrasad\w*|vencid\w*|fora do prazo|prazo estourado)\b/.test(q),
      continuacao: /^e (no|na|nos|nas|o|a|os|as|se|em|do|da|quanto|como|ontem|hoje|agora)\b/.test(q),
    };
  };
  GC.iaEntender.normalizar = normalizar;
  GC.iaEntender.posicao = posicao;
})(window.GC = window.GC || {});
