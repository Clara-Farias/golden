(function (GC) {
  // Cards para as redes (Maia): imagem 1080 × 1080 a partir de modelos fixos. O layout não muda entre gerações;
  // mudam os dados (os mesmos das telas) e a marca (cores de tokens.css, que Personalizar pode trocar, e o logo).
  // Modelos: número em destaque, evolução em 6 meses, aviso à população e entrega à população.
  // Registra-se em js/ia/arquivos.js: "faça um card para as redes sobre a coleta" vira resposta com prévia e PNG.
  if (!GC.arquivosMaia) return;
  const st = () => GC.storeAtual;
  const W = 1080;
  const FONTE = "Inter, 'Segoe UI', Arial, sans-serif";
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  // Pedido de card de entrega que ainda vai acontecer.
  const FUTURA = /vem ai|previst|proxima|vamos entregar|vai entregar|futura/;
  const cidade = () => (GC.cidade ? GC.cidade.nome : 'Vila Dourada');
  const num = (n) => Number(n).toLocaleString('pt-BR');

  // ---- marca: cores da tela (com a personalização aplicada) e o logo próprio, se houver ----
  function marca() {
    const css = typeof document !== 'undefined' && document.documentElement && typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
    const v = (nome, padrao) => { const x = css && css.getPropertyValue(nome).trim(); return /^#[0-9a-f]{6}$/i.test(x || '') ? x : padrao; };
    const primaria = v('--primaria', '#0f4c5c');
    const claroSobre = GC.contraste ? GC.contraste(primaria, '#ffffff') >= 4.5 : true;
    let logo = null;
    try {
      const r = GC.personalizacao ? GC.personalizacao.config().resolver(GC.usuarioAtual ? GC.usuarioAtual() : null) : null;
      logo = r && r.marca && r.marca.logo && /^data:image\//.test(r.marca.logo) ? r.marca.logo : null;
    } catch (e) { logo = null; }
    return {
      primaria,
      escura: v('--primaria-escura', '#0a3a47'),
      destaque: v('--acento', '#f36f21'),
      sobreDestaque: v('--sobre-acento', '#17262b'),
      sobre: claroSobre ? '#ffffff' : '#17262b',
      claro: GC.misturarCor ? GC.misturarCor(primaria, '#ffffff', 0.93) : '#eef3f3',
      logo,
    };
  }

  // Quebra o texto em linhas de até n caracteres (o SVG não quebra sozinho).
  function linhas(texto, n) {
    const out = [];
    String(texto).split(/\s+/).filter(Boolean).forEach((p) => {
      const ult = out[out.length - 1];
      if (ult && `${ult} ${p}`.length <= n) out[out.length - 1] = `${ult} ${p}`; else out.push(p);
    });
    return out;
  }
  function texto(x, y, conteudo, { tam = 40, peso = 600, cor = '#fff', ancora = 'start', n = 40, max = 4, op = 1, entre = 1.18 } = {}) {
    const ls = linhas(conteudo, n);
    const corte = ls.length > max ? [...ls.slice(0, max - 1), `${ls[max - 1]}…`] : ls;
    return `<text x="${x}" y="${y}" font-family="${FONTE}" font-size="${tam}" font-weight="${peso}" fill="${cor}" fill-opacity="${op}" text-anchor="${ancora}">${corte.map((l, i) => `<tspan x="${x}" dy="${i ? Math.round(tam * entre) : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  const altura = (conteudo, n, max, tam, entre = 1.18) => Math.min(max, linhas(conteudo, n).length) * Math.round(tam * entre);
  const iniciais = (nome) => String(nome).split(/\s+/).filter((p) => !/^(d[aeo]s?|e)$/i.test(p)).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  // Moldura comum: fundo, faixa de destaque no topo, logo e "Prefeitura de" em cima, fonte e aviso embaixo.
  // Grafismo do manual (Redes sociais): no fundo escuro, curvas de nível saindo pelo canto de cima e pelo de baixo,
  // longe do número; régua cartográfica sob o cabeçalho. No card claro (gráfico) só a régua: nada atrás de dado.
  const G = () => GC.grafismo;
  function moldura(c, m, miolo, { claro = false } = {}) {
    const tinta = claro ? m.escura : m.sobre;
    // A máscara apaga as curvas antes de chegarem ao texto: ficam só no canto de cima, à direita.
    const curvas = !claro && G()
      ? `<defs><radialGradient id="vd-curvas-g" cx="1" cy="0" r="0.78"><stop offset="0.35" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
          <mask id="vd-curvas"><rect width="${W}" height="${W}" fill="url(#vd-curvas-g)"/></mask></defs>
        <g mask="url(#vd-curvas)">${G().curvas({ w: W, h: W, cor: m.sobre, op: 0.16, esp: 2, niveis: 16, semente: G().semente(c.fonte || cidade()),
          morros: [{ x: W * 1.08, y: -W * 0.06, s: W * 0.42, a: 1.2 }] })}</g>`
      : '';
    const regua = G() ? `<g transform="translate(72 184)" opacity="${claro ? 0.45 : 0.55}">${G().regua(240, 8, 12, tinta)}</g>` : '';
    const fundo = claro
      ? `<rect width="${W}" height="${W}" fill="${m.claro}"/>`
      : `<defs><linearGradient id="vd-fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.escura}"/><stop offset="1" stop-color="${m.primaria}"/></linearGradient></defs>
         <rect width="${W}" height="${W}" fill="url(#vd-fundo)"/>${curvas}`;
    const logo = m.logo
      ? `<image href="${m.logo}" x="72" y="64" width="84" height="84" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="72" y="64" width="84" height="84" rx="20" fill="${m.destaque}"/>${texto(114, 121, iniciais(cidade()), { tam: 34, peso: 800, cor: m.sobreDestaque, ancora: 'middle', n: 4, max: 1 })}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">
      ${fundo}<rect width="${W}" height="10" fill="${m.destaque}"/>${logo}
      ${texto(178, 100, 'Prefeitura de', { tam: 24, peso: 500, cor: tinta, op: 0.75 })}
      ${texto(178, 136, cidade(), { tam: 34, peso: 700, cor: tinta, n: 40, max: 1 })}
      ${regua}
      ${miolo}
      <line x1="72" y1="952" x2="${W - 72}" y2="952" stroke="${tinta}" stroke-opacity="0.2" stroke-width="2"/>
      ${texto(72, 996, `Fonte: ${c.fonte}`, { tam: 22, peso: 500, cor: tinta, op: 0.75, n: 60, max: 1 })}
      ${texto(W - 72, 996, 'Dados de demonstração', { tam: 22, peso: 500, cor: tinta, op: 0.6, ancora: 'end', n: 30, max: 1 })}
    </svg>`;
  }

  // Palavras do pedido que apontam a secretaria (além do nome dela, que o extrator já acha).
  const CHAVES = { saude: 'saude|ubs|hospital|vacina|leito', infraestrutura: 'energia|obra|infra|ilumina', educacao: 'escola|educa|aluno|creche',
    defesa_civil: 'defesa civil|alaga|chuva', seguranca: 'seguranc|crime|policia|guarda', mobilidade: 'transito|onibus|mobilidade|transporte', limpeza: 'coleta|lixo|limpeza' };
  const unidade = (u) => (u === '%' ? '%' : u === 'min' ? ' min' : '');

  // ---- os modelos ----
  const MODELOS = {
    numero: {
      nome: 'Número em destaque',
      // Sem secretaria no pedido: o indicador que mais melhorou (é o que se posta).
      alvo(q, ent, ctx) {
        const dela = ctx.areasPerfil ? ctx.areasPerfil[0] : ent.secretarias[0] || Object.keys(CHAVES).find((a) => new RegExp(CHAVES[a]).test(q));
        if (dela && area(dela)) return dela;
        const bons = st().pulsos().filter((p) => p.positivo);
        return (bons[0] || st().pulsos()[0]).area;
      },
      dados(alvo) {
        const p = st().pulsos().find((x) => x.area === alvo) || st().pulsos()[0];
        const a = area(p.area);
        const desce = String(p.variacao).trim().startsWith('-');
        return {
          secretaria: a.secretaria.nome, chamada: p.rotulo, numero: p.nivel, variacao: `${desce ? '▼' : '▲'} ${String(p.variacao).replace(/^[+-]/, '')} ${p.periodo}`,
          frase: p.positivo ? 'Melhorou em relação ao período anterior.' : 'Piorou em relação ao período anterior. A secretaria acompanha este número de perto.',
          fonte: (GC.data.secretarias[p.area] || {}).fonte || a.secretaria.nome, positivo: p.positivo,
        };
      },
      svg(c, m) {
        return moldura(c, m, `
          ${texto(72, 290, c.secretaria.toUpperCase(), { tam: 26, peso: 700, cor: m.destaque, n: 60, max: 1 })}
          ${texto(72, 366, c.chamada, { tam: 56, peso: 700, cor: m.sobre, n: 26, max: 2 })}
          ${texto(72, 640, c.numero, { tam: 200, peso: 800, cor: m.sobre, n: 14, max: 1 })}
          <rect x="72" y="696" width="${Math.max(280, c.variacao.length * 19 + 80)}" height="70" rx="35" fill="${m.destaque}"/>
          ${texto(112, 743, c.variacao, { tam: 32, peso: 700, cor: m.sobreDestaque, n: 40, max: 1 })}
          ${texto(72, 850, c.frase, { tam: 34, peso: 500, cor: m.sobre, op: 0.9, n: 52, max: 2 })}`);
      },
      texto: (c) => `Card "${c.chamada}" (${c.secretaria}): ${c.numero}, ${c.positivo ? 'melhora' : 'piora'} de ${c.variacao.slice(2)}.${c.positivo ? '' : ' O número piorou; confira se é isso que quer postar.'}`,
    },

    evolucao: {
      nome: 'Evolução em 6 meses',
      alvo: (q, ent, ctx) => MODELOS.numero.alvo(q, ent, ctx),
      dados(alvo) {
        const id = GC.data.secretarias[alvo] ? alvo : GC.data.areas[0].id;
        const s = GC.data.secretarias[id];
        return { secretaria: area(id).secretaria.nome, titulo: s.serie.rotulo, valores: s.serie.meses.slice(6), meses: (GC.data.mesesSerie || []).slice(6), unidade: unidade(s.serie.unidade), meta: s.serie.meta, fonte: s.fonte || area(id).secretaria.nome };
      },
      svg(c, m) {
        const tinta = m.escura;
        const max = Math.max(...c.valores, c.meta || 0) * 1.12 || 1;
        const base = 850; const alt = 400; const larg = 118; const passo = 156; const x0 = 96;
        const barras = c.valores.map((v, i) => {
          const h = (v / max) * alt; const x = x0 + i * passo; const ult = i === c.valores.length - 1;
          return `<rect x="${x}" y="${base - h}" width="${larg}" height="${h}" rx="14" fill="${ult ? m.destaque : GC.misturarCor ? GC.misturarCor(m.primaria, '#ffffff', 0.45) : '#7aa3ad'}"/>
            ${texto(x + larg / 2, base - h - 18, `${num(v)}${c.unidade}`, { tam: 30, peso: 700, cor: tinta, ancora: 'middle', n: 12, max: 1 })}
            ${texto(x + larg / 2, base + 46, c.meses[i] || '', { tam: 28, peso: 600, cor: tinta, ancora: 'middle', op: 0.7, n: 6, max: 1 })}`;
        }).join('');
        const yMeta = c.meta ? base - (c.meta / max) * alt : null;
        return moldura(c, m, `
          ${texto(72, 280, c.secretaria.toUpperCase(), { tam: 26, peso: 700, cor: tinta, op: 0.75, n: 60, max: 1 })}
          ${texto(72, 344, c.titulo, { tam: 54, peso: 700, cor: tinta, n: 30, max: 2 })}
          ${yMeta ? `<line x1="80" x2="${W - 80}" y1="${yMeta}" y2="${yMeta}" stroke="${tinta}" stroke-dasharray="10 10" stroke-width="3" stroke-opacity="0.5"/>
            <line x1="72" x2="120" y1="${344 + altura(c.titulo, 30, 2, 54) + 2}" y2="${344 + altura(c.titulo, 30, 2, 54) + 2}" stroke="${tinta}" stroke-dasharray="10 8" stroke-width="3" stroke-opacity="0.6"/>
            ${texto(134, 344 + altura(c.titulo, 30, 2, 54) + 12, `meta: ${num(c.meta)}${c.unidade}`, { tam: 26, peso: 600, cor: tinta, op: 0.8, n: 30, max: 1 })}` : ''}
          ${barras}`, { claro: true });
      },
      texto: (c) => `Card "${c.titulo}" (${c.secretaria}): de ${num(c.valores[0])}${c.unidade} em ${c.meses[0]} para ${num(c.valores[c.valores.length - 1])}${c.unidade} em ${c.meses[c.meses.length - 1]}${c.meta ? `, meta de ${num(c.meta)}${c.unidade}` : ''}.`,
    },

    aviso: {
      nome: 'Aviso à população',
      // A área de risco do bairro citado; sem bairro, a do alerta preventivo (risco alto ainda não atingida).
      alvo(q, ent) {
        if (!GC.risco) return '';
        const r = GC.risco.resumo(st().ocorrencias());
        const doBairro = ent.bairros.length && r.areas.find((a) => ent.bairros.includes(a.bairroId));
        return (doBairro || r.preventivo || r.areas[0]).id;
      },
      dados(alvo) {
        const r = GC.risco.resumo(st().ocorrencias());
        const a = r.areas.find((x) => x.id === alvo) || r.areas[0];
        const prev = r.previsao.janelas[r.previsao.janelas.length - 1].mm;
        return {
          titulo: a.tipo === 'deslizamento' ? 'Risco de deslizamento' : 'Risco de alagamento', local: a.nome, nivel: a.nivel,
          quando: a.horasAte ? `nas próximas ${a.horasAte} horas` : 'nas próximas 24 horas', chuva: `${num(prev)} mm de chuva previstos em 24 h`,
          orientacao: a.tipo === 'deslizamento'
            ? 'Se notar trincas, portas emperrando ou barulho no barranco, saia de casa e procure um local seguro.'
            : 'Evite ruas alagadas e não deixe objetos na calçada. Desligue a energia se a água entrar em casa.',
          fonte: r.previsao.fonte,
        };
      },
      svg(c, m) {
        const NIVEL = { alto: ['#dc2626', '#ffffff', 'RISCO ALTO'], medio: ['#c2410c', '#ffffff', 'RISCO MÉDIO'], baixo: ['#eab308', '#0b1d22', 'ATENÇÃO'] };
        const [fundo, letra, rotulo] = NIVEL[c.nivel] || NIVEL.baixo;
        return moldura(c, m, `
          <rect x="72" y="226" width="300" height="64" rx="32" fill="${fundo}"/>
          ${texto(222, 270, rotulo, { tam: 28, peso: 800, cor: letra, ancora: 'middle', n: 20, max: 1 })}
          ${texto(72, 394, c.titulo, { tam: 76, peso: 800, cor: m.sobre, n: 22, max: 2 })}
          ${texto(72, 400 + altura(c.titulo, 22, 2, 76) + 20, `${c.local}, ${c.quando}`, { tam: 40, peso: 600, cor: m.destaque, n: 40, max: 2 })}
          ${texto(72, 640, c.chuva, { tam: 32, peso: 500, cor: m.sobre, op: 0.85, n: 50, max: 1 })}
          ${texto(72, 712, c.orientacao, { tam: 32, peso: 500, cor: m.sobre, n: 52, max: 3 })}
          <rect x="72" y="846" width="${W - 144}" height="76" rx="18" fill="${m.destaque}"/>
          ${texto(W / 2, 896, 'Em perigo, ligue 199 (Defesa Civil) ou 193 (Bombeiros)', { tam: 31, peso: 700, cor: m.sobreDestaque, ancora: 'middle', n: 70, max: 1 })}`);
      },
      texto: (c) => `Card de aviso: ${c.titulo.toLowerCase()} em ${c.local}, ${c.quando} (risco ${c.nivel === 'medio' ? 'médio' : c.nivel}). Leva a orientação aos moradores e os telefones 199 e 193.`,
    },

    entrega: {
      nome: 'Entrega à população',
      // A entrega do bairro citado; sem bairro, a mais recente. "Vem aí" / "próxima": a próxima prevista
      // (js/data-entregas.js), só entre as que estão no prazo: o card vai para as redes.
      alvo(q, ent) {
        if (GC.entregas && FUTURA.test(q)) {
          const prox = GC.entregas.lista({ situacao: 'no_prazo' }).filter((e) => e.diasParaEntrega >= 0);
          const doBairroF = ent.bairros.length && prox.find((x) => ent.bairros.includes(x.bairroId));
          if (doBairroF || prox[0]) return (doBairroF || prox[0]).id;
        }
        const lista = (GC.data.conquistas || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
        const doBairro = ent.bairros.length && lista.find((x) => ent.bairros.includes(x.bairroId));
        return ((doBairro || lista[0]) || {}).id || '';
      },
      dados(alvo) {
        const futura = GC.entregas && !(GC.data.conquistas || []).some((x) => x.id === alvo) && GC.entregas.lista().find((e) => e.id === alvo && e.situacao !== 'entregue');
        if (futura) {
          const af = area(futura.area);
          return { selo: 'VEM AÍ', futura: true, titulo: futura.titulo, descricao: futura.descricao || '', bairro: futura.bairroId ? (bairro(futura.bairroId) || {}).nome || '' : 'Toda a cidade',
            data: `prevista para ${GC.entregas.mesAno(futura.dataAtual).replace(` de ${GC.relogio.hoje.slice(0, 4)}`, '')}`, fonte: af ? af.secretaria.nome : 'Prefeitura' };
        }
        const q = (GC.data.conquistas || []).find((x) => x.id === alvo) || GC.data.conquistas[0];
        const a = area(q.area);
        const data = new Date(`${q.data}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
        return { titulo: q.titulo, descricao: q.descricao || '', bairro: (bairro(q.bairroId) || {}).nome || '', data, fonte: a ? a.secretaria.nome : 'Prefeitura' };
      },
      svg(c, m) {
        const fim = 400 + altura(c.titulo, 22, 3, 76);
        const rodape = `${c.bairro} · ${c.data}`;
        return moldura(c, m, `
          ${texto(72, 290, c.selo || 'ENTREGUE', { tam: 30, peso: 800, cor: m.destaque, n: 30, max: 1 })}
          ${texto(72, 400, c.titulo, { tam: 76, peso: 800, cor: m.sobre, n: 22, max: 3 })}
          ${texto(72, fim + 30, c.descricao, { tam: 36, peso: 500, cor: m.sobre, op: 0.9, n: 46, max: 3 })}
          <rect x="72" y="836" width="${Math.max(320, rodape.length * 18 + 80)}" height="70" rx="35" fill="none" stroke="${m.destaque}" stroke-width="3"/>
          ${texto(112, 882, rodape, { tam: 30, peso: 600, cor: m.sobre, n: 50, max: 1 })}`);
      },
      texto: (c) => (c.futura ? `Card da próxima entrega "${c.titulo}" (${c.bairro}, ${c.data}).` : `Card da entrega "${c.titulo}" (${c.bairro}, ${c.data}).`),
    },
  };

  // O mesmo SVG na prévia, no PNG e nos testes.
  GC.cardMaia = function ({ modelo, alvo }) {
    const md = MODELOS[modelo] || MODELOS.numero;
    const campos = md.dados(alvo);
    return { modelo: modelo in MODELOS ? modelo : 'numero', nomeModelo: md.nome, campos, svg: md.svg(campos, marca()) };
  };
  GC.MODELOS_CARD = Object.keys(MODELOS);

  const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const png = (svg) => new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = W;
      cv.getContext('2d').drawImage(img, 0, 0, W, W);
      cv.toBlob((b) => (b ? b.arrayBuffer().then(ok) : erro(new Error('PNG vazio'))), 'image/png');
    };
    img.onerror = () => erro(new Error('O SVG do card não carregou'));
    img.src = svgUrl(svg);
  });

  GC.arquivosMaia.registrar('card', {
    nome: 'Card para redes sociais',
    // A legenda (o texto do post) é rascunho da Maia (js/ia/rascunhos.js, tipo 'post'), não card.
    quando: (q) => !/\blegenda\b/.test(q) && /\b(card|post|postagem|arte|banner)\b|imagem para (as )?redes|para (as )?redes sociais|instagram/.test(q),
    params(q, ent, ctx) {
      const modelo = /chuva|aviso|alerta|alaga|desliza|risco/.test(q) ? 'aviso'
        : /entreg|inaugur|conclu|conquista|vem ai/.test(q) ? 'entrega'
          : /evolu|grafico|meses|historico/.test(q) ? 'evolucao' : 'numero';
      return { modelo, alvo: String(MODELOS[modelo].alvo(q, ent, ctx) || '') };
    },
    montar(p) {
      const g = GC.cardMaia(p);
      return Object.assign(g, { titulo: `Card · ${g.nomeModelo}`, nome: `card-${g.modelo}${p.alvo ? `-${p.alvo}` : ''}` });
    },
    formatos: () => ['png', 'svg'],
    texto: (g) => `${MODELOS[g.modelo].texto(g.campos)} Os dados vêm da base e as cores e o logo, da marca da Prefeitura.`,
    previa: (g) => ({ tipo: 'imagem', svg: g.svg, alt: `${g.titulo}: ${g.campos.titulo || g.campos.chamada || ''}` }),
    async baixar(g, formato, nome) {
      if (formato === 'svg') return GC.baixarArquivo(g.svg, `${nome}.svg`, 'image/svg+xml');
      return GC.baixarArquivo(await png(g.svg), `${nome}.png`, 'image/png');
    },
    // Os outros modelos de card, já no assunto do pedido.
    acoes: (p) => [{ rotulo: 'Escrever a legenda do post', tipo: 'perguntar', payload: { texto: 'Escreva a legenda do post para as redes sociais' } }].concat(Object.keys(MODELOS).filter((k) => k !== p.modelo).map((k) => ({
      rotulo: `Card: ${MODELOS[k].nome.toLowerCase()}`, tipo: 'perguntar',
      payload: { texto: { numero: 'Faça um card para as redes com o número em destaque', evolucao: 'Faça um card para as redes com a evolução em 6 meses', aviso: 'Faça um card para as redes com o aviso de chuva', entrega: 'Faça um card para as redes sobre a última entrega' }[k] },
    }))),
  });
})(window.GC = window.GC || {});
