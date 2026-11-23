(function (GC) {
  // Tela de Relatórios: tipo, alvo e período no topo; o relatório montado como documento;
  // exportação em CSV (sempre) e PDF (jsPDF por CDN; sem internet o botão fica desabilitado).
  // Os números ficam congelados desde a abertura; dados novos só entram pelo botão "Atualizar".
  const esc = (t) => GC.escaparHtml(t);
  const TIPOS = [['executivo', 'Executivo'], ['secretaria', 'Secretaria'], ['bairro', 'Bairro'], ['alertas', 'Alertas'], ['entregas', 'Entregas'], ['comparacao', 'Comparação']];
  const PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['12m', '12 meses']];
  // A fonte padrão do jsPDF (WinAnsi) não tem emoji nem "≈": tira o emoji e troca o ≈ por "~".
  const semEmoji = (t) => String(t).replace(/\p{Extended_Pictographic}️?/gu, '').replace(/≈/g, '~').replace(/\s{2,}/g, ' ').trim();
  const hoje = () => new Date(GC.agora()).toISOString().slice(0, 10);
  const horaDe = (t) => { const d = new Date(t); return d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}h`; }; // "8h40", "19h" (tom-de-voz.md)
  const dataHoraDe = (t) => `${new Date(t).toLocaleDateString('pt-BR')} ${horaDe(t)}`;
  // Gestor do setor só vê o relatório da própria pasta: sem abas de outros tipos nem troca de secretaria.
  const pastaTravada = () => (GC.perfil && GC.visaoDe(GC.perfil) === 'pasta' ? GC.perfil.area : null);

  function nomeArquivo(rel, ext) {
    // O alvo da comparação ('bairros:centro,vila_nova') vira 'bairros-centro-vila_nova' no nome do arquivo.
    return `relatorio-${rel.tipo}-${String(rel.alvo).replace(/[^a-z0-9_-]+/gi, '-')}-${rel.codigoPeriodo}${rel.versao === 'resumida' ? '-resumido' : ''}-${hoje()}.${ext}`;
  }
  // Marca do documento (js/relatorio-formatos.js); sem ele, a cor e o nome de sempre.
  const marca = () => (GC.marcaDoDocumento ? GC.marcaDoDocumento() : { cor: [15, 76, 92], nomePrefeitura: nomePrefeitura(), logo: null });
  const subtitulo = (rel) => (GC.subtituloDocumento ? GC.subtituloDocumento(rel) : `${rel.subtitulo} · ${rel.periodo.rotulo}`);

  GC.baixarArquivo = baixar;

  // Redesenho ao vivo sem roubar o foco: guarda o elemento focado (por seus data-* e classe)
  // e a rolagem horizontal/vertical das áreas roláveis, e devolve tudo depois de redesenhar.
  GC.redesenharMantendo = function (raiz, rolaveis, redesenhar) {
    const ativo = document.activeElement;
    const dentro = ativo && raiz.contains(ativo) && ativo !== raiz;
    let seletor = null;
    if (dentro) {
      const linha = ativo.closest('[data-id]');
      const attrs = Object.keys(ativo.dataset).map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(ativo.dataset[k])}"]`).join('');
      // Todas as classes, menos as de estado, que mudam a cada redesenho.
      const classe = [...ativo.classList].filter((c) => c !== 'ativo' && c !== 'principal').map((c) => `.${CSS.escape(c)}`).join('');
      seletor = `${linha && linha !== ativo ? `[data-id="${CSS.escape(linha.dataset.id)}"] ` : ''}${ativo.tagName.toLowerCase()}${classe}${attrs}`;
    }
    const rolagens = rolaveis.map((s) => { const e = raiz.querySelector(s); return e ? [e.scrollLeft, e.scrollTop] : null; });
    redesenhar();
    rolaveis.forEach((s, i) => {
      const e = raiz.querySelector(s);
      if (e && rolagens[i]) { e.scrollLeft = rolagens[i][0]; e.scrollTop = rolagens[i][1]; }
    });
    if (seletor) {
      const alvo = raiz.querySelector(seletor);
      if (alvo) alvo.focus({ preventScroll: true });
    }
  };
  function baixar(conteudo, nome, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const nomePrefeitura = () => (GC.cidade && GC.cidade.nome ? `Prefeitura Municipal de ${GC.cidade.nome}` : 'Prefeitura Municipal');
  // Iniciais da cidade para o selo do cabeçalho ("Vila Dourada" → "VD"); sem preposições.
  const iniciais = (nome) => String(nome || 'PM').split(/\s+/).filter((p) => !/^(d[aeo]s?|e)$/i.test(p)).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  // PDF com jsPDF + autotable. A fonte padrão não desenha emoji: tiramos do texto.
  // Cabeçalho com selo da cidade, rodapé com página "i de n" em todas as páginas, e título de
  // seção nunca sozinho no pé da página.
  // Também usado pelos arquivos da Maia (js/ia/arquivos.js), que têm a mesma forma de relatório e o próprio nome.
  GC.relatorioPdf = exportarPdf;
  function exportarPdf(rel, geradoEm, nome) {
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margem = 40;
    const rodape = 36; // espaço reservado ao rodapé
    const altura = doc.internal.pageSize.getHeight();
    const largura = doc.internal.pageSize.getWidth() - margem * 2;
    const limite = altura - margem - rodape;
    const novaPaginaSe = (precisa) => { if (y + precisa > limite) { doc.addPage(); y = margem; } };
    let y = margem;
    const m = marca();
    // Logo próprio (PNG ou JPEG, 28 pt de altura) ou o selo: quadrado na cor da marca com as iniciais da cidade.
    let xTexto = margem + 38;
    let comLogo = false;
    if (m.logo) {
      try {
        const props = doc.getImageProperties(m.logo);
        const larguraLogo = Math.min(84, (28 * props.width) / props.height);
        doc.addImage(m.logo, props.fileType, margem, y - 10, larguraLogo, 28);
        xTexto = margem + larguraLogo + 10;
        comLogo = true;
      } catch (e) { comLogo = false; }
    }
    if (!comLogo) {
      doc.setFillColor(...m.cor).roundedRect(margem, y - 10, 28, 28, 5, 5, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255).text(iniciais(GC.cidade && GC.cidade.nome), margem + 14, y + 8, { align: 'center' });
    }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...m.cor).text(m.nomePrefeitura, xTexto, y);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120).text(`${m.slogan ? `${m.slogan} · ` : ''}Dados simulados para demonstração · dados de ${dataHoraDe(geradoEm)}`, xTexto, y + 12);
    y += 42;
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20).text(semEmoji(rel.titulo), margem, y);
    // Régua cartográfica sob o título (a mesma da tela): 12 segmentos, um sim e um não, na cor da marca.
    if (GC.grafismo) {
      const L = 120; const a = 4; const p = L / 12;
      doc.setDrawColor(...m.cor).setLineWidth(0.6).rect(margem, y + 6, L, a, 'S');
      doc.setFillColor(...m.cor);
      for (let i = 0; i < 12; i += 2) doc.rect(margem + i * p, y + 6, p, a, 'F');
      y += 10;
    }
    y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90).text(doc.splitTextToSize(semEmoji(subtitulo(rel)), largura), margem, y);
    const tabelaPdf = (head, body) => {
      doc.autoTable({ startY: y + 14, head: head ? [head.map(semEmoji)] : undefined, body: body.map((l) => l.map(semEmoji)), margin: { left: margem, right: margem, top: margem, bottom: margem + rodape }, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: m.cor } });
      y = doc.lastAutoTable.finalY;
    };
    // Sem indicadores (todos desmarcados no "Montar"), o documento começa pelo resumo.
    if (rel.kpis.length) {
      const ind = GC.tabelaIndicadores(rel);
      tabelaPdf(ind.colunas, ind.linhas);
    } else y += 6;
    y += 20;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
    (rel.topicos || [rel.resumo]).forEach((t) => {
      doc.splitTextToSize(`• ${semEmoji(t)}`, largura - 8).forEach((linha, i) => { novaPaginaSe(12); doc.text(linha, margem + (i ? 8 : 0), y); y += 12; });
      y += 2;
    });
    // Perfil topográfico como divisória entre o resumo e as seções (como na tela).
    if (GC.grafismo && rel.secoes.length) {
      const a = 18;
      novaPaginaSe(a + 20);
      y += 10;
      const pts = GC.grafismo.perfilPontos(largura, a, GC.grafismo.semente(rel.titulo));
      doc.setDrawColor(...m.cor).setLineWidth(0.8);
      for (let i = 1; i < pts.length; i++) doc.line(margem + pts[i - 1][0], y + pts[i - 1][1], margem + pts[i][0], y + pts[i][1]);
      doc.setDrawColor(200).setLineWidth(0.5).line(margem, y + a, margem + largura, y + a);
      y += a + 4;
    }
    rel.secoes.forEach((s) => {
      // Título + umas 3 linhas da tabela precisam caber juntos; senão a seção começa na página seguinte.
      novaPaginaSe(16 + 70);
      y += 16;
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...m.cor).text(semEmoji(s.titulo), margem, y);
      if (s.vazio) { y += 14; doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text(s.vazio, margem, y); return; }
      if (s.tipo === 'texto') {
        y += 4;
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
        String(s.texto).split(/\n/).forEach((par) => {
          doc.splitTextToSize(semEmoji(par) || ' ', largura).forEach((linha) => { novaPaginaSe(13); y += 13; doc.text(linha, margem, y); });
        });
      } else if (s.tipo === 'tabela') tabelaPdf(s.colunas, s.linhas);
      else if (s.tipo === 'lista') tabelaPdf(null, s.itens.map((t, i) => [`${i + 1}. ${t}`]));
      else tabelaPdf(null, s.itens.map((b) => [b.rotulo, b.texto]));
    });
    y += 20;
    const fontes = doc.splitTextToSize(`Fontes: ${rel.fontes.map(GC.nomeFonte || ((f) => f)).join(', ')}`, largura);
    novaPaginaSe(fontes.length * 10);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110).text(fontes, margem, y);
    // Rodapé em todas as páginas.
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(220).setLineWidth(0.5).line(margem, altura - margem - 12, margem + largura, altura - margem - 12);
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(130);
      doc.text(`${m.nomePrefeitura} · ${semEmoji(rel.titulo)} · dados de ${dataHoraDe(geradoEm)}`, margem, altura - margem);
      doc.text(`Página ${i} de ${total}`, margem + largura, altura - margem, { align: 'right' });
    }
    doc.save(nome || nomeArquivo(rel, 'pdf'));
  }

  const NUMERICO = /^(?:[▲▼+\-−~≈]\s?)?(?:R\$\s?)?\d[\d.,]*(?:\s?(?:%|p\.p\.|mi|mil|min|h|dias?)\b|%)?(?:\s.{0,24})?$/;
  function secao(s) {
    let corpo;
    if (s.vazio) corpo = `<p class="painel-vazio">${esc(s.vazio)}</p>`;
    else if (s.tipo === 'tabela') {
      // Coluna de números (quase toda célula começa por número, R$ ou sinal) fica alinhada à direita.
      const num = s.colunas.map((_, j) => {
        const cel = s.linhas.map((l) => String(l[j] == null ? '' : l[j]).trim()).filter((c) => c && c !== '—' && c !== '-');
        return j > 0 && cel.length > 0 && cel.filter((c) => NUMERICO.test(c)).length >= cel.length * 0.8;
      });
      const cl = (j) => (num[j] ? ' class="num"' : '');
      corpo = `<div class="rel-tabela-wrap"><table class="sec-tabela rel-tabela"><thead><tr>${s.colunas.map((c, j) => `<th scope="col"${cl(j)}>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${s.linhas.map((l) => `<tr>${l.map((c, j) => `<td${cl(j)}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else if (s.tipo === 'lista') {
      corpo = `<ol class="rel-lista">${s.itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
    } else if (s.tipo === 'texto') {
      corpo = `<p class="rel-texto">${esc(s.texto)}</p>`;
    } else {
      corpo = `<ul class="rel-barras">${s.itens.map((b) => `<li><span>${esc(b.rotulo)}</span><div class="rel-barra"><i style="width:${Math.max(0, Math.min(100, b.valor))}%"></i></div><small>${esc(b.texto)}</small></li>`).join('')}</ul>`;
    }
    return `<section class="rel-secao"><h3>${esc(s.titulo)}</h3>${corpo}</section>`;
  }

  // Linha de lista ou barra: com link vira botão (abre a ocorrência ou a secretaria), sem link é uma div.
  const LINK_DICA = { ocorrencia: 'Abrir a ocorrência', secretaria: 'Abrir a página da secretaria' };
  function linha(classe, item, miolo) {
    if (!item.link) return `<div class="${classe}">${miolo}</div>`;
    return `<button type="button" class="${classe} rel-clicavel" data-link-tipo="${esc(item.link.tipo)}" data-link-id="${esc(item.link.id)}" title="${LINK_DICA[item.link.tipo] || 'Abrir'}">${miolo}<span class="rel-seta" aria-hidden="true">›</span></button>`;
  }

  // Lista da esquerda (ações, metas, ocorrências, regras), com etiqueta colorida do número.
  function lista(l) {
    if (l.vazio) return `<p class="painel-vazio">${esc(l.vazio)}</p>`;
    return `<ol class="rel-acoes">${l.itens.map((i, n) => `<li>${linha('rel-acao', i, `<span class="rel-n">${n + 1}</span><span class="rel-acao-texto"${i.dica ? ` title="${esc(i.dica)}"` : ''}>${esc(i.texto)}${i.progresso !== undefined ? `<span class="rel-progresso"><i style="width:${i.progresso}%"></i></span>` : ''}</span>${i.etiqueta ? `<span class="rel-etq ${i.tom ? `t-${i.tom}` : ''}">${esc(i.etiqueta)}</span>` : ''}`)}</li>`).join('')}</ol>`;
  }

  // Barras da direita. Meta: marcador verde em todas as barras, com o rótulo "meta" só na primeira.
  // Marca: traço escuro de referência da própria barra (ex.: média por bairro). "Contexto": fora do período, esmaecida.
  function barrasHtml(d) {
    if (d.vazio) return `<p class="painel-vazio">${esc(d.vazio)}</p>`;
    const meta = (i) => (d.meta !== undefined ? `<span class="rel-meta${i === 0 ? ' com-rotulo' : ''}" style="left:${d.meta}%"></span>` : '');
    return `<ul class="rel-bars${d.meta !== undefined ? ' tem-meta' : ''}">${d.barras.map((b, i) => `<li${b.contexto ? ' class="contexto"' : ''}>${linha('rel-bars-linha', b, `<span class="rel-bars-rotulo"${b.dica ? ` title="${esc(b.dica)}"` : ''}>${esc(b.rotulo)}</span>
      <span class="rel-bars-trilho"><i class="${b.tom === 'ruim' ? 'ruim' : ''}" style="width:${b.valor}%"></i>${meta(i)}${b.marca !== undefined ? `<span class="rel-marca" style="left:${b.marca}%" title="média por bairro"></span>` : ''}</span>
      <b class="${b.tom === 'ruim' ? 'ruim' : ''}">${esc(b.texto)}</b>${b.etiqueta ? `<span class="rel-etq t-${b.etiquetaTom || ''}"${b.dica ? ` title="${esc(b.dica)}"` : ''}>${esc(b.etiqueta)}</span>` : ''}`)}</li>`).join('')}</ul>
      ${d.legenda ? `<p class="rel-legenda">${esc(d.legenda)}</p>` : ''}`;
  }

  // Números do resumo em negrito (valores, %, p.p., R$, horas): o olho acha o dado sem ler a frase toda.
  const NUMERO = /(?:≈ )?(?:R\$ )?\d[\d.,]*(?:\s?(?:%|p\.p\.|mi\b|h\b|min\b))?/g;
  const comNumeros = (t) => {
    let html = '';
    let ultimo = 0;
    String(t).replace(NUMERO, (m, pos) => { html += `${esc(t.slice(ultimo, pos))}<b>${esc(m)}</b>`; ultimo = pos + m.length; return m; });
    return html + esc(t.slice(ultimo));
  };

  // Cartão de número: o valor manda. A tendência vira um selo ao lado dele ("▲ 10%", com a referência
  // "vs mês anterior" em cinza) e o detalhe fica em cinza, com a cor da meta só no pontinho.
  const TEND = /^([▲▼+\-−]?\s?[\d.,]+\s?(?:%|p\.p\.|min|h)?)\s+(.+)$/;
  const numero = (k) => {
    const t = k.tendencia && TEND.exec(k.tendencia.texto);
    const tend = !k.tendencia ? '' : t
      ? `<span class="rel-tend ${k.tendencia.tom || ''}" title="${esc(k.tendencia.texto)}">${esc(t[1])}</span><span class="rel-tend-ref">${esc(t[2])}</span>`
      : `<span class="rel-tend-ref">${esc(k.tendencia.texto)}</span>`;
    return `<div class="rel-numero"><small>${esc(k.rotulo)}</small><div class="rel-numero-valor"><b>${esc(k.valor)}</b>${tend}</div>`
      + `${k.detalhe ? `<span class="rel-det ${k.tom ? `t-${k.tom}` : ''}">${esc(k.detalhe)}</span>` : ''}</div>`;
  };

  // Formatos secundários (o PDF é o botão principal): sempre no menu "Outros formatos", para a barra caber numa linha.
  const FORMATOS_SEC = [['xlsx', 'Excel', 'planilha'], ['doc', 'Word', 'documento editável'], ['csv', 'CSV', 'dados brutos']];
  const NOME_FORMATO = { csv: 'CSV', xlsx: 'Excel', doc: 'Word', pdf: 'PDF' };
  const GRAVIDADES = [['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Média']];
  // Relatório sem nenhum ajuste do "Montar" (troca de tipo e "Voltar ao relatório completo").
  const SEM_AJUSTES = { ocultar: [], secretarias: [], gravidades: [], comparar: false };

  GC.criarTelaRelatorios = function (el, { aoMudar, aoAbrir }) {
    let rota = null;
    let base = null; // o relatório como veio do app (sem as observações, que só a tela conhece)
    let rel = null; // o que está na tela e nos arquivos: base + observações
    const observacoes = {}; // por tipo/alvo, enquanto a tela está aberta (não vão para a rota)
    const chaveObs = () => (rota ? `${rota.tipo}/${rota.alvo}` : '');
    let geradoEm = 0; // hora dos dados que estão na tela (e no CSV/PDF)
    let chaveDesenhada = ''; // o relatório na tela, para não redesenhar à toa
    let pendente = null; // dados novos que chegaram depois de o relatório abrir (a tela não muda sozinha)
    let detalhesAbertos = false; // tabelas completas recolhidas: a tela mostra o painel; o resto está no PDF/CSV
    el.innerHTML = `
      <div class="rel-topo">
        <span class="rel-seg rel-tipos" role="tablist" aria-label="Tipo de relatório"></span>
        <span class="rel-alvo"></span>
        <span class="rel-periodo rel-rotulo">Período <select aria-label="Período"></select><b class="rel-periodo-fixo" hidden>Últimos 30 dias</b><span class="rel-meses" hidden>de <select class="rel-mes-de" aria-label="Primeiro mês"></select> até <select class="rel-mes-ate" aria-label="Último mês"></select></span></span>
        <span class="rel-montar"><button type="button" class="btn-sec rel-montar-btn" aria-expanded="false" aria-controls="rel-montar-painel"><span aria-hidden="true">⚙</span> Montar</button><div class="rel-montar-painel" id="rel-montar-painel" role="dialog" aria-label="Montar o relatório" hidden></div></span>
        <span class="rel-exportar"><span class="rel-aviso" aria-live="polite"><button type="button" class="rel-novos" hidden><span aria-hidden="true">●</span> Dados novos · Atualizar</button></span>
          <details class="rel-formatos-menu"><summary class="btn-sec"><span aria-hidden="true">⬇</span> Outros formatos <span class="rel-caret" aria-hidden="true">▾</span></summary><div role="menu">${FORMATOS_SEC.map(([f, n, d]) => `<button type="button" role="menuitem" data-formato="${f}"><b>${n}</b> <small>${d}</small></button>`).join('')}</div></details>
          <button type="button" class="btn-primario rel-pdf" data-formato="pdf"><span aria-hidden="true">⬇</span> PDF</button></span>
      </div>
      <div class="rel-conteudo" id="rel-painel"></div>`;
    const tipos = el.querySelector('.rel-tipos');
    const periodo = el.querySelector('.rel-periodo select');
    const alvo = el.querySelector('.rel-alvo');
    const conteudo = el.querySelector('.rel-conteudo');
    const btnPdf = el.querySelector('.rel-pdf');
    const periodoFixo = el.querySelector('.rel-periodo-fixo');
    const meses = el.querySelector('.rel-meses');
    const mesDe = el.querySelector('.rel-mes-de');
    const mesAte = el.querySelector('.rel-mes-ate');
    const opcoesMes = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${GC.rotuloMesSerie ? GC.rotuloMesSerie(i) : i}</option>`).join('');
    mesDe.innerHTML = opcoesMes;
    mesAte.innerHTML = opcoesMes;
    // Intervalo de meses: a ordem é corrigida (de > até troca), e o código vai para a rota (#/.../m3-8).
    const irMeses = () => {
      const a = Number(mesDe.value);
      const b = Number(mesAte.value);
      ir({ periodo: `m${Math.min(a, b)}-${Math.max(a, b)}` });
    };
    mesDe.onchange = irMeses;
    mesAte.onchange = irMeses;
    const btnNovos = el.querySelector('.rel-novos');
    btnNovos.onclick = () => {
      if (!pendente) return;
      const novo = pendente;
      pendente = null;
      btnNovos.hidden = true;
      aplicar(novo);
      const wraps = [...conteudo.querySelectorAll('.rel-tabela-wrap')].map((w) => w.scrollLeft);
      desenhar();
      conteudo.querySelectorAll('.rel-tabela-wrap').forEach((w, i) => { if (wraps[i]) w.scrollLeft = wraps[i]; });
    };
    // Itens com link (ocorrência, secretaria) abrem o destino.
    conteudo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-link-tipo]');
      if (b && aoAbrir) aoAbrir({ tipo: b.dataset.linkTipo, id: b.dataset.linkId });
      // Etiqueta "versão resumida" no cabeçalho: abre o "Montar".
      if (e.target.closest('.rel-versao')) abrirMontar(true);
      // "×" do selo de ajustes: tira filtros e partes escondidas (as observações ficam; elas saem pelo Montar).
      if (e.target.closest('.rel-limpar')) ir(SEM_AJUSTES);
    });

    const travada = pastaTravada();
    tipos.innerHTML = travada ? '' : TIPOS.map(([id, nome]) => `<button type="button" role="tab" id="rel-aba-${id}" aria-controls="rel-painel" tabindex="-1" data-tipo="${id}">${nome}</button>`).join('');
    tipos.hidden = !!travada;
    if (!travada) conteudo.setAttribute('role', 'tabpanel');
    // Abas no padrão WAI-ARIA: só a ativa entra no Tab; setas, Home e End trocam de aba.
    tipos.addEventListener('keydown', (e) => {
      const abas = [...tipos.querySelectorAll('[role="tab"]')];
      const i = abas.indexOf(document.activeElement);
      if (i < 0) return;
      const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[e.key];
      if (destino === undefined) return;
      e.preventDefault();
      const aba = abas[(destino + abas.length) % abas.length];
      aba.focus();
      aba.click();
    });
    const ir = (mudanca) => {
      const nova = Object.assign({}, rota, mudanca);
      nova.periodo = GC.periodoDoRelatorio ? GC.periodoDoRelatorio(nova.tipo, nova.periodo, nova.alvo) : nova.periodo;
      aoMudar(nova);
    };
    tipos.querySelectorAll('[data-tipo]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.tipo;
        const primeiro = { secretaria: GC.data.areas[0].id, bairro: GC.data.bairros[0].id, comparacao: GC.comparacaoPadrao ? GC.comparacaoPadrao().alvo : '-' }[t] || '-';
        // Os ids de indicadores e seções mudam de um tipo para outro: trocar de tipo esquece a escolha do "Montar".
        ir(Object.assign({ tipo: t, alvo: t === rota.tipo ? rota.alvo : primeiro }, t === rota.tipo ? {} : SEM_AJUSTES));
      };
    });
    // "Escolher meses…" começa nos últimos 6 meses da série.
    periodo.onchange = () => ir({ periodo: periodo.value === 'meses' ? 'm6-11' : periodo.value });
    // Exportar: todos os formatos leem o mesmo `rel` (o da tela). Cada download fica na auditoria.
    async function exportar(formato) {
      if (!rel) return;
      if (formato === 'pdf') { if (!window.jspdf) return; exportarPdf(rel, geradoEm); }
      else if (formato === 'csv') baixar(GC.relatorioCsv(rel), nomeArquivo(rel, 'csv'), 'text/csv;charset=utf-8');
      else if (formato === 'doc' && GC.relatorioWord) GC.relatorioWord(rel, nomeArquivo(rel, 'doc'));
      else if (formato === 'xlsx' && GC.relatorioExcel) await GC.relatorioExcel(rel, nomeArquivo(rel, 'xlsx'));
      else return;
      if (GC.auditar) {
        GC.auditar('relatorio_exportado', {
          alvo: rel.titulo, areaAlvo: rel.tipo === 'secretaria' ? rel.alvo : undefined,
          detalhe: [NOME_FORMATO[formato], rel.periodo.rotulo, rel.versao === 'resumida' ? 'versão resumida' : ''].filter(Boolean).join(' · '),
        });
      }
    }
    el.querySelectorAll('.rel-exportar [data-formato]').forEach((b) => {
      b.onclick = () => {
        const menu = b.closest('details');
        if (menu) menu.open = false;
        exportar(b.dataset.formato);
      };
    });

    // ---- Montar: escolher indicadores e seções (vão para a rota) e escrever as observações (só na tela) ----
    const btnMontar = el.querySelector('.rel-montar-btn');
    const painelMontar = el.querySelector('.rel-montar-painel');
    const montarAberto = () => !painelMontar.hidden;
    function abrirMontar(abrir) {
      painelMontar.hidden = !abrir;
      btnMontar.setAttribute('aria-expanded', String(abrir));
      if (abrir) {
        desenharMontar();
        // Abre alinhado ao botão; se passar da borda direita da barra, recua (no estreito o CSS já o estica).
        painelMontar.style.left = '';
        const topo = el.querySelector('.rel-topo').getBoundingClientRect();
        const r = painelMontar.getBoundingClientRect();
        if (getComputedStyle(painelMontar.parentElement).position === 'relative' && r.right > topo.right - 8) painelMontar.style.left = `${Math.round(topo.right - 8 - r.right)}px`;
        const primeiro = painelMontar.querySelector('input:not(:disabled), textarea');
        if (primeiro) primeiro.focus();
      }
    }
    btnMontar.onclick = () => abrirMontar(!montarAberto());
    // Esc fecha só o suspenso aberto (Montar ou "Outros formatos"). Captura no window: roda antes do Esc
    // geral do app.js (captura no document), que senão fecharia a tela inteira.
    const menuFormatos = el.querySelector('.rel-formatos-menu');
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || el.hidden) return;
      if (montarAberto()) { abrirMontar(false); btnMontar.focus(); }
      else if (menuFormatos.open) { menuFormatos.open = false; menuFormatos.querySelector('summary').focus(); }
      else if (alvo.querySelector('.rel-escolha[open]')) { const d = alvo.querySelector('.rel-escolha'); d.open = false; d.querySelector('summary').focus(); }
      else return;
      e.stopImmediatePropagation();
    }, true);
    document.addEventListener('click', (e) => {
      if (montarAberto() && !e.target.closest('.rel-montar') && !e.target.closest('.rel-versao')) abrirMontar(false);
      if (menuFormatos.open && !e.target.closest('.rel-formatos-menu')) menuFormatos.open = false;
      const escolha = alvo.querySelector('.rel-escolha[open]');
      if (escolha && !e.target.closest('.rel-escolha')) escolha.open = false;
    });
    const ocultosDa = () => (rel && rel.partes ? [...rel.partes.indicadores, ...rel.partes.secoes].filter((x) => !x.visivel).map((x) => x.id) : []);
    function desenharMontar() {
      if (!rel || !rel.partes || !montarAberto()) return;
      const todas = [...rel.partes.indicadores, ...rel.partes.secoes];
      const visiveis = todas.filter((x) => x.visivel).length;
      // A última parte marcada não sai: o relatório precisa de pelo menos uma.
      const caixa = (x, nome) => {
        const travada = x.visivel && visiveis === 1;
        return `<label${travada ? ' title="O relatório precisa de pelo menos uma parte"' : ''}><input type="checkbox" data-parte="${esc(x.id)}"${x.visivel ? ' checked' : ''}${travada ? ' disabled' : ''}> ${esc(nome)}</label>`;
      };
      const grupo = (titulo, id, lista, nome) => `<fieldset class="rel-montar-grupo"><legend>${titulo}</legend>
        ${lista.some((x) => !x.visivel) ? `<button type="button" class="rel-link" data-marcar-todas="${id}">Marcar todas</button>` : ''}
        ${lista.map((x) => caixa(x, nome(x))).join('')}</fieldset>`;
      const obs = observacoes[chaveObs()] || '';
      // Filtros (fase 2): recorte de secretarias, gravidade e mês anterior. Tudo marcado = sem filtro.
      const vale = GC.filtrosDoRelatorio ? GC.filtrosDoRelatorio(rota.tipo) : {};
      const secs = rota.secretarias && rota.secretarias.length ? rota.secretarias : GC.data.areas.map((a) => a.id);
      const gravs = rota.gravidades && rota.gravidades.length ? rota.gravidades : GRAVIDADES.map(([g]) => g);
      const caixaFiltro = (attr, id, nome, ligado, unica) => `<label${unica ? ' title="Pelo menos uma precisa ficar marcada"' : ''}><input type="checkbox" ${attr}="${esc(id)}"${ligado ? ' checked' : ''}${unica ? ' disabled' : ''}> ${esc(nome)}</label>`;
      const grupoSec = vale.secretarias && !travada ? `<fieldset class="rel-montar-grupo"><legend>Secretarias</legend>
        ${secs.length < GC.data.areas.length ? '<button type="button" class="rel-link" data-todas-sec>Marcar todas</button>' : ''}
        ${GC.data.areas.map((a) => caixaFiltro('data-sec', a.id, a.nome, secs.includes(a.id), secs.length === 1 && secs.includes(a.id))).join('')}</fieldset>` : '';
      const grupoGrav = vale.gravidades ? `<fieldset class="rel-montar-grupo"><legend>Gravidade das ocorrências</legend>
        ${GRAVIDADES.map(([g, nome]) => caixaFiltro('data-grav', g, nome, gravs.includes(g), gravs.length === 1 && gravs.includes(g))).join('')}</fieldset>` : '';
      const em30 = rota.periodo === '30';
      const grupoCmp = vale.comparar === false ? '' : `<fieldset class="rel-montar-grupo"><legend>Comparação</legend>
        <label${em30 ? '' : ' title="Só no período de 30 dias, o único com o mês anterior nos dados"'}><input type="checkbox" data-cmp${rota.comparar && em30 ? ' checked' : ''}${em30 ? '' : ' disabled'}> Comparar com o mês anterior${em30 ? '' : ' <small>(só em 30 dias)</small>'}</label></fieldset>`;
      const filtrado = !!(rel.filtros && (rel.filtros.areas || rel.filtros.grav || rel.filtros.comparar));
      GC.redesenharMantendo(painelMontar, [], () => {
        painelMontar.innerHTML = `
          ${rel.partes.indicadores.length ? grupo('Indicadores', 'indicadores', rel.partes.indicadores, (x) => x.rotulo) : ''}
          ${grupo('Seções', 'secoes', rel.partes.secoes, (x) => `${x.titulo}${x.soDocumento ? ' (só no documento)' : ''}`)}
          ${grupoSec}${grupoGrav}${grupoCmp}
          <label class="rel-obs"><span>Observações para o documento</span>
            <textarea rows="4" maxlength="${GC.LIMITE_OBSERVACOES || 1000}" data-campo="observacoes" placeholder="Uma nota sua no fim do PDF, do Word, do Excel e do CSV">${esc(obs)}</textarea>
            <small class="rel-obs-conta">${obs.length} de ${GC.LIMITE_OBSERVACOES || 1000}</small></label>
          ${rel.versao === 'resumida' || obs || filtrado ? '<button type="button" class="rel-link" data-completo>Voltar ao relatório completo</button>' : ''}`;
      });
    }
    // Liga ou desliga um id numa lista em que "tudo marcado" vira lista vazia (sem filtro na rota).
    const alternar = (atual, todos, id, ligado) => {
      const nova = todos.filter((x) => (x === id ? ligado : atual.includes(x)));
      return nova.length === todos.length ? [] : nova;
    };
    painelMontar.addEventListener('change', (e) => {
      const c = e.target;
      if (c.matches('[data-parte]')) {
        const fora = new Set(ocultosDa());
        if (c.checked) fora.delete(c.dataset.parte); else fora.add(c.dataset.parte);
        ir({ ocultar: [...fora] });
      } else if (c.matches('[data-sec]')) {
        const todos = GC.data.areas.map((a) => a.id);
        ir({ secretarias: alternar(rota.secretarias && rota.secretarias.length ? rota.secretarias : todos, todos, c.dataset.sec, c.checked) });
      } else if (c.matches('[data-grav]')) {
        const todos = GRAVIDADES.map(([g]) => g);
        ir({ gravidades: alternar(rota.gravidades && rota.gravidades.length ? rota.gravidades : todos, todos, c.dataset.grav, c.checked) });
      } else if (c.matches('[data-cmp]')) ir({ comparar: c.checked });
    });
    painelMontar.addEventListener('click', (e) => {
      const todas = e.target.closest('[data-marcar-todas]');
      if (todas) {
        const ids = new Set(rel.partes[todas.dataset.marcarTodas].map((x) => x.id));
        ir({ ocultar: ocultosDa().filter((id) => !ids.has(id)) });
      } else if (e.target.closest('[data-todas-sec]')) {
        ir({ secretarias: [] });
      } else if (e.target.closest('[data-completo]')) {
        delete observacoes[chaveObs()];
        ir(SEM_AJUSTES);
        aplicarObservacoes();
        desenharMontar();
      }
    });
    // Observações: o documento muda 400 ms depois da última tecla; a rota não muda.
    let esperaObs = null;
    painelMontar.addEventListener('input', (e) => {
      const t = e.target.closest('[data-campo="observacoes"]');
      if (!t) return;
      observacoes[chaveObs()] = t.value;
      const conta = painelMontar.querySelector('.rel-obs-conta');
      if (conta) conta.textContent = `${t.value.length} de ${GC.LIMITE_OBSERVACOES || 1000}`;
      clearTimeout(esperaObs);
      esperaObs = setTimeout(aplicarObservacoes, 400);
    });
    function aplicarObservacoes() {
      if (!base) return;
      rel = GC.comObservacoes ? GC.comObservacoes(base, observacoes[chaveObs()]) : base;
      desenhar();
    }

    function barra() {
      tipos.querySelectorAll('[data-tipo]').forEach((b) => {
        b.classList.toggle('ativo', b.dataset.tipo === rota.tipo);
        b.setAttribute('aria-selected', String(b.dataset.tipo === rota.tipo));
        b.tabIndex = b.dataset.tipo === rota.tipo ? 0 : -1;
      });
      if (!travada) conteudo.setAttribute('aria-labelledby', `rel-aba-${rota.tipo}`);
      // No celular as abas rolam de lado: a ativa fica à vista.
      const abaAtiva = tipos.querySelector('.ativo');
      if (abaAtiva && tipos.scrollWidth > tipos.clientWidth) {
        const desvio = abaAtiva.getBoundingClientRect().left - tipos.getBoundingClientRect().left;
        tipos.scrollLeft += desvio - (tipos.clientWidth - abaAtiva.offsetWidth) / 2;
      }
      // Só os períodos que mudam este relatório; com um só (bairro), mostra o texto no lugar do select.
      const validos = GC.periodosDoRelatorio ? GC.periodosDoRelatorio(rota.tipo) : PERIODOS.map(([id]) => id);
      const aceitaMeses = !!(GC.aceitaMesesNoRelatorio && GC.aceitaMesesNoRelatorio(rota.tipo));
      const intervalo = /^m\d/.test(rota.periodo) && GC.periodoInfo ? GC.periodoInfo(rota.periodo) : null;
      periodo.innerHTML = PERIODOS.filter(([id]) => validos.includes(id)).map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('')
        + (aceitaMeses ? '<option value="meses">Escolher meses…</option>' : '');
      periodo.value = intervalo ? 'meses' : rota.periodo;
      meses.hidden = !intervalo;
      if (intervalo) { mesDe.value = String(intervalo.de); mesAte.value = String(intervalo.ate); }
      periodo.hidden = validos.length < 2 && !aceitaMeses;
      periodoFixo.hidden = !periodo.hidden;
      periodoFixo.title = { bairro: 'Os dados por bairro existem só para os últimos 30 dias', comparacao: 'Taxas e contagens dos últimos 30 dias; o mês anterior vem ao lado' }[rota.tipo] || '';
      const comp = rota.tipo === 'comparacao' && GC.lerAlvoComparacao ? GC.lerAlvoComparacao(rota.alvo) : null;
      // Comparação de períodos: os dois intervalos ficam no lugar do alvo; o seletor de período some.
      el.querySelector('.rel-periodo').hidden = !!(comp && comp.modo === 'periodos');
      if (comp) { controlesComparacao(comp); return terminarBarra(); }
      const opcoes = travada ? null : {
        secretaria: GC.data.areas.map((a) => [a.id, a.secretaria.nome]),
        bairro: GC.data.bairros.map((b) => [b.id, b.nome]),
        entregas: [['-', 'Toda a cidade'], ...GC.data.bairros.map((b) => [b.id, b.nome])],
      }[rota.tipo];
      // Rótulo visível, como o do Período: o select sozinho não diz o que escolhe.
      const rotuloAlvo = rota.tipo === 'secretaria' ? 'Secretaria' : 'Bairro';
      alvo.innerHTML = opcoes ? `<label class="rel-rotulo">${rotuloAlvo} <select>${opcoes.map(([id, nome]) => `<option value="${id}"${id === rota.alvo ? ' selected' : ''}>${esc(nome)}</option>`).join('')}</select></label>` : '';
      const select = alvo.querySelector('select');
      if (select) select.onchange = () => ir({ alvo: select.value });
      terminarBarra();
    }

    // ---- Comparação: modo (bairros, secretarias, períodos) e o que entra ----
    const MODOS = [['bairros', 'Bairros'], ['secretarias', 'Secretarias'], ['periodos', 'Períodos']];
    let escolhaAberta = false; // o seletor de bairros/secretarias continua aberto entre um clique e outro
    function controlesComparacao(c) {
      const modo = `<select class="rel-comp-modo" aria-label="Comparar">${MODOS.map(([id, nome]) => `<option value="${id}"${id === c.modo ? ' selected' : ''}>${nome}</option>`).join('')}</select>`;
      if (c.modo === 'periodos') {
        const A = GC.periodoInfo(c.base);
        const B = GC.periodoInfo(rota.periodo) || { de: 9, ate: 11 };
        const mes = (classe, rotulo, v) => `<select class="${classe}" aria-label="${rotulo}">${Array.from({ length: 12 }, (_, i) => `<option value="${i}"${i === v ? ' selected' : ''}>${GC.rotuloMesSerie(i)}</option>`).join('')}</select>`;
        alvo.innerHTML = `${modo} <span class="rel-comp-periodos"><b>A</b> ${mes('rel-a-de', 'Período A, primeiro mês', A.de)} até ${mes('rel-a-ate', 'Período A, último mês', A.ate)} <b>com B</b> ${mes('rel-b-de', 'Período B, primeiro mês', B.de)} até ${mes('rel-b-ate', 'Período B, último mês', B.ate)}</span>`;
        const v = (s) => Number(alvo.querySelector(s).value);
        const faixa = (a, b) => `m${Math.min(a, b)}-${Math.max(a, b)}`;
        alvo.querySelectorAll('.rel-comp-periodos select').forEach((s) => {
          s.onchange = () => ir({ alvo: `periodos:${faixa(v('.rel-a-de'), v('.rel-a-ate'))}`, periodo: faixa(v('.rel-b-de'), v('.rel-b-ate')) });
        });
      } else {
        const lista = c.modo === 'bairros' ? GC.data.bairros : GC.data.areas;
        const { min, max } = GC.LIMITES_COMPARACAO;
        const n = c.ids.length;
        const nomes = c.ids.map((id) => lista.find((x) => x.id === id).nome);
        const caixas = lista.map((x) => {
          const marcado = c.ids.includes(x.id);
          const travado = marcado ? n <= min : n >= max;
          const dica = travado ? (marcado ? ` title="Comparação precisa de pelo menos ${min}"` : ` title="No máximo ${max} lado a lado"`) : '';
          return `<label${dica}><input type="checkbox" data-comp="${esc(x.id)}"${marcado ? ' checked' : ''}${travado ? ' disabled' : ''}> ${esc(x.nome)}</label>`;
        }).join('');
        alvo.innerHTML = `${modo} <details class="rel-escolha"${escolhaAberta ? ' open' : ''}><summary class="btn-sec" aria-label="Escolher ${c.modo === 'bairros' ? 'bairros' : 'secretarias'} (de ${min} a ${max})">${esc(nomes.join(', '))} <span aria-hidden="true">▾</span></summary>
          <div class="rel-escolha-lista" role="group" aria-label="${c.modo === 'bairros' ? 'Bairros' : 'Secretarias'} na comparação"><small>De ${min} a ${max} lado a lado</small>${caixas}</div></details>`;
        const det = alvo.querySelector('.rel-escolha');
        det.addEventListener('toggle', () => { escolhaAberta = det.open; });
        det.addEventListener('change', (e) => {
          const marcados = lista.map((x) => x.id).filter((id) => (id === e.target.dataset.comp ? e.target.checked : c.ids.includes(id)));
          if (marcados.length >= min && marcados.length <= max) ir({ alvo: `${c.modo}:${marcados.join(',')}` });
        });
      }
      // Trocar de modo muda as seções: esquece as escondidas.
      alvo.querySelector('.rel-comp-modo').onchange = (e) => {
        escolhaAberta = false;
        const pad = GC.comparacaoPadrao(e.target.value);
        ir({ alvo: pad.alvo, periodo: pad.periodo, ocultar: [] });
      };
    }

    function terminarBarra() {
      const temPdf = !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable);
      btnPdf.disabled = !temPdf;
      btnPdf.title = temPdf ? 'Baixar em PDF (relatório completo)' : 'Exportar PDF precisa de internet';
    }

    function desenhar() {
      const p = rel.painel;
      // Nos detalhes da tela, só os indicadores que os cartões não mostram e sem as seções que repetem o painel.
      const ind = GC.tabelaIndicadores(rel);
      // Comparando com o mês anterior, a tabela mostra todos os indicadores (a comparação dos cartões também).
      const comparando = !!(rel.filtros && rel.filtros.comparar);
      const indTela = comparando ? Object.assign({}, ind, { titulo: 'Indicadores · comparação com o mês anterior' })
        : Object.assign({}, ind, { titulo: 'Outros indicadores', linhas: ind.linhas.filter((_, i) => !rel.kpis[i].noCartao) });
      const ajustes = [GC.rotuloFiltros ? GC.rotuloFiltros(rel) : '', rel.versao === 'resumida' ? GC.rotuloVersao(rel) : ''].filter(Boolean).join(' · ');
      const secoesTela = [...(indTela.linhas.length ? [indTela] : []), ...rel.secoes.filter((s) => !s.soDocumento)];
      conteudo.innerHTML = `
        <header class="rel-cabecalho"><div class="rel-cab-texto"><h2>${esc(rel.titulo)}</h2>${GC.grafismo ? GC.grafismo.regua(160, 6, 12) : ''}<p>${esc(rel.periodo.rotulo)} · ${esc(rel.subtitulo)}</p>
          <p class="rel-chips"><span class="rel-chip rel-hora" title="Retrato dos dados neste horário: a tela não muda sozinha, e CSV e PDF saem com estes números">Dados de ${esc(horaDe(geradoEm))}</span>${ajustes ? `<span class="rel-chip rel-chip-filtro"><button type="button" class="rel-versao" title="Mudar o que entra no relatório">${esc(ajustes)}</button><button type="button" class="rel-limpar" title="Voltar ao relatório completo" aria-label="Tirar os ajustes e voltar ao relatório completo">×</button></span>` : ''}</p></div>
          <button type="button" class="btn-maia-tela" data-maia="Resuma este relatório">🛞 Resumir com a Maia</button></header>
        <ul class="rel-resumo">${(rel.topicos || [rel.resumo]).map((t) => `<li>${comNumeros(t)}</li>`).join('')}</ul>
        <div class="rel-numeros">${p.kpis.map(numero).join('')}</div>
        <div class="rel-colunas">
          <section class="rel-cartao"><h3>${esc(p.esquerda.titulo)}</h3>${lista(p.esquerda)}</section>
          <section class="rel-cartao"><h3>${esc(p.direita.titulo)}${p.direita.nota ? ` <small>— ${esc(p.direita.nota)}</small>` : ''}</h3>${barrasHtml(p.direita)}</section>
        </div>
        ${GC.grafismo ? GC.grafismo.perfil(600, 28, 'currentColor', GC.grafismo.semente(rel.titulo)) : ''}
        <details class="rel-detalhes"${detalhesAbertos || comparando || rel.tipo === 'comparacao' ? ' open' : ''}>
          <summary><span aria-hidden="true">📋</span> Ver dados detalhados <small>tabelas completas, as mesmas do PDF e do CSV</small></summary>
          <div class="rel-doc">${secoesTela.map(secao).join('')}<footer class="rel-fontes"><span aria-hidden="true">📚</span> Fontes: ${rel.fontes.map((f) => `<span title="${esc(f)}">${esc(GC.nomeFonte ? GC.nomeFonte(f) : f)}</span>`).join(' · ')}</footer></div>
        </details>`;
      conteudo.querySelector('.rel-detalhes').addEventListener('toggle', (e) => { detalhesAbertos = e.target.open; });
    }

    const chaveDe = (r) => JSON.stringify(r);
    function aplicar(novoRel) {
      base = novoRel;
      rel = GC.comObservacoes ? GC.comObservacoes(novoRel, observacoes[chaveObs()]) : novoRel;
      chaveDesenhada = chaveDe(novoRel);
      geradoEm = GC.agora();
    }

    function mostrar(novaRota, novoRel) {
      rota = novaRota;
      pendente = null;
      btnNovos.hidden = true;
      aplicar(novoRel);
      barra();
      desenhar();
      desenharMontar();
    }

    // Relatório é um retrato: a cidade segue mudando, mas a tela não se redesenha sozinha (número
    // que muda enquanto se lê, ou entre a tela e o PDF, tira a confiança). Só avisa que há dados novos.
    // O aviso só aparece depois de 1 minuto do retrato: a cidade muda a cada poucos segundos, e um
    // aviso sempre aceso deixa de ser notado.
    const IDADE_AVISO_MS = 60 * 1000;
    function atualizar(novoRel) {
      const igual = chaveDe(novoRel) === chaveDesenhada;
      pendente = igual ? null : novoRel;
      const mostrar = !igual && GC.agora() - geradoEm >= IDADE_AVISO_MS;
      btnNovos.hidden = !mostrar;
      btnNovos.title = mostrar ? `Os números mudaram desde ${horaDe(geradoEm)}. Clique para trazer os dados de agora.` : '';
    }

    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
