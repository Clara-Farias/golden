(function (GC) {
  // Plural pelo número (tom-de-voz.md): "1 rota atrasada", "3 rotas atrasadas", nunca "rota(s)".
  const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  const TIPO_CHART = { barra: 'bar', linha: 'line', pizza: 'doughnut' };
  // Cores de série da marca (identidade-visual/dataviz.md): Lagoa, Fundo, Vinho, Terra e o cinza de contexto.
  // Nunca cor de alerta, Chama ou Estrela: o que diz que o gráfico é da Maia é o rodapé, não a cor.
  const PALETA = ['#2b98b0', '#085b87', '#931f5b', '#7a4800', '#b4c2c5'];
  const VIZ_CONTEXTO = '#b4c2c5';
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  function renderGrafico(container, g) {
    if (typeof Chart === 'undefined') {
      const ul = document.createElement('ul');
      ul.className = 'grafico-texto';
      const esc = GC.escaparHtml;
      ul.innerHTML = `<li><strong>${esc(g.titulo)}</strong></li>` + g.rotulos.map((r, i) => `<li>${esc(r)}: ${esc(g.series[0].valores[i])}${g.unidade === '%' ? '%' : ''}</li>`).join('');
      container.appendChild(ul);
      return;
    }
    const box = document.createElement('div');
    box.className = 'grafico';
    const titulo = criar('div', 'grafico-titulo', g.titulo);
    box.appendChild(titulo);
    const area = criar('div', 'grafico-area');
    const canvas = document.createElement('canvas');
    area.appendChild(canvas);
    box.appendChild(area);
    container.appendChild(box);
    // Rosca só com até 3 fatias (dataviz.md); com mais, vira barra deitada.
    if (g.tipo === 'pizza' && g.rotulos.length > 3) g = { ...g, tipo: 'barra' };
    const pizza = g.tipo === 'pizza';
    const multi = g.series.length > 1;
    // Barras sempre deitadas: na gaveta de 420 px o nome fica inteiro à esquerda e o valor na ponta da barra.
    const deitado = g.tipo === 'barra';
    const sufixo = g.unidade === '%' ? '%' : '';
    if (deitado) area.style.height = `${Math.max(120, g.rotulos.length * (multi ? 34 : 26) + (multi ? 34 : 12))}px`;
    else area.style.height = pizza ? '200px' : '170px';
    const corta = (t) => (String(t).length > 22 ? `${String(t).slice(0, 21)}…` : t);
    // Valor escrito na ponta de cada barra (sem plugin externo).
    const valoresNaPonta = {
      id: 'valoresNaPonta',
      afterDatasetsDraw(chart) {
        if (!deitado) return;
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#2c3e43';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((ds, i) => {
          chart.getDatasetMeta(i).data.forEach((barra, j) => {
            ctx.fillText(`${num(ds.data[j])}${sufixo}`, barra.x + 5, barra.y);
          });
        });
        ctx.restore();
      },
    };
    const destaque = (s, i) => {
      if (multi) return PALETA[i] || VIZ_CONTEXTO;
      const max = Math.max(...s.valores);
      return s.valores.map((v) => (v === max ? PALETA[0] : VIZ_CONTEXTO));
    };
    new Chart(canvas, {
      type: TIPO_CHART[g.tipo],
      data: {
        labels: g.rotulos,
        datasets: g.series.map((s, i) => ({
          label: s.nome,
          data: s.valores,
          backgroundColor: pizza ? PALETA : g.tipo === 'linha' ? (multi ? 'transparent' : 'rgba(43, 152, 176, 0.12)') : destaque(s, i),
          borderColor: g.tipo === 'linha' ? PALETA[i] || VIZ_CONTEXTO : undefined,
          borderRadius: deitado ? 4 : 0,
          barThickness: deitado ? (multi ? 11 : 16) : undefined,
          fill: g.tipo === 'linha' && !multi,
          tension: 0.35,
          pointRadius: g.tipo === 'linha' ? 3 : undefined,
        })),
      },
      plugins: [valoresNaPonta],
      options: {
        indexAxis: deitado ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700 },
        layout: { padding: { right: deitado ? 40 : 4 } },
        plugins: {
          legend: { display: pizza || multi, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
          title: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue}${g.unidade === '%' ? '%' : ` ${g.unidade || ''}`}` } },
        },
        scales: pizza ? {} : deitado ? {
          x: { display: false, beginAtZero: true, grace: '8%' },
          y: { ticks: { font: { size: 12 }, color: '#2c3e43', callback(v) { return corta(this.getLabelForValue(v)); } }, grid: { display: false }, border: { display: false } },
        } : {
          x: { ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, grid: { display: false } },
          y: { ticks: { font: { size: 11 }, maxTicksLimit: 4 }, grid: { color: '#e8eeef' }, border: { display: false } },
        },
      },
    });
  }

  const NIVEL = { alta: 'alta', media: 'média', baixa: 'baixa' };
  const criar = (tag, classe, texto) => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };

  const num = (n) => Number(n).toLocaleString('pt-BR');

  // ---- texto da resposta em blocos legíveis (só apresentação: o texto guardado e o do PDF não mudam) ----
  // Quebra de linha vira parágrafo; "Rótulo: a; b; c." vira lista; texto longo separa a primeira frase
  // (a resposta) do resto, em blocos de até duas frases; os números ficam em negrito.
  const RE_NUM = /\d(?:[.,/:]?\d|h(?=\d))*(?:\s?%)?/g;
  // Fim de frase: ponto seguido de maiúscula, menos depois de abreviação ("Av. São José", "Dr. Paulo").
  const RE_FRASE = /(?<=[.!?])(?<!\b(?:Av|R|Rod|Est|Pça|Pç|Al|Tv|Jd|Vl|Dr|Dra|Sr|Sra|Prof|Profa|Gov|Sto|Sta|Ref|ref|Nº|nº|n|N)\.)\s+(?=[A-ZÀ-ÖØ-Þ\p{Extended_Pictographic}])/u;
  function comNumeros(pai, t) {
    let ultimo = 0;
    let m;
    RE_NUM.lastIndex = 0;
    while ((m = RE_NUM.exec(t))) {
      if (m.index > ultimo) pai.appendChild(document.createTextNode(t.slice(ultimo, m.index)));
      pai.appendChild(criar('strong', 'num', m[0]));
      ultimo = m.index + m[0].length;
    }
    if (ultimo < t.length) pai.appendChild(document.createTextNode(t.slice(ultimo)));
    return pai;
  }
  function listaDe(frase) {
    const m = /^([^:;]{2,60}):\s+(.+)$/u.exec(frase);
    if (!m) return null;
    const itens = m[2].replace(/[.;]\s*$/, '').split(/;\s+/).map((x) => x.trim()).filter(Boolean);
    return itens.length >= 2 ? { rotulo: m[1].trim(), itens } : null;
  }
  function blocosDe(par) {
    const frases = par.split(RE_FRASE).filter(Boolean);
    const longo = par.length > 260 && frases.length > 2;
    const blocos = [];
    let atual = [];
    const fechar = () => { if (atual.length) blocos.push({ texto: atual.join(' ') }); atual = []; };
    frases.forEach((f, i) => {
      const lista = listaDe(f);
      if (lista) { fechar(); blocos.push(lista); return; }
      atual.push(f);
      if (longo && (i === 0 || atual.length === 2)) fechar();
    });
    fechar();
    return blocos;
  }
  function formatarTexto(div, t) {
    const corpo = criar('div', 'resp-texto');
    String(t ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((par) => {
      blocosDe(par).forEach((b) => {
        if (!b.itens) return corpo.appendChild(comNumeros(criar('p'), b.texto));
        const box = criar('div', 'resp-lista');
        box.appendChild(criar('b', null, b.rotulo));
        const ul = criar('ul');
        b.itens.forEach((it) => ul.appendChild(comNumeros(criar('li'), it)));
        box.appendChild(ul);
        corpo.appendChild(box);
      });
    });
    div.appendChild(corpo);
  }
  GC.blocosRespostaMaia = (t) => String(t ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean).flatMap(blocosDe);

  const semEmoji = (t) => String(t ?? '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s{2,}/g, ' ').trim();

  // Resposta da Maia em PDF (jsPDF por CDN): pergunta, resposta, gráfico, base consultada, fontes e consulta.
  GC.exportarRespostaPdf = function ({ pergunta, resposta, canvas }) {
    if (!window.jspdf || !window.jspdf.jsPDF) return false;
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margem = 40;
    const largura = doc.internal.pageSize.getWidth() - margem * 2;
    const alturaPag = doc.internal.pageSize.getHeight();
    let y = margem;
    const bloco = (texto, { tam = 10, negrito = false, cor = 30, depois = 6, fonte = 'helvetica' } = {}) => {
      const linhas = doc.splitTextToSize(semEmoji(texto), largura);
      doc.setFont(fonte, negrito ? 'bold' : 'normal').setFontSize(tam).setTextColor(...(Array.isArray(cor) ? cor : [cor]));
      linhas.forEach((l) => { if (y > alturaPag - margem) { doc.addPage(); y = margem; } doc.text(l, margem, y); y += tam * 1.3; });
      y += depois;
    };
    bloco(`Prefeitura Municipal de ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} · Maia`, { tam: 10, negrito: true, cor: [15, 76, 92], depois: 0 });
    bloco('Dados simulados para demonstração', { tam: 8, cor: 120, depois: 14 });
    if (pergunta) bloco(pergunta, { tam: 15, negrito: true, cor: 20, depois: 8 });
    bloco(resposta.texto, { tam: 10.5 });
    if (canvas) {
      try {
        const img = canvas.toDataURL('image/png');
        const h = Math.min(220, (canvas.height / canvas.width) * largura);
        if (y + h > alturaPag - margem) { doc.addPage(); y = margem; }
        doc.addImage(img, 'PNG', margem, y, largura, h);
        y += h + 12;
      } catch (e) { /* gráfico fica de fora */ }
    }
    const b = resposta.base;
    if (b || resposta.fontes) {
      bloco('Base consultada', { tam: 11, negrito: true, cor: [15, 76, 92], depois: 2 });
      if (b) bloco(`${plural(resposta.fontes ? resposta.fontes.length : 0, 'tabela', 'tabelas')} · ${num(b.registros)} registros · período: ${b.periodo} · referência: ${b.referencia}`, { tam: 9.5, cor: 60, depois: 2 });
      if (resposta.fontes) bloco(`Tabelas: ${resposta.fontes.join(', ')}`, { tam: 9.5, cor: 60, depois: 2 });
      if (resposta.confiabilidade) bloco(`Confiabilidade ${NIVEL[resposta.confiabilidade.nivel]}${resposta.confiabilidade.motivo ? ` · ${resposta.confiabilidade.motivo}` : ''}`, { tam: 9.5, cor: 60 });
    }
    if (resposta.consulta) {
      bloco('Consulta executada', { tam: 11, negrito: true, cor: [15, 76, 92], depois: 2 });
      bloco(resposta.consulta, { tam: 8.5, cor: 50, fonte: 'courier' });
    }
    doc.save(`copiloto-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`);
    return true;
  };

  // Rascunho da Maia em PDF: cabeçalho da Prefeitura, título, texto (com as quebras de linha) e a versão SMS.
  GC.exportarDocumentoPdf = function ({ titulo, texto: corpo, sms }) {
    if (!window.jspdf || !window.jspdf.jsPDF) return false;
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margem = 56;
    const largura = doc.internal.pageSize.getWidth() - margem * 2;
    const alturaPag = doc.internal.pageSize.getHeight();
    let y = margem;
    const bloco = (t, { tam = 11, negrito = false, cor = 30, depois = 6 } = {}) => {
      const linhas = doc.splitTextToSize(semEmoji(t), largura);
      doc.setFont('helvetica', negrito ? 'bold' : 'normal').setFontSize(tam).setTextColor(...(Array.isArray(cor) ? cor : [cor]));
      linhas.forEach((l) => { if (y > alturaPag - margem) { doc.addPage(); y = margem; } doc.text(l, margem, y); y += tam * 1.4; });
      y += depois;
    };
    bloco(`Prefeitura Municipal de ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} · rascunho da Maia`, { tam: 9, negrito: true, cor: [15, 76, 92], depois: 0 });
    bloco('Revise antes de enviar. Dados simulados para demonstração.', { tam: 8, cor: 120, depois: 16 });
    bloco(titulo, { tam: 14, negrito: true, cor: 20, depois: 10 });
    bloco(corpo, { tam: 11 });
    if (sms) { bloco('Versão SMS', { tam: 10, negrito: true, cor: [15, 76, 92], depois: 2 }); bloco(sms, { tam: 10, cor: 60 }); }
    doc.save(`rascunho-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`);
    return true;
  };

  // Selos de confiança (manual, Interface · Maia · Selos): mesma forma sempre, para quem lê saber quanto confiar.
  const SELOS = {
    previsao: ['Previsão', '<circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 1A4 4 0 0 1 5 9Z" fill="currentColor"/>'],
    analise: ['Análise da Maia', '<path d="M5 .6L9.4 5L5 9.4L.6 5Z" fill="none" stroke="currentColor" stroke-width="1.4"/>'],
    semdado: ['Sem dado', '<circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6"/>'],
  };
  GC.htmlSeloMaia = (tipo) => (SELOS[tipo] ? `<span class="selo-maia selo-${tipo}"><svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">${SELOS[tipo][1]}</svg>${SELOS[tipo][0]}</span>` : '');

  // Nome de gente para a fonte: o prefixo da tabela diz de onde veio (secretaria ou órgão de fora).
  const ORGAO = { inmet: 'Inmet', concessionaria: 'Concessionária de energia', concessao: 'Concessionária do transporte', samu: 'SAMU', ouvidoria: 'Ouvidoria', gabinete: 'Gabinete', planejamento: 'Planejamento', assistencia: 'Assistência Social', financas: 'Finanças', gestao: 'Gabinete' };
  function nomeFonte(f) {
    const pre = String(f).split('.')[0];
    if (ORGAO[pre]) return ORGAO[pre];
    const a = GC.data && GC.data.areas.find((x) => x.id === pre);
    return a ? a.secretaria.nome : pre;
  }
  // "hoje, 9h40", "ontem, 18h" ou a data: a hora do dado, não a da pergunta.
  function horaDoDado(min) {
    const agora = new Date(GC.agora ? GC.agora() : Date.now());
    const d = new Date(agora.getTime() - (min || 0) * 60000);
    const h = d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}h`;
    const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dif = Math.round((dia(agora) - dia(d)) / 86400000);
    return `${dif === 0 ? 'hoje' : dif === 1 ? 'ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${h}`;
  }

  // Rodapé de fonte (manual, Interface · Maia · Fonte): "fonte · hora do dado · Ver dados", numa linha.
  // Dado com mais de 24 h em negrito. Aberto: base consultada, fontes (as da tela Dados abrem a tabela) e a consulta.
  function renderFontes(container, r, extra = {}) {
    if (!r.fontes && !r.confiabilidade && !r.consulta && !r.base) return;
    const box = criar('details', 'fontes');
    const c = r.confiabilidade;
    const orgaos = [...new Set((r.fontes || []).map(nomeFonte).filter((x) => x !== 'Planejamento'))];
    const sum = criar('summary', c ? `conf conf-${c.nivel}` : null);
    sum.appendChild(criar('span', 'fontes-org', orgaos.length ? orgaos.slice(0, 2).join(', ') + (orgaos.length > 2 ? ` e mais ${orgaos.length - 2}` : '') : 'Dados da Prefeitura'));
    if (c && c.atualizadoHaMin !== undefined) {
      const velho = c.atualizadoHaMin > 24 * 60;
      sum.appendChild(criar(velho ? 'b' : 'span', 'fontes-hora', `dados de ${horaDoDado(c.atualizadoHaMin)}`));
    }
    sum.appendChild(criar('span', 'fontes-ver', 'Ver dados'));
    sum.title = c ? `Confiabilidade ${NIVEL[c.nivel]}${c.motivo ? ` · ${c.motivo}` : ''}` : 'De onde veio esta resposta';
    box.appendChild(sum);
    if (r.base) {
      const b = r.base;
      const n = r.fontes ? r.fontes.length : 0;
      const linha = criar('div', 'fontes-base');
      linha.appendChild(criar('b', null, '🗄 Base consultada: '));
      linha.appendChild(criar('span', null, `${n} ${n === 1 ? 'tabela' : 'tabelas'} · ${num(b.registros)} ${b.registros === 1 ? 'registro' : 'registros'} · ${b.periodo} · ref. ${b.referencia}`));
      box.appendChild(linha);
    }
    if (r.fontes) {
      const linha = criar('div', 'fontes-lista');
      linha.appendChild(criar('b', null, '📚 Fontes: '));
      r.fontes.forEach((f) => {
        if (extra.tabelaExiste && extra.tabelaExiste(f)) {
          const b = criar('button', 'chip-fonte link', f);
          b.type = 'button';
          b.title = 'Abrir esta tabela na tela Dados';
          b.onclick = () => extra.aoAbrirTabela(f);
          linha.appendChild(b);
        } else {
          const s = criar('span', 'chip-fonte', f);
          s.title = 'Tabela do sistema da secretaria';
          linha.appendChild(s);
        }
      });
      box.appendChild(linha);
    }
    if (r.consulta) {
      const det = criar('details', 'consulta');
      det.appendChild(criar('summary', null, 'Ver consulta'));
      det.appendChild(criar('pre', null, r.consulta));
      box.appendChild(det);
    }
    container.appendChild(box);
  }

  // Botão da barra no pé da resposta (Copiar, PDF, Fixar): ícone + rótulo curto, discreto.
  function botaoBarra(icone, rotulo, titulo) {
    const b = criar('button', 'msg-barra-btn');
    b.type = 'button';
    b.title = titulo || rotulo;
    b.innerHTML = `<i class="ti ti-${icone}" aria-hidden="true"></i><span></span>`;
    b.querySelector('span').textContent = rotulo;
    return b;
  }
  const trocarBotao = (b, icone, rotulo) => {
    b.querySelector('.ti').className = `ti ti-${icone}`;
    b.querySelector('span').textContent = rotulo;
  };

  // Ações da resposta: consultar (contorno), escolher (pergunta de volta) e fazer (cheio: muda dados).
  // Fazer e escolher valem uma vez: depois o grupo fica marcado e desabilitado (também na conversa reaberta).
  const MUDA = new Set(['agir', 'agirLote', 'criarAlerta']);
  const tipoBotao = (a) => (MUDA.has(a.tipo) ? 'fazer' : a.tipo === 'perguntar' && a.payload && a.payload.tema ? 'escolha' : 'ver');
  // "Ver" é navegação: linha com ícone do destino, rótulo numa linha só (inteiro no title) e seta.
  const ICONE_VER = { mostrarMapa: 'map', abrirCamada: 'map-pin', focarOcorrencia: 'alert-triangle', abrirTela: 'arrow-up-right', perguntar: 'message-circle' };
  const ICONE_FAZER = { criarAlerta: 'bell', agir: 'bolt', agirLote: 'checks' };

  GC.criarChat = function (el, opcoes) {
    const { aoPerguntar, aoAcao, aoRecolher, tabelaExiste, aoAbrirTabela, aoFixarWidget, aoVerWidget, conversas } = opcoes;
    let ultimaPergunta = null; // a pergunta do prefeito que a próxima resposta da IA responde (vai no PDF)
    let fila = Promise.resolve();
    let recolhido = false;
    let naoLidas = 0;
    let aba = 'conversa'; // aba aberta na Maia: 'conversa' (pergunta e resposta) ou 'avisos'

    // Estados da Maia no botão do topo (manual, "Dois desenhos, sete estados"): disponível, pensando,
    // novidade (selo Egeu, sem número), alerta (selo na cor da severidade, com contagem) e fora do ar.
    let alertasNaoLidos = 0;
    function estadoMaia(estado) {
      if (!el.botaoMaia) return;
      el.botaoMaia.classList.toggle('maia-pensando-estado', estado === 'pensando');
    }
    function contarNaoLida(ehAlerta) {
      if (!recolhido || !el.naoLidas) return;
      naoLidas++;
      if (ehAlerta) alertasNaoLidos++;
      el.naoLidas.classList.toggle('maia-alerta', alertasNaoLidos > 0);
      el.naoLidas.classList.toggle('maia-novidade', alertasNaoLidos === 0);
      el.naoLidas.textContent = alertasNaoLidos ? String(alertasNaoLidos) : '';
      el.naoLidas.setAttribute('aria-label', alertasNaoLidos ? `${alertasNaoLidos} ${alertasNaoLidos === 1 ? 'alerta novo' : 'alertas novos'} da Maia` : 'Novidade da Maia');
      el.naoLidas.hidden = false;
    }
    // Fora do ar: cinza e parada; o resto do painel continua.
    const marcarConexao = () => { if (el.botaoMaia) el.botaoMaia.classList.toggle('maia-fora', navigator.onLine === false); };
    window.addEventListener('online', marcarConexao);
    window.addEventListener('offline', marcarConexao);
    marcarConexao();

    function recolher(valor) {
      recolhido = valor;
      el.app.classList.toggle('chat-recolhido', recolhido);
      if (el.btnRecolher) {
        el.btnRecolher.title = recolhido ? 'Abrir a conversa com a Maia' : 'Recolher a conversa com a Maia';
        el.btnRecolher.setAttribute('aria-label', el.btnRecolher.title);
      }
      if (!recolhido) {
        const temAlerta = alertasNaoLidos > 0;
        naoLidas = 0;
        alertasNaoLidos = 0;
        mostrarAba(temAlerta ? 'avisos' : aba);
        el.naoLidas.hidden = true;
        setTimeout(() => { el.mensagens.scrollTop = el.mensagens.scrollHeight; }, 50);
        // Os atalhos seguem a tela aberta (gabinete, relatório…): redesenha ao abrir a Maia.
        desenharAtalhos();
        setTimeout(marcarBordas, 320);
        // Gráfico criado com a gaveta fechada (ou abrindo) nasce minúsculo: redimensiona quando ela assenta.
        setTimeout(redimensionarGraficos, 320);
      }
      if (aoRecolher) aoRecolher(recolhido);
    }

    if (el.btnRecolher) el.btnRecolher.addEventListener('click', () => recolher(!recolhido));
    if (el.aba) el.aba.addEventListener('click', () => recolher(false));
    // Começa recolhido a cada carregamento: o mapa é o foco; as mensagens aparecem no contador da aba.
    recolher(true);

    // Rolagem: só desce sozinha se a pessoa já estava no fim. Lendo mais acima, aparece "Mensagens novas ↓".
    const noFim = () => el.mensagens.scrollHeight - el.mensagens.scrollTop - el.mensagens.clientHeight < 80;
    let pilula = null;
    function esconderNovas() { if (pilula) pilula.hidden = true; }
    function avisarNovas() {
      // Com a gaveta fechada não há o que medir: ao abrir, a conversa já desce até o fim.
      if (recolhido || !el.mensagens.clientHeight) return;
      if (!pilula) {
        pilula = criar('button', 'chat-novas');
        pilula.type = 'button';
        pilula.innerHTML = '<i class="ti ti-arrow-down" aria-hidden="true"></i> Mensagens novas';
        pilula.onclick = () => { el.mensagens.scrollTo({ top: el.mensagens.scrollHeight, behavior: 'smooth' }); esconderNovas(); };
        el.mensagens.parentNode.appendChild(pilula);
      }
      const caixa = el.mensagens.getBoundingClientRect();
      const chat = el.mensagens.parentNode.getBoundingClientRect();
      pilula.style.bottom = `${Math.max(8, chat.bottom - caixa.bottom + 10)}px`;
      pilula.hidden = false;
    }
    el.mensagens.addEventListener('scroll', () => { if (noFim()) esconderNovas(); });
    const rolar = () => { el.mensagens.scrollTop = el.mensagens.scrollHeight; esconderNovas(); };

    // Enquanto a Maia responde uma pergunta: o campo continua aberto para escrever a próxima,
    // mas enviar, os atalhos e o catálogo esperam (nada entra na fila sem a pessoa ver).
    let respondendo = 0;
    const placeholderOriginal = el.input.placeholder;
    const btnEnviar = el.form.querySelector('button[type="submit"]');
    function marcarOcupado(delta) {
      respondendo = Math.max(0, respondendo + delta);
      const ocupado = respondendo > 0;
      if (btnEnviar) { btnEnviar.disabled = ocupado; btnEnviar.setAttribute('aria-label', ocupado ? 'Aguarde a resposta da Maia' : 'Enviar'); }
      el.input.placeholder = ocupado ? 'A Maia está respondendo…' : placeholderOriginal;
      el.form.classList.toggle('ocupado', ocupado);
      el.sugestoes.classList.toggle('ocupado', ocupado);
    }
    function redimensionarGraficos() {
      if (typeof Chart === 'undefined') return;
      el.mensagens.querySelectorAll('.grafico-area canvas').forEach((c) => {
        const g = Chart.getChart(c);
        if (g) g.resize();
      });
    }
    // Rola só o necessário para o topo de `alvo` ficar visível (se tudo couber, vai até o fim).
    function mostrarDoInicio(alvo) {
      const caixa = el.mensagens;
      const topo = alvo.getBoundingClientRect().top - caixa.getBoundingClientRect().top + caixa.scrollTop - 8;
      caixa.scrollTop = Math.min(topo, caixa.scrollHeight - caixa.clientHeight);
    }
    const enfileirar = (fn) => (fila = fila.then(fn).catch((e) => console.error(e)));

    // `forcar`: a pessoa acabou de perguntar (ou é a resposta dela), então a conversa desce mesmo se ela tinha rolado.
    function balao(classe, autor, forcar) {
      // O início da conversa nova (com as anteriores) sai com a primeira pergunta.
      const inicio = classe === 'prefeito' && !redesenhando ? el.mensagens.querySelector('.chat-inicio') : null;
      if (inicio) inicio.remove();
      const estavaNoFim = forcar || redesenhando || noFim();
      const div = document.createElement('div');
      div.className = `msg ${classe}`;
      if (autor) {
        const a = document.createElement('div');
        a.className = 'autor';
        if (classe === 'ia') a.innerHTML = '<span class="maia-rosto" aria-hidden="true"></span> Maia';
        else a.textContent = autor;
        div.appendChild(a);
      }
      el.mensagens.appendChild(div);
      if (estavaNoFim) rolar();
      else avisarNovas();
      return div;
    }

    function texto(div, t) {
      const p = document.createElement('div');
      p.textContent = t;
      div.appendChild(p);
    }

    // Conversas guardadas (js/conversas.js): cada mensagem desenhada entra na conversa atual. Sem o módulo
    // (cidadão, testes), o chat funciona como antes, sem guardar nada.
    const registrar = (m) => { if (conversas && !redesenhando) conversas.registrar(m); };
    let redesenhando = false;

    // Rascunho da Maia (fase 4): texto editável, SMS com contador, Copiar e PDF. A edição fica guardada na conversa.
    function renderDocumento(msg, doc) {
      const box = criar('div', 'doc-maia');
      box.appendChild(criar('div', 'doc-titulo', doc.titulo));
      const campo = document.createElement('textarea');
      campo.className = 'doc-texto';
      campo.value = doc.texto;
      campo.rows = Math.min(16, Math.max(5, doc.texto.split('\n').length + 1));
      campo.setAttribute('aria-label', `Texto do rascunho: ${doc.titulo}`);
      campo.addEventListener('change', () => { doc.texto = campo.value; if (conversas) conversas.salvar(); });
      box.appendChild(campo);
      let sms = null;
      if (doc.sms !== undefined) {
        const rot = criar('label', 'doc-sms-rotulo');
        const cont = criar('span', 'doc-sms-cont');
        sms = document.createElement('textarea');
        sms.className = 'doc-sms';
        sms.maxLength = 160;
        sms.rows = 3;
        sms.value = doc.sms;
        const contar = () => { cont.textContent = `${sms.value.length}/160`; };
        contar();
        sms.addEventListener('input', contar);
        sms.addEventListener('change', () => { doc.sms = sms.value; if (conversas) conversas.salvar(); });
        rot.append('Versão SMS (sem acento, até 160 caracteres) ', cont, sms);
        box.appendChild(rot);
      }
      // Post para redes (js/ia/rascunhos.js): versão curta para X e status do WhatsApp, até 280 caracteres.
      let curto = null;
      if (doc.curto !== undefined) {
        const rot = criar('label', 'doc-sms-rotulo');
        const cont = criar('span', 'doc-sms-cont');
        curto = document.createElement('textarea');
        curto.className = 'doc-sms';
        curto.maxLength = 280;
        curto.rows = 3;
        curto.value = doc.curto;
        const contar = () => { cont.textContent = `${curto.value.length}/280`; };
        contar();
        curto.addEventListener('input', contar);
        curto.addEventListener('change', () => { doc.curto = curto.value; if (conversas) conversas.salvar(); });
        rot.append('Versão curta (X e status do WhatsApp, até 280 caracteres) ', cont, curto);
        box.appendChild(rot);
      }
      const barra = criar('div', 'doc-acoes');
      const copiar = criar('button', 'doc-btn');
      copiar.type = 'button';
      copiar.innerHTML = '<i class="ti ti-copy" aria-hidden="true"></i> Copiar texto';
      copiar.onclick = async () => {
        const t = campo.value + (sms ? `\n\nSMS: ${sms.value}` : '') + (curto ? `\n\nVersão curta: ${curto.value}` : '');
        try { await navigator.clipboard.writeText(t); } catch (e) { campo.select(); document.execCommand && document.execCommand('copy'); }
        copiar.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Copiado';
        setTimeout(() => { copiar.innerHTML = '<i class="ti ti-copy" aria-hidden="true"></i> Copiar texto'; }, 1800);
      };
      barra.appendChild(copiar);
      if (window.jspdf && window.jspdf.jsPDF) {
        const pdf = criar('button', 'doc-btn');
        pdf.type = 'button';
        pdf.innerHTML = '<i class="ti ti-file-download" aria-hidden="true"></i> Baixar PDF';
        pdf.onclick = () => GC.exportarDocumentoPdf({ titulo: doc.titulo, texto: campo.value, sms: sms ? sms.value : null });
        barra.appendChild(pdf);
      }
      box.appendChild(barra);
      msg.appendChild(box);
    }

    // Arquivo da Maia (js/ia/arquivos.js): cartão com o título e um botão por formato. O arquivo é montado no clique,
    // com os dados daquele momento (a conversa reaberta amanhã baixa os números de amanhã, e o cartão diz isso).
    const ICONE_FORMATO = { pdf: 'file-type-pdf', doc: 'file-type-doc', xlsx: 'file-spreadsheet', csv: 'file-type-csv', png: 'photo', svg: 'vector', txt: 'headphones' };
    function renderArquivo(msg, arquivo) {
      const box = criar('div', 'arq-maia');
      box.innerHTML = `<span class="arq-ic" aria-hidden="true"><i class="ti ti-${ICONE_FORMATO[arquivo.formatos[0]] || 'file'}"></i></span>
        <div class="arq-txt"><b></b><small>Os números são os do momento do download.</small></div><div class="arq-acoes"></div>`;
      box.querySelector('b').textContent = arquivo.titulo;
      const barra = box.querySelector('.arq-acoes');
      let previa = null;
      try { previa = GC.previaArquivoMaia ? GC.previaArquivoMaia(arquivo) : null; } catch (e) { console.error(e); }
      if (previa && previa.tipo === 'imagem') {
        const img = document.createElement('img');
        img.className = 'arq-previa';
        img.alt = previa.alt || arquivo.titulo;
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previa.svg)}`;
        box.insertBefore(img, barra);
      }
      if (previa && previa.tipo === 'audio') box.insertBefore(playerAudio(previa.texto), barra);
      arquivo.formatos.forEach((f, i) => {
        const b = criar('button', `doc-btn${i ? '' : ' principal'}`);
        b.type = 'button';
        const rotulo = `Baixar ${(GC.formatosArquivoMaia || {})[f] || f.toUpperCase()}`;
        b.innerHTML = `<i class="ti ti-download" aria-hidden="true"></i> ${rotulo}`;
        // PDF depende do jsPDF (CDN): sem ele, o botão fica desabilitado com o motivo.
        if (f === 'pdf' && !(window.jspdf && window.jspdf.jsPDF)) { b.disabled = true; b.title = 'PDF indisponível sem internet'; }
        b.onclick = async () => {
          b.disabled = true;
          try { await GC.baixarArquivoMaia(arquivo, f); } catch (e) { console.error(e); b.title = 'Não consegui gerar o arquivo agora.'; }
          b.disabled = false;
        };
        barra.appendChild(b);
      });
      msg.appendChild(box);
    }

    // Player do resumo em áudio: a voz do aparelho (speechSynthesis), em português. Um player toca por vez.
    function playerAudio(roteiro) {
      const box = criar('div', 'arq-audio');
      const fala = typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
      const botao = (icone, rotulo) => { const b = criar('button', 'doc-btn'); b.type = 'button'; b.innerHTML = `<i class="ti ti-${icone}" aria-hidden="true"></i> ${rotulo}`; return b; };
      const ouvir = botao('player-play', 'Ouvir');
      const parar = botao('player-stop', 'Parar');
      parar.hidden = true;
      const estado = criar('span', 'arq-audio-estado');
      estado.setAttribute('aria-live', 'polite');
      const roteiroBox = criar('details', 'arq-roteiro');
      roteiroBox.appendChild(criar('summary', null, 'Ler o roteiro'));
      roteiroBox.appendChild(criar('p', null, roteiro));
      const marcar = (tocando, pausado) => {
        ouvir.innerHTML = `<i class="ti ti-${tocando && !pausado ? 'player-pause' : 'player-play'}" aria-hidden="true"></i> ${tocando && !pausado ? 'Pausar' : pausado ? 'Continuar' : 'Ouvir'}`;
        parar.hidden = !tocando;
        estado.textContent = tocando ? (pausado ? 'Pausado' : 'Tocando…') : '';
      };
      if (!fala) {
        ouvir.disabled = true;
        ouvir.title = 'Este navegador não tem voz; leia o roteiro abaixo';
      } else {
        let tocando = false;
        ouvir.onclick = () => {
          if (tocando && !fala.paused) { fala.pause(); return marcar(true, true); }
          if (tocando && fala.paused) { fala.resume(); return marcar(true, false); }
          fala.cancel();
          const u = new SpeechSynthesisUtterance(roteiro);
          u.lang = 'pt-BR';
          const voz = fala.getVoices().find((v) => /^pt(-|_)BR/i.test(v.lang)) || fala.getVoices().find((v) => /^pt/i.test(v.lang));
          if (voz) u.voice = voz;
          u.rate = 1.02;
          u.onend = () => { tocando = false; marcar(false); };
          u.onerror = () => { tocando = false; marcar(false); };
          tocando = true;
          marcar(true, false);
          fala.speak(u);
        };
        parar.onclick = () => { fala.cancel(); tocando = false; marcar(false); };
      }
      const linha = criar('div', 'arq-audio-botoes');
      linha.append(ouvir, parar, estado);
      box.append(linha, roteiroBox);
      return box;
    }

    // Corpo da resposta da Maia (selo, texto, gráfico, ações e fontes): igual na hora e ao reabrir a conversa.
    function desenharResposta(msg, resposta, pergunta, { aviso = false } = {}) {
      // Selo de confiança antes do texto; sem dado, o rosto fica tracejado.
      if (resposta.selo === 'semdado') msg.classList.add('maia-sem-dado');
      if (GC.htmlSeloMaia && resposta.selo) msg.insertAdjacentHTML('beforeend', GC.htmlSeloMaia(resposta.selo));
      formatarTexto(msg, resposta.texto);
      if (resposta.documento) renderDocumento(msg, resposta.documento);
      if (resposta.arquivo) renderArquivo(msg, resposta.arquivo);
      if (resposta.grafico) renderGrafico(msg, resposta.grafico);
      desenharAcoes(msg, resposta);
      renderFontes(msg, resposta, { tabelaExiste, aoAbrirTabela });
      if (!aviso) desenharBarra(msg, resposta, pergunta);
    }

    function desenharAcoes(msg, resposta) {
      const lista = resposta.acoes || [];
      if (!lista.length) return;
      const box = criar('div', 'acoes');
      const botoes = lista.map((acao, i) => {
        const tipo = tipoBotao(acao);
        const b = criar('button', `acao-${tipo}`);
        b.type = 'button';
        const icone = tipo === 'ver' ? ICONE_VER[acao.tipo] || 'arrow-right' : tipo === 'fazer' ? ICONE_FAZER[acao.tipo] : null;
        // Rótulo que já começa com emoji ganha o ícone dele (js/icones.js): não repete.
        if (icone && !/^\s*\p{Extended_Pictographic}/u.test(acao.rotulo)) b.insertAdjacentHTML('beforeend', `<i class="ti ti-${icone}" aria-hidden="true"></i>`);
        b.appendChild(criar('span', 'acao-rot', acao.rotulo));
        if (tipo === 'ver') {
          b.title = acao.rotulo;
          b.insertAdjacentHTML('beforeend', '<i class="ti ti-chevron-right acao-seta" aria-hidden="true"></i>');
        }
        box.appendChild(b);
        return { b, acao, tipo, i };
      });
      // Em lote o botão é a confirmação: "Cancelar" ao lado deixa claro que nada acontece sem o clique.
      const cancelar = lista.some((a) => a.tipo === 'agirLote') ? criar('button', 'acao-cancelar', 'Cancelar') : null;
      if (cancelar) { cancelar.type = 'button'; box.appendChild(cancelar); }
      const situacao = criar('span', 'acoes-situacao');
      situacao.setAttribute('role', 'status');
      box.appendChild(situacao);
      const guardar = (mud) => {
        resposta.estadoAcoes = Object.assign({}, resposta.estadoAcoes, mud);
        if (conversas && conversas.salvar) conversas.salvar();
      };
      const aplicar = () => {
        const e = resposta.estadoAcoes || {};
        botoes.forEach(({ b, tipo, i }) => {
          const fechado = (tipo === 'fazer' && (e.feita !== undefined || e.cancelada)) || (tipo === 'escolha' && e.escolhida !== undefined);
          const marcado = (tipo === 'fazer' && e.feita === i) || (tipo === 'escolha' && e.escolhida === i);
          b.disabled = fechado;
          b.classList.toggle('feito', marcado);
          if (marcado && !b.querySelector('.ti-check')) b.insertAdjacentHTML('afterbegin', '<i class="ti ti-check" aria-hidden="true"></i>');
        });
        if (cancelar) cancelar.hidden = e.feita !== undefined || !!e.cancelada;
        situacao.textContent = e.feita !== undefined ? 'Feito.' : e.cancelada ? 'Cancelado: nada foi feito.' : '';
      };
      botoes.forEach(({ b, acao, tipo, i }) => {
        b.onclick = () => {
          if (b.disabled) return;
          if (tipo === 'fazer') guardar({ feita: i });
          else if (tipo === 'escolha') guardar({ escolhida: i });
          aplicar();
          aoAcao(acao);
        };
      });
      if (cancelar) cancelar.onclick = () => { guardar({ cancelada: true }); aplicar(); };
      aplicar();
      msg.appendChild(box);
    }

    // Barra no pé da resposta: Copiar, PDF (o rascunho e o arquivo têm o próprio download) e Fixar como widget.
    function desenharBarra(msg, resposta, pergunta) {
      const barra = criar('div', 'msg-barra');
      if (resposta.texto && !resposta.documento) {
        const b = botaoBarra('copy', 'Copiar', 'Copiar o texto da resposta');
        b.onclick = async () => {
          const t = semEmoji(resposta.texto);
          try { await navigator.clipboard.writeText(t); } catch (e) { /* sem área de transferência */ }
          trocarBotao(b, 'check', 'Copiado');
          b.classList.add('feito');
          setTimeout(() => { trocarBotao(b, 'copy', 'Copiar'); b.classList.remove('feito'); }, 1800);
        };
        barra.appendChild(b);
      }
      if ((resposta.fontes || resposta.grafico) && !resposta.documento && !resposta.arquivo && window.jspdf && window.jspdf.jsPDF) {
        const b = botaoBarra('file-download', 'PDF', 'Exportar a resposta em PDF');
        b.onclick = () => GC.exportarRespostaPdf({ pergunta, resposta, canvas: msg.querySelector('canvas') });
        barra.appendChild(b);
      }
      // Gráfico da resposta vira widget do dashboard ("Indicadores").
      if (resposta.grafico && pergunta && aoFixarWidget) barra.appendChild(botaoFixar(pergunta, resposta));
      if (barra.childElementCount) msg.appendChild(barra);
    }

    // Aceita a Resposta ou uma Promise dela; "digitando" fica até as duas coisas chegarem.
    // `aviso`: o que chega sozinho (alerta novo, escalonamento, regra pausada) vai para a aba Atividade.
    // true ou { rotulo } (ver avisoIa; alerta novo não entra).
    function ia(respostaOuPromessa, { atrasoMs = 900, aviso = false } = {}) {
      if (aviso) return avisoIa(respostaOuPromessa, aviso === true ? {} : aviso);
      const pergunta = ultimaPergunta;
      ultimaPergunta = null;
      if (aba !== 'conversa') mostrarAba('conversa');
      if (pergunta) marcarOcupado(1);
      return enfileirar(async () => {
        try {
          return await responder();
        } finally {
          if (pergunta) marcarOcupado(-1);
        }
      });
      async function responder() {
        const msg = balao('ia', 'Maia', !!pergunta);
        estadoMaia('pensando');
        // Maia pensando (movimento.md, item 9): a estrela gira 90° encolhendo e uma onda sai do círculo.
        msg.insertAdjacentHTML('beforeend', '<div class="digitando maia-pensando" role="status"><span class="mp-icone" aria-hidden="true"><i class="mp-onda"></i><i class="mp-anel"></i><i class="mp-estrela"></i></span><small>Consultando os dados da Prefeitura…</small></div>');
        if (pergunta) rolar();
        const [resposta] = await Promise.all([Promise.resolve(respostaOuPromessa), esperar(atrasoMs)]);
        msg.querySelector('.digitando').remove();
        estadoMaia(null);
        contarNaoLida(resposta.cenario === 'evento_nova');
        const seguir = !!pergunta || noFim();
        desenharResposta(msg, resposta, pergunta);
        registrar({ autor: 'ia', resposta, pergunta });
        // O que a Maia entendeu vai para a memória: a próxima pergunta pode continuar desta.
        if (conversas && resposta.memoria) conversas.lembrar(Object.assign({ pergunta }, resposta.memoria));
        // Resposta longa: mostra do começo (com a pergunta logo acima), não do rodapé.
        const ancora = pergunta && msg.previousElementSibling && msg.previousElementSibling.classList.contains('prefeito') ? msg.previousElementSibling : msg;
        if (!seguir) { avisarNovas(); setTimeout(redimensionarGraficos, 750); return resposta; }
        mostrarDoInicio(ancora);
        esconderNovas();
        setTimeout(() => { redimensionarGraficos(); mostrarDoInicio(ancora); }, 750);
        return resposta;
      }
    }

    // "▦ Fixar como widget": cria (ou reencontra) o widget; depois o botão leva até ele no dashboard.
    function botaoFixar(pergunta, resposta) {
      const b = botaoBarra('layout-dashboard', 'Fixar como widget', 'Adicionar este gráfico aos widgets do painel (Indicadores)');
      b.classList.add('btn-fixar-widget');
      let fixado = null;
      const marcar = (r) => {
        fixado = r.widget.id;
        trocarBotao(b, 'check', r.criado ? 'Widget criado · ver no painel' : 'Já está nos widgets · ver');
        b.classList.add('feito');
      };
      b.onclick = () => {
        if (fixado) return aoVerWidget && aoVerWidget(fixado);
        const r = aoFixarWidget({ pergunta, resposta });
        if (r && r.widget) marcar(r);
      };
      return b;
    }

    // Fala da secretaria: vai para Atividade, não para a conversa. O nome já está no cabeçalho do cartão,
    // então sai do começo do texto.
    function secretaria(areaId, t) {
      const area = GC.data.areas.find((a) => a.id === areaId);
      const sec = area ? area.secretaria : { emoji: '', nome: 'Secretaria' };
      const entrada = GC.ICONES && GC.ICONES[String(sec.emoji || '').replace('️', '')];
      const icone = entrada ? (Array.isArray(entrada) ? entrada[0] : entrada) : 'building';
      const c = cartaoAviso('secretaria', { icone: `<i class="ti ti-${icone}" aria-hidden="true"></i>`, rotulo: sec.nome, tag: 'Secretaria' });
      let corpo = String(t || '');
      if (corpo.startsWith(`${sec.nome}: `)) corpo = corpo.slice(sec.nome.length + 2).replace(/^./, (x) => x.toUpperCase());
      c.appendChild(comNumeros(criar('p', 'aviso-texto'), corpo));
      contarNaoLida();
      return Promise.resolve();
    }

    // ---- Atividade: o que chega sozinho fica numa aba própria, fora da conversa (a conversa é só pergunta e
    // resposta). Dois tipos, cada um com ícone e cor próprios: fala de secretaria e observação da Maia.
    // Alerta novo não entra: ele tem o aviso próprio e a gaveta Alertas. Vale para esta sessão.
    const MAX_AVISOS = 60;
    const TIPOS_AVISO = [['todos', 'Tudo'], ['secretaria', 'Secretarias'], ['maia', 'Maia']];
    const chatEl = el.mensagens.parentNode;
    const abas = criar('div', 'chat-abas');
    abas.setAttribute('role', 'tablist');
    abas.setAttribute('aria-label', 'Conversa e atividade da Maia');
    abas.innerHTML = '<button type="button" role="tab" id="chat-aba-conversa" data-aba="conversa" aria-controls="chat-mensagens" aria-selected="true"><i class="ti ti-messages" aria-hidden="true"></i> Conversa</button>'
      + '<button type="button" role="tab" id="chat-aba-avisos" data-aba="avisos" aria-controls="chat-avisos" aria-selected="false" tabindex="-1" title="O que chegou enquanto você usa o painel: falas das secretarias e observações da Maia"><i class="ti ti-activity" aria-hidden="true"></i> Atividade <span class="chat-abas-cont" hidden></span></button>';
    const topoChat = chatEl.querySelector('.chat-topo');
    if (topoChat) topoChat.insertAdjacentElement('afterend', abas);
    else el.mensagens.insertAdjacentElement('beforebegin', abas);
    const painelAvisos = criar('div', 'chat-avisos');
    painelAvisos.id = 'chat-avisos';
    painelAvisos.setAttribute('role', 'tabpanel');
    painelAvisos.setAttribute('aria-labelledby', 'chat-aba-avisos');
    painelAvisos.hidden = true;
    painelAvisos.dataset.filtro = 'todos';
    painelAvisos.innerHTML = `<div class="avisos-cab">
        <div class="avisos-filtros" role="group" aria-label="Mostrar">${TIPOS_AVISO.map(([id, nome]) => `<button type="button" data-filtro="${id}" aria-pressed="${id === 'todos'}">${nome}<span class="avisos-n" data-n="${id}"></span></button>`).join('')}</div>
        <button type="button" class="avisos-limpar" hidden>Limpar</button>
      </div>
      <p class="avisos-nota">O que chegou enquanto você usa o painel. Para decidir sobre um alerta, use <b>Alertas</b> no topo.</p>
      <div class="avisos-lista" aria-live="polite"></div>`;
    el.mensagens.insertAdjacentElement('afterend', painelAvisos);
    el.mensagens.setAttribute('role', 'tabpanel');
    el.mensagens.setAttribute('aria-labelledby', 'chat-aba-conversa');
    const listaAvisos = painelAvisos.querySelector('.avisos-lista');
    const contAvisos = abas.querySelector('.chat-abas-cont');
    const btnLimpar = painelAvisos.querySelector('.avisos-limpar');
    let avisosNaoVistos = 0;
    const vazioAvisos = () => { listaAvisos.innerHTML = '<p class="avisos-vazio">Nada por enquanto. Falas das secretarias e observações da Maia aparecem aqui, sem entrar na conversa.</p>'; };
    vazioAvisos();
    function contarPorTipo() {
      const n = { todos: 0, secretaria: 0, maia: 0 };
      listaAvisos.querySelectorAll('.aviso').forEach((a) => { n.todos++; n[a.dataset.tipo]++; });
      painelAvisos.querySelectorAll('[data-n]').forEach((s) => { s.textContent = n[s.dataset.n] ? ` ${n[s.dataset.n]}` : ''; });
    }
    function filtrar(filtro) {
      painelAvisos.dataset.filtro = filtro;
      painelAvisos.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
    }
    painelAvisos.addEventListener('click', (e) => { const b = e.target.closest('.avisos-filtros [data-filtro]'); if (b) filtrar(b.dataset.filtro); });
    function marcarContAvisos() {
      contAvisos.textContent = avisosNaoVistos > 99 ? '99+' : String(avisosNaoVistos);
      contAvisos.hidden = !avisosNaoVistos;
      abas.querySelector('[data-aba="avisos"]').setAttribute('aria-label', avisosNaoVistos ? `Atividade, ${avisosNaoVistos} ${avisosNaoVistos === 1 ? 'novidade' : 'novidades'}` : 'Atividade');
    }
    function mostrarAba(qual, foco) {
      aba = qual;
      abas.querySelectorAll('[role="tab"]').forEach((b) => {
        const sel = b.dataset.aba === qual;
        b.setAttribute('aria-selected', String(sel));
        b.tabIndex = sel ? 0 : -1;
        if (sel && foco) b.focus();
      });
      el.mensagens.hidden = qual !== 'conversa';
      painelAvisos.hidden = qual !== 'avisos';
      chatEl.classList.toggle('na-aba-avisos', qual === 'avisos');
      if (qual === 'avisos') {
        esconderNovas();
        avisosNaoVistos = 0;
        marcarContAvisos();
        listaAvisos.scrollTop = 0;
        // O destaque de "novo" some depois de visto.
        setTimeout(() => { if (aba === 'avisos' && !recolhido) listaAvisos.querySelectorAll('.aviso-recente').forEach((a) => a.classList.remove('aviso-recente')); }, 4000);
      } else setTimeout(redimensionarGraficos, 50);
    }
    abas.addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) mostrarAba(b.dataset.aba); });
    abas.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      mostrarAba(aba === 'conversa' ? 'avisos' : 'conversa', true);
    });
    btnLimpar.addEventListener('click', () => { vazioAvisos(); btnLimpar.hidden = true; avisosNaoVistos = 0; marcarContAvisos(); contarPorTipo(); });
    const horaAviso = (d) => (d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}h`);
    // Cartão: ícone | rótulo (e a etiqueta do tipo) | hora; o corpo vem depois.
    function cartaoAviso(tipo, { icone, rotulo, tag, gravidade } = {}) {
      const vazio = listaAvisos.querySelector('.avisos-vazio');
      if (vazio) vazio.remove();
      const c = criar('article', `aviso aviso-${tipo} aviso-recente${gravidade ? ` aviso-g-${gravidade}` : ''}`);
      c.dataset.tipo = tipo;
      const cab = criar('div', 'aviso-cab');
      const ic = criar('span', 'aviso-ic');
      ic.innerHTML = icone || '';
      const fonte = criar('span', 'aviso-fonte');
      fonte.appendChild(criar('b', null, rotulo || ''));
      if (tag) fonte.appendChild(criar('span', 'aviso-tag', tag));
      cab.append(ic, fonte, criar('time', null, horaAviso(new Date(GC.agora ? GC.agora() : Date.now()))));
      c.appendChild(cab);
      listaAvisos.prepend(c);
      while (listaAvisos.children.length > MAX_AVISOS) listaAvisos.lastElementChild.remove();
      btnLimpar.hidden = false;
      if (aba !== 'avisos' || recolhido) { avisosNaoVistos++; marcarContAvisos(); }
      contarPorTipo();
      return c;
    }
    // Observação da Maia ({ rotulo } opcional: "Escalonamento", "Alerta retido"). Alerta novo não entra:
    // ele tem o aviso próprio e a gaveta Alertas.
    function avisoIa(respostaOuPromessa, meta = {}) {
      return Promise.resolve(respostaOuPromessa).then((resposta) => {
        if (!resposta || meta.tipo === 'alerta' || resposta.cenario === 'evento_nova') return resposta;
        const c = cartaoAviso('maia', { icone: '<span class="maia-rosto" aria-hidden="true"></span>', rotulo: meta.rotulo || 'Maia', tag: 'Observação' });
        desenharResposta(c, resposta, null, { aviso: true });
        contarNaoLida(false);
        return resposta;
      }).catch((e) => console.error(e));
    }

    function prefeito(t) {
      ultimaPergunta = t;
      if (aba !== 'conversa') mostrarAba('conversa');
      return enfileirar(async () => {
        texto(balao('prefeito', null, true), t);
        registrar({ autor: 'prefeito', texto: t });
      });
    }

    // ---- várias conversas: redesenhar uma conversa guardada e a lista na gaveta ----
    // Sem animação de entrada e sem contar como não lida: é a conversa voltando, não mensagem nova.
    function redesenhar(c) {
      return enfileirar(async () => {
        redesenhando = true;
        el.mensagens.innerHTML = '';
        ultimaPergunta = null;
        (c.mensagens || []).forEach((m) => {
          if (m.autor === 'prefeito') texto(balao('prefeito'), m.texto);
          // Falas de secretaria e avisos da Maia (evento_*) guardados antes da aba Avisos não voltam para a conversa.
          else if (m.autor === 'ia' && m.resposta && !/^evento_/.test(m.resposta.cenario || '')) desenharResposta(balao('ia', 'Maia'), m.resposta, m.pergunta || null);
        });
        el.mensagens.querySelectorAll('.msg').forEach((d) => d.classList.add('msg-restaurada'));
        // Conversa sem pergunta ainda: o início mostra as conversas anteriores para continuar.
        if (!(c.mensagens || []).some((m) => m.autor === 'prefeito')) el.mensagens.prepend(inicioConversa());
        redesenhando = false;
        rolar();
        setTimeout(redimensionarGraficos, 50);
      });
    }

    // "hoje, 14h", "ontem, 9h30" ou a data.
    function quando(t) {
      const d = new Date(t);
      const agora = new Date(GC.agora ? GC.agora() : Date.now());
      const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const dif = Math.round((dia(agora) - dia(d)) / 86400000);
      const h = d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}h`;
      return `${dif === 0 ? 'hoje' : dif === 1 ? 'ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${h}`;
    }

    const painel = el.painelConversas;
    const painelAberto = () => !!painel && !painel.hidden;
    function mostrarPainel(abrir) {
      if (!painel) return;
      painel.hidden = !abrir;
      if (el.btnConversas) el.btnConversas.setAttribute('aria-expanded', String(abrir));
      if (abrir) { desenharPainel(); mostrarAcoes(false); }
    }
    function desenharPainel() {
      const lista = conversas.lista();
      painel.innerHTML = `<div class="conv-cab"><b>Conversas</b><button type="button" class="conv-nova" data-conv="nova"><i class="ti ti-message-plus" aria-hidden="true"></i> Nova conversa</button></div>
        <ul class="conv-lista">${lista.map((c) => `<li class="conv-item${c.atual ? ' atual' : ''}">
          <button type="button" class="conv-abrir" data-conv="abrir" data-id="${GC.escaparHtml(c.id)}"${c.atual ? ' aria-current="true"' : ''}>
            <span class="conv-titulo">${GC.escaparHtml(c.titulo)}</span>
            <small>${quando(c.atualizadaEm)} · ${c.perguntas} ${c.perguntas === 1 ? 'pergunta' : 'perguntas'}</small></button>
          <button type="button" class="conv-apagar" data-conv="apagar" data-id="${GC.escaparHtml(c.id)}" title="Apagar esta conversa" aria-label="Apagar a conversa “${GC.escaparHtml(c.titulo)}”"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </li>`).join('')}</ul>
        <p class="conv-nota">Guardadas só neste navegador.</p>`;
    }
    function novaConversa() {
      redesenhar(conversas.nova());
      mostrarPainel(false);
      el.input.focus();
    }
    // Início de uma conversa nova: o que perguntar e, logo abaixo, as conversas anteriores para continuar
    // (a de antes de "Nova conversa" vem primeiro). Sai com a primeira pergunta.
    function inicioConversa() {
      const box = criar('section', 'chat-inicio');
      box.setAttribute('aria-label', 'Começo da conversa');
      const anteriores = conversas ? conversas.lista().filter((c) => !c.atual && c.perguntas > 0).slice(0, 4) : [];
      box.innerHTML = `<p class="chat-inicio-titulo"><span class="maia-rosto" aria-hidden="true"></span> Conversa nova</p>
        <p class="chat-inicio-texto">Pergunte sobre a cidade ou use as <b>Ações</b> abaixo. Alertas e falas das secretarias ficam em <b>Atividade</b>, fora da conversa.</p>${
        anteriores.length ? `<div class="chat-inicio-hist"><div class="chat-inicio-cab"><b>Continuar uma conversa</b>${conversas.lista().length > anteriores.length + 1 ? '<button type="button" class="chat-inicio-todas" data-conv="todas">Ver todas</button>' : ''}</div>
          <ul>${anteriores.map((c) => `<li><button type="button" class="chat-inicio-item" data-conv="abrir" data-id="${GC.escaparHtml(c.id)}">
            <i class="ti ti-message" aria-hidden="true"></i><span><b>${GC.escaparHtml(c.titulo)}</b><small>${quando(c.atualizadaEm)} · ${c.perguntas} ${c.perguntas === 1 ? 'pergunta' : 'perguntas'}</small></span>
            <i class="ti ti-chevron-right" aria-hidden="true"></i></button></li>`).join('')}</ul></div>` : ''}`;
      return box;
    }
    el.mensagens.addEventListener('click', (e) => {
      const b = e.target.closest('.chat-inicio [data-conv]');
      if (!b || !conversas) return;
      if (b.dataset.conv === 'todas') return mostrarPainel(true);
      const c = conversas.abrir(b.dataset.id);
      if (c) redesenhar(c);
    });
    if (conversas && painel) {
      if (el.btnConversas) el.btnConversas.addEventListener('click', () => mostrarPainel(!painelAberto()));
      if (el.btnNova) el.btnNova.addEventListener('click', novaConversa);
      painel.addEventListener('click', (e) => {
        const b = e.target.closest('[data-conv]');
        if (!b) return;
        if (b.dataset.conv === 'nova') return novaConversa();
        if (b.dataset.conv === 'abrir') {
          const c = conversas.abrir(b.dataset.id);
          if (c) redesenhar(c);
          return mostrarPainel(false);
        }
        if (b.dataset.conv === 'apagar') {
          const eraAtual = conversas.atual().id === b.dataset.id;
          conversas.apagar(b.dataset.id);
          if (eraAtual) redesenhar(conversas.atual());
          desenharPainel();
        }
      });
      // Esc com a lista aberta fecha só a lista (antes do Esc geral, que fecharia a gaveta).
      painel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); mostrarPainel(false); el.btnConversas.focus(); } });
    }

    // Abertura: a conversa de hoje volta desenhada; devolve true quando retomou (sem cumprimento de novo).
    function retomar() {
      if (!conversas) return false;
      const retomou = conversas.retomar();
      // Sem conversa de hoje, a nova já abre com as anteriores à mão (o início da conversa).
      redesenhar(conversas.atual());
      return retomou;
    }
    const memoria = () => (conversas ? conversas.memoria() : []);

    function sugestoes(lista) {
      catalogo = null;
      el.sugestoes.innerHTML = '';
      lista.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = s;
        b.onclick = () => { if (!respondendo) aoPerguntar(s); };
        el.sugestoes.appendChild(b);
      });
      marcarBordas();
    }

    // ---- ações prontas (js/ia/acoes-prontas.js): botão "Ações" + atalhos acima do campo e o catálogo na caixa ----
    // `fonte()` devolve { grupos, atalhos } na hora: o catálogo segue a tela aberta (gabinete, relatório…).
    let catalogo = null;
    let painelAcoes = null;
    const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
    const acaoPorId = (id) => (catalogo ? catalogo().grupos.flatMap((g) => g.acoes).find((a) => a.id === id) : null);
    function pedir(id) {
      const a = acaoPorId(id);
      if (!a || respondendo) return;
      mostrarAcoes(false);
      aoPerguntar(a.pergunta);
    }
    function desenharAtalhos() {
      if (!catalogo) return;
      const { atalhos } = catalogo();
      el.sugestoes.innerHTML = `<button type="button" class="chat-acoes-btn" data-acoes="abrir" aria-expanded="${painelAcoesAberto()}" aria-controls="chat-acoes" title="Ver todas as ações prontas da Maia"><i class="ti ti-sparkles" aria-hidden="true"></i> Ações</button>${
        atalhos.map((a) => `<button type="button" data-acao-pronta="${esc(a.id)}" title="${esc(a.descricao || a.pergunta)}"><i class="ti ti-${esc(a.icone)}" aria-hidden="true"></i> ${esc(a.nome)}</button>`).join('')}`;
      marcarBordas();
    }
    const painelAcoesAberto = () => !!painelAcoes && !painelAcoes.hidden;
    function desenharPainelAcoes() {
      const { grupos } = catalogo();
      painelAcoes.innerHTML = `<div class="acp-cab"><div><b>Ações prontas</b><p>A Maia monta com os dados de agora. Você revisa antes de enviar.</p></div>
          <button type="button" class="chat-topo-btn" data-acoes="fechar" title="Fechar as ações" aria-label="Fechar as ações"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <div class="acp-corpo">${grupos.map((g) => `<section class="acp-grupo acp-${esc(g.id)}"><h3>${esc(g.titulo)}</h3>
          <ul>${g.acoes.map((a) => `<li><button type="button" class="acp-item" data-acao-pronta="${esc(a.id)}">
            <span class="acp-ic" aria-hidden="true"><i class="ti ti-${esc(a.icone)}"></i></span>
            <span class="acp-txt"><b>${esc(a.nome)}</b>${a.descricao ? `<small>${esc(a.descricao)}</small>` : ''}</span>
            ${a.formato ? `<span class="acp-formato">${esc(a.formato)}</span>` : ''}</button></li>`).join('')}</ul></section>`).join('')}</div>`;
    }
    function mostrarAcoes(abrir) {
      if (!painelAcoes) return;
      if (abrir) { mostrarAba('conversa'); desenharPainelAcoes(); mostrarPainel(false); }
      painelAcoes.hidden = !abrir;
      const b = el.sugestoes.querySelector('[data-acoes="abrir"]');
      if (b) b.setAttribute('aria-expanded', String(abrir));
      if (abrir) { const primeiro = painelAcoes.querySelector('.acp-item'); if (primeiro) primeiro.focus(); }
    }
    function acoesProntas(fonte) {
      catalogo = fonte;
      if (!painelAcoes) {
        painelAcoes = criar('div', 'chat-acoes');
        painelAcoes.id = 'chat-acoes';
        painelAcoes.hidden = true;
        painelAcoes.setAttribute('role', 'region');
        painelAcoes.setAttribute('aria-label', 'Ações prontas da Maia');
        el.sugestoes.parentNode.insertBefore(painelAcoes, el.sugestoes);
        const clique = (e) => {
          const b = e.target.closest('[data-acao-pronta], [data-acoes]');
          if (!b) return;
          if (b.dataset.acaoPronta) return pedir(b.dataset.acaoPronta);
          if (b.dataset.acoes === 'abrir') return mostrarAcoes(!painelAcoesAberto());
          if (b.dataset.acoes === 'fechar') { mostrarAcoes(false); el.input.focus(); }
        };
        el.sugestoes.addEventListener('click', clique);
        painelAcoes.addEventListener('click', clique);
        // Esc com o catálogo aberto fecha só o catálogo (antes do Esc geral, que fecharia a gaveta).
        painelAcoes.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); mostrarAcoes(false); el.input.focus(); } });
        // Trocou de tela com a Maia aberta: os atalhos (e o catálogo, se aberto) passam a ser os da tela nova.
        window.addEventListener('hashchange', () => setTimeout(() => { desenharAtalhos(); if (painelAcoesAberto()) desenharPainelAcoes(); }, 60));
      }
      desenharAtalhos();
    }

    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = el.input.value.trim();
      if (!t || respondendo) return;
      el.input.value = '';
      aoPerguntar(t);
    });
    // Faixa de atalhos: rola de lado com a roda do mouse e esmaece a borda onde há mais botões.
    function marcarBordas() {
      const s = el.sugestoes;
      s.classList.toggle('tem-esq', s.scrollLeft > 2);
      s.classList.toggle('tem-dir', s.scrollLeft + s.clientWidth < s.scrollWidth - 2);
    }
    el.sugestoes.addEventListener('scroll', marcarBordas, { passive: true });
    el.sugestoes.addEventListener('wheel', (e) => {
      const s = el.sugestoes;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || s.scrollWidth <= s.clientWidth) return;
      s.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('resize', marcarBordas);

    // O "Resumo da semana" saiu do cabeçalho da Maia e foi para a doca (js/resumo-semana.js).
    if (el.btnResumo) el.btnResumo.addEventListener('click', () => aoPerguntar('Resumo da semana'));

    return { ia, secretaria, prefeito, sugestoes, acoesProntas, recolher, retomar, memoria, novaConversa };
  };
})(window.GC = window.GC || {});
