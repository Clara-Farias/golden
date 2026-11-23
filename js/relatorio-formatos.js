(function (GC) {
  // Formatos de documento para os relatórios da tela Relatórios e os arquivos da Maia (js/ia/arquivos.js):
  // Word (HTML que o Word abre), Excel (SheetJS por CDN; sem internet sai CSV) e a marca da Prefeitura.
  // Todo documento tem a forma de relatório: { titulo, subtitulo, periodo, kpis, topicos, secoes, fontes }.
  const escH = (t) => GC.escaparHtml(t);
  const PADRAO = { cor: [15, 76, 92], corHex: '#0f4c5c' };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  // A marca do documento: a cor principal de quem baixa (Personalização), o nome da Prefeitura e o logo próprio.
  // A cor é fundo de cabeçalho com texto branco: sem contraste 4,5 com o branco, fica a cor padrão.
  // O jsPDF não desenha SVG: só logo PNG ou JPEG entra; sem ele, o documento usa o selo com as iniciais.
  GC.marcaDoDocumento = function () {
    let r = null;
    try { r = GC.personalizacao ? GC.personalizacao.config().resolver(GC.usuarioAtual ? GC.usuarioAtual() : null) : null; } catch (e) { r = null; }
    const principal = r && r.aparencia && r.aparencia.cores ? r.aparencia.cores.principal : null;
    const usaCor = !!principal && (!GC.corValida || GC.corValida(principal)) && (!GC.contraste || GC.contraste(principal, '#ffffff') >= 4.5);
    const logo = r && r.marca && /^data:image\/(png|jpeg);/.test(r.marca.logo || '') ? r.marca.logo : null;
    const cidade = GC.cidade && GC.cidade.nome;
    const marca = r && r.marca ? r.marca : null;
    return {
      // Nome oficial e slogan da gestão (Personalização → Nome e logo); sem eles, "Prefeitura Municipal de <cidade>".
      nomePrefeitura: GC.nomeOficialPrefeitura ? GC.nomeOficialPrefeitura(marca, cidade) : cidade ? `Prefeitura Municipal de ${cidade}` : 'Prefeitura Municipal',
      slogan: (marca && marca.slogan) || '',
      cor: usaCor ? rgb(principal) : PADRAO.cor,
      corHex: usaCor ? principal.toLowerCase() : PADRAO.corHex,
      logo,
    };
  };

  // Linha de subtítulo comum: subtítulo, período, filtros (recorte, gravidade) e, se montado à mão, a versão resumida.
  GC.subtituloDocumento = (doc) => [doc.subtitulo, doc.periodo && doc.periodo.rotulo, GC.rotuloFiltros ? GC.rotuloFiltros(doc) : '', GC.rotuloVersao ? GC.rotuloVersao(doc) : ''].filter(Boolean).join(' · ');

  // ---- Word ----
  function word(doc) {
    const m = GC.marcaDoDocumento();
    const cor = m.corHex;
    const corpoSecao = (s) => (s.vazio ? `<p><i>${escH(s.vazio)}</i></p>`
      : s.tipo === 'tabela' ? `<table><tr>${s.colunas.map((c) => `<th>${escH(c)}</th>`).join('')}</tr>${s.linhas.map((l) => `<tr>${l.map((c) => `<td>${escH(c)}</td>`).join('')}</tr>`).join('')}</table>`
        : s.tipo === 'texto' ? String(s.texto).split(/\n+/).map((p) => `<p>${escH(p)}</p>`).join('')
        // Lista de textos; "barras" (relatório executivo) vira lista "rótulo: valor".
          : `<ul>${s.itens.map((i) => `<li>${escH(typeof i === 'object' ? `${i.rotulo}: ${i.texto}` : i)}</li>`).join('')}</ul>`);
    const indicadores = doc.kpis && doc.kpis.length ? `<h2>Números</h2>${corpoSecao(GC.tabelaIndicadores(doc))}` : '';
    return `﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escH(doc.titulo)}</title>
      <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{color:${cor};font-size:18pt;margin:0}h2{color:${cor};font-size:12.5pt;border-bottom:1px solid ${cor};margin-top:18pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #c8d2d4;padding:3pt 5pt;font-size:9.5pt;vertical-align:top}th{background:${cor};color:#fff;text-align:left}.sub{color:#555}</style></head><body>
      ${m.logo ? `<p><img src="${m.logo}" alt="" height="48"></p>` : ''}
      <p class="sub">${escH(m.nomePrefeitura)}${m.slogan ? ` · ${escH(m.slogan)}` : ''} · dados simulados para demonstração</p>
      <h1>${escH(doc.titulo)}</h1><p class="sub">${escH(GC.subtituloDocumento(doc))}</p>
      ${indicadores}
      <h2>Resumo</h2><ul>${doc.topicos.map((t) => `<li>${escH(t)}</li>`).join('')}</ul>
      ${doc.secoes.map((s) => `<h2>${escH(s.titulo)}</h2>${corpoSecao(s)}`).join('')}
      <p class="sub" style="font-size:8pt">Fontes: ${escH(doc.fontes.map(GC.nomeFonte || ((f) => f)).join(', '))}.</p></body></html>`;
  }
  GC.relatorioWordHtml = word;
  GC.relatorioWord = (doc, nome) => GC.baixarArquivo(word(doc), nome, 'application/msword');

  // ---- Excel ----
  const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  let sheetjs = null;
  const carregarSheetJs = () => sheetjs || (sheetjs = new Promise((ok, erro) => {
    if (window.XLSX) { ok(); return; }
    const s = document.createElement('script');
    s.src = SHEETJS;
    s.onload = ok;
    s.onerror = () => { sheetjs = null; erro(new Error('SheetJS não carregou')); };
    document.head.appendChild(s);
  }));

  async function excel(doc) {
    await carregarSheetJs();
    const X = window.XLSX;
    const wb = X.utils.book_new();
    const usados = new Set();
    const nomeAba = (t) => { let n = String(t).replace(/[\[\]:*?/\\]/g, '').slice(0, 31); while (usados.has(n)) n = `${n.slice(0, 29)} ${usados.size}`; usados.add(n); return n; };
    const aba = (linhas, titulo) => {
      const ws = X.utils.aoa_to_sheet(linhas);
      ws['!cols'] = (linhas[0] || []).map((c, j) => ({ wch: Math.min(48, Math.max(10, ...linhas.map((l) => String(l[j] == null ? '' : l[j]).length))) }));
      X.utils.book_append_sheet(wb, ws, nomeAba(titulo));
    };
    doc.secoes.filter((s) => s.tipo === 'tabela').forEach((s) => aba([s.colunas, ...s.linhas], s.titulo));
    const textos = doc.secoes.filter((s) => s.tipo === 'texto').flatMap((s) => [[], [s.titulo], [s.texto]]);
    aba([[GC.marcaDoDocumento().nomePrefeitura], [doc.titulo], [GC.subtituloDocumento(doc)], [], ...doc.topicos.map((t) => [t]), ...textos, [], ['Fontes', doc.fontes.join(', ')], ['Observação', 'Dados simulados para demonstração.']], 'Leia-me');
    return X.write(wb, { bookType: 'xlsx', type: 'array' });
  }
  // Sem a biblioteca (sem internet), a planilha sai em CSV, que o Excel também abre.
  GC.relatorioExcel = async function (doc, nome) {
    try {
      return GC.baixarArquivo(await excel(doc), nome, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      return GC.baixarArquivo(GC.relatorioCsv(doc), nome.replace(/\.xlsx$/, '.csv'), 'text/csv;charset=utf-8');
    }
  };
})(window.GC = window.GC || {});
